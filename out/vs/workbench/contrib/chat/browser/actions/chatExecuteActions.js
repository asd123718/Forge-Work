import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { assertType } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { AgentHostAllowSignedOutWhenUsableSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { buildCustomAgentHandoffsInfo, getHandoffId, IChatModeService } from "../../common/chatModes.js";
import { reportChatModeChange } from "../../common/chatModeTelemetry.js";
import { chatVariableLeader } from "../../common/requestParser/chatParserTypes.js";
import { ChatStopCancellationNoopEventName, IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { IChatWidgetService } from "../chat.js";
import { getAgentSessionProvider, AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { getEditingSessionContext } from "../chatEditing/chatEditingActions.js";
import { ctxHasEditorModification, ctxHasRequestInProgress, ctxIsGlobalEditingSession } from "../chatEditing/chatEditingEditorContextKeys.js";
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession, handleModeSwitch } from "./chatActions.js";
import { CreateRemoteAgentJobAction } from "./chatContinueInAction.js";
class SubmitAction extends Action2 {
  async run(accessor, ...args) {
    const context = args[0];
    const telemetryService = accessor.get(ITelemetryService);
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    const pendingDelegationTarget = widget?.input.pendingDelegationTarget;
    if (pendingDelegationTarget && pendingDelegationTarget !== AgentSessionProviders.Local) {
      return await this.handleDelegation(accessor, widget, pendingDelegationTarget);
    }
    if (widget?.viewModel?.editing) {
      const configurationService = accessor.get(IConfigurationService);
      const dialogService = accessor.get(IDialogService);
      const chatService = accessor.get(IChatService);
      const chatModel = chatService.getSession(widget.viewModel.sessionResource);
      if (!chatModel) {
        return;
      }
      const session = chatModel.editingSession;
      if (!session) {
        return;
      }
      const requestId = widget.viewModel?.editing.id;
      if (requestId) {
        const chatRequests = chatModel.getRequests();
        const itemIndex = chatRequests.findIndex((request) => request.id === requestId);
        const editsToUndo = chatRequests.length - itemIndex;
        const requestsToRemove = chatRequests.slice(itemIndex);
        const requestIdsToRemove = new Set(requestsToRemove.map((request) => request.id));
        const entriesModifiedInRequestsToRemove = session.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
        const shouldPrompt = entriesModifiedInRequestsToRemove.length > 0 && configurationService.getValue("chat.editing.confirmEditRequestRemoval") === true;
        let message;
        if (editsToUndo === 1) {
          if (entriesModifiedInRequestsToRemove.length === 1) {
            message = localize("chat.removeLast.confirmation.message2", "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
          } else {
            message = localize("chat.removeLast.confirmation.multipleEdits.message", "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
          }
        } else {
          if (entriesModifiedInRequestsToRemove.length === 1) {
            message = localize("chat.remove.confirmation.message2", "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
          } else {
            message = localize("chat.remove.confirmation.multipleEdits.message", "This will remove all subsequent requests and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
          }
        }
        const confirmation = shouldPrompt ? await dialogService.confirm({
          title: editsToUndo === 1 ? localize("chat.removeLast.confirmation.title", "Do you want to undo your last edit?") : localize("chat.remove.confirmation.title", "Do you want to undo {0} edits?", editsToUndo),
          message,
          primaryButton: localize("chat.remove.confirmation.primaryButton", "Yes"),
          checkbox: { label: localize("chat.remove.confirmation.checkbox", "Don't ask again"), checked: false },
          type: "info"
        }) : { confirmed: true };
        if (!confirmation.confirmed) {
          telemetryService.publicLog2("chat.undoEditsConfirmation", {
            editRequestType: configurationService.getValue("chat.editRequests"),
            outcome: "cancelled",
            editsUndoCount: editsToUndo
          });
          return;
        } else if (editsToUndo > 0) {
          telemetryService.publicLog2("chat.undoEditsConfirmation", {
            editRequestType: configurationService.getValue("chat.editRequests"),
            outcome: "applied",
            editsUndoCount: editsToUndo
          });
        }
        if (confirmation.checkboxChecked) {
          await configurationService.updateValue("chat.editing.confirmEditRequestRemoval", false);
        }
        const snapshotRequestId = chatRequests[itemIndex].id;
        await session.restoreSnapshot(snapshotRequestId, void 0);
      }
    } else if (widget?.viewModel?.model.checkpoint) {
      widget.viewModel.model.setCheckpoint(void 0);
    }
    widget?.acceptInput(context?.inputValue, context?.acceptInputOptions);
  }
  async handleDelegation(accessor, widget, delegationTarget) {
    const chatSessionsService = accessor.get(IChatSessionsService);
    const contributions = chatSessionsService.getAllChatSessionContributions();
    const targetContribution = contributions.find((contrib) => {
      const providerType = getAgentSessionProvider(contrib.type);
      return providerType === delegationTarget || contrib.type === delegationTarget;
    });
    if (!targetContribution) {
      throw new Error(`No contribution found for delegation target: ${delegationTarget}`);
    }
    if (targetContribution.canDelegate === false) {
      throw new Error(`The contribution for delegation target: ${delegationTarget} does not support delegation.`);
    }
    return new CreateRemoteAgentJobAction().run(accessor, targetContribution, widget);
  }
}
const whenNoActiveRequest = ChatContextKeys.hasActiveRequest.negate();
const whenNotInProgress = ChatContextKeys.requestInProgress.negate();
const _ChatSubmitAction = class _ChatSubmitAction extends SubmitAction {
  constructor() {
    const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasSendableContent,
      ContextKeyExpr.or(whenNotInProgress, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
      ChatContextKeys.chatSessionOptionsValid,
      // A submission that is being routed/dispatched off-model (omni-chat)
      // disables sending until it resolves or the draft changes.
      ChatContextKeys.inputSubmitPending.negate()
    );
    super({
      id: _ChatSubmitAction.ID,
      title: localize2("interactive.submit.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.arrowUpCompact,
      precondition,
      toggled: {
        condition: ChatContextKeys.lockedToCodingAgent,
        icon: Codicon.arrowUpCompact,
        tooltip: localize("sendToAgent", "Send to Agent")
      },
      keybinding: {
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          ChatContextKeys.withinEditSessionDiff.negate()
        ),
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [
        {
          id: MenuId.ChatExecute,
          order: 4,
          when: ContextKeyExpr.and(
            whenNoActiveRequest,
            menuCondition,
            ChatContextKeys.withinEditSessionDiff.negate(),
            ChatContextKeys.inputSubmitPending.negate()
          ),
          group: "navigation",
          alt: {
            id: "workbench.action.chat.sendToNewChat",
            title: localize2("chat.newChat.label", "Send to New Chat"),
            icon: Codicon.plus
          }
        },
        {
          id: MenuId.ChatEditorInlineExecute,
          group: "navigation",
          order: 4,
          when: ContextKeyExpr.and(
            ContextKeyExpr.or(ctxHasEditorModification.negate(), ChatContextKeys.inputHasText),
            whenNoActiveRequest,
            menuCondition
          )
        }
      ]
    });
  }
};
_ChatSubmitAction.ID = "workbench.action.chat.submit";
let ChatSubmitAction = _ChatSubmitAction;
const _ChatSubmitPendingAction = class _ChatSubmitPendingAction extends Action2 {
  constructor() {
    super({
      id: _ChatSubmitPendingAction.ID,
      title: localize2("interactive.submitPending.label", "Routing Request\u2026"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: ThemeIcon.modify(Codicon.loading, "spin"),
      precondition: ChatContextKeys.inputRouting,
      menu: {
        id: MenuId.ChatExecute,
        order: 4,
        when: ContextKeyExpr.and(
          whenNoActiveRequest,
          ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask),
          ChatContextKeys.withinEditSessionDiff.negate(),
          ChatContextKeys.inputRouting
        ),
        group: "navigation"
      }
    });
  }
  run() {
  }
};
_ChatSubmitPendingAction.ID = "workbench.action.chat.submitPending";
let ChatSubmitPendingAction = _ChatSubmitPendingAction;
const ToggleAgentModeActionId = "workbench.action.chat.toggleAgentMode";
const _ToggleChatModeAction = class _ToggleChatModeAction extends Action2 {
  constructor() {
    super({
      id: _ToggleChatModeAction.ID,
      title: localize2("interactive.toggleAgent.label", "Switch to Next Agent"),
      f1: true,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.requestInProgress.negate()
      )
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const instaService = accessor.get(IInstantiationService);
    const telemetryService = accessor.get(ITelemetryService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const arg = args.at(0);
    let widget;
    if (arg?.sessionResource) {
      widget = chatWidgetService.getWidgetBySessionResource(arg.sessionResource);
    } else {
      widget = getEditingSessionContext(accessor, args)?.chatWidget;
    }
    if (!widget) {
      return;
    }
    const chatSession = widget.viewModel?.model;
    const requestCount = chatSession?.getRequests().length ?? 0;
    const modes = widget.input.currentChatModesObs.get();
    const switchToMode = (arg && (modes.findModeById(arg.modeId) || modes.findModeByName(arg.modeId))) ?? this.getNextMode(widget, requestCount, modes);
    const currentMode = widget.input.currentModeObs.get();
    if (switchToMode.id === currentMode.id) {
      return;
    }
    const chatModeCheck = await instaService.invokeFunction(handleModeSwitch, widget.input.currentModeKind, switchToMode.kind, requestCount, widget.viewModel?.model);
    if (!chatModeCheck) {
      return;
    }
    reportChatModeChange(telemetryService, currentMode, switchToMode, requestCount);
    widget.input.setChatMode(switchToMode.id, true, true);
    if (chatModeCheck.needToClearSession) {
      await commandService.executeCommand(ACTION_ID_NEW_CHAT);
    }
  }
  getNextMode(chatWidget, requestCount, modes) {
    const flat = [
      ...modes.builtin.filter((mode) => {
        return mode.kind !== ChatModeKind.Edit || requestCount === 0;
      }),
      ...modes.custom ?? []
    ];
    const curModeIndex = flat.findIndex((mode) => mode.id === chatWidget.input.currentModeObs.get().id);
    const newMode = flat[(curModeIndex + 1) % flat.length];
    return newMode;
  }
};
_ToggleChatModeAction.ID = ToggleAgentModeActionId;
let ToggleChatModeAction = _ToggleChatModeAction;
const _SwitchToNextModelAction = class _SwitchToNextModelAction extends Action2 {
  constructor() {
    super({
      id: _SwitchToNextModelAction.ID,
      title: localize2("interactive.switchToNextModel.label", "Switch to Next Model"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    widget?.input.switchToNextModel();
  }
};
_SwitchToNextModelAction.ID = "workbench.action.chat.switchToNextModel";
let SwitchToNextModelAction = _SwitchToNextModelAction;
const _SwitchToNextPinnedModelAction = class _SwitchToNextPinnedModelAction extends Action2 {
  constructor() {
    super({
      id: _SwitchToNextPinnedModelAction.ID,
      title: localize2("interactive.switchToNextPinnedModel.label", "Switch to Next Pinned Model"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    widget?.input.switchToNextPinnedModel();
  }
};
_SwitchToNextPinnedModelAction.ID = "workbench.action.chat.switchToNextPinnedModel";
let SwitchToNextPinnedModelAction = _SwitchToNextPinnedModelAction;
const _OpenModelPickerAction = class _OpenModelPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenModelPickerAction.ID,
      title: localize2("interactive.openModelPicker.label", "Open Model Picker"),
      category: CHAT_CATEGORY,
      f1: false,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ChatContextKeys.inChatInput
      },
      precondition: ChatContextKeys.enabled,
      menu: {
        id: MenuId.ChatInput,
        order: 3,
        group: "navigation",
        when: ContextKeyExpr.and(
          // Hide the model picker while a delegation (continue in) target is pending
          ChatContextKeys.hasPendingDelegationTarget.negate(),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.chatSessionHasTargetedModels
          ),
          ContextKeyExpr.or(
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)
          ),
          // Hide in welcome view when session type is not local
          ContextKeyExpr.or(
            ChatContextKeys.inAgentSessionsWelcome.negate(),
            ChatContextKeys.chatSessionHasTargetedModels,
            ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local),
            ContextKeyExpr.and(
              IsSessionsWindowContext,
              ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.AgentHostCopilot),
              ContextKeyExpr.equals(`config.${AgentHostAllowSignedOutWhenUsableSettingId}`, true)
            )
          )
        )
      }
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      await widgetService.reveal(widget);
      widget.input.openModelPicker();
    }
  }
};
_OpenModelPickerAction.ID = "workbench.action.chat.openModelPicker";
let OpenModelPickerAction = _OpenModelPickerAction;
const _OpenPermissionPickerAction = class _OpenPermissionPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenPermissionPickerAction.ID,
      title: localize2("interactive.openPermissionPicker.label", "Open Permission Picker"),
      tooltip: localize("setPermissionLevel", "Set Permissions"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: {
        id: MenuId.ChatInputSecondary,
        order: 1,
        group: "navigation",
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask),
          ChatContextKeys.inQuickChat.negate(),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Background)
          )
        )
      }
    });
  }
  async run(accessor) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openPermissionPicker();
    }
  }
};
_OpenPermissionPickerAction.ID = "workbench.action.chat.openPermissionPicker";
let OpenPermissionPickerAction = _OpenPermissionPickerAction;
const _OpenModePickerAction = class _OpenModePickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenModePickerAction.ID,
      title: localize2("interactive.openModePicker.label", "Open Agent Picker"),
      tooltip: localize("setChatMode", "Set Agent"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      keybinding: {
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Period,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [
        {
          id: MenuId.ChatInput,
          order: 1,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            // Hide the agent picker while a delegation (continue in) target is pending
            ChatContextKeys.hasPendingDelegationTarget.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent.negate(),
              ChatContextKeys.chatSessionHasCustomAgentTarget
            ),
            // Show in welcome view for local sessions or sessions with custom agent target
            ContextKeyExpr.or(
              ChatContextKeys.inAgentSessionsWelcome.negate(),
              ChatContextKeys.chatSessionHasCustomAgentTarget,
              ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
            )
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openModePicker();
    }
  }
};
_OpenModePickerAction.ID = "workbench.action.chat.openModePicker";
let OpenModePickerAction = _OpenModePickerAction;
const _OpenSessionTargetPickerAction = class _OpenSessionTargetPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenSessionTargetPickerAction.ID,
      title: localize2("interactive.openSessionTargetPicker.label", "Open Session Target Picker"),
      tooltip: localize("setSessionTarget", "Set Session Target"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ChatContextKeys.chatSessionIsEmpty, ChatContextKeys.inAgentSessionsWelcome), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
      menu: [
        {
          id: MenuId.ChatInput,
          order: 0,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            ChatContextKeys.chatSessionIsEmpty,
            IsSessionsWindowContext
          ),
          group: "navigation"
        },
        {
          id: MenuId.ChatInputSecondary,
          order: 0,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            IsSessionsWindowContext.negate(),
            ChatContextKeys.chatSessionIsEmpty
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openSessionTargetPicker();
    }
  }
};
_OpenSessionTargetPickerAction.ID = "workbench.action.chat.openSessionTargetPicker";
let OpenSessionTargetPickerAction = _OpenSessionTargetPickerAction;
const _OpenDelegationPickerAction = class _OpenDelegationPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenDelegationPickerAction.ID,
      title: localize2("interactive.openDelegationPicker.label", "Open Delegation Picker"),
      tooltip: localize("delegateSession", "Delegate Session"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty.negate(), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
      menu: [
        {
          id: MenuId.ChatInputSecondary,
          order: 0.5,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            ChatContextKeys.chatSessionSupportsDelegation,
            ChatContextKeys.chatSessionIsEmpty.negate(),
            IsSessionsWindowContext.negate()
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openDelegationPicker();
    }
  }
};
_OpenDelegationPickerAction.ID = "workbench.action.chat.openDelegationPicker";
let OpenDelegationPickerAction = _OpenDelegationPickerAction;
const _OpenWorkspacePickerAction = class _OpenWorkspacePickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspacePickerAction.ID,
      title: localize2("interactive.openWorkspacePicker.label", "Open Workspace Picker"),
      tooltip: localize("selectWorkspace", "Select Target Workspace"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inAgentSessionsWelcome),
      menu: [
        {
          id: MenuId.ChatInputSecondary,
          order: 0.6,
          when: ContextKeyExpr.and(
            ChatContextKeys.inAgentSessionsWelcome,
            ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType)
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
  }
};
_OpenWorkspacePickerAction.ID = "workbench.action.chat.openWorkspacePicker";
let OpenWorkspacePickerAction = _OpenWorkspacePickerAction;
const _ChatSessionPrimaryPickerAction = class _ChatSessionPrimaryPickerAction extends Action2 {
  constructor() {
    super({
      id: _ChatSessionPrimaryPickerAction.ID,
      title: localize2("interactive.openChatSessionPrimaryPicker.label", "Open Primary Session Picker"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [
        {
          // Cloud sessions: keep on the primary chat input toolbar
          id: MenuId.ChatInput,
          order: 4,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatSessionHasModels,
            ChatContextKeys.chatSessionType.isEqualTo(AgentSessionProviders.Cloud),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent,
              ContextKeyExpr.and(
                ChatContextKeys.inAgentSessionsWelcome,
                ChatContextKeys.chatSessionType.notEqualsTo("local")
              )
            )
          )
        },
        {
          // All other coding agents (Claude, etc.): show in the secondary toolbar.
          // In the Agents window only, hide the worktree/branch pickers for Copilot
          // CLI sessions because their option groups are surfaced through the CLI
          // session UI there. They remain visible in the regular VS Code workbench.
          id: MenuId.ChatInputSecondary,
          order: 4,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatSessionHasModels,
            ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Cloud),
            ContextKeyExpr.or(
              IsSessionsWindowContext.negate(),
              ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Background)
            ),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent,
              ContextKeyExpr.and(
                ChatContextKeys.inAgentSessionsWelcome,
                ChatContextKeys.chatSessionType.notEqualsTo("local")
              )
            )
          )
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openChatSessionPicker();
    }
  }
};
_ChatSessionPrimaryPickerAction.ID = "workbench.action.chat.chatSessionPrimaryPicker";
let ChatSessionPrimaryPickerAction = _ChatSessionPrimaryPickerAction;
const ChangeChatModelActionId = "workbench.action.chat.changeModel";
const _ChangeChatModelAction = class _ChangeChatModelAction extends Action2 {
  constructor() {
    super({
      id: _ChangeChatModelAction.ID,
      title: localize2("interactive.changeModel.label", "Change Model"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const modelInfo = args[0];
    assertType(typeof modelInfo.vendor === "string" && typeof modelInfo.id === "string" && typeof modelInfo.family === "string");
    const widgetService = accessor.get(IChatWidgetService);
    const widgets = widgetService.getAllWidgets();
    for (const widget of widgets) {
      widget.input.switchModel(modelInfo);
    }
  }
};
_ChangeChatModelAction.ID = ChangeChatModelActionId;
let ChangeChatModelAction = _ChangeChatModelAction;
const _ChatEditingSessionSubmitAction = class _ChatEditingSessionSubmitAction extends SubmitAction {
  constructor() {
    const notInProgressOrEditing = ContextKeyExpr.and(
      ContextKeyExpr.or(whenNoActiveRequest, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
      ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Queue),
      ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Steer)
    );
    const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasSendableContent,
      notInProgressOrEditing,
      ChatContextKeys.chatSessionOptionsValid
    );
    super({
      id: _ChatEditingSessionSubmitAction.ID,
      title: localize2("edits.submit.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.arrowUpCompact,
      precondition,
      menu: [
        {
          id: MenuId.ChatExecute,
          order: 4,
          when: ContextKeyExpr.and(
            notInProgressOrEditing,
            menuCondition
          ),
          group: "navigation",
          alt: {
            id: "workbench.action.chat.sendToNewChat",
            title: localize2("chat.newChat.label", "Send to New Chat"),
            icon: Codicon.plus
          }
        }
      ]
    });
  }
};
_ChatEditingSessionSubmitAction.ID = "workbench.action.edits.submit";
let ChatEditingSessionSubmitAction = _ChatEditingSessionSubmitAction;
const _SubmitWithoutDispatchingAction = class _SubmitWithoutDispatchingAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasText,
      whenNotInProgress,
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask)
    );
    super({
      id: _SubmitWithoutDispatchingAction.ID,
      title: localize2("interactive.submitWithoutDispatch.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      precondition,
      keybinding: {
        when: ChatContextKeys.inChatInput,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    widget?.acceptInput(context?.inputValue, { noCommandDetection: true });
  }
};
_SubmitWithoutDispatchingAction.ID = "workbench.action.chat.submitWithoutDispatching";
let SubmitWithoutDispatchingAction = _SubmitWithoutDispatchingAction;
const _ChatSubmitWithCodebaseAction = class _ChatSubmitWithCodebaseAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasText,
      whenNotInProgress
    );
    super({
      id: _ChatSubmitWithCodebaseAction.ID,
      title: localize2("actions.chat.submitWithCodebase", "Send with {0}", `${chatVariableLeader}codebase`),
      precondition,
      keybinding: {
        when: ChatContextKeys.inChatInput,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const languageModelToolsService = accessor.get(ILanguageModelToolsService);
    const codebaseTool = languageModelToolsService.getToolByName("codebase");
    if (!codebaseTool) {
      return;
    }
    widget.input.attachmentModel.addContext({
      id: codebaseTool.id,
      name: codebaseTool.displayName ?? "",
      fullName: codebaseTool.displayName ?? "",
      value: void 0,
      icon: ThemeIcon.isThemeIcon(codebaseTool.icon) ? codebaseTool.icon : void 0,
      kind: "tool"
    });
    widget.acceptInput();
  }
};
_ChatSubmitWithCodebaseAction.ID = "workbench.action.chat.submitWithCodebase";
let ChatSubmitWithCodebaseAction = _ChatSubmitWithCodebaseAction;
class SendToNewChatAction extends Action2 {
  constructor() {
    const precondition = ChatContextKeys.inputHasText;
    super({
      id: "workbench.action.chat.sendToNewChat",
      title: localize2("chat.newChat.label", "Send to New Chat"),
      precondition,
      category: CHAT_CATEGORY,
      f1: false,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
        when: ChatContextKeys.inChatInput
      }
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const dialogService = accessor.get(IDialogService);
    const chatService = accessor.get(IChatService);
    const instantiationService = accessor.get(IInstantiationService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const inputBeforeClear = widget.getInput();
    if (widget.viewModel) {
      await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, "newSessionAction");
    }
    if (widget.viewModel?.model) {
      if (!await handleCurrentEditingSession(widget.viewModel.model, void 0, dialogService)) {
        return;
      }
    }
    widget.setInput("");
    await instantiationService.invokeFunction(clearChatSessionPreservingType, widget, void 0);
    widget.acceptInput(inputBeforeClear, { storeToHistory: true });
  }
}
const CancelChatActionId = "workbench.action.chat.cancel";
const _CancelAction = class _CancelAction extends Action2 {
  constructor() {
    super({
      id: _CancelAction.ID,
      title: localize2("interactive.cancel.label", "Cancel"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.stopCircle,
      menu: [
        {
          id: MenuId.ChatExecute,
          when: ContextKeyExpr.and(
            ChatContextKeys.hasActiveRequest,
            ChatContextKeys.remoteJobCreating.negate(),
            ChatContextKeys.currentlyEditing.negate()
          ),
          order: 4,
          group: "navigation"
        },
        {
          id: MenuId.ChatEditorInlineExecute,
          when: ContextKeyExpr.and(
            ctxIsGlobalEditingSession.negate(),
            ctxHasRequestInProgress
          ),
          order: 4,
          group: "navigation"
        }
      ],
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Escape,
        when: ContextKeyExpr.and(
          ChatContextKeys.hasActiveRequest,
          ChatContextKeys.remoteJobCreating.negate()
        ),
        win: { primary: KeyMod.Alt | KeyCode.Backspace }
      }
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const logService = accessor.get(ILogService);
    const telemetryService = accessor.get(ITelemetryService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
        source: "cancelAction",
        reason: "noWidget",
        requestInProgress: "unknown",
        pendingRequests: 0
      });
      logService.info("ChatCancelAction#run: No focused chat widget was found");
      return;
    }
    const chatService = accessor.get(IChatService);
    if (widget.viewModel) {
      await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, "cancelAction");
    } else {
      telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
        source: "cancelAction",
        reason: "noViewModel",
        requestInProgress: "unknown",
        pendingRequests: 0
      });
      logService.info("ChatCancelAction#run: Canceled chat widget has no view model");
    }
  }
};
_CancelAction.ID = CancelChatActionId;
let CancelAction = _CancelAction;
const CancelChatEditId = "workbench.edit.chat.cancel";
const _CancelEdit = class _CancelEdit extends Action2 {
  constructor() {
    super({
      id: _CancelEdit.ID,
      title: localize2("interactive.cancelEdit.label", "Cancel Edit"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.x,
      menu: [
        {
          id: MenuId.ChatMessageTitle,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.currentlyEditing, ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, "input"))
        }
      ],
      keybinding: {
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated(),
          ContextKeyExpr.or(ChatContextKeys.currentlyEditing, ChatContextKeys.currentlyEditingInput)
        ),
        weight: KeybindingWeight.EditorContrib - 5
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    widget.finishedEditing();
  }
};
_CancelEdit.ID = CancelChatEditId;
let CancelEdit = _CancelEdit;
const GetHandoffsActionId = "workbench.action.chat.getHandoffs";
const _GetHandoffsAction = class _GetHandoffsAction extends Action2 {
  constructor() {
    super({
      id: _GetHandoffsAction.ID,
      title: localize2("chat.getHandoffs.label", "Get Handoffs"),
      f1: false,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, ...args) {
    const modeService = accessor.get(IChatModeService);
    const arg = args.at(0);
    const { builtin, custom } = await modeService.getLocalModes();
    let allModes = [...builtin, ...custom];
    if (arg?.sourceCustomAgent) {
      const filterName = arg.sourceCustomAgent;
      allModes = allModes.filter((m) => m.name.get().toLowerCase() === filterName.toLowerCase());
    }
    return buildCustomAgentHandoffsInfo(allModes);
  }
};
_GetHandoffsAction.ID = GetHandoffsActionId;
let GetHandoffsAction = _GetHandoffsAction;
const ExecuteHandoffActionId = "workbench.action.chat.executeHandoff";
const _ExecuteHandoffAction = class _ExecuteHandoffAction extends Action2 {
  constructor() {
    super({
      id: _ExecuteHandoffAction.ID,
      title: localize2("chat.executeHandoff.label", "Execute Handoff"),
      f1: false,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, ...args) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const arg = args.at(0);
    if (!arg?.id && !arg?.label) {
      return { success: false, error: "Either id or label is required" };
    }
    let widget;
    if (arg.sessionResource) {
      let sessionResource;
      try {
        sessionResource = URI.parse(arg.sessionResource);
      } catch {
        return { success: false, error: `Invalid sessionResource URI: '${arg.sessionResource}'` };
      }
      widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
    } else {
      widget = chatWidgetService.lastFocusedWidget;
    }
    if (!widget) {
      return { success: false, error: "No chat widget found. Provide sessionResource or focus a chat widget." };
    }
    let sourceMode;
    if (arg.sourceCustomAgent) {
      const filterName = arg.sourceCustomAgent.toLowerCase();
      const { builtin, custom } = widget.input.currentChatModesObs.get();
      sourceMode = [...builtin, ...custom].find((m) => m.name.get().toLowerCase() === filterName || m.id.toLowerCase() === filterName);
    }
    if (!sourceMode) {
      sourceMode = widget.input.currentModeObs.get();
    }
    const handoffs = sourceMode?.handOffs?.get();
    if (!handoffs || handoffs.length === 0) {
      return { success: false, error: `No handoffs available for mode '${sourceMode?.name.get()}'` };
    }
    let matchedHandoff = arg.id ? handoffs.find((h) => getHandoffId(h) === arg.id) : void 0;
    if (!matchedHandoff && arg.label) {
      const labelLower = arg.label.trim().toLowerCase();
      matchedHandoff = handoffs.find((h) => h.label.trim().toLowerCase() === labelLower);
    }
    if (!matchedHandoff) {
      const identifier = arg.id ?? arg.label;
      return { success: false, error: `No handoff with identifier '${identifier}' found for mode '${sourceMode?.name.get()}'` };
    }
    await widget.executeHandoff(matchedHandoff);
    return { success: true, targetMode: matchedHandoff.agent };
  }
};
_ExecuteHandoffAction.ID = ExecuteHandoffActionId;
let ExecuteHandoffAction = _ExecuteHandoffAction;
function registerChatExecuteActions() {
  const store = new DisposableStore();
  store.add(registerAction2(ChatSubmitAction));
  store.add(registerAction2(ChatSubmitPendingAction));
  store.add(registerAction2(ChatEditingSessionSubmitAction));
  store.add(registerAction2(SubmitWithoutDispatchingAction));
  store.add(registerAction2(CancelAction));
  store.add(registerAction2(SendToNewChatAction));
  store.add(registerAction2(ChatSubmitWithCodebaseAction));
  store.add(registerAction2(ToggleChatModeAction));
  store.add(registerAction2(SwitchToNextModelAction));
  store.add(registerAction2(SwitchToNextPinnedModelAction));
  store.add(registerAction2(OpenModelPickerAction));
  store.add(registerAction2(OpenPermissionPickerAction));
  store.add(registerAction2(OpenModePickerAction));
  store.add(registerAction2(OpenSessionTargetPickerAction));
  store.add(registerAction2(OpenDelegationPickerAction));
  store.add(registerAction2(OpenWorkspacePickerAction));
  store.add(registerAction2(ChatSessionPrimaryPickerAction));
  store.add(registerAction2(ChangeChatModelAction));
  store.add(registerAction2(CancelEdit));
  store.add(registerAction2(GetHandoffsAction));
  store.add(registerAction2(ExecuteHandoffAction));
  return store;
}
export {
  CancelAction,
  CancelChatActionId,
  CancelChatEditId,
  CancelEdit,
  ChangeChatModelActionId,
  ChatEditingSessionSubmitAction,
  ChatSessionPrimaryPickerAction,
  ChatSubmitAction,
  ChatSubmitWithCodebaseAction,
  ExecuteHandoffActionId,
  GetHandoffsActionId,
  OpenDelegationPickerAction,
  OpenModePickerAction,
  OpenModelPickerAction,
  OpenPermissionPickerAction,
  OpenSessionTargetPickerAction,
  OpenWorkspacePickerAction,
  ToggleAgentModeActionId,
  registerChatExecuteActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRFeGVjdXRlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGJ1aWxkQ3VzdG9tQWdlbnRIYW5kb2Zmc0luZm8sIGdldEhhbmRvZmZJZCwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlLCBJQ2hhdE1vZGVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyByZXBvcnRDaGF0TW9kZUNoYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZVRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wQ2xhc3NpZmljYXRpb24sIENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50LCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudE5hbWUsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElDaGF0QWNjZXB0SW5wdXRPcHRpb25zLCBJQ2hhdENvbnRleHRQaWNrZXJEZWxlZ2F0ZSwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIEFnZW50U2Vzc2lvblByb3ZpZGVycywgQWdlbnRTZXNzaW9uVGFyZ2V0IH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IGdldEVkaXRpbmdTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24sIGN0eEhhc1JlcXVlc3RJblByb2dyZXNzLCBjdHhJc0dsb2JhbEVkaXRpbmdTZXNzaW9uIH0gZnJvbSAnLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fSURfTkVXX0NIQVQsIENIQVRfQ0FURUdPUlksIGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZSwgaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uLCBoYW5kbGVNb2RlU3dpdGNoIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDcmVhdGVSZW1vdGVBZ2VudEpvYkFjdGlvbiB9IGZyb20gJy4vY2hhdENvbnRpbnVlSW5BY3Rpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IGRpc2FibGVUaW1lb3V0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHtcblx0d2lkZ2V0PzogSUNoYXRXaWRnZXQ7XG5cdGlucHV0VmFsdWU/OiBzdHJpbmc7XG5cdGFjY2VwdElucHV0T3B0aW9ucz86IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zO1xuXHR2b2ljZT86IElWb2ljZUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcblx0Y29udGV4dFBpY2tlcj86IElDaGF0Q29udGV4dFBpY2tlckRlbGVnYXRlO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBTdWJtaXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBjb250ZXh0Py53aWRnZXQgPz8gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblxuXHRcdC8vIENoZWNrIGlmIHRoZXJlJ3MgYSBwZW5kaW5nIGRlbGVnYXRpb24gdGFyZ2V0XG5cdFx0Y29uc3QgcGVuZGluZ0RlbGVnYXRpb25UYXJnZXQgPSB3aWRnZXQ/LmlucHV0LnBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0O1xuXHRcdGlmIChwZW5kaW5nRGVsZWdhdGlvblRhcmdldCAmJiBwZW5kaW5nRGVsZWdhdGlvblRhcmdldCAhPT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5oYW5kbGVEZWxlZ2F0aW9uKGFjY2Vzc29yLCB3aWRnZXQsIHBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KTtcblx0XHR9XG5cblx0XHRpZiAod2lkZ2V0Py52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBjaGF0U2VydmljZS5nZXRTZXNzaW9uKHdpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghY2hhdE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNoYXRNb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHdpZGdldC52aWV3TW9kZWw/LmVkaXRpbmcuaWQ7XG5cblx0XHRcdGlmIChyZXF1ZXN0SWQpIHtcblx0XHRcdFx0Y29uc3QgY2hhdFJlcXVlc3RzID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0XHRcdGNvbnN0IGl0ZW1JbmRleCA9IGNoYXRSZXF1ZXN0cy5maW5kSW5kZXgocmVxdWVzdCA9PiByZXF1ZXN0LmlkID09PSByZXF1ZXN0SWQpO1xuXHRcdFx0XHRjb25zdCBlZGl0c1RvVW5kbyA9IGNoYXRSZXF1ZXN0cy5sZW5ndGggLSBpdGVtSW5kZXg7XG5cblx0XHRcdFx0Y29uc3QgcmVxdWVzdHNUb1JlbW92ZSA9IGNoYXRSZXF1ZXN0cy5zbGljZShpdGVtSW5kZXgpO1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWRzVG9SZW1vdmUgPSBuZXcgU2V0KHJlcXVlc3RzVG9SZW1vdmUubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5pZCkpO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUgPSBzZXNzaW9uLmVudHJpZXMuZ2V0KCkuZmlsdGVyKChlbnRyeSkgPT4gcmVxdWVzdElkc1RvUmVtb3ZlLmhhcyhlbnRyeS5sYXN0TW9kaWZ5aW5nUmVxdWVzdElkKSkgPz8gW107XG5cdFx0XHRcdGNvbnN0IHNob3VsZFByb21wdCA9IGVudHJpZXNNb2RpZmllZEluUmVxdWVzdHNUb1JlbW92ZS5sZW5ndGggPiAwICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmVtb3ZhbCcpID09PSB0cnVlO1xuXG5cdFx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChlZGl0c1RvVW5kbyA9PT0gMSkge1xuXHRcdFx0XHRcdGlmIChlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NoYXQucmVtb3ZlTGFzdC5jb25maXJtYXRpb24ubWVzc2FnZTInLCBcIlRoaXMgd2lsbCByZW1vdmUgeW91ciBsYXN0IHJlcXVlc3QgYW5kIHVuZG8gdGhlIGVkaXRzIG1hZGUgdG8gezB9LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBiYXNlbmFtZShlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmVbMF0ubW9kaWZpZWRVUkkpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0LnJlbW92ZUxhc3QuY29uZmlybWF0aW9uLm11bHRpcGxlRWRpdHMubWVzc2FnZScsIFwiVGhpcyB3aWxsIHJlbW92ZSB5b3VyIGxhc3QgcmVxdWVzdCBhbmQgdW5kbyBlZGl0cyBtYWRlIHRvIHswfSBmaWxlcyBpbiB5b3VyIHdvcmtpbmcgc2V0LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGVudHJpZXNNb2RpZmllZEluUmVxdWVzdHNUb1JlbW92ZS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdC5yZW1vdmUuY29uZmlybWF0aW9uLm1lc3NhZ2UyJywgXCJUaGlzIHdpbGwgcmVtb3ZlIGFsbCBzdWJzZXF1ZW50IHJlcXVlc3RzIGFuZCB1bmRvIGVkaXRzIG1hZGUgdG8gezB9LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBiYXNlbmFtZShlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmVbMF0ubW9kaWZpZWRVUkkpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24ubXVsdGlwbGVFZGl0cy5tZXNzYWdlJywgXCJUaGlzIHdpbGwgcmVtb3ZlIGFsbCBzdWJzZXF1ZW50IHJlcXVlc3RzIGFuZCB1bmRvIGVkaXRzIG1hZGUgdG8gezB9IGZpbGVzIGluIHlvdXIgd29ya2luZyBzZXQuIERvIHlvdSB3YW50IHRvIHByb2NlZWQ/XCIsIGVudHJpZXNNb2RpZmllZEluUmVxdWVzdHNUb1JlbW92ZS5sZW5ndGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IHNob3VsZFByb21wdFxuXHRcdFx0XHRcdD8gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdHRpdGxlOiBlZGl0c1RvVW5kbyA9PT0gMVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnJlbW92ZUxhc3QuY29uZmlybWF0aW9uLnRpdGxlJywgXCJEbyB5b3Ugd2FudCB0byB1bmRvIHlvdXIgbGFzdCBlZGl0P1wiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24udGl0bGUnLCBcIkRvIHlvdSB3YW50IHRvIHVuZG8gezB9IGVkaXRzP1wiLCBlZGl0c1RvVW5kbyksXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlLFxuXHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2NoYXQucmVtb3ZlLmNvbmZpcm1hdGlvbi5wcmltYXJ5QnV0dG9uJywgXCJZZXNcIiksXG5cdFx0XHRcdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2NoYXQucmVtb3ZlLmNvbmZpcm1hdGlvbi5jaGVja2JveCcsIFwiRG9uJ3QgYXNrIGFnYWluXCIpLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0dHlwZTogJ2luZm8nXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0XHQ6IHsgY29uZmlybWVkOiB0cnVlIH07XG5cblx0XHRcdFx0dHlwZSBFZGl0VW5kb0V2ZW50ID0ge1xuXHRcdFx0XHRcdGVkaXRSZXF1ZXN0VHlwZTogc3RyaW5nO1xuXHRcdFx0XHRcdG91dGNvbWU6ICdjYW5jZWxsZWQnIHwgJ2FwcGxpZWQnO1xuXHRcdFx0XHRcdGVkaXRzVW5kb0NvdW50OiBudW1iZXI7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dHlwZSBFZGl0VW5kb0V2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdqdXN0c2NoZW4nO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdFdmVudCB1c2VkIHRvIGdhaW4gaW5zaWdodHMgaW50byB3aGVuIHRoZXJlIGFyZSBwZW5kaW5nIGNoYW5nZXMgdG8gdW5kbywgYW5kIHdoZXRoZXIgZWRpdGVkIHJlcXVlc3RzIGFyZSBhcHBsaWVkIG9yIGNhbmNlbGxlZC4nO1xuXHRcdFx0XHRcdGVkaXRSZXF1ZXN0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0N1cnJlbnQgZW50cnkgcG9pbnQgZm9yIGVkaXRpbmcgYSByZXF1ZXN0LicgfTtcblx0XHRcdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgZWRpdCB3YXMgY2FuY2VsbGVkIG9yIGFwcGxpZWQuJyB9O1xuXHRcdFx0XHRcdGVkaXRzVW5kb0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIGVkaXRzIHRoYXQgd291bGQgYmUgdW5kb25lLic7ICdpc01lYXN1cmVtZW50JzogdHJ1ZSB9O1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGlmICghY29uZmlybWF0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFZGl0VW5kb0V2ZW50LCBFZGl0VW5kb0V2ZW50Q2xhc3NpZmljYXRpb24+KCdjaGF0LnVuZG9FZGl0c0NvbmZpcm1hdGlvbicsIHtcblx0XHRcdFx0XHRcdGVkaXRSZXF1ZXN0VHlwZTogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSxcblx0XHRcdFx0XHRcdG91dGNvbWU6ICdjYW5jZWxsZWQnLFxuXHRcdFx0XHRcdFx0ZWRpdHNVbmRvQ291bnQ6IGVkaXRzVG9VbmRvXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGVkaXRzVG9VbmRvID4gMCkge1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFZGl0VW5kb0V2ZW50LCBFZGl0VW5kb0V2ZW50Q2xhc3NpZmljYXRpb24+KCdjaGF0LnVuZG9FZGl0c0NvbmZpcm1hdGlvbicsIHtcblx0XHRcdFx0XHRcdGVkaXRSZXF1ZXN0VHlwZTogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSxcblx0XHRcdFx0XHRcdG91dGNvbWU6ICdhcHBsaWVkJyxcblx0XHRcdFx0XHRcdGVkaXRzVW5kb0NvdW50OiBlZGl0c1RvVW5kb1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbmZpcm1hdGlvbi5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJlbW92YWwnLCBmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXN0b3JlIHRoZSBzbmFwc2hvdCB0byB3aGF0IGl0IHdhcyBiZWZvcmUgdGhlIHJlcXVlc3QocykgdGhhdCB3ZSBkZWxldGVkXG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90UmVxdWVzdElkID0gY2hhdFJlcXVlc3RzW2l0ZW1JbmRleF0uaWQ7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24ucmVzdG9yZVNuYXBzaG90KHNuYXBzaG90UmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAod2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLmNoZWNrcG9pbnQpIHtcblx0XHRcdHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2V0Q2hlY2twb2ludCh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR3aWRnZXQ/LmFjY2VwdElucHV0KGNvbnRleHQ/LmlucHV0VmFsdWUsIGNvbnRleHQ/LmFjY2VwdElucHV0T3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZURlbGVnYXRpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSUNoYXRXaWRnZXQsIGRlbGVnYXRpb25UYXJnZXQ6IEV4Y2x1ZGU8QWdlbnRTZXNzaW9uVGFyZ2V0LCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWw+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cblx0XHQvLyBGaW5kIHRoZSBjb250cmlidXRpb24gZm9yIHRoZSBkZWxlZ2F0aW9uIHRhcmdldFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldENvbnRyaWJ1dGlvbiA9IGNvbnRyaWJ1dGlvbnMuZmluZChjb250cmliID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyVHlwZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGNvbnRyaWIudHlwZSk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXJUeXBlID09PSBkZWxlZ2F0aW9uVGFyZ2V0IHx8IGNvbnRyaWIudHlwZSA9PT0gZGVsZWdhdGlvblRhcmdldDtcblx0XHR9KTtcblxuXHRcdGlmICghdGFyZ2V0Q29udHJpYnV0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGNvbnRyaWJ1dGlvbiBmb3VuZCBmb3IgZGVsZWdhdGlvbiB0YXJnZXQ6ICR7ZGVsZWdhdGlvblRhcmdldH1gKTtcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0Q29udHJpYnV0aW9uLmNhbkRlbGVnYXRlID09PSBmYWxzZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgY29udHJpYnV0aW9uIGZvciBkZWxlZ2F0aW9uIHRhcmdldDogJHtkZWxlZ2F0aW9uVGFyZ2V0fSBkb2VzIG5vdCBzdXBwb3J0IGRlbGVnYXRpb24uYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDcmVhdGVSZW1vdGVBZ2VudEpvYkFjdGlvbigpLnJ1bihhY2Nlc3NvciwgdGFyZ2V0Q29udHJpYnV0aW9uLCB3aWRnZXQpO1xuXHR9XG59XG5cbmNvbnN0IHdoZW5Ob0FjdGl2ZVJlcXVlc3QgPSBDaGF0Q29udGV4dEtleXMuaGFzQWN0aXZlUmVxdWVzdC5uZWdhdGUoKTtcbmNvbnN0IHdoZW5Ob3RJblByb2dyZXNzID0gQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RJblByb2dyZXNzLm5lZ2F0ZSgpO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFN1Ym1pdEFjdGlvbiBleHRlbmRzIFN1Ym1pdEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBtZW51Q29uZGl0aW9uID0gQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFzayk7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzU2VuZGFibGVDb250ZW50LFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3Iod2hlbk5vdEluUHJvZ3Jlc3MsIENoYXRDb250ZXh0S2V5cy5lZGl0aW5nUmVxdWVzdFR5cGUuaXNFcXVhbFRvKENoYXRDb250ZXh0S2V5cy5FZGl0aW5nUmVxdWVzdFR5cGUuU2VudCkpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkLFxuXHRcdFx0Ly8gQSBzdWJtaXNzaW9uIHRoYXQgaXMgYmVpbmcgcm91dGVkL2Rpc3BhdGNoZWQgb2ZmLW1vZGVsIChvbW5pLWNoYXQpXG5cdFx0XHQvLyBkaXNhYmxlcyBzZW5kaW5nIHVudGlsIGl0IHJlc29sdmVzIG9yIHRoZSBkcmFmdCBjaGFuZ2VzLlxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0U3VibWl0UGVuZGluZy5uZWdhdGUoKSxcblx0XHQpO1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRTdWJtaXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5zdWJtaXQubGFiZWwnLCBcIlNlbmRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dVcENvbXBhY3QsXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQsXG5cdFx0XHRcdGljb246IENvZGljb24uYXJyb3dVcENvbXBhY3QsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZW5kVG9BZ2VudCcsIFwiU2VuZCB0byBBZ2VudFwiKSxcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLndpdGhpbkVkaXRTZXNzaW9uRGlmZi5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdHdoZW5Ob0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0XHRtZW51Q29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLndpdGhpbkVkaXRTZXNzaW9uRGlmZi5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dFN1Ym1pdFBlbmRpbmcubmVnYXRlKCksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2VuZFRvTmV3Q2hhdCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm5ld0NoYXQubGFiZWwnLCBcIlNlbmQgdG8gTmV3IENoYXRcIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0KSxcblx0XHRcdFx0XHRcdHdoZW5Ob0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0XHRtZW51Q29uZGl0aW9uXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fV1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDaGF0U3VibWl0UGVuZGluZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN1Ym1pdFBlbmRpbmcnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDaGF0U3VibWl0UGVuZGluZ0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLnN1Ym1pdFBlbmRpbmcubGFiZWwnLCBcIlJvdXRpbmcgUmVxdWVzdFx1MjAyNlwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJyksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5pbnB1dFJvdXRpbmcsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0d2hlbk5vQWN0aXZlUmVxdWVzdCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQXNrKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMud2l0aGluRWRpdFNlc3Npb25EaWZmLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dFJvdXRpbmcsXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKCk6IHZvaWQgeyB9XG59XG5cblxuZXhwb3J0IGNvbnN0IFRvZ2dsZUFnZW50TW9kZUFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50b2dnbGVBZ2VudE1vZGUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUb2dnbGVDaGF0TW9kZUFyZ3Mge1xuXHRtb2RlSWQ6IENoYXRNb2RlS2luZCB8IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFRvZ2dsZUNoYXRNb2RlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gVG9nZ2xlQWdlbnRNb2RlQWN0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZUNoYXRNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUudG9nZ2xlQWdlbnQubGFiZWwnLCBcIlN3aXRjaCB0byBOZXh0IEFnZW50XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlcXVlc3RJblByb2dyZXNzLm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0XHRjb25zdCBhcmcgPSBhcmdzLmF0KDApIGFzIElUb2dnbGVDaGF0TW9kZUFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdpZGdldDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZz8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShhcmcuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0ID0gZ2V0RWRpdGluZ1Nlc3Npb25Db250ZXh0KGFjY2Vzc29yLCBhcmdzKT8uY2hhdFdpZGdldDtcblx0XHR9XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0Y29uc3QgcmVxdWVzdENvdW50ID0gY2hhdFNlc3Npb24/LmdldFJlcXVlc3RzKCkubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgbW9kZXMgPSB3aWRnZXQuaW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKTtcblx0XHRjb25zdCBzd2l0Y2hUb01vZGUgPSAoYXJnICYmIChtb2Rlcy5maW5kTW9kZUJ5SWQoYXJnLm1vZGVJZCkgfHwgbW9kZXMuZmluZE1vZGVCeU5hbWUoYXJnLm1vZGVJZCkpKSA/PyB0aGlzLmdldE5leHRNb2RlKHdpZGdldCwgcmVxdWVzdENvdW50LCBtb2Rlcyk7XG5cblx0XHRjb25zdCBjdXJyZW50TW9kZSA9IHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHRpZiAoc3dpdGNoVG9Nb2RlLmlkID09PSBjdXJyZW50TW9kZS5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRNb2RlQ2hlY2sgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaGFuZGxlTW9kZVN3aXRjaCwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCwgc3dpdGNoVG9Nb2RlLmtpbmQsIHJlcXVlc3RDb3VudCwgd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwpO1xuXHRcdGlmICghY2hhdE1vZGVDaGVjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9ydENoYXRNb2RlQ2hhbmdlKHRlbGVtZXRyeVNlcnZpY2UsIGN1cnJlbnRNb2RlLCBzd2l0Y2hUb01vZGUsIHJlcXVlc3RDb3VudCk7XG5cblx0XHR3aWRnZXQuaW5wdXQuc2V0Q2hhdE1vZGUoc3dpdGNoVG9Nb2RlLmlkLCB0cnVlLCB0cnVlKTtcblxuXHRcdGlmIChjaGF0TW9kZUNoZWNrLm5lZWRUb0NsZWFyU2Vzc2lvbikge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFUKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE5leHRNb2RlKGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0LCByZXF1ZXN0Q291bnQ6IG51bWJlciwgbW9kZXM6IElDaGF0TW9kZXMpOiBJQ2hhdE1vZGUge1xuXHRcdGNvbnN0IGZsYXQgPSBbXG5cdFx0XHQuLi5tb2Rlcy5idWlsdGluLmZpbHRlcihtb2RlID0+IHtcblx0XHRcdFx0cmV0dXJuIG1vZGUua2luZCAhPT0gQ2hhdE1vZGVLaW5kLkVkaXQgfHwgcmVxdWVzdENvdW50ID09PSAwO1xuXHRcdFx0fSksXG5cdFx0XHQuLi4obW9kZXMuY3VzdG9tID8/IFtdKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgY3VyTW9kZUluZGV4ID0gZmxhdC5maW5kSW5kZXgobW9kZSA9PiBtb2RlLmlkID09PSBjaGF0V2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkKTtcblx0XHRjb25zdCBuZXdNb2RlID0gZmxhdFsoY3VyTW9kZUluZGV4ICsgMSkgJSBmbGF0Lmxlbmd0aF07XG5cdFx0cmV0dXJuIG5ld01vZGU7XG5cdH1cbn1cblxuY2xhc3MgU3dpdGNoVG9OZXh0TW9kZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zd2l0Y2hUb05leHRNb2RlbCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN3aXRjaFRvTmV4dE1vZGVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuc3dpdGNoVG9OZXh0TW9kZWwubGFiZWwnLCBcIlN3aXRjaCB0byBOZXh0IE1vZGVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdHdpZGdldD8uaW5wdXQuc3dpdGNoVG9OZXh0TW9kZWwoKTtcblx0fVxufVxuXG5jbGFzcyBTd2l0Y2hUb05leHRQaW5uZWRNb2RlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3dpdGNoVG9OZXh0UGlubmVkTW9kZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5zd2l0Y2hUb05leHRQaW5uZWRNb2RlbC5sYWJlbCcsIFwiU3dpdGNoIHRvIE5leHQgUGlubmVkIE1vZGVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdHdpZGdldD8uaW5wdXQuc3dpdGNoVG9OZXh0UGlubmVkTW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3Blbk1vZGVsUGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3Blbk1vZGVsUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3Blbk1vZGVsUGlja2VyLmxhYmVsJywgXCJPcGVuIE1vZGVsIFBpY2tlclwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBlcmlvZCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjpcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHQvLyBIaWRlIHRoZSBtb2RlbCBwaWNrZXIgd2hpbGUgYSBkZWxlZ2F0aW9uIChjb250aW51ZSBpbikgdGFyZ2V0IGlzIHBlbmRpbmdcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzVGFyZ2V0ZWRNb2RlbHMpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5rZXksIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vayksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCkpLFxuXHRcdFx0XHRcdFx0Ly8gSGlkZSBpbiB3ZWxjb21lIHZpZXcgd2hlbiBzZXNzaW9uIHR5cGUgaXMgbm90IGxvY2FsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQWdlbnRTZXNzaW9uc1dlbGNvbWUubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc1RhcmdldGVkTW9kZWxzLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdCksXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWR9YCwgdHJ1ZSkpKVxuXHRcdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0YXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWwod2lkZ2V0KTtcblx0XHRcdHdpZGdldC5pbnB1dC5vcGVuTW9kZWxQaWNrZXIoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5QZXJtaXNzaW9uUGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblBlcm1pc3Npb25QaWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuUGVybWlzc2lvblBpY2tlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLm9wZW5QZXJtaXNzaW9uUGlja2VyLmxhYmVsJywgXCJPcGVuIFBlcm1pc3Npb24gUGlja2VyXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NldFBlcm1pc3Npb25MZXZlbCcsIFwiU2V0IFBlcm1pc3Npb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46XG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5ub3RFcXVhbHNUbyhDaGF0TW9kZUtpbmQuQXNrKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZENvZGluZ0FnZW50SWQuaXNFcXVhbFRvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0KVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5QZXJtaXNzaW9uUGlja2VyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTW9kZVBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlUGlja2VyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3Blbk1vZGVQaWNrZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5vcGVuTW9kZVBpY2tlci5sYWJlbCcsIFwiT3BlbiBBZ2VudCBQaWNrZXJcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2V0Q2hhdE1vZGUnLCBcIlNldCBBZ2VudFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBlcmlvZCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dCxcblx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHQvLyBIaWRlIHRoZSBhZ2VudCBwaWNrZXIgd2hpbGUgYSBkZWxlZ2F0aW9uIChjb250aW51ZSBpbikgdGFyZ2V0IGlzIHBlbmRpbmdcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzQ3VzdG9tQWdlbnRUYXJnZXQpLFxuXHRcdFx0XHRcdFx0Ly8gU2hvdyBpbiB3ZWxjb21lIHZpZXcgZm9yIGxvY2FsIHNlc3Npb25zIG9yIHNlc3Npb25zIHdpdGggY3VzdG9tIGFnZW50IHRhcmdldFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNDdXN0b21BZ2VudFRhcmdldCxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUuaXNFcXVhbFRvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkpKSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHR3aWRnZXQuaW5wdXQub3Blbk1vZGVQaWNrZXIoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblNlc3Npb25UYXJnZXRQaWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuU2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLm9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyLmxhYmVsJywgXCJPcGVuIFNlc3Npb24gVGFyZ2V0IFBpY2tlclwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZXRTZXNzaW9uVGFyZ2V0JywgXCJTZXQgU2Vzc2lvbiBUYXJnZXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5vcihDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25Jc0VtcHR5LCBDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZSksIENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nSW5wdXQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLm5lZ2F0ZSgpKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbklzRW1wdHksXG5cdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5LFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSXNFbXB0eSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuRGVsZWdhdGlvblBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5EZWxlZ2F0aW9uUGlja2VyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkRlbGVnYXRpb25QaWNrZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5vcGVuRGVsZWdhdGlvblBpY2tlci5sYWJlbCcsIFwiT3BlbiBEZWxlZ2F0aW9uIFBpY2tlclwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxlZ2F0ZVNlc3Npb24nLCBcIkRlbGVnYXRlIFNlc3Npb25cIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25Jc0VtcHR5Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZ0lucHV0Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0XHRvcmRlcjogMC41LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblN1cHBvcnRzRGVsZWdhdGlvbixcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbklzRW1wdHkubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5EZWxlZ2F0aW9uUGlja2VyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuV29ya3NwYWNlUGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbldvcmtzcGFjZVBpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Xb3Jrc3BhY2VQaWNrZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5vcGVuV29ya3NwYWNlUGlja2VyLmxhYmVsJywgXCJPcGVuIFdvcmtzcGFjZSBQaWNrZXJcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2VsZWN0V29ya3NwYWNlJywgXCJTZWxlY3QgVGFyZ2V0IFdvcmtzcGFjZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5LFxuXHRcdFx0XHRcdG9yZGVyOiAwLjYsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQWdlbnRTZXNzaW9uc1dlbGNvbWUsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhsb2NhbENoYXRTZXNzaW9uVHlwZSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFRoZSBwaWNrZXIgaXMgb3BlbmVkIHZpYSB0aGUgYWN0aW9uIHZpZXcgaXRlbVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2Vzc2lvblByaW1hcnlQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jaGF0U2Vzc2lvblByaW1hcnlQaWNrZXInO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3BlbkNoYXRTZXNzaW9uUHJpbWFyeVBpY2tlci5sYWJlbCcsIFwiT3BlbiBQcmltYXJ5IFNlc3Npb24gUGlja2VyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gQ2xvdWQgc2Vzc2lvbnM6IGtlZXAgb24gdGhlIHByaW1hcnkgY2hhdCBpbnB1dCB0b29sYmFyXG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOlxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNNb2RlbHMsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50LFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLFxuXHRcdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5ub3RFcXVhbHNUbygnbG9jYWwnKVxuXHRcdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gQWxsIG90aGVyIGNvZGluZyBhZ2VudHMgKENsYXVkZSwgZXRjLik6IHNob3cgaW4gdGhlIHNlY29uZGFyeSB0b29sYmFyLlxuXHRcdFx0XHRcdC8vIEluIHRoZSBBZ2VudHMgd2luZG93IG9ubHksIGhpZGUgdGhlIHdvcmt0cmVlL2JyYW5jaCBwaWNrZXJzIGZvciBDb3BpbG90XG5cdFx0XHRcdFx0Ly8gQ0xJIHNlc3Npb25zIGJlY2F1c2UgdGhlaXIgb3B0aW9uIGdyb3VwcyBhcmUgc3VyZmFjZWQgdGhyb3VnaCB0aGUgQ0xJXG5cdFx0XHRcdFx0Ly8gc2Vzc2lvbiBVSSB0aGVyZS4gVGhleSByZW1haW4gdmlzaWJsZSBpbiB0aGUgcmVndWxhciBWUyBDb2RlIHdvcmtiZW5jaC5cblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46XG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc01vZGVscyxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5ub3RFcXVhbHNUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLm5vdEVxdWFsc1RvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudCxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZSxcblx0XHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUubm90RXF1YWxzVG8oJ2xvY2FsJylcblx0XHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5DaGF0U2Vzc2lvblBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY29uc3QgQ2hhbmdlQ2hhdE1vZGVsQWN0aW9uSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNoYW5nZU1vZGVsJztcbmNsYXNzIENoYW5nZUNoYXRNb2RlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBDaGFuZ2VDaGF0TW9kZWxBY3Rpb25JZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhbmdlQ2hhdE1vZGVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuY2hhbmdlTW9kZWwubGFiZWwnLCBcIkNoYW5nZSBNb2RlbFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWxJbmZvID0gYXJnc1swXSBhcyBQaWNrPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCAndmVuZG9yJyB8ICdpZCcgfCAnZmFtaWx5Jz47XG5cdFx0Ly8gVHlwZSBjaGVjayB0aGUgYXJnXG5cdFx0YXNzZXJ0VHlwZSh0eXBlb2YgbW9kZWxJbmZvLnZlbmRvciA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIG1vZGVsSW5mby5pZCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIG1vZGVsSW5mby5mYW1pbHkgPT09ICdzdHJpbmcnKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0cyA9IHdpZGdldFNlcnZpY2UuZ2V0QWxsV2lkZ2V0cygpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHdpZGdldHMpIHtcblx0XHRcdHdpZGdldC5pbnB1dC5zd2l0Y2hNb2RlbChtb2RlbEluZm8pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdTZXNzaW9uU3VibWl0QWN0aW9uIGV4dGVuZHMgU3VibWl0QWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdHMuc3VibWl0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBub3RJblByb2dyZXNzT3JFZGl0aW5nID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3Iod2hlbk5vQWN0aXZlUmVxdWVzdCwgQ2hhdENvbnRleHRLZXlzLmVkaXRpbmdSZXF1ZXN0VHlwZS5pc0VxdWFsVG8oQ2hhdENvbnRleHRLZXlzLkVkaXRpbmdSZXF1ZXN0VHlwZS5TZW50KSksXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuZWRpdGluZ1JlcXVlc3RUeXBlLm5vdEVxdWFsc1RvKENoYXRDb250ZXh0S2V5cy5FZGl0aW5nUmVxdWVzdFR5cGUuUXVldWUpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmVkaXRpbmdSZXF1ZXN0VHlwZS5ub3RFcXVhbHNUbyhDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlN0ZWVyKVxuXHRcdCk7XG5cblx0XHRjb25zdCBtZW51Q29uZGl0aW9uID0gQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5ub3RFcXVhbHNUbyhDaGF0TW9kZUtpbmQuQXNrKTtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNTZW5kYWJsZUNvbnRlbnQsXG5cdFx0XHRub3RJblByb2dyZXNzT3JFZGl0aW5nLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkXG5cdFx0KTtcblxuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDaGF0RWRpdGluZ1Nlc3Npb25TdWJtaXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0cy5zdWJtaXQubGFiZWwnLCBcIlNlbmRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dVcENvbXBhY3QsXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdG5vdEluUHJvZ3Jlc3NPckVkaXRpbmcsXG5cdFx0XHRcdFx0XHRtZW51Q29uZGl0aW9uKSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2VuZFRvTmV3Q2hhdCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm5ld0NoYXQubGFiZWwnLCBcIlNlbmQgdG8gTmV3IENoYXRcIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgU3VibWl0V2l0aG91dERpc3BhdGNoaW5nQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0V2l0aG91dERpc3BhdGNoaW5nJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0LFxuXHRcdFx0d2hlbk5vdEluUHJvZ3Jlc3MsXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQXNrKSxcblx0XHQpO1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN1Ym1pdFdpdGhvdXREaXNwYXRjaGluZ0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLnN1Ym1pdFdpdGhvdXREaXNwYXRjaC5sYWJlbCcsIFwiU2VuZFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQ/LndpZGdldCA/PyB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdHdpZGdldD8uYWNjZXB0SW5wdXQoY29udGV4dD8uaW5wdXRWYWx1ZSwgeyBub0NvbW1hbmREZXRlY3Rpb246IHRydWUgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTdWJtaXRXaXRoQ29kZWJhc2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdWJtaXRXaXRoQ29kZWJhc2UnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQsXG5cdFx0XHR3aGVuTm90SW5Qcm9ncmVzcyxcblx0XHQpO1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRTdWJtaXRXaXRoQ29kZWJhc2VBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhY3Rpb25zLmNoYXQuc3VibWl0V2l0aENvZGViYXNlJywgXCJTZW5kIHdpdGggezB9XCIsIGAke2NoYXRWYXJpYWJsZUxlYWRlcn1jb2RlYmFzZWApLFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhcmdzWzBdIGFzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb2RlYmFzZVRvb2wgPSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldFRvb2xCeU5hbWUoJ2NvZGViYXNlJyk7XG5cdFx0aWYgKCFjb2RlYmFzZVRvb2wpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3aWRnZXQuaW5wdXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoe1xuXHRcdFx0aWQ6IGNvZGViYXNlVG9vbC5pZCxcblx0XHRcdG5hbWU6IGNvZGViYXNlVG9vbC5kaXNwbGF5TmFtZSA/PyAnJyxcblx0XHRcdGZ1bGxOYW1lOiBjb2RlYmFzZVRvb2wuZGlzcGxheU5hbWUgPz8gJycsXG5cdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmlzVGhlbWVJY29uKGNvZGViYXNlVG9vbC5pY29uKSA/IGNvZGViYXNlVG9vbC5pY29uIDogdW5kZWZpbmVkLFxuXHRcdFx0a2luZDogJ3Rvb2wnXG5cdFx0fSk7XG5cdFx0d2lkZ2V0LmFjY2VwdElucHV0KCk7XG5cdH1cbn1cblxuY2xhc3MgU2VuZFRvTmV3Q2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0O1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2VuZFRvTmV3Q2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm5ld0NoYXQubGFiZWwnLCBcIlNlbmQgdG8gTmV3IENoYXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBjb250ZXh0Py53aWRnZXQgPz8gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0QmVmb3JlQ2xlYXIgPSB3aWRnZXQuZ2V0SW5wdXQoKTtcblxuXHRcdC8vIENhbmNlbCBhbnkgaW4tcHJvZ3Jlc3MgcmVxdWVzdCBiZWZvcmUgY2xlYXJpbmdcblx0XHRpZiAod2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0YXdhaXQgY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHdpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnbmV3U2Vzc2lvbkFjdGlvbicpO1xuXHRcdH1cblxuXHRcdGlmICh3aWRnZXQudmlld01vZGVsPy5tb2RlbCkge1xuXHRcdFx0aWYgKCEoYXdhaXQgaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uKHdpZGdldC52aWV3TW9kZWwubW9kZWwsIHVuZGVmaW5lZCwgZGlhbG9nU2VydmljZSkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbGVhciB0aGUgaW5wdXQgZnJvbSB0aGUgY3VycmVudCBzZXNzaW9uIGJlZm9yZSBjcmVhdGluZyBhIG5ldyBvbmVcblx0XHR3aWRnZXQuc2V0SW5wdXQoJycpO1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY2xlYXJDaGF0U2Vzc2lvblByZXNlcnZpbmdUeXBlLCB3aWRnZXQsIHVuZGVmaW5lZCk7XG5cblx0XHR3aWRnZXQuYWNjZXB0SW5wdXQoaW5wdXRCZWZvcmVDbGVhciwgeyBzdG9yZVRvSGlzdG9yeTogdHJ1ZSB9KTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgQ2FuY2VsQ2hhdEFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jYW5jZWwnO1xuZXhwb3J0IGNsYXNzIENhbmNlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBDYW5jZWxDaGF0QWN0aW9uSWQ7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDYW5jZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5jYW5jZWwubGFiZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zdG9wQ2lyY2xlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNBY3RpdmVSZXF1ZXN0LFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5yZW1vdGVKb2JDcmVhdGluZy5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRjdHhJc0dsb2JhbEVkaXRpbmdTZXNzaW9uLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdGN0eEhhc1JlcXVlc3RJblByb2dyZXNzLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlbW90ZUpvYkNyZWF0aW5nLm5lZ2F0ZSgpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CYWNrc3BhY2UgfSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudCwgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wQ2xhc3NpZmljYXRpb24+KENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50TmFtZSwge1xuXHRcdFx0XHRzb3VyY2U6ICdjYW5jZWxBY3Rpb24nLFxuXHRcdFx0XHRyZWFzb246ICdub1dpZGdldCcsXG5cdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiAndW5rbm93bicsXG5cdFx0XHRcdHBlbmRpbmdSZXF1ZXN0czogMCxcblx0XHRcdH0pO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKCdDaGF0Q2FuY2VsQWN0aW9uI3J1bjogTm8gZm9jdXNlZCBjaGF0IHdpZGdldCB3YXMgZm91bmQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGlmICh3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRhd2FpdCBjaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24od2lkZ2V0LnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdjYW5jZWxBY3Rpb24nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50LCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BDbGFzc2lmaWNhdGlvbj4oQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wRXZlbnROYW1lLCB7XG5cdFx0XHRcdHNvdXJjZTogJ2NhbmNlbEFjdGlvbicsXG5cdFx0XHRcdHJlYXNvbjogJ25vVmlld01vZGVsJyxcblx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6ICd1bmtub3duJyxcblx0XHRcdFx0cGVuZGluZ1JlcXVlc3RzOiAwLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2dTZXJ2aWNlLmluZm8oJ0NoYXRDYW5jZWxBY3Rpb24jcnVuOiBDYW5jZWxlZCBjaGF0IHdpZGdldCBoYXMgbm8gdmlldyBtb2RlbCcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY29uc3QgQ2FuY2VsQ2hhdEVkaXRJZCA9ICd3b3JrYmVuY2guZWRpdC5jaGF0LmNhbmNlbCc7XG5leHBvcnQgY2xhc3MgQ2FuY2VsRWRpdCBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBDYW5jZWxDaGF0RWRpdElkO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2FuY2VsRWRpdC5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmNhbmNlbEVkaXQubGFiZWwnLCBcIkNhbmNlbCBFZGl0XCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRpY29uOiBDb2RpY29uLngsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmlzUmVxdWVzdCwgQ2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmcsIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uRWRpdFJlcXVlc3RzfWAsICdpbnB1dCcpKVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5ob3ZlclZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24udG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaGFzTXVsdGlwbGVTZWxlY3Rpb25zLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLCBDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZ0lucHV0KSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliIC0gNVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQ/LndpZGdldCA/PyB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5maW5pc2hlZEVkaXRpbmcoKTtcblx0fVxufVxuXG4vLyAtLS0gSGFuZG9mZiBEaXNjb3ZlcnkgJiBFeGVjdXRpb24gQ29tbWFuZHMgLS0tXG5cbmV4cG9ydCBjb25zdCBHZXRIYW5kb2Zmc0FjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZXRIYW5kb2Zmcyc7XG5cbmludGVyZmFjZSBJR2V0SGFuZG9mZnNBcmdzIHtcblx0LyoqXG5cdCAqIE5hbWUgb2YgdGhlIGN1c3RvbSBhZ2VudCAoZGVmaW5lZCBpbiBhbiBgLmFnZW50Lm1kYCBmaWxlKSB3aG9zZSBoYW5kb2Zmc1xuXHQgKiB5b3Ugd2FudCB0byByZXRyaWV2ZS4gSWYgb21pdHRlZCwgYWxsXG5cdCAqIGhhbmRvZmZzIGZyb20gYWxsIGFnZW50cyBhbmQgYnVpbHQtaW4gbW9kZXMgYXJlIHJldHVybmVkLlxuXHQgKi9cblx0c291cmNlQ3VzdG9tQWdlbnQ/OiBzdHJpbmc7XG5cbn1cblxuLyoqXG4gKiBEaXNjb3ZlcnMgdGhlIGhhbmRvZmZzIGF2YWlsYWJsZSBhY3Jvc3MgY3VzdG9tIGFnZW50cyAoYW5kIGJ1aWx0LWluIG1vZGVzKS5cbiAqXG4gKiAqKlJldHVybiB2YWx1ZSoqOiBgSUN1c3RvbUFnZW50SW5mb1tdYCBcdTIwMTQgYW4gYXJyYXkgd2hlcmUgZWFjaCBlbGVtZW50XG4gKiByZXByZXNlbnRzIGFuIGFnZW50L21vZGUgd2l0aCBpdHMgYGlkYCwgYG5hbWVgLCBgaXNCdWlsdGluYCxcbiAqIGB2aXNpYmlsaXR5YCwgYW5kIGBoYW5kb2Zmc2AgbGlzdC5cbiAqXG4gKiBAc2VlIElDdXN0b21BZ2VudEluZm9cbiAqIEBzZWUgSUhhbmRvZmZJbmZvXG4gKi9cbmNsYXNzIEdldEhhbmRvZmZzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gR2V0SGFuZG9mZnNBY3Rpb25JZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR2V0SGFuZG9mZnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmdldEhhbmRvZmZzLmxhYmVsJywgXCJHZXQgSGFuZG9mZnNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgbW9kZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRNb2RlU2VydmljZSk7XG5cdFx0Y29uc3QgYXJnID0gYXJncy5hdCgwKSBhcyBJR2V0SGFuZG9mZnNBcmdzIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgeyBidWlsdGluLCBjdXN0b20gfSA9IGF3YWl0IG1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKTtcblx0XHRsZXQgYWxsTW9kZXM6IHJlYWRvbmx5IElDaGF0TW9kZVtdID0gWy4uLmJ1aWx0aW4sIC4uLmN1c3RvbV07XG5cblx0XHRpZiAoYXJnPy5zb3VyY2VDdXN0b21BZ2VudCkge1xuXHRcdFx0Y29uc3QgZmlsdGVyTmFtZSA9IGFyZy5zb3VyY2VDdXN0b21BZ2VudDtcblx0XHRcdGFsbE1vZGVzID0gYWxsTW9kZXMuZmlsdGVyKG0gPT4gbS5uYW1lLmdldCgpLnRvTG93ZXJDYXNlKCkgPT09IGZpbHRlck5hbWUudG9Mb3dlckNhc2UoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJ1aWxkQ3VzdG9tQWdlbnRIYW5kb2Zmc0luZm8oYWxsTW9kZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBFeGVjdXRlSGFuZG9mZkFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5leGVjdXRlSGFuZG9mZic7XG5cbmludGVyZmFjZSBJRXhlY3V0ZUhhbmRvZmZBcmdzIHtcblx0LyoqXG5cdCAqIFRoZSBzdGFibGUgaGFuZG9mZiBJRCAoZnJvbSBnZXRIYW5kb2ZmcykuIFByaW1hcnkgbWF0Y2gga2V5LlxuXHQgKiBJRHMgYXJlIHVuaXF1ZSB3aXRoaW4gYSBnaXZlbiBzb3VyY2UgYWdlbnQ7IHdoZW4gaGFuZG9mZnMgZnJvbVxuXHQgKiBtdWx0aXBsZSBzb3VyY2UgYWdlbnRzIHNoYXJlIHRoZSBzYW1lIHRhcmdldCtsYWJlbCwgYWxzbyBwcm92aWRlXG5cdCAqIGBzb3VyY2VDdXN0b21BZ2VudGAgdG8gZGlzYW1iaWd1YXRlLlxuXHQgKi9cblx0aWQ/OiBzdHJpbmc7XG5cdC8qKiBGYWxsYmFjazogaGFuZG9mZiBsYWJlbCB0byBtYXRjaC4gQ2FzZS1pbnNlbnNpdGl2ZS4gKi9cblx0bGFiZWw/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgY2hhdCBzZXNzaW9uIFVSSSBpZGVudGlmeWluZyB3aGljaCBjaGF0IHdpZGdldCB0byBleGVjdXRlIGluLlxuXHQgKiBJZiBvbWl0dGVkLCBmYWxscyBiYWNrIHRvIHRoZSBsYXN0LWZvY3VzZWQgY2hhdCB3aWRnZXQuXG5cdCAqL1xuXHRzZXNzaW9uUmVzb3VyY2U/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBOYW1lIG9mIHRoZSAqc291cmNlKiBjdXN0b20gYWdlbnQgKGZyb20gYC5hZ2VudC5tZGApIHRoYXQgZGVjbGFyZXMgdGhlIGhhbmRvZmYgdG9cblx0ICogZXhlY3V0ZS4gSWYgb21pdHRlZCwgZmFsbHMgYmFjayB0byB0aGUgc2Vzc2lvbidzIGN1cnJlbnRseSBhY3RpdmUgbW9kZS9hZ2VudC5cblx0ICovXG5cdHNvdXJjZUN1c3RvbUFnZW50Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUV4ZWN1dGVIYW5kb2ZmUmVzdWx0IHtcblx0c3VjY2VzczogYm9vbGVhbjtcblx0dGFyZ2V0TW9kZT86IHN0cmluZztcblx0ZXJyb3I/OiBzdHJpbmc7XG59XG5cbmNsYXNzIEV4ZWN1dGVIYW5kb2ZmQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRXhlY3V0ZUhhbmRvZmZBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmV4ZWN1dGVIYW5kb2ZmLmxhYmVsJywgXCJFeGVjdXRlIEhhbmRvZmZcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYXJnID0gYXJncy5hdCgwKSBhcyBJRXhlY3V0ZUhhbmRvZmZBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghYXJnPy5pZCAmJiAhYXJnPy5sYWJlbCkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRWl0aGVyIGlkIG9yIGxhYmVsIGlzIHJlcXVpcmVkJyB9O1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHRhcmdldCB3aWRnZXQ6IGV4cGxpY2l0IHNlc3Npb25SZXNvdXJjZSwgb3IgZmFsbCBiYWNrIHRvIGxhc3QtZm9jdXNlZFxuXHRcdGxldCB3aWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcmcuc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRsZXQgc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGFyZy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEludmFsaWQgc2Vzc2lvblJlc291cmNlIFVSSTogJyR7YXJnLnNlc3Npb25SZXNvdXJjZX0nYCB9O1xuXHRcdFx0fVxuXHRcdFx0d2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0fVxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBjaGF0IHdpZGdldCBmb3VuZC4gUHJvdmlkZSBzZXNzaW9uUmVzb3VyY2Ugb3IgZm9jdXMgYSBjaGF0IHdpZGdldC4nIH07XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgc291cmNlIGN1c3RvbSBhZ2VudCB3aG9zZSBoYW5kb2ZmcyB3ZSBzZWFyY2ggKGNhc2UtaW5zZW5zaXRpdmUpXG5cdFx0bGV0IHNvdXJjZU1vZGU6IElDaGF0TW9kZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYXJnLnNvdXJjZUN1c3RvbUFnZW50KSB7XG5cdFx0XHRjb25zdCBmaWx0ZXJOYW1lID0gYXJnLnNvdXJjZUN1c3RvbUFnZW50LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCB7IGJ1aWx0aW4sIGN1c3RvbSB9ID0gd2lkZ2V0LmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCk7XG5cdFx0XHRzb3VyY2VNb2RlID0gWy4uLmJ1aWx0aW4sIC4uLmN1c3RvbV0uZmluZChtID0+IG0ubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSBmaWx0ZXJOYW1lIHx8IG0uaWQudG9Mb3dlckNhc2UoKSA9PT0gZmlsdGVyTmFtZSk7XG5cdFx0fVxuXHRcdGlmICghc291cmNlTW9kZSkge1xuXHRcdFx0c291cmNlTW9kZSA9IHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kb2ZmcyA9IHNvdXJjZU1vZGU/LmhhbmRPZmZzPy5nZXQoKTtcblx0XHRpZiAoIWhhbmRvZmZzIHx8IGhhbmRvZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm8gaGFuZG9mZnMgYXZhaWxhYmxlIGZvciBtb2RlICcke3NvdXJjZU1vZGU/Lm5hbWUuZ2V0KCl9J2AgfTtcblx0XHR9XG5cblx0XHQvLyBNYXRjaCBieSBpZCBmaXJzdCwgdGhlbiBieSBsYWJlbFxuXHRcdGxldCBtYXRjaGVkSGFuZG9mZiA9IGFyZy5pZFxuXHRcdFx0PyBoYW5kb2Zmcy5maW5kKGggPT4gZ2V0SGFuZG9mZklkKGgpID09PSBhcmcuaWQpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGlmICghbWF0Y2hlZEhhbmRvZmYgJiYgYXJnLmxhYmVsKSB7XG5cdFx0XHRjb25zdCBsYWJlbExvd2VyID0gYXJnLmxhYmVsLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0bWF0Y2hlZEhhbmRvZmYgPSBoYW5kb2Zmcy5maW5kKGggPT4gaC5sYWJlbC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gbGFiZWxMb3dlcik7XG5cdFx0fVxuXG5cdFx0aWYgKCFtYXRjaGVkSGFuZG9mZikge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IGFyZy5pZCA/PyBhcmcubGFiZWw7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBObyBoYW5kb2ZmIHdpdGggaWRlbnRpZmllciAnJHtpZGVudGlmaWVyfScgZm91bmQgZm9yIG1vZGUgJyR7c291cmNlTW9kZT8ubmFtZS5nZXQoKX0nYCB9O1xuXHRcdH1cblxuXHRcdGF3YWl0IHdpZGdldC5leGVjdXRlSGFuZG9mZihtYXRjaGVkSGFuZG9mZik7XG5cdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgdGFyZ2V0TW9kZTogbWF0Y2hlZEhhbmRvZmYuYWdlbnQgfTtcblx0fVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucygpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihDaGF0U3VibWl0QWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2hhdFN1Ym1pdFBlbmRpbmdBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihDaGF0RWRpdGluZ1Nlc3Npb25TdWJtaXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihTdWJtaXRXaXRob3V0RGlzcGF0Y2hpbmdBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihDYW5jZWxBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihTZW5kVG9OZXdDaGF0QWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2hhdFN1Ym1pdFdpdGhDb2RlYmFzZUFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUNoYXRNb2RlQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoU3dpdGNoVG9OZXh0TW9kZWxBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihTd2l0Y2hUb05leHRQaW5uZWRNb2RlbEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKE9wZW5Nb2RlbFBpY2tlckFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKE9wZW5QZXJtaXNzaW9uUGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoT3Blbk1vZGVQaWNrZXJBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihPcGVuU2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKE9wZW5EZWxlZ2F0aW9uUGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoT3BlbldvcmtzcGFjZVBpY2tlckFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKENoYXRTZXNzaW9uUHJpbWFyeVBpY2tlckFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKENoYW5nZUNoYXRNb2RlbEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKENhbmNlbEVkaXQpKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihHZXRIYW5kb2Zmc0FjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uKSk7XG5cdHJldHVybiBzdG9yZTtcbn1cbiJd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
