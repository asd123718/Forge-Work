import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction2 } from "../../../../editor/browser/editorExtensions.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { InlineChatController, InlineChatRunOptions } from "./inlineChatController.js";
import { ACTION_ASK_IN_CHAT, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_POSSIBLE, ACTION_START, CTX_INLINE_CHAT_V2_ENABLED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_TERMINATED, CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, CTX_ASK_IN_CHAT_ENABLED, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE } from "../common/inlineChat.js";
import { ctxHasEditorModification, ctxHasRequestInProgress } from "../../chat/browser/chatEditing/chatEditingEditorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IChatEditingService } from "../../chat/common/editing/chatEditingService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { ChatEntitlementContextKeys } from "../../../services/chat/common/chatEntitlementService.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR } from "../../notebook/common/notebookContextKeys.js";
CommandsRegistry.registerCommandAlias("interactiveEditor.start", "inlineChat.start");
const START_INLINE_CHAT = registerIcon("start-inline-chat", Codicon.sparkle, localize("startInlineChat", "Icon which spawns the inline chat from the editor toolbar."));
const inlineChatNotebooksOldEnabled = ContextKeyExpr.or(
  ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE)
);
const inlineChatContextKey = ContextKeyExpr.and(
  ContextKeyExpr.or(inlineChatNotebooksOldEnabled, CTX_INLINE_CHAT_V2_ENABLED),
  CTX_INLINE_CHAT_POSSIBLE,
  EditorContextKeys.writable,
  EditorContextKeys.editorSimpleInput.negate()
);
class StartSessionAction extends Action2 {
  constructor() {
    super({
      id: ACTION_START,
      title: localize2("run", "Open Inline Chat"),
      shortTitle: localize2("runShort", "Inline Chat"),
      category: AbstractInlineChatAction.category,
      f1: true,
      precondition: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
      keybinding: {
        when: ContextKeyExpr.and(
          EditorContextKeys.focus,
          inlineChatContextKey,
          ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())
        ),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      icon: START_INLINE_CHAT,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 3,
        when: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()))
      }, {
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 3
      }]
    });
  }
  run(accessor, ...args) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getActiveCodeEditor();
    if (!editor || editor.isSimpleWidget) {
      return;
    }
    return editor.invokeWithinContext((editorAccessor) => {
      const kbService = editorAccessor.get(IContextKeyService);
      const logService = editorAccessor.get(ILogService);
      const enabled = kbService.contextMatchesRules(this.desc.precondition ?? void 0);
      if (!enabled) {
        logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
        return;
      }
      return this._runEditorCommand(editorAccessor, editor, ...args);
    });
  }
  async _runEditorCommand(accessor, editor, ...args) {
    const ctrl = InlineChatController.get(editor);
    if (!ctrl) {
      return;
    }
    let options;
    const arg = args[0];
    if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
      options = arg;
    }
    await ctrl?.run({ ...options });
  }
}
MenuRegistry.appendMenuItem(MenuId.InlineChatEditorAffordance, {
  group: "0_chat",
  order: 1,
  when: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()), ChatEntitlementContextKeys.Setup.hidden.negate()),
  command: {
    id: ACTION_START,
    title: localize("editCode", "Ask for Edits"),
    shortTitle: localize("editCodeShort", "Ask for Edits"),
    icon: Codicon.sparkle
  }
});
class FocusInlineChat extends EditorAction2 {
  constructor() {
    super({
      id: "inlineChat.focus",
      title: localize2("focus", "Focus Input"),
      f1: true,
      category: AbstractInlineChatAction.category,
      precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_FOCUSED.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      keybinding: [{
        weight: KeybindingWeight.EditorCore + 10,
        // win against core_command
        when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo("above"), EditorContextKeys.isEmbeddedDiffEditor.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }, {
        weight: KeybindingWeight.EditorCore + 10,
        // win against core_command
        when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo("below"), EditorContextKeys.isEmbeddedDiffEditor.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }]
    });
  }
  runEditorCommand(_accessor, editor, ..._args) {
    InlineChatController.get(editor)?.focus();
  }
}
const _AbstractInlineChatAction = class _AbstractInlineChatAction extends EditorAction2 {
  constructor(desc) {
    const massageMenu = (menu) => {
      if (Array.isArray(menu)) {
        for (const entry of menu) {
          entry.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, entry.when);
        }
      } else if (menu) {
        menu.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, menu.when);
      }
    };
    if (Array.isArray(desc.menu)) {
      massageMenu(desc.menu);
    } else {
      massageMenu(desc.menu);
    }
    super({
      ...desc,
      category: _AbstractInlineChatAction.category,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, desc.precondition)
    });
  }
  runEditorCommand(accessor, editor, ..._args) {
    const editorService = accessor.get(IEditorService);
    const logService = accessor.get(ILogService);
    let ctrl = InlineChatController.get(editor);
    if (!ctrl) {
      const { activeTextEditorControl } = editorService;
      if (isCodeEditor(activeTextEditorControl)) {
        editor = activeTextEditorControl;
      } else if (isDiffEditor(activeTextEditorControl)) {
        editor = activeTextEditorControl.getModifiedEditor();
      }
      ctrl = InlineChatController.get(editor);
    }
    if (!ctrl) {
      logService.warn("[IE] NO controller found for action", this.desc.id, editor.getModel()?.uri);
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    if (!ctrl) {
      for (const diffEditor of accessor.get(ICodeEditorService).listDiffEditors()) {
        if (diffEditor.getOriginalEditor() === editor || diffEditor.getModifiedEditor() === editor) {
          if (diffEditor instanceof EmbeddedDiffEditorWidget) {
            this.runEditorCommand(accessor, diffEditor.getParentEditor(), ..._args);
          }
        }
      }
      return;
    }
    this.runInlineChatCommand(accessor, ctrl, editor, ..._args);
  }
};
_AbstractInlineChatAction.category = localize2("cat", "Inline Chat");
let AbstractInlineChatAction = _AbstractInlineChatAction;
class FixDiagnosticsAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat.fixDiagnostics",
      title: localize2("fix", "Fix"),
      icon: Codicon.editSparkle,
      precondition: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
      menu: [{
        id: MenuId.InlineChatEditorAffordance,
        group: "1_quickfix",
        order: 100,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate())
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "2_chat",
        order: 1,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate())
      }, {
        id: MenuId.MarkerHoverStatusBar,
        group: "1_fix",
        order: 1,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
        precondition: null
      }]
    });
  }
  runInlineChatCommand(_accessor, ctrl, _editor, ..._args) {
    ctrl.run({ autoSend: true, attachDiagnostics: true });
  }
}
class KeepOrUndoSessionAction extends AbstractInlineChatAction {
  constructor(_keep, desc) {
    super(desc);
    this._keep = _keep;
  }
  async runInlineChatCommand(_accessor, ctrl, editor, ..._args) {
    if (this._keep) {
      await ctrl.acceptSession();
    } else {
      await ctrl.rejectSession();
    }
    if (editor.hasModel()) {
      editor.setSelection(editor.getSelection().collapseToStart());
    }
  }
}
class KeepSessionAction2 extends KeepOrUndoSessionAction {
  constructor() {
    super(true, {
      id: "inlineChat2.keep",
      title: localize2("Keep", "Keep"),
      f1: true,
      icon: Codicon.check,
      precondition: ContextKeyExpr.and(
        CTX_INLINE_CHAT_VISIBLE,
        ctxHasRequestInProgress.negate(),
        ctxHasEditorModification
      ),
      keybinding: [{
        when: ContextKeyExpr.and(ChatContextKeys.inputHasFocus, ChatContextKeys.inputHasText.negate()),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.Enter
      }, {
        weight: KeybindingWeight.WorkbenchContrib + 10,
        primary: KeyMod.CtrlCmd | KeyCode.Enter
      }],
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(
          ctxHasRequestInProgress.negate(),
          ctxHasEditorModification,
          ChatContextKeys.inputHasText.toNegated()
        )
      }]
    });
  }
}
class UndoAndCloseSessionAction2 extends KeepOrUndoSessionAction {
  constructor() {
    super(false, {
      id: "inlineChat2.close",
      title: localize2("close2", "Close"),
      f1: true,
      icon: Codicon.close,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE),
      keybinding: [{
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()),
          ChatContextKeys.inputHasFocus
        ),
        weight: KeybindingWeight.WorkbenchContrib + 1,
        primary: KeyCode.Escape
      }],
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 100
      }]
    });
  }
}
class CancelSessionAction extends KeepOrUndoSessionAction {
  constructor() {
    super(false, {
      id: "inlineChat2.cancel",
      title: localize2("cancel", "Cancel"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ctxHasRequestInProgress),
      keybinding: [{
        when: ContextKeyExpr.or(
          EditorContextKeys.focus,
          ChatContextKeys.inputHasFocus
        ),
        weight: KeybindingWeight.WorkbenchContrib + 1,
        primary: KeyCode.Escape
      }],
      menu: []
    });
  }
}
class ContinueInlineChatInChatViewAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat2.continueInChat",
      title: localize2("continueInChat", "Ask in Chat"),
      icon: Codicon.chatSparkle,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_TERMINATED),
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 2,
        when: CTX_INLINE_CHAT_TERMINATED
      }]
    });
  }
  async runInlineChatCommand(_accessor, ctrl, _editor) {
    await ctrl.continueSessionInChat();
  }
}
class RephraseInlineChatSessionAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat2.rephrase",
      title: localize2("rephrase", "Rephrase"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_TERMINATED),
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 1,
        when: CTX_INLINE_CHAT_TERMINATED
      }]
    });
  }
  async runInlineChatCommand(_accessor, ctrl, _editor) {
    await ctrl.rephraseSession();
  }
}
class AskInChatAction extends EditorAction2 {
  constructor() {
    super({
      id: ACTION_ASK_IN_CHAT,
      title: localize2("askInChat", "Ask in Chat"),
      category: AbstractInlineChatAction.category,
      f1: true,
      precondition: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
      keybinding: {
        when: EditorContextKeys.focus,
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      icon: Codicon.chatSparkle,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 3,
        when: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 1,
        when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
      }]
    });
  }
  async runEditorCommand(accessor, editor) {
    const chatEditingService = accessor.get(IChatEditingService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    if (!editor.hasModel()) {
      return;
    }
    const session = chatEditingService.editingSessionsObs.get().find((s) => s.getEntry(editor.getModel().uri));
    if (!session) {
      return;
    }
    const widget = await chatWidgetService.openSession(session.chatSessionResource);
    if (!widget) {
      return;
    }
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      await widget.attachmentModel.addFile(editor.getModel().uri, selection);
    }
  }
}
class DismissEditorAffordanceAction extends EditorAction2 {
  constructor() {
    super({
      id: "inlineChat.dismissEditorAffordance",
      title: localize2("dismissAffordance", "Dismiss Editor Affordance"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, ContextKeyExpr.equals("config.inlineChat.affordance", "editor")),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    InlineChatController.get(editor)?.inputOverlayWidget.dismiss();
  }
}
export {
  AbstractInlineChatAction,
  AskInChatAction,
  CancelSessionAction,
  ContinueInlineChatInChatViewAction,
  DismissEditorAffordanceAction,
  FixDiagnosticsAction,
  FocusInlineChat,
  KeepSessionAction2,
  RephraseInlineChatSessionAction,
  StartSessionAction,
  UndoAndCloseSessionAction2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdENvbnRyb2xsZXIsIElubGluZUNoYXRSdW5PcHRpb25zIH0gZnJvbSAnLi9pbmxpbmVDaGF0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fQVNLX0lOX0NIQVQsIENUWF9JTkxJTkVfQ0hBVF9GT0NVU0VELCBDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSwgQ1RYX0lOTElORV9DSEFUX09VVEVSX0NVUlNPUl9QT1NJVElPTiwgQ1RYX0lOTElORV9DSEFUX1BPU1NJQkxFLCBBQ1RJT05fU1RBUlQsIENUWF9JTkxJTkVfQ0hBVF9WMl9FTkFCTEVELCBDVFhfSU5MSU5FX0NIQVRfRklMRV9CRUxPTkdTX1RPX0NIQVQsIENUWF9JTkxJTkVfQ0hBVF9URVJNSU5BVEVELCBDVFhfRklYX0RJQUdOT1NUSUNTX0VOQUJMRUQsIENUWF9JTkxJTkVfQ0hBVF9BRkZPUkRBTkNFX1ZJU0lCTEUsIENUWF9BU0tfSU5fQ0hBVF9FTkFCTEVELCBDVFhfSU5MSU5FX0NIQVRfSEFTX05PVEVCT09LX0lOTElORSB9IGZyb20gJy4uL2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnaW50ZXJhY3RpdmVFZGl0b3Iuc3RhcnQnLCAnaW5saW5lQ2hhdC5zdGFydCcpO1xuXG5jb25zdCBTVEFSVF9JTkxJTkVfQ0hBVCA9IHJlZ2lzdGVySWNvbignc3RhcnQtaW5saW5lLWNoYXQnLCBDb2RpY29uLnNwYXJrbGUsIGxvY2FsaXplKCdzdGFydElubGluZUNoYXQnLCAnSWNvbiB3aGljaCBzcGF3bnMgdGhlIGlubGluZSBjaGF0IGZyb20gdGhlIGVkaXRvciB0b29sYmFyLicpKTtcblxuY29uc3QgaW5saW5lQ2hhdE5vdGVib29rc09sZEVuYWJsZWQgPSBDb250ZXh0S2V5RXhwci5vcihcblx0Q29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIENUWF9JTkxJTkVfQ0hBVF9IQVNfTk9URUJPT0tfSU5MSU5FKVxuKTtcblxuY29uc3QgaW5saW5lQ2hhdENvbnRleHRLZXkgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdENvbnRleHRLZXlFeHByLm9yKGlubGluZUNoYXROb3RlYm9va3NPbGRFbmFibGVkLCBDVFhfSU5MSU5FX0NIQVRfVjJfRU5BQkxFRCksXG5cdENUWF9JTkxJTkVfQ0hBVF9QT1NTSUJMRSxcblx0RWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclNpbXBsZUlucHV0Lm5lZ2F0ZSgpXG4pO1xuXG5leHBvcnQgY2xhc3MgU3RhcnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFDVElPTl9TVEFSVCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bicsICdPcGVuIElubGluZSBDaGF0JyksXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ3J1blNob3J0JywgJ0lubGluZSBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChpbmxpbmVDaGF0Q29udGV4dEtleSwgQ29udGV4dEtleUV4cHIub3IoQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpLCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRC5uZWdhdGUoKSkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHRcdFx0aW5saW5lQ2hhdENvbnRleHRLZXksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpLCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRC5uZWdhdGUoKSlcblx0XHRcdFx0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogU1RBUlRfSU5MSU5FX0NIQVQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpbmxpbmVDaGF0Q29udGV4dEtleSwgQ29udGV4dEtleUV4cHIub3IoQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpLCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRC5uZWdhdGUoKSkpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0Z3JvdXA6ICdhX29wZW4nLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBhbnkge1xuXG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFlZGl0b3IgfHwgZWRpdG9yLmlzU2ltcGxlV2lkZ2V0KSB7XG5cdFx0XHQvLyB3ZWxsLCBhdCBsZWFzdCB3ZSB0cmllZC4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0Ly8gcHJlY29uZGl0aW9uIGRvZXMgaG9sZFxuXHRcdHJldHVybiBlZGl0b3IuaW52b2tlV2l0aGluQ29udGV4dCgoZWRpdG9yQWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGVkaXRvckFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbG9nU2VydmljZSA9IGVkaXRvckFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCBlbmFibGVkID0ga2JTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXModGhpcy5kZXNjLnByZWNvbmRpdGlvbiA/PyB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoYFtFZGl0b3JBY3Rpb24yXSBOT1QgcnVubmluZyBjb21tYW5kIGJlY2F1c2UgaXRzIHByZWNvbmRpdGlvbiBpcyBGQUxTRWAsIHRoaXMuZGVzYy5pZCwgdGhpcy5kZXNjLnByZWNvbmRpdGlvbj8uc2VyaWFsaXplKCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuRWRpdG9yQ29tbWFuZChlZGl0b3JBY2Nlc3NvciwgZWRpdG9yLCAuLi5hcmdzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXG5cdFx0Y29uc3QgY3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY3RybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBvcHRpb25zOiBJbmxpbmVDaGF0UnVuT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhcmcgPSBhcmdzWzBdO1xuXHRcdGlmIChhcmcgJiYgSW5saW5lQ2hhdFJ1bk9wdGlvbnMuaXNJbmxpbmVDaGF0UnVuT3B0aW9ucyhhcmcpKSB7XG5cdFx0XHRvcHRpb25zID0gYXJnO1xuXHRcdH1cblxuXHRcdGF3YWl0IGN0cmw/LnJ1bih7IC4uLm9wdGlvbnMgfSk7XG5cdH1cbn1cblxuLy8gLS0tIElubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlIG1lbnUgLS0tXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsIHtcblx0Z3JvdXA6ICcwX2NoYXQnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbiwgQ29udGV4dEtleUV4cHIub3IoQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpLCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRC5uZWdhdGUoKSksIENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSksXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQUNUSU9OX1NUQVJULFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZWRpdENvZGUnLCBcIkFzayBmb3IgRWRpdHNcIiksXG5cdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ2VkaXRDb2RlU2hvcnQnLCBcIkFzayBmb3IgRWRpdHNcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5zcGFya2xlLFxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEZvY3VzSW5saW5lQ2hhdCBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdC5mb2N1cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1cycsIFwiRm9jdXMgSW5wdXRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24uY2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLCBDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRC5uZWdhdGUoKSwgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29yZSArIDEwLCAvLyB3aW4gYWdhaW5zdCBjb3JlX2NvbW1hbmRcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9PVVRFUl9DVVJTT1JfUE9TSVRJT04uaXNFcXVhbFRvKCdhYm92ZScpLCBFZGl0b3JDb250ZXh0S2V5cy5pc0VtYmVkZGVkRGlmZkVkaXRvci5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb3JlICsgMTAsIC8vIHdpbiBhZ2FpbnN0IGNvcmVfY29tbWFuZFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX09VVEVSX0NVUlNPUl9QT1NJVElPTi5pc0VxdWFsVG8oJ2JlbG93JyksIEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLm5lZ2F0ZSgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLl9hcmdzOiB1bmtub3duW10pIHtcblx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8uZm9jdXMoKTtcblx0fVxufVxuXG4vLyNyZWdpb24gLS0tIFZFUlNJT04gMlxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBjYXRlZ29yeSA9IGxvY2FsaXplMignY2F0JywgXCJJbmxpbmUgQ2hhdFwiKTtcblxuXHRjb25zdHJ1Y3RvcihkZXNjOiBJQWN0aW9uMk9wdGlvbnMpIHtcblx0XHRjb25zdCBtYXNzYWdlTWVudSA9IChtZW51OiBJQWN0aW9uMk9wdGlvbnNbJ21lbnUnXSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkobWVudSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBtZW51KSB7XG5cdFx0XHRcdFx0ZW50cnkud2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChDVFhfSU5MSU5FX0NIQVRfVjJfRU5BQkxFRCwgZW50cnkud2hlbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAobWVudSkge1xuXHRcdFx0XHRtZW51LndoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQsIG1lbnUud2hlbik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShkZXNjLm1lbnUpKSB7XG5cdFx0XHRtYXNzYWdlTWVudShkZXNjLm1lbnUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXNzYWdlTWVudShkZXNjLm1lbnUpO1xuXHRcdH1cblxuXHRcdHN1cGVyKHtcblx0XHRcdC4uLmRlc2MsXG5cdFx0XHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQsIGRlc2MucHJlY29uZGl0aW9uKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgLi4uX2FyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0bGV0IGN0cmwgPSBJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWN0cmwpIHtcblx0XHRcdGNvbnN0IHsgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgfSA9IGVkaXRvclNlcnZpY2U7XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRlZGl0b3IgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdH0gZWxzZSBpZiAoaXNEaWZmRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRlZGl0b3IgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRNb2RpZmllZEVkaXRvcigpO1xuXHRcdFx0fVxuXHRcdFx0Y3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdH1cblxuXHRcdGlmICghY3RybCkge1xuXHRcdFx0bG9nU2VydmljZS53YXJuKCdbSUVdIE5PIGNvbnRyb2xsZXIgZm91bmQgZm9yIGFjdGlvbicsIHRoaXMuZGVzYy5pZCwgZWRpdG9yLmdldE1vZGVsKCk/LnVyaSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0ZWRpdG9yID0gZWRpdG9yLmdldFBhcmVudEVkaXRvcigpO1xuXHRcdH1cblx0XHRpZiAoIWN0cmwpIHtcblx0XHRcdGZvciAoY29uc3QgZGlmZkVkaXRvciBvZiBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5saXN0RGlmZkVkaXRvcnMoKSkge1xuXHRcdFx0XHRpZiAoZGlmZkVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpID09PSBlZGl0b3IgfHwgZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpID09PSBlZGl0b3IpIHtcblx0XHRcdFx0XHRpZiAoZGlmZkVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCkge1xuXHRcdFx0XHRcdFx0dGhpcy5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBkaWZmRWRpdG9yLmdldFBhcmVudEVkaXRvcigpLCAuLi5fYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucnVuSW5saW5lQ2hhdENvbW1hbmQoYWNjZXNzb3IsIGN0cmwsIGVkaXRvciwgLi4uX2FyZ3MpO1xuXHR9XG5cblx0YWJzdHJhY3QgcnVuSW5saW5lQ2hhdENvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN0cmw6IElubGluZUNoYXRDb250cm9sbGVyLCBlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRml4RGlhZ25vc3RpY3NBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdC5maXhEaWFnbm9zdGljcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmaXgnLCAnRml4JyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmVkaXRTcGFya2xlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0ZJWF9ESUFHTk9TVElDU19FTkFCTEVELCBFZGl0b3JDb250ZXh0S2V5cy5zZWxlY3Rpb25IYXNEaWFnbm9zdGljcywgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsXG5cdFx0XHRcdGdyb3VwOiAnMV9xdWlja2ZpeCcsXG5cdFx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDVFhfRklYX0RJQUdOT1NUSUNTX0VOQUJMRUQsIEVkaXRvckNvbnRleHRLZXlzLnNlbGVjdGlvbkhhc0RpYWdub3N0aWNzLCBDVFhfSU5MSU5FX0NIQVRfRklMRV9CRUxPTkdTX1RPX0NIQVQubmVnYXRlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVNZW51LFxuXHRcdFx0XHRncm91cDogJzJfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0ZJWF9ESUFHTk9TVElDU19FTkFCTEVELCBFZGl0b3JDb250ZXh0S2V5cy5zZWxlY3Rpb25IYXNEaWFnbm9zdGljcywgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NYXJrZXJIb3ZlclN0YXR1c0Jhcixcblx0XHRcdFx0Z3JvdXA6ICcxX2ZpeCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0ZJWF9ESUFHTk9TVElDU19FTkFCTEVELCBDVFhfSU5MSU5FX0NIQVRfRklMRV9CRUxPTkdTX1RPX0NIQVQubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IG51bGwsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuSW5saW5lQ2hhdENvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjdHJsOiBJbmxpbmVDaGF0Q29udHJvbGxlciwgX2VkaXRvcjogSUNvZGVFZGl0b3IsIC4uLl9hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjdHJsLnJ1bih7IGF1dG9TZW5kOiB0cnVlLCBhdHRhY2hEaWFnbm9zdGljczogdHJ1ZSB9KTtcblx0fVxufVxuXG5jbGFzcyBLZWVwT3JVbmRvU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfa2VlcDogYm9vbGVhbiwgZGVzYzogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5JbmxpbmVDaGF0Q29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN0cmw6IElubGluZUNoYXRDb250cm9sbGVyLCBlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5fYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2tlZXApIHtcblx0XHRcdGF3YWl0IGN0cmwuYWNjZXB0U2Vzc2lvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBjdHJsLnJlamVjdFNlc3Npb24oKTtcblx0XHR9XG5cdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKGVkaXRvci5nZXRTZWxlY3Rpb24oKS5jb2xsYXBzZVRvU3RhcnQoKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBLZWVwU2Vzc2lvbkFjdGlvbjIgZXh0ZW5kcyBLZWVwT3JVbmRvU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdDIua2VlcCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdLZWVwJywgXCJLZWVwXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLFxuXHRcdFx0XHRjdHhIYXNSZXF1ZXN0SW5Qcm9ncmVzcy5uZWdhdGUoKSxcblx0XHRcdFx0Y3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLFxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNGb2N1cywgQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC5uZWdhdGUoKSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0fV0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdGN0eEhhc1JlcXVlc3RJblByb2dyZXNzLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbixcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0LnRvTmVnYXRlZCgpXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmRvQW5kQ2xvc2VTZXNzaW9uQWN0aW9uMiBleHRlbmRzIEtlZXBPclVuZG9TZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwge1xuXHRcdFx0aWQ6ICdpbmxpbmVDaGF0Mi5jbG9zZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZTInLCBcIkNsb3NlXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24ubmVnYXRlKCkpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc0ZvY3VzLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2FuY2VsU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEtlZXBPclVuZG9TZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwge1xuXHRcdFx0aWQ6ICdpbmxpbmVDaGF0Mi5jYW5jZWwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzRm9jdXMsXG5cdFx0XHRcdCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnU6IFtdXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRpbnVlSW5saW5lQ2hhdEluQ2hhdFZpZXdBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdDIuY29udGludWVJbkNoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29udGludWVJbkNoYXQnLCBcIkFzayBpbiBDaGF0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLCBDVFhfSU5MSU5FX0NIQVRfVEVSTUlOQVRFRCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ1RYX0lOTElORV9DSEFUX1RFUk1JTkFURURcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5JbmxpbmVDaGF0Q29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN0cmw6IElubGluZUNoYXRDb250cm9sbGVyLCBfZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGN0cmwuY29udGludWVTZXNzaW9uSW5DaGF0KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGhyYXNlSW5saW5lQ2hhdFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdDIucmVwaHJhc2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVwaHJhc2UnLCBcIlJlcGhyYXNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUsIENUWF9JTkxJTkVfQ0hBVF9URVJNSU5BVEVEKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDVFhfSU5MSU5FX0NIQVRfVEVSTUlOQVRFRFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bklubGluZUNoYXRDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY3RybDogSW5saW5lQ2hhdENvbnRyb2xsZXIsIF9lZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY3RybC5yZXBocmFzZVNlc3Npb24oKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBBc2tJbkNoYXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQUNUSU9OX0FTS19JTl9DSEFULFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYXNrSW5DaGF0JywgJ0FzayBpbiBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChpbmxpbmVDaGF0Q29udGV4dEtleSwgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUlcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaW5saW5lQ2hhdENvbnRleHRLZXksIENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVCwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsXG5cdFx0XHRcdGdyb3VwOiAnMF9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbiwgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgY2hhdEVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0RWRpdGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5nZXQoKS5maW5kKHMgPT4gcy5nZXRFbnRyeShlZGl0b3IuZ2V0TW9kZWwoKS51cmkpKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oc2Vzc2lvbi5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbiAmJiAhc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgc2VsZWN0aW9uKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc21pc3NFZGl0b3JBZmZvcmRhbmNlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbmxpbmVDaGF0LmRpc21pc3NFZGl0b3JBZmZvcmRhbmNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Rpc21pc3NBZmZvcmRhbmNlJywgXCJEaXNtaXNzIEVkaXRvciBBZmZvcmRhbmNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX0FGRk9SREFOQ0VfVklTSUJMRSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuaW5saW5lQ2hhdC5hZmZvcmRhbmNlJywgJ2VkaXRvcicpKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5FZGl0b3JDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3IpPy5pbnB1dE92ZXJsYXlXaWRnZXQuZGlzbWlzcygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBc0IsY0FBYyxvQkFBb0I7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxz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
