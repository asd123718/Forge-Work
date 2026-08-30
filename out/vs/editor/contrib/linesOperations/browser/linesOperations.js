import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CoreEditingCommands } from "../../../browser/coreCommands.js";
import { EditorAction, registerEditorAction } from "../../../browser/editorExtensions.js";
import { ReplaceCommand, ReplaceCommandThatPreservesSelection, ReplaceCommandThatSelectsText } from "../../../common/commands/replaceCommand.js";
import { TrimTrailingWhitespaceCommand } from "../../../common/commands/trimTrailingWhitespaceCommand.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { EnterOperation } from "../../../common/cursor/cursorTypeEditOperations.js";
import { TypeOperations } from "../../../common/cursor/cursorTypeOperations.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { CopyLinesCommand } from "./copyLinesCommand.js";
import { MoveLinesCommand } from "./moveLinesCommand.js";
import { SortLinesCommand } from "./sortLinesCommand.js";
class AbstractCopyLinesAction extends EditorAction {
  constructor(down, opts) {
    super(opts);
    this.down = down;
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections().map((selection, index) => ({ selection, index, ignore: false }));
    selections.sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));
    let prev = selections[0];
    for (let i = 1; i < selections.length; i++) {
      const curr = selections[i];
      if (prev.selection.endLineNumber === curr.selection.startLineNumber) {
        if (prev.index < curr.index) {
          curr.ignore = true;
        } else {
          prev.ignore = true;
          prev = curr;
        }
      }
    }
    const commands = [];
    for (const selection of selections) {
      commands.push(new CopyLinesCommand(selection.selection, this.down, selection.ignore));
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class CopyLinesUpAction extends AbstractCopyLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.copyLinesUpAction",
      label: nls.localize2("lines.copyUp", "Copy Line Up"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miCopyLinesUp", comment: ["&& denotes a mnemonic"] }, "&&Copy Line Up"),
        order: 1
      },
      canTriggerInlineEdits: true
    });
  }
}
class CopyLinesDownAction extends AbstractCopyLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.copyLinesDownAction",
      label: nls.localize2("lines.copyDown", "Copy Line Down"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miCopyLinesDown", comment: ["&& denotes a mnemonic"] }, "Co&&py Line Down"),
        order: 2
      },
      canTriggerInlineEdits: true
    });
  }
}
class DuplicateSelectionAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.duplicateSelection",
      label: nls.localize2("duplicateSelection", "Duplicate Selection"),
      precondition: EditorContextKeys.writable,
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miDuplicateSelection", comment: ["&& denotes a mnemonic"] }, "&&Duplicate Selection"),
        order: 5
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const commands = [];
    const selections = editor.getSelections();
    const model = editor.getModel();
    for (const selection of selections) {
      if (selection.isEmpty()) {
        commands.push(new CopyLinesCommand(selection, true));
      } else {
        const insertSelection = new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn);
        commands.push(new ReplaceCommandThatSelectsText(insertSelection, model.getValueInRange(selection)));
      }
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class AbstractMoveLinesAction extends EditorAction {
  constructor(down, opts) {
    super(opts);
    this.down = down;
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const commands = [];
    const selections = editor.getSelections() || [];
    const autoIndent = editor.getOption(EditorOption.autoIndent);
    for (const selection of selections) {
      commands.push(new MoveLinesCommand(selection, this.down, autoIndent, languageConfigurationService));
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class MoveLinesUpAction extends AbstractMoveLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.moveLinesUpAction",
      label: nls.localize2("lines.moveUp", "Move Line Up"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.UpArrow,
        linux: { primary: KeyMod.Alt | KeyCode.UpArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miMoveLinesUp", comment: ["&& denotes a mnemonic"] }, "Mo&&ve Line Up"),
        order: 3
      },
      canTriggerInlineEdits: true
    });
  }
}
class MoveLinesDownAction extends AbstractMoveLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.moveLinesDownAction",
      label: nls.localize2("lines.moveDown", "Move Line Down"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.DownArrow,
        linux: { primary: KeyMod.Alt | KeyCode.DownArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miMoveLinesDown", comment: ["&& denotes a mnemonic"] }, "Move &&Line Down"),
        order: 4
      },
      canTriggerInlineEdits: true
    });
  }
}
class AbstractSortLinesAction extends EditorAction {
  constructor(descending, opts) {
    super(opts);
    this.descending = descending;
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    let selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
    }
    for (const selection of selections) {
      if (!SortLinesCommand.canRun(editor.getModel(), selection, this.descending)) {
        return;
      }
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = new SortLinesCommand(selections[i], this.descending);
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class SortLinesAscendingAction extends AbstractSortLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.sortLinesAscending",
      label: nls.localize2("lines.sortAscending", "Sort Lines Ascending"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
}
class SortLinesDescendingAction extends AbstractSortLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.sortLinesDescending",
      label: nls.localize2("lines.sortDescending", "Sort Lines Descending"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
}
class DeleteDuplicateLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.removeDuplicateLines",
      label: nls.localize2("lines.deleteDuplicates", "Delete Duplicate Lines"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
      return;
    }
    const edits = [];
    const endCursorState = [];
    let linesDeleted = 0;
    let updateSelection = true;
    let selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
      updateSelection = false;
    }
    for (const selection of selections) {
      const uniqueLines = /* @__PURE__ */ new Set();
      const lines = [];
      for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) {
        const line = model.getLineContent(i);
        if (uniqueLines.has(line)) {
          continue;
        }
        lines.push(line);
        uniqueLines.add(line);
      }
      const selectionToReplace = new Selection(
        selection.startLineNumber,
        1,
        selection.endLineNumber,
        model.getLineMaxColumn(selection.endLineNumber)
      );
      const adjustedSelectionStart = selection.startLineNumber - linesDeleted;
      const finalSelection = new Selection(
        adjustedSelectionStart,
        1,
        adjustedSelectionStart + lines.length - 1,
        lines[lines.length - 1].length + 1
      );
      edits.push(EditOperation.replace(selectionToReplace, lines.join("\n")));
      endCursorState.push(finalSelection);
      linesDeleted += selection.endLineNumber - selection.startLineNumber + 1 - lines.length;
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, updateSelection ? endCursorState : void 0);
    editor.pushUndoStop();
  }
}
class ReverseLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reverseLines",
      label: nls.localize2("lines.reverseLines", "Reverse lines"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    const originalSelections = editor.getSelections();
    let selections = originalSelections;
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
    }
    const edits = [];
    const resultingSelections = [];
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const originalSelection = originalSelections[i];
      let endLineNumber = selection.endLineNumber;
      if (selection.startLineNumber < selection.endLineNumber && selection.endColumn === 1) {
        endLineNumber--;
      }
      let range = new Range(selection.startLineNumber, 1, endLineNumber, model.getLineMaxColumn(endLineNumber));
      if (endLineNumber === model.getLineCount() && model.getLineContent(range.endLineNumber) === "") {
        range = range.setEndPosition(range.endLineNumber - 1, model.getLineMaxColumn(range.endLineNumber - 1));
      }
      const lines = [];
      for (let i2 = range.endLineNumber; i2 >= range.startLineNumber; i2--) {
        lines.push(model.getLineContent(i2));
      }
      const edit = EditOperation.replace(range, lines.join("\n"));
      edits.push(edit);
      const updateLineNumber = function(lineNumber) {
        return lineNumber <= range.endLineNumber ? range.endLineNumber - lineNumber + range.startLineNumber : lineNumber;
      };
      const updateSelection = function(sel) {
        if (sel.isEmpty()) {
          return new Selection(updateLineNumber(sel.positionLineNumber), sel.positionColumn, updateLineNumber(sel.positionLineNumber), sel.positionColumn);
        } else {
          const newSelectionStart = updateLineNumber(sel.selectionStartLineNumber);
          const newPosition = updateLineNumber(sel.positionLineNumber);
          const newSelectionStartColumn = sel.selectionStartColumn;
          const newPositionColumn = sel.positionColumn;
          return new Selection(newSelectionStart, newSelectionStartColumn, newPosition, newPositionColumn);
        }
      };
      resultingSelections.push(updateSelection(originalSelection));
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, resultingSelections);
    editor.pushUndoStop();
  }
}
const _TrimTrailingWhitespaceAction = class _TrimTrailingWhitespaceAction extends EditorAction {
  constructor() {
    super({
      id: _TrimTrailingWhitespaceAction.ID,
      label: nls.localize2("lines.trimTrailingWhitespace", "Trim Trailing Whitespace"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(_accessor, editor, args) {
    let cursors = [];
    if (args.reason === "auto-save") {
      cursors = (editor.getSelections() || []).map((s) => new Position(s.positionLineNumber, s.positionColumn));
    }
    const selection = editor.getSelection();
    if (selection === null) {
      return;
    }
    const config = _accessor.get(IConfigurationService);
    const model = editor.getModel();
    const trimInRegexAndStrings = config.getValue("files.trimTrailingWhitespaceInRegexAndStrings", { overrideIdentifier: model?.getLanguageId(), resource: model?.uri });
    const command = new TrimTrailingWhitespaceCommand(selection, cursors, trimInRegexAndStrings);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
  }
};
_TrimTrailingWhitespaceAction.ID = "editor.action.trimTrailingWhitespace";
let TrimTrailingWhitespaceAction = _TrimTrailingWhitespaceAction;
class DeleteLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.deleteLines",
      label: nls.localize2("lines.delete", "Delete Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const ops = this._getLinesToRemove(editor);
    const model = editor.getModel();
    if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
      return;
    }
    let linesDeleted = 0;
    const edits = [];
    const cursorState = [];
    for (let i = 0, len = ops.length; i < len; i++) {
      const op = ops[i];
      let startLineNumber = op.startLineNumber;
      let endLineNumber = op.endLineNumber;
      let startColumn = 1;
      let endColumn = model.getLineMaxColumn(endLineNumber);
      if (endLineNumber < model.getLineCount()) {
        endLineNumber += 1;
        endColumn = 1;
      } else if (startLineNumber > 1) {
        startLineNumber -= 1;
        startColumn = model.getLineMaxColumn(startLineNumber);
      }
      edits.push(EditOperation.replace(new Selection(startLineNumber, startColumn, endLineNumber, endColumn), ""));
      cursorState.push(new Selection(startLineNumber - linesDeleted, op.positionColumn, startLineNumber - linesDeleted, op.positionColumn));
      linesDeleted += op.endLineNumber - op.startLineNumber + 1;
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, cursorState);
    editor.revealAllCursors(true);
    editor.pushUndoStop();
  }
  _getLinesToRemove(editor) {
    const operations = editor.getSelections().map((s) => {
      let endLineNumber = s.endLineNumber;
      if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
        endLineNumber -= 1;
      }
      return {
        startLineNumber: s.startLineNumber,
        selectionStartColumn: s.selectionStartColumn,
        endLineNumber,
        positionColumn: s.positionColumn
      };
    });
    operations.sort((a, b) => {
      if (a.startLineNumber === b.startLineNumber) {
        return a.endLineNumber - b.endLineNumber;
      }
      return a.startLineNumber - b.startLineNumber;
    });
    const mergedOperations = [];
    let previousOperation = operations[0];
    for (let i = 1; i < operations.length; i++) {
      if (previousOperation.endLineNumber + 1 >= operations[i].startLineNumber) {
        previousOperation.endLineNumber = operations[i].endLineNumber;
      } else {
        mergedOperations.push(previousOperation);
        previousOperation = operations[i];
      }
    }
    mergedOperations.push(previousOperation);
    return mergedOperations;
  }
}
class IndentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.indentLines",
      label: nls.localize2("lines.indent", "Indent Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.BracketRight,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
    editor.pushUndoStop();
  }
}
class OutdentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.outdentLines",
      label: nls.localize2("lines.outdent", "Outdent Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.BracketLeft,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    CoreEditingCommands.Outdent.runEditorCommand(_accessor, editor, null);
  }
}
const _InsertLineBeforeAction = class _InsertLineBeforeAction extends EditorAction {
  constructor() {
    super({
      id: _InsertLineBeforeAction.ID,
      label: nls.localize2("lines.insertBefore", "Insert Line Above"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, EnterOperation.lineInsertBefore(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
  }
};
_InsertLineBeforeAction.ID = "editor.action.insertLineBefore";
let InsertLineBeforeAction = _InsertLineBeforeAction;
const _InsertLineAfterAction = class _InsertLineAfterAction extends EditorAction {
  constructor() {
    super({
      id: _InsertLineAfterAction.ID,
      label: nls.localize2("lines.insertAfter", "Insert Line Below"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, EnterOperation.lineInsertAfter(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
  }
};
_InsertLineAfterAction.ID = "editor.action.insertLineAfter";
let InsertLineAfterAction = _InsertLineAfterAction;
class AbstractDeleteAllToBoundaryAction extends EditorAction {
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const primaryCursor = editor.getSelection();
    const rangesToDelete = this._getRangesToDelete(editor);
    const effectiveRanges = [];
    for (let i = 0, count = rangesToDelete.length - 1; i < count; i++) {
      const range = rangesToDelete[i];
      const nextRange = rangesToDelete[i + 1];
      if (Range.intersectRanges(range, nextRange) === null) {
        effectiveRanges.push(range);
      } else {
        rangesToDelete[i + 1] = Range.plusRange(range, nextRange);
      }
    }
    effectiveRanges.push(rangesToDelete[rangesToDelete.length - 1]);
    const endCursorState = this._getEndCursorState(primaryCursor, effectiveRanges);
    const edits = effectiveRanges.map((range) => {
      return EditOperation.replace(range, "");
    });
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, endCursorState);
    editor.pushUndoStop();
  }
}
class DeleteAllLeftAction extends AbstractDeleteAllToBoundaryAction {
  constructor() {
    super({
      id: "deleteAllLeft",
      label: nls.localize2("lines.deleteAllLeft", "Delete All Left"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: 0,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  _getEndCursorState(primaryCursor, rangesToDelete) {
    let endPrimaryCursor = null;
    const endCursorState = [];
    let deletedLines = 0;
    rangesToDelete.forEach((range) => {
      let endCursor;
      if (range.endColumn === 1 && deletedLines > 0) {
        const newStartLine = range.startLineNumber - deletedLines;
        endCursor = new Selection(newStartLine, range.startColumn, newStartLine, range.startColumn);
      } else {
        endCursor = new Selection(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
      }
      deletedLines += range.endLineNumber - range.startLineNumber;
      if (range.intersectRanges(primaryCursor)) {
        endPrimaryCursor = endCursor;
      } else {
        endCursorState.push(endCursor);
      }
    });
    if (endPrimaryCursor) {
      endCursorState.unshift(endPrimaryCursor);
    }
    return endCursorState;
  }
  _getRangesToDelete(editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return [];
    }
    let rangesToDelete = selections;
    const model = editor.getModel();
    if (model === null) {
      return [];
    }
    rangesToDelete.sort(Range.compareRangesUsingStarts);
    rangesToDelete = rangesToDelete.map((selection) => {
      if (selection.isEmpty()) {
        if (selection.startColumn === 1) {
          const deleteFromLine = Math.max(1, selection.startLineNumber - 1);
          const deleteFromColumn = selection.startLineNumber === 1 ? 1 : model.getLineLength(deleteFromLine) + 1;
          return new Range(deleteFromLine, deleteFromColumn, selection.startLineNumber, 1);
        } else {
          return new Range(selection.startLineNumber, 1, selection.startLineNumber, selection.startColumn);
        }
      } else {
        return new Range(selection.startLineNumber, 1, selection.endLineNumber, selection.endColumn);
      }
    });
    return rangesToDelete;
  }
}
class DeleteAllRightAction extends AbstractDeleteAllToBoundaryAction {
  constructor() {
    super({
      id: "deleteAllRight",
      label: nls.localize2("lines.deleteAllRight", "Delete All Right"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyK, secondary: [KeyMod.CtrlCmd | KeyCode.Delete] },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  _getEndCursorState(primaryCursor, rangesToDelete) {
    let endPrimaryCursor = null;
    const endCursorState = [];
    for (let i = 0, len = rangesToDelete.length, offset = 0; i < len; i++) {
      const range = rangesToDelete[i];
      const endCursor = new Selection(range.startLineNumber - offset, range.startColumn, range.startLineNumber - offset, range.startColumn);
      if (range.intersectRanges(primaryCursor)) {
        endPrimaryCursor = endCursor;
      } else {
        endCursorState.push(endCursor);
      }
    }
    if (endPrimaryCursor) {
      endCursorState.unshift(endPrimaryCursor);
    }
    return endCursorState;
  }
  _getRangesToDelete(editor) {
    const model = editor.getModel();
    if (model === null) {
      return [];
    }
    const selections = editor.getSelections();
    if (selections === null) {
      return [];
    }
    const rangesToDelete = selections.map((sel) => {
      if (sel.isEmpty()) {
        const maxColumn = model.getLineMaxColumn(sel.startLineNumber);
        if (sel.startColumn === maxColumn) {
          return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber + 1, 1);
        } else {
          return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber, maxColumn);
        }
      }
      return sel;
    });
    rangesToDelete.sort(Range.compareRangesUsingStarts);
    return rangesToDelete;
  }
}
class JoinLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.joinLines",
      label: nls.localize2("lines.joinLines", "Join Lines"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyJ },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    let primaryCursor = editor.getSelection();
    if (primaryCursor === null) {
      return;
    }
    selections.sort(Range.compareRangesUsingStarts);
    const reducedSelections = [];
    const lastSelection = selections.reduce((previousValue, currentValue) => {
      if (previousValue.isEmpty()) {
        if (previousValue.endLineNumber === currentValue.startLineNumber) {
          if (primaryCursor.equalsSelection(previousValue)) {
            primaryCursor = currentValue;
          }
          return currentValue;
        }
        if (currentValue.startLineNumber > previousValue.endLineNumber + 1) {
          reducedSelections.push(previousValue);
          return currentValue;
        } else {
          return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
        }
      } else {
        if (currentValue.startLineNumber > previousValue.endLineNumber) {
          reducedSelections.push(previousValue);
          return currentValue;
        } else {
          return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
        }
      }
    });
    reducedSelections.push(lastSelection);
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const edits = [];
    const endCursorState = [];
    let endPrimaryCursor = primaryCursor;
    let lineOffset = 0;
    for (let i = 0, len = reducedSelections.length; i < len; i++) {
      const selection = reducedSelections[i];
      const startLineNumber = selection.startLineNumber;
      const startColumn = 1;
      let columnDeltaOffset = 0;
      let endLineNumber, endColumn;
      const selectionEndPositionOffset = model.getLineLength(selection.endLineNumber) - selection.endColumn;
      if (selection.isEmpty() || selection.startLineNumber === selection.endLineNumber) {
        const position = selection.getStartPosition();
        if (position.lineNumber < model.getLineCount()) {
          endLineNumber = startLineNumber + 1;
          endColumn = model.getLineMaxColumn(endLineNumber);
        } else {
          endLineNumber = position.lineNumber;
          endColumn = model.getLineMaxColumn(position.lineNumber);
        }
      } else {
        endLineNumber = selection.endLineNumber;
        endColumn = model.getLineMaxColumn(endLineNumber);
      }
      let trimmedLinesContent = model.getLineContent(startLineNumber);
      for (let i2 = startLineNumber + 1; i2 <= endLineNumber; i2++) {
        const lineText = model.getLineContent(i2);
        const firstNonWhitespaceIdx = model.getLineFirstNonWhitespaceColumn(i2);
        if (firstNonWhitespaceIdx >= 1) {
          let insertSpace = true;
          if (trimmedLinesContent === "") {
            insertSpace = false;
          }
          if (insertSpace && (trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === " " || trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === "	")) {
            insertSpace = false;
            trimmedLinesContent = trimmedLinesContent.replace(/[\s\uFEFF\xA0]+$/g, " ");
          }
          const lineTextWithoutIndent = lineText.substr(firstNonWhitespaceIdx - 1);
          trimmedLinesContent += (insertSpace ? " " : "") + lineTextWithoutIndent;
          if (insertSpace) {
            columnDeltaOffset = lineTextWithoutIndent.length + 1;
          } else {
            columnDeltaOffset = lineTextWithoutIndent.length;
          }
        } else {
          columnDeltaOffset = 0;
        }
      }
      const deleteSelection = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      if (!deleteSelection.isEmpty()) {
        let resultSelection;
        if (selection.isEmpty()) {
          edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
          resultSelection = new Selection(deleteSelection.startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1, startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1);
        } else {
          if (selection.startLineNumber === selection.endLineNumber) {
            edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
            resultSelection = new Selection(
              selection.startLineNumber - lineOffset,
              selection.startColumn,
              selection.endLineNumber - lineOffset,
              selection.endColumn
            );
          } else {
            edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
            resultSelection = new Selection(
              selection.startLineNumber - lineOffset,
              selection.startColumn,
              selection.startLineNumber - lineOffset,
              trimmedLinesContent.length - selectionEndPositionOffset
            );
          }
        }
        if (Range.intersectRanges(deleteSelection, primaryCursor) !== null) {
          endPrimaryCursor = resultSelection;
        } else {
          endCursorState.push(resultSelection);
        }
      }
      lineOffset += deleteSelection.endLineNumber - deleteSelection.startLineNumber;
    }
    endCursorState.unshift(endPrimaryCursor);
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, endCursorState);
    editor.pushUndoStop();
  }
}
class TransposeAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.transpose",
      label: nls.localize2("editor.transpose", "Transpose Characters around the Cursor"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (!selection.isEmpty()) {
        continue;
      }
      const cursor = selection.getStartPosition();
      const maxColumn = model.getLineMaxColumn(cursor.lineNumber);
      if (cursor.column >= maxColumn) {
        if (cursor.lineNumber === model.getLineCount()) {
          continue;
        }
        const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1);
        const chars = model.getValueInRange(deleteSelection).split("").reverse().join("");
        commands.push(new ReplaceCommand(new Selection(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1), chars));
      } else {
        const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber, cursor.column + 1);
        const chars = model.getValueInRange(deleteSelection).split("").reverse().join("");
        commands.push(new ReplaceCommandThatPreservesSelection(
          deleteSelection,
          chars,
          new Selection(cursor.lineNumber, cursor.column + 1, cursor.lineNumber, cursor.column + 1)
        ));
      }
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class AbstractCaseAction extends EditorAction {
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const wordSeparators = editor.getOption(EditorOption.wordSeparators);
    const textEdits = [];
    for (const selection of selections) {
      if (selection.isEmpty()) {
        const cursor = selection.getStartPosition();
        const word = editor.getConfiguredWordAtPosition(cursor);
        if (!word) {
          continue;
        }
        const wordRange = new Range(cursor.lineNumber, word.startColumn, cursor.lineNumber, word.endColumn);
        const text = model.getValueInRange(wordRange);
        textEdits.push(EditOperation.replace(wordRange, this._modifyText(text, wordSeparators)));
      } else {
        const text = model.getValueInRange(selection);
        textEdits.push(EditOperation.replace(selection, this._modifyText(text, wordSeparators)));
      }
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, textEdits);
    editor.pushUndoStop();
  }
}
class UpperCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToUppercase",
      label: nls.localize2("editor.transformToUppercase", "Transform to Uppercase"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    return text.toLocaleUpperCase();
  }
}
class LowerCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToLowercase",
      label: nls.localize2("editor.transformToLowercase", "Transform to Lowercase"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    return text.toLocaleLowerCase();
  }
}
class BackwardsCompatibleRegExp {
  constructor(_pattern, _flags) {
    this._pattern = _pattern;
    this._flags = _flags;
    this._actual = null;
    this._evaluated = false;
  }
  get() {
    if (!this._evaluated) {
      this._evaluated = true;
      try {
        this._actual = new RegExp(this._pattern, this._flags);
      } catch (err) {
      }
    }
    return this._actual;
  }
  isSupported() {
    return this.get() !== null;
  }
}
const _TitleCaseAction = class _TitleCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToTitlecase",
      label: nls.localize2("editor.transformToTitlecase", "Transform to Title Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const titleBoundary = _TitleCaseAction.titleBoundary.get();
    if (!titleBoundary) {
      return text;
    }
    return text.toLocaleLowerCase().replace(titleBoundary, (b) => b.toLocaleUpperCase());
  }
};
_TitleCaseAction.titleBoundary = new BackwardsCompatibleRegExp("(^|[^\\p{L}\\p{N}']|((^|\\P{L})'))\\p{L}", "gmu");
let TitleCaseAction = _TitleCaseAction;
const _SnakeCaseAction = class _SnakeCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToSnakecase",
      label: nls.localize2("editor.transformToSnakecase", "Transform to Snake Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const caseBoundary = _SnakeCaseAction.caseBoundary.get();
    const singleLetters = _SnakeCaseAction.singleLetters.get();
    if (!caseBoundary || !singleLetters) {
      return text;
    }
    return text.replace(caseBoundary, "$1_$2").replace(singleLetters, "$1_$2$3").toLocaleLowerCase();
  }
};
_SnakeCaseAction.caseBoundary = new BackwardsCompatibleRegExp("(\\p{Ll})(\\p{Lu})", "gmu");
_SnakeCaseAction.singleLetters = new BackwardsCompatibleRegExp("(\\p{Lu}|\\p{N})(\\p{Lu})(\\p{Ll})", "gmu");
let SnakeCaseAction = _SnakeCaseAction;
const _CamelCaseAction = class _CamelCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToCamelcase",
      label: nls.localize2("editor.transformToCamelcase", "Transform to Camel Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const wordBoundary = /\r\n|\r|\n/.test(text) ? _CamelCaseAction.multiLineWordBoundary.get() : _CamelCaseAction.singleLineWordBoundary.get();
    const validWordStart = _CamelCaseAction.validWordStart.get();
    if (!wordBoundary || !validWordStart) {
      return text;
    }
    const words = text.split(wordBoundary);
    const firstWord = words.shift()?.replace(validWordStart, (start) => start.toLocaleLowerCase());
    return firstWord + words.map((word) => word.substring(0, 1).toLocaleUpperCase() + word.substring(1)).join("");
  }
};
_CamelCaseAction.singleLineWordBoundary = new BackwardsCompatibleRegExp("[_\\s-]+", "gm");
_CamelCaseAction.multiLineWordBoundary = new BackwardsCompatibleRegExp("[_-]+", "gm");
_CamelCaseAction.validWordStart = new BackwardsCompatibleRegExp("^(\\p{Lu}[^\\p{Lu}])", "gmu");
let CamelCaseAction = _CamelCaseAction;
const _PascalCaseAction = class _PascalCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToPascalcase",
      label: nls.localize2("editor.transformToPascalcase", "Transform to Pascal Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const wordBoundary = _PascalCaseAction.wordBoundary.get();
    const wordBoundaryToMaintain = _PascalCaseAction.wordBoundaryToMaintain.get();
    const upperCaseWordMatcher = _PascalCaseAction.upperCaseWordMatcher.get();
    if (!wordBoundary || !wordBoundaryToMaintain || !upperCaseWordMatcher) {
      return text;
    }
    const wordsWithMaintainBoundaries = text.split(wordBoundaryToMaintain);
    const words = wordsWithMaintainBoundaries.map((word) => word.split(wordBoundary)).flat();
    return words.map((word) => {
      const normalizedWord = word.charAt(0).toLocaleUpperCase() + word.slice(1);
      const isAllCaps = normalizedWord.length > 1 && upperCaseWordMatcher.test(normalizedWord);
      if (isAllCaps) {
        return normalizedWord.charAt(0) + normalizedWord.slice(1).toLocaleLowerCase();
      }
      return normalizedWord;
    }).join("");
  }
};
_PascalCaseAction.wordBoundary = new BackwardsCompatibleRegExp("[_ \\t-]", "gm");
_PascalCaseAction.wordBoundaryToMaintain = new BackwardsCompatibleRegExp("(?<=\\.)", "gm");
_PascalCaseAction.upperCaseWordMatcher = new BackwardsCompatibleRegExp("^\\p{Lu}+$", "mu");
let PascalCaseAction = _PascalCaseAction;
const _KebabCaseAction = class _KebabCaseAction extends AbstractCaseAction {
  static isSupported() {
    const areAllRegexpsSupported = [
      this.caseBoundary,
      this.singleLetters,
      this.underscoreBoundary
    ].every((regexp) => regexp.isSupported());
    return areAllRegexpsSupported;
  }
  constructor() {
    super({
      id: "editor.action.transformToKebabcase",
      label: nls.localize2("editor.transformToKebabcase", "Transform to Kebab Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, _) {
    const caseBoundary = _KebabCaseAction.caseBoundary.get();
    const singleLetters = _KebabCaseAction.singleLetters.get();
    const underscoreBoundary = _KebabCaseAction.underscoreBoundary.get();
    if (!caseBoundary || !singleLetters || !underscoreBoundary) {
      return text;
    }
    return text.replace(underscoreBoundary, "$1-$3").replace(caseBoundary, "$1-$2").replace(singleLetters, "$1-$2").toLocaleLowerCase();
  }
};
_KebabCaseAction.caseBoundary = new BackwardsCompatibleRegExp("(\\p{Ll})(\\p{Lu})", "gmu");
_KebabCaseAction.singleLetters = new BackwardsCompatibleRegExp("(\\p{Lu}|\\p{N})(\\p{Lu}\\p{Ll})", "gmu");
_KebabCaseAction.underscoreBoundary = new BackwardsCompatibleRegExp("(\\S)(_)(\\S)", "gm");
let KebabCaseAction = _KebabCaseAction;
registerEditorAction(CopyLinesUpAction);
registerEditorAction(CopyLinesDownAction);
registerEditorAction(DuplicateSelectionAction);
registerEditorAction(MoveLinesUpAction);
registerEditorAction(MoveLinesDownAction);
registerEditorAction(SortLinesAscendingAction);
registerEditorAction(SortLinesDescendingAction);
registerEditorAction(DeleteDuplicateLinesAction);
registerEditorAction(TrimTrailingWhitespaceAction);
registerEditorAction(DeleteLinesAction);
registerEditorAction(IndentLinesAction);
registerEditorAction(OutdentLinesAction);
registerEditorAction(InsertLineBeforeAction);
registerEditorAction(InsertLineAfterAction);
registerEditorAction(DeleteAllLeftAction);
registerEditorAction(DeleteAllRightAction);
registerEditorAction(JoinLinesAction);
registerEditorAction(TransposeAction);
registerEditorAction(UpperCaseAction);
registerEditorAction(LowerCaseAction);
registerEditorAction(ReverseLinesAction);
if (SnakeCaseAction.caseBoundary.isSupported() && SnakeCaseAction.singleLetters.isSupported()) {
  registerEditorAction(SnakeCaseAction);
}
if (CamelCaseAction.singleLineWordBoundary.isSupported() && CamelCaseAction.multiLineWordBoundary.isSupported()) {
  registerEditorAction(CamelCaseAction);
}
if (PascalCaseAction.wordBoundary.isSupported()) {
  registerEditorAction(PascalCaseAction);
}
if (TitleCaseAction.titleBoundary.isSupported()) {
  registerEditorAction(TitleCaseAction);
}
if (KebabCaseAction.isSupported()) {
  registerEditorAction(KebabCaseAction);
}
export {
  AbstractCaseAction,
  AbstractDeleteAllToBoundaryAction,
  AbstractSortLinesAction,
  CamelCaseAction,
  DeleteAllLeftAction,
  DeleteAllRightAction,
  DeleteDuplicateLinesAction,
  DeleteLinesAction,
  DuplicateSelectionAction,
  IndentLinesAction,
  InsertLineAfterAction,
  InsertLineBeforeAction,
  JoinLinesAction,
  KebabCaseAction,
  LowerCaseAction,
  PascalCaseAction,
  ReverseLinesAction,
  SnakeCaseAction,
  SortLinesAscendingAction,
  SortLinesDescendingAction,
  TitleCaseAction,
  TransposeAction,
  TrimTrailingWhitespaceAction,
  UpperCaseAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcYnJvd3NlclxcbGluZXNPcGVyYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvcmVFZGl0aW5nQ29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvcmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBJQWN0aW9uT3B0aW9ucywgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUNvbW1hbmQsIFJlcGxhY2VDb21tYW5kVGhhdFByZXNlcnZlc1NlbGVjdGlvbiwgUmVwbGFjZUNvbW1hbmRUaGF0U2VsZWN0c1RleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvcmVwbGFjZUNvbW1hbmQuanMnO1xuaW1wb3J0IHsgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvdHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVudGVyT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JUeXBlRWRpdE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgVHlwZU9wZXJhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yL2N1cnNvclR5cGVPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb3B5TGluZXNDb21tYW5kIH0gZnJvbSAnLi9jb3B5TGluZXNDb21tYW5kLmpzJztcbmltcG9ydCB7IE1vdmVMaW5lc0NvbW1hbmQgfSBmcm9tICcuL21vdmVMaW5lc0NvbW1hbmQuanMnO1xuaW1wb3J0IHsgU29ydExpbmVzQ29tbWFuZCB9IGZyb20gJy4vc29ydExpbmVzQ29tbWFuZC5qcyc7XG5cbi8vIGNvcHkgbGluZXNcblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb3B5TGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZG93bjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihkb3duOiBib29sZWFuLCBvcHRzOiBJQWN0aW9uT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHRcdHRoaXMuZG93biA9IGRvd247XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAoKHNlbGVjdGlvbiwgaW5kZXgpID0+ICh7IHNlbGVjdGlvbiwgaW5kZXgsIGlnbm9yZTogZmFsc2UgfSkpO1xuXHRcdHNlbGVjdGlvbnMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEuc2VsZWN0aW9uLCBiLnNlbGVjdGlvbikpO1xuXG5cdFx0Ly8gUmVtb3ZlIHNlbGVjdGlvbnMgdGhhdCB3b3VsZCByZXN1bHQgaW4gY29weWluZyB0aGUgc2FtZSBsaW5lXG5cdFx0bGV0IHByZXYgPSBzZWxlY3Rpb25zWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgc2VsZWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VyciA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRpZiAocHJldi5zZWxlY3Rpb24uZW5kTGluZU51bWJlciA9PT0gY3Vyci5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIHRoZXNlIHR3byBzZWxlY3Rpb25zIHdvdWxkIGNvcHkgdGhlIHNhbWUgbGluZVxuXHRcdFx0XHRpZiAocHJldi5pbmRleCA8IGN1cnIuaW5kZXgpIHtcblx0XHRcdFx0XHQvLyBwcmV2IHdpbnNcblx0XHRcdFx0XHRjdXJyLmlnbm9yZSA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gY3VyciB3aW5zXG5cdFx0XHRcdFx0cHJldi5pZ25vcmUgPSB0cnVlO1xuXHRcdFx0XHRcdHByZXYgPSBjdXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBDb3B5TGluZXNDb21tYW5kKHNlbGVjdGlvbi5zZWxlY3Rpb24sIHRoaXMuZG93biwgc2VsZWN0aW9uLmlnbm9yZSkpO1xuXHRcdH1cblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuY2xhc3MgQ29weUxpbmVzVXBBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENvcHlMaW5lc0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKGZhbHNlLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uY29weUxpbmVzVXBBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmNvcHlVcCcsIFwiQ29weSBMaW5lIFVwXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saW5lJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQ29weUxpbmVzVXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb3B5IExpbmUgVXBcIiksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENvcHlMaW5lc0Rvd25BY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENvcHlMaW5lc0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5jb3B5TGluZXNEb3duQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5jb3B5RG93bicsIFwiQ29weSBMaW5lIERvd25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRG93bkFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saW5lJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQ29weUxpbmVzRG93bicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDbyYmcHkgTGluZSBEb3duXCIpLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRHVwbGljYXRlU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZHVwbGljYXRlU2VsZWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdkdXBsaWNhdGVTZWxlY3Rpb24nLCBcIkR1cGxpY2F0ZSBTZWxlY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saW5lJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pRHVwbGljYXRlU2VsZWN0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRHVwbGljYXRlIFNlbGVjdGlvblwiKSxcblx0XHRcdFx0b3JkZXI6IDVcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2gobmV3IENvcHlMaW5lc0NvbW1hbmQoc2VsZWN0aW9uLCB0cnVlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpbnNlcnRTZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kQ29sdW1uLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbik7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2gobmV3IFJlcGxhY2VDb21tYW5kVGhhdFNlbGVjdHNUZXh0KGluc2VydFNlbGVjdGlvbiwgbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbikpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbi8vIG1vdmUgbGluZXNcblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNb3ZlTGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZG93bjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihkb3duOiBib29sZWFuLCBvcHRzOiBJQWN0aW9uT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHRcdHRoaXMuZG93biA9IGRvd247XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIHx8IFtdO1xuXHRcdGNvbnN0IGF1dG9JbmRlbnQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvSW5kZW50KTtcblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbW1hbmRzLnB1c2gobmV3IE1vdmVMaW5lc0NvbW1hbmQoc2VsZWN0aW9uLCB0aGlzLmRvd24sIGF1dG9JbmRlbnQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmNsYXNzIE1vdmVMaW5lc1VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RNb3ZlTGluZXNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm1vdmVMaW5lc1VwQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5tb3ZlVXAnLCBcIk1vdmUgTGluZSBVcFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3cgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX2xpbmUnLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlNb3ZlTGluZXNVcCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJNbyYmdmUgTGluZSBVcFwiKSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgTW92ZUxpbmVzRG93bkFjdGlvbiBleHRlbmRzIEFic3RyYWN0TW92ZUxpbmVzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIodHJ1ZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm1vdmVMaW5lc0Rvd25BY3Rpb24nLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLm1vdmVEb3duJywgXCJNb3ZlIExpbmUgRG93blwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saW5lJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pTW92ZUxpbmVzRG93bicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJNb3ZlICYmTGluZSBEb3duXCIpLFxuXHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTb3J0TGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlc2NlbmRpbmc6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZGVzY2VuZGluZzogYm9vbGVhbiwgb3B0czogSUFjdGlvbk9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0XHR0aGlzLmRlc2NlbmRpbmcgPSBkZXNjZW5kaW5nO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRsZXQgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoID09PSAxICYmIHNlbGVjdGlvbnNbMF0uaXNTaW5nbGVMaW5lKCkpIHtcblx0XHRcdC8vIEFwcGx5IHRvIHdob2xlIGRvY3VtZW50LlxuXHRcdFx0c2VsZWN0aW9ucyA9IFtuZXcgU2VsZWN0aW9uKDEsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsLmdldExpbmVDb3VudCgpKSldO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmICghU29ydExpbmVzQ29tbWFuZC5jYW5SdW4oZWRpdG9yLmdldE1vZGVsKCksIHNlbGVjdGlvbiwgdGhpcy5kZXNjZW5kaW5nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgU29ydExpbmVzQ29tbWFuZChzZWxlY3Rpb25zW2ldLCB0aGlzLmRlc2NlbmRpbmcpO1xuXHRcdH1cblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbiBleHRlbmRzIEFic3RyYWN0U29ydExpbmVzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5zb3J0TGluZXNBc2NlbmRpbmcnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLnNvcnRBc2NlbmRpbmcnLCBcIlNvcnQgTGluZXMgQXNjZW5kaW5nXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU29ydExpbmVzRGVzY2VuZGluZ0FjdGlvbiBleHRlbmRzIEFic3RyYWN0U29ydExpbmVzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIodHJ1ZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnNvcnRMaW5lc0Rlc2NlbmRpbmcnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLnNvcnREZXNjZW5kaW5nJywgXCJTb3J0IExpbmVzIERlc2NlbmRpbmdcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZW1vdmVEdXBsaWNhdGVMaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuZGVsZXRlRHVwbGljYXRlcycsIFwiRGVsZXRlIER1cGxpY2F0ZSBMaW5lc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbDogSVRleHRNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbC5nZXRMaW5lQ291bnQoKSA9PT0gMSAmJiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKDEpID09PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBlbmRDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblxuXHRcdGxldCBsaW5lc0RlbGV0ZWQgPSAwO1xuXHRcdGxldCB1cGRhdGVTZWxlY3Rpb24gPSB0cnVlO1xuXG5cdFx0bGV0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3Rpb25zWzBdLmlzU2luZ2xlTGluZSgpKSB7XG5cdFx0XHQvLyBBcHBseSB0byB3aG9sZSBkb2N1bWVudC5cblx0XHRcdHNlbGVjdGlvbnMgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbC5nZXRMaW5lQ291bnQoKSkpXTtcblx0XHRcdHVwZGF0ZVNlbGVjdGlvbiA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IHVuaXF1ZUxpbmVzID0gbmV3IFNldCgpO1xuXHRcdFx0Y29uc3QgbGluZXMgPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7IGkgPD0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSk7XG5cblx0XHRcdFx0aWYgKHVuaXF1ZUxpbmVzLmhhcyhsaW5lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGluZXMucHVzaChsaW5lKTtcblx0XHRcdFx0dW5pcXVlTGluZXMuYWRkKGxpbmUpO1xuXHRcdFx0fVxuXG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvblRvUmVwbGFjZSA9IG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdDEsXG5cdFx0XHRcdHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgYWRqdXN0ZWRTZWxlY3Rpb25TdGFydCA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgLSBsaW5lc0RlbGV0ZWQ7XG5cdFx0XHRjb25zdCBmaW5hbFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdGFkanVzdGVkU2VsZWN0aW9uU3RhcnQsXG5cdFx0XHRcdDEsXG5cdFx0XHRcdGFkanVzdGVkU2VsZWN0aW9uU3RhcnQgKyBsaW5lcy5sZW5ndGggLSAxLFxuXHRcdFx0XHRsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggKyAxXG5cdFx0XHQpO1xuXG5cdFx0XHRlZGl0cy5wdXNoKEVkaXRPcGVyYXRpb24ucmVwbGFjZShzZWxlY3Rpb25Ub1JlcGxhY2UsIGxpbmVzLmpvaW4oJ1xcbicpKSk7XG5cdFx0XHRlbmRDdXJzb3JTdGF0ZS5wdXNoKGZpbmFsU2VsZWN0aW9uKTtcblxuXHRcdFx0bGluZXNEZWxldGVkICs9IChzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgKyAxKSAtIGxpbmVzLmxlbmd0aDtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBlZGl0cywgdXBkYXRlU2VsZWN0aW9uID8gZW5kQ3Vyc29yU3RhdGUgOiB1bmRlZmluZWQpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmV2ZXJzZUxpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnJldmVyc2VMaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMucmV2ZXJzZUxpbmVzJywgXCJSZXZlcnNlIGxpbmVzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWw6IElUZXh0TW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBvcmlnaW5hbFNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGxldCBzZWxlY3Rpb25zID0gb3JpZ2luYWxTZWxlY3Rpb25zO1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3Rpb25zWzBdLmlzU2luZ2xlTGluZSgpKSB7XG5cdFx0XHQvLyBBcHBseSB0byB3aG9sZSBkb2N1bWVudC5cblx0XHRcdHNlbGVjdGlvbnMgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbC5nZXRMaW5lQ291bnQoKSkpXTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdGluZ1NlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlbGVjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNlbGVjdGlvbiA9IG9yaWdpbmFsU2VsZWN0aW9uc1tpXTtcblx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRpZiAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA8IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyICYmIHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlci0tO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcikpO1xuXG5cdFx0XHQvLyBFeGNsdWRlIGxhc3QgbGluZSBpZiBlbXB0eSBhbmQgd2UncmUgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcblx0XHRcdGlmIChlbmRMaW5lTnVtYmVyID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSAmJiBtb2RlbC5nZXRMaW5lQ29udGVudChyYW5nZS5lbmRMaW5lTnVtYmVyKSA9PT0gJycpIHtcblx0XHRcdFx0cmFuZ2UgPSByYW5nZS5zZXRFbmRQb3NpdGlvbihyYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihyYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5lbmRMaW5lTnVtYmVyOyBpID49IHJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaS0tKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobW9kZWwuZ2V0TGluZUNvbnRlbnQoaSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWRpdDogSVNpbmdsZUVkaXRPcGVyYXRpb24gPSBFZGl0T3BlcmF0aW9uLnJlcGxhY2UocmFuZ2UsIGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdGVkaXRzLnB1c2goZWRpdCk7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZUxpbmVOdW1iZXIgPSBmdW5jdGlvbiAobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlciA/IHJhbmdlLmVuZExpbmVOdW1iZXIgLSBsaW5lTnVtYmVyICsgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDogbGluZU51bWJlcjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1cGRhdGVTZWxlY3Rpb24gPSBmdW5jdGlvbiAoc2VsOiBTZWxlY3Rpb24pOiBTZWxlY3Rpb24ge1xuXHRcdFx0XHRpZiAoc2VsLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdC8vIGtlZXAganVzdCB0aGUgY3Vyc29yXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24odXBkYXRlTGluZU51bWJlcihzZWwucG9zaXRpb25MaW5lTnVtYmVyKSwgc2VsLnBvc2l0aW9uQ29sdW1uLCB1cGRhdGVMaW5lTnVtYmVyKHNlbC5wb3NpdGlvbkxpbmVOdW1iZXIpLCBzZWwucG9zaXRpb25Db2x1bW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGtlZXAgc2VsZWN0aW9uIC0gbWFpbnRhaW4gZGlyZWN0aW9uIGJ5IGNyZWF0aW5nIGJhY2t3YXJkIHNlbGVjdGlvblxuXHRcdFx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvblN0YXJ0ID0gdXBkYXRlTGluZU51bWJlcihzZWwuc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IHVwZGF0ZUxpbmVOdW1iZXIoc2VsLnBvc2l0aW9uTGluZU51bWJlcik7XG5cdFx0XHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uU3RhcnRDb2x1bW4gPSBzZWwuc2VsZWN0aW9uU3RhcnRDb2x1bW47XG5cdFx0XHRcdFx0Y29uc3QgbmV3UG9zaXRpb25Db2x1bW4gPSBzZWwucG9zaXRpb25Db2x1bW47XG5cblx0XHRcdFx0XHQvLyBDcmVhdGUgc2VsZWN0aW9uOiBmcm9tIChuZXdTZWxlY3Rpb25TdGFydCwgbmV3U2VsZWN0aW9uU3RhcnRDb2x1bW4pIHRvIChuZXdQb3NpdGlvbiwgbmV3UG9zaXRpb25Db2x1bW4pXG5cdFx0XHRcdFx0Ly8gQWZ0ZXIgcmV2ZXJzYWw6IGZyb20gKDMsIDIpIHRvICgxLCAzKVxuXHRcdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKG5ld1NlbGVjdGlvblN0YXJ0LCBuZXdTZWxlY3Rpb25TdGFydENvbHVtbiwgbmV3UG9zaXRpb24sIG5ld1Bvc2l0aW9uQ29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHJlc3VsdGluZ1NlbGVjdGlvbnMucHVzaCh1cGRhdGVTZWxlY3Rpb24ob3JpZ2luYWxTZWxlY3Rpb24pKTtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBlZGl0cywgcmVzdWx0aW5nU2VsZWN0aW9ucyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQXJncyB7XG5cdHJlYXNvbj86ICdhdXRvLXNhdmUnO1xufVxuXG5leHBvcnQgY2xhc3MgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLnRyaW1UcmFpbGluZ1doaXRlc3BhY2UnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLnRyaW1UcmFpbGluZ1doaXRlc3BhY2UnLCBcIlRyaW0gVHJhaWxpbmcgV2hpdGVzcGFjZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFyZ3MpOiB2b2lkIHtcblxuXHRcdGxldCBjdXJzb3JzOiBQb3NpdGlvbltdID0gW107XG5cdFx0aWYgKGFyZ3MucmVhc29uID09PSAnYXV0by1zYXZlJykge1xuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9lZGl0b3Jjb25maWcvZWRpdG9yY29uZmlnLXZzY29kZS9pc3N1ZXMvNDdcblx0XHRcdC8vIEl0IGlzIHZlcnkgY29udmVuaWVudCBmb3IgdGhlIGVkaXRvciBjb25maWcgZXh0ZW5zaW9uIHRvIGludm9rZSB0aGlzIGFjdGlvbi5cblx0XHRcdC8vIFNvLCBpZiB3ZSBnZXQgYSByZWFzb246J2F1dG8tc2F2ZScgcGFzc2VkIGluLCBsZXQncyBwcmVzZXJ2ZSBjdXJzb3IgcG9zaXRpb25zLlxuXHRcdFx0Y3Vyc29ycyA9IChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIHx8IFtdKS5tYXAocyA9PiBuZXcgUG9zaXRpb24ocy5wb3NpdGlvbkxpbmVOdW1iZXIsIHMucG9zaXRpb25Db2x1bW4pKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZyA9IF9hY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHRyaW1JblJlZ2V4QW5kU3RyaW5ncyA9IGNvbmZpZy5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZUluUmVnZXhBbmRTdHJpbmdzJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsPy5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiBtb2RlbD8udXJpIH0pO1xuXG5cdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChzZWxlY3Rpb24sIGN1cnNvcnMsIHRyaW1JblJlZ2V4QW5kU3RyaW5ncyk7XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBbY29tbWFuZF0pO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG4vLyBkZWxldGUgbGluZXNcblxuaW50ZXJmYWNlIElEZWxldGVMaW5lc09wZXJhdGlvbiB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRzZWxlY3Rpb25TdGFydENvbHVtbjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHBvc2l0aW9uQ29sdW1uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVMaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmRlbGV0ZUxpbmVzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5kZWxldGUnLCBcIkRlbGV0ZSBMaW5lXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Syxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcHMgPSB0aGlzLl9nZXRMaW5lc1RvUmVtb3ZlKGVkaXRvcik7XG5cblx0XHRjb25zdCBtb2RlbDogSVRleHRNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbC5nZXRMaW5lQ291bnQoKSA9PT0gMSAmJiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKDEpID09PSAxKSB7XG5cdFx0XHQvLyBNb2RlbCBpcyBlbXB0eVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBsaW5lc0RlbGV0ZWQgPSAwO1xuXHRcdGNvbnN0IGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Y29uc3QgY3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG9wcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgb3AgPSBvcHNbaV07XG5cblx0XHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSBvcC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IG9wLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdGxldCBzdGFydENvbHVtbiA9IDE7XG5cdFx0XHRsZXQgZW5kQ29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKTtcblx0XHRcdGlmIChlbmRMaW5lTnVtYmVyIDwgbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlciArPSAxO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSAxO1xuXHRcdFx0fSBlbHNlIGlmIChzdGFydExpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciAtPSAxO1xuXHRcdFx0XHRzdGFydENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFNlbGVjdGlvbihzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLCAnJykpO1xuXHRcdFx0Y3Vyc29yU3RhdGUucHVzaChuZXcgU2VsZWN0aW9uKHN0YXJ0TGluZU51bWJlciAtIGxpbmVzRGVsZXRlZCwgb3AucG9zaXRpb25Db2x1bW4sIHN0YXJ0TGluZU51bWJlciAtIGxpbmVzRGVsZXRlZCwgb3AucG9zaXRpb25Db2x1bW4pKTtcblx0XHRcdGxpbmVzRGVsZXRlZCArPSAob3AuZW5kTGluZU51bWJlciAtIG9wLnN0YXJ0TGluZU51bWJlciArIDEpO1xuXHRcdH1cblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIGVkaXRzLCBjdXJzb3JTdGF0ZSk7XG5cdFx0ZWRpdG9yLnJldmVhbEFsbEN1cnNvcnModHJ1ZSk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGluZXNUb1JlbW92ZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogSURlbGV0ZUxpbmVzT3BlcmF0aW9uW10ge1xuXHRcdC8vIENvbnN0cnVjdCBkZWxldGUgb3BlcmF0aW9uc1xuXHRcdGNvbnN0IG9wZXJhdGlvbnM6IElEZWxldGVMaW5lc09wZXJhdGlvbltdID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAoKHMpID0+IHtcblxuXHRcdFx0bGV0IGVuZExpbmVOdW1iZXIgPSBzLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgPCBzLmVuZExpbmVOdW1iZXIgJiYgcy5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlciAtPSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHMuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRzZWxlY3Rpb25TdGFydENvbHVtbjogcy5zZWxlY3Rpb25TdGFydENvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb25Db2x1bW46IHMucG9zaXRpb25Db2x1bW5cblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHQvLyBTb3J0IGRlbGV0ZSBvcGVyYXRpb25zXG5cdFx0b3BlcmF0aW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5zdGFydExpbmVOdW1iZXIgPT09IGIuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBhLmVuZExpbmVOdW1iZXIgLSBiLmVuZExpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5zdGFydExpbmVOdW1iZXIgLSBiLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9KTtcblxuXHRcdC8vIE1lcmdlIGRlbGV0ZSBvcGVyYXRpb25zIHdoaWNoIGFyZSBhZGphY2VudCBvciBvdmVybGFwcGluZ1xuXHRcdGNvbnN0IG1lcmdlZE9wZXJhdGlvbnM6IElEZWxldGVMaW5lc09wZXJhdGlvbltdID0gW107XG5cdFx0bGV0IHByZXZpb3VzT3BlcmF0aW9uID0gb3BlcmF0aW9uc1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IG9wZXJhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChwcmV2aW91c09wZXJhdGlvbi5lbmRMaW5lTnVtYmVyICsgMSA+PSBvcGVyYXRpb25zW2ldLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBNZXJnZSBjdXJyZW50IG9wZXJhdGlvbnMgaW50byB0aGUgcHJldmlvdXMgb25lXG5cdFx0XHRcdHByZXZpb3VzT3BlcmF0aW9uLmVuZExpbmVOdW1iZXIgPSBvcGVyYXRpb25zW2ldLmVuZExpbmVOdW1iZXI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBQdXNoIHByZXZpb3VzIG9wZXJhdGlvblxuXHRcdFx0XHRtZXJnZWRPcGVyYXRpb25zLnB1c2gocHJldmlvdXNPcGVyYXRpb24pO1xuXHRcdFx0XHRwcmV2aW91c09wZXJhdGlvbiA9IG9wZXJhdGlvbnNbaV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFB1c2ggdGhlIGxhc3Qgb3BlcmF0aW9uXG5cdFx0bWVyZ2VkT3BlcmF0aW9ucy5wdXNoKHByZXZpb3VzT3BlcmF0aW9uKTtcblxuXHRcdHJldHVybiBtZXJnZWRPcGVyYXRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRlbnRMaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbmRlbnRMaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuaW5kZW50JywgXCJJbmRlbnQgTGluZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIFR5cGVPcGVyYXRpb25zLmluZGVudCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCBlZGl0b3IuZ2V0TW9kZWwoKSwgZWRpdG9yLmdldFNlbGVjdGlvbnMoKSkpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG5jbGFzcyBPdXRkZW50TGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ub3V0ZGVudExpbmVzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5vdXRkZW50JywgXCJPdXRkZW50IExpbmVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldExlZnQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRDb3JlRWRpdGluZ0NvbW1hbmRzLk91dGRlbnQucnVuRWRpdG9yQ29tbWFuZChfYWNjZXNzb3IsIGVkaXRvciwgbnVsbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc2VydExpbmVCZWZvcmVBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uaW5zZXJ0TGluZUJlZm9yZSc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJbnNlcnRMaW5lQmVmb3JlQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmluc2VydEJlZm9yZScsIFwiSW5zZXJ0IExpbmUgQWJvdmVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIEVudGVyT3BlcmF0aW9uLmxpbmVJbnNlcnRCZWZvcmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgZWRpdG9yLmdldE1vZGVsKCksIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zZXJ0TGluZUFmdGVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmluc2VydExpbmVBZnRlcic7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJbnNlcnRMaW5lQWZ0ZXJBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuaW5zZXJ0QWZ0ZXInLCBcIkluc2VydCBMaW5lIEJlbG93XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBFbnRlck9wZXJhdGlvbi5saW5lSW5zZXJ0QWZ0ZXIodmlld01vZGVsLmN1cnNvckNvbmZpZywgZWRpdG9yLmdldE1vZGVsKCksIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3REZWxldGVBbGxUb0JvdW5kYXJ5QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlDdXJzb3IgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRjb25zdCByYW5nZXNUb0RlbGV0ZSA9IHRoaXMuX2dldFJhbmdlc1RvRGVsZXRlKGVkaXRvcik7XG5cdFx0Ly8gbWVyZ2Ugb3ZlcmxhcHBpbmcgc2VsZWN0aW9uc1xuXHRcdGNvbnN0IGVmZmVjdGl2ZVJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGNvdW50ID0gcmFuZ2VzVG9EZWxldGUubGVuZ3RoIC0gMTsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzVG9EZWxldGVbaV07XG5cdFx0XHRjb25zdCBuZXh0UmFuZ2UgPSByYW5nZXNUb0RlbGV0ZVtpICsgMV07XG5cblx0XHRcdGlmIChSYW5nZS5pbnRlcnNlY3RSYW5nZXMocmFuZ2UsIG5leHRSYW5nZSkgPT09IG51bGwpIHtcblx0XHRcdFx0ZWZmZWN0aXZlUmFuZ2VzLnB1c2gocmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmFuZ2VzVG9EZWxldGVbaSArIDFdID0gUmFuZ2UucGx1c1JhbmdlKHJhbmdlLCBuZXh0UmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVmZmVjdGl2ZVJhbmdlcy5wdXNoKHJhbmdlc1RvRGVsZXRlW3Jhbmdlc1RvRGVsZXRlLmxlbmd0aCAtIDFdKTtcblxuXHRcdGNvbnN0IGVuZEN1cnNvclN0YXRlID0gdGhpcy5fZ2V0RW5kQ3Vyc29yU3RhdGUocHJpbWFyeUN1cnNvciwgZWZmZWN0aXZlUmFuZ2VzKTtcblxuXHRcdGNvbnN0IGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gZWZmZWN0aXZlUmFuZ2VzLm1hcChyYW5nZSA9PiB7XG5cdFx0XHRyZXR1cm4gRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHJhbmdlLCAnJyk7XG5cdFx0fSk7XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBlZGl0cywgZW5kQ3Vyc29yU3RhdGUpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBjdXJzb3Igc3RhdGUgYWZ0ZXIgdGhlIGVkaXQgb3BlcmF0aW9ucyB3ZXJlIGFwcGxpZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldEVuZEN1cnNvclN0YXRlKHByaW1hcnlDdXJzb3I6IFJhbmdlLCByYW5nZXNUb0RlbGV0ZTogUmFuZ2VbXSk6IFNlbGVjdGlvbltdO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0UmFuZ2VzVG9EZWxldGUoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IFJhbmdlW107XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVBbGxMZWZ0QWN0aW9uIGV4dGVuZHMgQWJzdHJhY3REZWxldGVBbGxUb0JvdW5kYXJ5QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWxldGVBbGxMZWZ0Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5kZWxldGVBbGxMZWZ0JywgXCJEZWxldGUgQWxsIExlZnRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFbmRDdXJzb3JTdGF0ZShwcmltYXJ5Q3Vyc29yOiBSYW5nZSwgcmFuZ2VzVG9EZWxldGU6IFJhbmdlW10pOiBTZWxlY3Rpb25bXSB7XG5cdFx0bGV0IGVuZFByaW1hcnlDdXJzb3I6IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGVuZEN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGxldCBkZWxldGVkTGluZXMgPSAwO1xuXG5cdFx0cmFuZ2VzVG9EZWxldGUuZm9yRWFjaChyYW5nZSA9PiB7XG5cdFx0XHRsZXQgZW5kQ3Vyc29yO1xuXHRcdFx0aWYgKHJhbmdlLmVuZENvbHVtbiA9PT0gMSAmJiBkZWxldGVkTGluZXMgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1N0YXJ0TGluZSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIGRlbGV0ZWRMaW5lcztcblx0XHRcdFx0ZW5kQ3Vyc29yID0gbmV3IFNlbGVjdGlvbihuZXdTdGFydExpbmUsIHJhbmdlLnN0YXJ0Q29sdW1uLCBuZXdTdGFydExpbmUsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVuZEN1cnNvciA9IG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGRlbGV0ZWRMaW5lcyArPSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRpZiAocmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKHByaW1hcnlDdXJzb3IpKSB7XG5cdFx0XHRcdGVuZFByaW1hcnlDdXJzb3IgPSBlbmRDdXJzb3I7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmRDdXJzb3JTdGF0ZS5wdXNoKGVuZEN1cnNvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoZW5kUHJpbWFyeUN1cnNvcikge1xuXHRcdFx0ZW5kQ3Vyc29yU3RhdGUudW5zaGlmdChlbmRQcmltYXJ5Q3Vyc29yKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW5kQ3Vyc29yU3RhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJhbmdlc1RvRGVsZXRlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBSYW5nZVtdIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCByYW5nZXNUb0RlbGV0ZTogUmFuZ2VbXSA9IHNlbGVjdGlvbnM7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJhbmdlc1RvRGVsZXRlLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRyYW5nZXNUb0RlbGV0ZSA9IHJhbmdlc1RvRGVsZXRlLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydENvbHVtbiA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZUZyb21MaW5lID0gTWF0aC5tYXgoMSwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIDEpO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZUZyb21Db2x1bW4gPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSAxID8gMSA6IG1vZGVsLmdldExpbmVMZW5ndGgoZGVsZXRlRnJvbUxpbmUpICsgMTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKGRlbGV0ZUZyb21MaW5lLCBkZWxldGVGcm9tQ29sdW1uLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5zdGFydENvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgMSwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJhbmdlc1RvRGVsZXRlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVBbGxSaWdodEFjdGlvbiBleHRlbmRzIEFic3RyYWN0RGVsZXRlQWxsVG9Cb3VuZGFyeUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVsZXRlQWxsUmlnaHQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmRlbGV0ZUFsbFJpZ2h0JywgXCJEZWxldGUgQWxsIFJpZ2h0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUssIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EZWxldGVdIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFbmRDdXJzb3JTdGF0ZShwcmltYXJ5Q3Vyc29yOiBSYW5nZSwgcmFuZ2VzVG9EZWxldGU6IFJhbmdlW10pOiBTZWxlY3Rpb25bXSB7XG5cdFx0bGV0IGVuZFByaW1hcnlDdXJzb3I6IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGVuZEN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYW5nZXNUb0RlbGV0ZS5sZW5ndGgsIG9mZnNldCA9IDA7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSByYW5nZXNUb0RlbGV0ZVtpXTtcblx0XHRcdGNvbnN0IGVuZEN1cnNvciA9IG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gb2Zmc2V0LCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gb2Zmc2V0LCByYW5nZS5zdGFydENvbHVtbik7XG5cblx0XHRcdGlmIChyYW5nZS5pbnRlcnNlY3RSYW5nZXMocHJpbWFyeUN1cnNvcikpIHtcblx0XHRcdFx0ZW5kUHJpbWFyeUN1cnNvciA9IGVuZEN1cnNvcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVuZEN1cnNvclN0YXRlLnB1c2goZW5kQ3Vyc29yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZW5kUHJpbWFyeUN1cnNvcikge1xuXHRcdFx0ZW5kQ3Vyc29yU3RhdGUudW5zaGlmdChlbmRQcmltYXJ5Q3Vyc29yKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW5kQ3Vyc29yU3RhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJhbmdlc1RvRGVsZXRlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBSYW5nZVtdIHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZXNUb0RlbGV0ZTogUmFuZ2VbXSA9IHNlbGVjdGlvbnMubWFwKChzZWwpID0+IHtcblx0XHRcdGlmIChzZWwuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oc2VsLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRcdFx0aWYgKHNlbC5zdGFydENvbHVtbiA9PT0gbWF4Q29sdW1uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzZWwuc3RhcnRMaW5lTnVtYmVyLCBzZWwuc3RhcnRDb2x1bW4sIHNlbC5zdGFydExpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHNlbC5zdGFydExpbmVOdW1iZXIsIHNlbC5zdGFydENvbHVtbiwgc2VsLnN0YXJ0TGluZU51bWJlciwgbWF4Q29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlbDtcblx0XHR9KTtcblxuXHRcdHJhbmdlc1RvRGVsZXRlLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRyZXR1cm4gcmFuZ2VzVG9EZWxldGU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEpvaW5MaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5qb2luTGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmpvaW5MaW5lcycsIFwiSm9pbiBMaW5lc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5SiB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcHJpbWFyeUN1cnNvciA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAocHJpbWFyeUN1cnNvciA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdGNvbnN0IHJlZHVjZWRTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgbGFzdFNlbGVjdGlvbiA9IHNlbGVjdGlvbnMucmVkdWNlKChwcmV2aW91c1ZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHtcblx0XHRcdGlmIChwcmV2aW91c1ZhbHVlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRpZiAocHJldmlvdXNWYWx1ZS5lbmRMaW5lTnVtYmVyID09PSBjdXJyZW50VmFsdWUuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKHByaW1hcnlDdXJzb3IhLmVxdWFsc1NlbGVjdGlvbihwcmV2aW91c1ZhbHVlKSkge1xuXHRcdFx0XHRcdFx0cHJpbWFyeUN1cnNvciA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUuc3RhcnRMaW5lTnVtYmVyID4gcHJldmlvdXNWYWx1ZS5lbmRMaW5lTnVtYmVyICsgMSkge1xuXHRcdFx0XHRcdHJlZHVjZWRTZWxlY3Rpb25zLnB1c2gocHJldmlvdXNWYWx1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihwcmV2aW91c1ZhbHVlLnN0YXJ0TGluZU51bWJlciwgcHJldmlvdXNWYWx1ZS5zdGFydENvbHVtbiwgY3VycmVudFZhbHVlLmVuZExpbmVOdW1iZXIsIGN1cnJlbnRWYWx1ZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlLnN0YXJ0TGluZU51bWJlciA+IHByZXZpb3VzVmFsdWUuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJlZHVjZWRTZWxlY3Rpb25zLnB1c2gocHJldmlvdXNWYWx1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihwcmV2aW91c1ZhbHVlLnN0YXJ0TGluZU51bWJlciwgcHJldmlvdXNWYWx1ZS5zdGFydENvbHVtbiwgY3VycmVudFZhbHVlLmVuZExpbmVOdW1iZXIsIGN1cnJlbnRWYWx1ZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZWR1Y2VkU2VsZWN0aW9ucy5wdXNoKGxhc3RTZWxlY3Rpb24pO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGVuZEN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGxldCBlbmRQcmltYXJ5Q3Vyc29yID0gcHJpbWFyeUN1cnNvcjtcblx0XHRsZXQgbGluZU9mZnNldCA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmVkdWNlZFNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHJlZHVjZWRTZWxlY3Rpb25zW2ldO1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gMTtcblx0XHRcdGxldCBjb2x1bW5EZWx0YU9mZnNldCA9IDA7XG5cdFx0XHRsZXQgZW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW46IG51bWJlcjtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uRW5kUG9zaXRpb25PZmZzZXQgPSBtb2RlbC5nZXRMaW5lTGVuZ3RoKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSAtIHNlbGVjdGlvbi5lbmRDb2x1bW47XG5cblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpIHx8IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRcdGVuZENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0ZW5kQ29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlciA9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgdHJpbW1lZExpbmVzQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRcdGZvciAobGV0IGkgPSBzdGFydExpbmVOdW1iZXIgKyAxOyBpIDw9IGVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXHRcdFx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2VJZHggPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGkpO1xuXG5cdFx0XHRcdGlmIChmaXJzdE5vbldoaXRlc3BhY2VJZHggPj0gMSkge1xuXHRcdFx0XHRcdGxldCBpbnNlcnRTcGFjZSA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKHRyaW1tZWRMaW5lc0NvbnRlbnQgPT09ICcnKSB7XG5cdFx0XHRcdFx0XHRpbnNlcnRTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpbnNlcnRTcGFjZSAmJiAodHJpbW1lZExpbmVzQ29udGVudC5jaGFyQXQodHJpbW1lZExpbmVzQ29udGVudC5sZW5ndGggLSAxKSA9PT0gJyAnIHx8XG5cdFx0XHRcdFx0XHR0cmltbWVkTGluZXNDb250ZW50LmNoYXJBdCh0cmltbWVkTGluZXNDb250ZW50Lmxlbmd0aCAtIDEpID09PSAnXFx0JykpIHtcblx0XHRcdFx0XHRcdGluc2VydFNwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0cmltbWVkTGluZXNDb250ZW50ID0gdHJpbW1lZExpbmVzQ29udGVudC5yZXBsYWNlKC9bXFxzXFx1RkVGRlxceEEwXSskL2csICcgJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbGluZVRleHRXaXRob3V0SW5kZW50ID0gbGluZVRleHQuc3Vic3RyKGZpcnN0Tm9uV2hpdGVzcGFjZUlkeCAtIDEpO1xuXG5cdFx0XHRcdFx0dHJpbW1lZExpbmVzQ29udGVudCArPSAoaW5zZXJ0U3BhY2UgPyAnICcgOiAnJykgKyBsaW5lVGV4dFdpdGhvdXRJbmRlbnQ7XG5cblx0XHRcdFx0XHRpZiAoaW5zZXJ0U3BhY2UpIHtcblx0XHRcdFx0XHRcdGNvbHVtbkRlbHRhT2Zmc2V0ID0gbGluZVRleHRXaXRob3V0SW5kZW50Lmxlbmd0aCArIDE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbHVtbkRlbHRhT2Zmc2V0ID0gbGluZVRleHRXaXRob3V0SW5kZW50Lmxlbmd0aDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29sdW1uRGVsdGFPZmZzZXQgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlbGV0ZVNlbGVjdGlvbiA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXG5cdFx0XHRpZiAoIWRlbGV0ZVNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0bGV0IHJlc3VsdFNlbGVjdGlvbjogU2VsZWN0aW9uO1xuXG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0ZWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2UoZGVsZXRlU2VsZWN0aW9uLCB0cmltbWVkTGluZXNDb250ZW50KSk7XG5cdFx0XHRcdFx0cmVzdWx0U2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbihkZWxldGVTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gbGluZU9mZnNldCwgdHJpbW1lZExpbmVzQ29udGVudC5sZW5ndGggLSBjb2x1bW5EZWx0YU9mZnNldCArIDEsIHN0YXJ0TGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHRyaW1tZWRMaW5lc0NvbnRlbnQubGVuZ3RoIC0gY29sdW1uRGVsdGFPZmZzZXQgKyAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKGRlbGV0ZVNlbGVjdGlvbiwgdHJpbW1lZExpbmVzQ29udGVudCkpO1xuXHRcdFx0XHRcdFx0cmVzdWx0U2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gbGluZU9mZnNldCwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHNlbGVjdGlvbi5lbmRDb2x1bW4pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlZGl0cy5wdXNoKEVkaXRPcGVyYXRpb24ucmVwbGFjZShkZWxldGVTZWxlY3Rpb24sIHRyaW1tZWRMaW5lc0NvbnRlbnQpKTtcblx0XHRcdFx0XHRcdHJlc3VsdFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHNlbGVjdGlvbi5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHRyaW1tZWRMaW5lc0NvbnRlbnQubGVuZ3RoIC0gc2VsZWN0aW9uRW5kUG9zaXRpb25PZmZzZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChSYW5nZS5pbnRlcnNlY3RSYW5nZXMoZGVsZXRlU2VsZWN0aW9uLCBwcmltYXJ5Q3Vyc29yKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdGVuZFByaW1hcnlDdXJzb3IgPSByZXN1bHRTZWxlY3Rpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW5kQ3Vyc29yU3RhdGUucHVzaChyZXN1bHRTZWxlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxpbmVPZmZzZXQgKz0gZGVsZXRlU2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSBkZWxldGVTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGVuZEN1cnNvclN0YXRlLnVuc2hpZnQoZW5kUHJpbWFyeUN1cnNvcik7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgZWRpdHMsIGVuZEN1cnNvclN0YXRlKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyYW5zcG9zZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc3Bvc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc3Bvc2UnLCBcIlRyYW5zcG9zZSBDaGFyYWN0ZXJzIGFyb3VuZCB0aGUgQ3Vyc29yXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblxuXHRcdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJzb3IgPSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihjdXJzb3IubGluZU51bWJlcik7XG5cblx0XHRcdGlmIChjdXJzb3IuY29sdW1uID49IG1heENvbHVtbikge1xuXHRcdFx0XHRpZiAoY3Vyc29yLmxpbmVOdW1iZXIgPT09IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUaGUgY3Vyc29yIGlzIGF0IHRoZSBlbmQgb2YgY3VycmVudCBsaW5lIGFuZCBjdXJyZW50IGxpbmUgaXMgbm90IGVtcHR5XG5cdFx0XHRcdC8vIHRoZW4gd2UgdHJhbnNwb3NlIHRoZSBjaGFyYWN0ZXIgYmVmb3JlIHRoZSBjdXJzb3IgYW5kIHRoZSBsaW5lIGJyZWFrIGlmIHRoZXJlIGlzIGFueSBmb2xsb3dpbmcgbGluZS5cblx0XHRcdFx0Y29uc3QgZGVsZXRlU2VsZWN0aW9uID0gbmV3IFJhbmdlKGN1cnNvci5saW5lTnVtYmVyLCBNYXRoLm1heCgxLCBjdXJzb3IuY29sdW1uIC0gMSksIGN1cnNvci5saW5lTnVtYmVyICsgMSwgMSk7XG5cdFx0XHRcdGNvbnN0IGNoYXJzID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGRlbGV0ZVNlbGVjdGlvbikuc3BsaXQoJycpLnJldmVyc2UoKS5qb2luKCcnKTtcblxuXHRcdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBSZXBsYWNlQ29tbWFuZChuZXcgU2VsZWN0aW9uKGN1cnNvci5saW5lTnVtYmVyLCBNYXRoLm1heCgxLCBjdXJzb3IuY29sdW1uIC0gMSksIGN1cnNvci5saW5lTnVtYmVyICsgMSwgMSksIGNoYXJzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkZWxldGVTZWxlY3Rpb24gPSBuZXcgUmFuZ2UoY3Vyc29yLmxpbmVOdW1iZXIsIE1hdGgubWF4KDEsIGN1cnNvci5jb2x1bW4gLSAxKSwgY3Vyc29yLmxpbmVOdW1iZXIsIGN1cnNvci5jb2x1bW4gKyAxKTtcblx0XHRcdFx0Y29uc3QgY2hhcnMgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZGVsZXRlU2VsZWN0aW9uKS5zcGxpdCgnJykucmV2ZXJzZSgpLmpvaW4oJycpO1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBSZXBsYWNlQ29tbWFuZFRoYXRQcmVzZXJ2ZXNTZWxlY3Rpb24oZGVsZXRlU2VsZWN0aW9uLCBjaGFycyxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKGN1cnNvci5saW5lTnVtYmVyLCBjdXJzb3IuY29sdW1uICsgMSwgY3Vyc29yLmxpbmVOdW1iZXIsIGN1cnNvci5jb2x1bW4gKyAxKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q2FzZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpO1xuXHRcdGNvbnN0IHRleHRFZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0Y29uc3QgY3Vyc29yID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3Qgd29yZCA9IGVkaXRvci5nZXRDb25maWd1cmVkV29yZEF0UG9zaXRpb24oY3Vyc29yKTtcblxuXHRcdFx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHdvcmRSYW5nZSA9IG5ldyBSYW5nZShjdXJzb3IubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgY3Vyc29yLmxpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZSh3b3JkUmFuZ2UpO1xuXHRcdFx0XHR0ZXh0RWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2Uod29yZFJhbmdlLCB0aGlzLl9tb2RpZnlUZXh0KHRleHQsIHdvcmRTZXBhcmF0b3JzKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pO1xuXHRcdFx0XHR0ZXh0RWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2Uoc2VsZWN0aW9uLCB0aGlzLl9tb2RpZnlUZXh0KHRleHQsIHdvcmRTZXBhcmF0b3JzKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIHRleHRFZGl0cyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFVwcGVyQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc2Zvcm1Ub1VwcGVyY2FzZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZWRpdG9yLnRyYW5zZm9ybVRvVXBwZXJjYXNlJywgXCJUcmFuc2Zvcm0gdG8gVXBwZXJjYXNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfbW9kaWZ5VGV4dCh0ZXh0OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0ZXh0LnRvTG9jYWxlVXBwZXJDYXNlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExvd2VyQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc2Zvcm1Ub0xvd2VyY2FzZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZWRpdG9yLnRyYW5zZm9ybVRvTG93ZXJjYXNlJywgXCJUcmFuc2Zvcm0gdG8gTG93ZXJjYXNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRleHQudG9Mb2NhbGVMb3dlckNhc2UoKTtcblx0fVxufVxuXG5jbGFzcyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwIHtcblxuXHRwcml2YXRlIF9hY3R1YWw6IFJlZ0V4cCB8IG51bGw7XG5cdHByaXZhdGUgX2V2YWx1YXRlZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wYXR0ZXJuOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZmxhZ3M6IHN0cmluZ1xuXHQpIHtcblx0XHR0aGlzLl9hY3R1YWwgPSBudWxsO1xuXHRcdHRoaXMuX2V2YWx1YXRlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdldCgpOiBSZWdFeHAgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2V2YWx1YXRlZCkge1xuXHRcdFx0dGhpcy5fZXZhbHVhdGVkID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2FjdHVhbCA9IG5ldyBSZWdFeHAodGhpcy5fcGF0dGVybiwgdGhpcy5fZmxhZ3MpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdC8vIHRoaXMgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IHRoaXMgcmVndWxhciBleHByZXNzaW9uXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWw7XG5cdH1cblxuXHRwdWJsaWMgaXNTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLmdldCgpICE9PSBudWxsKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGl0bGVDYXNlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDYXNlQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHRpdGxlQm91bmRhcnkgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnKF58W15cXFxccHtMfVxcXFxwe059XFwnXXwoKF58XFxcXFB7TH0pXFwnKSlcXFxccHtMfScsICdnbXUnKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9UaXRsZWNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub1RpdGxlY2FzZScsIFwiVHJhbnNmb3JtIHRvIFRpdGxlIENhc2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB0aXRsZUJvdW5kYXJ5ID0gVGl0bGVDYXNlQWN0aW9uLnRpdGxlQm91bmRhcnkuZ2V0KCk7XG5cdFx0aWYgKCF0aXRsZUJvdW5kYXJ5KSB7XG5cdFx0XHQvLyBjYW5ub3Qgc3VwcG9ydCB0aGlzXG5cdFx0XHRyZXR1cm4gdGV4dDtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHRcblx0XHRcdC50b0xvY2FsZUxvd2VyQ2FzZSgpXG5cdFx0XHQucmVwbGFjZSh0aXRsZUJvdW5kYXJ5LCAoYikgPT4gYi50b0xvY2FsZVVwcGVyQ2FzZSgpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU25ha2VDYXNlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDYXNlQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNhc2VCb3VuZGFyeSA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCcoXFxcXHB7TGx9KShcXFxccHtMdX0pJywgJ2dtdScpO1xuXHRwdWJsaWMgc3RhdGljIHNpbmdsZUxldHRlcnMgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnKFxcXFxwe0x1fXxcXFxccHtOfSkoXFxcXHB7THV9KShcXFxccHtMbH0pJywgJ2dtdScpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc2Zvcm1Ub1NuYWtlY2FzZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZWRpdG9yLnRyYW5zZm9ybVRvU25ha2VjYXNlJywgXCJUcmFuc2Zvcm0gdG8gU25ha2UgQ2FzZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBjYXNlQm91bmRhcnkgPSBTbmFrZUNhc2VBY3Rpb24uY2FzZUJvdW5kYXJ5LmdldCgpO1xuXHRcdGNvbnN0IHNpbmdsZUxldHRlcnMgPSBTbmFrZUNhc2VBY3Rpb24uc2luZ2xlTGV0dGVycy5nZXQoKTtcblx0XHRpZiAoIWNhc2VCb3VuZGFyeSB8fCAhc2luZ2xlTGV0dGVycykge1xuXHRcdFx0Ly8gY2Fubm90IHN1cHBvcnQgdGhpc1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXHRcdHJldHVybiAodGV4dFxuXHRcdFx0LnJlcGxhY2UoY2FzZUJvdW5kYXJ5LCAnJDFfJDInKVxuXHRcdFx0LnJlcGxhY2Uoc2luZ2xlTGV0dGVycywgJyQxXyQyJDMnKVxuXHRcdFx0LnRvTG9jYWxlTG93ZXJDYXNlKClcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDYW1lbENhc2VBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENhc2VBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIHNpbmdsZUxpbmVXb3JkQm91bmRhcnkgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnW19cXFxccy1dKycsICdnbScpO1xuXHRwdWJsaWMgc3RhdGljIG11bHRpTGluZVdvcmRCb3VuZGFyeSA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCdbXy1dKycsICdnbScpO1xuXHRwdWJsaWMgc3RhdGljIHZhbGlkV29yZFN0YXJ0ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJ14oXFxcXHB7THV9W15cXFxccHtMdX1dKScsICdnbXUnKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9DYW1lbGNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub0NhbWVsY2FzZScsIFwiVHJhbnNmb3JtIHRvIENhbWVsIENhc2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB3b3JkQm91bmRhcnkgPSAvXFxyXFxufFxccnxcXG4vLnRlc3QodGV4dCkgPyBDYW1lbENhc2VBY3Rpb24ubXVsdGlMaW5lV29yZEJvdW5kYXJ5LmdldCgpIDogQ2FtZWxDYXNlQWN0aW9uLnNpbmdsZUxpbmVXb3JkQm91bmRhcnkuZ2V0KCk7XG5cdFx0Y29uc3QgdmFsaWRXb3JkU3RhcnQgPSBDYW1lbENhc2VBY3Rpb24udmFsaWRXb3JkU3RhcnQuZ2V0KCk7XG5cdFx0aWYgKCF3b3JkQm91bmRhcnkgfHwgIXZhbGlkV29yZFN0YXJ0KSB7XG5cdFx0XHQvLyBjYW5ub3Qgc3VwcG9ydCB0aGlzXG5cdFx0XHRyZXR1cm4gdGV4dDtcblx0XHR9XG5cdFx0Y29uc3Qgd29yZHMgPSB0ZXh0LnNwbGl0KHdvcmRCb3VuZGFyeSk7XG5cdFx0Y29uc3QgZmlyc3RXb3JkID0gd29yZHMuc2hpZnQoKT8ucmVwbGFjZSh2YWxpZFdvcmRTdGFydCwgKHN0YXJ0OiBzdHJpbmcpID0+IHN0YXJ0LnRvTG9jYWxlTG93ZXJDYXNlKCkpO1xuXHRcdHJldHVybiBmaXJzdFdvcmQgKyB3b3Jkcy5tYXAoKHdvcmQ6IHN0cmluZykgPT4gd29yZC5zdWJzdHJpbmcoMCwgMSkudG9Mb2NhbGVVcHBlckNhc2UoKSArIHdvcmQuc3Vic3RyaW5nKDEpKVxuXHRcdFx0LmpvaW4oJycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXNjYWxDYXNlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDYXNlQWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyB3b3JkQm91bmRhcnkgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnW18gXFxcXHQtXScsICdnbScpO1xuXHRwdWJsaWMgc3RhdGljIHdvcmRCb3VuZGFyeVRvTWFpbnRhaW4gPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnKD88PVxcXFwuKScsICdnbScpO1xuXHRwdWJsaWMgc3RhdGljIHVwcGVyQ2FzZVdvcmRNYXRjaGVyID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJ15cXFxccHtMdX0rJCcsICdtdScpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc2Zvcm1Ub1Bhc2NhbGNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub1Bhc2NhbGNhc2UnLCBcIlRyYW5zZm9ybSB0byBQYXNjYWwgQ2FzZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB3b3JkQm91bmRhcnkgPSBQYXNjYWxDYXNlQWN0aW9uLndvcmRCb3VuZGFyeS5nZXQoKTtcblx0XHRjb25zdCB3b3JkQm91bmRhcnlUb01haW50YWluID0gUGFzY2FsQ2FzZUFjdGlvbi53b3JkQm91bmRhcnlUb01haW50YWluLmdldCgpO1xuXHRcdGNvbnN0IHVwcGVyQ2FzZVdvcmRNYXRjaGVyID0gUGFzY2FsQ2FzZUFjdGlvbi51cHBlckNhc2VXb3JkTWF0Y2hlci5nZXQoKTtcblxuXHRcdGlmICghd29yZEJvdW5kYXJ5IHx8ICF3b3JkQm91bmRhcnlUb01haW50YWluIHx8ICF1cHBlckNhc2VXb3JkTWF0Y2hlcikge1xuXHRcdFx0Ly8gY2Fubm90IHN1cHBvcnQgdGhpc1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yZHNXaXRoTWFpbnRhaW5Cb3VuZGFyaWVzID0gdGV4dC5zcGxpdCh3b3JkQm91bmRhcnlUb01haW50YWluKTtcblx0XHRjb25zdCB3b3JkcyA9IHdvcmRzV2l0aE1haW50YWluQm91bmRhcmllcy5tYXAod29yZCA9PiB3b3JkLnNwbGl0KHdvcmRCb3VuZGFyeSkpLmZsYXQoKTtcblxuXHRcdHJldHVybiB3b3Jkcy5tYXAod29yZCA9PiB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkV29yZCA9IHdvcmQuY2hhckF0KDApLnRvTG9jYWxlVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpO1xuXHRcdFx0Y29uc3QgaXNBbGxDYXBzID0gbm9ybWFsaXplZFdvcmQubGVuZ3RoID4gMSAmJiB1cHBlckNhc2VXb3JkTWF0Y2hlci50ZXN0KG5vcm1hbGl6ZWRXb3JkKTtcblx0XHRcdGlmIChpc0FsbENhcHMpIHtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWRXb3JkLmNoYXJBdCgwKSArIG5vcm1hbGl6ZWRXb3JkLnNsaWNlKDEpLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplZFdvcmQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEtlYmFiQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBpc1N1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBhcmVBbGxSZWdleHBzU3VwcG9ydGVkID0gW1xuXHRcdFx0dGhpcy5jYXNlQm91bmRhcnksXG5cdFx0XHR0aGlzLnNpbmdsZUxldHRlcnMsXG5cdFx0XHR0aGlzLnVuZGVyc2NvcmVCb3VuZGFyeSxcblx0XHRdLmV2ZXJ5KChyZWdleHApID0+IHJlZ2V4cC5pc1N1cHBvcnRlZCgpKTtcblxuXHRcdHJldHVybiBhcmVBbGxSZWdleHBzU3VwcG9ydGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgY2FzZUJvdW5kYXJ5ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyhcXFxccHtMbH0pKFxcXFxwe0x1fSknLCAnZ211Jyk7XG5cdHByaXZhdGUgc3RhdGljIHNpbmdsZUxldHRlcnMgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnKFxcXFxwe0x1fXxcXFxccHtOfSkoXFxcXHB7THV9XFxcXHB7TGx9KScsICdnbXUnKTtcblx0cHJpdmF0ZSBzdGF0aWMgdW5kZXJzY29yZUJvdW5kYXJ5ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyhcXFxcUykoXykoXFxcXFMpJywgJ2dtJyk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnRyYW5zZm9ybVRvS2ViYWJjYXNlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IudHJhbnNmb3JtVG9LZWJhYmNhc2UnLCAnVHJhbnNmb3JtIHRvIEtlYmFiIENhc2UnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCBfOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNhc2VCb3VuZGFyeSA9IEtlYmFiQ2FzZUFjdGlvbi5jYXNlQm91bmRhcnkuZ2V0KCk7XG5cdFx0Y29uc3Qgc2luZ2xlTGV0dGVycyA9IEtlYmFiQ2FzZUFjdGlvbi5zaW5nbGVMZXR0ZXJzLmdldCgpO1xuXHRcdGNvbnN0IHVuZGVyc2NvcmVCb3VuZGFyeSA9IEtlYmFiQ2FzZUFjdGlvbi51bmRlcnNjb3JlQm91bmRhcnkuZ2V0KCk7XG5cblx0XHRpZiAoIWNhc2VCb3VuZGFyeSB8fCAhc2luZ2xlTGV0dGVycyB8fCAhdW5kZXJzY29yZUJvdW5kYXJ5KSB7XG5cdFx0XHQvLyBvbmUgb3IgbW9yZSByZWdleHBzIGFyZW4ndCBzdXBwb3J0ZWRcblx0XHRcdHJldHVybiB0ZXh0O1xuXHRcdH1cblxuXHRcdHJldHVybiB0ZXh0XG5cdFx0XHQucmVwbGFjZSh1bmRlcnNjb3JlQm91bmRhcnksICckMS0kMycpXG5cdFx0XHQucmVwbGFjZShjYXNlQm91bmRhcnksICckMS0kMicpXG5cdFx0XHQucmVwbGFjZShzaW5nbGVMZXR0ZXJzLCAnJDEtJDInKVxuXHRcdFx0LnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ29weUxpbmVzVXBBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ29weUxpbmVzRG93bkFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEdXBsaWNhdGVTZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oTW92ZUxpbmVzVXBBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oTW92ZUxpbmVzRG93bkFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihTb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU29ydExpbmVzRGVzY2VuZGluZ0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKERlbGV0ZUxpbmVzQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluZGVudExpbmVzQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE91dGRlbnRMaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRMaW5lQmVmb3JlQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluc2VydExpbmVBZnRlckFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWxldGVBbGxMZWZ0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKERlbGV0ZUFsbFJpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEpvaW5MaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUcmFuc3Bvc2VBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVXBwZXJDYXNlQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKExvd2VyQ2FzZUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihSZXZlcnNlTGluZXNBY3Rpb24pO1xuXG5pZiAoU25ha2VDYXNlQWN0aW9uLmNhc2VCb3VuZGFyeS5pc1N1cHBvcnRlZCgpICYmIFNuYWtlQ2FzZUFjdGlvbi5zaW5nbGVMZXR0ZXJzLmlzU3VwcG9ydGVkKCkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oU25ha2VDYXNlQWN0aW9uKTtcbn1cbmlmIChDYW1lbENhc2VBY3Rpb24uc2luZ2xlTGluZVdvcmRCb3VuZGFyeS5pc1N1cHBvcnRlZCgpICYmIENhbWVsQ2FzZUFjdGlvbi5tdWx0aUxpbmVXb3JkQm91bmRhcnkuaXNTdXBwb3J0ZWQoKSkge1xuXHRyZWdpc3RlckVkaXRvckFjdGlvbihDYW1lbENhc2VBY3Rpb24pO1xufVxuaWYgKFBhc2NhbENhc2VBY3Rpb24ud29yZEJvdW5kYXJ5LmlzU3VwcG9ydGVkKCkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oUGFzY2FsQ2FzZUFjdGlvbik7XG59XG5pZiAoVGl0bGVDYXNlQWN0aW9uLnRpdGxlQm91bmRhcnkuaXNTdXBwb3J0ZWQoKSkge1xuXHRyZWdpc3RlckVkaXRvckFjdGlvbihUaXRsZUNhc2VBY3Rpb24pO1xufVxuXG5pZiAoS2ViYWJDYXNlQWN0aW9uLmlzU3VwcG9ydGVkKCkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oS2ViYWJDYXNlQWN0aW9uKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGNBQThCLDRCQUE4QztBQUNyRixTQUFTLGdCQUFnQixzQ0FBc0MscUNBQXFDO0FBQ3BHLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUlqQyxNQUFlLGdDQUFnQyxhQUFhO0FBQUEsRUFJM0QsWUFBWSxNQUFlLE1BQXNCO0FBQ2hELFVBQU0sSUFBSTtBQUNWLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFBQSxFQUVPLElBQUksV0FBNkIsUUFBMkI7QUFDbEUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxPQUFPLGNBQWMsRUFBRSxJQUFJLENBQUMsV0FBVyxXQUFXLEVBQUUsV0FBVyxP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
