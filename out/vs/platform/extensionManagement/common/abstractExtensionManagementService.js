var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { distinct, isNonEmptyArray } from "../../../base/common/arrays.js";
import { Barrier, createCancelablePromise } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { isWeb } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import * as nls from "../../../nls.js";
import {
  ExtensionManagementError,
  IExtensionGalleryService,
  InstallOperation,
  StatisticType,
  isTargetPlatformCompatible,
  TargetPlatformToString,
  ExtensionManagementErrorCode,
  EXTENSION_INSTALL_DEP_PACK_CONTEXT,
  ExtensionGalleryError,
  ExtensionGalleryErrorCode,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionSignatureVerificationCode,
  IAllowedExtensionsService
} from "./extensionManagement.js";
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, isMalicious } from "./extensionManagementUtil.js";
import { ExtensionType, isApplicationScopedExtension } from "../../extensions/common/extensions.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
let CommontExtensionManagementService = class extends Disposable {
  constructor(productService, allowedExtensionsService) {
    super();
    this.productService = productService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.preferPreReleases = this.productService.quality !== "stable";
  }
  async canInstall(extension) {
    const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName });
    if (allowedToInstall !== true) {
      return new MarkdownString(nls.localize("not allowed to install", "This extension cannot be installed because {0}", allowedToInstall.value));
    }
    if (!await this.isExtensionPlatformCompatible(extension)) {
      const learnLink = isWeb ? "https://aka.ms/vscode-web-extensions-guide" : "https://aka.ms/vscode-platform-specific-extensions";
      return new MarkdownString(`${nls.localize(
        "incompatible platform",
        "The '{0}' extension is not available in {1} for the {2} platform.",
        extension.displayName ?? extension.identifier.id,
        this.productService.nameLong,
        TargetPlatformToString(await this.getTargetPlatform())
      )} [${nls.localize("learn why", "Learn Why")}](${learnLink})`);
    }
    return true;
  }
  async isExtensionPlatformCompatible(extension) {
    const currentTargetPlatform = await this.getTargetPlatform();
    return extension.allTargetPlatforms.some((targetPlatform) => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
  }
};
CommontExtensionManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IAllowedExtensionsService)
], CommontExtensionManagementService);
let AbstractExtensionManagementService = class extends CommontExtensionManagementService {
  constructor(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService) {
    super(productService, allowedExtensionsService);
    this.galleryService = galleryService;
    this.telemetryService = telemetryService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.userDataProfilesService = userDataProfilesService;
    this.lastReportTimestamp = 0;
    this.installingExtensions = /* @__PURE__ */ new Map();
    this.uninstallingExtensions = /* @__PURE__ */ new Map();
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidUpdateExtensionMetadata = this._register(new Emitter());
    this.participants = [];
    this._register(toDisposable(() => {
      this.installingExtensions.forEach(({ task }) => task.cancel());
      this.uninstallingExtensions.forEach((promise) => promise.cancel());
      this.installingExtensions.clear();
      this.uninstallingExtensions.clear();
    }));
  }
  get onInstallExtension() {
    return this._onInstallExtension.event;
  }
  get onDidInstallExtensions() {
    return this._onDidInstallExtensions.event;
  }
  get onUninstallExtension() {
    return this._onUninstallExtension.event;
  }
  get onDidUninstallExtension() {
    return this._onDidUninstallExtension.event;
  }
  get onDidUpdateExtensionMetadata() {
    return this._onDidUpdateExtensionMetadata.event;
  }
  async installFromGallery(extension, options = {}) {
    try {
      const results = await this.installGalleryExtensions([{ extension, options }]);
      const result = results.find(({ identifier }) => areSameExtensions(identifier, extension.identifier));
      if (result?.local) {
        return result.local;
      }
      if (result?.error) {
        throw result.error;
      }
      const redirectedResult = results[0];
      if (redirectedResult?.local) {
        return redirectedResult.local;
      }
      if (redirectedResult?.error) {
        throw redirectedResult.error;
      }
      throw new ExtensionManagementError(`Unknown error while installing extension ${extension.identifier.id}`, ExtensionManagementErrorCode.Unknown);
    } catch (error) {
      throw toExtensionManagementError(error);
    }
  }
  async installGalleryExtensions(extensions) {
    if (!this.galleryService.isEnabled()) {
      throw new ExtensionManagementError(nls.localize("MarketPlaceDisabled", "Marketplace is not enabled"), ExtensionManagementErrorCode.NotAllowed);
    }
    const results = [];
    const installableExtensions = [];
    await Promise.allSettled(extensions.map(async ({ extension, options }) => {
      try {
        const compatible = await this.checkAndGetCompatibleVersion(extension, !!options?.installGivenVersion, !!options?.installPreReleaseVersion, options.productVersion ?? { version: this.productService.version, date: this.productService.date });
        installableExtensions.push({ ...compatible, options });
      } catch (error) {
        results.push({ identifier: extension.identifier, operation: InstallOperation.Install, source: extension, error, profileLocation: options.profileLocation ?? this.getCurrentExtensionsManifestLocation() });
      }
    }));
    if (installableExtensions.length) {
      results.push(...await this.installExtensions(installableExtensions));
    }
    return results;
  }
  async uninstall(extension, options) {
    this.logService.trace("ExtensionManagementService#uninstall", extension.identifier.id);
    return this.uninstallExtensions([{ extension, options }]);
  }
  async toggleApplicationScope(extension, fromProfileLocation) {
    if (isApplicationScopedExtension(extension.manifest) || extension.isBuiltin) {
      return extension;
    }
    if (extension.isApplicationScoped) {
      let local = await this.updateMetadata(extension, { isApplicationScoped: false }, this.userDataProfilesService.defaultProfile.extensionsResource);
      if (!this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
        local = await this.copyExtension(extension, this.userDataProfilesService.defaultProfile.extensionsResource, fromProfileLocation);
      }
      for (const profile of this.userDataProfilesService.profiles) {
        const existing = (await this.getInstalled(ExtensionType.User, profile.extensionsResource)).find((e) => areSameExtensions(e.identifier, extension.identifier));
        if (existing) {
          this._onDidUpdateExtensionMetadata.fire({ local: existing, profileLocation: profile.extensionsResource });
        } else {
          this._onDidUninstallExtension.fire({ identifier: extension.identifier, profileLocation: profile.extensionsResource });
        }
      }
      return local;
    } else {
      const local = this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? await this.updateMetadata(extension, { isApplicationScoped: true }, this.userDataProfilesService.defaultProfile.extensionsResource) : await this.copyExtension(extension, fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource, { isApplicationScoped: true });
      this._onDidInstallExtensions.fire([{ identifier: local.identifier, operation: InstallOperation.Install, local, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource, applicationScoped: true }]);
      return local;
    }
  }
  getExtensionsControlManifest() {
    const now = (/* @__PURE__ */ new Date()).getTime();
    if (!this.extensionsControlManifest || now - this.lastReportTimestamp > 1e3 * 60 * 5) {
      this.extensionsControlManifest = this.updateControlCache();
      this.lastReportTimestamp = now;
    }
    return this.extensionsControlManifest;
  }
  registerParticipant(participant) {
    this.participants.push(participant);
  }
  async resetPinnedStateForAllUserExtensions(pinned) {
    try {
      await this.joinAllSettled(this.userDataProfilesService.profiles.map(
        async (profile) => {
          const extensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
          await this.joinAllSettled(extensions.map(
            async (extension) => {
              if (extension.pinned !== pinned) {
                await this.updateMetadata(extension, { pinned }, profile.extensionsResource);
              }
            }
          ));
        }
      ));
    } catch (error) {
      this.logService.error("Error while resetting pinned state for all user extensions", getErrorMessage(error));
      throw error;
    }
  }
  async installExtensions(extensions) {
    const installExtensionResultsMap = /* @__PURE__ */ new Map();
    const installingExtensionsMap = /* @__PURE__ */ new Map();
    const alreadyRequestedInstallations = [];
    const getInstallExtensionTaskKey = (extension, profileLocation) => `${ExtensionKey.create(extension).toString()}-${profileLocation.toString()}`;
    const createInstallExtensionTask = (manifest, extension, options, root) => {
      let uninstallTaskToWaitFor;
      if (!URI.isUri(extension)) {
        if (installingExtensionsMap.has(`${extension.identifier.id.toLowerCase()}-${options.profileLocation.toString()}`)) {
          return;
        }
        const existingInstallingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension, options.profileLocation));
        if (existingInstallingExtension) {
          if (root && this.canWaitForTask(root, existingInstallingExtension.task)) {
            const identifier = existingInstallingExtension.task.identifier;
            this.logService.info("Waiting for already requested installing extension", identifier.id, root.identifier.id, options.profileLocation.toString());
            existingInstallingExtension.waitingTasks.push(root);
            const waitForInstallation = Event.toPromise(
              Event.filter(this.onDidInstallExtensions, (results2) => results2.some((result) => areSameExtensions(result.identifier, identifier)))
            ).then((results2) => {
              this.logService.info("Finished waiting for already requested installing extension", identifier.id, root.identifier.id, options.profileLocation.toString());
              const result = results2.find((result2) => areSameExtensions(result2.identifier, identifier));
              if (!result?.local) {
                throw new Error(`Extension ${identifier.id} is not installed`);
              }
              return result.local;
            });
            alreadyRequestedInstallations.push(waitForInstallation);
            waitForInstallation.catch(() => {
            });
          }
          return;
        }
        uninstallTaskToWaitFor = this.uninstallingExtensions.get(this.getUninstallExtensionTaskKey(extension.identifier, options.profileLocation));
      }
      const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
      const key = `${getGalleryExtensionId(manifest.publisher, manifest.name)}-${options.profileLocation.toString()}`;
      installingExtensionsMap.set(key, { task: installExtensionTask, root, uninstallTaskToWaitFor });
      this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: options.profileLocation });
      this.logService.info("Installing extension:", installExtensionTask.identifier.id, options);
      if (!URI.isUri(extension)) {
        this.installingExtensions.set(getInstallExtensionTaskKey(extension, options.profileLocation), { task: installExtensionTask, waitingTasks: [] });
      }
    };
    try {
      const systemExtensions = await this.getInstalled(ExtensionType.System);
      for (const { manifest, extension, options } of extensions) {
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        const isSystemExtension = systemExtensions.some((e) => areSameExtensions(e.identifier, { id: extensionId }));
        const isBuiltin = options.isBuiltin || isSystemExtension;
        const isApplicationScoped = options.isApplicationScoped || isBuiltin || isApplicationScopedExtension(manifest);
        const installExtensionTaskOptions = {
          ...options,
          isBuiltin,
          isApplicationScoped,
          profileLocation: isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation(),
          productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date }
        };
        const existingInstallExtensionTask = !URI.isUri(extension) ? this.installingExtensions.get(getInstallExtensionTaskKey(extension, installExtensionTaskOptions.profileLocation)) : void 0;
        if (existingInstallExtensionTask) {
          const existingTask = existingInstallExtensionTask.task;
          this.logService.info("Extension is already requested to install", existingTask.identifier.id, installExtensionTaskOptions.profileLocation.toString());
          const resultKey = `${existingTask.identifier.id.toLowerCase()}-${installExtensionTaskOptions.profileLocation.toString()}`;
          const waitForInstallation = existingTask.waitUntilTaskIsFinished().then((local) => {
            installExtensionResultsMap.set(resultKey, {
              local,
              identifier: existingTask.identifier,
              operation: existingTask.operation,
              source: existingTask.source,
              context: installExtensionTaskOptions.context,
              profileLocation: installExtensionTaskOptions.profileLocation,
              applicationScoped: local.isApplicationScoped
            });
            return local;
          }, (error) => {
            installExtensionResultsMap.set(resultKey, {
              error: toExtensionManagementError(error),
              identifier: existingTask.identifier,
              operation: existingTask.operation,
              source: existingTask.source,
              context: installExtensionTaskOptions.context,
              profileLocation: installExtensionTaskOptions.profileLocation
            });
            throw error;
          });
          alreadyRequestedInstallations.push(waitForInstallation);
          waitForInstallation.catch(() => {
          });
        } else {
          createInstallExtensionTask(manifest, extension, installExtensionTaskOptions, void 0);
        }
      }
      await Promise.all([...installingExtensionsMap.values()].map(async ({ task }) => {
        if (task.options.donotIncludePackAndDependencies) {
          this.logService.info("Installing the extension without checking dependencies and pack", task.identifier.id);
        } else {
          try {
            let preferPreRelease = this.preferPreReleases;
            if (task.options.installPreReleaseVersion) {
              preferPreRelease = true;
            } else if (!URI.isUri(task.source) && task.source.hasPreReleaseVersion) {
              preferPreRelease = false;
            }
            const installed = await this.getInstalled(void 0, task.options.profileLocation, task.options.productVersion);
            const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(task.identifier, task.manifest, preferPreRelease, task.options.productVersion, installed);
            const options = { ...task.options, pinned: false, installGivenVersion: false, context: { ...task.options.context, [EXTENSION_INSTALL_DEP_PACK_CONTEXT]: true } };
            for (const { gallery, manifest } of distinct(allDepsAndPackExtensionsToInstall, ({ gallery: gallery2 }) => gallery2.identifier.id)) {
              const existing = installed.find((e) => areSameExtensions(e.identifier, gallery.identifier));
              if (existing && existing.isApplicationScoped === !!options.isApplicationScoped) {
                continue;
              }
              createInstallExtensionTask(manifest, gallery, options, task);
            }
          } catch (error) {
            if (URI.isUri(task.source)) {
              if (isNonEmptyArray(task.manifest.extensionDependencies)) {
                this.logService.warn(`Cannot install dependencies of extension:`, task.identifier.id, error.message);
              }
              if (isNonEmptyArray(task.manifest.extensionPack)) {
                this.logService.warn(`Cannot install packed extensions of extension:`, task.identifier.id, error.message);
              }
            } else {
              this.logService.error("Error while preparing to install dependencies and extension packs of the extension:", task.identifier.id);
              throw error;
            }
          }
        }
      }));
      const otherProfilesToUpdate = await this.getOtherProfilesToUpdateExtension([...installingExtensionsMap.values()].map(({ task }) => task));
      for (const [profileLocation, task] of otherProfilesToUpdate) {
        createInstallExtensionTask(task.manifest, task.source, { ...task.options, profileLocation }, void 0);
      }
      await this.joinAllSettled([...installingExtensionsMap.entries()].map(async ([key, { task, uninstallTaskToWaitFor }]) => {
        const startTime = (/* @__PURE__ */ new Date()).getTime();
        let local;
        try {
          if (uninstallTaskToWaitFor) {
            this.logService.info("Waiting for existing uninstall task to complete before installing", task.identifier.id);
            try {
              await uninstallTaskToWaitFor.waitUntilTaskIsFinished();
              this.logService.info("Finished waiting for uninstall task, proceeding with install", task.identifier.id);
            } catch (error) {
              this.logService.info("Uninstall task failed, proceeding with install anyway", task.identifier.id, getErrorMessage(error));
            }
          }
          local = await task.run();
          await this.joinAllSettled(this.participants.map((participant) => participant.postInstall(local, task.source, task.options, CancellationToken.None)), ExtensionManagementErrorCode.PostInstall);
        } catch (e) {
          const error = toExtensionManagementError(e);
          if (!URI.isUri(task.source)) {
            reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? "extensionGallery:update" : "extensionGallery:install", {
              extensionData: getGalleryExtensionTelemetryData(task.source),
              error,
              source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
            });
          }
          installExtensionResultsMap.set(key, { error, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: task.options.isApplicationScoped });
          this.logService.error("Error while installing the extension", task.identifier.id, getErrorMessage(error), task.options.profileLocation.toString());
          throw error;
        }
        if (!URI.isUri(task.source)) {
          const isUpdate = task.operation === InstallOperation.Update;
          const durationSinceUpdate = isUpdate ? void 0 : ((/* @__PURE__ */ new Date()).getTime() - task.source.lastUpdated) / 1e3;
          reportTelemetry(this.telemetryService, isUpdate ? "extensionGallery:update" : "extensionGallery:install", {
            extensionData: getGalleryExtensionTelemetryData(task.source),
            verificationStatus: task.verificationStatus,
            duration: (/* @__PURE__ */ new Date()).getTime() - startTime,
            durationSinceUpdate,
            source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
          });
        }
        installExtensionResultsMap.set(key, { local, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: local.isApplicationScoped });
      }));
      if (alreadyRequestedInstallations.length) {
        await this.joinAllSettled(alreadyRequestedInstallations);
      }
    } catch (error) {
      const getAllDepsAndPacks = (extension, profileLocation, allDepsOrPacks) => {
        const depsOrPacks = [];
        if (extension.manifest.extensionDependencies?.length) {
          depsOrPacks.push(...extension.manifest.extensionDependencies);
        }
        if (extension.manifest.extensionPack?.length) {
          depsOrPacks.push(...extension.manifest.extensionPack);
        }
        for (const id of depsOrPacks) {
          if (allDepsOrPacks.includes(id.toLowerCase())) {
            continue;
          }
          allDepsOrPacks.push(id.toLowerCase());
          const installed = installExtensionResultsMap.get(`${id.toLowerCase()}-${profileLocation.toString()}`);
          if (installed?.local) {
            allDepsOrPacks = getAllDepsAndPacks(installed.local, profileLocation, allDepsOrPacks);
          }
        }
        return allDepsOrPacks;
      };
      const getErrorResult = (task) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, error });
      const rollbackTasks = [];
      for (const [key, { task, root }] of installingExtensionsMap) {
        const result = installExtensionResultsMap.get(key);
        if (!result) {
          task.cancel();
          installExtensionResultsMap.set(key, getErrorResult(task));
        } else if (result.local && root && !installExtensionResultsMap.get(`${root.identifier.id.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local) {
          rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
          installExtensionResultsMap.set(key, getErrorResult(task));
        }
      }
      for (const [key, { task }] of installingExtensionsMap) {
        const result = installExtensionResultsMap.get(key);
        if (!result?.local) {
          continue;
        }
        if (task.options.donotIncludePackAndDependencies) {
          continue;
        }
        const depsOrPacks = getAllDepsAndPacks(result.local, task.options.profileLocation, [result.local.identifier.id.toLowerCase()]).slice(1);
        if (depsOrPacks.some((depOrPack) => installingExtensionsMap.has(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`) && !installExtensionResultsMap.get(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local)) {
          rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
          installExtensionResultsMap.set(key, getErrorResult(task));
        }
      }
      if (rollbackTasks.length) {
        await Promise.allSettled(rollbackTasks.map(async (rollbackTask) => {
          try {
            await rollbackTask.run();
            this.logService.info("Rollback: Uninstalled extension", rollbackTask.extension.identifier.id);
          } catch (error2) {
            this.logService.warn("Rollback: Error while uninstalling extension", rollbackTask.extension.identifier.id, getErrorMessage(error2));
          }
        }));
      }
    } finally {
      for (const { task } of installingExtensionsMap.values()) {
        if (task.source && !URI.isUri(task.source)) {
          this.installingExtensions.delete(getInstallExtensionTaskKey(task.source, task.options.profileLocation));
        }
      }
    }
    const results = [...installExtensionResultsMap.values()];
    for (const result of results) {
      if (result.local) {
        this.logService.info(`Extension installed successfully:`, result.identifier.id, result.profileLocation.toString());
      }
    }
    this._onDidInstallExtensions.fire(results);
    return results;
  }
  async getOtherProfilesToUpdateExtension(tasks) {
    const otherProfilesToUpdate = [];
    const profileExtensionsCache = new ResourceMap();
    for (const task of tasks) {
      if (task.operation !== InstallOperation.Update || task.options.isApplicationScoped || task.options.pinned || task.options.installGivenVersion || URI.isUri(task.source)) {
        continue;
      }
      for (const profile of this.userDataProfilesService.profiles) {
        if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, task.options.profileLocation)) {
          continue;
        }
        let installedExtensions = profileExtensionsCache.get(profile.extensionsResource);
        if (!installedExtensions) {
          installedExtensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
          profileExtensionsCache.set(profile.extensionsResource, installedExtensions);
        }
        const installedExtension = installedExtensions.find((e) => areSameExtensions(e.identifier, task.identifier));
        if (installedExtension && !installedExtension.pinned) {
          otherProfilesToUpdate.push([profile.extensionsResource, task]);
        }
      }
    }
    return otherProfilesToUpdate;
  }
  canWaitForTask(taskToWait, taskToWaitFor) {
    for (const [, { task, waitingTasks }] of this.installingExtensions.entries()) {
      if (task === taskToWait) {
        if (waitingTasks.includes(taskToWaitFor)) {
          return false;
        }
        if (waitingTasks.some((waitingTask) => this.canWaitForTask(waitingTask, taskToWaitFor))) {
          return false;
        }
      }
      if (task === taskToWaitFor && waitingTasks[0] && !this.canWaitForTask(taskToWait, waitingTasks[0])) {
        return false;
      }
    }
    return true;
  }
  async joinAllSettled(promises, errorCode) {
    const results = [];
    const errors = [];
    const promiseResults = await Promise.allSettled(promises);
    for (const r of promiseResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        errors.push(toExtensionManagementError(r.reason, errorCode));
      }
    }
    if (!errors.length) {
      return results;
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    let error = new ExtensionManagementError("", ExtensionManagementErrorCode.Unknown);
    for (const current of errors) {
      error = new ExtensionManagementError(
        error.message ? `${error.message}, ${current.message}` : current.message,
        current.code !== ExtensionManagementErrorCode.Unknown && current.code !== ExtensionManagementErrorCode.Internal ? current.code : error.code
      );
    }
    throw error;
  }
  async getAllDepsAndPackExtensions(extensionIdentifier, manifest, preferPreRelease, productVersion, installed) {
    if (!this.galleryService.isEnabled()) {
      return [];
    }
    const knownIdentifiers = [];
    const allDependenciesAndPacks = [];
    const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier2, manifest2) => {
      knownIdentifiers.push(extensionIdentifier2);
      const dependecies = manifest2.extensionDependencies ? manifest2.extensionDependencies.filter((dep) => !installed.some((e) => areSameExtensions(e.identifier, { id: dep }))) : [];
      const dependenciesAndPackExtensions = [...dependecies];
      if (manifest2.extensionPack) {
        const existing = installed.find((e) => areSameExtensions(e.identifier, extensionIdentifier2));
        for (const extension of manifest2.extensionPack) {
          if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some((old) => areSameExtensions({ id: old }, { id: extension })))) {
            if (dependenciesAndPackExtensions.every((e) => !areSameExtensions({ id: e }, { id: extension }))) {
              dependenciesAndPackExtensions.push(extension);
            }
          }
        }
      }
      if (dependenciesAndPackExtensions.length) {
        const ids = dependenciesAndPackExtensions.filter((id) => knownIdentifiers.every((galleryIdentifier) => !areSameExtensions(galleryIdentifier, { id })));
        if (ids.length) {
          const galleryExtensions = await this.galleryService.getExtensions(ids.map((id) => ({ id, preRelease: preferPreRelease })), CancellationToken.None);
          for (const galleryExtension of galleryExtensions) {
            if (knownIdentifiers.find((identifier) => areSameExtensions(identifier, galleryExtension.identifier))) {
              continue;
            }
            const isDependency = dependecies.some((id) => areSameExtensions({ id }, galleryExtension.identifier));
            let compatible;
            try {
              compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, preferPreRelease, productVersion);
            } catch (error) {
              if (!isDependency) {
                this.logService.info("Skipping the packed extension as it cannot be installed", galleryExtension.identifier.id, getErrorMessage(error));
                continue;
              } else {
                throw error;
              }
            }
            allDependenciesAndPacks.push({ gallery: compatible.extension, manifest: compatible.manifest });
            await collectDependenciesAndPackExtensionsToInstall(compatible.extension.identifier, compatible.manifest);
          }
        }
      }
    };
    await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
    return allDependenciesAndPacks;
  }
  async checkAndGetCompatibleVersion(extension, sameVersion, installPreRelease, productVersion) {
    let compatibleExtension;
    const extensionsControlManifest = await this.getExtensionsControlManifest();
    if (isMalicious(extension.identifier, extensionsControlManifest.malicious)) {
      throw new ExtensionManagementError(nls.localize("malicious extension", "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), ExtensionManagementErrorCode.Malicious);
    }
    const deprecationInfo = extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()];
    if (deprecationInfo?.extension?.autoMigrate) {
      this.logService.info(`The '${extension.identifier.id}' extension is deprecated, fetching the compatible '${deprecationInfo.extension.id}' extension instead.`);
      compatibleExtension = (await this.galleryService.getExtensions([{ id: deprecationInfo.extension.id, preRelease: deprecationInfo.extension.preRelease }], { targetPlatform: await this.getTargetPlatform(), compatible: true, productVersion }, CancellationToken.None))[0];
      if (!compatibleExtension) {
        throw new ExtensionManagementError(nls.localize("notFoundDeprecatedReplacementExtension", "Can't install '{0}' extension since it was deprecated and the replacement extension '{1}' can't be found.", extension.identifier.id, deprecationInfo.extension.id), ExtensionManagementErrorCode.Deprecated);
      }
    } else {
      if (await this.canInstall(extension) !== true) {
        const targetPlatform = await this.getTargetPlatform();
        throw new ExtensionManagementError(nls.localize("incompatible platform", "The '{0}' extension is not available in {1} for the {2} platform.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), ExtensionManagementErrorCode.IncompatibleTargetPlatform);
      }
      compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease, productVersion);
      if (!compatibleExtension) {
        if (!installPreRelease && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
          throw new ExtensionManagementError(nls.localize("notFoundReleaseExtension", "Can't install release version of '{0}' extension because it has no release version.", extension.displayName ?? extension.identifier.id), ExtensionManagementErrorCode.ReleaseVersionNotFound);
        }
        throw new ExtensionManagementError(nls.localize("notFoundCompatibleDependency", "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), ExtensionManagementErrorCode.Incompatible);
      }
    }
    this.logService.info("Getting Manifest...", compatibleExtension.identifier.id);
    const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
    if (manifest === null) {
      throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, ExtensionManagementErrorCode.Invalid);
    }
    if (manifest.version !== compatibleExtension.version) {
      throw new ExtensionManagementError(`Cannot install '${compatibleExtension.identifier.id}' extension because of version mismatch in Marketplace`, ExtensionManagementErrorCode.Invalid);
    }
    return { extension: compatibleExtension, manifest };
  }
  async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
    const targetPlatform = await this.getTargetPlatform();
    let compatibleExtension = null;
    if (!sameVersion && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
      compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
    }
    if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion)) {
      compatibleExtension = extension;
    }
    if (!compatibleExtension) {
      if (sameVersion) {
        compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, version: extension.version }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
      } else {
        compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion);
      }
    }
    return compatibleExtension;
  }
  getUninstallExtensionTaskKey(identifier, profileLocation, version) {
    return `${identifier.id.toLowerCase()}${version ? `-${version}` : ""}@${profileLocation.toString()}`;
  }
  async uninstallExtensions(extensions) {
    const getUninstallExtensionTaskKey = (extension, uninstallOptions) => this.getUninstallExtensionTaskKey(extension.identifier, uninstallOptions.profileLocation, uninstallOptions.versionOnly ? extension.manifest.version : void 0);
    const createUninstallExtensionTask = (extension, uninstallOptions) => {
      let installTaskToWaitFor;
      for (const { task: task2 } of this.installingExtensions.values()) {
        if (!(task2.source instanceof URI) && areSameExtensions(task2.identifier, extension.identifier) && this.uriIdentityService.extUri.isEqual(task2.options.profileLocation, uninstallOptions.profileLocation)) {
          installTaskToWaitFor = task2;
          break;
        }
      }
      const task = this.createUninstallExtensionTask(extension, uninstallOptions);
      this.uninstallingExtensions.set(getUninstallExtensionTaskKey(task.extension, uninstallOptions), task);
      this.logService.info("Uninstalling extension from the profile:", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
      this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
      allTasks.push({ task, installTaskToWaitFor });
    };
    const postUninstallExtension = (extension, uninstallOptions, error) => {
      if (error) {
        this.logService.error("Failed to uninstall extension from the profile:", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString(), error.message);
      } else {
        this.logService.info("Successfully uninstalled extension from the profile", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
      }
      reportTelemetry(this.telemetryService, "extensionGallery:uninstall", { extensionData: getLocalExtensionTelemetryData(extension), error });
      this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
    };
    const allTasks = [];
    const processedTasks = [];
    const alreadyRequestedUninstalls = [];
    const extensionsToRemove = [];
    const installedExtensionsMap = new ResourceMap();
    const getInstalledExtensions = async (profileLocation) => {
      let installed = installedExtensionsMap.get(profileLocation);
      if (!installed) {
        installedExtensionsMap.set(profileLocation, installed = await this.getInstalled(ExtensionType.User, profileLocation));
      }
      return installed;
    };
    for (const { extension, options } of extensions) {
      const uninstallOptions = {
        ...options,
        profileLocation: extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options?.profileLocation ?? this.getCurrentExtensionsManifestLocation()
      };
      const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension, uninstallOptions));
      if (uninstallExtensionTask) {
        this.logService.info("Extensions is already requested to uninstall", extension.identifier.id);
        alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
      } else {
        createUninstallExtensionTask(extension, uninstallOptions);
      }
      if (uninstallOptions.remove || extension.isApplicationScoped) {
        if (uninstallOptions.remove) {
          extensionsToRemove.push(extension);
        }
        for (const profile of this.userDataProfilesService.profiles) {
          if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, uninstallOptions.profileLocation)) {
            continue;
          }
          const installed = await getInstalledExtensions(profile.extensionsResource);
          const profileExtension = installed.find((e) => areSameExtensions(e.identifier, extension.identifier));
          if (profileExtension) {
            const uninstallOptionsWithProfile = { ...uninstallOptions, profileLocation: profile.extensionsResource };
            const uninstallExtensionTask2 = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(profileExtension, uninstallOptionsWithProfile));
            if (uninstallExtensionTask2) {
              this.logService.info("Extensions is already requested to uninstall", profileExtension.identifier.id);
              alreadyRequestedUninstalls.push(uninstallExtensionTask2.waitUntilTaskIsFinished());
            } else {
              createUninstallExtensionTask(profileExtension, uninstallOptionsWithProfile);
            }
          }
        }
      }
    }
    try {
      for (const { task } of allTasks.slice(0)) {
        const installed = await getInstalledExtensions(task.options.profileLocation);
        if (task.options.donotIncludePack) {
          this.logService.info("Uninstalling the extension without including packed extension", `${task.extension.identifier.id}@${task.extension.manifest.version}`);
        } else {
          const packedExtensions = this.getAllPackExtensionsToUninstall(task.extension, installed);
          for (const packedExtension of packedExtensions) {
            if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension, task.options))) {
              this.logService.info("Extensions is already requested to uninstall", packedExtension.identifier.id);
            } else {
              createUninstallExtensionTask(packedExtension, task.options);
            }
          }
        }
        if (task.options.donotCheckDependents) {
          this.logService.info("Uninstalling the extension without checking dependents", `${task.extension.identifier.id}@${task.extension.manifest.version}`);
        } else {
          this.checkForDependents(allTasks.map(({ task: task2 }) => task2.extension), installed, task.extension);
        }
      }
      await this.joinAllSettled(allTasks.map(async ({ task, installTaskToWaitFor }) => {
        try {
          if (installTaskToWaitFor) {
            this.logService.info("Waiting for existing install task to complete before uninstalling", task.extension.identifier.id);
            try {
              await installTaskToWaitFor.waitUntilTaskIsFinished();
              this.logService.info("Finished waiting for install task, proceeding with uninstall", task.extension.identifier.id);
            } catch (error) {
              this.logService.info("Install task failed, proceeding with uninstall anyway", task.extension.identifier.id, getErrorMessage(error));
            }
          }
          await task.run();
          await this.joinAllSettled(this.participants.map((participant) => participant.postUninstall(task.extension, task.options, CancellationToken.None)));
          if (task.extension.identifier.uuid && !isWeb) {
            try {
              await this.galleryService.reportStatistic(task.extension.manifest.publisher, task.extension.manifest.name, task.extension.manifest.version, StatisticType.Uninstall);
            } catch (error) {
            }
          }
        } catch (e) {
          const error = toExtensionManagementError(e);
          postUninstallExtension(task.extension, task.options, error);
          throw error;
        } finally {
          processedTasks.push(task);
        }
      }));
      if (alreadyRequestedUninstalls.length) {
        await this.joinAllSettled(alreadyRequestedUninstalls);
      }
      for (const { task } of allTasks) {
        postUninstallExtension(task.extension, task.options);
      }
      if (extensionsToRemove.length) {
        await this.joinAllSettled(extensionsToRemove.map((extension) => this.deleteExtension(extension)));
      }
    } catch (e) {
      const error = toExtensionManagementError(e);
      for (const { task } of allTasks) {
        try {
          task.cancel();
        } catch (error2) {
        }
        if (!processedTasks.includes(task)) {
          postUninstallExtension(task.extension, task.options, error);
        }
      }
      throw error;
    } finally {
      for (const { task } of allTasks) {
        if (!this.uninstallingExtensions.delete(getUninstallExtensionTaskKey(task.extension, task.options))) {
          this.logService.warn("Uninstallation task is not found in the cache", task.extension.identifier.id);
        }
      }
    }
  }
  checkForDependents(extensionsToUninstall, installed, extensionToUninstall) {
    for (const extension of extensionsToUninstall) {
      const dependents = this.getDependents(extension, installed);
      if (dependents.length) {
        const remainingDependents = dependents.filter((dependent) => !extensionsToUninstall.some((e) => areSameExtensions(e.identifier, dependent.identifier)));
        if (remainingDependents.length) {
          throw new Error(this.getDependentsErrorMessage(extension, remainingDependents, extensionToUninstall));
        }
      }
    }
  }
  getDependentsErrorMessage(dependingExtension, dependents, extensionToUninstall) {
    if (extensionToUninstall === dependingExtension) {
      if (dependents.length === 1) {
        return nls.localize(
          "singleDependentError",
          "Cannot uninstall '{0}' extension. '{1}' extension depends on this.",
          extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
          dependents[0].manifest.displayName || dependents[0].manifest.name
        );
      }
      if (dependents.length === 2) {
        return nls.localize(
          "twoDependentsError",
          "Cannot uninstall '{0}' extension. '{1}' and '{2}' extensions depend on this.",
          extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
          dependents[0].manifest.displayName || dependents[0].manifest.name,
          dependents[1].manifest.displayName || dependents[1].manifest.name
        );
      }
      return nls.localize(
        "multipleDependentsError",
        "Cannot uninstall '{0}' extension. '{1}', '{2}' and other extension depend on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    if (dependents.length === 1) {
      return nls.localize(
        "singleIndirectDependentError",
        "Cannot uninstall '{0}' extension . It includes uninstalling '{1}' extension and '{2}' extension depends on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependingExtension.manifest.displayName || dependingExtension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name
      );
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoIndirectDependentsError",
        "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}' and '{3}' extensions depend on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependingExtension.manifest.displayName || dependingExtension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    return nls.localize(
      "multipleIndirectDependentsError",
      "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}', '{3}' and other extensions depend on this.",
      extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
      dependingExtension.manifest.displayName || dependingExtension.manifest.name,
      dependents[0].manifest.displayName || dependents[0].manifest.name,
      dependents[1].manifest.displayName || dependents[1].manifest.name
    );
  }
  getAllPackExtensionsToUninstall(extension, installed, checked = []) {
    if (checked.indexOf(extension) !== -1) {
      return [];
    }
    if (this.productService.defaultChatAgent && areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
      return [];
    }
    checked.push(extension);
    const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
    if (extensionsPack.length) {
      const packedExtensions = installed.filter((i) => !i.isBuiltin && extensionsPack.some((id) => areSameExtensions({ id }, i.identifier)));
      const packOfPackedExtensions = [];
      for (const packedExtension of packedExtensions) {
        packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
      }
      return [...packedExtensions, ...packOfPackedExtensions];
    }
    return [];
  }
  getDependents(extension, installed) {
    return installed.filter((e) => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some((id) => areSameExtensions({ id }, extension.identifier)));
  }
  async updateControlCache() {
    try {
      this.logService.trace("ExtensionManagementService.updateControlCache");
      return await this.galleryService.getExtensionsControlManifest();
    } catch (err) {
      this.logService.trace("ExtensionManagementService.refreshControlCache - failed to get extension control manifest", getErrorMessage(err));
      return { malicious: [], deprecated: {}, search: [] };
    }
  }
};
AbstractExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAllowedExtensionsService),
  __decorateParam(6, IUserDataProfilesService)
], AbstractExtensionManagementService);
function toExtensionManagementError(error, code) {
  if (error instanceof ExtensionManagementError) {
    return error;
  }
  let extensionManagementError;
  if (error instanceof ExtensionGalleryError) {
    extensionManagementError = new ExtensionManagementError(error.message, error.code === ExtensionGalleryErrorCode.DownloadFailedWriting ? ExtensionManagementErrorCode.DownloadFailedWriting : ExtensionManagementErrorCode.Gallery);
  } else {
    extensionManagementError = new ExtensionManagementError(error.message, isCancellationError(error) ? ExtensionManagementErrorCode.Cancelled : code ?? ExtensionManagementErrorCode.Internal);
  }
  extensionManagementError.stack = error.stack;
  return extensionManagementError;
}
function reportTelemetry(telemetryService, eventName, {
  extensionData,
  verificationStatus,
  duration,
  error,
  source,
  durationSinceUpdate
}) {
  telemetryService.publicLog(eventName, {
    ...extensionData,
    source,
    duration,
    durationSinceUpdate,
    success: !error,
    errorcode: error?.code,
    verificationStatus: verificationStatus === ExtensionSignatureVerificationCode.Success ? "Verified" : verificationStatus ?? "Unverified"
  });
}
class AbstractExtensionTask {
  constructor() {
    this.barrier = new Barrier();
  }
  async waitUntilTaskIsFinished() {
    await this.barrier.wait();
    return this.cancellablePromise;
  }
  run() {
    if (!this.cancellablePromise) {
      this.cancellablePromise = createCancelablePromise((token) => this.doRun(token));
    }
    this.barrier.open();
    return this.cancellablePromise;
  }
  cancel() {
    if (!this.cancellablePromise) {
      this.cancellablePromise = createCancelablePromise((token) => {
        return new Promise((c, e) => {
          const disposable = token.onCancellationRequested(() => {
            disposable.dispose();
            e(new CancellationError());
          });
        });
      });
      this.barrier.open();
    }
    this.cancellablePromise.cancel();
  }
}
export {
  AbstractExtensionManagementService,
  AbstractExtensionTask,
  CommontExtensionManagementService,
  toExtensionManagementError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxhYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QsIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCYXJyaWVyLCBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHtcblx0RXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50LCBJR2FsbGVyeUV4dGVuc2lvbiwgSUxvY2FsRXh0ZW5zaW9uLCBJbnN0YWxsT3BlcmF0aW9uLFxuXHRJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCwgU3RhdGlzdGljVHlwZSwgaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUsIFRhcmdldFBsYXRmb3JtVG9TdHJpbmcsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUsXG5cdEluc3RhbGxPcHRpb25zLCBVbmluc3RhbGxPcHRpb25zLCBNZXRhZGF0YSwgSW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCwgSW5zdGFsbEV4dGVuc2lvblJlc3VsdCwgVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEVYVEVOU0lPTl9JTlNUQUxMX0RFUF9QQUNLX0NPTlRFWFQsIEV4dGVuc2lvbkdhbGxlcnlFcnJvcixcblx0SVByb2R1Y3RWZXJzaW9uLCBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLFxuXHRFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVCxcblx0RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEsXG5cdFVuaW5zdGFsbEV4dGVuc2lvbkluZm8sXG5cdEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUsXG5cdElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Vcbn0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBFeHRlbnNpb25LZXksIGdldEdhbGxlcnlFeHRlbnNpb25JZCwgZ2V0R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEsIGdldExvY2FsRXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSwgaXNNYWxpY2lvdXMgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb25NYW5pZmVzdCwgaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbiwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmV4cG9ydCB0eXBlIEluc3RhbGxhYmxlRXh0ZW5zaW9uID0geyByZWFkb25seSBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0OyBleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgVVJJOyBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyB9O1xuXG5leHBvcnQgdHlwZSBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMgPSBJbnN0YWxsT3B0aW9ucyAmIHsgcmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkk7IHJlYWRvbmx5IHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24gfTtcbmV4cG9ydCBpbnRlcmZhY2UgSUluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0cmVhZG9ubHkgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdDtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IHNvdXJjZTogSUdhbGxlcnlFeHRlbnNpb24gfCBVUkk7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbjtcblx0cmVhZG9ubHkgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zO1xuXHRyZWFkb25seSB2ZXJpZmljYXRpb25TdGF0dXM/OiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlO1xuXHRydW4oKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHR3YWl0VW50aWxUYXNrSXNGaW5pc2hlZCgpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGNhbmNlbCgpOiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyA9IFVuaW5zdGFsbE9wdGlvbnMgJiB7IHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJIH07XG5leHBvcnQgaW50ZXJmYWNlIElVbmluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0cmVhZG9ubHkgb3B0aW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnM7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uO1xuXHRydW4oKTogUHJvbWlzZTx2b2lkPjtcblx0d2FpdFVudGlsVGFza0lzRmluaXNoZWQoKTogUHJvbWlzZTx2b2lkPjtcblx0Y2FuY2VsKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb21tb250RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgcHJlZmVyUHJlUmVsZWFzZXM6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucHJlZmVyUHJlUmVsZWFzZXMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnO1xuXHR9XG5cblx0YXN5bmMgY2FuSW5zdGFsbChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTx0cnVlIHwgSU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0Y29uc3QgYWxsb3dlZFRvSW5zdGFsbCA9IHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSB9KTtcblx0XHRpZiAoYWxsb3dlZFRvSW5zdGFsbCAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhubHMubG9jYWxpemUoJ25vdCBhbGxvd2VkIHRvIGluc3RhbGwnLCBcIlRoaXMgZXh0ZW5zaW9uIGNhbm5vdCBiZSBpbnN0YWxsZWQgYmVjYXVzZSB7MH1cIiwgYWxsb3dlZFRvSW5zdGFsbC52YWx1ZSkpO1xuXHRcdH1cblxuXHRcdGlmICghKGF3YWl0IHRoaXMuaXNFeHRlbnNpb25QbGF0Zm9ybUNvbXBhdGlibGUoZXh0ZW5zaW9uKSkpIHtcblx0XHRcdGNvbnN0IGxlYXJuTGluayA9IGlzV2ViID8gJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS13ZWItZXh0ZW5zaW9ucy1ndWlkZScgOiAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXBsYXRmb3JtLXNwZWNpZmljLWV4dGVuc2lvbnMnO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhgJHtubHMubG9jYWxpemUoJ2luY29tcGF0aWJsZSBwbGF0Zm9ybScsIFwiVGhlICd7MH0nIGV4dGVuc2lvbiBpcyBub3QgYXZhaWxhYmxlIGluIHsxfSBmb3IgdGhlIHsyfSBwbGF0Zm9ybS5cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLCBUYXJnZXRQbGF0Zm9ybVRvU3RyaW5nKGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKSkpfSBbJHtubHMubG9jYWxpemUoJ2xlYXJuIHdoeScsIFwiTGVhcm4gV2h5XCIpfV0oJHtsZWFybkxpbmt9KWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGlzRXh0ZW5zaW9uUGxhdGZvcm1Db21wYXRpYmxlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBjdXJyZW50VGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbi5hbGxUYXJnZXRQbGF0Zm9ybXMuc29tZSh0YXJnZXRQbGF0Zm9ybSA9PiBpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZSh0YXJnZXRQbGF0Zm9ybSwgZXh0ZW5zaW9uLmFsbFRhcmdldFBsYXRmb3JtcywgY3VycmVudFRhcmdldFBsYXRmb3JtKSk7XG5cdH1cblxuXHRhYnN0cmFjdCByZWFkb25seSBvbkluc3RhbGxFeHRlbnNpb246IEV2ZW50PEluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdGFic3RyYWN0IHJlYWRvbmx5IG9uRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT47XG5cdGFic3RyYWN0IHJlYWRvbmx5IG9uVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxVbmluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdGFic3RyYWN0IHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdGFic3RyYWN0IHJlYWRvbmx5IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE6IEV2ZW50PERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPjtcblx0YWJzdHJhY3QgaW5zdGFsbEZyb21HYWxsZXJ5KGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0YWJzdHJhY3QgaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnM6IEluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT47XG5cdGFic3RyYWN0IHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCB1bmluc3RhbGxFeHRlbnNpb25zKGV4dGVuc2lvbnM6IFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHRvZ2dsZUFwcGxpY2F0aW9uU2NvcGUoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0YWJzdHJhY3QgZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Pjtcblx0YWJzdHJhY3QgcmVzZXRQaW5uZWRTdGF0ZUZvckFsbFVzZXJFeHRlbnNpb25zKHBpbm5lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHJlZ2lzdGVyUGFydGljaXBhbnQocGFyaXRpY2lwYW50OiBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50KTogdm9pZDtcblx0YWJzdHJhY3QgZ2V0VGFyZ2V0UGxhdGZvcm0oKTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT47XG5cdGFic3RyYWN0IHppcChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8VVJJPjtcblx0YWJzdHJhY3QgZ2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+O1xuXHRhYnN0cmFjdCBpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRhYnN0cmFjdCBpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkksIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRhYnN0cmFjdCBpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+O1xuXHRhYnN0cmFjdCBnZXRJbnN0YWxsZWQodHlwZT86IEV4dGVuc2lvblR5cGUsIHByb2ZpbGVMb2NhdGlvbj86IFVSSSwgcHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPjtcblx0YWJzdHJhY3QgY29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogYm9vbGVhbik6IFByb21pc2U8VVJJPjtcblx0YWJzdHJhY3QgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCB1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsRXh0ZW5zaW9uLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIENvbW1vbnRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0OiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXN0UmVwb3J0VGltZXN0YW1wID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBpbnN0YWxsaW5nRXh0ZW5zaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IHRhc2s6IElJbnN0YWxsRXh0ZW5zaW9uVGFzazsgd2FpdGluZ1Rhc2tzOiBJSW5zdGFsbEV4dGVuc2lvblRhc2tbXSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVuaW5zdGFsbGluZ0V4dGVuc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSVVuaW5zdGFsbEV4dGVuc2lvblRhc2s+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25JbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zdGFsbEV4dGVuc2lvbkV2ZW50PigpKTtcblx0Z2V0IG9uSW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIHRoaXMuX29uSW5zdGFsbEV4dGVuc2lvbi5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKSk7XG5cdGdldCBvbkRpZEluc3RhbGxFeHRlbnNpb25zKCkgeyByZXR1cm4gdGhpcy5fb25EaWRJbnN0YWxsRXh0ZW5zaW9ucy5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25Vbmluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxFeHRlbnNpb25FdmVudD4oKSk7XG5cdGdldCBvblVuaW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIHRoaXMuX29uVW5pbnN0YWxsRXh0ZW5zaW9uLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIF9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50PigpKTtcblx0Z2V0IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gdGhpcy5fb25EaWRVbmluc3RhbGxFeHRlbnNpb24uZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT4oKSk7XG5cdGdldCBvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKCkgeyByZXR1cm4gdGhpcy5fb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YS5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFydGljaXBhbnRzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocHJvZHVjdFNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZm9yRWFjaCgoeyB0YXNrIH0pID0+IHRhc2suY2FuY2VsKCkpO1xuXHRcdFx0dGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmZvckVhY2gocHJvbWlzZSA9PiBwcm9taXNlLmNhbmNlbCgpKTtcblx0XHRcdHRoaXMuaW5zdGFsbGluZ0V4dGVuc2lvbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMudW5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5jbGVhcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxGcm9tR2FsbGVyeShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKFt7IGV4dGVuc2lvbiwgb3B0aW9ucyB9XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXN1bHRzLmZpbmQoKHsgaWRlbnRpZmllciB9KSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0aWYgKHJlc3VsdD8ubG9jYWwpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC5sb2NhbDtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQ/LmVycm9yKSB7XG5cdFx0XHRcdHRocm93IHJlc3VsdC5lcnJvcjtcblx0XHRcdH1cblx0XHRcdC8vIEV4dGVuc2lvbiBtaWdodCBoYXZlIGJlZW4gcmVkaXJlY3RlZCBkdWUgdG8gZGVwcmVjYXRpb24gKGUuZy4sIGdpdGh1Yi5jb3BpbG90IC0+IGdpdGh1Yi5jb3BpbG90LWNoYXQpXG5cdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHRoZSByZXN1bHQgd2lsbCBoYXZlIHRoZSByZWRpcmVjdGVkIGV4dGVuc2lvbidzIGlkZW50aWZpZXJcblx0XHRcdGNvbnN0IHJlZGlyZWN0ZWRSZXN1bHQgPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKHJlZGlyZWN0ZWRSZXN1bHQ/LmxvY2FsKSB7XG5cdFx0XHRcdHJldHVybiByZWRpcmVjdGVkUmVzdWx0LmxvY2FsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlZGlyZWN0ZWRSZXN1bHQ/LmVycm9yKSB7XG5cdFx0XHRcdHRocm93IHJlZGlyZWN0ZWRSZXN1bHQuZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGBVbmtub3duIGVycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YCwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Vbmtub3duKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+IHtcblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdNYXJrZXRQbGFjZURpc2FibGVkJywgXCJNYXJrZXRwbGFjZSBpcyBub3QgZW5hYmxlZFwiKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Ob3RBbGxvd2VkKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzOiBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZUV4dGVuc2lvbnM6IEluc3RhbGxhYmxlRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleHRlbnNpb25zLm1hcChhc3luYyAoeyBleHRlbnNpb24sIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29tcGF0aWJsZSA9IGF3YWl0IHRoaXMuY2hlY2tBbmRHZXRDb21wYXRpYmxlVmVyc2lvbihleHRlbnNpb24sICEhb3B0aW9ucz8uaW5zdGFsbEdpdmVuVmVyc2lvbiwgISFvcHRpb25zPy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24sIG9wdGlvbnMucHJvZHVjdFZlcnNpb24gPz8geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9KTtcblx0XHRcdFx0aW5zdGFsbGFibGVFeHRlbnNpb25zLnB1c2goeyAuLi5jb21wYXRpYmxlLCBvcHRpb25zIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsLCBzb3VyY2U6IGV4dGVuc2lvbiwgZXJyb3IsIHByb2ZpbGVMb2NhdGlvbjogb3B0aW9ucy5wcm9maWxlTG9jYXRpb24gPz8gdGhpcy5nZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoaW5zdGFsbGFibGVFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0cy5wdXNoKC4uLmF3YWl0IHRoaXMuaW5zdGFsbEV4dGVuc2lvbnMoaW5zdGFsbGFibGVFeHRlbnNpb25zKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSN1bmluc3RhbGwnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0cmV0dXJuIHRoaXMudW5pbnN0YWxsRXh0ZW5zaW9ucyhbeyBleHRlbnNpb24sIG9wdGlvbnMgfV0pO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRpZiAoaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbihleHRlbnNpb24ubWFuaWZlc3QpIHx8IGV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkKSB7XG5cdFx0XHRsZXQgbG9jYWwgPSBhd2FpdCB0aGlzLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbiwgeyBpc0FwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSB9LCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZyb21Qcm9maWxlTG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSkge1xuXHRcdFx0XHRsb2NhbCA9IGF3YWl0IHRoaXMuY29weUV4dGVuc2lvbihleHRlbnNpb24sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkpXG5cdFx0XHRcdFx0LmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEuZmlyZSh7IGxvY2FsOiBleGlzdGluZywgcHJvZmlsZUxvY2F0aW9uOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByb2ZpbGVMb2NhdGlvbjogcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbDtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZnJvbVByb2ZpbGVMb2NhdGlvbiwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy51cGRhdGVNZXRhZGF0YShleHRlbnNpb24sIHsgaXNBcHBsaWNhdGlvblNjb3BlZDogdHJ1ZSB9LCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSlcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmNvcHlFeHRlbnNpb24oZXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgeyBpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIH0pO1xuXG5cdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUoW3sgaWRlbnRpZmllcjogbG9jYWwuaWRlbnRpZmllciwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIGxvY2FsLCBwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBhcHBsaWNhdGlvblNjb3BlZDogdHJ1ZSB9XSk7XG5cdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0fVxuXG5cdH1cblxuXHRnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+IHtcblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb25zQ29udHJvbE1hbmlmZXN0IHx8IG5vdyAtIHRoaXMubGFzdFJlcG9ydFRpbWVzdGFtcCA+IDEwMDAgKiA2MCAqIDUpIHsgLy8gNSBtaW51dGUgY2FjaGUgZnJlc2huZXNzXG5cdFx0XHR0aGlzLmV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgPSB0aGlzLnVwZGF0ZUNvbnRyb2xDYWNoZSgpO1xuXHRcdFx0dGhpcy5sYXN0UmVwb3J0VGltZXN0YW1wID0gbm93O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q7XG5cdH1cblxuXHRyZWdpc3RlclBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50KTogdm9pZCB7XG5cdFx0dGhpcy5wYXJ0aWNpcGFudHMucHVzaChwYXJ0aWNpcGFudCk7XG5cdH1cblxuXHRhc3luYyByZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMocGlubmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuam9pbkFsbFNldHRsZWQodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5tYXAoXG5cdFx0XHRcdGFzeW5jIHByb2ZpbGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKGV4dGVuc2lvbnMubWFwKFxuXHRcdFx0XHRcdFx0YXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5waW5uZWQgIT09IHBpbm5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLCB7IHBpbm5lZCB9LCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIHJlc2V0dGluZyBwaW5uZWQgc3RhdGUgZm9yIGFsbCB1c2VyIGV4dGVuc2lvbnMnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBpbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsYWJsZUV4dGVuc2lvbltdKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+IHtcblx0XHRjb25zdCBpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcCA9IG5ldyBNYXA8c3RyaW5nLCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0ICYgeyBwcm9maWxlTG9jYXRpb246IFVSSSB9PigpO1xuXHRcdGNvbnN0IGluc3RhbGxpbmdFeHRlbnNpb25zTWFwID0gbmV3IE1hcDxzdHJpbmcsIHsgdGFzazogSUluc3RhbGxFeHRlbnNpb25UYXNrOyByb290OiBJSW5zdGFsbEV4dGVuc2lvblRhc2sgfCB1bmRlZmluZWQ7IHVuaW5zdGFsbFRhc2tUb1dhaXRGb3I/OiBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayB9PigpO1xuXHRcdGNvbnN0IGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZ2V0SW5zdGFsbEV4dGVuc2lvblRhc2tLZXkgPSAoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpID0+IGAke0V4dGVuc2lvbktleS5jcmVhdGUoZXh0ZW5zaW9uKS50b1N0cmluZygpfS0ke3Byb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpfWA7XG5cdFx0Y29uc3QgY3JlYXRlSW5zdGFsbEV4dGVuc2lvblRhc2sgPSAobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiB8IFVSSSwgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLCByb290OiBJSW5zdGFsbEV4dGVuc2lvblRhc2sgfCB1bmRlZmluZWQpOiB2b2lkID0+IHtcblx0XHRcdGxldCB1bmluc3RhbGxUYXNrVG9XYWl0Rm9yO1xuXHRcdFx0aWYgKCFVUkkuaXNVcmkoZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRpZiAoaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAuaGFzKGAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCl9LSR7b3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKX1gKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleGlzdGluZ0luc3RhbGxpbmdFeHRlbnNpb24gPSB0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLmdldChnZXRJbnN0YWxsRXh0ZW5zaW9uVGFza0tleShleHRlbnNpb24sIG9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSk7XG5cdFx0XHRcdGlmIChleGlzdGluZ0luc3RhbGxpbmdFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRpZiAocm9vdCAmJiB0aGlzLmNhbldhaXRGb3JUYXNrKHJvb3QsIGV4aXN0aW5nSW5zdGFsbGluZ0V4dGVuc2lvbi50YXNrKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IGV4aXN0aW5nSW5zdGFsbGluZ0V4dGVuc2lvbi50YXNrLmlkZW50aWZpZXI7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnV2FpdGluZyBmb3IgYWxyZWFkeSByZXF1ZXN0ZWQgaW5zdGFsbGluZyBleHRlbnNpb24nLCBpZGVudGlmaWVyLmlkLCByb290LmlkZW50aWZpZXIuaWQsIG9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0ZXhpc3RpbmdJbnN0YWxsaW5nRXh0ZW5zaW9uLndhaXRpbmdUYXNrcy5wdXNoKHJvb3QpO1xuXHRcdFx0XHRcdFx0Ly8gYWRkIHByb21pc2UgdGhhdCB3YWl0cyB1bnRpbCB0aGUgZXh0ZW5zaW9uIGlzIGNvbXBsZXRlbHkgaW5zdGFsbGVkLCBpZS4sIG9uRGlkSW5zdGFsbEV4dGVuc2lvbnMgZXZlbnQgaXMgdHJpZ2dlcmVkIGZvciB0aGlzIGV4dGVuc2lvblxuXHRcdFx0XHRcdFx0Y29uc3Qgd2FpdEZvckluc3RhbGxhdGlvbiA9IEV2ZW50LnRvUHJvbWlzZShcblx0XHRcdFx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMub25EaWRJbnN0YWxsRXh0ZW5zaW9ucywgcmVzdWx0cyA9PiByZXN1bHRzLnNvbWUocmVzdWx0ID0+IGFyZVNhbWVFeHRlbnNpb25zKHJlc3VsdC5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSkpXG5cdFx0XHRcdFx0XHQpLnRoZW4ocmVzdWx0cyA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdGaW5pc2hlZCB3YWl0aW5nIGZvciBhbHJlYWR5IHJlcXVlc3RlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbicsIGlkZW50aWZpZXIuaWQsIHJvb3QuaWRlbnRpZmllci5pZCwgb3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc3VsdHMuZmluZChyZXN1bHQgPT4gYXJlU2FtZUV4dGVuc2lvbnMocmVzdWx0LmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQ/LmxvY2FsKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGZhaWxlZCB0byBpbnN0YWxsXG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gJHtpZGVudGlmaWVyLmlkfSBpcyBub3QgaW5zdGFsbGVkYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdC5sb2NhbDtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0YWxyZWFkeVJlcXVlc3RlZEluc3RhbGxhdGlvbnMucHVzaCh3YWl0Rm9ySW5zdGFsbGF0aW9uKTtcblx0XHRcdFx0XHRcdC8vIEF0dGFjaCBhIG5vLW9wIHJlamVjdGlvbiBoYW5kbGVyIHRvIHByZXZlbnQgYW4gdW5oYW5kbGVkUmVqZWN0aW9uIGlmIHRoZVxuXHRcdFx0XHRcdFx0Ly8gb3V0ZXIgdHJ5IHRocm93cyBiZWZvcmUgYGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zYCBpcyBhd2FpdGVkIGJlbG93LlxuXHRcdFx0XHRcdFx0Ly8gVGhlIG9yaWdpbmFsIHByb21pc2UgaXMgc3RpbGwgb2JzZXJ2ZWQgdmlhIGBqb2luQWxsU2V0dGxlZGAgb24gdGhlIGhhcHB5IHBhdGgsXG5cdFx0XHRcdFx0XHQvLyBhbmQgdGhlIHVuZGVybHlpbmcgaW5zdGFsbCBmYWlsdXJlIGlzIGFscmVhZHkgcmVwb3J0ZWQgYnkgdGhlIHByaW1hcnkgdGFzay5cblx0XHRcdFx0XHRcdHdhaXRGb3JJbnN0YWxsYXRpb24uY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVuaW5zdGFsbFRhc2tUb1dhaXRGb3IgPSB0aGlzLnVuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZ2V0KHRoaXMuZ2V0VW5pbnN0YWxsRXh0ZW5zaW9uVGFza0tleShleHRlbnNpb24uaWRlbnRpZmllciwgb3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25UYXNrID0gdGhpcy5jcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayhtYW5pZmVzdCwgZXh0ZW5zaW9uLCBvcHRpb25zKTtcblx0XHRcdGNvbnN0IGtleSA9IGAke2dldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpfS0ke29wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YDtcblx0XHRcdGluc3RhbGxpbmdFeHRlbnNpb25zTWFwLnNldChrZXksIHsgdGFzazogaW5zdGFsbEV4dGVuc2lvblRhc2ssIHJvb3QsIHVuaW5zdGFsbFRhc2tUb1dhaXRGb3IgfSk7XG5cdFx0XHR0aGlzLl9vbkluc3RhbGxFeHRlbnNpb24uZmlyZSh7IGlkZW50aWZpZXI6IGluc3RhbGxFeHRlbnNpb25UYXNrLmlkZW50aWZpZXIsIHNvdXJjZTogZXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IG9wdGlvbnMucHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0luc3RhbGxpbmcgZXh0ZW5zaW9uOicsIGluc3RhbGxFeHRlbnNpb25UYXNrLmlkZW50aWZpZXIuaWQsIG9wdGlvbnMpO1xuXHRcdFx0Ly8gb25seSBjYWNoZSBnYWxsZXJ5IGV4dGVuc2lvbnMgdGFza3Ncblx0XHRcdGlmICghVVJJLmlzVXJpKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0dGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5zZXQoZ2V0SW5zdGFsbEV4dGVuc2lvblRhc2tLZXkoZXh0ZW5zaW9uLCBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbiksIHsgdGFzazogaW5zdGFsbEV4dGVuc2lvblRhc2ssIHdhaXRpbmdUYXNrczogW10gfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pO1xuXHRcdFx0Ly8gU3RhcnQgaW5zdGFsbGluZyBleHRlbnNpb25zXG5cdFx0XHRmb3IgKGNvbnN0IHsgbWFuaWZlc3QsIGV4dGVuc2lvbiwgb3B0aW9ucyB9IG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKTtcblx0XHRcdFx0Y29uc3QgaXNTeXN0ZW1FeHRlbnNpb24gPSBzeXN0ZW1FeHRlbnNpb25zLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKTtcblx0XHRcdFx0Y29uc3QgaXNCdWlsdGluID0gb3B0aW9ucy5pc0J1aWx0aW4gfHwgaXNTeXN0ZW1FeHRlbnNpb247XG5cdFx0XHRcdGNvbnN0IGlzQXBwbGljYXRpb25TY29wZWQgPSBvcHRpb25zLmlzQXBwbGljYXRpb25TY29wZWQgfHwgaXNCdWlsdGluIHx8IGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24obWFuaWZlc3QpO1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyA9IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdGlzQnVpbHRpbixcblx0XHRcdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogaXNBcHBsaWNhdGlvblNjb3BlZCA/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIDogb3B0aW9ucy5wcm9maWxlTG9jYXRpb24gPz8gdGhpcy5nZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKSxcblx0XHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBleGlzdGluZ0luc3RhbGxFeHRlbnNpb25UYXNrID0gIVVSSS5pc1VyaShleHRlbnNpb24pID8gdGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5nZXQoZ2V0SW5zdGFsbEV4dGVuc2lvblRhc2tLZXkoZXh0ZW5zaW9uLCBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChleGlzdGluZ0luc3RhbGxFeHRlbnNpb25UYXNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdUYXNrID0gZXhpc3RpbmdJbnN0YWxsRXh0ZW5zaW9uVGFzay50YXNrO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdFeHRlbnNpb24gaXMgYWxyZWFkeSByZXF1ZXN0ZWQgdG8gaW5zdGFsbCcsIGV4aXN0aW5nVGFzay5pZGVudGlmaWVyLmlkLCBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdC8vIFJlY29yZCB0aGUgcmVzdWx0IG9mIHRoZSBpbi1mbGlnaHQgaW5zdGFsbCBpbnRvIG91ciByZXN1bHRzIG1hcCBzbyBjYWxsZXJzXG5cdFx0XHRcdFx0Ly8gKGUuZy4gaW5zdGFsbEZyb21HYWxsZXJ5KSBjYW4gZmluZCB0aGUgYWN0dWFsIGxvY2FsIGV4dGVuc2lvbiBvciByZWFsIGVycm9yXG5cdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxsaW5nIHRocm91Z2ggdG8gYSBnZW5lcmljIFwiVW5rbm93biBlcnJvclwiLlxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdEtleSA9IGAke2V4aXN0aW5nVGFzay5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCl9LSR7aW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpfWA7XG5cdFx0XHRcdFx0Y29uc3Qgd2FpdEZvckluc3RhbGxhdGlvbiA9IGV4aXN0aW5nVGFzay53YWl0VW50aWxUYXNrSXNGaW5pc2hlZCgpLnRoZW4obG9jYWwgPT4ge1xuXHRcdFx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KHJlc3VsdEtleSwge1xuXHRcdFx0XHRcdFx0XHRsb2NhbCxcblx0XHRcdFx0XHRcdFx0aWRlbnRpZmllcjogZXhpc3RpbmdUYXNrLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRcdG9wZXJhdGlvbjogZXhpc3RpbmdUYXNrLm9wZXJhdGlvbixcblx0XHRcdFx0XHRcdFx0c291cmNlOiBleGlzdGluZ1Rhc2suc291cmNlLFxuXHRcdFx0XHRcdFx0XHRjb250ZXh0OiBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMuY29udGV4dCxcblx0XHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMucHJvZmlsZUxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHRhcHBsaWNhdGlvblNjb3BlZDogbG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsO1xuXHRcdFx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0XHRcdGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnNldChyZXN1bHRLZXksIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yKSxcblx0XHRcdFx0XHRcdFx0aWRlbnRpZmllcjogZXhpc3RpbmdUYXNrLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRcdG9wZXJhdGlvbjogZXhpc3RpbmdUYXNrLm9wZXJhdGlvbixcblx0XHRcdFx0XHRcdFx0c291cmNlOiBleGlzdGluZ1Rhc2suc291cmNlLFxuXHRcdFx0XHRcdFx0XHRjb250ZXh0OiBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMuY29udGV4dCxcblx0XHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMucHJvZmlsZUxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhbHJlYWR5UmVxdWVzdGVkSW5zdGFsbGF0aW9ucy5wdXNoKHdhaXRGb3JJbnN0YWxsYXRpb24pO1xuXHRcdFx0XHRcdC8vIEF0dGFjaCBhIG5vLW9wIHJlamVjdGlvbiBoYW5kbGVyIHRvIHByZXZlbnQgYW4gdW5oYW5kbGVkUmVqZWN0aW9uIGlmIHRoZVxuXHRcdFx0XHRcdC8vIG91dGVyIHRyeSB0aHJvd3MgYmVmb3JlIGBhbHJlYWR5UmVxdWVzdGVkSW5zdGFsbGF0aW9uc2AgaXMgYXdhaXRlZCBiZWxvdy5cblx0XHRcdFx0XHQvLyBUaGUgb3JpZ2luYWwgcHJvbWlzZSBpcyBzdGlsbCBvYnNlcnZlZCB2aWEgYGpvaW5BbGxTZXR0bGVkYCBvbiB0aGUgaGFwcHkgcGF0aC5cblx0XHRcdFx0XHR3YWl0Rm9ySW5zdGFsbGF0aW9uLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3JlYXRlSW5zdGFsbEV4dGVuc2lvblRhc2sobWFuaWZlc3QsIGV4dGVuc2lvbiwgaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNvbGxlY3QgYW5kIHN0YXJ0IGluc3RhbGxpbmcgYWxsIGRlcGVuZGVuY2llcyBhbmQgcGFjayBleHRlbnNpb25zXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4uaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAudmFsdWVzKCldLm1hcChhc3luYyAoeyB0YXNrIH0pID0+IHtcblx0XHRcdFx0aWYgKHRhc2sub3B0aW9ucy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0luc3RhbGxpbmcgdGhlIGV4dGVuc2lvbiB3aXRob3V0IGNoZWNraW5nIGRlcGVuZGVuY2llcyBhbmQgcGFjaycsIHRhc2suaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGxldCBwcmVmZXJQcmVSZWxlYXNlID0gdGhpcy5wcmVmZXJQcmVSZWxlYXNlcztcblx0XHRcdFx0XHRcdGlmICh0YXNrLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdHByZWZlclByZVJlbGVhc2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICghVVJJLmlzVXJpKHRhc2suc291cmNlKSAmJiB0YXNrLnNvdXJjZS5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0XHRcdFx0XHQvLyBFeHBsaWNpdGx5IGFza2VkIHRvIGluc3RhbGwgdGhlIHJlbGVhc2UgdmVyc2lvblxuXHRcdFx0XHRcdFx0XHRwcmVmZXJQcmVSZWxlYXNlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIHRhc2sub3B0aW9ucy5wcm9kdWN0VmVyc2lvbik7XG5cdFx0XHRcdFx0XHRjb25zdCBhbGxEZXBzQW5kUGFja0V4dGVuc2lvbnNUb0luc3RhbGwgPSBhd2FpdCB0aGlzLmdldEFsbERlcHNBbmRQYWNrRXh0ZW5zaW9ucyh0YXNrLmlkZW50aWZpZXIsIHRhc2subWFuaWZlc3QsIHByZWZlclByZVJlbGVhc2UsIHRhc2sub3B0aW9ucy5wcm9kdWN0VmVyc2lvbiwgaW5zdGFsbGVkKTtcblx0XHRcdFx0XHRcdGNvbnN0IG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyA9IHsgLi4udGFzay5vcHRpb25zLCBwaW5uZWQ6IGZhbHNlLCBpbnN0YWxsR2l2ZW5WZXJzaW9uOiBmYWxzZSwgY29udGV4dDogeyAuLi50YXNrLm9wdGlvbnMuY29udGV4dCwgW0VYVEVOU0lPTl9JTlNUQUxMX0RFUF9QQUNLX0NPTlRFWFRdOiB0cnVlIH0gfTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgeyBnYWxsZXJ5LCBtYW5pZmVzdCB9IG9mIGRpc3RpbmN0KGFsbERlcHNBbmRQYWNrRXh0ZW5zaW9uc1RvSW5zdGFsbCwgKHsgZ2FsbGVyeSB9KSA9PiBnYWxsZXJ5LmlkZW50aWZpZXIuaWQpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGdhbGxlcnkuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdFx0XHQvLyBTa2lwIGlmIHRoZSBleHRlbnNpb24gaXMgYWxyZWFkeSBpbnN0YWxsZWQgYW5kIGhhcyB0aGUgc2FtZSBhcHBsaWNhdGlvbiBzY29wZVxuXHRcdFx0XHRcdFx0XHRpZiAoZXhpc3RpbmcgJiYgZXhpc3RpbmcuaXNBcHBsaWNhdGlvblNjb3BlZCA9PT0gISFvcHRpb25zLmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayhtYW5pZmVzdCwgZ2FsbGVyeSwgb3B0aW9ucywgdGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdC8vIEluc3RhbGxpbmcgdGhyb3VnaCBWU0lYXG5cdFx0XHRcdFx0XHRpZiAoVVJJLmlzVXJpKHRhc2suc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBJZ25vcmUgaW5zdGFsbGluZyBkZXBlbmRlbmNpZXMgYW5kIHBhY2tzXG5cdFx0XHRcdFx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkodGFzay5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYENhbm5vdCBpbnN0YWxsIGRlcGVuZGVuY2llcyBvZiBleHRlbnNpb246YCwgdGFzay5pZGVudGlmaWVyLmlkLCBlcnJvci5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoaXNOb25FbXB0eUFycmF5KHRhc2subWFuaWZlc3QuZXh0ZW5zaW9uUGFjaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgQ2Fubm90IGluc3RhbGwgcGFja2VkIGV4dGVuc2lvbnMgb2YgZXh0ZW5zaW9uOmAsIHRhc2suaWRlbnRpZmllci5pZCwgZXJyb3IubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igd2hpbGUgcHJlcGFyaW5nIHRvIGluc3RhbGwgZGVwZW5kZW5jaWVzIGFuZCBleHRlbnNpb24gcGFja3Mgb2YgdGhlIGV4dGVuc2lvbjonLCB0YXNrLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJQcm9maWxlc1RvVXBkYXRlID0gYXdhaXQgdGhpcy5nZXRPdGhlclByb2ZpbGVzVG9VcGRhdGVFeHRlbnNpb24oWy4uLmluc3RhbGxpbmdFeHRlbnNpb25zTWFwLnZhbHVlcygpXS5tYXAoKHsgdGFzayB9KSA9PiB0YXNrKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFtwcm9maWxlTG9jYXRpb24sIHRhc2tdIG9mIG90aGVyUHJvZmlsZXNUb1VwZGF0ZSkge1xuXHRcdFx0XHRjcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayh0YXNrLm1hbmlmZXN0LCB0YXNrLnNvdXJjZSwgeyAuLi50YXNrLm9wdGlvbnMsIHByb2ZpbGVMb2NhdGlvbiB9LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnN0YWxsIGV4dGVuc2lvbnMgaW4gcGFyYWxsZWwgYW5kIHdhaXQgdW50aWwgYWxsIGV4dGVuc2lvbnMgYXJlIGluc3RhbGxlZCAvIGZhaWxlZFxuXHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZChbLi4uaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAuZW50cmllcygpXS5tYXAoYXN5bmMgKFtrZXksIHsgdGFzaywgdW5pbnN0YWxsVGFza1RvV2FpdEZvciB9XSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0XHRcdFx0bGV0IGxvY2FsOiBJTG9jYWxFeHRlbnNpb247XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKHVuaW5zdGFsbFRhc2tUb1dhaXRGb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdXYWl0aW5nIGZvciBleGlzdGluZyB1bmluc3RhbGwgdGFzayB0byBjb21wbGV0ZSBiZWZvcmUgaW5zdGFsbGluZycsIHRhc2suaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB1bmluc3RhbGxUYXNrVG9XYWl0Rm9yLndhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdGaW5pc2hlZCB3YWl0aW5nIGZvciB1bmluc3RhbGwgdGFzaywgcHJvY2VlZGluZyB3aXRoIGluc3RhbGwnLCB0YXNrLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VuaW5zdGFsbCB0YXNrIGZhaWxlZCwgcHJvY2VlZGluZyB3aXRoIGluc3RhbGwgYW55d2F5JywgdGFzay5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsb2NhbCA9IGF3YWl0IHRhc2sucnVuKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZCh0aGlzLnBhcnRpY2lwYW50cy5tYXAocGFydGljaXBhbnQgPT4gcGFydGljaXBhbnQucG9zdEluc3RhbGwobG9jYWwsIHRhc2suc291cmNlLCB0YXNrLm9wdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Qb3N0SW5zdGFsbCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGUpO1xuXHRcdFx0XHRcdGlmICghVVJJLmlzVXJpKHRhc2suc291cmNlKSkge1xuXHRcdFx0XHRcdFx0cmVwb3J0VGVsZW1ldHJ5KHRoaXMudGVsZW1ldHJ5U2VydmljZSwgdGFzay5vcGVyYXRpb24gPT09IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlID8gJ2V4dGVuc2lvbkdhbGxlcnk6dXBkYXRlJyA6ICdleHRlbnNpb25HYWxsZXJ5Omluc3RhbGwnLCB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkRhdGE6IGdldEdhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhKHRhc2suc291cmNlKSxcblx0XHRcdFx0XHRcdFx0ZXJyb3IsXG5cdFx0XHRcdFx0XHRcdHNvdXJjZTogdGFzay5vcHRpb25zLmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVF0gYXMgc3RyaW5nIHwgdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KGtleSwgeyBlcnJvciwgaWRlbnRpZmllcjogdGFzay5pZGVudGlmaWVyLCBvcGVyYXRpb246IHRhc2sub3BlcmF0aW9uLCBzb3VyY2U6IHRhc2suc291cmNlLCBjb250ZXh0OiB0YXNrLm9wdGlvbnMuY29udGV4dCwgcHJvZmlsZUxvY2F0aW9uOiB0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCBhcHBsaWNhdGlvblNjb3BlZDogdGFzay5vcHRpb25zLmlzQXBwbGljYXRpb25TY29wZWQgfSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBpbnN0YWxsaW5nIHRoZSBleHRlbnNpb24nLCB0YXNrLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvciksIHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFVUkkuaXNVcmkodGFzay5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNVcGRhdGUgPSB0YXNrLm9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGU7XG5cdFx0XHRcdFx0Y29uc3QgZHVyYXRpb25TaW5jZVVwZGF0ZSA9IGlzVXBkYXRlID8gdW5kZWZpbmVkIDogKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGFzay5zb3VyY2UubGFzdFVwZGF0ZWQpIC8gMTAwMDtcblx0XHRcdFx0XHRyZXBvcnRUZWxlbWV0cnkodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCBpc1VwZGF0ZSA/ICdleHRlbnNpb25HYWxsZXJ5OnVwZGF0ZScgOiAnZXh0ZW5zaW9uR2FsbGVyeTppbnN0YWxsJywge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uRGF0YTogZ2V0R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEodGFzay5zb3VyY2UpLFxuXHRcdFx0XHRcdFx0dmVyaWZpY2F0aW9uU3RhdHVzOiB0YXNrLnZlcmlmaWNhdGlvblN0YXR1cyxcblx0XHRcdFx0XHRcdGR1cmF0aW9uOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHN0YXJ0VGltZSxcblx0XHRcdFx0XHRcdGR1cmF0aW9uU2luY2VVcGRhdGUsXG5cdFx0XHRcdFx0XHRzb3VyY2U6IHRhc2sub3B0aW9ucy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFRdIGFzIHN0cmluZyB8IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnNldChrZXksIHsgbG9jYWwsIGlkZW50aWZpZXI6IHRhc2suaWRlbnRpZmllciwgb3BlcmF0aW9uOiB0YXNrLm9wZXJhdGlvbiwgc291cmNlOiB0YXNrLnNvdXJjZSwgY29udGV4dDogdGFzay5vcHRpb25zLmNvbnRleHQsIHByb2ZpbGVMb2NhdGlvbjogdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgYXBwbGljYXRpb25TY29wZWQ6IGxvY2FsLmlzQXBwbGljYXRpb25TY29wZWQgfSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmIChhbHJlYWR5UmVxdWVzdGVkSW5zdGFsbGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZChhbHJlYWR5UmVxdWVzdGVkSW5zdGFsbGF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IGdldEFsbERlcHNBbmRQYWNrcyA9IChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgcHJvZmlsZUxvY2F0aW9uOiBVUkksIGFsbERlcHNPclBhY2tzOiBzdHJpbmdbXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkZXBzT3JQYWNrcyA9IFtdO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZGVwc09yUGFja3MucHVzaCguLi5leHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2s/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdGRlcHNPclBhY2tzLnB1c2goLi4uZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2spO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgZGVwc09yUGFja3MpIHtcblx0XHRcdFx0XHRpZiAoYWxsRGVwc09yUGFja3MuaW5jbHVkZXMoaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhbGxEZXBzT3JQYWNrcy5wdXNoKGlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLmdldChgJHtpZC50b0xvd2VyQ2FzZSgpfS0ke3Byb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdGlmIChpbnN0YWxsZWQ/LmxvY2FsKSB7XG5cdFx0XHRcdFx0XHRhbGxEZXBzT3JQYWNrcyA9IGdldEFsbERlcHNBbmRQYWNrcyhpbnN0YWxsZWQubG9jYWwsIHByb2ZpbGVMb2NhdGlvbiwgYWxsRGVwc09yUGFja3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYWxsRGVwc09yUGFja3M7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZ2V0RXJyb3JSZXN1bHQgPSAodGFzazogSUluc3RhbGxFeHRlbnNpb25UYXNrKSA9PiAoeyBpZGVudGlmaWVyOiB0YXNrLmlkZW50aWZpZXIsIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsLCBzb3VyY2U6IHRhc2suc291cmNlLCBjb250ZXh0OiB0YXNrLm9wdGlvbnMuY29udGV4dCwgcHJvZmlsZUxvY2F0aW9uOiB0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCBlcnJvciB9KTtcblxuXHRcdFx0Y29uc3Qgcm9sbGJhY2tUYXNrczogSVVuaW5zdGFsbEV4dGVuc2lvblRhc2tbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB7IHRhc2ssIHJvb3QgfV0gb2YgaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXApIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuZ2V0KGtleSk7XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0dGFzay5jYW5jZWwoKTtcblx0XHRcdFx0XHRpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5zZXQoa2V5LCBnZXRFcnJvclJlc3VsdCh0YXNrKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWYgdGhlIGV4dGVuc2lvbiBpcyBpbnN0YWxsZWQgYnkgYSByb290IHRhc2sgYW5kIHRoZSByb290IHRhc2sgaXMgZmFpbGVkLCB0aGVuIHVuaW5zdGFsbCB0aGUgZXh0ZW5zaW9uXG5cdFx0XHRcdGVsc2UgaWYgKHJlc3VsdC5sb2NhbCAmJiByb290ICYmICFpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5nZXQoYCR7cm9vdC5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCl9LSR7dGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpfWApPy5sb2NhbCkge1xuXHRcdFx0XHRcdHJvbGxiYWNrVGFza3MucHVzaCh0aGlzLmNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2socmVzdWx0LmxvY2FsLCB7IHZlcnNpb25Pbmx5OiB0cnVlLCBwcm9maWxlTG9jYXRpb246IHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24gfSkpO1xuXHRcdFx0XHRcdGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnNldChrZXksIGdldEVycm9yUmVzdWx0KHRhc2spKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB7IHRhc2sgfV0gb2YgaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXApIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuZ2V0KGtleSk7XG5cdFx0XHRcdGlmICghcmVzdWx0Py5sb2NhbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0YXNrLm9wdGlvbnMuZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRlcHNPclBhY2tzID0gZ2V0QWxsRGVwc0FuZFBhY2tzKHJlc3VsdC5sb2NhbCwgdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgW3Jlc3VsdC5sb2NhbC5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldKS5zbGljZSgxKTtcblx0XHRcdFx0aWYgKGRlcHNPclBhY2tzLnNvbWUoZGVwT3JQYWNrID0+IGluc3RhbGxpbmdFeHRlbnNpb25zTWFwLmhhcyhgJHtkZXBPclBhY2sudG9Mb3dlckNhc2UoKX0tJHt0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YCkgJiYgIWluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLmdldChgJHtkZXBPclBhY2sudG9Mb3dlckNhc2UoKX0tJHt0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YCk/LmxvY2FsKSkge1xuXHRcdFx0XHRcdHJvbGxiYWNrVGFza3MucHVzaCh0aGlzLmNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2socmVzdWx0LmxvY2FsLCB7IHZlcnNpb25Pbmx5OiB0cnVlLCBwcm9maWxlTG9jYXRpb246IHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24gfSkpO1xuXHRcdFx0XHRcdGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnNldChrZXksIGdldEVycm9yUmVzdWx0KHRhc2spKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocm9sbGJhY2tUYXNrcy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJvbGxiYWNrVGFza3MubWFwKGFzeW5jIHJvbGxiYWNrVGFzayA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHJvbGxiYWNrVGFzay5ydW4oKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdSb2xsYmFjazogVW5pbnN0YWxsZWQgZXh0ZW5zaW9uJywgcm9sbGJhY2tUYXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1JvbGxiYWNrOiBFcnJvciB3aGlsZSB1bmluc3RhbGxpbmcgZXh0ZW5zaW9uJywgcm9sbGJhY2tUYXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gRmluYWxseSwgcmVtb3ZlIGFsbCB0aGUgdGFza3MgZnJvbSB0aGUgY2FjaGVcblx0XHRcdGZvciAoY29uc3QgeyB0YXNrIH0gb2YgaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKHRhc2suc291cmNlICYmICFVUkkuaXNVcmkodGFzay5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5kZWxldGUoZ2V0SW5zdGFsbEV4dGVuc2lvblRhc2tLZXkodGFzay5zb3VyY2UsIHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZXN1bHRzID0gWy4uLmluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnZhbHVlcygpXTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0LmxvY2FsKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBFeHRlbnNpb24gaW5zdGFsbGVkIHN1Y2Nlc3NmdWxseTpgLCByZXN1bHQuaWRlbnRpZmllci5pZCwgcmVzdWx0LnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRJbnN0YWxsRXh0ZW5zaW9ucy5maXJlKHJlc3VsdHMpO1xuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPdGhlclByb2ZpbGVzVG9VcGRhdGVFeHRlbnNpb24odGFza3M6IElJbnN0YWxsRXh0ZW5zaW9uVGFza1tdKTogUHJvbWlzZTxbVVJJLCBJSW5zdGFsbEV4dGVuc2lvblRhc2tdW10+IHtcblx0XHRjb25zdCBvdGhlclByb2ZpbGVzVG9VcGRhdGU6IFtVUkksIElJbnN0YWxsRXh0ZW5zaW9uVGFza11bXSA9IFtdO1xuXHRcdGNvbnN0IHByb2ZpbGVFeHRlbnNpb25zQ2FjaGUgPSBuZXcgUmVzb3VyY2VNYXA8SUxvY2FsRXh0ZW5zaW9uW10+KCk7XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRpZiAodGFzay5vcGVyYXRpb24gIT09IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlXG5cdFx0XHRcdHx8IHRhc2sub3B0aW9ucy5pc0FwcGxpY2F0aW9uU2NvcGVkXG5cdFx0XHRcdHx8IHRhc2sub3B0aW9ucy5waW5uZWRcblx0XHRcdFx0fHwgdGFzay5vcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb25cblx0XHRcdFx0fHwgVVJJLmlzVXJpKHRhc2suc291cmNlKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCB0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBpbnN0YWxsZWRFeHRlbnNpb25zID0gcHJvZmlsZUV4dGVuc2lvbnNDYWNoZS5nZXQocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIWluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdFx0cHJvZmlsZUV4dGVuc2lvbnNDYWNoZS5zZXQocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgdGFzay5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb24gJiYgIWluc3RhbGxlZEV4dGVuc2lvbi5waW5uZWQpIHtcblx0XHRcdFx0XHRvdGhlclByb2ZpbGVzVG9VcGRhdGUucHVzaChbcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHRhc2tdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3RoZXJQcm9maWxlc1RvVXBkYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5XYWl0Rm9yVGFzayh0YXNrVG9XYWl0OiBJSW5zdGFsbEV4dGVuc2lvblRhc2ssIHRhc2tUb1dhaXRGb3I6IElJbnN0YWxsRXh0ZW5zaW9uVGFzayk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgWywgeyB0YXNrLCB3YWl0aW5nVGFza3MgfV0gb2YgdGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICh0YXNrID09PSB0YXNrVG9XYWl0KSB7XG5cdFx0XHRcdC8vIENhbm5vdCBiZSB3YWl0ZWQsIElmIHRhc2tUb1dhaXRGb3IgaXMgd2FpdGluZyBmb3IgdGFza1RvV2FpdFxuXHRcdFx0XHRpZiAod2FpdGluZ1Rhc2tzLmluY2x1ZGVzKHRhc2tUb1dhaXRGb3IpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENhbm5vdCBiZSB3YWl0ZWQsIElmIHRhc2tUb1dhaXRGb3IgaXMgd2FpdGluZyBmb3IgdGFza3Mgd2FpdGluZyBmb3IgdGFza1RvV2FpdFxuXHRcdFx0XHRpZiAod2FpdGluZ1Rhc2tzLnNvbWUod2FpdGluZ1Rhc2sgPT4gdGhpcy5jYW5XYWl0Rm9yVGFzayh3YWl0aW5nVGFzaywgdGFza1RvV2FpdEZvcikpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBDYW5ub3QgYmUgd2FpdGVkLCBpZiB0aGUgdGFza1RvV2FpdCBjYW5ub3QgYmUgd2FpdGVkIGZvciB0aGUgdGFzayBjcmVhdGVkIHRoZSB0YXNrVG9XYWl0Rm9yXG5cdFx0XHQvLyBCZWNhdXNlLCB0aGUgdGFzayB3YWl0cyBmb3IgdGhlIHRhc2tzIGl0IGNyZWF0ZWRcblx0XHRcdGlmICh0YXNrID09PSB0YXNrVG9XYWl0Rm9yICYmIHdhaXRpbmdUYXNrc1swXSAmJiAhdGhpcy5jYW5XYWl0Rm9yVGFzayh0YXNrVG9XYWl0LCB3YWl0aW5nVGFza3NbMF0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGpvaW5BbGxTZXR0bGVkPFQ+KHByb21pc2VzOiBQcm9taXNlPFQ+W10sIGVycm9yQ29kZT86IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUpOiBQcm9taXNlPFRbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXHRcdGNvbnN0IGVycm9yczogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yW10gPSBbXTtcblx0XHRjb25zdCBwcm9taXNlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChwcm9taXNlcyk7XG5cdFx0Zm9yIChjb25zdCByIG9mIHByb21pc2VSZXN1bHRzKSB7XG5cdFx0XHRpZiAoci5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdHJlc3VsdHMucHVzaChyLnZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKHIucmVhc29uLCBlcnJvckNvZGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWVycm9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiByZXN1bHRzO1xuXHRcdH1cblxuXHRcdC8vIFRocm93IGlmIHRoZXJlIGFyZSBlcnJvcnNcblx0XHRpZiAoZXJyb3JzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhyb3cgZXJyb3JzWzBdO1xuXHRcdH1cblxuXHRcdGxldCBlcnJvciA9IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoJycsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuVW5rbm93bik7XG5cdFx0Zm9yIChjb25zdCBjdXJyZW50IG9mIGVycm9ycykge1xuXHRcdFx0ZXJyb3IgPSBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKFxuXHRcdFx0XHRlcnJvci5tZXNzYWdlID8gYCR7ZXJyb3IubWVzc2FnZX0sICR7Y3VycmVudC5tZXNzYWdlfWAgOiBjdXJyZW50Lm1lc3NhZ2UsXG5cdFx0XHRcdGN1cnJlbnQuY29kZSAhPT0gRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Vbmtub3duICYmIGN1cnJlbnQuY29kZSAhPT0gRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnRlcm5hbCA/IGN1cnJlbnQuY29kZSA6IGVycm9yLmNvZGVcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHRocm93IGVycm9yO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBbGxEZXBzQW5kUGFja0V4dGVuc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIsIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIHByZWZlclByZVJlbGVhc2U6IGJvb2xlYW4sIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24sIGluc3RhbGxlZDogSUxvY2FsRXh0ZW5zaW9uW10pOiBQcm9taXNlPHsgZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb247IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfVtdPiB7XG5cdFx0aWYgKCF0aGlzLmdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qga25vd25JZGVudGlmaWVyczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3QgYWxsRGVwZW5kZW5jaWVzQW5kUGFja3M6IHsgZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb247IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfVtdID0gW107XG5cdFx0Y29uc3QgY29sbGVjdERlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zVG9JbnN0YWxsID0gYXN5bmMgKGV4dGVuc2lvbklkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRrbm93bklkZW50aWZpZXJzLnB1c2goZXh0ZW5zaW9uSWRlbnRpZmllcik7XG5cdFx0XHRjb25zdCBkZXBlbmRlY2llczogc3RyaW5nW10gPSBtYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMgPyBtYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMuZmlsdGVyKGRlcCA9PiAhaW5zdGFsbGVkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGRlcCB9KSkpIDogW107XG5cdFx0XHRjb25zdCBkZXBlbmRlbmNpZXNBbmRQYWNrRXh0ZW5zaW9ucyA9IFsuLi5kZXBlbmRlY2llc107XG5cdFx0XHRpZiAobWFuaWZlc3QuZXh0ZW5zaW9uUGFjaykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IGluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb25JZGVudGlmaWVyKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIG1hbmlmZXN0LmV4dGVuc2lvblBhY2spIHtcblx0XHRcdFx0XHQvLyBhZGQgb25seSB0aG9zZSBleHRlbnNpb25zIHdoaWNoIGFyZSBuZXcgaW4gY3VycmVudGx5IGluc3RhbGxlZCBleHRlbnNpb25cblx0XHRcdFx0XHRpZiAoIShleGlzdGluZyAmJiBleGlzdGluZy5tYW5pZmVzdC5leHRlbnNpb25QYWNrICYmIGV4aXN0aW5nLm1hbmlmZXN0LmV4dGVuc2lvblBhY2suc29tZShvbGQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogb2xkIH0sIHsgaWQ6IGV4dGVuc2lvbiB9KSkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoZGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnMuZXZlcnkoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZSB9LCB7IGlkOiBleHRlbnNpb24gfSkpKSB7XG5cdFx0XHRcdFx0XHRcdGRlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGRlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBmaWx0ZXIgb3V0IGtub3duIGV4dGVuc2lvbnNcblx0XHRcdFx0Y29uc3QgaWRzID0gZGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnMuZmlsdGVyKGlkID0+IGtub3duSWRlbnRpZmllcnMuZXZlcnkoZ2FsbGVyeUlkZW50aWZpZXIgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGdhbGxlcnlJZGVudGlmaWVyLCB7IGlkIH0pKSk7XG5cdFx0XHRcdGlmIChpZHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoaWRzLm1hcChpZCA9PiAoeyBpZCwgcHJlUmVsZWFzZTogcHJlZmVyUHJlUmVsZWFzZSB9KSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZ2FsbGVyeUV4dGVuc2lvbiBvZiBnYWxsZXJ5RXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKGtub3duSWRlbnRpZmllcnMuZmluZChpZGVudGlmaWVyID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgaXNEZXBlbmRlbmN5ID0gZGVwZW5kZWNpZXMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdFx0bGV0IGNvbXBhdGlibGU7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlID0gYXdhaXQgdGhpcy5jaGVja0FuZEdldENvbXBhdGlibGVWZXJzaW9uKGdhbGxlcnlFeHRlbnNpb24sIGZhbHNlLCBwcmVmZXJQcmVSZWxlYXNlLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRpZiAoIWlzRGVwZW5kZW5jeSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyB0aGUgcGFja2VkIGV4dGVuc2lvbiBhcyBpdCBjYW5ub3QgYmUgaW5zdGFsbGVkJywgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YWxsRGVwZW5kZW5jaWVzQW5kUGFja3MucHVzaCh7IGdhbGxlcnk6IGNvbXBhdGlibGUuZXh0ZW5zaW9uLCBtYW5pZmVzdDogY29tcGF0aWJsZS5tYW5pZmVzdCB9KTtcblx0XHRcdFx0XHRcdGF3YWl0IGNvbGxlY3REZXBlbmRlbmNpZXNBbmRQYWNrRXh0ZW5zaW9uc1RvSW5zdGFsbChjb21wYXRpYmxlLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBjb21wYXRpYmxlLm1hbmlmZXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgY29sbGVjdERlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zVG9JbnN0YWxsKGV4dGVuc2lvbklkZW50aWZpZXIsIG1hbmlmZXN0KTtcblx0XHRyZXR1cm4gYWxsRGVwZW5kZW5jaWVzQW5kUGFja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrQW5kR2V0Q29tcGF0aWJsZVZlcnNpb24oZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgc2FtZVZlcnNpb246IGJvb2xlYW4sIGluc3RhbGxQcmVSZWxlYXNlOiBib29sZWFuLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTx7IGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb247IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfT4ge1xuXHRcdGxldCBjb21wYXRpYmxlRXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw7XG5cblx0XHRjb25zdCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0aWYgKGlzTWFsaWNpb3VzKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Lm1hbGljaW91cykpIHtcblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdtYWxpY2lvdXMgZXh0ZW5zaW9uJywgXCJDYW4ndCBpbnN0YWxsICd7MH0nIGV4dGVuc2lvbiBzaW5jZSBpdCB3YXMgcmVwb3J0ZWQgdG8gYmUgcHJvYmxlbWF0aWMuXCIsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5NYWxpY2lvdXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlcHJlY2F0aW9uSW5mbyA9IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QuZGVwcmVjYXRlZFtleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXTtcblx0XHRpZiAoZGVwcmVjYXRpb25JbmZvPy5leHRlbnNpb24/LmF1dG9NaWdyYXRlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgVGhlICcke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfScgZXh0ZW5zaW9uIGlzIGRlcHJlY2F0ZWQsIGZldGNoaW5nIHRoZSBjb21wYXRpYmxlICcke2RlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWR9JyBleHRlbnNpb24gaW5zdGVhZC5gKTtcblx0XHRcdGNvbXBhdGlibGVFeHRlbnNpb24gPSAoYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBkZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmlkLCBwcmVSZWxlYXNlOiBkZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLnByZVJlbGVhc2UgfV0sIHsgdGFyZ2V0UGxhdGZvcm06IGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKSwgY29tcGF0aWJsZTogdHJ1ZSwgcHJvZHVjdFZlcnNpb24gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0aWYgKCFjb21wYXRpYmxlRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdub3RGb3VuZERlcHJlY2F0ZWRSZXBsYWNlbWVudEV4dGVuc2lvbicsIFwiQ2FuJ3QgaW5zdGFsbCAnezB9JyBleHRlbnNpb24gc2luY2UgaXQgd2FzIGRlcHJlY2F0ZWQgYW5kIHRoZSByZXBsYWNlbWVudCBleHRlbnNpb24gJ3sxfScgY2FuJ3QgYmUgZm91bmQuXCIsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBkZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmlkKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5EZXByZWNhdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmNhbkluc3RhbGwoZXh0ZW5zaW9uKSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ2luY29tcGF0aWJsZSBwbGF0Zm9ybScsIFwiVGhlICd7MH0nIGV4dGVuc2lvbiBpcyBub3QgYXZhaWxhYmxlIGluIHsxfSBmb3IgdGhlIHsyfSBwbGF0Zm9ybS5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsIFRhcmdldFBsYXRmb3JtVG9TdHJpbmcodGFyZ2V0UGxhdGZvcm0pKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGVUYXJnZXRQbGF0Zm9ybSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbXBhdGlibGVFeHRlbnNpb24gPSBhd2FpdCB0aGlzLmdldENvbXBhdGlibGVWZXJzaW9uKGV4dGVuc2lvbiwgc2FtZVZlcnNpb24sIGluc3RhbGxQcmVSZWxlYXNlLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0XHRpZiAoIWNvbXBhdGlibGVFeHRlbnNpb24pIHtcblx0XHRcdFx0LyoqIElmIG5vIGNvbXBhdGlibGUgcmVsZWFzZSB2ZXJzaW9uIGlzIGZvdW5kLCBjaGVjayBpZiB0aGUgZXh0ZW5zaW9uIGhhcyBhIHJlbGVhc2UgdmVyc2lvbiBvciBub3QgYW5kIHRocm93IHJlbGV2YW50IGVycm9yICovXG5cdFx0XHRcdGlmICghaW5zdGFsbFByZVJlbGVhc2UgJiYgZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uICYmIGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gJiYgKGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbZXh0ZW5zaW9uLmlkZW50aWZpZXJdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF0pIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnbm90Rm91bmRSZWxlYXNlRXh0ZW5zaW9uJywgXCJDYW4ndCBpbnN0YWxsIHJlbGVhc2UgdmVyc2lvbiBvZiAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBoYXMgbm8gcmVsZWFzZSB2ZXJzaW9uLlwiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlJlbGVhc2VWZXJzaW9uTm90Rm91bmQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdub3RGb3VuZENvbXBhdGlibGVEZXBlbmRlbmN5JywgXCJDYW4ndCBpbnN0YWxsICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIGN1cnJlbnQgdmVyc2lvbiBvZiB7MX0gKHZlcnNpb24gezJ9KS5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnR2V0dGluZyBNYW5pZmVzdC4uLicsIGNvbXBhdGlibGVFeHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGNvbXBhdGlibGVFeHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChtYW5pZmVzdCA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihgTWlzc2luZyBtYW5pZmVzdCBmb3IgZXh0ZW5zaW9uICR7Y29tcGF0aWJsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfWAsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW52YWxpZCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0LnZlcnNpb24gIT09IGNvbXBhdGlibGVFeHRlbnNpb24udmVyc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihgQ2Fubm90IGluc3RhbGwgJyR7Y29tcGF0aWJsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfScgZXh0ZW5zaW9uIGJlY2F1c2Ugb2YgdmVyc2lvbiBtaXNtYXRjaCBpbiBNYXJrZXRwbGFjZWAsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW52YWxpZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXh0ZW5zaW9uOiBjb21wYXRpYmxlRXh0ZW5zaW9uLCBtYW5pZmVzdCB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldENvbXBhdGlibGVWZXJzaW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHNhbWVWZXJzaW9uOiBib29sZWFuLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0bGV0IGNvbXBhdGlibGVFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAoIXNhbWVWZXJzaW9uICYmIGV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbiAmJiBleHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uICE9PSBpbmNsdWRlUHJlUmVsZWFzZSkge1xuXHRcdFx0Y29tcGF0aWJsZUV4dGVuc2lvbiA9IChhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgLi4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6IGluY2x1ZGVQcmVSZWxlYXNlIH1dLCB7IHRhcmdldFBsYXRmb3JtLCBjb21wYXRpYmxlOiB0cnVlLCBwcm9kdWN0VmVyc2lvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF0gfHwgbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIWNvbXBhdGlibGVFeHRlbnNpb24gJiYgYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5pc0V4dGVuc2lvbkNvbXBhdGlibGUoZXh0ZW5zaW9uLCBpbmNsdWRlUHJlUmVsZWFzZSwgdGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uKSkge1xuXHRcdFx0Y29tcGF0aWJsZUV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbXBhdGlibGVFeHRlbnNpb24pIHtcblx0XHRcdGlmIChzYW1lVmVyc2lvbikge1xuXHRcdFx0XHRjb21wYXRpYmxlRXh0ZW5zaW9uID0gKGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5leHRlbnNpb24uaWRlbnRpZmllciwgdmVyc2lvbjogZXh0ZW5zaW9uLnZlcnNpb24gfV0sIHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGU6IHRydWUsIHByb2R1Y3RWZXJzaW9uIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXSB8fCBudWxsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29tcGF0aWJsZUV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0Q29tcGF0aWJsZUV4dGVuc2lvbihleHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlLCB0YXJnZXRQbGF0Zm9ybSwgcHJvZHVjdFZlcnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb21wYXRpYmxlRXh0ZW5zaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyLCBwcm9maWxlTG9jYXRpb246IFVSSSwgdmVyc2lvbj86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2lkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX0ke3ZlcnNpb24gPyBgLSR7dmVyc2lvbn1gIDogJyd9QCR7cHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YDtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5ID0gKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucykgPT4gdGhpcy5nZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KGV4dGVuc2lvbi5pZGVudGlmaWVyLCB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdW5pbnN0YWxsT3B0aW9ucy52ZXJzaW9uT25seSA/IGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uIDogdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2sgPSAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHVuaW5zdGFsbE9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogdm9pZCA9PiB7XG5cdFx0XHRsZXQgaW5zdGFsbFRhc2tUb1dhaXRGb3I6IElJbnN0YWxsRXh0ZW5zaW9uVGFzayB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgeyB0YXNrIH0gb2YgdGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAoISh0YXNrLnNvdXJjZSBpbnN0YW5jZW9mIFVSSSkgJiYgYXJlU2FtZUV4dGVuc2lvbnModGFzay5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdW5pbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0aW5zdGFsbFRhc2tUb1dhaXRGb3IgPSB0YXNrO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXNrID0gdGhpcy5jcmVhdGVVbmluc3RhbGxFeHRlbnNpb25UYXNrKGV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9ucyk7XG5cdFx0XHR0aGlzLnVuaW5zdGFsbGluZ0V4dGVuc2lvbnMuc2V0KGdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkodGFzay5leHRlbnNpb24sIHVuaW5zdGFsbE9wdGlvbnMpLCB0YXNrKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdVbmluc3RhbGxpbmcgZXh0ZW5zaW9uIGZyb20gdGhlIHByb2ZpbGU6JywgYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9QCR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259YCwgdW5pbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLl9vblVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByb2ZpbGVMb2NhdGlvbjogdW5pbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIGFwcGxpY2F0aW9uU2NvcGVkOiBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCB9KTtcblx0XHRcdGFsbFRhc2tzLnB1c2goeyB0YXNrLCBpbnN0YWxsVGFza1RvV2FpdEZvciB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcG9zdFVuaW5zdGFsbEV4dGVuc2lvbiA9IChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIGVycm9yPzogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gdW5pbnN0YWxsIGV4dGVuc2lvbiBmcm9tIHRoZSBwcm9maWxlOicsIGAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfUAke2V4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9ufWAsIHVuaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCksIGVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N1Y2Nlc3NmdWxseSB1bmluc3RhbGxlZCBleHRlbnNpb24gZnJvbSB0aGUgcHJvZmlsZScsIGAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfUAke2V4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9ufWAsIHVuaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdFx0cmVwb3J0VGVsZW1ldHJ5KHRoaXMudGVsZW1ldHJ5U2VydmljZSwgJ2V4dGVuc2lvbkdhbGxlcnk6dW5pbnN0YWxsJywgeyBleHRlbnNpb25EYXRhOiBnZXRMb2NhbEV4dGVuc2lvblRlbGVtZXRyeURhdGEoZXh0ZW5zaW9uKSwgZXJyb3IgfSk7XG5cdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGVycm9yOiBlcnJvcj8uY29kZSwgcHJvZmlsZUxvY2F0aW9uOiB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgYXBwbGljYXRpb25TY29wZWQ6IGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBhbGxUYXNrczogeyB0YXNrOiBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFzazsgaW5zdGFsbFRhc2tUb1dhaXRGb3I/OiBJSW5zdGFsbEV4dGVuc2lvblRhc2sgfVtdID0gW107XG5cdFx0Y29uc3QgcHJvY2Vzc2VkVGFza3M6IElVbmluc3RhbGxFeHRlbnNpb25UYXNrW10gPSBbXTtcblx0XHRjb25zdCBhbHJlYWR5UmVxdWVzdGVkVW5pbnN0YWxsczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUmVtb3ZlOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uc01hcCA9IG5ldyBSZXNvdXJjZU1hcDxJTG9jYWxFeHRlbnNpb25bXT4oKTtcblx0XHRjb25zdCBnZXRJbnN0YWxsZWRFeHRlbnNpb25zID0gYXN5bmMgKHByb2ZpbGVMb2NhdGlvbjogVVJJKSA9PiB7XG5cdFx0XHRsZXQgaW5zdGFsbGVkID0gaW5zdGFsbGVkRXh0ZW5zaW9uc01hcC5nZXQocHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdGlmICghaW5zdGFsbGVkKSB7XG5cdFx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnNNYXAuc2V0KHByb2ZpbGVMb2NhdGlvbiwgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBwcm9maWxlTG9jYXRpb24pKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YWxsZWQ7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgeyBleHRlbnNpb24sIG9wdGlvbnMgfSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCB1bmluc3RhbGxPcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCA/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIDogb3B0aW9ucz8ucHJvZmlsZUxvY2F0aW9uID8/IHRoaXMuZ2V0Q3VycmVudEV4dGVuc2lvbnNNYW5pZmVzdExvY2F0aW9uKClcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1bmluc3RhbGxFeHRlbnNpb25UYXNrID0gdGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmdldChnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KGV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9ucykpO1xuXHRcdFx0aWYgKHVuaW5zdGFsbEV4dGVuc2lvblRhc2spIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbnMgaXMgYWxyZWFkeSByZXF1ZXN0ZWQgdG8gdW5pbnN0YWxsJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRhbHJlYWR5UmVxdWVzdGVkVW5pbnN0YWxscy5wdXNoKHVuaW5zdGFsbEV4dGVuc2lvblRhc2sud2FpdFVudGlsVGFza0lzRmluaXNoZWQoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjcmVhdGVVbmluc3RhbGxFeHRlbnNpb25UYXNrKGV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1bmluc3RhbGxPcHRpb25zLnJlbW92ZSB8fCBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRpZiAodW5pbnN0YWxsT3B0aW9ucy5yZW1vdmUpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zVG9SZW1vdmUucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCBnZXRJbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCBwcm9maWxlRXh0ZW5zaW9uID0gaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGVFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVuaW5zdGFsbE9wdGlvbnNXaXRoUHJvZmlsZSA9IHsgLi4udW5pbnN0YWxsT3B0aW9ucywgcHJvZmlsZUxvY2F0aW9uOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSB9O1xuXHRcdFx0XHRcdFx0Y29uc3QgdW5pbnN0YWxsRXh0ZW5zaW9uVGFzayA9IHRoaXMudW5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5nZXQoZ2V0VW5pbnN0YWxsRXh0ZW5zaW9uVGFza0tleShwcm9maWxlRXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zV2l0aFByb2ZpbGUpKTtcblx0XHRcdFx0XHRcdGlmICh1bmluc3RhbGxFeHRlbnNpb25UYXNrKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdFeHRlbnNpb25zIGlzIGFscmVhZHkgcmVxdWVzdGVkIHRvIHVuaW5zdGFsbCcsIHByb2ZpbGVFeHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdGFscmVhZHlSZXF1ZXN0ZWRVbmluc3RhbGxzLnB1c2godW5pbnN0YWxsRXh0ZW5zaW9uVGFzay53YWl0VW50aWxUYXNrSXNGaW5pc2hlZCgpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2socHJvZmlsZUV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9uc1dpdGhQcm9maWxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2sgfSBvZiBhbGxUYXNrcy5zbGljZSgwKSkge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCBnZXRJbnN0YWxsZWRFeHRlbnNpb25zKHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXG5cdFx0XHRcdGlmICh0YXNrLm9wdGlvbnMuZG9ub3RJbmNsdWRlUGFjaykge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdVbmluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbiB3aXRob3V0IGluY2x1ZGluZyBwYWNrZWQgZXh0ZW5zaW9uJywgYCR7dGFzay5leHRlbnNpb24uaWRlbnRpZmllci5pZH1AJHt0YXNrLmV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9ufWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHBhY2tlZEV4dGVuc2lvbnMgPSB0aGlzLmdldEFsbFBhY2tFeHRlbnNpb25zVG9Vbmluc3RhbGwodGFzay5leHRlbnNpb24sIGluc3RhbGxlZCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwYWNrZWRFeHRlbnNpb24gb2YgcGFja2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudW5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5oYXMoZ2V0VW5pbnN0YWxsRXh0ZW5zaW9uVGFza0tleShwYWNrZWRFeHRlbnNpb24sIHRhc2sub3B0aW9ucykpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdFeHRlbnNpb25zIGlzIGFscmVhZHkgcmVxdWVzdGVkIHRvIHVuaW5zdGFsbCcsIHBhY2tlZEV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2socGFja2VkRXh0ZW5zaW9uLCB0YXNrLm9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGFzay5vcHRpb25zLmRvbm90Q2hlY2tEZXBlbmRlbnRzKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VuaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uIHdpdGhvdXQgY2hlY2tpbmcgZGVwZW5kZW50cycsIGAke3Rhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9QCR7dGFzay5leHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbn1gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNoZWNrRm9yRGVwZW5kZW50cyhhbGxUYXNrcy5tYXAoKHsgdGFzayB9KSA9PiB0YXNrLmV4dGVuc2lvbiksIGluc3RhbGxlZCwgdGFzay5leHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVuaW5zdGFsbCBleHRlbnNpb25zIGluIHBhcmFsbGVsIGFuZCB3YWl0IHVudGlsIGFsbCBleHRlbnNpb25zIGFyZSB1bmluc3RhbGxlZCAvIGZhaWxlZFxuXHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZChhbGxUYXNrcy5tYXAoYXN5bmMgKHsgdGFzaywgaW5zdGFsbFRhc2tUb1dhaXRGb3IgfSkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFdhaXQgZm9yIG9wcG9zaXRlIHRhc2sgaWYgaXQgZXhpc3RzXG5cdFx0XHRcdFx0aWYgKGluc3RhbGxUYXNrVG9XYWl0Rm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnV2FpdGluZyBmb3IgZXhpc3RpbmcgaW5zdGFsbCB0YXNrIHRvIGNvbXBsZXRlIGJlZm9yZSB1bmluc3RhbGxpbmcnLCB0YXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGluc3RhbGxUYXNrVG9XYWl0Rm9yLndhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdGaW5pc2hlZCB3YWl0aW5nIGZvciBpbnN0YWxsIHRhc2ssIHByb2NlZWRpbmcgd2l0aCB1bmluc3RhbGwnLCB0YXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdJbnN0YWxsIHRhc2sgZmFpbGVkLCBwcm9jZWVkaW5nIHdpdGggdW5pbnN0YWxsIGFueXdheScsIHRhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGF3YWl0IHRhc2sucnVuKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZCh0aGlzLnBhcnRpY2lwYW50cy5tYXAocGFydGljaXBhbnQgPT4gcGFydGljaXBhbnQucG9zdFVuaW5zdGFsbCh0YXNrLmV4dGVuc2lvbiwgdGFzay5vcHRpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkpO1xuXHRcdFx0XHRcdC8vIG9ubHkgcmVwb3J0IGlmIGV4dGVuc2lvbiBoYXMgYSBtYXBwZWQgZ2FsbGVyeSBleHRlbnNpb24gYW5kIG5vdCBpbiB3ZWIuIFVVSUQgaWRlbnRpZmllcyB0aGUgZ2FsbGVyeSBleHRlbnNpb24uXG5cdFx0XHRcdFx0aWYgKHRhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCAmJiAhaXNXZWIpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UucmVwb3J0U3RhdGlzdGljKHRhc2suZXh0ZW5zaW9uLm1hbmlmZXN0LnB1Ymxpc2hlciwgdGFzay5leHRlbnNpb24ubWFuaWZlc3QubmFtZSwgdGFzay5leHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgU3RhdGlzdGljVHlwZS5Vbmluc3RhbGwpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGUpO1xuXHRcdFx0XHRcdHBvc3RVbmluc3RhbGxFeHRlbnNpb24odGFzay5leHRlbnNpb24sIHRhc2sub3B0aW9ucywgZXJyb3IpO1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHByb2Nlc3NlZFRhc2tzLnB1c2godGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKGFscmVhZHlSZXF1ZXN0ZWRVbmluc3RhbGxzLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKGFscmVhZHlSZXF1ZXN0ZWRVbmluc3RhbGxzKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2sgfSBvZiBhbGxUYXNrcykge1xuXHRcdFx0XHRwb3N0VW5pbnN0YWxsRXh0ZW5zaW9uKHRhc2suZXh0ZW5zaW9uLCB0YXNrLm9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKGV4dGVuc2lvbnNUb1JlbW92ZS5tYXAoZXh0ZW5zaW9uID0+IHRoaXMuZGVsZXRlRXh0ZW5zaW9uKGV4dGVuc2lvbikpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGUpO1xuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2sgfSBvZiBhbGxUYXNrcykge1xuXHRcdFx0XHQvLyBjYW5jZWwgdGhlIHRhc2tzXG5cdFx0XHRcdHRyeSB7IHRhc2suY2FuY2VsKCk7IH0gY2F0Y2ggKGVycm9yKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHRcdGlmICghcHJvY2Vzc2VkVGFza3MuaW5jbHVkZXModGFzaykpIHtcblx0XHRcdFx0XHRwb3N0VW5pbnN0YWxsRXh0ZW5zaW9uKHRhc2suZXh0ZW5zaW9uLCB0YXNrLm9wdGlvbnMsIGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIFJlbW92ZSB0YXNrcyBmcm9tIGNhY2hlXG5cdFx0XHRmb3IgKGNvbnN0IHsgdGFzayB9IG9mIGFsbFRhc2tzKSB7XG5cdFx0XHRcdGlmICghdGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmRlbGV0ZShnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KHRhc2suZXh0ZW5zaW9uLCB0YXNrLm9wdGlvbnMpKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdVbmluc3RhbGxhdGlvbiB0YXNrIGlzIG5vdCBmb3VuZCBpbiB0aGUgY2FjaGUnLCB0YXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2hlY2tGb3JEZXBlbmRlbnRzKGV4dGVuc2lvbnNUb1VuaW5zdGFsbDogSUxvY2FsRXh0ZW5zaW9uW10sIGluc3RhbGxlZDogSUxvY2FsRXh0ZW5zaW9uW10sIGV4dGVuc2lvblRvVW5pbnN0YWxsOiBJTG9jYWxFeHRlbnNpb24pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zVG9Vbmluc3RhbGwpIHtcblx0XHRcdGNvbnN0IGRlcGVuZGVudHMgPSB0aGlzLmdldERlcGVuZGVudHMoZXh0ZW5zaW9uLCBpbnN0YWxsZWQpO1xuXHRcdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZ0RlcGVuZGVudHMgPSBkZXBlbmRlbnRzLmZpbHRlcihkZXBlbmRlbnQgPT4gIWV4dGVuc2lvbnNUb1VuaW5zdGFsbC5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBkZXBlbmRlbnQuaWRlbnRpZmllcikpKTtcblx0XHRcdFx0aWYgKHJlbWFpbmluZ0RlcGVuZGVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuZ2V0RGVwZW5kZW50c0Vycm9yTWVzc2FnZShleHRlbnNpb24sIHJlbWFpbmluZ0RlcGVuZGVudHMsIGV4dGVuc2lvblRvVW5pbnN0YWxsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERlcGVuZGVudHNFcnJvck1lc3NhZ2UoZGVwZW5kaW5nRXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGRlcGVuZGVudHM6IElMb2NhbEV4dGVuc2lvbltdLCBleHRlbnNpb25Ub1VuaW5zdGFsbDogSUxvY2FsRXh0ZW5zaW9uKTogc3RyaW5nIHtcblx0XHRpZiAoZXh0ZW5zaW9uVG9Vbmluc3RhbGwgPT09IGRlcGVuZGluZ0V4dGVuc2lvbikge1xuXHRcdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NpbmdsZURlcGVuZGVudEVycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsICd7MH0nIGV4dGVuc2lvbi4gJ3sxfScgZXh0ZW5zaW9uIGRlcGVuZHMgb24gdGhpcy5cIixcblx0XHRcdFx0XHRleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndHdvRGVwZW5kZW50c0Vycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsICd7MH0nIGV4dGVuc2lvbi4gJ3sxfScgYW5kICd7Mn0nIGV4dGVuc2lvbnMgZGVwZW5kIG9uIHRoaXMuXCIsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ211bHRpcGxlRGVwZW5kZW50c0Vycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsICd7MH0nIGV4dGVuc2lvbi4gJ3sxfScsICd7Mn0nIGFuZCBvdGhlciBleHRlbnNpb24gZGVwZW5kIG9uIHRoaXMuXCIsXG5cdFx0XHRcdGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMV0ubWFuaWZlc3QubmFtZSk7XG5cdFx0fVxuXHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc2luZ2xlSW5kaXJlY3REZXBlbmRlbnRFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24gLiBJdCBpbmNsdWRlcyB1bmluc3RhbGxpbmcgJ3sxfScgZXh0ZW5zaW9uIGFuZCAnezJ9JyBleHRlbnNpb24gZGVwZW5kcyBvbiB0aGlzLlwiLFxuXHRcdFx0XHRleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5uYW1lLCBkZXBlbmRpbmdFeHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWVcblx0XHRcdHx8IGRlcGVuZGluZ0V4dGVuc2lvbi5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSk7XG5cdFx0fVxuXHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndHdvSW5kaXJlY3REZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uLiBJdCBpbmNsdWRlcyB1bmluc3RhbGxpbmcgJ3sxfScgZXh0ZW5zaW9uIGFuZCAnezJ9JyBhbmQgJ3szfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy5cIixcblx0XHRcdFx0ZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QubmFtZSwgZGVwZW5kaW5nRXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lXG5cdFx0XHR8fCBkZXBlbmRpbmdFeHRlbnNpb24ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5uYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbXVsdGlwbGVJbmRpcmVjdERlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24uIEl0IGluY2x1ZGVzIHVuaW5zdGFsbGluZyAnezF9JyBleHRlbnNpb24gYW5kICd7Mn0nLCAnezN9JyBhbmQgb3RoZXIgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy5cIixcblx0XHRcdGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGluZ0V4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZVxuXHRcdHx8IGRlcGVuZGluZ0V4dGVuc2lvbi5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0Lm5hbWUpO1xuXG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFBhY2tFeHRlbnNpb25zVG9Vbmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGluc3RhbGxlZDogSUxvY2FsRXh0ZW5zaW9uW10sIGNoZWNrZWQ6IElMb2NhbEV4dGVuc2lvbltdID0gW10pOiBJTG9jYWxFeHRlbnNpb25bXSB7XG5cdFx0aWYgKGNoZWNrZWQuaW5kZXhPZihleHRlbnNpb24pICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50ICYmIGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB7IGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQuZXh0ZW5zaW9uSWQgfSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y2hlY2tlZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1BhY2sgPSBleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uUGFjayA/IGV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25QYWNrIDogW107XG5cdFx0aWYgKGV4dGVuc2lvbnNQYWNrLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcGFja2VkRXh0ZW5zaW9ucyA9IGluc3RhbGxlZC5maWx0ZXIoaSA9PiAhaS5pc0J1aWx0aW4gJiYgZXh0ZW5zaW9uc1BhY2suc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGkuaWRlbnRpZmllcikpKTtcblx0XHRcdGNvbnN0IHBhY2tPZlBhY2tlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHBhY2tlZEV4dGVuc2lvbiBvZiBwYWNrZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHBhY2tPZlBhY2tlZEV4dGVuc2lvbnMucHVzaCguLi50aGlzLmdldEFsbFBhY2tFeHRlbnNpb25zVG9Vbmluc3RhbGwocGFja2VkRXh0ZW5zaW9uLCBpbnN0YWxsZWQsIGNoZWNrZWQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbLi4ucGFja2VkRXh0ZW5zaW9ucywgLi4ucGFja09mUGFja2VkRXh0ZW5zaW9uc107XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwZW5kZW50cyhleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgaW5zdGFsbGVkOiBJTG9jYWxFeHRlbnNpb25bXSk6IElMb2NhbEV4dGVuc2lvbltdIHtcblx0XHRyZXR1cm4gaW5zdGFsbGVkLmZpbHRlcihlID0+IGUubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzICYmIGUubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ29udHJvbENhY2hlKCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51cGRhdGVDb250cm9sQ2FjaGUnKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucmVmcmVzaENvbnRyb2xDYWNoZSAtIGZhaWxlZCB0byBnZXQgZXh0ZW5zaW9uIGNvbnRyb2wgbWFuaWZlc3QnLCBnZXRFcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRyZXR1cm4geyBtYWxpY2lvdXM6IFtdLCBkZXByZWNhdGVkOiB7fSwgc2VhcmNoOiBbXSB9O1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKTogVVJJO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgY3JlYXRlSW5zdGFsbEV4dGVuc2lvblRhc2sobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZXh0ZW5zaW9uOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSUluc3RhbGxFeHRlbnNpb25UYXNrO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgY3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMpOiBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFzaztcblx0cHJvdGVjdGVkIGFic3RyYWN0IGNvcHlFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE/OiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IG1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE/OiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGRlbGV0ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvcjogRXJyb3IsIGNvZGU/OiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlKTogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yIHtcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKSB7XG5cdFx0cmV0dXJuIGVycm9yO1xuXHR9XG5cdGxldCBleHRlbnNpb25NYW5hZ2VtZW50RXJyb3I6IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcjtcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKSB7XG5cdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yID0gbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvci5tZXNzYWdlLCBlcnJvci5jb2RlID09PSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkRvd25sb2FkRmFpbGVkV3JpdGluZyA/IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuRG93bmxvYWRGYWlsZWRXcml0aW5nIDogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5HYWxsZXJ5KTtcblx0fSBlbHNlIHtcblx0XHRleHRlbnNpb25NYW5hZ2VtZW50RXJyb3IgPSBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLm1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpID8gRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5DYW5jZWxsZWQgOiAoY29kZSA/PyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkludGVybmFsKSk7XG5cdH1cblx0ZXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLnN0YWNrID0gZXJyb3Iuc3RhY2s7XG5cdHJldHVybiBleHRlbnNpb25NYW5hZ2VtZW50RXJyb3I7XG59XG5cbmZ1bmN0aW9uIHJlcG9ydFRlbGVtZXRyeSh0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSwgZXZlbnROYW1lOiBzdHJpbmcsXG5cdHtcblx0XHRleHRlbnNpb25EYXRhLFxuXHRcdHZlcmlmaWNhdGlvblN0YXR1cyxcblx0XHRkdXJhdGlvbixcblx0XHRlcnJvcixcblx0XHRzb3VyY2UsXG5cdFx0ZHVyYXRpb25TaW5jZVVwZGF0ZVxuXHR9OiB7XG5cdFx0ZXh0ZW5zaW9uRGF0YTogb2JqZWN0O1xuXHRcdHZlcmlmaWNhdGlvblN0YXR1cz86IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGU7XG5cdFx0ZHVyYXRpb24/OiBudW1iZXI7XG5cdFx0ZHVyYXRpb25TaW5jZVVwZGF0ZT86IG51bWJlcjtcblx0XHRzb3VyY2U/OiBzdHJpbmc7XG5cdFx0ZXJyb3I/OiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IgfCBFeHRlbnNpb25HYWxsZXJ5RXJyb3I7XG5cdH0pOiB2b2lkIHtcblxuXHQvKiBfX0dEUFJfX1xuXHRcdFwiZXh0ZW5zaW9uR2FsbGVyeTppbnN0YWxsXCIgOiB7XG5cdFx0XHRcIm93bmVyXCI6IFwic2FuZHkwODFcIixcblx0XHRcdFwic3VjY2Vzc1wiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFx0XCJkdXJhdGlvblwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiZHVyYXRpb25TaW5jZVVwZGF0ZVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiZXJyb3Jjb2RlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIkNhbGxzdGFja09yRXhjZXB0aW9uXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIgfSxcblx0XHRcdFwicmVjb21tZW5kYXRpb25SZWFzb25cIjogeyBcInJldGlyZWRGcm9tVmVyc2lvblwiOiBcIjEuMjMuMFwiLCBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwidmVyaWZpY2F0aW9uU3RhdHVzXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiIH0sXG5cdFx0XHRcInNvdXJjZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiIH0sXG5cdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcIiR7R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGF9XCJcblx0XHRcdF1cblx0XHR9XG5cdCovXG5cdC8qIF9fR0RQUl9fXG5cdFx0XCJleHRlbnNpb25HYWxsZXJ5OnVuaW5zdGFsbFwiIDoge1xuXHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcInN1Y2Nlc3NcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiZHVyYXRpb25cIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImVycm9yY29kZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJDYWxsc3RhY2tPckV4Y2VwdGlvblwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiIH0sXG5cdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcIiR7R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGF9XCJcblx0XHRcdF1cblx0XHR9XG5cdCovXG5cdC8qIF9fR0RQUl9fXG5cdFx0XCJleHRlbnNpb25HYWxsZXJ5OnVwZGF0ZVwiIDoge1xuXHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcInN1Y2Nlc3NcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiZHVyYXRpb25cIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImVycm9yY29kZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJDYWxsc3RhY2tPckV4Y2VwdGlvblwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiIH0sXG5cdFx0XHRcInZlcmlmaWNhdGlvblN0YXR1c1wiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XCJzb3VyY2VcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XCIke0dhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhfVwiXG5cdFx0XHRdXG5cdFx0fVxuXHQqL1xuXHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZyhldmVudE5hbWUsIHtcblx0XHQuLi5leHRlbnNpb25EYXRhLFxuXHRcdHNvdXJjZSxcblx0XHRkdXJhdGlvbixcblx0XHRkdXJhdGlvblNpbmNlVXBkYXRlLFxuXHRcdHN1Y2Nlc3M6ICFlcnJvcixcblx0XHRlcnJvcmNvZGU6IGVycm9yPy5jb2RlLFxuXHRcdHZlcmlmaWNhdGlvblN0YXR1czogdmVyaWZpY2F0aW9uU3RhdHVzID09PSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlN1Y2Nlc3MgPyAnVmVyaWZpZWQnIDogKHZlcmlmaWNhdGlvblN0YXR1cyA/PyAnVW52ZXJpZmllZCcpXG5cdH0pO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25UYXNrPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRwcml2YXRlIGNhbmNlbGxhYmxlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8VD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgd2FpdFVudGlsVGFza0lzRmluaXNoZWQoKTogUHJvbWlzZTxUPiB7XG5cdFx0YXdhaXQgdGhpcy5iYXJyaWVyLndhaXQoKTtcblx0XHRyZXR1cm4gdGhpcy5jYW5jZWxsYWJsZVByb21pc2UhO1xuXHR9XG5cblx0cnVuKCk6IFByb21pc2U8VD4ge1xuXHRcdGlmICghdGhpcy5jYW5jZWxsYWJsZVByb21pc2UpIHtcblx0XHRcdHRoaXMuY2FuY2VsbGFibGVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5kb1J1bih0b2tlbikpO1xuXHRcdH1cblx0XHR0aGlzLmJhcnJpZXIub3BlbigpO1xuXHRcdHJldHVybiB0aGlzLmNhbmNlbGxhYmxlUHJvbWlzZTtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FuY2VsbGFibGVQcm9taXNlKSB7XG5cdFx0XHR0aGlzLmNhbmNlbGxhYmxlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChjLCBlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0ZShuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmJhcnJpZXIub3BlbigpO1xuXHRcdH1cblx0XHR0aGlzLmNhbmNlbGxhYmxlUHJvbWlzZS5jYW5jZWwoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb1J1bih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsdUJBQXVCO0FBQzFDLFNBQVMsU0FBNEIsK0JBQStCO0FBQ3BFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLGlCQUFpQiwyQkFBMkI7QUFDeEUsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFlBQVks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QyxNQUFNLDBCQUFzQztBQUMzQyxVQUFNLEtBQUssUUFBUSxLQUFLO0FBQ3hCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWtCO0FBQ2pCLFFBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QixXQUFLLHFCQUFxQix3QkFBd0IsV0FBUyxLQUFLLE1BQU0sS0FBSyxDQUFDO0FBQUEsSUFDN0U7QUFDQSxTQUFLLFFBQVEsS0FBSztBQUNsQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxTQUFlO0FBQ2QsUUFBSSxDQUFDLEtBQUssb0JBQW9CO0FBQzdCLFdBQUsscUJBQXFCLHdCQUF3QixXQUFTO0FBQzFELGVBQU8sSUFBSSxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQzVCLGdCQUFNLGFBQWEsTUFBTSx3QkFBd0IsTUFBTTtBQUN0RCx1QkFBVyxRQUFRO0FBQ25CLGNBQUUsSUFBSSxrQkFBa0IsQ0FBQztBQUFBLFVBQzFCLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxXQUFLLFFBQVEsS0FBSztBQUFBLElBQ25CO0FBQ0EsU0FBSyxtQkFBbUIsT0FBTztBQUFBLEVBQ2hDO0FBR0Q7IiwKICAibmFtZXMiOiBbInJlc3VsdHMiLCAicmVzdWx0IiwgImdhbGxlcnkiLCAiZXJyb3IiLCAiZXh0ZW5zaW9uSWRlbnRpZmllciIsICJtYW5pZmVzdCIsICJ0YXNrIiwgInVuaW5zdGFsbEV4dGVuc2lvblRhc2siXQp9Cg==
