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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import * as nls from "../../../../nls.js";
import * as semver from "../../../../base/common/semver/semver.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { index } from "../../../../base/common/arrays.js";
import { Promises, ThrottledDelayer, createCancelablePromise, disposableTimeout } from "../../../../base/common/async.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { singlePagePager } from "../../../../base/common/paging.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  IExtensionGalleryService,
  InstallOperation,
  WEB_EXTENSION_TAG,
  isTargetPlatformCompatible,
  EXTENSION_IDENTIFIER_REGEX,
  TargetPlatformToString,
  IAllowedExtensionsService,
  AllowedExtensionsConfigKey,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  shouldRequireRepositorySignatureFor
} from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, areSameExtensions, groupByExtension, getGalleryExtensionId, findMatchingMaliciousEntry } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtensionState, AutoUpdateConfigurationKey, AutoUpdateDelayConfigurationKey, AutoCheckUpdatesConfigurationKey, HasOutdatedExtensionsContext, ExtensionRuntimeActionType, AutoRestartConfigurationKey, VIEWLET_ID } from "../common/extensions.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import * as resources from "../../../../base/common/resources.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ExtensionType, TargetPlatform, ExtensionIdentifier, isApplicationScopedExtension } from "../../../../platform/extensions/common/extensions.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IIgnoredExtensionsManagementService } from "../../../../platform/userDataSync/common/ignoredExtensions.js";
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isDefined, isString, isUndefined } from "../../../../base/common/types.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IExtensionService, toExtension, toExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { isWeb, language } from "../../../../base/common/platform.js";
import { getLocale } from "../../../../platform/languagePacks/common/languagePacks.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { isEngineValid } from "../../../../platform/extensions/common/extensionValidator.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ShowCurrentReleaseNotesActionId } from "../../update/common/update.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { ExtensionGalleryResourceType, ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { fromNow } from "../../../../base/common/date.js";
import { hash } from "../../../../base/common/hash.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
let Extension = class {
  constructor(stateProvider, runtimeStateProvider, server, local, _gallery, resourceExtensionInfo, galleryService, telemetryService, logService, fileService, productService) {
    this.stateProvider = stateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.server = server;
    this.local = local;
    this._gallery = _gallery;
    this.resourceExtensionInfo = resourceExtensionInfo;
    this.galleryService = galleryService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.fileService = fileService;
    this.productService = productService;
    this.enablementState = EnablementState.EnabledGlobally;
    this.galleryResourcesCache = /* @__PURE__ */ new Map();
  }
  get resourceExtension() {
    if (this.resourceExtensionInfo) {
      return this.resourceExtensionInfo.resourceExtension;
    }
    if (this.local?.isWorkspaceScoped) {
      return {
        type: "resource",
        identifier: this.local.identifier,
        location: this.local.location,
        manifest: this.local.manifest,
        changelogUri: this.local.changelogUrl,
        readmeUri: this.local.readmeUrl
      };
    }
    return void 0;
  }
  get gallery() {
    return this._gallery;
  }
  set gallery(gallery) {
    this._gallery = gallery;
    this.galleryResourcesCache.clear();
  }
  get missingFromGallery() {
    return !!this._missingFromGallery;
  }
  set missingFromGallery(missing) {
    this._missingFromGallery = missing;
  }
  get type() {
    return this.local ? this.local.type : ExtensionType.User;
  }
  get isBuiltin() {
    return this.local ? this.local.isBuiltin : false;
  }
  get isWorkspaceScoped() {
    if (this.local) {
      return this.local.isWorkspaceScoped;
    }
    if (this.resourceExtensionInfo) {
      return this.resourceExtensionInfo.isWorkspaceScoped;
    }
    return false;
  }
  get name() {
    if (this.gallery) {
      return this.gallery.name;
    }
    return this.getManifestFromLocalOrResource()?.name ?? "";
  }
  get displayName() {
    if (this.gallery) {
      return this.gallery.displayName || this.gallery.name;
    }
    return this.getManifestFromLocalOrResource()?.displayName ?? this.name;
  }
  get identifier() {
    if (this.gallery) {
      return this.gallery.identifier;
    }
    if (this.resourceExtension) {
      return this.resourceExtension.identifier;
    }
    return this.local?.identifier ?? { id: "" };
  }
  get uuid() {
    return this.gallery ? this.gallery.identifier.uuid : this.local?.identifier.uuid;
  }
  get publisher() {
    if (this.gallery) {
      return this.gallery.publisher;
    }
    return this.getManifestFromLocalOrResource()?.publisher ?? "";
  }
  get publisherDisplayName() {
    if (this.gallery) {
      return this.gallery.publisherDisplayName || this.gallery.publisher;
    }
    if (this.local?.publisherDisplayName) {
      return this.local.publisherDisplayName;
    }
    return this.publisher;
  }
  get publisherUrl() {
    return this.gallery?.publisherLink ? URI.parse(this.gallery.publisherLink) : void 0;
  }
  get publisherDomain() {
    return this.gallery?.publisherDomain;
  }
  get publisherSponsorLink() {
    return this.gallery?.publisherSponsorLink ? URI.parse(this.gallery.publisherSponsorLink) : void 0;
  }
  get version() {
    return this.local ? this.local.manifest.version : this.latestVersion;
  }
  get private() {
    return this.gallery ? this.gallery.private : this.local ? this.local.private : false;
  }
  get pinned() {
    return !!this.local?.pinned;
  }
  get latestVersion() {
    return this.gallery ? this.gallery.version : this.getManifestFromLocalOrResource()?.version ?? "";
  }
  get description() {
    return this.gallery ? this.gallery.description : this.getManifestFromLocalOrResource()?.description ?? "";
  }
  get url() {
    return this.gallery?.detailsLink;
  }
  get iconUrl() {
    return this.galleryIconUrl || this.resourceExtensionIconUrl || this.localIconUrl || this.defaultIconUrl;
  }
  get iconUrlFallback() {
    return this.gallery?.assets.icon?.fallbackUri;
  }
  get localIconUrl() {
    if (this.local && this.local.manifest.icon) {
      return FileAccess.uriToBrowserUri(resources.joinPath(this.local.location, this.local.manifest.icon)).toString(true);
    }
    return void 0;
  }
  get resourceExtensionIconUrl() {
    if (this.resourceExtension?.manifest.icon) {
      return FileAccess.uriToBrowserUri(resources.joinPath(this.resourceExtension.location, this.resourceExtension.manifest.icon)).toString(true);
    }
    return void 0;
  }
  get galleryIconUrl() {
    return this.gallery?.assets.icon?.uri;
  }
  get defaultIconUrl() {
    if (this.type === ExtensionType.System && this.local) {
      if (this.local.manifest && this.local.manifest.contributes) {
        if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
          return FileAccess.asBrowserUri("vs/workbench/contrib/extensions/browser/media/theme-icon.png").toString(true);
        }
        if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
          return FileAccess.asBrowserUri("vs/workbench/contrib/extensions/browser/media/language-icon.svg").toString(true);
        }
      }
    }
    return void 0;
  }
  get repository() {
    return this.gallery && this.gallery.assets.repository ? this.gallery.assets.repository.uri : void 0;
  }
  get licenseUrl() {
    return this.gallery && this.gallery.assets.license ? this.gallery.assets.license.uri : void 0;
  }
  get supportUrl() {
    return this.gallery && this.gallery.supportLink ? this.gallery.supportLink : void 0;
  }
  get state() {
    return this.stateProvider(this);
  }
  get isMalicious() {
    return !!this.malicious || this.enablementState === EnablementState.DisabledByMalicious;
  }
  get maliciousInfoLink() {
    return this.malicious?.learnMoreLink;
  }
  get installCount() {
    return this.gallery ? this.gallery.installCount : void 0;
  }
  get rating() {
    return this.gallery ? this.gallery.rating : void 0;
  }
  get ratingCount() {
    return this.gallery ? this.gallery.ratingCount : void 0;
  }
  get ratingUrl() {
    return this.gallery?.ratingLink;
  }
  get outdated() {
    try {
      if (!this.gallery || !this.local) {
        return false;
      }
      if (this.type === ExtensionType.System && this.productService.quality === "stable" && !this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === this.identifier.id.toLowerCase())) {
        return false;
      }
      if (!this.local.preRelease && this.gallery.properties.isPreReleaseVersion) {
        return false;
      }
      if (semver.gt(this.latestVersion, this.version)) {
        return true;
      }
      if (this.outdatedTargetPlatform) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  get outdatedTargetPlatform() {
    return !!this.local && !!this.gallery && ![TargetPlatform.UNDEFINED, TargetPlatform.WEB].includes(this.local.targetPlatform) && this.gallery.properties.targetPlatform !== TargetPlatform.WEB && this.local.targetPlatform !== this.gallery.properties.targetPlatform && semver.eq(this.latestVersion, this.version);
  }
  get runtimeState() {
    return this.runtimeStateProvider(this);
  }
  get telemetryData() {
    const { local, gallery } = this;
    if (gallery) {
      return getGalleryExtensionTelemetryData(gallery);
    } else if (local) {
      return getLocalExtensionTelemetryData(local);
    } else {
      return {};
    }
  }
  get preview() {
    return this.local?.manifest.preview ?? this.gallery?.preview ?? false;
  }
  get preRelease() {
    return !!this.local?.preRelease;
  }
  get isPreReleaseVersion() {
    if (this.local) {
      return this.local.isPreReleaseVersion;
    }
    return !!this.gallery?.properties.isPreReleaseVersion;
  }
  get hasPreReleaseVersion() {
    return this.gallery ? this.gallery.hasPreReleaseVersion : !!this.local?.hasPreReleaseVersion;
  }
  get hasReleaseVersion() {
    return !!this.resourceExtension || !!this.gallery?.hasReleaseVersion;
  }
  getLocal() {
    return this.local && !this.outdated ? this.local : void 0;
  }
  async getManifest(token) {
    const local = this.getLocal();
    if (local) {
      return local.manifest;
    }
    if (this.gallery) {
      return this.getGalleryManifest(token);
    }
    if (this.resourceExtension) {
      return this.resourceExtension.manifest;
    }
    return null;
  }
  async getGalleryManifest(token = CancellationToken.None) {
    if (this.gallery) {
      let cache = this.galleryResourcesCache.get("manifest");
      if (!cache) {
        if (this.gallery.assets.manifest) {
          this.galleryResourcesCache.set("manifest", cache = this.galleryService.getManifest(this.gallery, token).catch((e) => {
            this.galleryResourcesCache.delete("manifest");
            throw e;
          }));
        } else {
          this.logService.error(nls.localize("Manifest is not found", "Manifest is not found"), this.identifier.id);
        }
      }
      return cache;
    }
    return null;
  }
  hasReadme() {
    if (this.local && this.local.readmeUrl) {
      return true;
    }
    if (this.gallery && this.gallery.assets.readme) {
      return true;
    }
    if (this.resourceExtension?.readmeUri) {
      return true;
    }
    return this.type === ExtensionType.System;
  }
  async getReadme(token) {
    const local = this.getLocal();
    if (local?.readmeUrl) {
      const content = await this.fileService.readFile(local.readmeUrl);
      return content.value.toString();
    }
    if (this.gallery) {
      if (this.gallery.assets.readme) {
        return this.galleryService.getReadme(this.gallery, token);
      }
      this.telemetryService.publicLog("extensions:NotFoundReadMe", this.telemetryData);
    }
    if (this.type === ExtensionType.System) {
      return Promise.resolve(`# ${this.displayName || this.name}
**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.
## Features
${this.description}
`);
    }
    if (this.resourceExtension?.readmeUri) {
      const content = await this.fileService.readFile(this.resourceExtension?.readmeUri);
      return content.value.toString();
    }
    return Promise.reject(new Error("not available"));
  }
  hasChangelog() {
    if (this.local && this.local.changelogUrl) {
      return true;
    }
    if (this.gallery && this.gallery.assets.changelog) {
      return true;
    }
    return this.type === ExtensionType.System;
  }
  async getChangelog(token) {
    const local = this.getLocal();
    if (local?.changelogUrl) {
      const content = await this.fileService.readFile(local.changelogUrl);
      return content.value.toString();
    }
    if (this.gallery?.assets.changelog) {
      return this.galleryService.getChangelog(this.gallery, token);
    }
    if (this.type === ExtensionType.System) {
      return Promise.resolve(`Please check the [VS Code Release Notes](command:${ShowCurrentReleaseNotesActionId}) for changes to the built-in extensions.`);
    }
    return Promise.reject(new Error("not available"));
  }
  get categories() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.categories && !this.outdated) {
      return local.manifest.categories;
    }
    if (gallery) {
      return gallery.categories;
    }
    if (resourceExtension) {
      return resourceExtension.manifest.categories ?? [];
    }
    return [];
  }
  get tags() {
    const { gallery } = this;
    if (gallery) {
      return gallery.tags.filter((tag) => !tag.startsWith("_"));
    }
    return [];
  }
  get dependencies() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.extensionDependencies && !this.outdated) {
      return local.manifest.extensionDependencies;
    }
    if (gallery) {
      return gallery.properties.dependencies || [];
    }
    if (resourceExtension) {
      return resourceExtension.manifest.extensionDependencies || [];
    }
    return [];
  }
  get extensionPack() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.extensionPack && !this.outdated) {
      return local.manifest.extensionPack;
    }
    if (gallery) {
      return gallery.properties.extensionPack || [];
    }
    if (resourceExtension) {
      return resourceExtension.manifest.extensionPack || [];
    }
    return [];
  }
  setExtensionsControlManifest(extensionsControlManifest) {
    this.malicious = findMatchingMaliciousEntry(this.identifier, extensionsControlManifest.malicious);
    this.deprecationInfo = extensionsControlManifest.deprecated ? extensionsControlManifest.deprecated[this.identifier.id.toLowerCase()] : void 0;
  }
  getManifestFromLocalOrResource() {
    if (this.local) {
      return this.local.manifest;
    }
    if (this.resourceExtension) {
      return this.resourceExtension.manifest;
    }
    return null;
  }
};
Extension = __decorateClass([
  __decorateParam(6, IExtensionGalleryService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService)
], Extension);
const EXTENSIONS_AUTO_UPDATE_KEY = "extensions.autoUpdate";
const EXTENSIONS_DONOT_AUTO_UPDATE_KEY = "extensions.donotAutoUpdate";
const EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY = "extensions.dismissedNotifications";
let Extensions = class extends Disposable {
  constructor(server, stateProvider, runtimeStateProvider, isWorkspaceServer, galleryService, extensionEnablementService, workbenchExtensionManagementService, telemetryService, instantiationService) {
    super();
    this.server = server;
    this.stateProvider = stateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.isWorkspaceServer = isWorkspaceServer;
    this.galleryService = galleryService;
    this.extensionEnablementService = extensionEnablementService;
    this.workbenchExtensionManagementService = workbenchExtensionManagementService;
    this.telemetryService = telemetryService;
    this.instantiationService = instantiationService;
    this._onChange = this._register(new Emitter());
    this._onReset = this._register(new Emitter());
    this.installing = [];
    this.uninstalling = [];
    this.installed = [];
    this._register(server.extensionManagementService.onInstallExtension((e) => this.onInstallExtension(e)));
    this._register(server.extensionManagementService.onDidInstallExtensions((e) => this.onDidInstallExtensions(e)));
    this._register(server.extensionManagementService.onUninstallExtension((e) => this.onUninstallExtension(e.identifier)));
    this._register(server.extensionManagementService.onDidUninstallExtension((e) => this.onDidUninstallExtension(e)));
    this._register(server.extensionManagementService.onDidUpdateExtensionMetadata((e) => this.onDidUpdateExtensionMetadata(e.local)));
    this._register(server.extensionManagementService.onDidChangeProfile(() => this.reset()));
    this._register(extensionEnablementService.onEnablementChanged((e) => this.onEnablementChanged(e)));
    this._register(Event.any(this.onChange, this.onReset)(() => this._local = void 0));
    if (this.isWorkspaceServer) {
      this._register(this.workbenchExtensionManagementService.onInstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onInstallExtension(e);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onDidInstallExtensions((e) => {
        const result = e.filter((e2) => e2.workspaceScoped);
        if (result.length) {
          this.onDidInstallExtensions(result);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onUninstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onUninstallExtension(e.identifier);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onDidUninstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onDidUninstallExtension(e);
        }
      }));
    }
  }
  get onChange() {
    return this._onChange.event;
  }
  get onReset() {
    return this._onReset.event;
  }
  get local() {
    if (!this._local) {
      this._local = [];
      for (const extension of this.installed) {
        this._local.push(extension);
      }
      for (const extension of this.installing) {
        if (!this.installed.some((installed) => areSameExtensions(installed.identifier, extension.identifier))) {
          this._local.push(extension);
        }
      }
    }
    return this._local;
  }
  async queryInstalled(productVersion) {
    await this.fetchInstalledExtensions(productVersion);
    this._onChange.fire(void 0);
    return this.local;
  }
  async syncInstalledExtensionsWithGallery(galleryExtensions, productVersion, flagExtensionsMissingFromGallery) {
    const extensions = await this.mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion);
    for (const [extension, gallery] of extensions) {
      if (extension.local && extension.local.type !== ExtensionType.System && !extension.local.identifier.uuid) {
        extension.local = await this.updateMetadata(extension.local, gallery);
      }
      if (!extension.gallery || extension.gallery.version !== gallery.version || extension.gallery.properties.targetPlatform !== gallery.properties.targetPlatform) {
        extension.gallery = gallery;
        this._onChange.fire({ extension });
      }
    }
    if (flagExtensionsMissingFromGallery) {
      const extensionsToQuery = [];
      for (const extension of this.local) {
        if (extension.gallery) {
          continue;
        }
        if (extension.missingFromGallery) {
          continue;
        }
        if (!extension.identifier.uuid) {
          continue;
        }
        if (!flagExtensionsMissingFromGallery.some((f) => areSameExtensions(f, extension.identifier))) {
          continue;
        }
        extensionsToQuery.push(extension);
      }
      if (extensionsToQuery.length) {
        const queryResult = await this.galleryService.getExtensions(extensionsToQuery.map((e) => ({ ...e.identifier, version: e.version })), CancellationToken.None);
        const queriedIds = [];
        const missingIds = [];
        for (const extension of extensionsToQuery) {
          queriedIds.push(extension.identifier.id);
          const gallery = queryResult.find((g) => areSameExtensions(g.identifier, extension.identifier));
          if (gallery) {
            extension.gallery = gallery;
          } else {
            extension.missingFromGallery = true;
            missingIds.push(extension.identifier.id);
          }
          this._onChange.fire({ extension });
        }
        this.telemetryService.publicLog2("extensions:missingFromGallery", {
          queriedIds: new TelemetryTrustedValue(queriedIds.join(";")),
          missingIds: new TelemetryTrustedValue(missingIds.join(";"))
        });
      }
    }
  }
  async mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion) {
    const mappedExtensions = this.mapInstalledExtensionWithGalleryExtension(galleryExtensions);
    const targetPlatform = await this.server.extensionManagementService.getTargetPlatform();
    const compatibleGalleryExtensions = [];
    const compatibleGalleryExtensionsToFetch = [];
    await Promise.allSettled(mappedExtensions.map(async ([extension, gallery]) => {
      if (extension.local) {
        if (await this.galleryService.isExtensionCompatible(gallery, extension.local.preRelease, targetPlatform, productVersion)) {
          compatibleGalleryExtensions.push(gallery);
        } else {
          compatibleGalleryExtensionsToFetch.push({ ...extension.local.identifier, preRelease: extension.local.preRelease });
        }
      }
    }));
    if (compatibleGalleryExtensionsToFetch.length) {
      const result = await this.galleryService.getExtensions(compatibleGalleryExtensionsToFetch, { targetPlatform, compatible: true, queryAllVersions: true, productVersion }, CancellationToken.None);
      compatibleGalleryExtensions.push(...result);
    }
    return this.mapInstalledExtensionWithGalleryExtension(compatibleGalleryExtensions);
  }
  mapInstalledExtensionWithGalleryExtension(galleryExtensions) {
    const mappedExtensions = [];
    const byUUID = /* @__PURE__ */ new Map(), byID = /* @__PURE__ */ new Map();
    for (const gallery of galleryExtensions) {
      byUUID.set(gallery.identifier.uuid, gallery);
      byID.set(gallery.identifier.id.toLowerCase(), gallery);
    }
    for (const installed of this.installed) {
      if (installed.uuid) {
        const gallery = byUUID.get(installed.uuid);
        if (gallery) {
          mappedExtensions.push([installed, gallery]);
          continue;
        }
      }
      if (installed.local?.source !== "resource") {
        const gallery = byID.get(installed.identifier.id.toLowerCase());
        if (gallery) {
          mappedExtensions.push([installed, gallery]);
        }
      }
    }
    return mappedExtensions;
  }
  async updateMetadata(localExtension, gallery) {
    let isPreReleaseVersion = false;
    if (localExtension.manifest.version !== gallery.version) {
      this.telemetryService.publicLog2("galleryService:updateMetadata");
      const galleryWithLocalVersion = (await this.galleryService.getExtensions([{ ...localExtension.identifier, version: localExtension.manifest.version }], CancellationToken.None))[0];
      isPreReleaseVersion = !!galleryWithLocalVersion?.properties?.isPreReleaseVersion;
    }
    return this.workbenchExtensionManagementService.updateMetadata(localExtension, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId, isPreReleaseVersion });
  }
  canInstall(galleryExtension) {
    return this.server.extensionManagementService.canInstall(galleryExtension);
  }
  onInstallExtension(event) {
    const { source } = event;
    if (source && !URI.isUri(source)) {
      const extension = this.installed.find((e) => areSameExtensions(e.identifier, source.identifier)) ?? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, void 0, source, void 0);
      this.installing.push(extension);
      this._onChange.fire({ extension });
    }
  }
  async fetchInstalledExtensions(productVersion) {
    const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
    const all = await this.server.extensionManagementService.getInstalled(void 0, void 0, productVersion);
    if (this.isWorkspaceServer) {
      all.push(...await this.workbenchExtensionManagementService.getInstalledWorkspaceExtensions(true));
    }
    const installed = groupByExtension(all, (r) => r.identifier).reduce((result, extensions) => {
      if (extensions.length === 1) {
        result.push(extensions[0]);
      } else {
        let workspaceExtension, userExtension, systemExtension;
        for (const extension2 of extensions) {
          if (extension2.isWorkspaceScoped) {
            workspaceExtension = extension2;
          } else if (extension2.type === ExtensionType.User) {
            userExtension = extension2;
          } else {
            systemExtension = extension2;
          }
        }
        const extension = workspaceExtension ?? userExtension ?? systemExtension;
        if (extension) {
          result.push(extension);
        }
      }
      return result;
    }, []);
    const byId = index(this.installed, (e) => e.local ? e.local.identifier.id : e.identifier.id);
    this.installed = installed.map((local) => {
      const extension = byId[local.identifier.id] || this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, void 0, void 0);
      extension.local = local;
      extension.enablementState = this.extensionEnablementService.getEnablementState(local);
      extension.setExtensionsControlManifest(extensionsControlManifest);
      return extension;
    });
  }
  async reset() {
    this.installed = [];
    this.installing = [];
    this.uninstalling = [];
    await this.fetchInstalledExtensions();
    this._onReset.fire();
  }
  async onDidInstallExtensions(results) {
    const extensions = [];
    for (const event of results) {
      const { local, source } = event;
      const gallery = source && !URI.isUri(source) ? source : void 0;
      const location = source && URI.isUri(source) ? source : void 0;
      const installingExtension = gallery ? this.installing.filter((e) => areSameExtensions(e.identifier, gallery.identifier))[0] : null;
      this.installing = installingExtension ? this.installing.filter((e) => e !== installingExtension) : this.installing;
      let extension = installingExtension ? installingExtension : location || local ? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, void 0, void 0) : void 0;
      if (extension) {
        if (local) {
          const installed = this.installed.filter((e) => areSameExtensions(e.identifier, extension.identifier))[0];
          if (installed) {
            extension = installed;
          } else {
            this.installed.push(extension);
          }
          extension.local = local;
          if (!extension.gallery) {
            extension.gallery = gallery;
          }
          extension.enablementState = this.extensionEnablementService.getEnablementState(local);
        }
        extensions.push(extension);
      }
      this._onChange.fire(!local || !extension ? void 0 : { extension, operation: event.operation });
    }
    if (extensions.length) {
      const manifest = await this.server.extensionManagementService.getExtensionsControlManifest();
      for (const extension of extensions) {
        extension.setExtensionsControlManifest(manifest);
      }
      this.matchInstalledExtensionsWithGallery(extensions);
    }
  }
  async onDidUpdateExtensionMetadata(local) {
    const extension = this.installed.find((e) => areSameExtensions(e.identifier, local.identifier));
    if (extension?.local) {
      extension.local = local;
      this._onChange.fire({ extension });
    }
  }
  async matchInstalledExtensionsWithGallery(extensions) {
    const toMatch = extensions.filter((e) => e.local && !e.gallery && e.local.source !== "resource");
    if (!toMatch.length) {
      return;
    }
    if (!this.galleryService.isEnabled()) {
      return;
    }
    const galleryExtensions = await this.galleryService.getExtensions(toMatch.map((e) => ({ ...e.identifier, preRelease: e.local?.preRelease })), { compatible: true, targetPlatform: await this.server.extensionManagementService.getTargetPlatform() }, CancellationToken.None);
    for (const extension of extensions) {
      const compatible = galleryExtensions.find((e) => areSameExtensions(e.identifier, extension.identifier));
      if (compatible) {
        extension.gallery = compatible;
        this._onChange.fire({ extension });
      }
    }
  }
  onUninstallExtension(identifier) {
    const extension = this.installed.filter((e) => areSameExtensions(e.identifier, identifier))[0];
    if (extension) {
      const uninstalling = this.uninstalling.filter((e) => areSameExtensions(e.identifier, identifier))[0] || extension;
      this.uninstalling = [uninstalling, ...this.uninstalling.filter((e) => !areSameExtensions(e.identifier, identifier))];
      this._onChange.fire(uninstalling ? { extension: uninstalling } : void 0);
    }
  }
  onDidUninstallExtension({ identifier, error }) {
    const uninstalled = this.uninstalling.find((e) => areSameExtensions(e.identifier, identifier)) || this.installed.find((e) => areSameExtensions(e.identifier, identifier));
    this.uninstalling = this.uninstalling.filter((e) => !areSameExtensions(e.identifier, identifier));
    if (!error) {
      this.installed = this.installed.filter((e) => !areSameExtensions(e.identifier, identifier));
    }
    if (uninstalled) {
      this._onChange.fire({ extension: uninstalled });
    }
  }
  onEnablementChanged(platformExtensions) {
    const extensions = this.local.filter((e) => platformExtensions.some((p) => areSameExtensions(e.identifier, p.identifier)));
    for (const extension of extensions) {
      if (extension.local) {
        const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
        if (enablementState !== extension.enablementState) {
          extension.enablementState = enablementState;
          this._onChange.fire({ extension });
        }
      }
    }
  }
  getExtensionState(extension) {
    if (extension.gallery && this.installing.some((e) => !!e.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier))) {
      return ExtensionState.Installing;
    }
    if (this.uninstalling.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
      return ExtensionState.Uninstalling;
    }
    const local = this.installed.filter((e) => e === extension || e.gallery && extension.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier))[0];
    return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
  }
};
Extensions = __decorateClass([
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IWorkbenchExtensionManagementService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IInstantiationService)
], Extensions);
let ExtensionsWorkbenchService = class extends Disposable {
  constructor(instantiationService, editorService, extensionManagementService, galleryService, extensionGalleryManifestService, configurationService, telemetryService, notificationService, urlService, extensionEnablementService, hostService, progressService, extensionManagementServerService, languageService, extensionsSyncManagementService, userDataAutoSyncService, productService, contextKeyService, extensionManifestPropertiesService, logService, extensionService, localeService, lifecycleService, fileService, userDataProfileService, userDataProfilesService, storageService, dialogService, userDataSyncEnablementService, updateService, uriIdentityService, workspaceContextService, viewsService, fileDialogService, quickInputService, allowedExtensionsService, meteredConnectionService) {
    super();
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.extensionManagementService = extensionManagementService;
    this.galleryService = galleryService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this.extensionEnablementService = extensionEnablementService;
    this.hostService = hostService;
    this.progressService = progressService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.languageService = languageService;
    this.extensionsSyncManagementService = extensionsSyncManagementService;
    this.userDataAutoSyncService = userDataAutoSyncService;
    this.productService = productService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.logService = logService;
    this.extensionService = extensionService;
    this.localeService = localeService;
    this.lifecycleService = lifecycleService;
    this.fileService = fileService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.updateService = updateService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.viewsService = viewsService;
    this.fileDialogService = fileDialogService;
    this.quickInputService = quickInputService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.meteredConnectionService = meteredConnectionService;
    this.localExtensions = null;
    this.remoteExtensions = null;
    this.webExtensions = null;
    this.extensionsServers = [];
    this._onChange = this._register(new Emitter());
    this._onDidChangeExtensionsNotification = this._register(new Emitter());
    this.onDidChangeExtensionsNotification = this._onDidChangeExtensionsNotification.event;
    this._onReset = this._register(new Emitter());
    this.installing = [];
    this.tasksInProgress = [];
    this.delayedAutoUpdateCheckTimer = this._register(new MutableDisposable());
    this.extensionGalleryManifest = null;
    this.autoRestartListenerDisposable = this._register(new MutableDisposable());
    this.hasOutdatedExtensionsContextKey = HasOutdatedExtensionsContext.bindTo(contextKeyService);
    if (extensionManagementServerService.localExtensionManagementServer) {
      this.localExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.localExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        !extensionManagementServerService.remoteExtensionManagementServer
      ));
      this._register(this.localExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.localExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.localExtensions);
    }
    if (extensionManagementServerService.remoteExtensionManagementServer) {
      this.remoteExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.remoteExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        true
      ));
      this._register(this.remoteExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.remoteExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.remoteExtensions);
    }
    if (extensionManagementServerService.webExtensionManagementServer) {
      this.webExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.webExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        !(extensionManagementServerService.remoteExtensionManagementServer || extensionManagementServerService.localExtensionManagementServer)
      ));
      this._register(this.webExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.webExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.webExtensions);
    }
    this.updatesCheckDelayer = new ThrottledDelayer(ExtensionsWorkbenchService.UpdatesCheckInterval);
    this.autoUpdateDelayer = new ThrottledDelayer(1e3);
    this._register(toDisposable(() => {
      this.updatesCheckDelayer.cancel();
      this.autoUpdateDelayer.cancel();
    }));
    urlService.registerHandler(this);
    this.whenInitialized = this.initialize();
  }
  get onChange() {
    return this._onChange.event;
  }
  get onReset() {
    return this._onReset.event;
  }
  async initialize() {
    await Promise.all([this.queryLocal(), this.extensionService.whenInstalledExtensionsRegistered()]);
    if (this._store.isDisposed) {
      return;
    }
    this.onDidChangeRunningExtensions(this.extensionService.extensions, []);
    this._register(this.extensionService.onDidChangeExtensions(({ added, removed }) => this.onDidChangeRunningExtensions(added, removed)));
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    if (this._store.isDisposed) {
      return;
    }
    this.initializeAutoUpdate();
    this.extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
      if (this._store.isDisposed) {
        return;
      }
      this.updateExtensionGalleryManifest(manifest);
      this._register(this.extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((manifest2) => this.updateExtensionGalleryManifest(manifest2)));
    }).catch((e) => this.logService.error("Error while fetching extension gallery manifest", e));
    this.updateExtensionsNotificaiton();
    this.reportInstalledExtensionsTelemetry();
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, this._store)((e) => this.onDidDismissedNotificationsValueChange()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_AUTO_UPDATE_KEY, this._store)((e) => this.onDidSelectedExtensionToAutoUpdateValueChange()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_DONOT_AUTO_UPDATE_KEY, this._store)((e) => this.onDidSelectedExtensionToAutoUpdateValueChange()));
    this._register(Event.debounce(this.onChange, () => void 0, 100)(() => {
      this.updateExtensionsNotificaiton();
      this.reportProgressFromOtherSources();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)) {
        this.updateExtensionsNotificaiton();
      }
    }));
  }
  initializeAutoUpdate() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        if (!this.isAutoUpdateEnabled()) {
          this.delayedAutoUpdateCheckTimer.value = void 0;
        } else {
          this.eventuallyAutoUpdateExtensions();
        }
        this._onChange.fire(void 0);
      }
      if (e.affectsConfiguration(AutoUpdateDelayConfigurationKey)) {
        this.delayedAutoUpdateCheckTimer.value = void 0;
        if (this.isAutoUpdateEnabled()) {
          this.eventuallyAutoUpdateExtensions();
        }
        this._onChange.fire(void 0);
      }
      if (e.affectsConfiguration(AutoCheckUpdatesConfigurationKey)) {
        if (this.isAutoCheckUpdatesEnabled()) {
          this.checkForUpdates(`Enabled auto check updates`);
        }
      }
    }));
    this._register(this.extensionEnablementService.onEnablementChanged((platformExtensions) => {
      if (this.isAutoCheckUpdatesEnabled() && this.getAutoUpdateValue() === "on" && platformExtensions.some((e) => this.extensionEnablementService.isEnabled(e))) {
        this.checkForUpdates("Extension enablement changed");
      }
    }));
    this._register(Event.debounce(this.onChange, () => void 0, 100)(() => this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0)));
    this._register(this.updateService.onStateChange((e) => {
      if (e.type === StateType.CheckingForUpdates && e.explicit || e.type === StateType.AvailableForDownload || e.type === StateType.Downloaded) {
        this.telemetryService.publicLog2("extensions:updatecheckonproductupdate");
        if (this.isAutoCheckUpdatesEnabled()) {
          this.checkForUpdates("Product update");
        }
      }
    }));
    this._register(this.allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => {
      if (this.isAutoCheckUpdatesEnabled()) {
        this.checkForUpdates("Allowed extensions changed");
      }
    }));
    this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(() => {
      if (this.isAutoCheckUpdatesEnabled()) {
        this.checkForUpdates("Connection is no longer metered");
      }
      if (isWeb && !this.isAutoUpdateEnabled()) {
        this.autoUpdateBuiltinExtensions();
      }
    }));
    this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0);
    this.eventuallyCheckForUpdates(true);
    if (isWeb) {
      this.syncPinnedBuiltinExtensions();
      if (!this.isAutoUpdateEnabled()) {
        this.autoUpdateBuiltinExtensions();
      }
    }
    this.registerAutoRestartListener();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoRestartConfigurationKey)) {
        this.registerAutoRestartListener();
      }
    }));
  }
  updateExtensionGalleryManifest(manifest) {
    this.extensionGalleryManifest = manifest;
    this.updateExtensionsNotificaiton();
  }
  isAutoUpdateEnabled() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return false;
    }
    return this.getAutoUpdateValue() !== "off";
  }
  getAutoUpdateValue() {
    const autoUpdate = this.configurationService.getValue(AutoUpdateConfigurationKey);
    if (autoUpdate === "off" || autoUpdate === false || autoUpdate === "onlySelectedExtensions") {
      return "off";
    }
    return "on";
  }
  isAutoUpdateDelayed(extension) {
    if (!extension.outdated) {
      return false;
    }
    if (!this.shouldAutoUpdateExtension(extension)) {
      return false;
    }
    return this.getAutoUpdateDelayRemaining(extension) > 0;
  }
  getAutoUpdateDelayRemaining(extension) {
    if (this.isFromTrustedPublisher(extension)) {
      return 0;
    }
    const lastUpdated = extension.gallery?.lastUpdated;
    if (!Number.isFinite(lastUpdated) || !lastUpdated) {
      return 0;
    }
    const elapsed = Date.now() - lastUpdated;
    if (elapsed < 0) {
      return 0;
    }
    const delayPeriod = this.getAutoUpdateDelay();
    return Math.max(0, delayPeriod - elapsed);
  }
  getAutoUpdateDelay() {
    const delayHours = this.configurationService.getValue(AutoUpdateDelayConfigurationKey) ?? 2;
    return delayHours * 60 * 60 * 1e3;
  }
  isFromTrustedPublisher(extension) {
    const trustedPublishers = this.productService.trustedExtensionPublishers;
    if (!trustedPublishers?.length) {
      return false;
    }
    const publisher = extension.publisher.toLowerCase();
    return trustedPublishers.includes(publisher) || trustedPublishers.includes(extension.publisherDisplayName.toLowerCase());
  }
  async updateAutoUpdateForAllExtensions(isAutoUpdateEnabled) {
    const wasAutoUpdateEnabled = this.isAutoUpdateEnabled();
    if (wasAutoUpdateEnabled === isAutoUpdateEnabled) {
      return;
    }
    const result = await this.dialogService.confirm({
      title: nls.localize("confirmEnableDisableAutoUpdate", "Auto Update Extensions"),
      message: isAutoUpdateEnabled ? nls.localize("confirmEnableAutoUpdate", "Do you want to enable auto update for extensions?") : nls.localize("confirmDisableAutoUpdate", "Do you want to disable auto update for extensions?"),
      detail: nls.localize("confirmEnableDisableAutoUpdateDetail", "This will reset any auto update settings you have set for individual extensions.")
    });
    if (!result.confirmed) {
      return;
    }
    this.setEnabledAutoUpdateExtensions([]);
    await this.configurationService.updateValue(AutoUpdateConfigurationKey, isAutoUpdateEnabled ? "on" : "off");
    this.setDisabledAutoUpdateExtensions([]);
    await this.updateExtensionsPinnedState(!isAutoUpdateEnabled);
    this._onChange.fire(void 0);
  }
  registerAutoRestartListener() {
    this.autoRestartListenerDisposable.value = void 0;
    if (this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
      this.autoRestartListenerDisposable.value = this.hostService.onDidChangeFocus((focus) => {
        if (!focus && this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
          this.updateRunningExtensions(void 0, true);
        }
      });
    }
  }
  reportInstalledExtensionsTelemetry() {
    const extensionIds = this.installed.filter((extension) => !extension.isBuiltin && (extension.enablementState === EnablementState.EnabledWorkspace || extension.enablementState === EnablementState.EnabledGlobally)).map((extension) => ExtensionIdentifier.toKey(extension.identifier.id));
    this.telemetryService.publicLog2("installedExtensions", { extensionIds: new TelemetryTrustedValue(extensionIds.join(";")), count: extensionIds.length });
  }
  async onDidChangeRunningExtensions(added, removed) {
    const changedExtensions = [];
    const extensionsToFetch = [];
    for (const desc of added) {
      const extension = this.installed.find((e) => areSameExtensions({ id: desc.identifier.value, uuid: desc.uuid }, e.identifier));
      if (extension) {
        changedExtensions.push(extension);
      } else {
        extensionsToFetch.push(desc);
      }
    }
    const workspaceExtensions = [];
    for (const desc of removed) {
      if (this.workspaceContextService.isInsideWorkspace(desc.extensionLocation)) {
        workspaceExtensions.push(desc);
      } else {
        extensionsToFetch.push(desc);
      }
    }
    if (extensionsToFetch.length) {
      const extensions = await this.getExtensions(extensionsToFetch.map((e) => ({ id: e.identifier.value, uuid: e.uuid })), CancellationToken.None);
      changedExtensions.push(...extensions);
    }
    if (workspaceExtensions.length) {
      const extensions = await this.getResourceExtensions(workspaceExtensions.map((e) => e.extensionLocation), true);
      changedExtensions.push(...extensions);
    }
    for (const changedExtension of changedExtensions) {
      this._onChange.fire(changedExtension);
    }
  }
  updateExtensionsPinnedState(pinned) {
    return this.progressService.withProgress({
      location: ProgressLocation.Extensions,
      title: nls.localize("updatingExtensions", "Updating Extensions Auto Update State")
    }, () => this.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned));
  }
  reset() {
    for (const task of this.tasksInProgress) {
      task.cancel();
    }
    this.tasksInProgress = [];
    this.installing = [];
    this.onDidChangeExtensions();
    this._onReset.fire();
  }
  onDidChangeExtensions(extension) {
    this._installed = void 0;
    this._local = void 0;
    this._onChange.fire(extension);
  }
  get local() {
    if (!this._local) {
      if (this.extensionsServers.length === 1) {
        this._local = this.installed;
      } else {
        this._local = [];
        const byId = groupByExtension(this.installed, (r) => r.identifier);
        for (const extensions of byId) {
          this._local.push(this.getPrimaryExtension(extensions));
        }
      }
    }
    return this._local;
  }
  get installed() {
    if (!this._installed) {
      this._installed = [];
      for (const extensions of this.extensionsServers) {
        for (const extension of extensions.local) {
          this._installed.push(extension);
        }
      }
    }
    return this._installed;
  }
  get outdated() {
    return this.installed.filter((e) => e.outdated && e.local && e.state === ExtensionState.Installed);
  }
  async queryLocal(server) {
    if (server) {
      if (this.localExtensions && this.extensionManagementServerService.localExtensionManagementServer === server) {
        return this.localExtensions.queryInstalled(this.getProductVersion());
      }
      if (this.remoteExtensions && this.extensionManagementServerService.remoteExtensionManagementServer === server) {
        return this.remoteExtensions.queryInstalled(this.getProductVersion());
      }
      if (this.webExtensions && this.extensionManagementServerService.webExtensionManagementServer === server) {
        return this.webExtensions.queryInstalled(this.getProductVersion());
      }
    }
    if (this.localExtensions) {
      try {
        await this.localExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    if (this.remoteExtensions) {
      try {
        await this.remoteExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    if (this.webExtensions) {
      try {
        await this.webExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.local;
  }
  async queryGallery(arg1, arg2) {
    if (!this.galleryService.isEnabled()) {
      return singlePagePager([]);
    }
    const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
    const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
    options.text = options.text ? this.resolveQueryText(options.text) : options.text;
    options.includePreRelease = isUndefined(options.includePreRelease) ? this.extensionManagementService.preferPreReleases : options.includePreRelease;
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const pager = await this.galleryService.query(options, token);
    this.syncInstalledExtensionsWithGallery(pager.firstPage);
    return {
      firstPage: pager.firstPage.map((gallery) => this.fromGallery(gallery, extensionsControlManifest)),
      total: pager.total,
      pageSize: pager.pageSize,
      getPage: async (pageIndex, token2) => {
        const page = await pager.getPage(pageIndex, token2);
        this.syncInstalledExtensionsWithGallery(page);
        return page.map((gallery) => this.fromGallery(gallery, extensionsControlManifest));
      }
    };
  }
  async getExtensions(extensionInfos, arg1, arg2) {
    if (!this.galleryService.isEnabled()) {
      return [];
    }
    extensionInfos.forEach((e) => e.preRelease = e.preRelease ?? this.extensionManagementService.preferPreReleases);
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, arg1, arg2);
    this.syncInstalledExtensionsWithGallery(galleryExtensions);
    return galleryExtensions.map((gallery) => this.fromGallery(gallery, extensionsControlManifest));
  }
  async getResourceExtensions(locations, isWorkspaceScoped) {
    const resourceExtensions = await this.extensionManagementService.getExtensions(locations);
    return resourceExtensions.map((resourceExtension) => this.getInstalledExtensionMatchingLocation(resourceExtension.location) ?? this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, void 0, { resourceExtension, isWorkspaceScoped }));
  }
  onDidDismissedNotificationsValueChange() {
    if (this.dismissedNotificationsValue !== this.getDismissedNotificationsValue()) {
      this._dismissedNotificationsValue = void 0;
      this.updateExtensionsNotificaiton();
    }
  }
  updateExtensionsNotificaiton() {
    const computedNotificiations = this.computeExtensionsNotifications();
    const dismissedNotifications = [];
    let extensionsNotification;
    if (computedNotificiations.length) {
      for (const dismissedNotification of this.getDismissedNotifications()) {
        if (computedNotificiations.some((e) => e.key === dismissedNotification)) {
          dismissedNotifications.push(dismissedNotification);
        }
      }
      if (!dismissedNotifications.includes(computedNotificiations[0].key)) {
        extensionsNotification = {
          message: computedNotificiations[0].message,
          severity: computedNotificiations[0].severity,
          extensions: computedNotificiations[0].extensions,
          query: computedNotificiations[0].query,
          action: computedNotificiations[0].action,
          key: computedNotificiations[0].key,
          dismiss: () => {
            this.setDismissedNotifications([...this.getDismissedNotifications(), computedNotificiations[0].key]);
            this.updateExtensionsNotificaiton();
          }
        };
      }
    }
    this.setDismissedNotifications(dismissedNotifications);
    if (this.extensionsNotification?.key !== extensionsNotification?.key) {
      this.extensionsNotification = extensionsNotification;
      this._onDidChangeExtensionsNotification.fire(this.extensionsNotification);
    }
  }
  computeExtensionsNotifications() {
    const computedNotificiations = [];
    const disallowedExtensions = this.local.filter((e) => e.enablementState === EnablementState.DisabledByAllowlist);
    if (disallowedExtensions.length) {
      computedNotificiations.push({
        message: this.configurationService.inspect(AllowedExtensionsConfigKey).policy ? nls.localize("disallowed extensions by policy", "Some extensions are disabled because they are not allowed by your system administrator.") : nls.localize("disallowed extensions", "Some extensions are disabled because they are configured not to be allowed."),
        severity: Severity.Warning,
        extensions: disallowedExtensions,
        key: "disallowedExtensions:" + disallowedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
      });
    }
    const invalidExtensions = this.local.filter((e) => e.enablementState === EnablementState.DisabledByInvalidExtension && !e.isWorkspaceScoped);
    if (invalidExtensions.length) {
      if (invalidExtensions.some(
        (e) => e.local && e.local.manifest.engines?.vscode && !isEngineValid(e.local.manifest.engines.vscode, this.productService.version, this.productService.date)
      )) {
        computedNotificiations.push({
          message: nls.localize("incompatibleExtensions", "Some extensions are disabled due to version incompatibility. Review and update them."),
          severity: Severity.Warning,
          extensions: invalidExtensions,
          key: "incompatibleExtensions:" + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join("-")
        });
      } else {
        computedNotificiations.push({
          message: nls.localize("invalidExtensions", "Invalid extensions detected. Review them."),
          severity: Severity.Warning,
          extensions: invalidExtensions,
          key: "invalidExtensions:" + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join("-")
        });
      }
    }
    if (!this.configurationService.getValue(AutoRestartConfigurationKey)) {
      const restartRequiredExtensions = this.local.filter((e) => e.runtimeState !== void 0 && (e.runtimeState.action === ExtensionRuntimeActionType.RestartExtensions || e.runtimeState.action === ExtensionRuntimeActionType.ReloadWindow));
      if (restartRequiredExtensions.length) {
        const needsReload = restartRequiredExtensions.some((e) => e.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow);
        computedNotificiations.push({
          message: needsReload ? nls.localize("extensions need reload", "Extensions require a window reload to apply updates.") : nls.localize("extensions need restart", "All extensions require a restart to apply updates."),
          severity: Severity.Info,
          extensions: restartRequiredExtensions,
          query: "@restartrequired",
          action: {
            label: needsReload ? nls.localize("reload window", "Reload Window") : nls.localize("restart extensions action", "Restart Extensions"),
            run: () => {
              if (needsReload) {
                this.hostService.reload();
              } else {
                this.updateRunningExtensions();
              }
            }
          },
          key: "restartRequired:" + restartRequiredExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
        });
      }
    }
    const deprecatedExtensions = this.local.filter((e) => !!e.deprecationInfo && e.local && this.extensionEnablementService.isEnabled(e.local));
    if (deprecatedExtensions.length) {
      computedNotificiations.push({
        message: nls.localize("deprecated extensions", "Deprecated extensions detected. Review them and migrate to alternatives."),
        severity: Severity.Warning,
        extensions: deprecatedExtensions,
        key: "deprecatedExtensions:" + deprecatedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
      });
    }
    const privateMarketplaceUrl = this.configurationService.inspect(ExtensionGalleryServiceUrlConfigKey).policyValue;
    if (privateMarketplaceUrl) {
      const message = new MarkdownString();
      let linkUri = this.extensionGalleryManifest ? getExtensionGalleryManifestResourceUri(this.extensionGalleryManifest, ExtensionGalleryResourceType.ContactSupportUri) : void 0;
      if (!linkUri) {
        const settingsQuery = `@hasPolicy ${ExtensionGalleryServiceUrlConfigKey}`;
        linkUri = `command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(settingsQuery))}`;
        message.isTrusted = { enabledCommands: ["workbench.action.openSettings"] };
      }
      message.appendMarkdown(nls.localize("privateMarketplace", "This window is connected to a [private extension marketplace]({0}) managed by your organization.", linkUri));
      computedNotificiations.push({
        message,
        severity: Severity.Info,
        extensions: [],
        key: `privateMarketplace:${hash(privateMarketplaceUrl)}:${hash(linkUri)}`
      });
    }
    return computedNotificiations;
  }
  getExtensionsNotification() {
    return this.extensionsNotification;
  }
  resolveQueryText(text) {
    text = text.replace(/@web/g, `tag:"${WEB_EXTENSION_TAG}"`);
    const extensionRegex = /\bext:([^\s]+)\b/g;
    if (extensionRegex.test(text)) {
      text = text.replace(extensionRegex, (m, ext) => {
        const lookup = this.productService.extensionKeywords || {};
        const keywords = lookup[ext] || [];
        const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(`.${ext}`));
        const languageName = languageId && this.languageService.getLanguageName(languageId);
        const languageTag = languageName ? ` tag:"${languageName}"` : "";
        return `tag:"__ext_${ext}" tag:"__ext_.${ext}" ${keywords.map((tag) => `tag:"${tag}"`).join(" ")}${languageTag} tag:"${ext}"`;
      });
    }
    return text.substr(0, 350);
  }
  fromGallery(gallery, extensionsControlManifest) {
    let extension = this.getInstalledExtensionMatchingGallery(gallery);
    if (!extension) {
      extension = this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, gallery, void 0);
      extension.setExtensionsControlManifest(extensionsControlManifest);
    }
    return extension;
  }
  getInstalledExtensionMatchingGallery(gallery) {
    for (const installed of this.local) {
      if (installed.identifier.uuid) {
        if (installed.identifier.uuid === gallery.identifier.uuid) {
          return installed;
        }
      } else if (installed.local?.source !== "resource") {
        if (areSameExtensions(installed.identifier, gallery.identifier)) {
          return installed;
        }
      }
    }
    return null;
  }
  getInstalledExtensionMatchingLocation(location) {
    return this.local.find((e) => e.local && this.uriIdentityService.extUri.isEqualOrParent(location, e.local?.location)) ?? null;
  }
  async open(extension, options) {
    if (typeof extension === "string") {
      const id = extension;
      extension = this.installed.find((e) => areSameExtensions(e.identifier, { id })) ?? (await this.getExtensions([{ id: extension }], CancellationToken.None))[0];
    }
    if (!extension) {
      throw new Error(`Extension not found. ${extension}`);
    }
    const useModal = this.configurationService.getValue("extensions.allowOpenInModalEditor");
    await this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), options, options?.sideByside ? SIDE_GROUP : useModal ? MODAL_GROUP : ACTIVE_GROUP);
  }
  async openSearch(searchValue, preserveFocus) {
    const viewPaneContainer = (await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer();
    if (!viewPaneContainer) {
      this.logService.trace("ExtensionsWorkbenchService#openSearch: extension view pane container was not available");
      return;
    }
    viewPaneContainer.search(searchValue);
    if (!preserveFocus) {
      viewPaneContainer.focus();
    }
  }
  getExtensionRuntimeStatus(extension) {
    const extensionsStatus = this.extensionService.getExtensionsStatus();
    for (const id of Object.keys(extensionsStatus)) {
      if (areSameExtensions({ id }, extension.identifier)) {
        return extensionsStatus[id];
      }
    }
    return void 0;
  }
  async updateRunningExtensions(message = nls.localize("restart", "Changing extension enablement"), auto = false) {
    const toAdd = [];
    const toRemove = [];
    const extensionsToCheck = [...this.local];
    for (const extension of extensionsToCheck) {
      const runtimeState = extension.runtimeState;
      if (!runtimeState || runtimeState.action !== ExtensionRuntimeActionType.RestartExtensions) {
        continue;
      }
      if (extension.state === ExtensionState.Uninstalled) {
        toRemove.push(extension.identifier.id);
        continue;
      }
      if (!extension.local) {
        continue;
      }
      const isEnabled = this.extensionEnablementService.isEnabled(extension.local);
      if (isEnabled) {
        const runningExtension = this.extensionService.extensions.find((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, extension.identifier));
        if (runningExtension) {
          toRemove.push(runningExtension.identifier.value);
        }
        toAdd.push(extension.local);
      } else {
        toRemove.push(extension.identifier.id);
      }
    }
    for (const extension of this.extensionService.extensions) {
      if (extension.isUnderDevelopment) {
        continue;
      }
      if (extensionsToCheck.some((e) => areSameExtensions({ id: extension.identifier.value, uuid: extension.uuid }, e.local?.identifier ?? e.identifier))) {
        continue;
      }
      toRemove.push(extension.identifier.value);
    }
    if (toAdd.length || toRemove.length) {
      if (await this.extensionService.stopExtensionHosts(message, auto)) {
        await this.extensionService.startExtensionHosts({ toAdd, toRemove });
        if (auto) {
          this.notificationService.notify({
            severity: Severity.Info,
            message: nls.localize("extensionsAutoRestart", "Extensions were auto restarted to enable updates."),
            priority: NotificationPriority.SILENT
          });
        }
        this.telemetryService.publicLog2("extensions:autorestart", { count: toAdd.length + toRemove.length, auto });
      }
    }
  }
  getRuntimeState(extension) {
    const isUninstalled = extension.state === ExtensionState.Uninstalled;
    const runningExtension = this.extensionService.extensions.find((e) => areSameExtensions({ id: e.identifier.value }, extension.identifier));
    const reloadAction = this.extensionManagementServerService.remoteExtensionManagementServer ? ExtensionRuntimeActionType.ReloadWindow : ExtensionRuntimeActionType.RestartExtensions;
    const reloadActionLabel = reloadAction === ExtensionRuntimeActionType.ReloadWindow ? nls.localize("reload", "reload window") : nls.localize("restart extensions", "restart extensions");
    if (isUninstalled) {
      const canRemoveRunningExtension = runningExtension && this.extensionService.canRemoveExtension(runningExtension);
      const isSameExtensionRunning = runningExtension && (!extension.server || extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension))) && (!extension.resourceExtension || this.uriIdentityService.extUri.isEqual(extension.resourceExtension.location, runningExtension.extensionLocation));
      if (!canRemoveRunningExtension && isSameExtensionRunning && !runningExtension.isUnderDevelopment) {
        return { action: reloadAction, reason: nls.localize("postUninstallTooltip", "Please {0} to complete the uninstallation of this extension.", reloadActionLabel) };
      }
      return void 0;
    }
    if (extension.local) {
      const isSameExtensionRunning = runningExtension && extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));
      const isEnabled = this.extensionEnablementService.isEnabled(extension.local);
      if (runningExtension) {
        if (isEnabled) {
          if (this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
            return void 0;
          }
          const runningExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));
          if (isSameExtensionRunning) {
            if (!runningExtension.isUnderDevelopment && (extension.version !== runningExtension.version || extension.local.targetPlatform !== runningExtension.targetPlatform)) {
              const productCurrentVersion = this.getProductCurrentVersion();
              const productUpdateVersion = this.getProductUpdateVersion();
              if (productUpdateVersion && !isEngineValid(extension.local.manifest.engines.vscode, productCurrentVersion.version, productCurrentVersion.date) && isEngineValid(extension.local.manifest.engines.vscode, productUpdateVersion.version, productUpdateVersion.date)) {
                const state = this.updateService.state;
                if (state.type === StateType.AvailableForDownload) {
                  return { action: ExtensionRuntimeActionType.DownloadUpdate, reason: nls.localize("postUpdateDownloadTooltip", "Please update {0} to enable the updated extension.", this.productService.nameLong) };
                }
                if (state.type === StateType.Downloaded) {
                  return { action: ExtensionRuntimeActionType.ApplyUpdate, reason: nls.localize("postUpdateUpdateTooltip", "Please update {0} to enable the updated extension.", this.productService.nameLong) };
                }
                if (state.type === StateType.Ready) {
                  return { action: ExtensionRuntimeActionType.QuitAndInstall, reason: nls.localize("postUpdateRestartTooltip", "Please restart {0} to enable the updated extension.", this.productService.nameLong) };
                }
                return void 0;
              }
              return { action: reloadAction, reason: nls.localize("postUpdateTooltip", "Please {0} to enable the updated extension.", reloadActionLabel) };
            }
            if (this.extensionsServers.length > 1) {
              const extensionInOtherServer = this.installed.filter((e) => areSameExtensions(e.identifier, extension.identifier) && e.server !== extension.server)[0];
              if (extensionInOtherServer) {
                if (runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.localExtensionManagementServer) {
                  return { action: reloadAction, reason: nls.localize("enable locally", "Please {0} to enable this extension locally.", reloadActionLabel) };
                }
                if (runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
                  return { action: reloadAction, reason: nls.localize("enable remote", "Please {0} to enable this extension in {1}.", reloadActionLabel, this.extensionManagementServerService.remoteExtensionManagementServer?.label) };
                }
              }
            }
          } else {
            if (extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
              if (this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest)) {
                return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
              }
            }
            if (extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
              if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest)) {
                return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
              }
            }
          }
          return void 0;
        } else {
          if (isSameExtensionRunning && !runningExtension.isUnderDevelopment) {
            return { action: reloadAction, reason: nls.localize("postDisableTooltip", "Please {0} to disable this extension.", reloadActionLabel) };
          }
        }
        return void 0;
      } else {
        if (isEnabled && !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
          return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
        }
        const otherServer = extension.server ? extension.server === this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.remoteExtensionManagementServer : this.extensionManagementServerService.localExtensionManagementServer : null;
        if (otherServer && extension.enablementState === EnablementState.DisabledByExtensionKind) {
          const extensionInOtherServer = this.local.filter((e) => areSameExtensions(e.identifier, extension.identifier) && e.server === otherServer)[0];
          if (extensionInOtherServer && extensionInOtherServer.local && this.extensionEnablementService.isEnabled(extensionInOtherServer.local)) {
            return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
          }
        }
      }
    }
    return void 0;
  }
  getPrimaryExtension(extensions) {
    if (extensions.length === 1) {
      return extensions[0];
    }
    const enabledExtensions = extensions.filter((e) => e.local && this.extensionEnablementService.isEnabled(e.local));
    if (enabledExtensions.length === 1) {
      return enabledExtensions[0];
    }
    const extensionsToChoose = enabledExtensions.length ? enabledExtensions : extensions;
    const manifest = extensionsToChoose.find((e) => e.local && e.local.manifest)?.local?.manifest;
    if (!manifest) {
      return extensionsToChoose[0];
    }
    const extensionKinds = this.extensionManifestPropertiesService.getExtensionKind(manifest);
    let extension = extensionsToChoose.find((extension2) => {
      for (const extensionKind of extensionKinds) {
        switch (extensionKind) {
          case "ui":
            if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
              return true;
            }
            return false;
          case "workspace":
            if (extension2.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
              return true;
            }
            return false;
          case "web":
            if (extension2.server === this.extensionManagementServerService.webExtensionManagementServer) {
              return true;
            }
            return false;
        }
      }
      return false;
    });
    if (!extension && this.extensionManagementServerService.localExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "workspace":
              if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
                return true;
              }
              return false;
            case "web":
              if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    if (!extension && this.extensionManagementServerService.webExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "web":
              if (extension2.server === this.extensionManagementServerService.webExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    if (!extension && this.extensionManagementServerService.remoteExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "web":
              if (extension2.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    return extension || extensions[0];
  }
  getExtensionState(extension) {
    if (this.installing.some((i) => areSameExtensions(i.identifier, extension.identifier) && (!extension.server || i.server === extension.server))) {
      return ExtensionState.Installing;
    }
    if (this.remoteExtensions) {
      const state = this.remoteExtensions.getExtensionState(extension);
      if (state !== ExtensionState.Uninstalled) {
        return state;
      }
    }
    if (this.webExtensions) {
      const state = this.webExtensions.getExtensionState(extension);
      if (state !== ExtensionState.Uninstalled) {
        return state;
      }
    }
    if (this.localExtensions) {
      return this.localExtensions.getExtensionState(extension);
    }
    return ExtensionState.Uninstalled;
  }
  async checkForUpdates(reason, onlyBuiltin) {
    if (reason) {
      this.logService.trace(`[Extensions]: Checking for updates. Reason: ${reason}`);
    } else {
      this.logService.trace(`[Extensions]: Checking for updates`);
    }
    if (!this.galleryService.isEnabled()) {
      return;
    }
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    if (!extensions.length) {
      return;
    }
    const infos = [];
    for (const installed of this.local) {
      if (onlyBuiltin && !installed.isBuiltin) {
        continue;
      }
      if (!installed.local?.forceAutoUpdate && installed.isBuiltin && !installed.local?.pinned && (installed.type === ExtensionType.System || !installed.local?.identifier.uuid)) {
        continue;
      }
      if (installed.local?.source === "resource") {
        continue;
      }
      infos.push({ ...installed.identifier, preRelease: !!installed.local?.preRelease, currentVersion: installed.isBuiltin ? installed.version : void 0 });
    }
    if (infos.length) {
      const targetPlatform = await extensions[0].server.extensionManagementService.getTargetPlatform();
      this.telemetryService.publicLog2("galleryService:checkingForUpdates", {
        count: infos.length
      });
      this.logService.trace(`Checking updates for extensions`, infos.map((e) => e.id).join(", "));
      const galleryExtensions = await this.galleryService.getExtensions(infos, { targetPlatform, compatible: true, productVersion: this.getProductVersion() }, CancellationToken.None);
      if (galleryExtensions.length) {
        await this.syncInstalledExtensionsWithGallery(galleryExtensions, infos);
      }
    }
  }
  async updateAll() {
    const toUpdate = [];
    this.outdated.forEach((extension) => {
      if (extension.gallery) {
        toUpdate.push({
          extension: extension.gallery,
          options: {
            operation: InstallOperation.Update,
            installPreReleaseVersion: extension.local?.isPreReleaseVersion,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
            isApplicationScoped: extension.local?.isApplicationScoped,
            context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
          }
        });
      }
    });
    return this.extensionManagementService.installGalleryExtensions(toUpdate);
  }
  async downloadVSIX(extensionId, versionKind) {
    let version;
    if (versionKind === "any") {
      version = await this.pickVersionToDownload(extensionId);
      if (!version) {
        return;
      }
    }
    const extensionInfo = version ? { id: extensionId, version: version.version } : { id: extensionId, preRelease: versionKind === "prerelease" };
    const queryOptions = version ? {} : { compatible: true };
    let [galleryExtension] = await this.galleryService.getExtensions([extensionInfo], queryOptions, CancellationToken.None);
    if (!galleryExtension) {
      throw new Error(nls.localize("extension not found", "Extension '{0}' not found.", extensionId));
    }
    let targetPlatform = galleryExtension.properties.targetPlatform;
    const options = [];
    for (const targetPlatform2 of version?.targetPlatforms ?? galleryExtension.allTargetPlatforms) {
      if (targetPlatform2 !== TargetPlatform.UNKNOWN && targetPlatform2 !== TargetPlatform.UNIVERSAL) {
        options.push({
          label: targetPlatform2 === TargetPlatform.UNDEFINED ? nls.localize("allplatforms", "All Platforms") : TargetPlatformToString(targetPlatform2),
          id: targetPlatform2
        });
      }
    }
    if (options.length > 1) {
      const message = nls.localize("platform placeholder", "Please select the platform for which you want to download the VSIX");
      const option = await this.quickInputService.pick(options.sort((a, b) => a.label.localeCompare(b.label)), { placeHolder: message });
      if (!option) {
        return;
      }
      targetPlatform = option.id;
    }
    if (targetPlatform !== galleryExtension.properties.targetPlatform) {
      [galleryExtension] = await this.galleryService.getExtensions([extensionInfo], { ...queryOptions, targetPlatform }, CancellationToken.None);
    }
    const result = await this.fileDialogService.showOpenDialog({
      title: nls.localize("download title", "Select folder to download the VSIX"),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: nls.localize("download", "Download")
    });
    if (!result?.[0]) {
      return;
    }
    this.progressService.withProgress({ location: ProgressLocation.Notification }, async (progress) => {
      try {
        progress.report({ message: nls.localize("downloading...", "Downloading VSIX...") });
        const name = `${galleryExtension.identifier.id}-${galleryExtension.version}${targetPlatform !== TargetPlatform.UNDEFINED && targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNKNOWN ? `-${targetPlatform}` : ""}.vsix`;
        await this.galleryService.download(galleryExtension, this.uriIdentityService.extUri.joinPath(result[0], name), InstallOperation.None);
        this.notificationService.info(nls.localize("download.completed", "Successfully downloaded the VSIX"));
      } catch (error) {
        this.notificationService.error(nls.localize("download.failed", "Error while downloading the VSIX: {0}", getErrorMessage(error)));
      }
    });
  }
  async pickVersionToDownload(extensionId) {
    const allVersions = await this.galleryService.getAllVersions({ id: extensionId });
    if (!allVersions.length) {
      await this.dialogService.info(nls.localize("no versions", "This extension has no other versions."));
      return;
    }
    const picks = allVersions.map((v, i) => {
      return {
        id: v.version,
        label: v.version,
        description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${nls.localize("pre-release", "pre-release")})` : ""}`,
        ariaLabel: `${v.isPreReleaseVersion ? "Pre-Release version" : "Release version"} ${v.version}`,
        data: v
      };
    });
    const pick = await this.quickInputService.pick(
      picks,
      {
        placeHolder: nls.localize("selectVersion", "Select Version to Download"),
        matchOnDetail: true
      }
    );
    return pick?.data;
  }
  async syncInstalledExtensionsWithGallery(gallery, flagExtensionsMissingFromGallery) {
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    if (!extensions.length) {
      return;
    }
    await Promise.allSettled(extensions.map((extensions2) => extensions2.syncInstalledExtensionsWithGallery(gallery, this.getProductVersion(), flagExtensionsMissingFromGallery)));
    if (this.outdated.length) {
      this.logService.info(`Auto updating outdated extensions.`, this.outdated.map((e) => e.identifier.id).join(", "));
      this.eventuallyAutoUpdateExtensions();
    }
  }
  isAutoCheckUpdatesEnabled() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return false;
    }
    return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
  }
  eventuallyCheckForUpdates(immediate = false) {
    this.updatesCheckDelayer.cancel();
    this.updatesCheckDelayer.trigger(async () => {
      if (this.isAutoCheckUpdatesEnabled()) {
        await this.checkForUpdates();
      }
      this.eventuallyCheckForUpdates();
    }, immediate ? 0 : this.getUpdatesCheckInterval()).then(void 0, (err) => null);
  }
  getUpdatesCheckInterval() {
    if (this.productService.quality === "insider" && this.getProductUpdateVersion()) {
      return 1e3 * 60 * 60 * 1;
    }
    return ExtensionsWorkbenchService.UpdatesCheckInterval;
  }
  eventuallyAutoUpdateExtensions() {
    this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions()).then(void 0, (err) => null);
  }
  async autoUpdateBuiltinExtensions() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return;
    }
    await this.checkForUpdates(void 0, true);
    const toUpdate = this.outdated.filter((e) => e.isBuiltin);
    await Promises.settled(toUpdate.map((e) => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true } : void 0)));
  }
  async syncPinnedBuiltinExtensions() {
    const infos = [];
    for (const installed of this.local) {
      if (installed.isBuiltin && installed.local?.pinned && installed.local?.identifier.uuid) {
        infos.push({ ...installed.identifier, version: installed.version });
      }
    }
    if (infos.length) {
      const galleryExtensions = await this.galleryService.getExtensions(infos, CancellationToken.None);
      if (galleryExtensions.length) {
        await this.syncInstalledExtensionsWithGallery(galleryExtensions);
      }
    }
  }
  async autoUpdateExtensions() {
    if (this.meteredConnectionService.isConnectionMetered) {
      this.logService.trace("[Extensions]: Skipping auto-update because connection is metered");
      return;
    }
    const toUpdate = [];
    const disabledAutoUpdate = [];
    const consentRequired = [];
    let soonestDelayRemaining = Number.MAX_SAFE_INTEGER;
    for (const extension of this.outdated) {
      if (!this.shouldAutoUpdateExtension(extension)) {
        disabledAutoUpdate.push(extension.identifier.id);
        continue;
      }
      if (!extension.local?.forceAutoUpdate) {
        const delayRemaining = this.getAutoUpdateDelayRemaining(extension);
        if (delayRemaining > 0) {
          this.logService.trace("Auto update delayed for extension", extension.identifier.id);
          soonestDelayRemaining = Math.min(soonestDelayRemaining, delayRemaining);
          continue;
        }
      }
      if (await this.shouldRequireConsentToUpdate(extension)) {
        consentRequired.push(extension.identifier.id);
        continue;
      }
      toUpdate.push(extension);
    }
    if (soonestDelayRemaining < Number.MAX_SAFE_INTEGER) {
      this.delayedAutoUpdateCheckTimer.value = disposableTimeout(() => this.eventuallyCheckForUpdates(true), soonestDelayRemaining);
    } else {
      this.delayedAutoUpdateCheckTimer.value = void 0;
    }
    if (disabledAutoUpdate.length) {
      this.logService.trace("Auto update disabled for extensions", disabledAutoUpdate.join(", "));
    }
    if (consentRequired.length) {
      this.logService.info("Auto update consent required for extensions", consentRequired.join(", "));
    }
    if (!toUpdate.length) {
      return;
    }
    const productVersion = this.getProductVersion();
    await Promises.settled(toUpdate.map((e) => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true, productVersion } : { productVersion })));
  }
  getProductVersion() {
    return this.getProductUpdateVersion() ?? this.getProductCurrentVersion();
  }
  getProductCurrentVersion() {
    return { version: this.productService.version, date: this.productService.date };
  }
  getProductUpdateVersion() {
    switch (this.updateService.state.type) {
      case StateType.AvailableForDownload:
      case StateType.Downloaded:
      case StateType.Updating:
      case StateType.Ready: {
        const version = this.updateService.state.update.productVersion;
        if (version && semver.valid(version)) {
          return { version, date: this.updateService.state.update.timestamp ? new Date(this.updateService.state.update.timestamp).toISOString() : void 0 };
        }
      }
    }
    return void 0;
  }
  shouldAutoUpdateExtension(extension) {
    if (extension.deprecationInfo?.disallowInstall) {
      return false;
    }
    if (extension.local?.forceAutoUpdate) {
      return true;
    }
    const autoUpdateValue = this.getAutoUpdateValue();
    if (autoUpdateValue === "off") {
      const extensionsToAutoUpdate = this.getEnabledAutoUpdateExtensions();
      const extensionId = extension.identifier.id.toLowerCase();
      if (extensionsToAutoUpdate.includes(extensionId)) {
        return true;
      }
      if (this.isAutoUpdateEnabledForPublisher(extension.publisher) && !extensionsToAutoUpdate.includes(`-${extensionId}`)) {
        return true;
      }
      return false;
    }
    if (extension.pinned) {
      return false;
    }
    const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
    if (disabledAutoUpdateExtensions.includes(extension.identifier.id.toLowerCase())) {
      return false;
    }
    return extension.enablementState !== EnablementState.DisabledGlobally && extension.enablementState !== EnablementState.DisabledWorkspace;
  }
  async shouldRequireConsentToUpdate(extension) {
    if (!extension.outdated) {
      return;
    }
    if (!extension.gallery || !extension.local) {
      return;
    }
    if (extension.local.identifier.uuid && extension.local.identifier.uuid !== extension.gallery.identifier.uuid) {
      return nls.localize("consentRequiredToUpdateRepublishedExtension", "The marketplace metadata of this extension changed, likely due to a re-publish.");
    }
    if (!extension.local.manifest.engines.vscode || extension.local.manifest.main || extension.local.manifest.browser) {
      return;
    }
    if (isDefined(extension.gallery.properties?.executesCode)) {
      if (!extension.gallery.properties.executesCode) {
        return;
      }
    } else {
      const manifest = extension instanceof Extension ? await extension.getGalleryManifest() : await this.galleryService.getManifest(extension.gallery, CancellationToken.None);
      if (!manifest?.main && !manifest?.browser) {
        return;
      }
    }
    return nls.localize("consentRequiredToUpdate", "The update for {0} extension introduces executable code, which is not present in the currently installed version.", extension.displayName);
  }
  isAutoUpdateEnabledFor(extensionOrPublisher) {
    if (isString(extensionOrPublisher)) {
      if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
        throw new Error("Expected publisher string, found extension identifier");
      }
      if (this.isAutoUpdateEnabled()) {
        return true;
      }
      return this.isAutoUpdateEnabledForPublisher(extensionOrPublisher);
    }
    return this.shouldAutoUpdateExtension(extensionOrPublisher);
  }
  isAutoUpdateEnabledForPublisher(publisher) {
    const publishersToAutoUpdate = this.getPublishersToAutoUpdate();
    return publishersToAutoUpdate.includes(publisher.toLowerCase());
  }
  async updateAutoUpdateEnablementFor(extensionOrPublisher, enable) {
    if (this.isAutoUpdateEnabled()) {
      if (isString(extensionOrPublisher)) {
        throw new Error("Expected extension, found publisher string");
      }
      const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
      const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
      const extensionIndex = disabledAutoUpdateExtensions.indexOf(extensionId);
      if (enable) {
        if (extensionIndex !== -1) {
          disabledAutoUpdateExtensions.splice(extensionIndex, 1);
        }
      } else {
        if (extensionIndex === -1) {
          disabledAutoUpdateExtensions.push(extensionId);
        }
      }
      this.setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions);
      if (enable && extensionOrPublisher.local && extensionOrPublisher.pinned) {
        await this.extensionManagementService.updateMetadata(extensionOrPublisher.local, { pinned: false });
      }
      this._onChange.fire(extensionOrPublisher);
    } else {
      const enabledAutoUpdateExtensions = this.getEnabledAutoUpdateExtensions();
      if (isString(extensionOrPublisher)) {
        if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
          throw new Error("Expected publisher string, found extension identifier");
        }
        extensionOrPublisher = extensionOrPublisher.toLowerCase();
        if (this.isAutoUpdateEnabledFor(extensionOrPublisher) !== enable) {
          if (enable) {
            enabledAutoUpdateExtensions.push(extensionOrPublisher);
          } else {
            if (enabledAutoUpdateExtensions.includes(extensionOrPublisher)) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionOrPublisher), 1);
            }
          }
        }
        this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
        for (const e of this.installed) {
          if (e.publisher.toLowerCase() === extensionOrPublisher) {
            this._onChange.fire(e);
          }
        }
      } else {
        const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
        const enableAutoUpdatesForPublisher = this.isAutoUpdateEnabledFor(extensionOrPublisher.publisher.toLowerCase());
        const enableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(extensionId);
        const disableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(`-${extensionId}`);
        if (enable) {
          if (disableAutoUpdatesForExtension) {
            enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
          }
          if (enableAutoUpdatesForPublisher) {
            if (enableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
            }
          } else {
            if (!enableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.push(extensionId);
            }
          }
        } else {
          if (enableAutoUpdatesForExtension) {
            enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
          }
          if (enableAutoUpdatesForPublisher) {
            if (!disableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.push(`-${extensionId}`);
            }
          } else {
            if (disableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
            }
          }
        }
        this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
        this._onChange.fire(extensionOrPublisher);
      }
    }
    if (enable) {
      this.autoUpdateExtensions();
    }
  }
  onDidSelectedExtensionToAutoUpdateValueChange() {
    if (this.enabledAuotUpdateExtensionsValue !== this.getEnabledAutoUpdateExtensionsValue() || this.disabledAutoUpdateExtensionsValue !== this.getDisabledAutoUpdateExtensionsValue()) {
      const userExtensions = this.installed.filter((e) => !e.isBuiltin);
      const groupBy = (extensions) => {
        const shouldAutoUpdate2 = [];
        const shouldNotAutoUpdate2 = [];
        for (const extension of extensions) {
          if (this.shouldAutoUpdateExtension(extension)) {
            shouldAutoUpdate2.push(extension);
          } else {
            shouldNotAutoUpdate2.push(extension);
          }
        }
        return [shouldAutoUpdate2, shouldNotAutoUpdate2];
      };
      const [wasShouldAutoUpdate, wasShouldNotAutoUpdate] = groupBy(userExtensions);
      this._enabledAutoUpdateExtensionsValue = void 0;
      this._disabledAutoUpdateExtensionsValue = void 0;
      const [shouldAutoUpdate, shouldNotAutoUpdate] = groupBy(userExtensions);
      for (const e of wasShouldAutoUpdate ?? []) {
        if (shouldNotAutoUpdate?.includes(e)) {
          this._onChange.fire(e);
        }
      }
      for (const e of wasShouldNotAutoUpdate ?? []) {
        if (shouldAutoUpdate?.includes(e)) {
          this._onChange.fire(e);
        }
      }
    }
  }
  async canInstall(extension) {
    if (!(extension instanceof Extension)) {
      return new MarkdownString().appendText(nls.localize("not an extension", "The provided object is not an extension."));
    }
    if (extension.isMalicious) {
      return new MarkdownString().appendText(nls.localize("malicious", "This extension is reported to be problematic."));
    }
    if (extension.deprecationInfo?.disallowInstall) {
      return new MarkdownString().appendText(nls.localize("disallowed", "This extension is disallowed to be installed."));
    }
    if (extension.gallery) {
      if (!extension.gallery.isSigned && shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
        return new MarkdownString().appendText(nls.localize("not signed", "This extension is not signed."));
      }
      const localResult = this.localExtensions ? await this.localExtensions.canInstall(extension.gallery) : void 0;
      if (localResult === true) {
        return true;
      }
      const remoteResult = this.remoteExtensions ? await this.remoteExtensions.canInstall(extension.gallery) : void 0;
      if (remoteResult === true) {
        return true;
      }
      const webResult = this.webExtensions ? await this.webExtensions.canInstall(extension.gallery) : void 0;
      if (webResult === true) {
        return true;
      }
      return localResult ?? remoteResult ?? webResult ?? new MarkdownString().appendText(nls.localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
    }
    if (extension.resourceExtension && await this.extensionManagementService.canInstall(extension.resourceExtension) === true) {
      return true;
    }
    return new MarkdownString().appendText(nls.localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
  }
  async install(arg, installOptions = {}, progressLocation) {
    const extension = await this._install(arg, installOptions, progressLocation);
    if (!extension) {
      throw new Error(nls.localize("unknown", "Unable to install extension"));
    }
    if (installOptions.enable) {
      if (extension.enablementState === EnablementState.DisabledWorkspace || extension.enablementState === EnablementState.DisabledGlobally) {
        if (installOptions.justification) {
          const result = await this.dialogService.confirm({
            title: nls.localize("enableExtensionTitle", "Enable Extension"),
            message: nls.localize("enableExtensionMessage", "Would you like to enable '{0}' extension?", extension.displayName),
            detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
            primaryButton: isString(installOptions.justification) ? nls.localize({ key: "enableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Enable Extension") : nls.localize({ key: "enableButtonLabelWithAction", comment: ["&& denotes a mnemonic"] }, "&&Enable Extension and {0}", installOptions.justification.action)
          });
          if (!result.confirmed) {
            throw new CancellationError();
          }
        }
        await this.setEnablement(extension, extension.enablementState === EnablementState.DisabledWorkspace ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
      }
      await this.waitUntilExtensionIsEnabled(extension);
    }
    return extension;
  }
  async _install(arg, installOptions = {}, progressLocation) {
    let installable;
    let extension;
    let servers;
    if (arg instanceof URI) {
      installable = arg;
    } else {
      let installableInfo;
      let gallery;
      if (isString(arg)) {
        extension = this.local.find((e) => areSameExtensions(e.identifier, { id: arg }));
        if (extension?.isBuiltin) {
          if (this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === arg.toLowerCase())) {
            return extension;
          }
        } else {
          installableInfo = { id: arg, version: installOptions.version, preRelease: installOptions.installPreReleaseVersion ?? this.extensionManagementService.preferPreReleases };
        }
      } else if (arg.gallery) {
        extension = arg;
        gallery = arg.gallery;
        if (installOptions.version && installOptions.version !== gallery?.version) {
          installableInfo = { id: extension.identifier.id, version: installOptions.version };
        }
      } else if (arg.resourceExtension) {
        extension = arg;
        installable = arg.resourceExtension;
      }
      if (installableInfo) {
        const targetPlatform = extension?.server ? await extension.server.extensionManagementService.getTargetPlatform() : void 0;
        gallery = (await this.galleryService.getExtensions([installableInfo], { targetPlatform }, CancellationToken.None)).at(0);
      }
      if (!extension && gallery) {
        extension = this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, gallery, void 0);
        extension.setExtensionsControlManifest(await this.extensionManagementService.getExtensionsControlManifest());
      }
      if (extension?.isMalicious) {
        throw new Error(nls.localize("malicious", "This extension is reported to be problematic."));
      }
      if (gallery) {
        if (installOptions.installEverywhere) {
          servers = [];
          const installableServers = await this.extensionManagementService.getInstallableServers(gallery);
          for (const extensionsServer of this.extensionsServers) {
            if (installableServers.includes(extensionsServer.server) && !extensionsServer.local.find((e) => areSameExtensions(e.identifier, gallery.identifier))) {
              servers.push(extensionsServer.server);
            }
          }
        } else if (installOptions.enable && extension?.local) {
          servers = [];
          if (extension.enablementState === EnablementState.DisabledByExtensionKind) {
            const [installableServer] = await this.extensionManagementService.getInstallableServers(gallery);
            if (installableServer) {
              servers.push(installableServer);
            }
          }
        }
      }
      if (!servers || servers.length) {
        if (!installable) {
          if (!gallery) {
            const id = isString(arg) ? arg : arg.identifier.id;
            const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
            const reportIssueUri = manifest ? getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ContactSupportUri) : void 0;
            const reportIssueMessage = reportIssueUri ? nls.localize("report issue", "If this issue persists, please report it at {0}", reportIssueUri.toString()) : "";
            if (installOptions.version) {
              const message = nls.localize("not found version", "The extension '{0}' cannot be installed because the requested version '{1}' was not found.", id, installOptions.version);
              throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
            } else {
              const message = nls.localize("not found", "The extension '{0}' cannot be installed because it was not found.", id);
              throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
            }
          }
          installable = gallery;
        }
        if (installOptions.version) {
          installOptions.installGivenVersion = true;
        }
        if (extension?.isWorkspaceScoped) {
          installOptions.isWorkspaceScoped = true;
        }
      }
    }
    if (installable) {
      if (installOptions.justification) {
        const syncCheck = isUndefined(installOptions.isMachineScoped) && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
        const buttons = [];
        buttons.push({
          label: isString(installOptions.justification) || !installOptions.justification.action ? nls.localize({ key: "installButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Install Extension") : nls.localize({ key: "installButtonLabelWithAction", comment: ["&& denotes a mnemonic"] }, "&&Install Extension and {0}", installOptions.justification.action),
          run: () => true
        });
        if (!extension) {
          buttons.push({ label: nls.localize("open", "Open Extension"), run: () => {
            this.open(extension);
            return false;
          } });
        }
        const result = await this.dialogService.prompt({
          title: nls.localize("installExtensionTitle", "Install Extension"),
          message: extension ? nls.localize("installExtensionMessage", "Would you like to install '{0}' extension from '{1}'?", extension.displayName, extension.publisherDisplayName) : nls.localize("installVSIXMessage", "Would you like to install the extension?"),
          detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
          cancelButton: true,
          buttons,
          checkbox: syncCheck ? {
            label: nls.localize("sync extension", "Sync this extension"),
            checked: true
          } : void 0
        });
        if (!result.result) {
          throw new CancellationError();
        }
        if (syncCheck) {
          installOptions.isMachineScoped = !result.checkboxChecked;
        }
      }
      if (installable instanceof URI) {
        extension = await this.doInstall(void 0, () => this.installFromVSIX(installable, installOptions), progressLocation);
      } else if (extension) {
        if (extension.resourceExtension) {
          extension = await this.doInstall(extension, () => this.extensionManagementService.installResourceExtension(installable, installOptions), progressLocation);
        } else {
          extension = await this.doInstall(extension, () => this.installFromGallery(extension, installable, installOptions, servers), progressLocation);
        }
      }
    }
    return extension;
  }
  async installInServer(extension, server, installOptions) {
    await this.doInstall(extension, async () => {
      const local = extension.local;
      if (!local) {
        throw new Error("Extension not found");
      }
      if (!extension.gallery) {
        extension = (await this.getExtensions([{ ...extension.identifier, preRelease: local.preRelease }], CancellationToken.None))[0] ?? extension;
      }
      if (extension.gallery) {
        return server.extensionManagementService.installFromGallery(extension.gallery, { installPreReleaseVersion: local.preRelease, ...installOptions });
      }
      const targetPlatform = await server.extensionManagementService.getTargetPlatform();
      if (!isTargetPlatformCompatible(local.targetPlatform, [local.targetPlatform], targetPlatform)) {
        throw new Error(nls.localize("incompatible", "Can't install '{0}' extension because it is not compatible.", extension.identifier.id));
      }
      const vsix = await this.extensionManagementService.zip(local);
      try {
        return await server.extensionManagementService.install(vsix);
      } finally {
        try {
          await this.fileService.del(vsix);
        } catch (error) {
          this.logService.error(error);
        }
      }
    });
  }
  canSetLanguage(extension) {
    if (!isWeb) {
      return false;
    }
    if (!extension.gallery) {
      return false;
    }
    const locale = getLocale(extension.gallery);
    if (!locale) {
      return false;
    }
    return true;
  }
  async setLanguage(extension) {
    if (!this.canSetLanguage(extension)) {
      throw new Error("Can not set language");
    }
    const locale = getLocale(extension.gallery);
    if (locale === language) {
      return;
    }
    const localizedLanguageName = extension.gallery?.properties?.localizedLanguages?.[0];
    return this.localeService.setLocale({ id: locale, galleryExtension: extension.gallery, extensionId: extension.identifier.id, label: localizedLanguageName ?? extension.displayName });
  }
  setEnablement(extensions, enablementState) {
    extensions = Array.isArray(extensions) ? extensions : [extensions];
    return this.promptAndSetEnablement(extensions, enablementState);
  }
  async uninstall(e) {
    const extension = e.local ? e : this.local.find((local) => areSameExtensions(local.identifier, e.identifier));
    if (!extension?.local) {
      throw new Error("Missing local");
    }
    if (extension.local.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
      const { confirmed } = await this.dialogService.confirm({
        title: nls.localize("uninstallApplicationScoped", "Uninstall Extension"),
        type: Severity.Info,
        message: nls.localize("uninstallApplicationScopedMessage", "Would you like to Uninstall {0} from all profiles?", extension.displayName),
        primaryButton: nls.localize("uninstallAllProfiles", "Uninstall (All Profiles)")
      });
      if (!confirmed) {
        throw new CancellationError();
      }
    }
    const extensionsToUninstall = [{ extension: extension.local }];
    const defaultChatExtensionId = this.productService.defaultChatAgent?.extensionId;
    if (!defaultChatExtensionId || !areSameExtensions(extension.identifier, { id: defaultChatExtensionId })) {
      for (const packExtension of this.getAllPackedExtensions(extension, this.local)) {
        if (packExtension.local && !extensionsToUninstall.some((e2) => areSameExtensions(e2.extension.identifier, packExtension.identifier))) {
          extensionsToUninstall.push({ extension: packExtension.local });
        }
      }
    }
    const dependents = [];
    let extensionsFromAllProfiles;
    for (const { extension: extension2 } of extensionsToUninstall) {
      const installedExtensions = [];
      if (extension2.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
        if (!extensionsFromAllProfiles) {
          extensionsFromAllProfiles = [];
          await Promise.allSettled(this.userDataProfilesService.profiles.map(async (profile) => {
            const installed = await this.extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource);
            for (const local of installed) {
              extensionsFromAllProfiles?.push([local, profile.extensionsResource]);
            }
          }));
        }
        installedExtensions.push(...extensionsFromAllProfiles);
      } else {
        for (const { local } of this.local) {
          if (local) {
            installedExtensions.push([local, void 0]);
          }
        }
      }
      for (const [local, profileLocation] of installedExtensions) {
        if (areSameExtensions(local.identifier, extension2.identifier)) {
          continue;
        }
        if (!local.manifest.extensionDependencies || local.manifest.extensionDependencies.length === 0) {
          continue;
        }
        if (extension2.manifest.extensionPack?.some((id) => areSameExtensions({ id }, local.identifier))) {
          continue;
        }
        if (dependents.some((d) => d.manifest.extensionPack?.some((id) => areSameExtensions({ id }, local.identifier)))) {
          continue;
        }
        if (local.manifest.extensionDependencies.some((dep) => areSameExtensions(extension2.identifier, { id: dep }))) {
          dependents.push(local);
          extensionsToUninstall.push({ extension: local, options: { profileLocation } });
        }
      }
    }
    if (dependents.length) {
      const { result } = await this.dialogService.prompt({
        title: nls.localize("uninstallDependents", "Uninstall Extension with Dependents"),
        type: Severity.Warning,
        message: this.getErrorMessageForUninstallingAnExtensionWithDependents(extension, dependents),
        buttons: [{
          label: nls.localize("uninstallAll", "Uninstall All"),
          run: () => true
        }],
        cancelButton: {
          run: () => false
        }
      });
      if (!result) {
        throw new CancellationError();
      }
    }
    return this.withProgress({
      location: ProgressLocation.Extensions,
      title: nls.localize("uninstallingExtension", "Uninstalling extension..."),
      source: `${extension.identifier.id}`
    }, () => this.extensionManagementService.uninstallExtensions(extensionsToUninstall).then(() => void 0));
  }
  getAllPackedExtensions(extension, installed, checked = []) {
    if (checked.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
      return [];
    }
    checked.push(extension);
    const extensionsPack = extension.extensionPack ?? [];
    if (extensionsPack.length) {
      const packedExtensions = [];
      for (const i of installed) {
        if (!i.isBuiltin && extensionsPack.some((id) => areSameExtensions({ id }, i.identifier))) {
          packedExtensions.push(i);
        }
      }
      const packOfPackedExtensions = [];
      for (const packedExtension of packedExtensions) {
        packOfPackedExtensions.push(...this.getAllPackedExtensions(packedExtension, installed, checked));
      }
      return [...packedExtensions, ...packOfPackedExtensions];
    }
    return [];
  }
  getErrorMessageForUninstallingAnExtensionWithDependents(extension, dependents) {
    if (dependents.length === 1) {
      return nls.localize("singleDependentUninstallError", "Cannot uninstall '{0}' extension alone. '{1}' extension depends on this. Do you want to uninstall all these extensions?", extension.displayName, dependents[0].manifest.displayName);
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoDependentsUninstallError",
        "Cannot uninstall '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to uninstall all these extensions?",
        extension.displayName,
        dependents[0].manifest.displayName,
        dependents[1].manifest.displayName
      );
    }
    return nls.localize(
      "multipleDependentsUninstallError",
      "Cannot uninstall '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to uninstall all these extensions?",
      extension.displayName,
      dependents[0].manifest.displayName,
      dependents[1].manifest.displayName
    );
  }
  isExtensionIgnoredToSync(extension) {
    return extension.local ? !this.isInstalledExtensionSynced(extension.local) : this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
  }
  async togglePreRelease(extension) {
    if (!extension.local) {
      return;
    }
    if (extension.preRelease !== extension.isPreReleaseVersion) {
      await this.extensionManagementService.updateMetadata(extension.local, { preRelease: !extension.preRelease });
      return;
    }
    await this.install(extension, { installPreReleaseVersion: !extension.preRelease, preRelease: !extension.preRelease });
  }
  async toggleExtensionIgnoredToSync(extension) {
    const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
    for (const e of extensionsIncludingPackedExtensions) {
      const isIgnored = this.isExtensionIgnoredToSync(e);
      if (e.local && isIgnored && e.local.isMachineScoped) {
        await this.extensionManagementService.updateMetadata(e.local, { isMachineScoped: false });
      } else {
        await this.extensionsSyncManagementService.updateIgnoredExtensions(e.identifier.id, !isIgnored);
      }
    }
    await this.userDataAutoSyncService.triggerSync(["IgnoredExtensionsUpdated"]);
  }
  async toggleApplyExtensionToAllProfiles(extension) {
    const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
    const allExtensionServers = this.getAllExtensionServers();
    await Promise.allSettled(extensionsIncludingPackedExtensions.map(async (e) => {
      if (!e.local || isApplicationScopedExtension(e.local.manifest) || e.isBuiltin) {
        return;
      }
      const isApplicationScoped = e.local.isApplicationScoped;
      await Promise.all(allExtensionServers.map(async (extensionServer) => {
        const local = extensionServer.local.find((local2) => areSameExtensions(e.identifier, local2.identifier))?.local;
        if (local && local.isApplicationScoped === isApplicationScoped) {
          await this.extensionManagementService.toggleApplicationScope(local, this.userDataProfileService.currentProfile.extensionsResource);
        }
      }));
    }));
  }
  getAllExtensionServers() {
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    return extensions;
  }
  isInstalledExtensionSynced(extension) {
    if (extension.isMachineScoped) {
      return false;
    }
    if (this.extensionsSyncManagementService.hasToAlwaysSyncExtension(extension.identifier.id)) {
      return true;
    }
    return !this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
  }
  doInstall(extension, installTask, progressLocation) {
    const title = extension ? nls.localize("installing named extension", "Installing '{0}' extension...", extension.displayName) : nls.localize("installing extension", "Installing extension...");
    return this.withProgress({
      location: progressLocation ?? ProgressLocation.Extensions,
      title
    }, async () => {
      try {
        if (extension) {
          this.installing.push(extension);
          this._onChange.fire(extension);
        }
        const local = await installTask();
        return await this.waitAndGetInstalledExtension(local.identifier);
      } finally {
        if (extension) {
          this.installing = this.installing.filter((e) => e !== extension);
          this._onChange.fire(void 0);
        }
      }
    });
  }
  async installFromVSIX(vsix, installOptions) {
    const manifest = await this.extensionManagementService.getManifest(vsix);
    const existingExtension = this.local.find((local) => areSameExtensions(local.identifier, { id: getGalleryExtensionId(manifest.publisher, manifest.name) }));
    if (existingExtension) {
      installOptions = installOptions || {};
      if (existingExtension.latestVersion === manifest.version) {
        installOptions.pinned = installOptions.pinned ?? (existingExtension.local?.pinned || !this.shouldAutoUpdateExtension(existingExtension));
      } else {
        installOptions.installGivenVersion = true;
      }
    }
    return this.extensionManagementService.installVSIX(vsix, manifest, installOptions);
  }
  installFromGallery(extension, gallery, installOptions, servers) {
    installOptions = installOptions ?? {};
    installOptions.pinned = installOptions.pinned ?? (extension.local?.pinned || !this.shouldAutoUpdateExtension(extension));
    if (extension.local && !servers) {
      installOptions.productVersion = this.getProductVersion();
      installOptions.operation = InstallOperation.Update;
      return this.extensionManagementService.updateFromGallery(gallery, extension.local, installOptions);
    } else {
      return this.extensionManagementService.installFromGallery(gallery, installOptions, servers);
    }
  }
  async waitAndGetInstalledExtension(identifier) {
    let installedExtension = this.local.find((local) => areSameExtensions(local.identifier, identifier));
    if (!installedExtension) {
      await Event.toPromise(Event.filter(this.onChange, (e) => !!e && this.local.some((local) => areSameExtensions(local.identifier, identifier))));
    }
    installedExtension = this.local.find((local) => areSameExtensions(local.identifier, identifier));
    if (!installedExtension) {
      throw new Error("Extension should have been installed");
    }
    return installedExtension;
  }
  async waitUntilExtensionIsEnabled(extension) {
    if (this.extensionService.extensions.find((e) => ExtensionIdentifier.equals(e.identifier, extension.identifier.id))) {
      return;
    }
    if (!extension.local || !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
      return;
    }
    await new Promise((c, e) => {
      const disposable = this.extensionService.onDidChangeExtensions(() => {
        try {
          if (this.extensionService.extensions.find((e2) => ExtensionIdentifier.equals(e2.identifier, extension.identifier.id))) {
            disposable.dispose();
            c();
          }
        } catch (error) {
          e(error);
        }
      });
    });
  }
  promptAndSetEnablement(extensions, enablementState) {
    const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
    if (enable) {
      const allDependenciesAndPackedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: true, pack: true });
      return this.checkAndSetEnablement(extensions, allDependenciesAndPackedExtensions, enablementState);
    } else {
      const packedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: false, pack: true });
      if (packedExtensions.length) {
        return this.checkAndSetEnablement(extensions, packedExtensions, enablementState);
      }
      return this.checkAndSetEnablement(extensions, [], enablementState);
    }
  }
  async checkAndSetEnablement(extensions, otherExtensions, enablementState) {
    const allExtensions = [...extensions, ...otherExtensions];
    const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
    if (!enable) {
      for (const extension of extensions) {
        const dependents = this.getDependentsAfterDisablement(extension, allExtensions, this.local);
        if (dependents.length) {
          const { result } = await this.dialogService.prompt({
            title: nls.localize("disableDependents", "Disable Extension with Dependents"),
            type: Severity.Warning,
            message: this.getDependentsErrorMessageForDisablement(extension, allExtensions, dependents),
            buttons: [{
              label: nls.localize("disable all", "Disable All"),
              run: () => true
            }],
            cancelButton: {
              run: () => false
            }
          });
          if (!result) {
            throw new CancellationError();
          }
          await this.checkAndSetEnablement(dependents, [extension], enablementState);
        }
      }
    }
    return this.doSetEnablement(allExtensions, enablementState);
  }
  getExtensionsRecursively(extensions, installed, enablementState, options, checked = []) {
    const toCheck = extensions.filter((e) => checked.indexOf(e) === -1);
    if (toCheck.length) {
      for (const extension of toCheck) {
        checked.push(extension);
      }
      const extensionsToEanbleOrDisable = installed.filter((i) => {
        if (checked.indexOf(i) !== -1) {
          return false;
        }
        const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
        const isExtensionEnabled = i.enablementState === EnablementState.EnabledGlobally || i.enablementState === EnablementState.EnabledWorkspace;
        if (enable === isExtensionEnabled) {
          return false;
        }
        return (enable || !i.isBuiltin) && (options.dependencies || options.pack) && extensions.some(
          (extension) => options.dependencies && extension.dependencies.some((id) => areSameExtensions({ id }, i.identifier)) || options.pack && extension.extensionPack.some((id) => areSameExtensions({ id }, i.identifier))
        );
      });
      if (extensionsToEanbleOrDisable.length) {
        extensionsToEanbleOrDisable.push(...this.getExtensionsRecursively(extensionsToEanbleOrDisable, installed, enablementState, options, checked));
      }
      return extensionsToEanbleOrDisable;
    }
    return [];
  }
  getDependentsAfterDisablement(extension, extensionsToDisable, installed) {
    return installed.filter((i) => {
      if (i.dependencies.length === 0) {
        return false;
      }
      if (i === extension) {
        return false;
      }
      if (!this.extensionEnablementService.isEnabledEnablementState(i.enablementState)) {
        return false;
      }
      if (extensionsToDisable.indexOf(i) !== -1) {
        return false;
      }
      return i.dependencies.some((dep) => [extension, ...extensionsToDisable].some((d) => areSameExtensions(d.identifier, { id: dep })));
    });
  }
  getDependentsErrorMessageForDisablement(extension, allDisabledExtensions, dependents) {
    for (const e of [extension, ...allDisabledExtensions]) {
      const dependentsOfTheExtension = dependents.filter((d) => d.dependencies.some((id) => areSameExtensions({ id }, e.identifier)));
      if (dependentsOfTheExtension.length) {
        return this.getErrorMessageForDisablingAnExtensionWithDependents(e, dependentsOfTheExtension);
      }
    }
    return "";
  }
  getErrorMessageForDisablingAnExtensionWithDependents(extension, dependents) {
    if (dependents.length === 1) {
      return nls.localize("singleDependentError", "Cannot disable '{0}' extension alone. '{1}' extension depends on this. Do you want to disable all these extensions?", extension.displayName, dependents[0].displayName);
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoDependentsError",
        "Cannot disable '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to disable all these extensions?",
        extension.displayName,
        dependents[0].displayName,
        dependents[1].displayName
      );
    }
    return nls.localize(
      "multipleDependentsError",
      "Cannot disable '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to disable all these extensions?",
      extension.displayName,
      dependents[0].displayName,
      dependents[1].displayName
    );
  }
  async doSetEnablement(extensions, enablementState) {
    return await this.extensionEnablementService.setEnablement(extensions.map((e) => e.local), enablementState);
  }
  reportProgressFromOtherSources() {
    if (this.installed.some((e) => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling)) {
      if (!this._activityCallBack) {
        this.withProgress({ location: ProgressLocation.Extensions }, () => new Promise((resolve) => this._activityCallBack = resolve));
      }
    } else {
      this._activityCallBack?.();
      this._activityCallBack = void 0;
    }
  }
  withProgress(options, task) {
    return this.progressService.withProgress(options, async () => {
      const cancelableTask = createCancelablePromise(() => task());
      this.tasksInProgress.push(cancelableTask);
      try {
        return await cancelableTask;
      } finally {
        const index2 = this.tasksInProgress.indexOf(cancelableTask);
        if (index2 !== -1) {
          this.tasksInProgress.splice(index2, 1);
        }
      }
    });
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    const message = err && err.message || "";
    if (/getaddrinfo ENOTFOUND|getaddrinfo ENOENT|connect EACCES|connect ECONNREFUSED/.test(message)) {
      return;
    }
    this.notificationService.error(err);
  }
  handleURL(uri, options) {
    if (!/^extension/.test(uri.path)) {
      return Promise.resolve(false);
    }
    this.onOpenExtensionUrl(uri);
    return Promise.resolve(true);
  }
  onOpenExtensionUrl(uri) {
    const match = /^extension\/([^/]+)$/.exec(uri.path);
    if (!match) {
      return;
    }
    const extensionId = match[1];
    this.queryLocal().then(async (local) => {
      let extension = local.find((local2) => areSameExtensions(local2.identifier, { id: extensionId }));
      if (!extension) {
        [extension] = await this.getExtensions([{ id: extensionId }], { source: "uri" }, CancellationToken.None);
      }
      if (extension) {
        await this.hostService.focus(mainWindow);
        await this.open(extension);
      }
    }).then(void 0, (error) => this.onError(error));
  }
  getPublishersToAutoUpdate() {
    return this.getEnabledAutoUpdateExtensions().filter((id) => !EXTENSION_IDENTIFIER_REGEX.test(id));
  }
  getEnabledAutoUpdateExtensions() {
    try {
      const parsedValue = JSON.parse(this.enabledAuotUpdateExtensionsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions) {
    this.enabledAuotUpdateExtensionsValue = JSON.stringify(enabledAutoUpdateExtensions);
  }
  get enabledAuotUpdateExtensionsValue() {
    if (!this._enabledAutoUpdateExtensionsValue) {
      this._enabledAutoUpdateExtensionsValue = this.getEnabledAutoUpdateExtensionsValue();
    }
    return this._enabledAutoUpdateExtensionsValue;
  }
  set enabledAuotUpdateExtensionsValue(enabledAuotUpdateExtensionsValue) {
    if (this.enabledAuotUpdateExtensionsValue !== enabledAuotUpdateExtensionsValue) {
      this._enabledAutoUpdateExtensionsValue = enabledAuotUpdateExtensionsValue;
      this.setEnabledAutoUpdateExtensionsValue(enabledAuotUpdateExtensionsValue);
    }
  }
  getEnabledAutoUpdateExtensionsValue() {
    return this.storageService.get(EXTENSIONS_AUTO_UPDATE_KEY, StorageScope.APPLICATION, "[]");
  }
  setEnabledAutoUpdateExtensionsValue(value) {
    this.storageService.store(EXTENSIONS_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  getDisabledAutoUpdateExtensions() {
    try {
      const parsedValue = JSON.parse(this.disabledAutoUpdateExtensionsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions) {
    this.disabledAutoUpdateExtensionsValue = JSON.stringify(disabledAutoUpdateExtensions);
  }
  get disabledAutoUpdateExtensionsValue() {
    if (!this._disabledAutoUpdateExtensionsValue) {
      this._disabledAutoUpdateExtensionsValue = this.getDisabledAutoUpdateExtensionsValue();
    }
    return this._disabledAutoUpdateExtensionsValue;
  }
  set disabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue) {
    if (this.disabledAutoUpdateExtensionsValue !== disabledAutoUpdateExtensionsValue) {
      this._disabledAutoUpdateExtensionsValue = disabledAutoUpdateExtensionsValue;
      this.setDisabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue);
    }
  }
  getDisabledAutoUpdateExtensionsValue() {
    return this.storageService.get(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, StorageScope.APPLICATION, "[]");
  }
  setDisabledAutoUpdateExtensionsValue(value) {
    this.storageService.store(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  getDismissedNotifications() {
    try {
      const parsedValue = JSON.parse(this.dismissedNotificationsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setDismissedNotifications(dismissedNotifications) {
    this.dismissedNotificationsValue = JSON.stringify(dismissedNotifications);
  }
  get dismissedNotificationsValue() {
    if (!this._dismissedNotificationsValue) {
      this._dismissedNotificationsValue = this.getDismissedNotificationsValue();
    }
    return this._dismissedNotificationsValue;
  }
  set dismissedNotificationsValue(dismissedNotificationsValue) {
    if (this.dismissedNotificationsValue !== dismissedNotificationsValue) {
      this._dismissedNotificationsValue = dismissedNotificationsValue;
      this.setDismissedNotificationsValue(dismissedNotificationsValue);
    }
  }
  getDismissedNotificationsValue() {
    return this.storageService.get(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, StorageScope.PROFILE, "[]");
  }
  setDismissedNotificationsValue(value) {
    this.storageService.store(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
  }
};
ExtensionsWorkbenchService.UpdatesCheckInterval = 1e3 * 60 * 60 * 12;
ExtensionsWorkbenchService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IWorkbenchExtensionManagementService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionGalleryManifestService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IURLService),
  __decorateParam(9, IWorkbenchExtensionEnablementService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IProgressService),
  __decorateParam(12, IExtensionManagementServerService),
  __decorateParam(13, ILanguageService),
  __decorateParam(14, IIgnoredExtensionsManagementService),
  __decorateParam(15, IUserDataAutoSyncService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IContextKeyService),
  __decorateParam(18, IExtensionManifestPropertiesService),
  __decorateParam(19, ILogService),
  __decorateParam(20, IExtensionService),
  __decorateParam(21, ILocaleService),
  __decorateParam(22, ILifecycleService),
  __decorateParam(23, IFileService),
  __decorateParam(24, IUserDataProfileService),
  __decorateParam(25, IUserDataProfilesService),
  __decorateParam(26, IStorageService),
  __decorateParam(27, IDialogService),
  __decorateParam(28, IUserDataSyncEnablementService),
  __decorateParam(29, IUpdateService),
  __decorateParam(30, IUriIdentityService),
  __decorateParam(31, IWorkspaceContextService),
  __decorateParam(32, IViewsService),
  __decorateParam(33, IFileDialogService),
  __decorateParam(34, IQuickInputService),
  __decorateParam(35, IAllowedExtensionsService),
  __decorateParam(36, IMeteredConnectionService)
], ExtensionsWorkbenchService);
export {
  Extension,
  ExtensionsWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBzZW12ZXIgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VtdmVyL3NlbXZlci5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGluZGV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBQcm9taXNlcywgVGhyb3R0bGVkRGVsYXllciwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQYWdlciwgc2luZ2xlUGFnZVBhZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHtcblx0SUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24sIElHYWxsZXJ5RXh0ZW5zaW9uLCBJUXVlcnlPcHRpb25zLFxuXHRJbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJbnN0YWxsT3BlcmF0aW9uLCBXRUJfRVhURU5TSU9OX1RBRywgSW5zdGFsbEV4dGVuc2lvblJlc3VsdCxcblx0SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QsIElFeHRlbnNpb25JbmZvLCBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCBJRGVwcmVjYXRpb25JbmZvLCBpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZSwgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYLFxuXHRJbnN0YWxsT3B0aW9ucywgSVByb2R1Y3RWZXJzaW9uLFxuXHRVbmluc3RhbGxFeHRlbnNpb25JbmZvLFxuXHRUYXJnZXRQbGF0Zm9ybVRvU3RyaW5nLFxuXHRJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ0tleSxcblx0RVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVCxcblx0RXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLFxuXHRFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLFxuXHRNYWxpY2lvdXNFeHRlbnNpb25JbmZvLFxuXHRzaG91bGRSZXF1aXJlUmVwb3NpdG9yeVNpZ25hdHVyZUZvcixcblx0SUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBFbmFibGVtZW50U3RhdGUsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSVJlc291cmNlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSwgZ2V0TG9jYWxFeHRlbnNpb25UZWxlbWV0cnlEYXRhLCBhcmVTYW1lRXh0ZW5zaW9ucywgZ3JvdXBCeUV4dGVuc2lvbiwgZ2V0R2FsbGVyeUV4dGVuc2lvbklkLCBmaW5kTWF0Y2hpbmdNYWxpY2lvdXNFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgRXh0ZW5zaW9uU3RhdGUsIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXksIEF1dG9VcGRhdGVEZWxheUNvbmZpZ3VyYXRpb25LZXksIEF1dG9DaGVja1VwZGF0ZXNDb25maWd1cmF0aW9uS2V5LCBIYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0LCBBdXRvVXBkYXRlQ29uZmlndXJhdGlvblZhbHVlLCBJbnN0YWxsRXh0ZW5zaW9uT3B0aW9ucywgRXh0ZW5zaW9uUnVudGltZVN0YXRlLCBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZSwgQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5LCBWSUVXTEVUX0lELCBJRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyLCBJRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIE1PREFMX0dST1VQLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVUkxTZXJ2aWNlLCBJVVJMSGFuZGxlciwgSU9wZW5VUkxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0lucHV0LCBJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zSW5wdXQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NPcHRpb25zLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0LCBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uIGFzIElQbGF0Zm9ybUV4dGVuc2lvbiwgVGFyZ2V0UGxhdGZvcm0sIEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vaWdub3JlZEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIFN5bmNSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCwgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBJRXh0ZW5zaW9uc1N0YXR1cyBhcyBJRXh0ZW5zaW9uUnVudGltZVN0YXR1cywgdG9FeHRlbnNpb24sIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzV2ViLCBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldExvY2FsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xhbmd1YWdlUGFja3MuanMnO1xuaW1wb3J0IHsgSUxvY2FsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2NhbGl6YXRpb24vY29tbW9uL2xvY2FsZS5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElGaWxlRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IGlzRW5naW5lVmFsaWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25WYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBTaG93Q3VycmVudFJlbGVhc2VOb3Rlc0FjdGlvbklkIH0gZnJvbSAnLi4vLi4vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZSwgRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VVcmxDb25maWdLZXksIGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpLCBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcblxuaW50ZXJmYWNlIElFeHRlbnNpb25TdGF0ZVByb3ZpZGVyPFQ+IHtcblx0KGV4dGVuc2lvbjogRXh0ZW5zaW9uKTogVDtcbn1cblxuaW50ZXJmYWNlIEluc3RhbGxlZEV4dGVuc2lvbnNFdmVudCB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkczogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG59XG50eXBlIEV4dGVuc2lvbnNMb2FkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdGNvbW1lbnQ6ICdIZWxwcyB0byB1bmRlcnN0YW5kIHdoaWNoIGV4dGVuc2lvbnMgYXJlIHRoZSBtb3N0IGFjdGl2ZWx5IHVzZWQuJztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBsaXN0IG9mIGV4dGVuc2lvbiBpZHMgdGhhdCBhcmUgaW5zdGFsbGVkLicgfTtcblx0cmVhZG9ubHkgY291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBleHRlbnNpb25zIHRoYXQgYXJlIGluc3RhbGxlZC4nIH07XG59O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uIGltcGxlbWVudHMgSUV4dGVuc2lvbiB7XG5cblx0cHVibGljIGVuYWJsZW1lbnRTdGF0ZTogRW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseTtcblxuXHRwcml2YXRlIGdhbGxlcnlSZXNvdXJjZXNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG5cblx0cHJpdmF0ZSBfbWlzc2luZ0Zyb21HYWxsZXJ5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc3RhdGVQcm92aWRlcjogSUV4dGVuc2lvblN0YXRlUHJvdmlkZXI8RXh0ZW5zaW9uU3RhdGU+LFxuXHRcdHByaXZhdGUgcnVudGltZVN0YXRlUHJvdmlkZXI6IElFeHRlbnNpb25TdGF0ZVByb3ZpZGVyPEV4dGVuc2lvblJ1bnRpbWVTdGF0ZSB8IHVuZGVmaW5lZD4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIGxvY2FsOiBJTG9jYWxFeHRlbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUV4dGVuc2lvbkluZm86IHsgcmVzb3VyY2VFeHRlbnNpb246IElSZXNvdXJjZUV4dGVuc2lvbjsgaXNXb3Jrc3BhY2VTY29wZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGdldCByZXNvdXJjZUV4dGVuc2lvbigpOiBJUmVzb3VyY2VFeHRlbnNpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnJlc291cmNlRXh0ZW5zaW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb3VyY2VFeHRlbnNpb25JbmZvLnJlc291cmNlRXh0ZW5zaW9uO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sb2NhbD8uaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdGlkZW50aWZpZXI6IHRoaXMubG9jYWwuaWRlbnRpZmllcixcblx0XHRcdFx0bG9jYXRpb246IHRoaXMubG9jYWwubG9jYXRpb24sXG5cdFx0XHRcdG1hbmlmZXN0OiB0aGlzLmxvY2FsLm1hbmlmZXN0LFxuXHRcdFx0XHRjaGFuZ2Vsb2dVcmk6IHRoaXMubG9jYWwuY2hhbmdlbG9nVXJsLFxuXHRcdFx0XHRyZWFkbWVVcmk6IHRoaXMubG9jYWwucmVhZG1lVXJsLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBnYWxsZXJ5KCk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2FsbGVyeTtcblx0fVxuXG5cdHNldCBnYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0dGhpcy5nYWxsZXJ5UmVzb3VyY2VzQ2FjaGUuY2xlYXIoKTtcblx0fVxuXG5cdGdldCBtaXNzaW5nRnJvbUdhbGxlcnkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbWlzc2luZ0Zyb21HYWxsZXJ5O1xuXHR9XG5cblx0c2V0IG1pc3NpbmdGcm9tR2FsbGVyeShtaXNzaW5nOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWlzc2luZ0Zyb21HYWxsZXJ5ID0gbWlzc2luZztcblx0fVxuXG5cdGdldCB0eXBlKCk6IEV4dGVuc2lvblR5cGUge1xuXHRcdHJldHVybiB0aGlzLmxvY2FsID8gdGhpcy5sb2NhbC50eXBlIDogRXh0ZW5zaW9uVHlwZS5Vc2VyO1xuXHR9XG5cblx0Z2V0IGlzQnVpbHRpbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbCA/IHRoaXMubG9jYWwuaXNCdWlsdGluIDogZmFsc2U7XG5cdH1cblxuXHRnZXQgaXNXb3Jrc3BhY2VTY29wZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubG9jYWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvY2FsLmlzV29ya3NwYWNlU2NvcGVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbkluZm8pIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc291cmNlRXh0ZW5zaW9uSW5mby5pc1dvcmtzcGFjZVNjb3BlZDtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Lm5hbWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldE1hbmlmZXN0RnJvbUxvY2FsT3JSZXNvdXJjZSgpPy5uYW1lID8/ICcnO1xuXHR9XG5cblx0Z2V0IGRpc3BsYXlOYW1lKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeS5kaXNwbGF5TmFtZSB8fCB0aGlzLmdhbGxlcnkubmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRNYW5pZmVzdEZyb21Mb2NhbE9yUmVzb3VyY2UoKT8uZGlzcGxheU5hbWUgPz8gdGhpcy5uYW1lO1xuXHR9XG5cblx0Z2V0IGlkZW50aWZpZXIoKTogSUV4dGVuc2lvbklkZW50aWZpZXIge1xuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkuaWRlbnRpZmllcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc291cmNlRXh0ZW5zaW9uLmlkZW50aWZpZXI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmxvY2FsPy5pZGVudGlmaWVyID8/IHsgaWQ6ICcnIH07XG5cdH1cblxuXHRnZXQgdXVpZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkuaWRlbnRpZmllci51dWlkIDogdGhpcy5sb2NhbD8uaWRlbnRpZmllci51dWlkO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlcigpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkucHVibGlzaGVyO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRNYW5pZmVzdEZyb21Mb2NhbE9yUmVzb3VyY2UoKT8ucHVibGlzaGVyID8/ICcnO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlckRpc3BsYXlOYW1lKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeS5wdWJsaXNoZXJEaXNwbGF5TmFtZSB8fCB0aGlzLmdhbGxlcnkucHVibGlzaGVyO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxvY2FsPy5wdWJsaXNoZXJEaXNwbGF5TmFtZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubG9jYWwucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHVibGlzaGVyO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlclVybCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnB1Ymxpc2hlckxpbmsgPyBVUkkucGFyc2UodGhpcy5nYWxsZXJ5LnB1Ymxpc2hlckxpbmspIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlckRvbWFpbigpOiB7IGxpbms6IHN0cmluZzsgdmVyaWZpZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucHVibGlzaGVyRG9tYWluO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlclNwb25zb3JMaW5rKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucHVibGlzaGVyU3BvbnNvckxpbmsgPyBVUkkucGFyc2UodGhpcy5nYWxsZXJ5LnB1Ymxpc2hlclNwb25zb3JMaW5rKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCB2ZXJzaW9uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWwgPyB0aGlzLmxvY2FsLm1hbmlmZXN0LnZlcnNpb24gOiB0aGlzLmxhdGVzdFZlcnNpb247XG5cdH1cblxuXHRnZXQgcHJpdmF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5LnByaXZhdGUgOiB0aGlzLmxvY2FsID8gdGhpcy5sb2NhbC5wcml2YXRlIDogZmFsc2U7XG5cdH1cblxuXHRnZXQgcGlubmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMubG9jYWw/LnBpbm5lZDtcblx0fVxuXG5cdGdldCBsYXRlc3RWZXJzaW9uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSA/IHRoaXMuZ2FsbGVyeS52ZXJzaW9uIDogdGhpcy5nZXRNYW5pZmVzdEZyb21Mb2NhbE9yUmVzb3VyY2UoKT8udmVyc2lvbiA/PyAnJztcblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkuZGVzY3JpcHRpb24gOiB0aGlzLmdldE1hbmlmZXN0RnJvbUxvY2FsT3JSZXNvdXJjZSgpPy5kZXNjcmlwdGlvbiA/PyAnJztcblx0fVxuXG5cdGdldCB1cmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5kZXRhaWxzTGluaztcblx0fVxuXG5cdGdldCBpY29uVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeUljb25VcmwgfHwgdGhpcy5yZXNvdXJjZUV4dGVuc2lvbkljb25VcmwgfHwgdGhpcy5sb2NhbEljb25VcmwgfHwgdGhpcy5kZWZhdWx0SWNvblVybDtcblx0fVxuXG5cdGdldCBpY29uVXJsRmFsbGJhY2soKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5hc3NldHMuaWNvbj8uZmFsbGJhY2tVcmk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBsb2NhbEljb25VcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5sb2NhbCAmJiB0aGlzLmxvY2FsLm1hbmlmZXN0Lmljb24pIHtcblx0XHRcdHJldHVybiBGaWxlQWNjZXNzLnVyaVRvQnJvd3NlclVyaShyZXNvdXJjZXMuam9pblBhdGgodGhpcy5sb2NhbC5sb2NhdGlvbiwgdGhpcy5sb2NhbC5tYW5pZmVzdC5pY29uKSkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCByZXNvdXJjZUV4dGVuc2lvbkljb25VcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbj8ubWFuaWZlc3QuaWNvbikge1xuXHRcdFx0cmV0dXJuIEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKHJlc291cmNlcy5qb2luUGF0aCh0aGlzLnJlc291cmNlRXh0ZW5zaW9uLmxvY2F0aW9uLCB0aGlzLnJlc291cmNlRXh0ZW5zaW9uLm1hbmlmZXN0Lmljb24pKS50b1N0cmluZyh0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGdhbGxlcnlJY29uVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uYXNzZXRzLmljb24/LnVyaTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGRlZmF1bHRJY29uVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gJiYgdGhpcy5sb2NhbCkge1xuXHRcdFx0aWYgKHRoaXMubG9jYWwubWFuaWZlc3QgJiYgdGhpcy5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcykge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh0aGlzLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLnRoZW1lcykgJiYgdGhpcy5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcy50aGVtZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvbWVkaWEvdGhlbWUtaWNvbi5wbmcnKS50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh0aGlzLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLmdyYW1tYXJzKSAmJiB0aGlzLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLmdyYW1tYXJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL21lZGlhL2xhbmd1YWdlLWljb24uc3ZnJykudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCByZXBvc2l0b3J5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSAmJiB0aGlzLmdhbGxlcnkuYXNzZXRzLnJlcG9zaXRvcnkgPyB0aGlzLmdhbGxlcnkuYXNzZXRzLnJlcG9zaXRvcnkudXJpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGxpY2Vuc2VVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ICYmIHRoaXMuZ2FsbGVyeS5hc3NldHMubGljZW5zZSA/IHRoaXMuZ2FsbGVyeS5hc3NldHMubGljZW5zZS51cmkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgc3VwcG9ydFVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgJiYgdGhpcy5nYWxsZXJ5LnN1cHBvcnRMaW5rID8gdGhpcy5nYWxsZXJ5LnN1cHBvcnRMaW5rIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHN0YXRlKCk6IEV4dGVuc2lvblN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZVByb3ZpZGVyKHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYWxpY2lvdXM6IE1hbGljaW91c0V4dGVuc2lvbkluZm8gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgaXNNYWxpY2lvdXMoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuICEhdGhpcy5tYWxpY2lvdXMgfHwgdGhpcy5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5TWFsaWNpb3VzO1xuXHR9XG5cblx0cHVibGljIGdldCBtYWxpY2lvdXNJbmZvTGluaygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1hbGljaW91cz8ubGVhcm5Nb3JlTGluaztcblx0fVxuXG5cdHB1YmxpYyBkZXByZWNhdGlvbkluZm86IElEZXByZWNhdGlvbkluZm8gfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGluc3RhbGxDb3VudCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkuaW5zdGFsbENvdW50IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHJhdGluZygpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkucmF0aW5nIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHJhdGluZ0NvdW50KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSA/IHRoaXMuZ2FsbGVyeS5yYXRpbmdDb3VudCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCByYXRpbmdVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5yYXRpbmdMaW5rO1xuXHR9XG5cblx0Z2V0IG91dGRhdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuZ2FsbGVyeSB8fCAhdGhpcy5sb2NhbCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHQvLyBEbyBub3QgYWxsb3cgdXBkYXRpbmcgc3lzdGVtIGV4dGVuc2lvbnMgaW4gc3RhYmxlXG5cdFx0XHRpZiAodGhpcy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnICYmICF0aGlzLnByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcz8uc29tZShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLmxvY2FsLnByZVJlbGVhc2UgJiYgdGhpcy5nYWxsZXJ5LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VtdmVyLmd0KHRoaXMubGF0ZXN0VmVyc2lvbiwgdGhpcy52ZXJzaW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm91dGRhdGVkVGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8qIElnbm9yZSAqL1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXQgb3V0ZGF0ZWRUYXJnZXRQbGF0Zm9ybSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmxvY2FsICYmICEhdGhpcy5nYWxsZXJ5XG5cdFx0XHQmJiAhW1RhcmdldFBsYXRmb3JtLlVOREVGSU5FRCwgVGFyZ2V0UGxhdGZvcm0uV0VCXS5pbmNsdWRlcyh0aGlzLmxvY2FsLnRhcmdldFBsYXRmb3JtKVxuXHRcdFx0JiYgdGhpcy5nYWxsZXJ5LnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm0gIT09IFRhcmdldFBsYXRmb3JtLldFQlxuXHRcdFx0JiYgdGhpcy5sb2NhbC50YXJnZXRQbGF0Zm9ybSAhPT0gdGhpcy5nYWxsZXJ5LnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm1cblx0XHRcdCYmIHNlbXZlci5lcSh0aGlzLmxhdGVzdFZlcnNpb24sIHRoaXMudmVyc2lvbik7XG5cdH1cblxuXHRnZXQgcnVudGltZVN0YXRlKCk6IEV4dGVuc2lvblJ1bnRpbWVTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucnVudGltZVN0YXRlUHJvdmlkZXIodGhpcyk7XG5cdH1cblxuXHRnZXQgdGVsZW1ldHJ5RGF0YSgpOiBhbnkge1xuXHRcdGNvbnN0IHsgbG9jYWwsIGdhbGxlcnkgfSA9IHRoaXM7XG5cblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIGdldEdhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhKGdhbGxlcnkpO1xuXHRcdH0gZWxzZSBpZiAobG9jYWwpIHtcblx0XHRcdHJldHVybiBnZXRMb2NhbEV4dGVuc2lvblRlbGVtZXRyeURhdGEobG9jYWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHByZXZpZXcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWw/Lm1hbmlmZXN0LnByZXZpZXcgPz8gdGhpcy5nYWxsZXJ5Py5wcmV2aWV3ID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHByZVJlbGVhc2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5sb2NhbD8ucHJlUmVsZWFzZTtcblx0fVxuXG5cdGdldCBpc1ByZVJlbGVhc2VWZXJzaW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2NhbC5pc1ByZVJlbGVhc2VWZXJzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gISF0aGlzLmdhbGxlcnk/LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0fVxuXG5cdGdldCBoYXNQcmVSZWxlYXNlVmVyc2lvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5Lmhhc1ByZVJlbGVhc2VWZXJzaW9uIDogISF0aGlzLmxvY2FsPy5oYXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0fVxuXG5cdGdldCBoYXNSZWxlYXNlVmVyc2lvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLnJlc291cmNlRXh0ZW5zaW9uIHx8ICEhdGhpcy5nYWxsZXJ5Py5oYXNSZWxlYXNlVmVyc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TG9jYWwoKTogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbCAmJiAhdGhpcy5vdXRkYXRlZCA/IHRoaXMubG9jYWwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5pZmVzdCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGw+IHtcblx0XHRjb25zdCBsb2NhbCA9IHRoaXMuZ2V0TG9jYWwoKTtcblx0XHRpZiAobG9jYWwpIHtcblx0XHRcdHJldHVybiBsb2NhbC5tYW5pZmVzdDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRHYWxsZXJ5TWFuaWZlc3QodG9rZW4pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZUV4dGVuc2lvbi5tYW5pZmVzdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGdldEdhbGxlcnlNYW5pZmVzdCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0bGV0IGNhY2hlID0gdGhpcy5nYWxsZXJ5UmVzb3VyY2VzQ2FjaGUuZ2V0KCdtYW5pZmVzdCcpO1xuXHRcdFx0aWYgKCFjYWNoZSkge1xuXHRcdFx0XHRpZiAodGhpcy5nYWxsZXJ5LmFzc2V0cy5tYW5pZmVzdCkge1xuXHRcdFx0XHRcdHRoaXMuZ2FsbGVyeVJlc291cmNlc0NhY2hlLnNldCgnbWFuaWZlc3QnLCBjYWNoZSA9IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QodGhpcy5nYWxsZXJ5LCB0b2tlbilcblx0XHRcdFx0XHRcdC5jYXRjaChlID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5nYWxsZXJ5UmVzb3VyY2VzQ2FjaGUuZGVsZXRlKCdtYW5pZmVzdCcpO1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ01hbmlmZXN0IGlzIG5vdCBmb3VuZCcsIFwiTWFuaWZlc3QgaXMgbm90IGZvdW5kXCIpLCB0aGlzLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2FjaGU7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aGFzUmVhZG1lKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmxvY2FsICYmIHRoaXMubG9jYWwucmVhZG1lVXJsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5ICYmIHRoaXMuZ2FsbGVyeS5hc3NldHMucmVhZG1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbj8ucmVhZG1lVXJpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbTtcblx0fVxuXG5cdGFzeW5jIGdldFJlYWRtZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5nZXRMb2NhbCgpO1xuXHRcdGlmIChsb2NhbD8ucmVhZG1lVXJsKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShsb2NhbC5yZWFkbWVVcmwpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5KSB7XG5cdFx0XHRpZiAodGhpcy5nYWxsZXJ5LmFzc2V0cy5yZWFkbWUpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0UmVhZG1lKHRoaXMuZ2FsbGVyeSwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnZXh0ZW5zaW9uczpOb3RGb3VuZFJlYWRNZScsIHRoaXMudGVsZW1ldHJ5RGF0YSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoYCMgJHt0aGlzLmRpc3BsYXlOYW1lIHx8IHRoaXMubmFtZX1cbioqTm90aWNlOioqIFRoaXMgZXh0ZW5zaW9uIGlzIGJ1bmRsZWQgd2l0aCBWaXN1YWwgU3R1ZGlvIENvZGUuIEl0IGNhbiBiZSBkaXNhYmxlZCBidXQgbm90IHVuaW5zdGFsbGVkLlxuIyMgRmVhdHVyZXNcbiR7dGhpcy5kZXNjcmlwdGlvbn1cbmApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlc291cmNlRXh0ZW5zaW9uPy5yZWFkbWVVcmkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMucmVzb3VyY2VFeHRlbnNpb24/LnJlYWRtZVVyaSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCBhdmFpbGFibGUnKSk7XG5cdH1cblxuXHRoYXNDaGFuZ2Vsb2coKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubG9jYWwgJiYgdGhpcy5sb2NhbC5jaGFuZ2Vsb2dVcmwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdhbGxlcnkgJiYgdGhpcy5nYWxsZXJ5LmFzc2V0cy5jaGFuZ2Vsb2cpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhbmdlbG9nKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmdldExvY2FsKCk7XG5cdFx0aWYgKGxvY2FsPy5jaGFuZ2Vsb2dVcmwpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvY2FsLmNoYW5nZWxvZ1VybCk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdhbGxlcnk/LmFzc2V0cy5jaGFuZ2Vsb2cpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldENoYW5nZWxvZyh0aGlzLmdhbGxlcnksIHRva2VuKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShgUGxlYXNlIGNoZWNrIHRoZSBbVlMgQ29kZSBSZWxlYXNlIE5vdGVzXShjb21tYW5kOiR7U2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZH0pIGZvciBjaGFuZ2VzIHRvIHRoZSBidWlsdC1pbiBleHRlbnNpb25zLmApO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCBhdmFpbGFibGUnKSk7XG5cdH1cblxuXHRnZXQgY2F0ZWdvcmllcygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgZ2FsbGVyeSwgcmVzb3VyY2VFeHRlbnNpb24gfSA9IHRoaXM7XG5cdFx0aWYgKGxvY2FsICYmIGxvY2FsLm1hbmlmZXN0LmNhdGVnb3JpZXMgJiYgIXRoaXMub3V0ZGF0ZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbC5tYW5pZmVzdC5jYXRlZ29yaWVzO1xuXHRcdH1cblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIGdhbGxlcnkuY2F0ZWdvcmllcztcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VFeHRlbnNpb24ubWFuaWZlc3QuY2F0ZWdvcmllcyA/PyBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Z2V0IHRhZ3MoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGNvbnN0IHsgZ2FsbGVyeSB9ID0gdGhpcztcblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIGdhbGxlcnkudGFncy5maWx0ZXIodGFnID0+ICF0YWcuc3RhcnRzV2l0aCgnXycpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Z2V0IGRlcGVuZGVuY2llcygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgZ2FsbGVyeSwgcmVzb3VyY2VFeHRlbnNpb24gfSA9IHRoaXM7XG5cdFx0aWYgKGxvY2FsICYmIGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcyAmJiAhdGhpcy5vdXRkYXRlZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcztcblx0XHR9XG5cdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdHJldHVybiBnYWxsZXJ5LnByb3BlcnRpZXMuZGVwZW5kZW5jaWVzIHx8IFtdO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiByZXNvdXJjZUV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMgfHwgW107XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldCBleHRlbnNpb25QYWNrKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB7IGxvY2FsLCBnYWxsZXJ5LCByZXNvdXJjZUV4dGVuc2lvbiB9ID0gdGhpcztcblx0XHRpZiAobG9jYWwgJiYgbG9jYWwubWFuaWZlc3QuZXh0ZW5zaW9uUGFjayAmJiAhdGhpcy5vdXRkYXRlZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvblBhY2s7XG5cdFx0fVxuXHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gZ2FsbGVyeS5wcm9wZXJ0aWVzLmV4dGVuc2lvblBhY2sgfHwgW107XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlRXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2sgfHwgW107XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHNldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdDogSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QpOiB2b2lkIHtcblx0XHR0aGlzLm1hbGljaW91cyA9IGZpbmRNYXRjaGluZ01hbGljaW91c0VudHJ5KHRoaXMuaWRlbnRpZmllciwgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5tYWxpY2lvdXMpO1xuXHRcdHRoaXMuZGVwcmVjYXRpb25JbmZvID0gZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5kZXByZWNhdGVkID8gZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5kZXByZWNhdGVkW3RoaXMuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFuaWZlc3RGcm9tTG9jYWxPclJlc291cmNlKCk6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwge1xuXHRcdGlmICh0aGlzLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2NhbC5tYW5pZmVzdDtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc291cmNlRXh0ZW5zaW9uLm1hbmlmZXN0O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5jb25zdCBFWFRFTlNJT05TX0FVVE9fVVBEQVRFX0tFWSA9ICdleHRlbnNpb25zLmF1dG9VcGRhdGUnO1xuY29uc3QgRVhURU5TSU9OU19ET05PVF9BVVRPX1VQREFURV9LRVkgPSAnZXh0ZW5zaW9ucy5kb25vdEF1dG9VcGRhdGUnO1xuY29uc3QgRVhURU5TSU9OU19ESVNNSVNTRURfTk9USUZJQ0FUSU9OU19LRVkgPSAnZXh0ZW5zaW9ucy5kaXNtaXNzZWROb3RpZmljYXRpb25zJztcblxuY2xhc3MgRXh0ZW5zaW9ucyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBleHRlbnNpb246IEV4dGVuc2lvbjsgb3BlcmF0aW9uPzogSW5zdGFsbE9wZXJhdGlvbiB9IHwgdW5kZWZpbmVkPigpKTtcblx0Z2V0IG9uQ2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlc2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvblJlc2V0KCkgeyByZXR1cm4gdGhpcy5fb25SZXNldC5ldmVudDsgfVxuXG5cdHByaXZhdGUgaW5zdGFsbGluZzogRXh0ZW5zaW9uW10gPSBbXTtcblx0cHJpdmF0ZSB1bmluc3RhbGxpbmc6IEV4dGVuc2lvbltdID0gW107XG5cdHByaXZhdGUgaW5zdGFsbGVkOiBFeHRlbnNpb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZVByb3ZpZGVyOiBJRXh0ZW5zaW9uU3RhdGVQcm92aWRlcjxFeHRlbnNpb25TdGF0ZT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBydW50aW1lU3RhdGVQcm92aWRlcjogSUV4dGVuc2lvblN0YXRlUHJvdmlkZXI8RXh0ZW5zaW9uUnVudGltZVN0YXRlIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzV29ya3NwYWNlU2VydmVyOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbEV4dGVuc2lvbihlID0+IHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoZSA9PiB0aGlzLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Vbmluc3RhbGxFeHRlbnNpb24oZSA9PiB0aGlzLm9uVW5pbnN0YWxsRXh0ZW5zaW9uKGUuaWRlbnRpZmllcikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24oZSA9PiB0aGlzLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEoZSA9PiB0aGlzLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEoZS5sb2NhbCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlKCgpID0+IHRoaXMucmVzZXQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLm9uRW5hYmxlbWVudENoYW5nZWQoZSA9PiB0aGlzLm9uRW5hYmxlbWVudENoYW5nZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkodGhpcy5vbkNoYW5nZSwgdGhpcy5vblJlc2V0KSgoKSA9PiB0aGlzLl9sb2NhbCA9IHVuZGVmaW5lZCkpO1xuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlU2VydmVyKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbEV4dGVuc2lvbihlID0+IHtcblx0XHRcdFx0aWYgKGUud29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkluc3RhbGxFeHRlbnNpb24oZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucyhlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZS5maWx0ZXIoZSA9PiBlLndvcmtzcGFjZVNjb3BlZCk7XG5cdFx0XHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zKHJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Vbmluc3RhbGxFeHRlbnNpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLndvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0XHRcdHRoaXMub25Vbmluc3RhbGxFeHRlbnNpb24oZS5pZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbihlID0+IHtcblx0XHRcdFx0aWYgKGUud29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbihlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvY2FsOiBFeHRlbnNpb25bXSB8IHVuZGVmaW5lZDtcblx0Z2V0IGxvY2FsKCk6IEV4dGVuc2lvbltdIHtcblx0XHRpZiAoIXRoaXMuX2xvY2FsKSB7XG5cdFx0XHR0aGlzLl9sb2NhbCA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5pbnN0YWxsZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9jYWwucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5pbnN0YWxsaW5nKSB7XG5cdFx0XHRcdGlmICghdGhpcy5pbnN0YWxsZWQuc29tZShpbnN0YWxsZWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2NhbC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xvY2FsO1xuXHR9XG5cblx0YXN5bmMgcXVlcnlJbnN0YWxsZWQocHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0YXdhaXQgdGhpcy5mZXRjaEluc3RhbGxlZEV4dGVuc2lvbnMocHJvZHVjdFZlcnNpb24pO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbDtcblx0fVxuXG5cdGFzeW5jIHN5bmNJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10sIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24sIGZsYWdFeHRlbnNpb25zTWlzc2luZ0Zyb21HYWxsZXJ5PzogSUV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLm1hcEluc3RhbGxlZEV4dGVuc2lvbldpdGhDb21wYXRpYmxlR2FsbGVyeUV4dGVuc2lvbihnYWxsZXJ5RXh0ZW5zaW9ucywgcHJvZHVjdFZlcnNpb24pO1xuXHRcdGZvciAoY29uc3QgW2V4dGVuc2lvbiwgZ2FsbGVyeV0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Ly8gdXBkYXRlIG1ldGFkYXRhIG9mIHRoZSBleHRlbnNpb24gaWYgaXQgZG9lcyBub3QgZXhpc3Rcblx0XHRcdGlmIChleHRlbnNpb24ubG9jYWwgJiYgZXh0ZW5zaW9uLmxvY2FsLnR5cGUgIT09IEV4dGVuc2lvblR5cGUuU3lzdGVtICYmICFleHRlbnNpb24ubG9jYWwuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5sb2NhbCA9IGF3YWl0IHRoaXMudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLmxvY2FsLCBnYWxsZXJ5KTtcblx0XHRcdH1cblx0XHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkgfHwgZXh0ZW5zaW9uLmdhbGxlcnkudmVyc2lvbiAhPT0gZ2FsbGVyeS52ZXJzaW9uIHx8IGV4dGVuc2lvbi5nYWxsZXJ5LnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm0gIT09IGdhbGxlcnkucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSkge1xuXHRcdFx0XHRleHRlbnNpb24uZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIERldGVjdCBleHRlbnNpb25zIHRoYXQgZG8gbm90IGhhdmUgYSBjb3JyZXNwb25kaW5nIGdhbGxlcnkgZW50cnkuXG5cdFx0aWYgKGZsYWdFeHRlbnNpb25zTWlzc2luZ0Zyb21HYWxsZXJ5KSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zVG9RdWVyeSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5sb2NhbCkge1xuXHRcdFx0XHQvLyBFeHRlbnNpb24gaXMgYWxyZWFkeSBwYWlyZWQgd2l0aCBhIGdhbGxlcnkgb2JqZWN0XG5cdFx0XHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFscmVhZHkgZmxhZ2dlZCBhcyBtaXNzaW5nIGZyb20gZ2FsbGVyeVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLm1pc3NpbmdGcm9tR2FsbGVyeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEEgVVVJRCBpbmRpY2F0ZXMgZXh0ZW5zaW9uIG9yaWdpbmF0ZWQgZnJvbSBnYWxsZXJ5XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEV4dGVuc2lvbiBpcyBub3QgcHJlc2VudCBpbiB0aGUgc2V0IHdlIGFyZSBjb25jZXJuZWQgYWJvdXRcblx0XHRcdFx0aWYgKCFmbGFnRXh0ZW5zaW9uc01pc3NpbmdGcm9tR2FsbGVyeS5zb21lKGYgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dGVuc2lvbnNUb1F1ZXJ5LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25zVG9RdWVyeS5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgcXVlcnlSZXN1bHQgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvUXVlcnkubWFwKGUgPT4gKHsgLi4uZS5pZGVudGlmaWVyLCB2ZXJzaW9uOiBlLnZlcnNpb24gfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3QgcXVlcmllZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgbWlzc2luZ0lkczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9uc1RvUXVlcnkpIHtcblx0XHRcdFx0XHRxdWVyaWVkSWRzLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdGNvbnN0IGdhbGxlcnkgPSBxdWVyeVJlc3VsdC5maW5kKGcgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZy5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5taXNzaW5nRnJvbUdhbGxlcnkgPSB0cnVlO1xuXHRcdFx0XHRcdFx0bWlzc2luZ0lkcy5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh7IGV4dGVuc2lvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0eXBlIE1pc3NpbmdGcm9tR2FsbGVyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB3aGVuIGluc3RhbGxlZCBleHRlbnNpb25zIGFyZSBubyBsb25nZXIgYXZhaWxhYmxlIGluIHRoZSBnYWxsZXJ5Jztcblx0XHRcdFx0XHRxdWVyaWVkSWRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXh0ZW5zaW9ucyBxdWVyaWVkIGFzIHBvdGVudGlhbGx5IG1pc3NpbmcgZnJvbSBnYWxsZXJ5JyB9O1xuXHRcdFx0XHRcdG1pc3NpbmdJZHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb25zIGRldGVybWluZWQgbWlzc2luZyBmcm9tIGdhbGxlcnknIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgTWlzc2luZ0Zyb21HYWxsZXJ5RXZlbnQgPSB7XG5cdFx0XHRcdFx0cmVhZG9ubHkgcXVlcmllZElkczogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdFx0cmVhZG9ubHkgbWlzc2luZ0lkczogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE1pc3NpbmdGcm9tR2FsbGVyeUV2ZW50LCBNaXNzaW5nRnJvbUdhbGxlcnlDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnM6bWlzc2luZ0Zyb21HYWxsZXJ5Jywge1xuXHRcdFx0XHRcdHF1ZXJpZWRJZHM6IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUocXVlcmllZElkcy5qb2luKCc7JykpLFxuXHRcdFx0XHRcdG1pc3NpbmdJZHM6IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUobWlzc2luZ0lkcy5qb2luKCc7JykpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWFwSW5zdGFsbGVkRXh0ZW5zaW9uV2l0aENvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9uKGdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxbRXh0ZW5zaW9uLCBJR2FsbGVyeUV4dGVuc2lvbl1bXT4ge1xuXHRcdGNvbnN0IG1hcHBlZEV4dGVuc2lvbnMgPSB0aGlzLm1hcEluc3RhbGxlZEV4dGVuc2lvbldpdGhHYWxsZXJ5RXh0ZW5zaW9uKGdhbGxlcnlFeHRlbnNpb25zKTtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0Y29uc3QgY29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgY29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zVG9GZXRjaDogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChtYXBwZWRFeHRlbnNpb25zLm1hcChhc3luYyAoW2V4dGVuc2lvbiwgZ2FsbGVyeV0pID0+IHtcblx0XHRcdGlmIChleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFeHRlbnNpb25Db21wYXRpYmxlKGdhbGxlcnksIGV4dGVuc2lvbi5sb2NhbC5wcmVSZWxlYXNlLCB0YXJnZXRQbGF0Zm9ybSwgcHJvZHVjdFZlcnNpb24pKSB7XG5cdFx0XHRcdFx0Y29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zLnB1c2goZ2FsbGVyeSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zVG9GZXRjaC5wdXNoKHsgLi4uZXh0ZW5zaW9uLmxvY2FsLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6IGV4dGVuc2lvbi5sb2NhbC5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChjb21wYXRpYmxlR2FsbGVyeUV4dGVuc2lvbnNUb0ZldGNoLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9uc1RvRmV0Y2gsIHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGU6IHRydWUsIHF1ZXJ5QWxsVmVyc2lvbnM6IHRydWUsIHByb2R1Y3RWZXJzaW9uIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zLnB1c2goLi4ucmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWFwSW5zdGFsbGVkRXh0ZW5zaW9uV2l0aEdhbGxlcnlFeHRlbnNpb24oY29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgbWFwSW5zdGFsbGVkRXh0ZW5zaW9uV2l0aEdhbGxlcnlFeHRlbnNpb24oZ2FsbGVyeUV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10pOiBbRXh0ZW5zaW9uLCBJR2FsbGVyeUV4dGVuc2lvbl1bXSB7XG5cdFx0Y29uc3QgbWFwcGVkRXh0ZW5zaW9uczogW0V4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb25dW10gPSBbXTtcblx0XHRjb25zdCBieVVVSUQgPSBuZXcgTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+KCksIGJ5SUQgPSBuZXcgTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBnYWxsZXJ5IG9mIGdhbGxlcnlFeHRlbnNpb25zKSB7XG5cdFx0XHRieVVVSUQuc2V0KGdhbGxlcnkuaWRlbnRpZmllci51dWlkLCBnYWxsZXJ5KTtcblx0XHRcdGJ5SUQuc2V0KGdhbGxlcnkuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBnYWxsZXJ5KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpbnN0YWxsZWQgb2YgdGhpcy5pbnN0YWxsZWQpIHtcblx0XHRcdGlmIChpbnN0YWxsZWQudXVpZCkge1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5ID0gYnlVVUlELmdldChpbnN0YWxsZWQudXVpZCk7XG5cdFx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0bWFwcGVkRXh0ZW5zaW9ucy5wdXNoKFtpbnN0YWxsZWQsIGdhbGxlcnldKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGluc3RhbGxlZC5sb2NhbD8uc291cmNlICE9PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRcdGNvbnN0IGdhbGxlcnkgPSBieUlELmdldChpbnN0YWxsZWQuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdFx0XHRtYXBwZWRFeHRlbnNpb25zLnB1c2goW2luc3RhbGxlZCwgZ2FsbGVyeV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXBwZWRFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVNZXRhZGF0YShsb2NhbEV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0bGV0IGlzUHJlUmVsZWFzZVZlcnNpb24gPSBmYWxzZTtcblx0XHRpZiAobG9jYWxFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiAhPT0gZ2FsbGVyeS52ZXJzaW9uKSB7XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlTWF0Y2hJbnN0YWxsZWRFeHRlbnNpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBhIHJlcXVlc3QgaXMgbWFkZSB0byB1cGRhdGUgbWV0YWRhdGEgb2YgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbic7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIEdhbGxlcnlTZXJ2aWNlTWF0Y2hJbnN0YWxsZWRFeHRlbnNpb25DbGFzc2lmaWNhdGlvbj4oJ2dhbGxlcnlTZXJ2aWNlOnVwZGF0ZU1ldGFkYXRhJyk7XG5cdFx0XHRjb25zdCBnYWxsZXJ5V2l0aExvY2FsVmVyc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCB1bmRlZmluZWQgPSAoYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IC4uLmxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIsIHZlcnNpb246IGxvY2FsRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb24gPSAhIWdhbGxlcnlXaXRoTG9jYWxWZXJzaW9uPy5wcm9wZXJ0aWVzPy5pc1ByZVJlbGVhc2VWZXJzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51cGRhdGVNZXRhZGF0YShsb2NhbEV4dGVuc2lvbiwgeyBpZDogZ2FsbGVyeS5pZGVudGlmaWVyLnV1aWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBnYWxsZXJ5LnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBwdWJsaXNoZXJJZDogZ2FsbGVyeS5wdWJsaXNoZXJJZCwgaXNQcmVSZWxlYXNlVmVyc2lvbiB9KTtcblx0fVxuXG5cdGNhbkluc3RhbGwoZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChnYWxsZXJ5RXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgb25JbnN0YWxsRXh0ZW5zaW9uKGV2ZW50OiBJbnN0YWxsRXh0ZW5zaW9uRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB7IHNvdXJjZSB9ID0gZXZlbnQ7XG5cdFx0aWYgKHNvdXJjZSAmJiAhVVJJLmlzVXJpKHNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHNvdXJjZS5pZGVudGlmaWVyKSlcblx0XHRcdFx0Pz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb24sIHRoaXMuc3RhdGVQcm92aWRlciwgdGhpcy5ydW50aW1lU3RhdGVQcm92aWRlciwgdGhpcy5zZXJ2ZXIsIHVuZGVmaW5lZCwgc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5pbnN0YWxsaW5nLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmZXRjaEluc3RhbGxlZEV4dGVuc2lvbnMocHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0ID0gYXdhaXQgdGhpcy5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IGFsbCA9IGF3YWl0IHRoaXMuc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHJvZHVjdFZlcnNpb24pO1xuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlU2VydmVyKSB7XG5cdFx0XHRhbGwucHVzaCguLi5hd2FpdCB0aGlzLndvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnModHJ1ZSkpO1xuXHRcdH1cblxuXHRcdC8vIGRlZHVwIHdvcmtzcGFjZSwgdXNlciBhbmQgc3lzdGVtIGV4dGVuc2lvbnMgYnkgZ2l2aW5nIHByaW9yaXR5IHRvIHdvcmtzcGFjZSBmaXJzdCBhbmQgdGhlbiB0byB1c2VyIGV4dGVuc2lvbi5cblx0XHRjb25zdCBpbnN0YWxsZWQgPSBncm91cEJ5RXh0ZW5zaW9uKGFsbCwgciA9PiByLmlkZW50aWZpZXIpLnJlZHVjZSgocmVzdWx0LCBleHRlbnNpb25zKSA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uc1swXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgd29ya3NwYWNlRXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN5c3RlbUV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlRXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlcikge1xuXHRcdFx0XHRcdFx0dXNlckV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c3lzdGVtRXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB3b3Jrc3BhY2VFeHRlbnNpb24gPz8gdXNlckV4dGVuc2lvbiA/PyBzeXN0ZW1FeHRlbnNpb247XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIFtdKTtcblxuXHRcdGNvbnN0IGJ5SWQgPSBpbmRleCh0aGlzLmluc3RhbGxlZCwgZSA9PiBlLmxvY2FsID8gZS5sb2NhbC5pZGVudGlmaWVyLmlkIDogZS5pZGVudGlmaWVyLmlkKTtcblx0XHR0aGlzLmluc3RhbGxlZCA9IGluc3RhbGxlZC5tYXAobG9jYWwgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYnlJZFtsb2NhbC5pZGVudGlmaWVyLmlkXSB8fCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbiwgdGhpcy5zdGF0ZVByb3ZpZGVyLCB0aGlzLnJ1bnRpbWVTdGF0ZVByb3ZpZGVyLCB0aGlzLnNlcnZlciwgbG9jYWwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdGV4dGVuc2lvbi5sb2NhbCA9IGxvY2FsO1xuXHRcdFx0ZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RW5hYmxlbWVudFN0YXRlKGxvY2FsKTtcblx0XHRcdGV4dGVuc2lvbi5zZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QpO1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5pbnN0YWxsZWQgPSBbXTtcblx0XHR0aGlzLmluc3RhbGxpbmcgPSBbXTtcblx0XHR0aGlzLnVuaW5zdGFsbGluZyA9IFtdO1xuXHRcdGF3YWl0IHRoaXMuZmV0Y2hJbnN0YWxsZWRFeHRlbnNpb25zKCk7XG5cdFx0dGhpcy5fb25SZXNldC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkSW5zdGFsbEV4dGVuc2lvbnMocmVzdWx0czogcmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uczogRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIHJlc3VsdHMpIHtcblx0XHRcdGNvbnN0IHsgbG9jYWwsIHNvdXJjZSB9ID0gZXZlbnQ7XG5cdFx0XHRjb25zdCBnYWxsZXJ5ID0gc291cmNlICYmICFVUkkuaXNVcmkoc291cmNlKSA/IHNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gc291cmNlICYmIFVSSS5pc1VyaShzb3VyY2UpID8gc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaW5zdGFsbGluZ0V4dGVuc2lvbiA9IGdhbGxlcnkgPyB0aGlzLmluc3RhbGxpbmcuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBnYWxsZXJ5LmlkZW50aWZpZXIpKVswXSA6IG51bGw7XG5cdFx0XHR0aGlzLmluc3RhbGxpbmcgPSBpbnN0YWxsaW5nRXh0ZW5zaW9uID8gdGhpcy5pbnN0YWxsaW5nLmZpbHRlcihlID0+IGUgIT09IGluc3RhbGxpbmdFeHRlbnNpb24pIDogdGhpcy5pbnN0YWxsaW5nO1xuXG5cdFx0XHRsZXQgZXh0ZW5zaW9uOiBFeHRlbnNpb24gfCB1bmRlZmluZWQgPSBpbnN0YWxsaW5nRXh0ZW5zaW9uID8gaW5zdGFsbGluZ0V4dGVuc2lvblxuXHRcdFx0XHQ6IChsb2NhdGlvbiB8fCBsb2NhbCkgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbiwgdGhpcy5zdGF0ZVByb3ZpZGVyLCB0aGlzLnJ1bnRpbWVTdGF0ZVByb3ZpZGVyLCB0aGlzLnNlcnZlciwgbG9jYWwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRpZiAobG9jYWwpIHtcblx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbiEuaWRlbnRpZmllcikpWzBdO1xuXHRcdFx0XHRcdGlmIChpbnN0YWxsZWQpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGluc3RhbGxlZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5pbnN0YWxsZWQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRleHRlbnNpb24ubG9jYWwgPSBsb2NhbDtcblx0XHRcdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZShsb2NhbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKCFsb2NhbCB8fCAhZXh0ZW5zaW9uID8gdW5kZWZpbmVkIDogeyBleHRlbnNpb24sIG9wZXJhdGlvbjogZXZlbnQub3BlcmF0aW9uIH0pO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLnNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5zZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KG1hbmlmZXN0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubWF0Y2hJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkoZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBsb2NhbC5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKGV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdGV4dGVuc2lvbi5sb2NhbCA9IGxvY2FsO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh7IGV4dGVuc2lvbiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hdGNoSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGV4dGVuc2lvbnM6IEV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9NYXRjaCA9IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gZS5sb2NhbCAmJiAhZS5nYWxsZXJ5ICYmIGUubG9jYWwuc291cmNlICE9PSAncmVzb3VyY2UnKTtcblx0XHRpZiAoIXRvTWF0Y2gubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyh0b01hdGNoLm1hcChlID0+ICh7IC4uLmUuaWRlbnRpZmllciwgcHJlUmVsZWFzZTogZS5sb2NhbD8ucHJlUmVsZWFzZSB9KSksIHsgY29tcGF0aWJsZTogdHJ1ZSwgdGFyZ2V0UGxhdGZvcm06IGF3YWl0IHRoaXMuc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCkgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgY29tcGF0aWJsZSA9IGdhbGxlcnlFeHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAoY29tcGF0aWJsZSkge1xuXHRcdFx0XHRleHRlbnNpb24uZ2FsbGVyeSA9IGNvbXBhdGlibGU7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblVuaW5zdGFsbEV4dGVuc2lvbihpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFsbGVkLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpWzBdO1xuXHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IHVuaW5zdGFsbGluZyA9IHRoaXMudW5pbnN0YWxsaW5nLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpWzBdIHx8IGV4dGVuc2lvbjtcblx0XHRcdHRoaXMudW5pbnN0YWxsaW5nID0gW3VuaW5zdGFsbGluZywgLi4udGhpcy51bmluc3RhbGxpbmcuZmlsdGVyKGUgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpXTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5pbnN0YWxsaW5nID8geyBleHRlbnNpb246IHVuaW5zdGFsbGluZyB9IDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKHsgaWRlbnRpZmllciwgZXJyb3IgfTogRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB1bmluc3RhbGxlZCA9IHRoaXMudW5pbnN0YWxsaW5nLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKSB8fCB0aGlzLmluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSk7XG5cdFx0dGhpcy51bmluc3RhbGxpbmcgPSB0aGlzLnVuaW5zdGFsbGluZy5maWx0ZXIoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSk7XG5cdFx0aWYgKCFlcnJvcikge1xuXHRcdFx0dGhpcy5pbnN0YWxsZWQgPSB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSk7XG5cdFx0fVxuXHRcdGlmICh1bmluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh7IGV4dGVuc2lvbjogdW5pbnN0YWxsZWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkVuYWJsZW1lbnRDaGFuZ2VkKHBsYXRmb3JtRXh0ZW5zaW9uczogcmVhZG9ubHkgSVBsYXRmb3JtRXh0ZW5zaW9uW10pIHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5sb2NhbC5maWx0ZXIoZSA9PiBwbGF0Zm9ybUV4dGVuc2lvbnMuc29tZShwID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgcC5pZGVudGlmaWVyKSkpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZSAhPT0gZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPSBlbmFibGVtZW50U3RhdGU7XG5cdFx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh7IGV4dGVuc2lvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbjogRXh0ZW5zaW9uKTogRXh0ZW5zaW9uU3RhdGUge1xuXHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSAmJiB0aGlzLmluc3RhbGxpbmcuc29tZShlID0+ICEhZS5nYWxsZXJ5ICYmIGFyZVNhbWVFeHRlbnNpb25zKGUuZ2FsbGVyeS5pZGVudGlmaWVyLCBleHRlbnNpb24uZ2FsbGVyeSEuaWRlbnRpZmllcikpKSB7XG5cdFx0XHRyZXR1cm4gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGluZztcblx0XHR9XG5cdFx0aWYgKHRoaXMudW5pbnN0YWxsaW5nLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdHJldHVybiBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gZSA9PT0gZXh0ZW5zaW9uIHx8IChlLmdhbGxlcnkgJiYgZXh0ZW5zaW9uLmdhbGxlcnkgJiYgYXJlU2FtZUV4dGVuc2lvbnMoZS5nYWxsZXJ5LmlkZW50aWZpZXIsIGV4dGVuc2lvbi5nYWxsZXJ5LmlkZW50aWZpZXIpKSlbMF07XG5cdFx0cmV0dXJuIGxvY2FsID8gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkIDogRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSVVSTEhhbmRsZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVwZGF0ZXNDaGVja0ludGVydmFsID0gMTAwMCAqIDYwICogNjAgKiAxMjsgLy8gMTIgaG91cnNcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBoYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsRXh0ZW5zaW9uczogRXh0ZW5zaW9ucyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4dGVuc2lvbnM6IEV4dGVuc2lvbnMgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSB3ZWJFeHRlbnNpb25zOiBFeHRlbnNpb25zIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NlcnZlcnM6IEV4dGVuc2lvbnNbXSA9IFtdO1xuXG5cdHByaXZhdGUgdXBkYXRlc0NoZWNrRGVsYXllcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBhdXRvVXBkYXRlRGVsYXllcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFeHRlbnNpb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRnZXQgb25DaGFuZ2UoKTogRXZlbnQ8SUV4dGVuc2lvbiB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIGV4dGVuc2lvbnNOb3RpZmljYXRpb246IElFeHRlbnNpb25zTm90aWZpY2F0aW9uICYgeyByZWFkb25seSBrZXk6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlc2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvblJlc2V0KCkgeyByZXR1cm4gdGhpcy5fb25SZXNldC5ldmVudDsgfVxuXG5cdHByaXZhdGUgaW5zdGFsbGluZzogSUV4dGVuc2lvbltdID0gW107XG5cdHByaXZhdGUgdGFza3NJblByb2dyZXNzOiBDYW5jZWxhYmxlUHJvbWlzZTxhbnk+W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkQXV0b1VwZGF0ZUNoZWNrVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cmVhZG9ubHkgd2hlbkluaXRpYWxpemVkOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVVJMU2VydmljZSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU3luY01hbmFnZW1lbnRTZXJ2aWNlOiBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFBdXRvU3luY1NlcnZpY2U6IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMb2NhbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9jYWxlU2VydmljZTogSUxvY2FsZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U6IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IEhhc091dGRhdGVkRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLmxvY2FsRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnMsXG5cdFx0XHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcixcblx0XHRcdFx0ZXh0ID0+IHRoaXMuZ2V0RXh0ZW5zaW9uU3RhdGUoZXh0KSxcblx0XHRcdFx0ZXh0ID0+IHRoaXMuZ2V0UnVudGltZVN0YXRlKGV4dCksXG5cdFx0XHRcdCFleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHQpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubG9jYWxFeHRlbnNpb25zLm9uQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZENoYW5nZUV4dGVuc2lvbnMoZT8uZXh0ZW5zaW9uKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sb2NhbEV4dGVuc2lvbnMub25SZXNldChlID0+IHRoaXMucmVzZXQoKSkpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25zU2VydmVycy5wdXNoKHRoaXMubG9jYWxFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnMsXG5cdFx0XHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldEV4dGVuc2lvblN0YXRlKGV4dCksXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0ZShleHQpLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXh0ZW5zaW9ucy5vbkNoYW5nZShlID0+IHRoaXMub25EaWRDaGFuZ2VFeHRlbnNpb25zKGU/LmV4dGVuc2lvbikpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXh0ZW5zaW9ucy5vblJlc2V0KGUgPT4gdGhpcy5yZXNldCgpKSk7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnNTZXJ2ZXJzLnB1c2godGhpcy5yZW1vdGVFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMud2ViRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnMsXG5cdFx0XHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldEV4dGVuc2lvblN0YXRlKGV4dCksXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0ZShleHQpLFxuXHRcdFx0XHQhKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfHwgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKVxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYkV4dGVuc2lvbnMub25DaGFuZ2UoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhlPy5leHRlbnNpb24pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYkV4dGVuc2lvbnMub25SZXNldChlID0+IHRoaXMucmVzZXQoKSkpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25zU2VydmVycy5wdXNoKHRoaXMud2ViRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVzQ2hlY2tEZWxheWVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuVXBkYXRlc0NoZWNrSW50ZXJ2YWwpO1xuXHRcdHRoaXMuYXV0b1VwZGF0ZURlbGF5ZXIgPSBuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPigxMDAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVzQ2hlY2tEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5hdXRvVXBkYXRlRGVsYXllci5jYW5jZWwoKTtcblx0XHR9KSk7XG5cblx0XHR1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKTtcblxuXHRcdHRoaXMud2hlbkluaXRpYWxpemVkID0gdGhpcy5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gaW5pdGlhbGl6ZSBsb2NhbCBleHRlbnNpb25zXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMucXVlcnlMb2NhbCgpLCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCldKTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm9uRGlkQ2hhbmdlUnVubmluZ0V4dGVuc2lvbnModGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMsIFtdKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKCh7IGFkZGVkLCByZW1vdmVkIH0pID0+IHRoaXMub25EaWRDaGFuZ2VSdW5uaW5nRXh0ZW5zaW9ucyhhZGRlZCwgcmVtb3ZlZCkpKTtcblxuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0aWFsaXplQXV0b1VwZGF0ZSgpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKVxuXHRcdFx0LnRoZW4obWFuaWZlc3QgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdChtYW5pZmVzdCk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdChtYW5pZmVzdCA9PiB0aGlzLnVwZGF0ZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdChtYW5pZmVzdCkpKTtcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIGZldGNoaW5nIGV4dGVuc2lvbiBnYWxsZXJ5IG1hbmlmZXN0JywgZSkpO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uc05vdGlmaWNhaXRvbigpO1xuXHRcdHRoaXMucmVwb3J0SW5zdGFsbGVkRXh0ZW5zaW9uc1RlbGVtZXRyeSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgRVhURU5TSU9OU19ESVNNSVNTRURfTk9USUZJQ0FUSU9OU19LRVksIHRoaXMuX3N0b3JlKShlID0+IHRoaXMub25EaWREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWVDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIEVYVEVOU0lPTlNfQVVUT19VUERBVEVfS0VZLCB0aGlzLl9zdG9yZSkoZSA9PiB0aGlzLm9uRGlkU2VsZWN0ZWRFeHRlbnNpb25Ub0F1dG9VcGRhdGVWYWx1ZUNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgRVhURU5TSU9OU19ET05PVF9BVVRPX1VQREFURV9LRVksIHRoaXMuX3N0b3JlKShlID0+IHRoaXMub25EaWRTZWxlY3RlZEV4dGVuc2lvblRvQXV0b1VwZGF0ZVZhbHVlQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZSh0aGlzLm9uQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQsIDEwMCkoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk7XG5cdFx0XHR0aGlzLnJlcG9ydFByb2dyZXNzRnJvbU90aGVyU291cmNlcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnS2V5KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnNOb3RpZmljYWl0b24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVBdXRvVXBkYXRlKCk6IHZvaWQge1xuXHRcdC8vIFJlZ2lzdGVyIGxpc3RlbmVycyBmb3IgYXV0byB1cGRhdGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWQoKSkge1xuXHRcdFx0XHRcdC8vIEF1dG8gdXBkYXRlIGRpc2FibGVkIFx1MjAxNCBjYW5jZWwgYW55IHBlbmRpbmcgZGVsYXllZCByZS1jaGVja1xuXHRcdFx0XHRcdHRoaXMuZGVsYXllZEF1dG9VcGRhdGVDaGVja1RpbWVyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZXZlbnR1YWxseUF1dG9VcGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVGhlIGF1dG8gdXBkYXRlIHZhbHVlIGFmZmVjdHMgd2hldGhlciBhbiBleHRlbnNpb24gaXMgc2hvd24gYXMgZGVsYXllZFxuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXRvVXBkYXRlRGVsYXlDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0XHQvLyBUaGUgZGVsYXkgYWZmZWN0cyB3aGVuIGRlbGF5ZWQgdXBkYXRlcyBhcmUgYXBwbGllZCBcdTIwMTQgY2FuY2VsIGFueSBwZW5kaW5nXG5cdFx0XHRcdC8vIGRlbGF5ZWQgcmUtY2hlY2sgYW5kIHJlLXJ1biB0aGUgc2NoZWR1bGluZyBwYXRoIHdpdGggdGhlIG5ldyBkZWxheS5cblx0XHRcdFx0dGhpcy5kZWxheWVkQXV0b1VwZGF0ZUNoZWNrVGltZXIudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZXZlbnR1YWxseUF1dG9VcGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVGhlIGRlbGF5IGFmZmVjdHMgd2hldGhlciBhbiBleHRlbnNpb24gaXMgc2hvd24gYXMgZGVsYXllZFxuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXRvQ2hlY2tVcGRhdGVzQ29uZmlndXJhdGlvbktleSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoYEVuYWJsZWQgYXV0byBjaGVjayB1cGRhdGVzYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5vbkVuYWJsZW1lbnRDaGFuZ2VkKHBsYXRmb3JtRXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0F1dG9DaGVja1VwZGF0ZXNFbmFibGVkKCkgJiYgdGhpcy5nZXRBdXRvVXBkYXRlVmFsdWUoKSA9PT0gJ29uJyAmJiBwbGF0Zm9ybUV4dGVuc2lvbnMuc29tZShlID0+IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGUpKSkge1xuXHRcdFx0XHR0aGlzLmNoZWNrRm9yVXBkYXRlcygnRXh0ZW5zaW9uIGVuYWJsZW1lbnQgY2hhbmdlZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZSh0aGlzLm9uQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQsIDEwMCkoKCkgPT4gdGhpcy5oYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldCh0aGlzLm91dGRhdGVkLmxlbmd0aCA+IDApKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoKGUudHlwZSA9PT0gU3RhdGVUeXBlLkNoZWNraW5nRm9yVXBkYXRlcyAmJiBlLmV4cGxpY2l0KSB8fCBlLnR5cGUgPT09IFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZCB8fCBlLnR5cGUgPT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCB7XG5cdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB3aGVuIHVwZGF0ZSBjaGVjayBpcyB0cmlnZ2VyZWQgb24gcHJvZHVjdCB1cGRhdGUnO1xuXHRcdFx0XHR9PignZXh0ZW5zaW9uczp1cGRhdGVjaGVja29ucHJvZHVjdHVwZGF0ZScpO1xuXHRcdFx0XHRpZiAodGhpcy5pc0F1dG9DaGVja1VwZGF0ZXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmNoZWNrRm9yVXBkYXRlcygnUHJvZHVjdCB1cGRhdGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0F1dG9DaGVja1VwZGF0ZXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoJ0FsbG93ZWQgZXh0ZW5zaW9ucyBjaGFuZ2VkJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VJc0Nvbm5lY3Rpb25NZXRlcmVkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzQXV0b0NoZWNrVXBkYXRlc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmNoZWNrRm9yVXBkYXRlcygnQ29ubmVjdGlvbiBpcyBubyBsb25nZXIgbWV0ZXJlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzV2ViICYmICF0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmF1dG9VcGRhdGVCdWlsdGluRXh0ZW5zaW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBBdXRvVXBkYXRlIENvbnRleHRzXG5cdFx0dGhpcy5oYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldCh0aGlzLm91dGRhdGVkLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHVwZGF0ZXNcblx0XHR0aGlzLmV2ZW50dWFsbHlDaGVja0ZvclVwZGF0ZXModHJ1ZSk7XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuc3luY1Bpbm5lZEJ1aWx0aW5FeHRlbnNpb25zKCk7XG5cdFx0XHQvLyBBbHdheXMgYXV0byB1cGRhdGUgYnVpbHRpbiBleHRlbnNpb25zIGluIHdlYlxuXHRcdFx0aWYgKCF0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmF1dG9VcGRhdGVCdWlsdGluRXh0ZW5zaW9ucygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVnaXN0ZXJBdXRvUmVzdGFydExpc3RlbmVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXRvUmVzdGFydENvbmZpZ3VyYXRpb25LZXkpKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJBdXRvUmVzdGFydExpc3RlbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBtYW5pZmVzdDtcblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnNOb3RpZmljYWl0b24oKTtcblx0fVxuXG5cdHByaXZhdGUgaXNBdXRvVXBkYXRlRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRBdXRvVXBkYXRlVmFsdWUoKSAhPT0gJ29mZic7XG5cdH1cblxuXHRnZXRBdXRvVXBkYXRlVmFsdWUoKTogQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25WYWx1ZSB7XG5cdFx0Y29uc3QgYXV0b1VwZGF0ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8QXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25WYWx1ZSB8IGJvb2xlYW4gfCAnb25seUVuYWJsZWRFeHRlbnNpb25zJyB8ICdvbmx5U2VsZWN0ZWRFeHRlbnNpb25zJyB8ICdkZWxheWVkJz4oQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXkpO1xuXHRcdGlmIChhdXRvVXBkYXRlID09PSAnb2ZmJyB8fCBhdXRvVXBkYXRlID09PSBmYWxzZSB8fCBhdXRvVXBkYXRlID09PSAnb25seVNlbGVjdGVkRXh0ZW5zaW9ucycpIHtcblx0XHRcdHJldHVybiAnb2ZmJztcblx0XHR9XG5cdFx0cmV0dXJuICdvbic7XG5cdH1cblxuXHRpc0F1dG9VcGRhdGVEZWxheWVkKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmICghZXh0ZW5zaW9uLm91dGRhdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5zaG91bGRBdXRvVXBkYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXV0b1VwZGF0ZURlbGF5UmVtYWluaW5nKGV4dGVuc2lvbikgPiAwO1xuXHR9XG5cblx0Z2V0QXV0b1VwZGF0ZURlbGF5UmVtYWluaW5nKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IG51bWJlciB7XG5cdFx0Ly8gRXh0ZW5zaW9ucyBmcm9tIHB1Ymxpc2hlcnMgdHJ1c3RlZCBieSB0aGUgcHJvZHVjdCBhcmUgYXV0byB1cGRhdGVkIHdpdGhvdXQgZGVsYXkuXG5cdFx0aWYgKHRoaXMuaXNGcm9tVHJ1c3RlZFB1Ymxpc2hlcihleHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdFVwZGF0ZWQgPSBleHRlbnNpb24uZ2FsbGVyeT8ubGFzdFVwZGF0ZWQ7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUobGFzdFVwZGF0ZWQpIHx8ICFsYXN0VXBkYXRlZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gbGFzdFVwZGF0ZWQ7XG5cdFx0aWYgKGVsYXBzZWQgPCAwKSB7XG5cdFx0XHQvLyBGdXR1cmUgdGltZXN0YW1wIChjbG9jayBza2V3KSBcdTIwMTQgdHJlYXQgYXMgbm90IGRlbGF5ZWRcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCBkZWxheVBlcmlvZCA9IHRoaXMuZ2V0QXV0b1VwZGF0ZURlbGF5KCk7XG5cdFx0cmV0dXJuIE1hdGgubWF4KDAsIGRlbGF5UGVyaW9kIC0gZWxhcHNlZCk7XG5cdH1cblxuXHRnZXRBdXRvVXBkYXRlRGVsYXkoKTogbnVtYmVyIHtcblx0XHRjb25zdCBkZWxheUhvdXJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KEF1dG9VcGRhdGVEZWxheUNvbmZpZ3VyYXRpb25LZXkpID8/IDI7XG5cdFx0cmV0dXJuIGRlbGF5SG91cnMgKiA2MCAqIDYwICogMTAwMDsgLy8gQ29udmVydCBob3VycyB0byBtaWxsaXNlY29uZHNcblx0fVxuXG5cdHByaXZhdGUgaXNGcm9tVHJ1c3RlZFB1Ymxpc2hlcihleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVycyA9IHRoaXMucHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvblB1Ymxpc2hlcnM7XG5cdFx0aWYgKCF0cnVzdGVkUHVibGlzaGVycz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHB1Ymxpc2hlciA9IGV4dGVuc2lvbi5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gdHJ1c3RlZFB1Ymxpc2hlcnMuaW5jbHVkZXMocHVibGlzaGVyKVxuXHRcdFx0fHwgdHJ1c3RlZFB1Ymxpc2hlcnMuaW5jbHVkZXMoZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlQXV0b1VwZGF0ZUZvckFsbEV4dGVuc2lvbnMoaXNBdXRvVXBkYXRlRW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdhc0F1dG9VcGRhdGVFbmFibGVkID0gdGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCk7XG5cdFx0aWYgKHdhc0F1dG9VcGRhdGVFbmFibGVkID09PSBpc0F1dG9VcGRhdGVFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY29uZmlybUVuYWJsZURpc2FibGVBdXRvVXBkYXRlJywgXCJBdXRvIFVwZGF0ZSBFeHRlbnNpb25zXCIpLFxuXHRcdFx0bWVzc2FnZTogaXNBdXRvVXBkYXRlRW5hYmxlZFxuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29uZmlybUVuYWJsZUF1dG9VcGRhdGUnLCBcIkRvIHlvdSB3YW50IHRvIGVuYWJsZSBhdXRvIHVwZGF0ZSBmb3IgZXh0ZW5zaW9ucz9cIilcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2NvbmZpcm1EaXNhYmxlQXV0b1VwZGF0ZScsIFwiRG8geW91IHdhbnQgdG8gZGlzYWJsZSBhdXRvIHVwZGF0ZSBmb3IgZXh0ZW5zaW9ucz9cIiksXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnY29uZmlybUVuYWJsZURpc2FibGVBdXRvVXBkYXRlRGV0YWlsJywgXCJUaGlzIHdpbGwgcmVzZXQgYW55IGF1dG8gdXBkYXRlIHNldHRpbmdzIHlvdSBoYXZlIHNldCBmb3IgaW5kaXZpZHVhbCBleHRlbnNpb25zLlwiKSxcblx0XHR9KTtcblx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXNldCBleHRlbnNpb25zIGVuYWJsZWQgZm9yIGF1dG8gdXBkYXRlIGZpcnN0IHRvIHByZXZlbnQgdGhlbSBmcm9tIGJlaW5nIHVwZGF0ZWRcblx0XHR0aGlzLnNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhbXSk7XG5cblx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5LCBpc0F1dG9VcGRhdGVFbmFibGVkID8gJ29uJyA6ICdvZmYnKTtcblxuXHRcdHRoaXMuc2V0RGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhbXSk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVFeHRlbnNpb25zUGlubmVkU3RhdGUoIWlzQXV0b1VwZGF0ZUVuYWJsZWQpO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgYXV0b1Jlc3RhcnRMaXN0ZW5lckRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVnaXN0ZXJBdXRvUmVzdGFydExpc3RlbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuYXV0b1Jlc3RhcnRMaXN0ZW5lckRpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5hdXRvUmVzdGFydExpc3RlbmVyRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1cyA9PiB7XG5cdFx0XHRcdGlmICghZm9jdXMgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBdXRvUmVzdGFydENvbmZpZ3VyYXRpb25LZXkpID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydEluc3RhbGxlZEV4dGVuc2lvbnNUZWxlbWV0cnkoKSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gdGhpcy5pbnN0YWxsZWQuZmlsdGVyKGV4dGVuc2lvbiA9PlxuXHRcdFx0IWV4dGVuc2lvbi5pc0J1aWx0aW4gJiZcblx0XHRcdChleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSB8fFxuXHRcdFx0XHRleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5KSlcblx0XHRcdC5tYXAoZXh0ZW5zaW9uID0+IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsZWRFeHRlbnNpb25zRXZlbnQsIEV4dGVuc2lvbnNMb2FkQ2xhc3NpZmljYXRpb24+KCdpbnN0YWxsZWRFeHRlbnNpb25zJywgeyBleHRlbnNpb25JZHM6IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUoZXh0ZW5zaW9uSWRzLmpvaW4oJzsnKSksIGNvdW50OiBleHRlbnNpb25JZHMubGVuZ3RoIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZVJ1bm5pbmdFeHRlbnNpb25zKGFkZGVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25EZXNjcmlwdGlvbj4sIHJlbW92ZWQ6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5nZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9GZXRjaDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgYWRkZWQpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBkZXNjLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGRlc2MudXVpZCB9LCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0Y2hhbmdlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1RvRmV0Y2gucHVzaChkZXNjKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgcmVtb3ZlZCkge1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UoZGVzYy5leHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0d29ya3NwYWNlRXh0ZW5zaW9ucy5wdXNoKGRlc2MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1RvRmV0Y2gucHVzaChkZXNjKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbnNUb0ZldGNoLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25zVG9GZXRjaC5tYXAoZSA9PiAoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNoYW5nZWRFeHRlbnNpb25zLnB1c2goLi4uZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh3b3Jrc3BhY2VFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0UmVzb3VyY2VFeHRlbnNpb25zKHdvcmtzcGFjZUV4dGVuc2lvbnMubWFwKGUgPT4gZS5leHRlbnNpb25Mb2NhdGlvbiksIHRydWUpO1xuXHRcdFx0Y2hhbmdlZEV4dGVuc2lvbnMucHVzaCguLi5leHRlbnNpb25zKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2VkRXh0ZW5zaW9uIG9mIGNoYW5nZWRFeHRlbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGNoYW5nZWRFeHRlbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uc1Bpbm5lZFN0YXRlKHBpbm5lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRXh0ZW5zaW9ucyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3VwZGF0aW5nRXh0ZW5zaW9ucycsIFwiVXBkYXRpbmcgRXh0ZW5zaW9ucyBBdXRvIFVwZGF0ZSBTdGF0ZVwiKSxcblx0XHR9LCAoKSA9PiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRoaXMudGFza3NJblByb2dyZXNzKSB7XG5cdFx0XHR0YXNrLmNhbmNlbCgpO1xuXHRcdH1cblx0XHR0aGlzLnRhc2tzSW5Qcm9ncmVzcyA9IFtdO1xuXHRcdHRoaXMuaW5zdGFsbGluZyA9IFtdO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VFeHRlbnNpb25zKCk7XG5cdFx0dGhpcy5fb25SZXNldC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhleHRlbnNpb24/OiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5faW5zdGFsbGVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xvY2FsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoZXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvY2FsOiBJRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdGdldCBsb2NhbCgpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGlmICghdGhpcy5fbG9jYWwpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnNTZXJ2ZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuaW5zdGFsbGVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9jYWwgPSBbXTtcblx0XHRcdFx0Y29uc3QgYnlJZCA9IGdyb3VwQnlFeHRlbnNpb24odGhpcy5pbnN0YWxsZWQsIHIgPT4gci5pZGVudGlmaWVyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25zIG9mIGJ5SWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2NhbC5wdXNoKHRoaXMuZ2V0UHJpbWFyeUV4dGVuc2lvbihleHRlbnNpb25zKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xvY2FsO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zdGFsbGVkOiBJRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdGdldCBpbnN0YWxsZWQoKTogSUV4dGVuc2lvbltdIHtcblx0XHRpZiAoIXRoaXMuX2luc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5faW5zdGFsbGVkID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbnMgb2YgdGhpcy5leHRlbnNpb25zU2VydmVycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zLmxvY2FsKSB7XG5cdFx0XHRcdFx0dGhpcy5faW5zdGFsbGVkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbGVkO1xuXHR9XG5cblx0Z2V0IG91dGRhdGVkKCk6IElFeHRlbnNpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFsbGVkLmZpbHRlcihlID0+IGUub3V0ZGF0ZWQgJiYgZS5sb2NhbCAmJiBlLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpO1xuXHR9XG5cblx0YXN5bmMgcXVlcnlMb2NhbChzZXJ2ZXI/OiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0aWYgKHRoaXMubG9jYWxFeHRlbnNpb25zICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID09PSBzZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubG9jYWxFeHRlbnNpb25zLnF1ZXJ5SW5zdGFsbGVkKHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5yZW1vdGVFeHRlbnNpb25zICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA9PT0gc2VydmVyKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbW90ZUV4dGVuc2lvbnMucXVlcnlJbnN0YWxsZWQodGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLndlYkV4dGVuc2lvbnMgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID09PSBzZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2ViRXh0ZW5zaW9ucy5xdWVyeUluc3RhbGxlZCh0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnMucXVlcnlJbnN0YWxsZWQodGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5yZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbW90ZUV4dGVuc2lvbnMucXVlcnlJbnN0YWxsZWQodGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy53ZWJFeHRlbnNpb25zKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnMucXVlcnlJbnN0YWxsZWQodGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5sb2NhbDtcblx0fVxuXG5cdHF1ZXJ5R2FsbGVyeSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlcjxJRXh0ZW5zaW9uPj47XG5cdHF1ZXJ5R2FsbGVyeShvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlcjxJRXh0ZW5zaW9uPj47XG5cdGFzeW5jIHF1ZXJ5R2FsbGVyeShhcmcxOiBhbnksIGFyZzI/OiBhbnkpOiBQcm9taXNlPElQYWdlcjxJRXh0ZW5zaW9uPj4ge1xuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHNpbmdsZVBhZ2VQYWdlcihbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyA9IENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oYXJnMSkgPyB7fSA6IGFyZzE7XG5cdFx0Y29uc3QgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmcxKSA/IGFyZzEgOiBhcmcyO1xuXHRcdG9wdGlvbnMudGV4dCA9IG9wdGlvbnMudGV4dCA/IHRoaXMucmVzb2x2ZVF1ZXJ5VGV4dChvcHRpb25zLnRleHQpIDogb3B0aW9ucy50ZXh0O1xuXHRcdG9wdGlvbnMuaW5jbHVkZVByZVJlbGVhc2UgPSBpc1VuZGVmaW5lZChvcHRpb25zLmluY2x1ZGVQcmVSZWxlYXNlKSA/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMgOiBvcHRpb25zLmluY2x1ZGVQcmVSZWxlYXNlO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5xdWVyeShvcHRpb25zLCB0b2tlbik7XG5cdFx0dGhpcy5zeW5jSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KHBhZ2VyLmZpcnN0UGFnZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpcnN0UGFnZTogcGFnZXIuZmlyc3RQYWdlLm1hcChnYWxsZXJ5ID0+IHRoaXMuZnJvbUdhbGxlcnkoZ2FsbGVyeSwgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCkpLFxuXHRcdFx0dG90YWw6IHBhZ2VyLnRvdGFsLFxuXHRcdFx0cGFnZVNpemU6IHBhZ2VyLnBhZ2VTaXplLFxuXHRcdFx0Z2V0UGFnZTogYXN5bmMgKHBhZ2VJbmRleCwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcGFnZSA9IGF3YWl0IHBhZ2VyLmdldFBhZ2UocGFnZUluZGV4LCB0b2tlbik7XG5cdFx0XHRcdHRoaXMuc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShwYWdlKTtcblx0XHRcdFx0cmV0dXJuIHBhZ2UubWFwKGdhbGxlcnkgPT4gdGhpcy5mcm9tR2FsbGVyeShnYWxsZXJ5LCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IElFeHRlbnNpb25JbmZvW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbltdPjtcblx0Z2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvczogSUV4dGVuc2lvbkluZm9bXSwgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+O1xuXHRhc3luYyBnZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zOiBJRXh0ZW5zaW9uSW5mb1tdLCBhcmcxOiBhbnksIGFyZzI/OiBhbnkpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGV4dGVuc2lvbkluZm9zLmZvckVhY2goZSA9PiBlLnByZVJlbGVhc2UgPSBlLnByZVJlbGVhc2UgPz8gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5wcmVmZXJQcmVSZWxlYXNlcyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zLCBhcmcxLCBhcmcyKTtcblx0XHR0aGlzLnN5bmNJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbnMpO1xuXHRcdHJldHVybiBnYWxsZXJ5RXh0ZW5zaW9ucy5tYXAoZ2FsbGVyeSA9PiB0aGlzLmZyb21HYWxsZXJ5KGdhbGxlcnksIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QpKTtcblx0fVxuXG5cdGFzeW5jIGdldFJlc291cmNlRXh0ZW5zaW9ucyhsb2NhdGlvbnM6IFVSSVtdLCBpc1dvcmtzcGFjZVNjb3BlZDogYm9vbGVhbik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2VFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zKGxvY2F0aW9ucyk7XG5cdFx0cmV0dXJuIHJlc291cmNlRXh0ZW5zaW9ucy5tYXAocmVzb3VyY2VFeHRlbnNpb24gPT4gdGhpcy5nZXRJbnN0YWxsZWRFeHRlbnNpb25NYXRjaGluZ0xvY2F0aW9uKHJlc291cmNlRXh0ZW5zaW9uLmxvY2F0aW9uKVxuXHRcdFx0Pz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb24sIGV4dCA9PiB0aGlzLmdldEV4dGVuc2lvblN0YXRlKGV4dCksIGV4dCA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0ZShleHQpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IHJlc291cmNlRXh0ZW5zaW9uLCBpc1dvcmtzcGFjZVNjb3BlZCB9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmIChcblx0XHRcdHRoaXMuZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlICE9PSB0aGlzLmdldERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpIC8qIFRoaXMgY2hlY2tzIGlmIGN1cnJlbnQgd2luZG93IGNoYW5nZWQgdGhlIHZhbHVlIG9yIG5vdCAqL1xuXHRcdCkge1xuXHRcdFx0dGhpcy5fZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXB1dGVkTm90aWZpY2lhdGlvbnMgPSB0aGlzLmNvbXB1dGVFeHRlbnNpb25zTm90aWZpY2F0aW9ucygpO1xuXHRcdGNvbnN0IGRpc21pc3NlZE5vdGlmaWNhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cblx0XHRsZXQgZXh0ZW5zaW9uc05vdGlmaWNhdGlvbjogSUV4dGVuc2lvbnNOb3RpZmljYXRpb24gJiB7IGtleTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbXB1dGVkTm90aWZpY2lhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBwb3B1bGF0ZSBkaXNtaXNzZWQgbm90aWZpY2F0aW9ucyB3aXRoIHRoZSBvbmVzIHRoYXQgYXJlIHN0aWxsIHZhbGlkXG5cdFx0XHRmb3IgKGNvbnN0IGRpc21pc3NlZE5vdGlmaWNhdGlvbiBvZiB0aGlzLmdldERpc21pc3NlZE5vdGlmaWNhdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoY29tcHV0ZWROb3RpZmljaWF0aW9ucy5zb21lKGUgPT4gZS5rZXkgPT09IGRpc21pc3NlZE5vdGlmaWNhdGlvbikpIHtcblx0XHRcdFx0XHRkaXNtaXNzZWROb3RpZmljYXRpb25zLnB1c2goZGlzbWlzc2VkTm90aWZpY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFkaXNtaXNzZWROb3RpZmljYXRpb25zLmluY2x1ZGVzKGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0ua2V5KSkge1xuXHRcdFx0XHRleHRlbnNpb25zTm90aWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0ubWVzc2FnZSxcblx0XHRcdFx0XHRzZXZlcml0eTogY29tcHV0ZWROb3RpZmljaWF0aW9uc1swXS5zZXZlcml0eSxcblx0XHRcdFx0XHRleHRlbnNpb25zOiBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLmV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0cXVlcnk6IGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0ucXVlcnksXG5cdFx0XHRcdFx0YWN0aW9uOiBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLmFjdGlvbixcblx0XHRcdFx0XHRrZXk6IGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0ua2V5LFxuXHRcdFx0XHRcdGRpc21pc3M6ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0RGlzbWlzc2VkTm90aWZpY2F0aW9ucyhbLi4udGhpcy5nZXREaXNtaXNzZWROb3RpZmljYXRpb25zKCksIGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0ua2V5XSk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnNOb3RpZmljYWl0b24oKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnNldERpc21pc3NlZE5vdGlmaWNhdGlvbnMoZGlzbWlzc2VkTm90aWZpY2F0aW9ucyk7XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb25zTm90aWZpY2F0aW9uPy5rZXkgIT09IGV4dGVuc2lvbnNOb3RpZmljYXRpb24/LmtleSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zTm90aWZpY2F0aW9uID0gZXh0ZW5zaW9uc05vdGlmaWNhdGlvbjtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbi5maXJlKHRoaXMuZXh0ZW5zaW9uc05vdGlmaWNhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbnMoKTogQXJyYXk8T21pdDxJRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiwgJ2Rpc21pc3MnPiAmIHsga2V5OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGNvbXB1dGVkTm90aWZpY2lhdGlvbnM6IEFycmF5PE9taXQ8SUV4dGVuc2lvbnNOb3RpZmljYXRpb24sICdkaXNtaXNzJz4gJiB7IGtleTogc3RyaW5nIH0+ID0gW107XG5cblx0XHRjb25zdCBkaXNhbGxvd2VkRXh0ZW5zaW9ucyA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gZS5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5QWxsb3dsaXN0KTtcblx0XHRpZiAoZGlzYWxsb3dlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb21wdXRlZE5vdGlmaWNpYXRpb25zLnB1c2goe1xuXHRcdFx0XHRtZXNzYWdlOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoQWxsb3dlZEV4dGVuc2lvbnNDb25maWdLZXkpLnBvbGljeVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdkaXNhbGxvd2VkIGV4dGVuc2lvbnMgYnkgcG9saWN5JywgXCJTb21lIGV4dGVuc2lvbnMgYXJlIGRpc2FibGVkIGJlY2F1c2UgdGhleSBhcmUgbm90IGFsbG93ZWQgYnkgeW91ciBzeXN0ZW0gYWRtaW5pc3RyYXRvci5cIilcblx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZGlzYWxsb3dlZCBleHRlbnNpb25zJywgXCJTb21lIGV4dGVuc2lvbnMgYXJlIGRpc2FibGVkIGJlY2F1c2UgdGhleSBhcmUgY29uZmlndXJlZCBub3QgdG8gYmUgYWxsb3dlZC5cIiksXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRleHRlbnNpb25zOiBkaXNhbGxvd2VkRXh0ZW5zaW9ucyxcblx0XHRcdFx0a2V5OiAnZGlzYWxsb3dlZEV4dGVuc2lvbnM6JyArIGRpc2FsbG93ZWRFeHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IGEuaWRlbnRpZmllci5pZC5sb2NhbGVDb21wYXJlKGIuaWRlbnRpZmllci5pZCkpLm1hcChlID0+IGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKS5qb2luKCctJyksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnZhbGlkRXh0ZW5zaW9ucyA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gZS5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5SW52YWxpZEV4dGVuc2lvbiAmJiAhZS5pc1dvcmtzcGFjZVNjb3BlZCk7XG5cdFx0aWYgKGludmFsaWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0aWYgKGludmFsaWRFeHRlbnNpb25zLnNvbWUoZSA9PiBlLmxvY2FsICYmIGUubG9jYWwubWFuaWZlc3QuZW5naW5lcz8udnNjb2RlICYmXG5cdFx0XHRcdCFpc0VuZ2luZVZhbGlkKGUubG9jYWwubWFuaWZlc3QuZW5naW5lcy52c2NvZGUsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlKVxuXHRcdFx0KSkge1xuXHRcdFx0XHRjb21wdXRlZE5vdGlmaWNpYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnaW5jb21wYXRpYmxlRXh0ZW5zaW9ucycsIFwiU29tZSBleHRlbnNpb25zIGFyZSBkaXNhYmxlZCBkdWUgdG8gdmVyc2lvbiBpbmNvbXBhdGliaWxpdHkuIFJldmlldyBhbmQgdXBkYXRlIHRoZW0uXCIpLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6IGludmFsaWRFeHRlbnNpb25zLFxuXHRcdFx0XHRcdGtleTogJ2luY29tcGF0aWJsZUV4dGVuc2lvbnM6JyArIGludmFsaWRFeHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IGEuaWRlbnRpZmllci5pZC5sb2NhbGVDb21wYXJlKGIuaWRlbnRpZmllci5pZCkpLm1hcChlID0+IGAke2UuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpfUAke2UubG9jYWw/Lm1hbmlmZXN0LnZlcnNpb259YCkuam9pbignLScpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbXB1dGVkTm90aWZpY2lhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdpbnZhbGlkRXh0ZW5zaW9ucycsIFwiSW52YWxpZCBleHRlbnNpb25zIGRldGVjdGVkLiBSZXZpZXcgdGhlbS5cIiksXG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczogaW52YWxpZEV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0a2V5OiAnaW52YWxpZEV4dGVuc2lvbnM6JyArIGludmFsaWRFeHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IGEuaWRlbnRpZmllci5pZC5sb2NhbGVDb21wYXJlKGIuaWRlbnRpZmllci5pZCkpLm1hcChlID0+IGAke2UuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpfUAke2UubG9jYWw/Lm1hbmlmZXN0LnZlcnNpb259YCkuam9pbignLScpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0Y29uc3QgcmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucyA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gZS5ydW50aW1lU3RhdGUgIT09IHVuZGVmaW5lZCAmJiAoZS5ydW50aW1lU3RhdGUuYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucyB8fCBlLnJ1bnRpbWVTdGF0ZS5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdykpO1xuXHRcdFx0aWYgKHJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IG5lZWRzUmVsb2FkID0gcmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucy5zb21lKGUgPT4gZS5ydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVsb2FkV2luZG93KTtcblx0XHRcdFx0Y29tcHV0ZWROb3RpZmljaWF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRtZXNzYWdlOiBuZWVkc1JlbG9hZFxuXHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2V4dGVuc2lvbnMgbmVlZCByZWxvYWQnLCBcIkV4dGVuc2lvbnMgcmVxdWlyZSBhIHdpbmRvdyByZWxvYWQgdG8gYXBwbHkgdXBkYXRlcy5cIilcblx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdleHRlbnNpb25zIG5lZWQgcmVzdGFydCcsIFwiQWxsIGV4dGVuc2lvbnMgcmVxdWlyZSBhIHJlc3RhcnQgdG8gYXBwbHkgdXBkYXRlcy5cIiksXG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczogcmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRxdWVyeTogJ0ByZXN0YXJ0cmVxdWlyZWQnLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5lZWRzUmVsb2FkXG5cdFx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdyZWxvYWQgd2luZG93JywgXCJSZWxvYWQgV2luZG93XCIpXG5cdFx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdyZXN0YXJ0IGV4dGVuc2lvbnMgYWN0aW9uJywgXCJSZXN0YXJ0IEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKG5lZWRzUmVsb2FkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5ob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtleTogJ3Jlc3RhcnRSZXF1aXJlZDonICsgcmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiBhLmlkZW50aWZpZXIuaWQubG9jYWxlQ29tcGFyZShiLmlkZW50aWZpZXIuaWQpKS5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkuam9pbignLScpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZXByZWNhdGVkRXh0ZW5zaW9ucyA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gISFlLmRlcHJlY2F0aW9uSW5mbyAmJiBlLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGUubG9jYWwpKTtcblx0XHRpZiAoZGVwcmVjYXRlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb21wdXRlZE5vdGlmaWNpYXRpb25zLnB1c2goe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2RlcHJlY2F0ZWQgZXh0ZW5zaW9ucycsIFwiRGVwcmVjYXRlZCBleHRlbnNpb25zIGRldGVjdGVkLiBSZXZpZXcgdGhlbSBhbmQgbWlncmF0ZSB0byBhbHRlcm5hdGl2ZXMuXCIpLFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0ZXh0ZW5zaW9uczogZGVwcmVjYXRlZEV4dGVuc2lvbnMsXG5cdFx0XHRcdGtleTogJ2RlcHJlY2F0ZWRFeHRlbnNpb25zOicgKyBkZXByZWNhdGVkRXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiBhLmlkZW50aWZpZXIuaWQubG9jYWxlQ29tcGFyZShiLmlkZW50aWZpZXIuaWQpKS5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkuam9pbignLScpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpdmF0ZU1hcmtldHBsYWNlVXJsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VVcmxDb25maWdLZXkpLnBvbGljeVZhbHVlO1xuXHRcdGlmIChwcml2YXRlTWFya2V0cGxhY2VVcmwpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdGxldCBsaW5rVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA/IGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkNvbnRhY3RTdXBwb3J0VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghbGlua1VyaSkge1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nc1F1ZXJ5ID0gYEBoYXNQb2xpY3kgJHtFeHRlbnNpb25HYWxsZXJ5U2VydmljZVVybENvbmZpZ0tleX1gO1xuXHRcdFx0XHRsaW5rVXJpID0gYGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JHtlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3NRdWVyeSkpfWA7XG5cdFx0XHRcdG1lc3NhZ2UuaXNUcnVzdGVkID0geyBlbmFibGVkQ29tbWFuZHM6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSB9O1xuXHRcdFx0fVxuXHRcdFx0bWVzc2FnZS5hcHBlbmRNYXJrZG93bihubHMubG9jYWxpemUoJ3ByaXZhdGVNYXJrZXRwbGFjZScsIFwiVGhpcyB3aW5kb3cgaXMgY29ubmVjdGVkIHRvIGEgW3ByaXZhdGUgZXh0ZW5zaW9uIG1hcmtldHBsYWNlXSh7MH0pIG1hbmFnZWQgYnkgeW91ciBvcmdhbml6YXRpb24uXCIsIGxpbmtVcmkpKTtcblx0XHRcdGNvbXB1dGVkTm90aWZpY2lhdGlvbnMucHVzaCh7XG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRleHRlbnNpb25zOiBbXSxcblx0XHRcdFx0a2V5OiBgcHJpdmF0ZU1hcmtldHBsYWNlOiR7aGFzaChwcml2YXRlTWFya2V0cGxhY2VVcmwpfToke2hhc2gobGlua1VyaSl9YCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wdXRlZE5vdGlmaWNpYXRpb25zO1xuXHR9XG5cblx0Z2V0RXh0ZW5zaW9uc05vdGlmaWNhdGlvbigpOiBJRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc05vdGlmaWNhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVF1ZXJ5VGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL0B3ZWIvZywgYHRhZzpcIiR7V0VCX0VYVEVOU0lPTl9UQUd9XCJgKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvblJlZ2V4ID0gL1xcYmV4dDooW15cXHNdKylcXGIvZztcblx0XHRpZiAoZXh0ZW5zaW9uUmVnZXgudGVzdCh0ZXh0KSkge1xuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZShleHRlbnNpb25SZWdleCwgKG0sIGV4dCkgPT4ge1xuXG5cdFx0XHRcdC8vIEdldCBjdXJhdGVkIGtleXdvcmRzXG5cdFx0XHRcdGNvbnN0IGxvb2t1cCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uS2V5d29yZHMgfHwge307XG5cdFx0XHRcdGNvbnN0IGtleXdvcmRzID0gbG9va3VwW2V4dF0gfHwgW107XG5cblx0XHRcdFx0Ly8gR2V0IG1vZGUgbmFtZVxuXHRcdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKFVSSS5maWxlKGAuJHtleHR9YCkpO1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZU5hbWUgPSBsYW5ndWFnZUlkICYmIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZUlkKTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VUYWcgPSBsYW5ndWFnZU5hbWUgPyBgIHRhZzpcIiR7bGFuZ3VhZ2VOYW1lfVwiYCA6ICcnO1xuXG5cdFx0XHRcdC8vIENvbnN0cnVjdCBhIHJpY2ggcXVlcnlcblx0XHRcdFx0cmV0dXJuIGB0YWc6XCJfX2V4dF8ke2V4dH1cIiB0YWc6XCJfX2V4dF8uJHtleHR9XCIgJHtrZXl3b3Jkcy5tYXAodGFnID0+IGB0YWc6XCIke3RhZ31cImApLmpvaW4oJyAnKX0ke2xhbmd1YWdlVGFnfSB0YWc6XCIke2V4dH1cImA7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQuc3Vic3RyKDAsIDM1MCk7XG5cdH1cblxuXHRwcml2YXRlIGZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0OiBJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCk6IElFeHRlbnNpb24ge1xuXHRcdGxldCBleHRlbnNpb24gPSB0aGlzLmdldEluc3RhbGxlZEV4dGVuc2lvbk1hdGNoaW5nR2FsbGVyeShnYWxsZXJ5KTtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0ZXh0ZW5zaW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb24sIGV4dCA9PiB0aGlzLmdldEV4dGVuc2lvblN0YXRlKGV4dCksIGV4dCA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0ZShleHQpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZ2FsbGVyeSwgdW5kZWZpbmVkKTtcblx0XHRcdCg8RXh0ZW5zaW9uPmV4dGVuc2lvbikuc2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdChleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5zdGFsbGVkRXh0ZW5zaW9uTWF0Y2hpbmdHYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uKTogSUV4dGVuc2lvbiB8IG51bGwge1xuXHRcdGZvciAoY29uc3QgaW5zdGFsbGVkIG9mIHRoaXMubG9jYWwpIHtcblx0XHRcdGlmIChpbnN0YWxsZWQuaWRlbnRpZmllci51dWlkKSB7IC8vIEluc3RhbGxlZCBmcm9tIEdhbGxlcnlcblx0XHRcdFx0aWYgKGluc3RhbGxlZC5pZGVudGlmaWVyLnV1aWQgPT09IGdhbGxlcnkuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbGxlZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpbnN0YWxsZWQubG9jYWw/LnNvdXJjZSAhPT0gJ3Jlc291cmNlJykge1xuXHRcdFx0XHRpZiAoYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGdhbGxlcnkuaWRlbnRpZmllcikpIHsgLy8gSW5zdGFsbGVkIGZyb20gb3RoZXIgc291cmNlc1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YWxsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGdldEluc3RhbGxlZEV4dGVuc2lvbk1hdGNoaW5nTG9jYXRpb24obG9jYXRpb246IFVSSSk6IElFeHRlbnNpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbC5maW5kKGUgPT4gZS5sb2NhbCAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KGxvY2F0aW9uLCBlLmxvY2FsPy5sb2NhdGlvbikpID8/IG51bGw7XG5cdH1cblxuXHRhc3luYyBvcGVuKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHN0cmluZywgb3B0aW9ucz86IElFeHRlbnNpb25FZGl0b3JPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiBleHRlbnNpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBpZCA9IGV4dGVuc2lvbjtcblx0XHRcdGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpID8/IChhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbiB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdH1cblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gbm90IGZvdW5kLiAke2V4dGVuc2lvbn1gKTtcblx0XHR9XG5cdFx0Y29uc3QgdXNlTW9kYWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdleHRlbnNpb25zLmFsbG93T3BlbkluTW9kYWxFZGl0b3InKTtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNJbnB1dCwgZXh0ZW5zaW9uKSwgb3B0aW9ucywgb3B0aW9ucz8uc2lkZUJ5c2lkZSA/IFNJREVfR1JPVVAgOiB1c2VNb2RhbCA/IE1PREFMX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5TZWFyY2goc2VhcmNoVmFsdWU6IHN0cmluZywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lciA9IChhd2FpdCB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihWSUVXTEVUX0lELCB0cnVlKSk/LmdldFZpZXdQYW5lQ29udGFpbmVyKCkgYXMgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIXZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlI29wZW5TZWFyY2g6IGV4dGVuc2lvbiB2aWV3IHBhbmUgY29udGFpbmVyIHdhcyBub3QgYXZhaWxhYmxlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZpZXdQYW5lQ29udGFpbmVyLnNlYXJjaChzZWFyY2hWYWx1ZSk7XG5cdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHR2aWV3UGFuZUNvbnRhaW5lci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGdldEV4dGVuc2lvblJ1bnRpbWVTdGF0dXMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogSUV4dGVuc2lvblJ1bnRpbWVTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTdGF0dXMgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uc1N0YXR1cygpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMoZXh0ZW5zaW9uc1N0YXR1cykpIHtcblx0XHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkge1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uc1N0YXR1c1tpZF07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucyhtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZXN0YXJ0JywgXCJDaGFuZ2luZyBleHRlbnNpb24gZW5hYmxlbWVudFwiKSwgYXV0bzogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9BZGQ6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgdG9SZW1vdmU6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBleHRlbnNpb25zVG9DaGVjayA9IFsuLi50aGlzLmxvY2FsXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zVG9DaGVjaykge1xuXHRcdFx0Y29uc3QgcnVudGltZVN0YXRlID0gZXh0ZW5zaW9uLnJ1bnRpbWVTdGF0ZTtcblx0XHRcdGlmICghcnVudGltZVN0YXRlIHx8IHJ1bnRpbWVTdGF0ZS5hY3Rpb24gIT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlc3RhcnRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdFx0dG9SZW1vdmUucHVzaChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0VuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChleHRlbnNpb24ubG9jYWwpO1xuXHRcdFx0aWYgKGlzRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0dG9SZW1vdmUucHVzaChydW5uaW5nRXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRvQWRkLnB1c2goZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRvUmVtb3ZlLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25zVG9DaGVjay5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGV4dGVuc2lvbi51dWlkIH0sIGUubG9jYWw/LmlkZW50aWZpZXIgPz8gZS5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgcnVubmluZyBidXQgZG9lc24ndCBleGlzdCBsb2NhbGx5LiBSZW1vdmUgaXQgZnJvbSBydW5uaW5nIGV4dGVuc2lvbnMuXG5cdFx0XHR0b1JlbW92ZS5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHR9XG5cblx0XHRpZiAodG9BZGQubGVuZ3RoIHx8IHRvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5zdG9wRXh0ZW5zaW9uSG9zdHMobWVzc2FnZSwgYXV0bykpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLnN0YXJ0RXh0ZW5zaW9uSG9zdHMoeyB0b0FkZCwgdG9SZW1vdmUgfSk7XG5cdFx0XHRcdGlmIChhdXRvKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uc0F1dG9SZXN0YXJ0JywgXCJFeHRlbnNpb25zIHdlcmUgYXV0byByZXN0YXJ0ZWQgdG8gZW5hYmxlIHVwZGF0ZXMuXCIpLFxuXHRcdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHR5cGUgRXh0ZW5zaW9uc0F1dG9SZXN0YXJ0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB3aGVuIGV4dGVuc2lvbnMgYXJlIGF1dG8gcmVzdGFydGVkJztcblx0XHRcdFx0XHRjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBleHRlbnNpb25zIGF1dG8gcmVzdGFydGVkJyB9O1xuXHRcdFx0XHRcdGF1dG86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSByZXN0YXJ0IHdhcyB0cmlnZ2VyZWQgYXV0b21hdGljYWxseScgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBFeHRlbnNpb25zQXV0b1Jlc3RhcnRFdmVudCA9IHtcblx0XHRcdFx0XHRjb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdGF1dG86IGJvb2xlYW47XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvbnNBdXRvUmVzdGFydEV2ZW50LCBFeHRlbnNpb25zQXV0b1Jlc3RhcnRDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnM6YXV0b3Jlc3RhcnQnLCB7IGNvdW50OiB0b0FkZC5sZW5ndGggKyB0b1JlbW92ZS5sZW5ndGgsIGF1dG8gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRSdW50aW1lU3RhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogRXh0ZW5zaW9uUnVudGltZVN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpc1VuaW5zdGFsbGVkID0gZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZDtcblx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdGNvbnN0IHJlbG9hZEFjdGlvbiA9IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA/IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdyA6IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlc3RhcnRFeHRlbnNpb25zO1xuXHRcdGNvbnN0IHJlbG9hZEFjdGlvbkxhYmVsID0gcmVsb2FkQWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3cgPyBubHMubG9jYWxpemUoJ3JlbG9hZCcsIFwicmVsb2FkIHdpbmRvd1wiKSA6IG5scy5sb2NhbGl6ZSgncmVzdGFydCBleHRlbnNpb25zJywgXCJyZXN0YXJ0IGV4dGVuc2lvbnNcIik7XG5cblx0XHRpZiAoaXNVbmluc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgY2FuUmVtb3ZlUnVubmluZ0V4dGVuc2lvbiA9IHJ1bm5pbmdFeHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmNhblJlbW92ZUV4dGVuc2lvbihydW5uaW5nRXh0ZW5zaW9uKTtcblx0XHRcdGNvbnN0IGlzU2FtZUV4dGVuc2lvblJ1bm5pbmcgPSBydW5uaW5nRXh0ZW5zaW9uXG5cdFx0XHRcdCYmICghZXh0ZW5zaW9uLnNlcnZlciB8fCBleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIodG9FeHRlbnNpb24ocnVubmluZ0V4dGVuc2lvbikpKVxuXHRcdFx0XHQmJiAoIWV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbiB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24ubG9jYXRpb24sIHJ1bm5pbmdFeHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24pKTtcblx0XHRcdGlmICghY2FuUmVtb3ZlUnVubmluZ0V4dGVuc2lvbiAmJiBpc1NhbWVFeHRlbnNpb25SdW5uaW5nICYmICFydW5uaW5nRXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudCkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IHJlbG9hZEFjdGlvbiwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RVbmluc3RhbGxUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGNvbXBsZXRlIHRoZSB1bmluc3RhbGxhdGlvbiBvZiB0aGlzIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRjb25zdCBpc1NhbWVFeHRlbnNpb25SdW5uaW5nID0gcnVubmluZ0V4dGVuc2lvbiAmJiBleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIodG9FeHRlbnNpb24ocnVubmluZ0V4dGVuc2lvbikpO1xuXHRcdFx0Y29uc3QgaXNFbmFibGVkID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0ZW5zaW9uLmxvY2FsKTtcblxuXHRcdFx0Ly8gRXh0ZW5zaW9uIGlzIHJ1bm5pbmdcblx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGlmIChpc0VuYWJsZWQpIHtcblx0XHRcdFx0XHQvLyBObyBSZWxvYWQgaXMgcmVxdWlyZWQgaWYgZXh0ZW5zaW9uIGNhbiBydW4gd2l0aG91dCByZWxvYWRcblx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25TZXJ2aWNlLmNhbkFkZEV4dGVuc2lvbih0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbi5sb2NhbCkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uU2VydmVyID0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmdFeHRlbnNpb24pKTtcblxuXHRcdFx0XHRcdGlmIChpc1NhbWVFeHRlbnNpb25SdW5uaW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBEaWZmZXJlbnQgdmVyc2lvbiBvciB0YXJnZXQgcGxhdGZvcm0gb2Ygc2FtZSBleHRlbnNpb24gaXMgcnVubmluZy4gUmVxdWlyZXMgcmVsb2FkIHRvIHJ1biB0aGUgY3VycmVudCB2ZXJzaW9uXG5cdFx0XHRcdFx0XHRpZiAoIXJ1bm5pbmdFeHRlbnNpb24uaXNVbmRlckRldmVsb3BtZW50ICYmIChleHRlbnNpb24udmVyc2lvbiAhPT0gcnVubmluZ0V4dGVuc2lvbi52ZXJzaW9uIHx8IGV4dGVuc2lvbi5sb2NhbC50YXJnZXRQbGF0Zm9ybSAhPT0gcnVubmluZ0V4dGVuc2lvbi50YXJnZXRQbGF0Zm9ybSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZHVjdEN1cnJlbnRWZXJzaW9uID0gdGhpcy5nZXRQcm9kdWN0Q3VycmVudFZlcnNpb24oKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZHVjdFVwZGF0ZVZlcnNpb24gPSB0aGlzLmdldFByb2R1Y3RVcGRhdGVWZXJzaW9uKCk7XG5cdFx0XHRcdFx0XHRcdGlmIChwcm9kdWN0VXBkYXRlVmVyc2lvblxuXHRcdFx0XHRcdFx0XHRcdCYmICFpc0VuZ2luZVZhbGlkKGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5lbmdpbmVzLnZzY29kZSwgcHJvZHVjdEN1cnJlbnRWZXJzaW9uLnZlcnNpb24sIHByb2R1Y3RDdXJyZW50VmVyc2lvbi5kYXRlKVxuXHRcdFx0XHRcdFx0XHRcdCYmIGlzRW5naW5lVmFsaWQoZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmVuZ2luZXMudnNjb2RlLCBwcm9kdWN0VXBkYXRlVmVyc2lvbi52ZXJzaW9uLCBwcm9kdWN0VXBkYXRlVmVyc2lvbi5kYXRlKVxuXHRcdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLkRvd25sb2FkVXBkYXRlLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdFVwZGF0ZURvd25sb2FkVG9vbHRpcCcsIFwiUGxlYXNlIHVwZGF0ZSB7MH0gdG8gZW5hYmxlIHRoZSB1cGRhdGVkIGV4dGVuc2lvbi5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykgfTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLkFwcGx5VXBkYXRlLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdFVwZGF0ZVVwZGF0ZVRvb2x0aXAnLCBcIlBsZWFzZSB1cGRhdGUgezB9IHRvIGVuYWJsZSB0aGUgdXBkYXRlZCBleHRlbnNpb24uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpIH07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuUmVhZHkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUXVpdEFuZEluc3RhbGwsIHJlYXNvbjogbmxzLmxvY2FsaXplKCdwb3N0VXBkYXRlUmVzdGFydFRvb2x0aXAnLCBcIlBsZWFzZSByZXN0YXJ0IHswfSB0byBlbmFibGUgdGhlIHVwZGF0ZWQgZXh0ZW5zaW9uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSB9O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdFVwZGF0ZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoZSB1cGRhdGVkIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnNTZXJ2ZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5PdGhlclNlcnZlciA9IHRoaXMuaW5zdGFsbGVkLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpICYmIGUuc2VydmVyICE9PSBleHRlbnNpb24uc2VydmVyKVswXTtcblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBUaGlzIGV4dGVuc2lvbiBwcmVmZXJzIHRvIHJ1biBvbiBVSS9Mb2NhbCBzaWRlIGJ1dCBpcyBydW5uaW5nIGluIHJlbW90ZVxuXHRcdFx0XHRcdFx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uU2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25VSShleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpICYmIGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiByZWxvYWRBY3Rpb24sIHJlYXNvbjogbmxzLmxvY2FsaXplKCdlbmFibGUgbG9jYWxseScsIFwiUGxlYXNlIHswfSB0byBlbmFibGUgdGhpcyBleHRlbnNpb24gbG9jYWxseS5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhpcyBleHRlbnNpb24gcHJlZmVycyB0byBydW4gb24gV29ya3NwYWNlL1JlbW90ZSBzaWRlIGJ1dCBpcyBydW5uaW5nIGluIGxvY2FsXG5cdFx0XHRcdFx0XHRcdFx0aWYgKHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkgJiYgZXh0ZW5zaW9uSW5PdGhlclNlcnZlci5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiByZWxvYWRBY3Rpb24sIHJlYXNvbjogbmxzLmxvY2FsaXplKCdlbmFibGUgcmVtb3RlJywgXCJQbGVhc2UgezB9IHRvIGVuYWJsZSB0aGlzIGV4dGVuc2lvbiBpbiB7MX0uXCIsIHJlbG9hZEFjdGlvbkxhYmVsLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXI/LmxhYmVsKSB9O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGlzIGV4dGVuc2lvbiBwcmVmZXJzIHRvIHJ1biBvbiBVSS9Mb2NhbCBzaWRlIGJ1dCBpcyBydW5uaW5nIGluIHJlbW90ZVxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25VSShleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiByZWxvYWRBY3Rpb24sIHJlYXNvbjogbmxzLmxvY2FsaXplKCdwb3N0RW5hYmxlVG9vbHRpcCcsIFwiUGxlYXNlIHswfSB0byBlbmFibGUgdGhpcyBleHRlbnNpb24uXCIsIHJlbG9hZEFjdGlvbkxhYmVsKSB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoaXMgZXh0ZW5zaW9uIHByZWZlcnMgdG8gcnVuIG9uIFdvcmtzcGFjZS9SZW1vdGUgc2lkZSBidXQgaXMgcnVubmluZyBpbiBsb2NhbFxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UoZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdEVuYWJsZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoaXMgZXh0ZW5zaW9uLlwiLCByZWxvYWRBY3Rpb25MYWJlbCkgfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChpc1NhbWVFeHRlbnNpb25SdW5uaW5nICYmICFydW5uaW5nRXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiByZWxvYWRBY3Rpb24sIHJlYXNvbjogbmxzLmxvY2FsaXplKCdwb3N0RGlzYWJsZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZGlzYWJsZSB0aGlzIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV4dGVuc2lvbiBpcyBub3QgcnVubmluZ1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGlmIChpc0VuYWJsZWQgJiYgIXRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5BZGRFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24ubG9jYWwpKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdEVuYWJsZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoaXMgZXh0ZW5zaW9uLlwiLCByZWxvYWRBY3Rpb25MYWJlbCkgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG90aGVyU2VydmVyID0gZXh0ZW5zaW9uLnNlcnZlciA/IGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID8gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIDogdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgOiBudWxsO1xuXHRcdFx0XHRpZiAob3RoZXJTZXJ2ZXIgJiYgZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5PdGhlclNlcnZlciA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgZS5zZXJ2ZXIgPT09IG90aGVyU2VydmVyKVswXTtcblx0XHRcdFx0XHQvLyBTYW1lIGV4dGVuc2lvbiBpbiBvdGhlciBzZXJ2ZXIgZXhpc3RzIGFuZFxuXHRcdFx0XHRcdGlmIChleHRlbnNpb25Jbk90aGVyU2VydmVyICYmIGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0ZW5zaW9uSW5PdGhlclNlcnZlci5sb2NhbCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdEVuYWJsZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoaXMgZXh0ZW5zaW9uLlwiLCByZWxvYWRBY3Rpb25MYWJlbCkgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJpbWFyeUV4dGVuc2lvbihleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBJRXh0ZW5zaW9uIHtcblx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25zWzBdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuYWJsZWRFeHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBlLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGUubG9jYWwpKTtcblx0XHRpZiAoZW5hYmxlZEV4dGVuc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gZW5hYmxlZEV4dGVuc2lvbnNbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQ2hvb3NlID0gZW5hYmxlZEV4dGVuc2lvbnMubGVuZ3RoID8gZW5hYmxlZEV4dGVuc2lvbnMgOiBleHRlbnNpb25zO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gZXh0ZW5zaW9uc1RvQ2hvb3NlLmZpbmQoZSA9PiBlLmxvY2FsICYmIGUubG9jYWwubWFuaWZlc3QpPy5sb2NhbD8ubWFuaWZlc3Q7XG5cblx0XHQvLyBNYW5pZmVzdCBpcyBub3QgZm91bmQgd2hpY2ggc2hvdWxkIG5vdCBoYXBwZW4uXG5cdFx0Ly8gSW4gd2hpY2ggY2FzZSByZXR1cm4gdGhlIGZpcnN0IGV4dGVuc2lvbi5cblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uc1RvQ2hvb3NlWzBdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmRzID0gdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXG5cdFx0bGV0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNUb0Nob29zZS5maW5kKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbktpbmQgb2YgZXh0ZW5zaW9uS2luZHMpIHtcblx0XHRcdFx0c3dpdGNoIChleHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSAndWknOlxuXHRcdFx0XHRcdFx0LyogVUkgZXh0ZW5zaW9uIGlzIGNob3NlbiBvbmx5IGlmIGl0IGlzIGluc3RhbGxlZCBsb2NhbGx5ICovXG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlJzpcblx0XHRcdFx0XHRcdC8qIENob29zZSByZW1vdGUgd29ya3NwYWNlIGV4dGVuc2lvbiBpZiBleGlzdHMgKi9cblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0Y2FzZSAnd2ViJzpcblx0XHRcdFx0XHRcdC8qIENob29zZSB3ZWIgZXh0ZW5zaW9uIGlmIGV4aXN0cyAqL1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCFleHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNUb0Nob29zZS5maW5kKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiBleHRlbnNpb25LaW5kcykge1xuXHRcdFx0XHRcdHN3aXRjaCAoZXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlJzpcblx0XHRcdFx0XHRcdFx0LyogQ2hvb3NlIGxvY2FsIHdvcmtzcGFjZSBleHRlbnNpb24gaWYgZXhpc3RzICovXG5cdFx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdGNhc2UgJ3dlYic6XG5cdFx0XHRcdFx0XHRcdC8qIENob29zZSBsb2NhbCB3ZWIgZXh0ZW5zaW9uIGlmIGV4aXN0cyAqL1xuXHRcdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uc1RvQ2hvb3NlLmZpbmQoZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25LaW5kIG9mIGV4dGVuc2lvbktpbmRzKSB7XG5cdFx0XHRcdFx0c3dpdGNoIChleHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlICd3ZWInOlxuXHRcdFx0XHRcdFx0XHQvKiBDaG9vc2Ugd2ViIGV4dGVuc2lvbiBpZiBleGlzdHMgKi9cblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25zVG9DaG9vc2UuZmluZChleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbktpbmQgb2YgZXh0ZW5zaW9uS2luZHMpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ3dlYic6XG5cdFx0XHRcdFx0XHRcdC8qIENob29zZSByZW1vdGUgd2ViIGV4dGVuc2lvbiBpZiBleGlzdHMgKi9cblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbiB8fCBleHRlbnNpb25zWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb246IEV4dGVuc2lvbik6IEV4dGVuc2lvblN0YXRlIHtcblx0XHRpZiAodGhpcy5pbnN0YWxsaW5nLnNvbWUoaSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiAoIWV4dGVuc2lvbi5zZXJ2ZXIgfHwgaS5zZXJ2ZXIgPT09IGV4dGVuc2lvbi5zZXJ2ZXIpKSkge1xuXHRcdFx0cmV0dXJuIEV4dGVuc2lvblN0YXRlLkluc3RhbGxpbmc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5yZW1vdGVFeHRlbnNpb25zLmdldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMud2ViRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLndlYkV4dGVuc2lvbnMuZ2V0RXh0ZW5zaW9uU3RhdGUoZXh0ZW5zaW9uKTtcblx0XHRcdGlmIChzdGF0ZSAhPT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5sb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvY2FsRXh0ZW5zaW9ucy5nZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdH1cblxuXHRhc3luYyBjaGVja0ZvclVwZGF0ZXMocmVhc29uPzogc3RyaW5nLCBvbmx5QnVpbHRpbj86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtFeHRlbnNpb25zXTogQ2hlY2tpbmcgZm9yIHVwZGF0ZXMuIFJlYXNvbjogJHtyZWFzb259YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0V4dGVuc2lvbnNdOiBDaGVja2luZyBmb3IgdXBkYXRlc2ApO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9uczogRXh0ZW5zaW9uc1tdID0gW107XG5cdFx0aWYgKHRoaXMubG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnB1c2godGhpcy5sb2NhbEV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnB1c2godGhpcy5yZW1vdGVFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMud2ViRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRoaXMud2ViRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICghZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5mb3M6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbGxlZCBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRpZiAob25seUJ1aWx0aW4gJiYgIWluc3RhbGxlZC5pc0J1aWx0aW4pIHtcblx0XHRcdFx0Ly8gU2tpcCBpZiBjaGVjayB1cGRhdGVzIG9ubHkgZm9yIGJ1aWx0aW4gZXh0ZW5zaW9ucyBhbmQgY3VycmVudCBleHRlbnNpb24gaXMgbm90IGJ1aWx0aW4uXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpbnN0YWxsZWQubG9jYWw/LmZvcmNlQXV0b1VwZGF0ZSAmJiBpbnN0YWxsZWQuaXNCdWlsdGluICYmICFpbnN0YWxsZWQubG9jYWw/LnBpbm5lZCAmJiAoaW5zdGFsbGVkLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtIHx8ICFpbnN0YWxsZWQubG9jYWw/LmlkZW50aWZpZXIudXVpZCkpIHtcblx0XHRcdFx0Ly8gU2tpcCBjaGVja2luZyB1cGRhdGVzIGZvciBhIGJ1aWx0aW4gZXh0ZW5zaW9uIGlmIGl0IGlzIGEgc3lzdGVtIGV4dGVuc2lvbiBvciBpZiBpdCBkb2VzIG5vdCBoYXZlIGEgTWFya2V0cGxhY2UgaWRlbnRpZmllclxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpbnN0YWxsZWQubG9jYWw/LnNvdXJjZSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGluZm9zLnB1c2goeyAuLi5pbnN0YWxsZWQuaWRlbnRpZmllciwgcHJlUmVsZWFzZTogISFpbnN0YWxsZWQubG9jYWw/LnByZVJlbGVhc2UsIGN1cnJlbnRWZXJzaW9uOiBpbnN0YWxsZWQuaXNCdWlsdGluID8gaW5zdGFsbGVkLnZlcnNpb24gOiB1bmRlZmluZWQgfSk7XG5cdFx0fVxuXHRcdGlmIChpbmZvcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gYXdhaXQgZXh0ZW5zaW9uc1swXS5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VVcGRhdGVzQ2hlY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBhIHJlcXVlc3QgaXMgbWFkZSB0byBjaGVjayBmb3IgdXBkYXRlcyBvZiBleHRlbnNpb25zJztcblx0XHRcdFx0Y291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9ucyB0byBjaGVjayB1cGRhdGUnIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZVVwZGF0ZXNDaGVja0V2ZW50ID0ge1xuXHRcdFx0XHRjb3VudDogbnVtYmVyO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlVXBkYXRlc0NoZWNrRXZlbnQsIEdhbGxlcnlTZXJ2aWNlVXBkYXRlc0NoZWNrQ2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTpjaGVja2luZ0ZvclVwZGF0ZXMnLCB7XG5cdFx0XHRcdGNvdW50OiBpbmZvcy5sZW5ndGgsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hlY2tpbmcgdXBkYXRlcyBmb3IgZXh0ZW5zaW9uc2AsIGluZm9zLm1hcChlID0+IGUuaWQpLmpvaW4oJywgJykpO1xuXHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoaW5mb3MsIHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGU6IHRydWUsIHByb2R1Y3RWZXJzaW9uOiB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoZ2FsbGVyeUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9ucywgaW5mb3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUFsbCgpOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4ge1xuXHRcdGNvbnN0IHRvVXBkYXRlOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0dGhpcy5vdXRkYXRlZC5mb3JFYWNoKChleHRlbnNpb24pID0+IHtcblx0XHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0XHR0b1VwZGF0ZS5wdXNoKHtcblx0XHRcdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbi5nYWxsZXJ5LFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUsXG5cdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IGV4dGVuc2lvbi5sb2NhbD8uaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSxcblx0XHRcdFx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQ6IGV4dGVuc2lvbi5sb2NhbD8uaXNBcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyh0b1VwZGF0ZSk7XG5cdH1cblxuXHRhc3luYyBkb3dubG9hZFZTSVgoZXh0ZW5zaW9uSWQ6IHN0cmluZywgdmVyc2lvbktpbmQ6ICdwcmVyZWxlYXNlJyB8ICdyZWxlYXNlJyB8ICdhbnknKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHZlcnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodmVyc2lvbktpbmQgPT09ICdhbnknKSB7XG5cdFx0XHR2ZXJzaW9uID0gYXdhaXQgdGhpcy5waWNrVmVyc2lvblRvRG93bmxvYWQoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKCF2ZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JbmZvID0gdmVyc2lvbiA/IHsgaWQ6IGV4dGVuc2lvbklkLCB2ZXJzaW9uOiB2ZXJzaW9uLnZlcnNpb24gfSA6IHsgaWQ6IGV4dGVuc2lvbklkLCBwcmVSZWxlYXNlOiB2ZXJzaW9uS2luZCA9PT0gJ3ByZXJlbGVhc2UnIH07XG5cdFx0Y29uc3QgcXVlcnlPcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zID0gdmVyc2lvbiA/IHt9IDogeyBjb21wYXRpYmxlOiB0cnVlIH07XG5cblx0XHRsZXQgW2dhbGxlcnlFeHRlbnNpb25dID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFtleHRlbnNpb25JbmZvXSwgcXVlcnlPcHRpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIWdhbGxlcnlFeHRlbnNpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2V4dGVuc2lvbiBub3QgZm91bmQnLCBcIkV4dGVuc2lvbiAnezB9JyBub3QgZm91bmQuXCIsIGV4dGVuc2lvbklkKSk7XG5cdFx0fVxuXG5cdFx0bGV0IHRhcmdldFBsYXRmb3JtID0gZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRhcmdldFBsYXRmb3JtIG9mIHZlcnNpb24/LnRhcmdldFBsYXRmb3JtcyA/PyBnYWxsZXJ5RXh0ZW5zaW9uLmFsbFRhcmdldFBsYXRmb3Jtcykge1xuXHRcdFx0aWYgKHRhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOICYmIHRhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5VTklWRVJTQUwpIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogdGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRCA/IG5scy5sb2NhbGl6ZSgnYWxscGxhdGZvcm1zJywgXCJBbGwgUGxhdGZvcm1zXCIpIDogVGFyZ2V0UGxhdGZvcm1Ub1N0cmluZyh0YXJnZXRQbGF0Zm9ybSksXG5cdFx0XHRcdFx0aWQ6IHRhcmdldFBsYXRmb3JtXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdwbGF0Zm9ybSBwbGFjZWhvbGRlcicsIFwiUGxlYXNlIHNlbGVjdCB0aGUgcGxhdGZvcm0gZm9yIHdoaWNoIHlvdSB3YW50IHRvIGRvd25sb2FkIHRoZSBWU0lYXCIpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKG9wdGlvbnMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSwgeyBwbGFjZUhvbGRlcjogbWVzc2FnZSB9KTtcblx0XHRcdGlmICghb3B0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRhcmdldFBsYXRmb3JtID0gb3B0aW9uLmlkO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXRQbGF0Zm9ybSAhPT0gZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtKSB7XG5cdFx0XHRbZ2FsbGVyeUV4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW2V4dGVuc2lvbkluZm9dLCB7IC4uLnF1ZXJ5T3B0aW9ucywgdGFyZ2V0UGxhdGZvcm0gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdkb3dubG9hZCB0aXRsZScsIFwiU2VsZWN0IGZvbGRlciB0byBkb3dubG9hZCB0aGUgVlNJWFwiKSxcblx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdG9wZW5MYWJlbDogbmxzLmxvY2FsaXplKCdkb3dubG9hZCcsIFwiRG93bmxvYWRcIiksXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdD8uWzBdKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uIH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZG93bmxvYWRpbmcuLi4nLCBcIkRvd25sb2FkaW5nIFZTSVguLi5cIikgfSk7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBgJHtnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9LSR7Z2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9ufSR7dGFyZ2V0UGxhdGZvcm0gIT09IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRCAmJiB0YXJnZXRQbGF0Zm9ybSAhPT0gVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMICYmIHRhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOID8gYC0ke3RhcmdldFBsYXRmb3JtfWAgOiAnJ30udnNpeGA7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZG93bmxvYWQoZ2FsbGVyeUV4dGVuc2lvbiwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHJlc3VsdFswXSwgbmFtZSksIEluc3RhbGxPcGVyYXRpb24uTm9uZSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgnZG93bmxvYWQuY29tcGxldGVkJywgXCJTdWNjZXNzZnVsbHkgZG93bmxvYWRlZCB0aGUgVlNJWFwiKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdkb3dubG9hZC5mYWlsZWQnLCBcIkVycm9yIHdoaWxlIGRvd25sb2FkaW5nIHRoZSBWU0lYOiB7MH1cIiwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrVmVyc2lvblRvRG93bmxvYWQoZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWxsVmVyc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEFsbFZlcnNpb25zKHsgaWQ6IGV4dGVuc2lvbklkIH0pO1xuXHRcdGlmICghYWxsVmVyc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhubHMubG9jYWxpemUoJ25vIHZlcnNpb25zJywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgbm8gb3RoZXIgdmVyc2lvbnMuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrcyA9IGFsbFZlcnNpb25zLm1hcCgodiwgaSkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHYudmVyc2lvbixcblx0XHRcdFx0bGFiZWw6IHYudmVyc2lvbixcblx0XHRcdFx0ZGVzY3JpcHRpb246IGAke2Zyb21Ob3cobmV3IERhdGUoRGF0ZS5wYXJzZSh2LmRhdGUpKSwgdHJ1ZSl9JHt2LmlzUHJlUmVsZWFzZVZlcnNpb24gPyBgICgke25scy5sb2NhbGl6ZSgncHJlLXJlbGVhc2UnLCBcInByZS1yZWxlYXNlXCIpfSlgIDogJyd9YCxcblx0XHRcdFx0YXJpYUxhYmVsOiBgJHt2LmlzUHJlUmVsZWFzZVZlcnNpb24gPyAnUHJlLVJlbGVhc2UgdmVyc2lvbicgOiAnUmVsZWFzZSB2ZXJzaW9uJ30gJHt2LnZlcnNpb259YCxcblx0XHRcdFx0ZGF0YTogdixcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcyxcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0VmVyc2lvbicsIFwiU2VsZWN0IFZlcnNpb24gdG8gRG93bmxvYWRcIiksXG5cdFx0XHRcdG1hdGNoT25EZXRhaWw6IHRydWVcblx0XHRcdH0pO1xuXHRcdHJldHVybiBwaWNrPy5kYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzeW5jSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uW10sIGZsYWdFeHRlbnNpb25zTWlzc2luZ0Zyb21HYWxsZXJ5PzogSUV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IEV4dGVuc2lvbnNbXSA9IFtdO1xuXHRcdGlmICh0aGlzLmxvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRoaXMubG9jYWxFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRoaXMucmVtb3RlRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndlYkV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLndlYkV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAoIWV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleHRlbnNpb25zLm1hcChleHRlbnNpb25zID0+IGV4dGVuc2lvbnMuc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShnYWxsZXJ5LCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCksIGZsYWdFeHRlbnNpb25zTWlzc2luZ0Zyb21HYWxsZXJ5KSkpO1xuXHRcdGlmICh0aGlzLm91dGRhdGVkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEF1dG8gdXBkYXRpbmcgb3V0ZGF0ZWQgZXh0ZW5zaW9ucy5gLCB0aGlzLm91dGRhdGVkLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkuam9pbignLCAnKSk7XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlBdXRvVXBkYXRlRXh0ZW5zaW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBdXRvQ2hlY2tVcGRhdGVzQ29uZmlndXJhdGlvbktleSk7XG5cdH1cblxuXHRwcml2YXRlIGV2ZW50dWFsbHlDaGVja0ZvclVwZGF0ZXMoaW1tZWRpYXRlID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZXNDaGVja0RlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy51cGRhdGVzQ2hlY2tEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JVcGRhdGVzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlDaGVja0ZvclVwZGF0ZXMoKTtcblx0XHR9LCBpbW1lZGlhdGUgPyAwIDogdGhpcy5nZXRVcGRhdGVzQ2hlY2tJbnRlcnZhbCgpKS50aGVuKHVuZGVmaW5lZCwgZXJyID0+IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcGRhdGVzQ2hlY2tJbnRlcnZhbCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdpbnNpZGVyJyAmJiB0aGlzLmdldFByb2R1Y3RVcGRhdGVWZXJzaW9uKCkpIHtcblx0XHRcdHJldHVybiAxMDAwICogNjAgKiA2MCAqIDE7IC8vIDEgaG91clxuXHRcdH1cblx0XHRyZXR1cm4gRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuVXBkYXRlc0NoZWNrSW50ZXJ2YWw7XG5cdH1cblxuXHRwcml2YXRlIGV2ZW50dWFsbHlBdXRvVXBkYXRlRXh0ZW5zaW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLmF1dG9VcGRhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5hdXRvVXBkYXRlRXh0ZW5zaW9ucygpKVxuXHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gbnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGF1dG9VcGRhdGVCdWlsdGluRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmNoZWNrRm9yVXBkYXRlcyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IHRvVXBkYXRlID0gdGhpcy5vdXRkYXRlZC5maWx0ZXIoZSA9PiBlLmlzQnVpbHRpbik7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0b1VwZGF0ZS5tYXAoZSA9PiB0aGlzLmluc3RhbGwoZSwgZS5sb2NhbD8ucHJlUmVsZWFzZSA/IHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0cnVlIH0gOiB1bmRlZmluZWQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmNQaW5uZWRCdWlsdGluRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmZvczogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaW5zdGFsbGVkIG9mIHRoaXMubG9jYWwpIHtcblx0XHRcdGlmIChpbnN0YWxsZWQuaXNCdWlsdGluICYmIGluc3RhbGxlZC5sb2NhbD8ucGlubmVkICYmIGluc3RhbGxlZC5sb2NhbD8uaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdGluZm9zLnB1c2goeyAuLi5pbnN0YWxsZWQuaWRlbnRpZmllciwgdmVyc2lvbjogaW5zdGFsbGVkLnZlcnNpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpbmZvcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGluZm9zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChnYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zeW5jSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGF1dG9VcGRhdGVFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLm1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5pc0Nvbm5lY3Rpb25NZXRlcmVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tFeHRlbnNpb25zXTogU2tpcHBpbmcgYXV0by11cGRhdGUgYmVjYXVzZSBjb25uZWN0aW9uIGlzIG1ldGVyZWQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b1VwZGF0ZTogSUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgZGlzYWJsZWRBdXRvVXBkYXRlID0gW107XG5cdFx0Y29uc3QgY29uc2VudFJlcXVpcmVkID0gW107XG5cdFx0bGV0IHNvb25lc3REZWxheVJlbWFpbmluZyA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMub3V0ZGF0ZWQpIHtcblx0XHRcdGlmICghdGhpcy5zaG91bGRBdXRvVXBkYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0ZGlzYWJsZWRBdXRvVXBkYXRlLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIE5ldyB2ZXJzaW9ucyBhcmUgYXV0byB1cGRhdGVkIG9ubHkgYWZ0ZXIgdGhlIGRlbGF5IHdpbmRvdyBoYXMgcGFzc2VkIHNpbmNlIHRoZXkgd2VyZSBwdWJsaXNoZWQuXG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbD8uZm9yY2VBdXRvVXBkYXRlKSB7XG5cdFx0XHRcdGNvbnN0IGRlbGF5UmVtYWluaW5nID0gdGhpcy5nZXRBdXRvVXBkYXRlRGVsYXlSZW1haW5pbmcoZXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKGRlbGF5UmVtYWluaW5nID4gMCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQXV0byB1cGRhdGUgZGVsYXllZCBmb3IgZXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdHNvb25lc3REZWxheVJlbWFpbmluZyA9IE1hdGgubWluKHNvb25lc3REZWxheVJlbWFpbmluZywgZGVsYXlSZW1haW5pbmcpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5zaG91bGRSZXF1aXJlQ29uc2VudFRvVXBkYXRlKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0Y29uc2VudFJlcXVpcmVkLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRvVXBkYXRlLnB1c2goZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHRpZiAoc29vbmVzdERlbGF5UmVtYWluaW5nIDwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcblx0XHRcdHRoaXMuZGVsYXllZEF1dG9VcGRhdGVDaGVja1RpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gdGhpcy5ldmVudHVhbGx5Q2hlY2tGb3JVcGRhdGVzKHRydWUpLCBzb29uZXN0RGVsYXlSZW1haW5pbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRlbGF5ZWRBdXRvVXBkYXRlQ2hlY2tUaW1lci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoZGlzYWJsZWRBdXRvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdBdXRvIHVwZGF0ZSBkaXNhYmxlZCBmb3IgZXh0ZW5zaW9ucycsIGRpc2FibGVkQXV0b1VwZGF0ZS5qb2luKCcsICcpKTtcblx0XHR9XG5cblx0XHRpZiAoY29uc2VudFJlcXVpcmVkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0F1dG8gdXBkYXRlIGNvbnNlbnQgcmVxdWlyZWQgZm9yIGV4dGVuc2lvbnMnLCBjb25zZW50UmVxdWlyZWQuam9pbignLCAnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0b1VwZGF0ZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9kdWN0VmVyc2lvbiA9IHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKTtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHRvVXBkYXRlLm1hcChlID0+IHRoaXMuaW5zdGFsbChlLCBlLmxvY2FsPy5wcmVSZWxlYXNlID8geyBpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IHRydWUsIHByb2R1Y3RWZXJzaW9uIH0gOiB7IHByb2R1Y3RWZXJzaW9uIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2R1Y3RWZXJzaW9uKCk6IElQcm9kdWN0VmVyc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UHJvZHVjdFVwZGF0ZVZlcnNpb24oKSA/PyB0aGlzLmdldFByb2R1Y3RDdXJyZW50VmVyc2lvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0Q3VycmVudFZlcnNpb24oKTogSVByb2R1Y3RWZXJzaW9uIHtcblx0XHRyZXR1cm4geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0VXBkYXRlVmVyc2lvbigpOiBJUHJvZHVjdFZlcnNpb24gfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlVwZGF0aW5nOlxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuUmVhZHk6IHtcblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS51cGRhdGUucHJvZHVjdFZlcnNpb247XG5cdFx0XHRcdGlmICh2ZXJzaW9uICYmIHNlbXZlci52YWxpZCh2ZXJzaW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHZlcnNpb24sIGRhdGU6IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS51cGRhdGUudGltZXN0YW1wID8gbmV3IERhdGUodGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnVwZGF0ZS50aW1lc3RhbXApLnRvSVNPU3RyaW5nKCkgOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRBdXRvVXBkYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvPy5kaXNhbGxvd0luc3RhbGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsPy5mb3JjZUF1dG9VcGRhdGUpIHtcblx0XHRcdC8vIEV4dGVuc2lvbnMgbWFya2VkIGZvciBhdXRvLXVwZGF0ZSBhcmUgYWx3YXlzIGF1dG8tdXBkYXRlZFxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b1VwZGF0ZVZhbHVlID0gdGhpcy5nZXRBdXRvVXBkYXRlVmFsdWUoKTtcblxuXHRcdGlmIChhdXRvVXBkYXRlVmFsdWUgPT09ICdvZmYnKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zVG9BdXRvVXBkYXRlID0gdGhpcy5nZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChleHRlbnNpb25zVG9BdXRvVXBkYXRlLmluY2x1ZGVzKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3JQdWJsaXNoZXIoZXh0ZW5zaW9uLnB1Ymxpc2hlcikgJiYgIWV4dGVuc2lvbnNUb0F1dG9VcGRhdGUuaW5jbHVkZXMoYC0ke2V4dGVuc2lvbklkfWApKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24ucGlubmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyA9IHRoaXMuZ2V0RGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucygpO1xuXHRcdGlmIChkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluY2x1ZGVzKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQXV0by11cGRhdGUgaXMgb247IG9ubHkgdXBkYXRlIGVuYWJsZWQgZXh0ZW5zaW9ucy5cblx0XHRyZXR1cm4gZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkgJiYgZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlO1xuXHR9XG5cblx0YXN5bmMgc2hvdWxkUmVxdWlyZUNvbnNlbnRUb1VwZGF0ZShleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghZXh0ZW5zaW9uLm91dGRhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRlbnNpb24uZ2FsbGVyeSB8fCAhZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5sb2NhbC5pZGVudGlmaWVyLnV1aWQgJiYgZXh0ZW5zaW9uLmxvY2FsLmlkZW50aWZpZXIudXVpZCAhPT0gZXh0ZW5zaW9uLmdhbGxlcnkuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25zZW50UmVxdWlyZWRUb1VwZGF0ZVJlcHVibGlzaGVkRXh0ZW5zaW9uJywgXCJUaGUgbWFya2V0cGxhY2UgbWV0YWRhdGEgb2YgdGhpcyBleHRlbnNpb24gY2hhbmdlZCwgbGlrZWx5IGR1ZSB0byBhIHJlLXB1Ymxpc2guXCIpO1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmVuZ2luZXMudnNjb2RlIHx8IGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5tYWluIHx8IGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5icm93c2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzRGVmaW5lZChleHRlbnNpb24uZ2FsbGVyeS5wcm9wZXJ0aWVzPy5leGVjdXRlc0NvZGUpKSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5LnByb3BlcnRpZXMuZXhlY3V0ZXNDb2RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBleHRlbnNpb24gaW5zdGFuY2VvZiBFeHRlbnNpb25cblx0XHRcdFx0PyBhd2FpdCBleHRlbnNpb24uZ2V0R2FsbGVyeU1hbmlmZXN0KClcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbi5nYWxsZXJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmICghbWFuaWZlc3Q/Lm1haW4gJiYgIW1hbmlmZXN0Py5icm93c2VyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25zZW50UmVxdWlyZWRUb1VwZGF0ZScsIFwiVGhlIHVwZGF0ZSBmb3IgezB9IGV4dGVuc2lvbiBpbnRyb2R1Y2VzIGV4ZWN1dGFibGUgY29kZSwgd2hpY2ggaXMgbm90IHByZXNlbnQgaW4gdGhlIGN1cnJlbnRseSBpbnN0YWxsZWQgdmVyc2lvbi5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdGlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IoZXh0ZW5zaW9uT3JQdWJsaXNoZXI6IElFeHRlbnNpb24gfCBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoaXNTdHJpbmcoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRpZiAoRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVgudGVzdChleHRlbnNpb25PclB1Ymxpc2hlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBwdWJsaXNoZXIgc3RyaW5nLCBmb3VuZCBleHRlbnNpb24gaWRlbnRpZmllcicpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaXNBdXRvVXBkYXRlRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuaXNBdXRvVXBkYXRlRW5hYmxlZEZvclB1Ymxpc2hlcihleHRlbnNpb25PclB1Ymxpc2hlcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNob3VsZEF1dG9VcGRhdGVFeHRlbnNpb24oZXh0ZW5zaW9uT3JQdWJsaXNoZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0F1dG9VcGRhdGVFbmFibGVkRm9yUHVibGlzaGVyKHB1Ymxpc2hlcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHVibGlzaGVyc1RvQXV0b1VwZGF0ZSA9IHRoaXMuZ2V0UHVibGlzaGVyc1RvQXV0b1VwZGF0ZSgpO1xuXHRcdHJldHVybiBwdWJsaXNoZXJzVG9BdXRvVXBkYXRlLmluY2x1ZGVzKHB1Ymxpc2hlci50b0xvd2VyQ2FzZSgpKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUF1dG9VcGRhdGVFbmFibGVtZW50Rm9yKGV4dGVuc2lvbk9yUHVibGlzaGVyOiBJRXh0ZW5zaW9uIHwgc3RyaW5nLCBlbmFibGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCkpIHtcblx0XHRcdGlmIChpc1N0cmluZyhleHRlbnNpb25PclB1Ymxpc2hlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBleHRlbnNpb24sIGZvdW5kIHB1Ymxpc2hlciBzdHJpbmcnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMgPSB0aGlzLmdldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZXh0ZW5zaW9uT3JQdWJsaXNoZXIuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5kZXggPSBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluZGV4T2YoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0ZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5zcGxpY2UoZXh0ZW5zaW9uSW5kZXgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMucHVzaChleHRlbnNpb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKTtcblx0XHRcdGlmIChlbmFibGUgJiYgZXh0ZW5zaW9uT3JQdWJsaXNoZXIubG9jYWwgJiYgZXh0ZW5zaW9uT3JQdWJsaXNoZXIucGlubmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uT3JQdWJsaXNoZXIubG9jYWwsIHsgcGlubmVkOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zID0gdGhpcy5nZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHRcdGlmIChpc1N0cmluZyhleHRlbnNpb25PclB1Ymxpc2hlcikpIHtcblx0XHRcdFx0aWYgKEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYLnRlc3QoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBwdWJsaXNoZXIgc3RyaW5nLCBmb3VuZCBleHRlbnNpb24gaWRlbnRpZmllcicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dGVuc2lvbk9yUHVibGlzaGVyID0gZXh0ZW5zaW9uT3JQdWJsaXNoZXIudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0aWYgKHRoaXMuaXNBdXRvVXBkYXRlRW5hYmxlZEZvcihleHRlbnNpb25PclB1Ymxpc2hlcikgIT09IGVuYWJsZSkge1xuXHRcdFx0XHRcdGlmIChlbmFibGUpIHtcblx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbk9yUHVibGlzaGVyKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmNsdWRlcyhleHRlbnNpb25PclB1Ymxpc2hlcikpIHtcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLnNwbGljZShlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5kZXhPZihleHRlbnNpb25PclB1Ymxpc2hlciksIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy5pbnN0YWxsZWQpIHtcblx0XHRcdFx0XHRpZiAoZS5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKSA9PT0gZXh0ZW5zaW9uT3JQdWJsaXNoZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGV4dGVuc2lvbk9yUHVibGlzaGVyLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgZW5hYmxlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXIgPSB0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IoZXh0ZW5zaW9uT3JQdWJsaXNoZXIucHVibGlzaGVyLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRjb25zdCBlbmFibGVBdXRvVXBkYXRlc0ZvckV4dGVuc2lvbiA9IGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmNsdWRlcyhleHRlbnNpb25JZCk7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVBdXRvVXBkYXRlc0ZvckV4dGVuc2lvbiA9IGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmNsdWRlcyhgLSR7ZXh0ZW5zaW9uSWR9YCk7XG5cblx0XHRcdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0XHRcdGlmIChkaXNhYmxlQXV0b1VwZGF0ZXNGb3JFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5zcGxpY2UoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluZGV4T2YoYC0ke2V4dGVuc2lvbklkfWApLCAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVuYWJsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyKSB7XG5cdFx0XHRcdFx0XHRpZiAoZW5hYmxlQXV0b1VwZGF0ZXNGb3JFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLnNwbGljZShlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5kZXhPZihleHRlbnNpb25JZCksIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoIWVuYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRGlzYWJsZSBBdXRvIFVwZGF0ZXNcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGVuYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuc3BsaWNlKGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmRleE9mKGV4dGVuc2lvbklkKSwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmFibGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlcikge1xuXHRcdFx0XHRcdFx0aWYgKCFkaXNhYmxlQXV0b1VwZGF0ZXNGb3JFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLnB1c2goYC0ke2V4dGVuc2lvbklkfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoZGlzYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5zcGxpY2UoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluZGV4T2YoYC0ke2V4dGVuc2lvbklkfWApLCAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKTtcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShleHRlbnNpb25PclB1Ymxpc2hlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0dGhpcy5hdXRvVXBkYXRlRXh0ZW5zaW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRTZWxlY3RlZEV4dGVuc2lvblRvQXV0b1VwZGF0ZVZhbHVlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmIChcblx0XHRcdHRoaXMuZW5hYmxlZEF1b3RVcGRhdGVFeHRlbnNpb25zVmFsdWUgIT09IHRoaXMuZ2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKSAvKiBUaGlzIGNoZWNrcyBpZiBjdXJyZW50IHdpbmRvdyBjaGFuZ2VkIHRoZSB2YWx1ZSBvciBub3QgKi9cblx0XHRcdHx8IHRoaXMuZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlICE9PSB0aGlzLmdldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSgpIC8qIFRoaXMgY2hlY2tzIGlmIGN1cnJlbnQgd2luZG93IGNoYW5nZWQgdGhlIHZhbHVlIG9yIG5vdCAqL1xuXHRcdCkge1xuXHRcdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiAhZS5pc0J1aWx0aW4pO1xuXHRcdFx0Y29uc3QgZ3JvdXBCeSA9IChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBJRXh0ZW5zaW9uW11bXSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEF1dG9VcGRhdGU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzaG91bGROb3RBdXRvVXBkYXRlOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmICh0aGlzLnNob3VsZEF1dG9VcGRhdGVFeHRlbnNpb24oZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkQXV0b1VwZGF0ZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNob3VsZE5vdEF1dG9VcGRhdGUucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW3Nob3VsZEF1dG9VcGRhdGUsIHNob3VsZE5vdEF1dG9VcGRhdGVdO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgW3dhc1Nob3VsZEF1dG9VcGRhdGUsIHdhc1Nob3VsZE5vdEF1dG9VcGRhdGVdID0gZ3JvdXBCeSh1c2VyRXh0ZW5zaW9ucyk7XG5cdFx0XHR0aGlzLl9lbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IFtzaG91bGRBdXRvVXBkYXRlLCBzaG91bGROb3RBdXRvVXBkYXRlXSA9IGdyb3VwQnkodXNlckV4dGVuc2lvbnMpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGUgb2Ygd2FzU2hvdWxkQXV0b1VwZGF0ZSA/PyBbXSkge1xuXHRcdFx0XHRpZiAoc2hvdWxkTm90QXV0b1VwZGF0ZT8uaW5jbHVkZXMoZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGUgb2Ygd2FzU2hvdWxkTm90QXV0b1VwZGF0ZSA/PyBbXSkge1xuXHRcdFx0XHRpZiAoc2hvdWxkQXV0b1VwZGF0ZT8uaW5jbHVkZXMoZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2FuSW5zdGFsbChleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRpZiAoIShleHRlbnNpb24gaW5zdGFuY2VvZiBFeHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ25vdCBhbiBleHRlbnNpb24nLCBcIlRoZSBwcm92aWRlZCBvYmplY3QgaXMgbm90IGFuIGV4dGVuc2lvbi5cIikpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24uaXNNYWxpY2lvdXMpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSgnbWFsaWNpb3VzJywgXCJUaGlzIGV4dGVuc2lvbiBpcyByZXBvcnRlZCB0byBiZSBwcm9ibGVtYXRpYy5cIikpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvPy5kaXNhbGxvd0luc3RhbGwpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSgnZGlzYWxsb3dlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWxsb3dlZCB0byBiZSBpbnN0YWxsZWQuXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkuaXNTaWduZWQgJiYgc2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IoZXh0ZW5zaW9uLnByaXZhdGUsIGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKSkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKCdub3Qgc2lnbmVkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBub3Qgc2lnbmVkLlwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2FsUmVzdWx0ID0gdGhpcy5sb2NhbEV4dGVuc2lvbnMgPyBhd2FpdCB0aGlzLmxvY2FsRXh0ZW5zaW9ucy5jYW5JbnN0YWxsKGV4dGVuc2lvbi5nYWxsZXJ5KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsb2NhbFJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVtb3RlUmVzdWx0ID0gdGhpcy5yZW1vdGVFeHRlbnNpb25zID8gYXdhaXQgdGhpcy5yZW1vdGVFeHRlbnNpb25zLmNhbkluc3RhbGwoZXh0ZW5zaW9uLmdhbGxlcnkpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHJlbW90ZVJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2ViUmVzdWx0ID0gdGhpcy53ZWJFeHRlbnNpb25zID8gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zLmNhbkluc3RhbGwoZXh0ZW5zaW9uLmdhbGxlcnkpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHdlYlJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGxvY2FsUmVzdWx0ID8/IHJlbW90ZVJlc3VsdCA/PyB3ZWJSZXN1bHQgPz8gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQnLCBcIkNhbm5vdCBpbnN0YWxsIHRoZSAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgc2V0dXAuXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24gJiYgYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSgnY2Fubm90IGJlIGluc3RhbGxlZCcsIFwiQ2Fubm90IGluc3RhbGwgdGhlICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhpcyBzZXR1cC5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKGFyZzogc3RyaW5nIHwgVVJJIHwgSUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25PcHRpb25zID0ge30sIHByb2dyZXNzTG9jYXRpb24/OiBQcm9ncmVzc0xvY2F0aW9uIHwgc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5faW5zdGFsbChhcmcsIGluc3RhbGxPcHRpb25zLCBwcm9ncmVzc0xvY2F0aW9uKTtcblxuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCd1bmtub3duJywgXCJVbmFibGUgdG8gaW5zdGFsbCBleHRlbnNpb25cIikpO1xuXHRcdH1cblxuXHRcdGlmIChpbnN0YWxsT3B0aW9ucy5lbmFibGUpIHtcblx0XHRcdGlmIChleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UgfHwgZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpIHtcblx0XHRcdFx0aWYgKGluc3RhbGxPcHRpb25zLmp1c3RpZmljYXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdlbmFibGVFeHRlbnNpb25UaXRsZScsIFwiRW5hYmxlIEV4dGVuc2lvblwiKSxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZW5hYmxlRXh0ZW5zaW9uTWVzc2FnZScsIFwiV291bGQgeW91IGxpa2UgdG8gZW5hYmxlICd7MH0nIGV4dGVuc2lvbj9cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGRldGFpbDogaXNTdHJpbmcoaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbikgPyBpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uIDogaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbi5yZWFzb24sXG5cdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBpc1N0cmluZyhpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uKSA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ2VuYWJsZUJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRW5hYmxlIEV4dGVuc2lvblwiKSA6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2VuYWJsZUJ1dHRvbkxhYmVsV2l0aEFjdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkVuYWJsZSBFeHRlbnNpb24gYW5kIHswfVwiLCBpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uLmFjdGlvbiksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5zZXRFbmFibGVtZW50KGV4dGVuc2lvbiwgZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlID8gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgOiBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMud2FpdFVudGlsRXh0ZW5zaW9uSXNFbmFibGVkKGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGwoYXJnOiBzdHJpbmcgfCBVUkkgfCBJRXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbEV4dGVuc2lvbk9wdGlvbnMgPSB7fSwgcHJvZ3Jlc3NMb2NhdGlvbj86IFByb2dyZXNzTG9jYXRpb24gfCBzdHJpbmcpOiBQcm9taXNlPElFeHRlbnNpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgaW5zdGFsbGFibGU6IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uIHwgSVJlc291cmNlRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBleHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlcnZlcnM6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYXJnIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRpbnN0YWxsYWJsZSA9IGFyZztcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGluc3RhbGxhYmxlSW5mbzogSUV4dGVuc2lvbkluZm8gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIEluc3RhbGwgYnkgaWRcblx0XHRcdGlmIChpc1N0cmluZyhhcmcpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbiA9IHRoaXMubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogYXJnIH0pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbj8uaXNCdWlsdGluKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UuYnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzPy5zb21lKGlkID0+IGlkLnRvTG93ZXJDYXNlKCkgPT09IGFyZy50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5zdGFsbGFibGVJbmZvID0geyBpZDogYXJnLCB2ZXJzaW9uOiBpbnN0YWxsT3B0aW9ucy52ZXJzaW9uLCBwcmVSZWxlYXNlOiBpbnN0YWxsT3B0aW9ucy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24gPz8gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5wcmVmZXJQcmVSZWxlYXNlcyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBJbnN0YWxsIGJ5IGdhbGxlcnlcblx0XHRcdGVsc2UgaWYgKGFyZy5nYWxsZXJ5KSB7XG5cdFx0XHRcdGV4dGVuc2lvbiA9IGFyZztcblx0XHRcdFx0Z2FsbGVyeSA9IGFyZy5nYWxsZXJ5O1xuXHRcdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMudmVyc2lvbiAmJiBpbnN0YWxsT3B0aW9ucy52ZXJzaW9uICE9PSBnYWxsZXJ5Py52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0aW5zdGFsbGFibGVJbmZvID0geyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHZlcnNpb246IGluc3RhbGxPcHRpb25zLnZlcnNpb24gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSW5zdGFsbCBieSByZXNvdXJjZVxuXHRcdFx0ZWxzZSBpZiAoYXJnLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGV4dGVuc2lvbiA9IGFyZztcblx0XHRcdFx0aW5zdGFsbGFibGUgPSBhcmcucmVzb3VyY2VFeHRlbnNpb247XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbnN0YWxsYWJsZUluZm8pIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBleHRlbnNpb24/LnNlcnZlciA/IGF3YWl0IGV4dGVuc2lvbi5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Z2FsbGVyeSA9IChhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW2luc3RhbGxhYmxlSW5mb10sIHsgdGFyZ2V0UGxhdGZvcm0gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmF0KDApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWV4dGVuc2lvbiAmJiBnYWxsZXJ5KSB7XG5cdFx0XHRcdGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uLCBleHQgPT4gdGhpcy5nZXRFeHRlbnNpb25TdGF0ZShleHQpLCBleHQgPT4gdGhpcy5nZXRSdW50aW1lU3RhdGUoZXh0KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdhbGxlcnksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdCg8RXh0ZW5zaW9uPmV4dGVuc2lvbikuc2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdChhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHRlbnNpb24/LmlzTWFsaWNpb3VzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ21hbGljaW91cycsIFwiVGhpcyBleHRlbnNpb24gaXMgcmVwb3J0ZWQgdG8gYmUgcHJvYmxlbWF0aWMuXCIpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdFx0Ly8gSWYgcmVxdWVzdGVkIHRvIGluc3RhbGwgZXZlcnl3aGVyZVxuXHRcdFx0XHQvLyB0aGVuIGluc3RhbGwgdGhlIGV4dGVuc2lvbiBpbiBhbGwgdGhlIHNlcnZlcnMgd2hlcmUgaXQgaXMgbm90IGluc3RhbGxlZFxuXHRcdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMuaW5zdGFsbEV2ZXJ5d2hlcmUpIHtcblx0XHRcdFx0XHRzZXJ2ZXJzID0gW107XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFsbGFibGVTZXJ2ZXJzID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsYWJsZVNlcnZlcnMoZ2FsbGVyeSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25zU2VydmVyIG9mIHRoaXMuZXh0ZW5zaW9uc1NlcnZlcnMpIHtcblx0XHRcdFx0XHRcdGlmIChpbnN0YWxsYWJsZVNlcnZlcnMuaW5jbHVkZXMoZXh0ZW5zaW9uc1NlcnZlci5zZXJ2ZXIpICYmICFleHRlbnNpb25zU2VydmVyLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGdhbGxlcnkuaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0XHRcdHNlcnZlcnMucHVzaChleHRlbnNpb25zU2VydmVyLnNlcnZlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIElmIHJlcXVlc3RlZCB0byBlbmFibGUgYW5kIGV4dGVuc2lvbiBpcyBhbHJlYWR5IGluc3RhbGxlZFxuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJlY2F1c2Ugb2YgZXh0ZW5zaW9uIGtpbmRcblx0XHRcdFx0Ly8gSWYgc28sIGluc3RhbGwgdGhlIGV4dGVuc2lvbiBpbiB0aGUgc2VydmVyIHRoYXQgaXMgY29tcGF0aWJsZS5cblx0XHRcdFx0ZWxzZSBpZiAoaW5zdGFsbE9wdGlvbnMuZW5hYmxlICYmIGV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdFx0XHRzZXJ2ZXJzID0gW107XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgW2luc3RhbGxhYmxlU2VydmVyXSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGFibGVTZXJ2ZXJzKGdhbGxlcnkpO1xuXHRcdFx0XHRcdFx0aWYgKGluc3RhbGxhYmxlU2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdHNlcnZlcnMucHVzaChpbnN0YWxsYWJsZVNlcnZlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc2VydmVycyB8fCBzZXJ2ZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoIWluc3RhbGxhYmxlKSB7XG5cdFx0XHRcdFx0aWYgKCFnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpZCA9IGlzU3RyaW5nKGFyZykgPyBhcmcgOiAoPElFeHRlbnNpb24+YXJnKS5pZGVudGlmaWVyLmlkO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0XHRcdFx0XHRjb25zdCByZXBvcnRJc3N1ZVVyaSA9IG1hbmlmZXN0ID8gZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWFuaWZlc3QsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuQ29udGFjdFN1cHBvcnRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVwb3J0SXNzdWVNZXNzYWdlID0gcmVwb3J0SXNzdWVVcmkgPyBubHMubG9jYWxpemUoJ3JlcG9ydCBpc3N1ZScsIFwiSWYgdGhpcyBpc3N1ZSBwZXJzaXN0cywgcGxlYXNlIHJlcG9ydCBpdCBhdCB7MH1cIiwgcmVwb3J0SXNzdWVVcmkudG9TdHJpbmcoKSkgOiAnJztcblx0XHRcdFx0XHRcdGlmIChpbnN0YWxsT3B0aW9ucy52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vdCBmb3VuZCB2ZXJzaW9uJywgXCJUaGUgZXh0ZW5zaW9uICd7MH0nIGNhbm5vdCBiZSBpbnN0YWxsZWQgYmVjYXVzZSB0aGUgcmVxdWVzdGVkIHZlcnNpb24gJ3sxfScgd2FzIG5vdCBmb3VuZC5cIiwgaWQsIGluc3RhbGxPcHRpb25zLnZlcnNpb24pO1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKHJlcG9ydElzc3VlTWVzc2FnZSA/IGAke21lc3NhZ2V9ICR7cmVwb3J0SXNzdWVNZXNzYWdlfWAgOiBtZXNzYWdlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLk5vdEZvdW5kKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vdCBmb3VuZCcsIFwiVGhlIGV4dGVuc2lvbiAnezB9JyBjYW5ub3QgYmUgaW5zdGFsbGVkIGJlY2F1c2UgaXQgd2FzIG5vdCBmb3VuZC5cIiwgaWQpO1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKHJlcG9ydElzc3VlTWVzc2FnZSA/IGAke21lc3NhZ2V9ICR7cmVwb3J0SXNzdWVNZXNzYWdlfWAgOiBtZXNzYWdlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLk5vdEZvdW5kKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aW5zdGFsbGFibGUgPSBnYWxsZXJ5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpbnN0YWxsT3B0aW9ucy52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0aW5zdGFsbE9wdGlvbnMuaW5zdGFsbEdpdmVuVmVyc2lvbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbj8uaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdFx0XHRpbnN0YWxsT3B0aW9ucy5pc1dvcmtzcGFjZVNjb3BlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5zdGFsbGFibGUpIHtcblx0XHRcdGlmIChpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHN5bmNDaGVjayA9IGlzVW5kZWZpbmVkKGluc3RhbGxPcHRpb25zLmlzTWFjaGluZVNjb3BlZCkgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zKTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxib29sZWFuPltdID0gW107XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGlzU3RyaW5nKGluc3RhbGxPcHRpb25zLmp1c3RpZmljYXRpb24pIHx8ICFpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uLmFjdGlvblxuXHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnN0YWxsIEV4dGVuc2lvblwiKVxuXHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsQnV0dG9uTGFiZWxXaXRoQWN0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSW5zdGFsbCBFeHRlbnNpb24gYW5kIHswfVwiLCBpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uLmFjdGlvbiksIHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0XHRidXR0b25zLnB1c2goeyBsYWJlbDogbmxzLmxvY2FsaXplKCdvcGVuJywgXCJPcGVuIEV4dGVuc2lvblwiKSwgcnVuOiAoKSA9PiB7IHRoaXMub3BlbihleHRlbnNpb24hKTsgcmV0dXJuIGZhbHNlOyB9IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8Ym9vbGVhbj4oe1xuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25UaXRsZScsIFwiSW5zdGFsbCBFeHRlbnNpb25cIiksXG5cdFx0XHRcdFx0bWVzc2FnZTogZXh0ZW5zaW9uID8gbmxzLmxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uTWVzc2FnZScsIFwiV291bGQgeW91IGxpa2UgdG8gaW5zdGFsbCAnezB9JyBleHRlbnNpb24gZnJvbSAnezF9Jz9cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUpIDogbmxzLmxvY2FsaXplKCdpbnN0YWxsVlNJWE1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIGluc3RhbGwgdGhlIGV4dGVuc2lvbj9cIiksXG5cdFx0XHRcdFx0ZGV0YWlsOiBpc1N0cmluZyhpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uKSA/IGluc3RhbGxPcHRpb25zLmp1c3RpZmljYXRpb24gOiBpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uLnJlYXNvbixcblx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0XHRjaGVja2JveDogc3luY0NoZWNrID8ge1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc3luYyBleHRlbnNpb24nLCBcIlN5bmMgdGhpcyBleHRlbnNpb25cIiksXG5cdFx0XHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5yZXN1bHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3luY0NoZWNrKSB7XG5cdFx0XHRcdFx0aW5zdGFsbE9wdGlvbnMuaXNNYWNoaW5lU2NvcGVkID0gIXJlc3VsdC5jaGVja2JveENoZWNrZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpbnN0YWxsYWJsZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRleHRlbnNpb24gPSBhd2FpdCB0aGlzLmRvSW5zdGFsbCh1bmRlZmluZWQsICgpID0+IHRoaXMuaW5zdGFsbEZyb21WU0lYKGluc3RhbGxhYmxlLCBpbnN0YWxsT3B0aW9ucyksIHByb2dyZXNzTG9jYXRpb24pO1xuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZG9JbnN0YWxsKGV4dGVuc2lvbiwgKCkgPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsUmVzb3VyY2VFeHRlbnNpb24oaW5zdGFsbGFibGUgYXMgSVJlc291cmNlRXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucyksIHByb2dyZXNzTG9jYXRpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZG9JbnN0YWxsKGV4dGVuc2lvbiwgKCkgPT4gdGhpcy5pbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uISwgaW5zdGFsbGFibGUgYXMgSUdhbGxlcnlFeHRlbnNpb24sIGluc3RhbGxPcHRpb25zLCBzZXJ2ZXJzKSwgcHJvZ3Jlc3NMb2NhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxJblNlcnZlcihleHRlbnNpb246IElFeHRlbnNpb24sIHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGluc3RhbGxPcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmRvSW5zdGFsbChleHRlbnNpb24sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxvY2FsID0gZXh0ZW5zaW9uLmxvY2FsO1xuXHRcdFx0aWYgKCFsb2NhbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBub3QgZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uID0gKGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5leHRlbnNpb24uaWRlbnRpZmllciwgcHJlUmVsZWFzZTogbG9jYWwucHJlUmVsZWFzZSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdID8/IGV4dGVuc2lvbjtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0XHRyZXR1cm4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShleHRlbnNpb24uZ2FsbGVyeSwgeyBpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IGxvY2FsLnByZVJlbGVhc2UsIC4uLmluc3RhbGxPcHRpb25zIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdFx0aWYgKCFpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZShsb2NhbC50YXJnZXRQbGF0Zm9ybSwgW2xvY2FsLnRhcmdldFBsYXRmb3JtXSwgdGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2luY29tcGF0aWJsZScsIFwiQ2FuJ3QgaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBub3QgY29tcGF0aWJsZS5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdnNpeCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuemlwKGxvY2FsKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbCh2c2l4KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodnNpeCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y2FuU2V0TGFuZ3VhZ2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpc1dlYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhbGUgPSBnZXRMb2NhbGUoZXh0ZW5zaW9uLmdhbGxlcnkpO1xuXHRcdGlmICghbG9jYWxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBzZXRMYW5ndWFnZShleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY2FuU2V0TGFuZ3VhZ2UoZXh0ZW5zaW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW4gbm90IHNldCBsYW5ndWFnZScpO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbGUgPSBnZXRMb2NhbGUoZXh0ZW5zaW9uLmdhbGxlcnkhKTtcblx0XHRpZiAobG9jYWxlID09PSBsYW5ndWFnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbGl6ZWRMYW5ndWFnZU5hbWUgPSBleHRlbnNpb24uZ2FsbGVyeT8ucHJvcGVydGllcz8ubG9jYWxpemVkTGFuZ3VhZ2VzPy5bMF07XG5cdFx0cmV0dXJuIHRoaXMubG9jYWxlU2VydmljZS5zZXRMb2NhbGUoeyBpZDogbG9jYWxlLCBnYWxsZXJ5RXh0ZW5zaW9uOiBleHRlbnNpb24uZ2FsbGVyeSwgZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBsYWJlbDogbG9jYWxpemVkTGFuZ3VhZ2VOYW1lID8/IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB9KTtcblx0fVxuXG5cdHNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbiB8IElFeHRlbnNpb25bXSwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRleHRlbnNpb25zID0gQXJyYXkuaXNBcnJheShleHRlbnNpb25zKSA/IGV4dGVuc2lvbnMgOiBbZXh0ZW5zaW9uc107XG5cdFx0cmV0dXJuIHRoaXMucHJvbXB0QW5kU2V0RW5hYmxlbWVudChleHRlbnNpb25zLCBlbmFibGVtZW50U3RhdGUpO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsKGU6IElFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb24gPSBlLmxvY2FsID8gZSA6IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCBlLmlkZW50aWZpZXIpKTtcblx0XHRpZiAoIWV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyBsb2NhbCcpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24ubG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3VuaW5zdGFsbEFwcGxpY2F0aW9uU2NvcGVkJywgXCJVbmluc3RhbGwgRXh0ZW5zaW9uXCIpLFxuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3VuaW5zdGFsbEFwcGxpY2F0aW9uU2NvcGVkTWVzc2FnZScsIFwiV291bGQgeW91IGxpa2UgdG8gVW5pbnN0YWxsIHswfSBmcm9tIGFsbCBwcm9maWxlcz9cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKCd1bmluc3RhbGxBbGxQcm9maWxlcycsIFwiVW5pbnN0YWxsIChBbGwgUHJvZmlsZXMpXCIpXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb1VuaW5zdGFsbDogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gW3sgZXh0ZW5zaW9uOiBleHRlbnNpb24ubG9jYWwgfV07XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRFeHRlbnNpb25JZCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uZXh0ZW5zaW9uSWQ7XG5cdFx0aWYgKCFkZWZhdWx0Q2hhdEV4dGVuc2lvbklkIHx8ICFhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgeyBpZDogZGVmYXVsdENoYXRFeHRlbnNpb25JZCB9KSkge1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrRXh0ZW5zaW9uIG9mIHRoaXMuZ2V0QWxsUGFja2VkRXh0ZW5zaW9ucyhleHRlbnNpb24sIHRoaXMubG9jYWwpKSB7XG5cdFx0XHRcdGlmIChwYWNrRXh0ZW5zaW9uLmxvY2FsICYmICFleHRlbnNpb25zVG9Vbmluc3RhbGwuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHBhY2tFeHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLnB1c2goeyBleHRlbnNpb246IHBhY2tFeHRlbnNpb24ubG9jYWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZXBlbmRlbnRzOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGxldCBleHRlbnNpb25zRnJvbUFsbFByb2ZpbGVzOiBbSUxvY2FsRXh0ZW5zaW9uLCBVUkldW10gfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiB9IG9mIGV4dGVuc2lvbnNUb1VuaW5zdGFsbCkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uczogW0lMb2NhbEV4dGVuc2lvbiwgVVJJIHwgdW5kZWZpbmVkXVtdID0gW107XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uc0Zyb21BbGxQcm9maWxlcykge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNGcm9tQWxsUHJvZmlsZXMgPSBbXTtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5tYXAoYXN5bmMgcHJvZmlsZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbG9jYWwgb2YgaW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbnNGcm9tQWxsUHJvZmlsZXM/LnB1c2goW2xvY2FsLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goLi4uZXh0ZW5zaW9uc0Zyb21BbGxQcm9maWxlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgbG9jYWwgfSBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRcdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goW2xvY2FsLCB1bmRlZmluZWRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW2xvY2FsLCBwcm9maWxlTG9jYXRpb25dIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbG9jYWwubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzIHx8IGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2s/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBsb2NhbC5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGVwZW5kZW50cy5zb21lKGQgPT4gZC5tYW5pZmVzdC5leHRlbnNpb25QYWNrPy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgbG9jYWwuaWRlbnRpZmllcikpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsb2NhbC5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMuc29tZShkZXAgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHsgaWQ6IGRlcCB9KSkpIHtcblx0XHRcdFx0XHRkZXBlbmRlbnRzLnB1c2gobG9jYWwpO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5wdXNoKHsgZXh0ZW5zaW9uOiBsb2NhbCwgb3B0aW9uczogeyBwcm9maWxlTG9jYXRpb24gfSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd1bmluc3RhbGxEZXBlbmRlbnRzJywgXCJVbmluc3RhbGwgRXh0ZW5zaW9uIHdpdGggRGVwZW5kZW50c1wiKSxcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogdGhpcy5nZXRFcnJvck1lc3NhZ2VGb3JVbmluc3RhbGxpbmdBbkV4dGVuc2lvbldpdGhEZXBlbmRlbnRzKGV4dGVuc2lvbiwgZGVwZW5kZW50cyksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndW5pbnN0YWxsQWxsJywgXCJVbmluc3RhbGwgQWxsXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHRlbnNpb25zLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndW5pbnN0YWxsaW5nRXh0ZW5zaW9uJywgJ1VuaW5zdGFsbGluZyBleHRlbnNpb24uLi4nKSxcblx0XHRcdHNvdXJjZTogYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YFxuXHRcdH0sICgpID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zVG9Vbmluc3RhbGwpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBpbnN0YWxsZWQ6IElFeHRlbnNpb25bXSwgY2hlY2tlZDogSUV4dGVuc2lvbltdID0gW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGlmIChjaGVja2VkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y2hlY2tlZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1BhY2sgPSBleHRlbnNpb24uZXh0ZW5zaW9uUGFjayA/PyBbXTtcblx0XHRpZiAoZXh0ZW5zaW9uc1BhY2subGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwYWNrZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaSBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0aWYgKCFpLmlzQnVpbHRpbiAmJiBleHRlbnNpb25zUGFjay5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgaS5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRwYWNrZWRFeHRlbnNpb25zLnB1c2goaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhY2tPZlBhY2tlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrZWRFeHRlbnNpb24gb2YgcGFja2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRwYWNrT2ZQYWNrZWRFeHRlbnNpb25zLnB1c2goLi4udGhpcy5nZXRBbGxQYWNrZWRFeHRlbnNpb25zKHBhY2tlZEV4dGVuc2lvbiwgaW5zdGFsbGVkLCBjaGVja2VkKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnBhY2tlZEV4dGVuc2lvbnMsIC4uLnBhY2tPZlBhY2tlZEV4dGVuc2lvbnNdO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGdldEVycm9yTWVzc2FnZUZvclVuaW5zdGFsbGluZ0FuRXh0ZW5zaW9uV2l0aERlcGVuZGVudHMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBkZXBlbmRlbnRzOiBJTG9jYWxFeHRlbnNpb25bXSk6IHN0cmluZyB7XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzaW5nbGVEZXBlbmRlbnRVbmluc3RhbGxFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYWxvbmUuICd7MX0nIGV4dGVuc2lvbiBkZXBlbmRzIG9uIHRoaXMuIERvIHlvdSB3YW50IHRvIHVuaW5zdGFsbCBhbGwgdGhlc2UgZXh0ZW5zaW9ucz9cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lKTtcblx0XHR9XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0d29EZXBlbmRlbnRzVW5pbnN0YWxsRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBhbmQgJ3syfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0XHRleHRlbnNpb24uZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdtdWx0aXBsZURlcGVuZGVudHNVbmluc3RhbGxFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYWxvbmUuICd7MX0nLCAnezJ9JyBhbmQgb3RoZXIgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdGlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyhleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uLmxvY2FsID8gIXRoaXMuaXNJbnN0YWxsZWRFeHRlbnNpb25TeW5jZWQoZXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0OiB0aGlzLmV4dGVuc2lvbnNTeW5jTWFuYWdlbWVudFNlcnZpY2UuaGFzVG9OZXZlclN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlUHJlUmVsZWFzZShleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLnByZVJlbGVhc2UgIT09IGV4dGVuc2lvbi5pc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbi5sb2NhbCwgeyBwcmVSZWxlYXNlOiAhZXh0ZW5zaW9uLnByZVJlbGVhc2UgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuaW5zdGFsbChleHRlbnNpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiAhZXh0ZW5zaW9uLnByZVJlbGVhc2UsIHByZVJlbGVhc2U6ICFleHRlbnNpb24ucHJlUmVsZWFzZSB9KTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUV4dGVuc2lvbklnbm9yZWRUb1N5bmMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0luY2x1ZGluZ1BhY2tlZEV4dGVuc2lvbnMgPSBbZXh0ZW5zaW9uLCAuLi50aGlzLmdldEFsbFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uLCB0aGlzLmxvY2FsKV07XG5cdFx0Ly8gVXBkYXRlZCBpbiBzeW5jIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXG5cdFx0Zm9yIChjb25zdCBlIG9mIGV4dGVuc2lvbnNJbmNsdWRpbmdQYWNrZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBpc0lnbm9yZWQgPSB0aGlzLmlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyhlKTtcblx0XHRcdGlmIChlLmxvY2FsICYmIGlzSWdub3JlZCAmJiBlLmxvY2FsLmlzTWFjaGluZVNjb3BlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGUubG9jYWwsIHsgaXNNYWNoaW5lU2NvcGVkOiBmYWxzZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1N5bmNNYW5hZ2VtZW50U2VydmljZS51cGRhdGVJZ25vcmVkRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIuaWQsICFpc0lnbm9yZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLnRyaWdnZXJTeW5jKFsnSWdub3JlZEV4dGVuc2lvbnNVcGRhdGVkJ10pO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlQXBwbHlFeHRlbnNpb25Ub0FsbFByb2ZpbGVzKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNJbmNsdWRpbmdQYWNrZWRFeHRlbnNpb25zID0gW2V4dGVuc2lvbiwgLi4udGhpcy5nZXRBbGxQYWNrZWRFeHRlbnNpb25zKGV4dGVuc2lvbiwgdGhpcy5sb2NhbCldO1xuXHRcdGNvbnN0IGFsbEV4dGVuc2lvblNlcnZlcnMgPSB0aGlzLmdldEFsbEV4dGVuc2lvblNlcnZlcnMoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXh0ZW5zaW9uc0luY2x1ZGluZ1BhY2tlZEV4dGVuc2lvbnMubWFwKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKCFlLmxvY2FsIHx8IGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24oZS5sb2NhbC5tYW5pZmVzdCkgfHwgZS5pc0J1aWx0aW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNBcHBsaWNhdGlvblNjb3BlZCA9IGUubG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZDtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGFsbEV4dGVuc2lvblNlcnZlcnMubWFwKGFzeW5jIGV4dGVuc2lvblNlcnZlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvY2FsID0gZXh0ZW5zaW9uU2VydmVyLmxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBsb2NhbC5pZGVudGlmaWVyKSk/LmxvY2FsO1xuXHRcdFx0XHRpZiAobG9jYWwgJiYgbG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCA9PT0gaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudG9nZ2xlQXBwbGljYXRpb25TY29wZShsb2NhbCwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbEV4dGVuc2lvblNlcnZlcnMoKTogRXh0ZW5zaW9uc1tdIHtcblx0XHRjb25zdCBleHRlbnNpb25zOiBFeHRlbnNpb25zW10gPSBbXTtcblx0XHRpZiAodGhpcy5sb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLmxvY2FsRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy53ZWJFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnB1c2godGhpcy53ZWJFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGlzSW5zdGFsbGVkRXh0ZW5zaW9uU3luY2VkKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5pc01hY2hpbmVTY29wZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1N5bmNNYW5hZ2VtZW50U2VydmljZS5oYXNUb0Fsd2F5c1N5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICF0aGlzLmV4dGVuc2lvbnNTeW5jTWFuYWdlbWVudFNlcnZpY2UuaGFzVG9OZXZlclN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0luc3RhbGwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkLCBpbnN0YWxsVGFzazogKCkgPT4gUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+LCBwcm9ncmVzc0xvY2F0aW9uPzogUHJvZ3Jlc3NMb2NhdGlvbiB8IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHRpdGxlID0gZXh0ZW5zaW9uID8gbmxzLmxvY2FsaXplKCdpbnN0YWxsaW5nIG5hbWVkIGV4dGVuc2lvbicsIFwiSW5zdGFsbGluZyAnezB9JyBleHRlbnNpb24uLi5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSA6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbGluZyBleHRlbnNpb24nLCAnSW5zdGFsbGluZyBleHRlbnNpb24uLi4nKTtcblx0XHRyZXR1cm4gdGhpcy53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IHByb2dyZXNzTG9jYXRpb24gPz8gUHJvZ3Jlc3NMb2NhdGlvbi5FeHRlbnNpb25zLFxuXHRcdFx0dGl0bGVcblx0XHR9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnN0YWxsaW5nLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCBpbnN0YWxsVGFzaygpO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy53YWl0QW5kR2V0SW5zdGFsbGVkRXh0ZW5zaW9uKGxvY2FsLmlkZW50aWZpZXIpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFsbGluZyA9IHRoaXMuaW5zdGFsbGluZy5maWx0ZXIoZSA9PiBlICE9PSBleHRlbnNpb24pO1xuXHRcdFx0XHRcdC8vIFRyaWdnZXIgdGhlIGNoYW5nZSB3aXRob3V0IHBhc3NpbmcgdGhlIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIHJlcGxhY2VkIGJ5IGEgbmV3IGluc3RhbmNlLlxuXHRcdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsRnJvbVZTSVgodnNpeDogVVJJLCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHRjb25zdCBleGlzdGluZ0V4dGVuc2lvbiA9IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9KSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucyA9IGluc3RhbGxPcHRpb25zIHx8IHt9O1xuXHRcdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uLmxhdGVzdFZlcnNpb24gPT09IG1hbmlmZXN0LnZlcnNpb24pIHtcblx0XHRcdFx0aW5zdGFsbE9wdGlvbnMucGlubmVkID0gaW5zdGFsbE9wdGlvbnMucGlubmVkID8/IChleGlzdGluZ0V4dGVuc2lvbi5sb2NhbD8ucGlubmVkIHx8ICF0aGlzLnNob3VsZEF1dG9VcGRhdGVFeHRlbnNpb24oZXhpc3RpbmdFeHRlbnNpb24pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluc3RhbGxPcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsVlNJWCh2c2l4LCBtYW5pZmVzdCwgaW5zdGFsbE9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25PcHRpb25zLCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRpbnN0YWxsT3B0aW9ucyA9IGluc3RhbGxPcHRpb25zID8/IHt9O1xuXHRcdGluc3RhbGxPcHRpb25zLnBpbm5lZCA9IGluc3RhbGxPcHRpb25zLnBpbm5lZCA/PyAoZXh0ZW5zaW9uLmxvY2FsPy5waW5uZWQgfHwgIXRoaXMuc2hvdWxkQXV0b1VwZGF0ZUV4dGVuc2lvbihleHRlbnNpb24pKTtcblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsICYmICFzZXJ2ZXJzKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA9IHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKTtcblx0XHRcdGluc3RhbGxPcHRpb25zLm9wZXJhdGlvbiA9IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlO1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlRnJvbUdhbGxlcnkoZ2FsbGVyeSwgZXh0ZW5zaW9uLmxvY2FsLCBpbnN0YWxsT3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5LCBpbnN0YWxsT3B0aW9ucywgc2VydmVycyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0QW5kR2V0SW5zdGFsbGVkRXh0ZW5zaW9uKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0bGV0IGluc3RhbGxlZEV4dGVuc2lvbiA9IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSk7XG5cdFx0aWYgKCFpbnN0YWxsZWRFeHRlbnNpb24pIHtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodGhpcy5vbkNoYW5nZSwgZSA9PiAhIWUgJiYgdGhpcy5sb2NhbC5zb21lKGxvY2FsID0+IGFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKSkpO1xuXHRcdH1cblx0XHRpbnN0YWxsZWRFeHRlbnNpb24gPSB0aGlzLmxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHQvLyBUaGlzIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBzaG91bGQgaGF2ZSBiZWVuIGluc3RhbGxlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0VW50aWxFeHRlbnNpb25Jc0VuYWJsZWQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbmQoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb24ubG9jYWwgfHwgIXRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5BZGRFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24ubG9jYWwpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maW5kKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0ZShlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9tcHRBbmRTZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdGlmIChlbmFibGUpIHtcblx0XHRcdGNvbnN0IGFsbERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMgPSB0aGlzLmdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zLCB0aGlzLmxvY2FsLCBlbmFibGVtZW50U3RhdGUsIHsgZGVwZW5kZW5jaWVzOiB0cnVlLCBwYWNrOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hlY2tBbmRTZXRFbmFibGVtZW50KGV4dGVuc2lvbnMsIGFsbERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMsIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhY2tlZEV4dGVuc2lvbnMgPSB0aGlzLmdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zLCB0aGlzLmxvY2FsLCBlbmFibGVtZW50U3RhdGUsIHsgZGVwZW5kZW5jaWVzOiBmYWxzZSwgcGFjazogdHJ1ZSB9KTtcblx0XHRcdGlmIChwYWNrZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGVja0FuZFNldEVuYWJsZW1lbnQoZXh0ZW5zaW9ucywgcGFja2VkRXh0ZW5zaW9ucywgZW5hYmxlbWVudFN0YXRlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmNoZWNrQW5kU2V0RW5hYmxlbWVudChleHRlbnNpb25zLCBbXSwgZW5hYmxlbWVudFN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrQW5kU2V0RW5hYmxlbWVudChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIG90aGVyRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgYWxsRXh0ZW5zaW9ucyA9IFsuLi5leHRlbnNpb25zLCAuLi5vdGhlckV4dGVuc2lvbnNdO1xuXHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdGlmICghZW5hYmxlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGRlcGVuZGVudHMgPSB0aGlzLmdldERlcGVuZGVudHNBZnRlckRpc2FibGVtZW50KGV4dGVuc2lvbiwgYWxsRXh0ZW5zaW9ucywgdGhpcy5sb2NhbCk7XG5cdFx0XHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Rpc2FibGVEZXBlbmRlbnRzJywgXCJEaXNhYmxlIEV4dGVuc2lvbiB3aXRoIERlcGVuZGVudHNcIiksXG5cdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogdGhpcy5nZXREZXBlbmRlbnRzRXJyb3JNZXNzYWdlRm9yRGlzYWJsZW1lbnQoZXh0ZW5zaW9uLCBhbGxFeHRlbnNpb25zLCBkZXBlbmRlbnRzKSxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Rpc2FibGUgYWxsJywgJ0Rpc2FibGUgQWxsJyksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGVja0FuZFNldEVuYWJsZW1lbnQoZGVwZW5kZW50cywgW2V4dGVuc2lvbl0sIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZG9TZXRFbmFibGVtZW50KGFsbEV4dGVuc2lvbnMsIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIGluc3RhbGxlZDogSUV4dGVuc2lvbltdLCBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSwgb3B0aW9uczogeyBkZXBlbmRlbmNpZXM6IGJvb2xlYW47IHBhY2s6IGJvb2xlYW4gfSwgY2hlY2tlZDogSUV4dGVuc2lvbltdID0gW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGNvbnN0IHRvQ2hlY2sgPSBleHRlbnNpb25zLmZpbHRlcihlID0+IGNoZWNrZWQuaW5kZXhPZihlKSA9PT0gLTEpO1xuXHRcdGlmICh0b0NoZWNrLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdG9DaGVjaykge1xuXHRcdFx0XHRjaGVja2VkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZSA9IGluc3RhbGxlZC5maWx0ZXIoaSA9PiB7XG5cdFx0XHRcdGlmIChjaGVja2VkLmluZGV4T2YoaSkgIT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdFx0XHRjb25zdCBpc0V4dGVuc2lvbkVuYWJsZWQgPSBpLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBpLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2U7XG5cdFx0XHRcdGlmIChlbmFibGUgPT09IGlzRXh0ZW5zaW9uRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gKGVuYWJsZSB8fCAhaS5pc0J1aWx0aW4pIC8vIEluY2x1ZGUgYWxsIEV4dGVuc2lvbnMgZm9yIGVuYWJsZW1lbnQgYW5kIG9ubHkgbm9uIGJ1aWx0aW4gZXh0ZW5zaW9ucyBmb3IgZGlzYWJsZW1lbnRcblx0XHRcdFx0XHQmJiAob3B0aW9ucy5kZXBlbmRlbmNpZXMgfHwgb3B0aW9ucy5wYWNrKVxuXHRcdFx0XHRcdCYmIGV4dGVuc2lvbnMuc29tZShleHRlbnNpb24gPT5cblx0XHRcdFx0XHRcdChvcHRpb25zLmRlcGVuZGVuY2llcyAmJiBleHRlbnNpb24uZGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBpLmlkZW50aWZpZXIpKSlcblx0XHRcdFx0XHRcdHx8IChvcHRpb25zLnBhY2sgJiYgZXh0ZW5zaW9uLmV4dGVuc2lvblBhY2suc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGkuaWRlbnRpZmllcikpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChleHRlbnNpb25zVG9FYW5ibGVPckRpc2FibGUubGVuZ3RoKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZS5wdXNoKC4uLnRoaXMuZ2V0RXh0ZW5zaW9uc1JlY3Vyc2l2ZWx5KGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZSwgaW5zdGFsbGVkLCBlbmFibGVtZW50U3RhdGUsIG9wdGlvbnMsIGNoZWNrZWQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHRlbnNpb25zVG9FYW5ibGVPckRpc2FibGU7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwZW5kZW50c0FmdGVyRGlzYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBleHRlbnNpb25zVG9EaXNhYmxlOiBJRXh0ZW5zaW9uW10sIGluc3RhbGxlZDogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdIHtcblx0XHRyZXR1cm4gaW5zdGFsbGVkLmZpbHRlcihpID0+IHtcblx0XHRcdGlmIChpLmRlcGVuZGVuY2llcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGkgPT09IGV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGkuZW5hYmxlbWVudFN0YXRlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRGlzYWJsZS5pbmRleE9mKGkpICE9PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaS5kZXBlbmRlbmNpZXMuc29tZShkZXAgPT4gW2V4dGVuc2lvbiwgLi4uZXh0ZW5zaW9uc1RvRGlzYWJsZV0uc29tZShkID0+IGFyZVNhbWVFeHRlbnNpb25zKGQuaWRlbnRpZmllciwgeyBpZDogZGVwIH0pKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlcGVuZGVudHNFcnJvck1lc3NhZ2VGb3JEaXNhYmxlbWVudChleHRlbnNpb246IElFeHRlbnNpb24sIGFsbERpc2FibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBkZXBlbmRlbnRzOiBJRXh0ZW5zaW9uW10pOiBzdHJpbmcge1xuXHRcdGZvciAoY29uc3QgZSBvZiBbZXh0ZW5zaW9uLCAuLi5hbGxEaXNhYmxlZEV4dGVuc2lvbnNdKSB7XG5cdFx0XHRjb25zdCBkZXBlbmRlbnRzT2ZUaGVFeHRlbnNpb24gPSBkZXBlbmRlbnRzLmZpbHRlcihkID0+IGQuZGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBlLmlkZW50aWZpZXIpKSk7XG5cdFx0XHRpZiAoZGVwZW5kZW50c09mVGhlRXh0ZW5zaW9uLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRFcnJvck1lc3NhZ2VGb3JEaXNhYmxpbmdBbkV4dGVuc2lvbldpdGhEZXBlbmRlbnRzKGUsIGRlcGVuZGVudHNPZlRoZUV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXJyb3JNZXNzYWdlRm9yRGlzYWJsaW5nQW5FeHRlbnNpb25XaXRoRGVwZW5kZW50cyhleHRlbnNpb246IElFeHRlbnNpb24sIGRlcGVuZGVudHM6IElFeHRlbnNpb25bXSk6IHN0cmluZyB7XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzaW5nbGVEZXBlbmRlbnRFcnJvcicsIFwiQ2Fubm90IGRpc2FibGUgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBleHRlbnNpb24gZGVwZW5kcyBvbiB0aGlzLiBEbyB5b3Ugd2FudCB0byBkaXNhYmxlIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLCBleHRlbnNpb24uZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMF0uZGlzcGxheU5hbWUpO1xuXHRcdH1cblx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDIpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3R3b0RlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IGRpc2FibGUgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBhbmQgJ3syfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gZGlzYWJsZSBhbGwgdGhlc2UgZXh0ZW5zaW9ucz9cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLmRpc3BsYXlOYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbXVsdGlwbGVEZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCBkaXNhYmxlICd7MH0nIGV4dGVuc2lvbiBhbG9uZS4gJ3sxfScsICd7Mn0nIGFuZCBvdGhlciBleHRlbnNpb25zIGRlcGVuZCBvbiB0aGlzLiBEbyB5b3Ugd2FudCB0byBkaXNhYmxlIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPGJvb2xlYW5bXT4ge1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmxvY2FsISksIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdH1cblxuXHQvLyBDdXJyZW50IHNlcnZpY2UgcmVwb3J0cyBwcm9ncmVzcyB3aGVuIGluc3RhbGxpbmcvdW5pbnN0YWxsaW5nIGV4dGVuc2lvbnNcblx0Ly8gVGhpcyBpcyB0byByZXBvcnQgcHJvZ3Jlc3MgZm9yIG90aGVyIHNvdXJjZXMgb2YgZXh0ZW5zaW9uIGluc3RhbGwvdW5pbnN0YWxsIGNoYW5nZXNcblx0Ly8gU2luY2Ugd2UgY2Fubm90IGRpZmZlcmVudGlhdGUgYmV0d2VlbiB0aGUgdHdvLCB3ZSByZXBvcnQgcHJvZ3Jlc3MgZm9yIGFsbCBleHRlbnNpb24gaW5zdGFsbC91bmluc3RhbGwgY2hhbmdlc1xuXHRwcml2YXRlIF9hY3Rpdml0eUNhbGxCYWNrOiAoKHZhbHVlOiB2b2lkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXBvcnRQcm9ncmVzc0Zyb21PdGhlclNvdXJjZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5zdGFsbGVkLnNvbWUoZSA9PiBlLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nIHx8IGUuc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZykpIHtcblx0XHRcdGlmICghdGhpcy5fYWN0aXZpdHlDYWxsQmFjaykge1xuXHRcdFx0XHR0aGlzLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLkV4dGVuc2lvbnMgfSwgKCkgPT4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLl9hY3Rpdml0eUNhbGxCYWNrID0gcmVzb2x2ZSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3Rpdml0eUNhbGxCYWNrPy4oKTtcblx0XHRcdHRoaXMuX2FjdGl2aXR5Q2FsbEJhY2sgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3aXRoUHJvZ3Jlc3M8VD4ob3B0aW9uczogSVByb2dyZXNzT3B0aW9ucywgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Mob3B0aW9ucywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FuY2VsYWJsZVRhc2sgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSgoKSA9PiB0YXNrKCkpO1xuXHRcdFx0dGhpcy50YXNrc0luUHJvZ3Jlc3MucHVzaChjYW5jZWxhYmxlVGFzayk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgY2FuY2VsYWJsZVRhc2s7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMudGFza3NJblByb2dyZXNzLmluZGV4T2YoY2FuY2VsYWJsZVRhc2spO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy50YXNrc0luUHJvZ3Jlc3Muc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVycm9yKGVycjogYW55KTogdm9pZCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgfHwgJyc7XG5cblx0XHRpZiAoL2dldGFkZHJpbmZvIEVOT1RGT1VORHxnZXRhZGRyaW5mbyBFTk9FTlR8Y29ubmVjdCBFQUNDRVN8Y29ubmVjdCBFQ09OTlJFRlVTRUQvLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0fVxuXG5cdGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghL15leHRlbnNpb24vLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLm9uT3BlbkV4dGVuc2lvblVybCh1cmkpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uT3BlbkV4dGVuc2lvblVybCh1cmk6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoID0gL15leHRlbnNpb25cXC8oW14vXSspJC8uZXhlYyh1cmkucGF0aCk7XG5cblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBtYXRjaFsxXTtcblxuXHRcdHRoaXMucXVlcnlMb2NhbCgpLnRoZW4oYXN5bmMgbG9jYWwgPT4ge1xuXHRcdFx0bGV0IGV4dGVuc2lvbiA9IGxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0W2V4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCB7IHNvdXJjZTogJ3VyaScgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuZm9jdXMobWFpbldpbmRvdyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbihleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiB0aGlzLm9uRXJyb3IoZXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHVibGlzaGVyc1RvQXV0b1VwZGF0ZSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKCkuZmlsdGVyKGlkID0+ICFFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWC50ZXN0KGlkKSk7XG5cdH1cblxuXHRnZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTogc3RyaW5nW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IEpTT04ucGFyc2UodGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWRWYWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZFZhbHVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHsgLyogSWdub3JlICovIH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBlbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2VuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gdGhpcy5nZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9lbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSAhPT0gZW5hYmxlZEF1b3RVcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2VuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gZW5hYmxlZEF1b3RVcGRhdGVFeHRlbnNpb25zVmFsdWU7XG5cdFx0XHR0aGlzLnNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVYVEVOU0lPTlNfQVVUT19VUERBVEVfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFWFRFTlNJT05TX0FVVE9fVVBEQVRFX0tFWSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGdldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTogc3RyaW5nW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IEpTT04ucGFyc2UodGhpcy5kaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkVmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJzZWRWYWx1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUgPSBKU09OLnN0cmluZ2lmeShkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gdGhpcy5nZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlICE9PSBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTtcblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRVhURU5TSU9OU19ET05PVF9BVVRPX1VQREFURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJ1tdJyk7XG5cdH1cblxuXHRwcml2YXRlIHNldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFWFRFTlNJT05TX0RPTk9UX0FVVE9fVVBEQVRFX0tFWSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGlzbWlzc2VkTm90aWZpY2F0aW9ucygpOiBzdHJpbmdbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZFZhbHVlID0gSlNPTi5wYXJzZSh0aGlzLmRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWRWYWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZFZhbHVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHsgLyogSWdub3JlICovIH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHNldERpc21pc3NlZE5vdGlmaWNhdGlvbnMoZGlzbWlzc2VkTm90aWZpY2F0aW9uczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLmRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGRpc21pc3NlZE5vdGlmaWNhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl9kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUgPSB0aGlzLmdldERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHNldCBkaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUoZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUgIT09IGRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlID0gZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlO1xuXHRcdFx0dGhpcy5zZXREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUoZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChFWFRFTlNJT05TX0RJU01JU1NFRF9OT1RJRklDQVRJT05TX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRVhURU5TSU9OU19ESVNNSVNTRURfTk9USUZJQ0FUSU9OU19LRVksIHZhbHVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFlBQVk7QUFDeEIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQTRCLFVBQVUsa0JBQWtCLHlCQUF5Qix5QkFBeUI7QUFDMUcsU0FBUyxtQkFBbUIsaUJBQWlCLDJCQUEyQjtBQUN4RSxTQUFTLFlBQVksbUJBQW1CLG9CQUFvQjtBQUM1RCxTQUFpQix1QkFBdUI7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEM7QUFBQSxFQUNDO0FBQUEsRUFDbUQ7QUFBQSxFQUFrQjtBQUFBLEVBQ2lCO0FBQUEsRUFBa0Q7QUFBQSxFQUd4STtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLE9BRU07QUFDUCxTQUFTLHNDQUFzQyxpQkFBaUIsbUNBQStELDRDQUFnRTtBQUMvTCxTQUFTLGtDQUFrQyxnQ0FBZ0MsbUJBQW1CLGtCQUFrQix1QkFBdUIsa0NBQWtDO0FBQ3pLLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJB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QUMvRCxVQUFJLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDL0IsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELFNBQVMsR0FBRztBQUFBLElBQWU7QUFDM0IsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRVEsMEJBQTBCLHdCQUF3QztBQUN6RSxTQUFLLDhCQUE4QixLQUFLLFVBQVUsc0JBQXNCO0FBQUEsRUFDekU7QUFBQSxFQUdBLElBQVksOEJBQXNDO0FBQ2pELFFBQUksQ0FBQyxLQUFLLDhCQUE4QjtBQUN2QyxXQUFLLCtCQUErQixLQUFLLCtCQUErQjtBQUFBLElBQ3pFO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBWSw0QkFBNEIsNkJBQXFDO0FBQzVFLFFBQUksS0FBSyxnQ0FBZ0MsNkJBQTZCO0FBQ3JFLFdBQUssK0JBQStCO0FBQ3BDLFdBQUssK0JBQStCLDJCQUEyQjtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUNBQXlDO0FBQ2hELFdBQU8sS0FBSyxlQUFlLElBQUksd0NBQXdDLGFBQWEsU0FBUyxJQUFJO0FBQUEsRUFDbEc7QUFBQSxFQUVRLCtCQUErQixPQUFxQjtBQUMzRCxTQUFLLGVBQWUsTUFBTSx3Q0FBd0MsT0FBTyxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQUEsRUFDbEg7QUFFRDtBQWo2RWEsMkJBRVksdUJBQXVCLE1BQU8sS0FBSyxLQUFLO0FBRnBELDZCQUFOO0FBQUEsRUFnQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBFVTsiLAogICJuYW1lcyI6IFsiZSIsICJleHRlbnNpb24iLCAibWFuaWZlc3QiLCAidG9rZW4iLCAidGFyZ2V0UGxhdGZvcm0iLCAiZXh0ZW5zaW9ucyIsICJzaG91bGRBdXRvVXBkYXRlIiwgInNob3VsZE5vdEF1dG9VcGRhdGUiLCAibG9jYWwiLCAiaW5kZXgiXQp9Cg==
