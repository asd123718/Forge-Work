import * as types from "../../../base/common/types.js";
import { CursorState, SelectionStartKind, SingleCursorState } from "../cursorCommon.js";
import { MoveOperations } from "./cursorMoveOperations.js";
import { WordOperations } from "./cursorWordOperations.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { TextDirection } from "../model.js";
class CursorMoveCommands {
  static addCursorDown(viewModel, cursors, useLogicalLine) {
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
      if (useLogicalLine) {
        result[resultLen++] = CursorState.fromModelState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel.model, cursor.modelState));
      } else {
        result[resultLen++] = CursorState.fromViewState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel, cursor.viewState));
      }
    }
    return result;
  }
  static addCursorUp(viewModel, cursors, useLogicalLine) {
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
      if (useLogicalLine) {
        result[resultLen++] = CursorState.fromModelState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel.model, cursor.modelState));
      } else {
        result[resultLen++] = CursorState.fromViewState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel, cursor.viewState));
      }
    }
    return result;
  }
  static moveToBeginningOfLine(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = this._moveToLineStart(viewModel, cursor, inSelectionMode);
    }
    return result;
  }
  static _moveToLineStart(viewModel, cursor, inSelectionMode) {
    const currentViewStateColumn = cursor.viewState.position.column;
    const currentModelStateColumn = cursor.modelState.position.column;
    const isFirstLineOfWrappedLine = currentViewStateColumn === currentModelStateColumn;
    const currentViewStatelineNumber = cursor.viewState.position.lineNumber;
    const firstNonBlankColumn = viewModel.getLineFirstNonWhitespaceColumn(currentViewStatelineNumber);
    const isBeginningOfViewLine = currentViewStateColumn === firstNonBlankColumn;
    if (!isFirstLineOfWrappedLine && !isBeginningOfViewLine) {
      return this._moveToLineStartByView(viewModel, cursor, inSelectionMode);
    } else {
      return this._moveToLineStartByModel(viewModel, cursor, inSelectionMode);
    }
  }
  static _moveToLineStartByView(viewModel, cursor, inSelectionMode) {
    return CursorState.fromViewState(
      MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)
    );
  }
  static _moveToLineStartByModel(viewModel, cursor, inSelectionMode) {
    return CursorState.fromModelState(
      MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)
    );
  }
  static moveToEndOfLine(viewModel, cursors, inSelectionMode, sticky) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = this._moveToLineEnd(viewModel, cursor, inSelectionMode, sticky);
    }
    return result;
  }
  static _moveToLineEnd(viewModel, cursor, inSelectionMode, sticky) {
    const viewStatePosition = cursor.viewState.position;
    const viewModelMaxColumn = viewModel.getLineMaxColumn(viewStatePosition.lineNumber);
    const isEndOfViewLine = viewStatePosition.column === viewModelMaxColumn;
    const modelStatePosition = cursor.modelState.position;
    const modelMaxColumn = viewModel.model.getLineMaxColumn(modelStatePosition.lineNumber);
    const isEndLineOfWrappedLine = viewModelMaxColumn - viewStatePosition.column === modelMaxColumn - modelStatePosition.column;
    if (isEndOfViewLine || isEndLineOfWrappedLine) {
      return this._moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky);
    } else {
      return this._moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky);
    }
  }
  static _moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky) {
    return CursorState.fromViewState(
      MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, sticky)
    );
  }
  static _moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky) {
    return CursorState.fromModelState(
      MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, sticky)
    );
  }
  static expandLineSelection(viewModel, cursors) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const startLineNumber = cursor.modelState.selection.startLineNumber;
      const lineCount = viewModel.model.getLineCount();
      let endLineNumber = cursor.modelState.selection.endLineNumber;
      let endColumn;
      if (endLineNumber === lineCount) {
        endColumn = viewModel.model.getLineMaxColumn(lineCount);
      } else {
        endLineNumber++;
        endColumn = 1;
      }
      result[i] = CursorState.fromModelState(new SingleCursorState(
        new Range(startLineNumber, 1, startLineNumber, 1),
        SelectionStartKind.Simple,
        0,
        new Position(endLineNumber, endColumn),
        0
      ));
    }
    return result;
  }
  static moveToBeginningOfBuffer(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveToBeginningOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
    }
    return result;
  }
  static moveToEndOfBuffer(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveToEndOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
    }
    return result;
  }
  static selectAll(viewModel, cursor) {
    const lineCount = viewModel.model.getLineCount();
    const maxColumn = viewModel.model.getLineMaxColumn(lineCount);
    return CursorState.fromModelState(new SingleCursorState(
      new Range(1, 1, 1, 1),
      SelectionStartKind.Simple,
      0,
      new Position(lineCount, maxColumn),
      0
    ));
  }
  static line(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
    const position = viewModel.model.validatePosition(_position);
    const viewPosition = _viewPosition ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position) : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
    if (!inSelectionMode) {
      const lineCount = viewModel.model.getLineCount();
      let selectToLineNumber = position.lineNumber + 1;
      let selectToColumn = 1;
      if (selectToLineNumber > lineCount) {
        selectToLineNumber = lineCount;
        selectToColumn = viewModel.model.getLineMaxColumn(selectToLineNumber);
      }
      return CursorState.fromModelState(new SingleCursorState(
        new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn),
        SelectionStartKind.Line,
        0,
        new Position(selectToLineNumber, selectToColumn),
        0
      ));
    }
    const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;
    if (position.lineNumber < enteringLineNumber) {
      return CursorState.fromViewState(cursor.viewState.move(
        true,
        viewPosition.lineNumber,
        1,
        0
      ));
    } else if (position.lineNumber > enteringLineNumber) {
      const lineCount = viewModel.getLineCount();
      let selectToViewLineNumber = viewPosition.lineNumber + 1;
      let selectToViewColumn = 1;
      if (selectToViewLineNumber > lineCount) {
        selectToViewLineNumber = lineCount;
        selectToViewColumn = viewModel.getLineMaxColumn(selectToViewLineNumber);
      }
      return CursorState.fromViewState(cursor.viewState.move(
        true,
        selectToViewLineNumber,
        selectToViewColumn,
        0
      ));
    } else {
      const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
      return CursorState.fromModelState(cursor.modelState.move(
        true,
        endPositionOfSelectionStart.lineNumber,
        endPositionOfSelectionStart.column,
        0
      ));
    }
  }
  static word(viewModel, cursor, inSelectionMode, _position) {
    const position = viewModel.model.validatePosition(_position);
    return CursorState.fromModelState(WordOperations.word(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, position));
  }
  static cancelSelection(viewModel, cursor) {
    if (!cursor.modelState.hasSelection()) {
      return new CursorState(cursor.modelState, cursor.viewState);
    }
    const lineNumber = cursor.viewState.position.lineNumber;
    const column = cursor.viewState.position.column;
    return CursorState.fromViewState(new SingleCursorState(
      new Range(lineNumber, column, lineNumber, column),
      SelectionStartKind.Simple,
      0,
      new Position(lineNumber, column),
      0
    ));
  }
  static moveTo(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
    if (inSelectionMode) {
      if (cursor.modelState.selectionStartKind === SelectionStartKind.Word) {
        return this.word(viewModel, cursor, inSelectionMode, _position);
      }
      if (cursor.modelState.selectionStartKind === SelectionStartKind.Line) {
        return this.line(viewModel, cursor, inSelectionMode, _position, _viewPosition);
      }
    }
    const position = viewModel.model.validatePosition(_position);
    const viewPosition = _viewPosition ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position) : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
    return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
  }
  static simpleMove(viewModel, cursors, direction, inSelectionMode, value, unit) {
    switch (direction) {
      case CursorMove.Direction.Left: {
        if (unit === CursorMove.Unit.HalfLine) {
          return this._moveHalfLineLeft(viewModel, cursors, inSelectionMode);
        } else {
          return this._moveLeft(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Right: {
        if (unit === CursorMove.Unit.HalfLine) {
          return this._moveHalfLineRight(viewModel, cursors, inSelectionMode);
        } else {
          return this._moveRight(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Up: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return this._moveUpByViewLines(viewModel, cursors, inSelectionMode, value);
        } else if (unit === CursorMove.Unit.FoldedLine) {
          return this._moveUpByFoldedLines(viewModel, cursors, inSelectionMode, value);
        } else {
          return this._moveUpByModelLines(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Down: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return this._moveDownByViewLines(viewModel, cursors, inSelectionMode, value);
        } else if (unit === CursorMove.Unit.FoldedLine) {
          return this._moveDownByFoldedLines(viewModel, cursors, inSelectionMode, value);
        } else {
          return this._moveDownByModelLines(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.PrevBlankLine: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return cursors.map((cursor) => CursorState.fromViewState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
        } else {
          return cursors.map((cursor) => CursorState.fromModelState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
        }
      }
      case CursorMove.Direction.NextBlankLine: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return cursors.map((cursor) => CursorState.fromViewState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
        } else {
          return cursors.map((cursor) => CursorState.fromModelState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
        }
      }
      case CursorMove.Direction.WrappedLineStart: {
        return this._moveToViewMinColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineFirstNonWhitespaceCharacter: {
        return this._moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineColumnCenter: {
        return this._moveToViewCenterColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineEnd: {
        return this._moveToViewMaxColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineLastNonWhitespaceCharacter: {
        return this._moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
      }
      default:
        return null;
    }
  }
  static viewportMove(viewModel, cursors, direction, inSelectionMode, value) {
    const visibleViewRange = viewModel.getCompletelyVisibleViewRange();
    const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
    switch (direction) {
      case CursorMove.Direction.ViewPortTop: {
        const modelLineNumber = this._firstLineNumberInRange(viewModel.model, visibleModelRange, value);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortBottom: {
        const modelLineNumber = this._lastLineNumberInRange(viewModel.model, visibleModelRange, value);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortCenter: {
        const modelLineNumber = Math.round((visibleModelRange.startLineNumber + visibleModelRange.endLineNumber) / 2);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortIfOutside: {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
          const cursor = cursors[i];
          result[i] = this.findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode);
        }
        return result;
      }
      default:
        return null;
    }
  }
  static findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode) {
    const viewLineNumber = cursor.viewState.position.lineNumber;
    if (visibleViewRange.startLineNumber <= viewLineNumber && viewLineNumber <= visibleViewRange.endLineNumber - 1) {
      return new CursorState(cursor.modelState, cursor.viewState);
    } else {
      let newViewLineNumber;
      if (viewLineNumber > visibleViewRange.endLineNumber - 1) {
        newViewLineNumber = visibleViewRange.endLineNumber - 1;
      } else if (viewLineNumber < visibleViewRange.startLineNumber) {
        newViewLineNumber = visibleViewRange.startLineNumber;
      } else {
        newViewLineNumber = viewLineNumber;
      }
      const position = MoveOperations.vertical(viewModel.cursorConfig, viewModel, viewLineNumber, cursor.viewState.position.column, cursor.viewState.leftoverVisibleColumns, newViewLineNumber, false);
      return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, position.lineNumber, position.column, position.leftoverVisibleColumns));
    }
  }
  /**
   * Find the nth line start included in the range (from the start).
   */
  static _firstLineNumberInRange(model, range, count) {
    let startLineNumber = range.startLineNumber;
    if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
      startLineNumber++;
    }
    return Math.min(range.endLineNumber, startLineNumber + count - 1);
  }
  /**
   * Find the nth line start included in the range (from the end).
   */
  static _lastLineNumberInRange(model, range, count) {
    let startLineNumber = range.startLineNumber;
    if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
      startLineNumber++;
    }
    return Math.max(startLineNumber, range.endLineNumber - count + 1);
  }
  static _moveLeft(viewModel, cursors, inSelectionMode, noOfColumns) {
    return cursors.map((cursor) => {
      const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
      const isRtl = direction === TextDirection.RTL;
      return CursorState.fromViewState(
        isRtl ? MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns) : MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
      );
    });
  }
  static _moveHalfLineLeft(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
      result[i] = CursorState.fromViewState(MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
    }
    return result;
  }
  static _moveRight(viewModel, cursors, inSelectionMode, noOfColumns) {
    return cursors.map((cursor) => {
      const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
      const isRtl = direction === TextDirection.RTL;
      return CursorState.fromViewState(
        isRtl ? MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns) : MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
      );
    });
  }
  static _moveHalfLineRight(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
      result[i] = CursorState.fromViewState(MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
    }
    return result;
  }
  static _moveDownByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromViewState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveDownByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveUpByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromViewState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveUpByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveDownByFoldedLines(viewModel, cursors, inSelectionMode, count) {
    const model = viewModel.model;
    const lineCount = model.getLineCount();
    const hiddenAreas = viewModel.getHiddenAreas();
    return cursors.map((cursor) => {
      const startLine = cursor.modelState.hasSelection() && !inSelectionMode ? cursor.modelState.selection.endLineNumber : cursor.modelState.position.lineNumber;
      const targetLine = CursorMoveCommands._targetFoldedDown(startLine, count, hiddenAreas, lineCount);
      const delta = targetLine - startLine;
      if (delta === 0) {
        return CursorState.fromModelState(cursor.modelState);
      }
      return CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
    });
  }
  static _moveUpByFoldedLines(viewModel, cursors, inSelectionMode, count) {
    const model = viewModel.model;
    const hiddenAreas = viewModel.getHiddenAreas();
    return cursors.map((cursor) => {
      const startLine = cursor.modelState.hasSelection() && !inSelectionMode ? cursor.modelState.selection.startLineNumber : cursor.modelState.position.lineNumber;
      const targetLine = CursorMoveCommands._targetFoldedUp(startLine, count, hiddenAreas);
      const delta = startLine - targetLine;
      if (delta === 0) {
        return CursorState.fromModelState(cursor.modelState);
      }
      return CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
    });
  }
  // Compute the target line after moving `count` steps downward from `startLine`,
  // treating each folded region as a single step.
  static _targetFoldedDown(startLine, count, hiddenAreas, lineCount) {
    let line = startLine;
    let i = 0;
    while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < line + 1) {
      i++;
    }
    for (let step = 0; step < count; step++) {
      if (line >= lineCount) {
        return lineCount;
      }
      let candidate = line + 1;
      while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < candidate) {
        i++;
      }
      if (i < hiddenAreas.length && hiddenAreas[i].startLineNumber <= candidate) {
        candidate = hiddenAreas[i].endLineNumber + 1;
      }
      if (candidate > lineCount) {
        return line;
      }
      line = candidate;
    }
    return line;
  }
  // Compute the target line after moving `count` steps upward from `startLine`,
  // treating each folded region as a single step.
  static _targetFoldedUp(startLine, count, hiddenAreas) {
    let line = startLine;
    let i = hiddenAreas.length - 1;
    while (i >= 0 && hiddenAreas[i].startLineNumber > line - 1) {
      i--;
    }
    for (let step = 0; step < count; step++) {
      if (line <= 1) {
        return 1;
      }
      let candidate = line - 1;
      while (i >= 0 && hiddenAreas[i].startLineNumber > candidate) {
        i--;
      }
      if (i >= 0 && hiddenAreas[i].endLineNumber >= candidate) {
        candidate = hiddenAreas[i].startLineNumber - 1;
      }
      if (candidate < 1) {
        return line;
      }
      line = candidate;
    }
    return line;
  }
  static _moveToViewPosition(viewModel, cursor, inSelectionMode, toViewLineNumber, toViewColumn) {
    return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
  }
  static _moveToModelPosition(viewModel, cursor, inSelectionMode, toModelLineNumber, toModelColumn) {
    return CursorState.fromModelState(cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
  }
  static _moveToViewMinColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineMinColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewCenterColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = Math.round((viewModel.getLineMaxColumn(viewLineNumber) + viewModel.getLineMinColumn(viewLineNumber)) / 2);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewMaxColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineMaxColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
}
var CursorMove;
((CursorMove2) => {
  const isCursorMoveArgs = function(arg) {
    if (!types.isObject(arg)) {
      return false;
    }
    const cursorMoveArg = arg;
    if (!types.isString(cursorMoveArg.to)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.select) && !types.isBoolean(cursorMoveArg.select)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.by) && !types.isString(cursorMoveArg.by)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.value) && !types.isNumber(cursorMoveArg.value)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.noHistory) && !types.isBoolean(cursorMoveArg.noHistory)) {
      return false;
    }
    return true;
  };
  CursorMove2.metadata = {
    description: "Move cursor to a logical position in the view",
    args: [
      {
        name: "Cursor move argument object",
        description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory logical position value providing where to move the cursor.
						\`\`\`
						'left', 'right', 'up', 'down', 'prevBlankLine', 'nextBlankLine',
						'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter'
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter'
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine', 'foldedLine'
						\`\`\`
						Use 'foldedLine' with 'up'/'down' to move by logical lines while treating each
						folded region as a single step.
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
					* 'noHistory': If 'true' does not add the movement to navigation history. Default is 'false'.
				`,
        constraint: isCursorMoveArgs,
        schema: {
          "type": "object",
          "required": ["to"],
          "properties": {
            "to": {
              "type": "string",
              "enum": ["left", "right", "up", "down", "prevBlankLine", "nextBlankLine", "wrappedLineStart", "wrappedLineEnd", "wrappedLineColumnCenter", "wrappedLineFirstNonWhitespaceCharacter", "wrappedLineLastNonWhitespaceCharacter", "viewPortTop", "viewPortCenter", "viewPortBottom", "viewPortIfOutside"]
            },
            "by": {
              "type": "string",
              "enum": ["line", "wrappedLine", "character", "halfLine", "foldedLine"]
            },
            "value": {
              "type": "number",
              "default": 1
            },
            "select": {
              "type": "boolean",
              "default": false
            },
            "noHistory": {
              "type": "boolean",
              "default": false
            }
          }
        }
      }
    ]
  };
  CursorMove2.RawDirection = {
    Left: "left",
    Right: "right",
    Up: "up",
    Down: "down",
    PrevBlankLine: "prevBlankLine",
    NextBlankLine: "nextBlankLine",
    WrappedLineStart: "wrappedLineStart",
    WrappedLineFirstNonWhitespaceCharacter: "wrappedLineFirstNonWhitespaceCharacter",
    WrappedLineColumnCenter: "wrappedLineColumnCenter",
    WrappedLineEnd: "wrappedLineEnd",
    WrappedLineLastNonWhitespaceCharacter: "wrappedLineLastNonWhitespaceCharacter",
    ViewPortTop: "viewPortTop",
    ViewPortCenter: "viewPortCenter",
    ViewPortBottom: "viewPortBottom",
    ViewPortIfOutside: "viewPortIfOutside"
  };
  CursorMove2.RawUnit = {
    Line: "line",
    WrappedLine: "wrappedLine",
    Character: "character",
    HalfLine: "halfLine",
    FoldedLine: "foldedLine"
  };
  function parse(args) {
    if (!args.to) {
      return null;
    }
    let direction;
    switch (args.to) {
      case CursorMove2.RawDirection.Left:
        direction = 0 /* Left */;
        break;
      case CursorMove2.RawDirection.Right:
        direction = 1 /* Right */;
        break;
      case CursorMove2.RawDirection.Up:
        direction = 2 /* Up */;
        break;
      case CursorMove2.RawDirection.Down:
        direction = 3 /* Down */;
        break;
      case CursorMove2.RawDirection.PrevBlankLine:
        direction = 4 /* PrevBlankLine */;
        break;
      case CursorMove2.RawDirection.NextBlankLine:
        direction = 5 /* NextBlankLine */;
        break;
      case CursorMove2.RawDirection.WrappedLineStart:
        direction = 6 /* WrappedLineStart */;
        break;
      case CursorMove2.RawDirection.WrappedLineFirstNonWhitespaceCharacter:
        direction = 7 /* WrappedLineFirstNonWhitespaceCharacter */;
        break;
      case CursorMove2.RawDirection.WrappedLineColumnCenter:
        direction = 8 /* WrappedLineColumnCenter */;
        break;
      case CursorMove2.RawDirection.WrappedLineEnd:
        direction = 9 /* WrappedLineEnd */;
        break;
      case CursorMove2.RawDirection.WrappedLineLastNonWhitespaceCharacter:
        direction = 10 /* WrappedLineLastNonWhitespaceCharacter */;
        break;
      case CursorMove2.RawDirection.ViewPortTop:
        direction = 11 /* ViewPortTop */;
        break;
      case CursorMove2.RawDirection.ViewPortBottom:
        direction = 13 /* ViewPortBottom */;
        break;
      case CursorMove2.RawDirection.ViewPortCenter:
        direction = 12 /* ViewPortCenter */;
        break;
      case CursorMove2.RawDirection.ViewPortIfOutside:
        direction = 14 /* ViewPortIfOutside */;
        break;
      default:
        return null;
    }
    let unit = 0 /* None */;
    switch (args.by) {
      case CursorMove2.RawUnit.Line:
        unit = 1 /* Line */;
        break;
      case CursorMove2.RawUnit.WrappedLine:
        unit = 2 /* WrappedLine */;
        break;
      case CursorMove2.RawUnit.Character:
        unit = 3 /* Character */;
        break;
      case CursorMove2.RawUnit.HalfLine:
        unit = 4 /* HalfLine */;
        break;
      case CursorMove2.RawUnit.FoldedLine:
        unit = 5 /* FoldedLine */;
        break;
    }
    return {
      direction,
      unit,
      select: !!args.select,
      value: args.value || 1,
      noHistory: !!args.noHistory
    };
  }
  CursorMove2.parse = parse;
  let Direction;
  ((Direction2) => {
    Direction2[Direction2["Left"] = 0] = "Left";
    Direction2[Direction2["Right"] = 1] = "Right";
    Direction2[Direction2["Up"] = 2] = "Up";
    Direction2[Direction2["Down"] = 3] = "Down";
    Direction2[Direction2["PrevBlankLine"] = 4] = "PrevBlankLine";
    Direction2[Direction2["NextBlankLine"] = 5] = "NextBlankLine";
    Direction2[Direction2["WrappedLineStart"] = 6] = "WrappedLineStart";
    Direction2[Direction2["WrappedLineFirstNonWhitespaceCharacter"] = 7] = "WrappedLineFirstNonWhitespaceCharacter";
    Direction2[Direction2["WrappedLineColumnCenter"] = 8] = "WrappedLineColumnCenter";
    Direction2[Direction2["WrappedLineEnd"] = 9] = "WrappedLineEnd";
    Direction2[Direction2["WrappedLineLastNonWhitespaceCharacter"] = 10] = "WrappedLineLastNonWhitespaceCharacter";
    Direction2[Direction2["ViewPortTop"] = 11] = "ViewPortTop";
    Direction2[Direction2["ViewPortCenter"] = 12] = "ViewPortCenter";
    Direction2[Direction2["ViewPortBottom"] = 13] = "ViewPortBottom";
    Direction2[Direction2["ViewPortIfOutside"] = 14] = "ViewPortIfOutside";
  })(Direction = CursorMove2.Direction || (CursorMove2.Direction = {}));
  let Unit;
  ((Unit2) => {
    Unit2[Unit2["None"] = 0] = "None";
    Unit2[Unit2["Line"] = 1] = "Line";
    Unit2[Unit2["WrappedLine"] = 2] = "WrappedLine";
    Unit2[Unit2["Character"] = 3] = "Character";
    Unit2[Unit2["HalfLine"] = 4] = "HalfLine";
    Unit2[Unit2["FoldedLine"] = 5] = "FoldedLine";
  })(Unit = CursorMove2.Unit || (CursorMove2.Unit = {}));
})(CursorMove || (CursorMove = {}));
export {
  CursorMove,
  CursorMoveCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY3Vyc29yXFxjdXJzb3JNb3ZlQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JTdGF0ZSwgSUN1cnNvclNpbXBsZU1vZGVsLCBQYXJ0aWFsQ3Vyc29yU3RhdGUsIFNlbGVjdGlvblN0YXJ0S2luZCwgU2luZ2xlQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi9jdXJzb3JDb21tb24uanMnO1xuaW1wb3J0IHsgTW92ZU9wZXJhdGlvbnMgfSBmcm9tICcuL2N1cnNvck1vdmVPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IFdvcmRPcGVyYXRpb25zIH0gZnJvbSAnLi9jdXJzb3JXb3JkT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IFRleHREaXJlY3Rpb24gfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JNb3ZlQ29tbWFuZHMge1xuXG5cdHB1YmxpYyBzdGF0aWMgYWRkQ3Vyc29yRG93bih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIHVzZUxvZ2ljYWxMaW5lOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgQ3Vyc29yU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUsIGN1cnNvci52aWV3U3RhdGUpO1xuXHRcdFx0aWYgKHVzZUxvZ2ljYWxMaW5lKSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShNb3ZlT3BlcmF0aW9ucy50cmFuc2xhdGVEb3duKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLnRyYW5zbGF0ZURvd24odmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGFkZEN1cnNvclVwKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgdXNlTG9naWNhbExpbmU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBDdXJzb3JTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZSwgY3Vyc29yLnZpZXdTdGF0ZSk7XG5cdFx0XHRpZiAodXNlTG9naWNhbExpbmUpIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLnRyYW5zbGF0ZVVwKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLnRyYW5zbGF0ZVVwKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlVG9CZWdpbm5pbmdPZkxpbmUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gdGhpcy5fbW92ZVRvTGluZVN0YXJ0KHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvTGluZVN0YXJ0KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRjb25zdCBjdXJyZW50Vmlld1N0YXRlQ29sdW1uID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5jb2x1bW47XG5cdFx0Y29uc3QgY3VycmVudE1vZGVsU3RhdGVDb2x1bW4gPSBjdXJzb3IubW9kZWxTdGF0ZS5wb3NpdGlvbi5jb2x1bW47XG5cdFx0Y29uc3QgaXNGaXJzdExpbmVPZldyYXBwZWRMaW5lID0gY3VycmVudFZpZXdTdGF0ZUNvbHVtbiA9PT0gY3VycmVudE1vZGVsU3RhdGVDb2x1bW47XG5cblx0XHRjb25zdCBjdXJyZW50Vmlld1N0YXRlbGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBmaXJzdE5vbkJsYW5rQ29sdW1uID0gdmlld01vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oY3VycmVudFZpZXdTdGF0ZWxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGlzQmVnaW5uaW5nT2ZWaWV3TGluZSA9IGN1cnJlbnRWaWV3U3RhdGVDb2x1bW4gPT09IGZpcnN0Tm9uQmxhbmtDb2x1bW47XG5cblx0XHRpZiAoIWlzRmlyc3RMaW5lT2ZXcmFwcGVkTGluZSAmJiAhaXNCZWdpbm5pbmdPZlZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvTGluZVN0YXJ0QnlWaWV3KHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvTGluZVN0YXJ0QnlNb2RlbCh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvTGluZVN0YXJ0QnlWaWV3KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShcblx0XHRcdE1vdmVPcGVyYXRpb25zLm1vdmVUb0JlZ2lubmluZ09mTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb0xpbmVTdGFydEJ5TW9kZWwodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShcblx0XHRcdE1vdmVPcGVyYXRpb25zLm1vdmVUb0JlZ2lubmluZ09mTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVRvRW5kT2ZMaW5lKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBzdGlja3k6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gdGhpcy5fbW92ZVRvTGluZUVuZCh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCBzdGlja3kpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvTGluZUVuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgc3RpY2t5OiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRjb25zdCB2aWV3U3RhdGVQb3NpdGlvbiA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb247XG5cdFx0Y29uc3Qgdmlld01vZGVsTWF4Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4odmlld1N0YXRlUG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgaXNFbmRPZlZpZXdMaW5lID0gdmlld1N0YXRlUG9zaXRpb24uY29sdW1uID09PSB2aWV3TW9kZWxNYXhDb2x1bW47XG5cblx0XHRjb25zdCBtb2RlbFN0YXRlUG9zaXRpb24gPSBjdXJzb3IubW9kZWxTdGF0ZS5wb3NpdGlvbjtcblx0XHRjb25zdCBtb2RlbE1heENvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsU3RhdGVQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBpc0VuZExpbmVPZldyYXBwZWRMaW5lID0gdmlld01vZGVsTWF4Q29sdW1uIC0gdmlld1N0YXRlUG9zaXRpb24uY29sdW1uID09PSBtb2RlbE1heENvbHVtbiAtIG1vZGVsU3RhdGVQb3NpdGlvbi5jb2x1bW47XG5cblx0XHRpZiAoaXNFbmRPZlZpZXdMaW5lIHx8IGlzRW5kTGluZU9mV3JhcHBlZExpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9MaW5lRW5kQnlNb2RlbCh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCBzdGlja3kpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvTGluZUVuZEJ5Vmlldyh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCBzdGlja3kpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9MaW5lRW5kQnlWaWV3KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBzdGlja3k6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKFxuXHRcdFx0TW92ZU9wZXJhdGlvbnMubW92ZVRvRW5kT2ZMaW5lKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBzdGlja3kpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9MaW5lRW5kQnlNb2RlbCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgc3RpY2t5OiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoXG5cdFx0XHRNb3ZlT3BlcmF0aW9ucy5tb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBzdGlja3kpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZXhwYW5kTGluZVNlbGVjdGlvbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBjdXJzb3IubW9kZWxTdGF0ZS5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0bGV0IGVuZENvbHVtbjogbnVtYmVyO1xuXHRcdFx0aWYgKGVuZExpbmVOdW1iZXIgPT09IGxpbmVDb3VudCkge1xuXHRcdFx0XHRlbmRDb2x1bW4gPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlcisrO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShuZXcgU2luZ2xlQ3Vyc29yU3RhdGUoXG5cdFx0XHRcdG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIHN0YXJ0TGluZU51bWJlciwgMSksIFNlbGVjdGlvblN0YXJ0S2luZC5TaW1wbGUsIDAsXG5cdFx0XHRcdG5ldyBQb3NpdGlvbihlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLCAwXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVUb0VuZE9mQnVmZmVyKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVUb0VuZE9mQnVmZmVyKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZWxlY3RBbGwodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbWF4Q29sdW1uID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KTtcblxuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShuZXcgU2luZ2xlQ3Vyc29yU3RhdGUoXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIFNlbGVjdGlvblN0YXJ0S2luZC5TaW1wbGUsIDAsXG5cdFx0XHRuZXcgUG9zaXRpb24obGluZUNvdW50LCBtYXhDb2x1bW4pLCAwXG5cdFx0KSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGxpbmUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIF9wb3NpdGlvbjogSVBvc2l0aW9uLCBfdmlld1Bvc2l0aW9uOiBJUG9zaXRpb24gfCB1bmRlZmluZWQpOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdmlld01vZGVsLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24oX3Bvc2l0aW9uKTtcblx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSAoXG5cdFx0XHRfdmlld1Bvc2l0aW9uXG5cdFx0XHRcdD8gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLnZhbGlkYXRlVmlld1Bvc2l0aW9uKG5ldyBQb3NpdGlvbihfdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIF92aWV3UG9zaXRpb24uY29sdW1uKSwgcG9zaXRpb24pXG5cdFx0XHRcdDogdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocG9zaXRpb24pXG5cdFx0KTtcblxuXHRcdGlmICghaW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0XHQvLyBFbnRlcmluZyBsaW5lIHNlbGVjdGlvbiBmb3IgdGhlIGZpcnN0IHRpbWVcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdFx0bGV0IHNlbGVjdFRvTGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0bGV0IHNlbGVjdFRvQ29sdW1uID0gMTtcblx0XHRcdGlmIChzZWxlY3RUb0xpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdFx0c2VsZWN0VG9MaW5lTnVtYmVyID0gbGluZUNvdW50O1xuXHRcdFx0XHRzZWxlY3RUb0NvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdFRvTGluZU51bWJlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShuZXcgU2luZ2xlQ3Vyc29yU3RhdGUoXG5cdFx0XHRcdG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBzZWxlY3RUb0xpbmVOdW1iZXIsIHNlbGVjdFRvQ29sdW1uKSwgU2VsZWN0aW9uU3RhcnRLaW5kLkxpbmUsIDAsXG5cdFx0XHRcdG5ldyBQb3NpdGlvbihzZWxlY3RUb0xpbmVOdW1iZXIsIHNlbGVjdFRvQ29sdW1uKSwgMFxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGludWluZyBsaW5lIHNlbGVjdGlvblxuXHRcdGNvbnN0IGVudGVyaW5nTGluZU51bWJlciA9IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvblN0YXJ0LmdldFN0YXJ0UG9zaXRpb24oKS5saW5lTnVtYmVyO1xuXG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCBlbnRlcmluZ0xpbmVOdW1iZXIpIHtcblxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoY3Vyc29yLnZpZXdTdGF0ZS5tb3ZlKFxuXHRcdFx0XHR0cnVlLCB2aWV3UG9zaXRpb24ubGluZU51bWJlciwgMSwgMFxuXHRcdFx0KSk7XG5cblx0XHR9IGVsc2UgaWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPiBlbnRlcmluZ0xpbmVOdW1iZXIpIHtcblxuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0XHRsZXQgc2VsZWN0VG9WaWV3TGluZU51bWJlciA9IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyICsgMTtcblx0XHRcdGxldCBzZWxlY3RUb1ZpZXdDb2x1bW4gPSAxO1xuXHRcdFx0aWYgKHNlbGVjdFRvVmlld0xpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdFx0c2VsZWN0VG9WaWV3TGluZU51bWJlciA9IGxpbmVDb3VudDtcblx0XHRcdFx0c2VsZWN0VG9WaWV3Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4oc2VsZWN0VG9WaWV3TGluZU51bWJlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKGN1cnNvci52aWV3U3RhdGUubW92ZShcblx0XHRcdFx0dHJ1ZSwgc2VsZWN0VG9WaWV3TGluZU51bWJlciwgc2VsZWN0VG9WaWV3Q29sdW1uLCAwXG5cdFx0XHQpKTtcblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGNvbnN0IGVuZFBvc2l0aW9uT2ZTZWxlY3Rpb25TdGFydCA9IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvblN0YXJ0LmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUubW92ZShcblx0XHRcdFx0dHJ1ZSwgZW5kUG9zaXRpb25PZlNlbGVjdGlvblN0YXJ0LmxpbmVOdW1iZXIsIGVuZFBvc2l0aW9uT2ZTZWxlY3Rpb25TdGFydC5jb2x1bW4sIDBcblx0XHRcdCkpO1xuXG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXRpYyB3b3JkKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBfcG9zaXRpb246IElQb3NpdGlvbik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShXb3JkT3BlcmF0aW9ucy53b3JkKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgcG9zaXRpb24pKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY2FuY2VsU2VsZWN0aW9uKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSk6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0aWYgKCFjdXJzb3IubW9kZWxTdGF0ZS5oYXNTZWxlY3Rpb24oKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBDdXJzb3JTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZSwgY3Vyc29yLnZpZXdTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBjb2x1bW4gPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmNvbHVtbjtcblxuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKG5ldyBTaW5nbGVDdXJzb3JTdGF0ZShcblx0XHRcdG5ldyBSYW5nZShsaW5lTnVtYmVyLCBjb2x1bW4sIGxpbmVOdW1iZXIsIGNvbHVtbiksIFNlbGVjdGlvblN0YXJ0S2luZC5TaW1wbGUsIDAsXG5cdFx0XHRuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKSwgMFxuXHRcdCkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlVG8odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIF9wb3NpdGlvbjogSVBvc2l0aW9uLCBfdmlld1Bvc2l0aW9uOiBJUG9zaXRpb24gfCB1bmRlZmluZWQpOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRcdGlmIChjdXJzb3IubW9kZWxTdGF0ZS5zZWxlY3Rpb25TdGFydEtpbmQgPT09IFNlbGVjdGlvblN0YXJ0S2luZC5Xb3JkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmQodmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgX3Bvc2l0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJzb3IubW9kZWxTdGF0ZS5zZWxlY3Rpb25TdGFydEtpbmQgPT09IFNlbGVjdGlvblN0YXJ0S2luZC5MaW5lKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmxpbmUodmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgX3Bvc2l0aW9uLCBfdmlld1Bvc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IChcblx0XHRcdF92aWV3UG9zaXRpb25cblx0XHRcdFx0PyB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIudmFsaWRhdGVWaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKF92aWV3UG9zaXRpb24ubGluZU51bWJlciwgX3ZpZXdQb3NpdGlvbi5jb2x1bW4pLCBwb3NpdGlvbilcblx0XHRcdFx0OiB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihwb3NpdGlvbilcblx0XHQpO1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKGN1cnNvci52aWV3U3RhdGUubW92ZShpblNlbGVjdGlvbk1vZGUsIHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCB2aWV3UG9zaXRpb24uY29sdW1uLCAwKSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpbXBsZU1vdmUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBkaXJlY3Rpb246IEN1cnNvck1vdmUuU2ltcGxlTW92ZURpcmVjdGlvbiwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCB2YWx1ZTogbnVtYmVyLCB1bml0OiBDdXJzb3JNb3ZlLlVuaXQpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB8IG51bGwge1xuXHRcdHN3aXRjaCAoZGlyZWN0aW9uKSB7XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLkxlZnQ6IHtcblx0XHRcdFx0aWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5IYWxmTGluZSkge1xuXHRcdFx0XHRcdC8vIE1vdmUgbGVmdCBieSBoYWxmIHRoZSBjdXJyZW50IGxpbmUgbGVuZ3RoXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVIYWxmTGluZUxlZnQodmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE1vdmUgbGVmdCBieSBgbW92ZVBhcmFtcy52YWx1ZWAgY29sdW1uc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlTGVmdCh2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLlJpZ2h0OiB7XG5cdFx0XHRcdGlmICh1bml0ID09PSBDdXJzb3JNb3ZlLlVuaXQuSGFsZkxpbmUpIHtcblx0XHRcdFx0XHQvLyBNb3ZlIHJpZ2h0IGJ5IGhhbGYgdGhlIGN1cnJlbnQgbGluZSBsZW5ndGhcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZUhhbGZMaW5lUmlnaHQodmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE1vdmUgcmlnaHQgYnkgYG1vdmVQYXJhbXMudmFsdWVgIGNvbHVtbnNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVJpZ2h0KHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uVXA6IHtcblx0XHRcdFx0aWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5XcmFwcGVkTGluZSkge1xuXHRcdFx0XHRcdC8vIE1vdmUgdXAgYnkgdmlldyBsaW5lc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVXBCeVZpZXdMaW5lcyh2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSwgdmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5Gb2xkZWRMaW5lKSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSB1cCBieSBtb2RlbCBsaW5lcywgc2tpcHBpbmcgb3ZlciBmb2xkZWQgcmVnaW9uc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVXBCeUZvbGRlZExpbmVzKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSB1cCBieSBtb2RlbCBsaW5lc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVXBCeU1vZGVsTGluZXModmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5Eb3duOiB7XG5cdFx0XHRcdGlmICh1bml0ID09PSBDdXJzb3JNb3ZlLlVuaXQuV3JhcHBlZExpbmUpIHtcblx0XHRcdFx0XHQvLyBNb3ZlIGRvd24gYnkgdmlldyBsaW5lc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlRG93bkJ5Vmlld0xpbmVzKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodW5pdCA9PT0gQ3Vyc29yTW92ZS5Vbml0LkZvbGRlZExpbmUpIHtcblx0XHRcdFx0XHQvLyBNb3ZlIGRvd24gYnkgbW9kZWwgbGluZXMsIHNraXBwaW5nIG92ZXIgZm9sZGVkIHJlZ2lvbnNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZURvd25CeUZvbGRlZExpbmVzKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSBkb3duIGJ5IG1vZGVsIGxpbmVzXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVEb3duQnlNb2RlbExpbmVzKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uUHJldkJsYW5rTGluZToge1xuXHRcdFx0XHRpZiAodW5pdCA9PT0gQ3Vyc29yTW92ZS5Vbml0LldyYXBwZWRMaW5lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnNvcnMubWFwKGN1cnNvciA9PiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVUb1ByZXZCbGFua0xpbmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlLCBpblNlbGVjdGlvbk1vZGUpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnNvcnMubWFwKGN1cnNvciA9PiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlVG9QcmV2QmxhbmtMaW5lKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5OZXh0QmxhbmtMaW5lOiB7XG5cdFx0XHRcdGlmICh1bml0ID09PSBDdXJzb3JNb3ZlLlVuaXQuV3JhcHBlZExpbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVRvTmV4dEJsYW5rTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVUb05leHRCbGFua0xpbmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLldyYXBwZWRMaW5lU3RhcnQ6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvVmlld01pbkNvbHVtbih2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLldyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gdGhlIGZpcnN0IG5vbi13aGl0ZXNwYWNlIGNvbHVtbiBvZiB0aGUgY3VycmVudCB2aWV3IGxpbmVcblx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVUb1ZpZXdGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4odmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5XcmFwcGVkTGluZUNvbHVtbkNlbnRlcjoge1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBcImNlbnRlclwiIG9mIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvVmlld0NlbnRlckNvbHVtbih2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLldyYXBwZWRMaW5lRW5kOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCB2aWV3IGxpbmVcblx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVUb1ZpZXdNYXhDb2x1bW4odmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5XcmFwcGVkTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gdGhlIGxhc3Qgbm9uLXdoaXRlc3BhY2UgY29sdW1uIG9mIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvVmlld0xhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlKTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHR9XG5cblx0cHVibGljIHN0YXRpYyB2aWV3cG9ydE1vdmUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBkaXJlY3Rpb246IEN1cnNvck1vdmUuVmlld3BvcnREaXJlY3Rpb24sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgdmFsdWU6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHwgbnVsbCB7XG5cdFx0Y29uc3QgdmlzaWJsZVZpZXdSYW5nZSA9IHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSgpO1xuXHRcdGNvbnN0IHZpc2libGVNb2RlbFJhbmdlID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2UodmlzaWJsZVZpZXdSYW5nZSk7XG5cdFx0c3dpdGNoIChkaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uVmlld1BvcnRUb3A6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgbnRoIGxpbmUgc3RhcnQgaW4gdGhlIHZpZXdwb3J0IChmcm9tIHRoZSB0b3ApXG5cdFx0XHRcdGNvbnN0IG1vZGVsTGluZU51bWJlciA9IHRoaXMuX2ZpcnN0TGluZU51bWJlckluUmFuZ2Uodmlld01vZGVsLm1vZGVsLCB2aXNpYmxlTW9kZWxSYW5nZSwgdmFsdWUpO1xuXHRcdFx0XHRjb25zdCBtb2RlbENvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKG1vZGVsTGluZU51bWJlcik7XG5cdFx0XHRcdHJldHVybiBbdGhpcy5fbW92ZVRvTW9kZWxQb3NpdGlvbih2aWV3TW9kZWwsIGN1cnNvcnNbMF0sIGluU2VsZWN0aW9uTW9kZSwgbW9kZWxMaW5lTnVtYmVyLCBtb2RlbENvbHVtbildO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5WaWV3UG9ydEJvdHRvbToge1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBudGggbGluZSBzdGFydCBpbiB0aGUgdmlld3BvcnQgKGZyb20gdGhlIGJvdHRvbSlcblx0XHRcdFx0Y29uc3QgbW9kZWxMaW5lTnVtYmVyID0gdGhpcy5fbGFzdExpbmVOdW1iZXJJblJhbmdlKHZpZXdNb2RlbC5tb2RlbCwgdmlzaWJsZU1vZGVsUmFuZ2UsIHZhbHVlKTtcblx0XHRcdFx0Y29uc3QgbW9kZWxDb2x1bW4gPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihtb2RlbExpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXR1cm4gW3RoaXMuX21vdmVUb01vZGVsUG9zaXRpb24odmlld01vZGVsLCBjdXJzb3JzWzBdLCBpblNlbGVjdGlvbk1vZGUsIG1vZGVsTGluZU51bWJlciwgbW9kZWxDb2x1bW4pXTtcblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uVmlld1BvcnRDZW50ZXI6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgbGluZSBzdGFydCBpbiB0aGUgdmlld3BvcnQgY2VudGVyXG5cdFx0XHRcdGNvbnN0IG1vZGVsTGluZU51bWJlciA9IE1hdGgucm91bmQoKHZpc2libGVNb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlciArIHZpc2libGVNb2RlbFJhbmdlLmVuZExpbmVOdW1iZXIpIC8gMik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsQ29sdW1uID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obW9kZWxMaW5lTnVtYmVyKTtcblx0XHRcdFx0cmV0dXJuIFt0aGlzLl9tb3ZlVG9Nb2RlbFBvc2l0aW9uKHZpZXdNb2RlbCwgY3Vyc29yc1swXSwgaW5TZWxlY3Rpb25Nb2RlLCBtb2RlbExpbmVOdW1iZXIsIG1vZGVsQ29sdW1uKV07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLlZpZXdQb3J0SWZPdXRzaWRlOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gYSBwb3NpdGlvbiBpbnNpZGUgdGhlIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0XHRcdHJlc3VsdFtpXSA9IHRoaXMuZmluZFBvc2l0aW9uSW5WaWV3cG9ydElmT3V0c2lkZSh2aWV3TW9kZWwsIGN1cnNvciwgdmlzaWJsZVZpZXdSYW5nZSwgaW5TZWxlY3Rpb25Nb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmaW5kUG9zaXRpb25JblZpZXdwb3J0SWZPdXRzaWRlKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgdmlzaWJsZVZpZXdSYW5nZTogUmFuZ2UsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cblx0XHRpZiAodmlzaWJsZVZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gdmlld0xpbmVOdW1iZXIgJiYgdmlld0xpbmVOdW1iZXIgPD0gdmlzaWJsZVZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0Ly8gTm90aGluZyB0byBkbywgY3Vyc29yIGlzIGluIHZpZXdwb3J0XG5cdFx0XHRyZXR1cm4gbmV3IEN1cnNvclN0YXRlKGN1cnNvci5tb2RlbFN0YXRlLCBjdXJzb3Iudmlld1N0YXRlKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgbmV3Vmlld0xpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGlmICh2aWV3TGluZU51bWJlciA+IHZpc2libGVWaWV3UmFuZ2UuZW5kTGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0bmV3Vmlld0xpbmVOdW1iZXIgPSB2aXNpYmxlVmlld1JhbmdlLmVuZExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0fSBlbHNlIGlmICh2aWV3TGluZU51bWJlciA8IHZpc2libGVWaWV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdG5ld1ZpZXdMaW5lTnVtYmVyID0gdmlzaWJsZVZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdWaWV3TGluZU51bWJlciA9IHZpZXdMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBNb3ZlT3BlcmF0aW9ucy52ZXJ0aWNhbCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIHZpZXdMaW5lTnVtYmVyLCBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmNvbHVtbiwgY3Vyc29yLnZpZXdTdGF0ZS5sZWZ0b3ZlclZpc2libGVDb2x1bW5zLCBuZXdWaWV3TGluZU51bWJlciwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoY3Vyc29yLnZpZXdTdGF0ZS5tb3ZlKGluU2VsZWN0aW9uTW9kZSwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5sZWZ0b3ZlclZpc2libGVDb2x1bW5zKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIG50aCBsaW5lIHN0YXJ0IGluY2x1ZGVkIGluIHRoZSByYW5nZSAoZnJvbSB0aGUgc3RhcnQpLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpcnN0TGluZU51bWJlckluUmFuZ2UobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcmFuZ2U6IFJhbmdlLCBjb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGlmIChyYW5nZS5zdGFydENvbHVtbiAhPT0gbW9kZWwuZ2V0TGluZU1pbkNvbHVtbihzdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHQvLyBNb3ZlIG9uIHRvIHRoZSBzZWNvbmQgbGluZSBpZiB0aGUgZmlyc3QgbGluZSBzdGFydCBpcyBub3QgaW5jbHVkZWQgaW4gdGhlIHJhbmdlXG5cdFx0XHRzdGFydExpbmVOdW1iZXIrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gTWF0aC5taW4ocmFuZ2UuZW5kTGluZU51bWJlciwgc3RhcnRMaW5lTnVtYmVyICsgY291bnQgLSAxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBudGggbGluZSBzdGFydCBpbmNsdWRlZCBpbiB0aGUgcmFuZ2UgKGZyb20gdGhlIGVuZCkuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfbGFzdExpbmVOdW1iZXJJblJhbmdlKG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHJhbmdlOiBSYW5nZSwgY291bnQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRpZiAocmFuZ2Uuc3RhcnRDb2x1bW4gIT09IG1vZGVsLmdldExpbmVNaW5Db2x1bW4oc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0Ly8gTW92ZSBvbiB0byB0aGUgc2Vjb25kIGxpbmUgaWYgdGhlIGZpcnN0IGxpbmUgc3RhcnQgaXMgbm90IGluY2x1ZGVkIGluIHRoZSByYW5nZVxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hdGgubWF4KHN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlciAtIGNvdW50ICsgMSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZUxlZnQodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIG5vT2ZDb2x1bW5zOiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0cmV0dXJuIGN1cnNvcnMubWFwKGN1cnNvciA9PiB7XG5cdFx0XHRjb25zdCBkaXJlY3Rpb24gPSB2aWV3TW9kZWwuZ2V0VGV4dERpcmVjdGlvbihjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgaXNSdGwgPSBkaXJlY3Rpb24gPT09IFRleHREaXJlY3Rpb24uUlRMO1xuXG5cdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShcblx0XHRcdFx0aXNSdGxcblx0XHRcdFx0XHQ/IE1vdmVPcGVyYXRpb25zLm1vdmVSaWdodCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbm9PZkNvbHVtbnMpXG5cdFx0XHRcdFx0OiBNb3ZlT3BlcmF0aW9ucy5tb3ZlTGVmdCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbm9PZkNvbHVtbnMpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVIYWxmTGluZUxlZnQodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBoYWxmTGluZSA9IE1hdGgucm91bmQodmlld01vZGVsLmdldExpbmVMZW5ndGgodmlld0xpbmVOdW1iZXIpIC8gMik7XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVMZWZ0KHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBoYWxmTGluZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVSaWdodCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgbm9PZkNvbHVtbnM6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IHtcblx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IHZpZXdNb2RlbC5nZXRUZXh0RGlyZWN0aW9uKGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBpc1J0bCA9IGRpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKFxuXHRcdFx0XHRpc1J0bFxuXHRcdFx0XHRcdD8gTW92ZU9wZXJhdGlvbnMubW92ZUxlZnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlLCBpblNlbGVjdGlvbk1vZGUsIG5vT2ZDb2x1bW5zKVxuXHRcdFx0XHRcdDogTW92ZU9wZXJhdGlvbnMubW92ZVJpZ2h0KHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBub09mQ29sdW1ucylcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZUhhbGZMaW5lUmlnaHQodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBoYWxmTGluZSA9IE1hdGgucm91bmQodmlld01vZGVsLmdldExpbmVMZW5ndGgodmlld0xpbmVOdW1iZXIpIC8gMik7XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVSaWdodCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgaGFsZkxpbmUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlRG93bkJ5Vmlld0xpbmVzKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBsaW5lc0NvdW50OiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlRG93bih2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbGluZXNDb3VudCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVEb3duQnlNb2RlbExpbmVzKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBsaW5lc0NvdW50OiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZURvd24odmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBsaW5lc0NvdW50KSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVVwQnlWaWV3TGluZXModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIGxpbmVzQ291bnQ6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVVcCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbGluZXNDb3VudCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVVcEJ5TW9kZWxMaW5lcyh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgbGluZXNDb3VudDogbnVtYmVyKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVVcCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUsIGxpbmVzQ291bnQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlRG93bkJ5Rm9sZGVkTGluZXModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIGNvdW50OiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgaGlkZGVuQXJlYXMgPSB2aWV3TW9kZWwuZ2V0SGlkZGVuQXJlYXMoKTtcblxuXHRcdHJldHVybiBjdXJzb3JzLm1hcChjdXJzb3IgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lID0gY3Vyc29yLm1vZGVsU3RhdGUuaGFzU2VsZWN0aW9uKCkgJiYgIWluU2VsZWN0aW9uTW9kZVxuXHRcdFx0XHQ/IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyXG5cdFx0XHRcdDogY3Vyc29yLm1vZGVsU3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblxuXHRcdFx0Y29uc3QgdGFyZ2V0TGluZSA9IEN1cnNvck1vdmVDb21tYW5kcy5fdGFyZ2V0Rm9sZGVkRG93bihzdGFydExpbmUsIGNvdW50LCBoaWRkZW5BcmVhcywgbGluZUNvdW50KTtcblx0XHRcdGNvbnN0IGRlbHRhID0gdGFyZ2V0TGluZSAtIHN0YXJ0TGluZTtcblx0XHRcdGlmIChkZWx0YSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVEb3duKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIG1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBkZWx0YSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVVcEJ5Rm9sZGVkTGluZXModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIGNvdW50OiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cdFx0Y29uc3QgaGlkZGVuQXJlYXMgPSB2aWV3TW9kZWwuZ2V0SGlkZGVuQXJlYXMoKTtcblxuXHRcdHJldHVybiBjdXJzb3JzLm1hcChjdXJzb3IgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lID0gY3Vyc29yLm1vZGVsU3RhdGUuaGFzU2VsZWN0aW9uKCkgJiYgIWluU2VsZWN0aW9uTW9kZVxuXHRcdFx0XHQ/IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXJcblx0XHRcdFx0OiBjdXJzb3IubW9kZWxTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXG5cdFx0XHRjb25zdCB0YXJnZXRMaW5lID0gQ3Vyc29yTW92ZUNvbW1hbmRzLl90YXJnZXRGb2xkZWRVcChzdGFydExpbmUsIGNvdW50LCBoaWRkZW5BcmVhcyk7XG5cdFx0XHRjb25zdCBkZWx0YSA9IHN0YXJ0TGluZSAtIHRhcmdldExpbmU7XG5cdFx0XHRpZiAoZGVsdGEgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKGN1cnNvci5tb2RlbFN0YXRlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlVXAodmlld01vZGVsLmN1cnNvckNvbmZpZywgbW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUsIGRlbHRhKSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBDb21wdXRlIHRoZSB0YXJnZXQgbGluZSBhZnRlciBtb3ZpbmcgYGNvdW50YCBzdGVwcyBkb3dud2FyZCBmcm9tIGBzdGFydExpbmVgLFxuXHQvLyB0cmVhdGluZyBlYWNoIGZvbGRlZCByZWdpb24gYXMgYSBzaW5nbGUgc3RlcC5cblx0cHJpdmF0ZSBzdGF0aWMgX3RhcmdldEZvbGRlZERvd24oc3RhcnRMaW5lOiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGhpZGRlbkFyZWFzOiBSYW5nZVtdLCBsaW5lQ291bnQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxpbmUgPSBzdGFydExpbmU7XG5cdFx0bGV0IGkgPSAwO1xuXG5cdFx0d2hpbGUgKGkgPCBoaWRkZW5BcmVhcy5sZW5ndGggJiYgaGlkZGVuQXJlYXNbaV0uZW5kTGluZU51bWJlciA8IGxpbmUgKyAxKSB7XG5cdFx0XHRpKys7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCBjb3VudDsgc3RlcCsrKSB7XG5cdFx0XHRpZiAobGluZSA+PSBsaW5lQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVDb3VudDtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNhbmRpZGF0ZSA9IGxpbmUgKyAxO1xuXHRcdFx0d2hpbGUgKGkgPCBoaWRkZW5BcmVhcy5sZW5ndGggJiYgaGlkZGVuQXJlYXNbaV0uZW5kTGluZU51bWJlciA8IGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRpKys7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpIDwgaGlkZGVuQXJlYXMubGVuZ3RoICYmIGhpZGRlbkFyZWFzW2ldLnN0YXJ0TGluZU51bWJlciA8PSBjYW5kaWRhdGUpIHtcblx0XHRcdFx0Y2FuZGlkYXRlID0gaGlkZGVuQXJlYXNbaV0uZW5kTGluZU51bWJlciArIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjYW5kaWRhdGUgPiBsaW5lQ291bnQpIHtcblx0XHRcdFx0Ly8gVGhlIG5leHQgdmlzaWJsZSBsaW5lIGRvZXMgbm90IGV4aXN0IChlLmcuIGEgZm9sZCByZWFjaGVzIEVPRikuXG5cdFx0XHRcdHJldHVybiBsaW5lO1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lID0gY2FuZGlkYXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lO1xuXHR9XG5cblx0Ly8gQ29tcHV0ZSB0aGUgdGFyZ2V0IGxpbmUgYWZ0ZXIgbW92aW5nIGBjb3VudGAgc3RlcHMgdXB3YXJkIGZyb20gYHN0YXJ0TGluZWAsXG5cdC8vIHRyZWF0aW5nIGVhY2ggZm9sZGVkIHJlZ2lvbiBhcyBhIHNpbmdsZSBzdGVwLlxuXHRwcml2YXRlIHN0YXRpYyBfdGFyZ2V0Rm9sZGVkVXAoc3RhcnRMaW5lOiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGhpZGRlbkFyZWFzOiBSYW5nZVtdKTogbnVtYmVyIHtcblx0XHRsZXQgbGluZSA9IHN0YXJ0TGluZTtcblx0XHRsZXQgaSA9IGhpZGRlbkFyZWFzLmxlbmd0aCAtIDE7XG5cblx0XHR3aGlsZSAoaSA+PSAwICYmIGhpZGRlbkFyZWFzW2ldLnN0YXJ0TGluZU51bWJlciA+IGxpbmUgLSAxKSB7XG5cdFx0XHRpLS07XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCBjb3VudDsgc3RlcCsrKSB7XG5cdFx0XHRpZiAobGluZSA8PSAxKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2FuZGlkYXRlID0gbGluZSAtIDE7XG5cdFx0XHR3aGlsZSAoaSA+PSAwICYmIGhpZGRlbkFyZWFzW2ldLnN0YXJ0TGluZU51bWJlciA+IGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRpLS07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpID49IDAgJiYgaGlkZGVuQXJlYXNbaV0uZW5kTGluZU51bWJlciA+PSBjYW5kaWRhdGUpIHtcblx0XHRcdFx0Y2FuZGlkYXRlID0gaGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhbmRpZGF0ZSA8IDEpIHtcblx0XHRcdFx0Ly8gVGhlIHByZXZpb3VzIHZpc2libGUgbGluZSBkb2VzIG5vdCBleGlzdCAoZS5nLiBhIGZvbGQgcmVhY2hlcyBCT0YpLlxuXHRcdFx0XHRyZXR1cm4gbGluZTtcblx0XHRcdH1cblxuXHRcdFx0bGluZSA9IGNhbmRpZGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9WaWV3UG9zaXRpb24odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHRvVmlld0xpbmVOdW1iZXI6IG51bWJlciwgdG9WaWV3Q29sdW1uOiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKGN1cnNvci52aWV3U3RhdGUubW92ZShpblNlbGVjdGlvbk1vZGUsIHRvVmlld0xpbmVOdW1iZXIsIHRvVmlld0NvbHVtbiwgMCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb01vZGVsUG9zaXRpb24odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHRvTW9kZWxMaW5lTnVtYmVyOiBudW1iZXIsIHRvTW9kZWxDb2x1bW46IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKGN1cnNvci5tb2RlbFN0YXRlLm1vdmUoaW5TZWxlY3Rpb25Nb2RlLCB0b01vZGVsTGluZU51bWJlciwgdG9Nb2RlbENvbHVtbiwgMCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb1ZpZXdNaW5Db2x1bW4odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB2aWV3Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVNaW5Db2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHRcdFx0cmVzdWx0W2ldID0gdGhpcy5fbW92ZVRvVmlld1Bvc2l0aW9uKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHZpZXdMaW5lTnVtYmVyLCB2aWV3Q29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9WaWV3Rmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdGNvbnN0IHZpZXdMaW5lTnVtYmVyID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgdmlld0NvbHVtbiA9IHZpZXdNb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRcdHJlc3VsdFtpXSA9IHRoaXMuX21vdmVUb1ZpZXdQb3NpdGlvbih2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCB2aWV3TGluZU51bWJlciwgdmlld0NvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvVmlld0NlbnRlckNvbHVtbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHZpZXdDb2x1bW4gPSBNYXRoLnJvdW5kKCh2aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbih2aWV3TGluZU51bWJlcikgKyB2aWV3TW9kZWwuZ2V0TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcikpIC8gMik7XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9WaWV3UG9zaXRpb24odmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgdmlld0xpbmVOdW1iZXIsIHZpZXdDb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb1ZpZXdNYXhDb2x1bW4odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB2aWV3Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHRcdFx0cmVzdWx0W2ldID0gdGhpcy5fbW92ZVRvVmlld1Bvc2l0aW9uKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHZpZXdMaW5lTnVtYmVyLCB2aWV3Q29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9WaWV3TGFzdE5vbldoaXRlc3BhY2VDb2x1bW4odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB2aWV3Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbih2aWV3TGluZU51bWJlcik7XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9WaWV3UG9zaXRpb24odmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgdmlld0xpbmVOdW1iZXIsIHZpZXdDb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ3Vyc29yTW92ZSB7XG5cblx0Y29uc3QgaXNDdXJzb3JNb3ZlQXJncyA9IGZ1bmN0aW9uIChhcmc6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KGFyZykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJzb3JNb3ZlQXJnOiBSYXdBcmd1bWVudHMgPSBhcmcgYXMgUmF3QXJndW1lbnRzO1xuXG5cdFx0aWYgKCF0eXBlcy5pc1N0cmluZyhjdXJzb3JNb3ZlQXJnLnRvKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoY3Vyc29yTW92ZUFyZy5zZWxlY3QpICYmICF0eXBlcy5pc0Jvb2xlYW4oY3Vyc29yTW92ZUFyZy5zZWxlY3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChjdXJzb3JNb3ZlQXJnLmJ5KSAmJiAhdHlwZXMuaXNTdHJpbmcoY3Vyc29yTW92ZUFyZy5ieSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKGN1cnNvck1vdmVBcmcudmFsdWUpICYmICF0eXBlcy5pc051bWJlcihjdXJzb3JNb3ZlQXJnLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoY3Vyc29yTW92ZUFyZy5ub0hpc3RvcnkpICYmICF0eXBlcy5pc0Jvb2xlYW4oY3Vyc29yTW92ZUFyZy5ub0hpc3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IG1ldGFkYXRhOiBJQ29tbWFuZE1ldGFkYXRhID0ge1xuXHRcdGRlc2NyaXB0aW9uOiAnTW92ZSBjdXJzb3IgdG8gYSBsb2dpY2FsIHBvc2l0aW9uIGluIHRoZSB2aWV3Jyxcblx0XHRhcmdzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdDdXJzb3IgbW92ZSBhcmd1bWVudCBvYmplY3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYFByb3BlcnR5LXZhbHVlIHBhaXJzIHRoYXQgY2FuIGJlIHBhc3NlZCB0aHJvdWdoIHRoaXMgYXJndW1lbnQ6XG5cdFx0XHRcdFx0KiAndG8nOiBBIG1hbmRhdG9yeSBsb2dpY2FsIHBvc2l0aW9uIHZhbHVlIHByb3ZpZGluZyB3aGVyZSB0byBtb3ZlIHRoZSBjdXJzb3IuXG5cdFx0XHRcdFx0XHRcXGBcXGBcXGBcblx0XHRcdFx0XHRcdCdsZWZ0JywgJ3JpZ2h0JywgJ3VwJywgJ2Rvd24nLCAncHJldkJsYW5rTGluZScsICduZXh0QmxhbmtMaW5lJyxcblx0XHRcdFx0XHRcdCd3cmFwcGVkTGluZVN0YXJ0JywgJ3dyYXBwZWRMaW5lRW5kJywgJ3dyYXBwZWRMaW5lQ29sdW1uQ2VudGVyJ1xuXHRcdFx0XHRcdFx0J3dyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyJywgJ3dyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXInXG5cdFx0XHRcdFx0XHQndmlld1BvcnRUb3AnLCAndmlld1BvcnRDZW50ZXInLCAndmlld1BvcnRCb3R0b20nLCAndmlld1BvcnRJZk91dHNpZGUnXG5cdFx0XHRcdFx0XHRcXGBcXGBcXGBcblx0XHRcdFx0XHQqICdieSc6IFVuaXQgdG8gbW92ZS4gRGVmYXVsdCBpcyBjb21wdXRlZCBiYXNlZCBvbiAndG8nIHZhbHVlLlxuXHRcdFx0XHRcdFx0XFxgXFxgXFxgXG5cdFx0XHRcdFx0XHQnbGluZScsICd3cmFwcGVkTGluZScsICdjaGFyYWN0ZXInLCAnaGFsZkxpbmUnLCAnZm9sZGVkTGluZSdcblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRcdFx0VXNlICdmb2xkZWRMaW5lJyB3aXRoICd1cCcvJ2Rvd24nIHRvIG1vdmUgYnkgbG9naWNhbCBsaW5lcyB3aGlsZSB0cmVhdGluZyBlYWNoXG5cdFx0XHRcdFx0XHRmb2xkZWQgcmVnaW9uIGFzIGEgc2luZ2xlIHN0ZXAuXG5cdFx0XHRcdFx0KiAndmFsdWUnOiBOdW1iZXIgb2YgdW5pdHMgdG8gbW92ZS4gRGVmYXVsdCBpcyAnMScuXG5cdFx0XHRcdFx0KiAnc2VsZWN0JzogSWYgJ3RydWUnIG1ha2VzIHRoZSBzZWxlY3Rpb24uIERlZmF1bHQgaXMgJ2ZhbHNlJy5cblx0XHRcdFx0XHQqICdub0hpc3RvcnknOiBJZiAndHJ1ZScgZG9lcyBub3QgYWRkIHRoZSBtb3ZlbWVudCB0byBuYXZpZ2F0aW9uIGhpc3RvcnkuIERlZmF1bHQgaXMgJ2ZhbHNlJy5cblx0XHRcdFx0YCxcblx0XHRcdFx0Y29uc3RyYWludDogaXNDdXJzb3JNb3ZlQXJncyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncmVxdWlyZWQnOiBbJ3RvJ10sXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQndG8nOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdCdlbnVtJzogWydsZWZ0JywgJ3JpZ2h0JywgJ3VwJywgJ2Rvd24nLCAncHJldkJsYW5rTGluZScsICduZXh0QmxhbmtMaW5lJywgJ3dyYXBwZWRMaW5lU3RhcnQnLCAnd3JhcHBlZExpbmVFbmQnLCAnd3JhcHBlZExpbmVDb2x1bW5DZW50ZXInLCAnd3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXInLCAnd3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlcicsICd2aWV3UG9ydFRvcCcsICd2aWV3UG9ydENlbnRlcicsICd2aWV3UG9ydEJvdHRvbScsICd2aWV3UG9ydElmT3V0c2lkZSddXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2J5Jzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHQnZW51bSc6IFsnbGluZScsICd3cmFwcGVkTGluZScsICdjaGFyYWN0ZXInLCAnaGFsZkxpbmUnLCAnZm9sZGVkTGluZSddXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J3ZhbHVlJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IDFcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnc2VsZWN0Jzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdub0hpc3RvcnknOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9O1xuXG5cdC8qKlxuXHQgKiBQb3NpdGlvbnMgaW4gdGhlIHZpZXcgZm9yIGN1cnNvciBtb3ZlIGNvbW1hbmQuXG5cdCAqL1xuXHRleHBvcnQgY29uc3QgUmF3RGlyZWN0aW9uID0ge1xuXHRcdExlZnQ6ICdsZWZ0Jyxcblx0XHRSaWdodDogJ3JpZ2h0Jyxcblx0XHRVcDogJ3VwJyxcblx0XHREb3duOiAnZG93bicsXG5cblx0XHRQcmV2QmxhbmtMaW5lOiAncHJldkJsYW5rTGluZScsXG5cdFx0TmV4dEJsYW5rTGluZTogJ25leHRCbGFua0xpbmUnLFxuXG5cdFx0V3JhcHBlZExpbmVTdGFydDogJ3dyYXBwZWRMaW5lU3RhcnQnLFxuXHRcdFdyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyOiAnd3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXInLFxuXHRcdFdyYXBwZWRMaW5lQ29sdW1uQ2VudGVyOiAnd3JhcHBlZExpbmVDb2x1bW5DZW50ZXInLFxuXHRcdFdyYXBwZWRMaW5lRW5kOiAnd3JhcHBlZExpbmVFbmQnLFxuXHRcdFdyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6ICd3cmFwcGVkTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyJyxcblxuXHRcdFZpZXdQb3J0VG9wOiAndmlld1BvcnRUb3AnLFxuXHRcdFZpZXdQb3J0Q2VudGVyOiAndmlld1BvcnRDZW50ZXInLFxuXHRcdFZpZXdQb3J0Qm90dG9tOiAndmlld1BvcnRCb3R0b20nLFxuXG5cdFx0Vmlld1BvcnRJZk91dHNpZGU6ICd2aWV3UG9ydElmT3V0c2lkZSdcblx0fTtcblxuXHQvKipcblx0ICogVW5pdHMgZm9yIEN1cnNvciBtb3ZlICdieScgYXJndW1lbnRcblx0ICovXG5cdGV4cG9ydCBjb25zdCBSYXdVbml0ID0ge1xuXHRcdExpbmU6ICdsaW5lJyxcblx0XHRXcmFwcGVkTGluZTogJ3dyYXBwZWRMaW5lJyxcblx0XHRDaGFyYWN0ZXI6ICdjaGFyYWN0ZXInLFxuXHRcdEhhbGZMaW5lOiAnaGFsZkxpbmUnLFxuXHRcdEZvbGRlZExpbmU6ICdmb2xkZWRMaW5lJ1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBBcmd1bWVudHMgZm9yIEN1cnNvciBtb3ZlIGNvbW1hbmRcblx0ICovXG5cdGV4cG9ydCBpbnRlcmZhY2UgUmF3QXJndW1lbnRzIHtcblx0XHR0bzogc3RyaW5nO1xuXHRcdHNlbGVjdD86IGJvb2xlYW47XG5cdFx0Ynk/OiBzdHJpbmc7XG5cdFx0dmFsdWU/OiBudW1iZXI7XG5cdFx0bm9IaXN0b3J5PzogYm9vbGVhbjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwYXJzZShhcmdzOiBQYXJ0aWFsPFJhd0FyZ3VtZW50cz4pOiBQYXJzZWRBcmd1bWVudHMgfCBudWxsIHtcblx0XHRpZiAoIWFyZ3MudG8pIHtcblx0XHRcdC8vIGlsbGVnYWwgYXJndW1lbnRzXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgZGlyZWN0aW9uOiBEaXJlY3Rpb247XG5cdFx0c3dpdGNoIChhcmdzLnRvKSB7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5MZWZ0OlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uTGVmdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5SaWdodDpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlJpZ2h0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLlVwOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uVXA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uRG93bjpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLkRvd247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uUHJldkJsYW5rTGluZTpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlByZXZCbGFua0xpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uTmV4dEJsYW5rTGluZTpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLk5leHRCbGFua0xpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVTdGFydDpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLldyYXBwZWRMaW5lU3RhcnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5XcmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZUNvbHVtbkNlbnRlcjpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLldyYXBwZWRMaW5lQ29sdW1uQ2VudGVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lRW5kOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uV3JhcHBlZExpbmVFbmQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcjpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLldyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uVmlld1BvcnRUb3A6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5WaWV3UG9ydFRvcDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5WaWV3UG9ydEJvdHRvbTpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlZpZXdQb3J0Qm90dG9tO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLlZpZXdQb3J0Q2VudGVyOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uVmlld1BvcnRDZW50ZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uVmlld1BvcnRJZk91dHNpZGU6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5WaWV3UG9ydElmT3V0c2lkZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHQvLyBpbGxlZ2FsIGFyZ3VtZW50c1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgdW5pdCA9IFVuaXQuTm9uZTtcblx0XHRzd2l0Y2ggKGFyZ3MuYnkpIHtcblx0XHRcdGNhc2UgUmF3VW5pdC5MaW5lOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5MaW5lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3VW5pdC5XcmFwcGVkTGluZTpcblx0XHRcdFx0dW5pdCA9IFVuaXQuV3JhcHBlZExpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdVbml0LkNoYXJhY3Rlcjpcblx0XHRcdFx0dW5pdCA9IFVuaXQuQ2hhcmFjdGVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3VW5pdC5IYWxmTGluZTpcblx0XHRcdFx0dW5pdCA9IFVuaXQuSGFsZkxpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdVbml0LkZvbGRlZExpbmU6XG5cdFx0XHRcdHVuaXQgPSBVbml0LkZvbGRlZExpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXJlY3Rpb246IGRpcmVjdGlvbixcblx0XHRcdHVuaXQ6IHVuaXQsXG5cdFx0XHRzZWxlY3Q6ICghIWFyZ3Muc2VsZWN0KSxcblx0XHRcdHZhbHVlOiAoYXJncy52YWx1ZSB8fCAxKSxcblx0XHRcdG5vSGlzdG9yeTogKCEhYXJncy5ub0hpc3RvcnkpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgUGFyc2VkQXJndW1lbnRzIHtcblx0XHRkaXJlY3Rpb246IERpcmVjdGlvbjtcblx0XHR1bml0OiBVbml0O1xuXHRcdHNlbGVjdDogYm9vbGVhbjtcblx0XHR2YWx1ZTogbnVtYmVyO1xuXHRcdG5vSGlzdG9yeTogYm9vbGVhbjtcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgU2ltcGxlTW92ZUFyZ3VtZW50cyB7XG5cdFx0ZGlyZWN0aW9uOiBTaW1wbGVNb3ZlRGlyZWN0aW9uO1xuXHRcdHVuaXQ6IFVuaXQ7XG5cdFx0c2VsZWN0OiBib29sZWFuO1xuXHRcdHZhbHVlOiBudW1iZXI7XG5cdH1cblxuXHRleHBvcnQgY29uc3QgZW51bSBEaXJlY3Rpb24ge1xuXHRcdExlZnQsXG5cdFx0UmlnaHQsXG5cdFx0VXAsXG5cdFx0RG93bixcblx0XHRQcmV2QmxhbmtMaW5lLFxuXHRcdE5leHRCbGFua0xpbmUsXG5cblx0XHRXcmFwcGVkTGluZVN0YXJ0LFxuXHRcdFdyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyLFxuXHRcdFdyYXBwZWRMaW5lQ29sdW1uQ2VudGVyLFxuXHRcdFdyYXBwZWRMaW5lRW5kLFxuXHRcdFdyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIsXG5cblx0XHRWaWV3UG9ydFRvcCxcblx0XHRWaWV3UG9ydENlbnRlcixcblx0XHRWaWV3UG9ydEJvdHRvbSxcblxuXHRcdFZpZXdQb3J0SWZPdXRzaWRlLFxuXHR9XG5cblx0ZXhwb3J0IHR5cGUgU2ltcGxlTW92ZURpcmVjdGlvbiA9IChcblx0XHREaXJlY3Rpb24uTGVmdFxuXHRcdHwgRGlyZWN0aW9uLlJpZ2h0XG5cdFx0fCBEaXJlY3Rpb24uVXBcblx0XHR8IERpcmVjdGlvbi5Eb3duXG5cdFx0fCBEaXJlY3Rpb24uUHJldkJsYW5rTGluZVxuXHRcdHwgRGlyZWN0aW9uLk5leHRCbGFua0xpbmVcblx0XHR8IERpcmVjdGlvbi5XcmFwcGVkTGluZVN0YXJ0XG5cdFx0fCBEaXJlY3Rpb24uV3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXJcblx0XHR8IERpcmVjdGlvbi5XcmFwcGVkTGluZUNvbHVtbkNlbnRlclxuXHRcdHwgRGlyZWN0aW9uLldyYXBwZWRMaW5lRW5kXG5cdFx0fCBEaXJlY3Rpb24uV3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlclxuXHQpO1xuXG5cdGV4cG9ydCB0eXBlIFZpZXdwb3J0RGlyZWN0aW9uID0gKFxuXHRcdERpcmVjdGlvbi5WaWV3UG9ydFRvcFxuXHRcdHwgRGlyZWN0aW9uLlZpZXdQb3J0Q2VudGVyXG5cdFx0fCBEaXJlY3Rpb24uVmlld1BvcnRCb3R0b21cblx0XHR8IERpcmVjdGlvbi5WaWV3UG9ydElmT3V0c2lkZVxuXHQpO1xuXG5cdGV4cG9ydCBjb25zdCBlbnVtIFVuaXQge1xuXHRcdE5vbmUsXG5cdFx0TGluZSxcblx0XHRXcmFwcGVkTGluZSxcblx0XHRDaGFyYWN0ZXIsXG5cdFx0SGFsZkxpbmUsXG5cdFx0Rm9sZGVkTGluZSxcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFdBQVc7QUFDdkIsU0FBUyxhQUFxRCxvQkFBb0IseUJBQXlCO0FBQzNHLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFTLGFBQWE7QUFHdEIsU0FBUyxxQkFBcUI7QUFFdkIsTUFBTSxtQkFBbUI7QUFBQSxFQUUvQixPQUFjLGNBQWMsV0FBdUIsU0FBd0IsZ0JBQStDO0FBQ3pILFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxRQUFJLFlBQVk7QUFDaEIsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixhQUFPLFdBQVcsSUFBSSxJQUFJLFlBQVksT0FBTyxZQUFZLE9BQU8sU0FBUztBQUN6RSxVQUFJLGdCQUFnQjtBQUNuQixlQUFPLFdBQVcsSUFBSSxZQUFZLGVBQWUsZUFBZSxjQUFjLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxVQUFVLENBQUM7QUFBQSxNQUMxSSxPQUFPO0FBQ04sZUFBTyxXQUFXLElBQUksWUFBWSxjQUFjLGVBQWUsY0FBYyxVQUFVLGNBQWMsV0FBVyxPQUFPLFNBQVMsQ0FBQztBQUFBLE1BQ2xJO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFjLFlBQVksV0FBdUIsU0FBd0IsZ0JBQStDO0FBQ3ZILFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxRQUFJLFlBQVk7QUFDaEIsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixhQUFPLFdBQVcsSUFBSSxJQUFJLFlBQVksT0FBTyxZQUFZLE9BQU8sU0FBUztBQUN6RSxVQUFJLGdCQUFnQjtBQUNuQixlQUFPLFdBQVcsSUFBSSxZQUFZLGVBQWUsZUFBZSxZQUFZLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxVQUFVLENBQUM7QUFBQSxNQUN4SSxPQUFPO0FBQ04sZUFBTyxXQUFXLElBQUksWUFBWSxjQUFjLGVBQWUsWUFBWSxVQUFVLGNBQWMsV0FBVyxPQUFPLFNBQVMsQ0FBQztBQUFBLE1BQ2hJO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFjLHNCQUFzQixXQUF1QixTQUF3QixpQkFBZ0Q7QUFDbEksVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsYUFBTyxDQUFDLElBQUksS0FBSyxpQkFBaUIsV0FBVyxRQUFRLGVBQWU7QUFBQSxJQUNyRTtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFlLGlCQUFpQixXQUF1QixRQUFxQixpQkFBOEM7QUFDekgsVUFBTSx5QkFBeUIsT0FBTyxVQUFVLFNBQVM7QUFDekQsVUFBTSwwQkFBMEIsT0FBTyxXQUFXLFNBQVM7QUFDM0QsVUFBTSwyQkFBMkIsMkJBQTJCO0FBRTVELFVBQU0sNkJBQTZCLE9BQU8sVUFBVSxTQUFTO0FBQzdELFVBQU0sc0JBQXNCLFVBQVUsZ0NBQWdDLDBCQUEwQjtBQUNoRyxVQUFNLHdCQUF3QiwyQkFBMkI7QUFFekQsUUFBSSxDQUFDLDRCQUE0QixDQUFDLHVCQUF1QjtBQUN4RCxhQUFPLEtBQUssdUJBQXVCLFdBQVcsUUFBUSxlQUFlO0FBQUEsSUFDdEUsT0FBTztBQUNOLGFBQU8sS0FBSyx3QkFBd0IsV0FBVyxRQUFRLGVBQWU7QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWUsdUJBQXVCLFdBQXVCLFFBQXFCLGlCQUE4QztBQUMvSCxXQUFPLFlBQVk7QUFBQSxNQUNsQixlQUFlLHNCQUFzQixVQUFVLGNBQWMsV0FBVyxPQUFPLFdBQVcsZUFBZTtBQUFBLElBQzFHO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBZSx3QkFBd0IsV0FBdUIsUUFBcUIsaUJBQThDO0FBQ2hJLFdBQU8sWUFBWTtBQUFBLE1BQ2xCLGVBQWUsc0JBQXNCLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxZQUFZLGVBQWU7QUFBQSxJQUNqSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWMsZ0JBQWdCLFdBQXVCLFNBQXdCLGlCQUEwQixRQUF1QztBQUM3SSxVQUFNLFNBQStCLENBQUM7QUFDdEMsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixhQUFPLENBQUMsSUFBSSxLQUFLLGVBQWUsV0FBVyxRQUFRLGlCQUFpQixNQUFNO0FBQUEsSUFDM0U7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxlQUFlLFdBQXVCLFFBQXFCLGlCQUEwQixRQUFxQztBQUN4SSxVQUFNLG9CQUFvQixPQUFPLFVBQVU7QUFDM0MsVUFBTSxxQkFBcUIsVUFBVSxpQkFBaUIsa0JBQWtCLFVBQVU7QUFDbEYsVUFBTSxrQkFBa0Isa0JBQWtCLFdBQVc7QUFFckQsVUFBTSxxQkFBcUIsT0FBTyxXQUFXO0FBQzdDLFVBQU0saUJBQWlCLFVBQVUsTUFBTSxpQkFBaUIsbUJBQW1CLFVBQVU7QUFDckYsVUFBTSx5QkFBeUIscUJBQXFCLGtCQUFrQixXQUFXLGlCQUFpQixtQkFBbUI7QUFFckgsUUFBSSxtQkFBbUIsd0JBQXdCO0FBQzlDLGFBQU8sS0FBSyxzQkFBc0IsV0FBVyxRQUFRLGlCQUFpQixNQUFNO0FBQUEsSUFDN0UsT0FBTztBQUNOLGFBQU8sS0FBSyxxQkFBcUIsV0FBVyxRQUFRLGlCQUFpQixNQUFNO0FBQUEsSUFDNUU7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFlLHFCQUFxQixXQUF1QixRQUFxQixpQkFBMEIsUUFBcUM7QUFDOUksV0FBTyxZQUFZO0FBQUEsTUFDbEIsZUFBZSxnQkFBZ0IsVUFBVSxjQUFjLFdBQVcsT0FBTyxXQUFXLGlCQUFpQixNQUFNO0FBQUEsSUFDNUc7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFlLHNCQUFzQixXQUF1QixRQUFxQixpQkFBMEIsUUFBcUM7QUFDL0ksV0FBTyxZQUFZO0FBQUEsTUFDbEIsZUFBZSxnQkFBZ0IsVUFBVSxjQUFjLFVBQVUsT0FBTyxPQUFPLFlBQVksaUJBQWlCLE1BQU07QUFBQSxJQUNuSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWMsb0JBQW9CLFdBQXVCLFNBQThDO0FBQ3RHLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBRXhCLFlBQU0sa0JBQWtCLE9BQU8sV0FBVyxVQUFVO0FBQ3BELFlBQU0sWUFBWSxVQUFVLE1BQU0sYUFBYTtBQUUvQyxVQUFJLGdCQUFnQixPQUFPLFdBQVcsVUFBVTtBQUNoRCxVQUFJO0FBQ0osVUFBSSxrQkFBa0IsV0FBVztBQUNoQyxvQkFBWSxVQUFVLE1BQU0saUJBQWlCLFNBQVM7QUFBQSxNQUN2RCxPQUFPO0FBQ047QUFDQSxvQkFBWTtBQUFBLE1BQ2I7QUFFQSxhQUFPLENBQUMsSUFBSSxZQUFZLGVBQWUsSUFBSTtBQUFBLFFBQzFDLElBQUksTUFBTSxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQztBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFBUTtBQUFBLFFBQzlFLElBQUksU0FBUyxlQUFlLFNBQVM7QUFBQSxRQUFHO0FBQUEsTUFDekMsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBYyx3QkFBd0IsV0FBdUIsU0FBd0IsaUJBQWdEO0FBQ3BJLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLGFBQU8sQ0FBQyxJQUFJLFlBQVksZUFBZSxlQUFlLHdCQUF3QixVQUFVLGNBQWMsVUFBVSxPQUFPLE9BQU8sWUFBWSxlQUFlLENBQUM7QUFBQSxJQUMzSjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFjLGtCQUFrQixXQUF1QixTQUF3QixpQkFBZ0Q7QUFDOUgsVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsYUFBTyxDQUFDLElBQUksWUFBWSxlQUFlLGVBQWUsa0JBQWtCLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxZQUFZLGVBQWUsQ0FBQztBQUFBLElBQ3JKO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWMsVUFBVSxXQUF1QixRQUF5QztBQUN2RixVQUFNLFlBQVksVUFBVSxNQUFNLGFBQWE7QUFDL0MsVUFBTSxZQUFZLFVBQVUsTUFBTSxpQkFBaUIsU0FBUztBQUU1RCxXQUFPLFlBQVksZUFBZSxJQUFJO0FBQUEsTUFDckMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUFHLG1CQUFtQjtBQUFBLE1BQVE7QUFBQSxNQUNsRCxJQUFJLFNBQVMsV0FBVyxTQUFTO0FBQUEsTUFBRztBQUFBLElBQ3JDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFjLEtBQUssV0FBdUIsUUFBcUIsaUJBQTBCLFdBQXNCLGVBQTBEO0FBQ3hLLFVBQU0sV0FBVyxVQUFVLE1BQU0saUJBQWlCLFNBQVM7QUFDM0QsVUFBTSxlQUNMLGdCQUNHLFVBQVUscUJBQXFCLHFCQUFxQixJQUFJLFNBQVMsY0FBYyxZQUFZLGNBQWMsTUFBTSxHQUFHLFFBQVEsSUFDMUgsVUFBVSxxQkFBcUIsbUNBQW1DLFFBQVE7QUFHOUUsUUFBSSxDQUFDLGlCQUFpQjtBQUVyQixZQUFNLFlBQVksVUFBVSxNQUFNLGFBQWE7QUFFL0MsVUFBSSxxQkFBcUIsU0FBUyxhQUFhO0FBQy9DLFVBQUksaUJBQWlCO0FBQ3JCLFVBQUkscUJBQXFCLFdBQVc7QUFDbkMsNkJBQXFCO0FBQ3JCLHlCQUFpQixVQUFVLE1BQU0saUJBQWlCLGtCQUFrQjtBQUFBLE1BQ3JFO0FBRUEsYUFBTyxZQUFZLGVBQWUsSUFBSTtBQUFBLFFBQ3JDLElBQUksTUFBTSxTQUFTLFlBQVksR0FBRyxvQkFBb0IsY0FBYztBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFBTTtBQUFBLFFBQ2hHLElBQUksU0FBUyxvQkFBb0IsY0FBYztBQUFBLFFBQUc7QUFBQSxNQUNuRCxDQUFDO0FBQUEsSUFDRjtBQUdBLFVBQU0scUJBQXFCLE9BQU8sV0FBVyxlQUFlLGlCQUFpQixFQUFFO0FBRS9FLFFBQUksU0FBUyxhQUFhLG9CQUFvQjtBQUU3QyxhQUFPLFlBQVksY0FBYyxPQUFPLFVBQVU7QUFBQSxRQUNqRDtBQUFBLFFBQU0sYUFBYTtBQUFBLFFBQVk7QUFBQSxRQUFHO0FBQUEsTUFDbkMsQ0FBQztBQUFBLElBRUYsV0FBVyxTQUFTLGFBQWEsb0JBQW9CO0FBRXBELFlBQU0sWUFBWSxVQUFVLGFBQWE7QUFFekMsVUFBSSx5QkFBeUIsYUFBYSxhQUFhO0FBQ3ZELFVBQUkscUJBQXFCO0FBQ3pCLFVBQUkseUJBQXlCLFdBQVc7QUFDdkMsaUNBQXlCO0FBQ3pCLDZCQUFxQixVQUFVLGlCQUFpQixzQkFBc0I7QUFBQSxNQUN2RTtBQUVBLGFBQU8sWUFBWSxjQUFjLE9BQU8sVUFBVTtBQUFBLFFBQ2pEO0FBQUEsUUFBTTtBQUFBLFFBQXdCO0FBQUEsUUFBb0I7QUFBQSxNQUNuRCxDQUFDO0FBQUEsSUFFRixPQUFPO0FBRU4sWUFBTSw4QkFBOEIsT0FBTyxXQUFXLGVBQWUsZUFBZTtBQUNwRixhQUFPLFlBQVksZUFBZSxPQUFPLFdBQVc7QUFBQSxRQUNuRDtBQUFBLFFBQU0sNEJBQTRCO0FBQUEsUUFBWSw0QkFBNEI7QUFBQSxRQUFRO0FBQUEsTUFDbkYsQ0FBQztBQUFBLElBRUY7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFjLEtBQUssV0FBdUIsUUFBcUIsaUJBQTBCLFdBQTBDO0FBQ2xJLFVBQU0sV0FBVyxVQUFVLE1BQU0saUJBQWlCLFNBQVM7QUFDM0QsV0FBTyxZQUFZLGVBQWUsZUFBZSxLQUFLLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxZQUFZLGlCQUFpQixRQUFRLENBQUM7QUFBQSxFQUM3STtBQUFBLEVBRUEsT0FBYyxnQkFBZ0IsV0FBdUIsUUFBeUM7QUFDN0YsUUFBSSxDQUFDLE9BQU8sV0FBVyxhQUFhLEdBQUc7QUFDdEMsYUFBTyxJQUFJLFlBQVksT0FBTyxZQUFZLE9BQU8sU0FBUztBQUFBLElBQzNEO0FBRUEsVUFBTSxhQUFhLE9BQU8sVUFBVSxTQUFTO0FBQzdDLFVBQU0sU0FBUyxPQUFPLFVBQVUsU0FBUztBQUV6QyxXQUFPLFlBQVksY0FBYyxJQUFJO0FBQUEsTUFDcEMsSUFBSSxNQUFNLFlBQVksUUFBUSxZQUFZLE1BQU07QUFBQSxNQUFHLG1CQUFtQjtBQUFBLE1BQVE7QUFBQSxNQUM5RSxJQUFJLFNBQVMsWUFBWSxNQUFNO0FBQUEsTUFBRztBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFjLE9BQU8sV0FBdUIsUUFBcUIsaUJBQTBCLFdBQXNCLGVBQTBEO0FBQzFLLFFBQUksaUJBQWlCO0FBQ3BCLFVBQUksT0FBTyxXQUFXLHVCQUF1QixtQkFBbUIsTUFBTTtBQUNyRSxlQUFPLEtBQUssS0FBSyxXQUFXLFFBQVEsaUJBQWlCLFNBQVM7QUFBQSxNQUMvRDtBQUNBLFVBQUksT0FBTyxXQUFXLHVCQUF1QixtQkFBbUIsTUFBTTtBQUNyRSxlQUFPLEtBQUssS0FBSyxXQUFXLFFBQVEsaUJBQWlCLFdBQVcsYUFBYTtBQUFBLE1BQzlFO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxVQUFVLE1BQU0saUJBQWlCLFNBQVM7QUFDM0QsVUFBTSxlQUNMLGdCQUNHLFVBQVUscUJBQXFCLHFCQUFxQixJQUFJLFNBQVMsY0FBYyxZQUFZLGNBQWMsTUFBTSxHQUFHLFFBQVEsSUFDMUgsVUFBVSxxQkFBcUIsbUNBQW1DLFFBQVE7QUFFOUUsV0FBTyxZQUFZLGNBQWMsT0FBTyxVQUFVLEtBQUssaUJBQWlCLGFBQWEsWUFBWSxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDekg7QUFBQSxFQUVBLE9BQWMsV0FBVyxXQUF1QixTQUF3QixXQUEyQyxpQkFBMEIsT0FBZSxNQUFvRDtBQUMvTSxZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLLFdBQVcsVUFBVSxNQUFNO0FBQy9CLFlBQUksU0FBUyxXQUFXLEtBQUssVUFBVTtBQUV0QyxpQkFBTyxLQUFLLGtCQUFrQixXQUFXLFNBQVMsZUFBZTtBQUFBLFFBQ2xFLE9BQU87QUFFTixpQkFBTyxLQUFLLFVBQVUsV0FBVyxTQUFTLGlCQUFpQixLQUFLO0FBQUEsUUFDakU7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFdBQVcsVUFBVSxPQUFPO0FBQ2hDLFlBQUksU0FBUyxXQUFXLEtBQUssVUFBVTtBQUV0QyxpQkFBTyxLQUFLLG1CQUFtQixXQUFXLFNBQVMsZUFBZTtBQUFBLFFBQ25FLE9BQU87QUFFTixpQkFBTyxLQUFLLFdBQVcsV0FBVyxTQUFTLGlCQUFpQixLQUFLO0FBQUEsUUFDbEU7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFdBQVcsVUFBVSxJQUFJO0FBQzdCLFlBQUksU0FBUyxXQUFXLEtBQUssYUFBYTtBQUV6QyxpQkFBTyxLQUFLLG1CQUFtQixXQUFXLFNBQVMsaUJBQWlCLEtBQUs7QUFBQSxRQUMxRSxXQUFXLFNBQVMsV0FBVyxLQUFLLFlBQVk7QUFFL0MsaUJBQU8sS0FBSyxxQkFBcUIsV0FBVyxTQUFTLGlCQUFpQixLQUFLO0FBQUEsUUFDNUUsT0FBTztBQUVOLGlCQUFPLEtBQUssb0JBQW9CLFdBQVcsU0FBUyxpQkFBaUIsS0FBSztBQUFBLFFBQzNFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsTUFBTTtBQUMvQixZQUFJLFNBQVMsV0FBVyxLQUFLLGFBQWE7QUFFekMsaUJBQU8sS0FBSyxxQkFBcUIsV0FBVyxTQUFTLGlCQUFpQixLQUFLO0FBQUEsUUFDNUUsV0FBVyxTQUFTLFdBQVcsS0FBSyxZQUFZO0FBRS9DLGlCQUFPLEtBQUssdUJBQXVCLFdBQVcsU0FBUyxpQkFBaUIsS0FBSztBQUFBLFFBQzlFLE9BQU87QUFFTixpQkFBTyxLQUFLLHNCQUFzQixXQUFXLFNBQVMsaUJBQWlCLEtBQUs7QUFBQSxRQUM3RTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssV0FBVyxVQUFVLGVBQWU7QUFDeEMsWUFBSSxTQUFTLFdBQVcsS0FBSyxhQUFhO0FBQ3pDLGlCQUFPLFFBQVEsSUFBSSxZQUFVLFlBQVksY0FBYyxlQUFlLG9CQUFvQixVQUFVLGNBQWMsV0FBVyxPQUFPLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFBQSxRQUNqSyxPQUFPO0FBQ04saUJBQU8sUUFBUSxJQUFJLFlBQVUsWUFBWSxlQUFlLGVBQWUsb0JBQW9CLFVBQVUsY0FBYyxVQUFVLE9BQU8sT0FBTyxZQUFZLGVBQWUsQ0FBQyxDQUFDO0FBQUEsUUFDeks7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFdBQVcsVUFBVSxlQUFlO0FBQ3hDLFlBQUksU0FBUyxXQUFXLEtBQUssYUFBYTtBQUN6QyxpQkFBTyxRQUFRLElBQUksWUFBVSxZQUFZLGNBQWMsZUFBZSxvQkFBb0IsVUFBVSxjQUFjLFdBQVcsT0FBTyxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBQUEsUUFDakssT0FBTztBQUNOLGlCQUFPLFFBQVEsSUFBSSxZQUFVLFlBQVksZUFBZSxlQUFlLG9CQUFvQixVQUFVLGNBQWMsVUFBVSxPQUFPLE9BQU8sWUFBWSxlQUFlLENBQUMsQ0FBQztBQUFBLFFBQ3pLO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsa0JBQWtCO0FBRTNDLGVBQU8sS0FBSyxxQkFBcUIsV0FBVyxTQUFTLGVBQWU7QUFBQSxNQUNyRTtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsd0NBQXdDO0FBRWpFLGVBQU8sS0FBSyxvQ0FBb0MsV0FBVyxTQUFTLGVBQWU7QUFBQSxNQUNwRjtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUseUJBQXlCO0FBRWxELGVBQU8sS0FBSyx3QkFBd0IsV0FBVyxTQUFTLGVBQWU7QUFBQSxNQUN4RTtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsZ0JBQWdCO0FBRXpDLGVBQU8sS0FBSyxxQkFBcUIsV0FBVyxTQUFTLGVBQWU7QUFBQSxNQUNyRTtBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsdUNBQXVDO0FBRWhFLGVBQU8sS0FBSyxtQ0FBbUMsV0FBVyxTQUFTLGVBQWU7QUFBQSxNQUNuRjtBQUFBLE1BQ0E7QUFDQyxlQUFPO0FBQUEsSUFDVDtBQUFBLEVBRUQ7QUFBQSxFQUVBLE9BQWMsYUFBYSxXQUF1QixTQUF3QixXQUF5QyxpQkFBMEIsT0FBNEM7QUFDeEwsVUFBTSxtQkFBbUIsVUFBVSw4QkFBOEI7QUFDakUsVUFBTSxvQkFBb0IsVUFBVSxxQkFBcUIsNkJBQTZCLGdCQUFnQjtBQUN0RyxZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLLFdBQVcsVUFBVSxhQUFhO0FBRXRDLGNBQU0sa0JBQWtCLEtBQUssd0JBQXdCLFVBQVUsT0FBTyxtQkFBbUIsS0FBSztBQUM5RixjQUFNLGNBQWMsVUFBVSxNQUFNLGdDQUFnQyxlQUFlO0FBQ25GLGVBQU8sQ0FBQyxLQUFLLHFCQUFxQixXQUFXLFFBQVEsQ0FBQyxHQUFHLGlCQUFpQixpQkFBaUIsV0FBVyxDQUFDO0FBQUEsTUFDeEc7QUFBQSxNQUNBLEtBQUssV0FBVyxVQUFVLGdCQUFnQjtBQUV6QyxjQUFNLGtCQUFrQixLQUFLLHVCQUF1QixVQUFVLE9BQU8sbUJBQW1CLEtBQUs7QUFDN0YsY0FBTSxjQUFjLFVBQVUsTUFBTSxnQ0FBZ0MsZUFBZTtBQUNuRixlQUFPLENBQUMsS0FBSyxxQkFBcUIsV0FBVyxRQUFRLENBQUMsR0FBRyxpQkFBaUIsaUJBQWlCLFdBQVcsQ0FBQztBQUFBLE1BQ3hHO0FBQUEsTUFDQSxLQUFLLFdBQVcsVUFBVSxnQkFBZ0I7QUFFekMsY0FBTSxrQkFBa0IsS0FBSyxPQUFPLGtCQUFrQixrQkFBa0Isa0JBQWtCLGlCQUFpQixDQUFDO0FBQzVHLGNBQU0sY0FBYyxVQUFVLE1BQU0sZ0NBQWdDLGVBQWU7QUFDbkYsZUFBTyxDQUFDLEtBQUsscUJBQXFCLFdBQVcsUUFBUSxDQUFDLEdBQUcsaUJBQWlCLGlCQUFpQixXQUFXLENBQUM7QUFBQSxNQUN4RztBQUFBLE1BQ0EsS0FBSyxXQUFXLFVBQVUsbUJBQW1CO0FBRTVDLGNBQU0sU0FBK0IsQ0FBQztBQUN0QyxpQkFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsZ0JBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsaUJBQU8sQ0FBQyxJQUFJLEtBQUssZ0NBQWdDLFdBQVcsUUFBUSxrQkFBa0IsZUFBZTtBQUFBLFFBQ3RHO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFjLGdDQUFnQyxXQUF1QixRQUFxQixrQkFBeUIsaUJBQThDO0FBQ2hLLFVBQU0saUJBQWlCLE9BQU8sVUFBVSxTQUFTO0FBRWpELFFBQUksaUJBQWlCLG1CQUFtQixrQkFBa0Isa0JBQWtCLGlCQUFpQixnQkFBZ0IsR0FBRztBQUUvRyxhQUFPLElBQUksWUFBWSxPQUFPLFlBQVksT0FBTyxTQUFTO0FBQUEsSUFFM0QsT0FBTztBQUNOLFVBQUk7QUFDSixVQUFJLGlCQUFpQixpQkFBaUIsZ0JBQWdCLEdBQUc7QUFDeEQsNEJBQW9CLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUN0RCxXQUFXLGlCQUFpQixpQkFBaUIsaUJBQWlCO0FBQzdELDRCQUFvQixpQkFBaUI7QUFBQSxNQUN0QyxPQUFPO0FBQ04sNEJBQW9CO0FBQUEsTUFDckI7QUFDQSxZQUFNLFdBQVcsZUFBZSxTQUFTLFVBQVUsY0FBYyxXQUFXLGdCQUFnQixPQUFPLFVBQVUsU0FBUyxRQUFRLE9BQU8sVUFBVSx3QkFBd0IsbUJBQW1CLEtBQUs7QUFDL0wsYUFBTyxZQUFZLGNBQWMsT0FBTyxVQUFVLEtBQUssaUJBQWlCLFNBQVMsWUFBWSxTQUFTLFFBQVEsU0FBUyxzQkFBc0IsQ0FBQztBQUFBLElBQy9JO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBZSx3QkFBd0IsT0FBMkIsT0FBYyxPQUF1QjtBQUN0RyxRQUFJLGtCQUFrQixNQUFNO0FBQzVCLFFBQUksTUFBTSxnQkFBZ0IsTUFBTSxpQkFBaUIsZUFBZSxHQUFHO0FBRWxFO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyxJQUFJLE1BQU0sZUFBZSxrQkFBa0IsUUFBUSxDQUFDO0FBQUEsRUFDakU7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWUsdUJBQXVCLE9BQTJCLE9BQWMsT0FBdUI7QUFDckcsUUFBSSxrQkFBa0IsTUFBTTtBQUM1QixRQUFJLE1BQU0sZ0JBQWdCLE1BQU0saUJBQWlCLGVBQWUsR0FBRztBQUVsRTtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUssSUFBSSxpQkFBaUIsTUFBTSxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVBLE9BQWUsVUFBVSxXQUF1QixTQUF3QixpQkFBMEIsYUFBMkM7QUFDNUksV0FBTyxRQUFRLElBQUksWUFBVTtBQUM1QixZQUFNLFlBQVksVUFBVSxpQkFBaUIsT0FBTyxVQUFVLFNBQVMsVUFBVTtBQUNqRixZQUFNLFFBQVEsY0FBYyxjQUFjO0FBRTFDLGFBQU8sWUFBWTtBQUFBLFFBQ2xCLFFBQ0csZUFBZSxVQUFVLFVBQVUsY0FBYyxXQUFXLE9BQU8sV0FBVyxpQkFBaUIsV0FBVyxJQUMxRyxlQUFlLFNBQVMsVUFBVSxjQUFjLFdBQVcsT0FBTyxXQUFXLGlCQUFpQixXQUFXO0FBQUEsTUFDN0c7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFlLGtCQUFrQixXQUF1QixTQUF3QixpQkFBZ0Q7QUFDL0gsVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsWUFBTSxpQkFBaUIsT0FBTyxVQUFVLFNBQVM7QUFDakQsWUFBTSxXQUFXLEtBQUssTUFBTSxVQUFVLGNBQWMsY0FBYyxJQUFJLENBQUM7QUFDdkUsYUFBTyxDQUFDLElBQUksWUFBWSxjQUFjLGVBQWUsU0FBUyxVQUFVLGNBQWMsV0FBVyxPQUFPLFdBQVcsaUJBQWlCLFFBQVEsQ0FBQztBQUFBLElBQzlJO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsV0FBVyxXQUF1QixTQUF3QixpQkFBMEIsYUFBMkM7QUFDN0ksV0FBTyxRQUFRLElBQUksWUFBVTtBQUM1QixZQUFNLFlBQVksVUFBVSxpQkFBaUIsT0FBTyxVQUFVLFNBQVMsVUFBVTtBQUNqRixZQUFNLFFBQVEsY0FBYyxjQUFjO0FBRTFDLGFBQU8sWUFBWTtBQUFBLFFBQ2xCLFFBQ0csZUFBZSxTQUFTLFVBQVUsY0FBYyxXQUFXLE9BQU8sV0FBVyxpQkFBaUIsV0FBVyxJQUN6RyxlQUFlLFVBQVUsVUFBVSxjQUFjLFdBQVcsT0FBTyxXQUFXLGlCQUFpQixXQUFXO0FBQUEsTUFDOUc7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFlLG1CQUFtQixXQUF1QixTQUF3QixpQkFBZ0Q7QUFDaEksVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsWUFBTSxpQkFBaUIsT0FBTyxVQUFVLFNBQVM7QUFDakQsWUFBTSxXQUFXLEtBQUssTUFBTSxVQUFVLGNBQWMsY0FBYyxJQUFJLENBQUM7QUFDdkUsYUFBTyxDQUFDLElBQUksWUFBWSxjQUFjLGVBQWUsVUFBVSxVQUFVLGNBQWMsV0FBVyxPQUFPLFdBQVcsaUJBQWlCLFFBQVEsQ0FBQztBQUFBLElBQy9JO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUscUJBQXFCLFdBQXVCLFNBQXdCLGlCQUEwQixZQUEwQztBQUN0SixVQUFNLFNBQStCLENBQUM7QUFDdEMsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixhQUFPLENBQUMsSUFBSSxZQUFZLGNBQWMsZUFBZSxTQUFTLFVBQVUsY0FBYyxXQUFXLE9BQU8sV0FBVyxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsSUFDaEo7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxzQkFBc0IsV0FBdUIsU0FBd0IsaUJBQTBCLFlBQTBDO0FBQ3ZKLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLGFBQU8sQ0FBQyxJQUFJLFlBQVksZUFBZSxlQUFlLFNBQVMsVUFBVSxjQUFjLFVBQVUsT0FBTyxPQUFPLFlBQVksaUJBQWlCLFVBQVUsQ0FBQztBQUFBLElBQ3hKO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsbUJBQW1CLFdBQXVCLFNBQXdCLGlCQUEwQixZQUEwQztBQUNwSixVQUFNLFNBQStCLENBQUM7QUFDdEMsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixhQUFPLENBQUMsSUFBSSxZQUFZLGNBQWMsZUFBZSxPQUFPLFVBQVUsY0FBYyxXQUFXLE9BQU8sV0FBVyxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsSUFDOUk7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxvQkFBb0IsV0FBdUIsU0FBd0IsaUJBQTBCLFlBQTBDO0FBQ3JKLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLGFBQU8sQ0FBQyxJQUFJLFlBQVksZUFBZSxlQUFlLE9BQU8sVUFBVSxjQUFjLFVBQVUsT0FBTyxPQUFPLFlBQVksaUJBQWlCLFVBQVUsQ0FBQztBQUFBLElBQ3RKO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsdUJBQXVCLFdBQXVCLFNBQXdCLGlCQUEwQixPQUFxQztBQUNuSixVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLFlBQVksTUFBTSxhQUFhO0FBQ3JDLFVBQU0sY0FBYyxVQUFVLGVBQWU7QUFFN0MsV0FBTyxRQUFRLElBQUksWUFBVTtBQUM1QixZQUFNLFlBQVksT0FBTyxXQUFXLGFBQWEsS0FBSyxDQUFDLGtCQUNwRCxPQUFPLFdBQVcsVUFBVSxnQkFDNUIsT0FBTyxXQUFXLFNBQVM7QUFFOUIsWUFBTSxhQUFhLG1CQUFtQixrQkFBa0IsV0FBVyxPQUFPLGFBQWEsU0FBUztBQUNoRyxZQUFNLFFBQVEsYUFBYTtBQUMzQixVQUFJLFVBQVUsR0FBRztBQUNoQixlQUFPLFlBQVksZUFBZSxPQUFPLFVBQVU7QUFBQSxNQUNwRDtBQUNBLGFBQU8sWUFBWSxlQUFlLGVBQWUsU0FBUyxVQUFVLGNBQWMsT0FBTyxPQUFPLFlBQVksaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQ3BJLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFlLHFCQUFxQixXQUF1QixTQUF3QixpQkFBMEIsT0FBcUM7QUFDakosVUFBTSxRQUFRLFVBQVU7QUFDeEIsVUFBTSxjQUFjLFVBQVUsZUFBZTtBQUU3QyxXQUFPLFFBQVEsSUFBSSxZQUFVO0FBQzVCLFlBQU0sWUFBWSxPQUFPLFdBQVcsYUFBYSxLQUFLLENBQUMsa0JBQ3BELE9BQU8sV0FBVyxVQUFVLGtCQUM1QixPQUFPLFdBQVcsU0FBUztBQUU5QixZQUFNLGFBQWEsbUJBQW1CLGdCQUFnQixXQUFXLE9BQU8sV0FBVztBQUNuRixZQUFNLFFBQVEsWUFBWTtBQUMxQixVQUFJLFVBQVUsR0FBRztBQUNoQixlQUFPLFlBQVksZUFBZSxPQUFPLFVBQVU7QUFBQSxNQUNwRDtBQUNBLGFBQU8sWUFBWSxlQUFlLGVBQWUsT0FBTyxVQUFVLGNBQWMsT0FBTyxPQUFPLFlBQVksaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQ2xJLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBLEVBSUEsT0FBZSxrQkFBa0IsV0FBbUIsT0FBZSxhQUFzQixXQUEyQjtBQUNuSCxRQUFJLE9BQU87QUFDWCxRQUFJLElBQUk7QUFFUixXQUFPLElBQUksWUFBWSxVQUFVLFlBQVksQ0FBQyxFQUFFLGdCQUFnQixPQUFPLEdBQUc7QUFDekU7QUFBQSxJQUNEO0FBRUEsYUFBUyxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVE7QUFDeEMsVUFBSSxRQUFRLFdBQVc7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFlBQVksT0FBTztBQUN2QixhQUFPLElBQUksWUFBWSxVQUFVLFlBQVksQ0FBQyxFQUFFLGdCQUFnQixXQUFXO0FBQzFFO0FBQUEsTUFDRDtBQUVBLFVBQUksSUFBSSxZQUFZLFVBQVUsWUFBWSxDQUFDLEVBQUUsbUJBQW1CLFdBQVc7QUFDMUUsb0JBQVksWUFBWSxDQUFDLEVBQUUsZ0JBQWdCO0FBQUEsTUFDNUM7QUFFQSxVQUFJLFlBQVksV0FBVztBQUUxQixlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUEsRUFJQSxPQUFlLGdCQUFnQixXQUFtQixPQUFlLGFBQThCO0FBQzlGLFFBQUksT0FBTztBQUNYLFFBQUksSUFBSSxZQUFZLFNBQVM7QUFFN0IsV0FBTyxLQUFLLEtBQUssWUFBWSxDQUFDLEVBQUUsa0JBQWtCLE9BQU8sR0FBRztBQUMzRDtBQUFBLElBQ0Q7QUFFQSxhQUFTLE9BQU8sR0FBRyxPQUFPLE9BQU8sUUFBUTtBQUN4QyxVQUFJLFFBQVEsR0FBRztBQUNkLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxZQUFZLE9BQU87QUFDdkIsYUFBTyxLQUFLLEtBQUssWUFBWSxDQUFDLEVBQUUsa0JBQWtCLFdBQVc7QUFDNUQ7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLEtBQUssWUFBWSxDQUFDLEVBQUUsaUJBQWlCLFdBQVc7QUFDeEQsb0JBQVksWUFBWSxDQUFDLEVBQUUsa0JBQWtCO0FBQUEsTUFDOUM7QUFFQSxVQUFJLFlBQVksR0FBRztBQUVsQixlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsb0JBQW9CLFdBQXVCLFFBQXFCLGlCQUEwQixrQkFBMEIsY0FBMEM7QUFDNUssV0FBTyxZQUFZLGNBQWMsT0FBTyxVQUFVLEtBQUssaUJBQWlCLGtCQUFrQixjQUFjLENBQUMsQ0FBQztBQUFBLEVBQzNHO0FBQUEsRUFFQSxPQUFlLHFCQUFxQixXQUF1QixRQUFxQixpQkFBMEIsbUJBQTJCLGVBQTJDO0FBQy9LLFdBQU8sWUFBWSxlQUFlLE9BQU8sV0FBVyxLQUFLLGlCQUFpQixtQkFBbUIsZUFBZSxDQUFDLENBQUM7QUFBQSxFQUMvRztBQUFBLEVBRUEsT0FBZSxxQkFBcUIsV0FBdUIsU0FBd0IsaUJBQWdEO0FBQ2xJLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLFlBQU0saUJBQWlCLE9BQU8sVUFBVSxTQUFTO0FBQ2pELFlBQU0sYUFBYSxVQUFVLGlCQUFpQixjQUFjO0FBQzVELGFBQU8sQ0FBQyxJQUFJLEtBQUssb0JBQW9CLFdBQVcsUUFBUSxpQkFBaUIsZ0JBQWdCLFVBQVU7QUFBQSxJQUNwRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFlLG9DQUFvQyxXQUF1QixTQUF3QixpQkFBZ0Q7QUFDakosVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsWUFBTSxpQkFBaUIsT0FBTyxVQUFVLFNBQVM7QUFDakQsWUFBTSxhQUFhLFVBQVUsZ0NBQWdDLGNBQWM7QUFDM0UsYUFBTyxDQUFDLElBQUksS0FBSyxvQkFBb0IsV0FBVyxRQUFRLGlCQUFpQixnQkFBZ0IsVUFBVTtBQUFBLElBQ3BHO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsd0JBQXdCLFdBQXVCLFNBQXdCLGlCQUFnRDtBQUNySSxVQUFNLFNBQStCLENBQUM7QUFDdEMsYUFBUyxJQUFJLEdBQUcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkQsWUFBTSxTQUFTLFFBQVEsQ0FBQztBQUN4QixZQUFNLGlCQUFpQixPQUFPLFVBQVUsU0FBUztBQUNqRCxZQUFNLGFBQWEsS0FBSyxPQUFPLFVBQVUsaUJBQWlCLGNBQWMsSUFBSSxVQUFVLGlCQUFpQixjQUFjLEtBQUssQ0FBQztBQUMzSCxhQUFPLENBQUMsSUFBSSxLQUFLLG9CQUFvQixXQUFXLFFBQVEsaUJBQWlCLGdCQUFnQixVQUFVO0FBQUEsSUFDcEc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxxQkFBcUIsV0FBdUIsU0FBd0IsaUJBQWdEO0FBQ2xJLFVBQU0sU0FBK0IsQ0FBQztBQUN0QyxhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLFlBQU0saUJBQWlCLE9BQU8sVUFBVSxTQUFTO0FBQ2pELFlBQU0sYUFBYSxVQUFVLGlCQUFpQixjQUFjO0FBQzVELGFBQU8sQ0FBQyxJQUFJLEtBQUssb0JBQW9CLFdBQVcsUUFBUSxpQkFBaUIsZ0JBQWdCLFVBQVU7QUFBQSxJQUNwRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFlLG1DQUFtQyxXQUF1QixTQUF3QixpQkFBZ0Q7QUFDaEosVUFBTSxTQUErQixDQUFDO0FBQ3RDLGFBQVMsSUFBSSxHQUFHLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ25ELFlBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsWUFBTSxpQkFBaUIsT0FBTyxVQUFVLFNBQVM7QUFDakQsWUFBTSxhQUFhLFVBQVUsK0JBQStCLGNBQWM7QUFDMUUsYUFBTyxDQUFDLElBQUksS0FBSyxvQkFBb0IsV0FBVyxRQUFRLGlCQUFpQixnQkFBZ0IsVUFBVTtBQUFBLElBQ3BHO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVPLElBQVU7QUFBQSxDQUFWLENBQVVBLGdCQUFWO0FBRU4sUUFBTSxtQkFBbUIsU0FBVSxLQUF1QjtBQUN6RCxRQUFJLENBQUMsTUFBTSxTQUFTLEdBQUcsR0FBRztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQThCO0FBRXBDLFFBQUksQ0FBQyxNQUFNLFNBQVMsY0FBYyxFQUFFLEdBQUc7QUFDdEMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsTUFBTSxZQUFZLGNBQWMsTUFBTSxLQUFLLENBQUMsTUFBTSxVQUFVLGNBQWMsTUFBTSxHQUFHO0FBQ3ZGLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLE1BQU0sWUFBWSxjQUFjLEVBQUUsS0FBSyxDQUFDLE1BQU0sU0FBUyxjQUFjLEVBQUUsR0FBRztBQUM5RSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxNQUFNLFlBQVksY0FBYyxLQUFLLEtBQUssQ0FBQyxNQUFNLFNBQVMsY0FBYyxLQUFLLEdBQUc7QUFDcEYsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsTUFBTSxZQUFZLGNBQWMsU0FBUyxLQUFLLENBQUMsTUFBTSxVQUFVLGNBQWMsU0FBUyxHQUFHO0FBQzdGLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFTyxFQUFNQSxZQUFBLFdBQTZCO0FBQUEsSUFDekMsYUFBYTtBQUFBLElBQ2IsTUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFrQmIsWUFBWTtBQUFBLFFBQ1osUUFBUTtBQUFBLFVBQ1AsUUFBUTtBQUFBLFVBQ1IsWUFBWSxDQUFDLElBQUk7QUFBQSxVQUNqQixjQUFjO0FBQUEsWUFDYixNQUFNO0FBQUEsY0FDTCxRQUFRO0FBQUEsY0FDUixRQUFRLENBQUMsUUFBUSxTQUFTLE1BQU0sUUFBUSxpQkFBaUIsaUJBQWlCLG9CQUFvQixrQkFBa0IsMkJBQTJCLDBDQUEwQyx5Q0FBeUMsZUFBZSxrQkFBa0Isa0JBQWtCLG1CQUFtQjtBQUFBLFlBQ3JTO0FBQUEsWUFDQSxNQUFNO0FBQUEsY0FDTCxRQUFRO0FBQUEsY0FDUixRQUFRLENBQUMsUUFBUSxlQUFlLGFBQWEsWUFBWSxZQUFZO0FBQUEsWUFDdEU7QUFBQSxZQUNBLFNBQVM7QUFBQSxjQUNSLFFBQVE7QUFBQSxjQUNSLFdBQVc7QUFBQSxZQUNaO0FBQUEsWUFDQSxVQUFVO0FBQUEsY0FDVCxRQUFRO0FBQUEsY0FDUixXQUFXO0FBQUEsWUFDWjtBQUFBLFlBQ0EsYUFBYTtBQUFBLGNBQ1osUUFBUTtBQUFBLGNBQ1IsV0FBVztBQUFBLFlBQ1o7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUtPLEVBQU1BLFlBQUEsZUFBZTtBQUFBLElBQzNCLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUVOLGVBQWU7QUFBQSxJQUNmLGVBQWU7QUFBQSxJQUVmLGtCQUFrQjtBQUFBLElBQ2xCLHdDQUF3QztBQUFBLElBQ3hDLHlCQUF5QjtBQUFBLElBQ3pCLGdCQUFnQjtBQUFBLElBQ2hCLHVDQUF1QztBQUFBLElBRXZDLGFBQWE7QUFBQSxJQUNiLGdCQUFnQjtBQUFBLElBQ2hCLGdCQUFnQjtBQUFBLElBRWhCLG1CQUFtQjtBQUFBLEVBQ3BCO0FBS08sRUFBTUEsWUFBQSxVQUFVO0FBQUEsSUFDdEIsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLElBQ2IsV0FBVztBQUFBLElBQ1gsVUFBVTtBQUFBLElBQ1YsWUFBWTtBQUFBLEVBQ2I7QUFhTyxXQUFTLE1BQU0sTUFBcUQ7QUFDMUUsUUFBSSxDQUFDLEtBQUssSUFBSTtBQUViLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSTtBQUNKLFlBQVEsS0FBSyxJQUFJO0FBQUEsTUFDaEIsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0Q7QUFFQyxlQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksT0FBTztBQUNYLFlBQVEsS0FBSyxJQUFJO0FBQUEsTUFDaEIsS0FBS0EsWUFBQSxRQUFRO0FBQ1osZUFBTztBQUNQO0FBQUEsTUFDRCxLQUFLQSxZQUFBLFFBQVE7QUFDWixlQUFPO0FBQ1A7QUFBQSxNQUNELEtBQUtBLFlBQUEsUUFBUTtBQUNaLGVBQU87QUFDUDtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxRQUFRO0FBQ1osZUFBTztBQUNQO0FBQUEsTUFDRCxLQUFLQSxZQUFBLFFBQVE7QUFDWixlQUFPO0FBQ1A7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxRQUFTLENBQUMsQ0FBQyxLQUFLO0FBQUEsTUFDaEIsT0FBUSxLQUFLLFNBQVM7QUFBQSxNQUN0QixXQUFZLENBQUMsQ0FBQyxLQUFLO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBcEZPLEVBQUFBLFlBQVM7QUFxR1QsTUFBVztBQUFYLElBQVdDLGVBQVg7QUFDTixJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFFQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBRUEsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBRUEsSUFBQUEsc0JBQUE7QUFBQSxLQWxCaUIsWUFBQUQsWUFBQSxjQUFBQSxZQUFBO0FBMENYLE1BQVc7QUFBWCxJQUFXRSxVQUFYO0FBQ04sSUFBQUEsWUFBQTtBQUNBLElBQUFBLFlBQUE7QUFDQSxJQUFBQSxZQUFBO0FBQ0EsSUFBQUEsWUFBQTtBQUNBLElBQUFBLFlBQUE7QUFDQSxJQUFBQSxZQUFBO0FBQUEsS0FOaUIsT0FBQUYsWUFBQSxTQUFBQSxZQUFBO0FBQUEsR0FwUkY7IiwKICAibmFtZXMiOiBbIkN1cnNvck1vdmUiLCAiRGlyZWN0aW9uIiwgIlVuaXQiXQp9Cg==
