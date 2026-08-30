var _a, _b;
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { isCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { isImplicitVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isStringVariableEntry, isWorkspaceVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { isChatViewTitleActionContext } from "../../common/actions/chatActions.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { isChatTreeItem, isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { IChatWidgetService } from "../chat.js";
class EditingSessionAction extends Action2 {
  constructor(opts) {
    super({
      category: CHAT_CATEGORY,
      ...opts
    });
  }
  run(accessor, ...args) {
    const context = getEditingSessionContext(accessor, args);
    if (!context || !context.editingSession) {
      return;
    }
    return this.runEditingSessionAction(accessor, context.editingSession, context.chatWidget, ...args);
  }
}
function getEditingSessionContext(accessor, args) {
  const arg0 = args.at(0);
  const context = isChatViewTitleActionContext(arg0) ? arg0 : void 0;
  const chatWidgetService = accessor.get(IChatWidgetService);
  const chatEditingService = accessor.get(IChatEditingService);
  let chatWidget = context ? chatWidgetService.getWidgetBySessionResource(context.sessionResource) : void 0;
  if (!chatWidget) {
    chatWidget = chatWidgetService.lastFocusedWidget ?? chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find((w) => w.supportsChangingModes);
  }
  if (!chatWidget?.viewModel) {
    return;
  }
  const editingSession = chatEditingService.getEditingSession(chatWidget.viewModel.model.sessionResource);
  return { editingSession, chatWidget };
}
class WorkingSetAction extends EditingSessionAction {
  runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    const uris = [];
    if (URI.isUri(args[0])) {
      uris.push(args[0]);
    } else if (chatWidget) {
      uris.push(...chatWidget.input.selectedElements);
    }
    if (!uris.length) {
      return;
    }
    return this.runWorkingSetAction(accessor, editingSession, chatWidget, ...uris);
  }
}
registerAction2(class OpenFileInDiffAction extends WorkingSetAction {
  constructor() {
    super({
      id: "chatEditing.openFileInDiff",
      title: localize2("open.fileInDiff", "Open Changes in Diff Editor"),
      icon: Codicon.diffSingle,
      menu: [{
        id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
        when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
        order: 2,
        group: "navigation"
      }]
    });
  }
  async runWorkingSetAction(accessor, currentEditingSession, _chatWidget, ...uris) {
    const editorService = accessor.get(IEditorService);
    for (const uri of uris) {
      const pane = await editorService.openEditor({ resource: uri });
      if (!pane) {
        return;
      }
      const editedFile = currentEditingSession.getEntry(uri);
      editedFile?.getEditorIntegration(pane).toggleDiff(void 0, true);
    }
  }
});
registerAction2(class AcceptAction extends WorkingSetAction {
  constructor() {
    super({
      id: "chatEditing.acceptFile",
      title: localize2("accept.file", "Keep"),
      icon: Codicon.check,
      menu: [{
        when: ContextKeyExpr.and(ContextKeyExpr.equals("resourceScheme", CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 0,
        group: "navigation"
      }, {
        id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
        when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
        order: 0,
        group: "navigation"
      }]
    });
  }
  async runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris) {
    await currentEditingSession.accept(...uris);
  }
});
registerAction2(class DiscardAction extends WorkingSetAction {
  constructor() {
    super({
      id: "chatEditing.discardFile",
      title: localize2("discard.file", "Undo"),
      icon: Codicon.discard,
      menu: [{
        when: ContextKeyExpr.and(ContextKeyExpr.equals("resourceScheme", CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 2,
        group: "navigation"
      }, {
        id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
        when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
        order: 1,
        group: "navigation"
      }]
    });
  }
  async runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris) {
    await currentEditingSession.reject(...uris);
  }
});
class ChatEditingAcceptAllAction extends EditingSessionAction {
  constructor() {
    super({
      id: "chatEditing.acceptAllFiles",
      title: localize("accept", "Keep"),
      icon: Codicon.check,
      tooltip: localize("acceptAllEdits", "Keep All Edits"),
      precondition: hasUndecidedChatEditingResourceContextKey,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput),
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: [
        {
          id: MenuId.ChatEditingWidgetToolbar,
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey))
        }
      ]
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    await editingSession.accept();
  }
}
registerAction2(ChatEditingAcceptAllAction);
class ChatEditingDiscardAllAction extends EditingSessionAction {
  constructor() {
    super({
      id: "chatEditing.discardAllFiles",
      title: localize("discard", "Undo"),
      icon: Codicon.discard,
      tooltip: localize("discardAllEdits", "Undo All Edits"),
      precondition: hasUndecidedChatEditingResourceContextKey,
      menu: [
        {
          id: MenuId.ChatEditingWidgetToolbar,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), hasUndecidedChatEditingResourceContextKey)
        }
      ],
      keybinding: {
        when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput, ChatContextKeys.inputHasText.negate()),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Backspace
      }
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    await discardAllEditsWithConfirmation(accessor, editingSession);
  }
}
registerAction2(ChatEditingDiscardAllAction);
const _ToggleExplanationWidgetAction = class _ToggleExplanationWidgetAction extends EditingSessionAction {
  constructor() {
    super({
      id: _ToggleExplanationWidgetAction.ID,
      title: localize("explainButton", "Explain"),
      tooltip: localize("toggleExplanationTooltip", "Toggle Change Explanations"),
      precondition: hasUndecidedChatEditingResourceContextKey,
      menu: [
        {
          id: MenuId.ChatEditingWidgetToolbar,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ContextKeyExpr.has(`config.${ChatConfiguration.ExplainChangesEnabled}`))
        }
      ]
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    if (editingSession.hasExplanations()) {
      editingSession.clearExplanations();
    } else {
      await editingSession.triggerExplanationGeneration();
    }
  }
};
_ToggleExplanationWidgetAction.ID = "chatEditing.toggleExplanationWidget";
let ToggleExplanationWidgetAction = _ToggleExplanationWidgetAction;
registerAction2(ToggleExplanationWidgetAction);
async function discardAllEditsWithConfirmation(accessor, currentEditingSession) {
  const dialogService = accessor.get(IDialogService);
  const entries = currentEditingSession.entries.get().filter((e) => e.state.get() === ModifiedFileEntryState.Modified);
  if (entries.length > 0) {
    const confirmation = await dialogService.confirm({
      title: localize("chat.editing.discardAll.confirmation.title", "Undo all edits?"),
      message: entries.length === 1 ? localize("chat.editing.discardAll.confirmation.oneFile", "This will undo changes made in {0}. Do you want to proceed?", basename(entries[0].modifiedURI)) : localize("chat.editing.discardAll.confirmation.manyFiles", "This will undo changes made in {0} files. Do you want to proceed?", entries.length),
      primaryButton: localize("chat.editing.discardAll.confirmation.primaryButton", "Yes"),
      type: "info"
    });
    if (!confirmation.confirmed) {
      return false;
    }
  }
  await currentEditingSession.reject();
  return true;
}
const _ChatEditingShowChangesAction = class _ChatEditingShowChangesAction extends EditingSessionAction {
  constructor() {
    super({
      id: _ChatEditingShowChangesAction.ID,
      title: { value: _ChatEditingShowChangesAction.LABEL, original: _ChatEditingShowChangesAction.LABEL },
      tooltip: _ChatEditingShowChangesAction.LABEL,
      f1: true,
      icon: Codicon.diffMultiple,
      precondition: hasUndecidedChatEditingResourceContextKey,
      menu: [
        {
          id: MenuId.ChatEditingWidgetToolbar,
          group: "navigation",
          order: 4,
          when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey))
        }
      ]
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    await editingSession.show();
  }
};
_ChatEditingShowChangesAction.ID = "chatEditing.viewChanges";
_ChatEditingShowChangesAction.LABEL = localize("chatEditing.viewChanges", "View All Edits");
let ChatEditingShowChangesAction = _ChatEditingShowChangesAction;
registerAction2(ChatEditingShowChangesAction);
function filterToUserAttachedContext(attachedContext) {
  if (!attachedContext?.length) {
    return [];
  }
  return attachedContext.filter(
    (a) => !isImplicitVariableEntry(a) && !isWorkspaceVariableEntry(a) && !isStringVariableEntry(a) && !(isPromptFileVariableEntry(a) && a.automaticallyAdded) && !(isPromptTextVariableEntry(a) && a.automaticallyAdded)
  );
}
function restoreRequestToMainInputIfEmpty(widget, item) {
  if (!widget || !isRequestVM(item)) {
    return void 0;
  }
  const input = widget.inputPart;
  if (input.inputEditor.getValue() || filterToUserAttachedContext(input.attachmentModel.attachments).length) {
    return void 0;
  }
  input.focus();
  input.setValue(item.messageText, false);
  return filterToUserAttachedContext(item.attachedContext);
}
async function restoreSnapshotWithConfirmationByRequestId(accessor, sessionResource, requestId) {
  const configurationService = accessor.get(IConfigurationService);
  const dialogService = accessor.get(IDialogService);
  const chatWidgetService = accessor.get(IChatWidgetService);
  const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
  const chatService = accessor.get(IChatService);
  const chatModel = chatService.getSession(sessionResource);
  if (!chatModel) {
    return false;
  }
  const session = chatModel.editingSession;
  if (!session) {
    return false;
  }
  const chatRequests = chatModel.getRequests();
  const itemIndex = chatRequests.findIndex((request) => request.id === requestId);
  if (itemIndex === -1) {
    return false;
  }
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
    widget?.viewModel?.model.setCheckpoint(void 0);
    return false;
  }
  if (confirmation.checkboxChecked) {
    await configurationService.updateValue("chat.editing.confirmEditRequestRemoval", false);
  }
  await chatService.cancelCurrentRequestForSession(sessionResource, "restoreCheckpoint");
  const snapshotRequestId = chatRequests[itemIndex].id;
  await session.restoreSnapshot(snapshotRequestId, void 0);
  return true;
}
async function restoreSnapshotWithConfirmation(accessor, item) {
  const requestId = isRequestVM(item) ? item.id : isResponseVM(item) ? item.requestId : void 0;
  if (!requestId) {
    return false;
  }
  return restoreSnapshotWithConfirmationByRequestId(accessor, item.sessionResource, requestId);
}
registerAction2(class RemoveAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.undoEdits",
      title: localize2("chat.undoEdits.label", "Undo Requests"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.discard,
      keybinding: {
        primary: KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Backspace
        },
        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate(), ChatContextKeys.inChatQuestionCarousel.negate(), ChatContextKeys.readOnly.negate()),
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: [
        {
          id: MenuId.ChatMessageTitle,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, "input").negate(), ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, false), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.readOnly.negate())
        }
      ]
    });
  }
  async run(accessor, ...args) {
    let item = args[0];
    const chatWidgetService = accessor.get(IChatWidgetService);
    const configurationService = accessor.get(IConfigurationService);
    const widget = isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource) || chatWidgetService.lastFocusedWidget;
    if (!isResponseVM(item) && !isRequestVM(item)) {
      item = widget?.getFocus();
    }
    if (!item) {
      return;
    }
    const confirmed = await restoreSnapshotWithConfirmation(accessor, item);
    if (confirmed && isRequestVM(item) && configurationService.getValue("chat.undoRequests.restoreInput")) {
      widget?.focusInput();
      widget?.input.setValue(item.messageText, false);
      const userAttachments = filterToUserAttachedContext(item.attachedContext);
      if (userAttachments.length) {
        await widget?.input.restoreAttachments(userAttachments);
      }
    }
  }
});
const RestoreCheckpointActionId = "workbench.action.chat.restoreCheckpoint";
registerAction2(class RestoreCheckpointAction extends Action2 {
  constructor() {
    super({
      id: RestoreCheckpointActionId,
      title: localize2("chat.restoreCheckpoint.label", "Restore Checkpoint"),
      tooltip: localize2("chat.restoreCheckpoint.tooltip", "Restores workspace and chat to this point"),
      f1: false,
      category: CHAT_CATEGORY,
      keybinding: {
        primary: KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Backspace
        },
        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate(), ChatContextKeys.inChatQuestionCarousel.negate(), ChatContextKeys.readOnly.negate()),
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: [
        {
          id: MenuId.ChatMessageCheckpoint,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ChatContextKeys.isRequest, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.isFirstRequest.negate(), ChatContextKeys.readOnly.negate())
        }
      ]
    });
  }
  async run(accessor, ...args) {
    let item = args[0];
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource) || chatWidgetService.lastFocusedWidget;
    if (!isResponseVM(item) && !isRequestVM(item)) {
      item = widget?.getFocus();
    }
    if (!item) {
      return;
    }
    widget?.viewModel?.model.setCheckpoint(item.id);
    const confirmed = await restoreSnapshotWithConfirmation(accessor, item);
    if (!confirmed) {
      return;
    }
    const userAttachments = restoreRequestToMainInputIfEmpty(widget, item);
    if (userAttachments?.length) {
      await widget?.inputPart.restoreAttachments(userAttachments);
    }
  }
});
const StartOverActionId = "workbench.action.chat.startOver";
registerAction2(class StartOverAction extends Action2 {
  constructor() {
    super({
      id: StartOverActionId,
      title: localize2("chat.startOver.label", "Start Over"),
      tooltip: localize2("chat.startOver.tooltip", "Clears the chat and undoes all changes"),
      f1: false,
      category: CHAT_CATEGORY,
      menu: [
        {
          id: MenuId.ChatMessageCheckpoint,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ChatContextKeys.isRequest, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.isFirstRequest, ChatContextKeys.readOnly.negate())
        }
      ]
    });
  }
  async run(accessor, ...args) {
    let item = args[0];
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource) || chatWidgetService.lastFocusedWidget;
    if (!isResponseVM(item) && !isRequestVM(item)) {
      item = widget?.getFocus();
    }
    if (!item) {
      return;
    }
    widget?.viewModel?.model.setCheckpoint(item.id);
    const confirmed = await restoreSnapshotWithConfirmation(accessor, item);
    if (!confirmed) {
      return;
    }
    const userAttachments = restoreRequestToMainInputIfEmpty(widget, item);
    if (userAttachments?.length) {
      await widget?.inputPart.restoreAttachments(userAttachments);
    }
  }
});
registerAction2(class RestoreLastCheckpoint extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.restoreLastCheckpoint",
      title: localize2("chat.restoreLastCheckpoint.label", "Restore to Last Checkpoint"),
      f1: true,
      category: CHAT_CATEGORY,
      icon: Codicon.discard,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.inChatSession,
        ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, true),
        ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession),
        ChatContextKeys.readOnly.negate()
      )
    });
  }
  async run(accessor, ...args) {
    let item = args[0];
    const chatWidgetService = accessor.get(IChatWidgetService);
    const chatService = accessor.get(IChatService);
    const widget = isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource) || chatWidgetService.lastFocusedWidget;
    if (!isResponseVM(item) && !isRequestVM(item)) {
      item = widget?.getFocus();
    }
    const sessionResource = widget?.viewModel?.sessionResource ?? (isChatTreeItem(item) ? item.sessionResource : void 0);
    if (!sessionResource) {
      return;
    }
    const chatModel = chatService.getSession(sessionResource);
    if (!chatModel?.editingSession) {
      return;
    }
    const checkpointRequest = chatModel.checkpoint;
    if (!checkpointRequest) {
      alert(localize("chat.restoreCheckpoint.none", "There is no checkpoint to restore."));
      return;
    }
    widget?.viewModel?.model.setCheckpoint(checkpointRequest.id);
    widget?.focusInput();
    widget?.input.setValue(checkpointRequest.message.text, false);
    await restoreSnapshotWithConfirmationByRequestId(accessor, sessionResource, checkpointRequest.id);
  }
});
registerAction2(class EditAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.editRequests",
      title: localize2("chat.editRequests.label", "Edit Request"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.edit,
      keybinding: {
        primary: KeyCode.Enter,
        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate(), ChatContextKeys.readOnly.negate()),
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: [
        {
          id: MenuId.ChatMessageTitle,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, "hover"), ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, "input")), ChatContextKeys.readOnly.negate())
        }
      ]
    });
  }
  async run(accessor, ...args) {
    let item = args[0];
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource) || chatWidgetService.lastFocusedWidget;
    if (!isResponseVM(item) && !isRequestVM(item)) {
      item = widget?.getFocus();
    }
    if (!item) {
      return;
    }
    if (isRequestVM(item)) {
      widget?.startEditing(item.id);
    }
  }
});
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: _a.id,
      title: localize("chat.openFileUpdatedBySnapshot.label", "Open File"),
      menu: [{
        id: MenuId.ChatEditingCodeBlockContext,
        group: "navigation",
        order: 0
      }]
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    if (!context?.sessionResource) {
      return;
    }
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({ resource: context.uri });
  }
}, _a.id = "chat.openFileUpdatedBySnapshot", _a));
registerAction2((_b = class extends Action2 {
  constructor() {
    super({
      id: _b.id,
      title: localize("chat.openSnapshot.label", "Open File Snapshot"),
      menu: [{
        id: MenuId.ChatEditingCodeBlockContext,
        group: "navigation",
        order: 1
      }]
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    if (!context?.sessionResource) {
      return;
    }
    const chatService = accessor.get(IChatService);
    const chatEditingService = accessor.get(IChatEditingService);
    const editorService = accessor.get(IEditorService);
    const chatModel = chatService.getSession(context.sessionResource);
    if (!chatModel) {
      return;
    }
    const snapshot = chatEditingService.getEditingSession(chatModel.sessionResource)?.getSnapshotUri(context.requestId, context.uri, context.stopId);
    if (snapshot) {
      const editor = await editorService.openEditor({ resource: snapshot, label: localize("chatEditing.snapshot", "{0} (Snapshot)", basename(context.uri)), options: { activation: EditorActivation.ACTIVATE } });
      if (isCodeEditor(editor)) {
        editor.updateOptions({ readOnly: true });
      }
    }
  }
}, _b.id = "chat.openFileSnapshot", _b));
registerAction2(class ResolveSymbolsContextAction extends EditingSessionAction {
  constructor() {
    super({
      id: "workbench.action.edits.addFilesFromReferences",
      title: localize2("addFilesFromReferences", "Add Files From References"),
      f1: false,
      category: CHAT_CATEGORY,
      menu: {
        id: MenuId.ChatInputSymbolAttachmentContext,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask), EditorContextKeys.hasReferenceProvider)
      }
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    if (args.length === 0 || !isLocation(args[0])) {
      return;
    }
    const textModelService = accessor.get(ITextModelService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const symbol = args[0];
    const modelReference = await textModelService.createModelReference(symbol.uri);
    try {
      const textModel = modelReference.object.textEditorModel;
      if (!textModel) {
        return;
      }
      const position = new Position(symbol.range.startLineNumber, symbol.range.startColumn);
      const [references, definitions, implementations] = await Promise.all([
        this.getReferences(position, textModel, languageFeaturesService),
        this.getDefinitions(position, textModel, languageFeaturesService),
        this.getImplementations(position, textModel, languageFeaturesService)
      ]);
      const attachments = [];
      for (const reference of [...definitions, ...implementations, ...references]) {
        attachments.push(chatWidget.attachmentModel.asFileVariableEntry(reference.uri));
      }
      chatWidget.attachmentModel.addContext(...attachments);
    } finally {
      modelReference.dispose();
    }
  }
  async getReferences(position, textModel, languageFeaturesService) {
    const referenceProviders = languageFeaturesService.referenceProvider.all(textModel);
    const references = await Promise.all(referenceProviders.map(async (referenceProvider) => {
      return await referenceProvider.provideReferences(textModel, position, { includeDeclaration: true }, CancellationToken.None) ?? [];
    }));
    return references.flat();
  }
  async getDefinitions(position, textModel, languageFeaturesService) {
    const definitionProviders = languageFeaturesService.definitionProvider.all(textModel);
    const definitions = await Promise.all(definitionProviders.map(async (definitionProvider) => {
      return await definitionProvider.provideDefinition(textModel, position, CancellationToken.None) ?? [];
    }));
    return definitions.flat();
  }
  async getImplementations(position, textModel, languageFeaturesService) {
    const implementationProviders = languageFeaturesService.implementationProvider.all(textModel);
    const implementations = await Promise.all(implementationProviders.map(async (implementationProvider) => {
      return await implementationProvider.provideImplementation(textModel, position, CancellationToken.None) ?? [];
    }));
    return implementations.flat();
  }
});
const _ViewPreviousEditsAction = class _ViewPreviousEditsAction extends EditingSessionAction {
  constructor() {
    super({
      id: _ViewPreviousEditsAction.Id,
      title: { value: _ViewPreviousEditsAction.Label, original: _ViewPreviousEditsAction.Label },
      tooltip: _ViewPreviousEditsAction.Label,
      f1: true,
      icon: Codicon.diffMultiple,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasUndecidedChatEditingResourceContextKey.negate()),
      menu: [
        {
          id: MenuId.ChatEditingWidgetToolbar,
          group: "navigation",
          order: 4,
          when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey.negate()))
        }
      ]
    });
  }
  async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
    await editingSession.show(true);
  }
};
_ViewPreviousEditsAction.Id = "chatEditing.viewPreviousEdits";
_ViewPreviousEditsAction.Label = localize("chatEditing.viewPreviousEdits", "View Previous Edits");
let ViewPreviousEditsAction = _ViewPreviousEditsAction;
registerAction2(ViewPreviousEditsAction);
CommandsRegistry.registerCommand("_chat.editSessions.accept", async (accessor, resources) => {
  if (resources.length === 0) {
    return;
  }
  const uris = resources.map((resource) => URI.revive(resource));
  const chatEditingService = accessor.get(IChatEditingService);
  for (const editingSession of chatEditingService.editingSessionsObs.get()) {
    await editingSession.accept(...uris);
  }
});
export {
  ChatEditingAcceptAllAction,
  ChatEditingDiscardAllAction,
  ChatEditingShowChangesAction,
  EditingSessionAction,
  RestoreCheckpointActionId,
  StartOverActionId,
  ToggleExplanationWidgetAction,
  ViewPreviousEditsAction,
  discardAllEditsWithConfirmation,
  getEditingSessionContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBpc0xvY2F0aW9uLCBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1wbGljaXRWYXJpYWJsZUVudHJ5LCBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5LCBpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5LCBpc1N0cmluZ1ZhcmlhYmxlRW50cnksIGlzV29ya3NwYWNlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGlzQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleUV4cHJzLCBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgYXBwbHlpbmdDaGF0RWRpdHNGYWlsZWRDb250ZXh0S2V5LCBDSEFUX0VESVRJTkdfTVVMVElfRElGRl9TT1VSQ0VfUkVTT0xWRVJfU0NIRU1FLCBjaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgY2hhdEVkaXRpbmdXaWRnZXRGaWxlU3RhdGVDb250ZXh0S2V5LCBkZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksIGhhc0FwcGxpZWRDaGF0RWRpdHNDb250ZXh0S2V5LCBoYXNVbmRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgSUNoYXRFZGl0aW5nU2VydmljZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDaGF0VHJlZUl0ZW0sIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBFZGl0aW5nU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKG9wdHM6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdC4uLm9wdHNcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGdldEVkaXRpbmdTZXNzaW9uQ29udGV4dChhY2Nlc3NvciwgYXJncyk7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICFjb250ZXh0LmVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucnVuRWRpdGluZ1Nlc3Npb25BY3Rpb24oYWNjZXNzb3IsIGNvbnRleHQuZWRpdGluZ1Nlc3Npb24sIGNvbnRleHQuY2hhdFdpZGdldCwgLi4uYXJncyk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRhYnN0cmFjdCBydW5FZGl0aW5nU2Vzc2lvbkFjdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0LCAuLi5hcmdzOiB1bmtub3duW10pOiBhbnk7XG59XG5cbmV4cG9ydCB0eXBlIEVkaXRpbmdTZXNzaW9uQWN0aW9uQ29udGV4dCA9IHsgZWRpdGluZ1Nlc3Npb24/OiBJQ2hhdEVkaXRpbmdTZXNzaW9uOyBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCB9O1xuXG4vKipcbiAqIFJlc29sdmUgdmlldyB0aXRsZSB0b29sYmFyIGNvbnRleHQuIElmIG5vbmUsIHJldHVybiBjb250ZXh0IGZyb20gdGhlIGxhc3RGb2N1c2VkV2lkZ2V0LlxuICovXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRpbmdTZXNzaW9uQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogYW55W10pOiBFZGl0aW5nU2Vzc2lvbkFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBhcmcwID0gYXJncy5hdCgwKTtcblx0Y29uc3QgY29udGV4dCA9IGlzQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQoYXJnMCkgPyBhcmcwIDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdGNvbnN0IGNoYXRFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblx0bGV0IGNoYXRXaWRnZXQgPSBjb250ZXh0ID8gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRpZiAoIWNoYXRXaWRnZXQpIHtcblx0XHRjaGF0V2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQgPz8gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0c0J5TG9jYXRpb25zKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLmZpbmQodyA9PiB3LnN1cHBvcnRzQ2hhbmdpbmdNb2Rlcyk7XG5cdH1cblxuXHRpZiAoIWNoYXRXaWRnZXQ/LnZpZXdNb2RlbCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGVkaXRpbmdTZXNzaW9uID0gY2hhdEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRpbmdTZXNzaW9uKGNoYXRXaWRnZXQudmlld01vZGVsLm1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdHJldHVybiB7IGVkaXRpbmdTZXNzaW9uLCBjaGF0V2lkZ2V0IH07XG59XG5cblxuYWJzdHJhY3QgY2xhc3MgV29ya2luZ1NldEFjdGlvbiBleHRlbmRzIEVkaXRpbmdTZXNzaW9uQWN0aW9uIHtcblxuXHRydW5FZGl0aW5nU2Vzc2lvbkFjdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0LCAuLi5hcmdzOiB1bmtub3duW10pIHtcblxuXHRcdGNvbnN0IHVyaXM6IFVSSVtdID0gW107XG5cdFx0aWYgKFVSSS5pc1VyaShhcmdzWzBdKSkge1xuXHRcdFx0dXJpcy5wdXNoKGFyZ3NbMF0pO1xuXHRcdH0gZWxzZSBpZiAoY2hhdFdpZGdldCkge1xuXHRcdFx0dXJpcy5wdXNoKC4uLmNoYXRXaWRnZXQuaW5wdXQuc2VsZWN0ZWRFbGVtZW50cyk7XG5cdFx0fVxuXHRcdGlmICghdXJpcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5ydW5Xb3JraW5nU2V0QWN0aW9uKGFjY2Vzc29yLCBlZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldCwgLi4udXJpcyk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRhYnN0cmFjdCBydW5Xb3JraW5nU2V0QWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQsIC4uLnVyaXM6IFVSSVtdKTogYW55O1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlbkZpbGVJbkRpZmZBY3Rpb24gZXh0ZW5kcyBXb3JraW5nU2V0QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjaGF0RWRpdGluZy5vcGVuRmlsZUluRGlmZicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuLmZpbGVJbkRpZmYnLCAnT3BlbiBDaGFuZ2VzIGluIERpZmYgRWRpdG9yJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmRpZmZTaW5nbGUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nV2lkZ2V0TW9kaWZpZWRGaWxlc1Rvb2xiYXIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhjaGF0RWRpdGluZ1dpZGdldEZpbGVTdGF0ZUNvbnRleHRLZXkua2V5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV29ya2luZ1NldEFjdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY3VycmVudEVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBfY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIC4uLnVyaXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblxuXHRcdFx0Ly8gQWx3YXlzIG9wZW4gdGhlIGVkaXRvciBmb3IgdGhlIHRhcmdldCBVUkkuIFVzaW5nIHRoZSBjdXJyZW50bHkgYWN0aXZlXG5cdFx0XHQvLyBlZGl0b3IgcGFuZSBpcyBub3Qgc2FmZSBiZWNhdXNlIGl0IG1heSBiZSB1bnJlbGF0ZWQgdG8gYHVyaWAgKGUuZy4gYVxuXHRcdFx0Ly8gd2VidmlldyksIGluIHdoaWNoIGNhc2UgYGdldEVkaXRvckludGVncmF0aW9uYCB3b3VsZCBoYXZlIG5vIGVmZmVjdC5cblx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdXJpIH0pO1xuXG5cdFx0XHRpZiAoIXBhbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0ZWRGaWxlID0gY3VycmVudEVkaXRpbmdTZXNzaW9uLmdldEVudHJ5KHVyaSk7XG5cdFx0XHRlZGl0ZWRGaWxlPy5nZXRFZGl0b3JJbnRlZ3JhdGlvbihwYW5lKS50b2dnbGVEaWZmKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFjY2VwdEFjdGlvbiBleHRlbmRzIFdvcmtpbmdTZXRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2NoYXRFZGl0aW5nLmFjY2VwdEZpbGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWNjZXB0LmZpbGUnLCAnS2VlcCcpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Jlc291cmNlU2NoZW1lJywgQ0hBVF9FRElUSU5HX01VTFRJX0RJRkZfU09VUkNFX1JFU09MVkVSX1NDSEVNRSksIENvbnRleHRLZXlFeHByLm5vdEluKGNoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LmtleSwgZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LmtleSkpLFxuXHRcdFx0XHRpZDogTWVudUlkLk11bHRpRGlmZkVkaXRvckZpbGVUb29sYmFyLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldE1vZGlmaWVkRmlsZXNUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoY2hhdEVkaXRpbmdXaWRnZXRGaWxlU3RhdGVDb250ZXh0S2V5LmtleSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCksXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldvcmtpbmdTZXRBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN1cnJlbnRFZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIC4uLnVyaXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY3VycmVudEVkaXRpbmdTZXNzaW9uLmFjY2VwdCguLi51cmlzKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEaXNjYXJkQWN0aW9uIGV4dGVuZHMgV29ya2luZ1NldEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY2hhdEVkaXRpbmcuZGlzY2FyZEZpbGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGlzY2FyZC5maWxlJywgJ1VuZG8nKSxcblx0XHRcdGljb246IENvZGljb24uZGlzY2FyZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Jlc291cmNlU2NoZW1lJywgQ0hBVF9FRElUSU5HX01VTFRJX0RJRkZfU09VUkNFX1JFU09MVkVSX1NDSEVNRSksIENvbnRleHRLZXlFeHByLm5vdEluKGNoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LmtleSwgZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LmtleSkpLFxuXHRcdFx0XHRpZDogTWVudUlkLk11bHRpRGlmZkVkaXRvckZpbGVUb29sYmFyLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldE1vZGlmaWVkRmlsZXNUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoY2hhdEVkaXRpbmdXaWRnZXRGaWxlU3RhdGVDb250ZXh0S2V5LmtleSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCksXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldvcmtpbmdTZXRBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN1cnJlbnRFZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIC4uLnVyaXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY3VycmVudEVkaXRpbmdTZXNzaW9uLnJlamVjdCguLi51cmlzKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdGluZ0FjY2VwdEFsbEFjdGlvbiBleHRlbmRzIEVkaXRpbmdTZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2NoYXRFZGl0aW5nLmFjY2VwdEFsbEZpbGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXB0JywgJ0tlZXAnKSxcblx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYWNjZXB0QWxsRWRpdHMnLCAnS2VlcCBBbGwgRWRpdHMnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogaGFzVW5kZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LCBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdXaWRnZXRUb29sYmFyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGFwcGx5aW5nQ2hhdEVkaXRzRmFpbGVkQ29udGV4dEtleS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuYW5kKGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5KSlcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuRWRpdGluZ1Nlc3Npb25BY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0YXdhaXQgZWRpdGluZ1Nlc3Npb24uYWNjZXB0KCk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihDaGF0RWRpdGluZ0FjY2VwdEFsbEFjdGlvbik7XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdGluZ0Rpc2NhcmRBbGxBY3Rpb24gZXh0ZW5kcyBFZGl0aW5nU2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjaGF0RWRpdGluZy5kaXNjYXJkQWxsRmlsZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkaXNjYXJkJywgJ1VuZG8nKSxcblx0XHRcdGljb246IENvZGljb24uZGlzY2FyZCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkaXNjYXJkQWxsRWRpdHMnLCAnVW5kbyBBbGwgRWRpdHMnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogaGFzVW5kZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nV2lkZ2V0VG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChhcHBseWluZ0NoYXRFZGl0c0ZhaWxlZENvbnRleHRLZXkubmVnYXRlKCksIGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5KVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaGFzVW5kZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksIENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCwgQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC5uZWdhdGUoKSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bkVkaXRpbmdTZXNzaW9uQWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGF3YWl0IGRpc2NhcmRBbGxFZGl0c1dpdGhDb25maXJtYXRpb24oYWNjZXNzb3IsIGVkaXRpbmdTZXNzaW9uKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKENoYXRFZGl0aW5nRGlzY2FyZEFsbEFjdGlvbik7XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVFeHBsYW5hdGlvbldpZGdldEFjdGlvbiBleHRlbmRzIEVkaXRpbmdTZXNzaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdEVkaXRpbmcudG9nZ2xlRXhwbGFuYXRpb25XaWRnZXQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVFeHBsYW5hdGlvbldpZGdldEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXhwbGFpbkJ1dHRvbicsICdFeHBsYWluJyksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgndG9nZ2xlRXhwbGFuYXRpb25Ub29sdGlwJywgJ1RvZ2dsZSBDaGFuZ2UgRXhwbGFuYXRpb25zJyksXG5cdFx0XHRwcmVjb25kaXRpb246IGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldFRvb2xiYXIsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaGFzVW5kZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksIENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uRXhwbGFpbkNoYW5nZXNFbmFibGVkfWApKVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuRWRpdGluZ1Nlc3Npb25BY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0aWYgKGVkaXRpbmdTZXNzaW9uLmhhc0V4cGxhbmF0aW9ucygpKSB7XG5cdFx0XHRlZGl0aW5nU2Vzc2lvbi5jbGVhckV4cGxhbmF0aW9ucygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBlZGl0aW5nU2Vzc2lvbi50cmlnZ2VyRXhwbGFuYXRpb25HZW5lcmF0aW9uKCk7XG5cdFx0fVxuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlRXhwbGFuYXRpb25XaWRnZXRBY3Rpb24pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGlzY2FyZEFsbEVkaXRzV2l0aENvbmZpcm1hdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY3VycmVudEVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cblx0Ly8gQXNrIGZvciBjb25maXJtYXRpb24gaWYgdGhlcmUgYXJlIGFueSBlZGl0c1xuXHRjb25zdCBlbnRyaWVzID0gY3VycmVudEVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCkuZmlsdGVyKGUgPT4gZS5zdGF0ZS5nZXQoKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBjb25maXJtYXRpb24gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LmVkaXRpbmcuZGlzY2FyZEFsbC5jb25maXJtYXRpb24udGl0bGUnLCBcIlVuZG8gYWxsIGVkaXRzP1wiKSxcblx0XHRcdG1lc3NhZ2U6IGVudHJpZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuZWRpdGluZy5kaXNjYXJkQWxsLmNvbmZpcm1hdGlvbi5vbmVGaWxlJywgXCJUaGlzIHdpbGwgdW5kbyBjaGFuZ2VzIG1hZGUgaW4gezB9LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBiYXNlbmFtZShlbnRyaWVzWzBdLm1vZGlmaWVkVVJJKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLmRpc2NhcmRBbGwuY29uZmlybWF0aW9uLm1hbnlGaWxlcycsIFwiVGhpcyB3aWxsIHVuZG8gY2hhbmdlcyBtYWRlIGluIHswfSBmaWxlcy4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgZW50cmllcy5sZW5ndGgpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2NoYXQuZWRpdGluZy5kaXNjYXJkQWxsLmNvbmZpcm1hdGlvbi5wcmltYXJ5QnV0dG9uJywgXCJZZXNcIiksXG5cdFx0XHR0eXBlOiAnaW5mbydcblx0XHR9KTtcblx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRhd2FpdCBjdXJyZW50RWRpdGluZ1Nlc3Npb24ucmVqZWN0KCk7XG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdTaG93Q2hhbmdlc0FjdGlvbiBleHRlbmRzIEVkaXRpbmdTZXNzaW9uQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXRFZGl0aW5nLnZpZXdDaGFuZ2VzJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NoYXRFZGl0aW5nLnZpZXdDaGFuZ2VzJywgJ1ZpZXcgQWxsIEVkaXRzJyk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRFZGl0aW5nU2hvd0NoYW5nZXNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogeyB2YWx1ZTogQ2hhdEVkaXRpbmdTaG93Q2hhbmdlc0FjdGlvbi5MQUJFTCwgb3JpZ2luYWw6IENoYXRFZGl0aW5nU2hvd0NoYW5nZXNBY3Rpb24uTEFCRUwgfSxcblx0XHRcdHRvb2x0aXA6IENoYXRFZGl0aW5nU2hvd0NoYW5nZXNBY3Rpb24uTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uZGlmZk11bHRpcGxlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBoYXNVbmRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdXaWRnZXRUb29sYmFyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGFwcGx5aW5nQ2hhdEVkaXRzRmFpbGVkQ29udGV4dEtleS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuYW5kKGhhc0FwcGxpZWRDaGF0RWRpdHNDb250ZXh0S2V5LCBoYXNVbmRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSkpXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5FZGl0aW5nU2Vzc2lvbkFjdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0LCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBlZGl0aW5nU2Vzc2lvbi5zaG93KCk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihDaGF0RWRpdGluZ1Nob3dDaGFuZ2VzQWN0aW9uKTtcblxuZnVuY3Rpb24gZmlsdGVyVG9Vc2VyQXR0YWNoZWRDb250ZXh0KGF0dGFjaGVkQ29udGV4dDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0aWYgKCFhdHRhY2hlZENvbnRleHQ/Lmxlbmd0aCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRyZXR1cm4gYXR0YWNoZWRDb250ZXh0LmZpbHRlcihhID0+XG5cdFx0IWlzSW1wbGljaXRWYXJpYWJsZUVudHJ5KGEpICYmXG5cdFx0IWlzV29ya3NwYWNlVmFyaWFibGVFbnRyeShhKSAmJlxuXHRcdCFpc1N0cmluZ1ZhcmlhYmxlRW50cnkoYSkgJiZcblx0XHQhKGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkoYSkgJiYgYS5hdXRvbWF0aWNhbGx5QWRkZWQpICYmXG5cdFx0IShpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5KGEpICYmIGEuYXV0b21hdGljYWxseUFkZGVkKVxuXHQpO1xufVxuXG5mdW5jdGlvbiByZXN0b3JlUmVxdWVzdFRvTWFpbklucHV0SWZFbXB0eSh3aWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkLCBpdGVtOiBDaGF0VHJlZUl0ZW0pOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQge1xuXHRpZiAoIXdpZGdldCB8fCAhaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgaW5wdXQgPSB3aWRnZXQuaW5wdXRQYXJ0O1xuXHRpZiAoaW5wdXQuaW5wdXRFZGl0b3IuZ2V0VmFsdWUoKSB8fCBmaWx0ZXJUb1VzZXJBdHRhY2hlZENvbnRleHQoaW5wdXQuYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzKS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aW5wdXQuZm9jdXMoKTtcblx0aW5wdXQuc2V0VmFsdWUoaXRlbS5tZXNzYWdlVGV4dCwgZmFsc2UpO1xuXHRyZXR1cm4gZmlsdGVyVG9Vc2VyQXR0YWNoZWRDb250ZXh0KGl0ZW0uYXR0YWNoZWRDb250ZXh0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzdG9yZVNuYXBzaG90V2l0aENvbmZpcm1hdGlvbkJ5UmVxdWVzdElkKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0aWYgKCFjaGF0TW9kZWwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBzZXNzaW9uID0gY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBjaGF0UmVxdWVzdHMgPSBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0Y29uc3QgaXRlbUluZGV4ID0gY2hhdFJlcXVlc3RzLmZpbmRJbmRleChyZXF1ZXN0ID0+IHJlcXVlc3QuaWQgPT09IHJlcXVlc3RJZCk7XG5cdGlmIChpdGVtSW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgZWRpdHNUb1VuZG8gPSBjaGF0UmVxdWVzdHMubGVuZ3RoIC0gaXRlbUluZGV4O1xuXG5cdGNvbnN0IHJlcXVlc3RzVG9SZW1vdmUgPSBjaGF0UmVxdWVzdHMuc2xpY2UoaXRlbUluZGV4KTtcblx0Y29uc3QgcmVxdWVzdElkc1RvUmVtb3ZlID0gbmV3IFNldChyZXF1ZXN0c1RvUmVtb3ZlLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuaWQpKTtcblx0Y29uc3QgZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlID0gc2Vzc2lvbi5lbnRyaWVzLmdldCgpLmZpbHRlcigoZW50cnkpID0+IHJlcXVlc3RJZHNUb1JlbW92ZS5oYXMoZW50cnkubGFzdE1vZGlmeWluZ1JlcXVlc3RJZCkpID8/IFtdO1xuXHRjb25zdCBzaG91bGRQcm9tcHQgPSBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoID4gMCAmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJlbW92YWwnKSA9PT0gdHJ1ZTtcblxuXHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRpZiAoZWRpdHNUb1VuZG8gPT09IDEpIHtcblx0XHRpZiAoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0LnJlbW92ZUxhc3QuY29uZmlybWF0aW9uLm1lc3NhZ2UyJywgXCJUaGlzIHdpbGwgcmVtb3ZlIHlvdXIgbGFzdCByZXF1ZXN0IGFuZCB1bmRvIHRoZSBlZGl0cyBtYWRlIHRvIHswfS4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgYmFzZW5hbWUoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlWzBdLm1vZGlmaWVkVVJJKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdC5yZW1vdmVMYXN0LmNvbmZpcm1hdGlvbi5tdWx0aXBsZUVkaXRzLm1lc3NhZ2UnLCBcIlRoaXMgd2lsbCByZW1vdmUgeW91ciBsYXN0IHJlcXVlc3QgYW5kIHVuZG8gZWRpdHMgbWFkZSB0byB7MH0gZmlsZXMgaW4geW91ciB3b3JraW5nIHNldC4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlLmxlbmd0aCk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmIChlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NoYXQucmVtb3ZlLmNvbmZpcm1hdGlvbi5tZXNzYWdlMicsIFwiVGhpcyB3aWxsIHJlbW92ZSBhbGwgc3Vic2VxdWVudCByZXF1ZXN0cyBhbmQgdW5kbyBlZGl0cyBtYWRlIHRvIHswfS4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgYmFzZW5hbWUoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlWzBdLm1vZGlmaWVkVVJJKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdC5yZW1vdmUuY29uZmlybWF0aW9uLm11bHRpcGxlRWRpdHMubWVzc2FnZScsIFwiVGhpcyB3aWxsIHJlbW92ZSBhbGwgc3Vic2VxdWVudCByZXF1ZXN0cyBhbmQgdW5kbyBlZGl0cyBtYWRlIHRvIHswfSBmaWxlcyBpbiB5b3VyIHdvcmtpbmcgc2V0LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBjb25maXJtYXRpb24gPSBzaG91bGRQcm9tcHRcblx0XHQ/IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0aXRsZTogZWRpdHNUb1VuZG8gPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5yZW1vdmVMYXN0LmNvbmZpcm1hdGlvbi50aXRsZScsIFwiRG8geW91IHdhbnQgdG8gdW5kbyB5b3VyIGxhc3QgZWRpdD9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZW1vdmUuY29uZmlybWF0aW9uLnRpdGxlJywgXCJEbyB5b3Ugd2FudCB0byB1bmRvIHswfSBlZGl0cz9cIiwgZWRpdHNUb1VuZG8pLFxuXHRcdFx0bWVzc2FnZTogbWVzc2FnZSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24ucHJpbWFyeUJ1dHRvbicsIFwiWWVzXCIpLFxuXHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24uY2hlY2tib3gnLCBcIkRvbid0IGFzayBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdHR5cGU6ICdpbmZvJ1xuXHRcdH0pXG5cdFx0OiB7IGNvbmZpcm1lZDogdHJ1ZSB9O1xuXG5cdGlmICghY29uZmlybWF0aW9uLmNvbmZpcm1lZCkge1xuXHRcdHdpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXRDaGVja3BvaW50KHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNvbmZpcm1hdGlvbi5jaGVja2JveENoZWNrZWQpIHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJlbW92YWwnLCBmYWxzZSk7XG5cdH1cblxuXHRhd2FpdCBjaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCAncmVzdG9yZUNoZWNrcG9pbnQnKTtcblxuXHQvLyBSZXN0b3JlIHRoZSBzbmFwc2hvdCB0byB3aGF0IGl0IHdhcyBiZWZvcmUgdGhlIHJlcXVlc3QocykgdGhhdCB3ZSBkZWxldGVkXG5cdGNvbnN0IHNuYXBzaG90UmVxdWVzdElkID0gY2hhdFJlcXVlc3RzW2l0ZW1JbmRleF0uaWQ7XG5cdGF3YWl0IHNlc3Npb24ucmVzdG9yZVNuYXBzaG90KHNuYXBzaG90UmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzdG9yZVNuYXBzaG90V2l0aENvbmZpcm1hdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogQ2hhdFRyZWVJdGVtKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGNvbnN0IHJlcXVlc3RJZCA9IGlzUmVxdWVzdFZNKGl0ZW0pID8gaXRlbS5pZCA6XG5cdFx0aXNSZXNwb25zZVZNKGl0ZW0pID8gaXRlbS5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cblx0aWYgKCFyZXF1ZXN0SWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gcmVzdG9yZVNuYXBzaG90V2l0aENvbmZpcm1hdGlvbkJ5UmVxdWVzdElkKGFjY2Vzc29yLCBpdGVtLnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlbW92ZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51bmRvRWRpdHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC51bmRvRWRpdHMubGFiZWwnLCBcIlVuZG8gUmVxdWVzdHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uZGlzY2FyZCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5pbkNoYXRRdWVzdGlvbkNhcm91c2VsLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMucmVhZE9ubHkubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5FZGl0UmVxdWVzdHN9YCwgJ2lucHV0JykubmVnYXRlKCksIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hlY2twb2ludHNFbmFibGVkfWAsIGZhbHNlKSwgQ29udGV4dEtleUV4cHIub3IoQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5RXhwcnMuaXNBZ2VudEhvc3RTZXNzaW9uKSwgQ2hhdENvbnRleHRLZXlzLnJlYWRPbmx5Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRsZXQgaXRlbSA9IGFyZ3NbMF0gYXMgQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSAoaXNDaGF0VHJlZUl0ZW0oaXRlbSkgJiYgY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoaXRlbS5zZXNzaW9uUmVzb3VyY2UpKSB8fCBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSAmJiAhaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdGl0ZW0gPSB3aWRnZXQ/LmdldEZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgcmVzdG9yZVNuYXBzaG90V2l0aENvbmZpcm1hdGlvbihhY2Nlc3NvciwgaXRlbSk7XG5cblx0XHRpZiAoY29uZmlybWVkICYmIGlzUmVxdWVzdFZNKGl0ZW0pICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LnVuZG9SZXF1ZXN0cy5yZXN0b3JlSW5wdXQnKSkge1xuXHRcdFx0d2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0XHR3aWRnZXQ/LmlucHV0LnNldFZhbHVlKGl0ZW0ubWVzc2FnZVRleHQsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHVzZXJBdHRhY2htZW50cyA9IGZpbHRlclRvVXNlckF0dGFjaGVkQ29udGV4dChpdGVtLmF0dGFjaGVkQ29udGV4dCk7XG5cdFx0XHRpZiAodXNlckF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB3aWRnZXQ/LmlucHV0LnJlc3RvcmVBdHRhY2htZW50cyh1c2VyQXR0YWNobWVudHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBSZXN0b3JlQ2hlY2twb2ludEFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXN0b3JlQ2hlY2twb2ludEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVzdG9yZUNoZWNrcG9pbnRBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQucmVzdG9yZUNoZWNrcG9pbnQubGFiZWwnLCBcIlJlc3RvcmUgQ2hlY2twb2ludFwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplMignY2hhdC5yZXN0b3JlQ2hlY2twb2ludC50b29sdGlwJywgXCJSZXN0b3JlcyB3b3Jrc3BhY2UgYW5kIGNoYXQgdG8gdGhpcyBwb2ludFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cy5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmluQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5yZWFkT25seS5uZWdhdGUoKSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdE1lc3NhZ2VDaGVja3BvaW50LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pc1JlcXVlc3QsIENvbnRleHRLZXlFeHByLm9yKENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbiksIENoYXRDb250ZXh0S2V5cy5pc0ZpcnN0UmVxdWVzdC5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLnJlYWRPbmx5Lm5lZ2F0ZSgpKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGxldCBpdGVtID0gYXJnc1swXSBhcyBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSAoaXNDaGF0VHJlZUl0ZW0oaXRlbSkgJiYgY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoaXRlbS5zZXNzaW9uUmVzb3VyY2UpKSB8fCBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSAmJiAhaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdGl0ZW0gPSB3aWRnZXQ/LmdldEZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0d2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNldENoZWNrcG9pbnQoaXRlbS5pZCk7XG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgcmVzdG9yZVNuYXBzaG90V2l0aENvbmZpcm1hdGlvbihhY2Nlc3NvciwgaXRlbSk7XG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyQXR0YWNobWVudHMgPSByZXN0b3JlUmVxdWVzdFRvTWFpbklucHV0SWZFbXB0eSh3aWRnZXQsIGl0ZW0pO1xuXHRcdGlmICh1c2VyQXR0YWNobWVudHM/Lmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgd2lkZ2V0Py5pbnB1dFBhcnQucmVzdG9yZUF0dGFjaG1lbnRzKHVzZXJBdHRhY2htZW50cyk7XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IFN0YXJ0T3ZlckFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdGFydE92ZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RhcnRPdmVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTdGFydE92ZXJBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc3RhcnRPdmVyLmxhYmVsJywgXCJTdGFydCBPdmVyXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUyKCdjaGF0LnN0YXJ0T3Zlci50b29sdGlwJywgXCJDbGVhcnMgdGhlIGNoYXQgYW5kIHVuZG9lcyBhbGwgY2hhbmdlc1wiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TWVzc2FnZUNoZWNrcG9pbnQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmlzUmVxdWVzdCwgQ29udGV4dEtleUV4cHIub3IoQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5RXhwcnMuaXNBZ2VudEhvc3RTZXNzaW9uKSwgQ2hhdENvbnRleHRLZXlzLmlzRmlyc3RSZXF1ZXN0LCBDaGF0Q29udGV4dEtleXMucmVhZE9ubHkubmVnYXRlKCkpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0bGV0IGl0ZW0gPSBhcmdzWzBdIGFzIENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IChpc0NoYXRUcmVlSXRlbShpdGVtKSAmJiBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShpdGVtLnNlc3Npb25SZXNvdXJjZSkpIHx8IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pICYmICFpc1JlcXVlc3RWTShpdGVtKSkge1xuXHRcdFx0aXRlbSA9IHdpZGdldD8uZ2V0Rm9jdXMoKTtcblx0XHR9XG5cblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2V0Q2hlY2twb2ludChpdGVtLmlkKTtcblx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCByZXN0b3JlU25hcHNob3RXaXRoQ29uZmlybWF0aW9uKGFjY2Vzc29yLCBpdGVtKTtcblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJBdHRhY2htZW50cyA9IHJlc3RvcmVSZXF1ZXN0VG9NYWluSW5wdXRJZkVtcHR5KHdpZGdldCwgaXRlbSk7XG5cdFx0aWYgKHVzZXJBdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB3aWRnZXQ/LmlucHV0UGFydC5yZXN0b3JlQXR0YWNobWVudHModXNlckF0dGFjaG1lbnRzKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzdG9yZUxhc3RDaGVja3BvaW50IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVMYXN0Q2hlY2twb2ludCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnJlc3RvcmVMYXN0Q2hlY2twb2ludC5sYWJlbCcsIFwiUmVzdG9yZSB0byBMYXN0IENoZWNrcG9pbnRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kaXNjYXJkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkNoZWNrcG9pbnRzRW5hYmxlZH1gLCB0cnVlKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5RXhwcnMuaXNBZ2VudEhvc3RTZXNzaW9uKSxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlYWRPbmx5Lm5lZ2F0ZSgpXG5cdFx0XHQpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGxldCBpdGVtID0gYXJnc1swXSBhcyBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IChpc0NoYXRUcmVlSXRlbShpdGVtKSAmJiBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShpdGVtLnNlc3Npb25SZXNvdXJjZSkpIHx8IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pICYmICFpc1JlcXVlc3RWTShpdGVtKSkge1xuXHRcdFx0aXRlbSA9IHdpZGdldD8uZ2V0Rm9jdXMoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlID8/IChpc0NoYXRUcmVlSXRlbShpdGVtKSA/IGl0ZW0uc2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWNoYXRNb2RlbD8uZWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGVja3BvaW50UmVxdWVzdCA9IGNoYXRNb2RlbC5jaGVja3BvaW50O1xuXHRcdGlmICghY2hlY2twb2ludFJlcXVlc3QpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdjaGF0LnJlc3RvcmVDaGVja3BvaW50Lm5vbmUnLCAnVGhlcmUgaXMgbm8gY2hlY2twb2ludCB0byByZXN0b3JlLicpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2V0Q2hlY2twb2ludChjaGVja3BvaW50UmVxdWVzdC5pZCk7XG5cdFx0d2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0d2lkZ2V0Py5pbnB1dC5zZXRWYWx1ZShjaGVja3BvaW50UmVxdWVzdC5tZXNzYWdlLnRleHQsIGZhbHNlKTtcblxuXHRcdGF3YWl0IHJlc3RvcmVTbmFwc2hvdFdpdGhDb25maXJtYXRpb25CeVJlcXVlc3RJZChhY2Nlc3Nvciwgc2Vzc2lvblJlc291cmNlLCBjaGVja3BvaW50UmVxdWVzdC5pZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRWRpdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5lZGl0UmVxdWVzdHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5lZGl0UmVxdWVzdHMubGFiZWwnLCBcIkVkaXQgUmVxdWVzdFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5lZGl0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMucmVhZE9ubHkubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5FZGl0UmVxdWVzdHN9YCwgJ2hvdmVyJyksIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uRWRpdFJlcXVlc3RzfWAsICdpbnB1dCcpKSwgQ2hhdENvbnRleHRLZXlzLnJlYWRPbmx5Lm5lZ2F0ZSgpKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGxldCBpdGVtID0gYXJnc1swXSBhcyBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSAoaXNDaGF0VHJlZUl0ZW0oaXRlbSkgJiYgY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoaXRlbS5zZXNzaW9uUmVzb3VyY2UpKSB8fCBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSAmJiAhaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdGl0ZW0gPSB3aWRnZXQ/LmdldEZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0XHR3aWRnZXQ/LnN0YXJ0RWRpdGluZyhpdGVtLmlkKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIENoYXRFZGl0aW5nQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IHN0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlbldvcmtpbmdTZXRIaXN0b3J5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2NoYXQub3BlbkZpbGVVcGRhdGVkQnlTbmFwc2hvdCc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuV29ya2luZ1NldEhpc3RvcnlBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQub3BlbkZpbGVVcGRhdGVkQnlTbmFwc2hvdC5sYWJlbCcsIFwiT3BlbiBGaWxlXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ0NvZGVCbG9ja0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0fSxdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhcmdzWzBdIGFzIENoYXRFZGl0aW5nQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjb250ZXh0LnVyaSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuV29ya2luZ1NldEhpc3RvcnlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5vcGVuRmlsZVNuYXBzaG90Jztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Xb3JraW5nU2V0SGlzdG9yeUFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5vcGVuU25hcHNob3QubGFiZWwnLCBcIk9wZW4gRmlsZSBTbmFwc2hvdFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdDb2RlQmxvY2tDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH0sXVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBDaGF0RWRpdGluZ0FjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFjb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhdE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBjaGF0RWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGluZ1Nlc3Npb24oY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSk/LmdldFNuYXBzaG90VXJpKGNvbnRleHQucmVxdWVzdElkLCBjb250ZXh0LnVyaSwgY29udGV4dC5zdG9wSWQpO1xuXHRcdGlmIChzbmFwc2hvdCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHNuYXBzaG90LCBsYWJlbDogbG9jYWxpemUoJ2NoYXRFZGl0aW5nLnNuYXBzaG90JywgJ3swfSAoU25hcHNob3QpJywgYmFzZW5hbWUoY29udGV4dC51cmkpKSwgb3B0aW9uczogeyBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLkFDVElWQVRFIH0gfSk7XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvcikpIHtcblx0XHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzb2x2ZVN5bWJvbHNDb250ZXh0QWN0aW9uIGV4dGVuZHMgRWRpdGluZ1Nlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdHMuYWRkRmlsZXNGcm9tUmVmZXJlbmNlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZGRGaWxlc0Zyb21SZWZlcmVuY2VzJywgXCJBZGQgRmlsZXMgRnJvbSBSZWZlcmVuY2VzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U3ltYm9sQXR0YWNobWVudENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFzayksIEVkaXRvckNvbnRleHRLZXlzLmhhc1JlZmVyZW5jZVByb3ZpZGVyKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuRWRpdGluZ1Nlc3Npb25BY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGFyZ3MubGVuZ3RoID09PSAwIHx8ICFpc0xvY2F0aW9uKGFyZ3NbMF0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBzeW1ib2wgPSBhcmdzWzBdIGFzIExvY2F0aW9uO1xuXG5cdFx0Y29uc3QgbW9kZWxSZWZlcmVuY2UgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHN5bWJvbC51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBtb2RlbFJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0aWYgKCF0ZXh0TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzeW1ib2wucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXG5cdFx0XHRjb25zdCBbcmVmZXJlbmNlcywgZGVmaW5pdGlvbnMsIGltcGxlbWVudGF0aW9uc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuZ2V0UmVmZXJlbmNlcyhwb3NpdGlvbiwgdGV4dE1vZGVsLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSksXG5cdFx0XHRcdHRoaXMuZ2V0RGVmaW5pdGlvbnMocG9zaXRpb24sIHRleHRNb2RlbCwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpLFxuXHRcdFx0XHR0aGlzLmdldEltcGxlbWVudGF0aW9ucyhwb3NpdGlvbiwgdGV4dE1vZGVsLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSlcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBTb3J0IHRoZSByZWZlcmVuY2VzLCBkZWZpbml0aW9ucyBhbmQgaW1wbGVtZW50YXRpb25zIGJ5XG5cdFx0XHQvLyBob3cgaW1wb3J0YW50IGl0IGlzIHRoYXQgdGhleSBtYWtlIGl0IGludG8gdGhlIHdvcmtpbmcgc2V0IGFzIGl0IGhhcyBsaW1pdGVkIHNpemVcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiBbLi4uZGVmaW5pdGlvbnMsIC4uLmltcGxlbWVudGF0aW9ucywgLi4ucmVmZXJlbmNlc10pIHtcblx0XHRcdFx0YXR0YWNobWVudHMucHVzaChjaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hc0ZpbGVWYXJpYWJsZUVudHJ5KHJlZmVyZW5jZS51cmkpKTtcblx0XHRcdH1cblxuXHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi5hdHRhY2htZW50cyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsUmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlZmVyZW5jZXMocG9zaXRpb246IFBvc2l0aW9uLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpOiBQcm9taXNlPExvY2F0aW9uW10+IHtcblx0XHRjb25zdCByZWZlcmVuY2VQcm92aWRlcnMgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlci5hbGwodGV4dE1vZGVsKTtcblxuXHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBhd2FpdCBQcm9taXNlLmFsbChyZWZlcmVuY2VQcm92aWRlcnMubWFwKGFzeW5jIChyZWZlcmVuY2VQcm92aWRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHJlZmVyZW5jZVByb3ZpZGVyLnByb3ZpZGVSZWZlcmVuY2VzKHRleHRNb2RlbCwgcG9zaXRpb24sIHsgaW5jbHVkZURlY2xhcmF0aW9uOiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpID8/IFtdO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZWZlcmVuY2VzLmZsYXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RGVmaW5pdGlvbnMocG9zaXRpb246IFBvc2l0aW9uLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpOiBQcm9taXNlPExvY2F0aW9uW10+IHtcblx0XHRjb25zdCBkZWZpbml0aW9uUHJvdmlkZXJzID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLmFsbCh0ZXh0TW9kZWwpO1xuXG5cdFx0Y29uc3QgZGVmaW5pdGlvbnMgPSBhd2FpdCBQcm9taXNlLmFsbChkZWZpbml0aW9uUHJvdmlkZXJzLm1hcChhc3luYyAoZGVmaW5pdGlvblByb3ZpZGVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZGVmaW5pdGlvblByb3ZpZGVyLnByb3ZpZGVEZWZpbml0aW9uKHRleHRNb2RlbCwgcG9zaXRpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpID8/IFtdO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkZWZpbml0aW9ucy5mbGF0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEltcGxlbWVudGF0aW9ucyhwb3NpdGlvbjogUG9zaXRpb24sIHRleHRNb2RlbDogSVRleHRNb2RlbCwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk6IFByb21pc2U8TG9jYXRpb25bXT4ge1xuXHRcdGNvbnN0IGltcGxlbWVudGF0aW9uUHJvdmlkZXJzID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW1wbGVtZW50YXRpb25Qcm92aWRlci5hbGwodGV4dE1vZGVsKTtcblxuXHRcdGNvbnN0IGltcGxlbWVudGF0aW9ucyA9IGF3YWl0IFByb21pc2UuYWxsKGltcGxlbWVudGF0aW9uUHJvdmlkZXJzLm1hcChhc3luYyAoaW1wbGVtZW50YXRpb25Qcm92aWRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGltcGxlbWVudGF0aW9uUHJvdmlkZXIucHJvdmlkZUltcGxlbWVudGF0aW9uKHRleHRNb2RlbCwgcG9zaXRpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpID8/IFtdO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBpbXBsZW1lbnRhdGlvbnMuZmxhdCgpO1xuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIFZpZXdQcmV2aW91c0VkaXRzQWN0aW9uIGV4dGVuZHMgRWRpdGluZ1Nlc3Npb25BY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnY2hhdEVkaXRpbmcudmlld1ByZXZpb3VzRWRpdHMnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdEVkaXRpbmcudmlld1ByZXZpb3VzRWRpdHMnLCAnVmlldyBQcmV2aW91cyBFZGl0cycpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBWaWV3UHJldmlvdXNFZGl0c0FjdGlvbi5JZCxcblx0XHRcdHRpdGxlOiB7IHZhbHVlOiBWaWV3UHJldmlvdXNFZGl0c0FjdGlvbi5MYWJlbCwgb3JpZ2luYWw6IFZpZXdQcmV2aW91c0VkaXRzQWN0aW9uLkxhYmVsIH0sXG5cdFx0XHR0b29sdGlwOiBWaWV3UHJldmlvdXNFZGl0c0FjdGlvbi5MYWJlbCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kaWZmTXVsdGlwbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgaGFzVW5kZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXkubmVnYXRlKCkpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldFRvb2xiYXIsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoYXBwbHlpbmdDaGF0RWRpdHNGYWlsZWRDb250ZXh0S2V5Lm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5hbmQoaGFzQXBwbGllZENoYXRFZGl0c0NvbnRleHRLZXksIGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5Lm5lZ2F0ZSgpKSlcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bkVkaXRpbmdTZXNzaW9uQWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGVkaXRpbmdTZXNzaW9uLnNob3codHJ1ZSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihWaWV3UHJldmlvdXNFZGl0c0FjdGlvbik7XG5cbi8qKlxuICogV29ya2JlbmNoIGNvbW1hbmQgdG8gZXhwbG9yZSBhY2NlcHRpbmcgd29ya2luZyBzZXQgY2hhbmdlcyBmcm9tIGFuIGV4dGVuc2lvbi4gRXhlY3V0aW5nXG4gKiB0aGUgY29tbWFuZCB3aWxsIGFjY2VwdCB0aGUgY2hhbmdlcyBmb3IgdGhlIHByb3ZpZGVkIHJlc291cmNlcyBhY3Jvc3MgYWxsIGVkaXQgc2Vzc2lvbnMuXG4gKi9cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfY2hhdC5lZGl0U2Vzc2lvbnMuYWNjZXB0JywgYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZXM6IFVyaUNvbXBvbmVudHNbXSkgPT4ge1xuXHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHVyaXMgPSByZXNvdXJjZXMubWFwKHJlc291cmNlID0+IFVSSS5yZXZpdmUocmVzb3VyY2UpKTtcblx0Y29uc3QgY2hhdEVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0RWRpdGluZ1NlcnZpY2UpO1xuXHRmb3IgKGNvbnN0IGVkaXRpbmdTZXNzaW9uIG9mIGNoYXRFZGl0aW5nU2VydmljZS5lZGl0aW5nU2Vzc2lvbnNPYnMuZ2V0KCkpIHtcblx0XHRhd2FpdCBlZGl0aW5nU2Vzc2lvbi5hY2NlcHQoLi4udXJpcyk7XG5cdH1cbn0pO1xuIl0s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
