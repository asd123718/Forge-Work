import { getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Position } from "../../../../editor/common/core/position.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { PanelFocusContext } from "../../../common/contextkeys.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { openBreakpointSource } from "./breakpointsView.js";
import { DisassemblyView } from "./disassemblyView.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_EXCEPTION_WIDGET_VISIBLE, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_IN_DEBUG_MODE, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, EDITOR_CONTRIBUTION_ID, IDebugService, REPL_VIEW_ID, WATCH_VIEW_ID } from "../common/debug.js";
import { getEvaluatableExpressionAtPosition } from "../common/debugUtils.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { TOGGLE_BREAKPOINT_ID } from "../../../../workbench/contrib/debug/browser/debugCommands.js";
class ToggleBreakpointAction extends Action2 {
  constructor() {
    super({
      id: TOGGLE_BREAKPOINT_ID,
      title: {
        ...nls.localize2("toggleBreakpointAction", "Toggle Breakpoint"),
        mnemonicTitle: nls.localize({ key: "miToggleBreakpoint", comment: ["&& denotes a mnemonic"] }, "Toggle &&Breakpoint")
      },
      category: nls.localize2("debugCategory", "Debug"),
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      keybinding: {
        when: ContextKeyExpr.or(EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLY_VIEW_FOCUS),
        primary: KeyCode.F9,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.MenubarDebugMenu,
        when: CONTEXT_DEBUGGERS_AVAILABLE,
        group: "4_new_breakpoint",
        order: 1
      }]
    });
  }
  async run(accessor, entry) {
    const editorService = accessor.get(IEditorService);
    const debugService = accessor.get(IDebugService);
    const activePane = editorService.activeEditorPane;
    if (activePane instanceof DisassemblyView) {
      const location = entry ? activePane.getAddressAndOffset(entry) : activePane.focusedAddressAndOffset;
      if (location) {
        const bps = debugService.getModel().getInstructionBreakpoints();
        const toRemove = bps.find((bp) => bp.address === location.address);
        if (toRemove) {
          debugService.removeInstructionBreakpoints(toRemove.instructionReference, toRemove.offset);
        } else {
          debugService.addInstructionBreakpoint({ instructionReference: location.reference, offset: location.offset, address: location.address, canPersist: false });
        }
      }
      return;
    }
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
    if (editor?.hasModel()) {
      const modelUri = editor.getModel().uri;
      const canSet = debugService.canSetBreakpointsIn(editor.getModel());
      const lineNumbers = [...new Set(editor.getSelections().map((s) => s.getPosition().lineNumber))];
      await Promise.all(lineNumbers.map(async (line) => {
        const bps = debugService.getModel().getBreakpoints({ lineNumber: line, uri: modelUri });
        if (bps.length) {
          await Promise.all(bps.map((bp) => debugService.removeBreakpoints(bp.getId())));
        } else if (canSet) {
          await debugService.addBreakpoints(modelUri, [{ lineNumber: line }]);
        }
      }));
    }
  }
}
class ConditionalBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.conditionalBreakpoint",
      label: nls.localize2("conditionalBreakpointEditorAction", "Debug: Add Conditional Breakpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: {
        menuId: MenuId.MenubarNewBreakpointMenu,
        title: nls.localize({ key: "miConditionalBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Conditional Breakpoint..."),
        group: "1_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, void 0, BreakpointWidgetContext.CONDITION);
    }
  }
}
class LogPointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.addLogPoint",
      label: nls.localize2("logPointEditorAction", "Debug: Add Logpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: [
        {
          menuId: MenuId.MenubarNewBreakpointMenu,
          title: nls.localize({ key: "miLogPoint", comment: ["&& denotes a mnemonic"] }, "&&Logpoint..."),
          group: "1_breakpoints",
          order: 4,
          when: CONTEXT_DEBUGGERS_AVAILABLE
        }
      ]
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.LOG_MESSAGE);
    }
  }
}
class TriggerByBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.triggerByBreakpoint",
      label: nls.localize("triggerByBreakpointEditorAction", "Debug: Add Triggered Breakpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      alias: "Debug: Triggered Breakpoint...",
      menuOpts: [
        {
          menuId: MenuId.MenubarNewBreakpointMenu,
          title: nls.localize({ key: "miTriggerByBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Triggered Breakpoint..."),
          group: "1_breakpoints",
          order: 4,
          when: CONTEXT_DEBUGGERS_AVAILABLE
        }
      ]
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.TRIGGER_POINT);
    }
  }
}
class EditBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.editBreakpoint",
      label: nls.localize("EditBreakpointEditorAction", "Debug: Edit Breakpoint"),
      alias: "Debug: Edit Existing Breakpoint",
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: {
        menuId: MenuId.MenubarNewBreakpointMenu,
        title: nls.localize({ key: "miEditBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Edit Breakpoint"),
        group: "1_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    const debugModel = debugService.getModel();
    if (!(editor.hasModel() && position)) {
      return;
    }
    const lineBreakpoints = debugModel.getBreakpoints({ lineNumber: position.lineNumber });
    if (lineBreakpoints.length === 0) {
      return;
    }
    const breakpointDistances = lineBreakpoints.map((b) => {
      if (!b.column) {
        return position.column;
      }
      return Math.abs(b.column - position.column);
    });
    const closestBreakpointIndex = breakpointDistances.indexOf(Math.min(...breakpointDistances));
    const closestBreakpoint = lineBreakpoints[closestBreakpointIndex];
    editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(closestBreakpoint.lineNumber, closestBreakpoint.column);
  }
}
const _OpenDisassemblyViewAction = class _OpenDisassemblyViewAction extends Action2 {
  constructor() {
    super({
      id: _OpenDisassemblyViewAction.ID,
      title: {
        ...nls.localize2("openDisassemblyView", "Open Disassembly View"),
        mnemonicTitle: nls.localize({ key: "miDisassemblyView", comment: ["&& denotes a mnemonic"] }, "&&DisassemblyView")
      },
      precondition: CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE,
      menu: [
        {
          id: MenuId.EditorContext,
          group: "debug",
          order: 5,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEqualTo("stopped"), EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST)
        },
        {
          id: MenuId.DebugCallStackContext,
          group: "z_commands",
          order: 50,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("stackFrame"), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
        },
        {
          id: MenuId.CommandPalette,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
        }
      ]
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    editorService.openEditor(DisassemblyViewInput.instance, { pinned: true, revealIfOpened: true });
  }
};
_OpenDisassemblyViewAction.ID = "debug.action.openDisassemblyView";
let OpenDisassemblyViewAction = _OpenDisassemblyViewAction;
const _ToggleDisassemblyViewSourceCodeAction = class _ToggleDisassemblyViewSourceCodeAction extends Action2 {
  constructor() {
    super({
      id: _ToggleDisassemblyViewSourceCodeAction.ID,
      title: {
        ...nls.localize2("toggleDisassemblyViewSourceCode", "Toggle Source Code in Disassembly View"),
        mnemonicTitle: nls.localize({ key: "mitogglesource", comment: ["&& denotes a mnemonic"] }, "&&ToggleSource")
      },
      metadata: {
        description: nls.localize2("toggleDisassemblyViewSourceCodeDescription", "Shows or hides source code in disassembly")
      },
      f1: true
    });
  }
  run(accessor, editor, ...args) {
    const configService = accessor.get(IConfigurationService);
    if (configService) {
      const value = configService.getValue("debug").disassemblyView.showSourceCode;
      configService.updateValue(_ToggleDisassemblyViewSourceCodeAction.configID, !value);
    }
  }
};
_ToggleDisassemblyViewSourceCodeAction.ID = "debug.action.toggleDisassemblyViewSourceCode";
_ToggleDisassemblyViewSourceCodeAction.configID = "debug.disassemblyView.showSourceCode";
let ToggleDisassemblyViewSourceCodeAction = _ToggleDisassemblyViewSourceCodeAction;
const _RunToCursorAction = class _RunToCursorAction extends EditorAction {
  constructor() {
    super({
      id: _RunToCursorAction.ID,
      label: _RunToCursorAction.LABEL.value,
      alias: "Debug: Run to Cursor",
      precondition: ContextKeyExpr.and(
        CONTEXT_DEBUGGERS_AVAILABLE,
        PanelFocusContext.toNegated(),
        ContextKeyExpr.or(EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLY_VIEW_FOCUS),
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 2,
        when: CONTEXT_IN_DEBUG_MODE
      }
    });
  }
  async run(accessor, editor) {
    const position = editor.getPosition();
    if (!(editor.hasModel() && position)) {
      return;
    }
    const uri = editor.getModel().uri;
    const debugService = accessor.get(IDebugService);
    const viewModel = debugService.getViewModel();
    const uriIdentityService = accessor.get(IUriIdentityService);
    let column = void 0;
    const focusedStackFrame = viewModel.focusedStackFrame;
    if (focusedStackFrame && uriIdentityService.extUri.isEqual(focusedStackFrame.source.uri, uri) && focusedStackFrame.range.startLineNumber === position.lineNumber) {
      column = position.column;
    }
    await debugService.runTo(uri, position.lineNumber, column);
  }
};
_RunToCursorAction.ID = "editor.debug.action.runToCursor";
_RunToCursorAction.LABEL = nls.localize2("runToCursor", "Run to Cursor");
let RunToCursorAction = _RunToCursorAction;
const _SelectionToReplAction = class _SelectionToReplAction extends EditorAction {
  constructor() {
    super({
      id: _SelectionToReplAction.ID,
      label: _SelectionToReplAction.LABEL.value,
      alias: "Debug: Evaluate in Console",
      precondition: ContextKeyExpr.and(
        CONTEXT_IN_DEBUG_MODE,
        EditorContextKeys.editorTextFocus,
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 0
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const viewsService = accessor.get(IViewsService);
    const viewModel = debugService.getViewModel();
    const session = viewModel.focusedSession;
    if (!editor.hasModel() || !session) {
      return;
    }
    const selection = editor.getSelection();
    let text;
    if (selection.isEmpty()) {
      text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
    } else {
      text = editor.getModel().getValueInRange(selection);
    }
    const replView = await viewsService.openView(REPL_VIEW_ID, false);
    replView?.sendReplInput(text);
  }
};
_SelectionToReplAction.ID = "editor.debug.action.selectionToRepl";
_SelectionToReplAction.LABEL = nls.localize2("evaluateInDebugConsole", "Evaluate in Debug Console");
let SelectionToReplAction = _SelectionToReplAction;
const _SelectionToWatchExpressionsAction = class _SelectionToWatchExpressionsAction extends EditorAction {
  constructor() {
    super({
      id: _SelectionToWatchExpressionsAction.ID,
      label: _SelectionToWatchExpressionsAction.LABEL.value,
      alias: "Debug: Add to Watch",
      precondition: ContextKeyExpr.and(
        CONTEXT_IN_DEBUG_MODE,
        EditorContextKeys.editorTextFocus,
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 1
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const viewsService = accessor.get(IViewsService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    if (!editor.hasModel()) {
      return;
    }
    let expression = void 0;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!selection.isEmpty()) {
      expression = model.getValueInRange(selection);
    } else {
      const position = editor.getPosition();
      const evaluatableExpression = await getEvaluatableExpressionAtPosition(languageFeaturesService, model, position);
      if (!evaluatableExpression) {
        return;
      }
      expression = evaluatableExpression.matchingExpression;
    }
    if (!expression) {
      return;
    }
    await viewsService.openView(WATCH_VIEW_ID);
    debugService.addWatchExpression(expression);
  }
};
_SelectionToWatchExpressionsAction.ID = "editor.debug.action.selectionToWatch";
_SelectionToWatchExpressionsAction.LABEL = nls.localize2("addToWatch", "Add to Watch");
let SelectionToWatchExpressionsAction = _SelectionToWatchExpressionsAction;
class ShowDebugHoverAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.showDebugHover",
      label: nls.localize2("showDebugHover", "Debug: Show Hover"),
      precondition: CONTEXT_IN_DEBUG_MODE,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(accessor, editor) {
    const position = editor.getPosition();
    if (!position || !editor.hasModel()) {
      return;
    }
    return editor.getContribution(EDITOR_CONTRIBUTION_ID)?.showHover(position, true);
  }
}
const NO_TARGETS_MESSAGE = nls.localize("editor.debug.action.stepIntoTargets.notAvailable", "Step targets are not available here");
const _StepIntoTargetsAction = class _StepIntoTargetsAction extends EditorAction {
  constructor() {
    super({
      id: _StepIntoTargetsAction.ID,
      label: _StepIntoTargetsAction.LABEL,
      alias: "Debug: Step Into Target",
      precondition: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), EditorContextKeys.editorTextFocus),
      contextMenuOpts: {
        group: "debug",
        order: 1.5
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const contextMenuService = accessor.get(IContextMenuService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const session = debugService.getViewModel().focusedSession;
    const frame = debugService.getViewModel().focusedStackFrame;
    const selection = editor.getSelection();
    const targetPosition = selection?.getPosition() || frame && { lineNumber: frame.range.startLineNumber, column: frame.range.startColumn };
    if (!session || !frame || !editor.hasModel() || !uriIdentityService.extUri.isEqual(editor.getModel().uri, frame.source.uri)) {
      if (targetPosition) {
        MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition);
      }
      return;
    }
    const targets = await session.stepInTargets(frame.frameId);
    if (!targets?.length) {
      MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition);
      return;
    }
    if (selection) {
      const positionalTargets = [];
      for (const target of targets) {
        if (target.line) {
          positionalTargets.push({
            start: new Position(target.line, target.column || 1),
            end: target.endLine ? new Position(target.endLine, target.endColumn || 1) : void 0,
            target
          });
        }
      }
      positionalTargets.sort((a, b) => b.start.lineNumber - a.start.lineNumber || b.start.column - a.start.column);
      const needle = selection.getPosition();
      const best = positionalTargets.find((t) => t.end && needle.isBefore(t.end) && t.start.isBeforeOrEqual(needle)) || positionalTargets.find((t) => t.end === void 0 && t.start.isBeforeOrEqual(needle));
      if (best) {
        session.stepIn(frame.thread.threadId, best.target.id);
        return;
      }
    }
    editor.revealLineInCenterIfOutsideViewport(frame.range.startLineNumber);
    const cursorCoords = editor.getScrolledVisiblePosition(targetPosition);
    const editorCoords = getDomNodePagePosition(editor.getDomNode());
    const x = editorCoords.left + cursorCoords.left;
    const y = editorCoords.top + cursorCoords.top + cursorCoords.height;
    contextMenuService.showContextMenu({
      getAnchor: () => ({ x, y }),
      getActions: () => {
        return targets.map((t) => toAction({ id: `stepIntoTarget:${t.id}`, label: t.label, enabled: true, run: () => session.stepIn(frame.thread.threadId, t.id) }));
      }
    });
  }
};
_StepIntoTargetsAction.ID = "editor.debug.action.stepIntoTargets";
_StepIntoTargetsAction.LABEL = nls.localize({ key: "stepIntoTargets", comment: ["Step Into Targets lets the user step into an exact function he or she is interested in."] }, "Step Into Target");
let StepIntoTargetsAction = _StepIntoTargetsAction;
class GoToBreakpointAction extends EditorAction {
  constructor(isNext, opts) {
    super(opts);
    this.isNext = isNext;
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    if (editor.hasModel()) {
      const currentUri = editor.getModel().uri;
      const currentLine = editor.getPosition().lineNumber;
      const allEnabledBreakpoints = debugService.getModel().getBreakpoints({ enabledOnly: true });
      let moveBreakpoint = this.isNext ? allEnabledBreakpoints.filter((bp) => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber > currentLine).shift() : allEnabledBreakpoints.filter((bp) => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber < currentLine).pop();
      if (!moveBreakpoint) {
        moveBreakpoint = this.isNext ? allEnabledBreakpoints.filter((bp) => bp.uri.toString() > currentUri.toString()).shift() : allEnabledBreakpoints.filter((bp) => bp.uri.toString() < currentUri.toString()).pop();
      }
      if (!moveBreakpoint && allEnabledBreakpoints.length) {
        moveBreakpoint = this.isNext ? allEnabledBreakpoints[0] : allEnabledBreakpoints[allEnabledBreakpoints.length - 1];
      }
      if (moveBreakpoint) {
        return openBreakpointSource(moveBreakpoint, false, true, false, debugService, editorService);
      }
    }
  }
}
class GoToNextBreakpointAction extends GoToBreakpointAction {
  constructor() {
    super(true, {
      id: "editor.debug.action.goToNextBreakpoint",
      label: nls.localize2("goToNextBreakpoint", "Debug: Go to Next Breakpoint"),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
}
class GoToPreviousBreakpointAction extends GoToBreakpointAction {
  constructor() {
    super(false, {
      id: "editor.debug.action.goToPreviousBreakpoint",
      label: nls.localize2("goToPreviousBreakpoint", "Debug: Go to Previous Breakpoint"),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
}
class CloseExceptionWidgetAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.closeExceptionWidget",
      label: nls.localize2("closeExceptionWidget", "Close Exception Widget"),
      precondition: CONTEXT_EXCEPTION_WIDGET_VISIBLE,
      kbOpts: {
        primary: KeyCode.Escape,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(_accessor, editor) {
    const contribution = editor.getContribution(EDITOR_CONTRIBUTION_ID);
    contribution?.closeExceptionWidget();
  }
}
registerAction2(OpenDisassemblyViewAction);
registerAction2(ToggleDisassemblyViewSourceCodeAction);
registerAction2(ToggleBreakpointAction);
registerEditorAction(ConditionalBreakpointAction);
registerEditorAction(LogPointAction);
registerEditorAction(TriggerByBreakpointAction);
registerEditorAction(EditBreakpointAction);
registerEditorAction(RunToCursorAction);
registerEditorAction(StepIntoTargetsAction);
registerEditorAction(SelectionToReplAction);
registerEditorAction(SelectionToWatchExpressionsAction);
registerEditorAction(ShowDebugHoverAction);
registerEditorAction(GoToNextBreakpointAction);
registerEditorAction(GoToPreviousBreakpointAction);
registerEditorAction(CloseExceptionWidgetAction);
export {
  RunToCursorAction,
  SelectionToReplAction,
  SelectionToWatchExpressionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0VkaXRvckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXREb21Ob2RlUGFnZVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIElBY3Rpb25PcHRpb25zLCByZWdpc3RlckVkaXRvckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBQYW5lbEZvY3VzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBvcGVuQnJlYWtwb2ludFNvdXJjZSB9IGZyb20gJy4vYnJlYWtwb2ludHNWaWV3LmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5VmlldywgSURpc2Fzc2VtYmxlZEluc3RydWN0aW9uRW50cnkgfSBmcm9tICcuL2Rpc2Fzc2VtYmx5Vmlldy5qcyc7XG5pbXBvcnQgeyBSZXBsIH0gZnJvbSAnLi9yZXBsLmpzJztcbmltcG9ydCB7IEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCwgQnJlYWtwb2ludFdpZGdldENvbnRleHQsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRSwgQ09OVEVYVF9ERUJVR19TVEFURSwgQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLCBDT05URVhUX0RJU0FTU0VNQkxFX1JFUVVFU1RfU1VQUE9SVEVELCBDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMsIENPTlRFWFRfRVhDRVBUSU9OX1dJREdFVF9WSVNJQkxFLCBDT05URVhUX0ZPQ1VTRURfU1RBQ0tfRlJBTUVfSEFTX0lOU1RSVUNUSU9OX1BPSU5URVJfUkVGRVJFTkNFLCBDT05URVhUX0lOX0RFQlVHX01PREUsIENPTlRFWFRfTEFOR1VBR0VfU1VQUE9SVFNfRElTQVNTRU1CTEVfUkVRVUVTVCwgQ09OVEVYVF9TVEVQX0lOVE9fVEFSR0VUU19TVVBQT1JURUQsIEVESVRPUl9DT05UUklCVVRJT05fSUQsIElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uLCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdFZGl0b3JDb250cmlidXRpb24sIElEZWJ1Z1NlcnZpY2UsIFJFUExfVklFV19JRCwgV0FUQ0hfVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBnZXRFdmFsdWF0YWJsZUV4cHJlc3Npb25BdFBvc2l0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzYXNzZW1ibHlWaWV3SW5wdXQgfSBmcm9tICcuLi9jb21tb24vZGlzYXNzZW1ibHlWaWV3SW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVE9HR0xFX0JSRUFLUE9JTlRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnQ29tbWFuZHMuanMnO1xuXG5jbGFzcyBUb2dnbGVCcmVha3BvaW50QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUT0dHTEVfQlJFQUtQT0lOVF9JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUJyZWFrcG9pbnRBY3Rpb24nLCBcIlRvZ2dsZSBCcmVha3BvaW50XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZUJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVG9nZ2xlICYmQnJlYWtwb2ludFwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogbmxzLmxvY2FsaXplMignZGVidWdDYXRlZ29yeScsIFwiRGVidWdcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIENPTlRFWFRfRElTQVNTRU1CTFlfVklFV19GT0NVUyksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRjksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRGVidWdNZW51LFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRcdGdyb3VwOiAnNF9uZXdfYnJlYWtwb2ludCcsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlbnRyeT86IElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlUGFuZSBpbnN0YW5jZW9mIERpc2Fzc2VtYmx5Vmlldykge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSBlbnRyeSA/IGFjdGl2ZVBhbmUuZ2V0QWRkcmVzc0FuZE9mZnNldChlbnRyeSkgOiBhY3RpdmVQYW5lLmZvY3VzZWRBZGRyZXNzQW5kT2Zmc2V0O1xuXHRcdFx0aWYgKGxvY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGJwcyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRcdFx0Y29uc3QgdG9SZW1vdmUgPSBicHMuZmluZChicCA9PiBicC5hZGRyZXNzID09PSBsb2NhdGlvbi5hZGRyZXNzKTtcblx0XHRcdFx0aWYgKHRvUmVtb3ZlKSB7XG5cdFx0XHRcdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHModG9SZW1vdmUuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIHRvUmVtb3ZlLm9mZnNldCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVidWdTZXJ2aWNlLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludCh7IGluc3RydWN0aW9uUmVmZXJlbmNlOiBsb2NhdGlvbi5yZWZlcmVuY2UsIG9mZnNldDogbG9jYXRpb24ub2Zmc2V0LCBhZGRyZXNzOiBsb2NhdGlvbi5hZGRyZXNzLCBjYW5QZXJzaXN0OiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSB8fCBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKGVkaXRvcj8uaGFzTW9kZWwoKSkge1xuXHRcdFx0Y29uc3QgbW9kZWxVcmkgPSBlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRjb25zdCBjYW5TZXQgPSBkZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihlZGl0b3IuZ2V0TW9kZWwoKSk7XG5cdFx0XHQvLyBEb2VzIG5vdCBhY2NvdW50IGZvciBtdWx0aSBsaW5lIHNlbGVjdGlvbnMsIFNldCB0byByZW1vdmUgbXVsdGlwbGUgY3Vyc29yIG9uIHRoZSBzYW1lIGxpbmVcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXJzID0gWy4uLm5ldyBTZXQoZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAocyA9PiBzLmdldFBvc2l0aW9uKCkubGluZU51bWJlcikpXTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobGluZU51bWJlcnMubWFwKGFzeW5jIGxpbmUgPT4ge1xuXHRcdFx0XHRjb25zdCBicHMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IGxpbmVOdW1iZXI6IGxpbmUsIHVyaTogbW9kZWxVcmkgfSk7XG5cdFx0XHRcdGlmIChicHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoYnBzLm1hcChicCA9PiBkZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSkpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjYW5TZXQpIHtcblx0XHRcdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHMobW9kZWxVcmksIFt7IGxpbmVOdW1iZXI6IGxpbmUgfV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENvbmRpdGlvbmFsQnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5jb25kaXRpb25hbEJyZWFrcG9pbnQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2NvbmRpdGlvbmFsQnJlYWtwb2ludEVkaXRvckFjdGlvbicsIFwiRGVidWc6IEFkZCBDb25kaXRpb25hbCBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyTmV3QnJlYWtwb2ludE1lbnUsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNvbmRpdGlvbmFsQnJlYWtwb2ludCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvbmRpdGlvbmFsIEJyZWFrcG9pbnQuLi5cIiksXG5cdFx0XHRcdGdyb3VwOiAnMV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKHBvc2l0aW9uICYmIGVkaXRvci5oYXNNb2RlbCgpICYmIGRlYnVnU2VydmljZS5jYW5TZXRCcmVha3BvaW50c0luKGVkaXRvci5nZXRNb2RlbCgpKSkge1xuXHRcdFx0ZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbj4oQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lEKT8uc2hvd0JyZWFrcG9pbnRXaWRnZXQocG9zaXRpb24ubGluZU51bWJlciwgdW5kZWZpbmVkLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5DT05ESVRJT04pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBMb2dQb2ludEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZGVidWcuYWN0aW9uLmFkZExvZ1BvaW50Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsb2dQb2ludEVkaXRvckFjdGlvbicsIFwiRGVidWc6IEFkZCBMb2dwb2ludC4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0bWVudU9wdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJOZXdCcmVha3BvaW50TWVudSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlMb2dQb2ludCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkxvZ3BvaW50Li4uXCIpLFxuXHRcdFx0XHRcdGdyb3VwOiAnMV9icmVha3BvaW50cycsXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmIChwb3NpdGlvbiAmJiBlZGl0b3IuaGFzTW9kZWwoKSAmJiBkZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihlZGl0b3IuZ2V0TW9kZWwoKSkpIHtcblx0XHRcdGVkaXRvci5nZXRDb250cmlidXRpb248SUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24+KEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCk/LnNob3dCcmVha3BvaW50V2lkZ2V0KHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgQnJlYWtwb2ludFdpZGdldENvbnRleHQuTE9HX01FU1NBR0UpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUcmlnZ2VyQnlCcmVha3BvaW50QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24udHJpZ2dlckJ5QnJlYWtwb2ludCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0cmlnZ2VyQnlCcmVha3BvaW50RWRpdG9yQWN0aW9uJywgXCJEZWJ1ZzogQWRkIFRyaWdnZXJlZCBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRhbGlhczogJ0RlYnVnOiBUcmlnZ2VyZWQgQnJlYWtwb2ludC4uLicsXG5cdFx0XHRtZW51T3B0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhck5ld0JyZWFrcG9pbnRNZW51LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVRyaWdnZXJCeUJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUcmlnZ2VyZWQgQnJlYWtwb2ludC4uLlwiKSxcblx0XHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAocG9zaXRpb24gJiYgZWRpdG9yLmhhc01vZGVsKCkgJiYgZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4oZWRpdG9yLmdldE1vZGVsKCkpKSB7XG5cdFx0XHRlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uPihCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQpPy5zaG93QnJlYWtwb2ludFdpZGdldChwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LlRSSUdHRVJfUE9JTlQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBFZGl0QnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5lZGl0QnJlYWtwb2ludCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdFZGl0QnJlYWtwb2ludEVkaXRvckFjdGlvbicsIFwiRGVidWc6IEVkaXQgQnJlYWtwb2ludFwiKSxcblx0XHRcdGFsaWFzOiAnRGVidWc6IEVkaXQgRXhpc3RpbmcgQnJlYWtwb2ludCcsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJOZXdCcmVha3BvaW50TWVudSxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pRWRpdEJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZFZGl0IEJyZWFrcG9pbnRcIiksXG5cdFx0XHRcdGdyb3VwOiAnMV9icmVha3BvaW50cycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgZGVidWdNb2RlbCA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpO1xuXHRcdGlmICghKGVkaXRvci5oYXNNb2RlbCgpICYmIHBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVCcmVha3BvaW50cyA9IGRlYnVnTW9kZWwuZ2V0QnJlYWtwb2ludHMoeyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyIH0pO1xuXHRcdGlmIChsaW5lQnJlYWtwb2ludHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnJlYWtwb2ludERpc3RhbmNlcyA9IGxpbmVCcmVha3BvaW50cy5tYXAoYiA9PiB7XG5cdFx0XHRpZiAoIWIuY29sdW1uKSB7XG5cdFx0XHRcdHJldHVybiBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBNYXRoLmFicyhiLmNvbHVtbiAtIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgY2xvc2VzdEJyZWFrcG9pbnRJbmRleCA9IGJyZWFrcG9pbnREaXN0YW5jZXMuaW5kZXhPZihNYXRoLm1pbiguLi5icmVha3BvaW50RGlzdGFuY2VzKSk7XG5cdFx0Y29uc3QgY2xvc2VzdEJyZWFrcG9pbnQgPSBsaW5lQnJlYWtwb2ludHNbY2xvc2VzdEJyZWFrcG9pbnRJbmRleF07XG5cblx0XHRlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uPihCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQpPy5zaG93QnJlYWtwb2ludFdpZGdldChjbG9zZXN0QnJlYWtwb2ludC5saW5lTnVtYmVyLCBjbG9zZXN0QnJlYWtwb2ludC5jb2x1bW4pO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5EaXNhc3NlbWJseVZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2RlYnVnLmFjdGlvbi5vcGVuRGlzYXNzZW1ibHlWaWV3JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkRpc2Fzc2VtYmx5Vmlld0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ29wZW5EaXNhc3NlbWJseVZpZXcnLCBcIk9wZW4gRGlzYXNzZW1ibHkgVmlld1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlEaXNhc3NlbWJseVZpZXcnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEaXNhc3NlbWJseVZpZXdcIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPQ1VTRURfU1RBQ0tfRlJBTUVfSEFTX0lOU1RSVUNUSU9OX1BPSU5URVJfUkVGRVJFTkNFLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnZGVidWcnLFxuXHRcdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0lOX0RFQlVHX01PREUsIFBhbmVsRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpLCBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIENPTlRFWFRfRElTQVNTRU1CTEVfUkVRVUVTVF9TVVBQT1JURUQsIENPTlRFWFRfTEFOR1VBR0VfU1VQUE9SVFNfRElTQVNTRU1CTEVfUkVRVUVTVClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdFx0b3JkZXI6IDUwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0lOX0RFQlVHX01PREUsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJyksIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5pc0VxdWFsVG8oJ3N0YWNrRnJhbWUnKSwgQ09OVEVYVF9ESVNBU1NFTUJMRV9SRVFVRVNUX1NVUFBPUlRFRClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSU5fREVCVUdfTU9ERSwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSwgQ09OVEVYVF9ESVNBU1NFTUJMRV9SRVFVRVNUX1NVUFBPUlRFRClcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKERpc2Fzc2VtYmx5Vmlld0lucHV0Lmluc3RhbmNlLCB7IHBpbm5lZDogdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfSk7XG5cdH1cbn1cblxuY2xhc3MgVG9nZ2xlRGlzYXNzZW1ibHlWaWV3U291cmNlQ29kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZGVidWcuYWN0aW9uLnRvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGUnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNvbmZpZ0lEOiBzdHJpbmcgPSAnZGVidWcuZGlzYXNzZW1ibHlWaWV3LnNob3dTb3VyY2VDb2RlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlRGlzYXNzZW1ibHlWaWV3U291cmNlQ29kZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ3RvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGUnLCBcIlRvZ2dsZSBTb3VyY2UgQ29kZSBpbiBEaXNhc3NlbWJseSBWaWV3XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaXRvZ2dsZXNvdXJjZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRvZ2dsZVNvdXJjZVwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMigndG9nZ2xlRGlzYXNzZW1ibHlWaWV3U291cmNlQ29kZURlc2NyaXB0aW9uJywgJ1Nob3dzIG9yIGhpZGVzIHNvdXJjZSBjb2RlIGluIGRpc2Fzc2VtYmx5Jylcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWdTZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuZGlzYXNzZW1ibHlWaWV3LnNob3dTb3VyY2VDb2RlO1xuXHRcdFx0Y29uZmlnU2VydmljZS51cGRhdGVWYWx1ZShUb2dnbGVEaXNhc3NlbWJseVZpZXdTb3VyY2VDb2RlQWN0aW9uLmNvbmZpZ0lELCAhdmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuVG9DdXJzb3JBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi5ydW5Ub0N1cnNvcic7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTEFCRUw6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdydW5Ub0N1cnNvcicsIFwiUnVuIHRvIEN1cnNvclwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUnVuVG9DdXJzb3JBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogUnVuVG9DdXJzb3JBY3Rpb24uTEFCRUwudmFsdWUsXG5cdFx0XHRhbGlhczogJ0RlYnVnOiBSdW4gdG8gQ3Vyc29yJyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRcdFBhbmVsRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIENPTlRFWFRfRElTQVNTRU1CTFlfVklFV19GT0NVUyksXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLm5lZ2F0ZSgpXG5cdFx0XHQpLFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnZGVidWcnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9JTl9ERUJVR19NT0RFXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghKGVkaXRvci5oYXNNb2RlbCgpICYmIHBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cmkgPSBlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblxuXHRcdGxldCBjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2N1c2VkU3RhY2tGcmFtZSA9IHZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRpZiAoZm9jdXNlZFN0YWNrRnJhbWUgJiYgdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZvY3VzZWRTdGFja0ZyYW1lLnNvdXJjZS51cmksIHVyaSkgJiYgZm9jdXNlZFN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBJZiB0aGUgY3Vyc29yIGlzIG9uIGEgbGluZSBkaWZmZXJlbnQgdGhhbiB0aGUgb25lIHRoZSBkZWJ1Z2dlciBpcyBjdXJyZW50bHkgcGF1c2VkIG9uLCB0aGVuIHNlbmQgdGhlIGJyZWFrcG9pbnQgb24gdGhlIGxpbmUgd2l0aG91dCBhIGNvbHVtblxuXHRcdFx0Ly8gb3RoZXJ3aXNlIHNldCBpdCBhdCB0aGUgcHJlY2lzZSBjb2x1bW4gIzEwMjE5OVxuXHRcdFx0Y29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXHRcdH1cblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucnVuVG8odXJpLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb25Ub1JlcGxBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi5zZWxlY3Rpb25Ub1JlcGwnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IExBQkVMOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMignZXZhbHVhdGVJbkRlYnVnQ29uc29sZScsIFwiRXZhbHVhdGUgaW4gRGVidWcgQ29uc29sZVwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0aW9uVG9SZXBsQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IFNlbGVjdGlvblRvUmVwbEFjdGlvbi5MQUJFTC52YWx1ZSxcblx0XHRcdGFsaWFzOiAnRGVidWc6IEV2YWx1YXRlIGluIENvbnNvbGUnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENPTlRFWFRfSU5fREVCVUdfTU9ERSxcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbi5uZWdhdGUoKSksXG5cdFx0XHRjb250ZXh0TWVudU9wdHM6IHtcblx0XHRcdFx0Z3JvdXA6ICdkZWJ1ZycsXG5cdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0dGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIpLnRyaW0oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGxWaWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFJFUExfVklFV19JRCwgZmFsc2UpIGFzIFJlcGwgfCB1bmRlZmluZWQ7XG5cdFx0cmVwbFZpZXc/LnNlbmRSZXBsSW5wdXQodGV4dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvblRvV2F0Y2hFeHByZXNzaW9uc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuZGVidWcuYWN0aW9uLnNlbGVjdGlvblRvV2F0Y2gnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IExBQkVMOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMignYWRkVG9XYXRjaCcsIFwiQWRkIHRvIFdhdGNoXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZWxlY3Rpb25Ub1dhdGNoRXhwcmVzc2lvbnNBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogU2VsZWN0aW9uVG9XYXRjaEV4cHJlc3Npb25zQWN0aW9uLkxBQkVMLnZhbHVlLFxuXHRcdFx0YWxpYXM6ICdEZWJ1ZzogQWRkIHRvIFdhdGNoJyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDT05URVhUX0lOX0RFQlVHX01PREUsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24ubmVnYXRlKCkpLFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnZGVidWcnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZXhwcmVzc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdGV4cHJlc3Npb24gPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGV2YWx1YXRhYmxlRXhwcmVzc2lvbiA9IGF3YWl0IGdldEV2YWx1YXRhYmxlRXhwcmVzc2lvbkF0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0XHRpZiAoIWV2YWx1YXRhYmxlRXhwcmVzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRleHByZXNzaW9uID0gZXZhbHVhdGFibGVFeHByZXNzaW9uLm1hdGNoaW5nRXhwcmVzc2lvbjtcblx0XHR9XG5cblx0XHRpZiAoIWV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXcoV0FUQ0hfVklFV19JRCk7XG5cdFx0ZGVidWdTZXJ2aWNlLmFkZFdhdGNoRXhwcmVzc2lvbihleHByZXNzaW9uKTtcblx0fVxufVxuXG5jbGFzcyBTaG93RGVidWdIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZGVidWcuYWN0aW9uLnNob3dEZWJ1Z0hvdmVyJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdzaG93RGVidWdIb3ZlcicsIFwiRGVidWc6IFNob3cgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfTU9ERSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKCFwb3NpdGlvbiB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJRGVidWdFZGl0b3JDb250cmlidXRpb24+KEVESVRPUl9DT05UUklCVVRJT05fSUQpPy5zaG93SG92ZXIocG9zaXRpb24sIHRydWUpO1xuXHR9XG59XG5cbmNvbnN0IE5PX1RBUkdFVFNfTUVTU0FHRSA9IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmRlYnVnLmFjdGlvbi5zdGVwSW50b1RhcmdldHMubm90QXZhaWxhYmxlJywgXCJTdGVwIHRhcmdldHMgYXJlIG5vdCBhdmFpbGFibGUgaGVyZVwiKTtcblxuY2xhc3MgU3RlcEludG9UYXJnZXRzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uc3RlcEludG9UYXJnZXRzJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBMQUJFTCA9IG5scy5sb2NhbGl6ZSh7IGtleTogJ3N0ZXBJbnRvVGFyZ2V0cycsIGNvbW1lbnQ6IFsnU3RlcCBJbnRvIFRhcmdldHMgbGV0cyB0aGUgdXNlciBzdGVwIGludG8gYW4gZXhhY3QgZnVuY3Rpb24gaGUgb3Igc2hlIGlzIGludGVyZXN0ZWQgaW4uJ10gfSwgXCJTdGVwIEludG8gVGFyZ2V0XCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTdGVwSW50b1RhcmdldHNBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogU3RlcEludG9UYXJnZXRzQWN0aW9uLkxBQkVMLFxuXHRcdFx0YWxpYXM6ICdEZWJ1ZzogU3RlcCBJbnRvIFRhcmdldCcsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NURVBfSU5UT19UQVJHRVRTX1NVUFBPUlRFRCwgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpLCBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMpLFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnZGVidWcnLFxuXHRcdFx0XHRvcmRlcjogMS41XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dE1lbnVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0TWVudVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGNvbnN0IGZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGNvbnN0IHRhcmdldFBvc2l0aW9uID0gc2VsZWN0aW9uPy5nZXRQb3NpdGlvbigpIHx8IChmcmFtZSAmJiB7IGxpbmVOdW1iZXI6IGZyYW1lLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiBmcmFtZS5yYW5nZS5zdGFydENvbHVtbiB9KTtcblxuXHRcdGlmICghc2Vzc2lvbiB8fCAhZnJhbWUgfHwgIWVkaXRvci5oYXNNb2RlbCgpIHx8ICF1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZWRpdG9yLmdldE1vZGVsKCkudXJpLCBmcmFtZS5zb3VyY2UudXJpKSkge1xuXHRcdFx0aWYgKHRhcmdldFBvc2l0aW9uKSB7XG5cdFx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldChlZGl0b3IpPy5zaG93TWVzc2FnZShOT19UQVJHRVRTX01FU1NBR0UsIHRhcmdldFBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHRhcmdldHMgPSBhd2FpdCBzZXNzaW9uLnN0ZXBJblRhcmdldHMoZnJhbWUuZnJhbWVJZCk7XG5cdFx0aWYgKCF0YXJnZXRzPy5sZW5ndGgpIHtcblx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldChlZGl0b3IpPy5zaG93TWVzc2FnZShOT19UQVJHRVRTX01FU1NBR0UsIHRhcmdldFBvc2l0aW9uISk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgYSBzZWxlY3Rpb24sIHRyeSB0byBmaW5kIHRoZSBiZXN0IHRhcmdldCB3aXRoIGEgcG9zaXRpb24gdG8gc3RlcCBpbnRvLlxuXHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uYWxUYXJnZXRzOiB7IHN0YXJ0OiBQb3NpdGlvbjsgZW5kPzogUG9zaXRpb247IHRhcmdldDogRGVidWdQcm90b2NvbC5TdGVwSW5UYXJnZXQgfVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiB0YXJnZXRzKSB7XG5cdFx0XHRcdGlmICh0YXJnZXQubGluZSkge1xuXHRcdFx0XHRcdHBvc2l0aW9uYWxUYXJnZXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhcnQ6IG5ldyBQb3NpdGlvbih0YXJnZXQubGluZSwgdGFyZ2V0LmNvbHVtbiB8fCAxKSxcblx0XHRcdFx0XHRcdGVuZDogdGFyZ2V0LmVuZExpbmUgPyBuZXcgUG9zaXRpb24odGFyZ2V0LmVuZExpbmUsIHRhcmdldC5lbmRDb2x1bW4gfHwgMSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0YXJnZXRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRwb3NpdGlvbmFsVGFyZ2V0cy5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0LmxpbmVOdW1iZXIgLSBhLnN0YXJ0LmxpbmVOdW1iZXIgfHwgYi5zdGFydC5jb2x1bW4gLSBhLnN0YXJ0LmNvbHVtbik7XG5cblx0XHRcdGNvbnN0IG5lZWRsZSA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXG5cdFx0XHQvLyBUcnkgdG8gZmluZCBhIHRhcmdldCB3aXRoIGEgc3RhcnQgYW5kIGVuZCB0aGF0IGlzIGFyb3VuZCB0aGUgY3Vyc29yXG5cdFx0XHQvLyBwb3NpdGlvbi4gT3IsIGlmIG5vbmUsIHdoYXRldmVyIGlzIGJlZm9yZSB0aGUgY3Vyc29yLlxuXHRcdFx0Y29uc3QgYmVzdCA9IHBvc2l0aW9uYWxUYXJnZXRzLmZpbmQodCA9PiB0LmVuZCAmJiBuZWVkbGUuaXNCZWZvcmUodC5lbmQpICYmIHQuc3RhcnQuaXNCZWZvcmVPckVxdWFsKG5lZWRsZSkpIHx8IHBvc2l0aW9uYWxUYXJnZXRzLmZpbmQodCA9PiB0LmVuZCA9PT0gdW5kZWZpbmVkICYmIHQuc3RhcnQuaXNCZWZvcmVPckVxdWFsKG5lZWRsZSkpO1xuXHRcdFx0aWYgKGJlc3QpIHtcblx0XHRcdFx0c2Vzc2lvbi5zdGVwSW4oZnJhbWUudGhyZWFkLnRocmVhZElkLCBiZXN0LnRhcmdldC5pZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIHNob3cgYSBjb250ZXh0IG1lbnUgYW5kIGhhdmUgdGhlIHVzZXIgcGljayBhIHRhcmdldFxuXHRcdGVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChmcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGN1cnNvckNvb3JkcyA9IGVkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbih0YXJnZXRQb3NpdGlvbiEpO1xuXHRcdGNvbnN0IGVkaXRvckNvb3JkcyA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oZWRpdG9yLmdldERvbU5vZGUoKSk7XG5cdFx0Y29uc3QgeCA9IGVkaXRvckNvb3Jkcy5sZWZ0ICsgY3Vyc29yQ29vcmRzLmxlZnQ7XG5cdFx0Y29uc3QgeSA9IGVkaXRvckNvb3Jkcy50b3AgKyBjdXJzb3JDb29yZHMudG9wICsgY3Vyc29yQ29vcmRzLmhlaWdodDtcblxuXHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiAoeyB4LCB5IH0pLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0cy5tYXAodCA9PiB0b0FjdGlvbih7IGlkOiBgc3RlcEludG9UYXJnZXQ6JHt0LmlkfWAsIGxhYmVsOiB0LmxhYmVsLCBlbmFibGVkOiB0cnVlLCBydW46ICgpID0+IHNlc3Npb24uc3RlcEluKGZyYW1lLnRocmVhZC50aHJlYWRJZCwgdC5pZCkgfSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEdvVG9CcmVha3BvaW50QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBpc05leHQ6IGJvb2xlYW4sIG9wdHM6IElBY3Rpb25PcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0cyk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cblx0XHRpZiAoZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRVcmkgPSBlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRjb25zdCBjdXJyZW50TGluZSA9IGVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cdFx0XHQvL0JyZWFrcG9pbnRzIHJldHVybmVkIGZyb20gYGdldEJyZWFrcG9pbnRzYCBhcmUgYWxyZWFkeSBzb3J0ZWQuXG5cdFx0XHRjb25zdCBhbGxFbmFibGVkQnJlYWtwb2ludHMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IGVuYWJsZWRPbmx5OiB0cnVlIH0pO1xuXG5cdFx0XHQvL1RyeSB0byBmaW5kIGJyZWFrcG9pbnQgaW4gY3VycmVudCBmaWxlXG5cdFx0XHRsZXQgbW92ZUJyZWFrcG9pbnQgPVxuXHRcdFx0XHR0aGlzLmlzTmV4dFxuXHRcdFx0XHRcdD8gYWxsRW5hYmxlZEJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYnAudXJpLCBjdXJyZW50VXJpKSAmJiBicC5saW5lTnVtYmVyID4gY3VycmVudExpbmUpLnNoaWZ0KClcblx0XHRcdFx0XHQ6IGFsbEVuYWJsZWRCcmVha3BvaW50cy5maWx0ZXIoYnAgPT4gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGJwLnVyaSwgY3VycmVudFVyaSkgJiYgYnAubGluZU51bWJlciA8IGN1cnJlbnRMaW5lKS5wb3AoKTtcblxuXHRcdFx0Ly9UcnkgdG8gZmluZCBicmVha3BvaW50cyBpbiBmb2xsb3dpbmcgZmlsZXNcblx0XHRcdGlmICghbW92ZUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0bW92ZUJyZWFrcG9pbnQgPVxuXHRcdFx0XHRcdHRoaXMuaXNOZXh0XG5cdFx0XHRcdFx0XHQ/IGFsbEVuYWJsZWRCcmVha3BvaW50cy5maWx0ZXIoYnAgPT4gYnAudXJpLnRvU3RyaW5nKCkgPiBjdXJyZW50VXJpLnRvU3RyaW5nKCkpLnNoaWZ0KClcblx0XHRcdFx0XHRcdDogYWxsRW5hYmxlZEJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiBicC51cmkudG9TdHJpbmcoKSA8IGN1cnJlbnRVcmkudG9TdHJpbmcoKSkucG9wKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vTW92ZSB0byBmaXJzdCBvciBsYXN0IHBvc3NpYmxlIGJyZWFrcG9pbnRcblx0XHRcdGlmICghbW92ZUJyZWFrcG9pbnQgJiYgYWxsRW5hYmxlZEJyZWFrcG9pbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRtb3ZlQnJlYWtwb2ludCA9IHRoaXMuaXNOZXh0ID8gYWxsRW5hYmxlZEJyZWFrcG9pbnRzWzBdIDogYWxsRW5hYmxlZEJyZWFrcG9pbnRzW2FsbEVuYWJsZWRCcmVha3BvaW50cy5sZW5ndGggLSAxXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vdmVCcmVha3BvaW50KSB7XG5cdFx0XHRcdHJldHVybiBvcGVuQnJlYWtwb2ludFNvdXJjZShtb3ZlQnJlYWtwb2ludCwgZmFsc2UsIHRydWUsIGZhbHNlLCBkZWJ1Z1NlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBHb1RvTmV4dEJyZWFrcG9pbnRBY3Rpb24gZXh0ZW5kcyBHb1RvQnJlYWtwb2ludEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5nb1RvTmV4dEJyZWFrcG9pbnQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2dvVG9OZXh0QnJlYWtwb2ludCcsIFwiRGVidWc6IEdvIHRvIE5leHQgQnJlYWtwb2ludFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgR29Ub1ByZXZpb3VzQnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEdvVG9CcmVha3BvaW50QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5nb1RvUHJldmlvdXNCcmVha3BvaW50Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdnb1RvUHJldmlvdXNCcmVha3BvaW50JywgXCJEZWJ1ZzogR28gdG8gUHJldmlvdXMgQnJlYWtwb2ludFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgQ2xvc2VFeGNlcHRpb25XaWRnZXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5jbG9zZUV4Y2VwdGlvbldpZGdldCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignY2xvc2VFeGNlcHRpb25XaWRnZXQnLCBcIkNsb3NlIEV4Y2VwdGlvbiBXaWRnZXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRVhDRVBUSU9OX1dJREdFVF9WSVNJQkxFLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGVkaXRvci5nZXRDb250cmlidXRpb248SURlYnVnRWRpdG9yQ29udHJpYnV0aW9uPihFRElUT1JfQ09OVFJJQlVUSU9OX0lEKTtcblx0XHRjb250cmlidXRpb24/LmNsb3NlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5EaXNhc3NlbWJseVZpZXdBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUJyZWFrcG9pbnRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ29uZGl0aW9uYWxCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKExvZ1BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRyaWdnZXJCeUJyZWFrcG9pbnRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRWRpdEJyZWFrcG9pbnRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUnVuVG9DdXJzb3JBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU3RlcEludG9UYXJnZXRzQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNlbGVjdGlvblRvUmVwbEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihTZWxlY3Rpb25Ub1dhdGNoRXhwcmVzc2lvbnNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU2hvd0RlYnVnSG92ZXJBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR29Ub05leHRCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEdvVG9QcmV2aW91c0JyZWFrcG9pbnRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ2xvc2VFeGNlcHRpb25XaWRnZXRBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUUxQyxTQUFTLGNBQThCLDRCQUE0QjtBQUNuRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLFNBQVM7QUFFckIsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJB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
