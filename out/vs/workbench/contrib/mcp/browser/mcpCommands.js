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
import { $, addDisposableListener, disposableWindowInterval, EventType } from "../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { findLast } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { groupBy } from "../../../../base/common/collections.js";
import { Event } from "../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, derivedObservableWithCache, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { hasKey, isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuItemAction, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { getCustomizationScopeEnablement } from "../../../../platform/agentHost/common/customizationEnablement.js";
import { CustomizationEnablementKind, McpServerStatus } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { mcpAutoStartConfig, McpAutoStartValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { spinningLoading } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { ActiveEditorContext, RemoteNameContext, ResourceContextKey, WorkbenchStateContext, WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IAuthenticationQueryService } from "../../../services/authentication/common/authenticationQuery.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../../services/configuration/common/configuration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IRemoteUserDataProfilesService } from "../../../services/userDataProfile/common/remoteUserDataProfiles.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { CHAT_CONFIG_MENU_ID } from "../../chat/browser/actions/chatActions.js";
import { ChatViewId, IChatWidgetService } from "../../chat/browser/chat.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { setAgentHostPluginEnablement } from "../../chat/browser/agentPluginActions.js";
import { IAICustomizationWorkspaceService } from "../../chat/common/aiCustomizationWorkspaceService.js";
import { IAgentPluginService } from "../../chat/common/plugins/agentPluginService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatAgentLocation, ChatModeKind } from "../../chat/common/constants.js";
import { ContributionEnablementState, isContributionDisabled } from "../../chat/common/enablement.js";
import { ILanguageModelsService } from "../../chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { extensionsFilterSubMenu, IExtensionsWorkbenchService, VIEWLET_ID } from "../../extensions/common/extensions.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { McpContextKeys } from "../common/mcpContextKeys.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { HasInstalledMcpServersContext, IMcpSamplingService, IMcpService, InstalledMcpServersViewId, LazyCollectionState, McpCapability, McpConnectionState, mcpOAuthClientSecretStorageKey, mcpPromptPrefix, McpServerCacheState, McpStartServerInteraction } from "../common/mcpTypes.js";
import { startServerAndWaitForLiveTools } from "../common/mcpTypesUtils.js";
import { McpAddConfigurationCommand, McpInstallFromManifestCommand } from "./mcpCommandsAddConfiguration.js";
import { McpResourceQuickAccess, McpResourceQuickPick } from "./mcpResourceQuickAccess.js";
import "./media/mcpServerAction.css";
import { openPanelChatAndGetWidget } from "./openPanelChatAndGetWidget.js";
const category = {
  original: "MCP",
  value: "MCP"
};
class ListMcpServerCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ListServer,
      title: localize2("mcp.list", "List Servers"),
      icon: Codicon.server,
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(
            ContextKeyExpr.and(ContextKeyExpr.equals(`config.${mcpAutoStartConfig}`, McpAutoStartValue.Never), McpContextKeys.hasUnknownTools),
            McpContextKeys.hasServersWithErrors
          ),
          ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
          ChatContextKeys.lockedToCodingAgent.negate(),
          ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: 101
      }]
    });
  }
  async run(accessor) {
    const services = {
      chatWidgetService: accessor.get(IChatWidgetService),
      agentHostCustomizations: accessor.get(IAgentHostCustomizationService),
      mcpService: accessor.get(IMcpService),
      commandService: accessor.get(ICommandService),
      quickInput: accessor.get(IQuickInputService),
      notificationService: accessor.get(INotificationService),
      logService: accessor.get(ILogService)
    };
    return this._runWithMode(services, void 0);
  }
  async _runWithMode(services, initialMode) {
    let mode = initialMode;
    if (mode === void 0) {
      const sessionResource = services.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
      const hasAgentHostMcp = sessionResource && services.agentHostCustomizations.getMcpServers(sessionResource).length > 0;
      mode = hasAgentHostMcp ? { agentHostSession: sessionResource } : "local";
    }
    if (mode === "local") {
      await this._runLocal(services);
      return;
    }
    const nextMode = await this._runAgentHost(services, mode.agentHostSession);
    if (nextMode === "local") {
      await this._runWithMode(services, "local");
    }
  }
  async _runLocal(services) {
    const { mcpService, commandService, quickInput } = services;
    const store = new DisposableStore();
    const pick = quickInput.createQuickPick({ useSeparators: true });
    pick.placeholder = localize("mcp.selectServer", "Select an MCP Server");
    mcpService.activateCollections();
    store.add(pick);
    store.add(autorun((reader) => {
      const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => a.collection.order - b.collection.order), (s) => s.collection.id);
      const firstRun = pick.items.length === 0;
      const previousActiveId = pick.activeItems[0]?.id;
      pick.items = [
        { id: "$add", label: localize("mcp.addServer", "Add Server"), description: localize("mcp.addServer.description", "Add a new server configuration"), alwaysShow: true, iconClass: ThemeIcon.asClassName(Codicon.add) },
        ...Object.values(servers).filter((s) => s.length).flatMap((servers2) => [
          { type: "separator", label: servers2[0].collection.label, id: servers2[0].collection.id },
          ...servers2.map((server) => {
            const disabled = isContributionDisabled(server.enablement.read(reader));
            return {
              id: server.definition.id,
              label: server.definition.label,
              description: disabled ? localize("mcp.disabled", "Disabled") : McpConnectionState.toString(server.connectionState.read(reader))
            };
          })
        ])
      ];
      if (previousActiveId) {
        const previousItem = pick.items.find((item) => !("type" in item) && item.id === previousActiveId);
        if (previousItem) {
          pick.activeItems = [previousItem];
          return;
        }
      }
      if (firstRun && pick.items.length > 3) {
        pick.activeItems = pick.items.slice(2, 3);
      }
    }));
    const picked = await new Promise((resolve) => {
      store.add(pick.onDidAccept(() => {
        resolve(pick.activeItems[0]);
      }));
      store.add(pick.onDidHide(() => {
        resolve(void 0);
      }));
      pick.show();
    });
    store.dispose();
    if (!picked) {
    } else if (picked.id === "$add") {
      commandService.executeCommand(McpCommandIds.AddConfiguration);
    } else {
      commandService.executeCommand(McpCommandIds.ServerOptions, picked.id);
    }
  }
  async _runAgentHost(services, agentHostSession) {
    const { agentHostCustomizations, commandService, quickInput } = services;
    const BACK_ID = "$back";
    const store = new DisposableStore();
    const pick = quickInput.createQuickPick({ useSeparators: true });
    pick.placeholder = localize("mcp.selectAgentHostServer", "Select an MCP Server for this session");
    store.add(pick);
    const refresh = () => {
      const firstRun = pick.items.length === 0;
      const previousActiveId = pick.activeItems[0]?.id;
      const servers = agentHostCustomizations.getMcpServers(agentHostSession);
      pick.items = [
        ...servers.length === 0 ? [{
          id: "$empty",
          label: localize("mcp.agentHost.noServers", "No MCP servers"),
          description: localize("mcp.agentHost.noServers.description", "This session does not expose any MCP servers"),
          alwaysShow: true
        }] : servers.map((server) => ({
          id: server.id,
          server,
          label: server.name,
          description: server.enabled ? mcpServerStatusToLabel(server.status) : localize("mcp.disabled", "Disabled"),
          buttons: getAgentHostMcpServerButtons(server)
        })),
        { type: "separator" },
        {
          id: BACK_ID,
          label: localize("mcp.agentHost.showLocal", "Show locally configured servers..."),
          iconClass: ThemeIcon.asClassName(Codicon.arrowLeft),
          alwaysShow: true
        }
      ];
      if (previousActiveId) {
        const previousItem = pick.items.find((item) => !("type" in item) && item.id === previousActiveId);
        if (previousItem) {
          pick.activeItems = [previousItem];
          return;
        }
      }
      if (firstRun && servers.length > 0) {
        pick.activeItems = [pick.items[0]];
      }
    };
    refresh();
    store.add(agentHostCustomizations.onDidChangeCustomizations(() => refresh()));
    store.add(pick.onDidTriggerItemButton(async (event) => {
      if (!isAgentHostMcpServerButton(event.button) || !event.item.server) {
        return;
      }
      pick.busy = true;
      try {
        await runAgentHostMcpServerLifecycleAction(event.item.server, event.button.action, services);
        refresh();
      } finally {
        pick.busy = false;
      }
    }));
    const picked = await new Promise((resolve) => {
      store.add(pick.onDidAccept(() => {
        resolve(pick.activeItems[0]);
      }));
      store.add(pick.onDidHide(() => {
        resolve(void 0);
      }));
      pick.show();
    });
    store.dispose();
    if (!picked || picked.id === "$empty") {
      return void 0;
    }
    if (picked.id === BACK_ID) {
      return "local";
    }
    await commandService.executeCommand(McpCommandIds.AgentHostServerOptions, agentHostSession, picked.id);
    return void 0;
  }
}
function isAgentHostMcpServerButton(button) {
  return "action" in button && (button.action === "start" || button.action === "stop");
}
const startAgentHostMcpServerButton = {
  iconClass: ThemeIcon.asClassName(Codicon.play),
  tooltip: localize("mcp.start", "Start Server"),
  action: "start"
};
const stopAgentHostMcpServerButton = {
  iconClass: ThemeIcon.asClassName(Codicon.debugStop),
  tooltip: localize("mcp.stop", "Stop Server"),
  action: "stop"
};
function getAgentHostMcpServerButtons(server) {
  if (canStartAgentHostMcpServer(server)) {
    return [startAgentHostMcpServerButton];
  }
  if (canStopAgentHostMcpServer(server)) {
    return [stopAgentHostMcpServerButton];
  }
  return [];
}
function canStartAgentHostMcpServer(server) {
  return server.enabled && (server.status === McpServerStatus.Stopped || server.status === McpServerStatus.Error);
}
function canStopAgentHostMcpServer(server) {
  return server.enabled && (server.status === McpServerStatus.Starting || server.status === McpServerStatus.Ready || server.status === McpServerStatus.AuthRequired);
}
async function runAgentHostMcpServerLifecycleAction(server, action, services) {
  try {
    if (action === "start" && canStartAgentHostMcpServer(server)) {
      await server.start();
    } else if (action === "stop" && canStopAgentHostMcpServer(server)) {
      await server.stop();
    }
  } catch (error) {
    services.logService.error(`Failed to ${action} MCP server '${server.name}'`, error);
    const message = error instanceof Error ? error.message : String(error);
    services.notificationService.error(action === "start" ? localize("mcp.agentHost.startError", "Failed to start MCP server '{0}': {1}", server.name, message) : localize("mcp.agentHost.stopError", "Failed to stop MCP server '{0}': {1}", server.name, message));
  }
}
function mcpServerStatusToLabel(status) {
  switch (status) {
    case McpServerStatus.Starting:
      return localize("mcp.agentHost.status.starting", "Starting");
    case McpServerStatus.Ready:
      return localize("mcp.agentHost.status.ready", "Running");
    case McpServerStatus.AuthRequired:
      return localize("mcp.agentHost.status.authRequired", "Authentication required");
    case McpServerStatus.Error:
      return localize("mcp.agentHost.status.error", "Error");
    case McpServerStatus.Stopped:
      return localize("mcp.agentHost.status.stopped", "Stopped");
    default:
      return "";
  }
}
function getAgentHostMcpServerEnablementItems(server, hasWorkspace, scopes = ["global", "workspace", "session"]) {
  const enablement = getCustomizationScopeEnablement(server);
  const items = [];
  if (scopes.includes("global")) {
    items.push({
      label: enablement.global ? localize("mcp.agentHost.disable", "Disable") : localize("mcp.agentHost.enable", "Enable"),
      action: enablement.global ? "disableProfile" : "enableProfile"
    });
  }
  if (scopes.includes("workspace") && hasWorkspace) {
    items.push({
      label: enablement.workspace ? localize("mcp.agentHost.disableWorkspace", "Disable (Workspace)") : localize("mcp.agentHost.enableWorkspace", "Enable (Workspace)"),
      action: enablement.workspace ? "disableWorkspace" : "enableWorkspace"
    });
  }
  if (scopes.includes("session")) {
    items.push({
      label: enablement.session ? localize("mcp.agentHost.disableSession", "Disable (Session)") : localize("mcp.agentHost.enableSession", "Enable (Session)"),
      action: enablement.session ? "disableSession" : "enableSession"
    });
  }
  return items;
}
function getLocalMcpServerEnablementItems(disabled, isEmptyWorkbench, includeWorkspace = true) {
  const items = [];
  if (disabled) {
    items.push({ label: localize("mcp.agentHost.enable", "Enable"), action: "enableProfile" });
    if (includeWorkspace && !isEmptyWorkbench) {
      items.push({ label: localize("mcp.agentHost.enableWorkspace", "Enable (Workspace)"), action: "enableWorkspace" });
    }
  } else {
    items.push({ label: localize("mcp.agentHost.disable", "Disable"), action: "disableProfile" });
    if (includeWorkspace && !isEmptyWorkbench) {
      items.push({ label: localize("mcp.agentHost.disableWorkspace", "Disable (Workspace)"), action: "disableWorkspace" });
    }
  }
  return items;
}
function enablementStateForAction(action) {
  switch (action) {
    case "enableProfile":
      return ContributionEnablementState.EnabledProfile;
    case "disableProfile":
      return ContributionEnablementState.DisabledProfile;
    case "enableWorkspace":
      return ContributionEnablementState.EnabledWorkspace;
    case "disableWorkspace":
      return ContributionEnablementState.DisabledWorkspace;
  }
}
function findLocalMcpServer(mcpService, server) {
  const servers = mcpService.servers.get();
  const separator = server.id.indexOf("/");
  const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
  const idMatches = servers.filter((candidate) => candidate.definition.id === rawId);
  if (idMatches.length === 1) {
    return idMatches[0];
  }
  const nameMatches = servers.filter((candidate) => candidate.definition.label === server.name);
  return nameMatches.length === 1 ? nameMatches[0] : void 0;
}
class McpAgentHostServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.AgentHostServerOptions,
      title: localize2("mcp.agentHostOptions", "Agent Host Server Options"),
      category,
      f1: false
    });
  }
  async run(accessor, agentHostSession, customizationId) {
    const agentHostCustomizations = accessor.get(IAgentHostCustomizationService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    const logService = accessor.get(ILogService);
    const aiCustomizationWorkspaceService = accessor.get(IAICustomizationWorkspaceService);
    const agentPluginService = accessor.get(IAgentPluginService);
    const mcpService = accessor.get(IMcpService);
    const server = agentHostCustomizations.getMcpServers(agentHostSession).find((s) => s.id === customizationId);
    if (!server) {
      return;
    }
    const items = [
      { type: "separator", label: localize("mcp.actions.status", "Status") }
    ];
    if (canStartAgentHostMcpServer(server)) {
      items.push({
        label: localize("mcp.start", "Start Server"),
        description: mcpServerStatusToLabel(server.status),
        action: "start"
      });
    } else if (canStopAgentHostMcpServer(server)) {
      items.push({
        label: localize("mcp.stop", "Stop Server"),
        description: mcpServerStatusToLabel(server.status),
        action: "stop"
      });
    }
    const pluginDisabled = server.disabledReason?.source === "plugin";
    const localServer = findLocalMcpServer(mcpService, server);
    const durableProfileDisabled = localServer !== void 0 && !mcpService.enablementModel.readProfileEnabled(localServer.definition.id);
    const isEmptyWorkbench = aiCustomizationWorkspaceService.getActiveProjectRoot() === void 0;
    items.push({ type: "separator", label: localize("mcp.actions.enablement", "Enablement") });
    if (pluginDisabled) {
      items.push({
        label: localize("mcp.agentHost.enablePlugin", "Enable Plugin"),
        action: "enablePlugin"
      });
    } else {
      items.push(
        ...localServer ? [
          ...getLocalMcpServerEnablementItems(durableProfileDisabled, isEmptyWorkbench, false),
          ...getAgentHostMcpServerEnablementItems(server, agentHostCustomizations.getWorkingDirectories(agentHostSession).length > 0, ["workspace", "session"])
        ] : getAgentHostMcpServerEnablementItems(server, agentHostCustomizations.getWorkingDirectories(agentHostSession).length > 0)
      );
    }
    if (server.enabled && server.state.kind === McpServerStatus.AuthRequired) {
      items.push({
        label: localize("mcp.agentHost.authenticate", "Authenticate"),
        description: server.state.resource.resource,
        action: "authenticate"
      });
    }
    items.push({
      label: localize("mcp.showOutput", "Show Output"),
      action: "showOutput"
    });
    const picked = await quickInputService.pick(items, {
      placeHolder: server.name
    });
    if (!picked || !hasKey(picked, { action: true })) {
      return;
    }
    if (picked.action === "showOutput") {
      agentHostCustomizations.showMcpServerLog(agentHostSession, server.id);
      return;
    }
    if (picked.action === "authenticate") {
      await agentHostCustomizations.authenticateMcpServer(agentHostSession, server.id);
      return;
    }
    if (picked.action === "start" || picked.action === "stop") {
      await runAgentHostMcpServerLifecycleAction(server, picked.action, { notificationService, logService });
      return;
    }
    if (picked.action === "enablePlugin") {
      const reason = server.disabledReason;
      if (reason?.source === "plugin") {
        const decision = reason.plugin.enablement?.[0];
        if (decision) {
          setAgentHostPluginEnablement(agentHostCustomizations, agentPluginService, agentHostSession, reason.plugin, decision.kind, true);
        }
      }
      return;
    }
    if (localServer && (picked.action === "enableProfile" || picked.action === "disableProfile")) {
      const state = enablementStateForAction(picked.action);
      mcpService.enablementModel.setEnabled(localServer.definition.id, state);
      return;
    }
    const scope = picked.action === "enableProfile" || picked.action === "disableProfile" ? CustomizationEnablementKind.Global : picked.action === "enableWorkspace" || picked.action === "disableWorkspace" ? CustomizationEnablementKind.Workspace : CustomizationEnablementKind.Session;
    const enabled = picked.action === "enableProfile" || picked.action === "enableWorkspace" || picked.action === "enableSession";
    agentHostCustomizations.setCustomizationEnablement(agentHostSession, server.id, server.enablement, scope, enabled);
  }
}
class McpConfirmationServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ServerOptionsInConfirmation,
      title: localize2("mcp.options", "Server Options"),
      category,
      icon: Codicon.settingsGear,
      f1: false,
      menu: [{
        id: MenuId.ChatConfirmationMenu,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("chatConfirmationPartSource", "mcp"),
          ContextKeyExpr.or(
            ContextKeyExpr.equals("chatConfirmationPartType", "chatToolConfirmation"),
            ContextKeyExpr.equals("chatConfirmationPartType", "elicitation")
          )
        ),
        group: "navigation"
      }]
    });
  }
  async run(accessor, arg) {
    const toolsService = accessor.get(ILanguageModelToolsService);
    if (arg.kind === "toolInvocation") {
      const tool = toolsService.getTool(arg.toolId);
      if (tool?.source.type === "mcp") {
        accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, tool.source.definitionId);
      }
    } else if (arg.kind === "elicitation2") {
      if (arg.source?.type === "mcp") {
        accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, arg.source.definitionId);
      }
    } else {
      assertNever(arg);
    }
  }
}
class McpServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ServerOptions,
      title: localize2("mcp.options", "Server Options"),
      category,
      f1: false
    });
  }
  async run(accessor, id) {
    const mcpService = accessor.get(IMcpService);
    const quickInputService = accessor.get(IQuickInputService);
    const mcpRegistry = accessor.get(IMcpRegistry);
    const editorService = accessor.get(IEditorService);
    const commandService = accessor.get(ICommandService);
    const samplingService = accessor.get(IMcpSamplingService);
    const authenticationQueryService = accessor.get(IAuthenticationQueryService);
    const authenticationService = accessor.get(IAuthenticationService);
    const server = mcpService.servers.get().find((s) => s.definition.id === id);
    if (!server) {
      return;
    }
    const collection = mcpRegistry.collections.get().find((c) => c.id === server.collection.id);
    const serverDefinition = collection?.serverDefinitions.get().find((s) => s.id === server.definition.id);
    const items = [];
    const serverState = server.connectionState.get();
    const disabled = isContributionDisabled(server.enablement.get());
    items.push({ type: "separator", label: localize("mcp.actions.status", "Status") });
    if (disabled) {
      items.push({
        label: localize("mcp.enableWorkspace", "Enable Server (Workspace)"),
        action: "enable"
      });
    } else if (McpConnectionState.canBeStarted(serverState.state)) {
      items.push({
        label: localize("mcp.start", "Start Server"),
        action: "start"
      });
    } else {
      items.push({
        label: localize("mcp.stop", "Stop Server"),
        action: "stop"
      });
      items.push({
        label: localize("mcp.restart", "Restart Server"),
        action: "restart"
      });
    }
    items.push(...this._getAuthActions(authenticationQueryService, server.definition.id));
    const configTarget = serverDefinition?.presentation?.origin || collection?.presentation?.origin;
    if (configTarget) {
      items.push({
        label: localize("mcp.config", "Show Configuration"),
        action: "config"
      });
    }
    items.push({
      label: localize("mcp.showOutput", "Show Output"),
      action: "showOutput"
    });
    items.push(
      { type: "separator", label: localize("mcp.actions.sampling", "Sampling") },
      {
        label: localize("mcp.configAccess", "Configure Model Access"),
        description: localize("mcp.showOutput.description", "Set the models the server can use via MCP sampling"),
        action: "configSampling"
      }
    );
    if (samplingService.hasLogs(server)) {
      items.push({
        label: localize("mcp.samplingLog", "Show Sampling Requests"),
        description: localize("mcp.samplingLog.description", "Show the sampling requests for this server"),
        action: "samplingLog"
      });
    }
    const capabilities = server.capabilities.get();
    if (capabilities === void 0 || capabilities & McpCapability.Resources) {
      items.push({ type: "separator", label: localize("mcp.actions.resources", "Resources") });
      items.push({
        label: localize("mcp.resources", "Browse Resources"),
        action: "resources"
      });
    }
    const pick = await quickInputService.pick(items, {
      placeHolder: localize("mcp.selectAction", "Select action for '{0}'", server.definition.label)
    });
    if (!pick) {
      return;
    }
    switch (pick.action) {
      case "enable":
        mcpService.enablementModel.setEnabled(server.definition.id, ContributionEnablementState.EnabledWorkspace);
        break;
      case "start":
        await server.start({ promptType: "all-untrusted" });
        server.showOutput();
        break;
      case "stop":
        await server.stop();
        break;
      case "restart":
        await server.stop();
        await server.start({ promptType: "all-untrusted" });
        break;
      case "disconnect":
        await server.stop();
        await this._handleAuth(authenticationService, pick.accountQuery, server.definition, false);
        break;
      case "signout":
        await server.stop();
        await this._handleAuth(authenticationService, pick.accountQuery, server.definition, true);
        break;
      case "showOutput":
        server.showOutput();
        break;
      case "config":
        editorService.openEditor({
          resource: URI.isUri(configTarget) ? configTarget : configTarget.uri,
          options: { selection: URI.isUri(configTarget) ? void 0 : configTarget.range }
        });
        break;
      case "configSampling":
        return commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
      case "resources":
        return commandService.executeCommand(McpCommandIds.BrowseResources, server);
      case "samplingLog":
        editorService.openEditor({
          resource: void 0,
          contents: samplingService.getLogText(server),
          label: localize("mcp.samplingLog.title", "MCP Sampling: {0}", server.definition.label)
        });
        break;
      default:
        assertNever(pick);
    }
  }
  _getAuthActions(authenticationQueryService, serverId) {
    const result = [];
    for (const [providerId, accountName] of authenticationQueryService.mcpServer(serverId).getAllAccountPreferences()) {
      const accountQuery = authenticationQueryService.provider(providerId).account(accountName);
      if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
        continue;
      }
      if (accountQuery.entities().getEntityCount().total > 1) {
        result.push({
          action: "disconnect",
          label: localize("mcp.disconnect", "Disconnect Account"),
          description: `(${accountName})`,
          accountQuery
        });
      } else {
        result.push({
          action: "signout",
          label: localize("mcp.signOut", "Sign Out"),
          description: `(${accountName})`,
          accountQuery
        });
      }
    }
    return result;
  }
  async _handleAuth(authenticationService, accountQuery, definition, signOut) {
    const { providerId, accountName } = accountQuery;
    accountQuery.mcpServer(definition.id).setAccessAllowed(false, definition.label);
    if (signOut) {
      const accounts = await authenticationService.getAccounts(providerId);
      const account = accounts.find((a) => a.label === accountName);
      if (account) {
        const sessions = await authenticationService.getSessions(providerId, void 0, { account });
        for (const session of sessions) {
          await authenticationService.removeSession(providerId, session.id);
        }
      }
    }
  }
}
let MCPServerActionRendering = class extends Disposable {
  constructor(actionViewItemService, mcpService, instaService, commandService, configurationService) {
    super();
    const hoverIsOpen = observableValue(this, false);
    const config = observableConfigValue(mcpAutoStartConfig, McpAutoStartValue.NewAndOutdated, configurationService);
    let DisplayedState;
    ((DisplayedState2) => {
      DisplayedState2[DisplayedState2["None"] = 0] = "None";
      DisplayedState2[DisplayedState2["NewTools"] = 1] = "NewTools";
      DisplayedState2[DisplayedState2["Error"] = 2] = "Error";
      DisplayedState2[DisplayedState2["Refreshing"] = 3] = "Refreshing";
    })(DisplayedState || (DisplayedState = {}));
    function isServer(s) {
      return typeof s.start === "function";
    }
    const displayedStateCurrent = derived((reader) => {
      const servers = mcpService.servers.read(reader);
      const serversPerState = [];
      for (const server of servers) {
        let thisState = 0 /* None */;
        switch (server.cacheState.read(reader)) {
          case McpServerCacheState.Unknown:
          case McpServerCacheState.Outdated:
            thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? 2 /* Error */ : 1 /* NewTools */;
            break;
          case McpServerCacheState.RefreshingFromUnknown:
            thisState = 3 /* Refreshing */;
            break;
          default:
            thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? 2 /* Error */ : 0 /* None */;
            break;
        }
        serversPerState[thisState] ??= [];
        serversPerState[thisState].push(server);
      }
      const unknownServerStates = mcpService.lazyCollectionState.read(reader);
      if (unknownServerStates.state === LazyCollectionState.LoadingUnknown) {
        serversPerState[3 /* Refreshing */] ??= [];
        serversPerState[3 /* Refreshing */].push(...unknownServerStates.collections);
      } else if (unknownServerStates.state === LazyCollectionState.HasUnknown) {
        serversPerState[1 /* NewTools */] ??= [];
        serversPerState[1 /* NewTools */].push(...unknownServerStates.collections);
      }
      let maxState = serversPerState.length - 1;
      if (maxState === 1 /* NewTools */ && config.read(reader) !== McpAutoStartValue.Never) {
        maxState = 0 /* None */;
      }
      return { state: maxState, servers: serversPerState[maxState] || [] };
    });
    const displayedState = derivedObservableWithCache(this, (reader, last) => {
      if (last && hoverIsOpen.read(reader)) {
        return last;
      } else {
        return displayedStateCurrent.read(reader);
      }
    });
    const actionItemState = displayedState.map((s) => s.state);
    this._store.add(actionViewItemService.register(MenuId.ChatInput, McpCommandIds.ListServer, (action, options) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instaService.createInstance(class extends MenuEntryActionViewItem {
        render(container) {
          super.render(container);
          container.classList.add("chat-mcp");
          container.style.position = "relative";
          const stateIndicator = container.appendChild($(".chat-mcp-state-indicator"));
          stateIndicator.style.display = "none";
          this._register(autorun((r) => {
            const displayed = displayedState.read(r);
            const { state } = displayed;
            this.updateTooltip();
            stateIndicator.ariaLabel = this.getLabelForState(displayed);
            stateIndicator.className = "chat-mcp-state-indicator";
            if (state === 1 /* NewTools */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-new", ...ThemeIcon.asClassNameArray(Codicon.refresh));
            } else if (state === 2 /* Error */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-error", ...ThemeIcon.asClassNameArray(Codicon.warning));
            } else if (state === 3 /* Refreshing */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-refreshing", ...ThemeIcon.asClassNameArray(spinningLoading));
            } else {
              stateIndicator.style.display = "none";
            }
          }));
        }
        async onClick(e) {
          e.preventDefault();
          e.stopPropagation();
          const { state, servers } = displayedStateCurrent.get();
          if (state === 1 /* NewTools */) {
            const interaction = new McpStartServerInteraction();
            servers.filter(isServer).forEach((server) => server.stop().then(() => server.start({ interaction })));
            mcpService.activateCollections();
          } else if (state === 3 /* Refreshing */) {
            findLast(servers, isServer)?.showOutput();
          } else if (state === 2 /* Error */) {
            const server = findLast(servers, isServer);
            if (server) {
              await server.showOutput(true);
              commandService.executeCommand(McpCommandIds.ServerOptions, server.definition.id);
            }
          } else {
            commandService.executeCommand(McpCommandIds.ListServer);
          }
        }
        getTooltip() {
          return this.getLabelForState() || super.getTooltip();
        }
        getHoverContents({ state, servers } = displayedStateCurrent.get()) {
          const link = (s) => createMarkdownCommandLink({
            text: s.definition.label,
            id: McpCommandIds.ServerOptions,
            arguments: [s.definition.id],
            tooltip: localize("mcp.server.options.tooltip", "Show server options for {0}", s.definition.label)
          });
          const single = servers.length === 1;
          const names = servers.map((s) => isServer(s) ? link(s) : "`" + s.label + "`").map((l) => single ? l : `- ${l}`).join("\n");
          let markdown;
          if (state === 1 /* NewTools */) {
            markdown = new MarkdownString(
              single ? localize("mcp.newTools.md.single", "MCP server {0} has been updated and may have new tools available.", names) : localize("mcp.newTools.md.multi", "MCP servers have been updated and may have new tools available:\n\n{0}", names)
            );
          } else if (state === 2 /* Error */) {
            markdown = new MarkdownString(
              single ? localize("mcp.err.md.single", "MCP server {0} was unable to start successfully.", names) : localize("mcp.err.md.multi", "Multiple MCP servers were unable to start successfully:\n\n{0}", names)
            );
          } else {
            return this.getLabelForState() || void 0;
          }
          return {
            element: (token) => {
              hoverIsOpen.set(true, void 0);
              const store = new DisposableStore();
              store.add(toDisposable(() => hoverIsOpen.set(false, void 0)));
              store.add(token.onCancellationRequested(() => {
                store.dispose();
              }));
              store.add(disposableWindowInterval(mainWindow, () => {
                if (!container.isConnected) {
                  store.dispose();
                }
              }, 2e3));
              const container = $("div.mcp-hover-contents");
              markdown.isTrusted = true;
              const markdownResult = store.add(renderMarkdown(markdown));
              container.appendChild(markdownResult.element);
              const divider = $("hr.mcp-hover-divider");
              container.appendChild(divider);
              const checkboxContainer = $("div.mcp-hover-setting");
              const settingLabelStr = localize("mcp.autoStart", "Automatically start MCP servers when sending a chat message");
              const checkbox = store.add(new Checkbox(
                settingLabelStr,
                config.get() !== McpAutoStartValue.Never,
                { ...defaultCheckboxStyles }
              ));
              checkboxContainer.appendChild(checkbox.domNode);
              const settingLabel = $("span.mcp-hover-setting-label", void 0, settingLabelStr);
              checkboxContainer.appendChild(settingLabel);
              const onChange = () => {
                const newValue = checkbox.checked ? McpAutoStartValue.NewAndOutdated : McpAutoStartValue.Never;
                configurationService.updateValue(mcpAutoStartConfig, newValue);
              };
              store.add(checkbox.onChange(onChange));
              store.add(addDisposableListener(settingLabel, EventType.CLICK, () => {
                checkbox.checked = !checkbox.checked;
                onChange();
              }));
              container.appendChild(checkboxContainer);
              return container;
            }
          };
        }
        getLabelForState({ state, servers } = displayedStateCurrent.get()) {
          if (state === 1 /* NewTools */) {
            return localize("mcp.newTools", "New tools available ({0})", servers.length || 1);
          } else if (state === 2 /* Error */) {
            return localize("mcp.toolError", "Error loading {0} tool(s)", servers.length || 1);
          } else if (state === 3 /* Refreshing */) {
            return localize("mcp.toolRefresh", "Discovering tools...");
          } else {
            return null;
          }
        }
      }, action, { ...options, keybindingNotRenderedWithLabel: true });
    }, Event.fromObservableLight(actionItemState)));
  }
};
MCPServerActionRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService)
], MCPServerActionRendering);
class ResetMcpTrustCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ResetTrust,
      title: localize2("mcp.resetTrust", "Reset Trust"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  run(accessor) {
    const mcpService = accessor.get(IMcpService);
    mcpService.resetTrust();
  }
}
class ResetMcpCachedTools extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ResetCachedTools,
      title: localize2("mcp.resetCachedTools", "Reset Cached Tools"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  run(accessor) {
    const mcpService = accessor.get(IMcpService);
    mcpService.resetCaches();
  }
}
class AddConfigurationAction extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.AddConfiguration,
      title: localize2("mcp.addConfiguration", "Add Server..."),
      metadata: {
        description: localize2("mcp.addConfiguration.description", "Installs a new Model Context protocol to the mcp.json settings")
      },
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]mcp\.json$/),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
          ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
        )
      }
    });
  }
  async run(accessor, configUri) {
    const instantiationService = accessor.get(IInstantiationService);
    const workspaceService = accessor.get(IWorkspaceContextService);
    const target = configUri ? workspaceService.getWorkspaceFolder(URI.parse(configUri)) : void 0;
    return instantiationService.createInstance(McpAddConfigurationCommand, target ?? void 0).run();
  }
}
class InstallFromManifestAction extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.InstallFromManifest,
      title: localize2("mcp.installFromManifest", "Install Server from Manifest..."),
      metadata: {
        description: localize2("mcp.installFromManifest.description", "Install an MCP server from a JSON manifest file")
      },
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    return instantiationService.createInstance(McpInstallFromManifestCommand).run();
  }
}
class RemoveStoredInput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.RemoveStoredInput,
      title: localize2("mcp.resetCachedTools", "Reset Cached Tools"),
      category,
      f1: false
    });
  }
  run(accessor, scope, id) {
    accessor.get(IMcpRegistry).clearSavedInputs(scope, id);
  }
}
class EditStoredInput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.EditStoredInput,
      title: localize2("mcp.editStoredInput", "Edit Stored Input"),
      category,
      f1: false
    });
  }
  run(accessor, inputId, uri, configSection, target) {
    const workspaceFolder = uri && accessor.get(IWorkspaceContextService).getWorkspaceFolder(uri);
    accessor.get(IMcpRegistry).editSavedInput(inputId, workspaceFolder || void 0, configSection, target);
  }
}
class SetOAuthClientSecret extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.SetOAuthClientSecret,
      title: localize2("mcp.setOAuthClientSecret", "Set OAuth Client Secret"),
      category,
      f1: false
    });
  }
  async run(accessor, clientId, mcpServerUrl, serverName) {
    const quickInputService = accessor.get(IQuickInputService);
    const secretStorageService = accessor.get(ISecretStorageService);
    const key = mcpOAuthClientSecretStorageKey(mcpServerUrl, clientId);
    const existing = await secretStorageService.get(key);
    const deleteButton = {
      iconClass: ThemeIcon.asClassName(Codicon.trash),
      tooltip: localize("mcp.setOAuthClientSecret.delete", "Delete stored client secret")
    };
    const revealButton = {
      iconClass: ThemeIcon.asClassName(Codicon.eye),
      tooltip: localize("mcp.setOAuthClientSecret.reveal", "Show client secret")
    };
    const hideButton = {
      iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
      tooltip: localize("mcp.setOAuthClientSecret.hide", "Hide client secret")
    };
    const result = await new Promise((resolve) => {
      const input = quickInputService.createInputBox();
      input.title = existing ? localize("mcp.setOAuthClientSecret.title.replace", "Replace Client Secret for {0}", serverName) : localize("mcp.setOAuthClientSecret.title.set", "Set Client Secret for {0}", serverName);
      input.prompt = localize("mcp.setOAuthClientSecret.prompt", "Enter the client secret for OAuth client '{0}'.", clientId);
      input.placeholder = existing ? localize("mcp.setOAuthClientSecret.placeholder.replace", "Enter a new client secret to replace the stored value") : localize("mcp.setOAuthClientSecret.placeholder.set", "Enter client secret");
      input.password = true;
      input.ignoreFocusOut = true;
      if (existing) {
        input.value = existing;
        input.valueSelection = [0, existing.length];
      }
      const updateButtons = () => {
        const toggleButton = input.password ? revealButton : hideButton;
        input.buttons = existing ? [toggleButton, deleteButton] : [toggleButton];
      };
      updateButtons();
      const disposables = new DisposableStore();
      disposables.add(input.onDidAccept(() => {
        const value = input.value;
        if (value.length === 0) {
          resolve({ kind: "delete" });
          input.hide();
          return;
        }
        resolve({ kind: "accept", value });
        input.hide();
      }));
      disposables.add(input.onDidTriggerButton((btn) => {
        if (btn === deleteButton) {
          resolve({ kind: "delete" });
          input.hide();
        } else if (btn === revealButton || btn === hideButton) {
          input.password = !input.password;
          updateButtons();
        }
      }));
      disposables.add(input.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
        input.dispose();
      }));
      input.show();
    });
    if (!result) {
      return;
    }
    if (result.kind === "delete") {
      await secretStorageService.delete(key);
    } else {
      await secretStorageService.set(key, result.value);
    }
  }
}
class ShowConfiguration extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowConfiguration,
      title: localize2("mcp.command.showConfiguration", "Show Configuration"),
      category,
      f1: false
    });
  }
  run(accessor, collectionId, serverId) {
    const collection = accessor.get(IMcpRegistry).collections.get().find((c) => c.id === collectionId);
    if (!collection) {
      return;
    }
    const server = collection?.serverDefinitions.get().find((s) => s.id === serverId);
    const editorService = accessor.get(IEditorService);
    if (server?.presentation?.origin) {
      editorService.openEditor({
        resource: server.presentation.origin.uri,
        options: { selection: server.presentation.origin.range }
      });
    } else if (collection.presentation?.origin) {
      editorService.openEditor({
        resource: collection.presentation.origin
      });
    }
  }
}
class ShowOutput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowOutput,
      title: localize2("mcp.command.showOutput", "Show Output"),
      category,
      f1: false
    });
  }
  run(accessor, serverId) {
    accessor.get(IMcpService).servers.get().find((s) => s.definition.id === serverId)?.showOutput();
  }
}
function isAgentHostMcpServerCommandArg(arg) {
  return typeof arg !== "string" && URI.isUri(arg.agentHostSession) && typeof arg.serverId === "string";
}
function getAgentHostMcpServer(accessor, arg) {
  return accessor.get(IAgentHostCustomizationService).getMcpServers(arg.agentHostSession).find((server) => server.id === arg.serverId);
}
class RestartServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.RestartServer,
      title: localize2("mcp.command.restartServer", "Restart Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId, opts) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      const server = getAgentHostMcpServer(accessor, serverId);
      accessor.get(ILogService).warn(`Restarting MCP server '${server?.name ?? serverId.serverId}' is not supported for agent-host servers`);
      accessor.get(INotificationService).warn(localize("mcp.agentHost.restartUnsupported", "Restarting MCP server '{0}' is not supported for agent-host servers. Stop and start the server instead.", server?.name ?? serverId.serverId));
      return;
    }
    const s = accessor.get(IMcpService).servers.get().find((s2) => s2.definition.id === serverId);
    s?.showOutput();
    await s?.stop();
    await s?.start({ promptType: "all-untrusted", ...opts });
  }
}
class StartServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StartServer,
      title: localize2("mcp.command.startServer", "Start Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId, opts) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      await getAgentHostMcpServer(accessor, serverId)?.start();
      return;
    }
    let servers = accessor.get(IMcpService).servers.get();
    if (serverId !== "*") {
      servers = servers.filter((s) => s.definition.id === serverId);
    }
    const startOpts = { promptType: "all-untrusted", ...opts };
    if (opts?.waitForLiveTools) {
      await Promise.all(servers.map((s) => startServerAndWaitForLiveTools(s, startOpts)));
    } else {
      await Promise.all(servers.map((s) => s.start(startOpts)));
    }
  }
}
class StopServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StopServer,
      title: localize2("mcp.command.stopServer", "Stop Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      await getAgentHostMcpServer(accessor, serverId)?.stop();
      return;
    }
    const s = accessor.get(IMcpService).servers.get().find((s2) => s2.definition.id === serverId);
    await s?.stop();
  }
}
class McpBrowseCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.Browse,
      title: localize2("mcp.command.browse", "MCP Servers"),
      tooltip: localize2("mcp.command.browse.tooltip", "Browse MCP Servers"),
      category,
      icon: Codicon.search,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        id: extensionsFilterSubMenu,
        group: "1_predefined",
        order: 1,
        when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", InstalledMcpServersViewId), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        group: "navigation"
      }]
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch("@mcp ");
  }
}
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: McpCommandIds.Browse,
    title: localize2("mcp.command.browse.mcp", "Browse MCP Servers"),
    category,
    precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
  }
});
class ShowInstalledMcpServersCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowInstalled,
      title: localize2("mcp.command.show.installed", "Show Installed Servers"),
      category,
      precondition: ContextKeyExpr.and(HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      f1: true
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = await viewsService.openView(InstalledMcpServersViewId, true);
    if (!view) {
      await viewsService.openViewContainer(VIEWLET_ID);
      await viewsService.openView(InstalledMcpServersViewId, true);
    }
  }
}
MenuRegistry.appendMenuItem(CHAT_CONFIG_MENU_ID, {
  command: {
    id: McpCommandIds.ShowInstalled,
    title: localize2("mcp.servers", "MCP Servers")
  },
  when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
  order: 10,
  group: "2_level"
});
class OpenMcpResourceCommand extends Action2 {
  async run(accessor) {
    const fileService = accessor.get(IFileService);
    const editorService = accessor.get(IEditorService);
    const resource = await this.getURI(accessor);
    if (!await fileService.exists(resource)) {
      await fileService.createFile(resource, VSBuffer.fromString(JSON.stringify({ servers: {} }, null, "	")));
    }
    await editorService.openEditor({ resource });
  }
}
class OpenUserMcpResourceCommand extends OpenMcpResourceCommand {
  constructor() {
    super({
      id: McpCommandIds.OpenUserMcp,
      title: localize2("mcp.command.openUserMcp", "Open User Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  getURI(accessor) {
    const userDataProfileService = accessor.get(IUserDataProfileService);
    return Promise.resolve(userDataProfileService.currentProfile.mcpResource);
  }
}
class OpenRemoteUserMcpResourceCommand extends OpenMcpResourceCommand {
  constructor() {
    super({
      id: McpCommandIds.OpenRemoteUserMcp,
      title: localize2("mcp.command.openRemoteUserMcp", "Open Remote User Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        RemoteNameContext.notEqualsTo("")
      )
    });
  }
  async getURI(accessor) {
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const remoteUserDataProfileService = accessor.get(IRemoteUserDataProfilesService);
    const remoteProfile = await remoteUserDataProfileService.getRemoteProfile(userDataProfileService.currentProfile);
    return remoteProfile.mcpResource;
  }
}
class OpenWorkspaceFolderMcpResourceCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.OpenWorkspaceFolderMcp,
      title: localize2("mcp.command.openWorkspaceFolderMcp", "Open Workspace Folder MCP Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        WorkspaceFolderCountContext.notEqualsTo(0)
      )
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const commandService = accessor.get(ICommandService);
    const editorService = accessor.get(IEditorService);
    const workspaceFolders = workspaceContextService.getWorkspace().folders;
    const workspaceFolder = workspaceFolders.length === 1 ? workspaceFolders[0] : await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    if (workspaceFolder) {
      await editorService.openEditor({ resource: workspaceFolder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]) });
    }
  }
}
class OpenWorkspaceMcpResourceCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.OpenWorkspaceMcp,
      title: localize2("mcp.command.openWorkspaceMcp", "Open Workspace MCP Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        WorkbenchStateContext.isEqualTo("workspace")
      )
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const editorService = accessor.get(IEditorService);
    const workspaceConfiguration = workspaceContextService.getWorkspace().configuration;
    if (workspaceConfiguration) {
      await editorService.openEditor({ resource: workspaceConfiguration });
    }
  }
}
class McpBrowseResourcesCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.BrowseResources,
      title: localize2("mcp.browseResources", "Browse Resources..."),
      category,
      precondition: ContextKeyExpr.and(McpContextKeys.serverCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      f1: true
    });
  }
  run(accessor, server) {
    if (server) {
      accessor.get(IInstantiationService).createInstance(McpResourceQuickPick, server).pick();
    } else {
      accessor.get(IQuickInputService).quickAccess.show(McpResourceQuickAccess.PREFIX);
    }
  }
}
class McpConfigureSamplingModels extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ConfigureSamplingModels,
      title: localize2("mcp.configureSamplingModels", "Configure SamplingModel"),
      category
    });
  }
  async run(accessor, server) {
    const quickInputService = accessor.get(IQuickInputService);
    const lmService = accessor.get(ILanguageModelsService);
    const mcpSampling = accessor.get(IMcpSamplingService);
    const existingIds = new Set(mcpSampling.getConfig(server).allowedModels);
    const allItems = lmService.getLanguageModelIds().map((id) => {
      const model = lmService.lookupLanguageModel(id);
      if (!model.isUserSelectable) {
        return void 0;
      }
      return {
        label: model.name,
        description: model.tooltip,
        id,
        picked: existingIds.size ? existingIds.has(id) : model.isDefaultForLocation[ChatAgentLocation.Chat]
      };
    }).filter(isDefined);
    allItems.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0) || a.label.localeCompare(b.label));
    const picked = await quickInputService.pick(allItems, {
      placeHolder: localize("mcp.configureSamplingModels.ph", "Pick the models {0} can access via MCP sampling", server.definition.label),
      canPickMany: true
    });
    if (picked) {
      await mcpSampling.updateConfig(server, (c) => c.allowedModels = picked.map((p) => p.id));
    }
    return picked?.length || 0;
  }
}
class McpStartPromptingServerCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StartPromptForServer,
      title: localize2("mcp.startPromptingServer", "Start Prompting Server"),
      category,
      f1: false
    });
  }
  async run(accessor, server) {
    const widget = await openPanelChatAndGetWidget(accessor.get(IViewsService), accessor.get(IChatWidgetService));
    if (!widget) {
      return;
    }
    const editor = widget.inputEditor;
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const range = (editor.getSelection() || model.getFullModelRange()).collapseToEnd();
    const text = mcpPromptPrefix(server.definition) + ".";
    model.applyEdits([{ range, text }]);
    editor.setSelection(Range.fromPositions(range.getEndPosition().delta(0, text.length)));
    widget.focusInput();
    SuggestController.get(editor)?.triggerSuggest();
  }
}
class McpSkipCurrentAutostartCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.SkipCurrentAutostart,
      title: localize2("mcp.skipCurrentAutostart", "Skip Current Autostart"),
      category,
      f1: false
    });
  }
  async run(accessor) {
    accessor.get(IMcpService).cancelAutostart();
  }
}
export {
  AddConfigurationAction,
  EditStoredInput,
  InstallFromManifestAction,
  ListMcpServerCommand,
  MCPServerActionRendering,
  McpAgentHostServerOptionsCommand,
  McpBrowseCommand,
  McpBrowseResourcesCommand,
  McpConfigureSamplingModels,
  McpConfirmationServerOptionsCommand,
  McpServerOptionsCommand,
  McpSkipCurrentAutostartCommand,
  McpStartPromptingServerCommand,
  OpenRemoteUserMcpResourceCommand,
  OpenUserMcpResourceCommand,
  OpenWorkspaceFolderMcpResourceCommand,
  OpenWorkspaceMcpResourceCommand,
  RemoveStoredInput,
  ResetMcpCachedTools,
  ResetMcpTrustCommand,
  RestartServer,
  SetOAuthClientSecret,
  ShowConfiguration,
  ShowInstalledMcpServersCommand,
  ShowOutput,
  StartServer,
  StopServer,
  findLocalMcpServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXJUb29sdGlwSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmssIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcsIGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uU2NvcGVFbmFibGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIE1jcFNlcnZlclN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbWNwQXV0b1N0YXJ0Q29uZmlnLCBNY3BBdXRvU3RhcnRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IHNwaW5uaW5nTG9hZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgUmVtb3RlTmFtZUNvbnRleHQsIFJlc291cmNlQ29udGV4dEtleSwgV29ya2JlbmNoU3RhdGVDb250ZXh0LCBXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUFjY291bnRRdWVyeSwgSUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uUXVlcnkuanMnO1xuaW1wb3J0IHsgTUNQX0NPTkZJR1VSQVRJT05fS0VZLCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi9yZW1vdGVVc2VyRGF0YVByb2ZpbGVzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9DT05GSUdfTUVOVV9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZXRBZ2VudEhvc3RQbHVnaW5FbmFibGVtZW50IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50UGx1Z2luQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0LCBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUsIGlzQ29udHJpYnV0aW9uRGlzYWJsZWQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgVklFV0xFVF9JRCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVEVYVF9GSUxFX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBNY3BDb21tYW5kSWRzIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgTWNwQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vbWNwQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHQsIElNY3BTYW1wbGluZ1NlcnZpY2UsIElNY3BTZXJ2ZXIsIElNY3BTZXJ2ZXJTdGFydE9wdHMsIElNY3BTZXJ2aWNlLCBJbnN0YWxsZWRNY3BTZXJ2ZXJzVmlld0lkLCBMYXp5Q29sbGVjdGlvblN0YXRlLCBNY3BDYXBhYmlsaXR5LCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BEZWZpbml0aW9uUmVmZXJlbmNlLCBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXksIG1jcFByb21wdFByZWZpeCwgTWNwU2VydmVyQ2FjaGVTdGF0ZSwgTWNwU3RhcnRTZXJ2ZXJJbnRlcmFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBzdGFydFNlcnZlckFuZFdhaXRGb3JMaXZlVG9vbHMgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXNVdGlscy5qcyc7XG5pbXBvcnQgeyBNY3BBZGRDb25maWd1cmF0aW9uQ29tbWFuZCwgTWNwSW5zdGFsbEZyb21NYW5pZmVzdENvbW1hbmQgfSBmcm9tICcuL21jcENvbW1hbmRzQWRkQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BSZXNvdXJjZVF1aWNrQWNjZXNzLCBNY3BSZXNvdXJjZVF1aWNrUGljayB9IGZyb20gJy4vbWNwUmVzb3VyY2VRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvbWNwU2VydmVyQWN0aW9uLmNzcyc7XG5pbXBvcnQgeyBvcGVuUGFuZWxDaGF0QW5kR2V0V2lkZ2V0IH0gZnJvbSAnLi9vcGVuUGFuZWxDaGF0QW5kR2V0V2lkZ2V0LmpzJztcblxuLy8gYWNyb3lubXMgZG8gbm90IGdldCBsb2NhbGl6ZWRcbmNvbnN0IGNhdGVnb3J5OiBJTG9jYWxpemVkU3RyaW5nID0ge1xuXHRvcmlnaW5hbDogJ01DUCcsXG5cdHZhbHVlOiAnTUNQJyxcbn07XG5cbmV4cG9ydCBjbGFzcyBMaXN0TWNwU2VydmVyQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5MaXN0U2VydmVyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmxpc3QnLCAnTGlzdCBTZXJ2ZXJzJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlcnZlcixcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHttY3BBdXRvU3RhcnRDb25maWd9YCwgTWNwQXV0b1N0YXJ0VmFsdWUuTmV2ZXIpLCBNY3BDb250ZXh0S2V5cy5oYXNVbmtub3duVG9vbHMpLFxuXHRcdFx0XHRcdFx0TWNwQ29udGV4dEtleXMuaGFzU2VydmVyc1dpdGhFcnJvcnMsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzZXJ2aWNlczogSUxpc3RNY3BTZXJ2ZXJTZXJ2aWNlcyA9IHtcblx0XHRcdGNoYXRXaWRnZXRTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKSxcblx0XHRcdGFnZW50SG9zdEN1c3RvbWl6YXRpb25zOiBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlKSxcblx0XHRcdG1jcFNlcnZpY2U6IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSksXG5cdFx0XHRjb21tYW5kU2VydmljZTogYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSksXG5cdFx0XHRxdWlja0lucHV0OiBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSksXG5cdFx0XHRsb2dTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpLFxuXHRcdH07XG5cdFx0cmV0dXJuIHRoaXMuX3J1bldpdGhNb2RlKHNlcnZpY2VzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuV2l0aE1vZGUoc2VydmljZXM6IElMaXN0TWNwU2VydmVyU2VydmljZXMsIGluaXRpYWxNb2RlOiAnbG9jYWwnIHwgeyBhZ2VudEhvc3RTZXNzaW9uOiBVUkkgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBtb2RlID0gaW5pdGlhbE1vZGU7XG5cdFx0aWYgKG1vZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2VydmljZXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0Y29uc3QgaGFzQWdlbnRIb3N0TWNwID0gc2Vzc2lvblJlc291cmNlICYmIHNlcnZpY2VzLmFnZW50SG9zdEN1c3RvbWl6YXRpb25zLmdldE1jcFNlcnZlcnMoc2Vzc2lvblJlc291cmNlKS5sZW5ndGggPiAwO1xuXHRcdFx0bW9kZSA9IGhhc0FnZW50SG9zdE1jcCA/IHsgYWdlbnRIb3N0U2Vzc2lvbjogc2Vzc2lvblJlc291cmNlISB9IDogJ2xvY2FsJztcblx0XHR9XG5cblx0XHRpZiAobW9kZSA9PT0gJ2xvY2FsJykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcnVuTG9jYWwoc2VydmljZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5leHRNb2RlID0gYXdhaXQgdGhpcy5fcnVuQWdlbnRIb3N0KHNlcnZpY2VzLCBtb2RlLmFnZW50SG9zdFNlc3Npb24pO1xuXHRcdGlmIChuZXh0TW9kZSA9PT0gJ2xvY2FsJykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcnVuV2l0aE1vZGUoc2VydmljZXMsICdsb2NhbCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bkxvY2FsKHNlcnZpY2VzOiBJTGlzdE1jcFNlcnZlclNlcnZpY2VzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBtY3BTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgcXVpY2tJbnB1dCB9ID0gc2VydmljZXM7XG5cblx0XHR0eXBlIEl0ZW1UeXBlID0geyBpZDogc3RyaW5nIH0gJiBJUXVpY2tQaWNrSXRlbTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2sgPSBxdWlja0lucHV0LmNyZWF0ZVF1aWNrUGljazxJdGVtVHlwZT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdHBpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbWNwLnNlbGVjdFNlcnZlcicsICdTZWxlY3QgYW4gTUNQIFNlcnZlcicpO1xuXG5cdFx0bWNwU2VydmljZS5hY3RpdmF0ZUNvbGxlY3Rpb25zKCk7XG5cblx0XHRzdG9yZS5hZGQocGljayk7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IGdyb3VwQnkobWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKS5zbGljZSgpLnNvcnQoKGEsIGIpID0+IGEuY29sbGVjdGlvbi5vcmRlciAtIGIuY29sbGVjdGlvbi5vcmRlciksIHMgPT4gcy5jb2xsZWN0aW9uLmlkKTtcblx0XHRcdGNvbnN0IGZpcnN0UnVuID0gcGljay5pdGVtcy5sZW5ndGggPT09IDA7XG5cdFx0XHRjb25zdCBwcmV2aW91c0FjdGl2ZUlkID0gcGljay5hY3RpdmVJdGVtc1swXT8uaWQ7XG5cblx0XHRcdHBpY2suaXRlbXMgPSBbXG5cdFx0XHRcdHsgaWQ6ICckYWRkJywgbGFiZWw6IGxvY2FsaXplKCdtY3AuYWRkU2VydmVyJywgJ0FkZCBTZXJ2ZXInKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AuYWRkU2VydmVyLmRlc2NyaXB0aW9uJywgJ0FkZCBhIG5ldyBzZXJ2ZXIgY29uZmlndXJhdGlvbicpLCBhbHdheXNTaG93OiB0cnVlLCBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFkZCkgfSxcblx0XHRcdFx0Li4uT2JqZWN0LnZhbHVlcyhzZXJ2ZXJzKS5maWx0ZXIocyA9PiBzIS5sZW5ndGgpLmZsYXRNYXAoKHNlcnZlcnMpOiAoSXRlbVR5cGUgfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0+IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogc2VydmVycyFbMF0uY29sbGVjdGlvbi5sYWJlbCwgaWQ6IHNlcnZlcnMhWzBdLmNvbGxlY3Rpb24uaWQgfSxcblx0XHRcdFx0XHQuLi5zZXJ2ZXJzIS5tYXAoc2VydmVyID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc2FibGVkID0gaXNDb250cmlidXRpb25EaXNhYmxlZChzZXJ2ZXIuZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0aWQ6IHNlcnZlci5kZWZpbml0aW9uLmlkLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogc2VydmVyLmRlZmluaXRpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkaXNhYmxlZFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5kaXNhYmxlZCcsICdEaXNhYmxlZCcpXG5cdFx0XHRcdFx0XHRcdFx0OiBNY3BDb25uZWN0aW9uU3RhdGUudG9TdHJpbmcoc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcikpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHRdO1xuXG5cdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgcHJldmlvdXNseSBzZWxlY3RlZCBpdGVtIGlmIGl0IHN0aWxsIGV4aXN0cywgb3RoZXJ3aXNlIHNlbGVjdCB0aGUgZmlyc3Qgc2VydmVyIG9uIGZpcnN0IHJ1blxuXHRcdFx0aWYgKHByZXZpb3VzQWN0aXZlSWQpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNJdGVtID0gcGljay5pdGVtcy5maW5kKChpdGVtKTogaXRlbSBpcyBJdGVtVHlwZSA9PiAhKCd0eXBlJyBpbiBpdGVtKSAmJiBpdGVtLmlkID09PSBwcmV2aW91c0FjdGl2ZUlkKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzSXRlbSkge1xuXHRcdFx0XHRcdHBpY2suYWN0aXZlSXRlbXMgPSBbcHJldmlvdXNJdGVtXTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpcnN0UnVuICYmIHBpY2suaXRlbXMubGVuZ3RoID4gMykge1xuXHRcdFx0XHRwaWNrLmFjdGl2ZUl0ZW1zID0gcGljay5pdGVtcy5zbGljZSgyLCAzKSBhcyBJdGVtVHlwZVtdOyAvLyBzZWxlY3QgdGhlIGZpcnN0IHNlcnZlciBieSBkZWZhdWx0XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJdGVtVHlwZSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGljay5hY3RpdmVJdGVtc1swXSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQocGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwaWNrLnNob3coKTtcblx0XHR9KTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGlmICghcGlja2VkKSB7XG5cdFx0XHQvLyBuby1vcFxuXHRcdH0gZWxzZSBpZiAocGlja2VkLmlkID09PSAnJGFkZCcpIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuQWRkQ29uZmlndXJhdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucywgcGlja2VkLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5BZ2VudEhvc3Qoc2VydmljZXM6IElMaXN0TWNwU2VydmVyU2VydmljZXMsIGFnZW50SG9zdFNlc3Npb246IFVSSSk6IFByb21pc2U8J2xvY2FsJyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIGNvbW1hbmRTZXJ2aWNlLCBxdWlja0lucHV0IH0gPSBzZXJ2aWNlcztcblxuXHRcdGNvbnN0IEJBQ0tfSUQgPSAnJGJhY2snO1xuXHRcdHR5cGUgSXRlbVR5cGUgPSB7IGlkOiBzdHJpbmc7IHNlcnZlcj86IElBZ2VudEhvc3RNY3BTZXJ2ZXIgfSAmIElRdWlja1BpY2tJdGVtO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcGljayA9IHF1aWNrSW5wdXQuY3JlYXRlUXVpY2tQaWNrPEl0ZW1UeXBlPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0cGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtY3Auc2VsZWN0QWdlbnRIb3N0U2VydmVyJywgJ1NlbGVjdCBhbiBNQ1AgU2VydmVyIGZvciB0aGlzIHNlc3Npb24nKTtcblxuXHRcdHN0b3JlLmFkZChwaWNrKTtcblxuXHRcdGNvbnN0IHJlZnJlc2ggPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJzdFJ1biA9IHBpY2suaXRlbXMubGVuZ3RoID09PSAwO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVJZCA9IHBpY2suYWN0aXZlSXRlbXNbMF0/LmlkO1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLmdldE1jcFNlcnZlcnMoYWdlbnRIb3N0U2Vzc2lvbik7XG5cblx0XHRcdHBpY2suaXRlbXMgPSBbXG5cdFx0XHRcdC4uLihzZXJ2ZXJzLmxlbmd0aCA9PT0gMCA/IFt7XG5cdFx0XHRcdFx0aWQ6ICckZW1wdHknLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5ub1NlcnZlcnMnLCAnTm8gTUNQIHNlcnZlcnMnKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Qubm9TZXJ2ZXJzLmRlc2NyaXB0aW9uJywgJ1RoaXMgc2Vzc2lvbiBkb2VzIG5vdCBleHBvc2UgYW55IE1DUCBzZXJ2ZXJzJyksXG5cdFx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSXRlbVR5cGVdIDogc2VydmVycy5tYXAoKHNlcnZlcik6IEl0ZW1UeXBlID0+ICh7XG5cdFx0XHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHRcdFx0bGFiZWw6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzZXJ2ZXIuZW5hYmxlZFxuXHRcdFx0XHRcdFx0PyBtY3BTZXJ2ZXJTdGF0dXNUb0xhYmVsKHNlcnZlci5zdGF0dXMpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtY3AuZGlzYWJsZWQnLCAnRGlzYWJsZWQnKSxcblx0XHRcdFx0XHRidXR0b25zOiBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b25zKHNlcnZlciksXG5cdFx0XHRcdH0pKSksXG5cdFx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicgfSBzYXRpc2ZpZXMgSVF1aWNrUGlja1NlcGFyYXRvcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBCQUNLX0lELFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5zaG93TG9jYWwnLCAnU2hvdyBsb2NhbGx5IGNvbmZpZ3VyZWQgc2VydmVycy4uLicpLFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXJyb3dMZWZ0KSxcblx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJdGVtVHlwZSxcblx0XHRcdF07XG5cblx0XHRcdC8vIFByZXNlcnZlIHRoZSBwcmV2aW91c2x5IHNlbGVjdGVkIGl0ZW0gaWYgaXQgc3RpbGwgZXhpc3RzLCBvdGhlcndpc2Ugc2VsZWN0IHRoZSBmaXJzdCBzZXJ2ZXIgb24gZmlyc3QgcnVuXG5cdFx0XHRpZiAocHJldmlvdXNBY3RpdmVJZCkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c0l0ZW0gPSBwaWNrLml0ZW1zLmZpbmQoKGl0ZW0pOiBpdGVtIGlzIEl0ZW1UeXBlID0+ICEoJ3R5cGUnIGluIGl0ZW0pICYmIGl0ZW0uaWQgPT09IHByZXZpb3VzQWN0aXZlSWQpO1xuXHRcdFx0XHRpZiAocHJldmlvdXNJdGVtKSB7XG5cdFx0XHRcdFx0cGljay5hY3RpdmVJdGVtcyA9IFtwcmV2aW91c0l0ZW1dO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmlyc3RSdW4gJiYgc2VydmVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHBpY2suYWN0aXZlSXRlbXMgPSBbcGljay5pdGVtc1swXSBhcyBJdGVtVHlwZV07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJlZnJlc2goKTtcblx0XHRzdG9yZS5hZGQoYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMub25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucygoKSA9PiByZWZyZXNoKCkpKTtcblx0XHRzdG9yZS5hZGQocGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdGlmICghaXNBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b24oZXZlbnQuYnV0dG9uKSB8fCAhZXZlbnQuaXRlbS5zZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcnVuQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uKGV2ZW50Lml0ZW0uc2VydmVyLCBldmVudC5idXR0b24uYWN0aW9uLCBzZXJ2aWNlcyk7XG5cdFx0XHRcdHJlZnJlc2goKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHBpY2suYnVzeSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IG5ldyBQcm9taXNlPEl0ZW1UeXBlIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChwaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShwaWNrLmFjdGl2ZUl0ZW1zWzBdKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChwaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdHBpY2suc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKCFwaWNrZWQgfHwgcGlja2VkLmlkID09PSAnJGVtcHR5Jykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAocGlja2VkLmlkID09PSBCQUNLX0lEKSB7XG5cdFx0XHRyZXR1cm4gJ2xvY2FsJztcblx0XHR9XG5cblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsIGFnZW50SG9zdFNlc3Npb24sIHBpY2tlZC5pZCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUxpc3RNY3BTZXJ2ZXJTZXJ2aWNlcyB7XG5cdHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2U7XG5cdHJlYWRvbmx5IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlO1xuXHRyZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlO1xuXHRyZWFkb25seSBxdWlja0lucHV0OiBJUXVpY2tJbnB1dFNlcnZpY2U7XG5cdHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcbn1cblxudHlwZSBBZ2VudEhvc3RNY3BTZXJ2ZXJMaWZlY3ljbGVBY3Rpb24gPSAnc3RhcnQnIHwgJ3N0b3AnO1xudHlwZSBJQWdlbnRIb3N0TWNwU2VydmVyID0gUmV0dXJuVHlwZTxJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2VbJ2dldE1jcFNlcnZlcnMnXT5bbnVtYmVyXTtcblxuaW50ZXJmYWNlIElBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b24gZXh0ZW5kcyBJUXVpY2tJbnB1dEJ1dHRvbiB7XG5cdHJlYWRvbmx5IGFjdGlvbjogQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uO1xufVxuXG5mdW5jdGlvbiBpc0FnZW50SG9zdE1jcFNlcnZlckJ1dHRvbihidXR0b246IElRdWlja0lucHV0QnV0dG9uKTogYnV0dG9uIGlzIElBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b24ge1xuXHRyZXR1cm4gJ2FjdGlvbicgaW4gYnV0dG9uICYmIChidXR0b24uYWN0aW9uID09PSAnc3RhcnQnIHx8IGJ1dHRvbi5hY3Rpb24gPT09ICdzdG9wJyk7XG59XG5cbmNvbnN0IHN0YXJ0QWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uOiBJQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsYXkpLFxuXHR0b29sdGlwOiBsb2NhbGl6ZSgnbWNwLnN0YXJ0JywgJ1N0YXJ0IFNlcnZlcicpLFxuXHRhY3Rpb246ICdzdGFydCcsXG59O1xuXG5jb25zdCBzdG9wQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uOiBJQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmRlYnVnU3RvcCksXG5cdHRvb2x0aXA6IGxvY2FsaXplKCdtY3Auc3RvcCcsICdTdG9wIFNlcnZlcicpLFxuXHRhY3Rpb246ICdzdG9wJyxcbn07XG5cbmZ1bmN0aW9uIGdldEFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbnMoc2VydmVyOiBJQWdlbnRIb3N0TWNwU2VydmVyKTogSUFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbltdIHtcblx0aWYgKGNhblN0YXJ0QWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcikpIHtcblx0XHRyZXR1cm4gW3N0YXJ0QWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uXTtcblx0fVxuXHRpZiAoY2FuU3RvcEFnZW50SG9zdE1jcFNlcnZlcihzZXJ2ZXIpKSB7XG5cdFx0cmV0dXJuIFtzdG9wQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uXTtcblx0fVxuXHRyZXR1cm4gW107XG59XG5cbmZ1bmN0aW9uIGNhblN0YXJ0QWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2VydmVyLmVuYWJsZWQgJiYgKHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIHx8IHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5FcnJvcik7XG59XG5cbmZ1bmN0aW9uIGNhblN0b3BBZ2VudEhvc3RNY3BTZXJ2ZXIoc2VydmVyOiBJQWdlbnRIb3N0TWNwU2VydmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXJ2ZXIuZW5hYmxlZCAmJiAoXG5cdFx0c2VydmVyLnN0YXR1cyA9PT0gTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nXG5cdFx0fHwgc2VydmVyLnN0YXR1cyA9PT0gTWNwU2VydmVyU3RhdHVzLlJlYWR5XG5cdFx0fHwgc2VydmVyLnN0YXR1cyA9PT0gTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZFxuXHQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBydW5BZ2VudEhvc3RNY3BTZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oc2VydmVyOiBJQWdlbnRIb3N0TWNwU2VydmVyLCBhY3Rpb246IEFnZW50SG9zdE1jcFNlcnZlckxpZmVjeWNsZUFjdGlvbiwgc2VydmljZXM6IFBpY2s8SUxpc3RNY3BTZXJ2ZXJTZXJ2aWNlcywgJ25vdGlmaWNhdGlvblNlcnZpY2UnIHwgJ2xvZ1NlcnZpY2UnPik6IFByb21pc2U8dm9pZD4ge1xuXHR0cnkge1xuXHRcdGlmIChhY3Rpb24gPT09ICdzdGFydCcgJiYgY2FuU3RhcnRBZ2VudEhvc3RNY3BTZXJ2ZXIoc2VydmVyKSkge1xuXHRcdFx0YXdhaXQgc2VydmVyLnN0YXJ0KCk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24gPT09ICdzdG9wJyAmJiBjYW5TdG9wQWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcikpIHtcblx0XHRcdGF3YWl0IHNlcnZlci5zdG9wKCk7XG5cdFx0fVxuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHNlcnZpY2VzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byAke2FjdGlvbn0gTUNQIHNlcnZlciAnJHtzZXJ2ZXIubmFtZX0nYCwgZXJyb3IpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG5cdFx0c2VydmljZXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihhY3Rpb24gPT09ICdzdGFydCdcblx0XHRcdD8gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhcnRFcnJvcicsIFwiRmFpbGVkIHRvIHN0YXJ0IE1DUCBzZXJ2ZXIgJ3swfSc6IHsxfVwiLCBzZXJ2ZXIubmFtZSwgbWVzc2FnZSlcblx0XHRcdDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RvcEVycm9yJywgXCJGYWlsZWQgdG8gc3RvcCBNQ1Agc2VydmVyICd7MH0nOiB7MX1cIiwgc2VydmVyLm5hbWUsIG1lc3NhZ2UpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtY3BTZXJ2ZXJTdGF0dXNUb0xhYmVsKHN0YXR1czogTWNwU2VydmVyU3RhdHVzKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdGFydGluZzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5zdGF0dXMuc3RhcnRpbmcnLCAnU3RhcnRpbmcnKTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5SZWFkeTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5zdGF0dXMucmVhZHknLCAnUnVubmluZycpO1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5zdGF0dXMuYXV0aFJlcXVpcmVkJywgJ0F1dGhlbnRpY2F0aW9uIHJlcXVpcmVkJyk7XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3I6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhdHVzLmVycm9yJywgJ0Vycm9yJyk7XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5zdGF0dXMuc3RvcHBlZCcsICdTdG9wcGVkJyk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiAnJztcblx0fVxufVxuXG50eXBlIEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb24gPSAnZW5hYmxlUHJvZmlsZScgfCAnZGlzYWJsZVByb2ZpbGUnIHwgJ2VuYWJsZVdvcmtzcGFjZScgfCAnZGlzYWJsZVdvcmtzcGFjZScgfCAnZW5hYmxlU2Vzc2lvbicgfCAnZGlzYWJsZVNlc3Npb24nO1xuXG5pbnRlcmZhY2UgQWdlbnRIb3N0RW5hYmxlbWVudEl0ZW1UeXBlIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRhY3Rpb246IEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRJdGVtcyhzZXJ2ZXI6IElBZ2VudEhvc3RNY3BTZXJ2ZXIsIGhhc1dvcmtzcGFjZTogYm9vbGVhbiwgc2NvcGVzOiByZWFkb25seSAoJ2dsb2JhbCcgfCAnd29ya3NwYWNlJyB8ICdzZXNzaW9uJylbXSA9IFsnZ2xvYmFsJywgJ3dvcmtzcGFjZScsICdzZXNzaW9uJ10pOiBBZ2VudEhvc3RFbmFibGVtZW50SXRlbVR5cGVbXSB7XG5cdGNvbnN0IGVuYWJsZW1lbnQgPSBnZXRDdXN0b21pemF0aW9uU2NvcGVFbmFibGVtZW50KHNlcnZlcik7XG5cdGNvbnN0IGl0ZW1zOiBBZ2VudEhvc3RFbmFibGVtZW50SXRlbVR5cGVbXSA9IFtdO1xuXHRpZiAoc2NvcGVzLmluY2x1ZGVzKCdnbG9iYWwnKSkge1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGVuYWJsZW1lbnQuZ2xvYmFsID8gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZGlzYWJsZScsICdEaXNhYmxlJykgOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5lbmFibGUnLCAnRW5hYmxlJyksXG5cdFx0XHRhY3Rpb246IGVuYWJsZW1lbnQuZ2xvYmFsID8gJ2Rpc2FibGVQcm9maWxlJyA6ICdlbmFibGVQcm9maWxlJyxcblx0XHR9KTtcblx0fVxuXHRpZiAoc2NvcGVzLmluY2x1ZGVzKCd3b3Jrc3BhY2UnKSAmJiBoYXNXb3Jrc3BhY2UpIHtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGxhYmVsOiBlbmFibGVtZW50LndvcmtzcGFjZSA/IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LmRpc2FibGVXb3Jrc3BhY2UnLCAnRGlzYWJsZSAoV29ya3NwYWNlKScpIDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZW5hYmxlV29ya3NwYWNlJywgJ0VuYWJsZSAoV29ya3NwYWNlKScpLFxuXHRcdFx0YWN0aW9uOiBlbmFibGVtZW50LndvcmtzcGFjZSA/ICdkaXNhYmxlV29ya3NwYWNlJyA6ICdlbmFibGVXb3Jrc3BhY2UnLFxuXHRcdH0pO1xuXHR9XG5cdGlmIChzY29wZXMuaW5jbHVkZXMoJ3Nlc3Npb24nKSkge1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGVuYWJsZW1lbnQuc2Vzc2lvbiA/IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LmRpc2FibGVTZXNzaW9uJywgJ0Rpc2FibGUgKFNlc3Npb24pJykgOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5lbmFibGVTZXNzaW9uJywgJ0VuYWJsZSAoU2Vzc2lvbiknKSxcblx0XHRcdGFjdGlvbjogZW5hYmxlbWVudC5zZXNzaW9uID8gJ2Rpc2FibGVTZXNzaW9uJyA6ICdlbmFibGVTZXNzaW9uJyxcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gaXRlbXM7XG59XG5cbmZ1bmN0aW9uIGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEl0ZW1zKGRpc2FibGVkOiBib29sZWFuLCBpc0VtcHR5V29ya2JlbmNoOiBib29sZWFuLCBpbmNsdWRlV29ya3NwYWNlID0gdHJ1ZSk6IEFnZW50SG9zdEVuYWJsZW1lbnRJdGVtVHlwZVtdIHtcblx0Y29uc3QgaXRlbXM6IEFnZW50SG9zdEVuYWJsZW1lbnRJdGVtVHlwZVtdID0gW107XG5cdGlmIChkaXNhYmxlZCkge1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZW5hYmxlJywgJ0VuYWJsZScpLCBhY3Rpb246ICdlbmFibGVQcm9maWxlJyB9KTtcblx0XHRpZiAoaW5jbHVkZVdvcmtzcGFjZSAmJiAhaXNFbXB0eVdvcmtiZW5jaCkge1xuXHRcdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5lbmFibGVXb3Jrc3BhY2UnLCAnRW5hYmxlIChXb3Jrc3BhY2UpJyksIGFjdGlvbjogJ2VuYWJsZVdvcmtzcGFjZScgfSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZGlzYWJsZScsICdEaXNhYmxlJyksIGFjdGlvbjogJ2Rpc2FibGVQcm9maWxlJyB9KTtcblx0XHRpZiAoaW5jbHVkZVdvcmtzcGFjZSAmJiAhaXNFbXB0eVdvcmtiZW5jaCkge1xuXHRcdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5kaXNhYmxlV29ya3NwYWNlJywgJ0Rpc2FibGUgKFdvcmtzcGFjZSknKSwgYWN0aW9uOiAnZGlzYWJsZVdvcmtzcGFjZScgfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpdGVtcztcbn1cblxuZnVuY3Rpb24gZW5hYmxlbWVudFN0YXRlRm9yQWN0aW9uKGFjdGlvbjogRXhjbHVkZTxBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uLCAnZW5hYmxlU2Vzc2lvbicgfCAnZGlzYWJsZVNlc3Npb24nPik6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB7XG5cdHN3aXRjaCAoYWN0aW9uKSB7XG5cdFx0Y2FzZSAnZW5hYmxlUHJvZmlsZSc6XG5cdFx0XHRyZXR1cm4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlO1xuXHRcdGNhc2UgJ2Rpc2FibGVQcm9maWxlJzpcblx0XHRcdHJldHVybiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlO1xuXHRcdGNhc2UgJ2VuYWJsZVdvcmtzcGFjZSc6XG5cdFx0XHRyZXR1cm4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2U7XG5cdFx0Y2FzZSAnZGlzYWJsZVdvcmtzcGFjZSc6XG5cdFx0XHRyZXR1cm4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9jYWxNY3BTZXJ2ZXIobWNwU2VydmljZTogSU1jcFNlcnZpY2UsIHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlcik6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzZXJ2ZXJzID0gbWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpO1xuXHRjb25zdCBzZXBhcmF0b3IgPSBzZXJ2ZXIuaWQuaW5kZXhPZignLycpO1xuXHRjb25zdCByYXdJZCA9IHNlcGFyYXRvciA+PSAwID8gc2VydmVyLmlkLnNsaWNlKHNlcGFyYXRvciArIDEpIDogc2VydmVyLmlkO1xuXHRjb25zdCBpZE1hdGNoZXMgPSBzZXJ2ZXJzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmRlZmluaXRpb24uaWQgPT09IHJhd0lkKTtcblx0aWYgKGlkTWF0Y2hlcy5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gaWRNYXRjaGVzWzBdO1xuXHR9XG5cdGNvbnN0IG5hbWVNYXRjaGVzID0gc2VydmVycy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5kZWZpbml0aW9uLmxhYmVsID09PSBzZXJ2ZXIubmFtZSk7XG5cdHJldHVybiBuYW1lTWF0Y2hlcy5sZW5ndGggPT09IDEgPyBuYW1lTWF0Y2hlc1swXSA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcEFnZW50SG9zdFNlcnZlck9wdGlvbnNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuYWdlbnRIb3N0T3B0aW9ucycsICdBZ2VudCBIb3N0IFNlcnZlciBPcHRpb25zJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYWdlbnRIb3N0U2Vzc2lvbjogVVJJLCBjdXN0b21pemF0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhaUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudFBsdWdpblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50UGx1Z2luU2VydmljZSk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSBhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRNY3BTZXJ2ZXJzKGFnZW50SG9zdFNlc3Npb24pLmZpbmQocyA9PiBzLmlkID09PSBjdXN0b21pemF0aW9uSWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHlwZSBJdGVtVHlwZSA9IHsgYWN0aW9uOiAnc2hvd091dHB1dCcgfCAnYXV0aGVudGljYXRlJyB8ICdlbmFibGVQbHVnaW4nIHwgQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uIHwgQWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbiB9ICYgSVF1aWNrUGlja0l0ZW07XG5cblx0XHRjb25zdCBpdGVtczogKEl0ZW1UeXBlIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFjdGlvbnMuc3RhdHVzJywgJ1N0YXR1cycpIH0sXG5cdFx0XTtcblx0XHRpZiAoY2FuU3RhcnRBZ2VudEhvc3RNY3BTZXJ2ZXIoc2VydmVyKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnN0YXJ0JywgJ1N0YXJ0IFNlcnZlcicpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbWNwU2VydmVyU3RhdHVzVG9MYWJlbChzZXJ2ZXIuc3RhdHVzKSxcblx0XHRcdFx0YWN0aW9uOiAnc3RhcnQnLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChjYW5TdG9wQWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcikpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zdG9wJywgJ1N0b3AgU2VydmVyJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtY3BTZXJ2ZXJTdGF0dXNUb0xhYmVsKHNlcnZlci5zdGF0dXMpLFxuXHRcdFx0XHRhY3Rpb246ICdzdG9wJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBsdWdpbkRpc2FibGVkID0gc2VydmVyLmRpc2FibGVkUmVhc29uPy5zb3VyY2UgPT09ICdwbHVnaW4nO1xuXHRcdGNvbnN0IGxvY2FsU2VydmVyID0gZmluZExvY2FsTWNwU2VydmVyKG1jcFNlcnZpY2UsIHNlcnZlcik7XG5cdFx0Y29uc3QgZHVyYWJsZVByb2ZpbGVEaXNhYmxlZCA9IGxvY2FsU2VydmVyICE9PSB1bmRlZmluZWQgJiYgIW1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnJlYWRQcm9maWxlRW5hYmxlZChsb2NhbFNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0XHRjb25zdCBpc0VtcHR5V29ya2JlbmNoID0gYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpID09PSB1bmRlZmluZWQ7XG5cdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21jcC5hY3Rpb25zLmVuYWJsZW1lbnQnLCAnRW5hYmxlbWVudCcpIH0pO1xuXHRcdGlmIChwbHVnaW5EaXNhYmxlZCkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5lbmFibGVQbHVnaW4nLCBcIkVuYWJsZSBQbHVnaW5cIiksXG5cdFx0XHRcdGFjdGlvbjogJ2VuYWJsZVBsdWdpbicsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbXMucHVzaChcblx0XHRcdFx0Li4uKGxvY2FsU2VydmVyXG5cdFx0XHRcdFx0PyBbXG5cdFx0XHRcdFx0XHQuLi5nZXRMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRJdGVtcyhkdXJhYmxlUHJvZmlsZURpc2FibGVkLCBpc0VtcHR5V29ya2JlbmNoLCBmYWxzZSksXG5cdFx0XHRcdFx0XHQuLi5nZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50SXRlbXMoc2VydmVyLCBhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRXb3JraW5nRGlyZWN0b3JpZXMoYWdlbnRIb3N0U2Vzc2lvbikubGVuZ3RoID4gMCwgWyd3b3Jrc3BhY2UnLCAnc2Vzc2lvbiddKSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0OiBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50SXRlbXMoc2VydmVyLCBhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRXb3JraW5nRGlyZWN0b3JpZXMoYWdlbnRIb3N0U2Vzc2lvbikubGVuZ3RoID4gMCkpLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyLmVuYWJsZWQgJiYgc2VydmVyLnN0YXRlLmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuYXV0aGVudGljYXRlJywgJ0F1dGhlbnRpY2F0ZScpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogc2VydmVyLnN0YXRlLnJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0XHRhY3Rpb246ICdhdXRoZW50aWNhdGUnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlcnkgYWdlbnQtaG9zdCBNQ1Agc2VydmVyIGhhcyBhIHBlci1zZXJ2ZXIgZGlhZ25vc3RpY3MgY2hhbm5lbC5cblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNob3dPdXRwdXQnLCAnU2hvdyBPdXRwdXQnKSxcblx0XHRcdGFjdGlvbjogJ3Nob3dPdXRwdXQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IHNlcnZlci5uYW1lLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFwaWNrZWQgfHwgIWhhc0tleShwaWNrZWQsIHsgYWN0aW9uOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2tlZC5hY3Rpb24gPT09ICdzaG93T3V0cHV0Jykge1xuXHRcdFx0YWdlbnRIb3N0Q3VzdG9taXphdGlvbnMuc2hvd01jcFNlcnZlckxvZyhhZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwaWNrZWQuYWN0aW9uID09PSAnYXV0aGVudGljYXRlJykge1xuXHRcdFx0YXdhaXQgYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMuYXV0aGVudGljYXRlTWNwU2VydmVyKGFnZW50SG9zdFNlc3Npb24sIHNlcnZlci5pZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2tlZC5hY3Rpb24gPT09ICdzdGFydCcgfHwgcGlja2VkLmFjdGlvbiA9PT0gJ3N0b3AnKSB7XG5cdFx0XHRhd2FpdCBydW5BZ2VudEhvc3RNY3BTZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oc2VydmVyLCBwaWNrZWQuYWN0aW9uLCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2tlZC5hY3Rpb24gPT09ICdlbmFibGVQbHVnaW4nKSB7XG5cdFx0XHRjb25zdCByZWFzb24gPSBzZXJ2ZXIuZGlzYWJsZWRSZWFzb247XG5cdFx0XHRpZiAocmVhc29uPy5zb3VyY2UgPT09ICdwbHVnaW4nKSB7XG5cdFx0XHRcdGNvbnN0IGRlY2lzaW9uID0gcmVhc29uLnBsdWdpbi5lbmFibGVtZW50Py5bMF07XG5cdFx0XHRcdGlmIChkZWNpc2lvbikge1xuXHRcdFx0XHRcdHNldEFnZW50SG9zdFBsdWdpbkVuYWJsZW1lbnQoYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIGFnZW50UGx1Z2luU2VydmljZSwgYWdlbnRIb3N0U2Vzc2lvbiwgcmVhc29uLnBsdWdpbiwgZGVjaXNpb24ua2luZCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobG9jYWxTZXJ2ZXIgJiYgKHBpY2tlZC5hY3Rpb24gPT09ICdlbmFibGVQcm9maWxlJyB8fCBwaWNrZWQuYWN0aW9uID09PSAnZGlzYWJsZVByb2ZpbGUnKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBlbmFibGVtZW50U3RhdGVGb3JBY3Rpb24ocGlja2VkLmFjdGlvbik7XG5cdFx0XHRtY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5zZXRFbmFibGVkKGxvY2FsU2VydmVyLmRlZmluaXRpb24uaWQsIHN0YXRlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY29wZSA9IHBpY2tlZC5hY3Rpb24gPT09ICdlbmFibGVQcm9maWxlJyB8fCBwaWNrZWQuYWN0aW9uID09PSAnZGlzYWJsZVByb2ZpbGUnXG5cdFx0XHQ/IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWxcblx0XHRcdDogcGlja2VkLmFjdGlvbiA9PT0gJ2VuYWJsZVdvcmtzcGFjZScgfHwgcGlja2VkLmFjdGlvbiA9PT0gJ2Rpc2FibGVXb3Jrc3BhY2UnXG5cdFx0XHRcdD8gQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZVxuXHRcdFx0XHQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBwaWNrZWQuYWN0aW9uID09PSAnZW5hYmxlUHJvZmlsZScgfHwgcGlja2VkLmFjdGlvbiA9PT0gJ2VuYWJsZVdvcmtzcGFjZScgfHwgcGlja2VkLmFjdGlvbiA9PT0gJ2VuYWJsZVNlc3Npb24nO1xuXHRcdGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLnNldEN1c3RvbWl6YXRpb25FbmFibGVtZW50KGFnZW50SG9zdFNlc3Npb24sIHNlcnZlci5pZCwgc2VydmVyLmVuYWJsZW1lbnQsIHNjb3BlLCBlbmFibGVkKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgQWN0aW9uSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0YWN0aW9uOiAnc3RhcnQnIHwgJ3N0b3AnIHwgJ3Jlc3RhcnQnIHwgJ3Nob3dPdXRwdXQnIHwgJ2NvbmZpZycgfCAnY29uZmlnU2FtcGxpbmcnIHwgJ3NhbXBsaW5nTG9nJyB8ICdyZXNvdXJjZXMnIHwgJ2VuYWJsZSc7XG59XG5cbmludGVyZmFjZSBBdXRoQWN0aW9uSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0YWN0aW9uOiAnZGlzY29ubmVjdCcgfCAnc2lnbm91dCc7XG5cdGFjY291bnRRdWVyeTogSUFjY291bnRRdWVyeTtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcENvbmZpcm1hdGlvblNlcnZlck9wdGlvbnNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnNJbkNvbmZpcm1hdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5vcHRpb25zJywgJ1NlcnZlciBPcHRpb25zJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29uZmlybWF0aW9uTWVudSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY2hhdENvbmZpcm1hdGlvblBhcnRTb3VyY2UnLCAnbWNwJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NoYXRDb25maXJtYXRpb25QYXJ0VHlwZScsICdjaGF0VG9vbENvbmZpcm1hdGlvbicpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjaGF0Q29uZmlybWF0aW9uUGFydFR5cGUnLCAnZWxpY2l0YXRpb24nKSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdGlmIChhcmcua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzU2VydmljZS5nZXRUb29sKGFyZy50b29sSWQpO1xuXHRcdFx0aWYgKHRvb2w/LnNvdXJjZS50eXBlID09PSAnbWNwJykge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsIHRvb2wuc291cmNlLmRlZmluaXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhcmcua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicpIHtcblx0XHRcdGlmIChhcmcuc291cmNlPy50eXBlID09PSAnbWNwJykge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsIGFyZy5zb3VyY2UuZGVmaW5pdGlvbklkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0TmV2ZXIoYXJnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlck9wdGlvbnNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3Aub3B0aW9ucycsICdTZXJ2ZXIgT3B0aW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG1jcFJlZ2lzdHJ5ID0gYWNjZXNzb3IuZ2V0KElNY3BSZWdpc3RyeSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBzYW1wbGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1jcFNhbXBsaW5nU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2VydmVyID0gbWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IGlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBtY3BSZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5maW5kKGMgPT4gYy5pZCA9PT0gc2VydmVyLmNvbGxlY3Rpb24uaWQpO1xuXHRcdGNvbnN0IHNlcnZlckRlZmluaXRpb24gPSBjb2xsZWN0aW9uPy5zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKS5maW5kKHMgPT4gcy5pZCA9PT0gc2VydmVyLmRlZmluaXRpb24uaWQpO1xuXG5cdFx0Y29uc3QgaXRlbXM6IChBY3Rpb25JdGVtIHwgQXV0aEFjdGlvbkl0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0Y29uc3Qgc2VydmVyU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gaXNDb250cmlidXRpb25EaXNhYmxlZChzZXJ2ZXIuZW5hYmxlbWVudC5nZXQoKSk7XG5cblx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFjdGlvbnMuc3RhdHVzJywgJ1N0YXR1cycpIH0pO1xuXG5cdFx0aWYgKGRpc2FibGVkKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuZW5hYmxlV29ya3NwYWNlJywgJ0VuYWJsZSBTZXJ2ZXIgKFdvcmtzcGFjZSknKSxcblx0XHRcdFx0YWN0aW9uOiAnZW5hYmxlJ1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKHNlcnZlclN0YXRlLnN0YXRlKSkge1xuXHRcdFx0Ly8gT25seSBzaG93IHN0YXJ0IHdoZW4gc2VydmVyIGlzIHN0b3BwZWQgb3IgaW4gZXJyb3Igc3RhdGVcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zdGFydCcsICdTdGFydCBTZXJ2ZXInKSxcblx0XHRcdFx0YWN0aW9uOiAnc3RhcnQnXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnN0b3AnLCAnU3RvcCBTZXJ2ZXInKSxcblx0XHRcdFx0YWN0aW9uOiAnc3RvcCdcblx0XHRcdH0pO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnJlc3RhcnQnLCAnUmVzdGFydCBTZXJ2ZXInKSxcblx0XHRcdFx0YWN0aW9uOiAncmVzdGFydCdcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goLi4udGhpcy5fZ2V0QXV0aEFjdGlvbnMoYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UsIHNlcnZlci5kZWZpbml0aW9uLmlkKSk7XG5cblx0XHRjb25zdCBjb25maWdUYXJnZXQgPSBzZXJ2ZXJEZWZpbml0aW9uPy5wcmVzZW50YXRpb24/Lm9yaWdpbiB8fCBjb2xsZWN0aW9uPy5wcmVzZW50YXRpb24/Lm9yaWdpbjtcblx0XHRpZiAoY29uZmlnVGFyZ2V0KSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuY29uZmlnJywgJ1Nob3cgQ29uZmlndXJhdGlvbicpLFxuXHRcdFx0XHRhY3Rpb246ICdjb25maWcnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zaG93T3V0cHV0JywgJ1Nob3cgT3V0cHV0JyksXG5cdFx0XHRhY3Rpb246ICdzaG93T3V0cHV0J1xuXHRcdH0pO1xuXG5cdFx0aXRlbXMucHVzaChcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFjdGlvbnMuc2FtcGxpbmcnLCAnU2FtcGxpbmcnKSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5jb25maWdBY2Nlc3MnLCAnQ29uZmlndXJlIE1vZGVsIEFjY2VzcycpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5zaG93T3V0cHV0LmRlc2NyaXB0aW9uJywgJ1NldCB0aGUgbW9kZWxzIHRoZSBzZXJ2ZXIgY2FuIHVzZSB2aWEgTUNQIHNhbXBsaW5nJyksXG5cdFx0XHRcdGFjdGlvbjogJ2NvbmZpZ1NhbXBsaW5nJ1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cblx0XHRpZiAoc2FtcGxpbmdTZXJ2aWNlLmhhc0xvZ3Moc2VydmVyKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nTG9nJywgJ1Nob3cgU2FtcGxpbmcgUmVxdWVzdHMnKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2FtcGxpbmdMb2cuZGVzY3JpcHRpb24nLCAnU2hvdyB0aGUgc2FtcGxpbmcgcmVxdWVzdHMgZm9yIHRoaXMgc2VydmVyJyksXG5cdFx0XHRcdGFjdGlvbjogJ3NhbXBsaW5nTG9nJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHNlcnZlci5jYXBhYmlsaXRpZXMuZ2V0KCk7XG5cdFx0aWYgKGNhcGFiaWxpdGllcyA9PT0gdW5kZWZpbmVkIHx8IChjYXBhYmlsaXRpZXMgJiBNY3BDYXBhYmlsaXR5LlJlc291cmNlcykpIHtcblx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdtY3AuYWN0aW9ucy5yZXNvdXJjZXMnLCAnUmVzb3VyY2VzJykgfSk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AucmVzb3VyY2VzJywgJ0Jyb3dzZSBSZXNvdXJjZXMnKSxcblx0XHRcdFx0YWN0aW9uOiAncmVzb3VyY2VzJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ21jcC5zZWxlY3RBY3Rpb24nLCAnU2VsZWN0IGFjdGlvbiBmb3IgXFwnezB9XFwnJywgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFwaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChwaWNrLmFjdGlvbikge1xuXHRcdFx0Y2FzZSAnZW5hYmxlJzpcblx0XHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N0YXJ0Jzpcblx0XHRcdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pO1xuXHRcdFx0XHRzZXJ2ZXIuc2hvd091dHB1dCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N0b3AnOlxuXHRcdFx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Jlc3RhcnQnOlxuXHRcdFx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdFx0XHRhd2FpdCBzZXJ2ZXIuc3RhcnQoeyBwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZGlzY29ubmVjdCc6XG5cdFx0XHRcdGF3YWl0IHNlcnZlci5zdG9wKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUF1dGgoYXV0aGVudGljYXRpb25TZXJ2aWNlLCBwaWNrLmFjY291bnRRdWVyeSwgc2VydmVyLmRlZmluaXRpb24sIGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzaWdub3V0Jzpcblx0XHRcdFx0YXdhaXQgc2VydmVyLnN0b3AoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlQXV0aChhdXRoZW50aWNhdGlvblNlcnZpY2UsIHBpY2suYWNjb3VudFF1ZXJ5LCBzZXJ2ZXIuZGVmaW5pdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc2hvd091dHB1dCc6XG5cdFx0XHRcdHNlcnZlci5zaG93T3V0cHV0KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnY29uZmlnJzpcblx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLmlzVXJpKGNvbmZpZ1RhcmdldCkgPyBjb25maWdUYXJnZXQgOiBjb25maWdUYXJnZXQhLnVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogVVJJLmlzVXJpKGNvbmZpZ1RhcmdldCkgPyB1bmRlZmluZWQgOiBjb25maWdUYXJnZXQhLnJhbmdlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnY29uZmlnU2FtcGxpbmcnOlxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5Db25maWd1cmVTYW1wbGluZ01vZGVscywgc2VydmVyKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlcyc6XG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkJyb3dzZVJlc291cmNlcywgc2VydmVyKTtcblx0XHRcdGNhc2UgJ3NhbXBsaW5nTG9nJzpcblx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBzYW1wbGluZ1NlcnZpY2UuZ2V0TG9nVGV4dChzZXJ2ZXIpLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nTG9nLnRpdGxlJywgJ01DUCBTYW1wbGluZzogezB9Jywgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihwaWNrKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdXRoQWN0aW9ucyhcblx0XHRhdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZTogSUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLFxuXHRcdHNlcnZlcklkOiBzdHJpbmdcblx0KTogQXV0aEFjdGlvbkl0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBBdXRoQWN0aW9uSXRlbVtdID0gW107XG5cdFx0Ly8gUmVhbGx5LCB0aGlzIHNob3VsZCBvbmx5IGV2ZXIgaGF2ZSBvbmUgZW50cnkuXG5cdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJJZCwgYWNjb3VudE5hbWVdIG9mIGF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLm1jcFNlcnZlcihzZXJ2ZXJJZCkuZ2V0QWxsQWNjb3VudFByZWZlcmVuY2VzKCkpIHtcblxuXHRcdFx0Y29uc3QgYWNjb3VudFF1ZXJ5ID0gYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UucHJvdmlkZXIocHJvdmlkZXJJZCkuYWNjb3VudChhY2NvdW50TmFtZSk7XG5cdFx0XHRpZiAoIWFjY291bnRRdWVyeS5tY3BTZXJ2ZXIoc2VydmVySWQpLmlzQWNjZXNzQWxsb3dlZCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIGFjY291bnRzIHRoYXQgYXJlIG5vdCBhbGxvd2VkXG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgYWxsb3dlZCBzZXJ2ZXJzL2V4dGVuc2lvbnMsIG90aGVyIHRoaW5ncyBhcmUgdXNpbmcgdGhpcyBwcm92aWRlclxuXHRcdFx0Ly8gc28gd2Ugc2hvdyBhIGRpc2Nvbm5lY3QgYWN0aW9uLCBvdGhlcndpc2Ugd2Ugc2hvdyBhIHNpZ24gb3V0IGFjdGlvbi5cblx0XHRcdGlmIChhY2NvdW50UXVlcnkuZW50aXRpZXMoKS5nZXRFbnRpdHlDb3VudCgpLnRvdGFsID4gMSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0YWN0aW9uOiAnZGlzY29ubmVjdCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuZGlzY29ubmVjdCcsICdEaXNjb25uZWN0IEFjY291bnQnKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYCgke2FjY291bnROYW1lfSlgLFxuXHRcdFx0XHRcdGFjY291bnRRdWVyeVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRhY3Rpb246ICdzaWdub3V0Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zaWduT3V0JywgJ1NpZ24gT3V0JyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGAoJHthY2NvdW50TmFtZX0pYCxcblx0XHRcdFx0XHRhY2NvdW50UXVlcnlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVBdXRoKFxuXHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRhY2NvdW50UXVlcnk6IElBY2NvdW50UXVlcnksXG5cdFx0ZGVmaW5pdGlvbjogTWNwRGVmaW5pdGlvblJlZmVyZW5jZSxcblx0XHRzaWduT3V0OiBib29sZWFuXG5cdCkge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXJJZCwgYWNjb3VudE5hbWUgfSA9IGFjY291bnRRdWVyeTtcblx0XHRhY2NvdW50UXVlcnkubWNwU2VydmVyKGRlZmluaXRpb24uaWQpLnNldEFjY2Vzc0FsbG93ZWQoZmFsc2UsIGRlZmluaXRpb24ubGFiZWwpO1xuXHRcdGlmIChzaWduT3V0KSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IGFjY291bnQgPSBhY2NvdW50cy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gYWNjb3VudE5hbWUpO1xuXHRcdFx0aWYgKGFjY291bnQpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgdW5kZWZpbmVkLCB7IGFjY291bnQgfSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZW1vdmVTZXNzaW9uKHByb3ZpZGVySWQsIHNlc3Npb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNQ1BTZXJ2ZXJBY3Rpb25SZW5kZXJpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaG92ZXJJc09wZW4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZShtY3BBdXRvU3RhcnRDb25maWcsIE1jcEF1dG9TdGFydFZhbHVlLk5ld0FuZE91dGRhdGVkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBlbnVtIERpc3BsYXllZFN0YXRlIHtcblx0XHRcdE5vbmUsXG5cdFx0XHROZXdUb29scyxcblx0XHRcdEVycm9yLFxuXHRcdFx0UmVmcmVzaGluZyxcblx0XHR9XG5cblx0XHR0eXBlIERpc3BsYXllZFN0YXRlVCA9IHtcblx0XHRcdHN0YXRlOiBEaXNwbGF5ZWRTdGF0ZTtcblx0XHRcdHNlcnZlcnM6IChJTWNwU2VydmVyIHwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24pW107XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIGlzU2VydmVyKHM6IElNY3BTZXJ2ZXIgfCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbik6IHMgaXMgSU1jcFNlcnZlciB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIChzIGFzIElNY3BTZXJ2ZXIpLnN0YXJ0ID09PSAnZnVuY3Rpb24nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXllZFN0YXRlQ3VycmVudCA9IGRlcml2ZWQoKHJlYWRlcik6IERpc3BsYXllZFN0YXRlVCA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gbWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNlcnZlcnNQZXJTdGF0ZTogKElNY3BTZXJ2ZXIgfCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbilbXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRcdGxldCB0aGlzU3RhdGUgPSBEaXNwbGF5ZWRTdGF0ZS5Ob25lO1xuXHRcdFx0XHRzd2l0Y2ggKHNlcnZlci5jYWNoZVN0YXRlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdGNhc2UgTWNwU2VydmVyQ2FjaGVTdGF0ZS5Vbmtub3duOlxuXHRcdFx0XHRcdGNhc2UgTWNwU2VydmVyQ2FjaGVTdGF0ZS5PdXRkYXRlZDpcblx0XHRcdFx0XHRcdHRoaXNTdGF0ZSA9IHNlcnZlci5jb25uZWN0aW9uU3RhdGUucmVhZChyZWFkZXIpLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciA/IERpc3BsYXllZFN0YXRlLkVycm9yIDogRGlzcGxheWVkU3RhdGUuTmV3VG9vbHM7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE1jcFNlcnZlckNhY2hlU3RhdGUuUmVmcmVzaGluZ0Zyb21Vbmtub3duOlxuXHRcdFx0XHRcdFx0dGhpc1N0YXRlID0gRGlzcGxheWVkU3RhdGUuUmVmcmVzaGluZztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLnJlYWQocmVhZGVyKS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IgPyBEaXNwbGF5ZWRTdGF0ZS5FcnJvciA6IERpc3BsYXllZFN0YXRlLk5vbmU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVt0aGlzU3RhdGVdID8/PSBbXTtcblx0XHRcdFx0c2VydmVyc1BlclN0YXRlW3RoaXNTdGF0ZV0ucHVzaChzZXJ2ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1bmtub3duU2VydmVyU3RhdGVzID0gbWNwU2VydmljZS5sYXp5Q29sbGVjdGlvblN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh1bmtub3duU2VydmVyU3RhdGVzLnN0YXRlID09PSBMYXp5Q29sbGVjdGlvblN0YXRlLkxvYWRpbmdVbmtub3duKSB7XG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVtEaXNwbGF5ZWRTdGF0ZS5SZWZyZXNoaW5nXSA/Pz0gW107XG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVtEaXNwbGF5ZWRTdGF0ZS5SZWZyZXNoaW5nXS5wdXNoKC4uLnVua25vd25TZXJ2ZXJTdGF0ZXMuY29sbGVjdGlvbnMpO1xuXHRcdFx0fSBlbHNlIGlmICh1bmtub3duU2VydmVyU3RhdGVzLnN0YXRlID09PSBMYXp5Q29sbGVjdGlvblN0YXRlLkhhc1Vua25vd24pIHtcblx0XHRcdFx0c2VydmVyc1BlclN0YXRlW0Rpc3BsYXllZFN0YXRlLk5ld1Rvb2xzXSA/Pz0gW107XG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVtEaXNwbGF5ZWRTdGF0ZS5OZXdUb29sc10ucHVzaCguLi51bmtub3duU2VydmVyU3RhdGVzLmNvbGxlY3Rpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG1heFN0YXRlID0gKHNlcnZlcnNQZXJTdGF0ZS5sZW5ndGggLSAxKSBhcyBEaXNwbGF5ZWRTdGF0ZTtcblx0XHRcdGlmIChtYXhTdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuTmV3VG9vbHMgJiYgY29uZmlnLnJlYWQocmVhZGVyKSAhPT0gTWNwQXV0b1N0YXJ0VmFsdWUuTmV2ZXIpIHtcblx0XHRcdFx0bWF4U3RhdGUgPSBEaXNwbGF5ZWRTdGF0ZS5Ob25lO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBzdGF0ZTogbWF4U3RhdGUsIHNlcnZlcnM6IHNlcnZlcnNQZXJTdGF0ZVttYXhTdGF0ZV0gfHwgW10gfTtcblx0XHR9KTtcblxuXHRcdC8vIGF2b2lkIGhpZGluZyB0aGUgaG92ZXIgaWYgYSBzdGF0ZSBjaGFuZ2VzIHdoaWxlIGl0J3Mgb3Blbjpcblx0XHRjb25zdCBkaXNwbGF5ZWRTdGF0ZSA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPERpc3BsYXllZFN0YXRlVD4odGhpcywgKHJlYWRlciwgbGFzdCkgPT4ge1xuXHRcdFx0aWYgKGxhc3QgJiYgaG92ZXJJc09wZW4ucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGRpc3BsYXllZFN0YXRlQ3VycmVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3Rpb25JdGVtU3RhdGUgPSBkaXNwbGF5ZWRTdGF0ZS5tYXAocyA9PiBzLnN0YXRlKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLkNoYXRJbnB1dCwgTWNwQ29tbWFuZElkcy5MaXN0U2VydmVyLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShjbGFzcyBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblxuXHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0XHRcdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtbWNwJyk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuXHRcdFx0XHRcdGNvbnN0IHN0YXRlSW5kaWNhdG9yID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LW1jcC1zdGF0ZS1pbmRpY2F0b3InKSk7XG5cdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwbGF5ZWQgPSBkaXNwbGF5ZWRTdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBzdGF0ZSB9ID0gZGlzcGxheWVkO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cblxuXHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3IuYXJpYUxhYmVsID0gdGhpcy5nZXRMYWJlbEZvclN0YXRlKGRpc3BsYXllZCk7XG5cdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5jbGFzc05hbWUgPSAnY2hhdC1tY3Atc3RhdGUtaW5kaWNhdG9yJztcblx0XHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuTmV3VG9vbHMpIHtcblx0XHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ2NoYXQtbWNwLXN0YXRlLW5ldycsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ucmVmcmVzaCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ2NoYXQtbWNwLXN0YXRlLWVycm9yJywgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi53YXJuaW5nKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBEaXNwbGF5ZWRTdGF0ZS5SZWZyZXNoaW5nKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5jbGFzc0xpc3QuYWRkKCdjaGF0LW1jcC1zdGF0ZS1yZWZyZXNoaW5nJywgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoc3Bpbm5pbmdMb2FkaW5nKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG9uQ2xpY2soZTogTW91c2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRcdFx0Y29uc3QgeyBzdGF0ZSwgc2VydmVycyB9ID0gZGlzcGxheWVkU3RhdGVDdXJyZW50LmdldCgpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuTmV3VG9vbHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGludGVyYWN0aW9uID0gbmV3IE1jcFN0YXJ0U2VydmVySW50ZXJhY3Rpb24oKTtcblx0XHRcdFx0XHRcdHNlcnZlcnMuZmlsdGVyKGlzU2VydmVyKS5mb3JFYWNoKHNlcnZlciA9PiBzZXJ2ZXIuc3RvcCgpLnRoZW4oKCkgPT4gc2VydmVyLnN0YXJ0KHsgaW50ZXJhY3Rpb24gfSkpKTtcblx0XHRcdFx0XHRcdG1jcFNlcnZpY2UuYWN0aXZhdGVDb2xsZWN0aW9ucygpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLlJlZnJlc2hpbmcpIHtcblx0XHRcdFx0XHRcdGZpbmRMYXN0KHNlcnZlcnMsIGlzU2VydmVyKT8uc2hvd091dHB1dCgpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSBmaW5kTGFzdChzZXJ2ZXJzLCBpc1NlcnZlcik7XG5cdFx0XHRcdFx0XHRpZiAoc2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHNlcnZlci5zaG93T3V0cHV0KHRydWUpO1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsIHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5MaXN0U2VydmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldExhYmVsRm9yU3RhdGUoKSB8fCBzdXBlci5nZXRUb29sdGlwKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50cyh7IHN0YXRlLCBzZXJ2ZXJzIH0gPSBkaXNwbGF5ZWRTdGF0ZUN1cnJlbnQuZ2V0KCkpOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJTWFuYWdlZEhvdmVyVG9vbHRpcEhUTUxFbGVtZW50IHtcblx0XHRcdFx0XHRjb25zdCBsaW5rID0gKHM6IElNY3BTZXJ2ZXIpID0+IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoe1xuXHRcdFx0XHRcdFx0dGV4dDogcy5kZWZpbml0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3MuZGVmaW5pdGlvbi5pZF0sXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbWNwLnNlcnZlci5vcHRpb25zLnRvb2x0aXAnLCAnU2hvdyBzZXJ2ZXIgb3B0aW9ucyBmb3IgezB9Jywgcy5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNvbnN0IHNpbmdsZSA9IHNlcnZlcnMubGVuZ3RoID09PSAxO1xuXHRcdFx0XHRcdGNvbnN0IG5hbWVzID0gc2VydmVycy5tYXAocyA9PiBpc1NlcnZlcihzKSA/IGxpbmsocykgOiAnYCcgKyBzLmxhYmVsICsgJ2AnKS5tYXAobCA9PiBzaW5nbGUgPyBsIDogYC0gJHtsfWApLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRcdGxldCBtYXJrZG93bjogTWFya2Rvd25TdHJpbmc7XG5cdFx0XHRcdFx0aWYgKHN0YXRlID09PSBEaXNwbGF5ZWRTdGF0ZS5OZXdUb29scykge1xuXHRcdFx0XHRcdFx0bWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoc2luZ2xlXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5uZXdUb29scy5tZC5zaW5nbGUnLCBcIk1DUCBzZXJ2ZXIgezB9IGhhcyBiZWVuIHVwZGF0ZWQgYW5kIG1heSBoYXZlIG5ldyB0b29scyBhdmFpbGFibGUuXCIsIG5hbWVzKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtY3AubmV3VG9vbHMubWQubXVsdGknLCBcIk1DUCBzZXJ2ZXJzIGhhdmUgYmVlbiB1cGRhdGVkIGFuZCBtYXkgaGF2ZSBuZXcgdG9vbHMgYXZhaWxhYmxlOlxcblxcbnswfVwiLCBuYW1lcylcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuRXJyb3IpIHtcblx0XHRcdFx0XHRcdG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKHNpbmdsZVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtY3AuZXJyLm1kLnNpbmdsZScsIFwiTUNQIHNlcnZlciB7MH0gd2FzIHVuYWJsZSB0byBzdGFydCBzdWNjZXNzZnVsbHkuXCIsIG5hbWVzKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtY3AuZXJyLm1kLm11bHRpJywgXCJNdWx0aXBsZSBNQ1Agc2VydmVycyB3ZXJlIHVuYWJsZSB0byBzdGFydCBzdWNjZXNzZnVsbHk6XFxuXFxuezB9XCIsIG5hbWVzKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0TGFiZWxGb3JTdGF0ZSgpIHx8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogKHRva2VuKTogSFRNTEVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0XHRob3ZlcklzT3Blbi5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBob3ZlcklzT3Blbi5zZXQoZmFsc2UsIHVuZGVmaW5lZCkpKTtcblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTIvQGJlbmliZW5qOiB3b3JrYXJvdW5kIGZvciAjMjU3OTIzXG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmICghY29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LCAyMDAwKSk7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2Lm1jcC1ob3Zlci1jb250ZW50cycpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIFJlbmRlciBtYXJrZG93biBjb250ZW50XG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duLmlzVHJ1c3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1hcmtkb3duUmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYXJrZG93blJlc3VsdC5lbGVtZW50KTtcblxuXHRcdFx0XHRcdFx0XHQvLyBBZGQgZGl2aWRlclxuXHRcdFx0XHRcdFx0XHRjb25zdCBkaXZpZGVyID0gJCgnaHIubWNwLWhvdmVyLWRpdmlkZXInKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRpdmlkZXIpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIEFkZCBjaGVja2JveCBmb3IgbWNwQXV0b1N0YXJ0Q29uZmlnIHNldHRpbmdcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hlY2tib3hDb250YWluZXIgPSAkKCdkaXYubWNwLWhvdmVyLXNldHRpbmcnKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ0xhYmVsU3RyID0gbG9jYWxpemUoJ21jcC5hdXRvU3RhcnQnLCBcIkF1dG9tYXRpY2FsbHkgc3RhcnQgTUNQIHNlcnZlcnMgd2hlbiBzZW5kaW5nIGEgY2hhdCBtZXNzYWdlXCIpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoZWNrYm94ID0gc3RvcmUuYWRkKG5ldyBDaGVja2JveChcblx0XHRcdFx0XHRcdFx0XHRzZXR0aW5nTGFiZWxTdHIsXG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlnLmdldCgpICE9PSBNY3BBdXRvU3RhcnRWYWx1ZS5OZXZlcixcblx0XHRcdFx0XHRcdFx0XHR7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcyB9XG5cdFx0XHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0XHRcdGNoZWNrYm94Q29udGFpbmVyLmFwcGVuZENoaWxkKGNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIEFkZCBsYWJlbCBuZXh0IHRvIGNoZWNrYm94XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNldHRpbmdMYWJlbCA9ICQoJ3NwYW4ubWNwLWhvdmVyLXNldHRpbmctbGFiZWwnLCB1bmRlZmluZWQsIHNldHRpbmdMYWJlbFN0cik7XG5cdFx0XHRcdFx0XHRcdGNoZWNrYm94Q29udGFpbmVyLmFwcGVuZENoaWxkKHNldHRpbmdMYWJlbCk7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgb25DaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3VmFsdWUgPSBjaGVja2JveC5jaGVja2VkID8gTWNwQXV0b1N0YXJ0VmFsdWUuTmV3QW5kT3V0ZGF0ZWQgOiBNY3BBdXRvU3RhcnRWYWx1ZS5OZXZlcjtcblx0XHRcdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShtY3BBdXRvU3RhcnRDb25maWcsIG5ld1ZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQoY2hlY2tib3gub25DaGFuZ2Uob25DaGFuZ2UpKTtcblxuXHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNldHRpbmdMYWJlbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9ICFjaGVja2JveC5jaGVja2VkO1xuXHRcdFx0XHRcdFx0XHRcdG9uQ2hhbmdlKCk7XG5cdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNoZWNrYm94Q29udGFpbmVyKTtcblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJpdmF0ZSBnZXRMYWJlbEZvclN0YXRlKHsgc3RhdGUsIHNlcnZlcnMgfSA9IGRpc3BsYXllZFN0YXRlQ3VycmVudC5nZXQoKSkge1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuTmV3VG9vbHMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLm5ld1Rvb2xzJywgXCJOZXcgdG9vbHMgYXZhaWxhYmxlICh7MH0pXCIsIHNlcnZlcnMubGVuZ3RoIHx8IDEpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC50b29sRXJyb3InLCBcIkVycm9yIGxvYWRpbmcgezB9IHRvb2wocylcIiwgc2VydmVycy5sZW5ndGggfHwgMSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuUmVmcmVzaGluZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtY3AudG9vbFJlZnJlc2gnLCBcIkRpc2NvdmVyaW5nIHRvb2xzLi4uXCIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw6IHRydWUgfSk7XG5cblx0XHR9LCBFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KGFjdGlvbkl0ZW1TdGF0ZSkpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVzZXRNY3BUcnVzdENvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzZXRUcnVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5yZXNldFRydXN0JywgXCJSZXNldCBUcnVzdFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChNY3BDb250ZXh0S2V5cy50b29sc0NvdW50LmdyZWF0ZXIoMCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpO1xuXHRcdG1jcFNlcnZpY2UucmVzZXRUcnVzdCgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFJlc2V0TWNwQ2FjaGVkVG9vbHMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzZXRDYWNoZWRUb29scyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5yZXNldENhY2hlZFRvb2xzJywgXCJSZXNldCBDYWNoZWQgVG9vbHNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoTWNwQ29udGV4dEtleXMudG9vbHNDb3VudC5ncmVhdGVyKDApLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKTtcblx0XHRtY3BTZXJ2aWNlLnJlc2V0Q2FjaGVzKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFkZENvbmZpZ3VyYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuQWRkQ29uZmlndXJhdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5hZGRDb25maWd1cmF0aW9uJywgXCJBZGQgU2VydmVyLi4uXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignbWNwLmFkZENvbmZpZ3VyYXRpb24uZGVzY3JpcHRpb24nLCBcIkluc3RhbGxzIGEgbmV3IE1vZGVsIENvbnRleHQgcHJvdG9jb2wgdG8gdGhlIG1jcC5qc29uIHNldHRpbmdzXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLnJlZ2V4KFJlc291cmNlQ29udGV4dEtleS5QYXRoLmtleSwgL1xcLnZzY29kZVsvXFxcXF1tY3BcXC5qc29uJC8pLFxuXHRcdFx0XHRcdEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKFRFWFRfRklMRV9FRElUT1JfSUQpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29uZmlnVXJpPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gY29uZmlnVXJpID8gd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLnBhcnNlKGNvbmZpZ1VyaSkpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BBZGRDb25maWd1cmF0aW9uQ29tbWFuZCwgdGFyZ2V0ID8/IHVuZGVmaW5lZCkucnVuKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxGcm9tTWFuaWZlc3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuSW5zdGFsbEZyb21NYW5pZmVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0JywgXCJJbnN0YWxsIFNlcnZlciBmcm9tIE1hbmlmZXN0Li4uXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QuZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgYW4gTUNQIHNlcnZlciBmcm9tIGEgSlNPTiBtYW5pZmVzdCBmaWxlXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BJbnN0YWxsRnJvbU1hbmlmZXN0Q29tbWFuZCkucnVuKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgUmVtb3ZlU3RvcmVkSW5wdXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVtb3ZlU3RvcmVkSW5wdXQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AucmVzZXRDYWNoZWRUb29scycsIFwiUmVzZXQgQ2FjaGVkIFRvb2xzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElNY3BSZWdpc3RyeSkuY2xlYXJTYXZlZElucHV0cyhzY29wZSwgaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0U3RvcmVkSW5wdXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuRWRpdFN0b3JlZElucHV0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmVkaXRTdG9yZWRJbnB1dCcsIFwiRWRpdCBTdG9yZWQgSW5wdXRcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaW5wdXRJZDogc3RyaW5nLCB1cmk6IFVSSSB8IHVuZGVmaW5lZCwgY29uZmlnU2VjdGlvbjogc3RyaW5nLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB1cmkgJiYgYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSkuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSk7XG5cdFx0YWNjZXNzb3IuZ2V0KElNY3BSZWdpc3RyeSkuZWRpdFNhdmVkSW5wdXQoaW5wdXRJZCwgd29ya3NwYWNlRm9sZGVyIHx8IHVuZGVmaW5lZCwgY29uZmlnU2VjdGlvbiwgdGFyZ2V0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0T0F1dGhDbGllbnRTZWNyZXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2V0T0F1dGhDbGllbnRTZWNyZXQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQnLCBcIlNldCBPQXV0aCBDbGllbnQgU2VjcmV0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNsaWVudElkOiBzdHJpbmcsIG1jcFNlcnZlclVybDogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZWNyZXRTdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBrZXkgPSBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkobWNwU2VydmVyVXJsLCBjbGllbnRJZCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCBzZWNyZXRTdG9yYWdlU2VydmljZS5nZXQoa2V5KTtcblxuXHRcdGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IHtcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2gpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC5kZWxldGUnLCBcIkRlbGV0ZSBzdG9yZWQgY2xpZW50IHNlY3JldFwiKSxcblx0XHR9O1xuXHRcdGNvbnN0IHJldmVhbEJ1dHRvbiA9IHtcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQucmV2ZWFsJywgXCJTaG93IGNsaWVudCBzZWNyZXRcIiksXG5cdFx0fTtcblx0XHRjb25zdCBoaWRlQnV0dG9uID0ge1xuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leWVDbG9zZWQpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC5oaWRlJywgXCJIaWRlIGNsaWVudCBzZWNyZXRcIiksXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPHsga2luZDogJ2FjY2VwdCc7IHZhbHVlOiBzdHJpbmcgfSB8IHsga2luZDogJ2RlbGV0ZScgfSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCk7XG5cdFx0XHRpbnB1dC50aXRsZSA9IGV4aXN0aW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC50aXRsZS5yZXBsYWNlJywgXCJSZXBsYWNlIENsaWVudCBTZWNyZXQgZm9yIHswfVwiLCBzZXJ2ZXJOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQudGl0bGUuc2V0JywgXCJTZXQgQ2xpZW50IFNlY3JldCBmb3IgezB9XCIsIHNlcnZlck5hbWUpO1xuXHRcdFx0aW5wdXQucHJvbXB0ID0gbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC5wcm9tcHQnLCBcIkVudGVyIHRoZSBjbGllbnQgc2VjcmV0IGZvciBPQXV0aCBjbGllbnQgJ3swfScuXCIsIGNsaWVudElkKTtcblx0XHRcdGlucHV0LnBsYWNlaG9sZGVyID0gZXhpc3Rpbmdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbWNwLnNldE9BdXRoQ2xpZW50U2VjcmV0LnBsYWNlaG9sZGVyLnJlcGxhY2UnLCBcIkVudGVyIGEgbmV3IGNsaWVudCBzZWNyZXQgdG8gcmVwbGFjZSB0aGUgc3RvcmVkIHZhbHVlXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC5wbGFjZWhvbGRlci5zZXQnLCBcIkVudGVyIGNsaWVudCBzZWNyZXRcIik7XG5cdFx0XHRpbnB1dC5wYXNzd29yZCA9IHRydWU7XG5cdFx0XHRpbnB1dC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0aW5wdXQudmFsdWUgPSBleGlzdGluZztcblx0XHRcdFx0aW5wdXQudmFsdWVTZWxlY3Rpb24gPSBbMCwgZXhpc3RpbmcubGVuZ3RoXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZUJ1dHRvbnMgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvZ2dsZUJ1dHRvbiA9IGlucHV0LnBhc3N3b3JkID8gcmV2ZWFsQnV0dG9uIDogaGlkZUJ1dHRvbjtcblx0XHRcdFx0aW5wdXQuYnV0dG9ucyA9IGV4aXN0aW5nID8gW3RvZ2dsZUJ1dHRvbiwgZGVsZXRlQnV0dG9uXSA6IFt0b2dnbGVCdXR0b25dO1xuXHRcdFx0fTtcblx0XHRcdHVwZGF0ZUJ1dHRvbnMoKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBpbnB1dC52YWx1ZTtcblx0XHRcdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIEVtcHR5IHZhbHVlOiB0cmVhdCBhcyBhIGRlbGV0ZSAoc2FtZSBhcyB0aGUgdHJhc2ggYnV0dG9uKVxuXHRcdFx0XHRcdHJlc29sdmUoeyBraW5kOiAnZGVsZXRlJyB9KTtcblx0XHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUoeyBraW5kOiAnYWNjZXB0JywgdmFsdWUgfSk7XG5cdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZFRyaWdnZXJCdXR0b24oYnRuID0+IHtcblx0XHRcdFx0aWYgKGJ0biA9PT0gZGVsZXRlQnV0dG9uKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IGtpbmQ6ICdkZWxldGUnIH0pO1xuXHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChidG4gPT09IHJldmVhbEJ1dHRvbiB8fCBidG4gPT09IGhpZGVCdXR0b24pIHtcblx0XHRcdFx0XHRpbnB1dC5wYXNzd29yZCA9ICFpbnB1dC5wYXNzd29yZDtcblx0XHRcdFx0XHR1cGRhdGVCdXR0b25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aW5wdXQuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aW5wdXQuc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuY2VsbGVkXG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnZGVsZXRlJykge1xuXHRcdFx0YXdhaXQgc2VjcmV0U3RvcmFnZVNlcnZpY2UuZGVsZXRlKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlLnNldChrZXksIHJlc3VsdC52YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93Q29uZmlndXJhdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93Q29uZmlndXJhdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnNob3dDb25maWd1cmF0aW9uJywgXCJTaG93IENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29sbGVjdGlvbklkOiBzdHJpbmcsIHNlcnZlcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gYWNjZXNzb3IuZ2V0KElNY3BSZWdpc3RyeSkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IGNvbGxlY3Rpb25JZCk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyID0gY29sbGVjdGlvbj8uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCkuZmluZChzID0+IHMuaWQgPT09IHNlcnZlcklkKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoc2VydmVyPy5wcmVzZW50YXRpb24/Lm9yaWdpbikge1xuXHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlcnZlci5wcmVzZW50YXRpb24ub3JpZ2luLnVyaSxcblx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IHNlcnZlci5wcmVzZW50YXRpb24ub3JpZ2luLnJhbmdlIH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoY29sbGVjdGlvbi5wcmVzZW50YXRpb24/Lm9yaWdpbikge1xuXHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IGNvbGxlY3Rpb24ucHJlc2VudGF0aW9uLm9yaWdpbixcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd091dHB1dCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93T3V0cHV0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmNvbW1hbmQuc2hvd091dHB1dCcsIFwiU2hvdyBPdXRwdXRcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJTWNwU2VydmljZSkuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBzZXJ2ZXJJZCk/LnNob3dPdXRwdXQoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcge1xuXHRyZWFkb25seSBhZ2VudEhvc3RTZXNzaW9uOiBVUkk7XG5cdHJlYWRvbmx5IHNlcnZlcklkOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGlzQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZyhhcmc6IHN0cmluZyB8IElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnKTogYXJnIGlzIElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnIHtcblx0cmV0dXJuIHR5cGVvZiBhcmcgIT09ICdzdHJpbmcnICYmIFVSSS5pc1VyaShhcmcuYWdlbnRIb3N0U2Vzc2lvbikgJiYgdHlwZW9mIGFyZy5zZXJ2ZXJJZCA9PT0gJ3N0cmluZyc7XG59XG5cbmZ1bmN0aW9uIGdldEFnZW50SG9zdE1jcFNlcnZlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZyk6IElBZ2VudEhvc3RNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSkuZ2V0TWNwU2VydmVycyhhcmcuYWdlbnRIb3N0U2Vzc2lvbikuZmluZChzZXJ2ZXIgPT4gc2VydmVyLmlkID09PSBhcmcuc2VydmVySWQpO1xufVxuXG5leHBvcnQgY2xhc3MgUmVzdGFydFNlcnZlciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5SZXN0YXJ0U2VydmVyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmNvbW1hbmQucmVzdGFydFNlcnZlcicsIFwiUmVzdGFydCBTZXJ2ZXJcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVySWQ6IHN0cmluZyB8IElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnLCBvcHRzPzogSU1jcFNlcnZlclN0YXJ0T3B0cykge1xuXHRcdGlmIChpc0FnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcoc2VydmVySWQpKSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXIoYWNjZXNzb3IsIHNlcnZlcklkKTtcblx0XHRcdGFjY2Vzc29yLmdldChJTG9nU2VydmljZSkud2FybihgUmVzdGFydGluZyBNQ1Agc2VydmVyICcke3NlcnZlcj8ubmFtZSA/PyBzZXJ2ZXJJZC5zZXJ2ZXJJZH0nIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIGFnZW50LWhvc3Qgc2VydmVyc2ApO1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKS53YXJuKGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LnJlc3RhcnRVbnN1cHBvcnRlZCcsIFwiUmVzdGFydGluZyBNQ1Agc2VydmVyICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIGFnZW50LWhvc3Qgc2VydmVycy4gU3RvcCBhbmQgc3RhcnQgdGhlIHNlcnZlciBpbnN0ZWFkLlwiLCBzZXJ2ZXI/Lm5hbWUgPz8gc2VydmVySWQuc2VydmVySWQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHNlcnZlcklkKTtcblx0XHRzPy5zaG93T3V0cHV0KCk7XG5cdFx0YXdhaXQgcz8uc3RvcCgpO1xuXHRcdGF3YWl0IHM/LnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnLCAuLi5vcHRzIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFydFNlcnZlciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdGFydFNlcnZlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnN0YXJ0U2VydmVyJywgXCJTdGFydCBTZXJ2ZXJcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVySWQ6IHN0cmluZyB8IElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnLCBvcHRzPzogSU1jcFNlcnZlclN0YXJ0T3B0cyAmIHsgd2FpdEZvckxpdmVUb29scz86IGJvb2xlYW4gfSkge1xuXHRcdGlmIChpc0FnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcoc2VydmVySWQpKSB7XG5cdFx0XHRhd2FpdCBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXIoYWNjZXNzb3IsIHNlcnZlcklkKT8uc3RhcnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2VydmVycyA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSkuc2VydmVycy5nZXQoKTtcblx0XHRpZiAoc2VydmVySWQgIT09ICcqJykge1xuXHRcdFx0c2VydmVycyA9IHNlcnZlcnMuZmlsdGVyKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBzZXJ2ZXJJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRPcHRzOiBJTWNwU2VydmVyU3RhcnRPcHRzID0geyBwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcsIC4uLm9wdHMgfTtcblx0XHRpZiAob3B0cz8ud2FpdEZvckxpdmVUb29scykge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2VydmVycy5tYXAocyA9PiBzdGFydFNlcnZlckFuZFdhaXRGb3JMaXZlVG9vbHMocywgc3RhcnRPcHRzKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZXJ2ZXJzLm1hcChzID0+IHMuc3RhcnQoc3RhcnRPcHRzKSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RvcFNlcnZlciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdG9wU2VydmVyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmNvbW1hbmQuc3RvcFNlcnZlcicsIFwiU3RvcCBTZXJ2ZXJcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVySWQ6IHN0cmluZyB8IElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnKSB7XG5cdFx0aWYgKGlzQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZyhzZXJ2ZXJJZCkpIHtcblx0XHRcdGF3YWl0IGdldEFnZW50SG9zdE1jcFNlcnZlcihhY2Nlc3Nvciwgc2VydmVySWQpPy5zdG9wKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcyA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSkuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBzZXJ2ZXJJZCk7XG5cdFx0YXdhaXQgcz8uc3RvcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BCcm93c2VDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkJyb3dzZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLmJyb3dzZScsIFwiTUNQIFNlcnZlcnNcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLmJyb3dzZS50b29sdGlwJywgXCJCcm93c2UgTUNQIFNlcnZlcnNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzFfcHJlZGVmaW5lZCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEluc3RhbGxlZE1jcFNlcnZlcnNWaWV3SWQpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLm9wZW5TZWFyY2goJ0BtY3AgJyk7XG5cdH1cbn1cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE1jcENvbW1hbmRJZHMuQnJvd3NlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLmJyb3dzZS5tY3AnLCBcIkJyb3dzZSBNQ1AgU2VydmVyc1wiKSxcblx0XHRjYXRlZ29yeSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdH0sXG59KTtcblxuZXhwb3J0IGNsYXNzIFNob3dJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93SW5zdGFsbGVkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmNvbW1hbmQuc2hvdy5pbnN0YWxsZWQnLCBcIlNob3cgSW5zdGFsbGVkIFNlcnZlcnNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0LCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KEluc3RhbGxlZE1jcFNlcnZlcnNWaWV3SWQsIHRydWUpO1xuXHRcdGlmICghdmlldykge1xuXHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKFZJRVdMRVRfSUQpO1xuXHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KEluc3RhbGxlZE1jcFNlcnZlcnNWaWV3SWQsIHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQ0hBVF9DT05GSUdfTUVOVV9JRCwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd0luc3RhbGxlZCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3Auc2VydmVycycsIFwiTUNQIFNlcnZlcnNcIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSksXG5cdG9yZGVyOiAxMCxcblx0Z3JvdXA6ICcyX2xldmVsJ1xufSk7XG5cbmFic3RyYWN0IGNsYXNzIE9wZW5NY3BSZXNvdXJjZUNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFVSSShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8VVJJPjtcblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXdhaXQgdGhpcy5nZXRVUkkoYWNjZXNzb3IpO1xuXHRcdGlmICghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhyZXNvdXJjZSkpKSB7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgc2VydmVyczoge30gfSwgbnVsbCwgJ1xcdCcpKSk7XG5cdFx0fVxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuVXNlck1jcFJlc291cmNlQ29tbWFuZCBleHRlbmRzIE9wZW5NY3BSZXNvdXJjZUNvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5PcGVuVXNlck1jcCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLm9wZW5Vc2VyTWNwJywgXCJPcGVuIFVzZXIgQ29uZmlndXJhdGlvblwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VVJJKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuUmVtb3RlVXNlck1jcFJlc291cmNlQ29tbWFuZCBleHRlbmRzIE9wZW5NY3BSZXNvdXJjZUNvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5PcGVuUmVtb3RlVXNlck1jcCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLm9wZW5SZW1vdGVVc2VyTWNwJywgXCJPcGVuIFJlbW90ZSBVc2VyIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRcdFJlbW90ZU5hbWVDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKVxuXHRcdFx0KVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldFVSSShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlbW90ZVByb2ZpbGUgPSBhd2FpdCByZW1vdGVVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmdldFJlbW90ZVByb2ZpbGUodXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZSk7XG5cdFx0cmV0dXJuIHJlbW90ZVByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VGb2xkZXJNY3BSZXNvdXJjZUNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuT3BlbldvcmtzcGFjZUZvbGRlck1jcCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLm9wZW5Xb3Jrc3BhY2VGb2xkZXJNY3AnLCBcIk9wZW4gV29ya3NwYWNlIEZvbGRlciBNQ1AgQ29uZmlndXJhdGlvblwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdFx0V29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKDApXG5cdFx0XHQpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlRm9sZGVycy5sZW5ndGggPT09IDEgPyB3b3Jrc3BhY2VGb2xkZXJzWzBdIDogYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVdvcmtzcGFjZUZvbGRlcj4oUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQpO1xuXHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB3b3Jrc3BhY2VGb2xkZXIudG9SZXNvdXJjZShXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKSB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VNY3BSZXNvdXJjZUNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuT3BlbldvcmtzcGFjZU1jcCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLm9wZW5Xb3Jrc3BhY2VNY3AnLCBcIk9wZW4gV29ya3NwYWNlIE1DUCBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKVxuXHRcdFx0KVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbjtcblx0XHRpZiAod29ya3NwYWNlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gfSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BCcm93c2VSZXNvdXJjZXNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkJyb3dzZVJlc291cmNlcyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5icm93c2VSZXNvdXJjZXMnLCBcIkJyb3dzZSBSZXNvdXJjZXMuLi5cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE1jcENvbnRleHRLZXlzLnNlcnZlckNvdW50LmdyZWF0ZXIoMCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXJ2ZXI/OiBJTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoTWNwUmVzb3VyY2VRdWlja1BpY2ssIHNlcnZlcikucGljaygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKS5xdWlja0FjY2Vzcy5zaG93KE1jcFJlc291cmNlUXVpY2tBY2Nlc3MuUFJFRklYKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcENvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkNvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLmNvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzJywgXCJDb25maWd1cmUgU2FtcGxpbmdNb2RlbFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXJ2ZXI6IElNY3BTZXJ2ZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgbG1TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdGNvbnN0IG1jcFNhbXBsaW5nID0gYWNjZXNzb3IuZ2V0KElNY3BTYW1wbGluZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdJZHMgPSBuZXcgU2V0KG1jcFNhbXBsaW5nLmdldENvbmZpZyhzZXJ2ZXIpLmFsbG93ZWRNb2RlbHMpO1xuXHRcdGNvbnN0IGFsbEl0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdID0gbG1TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKS5tYXAoaWQgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBsbVNlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZCkhO1xuXHRcdFx0aWYgKCFtb2RlbC5pc1VzZXJTZWxlY3RhYmxlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogbW9kZWwubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG1vZGVsLnRvb2x0aXAsXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRwaWNrZWQ6IGV4aXN0aW5nSWRzLnNpemUgPyBleGlzdGluZ0lkcy5oYXMoaWQpIDogbW9kZWwuaXNEZWZhdWx0Rm9yTG9jYXRpb25bQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHR9O1xuXHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0YWxsSXRlbXMuc29ydCgoYSwgYikgPT4gKGIucGlja2VkID8gMSA6IDApIC0gKGEucGlja2VkID8gMSA6IDApIHx8IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0XHQvLyBkbyB0aGUgcXVpY2twaWNrIHNlbGVjdGlvblxuXHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soYWxsSXRlbXMsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLmNvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzLnBoJywgJ1BpY2sgdGhlIG1vZGVscyB7MH0gY2FuIGFjY2VzcyB2aWEgTUNQIHNhbXBsaW5nJywgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0Y2FuUGlja01hbnk6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRpZiAocGlja2VkKSB7XG5cdFx0XHRhd2FpdCBtY3BTYW1wbGluZy51cGRhdGVDb25maWcoc2VydmVyLCBjID0+IGMuYWxsb3dlZE1vZGVscyA9IHBpY2tlZC5tYXAocCA9PiBwLmlkISkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwaWNrZWQ/Lmxlbmd0aCB8fCAwO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTdGFydFByb21wdGluZ1NlcnZlckNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RhcnRQcm9tcHRGb3JTZXJ2ZXIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3Auc3RhcnRQcm9tcHRpbmdTZXJ2ZXInLCBcIlN0YXJ0IFByb21wdGluZyBTZXJ2ZXJcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVyOiBJTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgb3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldChhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSksIGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IHdpZGdldC5pbnB1dEVkaXRvcjtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZSA9IChlZGl0b3IuZ2V0U2VsZWN0aW9uKCkgfHwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSkuY29sbGFwc2VUb0VuZCgpO1xuXHRcdGNvbnN0IHRleHQgPSBtY3BQcm9tcHRQcmVmaXgoc2VydmVyLmRlZmluaXRpb24pICsgJy4nO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZSwgdGV4dCB9XSk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHJhbmdlLmdldEVuZFBvc2l0aW9uKCkuZGVsdGEoMCwgdGV4dC5sZW5ndGgpKSk7XG5cdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8udHJpZ2dlclN1Z2dlc3QoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwU2tpcEN1cnJlbnRBdXRvc3RhcnRDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNraXBDdXJyZW50QXV0b3N0YXJ0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLnNraXBDdXJyZW50QXV0b3N0YXJ0JywgXCJTa2lwIEN1cnJlbnQgQXV0b3N0YXJ0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpLmNhbmNlbEF1dG9zdGFydCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyx1QkFBdUIsMEJBQTBCLGlCQUFpQjtBQUM5RSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFn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UyxPQUFPLGFBQWEsS0FBSyxNQUFNLGtCQUFrQixHQUFHLGNBQWM7QUFDakYsVUFBTSxPQUFPLGdCQUFnQixPQUFPLFVBQVUsSUFBSTtBQUVsRCxVQUFNLFdBQVcsQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFDbEMsV0FBTyxhQUFhLE1BQU0sY0FBYyxNQUFNLGVBQWUsRUFBRSxNQUFNLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUNyRixXQUFPLFdBQVc7QUFDbEIsc0JBQWtCLElBQUksTUFBTSxHQUFHLGVBQWU7QUFBQSxFQUMvQztBQUNEO0FBRU8sTUFBTSx1Q0FBdUMsUUFBUTtBQUFBLEVBQzNELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLGNBQWM7QUFBQSxNQUNsQixPQUFPLFVBQVUsNEJBQTRCLHdCQUF3QjtBQUFBLE1BQ3JFO0FBQUEsTUFDQSxJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELGFBQVMsSUFBSSxXQUFXLEVBQUUsZ0JBQWdCO0FBQUEsRUFDM0M7QUFDRDsiLAogICJuYW1lcyI6IFsic2VydmVycyIsICJEaXNwbGF5ZWRTdGF0ZSIsICJzIl0KfQo=
