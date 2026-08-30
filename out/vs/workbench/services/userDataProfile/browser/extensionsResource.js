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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { GlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionEnablementService.js";
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ProfileResourceType } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataProfileStorageService } from "../../../../platform/userDataProfile/common/userDataProfileStorageService.js";
import { TreeItemCollapsibleState } from "../../../common/views.js";
import { IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { IUserDataProfileService } from "../common/userDataProfile.js";
let ExtensionsResourceInitializer = class {
  constructor(userDataProfileService, extensionManagementService, extensionGalleryService, extensionEnablementService, logService) {
    this.userDataProfileService = userDataProfileService;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionEnablementService = extensionEnablementService;
    this.logService = logService;
  }
  async initialize(content) {
    const profileExtensions = JSON.parse(content);
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.userDataProfileService.currentProfile.extensionsResource);
    const extensionsToEnableOrDisable = [];
    const extensionsToInstall = [];
    for (const e of profileExtensions) {
      const isDisabled = this.extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
      const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
      if (!installedExtension || !installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease) {
        extensionsToInstall.push(e);
      }
      if (isDisabled !== !!e.disabled) {
        extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
      }
    }
    const extensionsToUninstall = installedExtensions.filter((extension) => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
    for (const { extension, enable } of extensionsToEnableOrDisable) {
      if (enable) {
        this.logService.trace(`Initializing Profile: Enabling extension...`, extension.id);
        await this.extensionEnablementService.enableExtension(extension);
        this.logService.info(`Initializing Profile: Enabled extension...`, extension.id);
      } else {
        this.logService.trace(`Initializing Profile: Disabling extension...`, extension.id);
        await this.extensionEnablementService.disableExtension(extension);
        this.logService.info(`Initializing Profile: Disabled extension...`, extension.id);
      }
    }
    if (extensionsToInstall.length) {
      const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map((e) => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? void 0 : e.preRelease })), CancellationToken.None);
      await Promise.all(extensionsToInstall.map(async (e) => {
        const extension = galleryExtensions.find((galleryExtension) => areSameExtensions(galleryExtension.identifier, e.identifier));
        if (!extension) {
          return;
        }
        if (await this.extensionManagementService.canInstall(extension) === true) {
          this.logService.trace(`Initializing Profile: Installing extension...`, extension.identifier.id, extension.version);
          await this.extensionManagementService.installFromGallery(extension, {
            isMachineScoped: false,
            /* set isMachineScoped value to prevent install and sync dialog in web */
            donotIncludePackAndDependencies: true,
            installGivenVersion: !!e.version,
            installPreReleaseVersion: e.preRelease,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
            context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
          });
          this.logService.info(`Initializing Profile: Installed extension...`, extension.identifier.id, extension.version);
        } else {
          this.logService.info(`Initializing Profile: Skipped installing extension because it cannot be installed.`, extension.identifier.id);
        }
      }));
    }
    if (extensionsToUninstall.length) {
      await Promise.all(extensionsToUninstall.map((e) => this.extensionManagementService.uninstall(e)));
    }
  }
};
ExtensionsResourceInitializer = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IExtensionManagementService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IGlobalExtensionEnablementService),
  __decorateParam(4, ILogService)
], ExtensionsResourceInitializer);
let ExtensionsResource = class {
  constructor(extensionManagementService, extensionGalleryService, userDataProfileStorageService, instantiationService, logService) {
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.instantiationService = instantiationService;
    this.logService = logService;
  }
  async getContent(profile, exclude) {
    const extensions = await this.getLocalExtensions(profile);
    return this.toContent(extensions, exclude);
  }
  toContent(extensions, exclude) {
    return JSON.stringify(exclude?.length ? extensions.filter((e) => !exclude.includes(e.identifier.id.toLowerCase())) : extensions);
  }
  async apply(content, profile, progress, token) {
    return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
      const profileExtensions = await this.getProfileExtensions(content);
      const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
      const extensionsToEnableOrDisable = [];
      const extensionsToInstall = [];
      for (const e of profileExtensions) {
        const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
        const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
        if (!installedExtension || !installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease) {
          extensionsToInstall.push(e);
        }
        if (isDisabled !== !!e.disabled) {
          extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
        }
      }
      const extensionsToUninstall = installedExtensions.filter((extension) => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)) && !extension.isApplicationScoped);
      for (const { extension, enable } of extensionsToEnableOrDisable) {
        if (enable) {
          this.logService.trace(`Importing Profile (${profile.name}): Enabling extension...`, extension.id);
          await extensionEnablementService.enableExtension(extension);
          this.logService.info(`Importing Profile (${profile.name}): Enabled extension...`, extension.id);
        } else {
          this.logService.trace(`Importing Profile (${profile.name}): Disabling extension...`, extension.id);
          await extensionEnablementService.disableExtension(extension);
          this.logService.info(`Importing Profile (${profile.name}): Disabled extension...`, extension.id);
        }
      }
      if (extensionsToInstall.length) {
        this.logService.info(`Importing Profile (${profile.name}): Started installing extensions.`);
        const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map((e) => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? void 0 : e.preRelease })), CancellationToken.None);
        const installExtensionInfos = [];
        await Promise.all(extensionsToInstall.map(async (e) => {
          const extension = galleryExtensions.find((galleryExtension) => areSameExtensions(galleryExtension.identifier, e.identifier));
          if (!extension) {
            return;
          }
          if (await this.extensionManagementService.canInstall(extension) === true) {
            installExtensionInfos.push({
              extension,
              options: {
                isMachineScoped: false,
                /* set isMachineScoped value to prevent install and sync dialog in web */
                donotIncludePackAndDependencies: true,
                installGivenVersion: !!e.version,
                installPreReleaseVersion: e.preRelease,
                profileLocation: profile.extensionsResource,
                context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
              }
            });
          } else {
            this.logService.info(`Importing Profile (${profile.name}): Skipped installing extension because it cannot be installed.`, extension.identifier.id);
          }
        }));
        if (installExtensionInfos.length) {
          if (token) {
            await this.extensionManagementService.requestPublisherTrust(installExtensionInfos);
            for (const installExtensionInfo of installExtensionInfos) {
              if (token.isCancellationRequested) {
                return;
              }
              progress?.(localize("installingExtension", "Installing extension {0}...", installExtensionInfo.extension.displayName ?? installExtensionInfo.extension.identifier.id));
              await this.extensionManagementService.installFromGallery(installExtensionInfo.extension, installExtensionInfo.options);
            }
          } else {
            await this.extensionManagementService.installGalleryExtensions(installExtensionInfos);
          }
        }
        this.logService.info(`Importing Profile (${profile.name}): Finished installing extensions.`);
      }
      if (extensionsToUninstall.length) {
        await Promise.all(extensionsToUninstall.map((e) => this.extensionManagementService.uninstall(e)));
      }
    });
  }
  async copy(from, to, disableExtensions) {
    await this.extensionManagementService.copyExtensions(from.extensionsResource, to.extensionsResource);
    const extensionsToDisable = await this.withProfileScopedServices(from, async (extensionEnablementService) => extensionEnablementService.getDisabledExtensions());
    if (disableExtensions) {
      const extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, to.extensionsResource);
      for (const extension of extensions) {
        extensionsToDisable.push(extension.identifier);
      }
    }
    await this.withProfileScopedServices(to, async (extensionEnablementService) => Promise.all(extensionsToDisable.map((extension) => extensionEnablementService.disableExtension(extension))));
  }
  async getLocalExtensions(profile) {
    return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
      const result = /* @__PURE__ */ new Map();
      const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
      const disabledExtensions = extensionEnablementService.getDisabledExtensions();
      for (const extension of installedExtensions) {
        const { identifier, preRelease } = extension;
        const disabled = disabledExtensions.some((disabledExtension) => areSameExtensions(disabledExtension, identifier));
        if (extension.isBuiltin && !disabled) {
          continue;
        }
        if (!extension.isBuiltin) {
          if (!extension.identifier.uuid) {
            continue;
          }
        }
        const existing = result.get(identifier.id.toLowerCase());
        if (existing?.disabled) {
          result.delete(identifier.id.toLowerCase());
        }
        const profileExtension = { identifier, displayName: extension.manifest.displayName };
        if (disabled) {
          profileExtension.disabled = true;
        }
        if (!extension.isBuiltin && extension.pinned) {
          profileExtension.version = extension.manifest.version;
        }
        if (!profileExtension.version && preRelease) {
          profileExtension.preRelease = true;
        }
        profileExtension.applicationScoped = extension.isApplicationScoped;
        result.set(profileExtension.identifier.id.toLowerCase(), profileExtension);
      }
      return [...result.values()];
    });
  }
  async getProfileExtensions(content) {
    return JSON.parse(content);
  }
  async withProfileScopedServices(profile, fn) {
    return this.userDataProfileStorageService.withProfileScopedStorageService(
      profile,
      async (storageService) => {
        const disposables = new DisposableStore();
        const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
        const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
        try {
          return await fn(extensionEnablementService);
        } finally {
          disposables.dispose();
        }
      }
    );
  }
};
ExtensionsResource = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IExtensionGalleryService),
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService)
], ExtensionsResource);
class ExtensionsResourceTreeItem {
  constructor() {
    this.type = ProfileResourceType.Extensions;
    this.handle = ProfileResourceType.Extensions;
    this.label = { label: localize("extensions", "Extensions") };
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
    this.contextValue = ProfileResourceType.Extensions;
    this.excludedExtensions = /* @__PURE__ */ new Set();
  }
  async getChildren() {
    const extensions = (await this.getExtensions()).sort((a, b) => (a.displayName ?? a.identifier.id).localeCompare(b.displayName ?? b.identifier.id));
    const that = this;
    return extensions.map((e) => ({
      ...e,
      handle: e.identifier.id.toLowerCase(),
      parent: this,
      label: { label: e.displayName || e.identifier.id },
      description: e.applicationScoped ? localize("all profiles and disabled", "All Profiles") : void 0,
      collapsibleState: TreeItemCollapsibleState.None,
      checkbox: that.checkbox ? {
        get isChecked() {
          return !that.excludedExtensions.has(e.identifier.id.toLowerCase());
        },
        set isChecked(value) {
          if (value) {
            that.excludedExtensions.delete(e.identifier.id.toLowerCase());
          } else {
            that.excludedExtensions.add(e.identifier.id.toLowerCase());
          }
        },
        tooltip: localize("exclude", "Select {0} Extension", e.displayName || e.identifier.id),
        accessibilityInformation: {
          label: localize("exclude", "Select {0} Extension", e.displayName || e.identifier.id)
        }
      } : void 0,
      themeIcon: Codicon.extensions,
      command: {
        id: "extension.open",
        title: "",
        arguments: [e.identifier.id, void 0, true]
      }
    }));
  }
  async hasContent() {
    const extensions = await this.getExtensions();
    return extensions.length > 0;
  }
}
let ExtensionsResourceExportTreeItem = class extends ExtensionsResourceTreeItem {
  constructor(profile, instantiationService) {
    super();
    this.profile = profile;
    this.instantiationService = instantiationService;
  }
  isFromDefaultProfile() {
    return !this.profile.isDefault && !!this.profile.useDefaultFlags?.extensions;
  }
  getExtensions() {
    return this.instantiationService.createInstance(ExtensionsResource).getLocalExtensions(this.profile);
  }
  async getContent() {
    return this.instantiationService.createInstance(ExtensionsResource).getContent(this.profile, [...this.excludedExtensions.values()]);
  }
};
ExtensionsResourceExportTreeItem = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExtensionsResourceExportTreeItem);
let ExtensionsResourceImportTreeItem = class extends ExtensionsResourceTreeItem {
  constructor(content, instantiationService) {
    super();
    this.content = content;
    this.instantiationService = instantiationService;
  }
  isFromDefaultProfile() {
    return false;
  }
  getExtensions() {
    return this.instantiationService.createInstance(ExtensionsResource).getProfileExtensions(this.content);
  }
  async getContent() {
    const extensionsResource = this.instantiationService.createInstance(ExtensionsResource);
    const extensions = await extensionsResource.getProfileExtensions(this.content);
    return extensionsResource.toContent(extensions, [...this.excludedExtensions.values()]);
  }
};
ExtensionsResourceImportTreeItem = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExtensionsResourceImportTreeItem);
export {
  ExtensionsResource,
  ExtensionsResourceExportTreeItem,
  ExtensionsResourceImportTreeItem,
  ExtensionsResourceInitializer,
  ExtensionsResourceTreeItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx1c2VyRGF0YVByb2ZpbGVcXGJyb3dzZXJcXGV4dGVuc2lvbnNSZXNvdXJjZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhULCBFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFQsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxFeHRlbnNpb25JbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgUHJvZmlsZVJlc291cmNlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRyZWVJdGVtQ2hlY2tib3hTdGF0ZSwgVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVByb2ZpbGVSZXNvdXJjZSwgSVByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW0sIElQcm9maWxlUmVzb3VyY2VJbml0aWFsaXplciwgSVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtLCBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuXG5pbnRlcmZhY2UgSVByb2ZpbGVFeHRlbnNpb24ge1xuXHRpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0ZGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdHByZVJlbGVhc2U/OiBib29sZWFuO1xuXHRhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG5cdGRpc2FibGVkPzogYm9vbGVhbjtcblx0dmVyc2lvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNSZXNvdXJjZUluaXRpYWxpemVyIGltcGxlbWVudHMgSVByb2ZpbGVSZXNvdXJjZUluaXRpYWxpemVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2ZpbGVFeHRlbnNpb25zOiBJUHJvZmlsZUV4dGVuc2lvbltdID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9FbmFibGVPckRpc2FibGU6IHsgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjsgZW5hYmxlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0luc3RhbGw6IElQcm9maWxlRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGUgb2YgcHJvZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGlzRGlzYWJsZWQgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpLnNvbWUoZGlzYWJsZWRFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maW5kKGluc3RhbGxlZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpbnN0YWxsZWQuaWRlbnRpZmllciwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAoIWluc3RhbGxlZEV4dGVuc2lvbiB8fCAoIWluc3RhbGxlZEV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLnByZVJlbGVhc2UgIT09IGUucHJlUmVsZWFzZSkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1RvSW5zdGFsbC5wdXNoKGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRGlzYWJsZWQgIT09ICEhZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRleHRlbnNpb25zVG9FbmFibGVPckRpc2FibGUucHVzaCh7IGV4dGVuc2lvbjogZS5pZGVudGlmaWVyLCBlbmFibGU6ICFlLmRpc2FibGVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25zVG9Vbmluc3RhbGw6IElMb2NhbEV4dGVuc2lvbltdID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFleHRlbnNpb24uaXNCdWlsdGluICYmICFwcm9maWxlRXh0ZW5zaW9ucy5zb21lKCh7IGlkZW50aWZpZXIgfSkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSk7XG5cdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiwgZW5hYmxlIH0gb2YgZXh0ZW5zaW9uc1RvRW5hYmxlT3JEaXNhYmxlKSB7XG5cdFx0XHRpZiAoZW5hYmxlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IEVuYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbml0aWFsaXppbmcgUHJvZmlsZTogRW5hYmxlZCBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBJbml0aWFsaXppbmcgUHJvZmlsZTogRGlzYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZGlzYWJsZUV4dGVuc2lvbihleHRlbnNpb24pO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IERpc2FibGVkIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25zVG9JbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoZSA9PiAoeyAuLi5lLmlkZW50aWZpZXIsIHZlcnNpb246IGUudmVyc2lvbiwgaGFzUHJlUmVsZWFzZTogZS52ZXJzaW9uID8gdW5kZWZpbmVkIDogZS5wcmVSZWxlYXNlIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zVG9JbnN0YWxsLm1hcChhc3luYyBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZ2FsbGVyeUV4dGVuc2lvbnMuZmluZChnYWxsZXJ5RXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllciwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IEluc3RhbGxpbmcgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi52ZXJzaW9uKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShleHRlbnNpb24sIHtcblx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UsLyogc2V0IGlzTWFjaGluZVNjb3BlZCB2YWx1ZSB0byBwcmV2ZW50IGluc3RhbGwgYW5kIHN5bmMgZGlhbG9nIGluIHdlYiAqL1xuXHRcdFx0XHRcdFx0ZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogdHJ1ZSxcblx0XHRcdFx0XHRcdGluc3RhbGxHaXZlblZlcnNpb246ICEhZS52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBlLnByZVJlbGVhc2UsXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdOiB0cnVlLCBbRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVF06IHRydWUgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbml0aWFsaXppbmcgUHJvZmlsZTogSW5zdGFsbGVkIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEluaXRpYWxpemluZyBQcm9maWxlOiBTa2lwcGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgY2Fubm90IGJlIGluc3RhbGxlZC5gLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5tYXAoZSA9PiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChlKSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1Jlc291cmNlIGltcGxlbWVudHMgSVByb2ZpbGVSZXNvdXJjZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29udGVudChwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBleGNsdWRlPzogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldExvY2FsRXh0ZW5zaW9ucyhwcm9maWxlKTtcblx0XHRyZXR1cm4gdGhpcy50b0NvbnRlbnQoZXh0ZW5zaW9ucywgZXhjbHVkZSk7XG5cdH1cblxuXHR0b0NvbnRlbnQoZXh0ZW5zaW9uczogSVByb2ZpbGVFeHRlbnNpb25bXSwgZXhjbHVkZT86IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZXhjbHVkZT8ubGVuZ3RoID8gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiAhZXhjbHVkZS5pbmNsdWRlcyhlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpIDogZXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRhc3luYyBhcHBseShjb250ZW50OiBzdHJpbmcsIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIHByb2dyZXNzPzogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhQcm9maWxlU2NvcGVkU2VydmljZXMocHJvZmlsZSwgYXN5bmMgKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlRXh0ZW5zaW9uczogSVByb2ZpbGVFeHRlbnNpb25bXSA9IGF3YWl0IHRoaXMuZ2V0UHJvZmlsZUV4dGVuc2lvbnMoY29udGVudCk7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zVG9FbmFibGVPckRpc2FibGU6IHsgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjsgZW5hYmxlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvSW5zdGFsbDogSVByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHByb2ZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGlzRGlzYWJsZWQgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKS5zb21lKGRpc2FibGVkRXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maW5kKGluc3RhbGxlZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpbnN0YWxsZWQuaWRlbnRpZmllciwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9uIHx8ICghaW5zdGFsbGVkRXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiBpbnN0YWxsZWRFeHRlbnNpb24ucHJlUmVsZWFzZSAhPT0gZS5wcmVSZWxlYXNlKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb0luc3RhbGwucHVzaChlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNEaXNhYmxlZCAhPT0gISFlLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvRW5hYmxlT3JEaXNhYmxlLnB1c2goeyBleHRlbnNpb246IGUuaWRlbnRpZmllciwgZW5hYmxlOiAhZS5kaXNhYmxlZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvVW5pbnN0YWxsOiBJTG9jYWxFeHRlbnNpb25bXSA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiAhZXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiAhcHJvZmlsZUV4dGVuc2lvbnMuc29tZSgoeyBpZGVudGlmaWVyIH0pID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkgJiYgIWV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkKTtcblx0XHRcdGZvciAoY29uc3QgeyBleHRlbnNpb24sIGVuYWJsZSB9IG9mIGV4dGVuc2lvbnNUb0VuYWJsZU9yRGlzYWJsZSkge1xuXHRcdFx0XHRpZiAoZW5hYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogRW5hYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkKTtcblx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5lbmFibGVFeHRlbnNpb24oZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW1wb3J0aW5nIFByb2ZpbGUgKCR7cHJvZmlsZS5uYW1lfSk6IEVuYWJsZWQgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBEaXNhYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkKTtcblx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBEaXNhYmxlZCBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBTdGFydGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9ucy5gKTtcblx0XHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoZSA9PiAoeyAuLi5lLmlkZW50aWZpZXIsIHZlcnNpb246IGUudmVyc2lvbiwgaGFzUHJlUmVsZWFzZTogZS52ZXJzaW9uID8gdW5kZWZpbmVkIDogZS5wcmVSZWxlYXNlIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25JbmZvczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zVG9JbnN0YWxsLm1hcChhc3luYyBlID0+IHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBnYWxsZXJ5RXh0ZW5zaW9ucy5maW5kKGdhbGxlcnlFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdGluc3RhbGxFeHRlbnNpb25JbmZvcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBmYWxzZSwvKiBzZXQgaXNNYWNoaW5lU2NvcGVkIHZhbHVlIHRvIHByZXZlbnQgaW5zdGFsbCBhbmQgc3luYyBkaWFsb2cgaW4gd2ViICovXG5cdFx0XHRcdFx0XHRcdFx0ZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRpbnN0YWxsR2l2ZW5WZXJzaW9uOiAhIWUudmVyc2lvbixcblx0XHRcdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IGUucHJlUmVsZWFzZSxcblx0XHRcdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVF06IHRydWUgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBTa2lwcGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgY2Fubm90IGJlIGluc3RhbGxlZC5gLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGlmIChpbnN0YWxsRXh0ZW5zaW9uSW5mb3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnJlcXVlc3RQdWJsaXNoZXJUcnVzdChpbnN0YWxsRXh0ZW5zaW9uSW5mb3MpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpbnN0YWxsRXh0ZW5zaW9uSW5mbyBvZiBpbnN0YWxsRXh0ZW5zaW9uSW5mb3MpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHByb2dyZXNzPy4obG9jYWxpemUoJ2luc3RhbGxpbmdFeHRlbnNpb24nLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfS4uLlwiLCBpbnN0YWxsRXh0ZW5zaW9uSW5mby5leHRlbnNpb24uZGlzcGxheU5hbWUgPz8gaW5zdGFsbEV4dGVuc2lvbkluZm8uZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoaW5zdGFsbEV4dGVuc2lvbkluZm8uZXh0ZW5zaW9uLCBpbnN0YWxsRXh0ZW5zaW9uSW5mby5vcHRpb25zKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoaW5zdGFsbEV4dGVuc2lvbkluZm9zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBGaW5pc2hlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbnMuYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zVG9Vbmluc3RhbGwubWFwKGUgPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoZSkpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNvcHkoZnJvbTogSVVzZXJEYXRhUHJvZmlsZSwgdG86IElVc2VyRGF0YVByb2ZpbGUsIGRpc2FibGVFeHRlbnNpb25zOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jb3B5RXh0ZW5zaW9ucyhmcm9tLmV4dGVuc2lvbnNSZXNvdXJjZSwgdG8uZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9EaXNhYmxlID0gYXdhaXQgdGhpcy53aXRoUHJvZmlsZVNjb3BlZFNlcnZpY2VzKGZyb20sIGFzeW5jIChleHRlbnNpb25FbmFibGVtZW50U2VydmljZSkgPT5cblx0XHRcdGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpKTtcblx0XHRpZiAoZGlzYWJsZUV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHRvLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0Rpc2FibGUucHVzaChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMud2l0aFByb2ZpbGVTY29wZWRTZXJ2aWNlcyh0bywgYXN5bmMgKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSA9PlxuXHRcdFx0UHJvbWlzZS5hbGwoZXh0ZW5zaW9uc1RvRGlzYWJsZS5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oZXh0ZW5zaW9uKSkpKTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsRXh0ZW5zaW9ucyhwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxJUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMud2l0aFByb2ZpbGVTY29wZWRTZXJ2aWNlcyhwcm9maWxlLCBhc3luYyAoZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJUHJvZmlsZUV4dGVuc2lvbiAmIHsgZGlzcGxheU5hbWU/OiBzdHJpbmcgfT4oKTtcblx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IGRpc2FibGVkRXh0ZW5zaW9ucyA9IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgaW5zdGFsbGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCB7IGlkZW50aWZpZXIsIHByZVJlbGVhc2UgfSA9IGV4dGVuc2lvbjtcblx0XHRcdFx0Y29uc3QgZGlzYWJsZWQgPSBkaXNhYmxlZEV4dGVuc2lvbnMuc29tZShkaXNhYmxlZEV4dGVuc2lvbiA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbiwgaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiAhZGlzYWJsZWQpIHtcblx0XHRcdFx0XHQvLyBza2lwIGVuYWJsZWQgYnVpbHRpbiBleHRlbnNpb25zXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFleHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRcdFx0aWYgKCFleHRlbnNpb24uaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdFx0XHQvLyBza2lwIHVzZXIgZXh0ZW5zaW9ucyB3aXRob3V0IHV1aWRcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHJlc3VsdC5nZXQoaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nPy5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdC8vIFJlbW92ZSB0aGUgZHVwbGljYXRlIGRpc2FibGVkIGV4dGVuc2lvblxuXHRcdFx0XHRcdHJlc3VsdC5kZWxldGUoaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcm9maWxlRXh0ZW5zaW9uOiBJUHJvZmlsZUV4dGVuc2lvbiA9IHsgaWRlbnRpZmllciwgZGlzcGxheU5hbWU6IGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB9O1xuXHRcdFx0XHRpZiAoZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRwcm9maWxlRXh0ZW5zaW9uLmRpc2FibGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgZXh0ZW5zaW9uLnBpbm5lZCkge1xuXHRcdFx0XHRcdHByb2ZpbGVFeHRlbnNpb24udmVyc2lvbiA9IGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcHJvZmlsZUV4dGVuc2lvbi52ZXJzaW9uICYmIHByZVJlbGVhc2UpIHtcblx0XHRcdFx0XHRwcm9maWxlRXh0ZW5zaW9uLnByZVJlbGVhc2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb2ZpbGVFeHRlbnNpb24uYXBwbGljYXRpb25TY29wZWQgPSBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZDtcblx0XHRcdFx0cmVzdWx0LnNldChwcm9maWxlRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgcHJvZmlsZUV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnJlc3VsdC52YWx1ZXMoKV07XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRQcm9maWxlRXh0ZW5zaW9ucyhjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPElQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aFByb2ZpbGVTY29wZWRTZXJ2aWNlczxUPihwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBmbjogKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS53aXRoUHJvZmlsZVNjb3BlZFN0b3JhZ2VTZXJ2aWNlKHByb2ZpbGUsXG5cdFx0XHRhc3luYyBzdG9yYWdlU2VydmljZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZV0pKSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IGZuKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBFeHRlbnNpb25zUmVzb3VyY2VUcmVlSXRlbSBpbXBsZW1lbnRzIElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9IFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucztcblx0cmVhZG9ubHkgaGFuZGxlID0gUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zO1xuXHRyZWFkb25seSBsYWJlbCA9IHsgbGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpIH07XG5cdHJlYWRvbmx5IGNvbGxhcHNpYmxlU3RhdGUgPSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQ7XG5cdGNvbnRleHRWYWx1ZSA9IFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucztcblx0Y2hlY2tib3g6IElUcmVlSXRlbUNoZWNrYm94U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGV4Y2x1ZGVkRXh0ZW5zaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGFzeW5jIGdldENoaWxkcmVuKCk6IFByb21pc2U8QXJyYXk8SVByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW0gJiBJUHJvZmlsZUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gKGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9ucygpKS5zb3J0KChhLCBiKSA9PiAoYS5kaXNwbGF5TmFtZSA/PyBhLmlkZW50aWZpZXIuaWQpLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSA/PyBiLmlkZW50aWZpZXIuaWQpKTtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5tYXA8SVByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW0gJiBJUHJvZmlsZUV4dGVuc2lvbj4oZSA9PiAoe1xuXHRcdFx0Li4uZSxcblx0XHRcdGhhbmRsZTogZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksXG5cdFx0XHRwYXJlbnQ6IHRoaXMsXG5cdFx0XHRsYWJlbDogeyBsYWJlbDogZS5kaXNwbGF5TmFtZSB8fCBlLmlkZW50aWZpZXIuaWQgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBlLmFwcGxpY2F0aW9uU2NvcGVkID8gbG9jYWxpemUoJ2FsbCBwcm9maWxlcyBhbmQgZGlzYWJsZWQnLCBcIkFsbCBQcm9maWxlc1wiKSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0Y2hlY2tib3g6IHRoYXQuY2hlY2tib3ggPyB7XG5cdFx0XHRcdGdldCBpc0NoZWNrZWQoKSB7IHJldHVybiAhdGhhdC5leGNsdWRlZEV4dGVuc2lvbnMuaGFzKGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTsgfSxcblx0XHRcdFx0c2V0IGlzQ2hlY2tlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhhdC5leGNsdWRlZEV4dGVuc2lvbnMuZGVsZXRlKGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhhdC5leGNsdWRlZEV4dGVuc2lvbnMuYWRkKGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdleGNsdWRlJywgXCJTZWxlY3QgezB9IEV4dGVuc2lvblwiLCBlLmRpc3BsYXlOYW1lIHx8IGUuaWRlbnRpZmllci5pZCksXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXhjbHVkZScsIFwiU2VsZWN0IHswfSBFeHRlbnNpb25cIiwgZS5kaXNwbGF5TmFtZSB8fCBlLmlkZW50aWZpZXIuaWQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLmV4dGVuc2lvbnMsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnZXh0ZW5zaW9uLm9wZW4nLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGFyZ3VtZW50czogW2UuaWRlbnRpZmllci5pZCwgdW5kZWZpbmVkLCB0cnVlXVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGhhc0NvbnRlbnQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9ucygpO1xuXHRcdHJldHVybiBleHRlbnNpb25zLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhYnN0cmFjdCBpc0Zyb21EZWZhdWx0UHJvZmlsZSgpOiBib29sZWFuO1xuXHRhYnN0cmFjdCBnZXRDb250ZW50KCk6IFByb21pc2U8c3RyaW5nPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEV4dGVuc2lvbnMoKTogUHJvbWlzZTxJUHJvZmlsZUV4dGVuc2lvbltdPjtcblxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1Jlc291cmNlRXhwb3J0VHJlZUl0ZW0gZXh0ZW5kcyBFeHRlbnNpb25zUmVzb3VyY2VUcmVlSXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aXNGcm9tRGVmYXVsdFByb2ZpbGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLnByb2ZpbGUuaXNEZWZhdWx0ICYmICEhdGhpcy5wcm9maWxlLnVzZURlZmF1bHRGbGFncz8uZXh0ZW5zaW9ucztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRFeHRlbnNpb25zKCk6IFByb21pc2U8SVByb2ZpbGVFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuZ2V0TG9jYWxFeHRlbnNpb25zKHRoaXMucHJvZmlsZSk7XG5cdH1cblxuXHRhc3luYyBnZXRDb250ZW50KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlKS5nZXRDb250ZW50KHRoaXMucHJvZmlsZSwgWy4uLnRoaXMuZXhjbHVkZWRFeHRlbnNpb25zLnZhbHVlcygpXSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1Jlc291cmNlSW1wb3J0VHJlZUl0ZW0gZXh0ZW5kcyBFeHRlbnNpb25zUmVzb3VyY2VUcmVlSXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50OiBzdHJpbmcsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRpc0Zyb21EZWZhdWx0UHJvZmlsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RXh0ZW5zaW9ucygpOiBQcm9taXNlPElQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2UpLmdldFByb2ZpbGVFeHRlbnNpb25zKHRoaXMuY29udGVudCk7XG5cdH1cblxuXHRhc3luYyBnZXRDb250ZW50KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1Jlc291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCBleHRlbnNpb25zUmVzb3VyY2UuZ2V0UHJvZmlsZUV4dGVuc2lvbnModGhpcy5jb250ZW50KTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uc1Jlc291cmNlLnRvQ29udGVudChleHRlbnNpb25zLCBbLi4udGhpcy5leGNsdWRlZEV4dGVuc2lvbnMudmFsdWVzKCldKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGdEQUFnRCw0Q0FBNEMsMEJBQWdELDZCQUE2Qix5Q0FBZ0Y7QUFDbFEsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5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
