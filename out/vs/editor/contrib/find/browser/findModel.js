import { findFirstIdxMonotonousOrArrLen } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, TimeoutTimer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { Constants } from "../../../../base/common/uint.js";
import { ReplaceCommand, ReplaceCommandThatPreservesSelection } from "../../../common/commands/replaceCommand.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { SearchParams } from "../../../common/model/textModelSearch.js";
import { FindDecorations } from "./findDecorations.js";
import { ReplaceAllCommand } from "./replaceAllCommand.js";
import { parseReplaceString, ReplacePattern } from "./replacePattern.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
const CONTEXT_FIND_WIDGET_VISIBLE = new RawContextKey("findWidgetVisible", false);
const CONTEXT_FIND_WIDGET_NOT_VISIBLE = CONTEXT_FIND_WIDGET_VISIBLE.toNegated();
const CONTEXT_FIND_INPUT_FOCUSED = new RawContextKey("findInputFocussed", false);
const CONTEXT_REPLACE_INPUT_FOCUSED = new RawContextKey("replaceInputFocussed", false);
const CONTEXT_FIND_WIDGET_FOCUSED = new RawContextKey("findWidgetFocused", false);
const ToggleCaseSensitiveKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyC,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC }
};
const ToggleWholeWordKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyW,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW }
};
const ToggleRegexKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyR,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR }
};
const ToggleSearchScopeKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyL,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL }
};
const TogglePreserveCaseKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyP,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP }
};
const FIND_IDS = {
  StartFindAction: "actions.find",
  StartFindWithSelection: "actions.findWithSelection",
  StartFindWithArgs: "editor.actions.findWithArgs",
  NextMatchFindAction: "editor.action.nextMatchFindAction",
  PreviousMatchFindAction: "editor.action.previousMatchFindAction",
  GoToMatchFindAction: "editor.action.goToMatchFindAction",
  NextSelectionMatchFindAction: "editor.action.nextSelectionMatchFindAction",
  PreviousSelectionMatchFindAction: "editor.action.previousSelectionMatchFindAction",
  StartFindReplaceAction: "editor.action.startFindReplaceAction",
  CloseFindWidgetCommand: "closeFindWidget",
  ToggleCaseSensitiveCommand: "toggleFindCaseSensitive",
  ToggleWholeWordCommand: "toggleFindWholeWord",
  ToggleRegexCommand: "toggleFindRegex",
  ToggleSearchScopeCommand: "toggleFindInSelection",
  TogglePreserveCaseCommand: "togglePreserveCase",
  ReplaceOneAction: "editor.action.replaceOne",
  ReplaceAllAction: "editor.action.replaceAll",
  SelectAllMatchesAction: "editor.action.selectAllMatches"
};
const MATCHES_LIMIT = 19999;
const RESEARCH_DELAY = 240;
class FindModelBoundToEditorModel {
  constructor(editor, state) {
    this._toDispose = new DisposableStore();
    this._editor = editor;
    this._state = state;
    this._isDisposed = false;
    this._startSearchingTimer = new TimeoutTimer();
    this._decorations = new FindDecorations(editor);
    this._toDispose.add(this._decorations);
    this._updateDecorationsScheduler = new RunOnceScheduler(() => {
      if (!this._editor.hasModel()) {
        return;
      }
      return this.research(false);
    }, 100);
    this._toDispose.add(this._updateDecorationsScheduler);
    this._toDispose.add(this._editor.onDidChangeCursorPosition((e) => {
      if (e.reason === CursorChangeReason.Explicit || e.reason === CursorChangeReason.Undo || e.reason === CursorChangeReason.Redo) {
        this._decorations.setStartPosition(this._editor.getPosition());
      }
    }));
    this._ignoreModelContentChanged = false;
    this._toDispose.add(this._editor.onDidChangeModelContent((e) => {
      if (this._ignoreModelContentChanged) {
        return;
      }
      if (e.isFlush) {
        this._decorations.reset();
      }
      this._decorations.setStartPosition(this._editor.getPosition());
      this._updateDecorationsScheduler.schedule();
    }));
    this._toDispose.add(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this.research(false, this._state.searchScope);
  }
  dispose() {
    this._isDisposed = true;
    dispose(this._startSearchingTimer);
    this._toDispose.dispose();
  }
  _onStateChanged(e) {
    if (this._isDisposed) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    if (e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope) {
      const model = this._editor.getModel();
      if (model.isTooLargeForSyncing()) {
        this._startSearchingTimer.cancel();
        this._startSearchingTimer.setIfNotSet(() => {
          if (e.searchScope) {
            this.research(e.moveCursor, this._state.searchScope);
          } else {
            this.research(e.moveCursor);
          }
        }, RESEARCH_DELAY);
      } else {
        if (e.searchScope) {
          this.research(e.moveCursor, this._state.searchScope);
        } else {
          this.research(e.moveCursor);
        }
      }
    }
  }
  static _getSearchRange(model, findScope) {
    if (findScope) {
      return findScope;
    }
    return model.getFullModelRange();
  }
  research(moveCursor, newFindScope) {
    let findScopes = null;
    if (typeof newFindScope !== "undefined") {
      if (newFindScope !== null) {
        if (!Array.isArray(newFindScope)) {
          findScopes = [newFindScope];
        } else {
          findScopes = newFindScope;
        }
      }
    } else {
      findScopes = this._decorations.getFindScopes();
    }
    if (findScopes !== null) {
      findScopes = findScopes.map((findScope) => {
        if (findScope.startLineNumber !== findScope.endLineNumber) {
          let endLineNumber = findScope.endLineNumber;
          if (findScope.endColumn === 1) {
            endLineNumber = endLineNumber - 1;
          }
          return new Range(findScope.startLineNumber, 1, endLineNumber, this._editor.getModel().getLineMaxColumn(endLineNumber));
        }
        return findScope;
      });
    }
    const findMatches = this._findMatches(findScopes, false, MATCHES_LIMIT);
    this._decorations.set(findMatches, findScopes);
    const editorSelection = this._editor.getSelection();
    let currentMatchesPosition = this._decorations.getCurrentMatchesPosition(editorSelection);
    if (currentMatchesPosition === 0 && findMatches.length > 0) {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.range), (range) => Range.compareRangesUsingStarts(range, editorSelection) >= 0);
      currentMatchesPosition = matchAfterSelection > 0 ? matchAfterSelection - 1 + 1 : currentMatchesPosition;
    }
    this._state.changeMatchInfo(
      currentMatchesPosition,
      this._decorations.getCount(),
      void 0
    );
    if (moveCursor && this._editor.getOption(EditorOption.find).cursorMoveOnType) {
      this._moveToNextMatch(this._decorations.getStartPosition());
    }
  }
  _hasMatches() {
    return this._state.matchesCount > 0;
  }
  _cannotFind() {
    if (!this._hasMatches()) {
      const findScope = this._decorations.getFindScope();
      if (findScope) {
        this._editor.revealRangeInCenterIfOutsideViewport(findScope, ScrollType.Smooth);
      }
      return true;
    }
    return false;
  }
  _setCurrentFindMatch(match) {
    const matchesPosition = this._decorations.setCurrentFindMatch(match);
    this._state.changeMatchInfo(
      matchesPosition,
      this._decorations.getCount(),
      match
    );
    this._editor.setSelection(match);
    this._editor.revealRangeInCenterIfOutsideViewport(match, ScrollType.Smooth);
  }
  _prevSearchPosition(before) {
    const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf("^") >= 0 || this._state.searchString.indexOf("$") >= 0);
    let { lineNumber, column } = before;
    const model = this._editor.getModel();
    if (isUsingLineStops || column === 1) {
      if (lineNumber === 1) {
        lineNumber = model.getLineCount();
      } else {
        lineNumber--;
      }
      column = model.getLineMaxColumn(lineNumber);
    } else {
      column--;
    }
    return new Position(lineNumber, column);
  }
  _moveToPrevMatch(before, isRecursed = false) {
    if (!this._state.canNavigateBack()) {
      const nextMatchRange = this._decorations.matchAfterPosition(before);
      if (nextMatchRange) {
        this._setCurrentFindMatch(nextMatchRange);
      }
      return;
    }
    if (this._decorations.getCount() < MATCHES_LIMIT) {
      let prevMatchRange = this._decorations.matchBeforePosition(before);
      if (prevMatchRange && prevMatchRange.isEmpty() && prevMatchRange.getStartPosition().equals(before)) {
        before = this._prevSearchPosition(before);
        prevMatchRange = this._decorations.matchBeforePosition(before);
      }
      if (prevMatchRange) {
        this._setCurrentFindMatch(prevMatchRange);
      }
      return;
    }
    if (this._cannotFind()) {
      return;
    }
    const findScope = this._decorations.getFindScope();
    const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
    if (searchRange.getEndPosition().isBefore(before)) {
      before = searchRange.getEndPosition();
    }
    if (before.isBefore(searchRange.getStartPosition())) {
      before = searchRange.getEndPosition();
    }
    const { lineNumber, column } = before;
    const model = this._editor.getModel();
    let position = new Position(lineNumber, column);
    let prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (prevMatch && prevMatch.range.isEmpty() && prevMatch.range.getStartPosition().equals(position)) {
      position = this._prevSearchPosition(position);
      prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    }
    if (!prevMatch) {
      return;
    }
    if (!isRecursed && !searchRange.containsRange(prevMatch.range)) {
      return this._moveToPrevMatch(prevMatch.range.getStartPosition(), true);
    }
    this._setCurrentFindMatch(prevMatch.range);
  }
  moveToPrevMatch() {
    this._moveToPrevMatch(this._editor.getSelection().getStartPosition());
  }
  _nextSearchPosition(after) {
    const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf("^") >= 0 || this._state.searchString.indexOf("$") >= 0);
    let { lineNumber, column } = after;
    const model = this._editor.getModel();
    if (isUsingLineStops || column === model.getLineMaxColumn(lineNumber)) {
      if (lineNumber === model.getLineCount()) {
        lineNumber = 1;
      } else {
        lineNumber++;
      }
      column = 1;
    } else {
      column++;
    }
    return new Position(lineNumber, column);
  }
  _moveToNextMatch(after) {
    if (!this._state.canNavigateForward()) {
      const prevMatchRange = this._decorations.matchBeforePosition(after);
      if (prevMatchRange) {
        this._setCurrentFindMatch(prevMatchRange);
      }
      return;
    }
    if (this._decorations.getCount() < MATCHES_LIMIT) {
      let nextMatchRange = this._decorations.matchAfterPosition(after);
      if (nextMatchRange && nextMatchRange.isEmpty() && nextMatchRange.getStartPosition().equals(after)) {
        after = this._nextSearchPosition(after);
        nextMatchRange = this._decorations.matchAfterPosition(after);
      }
      if (nextMatchRange) {
        this._setCurrentFindMatch(nextMatchRange);
      }
      return;
    }
    const nextMatch = this._getNextMatch(after, false, true);
    if (nextMatch) {
      this._setCurrentFindMatch(nextMatch.range);
    }
  }
  _getNextMatch(after, captureMatches, forceMove, isRecursed = false) {
    if (this._cannotFind()) {
      return null;
    }
    const findScope = this._decorations.getFindScope();
    const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
    if (searchRange.getEndPosition().isBefore(after)) {
      after = searchRange.getStartPosition();
    }
    if (after.isBefore(searchRange.getStartPosition())) {
      after = searchRange.getStartPosition();
    }
    const { lineNumber, column } = after;
    const model = this._editor.getModel();
    let position = new Position(lineNumber, column);
    let nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches);
    if (forceMove && nextMatch && nextMatch.range.isEmpty() && nextMatch.range.getStartPosition().equals(position)) {
      position = this._nextSearchPosition(position);
      nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches);
    }
    if (!nextMatch) {
      return null;
    }
    if (!isRecursed && !searchRange.containsRange(nextMatch.range)) {
      return this._getNextMatch(nextMatch.range.getEndPosition(), captureMatches, forceMove, true);
    }
    return nextMatch;
  }
  moveToNextMatch() {
    this._moveToNextMatch(this._editor.getSelection().getEndPosition());
  }
  _moveToMatch(index) {
    const decorationRange = this._decorations.getDecorationRangeAt(index);
    if (decorationRange) {
      this._setCurrentFindMatch(decorationRange);
    }
  }
  moveToMatch(index) {
    this._moveToMatch(index);
  }
  _getReplacePattern() {
    if (this._state.isRegex) {
      return parseReplaceString(this._state.replaceString);
    }
    return ReplacePattern.fromStaticValue(this._state.replaceString);
  }
  replace() {
    if (!this._hasMatches()) {
      return;
    }
    const replacePattern = this._getReplacePattern();
    const selection = this._editor.getSelection();
    const nextMatch = this._getNextMatch(selection.getStartPosition(), true, false);
    if (nextMatch) {
      if (selection.equalsRange(nextMatch.range)) {
        const replaceString = replacePattern.buildReplaceString(nextMatch.matches, this._state.preserveCase);
        const command = new ReplaceCommand(selection, replaceString);
        this._executeEditorCommand("replace", command);
        this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
        this.research(true);
      } else {
        this._decorations.setStartPosition(this._editor.getPosition());
        this._setCurrentFindMatch(nextMatch.range);
      }
    }
  }
  _findMatches(findScopes, captureMatches, limitResultCount) {
    const searchRanges = (findScopes || [null]).map(
      (scope) => FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), scope)
    );
    return this._editor.getModel().findMatches(this._state.searchString, searchRanges, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches, limitResultCount);
  }
  replaceAll() {
    if (!this._hasMatches()) {
      return;
    }
    const findScopes = this._decorations.getFindScopes();
    if (findScopes === null && this._state.matchesCount >= MATCHES_LIMIT) {
      this._largeReplaceAll();
    } else {
      this._regularReplaceAll(findScopes);
    }
    this.research(false);
  }
  _largeReplaceAll() {
    const searchParams = new SearchParams(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null);
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return;
    }
    let searchRegex = searchData.regex;
    if (!searchRegex.multiline) {
      let mod = "mu";
      if (searchRegex.ignoreCase) {
        mod += "i";
      }
      if (searchRegex.global) {
        mod += "g";
      }
      searchRegex = new RegExp(searchRegex.source, mod);
    }
    const model = this._editor.getModel();
    const modelText = model.getValue(EndOfLinePreference.LF);
    const fullModelRange = model.getFullModelRange();
    const replacePattern = this._getReplacePattern();
    let resultText;
    const preserveCase = this._state.preserveCase;
    if (replacePattern.hasReplacementPatterns || preserveCase) {
      resultText = modelText.replace(searchRegex, function() {
        return replacePattern.buildReplaceString(arguments, preserveCase);
      });
    } else {
      resultText = modelText.replace(searchRegex, replacePattern.buildReplaceString(null, preserveCase));
    }
    const command = new ReplaceCommandThatPreservesSelection(fullModelRange, resultText, this._editor.getSelection());
    this._executeEditorCommand("replaceAll", command);
  }
  _regularReplaceAll(findScopes) {
    const replacePattern = this._getReplacePattern();
    const matches = this._findMatches(findScopes, replacePattern.hasReplacementPatterns || this._state.preserveCase, Constants.MAX_SAFE_SMALL_INTEGER);
    const replaceStrings = [];
    for (let i = 0, len = matches.length; i < len; i++) {
      replaceStrings[i] = replacePattern.buildReplaceString(matches[i].matches, this._state.preserveCase);
    }
    const command = new ReplaceAllCommand(this._editor.getSelection(), matches.map((m) => m.range), replaceStrings);
    this._executeEditorCommand("replaceAll", command);
  }
  selectAllMatches() {
    if (!this._hasMatches()) {
      return;
    }
    const findScopes = this._decorations.getFindScopes();
    const matches = this._findMatches(findScopes, false, Constants.MAX_SAFE_SMALL_INTEGER);
    let selections = matches.map((m) => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn));
    const editorSelection = this._editor.getSelection();
    for (let i = 0, len = selections.length; i < len; i++) {
      const sel = selections[i];
      if (sel.equalsRange(editorSelection)) {
        selections = [editorSelection].concat(selections.slice(0, i)).concat(selections.slice(i + 1));
        break;
      }
    }
    this._editor.setSelections(selections);
  }
  _executeEditorCommand(source, command) {
    try {
      this._ignoreModelContentChanged = true;
      this._editor.pushUndoStop();
      this._editor.executeCommand(source, command);
      this._editor.pushUndoStop();
    } finally {
      this._ignoreModelContentChanged = false;
    }
  }
}
export {
  CONTEXT_FIND_INPUT_FOCUSED,
  CONTEXT_FIND_WIDGET_FOCUSED,
  CONTEXT_FIND_WIDGET_NOT_VISIBLE,
  CONTEXT_FIND_WIDGET_VISIBLE,
  CONTEXT_REPLACE_INPUT_FOCUSED,
  FIND_IDS,
  FindModelBoundToEditorModel,
  MATCHES_LIMIT,
  ToggleCaseSensitiveKeybinding,
  TogglePreserveCaseKeybinding,
  ToggleRegexKeybinding,
  ToggleSearchScopeKeybinding,
  ToggleWholeWordKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXGJyb3dzZXJcXGZpbmRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUNvbW1hbmQsIFJlcGxhY2VDb21tYW5kVGhhdFByZXNlcnZlc1NlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21tYW5kcy9yZXBsYWNlQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uLCBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIEZpbmRNYXRjaCwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCB7IEZpbmREZWNvcmF0aW9ucyB9IGZyb20gJy4vZmluZERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUsIEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQgfSBmcm9tICcuL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlQWxsQ29tbWFuZCB9IGZyb20gJy4vcmVwbGFjZUFsbENvbW1hbmQuanMnO1xuaW1wb3J0IHsgcGFyc2VSZXBsYWNlU3RyaW5nLCBSZXBsYWNlUGF0dGVybiB9IGZyb20gJy4vcmVwbGFjZVBhdHRlcm4uanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5cbmV4cG9ydCBjb25zdCBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZmluZFdpZGdldFZpc2libGUnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9GSU5EX1dJREdFVF9OT1RfVklTSUJMRSA9IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRS50b05lZ2F0ZWQoKTtcbi8vIEtlZXAgQ29udGV4dEtleSB1c2Ugb2YgJ0ZvY3Vzc2VkJyB0byBub3QgYnJlYWsgd2hlbiBjbGF1c2VzXG5leHBvcnQgY29uc3QgQ09OVEVYVF9GSU5EX0lOUFVUX0ZPQ1VTRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZmluZElucHV0Rm9jdXNzZWQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9SRVBMQUNFX0lOUFVUX0ZPQ1VTRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncmVwbGFjZUlucHV0Rm9jdXNzZWQnLCBmYWxzZSk7XG4vKipcbiAqIENvbnRleHQga2V5IHRoYXQgaXMgdHJ1ZSB3aGVuIGFueSBlbGVtZW50IHdpdGhpbiB0aGUgRmluZCB3aWRnZXQgaGFzIGZvY3VzLlxuICogVGhpcyBpbmNsdWRlcyB0aGUgRmluZCBpbnB1dCwgUmVwbGFjZSBpbnB1dCwgY2hlY2tib3hlcywgYnV0dG9ucywgZXRjLlxuICovXG5leHBvcnQgY29uc3QgQ09OVEVYVF9GSU5EX1dJREdFVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2ZpbmRXaWRnZXRGb2N1c2VkJywgZmFsc2UpO1xuXG5leHBvcnQgY29uc3QgVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmc6IElLZXliaW5kaW5ncyA9IHtcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Qyxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5QyB9XG59O1xuZXhwb3J0IGNvbnN0IFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmc6IElLZXliaW5kaW5ncyA9IHtcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Vyxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5VyB9XG59O1xuZXhwb3J0IGNvbnN0IFRvZ2dsZVJlZ2V4S2V5YmluZGluZzogSUtleWJpbmRpbmdzID0ge1xuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlSLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlSIH1cbn07XG5leHBvcnQgY29uc3QgVG9nZ2xlU2VhcmNoU2NvcGVLZXliaW5kaW5nOiBJS2V5YmluZGluZ3MgPSB7XG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUwsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUwgfVxufTtcbmV4cG9ydCBjb25zdCBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nOiBJS2V5YmluZGluZ3MgPSB7XG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVAsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVAgfVxufTtcblxuZXhwb3J0IGNvbnN0IEZJTkRfSURTID0ge1xuXHRTdGFydEZpbmRBY3Rpb246ICdhY3Rpb25zLmZpbmQnLFxuXHRTdGFydEZpbmRXaXRoU2VsZWN0aW9uOiAnYWN0aW9ucy5maW5kV2l0aFNlbGVjdGlvbicsXG5cdFN0YXJ0RmluZFdpdGhBcmdzOiAnZWRpdG9yLmFjdGlvbnMuZmluZFdpdGhBcmdzJyxcblx0TmV4dE1hdGNoRmluZEFjdGlvbjogJ2VkaXRvci5hY3Rpb24ubmV4dE1hdGNoRmluZEFjdGlvbicsXG5cdFByZXZpb3VzTWF0Y2hGaW5kQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5wcmV2aW91c01hdGNoRmluZEFjdGlvbicsXG5cdEdvVG9NYXRjaEZpbmRBY3Rpb246ICdlZGl0b3IuYWN0aW9uLmdvVG9NYXRjaEZpbmRBY3Rpb24nLFxuXHROZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5uZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uJyxcblx0UHJldmlvdXNTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb246ICdlZGl0b3IuYWN0aW9uLnByZXZpb3VzU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uJyxcblx0U3RhcnRGaW5kUmVwbGFjZUFjdGlvbjogJ2VkaXRvci5hY3Rpb24uc3RhcnRGaW5kUmVwbGFjZUFjdGlvbicsXG5cdENsb3NlRmluZFdpZGdldENvbW1hbmQ6ICdjbG9zZUZpbmRXaWRnZXQnLFxuXHRUb2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZDogJ3RvZ2dsZUZpbmRDYXNlU2Vuc2l0aXZlJyxcblx0VG9nZ2xlV2hvbGVXb3JkQ29tbWFuZDogJ3RvZ2dsZUZpbmRXaG9sZVdvcmQnLFxuXHRUb2dnbGVSZWdleENvbW1hbmQ6ICd0b2dnbGVGaW5kUmVnZXgnLFxuXHRUb2dnbGVTZWFyY2hTY29wZUNvbW1hbmQ6ICd0b2dnbGVGaW5kSW5TZWxlY3Rpb24nLFxuXHRUb2dnbGVQcmVzZXJ2ZUNhc2VDb21tYW5kOiAndG9nZ2xlUHJlc2VydmVDYXNlJyxcblx0UmVwbGFjZU9uZUFjdGlvbjogJ2VkaXRvci5hY3Rpb24ucmVwbGFjZU9uZScsXG5cdFJlcGxhY2VBbGxBY3Rpb246ICdlZGl0b3IuYWN0aW9uLnJlcGxhY2VBbGwnLFxuXHRTZWxlY3RBbGxNYXRjaGVzQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5zZWxlY3RBbGxNYXRjaGVzJ1xufTtcblxuZXhwb3J0IGNvbnN0IE1BVENIRVNfTElNSVQgPSAxOTk5OTtcbmNvbnN0IFJFU0VBUkNIX0RFTEFZID0gMjQwO1xuXG5leHBvcnQgY2xhc3MgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogRmluZFJlcGxhY2VTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uczogRmluZERlY29yYXRpb25zO1xuXHRwcml2YXRlIF9pZ25vcmVNb2RlbENvbnRlbnRDaGFuZ2VkOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydFNlYXJjaGluZ1RpbWVyOiBUaW1lb3V0VGltZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlRGVjb3JhdGlvbnNTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgc3RhdGU6IEZpbmRSZXBsYWNlU3RhdGUpIHtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fc3RhcnRTZWFyY2hpbmdUaW1lciA9IG5ldyBUaW1lb3V0VGltZXIoKTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gbmV3IEZpbmREZWNvcmF0aW9ucyhlZGl0b3IpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZGVjb3JhdGlvbnMpO1xuXG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnNTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnJlc2VhcmNoKGZhbHNlKTtcblx0XHR9LCAxMDApO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fdXBkYXRlRGVjb3JhdGlvbnNTY2hlZHVsZXIpO1xuXG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZTogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXRcblx0XHRcdFx0fHwgZS5yZWFzb24gPT09IEN1cnNvckNoYW5nZVJlYXNvbi5VbmRvXG5cdFx0XHRcdHx8IGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uUmVkb1xuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnNldFN0YXJ0UG9zaXRpb24odGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2lnbm9yZU1vZGVsQ29udGVudENoYW5nZWQgPSBmYWxzZTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lnbm9yZU1vZGVsQ29udGVudENoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaXNGbHVzaCkge1xuXHRcdFx0XHQvLyBhIG1vZGVsLnNldFZhbHVlKCkgd2FzIGNhbGxlZFxuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0U3RhcnRQb3NpdGlvbih0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9uc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKChlKSA9PiB0aGlzLl9vblN0YXRlQ2hhbmdlZChlKSkpO1xuXG5cdFx0dGhpcy5yZXNlYXJjaChmYWxzZSwgdGhpcy5fc3RhdGUuc2VhcmNoU2NvcGUpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0ZGlzcG9zZSh0aGlzLl9zdGFydFNlYXJjaGluZ1RpbWVyKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25TdGF0ZUNoYW5nZWQoZTogRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHQvLyBUaGUgZmluZCBtb2RlbCBpcyBkaXNwb3NlZCBkdXJpbmcgYSBmaW5kIHN0YXRlIGNoYW5nZWQgZXZlbnRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gVGhlIGZpbmQgbW9kZWwgd2lsbCBiZSBkaXNwb3NlZCBtb21lbnRhcmlseVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5zZWFyY2hTdHJpbmcgfHwgZS5pc1JlcGxhY2VSZXZlYWxlZCB8fCBlLmlzUmVnZXggfHwgZS53aG9sZVdvcmQgfHwgZS5tYXRjaENhc2UgfHwgZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdFx0aWYgKG1vZGVsLmlzVG9vTGFyZ2VGb3JTeW5jaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRTZWFyY2hpbmdUaW1lci5jYW5jZWwoKTtcblxuXHRcdFx0XHR0aGlzLl9zdGFydFNlYXJjaGluZ1RpbWVyLnNldElmTm90U2V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXNlYXJjaChlLm1vdmVDdXJzb3IsIHRoaXMuX3N0YXRlLnNlYXJjaFNjb3BlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXNlYXJjaChlLm1vdmVDdXJzb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgUkVTRUFSQ0hfREVMQVkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdFx0XHR0aGlzLnJlc2VhcmNoKGUubW92ZUN1cnNvciwgdGhpcy5fc3RhdGUuc2VhcmNoU2NvcGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVzZWFyY2goZS5tb3ZlQ3Vyc29yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRTZWFyY2hSYW5nZShtb2RlbDogSVRleHRNb2RlbCwgZmluZFNjb3BlOiBSYW5nZSB8IG51bGwpOiBSYW5nZSB7XG5cdFx0Ly8gSWYgd2UgaGF2ZSBzZXQgbm93IG9yIGJlZm9yZSBhIGZpbmQgc2NvcGUsIHVzZSBpdCBmb3IgY29tcHV0aW5nIHRoZSBzZWFyY2ggcmFuZ2Vcblx0XHRpZiAoZmluZFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gZmluZFNjb3BlO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNlYXJjaChtb3ZlQ3Vyc29yOiBib29sZWFuLCBuZXdGaW5kU2NvcGU/OiBSYW5nZSB8IFJhbmdlW10gfCBudWxsKTogdm9pZCB7XG5cdFx0bGV0IGZpbmRTY29wZXM6IFJhbmdlW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAodHlwZW9mIG5ld0ZpbmRTY29wZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmIChuZXdGaW5kU2NvcGUgIT09IG51bGwpIHtcblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KG5ld0ZpbmRTY29wZSkpIHtcblx0XHRcdFx0XHRmaW5kU2NvcGVzID0gW25ld0ZpbmRTY29wZV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmluZFNjb3BlcyA9IG5ld0ZpbmRTY29wZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaW5kU2NvcGVzID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlcygpO1xuXHRcdH1cblx0XHRpZiAoZmluZFNjb3BlcyAhPT0gbnVsbCkge1xuXHRcdFx0ZmluZFNjb3BlcyA9IGZpbmRTY29wZXMubWFwKGZpbmRTY29wZSA9PiB7XG5cdFx0XHRcdGlmIChmaW5kU2NvcGUuc3RhcnRMaW5lTnVtYmVyICE9PSBmaW5kU2NvcGUuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gZmluZFNjb3BlLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdFx0XHRpZiAoZmluZFNjb3BlLmVuZENvbHVtbiA9PT0gMSkge1xuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBuZXcgUmFuZ2UoZmluZFNjb3BlLnN0YXJ0TGluZU51bWJlciwgMSwgZW5kTGluZU51bWJlciwgdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZpbmRTY29wZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRNYXRjaGVzID0gdGhpcy5fZmluZE1hdGNoZXMoZmluZFNjb3BlcywgZmFsc2UsIE1BVENIRVNfTElNSVQpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChmaW5kTWF0Y2hlcywgZmluZFNjb3Blcyk7XG5cblx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IGN1cnJlbnRNYXRjaGVzUG9zaXRpb24gPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXRDdXJyZW50TWF0Y2hlc1Bvc2l0aW9uKGVkaXRvclNlbGVjdGlvbik7XG5cdFx0aWYgKGN1cnJlbnRNYXRjaGVzUG9zaXRpb24gPT09IDAgJiYgZmluZE1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gY3VycmVudCBzZWxlY3Rpb24gaXMgbm90IG9uIHRvcCBvZiBhIG1hdGNoXG5cdFx0XHQvLyB0cnkgdG8gZmluZCBpdHMgbmVhcmVzdCByZXN1bHQgZnJvbSB0aGUgdG9wIG9mIHRoZSBkb2N1bWVudFxuXHRcdFx0Y29uc3QgbWF0Y2hBZnRlclNlbGVjdGlvbiA9IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihmaW5kTWF0Y2hlcy5tYXAobWF0Y2ggPT4gbWF0Y2gucmFuZ2UpLCByYW5nZSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMocmFuZ2UsIGVkaXRvclNlbGVjdGlvbikgPj0gMCk7XG5cdFx0XHRjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uID0gbWF0Y2hBZnRlclNlbGVjdGlvbiA+IDAgPyBtYXRjaEFmdGVyU2VsZWN0aW9uIC0gMSArIDEgLyoqIG1hdGNoIHBvc2l0aW9uIGlzIG9uZSBiYXNlZCAqLyA6IGN1cnJlbnRNYXRjaGVzUG9zaXRpb247XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlTWF0Y2hJbmZvKFxuXHRcdFx0Y3VycmVudE1hdGNoZXNQb3NpdGlvbixcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLmdldENvdW50KCksXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0aWYgKG1vdmVDdXJzb3IgJiYgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuY3Vyc29yTW92ZU9uVHlwZSkge1xuXHRcdFx0dGhpcy5fbW92ZVRvTmV4dE1hdGNoKHRoaXMuX2RlY29yYXRpb25zLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzTWF0Y2hlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3N0YXRlLm1hdGNoZXNDb3VudCA+IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2Fubm90RmluZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2hhc01hdGNoZXMoKSkge1xuXHRcdFx0Y29uc3QgZmluZFNjb3BlID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlKCk7XG5cdFx0XHRpZiAoZmluZFNjb3BlKSB7XG5cdFx0XHRcdC8vIFJldmVhbCB0aGUgc2VsZWN0aW9uIHNvIHVzZXIgaXMgcmVtaW5kZWQgdGhhdCAnc2VsZWN0aW9uIGZpbmQnIGlzIG9uLlxuXHRcdFx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGZpbmRTY29wZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEN1cnJlbnRGaW5kTWF0Y2gobWF0Y2g6IFJhbmdlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF0Y2hlc1Bvc2l0aW9uID0gdGhpcy5fZGVjb3JhdGlvbnMuc2V0Q3VycmVudEZpbmRNYXRjaChtYXRjaCk7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlTWF0Y2hJbmZvKFxuXHRcdFx0bWF0Y2hlc1Bvc2l0aW9uLFxuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuZ2V0Q291bnQoKSxcblx0XHRcdG1hdGNoXG5cdFx0KTtcblxuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb24obWF0Y2gpO1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobWF0Y2gsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXZTZWFyY2hQb3NpdGlvbihiZWZvcmU6IFBvc2l0aW9uKSB7XG5cdFx0Y29uc3QgaXNVc2luZ0xpbmVTdG9wcyA9IHRoaXMuX3N0YXRlLmlzUmVnZXggJiYgKFxuXHRcdFx0dGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLmluZGV4T2YoJ14nKSA+PSAwXG5cdFx0XHR8fCB0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcuaW5kZXhPZignJCcpID49IDBcblx0XHQpO1xuXHRcdGxldCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gYmVmb3JlO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAoaXNVc2luZ0xpbmVTdG9wcyB8fCBjb2x1bW4gPT09IDEpIHtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0XHRcdGxpbmVOdW1iZXIgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVOdW1iZXItLTtcblx0XHRcdH1cblx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbHVtbi0tO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgX21vdmVUb1ByZXZNYXRjaChiZWZvcmU6IFBvc2l0aW9uLCBpc1JlY3Vyc2VkOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmNhbk5hdmlnYXRlQmFjaygpKSB7XG5cdFx0XHQvLyB3ZSBhcmUgYmV5b25kIHRoZSBmaXJzdCBtYXRjaGVkIGZpbmQgcmVzdWx0XG5cdFx0XHQvLyBpbnN0ZWFkIG9mIGRvaW5nIG5vdGhpbmcsIHdlIHNob3VsZCByZWZvY3VzIHRoZSBmaXJzdCBpdGVtXG5cdFx0XHRjb25zdCBuZXh0TWF0Y2hSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zLm1hdGNoQWZ0ZXJQb3NpdGlvbihiZWZvcmUpO1xuXG5cdFx0XHRpZiAobmV4dE1hdGNoUmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChuZXh0TWF0Y2hSYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWNvcmF0aW9ucy5nZXRDb3VudCgpIDwgTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0bGV0IHByZXZNYXRjaFJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnMubWF0Y2hCZWZvcmVQb3NpdGlvbihiZWZvcmUpO1xuXG5cdFx0XHRpZiAocHJldk1hdGNoUmFuZ2UgJiYgcHJldk1hdGNoUmFuZ2UuaXNFbXB0eSgpICYmIHByZXZNYXRjaFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKS5lcXVhbHMoYmVmb3JlKSkge1xuXHRcdFx0XHRiZWZvcmUgPSB0aGlzLl9wcmV2U2VhcmNoUG9zaXRpb24oYmVmb3JlKTtcblx0XHRcdFx0cHJldk1hdGNoUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9ucy5tYXRjaEJlZm9yZVBvc2l0aW9uKGJlZm9yZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2TWF0Y2hSYW5nZSkge1xuXHRcdFx0XHR0aGlzLl9zZXRDdXJyZW50RmluZE1hdGNoKHByZXZNYXRjaFJhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jYW5ub3RGaW5kKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5kU2NvcGUgPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXRGaW5kU2NvcGUoKTtcblx0XHRjb25zdCBzZWFyY2hSYW5nZSA9IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbC5fZ2V0U2VhcmNoUmFuZ2UodGhpcy5fZWRpdG9yLmdldE1vZGVsKCksIGZpbmRTY29wZSk7XG5cblx0XHQvLyAuLi4oLS0tLSkuLi58Li4uXG5cdFx0aWYgKHNlYXJjaFJhbmdlLmdldEVuZFBvc2l0aW9uKCkuaXNCZWZvcmUoYmVmb3JlKSkge1xuXHRcdFx0YmVmb3JlID0gc2VhcmNoUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHR9XG5cblx0XHQvLyAuLi58Li4uKC0tLS0pLi4uXG5cdFx0aWYgKGJlZm9yZS5pc0JlZm9yZShzZWFyY2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRiZWZvcmUgPSBzZWFyY2hSYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbGluZU51bWJlciwgY29sdW1uIH0gPSBiZWZvcmU7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGxldCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXG5cdFx0bGV0IHByZXZNYXRjaCA9IG1vZGVsLmZpbmRQcmV2aW91c01hdGNoKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZywgcG9zaXRpb24sIHRoaXMuX3N0YXRlLmlzUmVnZXgsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSwgdGhpcy5fc3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgZmFsc2UpO1xuXG5cdFx0aWYgKHByZXZNYXRjaCAmJiBwcmV2TWF0Y2gucmFuZ2UuaXNFbXB0eSgpICYmIHByZXZNYXRjaC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuZXF1YWxzKHBvc2l0aW9uKSkge1xuXHRcdFx0Ly8gTG9va3MgbGlrZSB3ZSdyZSBzdHVjayBhdCB0aGlzIHBvc2l0aW9uLCB1bmFjY2VwdGFibGUhXG5cdFx0XHRwb3NpdGlvbiA9IHRoaXMuX3ByZXZTZWFyY2hQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRwcmV2TWF0Y2ggPSBtb2RlbC5maW5kUHJldmlvdXNNYXRjaCh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIHBvc2l0aW9uLCB0aGlzLl9zdGF0ZS5pc1JlZ2V4LCB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsIHRoaXMuX3N0YXRlLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRpZiAoIXByZXZNYXRjaCkge1xuXHRcdFx0Ly8gdGhlcmUgaXMgcHJlY2lzZWx5IG9uZSBtYXRjaCBhbmQgc2VsZWN0aW9uIGlzIG9uIHRvcCBvZiBpdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXNSZWN1cnNlZCAmJiAhc2VhcmNoUmFuZ2UuY29udGFpbnNSYW5nZShwcmV2TWF0Y2gucmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvUHJldk1hdGNoKHByZXZNYXRjaC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2gocHJldk1hdGNoLnJhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlVG9QcmV2TWF0Y2goKTogdm9pZCB7XG5cdFx0dGhpcy5fbW92ZVRvUHJldk1hdGNoKHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmV4dFNlYXJjaFBvc2l0aW9uKGFmdGVyOiBQb3NpdGlvbikge1xuXHRcdGNvbnN0IGlzVXNpbmdMaW5lU3RvcHMgPSB0aGlzLl9zdGF0ZS5pc1JlZ2V4ICYmIChcblx0XHRcdHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZy5pbmRleE9mKCdeJykgPj0gMFxuXHRcdFx0fHwgdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLmluZGV4T2YoJyQnKSA+PSAwXG5cdFx0KTtcblxuXHRcdGxldCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gYWZ0ZXI7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGlmIChpc1VzaW5nTGluZVN0b3BzIHx8IGNvbHVtbiA9PT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkge1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdGxpbmVOdW1iZXIgPSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0fVxuXHRcdFx0Y29sdW1uID0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29sdW1uKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZVRvTmV4dE1hdGNoKGFmdGVyOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCkpIHtcblx0XHRcdC8vIHdlIGFyZSBiZXlvbmQgdGhlIGxhc3QgbWF0Y2hlZCBmaW5kIHJlc3VsdFxuXHRcdFx0Ly8gaW5zdGVhZCBvZiBkb2luZyBub3RoaW5nLCB3ZSBzaG91bGQgcmVmb2N1cyB0aGUgbGFzdCBpdGVtXG5cdFx0XHRjb25zdCBwcmV2TWF0Y2hSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zLm1hdGNoQmVmb3JlUG9zaXRpb24oYWZ0ZXIpO1xuXG5cdFx0XHRpZiAocHJldk1hdGNoUmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChwcmV2TWF0Y2hSYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWNvcmF0aW9ucy5nZXRDb3VudCgpIDwgTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0bGV0IG5leHRNYXRjaFJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnMubWF0Y2hBZnRlclBvc2l0aW9uKGFmdGVyKTtcblxuXHRcdFx0aWYgKG5leHRNYXRjaFJhbmdlICYmIG5leHRNYXRjaFJhbmdlLmlzRW1wdHkoKSAmJiBuZXh0TWF0Y2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuZXF1YWxzKGFmdGVyKSkge1xuXHRcdFx0XHQvLyBMb29rcyBsaWtlIHdlJ3JlIHN0dWNrIGF0IHRoaXMgcG9zaXRpb24sIHVuYWNjZXB0YWJsZSFcblx0XHRcdFx0YWZ0ZXIgPSB0aGlzLl9uZXh0U2VhcmNoUG9zaXRpb24oYWZ0ZXIpO1xuXHRcdFx0XHRuZXh0TWF0Y2hSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zLm1hdGNoQWZ0ZXJQb3NpdGlvbihhZnRlcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dE1hdGNoUmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChuZXh0TWF0Y2hSYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0TWF0Y2ggPSB0aGlzLl9nZXROZXh0TWF0Y2goYWZ0ZXIsIGZhbHNlLCB0cnVlKTtcblx0XHRpZiAobmV4dE1hdGNoKSB7XG5cdFx0XHR0aGlzLl9zZXRDdXJyZW50RmluZE1hdGNoKG5leHRNYXRjaC5yYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TmV4dE1hdGNoKGFmdGVyOiBQb3NpdGlvbiwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGZvcmNlTW92ZTogYm9vbGVhbiwgaXNSZWN1cnNlZDogYm9vbGVhbiA9IGZhbHNlKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2Nhbm5vdEZpbmQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluZFNjb3BlID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlKCk7XG5cdFx0Y29uc3Qgc2VhcmNoUmFuZ2UgPSBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwuX2dldFNlYXJjaFJhbmdlKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLCBmaW5kU2NvcGUpO1xuXG5cdFx0Ly8gLi4uKC0tLS0pLi4ufC4uLlxuXHRcdGlmIChzZWFyY2hSYW5nZS5nZXRFbmRQb3NpdGlvbigpLmlzQmVmb3JlKGFmdGVyKSkge1xuXHRcdFx0YWZ0ZXIgPSBzZWFyY2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gLi4ufC4uLigtLS0tKS4uLlxuXHRcdGlmIChhZnRlci5pc0JlZm9yZShzZWFyY2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRhZnRlciA9IHNlYXJjaFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gYWZ0ZXI7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGxldCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXG5cdFx0bGV0IG5leHRNYXRjaCA9IG1vZGVsLmZpbmROZXh0TWF0Y2godGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLCBwb3NpdGlvbiwgdGhpcy5fc3RhdGUuaXNSZWdleCwgdGhpcy5fc3RhdGUubWF0Y2hDYXNlLCB0aGlzLl9zdGF0ZS53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBjYXB0dXJlTWF0Y2hlcyk7XG5cblx0XHRpZiAoZm9yY2VNb3ZlICYmIG5leHRNYXRjaCAmJiBuZXh0TWF0Y2gucmFuZ2UuaXNFbXB0eSgpICYmIG5leHRNYXRjaC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuZXF1YWxzKHBvc2l0aW9uKSkge1xuXHRcdFx0Ly8gTG9va3MgbGlrZSB3ZSdyZSBzdHVjayBhdCB0aGlzIHBvc2l0aW9uLCB1bmFjY2VwdGFibGUhXG5cdFx0XHRwb3NpdGlvbiA9IHRoaXMuX25leHRTZWFyY2hQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRuZXh0TWF0Y2ggPSBtb2RlbC5maW5kTmV4dE1hdGNoKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZywgcG9zaXRpb24sIHRoaXMuX3N0YXRlLmlzUmVnZXgsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSwgdGhpcy5fc3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdH1cblxuXHRcdGlmICghbmV4dE1hdGNoKSB7XG5cdFx0XHQvLyB0aGVyZSBpcyBwcmVjaXNlbHkgb25lIG1hdGNoIGFuZCBzZWxlY3Rpb24gaXMgb24gdG9wIG9mIGl0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIWlzUmVjdXJzZWQgJiYgIXNlYXJjaFJhbmdlLmNvbnRhaW5zUmFuZ2UobmV4dE1hdGNoLnJhbmdlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE5leHRNYXRjaChuZXh0TWF0Y2gucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgY2FwdHVyZU1hdGNoZXMsIGZvcmNlTW92ZSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5leHRNYXRjaDtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlVG9OZXh0TWF0Y2goKTogdm9pZCB7XG5cdFx0dGhpcy5fbW92ZVRvTmV4dE1hdGNoKHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKS5nZXRFbmRQb3NpdGlvbigpKTtcblx0fVxuXG5cdHByaXZhdGUgX21vdmVUb01hdGNoKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkZWNvcmF0aW9uUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXREZWNvcmF0aW9uUmFuZ2VBdChpbmRleCk7XG5cdFx0aWYgKGRlY29yYXRpb25SYW5nZSkge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChkZWNvcmF0aW9uUmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtb3ZlVG9NYXRjaChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbW92ZVRvTWF0Y2goaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVwbGFjZVBhdHRlcm4oKTogUmVwbGFjZVBhdHRlcm4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VSZXBsYWNlU3RyaW5nKHRoaXMuX3N0YXRlLnJlcGxhY2VTdHJpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gUmVwbGFjZVBhdHRlcm4uZnJvbVN0YXRpY1ZhbHVlKHRoaXMuX3N0YXRlLnJlcGxhY2VTdHJpbmcpO1xuXHR9XG5cblx0cHVibGljIHJlcGxhY2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNNYXRjaGVzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXBsYWNlUGF0dGVybiA9IHRoaXMuX2dldFJlcGxhY2VQYXR0ZXJuKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IG5leHRNYXRjaCA9IHRoaXMuX2dldE5leHRNYXRjaChzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLCB0cnVlLCBmYWxzZSk7XG5cdFx0aWYgKG5leHRNYXRjaCkge1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5lcXVhbHNSYW5nZShuZXh0TWF0Y2gucmFuZ2UpKSB7XG5cdFx0XHRcdC8vIHNlbGVjdGlvbiBzaXRzIG9uIGEgZmluZCBtYXRjaCA9PiByZXBsYWNlIGl0IVxuXHRcdFx0XHRjb25zdCByZXBsYWNlU3RyaW5nID0gcmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKG5leHRNYXRjaC5tYXRjaGVzLCB0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBuZXcgUmVwbGFjZUNvbW1hbmQoc2VsZWN0aW9uLCByZXBsYWNlU3RyaW5nKTtcblxuXHRcdFx0XHR0aGlzLl9leGVjdXRlRWRpdG9yQ29tbWFuZCgncmVwbGFjZScsIGNvbW1hbmQpO1xuXG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnNldFN0YXJ0UG9zaXRpb24obmV3IFBvc2l0aW9uKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5zdGFydENvbHVtbiArIHJlcGxhY2VTdHJpbmcubGVuZ3RoKSk7XG5cdFx0XHRcdHRoaXMucmVzZWFyY2godHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXRTdGFydFBvc2l0aW9uKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChuZXh0TWF0Y2gucmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNYXRjaGVzKGZpbmRTY29wZXM6IFJhbmdlW10gfCBudWxsLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbiwgbGltaXRSZXN1bHRDb3VudDogbnVtYmVyKTogRmluZE1hdGNoW10ge1xuXHRcdGNvbnN0IHNlYXJjaFJhbmdlcyA9IChmaW5kU2NvcGVzIGFzIFtdIHx8IFtudWxsXSkubWFwKChzY29wZTogUmFuZ2UgfCBudWxsKSA9PlxuXHRcdFx0RmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsLl9nZXRTZWFyY2hSYW5nZSh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSwgc2NvcGUpXG5cdFx0KTtcblxuXHRcdHJldHVybiB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5maW5kTWF0Y2hlcyh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIHNlYXJjaFJhbmdlcywgdGhpcy5fc3RhdGUuaXNSZWdleCwgdGhpcy5fc3RhdGUubWF0Y2hDYXNlLCB0aGlzLl9zdGF0ZS53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgcmVwbGFjZUFsbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc01hdGNoZXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRTY29wZXMgPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXRGaW5kU2NvcGVzKCk7XG5cblx0XHRpZiAoZmluZFNjb3BlcyA9PT0gbnVsbCAmJiB0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPj0gTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0Ly8gRG9pbmcgYSByZXBsYWNlIG9uIHRoZSBlbnRpcmUgZmlsZSB0aGF0IGlzIG92ZXIgJHtNQVRDSEVTX0xJTUlUfSBtYXRjaGVzXG5cdFx0XHR0aGlzLl9sYXJnZVJlcGxhY2VBbGwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVndWxhclJlcGxhY2VBbGwoZmluZFNjb3Blcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXNlYXJjaChmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXJnZVJlcGxhY2VBbGwoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcyh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIHRoaXMuX3N0YXRlLmlzUmVnZXgsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSwgdGhpcy5fc3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCk7XG5cdFx0Y29uc3Qgc2VhcmNoRGF0YSA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2VhcmNoUmVnZXggPSBzZWFyY2hEYXRhLnJlZ2V4O1xuXHRcdGlmICghc2VhcmNoUmVnZXgubXVsdGlsaW5lKSB7XG5cdFx0XHRsZXQgbW9kID0gJ211Jztcblx0XHRcdGlmIChzZWFyY2hSZWdleC5pZ25vcmVDYXNlKSB7XG5cdFx0XHRcdG1vZCArPSAnaSc7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VhcmNoUmVnZXguZ2xvYmFsKSB7XG5cdFx0XHRcdG1vZCArPSAnZyc7XG5cdFx0XHR9XG5cdFx0XHRzZWFyY2hSZWdleCA9IG5ldyBSZWdFeHAoc2VhcmNoUmVnZXguc291cmNlLCBtb2QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxUZXh0ID0gbW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRik7XG5cdFx0Y29uc3QgZnVsbE1vZGVsUmFuZ2UgPSBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZVBhdHRlcm4gPSB0aGlzLl9nZXRSZXBsYWNlUGF0dGVybigpO1xuXHRcdGxldCByZXN1bHRUZXh0OiBzdHJpbmc7XG5cdFx0Y29uc3QgcHJlc2VydmVDYXNlID0gdGhpcy5fc3RhdGUucHJlc2VydmVDYXNlO1xuXG5cdFx0aWYgKHJlcGxhY2VQYXR0ZXJuLmhhc1JlcGxhY2VtZW50UGF0dGVybnMgfHwgcHJlc2VydmVDYXNlKSB7XG5cdFx0XHRyZXN1bHRUZXh0ID0gbW9kZWxUZXh0LnJlcGxhY2Uoc2VhcmNoUmVnZXgsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHJldHVybiByZXBsYWNlUGF0dGVybi5idWlsZFJlcGxhY2VTdHJpbmcoPHN0cmluZ1tdPjxhbnk+YXJndW1lbnRzLCBwcmVzZXJ2ZUNhc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdFRleHQgPSBtb2RlbFRleHQucmVwbGFjZShzZWFyY2hSZWdleCwgcmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKG51bGwsIHByZXNlcnZlQ2FzZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBuZXcgUmVwbGFjZUNvbW1hbmRUaGF0UHJlc2VydmVzU2VsZWN0aW9uKGZ1bGxNb2RlbFJhbmdlLCByZXN1bHRUZXh0LCB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCkpO1xuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0b3JDb21tYW5kKCdyZXBsYWNlQWxsJywgY29tbWFuZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWd1bGFyUmVwbGFjZUFsbChmaW5kU2NvcGVzOiBSYW5nZVtdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcGxhY2VQYXR0ZXJuID0gdGhpcy5fZ2V0UmVwbGFjZVBhdHRlcm4oKTtcblx0XHQvLyBHZXQgYWxsIHRoZSByYW5nZXMgKGV2ZW4gbW9yZSB0aGFuIHRoZSBoaWdobGlnaHRlZCBvbmVzKVxuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLl9maW5kTWF0Y2hlcyhmaW5kU2NvcGVzLCByZXBsYWNlUGF0dGVybi5oYXNSZXBsYWNlbWVudFBhdHRlcm5zIHx8IHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZVN0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG1hdGNoZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlcGxhY2VTdHJpbmdzW2ldID0gcmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoZXNbaV0ubWF0Y2hlcywgdGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gbmV3IFJlcGxhY2VBbGxDb21tYW5kKHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKSwgbWF0Y2hlcy5tYXAobSA9PiBtLnJhbmdlKSwgcmVwbGFjZVN0cmluZ3MpO1xuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0b3JDb21tYW5kKCdyZXBsYWNlQWxsJywgY29tbWFuZCk7XG5cdH1cblxuXHRwdWJsaWMgc2VsZWN0QWxsTWF0Y2hlcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc01hdGNoZXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRTY29wZXMgPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXRGaW5kU2NvcGVzKCk7XG5cblx0XHQvLyBHZXQgYWxsIHRoZSByYW5nZXMgKGV2ZW4gbW9yZSB0aGFuIHRoZSBoaWdobGlnaHRlZCBvbmVzKVxuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLl9maW5kTWF0Y2hlcyhmaW5kU2NvcGVzLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHRcdGxldCBzZWxlY3Rpb25zID0gbWF0Y2hlcy5tYXAobSA9PiBuZXcgU2VsZWN0aW9uKG0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBtLnJhbmdlLnN0YXJ0Q29sdW1uLCBtLnJhbmdlLmVuZExpbmVOdW1iZXIsIG0ucmFuZ2UuZW5kQ29sdW1uKSk7XG5cblx0XHQvLyBJZiBvbmUgb2YgdGhlIHJhbmdlcyBpcyB0aGUgZWRpdG9yIHNlbGVjdGlvbiwgdGhlbiBtYWludGFpbiBpdCBhcyBwcmltYXJ5XG5cdFx0Y29uc3QgZWRpdG9yU2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWwgPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0aWYgKHNlbC5lcXVhbHNSYW5nZShlZGl0b3JTZWxlY3Rpb24pKSB7XG5cdFx0XHRcdHNlbGVjdGlvbnMgPSBbZWRpdG9yU2VsZWN0aW9uXS5jb25jYXQoc2VsZWN0aW9ucy5zbGljZSgwLCBpKSkuY29uY2F0KHNlbGVjdGlvbnMuc2xpY2UoaSArIDEpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlRWRpdG9yQ29tbWFuZChzb3VyY2U6IHN0cmluZywgY29tbWFuZDogSUNvbW1hbmQpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faWdub3JlTW9kZWxDb250ZW50Q2hhbmdlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUNvbW1hbmQoc291cmNlLCBjb21tYW5kKTtcblx0XHRcdHRoaXMuX2VkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlTW9kZWxDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxrQkFBa0Isb0JBQW9CO0FBQy9DLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxnQkFBZ0IsNENB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
