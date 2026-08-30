import * as extensionsRegistry from "../../../services/extensions/common/extensionsRegistry.js";
import * as nls from "../../../../nls.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "debuggers",
  defaultExtensionKind: ["workspace"],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.debuggers", "Contributes debug adapters."),
    type: "array",
    defaultSnippets: [{ body: [{ type: "" }] }],
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { type: "", program: "", runtime: "" } }],
      properties: {
        type: {
          description: nls.localize("vscode.extension.contributes.debuggers.type", "Unique identifier for this debug adapter."),
          type: "string"
        },
        label: {
          description: nls.localize("vscode.extension.contributes.debuggers.label", "Display name for this debug adapter."),
          type: "string"
        },
        program: {
          description: nls.localize("vscode.extension.contributes.debuggers.program", "Path to the debug adapter program. Path is either absolute or relative to the extension folder."),
          type: "string"
        },
        args: {
          description: nls.localize("vscode.extension.contributes.debuggers.args", "Optional arguments to pass to the adapter."),
          type: "array"
        },
        runtime: {
          description: nls.localize("vscode.extension.contributes.debuggers.runtime", "Optional runtime in case the program attribute is not an executable but requires a runtime."),
          type: "string"
        },
        runtimeArgs: {
          description: nls.localize("vscode.extension.contributes.debuggers.runtimeArgs", "Optional runtime arguments."),
          type: "array"
        },
        variables: {
          description: nls.localize("vscode.extension.contributes.debuggers.variables", "Mapping from interactive variables (e.g. ${action.pickProcess}) in `launch.json` to a command."),
          type: "object"
        },
        initialConfigurations: {
          description: nls.localize("vscode.extension.contributes.debuggers.initialConfigurations", "Configurations for generating the initial 'launch.json'."),
          type: ["array", "string"]
        },
        languages: {
          description: nls.localize("vscode.extension.contributes.debuggers.languages", 'List of languages for which the debug extension could be considered the "default debugger".'),
          type: "array"
        },
        configurationSnippets: {
          description: nls.localize("vscode.extension.contributes.debuggers.configurationSnippets", "Snippets for adding new configurations in 'launch.json'."),
          type: "array"
        },
        configurationAttributes: {
          description: nls.localize("vscode.extension.contributes.debuggers.configurationAttributes", "JSON schema configurations for validating 'launch.json'."),
          type: "object"
        },
        when: {
          description: nls.localize("vscode.extension.contributes.debuggers.when", "Condition which must be true to enable this type of debugger. Consider using 'shellExecutionSupported', 'virtualWorkspace', 'resourceScheme' or an extension-defined context key as appropriate for this."),
          type: "string",
          default: ""
        },
        hiddenWhen: {
          description: nls.localize("vscode.extension.contributes.debuggers.hiddenWhen", "When this condition is true, this debugger type is hidden from the debugger list, but is still enabled."),
          type: "string",
          default: ""
        },
        deprecated: {
          description: nls.localize("vscode.extension.contributes.debuggers.deprecated", "Optional message to mark this debug type as being deprecated."),
          type: "string",
          default: ""
        },
        windows: {
          description: nls.localize("vscode.extension.contributes.debuggers.windows", "Windows specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.windows.runtime", "Runtime used for Windows."),
              type: "string"
            }
          }
        },
        osx: {
          description: nls.localize("vscode.extension.contributes.debuggers.osx", "macOS specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.osx.runtime", "Runtime used for macOS."),
              type: "string"
            }
          }
        },
        linux: {
          description: nls.localize("vscode.extension.contributes.debuggers.linux", "Linux specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.linux.runtime", "Runtime used for Linux."),
              type: "string"
            }
          }
        },
        strings: {
          description: nls.localize("vscode.extension.contributes.debuggers.strings", "UI strings contributed by this debug adapter."),
          type: "object",
          properties: {
            unverifiedBreakpoints: {
              description: nls.localize("vscode.extension.contributes.debuggers.strings.unverifiedBreakpoints", "When there are unverified breakpoints in a language supported by this debug adapter, this message will appear on the breakpoint hover and in the breakpoints view. Markdown and command links are supported."),
              type: "string"
            }
          }
        }
      }
    }
  }
});
const breakpointsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "breakpoints",
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.breakpoints", "Contributes breakpoints."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "" }] }],
    items: {
      type: "object",
      additionalProperties: false,
      defaultSnippets: [{ body: { language: "" } }],
      properties: {
        language: {
          description: nls.localize("vscode.extension.contributes.breakpoints.language", "Allow breakpoints for this language."),
          type: "string"
        },
        when: {
          description: nls.localize("vscode.extension.contributes.breakpoints.when", "Condition which must be true to enable breakpoints in this language. Consider matching this to the debugger when clause as appropriate."),
          type: "string",
          default: ""
        }
      }
    }
  }
});
const presentationSchema = {
  type: "object",
  description: nls.localize("presentation", "Presentation options on how to show this configuration in the debug configuration dropdown and the command palette."),
  properties: {
    hidden: {
      type: "boolean",
      default: false,
      description: nls.localize("presentation.hidden", "Controls if this configuration should be shown in the configuration dropdown and the command palette.")
    },
    group: {
      type: "string",
      default: "",
      description: nls.localize("presentation.group", "Group that this configuration belongs to. Used for grouping and sorting in the configuration dropdown and the command palette.")
    },
    order: {
      type: "number",
      default: 1,
      description: nls.localize("presentation.order", "Order of this configuration within a group. Used for grouping and sorting in the configuration dropdown and the command palette.")
    }
  },
  default: {
    hidden: false,
    group: "",
    order: 1
  }
};
const defaultCompound = { name: "Compound", configurations: [] };
const launchSchema = {
  id: launchSchemaId,
  type: "object",
  title: nls.localize("app.launch.json.title", "Launch"),
  allowTrailingCommas: true,
  allowComments: true,
  required: [],
  default: { version: "0.2.0", configurations: [], compounds: [] },
  properties: {
    version: {
      type: "string",
      description: nls.localize("app.launch.json.version", "Version of this file format."),
      default: "0.2.0"
    },
    configurations: {
      type: "array",
      description: nls.localize("app.launch.json.configurations", "List of configurations. Add new configurations or edit existing ones by using IntelliSense."),
      items: {
        defaultSnippets: [],
        "type": "object",
        oneOf: []
      }
    },
    compounds: {
      type: "array",
      description: nls.localize("app.launch.json.compounds", "List of compounds. Each compound references multiple configurations which will get launched together."),
      items: {
        type: "object",
        required: ["name", "configurations"],
        properties: {
          name: {
            type: "string",
            description: nls.localize("app.launch.json.compound.name", "Name of compound. Appears in the launch configuration drop down menu.")
          },
          presentation: presentationSchema,
          configurations: {
            type: "array",
            default: [],
            items: {
              oneOf: [{
                enum: [],
                description: nls.localize("useUniqueNames", "Please use unique configuration names.")
              }, {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    enum: [],
                    description: nls.localize("app.launch.json.compound.name", "Name of compound. Appears in the launch configuration drop down menu.")
                  },
                  folder: {
                    enum: [],
                    description: nls.localize("app.launch.json.compound.folder", "Name of folder in which the compound is located.")
                  }
                }
              }]
            },
            description: nls.localize("app.launch.json.compounds.configurations", "Names of configurations that will be started as part of this compound.")
          },
          stopAll: {
            type: "boolean",
            default: false,
            description: nls.localize("app.launch.json.compound.stopAll", "Controls whether manually terminating one session will stop all of the compound sessions.")
          },
          preLaunchTask: {
            type: "string",
            default: "",
            description: nls.localize("compoundPrelaunchTask", "Task to run before any of the compound configurations start.")
          }
        },
        default: defaultCompound
      },
      default: [
        defaultCompound
      ]
    },
    inputs: inputsSchema.definitions.inputs
  }
};
class DebuggersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.debuggers;
  }
  render(manifest) {
    const contrib = manifest.contributes?.debuggers || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("debugger name", "Name"),
      nls.localize("debugger type", "Type")
    ];
    const rows = contrib.map((d) => {
      return [
        d.label ?? "",
        d.type
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
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "debuggers",
  label: nls.localize("debuggers", "Debuggers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(DebuggersDataRenderer)
});
export {
  breakpointsExtPoint,
  debuggersExtPoint,
  launchSchema,
  presentationSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnU2NoZW1hcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGV4dGVuc2lvbnNSZWdpc3RyeSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGVidWdnZXJDb250cmlidXRpb24sIElDb21wb3VuZCwgSUJyZWFrcG9pbnRDb250cmlidXRpb24gfSBmcm9tICcuL2RlYnVnLmpzJztcbmltcG9ydCB7IGxhdW5jaFNjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgaW5wdXRzU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJTY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbi8vIGRlYnVnZ2VycyBleHRlbnNpb24gcG9pbnRcbmV4cG9ydCBjb25zdCBkZWJ1Z2dlcnNFeHRQb2ludCA9IGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJRGVidWdnZXJDb250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2RlYnVnZ2VycycsXG5cdGRlZmF1bHRFeHRlbnNpb25LaW5kOiBbJ3dvcmtzcGFjZSddLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMnLCAnQ29udHJpYnV0ZXMgZGVidWcgYWRhcHRlcnMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IHR5cGU6ICcnIH1dIH1dLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyB0eXBlOiAnJywgcHJvZ3JhbTogJycsIHJ1bnRpbWU6ICcnIH0gfV0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy50eXBlJywgXCJVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBkZWJ1ZyBhZGFwdGVyLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmxhYmVsJywgXCJEaXNwbGF5IG5hbWUgZm9yIHRoaXMgZGVidWcgYWRhcHRlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvZ3JhbToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLnByb2dyYW0nLCBcIlBhdGggdG8gdGhlIGRlYnVnIGFkYXB0ZXIgcHJvZ3JhbS4gUGF0aCBpcyBlaXRoZXIgYWJzb2x1dGUgb3IgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5hcmdzJywgXCJPcHRpb25hbCBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgYWRhcHRlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRydW50aW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMucnVudGltZScsIFwiT3B0aW9uYWwgcnVudGltZSBpbiBjYXNlIHRoZSBwcm9ncmFtIGF0dHJpYnV0ZSBpcyBub3QgYW4gZXhlY3V0YWJsZSBidXQgcmVxdWlyZXMgYSBydW50aW1lLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRydW50aW1lQXJnczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLnJ1bnRpbWVBcmdzJywgXCJPcHRpb25hbCBydW50aW1lIGFyZ3VtZW50cy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy52YXJpYWJsZXMnLCBcIk1hcHBpbmcgZnJvbSBpbnRlcmFjdGl2ZSB2YXJpYWJsZXMgKGUuZy4gJHthY3Rpb24ucGlja1Byb2Nlc3N9KSBpbiBgbGF1bmNoLmpzb25gIHRvIGEgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCdcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5pdGlhbENvbmZpZ3VyYXRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuaW5pdGlhbENvbmZpZ3VyYXRpb25zJywgXCJDb25maWd1cmF0aW9ucyBmb3IgZ2VuZXJhdGluZyB0aGUgaW5pdGlhbCBcXCdsYXVuY2guanNvblxcJy5cIiksXG5cdFx0XHRcdFx0dHlwZTogWydhcnJheScsICdzdHJpbmcnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFuZ3VhZ2VzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMubGFuZ3VhZ2VzJywgXCJMaXN0IG9mIGxhbmd1YWdlcyBmb3Igd2hpY2ggdGhlIGRlYnVnIGV4dGVuc2lvbiBjb3VsZCBiZSBjb25zaWRlcmVkIHRoZSBcXFwiZGVmYXVsdCBkZWJ1Z2dlclxcXCIuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheSdcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNuaXBwZXRzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuY29uZmlndXJhdGlvblNuaXBwZXRzJywgXCJTbmlwcGV0cyBmb3IgYWRkaW5nIG5ldyBjb25maWd1cmF0aW9ucyBpbiBcXCdsYXVuY2guanNvblxcJy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb25maWd1cmF0aW9uQXR0cmlidXRlczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmNvbmZpZ3VyYXRpb25BdHRyaWJ1dGVzJywgXCJKU09OIHNjaGVtYSBjb25maWd1cmF0aW9ucyBmb3IgdmFsaWRhdGluZyBcXCdsYXVuY2guanNvblxcJy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCdcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLndoZW4nLCBcIkNvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoaXMgdHlwZSBvZiBkZWJ1Z2dlci4gQ29uc2lkZXIgdXNpbmcgJ3NoZWxsRXhlY3V0aW9uU3VwcG9ydGVkJywgJ3ZpcnR1YWxXb3Jrc3BhY2UnLCAncmVzb3VyY2VTY2hlbWUnIG9yIGFuIGV4dGVuc2lvbi1kZWZpbmVkIGNvbnRleHQga2V5IGFzIGFwcHJvcHJpYXRlIGZvciB0aGlzLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAnJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRoaWRkZW5XaGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuaGlkZGVuV2hlbicsIFwiV2hlbiB0aGlzIGNvbmRpdGlvbiBpcyB0cnVlLCB0aGlzIGRlYnVnZ2VyIHR5cGUgaXMgaGlkZGVuIGZyb20gdGhlIGRlYnVnZ2VyIGxpc3QsIGJ1dCBpcyBzdGlsbCBlbmFibGVkLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAnJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXByZWNhdGVkOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuZGVwcmVjYXRlZCcsIFwiT3B0aW9uYWwgbWVzc2FnZSB0byBtYXJrIHRoaXMgZGVidWcgdHlwZSBhcyBiZWluZyBkZXByZWNhdGVkLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAnJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMud2luZG93cycsIFwiV2luZG93cyBzcGVjaWZpYyBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cnVudGltZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy53aW5kb3dzLnJ1bnRpbWUnLCBcIlJ1bnRpbWUgdXNlZCBmb3IgV2luZG93cy5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvc3g6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5vc3gnLCBcIm1hY09TIHNwZWNpZmljIHNldHRpbmdzLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRydW50aW1lOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLm9zeC5ydW50aW1lJywgXCJSdW50aW1lIHVzZWQgZm9yIG1hY09TLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMubGludXgnLCBcIkxpbnV4IHNwZWNpZmljIHNldHRpbmdzLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRydW50aW1lOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmxpbnV4LnJ1bnRpbWUnLCBcIlJ1bnRpbWUgdXNlZCBmb3IgTGludXguXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0c3RyaW5nczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLnN0cmluZ3MnLCBcIlVJIHN0cmluZ3MgY29udHJpYnV0ZWQgYnkgdGhpcyBkZWJ1ZyBhZGFwdGVyLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR1bnZlcmlmaWVkQnJlYWtwb2ludHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuc3RyaW5ncy51bnZlcmlmaWVkQnJlYWtwb2ludHMnLCBcIldoZW4gdGhlcmUgYXJlIHVudmVyaWZpZWQgYnJlYWtwb2ludHMgaW4gYSBsYW5ndWFnZSBzdXBwb3J0ZWQgYnkgdGhpcyBkZWJ1ZyBhZGFwdGVyLCB0aGlzIG1lc3NhZ2Ugd2lsbCBhcHBlYXIgb24gdGhlIGJyZWFrcG9pbnQgaG92ZXIgYW5kIGluIHRoZSBicmVha3BvaW50cyB2aWV3LiBNYXJrZG93biBhbmQgY29tbWFuZCBsaW5rcyBhcmUgc3VwcG9ydGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG4vLyBicmVha3BvaW50cyBleHRlbnNpb24gcG9pbnQgIzkwMzdcbmV4cG9ydCBjb25zdCBicmVha3BvaW50c0V4dFBvaW50ID0gZXh0ZW5zaW9uc1JlZ2lzdHJ5LkV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElCcmVha3BvaW50Q29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdicmVha3BvaW50cycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmJyZWFrcG9pbnRzJywgJ0NvbnRyaWJ1dGVzIGJyZWFrcG9pbnRzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbeyBsYW5ndWFnZTogJycgfV0gfV0sXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGxhbmd1YWdlOiAnJyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRsYW5ndWFnZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuYnJlYWtwb2ludHMubGFuZ3VhZ2UnLCBcIkFsbG93IGJyZWFrcG9pbnRzIGZvciB0aGlzIGxhbmd1YWdlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5icmVha3BvaW50cy53aGVuJywgXCJDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSBicmVha3BvaW50cyBpbiB0aGlzIGxhbmd1YWdlLiBDb25zaWRlciBtYXRjaGluZyB0aGlzIHRvIHRoZSBkZWJ1Z2dlciB3aGVuIGNsYXVzZSBhcyBhcHByb3ByaWF0ZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbi8vIGRlYnVnIGdlbmVyYWwgc2NoZW1hXG5cbmV4cG9ydCBjb25zdCBwcmVzZW50YXRpb25TY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncHJlc2VudGF0aW9uJywgXCJQcmVzZW50YXRpb24gb3B0aW9ucyBvbiBob3cgdG8gc2hvdyB0aGlzIGNvbmZpZ3VyYXRpb24gaW4gdGhlIGRlYnVnIGNvbmZpZ3VyYXRpb24gZHJvcGRvd24gYW5kIHRoZSBjb21tYW5kIHBhbGV0dGUuXCIpLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aGlkZGVuOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ByZXNlbnRhdGlvbi5oaWRkZW4nLCBcIkNvbnRyb2xzIGlmIHRoaXMgY29uZmlndXJhdGlvbiBzaG91bGQgYmUgc2hvd24gaW4gdGhlIGNvbmZpZ3VyYXRpb24gZHJvcGRvd24gYW5kIHRoZSBjb21tYW5kIHBhbGV0dGUuXCIpXG5cdFx0fSxcblx0XHRncm91cDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ByZXNlbnRhdGlvbi5ncm91cCcsIFwiR3JvdXAgdGhhdCB0aGlzIGNvbmZpZ3VyYXRpb24gYmVsb25ncyB0by4gVXNlZCBmb3IgZ3JvdXBpbmcgYW5kIHNvcnRpbmcgaW4gdGhlIGNvbmZpZ3VyYXRpb24gZHJvcGRvd24gYW5kIHRoZSBjb21tYW5kIHBhbGV0dGUuXCIpXG5cdFx0fSxcblx0XHRvcmRlcjoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAxLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncHJlc2VudGF0aW9uLm9yZGVyJywgXCJPcmRlciBvZiB0aGlzIGNvbmZpZ3VyYXRpb24gd2l0aGluIGEgZ3JvdXAuIFVzZWQgZm9yIGdyb3VwaW5nIGFuZCBzb3J0aW5nIGluIHRoZSBjb25maWd1cmF0aW9uIGRyb3Bkb3duIGFuZCB0aGUgY29tbWFuZCBwYWxldHRlLlwiKVxuXHRcdH1cblx0fSxcblx0ZGVmYXVsdDoge1xuXHRcdGhpZGRlbjogZmFsc2UsXG5cdFx0Z3JvdXA6ICcnLFxuXHRcdG9yZGVyOiAxXG5cdH1cbn07XG5jb25zdCBkZWZhdWx0Q29tcG91bmQ6IElDb21wb3VuZCA9IHsgbmFtZTogJ0NvbXBvdW5kJywgY29uZmlndXJhdGlvbnM6IFtdIH07XG5leHBvcnQgY29uc3QgbGF1bmNoU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0aWQ6IGxhdW5jaFNjaGVtYUlkLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLnRpdGxlJywgXCJMYXVuY2hcIiksXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdHJlcXVpcmVkOiBbXSxcblx0ZGVmYXVsdDogeyB2ZXJzaW9uOiAnMC4yLjAnLCBjb25maWd1cmF0aW9uczogW10sIGNvbXBvdW5kczogW10gfSxcblx0cHJvcGVydGllczoge1xuXHRcdHZlcnNpb246IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLnZlcnNpb24nLCBcIlZlcnNpb24gb2YgdGhpcyBmaWxlIGZvcm1hdC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnMC4yLjAnXG5cdFx0fSxcblx0XHRjb25maWd1cmF0aW9uczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb25maWd1cmF0aW9ucycsIFwiTGlzdCBvZiBjb25maWd1cmF0aW9ucy4gQWRkIG5ldyBjb25maWd1cmF0aW9ucyBvciBlZGl0IGV4aXN0aW5nIG9uZXMgYnkgdXNpbmcgSW50ZWxsaVNlbnNlLlwiKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW10sXG5cdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdG9uZU9mOiBbXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y29tcG91bmRzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLmNvbXBvdW5kcycsIFwiTGlzdCBvZiBjb21wb3VuZHMuIEVhY2ggY29tcG91bmQgcmVmZXJlbmNlcyBtdWx0aXBsZSBjb25maWd1cmF0aW9ucyB3aGljaCB3aWxsIGdldCBsYXVuY2hlZCB0b2dldGhlci5cIiksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZScsICdjb25maWd1cmF0aW9ucyddLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhcHAubGF1bmNoLmpzb24uY29tcG91bmQubmFtZScsIFwiTmFtZSBvZiBjb21wb3VuZC4gQXBwZWFycyBpbiB0aGUgbGF1bmNoIGNvbmZpZ3VyYXRpb24gZHJvcCBkb3duIG1lbnUuXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IHByZXNlbnRhdGlvblNjaGVtYSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0b25lT2Y6IFt7XG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogW10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndXNlVW5pcXVlTmFtZXMnLCBcIlBsZWFzZSB1c2UgdW5pcXVlIGNvbmZpZ3VyYXRpb24gbmFtZXMuXCIpXG5cdFx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWyduYW1lJ10sXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLmNvbXBvdW5kLm5hbWUnLCBcIk5hbWUgb2YgY29tcG91bmQuIEFwcGVhcnMgaW4gdGhlIGxhdW5jaCBjb25maWd1cmF0aW9uIGRyb3AgZG93biBtZW51LlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdGZvbGRlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLmNvbXBvdW5kLmZvbGRlcicsIFwiTmFtZSBvZiBmb2xkZXIgaW4gd2hpY2ggdGhlIGNvbXBvdW5kIGlzIGxvY2F0ZWQuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb21wb3VuZHMuY29uZmlndXJhdGlvbnMnLCBcIk5hbWVzIG9mIGNvbmZpZ3VyYXRpb25zIHRoYXQgd2lsbCBiZSBzdGFydGVkIGFzIHBhcnQgb2YgdGhpcyBjb21wb3VuZC5cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHN0b3BBbGw6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLmNvbXBvdW5kLnN0b3BBbGwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbWFudWFsbHkgdGVybWluYXRpbmcgb25lIHNlc3Npb24gd2lsbCBzdG9wIGFsbCBvZiB0aGUgY29tcG91bmQgc2Vzc2lvbnMuXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmVMYXVuY2hUYXNrOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29tcG91bmRQcmVsYXVuY2hUYXNrJywgXCJUYXNrIHRvIHJ1biBiZWZvcmUgYW55IG9mIHRoZSBjb21wb3VuZCBjb25maWd1cmF0aW9ucyBzdGFydC5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRDb21wb3VuZFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IFtcblx0XHRcdFx0ZGVmYXVsdENvbXBvdW5kXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRpbnB1dHM6IGlucHV0c1NjaGVtYS5kZWZpbml0aW9ucyEuaW5wdXRzXG5cdH1cbn07XG5cbmNsYXNzIERlYnVnZ2Vyc0RhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LmRlYnVnZ2Vycztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYiA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5kZWJ1Z2dlcnMgfHwgW107XG5cdFx0aWYgKCFjb250cmliLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnZGVidWdnZXIgbmFtZScsIFwiTmFtZVwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZGVidWdnZXIgdHlwZScsIFwiVHlwZVwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYi5tYXAoZCA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRkLmxhYmVsID8/ICcnLFxuXHRcdFx0XHRkLnR5cGVcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2RlYnVnZ2VycycsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ2RlYnVnZ2VycycsIFwiRGVidWdnZXJzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoRGVidWdnZXJzRGF0YVJlbmRlcmVyKSxcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLHdCQUF3QjtBQUNwQyxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBbUg7QUFFNUgsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFHbEIsTUFBTSxvQkFBb0IsbUJBQW1CLG1CQUFtQix1QkFBZ0Q7QUFBQSxFQUN0SCxnQkFBZ0I7QUFBQSxFQUNoQixzQkFBc0IsQ0FBQyxXQUFXO0FBQUEsRUFDbEMsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMsMENBQTBDLDZCQUE2QjtBQUFBLElBQ2pHLE1BQU07QUFBQSxJQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDMUMsT0FBTztBQUFBLE1BQ04sc0JBQXNCO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLFNBQVMsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDbEUsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLFVBQ0ws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
