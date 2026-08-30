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
import { localize, localize2 } from "../../../../../../nls.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from "../../../common/notebookContextKeys.js";
import { cellRangeToViewCells, expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CopyAction, CutAction, PasteAction } from "../../../../../../editor/contrib/clipboard/browser/clipboard.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { cloneNotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
import { CellEditType, SelectionStateType } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import * as platform from "../../../../../../base/common/platform.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { CellOverflowToolbarGroups, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT } from "../../controller/coreActions.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
import { Categories } from "../../../../../../platform/action/common/actionCommonCategories.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { showWindowLogActionId } from "../../../../../services/log/common/logConstants.js";
import { getActiveElement, getWindow, isEditableElement, isHTMLElement } from "../../../../../../base/browser/dom.js";
let _logging = false;
function toggleLogging() {
  _logging = !_logging;
}
function _log(loggerService, str) {
  if (_logging) {
    loggerService.info(`[NotebookClipboard]: ${str}`);
  }
}
function getFocusedEditor(accessor) {
  const loggerService = accessor.get(ILogService);
  const editorService = accessor.get(IEditorService);
  const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  if (!editor) {
    _log(loggerService, "[Revive Webview] No notebook editor found for active editor pane, bypass");
    return;
  }
  if (!editor.hasEditorFocus()) {
    _log(loggerService, "[Revive Webview] Notebook editor is not focused, bypass");
    return;
  }
  if (!editor.hasWebviewFocus()) {
    _log(loggerService, "[Revive Webview] Notebook editor backlayer webview is not focused, bypass");
    return;
  }
  const view = editor.getViewModel();
  if (view && view.viewCells.every((cell) => !cell.outputIsFocused && !cell.outputIsHovered)) {
    return;
  }
  return { editor, loggerService };
}
function getFocusedWebviewDelegate(accessor) {
  const result = getFocusedEditor(accessor);
  if (!result) {
    return;
  }
  const webview = result.editor.getInnerWebview();
  _log(result.loggerService, "[Revive Webview] Notebook editor backlayer webview is focused");
  return webview;
}
function withWebview(accessor, f) {
  const webview = getFocusedWebviewDelegate(accessor);
  if (webview) {
    f(webview);
    return true;
  }
  return false;
}
function withEditor(accessor, f) {
  const result = getFocusedEditor(accessor);
  return result ? f(result.editor) : false;
}
const PRIORITY = 105;
UndoCommand.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.undo());
});
RedoCommand.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.redo());
});
CopyAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.copy());
});
PasteAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.paste());
});
CutAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.cut());
});
function runPasteCells(editor, activeCell, pasteCells) {
  if (!editor.hasModel()) {
    return false;
  }
  const textModel = editor.textModel;
  if (editor.isReadOnly) {
    return false;
  }
  const originalState = {
    kind: SelectionStateType.Index,
    focus: editor.getFocus(),
    selections: editor.getSelections()
  };
  if (activeCell) {
    const currCellIndex = editor.getCellIndex(activeCell);
    const newFocusIndex = typeof currCellIndex === "number" ? currCellIndex + 1 : 0;
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: newFocusIndex,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: newFocusIndex, end: newFocusIndex + 1 },
      selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
    }), void 0, true);
  } else {
    if (editor.getLength() !== 0) {
      return false;
    }
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: 0,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: 0, end: 1 },
      selections: [{ start: 1, end: pasteCells.items.length + 1 }]
    }), void 0, true);
  }
  return true;
}
function runCopyCells(accessor, editor, targetCell) {
  if (!editor.hasModel()) {
    return false;
  }
  if (editor.hasOutputTextSelection()) {
    getWindow(editor.getDomNode()).document.execCommand("copy");
    return true;
  }
  const clipboardService = accessor.get(IClipboardService);
  const notebookService = accessor.get(INotebookService);
  const selections = editor.getSelections();
  if (targetCell) {
    const targetCellIndex = editor.getCellIndex(targetCell);
    const containingSelection = selections.find((selection) => selection.start <= targetCellIndex && targetCellIndex < selection.end);
    if (!containingSelection) {
      clipboardService.writeText(targetCell.getText());
      notebookService.setToCopy([targetCell.model], true);
      return true;
    }
  }
  const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
  const selectedCells = cellRangeToViewCells(editor, selectionRanges);
  if (!selectedCells.length) {
    return false;
  }
  clipboardService.writeText(selectedCells.map((cell) => cell.getText()).join("\n"));
  notebookService.setToCopy(selectedCells.map((cell) => cell.model), true);
  return true;
}
function runCutCells(accessor, editor, targetCell) {
  if (!editor.hasModel() || editor.isReadOnly) {
    return false;
  }
  const textModel = editor.textModel;
  const clipboardService = accessor.get(IClipboardService);
  const notebookService = accessor.get(INotebookService);
  const selections = editor.getSelections();
  if (targetCell) {
    const targetCellIndex = editor.getCellIndex(targetCell);
    const containingSelection2 = selections.find((selection) => selection.start <= targetCellIndex && targetCellIndex < selection.end);
    if (!containingSelection2) {
      clipboardService.writeText(targetCell.getText());
      const focus2 = editor.getFocus();
      const newFocus = focus2.end <= targetCellIndex ? focus2 : { start: focus2.start - 1, end: focus2.end - 1 };
      const newSelections = selections.map((selection) => selection.end <= targetCellIndex ? selection : { start: selection.start - 1, end: selection.end - 1 });
      textModel.applyEdits([
        { editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: [] }
      ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), void 0, true);
      notebookService.setToCopy([targetCell.model], false);
      return true;
    }
  }
  const focus = editor.getFocus();
  const containingSelection = selections.find((selection) => selection.start <= focus.start && focus.end <= selection.end);
  if (!containingSelection) {
    const targetCell2 = editor.cellAt(focus.start);
    clipboardService.writeText(targetCell2.getText());
    const newFocus = focus.end === editor.getLength() ? { start: focus.start - 1, end: focus.end - 1 } : focus;
    const newSelections = selections.map((selection) => selection.end <= focus.start ? selection : { start: selection.start - 1, end: selection.end - 1 });
    textModel.applyEdits([
      { editType: CellEditType.Replace, index: focus.start, count: 1, cells: [] }
    ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), void 0, true);
    notebookService.setToCopy([targetCell2.model], false);
    return true;
  }
  const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
  const selectedCells = cellRangeToViewCells(editor, selectionRanges);
  if (!selectedCells.length) {
    return false;
  }
  clipboardService.writeText(selectedCells.map((cell) => cell.getText()).join("\n"));
  const edits = selectionRanges.map((range) => ({ editType: CellEditType.Replace, index: range.start, count: range.end - range.start, cells: [] }));
  const firstSelectIndex = selectionRanges[0].start;
  const newFocusedCellIndex = firstSelectIndex < textModel.cells.length - 1 ? firstSelectIndex : Math.max(textModel.cells.length - 2, 0);
  textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: selectionRanges }, () => {
    return {
      kind: SelectionStateType.Index,
      focus: { start: newFocusedCellIndex, end: newFocusedCellIndex + 1 },
      selections: [{ start: newFocusedCellIndex, end: newFocusedCellIndex + 1 }]
    };
  }, void 0, true);
  notebookService.setToCopy(selectedCells.map((cell) => cell.model), false);
  return true;
}
let NotebookClipboardContribution = class extends Disposable {
  constructor(_editorService) {
    super();
    this._editorService = _editorService;
    const PRIORITY2 = 105;
    if (CopyAction) {
      this._register(CopyAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runCopyAction(accessor);
      }));
    }
    if (PasteAction) {
      this._register(PasteAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runPasteAction(accessor);
      }));
    }
    if (CutAction) {
      this._register(CutAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runCutAction(accessor);
      }));
    }
  }
  _getContext() {
    const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    const activeCell = editor?.getActiveCell();
    return {
      editor,
      activeCell
    };
  }
  _focusInsideEmebedMonaco(editor) {
    const windowSelection = getWindow(editor.getDomNode()).getSelection();
    if (windowSelection?.rangeCount !== 1) {
      return false;
    }
    const activeSelection = windowSelection.getRangeAt(0);
    if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
      return false;
    }
    let container = activeSelection.commonAncestorContainer;
    const body = editor.getDomNode();
    if (!body.contains(container)) {
      return false;
    }
    while (container && container !== body) {
      if (container.classList && container.classList.contains("monaco-editor")) {
        return true;
      }
      container = container.parentNode;
    }
    return false;
  }
  runCopyAction(accessor) {
    const loggerService = accessor.get(ILogService);
    const activeElement = getActiveElement();
    if (isHTMLElement(activeElement) && isEditableElement(activeElement)) {
      _log(loggerService, "[NotebookEditor] focus is on input or textarea element, bypass");
      return false;
    }
    const { editor } = this._getContext();
    if (!editor) {
      _log(loggerService, "[NotebookEditor] no active notebook editor, bypass");
      return false;
    }
    if (!editor.hasEditorFocus()) {
      _log(loggerService, "[NotebookEditor] focus is outside of the notebook editor, bypass");
      return false;
    }
    if (this._focusInsideEmebedMonaco(editor)) {
      _log(loggerService, "[NotebookEditor] focus is on embed monaco editor, bypass");
      return false;
    }
    _log(loggerService, "[NotebookEditor] run copy actions on notebook model");
    return runCopyCells(accessor, editor, void 0);
  }
  runPasteAction(accessor) {
    const activeElement = getActiveElement();
    if (activeElement && isEditableElement(activeElement)) {
      return false;
    }
    const { editor, activeCell } = this._getContext();
    if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
      return false;
    }
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    if (!pasteCells) {
      return false;
    }
    return runPasteCells(editor, activeCell, pasteCells);
  }
  runCutAction(accessor) {
    const activeElement = getActiveElement();
    if (activeElement && isEditableElement(activeElement)) {
      return false;
    }
    const { editor } = this._getContext();
    if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
      return false;
    }
    return runCutCells(accessor, editor, void 0);
  }
};
NotebookClipboardContribution.ID = "workbench.contrib.notebookClipboard";
NotebookClipboardContribution = __decorateClass([
  __decorateParam(0, IEditorService)
], NotebookClipboardContribution);
registerWorkbenchContribution2(NotebookClipboardContribution.ID, NotebookClipboardContribution, WorkbenchPhase.BlockRestore);
const COPY_CELL_COMMAND_ID = "notebook.cell.copy";
const CUT_CELL_COMMAND_ID = "notebook.cell.cut";
const PASTE_CELL_COMMAND_ID = "notebook.cell.paste";
const PASTE_CELL_ABOVE_COMMAND_ID = "notebook.cell.pasteAbove";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_COMMAND_ID,
        title: localize("notebookActions.copy", "Copy Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: NOTEBOOK_EDITOR_FOCUSED,
          group: CellOverflowToolbarGroups.Copy,
          order: 2
        },
        keybinding: platform.isNative ? void 0 : {
          primary: KeyMod.CtrlCmd | KeyCode.KeyC,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    runCopyCells(accessor, context.notebookEditor, context.cell);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: CUT_CELL_COMMAND_ID,
        title: localize("notebookActions.cut", "Cut Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
          group: CellOverflowToolbarGroups.Copy,
          order: 1
        },
        keybinding: platform.isNative ? void 0 : {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.KeyX,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyX, secondary: [KeyMod.Shift | KeyCode.Delete] },
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    runCutCells(accessor, context.notebookEditor, context.cell);
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: PASTE_CELL_COMMAND_ID,
        title: localize("notebookActions.paste", "Paste Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Copy,
          order: 3
        },
        keybinding: platform.isNative ? void 0 : {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.KeyV,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
          linux: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
          weight: KeybindingWeight.EditorContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    if (!context.notebookEditor.hasModel() || context.notebookEditor.isReadOnly) {
      return;
    }
    if (!pasteCells) {
      return;
    }
    runPasteCells(context.notebookEditor, context.cell, pasteCells);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: PASTE_CELL_ABOVE_COMMAND_ID,
        title: localize("notebookActions.pasteAbove", "Paste Cell Above"),
        keybinding: {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    const editor = context.notebookEditor;
    const textModel = editor.textModel;
    if (editor.isReadOnly) {
      return;
    }
    if (!pasteCells) {
      return;
    }
    const originalState = {
      kind: SelectionStateType.Index,
      focus: editor.getFocus(),
      selections: editor.getSelections()
    };
    const currCellIndex = context.notebookEditor.getCellIndex(context.cell);
    const newFocusIndex = currCellIndex;
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: currCellIndex,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: newFocusIndex, end: newFocusIndex + 1 },
      selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
    }), void 0, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleNotebookClipboardLog",
      title: localize2("toggleNotebookClipboardLog", "Toggle Notebook Clipboard Troubleshooting"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    toggleLogging();
    if (_logging) {
      const commandService = accessor.get(ICommandService);
      commandService.executeCommand(showWindowLogActionId);
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: "notebook.cell.output.selectAll",
        title: localize("notebook.cell.output.selectAll", "Select All"),
        keybinding: {
          primary: KeyMod.CtrlCmd | KeyCode.KeyA,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
          weight: NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT
        }
      }
    );
  }
  async runWithContext(accessor, _context) {
    withEditor(accessor, (editor) => {
      if (!editor.hasEditorFocus()) {
        return false;
      }
      if (editor.hasEditorFocus() && !editor.hasWebviewFocus()) {
        return true;
      }
      const cell = editor.getActiveCell();
      if (!cell || !cell.outputIsFocused || !editor.hasWebviewFocus()) {
        return true;
      }
      if (cell.inputInOutputIsFocused) {
        editor.selectInputContents(cell);
      } else {
        editor.selectOutputContent(cell);
      }
      return true;
    });
  }
});
export {
  NotebookClipboardContribution,
  runCopyCells,
  runCutCells,
  runPasteCells
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxjbGlwYm9hcmRcXG5vdGVib29rQ2xpcGJvYXJkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGNlbGxSYW5nZVRvVmlld0NlbGxzLCBleHBhbmRDZWxsUmFuZ2VzV2l0aEhpZGRlbkNlbGxzLCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENvcHlBY3Rpb24sIEN1dEFjdGlvbiwgUGFzdGVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jbGlwYm9hcmQvYnJvd3Nlci9jbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwsIE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBJQ2VsbEVkaXRPcGVyYXRpb24sIElTZWxlY3Rpb25TdGF0ZSwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLCBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCwgTm90ZWJvb2tBY3Rpb24sIE5vdGVib29rQ2VsbEFjdGlvbiwgTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULCBOT1RFQk9PS19PVVRQVVRfV0VCVklFV19BQ1RJT05fV0VJR0hUIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZG9Db21tYW5kLCBVbmRvQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHNob3dXaW5kb3dMb2dBY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xvZy9jb21tb24vbG9nQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgaXNFZGl0YWJsZUVsZW1lbnQsIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxubGV0IF9sb2dnaW5nOiBib29sZWFuID0gZmFsc2U7XG5mdW5jdGlvbiB0b2dnbGVMb2dnaW5nKCkge1xuXHRfbG9nZ2luZyA9ICFfbG9nZ2luZztcbn1cblxuZnVuY3Rpb24gX2xvZyhsb2dnZXJTZXJ2aWNlOiBJTG9nU2VydmljZSwgc3RyOiBzdHJpbmcpIHtcblx0aWYgKF9sb2dnaW5nKSB7XG5cdFx0bG9nZ2VyU2VydmljZS5pbmZvKGBbTm90ZWJvb2tDbGlwYm9hcmRdOiAke3N0cn1gKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRGb2N1c2VkRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IGxvZ2dlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRpZiAoIWVkaXRvcikge1xuXHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tSZXZpdmUgV2Vidmlld10gTm8gbm90ZWJvb2sgZWRpdG9yIGZvdW5kIGZvciBhY3RpdmUgZWRpdG9yIHBhbmUsIGJ5cGFzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmICghZWRpdG9yLmhhc0VkaXRvckZvY3VzKCkpIHtcblx0XHRfbG9nKGxvZ2dlclNlcnZpY2UsICdbUmV2aXZlIFdlYnZpZXddIE5vdGVib29rIGVkaXRvciBpcyBub3QgZm9jdXNlZCwgYnlwYXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCFlZGl0b3IuaGFzV2Vidmlld0ZvY3VzKCkpIHtcblx0XHRfbG9nKGxvZ2dlclNlcnZpY2UsICdbUmV2aXZlIFdlYnZpZXddIE5vdGVib29rIGVkaXRvciBiYWNrbGF5ZXIgd2VidmlldyBpcyBub3QgZm9jdXNlZCwgYnlwYXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdC8vIElmIG5vbmUgb2YgdGhlIG91dHB1dHMgaGF2ZSBmb2N1cywgdGhlbiB3ZWJ2aWV3IGlzIG5vdCBmb2N1c2VkXG5cdGNvbnN0IHZpZXcgPSBlZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdGlmICh2aWV3ICYmIHZpZXcudmlld0NlbGxzLmV2ZXJ5KGNlbGwgPT4gIWNlbGwub3V0cHV0SXNGb2N1c2VkICYmICFjZWxsLm91dHB1dElzSG92ZXJlZCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4geyBlZGl0b3IsIGxvZ2dlclNlcnZpY2UgfTtcbn1cbmZ1bmN0aW9uIGdldEZvY3VzZWRXZWJ2aWV3RGVsZWdhdGUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBJV2VidmlldyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3VsdCA9IGdldEZvY3VzZWRFZGl0b3IoYWNjZXNzb3IpO1xuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCB3ZWJ2aWV3ID0gcmVzdWx0LmVkaXRvci5nZXRJbm5lcldlYnZpZXcoKTtcblx0X2xvZyhyZXN1bHQubG9nZ2VyU2VydmljZSwgJ1tSZXZpdmUgV2Vidmlld10gTm90ZWJvb2sgZWRpdG9yIGJhY2tsYXllciB3ZWJ2aWV3IGlzIGZvY3VzZWQnKTtcblx0cmV0dXJuIHdlYnZpZXc7XG59XG5cbmZ1bmN0aW9uIHdpdGhXZWJ2aWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmOiAod2Vidmlld2U6IElXZWJ2aWV3KSA9PiB2b2lkKSB7XG5cdGNvbnN0IHdlYnZpZXcgPSBnZXRGb2N1c2VkV2Vidmlld0RlbGVnYXRlKGFjY2Vzc29yKTtcblx0aWYgKHdlYnZpZXcpIHtcblx0XHRmKHdlYnZpZXcpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gd2l0aEVkaXRvcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZjogKGVkaXRvcjogSU5vdGVib29rRWRpdG9yKSA9PiBib29sZWFuKSB7XG5cdGNvbnN0IHJlc3VsdCA9IGdldEZvY3VzZWRFZGl0b3IoYWNjZXNzb3IpO1xuXHRyZXR1cm4gcmVzdWx0ID8gZihyZXN1bHQuZWRpdG9yKSA6IGZhbHNlO1xufVxuXG5jb25zdCBQUklPUklUWSA9IDEwNTtcblxuVW5kb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay13ZWJ2aWV3JywgYWNjZXNzb3IgPT4ge1xuXHRyZXR1cm4gd2l0aFdlYnZpZXcoYWNjZXNzb3IsIHdlYnZpZXcgPT4gd2Vidmlldy51bmRvKCkpO1xufSk7XG5cblJlZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2std2VidmlldycsIGFjY2Vzc29yID0+IHtcblx0cmV0dXJuIHdpdGhXZWJ2aWV3KGFjY2Vzc29yLCB3ZWJ2aWV3ID0+IHdlYnZpZXcucmVkbygpKTtcbn0pO1xuXG5Db3B5QWN0aW9uPy5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLXdlYnZpZXcnLCBhY2Nlc3NvciA9PiB7XG5cdHJldHVybiB3aXRoV2VidmlldyhhY2Nlc3Nvciwgd2VidmlldyA9PiB3ZWJ2aWV3LmNvcHkoKSk7XG59KTtcblxuUGFzdGVBY3Rpb24/LmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2std2VidmlldycsIGFjY2Vzc29yID0+IHtcblx0cmV0dXJuIHdpdGhXZWJ2aWV3KGFjY2Vzc29yLCB3ZWJ2aWV3ID0+IHdlYnZpZXcucGFzdGUoKSk7XG59KTtcblxuQ3V0QWN0aW9uPy5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLXdlYnZpZXcnLCBhY2Nlc3NvciA9PiB7XG5cdHJldHVybiB3aXRoV2VidmlldyhhY2Nlc3Nvciwgd2VidmlldyA9PiB3ZWJ2aWV3LmN1dCgpKTtcbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuUGFzdGVDZWxscyhlZGl0b3I6IElOb3RlYm9va0VkaXRvciwgYWN0aXZlQ2VsbDogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQsIHBhc3RlQ2VsbHM6IHtcblx0aXRlbXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdO1xuXHRpc0NvcHk6IGJvb2xlYW47XG59KTogYm9vbGVhbiB7XG5cdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRpZiAoZWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBvcmlnaW5hbFN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgPSB7XG5cdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSxcblx0XHRzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdH07XG5cblx0aWYgKGFjdGl2ZUNlbGwpIHtcblx0XHRjb25zdCBjdXJyQ2VsbEluZGV4ID0gZWRpdG9yLmdldENlbGxJbmRleChhY3RpdmVDZWxsKTtcblx0XHRjb25zdCBuZXdGb2N1c0luZGV4ID0gdHlwZW9mIGN1cnJDZWxsSW5kZXggPT09ICdudW1iZXInID8gY3VyckNlbGxJbmRleCArIDEgOiAwO1xuXHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRpbmRleDogbmV3Rm9jdXNJbmRleCxcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGNlbGxzOiBwYXN0ZUNlbGxzLml0ZW1zLm1hcChjZWxsID0+IGNsb25lTm90ZWJvb2tDZWxsVGV4dE1vZGVsKGNlbGwpKVxuXHRcdFx0fVxuXHRcdF0sIHRydWUsIG9yaWdpbmFsU3RhdGUsICgpID0+ICh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogeyBzdGFydDogbmV3Rm9jdXNJbmRleCwgZW5kOiBuZXdGb2N1c0luZGV4ICsgMSB9LFxuXHRcdFx0c2VsZWN0aW9uczogW3sgc3RhcnQ6IG5ld0ZvY3VzSW5kZXgsIGVuZDogbmV3Rm9jdXNJbmRleCArIHBhc3RlQ2VsbHMuaXRlbXMubGVuZ3RoIH1dXG5cdFx0fSksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKGVkaXRvci5nZXRMZW5ndGgoKSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGNlbGxzOiBwYXN0ZUNlbGxzLml0ZW1zLm1hcChjZWxsID0+IGNsb25lTm90ZWJvb2tDZWxsVGV4dE1vZGVsKGNlbGwpKVxuXHRcdFx0fVxuXHRcdF0sIHRydWUsIG9yaWdpbmFsU3RhdGUsICgpID0+ICh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHRzZWxlY3Rpb25zOiBbeyBzdGFydDogMSwgZW5kOiBwYXN0ZUNlbGxzLml0ZW1zLmxlbmd0aCArIDEgfV1cblx0XHR9KSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuQ29weUNlbGxzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElOb3RlYm9va0VkaXRvciwgdGFyZ2V0Q2VsbDogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChlZGl0b3IuaGFzT3V0cHV0VGV4dFNlbGVjdGlvbigpKSB7XG5cdFx0Z2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpLmRvY3VtZW50LmV4ZWNDb21tYW5kKCdjb3B5Jyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0PElDbGlwYm9hcmRTZXJ2aWNlPihJQ2xpcGJvYXJkU2VydmljZSk7XG5cdGNvbnN0IG5vdGVib29rU2VydmljZSA9IGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKTtcblx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cblx0aWYgKHRhcmdldENlbGwpIHtcblx0XHRjb25zdCB0YXJnZXRDZWxsSW5kZXggPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KHRhcmdldENlbGwpO1xuXHRcdGNvbnN0IGNvbnRhaW5pbmdTZWxlY3Rpb24gPSBzZWxlY3Rpb25zLmZpbmQoc2VsZWN0aW9uID0+IHNlbGVjdGlvbi5zdGFydCA8PSB0YXJnZXRDZWxsSW5kZXggJiYgdGFyZ2V0Q2VsbEluZGV4IDwgc2VsZWN0aW9uLmVuZCk7XG5cblx0XHRpZiAoIWNvbnRhaW5pbmdTZWxlY3Rpb24pIHtcblx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRhcmdldENlbGwuZ2V0VGV4dCgpKTtcblx0XHRcdG5vdGVib29rU2VydmljZS5zZXRUb0NvcHkoW3RhcmdldENlbGwubW9kZWxdLCB0cnVlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHNlbGVjdGlvblJhbmdlcyA9IGV4cGFuZENlbGxSYW5nZXNXaXRoSGlkZGVuQ2VsbHMoZWRpdG9yLCBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpKTtcblx0Y29uc3Qgc2VsZWN0ZWRDZWxscyA9IGNlbGxSYW5nZVRvVmlld0NlbGxzKGVkaXRvciwgc2VsZWN0aW9uUmFuZ2VzKTtcblxuXHRpZiAoIXNlbGVjdGVkQ2VsbHMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoc2VsZWN0ZWRDZWxscy5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSkuam9pbignXFxuJykpO1xuXHRub3RlYm9va1NlcnZpY2Uuc2V0VG9Db3B5KHNlbGVjdGVkQ2VsbHMubWFwKGNlbGwgPT4gY2VsbC5tb2RlbCksIHRydWUpO1xuXG5cdHJldHVybiB0cnVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkN1dENlbGxzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElOb3RlYm9va0VkaXRvciwgdGFyZ2V0Q2VsbDogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCBlZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SUNsaXBib2FyZFNlcnZpY2U+KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpO1xuXHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRpZiAodGFyZ2V0Q2VsbCkge1xuXHRcdC8vIGZyb20gdWlcblx0XHRjb25zdCB0YXJnZXRDZWxsSW5kZXggPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KHRhcmdldENlbGwpO1xuXHRcdGNvbnN0IGNvbnRhaW5pbmdTZWxlY3Rpb24gPSBzZWxlY3Rpb25zLmZpbmQoc2VsZWN0aW9uID0+IHNlbGVjdGlvbi5zdGFydCA8PSB0YXJnZXRDZWxsSW5kZXggJiYgdGFyZ2V0Q2VsbEluZGV4IDwgc2VsZWN0aW9uLmVuZCk7XG5cblx0XHRpZiAoIWNvbnRhaW5pbmdTZWxlY3Rpb24pIHtcblx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRhcmdldENlbGwuZ2V0VGV4dCgpKTtcblx0XHRcdC8vIGRlbGV0ZSBjZWxsXG5cdFx0XHRjb25zdCBmb2N1cyA9IGVkaXRvci5nZXRGb2N1cygpO1xuXHRcdFx0Y29uc3QgbmV3Rm9jdXMgPSBmb2N1cy5lbmQgPD0gdGFyZ2V0Q2VsbEluZGV4ID8gZm9jdXMgOiB7IHN0YXJ0OiBmb2N1cy5zdGFydCAtIDEsIGVuZDogZm9jdXMuZW5kIC0gMSB9O1xuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9ucyA9IHNlbGVjdGlvbnMubWFwKHNlbGVjdGlvbiA9PiAoc2VsZWN0aW9uLmVuZCA8PSB0YXJnZXRDZWxsSW5kZXggPyBzZWxlY3Rpb24gOiB7IHN0YXJ0OiBzZWxlY3Rpb24uc3RhcnQgLSAxLCBlbmQ6IHNlbGVjdGlvbi5lbmQgLSAxIH0pKTtcblxuXHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IHRhcmdldENlbGxJbmRleCwgY291bnQ6IDEsIGNlbGxzOiBbXSB9XG5cdFx0XHRdLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiBzZWxlY3Rpb25zIH0sICgpID0+ICh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IG5ld0ZvY3VzLCBzZWxlY3Rpb25zOiBuZXdTZWxlY3Rpb25zIH0pLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRub3RlYm9va1NlcnZpY2Uuc2V0VG9Db3B5KFt0YXJnZXRDZWxsLm1vZGVsXSwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZm9jdXMgPSBlZGl0b3IuZ2V0Rm9jdXMoKTtcblx0Y29uc3QgY29udGFpbmluZ1NlbGVjdGlvbiA9IHNlbGVjdGlvbnMuZmluZChzZWxlY3Rpb24gPT4gc2VsZWN0aW9uLnN0YXJ0IDw9IGZvY3VzLnN0YXJ0ICYmIGZvY3VzLmVuZCA8PSBzZWxlY3Rpb24uZW5kKTtcblxuXHRpZiAoIWNvbnRhaW5pbmdTZWxlY3Rpb24pIHtcblx0XHQvLyBmb2N1cyBpcyBvdXQgb2YgYW55IHNlbGVjdGlvbiwgd2Ugc2hvdWxkIG9ubHkgY3V0IHRoaXMgY2VsbFxuXHRcdGNvbnN0IHRhcmdldENlbGwgPSBlZGl0b3IuY2VsbEF0KGZvY3VzLnN0YXJ0KTtcblx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh0YXJnZXRDZWxsLmdldFRleHQoKSk7XG5cdFx0Y29uc3QgbmV3Rm9jdXMgPSBmb2N1cy5lbmQgPT09IGVkaXRvci5nZXRMZW5ndGgoKSA/IHsgc3RhcnQ6IGZvY3VzLnN0YXJ0IC0gMSwgZW5kOiBmb2N1cy5lbmQgLSAxIH0gOiBmb2N1cztcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IChzZWxlY3Rpb24uZW5kIDw9IGZvY3VzLnN0YXJ0ID8gc2VsZWN0aW9uIDogeyBzdGFydDogc2VsZWN0aW9uLnN0YXJ0IC0gMSwgZW5kOiBzZWxlY3Rpb24uZW5kIC0gMSB9KSk7XG5cdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiBmb2N1cy5zdGFydCwgY291bnQ6IDEsIGNlbGxzOiBbXSB9XG5cdFx0XSwgdHJ1ZSwgeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogc2VsZWN0aW9ucyB9LCAoKSA9PiAoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBuZXdGb2N1cywgc2VsZWN0aW9uczogbmV3U2VsZWN0aW9ucyB9KSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdG5vdGVib29rU2VydmljZS5zZXRUb0NvcHkoW3RhcmdldENlbGwubW9kZWxdLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBzZWxlY3Rpb25SYW5nZXMgPSBleHBhbmRDZWxsUmFuZ2VzV2l0aEhpZGRlbkNlbGxzKGVkaXRvciwgZWRpdG9yLmdldFNlbGVjdGlvbnMoKSk7XG5cdGNvbnN0IHNlbGVjdGVkQ2VsbHMgPSBjZWxsUmFuZ2VUb1ZpZXdDZWxscyhlZGl0b3IsIHNlbGVjdGlvblJhbmdlcyk7XG5cblx0aWYgKCFzZWxlY3RlZENlbGxzLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHNlbGVjdGVkQ2VsbHMubWFwKGNlbGwgPT4gY2VsbC5nZXRUZXh0KCkpLmpvaW4oJ1xcbicpKTtcblx0Y29uc3QgZWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gc2VsZWN0aW9uUmFuZ2VzLm1hcChyYW5nZSA9PiAoeyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiByYW5nZS5zdGFydCwgY291bnQ6IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0LCBjZWxsczogW10gfSkpO1xuXHRjb25zdCBmaXJzdFNlbGVjdEluZGV4ID0gc2VsZWN0aW9uUmFuZ2VzWzBdLnN0YXJ0O1xuXG5cdC8qKlxuXHQgKiBJZiB3ZSBoYXZlIGNlbGxzLCAwLCAxLCAyLCAzLCA0LCA1LCA2XG5cdCAqIGFuZCBjZWxscyAxLCAyIGFyZSBzZWxlY3RlZCwgYW5kIHRoZW4gd2UgZGVsZXRlIGNlbGxzIDEgYW5kIDJcblx0ICogdGhlIG5ldyBmb2N1c2VkIGNlbGwgc2hvdWxkIHN0aWxsIGJlIGF0IGluZGV4IDFcblx0ICovXG5cdGNvbnN0IG5ld0ZvY3VzZWRDZWxsSW5kZXggPSBmaXJzdFNlbGVjdEluZGV4IDwgdGV4dE1vZGVsLmNlbGxzLmxlbmd0aCAtIDFcblx0XHQ/IGZpcnN0U2VsZWN0SW5kZXhcblx0XHQ6IE1hdGgubWF4KHRleHRNb2RlbC5jZWxscy5sZW5ndGggLSAyLCAwKTtcblxuXHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogc2VsZWN0aW9uUmFuZ2VzIH0sICgpID0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0Zm9jdXM6IHsgc3RhcnQ6IG5ld0ZvY3VzZWRDZWxsSW5kZXgsIGVuZDogbmV3Rm9jdXNlZENlbGxJbmRleCArIDEgfSxcblx0XHRcdHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiBuZXdGb2N1c2VkQ2VsbEluZGV4LCBlbmQ6IG5ld0ZvY3VzZWRDZWxsSW5kZXggKyAxIH1dXG5cdFx0fTtcblx0fSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0bm90ZWJvb2tTZXJ2aWNlLnNldFRvQ29weShzZWxlY3RlZENlbGxzLm1hcChjZWxsID0+IGNlbGwubW9kZWwpLCBmYWxzZSk7XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ub3RlYm9va0NsaXBib2FyZCc7XG5cblx0Y29uc3RydWN0b3IoQElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IFBSSU9SSVRZID0gMTA1O1xuXG5cdFx0aWYgKENvcHlBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKENvcHlBY3Rpb24uYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay1jbGlwYm9hcmQnLCBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1bkNvcHlBY3Rpb24oYWNjZXNzb3IpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChQYXN0ZUFjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoUGFzdGVBY3Rpb24uYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay1jbGlwYm9hcmQnLCBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1blBhc3RlQWN0aW9uKGFjY2Vzc29yKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoQ3V0QWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihDdXRBY3Rpb24uYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay1jbGlwYm9hcmQnLCBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1bkN1dEFjdGlvbihhY2Nlc3Nvcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29udGV4dCgpIHtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGVkaXRvcj8uZ2V0QWN0aXZlQ2VsbCgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRvcixcblx0XHRcdGFjdGl2ZUNlbGxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNJbnNpZGVFbWViZWRNb25hY28oZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpIHtcblx0XHRjb25zdCB3aW5kb3dTZWxlY3Rpb24gPSBnZXRXaW5kb3coZWRpdG9yLmdldERvbU5vZGUoKSkuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRpZiAod2luZG93U2VsZWN0aW9uPy5yYW5nZUNvdW50ICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2VsZWN0aW9uID0gd2luZG93U2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cdFx0aWYgKGFjdGl2ZVNlbGVjdGlvbi5zdGFydENvbnRhaW5lciA9PT0gYWN0aXZlU2VsZWN0aW9uLmVuZENvbnRhaW5lciAmJiBhY3RpdmVTZWxlY3Rpb24uZW5kT2Zmc2V0IC0gYWN0aXZlU2VsZWN0aW9uLnN0YXJ0T2Zmc2V0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRhaW5lcjogYW55ID0gYWN0aXZlU2VsZWN0aW9uLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyO1xuXHRcdGNvbnN0IGJvZHkgPSBlZGl0b3IuZ2V0RG9tTm9kZSgpO1xuXG5cdFx0aWYgKCFib2R5LmNvbnRhaW5zKGNvbnRhaW5lcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR3aGlsZSAoY29udGFpbmVyXG5cdFx0XHQmJlxuXHRcdFx0Y29udGFpbmVyICE9PSBib2R5KSB7XG5cdFx0XHRpZiAoKGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0ICYmIChjb250YWluZXIgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWVkaXRvcicpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIgPSBjb250YWluZXIucGFyZW50Tm9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRydW5Db3B5QWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgbG9nZ2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmIChpc0hUTUxFbGVtZW50KGFjdGl2ZUVsZW1lbnQpICYmIGlzRWRpdGFibGVFbGVtZW50KGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRfbG9nKGxvZ2dlclNlcnZpY2UsICdbTm90ZWJvb2tFZGl0b3JdIGZvY3VzIGlzIG9uIGlucHV0IG9yIHRleHRhcmVhIGVsZW1lbnQsIGJ5cGFzcycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWRpdG9yIH0gPSB0aGlzLl9nZXRDb250ZXh0KCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tOb3RlYm9va0VkaXRvcl0gbm8gYWN0aXZlIG5vdGVib29rIGVkaXRvciwgYnlwYXNzJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSkge1xuXHRcdFx0X2xvZyhsb2dnZXJTZXJ2aWNlLCAnW05vdGVib29rRWRpdG9yXSBmb2N1cyBpcyBvdXRzaWRlIG9mIHRoZSBub3RlYm9vayBlZGl0b3IsIGJ5cGFzcycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9mb2N1c0luc2lkZUVtZWJlZE1vbmFjbyhlZGl0b3IpKSB7XG5cdFx0XHRfbG9nKGxvZ2dlclNlcnZpY2UsICdbTm90ZWJvb2tFZGl0b3JdIGZvY3VzIGlzIG9uIGVtYmVkIG1vbmFjbyBlZGl0b3IsIGJ5cGFzcycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tOb3RlYm9va0VkaXRvcl0gcnVuIGNvcHkgYWN0aW9ucyBvbiBub3RlYm9vayBtb2RlbCcpO1xuXHRcdHJldHVybiBydW5Db3B5Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHJ1blBhc3RlQWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IDxIVE1MRWxlbWVudD5nZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0aWYgKGFjdGl2ZUVsZW1lbnQgJiYgaXNFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVkaXRvciwgYWN0aXZlQ2VsbCB9ID0gdGhpcy5fZ2V0Q29udGV4dCgpO1xuXHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLl9mb2N1c0luc2lkZUVtZWJlZE1vbmFjbyhlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpO1xuXHRcdGNvbnN0IHBhc3RlQ2VsbHMgPSBub3RlYm9va1NlcnZpY2UuZ2V0VG9Db3B5KCk7XG5cblx0XHRpZiAoIXBhc3RlQ2VsbHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcnVuUGFzdGVDZWxscyhlZGl0b3IsIGFjdGl2ZUNlbGwsIHBhc3RlQ2VsbHMpO1xuXHR9XG5cblx0cnVuQ3V0QWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IDxIVE1MRWxlbWVudD5nZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0aWYgKGFjdGl2ZUVsZW1lbnQgJiYgaXNFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVkaXRvciB9ID0gdGhpcy5fZ2V0Q29udGV4dCgpO1xuXHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLl9mb2N1c0luc2lkZUVtZWJlZE1vbmFjbyhlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJ1bkN1dENlbGxzKGFjY2Vzc29yLCBlZGl0b3IsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uLklELCBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuY29uc3QgQ09QWV9DRUxMX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jb3B5JztcbmNvbnN0IENVVF9DRUxMX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jdXQnO1xuY29uc3QgUEFTVEVfQ0VMTF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwucGFzdGUnO1xuY29uc3QgUEFTVEVfQ0VMTF9BQk9WRV9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwucGFzdGVBYm92ZSc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogQ09QWV9DRUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmNvcHknLCBcIkNvcHkgQ2VsbFwiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuQ29weSxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5YmluZGluZzogcGxhdGZvcm0uaXNOYXRpdmUgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHJ1bkNvcHlDZWxscyhhY2Nlc3NvciwgY29udGV4dC5ub3RlYm9va0VkaXRvciwgY29udGV4dC5jZWxsKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogQ1VUX0NFTExfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuY3V0JywgXCJDdXQgQ2VsbFwiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkNvcHksXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHBsYXRmb3JtLmlzTmF0aXZlID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCxcblx0XHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRGVsZXRlXSB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0cnVuQ3V0Q2VsbHMoYWNjZXNzb3IsIGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIGNvbnRleHQuY2VsbCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogUEFTVEVfQ0VMTF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5wYXN0ZScsIFwiUGFzdGUgQ2VsbFwiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkNvcHksXG5cdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHBsYXRmb3JtLmlzTmF0aXZlID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Vixcblx0XHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlWLCBzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkluc2VydF0gfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpO1xuXHRcdGNvbnN0IHBhc3RlQ2VsbHMgPSBub3RlYm9va1NlcnZpY2UuZ2V0VG9Db3B5KCk7XG5cblx0XHRpZiAoIWNvbnRleHQubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSB8fCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXBhc3RlQ2VsbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRydW5QYXN0ZUNlbGxzKGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIGNvbnRleHQuY2VsbCwgcGFzdGVDZWxscyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFBBU1RFX0NFTExfQUJPVkVfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMucGFzdGVBYm92ZScsIFwiUGFzdGUgQ2VsbCBBYm92ZVwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Vixcblx0XHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBub3RlYm9va1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSk7XG5cdFx0Y29uc3QgcGFzdGVDZWxscyA9IG5vdGVib29rU2VydmljZS5nZXRUb0NvcHkoKTtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRpZiAoZWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXBhc3RlQ2VsbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcmlnaW5hbFN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgPSB7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogZWRpdG9yLmdldEZvY3VzKCksXG5cdFx0XHRzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1cnJDZWxsSW5kZXggPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjb250ZXh0LmNlbGwpO1xuXHRcdGNvbnN0IG5ld0ZvY3VzSW5kZXggPSBjdXJyQ2VsbEluZGV4O1xuXHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRpbmRleDogY3VyckNlbGxJbmRleCxcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGNlbGxzOiBwYXN0ZUNlbGxzLml0ZW1zLm1hcChjZWxsID0+IGNsb25lTm90ZWJvb2tDZWxsVGV4dE1vZGVsKGNlbGwpKVxuXHRcdFx0fVxuXHRcdF0sIHRydWUsIG9yaWdpbmFsU3RhdGUsICgpID0+ICh7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogeyBzdGFydDogbmV3Rm9jdXNJbmRleCwgZW5kOiBuZXdGb2N1c0luZGV4ICsgMSB9LFxuXHRcdFx0c2VsZWN0aW9uczogW3sgc3RhcnQ6IG5ld0ZvY3VzSW5kZXgsIGVuZDogbmV3Rm9jdXNJbmRleCArIHBhc3RlQ2VsbHMuaXRlbXMubGVuZ3RoIH1dXG5cdFx0fSksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU5vdGVib29rQ2xpcGJvYXJkTG9nJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZU5vdGVib29rQ2xpcGJvYXJkTG9nJywgJ1RvZ2dsZSBOb3RlYm9vayBDbGlwYm9hcmQgVHJvdWJsZXNob290aW5nJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dG9nZ2xlTG9nZ2luZygpO1xuXHRcdGlmIChfbG9nZ2luZykge1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNob3dXaW5kb3dMb2dBY3Rpb25JZCk7XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdub3RlYm9vay5jZWxsLm91dHB1dC5zZWxlY3RBbGwnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rLmNlbGwub3V0cHV0LnNlbGVjdEFsbCcsIFwiU2VsZWN0IEFsbFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlBLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQpLFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfT1VUUFVUX1dFQlZJRVdfQUNUSU9OX1dFSUdIVFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHR3aXRoRWRpdG9yKGFjY2Vzc29yLCBlZGl0b3IgPT4ge1xuXHRcdFx0aWYgKCFlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgJiYgIWVkaXRvci5oYXNXZWJ2aWV3Rm9jdXMoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdFx0aWYgKCFjZWxsIHx8ICFjZWxsLm91dHB1dElzRm9jdXNlZCB8fCAhZWRpdG9yLmhhc1dlYnZpZXdGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNlbGwuaW5wdXRJbk91dHB1dElzRm9jdXNlZCkge1xuXHRcdFx0XHRlZGl0b3Iuc2VsZWN0SW5wdXRDb250ZW50cyhjZWxsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkaXRvci5zZWxlY3RPdXRwdXRDb250ZW50KGNlbGwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0Isc0NBQXNDO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCLDBCQUEwQix5QkFBeUIsK0JBQStCO0FBQ25ILFNBQVMsc0JBQXNCLGlDQUFpQyx1Q0FBd0U7QUFDeEksU0FBUyxZQUFZLFdBQVcsbUJBQW1CO0FBQ25ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQXlEO0FBQ2xFLFNBQVMsY0FBbUQsMEJBQTBCO0FBQ3RGLFNBQVMsd0JBQXdCO0FBQ2pDLFlBQVksY0FBYztBQUMxQixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUywyQkFBK0UsZ0JBQWdCLG9CQUFvQixzQ0FBc0MsNkNBQTZDO0FBQy9NLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMs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O0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsVUFBc0M7QUFDdEYsZUFBVyxVQUFVLFlBQVU7QUFDOUIsVUFBSSxDQUFDLE9BQU8sZUFBZSxHQUFHO0FBQzdCLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxPQUFPLGVBQWUsS0FBSyxDQUFDLE9BQU8sZ0JBQWdCLEdBQUc7QUFDekQsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLE9BQU8sT0FBTyxjQUFjO0FBQ2xDLFVBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxtQkFBbUIsQ0FBQyxPQUFPLGdCQUFnQixHQUFHO0FBQ2hFLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxLQUFLLHdCQUF3QjtBQUNoQyxlQUFPLG9CQUFvQixJQUFJO0FBQUEsTUFDaEMsT0FBTztBQUNOLGVBQU8sb0JBQW9CLElBQUk7QUFBQSxNQUNoQztBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUVGO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiY29udGFpbmluZ1NlbGVjdGlvbiIsICJmb2N1cyIsICJ0YXJnZXRDZWxsIiwgIlBSSU9SSVRZIl0KfQo=
