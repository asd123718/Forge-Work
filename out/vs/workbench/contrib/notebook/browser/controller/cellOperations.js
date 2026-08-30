import { ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { EndOfLinePreference } from "../../../../../editor/common/model.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { ResourceNotebookCellEdit } from "../../../bulkEdit/browser/bulkCellEdits.js";
import { CellEditState, CellFocusMode, expandCellRangesWithHiddenCells } from "../notebookBrowser.js";
import { cloneNotebookCellTextModel } from "../../common/model/notebookCellTextModel.js";
import { CellEditType, CellKind, SelectionStateType } from "../../common/notebookCommon.js";
import { cellRangeContains, cellRangesToIndexes } from "../../common/notebookRange.js";
import { localize } from "../../../../../nls.js";
async function changeCellToKind(kind, context, language, mime) {
  const { notebookEditor } = context;
  if (!notebookEditor.hasModel()) {
    return;
  }
  if (notebookEditor.isReadOnly) {
    return;
  }
  if (context.ui && context.cell) {
    const { cell } = context;
    if (cell.cellKind === kind) {
      return;
    }
    const text = cell.getText();
    const idx = notebookEditor.getCellIndex(cell);
    if (language === void 0) {
      const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
      language = availableLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
    }
    notebookEditor.textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: idx,
        count: 1,
        cells: [{
          cellKind: kind,
          source: text,
          language,
          mime: mime ?? cell.mime,
          outputs: cell.model.outputs,
          metadata: cell.metadata
        }]
      }
    ], true, {
      kind: SelectionStateType.Index,
      focus: notebookEditor.getFocus(),
      selections: notebookEditor.getSelections()
    }, () => {
      return {
        kind: SelectionStateType.Index,
        focus: notebookEditor.getFocus(),
        selections: notebookEditor.getSelections()
      };
    }, void 0, true);
    const newCell = notebookEditor.cellAt(idx);
    await notebookEditor.focusNotebookCell(newCell, cell.getEditState() === CellEditState.Editing ? "editor" : "container");
  } else if (context.selectedCells) {
    const selectedCells = context.selectedCells;
    const rawEdits = [];
    selectedCells.forEach((cell) => {
      if (cell.cellKind === kind) {
        return;
      }
      const text = cell.getText();
      const idx = notebookEditor.getCellIndex(cell);
      if (language === void 0) {
        const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
        language = availableLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
      }
      rawEdits.push(
        {
          editType: CellEditType.Replace,
          index: idx,
          count: 1,
          cells: [{
            cellKind: kind,
            source: text,
            language,
            mime: mime ?? cell.mime,
            outputs: cell.model.outputs,
            metadata: cell.metadata
          }]
        }
      );
    });
    notebookEditor.textModel.applyEdits(rawEdits, true, {
      kind: SelectionStateType.Index,
      focus: notebookEditor.getFocus(),
      selections: notebookEditor.getSelections()
    }, () => {
      return {
        kind: SelectionStateType.Index,
        focus: notebookEditor.getFocus(),
        selections: notebookEditor.getSelections()
      };
    }, void 0, true);
  }
}
function runDeleteAction(editor, cell) {
  const textModel = editor.textModel;
  const selections = editor.getSelections();
  const targetCellIndex = editor.getCellIndex(cell);
  const containingSelection = selections.find((selection) => selection.start <= targetCellIndex && targetCellIndex < selection.end);
  const computeUndoRedo = !editor.isReadOnly || textModel.viewType === "interactive";
  if (containingSelection) {
    const edits = selections.reverse().map((selection) => ({
      editType: CellEditType.Replace,
      index: selection.start,
      count: selection.end - selection.start,
      cells: []
    }));
    const nextCellAfterContainingSelection = containingSelection.end >= editor.getLength() ? void 0 : editor.cellAt(containingSelection.end);
    textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => {
      if (nextCellAfterContainingSelection) {
        const cellIndex = textModel.cells.findIndex((cell2) => cell2.handle === nextCellAfterContainingSelection.handle);
        return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
      } else {
        if (textModel.length) {
          const lastCellIndex = textModel.length - 1;
          return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };
        } else {
          return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
        }
      }
    }, void 0, computeUndoRedo);
  } else {
    const focus = editor.getFocus();
    const edits = [{
      editType: CellEditType.Replace,
      index: targetCellIndex,
      count: 1,
      cells: []
    }];
    const finalSelections = [];
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      if (selection.end <= targetCellIndex) {
        finalSelections.push(selection);
      } else if (selection.start > targetCellIndex) {
        finalSelections.push({ start: selection.start - 1, end: selection.end - 1 });
      } else {
        finalSelections.push({ start: targetCellIndex, end: targetCellIndex + 1 });
      }
    }
    if (editor.cellAt(focus.start) === cell) {
      const newFocus = focus.end === textModel.length ? { start: focus.start - 1, end: focus.end - 1 } : focus;
      textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
        kind: SelectionStateType.Index,
        focus: newFocus,
        selections: finalSelections
      }), void 0, computeUndoRedo);
    } else {
      const newFocus = focus.start > targetCellIndex ? { start: focus.start - 1, end: focus.end - 1 } : focus;
      textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
        kind: SelectionStateType.Index,
        focus: newFocus,
        selections: finalSelections
      }), void 0, computeUndoRedo);
    }
  }
}
async function moveCellRange(context, direction) {
  if (!context.notebookEditor.hasModel()) {
    return;
  }
  const editor = context.notebookEditor;
  const textModel = editor.textModel;
  if (editor.isReadOnly) {
    return;
  }
  let range = void 0;
  if (context.cell) {
    const idx = editor.getCellIndex(context.cell);
    range = { start: idx, end: idx + 1 };
  } else {
    const selections = editor.getSelections();
    const modelRanges = expandCellRangesWithHiddenCells(editor, selections);
    range = modelRanges[0];
  }
  if (!range || range.start === range.end) {
    return;
  }
  if (direction === "up") {
    if (range.start === 0) {
      return;
    }
    const indexAbove = range.start - 1;
    const finalSelection = { start: range.start - 1, end: range.end - 1 };
    const focus = context.notebookEditor.getFocus();
    const newFocus = cellRangeContains(range, focus) ? { start: focus.start - 1, end: focus.end - 1 } : { start: range.start - 1, end: range.start };
    textModel.applyEdits(
      [
        {
          editType: CellEditType.Move,
          index: indexAbove,
          length: 1,
          newIdx: range.end - 1
        }
      ],
      true,
      {
        kind: SelectionStateType.Index,
        focus: editor.getFocus(),
        selections: editor.getSelections()
      },
      () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
      void 0,
      true
    );
    const focusRange = editor.getSelections()[0] ?? editor.getFocus();
    editor.revealCellRangeInView(focusRange);
  } else {
    if (range.end >= textModel.length) {
      return;
    }
    const indexBelow = range.end;
    const finalSelection = { start: range.start + 1, end: range.end + 1 };
    const focus = editor.getFocus();
    const newFocus = cellRangeContains(range, focus) ? { start: focus.start + 1, end: focus.end + 1 } : { start: range.start + 1, end: range.start + 2 };
    textModel.applyEdits(
      [
        {
          editType: CellEditType.Move,
          index: indexBelow,
          length: 1,
          newIdx: range.start
        }
      ],
      true,
      {
        kind: SelectionStateType.Index,
        focus: editor.getFocus(),
        selections: editor.getSelections()
      },
      () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
      void 0,
      true
    );
    const focusRange = editor.getSelections()[0] ?? editor.getFocus();
    editor.revealCellRangeInView(focusRange);
  }
}
async function copyCellRange(context, direction) {
  const editor = context.notebookEditor;
  if (!editor.hasModel()) {
    return;
  }
  const textModel = editor.textModel;
  if (editor.isReadOnly) {
    return;
  }
  let range = void 0;
  if (context.ui) {
    const targetCell = context.cell;
    const targetCellIndex = editor.getCellIndex(targetCell);
    range = { start: targetCellIndex, end: targetCellIndex + 1 };
  } else {
    const selections = editor.getSelections();
    const modelRanges = expandCellRangesWithHiddenCells(editor, selections);
    range = modelRanges[0];
  }
  if (!range || range.start === range.end) {
    return;
  }
  if (direction === "up") {
    const focus = editor.getFocus();
    const selections = editor.getSelections();
    textModel.applyEdits(
      [
        {
          editType: CellEditType.Replace,
          index: range.end,
          count: 0,
          cells: cellRangesToIndexes([range]).map((index) => cloneNotebookCellTextModel(editor.cellAt(index).model))
        }
      ],
      true,
      {
        kind: SelectionStateType.Index,
        focus,
        selections
      },
      () => ({ kind: SelectionStateType.Index, focus, selections }),
      void 0,
      true
    );
  } else {
    const focus = editor.getFocus();
    const selections = editor.getSelections();
    const newCells = cellRangesToIndexes([range]).map((index) => cloneNotebookCellTextModel(editor.cellAt(index).model));
    const countDelta = newCells.length;
    const newFocus = context.ui ? focus : { start: focus.start + countDelta, end: focus.end + countDelta };
    const newSelections = context.ui ? selections : [{ start: range.start + countDelta, end: range.end + countDelta }];
    textModel.applyEdits(
      [
        {
          editType: CellEditType.Replace,
          index: range.end,
          count: 0,
          cells: cellRangesToIndexes([range]).map((index) => cloneNotebookCellTextModel(editor.cellAt(index).model))
        }
      ],
      true,
      {
        kind: SelectionStateType.Index,
        focus,
        selections
      },
      () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }),
      void 0,
      true
    );
    const focusRange = editor.getSelections()[0] ?? editor.getFocus();
    editor.revealCellRangeInView(focusRange);
  }
}
async function joinSelectedCells(bulkEditService, notificationService, context) {
  const editor = context.notebookEditor;
  if (editor.isReadOnly) {
    return;
  }
  const edits = [];
  const cells = [];
  for (const selection of editor.getSelections()) {
    cells.push(...editor.getCellsInRange(selection));
  }
  if (cells.length <= 1) {
    return;
  }
  const cellKind = cells[0].cellKind;
  const isSameKind = cells.every((cell) => cell.cellKind === cellKind);
  if (!isSameKind) {
    const message = localize("notebookActions.joinSelectedCells", "Cannot join cells of different kinds");
    return notificationService.warn(message);
  }
  const firstCell = cells[0];
  const insertContent = cells.map((cell) => cell.getText()).join(firstCell.textBuffer.getEOL());
  const firstSelection = editor.getSelections()[0];
  edits.push(
    new ResourceNotebookCellEdit(
      editor.textModel.uri,
      {
        editType: CellEditType.Replace,
        index: firstSelection.start,
        count: firstSelection.end - firstSelection.start,
        cells: [{
          cellKind: firstCell.cellKind,
          source: insertContent,
          language: firstCell.language,
          mime: firstCell.mime,
          outputs: firstCell.model.outputs,
          metadata: firstCell.metadata
        }]
      }
    )
  );
  for (const selection of editor.getSelections().slice(1)) {
    edits.push(new ResourceNotebookCellEdit(
      editor.textModel.uri,
      {
        editType: CellEditType.Replace,
        index: selection.start,
        count: selection.end - selection.start,
        cells: []
      }
    ));
  }
  if (edits.length) {
    await bulkEditService.apply(
      edits,
      { quotableLabel: localize("notebookActions.joinSelectedCells.label", "Join Notebook Cells") }
    );
  }
}
async function joinNotebookCells(editor, range, direction, constraint) {
  if (editor.isReadOnly) {
    return null;
  }
  const textModel = editor.textModel;
  const cells = editor.getCellsInRange(range);
  if (!cells.length) {
    return null;
  }
  if (range.start === 0 && direction === "above") {
    return null;
  }
  if (range.end === textModel.length && direction === "below") {
    return null;
  }
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (constraint && cell.cellKind !== constraint) {
      return null;
    }
  }
  if (direction === "above") {
    const above = editor.cellAt(range.start - 1);
    if (constraint && above.cellKind !== constraint) {
      return null;
    }
    const insertContent = cells.map((cell) => (cell.textBuffer.getEOL() ?? "") + cell.getText()).join("");
    const aboveCellLineCount = above.textBuffer.getLineCount();
    const aboveCellLastLineEndColumn = above.textBuffer.getLineLength(aboveCellLineCount);
    return {
      edits: [
        new ResourceTextEdit(above.uri, { range: new Range(aboveCellLineCount, aboveCellLastLineEndColumn + 1, aboveCellLineCount, aboveCellLastLineEndColumn + 1), text: insertContent }),
        new ResourceNotebookCellEdit(
          textModel.uri,
          {
            editType: CellEditType.Replace,
            index: range.start,
            count: range.end - range.start,
            cells: []
          }
        )
      ],
      cell: above,
      endFocus: { start: range.start - 1, end: range.start },
      endSelections: [{ start: range.start - 1, end: range.start }]
    };
  } else {
    const below = editor.cellAt(range.end);
    if (constraint && below.cellKind !== constraint) {
      return null;
    }
    const cell = cells[0];
    const restCells = [...cells.slice(1), below];
    const insertContent = restCells.map((cl) => (cl.textBuffer.getEOL() ?? "") + cl.getText()).join("");
    const cellLineCount = cell.textBuffer.getLineCount();
    const cellLastLineEndColumn = cell.textBuffer.getLineLength(cellLineCount);
    return {
      edits: [
        new ResourceTextEdit(cell.uri, { range: new Range(cellLineCount, cellLastLineEndColumn + 1, cellLineCount, cellLastLineEndColumn + 1), text: insertContent }),
        new ResourceNotebookCellEdit(
          textModel.uri,
          {
            editType: CellEditType.Replace,
            index: range.start + 1,
            count: range.end - range.start,
            cells: []
          }
        )
      ],
      cell,
      endFocus: { start: range.start, end: range.start + 1 },
      endSelections: [{ start: range.start, end: range.start + 1 }]
    };
  }
}
async function joinCellsWithSurrounds(bulkEditService, context, direction) {
  const editor = context.notebookEditor;
  const textModel = editor.textModel;
  const viewModel = editor.getViewModel();
  let ret = null;
  if (context.ui) {
    const focusMode = context.cell.focusMode;
    const cellIndex = editor.getCellIndex(context.cell);
    ret = await joinNotebookCells(editor, { start: cellIndex, end: cellIndex + 1 }, direction);
    if (!ret) {
      return;
    }
    await bulkEditService.apply(
      ret?.edits,
      { quotableLabel: "Join Notebook Cells" }
    );
    viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: ret.endFocus, selections: ret.endSelections });
    ret.cell.updateEditState(CellEditState.Editing, "joinCellsWithSurrounds");
    editor.revealCellRangeInView(editor.getFocus());
    if (focusMode === CellFocusMode.Editor) {
      ret.cell.focusMode = CellFocusMode.Editor;
    }
  } else {
    const selections = editor.getSelections();
    if (!selections.length) {
      return;
    }
    const focus = editor.getFocus();
    const focusMode = editor.cellAt(focus.start)?.focusMode;
    const edits = [];
    let cell = null;
    const cells = [];
    for (let i = selections.length - 1; i >= 0; i--) {
      const selection = selections[i];
      const containFocus = cellRangeContains(selection, focus);
      if (selection.end >= textModel.length && direction === "below" || selection.start === 0 && direction === "above") {
        if (containFocus) {
          cell = editor.cellAt(focus.start);
        }
        cells.push(...editor.getCellsInRange(selection));
        continue;
      }
      const singleRet = await joinNotebookCells(editor, selection, direction);
      if (!singleRet) {
        return;
      }
      edits.push(...singleRet.edits);
      cells.push(singleRet.cell);
      if (containFocus) {
        cell = singleRet.cell;
      }
    }
    if (!edits.length) {
      return;
    }
    if (!cell || !cells.length) {
      return;
    }
    await bulkEditService.apply(
      edits,
      { quotableLabel: "Join Notebook Cells" }
    );
    cells.forEach((cell2) => {
      cell2.updateEditState(CellEditState.Editing, "joinCellsWithSurrounds");
    });
    viewModel.updateSelectionsState({ kind: SelectionStateType.Handle, primary: cell.handle, selections: cells.map((cell2) => cell2.handle) });
    editor.revealCellRangeInView(editor.getFocus());
    const newFocusedCell = editor.cellAt(editor.getFocus().start);
    if (focusMode === CellFocusMode.Editor && newFocusedCell) {
      newFocusedCell.focusMode = CellFocusMode.Editor;
    }
  }
}
function _splitPointsToBoundaries(splitPoints, textBuffer) {
  const boundaries = [];
  const lineCnt = textBuffer.getLineCount();
  const getLineLen = (lineNumber) => {
    return textBuffer.getLineLength(lineNumber);
  };
  splitPoints = splitPoints.sort((l, r) => {
    const lineDiff = l.lineNumber - r.lineNumber;
    const columnDiff = l.column - r.column;
    return lineDiff !== 0 ? lineDiff : columnDiff;
  });
  for (let sp of splitPoints) {
    if (getLineLen(sp.lineNumber) + 1 === sp.column && sp.column !== 1 && sp.lineNumber < lineCnt) {
      sp = new Position(sp.lineNumber + 1, 1);
    }
    _pushIfAbsent(boundaries, sp);
  }
  if (boundaries.length === 0) {
    return null;
  }
  const modelStart = new Position(1, 1);
  const modelEnd = new Position(lineCnt, getLineLen(lineCnt) + 1);
  return [modelStart, ...boundaries, modelEnd];
}
function _pushIfAbsent(positions, p) {
  const last = positions.length > 0 ? positions[positions.length - 1] : void 0;
  if (!last || last.lineNumber !== p.lineNumber || last.column !== p.column) {
    positions.push(p);
  }
}
function computeCellLinesContents(cell, splitPoints) {
  const rangeBoundaries = _splitPointsToBoundaries(splitPoints, cell.textBuffer);
  if (!rangeBoundaries) {
    return null;
  }
  const newLineModels = [];
  for (let i = 1; i < rangeBoundaries.length; i++) {
    const start = rangeBoundaries[i - 1];
    const end = rangeBoundaries[i];
    newLineModels.push(cell.textBuffer.getValueInRange(new Range(start.lineNumber, start.column, end.lineNumber, end.column), EndOfLinePreference.TextDefined));
  }
  return newLineModels;
}
function insertCell(languageService, editor, index, type, direction = "above", initialText = "", ui = false, kernelHistoryService) {
  const viewModel = editor.getViewModel();
  const activeKernel = editor.activeKernel;
  if (viewModel.options.isReadOnly) {
    return null;
  }
  const cell = editor.cellAt(index);
  const nextIndex = ui ? viewModel.getNextVisibleCellIndex(index) : index + 1;
  let language;
  if (type === CellKind.Code) {
    const supportedLanguages = activeKernel?.supportedLanguages ?? languageService.getRegisteredLanguageIds();
    const defaultLanguage = supportedLanguages[0] || PLAINTEXT_LANGUAGE_ID;
    if (cell?.cellKind === CellKind.Code) {
      language = cell.language;
    } else if (cell?.cellKind === CellKind.Markup) {
      const nearestCodeCellIndex = viewModel.nearestCodeCellIndex(index);
      if (nearestCodeCellIndex > -1) {
        language = viewModel.cellAt(nearestCodeCellIndex).language;
      } else {
        language = defaultLanguage;
      }
    } else if (!cell && viewModel.length === 0) {
      const lastKernels = kernelHistoryService?.getKernels(viewModel.notebookDocument);
      if (lastKernels?.all.length) {
        const lastKernel = lastKernels.all[0];
        language = lastKernel.supportedLanguages[0] || defaultLanguage;
      } else {
        language = defaultLanguage;
      }
    } else {
      if (cell === void 0 && direction === "above") {
        language = viewModel.viewCells.find((cell2) => cell2.cellKind === CellKind.Code)?.language || defaultLanguage;
      } else {
        language = defaultLanguage;
      }
    }
    if (!supportedLanguages.includes(language)) {
      language = defaultLanguage;
    }
  } else {
    language = "markdown";
  }
  const insertIndex = cell ? direction === "above" ? index : nextIndex : index;
  return insertCellAtIndex(viewModel, insertIndex, initialText, language, type, void 0, [], true, true);
}
function insertCellAtIndex(viewModel, index, source, language, type, metadata, outputs, synchronous, pushUndoStop) {
  const endSelections = { kind: SelectionStateType.Index, focus: { start: index, end: index + 1 }, selections: [{ start: index, end: index + 1 }] };
  viewModel.notebookDocument.applyEdits([
    {
      editType: CellEditType.Replace,
      index,
      count: 0,
      cells: [
        {
          cellKind: type,
          language,
          mime: void 0,
          outputs,
          metadata,
          source
        }
      ]
    }
  ], synchronous, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => endSelections, void 0, pushUndoStop && !viewModel.options.isReadOnly);
  return viewModel.cellAt(index);
}
export {
  changeCellToKind,
  computeCellLinesContents,
  copyCellRange,
  insertCell,
  insertCellAtIndex,
  joinCellsWithSurrounds,
  joinNotebookCells,
  joinSelectedCells,
  moveCellRange,
  runDeleteAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxjZWxsT3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UsIFJlc291cmNlRWRpdCwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElSZWFkb25seVRleHRCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCB9IGZyb20gJy4uLy4uLy4uL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0NlbGxFZGl0cy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCB9IGZyb20gJy4vY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZvY3VzTW9kZSwgZXhwYW5kQ2VsbFJhbmdlc1dpdGhIaWRkZW5DZWxscywgSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBJQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsVmlld01vZGVsLCBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIElDZWxsRWRpdE9wZXJhdGlvbiwgSUNlbGxSZXBsYWNlRWRpdCwgSU91dHB1dER0bywgSVNlbGVjdGlvblN0YXRlLCBOb3RlYm9va0NlbGxNZXRhZGF0YSwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGNlbGxSYW5nZUNvbnRhaW5zLCBjZWxsUmFuZ2VzVG9JbmRleGVzLCBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2hhbmdlQ2VsbFRvS2luZChraW5kOiBDZWxsS2luZCwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCwgbGFuZ3VhZ2U/OiBzdHJpbmcsIG1pbWU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgeyBub3RlYm9va0VkaXRvciB9ID0gY29udGV4dDtcblx0aWYgKCFub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKG5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoY29udGV4dC51aSAmJiBjb250ZXh0LmNlbGwpIHtcblx0XHQvLyBhY3Rpb24gZnJvbSBVSVxuXHRcdGNvbnN0IHsgY2VsbCB9ID0gY29udGV4dDtcblxuXHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBraW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IGNlbGwuZ2V0VGV4dCgpO1xuXHRcdGNvbnN0IGlkeCA9IG5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjZWxsKTtcblxuXHRcdGlmIChsYW5ndWFnZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVMYW5ndWFnZXMgPSBub3RlYm9va0VkaXRvci5hY3RpdmVLZXJuZWw/LnN1cHBvcnRlZExhbmd1YWdlcyA/PyBbXTtcblx0XHRcdGxhbmd1YWdlID0gYXZhaWxhYmxlTGFuZ3VhZ2VzWzBdID8/IFBMQUlOVEVYVF9MQU5HVUFHRV9JRDtcblx0XHR9XG5cblx0XHRub3RlYm9va0VkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IGlkeCxcblx0XHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdGNlbGxLaW5kOiBraW5kLFxuXHRcdFx0XHRcdHNvdXJjZTogdGV4dCxcblx0XHRcdFx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXG5cdFx0XHRcdFx0bWltZTogbWltZSA/PyBjZWxsLm1pbWUsXG5cdFx0XHRcdFx0b3V0cHV0czogY2VsbC5tb2RlbC5vdXRwdXRzLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBjZWxsLm1ldGFkYXRhLFxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdF0sIHRydWUsIHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiBub3RlYm9va0VkaXRvci5nZXRGb2N1cygpLFxuXHRcdFx0c2VsZWN0aW9uczogbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRmb2N1czogbm90ZWJvb2tFZGl0b3IuZ2V0Rm9jdXMoKSxcblx0XHRcdFx0c2VsZWN0aW9uczogbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0XHR9O1xuXHRcdH0sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgbmV3Q2VsbCA9IG5vdGVib29rRWRpdG9yLmNlbGxBdChpZHgpO1xuXHRcdGF3YWl0IG5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKG5ld0NlbGwsIGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyA/ICdlZGl0b3InIDogJ2NvbnRhaW5lcicpO1xuXHR9IGVsc2UgaWYgKGNvbnRleHQuc2VsZWN0ZWRDZWxscykge1xuXHRcdGNvbnN0IHNlbGVjdGVkQ2VsbHMgPSBjb250ZXh0LnNlbGVjdGVkQ2VsbHM7XG5cdFx0Y29uc3QgcmF3RWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gW107XG5cblx0XHRzZWxlY3RlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0ga2luZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gY2VsbC5nZXRUZXh0KCk7XG5cdFx0XHRjb25zdCBpZHggPSBub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cblx0XHRcdGlmIChsYW5ndWFnZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGF2YWlsYWJsZUxhbmd1YWdlcyA9IG5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbD8uc3VwcG9ydGVkTGFuZ3VhZ2VzID8/IFtdO1xuXHRcdFx0XHRsYW5ndWFnZSA9IGF2YWlsYWJsZUxhbmd1YWdlc1swXSA/PyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdHJhd0VkaXRzLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IGlkeCxcblx0XHRcdFx0XHRjb3VudDogMSxcblx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdGNlbGxLaW5kOiBraW5kLFxuXHRcdFx0XHRcdFx0c291cmNlOiB0ZXh0LFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxuXHRcdFx0XHRcdFx0bWltZTogbWltZSA/PyBjZWxsLm1pbWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBjZWxsLm1vZGVsLm91dHB1dHMsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogY2VsbC5tZXRhZGF0YSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0bm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMocmF3RWRpdHMsIHRydWUsIHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiBub3RlYm9va0VkaXRvci5nZXRGb2N1cygpLFxuXHRcdFx0c2VsZWN0aW9uczogbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRmb2N1czogbm90ZWJvb2tFZGl0b3IuZ2V0Rm9jdXMoKSxcblx0XHRcdFx0c2VsZWN0aW9uczogbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0XHR9O1xuXHRcdH0sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvciwgY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdGNvbnN0IHRhcmdldENlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdGNvbnN0IGNvbnRhaW5pbmdTZWxlY3Rpb24gPSBzZWxlY3Rpb25zLmZpbmQoc2VsZWN0aW9uID0+IHNlbGVjdGlvbi5zdGFydCA8PSB0YXJnZXRDZWxsSW5kZXggJiYgdGFyZ2V0Q2VsbEluZGV4IDwgc2VsZWN0aW9uLmVuZCk7XG5cblx0Y29uc3QgY29tcHV0ZVVuZG9SZWRvID0gIWVkaXRvci5pc1JlYWRPbmx5IHx8IHRleHRNb2RlbC52aWV3VHlwZSA9PT0gJ2ludGVyYWN0aXZlJztcblx0aWYgKGNvbnRhaW5pbmdTZWxlY3Rpb24pIHtcblx0XHRjb25zdCBlZGl0czogSUNlbGxSZXBsYWNlRWRpdFtdID0gc2VsZWN0aW9ucy5yZXZlcnNlKCkubWFwKHNlbGVjdGlvbiA9PiAoe1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogc2VsZWN0aW9uLnN0YXJ0LCBjb3VudDogc2VsZWN0aW9uLmVuZCAtIHNlbGVjdGlvbi5zdGFydCwgY2VsbHM6IFtdXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbmV4dENlbGxBZnRlckNvbnRhaW5pbmdTZWxlY3Rpb24gPSBjb250YWluaW5nU2VsZWN0aW9uLmVuZCA+PSBlZGl0b3IuZ2V0TGVuZ3RoKCkgPyB1bmRlZmluZWQgOiBlZGl0b3IuY2VsbEF0KGNvbnRhaW5pbmdTZWxlY3Rpb24uZW5kKTtcblxuXHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIH0sICgpID0+IHtcblx0XHRcdGlmIChuZXh0Q2VsbEFmdGVyQ29udGFpbmluZ1NlbGVjdGlvbikge1xuXHRcdFx0XHRjb25zdCBjZWxsSW5kZXggPSB0ZXh0TW9kZWwuY2VsbHMuZmluZEluZGV4KGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IG5leHRDZWxsQWZ0ZXJDb250YWluaW5nU2VsZWN0aW9uLmhhbmRsZSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IGNlbGxJbmRleCwgZW5kOiBjZWxsSW5kZXggKyAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiBjZWxsSW5kZXgsIGVuZDogY2VsbEluZGV4ICsgMSB9XSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRleHRNb2RlbC5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0Q2VsbEluZGV4ID0gdGV4dE1vZGVsLmxlbmd0aCAtIDE7XG5cdFx0XHRcdFx0cmV0dXJuIHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogbGFzdENlbGxJbmRleCwgZW5kOiBsYXN0Q2VsbEluZGV4ICsgMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogbGFzdENlbGxJbmRleCwgZW5kOiBsYXN0Q2VsbEluZGV4ICsgMSB9XSB9O1xuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAwIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDAgfV0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIHVuZGVmaW5lZCwgY29tcHV0ZVVuZG9SZWRvKTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBmb2N1cyA9IGVkaXRvci5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IGVkaXRzOiBJQ2VsbFJlcGxhY2VFZGl0W10gPSBbe1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogdGFyZ2V0Q2VsbEluZGV4LCBjb3VudDogMSwgY2VsbHM6IFtdXG5cdFx0fV07XG5cblx0XHRjb25zdCBmaW5hbFNlbGVjdGlvbnM6IElDZWxsUmFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2VsZWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblxuXHRcdFx0aWYgKHNlbGVjdGlvbi5lbmQgPD0gdGFyZ2V0Q2VsbEluZGV4KSB7XG5cdFx0XHRcdGZpbmFsU2VsZWN0aW9ucy5wdXNoKHNlbGVjdGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGlvbi5zdGFydCA+IHRhcmdldENlbGxJbmRleCkge1xuXHRcdFx0XHRmaW5hbFNlbGVjdGlvbnMucHVzaCh7IHN0YXJ0OiBzZWxlY3Rpb24uc3RhcnQgLSAxLCBlbmQ6IHNlbGVjdGlvbi5lbmQgLSAxIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmluYWxTZWxlY3Rpb25zLnB1c2goeyBzdGFydDogdGFyZ2V0Q2VsbEluZGV4LCBlbmQ6IHRhcmdldENlbGxJbmRleCArIDEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvci5jZWxsQXQoZm9jdXMuc3RhcnQpID09PSBjZWxsKSB7XG5cdFx0XHQvLyBmb2N1cyBpcyB0aGUgdGFyZ2V0LCBmb2N1cyBpcyBhbHNvIG5vdCBwYXJ0IG9mIGFueSBzZWxlY3Rpb25cblx0XHRcdGNvbnN0IG5ld0ZvY3VzID0gZm9jdXMuZW5kID09PSB0ZXh0TW9kZWwubGVuZ3RoID8geyBzdGFydDogZm9jdXMuc3RhcnQgLSAxLCBlbmQ6IGZvY3VzLmVuZCAtIDEgfSA6IGZvY3VzO1xuXG5cdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogZWRpdG9yLmdldFNlbGVjdGlvbnMoKSB9LCAoKSA9PiAoe1xuXHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBuZXdGb2N1cywgc2VsZWN0aW9uczogZmluYWxTZWxlY3Rpb25zXG5cdFx0XHR9KSwgdW5kZWZpbmVkLCBjb21wdXRlVW5kb1JlZG8pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyB1c2VycyBkZWNpZGUgdG8gZGVsZXRlIGEgY2VsbCBvdXQgb2YgY3VycmVudCBmb2N1cy9zZWxlY3Rpb25cblx0XHRcdGNvbnN0IG5ld0ZvY3VzID0gZm9jdXMuc3RhcnQgPiB0YXJnZXRDZWxsSW5kZXggPyB7IHN0YXJ0OiBmb2N1cy5zdGFydCAtIDEsIGVuZDogZm9jdXMuZW5kIC0gMSB9IDogZm9jdXM7XG5cblx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIH0sICgpID0+ICh7XG5cdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IG5ld0ZvY3VzLCBzZWxlY3Rpb25zOiBmaW5hbFNlbGVjdGlvbnNcblx0XHRcdH0pLCB1bmRlZmluZWQsIGNvbXB1dGVVbmRvUmVkbyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtb3ZlQ2VsbFJhbmdlKGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoIWNvbnRleHQubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdGlmIChlZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCByYW5nZTogSUNlbGxSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRpZiAoY29udGV4dC5jZWxsKSB7XG5cdFx0Y29uc3QgaWR4ID0gZWRpdG9yLmdldENlbGxJbmRleChjb250ZXh0LmNlbGwpO1xuXHRcdHJhbmdlID0geyBzdGFydDogaWR4LCBlbmQ6IGlkeCArIDEgfTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBtb2RlbFJhbmdlcyA9IGV4cGFuZENlbGxSYW5nZXNXaXRoSGlkZGVuQ2VsbHMoZWRpdG9yLCBzZWxlY3Rpb25zKTtcblx0XHRyYW5nZSA9IG1vZGVsUmFuZ2VzWzBdO1xuXHR9XG5cblx0aWYgKCFyYW5nZSB8fCByYW5nZS5zdGFydCA9PT0gcmFuZ2UuZW5kKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuXHRcdGlmIChyYW5nZS5zdGFydCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4QWJvdmUgPSByYW5nZS5zdGFydCAtIDE7XG5cdFx0Y29uc3QgZmluYWxTZWxlY3Rpb24gPSB7IHN0YXJ0OiByYW5nZS5zdGFydCAtIDEsIGVuZDogcmFuZ2UuZW5kIC0gMSB9O1xuXHRcdGNvbnN0IGZvY3VzID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IG5ld0ZvY3VzID0gY2VsbFJhbmdlQ29udGFpbnMocmFuZ2UsIGZvY3VzKSA/IHsgc3RhcnQ6IGZvY3VzLnN0YXJ0IC0gMSwgZW5kOiBmb2N1cy5lbmQgLSAxIH0gOiB7IHN0YXJ0OiByYW5nZS5zdGFydCAtIDEsIGVuZDogcmFuZ2Uuc3RhcnQgfTtcblx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZSxcblx0XHRcdFx0aW5kZXg6IGluZGV4QWJvdmUsXG5cdFx0XHRcdGxlbmd0aDogMSxcblx0XHRcdFx0bmV3SWR4OiByYW5nZS5lbmQgLSAxXG5cdFx0XHR9XSxcblx0XHRcdHRydWUsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdFx0Zm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogbmV3Rm9jdXMsIHNlbGVjdGlvbnM6IFtmaW5hbFNlbGVjdGlvbl0gfSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlXG5cdFx0KTtcblx0XHRjb25zdCBmb2N1c1JhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKVswXSA/PyBlZGl0b3IuZ2V0Rm9jdXMoKTtcblx0XHRlZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KGZvY3VzUmFuZ2UpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChyYW5nZS5lbmQgPj0gdGV4dE1vZGVsLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4QmVsb3cgPSByYW5nZS5lbmQ7XG5cdFx0Y29uc3QgZmluYWxTZWxlY3Rpb24gPSB7IHN0YXJ0OiByYW5nZS5zdGFydCArIDEsIGVuZDogcmFuZ2UuZW5kICsgMSB9O1xuXHRcdGNvbnN0IGZvY3VzID0gZWRpdG9yLmdldEZvY3VzKCk7XG5cdFx0Y29uc3QgbmV3Rm9jdXMgPSBjZWxsUmFuZ2VDb250YWlucyhyYW5nZSwgZm9jdXMpID8geyBzdGFydDogZm9jdXMuc3RhcnQgKyAxLCBlbmQ6IGZvY3VzLmVuZCArIDEgfSA6IHsgc3RhcnQ6IHJhbmdlLnN0YXJ0ICsgMSwgZW5kOiByYW5nZS5zdGFydCArIDIgfTtcblxuXHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRpbmRleDogaW5kZXhCZWxvdyxcblx0XHRcdFx0bGVuZ3RoOiAxLFxuXHRcdFx0XHRuZXdJZHg6IHJhbmdlLnN0YXJ0XG5cdFx0XHR9XSxcblx0XHRcdHRydWUsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdFx0Zm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogbmV3Rm9jdXMsIHNlbGVjdGlvbnM6IFtmaW5hbFNlbGVjdGlvbl0gfSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlXG5cdFx0KTtcblxuXHRcdGNvbnN0IGZvY3VzUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpWzBdID8/IGVkaXRvci5nZXRGb2N1cygpO1xuXHRcdGVkaXRvci5yZXZlYWxDZWxsUmFuZ2VJblZpZXcoZm9jdXNSYW5nZSk7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvcHlDZWxsUmFuZ2UoY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQsIGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRpZiAoZWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgcmFuZ2U6IElDZWxsUmFuZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRjb25zdCB0YXJnZXRDZWxsID0gY29udGV4dC5jZWxsO1xuXHRcdGNvbnN0IHRhcmdldENlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgodGFyZ2V0Q2VsbCk7XG5cdFx0cmFuZ2UgPSB7IHN0YXJ0OiB0YXJnZXRDZWxsSW5kZXgsIGVuZDogdGFyZ2V0Q2VsbEluZGV4ICsgMSB9O1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IG1vZGVsUmFuZ2VzID0gZXhwYW5kQ2VsbFJhbmdlc1dpdGhIaWRkZW5DZWxscyhlZGl0b3IsIHNlbGVjdGlvbnMpO1xuXHRcdHJhbmdlID0gbW9kZWxSYW5nZXNbMF07XG5cdH1cblxuXHRpZiAoIXJhbmdlIHx8IHJhbmdlLnN0YXJ0ID09PSByYW5nZS5lbmQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoZGlyZWN0aW9uID09PSAndXAnKSB7XG5cdFx0Ly8gaW5zZXJ0IHVwLCB3aXRob3V0IGNoYW5naW5nIGZvY3VzIGFuZCBzZWxlY3Rpb25zXG5cdFx0Y29uc3QgZm9jdXMgPSBlZGl0b3IuZ2V0Rm9jdXMoKTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IHJhbmdlLmVuZCxcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGNlbGxzOiBjZWxsUmFuZ2VzVG9JbmRleGVzKFtyYW5nZV0pLm1hcChpbmRleCA9PiBjbG9uZU5vdGVib29rQ2VsbFRleHRNb2RlbChlZGl0b3IuY2VsbEF0KGluZGV4KSEubW9kZWwpKVxuXHRcdFx0fV0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRcdGZvY3VzOiBmb2N1cyxcblx0XHRcdFx0c2VsZWN0aW9uczogc2VsZWN0aW9uc1xuXHRcdFx0fSxcblx0XHRcdCgpID0+ICh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGZvY3VzLCBzZWxlY3Rpb25zOiBzZWxlY3Rpb25zIH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZVxuXHRcdCk7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gaW5zZXJ0IGRvd24sIG1vdmUgc2VsZWN0aW9uc1xuXHRcdGNvbnN0IGZvY3VzID0gZWRpdG9yLmdldEZvY3VzKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgbmV3Q2VsbHMgPSBjZWxsUmFuZ2VzVG9JbmRleGVzKFtyYW5nZV0pLm1hcChpbmRleCA9PiBjbG9uZU5vdGVib29rQ2VsbFRleHRNb2RlbChlZGl0b3IuY2VsbEF0KGluZGV4KSEubW9kZWwpKTtcblx0XHRjb25zdCBjb3VudERlbHRhID0gbmV3Q2VsbHMubGVuZ3RoO1xuXHRcdGNvbnN0IG5ld0ZvY3VzID0gY29udGV4dC51aSA/IGZvY3VzIDogeyBzdGFydDogZm9jdXMuc3RhcnQgKyBjb3VudERlbHRhLCBlbmQ6IGZvY3VzLmVuZCArIGNvdW50RGVsdGEgfTtcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gY29udGV4dC51aSA/IHNlbGVjdGlvbnMgOiBbeyBzdGFydDogcmFuZ2Uuc3RhcnQgKyBjb3VudERlbHRhLCBlbmQ6IHJhbmdlLmVuZCArIGNvdW50RGVsdGEgfV07XG5cdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdGluZGV4OiByYW5nZS5lbmQsXG5cdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRjZWxsczogY2VsbFJhbmdlc1RvSW5kZXhlcyhbcmFuZ2VdKS5tYXAoaW5kZXggPT4gY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwoZWRpdG9yLmNlbGxBdChpbmRleCkhLm1vZGVsKSlcblx0XHRcdH1dLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRmb2N1czogZm9jdXMsXG5cdFx0XHRcdHNlbGVjdGlvbnM6IHNlbGVjdGlvbnNcblx0XHRcdH0sXG5cdFx0XHQoKSA9PiAoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBuZXdGb2N1cywgc2VsZWN0aW9uczogbmV3U2VsZWN0aW9ucyB9KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRydWVcblx0XHQpO1xuXG5cdFx0Y29uc3QgZm9jdXNSYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKClbMF0gPz8gZWRpdG9yLmdldEZvY3VzKCk7XG5cdFx0ZWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyhmb2N1c1JhbmdlKTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gam9pblNlbGVjdGVkQ2VsbHMoYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0aWYgKGVkaXRvci5pc1JlYWRPbmx5KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZWRpdHM6IFJlc291cmNlRWRpdFtdID0gW107XG5cdGNvbnN0IGNlbGxzOiBJQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpIHtcblx0XHRjZWxscy5wdXNoKC4uLmVkaXRvci5nZXRDZWxsc0luUmFuZ2Uoc2VsZWN0aW9uKSk7XG5cdH1cblxuXHRpZiAoY2VsbHMubGVuZ3RoIDw9IDEpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBjaGVjayBpZiBhbGwgY2VsbHMgYXJlIG9mIHRoZSBzYW1lIGtpbmRcblx0Y29uc3QgY2VsbEtpbmQgPSBjZWxsc1swXS5jZWxsS2luZDtcblx0Y29uc3QgaXNTYW1lS2luZCA9IGNlbGxzLmV2ZXJ5KGNlbGwgPT4gY2VsbC5jZWxsS2luZCA9PT0gY2VsbEtpbmQpO1xuXHRpZiAoIWlzU2FtZUtpbmQpIHtcblx0XHQvLyBjYW5ub3Qgam9pbiBjZWxscyBvZiBkaWZmZXJlbnQga2luZHNcblx0XHQvLyBzaG93IHdhcm5pbmcgYW5kIHF1aXRcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5qb2luU2VsZWN0ZWRDZWxscycsIFwiQ2Fubm90IGpvaW4gY2VsbHMgb2YgZGlmZmVyZW50IGtpbmRzXCIpO1xuXHRcdHJldHVybiBub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdH1cblxuXHQvLyBtZXJnZSBhbGwgY2VsbHMgY29udGVudCBpbnRvIGZpcnN0IGNlbGxcblx0Y29uc3QgZmlyc3RDZWxsID0gY2VsbHNbMF07XG5cdGNvbnN0IGluc2VydENvbnRlbnQgPSBjZWxscy5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSkuam9pbihmaXJzdENlbGwudGV4dEJ1ZmZlci5nZXRFT0woKSk7XG5cdGNvbnN0IGZpcnN0U2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKVswXTtcblx0ZWRpdHMucHVzaChcblx0XHRuZXcgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KGVkaXRvci50ZXh0TW9kZWwudXJpLFxuXHRcdFx0e1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdGluZGV4OiBmaXJzdFNlbGVjdGlvbi5zdGFydCxcblx0XHRcdFx0Y291bnQ6IGZpcnN0U2VsZWN0aW9uLmVuZCAtIGZpcnN0U2VsZWN0aW9uLnN0YXJ0LFxuXHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRjZWxsS2luZDogZmlyc3RDZWxsLmNlbGxLaW5kLFxuXHRcdFx0XHRcdHNvdXJjZTogaW5zZXJ0Q29udGVudCxcblx0XHRcdFx0XHRsYW5ndWFnZTogZmlyc3RDZWxsLmxhbmd1YWdlLFxuXHRcdFx0XHRcdG1pbWU6IGZpcnN0Q2VsbC5taW1lLFxuXHRcdFx0XHRcdG91dHB1dHM6IGZpcnN0Q2VsbC5tb2RlbC5vdXRwdXRzLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBmaXJzdENlbGwubWV0YWRhdGEsXG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0KVxuXHQpO1xuXG5cdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkuc2xpY2UoMSkpIHtcblx0XHRlZGl0cy5wdXNoKG5ldyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQoZWRpdG9yLnRleHRNb2RlbC51cmksXG5cdFx0XHR7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IHNlbGVjdGlvbi5zdGFydCxcblx0XHRcdFx0Y291bnQ6IHNlbGVjdGlvbi5lbmQgLSBzZWxlY3Rpb24uc3RhcnQsXG5cdFx0XHRcdGNlbGxzOiBbXVxuXHRcdFx0fSkpO1xuXHR9XG5cblx0aWYgKGVkaXRzLmxlbmd0aCkge1xuXHRcdGF3YWl0IGJ1bGtFZGl0U2VydmljZS5hcHBseShcblx0XHRcdGVkaXRzLFxuXHRcdFx0eyBxdW90YWJsZUxhYmVsOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmpvaW5TZWxlY3RlZENlbGxzLmxhYmVsJywgXCJKb2luIE5vdGVib29rIENlbGxzXCIpIH1cblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBqb2luTm90ZWJvb2tDZWxscyhlZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvciwgcmFuZ2U6IElDZWxsUmFuZ2UsIGRpcmVjdGlvbjogJ2Fib3ZlJyB8ICdiZWxvdycsIGNvbnN0cmFpbnQ/OiBDZWxsS2luZCk6IFByb21pc2U8eyBlZGl0czogUmVzb3VyY2VFZGl0W107IGNlbGw6IElDZWxsVmlld01vZGVsOyBlbmRGb2N1czogSUNlbGxSYW5nZTsgZW5kU2VsZWN0aW9uczogSUNlbGxSYW5nZVtdIH0gfCBudWxsPiB7XG5cdGlmIChlZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0Y29uc3QgY2VsbHMgPSBlZGl0b3IuZ2V0Q2VsbHNJblJhbmdlKHJhbmdlKTtcblxuXHRpZiAoIWNlbGxzLmxlbmd0aCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKHJhbmdlLnN0YXJ0ID09PSAwICYmIGRpcmVjdGlvbiA9PT0gJ2Fib3ZlJykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKHJhbmdlLmVuZCA9PT0gdGV4dE1vZGVsLmxlbmd0aCAmJiBkaXJlY3Rpb24gPT09ICdiZWxvdycpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBjZWxsID0gY2VsbHNbaV07XG5cblx0XHRpZiAoY29uc3RyYWludCAmJiBjZWxsLmNlbGxLaW5kICE9PSBjb25zdHJhaW50KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRpZiAoZGlyZWN0aW9uID09PSAnYWJvdmUnKSB7XG5cdFx0Y29uc3QgYWJvdmUgPSBlZGl0b3IuY2VsbEF0KHJhbmdlLnN0YXJ0IC0gMSkgYXMgQ2VsbFZpZXdNb2RlbDtcblx0XHRpZiAoY29uc3RyYWludCAmJiBhYm92ZS5jZWxsS2luZCAhPT0gY29uc3RyYWludCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0Q29udGVudCA9IGNlbGxzLm1hcChjZWxsID0+IChjZWxsLnRleHRCdWZmZXIuZ2V0RU9MKCkgPz8gJycpICsgY2VsbC5nZXRUZXh0KCkpLmpvaW4oJycpO1xuXHRcdGNvbnN0IGFib3ZlQ2VsbExpbmVDb3VudCA9IGFib3ZlLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgYWJvdmVDZWxsTGFzdExpbmVFbmRDb2x1bW4gPSBhYm92ZS50ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgoYWJvdmVDZWxsTGluZUNvdW50KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlZGl0czogW1xuXHRcdFx0XHRuZXcgUmVzb3VyY2VUZXh0RWRpdChhYm92ZS51cmksIHsgcmFuZ2U6IG5ldyBSYW5nZShhYm92ZUNlbGxMaW5lQ291bnQsIGFib3ZlQ2VsbExhc3RMaW5lRW5kQ29sdW1uICsgMSwgYWJvdmVDZWxsTGluZUNvdW50LCBhYm92ZUNlbGxMYXN0TGluZUVuZENvbHVtbiArIDEpLCB0ZXh0OiBpbnNlcnRDb250ZW50IH0pLFxuXHRcdFx0XHRuZXcgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KHRleHRNb2RlbC51cmksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdFx0aW5kZXg6IHJhbmdlLnN0YXJ0LFxuXHRcdFx0XHRcdFx0Y291bnQ6IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0LFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpXG5cdFx0XHRdLFxuXHRcdFx0Y2VsbDogYWJvdmUsXG5cdFx0XHRlbmRGb2N1czogeyBzdGFydDogcmFuZ2Uuc3RhcnQgLSAxLCBlbmQ6IHJhbmdlLnN0YXJ0IH0sXG5cdFx0XHRlbmRTZWxlY3Rpb25zOiBbeyBzdGFydDogcmFuZ2Uuc3RhcnQgLSAxLCBlbmQ6IHJhbmdlLnN0YXJ0IH1dXG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBiZWxvdyA9IGVkaXRvci5jZWxsQXQocmFuZ2UuZW5kKSBhcyBDZWxsVmlld01vZGVsO1xuXHRcdGlmIChjb25zdHJhaW50ICYmIGJlbG93LmNlbGxLaW5kICE9PSBjb25zdHJhaW50KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsID0gY2VsbHNbMF07XG5cdFx0Y29uc3QgcmVzdENlbGxzID0gWy4uLmNlbGxzLnNsaWNlKDEpLCBiZWxvd107XG5cdFx0Y29uc3QgaW5zZXJ0Q29udGVudCA9IHJlc3RDZWxscy5tYXAoY2wgPT4gKGNsLnRleHRCdWZmZXIuZ2V0RU9MKCkgPz8gJycpICsgY2wuZ2V0VGV4dCgpKS5qb2luKCcnKTtcblxuXHRcdGNvbnN0IGNlbGxMaW5lQ291bnQgPSBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgY2VsbExhc3RMaW5lRW5kQ29sdW1uID0gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgoY2VsbExpbmVDb3VudCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdHM6IFtcblx0XHRcdFx0bmV3IFJlc291cmNlVGV4dEVkaXQoY2VsbC51cmksIHsgcmFuZ2U6IG5ldyBSYW5nZShjZWxsTGluZUNvdW50LCBjZWxsTGFzdExpbmVFbmRDb2x1bW4gKyAxLCBjZWxsTGluZUNvdW50LCBjZWxsTGFzdExpbmVFbmRDb2x1bW4gKyAxKSwgdGV4dDogaW5zZXJ0Q29udGVudCB9KSxcblx0XHRcdFx0bmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCh0ZXh0TW9kZWwudXJpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRcdGluZGV4OiByYW5nZS5zdGFydCArIDEsXG5cdFx0XHRcdFx0XHRjb3VudDogcmFuZ2UuZW5kIC0gcmFuZ2Uuc3RhcnQsXG5cdFx0XHRcdFx0XHRjZWxsczogW11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdClcblx0XHRcdF0sXG5cdFx0XHRjZWxsLFxuXHRcdFx0ZW5kRm9jdXM6IHsgc3RhcnQ6IHJhbmdlLnN0YXJ0LCBlbmQ6IHJhbmdlLnN0YXJ0ICsgMSB9LFxuXHRcdFx0ZW5kU2VsZWN0aW9uczogW3sgc3RhcnQ6IHJhbmdlLnN0YXJ0LCBlbmQ6IHJhbmdlLnN0YXJ0ICsgMSB9XVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGpvaW5DZWxsc1dpdGhTdXJyb3VuZHMoYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCwgZGlyZWN0aW9uOiAnYWJvdmUnIHwgJ2JlbG93Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuZ2V0Vmlld01vZGVsKCkgYXMgTm90ZWJvb2tWaWV3TW9kZWw7XG5cdGxldCByZXQ6IHtcblx0XHRlZGl0czogUmVzb3VyY2VFZGl0W107XG5cdFx0Y2VsbDogSUNlbGxWaWV3TW9kZWw7XG5cdFx0ZW5kRm9jdXM6IElDZWxsUmFuZ2U7XG5cdFx0ZW5kU2VsZWN0aW9uczogSUNlbGxSYW5nZVtdO1xuXHR9IHwgbnVsbCA9IG51bGw7XG5cblx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRjb25zdCBmb2N1c01vZGUgPSBjb250ZXh0LmNlbGwuZm9jdXNNb2RlO1xuXHRcdGNvbnN0IGNlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoY29udGV4dC5jZWxsKTtcblx0XHRyZXQgPSBhd2FpdCBqb2luTm90ZWJvb2tDZWxscyhlZGl0b3IsIHsgc3RhcnQ6IGNlbGxJbmRleCwgZW5kOiBjZWxsSW5kZXggKyAxIH0sIGRpcmVjdGlvbik7XG5cdFx0aWYgKCFyZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoXG5cdFx0XHRyZXQ/LmVkaXRzLFxuXHRcdFx0eyBxdW90YWJsZUxhYmVsOiAnSm9pbiBOb3RlYm9vayBDZWxscycgfVxuXHRcdCk7XG5cdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHJldC5lbmRGb2N1cywgc2VsZWN0aW9uczogcmV0LmVuZFNlbGVjdGlvbnMgfSk7XG5cdFx0cmV0LmNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ2pvaW5DZWxsc1dpdGhTdXJyb3VuZHMnKTtcblx0XHRlZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KGVkaXRvci5nZXRGb2N1cygpKTtcblx0XHRpZiAoZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvcikge1xuXHRcdFx0cmV0LmNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5FZGl0b3I7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmICghc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IGVkaXRvci5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IGZvY3VzTW9kZSA9IGVkaXRvci5jZWxsQXQoZm9jdXMuc3RhcnQpPy5mb2N1c01vZGU7XG5cblx0XHRjb25zdCBlZGl0czogUmVzb3VyY2VFZGl0W10gPSBbXTtcblx0XHRsZXQgY2VsbDogSUNlbGxWaWV3TW9kZWwgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBjZWxsczogSUNlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IHNlbGVjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRjb25zdCBjb250YWluRm9jdXMgPSBjZWxsUmFuZ2VDb250YWlucyhzZWxlY3Rpb24sIGZvY3VzKTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRzZWxlY3Rpb24uZW5kID49IHRleHRNb2RlbC5sZW5ndGggJiYgZGlyZWN0aW9uID09PSAnYmVsb3cnXG5cdFx0XHRcdHx8IHNlbGVjdGlvbi5zdGFydCA9PT0gMCAmJiBkaXJlY3Rpb24gPT09ICdhYm92ZSdcblx0XHRcdCkge1xuXHRcdFx0XHRpZiAoY29udGFpbkZvY3VzKSB7XG5cdFx0XHRcdFx0Y2VsbCA9IGVkaXRvci5jZWxsQXQoZm9jdXMuc3RhcnQpITtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNlbGxzLnB1c2goLi4uZWRpdG9yLmdldENlbGxzSW5SYW5nZShzZWxlY3Rpb24pKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNpbmdsZVJldCA9IGF3YWl0IGpvaW5Ob3RlYm9va0NlbGxzKGVkaXRvciwgc2VsZWN0aW9uLCBkaXJlY3Rpb24pO1xuXG5cdFx0XHRpZiAoIXNpbmdsZVJldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRzLnB1c2goLi4uc2luZ2xlUmV0LmVkaXRzKTtcblx0XHRcdGNlbGxzLnB1c2goc2luZ2xlUmV0LmNlbGwpO1xuXG5cdFx0XHRpZiAoY29udGFpbkZvY3VzKSB7XG5cdFx0XHRcdGNlbGwgPSBzaW5nbGVSZXQuY2VsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWVkaXRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghY2VsbCB8fCAhY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFxuXHRcdFx0ZWRpdHMsXG5cdFx0XHR7IHF1b3RhYmxlTGFiZWw6ICdKb2luIE5vdGVib29rIENlbGxzJyB9XG5cdFx0KTtcblxuXHRcdGNlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdqb2luQ2VsbHNXaXRoU3Vycm91bmRzJyk7XG5cdFx0fSk7XG5cblx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSwgcHJpbWFyeTogY2VsbC5oYW5kbGUsIHNlbGVjdGlvbnM6IGNlbGxzLm1hcChjZWxsID0+IGNlbGwuaGFuZGxlKSB9KTtcblx0XHRlZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KGVkaXRvci5nZXRGb2N1cygpKTtcblx0XHRjb25zdCBuZXdGb2N1c2VkQ2VsbCA9IGVkaXRvci5jZWxsQXQoZWRpdG9yLmdldEZvY3VzKCkuc3RhcnQpO1xuXHRcdGlmIChmb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yICYmIG5ld0ZvY3VzZWRDZWxsKSB7XG5cdFx0XHRuZXdGb2N1c2VkQ2VsbC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkVkaXRvcjtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gX3NwbGl0UG9pbnRzVG9Cb3VuZGFyaWVzKHNwbGl0UG9pbnRzOiBJUG9zaXRpb25bXSwgdGV4dEJ1ZmZlcjogSVJlYWRvbmx5VGV4dEJ1ZmZlcik6IElQb3NpdGlvbltdIHwgbnVsbCB7XG5cdGNvbnN0IGJvdW5kYXJpZXM6IElQb3NpdGlvbltdID0gW107XG5cdGNvbnN0IGxpbmVDbnQgPSB0ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRjb25zdCBnZXRMaW5lTGVuID0gKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdHJldHVybiB0ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdH07XG5cblx0Ly8gc3BsaXQgcG9pbnRzIG5lZWQgdG8gYmUgc29ydGVkXG5cdHNwbGl0UG9pbnRzID0gc3BsaXRQb2ludHMuc29ydCgobCwgcikgPT4ge1xuXHRcdGNvbnN0IGxpbmVEaWZmID0gbC5saW5lTnVtYmVyIC0gci5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvbHVtbkRpZmYgPSBsLmNvbHVtbiAtIHIuY29sdW1uO1xuXHRcdHJldHVybiBsaW5lRGlmZiAhPT0gMCA/IGxpbmVEaWZmIDogY29sdW1uRGlmZjtcblx0fSk7XG5cblx0Zm9yIChsZXQgc3Agb2Ygc3BsaXRQb2ludHMpIHtcblx0XHRpZiAoZ2V0TGluZUxlbihzcC5saW5lTnVtYmVyKSArIDEgPT09IHNwLmNvbHVtbiAmJiBzcC5jb2x1bW4gIT09IDEgLyoqIGVtcHR5IGxpbmUgKi8gJiYgc3AubGluZU51bWJlciA8IGxpbmVDbnQpIHtcblx0XHRcdHNwID0gbmV3IFBvc2l0aW9uKHNwLmxpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHR9XG5cdFx0X3B1c2hJZkFic2VudChib3VuZGFyaWVzLCBzcCk7XG5cdH1cblxuXHRpZiAoYm91bmRhcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIGJvdW5kYXJpZXMgYWxyZWFkeSBzb3J0ZWQgYW5kIG5vdCBlbXB0eVxuXHRjb25zdCBtb2RlbFN0YXJ0ID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRjb25zdCBtb2RlbEVuZCA9IG5ldyBQb3NpdGlvbihsaW5lQ250LCBnZXRMaW5lTGVuKGxpbmVDbnQpICsgMSk7XG5cdHJldHVybiBbbW9kZWxTdGFydCwgLi4uYm91bmRhcmllcywgbW9kZWxFbmRdO1xufVxuXG5mdW5jdGlvbiBfcHVzaElmQWJzZW50KHBvc2l0aW9uczogSVBvc2l0aW9uW10sIHA6IElQb3NpdGlvbikge1xuXHRjb25zdCBsYXN0ID0gcG9zaXRpb25zLmxlbmd0aCA+IDAgPyBwb3NpdGlvbnNbcG9zaXRpb25zLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXHRpZiAoIWxhc3QgfHwgbGFzdC5saW5lTnVtYmVyICE9PSBwLmxpbmVOdW1iZXIgfHwgbGFzdC5jb2x1bW4gIT09IHAuY29sdW1uKSB7XG5cdFx0cG9zaXRpb25zLnB1c2gocCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVDZWxsTGluZXNDb250ZW50cyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgc3BsaXRQb2ludHM6IElQb3NpdGlvbltdKTogc3RyaW5nW10gfCBudWxsIHtcblx0Y29uc3QgcmFuZ2VCb3VuZGFyaWVzID0gX3NwbGl0UG9pbnRzVG9Cb3VuZGFyaWVzKHNwbGl0UG9pbnRzLCBjZWxsLnRleHRCdWZmZXIpO1xuXHRpZiAoIXJhbmdlQm91bmRhcmllcykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGNvbnN0IG5ld0xpbmVNb2RlbHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAobGV0IGkgPSAxOyBpIDwgcmFuZ2VCb3VuZGFyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3Qgc3RhcnQgPSByYW5nZUJvdW5kYXJpZXNbaSAtIDFdO1xuXHRcdGNvbnN0IGVuZCA9IHJhbmdlQm91bmRhcmllc1tpXTtcblxuXHRcdG5ld0xpbmVNb2RlbHMucHVzaChjZWxsLnRleHRCdWZmZXIuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShzdGFydC5saW5lTnVtYmVyLCBzdGFydC5jb2x1bW4sIGVuZC5saW5lTnVtYmVyLCBlbmQuY29sdW1uKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCkpO1xuXHR9XG5cblx0cmV0dXJuIG5ld0xpbmVNb2RlbHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRDZWxsKFxuXHRsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yLFxuXHRpbmRleDogbnVtYmVyLFxuXHR0eXBlOiBDZWxsS2luZCxcblx0ZGlyZWN0aW9uOiAnYWJvdmUnIHwgJ2JlbG93JyA9ICdhYm92ZScsXG5cdGluaXRpYWxUZXh0OiBzdHJpbmcgPSAnJyxcblx0dWk6IGJvb2xlYW4gPSBmYWxzZSxcblx0a2VybmVsSGlzdG9yeVNlcnZpY2U/OiBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZVxuKSB7XG5cdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5nZXRWaWV3TW9kZWwoKSBhcyBOb3RlYm9va1ZpZXdNb2RlbDtcblx0Y29uc3QgYWN0aXZlS2VybmVsID0gZWRpdG9yLmFjdGl2ZUtlcm5lbDtcblx0aWYgKHZpZXdNb2RlbC5vcHRpb25zLmlzUmVhZE9ubHkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGNlbGwgPSBlZGl0b3IuY2VsbEF0KGluZGV4KTtcblx0Y29uc3QgbmV4dEluZGV4ID0gdWkgPyB2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoaW5kZXgpIDogaW5kZXggKyAxO1xuXHRsZXQgbGFuZ3VhZ2U7XG5cdGlmICh0eXBlID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0Y29uc3Qgc3VwcG9ydGVkTGFuZ3VhZ2VzID0gYWN0aXZlS2VybmVsPy5zdXBwb3J0ZWRMYW5ndWFnZXMgPz8gbGFuZ3VhZ2VTZXJ2aWNlLmdldFJlZ2lzdGVyZWRMYW5ndWFnZUlkcygpO1xuXHRcdGNvbnN0IGRlZmF1bHRMYW5ndWFnZSA9IHN1cHBvcnRlZExhbmd1YWdlc1swXSB8fCBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cblx0XHRpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdGxhbmd1YWdlID0gY2VsbC5sYW5ndWFnZTtcblx0XHR9IGVsc2UgaWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdGNvbnN0IG5lYXJlc3RDb2RlQ2VsbEluZGV4ID0gdmlld01vZGVsLm5lYXJlc3RDb2RlQ2VsbEluZGV4KGluZGV4KTtcblx0XHRcdGlmIChuZWFyZXN0Q29kZUNlbGxJbmRleCA+IC0xKSB7XG5cdFx0XHRcdGxhbmd1YWdlID0gdmlld01vZGVsLmNlbGxBdChuZWFyZXN0Q29kZUNlbGxJbmRleCkhLmxhbmd1YWdlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFuZ3VhZ2UgPSBkZWZhdWx0TGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghY2VsbCAmJiB2aWV3TW9kZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBObyBjZWxscyBpbiBub3RlYm9vayAtIGNoZWNrIGtlcm5lbCBoaXN0b3J5XG5cdFx0XHRjb25zdCBsYXN0S2VybmVscyA9IGtlcm5lbEhpc3RvcnlTZXJ2aWNlPy5nZXRLZXJuZWxzKHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50KTtcblx0XHRcdGlmIChsYXN0S2VybmVscz8uYWxsLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBsYXN0S2VybmVsID0gbGFzdEtlcm5lbHMuYWxsWzBdO1xuXHRcdFx0XHRsYW5ndWFnZSA9IGxhc3RLZXJuZWwuc3VwcG9ydGVkTGFuZ3VhZ2VzWzBdIHx8IGRlZmF1bHRMYW5ndWFnZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhbmd1YWdlID0gZGVmYXVsdExhbmd1YWdlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoY2VsbCA9PT0gdW5kZWZpbmVkICYmIGRpcmVjdGlvbiA9PT0gJ2Fib3ZlJykge1xuXHRcdFx0XHQvLyBpbnNlcnQgY2VsbCBhdCB0aGUgdmVyeSB0b3Bcblx0XHRcdFx0bGFuZ3VhZ2UgPSB2aWV3TW9kZWwudmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKT8ubGFuZ3VhZ2UgfHwgZGVmYXVsdExhbmd1YWdlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFuZ3VhZ2UgPSBkZWZhdWx0TGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFzdXBwb3J0ZWRMYW5ndWFnZXMuaW5jbHVkZXMobGFuZ3VhZ2UpKSB7XG5cdFx0XHQvLyB0aGUgbGFuZ3VhZ2Ugbm8gbG9uZ2VyIGV4aXN0c1xuXHRcdFx0bGFuZ3VhZ2UgPSBkZWZhdWx0TGFuZ3VhZ2U7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGxhbmd1YWdlID0gJ21hcmtkb3duJztcblx0fVxuXG5cdGNvbnN0IGluc2VydEluZGV4ID0gY2VsbCA/XG5cdFx0KGRpcmVjdGlvbiA9PT0gJ2Fib3ZlJyA/IGluZGV4IDogbmV4dEluZGV4KSA6XG5cdFx0aW5kZXg7XG5cdHJldHVybiBpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIGluc2VydEluZGV4LCBpbml0aWFsVGV4dCwgbGFuZ3VhZ2UsIHR5cGUsIHVuZGVmaW5lZCwgW10sIHRydWUsIHRydWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgc291cmNlOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcsIHR5cGU6IENlbGxLaW5kLCBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEgfCB1bmRlZmluZWQsIG91dHB1dHM6IElPdXRwdXREdG9bXSwgc3luY2hyb25vdXM6IGJvb2xlYW4sIHB1c2hVbmRvU3RvcDogYm9vbGVhbik6IENlbGxWaWV3TW9kZWwge1xuXHRjb25zdCBlbmRTZWxlY3Rpb25zOiBJU2VsZWN0aW9uU3RhdGUgPSB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IGluZGV4LCBlbmQ6IGluZGV4ICsgMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogaW5kZXgsIGVuZDogaW5kZXggKyAxIH1dIH07XG5cdHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50LmFwcGx5RWRpdHMoW1xuXHRcdHtcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdGluZGV4LFxuXHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRjZWxsczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IHR5cGUsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxuXHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvdXRwdXRzOiBvdXRwdXRzLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YSxcblx0XHRcdFx0XHRzb3VyY2U6IHNvdXJjZVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHRdLCBzeW5jaHJvbm91cywgeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogdmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSB9LCAoKSA9PiBlbmRTZWxlY3Rpb25zLCB1bmRlZmluZWQsIHB1c2hVbmRvU3RvcCAmJiAhdmlld01vZGVsLm9wdGlvbnMuaXNSZWFkT25seSk7XG5cdHJldHVybiB2aWV3TW9kZWwuY2VsbEF0KGluZGV4KSE7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUF5Qyx3QkFBd0I7QUFDakUsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDJCQUFnRDtBQUN6RCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLGVBQWUsZUFBZSx1Q0FBOEU7QUFFckgsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxjQUFjLFVBQW1HLDBCQUEwQjtBQUNwSixTQUFTLG1CQUFtQiwyQkFBdUM7QUFDbkUsU0FBUyxnQkFBZ0I7QUFJekIsZUFBc0IsaUJBQWlCLE1BQWdCLFNBQWlDLFVBQW1CLE1BQThCO0FBQ3hJLFFBQU0sRUFBRSxlQUFlLElBQUk7QUFDM0IsTUFBSSxDQUFDLGVBQWUsU0FBUyxHQUFHO0FBQy9CO0FBQUEsRUFDRDtBQUVBLE1BQUksZUFBZSxZQUFZO0FBQzlCO0FBQUEsRUFDRDtBQUVBLE1BQUksUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUUvQixVQUFNLEVBQUUsS0FBSyxJQUFJO0FBRWpCLFFBQUksS0FBSyxhQUFhLE1BQU07QUFDM0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxPQUFPLEtBQUssUUFBUTtBQUMxQixVQUFNLE1BQU0sZUFBZSxhQUFhLElBQUk7QUFFNUMsUUFBSSxhQUFhLFFBQVc7QUFDM0IsWUFBTSxxQkFBcUIsZUFBZSxjQUFjLHNCQUFzQixDQUFDO0FBQy9FLGlCQUFXLG1CQUFtQixDQUFDLEtBQUs7QUFBQSxJQUNyQztBQUVBLG1C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
