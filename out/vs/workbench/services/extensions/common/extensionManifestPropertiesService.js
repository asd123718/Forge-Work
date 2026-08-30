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
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ALL_EXTENSION_KINDS, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ExtensionsRegistry } from "./extensionsRegistry.js";
import { getGalleryExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from "../../workspaces/common/workspaceTrust.js";
import { isBoolean } from "../../../../base/common/types.js";
import { IWorkspaceTrustEnablementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isWeb } from "../../../../base/common/platform.js";
const IExtensionManifestPropertiesService = createDecorator("extensionManifestPropertiesService");
const EXTENSIONS_SUPPORT_AGENTS_WINDOW = "extensions.supportAgentsWindow";
const SESSIONS_WINDOW_ALLOWED_CONTRIBUTION_POINTS = /* @__PURE__ */ new Set([
  "themes",
  "iconThemes",
  "productIconThemes",
  "colors",
  "keybindings",
  "jsonValidation",
  "jsonValidationRegistry",
  "localizations",
  "grammars",
  "languages"
]);
let ExtensionManifestPropertiesService = class extends Disposable {
  constructor(productService, configurationService, workspaceTrustEnablementService, logService) {
    super();
    this.productService = productService;
    this.configurationService = configurationService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.logService = logService;
    this._extensionPointExtensionKindsMap = null;
    this._productExtensionKindsMap = null;
    this._configuredExtensionKindsMap = null;
    this._productVirtualWorkspaceSupportMap = null;
    this._configuredVirtualWorkspaceSupportMap = null;
    this._configuredSessionsWindowSupportMap = null;
    this._configuredExtensionWorkspaceTrustRequestMap = new ExtensionIdentifierMap();
    const configuredExtensionWorkspaceTrustRequests = configurationService.inspect(WORKSPACE_TRUST_EXTENSION_SUPPORT).userValue || {};
    for (const id of Object.keys(configuredExtensionWorkspaceTrustRequests)) {
      this._configuredExtensionWorkspaceTrustRequestMap.set(id, configuredExtensionWorkspaceTrustRequests[id]);
    }
    this._productExtensionWorkspaceTrustRequestMap = /* @__PURE__ */ new Map();
    if (productService.extensionUntrustedWorkspaceSupport) {
      for (const id of Object.keys(productService.extensionUntrustedWorkspaceSupport)) {
        this._productExtensionWorkspaceTrustRequestMap.set(id, productService.extensionUntrustedWorkspaceSupport[id]);
      }
    }
  }
  canExecuteOnSessionsWindow(manifest) {
    const configuredSessionsWindowSupport = this.getConfiguredSessionsWindowSupport(manifest);
    if (configuredSessionsWindowSupport !== void 0) {
      return configuredSessionsWindowSupport;
    }
    if (manifest.main || manifest.browser) {
      return false;
    }
    const contributionPoints = Object.keys(manifest.contributes || {});
    return contributionPoints.every((point) => SESSIONS_WINDOW_ALLOWED_CONTRIBUTION_POINTS.has(point));
  }
  prefersExecuteOnUI(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "ui";
  }
  prefersExecuteOnWorkspace(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "workspace";
  }
  prefersExecuteOnWeb(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "web";
  }
  canExecuteOnUI(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "ui");
  }
  canExecuteOnWorkspace(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "workspace");
  }
  canExecuteOnWeb(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "web");
  }
  getExtensionKind(manifest) {
    const deducedExtensionKind = this.deduceExtensionKind(manifest);
    const configuredExtensionKind = this.getConfiguredExtensionKind(manifest);
    if (configuredExtensionKind && configuredExtensionKind.length > 0) {
      const result = [];
      for (const extensionKind of configuredExtensionKind) {
        if (extensionKind !== "-web") {
          result.push(extensionKind);
        }
      }
      if (configuredExtensionKind.includes("-web") && !result.length) {
        result.push("ui");
        result.push("workspace");
      }
      if (isWeb && !configuredExtensionKind.includes("-web") && !configuredExtensionKind.includes("web") && deducedExtensionKind.includes("web")) {
        result.push("web");
      }
      return result;
    }
    return deducedExtensionKind;
  }
  getUserConfiguredExtensionKind(extensionIdentifier) {
    if (this._configuredExtensionKindsMap === null) {
      const configuredExtensionKindsMap = new ExtensionIdentifierMap();
      const configuredExtensionKinds = this.configurationService.getValue("remote.extensionKind") || {};
      for (const id of Object.keys(configuredExtensionKinds)) {
        configuredExtensionKindsMap.set(id, configuredExtensionKinds[id]);
      }
      this._configuredExtensionKindsMap = configuredExtensionKindsMap;
    }
    const userConfiguredExtensionKind = this._configuredExtensionKindsMap.get(extensionIdentifier.id);
    return userConfiguredExtensionKind ? this.toArray(userConfiguredExtensionKind) : void 0;
  }
  getExtensionUntrustedWorkspaceSupportType(manifest) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() || !manifest.main) {
      return true;
    }
    const configuredWorkspaceTrustRequest = this.getConfiguredExtensionWorkspaceTrustRequest(manifest);
    const productWorkspaceTrustRequest = this.getProductExtensionWorkspaceTrustRequest(manifest);
    if (configuredWorkspaceTrustRequest !== void 0) {
      return configuredWorkspaceTrustRequest;
    }
    if (productWorkspaceTrustRequest?.override !== void 0) {
      return productWorkspaceTrustRequest.override;
    }
    if (manifest.capabilities?.untrustedWorkspaces?.supported !== void 0) {
      return manifest.capabilities.untrustedWorkspaces.supported;
    }
    if (productWorkspaceTrustRequest?.default !== void 0) {
      return productWorkspaceTrustRequest.default;
    }
    return false;
  }
  getExtensionVirtualWorkspaceSupportType(manifest) {
    const userConfiguredVirtualWorkspaceSupport = this.getConfiguredVirtualWorkspaceSupport(manifest);
    if (userConfiguredVirtualWorkspaceSupport !== void 0) {
      return userConfiguredVirtualWorkspaceSupport;
    }
    const productConfiguredWorkspaceSchemes = this.getProductVirtualWorkspaceSupport(manifest);
    if (productConfiguredWorkspaceSchemes?.override !== void 0) {
      return productConfiguredWorkspaceSchemes.override;
    }
    const virtualWorkspaces = manifest.capabilities?.virtualWorkspaces;
    if (isBoolean(virtualWorkspaces)) {
      return virtualWorkspaces;
    } else if (virtualWorkspaces) {
      const supported = virtualWorkspaces.supported;
      if (isBoolean(supported) || supported === "limited") {
        return supported;
      }
    }
    if (productConfiguredWorkspaceSchemes?.default !== void 0) {
      return productConfiguredWorkspaceSchemes.default;
    }
    return true;
  }
  deduceExtensionKind(manifest) {
    if (manifest.main) {
      if (manifest.browser) {
        return isWeb ? ["workspace", "web"] : ["workspace"];
      }
      return ["workspace"];
    }
    if (manifest.browser) {
      return ["web"];
    }
    let result = [...ALL_EXTENSION_KINDS];
    if (isNonEmptyArray(manifest.extensionPack) || isNonEmptyArray(manifest.extensionDependencies)) {
      result = isWeb ? ["workspace", "web"] : ["workspace"];
    }
    if (manifest.contributes) {
      for (const contribution of Object.keys(manifest.contributes)) {
        const supportedExtensionKinds = this.getSupportedExtensionKindsForExtensionPoint(contribution);
        if (supportedExtensionKinds.length) {
          result = result.filter((extensionKind) => supportedExtensionKinds.includes(extensionKind));
        }
      }
    }
    if (!result.length) {
      this.logService.warn("Cannot deduce extensionKind for extension", getGalleryExtensionId(manifest.publisher, manifest.name));
    }
    return result;
  }
  getSupportedExtensionKindsForExtensionPoint(extensionPoint) {
    if (this._extensionPointExtensionKindsMap === null) {
      const extensionPointExtensionKindsMap = /* @__PURE__ */ new Map();
      ExtensionsRegistry.getExtensionPoints().forEach((e) => extensionPointExtensionKindsMap.set(
        e.name,
        e.defaultExtensionKind || []
        /* supports all */
      ));
      this._extensionPointExtensionKindsMap = extensionPointExtensionKindsMap;
    }
    let extensionPointExtensionKind = this._extensionPointExtensionKindsMap.get(extensionPoint);
    if (extensionPointExtensionKind) {
      return extensionPointExtensionKind;
    }
    extensionPointExtensionKind = this.productService.extensionPointExtensionKind ? this.productService.extensionPointExtensionKind[extensionPoint] : void 0;
    if (extensionPointExtensionKind) {
      return extensionPointExtensionKind;
    }
    return isWeb ? ["workspace", "web"] : ["workspace"];
  }
  getConfiguredExtensionKind(manifest) {
    const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
    let result = this.getUserConfiguredExtensionKind(extensionIdentifier);
    if (typeof result !== "undefined") {
      return this.toArray(result);
    }
    result = this.getProductExtensionKind(manifest);
    if (typeof result !== "undefined") {
      return result;
    }
    result = manifest.extensionKind;
    if (typeof result !== "undefined") {
      result = this.toArray(result);
      return result.filter((r) => ["ui", "workspace"].includes(r));
    }
    return null;
  }
  getProductExtensionKind(manifest) {
    if (this._productExtensionKindsMap === null) {
      const productExtensionKindsMap = new ExtensionIdentifierMap();
      if (this.productService.extensionKind) {
        for (const id of Object.keys(this.productService.extensionKind)) {
          productExtensionKindsMap.set(id, this.productService.extensionKind[id]);
        }
      }
      this._productExtensionKindsMap = productExtensionKindsMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productExtensionKindsMap.get(extensionId);
  }
  getProductVirtualWorkspaceSupport(manifest) {
    if (this._productVirtualWorkspaceSupportMap === null) {
      const productWorkspaceSchemesMap = new ExtensionIdentifierMap();
      if (this.productService.extensionVirtualWorkspacesSupport) {
        for (const id of Object.keys(this.productService.extensionVirtualWorkspacesSupport)) {
          productWorkspaceSchemesMap.set(id, this.productService.extensionVirtualWorkspacesSupport[id]);
        }
      }
      this._productVirtualWorkspaceSupportMap = productWorkspaceSchemesMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productVirtualWorkspaceSupportMap.get(extensionId);
  }
  getConfiguredVirtualWorkspaceSupport(manifest) {
    if (this._configuredVirtualWorkspaceSupportMap === null) {
      const configuredWorkspaceSchemesMap = new ExtensionIdentifierMap();
      const configuredWorkspaceSchemes = this.configurationService.getValue("extensions.supportVirtualWorkspaces") || {};
      for (const id of Object.keys(configuredWorkspaceSchemes)) {
        if (configuredWorkspaceSchemes[id] !== void 0) {
          configuredWorkspaceSchemesMap.set(id, configuredWorkspaceSchemes[id]);
        }
      }
      this._configuredVirtualWorkspaceSupportMap = configuredWorkspaceSchemesMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._configuredVirtualWorkspaceSupportMap.get(extensionId);
  }
  getConfiguredSessionsWindowSupport(manifest) {
    if (this._configuredSessionsWindowSupportMap === null) {
      const configuredSessionsWindowSupportMap = new ExtensionIdentifierMap();
      const configuredSessionsWindowSupport = this.configurationService.getValue(EXTENSIONS_SUPPORT_AGENTS_WINDOW) || {};
      for (const id of Object.keys(configuredSessionsWindowSupport)) {
        if (configuredSessionsWindowSupport[id] !== void 0) {
          configuredSessionsWindowSupportMap.set(id, configuredSessionsWindowSupport[id]);
        }
      }
      this._configuredSessionsWindowSupportMap = configuredSessionsWindowSupportMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._configuredSessionsWindowSupportMap.get(extensionId);
  }
  getConfiguredExtensionWorkspaceTrustRequest(manifest) {
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    const extensionWorkspaceTrustRequest = this._configuredExtensionWorkspaceTrustRequestMap.get(extensionId);
    if (extensionWorkspaceTrustRequest && (extensionWorkspaceTrustRequest.version === void 0 || extensionWorkspaceTrustRequest.version === manifest.version)) {
      return extensionWorkspaceTrustRequest.supported;
    }
    return void 0;
  }
  getProductExtensionWorkspaceTrustRequest(manifest) {
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productExtensionWorkspaceTrustRequestMap.get(extensionId);
  }
  toArray(extensionKind) {
    if (Array.isArray(extensionKind)) {
      return extensionKind;
    }
    return extensionKind === "ui" ? ["ui", "workspace"] : [extensionKind];
  }
};
ExtensionManifestPropertiesService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceTrustEnablementService),
  __decorateParam(3, ILogService)
], ExtensionManifestPropertiesService);
registerSingleton(IExtensionManifestPropertiesService, ExtensionManifestPropertiesService, InstantiationType.Delayed);
export {
  EXTENSIONS_SUPPORT_AGENTS_WINDOW,
  ExtensionManifestPropertiesService,
  IExtensionManifestPropertiesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCwgRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUsIEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIEFMTF9FWFRFTlNJT05fS0lORFMsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIElFeHRlbnNpb25Db250cmlidXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldEdhbGxlcnlFeHRlbnNpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBXT1JLU1BBQ0VfVFJVU1RfRVhURU5TSU9OX1NVUFBPUlQgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuZXhwb3J0IGNvbnN0IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlPignZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZScpO1xuXG5leHBvcnQgY29uc3QgRVhURU5TSU9OU19TVVBQT1JUX0FHRU5UU19XSU5ET1cgPSAnZXh0ZW5zaW9ucy5zdXBwb3J0QWdlbnRzV2luZG93JztcblxuY29uc3QgU0VTU0lPTlNfV0lORE9XX0FMTE9XRURfQ09OVFJJQlVUSU9OX1BPSU5UUzogUmVhZG9ubHlTZXQ8a2V5b2YgSUV4dGVuc2lvbkNvbnRyaWJ1dGlvbnM+ID0gbmV3IFNldChbXG5cdCd0aGVtZXMnLFxuXHQnaWNvblRoZW1lcycsXG5cdCdwcm9kdWN0SWNvblRoZW1lcycsXG5cdCdjb2xvcnMnLFxuXHQna2V5YmluZGluZ3MnLFxuXHQnanNvblZhbGlkYXRpb24nLFxuXHQnanNvblZhbGlkYXRpb25SZWdpc3RyeScsXG5cdCdsb2NhbGl6YXRpb25zJyxcblx0J2dyYW1tYXJzJyxcblx0J2xhbmd1YWdlcycsXG5dKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcmVmZXJzRXhlY3V0ZU9uVUkobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cdHByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cdHByZWZlcnNFeGVjdXRlT25XZWIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cblx0Y2FuRXhlY3V0ZU9uVUkobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cdGNhbkV4ZWN1dGVPbldvcmtzcGFjZShtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbjtcblx0Y2FuRXhlY3V0ZU9uV2ViKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuO1xuXHRjYW5FeGVjdXRlT25TZXNzaW9uc1dpbmRvdyhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbjtcblxuXHRnZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25LaW5kW107XG5cdGdldFVzZXJDb25maWd1cmVkRXh0ZW5zaW9uS2luZChleHRlbnNpb25JZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZDtcblx0Z2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlO1xuXHRnZXRFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZTtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9leHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRzTWFwOiBNYXA8c3RyaW5nLCBFeHRlbnNpb25LaW5kW10+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3Byb2R1Y3RFeHRlbnNpb25LaW5kc01hcDogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25LaW5kW10+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbmZpZ3VyZWRFeHRlbnNpb25LaW5kc01hcDogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25LaW5kIHwgRXh0ZW5zaW9uS2luZFtdPiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgX3Byb2R1Y3RWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcDogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDx7IGRlZmF1bHQ/OiBib29sZWFuOyBvdmVycmlkZT86IGJvb2xlYW4gfT4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0TWFwOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPGJvb2xlYW4+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXA6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8Ym9vbGVhbj4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmVkRXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0TWFwOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPHsgc3VwcG9ydGVkOiBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZTsgdmVyc2lvbj86IHN0cmluZyB9Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdE1hcDogTWFwPHN0cmluZywgRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBXb3Jrc3BhY2UgdHJ1c3QgcmVxdWVzdCB0eXBlIChzZXR0aW5ncy5qc29uKVxuXHRcdHRoaXMuX2NvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDx7IHN1cHBvcnRlZDogRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGU7IHZlcnNpb24/OiBzdHJpbmcgfT4oKTtcblx0XHRjb25zdCBjb25maWd1cmVkRXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0cyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8eyBba2V5OiBzdHJpbmddOiB7IHN1cHBvcnRlZDogRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGU7IHZlcnNpb24/OiBzdHJpbmcgfSB9PihXT1JLU1BBQ0VfVFJVU1RfRVhURU5TSU9OX1NVUFBPUlQpLnVzZXJWYWx1ZSB8fCB7fTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGNvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RzKSkge1xuXHRcdFx0dGhpcy5fY29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdE1hcC5zZXQoaWQsIGNvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RzW2lkXSk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlIHRydXN0IHJlcXVlc3QgdHlwZSAocHJvZHVjdC5qc29uKVxuXHRcdHRoaXMuX3Byb2R1Y3RFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXAgPSBuZXcgTWFwPHN0cmluZywgRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydD4oKTtcblx0XHRpZiAocHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydCkge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhwcm9kdWN0U2VydmljZS5leHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0KSkge1xuXHRcdFx0XHR0aGlzLl9wcm9kdWN0RXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0TWFwLnNldChpZCwgcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFtpZF0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNhbkV4ZWN1dGVPblNlc3Npb25zV2luZG93KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0ID0gdGhpcy5nZXRDb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0KG1hbmlmZXN0KTtcblx0XHRpZiAoY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydDtcblx0XHR9XG5cblx0XHQvLyBJbiB0aGUgc2Vzc2lvbnMgd2luZG93IG9ubHkgZXh0ZW5zaW9ucyB0aGF0IGhhdmUgbm8gY29kZSBhcmUgY3VycmVudGx5IGFsbG93ZWQgdG8gcnVuXG5cdFx0aWYgKG1hbmlmZXN0Lm1haW4gfHwgbWFuaWZlc3QuYnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgYWxsb3cgZXh0ZW5zaW9ucyB0aGF0IGNvbnRyaWJ1dGUgdG8gdGhlbWVzIGFuZCBvdGhlciBkZWNsYXJhdGl2ZSwgbm9uLWV4ZWN1dGluZyBjb250cmlidXRpb24gcG9pbnRzXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uUG9pbnRzID0gT2JqZWN0LmtleXMobWFuaWZlc3QuY29udHJpYnV0ZXMgfHwge30pIGFzIEFycmF5PGtleW9mIElFeHRlbnNpb25Db250cmlidXRpb25zPjtcblx0XHRyZXR1cm4gY29udHJpYnV0aW9uUG9pbnRzLmV2ZXJ5KHBvaW50ID0+IFNFU1NJT05TX1dJTkRPV19BTExPV0VEX0NPTlRSSUJVVElPTl9QT0lOVFMuaGFzKHBvaW50KSk7XG5cdH1cblxuXHRwcmVmZXJzRXhlY3V0ZU9uVUkobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiAoZXh0ZW5zaW9uS2luZC5sZW5ndGggPiAwICYmIGV4dGVuc2lvbktpbmRbMF0gPT09ICd1aScpO1xuXHR9XG5cblx0cHJlZmVyc0V4ZWN1dGVPbldvcmtzcGFjZShtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuZ2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0cmV0dXJuIChleHRlbnNpb25LaW5kLmxlbmd0aCA+IDAgJiYgZXh0ZW5zaW9uS2luZFswXSA9PT0gJ3dvcmtzcGFjZScpO1xuXHR9XG5cblx0cHJlZmVyc0V4ZWN1dGVPbldlYihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuZ2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0cmV0dXJuIChleHRlbnNpb25LaW5kLmxlbmd0aCA+IDAgJiYgZXh0ZW5zaW9uS2luZFswXSA9PT0gJ3dlYicpO1xuXHR9XG5cblx0Y2FuRXhlY3V0ZU9uVUkobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiBleHRlbnNpb25LaW5kLnNvbWUoa2luZCA9PiBraW5kID09PSAndWknKTtcblx0fVxuXG5cdGNhbkV4ZWN1dGVPbldvcmtzcGFjZShtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuZ2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbktpbmQuc29tZShraW5kID0+IGtpbmQgPT09ICd3b3Jrc3BhY2UnKTtcblx0fVxuXG5cdGNhbkV4ZWN1dGVPbldlYihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuZ2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbktpbmQuc29tZShraW5kID0+IGtpbmQgPT09ICd3ZWInKTtcblx0fVxuXG5cdGdldEV4dGVuc2lvbktpbmQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvbktpbmRbXSB7XG5cdFx0Y29uc3QgZGVkdWNlZEV4dGVuc2lvbktpbmQgPSB0aGlzLmRlZHVjZUV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kID0gdGhpcy5nZXRDb25maWd1cmVkRXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cblx0XHRpZiAoY29uZmlndXJlZEV4dGVuc2lvbktpbmQgJiYgY29uZmlndXJlZEV4dGVuc2lvbktpbmQubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBFeHRlbnNpb25LaW5kW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiBjb25maWd1cmVkRXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCAhPT0gJy13ZWInKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uS2luZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgb3B0ZWQgb3V0IGZyb20gd2ViIHdpdGhvdXQgc3BlY2lmeWluZyBvdGhlciBleHRlbnNpb24ga2luZHMgdGhlbiBkZWZhdWx0IHRvIHVpLCB3b3Jrc3BhY2Vcblx0XHRcdGlmIChjb25maWd1cmVkRXh0ZW5zaW9uS2luZC5pbmNsdWRlcygnLXdlYicpICYmICFyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKCd1aScpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCgnd29ya3NwYWNlJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZCB3ZWIga2luZCBpZiBub3Qgb3B0ZWQgb3V0IGZyb20gd2ViIGFuZCBjYW4gcnVuIGluIHdlYlxuXHRcdFx0aWYgKGlzV2ViICYmICFjb25maWd1cmVkRXh0ZW5zaW9uS2luZC5pbmNsdWRlcygnLXdlYicpICYmICFjb25maWd1cmVkRXh0ZW5zaW9uS2luZC5pbmNsdWRlcygnd2ViJykgJiYgZGVkdWNlZEV4dGVuc2lvbktpbmQuaW5jbHVkZXMoJ3dlYicpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKCd3ZWInKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVkdWNlZEV4dGVuc2lvbktpbmQ7XG5cdH1cblxuXHRnZXRVc2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBFeHRlbnNpb25LaW5kW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXAgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kc01hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvbktpbmQgfCBFeHRlbnNpb25LaW5kW10+KCk7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkRXh0ZW5zaW9uS2luZHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW2tleTogc3RyaW5nXTogRXh0ZW5zaW9uS2luZCB8IEV4dGVuc2lvbktpbmRbXSB9PigncmVtb3RlLmV4dGVuc2lvbktpbmQnKSB8fCB7fTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMoY29uZmlndXJlZEV4dGVuc2lvbktpbmRzKSkge1xuXHRcdFx0XHRjb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXAuc2V0KGlkLCBjb25maWd1cmVkRXh0ZW5zaW9uS2luZHNbaWRdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZ3VyZWRFeHRlbnNpb25LaW5kc01hcCA9IGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kc01hcDtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQgPSB0aGlzLl9jb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXAuZ2V0KGV4dGVuc2lvbklkZW50aWZpZXIuaWQpO1xuXHRcdHJldHVybiB1c2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQgPyB0aGlzLnRvQXJyYXkodXNlckNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZSB7XG5cdFx0Ly8gV29ya3NwYWNlIHRydXN0IGZlYXR1cmUgaXMgZGlzYWJsZWQsIG9yIGV4dGVuc2lvbiBoYXMgbm8gZW50cnkgcG9pbnRcblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpIHx8ICFtYW5pZmVzdC5tYWluKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBHZXQgZXh0ZW5zaW9uIHdvcmtzcGFjZSB0cnVzdCByZXF1aXJlbWVudHMgZnJvbSBzZXR0aW5ncy5qc29uXG5cdFx0Y29uc3QgY29uZmlndXJlZFdvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuZ2V0Q29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdChtYW5pZmVzdCk7XG5cblx0XHQvLyBHZXQgZXh0ZW5zaW9uIHdvcmtzcGFjZSB0cnVzdCByZXF1aXJlbWVudHMgZnJvbSBwcm9kdWN0Lmpzb25cblx0XHRjb25zdCBwcm9kdWN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0ID0gdGhpcy5nZXRQcm9kdWN0RXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KG1hbmlmZXN0KTtcblxuXHRcdC8vIFVzZSBzZXR0aW5ncy5qc29uIG92ZXJyaWRlIHZhbHVlIGlmIGl0IGV4aXN0c1xuXHRcdGlmIChjb25maWd1cmVkV29ya3NwYWNlVHJ1c3RSZXF1ZXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBjb25maWd1cmVkV29ya3NwYWNlVHJ1c3RSZXF1ZXN0O1xuXHRcdH1cblxuXHRcdC8vIFVzZSBwcm9kdWN0Lmpzb24gb3ZlcnJpZGUgdmFsdWUgaWYgaXQgZXhpc3RzXG5cdFx0aWYgKHByb2R1Y3RXb3Jrc3BhY2VUcnVzdFJlcXVlc3Q/Lm92ZXJyaWRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBwcm9kdWN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0Lm92ZXJyaWRlO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBleHRlbnNpb24gbWFuaWZlc3QgdmFsdWUgaWYgaXQgZXhpc3RzXG5cdFx0aWYgKG1hbmlmZXN0LmNhcGFiaWxpdGllcz8udW50cnVzdGVkV29ya3NwYWNlcz8uc3VwcG9ydGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBtYW5pZmVzdC5jYXBhYmlsaXRpZXMudW50cnVzdGVkV29ya3NwYWNlcy5zdXBwb3J0ZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIHByb2R1Y3QuanNvbiBkZWZhdWx0IHZhbHVlIGlmIGl0IGV4aXN0c1xuXHRcdGlmIChwcm9kdWN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0Py5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBwcm9kdWN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0LmRlZmF1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0RXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUge1xuXHRcdC8vIGNoZWNrIHVzZXIgY29uZmlndXJlZFxuXHRcdGNvbnN0IHVzZXJDb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnQgPSB0aGlzLmdldENvbmZpZ3VyZWRWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydChtYW5pZmVzdCk7XG5cdFx0aWYgKHVzZXJDb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVzZXJDb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZHVjdENvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzID0gdGhpcy5nZXRQcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnQobWFuaWZlc3QpO1xuXG5cdFx0Ly8gY2hlY2sgb3ZlcnJpZGUgZnJvbSBwcm9kdWN0XG5cdFx0aWYgKHByb2R1Y3RDb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcz8ub3ZlcnJpZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHByb2R1Y3RDb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcy5vdmVycmlkZTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayB0aGUgbWFuaWZlc3Rcblx0XHRjb25zdCB2aXJ0dWFsV29ya3NwYWNlcyA9IG1hbmlmZXN0LmNhcGFiaWxpdGllcz8udmlydHVhbFdvcmtzcGFjZXM7XG5cdFx0aWYgKGlzQm9vbGVhbih2aXJ0dWFsV29ya3NwYWNlcykpIHtcblx0XHRcdHJldHVybiB2aXJ0dWFsV29ya3NwYWNlcztcblx0XHR9IGVsc2UgaWYgKHZpcnR1YWxXb3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCBzdXBwb3J0ZWQgPSB2aXJ0dWFsV29ya3NwYWNlcy5zdXBwb3J0ZWQ7XG5cdFx0XHRpZiAoaXNCb29sZWFuKHN1cHBvcnRlZCkgfHwgc3VwcG9ydGVkID09PSAnbGltaXRlZCcpIHtcblx0XHRcdFx0cmV0dXJuIHN1cHBvcnRlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjaGVjayBkZWZhdWx0IGZyb20gcHJvZHVjdFxuXHRcdGlmIChwcm9kdWN0Q29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXM/LmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHByb2R1Y3RDb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcy5kZWZhdWx0O1xuXHRcdH1cblxuXHRcdC8vIERlZmF1bHQgLSBzdXBwb3J0cyB2aXJ0dWFsIHdvcmtzcGFjZVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWR1Y2VFeHRlbnNpb25LaW5kKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25LaW5kW10ge1xuXHRcdC8vIE5vdCBhbiBVSSBleHRlbnNpb24gaWYgaXQgaGFzIG1haW5cblx0XHRpZiAobWFuaWZlc3QubWFpbikge1xuXHRcdFx0aWYgKG1hbmlmZXN0LmJyb3dzZXIpIHtcblx0XHRcdFx0cmV0dXJuIGlzV2ViID8gWyd3b3Jrc3BhY2UnLCAnd2ViJ10gOiBbJ3dvcmtzcGFjZSddO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFsnd29ya3NwYWNlJ107XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0LmJyb3dzZXIpIHtcblx0XHRcdHJldHVybiBbJ3dlYiddO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQgPSBbLi4uQUxMX0VYVEVOU0lPTl9LSU5EU107XG5cblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KG1hbmlmZXN0LmV4dGVuc2lvblBhY2spIHx8IGlzTm9uRW1wdHlBcnJheShtYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMpKSB7XG5cdFx0XHQvLyBFeHRlbnNpb24gcGFjayBkZWZhdWx0cyB0byBbd29ya3NwYWNlLCB3ZWJdIGluIHdlYiBhbmQgb25seSBbd29ya3NwYWNlXSBpbiBkZXNrdG9wXG5cdFx0XHRyZXN1bHQgPSBpc1dlYiA/IFsnd29ya3NwYWNlJywgJ3dlYiddIDogWyd3b3Jrc3BhY2UnXTtcblx0XHR9XG5cblx0XHRpZiAobWFuaWZlc3QuY29udHJpYnV0ZXMpIHtcblx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIE9iamVjdC5rZXlzKG1hbmlmZXN0LmNvbnRyaWJ1dGVzKSkge1xuXHRcdFx0XHRjb25zdCBzdXBwb3J0ZWRFeHRlbnNpb25LaW5kcyA9IHRoaXMuZ2V0U3VwcG9ydGVkRXh0ZW5zaW9uS2luZHNGb3JFeHRlbnNpb25Qb2ludChjb250cmlidXRpb24pO1xuXHRcdFx0XHRpZiAoc3VwcG9ydGVkRXh0ZW5zaW9uS2luZHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0LmZpbHRlcihleHRlbnNpb25LaW5kID0+IHN1cHBvcnRlZEV4dGVuc2lvbktpbmRzLmluY2x1ZGVzKGV4dGVuc2lvbktpbmQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0Nhbm5vdCBkZWR1Y2UgZXh0ZW5zaW9uS2luZCBmb3IgZXh0ZW5zaW9uJywgZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFN1cHBvcnRlZEV4dGVuc2lvbktpbmRzRm9yRXh0ZW5zaW9uUG9pbnQoZXh0ZW5zaW9uUG9pbnQ6IHN0cmluZyk6IEV4dGVuc2lvbktpbmRbXSB7XG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZHNNYXAgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZHNNYXAgPSBuZXcgTWFwPHN0cmluZywgRXh0ZW5zaW9uS2luZFtdPigpO1xuXHRcdFx0RXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEV4dGVuc2lvblBvaW50cygpLmZvckVhY2goZSA9PiBleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRzTWFwLnNldChlLm5hbWUsIGUuZGVmYXVsdEV4dGVuc2lvbktpbmQgfHwgW10gLyogc3VwcG9ydHMgYWxsICovKSk7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRzTWFwID0gZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kc01hcDtcblx0XHR9XG5cblx0XHRsZXQgZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kID0gdGhpcy5fZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kc01hcC5nZXQoZXh0ZW5zaW9uUG9pbnQpO1xuXHRcdGlmIChleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmQpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmQ7XG5cdFx0fVxuXG5cdFx0ZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kID0gdGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmQgPyB0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZFtleHRlbnNpb25Qb2ludF0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZDtcblx0XHR9XG5cblx0XHQvKiBVbmtub3duIGV4dGVuc2lvbiBwb2ludCAqL1xuXHRcdHJldHVybiBpc1dlYiA/IFsnd29ya3NwYWNlJywgJ3dlYiddIDogWyd3b3Jrc3BhY2UnXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlZEV4dGVuc2lvbktpbmQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IChFeHRlbnNpb25LaW5kIHwgJy13ZWInKVtdIHwgbnVsbCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpIH07XG5cblx0XHQvLyBjaGVjayBpbiBjb25maWdcblx0XHRsZXQgcmVzdWx0OiBFeHRlbnNpb25LaW5kIHwgRXh0ZW5zaW9uS2luZFtdIHwgdW5kZWZpbmVkID0gdGhpcy5nZXRVc2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcik7XG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b0FycmF5KHJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgcHJvZHVjdC5qc29uXG5cdFx0cmVzdWx0ID0gdGhpcy5nZXRQcm9kdWN0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIHRoZSBtYW5pZmVzdCBpdHNlbGZcblx0XHRyZXN1bHQgPSBtYW5pZmVzdC5leHRlbnNpb25LaW5kO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmVzdWx0ID0gdGhpcy50b0FycmF5KHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0LmZpbHRlcihyID0+IFsndWknLCAnd29ya3NwYWNlJ10uaW5jbHVkZXMocikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0RXh0ZW5zaW9uS2luZChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uS2luZFtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcHJvZHVjdEV4dGVuc2lvbktpbmRzTWFwID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBwcm9kdWN0RXh0ZW5zaW9uS2luZHNNYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25LaW5kW10+KCk7XG5cdFx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXModGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25LaW5kKSkge1xuXHRcdFx0XHRcdHByb2R1Y3RFeHRlbnNpb25LaW5kc01hcC5zZXQoaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uS2luZFtpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm9kdWN0RXh0ZW5zaW9uS2luZHNNYXAgPSBwcm9kdWN0RXh0ZW5zaW9uS2luZHNNYXA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKTtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdEV4dGVuc2lvbktpbmRzTWFwLmdldChleHRlbnNpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2R1Y3RWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogeyBkZWZhdWx0PzogYm9vbGVhbjsgb3ZlcnJpZGU/OiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9wcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IHByb2R1Y3RXb3Jrc3BhY2VTY2hlbWVzTWFwID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8eyBkZWZhdWx0PzogYm9vbGVhbjsgb3ZlcnJpZGU/OiBib29sZWFuIH0+KCk7XG5cdFx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlc1N1cHBvcnQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyh0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VzU3VwcG9ydCkpIHtcblx0XHRcdFx0XHRwcm9kdWN0V29ya3NwYWNlU2NoZW1lc01hcC5zZXQoaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZXNTdXBwb3J0W2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb2R1Y3RWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcCA9IHByb2R1Y3RXb3Jrc3BhY2VTY2hlbWVzTWFwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcC5nZXQoZXh0ZW5zaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzTWFwID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8Ym9vbGVhbj4oKTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfT4oJ2V4dGVuc2lvbnMuc3VwcG9ydFZpcnR1YWxXb3Jrc3BhY2VzJykgfHwge307XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzKSkge1xuXHRcdFx0XHRpZiAoY29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXNbaWRdICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lc01hcC5zZXQoaWQsIGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzW2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZ3VyZWRWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcCA9IGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzTWFwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyZWRWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcC5nZXQoZXh0ZW5zaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydE1hcCA9PT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydE1hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPGJvb2xlYW4+KCk7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfT4oRVhURU5TSU9OU19TVVBQT1JUX0FHRU5UU19XSU5ET1cpIHx8IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0KSkge1xuXHRcdFx0XHRpZiAoY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydFtpZF0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXAuc2V0KGlkLCBjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0W2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXAgPSBjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0TWFwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXAuZ2V0KGV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fY29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdE1hcC5nZXQoZXh0ZW5zaW9uSWQpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdCAmJiAoZXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0LnZlcnNpb24gPT09IHVuZGVmaW5lZCB8fCBleHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3QudmVyc2lvbiA9PT0gbWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3Quc3VwcG9ydGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2R1Y3RFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXAuZ2V0KGV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgdG9BcnJheShleHRlbnNpb25LaW5kOiBFeHRlbnNpb25LaW5kIHwgRXh0ZW5zaW9uS2luZFtdKTogRXh0ZW5zaW9uS2luZFtdIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlbnNpb25LaW5kKSkge1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbktpbmQ7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25LaW5kID09PSAndWknID8gWyd1aScsICd3b3Jrc3BhY2UnXSA6IFtleHRlbnNpb25LaW5kXTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSwgRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQWlJLHFCQUFxQiw4QkFBdUQ7QUFFN00sU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsbUJBQW1CO0FBQzVCLFNB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
