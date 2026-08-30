import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { resolveCommandsContext } from "../../../../browser/parts/editor/editorCommandsContext.js";
import { ActiveEditorContext } from "../../../../common/contextkeys.js";
import { EditorResourceAccessor, SideBySideEditor, TEXT_DIFF_EDITOR_ID } from "../../../../common/editor.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService } from "../../../../services/editor/common/editorService.js";
import { MultiDiffEditor } from "../../../multiDiffEditor/browser/multiDiffEditor.js";
import { MultiDiffEditorInput } from "../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from "../../../notebook/common/notebookContextKeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatEditingService, ModifiedFileEntryState, parseChatMultiDiffUri, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME } from "../../common/editing/chatEditingService.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { ctxCursorInChangeRange, ctxHasEditorModification, ctxHasRequestInProgress, ctxIsCurrentlyBeingModified, ctxIsGlobalEditingSession, ctxReviewModeEnabled } from "./chatEditingEditorContextKeys.js";
import { ChatEditingExplanationWidgetManager } from "./chatEditingExplanationWidget.js";
import { IChatEditingExplanationModelManager } from "./chatEditingExplanationModelManager.js";
import { IChatWidgetService } from "../chat.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Event } from "../../../../../base/common/event.js";
import { ChatConfiguration } from "../../common/constants.js";
class ChatEditingEditorAction extends Action2 {
  constructor(desc) {
    super({
      category: CHAT_CATEGORY,
      ...desc
    });
  }
  async run(accessor, ...args) {
    const instaService = accessor.get(IInstantiationService);
    const chatEditingService = accessor.get(IChatEditingService);
    const editorService = accessor.get(IEditorService);
    const uri = EditorResourceAccessor.getOriginalUri(editorService.activeEditorPane?.input, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!uri || !editorService.activeEditorPane) {
      return;
    }
    const session = chatEditingService.editingSessionsObs.get().find((candidate) => candidate.getEntry(uri));
    if (!session) {
      return;
    }
    const entry = session.getEntry(uri);
    const ctrl = entry.getEditorIntegration(editorService.activeEditorPane);
    return instaService.invokeFunction(this.runChatEditingCommand.bind(this), session, entry, ctrl, ...args);
  }
}
class NavigateAction extends ChatEditingEditorAction {
  constructor(next) {
    super({
      id: next ? "chatEditor.action.navigateNext" : "chatEditor.action.navigatePrevious",
      title: next ? localize2("next", "Go to Next Chat Edit") : localize2("prev", "Go to Previous Chat Edit"),
      icon: next ? Codicon.arrowDown : Codicon.arrowUp,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ctxHasEditorModification),
      keybinding: {
        primary: next ? KeyMod.Alt | KeyCode.F5 : KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          ctxHasEditorModification,
          ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)
        )
      },
      f1: true,
      menu: {
        id: MenuId.ChatEditingEditorContent,
        group: "navigate",
        order: !next ? 2 : 3,
        when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification)
      }
    });
    this.next = next;
  }
  async runChatEditingCommand(accessor, session, entry, ctrl) {
    const instaService = accessor.get(IInstantiationService);
    const done = this.next ? ctrl.next(false) : ctrl.previous(false);
    if (done) {
      return;
    }
    const didOpenNext = await instaService.invokeFunction(openNextOrPreviousChange, session, entry, this.next);
    if (didOpenNext) {
      return;
    }
    this.next ? ctrl.next(true) : ctrl.previous(true);
  }
}
async function openNextOrPreviousChange(accessor, session, entry, next) {
  const editorService = accessor.get(IEditorService);
  const entries = session.entries.get();
  let idx = entries.indexOf(entry);
  let newEntry;
  while (true) {
    idx = (idx + (next ? 1 : -1) + entries.length) % entries.length;
    newEntry = entries[idx];
    if (newEntry.state.get() === ModifiedFileEntryState.Modified) {
      break;
    } else if (newEntry === entry) {
      return false;
    }
  }
  const pane = await editorService.openEditor({
    resource: newEntry.modifiedURI,
    options: {
      revealIfOpened: false,
      revealIfVisible: false
    }
  }, ACTIVE_GROUP);
  if (!pane) {
    return false;
  }
  if (session.entries.get().includes(newEntry)) {
    newEntry.getEditorIntegration(pane).reveal(next);
  }
  return true;
}
class KeepOrUndoAction extends ChatEditingEditorAction {
  constructor(id, _keep) {
    super({
      id,
      title: _keep ? localize2("accept", "Keep Chat Edits") : localize2("discard", "Undo Chat Edits"),
      shortTitle: _keep ? localize2("accept2", "Keep") : localize2("discard2", "Undo"),
      tooltip: _keep ? localize2("accept3", "Keep Chat Edits in this File") : localize2("discard3", "Undo Chat Edits in this File"),
      precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
      icon: _keep ? Codicon.check : Codicon.discard,
      f1: true,
      keybinding: {
        when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
        weight: KeybindingWeight.WorkbenchContrib + 10,
        // win over new-window-action
        primary: _keep ? KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY : KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN
      },
      menu: {
        id: MenuId.ChatEditingEditorContent,
        group: "a_resolve",
        order: _keep ? 0 : 1,
        when: ContextKeyExpr.and(!_keep ? ctxReviewModeEnabled : void 0, ContextKeyExpr.or(ctxIsGlobalEditingSession, ctxHasRequestInProgress.negate()))
      }
    });
    this._keep = _keep;
  }
  async runChatEditingCommand(accessor, session, entry, _integration) {
    const instaService = accessor.get(IInstantiationService);
    const configService = accessor.get(IConfigurationService);
    if (this._keep) {
      session.accept(entry.modifiedURI);
    } else {
      session.reject(entry.modifiedURI);
    }
    if (configService.getValue(ChatConfiguration.RevealNextChangeOnResolve)) {
      await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
    }
  }
}
const _AcceptAction = class _AcceptAction extends KeepOrUndoAction {
  constructor() {
    super(_AcceptAction.ID, true);
  }
};
_AcceptAction.ID = "chatEditor.action.accept";
let AcceptAction = _AcceptAction;
const _RejectAction = class _RejectAction extends KeepOrUndoAction {
  constructor() {
    super(_RejectAction.ID, false);
  }
};
_RejectAction.ID = "chatEditor.action.reject";
let RejectAction = _RejectAction;
const acceptHunkId = "chatEditor.action.acceptHunk";
const undoHunkId = "chatEditor.action.undoHunk";
class AcceptRejectHunkAction extends ChatEditingEditorAction {
  constructor(_accept) {
    super(
      {
        id: _accept ? acceptHunkId : undoHunkId,
        title: _accept ? localize2("acceptHunk", "Keep this Change") : localize2("undo", "Undo this Change"),
        shortTitle: _accept ? localize2("acceptHunkShort", "Keep") : localize2("undoShort", "Undo"),
        precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
        f1: true,
        keybinding: {
          when: ContextKeyExpr.and(ctxCursorInChangeRange, ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          primary: _accept ? KeyMod.CtrlCmd | KeyCode.KeyY : KeyMod.CtrlCmd | KeyCode.KeyN
        },
        menu: {
          id: MenuId.ChatEditingEditorHunk,
          order: 1
        }
      }
    );
    this._accept = _accept;
  }
  async runChatEditingCommand(accessor, session, entry, ctrl, ...args) {
    const instaService = accessor.get(IInstantiationService);
    const configService = accessor.get(IConfigurationService);
    if (this._accept) {
      await ctrl.acceptNearestChange(args[0]);
    } else {
      await ctrl.rejectNearestChange(args[0]);
    }
    if (configService.getValue(ChatConfiguration.RevealNextChangeOnResolve) && entry.changesCount.get() === 0) {
      await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
    }
  }
}
class AcceptHunkAction extends AcceptRejectHunkAction {
  constructor() {
    super(true);
  }
}
AcceptHunkAction.ID = acceptHunkId;
class RejectHunkAction extends AcceptRejectHunkAction {
  constructor() {
    super(false);
  }
}
RejectHunkAction.ID = undoHunkId;
class ToggleDiffAction extends ChatEditingEditorAction {
  constructor() {
    super({
      id: "chatEditor.action.toggleDiff",
      title: localize2("diff", "Toggle Diff Editor for Chat Edits"),
      category: CHAT_CATEGORY,
      toggled: {
        condition: ContextKeyExpr.or(EditorContextKeys.inDiffEditor, ActiveEditorContext.isEqualTo(TEXT_DIFF_EDITOR_ID)),
        icon: Codicon.goToFile
      },
      precondition: ContextKeyExpr.and(ctxHasEditorModification),
      icon: Codicon.diffSingle,
      keybinding: {
        when: EditorContextKeys.focus,
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F7
      },
      menu: [{
        id: MenuId.ChatEditingEditorHunk,
        order: 10
      }, {
        id: MenuId.ChatEditingEditorContent,
        group: "a_resolve",
        order: 2,
        when: ContextKeyExpr.and(ctxReviewModeEnabled)
      }]
    });
  }
  runChatEditingCommand(_accessor, _session, _entry, integration, ...args) {
    integration.toggleDiff(args[0]);
  }
}
class ToggleAccessibleDiffViewAction extends ChatEditingEditorAction {
  constructor() {
    super({
      id: "chatEditor.action.showAccessibleDiffView",
      title: localize2("accessibleDiff", "Show Accessible Diff View for Chat Edits"),
      f1: true,
      precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
      keybinding: {
        when: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.F7
      }
    });
  }
  runChatEditingCommand(_accessor, _session, _entry, integration) {
    integration.enableAccessibleDiffView();
  }
}
class ReviewChangesAction extends ChatEditingEditorAction {
  constructor() {
    super({
      id: "chatEditor.action.reviewChanges",
      title: localize2("review", "Review"),
      precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
      menu: [{
        id: MenuId.ChatEditingEditorContent,
        group: "a_resolve",
        order: 3,
        when: ContextKeyExpr.and(ctxReviewModeEnabled.negate(), ctxIsCurrentlyBeingModified.negate(), ContextKeyExpr.or(ctxIsGlobalEditingSession, ctxHasRequestInProgress.negate()))
      }]
    });
  }
  runChatEditingCommand(_accessor, _session, entry, _integration, ..._args) {
    entry.enableReviewModeUntilSettled();
  }
}
const _AcceptAllEditsAction = class _AcceptAllEditsAction extends ChatEditingEditorAction {
  constructor() {
    super({
      id: _AcceptAllEditsAction.ID,
      title: localize2("acceptAllEdits", "Keep All Chat Edits"),
      tooltip: localize2("acceptAllEditsTooltip", "Keep All Chat Edits in this Session"),
      precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
      icon: Codicon.checkAll,
      f1: true,
      keybinding: {
        when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
        weight: KeybindingWeight.WorkbenchContrib + 10,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyY
      }
    });
  }
  async runChatEditingCommand(_accessor, session, _entry, _integration, ..._args) {
    await session.accept();
  }
};
_AcceptAllEditsAction.ID = "chatEditor.action.acceptAllEdits";
let AcceptAllEditsAction = _AcceptAllEditsAction;
class MultiDiffAcceptDiscardAction extends Action2 {
  constructor(accept) {
    super({
      id: accept ? "chatEditing.multidiff.acceptAllFiles" : "chatEditing.multidiff.discardAllFiles",
      title: accept ? localize("accept4", "Keep All Edits") : localize("discard4", "Undo All Edits"),
      icon: accept ? Codicon.check : Codicon.discard,
      menu: {
        when: ContextKeyExpr.equals("resourceScheme", CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
        id: MenuId.EditorTitle,
        order: accept ? 0 : 1,
        group: "navigation"
      }
    });
    this.accept = accept;
  }
  async run(accessor, ...args) {
    const chatEditingService = accessor.get(IChatEditingService);
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const listService = accessor.get(IListService);
    const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
    const groupContext = resolvedContext.groupedEditors[0];
    if (!groupContext) {
      return;
    }
    const editor = groupContext.editors[0];
    if (!(editor instanceof MultiDiffEditorInput) || !editor.resource) {
      return;
    }
    const { chatSessionResource } = parseChatMultiDiffUri(editor.resource);
    const session = chatEditingService.getEditingSession(chatSessionResource);
    if (session) {
      if (this.accept) {
        await session.accept();
      } else {
        await session.reject();
      }
      editorService.closeEditor({ editor, groupId: groupContext.group.id });
    }
  }
}
const explainMultiDiffSchemes = [CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, "copilotcli-worktree-changes", "copilotcloud-pr-changes"];
class ExplainMultiDiffAction extends Action2 {
  constructor() {
    super({
      id: "chatEditing.multidiff.explain",
      title: localize("explain", "Explain"),
      menu: {
        when: ContextKeyExpr.and(ContextKeyExpr.or(...explainMultiDiffSchemes.map((scheme) => ContextKeyExpr.equals("resourceScheme", scheme))), ContextKeyExpr.has(`config.${ChatConfiguration.ExplainChangesEnabled}`)),
        id: MenuId.MultiDiffEditorContent,
        order: 10
      }
    });
    this._widgetsByInput = /* @__PURE__ */ new WeakMap();
  }
  async run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const explanationModelManager = accessor.get(IChatEditingExplanationModelManager);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const viewsService = accessor.get(IViewsService);
    const chatEditingService = accessor.get(IChatEditingService);
    const activePane = editorService.activeEditorPane;
    if (!activePane) {
      return;
    }
    if (!(activePane instanceof MultiDiffEditor) || !activePane.viewModel) {
      return;
    }
    const input = activePane.input;
    if (!input) {
      return;
    }
    this._widgetsByInput.get(input)?.dispose();
    const widgetsStore = new DisposableStore();
    this._widgetsByInput.set(input, widgetsStore);
    Event.once(input.onWillDispose)(() => {
      widgetsStore.dispose();
      this._widgetsByInput.delete(input);
    });
    const viewModel = activePane.viewModel;
    const items = viewModel.items.get();
    let chatSessionResource;
    if (input instanceof MultiDiffEditorInput && input.resource?.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME) {
      chatSessionResource = parseChatMultiDiffUri(input.resource).chatSessionResource;
    }
    if (!chatSessionResource) {
      const fileUris = items.map((item) => {
        const docDiffItem = item.documentDiffItem;
        const goToFileUri = docDiffItem?.multiDiffEditorItem?.goToFileUri;
        if (goToFileUri) {
          return goToFileUri;
        }
        const modifiedUri = docDiffItem?.multiDiffEditorItem?.modifiedUri ?? item.modifiedUri;
        if (modifiedUri?.path) {
          return URI.file(modifiedUri.path);
        }
        return void 0;
      }).filter((uri) => !!uri);
      for (const session of chatEditingService.editingSessionsObs.get()) {
        if (fileUris.some((uri) => session.getEntry(uri))) {
          chatSessionResource = session.chatSessionResource;
          break;
        }
      }
    }
    const diffsByFile = /* @__PURE__ */ new Map();
    for (const item of items) {
      const modifiedUri = item.modifiedUri;
      if (!modifiedUri) {
        continue;
      }
      const editorInfo = activePane.tryGetCodeEditor(modifiedUri);
      if (!editorInfo) {
        continue;
      }
      const diffEditorVM = item.diffEditorViewModel;
      await diffEditorVM.waitForDiff();
      const diff = diffEditorVM.diff.get();
      if (!diff || diff.identical) {
        continue;
      }
      const fileKey = modifiedUri.toString();
      const existing = diffsByFile.get(fileKey);
      if (existing) {
        existing.changes.push(...diff.mappings.map((m) => m.lineRangeMapping));
      } else {
        diffsByFile.set(fileKey, {
          editor: editorInfo.editor,
          changes: diff.mappings.map((m) => m.lineRangeMapping),
          originalModel: diffEditorVM.model.original,
          modifiedModel: diffEditorVM.model.modified
        });
      }
    }
    const allDiffInfos = [];
    for (const fileData of diffsByFile.values()) {
      const diffInfo = {
        changes: fileData.changes,
        identical: false,
        originalModel: fileData.originalModel,
        modifiedModel: fileData.modifiedModel
      };
      allDiffInfos.push(diffInfo);
      const manager = new ChatEditingExplanationWidgetManager(
        fileData.editor,
        chatWidgetService,
        viewsService,
        explanationModelManager,
        diffInfo.modifiedModel.uri
      );
      widgetsStore.add(manager);
    }
    if (allDiffInfos.length > 0) {
      widgetsStore.add(explanationModelManager.generateExplanations(allDiffInfos, chatSessionResource, CancellationToken.None));
    }
  }
}
function registerChatEditorActions() {
  registerAction2(class NextAction extends NavigateAction {
    constructor() {
      super(true);
    }
  });
  registerAction2(class PrevAction extends NavigateAction {
    constructor() {
      super(false);
    }
  });
  registerAction2(ReviewChangesAction);
  registerAction2(AcceptAction);
  registerAction2(RejectAction);
  registerAction2(AcceptAllEditsAction);
  registerAction2(AcceptHunkAction);
  registerAction2(RejectHunkAction);
  registerAction2(ToggleDiffAction);
  registerAction2(ToggleAccessibleDiffViewAction);
  registerAction2(class extends MultiDiffAcceptDiscardAction {
    constructor() {
      super(true);
    }
  });
  registerAction2(class extends MultiDiffAcceptDiscardAction {
    constructor() {
      super(false);
    }
  });
  registerAction2(ExplainMultiDiffAction);
  MenuRegistry.appendMenuItem(MenuId.ChatEditingEditorContent, {
    command: {
      id: navigationBearingFakeActionId,
      title: localize("label", "Navigation Status"),
      precondition: ContextKeyExpr.false()
    },
    group: "navigate",
    order: -1,
    when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification)
  });
}
const navigationBearingFakeActionId = "chatEditor.navigation.bearings";
export {
  AcceptAction,
  AcceptAllEditsAction,
  AcceptHunkAction,
  RejectAction,
  RejectHunkAction,
  ReviewChangesAction,
  navigationBearingFakeActionId,
  registerChatEditorActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0VkaXRvckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IsIFRFWFRfRElGRl9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbVdpdGhNdWx0aURpZmZFZGl0b3JJdGVtLCBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBJTW9kaWZpZWRGaWxlRW50cnksIElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmssIElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLCBwYXJzZUNoYXRNdWx0aURpZmZVcmksIENIQVRfRURJVElOR19NVUxUSV9ESUZGX1NPVVJDRV9SRVNPTFZFUl9TQ0hFTUUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgY3R4Q3Vyc29ySW5DaGFuZ2VSYW5nZSwgY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLCBjdHhIYXNSZXF1ZXN0SW5Qcm9ncmVzcywgY3R4SXNDdXJyZW50bHlCZWluZ01vZGlmaWVkLCBjdHhJc0dsb2JhbEVkaXRpbmdTZXNzaW9uLCBjdHhSZXZpZXdNb2RlRW5hYmxlZCB9IGZyb20gJy4vY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0TWFuYWdlciB9IGZyb20gJy4vY2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlciwgSUV4cGxhbmF0aW9uRGlmZkluZm8gfSBmcm9tICcuL2NoYXRFZGl0aW5nRXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcblxuXG5hYnN0cmFjdCBjbGFzcyBDaGF0RWRpdGluZ0VkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdC4uLmRlc2Ncblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0RWRpdGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRFZGl0aW5nU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCB1cmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdGlmICghdXJpIHx8ICFlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5nZXQoKVxuXHRcdFx0LmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5nZXRFbnRyeSh1cmkpKTtcblxuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5nZXRFbnRyeSh1cmkpITtcblx0XHRjb25zdCBjdHJsID0gZW50cnkuZ2V0RWRpdG9ySW50ZWdyYXRpb24oZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblxuXHRcdHJldHVybiBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5ydW5DaGF0RWRpdGluZ0NvbW1hbmQuYmluZCh0aGlzKSwgc2Vzc2lvbiwgZW50cnksIGN0cmwsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YWJzdHJhY3QgcnVuQ2hhdEVkaXRpbmdDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBlbnRyeTogSU1vZGlmaWVkRmlsZUVudHJ5LCBpbnRlZ3JhdGlvbjogSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24sIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4gfCB2b2lkO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBOYXZpZ2F0ZUFjdGlvbiBleHRlbmRzIENoYXRFZGl0aW5nRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBuZXh0OiBib29sZWFuKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IG5leHRcblx0XHRcdFx0PyAnY2hhdEVkaXRvci5hY3Rpb24ubmF2aWdhdGVOZXh0J1xuXHRcdFx0XHQ6ICdjaGF0RWRpdG9yLmFjdGlvbi5uYXZpZ2F0ZVByZXZpb3VzJyxcblx0XHRcdHRpdGxlOiBuZXh0XG5cdFx0XHRcdD8gbG9jYWxpemUyKCduZXh0JywgJ0dvIHRvIE5leHQgQ2hhdCBFZGl0Jylcblx0XHRcdFx0OiBsb2NhbGl6ZTIoJ3ByZXYnLCAnR28gdG8gUHJldmlvdXMgQ2hhdCBFZGl0JyksXG5cdFx0XHRpY29uOiBuZXh0ID8gQ29kaWNvbi5hcnJvd0Rvd24gOiBDb2RpY29uLmFycm93VXAsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogbmV4dFxuXHRcdFx0XHRcdD8gS2V5TW9kLkFsdCB8IEtleUNvZGUuRjVcblx0XHRcdFx0XHQ6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY1LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbixcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQpXG5cdFx0XHRcdCksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdFZGl0b3JDb250ZW50LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRlJyxcblx0XHRcdFx0b3JkZXI6ICFuZXh0ID8gMiA6IDMsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChjdHhSZXZpZXdNb2RlRW5hYmxlZCwgY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuQ2hhdEVkaXRpbmdDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBlbnRyeTogSU1vZGlmaWVkRmlsZUVudHJ5LCBjdHJsOiBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBkb25lID0gdGhpcy5uZXh0XG5cdFx0XHQ/IGN0cmwubmV4dChmYWxzZSlcblx0XHRcdDogY3RybC5wcmV2aW91cyhmYWxzZSk7XG5cblx0XHRpZiAoZG9uZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZE9wZW5OZXh0ID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKG9wZW5OZXh0T3JQcmV2aW91c0NoYW5nZSwgc2Vzc2lvbiwgZW50cnksIHRoaXMubmV4dCk7XG5cdFx0aWYgKGRpZE9wZW5OZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly9FTFNFOiB3cmFwIGluc2lkZSB0aGUgc2FtZSBmaWxlXG5cdFx0dGhpcy5uZXh0XG5cdFx0XHQ/IGN0cmwubmV4dCh0cnVlKVxuXHRcdFx0OiBjdHJsLnByZXZpb3VzKHRydWUpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG9wZW5OZXh0T3JQcmV2aW91c0NoYW5nZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSwgbmV4dDogYm9vbGVhbikge1xuXG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdGNvbnN0IGVudHJpZXMgPSBzZXNzaW9uLmVudHJpZXMuZ2V0KCk7XG5cdGxldCBpZHggPSBlbnRyaWVzLmluZGV4T2YoZW50cnkpO1xuXG5cdGxldCBuZXdFbnRyeTogSU1vZGlmaWVkRmlsZUVudHJ5O1xuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGlkeCA9IChpZHggKyAobmV4dCA/IDEgOiAtMSkgKyBlbnRyaWVzLmxlbmd0aCkgJSBlbnRyaWVzLmxlbmd0aDtcblx0XHRuZXdFbnRyeSA9IGVudHJpZXNbaWR4XTtcblx0XHRpZiAobmV3RW50cnkuc3RhdGUuZ2V0KCkgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH0gZWxzZSBpZiAobmV3RW50cnkgPT09IGVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcGFuZSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0cmVzb3VyY2U6IG5ld0VudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdHJldmVhbElmT3BlbmVkOiBmYWxzZSxcblx0XHRcdHJldmVhbElmVmlzaWJsZTogZmFsc2UsXG5cdFx0fVxuXHR9LCBBQ1RJVkVfR1JPVVApO1xuXG5cdGlmICghcGFuZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChzZXNzaW9uLmVudHJpZXMuZ2V0KCkuaW5jbHVkZXMobmV3RW50cnkpKSB7XG5cdFx0Ly8gbWFrZSBzdXJlIG5ld0VudHJ5IGlzIHN0aWxsIHZhbGlkIVxuXHRcdG5ld0VudHJ5LmdldEVkaXRvckludGVncmF0aW9uKHBhbmUpLnJldmVhbChuZXh0KTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBLZWVwT3JVbmRvQWN0aW9uIGV4dGVuZHMgQ2hhdEVkaXRpbmdFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHByaXZhdGUgX2tlZXA6IGJvb2xlYW4pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlOiBfa2VlcFxuXHRcdFx0XHQ/IGxvY2FsaXplMignYWNjZXB0JywgJ0tlZXAgQ2hhdCBFZGl0cycpXG5cdFx0XHRcdDogbG9jYWxpemUyKCdkaXNjYXJkJywgJ1VuZG8gQ2hhdCBFZGl0cycpLFxuXHRcdFx0c2hvcnRUaXRsZTogX2tlZXBcblx0XHRcdFx0PyBsb2NhbGl6ZTIoJ2FjY2VwdDInLCAnS2VlcCcpXG5cdFx0XHRcdDogbG9jYWxpemUyKCdkaXNjYXJkMicsICdVbmRvJyksXG5cdFx0XHR0b29sdGlwOiBfa2VlcFxuXHRcdFx0XHQ/IGxvY2FsaXplMignYWNjZXB0MycsICdLZWVwIENoYXQgRWRpdHMgaW4gdGhpcyBGaWxlJylcblx0XHRcdFx0OiBsb2NhbGl6ZTIoJ2Rpc2NhcmQzJywgJ1VuZG8gQ2hhdCBFZGl0cyBpbiB0aGlzIEZpbGUnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiwgY3R4SXNDdXJyZW50bHlCZWluZ01vZGlmaWVkLm5lZ2F0ZSgpKSxcblx0XHRcdGljb246IF9rZWVwXG5cdFx0XHRcdD8gQ29kaWNvbi5jaGVja1xuXHRcdFx0XHQ6IENvZGljb24uZGlzY2FyZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLCAvLyB3aW4gb3ZlciBuZXctd2luZG93LWFjdGlvblxuXHRcdFx0XHRwcmltYXJ5OiBfa2VlcFxuXHRcdFx0XHRcdD8gS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVlcblx0XHRcdFx0XHQ6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckNvbnRlbnQsXG5cdFx0XHRcdGdyb3VwOiAnYV9yZXNvbHZlJyxcblx0XHRcdFx0b3JkZXI6IF9rZWVwID8gMCA6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZCghX2tlZXAgPyBjdHhSZXZpZXdNb2RlRW5hYmxlZCA6IHVuZGVmaW5lZCwgQ29udGV4dEtleUV4cHIub3IoY3R4SXNHbG9iYWxFZGl0aW5nU2Vzc2lvbiwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MubmVnYXRlKCkpKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuQ2hhdEVkaXRpbmdDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBlbnRyeTogSU1vZGlmaWVkRmlsZUVudHJ5LCBfaW50ZWdyYXRpb246IElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAodGhpcy5fa2VlcCkge1xuXHRcdFx0c2Vzc2lvbi5hY2NlcHQoZW50cnkubW9kaWZpZWRVUkkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXNzaW9uLnJlamVjdChlbnRyeS5tb2RpZmllZFVSSSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUmV2ZWFsTmV4dENoYW5nZU9uUmVzb2x2ZSkpIHtcblx0XHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihvcGVuTmV4dE9yUHJldmlvdXNDaGFuZ2UsIHNlc3Npb24sIGVudHJ5LCB0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjY2VwdEFjdGlvbiBleHRlbmRzIEtlZXBPclVuZG9BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0RWRpdG9yLmFjdGlvbi5hY2NlcHQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEFjY2VwdEFjdGlvbi5JRCwgdHJ1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlamVjdEFjdGlvbiBleHRlbmRzIEtlZXBPclVuZG9BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0RWRpdG9yLmFjdGlvbi5yZWplY3QnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFJlamVjdEFjdGlvbi5JRCwgZmFsc2UpO1xuXHR9XG59XG5cbmNvbnN0IGFjY2VwdEh1bmtJZCA9ICdjaGF0RWRpdG9yLmFjdGlvbi5hY2NlcHRIdW5rJztcbmNvbnN0IHVuZG9IdW5rSWQgPSAnY2hhdEVkaXRvci5hY3Rpb24udW5kb0h1bmsnO1xuYWJzdHJhY3QgY2xhc3MgQWNjZXB0UmVqZWN0SHVua0FjdGlvbiBleHRlbmRzIENoYXRFZGl0aW5nRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9hY2NlcHQ6IGJvb2xlYW4pIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IF9hY2NlcHQgPyBhY2NlcHRIdW5rSWQgOiB1bmRvSHVua0lkLFxuXHRcdFx0XHR0aXRsZTogX2FjY2VwdCA/IGxvY2FsaXplMignYWNjZXB0SHVuaycsICdLZWVwIHRoaXMgQ2hhbmdlJykgOiBsb2NhbGl6ZTIoJ3VuZG8nLCAnVW5kbyB0aGlzIENoYW5nZScpLFxuXHRcdFx0XHRzaG9ydFRpdGxlOiBfYWNjZXB0ID8gbG9jYWxpemUyKCdhY2NlcHRIdW5rU2hvcnQnLCAnS2VlcCcpIDogbG9jYWxpemUyKCd1bmRvU2hvcnQnLCAnVW5kbycpLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24sIGN0eElzQ3VycmVudGx5QmVpbmdNb2RpZmllZC5uZWdhdGUoKSksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eEN1cnNvckluQ2hhbmdlUmFuZ2UsIENvbnRleHRLZXlFeHByLm9yKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCkpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRwcmltYXJ5OiBfYWNjZXB0XG5cdFx0XHRcdFx0XHQ/IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlZXG5cdFx0XHRcdFx0XHQ6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlOXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nRWRpdG9ySHVuayxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bkNoYXRFZGl0aW5nQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSwgY3RybDogSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24sIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKHRoaXMuX2FjY2VwdCkge1xuXHRcdFx0YXdhaXQgY3RybC5hY2NlcHROZWFyZXN0Q2hhbmdlKGFyZ3NbMF0gYXMgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGN0cmwucmVqZWN0TmVhcmVzdENoYW5nZShhcmdzWzBdIGFzIElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlJldmVhbE5leHRDaGFuZ2VPblJlc29sdmUpICYmIGVudHJ5LmNoYW5nZXNDb3VudC5nZXQoKSA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gbW9yZSBjaGFuZ2VzLCBtb3ZlIHRvIG5leHQgZmlsZVxuXHRcdFx0YXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKG9wZW5OZXh0T3JQcmV2aW91c0NoYW5nZSwgc2Vzc2lvbiwgZW50cnksIHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXB0SHVua0FjdGlvbiBleHRlbmRzIEFjY2VwdFJlamVjdEh1bmtBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IGFjY2VwdEh1bmtJZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVqZWN0SHVua0FjdGlvbiBleHRlbmRzIEFjY2VwdFJlamVjdEh1bmtBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IHVuZG9IdW5rSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UpO1xuXHR9XG59XG5cbmNsYXNzIFRvZ2dsZURpZmZBY3Rpb24gZXh0ZW5kcyBDaGF0RWRpdGluZ0VkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY2hhdEVkaXRvci5hY3Rpb24udG9nZ2xlRGlmZicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkaWZmJywgJ1RvZ2dsZSBEaWZmIEVkaXRvciBmb3IgQ2hhdCBFZGl0cycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuaW5EaWZmRWRpdG9yLCBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0RJRkZfRURJVE9SX0lEKSkhLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmRpZmZTaW5nbGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjcsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckh1bmssXG5cdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nRWRpdG9yQ29udGVudCxcblx0XHRcdFx0Z3JvdXA6ICdhX3Jlc29sdmUnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eFJldmlld01vZGVFbmFibGVkKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkNoYXRFZGl0aW5nQ29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBfZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSwgaW50ZWdyYXRpb246IElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aW50ZWdyYXRpb24udG9nZ2xlRGlmZihhcmdzWzBdIGFzIElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIFRvZ2dsZUFjY2Vzc2libGVEaWZmVmlld0FjdGlvbiBleHRlbmRzIENoYXRFZGl0aW5nRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjaGF0RWRpdG9yLmFjdGlvbi5zaG93QWNjZXNzaWJsZURpZmZWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FjY2Vzc2libGVEaWZmJywgJ1Nob3cgQWNjZXNzaWJsZSBEaWZmIFZpZXcgZm9yIENoYXQgRWRpdHMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLCBjdHhJc0N1cnJlbnRseUJlaW5nTW9kaWZpZWQubmVnYXRlKCkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GNyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkNoYXRFZGl0aW5nQ29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBfZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSwgaW50ZWdyYXRpb246IElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGludGVncmF0aW9uLmVuYWJsZUFjY2Vzc2libGVEaWZmVmlldygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXZpZXdDaGFuZ2VzQWN0aW9uIGV4dGVuZHMgQ2hhdEVkaXRpbmdFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY2hhdEVkaXRvci5hY3Rpb24ucmV2aWV3Q2hhbmdlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXZpZXcnLCBcIlJldmlld1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiwgY3R4SXNDdXJyZW50bHlCZWluZ01vZGlmaWVkLm5lZ2F0ZSgpKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdFZGl0b3JDb250ZW50LFxuXHRcdFx0XHRncm91cDogJ2FfcmVzb2x2ZScsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4UmV2aWV3TW9kZUVuYWJsZWQubmVnYXRlKCksIGN0eElzQ3VycmVudGx5QmVpbmdNb2RpZmllZC5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIub3IoY3R4SXNHbG9iYWxFZGl0aW5nU2Vzc2lvbiwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MubmVnYXRlKCkpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5DaGF0RWRpdGluZ0NvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSwgX2ludGVncmF0aW9uOiBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiwgLi4uX2FyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGVudHJ5LmVuYWJsZVJldmlld01vZGVVbnRpbFNldHRsZWQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXB0QWxsRWRpdHNBY3Rpb24gZXh0ZW5kcyBDaGF0RWRpdGluZ0VkaXRvckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXRFZGl0b3IuYWN0aW9uLmFjY2VwdEFsbEVkaXRzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWNjZXB0QWxsRWRpdHNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhY2NlcHRBbGxFZGl0cycsICdLZWVwIEFsbCBDaGF0IEVkaXRzJyksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZTIoJ2FjY2VwdEFsbEVkaXRzVG9vbHRpcCcsICdLZWVwIEFsbCBDaGF0IEVkaXRzIGluIHRoaXMgU2Vzc2lvbicpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLCBjdHhJc0N1cnJlbnRseUJlaW5nTW9kaWZpZWQubmVnYXRlKCkpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVja0FsbCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuQ2hhdEVkaXRpbmdDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgX2VudHJ5OiBJTW9kaWZpZWRGaWxlRW50cnksIF9pbnRlZ3JhdGlvbjogSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24sIC4uLl9hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzZXNzaW9uLmFjY2VwdCgpO1xuXHR9XG59XG5cblxuLy8gLS0tIG11bHRpIGZpbGUgZGlmZlxuXG5hYnN0cmFjdCBjbGFzcyBNdWx0aURpZmZBY2NlcHREaXNjYXJkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgYWNjZXB0OiBib29sZWFuKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGFjY2VwdCA/ICdjaGF0RWRpdGluZy5tdWx0aWRpZmYuYWNjZXB0QWxsRmlsZXMnIDogJ2NoYXRFZGl0aW5nLm11bHRpZGlmZi5kaXNjYXJkQWxsRmlsZXMnLFxuXHRcdFx0dGl0bGU6IGFjY2VwdCA/IGxvY2FsaXplKCdhY2NlcHQ0JywgJ0tlZXAgQWxsIEVkaXRzJykgOiBsb2NhbGl6ZSgnZGlzY2FyZDQnLCAnVW5kbyBBbGwgRWRpdHMnKSxcblx0XHRcdGljb246IGFjY2VwdCA/IENvZGljb24uY2hlY2sgOiBDb2RpY29uLmRpc2NhcmQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCBDSEFUX0VESVRJTkdfTVVMVElfRElGRl9TT1VSQ0VfUkVTT0xWRVJfU0NIRU1FKSxcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0b3JkZXI6IGFjY2VwdCA/IDAgOiAxLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdEVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0RWRpdGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3Vwc1NlcnZpY2UsIGxpc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGdyb3VwQ29udGV4dCA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRpZiAoIWdyb3VwQ29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwQ29udGV4dC5lZGl0b3JzWzBdO1xuXHRcdGlmICghKGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB8fCAhZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBjaGF0U2Vzc2lvblJlc291cmNlIH0gPSBwYXJzZUNoYXRNdWx0aURpZmZVcmkoZWRpdG9yLnJlc291cmNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY2hhdEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRpbmdTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRpZiAodGhpcy5hY2NlcHQpIHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbi5hY2NlcHQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24ucmVqZWN0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3IoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwQ29udGV4dC5ncm91cC5pZCB9KTtcblx0XHR9XG5cdH1cbn1cblxuXG5jb25zdCBleHBsYWluTXVsdGlEaWZmU2NoZW1lcyA9IFtDSEFUX0VESVRJTkdfTVVMVElfRElGRl9TT1VSQ0VfUkVTT0xWRVJfU0NIRU1FLCAnY29waWxvdGNsaS13b3JrdHJlZS1jaGFuZ2VzJywgJ2NvcGlsb3RjbG91ZC1wci1jaGFuZ2VzJ107XG5cbmNsYXNzIEV4cGxhaW5NdWx0aURpZmZBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXRzQnlJbnB1dCA9IG5ldyBXZWFrTWFwPEVkaXRvcklucHV0LCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjaGF0RWRpdGluZy5tdWx0aWRpZmYuZXhwbGFpbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cGxhaW4nLCAnRXhwbGFpbicpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoLi4uZXhwbGFpbk11bHRpRGlmZlNjaGVtZXMubWFwKHNjaGVtZSA9PiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Jlc291cmNlU2NoZW1lJywgc2NoZW1lKSkpLCBDb250ZXh0S2V5RXhwci5oYXMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkV4cGxhaW5DaGFuZ2VzRW5hYmxlZH1gKSksXG5cdFx0XHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yQ29udGVudCxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIgPSBhY2Nlc3Nvci5nZXQoSUNoYXRFZGl0aW5nRXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCFhY3RpdmVQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgd2UncmUgaW4gYSBtdWx0aS1kaWZmIGVkaXRvclxuXHRcdGlmICghKGFjdGl2ZVBhbmUgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3IpIHx8ICFhY3RpdmVQYW5lLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gYWN0aXZlUGFuZS5pbnB1dDtcblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBleGlzdGluZyB3aWRnZXRzIGZvciB0aGlzIGlucHV0IGFuZCBjcmVhdGUgbmV3IHN0b3JlXG5cdFx0dGhpcy5fd2lkZ2V0c0J5SW5wdXQuZ2V0KGlucHV0KT8uZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHdpZGdldHNTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl93aWRnZXRzQnlJbnB1dC5zZXQoaW5wdXQsIHdpZGdldHNTdG9yZSk7XG5cblx0XHQvLyBEaXNwb3NlIHdpZGdldHMgd2hlbiB0aGUgaW5wdXQgaXMgZGlzcG9zZWRcblx0XHRFdmVudC5vbmNlKGlucHV0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdHdpZGdldHNTdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl93aWRnZXRzQnlJbnB1dC5kZWxldGUoaW5wdXQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gYWN0aXZlUGFuZS52aWV3TW9kZWw7XG5cdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWwuaXRlbXMuZ2V0KCk7XG5cblx0XHQvLyBUcnkgdG8gZXh0cmFjdCBjaGF0IHNlc3Npb24gcmVzb3VyY2UgZnJvbSB0aGUgbXVsdGktZGlmZiBlZGl0b3IgVVJJIG9yIGJ5IHNjYW5uaW5nIHNlc3Npb25zXG5cdFx0bGV0IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCAmJiBpbnB1dC5yZXNvdXJjZT8uc2NoZW1lID09PSBDSEFUX0VESVRJTkdfTVVMVElfRElGRl9TT1VSQ0VfUkVTT0xWRVJfU0NIRU1FKSB7XG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlID0gcGFyc2VDaGF0TXVsdGlEaWZmVXJpKGlucHV0LnJlc291cmNlKS5jaGF0U2Vzc2lvblJlc291cmNlO1xuXHRcdH1cblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdC8vIFNjYW4gc2Vzc2lvbnMgdG8gZmluZCBvbmUgdGhhdCBvd25zIGZpbGVzIGluIHRoaXMgbXVsdGktZGlmZiBlZGl0b3Jcblx0XHRcdC8vIFVzZSBnb1RvRmlsZVVyaSBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBleHRyYWN0IGZpbGUgcGF0aCBmcm9tIHRoZSBtb2RpZmllZCBVUklcblx0XHRcdGNvbnN0IGZpbGVVcmlzID0gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXHRcdFx0XHRjb25zdCBkb2NEaWZmSXRlbSA9IGl0ZW0uZG9jdW1lbnREaWZmSXRlbSBhcyBJRG9jdW1lbnREaWZmSXRlbVdpdGhNdWx0aURpZmZFZGl0b3JJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBnb1RvRmlsZVVyaSA9IGRvY0RpZmZJdGVtPy5tdWx0aURpZmZFZGl0b3JJdGVtPy5nb1RvRmlsZVVyaTtcblx0XHRcdFx0aWYgKGdvVG9GaWxlVXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdvVG9GaWxlVXJpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZhbGxiYWNrOiBleHRyYWN0IGZpbGUgcGF0aCBmcm9tIHRoZSBtb2RpZmllZCBVUkkgKGUuZy4sIGdpdDogVVJJcyBoYXZlIHRoZSBwYXRoKVxuXHRcdFx0XHRjb25zdCBtb2RpZmllZFVyaSA9IGRvY0RpZmZJdGVtPy5tdWx0aURpZmZFZGl0b3JJdGVtPy5tb2RpZmllZFVyaSA/PyBpdGVtLm1vZGlmaWVkVXJpO1xuXHRcdFx0XHRpZiAobW9kaWZpZWRVcmk/LnBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gVVJJLmZpbGUobW9kaWZpZWRVcmkucGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pLmZpbHRlcigodXJpKTogdXJpIGlzIFVSSSA9PiAhIXVyaSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5nZXQoKSkge1xuXHRcdFx0XHRpZiAoZmlsZVVyaXMuc29tZSh1cmkgPT4gc2Vzc2lvbi5nZXRFbnRyeSh1cmkpKSkge1xuXHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uLmNoYXRTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaXJzdCBwYXNzOiBjb2xsZWN0IGFsbCBkaWZmcyBncm91cGVkIGJ5IGZpbGVcblx0XHRjb25zdCBkaWZmc0J5RmlsZSA9IG5ldyBNYXA8c3RyaW5nLCB7XG5cdFx0XHRlZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRcdFx0Y2hhbmdlczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG5cdFx0XHRvcmlnaW5hbE1vZGVsOiBJVGV4dE1vZGVsO1xuXHRcdFx0bW9kaWZpZWRNb2RlbDogSVRleHRNb2RlbDtcblx0XHR9PigpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCBtb2RpZmllZFVyaSA9IGl0ZW0ubW9kaWZpZWRVcmk7XG5cdFx0XHRpZiAoIW1vZGlmaWVkVXJpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gZ2V0IHRoZSBlZGl0b3IgZm9yIHRoaXMgaXRlbVxuXHRcdFx0Y29uc3QgZWRpdG9ySW5mbyA9IGFjdGl2ZVBhbmUudHJ5R2V0Q29kZUVkaXRvcihtb2RpZmllZFVyaSk7XG5cdFx0XHRpZiAoIWVkaXRvckluZm8pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEdldCBkaWZmIGluZm8gZnJvbSB0aGUgdmlldyBtb2RlbFxuXHRcdFx0Y29uc3QgZGlmZkVkaXRvclZNID0gaXRlbS5kaWZmRWRpdG9yVmlld01vZGVsIGFzIERpZmZFZGl0b3JWaWV3TW9kZWw7XG5cdFx0XHRhd2FpdCBkaWZmRWRpdG9yVk0ud2FpdEZvckRpZmYoKTtcblxuXHRcdFx0Y29uc3QgZGlmZiA9IGRpZmZFZGl0b3JWTS5kaWZmLmdldCgpO1xuXHRcdFx0aWYgKCFkaWZmIHx8IGRpZmYuaWRlbnRpY2FsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlS2V5ID0gbW9kaWZpZWRVcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gZGlmZnNCeUZpbGUuZ2V0KGZpbGVLZXkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdC8vIEFkZCBjaGFuZ2VzIHRvIGV4aXN0aW5nIGZpbGUgZW50cnlcblx0XHRcdFx0ZXhpc3RpbmcuY2hhbmdlcy5wdXNoKC4uLmRpZmYubWFwcGluZ3MubWFwKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBDcmVhdGUgbmV3IGZpbGUgZW50cnlcblx0XHRcdFx0ZGlmZnNCeUZpbGUuc2V0KGZpbGVLZXksIHtcblx0XHRcdFx0XHRlZGl0b3I6IGVkaXRvckluZm8uZWRpdG9yLFxuXHRcdFx0XHRcdGNoYW5nZXM6IGRpZmYubWFwcGluZ3MubWFwKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nKSxcblx0XHRcdFx0XHRvcmlnaW5hbE1vZGVsOiBkaWZmRWRpdG9yVk0ubW9kZWwub3JpZ2luYWwsXG5cdFx0XHRcdFx0bW9kaWZpZWRNb2RlbDogZGlmZkVkaXRvclZNLm1vZGVsLm1vZGlmaWVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZWNvbmQgcGFzczogY3JlYXRlIG1hbmFnZXJzIGZvciBlYWNoIGZpbGUgd2l0aCBhbGwgaXRzIGNoYW5nZXNcblx0XHRjb25zdCBhbGxEaWZmSW5mb3M6IElFeHBsYW5hdGlvbkRpZmZJbmZvW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZmlsZURhdGEgb2YgZGlmZnNCeUZpbGUudmFsdWVzKCkpIHtcblx0XHRcdC8vIEJ1aWxkIGRpZmYgaW5mbyB3aXRoIGFsbCBjaGFuZ2VzIGZvciB0aGlzIGZpbGVcblx0XHRcdGNvbnN0IGRpZmZJbmZvOiBJRXhwbGFuYXRpb25EaWZmSW5mbyA9IHtcblx0XHRcdFx0Y2hhbmdlczogZmlsZURhdGEuY2hhbmdlcyxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0b3JpZ2luYWxNb2RlbDogZmlsZURhdGEub3JpZ2luYWxNb2RlbCxcblx0XHRcdFx0bW9kaWZpZWRNb2RlbDogZmlsZURhdGEubW9kaWZpZWRNb2RlbCxcblx0XHRcdH07XG5cdFx0XHRhbGxEaWZmSW5mb3MucHVzaChkaWZmSW5mbyk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHdpZGdldCBtYW5hZ2VyIGZvciB0aGlzIGZpbGUgLSBpdCB3aWxsIG9ic2VydmUgc3RhdGUgZnJvbSBtb2RlbCBtYW5hZ2VyXG5cdFx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXRNYW5hZ2VyKFxuXHRcdFx0XHRmaWxlRGF0YS5lZGl0b3IsXG5cdFx0XHRcdGNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdFx0XHR2aWV3c1NlcnZpY2UsXG5cdFx0XHRcdGV4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLFxuXHRcdFx0XHRkaWZmSW5mby5tb2RpZmllZE1vZGVsLnVyaSxcblx0XHRcdCk7XG5cdFx0XHR3aWRnZXRzU3RvcmUuYWRkKG1hbmFnZXIpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGV4cGxhbmF0aW9ucyBmb3IgYWxsIGZpbGVzIGluIGEgc2luZ2xlIHJlcXVlc3Rcblx0XHQvLyBUaGlzIHBvcHVsYXRlcyBzdGF0ZSB3aGljaCB0cmlnZ2VycyB0aGUgbWFuYWdlcnMnIGF1dG9ydW5zIHRvIGNyZWF0ZSB3aWRnZXRzXG5cdFx0aWYgKGFsbERpZmZJbmZvcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR3aWRnZXRzU3RvcmUuYWRkKGV4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLmdlbmVyYXRlRXhwbGFuYXRpb25zKGFsbERpZmZJbmZvcywgY2hhdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdH1cblx0fVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNoYXRFZGl0b3JBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV4dEFjdGlvbiBleHRlbmRzIE5hdmlnYXRlQWN0aW9uIHsgY29uc3RydWN0b3IoKSB7IHN1cGVyKHRydWUpOyB9IH0pO1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgUHJldkFjdGlvbiBleHRlbmRzIE5hdmlnYXRlQWN0aW9uIHsgY29uc3RydWN0b3IoKSB7IHN1cGVyKGZhbHNlKTsgfSB9KTtcblx0cmVnaXN0ZXJBY3Rpb24yKFJldmlld0NoYW5nZXNBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoQWNjZXB0QWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFJlamVjdEFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihBY2NlcHRBbGxFZGl0c0FjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihBY2NlcHRIdW5rQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFJlamVjdEh1bmtBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoVG9nZ2xlRGlmZkFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihUb2dnbGVBY2Nlc3NpYmxlRGlmZlZpZXdBY3Rpb24pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE11bHRpRGlmZkFjY2VwdERpc2NhcmRBY3Rpb24geyBjb25zdHJ1Y3RvcigpIHsgc3VwZXIodHJ1ZSk7IH0gfSk7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE11bHRpRGlmZkFjY2VwdERpc2NhcmRBY3Rpb24geyBjb25zdHJ1Y3RvcigpIHsgc3VwZXIoZmFsc2UpOyB9IH0pO1xuXHRyZWdpc3RlckFjdGlvbjIoRXhwbGFpbk11bHRpRGlmZkFjdGlvbik7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckNvbnRlbnQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogbmF2aWdhdGlvbkJlYXJpbmdGYWtlQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2xhYmVsJywgXCJOYXZpZ2F0aW9uIFN0YXR1c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKSxcblx0XHR9LFxuXHRcdGdyb3VwOiAnbmF2aWdhdGUnLFxuXHRcdG9yZGVyOiAtMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4UmV2aWV3TW9kZUVuYWJsZWQsIGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiksXG5cdH0pO1xufVxuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbkJlYXJpbmdGYWtlQWN0aW9uSWQgPSAnY2hhdEVkaXRvci5uYXZpZ2F0aW9uLmJlYXJpbmdzJztcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsY0FBYztBQUloQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsU0FBMEIsUUFBUSxjQUFjLHVCQUF1QjtBQUNoRixTQUFTLHNC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
