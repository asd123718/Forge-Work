import * as nls from "../../../nls.js";
import * as objects from "../../../base/common/objects.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
import { Extensions, validateProperty, ConfigurationScope, OVERRIDE_PROPERTY_REGEX, configurationDefaultsSchemaId, getDefaultValue, getAllConfigurationProperties, parseScope, EXTENSION_UNIFICATION_EXTENSION_IDS, overrideIdentifiersFromKey } from "../../../platform/configuration/common/configurationRegistry.js";
import { Extensions as JSONExtensions } from "../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { workspaceSettingsSchemaId, launchSchemaId, tasksSchemaId, mcpSchemaId } from "../../services/configuration/common/configuration.js";
import { hasKey, isObject, isUndefined } from "../../../base/common/types.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import product from "../../../platform/product/common/product.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
const configurationRegistry = Registry.as(Extensions.Configuration);
const configurationEntrySchema = {
  type: "object",
  defaultSnippets: [{ body: { title: "", properties: {} } }],
  properties: {
    title: {
      description: nls.localize("vscode.extension.contributes.configuration.title", "A title for the current category of settings. This label will be rendered in the Settings editor as a subheading. If the title is the same as the extension display name, then the category will be grouped under the main extension heading."),
      type: "string"
    },
    order: {
      description: nls.localize("vscode.extension.contributes.configuration.order", "When specified, gives the order of this category of settings relative to other categories."),
      type: "integer"
    },
    properties: {
      description: nls.localize("vscode.extension.contributes.configuration.properties", "Description of the configuration properties."),
      type: "object",
      propertyNames: {
        pattern: "\\S+",
        patternErrorMessage: nls.localize("vscode.extension.contributes.configuration.property.empty", "Property should not be empty.")
      },
      additionalProperties: {
        anyOf: [
          {
            title: nls.localize("vscode.extension.contributes.configuration.properties.schema", "Schema of the configuration property."),
            $ref: "http://json-schema.org/draft-07/schema#"
          },
          {
            type: "object",
            properties: {
              scope: {
                type: "string",
                enum: ["application", "machine", "window", "resource", "language-overridable", "machine-overridable"],
                default: "window",
                enumDescriptions: [
                  nls.localize("scope.application.description", "Configuration that can be configured only in the user settings."),
                  nls.localize("scope.machine.description", "Configuration that can be configured only in the user settings or only in the remote settings."),
                  nls.localize("scope.window.description", "Configuration that can be configured in the user, remote or workspace settings."),
                  nls.localize("scope.resource.description", "Configuration that can be configured in the user, remote, workspace or folder settings."),
                  nls.localize("scope.language-overridable.description", "Resource configuration that can be configured in language specific settings."),
                  nls.localize("scope.machine-overridable.description", "Machine configuration that can be configured also in workspace or folder settings.")
                ],
                markdownDescription: nls.localize("scope.description", "Scope in which the configuration is applicable. Available scopes are `application`, `machine`, `window`, `resource`, and `machine-overridable`.")
              },
              enumDescriptions: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.enumDescriptions", "Descriptions for enum values")
              },
              markdownEnumDescriptions: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.markdownEnumDescriptions", "Descriptions for enum values in the markdown format.")
              },
              enumItemLabels: {
                type: "array",
                items: {
                  type: "string"
                },
                markdownDescription: nls.localize("scope.enumItemLabels", "Labels for enum values to be displayed in the Settings editor. When specified, the {0} values still show after the labels, but less prominently.", "`enum`")
              },
              markdownDescription: {
                type: "string",
                description: nls.localize("scope.markdownDescription", "The description in the markdown format.")
              },
              deprecationMessage: {
                type: "string",
                description: nls.localize("scope.deprecationMessage", "If set, the property is marked as deprecated and the given message is shown as an explanation.")
              },
              markdownDeprecationMessage: {
                type: "string",
                description: nls.localize("scope.markdownDeprecationMessage", "If set, the property is marked as deprecated and the given message is shown as an explanation in the markdown format.")
              },
              editPresentation: {
                type: "string",
                enum: ["singlelineText", "multilineText"],
                enumDescriptions: [
                  nls.localize("scope.singlelineText.description", "The value will be shown in an inputbox."),
                  nls.localize("scope.multilineText.description", "The value will be shown in a textarea.")
                ],
                default: "singlelineText",
                description: nls.localize("scope.editPresentation", "When specified, controls the presentation format of the string setting.")
              },
              order: {
                type: "integer",
                description: nls.localize("scope.order", "When specified, gives the order of this setting relative to other settings within the same category. Settings with an order property will be placed before settings without this property set.")
              },
              ignoreSync: {
                type: "boolean",
                description: nls.localize("scope.ignoreSync", "When enabled, Settings Sync will not sync the user value of this configuration by default.")
              },
              keywords: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.keywords", "A list of keywords that help users find this setting in the Settings editor. These are not shown to the user.")
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "accessibility",
                    "advanced",
                    "experimental",
                    "telemetry",
                    "usesOnlineServices"
                  ],
                  enumDescriptions: [
                    nls.localize("accessibility", "Accessibility settings"),
                    nls.localize("advanced", "Advanced settings are hidden by default in the Settings editor unless the user chooses to show advanced settings."),
                    nls.localize("experimental", "Experimental settings are subject to change and may be removed in future releases."),
                    nls.localize("preview", "Preview settings can be used to try out new features before they are finalized."),
                    nls.localize("telemetry", "Telemetry settings"),
                    nls.localize("usesOnlineServices", "Settings that use online services")
                  ]
                },
                additionalItems: true,
                markdownDescription: nls.localize("scope.tags", "A list of tags under which to place the setting. The tag can then be searched up in the Settings editor. For example, specifying the `experimental` tag allows one to find the setting by searching `@tag:experimental`.")
              },
              agentsWindow: {
                type: "object",
                markdownDescription: nls.localize("scope.agentsWindow", "Configuration overrides for the Agents window. Allows specifying a different default value and read-only behavior for this setting when running in the Agents window.\n\n**Note**: This is a proposed API. To use it, extensions must include `agentsWindowConfiguration` in their `enabledApiProposals`."),
                properties: {
                  "default": {
                    description: nls.localize("scope.agentsWindow.default", "The default value for this setting in the Agents window.")
                  },
                  readOnly: {
                    type: "boolean",
                    description: nls.localize("scope.agentsWindow.readOnly", "When true, this setting cannot be changed by the user in the Agents window."),
                    default: false
                  }
                },
                additionalProperties: false
              }
            }
          }
        ]
      }
    }
  }
};
let _configDelta;
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "configurationDefaults",
  jsonSchema: {
    $ref: configurationDefaultsSchemaId
  },
  canHandleResolver: true
});
defaultConfigurationExtPoint.setHandler((extensions, { added, removed }) => {
  if (_configDelta) {
    configurationRegistry.deltaConfiguration(_configDelta);
  }
  const configNow = _configDelta = {};
  queueMicrotask(() => {
    if (_configDelta === configNow) {
      configurationRegistry.deltaConfiguration(_configDelta);
      _configDelta = void 0;
    }
  });
  if (removed.length) {
    const removedDefaultConfigurations = removed.map((extension) => ({ overrides: objects.deepClone(extension.value), source: { id: extension.description.identifier.value, displayName: extension.description.displayName } }));
    _configDelta.removedDefaults = removedDefaultConfigurations;
  }
  if (added.length) {
    const registeredProperties = configurationRegistry.getConfigurationProperties();
    const allowedScopes = [ConfigurationScope.MACHINE_OVERRIDABLE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE];
    const addedDefaultConfigurations = added.map((extension) => {
      const overrides = objects.deepClone(extension.value);
      for (const key of Object.keys(overrides)) {
        const registeredPropertyScheme = registeredProperties[key];
        if (registeredPropertyScheme?.disallowConfigurationDefault) {
          extension.collector.warn(nls.localize("config.property.preventDefaultConfiguration.warning", "Cannot register configuration defaults for '{0}'. This setting does not allow contributing configuration defaults.", key));
          delete overrides[key];
          continue;
        }
        if (!OVERRIDE_PROPERTY_REGEX.test(key)) {
          if (registeredPropertyScheme?.scope && !allowedScopes.includes(registeredPropertyScheme.scope)) {
            extension.collector.warn(nls.localize("config.property.defaultConfiguration.warning", "Cannot register configuration defaults for '{0}'. Only defaults for machine-overridable, window, resource and language overridable scoped settings are supported.", key));
            delete overrides[key];
            continue;
          }
        }
      }
      return { overrides, source: { id: extension.description.identifier.value, displayName: extension.description.displayName } };
    });
    _configDelta.addedDefaults = addedDefaultConfigurations;
  }
});
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "configuration",
  deps: [defaultConfigurationExtPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.configuration", "Contributes configuration settings."),
    oneOf: [
      configurationEntrySchema,
      {
        type: "array",
        items: configurationEntrySchema
      }
    ]
  },
  canHandleResolver: true
});
const extensionConfigurations = new ExtensionIdentifierMap();
configurationExtPoint.setHandler((extensions, { added, removed }) => {
  _configDelta ??= {};
  if (removed.length) {
    const removedConfigurations = [];
    for (const extension of removed) {
      removedConfigurations.push(...extensionConfigurations.get(extension.description.identifier) || []);
      extensionConfigurations.delete(extension.description.identifier);
    }
    _configDelta.removedConfigurations = removedConfigurations;
  }
  const seenProperties = /* @__PURE__ */ new Set();
  function handleConfiguration(node, extension) {
    const configuration = objects.deepClone(node);
    if (configuration.title && typeof configuration.title !== "string") {
      extension.collector.error(nls.localize("invalid.title", "'configuration.title' must be a string"));
    }
    validateProperties(configuration, extension);
    configuration.id = node.id || extension.description.identifier.value;
    configuration.extensionInfo = { id: extension.description.identifier.value, displayName: extension.description.displayName };
    configuration.restrictedProperties = extension.description.capabilities?.untrustedWorkspaces?.supported === "limited" ? extension.description.capabilities?.untrustedWorkspaces.restrictedConfigurations : void 0;
    configuration.title = configuration.title || extension.description.displayName || extension.description.identifier.value;
    return configuration;
  }
  function validateProperties(configuration, extension) {
    const properties = configuration.properties;
    const extensionConfigurationPolicy = product.extensionConfigurationPolicy;
    if (properties) {
      if (typeof properties !== "object") {
        extension.collector.error(nls.localize("invalid.properties", "'configuration.properties' must be an object"));
        configuration.properties = {};
      }
      for (const key in properties) {
        const propertyConfiguration = properties[key];
        const message = validateProperty(key, propertyConfiguration, extension.description.identifier.value);
        if (message) {
          delete properties[key];
          extension.collector.warn(message);
          continue;
        }
        if (seenProperties.has(key) && !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extension.description.identifier.value.toLowerCase())) {
          delete properties[key];
          extension.collector.warn(nls.localize("config.property.duplicate", "Cannot register '{0}'. This property is already registered.", key));
          continue;
        }
        if (!isObject(propertyConfiguration)) {
          delete properties[key];
          extension.collector.error(nls.localize("invalid.property", "configuration.properties property '{0}' must be an object", key));
          continue;
        }
        const policyEntry = extensionConfigurationPolicy?.[key];
        if (policyEntry) {
          if (hasKey(policyEntry, { policyReference: true })) {
            propertyConfiguration.policyReference = policyEntry.policyReference;
          } else {
            propertyConfiguration.policy = policyEntry;
          }
        }
        if (propertyConfiguration.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
          propertyConfiguration.experiment = {
            mode: "startup"
          };
        }
        if (propertyConfiguration.agentsWindow && !isProposedApiEnabled(extension.description, "agentsWindowConfiguration")) {
          extension.collector.error(nls.localize("config.property.agentsWindow.proposed", "Extension '{0}' CANNOT use 'agentsWindow' property on configuration '{1}' without enabling the 'agentsWindowConfiguration' API proposal.", extension.description.identifier.value, key));
          delete propertyConfiguration.agentsWindow;
        }
        if (propertyConfiguration.agentHost) {
          extension.collector.error(nls.localize("config.property.agentHost.unsupported", "Extension '{0}' CANNOT use the 'agentHost' property on configuration '{1}'.", extension.description.identifier.value, key));
          delete propertyConfiguration.agentHost;
        }
        seenProperties.add(key);
        propertyConfiguration.scope = propertyConfiguration.scope ? parseScope(propertyConfiguration.scope.toString()) : ConfigurationScope.WINDOW;
      }
    }
    const subNodes = configuration.allOf;
    if (subNodes) {
      extension.collector.error(nls.localize("invalid.allOf", "'configuration.allOf' is deprecated and should no longer be used. Instead, pass multiple configuration sections as an array to the 'configuration' contribution point."));
      for (const node of subNodes) {
        validateProperties(node, extension);
      }
    }
  }
  if (added.length) {
    const addedConfigurations = [];
    for (const extension of added) {
      const configurations = [];
      const value = extension.value;
      if (Array.isArray(value)) {
        value.forEach((v) => configurations.push(handleConfiguration(v, extension)));
      } else {
        configurations.push(handleConfiguration(value, extension));
      }
      extensionConfigurations.set(extension.description.identifier, configurations);
      addedConfigurations.push(...configurations);
    }
    _configDelta.addedConfigurations = addedConfigurations;
  }
  configurationRegistry.deltaConfiguration(_configDelta);
  _configDelta = void 0;
});
jsonRegistry.registerSchema("vscode://schemas/workspaceConfig", {
  allowComments: true,
  allowTrailingCommas: true,
  default: {
    folders: [
      {
        path: ""
      }
    ],
    settings: {}
  },
  required: ["folders"],
  properties: {
    "folders": {
      minItems: 0,
      uniqueItems: true,
      description: nls.localize("workspaceConfig.folders.description", "List of folders to be loaded in the workspace."),
      items: {
        type: "object",
        defaultSnippets: [{ body: { path: "$1" } }],
        oneOf: [{
          properties: {
            path: {
              type: "string",
              description: nls.localize("workspaceConfig.path.description", "A file path. e.g. `/root/folderA` or `./folderA` for a relative path that will be resolved against the location of the workspace file.")
            },
            name: {
              type: "string",
              description: nls.localize("workspaceConfig.name.description", "An optional name for the folder. ")
            }
          },
          required: ["path"]
        }, {
          properties: {
            uri: {
              type: "string",
              description: nls.localize("workspaceConfig.uri.description", "URI of the folder")
            },
            name: {
              type: "string",
              description: nls.localize("workspaceConfig.name.description", "An optional name for the folder. ")
            }
          },
          required: ["uri"]
        }]
      }
    },
    "settings": {
      type: "object",
      default: {},
      description: nls.localize("workspaceConfig.settings.description", "Workspace settings"),
      $ref: workspaceSettingsSchemaId
    },
    "launch": {
      type: "object",
      default: { configurations: [], compounds: [] },
      description: nls.localize("workspaceConfig.launch.description", "Workspace launch configurations"),
      $ref: launchSchemaId
    },
    "tasks": {
      type: "object",
      default: { version: "2.0.0", tasks: [] },
      description: nls.localize("workspaceConfig.tasks.description", "Workspace task configurations"),
      $ref: tasksSchemaId
    },
    "mcp": {
      type: "object",
      default: {
        inputs: [],
        servers: {
          "mcp-server-time": {
            command: "uvx",
            args: ["mcp_server_time", "--local-timezone=America/Los_Angeles"]
          }
        }
      },
      description: nls.localize("workspaceConfig.mcp.description", "Model Context Protocol server configurations"),
      $ref: mcpSchemaId
    },
    "extensions": {
      type: "object",
      default: {},
      description: nls.localize("workspaceConfig.extensions.description", "Workspace extensions"),
      $ref: "vscode://schemas/extensions"
    },
    "remoteAuthority": {
      type: "string",
      doNotSuggest: true,
      description: nls.localize("workspaceConfig.remoteAuthority", "The remote server where the workspace is located.")
    },
    "transient": {
      type: "boolean",
      doNotSuggest: true,
      description: nls.localize("workspaceConfig.transient", "A transient workspace will disappear when restarting or reloading.")
    }
  },
  errorMessage: nls.localize("unknownWorkspaceProperty", "Unknown workspace configuration property")
});
class SettingsTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.configuration;
  }
  render(manifest) {
    const configuration = manifest.contributes?.configuration ? Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration] : [];
    const properties = getAllConfigurationProperties(configuration);
    const contrib = properties ? Object.keys(properties) : [];
    const headers = [nls.localize("setting name", "ID"), nls.localize("description", "Description"), nls.localize("default", "Default")];
    const rows = contrib.sort((a, b) => a.localeCompare(b)).map((key) => {
      return [
        new MarkdownString().appendMarkdown(`\`${key}\``),
        properties[key].markdownDescription ? new MarkdownString(properties[key].markdownDescription, false) : properties[key].description ?? "",
        new MarkdownString().appendCodeblock("json", JSON.stringify(isUndefined(properties[key].default) ? getDefaultValue(properties[key].type) : properties[key].default, null, 2))
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "configuration",
  label: nls.localize("settings", "Settings"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(SettingsTableRenderer)
});
class ConfigurationDefaultsTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.configurationDefaults;
  }
  render(manifest) {
    const configurationDefaults = manifest.contributes?.configurationDefaults ?? {};
    const headers = [nls.localize("language", "Languages"), nls.localize("setting", "Setting"), nls.localize("default override value", "Override Value")];
    const rows = [];
    for (const key of Object.keys(configurationDefaults).sort((a, b) => a.localeCompare(b))) {
      const value = configurationDefaults[key];
      if (OVERRIDE_PROPERTY_REGEX.test(key)) {
        const languages = overrideIdentifiersFromKey(key);
        const languageMarkdown = new MarkdownString().appendMarkdown(`${languages.join(", ")}`);
        for (const key2 of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
          const row = [];
          row.push(languageMarkdown);
          row.push(new MarkdownString().appendMarkdown(`\`${key2}\``));
          row.push(new MarkdownString().appendCodeblock("json", JSON.stringify(value[key2], null, 2)));
          rows.push(row);
        }
      } else {
        const row = [];
        row.push("");
        row.push(new MarkdownString().appendMarkdown(`\`${key}\``));
        row.push(new MarkdownString().appendCodeblock("json", JSON.stringify(value, null, 2)));
        rows.push(row);
      }
    }
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "configurationDefaults",
  label: nls.localize("settings default overrides", "Settings Default Overrides"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ConfigurationDefaultsTableRenderer)
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxjb25maWd1cmF0aW9uRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uUG9pbnRVc2VyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucywgdmFsaWRhdGVQcm9wZXJ0eSwgQ29uZmlndXJhdGlvblNjb3BlLCBPVkVSUklERV9QUk9QRVJUWV9SRUdFWCwgSUNvbmZpZ3VyYXRpb25EZWZhdWx0cywgY29uZmlndXJhdGlvbkRlZmF1bHRzU2NoZW1hSWQsIElDb25maWd1cmF0aW9uRGVsdGEsIGdldERlZmF1bHRWYWx1ZSwgZ2V0QWxsQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIHBhcnNlU2NvcGUsIEVYVEVOU0lPTl9VTklGSUNBVElPTl9FWFRFTlNJT05fSURTLCBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYUlkLCBsYXVuY2hTY2hlbWFJZCwgdGFza3NTY2hlbWFJZCwgbWNwU2NoZW1hSWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNPYmplY3QsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllck1hcCwgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuY29uc3QganNvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5jb25zdCBjb25maWd1cmF0aW9uRW50cnlTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IHRpdGxlOiAnJywgcHJvcGVydGllczoge30gfSB9XSxcblx0cHJvcGVydGllczoge1xuXHRcdHRpdGxlOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb24udGl0bGUnLCAnQSB0aXRsZSBmb3IgdGhlIGN1cnJlbnQgY2F0ZWdvcnkgb2Ygc2V0dGluZ3MuIFRoaXMgbGFiZWwgd2lsbCBiZSByZW5kZXJlZCBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yIGFzIGEgc3ViaGVhZGluZy4gSWYgdGhlIHRpdGxlIGlzIHRoZSBzYW1lIGFzIHRoZSBleHRlbnNpb24gZGlzcGxheSBuYW1lLCB0aGVuIHRoZSBjYXRlZ29yeSB3aWxsIGJlIGdyb3VwZWQgdW5kZXIgdGhlIG1haW4gZXh0ZW5zaW9uIGhlYWRpbmcuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0b3JkZXI6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbi5vcmRlcicsICdXaGVuIHNwZWNpZmllZCwgZ2l2ZXMgdGhlIG9yZGVyIG9mIHRoaXMgY2F0ZWdvcnkgb2Ygc2V0dGluZ3MgcmVsYXRpdmUgdG8gb3RoZXIgY2F0ZWdvcmllcy4nKSxcblx0XHRcdHR5cGU6ICdpbnRlZ2VyJ1xuXHRcdH0sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb25maWd1cmF0aW9uLnByb3BlcnRpZXMnLCAnRGVzY3JpcHRpb24gb2YgdGhlIGNvbmZpZ3VyYXRpb24gcHJvcGVydGllcy4nKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydHlOYW1lczoge1xuXHRcdFx0XHRwYXR0ZXJuOiAnXFxcXFMrJyxcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb24ucHJvcGVydHkuZW1wdHknLCAnUHJvcGVydHkgc2hvdWxkIG5vdCBiZSBlbXB0eS4nKSxcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzLnNjaGVtYScsICdTY2hlbWEgb2YgdGhlIGNvbmZpZ3VyYXRpb24gcHJvcGVydHkuJyksXG5cdFx0XHRcdFx0XHQkcmVmOiAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEjJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHNjb3BlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydhcHBsaWNhdGlvbicsICdtYWNoaW5lJywgJ3dpbmRvdycsICdyZXNvdXJjZScsICdsYW5ndWFnZS1vdmVycmlkYWJsZScsICdtYWNoaW5lLW92ZXJyaWRhYmxlJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ3dpbmRvdycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY29wZS5hcHBsaWNhdGlvbi5kZXNjcmlwdGlvbicsIFwiQ29uZmlndXJhdGlvbiB0aGF0IGNhbiBiZSBjb25maWd1cmVkIG9ubHkgaW4gdGhlIHVzZXIgc2V0dGluZ3MuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY29wZS5tYWNoaW5lLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmF0aW9uIHRoYXQgY2FuIGJlIGNvbmZpZ3VyZWQgb25seSBpbiB0aGUgdXNlciBzZXR0aW5ncyBvciBvbmx5IGluIHRoZSByZW1vdGUgc2V0dGluZ3MuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY29wZS53aW5kb3cuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgdXNlciwgcmVtb3RlIG9yIHdvcmtzcGFjZSBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLnJlc291cmNlLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmF0aW9uIHRoYXQgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIHVzZXIsIHJlbW90ZSwgd29ya3NwYWNlIG9yIGZvbGRlciBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLmxhbmd1YWdlLW92ZXJyaWRhYmxlLmRlc2NyaXB0aW9uJywgXCJSZXNvdXJjZSBjb25maWd1cmF0aW9uIHRoYXQgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gbGFuZ3VhZ2Ugc3BlY2lmaWMgc2V0dGluZ3MuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY29wZS5tYWNoaW5lLW92ZXJyaWRhYmxlLmRlc2NyaXB0aW9uJywgXCJNYWNoaW5lIGNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBhbHNvIGluIHdvcmtzcGFjZSBvciBmb2xkZXIgc2V0dGluZ3MuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLmRlc2NyaXB0aW9uJywgXCJTY29wZSBpbiB3aGljaCB0aGUgY29uZmlndXJhdGlvbiBpcyBhcHBsaWNhYmxlLiBBdmFpbGFibGUgc2NvcGVzIGFyZSBgYXBwbGljYXRpb25gLCBgbWFjaGluZWAsIGB3aW5kb3dgLCBgcmVzb3VyY2VgLCBhbmQgYG1hY2hpbmUtb3ZlcnJpZGFibGVgLlwiKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5lbnVtRGVzY3JpcHRpb25zJywgJ0Rlc2NyaXB0aW9ucyBmb3IgZW51bSB2YWx1ZXMnKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLm1hcmtkb3duRW51bURlc2NyaXB0aW9ucycsICdEZXNjcmlwdGlvbnMgZm9yIGVudW0gdmFsdWVzIGluIHRoZSBtYXJrZG93biBmb3JtYXQuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZW51bUl0ZW1MYWJlbHM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5lbnVtSXRlbUxhYmVscycsICdMYWJlbHMgZm9yIGVudW0gdmFsdWVzIHRvIGJlIGRpc3BsYXllZCBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yLiBXaGVuIHNwZWNpZmllZCwgdGhlIHswfSB2YWx1ZXMgc3RpbGwgc2hvdyBhZnRlciB0aGUgbGFiZWxzLCBidXQgbGVzcyBwcm9taW5lbnRseS4nLCAnYGVudW1gJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLm1hcmtkb3duRGVzY3JpcHRpb24nLCAnVGhlIGRlc2NyaXB0aW9uIGluIHRoZSBtYXJrZG93biBmb3JtYXQuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuZGVwcmVjYXRpb25NZXNzYWdlJywgJ0lmIHNldCwgdGhlIHByb3BlcnR5IGlzIG1hcmtlZCBhcyBkZXByZWNhdGVkIGFuZCB0aGUgZ2l2ZW4gbWVzc2FnZSBpcyBzaG93biBhcyBhbiBleHBsYW5hdGlvbi4nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlJywgJ0lmIHNldCwgdGhlIHByb3BlcnR5IGlzIG1hcmtlZCBhcyBkZXByZWNhdGVkIGFuZCB0aGUgZ2l2ZW4gbWVzc2FnZSBpcyBzaG93biBhcyBhbiBleHBsYW5hdGlvbiBpbiB0aGUgbWFya2Rvd24gZm9ybWF0LicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGVkaXRQcmVzZW50YXRpb246IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ3NpbmdsZWxpbmVUZXh0JywgJ211bHRpbGluZVRleHQnXSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLnNpbmdsZWxpbmVUZXh0LmRlc2NyaXB0aW9uJywgJ1RoZSB2YWx1ZSB3aWxsIGJlIHNob3duIGluIGFuIGlucHV0Ym94LicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY29wZS5tdWx0aWxpbmVUZXh0LmRlc2NyaXB0aW9uJywgJ1RoZSB2YWx1ZSB3aWxsIGJlIHNob3duIGluIGEgdGV4dGFyZWEuJylcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdzaW5nbGVsaW5lVGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuZWRpdFByZXNlbnRhdGlvbicsICdXaGVuIHNwZWNpZmllZCwgY29udHJvbHMgdGhlIHByZXNlbnRhdGlvbiBmb3JtYXQgb2YgdGhlIHN0cmluZyBzZXR0aW5nLicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLm9yZGVyJywgJ1doZW4gc3BlY2lmaWVkLCBnaXZlcyB0aGUgb3JkZXIgb2YgdGhpcyBzZXR0aW5nIHJlbGF0aXZlIHRvIG90aGVyIHNldHRpbmdzIHdpdGhpbiB0aGUgc2FtZSBjYXRlZ29yeS4gU2V0dGluZ3Mgd2l0aCBhbiBvcmRlciBwcm9wZXJ0eSB3aWxsIGJlIHBsYWNlZCBiZWZvcmUgc2V0dGluZ3Mgd2l0aG91dCB0aGlzIHByb3BlcnR5IHNldC4nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRpZ25vcmVTeW5jOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLmlnbm9yZVN5bmMnLCAnV2hlbiBlbmFibGVkLCBTZXR0aW5ncyBTeW5jIHdpbGwgbm90IHN5bmMgdGhlIHVzZXIgdmFsdWUgb2YgdGhpcyBjb25maWd1cmF0aW9uIGJ5IGRlZmF1bHQuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0a2V5d29yZHM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUua2V5d29yZHMnLCAnQSBsaXN0IG9mIGtleXdvcmRzIHRoYXQgaGVscCB1c2VycyBmaW5kIHRoaXMgc2V0dGluZyBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yLiBUaGVzZSBhcmUgbm90IHNob3duIHRvIHRoZSB1c2VyLicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHRhZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW06IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0J2FjY2Vzc2liaWxpdHknLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnYWR2YW5jZWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnZXhwZXJpbWVudGFsJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3RlbGVtZXRyeScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd1c2VzT25saW5lU2VydmljZXMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5JywgJ0FjY2Vzc2liaWxpdHkgc2V0dGluZ3MnKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZHZhbmNlZCcsICdBZHZhbmNlZCBzZXR0aW5ncyBhcmUgaGlkZGVuIGJ5IGRlZmF1bHQgaW4gdGhlIFNldHRpbmdzIGVkaXRvciB1bmxlc3MgdGhlIHVzZXIgY2hvb3NlcyB0byBzaG93IGFkdmFuY2VkIHNldHRpbmdzLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbCcsICdFeHBlcmltZW50YWwgc2V0dGluZ3MgYXJlIHN1YmplY3QgdG8gY2hhbmdlIGFuZCBtYXkgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgcmVsZWFzZXMuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncHJldmlldycsICdQcmV2aWV3IHNldHRpbmdzIGNhbiBiZSB1c2VkIHRvIHRyeSBvdXQgbmV3IGZlYXR1cmVzIGJlZm9yZSB0aGV5IGFyZSBmaW5hbGl6ZWQuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgndGVsZW1ldHJ5JywgJ1RlbGVtZXRyeSBzZXR0aW5ncycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3VzZXNPbmxpbmVTZXJ2aWNlcycsICdTZXR0aW5ncyB0aGF0IHVzZSBvbmxpbmUgc2VydmljZXMnKVxuXHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLnRhZ3MnLCAnQSBsaXN0IG9mIHRhZ3MgdW5kZXIgd2hpY2ggdG8gcGxhY2UgdGhlIHNldHRpbmcuIFRoZSB0YWcgY2FuIHRoZW4gYmUgc2VhcmNoZWQgdXAgaW4gdGhlIFNldHRpbmdzIGVkaXRvci4gRm9yIGV4YW1wbGUsIHNwZWNpZnlpbmcgdGhlIGBleHBlcmltZW50YWxgIHRhZyBhbGxvd3Mgb25lIHRvIGZpbmQgdGhlIHNldHRpbmcgYnkgc2VhcmNoaW5nIGBAdGFnOmV4cGVyaW1lbnRhbGAuJyksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFnZW50c1dpbmRvdzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuYWdlbnRzV2luZG93JywgXCJDb25maWd1cmF0aW9uIG92ZXJyaWRlcyBmb3IgdGhlIEFnZW50cyB3aW5kb3cuIEFsbG93cyBzcGVjaWZ5aW5nIGEgZGlmZmVyZW50IGRlZmF1bHQgdmFsdWUgYW5kIHJlYWQtb25seSBiZWhhdmlvciBmb3IgdGhpcyBzZXR0aW5nIHdoZW4gcnVubmluZyBpbiB0aGUgQWdlbnRzIHdpbmRvdy5cXG5cXG4qKk5vdGUqKjogVGhpcyBpcyBhIHByb3Bvc2VkIEFQSS4gVG8gdXNlIGl0LCBleHRlbnNpb25zIG11c3QgaW5jbHVkZSBgYWdlbnRzV2luZG93Q29uZmlndXJhdGlvbmAgaW4gdGhlaXIgYGVuYWJsZWRBcGlQcm9wb3NhbHNgLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuYWdlbnRzV2luZG93LmRlZmF1bHQnLCAnVGhlIGRlZmF1bHQgdmFsdWUgZm9yIHRoaXMgc2V0dGluZyBpbiB0aGUgQWdlbnRzIHdpbmRvdy4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRyZWFkT25seToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLmFnZW50c1dpbmRvdy5yZWFkT25seScsICdXaGVuIHRydWUsIHRoaXMgc2V0dGluZyBjYW5ub3QgYmUgY2hhbmdlZCBieSB0aGUgdXNlciBpbiB0aGUgQWdlbnRzIHdpbmRvdy4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuLy8gYnVpbGQgdXAgYSBkZWx0YSBhY3Jvc3MgdHdvIGV4dCBwb2ludHMgYW5kIG9ubHkgYXBwbHkgaXQgb25jZVxubGV0IF9jb25maWdEZWx0YTogSUNvbmZpZ3VyYXRpb25EZWx0YSB8IHVuZGVmaW5lZDtcblxuXG4vLyBCRUdJTiBWU0NvZGUgZXh0ZW5zaW9uIHBvaW50IGBjb25maWd1cmF0aW9uRGVmYXVsdHNgXG5jb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVN0cmluZ0RpY3Rpb25hcnk8SVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4+Pih7XG5cdGV4dGVuc2lvblBvaW50OiAnY29uZmlndXJhdGlvbkRlZmF1bHRzJyxcblx0anNvblNjaGVtYToge1xuXHRcdCRyZWY6IGNvbmZpZ3VyYXRpb25EZWZhdWx0c1NjaGVtYUlkLFxuXHR9LFxuXHRjYW5IYW5kbGVSZXNvbHZlcjogdHJ1ZVxufSk7XG5kZWZhdWx0Q29uZmlndXJhdGlvbkV4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXG5cdGlmIChfY29uZmlnRGVsdGEpIHtcblx0XHQvLyBISUdITFkgdW5saWtlbHksIGJ1dCBqdXN0IGluIGNhc2Vcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVsdGFDb25maWd1cmF0aW9uKF9jb25maWdEZWx0YSk7XG5cdH1cblxuXHRjb25zdCBjb25maWdOb3cgPSBfY29uZmlnRGVsdGEgPSB7fTtcblx0Ly8gc2NoZWR1bGUgYSBISUdITFkgdW5saWtlbHkgdGFzayBpbiBjYXNlIG9ubHkgdGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbnMgRVhUIHBvaW50IGNoYW5nZXNcblx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdGlmIChfY29uZmlnRGVsdGEgPT09IGNvbmZpZ05vdykge1xuXHRcdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlbHRhQ29uZmlndXJhdGlvbihfY29uZmlnRGVsdGEpO1xuXHRcdFx0X2NvbmZpZ0RlbHRhID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSk7XG5cblx0aWYgKHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgcmVtb3ZlZERlZmF1bHRDb25maWd1cmF0aW9ucyA9IHJlbW92ZWQubWFwPElDb25maWd1cmF0aW9uRGVmYXVsdHM+KGV4dGVuc2lvbiA9PiAoeyBvdmVycmlkZXM6IG9iamVjdHMuZGVlcENsb25lKGV4dGVuc2lvbi52YWx1ZSksIHNvdXJjZTogeyBpZDogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGVzY3JpcHRpb24uZGlzcGxheU5hbWUgfSB9KSk7XG5cdFx0X2NvbmZpZ0RlbHRhLnJlbW92ZWREZWZhdWx0cyA9IHJlbW92ZWREZWZhdWx0Q29uZmlndXJhdGlvbnM7XG5cdH1cblx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRQcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgYWxsb3dlZFNjb3BlcyA9IFtDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRSwgQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVywgQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFLCBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVdO1xuXHRcdGNvbnN0IGFkZGVkRGVmYXVsdENvbmZpZ3VyYXRpb25zID0gYWRkZWQubWFwPElDb25maWd1cmF0aW9uRGVmYXVsdHM+KGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBvYmplY3RzLmRlZXBDbG9uZShleHRlbnNpb24udmFsdWUpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMob3ZlcnJpZGVzKSkge1xuXHRcdFx0XHRjb25zdCByZWdpc3RlcmVkUHJvcGVydHlTY2hlbWUgPSByZWdpc3RlcmVkUHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRpZiAocmVnaXN0ZXJlZFByb3BlcnR5U2NoZW1lPy5kaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0KSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnY29uZmlnLnByb3BlcnR5LnByZXZlbnREZWZhdWx0Q29uZmlndXJhdGlvbi53YXJuaW5nJywgXCJDYW5ub3QgcmVnaXN0ZXIgY29uZmlndXJhdGlvbiBkZWZhdWx0cyBmb3IgJ3swfScuIFRoaXMgc2V0dGluZyBkb2VzIG5vdCBhbGxvdyBjb250cmlidXRpbmcgY29uZmlndXJhdGlvbiBkZWZhdWx0cy5cIiwga2V5KSk7XG5cdFx0XHRcdFx0ZGVsZXRlIG92ZXJyaWRlc1trZXldO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdFx0aWYgKHJlZ2lzdGVyZWRQcm9wZXJ0eVNjaGVtZT8uc2NvcGUgJiYgIWFsbG93ZWRTY29wZXMuaW5jbHVkZXMocmVnaXN0ZXJlZFByb3BlcnR5U2NoZW1lLnNjb3BlKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnY29uZmlnLnByb3BlcnR5LmRlZmF1bHRDb25maWd1cmF0aW9uLndhcm5pbmcnLCBcIkNhbm5vdCByZWdpc3RlciBjb25maWd1cmF0aW9uIGRlZmF1bHRzIGZvciAnezB9Jy4gT25seSBkZWZhdWx0cyBmb3IgbWFjaGluZS1vdmVycmlkYWJsZSwgd2luZG93LCByZXNvdXJjZSBhbmQgbGFuZ3VhZ2Ugb3ZlcnJpZGFibGUgc2NvcGVkIHNldHRpbmdzIGFyZSBzdXBwb3J0ZWQuXCIsIGtleSkpO1xuXHRcdFx0XHRcdFx0ZGVsZXRlIG92ZXJyaWRlc1trZXldO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvdmVycmlkZXMsIHNvdXJjZTogeyBpZDogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGVzY3JpcHRpb24uZGlzcGxheU5hbWUgfSB9O1xuXHRcdH0pO1xuXHRcdF9jb25maWdEZWx0YS5hZGRlZERlZmF1bHRzID0gYWRkZWREZWZhdWx0Q29uZmlndXJhdGlvbnM7XG5cdH1cbn0pO1xuLy8gRU5EIFZTQ29kZSBleHRlbnNpb24gcG9pbnQgYGNvbmZpZ3VyYXRpb25EZWZhdWx0c2BcblxuXG4vLyBCRUdJTiBWU0NvZGUgZXh0ZW5zaW9uIHBvaW50IGBjb25maWd1cmF0aW9uYFxuY29uc3QgY29uZmlndXJhdGlvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUNvbmZpZ3VyYXRpb25Ob2RlPih7XG5cdGV4dGVuc2lvblBvaW50OiAnY29uZmlndXJhdGlvbicsXG5cdGRlcHM6IFtkZWZhdWx0Q29uZmlndXJhdGlvbkV4dFBvaW50XSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbicsICdDb250cmlidXRlcyBjb25maWd1cmF0aW9uIHNldHRpbmdzLicpLFxuXHRcdG9uZU9mOiBbXG5cdFx0XHRjb25maWd1cmF0aW9uRW50cnlTY2hlbWEsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiBjb25maWd1cmF0aW9uRW50cnlTY2hlbWFcblx0XHRcdH1cblx0XHRdXG5cdH0sXG5cdGNhbkhhbmRsZVJlc29sdmVyOiB0cnVlXG59KTtcblxuY29uc3QgZXh0ZW5zaW9uQ29uZmlndXJhdGlvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8SUNvbmZpZ3VyYXRpb25Ob2RlW10+ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8SUNvbmZpZ3VyYXRpb25Ob2RlW10+KCk7XG5cbmNvbmZpZ3VyYXRpb25FeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblxuXHQvLyBISUdITFkgdW5saWtlbHkgKG9ubHkgY29uZmlndXJhdGlvbiBidXQgbm90IGRlZmF1bHRDb25maWd1cmF0aW9uIEVYVCBwb2ludCBjaGFuZ2VzKVxuXHRfY29uZmlnRGVsdGEgPz89IHt9O1xuXG5cdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdGNvbnN0IHJlbW92ZWRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiByZW1vdmVkKSB7XG5cdFx0XHRyZW1vdmVkQ29uZmlndXJhdGlvbnMucHVzaCguLi4oZXh0ZW5zaW9uQ29uZmlndXJhdGlvbnMuZ2V0KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKSB8fCBbXSkpO1xuXHRcdFx0ZXh0ZW5zaW9uQ29uZmlndXJhdGlvbnMuZGVsZXRlKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0X2NvbmZpZ0RlbHRhLnJlbW92ZWRDb25maWd1cmF0aW9ucyA9IHJlbW92ZWRDb25maWd1cmF0aW9ucztcblx0fVxuXG5cdGNvbnN0IHNlZW5Qcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0ZnVuY3Rpb24gaGFuZGxlQ29uZmlndXJhdGlvbihub2RlOiBJQ29uZmlndXJhdGlvbk5vZGUsIGV4dGVuc2lvbjogSUV4dGVuc2lvblBvaW50VXNlcjx1bmtub3duPik6IElDb25maWd1cmF0aW9uTm9kZSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IG9iamVjdHMuZGVlcENsb25lKG5vZGUpO1xuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24udGl0bGUgJiYgKHR5cGVvZiBjb25maWd1cmF0aW9uLnRpdGxlICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnRpdGxlJywgXCInY29uZmlndXJhdGlvbi50aXRsZScgbXVzdCBiZSBhIHN0cmluZ1wiKSk7XG5cdFx0fVxuXG5cdFx0dmFsaWRhdGVQcm9wZXJ0aWVzKGNvbmZpZ3VyYXRpb24sIGV4dGVuc2lvbik7XG5cblx0XHRjb25maWd1cmF0aW9uLmlkID0gbm9kZS5pZCB8fCBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRjb25maWd1cmF0aW9uLmV4dGVuc2lvbkluZm8gPSB7IGlkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgZGlzcGxheU5hbWU6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSB9O1xuXHRcdGNvbmZpZ3VyYXRpb24ucmVzdHJpY3RlZFByb3BlcnRpZXMgPSBleHRlbnNpb24uZGVzY3JpcHRpb24uY2FwYWJpbGl0aWVzPy51bnRydXN0ZWRXb3Jrc3BhY2VzPy5zdXBwb3J0ZWQgPT09ICdsaW1pdGVkJyA/IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5jYXBhYmlsaXRpZXM/LnVudHJ1c3RlZFdvcmtzcGFjZXMucmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zIDogdW5kZWZpbmVkO1xuXHRcdGNvbmZpZ3VyYXRpb24udGl0bGUgPSBjb25maWd1cmF0aW9uLnRpdGxlIHx8IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIHZhbGlkYXRlUHJvcGVydGllcyhjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUsIGV4dGVuc2lvbjogSUV4dGVuc2lvblBvaW50VXNlcjx1bmtub3duPik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBjb25maWd1cmF0aW9uLnByb3BlcnRpZXM7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeSA9IHByb2R1Y3QuZXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeTtcblx0XHRpZiAocHJvcGVydGllcykge1xuXHRcdFx0aWYgKHR5cGVvZiBwcm9wZXJ0aWVzICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wcm9wZXJ0aWVzJywgXCInY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzJyBtdXN0IGJlIGFuIG9iamVjdFwiKSk7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcyA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcHJvcGVydGllcykge1xuXHRcdFx0XHRjb25zdCBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24gPSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB2YWxpZGF0ZVByb3BlcnR5KGtleSwgcHJvcGVydHlDb25maWd1cmF0aW9uLCBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLndhcm4obWVzc2FnZSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlZW5Qcm9wZXJ0aWVzLmhhcyhrZXkpICYmICFFWFRFTlNJT05fVU5JRklDQVRJT05fRVhURU5TSU9OX0lEUy5oYXMoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3Iud2FybihubHMubG9jYWxpemUoJ2NvbmZpZy5wcm9wZXJ0eS5kdXBsaWNhdGUnLCBcIkNhbm5vdCByZWdpc3RlciAnezB9Jy4gVGhpcyBwcm9wZXJ0eSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuXCIsIGtleSkpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghaXNPYmplY3QocHJvcGVydHlDb25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQucHJvcGVydHknLCBcImNvbmZpZ3VyYXRpb24ucHJvcGVydGllcyBwcm9wZXJ0eSAnezB9JyBtdXN0IGJlIGFuIG9iamVjdFwiLCBrZXkpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwb2xpY3lFbnRyeSA9IGV4dGVuc2lvbkNvbmZpZ3VyYXRpb25Qb2xpY3k/LltrZXldO1xuXHRcdFx0XHRpZiAocG9saWN5RW50cnkpIHtcblx0XHRcdFx0XHQvLyBBIHJlZmVyZW5jZSBlbnRyeSBjYXJyaWVzIGEgYHBvbGljeVJlZmVyZW5jZWAgcG9pbnRlcjsgYSBmdWxsIChvd25lci9cInBhcmVudFwiKVxuXHRcdFx0XHRcdC8vIGVudHJ5IGRlY2xhcmVzIHRoZSBwb2xpY3kgaW5saW5lLiBSZWZlcmVuY2VzIGF0dGFjaCB0aGlzIHNldHRpbmcgdG8gYSBwb2xpY3lcblx0XHRcdFx0XHQvLyAqb3duZWQqIGJ5IGFuIGluLWNvZGUgc2V0dGluZyAod2hvc2UgYHZhbHVlYCBjYWxsYmFjayBKU09OIGNhbm5vdCBjYXJyeSkuXG5cdFx0XHRcdFx0aWYgKGhhc0tleShwb2xpY3lFbnRyeSwgeyBwb2xpY3lSZWZlcmVuY2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRcdHByb3BlcnR5Q29uZmlndXJhdGlvbi5wb2xpY3lSZWZlcmVuY2UgPSBwb2xpY3lFbnRyeS5wb2xpY3lSZWZlcmVuY2U7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHByb3BlcnR5Q29uZmlndXJhdGlvbi5wb2xpY3kgPSBwb2xpY3lFbnRyeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3BlcnR5Q29uZmlndXJhdGlvbi50YWdzPy5zb21lKHRhZyA9PiB0YWcudG9Mb3dlckNhc2UoKSA9PT0gJ29uZXhwJykpIHtcblx0XHRcdFx0XHRwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uZXhwZXJpbWVudCA9IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdzdGFydHVwJ1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3BlcnR5Q29uZmlndXJhdGlvbi5hZ2VudHNXaW5kb3cgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2FnZW50c1dpbmRvd0NvbmZpZ3VyYXRpb24nKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkuYWdlbnRzV2luZG93LnByb3Bvc2VkJywgXCJFeHRlbnNpb24gJ3swfScgQ0FOTk9UIHVzZSAnYWdlbnRzV2luZG93JyBwcm9wZXJ0eSBvbiBjb25maWd1cmF0aW9uICd7MX0nIHdpdGhvdXQgZW5hYmxpbmcgdGhlICdhZ2VudHNXaW5kb3dDb25maWd1cmF0aW9uJyBBUEkgcHJvcG9zYWwuXCIsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLCBrZXkpKTtcblx0XHRcdFx0XHRkZWxldGUgcHJvcGVydHlDb25maWd1cmF0aW9uLmFnZW50c1dpbmRvdztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvcGVydHlDb25maWd1cmF0aW9uLmFnZW50SG9zdCkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkuYWdlbnRIb3N0LnVuc3VwcG9ydGVkJywgXCJFeHRlbnNpb24gJ3swfScgQ0FOTk9UIHVzZSB0aGUgJ2FnZW50SG9zdCcgcHJvcGVydHkgb24gY29uZmlndXJhdGlvbiAnezF9Jy5cIiwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGtleSkpO1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uYWdlbnRIb3N0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5Qcm9wZXJ0aWVzLmFkZChrZXkpO1xuXHRcdFx0XHRwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uc2NvcGUgPSBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uc2NvcGUgPyBwYXJzZVNjb3BlKHByb3BlcnR5Q29uZmlndXJhdGlvbi5zY29wZS50b1N0cmluZygpKSA6IENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1c7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN1Yk5vZGVzID0gY29uZmlndXJhdGlvbi5hbGxPZjtcblx0XHRpZiAoc3ViTm9kZXMpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmFsbE9mJywgXCInY29uZmlndXJhdGlvbi5hbGxPZicgaXMgZGVwcmVjYXRlZCBhbmQgc2hvdWxkIG5vIGxvbmdlciBiZSB1c2VkLiBJbnN0ZWFkLCBwYXNzIG11bHRpcGxlIGNvbmZpZ3VyYXRpb24gc2VjdGlvbnMgYXMgYW4gYXJyYXkgdG8gdGhlICdjb25maWd1cmF0aW9uJyBjb250cmlidXRpb24gcG9pbnQuXCIpKTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzdWJOb2Rlcykge1xuXHRcdFx0XHR2YWxpZGF0ZVByb3BlcnRpZXMobm9kZSwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgYWRkZWRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBhZGRlZCkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdID0gW107XG5cdFx0XHRjb25zdCB2YWx1ZSA9IDxJQ29uZmlndXJhdGlvbk5vZGUgfCBJQ29uZmlndXJhdGlvbk5vZGVbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0dmFsdWUuZm9yRWFjaCh2ID0+IGNvbmZpZ3VyYXRpb25zLnB1c2goaGFuZGxlQ29uZmlndXJhdGlvbih2LCBleHRlbnNpb24pKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25maWd1cmF0aW9ucy5wdXNoKGhhbmRsZUNvbmZpZ3VyYXRpb24odmFsdWUsIGV4dGVuc2lvbikpO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9uQ29uZmlndXJhdGlvbnMuc2V0KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBjb25maWd1cmF0aW9ucyk7XG5cdFx0XHRhZGRlZENvbmZpZ3VyYXRpb25zLnB1c2goLi4uY29uZmlndXJhdGlvbnMpO1xuXHRcdH1cblxuXHRcdF9jb25maWdEZWx0YS5hZGRlZENvbmZpZ3VyYXRpb25zID0gYWRkZWRDb25maWd1cmF0aW9ucztcblx0fVxuXG5cdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZWx0YUNvbmZpZ3VyYXRpb24oX2NvbmZpZ0RlbHRhKTtcblx0X2NvbmZpZ0RlbHRhID0gdW5kZWZpbmVkO1xufSk7XG4vLyBFTkQgVlNDb2RlIGV4dGVuc2lvbiBwb2ludCBgY29uZmlndXJhdGlvbmBcblxuanNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKCd2c2NvZGU6Ly9zY2hlbWFzL3dvcmtzcGFjZUNvbmZpZycsIHtcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0ZGVmYXVsdDoge1xuXHRcdGZvbGRlcnM6IFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJydcblx0XHRcdH1cblx0XHRdLFxuXHRcdHNldHRpbmdzOiB7XG5cdFx0fVxuXHR9LFxuXHRyZXF1aXJlZDogWydmb2xkZXJzJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnZm9sZGVycyc6IHtcblx0XHRcdG1pbkl0ZW1zOiAwLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcuZm9sZGVycy5kZXNjcmlwdGlvbicsIFwiTGlzdCBvZiBmb2xkZXJzIHRvIGJlIGxvYWRlZCBpbiB0aGUgd29ya3NwYWNlLlwiKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgcGF0aDogJyQxJyB9IH1dLFxuXHRcdFx0XHRvbmVPZjogW3tcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcucGF0aC5kZXNjcmlwdGlvbicsIFwiQSBmaWxlIHBhdGguIGUuZy4gYC9yb290L2ZvbGRlckFgIG9yIGAuL2ZvbGRlckFgIGZvciBhIHJlbGF0aXZlIHBhdGggdGhhdCB3aWxsIGJlIHJlc29sdmVkIGFnYWluc3QgdGhlIGxvY2F0aW9uIG9mIHRoZSB3b3Jrc3BhY2UgZmlsZS5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcubmFtZS5kZXNjcmlwdGlvbicsIFwiQW4gb3B0aW9uYWwgbmFtZSBmb3IgdGhlIGZvbGRlci4gXCIpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydwYXRoJ11cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHVyaToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnVyaS5kZXNjcmlwdGlvbicsIFwiVVJJIG9mIHRoZSBmb2xkZXJcIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcubmFtZS5kZXNjcmlwdGlvbicsIFwiQW4gb3B0aW9uYWwgbmFtZSBmb3IgdGhlIGZvbGRlci4gXCIpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWyd1cmknXVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3NldHRpbmdzJzoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5zZXR0aW5ncy5kZXNjcmlwdGlvbicsIFwiV29ya3NwYWNlIHNldHRpbmdzXCIpLFxuXHRcdFx0JHJlZjogd29ya3NwYWNlU2V0dGluZ3NTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J2xhdW5jaCc6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdDogeyBjb25maWd1cmF0aW9uczogW10sIGNvbXBvdW5kczogW10gfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5sYXVuY2guZGVzY3JpcHRpb24nLCBcIldvcmtzcGFjZSBsYXVuY2ggY29uZmlndXJhdGlvbnNcIiksXG5cdFx0XHQkcmVmOiBsYXVuY2hTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J3Rhc2tzJzoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7IHZlcnNpb246ICcyLjAuMCcsIHRhc2tzOiBbXSB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnRhc2tzLmRlc2NyaXB0aW9uJywgXCJXb3Jrc3BhY2UgdGFzayBjb25maWd1cmF0aW9uc1wiKSxcblx0XHRcdCRyZWY6IHRhc2tzU2NoZW1hSWRcblx0XHR9LFxuXHRcdCdtY3AnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0aW5wdXRzOiBbXSxcblx0XHRcdFx0c2VydmVyczoge1xuXHRcdFx0XHRcdCdtY3Atc2VydmVyLXRpbWUnOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAndXZ4Jyxcblx0XHRcdFx0XHRcdGFyZ3M6IFsnbWNwX3NlcnZlcl90aW1lJywgJy0tbG9jYWwtdGltZXpvbmU9QW1lcmljYS9Mb3NfQW5nZWxlcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLm1jcC5kZXNjcmlwdGlvbicsIFwiTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXIgY29uZmlndXJhdGlvbnNcIiksXG5cdFx0XHQkcmVmOiBtY3BTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J2V4dGVuc2lvbnMnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLmV4dGVuc2lvbnMuZGVzY3JpcHRpb24nLCBcIldvcmtzcGFjZSBleHRlbnNpb25zXCIpLFxuXHRcdFx0JHJlZjogJ3ZzY29kZTovL3NjaGVtYXMvZXh0ZW5zaW9ucydcblx0XHR9LFxuXHRcdCdyZW1vdGVBdXRob3JpdHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRvTm90U3VnZ2VzdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5yZW1vdGVBdXRob3JpdHknLCBcIlRoZSByZW1vdGUgc2VydmVyIHdoZXJlIHRoZSB3b3Jrc3BhY2UgaXMgbG9jYXRlZC5cIiksXG5cdFx0fSxcblx0XHQndHJhbnNpZW50Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZG9Ob3RTdWdnZXN0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnRyYW5zaWVudCcsIFwiQSB0cmFuc2llbnQgd29ya3NwYWNlIHdpbGwgZGlzYXBwZWFyIHdoZW4gcmVzdGFydGluZyBvciByZWxvYWRpbmcuXCIpLFxuXHRcdH1cblx0fSxcblx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vua25vd25Xb3Jrc3BhY2VQcm9wZXJ0eScsIFwiVW5rbm93biB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiBwcm9wZXJ0eVwiKVxufSk7XG5cblxuY2xhc3MgU2V0dGluZ3NUYWJsZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlW10gPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvblxuXHRcdFx0PyBBcnJheS5pc0FycmF5KG1hbmlmZXN0LmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb24pID8gbWFuaWZlc3QuY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbiA6IFttYW5pZmVzdC5jb250cmlidXRlcy5jb25maWd1cmF0aW9uXVxuXHRcdFx0OiBbXTtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBnZXRBbGxDb25maWd1cmF0aW9uUHJvcGVydGllcyhjb25maWd1cmF0aW9uKTtcblxuXHRcdGNvbnN0IGNvbnRyaWIgPSBwcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMocHJvcGVydGllcykgOiBbXTtcblx0XHRjb25zdCBoZWFkZXJzID0gW25scy5sb2NhbGl6ZSgnc2V0dGluZyBuYW1lJywgXCJJRFwiKSwgbmxzLmxvY2FsaXplKCdkZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIiksIG5scy5sb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRGVmYXVsdFwiKV07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYi5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG5cdFx0XHQubWFwKGtleSA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7a2V5fVxcYGApLFxuXHRcdFx0XHRcdHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlc2NyaXB0aW9uID8gbmV3IE1hcmtkb3duU3RyaW5nKHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlc2NyaXB0aW9uLCBmYWxzZSkgOiBwcm9wZXJ0aWVzW2tleV0uZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCdqc29uJywgSlNPTi5zdHJpbmdpZnkoaXNVbmRlZmluZWQocHJvcGVydGllc1trZXldLmRlZmF1bHQpID8gZ2V0RGVmYXVsdFZhbHVlKHByb3BlcnRpZXNba2V5XS50eXBlKSA6IHByb3BlcnRpZXNba2V5XS5kZWZhdWx0LCBudWxsLCAyKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25GZWF0dXJlc0V4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdjb25maWd1cmF0aW9uJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoU2V0dGluZ3NUYWJsZVJlbmRlcmVyKSxcbn0pO1xuXG5jbGFzcyBDb25maWd1cmF0aW9uRGVmYXVsdHNUYWJsZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbkRlZmF1bHRzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdHMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbkRlZmF1bHRzID8/IHt9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtubHMubG9jYWxpemUoJ2xhbmd1YWdlJywgXCJMYW5ndWFnZXNcIiksIG5scy5sb2NhbGl6ZSgnc2V0dGluZycsIFwiU2V0dGluZ1wiKSwgbmxzLmxvY2FsaXplKCdkZWZhdWx0IG92ZXJyaWRlIHZhbHVlJywgXCJPdmVycmlkZSBWYWx1ZVwiKV07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uRGVmYXVsdHMpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gY29uZmlndXJhdGlvbkRlZmF1bHRzW2tleV07XG5cdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlcyA9IG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSk7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlTWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgJHtsYW5ndWFnZXMuam9pbignLCAnKX1gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkpIHtcblx0XHRcdFx0XHRjb25zdCByb3c6IElSb3dEYXRhW10gPSBbXTtcblx0XHRcdFx0XHRyb3cucHVzaChsYW5ndWFnZU1hcmtkb3duKTtcblx0XHRcdFx0XHRyb3cucHVzaChuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtrZXl9XFxgYCkpO1xuXHRcdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIEpTT04uc3RyaW5naWZ5KHZhbHVlW2tleV0sIG51bGwsIDIpKSk7XG5cdFx0XHRcdFx0cm93cy5wdXNoKHJvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJvdzogSVJvd0RhdGFbXSA9IFtdO1xuXHRcdFx0XHRyb3cucHVzaCgnJyk7XG5cdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2tleX1cXGBgKSk7XG5cdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCAyKSkpO1xuXHRcdFx0XHRyb3dzLnB1c2gocm93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY29uZmlndXJhdGlvbkRlZmF1bHRzJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MgZGVmYXVsdCBvdmVycmlkZXMnLCBcIlNldHRpbmdzIERlZmF1bHQgT3ZlcnJpZGVzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ29uZmlndXJhdGlvbkRlZmF1bHRzVGFibGVSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywwQkFBK0M7QUFDeEQsU0FBcUQsWUFBWSxrQkFBa0Isb0JBQW9CLHlCQUFpRCwrQkFBb0QsaUJBQWlCLCtCQUErQixZQUFZLHFDQUFxQyxrQ0FBa0M7QUFDL1UsU0FBb0MsY0FBYyxzQkFBc0I7QUFDeEUsU0FBUywyQkFBMkIsZ0JBQWdCLGVBQWUsbUJBQW1CO0FBQ3RGLFNBQVMsUUFBUSxVQUFVLG1CQUFtQjtBQUM5QyxTQUFTLDhCQUFrRDtBQUUzRCxTQUFTLGNBQWMsbUNBQW9JO0FBQzNKLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLE9BQU8sYUFBYTtBQUNwQixTQUFTLDRCQUE0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
