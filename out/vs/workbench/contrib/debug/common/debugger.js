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
import * as nls from "../../../../nls.js";
import { isObject } from "../../../../base/common/types.js";
import { IDebugService, debuggerDisabledMessage, DebugConfigurationProviderTriggerKind } from "./debug.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import * as ConfigurationResolverUtils from "../../../services/configurationResolver/common/configurationResolverUtils.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { URI } from "../../../../base/common/uri.js";
import { Schemas } from "../../../../base/common/network.js";
import { isDebuggerMainContribution } from "./debugUtils.js";
import { cleanRemoteAuthority } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { filter } from "../../../../base/common/objects.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let Debugger = class {
  constructor(adapterManager, dbgContribution, extensionDescription, configurationService, resourcePropertiesService, configurationResolverService, environmentService, debugService, contextKeyService, productService, logService) {
    this.adapterManager = adapterManager;
    this.configurationService = configurationService;
    this.resourcePropertiesService = resourcePropertiesService;
    this.configurationResolverService = configurationResolverService;
    this.environmentService = environmentService;
    this.debugService = debugService;
    this.contextKeyService = contextKeyService;
    this.productService = productService;
    this.logService = logService;
    this.mergedExtensionDescriptions = [];
    this.debuggerContribution = { type: dbgContribution.type };
    this.merge(dbgContribution, extensionDescription);
    this.debuggerWhen = typeof this.debuggerContribution.when === "string" ? ContextKeyExpr.deserialize(this.debuggerContribution.when) : void 0;
    this.debuggerHiddenWhen = typeof this.debuggerContribution.hiddenWhen === "string" ? ContextKeyExpr.deserialize(this.debuggerContribution.hiddenWhen) : void 0;
  }
  merge(otherDebuggerContribution, extensionDescription) {
    function mixin(destination, source, overwrite, level = 0) {
      if (!isObject(destination)) {
        return source;
      }
      if (isObject(source)) {
        Object.keys(source).forEach((key) => {
          if (key !== "__proto__") {
            if (isObject(destination[key]) && isObject(source[key])) {
              mixin(destination[key], source[key], overwrite, level + 1);
            } else {
              if (key in destination) {
                if (overwrite) {
                  if (level === 0 && key === "type") {
                  } else {
                    destination[key] = source[key];
                  }
                }
              } else {
                destination[key] = source[key];
              }
            }
          }
        });
      }
      return destination;
    }
    if (this.mergedExtensionDescriptions.indexOf(extensionDescription) < 0) {
      this.mergedExtensionDescriptions.push(extensionDescription);
      mixin(this.debuggerContribution, otherDebuggerContribution, extensionDescription.isBuiltin);
      if (isDebuggerMainContribution(otherDebuggerContribution)) {
        this.mainExtensionDescription = extensionDescription;
      }
    }
  }
  async startDebugging(configuration, parentSessionId) {
    const parentSession = this.debugService.getModel().getSession(parentSessionId);
    return await this.debugService.startDebugging(void 0, configuration, { parentSession }, void 0);
  }
  async createDebugAdapter(session) {
    await this.adapterManager.activateDebuggers("onDebugAdapterProtocolTracker", this.type);
    const da = this.adapterManager.createDebugAdapter(session);
    if (da) {
      return Promise.resolve(da);
    }
    throw new Error(nls.localize("cannot.find.da", "Cannot find debug adapter for type '{0}'.", this.type));
  }
  async substituteVariables(folder, config) {
    const substitutedConfig = await this.adapterManager.substituteVariables(this.type, folder, config);
    return await this.configurationResolverService.resolveWithInteractionReplace(folder, substitutedConfig, "launch", this.variables, substitutedConfig.__configurationTarget);
  }
  runInTerminal(args, sessionId) {
    return this.adapterManager.runInTerminal(this.type, args, sessionId);
  }
  get label() {
    return this.debuggerContribution.label || this.debuggerContribution.type;
  }
  get type() {
    return this.debuggerContribution.type;
  }
  get variables() {
    return this.debuggerContribution.variables;
  }
  get configurationSnippets() {
    return this.debuggerContribution.configurationSnippets;
  }
  get languages() {
    return this.debuggerContribution.languages;
  }
  get when() {
    return this.debuggerWhen;
  }
  get hiddenWhen() {
    return this.debuggerHiddenWhen;
  }
  get enabled() {
    return !this.debuggerWhen || this.contextKeyService.contextMatchesRules(this.debuggerWhen);
  }
  get isHiddenFromDropdown() {
    if (!this.debuggerHiddenWhen) {
      return false;
    }
    return this.contextKeyService.contextMatchesRules(this.debuggerHiddenWhen);
  }
  get strings() {
    return this.debuggerContribution.strings ?? this.debuggerContribution.uiMessages;
  }
  interestedInLanguage(languageId) {
    return !!(this.languages && this.languages.indexOf(languageId) >= 0);
  }
  hasInitialConfiguration() {
    return !!this.debuggerContribution.initialConfigurations;
  }
  hasDynamicConfigurationProviders() {
    return this.debugService.getConfigurationManager().hasDebugConfigurationProvider(this.type, DebugConfigurationProviderTriggerKind.Dynamic);
  }
  hasConfigurationProvider() {
    return this.debugService.getConfigurationManager().hasDebugConfigurationProvider(this.type);
  }
  getInitialConfigurationContent(initialConfigs) {
    let initialConfigurations = this.debuggerContribution.initialConfigurations || [];
    if (initialConfigs) {
      initialConfigurations = initialConfigurations.concat(initialConfigs);
    }
    const eol = this.resourcePropertiesService.getEOL(URI.from({ scheme: Schemas.untitled, path: "1" })) === "\r\n" ? "\r\n" : "\n";
    const configs = JSON.stringify(initialConfigurations, null, "	").split("\n").map((line) => "	" + line).join(eol).trim();
    const comment1 = nls.localize("launch.config.comment1", "Use IntelliSense to learn about possible attributes.");
    const comment2 = nls.localize("launch.config.comment2", "Hover to view descriptions of existing attributes.");
    const comment3 = nls.localize("launch.config.comment3", "For more information, visit: {0}", "https://go.microsoft.com/fwlink/?linkid=830387");
    let content = [
      "{",
      `	// ${comment1}`,
      `	// ${comment2}`,
      `	// ${comment3}`,
      `	"version": "0.2.0",`,
      `	"configurations": ${configs}`,
      "}"
    ].join(eol);
    const editorConfig = this.configurationService.getValue();
    if (editorConfig.editor && editorConfig.editor.insertSpaces) {
      content = content.replace(new RegExp("	", "g"), " ".repeat(editorConfig.editor.tabSize));
    }
    return Promise.resolve(content);
  }
  getMainExtensionDescriptor() {
    return this.mainExtensionDescription || this.mergedExtensionDescriptions[0];
  }
  getCustomTelemetryEndpoint() {
    const aiKey = this.debuggerContribution.aiKey;
    if (!aiKey) {
      return void 0;
    }
    const sendErrorTelemtry = cleanRemoteAuthority(this.environmentService.remoteAuthority, this.productService) !== "other";
    return {
      id: `${this.getMainExtensionDescriptor().publisher}.${this.type}`,
      aiKey,
      sendErrorTelemetry: sendErrorTelemtry
    };
  }
  getSchemaAttributes(definitions) {
    if (!this.debuggerContribution.configurationAttributes) {
      return null;
    }
    return Object.entries(this.debuggerContribution.configurationAttributes).map(([request, attributes]) => {
      const definitionId = `${this.type}:${request}`;
      const platformSpecificDefinitionId = `${this.type}:${request}:platform`;
      const defaultRequired = ["name", "type", "request"];
      attributes.required = attributes.required && attributes.required.length ? defaultRequired.concat(attributes.required) : defaultRequired;
      attributes.additionalProperties = false;
      attributes.type = "object";
      if (!attributes.properties) {
        attributes.properties = {};
      }
      const properties = attributes.properties;
      properties["type"] = {
        enum: [this.type],
        enumDescriptions: [this.label],
        description: nls.localize("debugType", "Type of configuration."),
        pattern: "^(?!node2)",
        deprecationMessage: this.debuggerContribution.deprecated || (this.enabled ? void 0 : debuggerDisabledMessage(this.type)),
        doNotSuggest: !!this.debuggerContribution.deprecated,
        errorMessage: nls.localize("debugTypeNotRecognised", "The debug type is not recognized. Make sure that you have a corresponding debug extension installed and that it is enabled."),
        patternErrorMessage: nls.localize("node2NotSupported", '"node2" is no longer supported, use "node" instead and set the "protocol" attribute to "inspector".')
      };
      properties["request"] = {
        enum: [request],
        description: nls.localize("debugRequest", 'Request type of configuration. Can be "launch" or "attach".')
      };
      for (const prop in definitions["common"].properties) {
        properties[prop] = {
          $ref: `#/definitions/common/properties/${prop}`
        };
      }
      const malformedPropertyNames = [];
      Object.keys(properties).forEach((name) => {
        const property = properties[name];
        if (isObject(property)) {
          ConfigurationResolverUtils.applyDeprecatedVariableMessage(property);
        } else {
          malformedPropertyNames.push(name);
        }
      });
      if (malformedPropertyNames.length) {
        this.logService.warn(`Ignoring malformed debug configuration schema properties for type '${this.type}': ${malformedPropertyNames.join(", ")}`);
      }
      definitions[definitionId] = { ...attributes };
      definitions[platformSpecificDefinitionId] = {
        type: "object",
        additionalProperties: false,
        properties: filter(properties, (key) => key !== "type" && key !== "request" && key !== "name")
      };
      const attributesCopy = { ...attributes };
      attributesCopy.properties = {
        ...properties,
        ...{
          windows: {
            $ref: `#/definitions/${platformSpecificDefinitionId}`,
            description: nls.localize("debugWindowsConfiguration", "Windows specific launch configuration attributes.")
          },
          osx: {
            $ref: `#/definitions/${platformSpecificDefinitionId}`,
            description: nls.localize("debugOSXConfiguration", "OS X specific launch configuration attributes.")
          },
          linux: {
            $ref: `#/definitions/${platformSpecificDefinitionId}`,
            description: nls.localize("debugLinuxConfiguration", "Linux specific launch configuration attributes.")
          }
        }
      };
      return attributesCopy;
    });
  }
};
Debugger = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITextResourcePropertiesService),
  __decorateParam(5, IConfigurationResolverService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, IDebugService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IProductService),
  __decorateParam(10, ILogService)
], Debugger);
export {
  Debugger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCwgSUpTT05TY2hlbWFTbmlwcGV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZywgSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBJRGVidWdBZGFwdGVyLCBJRGVidWdnZXIsIElEZWJ1Z1Nlc3Npb24sIElBZGFwdGVyTWFuYWdlciwgSURlYnVnU2VydmljZSwgZGVidWdnZXJEaXNhYmxlZE1lc3NhZ2UsIElEZWJ1Z2dlck1ldGFkYXRhLCBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0ICogYXMgQ29uZmlndXJhdGlvblJlc29sdmVyVXRpbHMgZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRGVidWdnZXJNYWluQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeUVuZHBvaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgY2xlYW5SZW1vdGVBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdnZXIgaW1wbGVtZW50cyBJRGVidWdnZXIsIElEZWJ1Z2dlck1ldGFkYXRhIHtcblxuXHRwcml2YXRlIGRlYnVnZ2VyQ29udHJpYnV0aW9uOiBJRGVidWdnZXJDb250cmlidXRpb247XG5cdHByaXZhdGUgbWVyZ2VkRXh0ZW5zaW9uRGVzY3JpcHRpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRwcml2YXRlIG1haW5FeHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZGVidWdnZXJXaGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkZWJ1Z2dlckhpZGRlbldoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgYWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlcixcblx0XHRkYmdDb250cmlidXRpb246IElEZWJ1Z2dlckNvbnRyaWJ1dGlvbixcblx0XHRleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlOiBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZGVidWdnZXJDb250cmlidXRpb24gPSB7IHR5cGU6IGRiZ0NvbnRyaWJ1dGlvbi50eXBlIH07XG5cdFx0dGhpcy5tZXJnZShkYmdDb250cmlidXRpb24sIGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblxuXHRcdHRoaXMuZGVidWdnZXJXaGVuID0gdHlwZW9mIHRoaXMuZGVidWdnZXJDb250cmlidXRpb24ud2hlbiA9PT0gJ3N0cmluZycgPyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh0aGlzLmRlYnVnZ2VyQ29udHJpYnV0aW9uLndoZW4pIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGVidWdnZXJIaWRkZW5XaGVuID0gdHlwZW9mIHRoaXMuZGVidWdnZXJDb250cmlidXRpb24uaGlkZGVuV2hlbiA9PT0gJ3N0cmluZycgPyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh0aGlzLmRlYnVnZ2VyQ29udHJpYnV0aW9uLmhpZGRlbldoZW4pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0bWVyZ2Uob3RoZXJEZWJ1Z2dlckNvbnRyaWJ1dGlvbjogSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdm9pZCB7XG5cblx0XHQvKipcblx0XHQgKiBDb3BpZXMgYWxsIHByb3BlcnRpZXMgb2Ygc291cmNlIGludG8gZGVzdGluYXRpb24uIFRoZSBvcHRpb25hbCBwYXJhbWV0ZXIgXCJvdmVyd3JpdGVcIiBhbGxvd3MgdG8gY29udHJvbFxuXHRcdCAqIGlmIGV4aXN0aW5nIG5vbi1zdHJ1Y3R1cmVkIHByb3BlcnRpZXMgb24gdGhlIGRlc3RpbmF0aW9uIHNob3VsZCBiZSBvdmVyd3JpdHRlbiBvciBub3QuIERlZmF1bHRzIHRvIHRydWUgKG92ZXJ3cml0ZSkuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gbWl4aW4oZGVzdGluYXRpb246IGFueSwgc291cmNlOiBhbnksIG92ZXJ3cml0ZTogYm9vbGVhbiwgbGV2ZWwgPSAwKTogYW55IHtcblxuXHRcdFx0aWYgKCFpc09iamVjdChkZXN0aW5hdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzT2JqZWN0KHNvdXJjZSkpIHtcblx0XHRcdFx0T2JqZWN0LmtleXMoc291cmNlKS5mb3JFYWNoKGtleSA9PiB7XG5cdFx0XHRcdFx0aWYgKGtleSAhPT0gJ19fcHJvdG9fXycpIHtcblx0XHRcdFx0XHRcdGlmIChpc09iamVjdChkZXN0aW5hdGlvbltrZXldKSAmJiBpc09iamVjdChzb3VyY2Vba2V5XSkpIHtcblx0XHRcdFx0XHRcdFx0bWl4aW4oZGVzdGluYXRpb25ba2V5XSwgc291cmNlW2tleV0sIG92ZXJ3cml0ZSwgbGV2ZWwgKyAxKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmIChrZXkgaW4gZGVzdGluYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAob3ZlcndyaXRlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAobGV2ZWwgPT09IDAgJiYga2V5ID09PSAndHlwZScpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gZG9uJ3QgbWVyZ2UgdGhlICd0eXBlJyBwcm9wZXJ0eVxuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzdGluYXRpb25ba2V5XSA9IHNvdXJjZVtrZXldO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRkZXN0aW5hdGlvbltrZXldID0gc291cmNlW2tleV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZGVzdGluYXRpb247XG5cdFx0fVxuXG5cdFx0Ly8gb25seSBpZiBub3QgYWxyZWFkeSBtZXJnZWRcblx0XHRpZiAodGhpcy5tZXJnZWRFeHRlbnNpb25EZXNjcmlwdGlvbnMuaW5kZXhPZihleHRlbnNpb25EZXNjcmlwdGlvbikgPCAwKSB7XG5cblx0XHRcdC8vIHJlbWVtYmVyIGFsbCBleHRlbnNpb25zIHRoYXQgaGF2ZSBiZWVuIG1lcmdlZCBmb3IgdGhpcyBkZWJ1Z2dlclxuXHRcdFx0dGhpcy5tZXJnZWRFeHRlbnNpb25EZXNjcmlwdGlvbnMucHVzaChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cblx0XHRcdC8vIG1lcmdlIG5ldyBkZWJ1Z2dlciBjb250cmlidXRpb24gaW50byBleGlzdGluZyBjb250cmlidXRpb25zIChhbmQgZG9uJ3Qgb3ZlcndyaXRlIHZhbHVlcyBpbiBidWlsdC1pbiBleHRlbnNpb25zKVxuXHRcdFx0bWl4aW4odGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbiwgb3RoZXJEZWJ1Z2dlckNvbnRyaWJ1dGlvbiwgZXh0ZW5zaW9uRGVzY3JpcHRpb24uaXNCdWlsdGluKTtcblxuXHRcdFx0Ly8gcmVtZW1iZXIgdGhlIGV4dGVuc2lvbiB0aGF0IGlzIGNvbnNpZGVyZWQgdGhlIFwibWFpblwiIGRlYnVnZ2VyIGNvbnRyaWJ1dGlvblxuXHRcdFx0aWYgKGlzRGVidWdnZXJNYWluQ29udHJpYnV0aW9uKG90aGVyRGVidWdnZXJDb250cmlidXRpb24pKSB7XG5cdFx0XHRcdHRoaXMubWFpbkV4dGVuc2lvbkRlc2NyaXB0aW9uID0gZXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RhcnREZWJ1Z2dpbmcoY29uZmlndXJhdGlvbjogSUNvbmZpZywgcGFyZW50U2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHBhcmVudFNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbiwgeyBwYXJlbnRTZXNzaW9uIH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVEZWJ1Z0FkYXB0ZXIoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8SURlYnVnQWRhcHRlcj4ge1xuXHRcdGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuYWN0aXZhdGVEZWJ1Z2dlcnMoJ29uRGVidWdBZGFwdGVyUHJvdG9jb2xUcmFja2VyJywgdGhpcy50eXBlKTtcblx0XHRjb25zdCBkYSA9IHRoaXMuYWRhcHRlck1hbmFnZXIuY3JlYXRlRGVidWdBZGFwdGVyKHNlc3Npb24pO1xuXHRcdGlmIChkYSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkYSk7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Nhbm5vdC5maW5kLmRhJywgXCJDYW5ub3QgZmluZCBkZWJ1ZyBhZGFwdGVyIGZvciB0eXBlICd7MH0nLlwiLCB0aGlzLnR5cGUpKTtcblx0fVxuXG5cdGFzeW5jIHN1YnN0aXR1dGVWYXJpYWJsZXMoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBjb25maWc6IElDb25maWcpOiBQcm9taXNlPElDb25maWcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdWJzdGl0dXRlZENvbmZpZyA9IGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuc3Vic3RpdHV0ZVZhcmlhYmxlcyh0aGlzLnR5cGUsIGZvbGRlciwgY29uZmlnKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKGZvbGRlciwgc3Vic3RpdHV0ZWRDb25maWcsICdsYXVuY2gnLCB0aGlzLnZhcmlhYmxlcywgc3Vic3RpdHV0ZWRDb25maWcuX19jb25maWd1cmF0aW9uVGFyZ2V0KTtcblx0fVxuXG5cdHJ1bkluVGVybWluYWwoYXJnczogRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVxdWVzdEFyZ3VtZW50cywgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmFkYXB0ZXJNYW5hZ2VyLnJ1bkluVGVybWluYWwodGhpcy50eXBlLCBhcmdzLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZGVidWdnZXJDb250cmlidXRpb24ubGFiZWwgfHwgdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi50eXBlO1xuXHR9XG5cblx0Z2V0IHR5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi50eXBlO1xuXHR9XG5cblx0Z2V0IHZhcmlhYmxlcygpOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi52YXJpYWJsZXM7XG5cdH1cblxuXHRnZXQgY29uZmlndXJhdGlvblNuaXBwZXRzKCk6IElKU09OU2NoZW1hU25pcHBldFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi5jb25maWd1cmF0aW9uU25pcHBldHM7XG5cdH1cblxuXHRnZXQgbGFuZ3VhZ2VzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi5sYW5ndWFnZXM7XG5cdH1cblxuXHRnZXQgd2hlbigpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGVidWdnZXJXaGVuO1xuXHR9XG5cblx0Z2V0IGhpZGRlbldoZW4oKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRlYnVnZ2VySGlkZGVuV2hlbjtcblx0fVxuXG5cdGdldCBlbmFibGVkKCkge1xuXHRcdHJldHVybiAhdGhpcy5kZWJ1Z2dlcldoZW4gfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRoaXMuZGVidWdnZXJXaGVuKTtcblx0fVxuXG5cdGdldCBpc0hpZGRlbkZyb21Ecm9wZG93bigpIHtcblx0XHRpZiAoIXRoaXMuZGVidWdnZXJIaWRkZW5XaGVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXModGhpcy5kZWJ1Z2dlckhpZGRlbldoZW4pO1xuXHR9XG5cblx0Z2V0IHN0cmluZ3MoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVidWdnZXJDb250cmlidXRpb24uc3RyaW5ncyA/PyB0aGlzLmRlYnVnZ2VyQ29udHJpYnV0aW9uLnVpTWVzc2FnZXM7XG5cdH1cblxuXHRpbnRlcmVzdGVkSW5MYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodGhpcy5sYW5ndWFnZXMgJiYgdGhpcy5sYW5ndWFnZXMuaW5kZXhPZihsYW5ndWFnZUlkKSA+PSAwKTtcblx0fVxuXG5cdGhhc0luaXRpYWxDb25maWd1cmF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZGVidWdnZXJDb250cmlidXRpb24uaW5pdGlhbENvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0aGFzRHluYW1pY0NvbmZpZ3VyYXRpb25Qcm92aWRlcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuaGFzRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIodGhpcy50eXBlLCBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkR5bmFtaWMpO1xuXHR9XG5cblx0aGFzQ29uZmlndXJhdGlvblByb3ZpZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLmhhc0RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKHRoaXMudHlwZSk7XG5cdH1cblxuXHRnZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQoaW5pdGlhbENvbmZpZ3M/OiBJQ29uZmlnW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIGF0IHRoaXMgcG9pbnQgd2UgZ290IHNvbWUgY29uZmlncyBmcm9tIHRoZSBwYWNrYWdlLmpzb24gYW5kL29yIGZyb20gcmVnaXN0ZXJlZCBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcnNcblx0XHRsZXQgaW5pdGlhbENvbmZpZ3VyYXRpb25zID0gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi5pbml0aWFsQ29uZmlndXJhdGlvbnMgfHwgW107XG5cdFx0aWYgKGluaXRpYWxDb25maWdzKSB7XG5cdFx0XHRpbml0aWFsQ29uZmlndXJhdGlvbnMgPSBpbml0aWFsQ29uZmlndXJhdGlvbnMuY29uY2F0KGluaXRpYWxDb25maWdzKTtcblx0XHR9XG5cblx0XHRjb25zdCBlb2wgPSB0aGlzLnJlc291cmNlUHJvcGVydGllc1NlcnZpY2UuZ2V0RU9MKFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnMScgfSkpID09PSAnXFxyXFxuJyA/ICdcXHJcXG4nIDogJ1xcbic7XG5cdFx0Y29uc3QgY29uZmlncyA9IEpTT04uc3RyaW5naWZ5KGluaXRpYWxDb25maWd1cmF0aW9ucywgbnVsbCwgJ1xcdCcpLnNwbGl0KCdcXG4nKS5tYXAobGluZSA9PiAnXFx0JyArIGxpbmUpLmpvaW4oZW9sKS50cmltKCk7XG5cdFx0Y29uc3QgY29tbWVudDEgPSBubHMubG9jYWxpemUoJ2xhdW5jaC5jb25maWcuY29tbWVudDEnLCBcIlVzZSBJbnRlbGxpU2Vuc2UgdG8gbGVhcm4gYWJvdXQgcG9zc2libGUgYXR0cmlidXRlcy5cIik7XG5cdFx0Y29uc3QgY29tbWVudDIgPSBubHMubG9jYWxpemUoJ2xhdW5jaC5jb25maWcuY29tbWVudDInLCBcIkhvdmVyIHRvIHZpZXcgZGVzY3JpcHRpb25zIG9mIGV4aXN0aW5nIGF0dHJpYnV0ZXMuXCIpO1xuXHRcdGNvbnN0IGNvbW1lbnQzID0gbmxzLmxvY2FsaXplKCdsYXVuY2guY29uZmlnLmNvbW1lbnQzJywgXCJGb3IgbW9yZSBpbmZvcm1hdGlvbiwgdmlzaXQ6IHswfVwiLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTgzMDM4NycpO1xuXG5cdFx0bGV0IGNvbnRlbnQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHRgXFx0Ly8gJHtjb21tZW50MX1gLFxuXHRcdFx0YFxcdC8vICR7Y29tbWVudDJ9YCxcblx0XHRcdGBcXHQvLyAke2NvbW1lbnQzfWAsXG5cdFx0XHRgXFx0XCJ2ZXJzaW9uXCI6IFwiMC4yLjBcIixgLFxuXHRcdFx0YFxcdFwiY29uZmlndXJhdGlvbnNcIjogJHtjb25maWdzfWAsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oZW9sKTtcblxuXHRcdC8vIGZpeCBmb3JtYXR0aW5nXG5cdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxhbnk+KCk7XG5cdFx0aWYgKGVkaXRvckNvbmZpZy5lZGl0b3IgJiYgZWRpdG9yQ29uZmlnLmVkaXRvci5pbnNlcnRTcGFjZXMpIHtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UobmV3IFJlZ0V4cCgnXFx0JywgJ2cnKSwgJyAnLnJlcGVhdChlZGl0b3JDb25maWcuZWRpdG9yLnRhYlNpemUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbnRlbnQpO1xuXHR9XG5cblx0Z2V0TWFpbkV4dGVuc2lvbkRlc2NyaXB0b3IoKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5tYWluRXh0ZW5zaW9uRGVzY3JpcHRpb24gfHwgdGhpcy5tZXJnZWRFeHRlbnNpb25EZXNjcmlwdGlvbnNbMF07XG5cdH1cblxuXHRnZXRDdXN0b21UZWxlbWV0cnlFbmRwb2ludCgpOiBJVGVsZW1ldHJ5RW5kcG9pbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFpS2V5ID0gdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi5haUtleTtcblx0XHRpZiAoIWFpS2V5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbmRFcnJvclRlbGVtdHJ5ID0gY2xlYW5SZW1vdGVBdXRob3JpdHkodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LCB0aGlzLnByb2R1Y3RTZXJ2aWNlKSAhPT0gJ290aGVyJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGAke3RoaXMuZ2V0TWFpbkV4dGVuc2lvbkRlc2NyaXB0b3IoKS5wdWJsaXNoZXJ9LiR7dGhpcy50eXBlfWAsXG5cdFx0XHRhaUtleSxcblx0XHRcdHNlbmRFcnJvclRlbGVtZXRyeTogc2VuZEVycm9yVGVsZW10cnlcblx0XHR9O1xuXHR9XG5cblx0Z2V0U2NoZW1hQXR0cmlidXRlcyhkZWZpbml0aW9uczogSUpTT05TY2hlbWFNYXApOiBJSlNPTlNjaGVtYVtdIHwgbnVsbCB7XG5cblx0XHRpZiAoIXRoaXMuZGVidWdnZXJDb250cmlidXRpb24uY29uZmlndXJhdGlvbkF0dHJpYnV0ZXMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIGZpbGwgaW4gdGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBhdHRyaWJ1dGVzIHNoYXJlZCBieSBhbGwgYWRhcHRlcnMuXG5cdFx0cmV0dXJuIE9iamVjdC5lbnRyaWVzKHRoaXMuZGVidWdnZXJDb250cmlidXRpb24uY29uZmlndXJhdGlvbkF0dHJpYnV0ZXMpLm1hcCgoW3JlcXVlc3QsIGF0dHJpYnV0ZXNdKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uSWQgPSBgJHt0aGlzLnR5cGV9OiR7cmVxdWVzdH1gO1xuXHRcdFx0Y29uc3QgcGxhdGZvcm1TcGVjaWZpY0RlZmluaXRpb25JZCA9IGAke3RoaXMudHlwZX06JHtyZXF1ZXN0fTpwbGF0Zm9ybWA7XG5cdFx0XHRjb25zdCBkZWZhdWx0UmVxdWlyZWQgPSBbJ25hbWUnLCAndHlwZScsICdyZXF1ZXN0J107XG5cdFx0XHRhdHRyaWJ1dGVzLnJlcXVpcmVkID0gYXR0cmlidXRlcy5yZXF1aXJlZCAmJiBhdHRyaWJ1dGVzLnJlcXVpcmVkLmxlbmd0aCA/IGRlZmF1bHRSZXF1aXJlZC5jb25jYXQoYXR0cmlidXRlcy5yZXF1aXJlZCkgOiBkZWZhdWx0UmVxdWlyZWQ7XG5cdFx0XHRhdHRyaWJ1dGVzLmFkZGl0aW9uYWxQcm9wZXJ0aWVzID0gZmFsc2U7XG5cdFx0XHRhdHRyaWJ1dGVzLnR5cGUgPSAnb2JqZWN0Jztcblx0XHRcdGlmICghYXR0cmlidXRlcy5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGF0dHJpYnV0ZXMucHJvcGVydGllcyA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IGF0dHJpYnV0ZXMucHJvcGVydGllcztcblx0XHRcdHByb3BlcnRpZXNbJ3R5cGUnXSA9IHtcblx0XHRcdFx0ZW51bTogW3RoaXMudHlwZV0sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFt0aGlzLmxhYmVsXSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVidWdUeXBlJywgXCJUeXBlIG9mIGNvbmZpZ3VyYXRpb24uXCIpLFxuXHRcdFx0XHRwYXR0ZXJuOiAnXig/IW5vZGUyKScsXG5cdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogdGhpcy5kZWJ1Z2dlckNvbnRyaWJ1dGlvbi5kZXByZWNhdGVkIHx8ICh0aGlzLmVuYWJsZWQgPyB1bmRlZmluZWQgOiBkZWJ1Z2dlckRpc2FibGVkTWVzc2FnZSh0aGlzLnR5cGUpKSxcblx0XHRcdFx0ZG9Ob3RTdWdnZXN0OiAhIXRoaXMuZGVidWdnZXJDb250cmlidXRpb24uZGVwcmVjYXRlZCxcblx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2RlYnVnVHlwZU5vdFJlY29nbmlzZWQnLCBcIlRoZSBkZWJ1ZyB0eXBlIGlzIG5vdCByZWNvZ25pemVkLiBNYWtlIHN1cmUgdGhhdCB5b3UgaGF2ZSBhIGNvcnJlc3BvbmRpbmcgZGVidWcgZXh0ZW5zaW9uIGluc3RhbGxlZCBhbmQgdGhhdCBpdCBpcyBlbmFibGVkLlwiKSxcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdub2RlMk5vdFN1cHBvcnRlZCcsIFwiXFxcIm5vZGUyXFxcIiBpcyBubyBsb25nZXIgc3VwcG9ydGVkLCB1c2UgXFxcIm5vZGVcXFwiIGluc3RlYWQgYW5kIHNldCB0aGUgXFxcInByb3RvY29sXFxcIiBhdHRyaWJ1dGUgdG8gXFxcImluc3BlY3RvclxcXCIuXCIpXG5cdFx0XHR9O1xuXHRcdFx0cHJvcGVydGllc1sncmVxdWVzdCddID0ge1xuXHRcdFx0XHRlbnVtOiBbcmVxdWVzdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlYnVnUmVxdWVzdCcsIFwiUmVxdWVzdCB0eXBlIG9mIGNvbmZpZ3VyYXRpb24uIENhbiBiZSBcXFwibGF1bmNoXFxcIiBvciBcXFwiYXR0YWNoXFxcIi5cIiksXG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wIGluIGRlZmluaXRpb25zWydjb21tb24nXS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdHByb3BlcnRpZXNbcHJvcF0gPSB7XG5cdFx0XHRcdFx0JHJlZjogYCMvZGVmaW5pdGlvbnMvY29tbW9uL3Byb3BlcnRpZXMvJHtwcm9wfWBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1hbGZvcm1lZFByb3BlcnR5TmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm9wZXJ0eSA9IHByb3BlcnRpZXNbbmFtZV07XG5cdFx0XHRcdC8vIEEgZGVidWdnZXIgZXh0ZW5zaW9uIG1heSBjb250cmlidXRlIGEgbWFsZm9ybWVkIHByb3BlcnR5IHdob3NlIHZhbHVlIGlzIG5vdCBhIHNjaGVtYVxuXHRcdFx0XHQvLyBvYmplY3QgKGUuZy4gdGhlIGJhcmUgc3RyaW5nICdpbnRlZ2VyJyBpbnN0ZWFkIG9mIGB7IFwidHlwZVwiOiBcImludGVnZXJcIiB9YCkuIFNraXAgdGhvc2Ugc29cblx0XHRcdFx0Ly8gb25lIGJhZCBjb250cmlidXRpb24gZG9lcyBub3QgdGhyb3cgYW5kIGFib3J0IHNjaGVtYSBnZW5lcmF0aW9uIGZvciBldmVyeSBkZWJ1Z2dlci5cblx0XHRcdFx0aWYgKGlzT2JqZWN0KHByb3BlcnR5KSkge1xuXHRcdFx0XHRcdC8vIFVzZSBzY2hlbWEgYWxsT2YgcHJvcGVydHkgdG8gZ2V0IGluZGVwZW5kZW50IGVycm9yIHJlcG9ydGluZyAjMjExMTNcblx0XHRcdFx0XHRDb25maWd1cmF0aW9uUmVzb2x2ZXJVdGlscy5hcHBseURlcHJlY2F0ZWRWYXJpYWJsZU1lc3NhZ2UocHJvcGVydHkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1hbGZvcm1lZFByb3BlcnR5TmFtZXMucHVzaChuYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAobWFsZm9ybWVkUHJvcGVydHlOYW1lcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYElnbm9yaW5nIG1hbGZvcm1lZCBkZWJ1ZyBjb25maWd1cmF0aW9uIHNjaGVtYSBwcm9wZXJ0aWVzIGZvciB0eXBlICcke3RoaXMudHlwZX0nOiAke21hbGZvcm1lZFByb3BlcnR5TmFtZXMuam9pbignLCAnKX1gKTtcblx0XHRcdH1cblxuXHRcdFx0ZGVmaW5pdGlvbnNbZGVmaW5pdGlvbklkXSA9IHsgLi4uYXR0cmlidXRlcyB9O1xuXHRcdFx0ZGVmaW5pdGlvbnNbcGxhdGZvcm1TcGVjaWZpY0RlZmluaXRpb25JZF0gPSB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IGZpbHRlcihwcm9wZXJ0aWVzLCBrZXkgPT4ga2V5ICE9PSAndHlwZScgJiYga2V5ICE9PSAncmVxdWVzdCcgJiYga2V5ICE9PSAnbmFtZScpXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBEb24ndCBhZGQgdGhlIE9TIHByb3BzIHRvIHRoZSByZWFsIGF0dHJpYnV0ZXMgb2JqZWN0IHNvIHRoZXkgZG9uJ3Qgc2hvdyB1cCBpbiAnZGVmaW5pdGlvbnMnXG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzQ29weSA9IHsgLi4uYXR0cmlidXRlcyB9O1xuXHRcdFx0YXR0cmlidXRlc0NvcHkucHJvcGVydGllcyA9IHtcblx0XHRcdFx0Li4ucHJvcGVydGllcyxcblx0XHRcdFx0Li4ue1xuXHRcdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRcdCRyZWY6IGAjL2RlZmluaXRpb25zLyR7cGxhdGZvcm1TcGVjaWZpY0RlZmluaXRpb25JZH1gLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVidWdXaW5kb3dzQ29uZmlndXJhdGlvbicsIFwiV2luZG93cyBzcGVjaWZpYyBsYXVuY2ggY29uZmlndXJhdGlvbiBhdHRyaWJ1dGVzLlwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9zeDoge1xuXHRcdFx0XHRcdFx0JHJlZjogYCMvZGVmaW5pdGlvbnMvJHtwbGF0Zm9ybVNwZWNpZmljRGVmaW5pdGlvbklkfWAsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z09TWENvbmZpZ3VyYXRpb24nLCBcIk9TIFggc3BlY2lmaWMgbGF1bmNoIGNvbmZpZ3VyYXRpb24gYXR0cmlidXRlcy5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0JHJlZjogYCMvZGVmaW5pdGlvbnMvJHtwbGF0Zm9ybVNwZWNpZmljRGVmaW5pdGlvbklkfWAsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z0xpbnV4Q29uZmlndXJhdGlvbicsIFwiTGludXggc3BlY2lmaWMgbGF1bmNoIGNvbmZpZ3VyYXRpb24gYXR0cmlidXRlcy5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gYXR0cmlidXRlc0NvcHk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQW1HLGVBQWUseUJBQTRDLDZDQUE2QztBQUMzTSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFDQUFxQztBQUM5QyxZQUFZLGdDQUFnQztBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0NBQWtDO0FBRzNDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQXNDLDBCQUEwQjtBQUN6RSxTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFFckIsSUFBTSxXQUFOLE1BQXVEO0FBQUEsRUFTN0QsWUFDUyxnQkFDUixpQkFDQSxzQkFDd0Msc0JBQ1MsMkJBQ0QsOEJBQ0Qsb0JBQ2YsY0FDSyxtQkFDSCxnQkFDSixZQUM3QjtBQVhPO0FBR2dDO0FBQ1M7QUFDRDtBQUNEO0FBQ2Y7QUFDSztBQUNIO0FBQ0o7QUFqQi9CLFNBQVEsOEJBQXVELENBQUM7QUFtQi9ELFNBQUssdUJBQXVCLEVBQUUsTUFBTSxnQkFB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
