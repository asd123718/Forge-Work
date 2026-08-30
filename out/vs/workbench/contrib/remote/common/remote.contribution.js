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
import { WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { OperatingSystem, isWeb, OS } from "../../../../base/common/platform.js";
import { Schemas } from "../../../../base/common/network.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { localize, localize2 } from "../../../../nls.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { PersistentConnection } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IDownloadService } from "../../../../platform/download/common/download.js";
import { DownloadServiceChannel } from "../../../../platform/download/common/downloadIpc.js";
import { RemoteLoggerChannelClient } from "../../../../platform/log/common/logIpc.js";
import { REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS } from "../../../../platform/remote/common/remote.js";
import product from "../../../../platform/product/common/product.js";
const EXTENSION_IDENTIFIER_PATTERN = "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$";
let LabelContribution = class {
  constructor(labelService, remoteAgentService) {
    this.labelService = labelService;
    this.remoteAgentService = remoteAgentService;
    this.registerFormatters();
  }
  registerFormatters() {
    this.remoteAgentService.getEnvironment().then((remoteEnvironment) => {
      const os = remoteEnvironment?.os || OS;
      const formatting = {
        label: "${path}",
        separator: os === OperatingSystem.Windows ? "\\" : "/",
        tildify: os !== OperatingSystem.Windows,
        normalizeDriveLetter: os === OperatingSystem.Windows,
        workspaceSuffix: isWeb ? void 0 : Schemas.vscodeRemote
      };
      this.labelService.registerFormatter({
        scheme: Schemas.vscodeRemote,
        formatting
      });
      if (remoteEnvironment) {
        this.labelService.registerFormatter({
          scheme: Schemas.vscodeUserData,
          formatting
        });
      }
    });
  }
};
LabelContribution.ID = "workbench.contrib.remoteLabel";
LabelContribution = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IRemoteAgentService)
], LabelContribution);
let RemoteChannelsContribution = class extends Disposable {
  constructor(remoteAgentService, downloadService, loggerService) {
    super();
    const connection = remoteAgentService.getConnection();
    if (connection) {
      connection.registerChannel("download", new DownloadServiceChannel(downloadService));
      connection.withChannel("logger", async (channel) => this._register(new RemoteLoggerChannelClient(loggerService, channel)));
    }
  }
};
RemoteChannelsContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, IDownloadService),
  __decorateParam(2, ILoggerService)
], RemoteChannelsContribution);
let RemoteInvalidWorkspaceDetector = class extends Disposable {
  constructor(fileService, dialogService, environmentService, contextService, fileDialogService, remoteAgentService) {
    super();
    this.fileService = fileService;
    this.dialogService = dialogService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.fileDialogService = fileDialogService;
    if (this.environmentService.remoteAuthority) {
      remoteAgentService.getEnvironment().then((remoteEnv) => {
        if (remoteEnv) {
          this.validateRemoteWorkspace();
        }
      });
    }
  }
  async validateRemoteWorkspace() {
    const workspace = this.contextService.getWorkspace();
    const workspaceUriToStat = workspace.configuration ?? workspace.folders.at(0)?.uri;
    if (!workspaceUriToStat) {
      return;
    }
    const exists = await this.fileService.exists(workspaceUriToStat);
    if (exists) {
      return;
    }
    const res = await this.dialogService.confirm({
      type: "warning",
      message: localize("invalidWorkspaceMessage", "Workspace does not exist"),
      detail: localize("invalidWorkspaceDetail", "Please select another workspace to open."),
      primaryButton: localize({ key: "invalidWorkspacePrimary", comment: ["&& denotes a mnemonic"] }, "&&Open Workspace...")
    });
    if (res.confirmed) {
      if (workspace.configuration) {
        return this.fileDialogService.pickWorkspaceAndOpen({});
      }
      return this.fileDialogService.pickFolderAndOpen({});
    }
  }
};
RemoteInvalidWorkspaceDetector.ID = "workbench.contrib.remoteInvalidWorkspaceDetector";
RemoteInvalidWorkspaceDetector = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IRemoteAgentService)
], RemoteInvalidWorkspaceDetector);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(LabelContribution.ID, LabelContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(RemoteInvalidWorkspaceDetector.ID, RemoteInvalidWorkspaceDetector, WorkbenchPhase.BlockStartup);
const enableDiagnostics = true;
if (enableDiagnostics) {
  class TriggerReconnectAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.triggerReconnect",
        title: localize2("triggerReconnect", "Connection: Trigger Reconnect"),
        category: Categories.Developer,
        f1: true
      });
    }
    async run(accessor) {
      PersistentConnection.debugTriggerReconnection();
    }
  }
  class PauseSocketWriting extends Action2 {
    constructor() {
      super({
        id: "workbench.action.pauseSocketWriting",
        title: localize2("pauseSocketWriting", "Connection: Pause socket writing"),
        category: Categories.Developer,
        f1: true
      });
    }
    async run(accessor) {
      PersistentConnection.debugPauseSocketWriting();
    }
  }
  registerAction2(TriggerReconnectAction);
  registerAction2(PauseSocketWriting);
}
const extensionKindSchema = {
  type: "string",
  enum: [
    "ui",
    "workspace"
  ],
  enumDescriptions: [
    localize("ui", "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
    localize("workspace", "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
  ]
};
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "remote",
  title: localize("remote", "Remote"),
  type: "object",
  properties: {
    "remote.extensionKind": {
      type: "object",
      markdownDescription: localize("remote.extensionKind", "Override the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions are run on the remote. By overriding an extension's default kind using this setting, you specify if that extension should be installed and enabled locally or remotely."),
      patternProperties: {
        [EXTENSION_IDENTIFIER_PATTERN]: {
          oneOf: [{ type: "array", items: extensionKindSchema }, extensionKindSchema],
          default: ["ui"]
        }
      },
      default: {
        "pub.name": ["ui"]
      }
    },
    "remote.restoreForwardedPorts": {
      type: "boolean",
      markdownDescription: localize("remote.restoreForwardedPorts", "Restores the ports you forwarded in a workspace."),
      default: true
    },
    "remote.autoForwardPorts": {
      type: "boolean",
      markdownDescription: localize("remote.autoForwardPorts", "When enabled, new running processes are detected and ports that they listen on are automatically forwarded. Disabling this setting will not prevent all ports from being forwarded. Even when disabled, extensions will still be able to cause ports to be forwarded, and opening some URLs will still cause ports to forwarded. Also see {0}.", "`#remote.autoForwardPortsSource#`"),
      default: true
    },
    "remote.autoForwardPortsSource": {
      type: "string",
      markdownDescription: localize("remote.autoForwardPortsSource", "Sets the source from which ports are automatically forwarded when {0} is true. When {0} is false, {1} will be used to find information about ports that have already been forwarded. On Windows and macOS remotes, the `process` and `hybrid` options have no effect and `output` will be used.", "`#remote.autoForwardPorts#`", "`#remote.autoForwardPortsSource#`"),
      enum: ["process", "output", "hybrid"],
      enumDescriptions: [
        localize("remote.autoForwardPortsSource.process", "Ports will be automatically forwarded when discovered by watching for processes that are started and include a port."),
        localize("remote.autoForwardPortsSource.output", 'Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports forwarded based on output will not be "un-forwarded" until reload or until the port is closed by the user in the Ports view.'),
        localize("remote.autoForwardPortsSource.hybrid", 'Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports will be "un-forwarded" by watching for processes that listen on that port to be terminated.')
      ],
      default: "process"
    },
    "remote.autoForwardPortsFallback": {
      type: "number",
      default: 20,
      markdownDescription: localize("remote.autoForwardPortFallback", "The number of auto forwarded ports that will trigger the switch from `process` to `hybrid` when automatically forwarding ports and `remote.autoForwardPortsSource` is set to `process` by default. Set to `0` to disable the fallback. When `remote.autoForwardPortsFallback` hasn't been configured, but `remote.autoForwardPortsSource` has, `remote.autoForwardPortsFallback` will be treated as though it's set to `0`.")
    },
    "remote.forwardOnOpen": {
      type: "boolean",
      description: localize("remote.forwardOnClick", "Controls whether local URLs with a port will be forwarded when opened from the terminal and the debug console."),
      default: true
    },
    // Consider making changes to extensions\configuration-editing\schemas\devContainer.schema.src.json
    // and extensions\configuration-editing\schemas\attachContainer.schema.json
    // to keep in sync with devcontainer.json schema.
    "remote.portsAttributes": {
      type: "object",
      patternProperties: {
        "(^\\d+(-\\d+)?$)|(.+)": {
          type: "object",
          description: localize("remote.portsAttributes.port", 'A port, range of ports (ex. "40000-55000"), host and port (ex. "db:1234"), or regular expression (ex. ".+\\\\/server.js").  For a port number or range, the attributes will apply to that port number or range of port numbers. Attributes which use a regular expression will apply to ports whose associated process command line matches the expression.'),
          properties: {
            "onAutoForward": {
              type: "string",
              enum: ["notify", "openBrowser", "openBrowserOnce", "openPreview", "silent", "ignore"],
              enumDescriptions: [
                localize("remote.portsAttributes.notify", "Shows a notification when a port is automatically forwarded."),
                localize("remote.portsAttributes.openBrowser", "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
                localize("remote.portsAttributes.openBrowserOnce", "Opens the browser when the port is automatically forwarded, but only the first time the port is forward during a session. Depending on your settings, this could open an embedded browser."),
                localize("remote.portsAttributes.openPreview", "Opens a preview in the same window when the port is automatically forwarded."),
                localize("remote.portsAttributes.silent", "Shows no notification and takes no action when this port is automatically forwarded."),
                localize("remote.portsAttributes.ignore", "This port will not be automatically forwarded.")
              ],
              description: localize("remote.portsAttributes.onForward", "Defines the action that occurs when the port is discovered for automatic forwarding"),
              default: "notify"
            },
            "elevateIfNeeded": {
              type: "boolean",
              description: localize("remote.portsAttributes.elevateIfNeeded", "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
              default: false
            },
            "label": {
              type: "string",
              description: localize("remote.portsAttributes.label", "Label that will be shown in the UI for this port."),
              default: localize("remote.portsAttributes.labelDefault", "Application")
            },
            "requireLocalPort": {
              type: "boolean",
              markdownDescription: localize("remote.portsAttributes.requireLocalPort", "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
              default: false
            },
            "protocol": {
              type: "string",
              enum: ["http", "https"],
              description: localize("remote.portsAttributes.protocol", "The protocol to use when forwarding this port.")
            }
          },
          default: {
            "label": localize("remote.portsAttributes.labelDefault", "Application"),
            "onAutoForward": "notify"
          }
        }
      },
      markdownDescription: localize("remote.portsAttributes", 'Set properties that are applied when a specific port number is forwarded. For example:\n\n```\n"3000": {\n  "label": "Application"\n},\n"40000-55000": {\n  "onAutoForward": "ignore"\n},\n".+\\\\/server.js": {\n "onAutoForward": "openPreview"\n}\n```'),
      defaultSnippets: [{ body: { "${1:3000}": { label: "${2:Application}", onAutoForward: "openPreview" } } }],
      errorMessage: localize("remote.portsAttributes.patternError", "Must be a port number, range of port numbers, or regular expression."),
      additionalProperties: false,
      default: {
        "443": {
          "protocol": "https"
        },
        "8443": {
          "protocol": "https"
        }
      }
    },
    "remote.otherPortsAttributes": {
      type: "object",
      properties: {
        "onAutoForward": {
          type: "string",
          enum: ["notify", "openBrowser", "openPreview", "silent", "ignore"],
          enumDescriptions: [
            localize("remote.portsAttributes.notify", "Shows a notification when a port is automatically forwarded."),
            localize("remote.portsAttributes.openBrowser", "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
            localize("remote.portsAttributes.openPreview", "Opens a preview in the same window when the port is automatically forwarded."),
            localize("remote.portsAttributes.silent", "Shows no notification and takes no action when this port is automatically forwarded."),
            localize("remote.portsAttributes.ignore", "This port will not be automatically forwarded.")
          ],
          description: localize("remote.portsAttributes.onForward", "Defines the action that occurs when the port is discovered for automatic forwarding"),
          default: "notify"
        },
        "elevateIfNeeded": {
          type: "boolean",
          description: localize("remote.portsAttributes.elevateIfNeeded", "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
          default: false
        },
        "label": {
          type: "string",
          description: localize("remote.portsAttributes.label", "Label that will be shown in the UI for this port."),
          default: localize("remote.portsAttributes.labelDefault", "Application")
        },
        "requireLocalPort": {
          type: "boolean",
          markdownDescription: localize("remote.portsAttributes.requireLocalPort", "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
          default: false
        },
        "protocol": {
          type: "string",
          enum: ["http", "https"],
          description: localize("remote.portsAttributes.protocol", "The protocol to use when forwarding this port.")
        }
      },
      defaultSnippets: [{ body: { onAutoForward: "ignore" } }],
      markdownDescription: localize("remote.portsAttributes.defaults", 'Set default properties that are applied to all ports that don\'t get properties from the setting {0}. For example:\n\n```\n{\n  "onAutoForward": "ignore"\n}\n```', "`#remote.portsAttributes#`"),
      additionalProperties: false
    },
    "remote.localPortHost": {
      type: "string",
      enum: ["localhost", "allInterfaces"],
      default: "localhost",
      description: localize("remote.localPortHost", "Specifies the local host name that will be used for port forwarding.")
    },
    [REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS]: {
      type: "array",
      markdownDescription: localize("remote.defaultExtensionsIfInstalledLocally.markdownDescription", "List of extensions to install upon connection to a remote when already installed locally."),
      default: product?.remoteDefaultExtensionsIfInstalledLocally || [],
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN,
        patternErrorMessage: localize("remote.defaultExtensionsIfInstalledLocally.invalidFormat", 'Extension identifier must be in format "publisher.name".')
      }
    }
  }
});
export {
  LabelContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcY29tbW9uXFxyZW1vdGUuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgV29ya2JlbmNoUGhhc2UsIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBSZXNvdXJjZUxhYmVsRm9ybWF0dGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIGlzV2ViLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IFBlcnNpc3RlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSURvd25sb2FkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZC5qcyc7XG5pbXBvcnQgeyBEb3dubG9hZFNlcnZpY2VDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG93bmxvYWQvY29tbW9uL2Rvd25sb2FkSXBjLmpzJztcbmltcG9ydCB7IFJlbW90ZUxvZ2dlckNoYW5uZWxDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZ0lwYy5qcyc7XG5pbXBvcnQgeyBSRU1PVEVfREVGQVVMVF9JRl9MT0NBTF9FWFRFTlNJT05TIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGUuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5cblxuY29uc3QgRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTiA9ICcoW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKVxcXFwuKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKikkJztcblxuZXhwb3J0IGNsYXNzIExhYmVsQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnJlbW90ZUxhYmVsJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSkge1xuXHRcdHRoaXMucmVnaXN0ZXJGb3JtYXR0ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRm9ybWF0dGVycygpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52aXJvbm1lbnQgPT4ge1xuXHRcdFx0Y29uc3Qgb3MgPSByZW1vdGVFbnZpcm9ubWVudD8ub3MgfHwgT1M7XG5cdFx0XHRjb25zdCBmb3JtYXR0aW5nOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGluZyA9IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAnXFxcXCcgOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IG9zICE9PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyxcblx0XHRcdFx0bm9ybWFsaXplRHJpdmVMZXR0ZXI6IG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyxcblx0XHRcdFx0d29ya3NwYWNlU3VmZml4OiBpc1dlYiA/IHVuZGVmaW5lZCA6IFNjaGVtYXMudnNjb2RlUmVtb3RlXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLFxuXHRcdFx0XHRmb3JtYXR0aW5nXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlbW90ZUVudmlyb25tZW50KSB7XG5cdFx0XHRcdHRoaXMubGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEsXG5cdFx0XHRcdFx0Zm9ybWF0dGluZ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBSZW1vdGVDaGFubmVsc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElEb3dubG9hZFNlcnZpY2UgZG93bmxvYWRTZXJ2aWNlOiBJRG93bmxvYWRTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0Y29ubmVjdGlvbi5yZWdpc3RlckNoYW5uZWwoJ2Rvd25sb2FkJywgbmV3IERvd25sb2FkU2VydmljZUNoYW5uZWwoZG93bmxvYWRTZXJ2aWNlKSk7XG5cdFx0XHRjb25uZWN0aW9uLndpdGhDaGFubmVsKCdsb2dnZXInLCBhc3luYyBjaGFubmVsID0+IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZW1vdGVMb2dnZXJDaGFubmVsQ2xpZW50KGxvZ2dlclNlcnZpY2UsIGNoYW5uZWwpKSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJlbW90ZUludmFsaWRXb3Jrc3BhY2VEZXRlY3RvciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIucmVtb3RlSW52YWxpZFdvcmtzcGFjZURldGVjdG9yJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFdoZW4gY29ubmVjdGVkIHRvIGEgcmVtb3RlIHdvcmtzcGFjZSwgd2UgY3VycmVudGx5IGNhbm5vdFxuXHRcdC8vIHZhbGlkYXRlIHRoYXQgdGhlIHdvcmtzcGFjZSBleGlzdHMgYmVmb3JlIGFjdHVhbGx5IG9wZW5pbmdcblx0XHQvLyBpdC4gQXMgc3VjaCwgd2UgbmVlZCB0byBjaGVjayBvbiB0aGF0IGFmdGVyIHN0YXJ0dXAgYW5kIGd1aWRlXG5cdFx0Ly8gdGhlIHVzZXIgdG8gYSB2YWxpZCB3b3Jrc3BhY2UuXG5cdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMzODcyKVxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52ID0+IHtcblx0XHRcdFx0aWYgKHJlbW90ZUVudikge1xuXHRcdFx0XHRcdC8vIHdlIHVzZSB0aGUgcHJlc2VuY2Ugb2YgYHJlbW90ZUVudmAgdG8gZmlndXJlIG91dFxuXHRcdFx0XHRcdC8vIGlmIHdlIGdvdCBhIGhlYWx0aHkgcmVtb3RlIGNvbm5lY3Rpb25cblx0XHRcdFx0XHQvLyAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzUzMzEpXG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZVJlbW90ZVdvcmtzcGFjZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlUmVtb3RlV29ya3NwYWNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpVG9TdGF0ID0gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPz8gd29ya3NwYWNlLmZvbGRlcnMuYXQoMCk/LnVyaTtcblx0XHRpZiAoIXdvcmtzcGFjZVVyaVRvU3RhdCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHdoZW4gaW4gd29ya3NwYWNlXG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMod29ya3NwYWNlVXJpVG9TdGF0KTtcblx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFsbCBnb29kIVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdpbnZhbGlkV29ya3NwYWNlTWVzc2FnZScsIFwiV29ya3NwYWNlIGRvZXMgbm90IGV4aXN0XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnaW52YWxpZFdvcmtzcGFjZURldGFpbCcsIFwiUGxlYXNlIHNlbGVjdCBhbm90aGVyIHdvcmtzcGFjZSB0byBvcGVuLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnaW52YWxpZFdvcmtzcGFjZVByaW1hcnknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuIFdvcmtzcGFjZS4uLlwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblxuXHRcdFx0Ly8gUGljayBXb3Jrc3BhY2Vcblx0XHRcdGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrV29ya3NwYWNlQW5kT3Blbih7fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBpY2sgRm9sZGVyXG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrRm9sZGVyQW5kT3Blbih7fSk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihMYWJlbENvbnRyaWJ1dGlvbi5JRCwgTGFiZWxDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG53b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oUmVtb3RlQ2hhbm5lbHNDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihSZW1vdGVJbnZhbGlkV29ya3NwYWNlRGV0ZWN0b3IuSUQsIFJlbW90ZUludmFsaWRXb3Jrc3BhY2VEZXRlY3RvciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuY29uc3QgZW5hYmxlRGlhZ25vc3RpY3MgPSB0cnVlO1xuXG5pZiAoZW5hYmxlRGlhZ25vc3RpY3MpIHtcblx0Y2xhc3MgVHJpZ2dlclJlY29ubmVjdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udHJpZ2dlclJlY29ubmVjdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RyaWdnZXJSZWNvbm5lY3QnLCAnQ29ubmVjdGlvbjogVHJpZ2dlciBSZWNvbm5lY3QnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0UGVyc2lzdGVudENvbm5lY3Rpb24uZGVidWdUcmlnZ2VyUmVjb25uZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgUGF1c2VTb2NrZXRXcml0aW5nIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5wYXVzZVNvY2tldFdyaXRpbmcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwYXVzZVNvY2tldFdyaXRpbmcnLCAnQ29ubmVjdGlvbjogUGF1c2Ugc29ja2V0IHdyaXRpbmcnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0UGVyc2lzdGVudENvbm5lY3Rpb24uZGVidWdQYXVzZVNvY2tldFdyaXRpbmcoKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckFjdGlvbjIoVHJpZ2dlclJlY29ubmVjdEFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihQYXVzZVNvY2tldFdyaXRpbmcpO1xufVxuXG5jb25zdCBleHRlbnNpb25LaW5kU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IFtcblx0XHQndWknLFxuXHRcdCd3b3Jrc3BhY2UnXG5cdF0sXG5cdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRsb2NhbGl6ZSgndWknLCBcIlVJIGV4dGVuc2lvbiBraW5kLiBJbiBhIHJlbW90ZSB3aW5kb3csIHN1Y2ggZXh0ZW5zaW9ucyBhcmUgZW5hYmxlZCBvbmx5IHdoZW4gYXZhaWxhYmxlIG9uIHRoZSBsb2NhbCBtYWNoaW5lLlwiKSxcblx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2UgZXh0ZW5zaW9uIGtpbmQuIEluIGEgcmVtb3RlIHdpbmRvdywgc3VjaCBleHRlbnNpb25zIGFyZSBlbmFibGVkIG9ubHkgd2hlbiBhdmFpbGFibGUgb24gdGhlIHJlbW90ZS5cIilcblx0XSxcbn07XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdGlkOiAncmVtb3RlJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3JlbW90ZScsIFwiUmVtb3RlXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdCdyZW1vdGUuZXh0ZW5zaW9uS2luZCc6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUuZXh0ZW5zaW9uS2luZCcsIFwiT3ZlcnJpZGUgdGhlIGtpbmQgb2YgYW4gZXh0ZW5zaW9uLiBgdWlgIGV4dGVuc2lvbnMgYXJlIGluc3RhbGxlZCBhbmQgcnVuIG9uIHRoZSBsb2NhbCBtYWNoaW5lIHdoaWxlIGB3b3Jrc3BhY2VgIGV4dGVuc2lvbnMgYXJlIHJ1biBvbiB0aGUgcmVtb3RlLiBCeSBvdmVycmlkaW5nIGFuIGV4dGVuc2lvbidzIGRlZmF1bHQga2luZCB1c2luZyB0aGlzIHNldHRpbmcsIHlvdSBzcGVjaWZ5IGlmIHRoYXQgZXh0ZW5zaW9uIHNob3VsZCBiZSBpbnN0YWxsZWQgYW5kIGVuYWJsZWQgbG9jYWxseSBvciByZW1vdGVseS5cIiksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0W0VYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk5dOiB7XG5cdFx0XHRcdFx0XHRvbmVPZjogW3sgdHlwZTogJ2FycmF5JywgaXRlbXM6IGV4dGVuc2lvbktpbmRTY2hlbWEgfSwgZXh0ZW5zaW9uS2luZFNjaGVtYV0sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBbJ3VpJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdCdwdWIubmFtZSc6IFsndWknXVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3JlbW90ZS5yZXN0b3JlRm9yd2FyZGVkUG9ydHMnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5yZXN0b3JlRm9yd2FyZGVkUG9ydHMnLCBcIlJlc3RvcmVzIHRoZSBwb3J0cyB5b3UgZm9yd2FyZGVkIGluIGEgd29ya3NwYWNlLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0cyc6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHMnLCBcIldoZW4gZW5hYmxlZCwgbmV3IHJ1bm5pbmcgcHJvY2Vzc2VzIGFyZSBkZXRlY3RlZCBhbmQgcG9ydHMgdGhhdCB0aGV5IGxpc3RlbiBvbiBhcmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuIERpc2FibGluZyB0aGlzIHNldHRpbmcgd2lsbCBub3QgcHJldmVudCBhbGwgcG9ydHMgZnJvbSBiZWluZyBmb3J3YXJkZWQuIEV2ZW4gd2hlbiBkaXNhYmxlZCwgZXh0ZW5zaW9ucyB3aWxsIHN0aWxsIGJlIGFibGUgdG8gY2F1c2UgcG9ydHMgdG8gYmUgZm9yd2FyZGVkLCBhbmQgb3BlbmluZyBzb21lIFVSTHMgd2lsbCBzdGlsbCBjYXVzZSBwb3J0cyB0byBmb3J3YXJkZWQuIEFsc28gc2VlIHswfS5cIiwgJ2AjcmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UjYCcpLFxuXHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0J3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlJzoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlJywgXCJTZXRzIHRoZSBzb3VyY2UgZnJvbSB3aGljaCBwb3J0cyBhcmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQgd2hlbiB7MH0gaXMgdHJ1ZS4gV2hlbiB7MH0gaXMgZmFsc2UsIHsxfSB3aWxsIGJlIHVzZWQgdG8gZmluZCBpbmZvcm1hdGlvbiBhYm91dCBwb3J0cyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIGZvcndhcmRlZC4gT24gV2luZG93cyBhbmQgbWFjT1MgcmVtb3RlcywgdGhlIGBwcm9jZXNzYCBhbmQgYGh5YnJpZGAgb3B0aW9ucyBoYXZlIG5vIGVmZmVjdCBhbmQgYG91dHB1dGAgd2lsbCBiZSB1c2VkLlwiLCAnYCNyZW1vdGUuYXV0b0ZvcndhcmRQb3J0cyNgJywgJ2AjcmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UjYCcpLFxuXHRcdFx0XHRlbnVtOiBbJ3Byb2Nlc3MnLCAnb3V0cHV0JywgJ2h5YnJpZCddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlLnByb2Nlc3MnLCBcIlBvcnRzIHdpbGwgYmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQgd2hlbiBkaXNjb3ZlcmVkIGJ5IHdhdGNoaW5nIGZvciBwcm9jZXNzZXMgdGhhdCBhcmUgc3RhcnRlZCBhbmQgaW5jbHVkZSBhIHBvcnQuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5vdXRwdXQnLCBcIlBvcnRzIHdpbGwgYmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQgd2hlbiBkaXNjb3ZlcmVkIGJ5IHJlYWRpbmcgdGVybWluYWwgYW5kIGRlYnVnIG91dHB1dC4gTm90IGFsbCBwcm9jZXNzZXMgdGhhdCB1c2UgcG9ydHMgd2lsbCBwcmludCB0byB0aGUgaW50ZWdyYXRlZCB0ZXJtaW5hbCBvciBkZWJ1ZyBjb25zb2xlLCBzbyBzb21lIHBvcnRzIHdpbGwgYmUgbWlzc2VkLiBQb3J0cyBmb3J3YXJkZWQgYmFzZWQgb24gb3V0cHV0IHdpbGwgbm90IGJlIFxcXCJ1bi1mb3J3YXJkZWRcXFwiIHVudGlsIHJlbG9hZCBvciB1bnRpbCB0aGUgcG9ydCBpcyBjbG9zZWQgYnkgdGhlIHVzZXIgaW4gdGhlIFBvcnRzIHZpZXcuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5oeWJyaWQnLCBcIlBvcnRzIHdpbGwgYmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQgd2hlbiBkaXNjb3ZlcmVkIGJ5IHJlYWRpbmcgdGVybWluYWwgYW5kIGRlYnVnIG91dHB1dC4gTm90IGFsbCBwcm9jZXNzZXMgdGhhdCB1c2UgcG9ydHMgd2lsbCBwcmludCB0byB0aGUgaW50ZWdyYXRlZCB0ZXJtaW5hbCBvciBkZWJ1ZyBjb25zb2xlLCBzbyBzb21lIHBvcnRzIHdpbGwgYmUgbWlzc2VkLiBQb3J0cyB3aWxsIGJlIFxcXCJ1bi1mb3J3YXJkZWRcXFwiIGJ5IHdhdGNoaW5nIGZvciBwcm9jZXNzZXMgdGhhdCBsaXN0ZW4gb24gdGhhdCBwb3J0IHRvIGJlIHRlcm1pbmF0ZWQuXCIpXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6ICdwcm9jZXNzJ1xuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c0ZhbGxiYWNrJzoge1xuXHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0ZGVmYXVsdDogMjAsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0RmFsbGJhY2snLCBcIlRoZSBudW1iZXIgb2YgYXV0byBmb3J3YXJkZWQgcG9ydHMgdGhhdCB3aWxsIHRyaWdnZXIgdGhlIHN3aXRjaCBmcm9tIGBwcm9jZXNzYCB0byBgaHlicmlkYCB3aGVuIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGluZyBwb3J0cyBhbmQgYHJlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlYCBpcyBzZXQgdG8gYHByb2Nlc3NgIGJ5IGRlZmF1bHQuIFNldCB0byBgMGAgdG8gZGlzYWJsZSB0aGUgZmFsbGJhY2suIFdoZW4gYHJlbW90ZS5hdXRvRm9yd2FyZFBvcnRzRmFsbGJhY2tgIGhhc24ndCBiZWVuIGNvbmZpZ3VyZWQsIGJ1dCBgcmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2VgIGhhcywgYHJlbW90ZS5hdXRvRm9yd2FyZFBvcnRzRmFsbGJhY2tgIHdpbGwgYmUgdHJlYXRlZCBhcyB0aG91Z2ggaXQncyBzZXQgdG8gYDBgLlwiKVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUuZm9yd2FyZE9uT3Blbic6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5mb3J3YXJkT25DbGljaycsIFwiQ29udHJvbHMgd2hldGhlciBsb2NhbCBVUkxzIHdpdGggYSBwb3J0IHdpbGwgYmUgZm9yd2FyZGVkIHdoZW4gb3BlbmVkIGZyb20gdGhlIHRlcm1pbmFsIGFuZCB0aGUgZGVidWcgY29uc29sZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHQvLyBDb25zaWRlciBtYWtpbmcgY2hhbmdlcyB0byBleHRlbnNpb25zXFxjb25maWd1cmF0aW9uLWVkaXRpbmdcXHNjaGVtYXNcXGRldkNvbnRhaW5lci5zY2hlbWEuc3JjLmpzb25cblx0XHRcdC8vIGFuZCBleHRlbnNpb25zXFxjb25maWd1cmF0aW9uLWVkaXRpbmdcXHNjaGVtYXNcXGF0dGFjaENvbnRhaW5lci5zY2hlbWEuanNvblxuXHRcdFx0Ly8gdG8ga2VlcCBpbiBzeW5jIHdpdGggZGV2Y29udGFpbmVyLmpzb24gc2NoZW1hLlxuXHRcdFx0J3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMnOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRcdCcoXlxcXFxkKygtXFxcXGQrKT8kKXwoLispJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMucG9ydCcsIFwiQSBwb3J0LCByYW5nZSBvZiBwb3J0cyAoZXguIFxcXCI0MDAwMC01NTAwMFxcXCIpLCBob3N0IGFuZCBwb3J0IChleC4gXFxcImRiOjEyMzRcXFwiKSwgb3IgcmVndWxhciBleHByZXNzaW9uIChleC4gXFxcIi4rXFxcXFxcXFwvc2VydmVyLmpzXFxcIikuICBGb3IgYSBwb3J0IG51bWJlciBvciByYW5nZSwgdGhlIGF0dHJpYnV0ZXMgd2lsbCBhcHBseSB0byB0aGF0IHBvcnQgbnVtYmVyIG9yIHJhbmdlIG9mIHBvcnQgbnVtYmVycy4gQXR0cmlidXRlcyB3aGljaCB1c2UgYSByZWd1bGFyIGV4cHJlc3Npb24gd2lsbCBhcHBseSB0byBwb3J0cyB3aG9zZSBhc3NvY2lhdGVkIHByb2Nlc3MgY29tbWFuZCBsaW5lIG1hdGNoZXMgdGhlIGV4cHJlc3Npb24uXCIpLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHQnb25BdXRvRm9yd2FyZCc6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ25vdGlmeScsICdvcGVuQnJvd3NlcicsICdvcGVuQnJvd3Nlck9uY2UnLCAnb3BlblByZXZpZXcnLCAnc2lsZW50JywgJ2lnbm9yZSddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLm5vdGlmeScsIFwiU2hvd3MgYSBub3RpZmljYXRpb24gd2hlbiBhIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMub3BlbkJyb3dzZXInLCBcIk9wZW5zIHRoZSBicm93c2VyIHdoZW4gdGhlIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuIERlcGVuZGluZyBvbiB5b3VyIHNldHRpbmdzLCB0aGlzIGNvdWxkIG9wZW4gYW4gZW1iZWRkZWQgYnJvd3Nlci5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vcGVuQnJvd3Nlck9uY2UnLCBcIk9wZW5zIHRoZSBicm93c2VyIHdoZW4gdGhlIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQsIGJ1dCBvbmx5IHRoZSBmaXJzdCB0aW1lIHRoZSBwb3J0IGlzIGZvcndhcmQgZHVyaW5nIGEgc2Vzc2lvbi4gRGVwZW5kaW5nIG9uIHlvdXIgc2V0dGluZ3MsIHRoaXMgY291bGQgb3BlbiBhbiBlbWJlZGRlZCBicm93c2VyLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLm9wZW5QcmV2aWV3JywgXCJPcGVucyBhIHByZXZpZXcgaW4gdGhlIHNhbWUgd2luZG93IHdoZW4gdGhlIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuc2lsZW50JywgXCJTaG93cyBubyBub3RpZmljYXRpb24gYW5kIHRha2VzIG5vIGFjdGlvbiB3aGVuIHRoaXMgcG9ydCBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5pZ25vcmUnLCBcIlRoaXMgcG9ydCB3aWxsIG5vdCBiZSBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIilcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vbkZvcndhcmQnLCBcIkRlZmluZXMgdGhlIGFjdGlvbiB0aGF0IG9jY3VycyB3aGVuIHRoZSBwb3J0IGlzIGRpc2NvdmVyZWQgZm9yIGF1dG9tYXRpYyBmb3J3YXJkaW5nXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdub3RpZnknXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdCdlbGV2YXRlSWZOZWVkZWQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQnLCBcIkF1dG9tYXRpY2FsbHkgcHJvbXB0IGZvciBlbGV2YXRpb24gKGlmIG5lZWRlZCkgd2hlbiB0aGlzIHBvcnQgaXMgZm9yd2FyZGVkLiBFbGV2YXRlIGlzIHJlcXVpcmVkIGlmIHRoZSBsb2NhbCBwb3J0IGlzIGEgcHJpdmlsZWdlZCBwb3J0LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQnbGFiZWwnOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmxhYmVsJywgXCJMYWJlbCB0aGF0IHdpbGwgYmUgc2hvd24gaW4gdGhlIFVJIGZvciB0aGlzIHBvcnQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmxhYmVsRGVmYXVsdCcsIFwiQXBwbGljYXRpb25cIilcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J3JlcXVpcmVMb2NhbFBvcnQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnJlcXVpcmVMb2NhbFBvcnQnLCBcIldoZW4gdHJ1ZSwgYSBtb2RhbCBkaWFsb2cgd2lsbCBzaG93IGlmIHRoZSBjaG9zZW4gbG9jYWwgcG9ydCBpc24ndCB1c2VkIGZvciBmb3J3YXJkaW5nLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQncHJvdG9jb2wnOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydodHRwJywgJ2h0dHBzJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnByb3RvY29sJywgXCJUaGUgcHJvdG9jb2wgdG8gdXNlIHdoZW4gZm9yd2FyZGluZyB0aGlzIHBvcnQuXCIpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHRcdCdsYWJlbCc6IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmxhYmVsRGVmYXVsdCcsIFwiQXBwbGljYXRpb25cIiksXG5cdFx0XHRcdFx0XHRcdCdvbkF1dG9Gb3J3YXJkJzogJ25vdGlmeSdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzJywgXCJTZXQgcHJvcGVydGllcyB0aGF0IGFyZSBhcHBsaWVkIHdoZW4gYSBzcGVjaWZpYyBwb3J0IG51bWJlciBpcyBmb3J3YXJkZWQuIEZvciBleGFtcGxlOlxcblxcbmBgYFxcblxcXCIzMDAwXFxcIjoge1xcbiAgXFxcImxhYmVsXFxcIjogXFxcIkFwcGxpY2F0aW9uXFxcIlxcbn0sXFxuXFxcIjQwMDAwLTU1MDAwXFxcIjoge1xcbiAgXFxcIm9uQXV0b0ZvcndhcmRcXFwiOiBcXFwiaWdub3JlXFxcIlxcbn0sXFxuXFxcIi4rXFxcXFxcXFwvc2VydmVyLmpzXFxcIjoge1xcbiBcXFwib25BdXRvRm9yd2FyZFxcXCI6IFxcXCJvcGVuUHJldmlld1xcXCJcXG59XFxuYGBgXCIpLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgJyR7MTozMDAwfSc6IHsgbGFiZWw6ICckezI6QXBwbGljYXRpb259Jywgb25BdXRvRm9yd2FyZDogJ29wZW5QcmV2aWV3JyB9IH0gfV0sXG5cdFx0XHRcdGVycm9yTWVzc2FnZTogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMucGF0dGVybkVycm9yJywgXCJNdXN0IGJlIGEgcG9ydCBudW1iZXIsIHJhbmdlIG9mIHBvcnQgbnVtYmVycywgb3IgcmVndWxhciBleHByZXNzaW9uLlwiKSxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0JzQ0Myc6IHtcblx0XHRcdFx0XHRcdCdwcm90b2NvbCc6ICdodHRwcydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCc4NDQzJzoge1xuXHRcdFx0XHRcdFx0J3Byb3RvY29sJzogJ2h0dHBzJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUub3RoZXJQb3J0c0F0dHJpYnV0ZXMnOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0J29uQXV0b0ZvcndhcmQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnbm90aWZ5JywgJ29wZW5Ccm93c2VyJywgJ29wZW5QcmV2aWV3JywgJ3NpbGVudCcsICdpZ25vcmUnXSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMubm90aWZ5JywgXCJTaG93cyBhIG5vdGlmaWNhdGlvbiB3aGVuIGEgcG9ydCBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLm9wZW5Ccm93c2VyJywgXCJPcGVucyB0aGUgYnJvd3NlciB3aGVuIHRoZSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLiBEZXBlbmRpbmcgb24geW91ciBzZXR0aW5ncywgdGhpcyBjb3VsZCBvcGVuIGFuIGVtYmVkZGVkIGJyb3dzZXIuXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vcGVuUHJldmlldycsIFwiT3BlbnMgYSBwcmV2aWV3IGluIHRoZSBzYW1lIHdpbmRvdyB3aGVuIHRoZSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuc2lsZW50JywgXCJTaG93cyBubyBub3RpZmljYXRpb24gYW5kIHRha2VzIG5vIGFjdGlvbiB3aGVuIHRoaXMgcG9ydCBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmlnbm9yZScsIFwiVGhpcyBwb3J0IHdpbGwgbm90IGJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLlwiKVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vbkZvcndhcmQnLCBcIkRlZmluZXMgdGhlIGFjdGlvbiB0aGF0IG9jY3VycyB3aGVuIHRoZSBwb3J0IGlzIGRpc2NvdmVyZWQgZm9yIGF1dG9tYXRpYyBmb3J3YXJkaW5nXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ25vdGlmeSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdlbGV2YXRlSWZOZWVkZWQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuZWxldmF0ZUlmTmVlZGVkJywgXCJBdXRvbWF0aWNhbGx5IHByb21wdCBmb3IgZWxldmF0aW9uIChpZiBuZWVkZWQpIHdoZW4gdGhpcyBwb3J0IGlzIGZvcndhcmRlZC4gRWxldmF0ZSBpcyByZXF1aXJlZCBpZiB0aGUgbG9jYWwgcG9ydCBpcyBhIHByaXZpbGVnZWQgcG9ydC5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2xhYmVsJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMubGFiZWwnLCBcIkxhYmVsIHRoYXQgd2lsbCBiZSBzaG93biBpbiB0aGUgVUkgZm9yIHRoaXMgcG9ydC5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5sYWJlbERlZmF1bHQnLCBcIkFwcGxpY2F0aW9uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQncmVxdWlyZUxvY2FsUG9ydCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnJlcXVpcmVMb2NhbFBvcnQnLCBcIldoZW4gdHJ1ZSwgYSBtb2RhbCBkaWFsb2cgd2lsbCBzaG93IGlmIHRoZSBjaG9zZW4gbG9jYWwgcG9ydCBpc24ndCB1c2VkIGZvciBmb3J3YXJkaW5nLlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQncHJvdG9jb2wnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnaHR0cCcsICdodHRwcyddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnByb3RvY29sJywgXCJUaGUgcHJvdG9jb2wgdG8gdXNlIHdoZW4gZm9yd2FyZGluZyB0aGlzIHBvcnQuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgb25BdXRvRm9yd2FyZDogJ2lnbm9yZScgfSB9XSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuZGVmYXVsdHMnLCBcIlNldCBkZWZhdWx0IHByb3BlcnRpZXMgdGhhdCBhcmUgYXBwbGllZCB0byBhbGwgcG9ydHMgdGhhdCBkb24ndCBnZXQgcHJvcGVydGllcyBmcm9tIHRoZSBzZXR0aW5nIHswfS4gRm9yIGV4YW1wbGU6XFxuXFxuYGBgXFxue1xcbiAgXFxcIm9uQXV0b0ZvcndhcmRcXFwiOiBcXFwiaWdub3JlXFxcIlxcbn1cXG5gYGBcIiwgJ2AjcmVtb3RlLnBvcnRzQXR0cmlidXRlcyNgJyksXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUubG9jYWxQb3J0SG9zdCc6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnbG9jYWxob3N0JywgJ2FsbEludGVyZmFjZXMnXSxcblx0XHRcdFx0ZGVmYXVsdDogJ2xvY2FsaG9zdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLmxvY2FsUG9ydEhvc3QnLCBcIlNwZWNpZmllcyB0aGUgbG9jYWwgaG9zdCBuYW1lIHRoYXQgd2lsbCBiZSB1c2VkIGZvciBwb3J0IGZvcndhcmRpbmcuXCIpXG5cdFx0XHR9LFxuXHRcdFx0W1JFTU9URV9ERUZBVUxUX0lGX0xPQ0FMX0VYVEVOU0lPTlNdOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUuZGVmYXVsdEV4dGVuc2lvbnNJZkluc3RhbGxlZExvY2FsbHkubWFya2Rvd25EZXNjcmlwdGlvbicsICdMaXN0IG9mIGV4dGVuc2lvbnMgdG8gaW5zdGFsbCB1cG9uIGNvbm5lY3Rpb24gdG8gYSByZW1vdGUgd2hlbiBhbHJlYWR5IGluc3RhbGxlZCBsb2NhbGx5LicpLFxuXHRcdFx0XHRkZWZhdWx0OiBwcm9kdWN0Py5yZW1vdGVEZWZhdWx0RXh0ZW5zaW9uc0lmSW5zdGFsbGVkTG9jYWxseSB8fCBbXSxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRwYXR0ZXJuOiBFWFRFTlNJT05fSURFTlRJRklFUl9QQVRURVJOLFxuXHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdyZW1vdGUuZGVmYXVsdEV4dGVuc2lvbnNJZkluc3RhbGxlZExvY2FsbHkuaW52YWxpZEZvcm1hdCcsICdFeHRlbnNpb24gaWRlbnRpZmllciBtdXN0IGJlIGluIGZvcm1hdCBcInB1Ymxpc2hlci5uYW1lXCIuJylcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFrRSxnQkFBZ0IsY0FBYyxxQkFBcUIsc0NBQXNDO0FBQzNKLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQThDO0FBQ3ZELFNBQVMsaUJBQWlCLE9BQU8sVUFB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
