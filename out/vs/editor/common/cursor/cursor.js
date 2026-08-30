import { onUnexpectedError } from "../../../base/common/errors.js";
import * as strings from "../../../base/common/strings.js";
import { CursorCollection } from "./cursorCollection.js";
import { CursorState, EditOperationResult, EditOperationType } from "../cursorCommon.js";
import { CursorContext } from "./cursorContext.js";
import { DeleteOperations } from "./cursorDeleteOperations.js";
import { CursorChangeReason } from "../cursorEvents.js";
import { CompositionOutcome, TypeOperations } from "./cursorTypeOperations.js";
import { BaseTypeWithAutoClosingCommand } from "./cursorTypeEditOperations.js";
import { Range } from "../core/range.js";
import { Selection, SelectionDirection } from "../core/selection.js";
import * as editorCommon from "../editorCommon.js";
import { TrackedRangeStickiness } from "../model.js";
import { RawContentChangedType, ModelInjectedTextChangedEvent } from "../textModelEvents.js";
import { VerticalRevealType, ViewCursorStateChangedEvent, ViewRevealRangeRequestEvent } from "../viewEvents.js";
import { dispose, Disposable } from "../../../base/common/lifecycle.js";
import { CursorStateChangedEvent } from "../viewModelEventDispatcher.js";
import { EditSources } from "../textModelEditSource.js";
class CursorsController extends Disposable {
  constructor(model, viewModel, coordinatesConverter, cursorConfig) {
    super();
    this._model = model;
    this._knownModelVersionId = this._model.getVersionId();
    this._viewModel = viewModel;
    this._coordinatesConverter = coordinatesConverter;
    this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
    this._cursors = new CursorCollection(this.context);
    this._hasFocus = false;
    this._isHandling = false;
    this._compositionState = null;
    this._columnSelectData = null;
    this._autoClosedActions = [];
    this._prevEditOperationType = EditOperationType.Other;
  }
  dispose() {
    this._cursors.dispose();
    this._autoClosedActions = dispose(this._autoClosedActions);
    super.dispose();
  }
  updateConfiguration(cursorConfig) {
    this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
    this._cursors.updateContext(this.context);
  }
  onLineMappingChanged(eventsCollector) {
    if (this._knownModelVersionId !== this._model.getVersionId()) {
      return;
    }
    this.setStates(eventsCollector, "viewModel", CursorChangeReason.NotSet, this.getCursorStates());
  }
  setHasFocus(hasFocus) {
    this._hasFocus = hasFocus;
  }
  _validateAutoClosedActions() {
    if (this._autoClosedActions.length > 0) {
      const selections = this._cursors.getSelections();
      for (let i = 0; i < this._autoClosedActions.length; i++) {
        const autoClosedAction = this._autoClosedActions[i];
        if (!autoClosedAction.isValid(selections)) {
          autoClosedAction.dispose();
          this._autoClosedActions.splice(i, 1);
          i--;
        }
      }
    }
  }
  // ------ some getters/setters
  getPrimaryCursorState() {
    return this._cursors.getPrimaryCursor();
  }
  getLastAddedCursorIndex() {
    return this._cursors.getLastAddedCursorIndex();
  }
  getCursorStates() {
    return this._cursors.getAll();
  }
  setStates(eventsCollector, source, reason, states) {
    let reachedMaxCursorCount = false;
    const multiCursorLimit = this.context.cursorConfig.multiCursorLimit;
    if (states !== null && states.length > multiCursorLimit) {
      states = states.slice(0, multiCursorLimit);
      reachedMaxCursorCount = true;
    }
    const oldState = CursorModelState.from(this._model, this);
    this._cursors.setStates(states);
    this._cursors.normalize();
    this._columnSelectData = null;
    this._validateAutoClosedActions();
    return this._emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount);
  }
  setCursorColumnSelectData(columnSelectData) {
    this._columnSelectData = columnSelectData;
  }
  revealAll(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
    const viewPositions = this._cursors.getViewPositions();
    let revealViewRange = null;
    let revealViewSelections = null;
    if (viewPositions.length > 1) {
      revealViewSelections = this._cursors.getViewSelections();
    } else {
      revealViewRange = Range.fromPositions(viewPositions[0], viewPositions[0]);
    }
    eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, revealViewRange, revealViewSelections, verticalType, revealHorizontal, scrollType));
  }
  revealPrimary(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
    const primaryCursor = this._cursors.getPrimaryCursor();
    const revealViewSelections = [primaryCursor.viewState.selection];
    eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, null, revealViewSelections, verticalType, revealHorizontal, scrollType));
  }
  saveState() {
    const result = [];
    const selections = this._cursors.getSelections();
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      result.push({
        inSelectionMode: !selection.isEmpty(),
        selectionStart: {
          lineNumber: selection.selectionStartLineNumber,
          column: selection.selectionStartColumn
        },
        position: {
          lineNumber: selection.positionLineNumber,
          column: selection.positionColumn
        }
      });
    }
    return result;
  }
  restoreState(eventsCollector, states) {
    const desiredSelections = [];
    for (let i = 0, len = states.length; i < len; i++) {
      const state = states[i];
      let positionLineNumber = 1;
      let positionColumn = 1;
      if (state.position && state.position.lineNumber) {
        positionLineNumber = state.position.lineNumber;
      }
      if (state.position && state.position.column) {
        positionColumn = state.position.column;
      }
      let selectionStartLineNumber = positionLineNumber;
      let selectionStartColumn = positionColumn;
      if (state.selectionStart && state.selectionStart.lineNumber) {
        selectionStartLineNumber = state.selectionStart.lineNumber;
      }
      if (state.selectionStart && state.selectionStart.column) {
        selectionStartColumn = state.selectionStart.column;
      }
      desiredSelections.push({
        selectionStartLineNumber,
        selectionStartColumn,
        positionLineNumber,
        positionColumn
      });
    }
    this.setStates(eventsCollector, "restoreState", CursorChangeReason.NotSet, CursorState.fromModelSelections(desiredSelections));
    this.revealAll(eventsCollector, "restoreState", false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Immediate);
  }
  onModelContentChanged(eventsCollector, event) {
    if (event instanceof ModelInjectedTextChangedEvent) {
      if (this._isHandling) {
        return;
      }
      this._isHandling = true;
      try {
        this.setStates(eventsCollector, "modelChange", CursorChangeReason.NotSet, this.getCursorStates());
      } finally {
        this._isHandling = false;
      }
    } else {
      const e = event.rawContentChangedEvent;
      this._knownModelVersionId = e.versionId;
      if (this._isHandling) {
        return;
      }
      const hadFlushEvent = e.containsEvent(RawContentChangedType.Flush);
      this._prevEditOperationType = EditOperationType.Other;
      if (hadFlushEvent) {
        this._cursors.dispose();
        this._cursors = new CursorCollection(this.context);
        this._validateAutoClosedActions();
        this._emitStateChangedIfNecessary(eventsCollector, "model", CursorChangeReason.ContentFlush, null, false);
      } else {
        if (this._hasFocus && e.resultingSelection && e.resultingSelection.length > 0) {
          const cursorState = CursorState.fromModelSelections(e.resultingSelection);
          if (this.setStates(eventsCollector, "modelChange", e.isUndoing ? CursorChangeReason.Undo : e.isRedoing ? CursorChangeReason.Redo : CursorChangeReason.RecoverFromMarkers, cursorState)) {
            this.revealAll(eventsCollector, "modelChange", false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
          }
        } else {
          const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
          this.setStates(eventsCollector, "modelChange", CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
        }
      }
    }
  }
  getSelection() {
    return this._cursors.getPrimaryCursor().modelState.selection;
  }
  getTopMostViewPosition() {
    return this._cursors.getTopMostViewPosition();
  }
  getBottomMostViewPosition() {
    return this._cursors.getBottomMostViewPosition();
  }
  getCursorColumnSelectData() {
    if (this._columnSelectData) {
      return this._columnSelectData;
    }
    const primaryCursor = this._cursors.getPrimaryCursor();
    const viewSelectionStart = primaryCursor.viewState.selectionStart.getStartPosition();
    const viewPosition = primaryCursor.viewState.position;
    return {
      isReal: false,
      fromViewLineNumber: viewSelectionStart.lineNumber,
      fromViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewSelectionStart),
      toViewLineNumber: viewPosition.lineNumber,
      toViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewPosition)
    };
  }
  getSelections() {
    return this._cursors.getSelections();
  }
  getPosition() {
    return this._cursors.getPrimaryCursor().modelState.position;
  }
  setSelections(eventsCollector, source, selections, reason) {
    this.setStates(eventsCollector, source, reason, CursorState.fromModelSelections(selections));
  }
  getPrevEditOperationType() {
    return this._prevEditOperationType;
  }
  setPrevEditOperationType(type) {
    this._prevEditOperationType = type;
  }
  // ------ auxiliary handling logic
  _pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges) {
    const autoClosedCharactersDeltaDecorations = [];
    const autoClosedEnclosingDeltaDecorations = [];
    for (let i = 0, len = autoClosedCharactersRanges.length; i < len; i++) {
      autoClosedCharactersDeltaDecorations.push({
        range: autoClosedCharactersRanges[i],
        options: {
          description: "auto-closed-character",
          inlineClassName: "auto-closed-character",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
      autoClosedEnclosingDeltaDecorations.push({
        range: autoClosedEnclosingRanges[i],
        options: {
          description: "auto-closed-enclosing",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    }
    const autoClosedCharactersDecorations = this._model.deltaDecorations([], autoClosedCharactersDeltaDecorations);
    const autoClosedEnclosingDecorations = this._model.deltaDecorations([], autoClosedEnclosingDeltaDecorations);
    this._autoClosedActions.push(new AutoClosedAction(this._model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations));
  }
  _executeEditOperation(opResult, editReason) {
    if (!opResult) {
      return;
    }
    if (opResult.shouldPushStackElementBefore) {
      this._model.pushStackElement();
    }
    const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands, editReason);
    if (result) {
      this._interpretCommandResult(result);
      const autoClosedCharactersRanges = [];
      const autoClosedEnclosingRanges = [];
      for (let i = 0; i < opResult.commands.length; i++) {
        const command = opResult.commands[i];
        if (command instanceof BaseTypeWithAutoClosingCommand && command.enclosingRange && command.closeCharacterRange) {
          autoClosedCharactersRanges.push(command.closeCharacterRange);
          autoClosedEnclosingRanges.push(command.enclosingRange);
        }
      }
      if (autoClosedCharactersRanges.length > 0) {
        this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
      }
      this._prevEditOperationType = opResult.type;
    }
    if (opResult.shouldPushStackElementAfter) {
      this._model.pushStackElement();
    }
  }
  _interpretCommandResult(cursorState) {
    if (!cursorState || cursorState.length === 0) {
      cursorState = this._cursors.readSelectionFromMarkers();
    }
    this._columnSelectData = null;
    this._cursors.setSelections(cursorState);
    this._cursors.normalize();
  }
  // -----------------------------------------------------------------------------------------------------------
  // ----- emitting events
  _emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount) {
    const newState = CursorModelState.from(this._model, this);
    if (newState.equals(oldState)) {
      return false;
    }
    const selections = this._cursors.getSelections();
    const viewSelections = this._cursors.getViewSelections();
    eventsCollector.emitViewEvent(new ViewCursorStateChangedEvent(viewSelections, selections, reason));
    if (!oldState || oldState.cursorState.length !== newState.cursorState.length || newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))) {
      const oldSelections = oldState ? oldState.cursorState.map((s) => s.modelState.selection) : null;
      const oldModelVersionId = oldState ? oldState.modelVersionId : 0;
      eventsCollector.emitOutgoingEvent(new CursorStateChangedEvent(oldSelections, selections, oldModelVersionId, newState.modelVersionId, source || "keyboard", reason, reachedMaxCursorCount));
    }
    return true;
  }
  // -----------------------------------------------------------------------------------------------------------
  // ----- handlers beyond this point
  _findAutoClosingPairs(edits) {
    if (!edits.length) {
      return null;
    }
    const indices = [];
    for (let i = 0, len = edits.length; i < len; i++) {
      const edit = edits[i];
      if (!edit.text || edit.text.indexOf("\n") >= 0) {
        return null;
      }
      const m = edit.text.match(/([)\]}>'"`])([^)\]}>'"`]*)$/);
      if (!m) {
        return null;
      }
      const closeChar = m[1];
      const autoClosingPairsCandidates = this.context.cursorConfig.autoClosingPairs.autoClosingPairsCloseSingleChar.get(closeChar);
      if (!autoClosingPairsCandidates || autoClosingPairsCandidates.length !== 1) {
        return null;
      }
      const openChar = autoClosingPairsCandidates[0].open;
      const closeCharIndex = edit.text.length - m[2].length - 1;
      const openCharIndex = edit.text.lastIndexOf(openChar, closeCharIndex - 1);
      if (openCharIndex === -1) {
        return null;
      }
      indices.push([openCharIndex, closeCharIndex]);
    }
    return indices;
  }
  executeEdits(eventsCollector, source, edits, cursorStateComputer, reason) {
    let autoClosingIndices = null;
    if (source === "snippet") {
      autoClosingIndices = this._findAutoClosingPairs(edits);
    }
    if (autoClosingIndices) {
      edits[0]._isTracked = true;
    }
    const autoClosedCharactersRanges = [];
    const autoClosedEnclosingRanges = [];
    const selections = this._model.pushEditOperations(this.getSelections(), edits, (undoEdits) => {
      if (autoClosingIndices) {
        for (let i = 0, len = autoClosingIndices.length; i < len; i++) {
          const [openCharInnerIndex, closeCharInnerIndex] = autoClosingIndices[i];
          const undoEdit = undoEdits[i];
          const lineNumber = undoEdit.range.startLineNumber;
          const openCharIndex = undoEdit.range.startColumn - 1 + openCharInnerIndex;
          const closeCharIndex = undoEdit.range.startColumn - 1 + closeCharInnerIndex;
          autoClosedCharactersRanges.push(new Range(lineNumber, closeCharIndex + 1, lineNumber, closeCharIndex + 2));
          autoClosedEnclosingRanges.push(new Range(lineNumber, openCharIndex + 1, lineNumber, closeCharIndex + 2));
        }
      }
      const selections2 = cursorStateComputer(undoEdits);
      if (selections2) {
        this._isHandling = true;
      }
      return selections2;
    }, void 0, reason);
    if (selections) {
      this._isHandling = false;
      this.setSelections(eventsCollector, source, selections, CursorChangeReason.NotSet);
    }
    if (autoClosedCharactersRanges.length > 0) {
      this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
    }
  }
  _executeEdit(callback, eventsCollector, source, cursorChangeReason = CursorChangeReason.NotSet) {
    if (this.context.cursorConfig.readOnly) {
      return;
    }
    const oldState = CursorModelState.from(this._model, this);
    this._cursors.stopTrackingSelections();
    this._isHandling = true;
    try {
      this._cursors.ensureValidState();
      callback();
    } catch (err) {
      onUnexpectedError(err);
    }
    this._isHandling = false;
    this._cursors.startTrackingSelections();
    this._validateAutoClosedActions();
    if (this._emitStateChangedIfNecessary(eventsCollector, source, cursorChangeReason, oldState, false)) {
      this.revealAll(eventsCollector, source, false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
    }
  }
  getAutoClosedCharacters() {
    return AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
  }
  startComposition(eventsCollector) {
    this._compositionState = new CompositionState(this._model, this.getSelections());
  }
  endComposition(eventsCollector, source) {
    const reason = EditSources.cursor({ kind: "compositionEnd", detailedSource: source });
    const compositionOutcome = this._compositionState ? this._compositionState.deduceOutcome(this._model, this.getSelections()) : null;
    this._compositionState = null;
    this._executeEdit(() => {
      if (source === "keyboard") {
        this._executeEditOperation(TypeOperations.compositionEndWithInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, compositionOutcome, this.getSelections(), this.getAutoClosedCharacters()), reason);
      }
    }, eventsCollector, source);
  }
  type(eventsCollector, text, source) {
    const reason = EditSources.cursor({ kind: "type", detailedSource: source });
    this._executeEdit(() => {
      if (source === "keyboard") {
        const len = text.length;
        let offset = 0;
        while (offset < len) {
          const charLength = strings.nextCharLength(text, offset);
          const chr = text.substr(offset, charLength);
          this._executeEditOperation(TypeOperations.typeWithInterceptors(!!this._compositionState, this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), this.getAutoClosedCharacters(), chr), reason);
          offset += charLength;
        }
      } else {
        this._executeEditOperation(TypeOperations.typeWithoutInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text), reason);
      }
    }, eventsCollector, source);
  }
  compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source) {
    const reason = EditSources.cursor({ kind: "compositionType", detailedSource: source });
    if (text.length === 0 && replacePrevCharCnt === 0 && replaceNextCharCnt === 0) {
      if (positionDelta !== 0) {
        const newSelections = this.getSelections().map((selection) => {
          const position = selection.getPosition();
          return new Selection(position.lineNumber, position.column + positionDelta, position.lineNumber, position.column + positionDelta);
        });
        this.setSelections(eventsCollector, source, newSelections, CursorChangeReason.NotSet);
      }
      return;
    }
    this._executeEdit(() => {
      this._executeEditOperation(TypeOperations.compositionType(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text, replacePrevCharCnt, replaceNextCharCnt, positionDelta), reason);
    }, eventsCollector, source);
  }
  paste(eventsCollector, text, pasteOnNewLine, multicursorText, source) {
    const reason = EditSources.cursor({ kind: "paste", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(TypeOperations.paste(this.context.cursorConfig, this._model, this.getSelections(), text, pasteOnNewLine, multicursorText || []), reason);
    }, eventsCollector, source, CursorChangeReason.Paste);
  }
  cut(eventsCollector, source) {
    const reason = EditSources.cursor({ kind: "cut", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(DeleteOperations.cut(this.context.cursorConfig, this._model, this.getSelections()), reason);
    }, eventsCollector, source);
  }
  executeCommand(eventsCollector, command, source) {
    const reason = EditSources.cursor({ kind: "executeCommand", detailedSource: source });
    this._executeEdit(() => {
      this._cursors.killSecondaryCursors();
      this._executeEditOperation(new EditOperationResult(EditOperationType.Other, [command], {
        shouldPushStackElementBefore: false,
        shouldPushStackElementAfter: false
      }), reason);
    }, eventsCollector, source);
  }
  executeCommands(eventsCollector, commands, source) {
    const reason = EditSources.cursor({ kind: "executeCommands", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(new EditOperationResult(EditOperationType.Other, commands, {
        shouldPushStackElementBefore: false,
        shouldPushStackElementAfter: false
      }), reason);
    }, eventsCollector, source);
  }
}
class CursorModelState {
  constructor(modelVersionId, cursorState) {
    this.modelVersionId = modelVersionId;
    this.cursorState = cursorState;
  }
  static from(model, cursor) {
    return new CursorModelState(model.getVersionId(), cursor.getCursorStates());
  }
  equals(other) {
    if (!other) {
      return false;
    }
    if (this.modelVersionId !== other.modelVersionId) {
      return false;
    }
    if (this.cursorState.length !== other.cursorState.length) {
      return false;
    }
    for (let i = 0, len = this.cursorState.length; i < len; i++) {
      if (!this.cursorState[i].equals(other.cursorState[i])) {
        return false;
      }
    }
    return true;
  }
}
class AutoClosedAction {
  static getAllAutoClosedCharacters(autoClosedActions) {
    let autoClosedCharacters = [];
    for (const autoClosedAction of autoClosedActions) {
      autoClosedCharacters = autoClosedCharacters.concat(autoClosedAction.getAutoClosedCharactersRanges());
    }
    return autoClosedCharacters;
  }
  constructor(model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations) {
    this._model = model;
    this._autoClosedCharactersDecorations = autoClosedCharactersDecorations;
    this._autoClosedEnclosingDecorations = autoClosedEnclosingDecorations;
  }
  dispose() {
    this._autoClosedCharactersDecorations = this._model.deltaDecorations(this._autoClosedCharactersDecorations, []);
    this._autoClosedEnclosingDecorations = this._model.deltaDecorations(this._autoClosedEnclosingDecorations, []);
  }
  getAutoClosedCharactersRanges() {
    const result = [];
    for (let i = 0; i < this._autoClosedCharactersDecorations.length; i++) {
      const decorationRange = this._model.getDecorationRange(this._autoClosedCharactersDecorations[i]);
      if (decorationRange) {
        result.push(decorationRange);
      }
    }
    return result;
  }
  isValid(selections) {
    const enclosingRanges = [];
    for (let i = 0; i < this._autoClosedEnclosingDecorations.length; i++) {
      const decorationRange = this._model.getDecorationRange(this._autoClosedEnclosingDecorations[i]);
      if (decorationRange) {
        enclosingRanges.push(decorationRange);
        if (decorationRange.startLineNumber !== decorationRange.endLineNumber) {
          return false;
        }
      }
    }
    enclosingRanges.sort(Range.compareRangesUsingStarts);
    selections.sort(Range.compareRangesUsingStarts);
    for (let i = 0; i < selections.length; i++) {
      if (i >= enclosingRanges.length) {
        return false;
      }
      if (!enclosingRanges[i].strictContainsRange(selections[i])) {
        return false;
      }
    }
    return true;
  }
}
class CommandExecutor {
  static executeCommands(model, selectionsBefore, commands, editReason = EditSources.unknown({ name: "executeCommands" })) {
    const ctx = {
      model,
      selectionsBefore,
      trackedRanges: [],
      trackedRangesDirection: []
    };
    const result = this._innerExecuteCommands(ctx, commands, editReason);
    for (let i = 0, len = ctx.trackedRanges.length; i < len; i++) {
      ctx.model._setTrackedRange(ctx.trackedRanges[i], null, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
    }
    return result;
  }
  static _innerExecuteCommands(ctx, commands, editReason) {
    if (this._arrayIsEmpty(commands)) {
      return null;
    }
    const commandsData = this._getEditOperations(ctx, commands);
    if (commandsData.operations.length === 0) {
      return null;
    }
    const rawOperations = commandsData.operations;
    const loserCursorsMap = this._getLoserCursorMap(rawOperations);
    if (loserCursorsMap.hasOwnProperty("0")) {
      console.warn("Ignoring commands");
      return null;
    }
    const filteredOperations = [];
    for (let i = 0, len = rawOperations.length; i < len; i++) {
      if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
        filteredOperations.push(rawOperations[i]);
      }
    }
    if (commandsData.hadTrackedEditOperation && filteredOperations.length > 0) {
      filteredOperations[0]._isTracked = true;
    }
    let selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations) => {
      const groupedInverseEditOperations = [];
      for (let i = 0; i < ctx.selectionsBefore.length; i++) {
        groupedInverseEditOperations[i] = [];
      }
      for (const op of inverseEditOperations) {
        if (!op.identifier) {
          continue;
        }
        groupedInverseEditOperations[op.identifier.major].push(op);
      }
      const minorBasedSorter = (a, b) => {
        return a.identifier.minor - b.identifier.minor;
      };
      const cursorSelections = [];
      for (let i = 0; i < ctx.selectionsBefore.length; i++) {
        if (groupedInverseEditOperations[i].length > 0) {
          groupedInverseEditOperations[i].sort(minorBasedSorter);
          cursorSelections[i] = commands[i].computeCursorState(ctx.model, {
            getInverseEditOperations: () => {
              return groupedInverseEditOperations[i];
            },
            getTrackedSelection: (id) => {
              const idx = parseInt(id, 10);
              const range = ctx.model._getTrackedRange(ctx.trackedRanges[idx]);
              if (ctx.trackedRangesDirection[idx] === SelectionDirection.LTR) {
                return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
              }
              return new Selection(range.endLineNumber, range.endColumn, range.startLineNumber, range.startColumn);
            }
          });
        } else {
          cursorSelections[i] = ctx.selectionsBefore[i];
        }
      }
      return cursorSelections;
    }, void 0, editReason);
    if (!selectionsAfter) {
      selectionsAfter = ctx.selectionsBefore;
    }
    const losingCursors = [];
    for (const losingCursorIndex in loserCursorsMap) {
      if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
        losingCursors.push(parseInt(losingCursorIndex, 10));
      }
    }
    losingCursors.sort((a, b) => {
      return b - a;
    });
    for (const losingCursor of losingCursors) {
      selectionsAfter.splice(losingCursor, 1);
    }
    return selectionsAfter;
  }
  static _arrayIsEmpty(commands) {
    for (let i = 0, len = commands.length; i < len; i++) {
      if (commands[i]) {
        return false;
      }
    }
    return true;
  }
  static _getEditOperations(ctx, commands) {
    let operations = [];
    let hadTrackedEditOperation = false;
    for (let i = 0, len = commands.length; i < len; i++) {
      const command = commands[i];
      if (command) {
        const r = this._getEditOperationsFromCommand(ctx, i, command);
        operations = operations.concat(r.operations);
        hadTrackedEditOperation = hadTrackedEditOperation || r.hadTrackedEditOperation;
      }
    }
    return {
      operations,
      hadTrackedEditOperation
    };
  }
  static _getEditOperationsFromCommand(ctx, majorIdentifier, command) {
    const operations = [];
    let operationMinor = 0;
    const addEditOperation = (range, text, forceMoveMarkers = false) => {
      if (Range.isEmpty(range) && text === "") {
        return;
      }
      operations.push({
        identifier: {
          major: majorIdentifier,
          minor: operationMinor++
        },
        range,
        text,
        forceMoveMarkers,
        isAutoWhitespaceEdit: command.insertsAutoWhitespace
      });
    };
    let hadTrackedEditOperation = false;
    const addTrackedEditOperation = (selection, text, forceMoveMarkers) => {
      hadTrackedEditOperation = true;
      addEditOperation(selection, text, forceMoveMarkers);
    };
    const trackSelection = (_selection, trackPreviousOnEmpty) => {
      const selection = Selection.liftSelection(_selection);
      let stickiness;
      if (selection.isEmpty()) {
        if (typeof trackPreviousOnEmpty === "boolean") {
          if (trackPreviousOnEmpty) {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
          } else {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
          }
        } else {
          const maxLineColumn = ctx.model.getLineMaxColumn(selection.startLineNumber);
          if (selection.startColumn === maxLineColumn) {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
          } else {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
          }
        }
      } else {
        stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
      }
      const l = ctx.trackedRanges.length;
      const id = ctx.model._setTrackedRange(null, selection, stickiness);
      ctx.trackedRanges[l] = id;
      ctx.trackedRangesDirection[l] = selection.getDirection();
      return l.toString();
    };
    const editOperationBuilder = {
      addEditOperation,
      addTrackedEditOperation,
      trackSelection
    };
    try {
      command.getEditOperations(ctx.model, editOperationBuilder);
    } catch (e) {
      onUnexpectedError(e);
      return {
        operations: [],
        hadTrackedEditOperation: false
      };
    }
    return {
      operations,
      hadTrackedEditOperation
    };
  }
  static _getLoserCursorMap(operations) {
    operations = operations.slice(0);
    operations.sort((a, b) => {
      return -Range.compareRangesUsingEnds(a.range, b.range);
    });
    const loserCursorsMap = {};
    for (let i = 1; i < operations.length; i++) {
      const previousOp = operations[i - 1];
      const currentOp = operations[i];
      if (Range.getStartPosition(previousOp.range).isBefore(Range.getEndPosition(currentOp.range))) {
        let loserMajor;
        if (previousOp.identifier.major > currentOp.identifier.major) {
          loserMajor = previousOp.identifier.major;
        } else {
          loserMajor = currentOp.identifier.major;
        }
        loserCursorsMap[loserMajor.toString()] = true;
        for (let j = 0; j < operations.length; j++) {
          if (operations[j].identifier.major === loserMajor) {
            operations.splice(j, 1);
            if (j < i) {
              i--;
            }
            j--;
          }
        }
        if (i > 0) {
          i--;
        }
      }
    }
    return loserCursorsMap;
  }
}
class CompositionLineState {
  constructor(text, lineNumber, startSelectionOffset, endSelectionOffset) {
    this.text = text;
    this.lineNumber = lineNumber;
    this.startSelectionOffset = startSelectionOffset;
    this.endSelectionOffset = endSelectionOffset;
  }
}
class CompositionState {
  static _capture(textModel, selections) {
    const result = [];
    for (const selection of selections) {
      if (selection.startLineNumber !== selection.endLineNumber) {
        return null;
      }
      const lineNumber = selection.startLineNumber;
      result.push(new CompositionLineState(
        textModel.getLineContent(lineNumber),
        lineNumber,
        selection.startColumn - 1,
        selection.endColumn - 1
      ));
    }
    return result;
  }
  constructor(textModel, selections) {
    this._original = CompositionState._capture(textModel, selections);
  }
  /**
   * Returns the inserted text during this composition.
   * If the composition resulted in existing text being changed (i.e. not a pure insertion) it returns null.
   */
  deduceOutcome(textModel, selections) {
    if (!this._original) {
      return null;
    }
    const current = CompositionState._capture(textModel, selections);
    if (!current) {
      return null;
    }
    if (this._original.length !== current.length) {
      return null;
    }
    const result = [];
    for (let i = 0, len = this._original.length; i < len; i++) {
      result.push(CompositionState._deduceOutcome(this._original[i], current[i]));
    }
    return result;
  }
  static _deduceOutcome(original, current) {
    const commonPrefix = Math.min(
      original.startSelectionOffset,
      current.startSelectionOffset,
      strings.commonPrefixLength(original.text, current.text)
    );
    const commonSuffix = Math.min(
      original.text.length - original.endSelectionOffset,
      current.text.length - current.endSelectionOffset,
      strings.commonSuffixLength(original.text, current.text)
    );
    const deletedText = original.text.substring(commonPrefix, original.text.length - commonSuffix);
    const insertedTextStartOffset = commonPrefix;
    const insertedTextEndOffset = current.text.length - commonSuffix;
    const insertedText = current.text.substring(insertedTextStartOffset, insertedTextEndOffset);
    const insertedTextRange = new Range(current.lineNumber, insertedTextStartOffset + 1, current.lineNumber, insertedTextEndOffset + 1);
    return new CompositionOutcome(
      deletedText,
      original.startSelectionOffset - commonPrefix,
      original.endSelectionOffset - commonPrefix,
      insertedText,
      current.startSelectionOffset - commonPrefix,
      current.endSelectionOffset - commonPrefix,
      insertedTextRange
    );
  }
}
export {
  CommandExecutor,
  CursorsController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY3Vyc29yXFxjdXJzb3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sbGVjdGlvbiB9IGZyb20gJy4vY3Vyc29yQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb25maWd1cmF0aW9uLCBDdXJzb3JTdGF0ZSwgRWRpdE9wZXJhdGlvblJlc3VsdCwgRWRpdE9wZXJhdGlvblR5cGUsIElDb2x1bW5TZWxlY3REYXRhLCBQYXJ0aWFsQ3Vyc29yU3RhdGUsIElDdXJzb3JTaW1wbGVNb2RlbCB9IGZyb20gJy4uL2N1cnNvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb250ZXh0IH0gZnJvbSAnLi9jdXJzb3JDb250ZXh0LmpzJztcbmltcG9ydCB7IERlbGV0ZU9wZXJhdGlvbnMgfSBmcm9tICcuL2N1cnNvckRlbGV0ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IENvbXBvc2l0aW9uT3V0Y29tZSwgVHlwZU9wZXJhdGlvbnMgfSBmcm9tICcuL2N1cnNvclR5cGVPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IEJhc2VUeXBlV2l0aEF1dG9DbG9zaW5nQ29tbWFuZCB9IGZyb20gJy4vY3Vyc29yVHlwZUVkaXRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSwgSVJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uLCBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcywgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJQ3Vyc29yU3RhdGVDb21wdXRlciwgSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uLCBJVmFsaWRFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgUmF3Q29udGVudENoYW5nZWRUeXBlLCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCwgSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB9IGZyb20gJy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBWZXJ0aWNhbFJldmVhbFR5cGUsIFZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCwgVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50IH0gZnJvbSAnLi4vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEN1cnNvclN0YXRlQ2hhbmdlZEV2ZW50LCBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IgfSBmcm9tICcuLi92aWV3TW9kZWxFdmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsRWRpdFNvdXJjZSwgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElDb29yZGluYXRlc0NvbnZlcnRlciB9IGZyb20gJy4uL2Nvb3JkaW5hdGVzQ29udmVydGVyLmpzJztcblxuZXhwb3J0IGNsYXNzIEN1cnNvcnNDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgX2tub3duTW9kZWxWZXJzaW9uSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvb3JkaW5hdGVzQ29udmVydGVyOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXI7XG5cdHB1YmxpYyBjb250ZXh0OiBDdXJzb3JDb250ZXh0O1xuXHRwcml2YXRlIF9jdXJzb3JzOiBDdXJzb3JDb2xsZWN0aW9uO1xuXG5cdHByaXZhdGUgX2hhc0ZvY3VzOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc0hhbmRsaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9jb21wb3NpdGlvblN0YXRlOiBDb21wb3NpdGlvblN0YXRlIHwgbnVsbDtcblx0cHJpdmF0ZSBfY29sdW1uU2VsZWN0RGF0YTogSUNvbHVtblNlbGVjdERhdGEgfCBudWxsO1xuXHRwcml2YXRlIF9hdXRvQ2xvc2VkQWN0aW9uczogQXV0b0Nsb3NlZEFjdGlvbltdO1xuXHRwcml2YXRlIF9wcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlO1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsOiBJVGV4dE1vZGVsLCB2aWV3TW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXI6IElDb29yZGluYXRlc0NvbnZlcnRlciwgY3Vyc29yQ29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2tub3duTW9kZWxWZXJzaW9uSWQgPSB0aGlzLl9tb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSB2aWV3TW9kZWw7XG5cdFx0dGhpcy5fY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBjb29yZGluYXRlc0NvbnZlcnRlcjtcblx0XHR0aGlzLmNvbnRleHQgPSBuZXcgQ3Vyc29yQ29udGV4dCh0aGlzLl9tb2RlbCwgdGhpcy5fdmlld01vZGVsLCB0aGlzLl9jb29yZGluYXRlc0NvbnZlcnRlciwgY3Vyc29yQ29uZmlnKTtcblx0XHR0aGlzLl9jdXJzb3JzID0gbmV3IEN1cnNvckNvbGxlY3Rpb24odGhpcy5jb250ZXh0KTtcblxuXHRcdHRoaXMuX2hhc0ZvY3VzID0gZmFsc2U7XG5cdFx0dGhpcy5faXNIYW5kbGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2NvbXBvc2l0aW9uU3RhdGUgPSBudWxsO1xuXHRcdHRoaXMuX2NvbHVtblNlbGVjdERhdGEgPSBudWxsO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zID0gW107XG5cdFx0dGhpcy5fcHJldkVkaXRPcGVyYXRpb25UeXBlID0gRWRpdE9wZXJhdGlvblR5cGUuT3RoZXI7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJzb3JzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hdXRvQ2xvc2VkQWN0aW9ucyA9IGRpc3Bvc2UodGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVDb25maWd1cmF0aW9uKGN1cnNvckNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dCA9IG5ldyBDdXJzb3JDb250ZXh0KHRoaXMuX21vZGVsLCB0aGlzLl92aWV3TW9kZWwsIHRoaXMuX2Nvb3JkaW5hdGVzQ29udmVydGVyLCBjdXJzb3JDb25maWcpO1xuXHRcdHRoaXMuX2N1cnNvcnMudXBkYXRlQ29udGV4dCh0aGlzLmNvbnRleHQpO1xuXHR9XG5cblx0cHVibGljIG9uTGluZU1hcHBpbmdDaGFuZ2VkKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2tub3duTW9kZWxWZXJzaW9uSWQgIT09IHRoaXMuX21vZGVsLmdldFZlcnNpb25JZCgpKSB7XG5cdFx0XHQvLyBUaGVyZSBhcmUgbW9kZWwgY2hhbmdlIGV2ZW50cyB0aGF0IEkgZGlkbid0IHlldCByZWNlaXZlLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFRoaXMgY2FuIGhhcHBlbiB3aGVuIGVkaXRpbmcgdGhlIG1vZGVsLCBhbmQgdGhlIHZpZXcgbW9kZWwgcmVjZWl2ZXMgdGhlIGNoYW5nZSBldmVudHMgZmlyc3QsXG5cdFx0XHQvLyBhbmQgdGhlIHZpZXcgbW9kZWwgZW1pdHMgbGluZSBtYXBwaW5nIGNoYW5nZWQgZXZlbnRzLCBhbGwgYmVmb3JlIHRoZSBjdXJzb3IgZ2V0cyBhIGNoYW5jZSB0b1xuXHRcdFx0Ly8gcmVjb3ZlciBmcm9tIG1hcmtlcnMuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVGhlIG1vZGVsIGNoYW5nZSBsaXN0ZW5lciBhYm92ZSB3aWxsIGJlIGNhbGxlZCBzb29uIGFuZCB3ZSdsbCBlbnN1cmUgYSB2YWxpZCBjdXJzb3Igc3RhdGUgdGhlcmUuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEVuc3VyZSB2YWxpZCBzdGF0ZVxuXHRcdHRoaXMuc2V0U3RhdGVzKGV2ZW50c0NvbGxlY3RvciwgJ3ZpZXdNb2RlbCcsIEN1cnNvckNoYW5nZVJlYXNvbi5Ob3RTZXQsIHRoaXMuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG5cblx0cHVibGljIHNldEhhc0ZvY3VzKGhhc0ZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzRm9jdXMgPSBoYXNGb2N1cztcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlQXV0b0Nsb3NlZEFjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnM6IFJhbmdlW10gPSB0aGlzLl9jdXJzb3JzLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlZEFjdGlvbiA9IHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zW2ldO1xuXHRcdFx0XHRpZiAoIWF1dG9DbG9zZWRBY3Rpb24uaXNWYWxpZChzZWxlY3Rpb25zKSkge1xuXHRcdFx0XHRcdGF1dG9DbG9zZWRBY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRpLS07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tLS0gc29tZSBnZXR0ZXJzL3NldHRlcnNcblxuXHRwdWJsaWMgZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCk6IEN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRQcmltYXJ5Q3Vyc29yKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFzdEFkZGVkQ3Vyc29ySW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRMYXN0QWRkZWRDdXJzb3JJbmRleCgpO1xuXHR9XG5cblx0cHVibGljIGdldEN1cnNvclN0YXRlcygpOiBDdXJzb3JTdGF0ZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRBbGwoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcmVhc29uOiBDdXJzb3JDaGFuZ2VSZWFzb24sIHN0YXRlczogUGFydGlhbEN1cnNvclN0YXRlW10gfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlYWNoZWRNYXhDdXJzb3JDb3VudCA9IGZhbHNlO1xuXHRcdGNvbnN0IG11bHRpQ3Vyc29yTGltaXQgPSB0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLm11bHRpQ3Vyc29yTGltaXQ7XG5cdFx0aWYgKHN0YXRlcyAhPT0gbnVsbCAmJiBzdGF0ZXMubGVuZ3RoID4gbXVsdGlDdXJzb3JMaW1pdCkge1xuXHRcdFx0c3RhdGVzID0gc3RhdGVzLnNsaWNlKDAsIG11bHRpQ3Vyc29yTGltaXQpO1xuXHRcdFx0cmVhY2hlZE1heEN1cnNvckNvdW50ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRTdGF0ZSA9IEN1cnNvck1vZGVsU3RhdGUuZnJvbSh0aGlzLl9tb2RlbCwgdGhpcyk7XG5cblx0XHR0aGlzLl9jdXJzb3JzLnNldFN0YXRlcyhzdGF0ZXMpO1xuXHRcdHRoaXMuX2N1cnNvcnMubm9ybWFsaXplKCk7XG5cdFx0dGhpcy5fY29sdW1uU2VsZWN0RGF0YSA9IG51bGw7XG5cblx0XHR0aGlzLl92YWxpZGF0ZUF1dG9DbG9zZWRBY3Rpb25zKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fZW1pdFN0YXRlQ2hhbmdlZElmTmVjZXNzYXJ5KGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCByZWFzb24sIG9sZFN0YXRlLCByZWFjaGVkTWF4Q3Vyc29yQ291bnQpO1xuXHR9XG5cblx0cHVibGljIHNldEN1cnNvckNvbHVtblNlbGVjdERhdGEoY29sdW1uU2VsZWN0RGF0YTogSUNvbHVtblNlbGVjdERhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2x1bW5TZWxlY3REYXRhID0gY29sdW1uU2VsZWN0RGF0YTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxBbGwoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgbWluaW1hbFJldmVhbDogYm9vbGVhbiwgdmVydGljYWxUeXBlOiBWZXJ0aWNhbFJldmVhbFR5cGUsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9ucyA9IHRoaXMuX2N1cnNvcnMuZ2V0Vmlld1Bvc2l0aW9ucygpO1xuXG5cdFx0bGV0IHJldmVhbFZpZXdSYW5nZTogUmFuZ2UgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcmV2ZWFsVmlld1NlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKHZpZXdQb3NpdGlvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0cmV2ZWFsVmlld1NlbGVjdGlvbnMgPSB0aGlzLl9jdXJzb3JzLmdldFZpZXdTZWxlY3Rpb25zKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldmVhbFZpZXdSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnModmlld1Bvc2l0aW9uc1swXSwgdmlld1Bvc2l0aW9uc1swXSk7XG5cdFx0fVxuXG5cdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IFZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudChzb3VyY2UsIG1pbmltYWxSZXZlYWwsIHJldmVhbFZpZXdSYW5nZSwgcmV2ZWFsVmlld1NlbGVjdGlvbnMsIHZlcnRpY2FsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbCwgc2Nyb2xsVHlwZSkpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFByaW1hcnkoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgbWluaW1hbFJldmVhbDogYm9vbGVhbiwgdmVydGljYWxUeXBlOiBWZXJ0aWNhbFJldmVhbFR5cGUsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJpbWFyeUN1cnNvciA9IHRoaXMuX2N1cnNvcnMuZ2V0UHJpbWFyeUN1cnNvcigpO1xuXHRcdGNvbnN0IHJldmVhbFZpZXdTZWxlY3Rpb25zID0gW3ByaW1hcnlDdXJzb3Iudmlld1N0YXRlLnNlbGVjdGlvbl07XG5cdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IFZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudChzb3VyY2UsIG1pbmltYWxSZXZlYWwsIG51bGwsIHJldmVhbFZpZXdTZWxlY3Rpb25zLCB2ZXJ0aWNhbFR5cGUsIHJldmVhbEhvcml6b250YWwsIHNjcm9sbFR5cGUpKTtcblx0fVxuXG5cdHB1YmxpYyBzYXZlU3RhdGUoKTogZWRpdG9yQ29tbW9uLklDdXJzb3JTdGF0ZVtdIHtcblxuXHRcdGNvbnN0IHJlc3VsdDogZWRpdG9yQ29tbW9uLklDdXJzb3JTdGF0ZVtdID0gW107XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fY3Vyc29ycy5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiAhc2VsZWN0aW9uLmlzRW1wdHkoKSxcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnQ6IHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiBzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGNvbHVtbjogc2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0Q29sdW1uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IHNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0Y29sdW1uOiBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW4sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVzdG9yZVN0YXRlKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBzdGF0ZXM6IGVkaXRvckNvbW1vbi5JQ3Vyc29yU3RhdGVbXSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgZGVzaXJlZFNlbGVjdGlvbnM6IElTZWxlY3Rpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHN0YXRlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZXNbaV07XG5cblx0XHRcdGxldCBwb3NpdGlvbkxpbmVOdW1iZXIgPSAxO1xuXHRcdFx0bGV0IHBvc2l0aW9uQ29sdW1uID0gMTtcblxuXHRcdFx0Ly8gQXZvaWQgbWlzc2luZyBwcm9wZXJ0aWVzIG9uIHRoZSBsaXRlcmFsXG5cdFx0XHRpZiAoc3RhdGUucG9zaXRpb24gJiYgc3RhdGUucG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRwb3NpdGlvbkxpbmVOdW1iZXIgPSBzdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnBvc2l0aW9uICYmIHN0YXRlLnBvc2l0aW9uLmNvbHVtbikge1xuXHRcdFx0XHRwb3NpdGlvbkNvbHVtbiA9IHN0YXRlLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHNlbGVjdGlvblN0YXJ0TGluZU51bWJlciA9IHBvc2l0aW9uTGluZU51bWJlcjtcblx0XHRcdGxldCBzZWxlY3Rpb25TdGFydENvbHVtbiA9IHBvc2l0aW9uQ29sdW1uO1xuXG5cdFx0XHQvLyBBdm9pZCBtaXNzaW5nIHByb3BlcnRpZXMgb24gdGhlIGxpdGVyYWxcblx0XHRcdGlmIChzdGF0ZS5zZWxlY3Rpb25TdGFydCAmJiBzdGF0ZS5zZWxlY3Rpb25TdGFydC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0TGluZU51bWJlciA9IHN0YXRlLnNlbGVjdGlvblN0YXJ0LmxpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUuc2VsZWN0aW9uU3RhcnQgJiYgc3RhdGUuc2VsZWN0aW9uU3RhcnQuY29sdW1uKSB7XG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uID0gc3RhdGUuc2VsZWN0aW9uU3RhcnQuY29sdW1uO1xuXHRcdFx0fVxuXG5cdFx0XHRkZXNpcmVkU2VsZWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyOiBzZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBzZWxlY3Rpb25TdGFydENvbHVtbixcblx0XHRcdFx0cG9zaXRpb25MaW5lTnVtYmVyOiBwb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRcdHBvc2l0aW9uQ29sdW1uOiBwb3NpdGlvbkNvbHVtblxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCAncmVzdG9yZVN0YXRlJywgQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCwgQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU2VsZWN0aW9ucyhkZXNpcmVkU2VsZWN0aW9ucykpO1xuXHRcdHRoaXMucmV2ZWFsQWxsKGV2ZW50c0NvbGxlY3RvciwgJ3Jlc3RvcmVTdGF0ZScsIGZhbHNlLCBWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLCB0cnVlLCBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxDb250ZW50Q2hhbmdlZChldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgZXZlbnQ6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudCBpbnN0YW5jZW9mIE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KSB7XG5cdFx0XHQvLyBJZiBpbmplY3RlZCB0ZXh0cyBjaGFuZ2UsIHRoZSB2aWV3IHBvc2l0aW9ucyBvZiBhbGwgY3Vyc29ycyBuZWVkIHRvIGJlIHVwZGF0ZWQuXG5cdFx0XHRpZiAodGhpcy5faXNIYW5kbGluZykge1xuXHRcdFx0XHQvLyBUaGUgdmlldyBwb3NpdGlvbnMgd2lsbCBiZSB1cGRhdGVkIHdoZW4gaGFuZGxpbmcgZmluaXNoZXNcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gc2V0U3RhdGVzIG1pZ2h0IHJlbW92ZSBtYXJrZXJzLCB3aGljaCBjb3VsZCB0cmlnZ2VyIGEgZGVjb3JhdGlvbiBjaGFuZ2UuXG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgaW5qZWN0ZWQgdGV4dCBkZWNvcmF0aW9ucyBmb3IgdGhhdCBsaW5lLCBgb25Nb2RlbENvbnRlbnRDaGFuZ2VkYCBpcyBlbWl0dGVkIGFnYWluXG5cdFx0XHQvLyBhbmQgYW4gZW5kbGVzcyByZWN1cnNpb24gaGFwcGVucy5cblx0XHRcdC8vIF9pc0hhbmRsaW5nIHByZXZlbnRzIHRoYXQuXG5cdFx0XHR0aGlzLl9pc0hhbmRsaW5nID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdGVzKGV2ZW50c0NvbGxlY3RvciwgJ21vZGVsQ2hhbmdlJywgQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCwgdGhpcy5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc0hhbmRsaW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGUgPSBldmVudC5yYXdDb250ZW50Q2hhbmdlZEV2ZW50O1xuXHRcdFx0dGhpcy5fa25vd25Nb2RlbFZlcnNpb25JZCA9IGUudmVyc2lvbklkO1xuXHRcdFx0aWYgKHRoaXMuX2lzSGFuZGxpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBoYWRGbHVzaEV2ZW50ID0gZS5jb250YWluc0V2ZW50KFJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5GbHVzaCk7XG5cdFx0XHR0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUgPSBFZGl0T3BlcmF0aW9uVHlwZS5PdGhlcjtcblxuXHRcdFx0aWYgKGhhZEZsdXNoRXZlbnQpIHtcblx0XHRcdFx0Ly8gYSBtb2RlbC5zZXRWYWx1ZSgpIHdhcyBjYWxsZWRcblx0XHRcdFx0dGhpcy5fY3Vyc29ycy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnNvcnMgPSBuZXcgQ3Vyc29yQ29sbGVjdGlvbih0aGlzLmNvbnRleHQpO1xuXHRcdFx0XHR0aGlzLl92YWxpZGF0ZUF1dG9DbG9zZWRBY3Rpb25zKCk7XG5cdFx0XHRcdHRoaXMuX2VtaXRTdGF0ZUNoYW5nZWRJZk5lY2Vzc2FyeShldmVudHNDb2xsZWN0b3IsICdtb2RlbCcsIEN1cnNvckNoYW5nZVJlYXNvbi5Db250ZW50Rmx1c2gsIG51bGwsIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9oYXNGb2N1cyAmJiBlLnJlc3VsdGluZ1NlbGVjdGlvbiAmJiBlLnJlc3VsdGluZ1NlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3Vyc29yU3RhdGUgPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTZWxlY3Rpb25zKGUucmVzdWx0aW5nU2VsZWN0aW9uKTtcblx0XHRcdFx0XHRpZiAodGhpcy5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCAnbW9kZWxDaGFuZ2UnLCBlLmlzVW5kb2luZyA/IEN1cnNvckNoYW5nZVJlYXNvbi5VbmRvIDogZS5pc1JlZG9pbmcgPyBDdXJzb3JDaGFuZ2VSZWFzb24uUmVkbyA6IEN1cnNvckNoYW5nZVJlYXNvbi5SZWNvdmVyRnJvbU1hcmtlcnMsIGN1cnNvclN0YXRlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXZlYWxBbGwoZXZlbnRzQ29sbGVjdG9yLCAnbW9kZWxDaGFuZ2UnLCBmYWxzZSwgVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgdHJ1ZSwgZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uc0Zyb21NYXJrZXJzID0gdGhpcy5fY3Vyc29ycy5yZWFkU2VsZWN0aW9uRnJvbU1hcmtlcnMoKTtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlcyhldmVudHNDb2xsZWN0b3IsICdtb2RlbENoYW5nZScsIEN1cnNvckNoYW5nZVJlYXNvbi5SZWNvdmVyRnJvbU1hcmtlcnMsIEN1cnNvclN0YXRlLmZyb21Nb2RlbFNlbGVjdGlvbnMoc2VsZWN0aW9uc0Zyb21NYXJrZXJzKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvcnMuZ2V0UHJpbWFyeUN1cnNvcigpLm1vZGVsU3RhdGUuc2VsZWN0aW9uO1xuXHR9XG5cblx0cHVibGljIGdldFRvcE1vc3RWaWV3UG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldFRvcE1vc3RWaWV3UG9zaXRpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRCb3R0b21Nb3N0Vmlld1Bvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRCb3R0b21Nb3N0Vmlld1Bvc2l0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YSgpOiBJQ29sdW1uU2VsZWN0RGF0YSB7XG5cdFx0aWYgKHRoaXMuX2NvbHVtblNlbGVjdERhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb2x1bW5TZWxlY3REYXRhO1xuXHRcdH1cblx0XHRjb25zdCBwcmltYXJ5Q3Vyc29yID0gdGhpcy5fY3Vyc29ycy5nZXRQcmltYXJ5Q3Vyc29yKCk7XG5cdFx0Y29uc3Qgdmlld1NlbGVjdGlvblN0YXJ0ID0gcHJpbWFyeUN1cnNvci52aWV3U3RhdGUuc2VsZWN0aW9uU3RhcnQuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHByaW1hcnlDdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc1JlYWw6IGZhbHNlLFxuXHRcdFx0ZnJvbVZpZXdMaW5lTnVtYmVyOiB2aWV3U2VsZWN0aW9uU3RhcnQubGluZU51bWJlcixcblx0XHRcdGZyb21WaWV3VmlzdWFsQ29sdW1uOiB0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKHRoaXMuX3ZpZXdNb2RlbCwgdmlld1NlbGVjdGlvblN0YXJ0KSxcblx0XHRcdHRvVmlld0xpbmVOdW1iZXI6IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0dG9WaWV3VmlzdWFsQ29sdW1uOiB0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKHRoaXMuX3ZpZXdNb2RlbCwgdmlld1Bvc2l0aW9uKSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldFNlbGVjdGlvbnMoKTogU2VsZWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldFNlbGVjdGlvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvcnMuZ2V0UHJpbWFyeUN1cnNvcigpLm1vZGVsU3RhdGUucG9zaXRpb247XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9ucyhldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBzZWxlY3Rpb25zOiByZWFkb25seSBJU2VsZWN0aW9uW10sIHJlYXNvbjogQ3Vyc29yQ2hhbmdlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIHJlYXNvbiwgQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU2VsZWN0aW9ucyhzZWxlY3Rpb25zKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCk6IEVkaXRPcGVyYXRpb25UeXBlIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJldkVkaXRPcGVyYXRpb25UeXBlO1xuXHR9XG5cblx0cHVibGljIHNldFByZXZFZGl0T3BlcmF0aW9uVHlwZSh0eXBlOiBFZGl0T3BlcmF0aW9uVHlwZSk6IHZvaWQge1xuXHRcdHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSA9IHR5cGU7XG5cdH1cblxuXHQvLyAtLS0tLS0gYXV4aWxpYXJ5IGhhbmRsaW5nIGxvZ2ljXG5cblx0cHJpdmF0ZSBfcHVzaEF1dG9DbG9zZWRBY3Rpb24oYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXM6IFJhbmdlW10sIGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXM6IFJhbmdlW10pOiB2b2lkIHtcblx0XHRjb25zdCBhdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlbHRhRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Y29uc3QgYXV0b0Nsb3NlZEVuY2xvc2luZ0RlbHRhRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGF1dG9DbG9zZWRDaGFyYWN0ZXJzRGVsdGFEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzW2ldLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdhdXRvLWNsb3NlZC1jaGFyYWN0ZXInLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2F1dG8tY2xvc2VkLWNoYXJhY3RlcicsXG5cdFx0XHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhdXRvQ2xvc2VkRW5jbG9zaW5nRGVsdGFEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXNbaV0sXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2F1dG8tY2xvc2VkLWVuY2xvc2luZycsXG5cdFx0XHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucyA9IHRoaXMuX21vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIGF1dG9DbG9zZWRDaGFyYWN0ZXJzRGVsdGFEZWNvcmF0aW9ucyk7XG5cdFx0Y29uc3QgYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zID0gdGhpcy5fbW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgYXV0b0Nsb3NlZEVuY2xvc2luZ0RlbHRhRGVjb3JhdGlvbnMpO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zLnB1c2gobmV3IEF1dG9DbG9zZWRBY3Rpb24odGhpcy5fbW9kZWwsIGF1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnMsIGF1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZUVkaXRPcGVyYXRpb24ob3BSZXN1bHQ6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCBudWxsLCBlZGl0UmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogdm9pZCB7XG5cblx0XHRpZiAoIW9wUmVzdWx0KSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGV4ZWN1dGVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAob3BSZXN1bHQuc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZSkge1xuXHRcdFx0dGhpcy5fbW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IENvbW1hbmRFeGVjdXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5fbW9kZWwsIHRoaXMuX2N1cnNvcnMuZ2V0U2VsZWN0aW9ucygpLCBvcFJlc3VsdC5jb21tYW5kcywgZWRpdFJlYXNvbik7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0Ly8gVGhlIGNvbW1hbmRzIHdlcmUgYXBwbGllZCBjb3JyZWN0bHlcblx0XHRcdHRoaXMuX2ludGVycHJldENvbW1hbmRSZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGF1dG8tY2xvc2luZyBjbG9zZWQgY2hhcmFjdGVyc1xuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRcdGNvbnN0IGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXM6IFJhbmdlW10gPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcFJlc3VsdC5jb21tYW5kcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gb3BSZXN1bHQuY29tbWFuZHNbaV07XG5cdFx0XHRcdGlmIChjb21tYW5kIGluc3RhbmNlb2YgQmFzZVR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kICYmIGNvbW1hbmQuZW5jbG9zaW5nUmFuZ2UgJiYgY29tbWFuZC5jbG9zZUNoYXJhY3RlclJhbmdlKSB7XG5cdFx0XHRcdFx0YXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMucHVzaChjb21tYW5kLmNsb3NlQ2hhcmFjdGVyUmFuZ2UpO1xuXHRcdFx0XHRcdGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXMucHVzaChjb21tYW5kLmVuY2xvc2luZ1JhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9wdXNoQXV0b0Nsb3NlZEFjdGlvbihhdXRvQ2xvc2VkQ2hhcmFjdGVyc1JhbmdlcywgYXV0b0Nsb3NlZEVuY2xvc2luZ1Jhbmdlcyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSA9IG9wUmVzdWx0LnR5cGU7XG5cdFx0fVxuXG5cdFx0aWYgKG9wUmVzdWx0LnNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcikge1xuXHRcdFx0dGhpcy5fbW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ludGVycHJldENvbW1hbmRSZXN1bHQoY3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghY3Vyc29yU3RhdGUgfHwgY3Vyc29yU3RhdGUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjdXJzb3JTdGF0ZSA9IHRoaXMuX2N1cnNvcnMucmVhZFNlbGVjdGlvbkZyb21NYXJrZXJzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29sdW1uU2VsZWN0RGF0YSA9IG51bGw7XG5cdFx0dGhpcy5fY3Vyc29ycy5zZXRTZWxlY3Rpb25zKGN1cnNvclN0YXRlKTtcblx0XHR0aGlzLl9jdXJzb3JzLm5vcm1hbGl6ZSgpO1xuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gLS0tLS0gZW1pdHRpbmcgZXZlbnRzXG5cblx0cHJpdmF0ZSBfZW1pdFN0YXRlQ2hhbmdlZElmTmVjZXNzYXJ5KGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHJlYXNvbjogQ3Vyc29yQ2hhbmdlUmVhc29uLCBvbGRTdGF0ZTogQ3Vyc29yTW9kZWxTdGF0ZSB8IG51bGwsIHJlYWNoZWRNYXhDdXJzb3JDb3VudDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5ld1N0YXRlID0gQ3Vyc29yTW9kZWxTdGF0ZS5mcm9tKHRoaXMuX21vZGVsLCB0aGlzKTtcblx0XHRpZiAobmV3U3RhdGUuZXF1YWxzKG9sZFN0YXRlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9jdXJzb3JzLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCB2aWV3U2VsZWN0aW9ucyA9IHRoaXMuX2N1cnNvcnMuZ2V0Vmlld1NlbGVjdGlvbnMoKTtcblxuXHRcdC8vIExldCB0aGUgdmlldyBnZXQgdGhlIGV2ZW50IGZpcnN0LlxuXHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyBWaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQodmlld1NlbGVjdGlvbnMsIHNlbGVjdGlvbnMsIHJlYXNvbikpO1xuXG5cdFx0Ly8gT25seSBhZnRlciB0aGUgdmlldyBoYXMgYmVlbiBub3RpZmllZCwgbGV0IHRoZSByZXN0IG9mIHRoZSB3b3JsZCBrbm93Li4uXG5cdFx0aWYgKCFvbGRTdGF0ZVxuXHRcdFx0fHwgb2xkU3RhdGUuY3Vyc29yU3RhdGUubGVuZ3RoICE9PSBuZXdTdGF0ZS5jdXJzb3JTdGF0ZS5sZW5ndGhcblx0XHRcdHx8IG5ld1N0YXRlLmN1cnNvclN0YXRlLnNvbWUoKG5ld0N1cnNvclN0YXRlLCBpKSA9PiAhbmV3Q3Vyc29yU3RhdGUubW9kZWxTdGF0ZS5lcXVhbHMob2xkU3RhdGUuY3Vyc29yU3RhdGVbaV0ubW9kZWxTdGF0ZSkpXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBvbGRTZWxlY3Rpb25zID0gb2xkU3RhdGUgPyBvbGRTdGF0ZS5jdXJzb3JTdGF0ZS5tYXAocyA9PiBzLm1vZGVsU3RhdGUuc2VsZWN0aW9uKSA6IG51bGw7XG5cdFx0XHRjb25zdCBvbGRNb2RlbFZlcnNpb25JZCA9IG9sZFN0YXRlID8gb2xkU3RhdGUubW9kZWxWZXJzaW9uSWQgOiAwO1xuXHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudChvbGRTZWxlY3Rpb25zLCBzZWxlY3Rpb25zLCBvbGRNb2RlbFZlcnNpb25JZCwgbmV3U3RhdGUubW9kZWxWZXJzaW9uSWQsIHNvdXJjZSB8fCAna2V5Ym9hcmQnLCByZWFzb24sIHJlYWNoZWRNYXhDdXJzb3JDb3VudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gLS0tLS0gaGFuZGxlcnMgYmV5b25kIHRoaXMgcG9pbnRcblxuXHRwcml2YXRlIF9maW5kQXV0b0Nsb3NpbmdQYWlycyhlZGl0czogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiBbbnVtYmVyLCBudW1iZXJdW10gfCBudWxsIHtcblx0XHRpZiAoIWVkaXRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kaWNlczogW251bWJlciwgbnVtYmVyXVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGVkaXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cdFx0XHRpZiAoIWVkaXQudGV4dCB8fCBlZGl0LnRleHQuaW5kZXhPZignXFxuJykgPj0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbSA9IGVkaXQudGV4dC5tYXRjaCgvKFspXFxdfT4nXCJgXSkoW14pXFxdfT4nXCJgXSopJC8pO1xuXHRcdFx0aWYgKCFtKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xvc2VDaGFyID0gbVsxXTtcblxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlyc0NhbmRpZGF0ZXMgPSB0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc0Nsb3NlU2luZ2xlQ2hhci5nZXQoY2xvc2VDaGFyKTtcblx0XHRcdGlmICghYXV0b0Nsb3NpbmdQYWlyc0NhbmRpZGF0ZXMgfHwgYXV0b0Nsb3NpbmdQYWlyc0NhbmRpZGF0ZXMubGVuZ3RoICE9PSAxKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcGVuQ2hhciA9IGF1dG9DbG9zaW5nUGFpcnNDYW5kaWRhdGVzWzBdLm9wZW47XG5cdFx0XHRjb25zdCBjbG9zZUNoYXJJbmRleCA9IGVkaXQudGV4dC5sZW5ndGggLSBtWzJdLmxlbmd0aCAtIDE7XG5cdFx0XHRjb25zdCBvcGVuQ2hhckluZGV4ID0gZWRpdC50ZXh0Lmxhc3RJbmRleE9mKG9wZW5DaGFyLCBjbG9zZUNoYXJJbmRleCAtIDEpO1xuXHRcdFx0aWYgKG9wZW5DaGFySW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRpbmRpY2VzLnB1c2goW29wZW5DaGFySW5kZXgsIGNsb3NlQ2hhckluZGV4XSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGljZXM7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUVkaXRzKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY3Vyc29yU3RhdGVDb21wdXRlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXIsIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdGxldCBhdXRvQ2xvc2luZ0luZGljZXM6IFtudW1iZXIsIG51bWJlcl1bXSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChzb3VyY2UgPT09ICdzbmlwcGV0Jykge1xuXHRcdFx0YXV0b0Nsb3NpbmdJbmRpY2VzID0gdGhpcy5fZmluZEF1dG9DbG9zaW5nUGFpcnMoZWRpdHMpO1xuXHRcdH1cblxuXHRcdGlmIChhdXRvQ2xvc2luZ0luZGljZXMpIHtcblx0XHRcdGVkaXRzWzBdLl9pc1RyYWNrZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBhdXRvQ2xvc2VkQ2hhcmFjdGVyc1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fbW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKHRoaXMuZ2V0U2VsZWN0aW9ucygpLCBlZGl0cywgKHVuZG9FZGl0cykgPT4ge1xuXHRcdFx0aWYgKGF1dG9DbG9zaW5nSW5kaWNlcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NpbmdJbmRpY2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgW29wZW5DaGFySW5uZXJJbmRleCwgY2xvc2VDaGFySW5uZXJJbmRleF0gPSBhdXRvQ2xvc2luZ0luZGljZXNbaV07XG5cdFx0XHRcdFx0Y29uc3QgdW5kb0VkaXQgPSB1bmRvRWRpdHNbaV07XG5cdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHVuZG9FZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHRjb25zdCBvcGVuQ2hhckluZGV4ID0gdW5kb0VkaXQucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxICsgb3BlbkNoYXJJbm5lckluZGV4O1xuXHRcdFx0XHRcdGNvbnN0IGNsb3NlQ2hhckluZGV4ID0gdW5kb0VkaXQucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxICsgY2xvc2VDaGFySW5uZXJJbmRleDtcblxuXHRcdFx0XHRcdGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzLnB1c2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNsb3NlQ2hhckluZGV4ICsgMSwgbGluZU51bWJlciwgY2xvc2VDaGFySW5kZXggKyAyKSk7XG5cdFx0XHRcdFx0YXV0b0Nsb3NlZEVuY2xvc2luZ1Jhbmdlcy5wdXNoKG5ldyBSYW5nZShsaW5lTnVtYmVyLCBvcGVuQ2hhckluZGV4ICsgMSwgbGluZU51bWJlciwgY2xvc2VDaGFySW5kZXggKyAyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBjdXJzb3JTdGF0ZUNvbXB1dGVyKHVuZG9FZGl0cyk7XG5cdFx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0XHQvLyBEb24ndCByZWNvdmVyIHRoZSBzZWxlY3Rpb24gZnJvbSBtYXJrZXJzIGJlY2F1c2Vcblx0XHRcdFx0Ly8gd2Uga25vdyB3aGF0IGl0IHNob3VsZCBiZS5cblx0XHRcdFx0dGhpcy5faXNIYW5kbGluZyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzZWxlY3Rpb25zO1xuXHRcdH0sIHVuZGVmaW5lZCwgcmVhc29uKTtcblx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0dGhpcy5faXNIYW5kbGluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5zZXRTZWxlY3Rpb25zKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBzZWxlY3Rpb25zLCBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KTtcblx0XHR9XG5cdFx0aWYgKGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3B1c2hBdXRvQ2xvc2VkQWN0aW9uKGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzLCBhdXRvQ2xvc2VkRW5jbG9zaW5nUmFuZ2VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlRWRpdChjYWxsYmFjazogKCkgPT4gdm9pZCwgZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgY3Vyc29yQ2hhbmdlUmVhc29uOiBDdXJzb3JDaGFuZ2VSZWFzb24gPSBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcucmVhZE9ubHkpIHtcblx0XHRcdC8vIHdlIGNhbm5vdCBlZGl0IHdoZW4gcmVhZCBvbmx5Li4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkU3RhdGUgPSBDdXJzb3JNb2RlbFN0YXRlLmZyb20odGhpcy5fbW9kZWwsIHRoaXMpO1xuXHRcdHRoaXMuX2N1cnNvcnMuc3RvcFRyYWNraW5nU2VsZWN0aW9ucygpO1xuXHRcdHRoaXMuX2lzSGFuZGxpbmcgPSB0cnVlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2N1cnNvcnMuZW5zdXJlVmFsaWRTdGF0ZSgpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNIYW5kbGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2N1cnNvcnMuc3RhcnRUcmFja2luZ1NlbGVjdGlvbnMoKTtcblx0XHR0aGlzLl92YWxpZGF0ZUF1dG9DbG9zZWRBY3Rpb25zKCk7XG5cdFx0aWYgKHRoaXMuX2VtaXRTdGF0ZUNoYW5nZWRJZk5lY2Vzc2FyeShldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgY3Vyc29yQ2hhbmdlUmVhc29uLCBvbGRTdGF0ZSwgZmFsc2UpKSB7XG5cdFx0XHR0aGlzLnJldmVhbEFsbChldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgZmFsc2UsIFZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGUsIHRydWUsIGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzKCk6IFJhbmdlW10ge1xuXHRcdHJldHVybiBBdXRvQ2xvc2VkQWN0aW9uLmdldEFsbEF1dG9DbG9zZWRDaGFyYWN0ZXJzKHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBzdGFydENvbXBvc2l0aW9uKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcG9zaXRpb25TdGF0ZSA9IG5ldyBDb21wb3NpdGlvblN0YXRlKHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSk7XG5cdH1cblxuXHRwdWJsaWMgZW5kQ29tcG9zaXRpb24oZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAnY29tcG9zaXRpb25FbmQnLCBkZXRhaWxlZFNvdXJjZTogc291cmNlIH0pO1xuXG5cdFx0Y29uc3QgY29tcG9zaXRpb25PdXRjb21lID0gdGhpcy5fY29tcG9zaXRpb25TdGF0ZSA/IHRoaXMuX2NvbXBvc2l0aW9uU3RhdGUuZGVkdWNlT3V0Y29tZSh0aGlzLl9tb2RlbCwgdGhpcy5nZXRTZWxlY3Rpb25zKCkpIDogbnVsbDtcblx0XHR0aGlzLl9jb21wb3NpdGlvblN0YXRlID0gbnVsbDtcblxuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0KCgpID0+IHtcblx0XHRcdGlmIChzb3VyY2UgPT09ICdrZXlib2FyZCcpIHtcblx0XHRcdFx0Ly8gY29tcG9zaXRpb24gZmluaXNoZXMsIGxldCdzIGNoZWNrIGlmIHdlIG5lZWQgdG8gYXV0byBjb21wbGV0ZSBpZiBuZWNlc3NhcnkuXG5cdFx0XHRcdHRoaXMuX2V4ZWN1dGVFZGl0T3BlcmF0aW9uKFR5cGVPcGVyYXRpb25zLmNvbXBvc2l0aW9uRW5kV2l0aEludGVyY2VwdG9ycyh0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUsIHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcsIHRoaXMuX21vZGVsLCBjb21wb3NpdGlvbk91dGNvbWUsIHRoaXMuZ2V0U2VsZWN0aW9ucygpLCB0aGlzLmdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzKCkpLCByZWFzb24pO1xuXHRcdFx0fVxuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyB0eXBlKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCB0ZXh0OiBzdHJpbmcsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAndHlwZScsIGRldGFpbGVkU291cmNlOiBzb3VyY2UgfSk7XG5cblx0XHR0aGlzLl9leGVjdXRlRWRpdCgoKSA9PiB7XG5cdFx0XHRpZiAoc291cmNlID09PSAna2V5Ym9hcmQnKSB7XG5cdFx0XHRcdC8vIElmIHRoaXMgZXZlbnQgaXMgY29taW5nIHN0cmFpZ2h0IGZyb20gdGhlIGtleWJvYXJkLCBsb29rIGZvciBlbGVjdHJpYyBjaGFyYWN0ZXJzIGFuZCBlbnRlclxuXG5cdFx0XHRcdGNvbnN0IGxlbiA9IHRleHQubGVuZ3RoO1xuXHRcdFx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRcdFx0d2hpbGUgKG9mZnNldCA8IGxlbikge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXJMZW5ndGggPSBzdHJpbmdzLm5leHRDaGFyTGVuZ3RoKHRleHQsIG9mZnNldCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hyID0gdGV4dC5zdWJzdHIob2Zmc2V0LCBjaGFyTGVuZ3RoKTtcblxuXHRcdFx0XHRcdC8vIEhlcmUgd2UgbXVzdCBpbnRlcnByZXQgZWFjaCB0eXBlZCBjaGFyYWN0ZXIgaW5kaXZpZHVhbGx5XG5cdFx0XHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oVHlwZU9wZXJhdGlvbnMudHlwZVdpdGhJbnRlcmNlcHRvcnMoISF0aGlzLl9jb21wb3NpdGlvblN0YXRlLCB0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUsIHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcsIHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSwgdGhpcy5nZXRBdXRvQ2xvc2VkQ2hhcmFjdGVycygpLCBjaHIpLCByZWFzb24pO1xuXG5cdFx0XHRcdFx0b2Zmc2V0ICs9IGNoYXJMZW5ndGg7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oVHlwZU9wZXJhdGlvbnMudHlwZVdpdGhvdXRJbnRlcmNlcHRvcnModGhpcy5fcHJldkVkaXRPcGVyYXRpb25UeXBlLCB0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLCB0aGlzLl9tb2RlbCwgdGhpcy5nZXRTZWxlY3Rpb25zKCksIHRleHQpLCByZWFzb24pO1xuXHRcdFx0fVxuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wb3NpdGlvblR5cGUoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHRleHQ6IHN0cmluZywgcmVwbGFjZVByZXZDaGFyQ250OiBudW1iZXIsIHJlcGxhY2VOZXh0Q2hhckNudDogbnVtYmVyLCBwb3NpdGlvbkRlbHRhOiBudW1iZXIsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAnY29tcG9zaXRpb25UeXBlJywgZGV0YWlsZWRTb3VyY2U6IHNvdXJjZSB9KTtcblxuXHRcdGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCAmJiByZXBsYWNlUHJldkNoYXJDbnQgPT09IDAgJiYgcmVwbGFjZU5leHRDaGFyQ250ID09PSAwKSB7XG5cdFx0XHQvLyB0aGlzIGVkaXQgaXMgYSBuby1vcFxuXHRcdFx0aWYgKHBvc2l0aW9uRGVsdGEgIT09IDApIHtcblx0XHRcdFx0Ly8gYnV0IGl0IHN0aWxsIHdhbnRzIHRvIG1vdmUgdGhlIGN1cnNvclxuXHRcdFx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gdGhpcy5nZXRTZWxlY3Rpb25zKCkubWFwKHNlbGVjdGlvbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gKyBwb3NpdGlvbkRlbHRhLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gKyBwb3NpdGlvbkRlbHRhKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuc2V0U2VsZWN0aW9ucyhldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgbmV3U2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0KCgpID0+IHtcblx0XHRcdHRoaXMuX2V4ZWN1dGVFZGl0T3BlcmF0aW9uKFR5cGVPcGVyYXRpb25zLmNvbXBvc2l0aW9uVHlwZSh0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUsIHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcsIHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSwgdGV4dCwgcmVwbGFjZVByZXZDaGFyQ250LCByZXBsYWNlTmV4dENoYXJDbnQsIHBvc2l0aW9uRGVsdGEpLCByZWFzb24pO1xuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBwYXN0ZShldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgdGV4dDogc3RyaW5nLCBwYXN0ZU9uTmV3TGluZTogYm9vbGVhbiwgbXVsdGljdXJzb3JUZXh0Pzogc3RyaW5nW10gfCBudWxsIHwgdW5kZWZpbmVkLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhc29uID0gRWRpdFNvdXJjZXMuY3Vyc29yKHsga2luZDogJ3Bhc3RlJywgZGV0YWlsZWRTb3VyY2U6IHNvdXJjZSB9KTtcblxuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0KCgpID0+IHtcblx0XHRcdHRoaXMuX2V4ZWN1dGVFZGl0T3BlcmF0aW9uKFR5cGVPcGVyYXRpb25zLnBhc3RlKHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcsIHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSwgdGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCB8fCBbXSksIHJlYXNvbik7XG5cdFx0fSwgZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIEN1cnNvckNoYW5nZVJlYXNvbi5QYXN0ZSk7XG5cdH1cblxuXHRwdWJsaWMgY3V0KGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhc29uID0gRWRpdFNvdXJjZXMuY3Vyc29yKHsga2luZDogJ2N1dCcsIGRldGFpbGVkU291cmNlOiBzb3VyY2UgfSk7XG5cdFx0dGhpcy5fZXhlY3V0ZUVkaXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oRGVsZXRlT3BlcmF0aW9ucy5jdXQodGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZywgdGhpcy5fbW9kZWwsIHRoaXMuZ2V0U2VsZWN0aW9ucygpKSwgcmVhc29uKTtcblx0XHR9LCBldmVudHNDb2xsZWN0b3IsIHNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmQoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIGNvbW1hbmQ6IGVkaXRvckNvbW1vbi5JQ29tbWFuZCwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYXNvbiA9IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICdleGVjdXRlQ29tbWFuZCcsIGRldGFpbGVkU291cmNlOiBzb3VyY2UgfSk7XG5cblx0XHR0aGlzLl9leGVjdXRlRWRpdCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJzb3JzLmtpbGxTZWNvbmRhcnlDdXJzb3JzKCk7XG5cblx0XHRcdHRoaXMuX2V4ZWN1dGVFZGl0T3BlcmF0aW9uKG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLk90aGVyLCBbY29tbWFuZF0sIHtcblx0XHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogZmFsc2UsXG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHRcdH0pLCByZWFzb24pO1xuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlQ29tbWFuZHMoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIGNvbW1hbmRzOiBlZGl0b3JDb21tb24uSUNvbW1hbmRbXSwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYXNvbiA9IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICdleGVjdXRlQ29tbWFuZHMnLCBkZXRhaWxlZFNvdXJjZTogc291cmNlIH0pO1xuXG5cdFx0dGhpcy5fZXhlY3V0ZUVkaXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24obmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlXG5cdFx0XHR9KSwgcmVhc29uKTtcblx0XHR9LCBldmVudHNDb2xsZWN0b3IsIHNvdXJjZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNuYXBzaG90IG9mIHRoZSBjdXJzb3IgYW5kIHRoZSBtb2RlbCBzdGF0ZVxuICovXG5jbGFzcyBDdXJzb3JNb2RlbFN0YXRlIHtcblx0cHVibGljIHN0YXRpYyBmcm9tKG1vZGVsOiBJVGV4dE1vZGVsLCBjdXJzb3I6IEN1cnNvcnNDb250cm9sbGVyKTogQ3Vyc29yTW9kZWxTdGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBDdXJzb3JNb2RlbFN0YXRlKG1vZGVsLmdldFZlcnNpb25JZCgpLCBjdXJzb3IuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsVmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGN1cnNvclN0YXRlOiBDdXJzb3JTdGF0ZVtdLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IEN1cnNvck1vZGVsU3RhdGUgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFvdGhlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tb2RlbFZlcnNpb25JZCAhPT0gb3RoZXIubW9kZWxWZXJzaW9uSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY3Vyc29yU3RhdGUubGVuZ3RoICE9PSBvdGhlci5jdXJzb3JTdGF0ZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuY3Vyc29yU3RhdGUubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICghdGhpcy5jdXJzb3JTdGF0ZVtpXS5lcXVhbHMob3RoZXIuY3Vyc29yU3RhdGVbaV0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY2xhc3MgQXV0b0Nsb3NlZEFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRBbGxBdXRvQ2xvc2VkQ2hhcmFjdGVycyhhdXRvQ2xvc2VkQWN0aW9uczogQXV0b0Nsb3NlZEFjdGlvbltdKTogUmFuZ2VbXSB7XG5cdFx0bGV0IGF1dG9DbG9zZWRDaGFyYWN0ZXJzOiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBhdXRvQ2xvc2VkQWN0aW9uIG9mIGF1dG9DbG9zZWRBY3Rpb25zKSB7XG5cdFx0XHRhdXRvQ2xvc2VkQ2hhcmFjdGVycyA9IGF1dG9DbG9zZWRDaGFyYWN0ZXJzLmNvbmNhdChhdXRvQ2xvc2VkQWN0aW9uLmdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXV0b0Nsb3NlZENoYXJhY3RlcnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblxuXHRwcml2YXRlIF9hdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlY29yYXRpb25zOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBfYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zOiBzdHJpbmdbXTtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSVRleHRNb2RlbCwgYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9uczogc3RyaW5nW10sIGF1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9uczogc3RyaW5nW10pIHtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnMgPSBhdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlY29yYXRpb25zO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9ucyA9IGF1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnMgPSB0aGlzLl9tb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuX2F1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnMsIFtdKTtcblx0XHR0aGlzLl9hdXRvQ2xvc2VkRW5jbG9zaW5nRGVjb3JhdGlvbnMgPSB0aGlzLl9tb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuX2F1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9ucywgW10pO1xuXHR9XG5cblx0cHVibGljIGdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzKCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvblJhbmdlID0gdGhpcy5fbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKHRoaXMuX2F1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnNbaV0pO1xuXHRcdFx0aWYgKGRlY29yYXRpb25SYW5nZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChkZWNvcmF0aW9uUmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGlzVmFsaWQoc2VsZWN0aW9uczogUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVuY2xvc2luZ1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uUmFuZ2UgPSB0aGlzLl9tb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5fYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zW2ldKTtcblx0XHRcdGlmIChkZWNvcmF0aW9uUmFuZ2UpIHtcblx0XHRcdFx0ZW5jbG9zaW5nUmFuZ2VzLnB1c2goZGVjb3JhdGlvblJhbmdlKTtcblx0XHRcdFx0aWYgKGRlY29yYXRpb25SYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IGRlY29yYXRpb25SYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Ly8gU3RvcCB0cmFja2luZyBpZiB0aGUgcmFuZ2UgYmVjb21lcyBtdWx0aWxpbmUuLi5cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZW5jbG9zaW5nUmFuZ2VzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblxuXHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZWxlY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaSA+PSBlbmNsb3NpbmdSYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghZW5jbG9zaW5nUmFuZ2VzW2ldLnN0cmljdENvbnRhaW5zUmFuZ2Uoc2VsZWN0aW9uc1tpXSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXhlY0NvbnRleHQge1xuXHRyZWFkb25seSBtb2RlbDogSVRleHRNb2RlbDtcblx0cmVhZG9ubHkgc2VsZWN0aW9uc0JlZm9yZTogU2VsZWN0aW9uW107XG5cdHJlYWRvbmx5IHRyYWNrZWRSYW5nZXM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSB0cmFja2VkUmFuZ2VzRGlyZWN0aW9uOiBTZWxlY3Rpb25EaXJlY3Rpb25bXTtcbn1cblxuaW50ZXJmYWNlIElDb21tYW5kRGF0YSB7XG5cdG9wZXJhdGlvbnM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdO1xuXHRoYWRUcmFja2VkRWRpdE9wZXJhdGlvbjogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElDb21tYW5kc0RhdGEge1xuXHRvcGVyYXRpb25zOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXTtcblx0aGFkVHJhY2tlZEVkaXRPcGVyYXRpb246IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kRXhlY3V0b3Ige1xuXG5cdHB1YmxpYyBzdGF0aWMgZXhlY3V0ZUNvbW1hbmRzKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zQmVmb3JlOiBTZWxlY3Rpb25bXSwgY29tbWFuZHM6IChlZGl0b3JDb21tb24uSUNvbW1hbmQgfCBudWxsKVtdLCBlZGl0UmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlID0gRWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6ICdleGVjdXRlQ29tbWFuZHMnIH0pKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblxuXHRcdGNvbnN0IGN0eDogSUV4ZWNDb250ZXh0ID0ge1xuXHRcdFx0bW9kZWw6IG1vZGVsLFxuXHRcdFx0c2VsZWN0aW9uc0JlZm9yZTogc2VsZWN0aW9uc0JlZm9yZSxcblx0XHRcdHRyYWNrZWRSYW5nZXM6IFtdLFxuXHRcdFx0dHJhY2tlZFJhbmdlc0RpcmVjdGlvbjogW11cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5faW5uZXJFeGVjdXRlQ29tbWFuZHMoY3R4LCBjb21tYW5kcywgZWRpdFJlYXNvbik7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3R4LnRyYWNrZWRSYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGN0eC5tb2RlbC5fc2V0VHJhY2tlZFJhbmdlKGN0eC50cmFja2VkUmFuZ2VzW2ldLCBudWxsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaW5uZXJFeGVjdXRlQ29tbWFuZHMoY3R4OiBJRXhlY0NvbnRleHQsIGNvbW1hbmRzOiAoZWRpdG9yQ29tbW9uLklDb21tYW5kIHwgbnVsbClbXSwgZWRpdFJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cblx0XHRpZiAodGhpcy5fYXJyYXlJc0VtcHR5KGNvbW1hbmRzKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZHNEYXRhID0gdGhpcy5fZ2V0RWRpdE9wZXJhdGlvbnMoY3R4LCBjb21tYW5kcyk7XG5cdFx0aWYgKGNvbW1hbmRzRGF0YS5vcGVyYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3T3BlcmF0aW9ucyA9IGNvbW1hbmRzRGF0YS5vcGVyYXRpb25zO1xuXG5cdFx0Y29uc3QgbG9zZXJDdXJzb3JzTWFwID0gdGhpcy5fZ2V0TG9zZXJDdXJzb3JNYXAocmF3T3BlcmF0aW9ucyk7XG5cdFx0aWYgKGxvc2VyQ3Vyc29yc01hcC5oYXNPd25Qcm9wZXJ0eSgnMCcpKSB7XG5cdFx0XHQvLyBUaGVzZSBjb21tYW5kcyBhcmUgdmVyeSBtZXNzZWQgdXBcblx0XHRcdGNvbnNvbGUud2FybignSWdub3JpbmcgY29tbWFuZHMnKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBvcGVyYXRpb25zIGJlbG9uZ2luZyB0byBsb3NpbmcgY3Vyc29yc1xuXHRcdGNvbnN0IGZpbHRlcmVkT3BlcmF0aW9uczogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmF3T3BlcmF0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKCFsb3NlckN1cnNvcnNNYXAuaGFzT3duUHJvcGVydHkocmF3T3BlcmF0aW9uc1tpXS5pZGVudGlmaWVyIS5tYWpvci50b1N0cmluZygpKSkge1xuXHRcdFx0XHRmaWx0ZXJlZE9wZXJhdGlvbnMucHVzaChyYXdPcGVyYXRpb25zW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUT0RPQEFsZXg6IGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXMuXG5cdFx0Ly8gZ2l2ZSB0aGUgaGludCB0aGF0IGVkaXQgb3BlcmF0aW9ucyBhcmUgdHJhY2tlZCB0byB0aGUgbW9kZWxcblx0XHRpZiAoY29tbWFuZHNEYXRhLmhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uICYmIGZpbHRlcmVkT3BlcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmaWx0ZXJlZE9wZXJhdGlvbnNbMF0uX2lzVHJhY2tlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGxldCBzZWxlY3Rpb25zQWZ0ZXIgPSBjdHgubW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKGN0eC5zZWxlY3Rpb25zQmVmb3JlLCBmaWx0ZXJlZE9wZXJhdGlvbnMsIChpbnZlcnNlRWRpdE9wZXJhdGlvbnM6IElWYWxpZEVkaXRPcGVyYXRpb25bXSk6IFNlbGVjdGlvbltdID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwZWRJbnZlcnNlRWRpdE9wZXJhdGlvbnM6IElWYWxpZEVkaXRPcGVyYXRpb25bXVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5zZWxlY3Rpb25zQmVmb3JlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGdyb3VwZWRJbnZlcnNlRWRpdE9wZXJhdGlvbnNbaV0gPSBbXTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgb3Agb2YgaW52ZXJzZUVkaXRPcGVyYXRpb25zKSB7XG5cdFx0XHRcdGlmICghb3AuaWRlbnRpZmllcikge1xuXHRcdFx0XHRcdC8vIHBlcmhhcHMgYXV0byB3aGl0ZXNwYWNlIHRyaW0gZWRpdHNcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRncm91cGVkSW52ZXJzZUVkaXRPcGVyYXRpb25zW29wLmlkZW50aWZpZXIubWFqb3JdLnB1c2gob3ApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWlub3JCYXNlZFNvcnRlciA9IChhOiBJVmFsaWRFZGl0T3BlcmF0aW9uLCBiOiBJVmFsaWRFZGl0T3BlcmF0aW9uKSA9PiB7XG5cdFx0XHRcdHJldHVybiBhLmlkZW50aWZpZXIhLm1pbm9yIC0gYi5pZGVudGlmaWVyIS5taW5vcjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjdXJzb3JTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjdHguc2VsZWN0aW9uc0JlZm9yZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoZ3JvdXBlZEludmVyc2VFZGl0T3BlcmF0aW9uc1tpXS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBlZEludmVyc2VFZGl0T3BlcmF0aW9uc1tpXS5zb3J0KG1pbm9yQmFzZWRTb3J0ZXIpO1xuXHRcdFx0XHRcdGN1cnNvclNlbGVjdGlvbnNbaV0gPSBjb21tYW5kc1tpXSEuY29tcHV0ZUN1cnNvclN0YXRlKGN0eC5tb2RlbCwge1xuXHRcdFx0XHRcdFx0Z2V0SW52ZXJzZUVkaXRPcGVyYXRpb25zOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBncm91cGVkSW52ZXJzZUVkaXRPcGVyYXRpb25zW2ldO1xuXHRcdFx0XHRcdFx0fSxcblxuXHRcdFx0XHRcdFx0Z2V0VHJhY2tlZFNlbGVjdGlvbjogKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaWR4ID0gcGFyc2VJbnQoaWQsIDEwKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjdHgubW9kZWwuX2dldFRyYWNrZWRSYW5nZShjdHgudHJhY2tlZFJhbmdlc1tpZHhdKSE7XG5cdFx0XHRcdFx0XHRcdGlmIChjdHgudHJhY2tlZFJhbmdlc0RpcmVjdGlvbltpZHhdID09PSBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4sIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnNvclNlbGVjdGlvbnNbaV0gPSBjdHguc2VsZWN0aW9uc0JlZm9yZVtpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGN1cnNvclNlbGVjdGlvbnM7XG5cdFx0fSwgdW5kZWZpbmVkLCBlZGl0UmVhc29uKTtcblx0XHRpZiAoIXNlbGVjdGlvbnNBZnRlcikge1xuXHRcdFx0c2VsZWN0aW9uc0FmdGVyID0gY3R4LnNlbGVjdGlvbnNCZWZvcmU7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0cmFjdCBsb3NpbmcgY3Vyc29yc1xuXHRcdGNvbnN0IGxvc2luZ0N1cnNvcnM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBsb3NpbmdDdXJzb3JJbmRleCBpbiBsb3NlckN1cnNvcnNNYXApIHtcblx0XHRcdGlmIChsb3NlckN1cnNvcnNNYXAuaGFzT3duUHJvcGVydHkobG9zaW5nQ3Vyc29ySW5kZXgpKSB7XG5cdFx0XHRcdGxvc2luZ0N1cnNvcnMucHVzaChwYXJzZUludChsb3NpbmdDdXJzb3JJbmRleCwgMTApKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTb3J0IGxvc2luZyBjdXJzb3JzIGRlc2NlbmRpbmdcblx0XHRsb3NpbmdDdXJzb3JzLnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRcdHJldHVybiBiIC0gYTtcblx0XHR9KTtcblxuXHRcdC8vIFJlbW92ZSBsb3NpbmcgY3Vyc29yc1xuXHRcdGZvciAoY29uc3QgbG9zaW5nQ3Vyc29yIG9mIGxvc2luZ0N1cnNvcnMpIHtcblx0XHRcdHNlbGVjdGlvbnNBZnRlci5zcGxpY2UobG9zaW5nQ3Vyc29yLCAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2VsZWN0aW9uc0FmdGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FycmF5SXNFbXB0eShjb21tYW5kczogKGVkaXRvckNvbW1vbi5JQ29tbWFuZCB8IG51bGwpW10pOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY29tbWFuZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChjb21tYW5kc1tpXSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldEVkaXRPcGVyYXRpb25zKGN0eDogSUV4ZWNDb250ZXh0LCBjb21tYW5kczogKGVkaXRvckNvbW1vbi5JQ29tbWFuZCB8IG51bGwpW10pOiBJQ29tbWFuZHNEYXRhIHtcblx0XHRsZXQgb3BlcmF0aW9uczogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRsZXQgaGFkVHJhY2tlZEVkaXRPcGVyYXRpb246IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjb21tYW5kcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGNvbW1hbmRzW2ldO1xuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0Y29uc3QgciA9IHRoaXMuX2dldEVkaXRPcGVyYXRpb25zRnJvbUNvbW1hbmQoY3R4LCBpLCBjb21tYW5kKTtcblx0XHRcdFx0b3BlcmF0aW9ucyA9IG9wZXJhdGlvbnMuY29uY2F0KHIub3BlcmF0aW9ucyk7XG5cdFx0XHRcdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uID0gaGFkVHJhY2tlZEVkaXRPcGVyYXRpb24gfHwgci5oYWRUcmFja2VkRWRpdE9wZXJhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9wZXJhdGlvbnM6IG9wZXJhdGlvbnMsXG5cdFx0XHRoYWRUcmFja2VkRWRpdE9wZXJhdGlvbjogaGFkVHJhY2tlZEVkaXRPcGVyYXRpb25cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldEVkaXRPcGVyYXRpb25zRnJvbUNvbW1hbmQoY3R4OiBJRXhlY0NvbnRleHQsIG1ham9ySWRlbnRpZmllcjogbnVtYmVyLCBjb21tYW5kOiBlZGl0b3JDb21tb24uSUNvbW1hbmQpOiBJQ29tbWFuZERhdGEge1xuXHRcdC8vIFRoaXMgbWV0aG9kIGFjdHMgYXMgYSB0cmFuc2FjdGlvbiwgaWYgdGhlIGNvbW1hbmQgZmFpbHNcblx0XHQvLyBldmVyeXRoaW5nIGl0IGhhcyBkb25lIGlzIGlnbm9yZWRcblx0XHRjb25zdCBvcGVyYXRpb25zOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGxldCBvcGVyYXRpb25NaW5vciA9IDA7XG5cblx0XHRjb25zdCBhZGRFZGl0T3BlcmF0aW9uID0gKHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZyB8IG51bGwsIGZvcmNlTW92ZU1hcmtlcnM6IGJvb2xlYW4gPSBmYWxzZSkgPT4ge1xuXHRcdFx0aWYgKFJhbmdlLmlzRW1wdHkocmFuZ2UpICYmIHRleHQgPT09ICcnKSB7XG5cdFx0XHRcdC8vIFRoaXMgY29tbWFuZCB3YW50cyB0byBhZGQgYSBuby1vcCA9PiBubyB0aGFuayB5b3Vcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0b3BlcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0aWRlbnRpZmllcjoge1xuXHRcdFx0XHRcdG1ham9yOiBtYWpvcklkZW50aWZpZXIsXG5cdFx0XHRcdFx0bWlub3I6IG9wZXJhdGlvbk1pbm9yKytcblx0XHRcdFx0fSxcblx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmb3JjZU1vdmVNYXJrZXJzLFxuXHRcdFx0XHRpc0F1dG9XaGl0ZXNwYWNlRWRpdDogY29tbWFuZC5pbnNlcnRzQXV0b1doaXRlc3BhY2Vcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRsZXQgaGFkVHJhY2tlZEVkaXRPcGVyYXRpb24gPSBmYWxzZTtcblx0XHRjb25zdCBhZGRUcmFja2VkRWRpdE9wZXJhdGlvbiA9IChzZWxlY3Rpb246IElSYW5nZSwgdGV4dDogc3RyaW5nIHwgbnVsbCwgZm9yY2VNb3ZlTWFya2Vycz86IGJvb2xlYW4pID0+IHtcblx0XHRcdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uID0gdHJ1ZTtcblx0XHRcdGFkZEVkaXRPcGVyYXRpb24oc2VsZWN0aW9uLCB0ZXh0LCBmb3JjZU1vdmVNYXJrZXJzKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJhY2tTZWxlY3Rpb24gPSAoX3NlbGVjdGlvbjogSVNlbGVjdGlvbiwgdHJhY2tQcmV2aW91c09uRW1wdHk/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBTZWxlY3Rpb24ubGlmdFNlbGVjdGlvbihfc2VsZWN0aW9uKTtcblx0XHRcdGxldCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiB0cmFja1ByZXZpb3VzT25FbXB0eSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0aWYgKHRyYWNrUHJldmlvdXNPbkVtcHR5KSB7XG5cdFx0XHRcdFx0XHRzdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRyeSB0byBsb2NrIGl0IHdpdGggc3Vycm91bmRpbmcgdGV4dFxuXHRcdFx0XHRcdGNvbnN0IG1heExpbmVDb2x1bW4gPSBjdHgubW9kZWwuZ2V0TGluZU1heENvbHVtbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uLnN0YXJ0Q29sdW1uID09PSBtYXhMaW5lQ29sdW1uKSB7XG5cdFx0XHRcdFx0XHRzdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXM7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGwgPSBjdHgudHJhY2tlZFJhbmdlcy5sZW5ndGg7XG5cdFx0XHRjb25zdCBpZCA9IGN0eC5tb2RlbC5fc2V0VHJhY2tlZFJhbmdlKG51bGwsIHNlbGVjdGlvbiwgc3RpY2tpbmVzcyk7XG5cdFx0XHRjdHgudHJhY2tlZFJhbmdlc1tsXSA9IGlkO1xuXHRcdFx0Y3R4LnRyYWNrZWRSYW5nZXNEaXJlY3Rpb25bbF0gPSBzZWxlY3Rpb24uZ2V0RGlyZWN0aW9uKCk7XG5cdFx0XHRyZXR1cm4gbC50b1N0cmluZygpO1xuXHRcdH07XG5cblx0XHRjb25zdCBlZGl0T3BlcmF0aW9uQnVpbGRlcjogZWRpdG9yQ29tbW9uLklFZGl0T3BlcmF0aW9uQnVpbGRlciA9IHtcblx0XHRcdGFkZEVkaXRPcGVyYXRpb246IGFkZEVkaXRPcGVyYXRpb24sXG5cdFx0XHRhZGRUcmFja2VkRWRpdE9wZXJhdGlvbjogYWRkVHJhY2tlZEVkaXRPcGVyYXRpb24sXG5cdFx0XHR0cmFja1NlbGVjdGlvbjogdHJhY2tTZWxlY3Rpb25cblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbW1hbmQuZ2V0RWRpdE9wZXJhdGlvbnMoY3R4Lm1vZGVsLCBlZGl0T3BlcmF0aW9uQnVpbGRlcik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gVE9ET0BBbGV4IHVzZSBub3RpZmljYXRpb24gc2VydmljZSBpZiB0aGlzIHNob3VsZCBiZSB1c2VyIGZhY2luZ1xuXHRcdFx0Ly8gZS5mcmllbmRseU1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2NvcnJ1cHQuY29tbWFuZHMnLCBcIlVuZXhwZWN0ZWQgZXhjZXB0aW9uIHdoaWxlIGV4ZWN1dGluZyBjb21tYW5kLlwiKTtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b3BlcmF0aW9uczogW10sXG5cdFx0XHRcdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uOiBmYWxzZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlcmF0aW9uczogb3BlcmF0aW9ucyxcblx0XHRcdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uOiBoYWRUcmFja2VkRWRpdE9wZXJhdGlvblxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0TG9zZXJDdXJzb3JNYXAob3BlcmF0aW9uczogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB7IFtpbmRleDogc3RyaW5nXTogYm9vbGVhbiB9IHtcblx0XHQvLyBUaGlzIGlzIGRlc3RydWN0aXZlIG9uIHRoZSBhcnJheVxuXHRcdG9wZXJhdGlvbnMgPSBvcGVyYXRpb25zLnNsaWNlKDApO1xuXG5cdFx0Ly8gU29ydCBvcGVyYXRpb25zIHdpdGggbGFzdCBvbmUgZmlyc3Rcblx0XHRvcGVyYXRpb25zLnNvcnQoKGE6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbiwgYjogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uKTogbnVtYmVyID0+IHtcblx0XHRcdC8vIE5vdGUgdGhlIG1pbnVzIVxuXHRcdFx0cmV0dXJuIC0oUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nRW5kcyhhLnJhbmdlLCBiLnJhbmdlKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBPcGVyYXRpb25zIGNhbiBub3Qgb3ZlcmxhcCFcblx0XHRjb25zdCBsb3NlckN1cnNvcnNNYXA6IHsgW2luZGV4OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgb3BlcmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNPcCA9IG9wZXJhdGlvbnNbaSAtIDFdO1xuXHRcdFx0Y29uc3QgY3VycmVudE9wID0gb3BlcmF0aW9uc1tpXTtcblxuXHRcdFx0aWYgKFJhbmdlLmdldFN0YXJ0UG9zaXRpb24ocHJldmlvdXNPcC5yYW5nZSkuaXNCZWZvcmUoUmFuZ2UuZ2V0RW5kUG9zaXRpb24oY3VycmVudE9wLnJhbmdlKSkpIHtcblxuXHRcdFx0XHRsZXQgbG9zZXJNYWpvcjogbnVtYmVyO1xuXG5cdFx0XHRcdGlmIChwcmV2aW91c09wLmlkZW50aWZpZXIhLm1ham9yID4gY3VycmVudE9wLmlkZW50aWZpZXIhLm1ham9yKSB7XG5cdFx0XHRcdFx0Ly8gcHJldmlvdXNPcCBsb3NlcyB0aGUgYmF0dGxlXG5cdFx0XHRcdFx0bG9zZXJNYWpvciA9IHByZXZpb3VzT3AuaWRlbnRpZmllciEubWFqb3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bG9zZXJNYWpvciA9IGN1cnJlbnRPcC5pZGVudGlmaWVyIS5tYWpvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxvc2VyQ3Vyc29yc01hcFtsb3Nlck1ham9yLnRvU3RyaW5nKCldID0gdHJ1ZTtcblxuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IG9wZXJhdGlvbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRpZiAob3BlcmF0aW9uc1tqXS5pZGVudGlmaWVyIS5tYWpvciA9PT0gbG9zZXJNYWpvcikge1xuXHRcdFx0XHRcdFx0b3BlcmF0aW9ucy5zcGxpY2UoaiwgMSk7XG5cdFx0XHRcdFx0XHRpZiAoaiA8IGkpIHtcblx0XHRcdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ai0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHRcdGktLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsb3NlckN1cnNvcnNNYXA7XG5cdH1cbn1cblxuY2xhc3MgQ29tcG9zaXRpb25MaW5lU3RhdGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0U2VsZWN0aW9uT2Zmc2V0OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGVuZFNlbGVjdGlvbk9mZnNldDogbnVtYmVyXG5cdCkgeyB9XG59XG5cbmNsYXNzIENvbXBvc2l0aW9uU3RhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsOiBDb21wb3NpdGlvbkxpbmVTdGF0ZVtdIHwgbnVsbDtcblxuXHRwcml2YXRlIHN0YXRpYyBfY2FwdHVyZSh0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdKTogQ29tcG9zaXRpb25MaW5lU3RhdGVbXSB8IG51bGwge1xuXHRcdGNvbnN0IHJlc3VsdDogQ29tcG9zaXRpb25MaW5lU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICE9PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IENvbXBvc2l0aW9uTGluZVN0YXRlKFxuXHRcdFx0XHR0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlciksXG5cdFx0XHRcdGxpbmVOdW1iZXIsXG5cdFx0XHRcdHNlbGVjdGlvbi5zdGFydENvbHVtbiAtIDEsXG5cdFx0XHRcdHNlbGVjdGlvbi5lbmRDb2x1bW4gLSAxXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHRleHRNb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pIHtcblx0XHR0aGlzLl9vcmlnaW5hbCA9IENvbXBvc2l0aW9uU3RhdGUuX2NhcHR1cmUodGV4dE1vZGVsLCBzZWxlY3Rpb25zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBpbnNlcnRlZCB0ZXh0IGR1cmluZyB0aGlzIGNvbXBvc2l0aW9uLlxuXHQgKiBJZiB0aGUgY29tcG9zaXRpb24gcmVzdWx0ZWQgaW4gZXhpc3RpbmcgdGV4dCBiZWluZyBjaGFuZ2VkIChpLmUuIG5vdCBhIHB1cmUgaW5zZXJ0aW9uKSBpdCByZXR1cm5zIG51bGwuXG5cdCAqL1xuXHRkZWR1Y2VPdXRjb21lKHRleHRNb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiBDb21wb3NpdGlvbk91dGNvbWVbXSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fb3JpZ2luYWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50ID0gQ29tcG9zaXRpb25TdGF0ZS5fY2FwdHVyZSh0ZXh0TW9kZWwsIHNlbGVjdGlvbnMpO1xuXHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcmlnaW5hbC5sZW5ndGggIT09IGN1cnJlbnQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBDb21wb3NpdGlvbk91dGNvbWVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9vcmlnaW5hbC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmVzdWx0LnB1c2goQ29tcG9zaXRpb25TdGF0ZS5fZGVkdWNlT3V0Y29tZSh0aGlzLl9vcmlnaW5hbFtpXSwgY3VycmVudFtpXSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RlZHVjZU91dGNvbWUob3JpZ2luYWw6IENvbXBvc2l0aW9uTGluZVN0YXRlLCBjdXJyZW50OiBDb21wb3NpdGlvbkxpbmVTdGF0ZSk6IENvbXBvc2l0aW9uT3V0Y29tZSB7XG5cdFx0Y29uc3QgY29tbW9uUHJlZml4ID0gTWF0aC5taW4oXG5cdFx0XHRvcmlnaW5hbC5zdGFydFNlbGVjdGlvbk9mZnNldCxcblx0XHRcdGN1cnJlbnQuc3RhcnRTZWxlY3Rpb25PZmZzZXQsXG5cdFx0XHRzdHJpbmdzLmNvbW1vblByZWZpeExlbmd0aChvcmlnaW5hbC50ZXh0LCBjdXJyZW50LnRleHQpXG5cdFx0KTtcblx0XHRjb25zdCBjb21tb25TdWZmaXggPSBNYXRoLm1pbihcblx0XHRcdG9yaWdpbmFsLnRleHQubGVuZ3RoIC0gb3JpZ2luYWwuZW5kU2VsZWN0aW9uT2Zmc2V0LFxuXHRcdFx0Y3VycmVudC50ZXh0Lmxlbmd0aCAtIGN1cnJlbnQuZW5kU2VsZWN0aW9uT2Zmc2V0LFxuXHRcdFx0c3RyaW5ncy5jb21tb25TdWZmaXhMZW5ndGgob3JpZ2luYWwudGV4dCwgY3VycmVudC50ZXh0KVxuXHRcdCk7XG5cdFx0Y29uc3QgZGVsZXRlZFRleHQgPSBvcmlnaW5hbC50ZXh0LnN1YnN0cmluZyhjb21tb25QcmVmaXgsIG9yaWdpbmFsLnRleHQubGVuZ3RoIC0gY29tbW9uU3VmZml4KTtcblx0XHRjb25zdCBpbnNlcnRlZFRleHRTdGFydE9mZnNldCA9IGNvbW1vblByZWZpeDtcblx0XHRjb25zdCBpbnNlcnRlZFRleHRFbmRPZmZzZXQgPSBjdXJyZW50LnRleHQubGVuZ3RoIC0gY29tbW9uU3VmZml4O1xuXHRcdGNvbnN0IGluc2VydGVkVGV4dCA9IGN1cnJlbnQudGV4dC5zdWJzdHJpbmcoaW5zZXJ0ZWRUZXh0U3RhcnRPZmZzZXQsIGluc2VydGVkVGV4dEVuZE9mZnNldCk7XG5cdFx0Y29uc3QgaW5zZXJ0ZWRUZXh0UmFuZ2UgPSBuZXcgUmFuZ2UoY3VycmVudC5saW5lTnVtYmVyLCBpbnNlcnRlZFRleHRTdGFydE9mZnNldCArIDEsIGN1cnJlbnQubGluZU51bWJlciwgaW5zZXJ0ZWRUZXh0RW5kT2Zmc2V0ICsgMSk7XG5cdFx0cmV0dXJuIG5ldyBDb21wb3NpdGlvbk91dGNvbWUoXG5cdFx0XHRkZWxldGVkVGV4dCxcblx0XHRcdG9yaWdpbmFsLnN0YXJ0U2VsZWN0aW9uT2Zmc2V0IC0gY29tbW9uUHJlZml4LFxuXHRcdFx0b3JpZ2luYWwuZW5kU2VsZWN0aW9uT2Zmc2V0IC0gY29tbW9uUHJlZml4LFxuXHRcdFx0aW5zZXJ0ZWRUZXh0LFxuXHRcdFx0Y3VycmVudC5zdGFydFNlbGVjdGlvbk9mZnNldCAtIGNvbW1vblByZWZpeCxcblx0XHRcdGN1cnJlbnQuZW5kU2VsZWN0aW9uT2Zmc2V0IC0gY29tbW9uUHJlZml4LFxuXHRcdFx0aW5zZXJ0ZWRUZXh0UmFuZ2Vcblx0XHQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLGFBQWE7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBOEIsYUFBYSxxQkFBcUIseUJBQW9GO0FBQ3BKLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLHNDQUFzQztBQUUvQyxTQUFTLGFBQXFCO0FBQzlCLFNBQXFCLFdBQVcsMEJBQTBCO0FBQzFELFlBQVksa0JBQWtCO0FBQzlCLFNBQXFCLDhCQUFnSTtBQUNySixTQUFTLHVCQUF1QixxQ0FBc0U7QUFDdEcsU0FBUyxvQkFBb0IsNkJBQTZCLG1DQUFtQztBQUM3RixTQUFTLFNBQVMsa0JBQWtCO0FBQ3BDLFNBQVMsK0JBQXlEO0FB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
