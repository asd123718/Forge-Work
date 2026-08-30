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
import "./media/openInAgents.css";
import { $, append } from "../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ToggleTitleBarConfigAction } from "../../../../browser/parts/titlebar/titlebarActions.js";
import { CHAT_CATEGORY } from "../../browser/actions/chatActions.js";
import { IChatWidgetService } from "../../browser/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { SessionType } from "../../common/chatSessionsService.js";
import { getChatSessionType, isUntitledChatSession } from "../../common/model/chatUri.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "../../browser/widget/input/chatInputNotificationService.js";
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID, ChatConfiguration } from "../../common/constants.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { AgentsWindowOpenSource } from "../../../../../platform/window/common/window.js";
import { AICustomizationManagementCommands } from "../../browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationManagementSection } from "../../common/aiCustomizationWorkspaceService.js";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE = localize2("openWorkspaceInAgentsWindow", "Open Codex Settings");
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID = "workbench.action.chat.openWorkspaceInAgentsWindow.chatTitle";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID = "workbench.action.chat.openWorkspaceInAgentsWindow.titleBar";
async function openCodexSettings(accessor) {
  await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, {
    section: AICustomizationManagementSection.HarnessSettings,
    sessionType: SessionType.AgentHostCodex
  });
}
class OpenWorkspaceInAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: true
    });
  }
  async run(accessor) {
    await openCodexSettings(accessor);
  }
}
class OpenWorkspaceInAgentsWindowChatTitleAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: {
        id: MenuId.ChatTitleBarMenu,
        group: "c_sessions",
        order: 1,
        when: OPEN_AGENTS_WINDOW_PRECONDITION
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.ChatTitleBar });
  }
}
class OpenWorkspaceInAgentsWindowTitleBarAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: {
        id: MenuId.TitleBarAdjacentCenter,
        order: -1e3,
        when: ContextKeyExpr.and(
          OPEN_AGENTS_WINDOW_PRECONDITION,
          ContextKeyExpr.notEquals(`config.${ChatConfiguration.TitleBarOpenInAgentsWindowEnabled}`, false)
        )
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.TitleBar });
  }
}
class ToggleOpenInAgentsWindowTitleBarAction extends ToggleTitleBarConfigAction {
  constructor() {
    super(
      ChatConfiguration.TitleBarOpenInAgentsWindowEnabled,
      localize("toggle.openInAgentsWindow", "Open Codex Settings"),
      localize("toggle.openInAgentsWindowDescription", "Toggle visibility of the Open Codex Settings button in the title bar"),
      6,
      OPEN_AGENTS_WINDOW_PRECONDITION
    );
  }
}
class OpenAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: OPEN_AGENTS_WINDOW_COMMAND_ID,
      title: localize2("openAgentsWindow", "Open Codex Settings"),
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: true,
      keybinding: [{
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.toNegated()),
        args: { source: AgentsWindowOpenSource.KeyboardShortcut }
      }, {
        // In screen reader mode, Cmd/Ctrl+Shift+A conflicts with many screen reader keybindings,
        // so require an additional Alt modifier.
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED),
        args: { source: AgentsWindowOpenSource.KeyboardShortcut }
      }]
    });
  }
  async run(accessor) {
    await openCodexSettings(accessor);
  }
}
const _OpenChatSessionInAgentsWindowAction = class _OpenChatSessionInAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: _OpenChatSessionInAgentsWindowAction.ID,
      title: localize2("openSessionInAgentsWindow", "Open Codex Settings"),
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: [{
        id: MenuId.ChatTitleBarMenu,
        group: "c_sessions",
        order: 0,
        when: ContextKeyExpr.and(
          OPEN_AGENTS_WINDOW_PRECONDITION,
          ContextKeyExpr.or(
            ChatContextKeys.chatSessionType.isEqualTo(SessionType.CopilotCLI),
            ChatContextKeys.chatSessionType.isEqualTo(SessionType.AgentHostCopilot)
          )
        )
      }]
    });
  }
  async run(accessor) {
    await openCodexSettings(accessor);
  }
};
_OpenChatSessionInAgentsWindowAction.ID = "workbench.action.chat.openSessionInAgentsWindow";
let OpenChatSessionInAgentsWindowAction = _OpenChatSessionInAgentsWindowAction;
let OpenWorkspaceInAgentsTitleBarWidget = class extends BaseActionViewItem {
  constructor(action, options, hoverService, keybindingService) {
    super(void 0, action, options);
    this.hoverService = hoverService;
    this.keybindingService = keybindingService;
  }
  render(container) {
    super.render(container);
    container.classList.add("open-in-agents-titlebar-widget");
    container.setAttribute("role", "button");
    const label = this.action.label;
    const hoverText = this.keybindingService.appendKeybinding(localize("openInAgentsHover", "Open Codex Settings"), OPEN_AGENTS_WINDOW_COMMAND_ID);
    container.setAttribute("aria-label", hoverText);
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), container, hoverText));
    const icon = append(container, $("span.open-in-agents-titlebar-widget-icon"));
    icon.setAttribute("aria-hidden", "true");
    const labelEl = append(container, $("span.open-in-agents-titlebar-widget-label"));
    labelEl.textContent = label;
  }
};
OpenWorkspaceInAgentsTitleBarWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IKeybindingService)
], OpenWorkspaceInAgentsTitleBarWidget);
let OpenWorkspaceInAgentsContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, contextKeyService, productService) {
    super();
    this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID, (action, options) => {
      return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
    }, void 0));
  }
};
OpenWorkspaceInAgentsContribution.ID = "workbench.contrib.openWorkspaceInAgents.desktop";
OpenWorkspaceInAgentsContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IProductService)
], OpenWorkspaceInAgentsContribution);
var AgentsHandoffTipMode = /* @__PURE__ */ ((AgentsHandoffTipMode2) => {
  AgentsHandoffTipMode2["Hidden"] = "hidden";
  AgentsHandoffTipMode2["Default"] = "default";
  AgentsHandoffTipMode2["Custom"] = "custom";
  return AgentsHandoffTipMode2;
})(AgentsHandoffTipMode || {});
let AgentsHandoffInputTipContribution = class extends Disposable {
  constructor(_chatWidgetService, _notificationService, contextKeyService, _workspaceContextService, _telemetryService, _configurationService) {
    super();
    this._chatWidgetService = _chatWidgetService;
    this._notificationService = _notificationService;
    this._workspaceContextService = _workspaceContextService;
    this._telemetryService = _telemetryService;
    this._configurationService = _configurationService;
    /**
     * Set once the user dismisses (X) or opens the tip. Suppresses the tip for
     * the rest of this window's lifetime — intentionally in-memory only, so it
     * shows again the next time VS Code is reopened.
     */
    this._dismissedForWindow = false;
    this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID, (accessor, ...args) => {
      this._logTipAction("open");
      this._dismissForWindow();
      return accessor.get(ICommandService).executeCommand(OpenChatSessionInAgentsWindowAction.ID, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatHandoff }, ...args);
    }));
    this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID, () => {
      this._logTipAction("mute");
      this._dismissForWindow();
      return this._configurationService.updateValue(ChatConfiguration.AgentsHandoffTipMode, "hidden" /* Hidden */);
    }));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._update()));
    this._register(this._chatWidgetService.onDidAddWidget(() => this._update()));
    this._register(contextKeyService.onDidChangeContext(() => this._update()));
    this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentsHandoffTipMode)) {
        this._lastPostedFor = void 0;
        this._update();
      }
    }));
    this._register(this._notificationService.onDidDismiss((id) => {
      if (id !== AgentsHandoffInputTipContribution.NOTIFICATION_ID) {
        return;
      }
      this._logTipAction("dismiss");
      this._dismissForWindow();
    }));
    this._update();
  }
  /** Log a user interaction (open, dismiss, mute) with the handoff tip. */
  _logTipAction(action) {
    this._telemetryService.publicLog2("chat.agentsHandoffTip.action", {
      action,
      mode: this._getMode(),
      sessionType: this._lastPostedSessionType ?? ""
    });
  }
  _getMode() {
    const value = this._configurationService.getValue(ChatConfiguration.AgentsHandoffTipMode);
    switch (value) {
      case "hidden" /* Hidden */:
      case "custom" /* Custom */:
        return value;
      default:
        return "default" /* Default */;
    }
  }
  _update() {
    const mode = this._getMode();
    if (mode === "hidden" /* Hidden */ || this._dismissedForWindow) {
      if (this._lastPostedFor) {
        this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
        this._lastPostedFor = void 0;
      }
      return;
    }
    const widget = this._chatWidgetService.lastFocusedWidget;
    const sessionResource = widget?.viewModel?.sessionResource;
    const resourceSessionType = sessionResource ? getChatSessionType(sessionResource) : void 0;
    const preconditionMet = widget?.scopedContextKeyService.contextMatchesRules(OPEN_AGENTS_WINDOW_PRECONDITION) ?? false;
    const eligible = preconditionMet && !!sessionResource && !!resourceSessionType && AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES.has(resourceSessionType) && !isUntitledChatSession(sessionResource);
    const widgetSessionType = widget?.scopedContextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key);
    const isEmptyWorkspace = this._workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
    const emptyWorkspaceEligible = preconditionMet && isEmptyWorkspace && (!sessionResource || isUntitledChatSession(sessionResource)) && widgetSessionType === SessionType.AgentHostCopilot;
    if (!eligible && !emptyWorkspaceEligible) {
      if (this._lastPostedFor) {
        this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
        this._lastPostedFor = void 0;
      }
      return;
    }
    const key = eligible && sessionResource ? sessionResource.toString() : AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY;
    if (this._lastPostedFor === key) {
      return;
    }
    this._lastPostedFor = key;
    this._lastPostedSessionType = eligible ? resourceSessionType : widgetSessionType;
    const commandArgs = eligible && sessionResource ? [sessionResource] : [];
    const useEmptyWorkspaceCopy = emptyWorkspaceEligible && !eligible;
    const message = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.emptyWorkspace.message", "Copilot isn't available without an open folder") : localize("chat.agentsHandoff.tip.message", "Configure this session in Codex Settings");
    const description = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.emptyWorkspace.description", "Open Codex Settings to configure the agent runtime.") : mode === "custom" /* Custom */ ? localize("chat.agentsHandoff.tip.description.copilot", "Free with your Copilot plan \u2014 get a dedicated, multi-pane view alongside your workspace.") : localize("chat.agentsHandoff.tip.description", "Get a dedicated, multi-pane view alongside your workspace.");
    const actionLabel = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.action", "Open Codex Settings") : mode === "custom" /* Custom */ ? localize("chat.agentsHandoff.tip.action.custom", "Give your agent more room?") : localize("chat.agentsHandoff.tip.action.default", "Open Codex Settings");
    this._notificationService.setNotification({
      id: AgentsHandoffInputTipContribution.NOTIFICATION_ID,
      severity: ChatInputNotificationSeverity.Info,
      message,
      description,
      actions: [
        {
          kind: ChatInputNotificationActionKind.Command,
          label: actionLabel,
          commandId: AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID,
          commandArgs
        }
      ],
      dismissible: true,
      autoDismissOnMessage: false,
      mute: {
        commandId: AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID,
        tooltip: localize("chat.agentsHandoff.tip.mute", "Don't Show Again")
      },
      sessionTypes: useEmptyWorkspaceCopy ? [SessionType.AgentHostCopilot] : Array.from(AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES)
    });
  }
  /**
   * Mark the tip as handled (dismissed or opened) for the rest of this
   * window's lifetime and tear down any currently posted notification.
   */
  _dismissForWindow() {
    if (this._dismissedForWindow) {
      return;
    }
    this._dismissedForWindow = true;
    this._update();
  }
};
AgentsHandoffInputTipContribution.ID = "workbench.contrib.agentsHandoffInputTip";
AgentsHandoffInputTipContribution.NOTIFICATION_ID = "chat.agentsHandoff.openInAgentsWindow";
/**
 * Dedicated command backing the tip's action button. Lets us attach
 * mode + harness telemetry to the exact tip click (the title-bar menu
 * entry runs {@link OpenChatSessionInAgentsWindowAction} directly and is
 * intentionally not tracked here).
 */
AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID = "workbench.action.chat.agentsHandoffTip.open";
/**
 * Dedicated command backing the tip's "Don't Show Again" button. Closes the
 * tip and flips {@link ChatConfiguration.AgentsHandoffTipMode} to `hidden`
 * so it never shows again.
 */
AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID = "workbench.action.chat.agentsHandoffTip.mute";
/** Session types eligible for the handoff tip — the same set the Agents window can render directly. */
AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES = /* @__PURE__ */ new Set([SessionType.CopilotCLI, SessionType.AgentHostCopilot]);
/** Pseudo-key used as the {@link _lastPostedFor} value for the empty-workspace tip (no real session URI exists). */
AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY = "__empty-workspace__";
AgentsHandoffInputTipContribution = __decorateClass([
  __decorateParam(0, IChatWidgetService),
  __decorateParam(1, IChatInputNotificationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IConfigurationService)
], AgentsHandoffInputTipContribution);
export {
  AgentsHandoffInputTipContribution,
  AgentsHandoffTipMode,
  OpenAgentsWindowAction,
  OpenChatSessionInAgentsWindowAction,
  OpenWorkspaceInAgentsContribution,
  OpenWorkspaceInAgentsWindowAction,
  OpenWorkspaceInAgentsWindowChatTitleAction,
  OpenWorkspaceInAgentsWindowTitleBarAction,
  ToggleOpenInAgentsWindowTitleBarAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCAnLi9tZWRpYS9vcGVuSW5BZ2VudHMuY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgVG9nZ2xlVGl0bGVCYXJDb25maWdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3RpdGxlYmFyL3RpdGxlYmFyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLCBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCwgT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTiwgT1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuXG5jb25zdCBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX1RJVExFID0gbG9jYWxpemUyKCdvcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3cnLCBcIk9wZW4gQ29kZXggU2V0dGluZ3NcIik7XG5jb25zdCBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NIQVRfVElUTEVfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93LmNoYXRUaXRsZSc7XG5jb25zdCBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX1RJVExFX0JBUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3cudGl0bGVCYXInO1xuXG5hc3luYyBmdW5jdGlvbiBvcGVuQ29kZXhTZXR0aW5ncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3BlbkVkaXRvciwge1xuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhhcm5lc3NTZXR0aW5ncyxcblx0XHRzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXgsXG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgT3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19USVRMRSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBvcGVuQ29kZXhTZXR0aW5ncyhhY2Nlc3Nvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvd0NoYXRUaXRsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19DSEFUX1RJVExFX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19USVRMRSxcblx0XHRcdHByZWNvbmRpdGlvbjogT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRncm91cDogJ2Nfc2Vzc2lvbnMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsIHsgc291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLkNoYXRUaXRsZUJhciB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93VGl0bGVCYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEVfQkFSX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19USVRMRSxcblx0XHRcdHByZWNvbmRpdGlvbjogT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UaXRsZUJhckFkamFjZW50Q2VudGVyLFxuXHRcdFx0XHRvcmRlcjogLTEwMDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJPcGVuSW5BZ2VudHNXaW5kb3dFbmFibGVkfWAsIGZhbHNlKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsIHsgc291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLlRpdGxlQmFyIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVPcGVuSW5BZ2VudHNXaW5kb3dUaXRsZUJhckFjdGlvbiBleHRlbmRzIFRvZ2dsZVRpdGxlQmFyQ29uZmlnQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcihcblx0XHRcdENoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyT3BlbkluQWdlbnRzV2luZG93RW5hYmxlZCxcblx0XHRcdGxvY2FsaXplKCd0b2dnbGUub3BlbkluQWdlbnRzV2luZG93JywgJ09wZW4gQ29kZXggU2V0dGluZ3MnKSxcblx0XHRcdGxvY2FsaXplKCd0b2dnbGUub3BlbkluQWdlbnRzV2luZG93RGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB2aXNpYmlsaXR5IG9mIHRoZSBPcGVuIENvZGV4IFNldHRpbmdzIGJ1dHRvbiBpbiB0aGUgdGl0bGUgYmFyXCIpLFxuXHRcdFx0Nixcblx0XHRcdE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbkFnZW50c1dpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQWdlbnRzV2luZG93JywgXCJPcGVuIENvZGV4IFNldHRpbmdzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlBLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0YXJnczogeyBzb3VyY2U6IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuS2V5Ym9hcmRTaG9ydGN1dCB9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHQvLyBJbiBzY3JlZW4gcmVhZGVyIG1vZGUsIENtZC9DdHJsK1NoaWZ0K0EgY29uZmxpY3RzIHdpdGggbWFueSBzY3JlZW4gcmVhZGVyIGtleWJpbmRpbmdzLFxuXHRcdFx0XHQvLyBzbyByZXF1aXJlIGFuIGFkZGl0aW9uYWwgQWx0IG1vZGlmaWVyLlxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUEsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQpLFxuXHRcdFx0XHRhcmdzOiB7IHNvdXJjZTogQWdlbnRzV2luZG93T3BlblNvdXJjZS5LZXlib2FyZFNob3J0Y3V0IH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IG9wZW5Db2RleFNldHRpbmdzKGFjY2Vzc29yKTtcblx0fVxufVxuXG4vKipcbiAqIE9wZW5zIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbiBpbnNpZGUgdGhlIEFnZW50cyB3aW5kb3cuIFZpc2libGUgb25seSB3aGVuXG4gKiB0aGUgYWN0aXZlIGNoYXQgaXMgYSBmaXJzdC1wYXJ0eSBhZ2VudC1ob3N0IHNlc3Npb24gKENvcGlsb3QgQ0xJIHRvZGF5KVxuICogc2luY2UgdGhvc2UgYXJlIHRoZSBzZXNzaW9uIHR5cGVzIHRoZSBBZ2VudHMgd2luZG93IGNhbiByZW5kZXIgZGlyZWN0bHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBPcGVuQ2hhdFNlc3Npb25JbkFnZW50c1dpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblNlc3Npb25JbkFnZW50c1dpbmRvdyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5DaGF0U2Vzc2lvbkluQWdlbnRzV2luZG93QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblNlc3Npb25JbkFnZW50c1dpbmRvdycsIFwiT3BlbiBDb2RleCBTZXR0aW5nc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRncm91cDogJ2Nfc2Vzc2lvbnMnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhTZXNzaW9uVHlwZS5Db3BpbG90Q0xJKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IG9wZW5Db2RleFNldHRpbmdzKGFjY2Vzc29yKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIFwiT3BlbiBDb2RleCBTZXR0aW5nc1wiIHRpdGxlYmFyIGVudHJ5IGFzIGFuIGljb24tb25seSBidXR0b24gdGhhdFxuICogZXhwYW5kcyB0byByZXZlYWwgYSBsYWJlbCBvbiBob3ZlciAvIGtleWJvYXJkIGZvY3VzLlxuICovXG5jbGFzcyBPcGVuV29ya3NwYWNlSW5BZ2VudHNUaXRsZUJhcldpZGdldCBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ29wZW4taW4tYWdlbnRzLXRpdGxlYmFyLXdpZGdldCcpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuYWN0aW9uLmxhYmVsO1xuXHRcdGNvbnN0IGhvdmVyVGV4dCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhsb2NhbGl6ZSgnb3BlbkluQWdlbnRzSG92ZXInLCBcIk9wZW4gQ29kZXggU2V0dGluZ3NcIiksIE9QRU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lEKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgaG92ZXJUZXh0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBjb250YWluZXIsIGhvdmVyVGV4dCkpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4ub3Blbi1pbi1hZ2VudHMtdGl0bGViYXItd2lkZ2V0LWljb24nKSk7XG5cdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGxhYmVsRWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLm9wZW4taW4tYWdlbnRzLXRpdGxlYmFyLXdpZGdldC1sYWJlbCcpKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIub3BlbldvcmtzcGFjZUluQWdlbnRzLmRlc2t0b3AnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsIE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEVfQkFSX0NPTU1BTkRfSUQsIChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGVuV29ya3NwYWNlSW5BZ2VudHNUaXRsZUJhcldpZGdldCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9LCB1bmRlZmluZWQpKTtcblx0fVxufVxuXG4vKipcbiAqIERpc3BsYXkgbW9kZXMgZm9yIHRoZSBhZ2VudHMtd2luZG93IGhhbmRvZmYgaW5wdXQgdGlwLCBleHBvc2VkIHZpYSB0aGVcbiAqIHtAbGluayBDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZX0gc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRzSGFuZG9mZlRpcE1vZGUge1xuXHQvKiogRG9uJ3Qgc2hvdyB0aGUgdGlwLiAqL1xuXHRIaWRkZW4gPSAnaGlkZGVuJyxcblx0LyoqIFNob3cgdGhlIHRpcCB3aXRoIHRoZSBkZWZhdWx0IG1lc3NhZ2UgKyBkZXNjcmlwdGlvbi4gKi9cblx0RGVmYXVsdCA9ICdkZWZhdWx0Jyxcblx0LyoqIFNob3cgdGhlIHRpcCB3aXRoIHRoZSBhbHRlcm5hdGUgXCJGcmVlIHdpdGggeW91ciBDb3BpbG90XCIgZnJhbWluZy4gKi9cblx0Q3VzdG9tID0gJ2N1c3RvbScsXG59XG5cbnR5cGUgQWdlbnRzSGFuZG9mZlRpcEFjdGlvbkV2ZW50ID0ge1xuXHRhY3Rpb246IHN0cmluZztcblx0bW9kZTogc3RyaW5nO1xuXHRzZXNzaW9uVHlwZTogc3RyaW5nO1xufTtcblxudHlwZSBBZ2VudHNIYW5kb2ZmVGlwQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doaWNoIHRpcCBhZmZvcmRhbmNlIHRoZSB1c2VyIGFjdGl2YXRlZDogb3BlbiwgZGlzbWlzcywgb3IgbXV0ZS4nIH07XG5cdG1vZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uZmlndXJlZCB0aXAgbW9kZSBhY3RpdmUgd2hlbiB0aGUgdGlwIHdhcyBjbGlja2VkIChkZWZhdWx0LCBjdXN0b20pLicgfTtcblx0c2Vzc2lvblR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY2hhdCBzZXNzaW9uIHR5cGUgLyBhZ2VudCBoYXJuZXNzIGJlaW5nIGhhbmRlZCBvZmYgKGUuZy4gY29waWxvdC1jbGksIGFnZW50LWhvc3QtY29waWxvdCkuJyB9O1xuXHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNlciBpbnRlcmFjdGlvbnMgKG9wZW4sIGRpc21pc3MsIG11dGUpIHdpdGggdGhlIGFnZW50cy13aW5kb3cgaGFuZG9mZiBpbnB1dCB0aXAgdG8gbWVhc3VyZSBlbmdhZ2VtZW50IGFjcm9zcyB3b3JkaW5nIHZhcmlhbnRzLic7XG59O1xuXG4vKipcbiAqIFBvc3RzIGEgdGlwIG5vdGlmaWNhdGlvbiBhYm92ZSB0aGUgY2hhdCBpbnB1dCB3aGVuZXZlciB0aGUgZm9jdXNlZCBjaGF0XG4gKiB3aWRnZXQgaXMgc2hvd2luZyBhIGNvbnRyaWJ1dGVkIHNlc3Npb24gKENvcGlsb3QgQ0xJLCBDbG91ZCwgQ2xhdWRlLCBldGMuKVxuICogdGhhdCB0aGUgQWdlbnRzIFdpbmRvdyBjYW4gcmVuZGVyIGRpcmVjdGx5LiBUaGUgbm90aWZpY2F0aW9uIHByb3ZpZGVzIGFcbiAqIG9uZS1jbGljayBidXR0b24gdG8gaGFuZCBvZmYgdGhlIGN1cnJlbnQgc2Vzc2lvbiB0byB0aGUgQWdlbnRzIFdpbmRvdy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzSGFuZG9mZklucHV0VGlwJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBOT1RJRklDQVRJT05fSUQgPSAnY2hhdC5hZ2VudHNIYW5kb2ZmLm9wZW5JbkFnZW50c1dpbmRvdyc7XG5cblx0LyoqXG5cdCAqIERlZGljYXRlZCBjb21tYW5kIGJhY2tpbmcgdGhlIHRpcCdzIGFjdGlvbiBidXR0b24uIExldHMgdXMgYXR0YWNoXG5cdCAqIG1vZGUgKyBoYXJuZXNzIHRlbGVtZXRyeSB0byB0aGUgZXhhY3QgdGlwIGNsaWNrICh0aGUgdGl0bGUtYmFyIG1lbnVcblx0ICogZW50cnkgcnVucyB7QGxpbmsgT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dBY3Rpb259IGRpcmVjdGx5IGFuZCBpc1xuXHQgKiBpbnRlbnRpb25hbGx5IG5vdCB0cmFja2VkIGhlcmUpLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVElQX09QRU5fQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYWdlbnRzSGFuZG9mZlRpcC5vcGVuJztcblxuXHQvKipcblx0ICogRGVkaWNhdGVkIGNvbW1hbmQgYmFja2luZyB0aGUgdGlwJ3MgXCJEb24ndCBTaG93IEFnYWluXCIgYnV0dG9uLiBDbG9zZXMgdGhlXG5cdCAqIHRpcCBhbmQgZmxpcHMge0BsaW5rIENoYXRDb25maWd1cmF0aW9uLkFnZW50c0hhbmRvZmZUaXBNb2RlfSB0byBgaGlkZGVuYFxuXHQgKiBzbyBpdCBuZXZlciBzaG93cyBhZ2Fpbi5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRJUF9NVVRFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFnZW50c0hhbmRvZmZUaXAubXV0ZSc7XG5cblx0LyoqIFNlc3Npb24gdHlwZXMgZWxpZ2libGUgZm9yIHRoZSBoYW5kb2ZmIHRpcCBcdTIwMTQgdGhlIHNhbWUgc2V0IHRoZSBBZ2VudHMgd2luZG93IGNhbiByZW5kZXIgZGlyZWN0bHkuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMSUdJQkxFX1NFU1NJT05fVFlQRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90XSk7XG5cblx0LyoqIFBzZXVkby1rZXkgdXNlZCBhcyB0aGUge0BsaW5rIF9sYXN0UG9zdGVkRm9yfSB2YWx1ZSBmb3IgdGhlIGVtcHR5LXdvcmtzcGFjZSB0aXAgKG5vIHJlYWwgc2Vzc2lvbiBVUkkgZXhpc3RzKS4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRU1QVFlfV09SS1NQQUNFX0tFWSA9ICdfX2VtcHR5LXdvcmtzcGFjZV9fJztcblxuXHQvKiogVGhlIGtleSAoc2Vzc2lvbiBVUkkgb3Ige0BsaW5rIEVNUFRZX1dPUktTUEFDRV9LRVl9KSB3ZSBsYXN0IHBvc3RlZCBhIG5vdGlmaWNhdGlvbiBmb3IuIFVzZWQgdG8gYXZvaWQgcmVkdW5kYW50bHkgcmUtcG9zdGluZyB0aGUgdGlwIHdoZW4gdGhlIHNhbWUgc3RhdGUgaXMgcmUtZXZhbHVhdGVkLiAqL1xuXHRwcml2YXRlIF9sYXN0UG9zdGVkRm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFRoZSBzZXNzaW9uIHR5cGUgKGFnZW50IGhhcm5lc3MpIG9mIHRoZSBjdXJyZW50bHkgcG9zdGVkIHRpcCwgZm9yIHRlbGVtZXRyeS4gKi9cblx0cHJpdmF0ZSBfbGFzdFBvc3RlZFNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldCBvbmNlIHRoZSB1c2VyIGRpc21pc3NlcyAoWCkgb3Igb3BlbnMgdGhlIHRpcC4gU3VwcHJlc3NlcyB0aGUgdGlwIGZvclxuXHQgKiB0aGUgcmVzdCBvZiB0aGlzIHdpbmRvdydzIGxpZmV0aW1lIFx1MjAxNCBpbnRlbnRpb25hbGx5IGluLW1lbW9yeSBvbmx5LCBzbyBpdFxuXHQgKiBzaG93cyBhZ2FpbiB0aGUgbmV4dCB0aW1lIFZTIENvZGUgaXMgcmVvcGVuZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNtaXNzZWRGb3JXaW5kb3cgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5USVBfT1BFTl9DT01NQU5EX0lELCAoYWNjZXNzb3IsIC4uLmFyZ3MpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1RpcEFjdGlvbignb3BlbicpO1xuXHRcdFx0Ly8gT3BlbmluZyB0aGUgdGlwIGNvdW50cyBhcyBoYW5kbGluZyBpdDogZG9uJ3Qgc2hvdyBpdCBhZ2FpbiB0aGlzIHdpbmRvdy5cblx0XHRcdHRoaXMuX2Rpc21pc3NGb3JXaW5kb3coKTtcblx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChPcGVuQ2hhdFNlc3Npb25JbkFnZW50c1dpbmRvd0FjdGlvbi5JRCwgeyBhZ2VudHNXaW5kb3dPcGVuU291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLkNoYXRIYW5kb2ZmIH0sIC4uLmFyZ3MpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5USVBfTVVURV9DT01NQU5EX0lELCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dUaXBBY3Rpb24oJ211dGUnKTtcblx0XHRcdC8vIFRlYXIgZG93biB0aGUgdmlzaWJsZSB0aXAgZmlyc3QgKHVzZXMgdGhlIHN0aWxsLXZhbGlkIGBfbGFzdFBvc3RlZEZvcmApLFxuXHRcdFx0Ly8gdGhlbiBwZXJzaXN0IGBoaWRkZW5gIHNvIGl0IG5ldmVyIHNob3dzIGFnYWluLlxuXHRcdFx0dGhpcy5fZGlzbWlzc0ZvcldpbmRvdygpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLkFnZW50c0hhbmRvZmZUaXBNb2RlLCBBZ2VudHNIYW5kb2ZmVGlwTW9kZS5IaWRkZW4pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24oKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZSkpIHtcblx0XHRcdFx0Ly8gTW9kZSBjaGFuZ2VkOiBmb3JjZSBhIHJlLXBvc3Qgc28gdGhlIGRlc2NyaXB0aW9uIHN3YXBzIG9yIHRoZVxuXHRcdFx0XHQvLyB0aXAgYXBwZWFycy9kaXNhcHBlYXJzIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5vbkRpZERpc21pc3MoaWQgPT4ge1xuXHRcdFx0aWYgKGlkICE9PSBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uTk9USUZJQ0FUSU9OX0lEKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1RpcEFjdGlvbignZGlzbWlzcycpO1xuXHRcdFx0dGhpcy5fZGlzbWlzc0ZvcldpbmRvdygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0LyoqIExvZyBhIHVzZXIgaW50ZXJhY3Rpb24gKG9wZW4sIGRpc21pc3MsIG11dGUpIHdpdGggdGhlIGhhbmRvZmYgdGlwLiAqL1xuXHRwcml2YXRlIF9sb2dUaXBBY3Rpb24oYWN0aW9uOiAnb3BlbicgfCAnZGlzbWlzcycgfCAnbXV0ZScpOiB2b2lkIHtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRzSGFuZG9mZlRpcEFjdGlvbkV2ZW50LCBBZ2VudHNIYW5kb2ZmVGlwQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdjaGF0LmFnZW50c0hhbmRvZmZUaXAuYWN0aW9uJywge1xuXHRcdFx0YWN0aW9uLFxuXHRcdFx0bW9kZTogdGhpcy5fZ2V0TW9kZSgpLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHRoaXMuX2xhc3RQb3N0ZWRTZXNzaW9uVHlwZSA/PyAnJyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vZGUoKTogQWdlbnRzSGFuZG9mZlRpcE1vZGUge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZSk7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBBZ2VudHNIYW5kb2ZmVGlwTW9kZS5IaWRkZW46XG5cdFx0XHRjYXNlIEFnZW50c0hhbmRvZmZUaXBNb2RlLkN1c3RvbTpcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIEFnZW50c0hhbmRvZmZUaXBNb2RlLkRlZmF1bHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9nZXRNb2RlKCk7XG5cblx0XHQvLyBTdXBwcmVzcyB0aGUgdGlwIGVudGlyZWx5IHdoZW4gdGhlIG1vZGUgaGlkZXMgaXQsIG9yIG9uY2UgdGhlIHVzZXIgaGFzXG5cdFx0Ly8gZGlzbWlzc2VkL29wZW5lZCBpdCBmb3IgdGhpcyB3aW5kb3cuXG5cdFx0aWYgKG1vZGUgPT09IEFnZW50c0hhbmRvZmZUaXBNb2RlLkhpZGRlbiB8fCB0aGlzLl9kaXNtaXNzZWRGb3JXaW5kb3cpIHtcblx0XHRcdGlmICh0aGlzLl9sYXN0UG9zdGVkRm9yKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZGVsZXRlTm90aWZpY2F0aW9uKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5OT1RJRklDQVRJT05fSUQpO1xuXHRcdFx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgcmVzb3VyY2VTZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbk1ldCA9IHdpZGdldD8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OKSA/PyBmYWxzZTtcblxuXHRcdC8vIEV4aXN0aW5nLXNlc3Npb24gcGF0aDogZ2F0ZSBvbiB0aGUgVVJJLWRlcml2ZWQgc2Vzc2lvbiB0eXBlIHNvIHdlXG5cdFx0Ly8gZG9uJ3QgcG9zdCB0aGUgdGlwIGZvciBub24tZWxpZ2libGUgc2Vzc2lvbiBraW5kcyAoQ29waWxvdCBDbG91ZCxcblx0XHQvLyBsb2NhbCwgZXRjLikuIFRoZSBub3RpZmljYXRpb24gd2lkZ2V0IGFsc28gZmlsdGVycyBieVxuXHRcdC8vIGBzZXNzaW9uVHlwZXNgLCBidXQgd2Ugd2FudCB0byBhdm9pZCBldmVuIHBvc3Rpbmcgd2hlbiB0aGUgVVJJXG5cdFx0Ly8gYWxyZWFkeSB0ZWxscyB1cyB0aGlzIGlzbid0IGEgaGFuZG9mZiB0YXJnZXQuXG5cdFx0Y29uc3QgZWxpZ2libGUgPSBwcmVjb25kaXRpb25NZXRcblx0XHRcdCYmICEhc2Vzc2lvblJlc291cmNlXG5cdFx0XHQmJiAhIXJlc291cmNlU2Vzc2lvblR5cGVcblx0XHRcdCYmIEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5FTElHSUJMRV9TRVNTSU9OX1RZUEVTLmhhcyhyZXNvdXJjZVNlc3Npb25UeXBlKVxuXHRcdFx0JiYgIWlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gRW1wdHktd29ya3NwYWNlIHBhdGg6IG5vIHVzYWJsZSBzZXNzaW9uIHlldCAoQ0xJIC8gYWdlbnQtaG9zdCBsb2NhbFxuXHRcdC8vIGNhbid0IHJ1biBoZXJlLCBhbmQgcGlja2luZyB0aGUgbW9kZSBvbmx5IGNyZWF0ZXMgYSBwbGFjZWhvbGRlclxuXHRcdC8vIHVudGl0bGVkIHNlc3Npb24gdGhhdCB3ZSBzaG91bGRuJ3QgdHJ5IHRvIGhhbmQgb2ZmKS4gR2F0ZSBvbiB0aGVcblx0XHQvLyB3aWRnZXQncyBjdXJyZW50IHNlc3Npb24gdHlwZSBzbyB3ZSBkb24ndCBjaHVybiBgX2xhc3RQb3N0ZWRGb3JgXG5cdFx0Ly8gd2hpbGUgdGhlIHVzZXIgaXMgb24gYSBub24tZWxpZ2libGUgbW9kZSAoQ2xhdWRlLCBDbG91ZCwgXHUyMDI2KSBcdTIwMTQgdGhlXG5cdFx0Ly8gbm90aWZpY2F0aW9uIHdpZGdldCdzIG93biBgc2Vzc2lvblR5cGVzYCBmaWx0ZXIgd291bGQgc3RpbGwgaGlkZVxuXHRcdC8vIHRoZSByZW5kZXJlZCBiYW5uZXIsIGJ1dCB3ZSBkb24ndCB3YW50IHRvIHBvc3QtdGhlbi1oaWRlLlxuXHRcdGNvbnN0IHdpZGdldFNlc3Npb25UeXBlID0gd2lkZ2V0Py5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSk7XG5cdFx0Y29uc3QgaXNFbXB0eVdvcmtzcGFjZSA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHRcdGNvbnN0IGVtcHR5V29ya3NwYWNlRWxpZ2libGUgPSBwcmVjb25kaXRpb25NZXRcblx0XHRcdCYmIGlzRW1wdHlXb3Jrc3BhY2Vcblx0XHRcdCYmICghc2Vzc2lvblJlc291cmNlIHx8IGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0JiYgd2lkZ2V0U2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3Q7XG5cblx0XHRpZiAoIWVsaWdpYmxlICYmICFlbXB0eVdvcmtzcGFjZUVsaWdpYmxlKSB7XG5cdFx0XHRpZiAodGhpcy5fbGFzdFBvc3RlZEZvcikge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmRlbGV0ZU5vdGlmaWNhdGlvbihBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uTk9USUZJQ0FUSU9OX0lEKTtcblx0XHRcdFx0dGhpcy5fbGFzdFBvc3RlZEZvciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSBlbGlnaWJsZSAmJiBzZXNzaW9uUmVzb3VyY2Vcblx0XHRcdD8gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdDogQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLkVNUFRZX1dPUktTUEFDRV9LRVk7XG5cblx0XHQvLyBPbmx5IGNhbGwgc2V0Tm90aWZpY2F0aW9uIHdoZW4gdGhlIHRhcmdldCBzZXNzaW9uIGNoYW5nZXMuIFJlLWNhbGxpbmdcblx0XHQvLyBzZXROb3RpZmljYXRpb24gY2xlYXJzIHRoZSB1c2VyJ3MgZGlzbWlzc2FsLCB3aGljaCB3b3VsZCBtYWtlIHRoZVxuXHRcdC8vIGRpc21pc3MgYnV0dG9uIGVmZmVjdGl2ZWx5IGEgbm8tb3Agd2hlbiB0aGUgY29udGV4dCBrZXkgc2VydmljZVxuXHRcdC8vIGZpcmVzIHJlcGVhdGVkIGNoYW5nZSBldmVudHMgZm9yIHRoZSBzYW1lIHNlc3Npb24uXG5cdFx0aWYgKHRoaXMuX2xhc3RQb3N0ZWRGb3IgPT09IGtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0ga2V5O1xuXG5cdFx0Ly8gUmVjb3JkIHRoZSBhZ2VudCBoYXJuZXNzIChzZXNzaW9uIHR5cGUpIG9mIHRoZSBwb3N0ZWQgdGlwIGZvciBjbGljayB0ZWxlbWV0cnkuXG5cdFx0dGhpcy5fbGFzdFBvc3RlZFNlc3Npb25UeXBlID0gZWxpZ2libGUgPyByZXNvdXJjZVNlc3Npb25UeXBlIDogd2lkZ2V0U2Vzc2lvblR5cGU7XG5cblx0XHQvLyBPbmx5IGZvcndhcmQgYSByZWFsIChub24tdW50aXRsZWQpIHNlc3Npb24gcmVzb3VyY2UuIEluIHRoZSBlbXB0eVxuXHRcdC8vIHdvcmtzcGFjZSBjYXNlIHRoZSBwaWNrZXIgbWF5IGhhdmUgY3JlYXRlZCBhIHBsYWNlaG9sZGVyIHVudGl0bGVkXG5cdFx0Ly8gc2Vzc2lvbiB0aGF0IHdlIHNob3VsZG4ndCB0cnkgdG8gcmVzdG9yZSBvbiB0aGUgb3RoZXIgc2lkZS5cblx0XHRjb25zdCBjb21tYW5kQXJnczogdW5rbm93bltdID0gZWxpZ2libGUgJiYgc2Vzc2lvblJlc291cmNlID8gW3Nlc3Npb25SZXNvdXJjZV0gOiBbXTtcblxuXHRcdC8vIEVtcHR5LXdvcmtzcGFjZSArIGxvY2FsIENvcGlsb3Q6IHRoZSBsb2NhbCBhZ2VudCBob3N0IGNhbid0XG5cdFx0Ly8gcnVuIHdpdGhvdXQgYSBmb2xkZXIsIHNvIGZyYW1lIHRoZSB0aXAgYXMgdGhlIHBhdGggZm9yd2FyZCByYXRoZXJcblx0XHQvLyB0aGFuIGEgZ2VuZXJpYyBcImNvbnRpbnVlIGluIGFnZW50c1wiIHVwc2VsbC5cblx0XHRjb25zdCB1c2VFbXB0eVdvcmtzcGFjZUNvcHkgPSBlbXB0eVdvcmtzcGFjZUVsaWdpYmxlICYmICFlbGlnaWJsZTtcblx0XHRjb25zdCBtZXNzYWdlID0gdXNlRW1wdHlXb3Jrc3BhY2VDb3B5XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmVtcHR5V29ya3NwYWNlLm1lc3NhZ2UnLCBcIkNvcGlsb3QgaXNuJ3QgYXZhaWxhYmxlIHdpdGhvdXQgYW4gb3BlbiBmb2xkZXJcIilcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAubWVzc2FnZScsIFwiQ29uZmlndXJlIHRoaXMgc2Vzc2lvbiBpbiBDb2RleCBTZXR0aW5nc1wiKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHVzZUVtcHR5V29ya3NwYWNlQ29weVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmLnRpcC5lbXB0eVdvcmtzcGFjZS5kZXNjcmlwdGlvbicsIFwiT3BlbiBDb2RleCBTZXR0aW5ncyB0byBjb25maWd1cmUgdGhlIGFnZW50IHJ1bnRpbWUuXCIpXG5cdFx0XHQ6IG1vZGUgPT09IEFnZW50c0hhbmRvZmZUaXBNb2RlLkN1c3RvbVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmRlc2NyaXB0aW9uLmNvcGlsb3QnLCBcIkZyZWUgd2l0aCB5b3VyIENvcGlsb3QgcGxhbiBcdTIwMTQgZ2V0IGEgZGVkaWNhdGVkLCBtdWx0aS1wYW5lIHZpZXcgYWxvbmdzaWRlIHlvdXIgd29ya3NwYWNlLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmRlc2NyaXB0aW9uJywgXCJHZXQgYSBkZWRpY2F0ZWQsIG11bHRpLXBhbmUgdmlldyBhbG9uZ3NpZGUgeW91ciB3b3Jrc3BhY2UuXCIpO1xuXHRcdGNvbnN0IGFjdGlvbkxhYmVsID0gdXNlRW1wdHlXb3Jrc3BhY2VDb3B5XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmFjdGlvbicsIFwiT3BlbiBDb2RleCBTZXR0aW5nc1wiKVxuXHRcdFx0OiBtb2RlID09PSBBZ2VudHNIYW5kb2ZmVGlwTW9kZS5DdXN0b21cblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmLnRpcC5hY3Rpb24uY3VzdG9tJywgXCJHaXZlIHlvdXIgYWdlbnQgbW9yZSByb29tP1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmFjdGlvbi5kZWZhdWx0JywgXCJPcGVuIENvZGV4IFNldHRpbmdzXCIpO1xuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5OT1RJRklDQVRJT05fSUQsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCxcblx0XHRcdFx0XHRsYWJlbDogYWN0aW9uTGFiZWwsXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uVElQX09QRU5fQ09NTUFORF9JRCxcblx0XHRcdFx0XHRjb21tYW5kQXJncyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiBmYWxzZSxcblx0XHRcdG11dGU6IHtcblx0XHRcdFx0Y29tbWFuZElkOiBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uVElQX01VVEVfQ09NTUFORF9JRCxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAubXV0ZScsIFwiRG9uJ3QgU2hvdyBBZ2FpblwiKSxcblx0XHRcdH0sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHVzZUVtcHR5V29ya3NwYWNlQ29weVxuXHRcdFx0XHQ/IFtTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90XVxuXHRcdFx0XHQ6IEFycmF5LmZyb20oQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLkVMSUdJQkxFX1NFU1NJT05fVFlQRVMpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmsgdGhlIHRpcCBhcyBoYW5kbGVkIChkaXNtaXNzZWQgb3Igb3BlbmVkKSBmb3IgdGhlIHJlc3Qgb2YgdGhpc1xuXHQgKiB3aW5kb3cncyBsaWZldGltZSBhbmQgdGVhciBkb3duIGFueSBjdXJyZW50bHkgcG9zdGVkIG5vdGlmaWNhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2Rpc21pc3NGb3JXaW5kb3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc21pc3NlZEZvcldpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNtaXNzZWRGb3JXaW5kb3cgPSB0cnVlO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLE9BQU87QUFDUCxTQUFTLEdBQUcsY0FBYztBQUMxQixTQUFTLDBCQUFzRDtBQUMvRCxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0IsNkJBQTZCO0FBQzFELFNBQVMsaUNBQWlDLCtCQUErQixxQ0FBcUM7QUFDOUcsU0FBUyw0Q0FBNEMsaUNBQWlDLCtCQUErQix5QkFBeUI7QUFDOUksU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsd0NBQXdDO0FBRWpE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
