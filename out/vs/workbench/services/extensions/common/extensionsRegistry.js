import * as nls from "../../../../nls.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import Severity from "../../../../base/common/severity.js";
import { EXTENSION_IDENTIFIER_PATTERN } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EXTENSION_CATEGORIES, ExtensionIdentifierSet } from "../../../../platform/extensions/common/extensions.js";
import { productSchemaId } from "../../../../platform/product/common/productService.js";
import { ImplicitActivationEvents } from "../../../../platform/extensionManagement/common/implicitActivationEvents.js";
import { allApiProposals } from "../../../../platform/extensions/common/extensionsApiProposals.js";
const schemaRegistry = Registry.as(Extensions.JSONContribution);
class ExtensionMessageCollector {
  constructor(messageHandler, extension, extensionPointId) {
    this._messageHandler = messageHandler;
    this._extension = extension;
    this._extensionPointId = extensionPointId;
  }
  _msg(type, message) {
    this._messageHandler({
      type,
      message,
      extensionId: this._extension.identifier,
      extensionPointId: this._extensionPointId
    });
  }
  error(message) {
    this._msg(Severity.Error, message);
  }
  warn(message) {
    this._msg(Severity.Warning, message);
  }
  info(message) {
    this._msg(Severity.Info, message);
  }
}
class ExtensionPointUserDelta {
  constructor(added, removed) {
    this.added = added;
    this.removed = removed;
  }
  static _toSet(arr) {
    const result = new ExtensionIdentifierSet();
    for (let i = 0, len = arr.length; i < len; i++) {
      result.add(arr[i].description.identifier);
    }
    return result;
  }
  static compute(previous, current) {
    if (!previous || !previous.length) {
      return new ExtensionPointUserDelta(current, []);
    }
    if (!current || !current.length) {
      return new ExtensionPointUserDelta([], previous);
    }
    const previousSet = this._toSet(previous);
    const currentSet = this._toSet(current);
    const added = current.filter((user) => !previousSet.has(user.description.identifier));
    const removed = previous.filter((user) => !currentSet.has(user.description.identifier));
    return new ExtensionPointUserDelta(added, removed);
  }
}
class ExtensionPoint {
  constructor(name, defaultExtensionKind, canHandleResolver) {
    this.name = name;
    this.defaultExtensionKind = defaultExtensionKind;
    this.canHandleResolver = canHandleResolver;
    this._handler = null;
    this._users = null;
    this._delta = null;
  }
  setHandler(handler) {
    if (this._handler !== null) {
      throw new Error("Handler already set!");
    }
    this._handler = handler;
    this._handle();
    return {
      dispose: () => {
        this._handler = null;
      }
    };
  }
  acceptUsers(users) {
    this._delta = ExtensionPointUserDelta.compute(this._users, users);
    this._users = users;
    this._handle();
  }
  _handle() {
    if (this._handler === null || this._users === null || this._delta === null) {
      return;
    }
    try {
      this._handler(this._users, this._delta);
    } catch (err) {
      onUnexpectedError(err);
    }
  }
}
const extensionKindSchema = {
  type: "string",
  enum: [
    "ui",
    "workspace"
  ],
  enumDescriptions: [
    nls.localize("ui", "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
    nls.localize("workspace", "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
  ]
};
const schemaId = "vscode://schemas/vscode-extensions";
const schema = {
  properties: {
    engines: {
      type: "object",
      description: nls.localize("vscode.extension.engines", "Engine compatibility."),
      properties: {
        "vscode": {
          type: "string",
          description: nls.localize("vscode.extension.engines.vscode", "For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^1.105.0 indicates compatibility with a minimum VS Code version of 1.105.0."),
          default: "^1.105.0"
        }
      }
    },
    publisher: {
      description: nls.localize("vscode.extension.publisher", "The publisher of the VS Code extension."),
      type: "string"
    },
    displayName: {
      description: nls.localize("vscode.extension.displayName", "The display name for the extension used in the VS Code gallery."),
      type: "string"
    },
    categories: {
      description: nls.localize("vscode.extension.categories", "The categories used by the VS Code gallery to categorize the extension."),
      type: "array",
      uniqueItems: true,
      items: {
        oneOf: [
          {
            type: "string",
            enum: EXTENSION_CATEGORIES
          },
          {
            type: "string",
            const: "Languages",
            deprecationMessage: nls.localize("vscode.extension.category.languages.deprecated", "Use 'Programming  Languages' instead")
          }
        ]
      }
    },
    galleryBanner: {
      type: "object",
      description: nls.localize("vscode.extension.galleryBanner", "Banner used in the VS Code marketplace."),
      properties: {
        color: {
          description: nls.localize("vscode.extension.galleryBanner.color", "The banner color on the VS Code marketplace page header."),
          type: "string"
        },
        theme: {
          description: nls.localize("vscode.extension.galleryBanner.theme", "The color theme for the font used in the banner."),
          type: "string",
          enum: ["dark", "light"]
        }
      }
    },
    contributes: {
      description: nls.localize("vscode.extension.contributes", "All contributions of the VS Code extension represented by this package."),
      type: "object",
      // eslint-disable-next-line local/code-no-any-casts
      properties: {
        // extensions will fill in
      },
      default: {}
    },
    preview: {
      type: "boolean",
      description: nls.localize("vscode.extension.preview", "Sets the extension to be flagged as a Preview in the Marketplace.")
    },
    enableProposedApi: {
      type: "boolean",
      deprecationMessage: nls.localize("vscode.extension.enableProposedApi.deprecated", "Use `enabledApiProposals` instead.")
    },
    enabledApiProposals: {
      markdownDescription: nls.localize("vscode.extension.enabledApiProposals", "Enable API proposals to try them out. Only valid **during development**. Extensions **cannot be published** with this property. For more details visit: https://code.visualstudio.com/api/advanced-topics/using-proposed-api"),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        enum: Object.keys(allApiProposals).map((proposalName) => proposalName),
        markdownEnumDescriptions: Object.values(allApiProposals).map((value) => value.proposal)
      }
    },
    api: {
      markdownDescription: nls.localize("vscode.extension.api", "Describe the API provided by this extension. For more details visit: https://code.visualstudio.com/api/advanced-topics/remote-extensions#handling-dependencies-with-remote-extensions"),
      type: "string",
      enum: ["none"],
      enumDescriptions: [
        nls.localize("vscode.extension.api.none", "Give up entirely the ability to export any APIs. This allows other extensions that depend on this extension to run in a separate extension host process or in a remote machine.")
      ]
    },
    activationEvents: {
      description: nls.localize("vscode.extension.activationEvents", "Activation events for the VS Code extension."),
      type: "array",
      items: {
        type: "string",
        defaultSnippets: [
          {
            label: "onWebviewPanel",
            description: nls.localize("vscode.extension.activationEvents.onWebviewPanel", "An activation event emitted when a webview is loaded of a certain viewType"),
            body: "onWebviewPanel:viewType"
          },
          {
            label: "onLanguage",
            description: nls.localize("vscode.extension.activationEvents.onLanguage", "An activation event emitted whenever a file that resolves to the specified language gets opened."),
            body: "onLanguage:${1:languageId}"
          },
          {
            label: "onCommand",
            description: nls.localize("vscode.extension.activationEvents.onCommand", "An activation event emitted whenever the specified command gets invoked."),
            body: "onCommand:${2:commandId}"
          },
          {
            label: "onDebug",
            description: nls.localize("vscode.extension.activationEvents.onDebug", "An activation event emitted whenever a user is about to start debugging or about to setup debug configurations."),
            body: "onDebug"
          },
          {
            label: "onDebugInitialConfigurations",
            description: nls.localize("vscode.extension.activationEvents.onDebugInitialConfigurations", 'An activation event emitted whenever a "launch.json" needs to be created (and all provideDebugConfigurations methods need to be called).'),
            body: "onDebugInitialConfigurations"
          },
          {
            label: "onDebugDynamicConfigurations",
            description: nls.localize("vscode.extension.activationEvents.onDebugDynamicConfigurations", 'An activation event emitted whenever a list of all debug configurations needs to be created (and all provideDebugConfigurations methods for the "dynamic" scope need to be called).'),
            body: "onDebugDynamicConfigurations"
          },
          {
            label: "onDebugResolve",
            description: nls.localize("vscode.extension.activationEvents.onDebugResolve", "An activation event emitted whenever a debug session with the specific type is about to be launched (and a corresponding resolveDebugConfiguration method needs to be called)."),
            body: "onDebugResolve:${6:type}"
          },
          {
            label: "onDebugAdapterProtocolTracker",
            description: nls.localize("vscode.extension.activationEvents.onDebugAdapterProtocolTracker", "An activation event emitted whenever a debug session with the specific type is about to be launched and a debug protocol tracker might be needed."),
            body: "onDebugAdapterProtocolTracker:${6:type}"
          },
          {
            label: "workspaceContains",
            description: nls.localize("vscode.extension.activationEvents.workspaceContains", "An activation event emitted whenever a folder is opened that contains at least a file matching the specified glob pattern."),
            body: "workspaceContains:${4:filePattern}"
          },
          {
            label: "onStartupFinished",
            description: nls.localize("vscode.extension.activationEvents.onStartupFinished", "An activation event emitted after the start-up finished (after all `*` activated extensions have finished activating)."),
            body: "onStartupFinished"
          },
          {
            label: "onTaskType",
            description: nls.localize("vscode.extension.activationEvents.onTaskType", "An activation event emitted whenever tasks of a certain type need to be listed or resolved."),
            body: "onTaskType:${1:taskType}"
          },
          {
            label: "onFileSystem",
            description: nls.localize("vscode.extension.activationEvents.onFileSystem", "An activation event emitted whenever a file or folder is accessed with the given scheme."),
            body: "onFileSystem:${1:scheme}"
          },
          {
            label: "onEditSession",
            description: nls.localize("vscode.extension.activationEvents.onEditSession", "An activation event emitted whenever an edit session is accessed with the given scheme."),
            body: "onEditSession:${1:scheme}"
          },
          {
            label: "onSearch",
            description: nls.localize("vscode.extension.activationEvents.onSearch", "An activation event emitted whenever a search is started in the folder with the given scheme."),
            body: "onSearch:${7:scheme}"
          },
          {
            label: "onView",
            body: "onView:${5:viewId}",
            description: nls.localize("vscode.extension.activationEvents.onView", "An activation event emitted whenever the specified view is expanded.")
          },
          {
            label: "onUri",
            body: "onUri",
            description: nls.localize("vscode.extension.activationEvents.onUri", "An activation event emitted whenever a system-wide Uri directed towards this extension is open.")
          },
          {
            label: "onOpenExternalUri",
            body: "onOpenExternalUri",
            description: nls.localize("vscode.extension.activationEvents.onOpenExternalUri", "An activation event emitted whenever a external uri (such as an http or https link) is being opened.")
          },
          {
            label: "onCustomEditor",
            body: "onCustomEditor:${9:viewType}",
            description: nls.localize("vscode.extension.activationEvents.onCustomEditor", "An activation event emitted whenever the specified custom editor becomes visible.")
          },
          {
            label: "onNotebook",
            body: "onNotebook:${1:type}",
            description: nls.localize("vscode.extension.activationEvents.onNotebook", "An activation event emitted whenever the specified notebook document is opened.")
          },
          {
            label: "onAuthenticationRequest",
            body: "onAuthenticationRequest:${11:authenticationProviderId}",
            description: nls.localize("vscode.extension.activationEvents.onAuthenticationRequest", "An activation event emitted whenever sessions are requested from the specified authentication provider.")
          },
          {
            label: "onRenderer",
            description: nls.localize("vscode.extension.activationEvents.onRenderer", "An activation event emitted whenever a notebook output renderer is used."),
            body: "onRenderer:${11:rendererId}"
          },
          {
            label: "onTerminalProfile",
            body: "onTerminalProfile:${1:terminalId}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalProfile", "An activation event emitted when a specific terminal profile is launched.")
          },
          {
            label: "onTerminalQuickFixRequest",
            body: "onTerminalQuickFixRequest:${1:quickFixId}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalQuickFixRequest", "An activation event emitted when a command matches the selector associated with this ID")
          },
          {
            label: "onWalkthrough",
            body: "onWalkthrough:${1:walkthroughID}",
            description: nls.localize("vscode.extension.activationEvents.onWalkthrough", "An activation event emitted when a specified walkthrough is opened.")
          },
          {
            label: "onIssueReporterOpened",
            body: "onIssueReporterOpened",
            description: nls.localize("vscode.extension.activationEvents.onIssueReporterOpened", "An activation event emitted when the issue reporter is opened.")
          },
          {
            label: "onChatParticipant",
            body: "onChatParticipant:${1:participantId}",
            description: nls.localize("vscode.extension.activationEvents.onChatParticipant", "An activation event emitted when the specified chat participant is invoked.")
          },
          {
            label: "onChatContextProvider",
            body: "onChatContextProvider:${1:contextProviderId}",
            description: nls.localize("vscode.extension.activationEvents.onChatContextProvider", "An activation event emitted when the specified chat context provider is invoked.")
          },
          {
            label: "onLanguageModelChatProvider",
            body: "onLanguageModelChatProvider:${1:vendor}",
            description: nls.localize("vscode.extension.activationEvents.onLanguageModelChatProvider", "An activation event emitted when a chat model provider for the given vendor is requested.")
          },
          {
            label: "onLanguageModelTool",
            body: "onLanguageModelTool:${1:toolId}",
            description: nls.localize("vscode.extension.activationEvents.onLanguageModelTool", "An activation event emitted when the specified language model tool is invoked.")
          },
          {
            label: "onTerminal",
            body: "onTerminal:{1:shellType}",
            description: nls.localize("vscode.extension.activationEvents.onTerminal", "An activation event emitted when a terminal of the given shell type is opened.")
          },
          {
            label: "onTerminalShellIntegration",
            body: "onTerminalShellIntegration:${1:shellType}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalShellIntegration", "An activation event emitted when terminal shell integration is activated for the given shell type.")
          },
          {
            label: "onMcpCollection",
            description: nls.localize("vscode.extension.activationEvents.onMcpCollection", "An activation event emitted whenever a tool from the MCP server is requested."),
            body: "onMcpCollection:${2:collectionId}"
          },
          {
            label: "*",
            description: nls.localize("vscode.extension.activationEvents.star", "An activation event emitted on VS Code startup. To ensure a great end user experience, please use this activation event in your extension only when no other activation events combination works in your use-case."),
            body: "*"
          }
        ]
      }
    },
    badges: {
      type: "array",
      description: nls.localize("vscode.extension.badges", "Array of badges to display in the sidebar of the Marketplace's extension page."),
      items: {
        type: "object",
        required: ["url", "href", "description"],
        properties: {
          url: {
            type: "string",
            description: nls.localize("vscode.extension.badges.url", "Badge image URL.")
          },
          href: {
            type: "string",
            description: nls.localize("vscode.extension.badges.href", "Badge link.")
          },
          description: {
            type: "string",
            description: nls.localize("vscode.extension.badges.description", "Badge description.")
          }
        }
      }
    },
    markdown: {
      type: "string",
      description: nls.localize("vscode.extension.markdown", "Controls the Markdown rendering engine used in the Marketplace. Either github (default) or standard."),
      enum: ["github", "standard"],
      default: "github"
    },
    qna: {
      default: "marketplace",
      description: nls.localize("vscode.extension.qna", "Controls the Q&A link in the Marketplace. Set to marketplace to enable the default Marketplace Q & A site. Set to a string to provide the URL of a custom Q & A site. Set to false to disable Q & A altogether."),
      anyOf: [
        {
          type: ["string", "boolean"],
          enum: ["marketplace", false]
        },
        {
          type: "string"
        }
      ]
    },
    extensionDependencies: {
      description: nls.localize("vscode.extension.extensionDependencies", "Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionAffinity: {
      description: nls.localize("vscode.extension.extensionAffinity", "Extensions that this extension should be colocated with in the same extension host process if possible. The identifier of an extension is always ${publisher}.${name}. For example: vscode.git."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionPack: {
      description: nls.localize("vscode.extension.contributes.extensionPack", "A set of extensions that can be installed together. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionKind: {
      description: nls.localize("extensionKind", "Define the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions run on the remote."),
      type: "array",
      items: extensionKindSchema,
      default: ["workspace"],
      defaultSnippets: [
        {
          body: ["ui"],
          description: nls.localize("extensionKind.ui", "Define an extension which can run only on the local machine when connected to remote window.")
        },
        {
          body: ["workspace"],
          description: nls.localize("extensionKind.workspace", "Define an extension which can run only on the remote machine when connected remote window.")
        },
        {
          body: ["ui", "workspace"],
          description: nls.localize("extensionKind.ui-workspace", "Define an extension which can run on either side, with a preference towards running on the local machine.")
        },
        {
          body: ["workspace", "ui"],
          description: nls.localize("extensionKind.workspace-ui", "Define an extension which can run on either side, with a preference towards running on the remote machine.")
        },
        {
          body: [],
          description: nls.localize("extensionKind.empty", "Define an extension which cannot run in a remote context, neither on the local, nor on the remote machine.")
        }
      ]
    },
    capabilities: {
      description: nls.localize("vscode.extension.capabilities", "Declare the set of supported capabilities by the extension."),
      type: "object",
      properties: {
        virtualWorkspaces: {
          description: nls.localize("vscode.extension.capabilities.virtualWorkspaces", "Declares whether the extension should be enabled in virtual workspaces. A virtual workspace is a workspace which is not backed by any on-disk resources. When false, this extension will be automatically disabled in virtual workspaces. Default is true."),
          type: ["boolean", "object"],
          defaultSnippets: [
            { label: "limited", body: { supported: "${1:limited}", description: "${2}" } },
            { label: "false", body: { supported: false, description: "${2}" } }
          ],
          default: true.valueOf,
          properties: {
            supported: {
              markdownDescription: nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported", "Declares the level of support for virtual workspaces by the extension."),
              type: ["string", "boolean"],
              enum: ["limited", true, false],
              enumDescriptions: [
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.limited", "The extension will be enabled in virtual workspaces with some functionality disabled."),
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.true", "The extension will be enabled in virtual workspaces with all functionality enabled."),
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.false", "The extension will not be enabled in virtual workspaces.")
              ]
            },
            description: {
              type: "string",
              markdownDescription: nls.localize("vscode.extension.capabilities.virtualWorkspaces.description", "A description of how virtual workspaces affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`.")
            }
          }
        },
        untrustedWorkspaces: {
          description: nls.localize("vscode.extension.capabilities.untrustedWorkspaces", "Declares how the extension should be handled in untrusted workspaces."),
          type: "object",
          required: ["supported"],
          defaultSnippets: [
            { body: { supported: "${1:limited}", description: "${2}" } }
          ],
          properties: {
            supported: {
              markdownDescription: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported", "Declares the level of support for untrusted workspaces by the extension."),
              type: ["string", "boolean"],
              enum: ["limited", true, false],
              enumDescriptions: [
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.limited", "The extension will be enabled in untrusted workspaces with some functionality disabled."),
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.true", "The extension will be enabled in untrusted workspaces with all functionality enabled."),
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.false", "The extension will not be enabled in untrusted workspaces.")
              ]
            },
            restrictedConfigurations: {
              description: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.restrictedConfigurations", "A list of configuration keys contributed by the extension that should not use workspace values in untrusted workspaces."),
              type: "array",
              items: {
                type: "string"
              }
            },
            description: {
              type: "string",
              markdownDescription: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.description", "A description of how workspace trust affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`.")
            }
          }
        }
      }
    },
    sponsor: {
      description: nls.localize("vscode.extension.contributes.sponsor", "Specify the location from where users can sponsor your extension."),
      type: "object",
      defaultSnippets: [
        { body: { url: "${1:https:}" } }
      ],
      properties: {
        "url": {
          description: nls.localize("vscode.extension.contributes.sponsor.url", "URL from where users can sponsor your extension. It must be a valid URL with a HTTP or HTTPS protocol. Example value: https://github.com/sponsors/nvaccess"),
          type: "string"
        }
      }
    },
    scripts: {
      type: "object",
      properties: {
        "vscode:prepublish": {
          description: nls.localize("vscode.extension.scripts.prepublish", "Script executed before the package is published as a VS Code extension."),
          type: "string"
        },
        "vscode:uninstall": {
          description: nls.localize("vscode.extension.scripts.uninstall", "Uninstall hook for VS Code extension. Script that gets executed when the extension is completely uninstalled from VS Code which is when VS Code is restarted (shutdown and start) after the extension is uninstalled. Only Node scripts are supported."),
          type: "string"
        }
      }
    },
    icon: {
      type: "string",
      description: nls.localize("vscode.extension.icon", "The path to a 128x128 pixel icon.")
    },
    l10n: {
      type: "string",
      description: nls.localize({
        key: "vscode.extension.l10n",
        comment: [
          '{Locked="bundle.l10n._locale_.json"}',
          '{Locked="vscode.l10n API"}'
        ]
      }, "The relative path to a folder containing localization (bundle.l10n.*.json) files. Must be specified if you are using the vscode.l10n API.")
    },
    pricing: {
      type: "string",
      markdownDescription: nls.localize("vscode.extension.pricing", "The pricing information for the extension. Can be Free (default) or Trial. For more details visit: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#extension-pricing-label"),
      enum: ["Free", "Trial"],
      default: "Free"
    }
  }
};
class ExtensionsRegistryImpl {
  constructor() {
    this._extensionPoints = /* @__PURE__ */ new Map();
  }
  registerExtensionPoint(desc) {
    if (this._extensionPoints.has(desc.extensionPoint)) {
      throw new Error("Duplicate extension point: " + desc.extensionPoint);
    }
    const result = new ExtensionPoint(desc.extensionPoint, desc.defaultExtensionKind, desc.canHandleResolver);
    this._extensionPoints.set(desc.extensionPoint, result);
    if (desc.activationEventsGenerator) {
      ImplicitActivationEvents.register(desc.extensionPoint, desc.activationEventsGenerator);
    }
    schema.properties["contributes"].properties[desc.extensionPoint] = desc.jsonSchema;
    schemaRegistry.registerSchema(schemaId, schema);
    return result;
  }
  getExtensionPoints() {
    return Array.from(this._extensionPoints.values());
  }
}
const PRExtensions = {
  ExtensionsRegistry: "ExtensionsRegistry"
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
const ExtensionsRegistry = Registry.as(PRExtensions.ExtensionsRegistry);
schemaRegistry.registerSchema(schemaId, schema);
schemaRegistry.registerSchema(productSchemaId, {
  properties: {
    extensionEnabledApiProposals: {
      description: nls.localize("product.extensionEnabledApiProposals", "API proposals that the respective extensions can freely use."),
      type: "object",
      properties: {},
      additionalProperties: {
        anyOf: [{
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            enum: Object.keys(allApiProposals),
            markdownEnumDescriptions: Object.values(allApiProposals).map((value) => value.proposal)
          }
        }]
      }
    }
  }
});
export {
  ExtensionMessageCollector,
  ExtensionPoint,
  ExtensionPointUserDelta,
  ExtensionsRegistry,
  ExtensionsRegistryImpl,
  schema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXGV4dGVuc2lvbnNSZWdpc3RyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fSURFTlRJRklFUl9QQVRURVJOIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZSB9IGZyb20gJy4vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIEVYVEVOU0lPTl9DQVRFR09SSUVTLCBFeHRlbnNpb25JZGVudGlmaWVyU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHByb2R1Y3RTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEltcGxpY2l0QWN0aXZhdGlvbkV2ZW50cywgSUFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9pbXBsaWNpdEFjdGl2YXRpb25FdmVudHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYWxsQXBpUHJvcG9zYWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc0FwaVByb3Bvc2Fscy5qcyc7XG5cbmNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VIYW5kbGVyOiAobXNnOiBJTWVzc2FnZSkgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblBvaW50SWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtZXNzYWdlSGFuZGxlcjogKG1zZzogSU1lc3NhZ2UpID0+IHZvaWQsXG5cdFx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0ZXh0ZW5zaW9uUG9pbnRJZDogc3RyaW5nXG5cdCkge1xuXHRcdHRoaXMuX21lc3NhZ2VIYW5kbGVyID0gbWVzc2FnZUhhbmRsZXI7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdHRoaXMuX2V4dGVuc2lvblBvaW50SWQgPSBleHRlbnNpb25Qb2ludElkO1xuXHR9XG5cblx0cHJpdmF0ZSBfbXNnKHR5cGU6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9tZXNzYWdlSGFuZGxlcih7XG5cdFx0XHR0eXBlOiB0eXBlLFxuXHRcdFx0bWVzc2FnZTogbWVzc2FnZSxcblx0XHRcdGV4dGVuc2lvbklkOiB0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdGV4dGVuc2lvblBvaW50SWQ6IHRoaXMuX2V4dGVuc2lvblBvaW50SWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBlcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9tc2coU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbXNnKFNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGluZm8obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbXNnKFNldmVyaXR5LkluZm8sIG1lc3NhZ2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblBvaW50VXNlcjxUPiB7XG5cdGRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHZhbHVlOiBUO1xuXHRjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3I7XG59XG5cbmV4cG9ydCB0eXBlIElFeHRlbnNpb25Qb2ludEhhbmRsZXI8VD4gPSAoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxUPltdLCBkZWx0YTogRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGE8VD4pID0+IHZvaWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblBvaW50PFQ+IHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRzZXRIYW5kbGVyKGhhbmRsZXI6IElFeHRlbnNpb25Qb2ludEhhbmRsZXI8VD4pOiBJRGlzcG9zYWJsZTtcblx0cmVhZG9ubHkgZGVmYXVsdEV4dGVuc2lvbktpbmQ6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2FuSGFuZGxlUmVzb2x2ZXI/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGE8VD4ge1xuXG5cdHByaXZhdGUgc3RhdGljIF90b1NldDxUPihhcnI6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSk6IEV4dGVuc2lvbklkZW50aWZpZXJTZXQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyU2V0KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmVzdWx0LmFkZChhcnJbaV0uZGVzY3JpcHRpb24uaWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvbXB1dGU8VD4ocHJldmlvdXM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSB8IG51bGwsIGN1cnJlbnQ6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSk6IEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+IHtcblx0XHRpZiAoIXByZXZpb3VzIHx8ICFwcmV2aW91cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBuZXcgRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGE8VD4oY3VycmVudCwgW10pO1xuXHRcdH1cblx0XHRpZiAoIWN1cnJlbnQgfHwgIWN1cnJlbnQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+KFtdLCBwcmV2aW91cyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNTZXQgPSB0aGlzLl90b1NldChwcmV2aW91cyk7XG5cdFx0Y29uc3QgY3VycmVudFNldCA9IHRoaXMuX3RvU2V0KGN1cnJlbnQpO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSBjdXJyZW50LmZpbHRlcih1c2VyID0+ICFwcmV2aW91c1NldC5oYXModXNlci5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKSk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IHByZXZpb3VzLmZpbHRlcih1c2VyID0+ICFjdXJyZW50U2V0Lmhhcyh1c2VyLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpKTtcblxuXHRcdHJldHVybiBuZXcgRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGE8VD4oYWRkZWQsIHJlbW92ZWQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGFkZGVkOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlbW92ZWQ6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblBvaW50PFQ+IGltcGxlbWVudHMgSUV4dGVuc2lvblBvaW50PFQ+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGVmYXVsdEV4dGVuc2lvbktpbmQ6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGNhbkhhbmRsZVJlc29sdmVyPzogYm9vbGVhbjtcblxuXHRwcml2YXRlIF9oYW5kbGVyOiBJRXh0ZW5zaW9uUG9pbnRIYW5kbGVyPFQ+IHwgbnVsbDtcblx0cHJpdmF0ZSBfdXNlcnM6IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSB8IG51bGw7XG5cdHByaXZhdGUgX2RlbHRhOiBFeHRlbnNpb25Qb2ludFVzZXJEZWx0YTxUPiB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBkZWZhdWx0RXh0ZW5zaW9uS2luZDogRXh0ZW5zaW9uS2luZFtdIHwgdW5kZWZpbmVkLCBjYW5IYW5kbGVSZXNvbHZlcj86IGJvb2xlYW4pIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMuZGVmYXVsdEV4dGVuc2lvbktpbmQgPSBkZWZhdWx0RXh0ZW5zaW9uS2luZDtcblx0XHR0aGlzLmNhbkhhbmRsZVJlc29sdmVyID0gY2FuSGFuZGxlUmVzb2x2ZXI7XG5cdFx0dGhpcy5faGFuZGxlciA9IG51bGw7XG5cdFx0dGhpcy5fdXNlcnMgPSBudWxsO1xuXHRcdHRoaXMuX2RlbHRhID0gbnVsbDtcblx0fVxuXG5cdHNldEhhbmRsZXIoaGFuZGxlcjogSUV4dGVuc2lvblBvaW50SGFuZGxlcjxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5faGFuZGxlciAhPT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdIYW5kbGVyIGFscmVhZHkgc2V0IScpO1xuXHRcdH1cblx0XHR0aGlzLl9oYW5kbGVyID0gaGFuZGxlcjtcblx0XHR0aGlzLl9oYW5kbGUoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZXIgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhY2NlcHRVc2Vycyh1c2VyczogSUV4dGVuc2lvblBvaW50VXNlcjxUPltdKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVsdGEgPSBFeHRlbnNpb25Qb2ludFVzZXJEZWx0YS5jb21wdXRlKHRoaXMuX3VzZXJzLCB1c2Vycyk7XG5cdFx0dGhpcy5fdXNlcnMgPSB1c2Vycztcblx0XHR0aGlzLl9oYW5kbGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFuZGxlciA9PT0gbnVsbCB8fCB0aGlzLl91c2VycyA9PT0gbnVsbCB8fCB0aGlzLl9kZWx0YSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVyKHRoaXMuX3VzZXJzLCB0aGlzLl9kZWx0YSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBleHRlbnNpb25LaW5kU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IFtcblx0XHQndWknLFxuXHRcdCd3b3Jrc3BhY2UnXG5cdF0sXG5cdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRubHMubG9jYWxpemUoJ3VpJywgXCJVSSBleHRlbnNpb24ga2luZC4gSW4gYSByZW1vdGUgd2luZG93LCBzdWNoIGV4dGVuc2lvbnMgYXJlIGVuYWJsZWQgb25seSB3aGVuIGF2YWlsYWJsZSBvbiB0aGUgbG9jYWwgbWFjaGluZS5cIiksXG5cdFx0bmxzLmxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZSBleHRlbnNpb24ga2luZC4gSW4gYSByZW1vdGUgd2luZG93LCBzdWNoIGV4dGVuc2lvbnMgYXJlIGVuYWJsZWQgb25seSB3aGVuIGF2YWlsYWJsZSBvbiB0aGUgcmVtb3RlLlwiKSxcblx0XSxcbn07XG5cbmNvbnN0IHNjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvdnNjb2RlLWV4dGVuc2lvbnMnO1xuZXhwb3J0IGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHByb3BlcnRpZXM6IHtcblx0XHRlbmdpbmVzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uZW5naW5lcycsIFwiRW5naW5lIGNvbXBhdGliaWxpdHkuXCIpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQndnNjb2RlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uZW5naW5lcy52c2NvZGUnLCAnRm9yIFZTIENvZGUgZXh0ZW5zaW9ucywgc3BlY2lmaWVzIHRoZSBWUyBDb2RlIHZlcnNpb24gdGhhdCB0aGUgZXh0ZW5zaW9uIGlzIGNvbXBhdGlibGUgd2l0aC4gQ2Fubm90IGJlICouIEZvciBleGFtcGxlOiBeMS4xMDUuMCBpbmRpY2F0ZXMgY29tcGF0aWJpbGl0eSB3aXRoIGEgbWluaW11bSBWUyBDb2RlIHZlcnNpb24gb2YgMS4xMDUuMC4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnXjEuMTA1LjAnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRwdWJsaXNoZXI6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24ucHVibGlzaGVyJywgJ1RoZSBwdWJsaXNoZXIgb2YgdGhlIFZTIENvZGUgZXh0ZW5zaW9uLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGRpc3BsYXlOYW1lOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lJywgJ1RoZSBkaXNwbGF5IG5hbWUgZm9yIHRoZSBleHRlbnNpb24gdXNlZCBpbiB0aGUgVlMgQ29kZSBnYWxsZXJ5LicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGNhdGVnb3JpZXM6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2F0ZWdvcmllcycsICdUaGUgY2F0ZWdvcmllcyB1c2VkIGJ5IHRoZSBWUyBDb2RlIGdhbGxlcnkgdG8gY2F0ZWdvcml6ZSB0aGUgZXh0ZW5zaW9uLicpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0b25lT2Y6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogRVhURU5TSU9OX0NBVEVHT1JJRVMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRjb25zdDogJ0xhbmd1YWdlcycsXG5cdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2F0ZWdvcnkubGFuZ3VhZ2VzLmRlcHJlY2F0ZWQnLCAnVXNlIFxcJ1Byb2dyYW1taW5nICBMYW5ndWFnZXNcXCcgaW5zdGVhZCcpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Z2FsbGVyeUJhbm5lcjoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmdhbGxlcnlCYW5uZXInLCAnQmFubmVyIHVzZWQgaW4gdGhlIFZTIENvZGUgbWFya2V0cGxhY2UuJyksXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGNvbG9yOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5nYWxsZXJ5QmFubmVyLmNvbG9yJywgJ1RoZSBiYW5uZXIgY29sb3Igb24gdGhlIFZTIENvZGUgbWFya2V0cGxhY2UgcGFnZSBoZWFkZXIuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhlbWU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmdhbGxlcnlCYW5uZXIudGhlbWUnLCAnVGhlIGNvbG9yIHRoZW1lIGZvciB0aGUgZm9udCB1c2VkIGluIHRoZSBiYW5uZXIuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydkYXJrJywgJ2xpZ2h0J11cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y29udHJpYnV0ZXM6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMnLCAnQWxsIGNvbnRyaWJ1dGlvbnMgb2YgdGhlIFZTIENvZGUgZXh0ZW5zaW9uIHJlcHJlc2VudGVkIGJ5IHRoaXMgcGFja2FnZS4nKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdC8vIGV4dGVuc2lvbnMgd2lsbCBmaWxsIGluXG5cdFx0XHR9IGFzIGFueSBhcyB7IFtrZXk6IHN0cmluZ106IGFueSB9LFxuXHRcdFx0ZGVmYXVsdDoge31cblx0XHR9LFxuXHRcdHByZXZpZXc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24ucHJldmlldycsICdTZXRzIHRoZSBleHRlbnNpb24gdG8gYmUgZmxhZ2dlZCBhcyBhIFByZXZpZXcgaW4gdGhlIE1hcmtldHBsYWNlLicpLFxuXHRcdH0sXG5cdFx0ZW5hYmxlUHJvcG9zZWRBcGk6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmVuYWJsZVByb3Bvc2VkQXBpLmRlcHJlY2F0ZWQnLCAnVXNlIGBlbmFibGVkQXBpUHJvcG9zYWxzYCBpbnN0ZWFkLicpLFxuXHRcdH0sXG5cdFx0ZW5hYmxlZEFwaVByb3Bvc2Fsczoge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmVuYWJsZWRBcGlQcm9wb3NhbHMnLCAnRW5hYmxlIEFQSSBwcm9wb3NhbHMgdG8gdHJ5IHRoZW0gb3V0LiBPbmx5IHZhbGlkICoqZHVyaW5nIGRldmVsb3BtZW50KiouIEV4dGVuc2lvbnMgKipjYW5ub3QgYmUgcHVibGlzaGVkKiogd2l0aCB0aGlzIHByb3BlcnR5LiBGb3IgbW9yZSBkZXRhaWxzIHZpc2l0OiBodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3VzaW5nLXByb3Bvc2VkLWFwaScpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IE9iamVjdC5rZXlzKGFsbEFwaVByb3Bvc2FscykubWFwKHByb3Bvc2FsTmFtZSA9PiBwcm9wb3NhbE5hbWUpLFxuXHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IE9iamVjdC52YWx1ZXMoYWxsQXBpUHJvcG9zYWxzKS5tYXAodmFsdWUgPT4gdmFsdWUucHJvcG9zYWwpXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhcGk6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hcGknLCAnRGVzY3JpYmUgdGhlIEFQSSBwcm92aWRlZCBieSB0aGlzIGV4dGVuc2lvbi4gRm9yIG1vcmUgZGV0YWlscyB2aXNpdDogaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vYXBpL2FkdmFuY2VkLXRvcGljcy9yZW1vdGUtZXh0ZW5zaW9ucyNoYW5kbGluZy1kZXBlbmRlbmNpZXMtd2l0aC1yZW1vdGUtZXh0ZW5zaW9ucycpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ25vbmUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFwaS5ub25lJywgXCJHaXZlIHVwIGVudGlyZWx5IHRoZSBhYmlsaXR5IHRvIGV4cG9ydCBhbnkgQVBJcy4gVGhpcyBhbGxvd3Mgb3RoZXIgZXh0ZW5zaW9ucyB0aGF0IGRlcGVuZCBvbiB0aGlzIGV4dGVuc2lvbiB0byBydW4gaW4gYSBzZXBhcmF0ZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzIG9yIGluIGEgcmVtb3RlIG1hY2hpbmUuXCIpXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRhY3RpdmF0aW9uRXZlbnRzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMnLCAnQWN0aXZhdGlvbiBldmVudHMgZm9yIHRoZSBWUyBDb2RlIGV4dGVuc2lvbi4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbldlYnZpZXdQYW5lbCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25XZWJ2aWV3UGFuZWwnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSB3ZWJ2aWV3IGlzIGxvYWRlZCBvZiBhIGNlcnRhaW4gdmlld1R5cGUnKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbldlYnZpZXdQYW5lbDp2aWV3VHlwZSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25MYW5ndWFnZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25MYW5ndWFnZScsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBmaWxlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIHNwZWNpZmllZCBsYW5ndWFnZSBnZXRzIG9wZW5lZC4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkxhbmd1YWdlOiR7MTpsYW5ndWFnZUlkfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25Db21tYW5kJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkNvbW1hbmQnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIHRoZSBzcGVjaWZpZWQgY29tbWFuZCBnZXRzIGludm9rZWQuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25Db21tYW5kOiR7Mjpjb21tYW5kSWR9J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkRlYnVnJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkRlYnVnJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIHVzZXIgaXMgYWJvdXQgdG8gc3RhcnQgZGVidWdnaW5nIG9yIGFib3V0IHRvIHNldHVwIGRlYnVnIGNvbmZpZ3VyYXRpb25zLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uRGVidWcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRGVidWdJbml0aWFsQ29uZmlndXJhdGlvbnMnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uRGVidWdJbml0aWFsQ29uZmlndXJhdGlvbnMnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgXCJsYXVuY2guanNvblwiIG5lZWRzIHRvIGJlIGNyZWF0ZWQgKGFuZCBhbGwgcHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMgbWV0aG9kcyBuZWVkIHRvIGJlIGNhbGxlZCkuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25EZWJ1Z0luaXRpYWxDb25maWd1cmF0aW9ucydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9ucycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9ucycsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBsaXN0IG9mIGFsbCBkZWJ1ZyBjb25maWd1cmF0aW9ucyBuZWVkcyB0byBiZSBjcmVhdGVkIChhbmQgYWxsIHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zIG1ldGhvZHMgZm9yIHRoZSBcImR5bmFtaWNcIiBzY29wZSBuZWVkIHRvIGJlIGNhbGxlZCkuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9ucydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25EZWJ1Z1Jlc29sdmUnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uRGVidWdSZXNvbHZlJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIGRlYnVnIHNlc3Npb24gd2l0aCB0aGUgc3BlY2lmaWMgdHlwZSBpcyBhYm91dCB0byBiZSBsYXVuY2hlZCAoYW5kIGEgY29ycmVzcG9uZGluZyByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uIG1ldGhvZCBuZWVkcyB0byBiZSBjYWxsZWQpLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uRGVidWdSZXNvbHZlOiR7Njp0eXBlfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25EZWJ1Z0FkYXB0ZXJQcm90b2NvbFRyYWNrZXInLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uRGVidWdBZGFwdGVyUHJvdG9jb2xUcmFja2VyJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIGRlYnVnIHNlc3Npb24gd2l0aCB0aGUgc3BlY2lmaWMgdHlwZSBpcyBhYm91dCB0byBiZSBsYXVuY2hlZCBhbmQgYSBkZWJ1ZyBwcm90b2NvbCB0cmFja2VyIG1pZ2h0IGJlIG5lZWRlZC4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkRlYnVnQWRhcHRlclByb3RvY29sVHJhY2tlcjokezY6dHlwZX0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ3dvcmtzcGFjZUNvbnRhaW5zJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy53b3Jrc3BhY2VDb250YWlucycsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBmb2xkZXIgaXMgb3BlbmVkIHRoYXQgY29udGFpbnMgYXQgbGVhc3QgYSBmaWxlIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgZ2xvYiBwYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ3dvcmtzcGFjZUNvbnRhaW5zOiR7NDpmaWxlUGF0dGVybn0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uU3RhcnR1cEZpbmlzaGVkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblN0YXJ0dXBGaW5pc2hlZCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgYWZ0ZXIgdGhlIHN0YXJ0LXVwIGZpbmlzaGVkIChhZnRlciBhbGwgYCpgIGFjdGl2YXRlZCBleHRlbnNpb25zIGhhdmUgZmluaXNoZWQgYWN0aXZhdGluZykuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25TdGFydHVwRmluaXNoZWQnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uVGFza1R5cGUnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uVGFza1R5cGUnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIHRhc2tzIG9mIGEgY2VydGFpbiB0eXBlIG5lZWQgdG8gYmUgbGlzdGVkIG9yIHJlc29sdmVkLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uVGFza1R5cGU6JHsxOnRhc2tUeXBlfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25GaWxlU3lzdGVtJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkZpbGVTeXN0ZW0nLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgZmlsZSBvciBmb2xkZXIgaXMgYWNjZXNzZWQgd2l0aCB0aGUgZ2l2ZW4gc2NoZW1lLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uRmlsZVN5c3RlbTokezE6c2NoZW1lfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25FZGl0U2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25FZGl0U2Vzc2lvbicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYW4gZWRpdCBzZXNzaW9uIGlzIGFjY2Vzc2VkIHdpdGggdGhlIGdpdmVuIHNjaGVtZS4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkVkaXRTZXNzaW9uOiR7MTpzY2hlbWV9J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblNlYXJjaCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25TZWFyY2gnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgc2VhcmNoIGlzIHN0YXJ0ZWQgaW4gdGhlIGZvbGRlciB3aXRoIHRoZSBnaXZlbiBzY2hlbWUuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25TZWFyY2g6JHs3OnNjaGVtZX0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uVmlldycsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25WaWV3OiR7NTp2aWV3SWR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblZpZXcnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIHRoZSBzcGVjaWZpZWQgdmlldyBpcyBleHBhbmRlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25VcmknLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uVXJpJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblVyaScsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBzeXN0ZW0td2lkZSBVcmkgZGlyZWN0ZWQgdG93YXJkcyB0aGlzIGV4dGVuc2lvbiBpcyBvcGVuLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbk9wZW5FeHRlcm5hbFVyaScsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25PcGVuRXh0ZXJuYWxVcmknLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uT3BlbkV4dGVybmFsVXJpJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIGV4dGVybmFsIHVyaSAoc3VjaCBhcyBhbiBodHRwIG9yIGh0dHBzIGxpbmspIGlzIGJlaW5nIG9wZW5lZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25DdXN0b21FZGl0b3InLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uQ3VzdG9tRWRpdG9yOiR7OTp2aWV3VHlwZX0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uQ3VzdG9tRWRpdG9yJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciB0aGUgc3BlY2lmaWVkIGN1c3RvbSBlZGl0b3IgYmVjb21lcyB2aXNpYmxlLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbk5vdGVib29rJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbk5vdGVib29rOiR7MTp0eXBlfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25Ob3RlYm9vaycsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgdGhlIHNwZWNpZmllZCBub3RlYm9vayBkb2N1bWVudCBpcyBvcGVuZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uQXV0aGVudGljYXRpb25SZXF1ZXN0Jyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkF1dGhlbnRpY2F0aW9uUmVxdWVzdDokezExOmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZH0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uQXV0aGVudGljYXRpb25SZXF1ZXN0JywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBzZXNzaW9ucyBhcmUgcmVxdWVzdGVkIGZyb20gdGhlIHNwZWNpZmllZCBhdXRoZW50aWNhdGlvbiBwcm92aWRlci4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblJlbmRlcmVyJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblJlbmRlcmVyJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIG5vdGVib29rIG91dHB1dCByZW5kZXJlciBpcyB1c2VkLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uUmVuZGVyZXI6JHsxMTpyZW5kZXJlcklkfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25UZXJtaW5hbFByb2ZpbGUnLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uVGVybWluYWxQcm9maWxlOiR7MTp0ZXJtaW5hbElkfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25UZXJtaW5hbFByb2ZpbGUnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSBzcGVjaWZpYyB0ZXJtaW5hbCBwcm9maWxlIGlzIGxhdW5jaGVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblRlcm1pbmFsUXVpY2tGaXhSZXF1ZXN0Jyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblRlcm1pbmFsUXVpY2tGaXhSZXF1ZXN0OiR7MTpxdWlja0ZpeElkfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25UZXJtaW5hbFF1aWNrRml4UmVxdWVzdCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbiBhIGNvbW1hbmQgbWF0Y2hlcyB0aGUgc2VsZWN0b3IgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSUQnKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25XYWxrdGhyb3VnaCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25XYWxrdGhyb3VnaDokezE6d2Fsa3Rocm91Z2hJRH0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uV2Fsa3Rocm91Z2gnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSBzcGVjaWZpZWQgd2Fsa3Rocm91Z2ggaXMgb3BlbmVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbklzc3VlUmVwb3J0ZXJPcGVuZWQnLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uSXNzdWVSZXBvcnRlck9wZW5lZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25Jc3N1ZVJlcG9ydGVyT3BlbmVkJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIHRoZSBpc3N1ZSByZXBvcnRlciBpcyBvcGVuZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uQ2hhdFBhcnRpY2lwYW50Jyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkNoYXRQYXJ0aWNpcGFudDokezE6cGFydGljaXBhbnRJZH0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uQ2hhdFBhcnRpY2lwYW50JywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIHRoZSBzcGVjaWZpZWQgY2hhdCBwYXJ0aWNpcGFudCBpcyBpbnZva2VkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkNoYXRDb250ZXh0UHJvdmlkZXInLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uQ2hhdENvbnRleHRQcm92aWRlcjokezE6Y29udGV4dFByb3ZpZGVySWR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkNoYXRDb250ZXh0UHJvdmlkZXInLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gdGhlIHNwZWNpZmllZCBjaGF0IGNvbnRleHQgcHJvdmlkZXIgaXMgaW52b2tlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXI6JHsxOnZlbmRvcn0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbiBhIGNoYXQgbW9kZWwgcHJvdmlkZXIgZm9yIHRoZSBnaXZlbiB2ZW5kb3IgaXMgcmVxdWVzdGVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkxhbmd1YWdlTW9kZWxUb29sJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkxhbmd1YWdlTW9kZWxUb29sOiR7MTp0b29sSWR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkxhbmd1YWdlTW9kZWxUb29sJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIHRoZSBzcGVjaWZpZWQgbGFuZ3VhZ2UgbW9kZWwgdG9vbCBpcyBpbnZva2VkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblRlcm1pbmFsJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblRlcm1pbmFsOnsxOnNoZWxsVHlwZX0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uVGVybWluYWwnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSB0ZXJtaW5hbCBvZiB0aGUgZ2l2ZW4gc2hlbGwgdHlwZSBpcyBvcGVuZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uVGVybWluYWxTaGVsbEludGVncmF0aW9uJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbjokezE6c2hlbGxUeXBlfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24nLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gdGVybWluYWwgc2hlbGwgaW50ZWdyYXRpb24gaXMgYWN0aXZhdGVkIGZvciB0aGUgZ2l2ZW4gc2hlbGwgdHlwZS4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25NY3BDb2xsZWN0aW9uJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbk1jcENvbGxlY3Rpb24nLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgdG9vbCBmcm9tIHRoZSBNQ1Agc2VydmVyIGlzIHJlcXVlc3RlZC4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbk1jcENvbGxlY3Rpb246JHsyOmNvbGxlY3Rpb25JZH0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICcqJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5zdGFyJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCBvbiBWUyBDb2RlIHN0YXJ0dXAuIFRvIGVuc3VyZSBhIGdyZWF0IGVuZCB1c2VyIGV4cGVyaWVuY2UsIHBsZWFzZSB1c2UgdGhpcyBhY3RpdmF0aW9uIGV2ZW50IGluIHlvdXIgZXh0ZW5zaW9uIG9ubHkgd2hlbiBubyBvdGhlciBhY3RpdmF0aW9uIGV2ZW50cyBjb21iaW5hdGlvbiB3b3JrcyBpbiB5b3VyIHVzZS1jYXNlLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJyonXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0YmFkZ2VzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5iYWRnZXMnLCAnQXJyYXkgb2YgYmFkZ2VzIHRvIGRpc3BsYXkgaW4gdGhlIHNpZGViYXIgb2YgdGhlIE1hcmtldHBsYWNlXFwncyBleHRlbnNpb24gcGFnZS4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRyZXF1aXJlZDogWyd1cmwnLCAnaHJlZicsICdkZXNjcmlwdGlvbiddLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dXJsOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYmFkZ2VzLnVybCcsICdCYWRnZSBpbWFnZSBVUkwuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhyZWY6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5iYWRnZXMuaHJlZicsICdCYWRnZSBsaW5rLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmJhZGdlcy5kZXNjcmlwdGlvbicsICdCYWRnZSBkZXNjcmlwdGlvbi4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0bWFya2Rvd246IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5tYXJrZG93bicsIFwiQ29udHJvbHMgdGhlIE1hcmtkb3duIHJlbmRlcmluZyBlbmdpbmUgdXNlZCBpbiB0aGUgTWFya2V0cGxhY2UuIEVpdGhlciBnaXRodWIgKGRlZmF1bHQpIG9yIHN0YW5kYXJkLlwiKSxcblx0XHRcdGVudW06IFsnZ2l0aHViJywgJ3N0YW5kYXJkJ10sXG5cdFx0XHRkZWZhdWx0OiAnZ2l0aHViJ1xuXHRcdH0sXG5cdFx0cW5hOiB7XG5cdFx0XHRkZWZhdWx0OiAnbWFya2V0cGxhY2UnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5xbmEnLCBcIkNvbnRyb2xzIHRoZSBRJkEgbGluayBpbiB0aGUgTWFya2V0cGxhY2UuIFNldCB0byBtYXJrZXRwbGFjZSB0byBlbmFibGUgdGhlIGRlZmF1bHQgTWFya2V0cGxhY2UgUSAmIEEgc2l0ZS4gU2V0IHRvIGEgc3RyaW5nIHRvIHByb3ZpZGUgdGhlIFVSTCBvZiBhIGN1c3RvbSBRICYgQSBzaXRlLiBTZXQgdG8gZmFsc2UgdG8gZGlzYWJsZSBRICYgQSBhbHRvZ2V0aGVyLlwiKSxcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdib29sZWFuJ10sXG5cdFx0XHRcdFx0ZW51bTogWydtYXJrZXRwbGFjZScsIGZhbHNlXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0ZXh0ZW5zaW9uRGVwZW5kZW5jaWVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmV4dGVuc2lvbkRlcGVuZGVuY2llcycsICdEZXBlbmRlbmNpZXMgdG8gb3RoZXIgZXh0ZW5zaW9ucy4gVGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uIGlzIGFsd2F5cyAke3B1Ymxpc2hlcn0uJHtuYW1lfS4gRm9yIGV4YW1wbGU6IHZzY29kZS5jc2hhcnAuJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0cGF0dGVybjogRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTlxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZXh0ZW5zaW9uQWZmaW5pdHk6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uZXh0ZW5zaW9uQWZmaW5pdHknLCAnRXh0ZW5zaW9ucyB0aGF0IHRoaXMgZXh0ZW5zaW9uIHNob3VsZCBiZSBjb2xvY2F0ZWQgd2l0aCBpbiB0aGUgc2FtZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzIGlmIHBvc3NpYmxlLiBUaGUgaWRlbnRpZmllciBvZiBhbiBleHRlbnNpb24gaXMgYWx3YXlzICR7cHVibGlzaGVyfS4ke25hbWV9LiBGb3IgZXhhbXBsZTogdnNjb2RlLmdpdC4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRwYXR0ZXJuOiBFWFRFTlNJT05fSURFTlRJRklFUl9QQVRURVJOXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRleHRlbnNpb25QYWNrOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmV4dGVuc2lvblBhY2snLCBcIkEgc2V0IG9mIGV4dGVuc2lvbnMgdGhhdCBjYW4gYmUgaW5zdGFsbGVkIHRvZ2V0aGVyLiBUaGUgaWRlbnRpZmllciBvZiBhbiBleHRlbnNpb24gaXMgYWx3YXlzICR7cHVibGlzaGVyfS4ke25hbWV9LiBGb3IgZXhhbXBsZTogdnNjb2RlLmNzaGFycC5cIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0cGF0dGVybjogRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTlxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZXh0ZW5zaW9uS2luZDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uS2luZCcsIFwiRGVmaW5lIHRoZSBraW5kIG9mIGFuIGV4dGVuc2lvbi4gYHVpYCBleHRlbnNpb25zIGFyZSBpbnN0YWxsZWQgYW5kIHJ1biBvbiB0aGUgbG9jYWwgbWFjaGluZSB3aGlsZSBgd29ya3NwYWNlYCBleHRlbnNpb25zIHJ1biBvbiB0aGUgcmVtb3RlLlwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogZXh0ZW5zaW9uS2luZFNjaGVtYSxcblx0XHRcdGRlZmF1bHQ6IFsnd29ya3NwYWNlJ10sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IFsndWknXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHRlbnNpb25LaW5kLnVpJywgXCJEZWZpbmUgYW4gZXh0ZW5zaW9uIHdoaWNoIGNhbiBydW4gb25seSBvbiB0aGUgbG9jYWwgbWFjaGluZSB3aGVuIGNvbm5lY3RlZCB0byByZW1vdGUgd2luZG93LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keTogWyd3b3Jrc3BhY2UnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHRlbnNpb25LaW5kLndvcmtzcGFjZScsIFwiRGVmaW5lIGFuIGV4dGVuc2lvbiB3aGljaCBjYW4gcnVuIG9ubHkgb24gdGhlIHJlbW90ZSBtYWNoaW5lIHdoZW4gY29ubmVjdGVkIHJlbW90ZSB3aW5kb3cuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiBbJ3VpJywgJ3dvcmtzcGFjZSddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbktpbmQudWktd29ya3NwYWNlJywgXCJEZWZpbmUgYW4gZXh0ZW5zaW9uIHdoaWNoIGNhbiBydW4gb24gZWl0aGVyIHNpZGUsIHdpdGggYSBwcmVmZXJlbmNlIHRvd2FyZHMgcnVubmluZyBvbiB0aGUgbG9jYWwgbWFjaGluZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IFsnd29ya3NwYWNlJywgJ3VpJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uS2luZC53b3Jrc3BhY2UtdWknLCBcIkRlZmluZSBhbiBleHRlbnNpb24gd2hpY2ggY2FuIHJ1biBvbiBlaXRoZXIgc2lkZSwgd2l0aCBhIHByZWZlcmVuY2UgdG93YXJkcyBydW5uaW5nIG9uIHRoZSByZW1vdGUgbWFjaGluZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IFtdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbktpbmQuZW1wdHknLCBcIkRlZmluZSBhbiBleHRlbnNpb24gd2hpY2ggY2Fubm90IHJ1biBpbiBhIHJlbW90ZSBjb250ZXh0LCBuZWl0aGVyIG9uIHRoZSBsb2NhbCwgbm9yIG9uIHRoZSByZW1vdGUgbWFjaGluZS5cIilcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcycsIFwiRGVjbGFyZSB0aGUgc2V0IG9mIHN1cHBvcnRlZCBjYXBhYmlsaXRpZXMgYnkgdGhlIGV4dGVuc2lvbi5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy52aXJ0dWFsV29ya3NwYWNlcycsIFwiRGVjbGFyZXMgd2hldGhlciB0aGUgZXh0ZW5zaW9uIHNob3VsZCBiZSBlbmFibGVkIGluIHZpcnR1YWwgd29ya3NwYWNlcy4gQSB2aXJ0dWFsIHdvcmtzcGFjZSBpcyBhIHdvcmtzcGFjZSB3aGljaCBpcyBub3QgYmFja2VkIGJ5IGFueSBvbi1kaXNrIHJlc291cmNlcy4gV2hlbiBmYWxzZSwgdGhpcyBleHRlbnNpb24gd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGRpc2FibGVkIGluIHZpcnR1YWwgd29ya3NwYWNlcy4gRGVmYXVsdCBpcyB0cnVlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnbGltaXRlZCcsIGJvZHk6IHsgc3VwcG9ydGVkOiAnJHsxOmxpbWl0ZWR9JywgZGVzY3JpcHRpb246ICckezJ9JyB9IH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnZmFsc2UnLCBib2R5OiB7IHN1cHBvcnRlZDogZmFsc2UsIGRlc2NyaXB0aW9uOiAnJHsyfScgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZS52YWx1ZU9mLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN1cHBvcnRlZDoge1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnZpcnR1YWxXb3Jrc3BhY2VzLnN1cHBvcnRlZCcsIFwiRGVjbGFyZXMgdGhlIGxldmVsIG9mIHN1cHBvcnQgZm9yIHZpcnR1YWwgd29ya3NwYWNlcyBieSB0aGUgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnYm9vbGVhbiddLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2xpbWl0ZWQnLCB0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnZpcnR1YWxXb3Jrc3BhY2VzLnN1cHBvcnRlZC5saW1pdGVkJywgXCJUaGUgZXh0ZW5zaW9uIHdpbGwgYmUgZW5hYmxlZCBpbiB2aXJ0dWFsIHdvcmtzcGFjZXMgd2l0aCBzb21lIGZ1bmN0aW9uYWxpdHkgZGlzYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudmlydHVhbFdvcmtzcGFjZXMuc3VwcG9ydGVkLnRydWUnLCBcIlRoZSBleHRlbnNpb24gd2lsbCBiZSBlbmFibGVkIGluIHZpcnR1YWwgd29ya3NwYWNlcyB3aXRoIGFsbCBmdW5jdGlvbmFsaXR5IGVuYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudmlydHVhbFdvcmtzcGFjZXMuc3VwcG9ydGVkLmZhbHNlJywgXCJUaGUgZXh0ZW5zaW9uIHdpbGwgbm90IGJlIGVuYWJsZWQgaW4gdmlydHVhbCB3b3Jrc3BhY2VzLlwiKSxcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnZpcnR1YWxXb3Jrc3BhY2VzLmRlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIGhvdyB2aXJ0dWFsIHdvcmtzcGFjZXMgYWZmZWN0cyB0aGUgZXh0ZW5zaW9ucyBiZWhhdmlvciBhbmQgd2h5IGl0IGlzIG5lZWRlZC4gVGhpcyBvbmx5IGFwcGxpZXMgd2hlbiBgc3VwcG9ydGVkYCBpcyBub3QgYHRydWVgLlwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVudHJ1c3RlZFdvcmtzcGFjZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzJywgJ0RlY2xhcmVzIGhvdyB0aGUgZXh0ZW5zaW9uIHNob3VsZCBiZSBoYW5kbGVkIGluIHVudHJ1c3RlZCB3b3Jrc3BhY2VzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3N1cHBvcnRlZCddLFxuXHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHRcdFx0eyBib2R5OiB7IHN1cHBvcnRlZDogJyR7MTpsaW1pdGVkfScsIGRlc2NyaXB0aW9uOiAnJHsyfScgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0c3VwcG9ydGVkOiB7XG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudW50cnVzdGVkV29ya3NwYWNlcy5zdXBwb3J0ZWQnLCBcIkRlY2xhcmVzIHRoZSBsZXZlbCBvZiBzdXBwb3J0IGZvciB1bnRydXN0ZWQgd29ya3NwYWNlcyBieSB0aGUgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnYm9vbGVhbiddLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2xpbWl0ZWQnLCB0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnVudHJ1c3RlZFdvcmtzcGFjZXMuc3VwcG9ydGVkLmxpbWl0ZWQnLCBcIlRoZSBleHRlbnNpb24gd2lsbCBiZSBlbmFibGVkIGluIHVudHJ1c3RlZCB3b3Jrc3BhY2VzIHdpdGggc29tZSBmdW5jdGlvbmFsaXR5IGRpc2FibGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnVudHJ1c3RlZFdvcmtzcGFjZXMuc3VwcG9ydGVkLnRydWUnLCBcIlRoZSBleHRlbnNpb24gd2lsbCBiZSBlbmFibGVkIGluIHVudHJ1c3RlZCB3b3Jrc3BhY2VzIHdpdGggYWxsIGZ1bmN0aW9uYWxpdHkgZW5hYmxlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzLnN1cHBvcnRlZC5mYWxzZScsIFwiVGhlIGV4dGVuc2lvbiB3aWxsIG5vdCBiZSBlbmFibGVkIGluIHVudHJ1c3RlZCB3b3Jrc3BhY2VzLlwiKSxcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHJlc3RyaWN0ZWRDb25maWd1cmF0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzLnJlc3RyaWN0ZWRDb25maWd1cmF0aW9ucycsIFwiQSBsaXN0IG9mIGNvbmZpZ3VyYXRpb24ga2V5cyBjb250cmlidXRlZCBieSB0aGUgZXh0ZW5zaW9uIHRoYXQgc2hvdWxkIG5vdCB1c2Ugd29ya3NwYWNlIHZhbHVlcyBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcy5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnVudHJ1c3RlZFdvcmtzcGFjZXMuZGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2YgaG93IHdvcmtzcGFjZSB0cnVzdCBhZmZlY3RzIHRoZSBleHRlbnNpb25zIGJlaGF2aW9yIGFuZCB3aHkgaXQgaXMgbmVlZGVkLiBUaGlzIG9ubHkgYXBwbGllcyB3aGVuIGBzdXBwb3J0ZWRgIGlzIG5vdCBgdHJ1ZWAuXCIpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c3BvbnNvcjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zcG9uc29yJywgXCJTcGVjaWZ5IHRoZSBsb2NhdGlvbiBmcm9tIHdoZXJlIHVzZXJzIGNhbiBzcG9uc29yIHlvdXIgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdHsgYm9keTogeyB1cmw6ICckezE6aHR0cHM6fScgfSB9LFxuXHRcdFx0XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3VybCc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnNwb25zb3IudXJsJywgXCJVUkwgZnJvbSB3aGVyZSB1c2VycyBjYW4gc3BvbnNvciB5b3VyIGV4dGVuc2lvbi4gSXQgbXVzdCBiZSBhIHZhbGlkIFVSTCB3aXRoIGEgSFRUUCBvciBIVFRQUyBwcm90b2NvbC4gRXhhbXBsZSB2YWx1ZTogaHR0cHM6Ly9naXRodWIuY29tL3Nwb25zb3JzL252YWNjZXNzXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRzY3JpcHRzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3ZzY29kZTpwcmVwdWJsaXNoJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uc2NyaXB0cy5wcmVwdWJsaXNoJywgJ1NjcmlwdCBleGVjdXRlZCBiZWZvcmUgdGhlIHBhY2thZ2UgaXMgcHVibGlzaGVkIGFzIGEgVlMgQ29kZSBleHRlbnNpb24uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0J3ZzY29kZTp1bmluc3RhbGwnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5zY3JpcHRzLnVuaW5zdGFsbCcsICdVbmluc3RhbGwgaG9vayBmb3IgVlMgQ29kZSBleHRlbnNpb24uIFNjcmlwdCB0aGF0IGdldHMgZXhlY3V0ZWQgd2hlbiB0aGUgZXh0ZW5zaW9uIGlzIGNvbXBsZXRlbHkgdW5pbnN0YWxsZWQgZnJvbSBWUyBDb2RlIHdoaWNoIGlzIHdoZW4gVlMgQ29kZSBpcyByZXN0YXJ0ZWQgKHNodXRkb3duIGFuZCBzdGFydCkgYWZ0ZXIgdGhlIGV4dGVuc2lvbiBpcyB1bmluc3RhbGxlZC4gT25seSBOb2RlIHNjcmlwdHMgYXJlIHN1cHBvcnRlZC4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpY29uOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uaWNvbicsICdUaGUgcGF0aCB0byBhIDEyOHgxMjggcGl4ZWwgaWNvbi4nKVxuXHRcdH0sXG5cdFx0bDEwbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAndnNjb2RlLmV4dGVuc2lvbi5sMTBuJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCd7TG9ja2VkPVwiYnVuZGxlLmwxMG4uX2xvY2FsZV8uanNvblwifScsXG5cdFx0XHRcdFx0J3tMb2NrZWQ9XCJ2c2NvZGUubDEwbiBBUElcIn0nXG5cdFx0XHRcdF1cblx0XHRcdH0sICdUaGUgcmVsYXRpdmUgcGF0aCB0byBhIGZvbGRlciBjb250YWluaW5nIGxvY2FsaXphdGlvbiAoYnVuZGxlLmwxMG4uKi5qc29uKSBmaWxlcy4gTXVzdCBiZSBzcGVjaWZpZWQgaWYgeW91IGFyZSB1c2luZyB0aGUgdnNjb2RlLmwxMG4gQVBJLicpXG5cdFx0fSxcblx0XHRwcmljaW5nOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5wcmljaW5nJywgJ1RoZSBwcmljaW5nIGluZm9ybWF0aW9uIGZvciB0aGUgZXh0ZW5zaW9uLiBDYW4gYmUgRnJlZSAoZGVmYXVsdCkgb3IgVHJpYWwuIEZvciBtb3JlIGRldGFpbHMgdmlzaXQ6IGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS93b3JraW5nLXdpdGgtZXh0ZW5zaW9ucy9wdWJsaXNoaW5nLWV4dGVuc2lvbiNleHRlbnNpb24tcHJpY2luZy1sYWJlbCcpLFxuXHRcdFx0ZW51bTogWydGcmVlJywgJ1RyaWFsJ10sXG5cdFx0XHRkZWZhdWx0OiAnRnJlZSdcblx0XHR9XG5cdH1cbn07XG5cbmV4cG9ydCB0eXBlIHJlbW92ZUFycmF5PFQ+ID0gVCBleHRlbmRzIEFycmF5PGluZmVyIFg+ID8gWCA6IFQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblBvaW50RGVzY3JpcHRvcjxUPiB7XG5cdGV4dGVuc2lvblBvaW50OiBzdHJpbmc7XG5cdGRlcHM/OiBJRXh0ZW5zaW9uUG9pbnQ8dW5rbm93bj5bXTtcblx0anNvblNjaGVtYTogSUpTT05TY2hlbWE7XG5cdGRlZmF1bHRFeHRlbnNpb25LaW5kPzogRXh0ZW5zaW9uS2luZFtdO1xuXHRjYW5IYW5kbGVSZXNvbHZlcj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBIGZ1bmN0aW9uIHdoaWNoIHJ1bnMgYmVmb3JlIHRoZSBleHRlbnNpb24gcG9pbnQgaGFzIGJlZW4gdmFsaWRhdGVkIGFuZCB3aGljaFxuXHQgKiBzaG91bGQgY29sbGVjdCBhdXRvbWF0aWMgYWN0aXZhdGlvbiBldmVudHMgZnJvbSB0aGUgY29udHJpYnV0aW9uLlxuXHQgKi9cblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcj86IElBY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yPHJlbW92ZUFycmF5PFQ+Pjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNSZWdpc3RyeUltcGwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblBvaW50cyA9IG5ldyBNYXA8c3RyaW5nLCBFeHRlbnNpb25Qb2ludDxhbnk+PigpO1xuXG5cdHB1YmxpYyByZWdpc3RlckV4dGVuc2lvblBvaW50PFQ+KGRlc2M6IElFeHRlbnNpb25Qb2ludERlc2NyaXB0b3I8VD4pOiBJRXh0ZW5zaW9uUG9pbnQ8VD4ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb25Qb2ludHMuaGFzKGRlc2MuZXh0ZW5zaW9uUG9pbnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0R1cGxpY2F0ZSBleHRlbnNpb24gcG9pbnQ6ICcgKyBkZXNjLmV4dGVuc2lvblBvaW50KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEV4dGVuc2lvblBvaW50PFQ+KGRlc2MuZXh0ZW5zaW9uUG9pbnQsIGRlc2MuZGVmYXVsdEV4dGVuc2lvbktpbmQsIGRlc2MuY2FuSGFuZGxlUmVzb2x2ZXIpO1xuXHRcdHRoaXMuX2V4dGVuc2lvblBvaW50cy5zZXQoZGVzYy5leHRlbnNpb25Qb2ludCwgcmVzdWx0KTtcblx0XHRpZiAoZGVzYy5hY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yKSB7XG5cdFx0XHRJbXBsaWNpdEFjdGl2YXRpb25FdmVudHMucmVnaXN0ZXIoZGVzYy5leHRlbnNpb25Qb2ludCwgZGVzYy5hY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yKTtcblx0XHR9XG5cblx0XHRzY2hlbWEucHJvcGVydGllcyFbJ2NvbnRyaWJ1dGVzJ10ucHJvcGVydGllcyFbZGVzYy5leHRlbnNpb25Qb2ludF0gPSBkZXNjLmpzb25TY2hlbWE7XG5cdFx0c2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoc2NoZW1hSWQsIHNjaGVtYSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEV4dGVuc2lvblBvaW50cygpOiBFeHRlbnNpb25Qb2ludDx1bmtub3duPltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9leHRlbnNpb25Qb2ludHMudmFsdWVzKCkpO1xuXHR9XG59XG5cbmNvbnN0IFBSRXh0ZW5zaW9ucyA9IHtcblx0RXh0ZW5zaW9uc1JlZ2lzdHJ5OiAnRXh0ZW5zaW9uc1JlZ2lzdHJ5J1xufTtcblJlZ2lzdHJ5LmFkZChQUkV4dGVuc2lvbnMuRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBuZXcgRXh0ZW5zaW9uc1JlZ2lzdHJ5SW1wbCgpKTtcbmV4cG9ydCBjb25zdCBFeHRlbnNpb25zUmVnaXN0cnk6IEV4dGVuc2lvbnNSZWdpc3RyeUltcGwgPSBSZWdpc3RyeS5hcyhQUkV4dGVuc2lvbnMuRXh0ZW5zaW9uc1JlZ2lzdHJ5KTtcblxuc2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoc2NoZW1hSWQsIHNjaGVtYSk7XG5cblxuc2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEocHJvZHVjdFNjaGVtYUlkLCB7XG5cdHByb3BlcnRpZXM6IHtcblx0XHRleHRlbnNpb25FbmFibGVkQXBpUHJvcG9zYWxzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwcm9kdWN0LmV4dGVuc2lvbkVuYWJsZWRBcGlQcm9wb3NhbHMnLCBcIkFQSSBwcm9wb3NhbHMgdGhhdCB0aGUgcmVzcGVjdGl2ZSBleHRlbnNpb25zIGNhbiBmcmVlbHkgdXNlLlwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge30sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRhbnlPZjogW3tcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IE9iamVjdC5rZXlzKGFsbEFwaVByb3Bvc2FscyksXG5cdFx0XHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IE9iamVjdC52YWx1ZXMoYWxsQXBpUHJvcG9zYWxzKS5tYXAodmFsdWUgPT4gdmFsdWUucHJvcG9zYWwpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFFbEMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsa0JBQTZDO0FBQ3RELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQWdDLHNCQUFzQiw4QkFBOEI7QUFFcEYsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBNEQ7QUFFckUsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxpQkFBaUIsU0FBUyxHQUE4QixXQUFXLGdCQUFnQjtBQUVsRixNQUFNLDBCQUEwQjtBQUFBLEVBTXRDLFlBQ0MsZ0JBQ0EsV0FDQSxrQkFDQztBQUNELFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssYUFBYTtBQUNsQixTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFUSxLQUFLLE1BQWdCLFNBQXVCO0FBQ25ELFNBQUssZ0JBQWdCO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxhQUFhLEtBQUssV0FBVztBQUFBLE1BQzdCLGtCQUFrQixLQUFLO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLE1BQU0sU0FBdUI7QUFDbkMsU0FBSyxLQUFLLFNBQVMsT0FBTyxPQUFPO0FBQUEsRUFDbEM7QUFBQSxFQUVPLEtBQUssU0FBdUI7QUFDbEMsU0FBSyxLQUFLLFNBQVMsU0FBUyxPQUFPO0FBQUEsRUFDcEM7QUFBQSxFQUVPLEtBQUssU0FBdUI7QUFDbEMsU0FBSyxLQUFLLFNBQVMsTUFBTSxPQUFPO0FBQUEsRUFDakM7QUFDRDtBQWlCTyxNQUFNLHdCQUEyQjtBQUFBLEVBMkJ2QyxZQUNpQixPQUNBLFNBQ2Y7QUFGZTtBQUNBO0FBQUEsRUFDYjtBQUFBLEVBNUJKLE9BQWUsT0FBVSxLQUFnRTtBQUN4RixVQUFNLFNBQVMsSUFBSSx1QkFBdUI7QUFDMUMsYUFBUyxJQUFJLEdBQUcsTUFBTSxJQUFJLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDL0MsYUFBTyxJQUFJLElBQUksQ0FBQyxFQUFFLFlBQVksVUFBVTtBQUFBLElBQ3pDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWMsUUFBVyxVQUFvRCxTQUF3RTtBQUNwSixRQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsUUFBUTtBQUNsQyxhQUFPLElBQUksd0JBQTJCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDbEQ7QUFDQSxRQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsUUFBUTtBQUNoQyxhQUFPLElBQUksd0JBQTJCLENBQUMsR0FBRyxRQUFRO0FBQUEsSUFDbkQ7QUFFQSxVQUFNLGNBQWMsS0FBSyxPQUFPLFFBQVE7QUFDeEMsVUFBTSxhQUFhLEtBQUssT0FBTyxPQUFPO0FBRXRDLFVBQU0sUUFBUSxRQUFRLE9BQU8sVUFBUSxDQUFDLFlBQVksSUFBSSxLQUFLLFlBQVksVUFBVSxDQUFDO0FBQ2xGLFVBQU0sVUFBVSxTQUFTLE9BQU8sVUFBUSxDQUFDLFdBQVcsSUFBSSxLQUFLLFlBQVksVUFBVSxDQUFDO0FBRXBGLFdBQU8sSUFBSSx3QkFBMkIsT0FBTyxPQUFPO0FBQUEsRUFDckQ7QUFNRDtBQUVPLE1BQU0sZUFBZ0Q7QUFBQSxFQVU1RCxZQUFZLE1BQWMsc0JBQW1ELG1CQUE2QjtBQUN6RyxTQUFLLE9BQU87QUFDWixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLFdBQVc7QUFDaEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsV0FBVyxTQUFpRDtBQUMzRCxRQUFJLEtBQUssYUFBYSxNQUFNO0FBQzNCLFlBQU0sSUFBSSxNQUFNLHNCQUFzQjtBQUFBLElBQ3ZDO0FBQ0EsU0FBSyxXQUFXO0FBQ2hCLFNBQUssUUFBUTtBQUViLFdBQU87QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUNkLGFBQUssV0FBVztBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFlBQVksT0FBdUM7QUFDbEQsU0FBSyxTQUFTLHdCQUF3QixRQUFRLEtBQUssUUFBUSxLQUFLO0FBQ2hFLFNBQUssU0FBUztBQUNkLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVRLFVBQWdCO0FBQ3ZCLFFBQUksS0FBSyxhQUFhLFFBQVEsS0FBSyxXQUFXLFFBQVEsS0FBSyxXQUFXLE1BQU07QUFDM0U7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFdBQUssU0FBUyxLQUFLLFFBQVEsS0FBSyxNQUFNO0FBQUEsSUFDdkMsU0FBUyxLQUFLO0FBQ2Isd0JBQWtCLEdBQUc7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sc0JBQW1DO0FBQUEsRUFDeEMsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLElBQ0w7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUFBLEVBQ0Esa0JBQWtCO0FBQUEsSUFDakIsSUFBSSxTQUFTLE1BQU0sOEdBQThHO0FBQUEsSUFDakksSUFBSSxTQUFTLGFBQWEsOEdBQThHO0FBQUEsRUFDekk7QUFDRDtBQUVBLE1BQU0sV0FBVztBQUNWLE1BQU0sU0FBc0I7QUFBQSxFQUNsQyxZQUFZO0FBQUEsSUFDWCxTQUFTO0FBQUEsTUFDUixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw0QkFBNEIsdUJBQXVCO0FBQUEsTUFDN0UsWUFBWTtBQUFBLFFBQ1gsVUFBVTtBQUFBLFVBQ1QsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsbUNBQW1DLG9NQUFvTTtBQUFBLFVBQ2pRLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFdBQVc7QUFBQSxNQUNWLGFBQWEsSUFBSSxTQUFTLDhCQUE4Qix5Q0FBeUM7QUFBQSxNQUNqRyxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EsYUFBYTtBQUFBLE1BQ1osYUFBYSxJQUFJLFNBQVMsZ0NBQWdDLGlFQUFpRTtBQUFBLE1BQzNILE1BQU07QUFBQSxJQUNQO0FBQUEsSUFDQSxZQUFZO0FBQUEsTUFDWCxhQUFhLElBQUksU0FBUywrQkFBK0IseUVBQXlFO0FBQUEsTUFDbEksTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ04sT0FBTztBQUFBLFVBQUM7QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLFlBQ1Asb0JBQW9CLElBQUksU0FBUyxrREFBa0Qsc0NBQXdDO0FBQUEsVUFDNUg7QUFBQSxRQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGVBQWU7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyx5Q0FBeUM7QUFBQSxNQUNyRyxZQUFZO0FBQUEsUUFDWCxPQUFPO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUyx3Q0FBd0MsMERBQTBEO0FBQUEsVUFDNUgsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLE9BQU87QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLHdDQUF3QyxrREFBa0Q7QUFBQSxVQUNwSCxNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsUUFBUSxPQUFPO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsYUFBYTtBQUFBLE1BQ1osYUFBYSxJQUFJLFNBQVMsZ0NBQWdDLHlFQUF5RTtBQUFBLE1BQ25JLE1BQU07QUFBQTtBQUFBLE1BRU4sWUFBWTtBQUFBO0FBQUEsTUFFWjtBQUFBLE1BQ0EsU0FBUyxDQUFDO0FBQUEsSUFDWDtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsNEJBQTRCLG1FQUFtRTtBQUFBLElBQzFIO0FBQUEsSUFDQSxtQkFBbUI7QUFBQSxNQUNsQixNQUFNO0FBQUEsTUFDTixvQkFBb0IsSUFBSSxTQUFTLGlEQUFpRCxvQ0FBb0M7QUFBQSxJQUN2SDtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIscUJBQXFCLElBQUksU0FBUyx3Q0FBd0MsOE5BQThOO0FBQUEsTUFDeFMsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sTUFBTSxPQUFPLEtBQUssZUFBZSxFQUFFLElBQUksa0JBQWdCLFlBQVk7QUFBQSxRQUNuRSwwQkFBMEIsT0FBTyxPQUFPLGVBQWUsRUFBRSxJQUFJLFdBQVMsTUFBTSxRQUFRO0FBQUEsTUFDckY7QUFBQSxJQUNEO0FBQUEsSUFDQSxLQUFLO0FBQUEsTUFDSixxQkFBcUIsSUFBSSxTQUFTLHdCQUF3Qix1TEFBdUw7QUFBQSxNQUNqUCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsTUFBTTtBQUFBLE1BQ2Isa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDZCQUE2QixpTEFBaUw7QUFBQSxNQUM1TjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGtCQUFrQjtBQUFBLE1BQ2pCLGFBQWEsSUFBSSxTQUFTLHFDQUFxQyw4Q0FBOEM7QUFBQSxNQUM3RyxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixpQkFBaUI7QUFBQSxVQUNoQjtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsb0RBQW9ELDRFQUE0RTtBQUFBLFlBQzFKLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsZ0RBQWdELGtHQUFrRztBQUFBLFlBQzVLLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsK0NBQStDLDBFQUEwRTtBQUFBLFlBQ25KLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsNkNBQTZDLGlIQUFpSDtBQUFBLFlBQ3hMLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsa0VBQWtFLDBJQUEwSTtBQUFBLFlBQ3RPLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsa0VBQWtFLHFMQUFxTDtBQUFBLFlBQ2pSLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsb0RBQW9ELGdMQUFnTDtBQUFBLFlBQzlQLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsbUVBQW1FLG1KQUFtSjtBQUFBLFlBQ2hQLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsdURBQXVELDRIQUE0SDtBQUFBLFlBQzdNLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsdURBQXVELHdIQUF3SDtBQUFBLFlBQ3pNLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsZ0RBQWdELDZGQUE2RjtBQUFBLFlBQ3ZLLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsa0RBQWtELDBGQUEwRjtBQUFBLFlBQ3RLLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsbURBQW1ELHlGQUF5RjtBQUFBLFlBQ3RLLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsOENBQThDLCtGQUErRjtBQUFBLFlBQ3ZLLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsNENBQTRDLHNFQUFzRTtBQUFBLFVBQzdJO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsMkNBQTJDLGlHQUFpRztBQUFBLFVBQ3ZLO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsdURBQXVELHNHQUFzRztBQUFBLFVBQ3hMO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsb0RBQW9ELG1GQUFtRjtBQUFBLFVBQ2xLO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsZ0RBQWdELGlGQUFpRjtBQUFBLFVBQzVKO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsNkRBQTZELHlHQUF5RztBQUFBLFVBQ2pNO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsZ0RBQWdELDBFQUEwRTtBQUFBLFlBQ3BKLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsdURBQXVELDJFQUEyRTtBQUFBLFVBQzdKO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsK0RBQStELHlGQUF5RjtBQUFBLFVBQ25MO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsbURBQW1ELHFFQUFxRTtBQUFBLFVBQ25KO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsMkRBQTJELGdFQUFnRTtBQUFBLFVBQ3RKO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsdURBQXVELDZFQUE2RTtBQUFBLFVBQy9KO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsMkRBQTJELGtGQUFrRjtBQUFBLFVBQ3hLO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsaUVBQWlFLDJGQUEyRjtBQUFBLFVBQ3ZMO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMseURBQXlELGdGQUFnRjtBQUFBLFVBQ3BLO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsZ0RBQWdELGdGQUFnRjtBQUFBLFVBQzNKO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsZ0VBQWdFLG9HQUFvRztBQUFBLFVBQy9MO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMscURBQXFELCtFQUErRTtBQUFBLFlBQzlKLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTztBQUFBLFlBQ1AsYUFBYSxJQUFJLFNBQVMsMENBQTBDLG9OQUFvTjtBQUFBLFlBQ3hSLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUywyQkFBMkIsZ0ZBQWlGO0FBQUEsTUFDdEksT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sVUFBVSxDQUFDLE9BQU8sUUFBUSxhQUFhO0FBQUEsUUFDdkMsWUFBWTtBQUFBLFVBQ1gsS0FBSztBQUFBLFlBQ0osTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsK0JBQStCLGtCQUFrQjtBQUFBLFVBQzVFO0FBQUEsVUFDQSxNQUFNO0FBQUEsWUFDTCxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyxnQ0FBZ0MsYUFBYTtBQUFBLFVBQ3hFO0FBQUEsVUFDQSxhQUFhO0FBQUEsWUFDWixNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyx1Q0FBdUMsb0JBQW9CO0FBQUEsVUFDdEY7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDZCQUE2QixzR0FBc0c7QUFBQSxNQUM3SixNQUFNLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDM0IsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLEtBQUs7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULGFBQWEsSUFBSSxTQUFTLHdCQUF3QixpTkFBaU47QUFBQSxNQUNuUSxPQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsTUFBTSxDQUFDLFVBQVUsU0FBUztBQUFBLFVBQzFCLE1BQU0sQ0FBQyxlQUFlLEtBQUs7QUFBQSxRQUM1QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLE1BQ3RCLGFBQWEsSUFBSSxTQUFTLDBDQUEwQyw4SEFBOEg7QUFBQSxNQUNsTSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFBQSxJQUNBLG1CQUFtQjtBQUFBLE1BQ2xCLGFBQWEsSUFBSSxTQUFTLHNDQUFzQyxpTUFBaU07QUFBQSxNQUNqUSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGVBQWU7QUFBQSxNQUNkLGFBQWEsSUFBSSxTQUFTLDhDQUE4QyxnSkFBZ0o7QUFBQSxNQUN4TixNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGVBQWU7QUFBQSxNQUNkLGFBQWEsSUFBSSxTQUFTLGlCQUFpQiw2SUFBNkk7QUFBQSxNQUN4TCxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsTUFDUCxTQUFTLENBQUMsV0FBVztBQUFBLE1BQ3JCLGlCQUFpQjtBQUFBLFFBQ2hCO0FBQUEsVUFDQyxNQUFNLENBQUMsSUFBSTtBQUFBLFVBQ1gsYUFBYSxJQUFJLFNBQVMsb0JBQW9CLDhGQUE4RjtBQUFBLFFBQzdJO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxDQUFDLFdBQVc7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUywyQkFBMkIsNEZBQTRGO0FBQUEsUUFDbEo7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLENBQUMsTUFBTSxXQUFXO0FBQUEsVUFDeEIsYUFBYSxJQUFJLFNBQVMsOEJBQThCLDJHQUEyRztBQUFBLFFBQ3BLO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxDQUFDLGFBQWEsSUFBSTtBQUFBLFVBQ3hCLGFBQWEsSUFBSSxTQUFTLDhCQUE4Qiw0R0FBNEc7QUFBQSxRQUNySztBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sQ0FBQztBQUFBLFVBQ1AsYUFBYSxJQUFJLFNBQVMsdUJBQXVCLDRHQUE0RztBQUFBLFFBQzlKO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLGNBQWM7QUFBQSxNQUNiLGFBQWEsSUFBSSxTQUFTLGlDQUFpQyw2REFBNkQ7QUFBQSxNQUN4SCxNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxtQkFBbUI7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUyxtREFBbUQsNFBBQTRQO0FBQUEsVUFDelUsTUFBTSxDQUFDLFdBQVcsUUFBUTtBQUFBLFVBQzFCLGlCQUFpQjtBQUFBLFlBQ2hCLEVBQUUsT0FBTyxXQUFXLE1BQU0sRUFBRSxXQUFXLGdCQUFnQixhQUFhLE9BQU8sRUFBRTtBQUFBLFlBQzdFLEVBQUUsT0FBTyxTQUFTLE1BQU0sRUFBRSxXQUFXLE9BQU8sYUFBYSxPQUFPLEVBQUU7QUFBQSxVQUNuRTtBQUFBLFVBQ0EsU0FBUyxLQUFLO0FBQUEsVUFDZCxZQUFZO0FBQUEsWUFDWCxXQUFXO0FBQUEsY0FDVixxQkFBcUIsSUFBSSxTQUFTLDZEQUE2RCx3RUFBd0U7QUFBQSxjQUN2SyxNQUFNLENBQUMsVUFBVSxTQUFTO0FBQUEsY0FDMUIsTUFBTSxDQUFDLFdBQVcsTUFBTSxLQUFLO0FBQUEsY0FDN0Isa0JBQWtCO0FBQUEsZ0JBQ2pCLElBQUksU0FBUyxxRUFBcUUsdUZBQXVGO0FBQUEsZ0JBQ3pLLElBQUksU0FBUyxrRUFBa0UscUZBQXFGO0FBQUEsZ0JBQ3BLLElBQUksU0FBUyxtRUFBbUUsMERBQTBEO0FBQUEsY0FDM0k7QUFBQSxZQUNEO0FBQUEsWUFDQSxhQUFhO0FBQUEsY0FDWixNQUFNO0FBQUEsY0FDTixxQkFBcUIsSUFBSSxTQUFTLCtEQUErRCxpSkFBaUo7QUFBQSxZQUNuUDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxxQkFBcUI7QUFBQSxVQUNwQixhQUFhLElBQUksU0FBUyxxREFBcUQsdUVBQXVFO0FBQUEsVUFDdEosTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLFdBQVc7QUFBQSxVQUN0QixpQkFBaUI7QUFBQSxZQUNoQixFQUFFLE1BQU0sRUFBRSxXQUFXLGdCQUFnQixhQUFhLE9BQU8sRUFBRTtBQUFBLFVBQzVEO0FBQUEsVUFDQSxZQUFZO0FBQUEsWUFDWCxXQUFXO0FBQUEsY0FDVixxQkFBcUIsSUFBSSxTQUFTLCtEQUErRCwwRUFBMEU7QUFBQSxjQUMzSyxNQUFNLENBQUMsVUFBVSxTQUFTO0FBQUEsY0FDMUIsTUFBTSxDQUFDLFdBQVcsTUFBTSxLQUFLO0FBQUEsY0FDN0Isa0JBQWtCO0FBQUEsZ0JBQ2pCLElBQUksU0FBUyx1RUFBdUUseUZBQXlGO0FBQUEsZ0JBQzdLLElBQUksU0FBUyxvRUFBb0UsdUZBQXVGO0FBQUEsZ0JBQ3hLLElBQUksU0FBUyxxRUFBcUUsNERBQTREO0FBQUEsY0FDL0k7QUFBQSxZQUNEO0FBQUEsWUFDQSwwQkFBMEI7QUFBQSxjQUN6QixhQUFhLElBQUksU0FBUyw4RUFBOEUseUhBQXlIO0FBQUEsY0FDak8sTUFBTTtBQUFBLGNBQ04sT0FBTztBQUFBLGdCQUNOLE1BQU07QUFBQSxjQUNQO0FBQUEsWUFDRDtBQUFBLFlBQ0EsYUFBYTtBQUFBLGNBQ1osTUFBTTtBQUFBLGNBQ04scUJBQXFCLElBQUksU0FBUyxpRUFBaUUsOElBQThJO0FBQUEsWUFDbFA7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUixhQUFhLElBQUksU0FBUyx3Q0FBd0MsbUVBQW1FO0FBQUEsTUFDckksTUFBTTtBQUFBLE1BQ04saUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLEVBQUUsS0FBSyxjQUFjLEVBQUU7QUFBQSxNQUNoQztBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsT0FBTztBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsNENBQTRDLDRKQUE0SjtBQUFBLFVBQ2xPLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLHFCQUFxQjtBQUFBLFVBQ3BCLGFBQWEsSUFBSSxTQUFTLHVDQUF1Qyx5RUFBeUU7QUFBQSxVQUMxSSxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0Esb0JBQW9CO0FBQUEsVUFDbkIsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLHdQQUF3UDtBQUFBLFVBQ3hULE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHlCQUF5QixtQ0FBbUM7QUFBQSxJQUN2RjtBQUFBLElBQ0EsTUFBTTtBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVM7QUFBQSxRQUN6QixLQUFLO0FBQUEsUUFDTCxTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxHQUFHLDJJQUEySTtBQUFBLElBQy9JO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUixNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLDRCQUE0QiwyTUFBMk07QUFBQSxNQUN6USxNQUFNLENBQUMsUUFBUSxPQUFPO0FBQUEsTUFDdEIsU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQ0Q7QUFpQk8sTUFBTSx1QkFBdUI7QUFBQSxFQUE3QjtBQUVOLFNBQWlCLG1CQUFtQixvQkFBSSxJQUFpQztBQUFBO0FBQUEsRUFFbEUsdUJBQTBCLE1BQXdEO0FBQ3hGLFFBQUksS0FBSyxpQkFBaUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNuRCxZQUFNLElBQUksTUFBTSxnQ0FBZ0MsS0FBSyxjQUFjO0FBQUEsSUFDcEU7QUFDQSxVQUFNLFNBQVMsSUFBSSxlQUFrQixLQUFLLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLGlCQUFpQjtBQUMzRyxTQUFLLGlCQUFpQixJQUFJLEtBQUssZ0JBQWdCLE1BQU07QUFDckQsUUFBSSxLQUFLLDJCQUEyQjtBQUNuQywrQkFBeUIsU0FBUyxLQUFLLGdCQUFnQixLQUFLLHlCQUF5QjtBQUFBLElBQ3RGO0FBRUEsV0FBTyxXQUFZLGFBQWEsRUFBRSxXQUFZLEtBQUssY0FBYyxJQUFJLEtBQUs7QUFDMUUsbUJBQWUsZUFBZSxVQUFVLE1BQU07QUFFOUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHFCQUFnRDtBQUN0RCxXQUFPLE1BQU0sS0FBSyxLQUFLLGlCQUFpQixPQUFPLENBQUM7QUFBQSxFQUNqRDtBQUNEO0FBRUEsTUFBTSxlQUFlO0FBQUEsRUFDcEIsb0JBQW9CO0FBQ3JCO0FBQ0EsU0FBUyxJQUFJLGFBQWEsb0JBQW9CLElBQUksdUJBQXVCLENBQUM7QUFDbkUsTUFBTSxxQkFBNkMsU0FBUyxHQUFHLGFBQWEsa0JBQWtCO0FBRXJHLGVBQWUsZUFBZSxVQUFVLE1BQU07QUFHOUMsZUFBZSxlQUFlLGlCQUFpQjtBQUFBLEVBQzlDLFlBQVk7QUFBQSxJQUNYLDhCQUE4QjtBQUFBLE1BQzdCLGFBQWEsSUFBSSxTQUFTLHdDQUF3Qyw4REFBOEQ7QUFBQSxNQUNoSSxNQUFNO0FBQUEsTUFDTixZQUFZLENBQUM7QUFBQSxNQUNiLHNCQUFzQjtBQUFBLFFBQ3JCLE9BQU8sQ0FBQztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsT0FBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sTUFBTSxPQUFPLEtBQUssZUFBZTtBQUFBLFlBQ2pDLDBCQUEwQixPQUFPLE9BQU8sZUFBZSxFQUFFLElBQUksV0FBUyxNQUFNLFFBQVE7QUFBQSxVQUNyRjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
