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
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Constants } from "../../../../base/common/uint.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { CursorMoveCommands } from "../../../common/cursor/cursorMoveCommands.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { CommonFindController } from "../../find/browser/findController.js";
import { FindOptionOverride } from "../../find/browser/findState.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { getSelectionHighlightDecorationOptions } from "../../wordHighlighter/browser/highlightDecorations.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
function announceCursorChange(previousCursorState, cursorState) {
  const cursorDiff = cursorState.filter((cs) => !previousCursorState.find((pcs) => pcs.equals(cs)));
  if (cursorDiff.length >= 1) {
    const cursorPositions = cursorDiff.map((cs) => `line ${cs.viewState.position.lineNumber} column ${cs.viewState.position.column}`).join(", ");
    const msg = cursorDiff.length === 1 ? nls.localize("cursorAdded", "Cursor added: {0}", cursorPositions) : nls.localize("cursorsAdded", "Cursors added: {0}", cursorPositions);
    status(msg);
  }
}
class InsertCursorAbove extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorAbove",
      label: nls.localize2("mutlicursor.insertAbove", "Add Cursor Above"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
        linux: {
          primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
        },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorAbove", comment: ["&& denotes a mnemonic"] }, "&&Add Cursor Above"),
        order: 2
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    let useLogicalLine = true;
    if (args && args.logicalLine === false) {
      useLogicalLine = false;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = viewModel.getCursorStates();
    viewModel.setCursorStates(
      args.source,
      CursorChangeReason.Explicit,
      CursorMoveCommands.addCursorUp(viewModel, previousCursorState, useLogicalLine)
    );
    viewModel.revealTopMostCursor(args.source);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorBelow extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorBelow",
      label: nls.localize2("mutlicursor.insertBelow", "Add Cursor Below"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
        linux: {
          primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
        },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorBelow", comment: ["&& denotes a mnemonic"] }, "A&&dd Cursor Below"),
        order: 3
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    let useLogicalLine = true;
    if (args && args.logicalLine === false) {
      useLogicalLine = false;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = viewModel.getCursorStates();
    viewModel.setCursorStates(
      args.source,
      CursorChangeReason.Explicit,
      CursorMoveCommands.addCursorDown(viewModel, previousCursorState, useLogicalLine)
    );
    viewModel.revealBottomMostCursor(args.source);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtEndOfEachLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorAtEndOfEachLineSelected",
      label: nls.localize2("mutlicursor.insertAtEndOfEachLineSelected", "Add Cursors to Line Ends"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyI,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorAtEndOfEachLineSelected", comment: ["&& denotes a mnemonic"] }, "Add C&&ursors to Line Ends"),
        order: 4
      }
    });
  }
  getCursorsForSelection(selection, model, result) {
    if (selection.isEmpty()) {
      return;
    }
    for (let i = selection.startLineNumber; i < selection.endLineNumber; i++) {
      const currentLineMaxColumn = model.getLineMaxColumn(i);
      result.push(new Selection(i, currentLineMaxColumn, i, currentLineMaxColumn));
    }
    if (selection.endColumn > 1) {
      result.push(new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn));
    }
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    const selections = editor.getSelections();
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    const newSelections = [];
    selections.forEach((sel) => this.getCursorsForSelection(sel, model, newSelections));
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtEndOfLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.addCursorsToBottom",
      label: nls.localize2("mutlicursor.addCursorsToBottom", "Add Cursors to Bottom"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    const lineCount = editor.getModel().getLineCount();
    const newSelections = [];
    for (let i = selections[0].startLineNumber; i <= lineCount; i++) {
      newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
    }
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtTopOfLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.addCursorsToTop",
      label: nls.localize2("mutlicursor.addCursorsToTop", "Add Cursors to Top"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    const newSelections = [];
    for (let i = selections[0].startLineNumber; i >= 1; i--) {
      newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
    }
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class MultiCursorSessionResult {
  constructor(selections, revealRange, revealScrollType) {
    this.selections = selections;
    this.revealRange = revealRange;
    this.revealScrollType = revealScrollType;
  }
}
class MultiCursorSession {
  constructor(_editor, findController, isDisconnectedFromFindController, searchText, wholeWord, matchCase, currentMatch) {
    this._editor = _editor;
    this.findController = findController;
    this.isDisconnectedFromFindController = isDisconnectedFromFindController;
    this.searchText = searchText;
    this.wholeWord = wholeWord;
    this.matchCase = matchCase;
    this.currentMatch = currentMatch;
  }
  static create(editor, findController) {
    if (!editor.hasModel()) {
      return null;
    }
    const findState = findController.getState();
    if (!editor.hasTextFocus() && findState.isRevealed && findState.searchString.length > 0) {
      return new MultiCursorSession(editor, findController, false, findState.searchString, findState.wholeWord, findState.matchCase, null);
    }
    let isDisconnectedFromFindController = false;
    let wholeWord;
    let matchCase;
    const selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isEmpty()) {
      isDisconnectedFromFindController = true;
      wholeWord = true;
      matchCase = true;
    } else {
      wholeWord = findState.wholeWord;
      matchCase = findState.matchCase;
    }
    const s = editor.getSelection();
    let searchText;
    let currentMatch = null;
    if (s.isEmpty()) {
      const word = editor.getConfiguredWordAtPosition(s.getStartPosition());
      if (!word) {
        return null;
      }
      searchText = word.word;
      currentMatch = new Selection(s.startLineNumber, word.startColumn, s.startLineNumber, word.endColumn);
    } else {
      searchText = editor.getModel().getValueInRange(s).replace(/\r\n/g, "\n");
    }
    return new MultiCursorSession(editor, findController, isDisconnectedFromFindController, searchText, wholeWord, matchCase, currentMatch);
  }
  addSelectionToNextFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const nextMatch = this._getNextMatch();
    if (!nextMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.concat(nextMatch), nextMatch, ScrollType.Smooth);
  }
  moveSelectionToNextFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const nextMatch = this._getNextMatch();
    if (!nextMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(nextMatch), nextMatch, ScrollType.Smooth);
  }
  _getNextMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (this.currentMatch) {
      const result = this.currentMatch;
      this.currentMatch = null;
      return result;
    }
    this.findController.highlightFindOptions();
    const allSelections = this._editor.getSelections();
    const lastAddedSelection = allSelections[allSelections.length - 1];
    const nextMatch = this._editor.getModel().findNextMatch(this.searchText, lastAddedSelection.getEndPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (!nextMatch) {
      return null;
    }
    return new Selection(nextMatch.range.startLineNumber, nextMatch.range.startColumn, nextMatch.range.endLineNumber, nextMatch.range.endColumn);
  }
  addSelectionToPreviousFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const previousMatch = this._getPreviousMatch();
    if (!previousMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.concat(previousMatch), previousMatch, ScrollType.Smooth);
  }
  moveSelectionToPreviousFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const previousMatch = this._getPreviousMatch();
    if (!previousMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(previousMatch), previousMatch, ScrollType.Smooth);
  }
  _getPreviousMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (this.currentMatch) {
      const result = this.currentMatch;
      this.currentMatch = null;
      return result;
    }
    this.findController.highlightFindOptions();
    const allSelections = this._editor.getSelections();
    const lastAddedSelection = allSelections[allSelections.length - 1];
    const previousMatch = this._editor.getModel().findPreviousMatch(this.searchText, lastAddedSelection.getStartPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (!previousMatch) {
      return null;
    }
    return new Selection(previousMatch.range.startLineNumber, previousMatch.range.startColumn, previousMatch.range.endLineNumber, previousMatch.range.endColumn);
  }
  selectAll(searchScope) {
    if (!this._editor.hasModel()) {
      return [];
    }
    this.findController.highlightFindOptions();
    const editorModel = this._editor.getModel();
    if (searchScope) {
      return editorModel.findMatches(this.searchText, searchScope, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
    }
    return editorModel.findMatches(this.searchText, true, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
  }
}
const _MultiCursorSelectionController = class _MultiCursorSelectionController extends Disposable {
  constructor(editor) {
    super();
    this._sessionDispose = this._register(new DisposableStore());
    this._editor = editor;
    this._ignoreSelectionChange = false;
    this._session = null;
  }
  static get(editor) {
    return editor.getContribution(_MultiCursorSelectionController.ID);
  }
  dispose() {
    this._endSession();
    super.dispose();
  }
  _beginSessionIfNeeded(findController) {
    if (!this._session) {
      const session = MultiCursorSession.create(this._editor, findController);
      if (!session) {
        return;
      }
      this._session = session;
      const newState = { searchString: this._session.searchText };
      if (this._session.isDisconnectedFromFindController) {
        newState.wholeWordOverride = FindOptionOverride.True;
        newState.matchCaseOverride = FindOptionOverride.True;
        newState.isRegexOverride = FindOptionOverride.False;
      }
      findController.getState().change(newState, false);
      this._sessionDispose.add(this._editor.onDidChangeCursorSelection((e) => {
        if (this._ignoreSelectionChange) {
          return;
        }
        this._endSession();
      }));
      this._sessionDispose.add(this._editor.onDidBlurEditorText(() => {
        this._endSession();
      }));
      this._sessionDispose.add(findController.getState().onFindReplaceStateChange((e) => {
        if (e.matchCase || e.wholeWord) {
          this._endSession();
        }
      }));
    }
  }
  _endSession() {
    this._sessionDispose.clear();
    if (this._session && this._session.isDisconnectedFromFindController) {
      const newState = {
        wholeWordOverride: FindOptionOverride.NotSet,
        matchCaseOverride: FindOptionOverride.NotSet,
        isRegexOverride: FindOptionOverride.NotSet
      };
      this._session.findController.getState().change(newState, false);
    }
    this._session = null;
  }
  _setSelections(selections) {
    this._ignoreSelectionChange = true;
    this._editor.setSelections(selections);
    this._ignoreSelectionChange = false;
  }
  _expandEmptyToWord(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const word = this._editor.getConfiguredWordAtPosition(selection.getStartPosition());
    if (!word) {
      return selection;
    }
    return new Selection(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
  }
  _applySessionResult(result) {
    if (!result) {
      return;
    }
    this._setSelections(result.selections);
    if (result.revealRange) {
      this._editor.revealRangeInCenterIfOutsideViewport(result.revealRange, result.revealScrollType);
    }
  }
  getSession(findController) {
    return this._session;
  }
  addSelectionToNextFindMatch(findController) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (!this._session) {
      const allSelections = this._editor.getSelections();
      if (allSelections.length > 1) {
        const findState = findController.getState();
        const matchCase = findState.matchCase;
        const selectionsContainSameText = modelRangesContainSameText(this._editor.getModel(), allSelections, matchCase);
        if (!selectionsContainSameText) {
          const model = this._editor.getModel();
          const resultingSelections = [];
          for (let i = 0, len = allSelections.length; i < len; i++) {
            resultingSelections[i] = this._expandEmptyToWord(model, allSelections[i]);
          }
          this._editor.setSelections(resultingSelections);
          return;
        }
      }
    }
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.addSelectionToNextFindMatch());
    }
  }
  addSelectionToPreviousFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.addSelectionToPreviousFindMatch());
    }
  }
  moveSelectionToNextFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.moveSelectionToNextFindMatch());
    }
  }
  moveSelectionToPreviousFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.moveSelectionToPreviousFindMatch());
    }
  }
  selectAll(findController) {
    if (!this._editor.hasModel()) {
      return;
    }
    let matches = null;
    const findState = findController.getState();
    if (findState.isRevealed && findState.searchString.length > 0 && findState.isRegex) {
      const editorModel = this._editor.getModel();
      if (findState.searchScope) {
        matches = editorModel.findMatches(findState.searchString, findState.searchScope, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
      } else {
        matches = editorModel.findMatches(findState.searchString, true, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
      }
    } else {
      this._beginSessionIfNeeded(findController);
      if (!this._session) {
        return;
      }
      matches = this._session.selectAll(findState.searchScope);
    }
    if (matches.length > 0) {
      const editorSelection = this._editor.getSelection();
      for (let i = 0, len = matches.length; i < len; i++) {
        const match = matches[i];
        const intersection = match.range.intersectRanges(editorSelection);
        if (intersection) {
          matches[i] = matches[0];
          matches[0] = match;
          break;
        }
      }
      this._setSelections(matches.map((m) => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn)));
    }
  }
  selectAllUsingSelections(selections) {
    if (selections.length > 0) {
      this._setSelections(selections);
    }
  }
};
_MultiCursorSelectionController.ID = "editor.contrib.multiCursorController";
let MultiCursorSelectionController = _MultiCursorSelectionController;
class MultiCursorSelectionControllerAction extends EditorAction {
  run(accessor, editor) {
    const multiCursorController = MultiCursorSelectionController.get(editor);
    if (!multiCursorController) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel) {
      const previousCursorState = viewModel.getCursorStates();
      const findController = CommonFindController.get(editor);
      if (findController) {
        this._run(multiCursorController, findController);
      } else {
        const newFindController = accessor.get(IInstantiationService).createInstance(CommonFindController, editor);
        this._run(multiCursorController, newFindController);
        newFindController.dispose();
      }
      announceCursorChange(previousCursorState, viewModel.getCursorStates());
    }
  }
}
class AddSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.addSelectionToNextFindMatch",
      label: nls.localize2("addSelectionToNextFindMatch", "Add Selection to Next Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyCode.KeyD,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miAddSelectionToNextFindMatch", comment: ["&& denotes a mnemonic"] }, "Add &&Next Occurrence"),
        order: 5
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.addSelectionToNextFindMatch(findController);
  }
}
class AddSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.addSelectionToPreviousFindMatch",
      label: nls.localize2("addSelectionToPreviousFindMatch", "Add Selection to Previous Find Match"),
      precondition: void 0,
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miAddSelectionToPreviousFindMatch", comment: ["&& denotes a mnemonic"] }, "Add P&&revious Occurrence"),
        order: 6
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.addSelectionToPreviousFindMatch(findController);
  }
}
class MoveSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.moveSelectionToNextFindMatch",
      label: nls.localize2("moveSelectionToNextFindMatch", "Move Last Selection to Next Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyD),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.moveSelectionToNextFindMatch(findController);
  }
}
class MoveSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.moveSelectionToPreviousFindMatch",
      label: nls.localize2("moveSelectionToPreviousFindMatch", "Move Last Selection to Previous Find Match"),
      precondition: void 0
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.moveSelectionToPreviousFindMatch(findController);
  }
}
class SelectHighlightsAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.selectHighlights",
      label: nls.localize2("selectAllOccurrencesOfFindMatch", "Select All Occurrences of Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miSelectHighlights", comment: ["&& denotes a mnemonic"] }, "Select All &&Occurrences"),
        order: 7
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.selectAll(findController);
  }
}
class CompatChangeAll extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.changeAll",
      label: nls.localize2("changeAll.label", "Change All Occurrences"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.editorTextFocus),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.2
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.selectAll(findController);
  }
}
class SelectionHighlighterState {
  constructor(_model, _searchText, _matchCase, _wordSeparators, prevState) {
    this._model = _model;
    this._searchText = _searchText;
    this._matchCase = _matchCase;
    this._wordSeparators = _wordSeparators;
    this._cachedFindMatches = null;
    this._modelVersionId = this._model.getVersionId();
    if (prevState && this._model === prevState._model && this._searchText === prevState._searchText && this._matchCase === prevState._matchCase && this._wordSeparators === prevState._wordSeparators && this._modelVersionId === prevState._modelVersionId) {
      this._cachedFindMatches = prevState._cachedFindMatches;
    }
  }
  findMatches() {
    if (this._cachedFindMatches === null) {
      this._cachedFindMatches = this._model.findMatches(this._searchText, true, false, this._matchCase, this._wordSeparators, false).map((m) => m.range);
      this._cachedFindMatches.sort(Range.compareRangesUsingStarts);
    }
    return this._cachedFindMatches;
  }
}
let SelectionHighlighter = class extends Disposable {
  constructor(editor, _languageFeaturesService) {
    super();
    this._languageFeaturesService = _languageFeaturesService;
    this.editor = editor;
    this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
    this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
    this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
    this._decorations = editor.createDecorationsCollection();
    this.updateSoon = this._register(new RunOnceScheduler(() => this._update(), 300));
    this.state = null;
    this._register(editor.onDidChangeConfiguration((e) => {
      this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
      this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
      this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
    }));
    this._register(editor.onDidChangeCursorSelection((e) => {
      if (!this._isEnabled) {
        return;
      }
      if (e.selection.isEmpty()) {
        if (e.reason === CursorChangeReason.Explicit) {
          if (this.state) {
            this._setState(null);
          }
          this.updateSoon.schedule();
        } else {
          this._setState(null);
        }
      } else {
        this._update();
      }
    }));
    this._register(editor.onDidChangeModel((e) => {
      this._setState(null);
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      if (this._isEnabled) {
        this.updateSoon.schedule();
      }
    }));
    const findController = CommonFindController.get(editor);
    if (findController) {
      this._register(findController.getState().onFindReplaceStateChange((e) => {
        this._update();
      }));
    }
    this.updateSoon.schedule();
  }
  _update() {
    this._setState(SelectionHighlighter._createState(this.state, this._isEnabled, this._isEnabledMultiline, this._maxLength, this.editor));
  }
  static _createState(oldState, isEnabled, isEnabledMultiline, maxLength, editor) {
    if (!isEnabled) {
      return null;
    }
    if (!editor.hasModel()) {
      return null;
    }
    if (!isEnabledMultiline) {
      const s = editor.getSelection();
      if (s.startLineNumber !== s.endLineNumber) {
        return null;
      }
    }
    const multiCursorController = MultiCursorSelectionController.get(editor);
    if (!multiCursorController) {
      return null;
    }
    const findController = CommonFindController.get(editor);
    if (!findController) {
      return null;
    }
    let r = multiCursorController.getSession(findController);
    if (!r) {
      const allSelections = editor.getSelections();
      if (allSelections.length > 1) {
        const findState2 = findController.getState();
        const matchCase = findState2.matchCase;
        const selectionsContainSameText = modelRangesContainSameText(editor.getModel(), allSelections, matchCase);
        if (!selectionsContainSameText) {
          return null;
        }
      }
      r = MultiCursorSession.create(editor, findController);
    }
    if (!r) {
      return null;
    }
    if (r.currentMatch) {
      return null;
    }
    if (/^[ \t]+$/.test(r.searchText)) {
      return null;
    }
    if (maxLength > 0 && r.searchText.length > maxLength) {
      return null;
    }
    const findState = findController.getState();
    const caseSensitive = findState.matchCase;
    if (findState.isRevealed) {
      let findStateSearchString = findState.searchString;
      if (!caseSensitive) {
        findStateSearchString = findStateSearchString.toLowerCase();
      }
      let mySearchString = r.searchText;
      if (!caseSensitive) {
        mySearchString = mySearchString.toLowerCase();
      }
      if (findStateSearchString === mySearchString && r.matchCase === findState.matchCase && r.wholeWord === findState.wholeWord && !findState.isRegex) {
        return null;
      }
    }
    return new SelectionHighlighterState(editor.getModel(), r.searchText, r.matchCase, r.wholeWord ? editor.getOption(EditorOption.wordSeparators) : null, oldState);
  }
  _setState(newState) {
    this.state = newState;
    if (!this.state) {
      this._decorations.clear();
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    const model = this.editor.getModel();
    if (model.isTooLargeForTokenization()) {
      return;
    }
    const allMatches = this.state.findMatches();
    const selections = this.editor.getSelections();
    selections.sort(Range.compareRangesUsingStarts);
    const matches = [];
    for (let i = 0, j = 0, len = allMatches.length, lenJ = selections.length; i < len; ) {
      const match = allMatches[i];
      if (j >= lenJ) {
        matches.push(match);
        i++;
      } else {
        const cmp = Range.compareRangesUsingStarts(match, selections[j]);
        if (cmp < 0) {
          if (selections[j].isEmpty() || !Range.areIntersecting(match, selections[j])) {
            matches.push(match);
          }
          i++;
        } else if (cmp > 0) {
          j++;
        } else {
          i++;
          j++;
        }
      }
    }
    const occurrenceHighlighting = this.editor.getOption(EditorOption.occurrencesHighlight) !== "off";
    const hasSemanticHighlights = this._languageFeaturesService.documentHighlightProvider.has(model) && occurrenceHighlighting;
    const decorations = matches.map((r) => {
      return {
        range: r,
        options: getSelectionHighlightDecorationOptions(hasSemanticHighlights)
      };
    });
    this._decorations.set(decorations);
  }
  dispose() {
    this._setState(null);
    super.dispose();
  }
};
SelectionHighlighter.ID = "editor.contrib.selectionHighlighter";
SelectionHighlighter = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService)
], SelectionHighlighter);
function modelRangesContainSameText(model, ranges, matchCase) {
  const selectedText = getValueInRange(model, ranges[0], !matchCase);
  for (let i = 1, len = ranges.length; i < len; i++) {
    const range = ranges[i];
    if (range.isEmpty()) {
      return false;
    }
    const thisSelectedText = getValueInRange(model, range, !matchCase);
    if (selectedText !== thisSelectedText) {
      return false;
    }
  }
  return true;
}
function getValueInRange(model, range, toLowerCase) {
  const text = model.getValueInRange(range);
  return toLowerCase ? text.toLowerCase() : text;
}
class FocusNextCursor extends EditorAction {
  constructor() {
    super({
      id: "editor.action.focusNextCursor",
      label: nls.localize2("mutlicursor.focusNextCursor", "Focus Next Cursor"),
      metadata: {
        description: nls.localize("mutlicursor.focusNextCursor.description", "Focuses the next cursor"),
        args: []
      },
      precondition: void 0
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = Array.from(viewModel.getCursorStates());
    const firstCursor = previousCursorState.shift();
    if (!firstCursor) {
      return;
    }
    previousCursorState.push(firstCursor);
    viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
    viewModel.revealPrimaryCursor(args.source, true);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class FocusPreviousCursor extends EditorAction {
  constructor() {
    super({
      id: "editor.action.focusPreviousCursor",
      label: nls.localize2("mutlicursor.focusPreviousCursor", "Focus Previous Cursor"),
      metadata: {
        description: nls.localize("mutlicursor.focusPreviousCursor.description", "Focuses the previous cursor"),
        args: []
      },
      precondition: void 0
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = Array.from(viewModel.getCursorStates());
    const firstCursor = previousCursorState.pop();
    if (!firstCursor) {
      return;
    }
    previousCursorState.unshift(firstCursor);
    viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
    viewModel.revealPrimaryCursor(args.source, true);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
registerEditorContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController, EditorContributionInstantiation.Lazy);
registerEditorContribution(SelectionHighlighter.ID, SelectionHighlighter, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(InsertCursorAbove);
registerEditorAction(InsertCursorBelow);
registerEditorAction(InsertCursorAtEndOfEachLineSelected);
registerEditorAction(AddSelectionToNextFindMatchAction);
registerEditorAction(AddSelectionToPreviousFindMatchAction);
registerEditorAction(MoveSelectionToNextFindMatchAction);
registerEditorAction(MoveSelectionToPreviousFindMatchAction);
registerEditorAction(SelectHighlightsAction);
registerEditorAction(CompatChangeAll);
registerEditorAction(InsertCursorAtEndOfLineSelected);
registerEditorAction(InsertCursorAtTopOfLineSelected);
registerEditorAction(FocusNextCursor);
registerEditorAction(FocusPreviousCursor);
export {
  AddSelectionToNextFindMatchAction,
  AddSelectionToPreviousFindMatchAction,
  CompatChangeAll,
  FocusNextCursor,
  FocusPreviousCursor,
  InsertCursorAbove,
  InsertCursorBelow,
  MoveSelectionToNextFindMatchAction,
  MoveSelectionToPreviousFindMatchAction,
  MultiCursorSelectionController,
  MultiCursorSelectionControllerAction,
  MultiCursorSession,
  MultiCursorSessionResult,
  SelectHighlightsAction,
  SelectionHighlighter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXG11bHRpY3Vyc29yXFxicm93c2VyXFxtdWx0aWN1cnNvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiwgSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yTW92ZUNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JNb3ZlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvbW1vbkZpbmRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vZmluZC9icm93c2VyL2ZpbmRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEZpbmRPcHRpb25PdmVycmlkZSwgSU5ld0ZpbmRSZXBsYWNlU3RhdGUgfSBmcm9tICcuLi8uLi9maW5kL2Jyb3dzZXIvZmluZFN0YXRlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0aW9uSGlnaGxpZ2h0RGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi93b3JkSGlnaGxpZ2h0ZXIvYnJvd3Nlci9oaWdobGlnaHREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZnVuY3Rpb24gYW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZTogQ3Vyc29yU3RhdGVbXSwgY3Vyc29yU3RhdGU6IEN1cnNvclN0YXRlW10pOiB2b2lkIHtcblx0Y29uc3QgY3Vyc29yRGlmZiA9IGN1cnNvclN0YXRlLmZpbHRlcihjcyA9PiAhcHJldmlvdXNDdXJzb3JTdGF0ZS5maW5kKHBjcyA9PiBwY3MuZXF1YWxzKGNzKSkpO1xuXHRpZiAoY3Vyc29yRGlmZi5sZW5ndGggPj0gMSkge1xuXHRcdGNvbnN0IGN1cnNvclBvc2l0aW9ucyA9IGN1cnNvckRpZmYubWFwKGNzID0+IGBsaW5lICR7Y3Mudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXJ9IGNvbHVtbiAke2NzLnZpZXdTdGF0ZS5wb3NpdGlvbi5jb2x1bW59YCkuam9pbignLCAnKTtcblx0XHRjb25zdCBtc2cgPSBjdXJzb3JEaWZmLmxlbmd0aCA9PT0gMSA/IG5scy5sb2NhbGl6ZSgnY3Vyc29yQWRkZWQnLCBcIkN1cnNvciBhZGRlZDogezB9XCIsIGN1cnNvclBvc2l0aW9ucykgOiBubHMubG9jYWxpemUoJ2N1cnNvcnNBZGRlZCcsIFwiQ3Vyc29ycyBhZGRlZDogezB9XCIsIGN1cnNvclBvc2l0aW9ucyk7XG5cdFx0c3RhdHVzKG1zZyk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEluc2VydEN1cnNvckFyZ3Mge1xuXHRzb3VyY2U/OiBzdHJpbmc7XG5cdGxvZ2ljYWxMaW5lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEluc2VydEN1cnNvckFib3ZlIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uaW5zZXJ0Q3Vyc29yQWJvdmUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ211dGxpY3Vyc29yLmluc2VydEFib3ZlJywgXCJBZGQgQ3Vyc29yIEFib3ZlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJTZWxlY3Rpb25NZW51LFxuXHRcdFx0XHRncm91cDogJzNfbXVsdGknLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlJbnNlcnRDdXJzb3JBYm92ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFkZCBDdXJzb3IgQWJvdmVcIiksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBJbnNlcnRDdXJzb3JBcmdzKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB1c2VMb2dpY2FsTGluZSA9IHRydWU7XG5cdFx0aWYgKGFyZ3MgJiYgYXJncy5sb2dpY2FsTGluZSA9PT0gZmFsc2UpIHtcblx0XHRcdHVzZUxvZ2ljYWxMaW5lID0gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cblx0XHRpZiAodmlld01vZGVsLmN1cnNvckNvbmZpZy5yZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZpZXdNb2RlbC5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0YXJncy5zb3VyY2UsXG5cdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRDdXJzb3JNb3ZlQ29tbWFuZHMuYWRkQ3Vyc29yVXAodmlld01vZGVsLCBwcmV2aW91c0N1cnNvclN0YXRlLCB1c2VMb2dpY2FsTGluZSlcblx0XHQpO1xuXHRcdHZpZXdNb2RlbC5yZXZlYWxUb3BNb3N0Q3Vyc29yKGFyZ3Muc291cmNlKTtcblx0XHRhbm5vdW5jZUN1cnNvckNoYW5nZShwcmV2aW91c0N1cnNvclN0YXRlLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnNlcnRDdXJzb3JCZWxvdyBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmluc2VydEN1cnNvckJlbG93Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5pbnNlcnRCZWxvdycsIFwiQWRkIEN1cnNvciBCZWxvd1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvd11cblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pSW5zZXJ0Q3Vyc29yQmVsb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQSYmZGQgQ3Vyc29yIEJlbG93XCIpLFxuXHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogSW5zZXJ0Q3Vyc29yQXJncyk6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdXNlTG9naWNhbExpbmUgPSB0cnVlO1xuXHRcdGlmIChhcmdzICYmIGFyZ3MubG9naWNhbExpbmUgPT09IGZhbHNlKSB7XG5cdFx0XHR1c2VMb2dpY2FsTGluZSA9IGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXG5cdFx0aWYgKHZpZXdNb2RlbC5jdXJzb3JDb25maWcucmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ3Vyc29yU3RhdGUgPSB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCk7XG5cdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0Q3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LFxuXHRcdFx0Q3Vyc29yTW92ZUNvbW1hbmRzLmFkZEN1cnNvckRvd24odmlld01vZGVsLCBwcmV2aW91c0N1cnNvclN0YXRlLCB1c2VMb2dpY2FsTGluZSlcblx0XHQpO1xuXHRcdHZpZXdNb2RlbC5yZXZlYWxCb3R0b21Nb3N0Q3Vyc29yKGFyZ3Muc291cmNlKTtcblx0XHRhbm5vdW5jZUN1cnNvckNoYW5nZShwcmV2aW91c0N1cnNvclN0YXRlLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG59XG5cbmNsYXNzIEluc2VydEN1cnNvckF0RW5kT2ZFYWNoTGluZVNlbGVjdGVkIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uaW5zZXJ0Q3Vyc29yQXRFbmRPZkVhY2hMaW5lU2VsZWN0ZWQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ211dGxpY3Vyc29yLmluc2VydEF0RW5kT2ZFYWNoTGluZVNlbGVjdGVkJywgXCJBZGQgQ3Vyc29ycyB0byBMaW5lIEVuZHNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pSW5zZXJ0Q3Vyc29yQXRFbmRPZkVhY2hMaW5lU2VsZWN0ZWQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQWRkIEMmJnVyc29ycyB0byBMaW5lIEVuZHNcIiksXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnNvcnNGb3JTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCByZXN1bHQ6IFNlbGVjdGlvbltdKTogdm9pZCB7XG5cdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjsgaSA8IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRMaW5lTWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihpKTtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBTZWxlY3Rpb24oaSwgY3VycmVudExpbmVNYXhDb2x1bW4sIGksIGN1cnJlbnRMaW5lTWF4Q29sdW1uKSk7XG5cdFx0fVxuXHRcdGlmIChzZWxlY3Rpb24uZW5kQ29sdW1uID4gMSkge1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IFNlbGVjdGlvbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbiwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4pKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpO1xuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cdFx0c2VsZWN0aW9ucy5mb3JFYWNoKChzZWwpID0+IHRoaXMuZ2V0Q3Vyc29yc0ZvclNlbGVjdGlvbihzZWwsIG1vZGVsLCBuZXdTZWxlY3Rpb25zKSk7XG5cblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHR9XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5jbGFzcyBJbnNlcnRDdXJzb3JBdEVuZE9mTGluZVNlbGVjdGVkIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uYWRkQ3Vyc29yc1RvQm90dG9tJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5hZGRDdXJzb3JzVG9Cb3R0b20nLCBcIkFkZCBDdXJzb3JzIHRvIEJvdHRvbVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpO1xuXG5cdFx0Y29uc3QgbmV3U2VsZWN0aW9uczogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gc2VsZWN0aW9uc1swXS5zdGFydExpbmVOdW1iZXI7IGkgPD0gbGluZUNvdW50OyBpKyspIHtcblx0XHRcdG5ld1NlbGVjdGlvbnMucHVzaChuZXcgU2VsZWN0aW9uKGksIHNlbGVjdGlvbnNbMF0uc3RhcnRDb2x1bW4sIGksIHNlbGVjdGlvbnNbMF0uZW5kQ29sdW1uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpO1xuXHRcdGlmIChuZXdTZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKG5ld1NlbGVjdGlvbnMpO1xuXHRcdH1cblx0XHRhbm5vdW5jZUN1cnNvckNoYW5nZShwcmV2aW91c0N1cnNvclN0YXRlLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG59XG5cbmNsYXNzIEluc2VydEN1cnNvckF0VG9wT2ZMaW5lU2VsZWN0ZWQgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5hZGRDdXJzb3JzVG9Ub3AnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ211dGxpY3Vyc29yLmFkZEN1cnNvcnNUb1RvcCcsIFwiQWRkIEN1cnNvcnMgdG8gVG9wXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSBzZWxlY3Rpb25zWzBdLnN0YXJ0TGluZU51bWJlcjsgaSA+PSAxOyBpLS0pIHtcblx0XHRcdG5ld1NlbGVjdGlvbnMucHVzaChuZXcgU2VsZWN0aW9uKGksIHNlbGVjdGlvbnNbMF0uc3RhcnRDb2x1bW4sIGksIHNlbGVjdGlvbnNbMF0uZW5kQ29sdW1uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpO1xuXHRcdGlmIChuZXdTZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKG5ld1NlbGVjdGlvbnMpO1xuXHRcdH1cblx0XHRhbm5vdW5jZUN1cnNvckNoYW5nZShwcmV2aW91c0N1cnNvclN0YXRlLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJldmVhbFJhbmdlOiBSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmV2ZWFsU2Nyb2xsVHlwZTogU2Nyb2xsVHlwZVxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlDdXJzb3JTZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShlZGl0b3I6IElDb2RlRWRpdG9yLCBmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBNdWx0aUN1cnNvclNlc3Npb24gfCBudWxsIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblxuXHRcdC8vIEZpbmQgd2lkZ2V0IG93bnMgZW50aXJlbHkgd2hhdCB3ZSBzZWFyY2ggZm9yIGlmOlxuXHRcdC8vICAtIGZvY3VzIGlzIG5vdCBpbiB0aGUgZWRpdG9yIChpLmUuIGl0IGlzIGluIHRoZSBmaW5kIHdpZGdldClcblx0XHQvLyAgLSBhbmQgdGhlIHNlYXJjaCB3aWRnZXQgaXMgdmlzaWJsZVxuXHRcdC8vICAtIGFuZCB0aGUgc2VhcmNoIHN0cmluZyBpcyBub24tZW1wdHlcblx0XHRpZiAoIWVkaXRvci5oYXNUZXh0Rm9jdXMoKSAmJiBmaW5kU3RhdGUuaXNSZXZlYWxlZCAmJiBmaW5kU3RhdGUuc2VhcmNoU3RyaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIEZpbmQgd2lkZ2V0IG93bnMgd2hhdCBpcyBzZWFyY2hlZCBmb3Jcblx0XHRcdHJldHVybiBuZXcgTXVsdGlDdXJzb3JTZXNzaW9uKGVkaXRvciwgZmluZENvbnRyb2xsZXIsIGZhbHNlLCBmaW5kU3RhdGUuc2VhcmNoU3RyaW5nLCBmaW5kU3RhdGUud2hvbGVXb3JkLCBmaW5kU3RhdGUubWF0Y2hDYXNlLCBudWxsKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIHRoZSBzZWxlY3Rpb24gZ2l2ZXMgdGhlIHNlYXJjaCB0ZXh0LCBhbmQgdGhlIGZpbmQgd2lkZ2V0IGdpdmVzIHRoZSBzZWFyY2ggc2V0dGluZ3Ncblx0XHQvLyBUaGUgZXhjZXB0aW9uIGlzIHRoZSBmaW5kIHN0YXRlIGRpc2Fzc29jaWF0aW9uIGNhc2U6IHdoZW4gYmVnaW5uaW5nIHdpdGggYSBzaW5nbGUsIGNvbGxhcHNlZCBzZWxlY3Rpb25cblx0XHRsZXQgaXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXIgPSBmYWxzZTtcblx0XHRsZXQgd2hvbGVXb3JkOiBib29sZWFuO1xuXHRcdGxldCBtYXRjaENhc2U6IGJvb2xlYW47XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoID09PSAxICYmIHNlbGVjdGlvbnNbMF0uaXNFbXB0eSgpKSB7XG5cdFx0XHRpc0Rpc2Nvbm5lY3RlZEZyb21GaW5kQ29udHJvbGxlciA9IHRydWU7XG5cdFx0XHR3aG9sZVdvcmQgPSB0cnVlO1xuXHRcdFx0bWF0Y2hDYXNlID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2hvbGVXb3JkID0gZmluZFN0YXRlLndob2xlV29yZDtcblx0XHRcdG1hdGNoQ2FzZSA9IGZpbmRTdGF0ZS5tYXRjaENhc2U7XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0aW9uIG93bnMgd2hhdCBpcyBzZWFyY2hlZCBmb3Jcblx0XHRjb25zdCBzID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0bGV0IHNlYXJjaFRleHQ6IHN0cmluZztcblx0XHRsZXQgY3VycmVudE1hdGNoOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChzLmlzRW1wdHkoKSkge1xuXHRcdFx0Ly8gc2VsZWN0aW9uIGlzIGVtcHR5ID0+IGV4cGFuZCB0byBjdXJyZW50IHdvcmRcblx0XHRcdGNvbnN0IHdvcmQgPSBlZGl0b3IuZ2V0Q29uZmlndXJlZFdvcmRBdFBvc2l0aW9uKHMuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdGlmICghd29yZCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHNlYXJjaFRleHQgPSB3b3JkLndvcmQ7XG5cdFx0XHRjdXJyZW50TWF0Y2ggPSBuZXcgU2VsZWN0aW9uKHMuc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBzLnN0YXJ0TGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZWFyY2hUZXh0ID0gZWRpdG9yLmdldE1vZGVsKCkuZ2V0VmFsdWVJblJhbmdlKHMpLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBNdWx0aUN1cnNvclNlc3Npb24oZWRpdG9yLCBmaW5kQ29udHJvbGxlciwgaXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXIsIHNlYXJjaFRleHQsIHdob2xlV29yZCwgbWF0Y2hDYXNlLCBjdXJyZW50TWF0Y2gpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc0Rpc2Nvbm5lY3RlZEZyb21GaW5kQ29udHJvbGxlcjogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VhcmNoVGV4dDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB3aG9sZVdvcmQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IG1hdGNoQ2FzZTogYm9vbGVhbixcblx0XHRwdWJsaWMgY3VycmVudE1hdGNoOiBTZWxlY3Rpb24gfCBudWxsXG5cdCkgeyB9XG5cblx0cHVibGljIGFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCgpOiBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0TWF0Y2ggPSB0aGlzLl9nZXROZXh0TWF0Y2goKTtcblx0XHRpZiAoIW5leHRNYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0cmV0dXJuIG5ldyBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQoYWxsU2VsZWN0aW9ucy5jb25jYXQobmV4dE1hdGNoKSwgbmV4dE1hdGNoLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cblxuXHRwdWJsaWMgbW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCgpOiBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0TWF0Y2ggPSB0aGlzLl9nZXROZXh0TWF0Y2goKTtcblx0XHRpZiAoIW5leHRNYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0cmV0dXJuIG5ldyBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQoYWxsU2VsZWN0aW9ucy5zbGljZSgwLCBhbGxTZWxlY3Rpb25zLmxlbmd0aCAtIDEpLmNvbmNhdChuZXh0TWF0Y2gpLCBuZXh0TWF0Y2gsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE5leHRNYXRjaCgpOiBTZWxlY3Rpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jdXJyZW50TWF0Y2gpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY3VycmVudE1hdGNoO1xuXHRcdFx0dGhpcy5jdXJyZW50TWF0Y2ggPSBudWxsO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0aGlzLmZpbmRDb250cm9sbGVyLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cblx0XHRjb25zdCBhbGxTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBsYXN0QWRkZWRTZWxlY3Rpb24gPSBhbGxTZWxlY3Rpb25zW2FsbFNlbGVjdGlvbnMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbmV4dE1hdGNoID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZmluZE5leHRNYXRjaCh0aGlzLnNlYXJjaFRleHQsIGxhc3RBZGRlZFNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSwgdGhpcy5tYXRjaENhc2UsIHRoaXMud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgZmFsc2UpO1xuXG5cdFx0aWYgKCFuZXh0TWF0Y2gpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihuZXh0TWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBuZXh0TWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIG5leHRNYXRjaC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBuZXh0TWF0Y2gucmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKCk6IE11bHRpQ3Vyc29yU2Vzc2lvblJlc3VsdCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzTWF0Y2ggPSB0aGlzLl9nZXRQcmV2aW91c01hdGNoKCk7XG5cdFx0aWYgKCFwcmV2aW91c01hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRyZXR1cm4gbmV3IE11bHRpQ3Vyc29yU2Vzc2lvblJlc3VsdChhbGxTZWxlY3Rpb25zLmNvbmNhdChwcmV2aW91c01hdGNoKSwgcHJldmlvdXNNYXRjaCwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG5cblx0cHVibGljIG1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKCk6IE11bHRpQ3Vyc29yU2Vzc2lvblJlc3VsdCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzTWF0Y2ggPSB0aGlzLl9nZXRQcmV2aW91c01hdGNoKCk7XG5cdFx0aWYgKCFwcmV2aW91c01hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRyZXR1cm4gbmV3IE11bHRpQ3Vyc29yU2Vzc2lvblJlc3VsdChhbGxTZWxlY3Rpb25zLnNsaWNlKDAsIGFsbFNlbGVjdGlvbnMubGVuZ3RoIC0gMSkuY29uY2F0KHByZXZpb3VzTWF0Y2gpLCBwcmV2aW91c01hdGNoLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcmV2aW91c01hdGNoKCk6IFNlbGVjdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmN1cnJlbnRNYXRjaCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jdXJyZW50TWF0Y2g7XG5cdFx0XHR0aGlzLmN1cnJlbnRNYXRjaCA9IG51bGw7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHRoaXMuZmluZENvbnRyb2xsZXIuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblxuXHRcdGNvbnN0IGFsbFNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IGxhc3RBZGRlZFNlbGVjdGlvbiA9IGFsbFNlbGVjdGlvbnNbYWxsU2VsZWN0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBwcmV2aW91c01hdGNoID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZmluZFByZXZpb3VzTWF0Y2godGhpcy5zZWFyY2hUZXh0LCBsYXN0QWRkZWRTZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLCBmYWxzZSwgdGhpcy5tYXRjaENhc2UsIHRoaXMud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgZmFsc2UpO1xuXG5cdFx0aWYgKCFwcmV2aW91c01hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocHJldmlvdXNNYXRjaC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHByZXZpb3VzTWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIHByZXZpb3VzTWF0Y2gucmFuZ2UuZW5kTGluZU51bWJlciwgcHJldmlvdXNNYXRjaC5yYW5nZS5lbmRDb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHNlbGVjdEFsbChzZWFyY2hTY29wZTogUmFuZ2VbXSB8IG51bGwpOiBGaW5kTWF0Y2hbXSB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRoaXMuZmluZENvbnRyb2xsZXIuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblxuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKHNlYXJjaFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yTW9kZWwuZmluZE1hdGNoZXModGhpcy5zZWFyY2hUZXh0LCBzZWFyY2hTY29wZSwgZmFsc2UsIHRoaXMubWF0Y2hDYXNlLCB0aGlzLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUik7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3JNb2RlbC5maW5kTWF0Y2hlcyh0aGlzLnNlYXJjaFRleHQsIHRydWUsIGZhbHNlLCB0aGlzLm1hdGNoQ2FzZSwgdGhpcy53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5tdWx0aUN1cnNvckNvbnRyb2xsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgX2lnbm9yZVNlbGVjdGlvbkNoYW5nZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfc2Vzc2lvbjogTXVsdGlDdXJzb3JTZXNzaW9uIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXI+KE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlID0gZmFsc2U7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmRTZXNzaW9uKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5TZXNzaW9uSWZOZWVkZWQoZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHQvLyBDcmVhdGUgYSBuZXcgc2Vzc2lvblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IE11bHRpQ3Vyc29yU2Vzc2lvbi5jcmVhdGUodGhpcy5fZWRpdG9yLCBmaW5kQ29udHJvbGxlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblxuXHRcdFx0Y29uc3QgbmV3U3RhdGU6IElOZXdGaW5kUmVwbGFjZVN0YXRlID0geyBzZWFyY2hTdHJpbmc6IHRoaXMuX3Nlc3Npb24uc2VhcmNoVGV4dCB9O1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb24uaXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXIpIHtcblx0XHRcdFx0bmV3U3RhdGUud2hvbGVXb3JkT3ZlcnJpZGUgPSBGaW5kT3B0aW9uT3ZlcnJpZGUuVHJ1ZTtcblx0XHRcdFx0bmV3U3RhdGUubWF0Y2hDYXNlT3ZlcnJpZGUgPSBGaW5kT3B0aW9uT3ZlcnJpZGUuVHJ1ZTtcblx0XHRcdFx0bmV3U3RhdGUuaXNSZWdleE92ZXJyaWRlID0gRmluZE9wdGlvbk92ZXJyaWRlLkZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5jaGFuZ2UobmV3U3RhdGUsIGZhbHNlKTtcblxuXHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2VuZFNlc3Npb24oKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VuZFNlc3Npb24oKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NlLmFkZChmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5tYXRjaENhc2UgfHwgZS53aG9sZVdvcmQpIHtcblx0XHRcdFx0XHR0aGlzLl9lbmRTZXNzaW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbmRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NlLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb24gJiYgdGhpcy5fc2Vzc2lvbi5pc0Rpc2Nvbm5lY3RlZEZyb21GaW5kQ29udHJvbGxlcikge1xuXHRcdFx0Y29uc3QgbmV3U3RhdGU6IElOZXdGaW5kUmVwbGFjZVN0YXRlID0ge1xuXHRcdFx0XHR3aG9sZVdvcmRPdmVycmlkZTogRmluZE9wdGlvbk92ZXJyaWRlLk5vdFNldCxcblx0XHRcdFx0bWF0Y2hDYXNlT3ZlcnJpZGU6IEZpbmRPcHRpb25PdmVycmlkZS5Ob3RTZXQsXG5cdFx0XHRcdGlzUmVnZXhPdmVycmlkZTogRmluZE9wdGlvbk92ZXJyaWRlLk5vdFNldCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZXNzaW9uLmZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuY2hhbmdlKG5ld1N0YXRlLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb24gPSBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZSA9IHRydWU7XG5cdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0dGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9leHBhbmRFbXB0eVRvV29yZChtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBTZWxlY3Rpb24ge1xuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cdFx0Y29uc3Qgd29yZCA9IHRoaXMuX2VkaXRvci5nZXRDb25maWd1cmVkV29yZEF0UG9zaXRpb24oc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVNlc3Npb25SZXN1bHQocmVzdWx0OiBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0U2VsZWN0aW9ucyhyZXN1bHQuc2VsZWN0aW9ucyk7XG5cdFx0aWYgKHJlc3VsdC5yZXZlYWxSYW5nZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChyZXN1bHQucmV2ZWFsUmFuZ2UsIHJlc3VsdC5yZXZlYWxTY3JvbGxUeXBlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Vzc2lvbihmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBNdWx0aUN1cnNvclNlc3Npb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbjtcblx0fVxuXG5cdHB1YmxpYyBhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSBjdXJzb3JzLCBoYW5kbGUgdGhlIGNhc2Ugd2hlcmUgdGhleSBkbyBub3QgYWxsIHNlbGVjdCB0aGUgc2FtZSB0ZXh0LlxuXHRcdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRpZiAoYWxsU2VsZWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cdFx0XHRcdGNvbnN0IG1hdGNoQ2FzZSA9IGZpbmRTdGF0ZS5tYXRjaENhc2U7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnNDb250YWluU2FtZVRleHQgPSBtb2RlbFJhbmdlc0NvbnRhaW5TYW1lVGV4dCh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSwgYWxsU2VsZWN0aW9ucywgbWF0Y2hDYXNlKTtcblx0XHRcdFx0aWYgKCFzZWxlY3Rpb25zQ29udGFpblNhbWVUZXh0KSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0XHRjb25zdCByZXN1bHRpbmdTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhbGxTZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRpbmdTZWxlY3Rpb25zW2ldID0gdGhpcy5fZXhwYW5kRW1wdHlUb1dvcmQobW9kZWwsIGFsbFNlbGVjdGlvbnNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9ucyhyZXN1bHRpbmdTZWxlY3Rpb25zKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYmVnaW5TZXNzaW9uSWZOZWVkZWQoZmluZENvbnRyb2xsZXIpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9hcHBseVNlc3Npb25SZXN1bHQodGhpcy5fc2Vzc2lvbi5hZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2goZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYmVnaW5TZXNzaW9uSWZOZWVkZWQoZmluZENvbnRyb2xsZXIpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9hcHBseVNlc3Npb25SZXN1bHQodGhpcy5fc2Vzc2lvbi5hZGRTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtb3ZlU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdHRoaXMuX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXBwbHlTZXNzaW9uUmVzdWx0KHRoaXMuX3Nlc3Npb24ubW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCgpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbW92ZVNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2goZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYmVnaW5TZXNzaW9uSWZOZWVkZWQoZmluZENvbnRyb2xsZXIpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9hcHBseVNlc3Npb25SZXN1bHQodGhpcy5fc2Vzc2lvbi5tb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCgpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2VsZWN0QWxsKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbWF0Y2hlczogRmluZE1hdGNoW10gfCBudWxsID0gbnVsbDtcblxuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cblx0XHQvLyBTcGVjaWFsIGNhc2U6IGZpbmQgd2lkZ2V0IG93bnMgZW50aXJlbHkgd2hhdCB3ZSBzZWFyY2ggZm9yIGlmOlxuXHRcdC8vIC0gZm9jdXMgaXMgbm90IGluIHRoZSBlZGl0b3IgKGkuZS4gaXQgaXMgaW4gdGhlIGZpbmQgd2lkZ2V0KVxuXHRcdC8vIC0gYW5kIHRoZSBzZWFyY2ggd2lkZ2V0IGlzIHZpc2libGVcblx0XHQvLyAtIGFuZCB0aGUgc2VhcmNoIHN0cmluZyBpcyBub24tZW1wdHlcblx0XHQvLyAtIGFuZCB3ZSdyZSBzZWFyY2hpbmcgZm9yIGEgcmVnZXhcblx0XHRpZiAoZmluZFN0YXRlLmlzUmV2ZWFsZWQgJiYgZmluZFN0YXRlLnNlYXJjaFN0cmluZy5sZW5ndGggPiAwICYmIGZpbmRTdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGZpbmRTdGF0ZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0XHRtYXRjaGVzID0gZWRpdG9yTW9kZWwuZmluZE1hdGNoZXMoZmluZFN0YXRlLnNlYXJjaFN0cmluZywgZmluZFN0YXRlLnNlYXJjaFNjb3BlLCBmaW5kU3RhdGUuaXNSZWdleCwgZmluZFN0YXRlLm1hdGNoQ2FzZSwgZmluZFN0YXRlLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXRjaGVzID0gZWRpdG9yTW9kZWwuZmluZE1hdGNoZXMoZmluZFN0YXRlLnNlYXJjaFN0cmluZywgdHJ1ZSwgZmluZFN0YXRlLmlzUmVnZXgsIGZpbmRTdGF0ZS5tYXRjaENhc2UsIGZpbmRTdGF0ZS53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHRoaXMuX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyKTtcblx0XHRcdGlmICghdGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG1hdGNoZXMgPSB0aGlzLl9zZXNzaW9uLnNlbGVjdEFsbChmaW5kU3RhdGUuc2VhcmNoU2NvcGUpO1xuXHRcdH1cblxuXHRcdGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGVkaXRvclNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdC8vIEhhdmUgdGhlIHByaW1hcnkgY3Vyc29yIHJlbWFpbiB0aGUgb25lIHdoZXJlIHRoZSBhY3Rpb24gd2FzIGludm9rZWRcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBtYXRjaGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gbWF0Y2hlc1tpXTtcblx0XHRcdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gbWF0Y2gucmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKGVkaXRvclNlbGVjdGlvbik7XG5cdFx0XHRcdGlmIChpbnRlcnNlY3Rpb24pIHtcblx0XHRcdFx0XHQvLyBiaW5nbyFcblx0XHRcdFx0XHRtYXRjaGVzW2ldID0gbWF0Y2hlc1swXTtcblx0XHRcdFx0XHRtYXRjaGVzWzBdID0gbWF0Y2g7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2V0U2VsZWN0aW9ucyhtYXRjaGVzLm1hcChtID0+IG5ldyBTZWxlY3Rpb24obS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIG0ucmFuZ2Uuc3RhcnRDb2x1bW4sIG0ucmFuZ2UuZW5kTGluZU51bWJlciwgbS5yYW5nZS5lbmRDb2x1bW4pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNlbGVjdEFsbFVzaW5nU2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3NldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBtdWx0aUN1cnNvckNvbnRyb2xsZXIgPSBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFtdWx0aUN1cnNvckNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRcdGlmIChmaW5kQ29udHJvbGxlcikge1xuXHRcdFx0XHR0aGlzLl9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyLCBmaW5kQ29udHJvbGxlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdGaW5kQ29udHJvbGxlciA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKENvbW1vbkZpbmRDb250cm9sbGVyLCBlZGl0b3IpO1xuXHRcdFx0XHR0aGlzLl9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyLCBuZXdGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRcdG5ld0ZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbiBleHRlbmRzIE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5hZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCcsIFwiQWRkIFNlbGVjdGlvbiB0byBOZXh0IEZpbmQgTWF0Y2hcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkFkZCAmJk5leHQgT2NjdXJyZW5jZVwiKSxcblx0XHRcdFx0b3JkZXI6IDVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRwcm90ZWN0ZWQgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyLmFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaChmaW5kQ29udHJvbGxlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2hBY3Rpb24gZXh0ZW5kcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uYWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignYWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCcsIFwiQWRkIFNlbGVjdGlvbiB0byBQcmV2aW91cyBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJBZGQgUCYmcmV2aW91cyBPY2N1cnJlbmNlXCIpLFxuXHRcdFx0XHRvcmRlcjogNlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHByb3RlY3RlZCBfcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlcjogTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLCBmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRtdWx0aUN1cnNvckNvbnRyb2xsZXIuYWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaChmaW5kQ29udHJvbGxlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gZXh0ZW5kcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ubW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCcsIFwiTW92ZSBMYXN0IFNlbGVjdGlvbiB0byBOZXh0IEZpbmQgTWF0Y2hcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHByb3RlY3RlZCBfcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlcjogTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLCBmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRtdWx0aUN1cnNvckNvbnRyb2xsZXIubW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaChmaW5kQ29udHJvbGxlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoQWN0aW9uIGV4dGVuZHMgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCcsIFwiTW92ZSBMYXN0IFNlbGVjdGlvbiB0byBQcmV2aW91cyBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXHRwcm90ZWN0ZWQgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyLm1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKGZpbmRDb250cm9sbGVyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0SGlnaGxpZ2h0c0FjdGlvbiBleHRlbmRzIE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5zZWxlY3RIaWdobGlnaHRzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdzZWxlY3RBbGxPY2N1cnJlbmNlc09mRmluZE1hdGNoJywgXCJTZWxlY3QgQWxsIE9jY3VycmVuY2VzIG9mIEZpbmQgTWF0Y2hcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5TCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pU2VsZWN0SGlnaGxpZ2h0cycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTZWxlY3QgQWxsICYmT2NjdXJyZW5jZXNcIiksXG5cdFx0XHRcdG9yZGVyOiA3XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cHJvdGVjdGVkIF9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyOiBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIsIGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdG11bHRpQ3Vyc29yQ29udHJvbGxlci5zZWxlY3RBbGwoZmluZENvbnRyb2xsZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wYXRDaGFuZ2VBbGwgZXh0ZW5kcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uY2hhbmdlQWxsJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdjaGFuZ2VBbGwubGFiZWwnLCBcIkNoYW5nZSBBbGwgT2NjdXJyZW5jZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkYyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJzFfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHByb3RlY3RlZCBfcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlcjogTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLCBmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRtdWx0aUN1cnNvckNvbnRyb2xsZXIuc2VsZWN0QWxsKGZpbmRDb250cm9sbGVyKTtcblx0fVxufVxuXG5jbGFzcyBTZWxlY3Rpb25IaWdobGlnaHRlclN0YXRlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxWZXJzaW9uSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfY2FjaGVkRmluZE1hdGNoZXM6IFJhbmdlW10gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hUZXh0OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWF0Y2hDYXNlOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmRTZXBhcmF0b3JzOiBzdHJpbmcgfCBudWxsLFxuXHRcdHByZXZTdGF0ZTogU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZSB8IG51bGxcblx0KSB7XG5cdFx0dGhpcy5fbW9kZWxWZXJzaW9uSWQgPSB0aGlzLl9tb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRpZiAocHJldlN0YXRlXG5cdFx0XHQmJiB0aGlzLl9tb2RlbCA9PT0gcHJldlN0YXRlLl9tb2RlbFxuXHRcdFx0JiYgdGhpcy5fc2VhcmNoVGV4dCA9PT0gcHJldlN0YXRlLl9zZWFyY2hUZXh0XG5cdFx0XHQmJiB0aGlzLl9tYXRjaENhc2UgPT09IHByZXZTdGF0ZS5fbWF0Y2hDYXNlXG5cdFx0XHQmJiB0aGlzLl93b3JkU2VwYXJhdG9ycyA9PT0gcHJldlN0YXRlLl93b3JkU2VwYXJhdG9yc1xuXHRcdFx0JiYgdGhpcy5fbW9kZWxWZXJzaW9uSWQgPT09IHByZXZTdGF0ZS5fbW9kZWxWZXJzaW9uSWRcblx0XHQpIHtcblx0XHRcdHRoaXMuX2NhY2hlZEZpbmRNYXRjaGVzID0gcHJldlN0YXRlLl9jYWNoZWRGaW5kTWF0Y2hlcztcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmluZE1hdGNoZXMoKTogUmFuZ2VbXSB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZEZpbmRNYXRjaGVzID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRGaW5kTWF0Y2hlcyA9IHRoaXMuX21vZGVsLmZpbmRNYXRjaGVzKHRoaXMuX3NlYXJjaFRleHQsIHRydWUsIGZhbHNlLCB0aGlzLl9tYXRjaENhc2UsIHRoaXMuX3dvcmRTZXBhcmF0b3JzLCBmYWxzZSkubWFwKG0gPT4gbS5yYW5nZSk7XG5cdFx0XHR0aGlzLl9jYWNoZWRGaW5kTWF0Y2hlcy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRGaW5kTWF0Y2hlcztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0aW9uSGlnaGxpZ2h0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuc2VsZWN0aW9uSGlnaGxpZ2h0ZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSBfaXNFbmFibGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc0VuYWJsZWRNdWx0aWxpbmU6IGJvb2xlYW47XG5cdHByaXZhdGUgX21heExlbmd0aDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVTb29uOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHN0YXRlOiBTZWxlY3Rpb25IaWdobGlnaHRlclN0YXRlIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX2lzRW5hYmxlZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodCk7XG5cdFx0dGhpcy5faXNFbmFibGVkTXVsdGlsaW5lID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0TXVsdGlsaW5lKTtcblx0XHR0aGlzLl9tYXhMZW5ndGggPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25IaWdobGlnaHRNYXhMZW5ndGgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMudXBkYXRlU29vbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3VwZGF0ZSgpLCAzMDApKTtcblx0XHR0aGlzLnN0YXRlID0gbnVsbDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdHRoaXMuX2lzRW5hYmxlZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodCk7XG5cdFx0XHR0aGlzLl9pc0VuYWJsZWRNdWx0aWxpbmUgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmUpO1xuXHRcdFx0dGhpcy5fbWF4TGVuZ3RoID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlOiBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cblx0XHRcdGlmICghdGhpcy5faXNFbmFibGVkKSB7XG5cdFx0XHRcdC8vIEVhcmx5IGV4aXQgaWYgbm90aGluZyBuZWVkcyB0byBiZSBkb25lIVxuXHRcdFx0XHQvLyBMZWF2ZSBzb21lIGZvcm0gb2YgZWFybHkgZXhpdCBjaGVjayBoZXJlIGlmIHlvdSB3aXNoIHRvIGNvbnRpbnVlIGJlaW5nIGEgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZSBsaXN0ZW5lciA7KVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5zdGF0ZSkge1xuXHRcdFx0XHRcdFx0Ly8gbm8gbG9uZ2VyIHZhbGlkXG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRTdGF0ZShudWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0U3RhdGUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUobnVsbCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoZmluZENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRTdGF0ZShTZWxlY3Rpb25IaWdobGlnaHRlci5fY3JlYXRlU3RhdGUodGhpcy5zdGF0ZSwgdGhpcy5faXNFbmFibGVkLCB0aGlzLl9pc0VuYWJsZWRNdWx0aWxpbmUsIHRoaXMuX21heExlbmd0aCwgdGhpcy5lZGl0b3IpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVTdGF0ZShvbGRTdGF0ZTogU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZSB8IG51bGwsIGlzRW5hYmxlZDogYm9vbGVhbiwgaXNFbmFibGVkTXVsdGlsaW5lOiBib29sZWFuLCBtYXhMZW5ndGg6IG51bWJlciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFNlbGVjdGlvbkhpZ2hsaWdodGVyU3RhdGUgfCBudWxsIHtcblx0XHRpZiAoIWlzRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIWlzRW5hYmxlZE11bHRpbGluZSkge1xuXHRcdFx0Y29uc3QgcyA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChzLnN0YXJ0TGluZU51bWJlciAhPT0gcy5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIG11bHRpbGluZSBmb3JiaWRkZW4gZm9yIHBlcmYgcmVhc29uc1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbXVsdGlDdXJzb3JDb250cm9sbGVyID0gTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghbXVsdGlDdXJzb3JDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWZpbmRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IHIgPSBtdWx0aUN1cnNvckNvbnRyb2xsZXIuZ2V0U2Vzc2lvbihmaW5kQ29udHJvbGxlcik7XG5cdFx0aWYgKCFyKSB7XG5cdFx0XHRjb25zdCBhbGxTZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGlmIChhbGxTZWxlY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblx0XHRcdFx0Y29uc3QgbWF0Y2hDYXNlID0gZmluZFN0YXRlLm1hdGNoQ2FzZTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uc0NvbnRhaW5TYW1lVGV4dCA9IG1vZGVsUmFuZ2VzQ29udGFpblNhbWVUZXh0KGVkaXRvci5nZXRNb2RlbCgpLCBhbGxTZWxlY3Rpb25zLCBtYXRjaENhc2UpO1xuXHRcdFx0XHRpZiAoIXNlbGVjdGlvbnNDb250YWluU2FtZVRleHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyID0gTXVsdGlDdXJzb3JTZXNzaW9uLmNyZWF0ZShlZGl0b3IsIGZpbmRDb250cm9sbGVyKTtcblx0XHR9XG5cdFx0aWYgKCFyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoci5jdXJyZW50TWF0Y2gpIHtcblx0XHRcdC8vIFRoaXMgaXMgYW4gZW1wdHkgc2VsZWN0aW9uXG5cdFx0XHQvLyBEbyBub3QgaW50ZXJmZXJlIHdpdGggc2VtYW50aWMgd29yZCBoaWdobGlnaHRpbmcgaW4gdGhlIG5vIHNlbGVjdGlvbiBjYXNlXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKC9eWyBcXHRdKyQvLnRlc3Qoci5zZWFyY2hUZXh0KSkge1xuXHRcdFx0Ly8gd2hpdGVzcGFjZSBvbmx5IHNlbGVjdGlvblxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChtYXhMZW5ndGggPiAwICYmIHIuc2VhcmNoVGV4dC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHRcdC8vIHZlcnkgbG9uZyBzZWxlY3Rpb25cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IGJldHRlciBoYW5kbGluZyBvZiB0aGlzIGNhc2Vcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpO1xuXHRcdGNvbnN0IGNhc2VTZW5zaXRpdmUgPSBmaW5kU3RhdGUubWF0Y2hDYXNlO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSBmaW5kIHdpZGdldCBzaG93cyB0aGUgZXhhY3Qgc2FtZSBtYXRjaGVzXG5cdFx0aWYgKGZpbmRTdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHRsZXQgZmluZFN0YXRlU2VhcmNoU3RyaW5nID0gZmluZFN0YXRlLnNlYXJjaFN0cmluZztcblx0XHRcdGlmICghY2FzZVNlbnNpdGl2ZSkge1xuXHRcdFx0XHRmaW5kU3RhdGVTZWFyY2hTdHJpbmcgPSBmaW5kU3RhdGVTZWFyY2hTdHJpbmcudG9Mb3dlckNhc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG15U2VhcmNoU3RyaW5nID0gci5zZWFyY2hUZXh0O1xuXHRcdFx0aWYgKCFjYXNlU2Vuc2l0aXZlKSB7XG5cdFx0XHRcdG15U2VhcmNoU3RyaW5nID0gbXlTZWFyY2hTdHJpbmcudG9Mb3dlckNhc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpbmRTdGF0ZVNlYXJjaFN0cmluZyA9PT0gbXlTZWFyY2hTdHJpbmcgJiYgci5tYXRjaENhc2UgPT09IGZpbmRTdGF0ZS5tYXRjaENhc2UgJiYgci53aG9sZVdvcmQgPT09IGZpbmRTdGF0ZS53aG9sZVdvcmQgJiYgIWZpbmRTdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZShlZGl0b3IuZ2V0TW9kZWwoKSwgci5zZWFyY2hUZXh0LCByLm1hdGNoQ2FzZSwgci53aG9sZVdvcmQgPyBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBvbGRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTdGF0ZShuZXdTdGF0ZTogU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZSB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXRlID0gbmV3U3RhdGU7XG5cblx0XHRpZiAoIXRoaXMuc3RhdGUpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdC8vIHRoZSBmaWxlIGlzIHRvbyBsYXJnZSwgc28gc2VhcmNoaW5nIHdvcmQgdW5kZXIgY3Vyc29yIGluIHRoZSB3aG9sZSBkb2N1bWVudCB3b3VsZCBiZSBibG9ja2luZyB0aGUgVUkuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsTWF0Y2hlcyA9IHRoaXMuc3RhdGUuZmluZE1hdGNoZXMoKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0c2VsZWN0aW9ucy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHQvLyBkbyBub3Qgb3ZlcmxhcCB3aXRoIHNlbGVjdGlvbiAoaXNzdWUgIzY0IGFuZCAjNTEyKVxuXHRcdGNvbnN0IG1hdGNoZXM6IFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgaiA9IDAsIGxlbiA9IGFsbE1hdGNoZXMubGVuZ3RoLCBsZW5KID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47KSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGFsbE1hdGNoZXNbaV07XG5cblx0XHRcdGlmIChqID49IGxlbkopIHtcblx0XHRcdFx0Ly8gZmluaXNoZWQgYWxsIGVkaXRvciBzZWxlY3Rpb25zXG5cdFx0XHRcdG1hdGNoZXMucHVzaChtYXRjaCk7XG5cdFx0XHRcdGkrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNtcCA9IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhtYXRjaCwgc2VsZWN0aW9uc1tqXSk7XG5cdFx0XHRcdGlmIChjbXAgPCAwKSB7XG5cdFx0XHRcdFx0Ly8gbWF0Y2ggaXMgYmVmb3JlIHNlbFxuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb25zW2pdLmlzRW1wdHkoKSB8fCAhUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKG1hdGNoLCBzZWxlY3Rpb25zW2pdKSkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlcy5wdXNoKG1hdGNoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNtcCA+IDApIHtcblx0XHRcdFx0XHQvLyBzZWwgaXMgYmVmb3JlIG1hdGNoXG5cdFx0XHRcdFx0aisrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHNlbCBpcyBlcXVhbCB0byBtYXRjaFxuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRqKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBvY2N1cnJlbmNlSGlnaGxpZ2h0aW5nOiBib29sZWFuID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5vY2N1cnJlbmNlc0hpZ2hsaWdodCkgIT09ICdvZmYnO1xuXHRcdGNvbnN0IGhhc1NlbWFudGljSGlnaGxpZ2h0cyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIuaGFzKG1vZGVsKSAmJiBvY2N1cnJlbmNlSGlnaGxpZ2h0aW5nO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gbWF0Y2hlcy5tYXAociA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogcixcblx0XHRcdFx0b3B0aW9uczogZ2V0U2VsZWN0aW9uSGlnaGxpZ2h0RGVjb3JhdGlvbk9wdGlvbnMoaGFzU2VtYW50aWNIaWdobGlnaHRzKVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChkZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRTdGF0ZShudWxsKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW9kZWxSYW5nZXNDb250YWluU2FtZVRleHQobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlczogUmFuZ2VbXSwgbWF0Y2hDYXNlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGNvbnN0IHNlbGVjdGVkVGV4dCA9IGdldFZhbHVlSW5SYW5nZShtb2RlbCwgcmFuZ2VzWzBdLCAhbWF0Y2hDYXNlKTtcblx0Zm9yIChsZXQgaSA9IDEsIGxlbiA9IHJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzW2ldO1xuXHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGhpc1NlbGVjdGVkVGV4dCA9IGdldFZhbHVlSW5SYW5nZShtb2RlbCwgcmFuZ2UsICFtYXRjaENhc2UpO1xuXHRcdGlmIChzZWxlY3RlZFRleHQgIT09IHRoaXNTZWxlY3RlZFRleHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGdldFZhbHVlSW5SYW5nZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCB0b0xvd2VyQ2FzZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRyZXR1cm4gKHRvTG93ZXJDYXNlID8gdGV4dC50b0xvd2VyQ2FzZSgpIDogdGV4dCk7XG59XG5cbmludGVyZmFjZSBGb2N1c0N1cnNvckFyZ3Mge1xuXHRzb3VyY2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c05leHRDdXJzb3IgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZm9jdXNOZXh0Q3Vyc29yJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5mb2N1c05leHRDdXJzb3InLCBcIkZvY3VzIE5leHQgQ3Vyc29yXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbXV0bGljdXJzb3IuZm9jdXNOZXh0Q3Vyc29yLmRlc2NyaXB0aW9uJywgXCJGb2N1c2VzIHRoZSBuZXh0IGN1cnNvclwiKSxcblx0XHRcdFx0YXJnczogW10sXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IEZvY3VzQ3Vyc29yQXJncyk6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXG5cdFx0aWYgKHZpZXdNb2RlbC5jdXJzb3JDb25maWcucmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ3Vyc29yU3RhdGUgPSBBcnJheS5mcm9tKHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdFx0Y29uc3QgZmlyc3RDdXJzb3IgPSBwcmV2aW91c0N1cnNvclN0YXRlLnNoaWZ0KCk7XG5cdFx0aWYgKCFmaXJzdEN1cnNvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwcmV2aW91c0N1cnNvclN0YXRlLnB1c2goZmlyc3RDdXJzb3IpO1xuXG5cdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhhcmdzLnNvdXJjZSwgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LCBwcmV2aW91c0N1cnNvclN0YXRlKTtcblx0XHR2aWV3TW9kZWwucmV2ZWFsUHJpbWFyeUN1cnNvcihhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNQcmV2aW91c0N1cnNvciBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5mb2N1c1ByZXZpb3VzQ3Vyc29yJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5mb2N1c1ByZXZpb3VzQ3Vyc29yJywgXCJGb2N1cyBQcmV2aW91cyBDdXJzb3JcIiksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtdXRsaWN1cnNvci5mb2N1c1ByZXZpb3VzQ3Vyc29yLmRlc2NyaXB0aW9uJywgXCJGb2N1c2VzIHRoZSBwcmV2aW91cyBjdXJzb3JcIiksXG5cdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBGb2N1c0N1cnNvckFyZ3MpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblxuXHRcdGlmICh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLnJlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gQXJyYXkuZnJvbSh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHRcdGNvbnN0IGZpcnN0Q3Vyc29yID0gcHJldmlvdXNDdXJzb3JTdGF0ZS5wb3AoKTtcblx0XHRpZiAoIWZpcnN0Q3Vyc29yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHByZXZpb3VzQ3Vyc29yU3RhdGUudW5zaGlmdChmaXJzdEN1cnNvcik7XG5cblx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKGFyZ3Muc291cmNlLCBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsIHByZXZpb3VzQ3Vyc29yU3RhdGUpO1xuXHRcdHZpZXdNb2RlbC5yZXZlYWxQcmltYXJ5Q3Vyc29yKGFyZ3Muc291cmNlLCB0cnVlKTtcblx0XHRhbm5vdW5jZUN1cnNvckNoYW5nZShwcmV2aW91c0N1cnNvclN0YXRlLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlci5JRCwgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkxhenkpO1xucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oU2VsZWN0aW9uSGlnaGxpZ2h0ZXIuSUQsIFNlbGVjdGlvbkhpZ2hsaWdodGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xuXG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRDdXJzb3JBYm92ZSk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRDdXJzb3JCZWxvdyk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRDdXJzb3JBdEVuZE9mRWFjaExpbmVTZWxlY3RlZCk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihNb3ZlU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNlbGVjdEhpZ2hsaWdodHNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ29tcGF0Q2hhbmdlQWxsKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluc2VydEN1cnNvckF0RW5kT2ZMaW5lU2VsZWN0ZWQpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5zZXJ0Q3Vyc29yQXRUb3BPZkxpbmVTZWxlY3RlZCk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2N1c05leHRDdXJzb3IpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9jdXNQcmV2aW91c0N1cnNvcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxjQUFjLGlDQUFpQyxzQkFBc0Isa0NBQW9EO0FBQ2xJLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsMEJBQXdEO0FBQ2pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUE0RCxrQkFBa0I7QUFDOUUsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBZ0Q7QUFDekQsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhDQUE4QztBQUN2RCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHFCQUFxQixxQkFBb0MsYUFBa0M7QUFDbkcsUUFBTSxhQUFhLFlBQVksT0FBTyxRQUFNLENBQUMsb0JBQW9CLEtBQUssU0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDNUYsTUFBSSxXQUFXLFVBQVUsR0FBRztBQUMzQixVQUFNLGtCQUFrQixXQUFXLElBQUksUUFBTSxRQUFRLEdBQUcsVUFBVSxTQUFTLFVBQVUsV0FBVyxHQUFHLFVBQVUsU0FBUyxNQUFNLEVBQUUsRUFBRSxLQUFLLElBQUk7QUFDekksVUFBTSxNQUFNLFdBQVcsV0FBVyxJQUFJLElBQUksU0FBUyxlQUFlLHFCQUFxQixlQUFlLElBQUksSUFBSSxTQUFTLGdCQUFnQixzQkFBc0IsZUFBZTtBQUM1SyxXQUFPLEdBQUc7QUFBQSxFQUNYO0FBQ0Q7QUFPTyxNQUFNLDBCQUEwQixhQUFhO0FBQUEsRUFFbkQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLDJCQUEyQixrQkFBa0I7QUFBQSxNQUNsRSxjQUFjO0FBQUEsTUFDZCxRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsUUFDL0MsT0FBTztBQUFBLFVBQ04sU0FBUyxPQUFPLFFBQVEsT0FBTyxNQUFNLFFBQVE7QUFBQSxVQUM3QyxXQUFXLENBQUMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRLE9BQU87QUFBQSxRQUM1RDtBQUFBLFFBQ0EsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsUUFBUSxPQUFPO0FBQUEsUUFDZixPQUFPO0FBQUEsUUFDUCxPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssdUJBQXVCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLG9CQUFvQjtBQUFBLFFBQzVHLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sSUFBSSxVQUE0QixRQUFxQixNQUE4QjtBQUN6RixRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBRUEsUUFBSSxpQkFBaUI7QUFDckIsUUFBSSxRQUFRLEtBQUssZ0JBQWdCLE9BQU87QUFDdkMsdUJBQWlCO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFlBQVksT0FBTyxjQUFjO0FBRXZDLFFBQUksVUFBVSxhQUFhLFVBQVU7QUFDcEM7QUFBQSxJQUNEO0FBRUEsY0FBVSxNQUFNLGlCQUFpQjtBQUNqQyxVQUFNLHNCQUFzQixVQUFVLGdCQUFnQjtBQUN0RCxjQUFVO0FBQUEsTUFDVCxLQUFLO0FBQUEsTUFDTCxtQkFBbUI7QUFBQSxNQUNuQixtQkFBbUIsWUFBWSxXQUFXLHFCQUFxQixjQUFjO0FBQUEsSUFDOUU7QUFDQSxjQUFVLG9CQUFvQixLQUFLLE1BQU07QUFDekMseUJBQXFCLHFCQUFxQixVQUFVLGdCQUFnQixDQUFDO0FBQUEsRUFDdEU7QUFDRDtBQUVPLE1BQU0sMEJBQTBCLGFBQWE7QUFBQSxFQUVuRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsMkJBQTJCLGtCQUFrQjtBQUFBLE1BQ2xFLGNBQWM7QUFBQSxNQUNkLFFBQVE7QUFBQSxRQUNQLFFBQVEsa0JBQWtCO0FBQUEsUUFDMUIsU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxRQUMvQyxPQUFPO0FBQUEsVUFDTixTQUFTLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUTtBQUFBLFVBQzdDLFdBQVcsQ0FBQyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsU0FBUztBQUFBLFFBQzlEO0FBQUEsUUFDQSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxRQUFRLE9BQU87QUFBQSxRQUNmLE9BQU87QUFBQSxRQUNQLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyx1QkFBdUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsb0JBQW9CO0FBQUEsUUFDNUcsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxJQUFJLFVBQTRCLFFBQXFCLE1BQThCO0FBQ3pGLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGlCQUFpQjtBQUNyQixRQUFJLFFBQVEsS0FBSyxnQkFBZ0IsT0FBTztBQUN2Qyx1QkFBaUI7QUFBQSxJQUNsQjtBQUNBLFVBQU0sWUFBWSxPQUFPLGNBQWM7QUFFdkMsUUFBSSxVQUFVLGFBQWEsVUFBVTtBQUNwQztBQUFBLElBQ0Q7QUFFQSxjQUFVLE1BQU0saUJBQWlCO0FBQ2pDLFVBQU0sc0JBQXNCLFVBQVUsZ0JBQWdCO0FBQ3RELGNBQVU7QUFBQSxNQUNULEtBQUs7QUFBQSxNQUNMLG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQixjQUFjLFdBQVcscUJBQXFCLGNBQWM7QUFBQSxJQUNoRjtBQUNBLGNBQVUsdUJBQXVCLEtBQUssTUFBTTtBQUM1Qyx5QkFBcUIscUJBQXFCLFVBQVUsZ0JBQWdCLENBQUM7QUFBQSxFQUN0RTtBQUNEO0FBRUEsTUFBTSw0Q0FBNEMsYUFBYTtBQUFBLEVBRTlELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSw2Q0FBNkMsMEJBQTBCO0FBQUEsTUFDNUYsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQzdDLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULFFBQVEsT0FBTztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLHlDQUF5QyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyw0QkFBNEI7QUFBQSxRQUN0SSxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHVCQUF1QixXQUFzQixPQUFtQixRQUEyQjtBQUNsRyxRQUFJLFVBQVUsUUFBUSxHQUFHO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLGFBQVMsSUFBSSxVQUFVLGlCQUFpQixJQUFJLFVBQVUsZUFBZSxLQUFLO0FBQ3pFLFlBQU0sdUJBQXVCLE1BQU0saUJBQWlCLENBQUM7QUFDckQsYUFBTyxLQUFLLElBQUksVUFBVSxHQUFHLHNCQUFzQixHQUFHLG9CQUFvQixDQUFDO0FBQUEsSUFDNUU7QUFDQSxRQUFJLFVBQVUsWUFBWSxHQUFHO0FBQzVCLGFBQU8sS0FBSyxJQUFJLFVBQVUsVUFBVSxlQUFlLFVBQVUsV0FBVyxVQUFVLGVBQWUsVUFBVSxTQUFTLENBQUM7QUFBQSxJQUN0SDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBMkI7QUFDakUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxPQUFPLFNBQVM7QUFDOUIsVUFBTSxhQUFhLE9BQU8sY0FBYztBQUN4QyxVQUFNLFlBQVksT0FBTyxjQUFjO0FBQ3ZDLFVBQU0sc0JBQXNCLFVBQVUsZ0JBQWdCO0FBQ3RELFVBQU0sZ0JBQTZCLENBQUM7QUFDcEMsZUFBVyxRQUFRLENBQUMsUUFBUSxLQUFLLHVCQUF1QixLQUFLLE9BQU8sYUFBYSxDQUFDO0FBRWxGLFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0IsYUFBTyxjQUFjLGFBQWE7QUFBQSxJQUNuQztBQUNBLHlCQUFxQixxQkFBcUIsVUFBVSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3RFO0FBQ0Q7QUFFQSxNQUFNLHdDQUF3QyxhQUFhO0FBQUEsRUFFMUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLGtDQUFrQyx1QkFBdUI7QUFBQSxNQUM5RSxjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sSUFBSSxVQUE0QixRQUEyQjtBQUNqRSxRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLE9BQU8sY0FBYztBQUN4QyxVQUFNLFlBQVksT0FBTyxTQUFTLEVBQUUsYUFBYTtBQUVqRCxVQUFNLGdCQUE2QixDQUFDO0FBQ3BDLGFBQVMsSUFBSSxXQUFXLENBQUMsRUFBRSxpQkFBaUIsS0FBSyxXQUFXLEtBQUs7QUFDaEUsb0JBQWMsS0FBSyxJQUFJLFVBQVUsR0FBRyxXQUFXLENBQUMsRUFBRSxhQUFhLEdBQUcsV0FBVyxDQUFDLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDM0Y7QUFFQSxVQUFNLFlBQVksT0FBTyxjQUFjO0FBQ3ZDLFVBQU0sc0JBQXNCLFVBQVUsZ0JBQWdCO0FBQ3RELFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0IsYUFBTyxjQUFjLGFBQWE7QUFBQSxJQUNuQztBQUNBLHlCQUFxQixxQkFBcUIsVUFBVSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3RFO0FBQ0Q7QUFFQSxNQUFNLHdDQUF3QyxhQUFhO0FBQUEsRUFFMUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLCtCQUErQixvQkFBb0I7QUFBQSxNQUN4RSxjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sSUFBSSxVQUE0QixRQUEyQjtBQUNqRSxRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLE9BQU8sY0FBYztBQUV4QyxVQUFNLGdCQUE2QixDQUFDO0FBQ3BDLGFBQVMsSUFBSSxXQUFXLENBQUMsRUFBRSxpQkFBaUIsS0FBSyxHQUFHLEtBQUs7QUFDeEQsb0JBQWMsS0FBSyxJQUFJLFVBQVUsR0FBRyxXQUFXLENBQUMsRUFBRSxhQUFhLEdBQUcsV0FBVyxDQUFDLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDM0Y7QUFFQSxVQUFNLFlBQVksT0FBTyxjQUFjO0FBQ3ZDLFVBQU0sc0JBQXNCLFVBQVUsZ0JBQWdCO0FBQ3RELFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0IsYUFBTyxjQUFjLGFBQWE7QUFBQSxJQUNuQztBQUNBLHlCQUFxQixxQkFBcUIsVUFBVSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3RFO0FBQ0Q7QUFFTyxNQUFNLHlCQUF5QjtBQUFBLEVBQ3JDLFlBQ2lCLFlBQ0EsYUFDQSxrQkFDZjtBQUhlO0FBQ0E7QUFDQTtBQUFBLEVBQ2I7QUFDTDtBQUVPLE1BQU0sbUJBQW1CO0FBQUEsRUFxRC9CLFlBQ2tCLFNBQ0QsZ0JBQ0Esa0NBQ0EsWUFDQSxXQUNBLFdBQ1QsY0FDTjtBQVBnQjtBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDVDtBQUFBLEVBQ0o7QUFBQSxFQTNESixPQUFjLE9BQU8sUUFBcUIsZ0JBQWlFO0FBQzFHLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sWUFBWSxlQUFlLFNBQVM7QUFNMUMsUUFBSSxDQUFDLE9BQU8sYUFBYSxLQUFLLFVBQVUsY0FBYyxVQUFVLGFBQWEsU0FBUyxHQUFHO0FBRXhGLGFBQU8sSUFBSSxtQkFBbUIsUUFBUSxnQkFBZ0IsT0FBTyxVQUFVLGNBQWMsVUFBVSxXQUFXLFVBQVUsV0FBVyxJQUFJO0FBQUEsSUFDcEk7QUFJQSxRQUFJLG1DQUFtQztBQUN2QyxRQUFJO0FBQ0osUUFBSTtBQUNKLFVBQU0sYUFBYSxPQUFPLGNBQWM7QUFDeEMsUUFBSSxXQUFXLFdBQVcsS0FBSyxXQUFXLENBQUMsRUFBRSxRQUFRLEdBQUc7QUFDdkQseUNBQW1DO0FBQ25DLGtCQUFZO0FBQ1osa0JBQVk7QUFBQSxJQUNiLE9BQU87QUFDTixrQkFBWSxVQUFVO0FBQ3RCLGtCQUFZLFVBQVU7QUFBQSxJQUN2QjtBQUdBLFVBQU0sSUFBSSxPQUFPLGFBQWE7QUFFOUIsUUFBSTtBQUNKLFFBQUksZUFBaUM7QUFFckMsUUFBSSxFQUFFLFFBQVEsR0FBRztBQUVoQixZQUFNLE9BQU8sT0FBTyw0QkFBNEIsRUFBRSxpQkFBaUIsQ0FBQztBQUNwRSxVQUFJLENBQUMsTUFBTTtBQUNWLGVBQU87QUFBQSxNQUNSO0FBQ0EsbUJBQWEsS0FBSztBQUNsQixxQkFBZSxJQUFJLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxhQUFhLEVBQUUsaUJBQWlCLEtBQUssU0FBUztBQUFBLElBQ3BHLE9BQU87QUFDTixtQkFBYSxPQUFPLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLFFBQVEsU0FBUyxJQUFJO0FBQUEsSUFDeEU7QUFFQSxXQUFPLElBQUksbUJBQW1CLFFBQVEsZ0JBQWdCLGtDQUFrQyxZQUFZLFdBQVcsV0FBVyxZQUFZO0FBQUEsRUFDdkk7QUFBQSxFQVlPLDhCQUErRDtBQUNyRSxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBWSxLQUFLLGNBQWM7QUFDckMsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxjQUFjO0FBQ2pELFdBQU8sSUFBSSx5QkFBeUIsY0FBYyxPQUFPLFNBQVMsR0FBRyxXQUFXLFdBQVcsTUFBTTtBQUFBLEVBQ2xHO0FBQUEsRUFFTywrQkFBZ0U7QUFDdEUsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFlBQVksS0FBSyxjQUFjO0FBQ3JDLFFBQUksQ0FBQyxXQUFXO0FBQ2YsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLFFBQVEsY0FBYztBQUNqRCxXQUFPLElBQUkseUJBQXlCLGNBQWMsTUFBTSxHQUFHLGNBQWMsU0FBUyxDQUFDLEVBQUUsT0FBTyxTQUFTLEdBQUcsV0FBVyxXQUFXLE1BQU07QUFBQSxFQUNySTtBQUFBLEVBRVEsZ0JBQWtDO0FBQ3pDLFFBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLGNBQWM7QUFDdEIsWUFBTSxTQUFTLEtBQUs7QUFDcEIsV0FBSyxlQUFlO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyxlQUFlLHFCQUFxQjtBQUV6QyxVQUFNLGdCQUFnQixLQUFLLFFBQVEsY0FBYztBQUNqRCxVQUFNLHFCQUFxQixjQUFjLGNBQWMsU0FBUyxDQUFDO0FBQ2pFLFVBQU0sWUFBWSxLQUFLLFFBQVEsU0FBUyxFQUFFLGNBQWMsS0FBSyxZQUFZLG1CQUFtQixlQUFlLEdBQUcsT0FBTyxLQUFLLFdBQVcsS0FBSyxZQUFZLEtBQUssUUFBUSxVQUFVLGFBQWEsY0FBYyxJQUFJLE1BQU0sS0FBSztBQUV2TixRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxJQUFJLFVBQVUsVUFBVSxNQUFNLGlCQUFpQixVQUFVLE1BQU0sYUFBYSxVQUFVLE1BQU0sZUFBZSxVQUFVLE1BQU0sU0FBUztBQUFBLEVBQzVJO0FBQUEsRUFFTyxrQ0FBbUU7QUFDekUsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLGtCQUFrQjtBQUM3QyxRQUFJLENBQUMsZUFBZTtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxjQUFjO0FBQ2pELFdBQU8sSUFBSSx5QkFBeUIsY0FBYyxPQUFPLGFBQWEsR0FBRyxlQUFlLFdBQVcsTUFBTTtBQUFBLEVBQzFHO0FBQUEsRUFFTyxtQ0FBb0U7QUFDMUUsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLGtCQUFrQjtBQUM3QyxRQUFJLENBQUMsZUFBZTtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxjQUFjO0FBQ2pELFdBQU8sSUFBSSx5QkFBeUIsY0FBYyxNQUFNLEdBQUcsY0FBYyxTQUFTLENBQUMsRUFBRSxPQUFPLGFBQWEsR0FBRyxlQUFlLFdBQVcsTUFBTTtBQUFBLEVBQzdJO0FBQUEsRUFFUSxvQkFBc0M7QUFDN0MsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssY0FBYztBQUN0QixZQUFNLFNBQVMsS0FBSztBQUNwQixXQUFLLGVBQWU7QUFDcEIsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLGVBQWUscUJBQXFCO0FBRXpDLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxjQUFjO0FBQ2pELFVBQU0scUJBQXFCLGNBQWMsY0FBYyxTQUFTLENBQUM7QUFDakUsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLFNBQVMsRUFBRSxrQkFBa0IsS0FBSyxZQUFZLG1CQUFtQixpQkFBaUIsR0FBRyxPQUFPLEtBQUssV0FBVyxLQUFLLFlBQVksS0FBSyxRQUFRLFVBQVUsYUFBYSxjQUFjLElBQUksTUFBTSxLQUFLO0FBRWpPLFFBQUksQ0FBQyxlQUFlO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxJQUFJLFVBQVUsY0FBYyxNQUFNLGlCQUFpQixjQUFjLE1BQU0sYUFBYSxjQUFjLE1BQU0sZUFBZSxjQUFjLE1BQU0sU0FBUztBQUFBLEVBQzVKO0FBQUEsRUFFTyxVQUFVLGFBQTBDO0FBQzFELFFBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzdCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxTQUFLLGVBQWUscUJBQXFCO0FBRXpDLFVBQU0sY0FBYyxLQUFLLFFBQVEsU0FBUztBQUMxQyxRQUFJLGFBQWE7QUFDaEIsYUFBTyxZQUFZLFlBQVksS0FBSyxZQUFZLGFBQWEsT0FBTyxLQUFLLFdBQVcsS0FBSyxZQUFZLEtBQUssUUFBUSxVQUFVLGFBQWEsY0FBYyxJQUFJLE1BQU0sT0FBTyxVQUFVLHNCQUFzQjtBQUFBLElBQ3pNO0FBQ0EsV0FBTyxZQUFZLFlBQVksS0FBSyxZQUFZLE1BQU0sT0FBTyxLQUFLLFdBQVcsS0FBSyxZQUFZLEtBQUssUUFBUSxVQUFVLGFBQWEsY0FBYyxJQUFJLE1BQU0sT0FBTyxVQUFVLHNCQUFzQjtBQUFBLEVBQ2xNO0FBQ0Q7QUFFTyxNQUFNLGtDQUFOLE1BQU0sd0NBQXVDLFdBQTBDO0FBQUEsRUFhN0YsWUFBWSxRQUFxQjtBQUNoQyxVQUFNO0FBUFAsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBUXRFLFNBQUssVUFBVTtBQUNmLFNBQUsseUJBQXlCO0FBQzlCLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFUQSxPQUFjLElBQUksUUFBNEQ7QUFDN0UsV0FBTyxPQUFPLGdCQUFnRCxnQ0FBK0IsRUFBRTtBQUFBLEVBQ2hHO0FBQUEsRUFTZ0IsVUFBZ0I7QUFDL0IsU0FBSyxZQUFZO0FBQ2pCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVRLHNCQUFzQixnQkFBNEM7QUFDekUsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUVuQixZQUFNLFVBQVUsbUJBQW1CLE9BQU8sS0FBSyxTQUFTLGNBQWM7QUFDdEUsVUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFdBQVc7QUFFaEIsWUFBTSxXQUFpQyxFQUFFLGNBQWMsS0FBSyxTQUFTLFdBQVc7QUFDaEYsVUFBSSxLQUFLLFNBQVMsa0NBQWtDO0FBQ25ELGlCQUFTLG9CQUFvQixtQkFBbUI7QUFDaEQsaUJBQVMsb0JBQW9CLG1CQUFtQjtBQUNoRCxpQkFBUyxrQkFBa0IsbUJBQW1CO0FBQUEsTUFDL0M7QUFDQSxxQkFBZSxTQUFTLEVBQUUsT0FBTyxVQUFVLEtBQUs7QUFFaEQsV0FBSyxnQkFBZ0IsSUFBSSxLQUFLLFFBQVEsMkJBQTJCLENBQUMsTUFBTTtBQUN2RSxZQUFJLEtBQUssd0JBQXdCO0FBQ2hDO0FBQUEsUUFDRDtBQUNBLGFBQUssWUFBWTtBQUFBLE1BQ2xCLENBQUMsQ0FBQztBQUNGLFdBQUssZ0JBQWdCLElBQUksS0FBSyxRQUFRLG9CQUFvQixNQUFNO0FBQy9ELGFBQUssWUFBWTtBQUFBLE1BQ2xCLENBQUMsQ0FBQztBQUNGLFdBQUssZ0JBQWdCLElBQUksZUFBZSxTQUFTLEVBQUUseUJBQXlCLENBQUMsTUFBTTtBQUNsRixZQUFJLEVBQUUsYUFBYSxFQUFFLFdBQVc7QUFDL0IsZUFBSyxZQUFZO0FBQUEsUUFDbEI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFvQjtBQUMzQixTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFFBQUksS0FBSyxZQUFZLEtBQUssU0FBUyxrQ0FBa0M7QUFDcEUsWUFBTSxXQUFpQztBQUFBLFFBQ3RDLG1CQUFtQixtQkFBbUI7QUFBQSxRQUN0QyxtQkFBbUIsbUJBQW1CO0FBQUEsUUFDdEMsaUJBQWlCLG1CQUFtQjtBQUFBLE1BQ3JDO0FBQ0EsV0FBSyxTQUFTLGVBQWUsU0FBUyxFQUFFLE9BQU8sVUFBVSxLQUFLO0FBQUEsSUFDL0Q7QUFDQSxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRVEsZUFBZSxZQUErQjtBQUNyRCxTQUFLLHlCQUF5QjtBQUM5QixTQUFLLFFBQVEsY0FBYyxVQUFVO0FBQ3JDLFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVRLG1CQUFtQixPQUFtQixXQUFpQztBQUM5RSxRQUFJLENBQUMsVUFBVSxRQUFRLEdBQUc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE9BQU8sS0FBSyxRQUFRLDRCQUE0QixVQUFVLGlCQUFpQixDQUFDO0FBQ2xGLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLElBQUksVUFBVSxVQUFVLGlCQUFpQixLQUFLLGFBQWEsVUFBVSxpQkFBaUIsS0FBSyxTQUFTO0FBQUEsRUFDNUc7QUFBQSxFQUVRLG9CQUFvQixRQUErQztBQUMxRSxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxPQUFPLFVBQVU7QUFDckMsUUFBSSxPQUFPLGFBQWE7QUFDdkIsV0FBSyxRQUFRLHFDQUFxQyxPQUFPLGFBQWEsT0FBTyxnQkFBZ0I7QUFBQSxJQUM5RjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFdBQVcsZ0JBQWlFO0FBQ2xGLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLDRCQUE0QixnQkFBNEM7QUFDOUUsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUVuQixZQUFNLGdCQUFnQixLQUFLLFFBQVEsY0FBYztBQUNqRCxVQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLGNBQU0sWUFBWSxlQUFlLFNBQVM7QUFDMUMsY0FBTSxZQUFZLFVBQVU7QUFDNUIsY0FBTSw0QkFBNEIsMkJBQTJCLEtBQUssUUFBUSxTQUFTLEdBQUcsZUFBZSxTQUFTO0FBQzlHLFlBQUksQ0FBQywyQkFBMkI7QUFDL0IsZ0JBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxnQkFBTSxzQkFBbUMsQ0FBQztBQUMxQyxtQkFBUyxJQUFJLEdBQUcsTUFBTSxjQUFjLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDekQsZ0NBQW9CLENBQUMsSUFBSSxLQUFLLG1CQUFtQixPQUFPLGNBQWMsQ0FBQyxDQUFDO0FBQUEsVUFDekU7QUFDQSxlQUFLLFFBQVEsY0FBYyxtQkFBbUI7QUFDOUM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLHNCQUFzQixjQUFjO0FBQ3pDLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssb0JBQW9CLEtBQUssU0FBUyw0QkFBNEIsQ0FBQztBQUFBLElBQ3JFO0FBQUEsRUFDRDtBQUFBLEVBRU8sZ0NBQWdDLGdCQUE0QztBQUNsRixTQUFLLHNCQUFzQixjQUFjO0FBQ3pDLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssb0JBQW9CLEtBQUssU0FBUyxnQ0FBZ0MsQ0FBQztBQUFBLElBQ3pFO0FBQUEsRUFDRDtBQUFBLEVBRU8sNkJBQTZCLGdCQUE0QztBQUMvRSxTQUFLLHNCQUFzQixjQUFjO0FBQ3pDLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssb0JBQW9CLEtBQUssU0FBUyw2QkFBNkIsQ0FBQztBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUFBLEVBRU8saUNBQWlDLGdCQUE0QztBQUNuRixTQUFLLHNCQUFzQixjQUFjO0FBQ3pDLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssb0JBQW9CLEtBQUssU0FBUyxpQ0FBaUMsQ0FBQztBQUFBLElBQzFFO0FBQUEsRUFDRDtBQUFBLEVBRU8sVUFBVSxnQkFBNEM7QUFDNUQsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxVQUE4QjtBQUVsQyxVQUFNLFlBQVksZUFBZSxTQUFTO0FBTzFDLFFBQUksVUFBVSxjQUFjLFVBQVUsYUFBYSxTQUFTLEtBQUssVUFBVSxTQUFTO0FBQ25GLFlBQU0sY0FBYyxLQUFLLFFBQVEsU0FBUztBQUMxQyxVQUFJLFVBQVUsYUFBYTtBQUMxQixrQkFBVSxZQUFZLFlBQVksVUFBVSxjQUFjLFVBQVUsYUFBYSxVQUFVLFNBQVMsVUFBVSxXQUFXLFVBQVUsWUFBWSxLQUFLLFFBQVEsVUFBVSxhQUFhLGNBQWMsSUFBSSxNQUFNLE9BQU8sVUFBVSxzQkFBc0I7QUFBQSxNQUNuUCxPQUFPO0FBQ04sa0JBQVUsWUFBWSxZQUFZLFVBQVUsY0FBYyxNQUFNLFVBQVUsU0FBUyxVQUFVLFdBQVcsVUFBVSxZQUFZLEtBQUssUUFBUSxVQUFVLGFBQWEsY0FBYyxJQUFJLE1BQU0sT0FBTyxVQUFVLHNCQUFzQjtBQUFBLE1BQ2xPO0FBQUEsSUFDRCxPQUFPO0FBRU4sV0FBSyxzQkFBc0IsY0FBYztBQUN6QyxVQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CO0FBQUEsTUFDRDtBQUVBLGdCQUFVLEtBQUssU0FBUyxVQUFVLFVBQVUsV0FBVztBQUFBLElBQ3hEO0FBRUEsUUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixZQUFNLGtCQUFrQixLQUFLLFFBQVEsYUFBYTtBQUVsRCxlQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxjQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ3ZCLGNBQU0sZUFBZSxNQUFNLE1BQU0sZ0JBQWdCLGVBQWU7QUFDaEUsWUFBSSxjQUFjO0FBRWpCLGtCQUFRLENBQUMsSUFBSSxRQUFRLENBQUM7QUFDdEIsa0JBQVEsQ0FBQyxJQUFJO0FBQ2I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFdBQUssZUFBZSxRQUFRLElBQUksT0FBSyxJQUFJLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sZUFBZSxFQUFFLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxJQUM1STtBQUFBLEVBQ0Q7QUFBQSxFQUVPLHlCQUF5QixZQUErQjtBQUM5RCxRQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLFdBQUssZUFBZSxVQUFVO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQ0Q7QUEvTWEsZ0NBRVcsS0FBSztBQUZ0QixJQUFNLGlDQUFOO0FBaU5BLE1BQWUsNkNBQTZDLGFBQWE7QUFBQSxFQUV4RSxJQUFJLFVBQTRCLFFBQTJCO0FBQ2pFLFVBQU0sd0JBQXdCLCtCQUErQixJQUFJLE1BQU07QUFDdkUsUUFBSSxDQUFDLHVCQUF1QjtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksT0FBTyxjQUFjO0FBQ3ZDLFFBQUksV0FBVztBQUNkLFlBQU0sc0JBQXNCLFVBQVUsZ0JBQWdCO0FBQ3RELFlBQU0saUJBQWlCLHFCQUFxQixJQUFJLE1BQU07QUFDdEQsVUFBSSxnQkFBZ0I7QUFDbkIsYUFBSyxLQUFLLHVCQUF1QixjQUFjO0FBQUEsTUFDaEQsT0FBTztBQUNOLGNBQU0sb0JBQW9CLFNBQVMsSUFBSSxxQkFBcUIsRUFBRSxlQUFlLHNCQUFzQixNQUFNO0FBQ3pHLGFBQUssS0FBSyx1QkFBdUIsaUJBQWlCO0FBQ2xELDBCQUFrQixRQUFRO0FBQUEsTUFDM0I7QUFFQSwyQkFBcUIscUJBQXFCLFVBQVUsZ0JBQWdCLENBQUM7QUFBQSxJQUN0RTtBQUFBLEVBQ0Q7QUFHRDtBQUVPLE1BQU0sMENBQTBDLHFDQUFxQztBQUFBLEVBQzNGLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSwrQkFBK0Isa0NBQWtDO0FBQUEsTUFDdEYsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDbEMsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsUUFBUSxPQUFPO0FBQUEsUUFDZixPQUFPO0FBQUEsUUFDUCxPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssaUNBQWlDLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLHVCQUF1QjtBQUFBLFFBQ3pILE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ1UsS0FBSyx1QkFBdUQsZ0JBQTRDO0FBQ2pILDBCQUFzQiw0QkFBNEIsY0FBYztBQUFBLEVBQ2pFO0FBQ0Q7QUFFTyxNQUFNLDhDQUE4QyxxQ0FBcUM7QUFBQSxFQUMvRixjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsbUNBQW1DLHNDQUFzQztBQUFBLE1BQzlGLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxRQUNULFFBQVEsT0FBTztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLHFDQUFxQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRywyQkFBMkI7QUFBQSxRQUNqSSxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNVLEtBQUssdUJBQXVELGdCQUE0QztBQUNqSCwwQkFBc0IsZ0NBQWdDLGNBQWM7QUFBQSxFQUNyRTtBQUNEO0FBRU8sTUFBTSwyQ0FBMkMscUNBQXFDO0FBQUEsRUFDNUYsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLGdDQUFnQyx3Q0FBd0M7QUFBQSxNQUM3RixjQUFjO0FBQUEsTUFDZCxRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLE9BQU8sVUFBVSxRQUFRLElBQUk7QUFBQSxRQUM5RSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ1UsS0FBSyx1QkFBdUQsZ0JBQTRDO0FBQ2pILDBCQUFzQiw2QkFBNkIsY0FBYztBQUFBLEVBQ2xFO0FBQ0Q7QUFFTyxNQUFNLCtDQUErQyxxQ0FBcUM7QUFBQSxFQUNoRyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsb0NBQW9DLDRDQUE0QztBQUFBLE1BQ3JHLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDVSxLQUFLLHVCQUF1RCxnQkFBNEM7QUFDakgsMEJBQXNCLGlDQUFpQyxjQUFjO0FBQUEsRUFDdEU7QUFDRDtBQUVPLE1BQU0sK0JBQStCLHFDQUFxQztBQUFBLEVBQ2hGLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSxtQ0FBbUMsc0NBQXNDO0FBQUEsTUFDOUYsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULFFBQVEsT0FBTztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLHNCQUFzQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRywwQkFBMEI7QUFBQSxRQUNqSCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNVLEtBQUssdUJBQXVELGdCQUE0QztBQUNqSCwwQkFBc0IsVUFBVSxjQUFjO0FBQUEsRUFDL0M7QUFDRDtBQUVPLE1BQU0sd0JBQXdCLHFDQUFxQztBQUFBLEVBQ3pFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSxtQkFBbUIsd0JBQXdCO0FBQUEsTUFDaEUsY0FBYyxlQUFlLElBQUksa0JBQWtCLFVBQVUsa0JBQWtCLGVBQWU7QUFBQSxNQUM5RixRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxRQUNsQyxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxRQUNoQixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNVLEtBQUssdUJBQXVELGdCQUE0QztBQUNqSCwwQkFBc0IsVUFBVSxjQUFjO0FBQUEsRUFDL0M7QUFDRDtBQUVBLE1BQU0sMEJBQTBCO0FBQUEsRUFJL0IsWUFDa0IsUUFDQSxhQUNBLFlBQ0EsaUJBQ2pCLFdBQ0M7QUFMZ0I7QUFDQTtBQUNBO0FBQ0E7QUFObEIsU0FBUSxxQkFBcUM7QUFTNUMsU0FBSyxrQkFBa0IsS0FBSyxPQUFPLGFBQWE7QUFDaEQsUUFBSSxhQUNBLEtBQUssV0FBVyxVQUFVLFVBQzFCLEtBQUssZ0JBQWdCLFVBQVUsZUFDL0IsS0FBSyxlQUFlLFVBQVUsY0FDOUIsS0FBSyxvQkFBb0IsVUFBVSxtQkFDbkMsS0FBSyxvQkFBb0IsVUFBVSxpQkFDckM7QUFDRCxXQUFLLHFCQUFxQixVQUFVO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFFTyxjQUF1QjtBQUM3QixRQUFJLEtBQUssdUJBQXVCLE1BQU07QUFDckMsV0FBSyxxQkFBcUIsS0FBSyxPQUFPLFlBQVksS0FBSyxhQUFhLE1BQU0sT0FBTyxLQUFLLFlBQVksS0FBSyxpQkFBaUIsS0FBSyxFQUFFLElBQUksT0FBSyxFQUFFLEtBQUs7QUFDL0ksV0FBSyxtQkFBbUIsS0FBSyxNQUFNLHdCQUF3QjtBQUFBLElBQzVEO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBRU8sSUFBTSx1QkFBTixjQUFtQyxXQUEwQztBQUFBLEVBV25GLFlBQ0MsUUFDMkMsMEJBQzFDO0FBQ0QsVUFBTTtBQUZxQztBQUczQyxTQUFLLFNBQVM7QUFDZCxTQUFLLGFBQWEsT0FBTyxVQUFVLGFBQWEsa0JBQWtCO0FBQ2xFLFNBQUssc0JBQXNCLE9BQU8sVUFBVSxhQUFhLDJCQUEyQjtBQUNwRixTQUFLLGFBQWEsT0FBTyxVQUFVLGFBQWEsMkJBQTJCO0FBQzNFLFNBQUssZUFBZSxPQUFPLDRCQUE0QjtBQUN2RCxTQUFLLGFBQWEsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyxRQUFRLEdBQUcsR0FBRyxDQUFDO0FBQ2hGLFNBQUssUUFBUTtBQUViLFNBQUssVUFBVSxPQUFPLHlCQUF5QixDQUFDLE1BQU07QUFDckQsV0FBSyxhQUFhLE9BQU8sVUFBVSxhQUFhLGtCQUFrQjtBQUNsRSxXQUFLLHNCQUFzQixPQUFPLFVBQVUsYUFBYSwyQkFBMkI7QUFDcEYsV0FBSyxhQUFhLE9BQU8sVUFBVSxhQUFhLDJCQUEyQjtBQUFBLElBQzVFLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxPQUFPLDJCQUEyQixDQUFDLE1BQW9DO0FBRXJGLFVBQUksQ0FBQyxLQUFLLFlBQVk7QUFHckI7QUFBQSxNQUNEO0FBRUEsVUFBSSxFQUFFLFVBQVUsUUFBUSxHQUFHO0FBQzFCLFlBQUksRUFBRSxXQUFXLG1CQUFtQixVQUFVO0FBQzdDLGNBQUksS0FBSyxPQUFPO0FBRWYsaUJBQUssVUFBVSxJQUFJO0FBQUEsVUFDcEI7QUFDQSxlQUFLLFdBQVcsU0FBUztBQUFBLFFBQzFCLE9BQU87QUFDTixlQUFLLFVBQVUsSUFBSTtBQUFBLFFBQ3BCO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxRQUFRO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE9BQU8saUJBQWlCLENBQUMsTUFBTTtBQUM3QyxXQUFLLFVBQVUsSUFBSTtBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxPQUFPLHdCQUF3QixDQUFDLE1BQU07QUFDcEQsVUFBSSxLQUFLLFlBQVk7QUFDcEIsYUFBSyxXQUFXLFNBQVM7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxpQkFBaUIscUJBQXFCLElBQUksTUFBTTtBQUN0RCxRQUFJLGdCQUFnQjtBQUNuQixXQUFLLFVBQVUsZUFBZSxTQUFTLEVBQUUseUJBQXlCLENBQUMsTUFBTTtBQUN4RSxhQUFLLFFBQVE7QUFBQSxNQUNkLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxTQUFLLFdBQVcsU0FBUztBQUFBLEVBQzFCO0FBQUEsRUFFUSxVQUFnQjtBQUN2QixTQUFLLFVBQVUscUJBQXFCLGFBQWEsS0FBSyxPQUFPLEtBQUssWUFBWSxLQUFLLHFCQUFxQixLQUFLLFlBQVksS0FBSyxNQUFNLENBQUM7QUFBQSxFQUN0STtBQUFBLEVBRUEsT0FBZSxhQUFhLFVBQTRDLFdBQW9CLG9CQUE2QixXQUFtQixRQUF1RDtBQUNsTSxRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QixZQUFNLElBQUksT0FBTyxhQUFhO0FBQzlCLFVBQUksRUFBRSxvQkFBb0IsRUFBRSxlQUFlO0FBRTFDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFVBQU0sd0JBQXdCLCtCQUErQixJQUFJLE1BQU07QUFDdkUsUUFBSSxDQUFDLHVCQUF1QjtBQUMzQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0saUJBQWlCLHFCQUFxQixJQUFJLE1BQU07QUFDdEQsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksSUFBSSxzQkFBc0IsV0FBVyxjQUFjO0FBQ3ZELFFBQUksQ0FBQyxHQUFHO0FBQ1AsWUFBTSxnQkFBZ0IsT0FBTyxjQUFjO0FBQzNDLFVBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0IsY0FBTUEsYUFBWSxlQUFlLFNBQVM7QUFDMUMsY0FBTSxZQUFZQSxXQUFVO0FBQzVCLGNBQU0sNEJBQTRCLDJCQUEyQixPQUFPLFNBQVMsR0FBRyxlQUFlLFNBQVM7QUFDeEcsWUFBSSxDQUFDLDJCQUEyQjtBQUMvQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsVUFBSSxtQkFBbUIsT0FBTyxRQUFRLGNBQWM7QUFBQSxJQUNyRDtBQUNBLFFBQUksQ0FBQyxHQUFHO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEVBQUUsY0FBYztBQUduQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksV0FBVyxLQUFLLEVBQUUsVUFBVSxHQUFHO0FBRWxDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxZQUFZLEtBQUssRUFBRSxXQUFXLFNBQVMsV0FBVztBQUVyRCxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sWUFBWSxlQUFlLFNBQVM7QUFDMUMsVUFBTSxnQkFBZ0IsVUFBVTtBQUdoQyxRQUFJLFVBQVUsWUFBWTtBQUN6QixVQUFJLHdCQUF3QixVQUFVO0FBQ3RDLFVBQUksQ0FBQyxlQUFlO0FBQ25CLGdDQUF3QixzQkFBc0IsWUFBWTtBQUFBLE1BQzNEO0FBRUEsVUFBSSxpQkFBaUIsRUFBRTtBQUN2QixVQUFJLENBQUMsZUFBZTtBQUNuQix5QkFBaUIsZUFBZSxZQUFZO0FBQUEsTUFDN0M7QUFFQSxVQUFJLDBCQUEwQixrQkFBa0IsRUFBRSxjQUFjLFVBQVUsYUFBYSxFQUFFLGNBQWMsVUFBVSxhQUFhLENBQUMsVUFBVSxTQUFTO0FBQ2pKLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSwwQkFBMEIsT0FBTyxTQUFTLEdBQUcsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLFlBQVksT0FBTyxVQUFVLGFBQWEsY0FBYyxJQUFJLE1BQU0sUUFBUTtBQUFBLEVBQ2hLO0FBQUEsRUFFUSxVQUFVLFVBQWtEO0FBQ25FLFNBQUssUUFBUTtBQUViLFFBQUksQ0FBQyxLQUFLLE9BQU87QUFDaEIsV0FBSyxhQUFhLE1BQU07QUFDeEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssT0FBTyxTQUFTLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssT0FBTyxTQUFTO0FBQ25DLFFBQUksTUFBTSwwQkFBMEIsR0FBRztBQUV0QztBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsS0FBSyxNQUFNLFlBQVk7QUFFMUMsVUFBTSxhQUFhLEtBQUssT0FBTyxjQUFjO0FBQzdDLGVBQVcsS0FBSyxNQUFNLHdCQUF3QjtBQUc5QyxVQUFNLFVBQW1CLENBQUM7QUFDMUIsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLE1BQU0sV0FBVyxRQUFRLE9BQU8sV0FBVyxRQUFRLElBQUksT0FBTTtBQUNuRixZQUFNLFFBQVEsV0FBVyxDQUFDO0FBRTFCLFVBQUksS0FBSyxNQUFNO0FBRWQsZ0JBQVEsS0FBSyxLQUFLO0FBQ2xCO0FBQUEsTUFDRCxPQUFPO0FBQ04sY0FBTSxNQUFNLE1BQU0seUJBQXlCLE9BQU8sV0FBVyxDQUFDLENBQUM7QUFDL0QsWUFBSSxNQUFNLEdBQUc7QUFFWixjQUFJLFdBQVcsQ0FBQyxFQUFFLFFBQVEsS0FBSyxDQUFDLE1BQU0sZ0JBQWdCLE9BQU8sV0FBVyxDQUFDLENBQUMsR0FBRztBQUM1RSxvQkFBUSxLQUFLLEtBQUs7QUFBQSxVQUNuQjtBQUNBO0FBQUEsUUFDRCxXQUFXLE1BQU0sR0FBRztBQUVuQjtBQUFBLFFBQ0QsT0FBTztBQUVOO0FBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLHlCQUFrQyxLQUFLLE9BQU8sVUFBVSxhQUFhLG9CQUFvQixNQUFNO0FBQ3JHLFVBQU0sd0JBQXdCLEtBQUsseUJBQXlCLDBCQUEwQixJQUFJLEtBQUssS0FBSztBQUNwRyxVQUFNLGNBQWMsUUFBUSxJQUFJLE9BQUs7QUFDcEMsYUFBTztBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsU0FBUyx1Q0FBdUMscUJBQXFCO0FBQUEsTUFDdEU7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGFBQWEsSUFBSSxXQUFXO0FBQUEsRUFDbEM7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixTQUFLLFVBQVUsSUFBSTtBQUNuQixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUF6TmEscUJBQ1csS0FBSztBQURoQix1QkFBTjtBQUFBLEVBYUo7QUFBQSxHQWJVO0FBMk5iLFNBQVMsMkJBQTJCLE9BQW1CLFFBQWlCLFdBQTZCO0FBQ3BHLFFBQU0sZUFBZSxnQkFBZ0IsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVM7QUFDakUsV0FBUyxJQUFJLEdBQUcsTUFBTSxPQUFPLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbEQsVUFBTSxRQUFRLE9BQU8sQ0FBQztBQUN0QixRQUFJLE1BQU0sUUFBUSxHQUFHO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxtQkFBbUIsZ0JBQWdCLE9BQU8sT0FBTyxDQUFDLFNBQVM7QUFDakUsUUFBSSxpQkFBaUIsa0JBQWtCO0FBQ3RDLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsZ0JBQWdCLE9BQW1CLE9BQWMsYUFBOEI7QUFDdkYsUUFBTSxPQUFPLE1BQU0sZ0JBQWdCLEtBQUs7QUFDeEMsU0FBUSxjQUFjLEtBQUssWUFBWSxJQUFJO0FBQzVDO0FBTU8sTUFBTSx3QkFBd0IsYUFBYTtBQUFBLEVBQ2pELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSwrQkFBK0IsbUJBQW1CO0FBQUEsTUFDdkUsVUFBVTtBQUFBLFFBQ1QsYUFBYSxJQUFJLFNBQVMsMkNBQTJDLHlCQUF5QjtBQUFBLFFBQzlGLE1BQU0sQ0FBQztBQUFBLE1BQ1I7QUFBQSxNQUNBLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxJQUFJLFVBQTRCLFFBQXFCLE1BQTZCO0FBQ3hGLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksT0FBTyxjQUFjO0FBRXZDLFFBQUksVUFBVSxhQUFhLFVBQVU7QUFDcEM7QUFBQSxJQUNEO0FBRUEsY0FBVSxNQUFNLGlCQUFpQjtBQUNqQyxVQUFNLHNCQUFzQixNQUFNLEtBQUssVUFBVSxnQkFBZ0IsQ0FBQztBQUNsRSxVQUFNLGNBQWMsb0JBQW9CLE1BQU07QUFDOUMsUUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxJQUNEO0FBQ0Esd0JBQW9CLEtBQUssV0FBVztBQUVwQyxjQUFVLGdCQUFnQixLQUFLLFFBQVEsbUJBQW1CLFVBQVUsbUJBQW1CO0FBQ3ZGLGNBQVUsb0JBQW9CLEtBQUssUUFBUSxJQUFJO0FBQy9DLHlCQUFxQixxQkFBcUIsVUFBVSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3RFO0FBQ0Q7QUFFTyxNQUFNLDRCQUE0QixhQUFhO0FBQUEsRUFDckQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLG1DQUFtQyx1QkFBdUI7QUFBQSxNQUMvRSxVQUFVO0FBQUEsUUFDVCxhQUFhLElBQUksU0FBUywrQ0FBK0MsNkJBQTZCO0FBQUEsUUFDdEcsTUFBTSxDQUFDO0FBQUEsTUFDUjtBQUFBLE1BQ0EsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBcUIsTUFBNkI7QUFDeEYsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxPQUFPLGNBQWM7QUFFdkMsUUFBSSxVQUFVLGFBQWEsVUFBVTtBQUNwQztBQUFBLElBQ0Q7QUFFQSxjQUFVLE1BQU0saUJBQWlCO0FBQ2pDLFVBQU0sc0JBQXNCLE1BQU0sS0FBSyxVQUFVLGdCQUFnQixDQUFDO0FBQ2xFLFVBQU0sY0FBYyxvQkFBb0IsSUFBSTtBQUM1QyxRQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLElBQ0Q7QUFDQSx3QkFBb0IsUUFBUSxXQUFXO0FBRXZDLGNBQVUsZ0JBQWdCLEtBQUssUUFBUSxtQkFBbUIsVUFBVSxtQkFBbUI7QUFDdkYsY0FBVSxvQkFBb0IsS0FBSyxRQUFRLElBQUk7QUFDL0MseUJBQXFCLHFCQUFxQixVQUFVLGdCQUFnQixDQUFDO0FBQUEsRUFDdEU7QUFDRDtBQUVBLDJCQUEyQiwrQkFBK0IsSUFBSSxnQ0FBZ0MsZ0NBQWdDLElBQUk7QUFDbEksMkJBQTJCLHFCQUFxQixJQUFJLHNCQUFzQixnQ0FBZ0MsZ0JBQWdCO0FBRTFILHFCQUFxQixpQkFBaUI7QUFDdEMscUJBQXFCLGlCQUFpQjtBQUN0QyxxQkFBcUIsbUNBQW1DO0FBQ3hELHFCQUFxQixpQ0FBaUM7QUFDdEQscUJBQXFCLHFDQUFxQztBQUMxRCxxQkFBcUIsa0NBQWtDO0FBQ3ZELHFCQUFxQixzQ0FBc0M7QUFDM0QscUJBQXFCLHNCQUFzQjtBQUMzQyxxQkFBcUIsZUFBZTtBQUNwQyxxQkFBcUIsK0JBQStCO0FBQ3BELHFCQUFxQiwrQkFBK0I7QUFDcEQscUJBQXFCLGVBQWU7QUFDcEMscUJBQXFCLG1CQUFtQjsiLAogICJuYW1lcyI6IFsiZmluZFN0YXRlIl0KfQo=
