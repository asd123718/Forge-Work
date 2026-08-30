import { isAbsolute, join, resolve } from "../../base/common/path.js";
import * as platform from "../../base/common/platform.js";
import { cwd } from "../../base/common/process.js";
import { URI } from "../../base/common/uri.js";
import * as performance from "../../base/common/performance.js";
import { transformOutgoingURIs } from "../../base/common/uriIpc.js";
import { ContextKeyDefinedExpr, ContextKeyEqualsExpr, ContextKeyExpr, ContextKeyGreaterEqualsExpr, ContextKeyGreaterExpr, ContextKeyInExpr, ContextKeyNotEqualsExpr, ContextKeyNotExpr, ContextKeyNotInExpr, ContextKeyRegexExpr, ContextKeySmallerEqualsExpr, ContextKeySmallerExpr } from "../../platform/contextkey/common/contextkey.js";
import { toExtensionDescription } from "../../platform/extensionManagement/common/extensionsScannerService.js";
import { ExtensionType } from "../../platform/extensions/common/extensions.js";
import { dedupExtensions } from "../../workbench/services/extensions/common/extensionsUtil.js";
import { Schemas } from "../../base/common/network.js";
import { areSameExtensions } from "../../platform/extensionManagement/common/extensionManagementUtil.js";
class RemoteExtensionsScannerService {
  constructor(_extensionManagementCLI, environmentService, _userDataProfilesService, _extensionsScannerService, _logService, _extensionGalleryService, _languagePackService, _extensionManagementService) {
    this._extensionManagementCLI = _extensionManagementCLI;
    this._userDataProfilesService = _userDataProfilesService;
    this._extensionsScannerService = _extensionsScannerService;
    this._logService = _logService;
    this._extensionGalleryService = _extensionGalleryService;
    this._languagePackService = _languagePackService;
    this._extensionManagementService = _extensionManagementService;
    this._whenBuiltinExtensionsReady = Promise.resolve({ failed: [] });
    this._whenExtensionsReady = Promise.resolve({ failed: [] });
    const builtinExtensionsToInstall = environmentService.args["install-builtin-extension"];
    if (builtinExtensionsToInstall) {
      _logService.trace("Installing builtin extensions passed via args...");
      const installOptions = { isMachineScoped: !!environmentService.args["do-not-sync"], installPreReleaseVersion: !!environmentService.args["pre-release"] };
      performance.mark("code/server/willInstallBuiltinExtensions");
      this._whenExtensionsReady = this._whenBuiltinExtensionsReady = _extensionManagementCLI.installExtensions([], this._asExtensionIdOrVSIX(builtinExtensionsToInstall), installOptions, !!environmentService.args["force"]).then(() => {
        performance.mark("code/server/didInstallBuiltinExtensions");
        _logService.trace("Finished installing builtin extensions");
        return { failed: [] };
      }, (error) => {
        _logService.error(error);
        return { failed: [] };
      });
    }
    const extensionsToInstall = environmentService.args["install-extension"];
    if (extensionsToInstall) {
      _logService.trace("Installing extensions passed via args...");
      const installOptions = {
        isMachineScoped: !!environmentService.args["do-not-sync"],
        installPreReleaseVersion: !!environmentService.args["pre-release"],
        isApplicationScoped: true
        // extensions installed during server startup are available to all profiles
      };
      this._whenExtensionsReady = this._whenBuiltinExtensionsReady.then(() => _extensionManagementCLI.installExtensions(this._asExtensionIdOrVSIX(extensionsToInstall), [], installOptions, !!environmentService.args["force"])).then(async () => {
        _logService.trace("Finished installing extensions");
        return { failed: [] };
      }, async (error) => {
        _logService.error(error);
        const failed = [];
        const alreadyInstalled = await this._extensionManagementService.getInstalled(ExtensionType.User);
        for (const id of this._asExtensionIdOrVSIX(extensionsToInstall)) {
          if (typeof id === "string") {
            if (!alreadyInstalled.some((e) => areSameExtensions(e.identifier, { id }))) {
              failed.push({ id, installOptions });
            }
          }
        }
        if (!failed.length) {
          _logService.trace(`No extensions to report as failed`);
          return { failed: [] };
        }
        _logService.info(`Relaying the following extensions to install later: ${failed.map((f) => f.id).join(", ")}`);
        return { failed };
      });
    }
  }
  _asExtensionIdOrVSIX(inputs) {
    return inputs.map((input) => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
  }
  whenExtensionsReady() {
    return this._whenExtensionsReady;
  }
  async scanExtensions(language, profileLocation, workspaceExtensionLocations, extensionDevelopmentLocations, languagePackId) {
    performance.mark("code/server/willScanExtensions");
    this._logService.trace(`Scanning extensions using UI language: ${language}`);
    await this._whenBuiltinExtensionsReady;
    const extensionDevelopmentPaths = extensionDevelopmentLocations ? extensionDevelopmentLocations.filter((url) => url.scheme === Schemas.file).map((url) => url.fsPath) : void 0;
    profileLocation = profileLocation ?? this._userDataProfilesService.defaultProfile.extensionsResource;
    const extensions = await this._scanExtensions(profileLocation, language ?? platform.language, workspaceExtensionLocations, extensionDevelopmentPaths, languagePackId);
    this._logService.trace("Scanned Extensions", extensions);
    this._massageWhenConditions(extensions);
    performance.mark("code/server/didScanExtensions");
    return extensions;
  }
  async _scanExtensions(profileLocation, language, workspaceInstalledExtensionLocations, extensionDevelopmentPath, languagePackId) {
    await this._ensureLanguagePackIsInstalled(language, languagePackId);
    const [builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions] = await Promise.all([
      this._scanBuiltinExtensions(language),
      this._scanInstalledExtensions(profileLocation, language),
      this._scanWorkspaceInstalledExtensions(language, workspaceInstalledExtensionLocations),
      this._scanDevelopedExtensions(language, extensionDevelopmentPath)
    ]);
    return dedupExtensions(builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions, this._logService);
  }
  async _scanDevelopedExtensions(language, extensionDevelopmentPaths) {
    if (extensionDevelopmentPaths) {
      return (await Promise.all(extensionDevelopmentPaths.map((extensionDevelopmentPath) => this._extensionsScannerService.scanOneOrMultipleExtensions(URI.file(resolve(extensionDevelopmentPath)), ExtensionType.User, { language })))).flat().map((e) => toExtensionDescription(e, true));
    }
    return [];
  }
  async _scanWorkspaceInstalledExtensions(language, workspaceInstalledExtensions) {
    const result = [];
    if (workspaceInstalledExtensions?.length) {
      const scannedExtensions = await Promise.all(workspaceInstalledExtensions.map((location) => this._extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { language })));
      for (const scannedExtension of scannedExtensions) {
        if (scannedExtension) {
          result.push(toExtensionDescription(scannedExtension, false));
        }
      }
    }
    return result;
  }
  async _scanBuiltinExtensions(language) {
    const scannedExtensions = await this._extensionsScannerService.scanSystemExtensions({ language });
    return scannedExtensions.map((e) => toExtensionDescription(e, false));
  }
  async _scanInstalledExtensions(profileLocation, language) {
    const scannedExtensions = await this._extensionsScannerService.scanUserExtensions({ profileLocation, language, useCache: true });
    return scannedExtensions.map((e) => toExtensionDescription(e, false));
  }
  async _ensureLanguagePackIsInstalled(language, languagePackId) {
    if (
      // No need to install language packs for the default language
      language === platform.LANGUAGE_DEFAULT || // The extension gallery service needs to be available
      !this._extensionGalleryService.isEnabled()
    ) {
      return;
    }
    try {
      const installed = await this._languagePackService.getInstalledLanguages();
      if (installed.find((p) => p.id === language)) {
        this._logService.trace(`Language Pack ${language} is already installed. Skipping language pack installation.`);
        return;
      }
    } catch (err) {
      this._logService.error(err);
    }
    if (!languagePackId) {
      this._logService.trace(`No language pack id provided for language ${language}. Skipping language pack installation.`);
      return;
    }
    this._logService.trace(`Language Pack ${languagePackId} for language ${language} is not installed. It will be installed now.`);
    try {
      await this._extensionManagementCLI.installExtensions([languagePackId], [], { isMachineScoped: true }, true);
    } catch (err) {
      this._logService.error(err);
    }
  }
  _massageWhenConditions(extensions) {
    const _mapResourceSchemeValue = (value, isRegex) => {
      return value.replace(/file/g, "vscode-remote");
    };
    const _mapResourceRegExpValue = (value) => {
      let flags = "";
      flags += value.global ? "g" : "";
      flags += value.ignoreCase ? "i" : "";
      flags += value.multiline ? "m" : "";
      return new RegExp(_mapResourceSchemeValue(value.source, true), flags);
    };
    const _exprKeyMapper = new class {
      mapDefined(key) {
        return ContextKeyDefinedExpr.create(key);
      }
      mapNot(key) {
        return ContextKeyNotExpr.create(key);
      }
      mapEquals(key, value) {
        if (key === "resourceScheme" && typeof value === "string") {
          return ContextKeyEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
        } else {
          return ContextKeyEqualsExpr.create(key, value);
        }
      }
      mapNotEquals(key, value) {
        if (key === "resourceScheme" && typeof value === "string") {
          return ContextKeyNotEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
        } else {
          return ContextKeyNotEqualsExpr.create(key, value);
        }
      }
      mapGreater(key, value) {
        return ContextKeyGreaterExpr.create(key, value);
      }
      mapGreaterEquals(key, value) {
        return ContextKeyGreaterEqualsExpr.create(key, value);
      }
      mapSmaller(key, value) {
        return ContextKeySmallerExpr.create(key, value);
      }
      mapSmallerEquals(key, value) {
        return ContextKeySmallerEqualsExpr.create(key, value);
      }
      mapRegex(key, regexp) {
        if (key === "resourceScheme" && regexp) {
          return ContextKeyRegexExpr.create(key, _mapResourceRegExpValue(regexp));
        } else {
          return ContextKeyRegexExpr.create(key, regexp);
        }
      }
      mapIn(key, valueKey) {
        return ContextKeyInExpr.create(key, valueKey);
      }
      mapNotIn(key, valueKey) {
        return ContextKeyNotInExpr.create(key, valueKey);
      }
    }();
    const _massageWhenUser = (element) => {
      if (!element || !element.when || !/resourceScheme/.test(element.when)) {
        return;
      }
      const expr = ContextKeyExpr.deserialize(element.when);
      if (!expr) {
        return;
      }
      const massaged = expr.map(_exprKeyMapper);
      element.when = massaged.serialize();
    };
    const _massageWhenUserArr = (elements) => {
      if (Array.isArray(elements)) {
        for (const element of elements) {
          _massageWhenUser(element);
        }
      } else {
        _massageWhenUser(elements);
      }
    };
    const _massageLocWhenUser = (target) => {
      for (const loc in target) {
        _massageWhenUserArr(target[loc]);
      }
    };
    extensions.forEach((extension) => {
      if (extension.contributes) {
        if (extension.contributes.menus) {
          _massageLocWhenUser(extension.contributes.menus);
        }
        if (extension.contributes.keybindings) {
          _massageWhenUserArr(extension.contributes.keybindings);
        }
        if (extension.contributes.views) {
          _massageLocWhenUser(extension.contributes.views);
        }
      }
    });
  }
}
class RemoteExtensionsScannerChannel {
  constructor(service, getUriTransformer) {
    this.service = service;
    this.getUriTransformer = getUriTransformer;
  }
  listen(context, event) {
    throw new Error("Invalid listen");
  }
  async call(context, command, args) {
    const uriTransformer = this.getUriTransformer(context);
    switch (command) {
      case "whenExtensionsReady":
        return await this.service.whenExtensionsReady();
      case "scanExtensions": {
        const language = args[0];
        const profileLocation = args[1] ? URI.revive(uriTransformer.transformIncoming(args[1])) : void 0;
        const workspaceExtensionLocations = Array.isArray(args[2]) ? args[2].map((u) => URI.revive(uriTransformer.transformIncoming(u))) : void 0;
        const extensionDevelopmentPath = Array.isArray(args[3]) ? args[3].map((u) => URI.revive(uriTransformer.transformIncoming(u))) : void 0;
        const languagePackId = args[4];
        const extensions = await this.service.scanExtensions(
          language,
          profileLocation,
          workspaceExtensionLocations,
          extensionDevelopmentPath,
          languagePackId
        );
        return extensions.map((extension) => transformOutgoingURIs(extension, uriTransformer));
      }
    }
    throw new Error("Invalid call");
  }
}
export {
  RemoteExtensionsScannerChannel,
  RemoteExtensionsScannerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXHJlbW90ZUV4dGVuc2lvbnNTY2FubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgam9pbiwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY3dkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcGVyZm9ybWFuY2UgZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXIsIHRyYW5zZm9ybU91dGdvaW5nVVJJcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBJU2VydmVyQ2hhbm5lbCB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleURlZmluZWRFeHByLCBDb250ZXh0S2V5RXF1YWxzRXhwciwgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIsIENvbnRleHRLZXlHcmVhdGVyRXhwciwgQ29udGV4dEtleUluRXhwciwgQ29udGV4dEtleU5vdEVxdWFsc0V4cHIsIENvbnRleHRLZXlOb3RFeHByLCBDb250ZXh0S2V5Tm90SW5FeHByLCBDb250ZXh0S2V5UmVnZXhFeHByLCBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHIsIENvbnRleHRLZXlTbWFsbGVyRXhwciwgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dEtleUV4cHJNYXBwZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJbnN0YWxsRXh0ZW5zaW9uU3VtbWFyeSwgSW5zdGFsbE9wdGlvbnMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1hbmFnZW1lbnRDTEkgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50Q0xJLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuL3NlcnZlckVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWR1cEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1V0aWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlUGFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL2NvbW1vbi9sYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIGltcGxlbWVudHMgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5CdWlsdGluRXh0ZW5zaW9uc1JlYWR5ID0gUHJvbWlzZS5yZXNvbHZlPEluc3RhbGxFeHRlbnNpb25TdW1tYXJ5Pih7IGZhaWxlZDogW10gfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5FeHRlbnNpb25zUmVhZHkgPSBQcm9taXNlLnJlc29sdmU8SW5zdGFsbEV4dGVuc2lvblN1bW1hcnk+KHsgZmFpbGVkOiBbXSB9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25NYW5hZ2VtZW50Q0xJOiBFeHRlbnNpb25NYW5hZ2VtZW50Q0xJLFxuXHRcdGVudmlyb25tZW50U2VydmljZTogSVNlcnZlckVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlUGFja1NlcnZpY2U6IElMYW5ndWFnZVBhY2tTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGJ1aWx0aW5FeHRlbnNpb25zVG9JbnN0YWxsID0gZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2luc3RhbGwtYnVpbHRpbi1leHRlbnNpb24nXTtcblx0XHRpZiAoYnVpbHRpbkV4dGVuc2lvbnNUb0luc3RhbGwpIHtcblx0XHRcdF9sb2dTZXJ2aWNlLnRyYWNlKCdJbnN0YWxsaW5nIGJ1aWx0aW4gZXh0ZW5zaW9ucyBwYXNzZWQgdmlhIGFyZ3MuLi4nKTtcblx0XHRcdGNvbnN0IGluc3RhbGxPcHRpb25zOiBJbnN0YWxsT3B0aW9ucyA9IHsgaXNNYWNoaW5lU2NvcGVkOiAhIWVudmlyb25tZW50U2VydmljZS5hcmdzWydkby1ub3Qtc3luYyddLCBpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246ICEhZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3ByZS1yZWxlYXNlJ10gfTtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvc2VydmVyL3dpbGxJbnN0YWxsQnVpbHRpbkV4dGVuc2lvbnMnKTtcblx0XHRcdHRoaXMuX3doZW5FeHRlbnNpb25zUmVhZHkgPSB0aGlzLl93aGVuQnVpbHRpbkV4dGVuc2lvbnNSZWFkeSA9IF9leHRlbnNpb25NYW5hZ2VtZW50Q0xJLmluc3RhbGxFeHRlbnNpb25zKFtdLCB0aGlzLl9hc0V4dGVuc2lvbklkT3JWU0lYKGJ1aWx0aW5FeHRlbnNpb25zVG9JbnN0YWxsKSwgaW5zdGFsbE9wdGlvbnMsICEhZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2ZvcmNlJ10pXG5cdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3NlcnZlci9kaWRJbnN0YWxsQnVpbHRpbkV4dGVuc2lvbnMnKTtcblx0XHRcdFx0XHRfbG9nU2VydmljZS50cmFjZSgnRmluaXNoZWQgaW5zdGFsbGluZyBidWlsdGluIGV4dGVuc2lvbnMnKTtcblx0XHRcdFx0XHRyZXR1cm4geyBmYWlsZWQ6IFtdIH07XG5cdFx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0XHRfbG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZmFpbGVkOiBbXSB9O1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsID0gZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2luc3RhbGwtZXh0ZW5zaW9uJ107XG5cdFx0aWYgKGV4dGVuc2lvbnNUb0luc3RhbGwpIHtcblx0XHRcdF9sb2dTZXJ2aWNlLnRyYWNlKCdJbnN0YWxsaW5nIGV4dGVuc2lvbnMgcGFzc2VkIHZpYSBhcmdzLi4uJyk7XG5cdFx0XHRjb25zdCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMgPSB7XG5cdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogISFlbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZG8tbm90LXN5bmMnXSxcblx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiAhIWVudmlyb25tZW50U2VydmljZS5hcmdzWydwcmUtcmVsZWFzZSddLFxuXHRcdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIC8vIGV4dGVuc2lvbnMgaW5zdGFsbGVkIGR1cmluZyBzZXJ2ZXIgc3RhcnR1cCBhcmUgYXZhaWxhYmxlIHRvIGFsbCBwcm9maWxlc1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3doZW5FeHRlbnNpb25zUmVhZHkgPSB0aGlzLl93aGVuQnVpbHRpbkV4dGVuc2lvbnNSZWFkeVxuXHRcdFx0XHQudGhlbigoKSA9PiBfZXh0ZW5zaW9uTWFuYWdlbWVudENMSS5pbnN0YWxsRXh0ZW5zaW9ucyh0aGlzLl9hc0V4dGVuc2lvbklkT3JWU0lYKGV4dGVuc2lvbnNUb0luc3RhbGwpLCBbXSwgaW5zdGFsbE9wdGlvbnMsICEhZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2ZvcmNlJ10pKVxuXHRcdFx0XHQudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0X2xvZ1NlcnZpY2UudHJhY2UoJ0ZpbmlzaGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9ucycpO1xuXHRcdFx0XHRcdHJldHVybiB7IGZhaWxlZDogW10gfTtcblx0XHRcdFx0fSwgYXN5bmMgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdF9sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdFx0XHRcdGNvbnN0IGZhaWxlZDoge1xuXHRcdFx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0XHRcdGluc3RhbGxPcHRpb25zOiBJbnN0YWxsT3B0aW9ucztcblx0XHRcdFx0XHR9W10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBhbHJlYWR5SW5zdGFsbGVkID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlcik7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX2FzRXh0ZW5zaW9uSWRPclZTSVgoZXh0ZW5zaW9uc1RvSW5zdGFsbCkpIHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghYWxyZWFkeUluc3RhbGxlZC5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKSkge1xuXHRcdFx0XHRcdFx0XHRcdGZhaWxlZC5wdXNoKHsgaWQsIGluc3RhbGxPcHRpb25zIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFmYWlsZWQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRfbG9nU2VydmljZS50cmFjZShgTm8gZXh0ZW5zaW9ucyB0byByZXBvcnQgYXMgZmFpbGVkYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBmYWlsZWQ6IFtdIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0X2xvZ1NlcnZpY2UuaW5mbyhgUmVsYXlpbmcgdGhlIGZvbGxvd2luZyBleHRlbnNpb25zIHRvIGluc3RhbGwgbGF0ZXI6ICR7ZmFpbGVkLm1hcChmID0+IGYuaWQpLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZmFpbGVkIH07XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FzRXh0ZW5zaW9uSWRPclZTSVgoaW5wdXRzOiBzdHJpbmdbXSk6IChzdHJpbmcgfCBVUkkpW10ge1xuXHRcdHJldHVybiBpbnB1dHMubWFwKGlucHV0ID0+IC9cXC52c2l4JC9pLnRlc3QoaW5wdXQpID8gVVJJLmZpbGUoaXNBYnNvbHV0ZShpbnB1dCkgPyBpbnB1dCA6IGpvaW4oY3dkKCksIGlucHV0KSkgOiBpbnB1dCk7XG5cdH1cblxuXHR3aGVuRXh0ZW5zaW9uc1JlYWR5KCk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblN1bW1hcnk+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2hlbkV4dGVuc2lvbnNSZWFkeTtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeHRlbnNpb25zKFxuXHRcdGxhbmd1YWdlPzogc3RyaW5nLFxuXHRcdHByb2ZpbGVMb2NhdGlvbj86IFVSSSxcblx0XHR3b3Jrc3BhY2VFeHRlbnNpb25Mb2NhdGlvbnM/OiBVUklbXSxcblx0XHRleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9ucz86IFVSSVtdLFxuXHRcdGxhbmd1YWdlUGFja0lkPzogc3RyaW5nXG5cdCk6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+IHtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3NlcnZlci93aWxsU2NhbkV4dGVuc2lvbnMnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBTY2FubmluZyBleHRlbnNpb25zIHVzaW5nIFVJIGxhbmd1YWdlOiAke2xhbmd1YWdlfWApO1xuXG5cdFx0YXdhaXQgdGhpcy5fd2hlbkJ1aWx0aW5FeHRlbnNpb25zUmVhZHk7XG5cblx0XHRjb25zdCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGhzID0gZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvbnMgPyBleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9ucy5maWx0ZXIodXJsID0+IHVybC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKHVybCA9PiB1cmwuZnNQYXRoKSA6IHVuZGVmaW5lZDtcblx0XHRwcm9maWxlTG9jYXRpb24gPSBwcm9maWxlTG9jYXRpb24gPz8gdGhpcy5fdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX3NjYW5FeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgbGFuZ3VhZ2UgPz8gcGxhdGZvcm0ubGFuZ3VhZ2UsIHdvcmtzcGFjZUV4dGVuc2lvbkxvY2F0aW9ucywgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRocywgbGFuZ3VhZ2VQYWNrSWQpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnU2Nhbm5lZCBFeHRlbnNpb25zJywgZXh0ZW5zaW9ucyk7XG5cdFx0dGhpcy5fbWFzc2FnZVdoZW5Db25kaXRpb25zKGV4dGVuc2lvbnMpO1xuXG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9zZXJ2ZXIvZGlkU2NhbkV4dGVuc2lvbnMnKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5FeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCBsYW5ndWFnZTogc3RyaW5nLCB3b3Jrc3BhY2VJbnN0YWxsZWRFeHRlbnNpb25Mb2NhdGlvbnM6IFVSSVtdIHwgdW5kZWZpbmVkLCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGg6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBsYW5ndWFnZVBhY2tJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4ge1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZUxhbmd1YWdlUGFja0lzSW5zdGFsbGVkKGxhbmd1YWdlLCBsYW5ndWFnZVBhY2tJZCk7XG5cblx0XHRjb25zdCBbYnVpbHRpbkV4dGVuc2lvbnMsIGluc3RhbGxlZEV4dGVuc2lvbnMsIHdvcmtzcGFjZUluc3RhbGxlZEV4dGVuc2lvbnMsIGRldmVsb3BlZEV4dGVuc2lvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fc2NhbkJ1aWx0aW5FeHRlbnNpb25zKGxhbmd1YWdlKSxcblx0XHRcdHRoaXMuX3NjYW5JbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgbGFuZ3VhZ2UpLFxuXHRcdFx0dGhpcy5fc2NhbldvcmtzcGFjZUluc3RhbGxlZEV4dGVuc2lvbnMobGFuZ3VhZ2UsIHdvcmtzcGFjZUluc3RhbGxlZEV4dGVuc2lvbkxvY2F0aW9ucyksXG5cdFx0XHR0aGlzLl9zY2FuRGV2ZWxvcGVkRXh0ZW5zaW9ucyhsYW5ndWFnZSwgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKVxuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIGRlZHVwRXh0ZW5zaW9ucyhidWlsdGluRXh0ZW5zaW9ucywgaW5zdGFsbGVkRXh0ZW5zaW9ucywgd29ya3NwYWNlSW5zdGFsbGVkRXh0ZW5zaW9ucywgZGV2ZWxvcGVkRXh0ZW5zaW9ucywgdGhpcy5fbG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zY2FuRGV2ZWxvcGVkRXh0ZW5zaW9ucyhsYW5ndWFnZTogc3RyaW5nLCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGhzPzogc3RyaW5nW10pOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7XG5cdFx0aWYgKGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aHMpIHtcblx0XHRcdHJldHVybiAoYXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRocy5tYXAoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoID0+IHRoaXMuX2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuT25lT3JNdWx0aXBsZUV4dGVuc2lvbnMoVVJJLmZpbGUocmVzb2x2ZShleHRlbnNpb25EZXZlbG9wbWVudFBhdGgpKSwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGxhbmd1YWdlIH0pKSkpXG5cdFx0XHRcdC5mbGF0KClcblx0XHRcdFx0Lm1hcChlID0+IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZSwgdHJ1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zY2FuV29ya3NwYWNlSW5zdGFsbGVkRXh0ZW5zaW9ucyhsYW5ndWFnZTogc3RyaW5nLCB3b3Jrc3BhY2VJbnN0YWxsZWRFeHRlbnNpb25zPzogVVJJW10pOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGlmICh3b3Jrc3BhY2VJbnN0YWxsZWRFeHRlbnNpb25zPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlSW5zdGFsbGVkRXh0ZW5zaW9ucy5tYXAobG9jYXRpb24gPT4gdGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihsb2NhdGlvbiwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGxhbmd1YWdlIH0pKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNjYW5uZWRFeHRlbnNpb24gb2Ygc2Nhbm5lZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKHNjYW5uZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKHNjYW5uZWRFeHRlbnNpb24sIGZhbHNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5CdWlsdGluRXh0ZW5zaW9ucyhsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4ge1xuXHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5TeXN0ZW1FeHRlbnNpb25zKHsgbGFuZ3VhZ2UgfSk7XG5cdFx0cmV0dXJuIHNjYW5uZWRFeHRlbnNpb25zLm1hcChlID0+IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZSwgZmFsc2UpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5JbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCBsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4ge1xuXHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyh7IHByb2ZpbGVMb2NhdGlvbiwgbGFuZ3VhZ2UsIHVzZUNhY2hlOiB0cnVlIH0pO1xuXHRcdHJldHVybiBzY2FubmVkRXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGUsIGZhbHNlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVMYW5ndWFnZVBhY2tJc0luc3RhbGxlZChsYW5ndWFnZTogc3RyaW5nLCBsYW5ndWFnZVBhY2tJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKFxuXHRcdFx0Ly8gTm8gbmVlZCB0byBpbnN0YWxsIGxhbmd1YWdlIHBhY2tzIGZvciB0aGUgZGVmYXVsdCBsYW5ndWFnZVxuXHRcdFx0bGFuZ3VhZ2UgPT09IHBsYXRmb3JtLkxBTkdVQUdFX0RFRkFVTFQgfHxcblx0XHRcdC8vIFRoZSBleHRlbnNpb24gZ2FsbGVyeSBzZXJ2aWNlIG5lZWRzIHRvIGJlIGF2YWlsYWJsZVxuXHRcdFx0IXRoaXMuX2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlUGFja1NlcnZpY2UuZ2V0SW5zdGFsbGVkTGFuZ3VhZ2VzKCk7XG5cdFx0XHRpZiAoaW5zdGFsbGVkLmZpbmQocCA9PiBwLmlkID09PSBsYW5ndWFnZSkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTGFuZ3VhZ2UgUGFjayAke2xhbmd1YWdlfSBpcyBhbHJlYWR5IGluc3RhbGxlZC4gU2tpcHBpbmcgbGFuZ3VhZ2UgcGFjayBpbnN0YWxsYXRpb24uYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFdlIHRyaWVkIHRvIHNlZSB3aGF0IGlzIGluc3RhbGxlZCBidXQgZmFpbGVkLiBXZSBjYW4gdHJ5IGluc3RhbGxpbmcgYW55d2F5LlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblxuXHRcdGlmICghbGFuZ3VhZ2VQYWNrSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vIGxhbmd1YWdlIHBhY2sgaWQgcHJvdmlkZWQgZm9yIGxhbmd1YWdlICR7bGFuZ3VhZ2V9LiBTa2lwcGluZyBsYW5ndWFnZSBwYWNrIGluc3RhbGxhdGlvbi5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBMYW5ndWFnZSBQYWNrICR7bGFuZ3VhZ2VQYWNrSWR9IGZvciBsYW5ndWFnZSAke2xhbmd1YWdlfSBpcyBub3QgaW5zdGFsbGVkLiBJdCB3aWxsIGJlIGluc3RhbGxlZCBub3cuYCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbk1hbmFnZW1lbnRDTEkuaW5zdGFsbEV4dGVuc2lvbnMoW2xhbmd1YWdlUGFja0lkXSwgW10sIHsgaXNNYWNoaW5lU2NvcGVkOiB0cnVlIH0sIHRydWUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gV2UgdHJpZWQgdG8gaW5zdGFsbCB0aGUgbGFuZ3VhZ2UgcGFjayBidXQgZmFpbGVkLiBXZSBjYW4gY29udGludWUgd2l0aG91dCBpdCB0aHVzIHVzaW5nIHRoZSBkZWZhdWx0IGxhbmd1YWdlLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21hc3NhZ2VXaGVuQ29uZGl0aW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSk6IHZvaWQge1xuXHRcdC8vIE1hc3NhZ2UgXCJ3aGVuXCIgY29uZGl0aW9ucyB3aGljaCBtZW50aW9uIGByZXNvdXJjZVNjaGVtZWBcblxuXHRcdGludGVyZmFjZSBXaGVuVXNlciB7IHdoZW4/OiBzdHJpbmcgfVxuXG5cdFx0aW50ZXJmYWNlIExvY1doZW5Vc2VyIHsgW2xvYzogc3RyaW5nXTogV2hlblVzZXJbXSB9XG5cblx0XHRjb25zdCBfbWFwUmVzb3VyY2VTY2hlbWVWYWx1ZSA9ICh2YWx1ZTogc3RyaW5nLCBpc1JlZ2V4OiBib29sZWFuKTogc3RyaW5nID0+IHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGBfbWFwUmVzb3VyY2VTY2hlbWVWYWx1ZTogJHt2YWx1ZX0sICR7aXNSZWdleH1gKTtcblx0XHRcdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9maWxlL2csICd2c2NvZGUtcmVtb3RlJyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IF9tYXBSZXNvdXJjZVJlZ0V4cFZhbHVlID0gKHZhbHVlOiBSZWdFeHApOiBSZWdFeHAgPT4ge1xuXHRcdFx0bGV0IGZsYWdzID0gJyc7XG5cdFx0XHRmbGFncyArPSB2YWx1ZS5nbG9iYWwgPyAnZycgOiAnJztcblx0XHRcdGZsYWdzICs9IHZhbHVlLmlnbm9yZUNhc2UgPyAnaScgOiAnJztcblx0XHRcdGZsYWdzICs9IHZhbHVlLm11bHRpbGluZSA/ICdtJyA6ICcnO1xuXHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAoX21hcFJlc291cmNlU2NoZW1lVmFsdWUodmFsdWUuc291cmNlLCB0cnVlKSwgZmxhZ3MpO1xuXHRcdH07XG5cblx0XHRjb25zdCBfZXhwcktleU1hcHBlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwck1hcHBlciB7XG5cdFx0XHRtYXBEZWZpbmVkKGtleTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleURlZmluZWRFeHByLmNyZWF0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdFx0bWFwTm90KGtleTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEV4cHIuY3JlYXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0XHRtYXBFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBDb250ZXh0S2V5VmFsdWUpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0XHRcdGlmIChrZXkgPT09ICdyZXNvdXJjZVNjaGVtZScgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoa2V5LCBfbWFwUmVzb3VyY2VTY2hlbWVWYWx1ZSh2YWx1ZSwgZmFsc2UpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtYXBOb3RFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBDb250ZXh0S2V5VmFsdWUpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0XHRcdGlmIChrZXkgPT09ICdyZXNvdXJjZVNjaGVtZScgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5Tm90RXF1YWxzRXhwci5jcmVhdGUoa2V5LCBfbWFwUmVzb3VyY2VTY2hlbWVWYWx1ZSh2YWx1ZSwgZmFsc2UpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtYXBHcmVhdGVyKGtleTogc3RyaW5nLCB2YWx1ZTogQ29udGV4dEtleVZhbHVlKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUdyZWF0ZXJFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdG1hcEdyZWF0ZXJFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBDb250ZXh0S2V5VmFsdWUpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0XHRcdHJldHVybiBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0bWFwU21hbGxlcihrZXk6IHN0cmluZywgdmFsdWU6IENvbnRleHRLZXlWYWx1ZSk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlTbWFsbGVyRXhwci5jcmVhdGUoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRtYXBTbWFsbGVyRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogQ29udGV4dEtleVZhbHVlKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVNtYWxsZXJFcXVhbHNFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdG1hcFJlZ2V4KGtleTogc3RyaW5nLCByZWdleHA6IFJlZ0V4cCB8IG51bGwpOiBDb250ZXh0S2V5UmVnZXhFeHByIHtcblx0XHRcdFx0aWYgKGtleSA9PT0gJ3Jlc291cmNlU2NoZW1lJyAmJiByZWdleHApIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVJlZ2V4RXhwci5jcmVhdGUoa2V5LCBfbWFwUmVzb3VyY2VSZWdFeHBWYWx1ZShyZWdleHApKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVJlZ2V4RXhwci5jcmVhdGUoa2V5LCByZWdleHApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtYXBJbihrZXk6IHN0cmluZywgdmFsdWVLZXk6IHN0cmluZyk6IENvbnRleHRLZXlJbkV4cHIge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUluRXhwci5jcmVhdGUoa2V5LCB2YWx1ZUtleSk7XG5cdFx0XHR9XG5cdFx0XHRtYXBOb3RJbihrZXk6IHN0cmluZywgdmFsdWVLZXk6IHN0cmluZyk6IENvbnRleHRLZXlOb3RJbkV4cHIge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEluRXhwci5jcmVhdGUoa2V5LCB2YWx1ZUtleSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IF9tYXNzYWdlV2hlblVzZXIgPSAoZWxlbWVudDogV2hlblVzZXIpID0+IHtcblx0XHRcdGlmICghZWxlbWVudCB8fCAhZWxlbWVudC53aGVuIHx8ICEvcmVzb3VyY2VTY2hlbWUvLnRlc3QoZWxlbWVudC53aGVuKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShlbGVtZW50LndoZW4pO1xuXHRcdFx0aWYgKCFleHByKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWFzc2FnZWQgPSBleHByLm1hcChfZXhwcktleU1hcHBlcik7XG5cdFx0XHRlbGVtZW50LndoZW4gPSBtYXNzYWdlZC5zZXJpYWxpemUoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgX21hc3NhZ2VXaGVuVXNlckFyciA9IChlbGVtZW50czogV2hlblVzZXJbXSB8IFdoZW5Vc2VyKSA9PiB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50cykpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0X21hc3NhZ2VXaGVuVXNlcihlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0X21hc3NhZ2VXaGVuVXNlcihlbGVtZW50cyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IF9tYXNzYWdlTG9jV2hlblVzZXIgPSAodGFyZ2V0OiBMb2NXaGVuVXNlcikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBsb2MgaW4gdGFyZ2V0KSB7XG5cdFx0XHRcdF9tYXNzYWdlV2hlblVzZXJBcnIodGFyZ2V0W2xvY10pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRleHRlbnNpb25zLmZvckVhY2goKGV4dGVuc2lvbikgPT4ge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5jb250cmlidXRlcykge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVzKSB7XG5cdFx0XHRcdFx0X21hc3NhZ2VMb2NXaGVuVXNlcig8TG9jV2hlblVzZXI+ZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzKSB7XG5cdFx0XHRcdFx0X21hc3NhZ2VXaGVuVXNlckFycig8V2hlblVzZXIgfCBXaGVuVXNlcltdPmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cykge1xuXHRcdFx0XHRcdF9tYXNzYWdlTG9jV2hlblVzZXIoPExvY1doZW5Vc2VyPmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJDaGFubmVsIGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWwge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc2VydmljZTogUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBwcml2YXRlIGdldFVyaVRyYW5zZm9ybWVyOiAocmVxdWVzdENvbnRleHQ6IGFueSkgPT4gSVVSSVRyYW5zZm9ybWVyKSB7IH1cblxuXHRsaXN0ZW4oY29udGV4dDogYW55LCBldmVudDogc3RyaW5nKTogRXZlbnQ8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3RlbicpO1xuXHR9XG5cblx0YXN5bmMgY2FsbChjb250ZXh0OiBhbnksIGNvbW1hbmQ6IHN0cmluZywgYXJncz86IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgdXJpVHJhbnNmb3JtZXIgPSB0aGlzLmdldFVyaVRyYW5zZm9ybWVyKGNvbnRleHQpO1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnd2hlbkV4dGVuc2lvbnNSZWFkeSc6IHJldHVybiBhd2FpdCB0aGlzLnNlcnZpY2Uud2hlbkV4dGVuc2lvbnNSZWFkeSgpO1xuXG5cdFx0XHRjYXNlICdzY2FuRXh0ZW5zaW9ucyc6IHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBhcmdzWzBdO1xuXHRcdFx0XHRjb25zdCBwcm9maWxlTG9jYXRpb24gPSBhcmdzWzFdID8gVVJJLnJldml2ZSh1cmlUcmFuc2Zvcm1lci50cmFuc2Zvcm1JbmNvbWluZyhhcmdzWzFdKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbkxvY2F0aW9ucyA9IEFycmF5LmlzQXJyYXkoYXJnc1syXSkgPyBhcmdzWzJdLm1hcCh1ID0+IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcodSkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoID0gQXJyYXkuaXNBcnJheShhcmdzWzNdKSA/IGFyZ3NbM10ubWFwKHUgPT4gVVJJLnJldml2ZSh1cmlUcmFuc2Zvcm1lci50cmFuc2Zvcm1JbmNvbWluZyh1KSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZVBhY2tJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gYXJnc1s0XTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuc2VydmljZS5zY2FuRXh0ZW5zaW9ucyhcblx0XHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb24sXG5cdFx0XHRcdFx0d29ya3NwYWNlRXh0ZW5zaW9uTG9jYXRpb25zLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCxcblx0XHRcdFx0XHRsYW5ndWFnZVBhY2tJZFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHRyYW5zZm9ybU91dGdvaW5nVVJJcyhleHRlbnNpb24sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjYWxsJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsWUFBWSxNQUFNLGVBQWU7QUFDMUMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFdBQVc7QUFDcEIsWUFBWSxpQkFBaUI7QUFFN0IsU0FBMEIsNkJBQTZCO0FBRXZELFNBQVMsdUJBQXVCLHNCQUFzQixnQkFBc0MsNkJBQTZCLHVCQUF1QixrQkFBa0IseUJBQXlCLG1CQUFtQixxQkFBcUIscUJBQXFCLDZCQUE2Qiw2QkFBcUU7QUFHMVYsU0FBb0MsOEJBQThCO0FBQ2xFLFNBQVMscUJBQTRDO0FBSXJELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUd4QixTQUFTLHlCQUF5QjtBQUUzQixNQUFNLCtCQUEwRTtBQUFBLEVBT3RGLFlBQ2tCLHlCQUNqQixvQkFDaUIsMEJBQ0EsMkJBQ0EsYUFDQSwwQkFD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
