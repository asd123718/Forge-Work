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
import { Emitter, Event, EventMultiplexer } from "../../../../base/common/event.js";
import {
  IExtensionGalleryService,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  InstallOperation,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionInstallSource,
  IAllowedExtensionsService,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT
} from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionManagementServerService } from "./extensionManagement.js";
import { ExtensionType, isLanguagePackExtension, getWorkspaceSupportTypeMessage } from "../../../../platform/extensions/common/extensions.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { areSameExtensions, computeTargetPlatform } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { localize } from "../../../../nls.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IDownloadService } from "../../../../platform/download/common/download.js";
import { coalesce, distinct, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../../base/common/severity.js";
import { IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { Promises } from "../../../../base/common/async.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationError, getErrorMessage } from "../../../../base/common/errors.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IExtensionsScannerService } from "../../../../platform/extensionManagement/common/extensionsScannerService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { verifiedPublisherIcon } from "./extensionsIcons.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CommontExtensionManagementService } from "../../../../platform/extensionManagement/common/abstractExtensionManagementService.js";
const TrustedPublishersStorageKey = "extensions.trustedPublishers";
function isGalleryExtension(extension) {
  return extension.type === "gallery";
}
let ExtensionManagementService = class extends CommontExtensionManagementService {
  constructor(extensionManagementServerService, extensionGalleryService, userDataProfileService, userDataProfilesService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService, extensionsScannerService, allowedExtensionsService, storageService, telemetryService) {
    super(productService, allowedExtensionsService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.downloadService = downloadService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.dialogService = dialogService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.fileService = fileService;
    this.logService = logService;
    this.instantiationService = instantiationService;
    this.extensionsScannerService = extensionsScannerService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidProfileAwareInstallExtensions = this._register(new Emitter());
    this._onDidProfileAwareUninstallExtension = this._register(new Emitter());
    this.servers = [];
    this.defaultTrustedPublishers = productService.trustedExtensionPublishers ?? [];
    this.workspaceExtensionManagementService = this._register(this.instantiationService.createInstance(WorkspaceExtensionsManagementService));
    this.onDidEnableExtensions = this.workspaceExtensionManagementService.onDidChangeInvalidExtensions;
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.webExtensionManagementServer);
    }
    const onInstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onInstallExtensionEventMultiplexer.add(this._onInstallExtension.event));
    this.onInstallExtension = onInstallExtensionEventMultiplexer.event;
    const onDidInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidInstallExtensionsEventMultiplexer.add(this._onDidInstallExtensions.event));
    this.onDidInstallExtensions = onDidInstallExtensionsEventMultiplexer.event;
    const onDidProfileAwareInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(this._onDidProfileAwareInstallExtensions.event));
    this.onProfileAwareDidInstallExtensions = onDidProfileAwareInstallExtensionsEventMultiplexer.event;
    const onUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onUninstallExtensionEventMultiplexer.add(this._onUninstallExtension.event));
    this.onUninstallExtension = onUninstallExtensionEventMultiplexer.event;
    const onDidUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidUninstallExtensionEventMultiplexer.add(this._onDidUninstallExtension.event));
    this.onDidUninstallExtension = onDidUninstallExtensionEventMultiplexer.event;
    const onDidProfileAwareUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(this._onDidProfileAwareUninstallExtension.event));
    this.onProfileAwareDidUninstallExtension = onDidProfileAwareUninstallExtensionEventMultiplexer.event;
    const onDidUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
    this.onDidUpdateExtensionMetadata = onDidUpdateExtensionMetadaEventMultiplexer.event;
    const onDidProfileAwareUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
    this.onProfileAwareDidUpdateExtensionMetadata = onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.event;
    const onDidChangeProfileEventMultiplexer = this._register(new EventMultiplexer());
    this.onDidChangeProfile = onDidChangeProfileEventMultiplexer.event;
    for (const server of this.servers) {
      this._register(onInstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onInstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onDidInstallExtensions));
      this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidInstallExtensions));
      this._register(onUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onDidUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onProfileAwareDidUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onDidUpdateExtensionMetadata));
      this._register(onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata));
      this._register(onDidChangeProfileEventMultiplexer.add(Event.map(server.extensionManagementService.onDidChangeProfile, (e) => ({ ...e, server }))));
    }
    this._register(this.onProfileAwareDidInstallExtensions((results) => {
      const untrustedPublishers = /* @__PURE__ */ new Map();
      for (const result of results) {
        if (result.local && result.source && !URI.isUri(result.source) && !this.isPublisherTrusted(result.source)) {
          untrustedPublishers.set(result.source.publisher, { publisher: result.source.publisher, publisherDisplayName: result.source.publisherDisplayName });
        }
      }
      if (untrustedPublishers.size) {
        this.trustPublishers(...untrustedPublishers.values());
      }
    }));
  }
  async getInstalled(type, profileLocation, productVersion) {
    const result = [];
    await Promise.all(this.servers.map(async (server) => {
      const installed = await server.extensionManagementService.getInstalled(type, profileLocation, productVersion);
      if (server === this.getWorkspaceExtensionsServer()) {
        const workspaceExtensions = await this.getInstalledWorkspaceExtensions(true);
        installed.push(...workspaceExtensions);
      }
      result.push(...installed);
    }));
    return result;
  }
  uninstall(extension, options) {
    return this.uninstallExtensions([{ extension, options }]);
  }
  async uninstallExtensions(extensions) {
    const workspaceExtensions = [];
    const groupedExtensions = /* @__PURE__ */ new Map();
    const addExtensionToServer = (server, extension, options) => {
      let extensions2 = groupedExtensions.get(server);
      if (!extensions2) {
        groupedExtensions.set(server, extensions2 = []);
      }
      extensions2.push({ extension, options });
    };
    for (const { extension, options } of extensions) {
      if (extension.isWorkspaceScoped) {
        workspaceExtensions.push(extension);
        continue;
      }
      const server = this.getServer(extension);
      if (!server) {
        throw new Error(`Invalid location ${extension.location.toString()}`);
      }
      addExtensionToServer(server, extension, options);
      if (this.servers.length > 1 && isLanguagePackExtension(extension.manifest)) {
        const otherServers = this.servers.filter((s) => s !== server);
        for (const otherServer of otherServers) {
          const installed = await otherServer.extensionManagementService.getInstalled();
          const extensionInOtherServer = installed.find((i) => !i.isBuiltin && areSameExtensions(i.identifier, extension.identifier));
          if (extensionInOtherServer) {
            addExtensionToServer(otherServer, extensionInOtherServer, options);
          }
        }
      }
    }
    const promises = [];
    for (const workspaceExtension of workspaceExtensions) {
      promises.push(this.uninstallExtensionFromWorkspace(workspaceExtension));
    }
    for (const [server, extensions2] of groupedExtensions.entries()) {
      promises.push(this.uninstallInServer(server, extensions2));
    }
    const result = await Promise.allSettled(promises);
    const errors = result.filter((r) => r.status === "rejected").map((r) => r.reason);
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join("\n"));
    }
  }
  async uninstallInServer(server, extensions) {
    if (server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      for (const { extension } of extensions) {
        const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getInstalled(ExtensionType.User);
        const dependentNonUIExtensions = installedExtensions.filter((i) => !this.extensionManifestPropertiesService.prefersExecuteOnUI(i.manifest) && i.manifest.extensionDependencies && i.manifest.extensionDependencies.some((id) => areSameExtensions({ id }, extension.identifier)));
        if (dependentNonUIExtensions.length) {
          throw new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions));
        }
      }
    }
    return server.extensionManagementService.uninstallExtensions(extensions);
  }
  getDependentsErrorMessage(extension, dependents) {
    if (dependents.length === 1) {
      return localize(
        "singleDependentError",
        "Cannot uninstall extension '{0}'. Extension '{1}' depends on this.",
        extension.manifest.displayName || extension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name
      );
    }
    if (dependents.length === 2) {
      return localize(
        "twoDependentsError",
        "Cannot uninstall extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
        extension.manifest.displayName || extension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    return localize(
      "multipleDependentsError",
      "Cannot uninstall extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
      extension.manifest.displayName || extension.manifest.name,
      dependents[0].manifest.displayName || dependents[0].manifest.name,
      dependents[1].manifest.displayName || dependents[1].manifest.name
    );
  }
  updateMetadata(extension, metadata) {
    const server = this.getServer(extension);
    if (server) {
      const profile = extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile : this.userDataProfileService.currentProfile;
      return server.extensionManagementService.updateMetadata(extension, metadata, profile.extensionsResource);
    }
    return Promise.reject(`Invalid location ${extension.location.toString()}`);
  }
  async resetPinnedStateForAllUserExtensions(pinned) {
    await Promise.allSettled(this.servers.map((server) => server.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned)));
  }
  zip(extension) {
    const server = this.getServer(extension);
    if (server) {
      return server.extensionManagementService.zip(extension);
    }
    return Promise.reject(`Invalid location ${extension.location.toString()}`);
  }
  download(extension, operation, donotVerifySignature) {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.download(extension, operation, donotVerifySignature);
    }
    throw new Error("Cannot download extension");
  }
  async install(vsix, options) {
    const manifest = await this.getManifest(vsix);
    return this.installVSIX(vsix, manifest, options);
  }
  async installVSIX(vsix, manifest, options) {
    const serversToInstall = this.getServersToInstall(manifest);
    if (serversToInstall?.length) {
      await this.checkForWorkspaceTrust(manifest, false);
      const [local] = await Promises.settled(serversToInstall.map((server) => this.installVSIXInServer(vsix, server, options)));
      return local;
    }
    return Promise.reject("No Servers to Install");
  }
  getServersToInstall(manifest) {
    if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      if (isLanguagePackExtension(manifest)) {
        return [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer];
      }
      if (this.extensionManifestPropertiesService.prefersExecuteOnUI(manifest)) {
        return [this.extensionManagementServerService.localExtensionManagementServer];
      }
      return [this.extensionManagementServerService.remoteExtensionManagementServer];
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return [this.extensionManagementServerService.localExtensionManagementServer];
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return [this.extensionManagementServerService.remoteExtensionManagementServer];
    }
    return void 0;
  }
  async installFromLocation(location) {
    if (location.scheme === Schemas.file) {
      if (this.extensionManagementServerService.localExtensionManagementServer) {
        return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
      }
      throw new Error("Local extension management server is not found");
    }
    if (location.scheme === Schemas.vscodeRemote) {
      if (this.extensionManagementServerService.remoteExtensionManagementServer) {
        return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
      }
      throw new Error("Remote extension management server is not found");
    }
    if (!this.extensionManagementServerService.webExtensionManagementServer) {
      throw new Error("Web extension management server is not found");
    }
    return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
  }
  installVSIXInServer(vsix, server, options) {
    return server.extensionManagementService.install(vsix, options);
  }
  getManifest(vsix) {
    if (vsix.scheme === Schemas.file && this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    if (vsix.scheme === Schemas.file && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    if (vsix.scheme === Schemas.vscodeRemote && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    return Promise.reject("No Servers");
  }
  async canInstall(extension) {
    if (isGalleryExtension(extension)) {
      return this.canInstallGalleryExtension(extension);
    }
    return this.canInstallResourceExtension(extension);
  }
  async canInstallGalleryExtension(gallery) {
    if (this.extensionManagementServerService.localExtensionManagementServer && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
      return true;
    }
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      return new MarkdownString().appendText(localize("manifest is not found", "Manifest is not found"));
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer && await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.canInstall(gallery) === true && this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
      return true;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer && await this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.canInstall(gallery) === true && this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
      return true;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
  }
  async canInstallResourceExtension(extension) {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return true;
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(extension.manifest)) {
      return true;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
      return true;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.manifest.displayName ?? extension.identifier.id));
  }
  async updateFromGallery(gallery, extension, installOptions) {
    const server = this.getServer(extension);
    if (!server) {
      return Promise.reject(`Invalid location ${extension.location.toString()}`);
    }
    const servers = [];
    if (isLanguagePackExtension(extension.manifest)) {
      servers.push(...this.servers.filter((server2) => server2 !== this.extensionManagementServerService.webExtensionManagementServer));
    } else {
      servers.push(server);
    }
    installOptions = { ...installOptions || {}, isApplicationScoped: extension.isApplicationScoped };
    return Promises.settled(servers.map((server2) => server2.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
  }
  async installGalleryExtensions(extensions) {
    const results = /* @__PURE__ */ new Map();
    const extensionsByServer = /* @__PURE__ */ new Map();
    const manifests = await Promise.all(extensions.map(async ({ extension }) => {
      const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
      if (!manifest) {
        throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
      }
      return manifest;
    }));
    if (extensions.some((e) => e.options?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true)) {
      await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
    }
    await Promise.all(extensions.map(async ({ extension, options }) => {
      try {
        const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
        if (!manifest) {
          throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
        }
        if (options?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
          await this.checkForWorkspaceTrust(manifest, false);
          if (!options?.donotIncludePackAndDependencies) {
            await this.checkInstallingExtensionOnWeb(extension, manifest);
          }
        }
        const servers = await this.getExtensionManagementServersToInstall(extension, manifest);
        if (!options.isMachineScoped && this.isExtensionsSyncEnabled()) {
          if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(extension) === true) {
            servers.push(this.extensionManagementServerService.localExtensionManagementServer);
          }
        }
        for (const server of servers) {
          let exensions = extensionsByServer.get(server);
          if (!exensions) {
            extensionsByServer.set(server, exensions = []);
          }
          exensions.push({ extension, options });
        }
      } catch (error) {
        results.set(extension.identifier.id.toLowerCase(), {
          identifier: extension.identifier,
          source: extension,
          error,
          operation: InstallOperation.Install,
          profileLocation: options.profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource
        });
      }
    }));
    await Promise.all([...extensionsByServer.entries()].map(async ([server, extensions2]) => {
      const serverResults = await server.extensionManagementService.installGalleryExtensions(extensions2);
      for (const result of serverResults) {
        results.set(result.identifier.id.toLowerCase(), result);
      }
    }));
    return [...results.values()];
  }
  async installFromGallery(gallery, installOptions, servers) {
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
    }
    if (installOptions?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true) {
      await this.checkForTrustedPublishers([{ extension: gallery, manifest, checkForPackAndDependencies: !installOptions?.donotIncludePackAndDependencies }]);
    }
    if (installOptions?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
      await this.checkForWorkspaceTrust(manifest, false);
      if (!installOptions?.donotIncludePackAndDependencies) {
        await this.checkInstallingExtensionOnWeb(gallery, manifest);
      }
    }
    servers = servers?.length ? this.validServers(gallery, manifest, servers) : await this.getExtensionManagementServersToInstall(gallery, manifest);
    if (!installOptions || isUndefined(installOptions.isMachineScoped)) {
      const isMachineScoped = await this.hasToFlagExtensionsMachineScoped([gallery]);
      installOptions = { ...installOptions || {}, isMachineScoped };
    }
    if (!installOptions.isMachineScoped && this.isExtensionsSyncEnabled()) {
      if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
        servers.push(this.extensionManagementServerService.localExtensionManagementServer);
      }
    }
    return Promises.settled(servers.map((server) => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
  }
  async getExtensions(locations) {
    const scannedExtensions = await this.extensionsScannerService.scanMultipleExtensions(locations, ExtensionType.User, { includeInvalid: true });
    const result = [];
    await Promise.all(scannedExtensions.map(async (scannedExtension) => {
      const workspaceExtension = await this.workspaceExtensionManagementService.toLocalWorkspaceExtension(scannedExtension);
      if (workspaceExtension) {
        result.push({
          type: "resource",
          identifier: workspaceExtension.identifier,
          location: workspaceExtension.location,
          manifest: workspaceExtension.manifest,
          changelogUri: workspaceExtension.changelogUrl,
          readmeUri: workspaceExtension.readmeUrl
        });
      }
    }));
    return result;
  }
  getInstalledWorkspaceExtensionLocations() {
    return this.workspaceExtensionManagementService.getInstalledWorkspaceExtensionsLocations();
  }
  async getInstalledWorkspaceExtensions(includeInvalid) {
    return this.workspaceExtensionManagementService.getInstalled(includeInvalid);
  }
  async installResourceExtension(extension, installOptions) {
    if (!this.canInstallResourceExtension(extension)) {
      throw new Error("This extension cannot be installed in the current workspace.");
    }
    if (!installOptions.isWorkspaceScoped) {
      return this.installFromLocation(extension.location);
    }
    this.logService.info(`Installing the extension ${extension.identifier.id} from ${extension.location.toString()} in workspace`);
    const server = this.getWorkspaceExtensionsServer();
    this._onInstallExtension.fire({
      identifier: extension.identifier,
      source: extension.location,
      server,
      applicationScoped: false,
      profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
      workspaceScoped: true
    });
    try {
      await this.checkForWorkspaceTrust(extension.manifest, true);
      const workspaceExtension = await this.workspaceExtensionManagementService.install(extension);
      this.logService.info(`Successfully installed the extension ${workspaceExtension.identifier.id} from ${extension.location.toString()} in the workspace`);
      this._onDidInstallExtensions.fire([{
        identifier: workspaceExtension.identifier,
        source: extension.location,
        operation: InstallOperation.Install,
        applicationScoped: false,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
        local: workspaceExtension,
        workspaceScoped: true
      }]);
      return workspaceExtension;
    } catch (error) {
      this.logService.error(`Failed to install the extension ${extension.identifier.id} from ${extension.location.toString()} in the workspace`, getErrorMessage(error));
      this._onDidInstallExtensions.fire([{
        identifier: extension.identifier,
        source: extension.location,
        operation: InstallOperation.Install,
        applicationScoped: false,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
        error,
        workspaceScoped: true
      }]);
      throw error;
    }
  }
  async getInstallableServers(gallery) {
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      return Promise.reject(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
    }
    return this.getInstallableExtensionManagementServers(manifest);
  }
  async uninstallExtensionFromWorkspace(extension) {
    if (!extension.isWorkspaceScoped) {
      throw new Error("The extension is not a workspace extension");
    }
    this.logService.info(`Uninstalling the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
    const server = this.getWorkspaceExtensionsServer();
    this._onUninstallExtension.fire({
      identifier: extension.identifier,
      server,
      applicationScoped: false,
      workspaceScoped: true,
      profileLocation: this.userDataProfileService.currentProfile.extensionsResource
    });
    try {
      await this.workspaceExtensionManagementService.uninstall(extension);
      this.logService.info(`Successfully uninstalled the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
      this.telemetryService.publicLog2("workspaceextension:uninstall");
      this._onDidUninstallExtension.fire({
        identifier: extension.identifier,
        server,
        applicationScoped: false,
        workspaceScoped: true,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource
      });
    } catch (error) {
      this.logService.error(`Failed to uninstall the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`, getErrorMessage(error));
      this._onDidUninstallExtension.fire({
        identifier: extension.identifier,
        server,
        error,
        applicationScoped: false,
        workspaceScoped: true,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource
      });
      throw error;
    }
  }
  validServers(gallery, manifest, servers) {
    const installableServers = this.getInstallableExtensionManagementServers(manifest);
    for (const server of servers) {
      if (!installableServers.includes(server)) {
        const error = new Error(localize("cannot be installed in server", "Cannot install the '{0}' extension because it is not available in the '{1}' setup.", gallery.displayName || gallery.name, server.label));
        error.name = ExtensionManagementErrorCode.Unsupported;
        throw error;
      }
    }
    return servers;
  }
  async getExtensionManagementServersToInstall(gallery, manifest) {
    const servers = [];
    if (isLanguagePackExtension(manifest)) {
      servers.push(...this.servers.filter((server) => server !== this.extensionManagementServerService.webExtensionManagementServer));
    } else {
      const [server] = this.getInstallableExtensionManagementServers(manifest);
      if (server) {
        servers.push(server);
      }
    }
    if (!servers.length) {
      const error = new Error(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
      error.name = ExtensionManagementErrorCode.Unsupported;
      throw error;
    }
    return servers;
  }
  getInstallableExtensionManagementServers(manifest) {
    if (this.servers.length === 1 && this.extensionManagementServerService.localExtensionManagementServer) {
      return [this.extensionManagementServerService.localExtensionManagementServer];
    }
    const servers = [];
    const extensionKind = this.extensionManifestPropertiesService.getExtensionKind(manifest);
    for (const kind of extensionKind) {
      if (kind === "ui" && this.extensionManagementServerService.localExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.localExtensionManagementServer);
      }
      if (kind === "workspace" && this.extensionManagementServerService.remoteExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
      }
      if (kind === "web" && this.extensionManagementServerService.webExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.webExtensionManagementServer);
      }
    }
    if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)) {
      servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    return servers;
  }
  isExtensionsSyncEnabled() {
    return this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
  }
  async hasToFlagExtensionsMachineScoped(extensions) {
    if (this.isExtensionsSyncEnabled()) {
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message: extensions.length === 1 ? localize("install extension", "Install Extension") : localize("install extensions", "Install Extensions"),
        detail: extensions.length === 1 ? localize("install single extension", "Would you like to install and synchronize '{0}' extension across your devices?", extensions[0].displayName) : localize("install multiple extensions", "Would you like to install and synchronize extensions across your devices?"),
        buttons: [
          {
            label: localize({ key: "install", comment: ["&& denotes a mnemonic"] }, "&&Install"),
            run: () => false
          },
          {
            label: localize({ key: "install and do no sync", comment: ["&& denotes a mnemonic"] }, "Install (Do &&not sync)"),
            run: () => true
          }
        ],
        cancelButton: {
          run: () => {
            throw new CancellationError();
          }
        }
      });
      return result;
    }
    return false;
  }
  getExtensionsControlManifest() {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    return this.extensionGalleryService.getExtensionsControlManifest();
  }
  getServer(extension) {
    if (extension.isWorkspaceScoped) {
      return this.getWorkspaceExtensionsServer();
    }
    return this.extensionManagementServerService.getExtensionManagementServer(extension);
  }
  getWorkspaceExtensionsServer() {
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer;
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer;
    }
    throw new Error("No extension server found");
  }
  async requestPublisherTrust(extensions) {
    const manifests = await Promise.all(extensions.map(async ({ extension }) => {
      const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
      if (!manifest) {
        throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
      }
      return manifest;
    }));
    await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
  }
  async checkForTrustedPublishers(extensions) {
    const untrustedExtensions = [];
    const untrustedExtensionManifests = [];
    const manifestsToGetOtherUntrustedPublishers = [];
    for (const { extension, manifest, checkForPackAndDependencies } of extensions) {
      if (!extension.private && !this.isPublisherTrusted(extension)) {
        untrustedExtensions.push(extension);
        untrustedExtensionManifests.push(manifest);
        if (checkForPackAndDependencies) {
          manifestsToGetOtherUntrustedPublishers.push(manifest);
        }
      }
    }
    if (!untrustedExtensions.length) {
      return;
    }
    const otherUntrustedPublishers = manifestsToGetOtherUntrustedPublishers.length ? await this.getOtherUntrustedPublishers(manifestsToGetOtherUntrustedPublishers) : [];
    const allPublishers = [...distinct(untrustedExtensions, (e) => e.publisher), ...otherUntrustedPublishers];
    const unverfiiedPublishers = allPublishers.filter((p) => !p.publisherDomain?.verified);
    const verifiedPublishers = allPublishers.filter((p) => p.publisherDomain?.verified);
    const installButton = {
      label: allPublishers.length > 1 ? localize({ key: "trust publishers and install", comment: ["&& denotes a mnemonic"] }, "Trust Publishers & &&Install") : localize({ key: "trust and install", comment: ["&& denotes a mnemonic"] }, "Trust Publisher & &&Install"),
      run: () => {
        this.telemetryService.publicLog2("extensions:trustPublisher", { action: "trust", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
        this.trustPublishers(...allPublishers.map((p) => ({ publisher: p.publisher, publisherDisplayName: p.publisherDisplayName })));
      }
    };
    const learnMoreButton = {
      label: localize({ key: "learnMore", comment: ["&& denotes a mnemonic"] }, "&&Learn More"),
      run: () => {
        this.telemetryService.publicLog2("extensions:trustPublisher", { action: "learn", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
        this.instantiationService.invokeFunction((accessor) => accessor.get(ICommandService).executeCommand("vscode.open", URI.parse("https://aka.ms/vscode-extension-security")));
        throw new CancellationError();
      }
    };
    const getPublisherLink = ({ publisherDisplayName, publisherLink }) => {
      return publisherLink ? `[${publisherDisplayName}](${publisherLink})` : publisherDisplayName;
    };
    const unverifiedLink = "https://aka.ms/vscode-verify-publisher";
    const title = allPublishers.length === 1 ? localize("checkTrustedPublisherTitle", 'Do you trust the publisher "{0}"?', allPublishers[0].publisherDisplayName) : allPublishers.length === 2 ? localize("checkTwoTrustedPublishersTitle", 'Do you trust publishers "{0}" and "{1}"?', allPublishers[0].publisherDisplayName, allPublishers[1].publisherDisplayName) : localize("checkAllTrustedPublishersTitle", 'Do you trust the publisher "{0}" and {1} others?', allPublishers[0].publisherDisplayName, allPublishers.length - 1);
    const customMessage = new MarkdownString("", { supportThemeIcons: true, isTrusted: true });
    if (untrustedExtensions.length === 1) {
      const extension = untrustedExtensions[0];
      const manifest = untrustedExtensionManifests[0];
      if (otherUntrustedPublishers.length) {
        customMessage.appendMarkdown(localize("extension published by message", "The extension {0} is published by {1}.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
        customMessage.appendMarkdown("&nbsp;");
        const commandUri = createCommandUri("extension.open", extension.identifier.id, manifest.extensionPack?.length ? "extensionPack" : "dependencies").toString();
        if (otherUntrustedPublishers.length === 1) {
          customMessage.appendMarkdown(localize("singleUntrustedPublisher", "Installing this extension will also install [extensions]({0}) published by {1}.", commandUri, getPublisherLink(otherUntrustedPublishers[0])));
        } else {
          customMessage.appendMarkdown(localize("message3", "Installing this extension will also install [extensions]({0}) published by {1} and {2}.", commandUri, otherUntrustedPublishers.slice(0, otherUntrustedPublishers.length - 1).map((p) => getPublisherLink(p)).join(", "), getPublisherLink(otherUntrustedPublishers[otherUntrustedPublishers.length - 1])));
        }
        customMessage.appendMarkdown("&nbsp;");
        customMessage.appendMarkdown(localize("firstTimeInstallingMessage", "This is the first time you're installing extensions from these publishers."));
      } else {
        customMessage.appendMarkdown(localize("message1", "The extension {0} is published by {1}. This is the first extension you're installing from this publisher.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
      }
    } else {
      customMessage.appendMarkdown(localize("multiInstallMessage", "This is the first time you're installing extensions from publishers {0} and {1}.", getPublisherLink(allPublishers[0]), getPublisherLink(allPublishers[allPublishers.length - 1])));
    }
    if (verifiedPublishers.length || unverfiiedPublishers.length === 1) {
      for (const publisher of verifiedPublishers) {
        customMessage.appendText("\n");
        const publisherVerifiedMessage = localize("verifiedPublisherWithName", "{0} has verified ownership of {1}.", getPublisherLink(publisher), `[$(link-external) ${URI.parse(publisher.publisherDomain.link).authority}](${publisher.publisherDomain.link})`);
        customMessage.appendMarkdown(`$(${verifiedPublisherIcon.id})&nbsp;${publisherVerifiedMessage}`);
      }
      if (unverfiiedPublishers.length) {
        customMessage.appendText("\n");
        if (unverfiiedPublishers.length === 1) {
          customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("unverifiedPublisherWithName", "{0} is [**not** verified]({1}).", getPublisherLink(unverfiiedPublishers[0]), unverifiedLink)}`);
        } else {
          customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("unverifiedPublishers", "{0} and {1} are [**not** verified]({2}).", unverfiiedPublishers.slice(0, unverfiiedPublishers.length - 1).map((p) => getPublisherLink(p)).join(", "), getPublisherLink(unverfiiedPublishers[unverfiiedPublishers.length - 1]), unverifiedLink)}`);
        }
      }
    } else {
      customMessage.appendText("\n");
      customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("allUnverifed", "All publishers are [**not** verified]({0}).", unverifiedLink)}`);
    }
    customMessage.appendText("\n");
    if (allPublishers.length > 1) {
      customMessage.appendMarkdown(localize("message4", "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publishers.", this.productService.nameLong));
    } else {
      customMessage.appendMarkdown(localize("message2", "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publisher.", this.productService.nameLong));
    }
    await this.dialogService.prompt({
      message: title,
      type: Severity.Warning,
      buttons: [installButton, learnMoreButton],
      cancelButton: {
        run: () => {
          this.telemetryService.publicLog2("extensions:trustPublisher", { action: "cancel", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
          throw new CancellationError();
        }
      },
      custom: {
        markdownDetails: [{ markdown: customMessage, classes: ["extensions-management-publisher-trust-dialog"] }]
      }
    });
  }
  async getOtherUntrustedPublishers(manifests) {
    const extensionIds = /* @__PURE__ */ new Set();
    for (const manifest of manifests) {
      for (const id of [...manifest.extensionPack ?? [], ...manifest.extensionDependencies ?? []]) {
        const [publisherId] = id.split(".");
        if (publisherId.toLowerCase() === manifest.publisher.toLowerCase()) {
          continue;
        }
        if (this.isPublisherUserTrusted(publisherId.toLowerCase())) {
          continue;
        }
        extensionIds.add(id.toLowerCase());
      }
    }
    if (!extensionIds.size) {
      return [];
    }
    const extensions = /* @__PURE__ */ new Map();
    await this.getDependenciesAndPackedExtensionsRecursively([...extensionIds], extensions, CancellationToken.None);
    const publishers = /* @__PURE__ */ new Map();
    for (const [, extension] of extensions) {
      if (extension.private || this.isPublisherTrusted(extension)) {
        continue;
      }
      publishers.set(extension.publisherDisplayName, extension);
    }
    return [...publishers.values()];
  }
  async getDependenciesAndPackedExtensionsRecursively(toGet, result, token) {
    if (toGet.length === 0) {
      return;
    }
    const extensions = await this.extensionGalleryService.getExtensions(toGet.map((id) => ({ id })), token);
    for (let idx = 0; idx < extensions.length; idx++) {
      const extension = extensions[idx];
      result.set(extension.identifier.id.toLowerCase(), extension);
    }
    toGet = [];
    for (const extension of extensions) {
      if (isNonEmptyArray(extension.properties.dependencies)) {
        for (const id of extension.properties.dependencies) {
          if (!result.has(id.toLowerCase())) {
            toGet.push(id);
          }
        }
      }
      if (isNonEmptyArray(extension.properties.extensionPack)) {
        for (const id of extension.properties.extensionPack) {
          if (!result.has(id.toLowerCase())) {
            toGet.push(id);
          }
        }
      }
    }
    return this.getDependenciesAndPackedExtensionsRecursively(toGet, result, token);
  }
  async checkForWorkspaceTrust(manifest, requireTrust) {
    if (requireTrust || this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(manifest) === false) {
      const buttons = [];
      buttons.push({ label: localize("extensionInstallWorkspaceTrustButton", "Trust Workspace & Install"), type: "ContinueWithTrust" });
      if (!requireTrust) {
        buttons.push({ label: localize("extensionInstallWorkspaceTrustContinueButton", "Install"), type: "ContinueWithoutTrust" });
      }
      buttons.push({ label: localize("extensionInstallWorkspaceTrustManageButton", "Learn More"), type: "Manage" });
      const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust({
        message: localize("extensionInstallWorkspaceTrustMessage", "Enabling this extension requires a trusted workspace."),
        buttons
      });
      if (trustState === void 0) {
        throw new CancellationError();
      }
    }
  }
  async checkInstallingExtensionOnWeb(extension, manifest) {
    if (this.servers.length !== 1 || this.servers[0] !== this.extensionManagementServerService.webExtensionManagementServer) {
      return;
    }
    const nonWebExtensions = [];
    if (manifest.extensionPack?.length) {
      const extensions = await this.extensionGalleryService.getExtensions(manifest.extensionPack.map((id) => ({ id })), CancellationToken.None);
      for (const extension2 of extensions) {
        if (await this.servers[0].extensionManagementService.canInstall(extension2) !== true) {
          nonWebExtensions.push(extension2);
        }
      }
      if (nonWebExtensions.length && nonWebExtensions.length === extensions.length) {
        throw new ExtensionManagementError("Not supported in Web", ExtensionManagementErrorCode.Unsupported);
      }
    }
    const productName = localize("VS Code for Web", "{0} for the Web", this.productService.nameLong);
    const virtualWorkspaceSupport = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(manifest);
    const virtualWorkspaceSupportReason = getWorkspaceSupportTypeMessage(manifest.capabilities?.virtualWorkspaces);
    const hasLimitedSupport = virtualWorkspaceSupport === "limited" || !!virtualWorkspaceSupportReason;
    if (!nonWebExtensions.length && !hasLimitedSupport) {
      return;
    }
    const limitedSupportMessage = localize("limited support", "'{0}' has limited functionality in {1}.", extension.displayName || extension.identifier.id, productName);
    let message;
    let buttons = [];
    let detail;
    const installAnywayButton = {
      label: localize({ key: "install anyways", comment: ["&& denotes a mnemonic"] }, "&&Install Anyway"),
      run: () => {
      }
    };
    const showExtensionsButton = {
      label: localize({ key: "showExtensions", comment: ["&& denotes a mnemonic"] }, "&&Show Extensions"),
      run: () => this.instantiationService.invokeFunction((accessor) => accessor.get(ICommandService).executeCommand("extension.open", extension.identifier.id, "extensionPack"))
    };
    if (nonWebExtensions.length && hasLimitedSupport) {
      message = limitedSupportMessage;
      detail = `${virtualWorkspaceSupportReason ? `${virtualWorkspaceSupportReason}
` : ""}${localize("non web extensions detail", "Contains extensions which are not supported.")}`;
      buttons = [
        installAnywayButton,
        showExtensionsButton
      ];
    } else if (hasLimitedSupport) {
      message = limitedSupportMessage;
      detail = virtualWorkspaceSupportReason || void 0;
      buttons = [installAnywayButton];
    } else {
      message = localize("non web extensions", "'{0}' contains extensions which are not supported in {1}.", extension.displayName || extension.identifier.id, productName);
      buttons = [
        installAnywayButton,
        showExtensionsButton
      ];
    }
    await this.dialogService.prompt({
      type: Severity.Info,
      message,
      detail,
      buttons,
      cancelButton: {
        run: () => {
          throw new CancellationError();
        }
      }
    });
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async cleanUp() {
    await Promise.allSettled(this.servers.map((server) => server.extensionManagementService.cleanUp()));
  }
  toggleApplicationScope(extension, fromProfileLocation) {
    const server = this.getServer(extension);
    if (server) {
      return server.extensionManagementService.toggleApplicationScope(extension, fromProfileLocation);
    }
    throw new Error("Not Supported");
  }
  copyExtensions(from, to) {
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      throw new Error("Not Supported");
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
    }
    return Promise.resolve();
  }
  registerParticipant() {
    throw new Error("Not Supported");
  }
  installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    throw new Error("Not Supported");
  }
  isPublisherTrusted(extension) {
    const publisher = extension.publisher.toLowerCase();
    if (this.defaultTrustedPublishers.includes(publisher) || this.defaultTrustedPublishers.includes(extension.publisherDisplayName.toLowerCase())) {
      return true;
    }
    if (this.allowedExtensionsService.allowedExtensionsConfigValue && this.allowedExtensionsService.isAllowed(extension)) {
      return true;
    }
    return this.isPublisherUserTrusted(publisher);
  }
  isPublisherUserTrusted(publisher) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    return !!trustedPublishers[publisher];
  }
  getTrustedPublishers() {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    return Object.keys(trustedPublishers).map((publisher) => trustedPublishers[publisher]);
  }
  trustPublishers(...publishers) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    for (const publisher of publishers) {
      trustedPublishers[publisher.publisher.toLowerCase()] = publisher;
    }
    this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
  }
  untrustPublishers(...publishers) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    for (const publisher of publishers) {
      delete trustedPublishers[publisher.toLowerCase()];
    }
    this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
  }
  getTrustedPublishersFromStorage() {
    const trustedPublishers = this.storageService.getObject(TrustedPublishersStorageKey, StorageScope.APPLICATION, {});
    if (Array.isArray(trustedPublishers)) {
      this.storageService.remove(TrustedPublishersStorageKey, StorageScope.APPLICATION);
      return /* @__PURE__ */ Object.create(null);
    }
    return Object.keys(trustedPublishers).reduce((result, publisher) => {
      result[publisher.toLowerCase()] = trustedPublishers[publisher];
      return result;
    }, /* @__PURE__ */ Object.create(null));
  }
};
ExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, IExtensionGalleryService),
  __decorateParam(2, IUserDataProfileService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IDownloadService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkspaceTrustRequestService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, IFileService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, IExtensionsScannerService),
  __decorateParam(15, IAllowedExtensionsService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, ITelemetryService)
], ExtensionManagementService);
let WorkspaceExtensionsManagementService = class extends Disposable {
  constructor(fileService, logService, workspaceService, extensionsScannerService, storageService, uriIdentityService, telemetryService) {
    super();
    this.fileService = fileService;
    this.logService = logService;
    this.workspaceService = workspaceService;
    this.extensionsScannerService = extensionsScannerService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this.telemetryService = telemetryService;
    this._onDidChangeInvalidExtensions = this._register(new Emitter());
    this.onDidChangeInvalidExtensions = this._onDidChangeInvalidExtensions.event;
    this.extensions = [];
    this.invalidExtensionWatchers = this._register(new DisposableStore());
    this._register(Event.throttle(this.fileService.onDidFilesChange, (last, e) => {
      (last = last ?? []).push(e);
      return last;
    }, 1e3, false)((events) => {
      const changedInvalidExtensions = this.extensions.filter((extension) => !extension.isValid && events.some((e) => e.affects(extension.location)));
      if (changedInvalidExtensions.length) {
        this.checkExtensionsValidity(changedInvalidExtensions);
      }
    }));
    this.initializePromise = this.initialize();
  }
  async initialize() {
    const existingLocations = this.getInstalledWorkspaceExtensionsLocations();
    if (!existingLocations.length) {
      return;
    }
    await Promise.allSettled(existingLocations.map(async (location) => {
      if (!this.workspaceService.isInsideWorkspace(location)) {
        this.logService.info(`Removing the workspace extension ${location.toString()} as it is not inside the workspace`);
        return;
      }
      if (!await this.fileService.exists(location)) {
        this.logService.info(`Removing the workspace extension ${location.toString()} as it does not exist`);
        return;
      }
      try {
        const extension = await this.scanWorkspaceExtension(location);
        if (extension) {
          this.extensions.push(extension);
        } else {
          this.logService.info(`Skipping workspace extension ${location.toString()} as it does not exist`);
        }
      } catch (error) {
        this.logService.error("Skipping the workspace extension", location.toString(), error);
      }
    }));
    this.saveWorkspaceExtensions();
  }
  watchInvalidExtensions() {
    this.invalidExtensionWatchers.clear();
    for (const extension of this.extensions) {
      if (!extension.isValid) {
        this.invalidExtensionWatchers.add(this.fileService.watch(extension.location));
      }
    }
  }
  async checkExtensionsValidity(extensions) {
    const validExtensions = [];
    await Promise.all(extensions.map(async (extension) => {
      const newExtension = await this.scanWorkspaceExtension(extension.location);
      if (newExtension?.isValid) {
        validExtensions.push(newExtension);
      }
    }));
    let changed = false;
    for (const extension of validExtensions) {
      const index = this.extensions.findIndex((e) => this.uriIdentityService.extUri.isEqual(e.location, extension.location));
      if (index !== -1) {
        changed = true;
        this.extensions.splice(index, 1, extension);
      }
    }
    if (changed) {
      this.saveWorkspaceExtensions();
      this._onDidChangeInvalidExtensions.fire(validExtensions);
    }
  }
  async getInstalled(includeInvalid) {
    await this.initializePromise;
    return this.extensions.filter((e) => includeInvalid || e.isValid);
  }
  async install(extension) {
    await this.initializePromise;
    const workspaceExtension = await this.scanWorkspaceExtension(extension.location);
    if (!workspaceExtension) {
      throw new Error("Cannot install the extension as it does not exist.");
    }
    const existingExtensionIndex = this.extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
    if (existingExtensionIndex === -1) {
      this.extensions.push(workspaceExtension);
    } else {
      this.extensions.splice(existingExtensionIndex, 1, workspaceExtension);
    }
    this.saveWorkspaceExtensions();
    this.telemetryService.publicLog2("workspaceextension:install");
    return workspaceExtension;
  }
  async uninstall(extension) {
    await this.initializePromise;
    const existingExtensionIndex = this.extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
    if (existingExtensionIndex !== -1) {
      this.extensions.splice(existingExtensionIndex, 1);
      this.saveWorkspaceExtensions();
    }
    this.telemetryService.publicLog2("workspaceextension:uninstall");
  }
  getInstalledWorkspaceExtensionsLocations() {
    const locations = [];
    try {
      const parsed = JSON.parse(this.storageService.get(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, StorageScope.WORKSPACE, "[]"));
      if (Array.isArray(locations)) {
        for (const location of parsed) {
          if (isString(location)) {
            if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
              locations.push(this.workspaceService.getWorkspace().folders[0].toResource(location));
            } else {
              this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${location}`);
            }
          } else {
            locations.push(URI.revive(location));
          }
        }
      } else {
        this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${locations}`);
      }
    } catch (error) {
      this.logService.warn(`Error parsing workspace extensions locations: ${getErrorMessage(error)}`);
    }
    return locations;
  }
  saveWorkspaceExtensions() {
    const locations = this.extensions.map((extension) => extension.location);
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
      this.storageService.store(
        WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY,
        JSON.stringify(coalesce(locations.map((location) => this.uriIdentityService.extUri.relativePath(this.workspaceService.getWorkspace().folders[0].uri, location)))),
        StorageScope.WORKSPACE,
        StorageTarget.MACHINE
      );
    } else {
      this.storageService.store(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, JSON.stringify(locations), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    this.watchInvalidExtensions();
  }
  async scanWorkspaceExtension(location) {
    const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
    return scannedExtension ? this.toLocalWorkspaceExtension(scannedExtension) : null;
  }
  async toLocalWorkspaceExtension(extension) {
    const stat = await this.fileService.resolve(extension.location);
    let readmeUrl;
    let changelogUrl;
    if (stat.children) {
      readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
      changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
    }
    const validations = [...extension.validations];
    let isValid = extension.isValid;
    if (extension.manifest.main) {
      if (!await this.fileService.exists(this.uriIdentityService.extUri.joinPath(extension.location, extension.manifest.main))) {
        isValid = false;
        validations.push([Severity.Error, localize("main.notFound", "Cannot activate because {0} not found", extension.manifest.main)]);
      }
    }
    return {
      identifier: extension.identifier,
      type: extension.type,
      isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
      location: extension.location,
      manifest: extension.manifest,
      targetPlatform: extension.targetPlatform,
      validations,
      isValid,
      readmeUrl,
      changelogUrl,
      publisherDisplayName: extension.metadata?.publisherDisplayName,
      publisherId: extension.metadata?.publisherId || null,
      isApplicationScoped: !!extension.metadata?.isApplicationScoped,
      isMachineScoped: !!extension.metadata?.isMachineScoped,
      isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
      hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
      preRelease: !!extension.metadata?.preRelease,
      installedTimestamp: extension.metadata?.installedTimestamp,
      updated: !!extension.metadata?.updated,
      pinned: !!extension.metadata?.pinned,
      forceAutoUpdate: false,
      isWorkspaceScoped: true,
      private: false,
      source: "resource",
      size: extension.metadata?.size ?? 0
    };
  }
};
WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY = "workspaceExtensions.locations";
WorkspaceExtensionsManagementService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IExtensionsScannerService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ITelemetryService)
], WorkspaceExtensionsManagementService);
export {
  ExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25NYW5hZ2VtZW50XFxjb21tb25cXGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIEV2ZW50TXVsdGlwbGV4ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQge1xuXHRJTG9jYWxFeHRlbnNpb24sIElHYWxsZXJ5RXh0ZW5zaW9uLCBJRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSW5zdGFsbE9wdGlvbnMsIFVuaW5zdGFsbE9wdGlvbnMsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSwgTWV0YWRhdGEsIEluc3RhbGxPcGVyYXRpb24sIEVYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhULCBJbnN0YWxsRXh0ZW5zaW9uSW5mbyxcblx0SVByb2R1Y3RWZXJzaW9uLFxuXHRFeHRlbnNpb25JbnN0YWxsU291cmNlLFxuXHREaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSxcblx0VW5pbnN0YWxsRXh0ZW5zaW9uSW5mbyxcblx0SUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0RVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBEaWRDaGFuZ2VQcm9maWxlRm9yU2VydmVyRXZlbnQsIERpZFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIEluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50LCBJUHVibGlzaGVySW5mbywgSVJlc291cmNlRXh0ZW5zaW9uLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24sIElFeHRlbnNpb25NYW5pZmVzdCwgZ2V0V29ya3NwYWNlU3VwcG9ydFR5cGVNZXNzYWdlLCBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBjb21wdXRlVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRG93bmxvYWRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG93bmxvYWQvY29tbW9uL2Rvd25sb2FkLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlLCBkaXN0aW5jdCwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0QnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBTeW5jUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIElTY2FubmVkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSwgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHZlcmlmaWVkUHVibGlzaGVySWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1vbnRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuXG5jb25zdCBUcnVzdGVkUHVibGlzaGVyc1N0b3JhZ2VLZXkgPSAnZXh0ZW5zaW9ucy50cnVzdGVkUHVibGlzaGVycyc7XG5cbmZ1bmN0aW9uIGlzR2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb246IElSZXNvdXJjZUV4dGVuc2lvbiB8IElHYWxsZXJ5RXh0ZW5zaW9uKTogZXh0ZW5zaW9uIGlzIElHYWxsZXJ5RXh0ZW5zaW9uIHtcblx0cmV0dXJuIGV4dGVuc2lvbi50eXBlID09PSAnZ2FsbGVyeSc7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIENvbW1vbnRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0VHJ1c3RlZFB1Ymxpc2hlcnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uSW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25JbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxJbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Vbmluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Vbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PjtcblxuXHRyZWFkb25seSBvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhOiBFdmVudDxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9maWxlQXdhcmVVbmluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PERpZFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+O1xuXG5cdHJlYWRvbmx5IG9uUHJvZmlsZUF3YXJlRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE6IEV2ZW50PERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb2ZpbGU6IEV2ZW50PERpZENoYW5nZVByb2ZpbGVGb3JTZXJ2ZXJFdmVudD47XG5cblx0cmVhZG9ubHkgb25EaWRFbmFibGVFeHRlbnNpb25zOiBFdmVudDxJTG9jYWxFeHRlbnNpb25bXT47XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHNlcnZlcnM6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBXb3Jrc3BhY2VFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASURvd25sb2FkU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZG93bmxvYWRTZXJ2aWNlOiBJRG93bmxvYWRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocHJvZHVjdFNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSk7XG5cblx0XHR0aGlzLmRlZmF1bHRUcnVzdGVkUHVibGlzaGVycyA9IHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25QdWJsaXNoZXJzID8/IFtdO1xuXHRcdHRoaXMud29ya3NwYWNlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZUV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdHRoaXMub25EaWRFbmFibGVFeHRlbnNpb25zID0gdGhpcy53b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZUludmFsaWRFeHRlbnNpb25zO1xuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLnNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuc2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuc2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25JbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPEluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihvbkluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZCh0aGlzLl9vbkluc3RhbGxFeHRlbnNpb24uZXZlbnQpKTtcblx0XHR0aGlzLm9uSW5zdGFsbEV4dGVuc2lvbiA9IG9uSW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZEluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50TXVsdGlwbGV4ZXIuYWRkKHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZXZlbnQpKTtcblx0XHR0aGlzLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMgPSBvbkRpZEluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlci5ldmVudDtcblxuXHRcdGNvbnN0IG9uRGlkUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbnNFdmVudE11bHRpcGxleGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFByb2ZpbGVBd2FyZUluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlci5hZGQodGhpcy5fb25EaWRQcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9ucy5ldmVudCkpO1xuXHRcdHRoaXMub25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IG9uRGlkUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbnNFdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Y29uc3Qgb25Vbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8VW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25Vbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZCh0aGlzLl9vblVuaW5zdGFsbEV4dGVuc2lvbi5ldmVudCkpO1xuXHRcdHRoaXMub25Vbmluc3RhbGxFeHRlbnNpb24gPSBvblVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXZlbnRNdWx0aXBsZXhlcjxEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuYWRkKHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmV2ZW50KSk7XG5cdFx0dGhpcy5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiA9IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5ldmVudDtcblxuXHRcdGNvbnN0IG9uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPERpZFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5hZGQodGhpcy5fb25EaWRQcm9maWxlQXdhcmVVbmluc3RhbGxFeHRlbnNpb24uZXZlbnQpKTtcblx0XHR0aGlzLm9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uID0gb25EaWRQcm9maWxlQXdhcmVVbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Y29uc3Qgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGFFdmVudE11bHRpcGxleGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+KCkpO1xuXHRcdHRoaXMub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSA9IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhRXZlbnRNdWx0aXBsZXhlci5ldmVudDtcblxuXHRcdGNvbnN0IG9uRGlkUHJvZmlsZUF3YXJlVXBkYXRlRXh0ZW5zaW9uTWV0YWRhRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPigpKTtcblx0XHR0aGlzLm9uUHJvZmlsZUF3YXJlRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEgPSBvbkRpZFByb2ZpbGVBd2FyZVVwZGF0ZUV4dGVuc2lvbk1ldGFkYUV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVByb2ZpbGVFdmVudE11bHRpcGxleGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8RGlkQ2hhbmdlUHJvZmlsZUZvclNlcnZlckV2ZW50PigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlUHJvZmlsZSA9IG9uRGlkQ2hhbmdlUHJvZmlsZUV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLnNlcnZlcnMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uSW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuYWRkKEV2ZW50Lm1hcChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25JbnN0YWxsRXh0ZW5zaW9uLCBlID0+ICh7IC4uLmUsIHNlcnZlciB9KSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkSW5zdGFsbEV4dGVuc2lvbnNFdmVudE11bHRpcGxleGVyLmFkZChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucykpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRQcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50TXVsdGlwbGV4ZXIuYWRkKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvblVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuYWRkKEV2ZW50Lm1hcChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Vbmluc3RhbGxFeHRlbnNpb24sIGUgPT4gKHsgLi4uZSwgc2VydmVyIH0pKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZChFdmVudC5tYXAoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLCBlID0+ICh7IC4uLmUsIHNlcnZlciB9KSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5hZGQoRXZlbnQubWFwKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZFVuaW5zdGFsbEV4dGVuc2lvbiwgZSA9PiAoeyAuLi5lLCBzZXJ2ZXIgfSkpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYUV2ZW50TXVsdGlwbGV4ZXIuYWRkKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFByb2ZpbGVBd2FyZVVwZGF0ZUV4dGVuc2lvbk1ldGFkYUV2ZW50TXVsdGlwbGV4ZXIuYWRkKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZVByb2ZpbGVFdmVudE11bHRpcGxleGVyLmFkZChFdmVudC5tYXAoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZSwgZSA9PiAoeyAuLi5lLCBzZXJ2ZXIgfSkpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zKHJlc3VsdHMgPT4ge1xuXHRcdFx0Y29uc3QgdW50cnVzdGVkUHVibGlzaGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJUHVibGlzaGVySW5mbz4oKTtcblx0XHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKHJlc3VsdC5sb2NhbCAmJiByZXN1bHQuc291cmNlICYmICFVUkkuaXNVcmkocmVzdWx0LnNvdXJjZSkgJiYgIXRoaXMuaXNQdWJsaXNoZXJUcnVzdGVkKHJlc3VsdC5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0dW50cnVzdGVkUHVibGlzaGVycy5zZXQocmVzdWx0LnNvdXJjZS5wdWJsaXNoZXIsIHsgcHVibGlzaGVyOiByZXN1bHQuc291cmNlLnB1Ymxpc2hlciwgcHVibGlzaGVyRGlzcGxheU5hbWU6IHJlc3VsdC5zb3VyY2UucHVibGlzaGVyRGlzcGxheU5hbWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh1bnRydXN0ZWRQdWJsaXNoZXJzLnNpemUpIHtcblx0XHRcdFx0dGhpcy50cnVzdFB1Ymxpc2hlcnMoLi4udW50cnVzdGVkUHVibGlzaGVycy52YWx1ZXMoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKHR5cGU/OiBFeHRlbnNpb25UeXBlLCBwcm9maWxlTG9jYXRpb24/OiBVUkksIHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnNlcnZlcnMubWFwKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHR5cGUsIHByb2ZpbGVMb2NhdGlvbiwgcHJvZHVjdFZlcnNpb24pO1xuXHRcdFx0aWYgKHNlcnZlciA9PT0gdGhpcy5nZXRXb3Jrc3BhY2VFeHRlbnNpb25zU2VydmVyKCkpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9ucyh0cnVlKTtcblx0XHRcdFx0aW5zdGFsbGVkLnB1c2goLi4ud29ya3NwYWNlRXh0ZW5zaW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCguLi5pbnN0YWxsZWQpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dW5pbnN0YWxsKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zOiBVbmluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudW5pbnN0YWxsRXh0ZW5zaW9ucyhbeyBleHRlbnNpb24sIG9wdGlvbnMgfV0pO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGdyb3VwZWRFeHRlbnNpb25zID0gbmV3IE1hcDxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdPigpO1xuXG5cdFx0Y29uc3QgYWRkRXh0ZW5zaW9uVG9TZXJ2ZXIgPSAoc2VydmVyOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zKSA9PiB7XG5cdFx0XHRsZXQgZXh0ZW5zaW9ucyA9IGdyb3VwZWRFeHRlbnNpb25zLmdldChzZXJ2ZXIpO1xuXHRcdFx0aWYgKCFleHRlbnNpb25zKSB7XG5cdFx0XHRcdGdyb3VwZWRFeHRlbnNpb25zLnNldChzZXJ2ZXIsIGV4dGVuc2lvbnMgPSBbXSk7XG5cdFx0XHR9XG5cdFx0XHRleHRlbnNpb25zLnB1c2goeyBleHRlbnNpb24sIG9wdGlvbnMgfSk7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgeyBleHRlbnNpb24sIG9wdGlvbnMgfSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRcdHdvcmtzcGFjZUV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoZXh0ZW5zaW9uKTtcblx0XHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsb2NhdGlvbiAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0YWRkRXh0ZW5zaW9uVG9TZXJ2ZXIoc2VydmVyLCBleHRlbnNpb24sIG9wdGlvbnMpO1xuXHRcdFx0aWYgKHRoaXMuc2VydmVycy5sZW5ndGggPiAxICYmIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdFx0Y29uc3Qgb3RoZXJTZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdID0gdGhpcy5zZXJ2ZXJzLmZpbHRlcihzID0+IHMgIT09IHNlcnZlcik7XG5cdFx0XHRcdGZvciAoY29uc3Qgb3RoZXJTZXJ2ZXIgb2Ygb3RoZXJTZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgb3RoZXJTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5PdGhlclNlcnZlciA9IGluc3RhbGxlZC5maW5kKGkgPT4gIWkuaXNCdWlsdGluICYmIGFyZVNhbWVFeHRlbnNpb25zKGkuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5PdGhlclNlcnZlcikge1xuXHRcdFx0XHRcdFx0YWRkRXh0ZW5zaW9uVG9TZXJ2ZXIob3RoZXJTZXJ2ZXIsIGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIsIG9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbiBvZiB3b3Jrc3BhY2VFeHRlbnNpb25zKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMudW5pbnN0YWxsRXh0ZW5zaW9uRnJvbVdvcmtzcGFjZSh3b3Jrc3BhY2VFeHRlbnNpb24pKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbc2VydmVyLCBleHRlbnNpb25zXSBvZiBncm91cGVkRXh0ZW5zaW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdHByb21pc2VzLnB1c2godGhpcy51bmluc3RhbGxJblNlcnZlcihzZXJ2ZXIsIGV4dGVuc2lvbnMpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocHJvbWlzZXMpO1xuXHRcdGNvbnN0IGVycm9ycyA9IHJlc3VsdC5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ3JlamVjdGVkJykubWFwKHIgPT4gci5yZWFzb24pO1xuXHRcdGlmIChlcnJvcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyb3JzLm1hcChlID0+IGUubWVzc2FnZSkuam9pbignXFxuJykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5pbnN0YWxsSW5TZXJ2ZXIoc2VydmVyOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgZXh0ZW5zaW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZXh0ZW5zaW9uIH0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIpO1xuXHRcdFx0XHRjb25zdCBkZXBlbmRlbnROb25VSUV4dGVuc2lvbnMgPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcihpID0+ICF0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPblVJKGkubWFuaWZlc3QpXG5cdFx0XHRcdFx0JiYgaS5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMgJiYgaS5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpO1xuXHRcdFx0XHRpZiAoZGVwZW5kZW50Tm9uVUlFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRocm93IChuZXcgRXJyb3IodGhpcy5nZXREZXBlbmRlbnRzRXJyb3JNZXNzYWdlKGV4dGVuc2lvbiwgZGVwZW5kZW50Tm9uVUlFeHRlbnNpb25zKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwZW5kZW50c0Vycm9yTWVzc2FnZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZGVwZW5kZW50czogSUxvY2FsRXh0ZW5zaW9uW10pOiBzdHJpbmcge1xuXHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaW5nbGVEZXBlbmRlbnRFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCBleHRlbnNpb24gJ3swfScuIEV4dGVuc2lvbiAnezF9JyBkZXBlbmRzIG9uIHRoaXMuXCIsXG5cdFx0XHRcdGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0Lm5hbWUpO1xuXHRcdH1cblx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDIpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHdvRGVwZW5kZW50c0Vycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsIGV4dGVuc2lvbiAnezB9Jy4gRXh0ZW5zaW9ucyAnezF9JyBhbmQgJ3syfScgZGVwZW5kIG9uIHRoaXMuXCIsXG5cdFx0XHRcdGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5uYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdtdWx0aXBsZURlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCBleHRlbnNpb24gJ3swfScuIEV4dGVuc2lvbnMgJ3sxfScsICd7Mn0nIGFuZCBvdGhlcnMgZGVwZW5kIG9uIHRoaXMuXCIsXG5cdFx0XHRleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMV0ubWFuaWZlc3QubmFtZSk7XG5cblx0fVxuXG5cdHVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKGV4dGVuc2lvbik7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSA6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZTtcblx0XHRcdHJldHVybiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLCBtZXRhZGF0YSwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoYEludmFsaWQgbG9jYXRpb24gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdGFzeW5jIHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5zZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQpKSk7XG5cdH1cblxuXHR6aXAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKGV4dGVuc2lvbik7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS56aXAoZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGBJbnZhbGlkIGxvY2F0aW9uICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHRkb3dubG9hZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24sIGRvbm90VmVyaWZ5U2lnbmF0dXJlOiBib29sZWFuKTogUHJvbWlzZTxVUkk+IHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5kb3dubG9hZChleHRlbnNpb24sIG9wZXJhdGlvbiwgZG9ub3RWZXJpZnlTaWduYXR1cmUpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBkb3dubG9hZCBleHRlbnNpb24nKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwodnNpeDogVVJJLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YWxsVlNJWCh2c2l4LCBtYW5pZmVzdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsVlNJWCh2c2l4OiBVUkksIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3Qgc2VydmVyc1RvSW5zdGFsbCA9IHRoaXMuZ2V0U2VydmVyc1RvSW5zdGFsbChtYW5pZmVzdCk7XG5cdFx0aWYgKHNlcnZlcnNUb0luc3RhbGw/Lmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGVja0ZvcldvcmtzcGFjZVRydXN0KG1hbmlmZXN0LCBmYWxzZSk7XG5cdFx0XHRjb25zdCBbbG9jYWxdID0gYXdhaXQgUHJvbWlzZXMuc2V0dGxlZChzZXJ2ZXJzVG9JbnN0YWxsLm1hcChzZXJ2ZXIgPT4gdGhpcy5pbnN0YWxsVlNJWEluU2VydmVyKHZzaXgsIHNlcnZlciwgb3B0aW9ucykpKTtcblx0XHRcdHJldHVybiBsb2NhbDtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KCdObyBTZXJ2ZXJzIHRvIEluc3RhbGwnKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyc1RvSW5zdGFsbChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0aWYgKGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKG1hbmlmZXN0KSkge1xuXHRcdFx0XHQvLyBJbnN0YWxsIG9uIGJvdGggc2VydmVyc1xuXHRcdFx0XHRyZXR1cm4gW3RoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uVUkobWFuaWZlc3QpKSB7XG5cdFx0XHRcdC8vIEluc3RhbGwgb25seSBvbiBsb2NhbCBzZXJ2ZXJcblx0XHRcdFx0cmV0dXJuIFt0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcl07XG5cdFx0XHR9XG5cdFx0XHQvLyBJbnN0YWxsIG9ubHkgb24gcmVtb3RlIHNlcnZlclxuXHRcdFx0cmV0dXJuIFt0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBbdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gW3RoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcl07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGlmIChsb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9jYWwgZXh0ZW5zaW9uIG1hbmFnZW1lbnQgc2VydmVyIGlzIG5vdCBmb3VuZCcpO1xuXHRcdH1cblx0XHRpZiAobG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tTG9jYXRpb24obG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZW1vdGUgZXh0ZW5zaW9uIG1hbmFnZW1lbnQgc2VydmVyIGlzIG5vdCBmb3VuZCcpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdXZWIgZXh0ZW5zaW9uIG1hbmFnZW1lbnQgc2VydmVyIGlzIG5vdCBmb3VuZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tTG9jYXRpb24obG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGluc3RhbGxWU0lYSW5TZXJ2ZXIodnNpeDogVVJJLCBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0cmV0dXJuIHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHZzaXgsIG9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+IHtcblx0XHRpZiAodnNpeC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldE1hbmlmZXN0KHZzaXgpO1xuXHRcdH1cblx0XHRpZiAodnNpeC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0TWFuaWZlc3QodnNpeCk7XG5cdFx0fVxuXHRcdGlmICh2c2l4LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldE1hbmlmZXN0KHZzaXgpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoJ05vIFNlcnZlcnMnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNhbkluc3RhbGwoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiB8IElSZXNvdXJjZUV4dGVuc2lvbik6IFByb21pc2U8dHJ1ZSB8IElNYXJrZG93blN0cmluZz4ge1xuXHRcdGlmIChpc0dhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FuSW5zdGFsbEdhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2FuSW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNhbkluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9uKGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTx0cnVlIHwgSU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHQmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGdhbGxlcnkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGdhbGxlcnksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGxvY2FsaXplKCdtYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIk1hbmlmZXN0IGlzIG5vdCBmb3VuZFwiKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHRcdCYmIGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGdhbGxlcnkpID09PSB0cnVlXG5cdFx0XHQmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uV29ya3NwYWNlKG1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHRcdCYmIGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGdhbGxlcnkpID09PSB0cnVlXG5cdFx0XHQmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uV2ViKG1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGxvY2FsaXplKCdjYW5ub3QgYmUgaW5zdGFsbGVkJywgXCJDYW5ub3QgaW5zdGFsbCB0aGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHNldHVwLlwiLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkubmFtZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjYW5JbnN0YWxsUmVzb3VyY2VFeHRlbnNpb24oZXh0ZW5zaW9uOiBJUmVzb3VyY2VFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25Xb3Jrc3BhY2UoZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldlYihleHRlbnNpb24ubWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQnLCBcIkNhbm5vdCBpbnN0YWxsIHRoZSAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgc2V0dXAuXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24sIGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcihleHRlbnNpb24pO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoYEludmFsaWQgbG9jYXRpb24gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdID0gW107XG5cblx0XHQvLyBVcGRhdGUgTGFuZ3VhZ2UgcGFjayBvbiBsb2NhbCBhbmQgcmVtb3RlIHNlcnZlcnNcblx0XHRpZiAoaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24oZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0c2VydmVycy5wdXNoKC4uLnRoaXMuc2VydmVycy5maWx0ZXIoc2VydmVyID0+IHNlcnZlciAhPT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlcnZlcnMucHVzaChzZXJ2ZXIpO1xuXHRcdH1cblxuXHRcdGluc3RhbGxPcHRpb25zID0geyAuLi4oaW5zdGFsbE9wdGlvbnMgfHwge30pLCBpc0FwcGxpY2F0aW9uU2NvcGVkOiBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCB9O1xuXHRcdHJldHVybiBQcm9taXNlcy5zZXR0bGVkKHNlcnZlcnMubWFwKHNlcnZlciA9PiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnksIGluc3RhbGxPcHRpb25zKSkpLnRoZW4oKFtsb2NhbF0pID0+IGxvY2FsKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+IHtcblx0XHRjb25zdCByZXN1bHRzID0gbmV3IE1hcDxzdHJpbmcsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQ+KCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zQnlTZXJ2ZXIgPSBuZXcgTWFwPElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdPigpO1xuXHRcdGNvbnN0IG1hbmlmZXN0cyA9IGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbnMubWFwKGFzeW5jICh7IGV4dGVuc2lvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdNYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9uIHswfSBmYWlsZWQ6IE1hbmlmZXN0IGlzIG5vdCBmb3VuZC5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbnMuc29tZShlID0+IGUub3B0aW9ucz8uY29udGV4dD8uW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFRdICE9PSB0cnVlKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGVja0ZvclRydXN0ZWRQdWJsaXNoZXJzKGV4dGVuc2lvbnMubWFwKChlLCBpbmRleCkgPT4gKHsgZXh0ZW5zaW9uOiBlLmV4dGVuc2lvbiwgbWFuaWZlc3Q6IG1hbmlmZXN0c1tpbmRleF0sIGNoZWNrRm9yUGFja0FuZERlcGVuZGVuY2llczogIWUub3B0aW9ucz8uZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llcyB9KSkpO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbnMubWFwKGFzeW5jICh7IGV4dGVuc2lvbiwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnTWFuaWZlc3QgaXMgbm90IGZvdW5kJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbiB7MH0gZmFpbGVkOiBNYW5pZmVzdCBpcyBub3QgZm91bmQuXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnM/LmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVF0gIT09IEV4dGVuc2lvbkluc3RhbGxTb3VyY2UuU0VUVElOR1NfU1lOQykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JXb3Jrc3BhY2VUcnVzdChtYW5pZmVzdCwgZmFsc2UpO1xuXG5cdFx0XHRcdFx0aWYgKCFvcHRpb25zPy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNoZWNrSW5zdGFsbGluZ0V4dGVuc2lvbk9uV2ViKGV4dGVuc2lvbiwgbWFuaWZlc3QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlcnZlcnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJzVG9JbnN0YWxsKGV4dGVuc2lvbiwgbWFuaWZlc3QpO1xuXHRcdFx0XHRpZiAoIW9wdGlvbnMuaXNNYWNoaW5lU2NvcGVkICYmIHRoaXMuaXNFeHRlbnNpb25zU3luY0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0XHRcdFx0JiYgIXNlcnZlcnMuaW5jbHVkZXModGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpXG5cdFx0XHRcdFx0XHQmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdFx0XHRsZXQgZXhlbnNpb25zID0gZXh0ZW5zaW9uc0J5U2VydmVyLmdldChzZXJ2ZXIpO1xuXHRcdFx0XHRcdGlmICghZXhlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zQnlTZXJ2ZXIuc2V0KHNlcnZlciwgZXhlbnNpb25zID0gW10pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRleGVuc2lvbnMucHVzaCh7IGV4dGVuc2lvbiwgb3B0aW9ucyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmVzdWx0cy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwge1xuXHRcdFx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uLCBlcnJvcixcblx0XHRcdFx0XHRvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCxcblx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IG9wdGlvbnMucHJvZmlsZUxvY2F0aW9uID8/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLmV4dGVuc2lvbnNCeVNlcnZlci5lbnRyaWVzKCldLm1hcChhc3luYyAoW3NlcnZlciwgZXh0ZW5zaW9uc10pID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlclJlc3VsdHMgPSBhd2FpdCBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdFx0Zm9yIChjb25zdCByZXN1bHQgb2Ygc2VydmVyUmVzdWx0cykge1xuXHRcdFx0XHRyZXN1bHRzLnNldChyZXN1bHQuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCByZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBbLi4ucmVzdWx0cy52YWx1ZXMoKV07XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24sIGluc3RhbGxPcHRpb25zPzogSW5zdGFsbE9wdGlvbnMsIHNlcnZlcnM/OiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZ2FsbGVyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdNYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9uIHswfSBmYWlsZWQ6IE1hbmlmZXN0IGlzIG5vdCBmb3VuZC5cIiwgZ2FsbGVyeS5kaXNwbGF5TmFtZSB8fCBnYWxsZXJ5Lm5hbWUpKTtcblx0XHR9XG5cblx0XHRpZiAoaW5zdGFsbE9wdGlvbnM/LmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhUXSAhPT0gdHJ1ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGVja0ZvclRydXN0ZWRQdWJsaXNoZXJzKFt7IGV4dGVuc2lvbjogZ2FsbGVyeSwgbWFuaWZlc3QsIGNoZWNrRm9yUGFja0FuZERlcGVuZGVuY2llczogIWluc3RhbGxPcHRpb25zPy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzIH1dLCk7XG5cdFx0fVxuXG5cdFx0aWYgKGluc3RhbGxPcHRpb25zPy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFRdICE9PSBFeHRlbnNpb25JbnN0YWxsU291cmNlLlNFVFRJTkdTX1NZTkMpIHtcblxuXHRcdFx0YXdhaXQgdGhpcy5jaGVja0ZvcldvcmtzcGFjZVRydXN0KG1hbmlmZXN0LCBmYWxzZSk7XG5cblx0XHRcdGlmICghaW5zdGFsbE9wdGlvbnM/LmRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jaGVja0luc3RhbGxpbmdFeHRlbnNpb25PbldlYihnYWxsZXJ5LCBtYW5pZmVzdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2VydmVycyA9IHNlcnZlcnM/Lmxlbmd0aCA/IHRoaXMudmFsaWRTZXJ2ZXJzKGdhbGxlcnksIG1hbmlmZXN0LCBzZXJ2ZXJzKSA6IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcnNUb0luc3RhbGwoZ2FsbGVyeSwgbWFuaWZlc3QpO1xuXHRcdGlmICghaW5zdGFsbE9wdGlvbnMgfHwgaXNVbmRlZmluZWQoaW5zdGFsbE9wdGlvbnMuaXNNYWNoaW5lU2NvcGVkKSkge1xuXHRcdFx0Y29uc3QgaXNNYWNoaW5lU2NvcGVkID0gYXdhaXQgdGhpcy5oYXNUb0ZsYWdFeHRlbnNpb25zTWFjaGluZVNjb3BlZChbZ2FsbGVyeV0pO1xuXHRcdFx0aW5zdGFsbE9wdGlvbnMgPSB7IC4uLihpbnN0YWxsT3B0aW9ucyB8fCB7fSksIGlzTWFjaGluZVNjb3BlZCB9O1xuXHRcdH1cblxuXHRcdGlmICghaW5zdGFsbE9wdGlvbnMuaXNNYWNoaW5lU2NvcGVkICYmIHRoaXMuaXNFeHRlbnNpb25zU3luY0VuYWJsZWQoKSkge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHRcdCYmICFzZXJ2ZXJzLmluY2x1ZGVzKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKVxuXHRcdFx0XHQmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGdhbGxlcnkpID09PSB0cnVlKSB7XG5cdFx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2VzLnNldHRsZWQoc2VydmVycy5tYXAoc2VydmVyID0+IHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeSwgaW5zdGFsbE9wdGlvbnMpKSkudGhlbigoW2xvY2FsXSkgPT4gbG9jYWwpO1xuXHR9XG5cblx0YXN5bmMgZ2V0RXh0ZW5zaW9ucyhsb2NhdGlvbnM6IFVSSVtdKTogUHJvbWlzZTxJUmVzb3VyY2VFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2Nhbk11bHRpcGxlRXh0ZW5zaW9ucyhsb2NhdGlvbnMsIEV4dGVuc2lvblR5cGUuVXNlciwgeyBpbmNsdWRlSW52YWxpZDogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHQ6IElSZXNvdXJjZUV4dGVuc2lvbltdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Nhbm5lZEV4dGVuc2lvbnMubWFwKGFzeW5jIHNjYW5uZWRFeHRlbnNpb24gPT4ge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50b0xvY2FsV29ya3NwYWNlRXh0ZW5zaW9uKHNjYW5uZWRFeHRlbnNpb24pO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ3Jlc291cmNlJyxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiB3b3Jrc3BhY2VFeHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRsb2NhdGlvbjogd29ya3NwYWNlRXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdFx0XHRcdG1hbmlmZXN0OiB3b3Jrc3BhY2VFeHRlbnNpb24ubWFuaWZlc3QsXG5cdFx0XHRcdFx0Y2hhbmdlbG9nVXJpOiB3b3Jrc3BhY2VFeHRlbnNpb24uY2hhbmdlbG9nVXJsLFxuXHRcdFx0XHRcdHJlYWRtZVVyaTogd29ya3NwYWNlRXh0ZW5zaW9uLnJlYWRtZVVybCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25Mb2NhdGlvbnMoKTogVVJJW10ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnNMb2NhdGlvbnMoKTtcblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnMoaW5jbHVkZUludmFsaWQ6IGJvb2xlYW4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKGluY2x1ZGVJbnZhbGlkKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxSZXNvdXJjZUV4dGVuc2lvbihleHRlbnNpb246IElSZXNvdXJjZUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRpZiAoIXRoaXMuY2FuSW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhpcyBleHRlbnNpb24gY2Fubm90IGJlIGluc3RhbGxlZCBpbiB0aGUgY3VycmVudCB3b3Jrc3BhY2UuJyk7XG5cdFx0fVxuXHRcdGlmICghaW5zdGFsbE9wdGlvbnMuaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbGxGcm9tTG9jYXRpb24oZXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9IGZyb20gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX0gaW4gd29ya3NwYWNlYCk7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRXb3Jrc3BhY2VFeHRlbnNpb25zU2VydmVyKCk7XG5cdFx0dGhpcy5fb25JbnN0YWxsRXh0ZW5zaW9uLmZpcmUoe1xuXHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRzb3VyY2U6IGV4dGVuc2lvbi5sb2NhdGlvbixcblx0XHRcdHNlcnZlcixcblx0XHRcdGFwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSxcblx0XHRcdHByb2ZpbGVMb2NhdGlvbjogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSxcblx0XHRcdHdvcmtzcGFjZVNjb3BlZDogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JXb3Jrc3BhY2VUcnVzdChleHRlbnNpb24ubWFuaWZlc3QsIHRydWUpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb24gPSBhd2FpdCB0aGlzLndvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uKTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFN1Y2Nlc3NmdWxseSBpbnN0YWxsZWQgdGhlIGV4dGVuc2lvbiAke3dvcmtzcGFjZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfSBmcm9tICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9IGluIHRoZSB3b3Jrc3BhY2VgKTtcblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZmlyZShbe1xuXHRcdFx0XHRpZGVudGlmaWVyOiB3b3Jrc3BhY2VFeHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdFx0c291cmNlOiBleHRlbnNpb24ubG9jYXRpb24sXG5cdFx0XHRcdG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsLFxuXHRcdFx0XHRhcHBsaWNhdGlvblNjb3BlZDogZmFsc2UsXG5cdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSxcblx0XHRcdFx0bG9jYWw6IHdvcmtzcGFjZUV4dGVuc2lvbixcblx0XHRcdFx0d29ya3NwYWNlU2NvcGVkOiB0cnVlXG5cdFx0XHR9XSk7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlRXh0ZW5zaW9uO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBpbnN0YWxsIHRoZSBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH0gZnJvbSAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfSBpbiB0aGUgd29ya3NwYWNlYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUoW3tcblx0XHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdFx0XHRvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCxcblx0XHRcdFx0YXBwbGljYXRpb25TY29wZWQ6IGZhbHNlLFxuXHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0XHR3b3Jrc3BhY2VTY29wZWQ6IHRydWVcblx0XHRcdH1dKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxhYmxlU2VydmVycyhnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8SUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXT4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChnYWxsZXJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobG9jYWxpemUoJ01hbmlmZXN0IGlzIG5vdCBmb3VuZCcsIFwiSW5zdGFsbGluZyBFeHRlbnNpb24gezB9IGZhaWxlZDogTWFuaWZlc3QgaXMgbm90IGZvdW5kLlwiLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkubmFtZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRJbnN0YWxsYWJsZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJzKG1hbmlmZXN0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5pbnN0YWxsRXh0ZW5zaW9uRnJvbVdvcmtzcGFjZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBleHRlbnNpb24gaXMgbm90IGEgd29ya3NwYWNlIGV4dGVuc2lvbicpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBVbmluc3RhbGxpbmcgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH0gZnJvbSAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfWApO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0V29ya3NwYWNlRXh0ZW5zaW9uc1NlcnZlcigpO1xuXHRcdHRoaXMuX29uVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoe1xuXHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRzZXJ2ZXIsXG5cdFx0XHRhcHBsaWNhdGlvblNjb3BlZDogZmFsc2UsXG5cdFx0XHR3b3Jrc3BhY2VTY29wZWQ6IHRydWUsXG5cdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2Vcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChleHRlbnNpb24pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFN1Y2Nlc3NmdWxseSB1bmluc3RhbGxlZCB0aGUgd29ya3NwYWNlIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfSBmcm9tICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwge1xuXHRcdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdFx0Y29tbWVudDogJ1VuaW5zdGFsbCB3b3Jrc3BhY2UgZXh0ZW5zaW9uJztcblx0XHRcdH0+KCd3b3Jrc3BhY2VleHRlbnNpb246dW5pbnN0YWxsJyk7XG5cdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHtcblx0XHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdHNlcnZlcixcblx0XHRcdFx0YXBwbGljYXRpb25TY29wZWQ6IGZhbHNlLFxuXHRcdFx0XHR3b3Jrc3BhY2VTY29wZWQ6IHRydWUsXG5cdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHVuaW5zdGFsbCB0aGUgd29ya3NwYWNlIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfSBmcm9tICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9YCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHtcblx0XHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdHNlcnZlcixcblx0XHRcdFx0ZXJyb3IsXG5cdFx0XHRcdGFwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSxcblx0XHRcdFx0d29ya3NwYWNlU2NvcGVkOiB0cnVlLFxuXHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2Vcblx0XHRcdH0pO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZFNlcnZlcnMoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24sIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIHNlcnZlcnM6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10pOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdIHtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVNlcnZlcnMgPSB0aGlzLmdldEluc3RhbGxhYmxlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcnMobWFuaWZlc3QpO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdGlmICghaW5zdGFsbGFibGVTZXJ2ZXJzLmluY2x1ZGVzKHNlcnZlcikpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQgaW4gc2VydmVyJywgXCJDYW5ub3QgaW5zdGFsbCB0aGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGUgJ3sxfScgc2V0dXAuXCIsIGdhbGxlcnkuZGlzcGxheU5hbWUgfHwgZ2FsbGVyeS5uYW1lLCBzZXJ2ZXIubGFiZWwpKTtcblx0XHRcdFx0ZXJyb3IubmFtZSA9IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuVW5zdXBwb3J0ZWQ7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VydmVycztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcnNUb0luc3RhbGwoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24sIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBQcm9taXNlPElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10+IHtcblx0XHRjb25zdCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdID0gW107XG5cblx0XHQvLyBMYW5ndWFnZSBwYWNrcyBzaG91bGQgYmUgaW5zdGFsbGVkIG9uIGJvdGggbG9jYWwgYW5kIHJlbW90ZSBzZXJ2ZXJzXG5cdFx0aWYgKGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKG1hbmlmZXN0KSkge1xuXHRcdFx0c2VydmVycy5wdXNoKC4uLnRoaXMuc2VydmVycy5maWx0ZXIoc2VydmVyID0+IHNlcnZlciAhPT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSk7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBbc2VydmVyXSA9IHRoaXMuZ2V0SW5zdGFsbGFibGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVycyhtYW5pZmVzdCk7XG5cdFx0XHRpZiAoc2VydmVyKSB7XG5cdFx0XHRcdHNlcnZlcnMucHVzaChzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc2VydmVycy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgYmUgaW5zdGFsbGVkJywgXCJDYW5ub3QgaW5zdGFsbCB0aGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHNldHVwLlwiLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkubmFtZSkpO1xuXHRcdFx0ZXJyb3IubmFtZSA9IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuVW5zdXBwb3J0ZWQ7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2VydmVycztcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5zdGFsbGFibGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVycyhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSB7XG5cdFx0Ly8gT25seSBsb2NhbCBzZXJ2ZXJcblx0XHRpZiAodGhpcy5zZXJ2ZXJzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIFt0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcl07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyczogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0KTtcblx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgZXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0aWYgKGtpbmQgPT09ICd1aScgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0c2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTtcblx0XHRcdH1cblx0XHRcdGlmIChraW5kID09PSAnd29ya3NwYWNlJyAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0c2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2luZCA9PT0gJ3dlYicgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIExvY2FsIHNlcnZlciBjYW4gYWNjZXB0IGFueSBleHRlbnNpb24uXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmICFzZXJ2ZXJzLmluY2x1ZGVzKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSkge1xuXHRcdFx0c2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2VydmVycztcblx0fVxuXG5cdHByaXZhdGUgaXNFeHRlbnNpb25zU3luY0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhc1RvRmxhZ0V4dGVuc2lvbnNNYWNoaW5lU2NvcGVkKGV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5pc0V4dGVuc2lvbnNTeW5jRW5hYmxlZCgpKSB7XG5cdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxib29sZWFuPih7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGV4dGVuc2lvbnMubGVuZ3RoID09PSAxID8gbG9jYWxpemUoJ2luc3RhbGwgZXh0ZW5zaW9uJywgXCJJbnN0YWxsIEV4dGVuc2lvblwiKSA6IGxvY2FsaXplKCdpbnN0YWxsIGV4dGVuc2lvbnMnLCBcIkluc3RhbGwgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0ZGV0YWlsOiBleHRlbnNpb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2luc3RhbGwgc2luZ2xlIGV4dGVuc2lvbicsIFwiV291bGQgeW91IGxpa2UgdG8gaW5zdGFsbCBhbmQgc3luY2hyb25pemUgJ3swfScgZXh0ZW5zaW9uIGFjcm9zcyB5b3VyIGRldmljZXM/XCIsIGV4dGVuc2lvbnNbMF0uZGlzcGxheU5hbWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnaW5zdGFsbCBtdWx0aXBsZSBleHRlbnNpb25zJywgXCJXb3VsZCB5b3UgbGlrZSB0byBpbnN0YWxsIGFuZCBzeW5jaHJvbml6ZSBleHRlbnNpb25zIGFjcm9zcyB5b3VyIGRldmljZXM/XCIpLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnaW5zdGFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGxcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsIGFuZCBkbyBubyBzeW5jJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkluc3RhbGwgKERvICYmbm90IHN5bmMpXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD4ge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHwgbnVsbCB7XG5cdFx0aWYgKGV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlRXh0ZW5zaW9uc1NlcnZlcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZUV4dGVuc2lvbnNTZXJ2ZXIoKTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXI7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGV4dGVuc2lvbiBzZXJ2ZXIgZm91bmQnKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3RQdWJsaXNoZXJUcnVzdChleHRlbnNpb25zOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWFuaWZlc3RzID0gYXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9ucy5tYXAoYXN5bmMgKHsgZXh0ZW5zaW9uIH0pID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChleHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ01hbmlmZXN0IGlzIG5vdCBmb3VuZCcsIFwiSW5zdGFsbGluZyBFeHRlbnNpb24gezB9IGZhaWxlZDogTWFuaWZlc3QgaXMgbm90IGZvdW5kLlwiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtYW5pZmVzdDtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCB0aGlzLmNoZWNrRm9yVHJ1c3RlZFB1Ymxpc2hlcnMoZXh0ZW5zaW9ucy5tYXAoKGUsIGluZGV4KSA9PiAoeyBleHRlbnNpb246IGUuZXh0ZW5zaW9uLCBtYW5pZmVzdDogbWFuaWZlc3RzW2luZGV4XSwgY2hlY2tGb3JQYWNrQW5kRGVwZW5kZW5jaWVzOiAhZS5vcHRpb25zPy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yVHJ1c3RlZFB1Ymxpc2hlcnMoZXh0ZW5zaW9uczogeyBleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uOyBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0OyBjaGVja0ZvclBhY2tBbmREZXBlbmRlbmNpZXM6IGJvb2xlYW4gfVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdW50cnVzdGVkRXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHVudHJ1c3RlZEV4dGVuc2lvbk1hbmlmZXN0czogSUV4dGVuc2lvbk1hbmlmZXN0W10gPSBbXTtcblx0XHRjb25zdCBtYW5pZmVzdHNUb0dldE90aGVyVW50cnVzdGVkUHVibGlzaGVyczogSUV4dGVuc2lvbk1hbmlmZXN0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgZXh0ZW5zaW9uLCBtYW5pZmVzdCwgY2hlY2tGb3JQYWNrQW5kRGVwZW5kZW5jaWVzIH0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKCFleHRlbnNpb24ucHJpdmF0ZSAmJiAhdGhpcy5pc1B1Ymxpc2hlclRydXN0ZWQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHR1bnRydXN0ZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0dW50cnVzdGVkRXh0ZW5zaW9uTWFuaWZlc3RzLnB1c2gobWFuaWZlc3QpO1xuXHRcdFx0XHRpZiAoY2hlY2tGb3JQYWNrQW5kRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0bWFuaWZlc3RzVG9HZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMucHVzaChtYW5pZmVzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXVudHJ1c3RlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzID0gbWFuaWZlc3RzVG9HZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMubGVuZ3RoID8gYXdhaXQgdGhpcy5nZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMobWFuaWZlc3RzVG9HZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMpIDogW107XG5cdFx0Y29uc3QgYWxsUHVibGlzaGVycyA9IFsuLi5kaXN0aW5jdCh1bnRydXN0ZWRFeHRlbnNpb25zLCBlID0+IGUucHVibGlzaGVyKSwgLi4ub3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzXTtcblx0XHRjb25zdCB1bnZlcmZpaWVkUHVibGlzaGVycyA9IGFsbFB1Ymxpc2hlcnMuZmlsdGVyKHAgPT4gIXAucHVibGlzaGVyRG9tYWluPy52ZXJpZmllZCk7XG5cdFx0Y29uc3QgdmVyaWZpZWRQdWJsaXNoZXJzID0gYWxsUHVibGlzaGVycy5maWx0ZXIocCA9PiBwLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpO1xuXG5cdFx0dHlwZSBUcnVzdFB1Ymxpc2hlckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnUmVwb3J0IHRoZSBhY3Rpb24gdGFrZW4gYnkgdGhlIHVzZXIgb24gdGhlIHB1Ymxpc2hlciB0cnVzdCBkaWFsb2cnO1xuXHRcdFx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGlvbiB0YWtlbiBieSB0aGUgdXNlciBvbiB0aGUgcHVibGlzaGVyIHRydXN0IGRpYWxvZy4gQ2FuIGJlIHRydXN0LCBsZWFybiBtb3JlIG9yIGNhbmNlbC4nIH07XG5cdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVycyBvZiB0aGUgZXh0ZW5zaW9uIGZvciB3aGljaCB0aGUgcHVibGlzaGVyIHRydXN0IGRpYWxvZyB3YXMgc2hvd24uJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBUcnVzdFB1Ymxpc2hlckV2ZW50ID0ge1xuXHRcdFx0YWN0aW9uOiBzdHJpbmc7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YWxsQnV0dG9uOiBJUHJvbXB0QnV0dG9uPHZvaWQ+ID0ge1xuXHRcdFx0bGFiZWw6IGFsbFB1Ymxpc2hlcnMubGVuZ3RoID4gMSA/IGxvY2FsaXplKHsga2V5OiAndHJ1c3QgcHVibGlzaGVycyBhbmQgaW5zdGFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJUcnVzdCBQdWJsaXNoZXJzICYgJiZJbnN0YWxsXCIpIDogbG9jYWxpemUoeyBrZXk6ICd0cnVzdCBhbmQgaW5zdGFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJUcnVzdCBQdWJsaXNoZXIgJiAmJkluc3RhbGxcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VHJ1c3RQdWJsaXNoZXJFdmVudCwgVHJ1c3RQdWJsaXNoZXJDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnM6dHJ1c3RQdWJsaXNoZXInLCB7IGFjdGlvbjogJ3RydXN0JywgZXh0ZW5zaW9uSWQ6IHVudHJ1c3RlZEV4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsJykgfSk7XG5cdFx0XHRcdHRoaXMudHJ1c3RQdWJsaXNoZXJzKC4uLmFsbFB1Ymxpc2hlcnMubWFwKHAgPT4gKHsgcHVibGlzaGVyOiBwLnB1Ymxpc2hlciwgcHVibGlzaGVyRGlzcGxheU5hbWU6IHAucHVibGlzaGVyRGlzcGxheU5hbWUgfSkpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbGVhcm5Nb3JlQnV0dG9uOiBJUHJvbXB0QnV0dG9uPHZvaWQ+ID0ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnbGVhcm5Nb3JlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTGVhcm4gTW9yZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUcnVzdFB1Ymxpc2hlckV2ZW50LCBUcnVzdFB1Ymxpc2hlckNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uczp0cnVzdFB1Ymxpc2hlcicsIHsgYWN0aW9uOiAnbGVhcm4nLCBleHRlbnNpb25JZDogdW50cnVzdGVkRXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpLmpvaW4oJywnKSB9KTtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLm9wZW4nLCBVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1leHRlbnNpb24tc2VjdXJpdHknKSkpO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0UHVibGlzaGVyTGluayA9ICh7IHB1Ymxpc2hlckRpc3BsYXlOYW1lLCBwdWJsaXNoZXJMaW5rIH06IHsgcHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZzsgcHVibGlzaGVyTGluaz86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRyZXR1cm4gcHVibGlzaGVyTGluayA/IGBbJHtwdWJsaXNoZXJEaXNwbGF5TmFtZX1dKCR7cHVibGlzaGVyTGlua30pYCA6IHB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXHRcdH07XG5cblx0XHRjb25zdCB1bnZlcmlmaWVkTGluayA9ICdodHRwczovL2FrYS5tcy92c2NvZGUtdmVyaWZ5LXB1Ymxpc2hlcic7XG5cblx0XHRjb25zdCB0aXRsZSA9IGFsbFB1Ymxpc2hlcnMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGVja1RydXN0ZWRQdWJsaXNoZXJUaXRsZScsIFwiRG8geW91IHRydXN0IHRoZSBwdWJsaXNoZXIgXFxcInswfVxcXCI/XCIsIGFsbFB1Ymxpc2hlcnNbMF0ucHVibGlzaGVyRGlzcGxheU5hbWUpXG5cdFx0XHQ6IGFsbFB1Ymxpc2hlcnMubGVuZ3RoID09PSAyXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoZWNrVHdvVHJ1c3RlZFB1Ymxpc2hlcnNUaXRsZScsIFwiRG8geW91IHRydXN0IHB1Ymxpc2hlcnMgXFxcInswfVxcXCIgYW5kIFxcXCJ7MX1cXFwiP1wiLCBhbGxQdWJsaXNoZXJzWzBdLnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBhbGxQdWJsaXNoZXJzWzFdLnB1Ymxpc2hlckRpc3BsYXlOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGVja0FsbFRydXN0ZWRQdWJsaXNoZXJzVGl0bGUnLCBcIkRvIHlvdSB0cnVzdCB0aGUgcHVibGlzaGVyIFxcXCJ7MH1cXFwiIGFuZCB7MX0gb3RoZXJzP1wiLCBhbGxQdWJsaXNoZXJzWzBdLnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBhbGxQdWJsaXNoZXJzLmxlbmd0aCAtIDEpO1xuXG5cdFx0Y29uc3QgY3VzdG9tTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSwgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXG5cdFx0aWYgKHVudHJ1c3RlZEV4dGVuc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB1bnRydXN0ZWRFeHRlbnNpb25zWzBdO1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSB1bnRydXN0ZWRFeHRlbnNpb25NYW5pZmVzdHNbMF07XG5cdFx0XHRpZiAob3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdleHRlbnNpb24gcHVibGlzaGVkIGJ5IG1lc3NhZ2UnLCBcIlRoZSBleHRlbnNpb24gezB9IGlzIHB1Ymxpc2hlZCBieSB7MX0uXCIsIGBbJHtleHRlbnNpb24uZGlzcGxheU5hbWV9XSgke2V4dGVuc2lvbi5kZXRhaWxzTGlua30pYCwgZ2V0UHVibGlzaGVyTGluayhleHRlbnNpb24pKSk7XG5cdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oJyZuYnNwOycpO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kVXJpID0gY3JlYXRlQ29tbWFuZFVyaSgnZXh0ZW5zaW9uLm9wZW4nLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgbWFuaWZlc3QuZXh0ZW5zaW9uUGFjaz8ubGVuZ3RoID8gJ2V4dGVuc2lvblBhY2snIDogJ2RlcGVuZGVuY2llcycpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChvdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnc2luZ2xlVW50cnVzdGVkUHVibGlzaGVyJywgXCJJbnN0YWxsaW5nIHRoaXMgZXh0ZW5zaW9uIHdpbGwgYWxzbyBpbnN0YWxsIFtleHRlbnNpb25zXSh7MH0pIHB1Ymxpc2hlZCBieSB7MX0uXCIsIGNvbW1hbmRVcmksIGdldFB1Ymxpc2hlckxpbmsob3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzWzBdKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ21lc3NhZ2UzJywgXCJJbnN0YWxsaW5nIHRoaXMgZXh0ZW5zaW9uIHdpbGwgYWxzbyBpbnN0YWxsIFtleHRlbnNpb25zXSh7MH0pIHB1Ymxpc2hlZCBieSB7MX0gYW5kIHsyfS5cIiwgY29tbWFuZFVyaSwgb3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLnNsaWNlKDAsIG90aGVyVW50cnVzdGVkUHVibGlzaGVycy5sZW5ndGggLSAxKS5tYXAocCA9PiBnZXRQdWJsaXNoZXJMaW5rKHApKS5qb2luKCcsICcpLCBnZXRQdWJsaXNoZXJMaW5rKG90aGVyVW50cnVzdGVkUHVibGlzaGVyc1tvdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMubGVuZ3RoIC0gMV0pKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bignJm5ic3A7Jyk7XG5cdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2ZpcnN0VGltZUluc3RhbGxpbmdNZXNzYWdlJywgXCJUaGlzIGlzIHRoZSBmaXJzdCB0aW1lIHlvdSdyZSBpbnN0YWxsaW5nIGV4dGVuc2lvbnMgZnJvbSB0aGVzZSBwdWJsaXNoZXJzLlwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdtZXNzYWdlMScsIFwiVGhlIGV4dGVuc2lvbiB7MH0gaXMgcHVibGlzaGVkIGJ5IHsxfS4gVGhpcyBpcyB0aGUgZmlyc3QgZXh0ZW5zaW9uIHlvdSdyZSBpbnN0YWxsaW5nIGZyb20gdGhpcyBwdWJsaXNoZXIuXCIsIGBbJHtleHRlbnNpb24uZGlzcGxheU5hbWV9XSgke2V4dGVuc2lvbi5kZXRhaWxzTGlua30pYCwgZ2V0UHVibGlzaGVyTGluayhleHRlbnNpb24pKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ211bHRpSW5zdGFsbE1lc3NhZ2UnLCBcIlRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgeW91J3JlIGluc3RhbGxpbmcgZXh0ZW5zaW9ucyBmcm9tIHB1Ymxpc2hlcnMgezB9IGFuZCB7MX0uXCIsIGdldFB1Ymxpc2hlckxpbmsoYWxsUHVibGlzaGVyc1swXSksIGdldFB1Ymxpc2hlckxpbmsoYWxsUHVibGlzaGVyc1thbGxQdWJsaXNoZXJzLmxlbmd0aCAtIDFdKSkpO1xuXHRcdH1cblxuXHRcdGlmICh2ZXJpZmllZFB1Ymxpc2hlcnMubGVuZ3RoIHx8IHVudmVyZmlpZWRQdWJsaXNoZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Zm9yIChjb25zdCBwdWJsaXNoZXIgb2YgdmVyaWZpZWRQdWJsaXNoZXJzKSB7XG5cdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kVGV4dCgnXFxuJyk7XG5cdFx0XHRcdGNvbnN0IHB1Ymxpc2hlclZlcmlmaWVkTWVzc2FnZSA9IGxvY2FsaXplKCd2ZXJpZmllZFB1Ymxpc2hlcldpdGhOYW1lJywgXCJ7MH0gaGFzIHZlcmlmaWVkIG93bmVyc2hpcCBvZiB7MX0uXCIsIGdldFB1Ymxpc2hlckxpbmsocHVibGlzaGVyKSwgYFskKGxpbmstZXh0ZXJuYWwpICR7VVJJLnBhcnNlKHB1Ymxpc2hlci5wdWJsaXNoZXJEb21haW4hLmxpbmspLmF1dGhvcml0eX1dKCR7cHVibGlzaGVyLnB1Ymxpc2hlckRvbWFpbiEubGlua30pYCk7XG5cdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCQoJHt2ZXJpZmllZFB1Ymxpc2hlckljb24uaWR9KSZuYnNwOyR7cHVibGlzaGVyVmVyaWZpZWRNZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVudmVyZmlpZWRQdWJsaXNoZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZFRleHQoJ1xcbicpO1xuXHRcdFx0XHRpZiAodW52ZXJmaWllZFB1Ymxpc2hlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihgJCgke0NvZGljb24udW52ZXJpZmllZC5pZH0pJm5ic3A7JHtsb2NhbGl6ZSgndW52ZXJpZmllZFB1Ymxpc2hlcldpdGhOYW1lJywgXCJ7MH0gaXMgWyoqbm90KiogdmVyaWZpZWRdKHsxfSkuXCIsIGdldFB1Ymxpc2hlckxpbmsodW52ZXJmaWllZFB1Ymxpc2hlcnNbMF0pLCB1bnZlcmlmaWVkTGluayl9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihgJCgke0NvZGljb24udW52ZXJpZmllZC5pZH0pJm5ic3A7JHtsb2NhbGl6ZSgndW52ZXJpZmllZFB1Ymxpc2hlcnMnLCBcInswfSBhbmQgezF9IGFyZSBbKipub3QqKiB2ZXJpZmllZF0oezJ9KS5cIiwgdW52ZXJmaWllZFB1Ymxpc2hlcnMuc2xpY2UoMCwgdW52ZXJmaWllZFB1Ymxpc2hlcnMubGVuZ3RoIC0gMSkubWFwKHAgPT4gZ2V0UHVibGlzaGVyTGluayhwKSkuam9pbignLCAnKSwgZ2V0UHVibGlzaGVyTGluayh1bnZlcmZpaWVkUHVibGlzaGVyc1t1bnZlcmZpaWVkUHVibGlzaGVycy5sZW5ndGggLSAxXSksIHVudmVyaWZpZWRMaW5rKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZFRleHQoJ1xcbicpO1xuXHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihgJCgke0NvZGljb24udW52ZXJpZmllZC5pZH0pJm5ic3A7JHtsb2NhbGl6ZSgnYWxsVW52ZXJpZmVkJywgXCJBbGwgcHVibGlzaGVycyBhcmUgWyoqbm90KiogdmVyaWZpZWRdKHswfSkuXCIsIHVudmVyaWZpZWRMaW5rKX1gKTtcblx0XHR9XG5cblx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZFRleHQoJ1xcbicpO1xuXHRcdGlmIChhbGxQdWJsaXNoZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ21lc3NhZ2U0JywgXCJ7MH0gaGFzIG5vIGNvbnRyb2wgb3ZlciB0aGUgYmVoYXZpb3Igb2YgdGhpcmQtcGFydHkgZXh0ZW5zaW9ucywgaW5jbHVkaW5nIGhvdyB0aGV5IG1hbmFnZSB5b3VyIHBlcnNvbmFsIGRhdGEuIFByb2NlZWQgb25seSBpZiB5b3UgdHJ1c3QgdGhlIHB1Ymxpc2hlcnMuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnbWVzc2FnZTInLCBcInswfSBoYXMgbm8gY29udHJvbCBvdmVyIHRoZSBiZWhhdmlvciBvZiB0aGlyZC1wYXJ0eSBleHRlbnNpb25zLCBpbmNsdWRpbmcgaG93IHRoZXkgbWFuYWdlIHlvdXIgcGVyc29uYWwgZGF0YS4gUHJvY2VlZCBvbmx5IGlmIHlvdSB0cnVzdCB0aGUgcHVibGlzaGVyLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRtZXNzYWdlOiB0aXRsZSxcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRidXR0b25zOiBbaW5zdGFsbEJ1dHRvbiwgbGVhcm5Nb3JlQnV0dG9uXSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUcnVzdFB1Ymxpc2hlckV2ZW50LCBUcnVzdFB1Ymxpc2hlckNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uczp0cnVzdFB1Ymxpc2hlcicsIHsgYWN0aW9uOiAnY2FuY2VsJywgZXh0ZW5zaW9uSWQ6IHVudHJ1c3RlZEV4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsJykgfSk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRjdXN0b206IHtcblx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbeyBtYXJrZG93bjogY3VzdG9tTWVzc2FnZSwgY2xhc3NlczogWydleHRlbnNpb25zLW1hbmFnZW1lbnQtcHVibGlzaGVyLXRydXN0LWRpYWxvZyddIH1dLFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE90aGVyVW50cnVzdGVkUHVibGlzaGVycyhtYW5pZmVzdHM6IElFeHRlbnNpb25NYW5pZmVzdFtdKTogUHJvbWlzZTx7IHB1Ymxpc2hlcjogc3RyaW5nOyBwdWJsaXNoZXJEaXNwbGF5TmFtZTogc3RyaW5nOyBwdWJsaXNoZXJMaW5rPzogc3RyaW5nOyBwdWJsaXNoZXJEb21haW4/OiB7IGxpbms6IHN0cmluZzsgdmVyaWZpZWQ6IGJvb2xlYW4gfSB9W10+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IG1hbmlmZXN0IG9mIG1hbmlmZXN0cykge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBbLi4uKG1hbmlmZXN0LmV4dGVuc2lvblBhY2sgPz8gW10pLCAuLi4obWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzID8/IFtdKV0pIHtcblx0XHRcdFx0Y29uc3QgW3B1Ymxpc2hlcklkXSA9IGlkLnNwbGl0KCcuJyk7XG5cdFx0XHRcdGlmIChwdWJsaXNoZXJJZC50b0xvd2VyQ2FzZSgpID09PSBtYW5pZmVzdC5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmlzUHVibGlzaGVyVXNlclRydXN0ZWQocHVibGlzaGVySWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25JZHMuYWRkKGlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWV4dGVuc2lvbklkcy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+KCk7XG5cdFx0YXdhaXQgdGhpcy5nZXREZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zUmVjdXJzaXZlbHkoWy4uLmV4dGVuc2lvbklkc10sIGV4dGVuc2lvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlcnMgPSBuZXcgTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBbLCBleHRlbnNpb25dIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb24ucHJpdmF0ZSB8fCB0aGlzLmlzUHVibGlzaGVyVHJ1c3RlZChleHRlbnNpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cHVibGlzaGVycy5zZXQoZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBleHRlbnNpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnB1Ymxpc2hlcnMudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zUmVjdXJzaXZlbHkodG9HZXQ6IHN0cmluZ1tdLCByZXN1bHQ6IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRvR2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnModG9HZXQubWFwKGlkID0+ICh7IGlkIH0pKSwgdG9rZW4pO1xuXHRcdGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IGV4dGVuc2lvbnMubGVuZ3RoOyBpZHgrKykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uc1tpZHhdO1xuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdH1cblx0XHR0b0dldCA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkoZXh0ZW5zaW9uLnByb3BlcnRpZXMuZGVwZW5kZW5jaWVzKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmRlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdGlmICghcmVzdWx0LmhhcyhpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0dG9HZXQucHVzaChpZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmV4dGVuc2lvblBhY2spKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgZXh0ZW5zaW9uLnByb3BlcnRpZXMuZXh0ZW5zaW9uUGFjaykge1xuXHRcdFx0XHRcdGlmICghcmVzdWx0LmhhcyhpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0dG9HZXQucHVzaChpZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnNSZWN1cnNpdmVseSh0b0dldCwgcmVzdWx0LCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yV29ya3NwYWNlVHJ1c3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgcmVxdWlyZVRydXN0OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHJlcXVpcmVUcnVzdCB8fCB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUobWFuaWZlc3QpID09PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogV29ya3NwYWNlVHJ1c3RSZXF1ZXN0QnV0dG9uW10gPSBbXTtcblx0XHRcdGJ1dHRvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uSW5zdGFsbFdvcmtzcGFjZVRydXN0QnV0dG9uJywgXCJUcnVzdCBXb3Jrc3BhY2UgJiBJbnN0YWxsXCIpLCB0eXBlOiAnQ29udGludWVXaXRoVHJ1c3QnIH0pO1xuXHRcdFx0aWYgKCFyZXF1aXJlVHJ1c3QpIHtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25JbnN0YWxsV29ya3NwYWNlVHJ1c3RDb250aW51ZUJ1dHRvbicsIFwiSW5zdGFsbFwiKSwgdHlwZTogJ0NvbnRpbnVlV2l0aG91dFRydXN0JyB9KTtcblx0XHRcdH1cblx0XHRcdGJ1dHRvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uSW5zdGFsbFdvcmtzcGFjZVRydXN0TWFuYWdlQnV0dG9uJywgXCJMZWFybiBNb3JlXCIpLCB0eXBlOiAnTWFuYWdlJyB9KTtcblx0XHRcdGNvbnN0IHRydXN0U3RhdGUgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2V4dGVuc2lvbkluc3RhbGxXb3Jrc3BhY2VUcnVzdE1lc3NhZ2UnLCBcIkVuYWJsaW5nIHRoaXMgZXh0ZW5zaW9uIHJlcXVpcmVzIGEgdHJ1c3RlZCB3b3Jrc3BhY2UuXCIpLFxuXHRcdFx0XHRidXR0b25zXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRydXN0U3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrSW5zdGFsbGluZ0V4dGVuc2lvbk9uV2ViKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zZXJ2ZXJzLmxlbmd0aCAhPT0gMSB8fCB0aGlzLnNlcnZlcnNbMF0gIT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vbldlYkV4dGVuc2lvbnMgPSBbXTtcblx0XHRpZiAobWFuaWZlc3QuZXh0ZW5zaW9uUGFjaz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKG1hbmlmZXN0LmV4dGVuc2lvblBhY2subWFwKGlkID0+ICh7IGlkIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLnNlcnZlcnNbMF0uZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24pICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0bm9uV2ViRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChub25XZWJFeHRlbnNpb25zLmxlbmd0aCAmJiBub25XZWJFeHRlbnNpb25zLmxlbmd0aCA9PT0gZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcignTm90IHN1cHBvcnRlZCBpbiBXZWInLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVuc3VwcG9ydGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcm9kdWN0TmFtZSA9IGxvY2FsaXplKCdWUyBDb2RlIGZvciBXZWInLCBcInswfSBmb3IgdGhlIFdlYlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblx0XHRjb25zdCB2aXJ0dWFsV29ya3NwYWNlU3VwcG9ydCA9IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUobWFuaWZlc3QpO1xuXHRcdGNvbnN0IHZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0UmVhc29uID0gZ2V0V29ya3NwYWNlU3VwcG9ydFR5cGVNZXNzYWdlKG1hbmlmZXN0LmNhcGFiaWxpdGllcz8udmlydHVhbFdvcmtzcGFjZXMpO1xuXHRcdGNvbnN0IGhhc0xpbWl0ZWRTdXBwb3J0ID0gdmlydHVhbFdvcmtzcGFjZVN1cHBvcnQgPT09ICdsaW1pdGVkJyB8fCAhIXZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0UmVhc29uO1xuXG5cdFx0aWYgKCFub25XZWJFeHRlbnNpb25zLmxlbmd0aCAmJiAhaGFzTGltaXRlZFN1cHBvcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsaW1pdGVkU3VwcG9ydE1lc3NhZ2UgPSBsb2NhbGl6ZSgnbGltaXRlZCBzdXBwb3J0JywgXCInezB9JyBoYXMgbGltaXRlZCBmdW5jdGlvbmFsaXR5IGluIHsxfS5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwcm9kdWN0TmFtZSk7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRsZXQgYnV0dG9uczogSVByb21wdEJ1dHRvbjx2b2lkPltdID0gW107XG5cdFx0bGV0IGRldGFpbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgaW5zdGFsbEFueXdheUJ1dHRvbjogSVByb21wdEJ1dHRvbjx2b2lkPiA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2luc3RhbGwgYW55d2F5cycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGwgQW55d2F5XCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7IH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hvd0V4dGVuc2lvbnNCdXR0b246IElQcm9tcHRCdXR0b248dm9pZD4gPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdzaG93RXh0ZW5zaW9ucycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNob3cgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLm9wZW4nLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgJ2V4dGVuc2lvblBhY2snKSlcblx0XHR9O1xuXG5cdFx0aWYgKG5vbldlYkV4dGVuc2lvbnMubGVuZ3RoICYmIGhhc0xpbWl0ZWRTdXBwb3J0KSB7XG5cdFx0XHRtZXNzYWdlID0gbGltaXRlZFN1cHBvcnRNZXNzYWdlO1xuXHRcdFx0ZGV0YWlsID0gYCR7dmlydHVhbFdvcmtzcGFjZVN1cHBvcnRSZWFzb24gPyBgJHt2aXJ0dWFsV29ya3NwYWNlU3VwcG9ydFJlYXNvbn1cXG5gIDogJyd9JHtsb2NhbGl6ZSgnbm9uIHdlYiBleHRlbnNpb25zIGRldGFpbCcsIFwiQ29udGFpbnMgZXh0ZW5zaW9ucyB3aGljaCBhcmUgbm90IHN1cHBvcnRlZC5cIil9YDtcblx0XHRcdGJ1dHRvbnMgPSBbXG5cdFx0XHRcdGluc3RhbGxBbnl3YXlCdXR0b24sXG5cdFx0XHRcdHNob3dFeHRlbnNpb25zQnV0dG9uXG5cdFx0XHRdO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGhhc0xpbWl0ZWRTdXBwb3J0KSB7XG5cdFx0XHRtZXNzYWdlID0gbGltaXRlZFN1cHBvcnRNZXNzYWdlO1xuXHRcdFx0ZGV0YWlsID0gdmlydHVhbFdvcmtzcGFjZVN1cHBvcnRSZWFzb24gfHwgdW5kZWZpbmVkO1xuXHRcdFx0YnV0dG9ucyA9IFtpbnN0YWxsQW55d2F5QnV0dG9uXTtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnbm9uIHdlYiBleHRlbnNpb25zJywgXCInezB9JyBjb250YWlucyBleHRlbnNpb25zIHdoaWNoIGFyZSBub3Qgc3VwcG9ydGVkIGluIHsxfS5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwcm9kdWN0TmFtZSk7XG5cdFx0XHRidXR0b25zID0gW1xuXHRcdFx0XHRpbnN0YWxsQW55d2F5QnV0dG9uLFxuXHRcdFx0XHRzaG93RXh0ZW5zaW9uc0J1dHRvblxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRydW46ICgpID0+IHsgdGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7IH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3RhcmdldFBsYXRmb3JtUHJvbWlzZTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4gfCB1bmRlZmluZWQ7XG5cdGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHtcblx0XHRpZiAoIXRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlID0gY29tcHV0ZVRhcmdldFBsYXRmb3JtKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2U7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLnNlcnZlcnMubWFwKHNlcnZlciA9PiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2xlYW5VcCgpKSk7XG5cdH1cblxuXHR0b2dnbGVBcHBsaWNhdGlvblNjb3BlKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKGV4dGVuc2lvbik7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50b2dnbGVBcHBsaWNhdGlvblNjb3BlKGV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpO1xuXHR9XG5cblx0Y29weUV4dGVuc2lvbnMoZnJvbTogVVJJLCB0bzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNvcHlFeHRlbnNpb25zKGZyb20sIHRvKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jb3B5RXh0ZW5zaW9ucyhmcm9tLCB0byk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHJlZ2lzdGVyUGFydGljaXBhbnQoKSB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cdGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXG5cdGlzUHVibGlzaGVyVHJ1c3RlZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHVibGlzaGVyID0gZXh0ZW5zaW9uLnB1Ymxpc2hlci50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh0aGlzLmRlZmF1bHRUcnVzdGVkUHVibGlzaGVycy5pbmNsdWRlcyhwdWJsaXNoZXIpIHx8IHRoaXMuZGVmYXVsdFRydXN0ZWRQdWJsaXNoZXJzLmluY2x1ZGVzKGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGV4dGVuc2lvbiBpcyBhbGxvd2VkIGJ5IHB1Ymxpc2hlciBvciBleHRlbnNpb24gaWRcblx0XHRpZiAodGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuYWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSAmJiB0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaXNQdWJsaXNoZXJVc2VyVHJ1c3RlZChwdWJsaXNoZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1B1Ymxpc2hlclVzZXJUcnVzdGVkKHB1Ymxpc2hlcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSB0aGlzLmdldFRydXN0ZWRQdWJsaXNoZXJzRnJvbVN0b3JhZ2UoKTtcblx0XHRyZXR1cm4gISF0cnVzdGVkUHVibGlzaGVyc1twdWJsaXNoZXJdO1xuXHR9XG5cblx0Z2V0VHJ1c3RlZFB1Ymxpc2hlcnMoKTogSVB1Ymxpc2hlckluZm9bXSB7XG5cdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSB0aGlzLmdldFRydXN0ZWRQdWJsaXNoZXJzRnJvbVN0b3JhZ2UoKTtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModHJ1c3RlZFB1Ymxpc2hlcnMpLm1hcChwdWJsaXNoZXIgPT4gdHJ1c3RlZFB1Ymxpc2hlcnNbcHVibGlzaGVyXSk7XG5cdH1cblxuXHR0cnVzdFB1Ymxpc2hlcnMoLi4ucHVibGlzaGVyczogSVB1Ymxpc2hlckluZm9bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gdGhpcy5nZXRUcnVzdGVkUHVibGlzaGVyc0Zyb21TdG9yYWdlKCk7XG5cdFx0Zm9yIChjb25zdCBwdWJsaXNoZXIgb2YgcHVibGlzaGVycykge1xuXHRcdFx0dHJ1c3RlZFB1Ymxpc2hlcnNbcHVibGlzaGVyLnB1Ymxpc2hlci50b0xvd2VyQ2FzZSgpXSA9IHB1Ymxpc2hlcjtcblx0XHR9XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShUcnVzdGVkUHVibGlzaGVyc1N0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KHRydXN0ZWRQdWJsaXNoZXJzKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0dW50cnVzdFB1Ymxpc2hlcnMoLi4ucHVibGlzaGVyczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVycyA9IHRoaXMuZ2V0VHJ1c3RlZFB1Ymxpc2hlcnNGcm9tU3RvcmFnZSgpO1xuXHRcdGZvciAoY29uc3QgcHVibGlzaGVyIG9mIHB1Ymxpc2hlcnMpIHtcblx0XHRcdGRlbGV0ZSB0cnVzdGVkUHVibGlzaGVyc1twdWJsaXNoZXIudG9Mb3dlckNhc2UoKV07XG5cdFx0fVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVHJ1c3RlZFB1Ymxpc2hlcnNTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeSh0cnVzdGVkUHVibGlzaGVycyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJ1c3RlZFB1Ymxpc2hlcnNGcm9tU3RvcmFnZSgpOiBJU3RyaW5nRGljdGlvbmFyeTxJUHVibGlzaGVySW5mbz4ge1xuXHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8SVN0cmluZ0RpY3Rpb25hcnk8SVB1Ymxpc2hlckluZm8+PihUcnVzdGVkUHVibGlzaGVyc1N0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwge30pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHRydXN0ZWRQdWJsaXNoZXJzKSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVHJ1c3RlZFB1Ymxpc2hlcnNTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0cnVzdGVkUHVibGlzaGVycykucmVkdWNlPElTdHJpbmdEaWN0aW9uYXJ5PElQdWJsaXNoZXJJbmZvPj4oKHJlc3VsdCwgcHVibGlzaGVyKSA9PiB7XG5cdFx0XHRyZXN1bHRbcHVibGlzaGVyLnRvTG93ZXJDYXNlKCldID0gdHJ1c3RlZFB1Ymxpc2hlcnNbcHVibGlzaGVyXTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgV09SS1NQQUNFX0VYVEVOU0lPTlNfS0VZID0gJ3dvcmtzcGFjZUV4dGVuc2lvbnMubG9jYXRpb25zJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUludmFsaWRFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUxvY2FsRXh0ZW5zaW9uW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUludmFsaWRFeHRlbnNpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VJbnZhbGlkRXh0ZW5zaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbGl6ZVByb21pc2U6IFByb21pc2U8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnZhbGlkRXh0ZW5zaW9uV2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC50aHJvdHRsZTxGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlc0V2ZW50W10+KHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgKGxhc3QsIGUpID0+IHtcblx0XHRcdChsYXN0ID0gbGFzdCA/PyBbXSkucHVzaChlKTtcblx0XHRcdHJldHVybiBsYXN0O1xuXHRcdH0sIDEwMDAsIGZhbHNlKShldmVudHMgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlZEludmFsaWRFeHRlbnNpb25zID0gdGhpcy5leHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWV4dGVuc2lvbi5pc1ZhbGlkICYmIGV2ZW50cy5zb21lKGUgPT4gZS5hZmZlY3RzKGV4dGVuc2lvbi5sb2NhdGlvbikpKTtcblx0XHRcdGlmIChjaGFuZ2VkSW52YWxpZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tFeHRlbnNpb25zVmFsaWRpdHkoY2hhbmdlZEludmFsaWRFeHRlbnNpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmluaXRpYWxpemVQcm9taXNlID0gdGhpcy5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdMb2NhdGlvbnMgPSB0aGlzLmdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnNMb2NhdGlvbnMoKTtcblx0XHRpZiAoIWV4aXN0aW5nTG9jYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleGlzdGluZ0xvY2F0aW9ucy5tYXAoYXN5bmMgbG9jYXRpb24gPT4ge1xuXHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UobG9jYXRpb24pKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZW1vdmluZyB0aGUgd29ya3NwYWNlIGV4dGVuc2lvbiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9IGFzIGl0IGlzIG5vdCBpbnNpZGUgdGhlIHdvcmtzcGFjZWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhsb2NhdGlvbikpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZW1vdmluZyB0aGUgd29ya3NwYWNlIGV4dGVuc2lvbiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9IGFzIGl0IGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2NhbldvcmtzcGFjZUV4dGVuc2lvbihsb2NhdGlvbik7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGluZyB3b3Jrc3BhY2UgZXh0ZW5zaW9uICR7bG9jYXRpb24udG9TdHJpbmcoKX0gYXMgaXQgZG9lcyBub3QgZXhpc3RgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdTa2lwcGluZyB0aGUgd29ya3NwYWNlIGV4dGVuc2lvbicsIGxvY2F0aW9uLnRvU3RyaW5nKCksIGVycm9yKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnNhdmVXb3Jrc3BhY2VFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoSW52YWxpZEV4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnZhbGlkRXh0ZW5zaW9uV2F0Y2hlcnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLmlzVmFsaWQpIHtcblx0XHRcdFx0dGhpcy5pbnZhbGlkRXh0ZW5zaW9uV2F0Y2hlcnMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2goZXh0ZW5zaW9uLmxvY2F0aW9uKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0V4dGVuc2lvbnNWYWxpZGl0eShleHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhbGlkRXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zLm1hcChhc3luYyBleHRlbnNpb24gPT4ge1xuXHRcdFx0Y29uc3QgbmV3RXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5zY2FuV29ya3NwYWNlRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbik7XG5cdFx0XHRpZiAobmV3RXh0ZW5zaW9uPy5pc1ZhbGlkKSB7XG5cdFx0XHRcdHZhbGlkRXh0ZW5zaW9ucy5wdXNoKG5ld0V4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB2YWxpZEV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5leHRlbnNpb25zLmZpbmRJbmRleChlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUubG9jYXRpb24sIGV4dGVuc2lvbi5sb2NhdGlvbikpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25zLnNwbGljZShpbmRleCwgMSwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5zYXZlV29ya3NwYWNlRXh0ZW5zaW9ucygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnZhbGlkRXh0ZW5zaW9ucy5maXJlKHZhbGlkRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKGluY2x1ZGVJbnZhbGlkOiBib29sZWFuKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVByb21pc2U7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBpbmNsdWRlSW52YWxpZCB8fCBlLmlzVmFsaWQpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChleHRlbnNpb246IElSZXNvdXJjZUV4dGVuc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplUHJvbWlzZTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2NhbldvcmtzcGFjZUV4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdGlmICghd29ya3NwYWNlRXh0ZW5zaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBpbnN0YWxsIHRoZSBleHRlbnNpb24gYXMgaXQgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RpbmdFeHRlbnNpb25JbmRleCA9IHRoaXMuZXh0ZW5zaW9ucy5maW5kSW5kZXgoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uSW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnMucHVzaCh3b3Jrc3BhY2VFeHRlbnNpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnMuc3BsaWNlKGV4aXN0aW5nRXh0ZW5zaW9uSW5kZXgsIDEsIHdvcmtzcGFjZUV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5zYXZlV29ya3NwYWNlRXh0ZW5zaW9ucygpO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdJbnN0YWxsIHdvcmtzcGFjZSBleHRlbnNpb24nO1xuXHRcdH0+KCd3b3Jrc3BhY2VleHRlbnNpb246aW5zdGFsbCcpO1xuXG5cdFx0cmV0dXJuIHdvcmtzcGFjZUV4dGVuc2lvbjtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVByb21pc2U7XG5cblx0XHRjb25zdCBleGlzdGluZ0V4dGVuc2lvbkluZGV4ID0gdGhpcy5leHRlbnNpb25zLmZpbmRJbmRleChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRpZiAoZXhpc3RpbmdFeHRlbnNpb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9ucy5zcGxpY2UoZXhpc3RpbmdFeHRlbnNpb25JbmRleCwgMSk7XG5cdFx0XHR0aGlzLnNhdmVXb3Jrc3BhY2VFeHRlbnNpb25zKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1VuaW5zdGFsbCB3b3Jrc3BhY2UgZXh0ZW5zaW9uJztcblx0XHR9Pignd29ya3NwYWNlZXh0ZW5zaW9uOnVuaW5zdGFsbCcpO1xuXHR9XG5cblx0Z2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9uc0xvY2F0aW9ucygpOiBVUklbXSB7XG5cdFx0Y29uc3QgbG9jYXRpb25zOiBVUklbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFdvcmtzcGFjZUV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5XT1JLU1BBQ0VfRVhURU5TSU9OU19LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdbXScpKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGxvY2F0aW9ucykpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiBwYXJzZWQpIHtcblx0XHRcdFx0XHRpZiAoaXNTdHJpbmcobG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbnMucHVzaCh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS50b1Jlc291cmNlKGxvY2F0aW9uKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgSW52YWxpZCB2YWx1ZSBmb3IgJ2V4dGVuc2lvbnMnIGluIHdvcmtzcGFjZSBzdG9yYWdlOiAke2xvY2F0aW9ufWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbnMucHVzaChVUkkucmV2aXZlKGxvY2F0aW9uKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgSW52YWxpZCB2YWx1ZSBmb3IgJ2V4dGVuc2lvbnMnIGluIHdvcmtzcGFjZSBzdG9yYWdlOiAke2xvY2F0aW9uc31gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHBhcnNpbmcgd29ya3NwYWNlIGV4dGVuc2lvbnMgbG9jYXRpb25zOiAke2dldEVycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVXb3Jrc3BhY2VFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxvY2F0aW9ucyA9IHRoaXMuZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5sb2NhdGlvbik7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV29ya3NwYWNlRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLldPUktTUEFDRV9FWFRFTlNJT05TX0tFWSxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoY29hbGVzY2UobG9jYXRpb25zXG5cdFx0XHRcdFx0Lm1hcChsb2NhdGlvbiA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkucmVsYXRpdmVQYXRoKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdLnVyaSwgbG9jYXRpb24pKSkpLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdvcmtzcGFjZUV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5XT1JLU1BBQ0VfRVhURU5TSU9OU19LRVksIEpTT04uc3RyaW5naWZ5KGxvY2F0aW9ucyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdHRoaXMud2F0Y2hJbnZhbGlkRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0YXN5bmMgc2NhbldvcmtzcGFjZUV4dGVuc2lvbihsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihsb2NhdGlvbiwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGluY2x1ZGVJbnZhbGlkOiB0cnVlIH0pO1xuXHRcdHJldHVybiBzY2FubmVkRXh0ZW5zaW9uID8gdGhpcy50b0xvY2FsV29ya3NwYWNlRXh0ZW5zaW9uKHNjYW5uZWRFeHRlbnNpb24pIDogbnVsbDtcblx0fVxuXG5cdGFzeW5jIHRvTG9jYWxXb3Jrc3BhY2VFeHRlbnNpb24oZXh0ZW5zaW9uOiBJU2Nhbm5lZEV4dGVuc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShleHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdGxldCByZWFkbWVVcmw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2hhbmdlbG9nVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdHJlYWRtZVVybCA9IHN0YXQuY2hpbGRyZW4uZmluZCgoeyBuYW1lIH0pID0+IC9ecmVhZG1lKFxcLnR4dHxcXC5tZHwpJC9pLnRlc3QobmFtZSkpPy5yZXNvdXJjZTtcblx0XHRcdGNoYW5nZWxvZ1VybCA9IHN0YXQuY2hpbGRyZW4uZmluZCgoeyBuYW1lIH0pID0+IC9eY2hhbmdlbG9nKFxcLnR4dHxcXC5tZHwpJC9pLnRlc3QobmFtZSkpPy5yZXNvdXJjZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsaWRhdGlvbnM6IFtTZXZlcml0eSwgc3RyaW5nXVtdID0gWy4uLmV4dGVuc2lvbi52YWxpZGF0aW9uc107XG5cdFx0bGV0IGlzVmFsaWQgPSBleHRlbnNpb24uaXNWYWxpZDtcblx0XHRpZiAoZXh0ZW5zaW9uLm1hbmlmZXN0Lm1haW4pIHtcblx0XHRcdGlmICghKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChleHRlbnNpb24ubG9jYXRpb24sIGV4dGVuc2lvbi5tYW5pZmVzdC5tYWluKSkpKSB7XG5cdFx0XHRcdGlzVmFsaWQgPSBmYWxzZTtcblx0XHRcdFx0dmFsaWRhdGlvbnMucHVzaChbU2V2ZXJpdHkuRXJyb3IsIGxvY2FsaXplKCdtYWluLm5vdEZvdW5kJywgXCJDYW5ub3QgYWN0aXZhdGUgYmVjYXVzZSB7MH0gbm90IGZvdW5kXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5tYWluKV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHR0eXBlOiBleHRlbnNpb24udHlwZSxcblx0XHRcdGlzQnVpbHRpbjogZXh0ZW5zaW9uLmlzQnVpbHRpbiB8fCAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNCdWlsdGluLFxuXHRcdFx0bG9jYXRpb246IGV4dGVuc2lvbi5sb2NhdGlvbixcblx0XHRcdG1hbmlmZXN0OiBleHRlbnNpb24ubWFuaWZlc3QsXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybTogZXh0ZW5zaW9uLnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0dmFsaWRhdGlvbnMsXG5cdFx0XHRpc1ZhbGlkLFxuXHRcdFx0cmVhZG1lVXJsLFxuXHRcdFx0Y2hhbmdlbG9nVXJsLFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbi5tZXRhZGF0YT8ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRwdWJsaXNoZXJJZDogZXh0ZW5zaW9uLm1ldGFkYXRhPy5wdWJsaXNoZXJJZCB8fCBudWxsLFxuXHRcdFx0aXNBcHBsaWNhdGlvblNjb3BlZDogISFleHRlbnNpb24ubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQsXG5cdFx0XHRpc01hY2hpbmVTY29wZWQ6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5pc01hY2hpbmVTY29wZWQsXG5cdFx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaGFzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8ucHJlUmVsZWFzZSxcblx0XHRcdGluc3RhbGxlZFRpbWVzdGFtcDogZXh0ZW5zaW9uLm1ldGFkYXRhPy5pbnN0YWxsZWRUaW1lc3RhbXAsXG5cdFx0XHR1cGRhdGVkOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8udXBkYXRlZCxcblx0XHRcdHBpbm5lZDogISFleHRlbnNpb24ubWV0YWRhdGE/LnBpbm5lZCxcblx0XHRcdGZvcmNlQXV0b1VwZGF0ZTogZmFsc2UsXG5cdFx0XHRpc1dvcmtzcGFjZVNjb3BlZDogdHJ1ZSxcblx0XHRcdHByaXZhdGU6IGZhbHNlLFxuXHRcdFx0c291cmNlOiAncmVzb3VyY2UnLFxuXHRcdFx0c2l6ZTogZXh0ZW5zaW9uLm1ldGFkYXRhPy5zaXplID8/IDAsXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsT0FBTyx3QkFBd0I7QUFDakQ7QUFBQSxFQUN1RjtBQUFBLEVBQW9GO0FBQUEsRUFBMEI7QUFBQSxFQUF3QztBQUFBLEVBQWtCO0FBQUEsRUFFOVA7QUFBQSxFQUdBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUF5Ryx5Q0FBbUw7QUFDNVIsU0FBUyxlQUFlLHlCQUE2QyxzQ0FBc0Q7QUFDM0gsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsNkJBQTZCO0FBQ3pELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFVBQVUsVUFBVSx1QkFBdUI7QUFDcEQsU0FBUyxzQkFBcUM7QUFDOUMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsZ0NBQWdDLG9C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QUEsTUFDM0Msc0JBQXNCLENBQUMsQ0FBQyxVQUFVLFVBQVU7QUFBQSxNQUM1QyxZQUFZLENBQUMsQ0FBQyxVQUFVLFVBQVU7QUFBQSxNQUNsQyxvQkFBb0IsVUFBVSxVQUFVO0FBQUEsTUFDeEMsU0FBUyxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDL0IsUUFBUSxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDOUIsaUJBQWlCO0FBQUEsTUFDakIsbUJBQW1CO0FBQUEsTUFDbkIsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsTUFBTSxVQUFVLFVBQVUsUUFBUTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUNEO0FBdE9NLHFDQUVtQiwyQkFBMkI7QUFGOUMsdUNBQU47QUFBQSxFQWFHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuQkc7IiwKICAibmFtZXMiOiBbImV4dGVuc2lvbnMiLCAic2VydmVyIiwgImV4dGVuc2lvbiJdCn0K
