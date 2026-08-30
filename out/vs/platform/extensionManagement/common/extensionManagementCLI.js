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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Schemas } from "../../../base/common/network.js";
import { basename } from "../../../base/common/resources.js";
import { gt } from "../../../base/common/semver/semver.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { EXTENSION_IDENTIFIER_REGEX, IExtensionGalleryService, IExtensionManagementService, InstallOperation } from "./extensionManagement.js";
import { areSameExtensions, getExtensionId, getGalleryExtensionId, getIdAndVersion } from "./extensionManagementUtil.js";
import { ExtensionType, EXTENSION_CATEGORIES } from "../../extensions/common/extensions.js";
import { IProductService } from "../../product/common/productService.js";
const notFound = (id) => localize("notFound", "Extension '{0}' not found.", id);
const useId = localize("useId", "Make sure you use the full extension ID, including the publisher, e.g.: {0}", "ms-dotnettools.csharp");
let ExtensionManagementCLI = class {
  constructor(extensionsForceVersionByQuality, logger, extensionManagementService, extensionGalleryService, productService) {
    this.extensionsForceVersionByQuality = extensionsForceVersionByQuality;
    this.logger = logger;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.productService = productService;
    this.extensionsForceVersionByQuality = this.extensionsForceVersionByQuality.map((e) => e.toLowerCase());
  }
  get location() {
    return void 0;
  }
  async listExtensions(showVersions, category, profileLocation) {
    let extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);
    const categories = EXTENSION_CATEGORIES.map((c) => c.toLowerCase());
    if (category && category !== "") {
      if (categories.indexOf(category.toLowerCase()) < 0) {
        this.logger.info("Invalid category please enter a valid category. To list valid categories run --category without a category specified");
        return;
      }
      extensions = extensions.filter((e) => {
        if (e.manifest.categories) {
          const lowerCaseCategories = e.manifest.categories.map((c) => c.toLowerCase());
          return lowerCaseCategories.indexOf(category.toLowerCase()) > -1;
        }
        return false;
      });
    } else if (category === "") {
      this.logger.info("Possible Categories: ");
      categories.forEach((category2) => {
        this.logger.info(category2);
      });
      return;
    }
    if (this.location) {
      this.logger.info(localize("listFromLocation", "Extensions installed on {0}:", this.location));
    }
    extensions = extensions.sort((e1, e2) => e1.identifier.id.localeCompare(e2.identifier.id));
    let lastId = void 0;
    for (const extension of extensions) {
      if (lastId !== extension.identifier.id) {
        lastId = extension.identifier.id;
        this.logger.info(showVersions ? `${lastId}@${extension.manifest.version}` : lastId);
      }
    }
  }
  async installExtensions(extensions, builtinExtensions, installOptions, force) {
    const failed = [];
    try {
      if (extensions.length) {
        this.logger.info(this.location ? localize("installingExtensionsOnLocation", "Installing extensions on {0}...", this.location) : localize("installingExtensions", "Installing extensions..."));
      }
      const installVSIXInfos = [];
      const installExtensionInfos = [];
      const addInstallExtensionInfo = (id, version, isBuiltin) => {
        if (this.extensionsForceVersionByQuality?.some((e) => e === id.toLowerCase())) {
          version = this.productService.quality !== "stable" ? "prerelease" : void 0;
        }
        installExtensionInfos.push({ id, version: version !== "prerelease" ? version : void 0, installOptions: { ...installOptions, isBuiltin, installPreReleaseVersion: version === "prerelease" || installOptions.installPreReleaseVersion } });
      };
      for (const extension of extensions) {
        if (extension instanceof URI) {
          installVSIXInfos.push({ vsix: extension, installOptions });
        } else {
          const [id, version] = getIdAndVersion(extension);
          addInstallExtensionInfo(id, version, false);
        }
      }
      for (const extension of builtinExtensions) {
        if (extension instanceof URI) {
          installVSIXInfos.push({ vsix: extension, installOptions: { ...installOptions, isBuiltin: true, donotIncludePackAndDependencies: true } });
        } else {
          const [id, version] = getIdAndVersion(extension);
          addInstallExtensionInfo(id, version, true);
        }
      }
      const installed = await this.extensionManagementService.getInstalled(void 0, installOptions.profileLocation);
      if (installVSIXInfos.length) {
        await Promise.all(installVSIXInfos.map(async ({ vsix, installOptions: installOptions2 }) => {
          try {
            await this.installVSIX(vsix, installOptions2, force, installed);
          } catch (err) {
            this.logger.error(err);
            failed.push(vsix.toString());
          }
        }));
      }
      if (installExtensionInfos.length) {
        const failedGalleryExtensions = await this.installGalleryExtensions(installExtensionInfos, installed, force);
        failed.push(...failedGalleryExtensions);
      }
    } catch (error) {
      this.logger.error(localize("error while installing extensions", "Error while installing extensions: {0}", getErrorMessage(error)));
      throw error;
    }
    if (failed.length) {
      throw new Error(localize("installation failed", "Failed Installing Extensions: {0}", failed.join(", ")));
    }
  }
  async updateExtensions(profileLocation) {
    const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);
    const installedExtensionsQuery = [];
    for (const extension of installedExtensions) {
      if (!!extension.identifier.uuid) {
        installedExtensionsQuery.push({ ...extension.identifier, preRelease: extension.preRelease });
      }
    }
    this.logger.trace(localize({ key: "updateExtensionsQuery", comment: ["Placeholder is for the count of extensions"] }, "Fetching latest versions for {0} extensions", installedExtensionsQuery.length));
    const availableVersions = await this.extensionGalleryService.getExtensions(installedExtensionsQuery, { compatible: true }, CancellationToken.None);
    const extensionsToUpdate = [];
    for (const newVersion of availableVersions) {
      for (const oldVersion of installedExtensions) {
        if (areSameExtensions(oldVersion.identifier, newVersion.identifier) && gt(newVersion.version, oldVersion.manifest.version)) {
          extensionsToUpdate.push({
            extension: newVersion,
            options: { operation: InstallOperation.Update, installPreReleaseVersion: oldVersion.preRelease, profileLocation, isApplicationScoped: oldVersion.isApplicationScoped }
          });
        }
      }
    }
    if (!extensionsToUpdate.length) {
      this.logger.info(localize("updateExtensionsNoExtensions", "No extension to update"));
      return;
    }
    this.logger.info(localize("updateExtensionsNewVersionsAvailable", "Updating extensions: {0}", extensionsToUpdate.map((ext) => ext.extension.identifier.id).join(", ")));
    const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToUpdate);
    for (const extensionResult of installationResult) {
      if (extensionResult.error) {
        this.logger.error(localize("errorUpdatingExtension", "Error while updating extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
      } else {
        this.logger.info(localize("successUpdate", "Extension '{0}' v{1} was successfully updated.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
      }
    }
  }
  async installGalleryExtensions(installExtensionInfos, installed, force) {
    installExtensionInfos = installExtensionInfos.filter((installExtensionInfo) => {
      const { id, version, installOptions } = installExtensionInfo;
      const installedExtension = installed.find((i) => areSameExtensions(i.identifier, { id }));
      if (installedExtension) {
        const builtinAutoUpdateMessage = this.validateBuiltinExtensionEnabledWithAutoUpdates(installedExtension);
        if (builtinAutoUpdateMessage) {
          this.logger.info(builtinAutoUpdateMessage);
          return false;
        }
        if (!force && (!version || version === "prerelease" && installedExtension.preRelease)) {
          this.logger.info(localize("alreadyInstalled-checkAndUpdate", "Extension '{0}' v{1} is already installed. Use '--force' option to update to latest version or provide '@<version>' to install a specific version, for example: '{2}@1.2.3'.", id, installedExtension.manifest.version, id));
          return false;
        }
        if (version && installedExtension.manifest.version === version) {
          this.logger.info(localize("alreadyInstalled", "Extension '{0}' is already installed.", `${id}@${version}`));
          return false;
        }
        if (installedExtension.preRelease && version !== "prerelease") {
          installOptions.preRelease = false;
        }
      }
      return true;
    });
    if (!installExtensionInfos.length) {
      return [];
    }
    const failed = [];
    const extensionsToInstall = [];
    const galleryExtensions = await this.getGalleryExtensions(installExtensionInfos);
    await Promise.all(installExtensionInfos.map(async ({ id, version, installOptions }) => {
      const gallery = galleryExtensions.get(id.toLowerCase());
      if (!gallery) {
        this.logger.error(`${notFound(version ? `${id}@${version}` : id)}
${useId}`);
        failed.push(id);
        return;
      }
      try {
        const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
        if (manifest && !this.validateExtensionKind(manifest)) {
          return;
        }
      } catch (err) {
        this.logger.error(err.message || err.stack || err);
        failed.push(id);
        return;
      }
      const installedExtension = installed.find((e) => areSameExtensions(e.identifier, gallery.identifier));
      if (installedExtension) {
        if (gallery.version === installedExtension.manifest.version) {
          this.logger.info(localize("alreadyInstalled", "Extension '{0}' is already installed.", version ? `${id}@${version}` : id));
          return;
        }
        this.logger.info(localize("updateMessage", "Updating the extension '{0}' to the version {1}", id, gallery.version));
      }
      if (installOptions.isBuiltin) {
        this.logger.info(version ? localize("installing builtin with version", "Installing builtin extension '{0}' v{1}...", id, version) : localize("installing builtin ", "Installing builtin extension '{0}'...", id));
      } else {
        this.logger.info(version ? localize("installing with version", "Installing extension '{0}' v{1}...", id, version) : localize("installing", "Installing extension '{0}'...", id));
      }
      extensionsToInstall.push({
        extension: gallery,
        options: { ...installOptions, installGivenVersion: !!version, isApplicationScoped: installOptions.isApplicationScoped || installedExtension?.isApplicationScoped }
      });
    }));
    if (extensionsToInstall.length) {
      const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
      for (const extensionResult of installationResult) {
        if (extensionResult.error) {
          this.logger.error(localize("errorInstallingExtension", "Error while installing extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
          failed.push(extensionResult.identifier.id);
        } else {
          this.logger.info(localize("successInstall", "Extension '{0}' v{1} was successfully installed.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
        }
      }
    }
    return failed;
  }
  async installVSIX(vsix, installOptions, force, installedExtensions) {
    const manifest = await this.extensionManagementService.getManifest(vsix);
    if (!manifest) {
      throw new Error("Invalid vsix");
    }
    const valid = await this.validateVSIX(manifest, force, installOptions.profileLocation, installedExtensions);
    if (valid) {
      try {
        await this.extensionManagementService.install(vsix, { ...installOptions, installGivenVersion: true });
        this.logger.info(localize("successVsixInstall", "Extension '{0}' was successfully installed.", basename(vsix)));
      } catch (error) {
        if (isCancellationError(error)) {
          this.logger.info(localize("cancelVsixInstall", "Cancelled installing extension '{0}'.", basename(vsix)));
        } else {
          throw error;
        }
      }
    }
  }
  async getGalleryExtensions(extensions) {
    const galleryExtensions = /* @__PURE__ */ new Map();
    const preRelease = extensions.some((e) => e.installOptions.installPreReleaseVersion);
    const targetPlatform = await this.extensionManagementService.getTargetPlatform();
    const extensionInfos = [];
    for (const extension of extensions) {
      if (EXTENSION_IDENTIFIER_REGEX.test(extension.id)) {
        extensionInfos.push({ ...extension, preRelease });
      }
    }
    if (extensionInfos.length) {
      const result = await this.extensionGalleryService.getExtensions(extensionInfos, { targetPlatform }, CancellationToken.None);
      for (const extension of result) {
        galleryExtensions.set(extension.identifier.id.toLowerCase(), extension);
      }
    }
    return galleryExtensions;
  }
  validateExtensionKind(_manifest) {
    return true;
  }
  async validateVSIX(manifest, force, profileLocation, installedExtensions) {
    const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
    const existingExtension = installedExtensions.find((local) => areSameExtensions(extensionIdentifier, local.identifier));
    if (existingExtension) {
      const builtinAutoUpdateMessage = this.validateBuiltinExtensionEnabledWithAutoUpdates(existingExtension);
      if (builtinAutoUpdateMessage) {
        this.logger.info(builtinAutoUpdateMessage);
        return false;
      }
      if (!force) {
        if (gt(existingExtension.manifest.version, manifest.version)) {
          this.logger.info(localize("forceDowngrade", "A newer version of extension '{0}' v{1} is already installed. Use '--force' option to downgrade to older version.", existingExtension.identifier.id, existingExtension.manifest.version, manifest.version));
          return false;
        }
      }
    }
    return this.validateExtensionKind(manifest);
  }
  async uninstallExtensions(extensions, force, profileLocation) {
    const getId = async (extensionDescription) => {
      if (extensionDescription instanceof URI) {
        const manifest = await this.extensionManagementService.getManifest(extensionDescription);
        return getExtensionId(manifest.publisher, manifest.name);
      }
      return extensionDescription;
    };
    const uninstalledExtensions = [];
    for (const extension of extensions) {
      const id = await getId(extension);
      const installed = await this.extensionManagementService.getInstalled(void 0, profileLocation);
      const extensionsToUninstall = installed.filter((e) => areSameExtensions(e.identifier, { id }));
      if (!extensionsToUninstall.length) {
        throw new Error(`${this.notInstalled(id)}
${useId}`);
      }
      if (extensionsToUninstall.some((e) => e.type === ExtensionType.System)) {
        this.logger.info(localize("builtin", "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
        return;
      }
      if (!force && extensionsToUninstall.some((e) => e.isBuiltin)) {
        this.logger.info(localize("forceUninstall", "Extension '{0}' is marked as a Built-in extension by user. Please use '--force' option to uninstall it.", id));
        return;
      }
      this.logger.info(localize("uninstalling", "Uninstalling {0}...", id));
      for (const extensionToUninstall of extensionsToUninstall) {
        await this.extensionManagementService.uninstall(extensionToUninstall, { profileLocation });
        uninstalledExtensions.push(extensionToUninstall);
      }
      if (this.location) {
        this.logger.info(localize("successUninstallFromLocation", "Extension '{0}' was successfully uninstalled from {1}!", id, this.location));
      } else {
        this.logger.info(localize("successUninstall", "Extension '{0}' was successfully uninstalled!", id));
      }
    }
  }
  async locateExtension(extensions) {
    const installed = await this.extensionManagementService.getInstalled();
    extensions.forEach((e) => {
      installed.forEach((i) => {
        if (i.identifier.id === e) {
          if (i.location.scheme === Schemas.file) {
            this.logger.info(i.location.fsPath);
            return;
          }
        }
      });
    });
  }
  notInstalled(id) {
    return this.location ? localize("notInstalleddOnLocation", "Extension '{0}' is not installed on {1}.", id, this.location) : localize("notInstalled", "Extension '{0}' is not installed.", id);
  }
  validateBuiltinExtensionEnabledWithAutoUpdates(extension) {
    if (extension.isBuiltin && this.productService.builtInExtensionsEnabledWithAutoUpdates.some((e) => e.toLowerCase() === extension.identifier.id.toLowerCase()) && !extension.forceAutoUpdate) {
      return localize("builtinAutoUpdate", "Extension '{0}' is a built-in extension and not allowed to be updated in the current product quality '{1}'.", extension.identifier.id, this.productService.quality);
    }
    return void 0;
  }
};
ExtensionManagementCLI = __decorateClass([
  __decorateParam(2, IExtensionManagementService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IProductService)
], ExtensionManagementCLI);
export {
  ExtensionManagementCLI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25NYW5hZ2VtZW50Q0xJLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGd0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2VtdmVyL3NlbXZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVgsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbkluZm8sIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdhbGxlcnlFeHRlbnNpb24sIElMb2NhbEV4dGVuc2lvbiwgSW5zdGFsbE9wdGlvbnMsIEluc3RhbGxFeHRlbnNpb25JbmZvLCBJbnN0YWxsT3BlcmF0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBnZXRFeHRlbnNpb25JZCwgZ2V0R2FsbGVyeUV4dGVuc2lvbklkLCBnZXRJZEFuZFZlcnNpb24gfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIEVYVEVOU0lPTl9DQVRFR09SSUVTLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dnZXIgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cblxuY29uc3Qgbm90Rm91bmQgPSAoaWQ6IHN0cmluZykgPT4gbG9jYWxpemUoJ25vdEZvdW5kJywgXCJFeHRlbnNpb24gJ3swfScgbm90IGZvdW5kLlwiLCBpZCk7XG5jb25zdCB1c2VJZCA9IGxvY2FsaXplKCd1c2VJZCcsIFwiTWFrZSBzdXJlIHlvdSB1c2UgdGhlIGZ1bGwgZXh0ZW5zaW9uIElELCBpbmNsdWRpbmcgdGhlIHB1Ymxpc2hlciwgZS5nLjogezB9XCIsICdtcy1kb3RuZXR0b29scy5jc2hhcnAnKTtcblxudHlwZSBJbnN0YWxsVlNJWEluZm8gPSB7IHZzaXg6IFVSSTsgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zIH07XG50eXBlIEluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9uSW5mbyA9IHsgaWQ6IHN0cmluZzsgdmVyc2lvbj86IHN0cmluZzsgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zIH07XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50Q0xJIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNGb3JjZVZlcnNpb25CeVF1YWxpdHk6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBsb2dnZXI6IElMb2dnZXIsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0ZvcmNlVmVyc2lvbkJ5UXVhbGl0eSA9IHRoaXMuZXh0ZW5zaW9uc0ZvcmNlVmVyc2lvbkJ5UXVhbGl0eS5tYXAoZSA9PiBlLnRvTG93ZXJDYXNlKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBsb2NhdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbGlzdEV4dGVuc2lvbnMoc2hvd1ZlcnNpb25zOiBib29sZWFuLCBjYXRlZ29yeT86IHN0cmluZywgcHJvZmlsZUxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgY2F0ZWdvcmllcyA9IEVYVEVOU0lPTl9DQVRFR09SSUVTLm1hcChjID0+IGMudG9Mb3dlckNhc2UoKSk7XG5cdFx0aWYgKGNhdGVnb3J5ICYmIGNhdGVnb3J5ICE9PSAnJykge1xuXHRcdFx0aWYgKGNhdGVnb3JpZXMuaW5kZXhPZihjYXRlZ29yeS50b0xvd2VyQ2FzZSgpKSA8IDApIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbygnSW52YWxpZCBjYXRlZ29yeSBwbGVhc2UgZW50ZXIgYSB2YWxpZCBjYXRlZ29yeS4gVG8gbGlzdCB2YWxpZCBjYXRlZ29yaWVzIHJ1biAtLWNhdGVnb3J5IHdpdGhvdXQgYSBjYXRlZ29yeSBzcGVjaWZpZWQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5tYW5pZmVzdC5jYXRlZ29yaWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbG93ZXJDYXNlQ2F0ZWdvcmllczogc3RyaW5nW10gPSBlLm1hbmlmZXN0LmNhdGVnb3JpZXMubWFwKGMgPT4gYy50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHRyZXR1cm4gbG93ZXJDYXNlQ2F0ZWdvcmllcy5pbmRleE9mKGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkpID4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChjYXRlZ29yeSA9PT0gJycpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmluZm8oJ1Bvc3NpYmxlIENhdGVnb3JpZXM6ICcpO1xuXHRcdFx0Y2F0ZWdvcmllcy5mb3JFYWNoKGNhdGVnb3J5ID0+IHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhjYXRlZ29yeSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMubG9jYXRpb24pIHtcblx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ2xpc3RGcm9tTG9jYXRpb24nLCBcIkV4dGVuc2lvbnMgaW5zdGFsbGVkIG9uIHswfTpcIiwgdGhpcy5sb2NhdGlvbikpO1xuXHRcdH1cblxuXHRcdGV4dGVuc2lvbnMgPSBleHRlbnNpb25zLnNvcnQoKGUxLCBlMikgPT4gZTEuaWRlbnRpZmllci5pZC5sb2NhbGVDb21wYXJlKGUyLmlkZW50aWZpZXIuaWQpKTtcblx0XHRsZXQgbGFzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGxhc3RJZCAhPT0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpIHtcblx0XHRcdFx0bGFzdElkID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8oc2hvd1ZlcnNpb25zID8gYCR7bGFzdElkfUAke2V4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9ufWAgOiBsYXN0SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBpbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiAoc3RyaW5nIHwgVVJJKVtdLCBidWlsdGluRXh0ZW5zaW9uczogKHN0cmluZyB8IFVSSSlbXSwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZhaWxlZDogc3RyaW5nW10gPSBbXTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyh0aGlzLmxvY2F0aW9uID8gbG9jYWxpemUoJ2luc3RhbGxpbmdFeHRlbnNpb25zT25Mb2NhdGlvbicsIFwiSW5zdGFsbGluZyBleHRlbnNpb25zIG9uIHswfS4uLlwiLCB0aGlzLmxvY2F0aW9uKSA6IGxvY2FsaXplKCdpbnN0YWxsaW5nRXh0ZW5zaW9ucycsIFwiSW5zdGFsbGluZyBleHRlbnNpb25zLi4uXCIpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5zdGFsbFZTSVhJbmZvczogSW5zdGFsbFZTSVhJbmZvW10gPSBbXTtcblx0XHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25JbmZvczogSW5zdGFsbEdhbGxlcnlFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRcdGNvbnN0IGFkZEluc3RhbGxFeHRlbnNpb25JbmZvID0gKGlkOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNCdWlsdGluOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnNGb3JjZVZlcnNpb25CeVF1YWxpdHk/LnNvbWUoZSA9PiBlID09PSBpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdHZlcnNpb24gPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnID8gJ3ByZXJlbGVhc2UnIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluc3RhbGxFeHRlbnNpb25JbmZvcy5wdXNoKHsgaWQsIHZlcnNpb246IHZlcnNpb24gIT09ICdwcmVyZWxlYXNlJyA/IHZlcnNpb24gOiB1bmRlZmluZWQsIGluc3RhbGxPcHRpb25zOiB7IC4uLmluc3RhbGxPcHRpb25zLCBpc0J1aWx0aW4sIGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdmVyc2lvbiA9PT0gJ3ByZXJlbGVhc2UnIHx8IGluc3RhbGxPcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiB9IH0pO1xuXHRcdFx0fTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRcdGluc3RhbGxWU0lYSW5mb3MucHVzaCh7IHZzaXg6IGV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnMgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgW2lkLCB2ZXJzaW9uXSA9IGdldElkQW5kVmVyc2lvbihleHRlbnNpb24pO1xuXHRcdFx0XHRcdGFkZEluc3RhbGxFeHRlbnNpb25JbmZvKGlkLCB2ZXJzaW9uLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGJ1aWx0aW5FeHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0XHRpbnN0YWxsVlNJWEluZm9zLnB1c2goeyB2c2l4OiBleHRlbnNpb24sIGluc3RhbGxPcHRpb25zOiB7IC4uLmluc3RhbGxPcHRpb25zLCBpc0J1aWx0aW46IHRydWUsIGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM6IHRydWUgfSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBbaWQsIHZlcnNpb25dID0gZ2V0SWRBbmRWZXJzaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0YWRkSW5zdGFsbEV4dGVuc2lvbkluZm8oaWQsIHZlcnNpb24sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblxuXHRcdFx0aWYgKGluc3RhbGxWU0lYSW5mb3MubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGluc3RhbGxWU0lYSW5mb3MubWFwKGFzeW5jICh7IHZzaXgsIGluc3RhbGxPcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YWxsVlNJWCh2c2l4LCBpbnN0YWxsT3B0aW9ucywgZm9yY2UsIGluc3RhbGxlZCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0ZmFpbGVkLnB1c2godnNpeC50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGluc3RhbGxFeHRlbnNpb25JbmZvcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgZmFpbGVkR2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhpbnN0YWxsRXh0ZW5zaW9uSW5mb3MsIGluc3RhbGxlZCwgZm9yY2UpO1xuXHRcdFx0XHRmYWlsZWQucHVzaCguLi5mYWlsZWRHYWxsZXJ5RXh0ZW5zaW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGxvY2FsaXplKCdlcnJvciB3aGlsZSBpbnN0YWxsaW5nIGV4dGVuc2lvbnMnLCBcIkVycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9uczogezB9XCIsIGdldEVycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdGlmIChmYWlsZWQubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2luc3RhbGxhdGlvbiBmYWlsZWQnLCBcIkZhaWxlZCBJbnN0YWxsaW5nIEV4dGVuc2lvbnM6IHswfVwiLCBmYWlsZWQuam9pbignLCAnKSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbj86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGVMb2NhdGlvbik7XG5cblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zUXVlcnk6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnN0YWxsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoISFleHRlbnNpb24uaWRlbnRpZmllci51dWlkKSB7IC8vIE5vIG5lZWQgdG8gY2hlY2sgbmV3IHZlcnNpb24gZm9yIGFuIHVucHVibGlzaGVkIGV4dGVuc2lvblxuXHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkucHVzaCh7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBwcmVSZWxlYXNlOiBleHRlbnNpb24ucHJlUmVsZWFzZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmxvZ2dlci50cmFjZShsb2NhbGl6ZSh7IGtleTogJ3VwZGF0ZUV4dGVuc2lvbnNRdWVyeScsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgaXMgZm9yIHRoZSBjb3VudCBvZiBleHRlbnNpb25zJ10gfSwgXCJGZXRjaGluZyBsYXRlc3QgdmVyc2lvbnMgZm9yIHswfSBleHRlbnNpb25zXCIsIGluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeS5sZW5ndGgpKTtcblx0XHRjb25zdCBhdmFpbGFibGVWZXJzaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhpbnN0YWxsZWRFeHRlbnNpb25zUXVlcnksIHsgY29tcGF0aWJsZTogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb1VwZGF0ZTogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbmV3VmVyc2lvbiBvZiBhdmFpbGFibGVWZXJzaW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBvbGRWZXJzaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKG9sZFZlcnNpb24uaWRlbnRpZmllciwgbmV3VmVyc2lvbi5pZGVudGlmaWVyKSAmJiBndChuZXdWZXJzaW9uLnZlcnNpb24sIG9sZFZlcnNpb24ubWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zVG9VcGRhdGUucHVzaCh7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG5ld1ZlcnNpb24sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUsIGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogb2xkVmVyc2lvbi5wcmVSZWxlYXNlLCBwcm9maWxlTG9jYXRpb24sIGlzQXBwbGljYXRpb25TY29wZWQ6IG9sZFZlcnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbnNUb1VwZGF0ZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3VwZGF0ZUV4dGVuc2lvbnNOb0V4dGVuc2lvbnMnLCBcIk5vIGV4dGVuc2lvbiB0byB1cGRhdGVcIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3VwZGF0ZUV4dGVuc2lvbnNOZXdWZXJzaW9uc0F2YWlsYWJsZScsIFwiVXBkYXRpbmcgZXh0ZW5zaW9uczogezB9XCIsIGV4dGVuc2lvbnNUb1VwZGF0ZS5tYXAoZXh0ID0+IGV4dC5leHRlbnNpb24uaWRlbnRpZmllci5pZCkuam9pbignLCAnKSkpO1xuXHRcdGNvbnN0IGluc3RhbGxhdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnNUb1VwZGF0ZSk7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblJlc3VsdCBvZiBpbnN0YWxsYXRpb25SZXN1bHQpIHtcblx0XHRcdGlmIChleHRlbnNpb25SZXN1bHQuZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IobG9jYWxpemUoJ2Vycm9yVXBkYXRpbmdFeHRlbnNpb24nLCBcIkVycm9yIHdoaWxlIHVwZGF0aW5nIGV4dGVuc2lvbiB7MH06IHsxfVwiLCBleHRlbnNpb25SZXN1bHQuaWRlbnRpZmllci5pZCwgZ2V0RXJyb3JNZXNzYWdlKGV4dGVuc2lvblJlc3VsdC5lcnJvcikpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3N1Y2Nlc3NVcGRhdGUnLCBcIkV4dGVuc2lvbiAnezB9JyB2ezF9IHdhcyBzdWNjZXNzZnVsbHkgdXBkYXRlZC5cIiwgZXh0ZW5zaW9uUmVzdWx0LmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvblJlc3VsdC5sb2NhbD8ubWFuaWZlc3QudmVyc2lvbikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGluc3RhbGxFeHRlbnNpb25JbmZvczogSW5zdGFsbEdhbGxlcnlFeHRlbnNpb25JbmZvW10sIGluc3RhbGxlZDogSUxvY2FsRXh0ZW5zaW9uW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGluc3RhbGxFeHRlbnNpb25JbmZvcyA9IGluc3RhbGxFeHRlbnNpb25JbmZvcy5maWx0ZXIoaW5zdGFsbEV4dGVuc2lvbkluZm8gPT4ge1xuXHRcdFx0Y29uc3QgeyBpZCwgdmVyc2lvbiwgaW5zdGFsbE9wdGlvbnMgfSA9IGluc3RhbGxFeHRlbnNpb25JbmZvO1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uID0gaW5zdGFsbGVkLmZpbmQoaSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpLmlkZW50aWZpZXIsIHsgaWQgfSkpO1xuXHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbikge1xuXHRcdFx0XHRjb25zdCBidWlsdGluQXV0b1VwZGF0ZU1lc3NhZ2UgPSB0aGlzLnZhbGlkYXRlQnVpbHRpbkV4dGVuc2lvbkVuYWJsZWRXaXRoQXV0b1VwZGF0ZXMoaW5zdGFsbGVkRXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKGJ1aWx0aW5BdXRvVXBkYXRlTWVzc2FnZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8oYnVpbHRpbkF1dG9VcGRhdGVNZXNzYWdlKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFmb3JjZSAmJiAoIXZlcnNpb24gfHwgKHZlcnNpb24gPT09ICdwcmVyZWxlYXNlJyAmJiBpbnN0YWxsZWRFeHRlbnNpb24ucHJlUmVsZWFzZSkpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnYWxyZWFkeUluc3RhbGxlZC1jaGVja0FuZFVwZGF0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIHZ7MX0gaXMgYWxyZWFkeSBpbnN0YWxsZWQuIFVzZSAnLS1mb3JjZScgb3B0aW9uIHRvIHVwZGF0ZSB0byBsYXRlc3QgdmVyc2lvbiBvciBwcm92aWRlICdAPHZlcnNpb24+JyB0byBpbnN0YWxsIGEgc3BlY2lmaWMgdmVyc2lvbiwgZm9yIGV4YW1wbGU6ICd7Mn1AMS4yLjMnLlwiLCBpZCwgaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGlkKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2ZXJzaW9uICYmIGluc3RhbGxlZEV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uID09PSB2ZXJzaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnYWxyZWFkeUluc3RhbGxlZCcsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGFscmVhZHkgaW5zdGFsbGVkLlwiLCBgJHtpZH1AJHt2ZXJzaW9ufWApKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbi5wcmVSZWxlYXNlICYmIHZlcnNpb24gIT09ICdwcmVyZWxlYXNlJykge1xuXHRcdFx0XHRcdGluc3RhbGxPcHRpb25zLnByZVJlbGVhc2UgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWluc3RhbGxFeHRlbnNpb25JbmZvcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBmYWlsZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvSW5zdGFsbDogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRHYWxsZXJ5RXh0ZW5zaW9ucyhpbnN0YWxsRXh0ZW5zaW9uSW5mb3MpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGluc3RhbGxFeHRlbnNpb25JbmZvcy5tYXAoYXN5bmMgKHsgaWQsIHZlcnNpb24sIGluc3RhbGxPcHRpb25zIH0pID0+IHtcblx0XHRcdGNvbnN0IGdhbGxlcnkgPSBnYWxsZXJ5RXh0ZW5zaW9ucy5nZXQoaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRpZiAoIWdhbGxlcnkpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYCR7bm90Rm91bmQodmVyc2lvbiA/IGAke2lkfUAke3ZlcnNpb259YCA6IGlkKX1cXG4ke3VzZUlkfWApO1xuXHRcdFx0XHRmYWlsZWQucHVzaChpZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChnYWxsZXJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0aWYgKG1hbmlmZXN0ICYmICF0aGlzLnZhbGlkYXRlRXh0ZW5zaW9uS2luZChtYW5pZmVzdCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihlcnIubWVzc2FnZSB8fCBlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHRcdFx0ZmFpbGVkLnB1c2goaWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb24gPSBpbnN0YWxsZWQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZ2FsbGVyeS5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAoaW5zdGFsbGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGlmIChnYWxsZXJ5LnZlcnNpb24gPT09IGluc3RhbGxlZEV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnYWxyZWFkeUluc3RhbGxlZCcsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGFscmVhZHkgaW5zdGFsbGVkLlwiLCB2ZXJzaW9uID8gYCR7aWR9QCR7dmVyc2lvbn1gIDogaWQpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgndXBkYXRlTWVzc2FnZScsIFwiVXBkYXRpbmcgdGhlIGV4dGVuc2lvbiAnezB9JyB0byB0aGUgdmVyc2lvbiB7MX1cIiwgaWQsIGdhbGxlcnkudmVyc2lvbikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluc3RhbGxPcHRpb25zLmlzQnVpbHRpbikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKHZlcnNpb24gPyBsb2NhbGl6ZSgnaW5zdGFsbGluZyBidWlsdGluIHdpdGggdmVyc2lvbicsIFwiSW5zdGFsbGluZyBidWlsdGluIGV4dGVuc2lvbiAnezB9JyB2ezF9Li4uXCIsIGlkLCB2ZXJzaW9uKSA6IGxvY2FsaXplKCdpbnN0YWxsaW5nIGJ1aWx0aW4gJywgXCJJbnN0YWxsaW5nIGJ1aWx0aW4gZXh0ZW5zaW9uICd7MH0nLi4uXCIsIGlkKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKHZlcnNpb24gPyBsb2NhbGl6ZSgnaW5zdGFsbGluZyB3aXRoIHZlcnNpb24nLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uICd7MH0nIHZ7MX0uLi5cIiwgaWQsIHZlcnNpb24pIDogbG9jYWxpemUoJ2luc3RhbGxpbmcnLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uICd7MH0nLi4uXCIsIGlkKSk7XG5cdFx0XHR9XG5cdFx0XHRleHRlbnNpb25zVG9JbnN0YWxsLnB1c2goe1xuXHRcdFx0XHRleHRlbnNpb246IGdhbGxlcnksXG5cdFx0XHRcdG9wdGlvbnM6IHsgLi4uaW5zdGFsbE9wdGlvbnMsIGluc3RhbGxHaXZlblZlcnNpb246ICEhdmVyc2lvbiwgaXNBcHBsaWNhdGlvblNjb3BlZDogaW5zdGFsbE9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCB8fCBpbnN0YWxsZWRFeHRlbnNpb24/LmlzQXBwbGljYXRpb25TY29wZWQgfSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGlmIChleHRlbnNpb25zVG9JbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvSW5zdGFsbCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblJlc3VsdCBvZiBpbnN0YWxsYXRpb25SZXN1bHQpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvblJlc3VsdC5lcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGxvY2FsaXplKCdlcnJvckluc3RhbGxpbmdFeHRlbnNpb24nLCBcIkVycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfTogezF9XCIsIGV4dGVuc2lvblJlc3VsdC5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXh0ZW5zaW9uUmVzdWx0LmVycm9yKSkpO1xuXHRcdFx0XHRcdGZhaWxlZC5wdXNoKGV4dGVuc2lvblJlc3VsdC5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdzdWNjZXNzSW5zdGFsbCcsIFwiRXh0ZW5zaW9uICd7MH0nIHZ7MX0gd2FzIHN1Y2Nlc3NmdWxseSBpbnN0YWxsZWQuXCIsIGV4dGVuc2lvblJlc3VsdC5pZGVudGlmaWVyLmlkLCBleHRlbnNpb25SZXN1bHQubG9jYWw/Lm1hbmlmZXN0LnZlcnNpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWlsZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxWU0lYKHZzaXg6IFVSSSwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zLCBmb3JjZTogYm9vbGVhbiwgaW5zdGFsbGVkRXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdnNpeCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbGlkID0gYXdhaXQgdGhpcy52YWxpZGF0ZVZTSVgobWFuaWZlc3QsIGZvcmNlLCBpbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHRcdGlmICh2YWxpZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHZzaXgsIHsgLi4uaW5zdGFsbE9wdGlvbnMsIGluc3RhbGxHaXZlblZlcnNpb246IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3N1Y2Nlc3NWc2l4SW5zdGFsbCcsIFwiRXh0ZW5zaW9uICd7MH0nIHdhcyBzdWNjZXNzZnVsbHkgaW5zdGFsbGVkLlwiLCBiYXNlbmFtZSh2c2l4KSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnY2FuY2VsVnNpeEluc3RhbGwnLCBcIkNhbmNlbGxlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbiAnezB9Jy5cIiwgYmFzZW5hbWUodnNpeCkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0R2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEdhbGxlcnlFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpO1xuXHRcdGNvbnN0IHByZVJlbGVhc2UgPSBleHRlbnNpb25zLnNvbWUoZSA9PiBlLmluc3RhbGxPcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbik7XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSW5mb3M6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVgudGVzdChleHRlbnNpb24uaWQpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkluZm9zLnB1c2goeyAuLi5leHRlbnNpb24sIHByZVJlbGVhc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25JbmZvcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvcywgeyB0YXJnZXRQbGF0Zm9ybSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGdhbGxlcnlFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIHZhbGlkYXRlRXh0ZW5zaW9uS2luZChfbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVZTSVgobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZm9yY2U6IGJvb2xlYW4sIHByb2ZpbGVMb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkLCBpbnN0YWxsZWRFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9O1xuXHRcdGNvbnN0IGV4aXN0aW5nRXh0ZW5zaW9uID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maW5kKGxvY2FsID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXIsIGxvY2FsLmlkZW50aWZpZXIpKTtcblxuXHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbikge1xuXHRcdFx0Y29uc3QgYnVpbHRpbkF1dG9VcGRhdGVNZXNzYWdlID0gdGhpcy52YWxpZGF0ZUJ1aWx0aW5FeHRlbnNpb25FbmFibGVkV2l0aEF1dG9VcGRhdGVzKGV4aXN0aW5nRXh0ZW5zaW9uKTtcblx0XHRcdGlmIChidWlsdGluQXV0b1VwZGF0ZU1lc3NhZ2UpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhidWlsdGluQXV0b1VwZGF0ZU1lc3NhZ2UpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZm9yY2UpIHtcblx0XHRcdFx0aWYgKGd0KGV4aXN0aW5nRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIG1hbmlmZXN0LnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnZm9yY2VEb3duZ3JhZGUnLCBcIkEgbmV3ZXIgdmVyc2lvbiBvZiBleHRlbnNpb24gJ3swfScgdnsxfSBpcyBhbHJlYWR5IGluc3RhbGxlZC4gVXNlICctLWZvcmNlJyBvcHRpb24gdG8gZG93bmdyYWRlIHRvIG9sZGVyIHZlcnNpb24uXCIsIGV4aXN0aW5nRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4aXN0aW5nRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIG1hbmlmZXN0LnZlcnNpb24pKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy52YWxpZGF0ZUV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogKHN0cmluZyB8IFVSSSlbXSwgZm9yY2U6IGJvb2xlYW4sIHByb2ZpbGVMb2NhdGlvbj86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdldElkID0gYXN5bmMgKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBzdHJpbmcgfCBVUkkpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuXHRcdFx0aWYgKGV4dGVuc2lvbkRlc2NyaXB0aW9uIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0XHRcdHJldHVybiBnZXRFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdH07XG5cblx0XHRjb25zdCB1bmluc3RhbGxlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgaWQgPSBhd2FpdCBnZXRJZChleHRlbnNpb24pO1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvVW5pbnN0YWxsID0gaW5zdGFsbGVkLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KSk7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbnNUb1VuaW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke3RoaXMubm90SW5zdGFsbGVkKGlkKX1cXG4ke3VzZUlkfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5zb21lKGUgPT4gZS50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnYnVpbHRpbicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGEgQnVpbHQtaW4gZXh0ZW5zaW9uIGFuZCBjYW5ub3QgYmUgdW5pbnN0YWxsZWRcIiwgaWQpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb3JjZSAmJiBleHRlbnNpb25zVG9Vbmluc3RhbGwuc29tZShlID0+IGUuaXNCdWlsdGluKSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdmb3JjZVVuaW5zdGFsbCcsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIG1hcmtlZCBhcyBhIEJ1aWx0LWluIGV4dGVuc2lvbiBieSB1c2VyLiBQbGVhc2UgdXNlICctLWZvcmNlJyBvcHRpb24gdG8gdW5pbnN0YWxsIGl0LlwiLCBpZCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCd1bmluc3RhbGxpbmcnLCBcIlVuaW5zdGFsbGluZyB7MH0uLi5cIiwgaWQpKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uVG9Vbmluc3RhbGwgb2YgZXh0ZW5zaW9uc1RvVW5pbnN0YWxsKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKGV4dGVuc2lvblRvVW5pbnN0YWxsLCB7IHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdFx0dW5pbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uVG9Vbmluc3RhbGwpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5sb2NhdGlvbikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdzdWNjZXNzVW5pbnN0YWxsRnJvbUxvY2F0aW9uJywgXCJFeHRlbnNpb24gJ3swfScgd2FzIHN1Y2Nlc3NmdWxseSB1bmluc3RhbGxlZCBmcm9tIHsxfSFcIiwgaWQsIHRoaXMubG9jYXRpb24pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3N1Y2Nlc3NVbmluc3RhbGwnLCBcIkV4dGVuc2lvbiAnezB9JyB3YXMgc3VjY2Vzc2Z1bGx5IHVuaW5zdGFsbGVkIVwiLCBpZCkpO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGxvY2F0ZUV4dGVuc2lvbihleHRlbnNpb25zOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0ZXh0ZW5zaW9ucy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0aW5zdGFsbGVkLmZvckVhY2goaSA9PiB7XG5cdFx0XHRcdGlmIChpLmlkZW50aWZpZXIuaWQgPT09IGUpIHtcblx0XHRcdFx0XHRpZiAoaS5sb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhpLmxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbm90SW5zdGFsbGVkKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhdGlvbiA/IGxvY2FsaXplKCdub3RJbnN0YWxsZWRkT25Mb2NhdGlvbicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIG5vdCBpbnN0YWxsZWQgb24gezF9LlwiLCBpZCwgdGhpcy5sb2NhdGlvbikgOiBsb2NhbGl6ZSgnbm90SW5zdGFsbGVkJywgXCJFeHRlbnNpb24gJ3swfScgaXMgbm90IGluc3RhbGxlZC5cIiwgaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUJ1aWx0aW5FeHRlbnNpb25FbmFibGVkV2l0aEF1dG9VcGRhdGVzKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcy5zb21lKGUgPT4gZS50b0xvd2VyQ2FzZSgpID09PSBleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSAmJiAhZXh0ZW5zaW9uLmZvcmNlQXV0b1VwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdidWlsdGluQXV0b1VwZGF0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGEgYnVpbHQtaW4gZXh0ZW5zaW9uIGFuZCBub3QgYWxsb3dlZCB0byBiZSB1cGRhdGVkIGluIHRoZSBjdXJyZW50IHByb2R1Y3QgcXVhbGl0eSAnezF9Jy5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEIsMEJBQTBDLDZCQUF1Ryx3QkFBd0I7QUFDOU0sU0FBUyxtQkFBbUIsZ0JBQWdCLHVCQUF1Qix1QkFBdUI7QUFDMUYs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
