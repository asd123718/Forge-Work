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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, isDisposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../../platform/mcp/common/mcpManagement.js";
import { IMcpWorkbenchService, McpConnectionState, McpServerInstallState, IMcpService } from "../../../../contrib/mcp/common/mcpTypes.js";
import { IMcpRegistry } from "../../../mcp/common/mcpRegistryTypes.js";
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from "../../../mcp/common/discovery/pluginMcpDiscovery.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { ContributionEnablementState, isContributionDisabled } from "../../common/enablement.js";
import { McpCommandIds } from "../../../../contrib/mcp/common/mcpCommandIds.js";
import { autorun } from "../../../../../base/common/observable.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../base/common/uri.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { ConfigureModelAccessAction, DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction, getContextMenuActions, RestartServerAction, ShowSamplingRequestsAction, StartServerAction, StopServerAction } from "../../../../contrib/mcp/browser/mcpServerActions.js";
import { LocalMcpServerScope } from "../../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { workspaceIcon, userIcon, mcpServerIcon, builtinIcon, pluginIcon, extensionIcon } from "./aiCustomizationIcons.js";
import { formatDisplayName, truncateToFirstLine } from "./aiCustomizationListWidget.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from "./customizationGroupHeaderRenderer.js";
import { AgentPluginItemKind } from "../agentPluginEditor/agentPluginItems.js";
import { getCustomizationDisabledLabel, ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { IAgentHostCustomizationService } from "../agentSessions/agentHost/agentHostCustomizationService.js";
import { CustomizationEnablementKind, McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { GalleryItemInstallState, GalleryItemRenderer } from "./galleryItemRenderer.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { getCustomizationScopeEnablement } from "../../../../../platform/agentHost/common/customizationEnablement.js";
import { createAgentHostEnablePluginAction } from "../agentPluginActions.js";
const $ = DOM.$;
const MCP_ITEM_HEIGHT = 36;
const MCP_ITEM_WITH_DESCRIPTION_HEIGHT = 44;
const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;
const COPILOT_EXTENSION_IDS = ["github.copilot", "github.copilot-chat"];
function isCopilotExtension(id) {
  return COPILOT_EXTENSION_IDS.some((copilotId) => ExtensionIdentifier.equals(id, copilotId));
}
function getPluginUriFromCollectionId(collectionId) {
  return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : void 0;
}
function createBuiltinActiveSessionMcpEntries(servers) {
  return servers.map((server) => ({ type: "session-server-item", server }));
}
class McpServerItemDelegate {
  getHeight(element) {
    if (element.type === "group-header") {
      return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
    }
    if (element.type === "server-item" && element.server.gallery && (element.marketplace || !element.server.local)) {
      return 62;
    }
    if (element.type === "server-item" && element.server.description?.trim()) {
      return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
    }
    if (element.type === "builtin-item" && element.description) {
      return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
    }
    return MCP_ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element.type === "group-header") {
      return "mcpGroupHeader";
    }
    if (element.type === "builtin-item") {
      return "mcpServerItem";
    }
    if (element.type === "session-server-item") {
      return "mcpServerItem";
    }
    const server = element.server;
    return server.gallery && (element.marketplace || !server.local) ? MCP_GALLERY_ITEM_TEMPLATE_ID : "mcpServerItem";
  }
}
let McpServerItemRenderer = class {
  constructor(_afterShowOutput, workspaceService, agentPluginService, hoverService, agentHostCustomizationService, customizationHarnessService, outputService) {
    this._afterShowOutput = _afterShowOutput;
    this.workspaceService = workspaceService;
    this.agentPluginService = agentPluginService;
    this.hoverService = hoverService;
    this.agentHostCustomizationService = agentHostCustomizationService;
    this.customizationHarnessService = customizationHarnessService;
    this.outputService = outputService;
    this.templateId = "mcpServerItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const nameRow = DOM.append(details, $(".mcp-server-name-row"));
    const name = DOM.append(nameRow, $(".mcp-server-name"));
    const description = DOM.append(details, $(".mcp-server-description"));
    const actions = DOM.append(container, $(".mcp-server-actions"));
    return {
      container,
      typeIcon,
      name,
      description,
      actions,
      elementDisposables: new DisposableStore(),
      actionDisposables: new DisposableStore()
    };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionDisposables.clear();
    if (element.type === "builtin-item") {
      templateData.container.classList.add("builtin");
      templateData.container.classList.toggle("has-detail", false);
      templateData.name.textContent = formatDisplayName(element.label);
      if (element.description) {
        templateData.description.textContent = truncateToFirstLine(element.description);
        templateData.description.style.display = "";
      } else {
        templateData.description.textContent = "";
        templateData.description.style.display = "none";
      }
      this.updateKnownServerStatus(templateData, element);
      const pluginUriStr = getPluginUriFromCollectionId(element.collectionId);
      if (pluginUriStr) {
        templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
          const plugin = this.agentPluginService.plugins.get().find((p) => p.uri.toString() === pluginUriStr);
          if (plugin) {
            return {
              content: `${element.label}
${localize("fromPlugin", "Plugin: {0}", plugin.label)}`,
              appearance: { compact: true, skipFadeInAnimation: true }
            };
          }
          return { content: element.label, appearance: { compact: true, skipFadeInAnimation: true } };
        }));
      }
      return;
    }
    if (element.type === "session-server-item") {
      templateData.container.classList.remove("builtin");
      templateData.container.classList.toggle("has-detail", false);
      templateData.name.textContent = formatDisplayName(element.server.name);
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
      this.updateActiveSessionStatus(templateData, element);
      return;
    }
    templateData.container.classList.remove("builtin");
    templateData.name.textContent = formatDisplayName(element.server.label);
    const description = element.server.description?.trim();
    const isGallery = !element.server.local;
    const hasDetail = !!description || isGallery;
    templateData.container.classList.toggle("has-detail", hasDetail);
    if (description) {
      templateData.description.textContent = truncateToFirstLine(description);
      templateData.description.style.display = "";
    } else {
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
    }
    if (element.activeSessionServer !== void 0) {
      this.updateKnownServerStatus(templateData, element);
    } else if (this.workspaceService.isSessionsWindow) {
      this.updateKnownServerStatus(templateData, element);
    } else {
      templateData.elementDisposables.add(autorun((reader) => {
        const disabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
        const connectionState = element.localServer?.connectionState.read(reader);
        templateData.container.classList.toggle("disabled", disabled);
        this.updateStatus(templateData, element, disabled ? "disabled" : connectionState?.state);
      }));
    }
  }
  updateKnownServerStatus(templateData, element) {
    let localDisabled = false;
    const update = () => {
      const activeSessionServer = element.activeSessionServer === void 0 ? void 0 : this.agentHostCustomizationService.getMcpServers(this.customizationHarnessService.activeSessionResource.get()).find((server) => server.id === element.activeSessionServer?.id) ?? element.activeSessionServer;
      if (activeSessionServer !== void 0) {
        const presentation = getActiveSessionServerPresentation(activeSessionServer);
        templateData.container.classList.toggle("disabled", !presentation.enabled);
        this.updateStatus(templateData, element, presentation.status, presentation.enabled ? void 0 : activeSessionServer.disabledReason);
        return;
      }
      templateData.container.classList.toggle("disabled", localDisabled);
      this.updateStatus(templateData, element, localDisabled ? "disabled" : void 0);
    };
    templateData.elementDisposables.add(autorun((reader) => {
      localDisabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
      update();
    }));
    templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(update));
  }
  updateActiveSessionStatus(templateData, element) {
    const update = () => {
      const server = this.agentHostCustomizationService.getMcpServers(this.customizationHarnessService.activeSessionResource.get()).find((server2) => server2.id === element.server.id);
      const presentation = server && getActiveSessionServerPresentation(server);
      templateData.container.classList.toggle("disabled", presentation?.enabled === false);
      this.updateStatus(templateData, element, presentation?.status, server?.disabledReason);
    };
    update();
    templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(update));
  }
  updateStatus(templateData, element, state, disabledReason) {
    templateData.actionDisposables.clear();
    DOM.clearNode(templateData.actions);
    const presentation = getMcpStatusPresentation(state, disabledReason);
    if (!presentation) {
      return;
    }
    const activeSessionServer = getActiveSessionServer(element);
    const label = getMcpEntryLabel(element);
    const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
    const showActiveSessionOutput = activeSessionServer !== void 0 ? (beforeShow) => this.agentHostCustomizationService.showMcpServerLog(activeSessionResource, activeSessionServer.id, beforeShow) : void 0;
    if (state === McpServerStatus.AuthRequired && activeSessionServer !== void 0) {
      const signInLabel = localize("signInToMcpServer", "Sign in to {0}", label);
      const signInButton = templateData.actionDisposables.add(new Button(templateData.actions, {
        ...defaultButtonStyles,
        secondary: true,
        small: true,
        title: signInLabel,
        ariaLabel: signInLabel
      }));
      signInButton.label = localize("signIn", "Sign In");
      signInButton.element.classList.add("mcp-server-sign-in");
      registerMcpInlineButtonAction(templateData.actionDisposables, signInButton, async () => {
        signInButton.enabled = false;
        try {
          await authenticateMcpServer(this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer.id);
        } finally {
          signInButton.enabled = true;
        }
      });
    }
    if (!presentation.icon) {
      return;
    }
    const showOutput = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error ? getMcpServerOutputHandler(this.outputService, element.type === "session-server-item" ? void 0 : element.localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput) : void 0;
    if (showOutput) {
      const showOutputLabel = localize("showMcpServerOutput", "Show output for {0}", label);
      const statusButton = templateData.actionDisposables.add(new Button(templateData.actions, {
        title: showOutputLabel,
        ariaLabel: showOutputLabel
      }));
      statusButton.icon = presentation.icon;
      statusButton.element.classList.add("mcp-server-status", "mcp-server-status-action", presentation.className);
      registerMcpInlineButtonAction(templateData.actionDisposables, statusButton, showOutput);
      return;
    }
    const statusElement = DOM.append(templateData.actions, $(".mcp-server-status"));
    statusElement.classList.add(presentation.className, ...ThemeIcon.asClassNameArray(presentation.icon));
    statusElement.setAttribute("aria-hidden", "true");
    templateData.actionDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), statusElement, presentation.label));
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionDisposables.dispose();
  }
};
McpServerItemRenderer = __decorateClass([
  __decorateParam(1, IAICustomizationWorkspaceService),
  __decorateParam(2, IAgentPluginService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IAgentHostCustomizationService),
  __decorateParam(5, ICustomizationHarnessService),
  __decorateParam(6, IOutputService)
], McpServerItemRenderer);
function registerMcpInlineButtonAction(store, button, action) {
  store.add(DOM.addDisposableGenericMouseDownListener(button.element, (event) => DOM.EventHelper.stop(event, true)));
  store.add(button.onDidClick((event) => {
    DOM.EventHelper.stop(event, true);
    void action();
  }));
}
function authenticateMcpServer(agentHostCustomizationService, sessionResource, serverId) {
  return agentHostCustomizationService.authenticateMcpServer(sessionResource, serverId);
}
function getMcpServerOutputHandler(outputService, localServer, activeSessionServer, closeCustomizationEditor, showActiveSessionOutput) {
  const outputChannelId = activeSessionServer?.logOutputChannelId;
  if (showActiveSessionOutput) {
    return () => showActiveSessionOutput(closeCustomizationEditor);
  }
  if (outputChannelId) {
    return async () => {
      await closeCustomizationEditor?.();
      await outputService.showChannel(outputChannelId);
    };
  }
  if (localServer) {
    return async () => {
      await closeCustomizationEditor?.();
      await localServer.showOutput();
    };
  }
  return void 0;
}
function getMcpStatusPresentation(state, disabledReason) {
  if (state === void 0) {
    return void 0;
  }
  if (state === "disabled") {
    return { label: getCustomizationDisabledLabel(disabledReason), className: "disabled", icon: Codicon.circleSlash };
  }
  switch (state) {
    case McpConnectionState.Kind.Running:
    case McpServerStatus.Ready:
      return { label: localize("running", "Running"), className: "running", icon: Codicon.check };
    case McpConnectionState.Kind.Starting:
    case McpServerStatus.Starting:
      return { label: localize("starting", "Starting"), className: "starting", icon: ThemeIcon.modify(Codicon.loading, "spin") };
    case McpServerStatus.AuthRequired:
      return { label: localize("authRequired", "Authentication required"), className: "auth-required", icon: Codicon.account };
    case McpConnectionState.Kind.Error:
    case McpServerStatus.Error:
      return { label: localize("error", "Error"), className: "error", icon: Codicon.error };
    case McpConnectionState.Kind.Stopped:
    case McpServerStatus.Stopped:
    default:
      return { label: localize("stopped", "Stopped"), className: "stopped" };
  }
}
function getActiveSessionServer(entry) {
  return entry.type === "session-server-item" ? entry.server : entry.activeSessionServer;
}
function getMcpEntryLabel(element) {
  return element.type === "session-server-item" ? element.server.name : element.type === "builtin-item" ? element.label : element.server.label;
}
function getMcpStatusKind(entry, isSessionsWindow) {
  if (entry.type === "session-server-item") {
    return getActiveSessionServerPresentation(entry.server).status;
  }
  if (entry.activeSessionServer !== void 0) {
    return getActiveSessionServerPresentation(entry.activeSessionServer).status;
  }
  if (entry.localServer && isContributionDisabled(entry.localServer.enablement.get())) {
    return "disabled";
  }
  if (entry.type === "server-item" && !isSessionsWindow) {
    return entry.localServer?.connectionState.get().state;
  }
  return void 0;
}
function getMcpEntryAriaLabel(element, isSessionsWindow) {
  if (element.type === "group-header") {
    return localize("mcpGroupAriaLabel", "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize("collapsed", "collapsed") : localize("expanded", "expanded"));
  }
  const label = getMcpEntryLabel(element);
  const statusKind = getMcpStatusKind(element, isSessionsWindow);
  const disabledReason = statusKind === "disabled" ? getMcpDisabledReason(element) : void 0;
  const status = getMcpStatusPresentation(statusKind, disabledReason);
  return status ? localize("mcpServerAriaLabelWithStatus", "{0}, {1}", label, status.label) : label;
}
function getMcpDisabledReason(entry) {
  if (entry.type === "session-server-item") {
    return entry.server.disabledReason;
  }
  if (entry.activeSessionServer !== void 0) {
    return entry.activeSessionServer.disabledReason;
  }
  return void 0;
}
function normalizeMcpMatchKey(value) {
  return value || void 0;
}
function getUniqueMcpMatchKeys(values) {
  const keys = /* @__PURE__ */ new Set();
  for (const value of values) {
    const key = normalizeMcpMatchKey(value);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}
class ActiveSessionMcpServerMatcher {
  constructor(servers) {
    this.servers = servers;
    this.byKey = /* @__PURE__ */ new Map();
    this.matchedIds = /* @__PURE__ */ new Set();
    for (const server of servers) {
      const separator = server.id.indexOf("/");
      const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
      for (const key of getUniqueMcpMatchKeys([rawId, server.name])) {
        let bucket = this.byKey.get(key);
        if (!bucket) {
          bucket = [];
          this.byKey.set(key, bucket);
        }
        bucket.push(server);
      }
    }
  }
  take(keys) {
    for (const key of getUniqueMcpMatchKeys(keys)) {
      const matches = this.byKey.get(key)?.filter((server) => !this.matchedIds.has(server.id));
      if (matches?.length === 1) {
        this.matchedIds.add(matches[0].id);
        return matches[0];
      }
    }
    return void 0;
  }
  unmatched(query) {
    return this.servers.filter((server) => !this.matchedIds.has(server.id) && matchesActiveSessionServerQuery(server, query));
  }
}
class LocalMcpServerMatcher {
  constructor(servers) {
    this.byKey = /* @__PURE__ */ new Map();
    for (const server of servers) {
      for (const key of getRuntimeServerMatchKeys(server)) {
        let matches = this.byKey.get(key);
        if (!matches) {
          matches = [];
          this.byKey.set(key, matches);
        }
        matches.push(server);
      }
    }
  }
  find(keys) {
    for (const key of getUniqueMcpMatchKeys(keys)) {
      const matches = this.byKey.get(key);
      if (matches?.length === 1) {
        return matches[0];
      }
    }
    return void 0;
  }
}
function matchesActiveSessionServerQuery(server, query) {
  if (!query) {
    return true;
  }
  return server.name.toLowerCase().includes(query);
}
function getWorkbenchServerMatchKeys(server) {
  return getUniqueMcpMatchKeys([server.id, server.name, server.label]);
}
function getRuntimeServerMatchKeys(server) {
  return getUniqueMcpMatchKeys([server.definition.id, server.definition.label]);
}
function getActiveSessionServerPresentation(server) {
  return {
    enabled: server.enabled,
    status: server.enabled ? server.status : "disabled"
  };
}
function getActiveSessionServerLifecycleAction(server) {
  if (!getActiveSessionServerPresentation(server).enabled) {
    return void 0;
  }
  return server.status === McpServerStatus.Stopped || server.status === McpServerStatus.Error ? new Action(
    "mcpServer.activeSession.start",
    localize("activeSessionMcpServerStart", "Start Server"),
    void 0,
    true,
    () => server.start()
  ) : new Action(
    "mcpServer.activeSession.stop",
    localize("activeSessionMcpServerStop", "Stop Server"),
    void 0,
    true,
    () => server.stop()
  );
}
const agentHostMcpServerEnablementActionInfo = {
  global: {
    kind: CustomizationEnablementKind.Global,
    enableLabel: () => localize("agentHostMcpServerEnable", "Enable"),
    disableLabel: () => localize("agentHostMcpServerDisable", "Disable")
  },
  workspace: {
    kind: CustomizationEnablementKind.Workspace,
    enableLabel: () => localize("agentHostMcpServerEnableWorkspace", "Enable (Workspace)"),
    disableLabel: () => localize("agentHostMcpServerDisableWorkspace", "Disable (Workspace)")
  },
  session: {
    kind: CustomizationEnablementKind.Session,
    enableLabel: () => localize("agentHostMcpServerEnableSession", "Enable (Session)"),
    disableLabel: () => localize("agentHostMcpServerDisableSession", "Disable (Session)")
  }
};
function getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, server, scopes = ["global", "workspace", "session"]) {
  if (server.disabledReason?.source === "plugin") {
    const decision = server.disabledReason.plugin.enablement?.[0];
    if (!decision) {
      return [];
    }
    const action = createAgentHostEnablePluginAction(agentHostCustomizations, agentPluginService, sessionResource, server.disabledReason.plugin, decision.kind);
    return [new Action(action.id, action.label, void 0, true, action.run)];
  }
  const enablement = getCustomizationScopeEnablement(server);
  const actions = [];
  if (scopes.includes("global")) {
    actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.global, "global"));
  }
  if (scopes.includes("workspace") && agentHostCustomizations.getWorkingDirectories(sessionResource).length > 0) {
    actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.workspace, "workspace"));
  }
  if (scopes.includes("session")) {
    actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.session, "session"));
  }
  return actions;
}
function createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, enabled, scope) {
  const actionInfo = agentHostMcpServerEnablementActionInfo[scope];
  return new Action(
    `mcpServer.agentHost.${enabled ? "enable" : "disable"}.${scope}`,
    enabled ? actionInfo.enableLabel() : actionInfo.disableLabel(),
    void 0,
    true,
    () => agentHostCustomizations.setCustomizationEnablement(sessionResource, server.id, server.enablement, actionInfo.kind, enabled)
  );
}
function getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench, options = {}) {
  const includeWorkspace = options.includeWorkspace ?? true;
  const disabled = options.activeSessionServer ? !getActiveSessionServerPresentation(options.activeSessionServer).enabled : isContributionDisabled(mcpService.enablementModel.readEnabled(serverId));
  const actions = [];
  if (disabled) {
    actions.push(new Action("mcpServer.builtin.enable", localize("builtinMcpServerEnable", "Enable"), void 0, true, () => {
      mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledProfile);
    }));
    if (includeWorkspace && !isEmptyWorkbench) {
      actions.push(new Action("mcpServer.builtin.enableWorkspace", localize("builtinMcpServerEnableForWorkspace", "Enable (Workspace)"), void 0, true, () => {
        mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledWorkspace);
      }));
    }
  } else {
    actions.push(new Action("mcpServer.builtin.disable", localize("builtinMcpServerDisable", "Disable"), void 0, true, () => {
      mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledProfile);
    }));
    if (includeWorkspace && !isEmptyWorkbench) {
      actions.push(new Action("mcpServer.builtin.disableWorkspace", localize("builtinMcpServerDisableForWorkspace", "Disable (Workspace)"), void 0, true, () => {
        mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledWorkspace);
      }));
    }
  }
  return actions;
}
function getBuiltinMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench, agentHostCustomizations, agentPluginService, sessionResource, activeSessionServer) {
  if (activeSessionServer === void 0) {
    return getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench);
  }
  if (activeSessionServer.isPluginProvided && !activeSessionServer.isClientBundled) {
    return getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, activeSessionServer);
  }
  return [
    ...getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench, { includeWorkspace: false, activeSessionServer }),
    ...getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, activeSessionServer, ["workspace", "session"])
  ];
}
function getActiveSessionServerOptionsActions(commandService, agentHostCustomizations, agentPluginService, sessionResource, server) {
  const actions = [];
  const lifecycleAction = getActiveSessionServerLifecycleAction(server);
  if (lifecycleAction) {
    actions.push(lifecycleAction);
  }
  const durableActions = getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, server);
  if (durableActions.length > 0) {
    if (actions.length > 0) {
      actions.push(new Separator());
    }
    actions.push(...durableActions);
  }
  actions.push(new Separator());
  actions.push(new Action(
    "mcpServer.activeSession.options",
    localize("activeSessionMcpServerOptions", "Server Options"),
    void 0,
    true,
    async () => {
      await commandService.executeCommand(McpCommandIds.AgentHostServerOptions, sessionResource, server.id);
    }
  ));
  return actions;
}
function shouldHideLocalActionForActiveSessionServer(action) {
  return action instanceof StartServerAction || action instanceof StopServerAction || action instanceof RestartServerAction || action instanceof ConfigureModelAccessAction || action instanceof ShowSamplingRequestsAction || isLocalMcpServerWorkspaceEnablementAction(action);
}
function isLocalMcpServerEnablementAction(action) {
  return action.id === EnableMcpServerGloballyAction.ID || action.id === EnableMcpServerForWorkspaceAction.ID || action.id === DisableMcpServerGloballyAction.ID || action.id === DisableMcpServerForWorkspaceAction.ID;
}
function isLocalMcpServerWorkspaceEnablementAction(action) {
  return action.id === EnableMcpServerForWorkspaceAction.ID || action.id === DisableMcpServerForWorkspaceAction.ID;
}
function getServerItemContextMenuActions(menuActionGroups, activeSessionServer, activeSessionLifecycleAction, agentHostEnablementActions) {
  const actions = [];
  const hasActiveSession = activeSessionServer !== void 0;
  let agentHostEnablementAdded = false;
  if (activeSessionLifecycleAction) {
    actions.push(activeSessionLifecycleAction, new Separator());
  }
  for (const menuActions of menuActionGroups) {
    const visibleMenuActions = hasActiveSession ? menuActions.filter((action) => !shouldHideLocalActionForActiveSessionServer(action)) : menuActions;
    actions.push(...visibleMenuActions);
    if (hasActiveSession && menuActions.some(isLocalMcpServerEnablementAction)) {
      actions.push(...agentHostEnablementActions);
      agentHostEnablementAdded = true;
    }
    if (visibleMenuActions.length > 0) {
      actions.push(new Separator());
    }
  }
  if (hasActiveSession && !agentHostEnablementAdded) {
    actions.push(...agentHostEnablementActions);
  }
  if (actions[actions.length - 1] instanceof Separator) {
    actions.pop();
  }
  return actions;
}
function createBuiltinEntry(server, activeSessionServer) {
  return {
    type: "builtin-item",
    id: `builtin-${server.definition.id}`,
    label: server.definition.label,
    description: "",
    collectionId: server.collection.id,
    activeSessionServer,
    localServer: server
  };
}
const MCP_GALLERY_ITEM_TEMPLATE_ID = "mcpGalleryItem";
class McpGalleryItemProvider {
  constructor(mcpWorkbenchService) {
    this.mcpWorkbenchService = mcpWorkbenchService;
  }
  getLabel(element) {
    return element.server.label;
  }
  getPublisherDisplayName(element) {
    return element.server.publisherDisplayName;
  }
  getDescription(element) {
    return element.server.description;
  }
  getInstallState(element) {
    switch (element.server.installState) {
      case McpServerInstallState.Installed:
        return GalleryItemInstallState.Installed;
      case McpServerInstallState.Installing:
        return GalleryItemInstallState.Installing;
      default:
        return GalleryItemInstallState.Uninstalled;
    }
  }
  canInstall(element) {
    return this.mcpWorkbenchService.canInstall(element.server) === true;
  }
  async install(element) {
    await this.mcpWorkbenchService.install(element.server);
  }
  onDidChangeInstallState(element, listener) {
    return this.mcpWorkbenchService.onChange((changed) => {
      if (!changed || changed.id === element.server.id) {
        listener();
      }
    });
  }
}
let McpListWidget = class extends Disposable {
  constructor(instantiationService, mcpWorkbenchService, mcpService, mcpRegistry, commandService, openerService, contextViewService, contextMenuService, hoverService, agentPluginService, dialogService, configurationService, customizationHarnessService, agentHostCustomizationService, workspaceService) {
    super();
    this.instantiationService = instantiationService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.mcpService = mcpService;
    this.mcpRegistry = mcpRegistry;
    this.commandService = commandService;
    this.openerService = openerService;
    this.contextViewService = contextViewService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.agentPluginService = agentPluginService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.customizationHarnessService = customizationHarnessService;
    this.agentHostCustomizationService = agentHostCustomizationService;
    this.workspaceService = workspaceService;
    this._onDidSelectServer = this._register(new Emitter());
    this.onDidSelectServer = this._onDidSelectServer.event;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this._onDidRequestShowPlugin = this._register(new Emitter());
    this.onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;
    this.disabledLinkListener = this._register(new MutableDisposable());
    this.filteredServers = [];
    this.filteredBuiltinCount = 0;
    this.filteredActiveSessionCount = 0;
    this.displayEntries = [];
    this.galleryServers = [];
    this.searchQuery = "";
    this.browseMode = false;
    this.lastHeight = 0;
    this.lastWidth = 0;
    this.lastHeaderHeight = 0;
    this._layoutDeferred = false;
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.delayedFilter = new Delayer(200);
    this.delayedGallerySearch = new Delayer(400);
    this._closeCustomizationEditor = () => Promise.resolve();
    this.element = $(".mcp-list-widget");
    this.create();
    this.updateAccessState();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(mcpAccessConfig)) {
        this.updateAccessState();
      }
    }));
    this._register({
      dispose: () => {
        this.galleryCts?.dispose();
      }
    });
  }
  setCloseCustomizationEditor(closeCustomizationEditor) {
    this._closeCustomizationEditor = closeCustomizationEditor;
  }
  create() {
    this.sectionTitleHeader = DOM.append(this.element, $(".section-title-header"));
    const titleRow = DOM.append(this.sectionTitleHeader, $(".section-title-row"));
    const sectionTitle = DOM.append(titleRow, $("h2.section-title"));
    sectionTitle.textContent = localize("mcpServers", "MCP Servers");
    const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $("p.section-title-description"));
    const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $("span.section-title-description-text"));
    sectionTitleDescriptionText.textContent = localize("mcpServersDescription", "An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more.");
    sectionTitleDescription.appendChild(document.createTextNode(" "));
    this.sectionLink = DOM.append(sectionTitleDescription, $("a.section-title-link"));
    this.sectionLink.textContent = localize("learnMoreMcp", "Learn more about MCP servers");
    this.sectionLink.href = "https://code.visualstudio.com/docs/agent-customization/mcp-servers?referrer=in-product";
    this._register(DOM.addDisposableListener(this.sectionLink, "click", (e) => {
      e.preventDefault();
      const href = this.sectionLink.href;
      if (href) {
        this.openerService.open(URI.parse(href));
      }
    }));
    const targetWindow = DOM.getWindow(this.element);
    const headerObserver = this._register(new DOM.DisposableResizeObserver(
      "McpListWidget.sectionTitleHeader",
      () => {
        if (this.lastWidth <= 0 || this.lastHeight <= 0) {
          return;
        }
        const headerHeight = this.sectionTitleHeader.offsetHeight;
        if (headerHeight === this.lastHeaderHeight) {
          return;
        }
        this.layout(this.lastHeight, this.lastWidth);
      },
      targetWindow
    ));
    this._register(headerObserver.observe(this.sectionTitleHeader));
    this.searchAndButtonContainer = DOM.append(this.element, $(".list-search-and-button-container"));
    const searchContainer = DOM.append(this.searchAndButtonContainer, $(".list-search-container"));
    this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
      placeholder: localize("searchMcpPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this._register(this.searchInput.onDidChange(() => {
      this.searchQuery = this.searchInput.value;
      if (this.browseMode) {
        this.delayedGallerySearch.trigger(() => this.queryGallery());
      } else {
        this.delayedFilter.trigger(() => this.filterServers());
      }
    }));
    const buttonContainer = DOM.append(this.searchAndButtonContainer, $(".list-button-group"));
    const backButtonContainer = DOM.append(buttonContainer, $(".list-add-button-container"));
    this.backButton = this._register(new Button(backButtonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      title: localize("backToInstalled", "Back to installed servers"),
      ariaLabel: localize("backToInstalled", "Back to installed servers")
    }));
    this.backButton.label = `$(${Codicon.arrowLeft.id}) ${localize("mcpBrowseBack", "Back")}`;
    this.backButton.element.classList.add("list-add-button");
    backButtonContainer.style.display = "none";
    this._register(this.backButton.onDidClick(() => {
      this.toggleBrowseMode(false);
    }));
    const browseButtonContainer = DOM.append(buttonContainer, $(".list-add-button-container"));
    this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.browseButton.label = `$(${Codicon.library.id}) ${localize("browseMarketplace", "Browse Marketplace")}`;
    this.browseButton.element.classList.add("list-add-button");
    this._register(this.browseButton.onDidClick(() => {
      this.toggleBrowseMode(!this.browseMode);
    }));
    this.addButton = this._register(new Button(buttonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      title: localize("addServer", "Add Server"),
      ariaLabel: localize("addServer", "Add Server")
    }));
    this.addButton.label = `$(${Codicon.add.id})`;
    this.addButton.element.classList.add("list-icon-button");
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.addButton.element, localize("addServerTooltip", "Add Server")));
    this._register(this.addButton.onDidClick(() => {
      this.commandService.executeCommand(McpCommandIds.AddConfiguration);
    }));
    this.emptyContainer = DOM.append(this.element, $(".mcp-empty-state"));
    const emptyHeader = DOM.append(this.emptyContainer, $(".empty-state-header"));
    this.emptyText = DOM.append(emptyHeader, $(".empty-text"));
    this.emptySubtext = DOM.append(this.emptyContainer, $(".empty-subtext"));
    this.disabledContainer = DOM.append(this.element, $(".mcp-disabled-state"));
    const disabledHeader = DOM.append(this.disabledContainer, $(".empty-state-header"));
    this.disabledIcon = DOM.append(disabledHeader, $(".empty-icon"));
    const disabledText = DOM.append(disabledHeader, $(".empty-text"));
    disabledText.textContent = localize("mcpAccessDisabledTitle", "MCP servers are disabled");
    this.disabledMessage = DOM.append(this.disabledContainer, $(".empty-subtext"));
    this.listContainer = DOM.append(this.element, $(".mcp-list-container"));
    const delegate = new McpServerItemDelegate();
    const groupHeaderRenderer = new CustomizationGroupHeaderRenderer("mcpGroupHeader", this.hoverService);
    const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer, () => this._closeCustomizationEditor());
    const galleryRenderer = new GalleryItemRenderer(MCP_GALLERY_ITEM_TEMPLATE_ID, new McpGalleryItemProvider(this.mcpWorkbenchService));
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "McpManagementList",
      this.listContainer,
      delegate,
      [groupHeaderRenderer, localRenderer, galleryRenderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            return getMcpEntryAriaLabel(element, this.workspaceService.isSessionsWindow);
          },
          getWidgetAriaLabel() {
            return localize("mcpServersListAriaLabel", "MCP Servers");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(element) {
            if (element.type === "group-header") {
              return element.id;
            }
            if (element.type === "builtin-item") {
              return element.id;
            }
            return element.server.id;
          },
          getGroupId(element) {
            return element.type === "group-header" ? NotSelectableGroupId : 0;
          }
        }
      }
    ));
    this._register(this.list.onDidOpen((e) => {
      if (e.element) {
        if (e.element.type === "group-header") {
          this.toggleGroup(e.element);
        } else if (e.element.type === "server-item") {
          const server = e.element.server;
          const isGallery = e.element.marketplace || !server.local;
          if (isGallery || server.description) {
            this._onDidSelectServer.fire(server);
          }
        } else if (e.element.type === "session-server-item") {
          this.openActiveSessionServerOptions(e.element.server);
        }
      }
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.mcpWorkbenchService.onChange(() => {
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.mcpService.servers.read(reader);
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.customizationHarnessService.activeSessionResource.read(reader);
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    void this.refresh();
  }
  async refresh() {
    if (this.browseMode) {
      await this.queryGallery();
    } else {
      this.filterServers();
    }
  }
  updateAccessState() {
    const inspect = this.configurationService.inspect(mcpAccessConfig);
    const value = inspect.value ?? inspect.defaultValue;
    const disabled = value === McpAccessValue.None;
    const policyLocked = inspect.policyValue === McpAccessValue.None;
    this.element.classList.toggle("access-disabled", disabled);
    if (disabled) {
      this.disabledIcon.className = "empty-icon";
      this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : mcpServerIcon));
      DOM.clearNode(this.disabledMessage);
      this.disabledLinkListener.clear();
      if (policyLocked) {
        this.disabledMessage.textContent = localize("mcpAccessDisabledByPolicy", "Access to MCP servers is disabled by your organization. Contact your organization administrator for more information.");
      } else {
        this.disabledMessage.appendChild(document.createTextNode(localize("mcpAccessDisabledBySettingPrefix", "MCP servers are disabled in settings. ")));
        const link = DOM.append(this.disabledMessage, $("a.mcp-disabled-settings-link"));
        link.textContent = localize("mcpAccessDisabledSettingLink", "Configure in settings.");
        link.href = "#";
        link.setAttribute("role", "button");
        this.disabledLinkListener.value = DOM.addDisposableListener(link, "click", (e) => {
          e.preventDefault();
          this.commandService.executeCommand("workbench.action.openSettings", `@id:${mcpAccessConfig}`);
        });
      }
    }
  }
  showBrowseMarketplace() {
    if (!this.browseMode) {
      this.toggleBrowseMode(true);
    }
  }
  toggleBrowseMode(browse) {
    this.browseMode = browse;
    this.searchInput.value = "";
    this.searchQuery = "";
    this.addButton.element.style.display = browse ? "none" : "";
    this.browseButton.element.parentElement.style.display = browse ? "none" : "";
    this.backButton.element.parentElement.style.display = browse ? "" : "none";
    this.searchInput.setPlaceHolder(
      browse ? localize("searchGalleryPlaceholder", "Search MCP marketplace...") : localize("searchMcpPlaceholder", "Type to search...")
    );
    if (browse) {
      void this.queryGallery();
    } else {
      this.galleryCts?.dispose(true);
      this.galleryServers = [];
      this.filterServers();
    }
    if (this.lastHeight > 0) {
      this.layout(this.lastHeight, this.lastWidth);
    }
  }
  async queryGallery() {
    this.galleryCts?.dispose(true);
    const cts = this.galleryCts = new CancellationTokenSource();
    this.emptyContainer.style.display = "flex";
    this.listContainer.style.display = "none";
    this.emptyText.textContent = localize("loadingGallery", "Loading marketplace...");
    this.emptySubtext.textContent = "";
    try {
      const pager = await this.mcpWorkbenchService.queryGallery(
        { text: this.searchQuery.trim() || void 0 },
        cts.token
      );
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.galleryServers = pager.firstPage.items;
      this.updateGalleryList();
    } catch {
      if (!cts.token.isCancellationRequested) {
        this.galleryServers = [];
        this.emptyContainer.style.display = "flex";
        this.listContainer.style.display = "none";
        this.emptyText.textContent = localize("galleryError", "Unable to load marketplace");
        this.emptySubtext.textContent = localize("tryAgainLater", "Check your connection and try again");
      }
    }
  }
  updateGalleryList() {
    if (this.galleryServers.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noGalleryResults", "No servers match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("emptyGallery", "No MCP servers available");
        this.emptySubtext.textContent = "";
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = this.galleryServers.map((server) => ({ type: "server-item", server, marketplace: true }));
    this.list.splice(0, this.list.length, entries);
  }
  filterServers() {
    const query = this.searchQuery.toLowerCase().trim();
    const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
    const activeSessionMatcher = new ActiveSessionMcpServerMatcher(this.agentHostCustomizationService.getMcpServers(activeSessionResource));
    const localServerMatcher = new LocalMcpServerMatcher(this.mcpService.servers.get());
    if (query) {
      this.filteredServers = this.mcpWorkbenchService.local.filter(
        (server) => server.label.toLowerCase().includes(query) || server.description?.toLowerCase().includes(query)
      );
    } else {
      this.filteredServers = [...this.mcpWorkbenchService.local];
    }
    const localIds = new Set(this.filteredServers.map((s) => s.id));
    const builtinServers = this.mcpService.servers.get().filter((s) => !localIds.has(s.definition.id)).filter((s) => !query || s.definition.label.toLowerCase().includes(query));
    const groups = [
      { scope: LocalMcpServerScope.Workspace, label: localize("workspaceGroup", "Workspace"), icon: workspaceIcon, description: localize("workspaceGroupDescription", "MCP servers configured in your workspace or reported by the active session."), entries: [] },
      { scope: LocalMcpServerScope.User, label: localize("userGroup", "User"), icon: userIcon, description: localize("userGroupDescription", "MCP servers configured in your user settings. Private to you and available across all projects."), entries: [] }
    ];
    for (const server of this.filteredServers) {
      const entry = {
        type: "server-item",
        server,
        activeSessionServer: activeSessionMatcher.take(getWorkbenchServerMatchKeys(server)),
        localServer: localServerMatcher.find(getWorkbenchServerMatchKeys(server))
      };
      const scope = server.local?.scope;
      if (scope === LocalMcpServerScope.Workspace) {
        groups[0].entries.push(entry);
      } else {
        groups[1].entries.push(entry);
      }
    }
    const collectionSources = new Map(this.mcpRegistry.collections.get().map((c) => [c.id, c.source]));
    const pluginServers = [];
    const extensionServers = [];
    const otherBuiltinServers = [];
    for (const server of builtinServers) {
      const entry = { server, activeSessionServer: activeSessionMatcher.take(getRuntimeServerMatchKeys(server)) };
      const source = collectionSources.get(server.collection.id);
      if (server.collection.id.startsWith(PLUGIN_COLLECTION_PREFIX)) {
        pluginServers.push(entry);
      } else if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
        extensionServers.push(entry);
      } else {
        otherBuiltinServers.push(entry);
      }
    }
    const activeSessionOnlyServers = activeSessionMatcher.unmatched(query);
    const activeSessionBuiltinEntries = createBuiltinActiveSessionMcpEntries(activeSessionOnlyServers);
    if (this.filteredServers.length === 0 && builtinServers.length === 0 && activeSessionOnlyServers.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMatchingServers", "No servers match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("noMcpServers", "No MCP servers configured");
        this.emptySubtext.textContent = localize("addMcpServer", "Add an MCP server configuration to get started");
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = [];
    let isFirst = true;
    for (const group of groups) {
      if (group.entries.length === 0) {
        continue;
      }
      const collapsed = this.collapsedGroups.has(group.scope);
      entries.push({
        type: "group-header",
        id: `mcp-group-${group.scope}`,
        scope: group.scope,
        label: group.label,
        icon: group.icon,
        count: group.entries.length,
        isFirst,
        description: group.description,
        collapsed
      });
      if (!collapsed) {
        entries.push(...group.entries);
      }
      isFirst = false;
    }
    if (pluginServers.length > 0) {
      const collapsed = this.collapsedGroups.has("plugin");
      entries.push({
        type: "group-header",
        id: "mcp-group-plugin",
        scope: "plugin",
        label: localize("pluginGroup", "Plugins"),
        icon: pluginIcon,
        count: pluginServers.length,
        isFirst,
        description: localize("pluginGroupDescription", "MCP servers provided by installed plugins."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of pluginServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
      }
      isFirst = false;
    }
    if (extensionServers.length > 0) {
      const collapsed = this.collapsedGroups.has("extension");
      entries.push({
        type: "group-header",
        id: "mcp-group-extension",
        scope: "extension",
        label: localize("extensionGroup", "Extensions"),
        icon: extensionIcon,
        count: extensionServers.length,
        isFirst,
        description: localize("extensionGroupDescription", "MCP servers contributed by installed VS Code extensions."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of extensionServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
      }
      isFirst = false;
    }
    if (otherBuiltinServers.length > 0 || activeSessionBuiltinEntries.length > 0) {
      const collapsed = this.collapsedGroups.has("builtin");
      entries.push({
        type: "group-header",
        id: "mcp-group-builtin",
        scope: "builtin",
        label: localize("builtInGroup", "Built-in"),
        icon: builtinIcon,
        count: otherBuiltinServers.length + activeSessionBuiltinEntries.length,
        isFirst,
        description: localize("builtInGroupDescription", "MCP servers built into VS Code. These are available automatically."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of otherBuiltinServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
        entries.push(...activeSessionBuiltinEntries);
      }
      isFirst = false;
    }
    this.displayEntries = entries;
    this.list.splice(0, this.list.length, this.displayEntries);
    this.filteredBuiltinCount = builtinServers.length;
    this.filteredActiveSessionCount = activeSessionOnlyServers.length;
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Gets the total item count from the underlying data arrays
   * (the same source used to build group headers).
   */
  get itemCount() {
    return this.filteredServers.length + this.filteredBuiltinCount + this.filteredActiveSessionCount;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Toggles the collapsed state of a group.
   */
  toggleGroup(entry) {
    if (this.collapsedGroups.has(entry.scope)) {
      this.collapsedGroups.delete(entry.scope);
    } else {
      this.collapsedGroups.add(entry.scope);
    }
    this.filterServers();
  }
  /**
   * Whether the widget is currently in marketplace browse mode.
   */
  isInBrowseMode() {
    return this.browseMode;
  }
  /**
   * Exits marketplace browse mode and returns to the installed servers list.
   */
  exitBrowseMode() {
    if (this.browseMode) {
      this.toggleBrowseMode(false);
    }
  }
  /**
   * Layouts the widget.
   */
  layout(height, width) {
    this.lastHeight = height;
    this.lastWidth = width;
    this.element.style.height = "";
    const availableHeight = this.element.clientHeight || height;
    const availableWidth = this.element.clientWidth || width;
    const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
    if (searchBarHeight === 0 && !this._layoutDeferred) {
      this._layoutDeferred = true;
      DOM.getWindow(this.element).requestAnimationFrame(() => {
        try {
          this.layout(this.lastHeight, this.lastWidth);
        } finally {
          this._layoutDeferred = false;
        }
      });
      return;
    }
    const headerHeight = this.sectionTitleHeader.offsetHeight;
    this.lastHeaderHeight = headerHeight;
    const listHeight = Math.max(0, availableHeight - searchBarHeight - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, availableWidth);
  }
  /**
   * Focuses the search input.
   */
  focusSearch() {
    this.searchInput.focus();
  }
  /**
   * Scrolls the list so the last item is visible.
   */
  revealLastItem() {
    if (this.list.length > 0) {
      this.list.reveal(this.list.length - 1);
    }
  }
  /**
   * Focuses the list.
   */
  focus() {
    this.list.domFocus();
    const servers = this.list.length;
    if (servers > 0) {
      this.list.setFocus([0]);
    }
  }
  openActiveSessionServerOptions(server) {
    void this.commandService.executeCommand(McpCommandIds.AgentHostServerOptions, this.customizationHarnessService.activeSessionResource.get(), server.id);
  }
  /**
   * Handles context menu for MCP server items.
   */
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (e.element.type === "session-server-item") {
      const disposables2 = new DisposableStore();
      const activeSessionActions = getActiveSessionServerOptionsActions(this.commandService, this.agentHostCustomizationService, this.agentPluginService, this.customizationHarnessService.activeSessionResource.get(), e.element.server);
      activeSessionActions.forEach((action) => isDisposable(action) && disposables2.add(action));
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => activeSessionActions,
        onHide: () => disposables2.dispose()
      });
      return;
    }
    if (e.element.type === "builtin-item") {
      const collectionId = e.element.collectionId;
      const pluginUriStr = getPluginUriFromCollectionId(collectionId);
      const plugin = pluginUriStr ? this.agentPluginService.plugins.get().find((p) => p.uri.toString() === pluginUriStr) : void 0;
      const disposables2 = new DisposableStore();
      const actions2 = [];
      const lifecycleAction = e.element.activeSessionServer !== void 0 ? getActiveSessionServerLifecycleAction(e.element.activeSessionServer) : void 0;
      if (lifecycleAction) {
        actions2.push(disposables2.add(lifecycleAction));
      }
      if (e.element.localServer) {
        const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === void 0;
        const enablementActions = getBuiltinMcpServerEnablementActions(
          this.mcpService,
          e.element.localServer.definition.id,
          isEmptyWorkbench,
          this.agentHostCustomizationService,
          this.agentPluginService,
          this.customizationHarnessService.activeSessionResource.get(),
          e.element.activeSessionServer
        );
        if (enablementActions.length > 0) {
          if (actions2.length > 0) {
            actions2.push(new Separator());
          }
          for (const enablementAction of enablementActions) {
            if (isDisposable(enablementAction)) {
              disposables2.add(enablementAction);
            }
            actions2.push(enablementAction);
          }
        }
      }
      if (plugin) {
        if (actions2.length > 0) {
          actions2.push(new Separator());
        }
        actions2.push(disposables2.add(new Action(
          "mcpServer.showPlugin",
          localize("showPlugin", "Show Plugin"),
          void 0,
          true,
          async () => {
            const item = {
              kind: AgentPluginItemKind.Installed,
              name: plugin.label,
              description: plugin.fromMarketplace?.description ?? "",
              marketplace: plugin.fromMarketplace?.marketplace,
              plugin
            };
            this._onDidRequestShowPlugin.fire(item);
          }
        )));
        actions2.push(disposables2.add(new Action(
          "mcpServer.uninstallPlugin",
          localize("uninstallPlugin", "Uninstall Plugin"),
          void 0,
          true,
          async () => {
            const result = await this.dialogService.confirm({
              message: localize("confirmUninstallPluginMcp", "This MCP server is provided by the plugin '{0}'", plugin.label),
              detail: localize("confirmUninstallPluginMcpDetail", "Individual MCP servers from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
              primaryButton: localize("uninstallPluginBtn", "Uninstall Plugin"),
              type: "question"
            });
            if (result.confirmed) {
              plugin.remove?.();
            }
          }
        )));
      }
      if (actions2.length === 0) {
        disposables2.dispose();
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions2,
        onHide: () => disposables2.dispose()
      });
      return;
    }
    if (e.element.type !== "server-item") {
      return;
    }
    const serverEntry = e.element;
    const disposables = new DisposableStore();
    const mcpServer = this.mcpWorkbenchService.local.find((local) => local.id === serverEntry.server.id) || serverEntry.server;
    const groups = getContextMenuActions(mcpServer, false, this.instantiationService);
    const activeSessionServer = serverEntry.activeSessionServer;
    const activeSessionLifecycleAction = activeSessionServer !== void 0 ? getActiveSessionServerLifecycleAction(activeSessionServer) : void 0;
    const agentHostEnablementActions = activeSessionServer !== void 0 ? getAgentHostMcpServerEnablementActions(this.agentHostCustomizationService, this.agentPluginService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer, ["workspace", "session"]) : [];
    for (const menuActions of groups) {
      for (const menuAction of menuActions) {
        if (isDisposable(menuAction)) {
          disposables.add(menuAction);
        }
      }
    }
    for (const action of [activeSessionLifecycleAction, ...agentHostEnablementActions]) {
      if (action && isDisposable(action)) {
        disposables.add(action);
      }
    }
    const actions = getServerItemContextMenuActions(groups, activeSessionServer, activeSessionLifecycleAction, agentHostEnablementActions);
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      onHide: () => disposables.dispose()
    });
  }
};
McpListWidget = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IMcpService),
  __decorateParam(3, IMcpRegistry),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IContextViewService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IAgentPluginService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, IAgentHostCustomizationService),
  __decorateParam(14, IAICustomizationWorkspaceService)
], McpListWidget);
export {
  McpListWidget,
  authenticateMcpServer,
  createBuiltinActiveSessionMcpEntries,
  getActiveSessionServerLifecycleAction,
  getActiveSessionServerOptionsActions,
  getActiveSessionServerPresentation,
  getAgentHostMcpServerEnablementActions,
  getBuiltinMcpServerEnablementActions,
  getLocalMcpServerEnablementActions,
  getMcpServerOutputHandler,
  getMcpStatusPresentation,
  getServerItemContextMenuActions,
  registerMcpInlineButtonAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcbWNwTGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RDb250ZXh0TWVudUV2ZW50LCBOb3RTZWxlY3RhYmxlR3JvdXBJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwV29ya2JlbmNoU2VydmljZSwgSVdvcmtiZW5jaE1jcFNlcnZlciwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUsIElNY3BTZXJ2aWNlLCBJTWNwU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1BfUExVR0lOX0NPTExFQ1RJT05fSURfUFJFRklYIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9kaXNjb3ZlcnkvcGx1Z2luTWNwRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgaXNDb250cmlidXRpb25EaXNhYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uLCBEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLCBEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24sIEVuYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiwgRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24sIGdldENvbnRleHRNZW51QWN0aW9ucywgUmVzdGFydFNlcnZlckFjdGlvbiwgU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24sIFN0YXJ0U2VydmVyQWN0aW9uLCBTdG9wU2VydmVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvYnJvd3Nlci9tY3BTZXJ2ZXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IExvY2FsTWNwU2VydmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9tY3AvY29tbW9uL21jcFdvcmtiZW5jaE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IHdvcmtzcGFjZUljb24sIHVzZXJJY29uLCBtY3BTZXJ2ZXJJY29uLCBidWlsdGluSWNvbiwgcGx1Z2luSWNvbiwgZXh0ZW5zaW9uSWNvbiB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSWNvbnMuanMnO1xuaW1wb3J0IHsgZm9ybWF0RGlzcGxheU5hbWUsIHRydW5jYXRlVG9GaXJzdExpbmUgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uR3JvdXBIZWFkZXJSZW5kZXJlciwgSUN1c3RvbWl6YXRpb25Hcm91cEhlYWRlckVudHJ5LCBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFQsIENVU1RPTUlaQVRJT05fR1JPVVBfSEVBREVSX0hFSUdIVF9XSVRIX1NFUEFSQVRPUiB9IGZyb20gJy4vY3VzdG9taXphdGlvbkdyb3VwSGVhZGVyUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5JdGVtS2luZCwgSUFnZW50UGx1Z2luSXRlbSB9IGZyb20gJy4uL2FnZW50UGx1Z2luRWRpdG9yL2FnZW50UGx1Z2luSXRlbXMuanMnO1xuaW1wb3J0IHsgZ2V0Q3VzdG9taXphdGlvbkRpc2FibGVkTGFiZWwsIElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCwgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSwgR2FsbGVyeUl0ZW1SZW5kZXJlciwgSUdhbGxlcnlJdGVtUHJvdmlkZXIgfSBmcm9tICcuL2dhbGxlcnlJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uU2NvcGVFbmFibGVtZW50LCB0eXBlIEN1c3RvbWl6YXRpb25EaXNhYmxlZFJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY3VzdG9taXphdGlvbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRIb3N0RW5hYmxlUGx1Z2luQWN0aW9uIH0gZnJvbSAnLi4vYWdlbnRQbHVnaW5BY3Rpb25zLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBNQ1BfSVRFTV9IRUlHSFQgPSAzNjtcbmNvbnN0IE1DUF9JVEVNX1dJVEhfREVTQ1JJUFRJT05fSEVJR0hUID0gNDQ7XG5cbmNvbnN0IFBMVUdJTl9DT0xMRUNUSU9OX1BSRUZJWCA9IE1DUF9QTFVHSU5fQ09MTEVDVElPTl9JRF9QUkVGSVg7XG5cbmNvbnN0IENPUElMT1RfRVhURU5TSU9OX0lEUyA9IFsnZ2l0aHViLmNvcGlsb3QnLCAnZ2l0aHViLmNvcGlsb3QtY2hhdCddO1xuXG5mdW5jdGlvbiBpc0NvcGlsb3RFeHRlbnNpb24oaWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIENPUElMT1RfRVhURU5TSU9OX0lEUy5zb21lKGNvcGlsb3RJZCA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhpZCwgY29waWxvdElkKSk7XG59XG5cbmZ1bmN0aW9uIGdldFBsdWdpblVyaUZyb21Db2xsZWN0aW9uSWQoY29sbGVjdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gY29sbGVjdGlvbklkPy5zdGFydHNXaXRoKFBMVUdJTl9DT0xMRUNUSU9OX1BSRUZJWCkgPyBjb2xsZWN0aW9uSWQuc2xpY2UoUExVR0lOX0NPTExFQ1RJT05fUFJFRklYLmxlbmd0aCkgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGNvbGxhcHNpYmxlIGdyb3VwIGhlYWRlciBpbiB0aGUgTUNQIHNlcnZlciBsaXN0LlxuICovXG5pbnRlcmZhY2UgSU1jcEdyb3VwSGVhZGVyRW50cnkgZXh0ZW5kcyBJQ3VzdG9taXphdGlvbkdyb3VwSGVhZGVyRW50cnkge1xuXHRyZWFkb25seSBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZSB8ICdidWlsdGluJyB8ICdwbHVnaW4nIHwgJ2V4dGVuc2lvbic7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBpbmRpdmlkdWFsIE1DUCBzZXJ2ZXIgaXRlbSBpbiB0aGUgbGlzdC5cbiAqL1xuaW50ZXJmYWNlIElNY3BTZXJ2ZXJJdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnc2VydmVyLWl0ZW0nO1xuXHRyZWFkb25seSBzZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXI7XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25TZXJ2ZXI/OiBBZ2VudEhvc3RNY3BTZXJ2ZXI7XG5cdHJlYWRvbmx5IGxvY2FsU2VydmVyPzogSU1jcFNlcnZlcjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBlbnRyeSBvcmlnaW5hdGVzIGZyb20gYSBtYXJrZXRwbGFjZSBicm93c2UgcmVzdWx0LiBNYXJrZXRwbGFjZSByb3dzIGFsd2F5cyB1c2Vcblx0ICogdGhlIGdhbGxlcnkgcm93IHByZXNlbnRhdGlvbiAod2l0aCBhbiBJbnN0YWxsL0luc3RhbGxlZCBidXR0b24pLCBldmVuIHdoZW4gdGhlIHNlcnZlciBpc1xuXHQgKiBhbHJlYWR5IGluc3RhbGxlZCwgc28gaW5zdGFsbGVkIGFuZCBub3QtaW5zdGFsbGVkIHJlc3VsdHMgbG9vayBjb25zaXN0ZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgbWFya2V0cGxhY2U/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnc2Vzc2lvbi1zZXJ2ZXItaXRlbSc7XG5cdHJlYWRvbmx5IHNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBidWlsdC1pbiBNQ1Agc2VydmVyIHByb3ZpZGVkIGJ5IGFuIGV4dGVuc2lvbiBvciBwbHVnaW4uXG4gKi9cbmludGVyZmFjZSBJTWNwQnVpbHRpbkl0ZW1FbnRyeSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdidWlsdGluLWl0ZW0nO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBjb2xsZWN0aW9uSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25TZXJ2ZXI/OiBBZ2VudEhvc3RNY3BTZXJ2ZXI7XG5cdHJlYWRvbmx5IGxvY2FsU2VydmVyPzogSU1jcFNlcnZlcjtcbn1cblxuZXhwb3J0IHR5cGUgQWdlbnRIb3N0TWNwU2VydmVyID0gUmV0dXJuVHlwZTxJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2VbJ2dldE1jcFNlcnZlcnMnXT5bbnVtYmVyXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJ1aWx0aW5BY3RpdmVTZXNzaW9uTWNwRW50cmllcyhzZXJ2ZXJzOiByZWFkb25seSBBZ2VudEhvc3RNY3BTZXJ2ZXJbXSk6IHJlYWRvbmx5IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5W10ge1xuXHRyZXR1cm4gc2VydmVycy5tYXAoc2VydmVyID0+ICh7IHR5cGU6ICdzZXNzaW9uLXNlcnZlci1pdGVtJywgc2VydmVyIH0pKTtcbn1cblxudHlwZSBJTWNwTGlzdEVudHJ5ID0gSU1jcEdyb3VwSGVhZGVyRW50cnkgfCBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeTtcblxuZXhwb3J0IHR5cGUgTWNwU3RhdHVzS2luZCA9IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kIHwgTWNwU2VydmVyU3RhdHVzIHwgJ2Rpc2FibGVkJztcblxuLyoqXG4gKiBEZWxlZ2F0ZSBmb3IgdGhlIE1DUCBzZXJ2ZXIgbGlzdC5cbiAqL1xuY2xhc3MgTWNwU2VydmVySXRlbURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SU1jcExpc3RFbnRyeT4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSU1jcExpc3RFbnRyeSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlzRmlyc3QgPyBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFQgOiBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFRfV0lUSF9TRVBBUkFUT1I7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXJ2ZXItaXRlbScgJiYgZWxlbWVudC5zZXJ2ZXIuZ2FsbGVyeSAmJiAoZWxlbWVudC5tYXJrZXRwbGFjZSB8fCAhZWxlbWVudC5zZXJ2ZXIubG9jYWwpKSB7XG5cdFx0XHRyZXR1cm4gNjI7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXJ2ZXItaXRlbScgJiYgZWxlbWVudC5zZXJ2ZXIuZGVzY3JpcHRpb24/LnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuIE1DUF9JVEVNX1dJVEhfREVTQ1JJUFRJT05fSEVJR0hUO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJyAmJiBlbGVtZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gTUNQX0lURU1fV0lUSF9ERVNDUklQVElPTl9IRUlHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiBNQ1BfSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElNY3BMaXN0RW50cnkpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRyZXR1cm4gJ21jcEdyb3VwSGVhZGVyJztcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2J1aWx0aW4taXRlbScpIHtcblx0XHRcdHJldHVybiAnbWNwU2VydmVySXRlbSc7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXNzaW9uLXNlcnZlci1pdGVtJykge1xuXHRcdFx0cmV0dXJuICdtY3BTZXJ2ZXJJdGVtJztcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gZWxlbWVudC5zZXJ2ZXI7XG5cdFx0cmV0dXJuIHNlcnZlci5nYWxsZXJ5ICYmIChlbGVtZW50Lm1hcmtldHBsYWNlIHx8ICFzZXJ2ZXIubG9jYWwpID8gTUNQX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCA6ICdtY3BTZXJ2ZXJJdGVtJztcblx0fVxufVxuXG5pbnRlcmZhY2UgSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgYWN0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuLyoqXG4gKiBSZW5kZXJlciBmb3IgbG9jYWwgTUNQIHNlcnZlciBsaXN0IGl0ZW1zLlxuICovXG5jbGFzcyBNY3BTZXJ2ZXJJdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwU2Vzc2lvblNlcnZlckl0ZW1FbnRyeSB8IElNY3BCdWlsdGluSXRlbUVudHJ5LCBJTWNwU2VydmVySXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ21jcFNlcnZlckl0ZW0nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FmdGVyU2hvd091dHB1dDogKCkgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRASUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtY3Atc2VydmVyLWl0ZW0nKTtcblxuXHRcdGNvbnN0IHR5cGVJY29uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWljb24nKSk7XG5cdFx0dHlwZUljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShtY3BTZXJ2ZXJJY29uKSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWRldGFpbHMnKSk7XG5cdFx0Y29uc3QgbmFtZVJvdyA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItbmFtZS1yb3cnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnLm1jcC1zZXJ2ZXItbmFtZScpKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gRE9NLmFwcGVuZChkZXRhaWxzLCAkKCcubWNwLXNlcnZlci1kZXNjcmlwdGlvbicpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItYWN0aW9ucycpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR0eXBlSWNvbixcblx0XHRcdG5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSxcblx0XHRcdGFjdGlvbkRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdidWlsdGluJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1kZXRhaWwnLCBmYWxzZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IGZvcm1hdERpc3BsYXlOYW1lKGVsZW1lbnQubGFiZWwpO1xuXHRcdFx0aWYgKGVsZW1lbnQuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gdHJ1bmNhdGVUb0ZpcnN0TGluZShlbGVtZW50LmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlS25vd25TZXJ2ZXJTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50KTtcblxuXHRcdFx0Ly8gQWRkIGhvdmVyIHdpdGggcGx1Z2luIHByb3ZlbmFuY2UgZm9yIHBsdWdpbi1zb3VyY2VkIGJ1aWx0aW4gaXRlbXNcblx0XHRcdGNvbnN0IHBsdWdpblVyaVN0ciA9IGdldFBsdWdpblVyaUZyb21Db2xsZWN0aW9uSWQoZWxlbWVudC5jb2xsZWN0aW9uSWQpO1xuXHRcdFx0aWYgKHBsdWdpblVyaVN0cikge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGx1Z2luID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKS5maW5kKHAgPT4gcC51cmkudG9TdHJpbmcoKSA9PT0gcGx1Z2luVXJpU3RyKTtcblx0XHRcdFx0XHRpZiAocGx1Z2luKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBgJHtlbGVtZW50LmxhYmVsfVxcbiR7bG9jYWxpemUoJ2Zyb21QbHVnaW4nLCBcIlBsdWdpbjogezB9XCIsIHBsdWdpbi5sYWJlbCl9YCxcblx0XHRcdFx0XHRcdFx0YXBwZWFyYW5jZTogeyBjb21wYWN0OiB0cnVlLCBza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBlbGVtZW50LmxhYmVsLCBhcHBlYXJhbmNlOiB7IGNvbXBhY3Q6IHRydWUsIHNraXBGYWRlSW5BbmltYXRpb246IHRydWUgfSB9O1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2J1aWx0aW4nKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRldGFpbCcsIGZhbHNlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gZm9ybWF0RGlzcGxheU5hbWUoZWxlbWVudC5zZXJ2ZXIubmFtZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy51cGRhdGVBY3RpdmVTZXNzaW9uU3RhdHVzKHRlbXBsYXRlRGF0YSwgZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdidWlsdGluJyk7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50LnNlcnZlci5sYWJlbCk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBlbGVtZW50LnNlcnZlci5kZXNjcmlwdGlvbj8udHJpbSgpO1xuXHRcdC8vIE1hcmtldHBsYWNlIChnYWxsZXJ5KSBlbnRyaWVzIGFyZSBhbHdheXMgY2xpY2thYmxlIHNvIHVzZXJzIGNhbiBpbnN0YWxsL2luc3BlY3QgdGhlbSxcblx0XHQvLyBldmVuIHdoZW4gbm8gZGVzY3JpcHRpb24gaXMgcmV0dXJuZWQgYnkgdGhlIGdhbGxlcnkuIEluc3RhbGxlZCByb3dzIG9ubHkgb3B0LWluIHRvIHRoZVxuXHRcdC8vIGRldGFpbCB2aWV3IHdoZW4gdGhlcmUgaXMgc29tZXRoaW5nIGV4dHJhIHRvIHNob3cuXG5cdFx0Y29uc3QgaXNHYWxsZXJ5ID0gIWVsZW1lbnQuc2VydmVyLmxvY2FsO1xuXHRcdGNvbnN0IGhhc0RldGFpbCA9ICEhZGVzY3JpcHRpb24gfHwgaXNHYWxsZXJ5O1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRldGFpbCcsIGhhc0RldGFpbCk7XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSB0cnVuY2F0ZVRvRmlyc3RMaW5lKGRlc2NyaXB0aW9uKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuYWN0aXZlU2Vzc2lvblNlcnZlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUtub3duU2VydmVyU3RhdHVzKHRlbXBsYXRlRGF0YSwgZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0dGhpcy51cGRhdGVLbm93blNlcnZlclN0YXR1cyh0ZW1wbGF0ZURhdGEsIGVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVkID0gZWxlbWVudC5sb2NhbFNlcnZlciA/IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoZWxlbWVudC5sb2NhbFNlcnZlci5lbmFibGVtZW50LnJlYWQocmVhZGVyKSkgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvblN0YXRlID0gZWxlbWVudC5sb2NhbFNlcnZlcj8uY29ubmVjdGlvblN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGRpc2FibGVkKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50LCBkaXNhYmxlZCA/ICdkaXNhYmxlZCcgOiBjb25uZWN0aW9uU3RhdGU/LnN0YXRlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUtub3duU2VydmVyU3RhdHVzKHRlbXBsYXRlRGF0YTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEsIGVsZW1lbnQ6IElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeSk6IHZvaWQge1xuXHRcdGxldCBsb2NhbERpc2FibGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblNlcnZlciA9IGVsZW1lbnQuYWN0aXZlU2Vzc2lvblNlcnZlciA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdDogdGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5nZXRNY3BTZXJ2ZXJzKHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKSkuZmluZChzZXJ2ZXIgPT4gc2VydmVyLmlkID09PSBlbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXI/LmlkKSA/PyBlbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXI7XG5cdFx0XHRpZiAoYWN0aXZlU2Vzc2lvblNlcnZlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJQcmVzZW50YXRpb24oYWN0aXZlU2Vzc2lvblNlcnZlcik7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhcHJlc2VudGF0aW9uLmVuYWJsZWQpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh0ZW1wbGF0ZURhdGEsIGVsZW1lbnQsIHByZXNlbnRhdGlvbi5zdGF0dXMsIHByZXNlbnRhdGlvbi5lbmFibGVkID8gdW5kZWZpbmVkIDogYWN0aXZlU2Vzc2lvblNlcnZlci5kaXNhYmxlZFJlYXNvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBsb2NhbERpc2FibGVkKTtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHRlbXBsYXRlRGF0YSwgZWxlbWVudCwgbG9jYWxEaXNhYmxlZCA/ICdkaXNhYmxlZCcgOiB1bmRlZmluZWQpO1xuXHRcdH07XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0bG9jYWxEaXNhYmxlZCA9IGVsZW1lbnQubG9jYWxTZXJ2ZXIgPyBpc0NvbnRyaWJ1dGlvbkRpc2FibGVkKGVsZW1lbnQubG9jYWxTZXJ2ZXIuZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpIDogZmFsc2U7XG5cdFx0XHR1cGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKHVwZGF0ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY3RpdmVTZXNzaW9uU3RhdHVzKHRlbXBsYXRlRGF0YTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEsIGVsZW1lbnQ6IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5nZXRNY3BTZXJ2ZXJzKHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKSkuZmluZChzZXJ2ZXIgPT4gc2VydmVyLmlkID09PSBlbGVtZW50LnNlcnZlci5pZCk7XG5cdFx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBzZXJ2ZXIgJiYgZ2V0QWN0aXZlU2Vzc2lvblNlcnZlclByZXNlbnRhdGlvbihzZXJ2ZXIpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIHByZXNlbnRhdGlvbj8uZW5hYmxlZCA9PT0gZmFsc2UpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50LCBwcmVzZW50YXRpb24/LnN0YXR1cywgc2VydmVyPy5kaXNhYmxlZFJlYXNvbik7XG5cdFx0fTtcblx0XHR1cGRhdGUoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnModXBkYXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1cyh0ZW1wbGF0ZURhdGE6IElNY3BTZXJ2ZXJJdGVtVGVtcGxhdGVEYXRhLCBlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeSwgc3RhdGU6IE1jcFN0YXR1c0tpbmQgfCB1bmRlZmluZWQsIGRpc2FibGVkUmVhc29uPzogQ3VzdG9taXphdGlvbkRpc2FibGVkUmVhc29uKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuYWN0aW9ucyk7XG5cblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBnZXRNY3BTdGF0dXNQcmVzZW50YXRpb24oc3RhdGUsIGRpc2FibGVkUmVhc29uKTtcblx0XHRpZiAoIXByZXNlbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TZXJ2ZXIgPSBnZXRBY3RpdmVTZXNzaW9uU2VydmVyKGVsZW1lbnQpO1xuXHRcdGNvbnN0IGxhYmVsID0gZ2V0TWNwRW50cnlMYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0Y29uc3Qgc2hvd0FjdGl2ZVNlc3Npb25PdXRwdXQgPSBhY3RpdmVTZXNzaW9uU2VydmVyICE9PSB1bmRlZmluZWRcblx0XHRcdD8gKGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KSA9PiB0aGlzLmFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLnNob3dNY3BTZXJ2ZXJMb2coYWN0aXZlU2Vzc2lvblJlc291cmNlLCBhY3RpdmVTZXNzaW9uU2VydmVyLmlkLCBiZWZvcmVTaG93KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKHN0YXRlID09PSBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkICYmIGFjdGl2ZVNlc3Npb25TZXJ2ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2lnbkluTGFiZWwgPSBsb2NhbGl6ZSgnc2lnbkluVG9NY3BTZXJ2ZXInLCBcIlNpZ24gaW4gdG8gezB9XCIsIGxhYmVsKTtcblx0XHRcdGNvbnN0IHNpZ25JbkJ1dHRvbiA9IHRlbXBsYXRlRGF0YS5hY3Rpb25EaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0ZW1wbGF0ZURhdGEuYWN0aW9ucywge1xuXHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHR0aXRsZTogc2lnbkluTGFiZWwsXG5cdFx0XHRcdGFyaWFMYWJlbDogc2lnbkluTGFiZWwsXG5cdFx0XHR9KSk7XG5cdFx0XHRzaWduSW5CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnc2lnbkluJywgXCJTaWduIEluXCIpO1xuXHRcdFx0c2lnbkluQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbWNwLXNlcnZlci1zaWduLWluJyk7XG5cdFx0XHRyZWdpc3Rlck1jcElubGluZUJ1dHRvbkFjdGlvbih0ZW1wbGF0ZURhdGEuYWN0aW9uRGlzcG9zYWJsZXMsIHNpZ25JbkJ1dHRvbiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzaWduSW5CdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0ZU1jcFNlcnZlcih0aGlzLmFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCksIGFjdGl2ZVNlc3Npb25TZXJ2ZXIuaWQpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHNpZ25JbkJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmVzZW50YXRpb24uaWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dPdXRwdXQgPSBzdGF0ZSA9PT0gTWNwU2VydmVyU3RhdHVzLkVycm9yIHx8IHN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvclxuXHRcdFx0PyBnZXRNY3BTZXJ2ZXJPdXRwdXRIYW5kbGVyKHRoaXMub3V0cHV0U2VydmljZSwgZWxlbWVudC50eXBlID09PSAnc2Vzc2lvbi1zZXJ2ZXItaXRlbScgPyB1bmRlZmluZWQgOiBlbGVtZW50LmxvY2FsU2VydmVyLCBhY3RpdmVTZXNzaW9uU2VydmVyLCB0aGlzLl9hZnRlclNob3dPdXRwdXQsIHNob3dBY3RpdmVTZXNzaW9uT3V0cHV0KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKHNob3dPdXRwdXQpIHtcblx0XHRcdGNvbnN0IHNob3dPdXRwdXRMYWJlbCA9IGxvY2FsaXplKCdzaG93TWNwU2VydmVyT3V0cHV0JywgXCJTaG93IG91dHB1dCBmb3IgezB9XCIsIGxhYmVsKTtcblx0XHRcdGNvbnN0IHN0YXR1c0J1dHRvbiA9IHRlbXBsYXRlRGF0YS5hY3Rpb25EaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0ZW1wbGF0ZURhdGEuYWN0aW9ucywge1xuXHRcdFx0XHR0aXRsZTogc2hvd091dHB1dExhYmVsLFxuXHRcdFx0XHRhcmlhTGFiZWw6IHNob3dPdXRwdXRMYWJlbCxcblx0XHRcdH0pKTtcblx0XHRcdHN0YXR1c0J1dHRvbi5pY29uID0gcHJlc2VudGF0aW9uLmljb247XG5cdFx0XHRzdGF0dXNCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtY3Atc2VydmVyLXN0YXR1cycsICdtY3Atc2VydmVyLXN0YXR1cy1hY3Rpb24nLCBwcmVzZW50YXRpb24uY2xhc3NOYW1lKTtcblx0XHRcdHJlZ2lzdGVyTWNwSW5saW5lQnV0dG9uQWN0aW9uKHRlbXBsYXRlRGF0YS5hY3Rpb25EaXNwb3NhYmxlcywgc3RhdHVzQnV0dG9uLCBzaG93T3V0cHV0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNFbGVtZW50ID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZURhdGEuYWN0aW9ucywgJCgnLm1jcC1zZXJ2ZXItc3RhdHVzJykpO1xuXHRcdHN0YXR1c0VsZW1lbnQuY2xhc3NMaXN0LmFkZChwcmVzZW50YXRpb24uY2xhc3NOYW1lLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShwcmVzZW50YXRpb24uaWNvbikpO1xuXHRcdHN0YXR1c0VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBzdGF0dXNFbGVtZW50LCBwcmVzZW50YXRpb24ubGFiZWwpKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElNY3BTZXJ2ZXJJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKiogUmVnaXN0ZXJzIGFuIGlubGluZSBNQ1AgYnV0dG9uIHdpdGhvdXQgYWxsb3dpbmcgaXRzIHBvaW50ZXIgb3IgY2xpY2sgZXZlbnRzIHRvIG9wZW4gdGhlIGNvbnRhaW5pbmcgbGlzdCByb3cuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJNY3BJbmxpbmVCdXR0b25BY3Rpb24oc3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGJ1dHRvbjogQnV0dG9uLCBhY3Rpb246ICgpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG5cdHN0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihidXR0b24uZWxlbWVudCwgZXZlbnQgPT4gRE9NLkV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpKSk7XG5cdHN0b3JlLmFkZChidXR0b24ub25EaWRDbGljayhldmVudCA9PiB7XG5cdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdHZvaWQgYWN0aW9uKCk7XG5cdH0pKTtcbn1cblxuLyoqIFJ1bnMgYXV0aGVudGljYXRpb24gZm9yIG9uZSBhY3RpdmUtc2Vzc2lvbiBNQ1Agc2VydmVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF1dGhlbnRpY2F0ZU1jcFNlcnZlcihhZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRyZXR1cm4gYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuYXV0aGVudGljYXRlTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZSwgc2VydmVySWQpO1xufVxuXG4vKiogUmVzb2x2ZXMgdGhlIG91dHB1dCBhY3Rpb24gZm9yIGFuIE1DUCBzZXJ2ZXIsIHByZWZlcnJpbmcgaXRzIGFjdGl2ZSBhZ2VudC1ob3N0IG91dHB1dC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNY3BTZXJ2ZXJPdXRwdXRIYW5kbGVyKG91dHB1dFNlcnZpY2U6IFBpY2s8SU91dHB1dFNlcnZpY2UsICdzaG93Q2hhbm5lbCc+LCBsb2NhbFNlcnZlcjogUGljazxJTWNwU2VydmVyLCAnc2hvd091dHB1dCc+IHwgdW5kZWZpbmVkLCBhY3RpdmVTZXNzaW9uU2VydmVyOiBBZ2VudEhvc3RNY3BTZXJ2ZXIgfCB1bmRlZmluZWQsIGNsb3NlQ3VzdG9taXphdGlvbkVkaXRvcj86ICgpID0+IFByb21pc2U8dm9pZD4sIHNob3dBY3RpdmVTZXNzaW9uT3V0cHV0PzogKGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KSA9PiBQcm9taXNlPHZvaWQ+KTogKCgpID0+IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgb3V0cHV0Q2hhbm5lbElkID0gYWN0aXZlU2Vzc2lvblNlcnZlcj8ubG9nT3V0cHV0Q2hhbm5lbElkO1xuXHRpZiAoc2hvd0FjdGl2ZVNlc3Npb25PdXRwdXQpIHtcblx0XHRyZXR1cm4gKCkgPT4gc2hvd0FjdGl2ZVNlc3Npb25PdXRwdXQoY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yKTtcblx0fVxuXHRpZiAob3V0cHV0Q2hhbm5lbElkKSB7XG5cdFx0cmV0dXJuIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGNsb3NlQ3VzdG9taXphdGlvbkVkaXRvcj8uKCk7XG5cdFx0XHRhd2FpdCBvdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKG91dHB1dENoYW5uZWxJZCk7XG5cdFx0fTtcblx0fVxuXHRpZiAobG9jYWxTZXJ2ZXIpIHtcblx0XHRyZXR1cm4gYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yPy4oKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmVyLnNob3dPdXRwdXQoKTtcblx0XHR9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcFN0YXR1c1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWNwU3RhdHVzUHJlc2VudGF0aW9uKHN0YXRlOiBNY3BTdGF0dXNLaW5kIHwgdW5kZWZpbmVkLCBkaXNhYmxlZFJlYXNvbj86IEN1c3RvbWl6YXRpb25EaXNhYmxlZFJlYXNvbik6IElNY3BTdGF0dXNQcmVzZW50YXRpb24gfCB1bmRlZmluZWQge1xuXHRpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHN0YXRlID09PSAnZGlzYWJsZWQnKSB7XG5cdFx0cmV0dXJuIHsgbGFiZWw6IGdldEN1c3RvbWl6YXRpb25EaXNhYmxlZExhYmVsKGRpc2FibGVkUmVhc29uKSwgY2xhc3NOYW1lOiAnZGlzYWJsZWQnLCBpY29uOiBDb2RpY29uLmNpcmNsZVNsYXNoIH07XG5cdH1cblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZzpcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5SZWFkeTpcblx0XHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgncnVubmluZycsIFwiUnVubmluZ1wiKSwgY2xhc3NOYW1lOiAncnVubmluZycsIGljb246IENvZGljb24uY2hlY2sgfTtcblx0XHRjYXNlIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0YXJ0aW5nOlxuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nOlxuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCdzdGFydGluZycsIFwiU3RhcnRpbmdcIiksIGNsYXNzTmFtZTogJ3N0YXJ0aW5nJywgaWNvbjogVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykgfTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQ6XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ2F1dGhSZXF1aXJlZCcsIFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiksIGNsYXNzTmFtZTogJ2F1dGgtcmVxdWlyZWQnLCBpY29uOiBDb2RpY29uLmFjY291bnQgfTtcblx0XHRjYXNlIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yOlxuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkVycm9yOlxuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3JcIiksIGNsYXNzTmFtZTogJ2Vycm9yJywgaWNvbjogQ29kaWNvbi5lcnJvciB9O1xuXHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZDpcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkOlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ3N0b3BwZWQnLCBcIlN0b3BwZWRcIiksIGNsYXNzTmFtZTogJ3N0b3BwZWQnIH07XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlU2Vzc2lvblNlcnZlcihlbnRyeTogSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnkpOiBBZ2VudEhvc3RNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZW50cnkudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nID8gZW50cnkuc2VydmVyIDogZW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlcjtcbn1cblxuZnVuY3Rpb24gZ2V0TWNwRW50cnlMYWJlbChlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeSk6IHN0cmluZyB7XG5cdHJldHVybiBlbGVtZW50LnR5cGUgPT09ICdzZXNzaW9uLXNlcnZlci1pdGVtJ1xuXHRcdD8gZWxlbWVudC5zZXJ2ZXIubmFtZVxuXHRcdDogZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJ1xuXHRcdFx0PyBlbGVtZW50LmxhYmVsXG5cdFx0XHQ6IGVsZW1lbnQuc2VydmVyLmxhYmVsO1xufVxuXG5mdW5jdGlvbiBnZXRNY3BTdGF0dXNLaW5kKGVudHJ5OiBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeSwgaXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbik6IE1jcFN0YXR1c0tpbmQgfCB1bmRlZmluZWQge1xuXHRpZiAoZW50cnkudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0cmV0dXJuIGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJQcmVzZW50YXRpb24oZW50cnkuc2VydmVyKS5zdGF0dXM7XG5cdH1cblx0aWYgKGVudHJ5LmFjdGl2ZVNlc3Npb25TZXJ2ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBnZXRBY3RpdmVTZXNzaW9uU2VydmVyUHJlc2VudGF0aW9uKGVudHJ5LmFjdGl2ZVNlc3Npb25TZXJ2ZXIpLnN0YXR1cztcblx0fVxuXHRpZiAoZW50cnkubG9jYWxTZXJ2ZXIgJiYgaXNDb250cmlidXRpb25EaXNhYmxlZChlbnRyeS5sb2NhbFNlcnZlci5lbmFibGVtZW50LmdldCgpKSkge1xuXHRcdHJldHVybiAnZGlzYWJsZWQnO1xuXHR9XG5cdGlmIChlbnRyeS50eXBlID09PSAnc2VydmVyLWl0ZW0nICYmICFpc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0cmV0dXJuIGVudHJ5LmxvY2FsU2VydmVyPy5jb25uZWN0aW9uU3RhdGUuZ2V0KCkuc3RhdGU7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0TWNwRW50cnlBcmlhTGFiZWwoZWxlbWVudDogSU1jcExpc3RFbnRyeSwgaXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbik6IHN0cmluZyB7XG5cdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdtY3BHcm91cEFyaWFMYWJlbCcsIFwiezB9LCB7MX0gaXRlbXMsIHsyfVwiLCBlbGVtZW50LmxhYmVsLCBlbGVtZW50LmNvdW50LCBlbGVtZW50LmNvbGxhcHNlZCA/IGxvY2FsaXplKCdjb2xsYXBzZWQnLCBcImNvbGxhcHNlZFwiKSA6IGxvY2FsaXplKCdleHBhbmRlZCcsIFwiZXhwYW5kZWRcIikpO1xuXHR9XG5cdGNvbnN0IGxhYmVsID0gZ2V0TWNwRW50cnlMYWJlbChlbGVtZW50KTtcblx0Y29uc3Qgc3RhdHVzS2luZCA9IGdldE1jcFN0YXR1c0tpbmQoZWxlbWVudCwgaXNTZXNzaW9uc1dpbmRvdyk7XG5cdGNvbnN0IGRpc2FibGVkUmVhc29uID0gc3RhdHVzS2luZCA9PT0gJ2Rpc2FibGVkJyA/IGdldE1jcERpc2FibGVkUmVhc29uKGVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBzdGF0dXMgPSBnZXRNY3BTdGF0dXNQcmVzZW50YXRpb24oc3RhdHVzS2luZCwgZGlzYWJsZWRSZWFzb24pO1xuXHRyZXR1cm4gc3RhdHVzXG5cdFx0PyBsb2NhbGl6ZSgnbWNwU2VydmVyQXJpYUxhYmVsV2l0aFN0YXR1cycsIFwiezB9LCB7MX1cIiwgbGFiZWwsIHN0YXR1cy5sYWJlbClcblx0XHQ6IGxhYmVsO1xufVxuXG5mdW5jdGlvbiBnZXRNY3BEaXNhYmxlZFJlYXNvbihlbnRyeTogSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnkpOiBDdXN0b21pemF0aW9uRGlzYWJsZWRSZWFzb24gfCB1bmRlZmluZWQge1xuXHRpZiAoZW50cnkudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0cmV0dXJuIGVudHJ5LnNlcnZlci5kaXNhYmxlZFJlYXNvbjtcblx0fVxuXHRpZiAoZW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGVudHJ5LmFjdGl2ZVNlc3Npb25TZXJ2ZXIuZGlzYWJsZWRSZWFzb247XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplTWNwTWF0Y2hLZXkodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZSB8fCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVuaXF1ZU1jcE1hdGNoS2V5cyh2YWx1ZXM6IHJlYWRvbmx5IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRjb25zdCBrZXkgPSBub3JtYWxpemVNY3BNYXRjaEtleSh2YWx1ZSk7XG5cdFx0aWYgKGtleSkge1xuXHRcdFx0a2V5cy5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFsuLi5rZXlzXTtcbn1cblxuY2xhc3MgQWN0aXZlU2Vzc2lvbk1jcFNlcnZlck1hdGNoZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50SG9zdE1jcFNlcnZlcltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hdGNoZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IEFnZW50SG9zdE1jcFNlcnZlcltdKSB7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yID0gc2VydmVyLmlkLmluZGV4T2YoJy8nKTtcblx0XHRcdGNvbnN0IHJhd0lkID0gc2VwYXJhdG9yID49IDAgPyBzZXJ2ZXIuaWQuc2xpY2Uoc2VwYXJhdG9yICsgMSkgOiBzZXJ2ZXIuaWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoW3Jhd0lkLCBzZXJ2ZXIubmFtZV0pKSB7XG5cdFx0XHRcdGxldCBidWNrZXQgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdHRoaXMuYnlLZXkuc2V0KGtleSwgYnVja2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRidWNrZXQucHVzaChzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRha2Uoa2V5czogcmVhZG9ubHkgKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IEFnZW50SG9zdE1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgZ2V0VW5pcXVlTWNwTWF0Y2hLZXlzKGtleXMpKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5ieUtleS5nZXQoa2V5KT8uZmlsdGVyKHNlcnZlciA9PiAhdGhpcy5tYXRjaGVkSWRzLmhhcyhzZXJ2ZXIuaWQpKTtcblx0XHRcdGlmIChtYXRjaGVzPy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5tYXRjaGVkSWRzLmFkZChtYXRjaGVzWzBdLmlkKTtcblx0XHRcdFx0cmV0dXJuIG1hdGNoZXNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR1bm1hdGNoZWQocXVlcnk6IHN0cmluZyk6IEFnZW50SG9zdE1jcFNlcnZlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5zZXJ2ZXJzLmZpbHRlcihzZXJ2ZXIgPT4gIXRoaXMubWF0Y2hlZElkcy5oYXMoc2VydmVyLmlkKSAmJiBtYXRjaGVzQWN0aXZlU2Vzc2lvblNlcnZlclF1ZXJ5KHNlcnZlciwgcXVlcnkpKTtcblx0fVxufVxuXG5jbGFzcyBMb2NhbE1jcFNlcnZlck1hdGNoZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIElNY3BTZXJ2ZXJbXT4oKTtcblxuXHRjb25zdHJ1Y3RvcihzZXJ2ZXJzOiByZWFkb25seSBJTWNwU2VydmVyW10pIHtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRSdW50aW1lU2VydmVyTWF0Y2hLZXlzKHNlcnZlcikpIHtcblx0XHRcdFx0bGV0IG1hdGNoZXMgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdFx0XHRtYXRjaGVzID0gW107XG5cdFx0XHRcdFx0dGhpcy5ieUtleS5zZXQoa2V5LCBtYXRjaGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXRjaGVzLnB1c2goc2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmaW5kKGtleXM6IHJlYWRvbmx5IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoa2V5cykpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0aWYgKG1hdGNoZXM/Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2hlc1swXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBtYXRjaGVzQWN0aXZlU2Vzc2lvblNlcnZlclF1ZXJ5KHNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyLCBxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghcXVlcnkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gc2VydmVyLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSk7XG59XG5cbmZ1bmN0aW9uIGdldFdvcmtiZW5jaFNlcnZlck1hdGNoS2V5cyhzZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoW3NlcnZlci5pZCwgc2VydmVyLm5hbWUsIHNlcnZlci5sYWJlbF0pO1xufVxuXG5mdW5jdGlvbiBnZXRSdW50aW1lU2VydmVyTWF0Y2hLZXlzKHNlcnZlcjogSU1jcFNlcnZlcik6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGdldFVuaXF1ZU1jcE1hdGNoS2V5cyhbc2VydmVyLmRlZmluaXRpb24uaWQsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY3RpdmVTZXNzaW9uU2VydmVyUHJlc2VudGF0aW9uKHNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyKTogeyByZWFkb25seSBlbmFibGVkOiBib29sZWFuOyByZWFkb25seSBzdGF0dXM6IE1jcFN0YXR1c0tpbmQgfSB7XG5cdHJldHVybiB7XG5cdFx0ZW5hYmxlZDogc2VydmVyLmVuYWJsZWQsXG5cdFx0c3RhdHVzOiBzZXJ2ZXIuZW5hYmxlZCA/IHNlcnZlci5zdGF0dXMgOiAnZGlzYWJsZWQnLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlU2Vzc2lvblNlcnZlckxpZmVjeWNsZUFjdGlvbihzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlcik6IEFjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghZ2V0QWN0aXZlU2Vzc2lvblNlcnZlclByZXNlbnRhdGlvbihzZXJ2ZXIpLmVuYWJsZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBzZXJ2ZXIuc3RhdHVzID09PSBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB8fCBzZXJ2ZXIuc3RhdHVzID09PSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3Jcblx0XHQ/IG5ldyBBY3Rpb24oXG5cdFx0XHQnbWNwU2VydmVyLmFjdGl2ZVNlc3Npb24uc3RhcnQnLFxuXHRcdFx0bG9jYWxpemUoJ2FjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJTdGFydCcsIFwiU3RhcnQgU2VydmVyXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHNlcnZlci5zdGFydCgpXG5cdFx0KVxuXHRcdDogbmV3IEFjdGlvbihcblx0XHRcdCdtY3BTZXJ2ZXIuYWN0aXZlU2Vzc2lvbi5zdG9wJyxcblx0XHRcdGxvY2FsaXplKCdhY3RpdmVTZXNzaW9uTWNwU2VydmVyU3RvcCcsIFwiU3RvcCBTZXJ2ZXJcIiksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gc2VydmVyLnN0b3AoKVxuXHRcdCk7XG59XG5cbnR5cGUgQWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudFNjb3BlID0gJ2dsb2JhbCcgfCAnd29ya3NwYWNlJyB8ICdzZXNzaW9uJztcblxuY29uc3QgYWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbkluZm8gPSB7XG5cdGdsb2JhbDoge1xuXHRcdGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsXG5cdFx0ZW5hYmxlTGFiZWw6ICgpID0+IGxvY2FsaXplKCdhZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGUnLCBcIkVuYWJsZVwiKSxcblx0XHRkaXNhYmxlTGFiZWw6ICgpID0+IGxvY2FsaXplKCdhZ2VudEhvc3RNY3BTZXJ2ZXJEaXNhYmxlJywgXCJEaXNhYmxlXCIpLFxuXHR9LFxuXHR3b3Jrc3BhY2U6IHtcblx0XHRraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLFxuXHRcdGVuYWJsZUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnYWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlV29ya3NwYWNlJywgXCJFbmFibGUgKFdvcmtzcGFjZSlcIiksXG5cdFx0ZGlzYWJsZUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnYWdlbnRIb3N0TWNwU2VydmVyRGlzYWJsZVdvcmtzcGFjZScsIFwiRGlzYWJsZSAoV29ya3NwYWNlKVwiKSxcblx0fSxcblx0c2Vzc2lvbjoge1xuXHRcdGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLFxuXHRcdGVuYWJsZUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnYWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlU2Vzc2lvbicsIFwiRW5hYmxlIChTZXNzaW9uKVwiKSxcblx0XHRkaXNhYmxlTGFiZWw6ICgpID0+IGxvY2FsaXplKCdhZ2VudEhvc3RNY3BTZXJ2ZXJEaXNhYmxlU2Vzc2lvbicsIFwiRGlzYWJsZSAoU2Vzc2lvbilcIiksXG5cdH0sXG59IHNhdGlzZmllcyBSZWNvcmQ8QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudFNjb3BlLCB7XG5cdHJlYWRvbmx5IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZDtcblx0cmVhZG9ubHkgZW5hYmxlTGFiZWw6ICgpID0+IHN0cmluZztcblx0cmVhZG9ubHkgZGlzYWJsZUxhYmVsOiAoKSA9PiBzdHJpbmc7XG59PjtcblxuLyoqIENyZWF0ZXMgZW5hYmxlbWVudCBhY3Rpb25zIGZvciBhbiBhZ2VudC1ob3N0IHNlcnZlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhhZ2VudEhvc3RDdXN0b21pemF0aW9uczogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlciwgc2NvcGVzOiByZWFkb25seSBBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50U2NvcGVbXSA9IFsnZ2xvYmFsJywgJ3dvcmtzcGFjZScsICdzZXNzaW9uJ10pOiBJQWN0aW9uW10ge1xuXHRpZiAoc2VydmVyLmRpc2FibGVkUmVhc29uPy5zb3VyY2UgPT09ICdwbHVnaW4nKSB7XG5cdFx0Y29uc3QgZGVjaXNpb24gPSBzZXJ2ZXIuZGlzYWJsZWRSZWFzb24ucGx1Z2luLmVuYWJsZW1lbnQ/LlswXTtcblx0XHRpZiAoIWRlY2lzaW9uKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbiA9IGNyZWF0ZUFnZW50SG9zdEVuYWJsZVBsdWdpbkFjdGlvbihhZ2VudEhvc3RDdXN0b21pemF0aW9ucywgYWdlbnRQbHVnaW5TZXJ2aWNlLCBzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5kaXNhYmxlZFJlYXNvbi5wbHVnaW4sIGRlY2lzaW9uLmtpbmQpO1xuXHRcdHJldHVybiBbbmV3IEFjdGlvbihhY3Rpb24uaWQsIGFjdGlvbi5sYWJlbCwgdW5kZWZpbmVkLCB0cnVlLCBhY3Rpb24ucnVuKV07XG5cdH1cblx0Y29uc3QgZW5hYmxlbWVudCA9IGdldEN1c3RvbWl6YXRpb25TY29wZUVuYWJsZW1lbnQoc2VydmVyKTtcblx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGlmIChzY29wZXMuaW5jbHVkZXMoJ2dsb2JhbCcpKSB7XG5cdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb24oYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLCAhZW5hYmxlbWVudC5nbG9iYWwsICdnbG9iYWwnKSk7XG5cdH1cblx0aWYgKHNjb3Blcy5pbmNsdWRlcygnd29ya3NwYWNlJykgJiYgYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMuZ2V0V29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZSkubGVuZ3RoID4gMCkge1xuXHRcdGFjdGlvbnMucHVzaChjcmVhdGVBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uKGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLCBzZXNzaW9uUmVzb3VyY2UsIHNlcnZlciwgIWVuYWJsZW1lbnQud29ya3NwYWNlLCAnd29ya3NwYWNlJykpO1xuXHR9XG5cdGlmIChzY29wZXMuaW5jbHVkZXMoJ3Nlc3Npb24nKSkge1xuXHRcdGFjdGlvbnMucHVzaChjcmVhdGVBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uKGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLCBzZXNzaW9uUmVzb3VyY2UsIHNlcnZlciwgIWVuYWJsZW1lbnQuc2Vzc2lvbiwgJ3Nlc3Npb24nKSk7XG5cdH1cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb24oYWdlbnRIb3N0Q3VzdG9taXphdGlvbnM6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyLCBlbmFibGVkOiBib29sZWFuLCBzY29wZTogQWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudFNjb3BlKTogSUFjdGlvbiB7XG5cdGNvbnN0IGFjdGlvbkluZm8gPSBhZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uSW5mb1tzY29wZV07XG5cdHJldHVybiBuZXcgQWN0aW9uKFxuXHRcdGBtY3BTZXJ2ZXIuYWdlbnRIb3N0LiR7ZW5hYmxlZCA/ICdlbmFibGUnIDogJ2Rpc2FibGUnfS4ke3Njb3BlfWAsXG5cdFx0ZW5hYmxlZCA/IGFjdGlvbkluZm8uZW5hYmxlTGFiZWwoKSA6IGFjdGlvbkluZm8uZGlzYWJsZUxhYmVsKCksXG5cdFx0dW5kZWZpbmVkLFxuXHRcdHRydWUsXG5cdFx0KCkgPT4gYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMuc2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIuaWQsIHNlcnZlci5lbmFibGVtZW50LCBhY3Rpb25JbmZvLmtpbmQsIGVuYWJsZWQpLFxuXHQpO1xufVxuXG4vKiogQ3JlYXRlcyBkdXJhYmxlIHByb2ZpbGUvd29ya3NwYWNlIGFjdGlvbnMgZm9yIGEgbG9jYWxseSBiYWNrZWQgYnVpbHQtaW4gc2VydmVyIHJvdy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLCBzZXJ2ZXJJZDogc3RyaW5nLCBpc0VtcHR5V29ya2JlbmNoOiBib29sZWFuLCBvcHRpb25zOiB7IHJlYWRvbmx5IGluY2x1ZGVXb3Jrc3BhY2U/OiBib29sZWFuOyByZWFkb25seSBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyIH0gPSB7fSk6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGluY2x1ZGVXb3Jrc3BhY2UgPSBvcHRpb25zLmluY2x1ZGVXb3Jrc3BhY2UgPz8gdHJ1ZTtcblx0Y29uc3QgZGlzYWJsZWQgPSBvcHRpb25zLmFjdGl2ZVNlc3Npb25TZXJ2ZXJcblx0XHQ/ICFnZXRBY3RpdmVTZXNzaW9uU2VydmVyUHJlc2VudGF0aW9uKG9wdGlvbnMuYWN0aXZlU2Vzc2lvblNlcnZlcikuZW5hYmxlZFxuXHRcdDogaXNDb250cmlidXRpb25EaXNhYmxlZChtY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZChzZXJ2ZXJJZCkpO1xuXHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0aWYgKGRpc2FibGVkKSB7XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ21jcFNlcnZlci5idWlsdGluLmVuYWJsZScsIGxvY2FsaXplKCdidWlsdGluTWNwU2VydmVyRW5hYmxlJywgXCJFbmFibGVcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChzZXJ2ZXJJZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHR9KSk7XG5cdFx0aWYgKGluY2x1ZGVXb3Jrc3BhY2UgJiYgIWlzRW1wdHlXb3JrYmVuY2gpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYnVpbHRpbi5lbmFibGVXb3Jrc3BhY2UnLCBsb2NhbGl6ZSgnYnVpbHRpbk1jcFNlcnZlckVuYWJsZUZvcldvcmtzcGFjZScsIFwiRW5hYmxlIChXb3Jrc3BhY2UpXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChzZXJ2ZXJJZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbignbWNwU2VydmVyLmJ1aWx0aW4uZGlzYWJsZScsIGxvY2FsaXplKCdidWlsdGluTWNwU2VydmVyRGlzYWJsZScsIFwiRGlzYWJsZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRtY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5zZXRFbmFibGVkKHNlcnZlcklkLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHR9KSk7XG5cdFx0aWYgKGluY2x1ZGVXb3Jrc3BhY2UgJiYgIWlzRW1wdHlXb3JrYmVuY2gpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYnVpbHRpbi5kaXNhYmxlV29ya3NwYWNlJywgbG9jYWxpemUoJ2J1aWx0aW5NY3BTZXJ2ZXJEaXNhYmxlRm9yV29ya3NwYWNlJywgXCJEaXNhYmxlIChXb3Jrc3BhY2UpXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChzZXJ2ZXJJZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbi8qKiBDcmVhdGVzIGVuYWJsZW1lbnQgYWN0aW9ucyBmb3IgYSBidWlsdC1pbiByb3csIHVzaW5nIHRoZSBhY3RpdmUgYWdlbnQtaG9zdCBzZXNzaW9uIGZvciBzY29wZWQgYWN0aW9ucy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRCdWlsdGluTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMobWNwU2VydmljZTogSU1jcFNlcnZpY2UsIHNlcnZlcklkOiBzdHJpbmcsIGlzRW1wdHlXb3JrYmVuY2g6IGJvb2xlYW4sIGFnZW50SG9zdEN1c3RvbWl6YXRpb25zOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGFjdGl2ZVNlc3Npb25TZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlciB8IHVuZGVmaW5lZCk6IElBY3Rpb25bXSB7XG5cdGlmIChhY3RpdmVTZXNzaW9uU2VydmVyID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZ2V0TG9jYWxNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhtY3BTZXJ2aWNlLCBzZXJ2ZXJJZCwgaXNFbXB0eVdvcmtiZW5jaCk7XG5cdH1cblx0aWYgKGFjdGl2ZVNlc3Npb25TZXJ2ZXIuaXNQbHVnaW5Qcm92aWRlZCAmJiAhYWN0aXZlU2Vzc2lvblNlcnZlci5pc0NsaWVudEJ1bmRsZWQpIHtcblx0XHRyZXR1cm4gZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIGFnZW50UGx1Z2luU2VydmljZSwgc2Vzc2lvblJlc291cmNlLCBhY3RpdmVTZXNzaW9uU2VydmVyKTtcblx0fVxuXHRyZXR1cm4gW1xuXHRcdC4uLmdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMobWNwU2VydmljZSwgc2VydmVySWQsIGlzRW1wdHlXb3JrYmVuY2gsIHsgaW5jbHVkZVdvcmtzcGFjZTogZmFsc2UsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIgfSksXG5cdFx0Li4uZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIGFnZW50UGx1Z2luU2VydmljZSwgc2Vzc2lvblJlc291cmNlLCBhY3RpdmVTZXNzaW9uU2VydmVyLCBbJ3dvcmtzcGFjZScsICdzZXNzaW9uJ10pLFxuXHRdO1xufVxuXG4vKiogQ29tcG9zZXMgbGlmZWN5Y2xlLCBzY29wZWQgZW5hYmxlbWVudCwgYW5kIG9wdGlvbnMgYWN0aW9ucyBmb3IgYW4gYWdlbnQtaG9zdC1vbmx5IHJvdy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY3RpdmVTZXNzaW9uU2VydmVyT3B0aW9uc0FjdGlvbnMoY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwgYWdlbnRIb3N0Q3VzdG9taXphdGlvbnM6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVyOiBBZ2VudEhvc3RNY3BTZXJ2ZXIpOiBJQWN0aW9uW10ge1xuXHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRjb25zdCBsaWZlY3ljbGVBY3Rpb24gPSBnZXRBY3RpdmVTZXNzaW9uU2VydmVyTGlmZWN5Y2xlQWN0aW9uKHNlcnZlcik7XG5cdGlmIChsaWZlY3ljbGVBY3Rpb24pIHtcblx0XHRhY3Rpb25zLnB1c2gobGlmZWN5Y2xlQWN0aW9uKTtcblx0fVxuXG5cdGNvbnN0IGR1cmFibGVBY3Rpb25zID0gZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoYWdlbnRIb3N0Q3VzdG9taXphdGlvbnMsIGFnZW50UGx1Z2luU2VydmljZSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpO1xuXHRpZiAoZHVyYWJsZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2goLi4uZHVyYWJsZUFjdGlvbnMpO1xuXHR9XG5cblx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdCdtY3BTZXJ2ZXIuYWN0aXZlU2Vzc2lvbi5vcHRpb25zJyxcblx0XHRsb2NhbGl6ZSgnYWN0aXZlU2Vzc2lvbk1jcFNlcnZlck9wdGlvbnMnLCBcIlNlcnZlciBPcHRpb25zXCIpLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR0cnVlLFxuXHRcdGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuQWdlbnRIb3N0U2VydmVyT3B0aW9ucywgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIuaWQpO1xuXHRcdH1cblx0KSk7XG5cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbmZ1bmN0aW9uIHNob3VsZEhpZGVMb2NhbEFjdGlvbkZvckFjdGl2ZVNlc3Npb25TZXJ2ZXIoYWN0aW9uOiBJQWN0aW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBTdGFydFNlcnZlckFjdGlvblxuXHRcdHx8IGFjdGlvbiBpbnN0YW5jZW9mIFN0b3BTZXJ2ZXJBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBSZXN0YXJ0U2VydmVyQWN0aW9uXG5cdFx0fHwgYWN0aW9uIGluc3RhbmNlb2YgQ29uZmlndXJlTW9kZWxBY2Nlc3NBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBTaG93U2FtcGxpbmdSZXF1ZXN0c0FjdGlvblxuXHRcdHx8IGlzTG9jYWxNY3BTZXJ2ZXJXb3Jrc3BhY2VFbmFibGVtZW50QWN0aW9uKGFjdGlvbik7XG59XG5cbmZ1bmN0aW9uIGlzTG9jYWxNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWN0aW9uLmlkID09PSBFbmFibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbi5JRFxuXHRcdHx8IGFjdGlvbi5pZCA9PT0gRW5hYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLklEXG5cdFx0fHwgYWN0aW9uLmlkID09PSBEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24uSURcblx0XHR8fCBhY3Rpb24uaWQgPT09IERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSUQ7XG59XG5cbmZ1bmN0aW9uIGlzTG9jYWxNY3BTZXJ2ZXJXb3Jrc3BhY2VFbmFibGVtZW50QWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWN0aW9uLmlkID09PSBFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSURcblx0XHR8fCBhY3Rpb24uaWQgPT09IERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSUQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXJ2ZXJJdGVtQ29udGV4dE1lbnVBY3Rpb25zKG1lbnVBY3Rpb25Hcm91cHM6IHJlYWRvbmx5IChyZWFkb25seSBJQWN0aW9uW10pW10sIGFjdGl2ZVNlc3Npb25TZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlciB8IHVuZGVmaW5lZCwgYWN0aXZlU2Vzc2lvbkxpZmVjeWNsZUFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZCwgYWdlbnRIb3N0RW5hYmxlbWVudEFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSk6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRjb25zdCBoYXNBY3RpdmVTZXNzaW9uID0gYWN0aXZlU2Vzc2lvblNlcnZlciAhPT0gdW5kZWZpbmVkO1xuXHRsZXQgYWdlbnRIb3N0RW5hYmxlbWVudEFkZGVkID0gZmFsc2U7XG5cdGlmIChhY3RpdmVTZXNzaW9uTGlmZWN5Y2xlQWN0aW9uKSB7XG5cdFx0YWN0aW9ucy5wdXNoKGFjdGl2ZVNlc3Npb25MaWZlY3ljbGVBY3Rpb24sIG5ldyBTZXBhcmF0b3IoKSk7XG5cdH1cblx0Zm9yIChjb25zdCBtZW51QWN0aW9ucyBvZiBtZW51QWN0aW9uR3JvdXBzKSB7XG5cdFx0Y29uc3QgdmlzaWJsZU1lbnVBY3Rpb25zID0gaGFzQWN0aXZlU2Vzc2lvblxuXHRcdFx0PyBtZW51QWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+ICFzaG91bGRIaWRlTG9jYWxBY3Rpb25Gb3JBY3RpdmVTZXNzaW9uU2VydmVyKGFjdGlvbikpXG5cdFx0XHQ6IG1lbnVBY3Rpb25zO1xuXHRcdGFjdGlvbnMucHVzaCguLi52aXNpYmxlTWVudUFjdGlvbnMpO1xuXHRcdGlmIChoYXNBY3RpdmVTZXNzaW9uICYmIG1lbnVBY3Rpb25zLnNvbWUoaXNMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb24pKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uYWdlbnRIb3N0RW5hYmxlbWVudEFjdGlvbnMpO1xuXHRcdFx0YWdlbnRIb3N0RW5hYmxlbWVudEFkZGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHZpc2libGVNZW51QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cdH1cblx0aWYgKGhhc0FjdGl2ZVNlc3Npb24gJiYgIWFnZW50SG9zdEVuYWJsZW1lbnRBZGRlZCkge1xuXHRcdGFjdGlvbnMucHVzaCguLi5hZ2VudEhvc3RFbmFibGVtZW50QWN0aW9ucyk7XG5cdH1cblx0aWYgKGFjdGlvbnNbYWN0aW9ucy5sZW5ndGggLSAxXSBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdGFjdGlvbnMucG9wKCk7XG5cdH1cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJ1aWx0aW5FbnRyeShzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXI/OiBBZ2VudEhvc3RNY3BTZXJ2ZXIpOiBJTWNwQnVpbHRpbkl0ZW1FbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogJ2J1aWx0aW4taXRlbScsXG5cdFx0aWQ6IGBidWlsdGluLSR7c2VydmVyLmRlZmluaXRpb24uaWR9YCxcblx0XHRsYWJlbDogc2VydmVyLmRlZmluaXRpb24ubGFiZWwsXG5cdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdGNvbGxlY3Rpb25JZDogc2VydmVyLmNvbGxlY3Rpb24uaWQsXG5cdFx0YWN0aXZlU2Vzc2lvblNlcnZlcixcblx0XHRsb2NhbFNlcnZlcjogc2VydmVyLFxuXHR9O1xufVxuXG5jb25zdCBNQ1BfR0FMTEVSWV9JVEVNX1RFTVBMQVRFX0lEID0gJ21jcEdhbGxlcnlJdGVtJztcblxuLyoqIEFkYXB0cyBhIGdhbGxlcnkgTUNQIHNlcnZlciBlbnRyeSB0byB0aGUgc2hhcmVkIGdhbGxlcnkgcm93IHJlbmRlcmVyLiAqL1xuY2xhc3MgTWNwR2FsbGVyeUl0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIElHYWxsZXJ5SXRlbVByb3ZpZGVyPElNY3BTZXJ2ZXJJdGVtRW50cnk+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlKSB7IH1cblxuXHRnZXRMYWJlbChlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWxlbWVudC5zZXJ2ZXIubGFiZWw7XG5cdH1cblxuXHRnZXRQdWJsaXNoZXJEaXNwbGF5TmFtZShlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudC5zZXJ2ZXIucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cdH1cblxuXHRnZXREZXNjcmlwdGlvbihlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudC5zZXJ2ZXIuZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXRJbnN0YWxsU3RhdGUoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlIHtcblx0XHRzd2l0Y2ggKGVsZW1lbnQuc2VydmVyLmluc3RhbGxTdGF0ZSkge1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGVkOiByZXR1cm4gR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUuSW5zdGFsbGVkO1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGluZzogcmV0dXJuIEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlLkluc3RhbGxpbmc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdFx0fVxuXHR9XG5cblx0Y2FuSW5zdGFsbChlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKGVsZW1lbnQuc2VydmVyKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGVsZW1lbnQuc2VydmVyKTtcblx0fVxuXG5cdG9uRGlkQ2hhbmdlSW5zdGFsbFN0YXRlKGVsZW1lbnQ6IElNY3BTZXJ2ZXJJdGVtRW50cnksIGxpc3RlbmVyOiAoKSA9PiB2b2lkKSB7XG5cdFx0cmV0dXJuIHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vbkNoYW5nZShjaGFuZ2VkID0+IHtcblx0XHRcdGlmICghY2hhbmdlZCB8fCBjaGFuZ2VkLmlkID09PSBlbGVtZW50LnNlcnZlci5pZCkge1xuXHRcdFx0XHRsaXN0ZW5lcigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgYSBsaXN0IG9mIE1DUCBzZXJ2ZXJzIHdpdGggbWFya2V0cGxhY2UgYnJvd3NpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BMaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2JlbmNoTWNwU2VydmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RTZXJ2ZXIgPSB0aGlzLl9vbkRpZFNlbGVjdFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbUNvdW50ID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0U2hvd1BsdWdpbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFBsdWdpbkl0ZW0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RTaG93UGx1Z2luID0gdGhpcy5fb25EaWRSZXF1ZXN0U2hvd1BsdWdpbi5ldmVudDtcblxuXHRwcml2YXRlIHNlY3Rpb25UaXRsZUhlYWRlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlY3Rpb25MaW5rITogSFRNTEFuY2hvckVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoQW5kQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoSW5wdXQhOiBJbnB1dEJveDtcblx0cHJpdmF0ZSBsaXN0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGlzdCE6IFdvcmtiZW5jaExpc3Q8SU1jcExpc3RFbnRyeT47XG5cdHByaXZhdGUgZW1wdHlDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlbXB0eVRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlbXB0eVN1YnRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpc2FibGVkSWNvbiE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpc2FibGVkTWVzc2FnZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc2FibGVkTGlua0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGJyb3dzZUJ1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBiYWNrQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIGFkZEJ1dHRvbiE6IEJ1dHRvbjtcblxuXHRwcml2YXRlIGZpbHRlcmVkU2VydmVyczogSVdvcmtiZW5jaE1jcFNlcnZlcltdID0gW107XG5cdHByaXZhdGUgZmlsdGVyZWRCdWlsdGluQ291bnQgPSAwO1xuXHRwcml2YXRlIGZpbHRlcmVkQWN0aXZlU2Vzc2lvbkNvdW50ID0gMDtcblx0cHJpdmF0ZSBkaXNwbGF5RW50cmllczogSU1jcExpc3RFbnRyeVtdID0gW107XG5cdHByaXZhdGUgZ2FsbGVyeVNlcnZlcnM6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRwcml2YXRlIHNlYXJjaFF1ZXJ5OiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBicm93c2VNb2RlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgbGFzdEhlaWdodDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBsYXN0V2lkdGg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGFzdEhlYWRlckhlaWdodCA9IDA7XG5cdHByaXZhdGUgX2xheW91dERlZmVycmVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29sbGFwc2VkR3JvdXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgZ2FsbGVyeUN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllZEZpbHRlciA9IG5ldyBEZWxheWVyPHZvaWQ+KDIwMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllZEdhbGxlcnlTZWFyY2ggPSBuZXcgRGVsYXllcjx2b2lkPig0MDApO1xuXHRwcml2YXRlIF9jbG9zZUN1c3RvbWl6YXRpb25FZGl0b3I6ICgpID0+IFByb21pc2U8dm9pZD4gPSAoKSA9PiBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcubWNwLWxpc3Qtd2lkZ2V0Jyk7XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZUFjY2Vzc1N0YXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtY3BBY2Nlc3NDb25maWcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWNjZXNzU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmdhbGxlcnlDdHM/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHNldENsb3NlQ3VzdG9taXphdGlvbkVkaXRvcihjbG9zZUN1c3RvbWl6YXRpb25FZGl0b3I6ICgpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHR0aGlzLl9jbG9zZUN1c3RvbWl6YXRpb25FZGl0b3IgPSBjbG9zZUN1c3RvbWl6YXRpb25FZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblx0XHQvLyBTZWN0aW9uIHRpdGxlIGhlYWRlciAodGl0bGUgKyBkZXNjcmlwdGlvbiB3aXRoIGlubGluZSBsZWFybiBtb3JlKSBhdCB0aGUgdG9wLlxuXHRcdHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5zZWN0aW9uLXRpdGxlLWhlYWRlcicpKTtcblx0XHRjb25zdCB0aXRsZVJvdyA9IERPTS5hcHBlbmQodGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIsICQoJy5zZWN0aW9uLXRpdGxlLXJvdycpKTtcblx0XHRjb25zdCBzZWN0aW9uVGl0bGUgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5zZWN0aW9uLXRpdGxlJykpO1xuXHRcdHNlY3Rpb25UaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKTtcblx0XHRjb25zdCBzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQodGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIsICQoJ3Auc2VjdGlvbi10aXRsZS1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCBzZWN0aW9uVGl0bGVEZXNjcmlwdGlvblRleHQgPSBET00uYXBwZW5kKHNlY3Rpb25UaXRsZURlc2NyaXB0aW9uLCAkKCdzcGFuLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24tdGV4dCcpKTtcblx0XHRzZWN0aW9uVGl0bGVEZXNjcmlwdGlvblRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWNwU2VydmVyc0Rlc2NyaXB0aW9uJywgXCJBbiBvcGVuIHN0YW5kYXJkIHRoYXQgbGV0cyBBSSB1c2UgZXh0ZXJuYWwgdG9vbHMgYW5kIHNlcnZpY2VzLiBNQ1Agc2VydmVycyBwcm92aWRlIHRvb2xzIGZvciBmaWxlIG9wZXJhdGlvbnMsIGRhdGFiYXNlcywgQVBJcywgYW5kIG1vcmUuXCIpO1xuXHRcdC8vIFJlYWwgd2hpdGVzcGFjZSB0ZXh0IG5vZGUgYmV0d2VlbiBkZXNjcmlwdGlvbiBhbmQgbGluayBzbyB0aGUgZ2FwIGNvbGxhcHNlc1xuXHRcdC8vIHdoZW4gdGhlIGxpbmsgd3JhcHMgdG8gYSBuZXcgbGluZSAoYSBDU1MgbWFyZ2luLWxlZnQgd291bGQgcHVzaCBpdCBpbndhcmQpLlxuXHRcdHNlY3Rpb25UaXRsZURlc2NyaXB0aW9uLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgJykpO1xuXHRcdHRoaXMuc2VjdGlvbkxpbmsgPSBET00uYXBwZW5kKHNlY3Rpb25UaXRsZURlc2NyaXB0aW9uLCAkKCdhLnNlY3Rpb24tdGl0bGUtbGluaycpKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHR0aGlzLnNlY3Rpb25MaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xlYXJuTW9yZU1jcCcsIFwiTGVhcm4gbW9yZSBhYm91dCBNQ1Agc2VydmVyc1wiKTtcblx0XHR0aGlzLnNlY3Rpb25MaW5rLmhyZWYgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudC1jdXN0b21pemF0aW9uL21jcC1zZXJ2ZXJzP3JlZmVycmVyPWluLXByb2R1Y3QnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWN0aW9uTGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IGhyZWYgPSB0aGlzLnNlY3Rpb25MaW5rLmhyZWY7XG5cdFx0XHRpZiAoaHJlZikge1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoaHJlZikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGNoYW5nZXMgc28gdGhlIGxpc3QncyBhbGxvdHRlZFxuXHRcdC8vIGhlaWdodCBzdGF5cyBpbiBzeW5jIHdpdGggdGhlIGFjdHVhbCBvbi1zY3JlZW4gaGVhZGVyIHNpemUuIE9ubHlcblx0XHQvLyByZWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGFjdHVhbGx5IGNoYW5nZWQgdG8gYXZvaWQgcmVkdW5kYW50XG5cdFx0Ly8gd29yayBvbiBEUFIgY2hhbmdlcyBvciB3aWR0aC1vbmx5IHJlc2l6ZXMuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdGNvbnN0IGhlYWRlck9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERPTS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoXG5cdFx0XHQnTWNwTGlzdFdpZGdldC5zZWN0aW9uVGl0bGVIZWFkZXInLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5sYXN0V2lkdGggPD0gMCB8fCB0aGlzLmxhc3RIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRcdGlmIChoZWFkZXJIZWlnaHQgPT09IHRoaXMubGFzdEhlYWRlckhlaWdodCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHRcdH0sXG5cdFx0XHR0YXJnZXRXaW5kb3csXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVhZGVyT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlcikpO1xuXG5cdFx0Ly8gU2VhcmNoIGFuZCBidXR0b24gY29udGFpbmVyXG5cdFx0dGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmxpc3Qtc2VhcmNoLWFuZC1idXR0b24tY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2VhcmNoIGNvbnRhaW5lclxuXHRcdGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5saXN0LXNlYXJjaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnB1dEJveChzZWFyY2hDb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3NlYXJjaE1jcFBsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaC4uLlwiKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnNlYXJjaFF1ZXJ5ID0gdGhpcy5zZWFyY2hJbnB1dC52YWx1ZTtcblx0XHRcdGlmICh0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkR2FsbGVyeVNlYXJjaC50cmlnZ2VyKCgpID0+IHRoaXMucXVlcnlHYWxsZXJ5KCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkRmlsdGVyLnRyaWdnZXIoKCkgPT4gdGhpcy5maWx0ZXJTZXJ2ZXJzKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJ1dHRvbiBjb250YWluZXIgKEJyb3dzZSBNYXJrZXRwbGFjZSArIEFkZCBTZXJ2ZXIpXG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYnV0dG9uLWdyb3VwJykpO1xuXG5cdFx0Ly8gQmFjayBidXR0b24gKHZpc2libGUgb25seSBpbiBtYXJrZXRwbGFjZSBicm93c2UgbW9kZSlcblx0XHRjb25zdCBiYWNrQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChidXR0b25Db250YWluZXIsICQoJy5saXN0LWFkZC1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMuYmFja0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYmFja0J1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYmFja1RvSW5zdGFsbGVkJywgXCJCYWNrIHRvIGluc3RhbGxlZCBzZXJ2ZXJzXCIpLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYmFja1RvSW5zdGFsbGVkJywgXCJCYWNrIHRvIGluc3RhbGxlZCBzZXJ2ZXJzXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuYmFja0J1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5hcnJvd0xlZnQuaWR9KSAke2xvY2FsaXplKCdtY3BCcm93c2VCYWNrJywgXCJCYWNrXCIpfWA7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYmFja0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZShmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQnJvd3NlIE1hcmtldHBsYWNlIGJ1dHRvblxuXHRcdGNvbnN0IGJyb3dzZUJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoYnV0dG9uQ29udGFpbmVyLCAkKCcubGlzdC1hZGQtYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYnJvd3NlQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5saWJyYXJ5LmlkfSkgJHtsb2NhbGl6ZSgnYnJvd3NlTWFya2V0cGxhY2UnLCBcIkJyb3dzZSBNYXJrZXRwbGFjZVwiKX1gO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5icm93c2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvZ2dsZUJyb3dzZU1vZGUoIXRoaXMuYnJvd3NlTW9kZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5hZGRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkU2VydmVyJywgXCJBZGQgU2VydmVyXCIpLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYWRkU2VydmVyJywgXCJBZGQgU2VydmVyXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuYWRkQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmFkZC5pZH0pYDtcblx0XHR0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtaWNvbi1idXR0b24nKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCB0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LCBsb2NhbGl6ZSgnYWRkU2VydmVyVG9vbHRpcCcsIFwiQWRkIFNlcnZlclwiKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWRkQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFkZENvbmZpZ3VyYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVtcHR5IHN0YXRlXG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWNwLWVtcHR5LXN0YXRlJykpO1xuXHRcdGNvbnN0IGVtcHR5SGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdHRoaXMuZW1wdHlUZXh0ID0gRE9NLmFwcGVuZChlbXB0eUhlYWRlciwgJCgnLmVtcHR5LXRleHQnKSk7XG5cdFx0dGhpcy5lbXB0eVN1YnRleHQgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlDb250YWluZXIsICQoJy5lbXB0eS1zdWJ0ZXh0JykpO1xuXG5cdFx0Ly8gRGlzYWJsZWQgKGFjY2VzcyBibG9ja2VkKSBzdGF0ZSBcdTIwMTQgc2hvd24gd2hlbiBjaGF0Lm1jcC5hY2Nlc3MgaXMgc2V0IHRvIG5vbmUsXG5cdFx0Ly8gZWl0aGVyIGJ5IHVzZXIgc2V0dGluZyBvciBieSBlbnRlcnByaXNlIHBvbGljeS5cblx0XHR0aGlzLmRpc2FibGVkQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5tY3AtZGlzYWJsZWQtc3RhdGUnKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRIZWFkZXIgPSBET00uYXBwZW5kKHRoaXMuZGlzYWJsZWRDb250YWluZXIsICQoJy5lbXB0eS1zdGF0ZS1oZWFkZXInKSk7XG5cdFx0dGhpcy5kaXNhYmxlZEljb24gPSBET00uYXBwZW5kKGRpc2FibGVkSGVhZGVyLCAkKCcuZW1wdHktaWNvbicpKTtcblx0XHRjb25zdCBkaXNhYmxlZFRleHQgPSBET00uYXBwZW5kKGRpc2FibGVkSGVhZGVyLCAkKCcuZW1wdHktdGV4dCcpKTtcblx0XHRkaXNhYmxlZFRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWNwQWNjZXNzRGlzYWJsZWRUaXRsZScsIFwiTUNQIHNlcnZlcnMgYXJlIGRpc2FibGVkXCIpO1xuXHRcdHRoaXMuZGlzYWJsZWRNZXNzYWdlID0gRE9NLmFwcGVuZCh0aGlzLmRpc2FibGVkQ29udGFpbmVyLCAkKCcuZW1wdHktc3VidGV4dCcpKTtcblxuXHRcdC8vIExpc3QgY29udGFpbmVyXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5tY3AtbGlzdC1jb250YWluZXInKSk7XG5cblx0XHQvLyBDcmVhdGUgbGlzdFxuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IE1jcFNlcnZlckl0ZW1EZWxlZ2F0ZSgpO1xuXHRcdGNvbnN0IGdyb3VwSGVhZGVyUmVuZGVyZXIgPSBuZXcgQ3VzdG9taXphdGlvbkdyb3VwSGVhZGVyUmVuZGVyZXI8SU1jcEdyb3VwSGVhZGVyRW50cnk+KCdtY3BHcm91cEhlYWRlcicsIHRoaXMuaG92ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbFJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJJdGVtUmVuZGVyZXIsICgpID0+IHRoaXMuX2Nsb3NlQ3VzdG9taXphdGlvbkVkaXRvcigpKTtcblx0XHRjb25zdCBnYWxsZXJ5UmVuZGVyZXIgPSBuZXcgR2FsbGVyeUl0ZW1SZW5kZXJlcjxJTWNwU2VydmVySXRlbUVudHJ5PihNQ1BfR0FMTEVSWV9JVEVNX1RFTVBMQVRFX0lELCBuZXcgTWNwR2FsbGVyeUl0ZW1Qcm92aWRlcih0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UpKTtcblxuXHRcdHRoaXMubGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElNY3BMaXN0RW50cnk+LFxuXHRcdFx0J01jcE1hbmFnZW1lbnRMaXN0Jyxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0W2dyb3VwSGVhZGVyUmVuZGVyZXIsIGxvY2FsUmVuZGVyZXIsIGdhbGxlcnlSZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudDogSU1jcExpc3RFbnRyeSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGdldE1jcEVudHJ5QXJpYUxhYmVsKGVsZW1lbnQsIHRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwU2VydmVyc0xpc3RBcmlhTGFiZWwnLCBcIk1DUCBTZXJ2ZXJzXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlbGVtZW50OiBJTWNwTGlzdEVudHJ5KSB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdidWlsdGluLWl0ZW0nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmlkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuc2VydmVyLmlkO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0R3JvdXBJZChlbGVtZW50OiBJTWNwTGlzdEVudHJ5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJyA/IE5vdFNlbGVjdGFibGVHcm91cElkIDogMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZUdyb3VwKGUuZWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdzZXJ2ZXItaXRlbScpIHtcblx0XHRcdFx0XHQvLyBNYXJrZXRwbGFjZSBlbnRyaWVzIGFyZSBhbHdheXMgc2VsZWN0YWJsZTsgaW5zdGFsbGVkIHJvd3Mgb25seSBvcGVuXG5cdFx0XHRcdFx0Ly8gZGV0YWlsIHdoZW4gdGhlcmUgaXMgc29tZXRoaW5nIGV4dHJhIHRvIHNob3cgYmV5b25kIHRoZSByb3cuXG5cdFx0XHRcdFx0Y29uc3Qgc2VydmVyID0gZS5lbGVtZW50LnNlcnZlcjtcblx0XHRcdFx0XHRjb25zdCBpc0dhbGxlcnkgPSBlLmVsZW1lbnQubWFya2V0cGxhY2UgfHwgIXNlcnZlci5sb2NhbDtcblx0XHRcdFx0XHRpZiAoaXNHYWxsZXJ5IHx8IHNlcnZlci5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RTZXJ2ZXIuZmlyZShzZXJ2ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuQWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnMoZS5lbGVtZW50LnNlcnZlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYnVpbHRpbi1pdGVtOiBubyBhY3Rpb24gb24gY2xpY2sgKHJlYWQtb25seSlcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY29udGV4dCBtZW51XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSBhcyBJTGlzdENvbnRleHRNZW51RXZlbnQ8SU1jcExpc3RFbnRyeT4pKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gTUNQIHNlcnZpY2UgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEluaXRpYWwgcmVmcmVzaFxuXHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5xdWVyeUdhbGxlcnkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWx0ZXJTZXJ2ZXJzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2Nlc3NTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnNwZWN0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4obWNwQWNjZXNzQ29uZmlnKTtcblx0XHRjb25zdCB2YWx1ZSA9IGluc3BlY3QudmFsdWUgPz8gaW5zcGVjdC5kZWZhdWx0VmFsdWU7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSB2YWx1ZSA9PT0gTWNwQWNjZXNzVmFsdWUuTm9uZTtcblx0XHRjb25zdCBwb2xpY3lMb2NrZWQgPSBpbnNwZWN0LnBvbGljeVZhbHVlID09PSBNY3BBY2Nlc3NWYWx1ZS5Ob25lO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjY2Vzcy1kaXNhYmxlZCcsIGRpc2FibGVkKTtcblxuXHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5kaXNhYmxlZEljb24uY2xhc3NOYW1lID0gJ2VtcHR5LWljb24nO1xuXHRcdFx0dGhpcy5kaXNhYmxlZEljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShwb2xpY3lMb2NrZWQgPyBDb2RpY29uLnNoaWVsZCA6IG1jcFNlcnZlckljb24pKTtcblxuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmRpc2FibGVkTWVzc2FnZSk7XG5cdFx0XHR0aGlzLmRpc2FibGVkTGlua0xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHRpZiAocG9saWN5TG9ja2VkKSB7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21jcEFjY2Vzc0Rpc2FibGVkQnlQb2xpY3knLCBcIkFjY2VzcyB0byBNQ1Agc2VydmVycyBpcyBkaXNhYmxlZCBieSB5b3VyIG9yZ2FuaXphdGlvbi4gQ29udGFjdCB5b3VyIG9yZ2FuaXphdGlvbiBhZG1pbmlzdHJhdG9yIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRNZXNzYWdlLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxvY2FsaXplKCdtY3BBY2Nlc3NEaXNhYmxlZEJ5U2V0dGluZ1ByZWZpeCcsIFwiTUNQIHNlcnZlcnMgYXJlIGRpc2FibGVkIGluIHNldHRpbmdzLiBcIikpKTtcblx0XHRcdFx0Y29uc3QgbGluayA9IERPTS5hcHBlbmQodGhpcy5kaXNhYmxlZE1lc3NhZ2UsICQoJ2EubWNwLWRpc2FibGVkLXNldHRpbmdzLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0XHRcdGxpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWNwQWNjZXNzRGlzYWJsZWRTZXR0aW5nTGluaycsIFwiQ29uZmlndXJlIGluIHNldHRpbmdzLlwiKTtcblx0XHRcdFx0bGluay5ocmVmID0gJyMnO1xuXHRcdFx0XHRsaW5rLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdFx0dGhpcy5kaXNhYmxlZExpbmtMaXN0ZW5lci52YWx1ZSA9IERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCBgQGlkOiR7bWNwQWNjZXNzQ29uZmlnfWApO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd0Jyb3dzZU1hcmtldHBsYWNlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUJyb3dzZU1vZGUodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVCcm93c2VNb2RlKGJyb3dzZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYnJvd3NlTW9kZSA9IGJyb3dzZTtcblx0XHR0aGlzLnNlYXJjaElucHV0LnZhbHVlID0gJyc7XG5cdFx0dGhpcy5zZWFyY2hRdWVyeSA9ICcnO1xuXG5cdFx0Ly8gVXBkYXRlIFVJIGZvciBicm93c2UgdnMgaW5zdGFsbGVkIG1vZGVcblx0XHR0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gYnJvd3NlID8gJycgOiAnbm9uZSc7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0LnNldFBsYWNlSG9sZGVyKGJyb3dzZVxuXHRcdFx0PyBsb2NhbGl6ZSgnc2VhcmNoR2FsbGVyeVBsYWNlaG9sZGVyJywgXCJTZWFyY2ggTUNQIG1hcmtldHBsYWNlLi4uXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdzZWFyY2hNY3BQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIilcblx0XHQpO1xuXG5cdFx0aWYgKGJyb3dzZSkge1xuXHRcdFx0dm9pZCB0aGlzLnF1ZXJ5R2FsbGVyeSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmdhbGxlcnlDdHM/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR0aGlzLmdhbGxlcnlTZXJ2ZXJzID0gW107XG5cdFx0XHR0aGlzLmZpbHRlclNlcnZlcnMoKTtcblx0XHR9XG5cblx0XHQvLyBSZS1sYXlvdXQgdG8gYWNjb3VudCBmb3IgdGhlIGJhY2sgbGluayBoZWlnaHQgY2hhbmdlXG5cdFx0aWYgKHRoaXMubGFzdEhlaWdodCA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGFzdEhlaWdodCwgdGhpcy5sYXN0V2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlHYWxsZXJ5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZ2FsbGVyeUN0cz8uZGlzcG9zZSh0cnVlKTtcblx0XHRjb25zdCBjdHMgPSB0aGlzLmdhbGxlcnlDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdC8vIFNob3cgbG9hZGluZyBzdGF0ZVxuXHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsb2FkaW5nR2FsbGVyeScsIFwiTG9hZGluZyBtYXJrZXRwbGFjZS4uLlwiKTtcblx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5R2FsbGVyeShcblx0XHRcdFx0eyB0ZXh0OiB0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSB8fCB1bmRlZmluZWQgfSxcblx0XHRcdFx0Y3RzLnRva2VuLFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZ2FsbGVyeVNlcnZlcnMgPSBwYWdlci5maXJzdFBhZ2UuaXRlbXM7XG5cdFx0XHR0aGlzLnVwZGF0ZUdhbGxlcnlMaXN0KCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLmdhbGxlcnlTZXJ2ZXJzID0gW107XG5cdFx0XHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2dhbGxlcnlFcnJvcicsIFwiVW5hYmxlIHRvIGxvYWQgbWFya2V0cGxhY2VcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeUFnYWluTGF0ZXInLCBcIkNoZWNrIHlvdXIgY29ubmVjdGlvbiBhbmQgdHJ5IGFnYWluXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlR2FsbGVyeUxpc3QoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZ2FsbGVyeVNlcnZlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGlmICh0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0dhbGxlcnlSZXN1bHRzJywgXCJObyBzZXJ2ZXJzIG1hdGNoICd7MH0nXCIsIHRoaXMuc2VhcmNoUXVlcnkpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0cnlEaWZmZXJlbnRTZWFyY2gnLCBcIlRyeSBhIGRpZmZlcmVudCBzZWFyY2ggdGVybVwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2VtcHR5R2FsbGVyeScsIFwiTm8gTUNQIHNlcnZlcnMgYXZhaWxhYmxlXCIpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXM6IElNY3BMaXN0RW50cnlbXSA9IHRoaXMuZ2FsbGVyeVNlcnZlcnMubWFwKHNlcnZlciA9PiAoeyB0eXBlOiAnc2VydmVyLWl0ZW0nIGFzIGNvbnN0LCBzZXJ2ZXIsIG1hcmtldHBsYWNlOiB0cnVlIH0pKTtcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIGVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJTZXJ2ZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbk1hdGNoZXIgPSBuZXcgQWN0aXZlU2Vzc2lvbk1jcFNlcnZlck1hdGNoZXIodGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5nZXRNY3BTZXJ2ZXJzKGFjdGl2ZVNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGNvbnN0IGxvY2FsU2VydmVyTWF0Y2hlciA9IG5ldyBMb2NhbE1jcFNlcnZlck1hdGNoZXIodGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkpO1xuXG5cdFx0aWYgKHF1ZXJ5KSB7XG5cdFx0XHR0aGlzLmZpbHRlcmVkU2VydmVycyA9IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoc2VydmVyID0+XG5cdFx0XHRcdHNlcnZlci5sYWJlbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fFxuXHRcdFx0XHQoc2VydmVyLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSlcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZmlsdGVyZWRTZXJ2ZXJzID0gWy4uLnRoaXMubWNwV29ya2JlbmNoU2VydmljZS5sb2NhbF07XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCBleHRlbnNpb24tcHJvdmlkZWQgc2VydmVycyBub3QgaW4gdGhlIGxvY2FsIGxpc3QgKGUuZy4gR2l0SHViIE1DUClcblx0XHRjb25zdCBsb2NhbElkcyA9IG5ldyBTZXQodGhpcy5maWx0ZXJlZFNlcnZlcnMubWFwKHMgPT4gcy5pZCkpO1xuXHRcdGNvbnN0IGJ1aWx0aW5TZXJ2ZXJzID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KClcblx0XHRcdC5maWx0ZXIocyA9PiAhbG9jYWxJZHMuaGFzKHMuZGVmaW5pdGlvbi5pZCkpXG5cdFx0XHQuZmlsdGVyKHMgPT4gIXF1ZXJ5IHx8IHMuZGVmaW5pdGlvbi5sYWJlbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSk7XG5cblx0XHRjb25zdCBncm91cHM6IHsgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGU7IGxhYmVsOiBzdHJpbmc7IGljb246IFRoZW1lSWNvbjsgZGVzY3JpcHRpb246IHN0cmluZzsgZW50cmllczogQXJyYXk8SU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5PiB9W10gPSBbXG5cdFx0XHR7IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgbGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2VHcm91cCcsIFwiV29ya3NwYWNlXCIpLCBpY29uOiB3b3Jrc3BhY2VJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZUdyb3VwRGVzY3JpcHRpb24nLCBcIk1DUCBzZXJ2ZXJzIGNvbmZpZ3VyZWQgaW4geW91ciB3b3Jrc3BhY2Ugb3IgcmVwb3J0ZWQgYnkgdGhlIGFjdGl2ZSBzZXNzaW9uLlwiKSwgZW50cmllczogW10gfSxcblx0XHRcdHsgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgbGFiZWw6IGxvY2FsaXplKCd1c2VyR3JvdXAnLCBcIlVzZXJcIiksIGljb246IHVzZXJJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VzZXJHcm91cERlc2NyaXB0aW9uJywgXCJNQ1Agc2VydmVycyBjb25maWd1cmVkIGluIHlvdXIgdXNlciBzZXR0aW5ncy4gUHJpdmF0ZSB0byB5b3UgYW5kIGF2YWlsYWJsZSBhY3Jvc3MgYWxsIHByb2plY3RzLlwiKSwgZW50cmllczogW10gfSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdGhpcy5maWx0ZXJlZFNlcnZlcnMpIHtcblx0XHRcdGNvbnN0IGVudHJ5OiBJTWNwU2VydmVySXRlbUVudHJ5ID0ge1xuXHRcdFx0XHR0eXBlOiAnc2VydmVyLWl0ZW0nLFxuXHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHRcdGFjdGl2ZVNlc3Npb25TZXJ2ZXI6IGFjdGl2ZVNlc3Npb25NYXRjaGVyLnRha2UoZ2V0V29ya2JlbmNoU2VydmVyTWF0Y2hLZXlzKHNlcnZlcikpLFxuXHRcdFx0XHRsb2NhbFNlcnZlcjogbG9jYWxTZXJ2ZXJNYXRjaGVyLmZpbmQoZ2V0V29ya2JlbmNoU2VydmVyTWF0Y2hLZXlzKHNlcnZlcikpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNjb3BlID0gc2VydmVyLmxvY2FsPy5zY29wZTtcblx0XHRcdGlmIChzY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0Z3JvdXBzWzBdLmVudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBVc2VyLCBSZW1vdGVVc2VyLCBvciB1bmtub3duIFx1MjE5MiBncm91cCB1bmRlciBVc2VyXG5cdFx0XHRcdGdyb3Vwc1sxXS5lbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBwbHVnaW4tcHJvdmlkZWQsIGV4dGVuc2lvbi1wcm92aWRlZCwgYW5kIGJ1aWx0LWluIHNlcnZlcnMuXG5cdFx0Ly8gU2VydmVycyBmcm9tIHRoZSBDb3BpbG90IGV4dGVuc2lvbiAoZ2l0aHViLmNvcGlsb3QgLyBnaXRodWIuY29waWxvdC1jaGF0KVxuXHRcdC8vIGFyZSB0cmVhdGVkIGFzIGJ1aWx0LWluOyBzZXJ2ZXJzIGZyb20gb3RoZXIgZXh0ZW5zaW9ucyBnbyB1bmRlciBcIkV4dGVuc2lvbnNcIi5cblx0XHRjb25zdCBjb2xsZWN0aW9uU291cmNlcyA9IG5ldyBNYXAodGhpcy5tY3BSZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5tYXAoYyA9PiBbYy5pZCwgYy5zb3VyY2VdKSk7XG5cdFx0Y29uc3QgcGx1Z2luU2VydmVyczogQXJyYXk8eyBzZXJ2ZXI6IElNY3BTZXJ2ZXI7IGFjdGl2ZVNlc3Npb25TZXJ2ZXI/OiBBZ2VudEhvc3RNY3BTZXJ2ZXIgfT4gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25TZXJ2ZXJzOiBBcnJheTx7IHNlcnZlcjogSU1jcFNlcnZlcjsgYWN0aXZlU2Vzc2lvblNlcnZlcj86IEFnZW50SG9zdE1jcFNlcnZlciB9PiA9IFtdO1xuXHRcdGNvbnN0IG90aGVyQnVpbHRpblNlcnZlcnM6IEFycmF5PHsgc2VydmVyOiBJTWNwU2VydmVyOyBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyIH0+ID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgYnVpbHRpblNlcnZlcnMpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0geyBzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXI6IGFjdGl2ZVNlc3Npb25NYXRjaGVyLnRha2UoZ2V0UnVudGltZVNlcnZlck1hdGNoS2V5cyhzZXJ2ZXIpKSB9O1xuXHRcdFx0Y29uc3Qgc291cmNlID0gY29sbGVjdGlvblNvdXJjZXMuZ2V0KHNlcnZlci5jb2xsZWN0aW9uLmlkKTtcblx0XHRcdGlmIChzZXJ2ZXIuY29sbGVjdGlvbi5pZC5zdGFydHNXaXRoKFBMVUdJTl9DT0xMRUNUSU9OX1BSRUZJWCkpIHtcblx0XHRcdFx0cGx1Z2luU2VydmVycy5wdXNoKGVudHJ5KTtcblx0XHRcdH0gZWxzZSBpZiAoc291cmNlIGluc3RhbmNlb2YgRXh0ZW5zaW9uSWRlbnRpZmllciAmJiAhaXNDb3BpbG90RXh0ZW5zaW9uKHNvdXJjZSkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uU2VydmVycy5wdXNoKGVudHJ5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG90aGVyQnVpbHRpblNlcnZlcnMucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25Pbmx5U2VydmVycyA9IGFjdGl2ZVNlc3Npb25NYXRjaGVyLnVubWF0Y2hlZChxdWVyeSk7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkJ1aWx0aW5FbnRyaWVzID0gY3JlYXRlQnVpbHRpbkFjdGl2ZVNlc3Npb25NY3BFbnRyaWVzKGFjdGl2ZVNlc3Npb25Pbmx5U2VydmVycyk7XG5cblx0XHQvLyBTaG93IGVtcHR5IHN0YXRlIG9ubHkgd2hlbiB0aGVyZSBhcmUgbm8gc2VydmVycyBhdCBhbGwgKG5vdCB3aGVuIGZpbHRlcmVkIHRvIGVtcHR5KVxuXHRcdGlmICh0aGlzLmZpbHRlcmVkU2VydmVycy5sZW5ndGggPT09IDAgJiYgYnVpbHRpblNlcnZlcnMubGVuZ3RoID09PSAwICYmIGFjdGl2ZVNlc3Npb25Pbmx5U2VydmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hRdWVyeS50cmltKCkpIHtcblx0XHRcdFx0Ly8gU2VhcmNoIHdpdGggbm8gcmVzdWx0c1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub01hdGNoaW5nU2VydmVycycsIFwiTm8gc2VydmVycyBtYXRjaCAnezB9J1wiLCB0aGlzLnNlYXJjaFF1ZXJ5KTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBObyBzZXJ2ZXJzIGNvbmZpZ3VyZWRcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9NY3BTZXJ2ZXJzJywgXCJObyBNQ1Agc2VydmVycyBjb25maWd1cmVkXCIpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZGRNY3BTZXJ2ZXInLCBcIkFkZCBhbiBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gZ2V0IHN0YXJ0ZWRcIik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllczogSU1jcExpc3RFbnRyeVtdID0gW107XG5cdFx0bGV0IGlzRmlyc3QgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZEdyb3Vwcy5oYXMoZ3JvdXAuc2NvcGUpO1xuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ2dyb3VwLWhlYWRlcicsXG5cdFx0XHRcdGlkOiBgbWNwLWdyb3VwLSR7Z3JvdXAuc2NvcGV9YCxcblx0XHRcdFx0c2NvcGU6IGdyb3VwLnNjb3BlLFxuXHRcdFx0XHRsYWJlbDogZ3JvdXAubGFiZWwsXG5cdFx0XHRcdGljb246IGdyb3VwLmljb24sXG5cdFx0XHRcdGNvdW50OiBncm91cC5lbnRyaWVzLmxlbmd0aCxcblx0XHRcdFx0aXNGaXJzdCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGdyb3VwLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRjb2xsYXBzZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29sbGFwc2VkKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCguLi5ncm91cC5lbnRyaWVzKTtcblx0XHRcdH1cblx0XHRcdGlzRmlyc3QgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAocGx1Z2luU2VydmVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZEdyb3Vwcy5oYXMoJ3BsdWdpbicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ2dyb3VwLWhlYWRlcicsXG5cdFx0XHRcdGlkOiAnbWNwLWdyb3VwLXBsdWdpbicsXG5cdFx0XHRcdHNjb3BlOiAncGx1Z2luJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwbHVnaW5Hcm91cCcsIFwiUGx1Z2luc1wiKSxcblx0XHRcdFx0aWNvbjogcGx1Z2luSWNvbixcblx0XHRcdFx0Y291bnQ6IHBsdWdpblNlcnZlcnMubGVuZ3RoLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3BsdWdpbkdyb3VwRGVzY3JpcHRpb24nLCBcIk1DUCBzZXJ2ZXJzIHByb3ZpZGVkIGJ5IGluc3RhbGxlZCBwbHVnaW5zLlwiKSxcblx0XHRcdFx0Y29sbGFwc2VkLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbGxhcHNlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgc2VydmVyLCBhY3RpdmVTZXNzaW9uU2VydmVyIH0gb2YgcGx1Z2luU2VydmVycykge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChjcmVhdGVCdWlsdGluRW50cnkoc2VydmVyLCBhY3RpdmVTZXNzaW9uU2VydmVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlzRmlyc3QgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uU2VydmVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZEdyb3Vwcy5oYXMoJ2V4dGVuc2lvbicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ2dyb3VwLWhlYWRlcicsXG5cdFx0XHRcdGlkOiAnbWNwLWdyb3VwLWV4dGVuc2lvbicsXG5cdFx0XHRcdHNjb3BlOiAnZXh0ZW5zaW9uJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25Hcm91cCcsIFwiRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0aWNvbjogZXh0ZW5zaW9uSWNvbixcblx0XHRcdFx0Y291bnQ6IGV4dGVuc2lvblNlcnZlcnMubGVuZ3RoLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbkdyb3VwRGVzY3JpcHRpb24nLCBcIk1DUCBzZXJ2ZXJzIGNvbnRyaWJ1dGVkIGJ5IGluc3RhbGxlZCBWUyBDb2RlIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRjb2xsYXBzZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29sbGFwc2VkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIgfSBvZiBleHRlbnNpb25TZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGNyZWF0ZUJ1aWx0aW5FbnRyeShzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlckJ1aWx0aW5TZXJ2ZXJzLmxlbmd0aCA+IDAgfHwgYWN0aXZlU2Vzc2lvbkJ1aWx0aW5FbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcygnYnVpbHRpbicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ2dyb3VwLWhlYWRlcicsXG5cdFx0XHRcdGlkOiAnbWNwLWdyb3VwLWJ1aWx0aW4nLFxuXHRcdFx0XHRzY29wZTogJ2J1aWx0aW4nLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2J1aWx0SW5Hcm91cCcsIFwiQnVpbHQtaW5cIiksXG5cdFx0XHRcdGljb246IGJ1aWx0aW5JY29uLFxuXHRcdFx0XHRjb3VudDogb3RoZXJCdWlsdGluU2VydmVycy5sZW5ndGggKyBhY3RpdmVTZXNzaW9uQnVpbHRpbkVudHJpZXMubGVuZ3RoLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2J1aWx0SW5Hcm91cERlc2NyaXB0aW9uJywgXCJNQ1Agc2VydmVycyBidWlsdCBpbnRvIFZTIENvZGUuIFRoZXNlIGFyZSBhdmFpbGFibGUgYXV0b21hdGljYWxseS5cIiksXG5cdFx0XHRcdGNvbGxhcHNlZCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFjb2xsYXBzZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IHNlcnZlciwgYWN0aXZlU2Vzc2lvblNlcnZlciB9IG9mIG90aGVyQnVpbHRpblNlcnZlcnMpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goY3JlYXRlQnVpbHRpbkVudHJ5KHNlcnZlciwgYWN0aXZlU2Vzc2lvblNlcnZlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVudHJpZXMucHVzaCguLi5hY3RpdmVTZXNzaW9uQnVpbHRpbkVudHJpZXMpO1xuXHRcdFx0fVxuXHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlzcGxheUVudHJpZXMgPSBlbnRyaWVzO1xuXHRcdHRoaXMubGlzdC5zcGxpY2UoMCwgdGhpcy5saXN0Lmxlbmd0aCwgdGhpcy5kaXNwbGF5RW50cmllcyk7XG5cblx0XHQvLyBDb21wdXRlIHNpZGViYXIgYmFkZ2UgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YSBhcnJheXMgKHNhbWUgc291cmNlIGFzIGdyb3VwIGhlYWRlcnMpXG5cdFx0dGhpcy5maWx0ZXJlZEJ1aWx0aW5Db3VudCA9IGJ1aWx0aW5TZXJ2ZXJzLmxlbmd0aDtcblx0XHR0aGlzLmZpbHRlcmVkQWN0aXZlU2Vzc2lvbkNvdW50ID0gYWN0aXZlU2Vzc2lvbk9ubHlTZXJ2ZXJzLmxlbmd0aDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKHRoaXMuaXRlbUNvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB0b3RhbCBpdGVtIGNvdW50IGZyb20gdGhlIHVuZGVybHlpbmcgZGF0YSBhcnJheXNcblx0ICogKHRoZSBzYW1lIHNvdXJjZSB1c2VkIHRvIGJ1aWxkIGdyb3VwIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmZpbHRlcmVkU2VydmVycy5sZW5ndGggKyB0aGlzLmZpbHRlcmVkQnVpbHRpbkNvdW50ICsgdGhpcy5maWx0ZXJlZEFjdGl2ZVNlc3Npb25Db3VudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1maXJlcyB0aGUgY3VycmVudCBpdGVtIGNvdW50LiBDYWxsIGFmdGVyIHN1YnNjcmliaW5nIHRvIG9uRGlkQ2hhbmdlSXRlbUNvdW50XG5cdCAqIHRvIGVuc3VyZSB0aGUgc3Vic2NyaWJlciByZWNlaXZlcyB0aGUgbGF0ZXN0IGNvdW50LlxuXHQgKi9cblx0ZmlyZUl0ZW1Db3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKHRoaXMuaXRlbUNvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSBjb2xsYXBzZWQgc3RhdGUgb2YgYSBncm91cC5cblx0ICovXG5cdHByaXZhdGUgdG9nZ2xlR3JvdXAoZW50cnk6IElNY3BHcm91cEhlYWRlckVudHJ5KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhlbnRyeS5zY29wZSkpIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmRlbGV0ZShlbnRyeS5zY29wZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmFkZChlbnRyeS5zY29wZSk7XG5cdFx0fVxuXHRcdHRoaXMuZmlsdGVyU2VydmVycygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHdpZGdldCBpcyBjdXJyZW50bHkgaW4gbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUuXG5cdCAqL1xuXHRpc0luQnJvd3NlTW9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VNb2RlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4aXRzIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlIGFuZCByZXR1cm5zIHRvIHRoZSBpbnN0YWxsZWQgc2VydmVycyBsaXN0LlxuXHQgKi9cblx0ZXhpdEJyb3dzZU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0dGhpcy50b2dnbGVCcm93c2VNb2RlKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0cyB0aGUgd2lkZ2V0LlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMubGFzdFdpZHRoID0gd2lkdGg7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0Y29uc3QgYXZhaWxhYmxlSGVpZ2h0ID0gdGhpcy5lbGVtZW50LmNsaWVudEhlaWdodCB8fCBoZWlnaHQ7XG5cdFx0Y29uc3QgYXZhaWxhYmxlV2lkdGggPSB0aGlzLmVsZW1lbnQuY2xpZW50V2lkdGggfHwgd2lkdGg7XG5cblx0XHQvLyBNZWFzdXJlIHNpYmxpbmcgZWxlbWVudHMgdG8gY2FsY3VsYXRlIHRoZSBsaXN0IGhlaWdodC5cblx0XHQvLyBXaGVuIG9mZnNldEhlaWdodCByZXR1cm5zIDAgdGhlIGNvbnRhaW5lciBtYXkgaGF2ZSBqdXN0IGJlY29tZSB2aXNpYmxlXG5cdFx0Ly8gYWZ0ZXIgZGlzcGxheTpub25lIGFuZCB0aGUgYnJvd3NlciBoYXNuJ3QgcmVmbG93ZWQgeWV0IFx1MjAxNCBkZWZlciBsYXlvdXRcblx0XHQvLyBvbmNlIHNvIG1lYXN1cmVtZW50cyBhcmUgYWNjdXJhdGUuIE9ubHkgcmV0cnkgb25jZSB0byBhdm9pZCBhbiBlbmRsZXNzXG5cdFx0Ly8gbG9vcCB3aGVuIHRoZSB3aWRnZXQgaXMgY3JlYXRlZCB3aGlsZSBwZXJtYW5lbnRseSBoaWRkZW4uXG5cdFx0Y29uc3Qgc2VhcmNoQmFySGVpZ2h0ID0gdGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdGlmIChzZWFyY2hCYXJIZWlnaHQgPT09IDAgJiYgIXRoaXMuX2xheW91dERlZmVycmVkKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IHRydWU7XG5cdFx0XHRET00uZ2V0V2luZG93KHRoaXMuZWxlbWVudCkucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdHRoaXMubGFzdEhlYWRlckhlaWdodCA9IGhlYWRlckhlaWdodDtcblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgYXZhaWxhYmxlSGVpZ2h0IC0gc2VhcmNoQmFySGVpZ2h0IC0gaGVhZGVySGVpZ2h0KTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHR0aGlzLmxpc3QubGF5b3V0KGxpc3RIZWlnaHQsIGF2YWlsYWJsZVdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBzZWFyY2ggaW5wdXQuXG5cdCAqL1xuXHRmb2N1c1NlYXJjaCgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xscyB0aGUgbGlzdCBzbyB0aGUgbGFzdCBpdGVtIGlzIHZpc2libGUuXG5cdCAqL1xuXHRyZXZlYWxMYXN0SXRlbSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saXN0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGlzdC5yZXZlYWwodGhpcy5saXN0Lmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBsaXN0LlxuXHQgKi9cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMubGlzdC5sZW5ndGg7XG5cdFx0aWYgKHNlcnZlcnMgPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5BY3RpdmVTZXNzaW9uU2VydmVyT3B0aW9ucyhzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdHZvaWQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsIHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKSwgc2VydmVyLmlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGNvbnRleHQgbWVudSBmb3IgTUNQIHNlcnZlciBpdGVtcy5cblx0ICovXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SU1jcExpc3RFbnRyeT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25BY3Rpb25zID0gZ2V0QWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnNBY3Rpb25zKHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMuYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLCB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCksIGUuZWxlbWVudC5zZXJ2ZXIpO1xuXHRcdFx0YWN0aXZlU2Vzc2lvbkFjdGlvbnMuZm9yRWFjaChhY3Rpb24gPT4gaXNEaXNwb3NhYmxlKGFjdGlvbikgJiYgZGlzcG9zYWJsZXMuYWRkKGFjdGlvbikpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aXZlU2Vzc2lvbkFjdGlvbnMsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbHQtaW4gcm93cyB1c2UgSU1jcFNlcnZpY2UgZm9yIGR1cmFibGUgZW5hYmxlbWVudCBhbmQgdGhlIGFnZW50IGhvc3QgZm9yIHNlc3Npb24gZW5hYmxlbWVudC5cblx0XHRpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdidWlsdGluLWl0ZW0nKSB7XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uSWQgPSBlLmVsZW1lbnQuY29sbGVjdGlvbklkO1xuXHRcdFx0Y29uc3QgcGx1Z2luVXJpU3RyID0gZ2V0UGx1Z2luVXJpRnJvbUNvbGxlY3Rpb25JZChjb2xsZWN0aW9uSWQpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gcGx1Z2luVXJpU3RyID8gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKS5maW5kKHAgPT4gcC51cmkudG9TdHJpbmcoKSA9PT0gcGx1Z2luVXJpU3RyKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpZmVjeWNsZUFjdGlvbiA9IGUuZWxlbWVudC5hY3RpdmVTZXNzaW9uU2VydmVyICE9PSB1bmRlZmluZWQgPyBnZXRBY3RpdmVTZXNzaW9uU2VydmVyTGlmZWN5Y2xlQWN0aW9uKGUuZWxlbWVudC5hY3RpdmVTZXNzaW9uU2VydmVyKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsaWZlY3ljbGVBY3Rpb24pIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVBY3Rpb24pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZWxlbWVudC5sb2NhbFNlcnZlcikge1xuXHRcdFx0XHRjb25zdCBpc0VtcHR5V29ya2JlbmNoID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCkgPT09IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZW5hYmxlbWVudEFjdGlvbnMgPSBnZXRCdWlsdGluTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoXG5cdFx0XHRcdFx0dGhpcy5tY3BTZXJ2aWNlLFxuXHRcdFx0XHRcdGUuZWxlbWVudC5sb2NhbFNlcnZlci5kZWZpbml0aW9uLmlkLFxuXHRcdFx0XHRcdGlzRW1wdHlXb3JrYmVuY2gsXG5cdFx0XHRcdFx0dGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRcdFx0XHR0aGlzLmFnZW50UGx1Z2luU2VydmljZSxcblx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCksXG5cdFx0XHRcdFx0ZS5lbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXIsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChlbmFibGVtZW50QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZW5hYmxlbWVudEFjdGlvbiBvZiBlbmFibGVtZW50QWN0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShlbmFibGVtZW50QWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZW5hYmxlbWVudEFjdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goZW5hYmxlbWVudEFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwbHVnaW4pIHtcblx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGlvbnMucHVzaChkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0XHQnbWNwU2VydmVyLnNob3dQbHVnaW4nLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdzaG93UGx1Z2luJywgXCJTaG93IFBsdWdpblwiKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtID0ge1xuXHRcdFx0XHRcdFx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0bmFtZTogcGx1Z2luLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcGx1Z2luLmZyb21NYXJrZXRwbGFjZT8uZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRcdG1hcmtldHBsYWNlOiBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5tYXJrZXRwbGFjZSxcblx0XHRcdFx0XHRcdFx0cGx1Z2luLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFNob3dQbHVnaW4uZmlyZShpdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCkpKTtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCdtY3BTZXJ2ZXIudW5pbnN0YWxsUGx1Z2luJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndW5pbnN0YWxsUGx1Z2luJywgXCJVbmluc3RhbGwgUGx1Z2luXCIpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1Vbmluc3RhbGxQbHVnaW5NY3AnLCBcIlRoaXMgTUNQIHNlcnZlciBpcyBwcm92aWRlZCBieSB0aGUgcGx1Z2luICd7MH0nXCIsIHBsdWdpbi5sYWJlbCksXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1Vbmluc3RhbGxQbHVnaW5NY3BEZXRhaWwnLCBcIkluZGl2aWR1YWwgTUNQIHNlcnZlcnMgZnJvbSBhIHBsdWdpbiBjYW5ub3QgYmUgcmVtb3ZlZCBzZXBhcmF0ZWx5LiBXb3VsZCB5b3UgbGlrZSB0byB1bmluc3RhbGwgdGhlIGVudGlyZSBwbHVnaW4/XCIpLFxuXHRcdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgndW5pbnN0YWxsUGx1Z2luQnRuJywgXCJVbmluc3RhbGwgUGx1Z2luXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAncXVlc3Rpb24nLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0XHRwbHVnaW4ucmVtb3ZlPy4oKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCkpKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5lbGVtZW50LnR5cGUgIT09ICdzZXJ2ZXItaXRlbScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXJFbnRyeSA9IGUuZWxlbWVudDtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXIgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChsb2NhbCA9PiBsb2NhbC5pZCA9PT0gc2VydmVyRW50cnkuc2VydmVyLmlkKSB8fCBzZXJ2ZXJFbnRyeS5zZXJ2ZXI7XG5cblx0XHQvLyBMb2NhbCBzZXJ2ZXIgYWN0aW9ucyBpbmNsdWRlIFZTIENvZGUtb3duZWQgcHJvZmlsZS93b3Jrc3BhY2UgZW5hYmxlbWVudC5cblx0XHRjb25zdCBncm91cHM6IElBY3Rpb25bXVtdID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1jcFNlcnZlciwgZmFsc2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TZXJ2ZXIgPSBzZXJ2ZXJFbnRyeS5hY3RpdmVTZXNzaW9uU2VydmVyO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25MaWZlY3ljbGVBY3Rpb24gPSBhY3RpdmVTZXNzaW9uU2VydmVyICE9PSB1bmRlZmluZWQgPyBnZXRBY3RpdmVTZXNzaW9uU2VydmVyTGlmZWN5Y2xlQWN0aW9uKGFjdGl2ZVNlc3Npb25TZXJ2ZXIpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFnZW50SG9zdEVuYWJsZW1lbnRBY3Rpb25zID0gYWN0aXZlU2Vzc2lvblNlcnZlciAhPT0gdW5kZWZpbmVkXG5cdFx0XHQ/IGdldEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKHRoaXMuYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLCB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCksIGFjdGl2ZVNlc3Npb25TZXJ2ZXIsIFsnd29ya3NwYWNlJywgJ3Nlc3Npb24nXSlcblx0XHRcdDogW107XG5cdFx0Zm9yIChjb25zdCBtZW51QWN0aW9ucyBvZiBncm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgbWVudUFjdGlvbiBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKG1lbnVBY3Rpb24pKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1lbnVBY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIFthY3RpdmVTZXNzaW9uTGlmZWN5Y2xlQWN0aW9uLCAuLi5hZ2VudEhvc3RFbmFibGVtZW50QWN0aW9uc10pIHtcblx0XHRcdGlmIChhY3Rpb24gJiYgaXNEaXNwb3NhYmxlKGFjdGlvbikpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRTZXJ2ZXJJdGVtQ29udGV4dE1lbnVBY3Rpb25zKGdyb3VwcywgYWN0aXZlU2Vzc2lvblNlcnZlciwgYWN0aXZlU2Vzc2lvbkxpZmVjeWNsZUFjdGlvbiwgYWdlbnRIb3N0RW5hYmxlbWVudEFjdGlvbnMpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsY0FBYyx5QkFBeUI7QUFDN0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQXFFLDRCQUE0QjtBQUNqRyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxzQkFBMkMsb0JBQW9CLHVCQUF1QixtQkFBK0I7QUFDOUgsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkIsOEJBQThCO0FBQ3BFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFFBQWlCLGlCQUFpQjtB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cEI7QUFBQSxNQUNEO0FBRUEsV0FBSyxtQkFBbUIsZ0JBQWdCO0FBQUEsUUFDdkMsV0FBVyxNQUFNLEVBQUU7QUFBQSxRQUNuQixZQUFZLE1BQU1DO0FBQUEsUUFDbEIsUUFBUSxNQUFNRCxhQUFZLFFBQVE7QUFBQSxNQUNuQyxDQUFDO0FBQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxFQUFFLFFBQVEsU0FBUyxlQUFlO0FBQ3JDO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxFQUFFO0FBQ3RCLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLFlBQVksS0FBSyxvQkFBb0IsTUFBTSxLQUFLLFdBQVMsTUFBTSxPQUFPLFlBQVksT0FBTyxFQUFFLEtBQUssWUFBWTtBQUdsSCxVQUFNLFNBQXNCLHNCQUFzQixXQUFXLE9BQU8sS0FBSyxvQkFBb0I7QUFDN0YsVUFBTSxzQkFBc0IsWUFBWTtBQUN4QyxVQUFNLCtCQUErQix3QkFBd0IsU0FBWSxzQ0FBc0MsbUJBQW1CLElBQUk7QUFDdEksVUFBTSw2QkFBNkIsd0JBQXdCLFNBQ3hELHVDQUF1QyxLQUFLLCtCQUErQixLQUFLLG9CQUFvQixLQUFLLDRCQUE0QixzQkFBc0IsSUFBSSxHQUFHLHFCQUFxQixDQUFDLGFBQWEsU0FBUyxDQUFDLElBQy9NLENBQUM7QUFDSixlQUFXLGVBQWUsUUFBUTtBQUNqQyxpQkFBVyxjQUFjLGFBQWE7QUFDckMsWUFBSSxhQUFhLFVBQVUsR0FBRztBQUM3QixzQkFBWSxJQUFJLFVBQVU7QUFBQSxRQUMzQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsZUFBVyxVQUFVLENBQUMsOEJBQThCLEdBQUcsMEJBQTBCLEdBQUc7QUFDbkYsVUFBSSxVQUFVLGFBQWEsTUFBTSxHQUFHO0FBQ25DLG9CQUFZLElBQUksTUFBTTtBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVSxnQ0FBZ0MsUUFBUSxxQkFBcUIsOEJBQThCLDBCQUEwQjtBQUVySSxTQUFLLG1CQUFtQixnQkFBZ0I7QUFBQSxNQUN2QyxXQUFXLE1BQU0sRUFBRTtBQUFBLE1BQ25CLFlBQVksTUFBTTtBQUFBLE1BQ2xCLFFBQVEsTUFBTSxZQUFZLFFBQVE7QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBMTFCYSxnQkFBTjtBQUFBLEVBZ0RKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTlEVTsiLAogICJuYW1lcyI6IFsic2VydmVyIiwgImRpc3Bvc2FibGVzIiwgImFjdGlvbnMiXQp9Cg==
