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
import { localize } from "../../../../../../nls.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { EditorConfiguration } from "../../../../../../editor/browser/config/editorConfiguration.js";
import { CoreEditingCommands } from "../../../../../../editor/browser/coreCommands.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { cursorBlinkingStyleFromString, cursorStyleFromString, TextEditorCursorBlinkingStyle, TextEditorCursorStyle } from "../../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Selection, SelectionDirection } from "../../../../../../editor/common/core/selection.js";
import { USUAL_WORD_SEPARATORS } from "../../../../../../editor/common/core/wordHelper.js";
import { CommandExecutor, CursorsController } from "../../../../../../editor/common/cursor/cursor.js";
import { DeleteOperations } from "../../../../../../editor/common/cursor/cursorDeleteOperations.js";
import { CursorConfiguration } from "../../../../../../editor/common/cursorCommon.js";
import { CursorChangeReason } from "../../../../../../editor/common/cursorEvents.js";
import { Handler } from "../../../../../../editor/common/editorCommon.js";
import { ILanguageConfigurationService } from "../../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { indentOfLine } from "../../../../../../editor/common/model/textModel.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { ViewModelEventsCollector } from "../../../../../../editor/common/viewModelEventDispatcher.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../../../../platform/undoRedo/common/undoRedo.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { NotebookAction } from "../../controller/coreActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CellEditorOptions } from "../../view/cellParts/cellEditorOptions.js";
import { NotebookFindContrib } from "../find/notebookFindWidget.js";
import { NotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = "notebook.addFindMatchToSelection";
const NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID = "notebook.selectAllFindMatches";
var NotebookMultiCursorState = /* @__PURE__ */ ((NotebookMultiCursorState2) => {
  NotebookMultiCursorState2[NotebookMultiCursorState2["Idle"] = 0] = "Idle";
  NotebookMultiCursorState2[NotebookMultiCursorState2["Selecting"] = 1] = "Selecting";
  NotebookMultiCursorState2[NotebookMultiCursorState2["Editing"] = 2] = "Editing";
  return NotebookMultiCursorState2;
})(NotebookMultiCursorState || {});
const NOTEBOOK_MULTI_CURSOR_CONTEXT = {
  IsNotebookMultiCursor: new RawContextKey("isNotebookMultiSelect", false),
  NotebookMultiSelectCursorState: new RawContextKey("notebookMultiSelectCursorState", 0 /* Idle */)
};
let NotebookMultiCursorController = class extends Disposable {
  constructor(notebookEditor, contextKeyService, textModelService, languageConfigurationService, accessibilityService, configurationService, undoRedoService) {
    super();
    this.notebookEditor = notebookEditor;
    this.contextKeyService = contextKeyService;
    this.textModelService = textModelService;
    this.languageConfigurationService = languageConfigurationService;
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.undoRedoService = undoRedoService;
    this.word = "";
    this.trackedCells = [];
    this.totalMatchesCount = 0;
    this._onDidChangeAnchorCell = this._register(new Emitter());
    this.onDidChangeAnchorCell = this._onDidChangeAnchorCell.event;
    this.anchorDisposables = this._register(new DisposableStore());
    this.cursorsDisposables = this._register(new DisposableStore());
    this.cursorsControllers = new ResourceMap();
    this.state = 0 /* Idle */;
    this._nbIsMultiSelectSession = NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor.bindTo(this.contextKeyService);
    this._nbMultiSelectState = NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.bindTo(this.contextKeyService);
    this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
    this._register(this.onDidChangeAnchorCell(async () => {
      await this.syncCursorsControllers();
      this.syncAnchorListeners();
    }));
  }
  getState() {
    return this.state;
  }
  syncAnchorListeners() {
    this.anchorDisposables.clear();
    if (!this.anchorCell) {
      throw new Error("Anchor cell is undefined");
    }
    this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
      const collector = new ViewModelEventsCollector();
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
          controller.type(collector, input, "keyboard");
        }
      });
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidType(() => {
      this.state = 2 /* Editing */;
      this._nbMultiSelectState.set(2 /* Editing */);
      const anchorController = this.cursorsControllers.get(this.anchorCell[0].uri);
      if (!anchorController) {
        return;
      }
      const activeSelections = this.notebookEditor.activeCodeEditor?.getSelections();
      if (!activeSelections) {
        return;
      }
      anchorController.setSelections(new ViewModelEventsCollector(), "keyboard", activeSelections, CursorChangeReason.Explicit);
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        cell.initialSelection = controller.getSelection();
        cell.matchSelections = [];
      });
      this.updateLazyDecorations();
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorSelection((e) => {
      if (e.source === "mouse") {
        this.resetToIdleState();
        return;
      }
      if (!e.oldSelections || e.reason === CursorChangeReason.NotSet || e.reason === CursorChangeReason.RecoverFromMarkers) {
        return;
      }
      const translation = {
        deltaStartCol: e.selection.startColumn - e.oldSelections[0].startColumn,
        deltaStartLine: e.selection.startLineNumber - e.oldSelections[0].startLineNumber,
        deltaEndCol: e.selection.endColumn - e.oldSelections[0].endColumn,
        deltaEndLine: e.selection.endLineNumber - e.oldSelections[0].endLineNumber
      };
      const translationDir = e.selection.getDirection();
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        const newSelections = controller.getSelections().map((selection) => {
          const newStartCol = selection.startColumn + translation.deltaStartCol;
          const newStartLine = selection.startLineNumber + translation.deltaStartLine;
          const newEndCol = selection.endColumn + translation.deltaEndCol;
          const newEndLine = selection.endLineNumber + translation.deltaEndLine;
          return Selection.createWithDirection(newStartLine, newStartCol, newEndLine, newEndCol, translationDir);
        });
        controller.setSelections(new ViewModelEventsCollector(), e.source, newSelections, CursorChangeReason.Explicit);
      });
      this.updateLazyDecorations();
    }));
    this.anchorDisposables.add(this.anchorCell[1].onWillTriggerEditorOperationEvent((e) => {
      this.handleEditorOperationEvent(e);
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidBlurEditorWidget(() => {
      if (this.state === 1 /* Selecting */ || this.state === 2 /* Editing */) {
        this.resetToIdleState();
      }
    }));
  }
  async syncCursorsControllers() {
    this.cursorsDisposables.clear();
    await Promise.all(this.trackedCells.map(async (cell) => {
      const controller = await this.createCursorController(cell);
      if (!controller) {
        return;
      }
      this.cursorsControllers.set(cell.cellViewModel.uri, controller);
      const selections = cell.matchSelections;
      controller.setSelections(new ViewModelEventsCollector(), void 0, selections, CursorChangeReason.Explicit);
    }));
    this.updateLazyDecorations();
  }
  async createCursorController(cell) {
    const textModelRef = await this.textModelService.createModelReference(cell.cellViewModel.uri);
    const textModel = textModelRef.object.textEditorModel;
    if (!textModel) {
      textModelRef.dispose();
      return void 0;
    }
    this.cursorsDisposables.add(textModelRef);
    const cursorSimpleModel = this.constructCursorSimpleModel(cell.cellViewModel);
    const converter = this.constructCoordinatesConverter();
    const editorConfig = cell.editorConfig;
    const controller = this.cursorsDisposables.add(new CursorsController(
      textModel,
      cursorSimpleModel,
      converter,
      new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
    ));
    controller.setSelections(new ViewModelEventsCollector(), void 0, cell.matchSelections, CursorChangeReason.Explicit);
    return controller;
  }
  constructCoordinatesConverter() {
    return {
      convertViewPositionToModelPosition(viewPosition) {
        return viewPosition;
      },
      convertViewRangeToModelRange(viewRange) {
        return viewRange;
      },
      validateViewPosition(viewPosition, expectedModelPosition) {
        return viewPosition;
      },
      validateViewRange(viewRange, expectedModelRange) {
        return viewRange;
      },
      convertModelPositionToViewPosition(modelPosition, affinity, allowZeroLineNumber, belowHiddenRanges) {
        return modelPosition;
      },
      convertModelRangeToViewRange(modelRange, affinity) {
        return modelRange;
      },
      modelPositionIsVisible(modelPosition) {
        return true;
      },
      getModelLineViewLineCount(modelLineNumber) {
        return 1;
      },
      getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
        return modelLineNumber;
      }
    };
  }
  constructCursorSimpleModel(cell) {
    return {
      getLineCount() {
        return cell.textBuffer.getLineCount();
      },
      getLineContent(lineNumber) {
        return cell.textBuffer.getLineContent(lineNumber);
      },
      getLineMinColumn(lineNumber) {
        return cell.textBuffer.getLineMinColumn(lineNumber);
      },
      getLineMaxColumn(lineNumber) {
        return cell.textBuffer.getLineMaxColumn(lineNumber);
      },
      getLineFirstNonWhitespaceColumn(lineNumber) {
        return cell.textBuffer.getLineFirstNonWhitespaceColumn(lineNumber);
      },
      getLineLastNonWhitespaceColumn(lineNumber) {
        return cell.textBuffer.getLineLastNonWhitespaceColumn(lineNumber);
      },
      normalizePosition(position, affinity) {
        return position;
      },
      getLineIndentColumn(lineNumber) {
        return indentOfLine(cell.textBuffer.getLineContent(lineNumber)) + 1;
      }
    };
  }
  handleEditorOperationEvent(e) {
    this.trackedCells.forEach((cell) => {
      if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
        return;
      }
      const eventsCollector = new ViewModelEventsCollector();
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      this.executeEditorOperation(controller, eventsCollector, e);
    });
  }
  executeEditorOperation(controller, eventsCollector, e) {
    switch (e.handlerId) {
      case Handler.CompositionStart:
        controller.startComposition(eventsCollector);
        break;
      case Handler.CompositionEnd:
        controller.endComposition(eventsCollector, e.source);
        break;
      case Handler.ReplacePreviousChar: {
        const args = e.payload;
        controller.compositionType(eventsCollector, args.text || "", args.replaceCharCnt || 0, 0, 0, e.source);
        break;
      }
      case Handler.CompositionType: {
        const args = e.payload;
        controller.compositionType(eventsCollector, args.text || "", args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0, e.source);
        break;
      }
      case Handler.Paste: {
        const args = e.payload;
        controller.paste(eventsCollector, args.text || "", args.pasteOnNewLine || false, args.multicursorText || null, e.source);
        break;
      }
      case Handler.Cut:
        controller.cut(eventsCollector, e.source);
        break;
    }
  }
  updateViewModelSelections() {
    for (const cell of this.trackedCells) {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      cell.cellViewModel.setSelections(controller.getSelections());
    }
  }
  updateFinalUndoRedo() {
    const anchorCellModel = this.anchorCell?.[1].getModel();
    if (!anchorCellModel) {
      return;
    }
    const newElementsMap = new ResourceMap();
    const resources = [];
    this.trackedCells.forEach((trackedMatch) => {
      const undoRedoState = trackedMatch.undoRedoHistory;
      if (!undoRedoState) {
        return;
      }
      resources.push(trackedMatch.cellViewModel.uri);
      const currentPastElements = this.undoRedoService.getElements(trackedMatch.cellViewModel.uri).past.slice();
      const oldPastElements = trackedMatch.undoRedoHistory.past.slice();
      const newElements = currentPastElements.slice(oldPastElements.length);
      if (newElements.length === 0) {
        return;
      }
      newElementsMap.set(trackedMatch.cellViewModel.uri, newElements);
      this.undoRedoService.removeElements(trackedMatch.cellViewModel.uri);
      oldPastElements.forEach((element) => {
        this.undoRedoService.pushElement(element);
      });
    });
    this.undoRedoService.pushElement({
      type: UndoRedoElementType.Workspace,
      resources,
      label: "Multi Cursor Edit",
      code: "multiCursorEdit",
      confirmBeforeUndo: false,
      undo: async () => {
        newElementsMap.forEach(async (value) => {
          value.reverse().forEach(async (element) => {
            await element.undo();
          });
        });
      },
      redo: async () => {
        newElementsMap.forEach(async (value) => {
          value.forEach(async (element) => {
            await element.redo();
          });
        });
      }
    });
  }
  resetToIdleState() {
    this.state = 0 /* Idle */;
    this._nbMultiSelectState.set(0 /* Idle */);
    this._nbIsMultiSelectSession.set(false);
    this.updateFinalUndoRedo();
    this.trackedCells.forEach((cell) => {
      this.clearDecorations(cell);
      cell.cellViewModel.setSelections([cell.initialSelection]);
    });
    this.anchorDisposables.clear();
    this.anchorCell = void 0;
    this.cursorsDisposables.clear();
    this.cursorsControllers.clear();
    this.trackedCells = [];
    this.totalMatchesCount = 0;
    this.startPosition = void 0;
    this.word = "";
  }
  async findAndTrackNextSelection(focusedCell) {
    if (this.state === 0 /* Idle */) {
      const textModel = focusedCell.textModel;
      if (!textModel) {
        return;
      }
      const inputSelection = focusedCell.getSelections()[0];
      const word = this.getWord(inputSelection, textModel);
      if (!word) {
        return;
      }
      this.word = word.word;
      const notebookTextModel = this.notebookEditor.textModel;
      if (notebookTextModel) {
        const allMatches = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
        this.totalMatchesCount = allMatches.reduce((sum, cellMatch) => sum + cellMatch.matches.length, 0);
      }
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      this.startPosition = {
        cellIndex: index,
        position: new Position(inputSelection.startLineNumber, word.startColumn)
      };
      const newSelection = new Selection(
        inputSelection.startLineNumber,
        word.startColumn,
        inputSelection.startLineNumber,
        word.endColumn
      );
      focusedCell.setSelections([newSelection]);
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
        throw new Error("Active cell is not the same as the cell passed as context");
      }
      if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
        throw new Error("Active cell is not an instance of CodeEditorWidget");
      }
      await this.updateTrackedCell(focusedCell, [newSelection]);
      this._nbIsMultiSelectSession.set(true);
      this.state = 1 /* Selecting */;
      this._nbMultiSelectState.set(1 /* Selecting */);
      this._onDidChangeAnchorCell.fire();
    } else if (this.state === 1 /* Selecting */) {
      const notebookTextModel = this.notebookEditor.textModel;
      if (!notebookTextModel) {
        return;
      }
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      if (!this.startPosition) {
        return;
      }
      const totalSelections = this.trackedCells.reduce((sum, trackedCell) => sum + trackedCell.matchSelections.length, 0);
      if (totalSelections >= this.totalMatchesCount) {
        return;
      }
      const findResult = notebookTextModel.findNextMatch(
        this.word,
        { cellIndex: index, position: focusedCell.getSelections()[focusedCell.getSelections().length - 1].getEndPosition() },
        false,
        true,
        USUAL_WORD_SEPARATORS,
        this.startPosition
      );
      if (!findResult) {
        return;
      }
      const findResultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
      if (!findResultCellViewModel) {
        return;
      }
      if (findResult.cell.handle === focusedCell.handle) {
        const selections = [...focusedCell.getSelections(), Selection.fromRange(findResult.match.range, SelectionDirection.LTR)];
        const trackedCell = await this.updateTrackedCell(focusedCell, selections);
        findResultCellViewModel.setSelections(trackedCell.matchSelections);
      } else if (findResult.cell.handle !== focusedCell.handle) {
        await this.notebookEditor.revealRangeInViewAsync(findResultCellViewModel, findResult.match.range);
        await this.notebookEditor.focusNotebookCell(findResultCellViewModel, "editor");
        const trackedCell = await this.updateTrackedCell(findResultCellViewModel, [Selection.fromRange(findResult.match.range, SelectionDirection.LTR)]);
        findResultCellViewModel.setSelections(trackedCell.matchSelections);
        this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
        if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
          throw new Error("Active cell is not an instance of CodeEditorWidget");
        }
        this._onDidChangeAnchorCell.fire();
        this.initializeMultiSelectDecorations(this.trackedCells.find((trackedCell2) => trackedCell2.cellViewModel.handle === focusedCell.handle));
      }
    }
  }
  async selectAllMatches(focusedCell, matches) {
    const notebookTextModel = this.notebookEditor.textModel;
    if (!notebookTextModel) {
      return;
    }
    if (matches) {
      await this.handleFindWidgetSelectAllMatches(matches);
    } else {
      await this.handleCellEditorSelectAllMatches(notebookTextModel, focusedCell);
    }
    await this.syncCursorsControllers();
    this.syncAnchorListeners();
    this.updateLazyDecorations();
  }
  async handleFindWidgetSelectAllMatches(matches) {
    if (this.state !== 0 /* Idle */) {
      return;
    }
    if (!matches.length) {
      return;
    }
    await this.notebookEditor.focusNotebookCell(matches[0].cell, "editor");
    this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
    this.trackedCells = [];
    for (const match of matches) {
      this.updateTrackedCell(match.cell, match.contentMatches.map((match2) => Selection.fromRange(match2.range, SelectionDirection.LTR)));
      if (this.anchorCell && match.cell.handle === this.anchorCell[0].handle) {
        match.cell.setSelections(match.contentMatches.map((match2) => Selection.fromRange(match2.range, SelectionDirection.LTR)));
      }
    }
    this._nbIsMultiSelectSession.set(true);
    this.state = 1 /* Selecting */;
    this._nbMultiSelectState.set(1 /* Selecting */);
  }
  async handleCellEditorSelectAllMatches(notebookTextModel, focusedCell) {
    if (this.state === 0 /* Idle */) {
      const textModel = focusedCell.textModel;
      if (!textModel) {
        return;
      }
      const inputSelection = focusedCell.getSelections()[0];
      const word = this.getWord(inputSelection, textModel);
      if (!word) {
        return;
      }
      this.word = word.word;
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      this.startPosition = {
        cellIndex: index,
        position: new Position(inputSelection.startLineNumber, word.startColumn)
      };
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
        throw new Error("Active cell is not the same as the cell passed as context");
      }
      if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
        throw new Error("Active cell is not an instance of CodeEditorWidget");
      }
      const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
      this.trackedCells = [];
      for (const res of findResults) {
        await this.updateTrackedCell(res.cell, res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
        if (res.cell.handle === focusedCell.handle) {
          const cellViewModel = this.notebookEditor.getCellByHandle(res.cell.handle);
          if (cellViewModel) {
            cellViewModel.setSelections(res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
          }
        }
      }
      this._nbIsMultiSelectSession.set(true);
      this.state = 1 /* Selecting */;
      this._nbMultiSelectState.set(1 /* Selecting */);
    } else if (this.state === 1 /* Selecting */) {
      const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
      for (const res of findResults) {
        await this.updateTrackedCell(res.cell, res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
      }
    }
  }
  async updateTrackedCell(cell, selections) {
    const cellViewModel = cell instanceof NotebookCellTextModel ? this.notebookEditor.getCellByHandle(cell.handle) : cell;
    if (!cellViewModel) {
      throw new Error("Cell not found");
    }
    let trackedMatch = this.trackedCells.find((trackedCell) => trackedCell.cellViewModel.handle === cellViewModel.handle);
    if (trackedMatch) {
      this.clearDecorations(trackedMatch);
      trackedMatch.matchSelections = selections;
    } else {
      const initialSelection = cellViewModel.getSelections()[0];
      const textModel = await cellViewModel.resolveTextModel();
      textModel.pushStackElement();
      const editorConfig = this.constructCellEditorOptions(cellViewModel);
      const rawEditorOptions = editorConfig.getRawOptions();
      const cursorConfig = {
        cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle),
        cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking),
        cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation
      };
      trackedMatch = {
        cellViewModel,
        initialSelection,
        matchSelections: selections,
        editorConfig,
        cursorConfig,
        decorationIds: [],
        undoRedoHistory: this.undoRedoService.getElements(cellViewModel.uri)
      };
      this.trackedCells.push(trackedMatch);
    }
    return trackedMatch;
  }
  async deleteLeft() {
    this.trackedCells.forEach((cell) => {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const [, commands] = DeleteOperations.deleteLeft(
        controller.getPrevEditOperationType(),
        controller.context.cursorConfig,
        controller.context.model,
        controller.getSelections(),
        controller.getAutoClosedCharacters()
      );
      const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
      if (!delSelections) {
        return;
      }
      controller.setSelections(new ViewModelEventsCollector(), void 0, delSelections, CursorChangeReason.Explicit);
    });
    this.updateLazyDecorations();
  }
  async deleteRight() {
    this.trackedCells.forEach((cell) => {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const [, commands] = DeleteOperations.deleteRight(
        controller.getPrevEditOperationType(),
        controller.context.cursorConfig,
        controller.context.model,
        controller.getSelections()
      );
      if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
        const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
        if (!delSelections) {
          return;
        }
        controller.setSelections(new ViewModelEventsCollector(), void 0, delSelections, CursorChangeReason.Explicit);
      } else {
        controller.setSelections(new ViewModelEventsCollector(), void 0, cell.cellViewModel.getSelections(), CursorChangeReason.Explicit);
      }
    });
    this.updateLazyDecorations();
  }
  async undo() {
    const models = [];
    for (const cell of this.trackedCells) {
      const model = await cell.cellViewModel.resolveTextModel();
      if (model) {
        models.push(model);
      }
    }
    await Promise.all(models.map((model) => model.undo()));
    this.updateViewModelSelections();
    this.updateLazyDecorations();
  }
  async redo() {
    const models = [];
    for (const cell of this.trackedCells) {
      const model = await cell.cellViewModel.resolveTextModel();
      if (model) {
        models.push(model);
      }
    }
    await Promise.all(models.map((model) => model.redo()));
    this.updateViewModelSelections();
    this.updateLazyDecorations();
  }
  constructCellEditorOptions(cell) {
    const cellEditorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this.configurationService);
    const options = cellEditorOptions.getUpdatedValue(cell.internalMetadata, cell.uri);
    cellEditorOptions.dispose();
    return new EditorConfiguration(false, MenuId.EditorContent, options, null, this.accessibilityService);
  }
  /**
   * Updates the multicursor selection decorations for a specific matched cell
   *
   * @param cell -- match object containing the viewmodel + selections
   */
  initializeMultiSelectDecorations(cell) {
    if (!cell) {
      return;
    }
    const decorations = [];
    cell.matchSelections.forEach((selection) => {
      decorations.push({
        range: Selection.fromPositions(selection.getEndPosition()),
        options: {
          description: "",
          className: this.getClassName(cell.cursorConfig, true)
        }
      });
    });
    cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
      cell.decorationIds,
      decorations
    );
  }
  updateLazyDecorations() {
    this.trackedCells.forEach((cell) => {
      if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
        return;
      }
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const selections = controller.getSelections();
      const newDecorations = [];
      selections?.map((selection) => {
        const isEmpty = selection.isEmpty();
        if (!isEmpty) {
          newDecorations.push({
            range: selection,
            options: {
              description: "",
              className: this.getClassName(cell.cursorConfig, false)
            }
          });
        }
        newDecorations.push({
          range: Selection.fromPositions(selection.getPosition()),
          options: {
            description: "",
            zIndex: 1e4,
            className: this.getClassName(cell.cursorConfig, true)
          }
        });
      });
      cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
        cell.decorationIds,
        newDecorations
      );
    });
  }
  clearDecorations(cell) {
    cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
      cell.decorationIds,
      []
    );
  }
  getWord(selection, model) {
    const lineNumber = selection.startLineNumber;
    const startColumn = selection.startColumn;
    if (model.isDisposed()) {
      return null;
    }
    return model.getWordAtPosition({
      lineNumber,
      column: startColumn
    });
  }
  getClassName(cursorConfig, isCursor) {
    let result = isCursor ? ".nb-multicursor-cursor" : ".nb-multicursor-selection";
    if (isCursor) {
      switch (cursorConfig.cursorStyle) {
        case TextEditorCursorStyle.Line:
          break;
        // default style, no additional class needed (handled by base css style)
        case TextEditorCursorStyle.Block:
          result += ".nb-cursor-block-style";
          break;
        case TextEditorCursorStyle.Underline:
          result += ".nb-cursor-underline-style";
          break;
        case TextEditorCursorStyle.LineThin:
          result += ".nb-cursor-line-thin-style";
          break;
        case TextEditorCursorStyle.BlockOutline:
          result += ".nb-cursor-block-outline-style";
          break;
        case TextEditorCursorStyle.UnderlineThin:
          result += ".nb-cursor-underline-thin-style";
          break;
        default:
          break;
      }
      switch (cursorConfig.cursorBlinking) {
        case TextEditorCursorBlinkingStyle.Blink:
          result += ".nb-blink";
          break;
        case TextEditorCursorBlinkingStyle.Smooth:
          result += ".nb-smooth";
          break;
        case TextEditorCursorBlinkingStyle.Phase:
          result += ".nb-phase";
          break;
        case TextEditorCursorBlinkingStyle.Expand:
          result += ".nb-expand";
          break;
        case TextEditorCursorBlinkingStyle.Solid:
          result += ".nb-solid";
          break;
        default:
          result += ".nb-solid";
          break;
      }
      if (cursorConfig.cursorSmoothCaretAnimation === "on" || cursorConfig.cursorSmoothCaretAnimation === "explicit") {
        result += ".nb-smooth-caret-animation";
      }
    }
    return result;
  }
  dispose() {
    super.dispose();
    this.anchorDisposables.dispose();
    this.cursorsDisposables.dispose();
    this.trackedCells.forEach((cell) => {
      this.clearDecorations(cell);
    });
    this.trackedCells = [];
  }
};
NotebookMultiCursorController.id = "notebook.multiCursorController";
NotebookMultiCursorController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IUndoRedoService)
], NotebookMultiCursorController);
class NotebookSelectAllFindMatches extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID,
      title: localize("selectAllFindMatches", "Select All Occurrences of Find Match"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true)
      ),
      keybinding: {
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(
            ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_CELL_EDITOR_FOCUSED
          ),
          ContextKeyExpr.and(
            ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
            KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED
          )
        ),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    if (!context.cell) {
      return;
    }
    const cursorController = editor.getContribution(NotebookMultiCursorController.id);
    const findController = editor.getContribution(NotebookFindContrib.id);
    if (findController.widget.isFocused) {
      const findModel = findController.widget.findModel;
      cursorController.selectAllMatches(context.cell, findModel.findMatches);
    } else {
      cursorController.selectAllMatches(context.cell);
    }
  }
}
class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
      title: localize("addFindMatchToSelection", "Add Selection to Next Find Match"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_CELL_EDITOR_FOCUSED
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_CELL_EDITOR_FOCUSED
        ),
        primary: KeyMod.CtrlCmd | KeyCode.KeyD,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    if (!context.cell) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.findAndTrackNextSelection(context.cell);
  }
}
class NotebookExitMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.exit",
      title: localize("exitMultiSelection", "Exit Multi Cursor Mode"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
        ),
        primary: KeyCode.Escape,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.resetToIdleState();
  }
}
class NotebookDeleteLeftMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.deleteLeft",
      title: localize("deleteLeftMultiSelection", "Delete Left"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
        ContextKeyExpr.or(
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
        )
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
          ContextKeyExpr.or(
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
          )
        ),
        primary: KeyCode.Backspace,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.deleteLeft();
  }
}
class NotebookDeleteRightMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.deleteRight",
      title: localize("deleteRightMultiSelection", "Delete Right"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
        ContextKeyExpr.or(
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
        )
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
          ContextKeyExpr.or(
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
          )
        ),
        primary: KeyCode.Delete,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const nbEditor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!nbEditor) {
      return;
    }
    const cellEditor = nbEditor.activeCodeEditor;
    if (!cellEditor) {
      return;
    }
    CoreEditingCommands.DeleteRight.runEditorCommand(accessor, cellEditor, null);
    const controller = nbEditor.getContribution(NotebookMultiCursorController.id);
    controller.deleteRight();
  }
}
let NotebookMultiCursorUndoRedoContribution = class extends Disposable {
  constructor(_editorService, configurationService) {
    super();
    this._editorService = _editorService;
    this.configurationService = configurationService;
    if (!this.configurationService.getValue("notebook.multiCursor.enabled")) {
      return;
    }
    const PRIORITY = 10005;
    this._register(UndoCommand.addImplementation(PRIORITY, "notebook-multicursor-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      if (!editor) {
        return false;
      }
      if (!editor.hasModel()) {
        return false;
      }
      const controller = editor.getContribution(NotebookMultiCursorController.id);
      return controller.undo();
    }, ContextKeyExpr.and(
      ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
      NOTEBOOK_IS_ACTIVE_EDITOR,
      NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
    )));
    this._register(RedoCommand.addImplementation(PRIORITY, "notebook-multicursor-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      if (!editor) {
        return false;
      }
      if (!editor.hasModel()) {
        return false;
      }
      const controller = editor.getContribution(NotebookMultiCursorController.id);
      return controller.redo();
    }, ContextKeyExpr.and(
      ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
      NOTEBOOK_IS_ACTIVE_EDITOR,
      NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
    )));
  }
};
NotebookMultiCursorUndoRedoContribution.ID = "workbench.contrib.notebook.multiCursorUndoRedo";
NotebookMultiCursorUndoRedoContribution = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService)
], NotebookMultiCursorUndoRedoContribution);
registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, WorkbenchPhase.BlockRestore);
registerAction2(NotebookSelectAllFindMatches);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerAction2(NotebookDeleteRightMultiSelectionAction);
export {
  NOTEBOOK_MULTI_CURSOR_CONTEXT,
  NotebookMultiCursorController,
  NotebookMultiCursorState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxtdWx0aWN1cnNvclxcbm90ZWJvb2tNdWx0aWN1cnNvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29yZUVkaXRpbmdDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvcmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgUGFzdGVQYXlsb2FkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBSZWRvQ29tbWFuZCwgVW5kb0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjdXJzb3JCbGlua2luZ1N0eWxlRnJvbVN0cmluZywgY3Vyc29yU3R5bGVGcm9tU3RyaW5nLCBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZSwgVGV4dEVkaXRvckN1cnNvclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kRXhlY3V0b3IsIEN1cnNvcnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3IvY3Vyc29yLmpzJztcbmltcG9ydCB7IERlbGV0ZU9wZXJhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2N1cnNvci9jdXJzb3JEZWxldGVPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbmZpZ3VyYXRpb24sIElDdXJzb3JTaW1wbGVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IENvbXBvc2l0aW9uVHlwZVBheWxvYWQsIEhhbmRsZXIsIElUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQsIFJlcGxhY2VQcmV2aW91c0NoYXJQYXlsb2FkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIFBvc2l0aW9uQWZmaW5pdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGluZGVudE9mTGluZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi92aWV3TW9kZWxFdmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUGFzdEZ1dHVyZUVsZW1lbnRzLCBJVW5kb1JlZG9FbGVtZW50LCBJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb0VsZW1lbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBLRVlCSU5ESU5HX0NPTlRFWFRfTk9URUJPT0tfRklORF9XSURHRVRfRk9DVVNFRCwgTk9URUJPT0tfQ0VMTF9FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIE5vdGVib29rQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRmluZE1hdGNoV2l0aEluZGV4LCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL3ZpZXcvY2VsbFBhcnRzL2NlbGxFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZENvbnRyaWIgfSBmcm9tICcuLi9maW5kL25vdGVib29rRmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElDb29yZGluYXRlc0NvbnZlcnRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29vcmRpbmF0ZXNDb252ZXJ0ZXIuanMnO1xuXG5jb25zdCBOT1RFQk9PS19BRERfRklORF9NQVRDSF9UT19TRUxFQ1RJT05fSUQgPSAnbm90ZWJvb2suYWRkRmluZE1hdGNoVG9TZWxlY3Rpb24nO1xuY29uc3QgTk9URUJPT0tfU0VMRUNUX0FMTF9GSU5EX01BVENIRVNfSUQgPSAnbm90ZWJvb2suc2VsZWN0QWxsRmluZE1hdGNoZXMnO1xuXG5leHBvcnQgZW51bSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUge1xuXHRJZGxlLFxuXHRTZWxlY3RpbmcsXG5cdEVkaXRpbmcsXG59XG5cbmludGVyZmFjZSBOb3RlYm9va0N1cnNvckNvbmZpZyB7XG5cdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGU7XG5cdGN1cnNvckJsaW5raW5nOiBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZTtcblx0Y3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb246ICdvZmYnIHwgJ2V4cGxpY2l0JyB8ICdvbic7XG59XG5cbmludGVyZmFjZSBTZWxlY3Rpb25UcmFuc2xhdGlvbiB7XG5cdGRlbHRhU3RhcnRDb2w6IG51bWJlcjtcblx0ZGVsdGFTdGFydExpbmU6IG51bWJlcjtcblx0ZGVsdGFFbmRDb2w6IG51bWJlcjtcblx0ZGVsdGFFbmRMaW5lOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBUcmFja2VkQ2VsbCB7XG5cdGNlbGxWaWV3TW9kZWw6IElDZWxsVmlld01vZGVsO1xuXHRpbml0aWFsU2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdG1hdGNoU2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cdGVkaXRvckNvbmZpZzogSUVkaXRvckNvbmZpZ3VyYXRpb247XG5cdGN1cnNvckNvbmZpZzogTm90ZWJvb2tDdXJzb3JDb25maWc7XG5cdGRlY29yYXRpb25JZHM6IHN0cmluZ1tdO1xuXHR1bmRvUmVkb0hpc3Rvcnk6IElQYXN0RnV0dXJlRWxlbWVudHM7XG59XG5cbmV4cG9ydCBjb25zdCBOT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVCA9IHtcblx0SXNOb3RlYm9va011bHRpQ3Vyc29yOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaXNOb3RlYm9va011bHRpU2VsZWN0JywgZmFsc2UpLFxuXHROb3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGU6IG5ldyBSYXdDb250ZXh0S2V5PE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZT4oJ25vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZScsIE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlKSxcbn07XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZDogc3RyaW5nID0gJ25vdGVib29rLm11bHRpQ3Vyc29yQ29udHJvbGxlcic7XG5cblx0cHJpdmF0ZSB3b3JkOiBzdHJpbmc7XG5cdHByaXZhdGUgc3RhcnRQb3NpdGlvbjoge1xuXHRcdGNlbGxJbmRleDogbnVtYmVyO1xuXHRcdHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0fSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmFja2VkQ2VsbHM6IFRyYWNrZWRDZWxsW107XG5cdHByaXZhdGUgdG90YWxNYXRjaGVzQ291bnQ6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFuY2hvckNlbGw7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQW5jaG9yQ2VsbDogRXZlbnQ8dm9pZD47XG5cdHByaXZhdGUgYW5jaG9yQ2VsbDogW0lDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcl0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhbmNob3JEaXNwb3NhYmxlcztcblx0cHJpdmF0ZSByZWFkb25seSBjdXJzb3JzRGlzcG9zYWJsZXM7XG5cdHByaXZhdGUgY3Vyc29yc0NvbnRyb2xsZXJzOiBSZXNvdXJjZU1hcDxDdXJzb3JzQ29udHJvbGxlcj47XG5cblx0cHJpdmF0ZSBzdGF0ZTogTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlO1xuXHRwdWJsaWMgZ2V0U3RhdGUoKTogTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX25iSXNNdWx0aVNlbGVjdFNlc3Npb247XG5cdHByaXZhdGUgX25iTXVsdGlTZWxlY3RTdGF0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy53b3JkID0gJyc7XG5cdFx0dGhpcy50cmFja2VkQ2VsbHMgPSBbXTtcblx0XHR0aGlzLnRvdGFsTWF0Y2hlc0NvdW50ID0gMDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFuY2hvckNlbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQW5jaG9yQ2VsbCA9IHRoaXMuX29uRGlkQ2hhbmdlQW5jaG9yQ2VsbC5ldmVudDtcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5jdXJzb3JzQ29udHJvbGxlcnMgPSBuZXcgUmVzb3VyY2VNYXA8Q3Vyc29yc0NvbnRyb2xsZXI+KCk7XG5cdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlO1xuXHRcdHRoaXMuX25iSXNNdWx0aVNlbGVjdFNlc3Npb24gPSBOT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX25iTXVsdGlTZWxlY3RTdGF0ZSA9IE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmFuY2hvckNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yO1xuXG5cdFx0Ly8gYW5jaG9yIGNlbGwgd2lsbCBjYXRjaCBhbmQgcmVsYXkgYWxsIHR5cGUsIGN1dCwgcGFzdGUgZXZlbnRzIHRvIHRoZSBjdXJzb3JzIGNvbnRyb2xsZXJzXG5cdFx0Ly8gbmVlZCB0byBjcmVhdGUgbmV3IGNvbnRyb2xsZXJzIHdoZW4gdGhlIGFuY2hvciBjZWxsIGNoYW5nZXMsIHRoZW4gdXBkYXRlIHRoZWlyIGxpc3RlbmVyc1xuXHRcdC8vICoqIGN1cnNvciBjb250cm9sbGVycyBuZWVkIHRvIGhhcHBlbiBmaXJzdCwgYmVjYXVzZSBhbmNob3IgbGlzdGVuZXJzIHJlbGF5IHRvIHRoZW1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQW5jaG9yQ2VsbChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnN5bmNDdXJzb3JzQ29udHJvbGxlcnMoKTtcblx0XHRcdHRoaXMuc3luY0FuY2hvckxpc3RlbmVycygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc3luY0FuY2hvckxpc3RlbmVycygpIHtcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuYW5jaG9yQ2VsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBbmNob3IgY2VsbCBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHQvLyB0eXBpbmdcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmFuY2hvckNlbGxbMV0ub25XaWxsVHlwZSgoaW5wdXQpID0+IHtcblx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKTtcblx0XHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRcdC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjZWxsLmNlbGxWaWV3TW9kZWwuaGFuZGxlICE9PSB0aGlzLmFuY2hvckNlbGw/LlswXS5oYW5kbGUpIHsgLy8gZG9uJ3QgcmVsYXkgdG8gYWN0aXZlIGNlbGwsIGFscmVhZHkgaGFzIGEgY29udHJvbGxlciBmb3IgdHlwaW5nXG5cdFx0XHRcdFx0Y29udHJvbGxlci50eXBlKGNvbGxlY3RvciwgaW5wdXQsICdrZXlib2FyZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmFuY2hvckNlbGxbMV0ub25EaWRUeXBlKCgpID0+IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZzsgLy8gdHlwaW5nIHdpbGwgY29udGludWUgdG8gd29yayBhcyBub3JtYWwgYWNyb3NzIHJhbmdlcywganVzdCBwcmVwcyBmb3IgYW5vdGhlciBjbWQrZFxuXHRcdFx0dGhpcy5fbmJNdWx0aVNlbGVjdFN0YXRlLnNldChOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZyk7XG5cblx0XHRcdGNvbnN0IGFuY2hvckNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQodGhpcy5hbmNob3JDZWxsIVswXS51cmkpO1xuXHRcdFx0aWYgKCFhbmNob3JDb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGl2ZVNlbGVjdGlvbnMgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNvZGVFZGl0b3I/LmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGlmICghYWN0aXZlU2VsZWN0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIG5lZWQgdG8ga2VlcCBhbmNob3IgY3Vyc29yIGNvbnRyb2xsZXIgaW4gc3luYyBtYW51YWxseSAoZm9yIGRlbGV0ZSB1c2FnZSksIHNpbmNlIHdlIGRvbid0IHJlbGF5IHR5cGUgZXZlbnQgdG8gaXRcblx0XHRcdGFuY2hvckNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksICdrZXlib2FyZCcsIGFjdGl2ZVNlbGVjdGlvbnMsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCk7XG5cblx0XHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHRoaXMgaXMgdXNlZCB1cG9uIGV4aXRpbmcgdGhlIG11bHRpY3Vyc29yIHNlc3Npb24gdG8gc2V0IHRoZSBzZWxlY3Rpb25zIGJhY2sgdG8gdGhlIGNvcnJlY3QgY3Vyc29yIHN0YXRlXG5cdFx0XHRcdGNlbGwuaW5pdGlhbFNlbGVjdGlvbiA9IGNvbnRyb2xsZXIuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdC8vIGNsZWFyIHRyYWNrZWQgc2VsZWN0aW9uIGRhdGEgYXMgaXQgaXMgaW52YWxpZCBvbmNlIHR5cGluZyBiZWdpbnNcblx0XHRcdFx0Y2VsbC5tYXRjaFNlbGVjdGlvbnMgPSBbXTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGFycm93IGtleSBuYXZpZ2F0aW9uXG5cdFx0dGhpcy5hbmNob3JEaXNwb3NhYmxlcy5hZGQodGhpcy5hbmNob3JDZWxsWzFdLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zb3VyY2UgPT09ICdtb3VzZScpIHtcblx0XHRcdFx0dGhpcy5yZXNldFRvSWRsZVN0YXRlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaWdub3JlIHRoaXMgZXZlbnQgaWYgaXQgd2FzIGNhdXNlZCBieSBhIHR5cGluZyBldmVudCBvciBhIGRlbGV0ZSAoTm90U2V0IGFuZCBSZWNvdmVyRnJvbU1hcmtlcnMgcmVzcGVjdGl2ZWx5KVxuXHRcdFx0aWYgKCFlLm9sZFNlbGVjdGlvbnMgfHwgZS5yZWFzb24gPT09IEN1cnNvckNoYW5nZVJlYXNvbi5Ob3RTZXQgfHwgZS5yZWFzb24gPT09IEN1cnNvckNoYW5nZVJlYXNvbi5SZWNvdmVyRnJvbU1hcmtlcnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0cmFuc2xhdGlvbjogU2VsZWN0aW9uVHJhbnNsYXRpb24gPSB7XG5cdFx0XHRcdGRlbHRhU3RhcnRDb2w6IGUuc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIC0gZS5vbGRTZWxlY3Rpb25zWzBdLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRkZWx0YVN0YXJ0TGluZTogZS5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gZS5vbGRTZWxlY3Rpb25zWzBdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0ZGVsdGFFbmRDb2w6IGUuc2VsZWN0aW9uLmVuZENvbHVtbiAtIGUub2xkU2VsZWN0aW9uc1swXS5lbmRDb2x1bW4sXG5cdFx0XHRcdGRlbHRhRW5kTGluZTogZS5zZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIGUub2xkU2VsZWN0aW9uc1swXS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRyYW5zbGF0aW9uRGlyID0gZS5zZWxlY3Rpb24uZ2V0RGlyZWN0aW9uKCk7XG5cblx0XHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSBjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKS5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0XHRjb25zdCBuZXdTdGFydENvbCA9IHNlbGVjdGlvbi5zdGFydENvbHVtbiArIHRyYW5zbGF0aW9uLmRlbHRhU3RhcnRDb2w7XG5cdFx0XHRcdFx0Y29uc3QgbmV3U3RhcnRMaW5lID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciArIHRyYW5zbGF0aW9uLmRlbHRhU3RhcnRMaW5lO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0VuZENvbCA9IHNlbGVjdGlvbi5lbmRDb2x1bW4gKyB0cmFuc2xhdGlvbi5kZWx0YUVuZENvbDtcblx0XHRcdFx0XHRjb25zdCBuZXdFbmRMaW5lID0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgKyB0cmFuc2xhdGlvbi5kZWx0YUVuZExpbmU7XG5cdFx0XHRcdFx0cmV0dXJuIFNlbGVjdGlvbi5jcmVhdGVXaXRoRGlyZWN0aW9uKG5ld1N0YXJ0TGluZSwgbmV3U3RhcnRDb2wsIG5ld0VuZExpbmUsIG5ld0VuZENvbCwgdHJhbnNsYXRpb25EaXIpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb250cm9sbGVyLnNldFNlbGVjdGlvbnMobmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpLCBlLnNvdXJjZSwgbmV3U2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGNvcmUgYWN0aW9uc1xuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuYW5jaG9yQ2VsbFsxXS5vbldpbGxUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQoKGUpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlRWRpdG9yT3BlcmF0aW9uRXZlbnQoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZXhpdCBtb2RlXG5cdFx0dGhpcy5hbmNob3JEaXNwb3NhYmxlcy5hZGQodGhpcy5hbmNob3JDZWxsWzFdLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyB8fCB0aGlzLnN0YXRlID09PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZykge1xuXHRcdFx0XHR0aGlzLnJlc2V0VG9JZGxlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmNDdXJzb3JzQ29udHJvbGxlcnMoKSB7XG5cdFx0dGhpcy5jdXJzb3JzRGlzcG9zYWJsZXMuY2xlYXIoKTsgLy8gVE9ETzogZGlhbCB0aGlzIGJhY2sgZm9yIHBlcmYgYW5kIGp1c3QgdXBkYXRlIHRoZSByZWxldmFudCBjb250cm9sbGVyc1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMudHJhY2tlZENlbGxzLm1hcChhc3luYyBjZWxsID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNyZWF0ZUN1cnNvckNvbnRyb2xsZXIoY2VsbCk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jdXJzb3JzQ29udHJvbGxlcnMuc2V0KGNlbGwuY2VsbFZpZXdNb2RlbC51cmksIGNvbnRyb2xsZXIpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gY2VsbC5tYXRjaFNlbGVjdGlvbnM7XG5cdFx0XHRjb250cm9sbGVyLnNldFNlbGVjdGlvbnMobmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpLCB1bmRlZmluZWQsIHNlbGVjdGlvbnMsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVMYXp5RGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlQ3Vyc29yQ29udHJvbGxlcihjZWxsOiBUcmFja2VkQ2VsbCk6IFByb21pc2U8Q3Vyc29yc0NvbnRyb2xsZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0ZXh0TW9kZWxSZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGV4dE1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0aWYgKCF0ZXh0TW9kZWwpIHtcblx0XHRcdHRleHRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcy5hZGQodGV4dE1vZGVsUmVmKTtcblxuXHRcdGNvbnN0IGN1cnNvclNpbXBsZU1vZGVsID0gdGhpcy5jb25zdHJ1Y3RDdXJzb3JTaW1wbGVNb2RlbChjZWxsLmNlbGxWaWV3TW9kZWwpO1xuXHRcdGNvbnN0IGNvbnZlcnRlciA9IHRoaXMuY29uc3RydWN0Q29vcmRpbmF0ZXNDb252ZXJ0ZXIoKTtcblx0XHRjb25zdCBlZGl0b3JDb25maWcgPSBjZWxsLmVkaXRvckNvbmZpZztcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcy5hZGQobmV3IEN1cnNvcnNDb250cm9sbGVyKFxuXHRcdFx0dGV4dE1vZGVsLFxuXHRcdFx0Y3Vyc29yU2ltcGxlTW9kZWwsXG5cdFx0XHRjb252ZXJ0ZXIsXG5cdFx0XHRuZXcgQ3Vyc29yQ29uZmlndXJhdGlvbih0ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLCBlZGl0b3JDb25maWcsIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSlcblx0XHQpKTtcblxuXHRcdGNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksIHVuZGVmaW5lZCwgY2VsbC5tYXRjaFNlbGVjdGlvbnMsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCk7XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXI7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdENvb3JkaW5hdGVzQ29udmVydGVyKCk6IElDb29yZGluYXRlc0NvbnZlcnRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24odmlld1Bvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRcdFx0cmV0dXJuIHZpZXdQb3NpdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRjb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHZpZXdSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0XHRcdHJldHVybiB2aWV3UmFuZ2U7XG5cdFx0XHR9LFxuXHRcdFx0dmFsaWRhdGVWaWV3UG9zaXRpb24odmlld1Bvc2l0aW9uOiBQb3NpdGlvbiwgZXhwZWN0ZWRNb2RlbFBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRcdFx0cmV0dXJuIHZpZXdQb3NpdGlvbjtcblx0XHRcdH0sXG5cdFx0XHR2YWxpZGF0ZVZpZXdSYW5nZSh2aWV3UmFuZ2U6IFJhbmdlLCBleHBlY3RlZE1vZGVsUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdFx0XHRyZXR1cm4gdmlld1JhbmdlO1xuXHRcdFx0fSxcblx0XHRcdGNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxQb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5PzogUG9zaXRpb25BZmZpbml0eSwgYWxsb3daZXJvTGluZU51bWJlcj86IGJvb2xlYW4sIGJlbG93SGlkZGVuUmFuZ2VzPzogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsUG9zaXRpb247XG5cdFx0XHR9LFxuXHRcdFx0Y29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShtb2RlbFJhbmdlOiBSYW5nZSwgYWZmaW5pdHk/OiBQb3NpdGlvbkFmZmluaXR5KTogUmFuZ2Uge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWxSYW5nZTtcblx0XHRcdH0sXG5cdFx0XHRtb2RlbFBvc2l0aW9uSXNWaXNpYmxlKG1vZGVsUG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdGdldE1vZGVsTGluZVZpZXdMaW5lQ291bnQobW9kZWxMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH0sXG5cdFx0XHRnZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihtb2RlbExpbmVOdW1iZXI6IG51bWJlciwgbW9kZWxDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBtb2RlbExpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0Q3Vyc29yU2ltcGxlTW9kZWwoY2VsbDogSUNlbGxWaWV3TW9kZWwpOiBJQ3Vyc29yU2ltcGxlTW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdH0sXG5cdFx0XHRub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5KTogUG9zaXRpb24ge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb247XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gaW5kZW50T2ZMaW5lKGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSkgKyAxO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVkaXRvck9wZXJhdGlvbkV2ZW50KGU6IElUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQpIHtcblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0aWYgKGNlbGwuY2VsbFZpZXdNb2RlbC5oYW5kbGUgPT09IHRoaXMuYW5jaG9yQ2VsbD8uWzBdLmhhbmRsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKTtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5leGVjdXRlRWRpdG9yT3BlcmF0aW9uKGNvbnRyb2xsZXIsIGV2ZW50c0NvbGxlY3RvciwgZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGV4ZWN1dGVFZGl0b3JPcGVyYXRpb24oY29udHJvbGxlcjogQ3Vyc29yc0NvbnRyb2xsZXIsIGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBlOiBJVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50KSB7XG5cdFx0c3dpdGNoIChlLmhhbmRsZXJJZCkge1xuXHRcdFx0Y2FzZSBIYW5kbGVyLkNvbXBvc2l0aW9uU3RhcnQ6XG5cdFx0XHRcdGNvbnRyb2xsZXIuc3RhcnRDb21wb3NpdGlvbihldmVudHNDb2xsZWN0b3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSGFuZGxlci5Db21wb3NpdGlvbkVuZDpcblx0XHRcdFx0Y29udHJvbGxlci5lbmRDb21wb3NpdGlvbihldmVudHNDb2xsZWN0b3IsIGUuc291cmNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEhhbmRsZXIuUmVwbGFjZVByZXZpb3VzQ2hhcjoge1xuXHRcdFx0XHRjb25zdCBhcmdzID0gPFBhcnRpYWw8UmVwbGFjZVByZXZpb3VzQ2hhclBheWxvYWQ+PmUucGF5bG9hZDtcblx0XHRcdFx0Y29udHJvbGxlci5jb21wb3NpdGlvblR5cGUoZXZlbnRzQ29sbGVjdG9yLCBhcmdzLnRleHQgfHwgJycsIGFyZ3MucmVwbGFjZUNoYXJDbnQgfHwgMCwgMCwgMCwgZS5zb3VyY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgSGFuZGxlci5Db21wb3NpdGlvblR5cGU6IHtcblx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPENvbXBvc2l0aW9uVHlwZVBheWxvYWQ+PmUucGF5bG9hZDtcblx0XHRcdFx0Y29udHJvbGxlci5jb21wb3NpdGlvblR5cGUoZXZlbnRzQ29sbGVjdG9yLCBhcmdzLnRleHQgfHwgJycsIGFyZ3MucmVwbGFjZVByZXZDaGFyQ250IHx8IDAsIGFyZ3MucmVwbGFjZU5leHRDaGFyQ250IHx8IDAsIGFyZ3MucG9zaXRpb25EZWx0YSB8fCAwLCBlLnNvdXJjZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBIYW5kbGVyLlBhc3RlOiB7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxQYXN0ZVBheWxvYWQ+PmUucGF5bG9hZDtcblx0XHRcdFx0Y29udHJvbGxlci5wYXN0ZShldmVudHNDb2xsZWN0b3IsIGFyZ3MudGV4dCB8fCAnJywgYXJncy5wYXN0ZU9uTmV3TGluZSB8fCBmYWxzZSwgYXJncy5tdWx0aWN1cnNvclRleHQgfHwgbnVsbCwgZS5zb3VyY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgSGFuZGxlci5DdXQ6XG5cdFx0XHRcdGNvbnRyb2xsZXIuY3V0KGV2ZW50c0NvbGxlY3RvciwgZS5zb3VyY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpZXdNb2RlbFNlbGVjdGlvbnMoKSB7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIHRoaXMudHJhY2tlZENlbGxzKSB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jdXJzb3JzQ29udHJvbGxlcnMuZ2V0KGNlbGwuY2VsbFZpZXdNb2RlbC51cmkpO1xuXHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y2VsbC5jZWxsVmlld01vZGVsLnNldFNlbGVjdGlvbnMoY29udHJvbGxlci5nZXRTZWxlY3Rpb25zKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRmluYWxVbmRvUmVkbygpIHtcblx0XHRjb25zdCBhbmNob3JDZWxsTW9kZWwgPSB0aGlzLmFuY2hvckNlbGw/LlsxXS5nZXRNb2RlbCgpO1xuXHRcdGlmICghYW5jaG9yQ2VsbE1vZGVsKSB7XG5cdFx0XHQvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0VsZW1lbnRzTWFwOiBSZXNvdXJjZU1hcDxJVW5kb1JlZG9FbGVtZW50W10+ID0gbmV3IFJlc291cmNlTWFwPElVbmRvUmVkb0VsZW1lbnRbXT4oKTtcblx0XHRjb25zdCByZXNvdXJjZXM6IFVSSVtdID0gW107XG5cblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKHRyYWNrZWRNYXRjaCA9PiB7XG5cdFx0XHRjb25zdCB1bmRvUmVkb1N0YXRlID0gdHJhY2tlZE1hdGNoLnVuZG9SZWRvSGlzdG9yeTtcblx0XHRcdGlmICghdW5kb1JlZG9TdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlc291cmNlcy5wdXNoKHRyYWNrZWRNYXRjaC5jZWxsVmlld01vZGVsLnVyaSk7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRQYXN0RWxlbWVudHMgPSB0aGlzLnVuZG9SZWRvU2VydmljZS5nZXRFbGVtZW50cyh0cmFja2VkTWF0Y2guY2VsbFZpZXdNb2RlbC51cmkpLnBhc3Quc2xpY2UoKTtcblx0XHRcdGNvbnN0IG9sZFBhc3RFbGVtZW50cyA9IHRyYWNrZWRNYXRjaC51bmRvUmVkb0hpc3RvcnkucGFzdC5zbGljZSgpO1xuXHRcdFx0Y29uc3QgbmV3RWxlbWVudHMgPSBjdXJyZW50UGFzdEVsZW1lbnRzLnNsaWNlKG9sZFBhc3RFbGVtZW50cy5sZW5ndGgpO1xuXHRcdFx0aWYgKG5ld0VsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG5ld0VsZW1lbnRzTWFwLnNldCh0cmFja2VkTWF0Y2guY2VsbFZpZXdNb2RlbC51cmksIG5ld0VsZW1lbnRzKTtcblxuXHRcdFx0dGhpcy51bmRvUmVkb1NlcnZpY2UucmVtb3ZlRWxlbWVudHModHJhY2tlZE1hdGNoLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdG9sZFBhc3RFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHR0aGlzLnVuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy51bmRvUmVkb1NlcnZpY2UucHVzaEVsZW1lbnQoe1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UsXG5cdFx0XHRyZXNvdXJjZXM6IHJlc291cmNlcyxcblx0XHRcdGxhYmVsOiAnTXVsdGkgQ3Vyc29yIEVkaXQnLFxuXHRcdFx0Y29kZTogJ211bHRpQ3Vyc29yRWRpdCcsXG5cdFx0XHRjb25maXJtQmVmb3JlVW5kbzogZmFsc2UsXG5cdFx0XHR1bmRvOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG5ld0VsZW1lbnRzTWFwLmZvckVhY2goYXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdHZhbHVlLnJldmVyc2UoKS5mb3JFYWNoKGFzeW5jIGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgZWxlbWVudC51bmRvKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHJlZG86IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bmV3RWxlbWVudHNNYXAuZm9yRWFjaChhc3luYyB2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0dmFsdWUuZm9yRWFjaChhc3luYyBlbGVtZW50ID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IGVsZW1lbnQucmVkbygpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZXNldFRvSWRsZVN0YXRlKCkge1xuXHRcdHRoaXMuc3RhdGUgPSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuSWRsZTtcblx0XHR0aGlzLl9uYk11bHRpU2VsZWN0U3RhdGUuc2V0KE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlKTtcblx0XHR0aGlzLl9uYklzTXVsdGlTZWxlY3RTZXNzaW9uLnNldChmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGVGaW5hbFVuZG9SZWRvKCk7XG5cblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0dGhpcy5jbGVhckRlY29yYXRpb25zKGNlbGwpO1xuXHRcdFx0Y2VsbC5jZWxsVmlld01vZGVsLnNldFNlbGVjdGlvbnMoW2NlbGwuaW5pdGlhbFNlbGVjdGlvbl0pOyAvLyBjb3JyZWN0IGN1cnNvciBwbGFjZW1lbnQgdXBvbiBleGl0aW5nIGNtZC1kIHNlc3Npb25cblx0XHR9KTtcblxuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmFuY2hvckNlbGwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJzb3JzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmN1cnNvcnNDb250cm9sbGVycy5jbGVhcigpO1xuXHRcdHRoaXMudHJhY2tlZENlbGxzID0gW107XG5cdFx0dGhpcy50b3RhbE1hdGNoZXNDb3VudCA9IDA7XG5cdFx0dGhpcy5zdGFydFBvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMud29yZCA9ICcnO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZpbmRBbmRUcmFja05leHRTZWxlY3Rpb24oZm9jdXNlZENlbGw6IElDZWxsVmlld01vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlKSB7IC8vIG1vdmUgY3Vyc29yIHRvIGVuZCBvZiB0aGUgc3ltYm9sICsgdHJhY2sgaXQsIHRyYW5zaXRpb24gdG8gc2VsZWN0aW5nIHN0YXRlXG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBmb2N1c2VkQ2VsbC50ZXh0TW9kZWw7XG5cdFx0XHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlucHV0U2VsZWN0aW9uID0gZm9jdXNlZENlbGwuZ2V0U2VsZWN0aW9ucygpWzBdO1xuXHRcdFx0Y29uc3Qgd29yZCA9IHRoaXMuZ2V0V29yZChpbnB1dFNlbGVjdGlvbiwgdGV4dE1vZGVsKTtcblx0XHRcdGlmICghd29yZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLndvcmQgPSB3b3JkLndvcmQ7XG5cblx0XHRcdC8vIFJlY29yZCB0aGUgdG90YWwgbnVtYmVyIG9mIG1hdGNoZXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgc2VsZWN0aW9uIHByb2Nlc3MgZm9yIHBlcmZvcm1hbmNlXG5cdFx0XHRjb25zdCBub3RlYm9va1RleHRNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0aWYgKG5vdGVib29rVGV4dE1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGFsbE1hdGNoZXMgPSBub3RlYm9va1RleHRNb2RlbC5maW5kTWF0Y2hlcyh0aGlzLndvcmQsIGZhbHNlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMpO1xuXHRcdFx0XHR0aGlzLnRvdGFsTWF0Y2hlc0NvdW50ID0gYWxsTWF0Y2hlcy5yZWR1Y2UoKHN1bSwgY2VsbE1hdGNoKSA9PiBzdW0gKyBjZWxsTWF0Y2gubWF0Y2hlcy5sZW5ndGgsIDApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGZvY3VzZWRDZWxsKTtcblx0XHRcdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zdGFydFBvc2l0aW9uID0ge1xuXHRcdFx0XHRjZWxsSW5kZXg6IGluZGV4LFxuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKGlucHV0U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiksXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBuZXdTZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKFxuXHRcdFx0XHRpbnB1dFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHdvcmQuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdGlucHV0U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0d29yZC5lbmRDb2x1bW5cblx0XHRcdCk7XG5cdFx0XHRmb2N1c2VkQ2VsbC5zZXRTZWxlY3Rpb25zKFtuZXdTZWxlY3Rpb25dKTtcblxuXHRcdFx0dGhpcy5hbmNob3JDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVDZWxsQW5kQ29kZUVkaXRvcjtcblx0XHRcdGlmICghdGhpcy5hbmNob3JDZWxsIHx8IHRoaXMuYW5jaG9yQ2VsbFswXS5oYW5kbGUgIT09IGZvY3VzZWRDZWxsLmhhbmRsZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FjdGl2ZSBjZWxsIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgY2VsbCBwYXNzZWQgYXMgY29udGV4dCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEodGhpcy5hbmNob3JDZWxsWzFdIGluc3RhbmNlb2YgQ29kZUVkaXRvcldpZGdldCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBY3RpdmUgY2VsbCBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgQ29kZUVkaXRvcldpZGdldCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVRyYWNrZWRDZWxsKGZvY3VzZWRDZWxsLCBbbmV3U2VsZWN0aW9uXSk7XG5cblx0XHRcdHRoaXMuX25iSXNNdWx0aVNlbGVjdFNlc3Npb24uc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3Rpbmc7XG5cdFx0XHR0aGlzLl9uYk11bHRpU2VsZWN0U3RhdGUuc2V0KE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFuY2hvckNlbGwuZmlyZSgpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSB7IC8vIHVzZSB0aGUgd29yZCB3ZSBzdG9yZWQgZnJvbSBpZGxlIHN0YXRlIHRyYW5zaXRpb24gdG8gZmluZCBuZXh0IG1hdGNoLCB0cmFjayBpdFxuXHRcdFx0Y29uc3Qgbm90ZWJvb2tUZXh0TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGlmICghbm90ZWJvb2tUZXh0TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGZvY3VzZWRDZWxsKTtcblx0XHRcdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLnN0YXJ0UG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiBhbGwgbWF0Y2hlcyBhcmUgYWxyZWFkeSBjb3ZlcmVkIGJ5IHNlbGVjdGlvbnMgdG8gYXZvaWQgaW5maW5pdGUgbG9vcGluZ1xuXHRcdFx0Y29uc3QgdG90YWxTZWxlY3Rpb25zID0gdGhpcy50cmFja2VkQ2VsbHMucmVkdWNlKChzdW0sIHRyYWNrZWRDZWxsKSA9PiBzdW0gKyB0cmFja2VkQ2VsbC5tYXRjaFNlbGVjdGlvbnMubGVuZ3RoLCAwKTtcblxuXHRcdFx0aWYgKHRvdGFsU2VsZWN0aW9ucyA+PSB0aGlzLnRvdGFsTWF0Y2hlc0NvdW50KSB7XG5cdFx0XHRcdC8vIEFsbCBtYXRjaGVzIGFyZSBhbHJlYWR5IHNlbGVjdGVkLCBtYWtlIHRoaXMgYSBuby1vcCBsaWtlIGluIHJlZ3VsYXIgZWRpdG9yc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbmRSZXN1bHQgPSBub3RlYm9va1RleHRNb2RlbC5maW5kTmV4dE1hdGNoKFxuXHRcdFx0XHR0aGlzLndvcmQsXG5cdFx0XHRcdHsgY2VsbEluZGV4OiBpbmRleCwgcG9zaXRpb246IGZvY3VzZWRDZWxsLmdldFNlbGVjdGlvbnMoKVtmb2N1c2VkQ2VsbC5nZXRTZWxlY3Rpb25zKCkubGVuZ3RoIC0gMV0uZ2V0RW5kUG9zaXRpb24oKSB9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0VVNVQUxfV09SRF9TRVBBUkFUT1JTLFxuXHRcdFx0XHR0aGlzLnN0YXJ0UG9zaXRpb24sXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFmaW5kUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmluZFJlc3VsdENlbGxWaWV3TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUhhbmRsZShmaW5kUmVzdWx0LmNlbGwuaGFuZGxlKTtcblx0XHRcdGlmICghZmluZFJlc3VsdENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmluZFJlc3VsdC5jZWxsLmhhbmRsZSA9PT0gZm9jdXNlZENlbGwuaGFuZGxlKSB7IC8vIG1hdGNoIGlzIGluIHRoZSBzYW1lIGNlbGwsIGZpbmQgdHJhY2tlZCBlbnRyeSwgdXBkYXRlIGFuZCBzZXQgc2VsZWN0aW9ucyBpbiB2aWV3bW9kZWwgYW5kIGN1cnNvckNvbnRyb2xsZXJcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IFsuLi5mb2N1c2VkQ2VsbC5nZXRTZWxlY3Rpb25zKCksIFNlbGVjdGlvbi5mcm9tUmFuZ2UoZmluZFJlc3VsdC5tYXRjaC5yYW5nZSwgU2VsZWN0aW9uRGlyZWN0aW9uLkxUUildO1xuXHRcdFx0XHRjb25zdCB0cmFja2VkQ2VsbCA9IGF3YWl0IHRoaXMudXBkYXRlVHJhY2tlZENlbGwoZm9jdXNlZENlbGwsIHNlbGVjdGlvbnMpO1xuXHRcdFx0XHRmaW5kUmVzdWx0Q2VsbFZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKHRyYWNrZWRDZWxsLm1hdGNoU2VsZWN0aW9ucyk7XG5cblxuXHRcdFx0fSBlbHNlIGlmIChmaW5kUmVzdWx0LmNlbGwuaGFuZGxlICE9PSBmb2N1c2VkQ2VsbC5oYW5kbGUpIHtcdC8vIHJlc3VsdCBpcyBpbiBhIGRpZmZlcmVudCBjZWxsLCBtb3ZlIGZvY3VzIHRoZXJlIGFuZCBhcHBseSBzZWxlY3Rpb24sIHRoZW4gdXBkYXRlIGFuY2hvclxuXHRcdFx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5WaWV3QXN5bmMoZmluZFJlc3VsdENlbGxWaWV3TW9kZWwsIGZpbmRSZXN1bHQubWF0Y2gucmFuZ2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGZpbmRSZXN1bHRDZWxsVmlld01vZGVsLCAnZWRpdG9yJyk7XG5cblx0XHRcdFx0Y29uc3QgdHJhY2tlZENlbGwgPSBhd2FpdCB0aGlzLnVwZGF0ZVRyYWNrZWRDZWxsKGZpbmRSZXN1bHRDZWxsVmlld01vZGVsLCBbU2VsZWN0aW9uLmZyb21SYW5nZShmaW5kUmVzdWx0Lm1hdGNoLnJhbmdlLCBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKV0pO1xuXHRcdFx0XHRmaW5kUmVzdWx0Q2VsbFZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKHRyYWNrZWRDZWxsLm1hdGNoU2VsZWN0aW9ucyk7XG5cblx0XHRcdFx0dGhpcy5hbmNob3JDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVDZWxsQW5kQ29kZUVkaXRvcjtcblx0XHRcdFx0aWYgKCF0aGlzLmFuY2hvckNlbGwgfHwgISh0aGlzLmFuY2hvckNlbGxbMV0gaW5zdGFuY2VvZiBDb2RlRWRpdG9yV2lkZ2V0KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQWN0aXZlIGNlbGwgaXMgbm90IGFuIGluc3RhbmNlIG9mIENvZGVFZGl0b3JXaWRnZXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQW5jaG9yQ2VsbC5maXJlKCk7XG5cblx0XHRcdFx0Ly8gd2Ugc2V0IHRoZSBkZWNvcmF0aW9ucyBtYW51YWxseSBmb3IgdGhlIGNlbGwgd2UgaGF2ZSBqdXN0IGRlcGFydGVkLCBzaW5jZSBpdCBibHVyc1xuXHRcdFx0XHQvLyB3ZSBjYW4gZmluZCB0aGUgbWF0Y2ggd2l0aCB0aGUgaGFuZGxlIHRoYXQgdGhlIGZpbmQgYW5kIHRyYWNrIHJlcXVlc3Qgb3JpZ2luYXRlZFxuXHRcdFx0XHR0aGlzLmluaXRpYWxpemVNdWx0aVNlbGVjdERlY29yYXRpb25zKHRoaXMudHJhY2tlZENlbGxzLmZpbmQodHJhY2tlZENlbGwgPT4gdHJhY2tlZENlbGwuY2VsbFZpZXdNb2RlbC5oYW5kbGUgPT09IGZvY3VzZWRDZWxsLmhhbmRsZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZWxlY3RBbGxNYXRjaGVzKGZvY3VzZWRDZWxsOiBJQ2VsbFZpZXdNb2RlbCwgbWF0Y2hlcz86IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdGVib29rVGV4dE1vZGVsID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0aWYgKCFub3RlYm9va1RleHRNb2RlbCkge1xuXHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdH1cblxuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZUZpbmRXaWRnZXRTZWxlY3RBbGxNYXRjaGVzKG1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZUNlbGxFZGl0b3JTZWxlY3RBbGxNYXRjaGVzKG5vdGVib29rVGV4dE1vZGVsLCBmb2N1c2VkQ2VsbCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zeW5jQ3Vyc29yc0NvbnRyb2xsZXJzKCk7XG5cdFx0dGhpcy5zeW5jQW5jaG9yTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy51cGRhdGVMYXp5RGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlRmluZFdpZGdldFNlbGVjdEFsbE1hdGNoZXMobWF0Y2hlczogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdKSB7XG5cdFx0Ly8gVE9ETzogc3VwcG9ydCBzZWxlY3Rpbmcgc3RhdGUgbWF5YmUuIFVYIGNvdWxkIGdldCBjb25mdXNpbmcgc2luY2Ugc2VsZWN0aW5nIHN0YXRlIGNvdWxkIGJlIGhpdCB2aWEgY3RybCtkIHdoaWNoIHdvdWxkIGhhdmUgZGlmZmVyZW50IGZpbHRlcnMgKGNhc2Ugc2Vuc2V0aXZlICsgd2hvbGUgd29yZClcblx0XHRpZiAodGhpcy5zdGF0ZSAhPT0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChtYXRjaGVzWzBdLmNlbGwsICdlZGl0b3InKTtcblx0XHR0aGlzLmFuY2hvckNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yO1xuXG5cdFx0dGhpcy50cmFja2VkQ2VsbHMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdHRoaXMudXBkYXRlVHJhY2tlZENlbGwobWF0Y2guY2VsbCwgbWF0Y2guY29udGVudE1hdGNoZXMubWFwKG1hdGNoID0+IFNlbGVjdGlvbi5mcm9tUmFuZ2UobWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpKSk7XG5cblx0XHRcdGlmICh0aGlzLmFuY2hvckNlbGwgJiYgbWF0Y2guY2VsbC5oYW5kbGUgPT09IHRoaXMuYW5jaG9yQ2VsbFswXS5oYW5kbGUpIHtcblx0XHRcdFx0Ly8gb25seSBleHBsaWNpdGx5IHNldCB0aGUgZm9jdXNlZCBjZWxsJ3Mgc2VsZWN0aW9ucywgdGhlIHJlc3QgYXJlIGhhbmRsZWQgYnkgY3Vyc29yIGNvbnRyb2xsZXJzICsgZGVjb3JhdGlvbnNcblx0XHRcdFx0bWF0Y2guY2VsbC5zZXRTZWxlY3Rpb25zKG1hdGNoLmNvbnRlbnRNYXRjaGVzLm1hcChtYXRjaCA9PiBTZWxlY3Rpb24uZnJvbVJhbmdlKG1hdGNoLnJhbmdlLCBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX25iSXNNdWx0aVNlbGVjdFNlc3Npb24uc2V0KHRydWUpO1xuXHRcdHRoaXMuc3RhdGUgPSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nO1xuXHRcdHRoaXMuX25iTXVsdGlTZWxlY3RTdGF0ZS5zZXQoTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUNlbGxFZGl0b3JTZWxlY3RBbGxNYXRjaGVzKG5vdGVib29rVGV4dE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgZm9jdXNlZENlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0Ly8gY2FuIGJlIHRyaWdnZXJlZCBtaWQgbXVsdGlzZWxlY3Qgc2Vzc2lvbiwgb3IgZnJvbSBpZGxlIHN0YXRlXG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlKSB7XG5cdFx0XHQvLyBnZXQgd29yZCBmcm9tIGN1cnJlbnQgc2VsZWN0aW9uICsgcmVzdCBvZiBub3RlYm9vayBvYmplY3RzXG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBmb2N1c2VkQ2VsbC50ZXh0TW9kZWw7XG5cdFx0XHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dFNlbGVjdGlvbiA9IGZvY3VzZWRDZWxsLmdldFNlbGVjdGlvbnMoKVswXTtcblx0XHRcdGNvbnN0IHdvcmQgPSB0aGlzLmdldFdvcmQoaW5wdXRTZWxlY3Rpb24sIHRleHRNb2RlbCk7XG5cdFx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy53b3JkID0gd29yZC53b3JkO1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChmb2N1c2VkQ2VsbCk7XG5cdFx0XHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN0YXJ0UG9zaXRpb24gPSB7XG5cdFx0XHRcdGNlbGxJbmRleDogaW5kZXgsXG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oaW5wdXRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uKSxcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuYW5jaG9yQ2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlQ2VsbEFuZENvZGVFZGl0b3I7XG5cdFx0XHRpZiAoIXRoaXMuYW5jaG9yQ2VsbCB8fCB0aGlzLmFuY2hvckNlbGxbMF0uaGFuZGxlICE9PSBmb2N1c2VkQ2VsbC5oYW5kbGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBY3RpdmUgY2VsbCBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGNlbGwgcGFzc2VkIGFzIGNvbnRleHQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghKHRoaXMuYW5jaG9yQ2VsbFsxXSBpbnN0YW5jZW9mIENvZGVFZGl0b3JXaWRnZXQpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQWN0aXZlIGNlbGwgaXMgbm90IGFuIGluc3RhbmNlIG9mIENvZGVFZGl0b3JXaWRnZXQnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZ2V0IGFsbCBtYXRjaGVzIGluIHRoZSBub3RlYm9va1xuXHRcdFx0Y29uc3QgZmluZFJlc3VsdHMgPSBub3RlYm9va1RleHRNb2RlbC5maW5kTWF0Y2hlcyh0aGlzLndvcmQsIGZhbHNlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMpO1xuXG5cdFx0XHQvLyBjcmVhdGUgdGhlIHRyYWNrZWQgbWF0Y2hlcyBmb3IgZXZlcnkgcmVzdWx0LCBuZWVkZWQgZm9yIGN1cnNvciBjb250cm9sbGVyc1xuXHRcdFx0dGhpcy50cmFja2VkQ2VsbHMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVzIG9mIGZpbmRSZXN1bHRzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlVHJhY2tlZENlbGwocmVzLmNlbGwsIHJlcy5tYXRjaGVzLm1hcChtYXRjaCA9PiBTZWxlY3Rpb24uZnJvbVJhbmdlKG1hdGNoLnJhbmdlLCBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKSkpO1xuXG5cdFx0XHRcdGlmIChyZXMuY2VsbC5oYW5kbGUgPT09IGZvY3VzZWRDZWxsLmhhbmRsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxWaWV3TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUhhbmRsZShyZXMuY2VsbC5oYW5kbGUpO1xuXHRcdFx0XHRcdGlmIChjZWxsVmlld01vZGVsKSB7XG5cdFx0XHRcdFx0XHRjZWxsVmlld01vZGVsLnNldFNlbGVjdGlvbnMocmVzLm1hdGNoZXMubWFwKG1hdGNoID0+IFNlbGVjdGlvbi5mcm9tUmFuZ2UobWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX25iSXNNdWx0aVNlbGVjdFNlc3Npb24uc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3Rpbmc7XG5cdFx0XHR0aGlzLl9uYk11bHRpU2VsZWN0U3RhdGUuc2V0KE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSB7XG5cdFx0XHQvLyB3ZSB3aWxsIGFscmVhZHkgaGF2ZSBhIHdvcmQgKyBzb21lIG51bWJlciBvZiB0cmFja2VkIG1hdGNoZXMsIG5lZWQgdG8gdXBkYXRlIHRoZW0gd2l0aCB0aGUgcmVzdCBnaXZlbiBmaW5kQWxsTWF0Y2hlcyByZXN1bHRcblx0XHRcdGNvbnN0IGZpbmRSZXN1bHRzID0gbm90ZWJvb2tUZXh0TW9kZWwuZmluZE1hdGNoZXModGhpcy53b3JkLCBmYWxzZSwgdHJ1ZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTKTtcblxuXHRcdFx0Ly8gdXBkYXRlIGV4aXN0aW5nIHRyYWNrZWQgbWF0Y2hlcyB3aXRoIG5ldyBzZWxlY3Rpb25zIGFuZCBjcmVhdGUgbmV3IHRyYWNrZWQgbWF0Y2hlcyBmb3IgY2VsbHMgdGhhdCBhcmVuJ3QgdHJhY2tlZCB5ZXRcblx0XHRcdGZvciAoY29uc3QgcmVzIG9mIGZpbmRSZXN1bHRzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlVHJhY2tlZENlbGwocmVzLmNlbGwsIHJlcy5tYXRjaGVzLm1hcChtYXRjaCA9PiBTZWxlY3Rpb24uZnJvbVJhbmdlKG1hdGNoLnJhbmdlLCBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVHJhY2tlZENlbGwoY2VsbDogSUNlbGxWaWV3TW9kZWwgfCBOb3RlYm9va0NlbGxUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdKSB7XG5cdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IGNlbGwgaW5zdGFuY2VvZiBOb3RlYm9va0NlbGxUZXh0TW9kZWwgPyB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUhhbmRsZShjZWxsLmhhbmRsZSkgOiBjZWxsO1xuXHRcdGlmICghY2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDZWxsIG5vdCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdGxldCB0cmFja2VkTWF0Y2ggPSB0aGlzLnRyYWNrZWRDZWxscy5maW5kKHRyYWNrZWRDZWxsID0+IHRyYWNrZWRDZWxsLmNlbGxWaWV3TW9kZWwuaGFuZGxlID09PSBjZWxsVmlld01vZGVsLmhhbmRsZSk7XG5cblx0XHRpZiAodHJhY2tlZE1hdGNoKSB7XG5cdFx0XHR0aGlzLmNsZWFyRGVjb3JhdGlvbnModHJhY2tlZE1hdGNoKTsgLy8gbmVlZCB0aGlzIHRvIGF2b2lkIGxlYWtpbmcgZGVjb3JhdGlvbnMgLS0gVE9ETzoganVzdCBvcHRpbWl6ZSB0aGUgbGF6eSBkZWNvcmF0aW9ucyBmblxuXHRcdFx0dHJhY2tlZE1hdGNoLm1hdGNoU2VsZWN0aW9ucyA9IHNlbGVjdGlvbnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluaXRpYWxTZWxlY3Rpb24gPSBjZWxsVmlld01vZGVsLmdldFNlbGVjdGlvbnMoKVswXTtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGF3YWl0IGNlbGxWaWV3TW9kZWwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdFx0dGV4dE1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5jb25zdHJ1Y3RDZWxsRWRpdG9yT3B0aW9ucyhjZWxsVmlld01vZGVsKTtcblx0XHRcdGNvbnN0IHJhd0VkaXRvck9wdGlvbnMgPSBlZGl0b3JDb25maWcuZ2V0UmF3T3B0aW9ucygpO1xuXHRcdFx0Y29uc3QgY3Vyc29yQ29uZmlnOiBOb3RlYm9va0N1cnNvckNvbmZpZyA9IHtcblx0XHRcdFx0Y3Vyc29yU3R5bGU6IGN1cnNvclN0eWxlRnJvbVN0cmluZyhyYXdFZGl0b3JPcHRpb25zLmN1cnNvclN0eWxlISksXG5cdFx0XHRcdGN1cnNvckJsaW5raW5nOiBjdXJzb3JCbGlua2luZ1N0eWxlRnJvbVN0cmluZyhyYXdFZGl0b3JPcHRpb25zLmN1cnNvckJsaW5raW5nISksXG5cdFx0XHRcdGN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uOiByYXdFZGl0b3JPcHRpb25zLmN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uIVxuXHRcdFx0fTtcblxuXHRcdFx0dHJhY2tlZE1hdGNoID0ge1xuXHRcdFx0XHRjZWxsVmlld01vZGVsOiBjZWxsVmlld01vZGVsLFxuXHRcdFx0XHRpbml0aWFsU2VsZWN0aW9uOiBpbml0aWFsU2VsZWN0aW9uLFxuXHRcdFx0XHRtYXRjaFNlbGVjdGlvbnM6IHNlbGVjdGlvbnMsXG5cdFx0XHRcdGVkaXRvckNvbmZpZzogZWRpdG9yQ29uZmlnLFxuXHRcdFx0XHRjdXJzb3JDb25maWc6IGN1cnNvckNvbmZpZyxcblx0XHRcdFx0ZGVjb3JhdGlvbklkczogW10sXG5cdFx0XHRcdHVuZG9SZWRvSGlzdG9yeTogdGhpcy51bmRvUmVkb1NlcnZpY2UuZ2V0RWxlbWVudHMoY2VsbFZpZXdNb2RlbC51cmkpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50cmFja2VkQ2VsbHMucHVzaCh0cmFja2VkTWF0Y2gpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJhY2tlZE1hdGNoO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRlbGV0ZUxlZnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0Ly8gc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBbLCBjb21tYW5kc10gPSBEZWxldGVPcGVyYXRpb25zLmRlbGV0ZUxlZnQoXG5cdFx0XHRcdGNvbnRyb2xsZXIuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCksXG5cdFx0XHRcdGNvbnRyb2xsZXIuY29udGV4dC5jdXJzb3JDb25maWcsXG5cdFx0XHRcdGNvbnRyb2xsZXIuY29udGV4dC5tb2RlbCxcblx0XHRcdFx0Y29udHJvbGxlci5nZXRTZWxlY3Rpb25zKCksXG5cdFx0XHRcdGNvbnRyb2xsZXIuZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnMoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGRlbFNlbGVjdGlvbnMgPSBDb21tYW5kRXhlY3V0b3IuZXhlY3V0ZUNvbW1hbmRzKGNvbnRyb2xsZXIuY29udGV4dC5tb2RlbCwgY29udHJvbGxlci5nZXRTZWxlY3Rpb25zKCksIGNvbW1hbmRzKTtcblx0XHRcdGlmICghZGVsU2VsZWN0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb250cm9sbGVyLnNldFNlbGVjdGlvbnMobmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpLCB1bmRlZmluZWQsIGRlbFNlbGVjdGlvbnMsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCk7XG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVMYXp5RGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBkZWxldGVSaWdodCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHQvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFssIGNvbW1hbmRzXSA9IERlbGV0ZU9wZXJhdGlvbnMuZGVsZXRlUmlnaHQoXG5cdFx0XHRcdGNvbnRyb2xsZXIuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCksXG5cdFx0XHRcdGNvbnRyb2xsZXIuY29udGV4dC5jdXJzb3JDb25maWcsXG5cdFx0XHRcdGNvbnRyb2xsZXIuY29udGV4dC5tb2RlbCxcblx0XHRcdFx0Y29udHJvbGxlci5nZXRTZWxlY3Rpb25zKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAoY2VsbC5jZWxsVmlld01vZGVsLmhhbmRsZSAhPT0gdGhpcy5hbmNob3JDZWxsPy5bMF0uaGFuZGxlKSB7XG5cdFx0XHRcdGNvbnN0IGRlbFNlbGVjdGlvbnMgPSBDb21tYW5kRXhlY3V0b3IuZXhlY3V0ZUNvbW1hbmRzKGNvbnRyb2xsZXIuY29udGV4dC5tb2RlbCwgY29udHJvbGxlci5nZXRTZWxlY3Rpb25zKCksIGNvbW1hbmRzKTtcblx0XHRcdFx0aWYgKCFkZWxTZWxlY3Rpb25zKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksIHVuZGVmaW5lZCwgZGVsU2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGdldCB0aGUgc2VsZWN0aW9ucyBmcm9tIHRoZSB2aWV3bW9kZWwgc2luY2Ugd2UgcnVuIHRoZSBjb21tYW5kIG1hbnVhbGx5IChmb3IgY3Vyc29yIGRlY29yYXRpb24gcmVhc29ucylcblx0XHRcdFx0Y29udHJvbGxlci5zZXRTZWxlY3Rpb25zKG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKSwgdW5kZWZpbmVkLCBjZWxsLmNlbGxWaWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpO1xuXHRcdFx0fVxuXG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVMYXp5RGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdGFzeW5jIHVuZG8oKSB7XG5cdFx0Y29uc3QgbW9kZWxzOiBJVGV4dE1vZGVsW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy50cmFja2VkQ2VsbHMpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgY2VsbC5jZWxsVmlld01vZGVsLnJlc29sdmVUZXh0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRtb2RlbHMucHVzaChtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwobW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC51bmRvKCkpKTtcblx0XHR0aGlzLnVwZGF0ZVZpZXdNb2RlbFNlbGVjdGlvbnMoKTtcblx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0YXN5bmMgcmVkbygpIHtcblx0XHRjb25zdCBtb2RlbHM6IElUZXh0TW9kZWxbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiB0aGlzLnRyYWNrZWRDZWxscykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBjZWxsLmNlbGxWaWV3TW9kZWwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdG1vZGVscy5wdXNoKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChtb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLnJlZG8oKSkpO1xuXHRcdHRoaXMudXBkYXRlVmlld01vZGVsU2VsZWN0aW9ucygpO1xuXHRcdHRoaXMudXBkYXRlTGF6eURlY29yYXRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdENlbGxFZGl0b3JPcHRpb25zKGNlbGw6IElDZWxsVmlld01vZGVsKTogRWRpdG9yQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3QgY2VsbEVkaXRvck9wdGlvbnMgPSBuZXcgQ2VsbEVkaXRvck9wdGlvbnModGhpcy5ub3RlYm9va0VkaXRvci5nZXRCYXNlQ2VsbEVkaXRvck9wdGlvbnMoY2VsbC5sYW5ndWFnZSksIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBvcHRpb25zID0gY2VsbEVkaXRvck9wdGlvbnMuZ2V0VXBkYXRlZFZhbHVlKGNlbGwuaW50ZXJuYWxNZXRhZGF0YSwgY2VsbC51cmkpO1xuXHRcdGNlbGxFZGl0b3JPcHRpb25zLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gbmV3IEVkaXRvckNvbmZpZ3VyYXRpb24oZmFsc2UsIE1lbnVJZC5FZGl0b3JDb250ZW50LCBvcHRpb25zLCBudWxsLCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBtdWx0aWN1cnNvciBzZWxlY3Rpb24gZGVjb3JhdGlvbnMgZm9yIGEgc3BlY2lmaWMgbWF0Y2hlZCBjZWxsXG5cdCAqXG5cdCAqIEBwYXJhbSBjZWxsIC0tIG1hdGNoIG9iamVjdCBjb250YWluaW5nIHRoZSB2aWV3bW9kZWwgKyBzZWxlY3Rpb25zXG5cdCAqL1xuXHRwcml2YXRlIGluaXRpYWxpemVNdWx0aVNlbGVjdERlY29yYXRpb25zKGNlbGw6IFRyYWNrZWRDZWxsIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Y2VsbC5tYXRjaFNlbGVjdGlvbnMuZm9yRWFjaChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0Ly8gbW9jayBjdXJzb3IgYXQgdGhlIGVuZCBvZiB0aGUgc2VsZWN0aW9uXG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IFNlbGVjdGlvbi5mcm9tUG9zaXRpb25zKHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0XHRjbGFzc05hbWU6IHRoaXMuZ2V0Q2xhc3NOYW1lKGNlbGwuY3Vyc29yQ29uZmlnLCB0cnVlKSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjZWxsLmRlY29yYXRpb25JZHMgPSBjZWxsLmNlbGxWaWV3TW9kZWwuZGVsdGFNb2RlbERlY29yYXRpb25zKFxuXHRcdFx0Y2VsbC5kZWNvcmF0aW9uSWRzLFxuXHRcdFx0ZGVjb3JhdGlvbnNcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYXp5RGVjb3JhdGlvbnMoKSB7XG5cdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdGlmIChjZWxsLmNlbGxWaWV3TW9kZWwuaGFuZGxlID09PSB0aGlzLmFuY2hvckNlbGw/LlswXS5oYW5kbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jdXJzb3JzQ29udHJvbGxlcnMuZ2V0KGNlbGwuY2VsbFZpZXdNb2RlbC51cmkpO1xuXHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0XHRzZWxlY3Rpb25zPy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0Y29uc3QgaXNFbXB0eSA9IHNlbGVjdGlvbi5pc0VtcHR5KCk7XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5KSB7XG5cdFx0XHRcdFx0Ly8gc2VsZWN0aW9uIGRlY29yYXRpb24gKHNoaWZ0K2Fycm93LCBldGMpXG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogc2VsZWN0aW9uLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZTogdGhpcy5nZXRDbGFzc05hbWUoY2VsbC5jdXJzb3JDb25maWcsIGZhbHNlKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG1vY2sgY3Vyc29yIGF0IHRoZSBlbmQgb2YgdGhlIHNlbGVjdGlvblxuXHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZTogU2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMoc2VsZWN0aW9uLmdldFBvc2l0aW9uKCkpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0XHRcdHpJbmRleDogMTAwMDAsXG5cdFx0XHRcdFx0XHRjbGFzc05hbWU6IHRoaXMuZ2V0Q2xhc3NOYW1lKGNlbGwuY3Vyc29yQ29uZmlnLCB0cnVlKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNlbGwuZGVjb3JhdGlvbklkcyA9IGNlbGwuY2VsbFZpZXdNb2RlbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoXG5cdFx0XHRcdGNlbGwuZGVjb3JhdGlvbklkcyxcblx0XHRcdFx0bmV3RGVjb3JhdGlvbnNcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyRGVjb3JhdGlvbnMoY2VsbDogVHJhY2tlZENlbGwpIHtcblx0XHRjZWxsLmRlY29yYXRpb25JZHMgPSBjZWxsLmNlbGxWaWV3TW9kZWwuZGVsdGFNb2RlbERlY29yYXRpb25zKFxuXHRcdFx0Y2VsbC5kZWNvcmF0aW9uSWRzLFxuXHRcdFx0W11cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3JkKHNlbGVjdGlvbjogU2VsZWN0aW9uLCBtb2RlbDogSVRleHRNb2RlbCk6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gc2VsZWN0aW9uLnN0YXJ0Q29sdW1uO1xuXG5cdFx0aWYgKG1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHtcblx0XHRcdGxpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IHN0YXJ0Q29sdW1uXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENsYXNzTmFtZShjdXJzb3JDb25maWc6IE5vdGVib29rQ3Vyc29yQ29uZmlnLCBpc0N1cnNvcj86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSBpc0N1cnNvciA/ICcubmItbXVsdGljdXJzb3ItY3Vyc29yJyA6ICcubmItbXVsdGljdXJzb3Itc2VsZWN0aW9uJztcblxuXHRcdGlmIChpc0N1cnNvcikge1xuXHRcdFx0Ly8gaGFuZGxlIGJhc2Ugc3R5bGVcblx0XHRcdHN3aXRjaCAoY3Vyc29yQ29uZmlnLmN1cnNvclN0eWxlKSB7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmU6XG5cdFx0XHRcdFx0YnJlYWs7IC8vIGRlZmF1bHQgc3R5bGUsIG5vIGFkZGl0aW9uYWwgY2xhc3MgbmVlZGVkIChoYW5kbGVkIGJ5IGJhc2UgY3NzIHN0eWxlKVxuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jazpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1jdXJzb3ItYmxvY2stc3R5bGUnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5VbmRlcmxpbmU6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItY3Vyc29yLXVuZGVybGluZS1zdHlsZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmVUaGluOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLWN1cnNvci1saW5lLXRoaW4tc3R5bGUnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9ja091dGxpbmU6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItY3Vyc29yLWJsb2NrLW91dGxpbmUtc3R5bGUnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5VbmRlcmxpbmVUaGluOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLWN1cnNvci11bmRlcmxpbmUtdGhpbi1zdHlsZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGhhbmRsZSBhbmltYXRpb24gc3R5bGVcblx0XHRcdHN3aXRjaCAoY3Vyc29yQ29uZmlnLmN1cnNvckJsaW5raW5nKSB7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuQmxpbms6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItYmxpbmsnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLlNtb290aDpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1zbW9vdGgnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLlBoYXNlOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLXBoYXNlJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5FeHBhbmQ6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItZXhwYW5kJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5Tb2xpZDpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1zb2xpZCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItc29saWQnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBoYW5kbGUgY2FyZXQgYW5pbWF0aW9uIHN0eWxlXG5cdFx0XHRpZiAoY3Vyc29yQ29uZmlnLmN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uID09PSAnb24nIHx8IGN1cnNvckNvbmZpZy5jdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbiA9PT0gJ2V4cGxpY2l0Jykge1xuXHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1zbW9vdGgtY2FyZXQtYW5pbWF0aW9uJztcblx0XHRcdH1cblxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5hbmNob3JEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jdXJzb3JzRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdHRoaXMuY2xlYXJEZWNvcmF0aW9ucyhjZWxsKTtcblx0XHR9KTtcblx0XHR0aGlzLnRyYWNrZWRDZWxscyA9IFtdO1xuXHR9XG5cbn1cblxuY2xhc3MgTm90ZWJvb2tTZWxlY3RBbGxGaW5kTWF0Y2hlcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX1NFTEVDVF9BTExfRklORF9NQVRDSEVTX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RBbGxGaW5kTWF0Y2hlcycsIFwiU2VsZWN0IEFsbCBPY2N1cnJlbmNlcyBvZiBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdFx0S0VZQklORElOR19DT05URVhUX05PVEVCT09LX0ZJTkRfV0lER0VUX0ZPQ1VTRURcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5TCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbnRleHQuY2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnNvckNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rRmluZENvbnRyaWI+KE5vdGVib29rRmluZENvbnRyaWIuaWQpO1xuXG5cdFx0aWYgKGZpbmRDb250cm9sbGVyLndpZGdldC5pc0ZvY3VzZWQpIHtcblx0XHRcdGNvbnN0IGZpbmRNb2RlbCA9IGZpbmRDb250cm9sbGVyLndpZGdldC5maW5kTW9kZWw7XG5cdFx0XHRjdXJzb3JDb250cm9sbGVyLnNlbGVjdEFsbE1hdGNoZXMoY29udGV4dC5jZWxsLCBmaW5kTW9kZWwuZmluZE1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJzb3JDb250cm9sbGVyLnNlbGVjdEFsbE1hdGNoZXMoY29udGV4dC5jZWxsKTtcblx0XHR9XG5cblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0FkZE1hdGNoVG9NdWx0aVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0FERF9GSU5EX01BVENIX1RPX1NFTEVDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkRmluZE1hdGNoVG9TZWxlY3Rpb24nLCBcIkFkZCBTZWxlY3Rpb24gdG8gTmV4dCBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9FRElUT1JfRk9DVVNFRCxcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbnRleHQuY2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlci5maW5kQW5kVHJhY2tOZXh0U2VsZWN0aW9uKGNvbnRleHQuY2VsbCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tFeGl0TXVsdGlTZWxlY3Rpb25BY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZU11bHRpQ3Vyc29yLmV4aXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdleGl0TXVsdGlTZWxlY3Rpb24nLCBcIkV4aXQgTXVsdGkgQ3Vyc29yIE1vZGVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlcj4oTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIuaWQpO1xuXHRcdGNvbnRyb2xsZXIucmVzZXRUb0lkbGVTdGF0ZSgpO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rRGVsZXRlTGVmdE11bHRpU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVNdWx0aUN1cnNvci5kZWxldGVMZWZ0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGVsZXRlTGVmdE11bHRpU2VsZWN0aW9uJywgXCJEZWxldGUgTGVmdFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULklzTm90ZWJvb2tNdWx0aUN1cnNvcixcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSxcblx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Ob3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGUuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nKVxuXHRcdFx0XHQpXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLkVkaXRpbmcpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlcj4oTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIuaWQpO1xuXHRcdGNvbnRyb2xsZXIuZGVsZXRlTGVmdCgpO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rRGVsZXRlUmlnaHRNdWx0aVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlTXVsdGlDdXJzb3IuZGVsZXRlUmlnaHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkZWxldGVSaWdodE11bHRpU2VsZWN0aW9uJywgXCJEZWxldGUgUmlnaHRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyksXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZylcblx0XHRcdFx0KVxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULklzTm90ZWJvb2tNdWx0aUN1cnNvcixcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyksXG5cdFx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Ob3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGUuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IG5iRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGlmICghbmJFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2VsbEVkaXRvciA9IG5iRWRpdG9yLmFjdGl2ZUNvZGVFZGl0b3I7XG5cdFx0aWYgKCFjZWxsRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gbmVlZCB0byBydW4gdGhlIGNvbW1hbmQgbWFudWFsbHkgc2luY2Ugd2UgYXJlIG92ZXJyaWRpbmcgdGhlIGNvbW1hbmQsIHRoaXMgZW5zdXJlcyBwcm9wZXIgY3Vyc29yIGFuaW1hdGlvbiBiZWhhdmlvclxuXHRcdENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgY2VsbEVkaXRvciwgbnVsbCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gbmJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlci5kZWxldGVSaWdodCgpO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rTXVsdGlDdXJzb3JVbmRvUmVkb0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ub3RlYm9vay5tdWx0aUN1cnNvclVuZG9SZWRvJztcblxuXHRjb25zdHJ1Y3RvcihASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsIEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignbm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgUFJJT1JJVFkgPSAxMDAwNTtcblx0XHR0aGlzLl9yZWdpc3RlcihVbmRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLW11bHRpY3Vyc29yLXVuZG8tcmVkbycsICgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cblx0XHRcdHJldHVybiBjb250cm9sbGVyLnVuZG8oKTtcblx0XHR9LCBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFJlZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2stbXVsdGljdXJzb3ItdW5kby1yZWRvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXI+KE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkKTtcblx0XHRcdHJldHVybiBjb250cm9sbGVyLnJlZG8oKTtcblx0XHR9LCBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdCkpKTtcblx0fVxufVxuXG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkLCBOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlcik7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tNdWx0aUN1cnNvclVuZG9SZWRvQ29udHJpYnV0aW9uLklELCBOb3RlYm9va011bHRpQ3Vyc29yVW5kb1JlZG9Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihOb3RlYm9va1NlbGVjdEFsbEZpbmRNYXRjaGVzKTtcbnJlZ2lzdGVyQWN0aW9uMihOb3RlYm9va0FkZE1hdGNoVG9NdWx0aVNlbGVjdGlvbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTm90ZWJvb2tFeGl0TXVsdGlTZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5vdGVib29rRGVsZXRlTGVmdE11bHRpU2VsZWN0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOb3RlYm9va0RlbGV0ZVJpZ2h0TXVsdGlTZWxlY3Rpb25BY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLCtCQUErQix1QkFBdUIsK0JBQStCLDZCQUE2QjtBQUMzSCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFdBQVcsMEJBQTBCO0FBQzlDLFNBQTBCLDZCQUE2QjtBQUN2RCxTQUFTLGlCQUFpQix5QkFBeUI7QUFDbkQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBaUMsZUFBeUU7QUFDMUcsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxRQUFRLHVCQUF1QjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBRWxFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQWdELGtCQUFrQiwyQkFBMkI7QUFDN0YsU0FBUyxnQ0FBZ0Msc0JBQXNCO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaURBQWlELDhCQUE4QixpQ0FBaUM7QUFDekgsU0FBaUMsc0JBQXNCO0FBQ3ZELFNBQWlDLHVDQUFxRztBQUN0SSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDZCQUE2QjtBQUd0QyxNQUFNLDBDQUEwQztBQUNoRCxNQUFNLHNDQUFzQztBQUVyQyxJQUFLLDJCQUFMLGtCQUFLQSw4QkFBTDtBQUNOLEVBQUFBLG9EQUFBO0FBQ0EsRUFBQUEsb0RBQUE7QUFDQSxFQUFBQSxvREFBQTtBQUhXLFNBQUFBO0FBQUEsR0FBQTtBQTZCTCxNQUFNLGdDQUFnQztBQUFBLEVBQzVDLHVCQUF1QixJQUFJLGNBQXVCLHlCQUF5QixLQUFLO0FBQUEsRUFDaEYsZ0NBQWdDLElBQUksY0FBd0Msa0NBQWtDLFlBQTZCO0FBQzVJO0FBRU8sSUFBTSxnQ0FBTixjQUE0QyxXQUFrRDtBQUFBLEVBNEJwRyxZQUNrQixnQkFDb0IsbUJBQ0Qsa0JBQ1ksOEJBQ1Isc0JBQ0Esc0JBQ0wsaUJBQ2xDO0FBQ0QsVUFBTTtBQVJXO0FBQ29CO0FBQ0Q7QUFDWTtBQUNSO0FBQ0E7QUFDTDtBQUduQyxTQUFLLE9BQU87QUFDWixTQUFLLGVBQWUsQ0FBQztBQUNyQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDaEUsU0FBSyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFDekQsU0FBSyxvQkFBb0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDN0QsU0FBSyxxQkFBcUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDOUQsU0FBSyxxQkFBcUIsSUFBSSxZQUErQjtBQUM3RCxTQUFLLFFBQVE7QUFDYixTQUFLLDBCQUEwQiw4QkFBOEIsc0JBQXNCLE9BQU8sS0FBSyxpQkFBaUI7QUFDaEgsU0FBSyxzQkFBc0IsOEJBQThCLCtCQUErQixPQUFPLEtBQUssaUJBQWlCO0FBRXJILFNBQUssYUFBYSxLQUFLLGVBQWU7QUFLdEMsU0FBSyxVQUFVLEtBQUssc0JBQXNCLFlBQVk7QUFDckQsWUFBTSxLQUFLLHVCQUF1QjtBQUNsQyxXQUFLLG9CQUFvQjtBQUFBLElBQzFCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQXRDTyxXQUFxQztBQUMzQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFzQ1Esc0JBQXNCO0FBQzdCLFNBQUssa0JBQWtCLE1BQU07QUFFN0IsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixZQUFNLElBQUksTUFBTSwwQkFBMEI7QUFBQSxJQUMzQztBQUdBLFNBQUssa0JBQWtCLElBQUksS0FBSyxXQUFXLENBQUMsRUFBRSxXQUFXLENBQUMsVUFBVTtBQUNuRSxZQUFNLFlBQVksSUFBSSx5QkFBeUI7QUFDL0MsV0FBSyxhQUFhLFFBQVEsVUFBUTtBQUNqQyxjQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNyRSxZQUFJLENBQUMsWUFBWTtBQUVoQjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLEtBQUssY0FBYyxXQUFXLEtBQUssYUFBYSxDQUFDLEVBQUUsUUFBUTtBQUM5RCxxQkFBVyxLQUFLLFdBQVcsT0FBTyxVQUFVO0FBQUEsUUFDN0M7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUVGLFNBQUssa0JBQWtCLElBQUksS0FBSyxXQUFXLENBQUMsRUFBRSxVQUFVLE1BQU07QUFDN0QsV0FBSyxRQUFRO0FBQ2IsV0FBSyxvQkFBb0IsSUFBSSxlQUFnQztBQUU3RCxZQUFNLG1CQUFtQixLQUFLLG1CQUFtQixJQUFJLEtBQUssV0FBWSxDQUFDLEVBQUUsR0FBRztBQUM1RSxVQUFJLENBQUMsa0JBQWtCO0FBQ3RCO0FBQUEsTUFDRDtBQUNBLFlBQU0sbUJBQW1CLEtBQUssZUFBZSxrQkFBa0IsY0FBYztBQUM3RSxVQUFJLENBQUMsa0JBQWtCO0FBQ3RCO0FBQUEsTUFDRDtBQUdBLHVCQUFpQixjQUFjLElBQUkseUJBQXlCLEdBQUcsWUFBWSxrQkFBa0IsbUJBQW1CLFFBQVE7QUFFeEgsV0FBSyxhQUFhLFFBQVEsVUFBUTtBQUNqQyxjQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNyRSxZQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLFFBQ0Q7QUFHQSxhQUFLLG1CQUFtQixXQUFXLGFBQWE7QUFFaEQsYUFBSyxrQkFBa0IsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxXQUFLLHNCQUFzQjtBQUFBLElBQzVCLENBQUMsQ0FBQztBQUdGLFNBQUssa0JBQWtCLElBQUksS0FBSyxXQUFXLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxNQUFNO0FBQy9FLFVBQUksRUFBRSxXQUFXLFNBQVM7QUFDekIsYUFBSyxpQkFBaUI7QUFDdEI7QUFBQSxNQUNEO0FBR0EsVUFBSSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxtQkFBbUIsVUFBVSxFQUFFLFdBQVcsbUJBQW1CLG9CQUFvQjtBQUNySDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGNBQW9DO0FBQUEsUUFDekMsZUFBZSxFQUFFLFVBQVUsY0FBYyxFQUFFLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDNUQsZ0JBQWdCLEVBQUUsVUFBVSxrQkFBa0IsRUFBRSxjQUFjLENBQUMsRUFBRTtBQUFBLFFBQ2pFLGFBQWEsRUFBRSxVQUFVLFlBQVksRUFBRSxjQUFjLENBQUMsRUFBRTtBQUFBLFFBQ3hELGNBQWMsRUFBRSxVQUFVLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxFQUFFO0FBQUEsTUFDOUQ7QUFDQSxZQUFNLGlCQUFpQixFQUFFLFVBQVUsYUFBYTtBQUVoRCxXQUFLLGFBQWEsUUFBUSxVQUFRO0FBQ2pDLGNBQU0sYUFBYSxLQUFLLG1CQUFtQixJQUFJLEtBQUssY0FBYyxHQUFHO0FBQ3JFLFlBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsUUFDRDtBQUVBLGNBQU0sZ0JBQWdCLFdBQVcsY0FBYyxFQUFFLElBQUksZUFBYTtBQUNqRSxnQkFBTSxjQUFjLFVBQVUsY0FBYyxZQUFZO0FBQ3hELGdCQUFNLGVBQWUsVUFBVSxrQkFBa0IsWUFBWTtBQUM3RCxnQkFBTSxZQUFZLFVBQVUsWUFBWSxZQUFZO0FBQ3BELGdCQUFNLGFBQWEsVUFBVSxnQkFBZ0IsWUFBWTtBQUN6RCxpQkFBTyxVQUFVLG9CQUFvQixjQUFjLGFBQWEsWUFBWSxXQUFXLGNBQWM7QUFBQSxRQUN0RyxDQUFDO0FBRUQsbUJBQVcsY0FBYyxJQUFJLHlCQUF5QixHQUFHLEVBQUUsUUFBUSxlQUFlLG1CQUFtQixRQUFRO0FBQUEsTUFDOUcsQ0FBQztBQUVELFdBQUssc0JBQXNCO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBR0YsU0FBSyxrQkFBa0IsSUFBSSxLQUFLLFdBQVcsQ0FBQyxFQUFFLGtDQUFrQyxDQUFDLE1BQU07QUFDdEYsV0FBSywyQkFBMkIsQ0FBQztBQUFBLElBQ2xDLENBQUMsQ0FBQztBQUdGLFNBQUssa0JBQWtCLElBQUksS0FBSyxXQUFXLENBQUMsRUFBRSxzQkFBc0IsTUFBTTtBQUN6RSxVQUFJLEtBQUssVUFBVSxxQkFBc0MsS0FBSyxVQUFVLGlCQUFrQztBQUN6RyxhQUFLLGlCQUFpQjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFjLHlCQUF5QjtBQUN0QyxTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFVBQU0sUUFBUSxJQUFJLEtBQUssYUFBYSxJQUFJLE9BQU0sU0FBUTtBQUNyRCxZQUFNLGFBQWEsTUFBTSxLQUFLLHVCQUF1QixJQUFJO0FBQ3pELFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUNBLFdBQUssbUJBQW1CLElBQUksS0FBSyxjQUFjLEtBQUssVUFBVTtBQUU5RCxZQUFNLGFBQWEsS0FBSztBQUN4QixpQkFBVyxjQUFjLElBQUkseUJBQXlCLEdBQUcsUUFBVyxZQUFZLG1CQUFtQixRQUFRO0FBQUEsSUFDNUcsQ0FBQyxDQUFDO0FBRUYsU0FBSyxzQkFBc0I7QUFBQSxFQUM1QjtBQUFBLEVBRUEsTUFBYyx1QkFBdUIsTUFBMkQ7QUFDL0YsVUFBTSxlQUFlLE1BQU0sS0FBSyxpQkFBaUIscUJBQXFCLEtBQUssY0FBYyxHQUFHO0FBQzVGLFVBQU0sWUFBWSxhQUFhLE9BQU87QUFDdEMsUUFBSSxDQUFDLFdBQVc7QUFDZixtQkFBYSxRQUFRO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBQ0EsU0FBSyxtQkFBbUIsSUFBSSxZQUFZO0FBRXhDLFVBQU0sb0JBQW9CLEtBQUssMkJBQTJCLEtBQUssYUFBYTtBQUM1RSxVQUFNLFlBQVksS0FBSyw4QkFBOEI7QUFDckQsVUFBTSxlQUFlLEtBQUs7QUFFMUIsVUFBTSxhQUFhLEtBQUssbUJBQW1CLElBQUksSUFBSTtBQUFBLE1BQ2xEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksb0JBQW9CLFVBQVUsY0FBYyxHQUFHLFVBQVUsV0FBVyxHQUFHLGNBQWMsS0FBSyw0QkFBNEI7QUFBQSxJQUMzSCxDQUFDO0FBRUQsZUFBVyxjQUFjLElBQUkseUJBQXlCLEdBQUcsUUFBVyxLQUFLLGlCQUFpQixtQkFBbUIsUUFBUTtBQUNySCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0NBQXVEO0FBQzlELFdBQU87QUFBQSxNQUNOLG1DQUFtQyxjQUFrQztBQUNwRSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsNkJBQTZCLFdBQXlCO0FBQ3JELGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxxQkFBcUIsY0FBd0IsdUJBQTJDO0FBQ3ZGLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxrQkFBa0IsV0FBa0Isb0JBQWtDO0FBQ3JFLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxtQ0FBbUMsZUFBeUIsVUFBNkIscUJBQStCLG1CQUF1QztBQUM5SixlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsNkJBQTZCLFlBQW1CLFVBQW9DO0FBQ25GLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSx1QkFBdUIsZUFBa0M7QUFDeEQsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLDBCQUEwQixpQkFBaUM7QUFDMUQsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLGlDQUFpQyxpQkFBeUIsYUFBNkI7QUFDdEYsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsMkJBQTJCLE1BQTBDO0FBQzVFLFdBQU87QUFBQSxNQUNOLGVBQXVCO0FBQ3RCLGVBQU8sS0FBSyxXQUFXLGFBQWE7QUFBQSxNQUNyQztBQUFBLE1BQ0EsZUFBZSxZQUE0QjtBQUMxQyxlQUFPLEtBQUssV0FBVyxlQUFlLFVBQVU7QUFBQSxNQUNqRDtBQUFBLE1BQ0EsaUJBQWlCLFlBQTRCO0FBQzVDLGVBQU8sS0FBSyxXQUFXLGlCQUFpQixVQUFVO0FBQUEsTUFDbkQ7QUFBQSxNQUNBLGlCQUFpQixZQUE0QjtBQUM1QyxlQUFPLEtBQUssV0FBVyxpQkFBaUIsVUFBVTtBQUFBLE1BQ25EO0FBQUEsTUFDQSxnQ0FBZ0MsWUFBNEI7QUFDM0QsZUFBTyxLQUFLLFdBQVcsZ0NBQWdDLFVBQVU7QUFBQSxNQUNsRTtBQUFBLE1BQ0EsK0JBQStCLFlBQTRCO0FBQzFELGVBQU8sS0FBSyxXQUFXLCtCQUErQixVQUFVO0FBQUEsTUFDakU7QUFBQSxNQUNBLGtCQUFrQixVQUFvQixVQUFzQztBQUMzRSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0Esb0JBQW9CLFlBQTRCO0FBQy9DLGVBQU8sYUFBYSxLQUFLLFdBQVcsZUFBZSxVQUFVLENBQUMsSUFBSTtBQUFBLE1BQ25FO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUEyQixHQUFpQztBQUNuRSxTQUFLLGFBQWEsUUFBUSxVQUFRO0FBQ2pDLFVBQUksS0FBSyxjQUFjLFdBQVcsS0FBSyxhQUFhLENBQUMsRUFBRSxRQUFRO0FBQzlEO0FBQUEsTUFDRDtBQUVBLFlBQU0sa0JBQWtCLElBQUkseUJBQXlCO0FBQ3JELFlBQU0sYUFBYSxLQUFLLG1CQUFtQixJQUFJLEtBQUssY0FBYyxHQUFHO0FBQ3JFLFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUNBLFdBQUssdUJBQXVCLFlBQVksaUJBQWlCLENBQUM7QUFBQSxJQUMzRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsdUJBQXVCLFlBQStCLGlCQUEyQyxHQUFpQztBQUN6SSxZQUFRLEVBQUUsV0FBVztBQUFBLE1BQ3BCLEtBQUssUUFBUTtBQUNaLG1CQUFXLGlCQUFpQixlQUFlO0FBQzNDO0FBQUEsTUFDRCxLQUFLLFFBQVE7QUFDWixtQkFBVyxlQUFlLGlCQUFpQixFQUFFLE1BQU07QUFDbkQ7QUFBQSxNQUNELEtBQUssUUFBUSxxQkFBcUI7QUFDakMsY0FBTSxPQUE0QyxFQUFFO0FBQ3BELG1CQUFXLGdCQUFnQixpQkFBaUIsS0FBSyxRQUFRLElBQUksS0FBSyxrQkFBa0IsR0FBRyxHQUFHLEdBQUcsRUFBRSxNQUFNO0FBQ3JHO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxRQUFRLGlCQUFpQjtBQUM3QixjQUFNLE9BQXdDLEVBQUU7QUFDaEQsbUJBQVcsZ0JBQWdCLGlCQUFpQixLQUFLLFFBQVEsSUFBSSxLQUFLLHNCQUFzQixHQUFHLEtBQUssc0JBQXNCLEdBQUcsS0FBSyxpQkFBaUIsR0FBRyxFQUFFLE1BQU07QUFDMUo7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFFBQVEsT0FBTztBQUNuQixjQUFNLE9BQThCLEVBQUU7QUFDdEMsbUJBQVcsTUFBTSxpQkFBaUIsS0FBSyxRQUFRLElBQUksS0FBSyxrQkFBa0IsT0FBTyxLQUFLLG1CQUFtQixNQUFNLEVBQUUsTUFBTTtBQUN2SDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssUUFBUTtBQUNaLG1CQUFXLElBQUksaUJBQWlCLEVBQUUsTUFBTTtBQUN4QztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBNEI7QUFDbkMsZUFBVyxRQUFRLEtBQUssY0FBYztBQUNyQyxZQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNyRSxVQUFJLENBQUMsWUFBWTtBQUVoQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGNBQWMsY0FBYyxXQUFXLGNBQWMsQ0FBQztBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQXNCO0FBQzdCLFVBQU0sa0JBQWtCLEtBQUssYUFBYSxDQUFDLEVBQUUsU0FBUztBQUN0RCxRQUFJLENBQUMsaUJBQWlCO0FBRXJCO0FBQUEsSUFDRDtBQUVBLFVBQU0saUJBQWtELElBQUksWUFBZ0M7QUFDNUYsVUFBTSxZQUFtQixDQUFDO0FBRTFCLFNBQUssYUFBYSxRQUFRLGtCQUFnQjtBQUN6QyxZQUFNLGdCQUFnQixhQUFhO0FBQ25DLFVBQUksQ0FBQyxlQUFlO0FBQ25CO0FBQUEsTUFDRDtBQUVBLGdCQUFVLEtBQUssYUFBYSxjQUFjLEdBQUc7QUFFN0MsWUFBTSxzQkFBc0IsS0FBSyxnQkFBZ0IsWUFBWSxhQUFhLGNBQWMsR0FBRyxFQUFFLEtBQUssTUFBTTtBQUN4RyxZQUFNLGtCQUFrQixhQUFhLGdCQUFnQixLQUFLLE1BQU07QUFDaEUsWUFBTSxjQUFjLG9CQUFvQixNQUFNLGdCQUFnQixNQUFNO0FBQ3BFLFVBQUksWUFBWSxXQUFXLEdBQUc7QUFDN0I7QUFBQSxNQUNEO0FBRUEscUJBQWUsSUFBSSxhQUFhLGNBQWMsS0FBSyxXQUFXO0FBRTlELFdBQUssZ0JBQWdCLGVBQWUsYUFBYSxjQUFjLEdBQUc7QUFDbEUsc0JBQWdCLFFBQVEsYUFBVztBQUNsQyxhQUFLLGdCQUFnQixZQUFZLE9BQU87QUFBQSxNQUN6QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnQkFBZ0IsWUFBWTtBQUFBLE1BQ2hDLE1BQU0sb0JBQW9CO0FBQUEsTUFDMUI7QUFBQSxNQUNBLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLG1CQUFtQjtBQUFBLE1BQ25CLE1BQU0sWUFBWTtBQUNqQix1QkFBZSxRQUFRLE9BQU0sVUFBUztBQUNyQyxnQkFBTSxRQUFRLEVBQUUsUUFBUSxPQUFNLFlBQVc7QUFDeEMsa0JBQU0sUUFBUSxLQUFLO0FBQUEsVUFDcEIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE1BQU0sWUFBWTtBQUNqQix1QkFBZSxRQUFRLE9BQU0sVUFBUztBQUNyQyxnQkFBTSxRQUFRLE9BQU0sWUFBVztBQUM5QixrQkFBTSxRQUFRLEtBQUs7QUFBQSxVQUNwQixDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLG1CQUFtQjtBQUN6QixTQUFLLFFBQVE7QUFDYixTQUFLLG9CQUFvQixJQUFJLFlBQTZCO0FBQzFELFNBQUssd0JBQXdCLElBQUksS0FBSztBQUN0QyxTQUFLLG9CQUFvQjtBQUV6QixTQUFLLGFBQWEsUUFBUSxVQUFRO0FBQ2pDLFdBQUssaUJBQWlCLElBQUk7QUFDMUIsV0FBSyxjQUFjLGNBQWMsQ0FBQyxLQUFLLGdCQUFnQixDQUFDO0FBQUEsSUFDekQsQ0FBQztBQUVELFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxhQUFhO0FBQ2xCLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxtQkFBbUIsTUFBTTtBQUM5QixTQUFLLGVBQWUsQ0FBQztBQUNyQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFhLDBCQUEwQixhQUE0QztBQUNsRixRQUFJLEtBQUssVUFBVSxjQUErQjtBQUNqRCxZQUFNLFlBQVksWUFBWTtBQUM5QixVQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsTUFDRDtBQUVBLFlBQU0saUJBQWlCLFlBQVksY0FBYyxFQUFFLENBQUM7QUFDcEQsWUFBTSxPQUFPLEtBQUssUUFBUSxnQkFBZ0IsU0FBUztBQUNuRCxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLFdBQUssT0FBTyxLQUFLO0FBR2pCLFlBQU0sb0JBQW9CLEtBQUssZUFBZTtBQUM5QyxVQUFJLG1CQUFtQjtBQUN0QixjQUFNLGFBQWEsa0JBQWtCLFlBQVksS0FBSyxNQUFNLE9BQU8sTUFBTSxxQkFBcUI7QUFDOUYsYUFBSyxvQkFBb0IsV0FBVyxPQUFPLENBQUMsS0FBSyxjQUFjLE1BQU0sVUFBVSxRQUFRLFFBQVEsQ0FBQztBQUFBLE1BQ2pHO0FBRUEsWUFBTSxRQUFRLEtBQUssZUFBZSxhQUFhLFdBQVc7QUFDMUQsVUFBSSxVQUFVLFFBQVc7QUFDeEI7QUFBQSxNQUNEO0FBRUEsV0FBSyxnQkFBZ0I7QUFBQSxRQUNwQixXQUFXO0FBQUEsUUFDWCxVQUFVLElBQUksU0FBUyxlQUFlLGlCQUFpQixLQUFLLFdBQVc7QUFBQSxNQUN4RTtBQUVBLFlBQU0sZUFBZSxJQUFJO0FBQUEsUUFDeEIsZUFBZTtBQUFBLFFBQ2YsS0FBSztBQUFBLFFBQ0wsZUFBZTtBQUFBLFFBQ2YsS0FBSztBQUFBLE1BQ047QUFDQSxrQkFBWSxjQUFjLENBQUMsWUFBWSxDQUFDO0FBRXhDLFdBQUssYUFBYSxLQUFLLGVBQWU7QUFDdEMsVUFBSSxDQUFDLEtBQUssY0FBYyxLQUFLLFdBQVcsQ0FBQyxFQUFFLFdBQVcsWUFBWSxRQUFRO0FBQ3pFLGNBQU0sSUFBSSxNQUFNLDJEQUEyRDtBQUFBLE1BQzVFO0FBQ0EsVUFBSSxFQUFFLEtBQUssV0FBVyxDQUFDLGFBQWEsbUJBQW1CO0FBQ3RELGNBQU0sSUFBSSxNQUFNLG9EQUFvRDtBQUFBLE1BQ3JFO0FBRUEsWUFBTSxLQUFLLGtCQUFrQixhQUFhLENBQUMsWUFBWSxDQUFDO0FBRXhELFdBQUssd0JBQXdCLElBQUksSUFBSTtBQUNyQyxXQUFLLFFBQVE7QUFDYixXQUFLLG9CQUFvQixJQUFJLGlCQUFrQztBQUUvRCxXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFFbEMsV0FBVyxLQUFLLFVBQVUsbUJBQW9DO0FBQzdELFlBQU0sb0JBQW9CLEtBQUssZUFBZTtBQUM5QyxVQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxLQUFLLGVBQWUsYUFBYSxXQUFXO0FBQzFELFVBQUksVUFBVSxRQUFXO0FBQ3hCO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEI7QUFBQSxNQUNEO0FBR0EsWUFBTSxrQkFBa0IsS0FBSyxhQUFhLE9BQU8sQ0FBQyxLQUFLLGdCQUFnQixNQUFNLFlBQVksZ0JBQWdCLFFBQVEsQ0FBQztBQUVsSCxVQUFJLG1CQUFtQixLQUFLLG1CQUFtQjtBQUU5QztBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsa0JBQWtCO0FBQUEsUUFDcEMsS0FBSztBQUFBLFFBQ0wsRUFBRSxXQUFXLE9BQU8sVUFBVSxZQUFZLGNBQWMsRUFBRSxZQUFZLGNBQWMsRUFBRSxTQUFTLENBQUMsRUFBRSxlQUFlLEVBQUU7QUFBQSxRQUNuSDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxLQUFLO0FBQUEsTUFDTjtBQUNBLFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUVBLFlBQU0sMEJBQTBCLEtBQUssZUFBZSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU07QUFDMUYsVUFBSSxDQUFDLHlCQUF5QjtBQUM3QjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFdBQVcsS0FBSyxXQUFXLFlBQVksUUFBUTtBQUNsRCxjQUFNLGFBQWEsQ0FBQyxHQUFHLFlBQVksY0FBYyxHQUFHLFVBQVUsVUFBVSxXQUFXLE1BQU0sT0FBTyxtQkFBbUIsR0FBRyxDQUFDO0FBQ3ZILGNBQU0sY0FBYyxNQUFNLEtBQUssa0JBQWtCLGFBQWEsVUFBVTtBQUN4RSxnQ0FBd0IsY0FBYyxZQUFZLGVBQWU7QUFBQSxNQUdsRSxXQUFXLFdBQVcsS0FBSyxXQUFXLFlBQVksUUFBUTtBQUN6RCxjQUFNLEtBQUssZUFBZSx1QkFBdUIseUJBQXlCLFdBQVcsTUFBTSxLQUFLO0FBQ2hHLGNBQU0sS0FBSyxlQUFlLGtCQUFrQix5QkFBeUIsUUFBUTtBQUU3RSxjQUFNLGNBQWMsTUFBTSxLQUFLLGtCQUFrQix5QkFBeUIsQ0FBQyxVQUFVLFVBQVUsV0FBVyxNQUFNLE9BQU8sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBQy9JLGdDQUF3QixjQUFjLFlBQVksZUFBZTtBQUVqRSxhQUFLLGFBQWEsS0FBSyxlQUFlO0FBQ3RDLFlBQUksQ0FBQyxLQUFLLGNBQWMsRUFBRSxLQUFLLFdBQVcsQ0FBQyxhQUFhLG1CQUFtQjtBQUMxRSxnQkFBTSxJQUFJLE1BQU0sb0RBQW9EO0FBQUEsUUFDckU7QUFFQSxhQUFLLHVCQUF1QixLQUFLO0FBSWpDLGFBQUssaUNBQWlDLEtBQUssYUFBYSxLQUFLLENBQUFDLGlCQUFlQSxhQUFZLGNBQWMsV0FBVyxZQUFZLE1BQU0sQ0FBQztBQUFBLE1BQ3JJO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWEsaUJBQWlCLGFBQTZCLFNBQW1EO0FBQzdHLFVBQU0sb0JBQW9CLEtBQUssZUFBZTtBQUM5QyxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUztBQUNaLFlBQU0sS0FBSyxpQ0FBaUMsT0FBTztBQUFBLElBQ3BELE9BQU87QUFDTixZQUFNLEtBQUssaUNBQWlDLG1CQUFtQixXQUFXO0FBQUEsSUFDM0U7QUFFQSxVQUFNLEtBQUssdUJBQXVCO0FBQ2xDLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQWMsaUNBQWlDLFNBQW1DO0FBRWpGLFFBQUksS0FBSyxVQUFVLGNBQStCO0FBQ2pEO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxRQUFRLFFBQVE7QUFDcEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLGVBQWUsa0JBQWtCLFFBQVEsQ0FBQyxFQUFFLE1BQU0sUUFBUTtBQUNyRSxTQUFLLGFBQWEsS0FBSyxlQUFlO0FBRXRDLFNBQUssZUFBZSxDQUFDO0FBQ3JCLGVBQVcsU0FBUyxTQUFTO0FBQzVCLFdBQUssa0JBQWtCLE1BQU0sTUFBTSxNQUFNLGVBQWUsSUFBSSxDQUFBQyxXQUFTLFVBQVUsVUFBVUEsT0FBTSxPQUFPLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUU5SCxVQUFJLEtBQUssY0FBYyxNQUFNLEtBQUssV0FBVyxLQUFLLFdBQVcsQ0FBQyxFQUFFLFFBQVE7QUFFdkUsY0FBTSxLQUFLLGNBQWMsTUFBTSxlQUFlLElBQUksQ0FBQUEsV0FBUyxVQUFVLFVBQVVBLE9BQU0sT0FBTyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNySDtBQUFBLElBQ0Q7QUFFQSxTQUFLLHdCQUF3QixJQUFJLElBQUk7QUFDckMsU0FBSyxRQUFRO0FBQ2IsU0FBSyxvQkFBb0IsSUFBSSxpQkFBa0M7QUFBQSxFQUNoRTtBQUFBLEVBRUEsTUFBYyxpQ0FBaUMsbUJBQXNDLGFBQTZCO0FBRWpILFFBQUksS0FBSyxVQUFVLGNBQStCO0FBRWpELFlBQU0sWUFBWSxZQUFZO0FBQzlCLFVBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxNQUNEO0FBQ0EsWUFBTSxpQkFBaUIsWUFBWSxjQUFjLEVBQUUsQ0FBQztBQUNwRCxZQUFNLE9BQU8sS0FBSyxRQUFRLGdCQUFnQixTQUFTO0FBQ25ELFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBQ0EsV0FBSyxPQUFPLEtBQUs7QUFDakIsWUFBTSxRQUFRLEtBQUssZUFBZSxhQUFhLFdBQVc7QUFDMUQsVUFBSSxVQUFVLFFBQVc7QUFDeEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxnQkFBZ0I7QUFBQSxRQUNwQixXQUFXO0FBQUEsUUFDWCxVQUFVLElBQUksU0FBUyxlQUFlLGlCQUFpQixLQUFLLFdBQVc7QUFBQSxNQUN4RTtBQUVBLFdBQUssYUFBYSxLQUFLLGVBQWU7QUFDdEMsVUFBSSxDQUFDLEtBQUssY0FBYyxLQUFLLFdBQVcsQ0FBQyxFQUFFLFdBQVcsWUFBWSxRQUFRO0FBQ3pFLGNBQU0sSUFBSSxNQUFNLDJEQUEyRDtBQUFBLE1BQzVFO0FBQ0EsVUFBSSxFQUFFLEtBQUssV0FBVyxDQUFDLGFBQWEsbUJBQW1CO0FBQ3RELGNBQU0sSUFBSSxNQUFNLG9EQUFvRDtBQUFBLE1BQ3JFO0FBR0EsWUFBTSxjQUFjLGtCQUFrQixZQUFZLEtBQUssTUFBTSxPQUFPLE1BQU0scUJBQXFCO0FBRy9GLFdBQUssZUFBZSxDQUFDO0FBQ3JCLGlCQUFXLE9BQU8sYUFBYTtBQUM5QixjQUFNLEtBQUssa0JBQWtCLElBQUksTUFBTSxJQUFJLFFBQVEsSUFBSSxXQUFTLFVBQVUsVUFBVSxNQUFNLE9BQU8sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBRXpILFlBQUksSUFBSSxLQUFLLFdBQVcsWUFBWSxRQUFRO0FBQzNDLGdCQUFNLGdCQUFnQixLQUFLLGVBQWUsZ0JBQWdCLElBQUksS0FBSyxNQUFNO0FBQ3pFLGNBQUksZUFBZTtBQUNsQiwwQkFBYyxjQUFjLElBQUksUUFBUSxJQUFJLFdBQVMsVUFBVSxVQUFVLE1BQU0sT0FBTyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUMvRztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsV0FBSyx3QkFBd0IsSUFBSSxJQUFJO0FBQ3JDLFdBQUssUUFBUTtBQUNiLFdBQUssb0JBQW9CLElBQUksaUJBQWtDO0FBQUEsSUFFaEUsV0FBVyxLQUFLLFVBQVUsbUJBQW9DO0FBRTdELFlBQU0sY0FBYyxrQkFBa0IsWUFBWSxLQUFLLE1BQU0sT0FBTyxNQUFNLHFCQUFxQjtBQUcvRixpQkFBVyxPQUFPLGFBQWE7QUFDOUIsY0FBTSxLQUFLLGtCQUFrQixJQUFJLE1BQU0sSUFBSSxRQUFRLElBQUksV0FBUyxVQUFVLFVBQVUsTUFBTSxPQUFPLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzFIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE1BQThDLFlBQXlCO0FBQ3RHLFVBQU0sZ0JBQWdCLGdCQUFnQix3QkFBd0IsS0FBSyxlQUFlLGdCQUFnQixLQUFLLE1BQU0sSUFBSTtBQUNqSCxRQUFJLENBQUMsZUFBZTtBQUNuQixZQUFNLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxJQUNqQztBQUVBLFFBQUksZUFBZSxLQUFLLGFBQWEsS0FBSyxpQkFBZSxZQUFZLGNBQWMsV0FBVyxjQUFjLE1BQU07QUFFbEgsUUFBSSxjQUFjO0FBQ2pCLFdBQUssaUJBQWlCLFlBQVk7QUFDbEMsbUJBQWEsa0JBQWtCO0FBQUEsSUFDaEMsT0FBTztBQUNOLFlBQU0sbUJBQW1CLGNBQWMsY0FBYyxFQUFFLENBQUM7QUFDeEQsWUFBTSxZQUFZLE1BQU0sY0FBYyxpQkFBaUI7QUFDdkQsZ0JBQVUsaUJBQWlCO0FBRTNCLFlBQU0sZUFBZSxLQUFLLDJCQUEyQixhQUFhO0FBQ2xFLFlBQU0sbUJBQW1CLGFBQWEsY0FBYztBQUNwRCxZQUFNLGVBQXFDO0FBQUEsUUFDMUMsYUFBYSxzQkFBc0IsaUJBQWlCLFdBQVk7QUFBQSxRQUNoRSxnQkFBZ0IsOEJBQThCLGlCQUFpQixjQUFlO0FBQUEsUUFDOUUsNEJBQTRCLGlCQUFpQjtBQUFBLE1BQzlDO0FBRUEscUJBQWU7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0EsaUJBQWlCO0FBQUEsUUFDakI7QUFBQSxRQUNBO0FBQUEsUUFDQSxlQUFlLENBQUM7QUFBQSxRQUNoQixpQkFBaUIsS0FBSyxnQkFBZ0IsWUFBWSxjQUFjLEdBQUc7QUFBQSxNQUNwRTtBQUNBLFdBQUssYUFBYSxLQUFLLFlBQVk7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFhLGFBQTRCO0FBQ3hDLFNBQUssYUFBYSxRQUFRLFVBQVE7QUFDakMsWUFBTSxhQUFhLEtBQUssbUJBQW1CLElBQUksS0FBSyxjQUFjLEdBQUc7QUFDckUsVUFBSSxDQUFDLFlBQVk7QUFFaEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxDQUFDLEVBQUUsUUFBUSxJQUFJLGlCQUFpQjtBQUFBLFFBQ3JDLFdBQVcseUJBQXlCO0FBQUEsUUFDcEMsV0FBVyxRQUFRO0FBQUEsUUFDbkIsV0FBVyxRQUFRO0FBQUEsUUFDbkIsV0FBVyxjQUFjO0FBQUEsUUFDekIsV0FBVyx3QkFBd0I7QUFBQSxNQUNwQztBQUVBLFlBQU0sZ0JBQWdCLGdCQUFnQixnQkFBZ0IsV0FBVyxRQUFRLE9BQU8sV0FBVyxjQUFjLEdBQUcsUUFBUTtBQUNwSCxVQUFJLENBQUMsZUFBZTtBQUNuQjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxjQUFjLElBQUkseUJBQXlCLEdBQUcsUUFBVyxlQUFlLG1CQUFtQixRQUFRO0FBQUEsSUFDL0csQ0FBQztBQUNELFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQWEsY0FBNkI7QUFDekMsU0FBSyxhQUFhLFFBQVEsVUFBUTtBQUNqQyxZQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNyRSxVQUFJLENBQUMsWUFBWTtBQUVoQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLENBQUMsRUFBRSxRQUFRLElBQUksaUJBQWlCO0FBQUEsUUFDckMsV0FBVyx5QkFBeUI7QUFBQSxRQUNwQyxXQUFXLFFBQVE7QUFBQSxRQUNuQixXQUFXLFFBQVE7QUFBQSxRQUNuQixXQUFXLGNBQWM7QUFBQSxNQUMxQjtBQUVBLFVBQUksS0FBSyxjQUFjLFdBQVcsS0FBSyxhQUFhLENBQUMsRUFBRSxRQUFRO0FBQzlELGNBQU0sZ0JBQWdCLGdCQUFnQixnQkFBZ0IsV0FBVyxRQUFRLE9BQU8sV0FBVyxjQUFjLEdBQUcsUUFBUTtBQUNwSCxZQUFJLENBQUMsZUFBZTtBQUNuQjtBQUFBLFFBQ0Q7QUFDQSxtQkFBVyxjQUFjLElBQUkseUJBQXlCLEdBQUcsUUFBVyxlQUFlLG1CQUFtQixRQUFRO0FBQUEsTUFDL0csT0FBTztBQUVOLG1CQUFXLGNBQWMsSUFBSSx5QkFBeUIsR0FBRyxRQUFXLEtBQUssY0FBYyxjQUFjLEdBQUcsbUJBQW1CLFFBQVE7QUFBQSxNQUNwSTtBQUFBLElBRUQsQ0FBQztBQUNELFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQU0sT0FBTztBQUNaLFVBQU0sU0FBdUIsQ0FBQztBQUM5QixlQUFXLFFBQVEsS0FBSyxjQUFjO0FBQ3JDLFlBQU0sUUFBUSxNQUFNLEtBQUssY0FBYyxpQkFBaUI7QUFDeEQsVUFBSSxPQUFPO0FBQ1YsZUFBTyxLQUFLLEtBQUs7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsSUFBSSxPQUFPLElBQUksV0FBUyxNQUFNLEtBQUssQ0FBQyxDQUFDO0FBQ25ELFNBQUssMEJBQTBCO0FBQy9CLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQU0sT0FBTztBQUNaLFVBQU0sU0FBdUIsQ0FBQztBQUM5QixlQUFXLFFBQVEsS0FBSyxjQUFjO0FBQ3JDLFlBQU0sUUFBUSxNQUFNLEtBQUssY0FBYyxpQkFBaUI7QUFDeEQsVUFBSSxPQUFPO0FBQ1YsZUFBTyxLQUFLLEtBQUs7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsSUFBSSxPQUFPLElBQUksV0FBUyxNQUFNLEtBQUssQ0FBQyxDQUFDO0FBQ25ELFNBQUssMEJBQTBCO0FBQy9CLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVRLDJCQUEyQixNQUEyQztBQUM3RSxVQUFNLG9CQUFvQixJQUFJLGtCQUFrQixLQUFLLGVBQWUseUJBQXlCLEtBQUssUUFBUSxHQUFHLEtBQUssZUFBZSxpQkFBaUIsS0FBSyxvQkFBb0I7QUFDM0ssVUFBTSxVQUFVLGtCQUFrQixnQkFBZ0IsS0FBSyxrQkFBa0IsS0FBSyxHQUFHO0FBQ2pGLHNCQUFrQixRQUFRO0FBQzFCLFdBQU8sSUFBSSxvQkFBb0IsT0FBTyxPQUFPLGVBQWUsU0FBUyxNQUFNLEtBQUssb0JBQW9CO0FBQUEsRUFDckc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxpQ0FBaUMsTUFBK0I7QUFDdkUsUUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQXVDLENBQUM7QUFDOUMsU0FBSyxnQkFBZ0IsUUFBUSxlQUFhO0FBRXpDLGtCQUFZLEtBQUs7QUFBQSxRQUNoQixPQUFPLFVBQVUsY0FBYyxVQUFVLGVBQWUsQ0FBQztBQUFBLFFBQ3pELFNBQVM7QUFBQSxVQUNSLGFBQWE7QUFBQSxVQUNiLFdBQVcsS0FBSyxhQUFhLEtBQUssY0FBYyxJQUFJO0FBQUEsUUFDckQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGdCQUFnQixLQUFLLGNBQWM7QUFBQSxNQUN2QyxLQUFLO0FBQUEsTUFDTDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0I7QUFDL0IsU0FBSyxhQUFhLFFBQVEsVUFBUTtBQUNqQyxVQUFJLEtBQUssY0FBYyxXQUFXLEtBQUssYUFBYSxDQUFDLEVBQUUsUUFBUTtBQUM5RDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUNyRSxVQUFJLENBQUMsWUFBWTtBQUVoQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGFBQWEsV0FBVyxjQUFjO0FBRTVDLFlBQU0saUJBQTBDLENBQUM7QUFDakQsa0JBQVksSUFBSSxlQUFhO0FBQzVCLGNBQU0sVUFBVSxVQUFVLFFBQVE7QUFFbEMsWUFBSSxDQUFDLFNBQVM7QUFFYix5QkFBZSxLQUFLO0FBQUEsWUFDbkIsT0FBTztBQUFBLFlBQ1AsU0FBUztBQUFBLGNBQ1IsYUFBYTtBQUFBLGNBQ2IsV0FBVyxLQUFLLGFBQWEsS0FBSyxjQUFjLEtBQUs7QUFBQSxZQUN0RDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0Y7QUFHQSx1QkFBZSxLQUFLO0FBQUEsVUFDbkIsT0FBTyxVQUFVLGNBQWMsVUFBVSxZQUFZLENBQUM7QUFBQSxVQUN0RCxTQUFTO0FBQUEsWUFDUixhQUFhO0FBQUEsWUFDYixRQUFRO0FBQUEsWUFDUixXQUFXLEtBQUssYUFBYSxLQUFLLGNBQWMsSUFBSTtBQUFBLFVBQ3JEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBRUQsV0FBSyxnQkFBZ0IsS0FBSyxjQUFjO0FBQUEsUUFDdkMsS0FBSztBQUFBLFFBQ0w7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsaUJBQWlCLE1BQW1CO0FBQzNDLFNBQUssZ0JBQWdCLEtBQUssY0FBYztBQUFBLE1BQ3ZDLEtBQUs7QUFBQSxNQUNMLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsUUFBUSxXQUFzQixPQUEyQztBQUNoRixVQUFNLGFBQWEsVUFBVTtBQUM3QixVQUFNLGNBQWMsVUFBVTtBQUU5QixRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxNQUFNLGtCQUFrQjtBQUFBLE1BQzlCO0FBQUEsTUFDQSxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsYUFBYSxjQUFvQyxVQUE0QjtBQUNwRixRQUFJLFNBQVMsV0FBVywyQkFBMkI7QUFFbkQsUUFBSSxVQUFVO0FBRWIsY0FBUSxhQUFhLGFBQWE7QUFBQSxRQUNqQyxLQUFLLHNCQUFzQjtBQUMxQjtBQUFBO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixvQkFBVTtBQUNWO0FBQUEsUUFDRDtBQUNDO0FBQUEsTUFDRjtBQUdBLGNBQVEsYUFBYSxnQkFBZ0I7QUFBQSxRQUNwQyxLQUFLLDhCQUE4QjtBQUNsQyxvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLDhCQUE4QjtBQUNsQyxvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLDhCQUE4QjtBQUNsQyxvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLDhCQUE4QjtBQUNsQyxvQkFBVTtBQUNWO0FBQUEsUUFDRCxLQUFLLDhCQUE4QjtBQUNsQyxvQkFBVTtBQUNWO0FBQUEsUUFDRDtBQUNDLG9CQUFVO0FBQ1Y7QUFBQSxNQUNGO0FBR0EsVUFBSSxhQUFhLCtCQUErQixRQUFRLGFBQWEsK0JBQStCLFlBQVk7QUFDL0csa0JBQVU7QUFBQSxNQUNYO0FBQUEsSUFFRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxTQUFLLGtCQUFrQixRQUFRO0FBQy9CLFNBQUssbUJBQW1CLFFBQVE7QUFFaEMsU0FBSyxhQUFhLFFBQVEsVUFBUTtBQUNqQyxXQUFLLGlCQUFpQixJQUFJO0FBQUEsSUFDM0IsQ0FBQztBQUNELFNBQUssZUFBZSxDQUFDO0FBQUEsRUFDdEI7QUFFRDtBQTE1QmEsOEJBRUksS0FBYTtBQUZqQixnQ0FBTjtBQUFBLEVBOEJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5DVTtBQTQ1QmIsTUFBTSxxQ0FBcUMsZUFBZTtBQUFBLEVBQ3pELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsd0JBQXdCLHNDQUFzQztBQUFBLE1BQzlFLGNBQWMsZUFBZTtBQUFBLFFBQzVCLGVBQWUsT0FBTyx1Q0FBdUMsSUFBSTtBQUFBLE1BQ2xFO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDWCxNQUFNLGVBQWU7QUFBQSxVQUNwQixlQUFlO0FBQUEsWUFDZCxlQUFlLE9BQU8sdUNBQXVDLElBQUk7QUFBQSxZQUNqRTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQSxlQUFlO0FBQUEsWUFDZCxlQUFlLE9BQU8sdUNBQXVDLElBQUk7QUFBQSxZQUNqRTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLGVBQWUsVUFBNEIsU0FBZ0Q7QUFDekcsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFFakQsVUFBTSxTQUFTLGdDQUFnQyxjQUFjLGdCQUFnQjtBQUM3RSxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxRQUFRLE1BQU07QUFDbEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxtQkFBbUIsT0FBTyxnQkFBK0MsOEJBQThCLEVBQUU7QUFDL0csVUFBTSxpQkFBaUIsT0FBTyxnQkFBcUMsb0JBQW9CLEVBQUU7QUFFekYsUUFBSSxlQUFlLE9BQU8sV0FBVztBQUNwQyxZQUFNLFlBQVksZUFBZSxPQUFPO0FBQ3hDLHVCQUFpQixpQkFBaUIsUUFBUSxNQUFNLFVBQVUsV0FBVztBQUFBLElBQ3RFLE9BQU87QUFDTix1QkFBaUIsaUJBQWlCLFFBQVEsSUFBSTtBQUFBLElBQy9DO0FBQUEsRUFFRDtBQUNEO0FBRUEsTUFBTSwrQ0FBK0MsZUFBZTtBQUFBLEVBQ25FLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsMkJBQTJCLGtDQUFrQztBQUFBLE1BQzdFLGNBQWMsZUFBZTtBQUFBLFFBQzVCLGVBQWUsT0FBTyx1Q0FBdUMsSUFBSTtBQUFBLFFBQ2pFO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZTtBQUFBLFVBQ3BCLGVBQWUsT0FBTyx1Q0FBdUMsSUFBSTtBQUFBLFVBQ2pFO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxRQUNsQyxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxlQUFlLFVBQTRCLFNBQWdEO0FBQ3pHLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sU0FBUyxnQ0FBZ0MsY0FBYyxnQkFBZ0I7QUFFN0UsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsUUFBUSxNQUFNO0FBQ2xCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxPQUFPLGdCQUErQyw4QkFBOEIsRUFBRTtBQUN6RyxlQUFXLDBCQUEwQixRQUFRLElBQUk7QUFBQSxFQUNsRDtBQUNEO0FBRUEsTUFBTSx5Q0FBeUMsZUFBZTtBQUFBLEVBQzdELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsc0JBQXNCLHdCQUF3QjtBQUFBLE1BQzlELGNBQWMsZUFBZTtBQUFBLFFBQzVCLGVBQWUsT0FBTyx1Q0FBdUMsSUFBSTtBQUFBLFFBQ2pFO0FBQUEsUUFDQSw4QkFBOEI7QUFBQSxNQUMvQjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlO0FBQUEsVUFDcEIsZUFBZSxPQUFPLHVDQUF1QyxJQUFJO0FBQUEsVUFDakU7QUFBQSxVQUNBLDhCQUE4QjtBQUFBLFFBQy9CO0FBQUEsUUFDQSxTQUFTLFFBQVE7QUFBQSxRQUNqQixRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxlQUFlLFVBQTRCLFNBQWdEO0FBQ3pHLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sU0FBUyxnQ0FBZ0MsY0FBYyxnQkFBZ0I7QUFFN0UsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsT0FBTyxnQkFBK0MsOEJBQThCLEVBQUU7QUFDekcsZUFBVyxpQkFBaUI7QUFBQSxFQUM3QjtBQUNEO0FBRUEsTUFBTSwrQ0FBK0MsZUFBZTtBQUFBLEVBQ25FLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsNEJBQTRCLGFBQWE7QUFBQSxNQUN6RCxjQUFjLGVBQWU7QUFBQSxRQUM1QixlQUFlLE9BQU8sdUNBQXVDLElBQUk7QUFBQSxRQUNqRTtBQUFBLFFBQ0EsOEJBQThCO0FBQUEsUUFDOUIsZUFBZTtBQUFBLFVBQ2QsOEJBQThCLCtCQUErQixVQUFVLGlCQUFrQztBQUFBLFVBQ3pHLDhCQUE4QiwrQkFBK0IsVUFBVSxlQUFnQztBQUFBLFFBQ3hHO0FBQUEsTUFDRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlO0FBQUEsVUFDcEIsZUFBZSxPQUFPLHVDQUF1QyxJQUFJO0FBQUEsVUFDakU7QUFBQSxVQUNBLDhCQUE4QjtBQUFBLFVBQzlCLGVBQWU7QUFBQSxZQUNkLDhCQUE4QiwrQkFBK0IsVUFBVSxpQkFBa0M7QUFBQSxZQUN6Ryw4QkFBOEIsK0JBQStCLFVBQVUsZUFBZ0M7QUFBQSxVQUN4RztBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLGVBQWUsVUFBNEIsU0FBZ0Q7QUFDekcsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxTQUFTLGdDQUFnQyxjQUFjLGdCQUFnQjtBQUU3RSxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxPQUFPLGdCQUErQyw4QkFBOEIsRUFBRTtBQUN6RyxlQUFXLFdBQVc7QUFBQSxFQUN2QjtBQUNEO0FBRUEsTUFBTSxnREFBZ0QsZUFBZTtBQUFBLEVBQ3BFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsNkJBQTZCLGNBQWM7QUFBQSxNQUMzRCxjQUFjLGVBQWU7QUFBQSxRQUM1QixlQUFlLE9BQU8sdUNBQXVDLElBQUk7QUFBQSxRQUNqRTtBQUFBLFFBQ0EsOEJBQThCO0FBQUEsUUFDOUIsZUFBZTtBQUFBLFVBQ2QsOEJBQThCLCtCQUErQixVQUFVLGlCQUFrQztBQUFBLFVBQ3pHLDhCQUE4QiwrQkFBK0IsVUFBVSxlQUFnQztBQUFBLFFBQ3hHO0FBQUEsTUFDRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlO0FBQUEsVUFDcEIsZUFBZSxPQUFPLHVDQUF1QyxJQUFJO0FBQUEsVUFDakU7QUFBQSxVQUNBLDhCQUE4QjtBQUFBLFVBQzlCLGVBQWU7QUFBQSxZQUNkLDhCQUE4QiwrQkFBK0IsVUFBVSxpQkFBa0M7QUFBQSxZQUN6Ryw4QkFBOEIsK0JBQStCLFVBQVUsZUFBZ0M7QUFBQSxVQUN4RztBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLGVBQWUsVUFBNEIsU0FBZ0Q7QUFDekcsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxXQUFXLGdDQUFnQyxjQUFjLGdCQUFnQjtBQUMvRSxRQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxTQUFTO0FBQzVCLFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUdBLHdCQUFvQixZQUFZLGlCQUFpQixVQUFVLFlBQVksSUFBSTtBQUUzRSxVQUFNLGFBQWEsU0FBUyxnQkFBK0MsOEJBQThCLEVBQUU7QUFDM0csZUFBVyxZQUFZO0FBQUEsRUFDeEI7QUFDRDtBQUVBLElBQU0sMENBQU4sY0FBc0QsV0FBVztBQUFBLEVBSWhFLFlBQTZDLGdCQUF3RSxzQkFBNkM7QUFDakssVUFBTTtBQURzQztBQUF3RTtBQUdwSCxRQUFJLENBQUMsS0FBSyxxQkFBcUIsU0FBa0IsOEJBQThCLEdBQUc7QUFDakY7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXO0FBQ2pCLFNBQUssVUFBVSxZQUFZLGtCQUFrQixVQUFVLGtDQUFrQyxNQUFNO0FBQzlGLFlBQU0sU0FBUyxnQ0FBZ0MsS0FBSyxlQUFlLGdCQUFnQjtBQUNuRixVQUFJLENBQUMsUUFBUTtBQUNaLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxhQUFhLE9BQU8sZ0JBQStDLDhCQUE4QixFQUFFO0FBRXpHLGFBQU8sV0FBVyxLQUFLO0FBQUEsSUFDeEIsR0FBRyxlQUFlO0FBQUEsTUFDakIsZUFBZSxPQUFPLHVDQUF1QyxJQUFJO0FBQUEsTUFDakU7QUFBQSxNQUNBLDhCQUE4QjtBQUFBLElBQy9CLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxZQUFZLGtCQUFrQixVQUFVLGtDQUFrQyxNQUFNO0FBQzlGLFlBQU0sU0FBUyxnQ0FBZ0MsS0FBSyxlQUFlLGdCQUFnQjtBQUNuRixVQUFJLENBQUMsUUFBUTtBQUNaLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxhQUFhLE9BQU8sZ0JBQStDLDhCQUE4QixFQUFFO0FBQ3pHLGFBQU8sV0FBVyxLQUFLO0FBQUEsSUFDeEIsR0FBRyxlQUFlO0FBQUEsTUFDakIsZUFBZSxPQUFPLHVDQUF1QyxJQUFJO0FBQUEsTUFDakU7QUFBQSxNQUNBLDhCQUE4QjtBQUFBLElBQy9CLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQWpETSx3Q0FFVyxLQUFLO0FBRmhCLDBDQUFOO0FBQUEsRUFJYztBQUFBLEVBQWlFO0FBQUEsR0FKekU7QUFtRE4sNkJBQTZCLDhCQUE4QixJQUFJLDZCQUE2QjtBQUM1RiwrQkFBK0Isd0NBQXdDLElBQUkseUNBQXlDLGVBQWUsWUFBWTtBQUUvSSxnQkFBZ0IsNEJBQTRCO0FBQzVDLGdCQUFnQixzQ0FBc0M7QUFDdEQsZ0JBQWdCLGdDQUFnQztBQUNoRCxnQkFBZ0Isc0NBQXNDO0FBQ3RELGdCQUFnQix1Q0FBdUM7IiwKICAibmFtZXMiOiBbIk5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZSIsICJ0cmFja2VkQ2VsbCIsICJtYXRjaCJdCn0K
