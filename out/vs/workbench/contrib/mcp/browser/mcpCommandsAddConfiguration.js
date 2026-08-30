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
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { parse as parseJsonc } from "../../../../base/common/jsonc.js";
import { mnemonicButtonLabel } from "../../../../base/common/labels.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { RegistryType } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkbenchMcpManagementService } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { isAgentHostTarget } from "../../chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../chat/common/model/chatUri.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { allDiscoverySources, mcpDiscoverySection, mcpStdioServerSchema } from "../common/mcpConfiguration.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpService, McpConnectionState } from "../common/mcpTypes.js";
import { ILogService } from "../../../../platform/log/common/log.js";
var AddConfigurationType = /* @__PURE__ */ ((AddConfigurationType2) => {
  AddConfigurationType2[AddConfigurationType2["Stdio"] = 0] = "Stdio";
  AddConfigurationType2[AddConfigurationType2["HTTP"] = 1] = "HTTP";
  AddConfigurationType2[AddConfigurationType2["NpmPackage"] = 2] = "NpmPackage";
  AddConfigurationType2[AddConfigurationType2["PipPackage"] = 3] = "PipPackage";
  AddConfigurationType2[AddConfigurationType2["NuGetPackage"] = 4] = "NuGetPackage";
  AddConfigurationType2[AddConfigurationType2["DockerImage"] = 5] = "DockerImage";
  return AddConfigurationType2;
})(AddConfigurationType || {});
const AssistedTypes = {
  [2 /* NpmPackage */]: {
    title: localize("mcp.npm.title", "Enter NPM Package Name"),
    placeholder: localize("mcp.npm.placeholder", "Package name (e.g., @org/package)"),
    pickLabel: localize("mcp.serverType.npm", "NPM Package"),
    pickDescription: localize("mcp.serverType.npm.description", "Install from an NPM package name"),
    enabledConfigKey: null
    // always enabled
  },
  [3 /* PipPackage */]: {
    title: localize("mcp.pip.title", "Enter Pip Package Name"),
    placeholder: localize("mcp.pip.placeholder", "Package name (e.g., package-name)"),
    pickLabel: localize("mcp.serverType.pip", "Pip Package"),
    pickDescription: localize("mcp.serverType.pip.description", "Install from a Pip package name"),
    enabledConfigKey: null
    // always enabled
  },
  [4 /* NuGetPackage */]: {
    title: localize("mcp.nuget.title", "Enter NuGet Package Name"),
    placeholder: localize("mcp.nuget.placeholder", "Package name (e.g., Package.Name)"),
    pickLabel: localize("mcp.serverType.nuget", "NuGet Package"),
    pickDescription: localize("mcp.serverType.nuget.description", "Install from a NuGet package name"),
    enabledConfigKey: "chat.mcp.assisted.nuget.enabled"
  },
  [5 /* DockerImage */]: {
    title: localize("mcp.docker.title", "Enter Docker Image Name"),
    placeholder: localize("mcp.docker.placeholder", "Image name (e.g., mcp/imagename)"),
    pickLabel: localize("mcp.serverType.docker", "Docker Image"),
    pickDescription: localize("mcp.serverType.docker.description", "Install from a Docker image"),
    enabledConfigKey: null
    // always enabled
  }
};
var AddConfigurationCopilotCommand = /* @__PURE__ */ ((AddConfigurationCopilotCommand2) => {
  AddConfigurationCopilotCommand2["IsSupported"] = "github.copilot.chat.mcp.setup.check";
  AddConfigurationCopilotCommand2["ValidatePackage"] = "github.copilot.chat.mcp.setup.validatePackage";
  AddConfigurationCopilotCommand2["StartFlow"] = "github.copilot.chat.mcp.setup.flow";
  return AddConfigurationCopilotCommand2;
})(AddConfigurationCopilotCommand || {});
let McpAddConfigurationCommand = class {
  constructor(workspaceFolder, _quickInputService, _mcpManagementService, _workspaceService, _environmentService, _commandService, _mcpRegistry, _openerService, _editorService, _fileService, _notificationService, _telemetryService, _mcpService, _label, _configurationService, _agentHostCustomizations, _chatWidgetService) {
    this.workspaceFolder = workspaceFolder;
    this._quickInputService = _quickInputService;
    this._mcpManagementService = _mcpManagementService;
    this._workspaceService = _workspaceService;
    this._environmentService = _environmentService;
    this._commandService = _commandService;
    this._mcpRegistry = _mcpRegistry;
    this._openerService = _openerService;
    this._editorService = _editorService;
    this._fileService = _fileService;
    this._notificationService = _notificationService;
    this._telemetryService = _telemetryService;
    this._mcpService = _mcpService;
    this._label = _label;
    this._configurationService = _configurationService;
    this._agentHostCustomizations = _agentHostCustomizations;
    this._chatWidgetService = _chatWidgetService;
  }
  async getServerType() {
    const items = [
      { kind: 0 /* Stdio */, label: localize("mcp.serverType.command", "Command (stdio)"), description: localize("mcp.serverType.command.description", "Run a local command that implements the MCP protocol") },
      { kind: 1 /* HTTP */, label: localize("mcp.serverType.http", "HTTP (HTTP or Server-Sent Events)"), description: localize("mcp.serverType.http.description", "Connect to a remote HTTP server that implements the MCP protocol") }
    ];
    let aiSupported;
    try {
      aiSupported = await this._commandService.executeCommand("github.copilot.chat.mcp.setup.check" /* IsSupported */);
    } catch {
    }
    if (aiSupported) {
      items.unshift({ type: "separator", label: localize("mcp.serverType.manual", "Manual Install") });
      const elligableTypes = Object.entries(AssistedTypes).map(([type, { pickLabel, pickDescription, enabledConfigKey }]) => {
        if (enabledConfigKey) {
          const enabled = this._configurationService.getValue(enabledConfigKey) ?? false;
          if (!enabled) {
            return;
          }
        }
        return {
          kind: Number(type),
          label: pickLabel,
          description: pickDescription
        };
      }).filter((x) => !!x);
      items.push(
        { type: "separator", label: localize("mcp.serverType.copilot", "Model-Assisted") },
        ...elligableTypes
      );
    }
    items.push({ type: "separator" });
    const discovery = this._configurationService.getValue(mcpDiscoverySection);
    if (discovery && typeof discovery === "object" && allDiscoverySources.some((d) => !discovery[d])) {
      items.push({
        kind: "discovery",
        label: localize("mcp.servers.discovery", "Add from another application...")
      });
    }
    items.push({
      kind: "browse",
      label: localize("mcp.servers.browse", "Browse MCP Servers...")
    });
    const result = await this._quickInputService.pick(items, {
      placeHolder: localize("mcp.serverType.placeholder", "Choose the type of MCP server to add")
    });
    if (result?.kind === "browse") {
      this._commandService.executeCommand(McpCommandIds.Browse);
      return void 0;
    }
    if (result?.kind === "discovery") {
      this._commandService.executeCommand("workbench.action.openSettings", mcpDiscoverySection);
      return void 0;
    }
    return result?.kind;
  }
  async getStdioConfig() {
    const command = await this._quickInputService.input({
      title: localize("mcp.command.title", "Enter Command"),
      placeHolder: localize("mcp.command.placeholder", "Command to run (with optional arguments)"),
      ignoreFocusLost: true
    });
    if (!command) {
      return void 0;
    }
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType: "stdio"
    });
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);
    return {
      type: McpServerType.LOCAL,
      command: parts[0].replace(/"/g, ""),
      args: parts.slice(1).map((arg) => arg.replace(/"/g, ""))
    };
  }
  async getSSEConfig() {
    const url = await this._quickInputService.input({
      title: localize("mcp.url.title", "Enter Server URL"),
      placeHolder: localize("mcp.url.placeholder", "URL of the MCP server (e.g., http://localhost:3000)"),
      ignoreFocusLost: true
    });
    if (!url) {
      return void 0;
    }
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType: "sse"
    });
    return { url, type: McpServerType.REMOTE };
  }
  async getServerId(suggestion = `my-mcp-server-${generateUuid().split("-")[0]}`) {
    const id = await this._quickInputService.input({
      title: localize("mcp.serverId.title", "Enter Server ID"),
      placeHolder: localize("mcp.serverId.placeholder", "Unique identifier for this server"),
      value: suggestion,
      ignoreFocusLost: true
    });
    return id;
  }
  async getConfigurationTarget() {
    const options = [
      { target: ConfigurationTarget.USER_LOCAL, label: localize("mcp.target.user", "Global"), description: localize("mcp.target.user.description", "Available in all workspaces, runs locally") }
    ];
    const raLabel = this._environmentService.remoteAuthority && this._label.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
    if (raLabel) {
      options.push({ target: ConfigurationTarget.USER_REMOTE, label: localize("mcp.target.remote", "Remote"), description: localize("mcp.target..remote.description", "Available on this remote machine, runs on {0}", raLabel) });
    }
    const workbenchState = this._workspaceService.getWorkbenchState();
    if (workbenchState !== WorkbenchState.EMPTY) {
      const target = workbenchState === WorkbenchState.FOLDER ? this._workspaceService.getWorkspace().folders[0] : ConfigurationTarget.WORKSPACE;
      if (this._environmentService.remoteAuthority) {
        options.push({ target, label: localize("mcp.target.workspace", "Workspace"), description: localize("mcp.target.workspace.description.remote", "Available in this workspace, runs on {0}", raLabel) });
      } else {
        options.push({ target, label: localize("mcp.target.workspace", "Workspace"), description: localize("mcp.target.workspace.description", "Available in this workspace, runs locally") });
      }
    }
    if (options.length === 1) {
      return options[0].target;
    }
    const targetPick = await this._quickInputService.pick(options, {
      title: localize("mcp.target.title", "Add MCP Server"),
      placeHolder: localize("mcp.target.placeholder", "Select the configuration target")
    });
    return targetPick?.target;
  }
  async getInstallTarget() {
    const session = this._chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
    const hasAgentHostSession = !!session && isAgentHostTarget(getChatSessionType(session));
    if (this.workspaceFolder) {
      return { kind: "local", target: this.workspaceFolder };
    }
    if (session && hasAgentHostSession) {
      const AGENT_HOST_ID = "$agentHost";
      const LOCAL_ID = "$local";
      const items = [
        {
          id: AGENT_HOST_ID,
          label: localize("mcp.target.agentHost", "Add to Current Agent Session"),
          alwaysShow: true
        },
        { type: "separator" },
        {
          id: LOCAL_ID,
          label: localize("mcp.target.local", "Install Server Locally..."),
          iconClass: ThemeIcon.asClassName(Codicon.arrowLeft),
          alwaysShow: true
        }
      ];
      const targetPick = await this._quickInputService.pick(items, {
        title: localize("mcp.target.title", "Add MCP Server"),
        placeHolder: localize("mcp.target.placeholder", "Select the configuration target")
      });
      if (!targetPick) {
        return void 0;
      }
      if (targetPick.id === AGENT_HOST_ID) {
        return { kind: "agentHost", session };
      }
      const target2 = await this.getConfigurationTarget();
      return target2 ? { kind: "local", target: target2 } : void 0;
    }
    const target = await this.getConfigurationTarget();
    return target ? { kind: "local", target } : void 0;
  }
  async getAssistedConfig(type) {
    const packageName = await this._quickInputService.input({
      ignoreFocusLost: true,
      title: AssistedTypes[type].title,
      placeHolder: AssistedTypes[type].placeholder
    });
    if (!packageName) {
      return void 0;
    }
    let LoadAction;
    ((LoadAction2) => {
      LoadAction2["Retry"] = "retry";
      LoadAction2["Cancel"] = "cancel";
      LoadAction2["Allow"] = "allow";
      LoadAction2["OpenUri"] = "openUri";
    })(LoadAction || (LoadAction = {}));
    const loadingQuickPickStore = new DisposableStore();
    const loadingQuickPick = loadingQuickPickStore.add(this._quickInputService.createQuickPick());
    loadingQuickPick.title = localize("mcp.loading.title", "Loading package details...");
    loadingQuickPick.busy = true;
    loadingQuickPick.ignoreFocusOut = true;
    const packageType = this.getPackageType(type);
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType
    });
    this._commandService.executeCommand(
      "github.copilot.chat.mcp.setup.validatePackage" /* ValidatePackage */,
      {
        type: packageType,
        name: packageName,
        targetConfig: {
          ...mcpStdioServerSchema,
          properties: {
            ...mcpStdioServerSchema.properties,
            name: {
              type: "string",
              description: "Suggested name of the server, alphanumeric and hyphen only"
            }
          },
          required: [...mcpStdioServerSchema.required || [], "name"]
        }
      }
    ).then((result) => {
      if (!result || result.state === "error") {
        loadingQuickPick.title = result?.error || "Unknown error loading package";
        const items = [];
        if (result?.helpUri) {
          items.push({
            id: "openUri" /* OpenUri */,
            label: result.helpUriLabel ?? localize("mcp.error.openHelpUri", "Open help URL"),
            helpUri: URI.parse(result.helpUri)
          });
        }
        items.push(
          { id: "retry" /* Retry */, label: localize("mcp.error.retry", "Try a different package") },
          { id: "cancel" /* Cancel */, label: localize("cancel", "Cancel") }
        );
        loadingQuickPick.items = items;
      } else {
        loadingQuickPick.title = localize(
          "mcp.confirmPublish",
          "Install {0}{1} from {2}?",
          result.name ?? packageName,
          result.version ? `@${result.version}` : "",
          result.publisher
        );
        loadingQuickPick.items = [
          { id: "allow" /* Allow */, label: localize("allow", "Allow") },
          { id: "cancel" /* Cancel */, label: localize("cancel", "Cancel") }
        ];
      }
      loadingQuickPick.busy = false;
    });
    const loadingAction = await new Promise((resolve) => {
      loadingQuickPickStore.add(loadingQuickPick.onDidAccept(() => resolve(loadingQuickPick.selectedItems[0])));
      loadingQuickPickStore.add(loadingQuickPick.onDidHide(() => resolve(void 0)));
      loadingQuickPick.show();
    }).finally(() => loadingQuickPickStore.dispose());
    switch (loadingAction?.id) {
      case "retry" /* Retry */:
        return this.getAssistedConfig(type);
      case "openUri" /* OpenUri */:
        if (loadingAction.helpUri) {
          this._openerService.open(loadingAction.helpUri);
        }
        return void 0;
      case "allow" /* Allow */:
        break;
      case "cancel" /* Cancel */:
      default:
        return void 0;
    }
    const config = await this._commandService.executeCommand(
      "github.copilot.chat.mcp.setup.flow" /* StartFlow */,
      {
        name: packageName,
        type: packageType
      }
    );
    if (config?.type === "mapped") {
      return {
        name: config.name,
        server: config.server,
        inputs: config.inputs
      };
    } else if (config?.type === "assisted" || !config?.type) {
      return config;
    } else {
      assertNever(config?.type);
    }
  }
  /** Shows the location of a server config once it's discovered. */
  showOnceDiscovered(name) {
    const store = new DisposableStore();
    store.add(autorun((reader) => {
      const colls = this._mcpRegistry.collections.read(reader);
      const servers = this._mcpService.servers.read(reader);
      const match = mapFindFirst(colls, (collection) => mapFindFirst(
        collection.serverDefinitions.read(reader),
        (server2) => server2.label === name ? { server: server2, collection } : void 0
      ));
      const server = match && servers.find((s) => s.definition.id === match.server.id);
      if (match && server) {
        if (match.collection.presentation?.origin) {
          this._editorService.openEditor({
            resource: match.collection.presentation.origin,
            options: {
              selection: match.server.presentation?.origin?.range,
              preserveFocus: true
            }
          });
        } else {
          this._commandService.executeCommand(McpCommandIds.ServerOptions, name);
        }
        server.start({ promptType: "all-untrusted" }).then((state) => {
          if (state.state === McpConnectionState.Kind.Error) {
            server.showOutput();
          }
        });
        store.dispose();
      }
    }));
    store.add(disposableTimeout(() => store.dispose(), 5e3));
  }
  async run() {
    const serverType = await this.getServerType();
    if (serverType === void 0) {
      return;
    }
    let config;
    let suggestedName;
    let inputs;
    let inputValues;
    switch (serverType) {
      case 0 /* Stdio */:
        config = await this.getStdioConfig();
        break;
      case 1 /* HTTP */:
        config = await this.getSSEConfig();
        break;
      case 2 /* NpmPackage */:
      case 3 /* PipPackage */:
      case 4 /* NuGetPackage */:
      case 5 /* DockerImage */: {
        const r = await this.getAssistedConfig(serverType);
        config = r?.server ? { ...r.server, type: McpServerType.LOCAL } : void 0;
        suggestedName = r?.name;
        inputs = r?.inputs;
        inputValues = r?.inputValues;
        break;
      }
      default:
        assertNever(serverType);
    }
    if (!config) {
      return;
    }
    const name = await this.getServerId(suggestedName);
    if (!name) {
      return;
    }
    const installTarget = await this.getInstallTarget();
    if (!installTarget) {
      return;
    }
    if (installTarget.kind === "agentHost") {
      this._agentHostCustomizations.addMcpServer(installTarget.session, name, config);
      return;
    }
    const { target } = installTarget;
    await this._mcpManagementService.install({ name, config, inputs }, { target });
    if (inputValues) {
      for (const [key, value] of Object.entries(inputValues)) {
        await this._mcpRegistry.setSavedInput(key, (isWorkspaceFolder(target) ? ConfigurationTarget.WORKSPACE_FOLDER : target) ?? ConfigurationTarget.WORKSPACE, value);
      }
    }
    const packageType = this.getPackageType(serverType);
    if (packageType) {
      this._telemetryService.publicLog2("mcp.addserver.completed", {
        packageType,
        serverType: config.type,
        target: target === ConfigurationTarget.WORKSPACE ? "workspace" : "user"
      });
    }
    this.showOnceDiscovered(name);
  }
  async pickForUrlHandler(resource, showIsPrimary = false) {
    const name = decodeURIComponent(basename(resource)).replace(/\.json$/, "");
    const placeHolder = localize("install.title", "Install MCP server {0}", name);
    const items = [
      { id: "install", label: localize("install.start", "Install Server") },
      { id: "show", label: localize("install.show", "Show Configuration", name) },
      { id: "rename", label: localize("install.rename", 'Rename "{0}"', name) },
      { id: "cancel", label: localize("cancel", "Cancel") }
    ];
    if (showIsPrimary) {
      [items[0], items[1]] = [items[1], items[0]];
    }
    const pick = await this._quickInputService.pick(items, { placeHolder, ignoreFocusLost: true });
    const getEditors = () => this._editorService.findEditors(resource);
    switch (pick?.id) {
      case "show":
        await this._editorService.openEditor({ resource });
        break;
      case "install":
        await this._editorService.save(getEditors());
        try {
          const contents = await this._fileService.readFile(resource);
          const { inputs, ...config } = parseJsonc(contents.value.toString());
          await this._mcpManagementService.install({ name, config, inputs });
          this._editorService.closeEditors(getEditors());
          this.showOnceDiscovered(name);
        } catch (e) {
          this._notificationService.error(localize("install.error", "Error installing MCP server {0}: {1}", name, e.message));
          await this._editorService.openEditor({ resource });
        }
        break;
      case "rename": {
        const newName = await this._quickInputService.input({ placeHolder: localize("install.newName", "Enter new name"), value: name });
        if (newName) {
          const newURI = resource.with({ path: `/${encodeURIComponent(newName)}.json` });
          await this._editorService.save(getEditors());
          await this._fileService.move(resource, newURI);
          return this.pickForUrlHandler(newURI, showIsPrimary);
        }
        break;
      }
    }
  }
  getPackageType(serverType) {
    switch (serverType) {
      case 2 /* NpmPackage */:
        return "npm";
      case 3 /* PipPackage */:
        return "pip";
      case 4 /* NuGetPackage */:
        return "nuget";
      case 5 /* DockerImage */:
        return "docker";
      case 0 /* Stdio */:
        return "stdio";
      case 1 /* HTTP */:
        return "sse";
      default:
        return void 0;
    }
  }
};
McpAddConfigurationCommand = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IWorkbenchMcpManagementService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IMcpRegistry),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IFileService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IMcpService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IAgentHostCustomizationService),
  __decorateParam(16, IChatWidgetService)
], McpAddConfigurationCommand);
let McpInstallFromManifestCommand = class {
  constructor(_fileDialogService, _fileService, _quickInputService, _notificationService, _mcpManagementService, _logService) {
    this._fileDialogService = _fileDialogService;
    this._fileService = _fileService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._mcpManagementService = _mcpManagementService;
    this._logService = _logService;
  }
  async run() {
    const result = await this._fileDialogService.showOpenDialog({
      title: localize("mcp.installFromManifest.title", "Select MCP Server Manifest"),
      filters: [{ name: localize("mcp.installFromManifest.filter", "MCP Manifest"), extensions: ["json"] }],
      canSelectFiles: true,
      canSelectMany: false,
      openLabel: mnemonicButtonLabel(localize({ key: "mcp.installFromManifest.openLabel", comment: ["&& denotes a mnemonic"] }, "&&Install"))
    });
    if (!result?.[0]) {
      return;
    }
    const manifestUri = result[0];
    let manifest;
    try {
      const contents = await this._fileService.readFile(manifestUri);
      manifest = parseJsonc(contents.value.toString());
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.readError", "Failed to read manifest file: {0}", e.message));
      return;
    }
    if (!manifest || typeof manifest !== "object") {
      this._notificationService.error(localize("mcp.installFromManifest.invalidJson", "Invalid manifest file: expected a JSON object"));
      return;
    }
    const galleryManifest = manifest;
    let packageType;
    if (Array.isArray(galleryManifest.packages) && galleryManifest.packages.length > 0) {
      packageType = galleryManifest.packages[0].registryType;
    } else if (Array.isArray(galleryManifest.remotes) && galleryManifest.remotes.length > 0) {
      packageType = RegistryType.REMOTE;
    } else {
      this._notificationService.error(localize("mcp.installFromManifest.invalidManifest", "Invalid manifest: expected 'packages' or 'remotes' with at least one entry"));
      return;
    }
    let config;
    let inputs;
    try {
      const { mcpServerConfiguration, notices } = this._mcpManagementService.getMcpServerConfigurationFromManifest(galleryManifest, packageType);
      config = mcpServerConfiguration.config;
      inputs = mcpServerConfiguration.inputs;
      if (notices.length > 0) {
        this._logService.warn(`MCP Management Service: Warnings while installing the MCP server from ${manifestUri.path}`, notices);
      }
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.parseError", "Failed to parse manifest: {0}", e.message));
      return;
    }
    let name = galleryManifest.name;
    if (!name) {
      name = await this._quickInputService.input({
        title: localize("mcp.installFromManifest.serverId.title", "Enter Server ID"),
        placeHolder: localize("mcp.installFromManifest.serverId.placeholder", "Unique identifier for this server"),
        value: basename(manifestUri).replace(/\.json$/i, ""),
        ignoreFocusLost: true
      });
      if (!name) {
        return;
      }
    }
    try {
      await this._mcpManagementService.install({ name, config, inputs });
      this._notificationService.info(localize("mcp.installFromManifest.success", "MCP server '{0}' installed successfully", name));
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.installError", "Failed to install MCP server: {0}", e.message));
    }
  }
};
McpInstallFromManifestCommand = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IWorkbenchMcpManagementService),
  __decorateParam(5, ILogService)
], McpInstallFromManifestCommand);
export {
  AddConfigurationType,
  AssistedTypes,
  McpAddConfigurationCommand,
  McpInstallFromManifestCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwQ29tbWFuZHNBZGRDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFwRmluZEZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUpzb25jIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgbW5lbW9uaWNCdXR0b25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uLCBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlLCBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiwgUmVnaXN0cnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbWNwL2NvbW1vbi9tY3BXb3JrYmVuY2hNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4uL2NvbW1vbi9tY3BDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IGFsbERpc2NvdmVyeVNvdXJjZXMsIERpc2NvdmVyeVNvdXJjZSwgbWNwRGlzY292ZXJ5U2VjdGlvbiwgbWNwU3RkaW9TZXJ2ZXJTY2hlbWEgfSBmcm9tICcuLi9jb21tb24vbWNwQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuLi9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSwgTWNwQ29ubmVjdGlvblN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBBZGRDb25maWd1cmF0aW9uVHlwZSB7XG5cdFN0ZGlvLFxuXHRIVFRQLFxuXG5cdE5wbVBhY2thZ2UsXG5cdFBpcFBhY2thZ2UsXG5cdE51R2V0UGFja2FnZSxcblx0RG9ja2VySW1hZ2UsXG59XG5cbnR5cGUgQXNzaXN0ZWRDb25maWd1cmF0aW9uVHlwZSA9IEFkZENvbmZpZ3VyYXRpb25UeXBlLk5wbVBhY2thZ2UgfCBBZGRDb25maWd1cmF0aW9uVHlwZS5QaXBQYWNrYWdlIHwgQWRkQ29uZmlndXJhdGlvblR5cGUuTnVHZXRQYWNrYWdlIHwgQWRkQ29uZmlndXJhdGlvblR5cGUuRG9ja2VySW1hZ2U7XG5cbnR5cGUgTWNwSW5zdGFsbFRhcmdldCA9IHsga2luZDogJ2xvY2FsJzsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlciB9IHwgeyBraW5kOiAnYWdlbnRIb3N0Jzsgc2Vzc2lvbjogVVJJIH07XG5cbmV4cG9ydCBjb25zdCBBc3Npc3RlZFR5cGVzID0ge1xuXHRbQWRkQ29uZmlndXJhdGlvblR5cGUuTnBtUGFja2FnZV06IHtcblx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5ucG0udGl0bGUnLCBcIkVudGVyIE5QTSBQYWNrYWdlIE5hbWVcIiksXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtY3AubnBtLnBsYWNlaG9sZGVyJywgXCJQYWNrYWdlIG5hbWUgKGUuZy4sIEBvcmcvcGFja2FnZSlcIiksXG5cdFx0cGlja0xhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUubnBtJywgXCJOUE0gUGFja2FnZVwiKSxcblx0XHRwaWNrRGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5ucG0uZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgZnJvbSBhbiBOUE0gcGFja2FnZSBuYW1lXCIpLFxuXHRcdGVuYWJsZWRDb25maWdLZXk6IG51bGwsIC8vIGFsd2F5cyBlbmFibGVkXG5cdH0sXG5cdFtBZGRDb25maWd1cmF0aW9uVHlwZS5QaXBQYWNrYWdlXToge1xuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnBpcC50aXRsZScsIFwiRW50ZXIgUGlwIFBhY2thZ2UgTmFtZVwiKSxcblx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ21jcC5waXAucGxhY2Vob2xkZXInLCBcIlBhY2thZ2UgbmFtZSAoZS5nLiwgcGFja2FnZS1uYW1lKVwiKSxcblx0XHRwaWNrTGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5waXAnLCBcIlBpcCBQYWNrYWdlXCIpLFxuXHRcdHBpY2tEZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLnBpcC5kZXNjcmlwdGlvbicsIFwiSW5zdGFsbCBmcm9tIGEgUGlwIHBhY2thZ2UgbmFtZVwiKSxcblx0XHRlbmFibGVkQ29uZmlnS2V5OiBudWxsLCAvLyBhbHdheXMgZW5hYmxlZFxuXHR9LFxuXHRbQWRkQ29uZmlndXJhdGlvblR5cGUuTnVHZXRQYWNrYWdlXToge1xuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLm51Z2V0LnRpdGxlJywgXCJFbnRlciBOdUdldCBQYWNrYWdlIE5hbWVcIiksXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtY3AubnVnZXQucGxhY2Vob2xkZXInLCBcIlBhY2thZ2UgbmFtZSAoZS5nLiwgUGFja2FnZS5OYW1lKVwiKSxcblx0XHRwaWNrTGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5udWdldCcsIFwiTnVHZXQgUGFja2FnZVwiKSxcblx0XHRwaWNrRGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5udWdldC5kZXNjcmlwdGlvbicsIFwiSW5zdGFsbCBmcm9tIGEgTnVHZXQgcGFja2FnZSBuYW1lXCIpLFxuXHRcdGVuYWJsZWRDb25maWdLZXk6ICdjaGF0Lm1jcC5hc3Npc3RlZC5udWdldC5lbmFibGVkJyxcblx0fSxcblx0W0FkZENvbmZpZ3VyYXRpb25UeXBlLkRvY2tlckltYWdlXToge1xuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLmRvY2tlci50aXRsZScsIFwiRW50ZXIgRG9ja2VyIEltYWdlIE5hbWVcIiksXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtY3AuZG9ja2VyLnBsYWNlaG9sZGVyJywgXCJJbWFnZSBuYW1lIChlLmcuLCBtY3AvaW1hZ2VuYW1lKVwiKSxcblx0XHRwaWNrTGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5kb2NrZXInLCBcIkRvY2tlciBJbWFnZVwiKSxcblx0XHRwaWNrRGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5kb2NrZXIuZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgZnJvbSBhIERvY2tlciBpbWFnZVwiKSxcblx0XHRlbmFibGVkQ29uZmlnS2V5OiBudWxsLCAvLyBhbHdheXMgZW5hYmxlZFxuXHR9LFxufTtcblxuY29uc3QgZW51bSBBZGRDb25maWd1cmF0aW9uQ29waWxvdENvbW1hbmQge1xuXHQvKiogUmV0dXJucyB3aGV0aGVyIE1DUCBlbmhhbmNlZCBzZXR1cCBpcyBlbmFibGVkLiAqL1xuXHRJc1N1cHBvcnRlZCA9ICdnaXRodWIuY29waWxvdC5jaGF0Lm1jcC5zZXR1cC5jaGVjaycsXG5cblx0LyoqIFRha2VzIGFuIG5wbS9waXAgcGFja2FnZSBuYW1lLCB2YWxpZGF0ZXMgaXRzIG93bmVyLiAqL1xuXHRWYWxpZGF0ZVBhY2thZ2UgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5tY3Auc2V0dXAudmFsaWRhdGVQYWNrYWdlJyxcblxuXHQvKiogUmV0dXJucyB0aGUgcmVzb2x2ZWQgTUNQIGNvbmZpZ3VyYXRpb24uICovXG5cdFN0YXJ0RmxvdyA9ICdnaXRodWIuY29waWxvdC5jaGF0Lm1jcC5zZXR1cC5mbG93Jyxcbn1cblxudHlwZSBWYWxpZGF0ZVBhY2thZ2VSZXN1bHQgPVxuXHR7IHN0YXRlOiAnb2snOyBwdWJsaXNoZXI6IHN0cmluZzsgbmFtZT86IHN0cmluZzsgdmVyc2lvbj86IHN0cmluZyB9XG5cdHwgeyBzdGF0ZTogJ2Vycm9yJzsgZXJyb3I6IHN0cmluZzsgaGVscFVyaT86IHN0cmluZzsgaGVscFVyaUxhYmVsPzogc3RyaW5nIH07XG5cbnR5cGUgQWRkU2VydmVyRGF0YSA9IHtcblx0cGFja2FnZVR5cGU6IHN0cmluZztcbn07XG50eXBlIEFkZFNlcnZlckNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnR2VuZXJpYyBkZXRhaWxzIGZvciBhZGRpbmcgYSBuZXcgTUNQIHNlcnZlcic7XG5cdHBhY2thZ2VUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgTUNQIHNlcnZlciBwYWNrYWdlJyB9O1xufTtcbnR5cGUgQWRkU2VydmVyQ29tcGxldGVkRGF0YSA9IHtcblx0cGFja2FnZVR5cGU6IHN0cmluZztcblx0c2VydmVyVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0YXJnZXQ6IHN0cmluZztcbn07XG50eXBlIEFkZFNlcnZlckNvbXBsZXRlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnR2VuZXJpYyBkZXRhaWxzIGZvciBzdWNjZXNzZnVsbHkgYWRkaW5nIG1vZGVsLWFzc2lzdGVkIE1DUCBzZXJ2ZXInO1xuXHRwYWNrYWdlVHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIE1DUCBzZXJ2ZXIgcGFja2FnZScgfTtcblx0c2VydmVyVHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIE1DUCBzZXJ2ZXInIH07XG5cdHRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0YXJnZXQgb2YgdGhlIE1DUCBzZXJ2ZXIgY29uZmlndXJhdGlvbicgfTtcbn07XG5cbnR5cGUgQXNzaXN0ZWRTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHR0eXBlPzogJ2Fzc2lzdGVkJztcblx0bmFtZT86IHN0cmluZztcblx0c2VydmVyOiBPbWl0PElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24sICd0eXBlJz47XG5cdGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdO1xuXHRpbnB1dFZhbHVlcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59IHwge1xuXHR0eXBlOiAnbWFwcGVkJztcblx0bmFtZT86IHN0cmluZztcblx0c2VydmVyOiBPbWl0PElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24sICd0eXBlJz47XG5cdGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdO1xufTtcblxuZXhwb3J0IGNsYXNzIE1jcEFkZENvbmZpZ3VyYXRpb25Db21tYW5kIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbDogSUxhYmVsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RDdXN0b21pemF0aW9uczogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0KSB7IH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNlcnZlclR5cGUoKTogUHJvbWlzZTxBZGRDb25maWd1cmF0aW9uVHlwZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHR5cGUgVEl0ZW0gPSB7IGtpbmQ6IEFkZENvbmZpZ3VyYXRpb25UeXBlIHwgJ2Jyb3dzZScgfCAnZGlzY292ZXJ5JyB9ICYgSVF1aWNrUGlja0l0ZW07XG5cdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PFRJdGVtPltdID0gW1xuXHRcdFx0eyBraW5kOiBBZGRDb25maWd1cmF0aW9uVHlwZS5TdGRpbywgbGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5jb21tYW5kJywgXCJDb21tYW5kIChzdGRpbylcIiksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUuY29tbWFuZC5kZXNjcmlwdGlvbicsIFwiUnVuIGEgbG9jYWwgY29tbWFuZCB0aGF0IGltcGxlbWVudHMgdGhlIE1DUCBwcm90b2NvbFwiKSB9LFxuXHRcdFx0eyBraW5kOiBBZGRDb25maWd1cmF0aW9uVHlwZS5IVFRQLCBsYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLmh0dHAnLCBcIkhUVFAgKEhUVFAgb3IgU2VydmVyLVNlbnQgRXZlbnRzKVwiKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5odHRwLmRlc2NyaXB0aW9uJywgXCJDb25uZWN0IHRvIGEgcmVtb3RlIEhUVFAgc2VydmVyIHRoYXQgaW1wbGVtZW50cyB0aGUgTUNQIHByb3RvY29sXCIpIH1cblx0XHRdO1xuXG5cdFx0bGV0IGFpU3VwcG9ydGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhaVN1cHBvcnRlZCA9IGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4+KEFkZENvbmZpZ3VyYXRpb25Db3BpbG90Q29tbWFuZC5Jc1N1cHBvcnRlZCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVkXG5cdFx0fVxuXG5cdFx0aWYgKGFpU3VwcG9ydGVkKSB7XG5cdFx0XHRpdGVtcy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUubWFudWFsJywgXCJNYW51YWwgSW5zdGFsbFwiKSB9KTtcblxuXHRcdFx0Y29uc3QgZWxsaWdhYmxlVHlwZXMgPSBPYmplY3QuZW50cmllcyhBc3Npc3RlZFR5cGVzKS5tYXAoKFt0eXBlLCB7IHBpY2tMYWJlbCwgcGlja0Rlc2NyaXB0aW9uLCBlbmFibGVkQ29uZmlnS2V5IH1dKSA9PiB7XG5cdFx0XHRcdGlmIChlbmFibGVkQ29uZmlnS2V5KSB7XG5cdFx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KGVuYWJsZWRDb25maWdLZXkpID8/IGZhbHNlO1xuXHRcdFx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IE51bWJlcih0eXBlKSBhcyBBZGRDb25maWd1cmF0aW9uVHlwZSxcblx0XHRcdFx0XHRsYWJlbDogcGlja0xhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwaWNrRGVzY3JpcHRpb24sXG5cdFx0XHRcdH07XG5cdFx0XHR9KS5maWx0ZXIoeCA9PiAhIXgpO1xuXG5cdFx0XHRpdGVtcy5wdXNoKFxuXHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLmNvcGlsb3QnLCBcIk1vZGVsLUFzc2lzdGVkXCIpIH0sXG5cdFx0XHRcdC4uLmVsbGlnYWJsZVR5cGVzXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW0sgaW4gRGlzY292ZXJ5U291cmNlXTogYm9vbGVhbiB9PihtY3BEaXNjb3ZlcnlTZWN0aW9uKTtcblx0XHRpZiAoZGlzY292ZXJ5ICYmIHR5cGVvZiBkaXNjb3ZlcnkgPT09ICdvYmplY3QnICYmIGFsbERpc2NvdmVyeVNvdXJjZXMuc29tZShkID0+ICFkaXNjb3ZlcnlbZF0pKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogJ2Rpc2NvdmVyeScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlcnMuZGlzY292ZXJ5JywgXCJBZGQgZnJvbSBhbm90aGVyIGFwcGxpY2F0aW9uLi4uXCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRraW5kOiAnYnJvd3NlJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlcnMuYnJvd3NlJywgXCJCcm93c2UgTUNQIFNlcnZlcnMuLi5cIiksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrPFRJdGVtPihpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5wbGFjZWhvbGRlcicsIFwiQ2hvb3NlIHRoZSB0eXBlIG9mIE1DUCBzZXJ2ZXIgdG8gYWRkXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3VsdD8ua2luZCA9PT0gJ2Jyb3dzZScpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuQnJvd3NlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdD8ua2luZCA9PT0gJ2Rpc2NvdmVyeScpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIG1jcERpc2NvdmVyeVNlY3Rpb24pO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0Py5raW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTdGRpb0NvbmZpZygpOiBQcm9taXNlPElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb21tYW5kID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AuY29tbWFuZC50aXRsZScsIFwiRW50ZXIgQ29tbWFuZFwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLmNvbW1hbmQucGxhY2Vob2xkZXInLCBcIkNvbW1hbmQgdG8gcnVuICh3aXRoIG9wdGlvbmFsIGFyZ3VtZW50cylcIiksXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFkZFNlcnZlckRhdGEsIEFkZFNlcnZlckNsYXNzaWZpY2F0aW9uPignbWNwLmFkZHNlcnZlcicsIHtcblx0XHRcdHBhY2thZ2VUeXBlOiAnc3RkaW8nXG5cdFx0fSk7XG5cblx0XHQvLyBTcGxpdCBjb21tYW5kIGludG8gY29tbWFuZCBhbmQgYXJncywgaGFuZGxpbmcgcXVvdGVzXG5cdFx0Y29uc3QgcGFydHMgPSBjb21tYW5kLm1hdGNoKC8oPzpbXlxcc1wiXSt8XCJbXlwiXSpcIikrL2cpITtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdGNvbW1hbmQ6IHBhcnRzWzBdLnJlcGxhY2UoL1wiL2csICcnKSxcblxuXHRcdFx0YXJnczogcGFydHMuc2xpY2UoMSkubWFwKGFyZyA9PiBhcmcucmVwbGFjZSgvXCIvZywgJycpKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNTRUNvbmZpZygpOiBQcm9taXNlPElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXJsID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AudXJsLnRpdGxlJywgXCJFbnRlciBTZXJ2ZXIgVVJMXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdtY3AudXJsLnBsYWNlaG9sZGVyJywgXCJVUkwgb2YgdGhlIE1DUCBzZXJ2ZXIgKGUuZy4sIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMClcIiksXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRpZiAoIXVybCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWRkU2VydmVyRGF0YSwgQWRkU2VydmVyQ2xhc3NpZmljYXRpb24+KCdtY3AuYWRkc2VydmVyJywge1xuXHRcdFx0cGFja2FnZVR5cGU6ICdzc2UnXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyB1cmwsIHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNlcnZlcklkKHN1Z2dlc3Rpb24gPSBgbXktbWNwLXNlcnZlci0ke2dlbmVyYXRlVXVpZCgpLnNwbGl0KCctJylbMF19YCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaWQgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5zZXJ2ZXJJZC50aXRsZScsIFwiRW50ZXIgU2VydmVyIElEXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdtY3Auc2VydmVySWQucGxhY2Vob2xkZXInLCBcIlVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIHNlcnZlclwiKSxcblx0XHRcdHZhbHVlOiBzdWdnZXN0aW9uLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk6IFByb21pc2U8Q29uZmlndXJhdGlvblRhcmdldCB8IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvcHRpb25zOiAoSVF1aWNrUGlja0l0ZW0gJiB7IHRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQgfCBJV29ya3NwYWNlRm9sZGVyIH0pW10gPSBbXG5cdFx0XHR7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLCBsYWJlbDogbG9jYWxpemUoJ21jcC50YXJnZXQudXNlcicsIFwiR2xvYmFsXCIpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC50YXJnZXQudXNlci5kZXNjcmlwdGlvbicsIFwiQXZhaWxhYmxlIGluIGFsbCB3b3Jrc3BhY2VzLCBydW5zIGxvY2FsbHlcIikgfVxuXHRcdF07XG5cblx0XHRjb25zdCByYUxhYmVsID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLl9sYWJlbC5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChyYUxhYmVsKSB7XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC5yZW1vdGUnLCBcIlJlbW90ZVwiKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AudGFyZ2V0Li5yZW1vdGUuZGVzY3JpcHRpb24nLCBcIkF2YWlsYWJsZSBvbiB0aGlzIHJlbW90ZSBtYWNoaW5lLCBydW5zIG9uIHswfVwiLCByYUxhYmVsKSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JrYmVuY2hTdGF0ZSA9IHRoaXMuX3dvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRpZiAod29ya2JlbmNoU3RhdGUgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB3b3JrYmVuY2hTdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSID8gdGhpcy5fd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdIDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7XG5cdFx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRvcHRpb25zLnB1c2goeyB0YXJnZXQsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC53b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AudGFyZ2V0LndvcmtzcGFjZS5kZXNjcmlwdGlvbi5yZW1vdGUnLCBcIkF2YWlsYWJsZSBpbiB0aGlzIHdvcmtzcGFjZSwgcnVucyBvbiB7MH1cIiwgcmFMYWJlbCkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHRpb25zLnB1c2goeyB0YXJnZXQsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC53b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AudGFyZ2V0LndvcmtzcGFjZS5kZXNjcmlwdGlvbicsIFwiQXZhaWxhYmxlIGluIHRoaXMgd29ya3NwYWNlLCBydW5zIGxvY2FsbHlcIikgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9uc1swXS50YXJnZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0UGljayA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2sob3B0aW9ucywge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AudGFyZ2V0LnRpdGxlJywgXCJBZGQgTUNQIFNlcnZlclwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC5wbGFjZWhvbGRlcicsIFwiU2VsZWN0IHRoZSBjb25maWd1cmF0aW9uIHRhcmdldFwiKVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRhcmdldFBpY2s/LnRhcmdldDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SW5zdGFsbFRhcmdldCgpOiBQcm9taXNlPE1jcEluc3RhbGxUYXJnZXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGhhc0FnZW50SG9zdFNlc3Npb24gPSAhIXNlc3Npb24gJiYgaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb24pKTtcblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2xvY2FsJywgdGFyZ2V0OiB0aGlzLndvcmtzcGFjZUZvbGRlciB9O1xuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9uICYmIGhhc0FnZW50SG9zdFNlc3Npb24pIHtcblx0XHRcdGNvbnN0IEFHRU5UX0hPU1RfSUQgPSAnJGFnZW50SG9zdCc7XG5cdFx0XHRjb25zdCBMT0NBTF9JRCA9ICckbG9jYWwnO1xuXHRcdFx0dHlwZSBJdGVtVHlwZSA9IHsgaWQ6IHR5cGVvZiBBR0VOVF9IT1NUX0lEIHwgdHlwZW9mIExPQ0FMX0lEIH0gJiBJUXVpY2tQaWNrSXRlbTtcblxuXHRcdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PEl0ZW1UeXBlPltdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IEFHRU5UX0hPU1RfSUQsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AudGFyZ2V0LmFnZW50SG9zdCcsIFwiQWRkIHRvIEN1cnJlbnQgQWdlbnQgU2Vzc2lvblwiKSxcblx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTE9DQUxfSUQsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AudGFyZ2V0LmxvY2FsJywgXCJJbnN0YWxsIFNlcnZlciBMb2NhbGx5Li4uXCIpLFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXJyb3dMZWZ0KSxcblx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgdGFyZ2V0UGljayA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AudGFyZ2V0LnRpdGxlJywgXCJBZGQgTUNQIFNlcnZlclwiKSxcblx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdtY3AudGFyZ2V0LnBsYWNlaG9sZGVyJywgXCJTZWxlY3QgdGhlIGNvbmZpZ3VyYXRpb24gdGFyZ2V0XCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCF0YXJnZXRQaWNrKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0YXJnZXRQaWNrLmlkID09PSBBR0VOVF9IT1NUX0lEKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhZ2VudEhvc3QnLCBzZXNzaW9uIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpO1xuXHRcdFx0cmV0dXJuIHRhcmdldCA/IHsga2luZDogJ2xvY2FsJywgdGFyZ2V0IH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5nZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk7XG5cdFx0cmV0dXJuIHRhcmdldCA/IHsga2luZDogJ2xvY2FsJywgdGFyZ2V0IH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFzc2lzdGVkQ29uZmlnKHR5cGU6IEFzc2lzdGVkQ29uZmlndXJhdGlvblR5cGUpOiBQcm9taXNlPHsgbmFtZT86IHN0cmluZzsgc2VydmVyOiBPbWl0PElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24sICd0eXBlJz47IGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdOyBpbnB1dFZhbHVlcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhY2thZ2VOYW1lID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdFx0dGl0bGU6IEFzc2lzdGVkVHlwZXNbdHlwZV0udGl0bGUsXG5cdFx0XHRwbGFjZUhvbGRlcjogQXNzaXN0ZWRUeXBlc1t0eXBlXS5wbGFjZWhvbGRlcixcblx0XHR9KTtcblxuXHRcdGlmICghcGFja2FnZU5hbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW51bSBMb2FkQWN0aW9uIHtcblx0XHRcdFJldHJ5ID0gJ3JldHJ5Jyxcblx0XHRcdENhbmNlbCA9ICdjYW5jZWwnLFxuXHRcdFx0QWxsb3cgPSAnYWxsb3cnLFxuXHRcdFx0T3BlblVyaSA9ICdvcGVuVXJpJyxcblx0XHR9XG5cblx0XHRjb25zdCBsb2FkaW5nUXVpY2tQaWNrU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbG9hZGluZ1F1aWNrUGljayA9IGxvYWRpbmdRdWlja1BpY2tTdG9yZS5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtICYgeyBpZDogTG9hZEFjdGlvbjsgaGVscFVyaT86IFVSSSB9PigpKTtcblx0XHRsb2FkaW5nUXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ21jcC5sb2FkaW5nLnRpdGxlJywgXCJMb2FkaW5nIHBhY2thZ2UgZGV0YWlscy4uLlwiKTtcblx0XHRsb2FkaW5nUXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdGxvYWRpbmdRdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXG5cdFx0Y29uc3QgcGFja2FnZVR5cGUgPSB0aGlzLmdldFBhY2thZ2VUeXBlKHR5cGUpO1xuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFkZFNlcnZlckRhdGEsIEFkZFNlcnZlckNsYXNzaWZpY2F0aW9uPignbWNwLmFkZHNlcnZlcicsIHtcblx0XHRcdHBhY2thZ2VUeXBlOiBwYWNrYWdlVHlwZSFcblx0XHR9KTtcblxuXHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPFZhbGlkYXRlUGFja2FnZVJlc3VsdD4oXG5cdFx0XHRBZGRDb25maWd1cmF0aW9uQ29waWxvdENvbW1hbmQuVmFsaWRhdGVQYWNrYWdlLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBwYWNrYWdlVHlwZSxcblx0XHRcdFx0bmFtZTogcGFja2FnZU5hbWUsXG5cdFx0XHRcdHRhcmdldENvbmZpZzoge1xuXHRcdFx0XHRcdC4uLm1jcFN0ZGlvU2VydmVyU2NoZW1hLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdC4uLm1jcFN0ZGlvU2VydmVyU2NoZW1hLnByb3BlcnRpZXMsXG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1N1Z2dlc3RlZCBuYW1lIG9mIHRoZSBzZXJ2ZXIsIGFscGhhbnVtZXJpYyBhbmQgaHlwaGVuIG9ubHknLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsuLi4obWNwU3RkaW9TZXJ2ZXJTY2hlbWEucmVxdWlyZWQgfHwgW10pLCAnbmFtZSddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN0YXRlID09PSAnZXJyb3InKSB7XG5cdFx0XHRcdGxvYWRpbmdRdWlja1BpY2sudGl0bGUgPSByZXN1bHQ/LmVycm9yIHx8ICdVbmtub3duIGVycm9yIGxvYWRpbmcgcGFja2FnZSc7XG5cblx0XHRcdFx0Y29uc3QgaXRlbXM6IEFycmF5PElRdWlja1BpY2tJdGVtICYgeyBpZDogTG9hZEFjdGlvbjsgaGVscFVyaT86IFVSSSB9PiA9IFtdO1xuXG5cdFx0XHRcdGlmIChyZXN1bHQ/LmhlbHBVcmkpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiBMb2FkQWN0aW9uLk9wZW5VcmksXG5cdFx0XHRcdFx0XHRsYWJlbDogcmVzdWx0LmhlbHBVcmlMYWJlbCA/PyBsb2NhbGl6ZSgnbWNwLmVycm9yLm9wZW5IZWxwVXJpJywgJ09wZW4gaGVscCBVUkwnKSxcblx0XHRcdFx0XHRcdGhlbHBVcmk6IFVSSS5wYXJzZShyZXN1bHQuaGVscFVyaSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpdGVtcy5wdXNoKFxuXHRcdFx0XHRcdHsgaWQ6IExvYWRBY3Rpb24uUmV0cnksIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmVycm9yLnJldHJ5JywgJ1RyeSBhIGRpZmZlcmVudCBwYWNrYWdlJykgfSxcblx0XHRcdFx0XHR7IGlkOiBMb2FkQWN0aW9uLkNhbmNlbCwgbGFiZWw6IGxvY2FsaXplKCdjYW5jZWwnLCAnQ2FuY2VsJykgfSxcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRsb2FkaW5nUXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2FkaW5nUXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoXG5cdFx0XHRcdFx0J21jcC5jb25maXJtUHVibGlzaCcsICdJbnN0YWxsIHswfXsxfSBmcm9tIHsyfT8nLFxuXHRcdFx0XHRcdHJlc3VsdC5uYW1lID8/IHBhY2thZ2VOYW1lLFxuXHRcdFx0XHRcdHJlc3VsdC52ZXJzaW9uID8gYEAke3Jlc3VsdC52ZXJzaW9ufWAgOiAnJyxcblx0XHRcdFx0XHRyZXN1bHQucHVibGlzaGVyKTtcblx0XHRcdFx0bG9hZGluZ1F1aWNrUGljay5pdGVtcyA9IFtcblx0XHRcdFx0XHR7IGlkOiBMb2FkQWN0aW9uLkFsbG93LCBsYWJlbDogbG9jYWxpemUoJ2FsbG93JywgXCJBbGxvd1wiKSB9LFxuXHRcdFx0XHRcdHsgaWQ6IExvYWRBY3Rpb24uQ2FuY2VsLCBsYWJlbDogbG9jYWxpemUoJ2NhbmNlbCcsICdDYW5jZWwnKSB9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0XHRsb2FkaW5nUXVpY2tQaWNrLmJ1c3kgPSBmYWxzZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxvYWRpbmdBY3Rpb24gPSBhd2FpdCBuZXcgUHJvbWlzZTx7IGlkOiBMb2FkQWN0aW9uOyBoZWxwVXJpPzogVVJJIH0gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bG9hZGluZ1F1aWNrUGlja1N0b3JlLmFkZChsb2FkaW5nUXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHJlc29sdmUobG9hZGluZ1F1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdKSkpO1xuXHRcdFx0bG9hZGluZ1F1aWNrUGlja1N0b3JlLmFkZChsb2FkaW5nUXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHRcdGxvYWRpbmdRdWlja1BpY2suc2hvdygpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gbG9hZGluZ1F1aWNrUGlja1N0b3JlLmRpc3Bvc2UoKSk7XG5cblx0XHRzd2l0Y2ggKGxvYWRpbmdBY3Rpb24/LmlkKSB7XG5cdFx0XHRjYXNlIExvYWRBY3Rpb24uUmV0cnk6XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldEFzc2lzdGVkQ29uZmlnKHR5cGUpO1xuXHRcdFx0Y2FzZSBMb2FkQWN0aW9uLk9wZW5Vcmk6XG5cdFx0XHRcdGlmIChsb2FkaW5nQWN0aW9uLmhlbHBVcmkpIHsgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGxvYWRpbmdBY3Rpb24uaGVscFVyaSk7IH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdGNhc2UgTG9hZEFjdGlvbi5BbGxvdzpcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIExvYWRBY3Rpb24uQ2FuY2VsOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxBc3Npc3RlZFNlcnZlckNvbmZpZ3VyYXRpb24+KFxuXHRcdFx0QWRkQ29uZmlndXJhdGlvbkNvcGlsb3RDb21tYW5kLlN0YXJ0Rmxvdyxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogcGFja2FnZU5hbWUsXG5cdFx0XHRcdHR5cGU6IHBhY2thZ2VUeXBlXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGlmIChjb25maWc/LnR5cGUgPT09ICdtYXBwZWQnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRuYW1lOiBjb25maWcubmFtZSxcblx0XHRcdFx0c2VydmVyOiBjb25maWcuc2VydmVyLFxuXHRcdFx0XHRpbnB1dHM6IGNvbmZpZy5pbnB1dHMsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnPy50eXBlID09PSAnYXNzaXN0ZWQnIHx8ICFjb25maWc/LnR5cGUpIHtcblx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydE5ldmVyKGNvbmZpZz8udHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFNob3dzIHRoZSBsb2NhdGlvbiBvZiBhIHNlcnZlciBjb25maWcgb25jZSBpdCdzIGRpc2NvdmVyZWQuICovXG5cdHByaXZhdGUgc2hvd09uY2VEaXNjb3ZlcmVkKG5hbWU6IHN0cmluZykge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb2xscyA9IHRoaXMuX21jcFJlZ2lzdHJ5LmNvbGxlY3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSB0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBtYXBGaW5kRmlyc3QoY29sbHMsIGNvbGxlY3Rpb24gPT4gbWFwRmluZEZpcnN0KGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRzZXJ2ZXIgPT4gc2VydmVyLmxhYmVsID09PSBuYW1lID8geyBzZXJ2ZXIsIGNvbGxlY3Rpb24gfSA6IHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gbWF0Y2ggJiYgc2VydmVycy5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBtYXRjaC5zZXJ2ZXIuaWQpO1xuXG5cblx0XHRcdGlmIChtYXRjaCAmJiBzZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKG1hdGNoLmNvbGxlY3Rpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4pIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IG1hdGNoLmNvbGxlY3Rpb24ucHJlc2VudGF0aW9uLm9yaWdpbixcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uOiBtYXRjaC5zZXJ2ZXIucHJlc2VudGF0aW9uPy5vcmlnaW4/LnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucywgbmFtZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXJ2ZXIuc3RhcnQoeyBwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcgfSkudGhlbihzdGF0ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcikge1xuXHRcdFx0XHRcdFx0c2VydmVyLnNob3dPdXRwdXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gc3RvcmUuZGlzcG9zZSgpLCA1MDAwKSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFN0ZXAgMTogQ2hvb3NlIHNlcnZlciB0eXBlXG5cdFx0Y29uc3Qgc2VydmVyVHlwZSA9IGF3YWl0IHRoaXMuZ2V0U2VydmVyVHlwZSgpO1xuXHRcdGlmIChzZXJ2ZXJUeXBlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdGVwIDI6IEdldCBzZXJ2ZXIgZGV0YWlscyBiYXNlZCBvbiB0eXBlXG5cdFx0bGV0IGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN1Z2dlc3RlZE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaW5wdXRzOiBJTWNwU2VydmVyVmFyaWFibGVbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaW5wdXRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoIChzZXJ2ZXJUeXBlKSB7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLlN0ZGlvOlxuXHRcdFx0XHRjb25maWcgPSBhd2FpdCB0aGlzLmdldFN0ZGlvQ29uZmlnKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5IVFRQOlxuXHRcdFx0XHRjb25maWcgPSBhd2FpdCB0aGlzLmdldFNTRUNvbmZpZygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuTnBtUGFja2FnZTpcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuUGlwUGFja2FnZTpcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuTnVHZXRQYWNrYWdlOlxuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5Eb2NrZXJJbWFnZToge1xuXHRcdFx0XHRjb25zdCByID0gYXdhaXQgdGhpcy5nZXRBc3Npc3RlZENvbmZpZyhzZXJ2ZXJUeXBlKTtcblx0XHRcdFx0Y29uZmlnID0gcj8uc2VydmVyID8geyAuLi5yLnNlcnZlciwgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCB9IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRzdWdnZXN0ZWROYW1lID0gcj8ubmFtZTtcblx0XHRcdFx0aW5wdXRzID0gcj8uaW5wdXRzO1xuXHRcdFx0XHRpbnB1dFZhbHVlcyA9IHI/LmlucHV0VmFsdWVzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFzc2VydE5ldmVyKHNlcnZlclR5cGUpO1xuXHRcdH1cblxuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCAzOiBHZXQgc2VydmVyIElEXG5cdFx0Y29uc3QgbmFtZSA9IGF3YWl0IHRoaXMuZ2V0U2VydmVySWQoc3VnZ2VzdGVkTmFtZSk7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCA0OiBDaG9vc2UgY29uZmlndXJhdGlvbiB0YXJnZXRcblx0XHRjb25zdCBpbnN0YWxsVGFyZ2V0ID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsVGFyZ2V0KCk7XG5cdFx0aWYgKCFpbnN0YWxsVGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGluc3RhbGxUYXJnZXQua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRcdHRoaXMuX2FnZW50SG9zdEN1c3RvbWl6YXRpb25zLmFkZE1jcFNlcnZlcihpbnN0YWxsVGFyZ2V0LnNlc3Npb24sIG5hbWUsIGNvbmZpZyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0YXJnZXQgfSA9IGluc3RhbGxUYXJnZXQ7XG5cdFx0YXdhaXQgdGhpcy5fbWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbCh7IG5hbWUsIGNvbmZpZywgaW5wdXRzIH0sIHsgdGFyZ2V0IH0pO1xuXG5cdFx0aWYgKGlucHV0VmFsdWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhpbnB1dFZhbHVlcykpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWNwUmVnaXN0cnkuc2V0U2F2ZWRJbnB1dChrZXksIChpc1dvcmtzcGFjZUZvbGRlcih0YXJnZXQpID8gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIDogdGFyZ2V0KSA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhY2thZ2VUeXBlID0gdGhpcy5nZXRQYWNrYWdlVHlwZShzZXJ2ZXJUeXBlKTtcblx0XHRpZiAocGFja2FnZVR5cGUpIHtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZGRTZXJ2ZXJDb21wbGV0ZWREYXRhLCBBZGRTZXJ2ZXJDb21wbGV0ZWRDbGFzc2lmaWNhdGlvbj4oJ21jcC5hZGRzZXJ2ZXIuY29tcGxldGVkJywge1xuXHRcdFx0XHRwYWNrYWdlVHlwZSxcblx0XHRcdFx0c2VydmVyVHlwZTogY29uZmlnLnR5cGUsXG5cdFx0XHRcdHRhcmdldDogdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSA/ICd3b3Jrc3BhY2UnIDogJ3VzZXInXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnNob3dPbmNlRGlzY292ZXJlZChuYW1lKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwaWNrRm9yVXJsSGFuZGxlcihyZXNvdXJjZTogVVJJLCBzaG93SXNQcmltYXJ5ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYW1lID0gZGVjb2RlVVJJQ29tcG9uZW50KGJhc2VuYW1lKHJlc291cmNlKSkucmVwbGFjZSgvXFwuanNvbiQvLCAnJyk7XG5cdFx0Y29uc3QgcGxhY2VIb2xkZXIgPSBsb2NhbGl6ZSgnaW5zdGFsbC50aXRsZScsICdJbnN0YWxsIE1DUCBzZXJ2ZXIgezB9JywgbmFtZSk7XG5cblx0XHRjb25zdCBpdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IFtcblx0XHRcdHsgaWQ6ICdpbnN0YWxsJywgbGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsLnN0YXJ0JywgJ0luc3RhbGwgU2VydmVyJykgfSxcblx0XHRcdHsgaWQ6ICdzaG93JywgbGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsLnNob3cnLCAnU2hvdyBDb25maWd1cmF0aW9uJywgbmFtZSkgfSxcblx0XHRcdHsgaWQ6ICdyZW5hbWUnLCBsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwucmVuYW1lJywgJ1JlbmFtZSBcInswfVwiJywgbmFtZSkgfSxcblx0XHRcdHsgaWQ6ICdjYW5jZWwnLCBsYWJlbDogbG9jYWxpemUoJ2NhbmNlbCcsICdDYW5jZWwnKSB9LFxuXHRcdF07XG5cdFx0aWYgKHNob3dJc1ByaW1hcnkpIHtcblx0XHRcdFtpdGVtc1swXSwgaXRlbXNbMV1dID0gW2l0ZW1zWzFdLCBpdGVtc1swXV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHsgcGxhY2VIb2xkZXIsIGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSB9KTtcblx0XHRjb25zdCBnZXRFZGl0b3JzID0gKCkgPT4gdGhpcy5fZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhyZXNvdXJjZSk7XG5cblx0XHRzd2l0Y2ggKHBpY2s/LmlkKSB7XG5cdFx0XHRjYXNlICdzaG93Jzpcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnaW5zdGFsbCc6XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uuc2F2ZShnZXRFZGl0b3JzKCkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHsgaW5wdXRzLCAuLi5jb25maWcgfTogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gJiB7IGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIH0gPSBwYXJzZUpzb25jKGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX21jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoeyBuYW1lLCBjb25maWcsIGlucHV0cyB9KTtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9ycyhnZXRFZGl0b3JzKCkpO1xuXHRcdFx0XHRcdHRoaXMuc2hvd09uY2VEaXNjb3ZlcmVkKG5hbWUpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnaW5zdGFsbC5lcnJvcicsICdFcnJvciBpbnN0YWxsaW5nIE1DUCBzZXJ2ZXIgezB9OiB7MX0nLCBuYW1lLCBlLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3JlbmFtZSc6IHtcblx0XHRcdFx0Y29uc3QgbmV3TmFtZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdpbnN0YWxsLm5ld05hbWUnLCAnRW50ZXIgbmV3IG5hbWUnKSwgdmFsdWU6IG5hbWUgfSk7XG5cdFx0XHRcdGlmIChuZXdOYW1lKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3VVJJID0gcmVzb3VyY2Uud2l0aCh7IHBhdGg6IGAvJHtlbmNvZGVVUklDb21wb25lbnQobmV3TmFtZSl9Lmpzb25gIH0pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uuc2F2ZShnZXRFZGl0b3JzKCkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUocmVzb3VyY2UsIG5ld1VSSSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucGlja0ZvclVybEhhbmRsZXIobmV3VVJJLCBzaG93SXNQcmltYXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFBhY2thZ2VUeXBlKHNlcnZlclR5cGU6IEFkZENvbmZpZ3VyYXRpb25UeXBlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHNlcnZlclR5cGUpIHtcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuTnBtUGFja2FnZTpcblx0XHRcdFx0cmV0dXJuICducG0nO1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5QaXBQYWNrYWdlOlxuXHRcdFx0XHRyZXR1cm4gJ3BpcCc7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZTpcblx0XHRcdFx0cmV0dXJuICdudWdldCc7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLkRvY2tlckltYWdlOlxuXHRcdFx0XHRyZXR1cm4gJ2RvY2tlcic7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLlN0ZGlvOlxuXHRcdFx0XHRyZXR1cm4gJ3N0ZGlvJztcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuSFRUUDpcblx0XHRcdFx0cmV0dXJuICdzc2UnO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcEluc3RhbGxGcm9tTWFuaWZlc3RDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFN0ZXAgMTogT3BlbiBmaWxlIGRpYWxvZyB0byBzZWxlY3QgdGhlIG1hbmlmZXN0IGZpbGVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnRpdGxlJywgXCJTZWxlY3QgTUNQIFNlcnZlciBNYW5pZmVzdFwiKSxcblx0XHRcdGZpbHRlcnM6IFt7IG5hbWU6IGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC5maWx0ZXInLCBcIk1DUCBNYW5pZmVzdFwiKSwgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG5cdFx0XHRjYW5TZWxlY3RGaWxlczogdHJ1ZSxcblx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0b3BlbkxhYmVsOiBtbmVtb25pY0J1dHRvbkxhYmVsKGxvY2FsaXplKHsga2V5OiAnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3Qub3BlbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSW5zdGFsbFwiKSlcblx0XHR9KTtcblxuXHRcdGlmICghcmVzdWx0Py5bMF0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYW5pZmVzdFVyaSA9IHJlc3VsdFswXTtcblxuXHRcdC8vIFN0ZXAgMjogUmVhZCBhbmQgcGFyc2UgdGhlIG1hbmlmZXN0IGZpbGVcblx0XHRsZXQgbWFuaWZlc3Q6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RVcmkpO1xuXHRcdFx0bWFuaWZlc3QgPSBwYXJzZUpzb25jKGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnJlYWRFcnJvcicsIFwiRmFpbGVkIHRvIHJlYWQgbWFuaWZlc3QgZmlsZTogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghbWFuaWZlc3QgfHwgdHlwZW9mIG1hbmlmZXN0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QuaW52YWxpZEpzb24nLCBcIkludmFsaWQgbWFuaWZlc3QgZmlsZTogZXhwZWN0ZWQgYSBKU09OIG9iamVjdFwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCAzOiBWYWxpZGF0ZSBhbmQgZXh0cmFjdCBjb25maWd1cmF0aW9uIGZyb20gZ2FsbGVyeSBtYW5pZmVzdFxuXHRcdGNvbnN0IGdhbGxlcnlNYW5pZmVzdCA9IG1hbmlmZXN0IGFzIElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiAmIHsgbmFtZT86IHN0cmluZyB9O1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHBhY2thZ2UgdHlwZSBmcm9tIG1hbmlmZXN0XG5cdFx0bGV0IHBhY2thZ2VUeXBlOiBSZWdpc3RyeVR5cGU7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZ2FsbGVyeU1hbmlmZXN0LnBhY2thZ2VzKSAmJiBnYWxsZXJ5TWFuaWZlc3QucGFja2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGFja2FnZVR5cGUgPSBnYWxsZXJ5TWFuaWZlc3QucGFja2FnZXNbMF0ucmVnaXN0cnlUeXBlO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShnYWxsZXJ5TWFuaWZlc3QucmVtb3RlcykgJiYgZ2FsbGVyeU1hbmlmZXN0LnJlbW90ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGFja2FnZVR5cGUgPSBSZWdpc3RyeVR5cGUuUkVNT1RFO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC5pbnZhbGlkTWFuaWZlc3QnLCBcIkludmFsaWQgbWFuaWZlc3Q6IGV4cGVjdGVkICdwYWNrYWdlcycgb3IgJ3JlbW90ZXMnIHdpdGggYXQgbGVhc3Qgb25lIGVudHJ5XCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbjtcblx0XHRsZXQgaW5wdXRzOiBJTWNwU2VydmVyVmFyaWFibGVbXSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBtY3BTZXJ2ZXJDb25maWd1cmF0aW9uLCBub3RpY2VzIH0gPSB0aGlzLl9tY3BNYW5hZ2VtZW50U2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KGdhbGxlcnlNYW5pZmVzdCwgcGFja2FnZVR5cGUpO1xuXHRcdFx0Y29uZmlnID0gbWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWc7XG5cdFx0XHRpbnB1dHMgPSBtY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cztcblxuXHRcdFx0aWYgKG5vdGljZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE1DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IFdhcm5pbmdzIHdoaWxlIGluc3RhbGxpbmcgdGhlIE1DUCBzZXJ2ZXIgZnJvbSAke21hbmlmZXN0VXJpLnBhdGh9YCwgbm90aWNlcyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QucGFyc2VFcnJvcicsIFwiRmFpbGVkIHRvIHBhcnNlIG1hbmlmZXN0OiB7MH1cIiwgZS5tZXNzYWdlKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCA0OiBHZXQgc2VydmVyIG5hbWUgZnJvbSBtYW5pZmVzdCBvciBwcm9tcHQgdXNlclxuXHRcdGxldCBuYW1lID0gZ2FsbGVyeU1hbmlmZXN0Lm5hbWU7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRuYW1lID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnNlcnZlcklkLnRpdGxlJywgXCJFbnRlciBTZXJ2ZXIgSURcIiksXG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3Quc2VydmVySWQucGxhY2Vob2xkZXInLCBcIlVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIHNlcnZlclwiKSxcblx0XHRcdFx0dmFsdWU6IGJhc2VuYW1lKG1hbmlmZXN0VXJpKS5yZXBsYWNlKC9cXC5qc29uJC9pLCAnJyksXG5cdFx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFN0ZXAgNTogSW5zdGFsbCB0byB1c2VyIHNldHRpbmdzXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX21jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoeyBuYW1lLCBjb25maWcsIGlucHV0cyB9KTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3Quc3VjY2VzcycsIFwiTUNQIHNlcnZlciAnezB9JyBpbnN0YWxsZWQgc3VjY2Vzc2Z1bGx5XCIsIG5hbWUpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC5pbnN0YWxsRXJyb3InLCBcIkZhaWxlZCB0byBpbnN0YWxsIE1DUCBzZXJ2ZXI6IHswfVwiLCBlLm1lc3NhZ2UpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJB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SSxLQUFLLHNCQUFzQixzQ0FBc0MsaUJBQWlCLFdBQVc7QUFDekksZUFBUyx1QkFBdUI7QUFDaEMsZUFBUyx1QkFBdUI7QUFFaEMsVUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixhQUFLLFlBQVksS0FBSyx5RUFBeUUsWUFBWSxJQUFJLElBQUksT0FBTztBQUFBLE1BQzNIO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxXQUFLLHFCQUFxQixNQUFNLFNBQVMsc0NBQXNDLGlDQUFpQyxFQUFFLE9BQU8sQ0FBQztBQUMxSDtBQUFBLElBQ0Q7QUFHQSxRQUFJLE9BQU8sZ0JBQWdCO0FBQzNCLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxNQUFNLEtBQUssbUJBQW1CLE1BQU07QUFBQSxRQUMxQyxPQUFPLFNBQVMsMENBQTBDLGlCQUFpQjtBQUFBLFFBQzNFLGFBQWEsU0FBUyxnREFBZ0QsbUNBQW1DO0FBQUEsUUFDekcsT0FBTyxTQUFTLFdBQVcsRUFBRSxRQUFRLFlBQVksRUFBRTtBQUFBLFFBQ25ELGlCQUFpQjtBQUFBLE1BQ2xCLENBQUM7QUFFRCxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJO0FBQ0gsWUFBTSxLQUFLLHNCQUFzQixRQUFRLEVBQUUsTUFBTSxRQUFRLE9BQU8sQ0FBQztBQUNqRSxXQUFLLHFCQUFxQixLQUFLLFNBQVMsbUNBQW1DLDJDQUEyQyxJQUFJLENBQUM7QUFBQSxJQUM1SCxTQUFTLEdBQUc7QUFDWCxXQUFLLHFCQUFxQixNQUFNLFNBQVMsd0NBQXdDLHFDQUFxQyxFQUFFLE9BQU8sQ0FBQztBQUFBLElBQ2pJO0FBQUEsRUFDRDtBQUNEO0FBN0ZhLGdDQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFsiQWRkQ29uZmlndXJhdGlvblR5cGUiLCAiQWRkQ29uZmlndXJhdGlvbkNvcGlsb3RDb21tYW5kIiwgInRhcmdldCIsICJMb2FkQWN0aW9uIiwgInNlcnZlciJdCn0K
