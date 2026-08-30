import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { PositionAffinity } from "../model.js";
import { IndentGuide, IndentGuideHorizontalLine } from "../textModelGuides.js";
import { ModelDecorationOptions } from "../model/textModel.js";
import * as viewEvents from "../viewEvents.js";
import { createModelLineProjection } from "./modelLineProjection.js";
import { ConstantTimePrefixSumComputer } from "../model/prefixSumComputer.js";
import { ViewLineData } from "../viewModel.js";
import { IdentityCoordinatesConverter } from "../coordinatesConverter.js";
class ViewModelLinesFromProjectedModel {
  constructor(editorId, model, domLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, fontInfo, tabSize, wrappingStrategy, wrappingColumn, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
    this._editorId = editorId;
    this.model = model;
    this._validModelVersionId = -1;
    this._domLineBreaksComputerFactory = domLineBreaksComputerFactory;
    this._monospaceLineBreaksComputerFactory = monospaceLineBreaksComputerFactory;
    this.fontInfo = fontInfo;
    this.tabSize = tabSize;
    this.wrappingStrategy = wrappingStrategy;
    this.wrappingColumn = wrappingColumn;
    this.wrappingIndent = wrappingIndent;
    this.wordBreak = wordBreak;
    this.wrapOnEscapedLineFeeds = wrapOnEscapedLineFeeds;
    this._constructLines(
      /*resetHiddenAreas*/
      true,
      null
    );
  }
  dispose() {
    this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, []);
  }
  createCoordinatesConverter() {
    return new CoordinatesConverter(this);
  }
  _constructLines(resetHiddenAreas, previousLineBreaks) {
    this.modelLineProjections = [];
    if (resetHiddenAreas) {
      this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, []);
    }
    const linesContent = this.model.getLinesContent();
    const lineCount = linesContent.length;
    const lineBreaksComputer = this.createLineBreaksComputer();
    for (let i = 0; i < lineCount; i++) {
      lineBreaksComputer.addRequest(i + 1, previousLineBreaks ? previousLineBreaks[i] : null);
    }
    const linesBreaks = lineBreaksComputer.finalize();
    const values = [];
    const hiddenAreas = this.hiddenAreasDecorationIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);
    let hiddenAreaStart = 1, hiddenAreaEnd = 0;
    let hiddenAreaIdx = -1;
    let nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : lineCount + 2;
    for (let i = 0; i < lineCount; i++) {
      const lineNumber = i + 1;
      if (lineNumber === nextLineNumberToUpdateHiddenArea) {
        hiddenAreaIdx++;
        hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
        hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
        nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : lineCount + 2;
      }
      const isInHiddenArea = lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd;
      const line = createModelLineProjection(linesBreaks[i], !isInHiddenArea);
      values[i] = line.getViewLineCount();
      this.modelLineProjections[i] = line;
    }
    this._validModelVersionId = this.model.getVersionId();
    this.projectedModelLineLineCounts = new ConstantTimePrefixSumComputer(values);
    this._ensureAtLeastOneVisibleLine();
  }
  getHiddenAreas() {
    return this.hiddenAreasDecorationIds.map(
      (decId) => this.model.getDecorationRange(decId)
    );
  }
  setHiddenAreas(_ranges) {
    const validatedRanges = _ranges.map((r) => this.model.validateRange(r));
    const newRanges = normalizeLineRanges(validatedRanges);
    const oldRanges = this.hiddenAreasDecorationIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);
    if (newRanges.length === oldRanges.length) {
      let hasDifference = false;
      for (let i = 0; i < newRanges.length; i++) {
        if (!newRanges[i].equalsRange(oldRanges[i])) {
          hasDifference = true;
          break;
        }
      }
      if (!hasDifference) {
        return false;
      }
    }
    const newDecorations = newRanges.map(
      (r) => ({
        range: r,
        options: ModelDecorationOptions.EMPTY
      })
    );
    this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, newDecorations);
    const hiddenAreas = newRanges;
    let hiddenAreaStart = 1, hiddenAreaEnd = 0;
    let hiddenAreaIdx = -1;
    let nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : this.modelLineProjections.length + 2;
    let hasVisibleLine = false;
    for (let i = 0; i < this.modelLineProjections.length; i++) {
      const lineNumber = i + 1;
      if (lineNumber === nextLineNumberToUpdateHiddenArea) {
        hiddenAreaIdx++;
        hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
        hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
        nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : this.modelLineProjections.length + 2;
      }
      let lineChanged = false;
      if (lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd) {
        if (this.modelLineProjections[i].isVisible()) {
          this.modelLineProjections[i] = this.modelLineProjections[i].setVisible(false);
          lineChanged = true;
        }
      } else {
        hasVisibleLine = true;
        if (!this.modelLineProjections[i].isVisible()) {
          this.modelLineProjections[i] = this.modelLineProjections[i].setVisible(true);
          lineChanged = true;
        }
      }
      if (lineChanged) {
        const newOutputLineCount = this.modelLineProjections[i].getViewLineCount();
        this.projectedModelLineLineCounts.setValue(i, newOutputLineCount);
      }
    }
    if (!hasVisibleLine) {
      this.setHiddenAreas([]);
    }
    return true;
  }
  modelPositionIsVisible(modelLineNumber, _modelColumn) {
    if (modelLineNumber < 1 || modelLineNumber > this.modelLineProjections.length) {
      return false;
    }
    return this.modelLineProjections[modelLineNumber - 1].isVisible();
  }
  getModelLineViewLineCount(modelLineNumber) {
    if (modelLineNumber < 1 || modelLineNumber > this.modelLineProjections.length) {
      return 1;
    }
    return this.modelLineProjections[modelLineNumber - 1].getViewLineCount();
  }
  setTabSize(newTabSize) {
    if (this.tabSize === newTabSize) {
      return false;
    }
    this.tabSize = newTabSize;
    this._constructLines(
      /*resetHiddenAreas*/
      false,
      null
    );
    return true;
  }
  setWrappingSettings(fontInfo, wrappingStrategy, wrappingColumn, wrappingIndent, wordBreak) {
    const equalFontInfo = this.fontInfo.equals(fontInfo);
    const equalWrappingStrategy = this.wrappingStrategy === wrappingStrategy;
    const equalWrappingColumn = this.wrappingColumn === wrappingColumn;
    const equalWrappingIndent = this.wrappingIndent === wrappingIndent;
    const equalWordBreak = this.wordBreak === wordBreak;
    if (equalFontInfo && equalWrappingStrategy && equalWrappingColumn && equalWrappingIndent && equalWordBreak) {
      return false;
    }
    const onlyWrappingColumnChanged = equalFontInfo && equalWrappingStrategy && !equalWrappingColumn && equalWrappingIndent && equalWordBreak;
    this.fontInfo = fontInfo;
    this.wrappingStrategy = wrappingStrategy;
    this.wrappingColumn = wrappingColumn;
    this.wrappingIndent = wrappingIndent;
    this.wordBreak = wordBreak;
    let previousLineBreaks = null;
    if (onlyWrappingColumnChanged) {
      previousLineBreaks = [];
      for (let i = 0, len = this.modelLineProjections.length; i < len; i++) {
        previousLineBreaks[i] = this.modelLineProjections[i].getProjectionData();
      }
    }
    this._constructLines(
      /*resetHiddenAreas*/
      false,
      previousLineBreaks
    );
    return true;
  }
  createLineBreaksComputer(_context) {
    const lineBreaksComputerFactory = this.wrappingStrategy === "advanced" ? this._domLineBreaksComputerFactory : this._monospaceLineBreaksComputerFactory;
    const context = _context ?? {
      getLineContent: (lineNumber) => {
        return this.model.getLineContent(lineNumber);
      },
      getLineInjectedText: (lineNumber) => {
        return this.model.getLineInjectedText(lineNumber, this._editorId);
      }
    };
    return lineBreaksComputerFactory.createLineBreaksComputer(context, this.fontInfo, this.tabSize, this.wrappingColumn, this.wrappingIndent, this.wordBreak, this.wrapOnEscapedLineFeeds);
  }
  onModelFlushed() {
    this._constructLines(
      /*resetHiddenAreas*/
      true,
      null
    );
  }
  onModelLinesDeleted(versionId, fromLineNumber, toLineNumber) {
    if (!versionId || versionId <= this._validModelVersionId) {
      return null;
    }
    const outputFromLineNumber = fromLineNumber === 1 ? 1 : this.projectedModelLineLineCounts.getPrefixSum(fromLineNumber - 1) + 1;
    const outputToLineNumber = this.projectedModelLineLineCounts.getPrefixSum(toLineNumber);
    this.modelLineProjections.splice(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
    this.projectedModelLineLineCounts.removeValues(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
    return new viewEvents.ViewLinesDeletedEvent(outputFromLineNumber, outputToLineNumber);
  }
  onModelLinesInserted(versionId, fromLineNumber, _toLineNumber, lineBreaks) {
    if (!versionId || versionId <= this._validModelVersionId) {
      return null;
    }
    const isInHiddenArea = fromLineNumber > 2 && !this.modelLineProjections[fromLineNumber - 2].isVisible();
    const outputFromLineNumber = fromLineNumber === 1 ? 1 : this.projectedModelLineLineCounts.getPrefixSum(fromLineNumber - 1) + 1;
    let totalOutputLineCount = 0;
    const insertLines = [];
    const insertPrefixSumValues = [];
    for (let i = 0, len = lineBreaks.length; i < len; i++) {
      const line = createModelLineProjection(lineBreaks[i], !isInHiddenArea);
      insertLines.push(line);
      const outputLineCount = line.getViewLineCount();
      totalOutputLineCount += outputLineCount;
      insertPrefixSumValues[i] = outputLineCount;
    }
    this.modelLineProjections = this.modelLineProjections.slice(0, fromLineNumber - 1).concat(insertLines).concat(this.modelLineProjections.slice(fromLineNumber - 1));
    this.projectedModelLineLineCounts.insertValues(fromLineNumber - 1, insertPrefixSumValues);
    return new viewEvents.ViewLinesInsertedEvent(outputFromLineNumber, outputFromLineNumber + totalOutputLineCount - 1);
  }
  onModelLineChanged(versionId, lineNumber, lineBreakData) {
    if (versionId !== null && versionId <= this._validModelVersionId) {
      return [false, null, null, null];
    }
    const lineIndex = lineNumber - 1;
    const oldOutputLineCount = this.modelLineProjections[lineIndex].getViewLineCount();
    const isVisible = this.modelLineProjections[lineIndex].isVisible();
    const line = createModelLineProjection(lineBreakData, isVisible);
    this.modelLineProjections[lineIndex] = line;
    const newOutputLineCount = this.modelLineProjections[lineIndex].getViewLineCount();
    let lineMappingChanged = false;
    let changeFrom = 0;
    let changeTo = -1;
    let insertFrom = 0;
    let insertTo = -1;
    let deleteFrom = 0;
    let deleteTo = -1;
    if (oldOutputLineCount > newOutputLineCount) {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + newOutputLineCount - 1;
      deleteFrom = changeTo + 1;
      deleteTo = deleteFrom + (oldOutputLineCount - newOutputLineCount) - 1;
      lineMappingChanged = true;
    } else if (oldOutputLineCount < newOutputLineCount) {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + oldOutputLineCount - 1;
      insertFrom = changeTo + 1;
      insertTo = insertFrom + (newOutputLineCount - oldOutputLineCount) - 1;
      lineMappingChanged = true;
    } else {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + newOutputLineCount - 1;
    }
    this.projectedModelLineLineCounts.setValue(lineIndex, newOutputLineCount);
    const viewLinesChangedEvent = changeFrom <= changeTo ? new viewEvents.ViewLinesChangedEvent(changeFrom, changeTo - changeFrom + 1) : null;
    const viewLinesInsertedEvent = insertFrom <= insertTo ? new viewEvents.ViewLinesInsertedEvent(insertFrom, insertTo) : null;
    const viewLinesDeletedEvent = deleteFrom <= deleteTo ? new viewEvents.ViewLinesDeletedEvent(deleteFrom, deleteTo) : null;
    return [lineMappingChanged, viewLinesChangedEvent, viewLinesInsertedEvent, viewLinesDeletedEvent];
  }
  acceptVersionId(versionId) {
    this._validModelVersionId = versionId;
    this._ensureAtLeastOneVisibleLine();
  }
  _ensureAtLeastOneVisibleLine() {
    if (this.getViewLineCount() === 0 && this.modelLineProjections.length > 0) {
      this.modelLineProjections[0] = this.modelLineProjections[0].setVisible(true);
      this.projectedModelLineLineCounts.setValue(0, this.modelLineProjections[0].getViewLineCount());
    }
  }
  getViewLineCount() {
    return this.projectedModelLineLineCounts.getTotalSum();
  }
  _toValidViewLineNumber(viewLineNumber) {
    if (viewLineNumber < 1) {
      return 1;
    }
    const viewLineCount = this.getViewLineCount();
    if (viewLineNumber > viewLineCount) {
      return viewLineCount;
    }
    return viewLineNumber | 0;
  }
  getActiveIndentGuide(viewLineNumber, minLineNumber, maxLineNumber) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    minLineNumber = this._toValidViewLineNumber(minLineNumber);
    maxLineNumber = this._toValidViewLineNumber(maxLineNumber);
    const modelPosition = this.convertViewPositionToModelPosition(viewLineNumber, this.getViewLineMinColumn(viewLineNumber));
    const modelMinPosition = this.convertViewPositionToModelPosition(minLineNumber, this.getViewLineMinColumn(minLineNumber));
    const modelMaxPosition = this.convertViewPositionToModelPosition(maxLineNumber, this.getViewLineMinColumn(maxLineNumber));
    const result = this.model.guides.getActiveIndentGuide(modelPosition.lineNumber, modelMinPosition.lineNumber, modelMaxPosition.lineNumber);
    const viewStartPosition = this.convertModelPositionToViewPosition(result.startLineNumber, 1);
    const viewEndPosition = this.convertModelPositionToViewPosition(result.endLineNumber, this.model.getLineMaxColumn(result.endLineNumber));
    return {
      startLineNumber: viewStartPosition.lineNumber,
      endLineNumber: viewEndPosition.lineNumber,
      indent: result.indent
    };
  }
  // #region ViewLineInfo
  getViewLineInfo(viewLineNumber) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    const r = this.projectedModelLineLineCounts.getIndexOf(viewLineNumber - 1);
    const lineIndex = r.index;
    const remainder = r.remainder;
    return new ViewLineInfo(lineIndex + 1, remainder);
  }
  getMinColumnOfViewLine(viewLineInfo) {
    return this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewLineMinColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
  }
  getMaxColumnOfViewLine(viewLineInfo) {
    return this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewLineMaxColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
  }
  getModelStartPositionOfViewLine(viewLineInfo) {
    const line = this.modelLineProjections[viewLineInfo.modelLineNumber - 1];
    const minViewColumn = line.getViewLineMinColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
    const column = line.getModelColumnOfViewPosition(
      viewLineInfo.modelLineWrappedLineIdx,
      minViewColumn
    );
    return new Position(viewLineInfo.modelLineNumber, column);
  }
  getModelEndPositionOfViewLine(viewLineInfo) {
    const line = this.modelLineProjections[viewLineInfo.modelLineNumber - 1];
    const maxViewColumn = line.getViewLineMaxColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
    const column = line.getModelColumnOfViewPosition(
      viewLineInfo.modelLineWrappedLineIdx,
      maxViewColumn
    );
    return new Position(viewLineInfo.modelLineNumber, column);
  }
  getViewLineInfosGroupedByModelRanges(viewStartLineNumber, viewEndLineNumber) {
    const startViewLine = this.getViewLineInfo(viewStartLineNumber);
    const endViewLine = this.getViewLineInfo(viewEndLineNumber);
    const result = new Array();
    let lastVisibleModelPos = this.getModelStartPositionOfViewLine(startViewLine);
    let viewLines = new Array();
    for (let curModelLine = startViewLine.modelLineNumber; curModelLine <= endViewLine.modelLineNumber; curModelLine++) {
      const line = this.modelLineProjections[curModelLine - 1];
      if (line.isVisible()) {
        const startOffset = curModelLine === startViewLine.modelLineNumber ? startViewLine.modelLineWrappedLineIdx : 0;
        const endOffset = curModelLine === endViewLine.modelLineNumber ? endViewLine.modelLineWrappedLineIdx + 1 : line.getViewLineCount();
        for (let i = startOffset; i < endOffset; i++) {
          viewLines.push(new ViewLineInfo(curModelLine, i));
        }
      }
      if (!line.isVisible() && lastVisibleModelPos) {
        const lastVisibleModelPos2 = new Position(curModelLine - 1, this.model.getLineMaxColumn(curModelLine - 1) + 1);
        const modelRange = Range.fromPositions(lastVisibleModelPos, lastVisibleModelPos2);
        result.push(new ViewLineInfoGroupedByModelRange(modelRange, viewLines));
        viewLines = [];
        lastVisibleModelPos = null;
      } else if (line.isVisible() && !lastVisibleModelPos) {
        lastVisibleModelPos = new Position(curModelLine, 1);
      }
    }
    if (lastVisibleModelPos) {
      const modelRange = Range.fromPositions(lastVisibleModelPos, this.getModelEndPositionOfViewLine(endViewLine));
      result.push(new ViewLineInfoGroupedByModelRange(modelRange, viewLines));
    }
    return result;
  }
  // #endregion
  getViewLinesBracketGuides(viewStartLineNumber, viewEndLineNumber, activeViewPosition, options) {
    const modelActivePosition = activeViewPosition ? this.convertViewPositionToModelPosition(activeViewPosition.lineNumber, activeViewPosition.column) : null;
    const resultPerViewLine = [];
    for (const group of this.getViewLineInfosGroupedByModelRanges(viewStartLineNumber, viewEndLineNumber)) {
      const modelRangeStartLineNumber = group.modelRange.startLineNumber;
      const bracketGuidesPerModelLine = this.model.guides.getLinesBracketGuides(
        modelRangeStartLineNumber,
        group.modelRange.endLineNumber,
        modelActivePosition,
        options
      );
      for (const viewLineInfo of group.viewLines) {
        const bracketGuides = bracketGuidesPerModelLine[viewLineInfo.modelLineNumber - modelRangeStartLineNumber];
        const result = bracketGuides.map((g) => {
          if (g.forWrappedLinesAfterColumn !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.forWrappedLinesAfterColumn);
            if (p2.lineNumber >= viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          if (g.forWrappedLinesBeforeOrAtColumn !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.forWrappedLinesBeforeOrAtColumn);
            if (p2.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          if (!g.horizontalLine) {
            return g;
          }
          let column = -1;
          if (g.column !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.column);
            if (p2.lineNumber === viewLineInfo.modelLineWrappedLineIdx) {
              column = p2.column;
            } else if (p2.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
              column = this.getMinColumnOfViewLine(viewLineInfo);
            } else if (p2.lineNumber > viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          const viewPosition = this.convertModelPositionToViewPosition(viewLineInfo.modelLineNumber, g.horizontalLine.endColumn);
          const p = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.horizontalLine.endColumn);
          if (p.lineNumber === viewLineInfo.modelLineWrappedLineIdx) {
            return new IndentGuide(
              g.visibleColumn,
              column,
              g.className,
              new IndentGuideHorizontalLine(
                g.horizontalLine.top,
                viewPosition.column
              ),
              -1,
              -1
            );
          } else if (p.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
            return void 0;
          } else {
            if (g.visibleColumn !== -1) {
              return void 0;
            }
            return new IndentGuide(
              g.visibleColumn,
              column,
              g.className,
              new IndentGuideHorizontalLine(
                g.horizontalLine.top,
                this.getMaxColumnOfViewLine(viewLineInfo)
              ),
              -1,
              -1
            );
          }
        });
        resultPerViewLine.push(result.filter((r) => !!r));
      }
    }
    return resultPerViewLine;
  }
  getViewLinesIndentGuides(viewStartLineNumber, viewEndLineNumber) {
    viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
    viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);
    const modelStart = this.convertViewPositionToModelPosition(viewStartLineNumber, this.getViewLineMinColumn(viewStartLineNumber));
    const modelEnd = this.convertViewPositionToModelPosition(viewEndLineNumber, this.getViewLineMaxColumn(viewEndLineNumber));
    let result = [];
    const resultRepeatCount = [];
    const resultRepeatOption = [];
    const modelStartLineIndex = modelStart.lineNumber - 1;
    const modelEndLineIndex = modelEnd.lineNumber - 1;
    let reqStart = null;
    for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (line.isVisible()) {
        const viewLineStartIndex = line.getViewLineNumberOfModelPosition(0, modelLineIndex === modelStartLineIndex ? modelStart.column : 1);
        const viewLineEndIndex = line.getViewLineNumberOfModelPosition(0, this.model.getLineMaxColumn(modelLineIndex + 1));
        const count = viewLineEndIndex - viewLineStartIndex + 1;
        let option = 0 /* BlockNone */;
        if (count > 1 && line.getViewLineMinColumn(this.model, modelLineIndex + 1, viewLineEndIndex) === 1) {
          option = viewLineStartIndex === 0 ? 1 /* BlockSubsequent */ : 2 /* BlockAll */;
        }
        resultRepeatCount.push(count);
        resultRepeatOption.push(option);
        if (reqStart === null) {
          reqStart = new Position(modelLineIndex + 1, 0);
        }
      } else {
        if (reqStart !== null) {
          result = result.concat(this.model.guides.getLinesIndentGuides(reqStart.lineNumber, modelLineIndex));
          reqStart = null;
        }
      }
    }
    if (reqStart !== null) {
      result = result.concat(this.model.guides.getLinesIndentGuides(reqStart.lineNumber, modelEnd.lineNumber));
      reqStart = null;
    }
    const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
    const viewIndents = new Array(viewLineCount);
    let currIndex = 0;
    for (let i = 0, len = result.length; i < len; i++) {
      let value = result[i];
      const count = Math.min(viewLineCount - currIndex, resultRepeatCount[i]);
      const option = resultRepeatOption[i];
      let blockAtIndex;
      if (option === 2 /* BlockAll */) {
        blockAtIndex = 0;
      } else if (option === 1 /* BlockSubsequent */) {
        blockAtIndex = 1;
      } else {
        blockAtIndex = count;
      }
      for (let j = 0; j < count; j++) {
        if (j === blockAtIndex) {
          value = 0;
        }
        viewIndents[currIndex++] = value;
      }
    }
    return viewIndents;
  }
  getViewLineContent(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineContent(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineLength(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineLength(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineMinColumn(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineMinColumn(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineMaxColumn(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineMaxColumn(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineData(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    const baseViewLineNumber = this.projectedModelLineLineCounts.getPrefixSum(info.modelLineNumber - 1) + 1;
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineData(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx, baseViewLineNumber);
  }
  getViewLinesData(viewStartLineNumber, viewEndLineNumber, needed) {
    viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
    viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);
    const start = this.projectedModelLineLineCounts.getIndexOf(viewStartLineNumber - 1);
    let viewLineNumber = viewStartLineNumber;
    const startModelLineIndex = start.index;
    const startRemainder = start.remainder;
    const result = [];
    for (let modelLineIndex = startModelLineIndex, len = this.model.getLineCount(); modelLineIndex < len; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (!line.isVisible()) {
        continue;
      }
      const fromViewLineIndex = modelLineIndex === startModelLineIndex ? startRemainder : 0;
      let remainingViewLineCount = line.getViewLineCount() - fromViewLineIndex;
      let lastLine = false;
      if (viewLineNumber + remainingViewLineCount > viewEndLineNumber) {
        lastLine = true;
        remainingViewLineCount = viewEndLineNumber - viewLineNumber + 1;
      }
      const baseViewLineNumber = this.projectedModelLineLineCounts.getPrefixSum(modelLineIndex) + 1;
      line.getViewLinesData(this.model, modelLineIndex + 1, fromViewLineIndex, remainingViewLineCount, baseViewLineNumber, viewLineNumber - viewStartLineNumber, needed, result);
      viewLineNumber += remainingViewLineCount;
      if (lastLine) {
        break;
      }
    }
    return result;
  }
  validateViewPosition(viewLineNumber, viewColumn, expectedModelPosition) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    const r = this.projectedModelLineLineCounts.getIndexOf(viewLineNumber - 1);
    const lineIndex = r.index;
    const remainder = r.remainder;
    const line = this.modelLineProjections[lineIndex];
    const minColumn = line.getViewLineMinColumn(this.model, lineIndex + 1, remainder);
    const maxColumn = line.getViewLineMaxColumn(this.model, lineIndex + 1, remainder);
    if (viewColumn < minColumn) {
      viewColumn = minColumn;
    }
    if (viewColumn > maxColumn) {
      viewColumn = maxColumn;
    }
    const computedModelColumn = line.getModelColumnOfViewPosition(remainder, viewColumn);
    const computedModelPosition = this.model.validatePosition(new Position(lineIndex + 1, computedModelColumn));
    if (computedModelPosition.equals(expectedModelPosition)) {
      return new Position(viewLineNumber, viewColumn);
    }
    return this.convertModelPositionToViewPosition(expectedModelPosition.lineNumber, expectedModelPosition.column);
  }
  validateViewRange(viewRange, expectedModelRange) {
    const validViewStart = this.validateViewPosition(viewRange.startLineNumber, viewRange.startColumn, expectedModelRange.getStartPosition());
    const validViewEnd = this.validateViewPosition(viewRange.endLineNumber, viewRange.endColumn, expectedModelRange.getEndPosition());
    return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
  }
  convertViewPositionToModelPosition(viewLineNumber, viewColumn) {
    const info = this.getViewLineInfo(viewLineNumber);
    const inputColumn = this.modelLineProjections[info.modelLineNumber - 1].getModelColumnOfViewPosition(info.modelLineWrappedLineIdx, viewColumn);
    return this.model.validatePosition(new Position(info.modelLineNumber, inputColumn));
  }
  convertViewRangeToModelRange(viewRange) {
    const start = this.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
    const end = this.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
    return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }
  convertModelPositionToViewPosition(_modelLineNumber, _modelColumn, affinity = PositionAffinity.None, allowZeroLineNumber = false, belowHiddenRanges = false) {
    const validPosition = this.model.validatePosition(new Position(_modelLineNumber, _modelColumn));
    const inputLineNumber = validPosition.lineNumber;
    const inputColumn = validPosition.column;
    let lineIndex = inputLineNumber - 1, lineIndexChanged = false;
    if (belowHiddenRanges) {
      while (lineIndex < this.modelLineProjections.length && !this.modelLineProjections[lineIndex].isVisible()) {
        lineIndex++;
        lineIndexChanged = true;
      }
    } else {
      while (lineIndex > 0 && !this.modelLineProjections[lineIndex].isVisible()) {
        lineIndex--;
        lineIndexChanged = true;
      }
    }
    if (lineIndex === 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      return new Position(allowZeroLineNumber ? 0 : 1, 1);
    }
    const deltaLineNumber = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
    let r;
    if (lineIndexChanged) {
      if (belowHiddenRanges) {
        r = this.modelLineProjections[lineIndex].getViewPositionOfModelPosition(deltaLineNumber, 1, affinity);
      } else {
        r = this.modelLineProjections[lineIndex].getViewPositionOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1), affinity);
      }
    } else {
      r = this.modelLineProjections[inputLineNumber - 1].getViewPositionOfModelPosition(deltaLineNumber, inputColumn, affinity);
    }
    return r;
  }
  /**
   * @param affinity The affinity in case of an empty range. Has no effect for non-empty ranges.
  */
  convertModelRangeToViewRange(modelRange, affinity = PositionAffinity.Left) {
    if (modelRange.isEmpty()) {
      const start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn, affinity);
      return Range.fromPositions(start);
    } else {
      const start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn, PositionAffinity.Right);
      const end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn, PositionAffinity.Left);
      return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
    }
  }
  getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
    let lineIndex = modelLineNumber - 1;
    if (this.modelLineProjections[lineIndex].isVisible()) {
      const deltaLineNumber2 = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
      return this.modelLineProjections[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber2, modelColumn);
    }
    while (lineIndex > 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      lineIndex--;
    }
    if (lineIndex === 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      return 1;
    }
    const deltaLineNumber = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
    return this.modelLineProjections[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1));
  }
  getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations) {
    const modelStart = this.convertViewPositionToModelPosition(range.startLineNumber, range.startColumn);
    const modelEnd = this.convertViewPositionToModelPosition(range.endLineNumber, range.endColumn);
    if (modelEnd.lineNumber - modelStart.lineNumber <= range.endLineNumber - range.startLineNumber) {
      return this.model.getDecorationsInRange(new Range(modelStart.lineNumber, 1, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations);
    }
    let result = [];
    const modelStartLineIndex = modelStart.lineNumber - 1;
    const modelEndLineIndex = modelEnd.lineNumber - 1;
    let reqStart = null;
    for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (line.isVisible()) {
        if (reqStart === null) {
          reqStart = new Position(modelLineIndex + 1, modelLineIndex === modelStartLineIndex ? modelStart.column : 1);
        }
      } else {
        if (reqStart !== null) {
          const maxLineColumn = this.model.getLineMaxColumn(modelLineIndex);
          result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelLineIndex, maxLineColumn), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
          reqStart = null;
        }
      }
    }
    if (reqStart !== null) {
      result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
      reqStart = null;
    }
    result.sort((a, b) => {
      const res = Range.compareRangesUsingStarts(a.range, b.range);
      if (res === 0) {
        if (a.id < b.id) {
          return -1;
        }
        if (a.id > b.id) {
          return 1;
        }
        return 0;
      }
      return res;
    });
    const finalResult = [];
    let finalResultLen = 0;
    let prevDecId = null;
    for (const dec of result) {
      const decId = dec.id;
      if (prevDecId === decId) {
        continue;
      }
      prevDecId = decId;
      finalResult[finalResultLen++] = dec;
    }
    return finalResult;
  }
  getInjectedTextAt(position) {
    const info = this.getViewLineInfo(position.lineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getInjectedTextAt(info.modelLineWrappedLineIdx, position.column);
  }
  normalizePosition(position, affinity) {
    const info = this.getViewLineInfo(position.lineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].normalizePosition(info.modelLineWrappedLineIdx, position, affinity);
  }
  getLineIndentColumn(lineNumber) {
    const info = this.getViewLineInfo(lineNumber);
    if (info.modelLineWrappedLineIdx === 0) {
      return this.model.getLineIndentColumn(info.modelLineNumber);
    }
    return 0;
  }
}
function normalizeLineRanges(ranges) {
  if (ranges.length === 0) {
    return [];
  }
  const sortedRanges = ranges.slice();
  sortedRanges.sort(Range.compareRangesUsingStarts);
  const result = [];
  let currentRangeStart = sortedRanges[0].startLineNumber;
  let currentRangeEnd = sortedRanges[0].endLineNumber;
  for (let i = 1, len = sortedRanges.length; i < len; i++) {
    const range = sortedRanges[i];
    if (range.startLineNumber > currentRangeEnd + 1) {
      result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
      currentRangeStart = range.startLineNumber;
      currentRangeEnd = range.endLineNumber;
    } else if (range.endLineNumber > currentRangeEnd) {
      currentRangeEnd = range.endLineNumber;
    }
  }
  result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
  return result;
}
class ViewLineInfo {
  constructor(modelLineNumber, modelLineWrappedLineIdx) {
    this.modelLineNumber = modelLineNumber;
    this.modelLineWrappedLineIdx = modelLineWrappedLineIdx;
  }
  get isWrappedLineContinuation() {
    return this.modelLineWrappedLineIdx > 0;
  }
}
class ViewLineInfoGroupedByModelRange {
  constructor(modelRange, viewLines) {
    this.modelRange = modelRange;
    this.viewLines = viewLines;
  }
}
class CoordinatesConverter {
  constructor(lines) {
    this._lines = lines;
  }
  // View -> Model conversion and related methods
  convertViewPositionToModelPosition(viewPosition) {
    return this._lines.convertViewPositionToModelPosition(viewPosition.lineNumber, viewPosition.column);
  }
  convertViewRangeToModelRange(viewRange) {
    return this._lines.convertViewRangeToModelRange(viewRange);
  }
  validateViewPosition(viewPosition, expectedModelPosition) {
    return this._lines.validateViewPosition(viewPosition.lineNumber, viewPosition.column, expectedModelPosition);
  }
  validateViewRange(viewRange, expectedModelRange) {
    return this._lines.validateViewRange(viewRange, expectedModelRange);
  }
  // Model -> View conversion and related methods
  convertModelPositionToViewPosition(modelPosition, affinity, allowZero, belowHiddenRanges) {
    return this._lines.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column, affinity, allowZero, belowHiddenRanges);
  }
  convertModelRangeToViewRange(modelRange, affinity) {
    return this._lines.convertModelRangeToViewRange(modelRange, affinity);
  }
  modelPositionIsVisible(modelPosition) {
    return this._lines.modelPositionIsVisible(modelPosition.lineNumber, modelPosition.column);
  }
  getModelLineViewLineCount(modelLineNumber) {
    return this._lines.getModelLineViewLineCount(modelLineNumber);
  }
  getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
    return this._lines.getViewLineNumberOfModelPosition(modelLineNumber, modelColumn);
  }
}
var IndentGuideRepeatOption = /* @__PURE__ */ ((IndentGuideRepeatOption2) => {
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockNone"] = 0] = "BlockNone";
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockSubsequent"] = 1] = "BlockSubsequent";
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockAll"] = 2] = "BlockAll";
  return IndentGuideRepeatOption2;
})(IndentGuideRepeatOption || {});
class ViewModelLinesFromModelAsIs {
  constructor(model) {
    this.model = model;
  }
  dispose() {
  }
  createCoordinatesConverter() {
    return new IdentityCoordinatesConverter(this.model);
  }
  getHiddenAreas() {
    return [];
  }
  setHiddenAreas(_ranges) {
    return false;
  }
  setTabSize(_newTabSize) {
    return false;
  }
  setWrappingSettings(_fontInfo, _wrappingStrategy, _wrappingColumn, _wrappingIndent) {
    return false;
  }
  createLineBreaksComputer() {
    const result = [];
    return {
      addRequest: (lineNumber, previousLineBreakData) => {
        result.push(null);
      },
      finalize: () => {
        return result;
      }
    };
  }
  onModelFlushed() {
  }
  onModelLinesDeleted(_versionId, fromLineNumber, toLineNumber) {
    return new viewEvents.ViewLinesDeletedEvent(fromLineNumber, toLineNumber);
  }
  onModelLinesInserted(_versionId, fromLineNumber, toLineNumber, lineBreaks) {
    return new viewEvents.ViewLinesInsertedEvent(fromLineNumber, toLineNumber);
  }
  onModelLineChanged(_versionId, lineNumber, lineBreakData) {
    return [false, new viewEvents.ViewLinesChangedEvent(lineNumber, 1), null, null];
  }
  acceptVersionId(_versionId) {
  }
  getViewLineCount() {
    return this.model.getLineCount();
  }
  getActiveIndentGuide(viewLineNumber, _minLineNumber, _maxLineNumber) {
    return {
      startLineNumber: viewLineNumber,
      endLineNumber: viewLineNumber,
      indent: 0
    };
  }
  getViewLinesBracketGuides(startLineNumber, endLineNumber, activePosition) {
    return new Array(endLineNumber - startLineNumber + 1).fill([]);
  }
  getViewLinesIndentGuides(viewStartLineNumber, viewEndLineNumber) {
    const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
    const result = new Array(viewLineCount);
    for (let i = 0; i < viewLineCount; i++) {
      result[i] = 0;
    }
    return result;
  }
  getViewLineContent(viewLineNumber) {
    return this.model.getLineContent(viewLineNumber);
  }
  getViewLineLength(viewLineNumber) {
    return this.model.getLineLength(viewLineNumber);
  }
  getViewLineMinColumn(viewLineNumber) {
    return this.model.getLineMinColumn(viewLineNumber);
  }
  getViewLineMaxColumn(viewLineNumber) {
    return this.model.getLineMaxColumn(viewLineNumber);
  }
  getViewLineData(viewLineNumber) {
    const lineTokens = this.model.tokenization.getLineTokens(viewLineNumber);
    const lineContent = lineTokens.getLineContent();
    return new ViewLineData(
      lineContent,
      false,
      1,
      lineContent.length + 1,
      0,
      lineTokens.inflate(),
      null
    );
  }
  getViewLinesData(viewStartLineNumber, viewEndLineNumber, needed) {
    const lineCount = this.model.getLineCount();
    viewStartLineNumber = Math.min(Math.max(1, viewStartLineNumber), lineCount);
    viewEndLineNumber = Math.min(Math.max(1, viewEndLineNumber), lineCount);
    const result = [];
    for (let lineNumber = viewStartLineNumber; lineNumber <= viewEndLineNumber; lineNumber++) {
      const idx = lineNumber - viewStartLineNumber;
      result[idx] = needed[idx] ? this.getViewLineData(lineNumber) : null;
    }
    return result;
  }
  getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations) {
    return this.model.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations);
  }
  normalizePosition(position, affinity) {
    return this.model.normalizePosition(position, affinity);
  }
  getLineIndentColumn(lineNumber) {
    return this.model.getLineIndentColumn(lineNumber);
  }
  getInjectedTextAt(position) {
    return null;
  }
}
export {
  ViewModelLinesFromModelAsIs,
  ViewModelLinesFromProjectedModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld01vZGVsXFx2aWV3TW9kZWxMaW5lcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFdyYXBwaW5nSW5kZW50IH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRm9udEluZm8gfSBmcm9tICcuLi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb24sIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgUG9zaXRpb25BZmZpbml0eSB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElBY3RpdmVJbmRlbnRHdWlkZUluZm8sIEJyYWNrZXRHdWlkZU9wdGlvbnMsIEluZGVudEd1aWRlLCBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lIH0gZnJvbSAnLi4vdGV4dE1vZGVsR3VpZGVzLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsTGluZVByb2plY3Rpb24sIElNb2RlbExpbmVQcm9qZWN0aW9uIH0gZnJvbSAnLi9tb2RlbExpbmVQcm9qZWN0aW9uLmpzJztcbmltcG9ydCB7IElMaW5lQnJlYWtzQ29tcHV0ZXIsIE1vZGVsTGluZVByb2plY3Rpb25EYXRhLCBJbmplY3RlZFRleHQsIElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LCBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCB9IGZyb20gJy4uL21vZGVsTGluZVByb2plY3Rpb25EYXRhLmpzJztcbmltcG9ydCB7IENvbnN0YW50VGltZVByZWZpeFN1bUNvbXB1dGVyIH0gZnJvbSAnLi4vbW9kZWwvcHJlZml4U3VtQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgVmlld0xpbmVEYXRhIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDb29yZGluYXRlc0NvbnZlcnRlciwgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlciB9IGZyb20gJy4uL2Nvb3JkaW5hdGVzQ29udmVydGVyLmpzJztcbmltcG9ydCB7IExpbmVJbmplY3RlZFRleHQgfSBmcm9tICcuLi90ZXh0TW9kZWxFdmVudHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3TW9kZWxMaW5lcyBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0Y3JlYXRlQ29vcmRpbmF0ZXNDb252ZXJ0ZXIoKTogSUNvb3JkaW5hdGVzQ29udmVydGVyO1xuXG5cdHNldFdyYXBwaW5nU2V0dGluZ3MoZm9udEluZm86IEZvbnRJbmZvLCB3cmFwcGluZ1N0cmF0ZWd5OiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcsIHdyYXBwaW5nQ29sdW1uOiBudW1iZXIsIHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCwgd29yZEJyZWFrOiAnbm9ybWFsJyB8ICdrZWVwQWxsJyk6IGJvb2xlYW47XG5cdHNldFRhYlNpemUobmV3VGFiU2l6ZTogbnVtYmVyKTogYm9vbGVhbjtcblx0Z2V0SGlkZGVuQXJlYXMoKTogUmFuZ2VbXTtcblx0c2V0SGlkZGVuQXJlYXMoX3JhbmdlczogcmVhZG9ubHkgUmFuZ2VbXSk6IGJvb2xlYW47XG5cblx0Y3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKGNvbnRleHQ/OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCk6IElMaW5lQnJlYWtzQ29tcHV0ZXI7XG5cdG9uTW9kZWxGbHVzaGVkKCk6IHZvaWQ7XG5cdG9uTW9kZWxMaW5lc0RlbGV0ZWQodmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50IHwgbnVsbDtcblx0b25Nb2RlbExpbmVzSW5zZXJ0ZWQodmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlciwgbGluZUJyZWFrczogKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSk6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCB8IG51bGw7XG5cdG9uTW9kZWxMaW5lQ2hhbmdlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGxpbmVOdW1iZXI6IG51bWJlciwgbGluZUJyZWFrRGF0YTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKTogW2Jvb2xlYW4sIHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50IHwgbnVsbCwgdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50IHwgbnVsbCwgdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQgfCBudWxsXTtcblx0YWNjZXB0VmVyc2lvbklkKHZlcnNpb25JZDogbnVtYmVyKTogdm9pZDtcblxuXHRnZXRWaWV3TGluZUNvdW50KCk6IG51bWJlcjtcblx0Z2V0QWN0aXZlSW5kZW50R3VpZGUodmlld0xpbmVOdW1iZXI6IG51bWJlciwgbWluTGluZU51bWJlcjogbnVtYmVyLCBtYXhMaW5lTnVtYmVyOiBudW1iZXIpOiBJQWN0aXZlSW5kZW50R3VpZGVJbmZvO1xuXHRnZXRWaWV3TGluZXNJbmRlbnRHdWlkZXModmlld1N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyW107XG5cdGdldFZpZXdMaW5lc0JyYWNrZXRHdWlkZXMoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgYWN0aXZlUG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwsIG9wdGlvbnM6IEJyYWNrZXRHdWlkZU9wdGlvbnMpOiBJbmRlbnRHdWlkZVtdW107XG5cdGdldFZpZXdMaW5lQ29udGVudCh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nO1xuXHRnZXRWaWV3TGluZUxlbmd0aCh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRWaWV3TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRWaWV3TGluZU1heENvbHVtbih2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRWaWV3TGluZURhdGEodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lRGF0YTtcblx0Z2V0Vmlld0xpbmVzRGF0YSh2aWV3U3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5lZWRlZDogYm9vbGVhbltdKTogQXJyYXk8Vmlld0xpbmVEYXRhIHwgbnVsbD47XG5cblx0Z2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBSYW5nZSwgb3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25bXTtcblxuXHRnZXRJbmplY3RlZFRleHRBdCh2aWV3UG9zaXRpb246IFBvc2l0aW9uKTogSW5qZWN0ZWRUZXh0IHwgbnVsbDtcblxuXHRub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5KTogUG9zaXRpb247XG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjb2x1bW4gYXQgd2hpY2ggaW5kZW50YXRpb24gc3RvcHMgYXQgYSBnaXZlbiBsaW5lLlxuXHQgKiBAaW50ZXJuYWxcblx0Ki9cblx0Z2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbCBpbXBsZW1lbnRzIElWaWV3TW9kZWxMaW5lcyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcklkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgX3ZhbGlkTW9kZWxWZXJzaW9uSWQ6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5OiBJTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeTogSUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk7XG5cblx0cHJpdmF0ZSBmb250SW5mbzogRm9udEluZm87XG5cdHByaXZhdGUgdGFiU2l6ZTogbnVtYmVyO1xuXHRwcml2YXRlIHdyYXBwaW5nQ29sdW1uOiBudW1iZXI7XG5cdHByaXZhdGUgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50O1xuXHRwcml2YXRlIHdvcmRCcmVhazogJ25vcm1hbCcgfCAna2VlcEFsbCc7XG5cdHByaXZhdGUgd3JhcHBpbmdTdHJhdGVneTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnO1xuXHRwcml2YXRlIHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBtb2RlbExpbmVQcm9qZWN0aW9ucyE6IElNb2RlbExpbmVQcm9qZWN0aW9uW107XG5cblx0LyoqXG5cdCAqIFJlZmxlY3RzIHRoZSBzdW0gb2YgdGhlIGxpbmUgY291bnRzIG9mIGFsbCBwcm9qZWN0ZWQgbW9kZWwgbGluZXMuXG5cdCovXG5cdHByaXZhdGUgcHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cyE6IENvbnN0YW50VGltZVByZWZpeFN1bUNvbXB1dGVyO1xuXG5cdHByaXZhdGUgaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzITogc3RyaW5nW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9ySWQ6IG51bWJlcixcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRkb21MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5OiBJTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5OiBJTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRmb250SW5mbzogRm9udEluZm8sXG5cdFx0dGFiU2l6ZTogbnVtYmVyLFxuXHRcdHdyYXBwaW5nU3RyYXRlZ3k6ICdzaW1wbGUnIHwgJ2FkdmFuY2VkJyxcblx0XHR3cmFwcGluZ0NvbHVtbjogbnVtYmVyLFxuXHRcdHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCxcblx0XHR3b3JkQnJlYWs6ICdub3JtYWwnIHwgJ2tlZXBBbGwnLFxuXHRcdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM6IGJvb2xlYW5cblx0KSB7XG5cdFx0dGhpcy5fZWRpdG9ySWQgPSBlZGl0b3JJZDtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fdmFsaWRNb2RlbFZlcnNpb25JZCA9IC0xO1xuXHRcdHRoaXMuX2RvbUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkgPSBkb21MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5O1xuXHRcdHRoaXMuX21vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkgPSBtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5O1xuXHRcdHRoaXMuZm9udEluZm8gPSBmb250SW5mbztcblx0XHR0aGlzLnRhYlNpemUgPSB0YWJTaXplO1xuXHRcdHRoaXMud3JhcHBpbmdTdHJhdGVneSA9IHdyYXBwaW5nU3RyYXRlZ3k7XG5cdFx0dGhpcy53cmFwcGluZ0NvbHVtbiA9IHdyYXBwaW5nQ29sdW1uO1xuXHRcdHRoaXMud3JhcHBpbmdJbmRlbnQgPSB3cmFwcGluZ0luZGVudDtcblx0XHR0aGlzLndvcmRCcmVhayA9IHdvcmRCcmVhaztcblx0XHR0aGlzLndyYXBPbkVzY2FwZWRMaW5lRmVlZHMgPSB3cmFwT25Fc2NhcGVkTGluZUZlZWRzO1xuXG5cdFx0dGhpcy5fY29uc3RydWN0TGluZXMoLypyZXNldEhpZGRlbkFyZWFzKi90cnVlLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzID0gdGhpcy5tb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLCBbXSk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ29vcmRpbmF0ZXNDb252ZXJ0ZXIoKTogSUNvb3JkaW5hdGVzQ29udmVydGVyIHtcblx0XHRyZXR1cm4gbmV3IENvb3JkaW5hdGVzQ29udmVydGVyKHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uc3RydWN0TGluZXMocmVzZXRIaWRkZW5BcmVhczogYm9vbGVhbiwgcHJldmlvdXNMaW5lQnJlYWtzOiAoKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSkgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucyA9IFtdO1xuXG5cdFx0aWYgKHJlc2V0SGlkZGVuQXJlYXMpIHtcblx0XHRcdHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzID0gdGhpcy5tb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLCBbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXNDb250ZW50ID0gdGhpcy5tb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBsaW5lc0NvbnRlbnQubGVuZ3RoO1xuXHRcdGNvbnN0IGxpbmVCcmVha3NDb21wdXRlciA9IHRoaXMuY3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRsaW5lQnJlYWtzQ29tcHV0ZXIuYWRkUmVxdWVzdChpICsgMSwgcHJldmlvdXNMaW5lQnJlYWtzID8gcHJldmlvdXNMaW5lQnJlYWtzW2ldIDogbnVsbCk7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVzQnJlYWtzID0gbGluZUJyZWFrc0NvbXB1dGVyLmZpbmFsaXplKCk7XG5cblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cblx0XHRjb25zdCBoaWRkZW5BcmVhcyA9IHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLm1hcCgoYXJlYUlkKSA9PiB0aGlzLm1vZGVsLmdldERlY29yYXRpb25SYW5nZShhcmVhSWQpISkuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdGxldCBoaWRkZW5BcmVhU3RhcnQgPSAxLCBoaWRkZW5BcmVhRW5kID0gMDtcblx0XHRsZXQgaGlkZGVuQXJlYUlkeCA9IC0xO1xuXHRcdGxldCBuZXh0TGluZU51bWJlclRvVXBkYXRlSGlkZGVuQXJlYSA9IChoaWRkZW5BcmVhSWR4ICsgMSA8IGhpZGRlbkFyZWFzLmxlbmd0aCkgPyBoaWRkZW5BcmVhRW5kICsgMSA6IGxpbmVDb3VudCArIDI7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBuZXh0TGluZU51bWJlclRvVXBkYXRlSGlkZGVuQXJlYSkge1xuXHRcdFx0XHRoaWRkZW5BcmVhSWR4Kys7XG5cdFx0XHRcdGhpZGRlbkFyZWFTdGFydCA9IGhpZGRlbkFyZWFzW2hpZGRlbkFyZWFJZHhdLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0aGlkZGVuQXJlYUVuZCA9IGhpZGRlbkFyZWFzW2hpZGRlbkFyZWFJZHhdLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhID0gKGhpZGRlbkFyZWFJZHggKyAxIDwgaGlkZGVuQXJlYXMubGVuZ3RoKSA/IGhpZGRlbkFyZWFFbmQgKyAxIDogbGluZUNvdW50ICsgMjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNJbkhpZGRlbkFyZWEgPSAobGluZU51bWJlciA+PSBoaWRkZW5BcmVhU3RhcnQgJiYgbGluZU51bWJlciA8PSBoaWRkZW5BcmVhRW5kKTtcblx0XHRcdGNvbnN0IGxpbmUgPSBjcmVhdGVNb2RlbExpbmVQcm9qZWN0aW9uKGxpbmVzQnJlYWtzW2ldLCAhaXNJbkhpZGRlbkFyZWEpO1xuXHRcdFx0dmFsdWVzW2ldID0gbGluZS5nZXRWaWV3TGluZUNvdW50KCk7XG5cdFx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldID0gbGluZTtcblx0XHR9XG5cblx0XHR0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkID0gdGhpcy5tb2RlbC5nZXRWZXJzaW9uSWQoKTtcblxuXHRcdHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cyA9IG5ldyBDb25zdGFudFRpbWVQcmVmaXhTdW1Db21wdXRlcih2YWx1ZXMpO1xuXG5cdFx0dGhpcy5fZW5zdXJlQXRMZWFzdE9uZVZpc2libGVMaW5lKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlkZGVuQXJlYXMoKTogUmFuZ2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLm1hcChcblx0XHRcdChkZWNJZCkgPT4gdGhpcy5tb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjSWQpIVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SGlkZGVuQXJlYXMoX3JhbmdlczogUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbGlkYXRlZFJhbmdlcyA9IF9yYW5nZXMubWFwKHIgPT4gdGhpcy5tb2RlbC52YWxpZGF0ZVJhbmdlKHIpKTtcblx0XHRjb25zdCBuZXdSYW5nZXMgPSBub3JtYWxpemVMaW5lUmFuZ2VzKHZhbGlkYXRlZFJhbmdlcyk7XG5cblx0XHQvLyBUT0RPQE1hcnRpbjogUGxlYXNlIHN0b3AgY2FsbGluZyB0aGlzIG1ldGhvZCBvbiBlYWNoIG1vZGVsIGNoYW5nZSFcblxuXHRcdC8vIFRoaXMgY2hlY2tzIGlmIHRoZXJlIHJlYWxseSB3YXMgYSBjaGFuZ2Vcblx0XHRjb25zdCBvbGRSYW5nZXMgPSB0aGlzLmhpZGRlbkFyZWFzRGVjb3JhdGlvbklkcy5tYXAoKGFyZWFJZCkgPT4gdGhpcy5tb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoYXJlYUlkKSEpLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRpZiAobmV3UmFuZ2VzLmxlbmd0aCA9PT0gb2xkUmFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0bGV0IGhhc0RpZmZlcmVuY2UgPSBmYWxzZTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbmV3UmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICghbmV3UmFuZ2VzW2ldLmVxdWFsc1JhbmdlKG9sZFJhbmdlc1tpXSkpIHtcblx0XHRcdFx0XHRoYXNEaWZmZXJlbmNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNEaWZmZXJlbmNlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9ucyA9IG5ld1Jhbmdlcy5tYXA8SU1vZGVsRGVsdGFEZWNvcmF0aW9uPihcblx0XHRcdChyKSA9PlxuXHRcdFx0KHtcblx0XHRcdFx0cmFuZ2U6IHIsXG5cdFx0XHRcdG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuRU1QVFksXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLmhpZGRlbkFyZWFzRGVjb3JhdGlvbklkcyA9IHRoaXMubW9kZWwuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLmhpZGRlbkFyZWFzRGVjb3JhdGlvbklkcywgbmV3RGVjb3JhdGlvbnMpO1xuXG5cdFx0Y29uc3QgaGlkZGVuQXJlYXMgPSBuZXdSYW5nZXM7XG5cdFx0bGV0IGhpZGRlbkFyZWFTdGFydCA9IDEsIGhpZGRlbkFyZWFFbmQgPSAwO1xuXHRcdGxldCBoaWRkZW5BcmVhSWR4ID0gLTE7XG5cdFx0bGV0IG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhID0gKGhpZGRlbkFyZWFJZHggKyAxIDwgaGlkZGVuQXJlYXMubGVuZ3RoKSA/IGhpZGRlbkFyZWFFbmQgKyAxIDogdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucy5sZW5ndGggKyAyO1xuXG5cdFx0bGV0IGhhc1Zpc2libGVMaW5lID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBuZXh0TGluZU51bWJlclRvVXBkYXRlSGlkZGVuQXJlYSkge1xuXHRcdFx0XHRoaWRkZW5BcmVhSWR4Kys7XG5cdFx0XHRcdGhpZGRlbkFyZWFTdGFydCA9IGhpZGRlbkFyZWFzW2hpZGRlbkFyZWFJZHhdLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0aGlkZGVuQXJlYUVuZCA9IGhpZGRlbkFyZWFzW2hpZGRlbkFyZWFJZHhdLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhID0gKGhpZGRlbkFyZWFJZHggKyAxIDwgaGlkZGVuQXJlYXMubGVuZ3RoKSA/IGhpZGRlbkFyZWFFbmQgKyAxIDogdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucy5sZW5ndGggKyAyO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbGluZUNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGlmIChsaW5lTnVtYmVyID49IGhpZGRlbkFyZWFTdGFydCAmJiBsaW5lTnVtYmVyIDw9IGhpZGRlbkFyZWFFbmQpIHtcblx0XHRcdFx0Ly8gTGluZSBzaG91bGQgYmUgaGlkZGVuXG5cdFx0XHRcdGlmICh0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpXSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0uc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRcdFx0bGluZUNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNWaXNpYmxlTGluZSA9IHRydWU7XG5cdFx0XHRcdC8vIExpbmUgc2hvdWxkIGJlIHZpc2libGVcblx0XHRcdFx0aWYgKCF0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpXSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0uc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRcdFx0XHRsaW5lQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChsaW5lQ2hhbmdlZCkge1xuXHRcdFx0XHRjb25zdCBuZXdPdXRwdXRMaW5lQ291bnQgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRcdFx0dGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLnNldFZhbHVlKGksIG5ld091dHB1dExpbmVDb3VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFoYXNWaXNpYmxlTGluZSkge1xuXHRcdFx0Ly8gQ2Fubm90IGhhdmUgZXZlcnl0aGluZyBiZSBoaWRkZW4gPT4gcmV2ZWFsIGV2ZXJ5dGhpbmchXG5cdFx0XHR0aGlzLnNldEhpZGRlbkFyZWFzKFtdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBtb2RlbFBvc2l0aW9uSXNWaXNpYmxlKG1vZGVsTGluZU51bWJlcjogbnVtYmVyLCBfbW9kZWxDb2x1bW46IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmIChtb2RlbExpbmVOdW1iZXIgPCAxIHx8IG1vZGVsTGluZU51bWJlciA+IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBpbnZhbGlkIGFyZ3VtZW50c1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1ttb2RlbExpbmVOdW1iZXIgLSAxXS5pc1Zpc2libGUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNb2RlbExpbmVWaWV3TGluZUNvdW50KG1vZGVsTGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAobW9kZWxMaW5lTnVtYmVyIDwgMSB8fCBtb2RlbExpbmVOdW1iZXIgPiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gaW52YWxpZCBhcmd1bWVudHNcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1ttb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3TGluZUNvdW50KCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VGFiU2l6ZShuZXdUYWJTaXplOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy50YWJTaXplID09PSBuZXdUYWJTaXplKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMudGFiU2l6ZSA9IG5ld1RhYlNpemU7XG5cblx0XHR0aGlzLl9jb25zdHJ1Y3RMaW5lcygvKnJlc2V0SGlkZGVuQXJlYXMqL2ZhbHNlLCBudWxsKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIHNldFdyYXBwaW5nU2V0dGluZ3MoZm9udEluZm86IEZvbnRJbmZvLCB3cmFwcGluZ1N0cmF0ZWd5OiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcsIHdyYXBwaW5nQ29sdW1uOiBudW1iZXIsIHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCwgd29yZEJyZWFrOiAnbm9ybWFsJyB8ICdrZWVwQWxsJyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVxdWFsRm9udEluZm8gPSB0aGlzLmZvbnRJbmZvLmVxdWFscyhmb250SW5mbyk7XG5cdFx0Y29uc3QgZXF1YWxXcmFwcGluZ1N0cmF0ZWd5ID0gKHRoaXMud3JhcHBpbmdTdHJhdGVneSA9PT0gd3JhcHBpbmdTdHJhdGVneSk7XG5cdFx0Y29uc3QgZXF1YWxXcmFwcGluZ0NvbHVtbiA9ICh0aGlzLndyYXBwaW5nQ29sdW1uID09PSB3cmFwcGluZ0NvbHVtbik7XG5cdFx0Y29uc3QgZXF1YWxXcmFwcGluZ0luZGVudCA9ICh0aGlzLndyYXBwaW5nSW5kZW50ID09PSB3cmFwcGluZ0luZGVudCk7XG5cdFx0Y29uc3QgZXF1YWxXb3JkQnJlYWsgPSAodGhpcy53b3JkQnJlYWsgPT09IHdvcmRCcmVhayk7XG5cdFx0aWYgKGVxdWFsRm9udEluZm8gJiYgZXF1YWxXcmFwcGluZ1N0cmF0ZWd5ICYmIGVxdWFsV3JhcHBpbmdDb2x1bW4gJiYgZXF1YWxXcmFwcGluZ0luZGVudCAmJiBlcXVhbFdvcmRCcmVhaykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9ubHlXcmFwcGluZ0NvbHVtbkNoYW5nZWQgPSAoZXF1YWxGb250SW5mbyAmJiBlcXVhbFdyYXBwaW5nU3RyYXRlZ3kgJiYgIWVxdWFsV3JhcHBpbmdDb2x1bW4gJiYgZXF1YWxXcmFwcGluZ0luZGVudCAmJiBlcXVhbFdvcmRCcmVhayk7XG5cblx0XHR0aGlzLmZvbnRJbmZvID0gZm9udEluZm87XG5cdFx0dGhpcy53cmFwcGluZ1N0cmF0ZWd5ID0gd3JhcHBpbmdTdHJhdGVneTtcblx0XHR0aGlzLndyYXBwaW5nQ29sdW1uID0gd3JhcHBpbmdDb2x1bW47XG5cdFx0dGhpcy53cmFwcGluZ0luZGVudCA9IHdyYXBwaW5nSW5kZW50O1xuXHRcdHRoaXMud29yZEJyZWFrID0gd29yZEJyZWFrO1xuXG5cdFx0bGV0IHByZXZpb3VzTGluZUJyZWFrczogKChNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpW10pIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKG9ubHlXcmFwcGluZ0NvbHVtbkNoYW5nZWQpIHtcblx0XHRcdHByZXZpb3VzTGluZUJyZWFrcyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0cHJldmlvdXNMaW5lQnJlYWtzW2ldID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpXS5nZXRQcm9qZWN0aW9uRGF0YSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnN0cnVjdExpbmVzKC8qcmVzZXRIaWRkZW5BcmVhcyovZmFsc2UsIHByZXZpb3VzTGluZUJyZWFrcyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoX2NvbnRleHQ/OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCk6IElMaW5lQnJlYWtzQ29tcHV0ZXIge1xuXHRcdGNvbnN0IGxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkgPSAoXG5cdFx0XHR0aGlzLndyYXBwaW5nU3RyYXRlZ3kgPT09ICdhZHZhbmNlZCdcblx0XHRcdFx0PyB0aGlzLl9kb21MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5XG5cdFx0XHRcdDogdGhpcy5fbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeVxuXHRcdCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQgPSBfY29udGV4dCA/PyB7XG5cdFx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVJbmplY3RlZFRleHQ6IChsaW5lTnVtYmVyOiBudW1iZXIpOiBMaW5lSW5qZWN0ZWRUZXh0W10gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lSW5qZWN0ZWRUZXh0KGxpbmVOdW1iZXIsIHRoaXMuX2VkaXRvcklkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBsaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LmNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcihjb250ZXh0LCB0aGlzLmZvbnRJbmZvLCB0aGlzLnRhYlNpemUsIHRoaXMud3JhcHBpbmdDb2x1bW4sIHRoaXMud3JhcHBpbmdJbmRlbnQsIHRoaXMud29yZEJyZWFrLCB0aGlzLndyYXBPbkVzY2FwZWRMaW5lRmVlZHMpO1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxGbHVzaGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnN0cnVjdExpbmVzKC8qcmVzZXRIaWRkZW5BcmVhcyovdHJ1ZSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbExpbmVzRGVsZXRlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyKTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQgfCBudWxsIHtcblx0XHRpZiAoIXZlcnNpb25JZCB8fCB2ZXJzaW9uSWQgPD0gdGhpcy5fdmFsaWRNb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0Ly8gSGVyZSB3ZSBjaGVjayBmb3IgdmVyc2lvbklkIGluIGNhc2UgdGhlIGxpbmVzIHdlcmUgcmVjb25zdHJ1Y3RlZCBpbiB0aGUgbWVhbnRpbWUuXG5cdFx0XHQvLyBXZSBkb24ndCB3YW50IHRvIGFwcGx5IHN0YWxlIGNoYW5nZSBldmVudHMgb24gdG9wIG9mIGEgbmV3ZXIgcmVhZCBtb2RlbCBzdGF0ZS5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dEZyb21MaW5lTnVtYmVyID0gKGZyb21MaW5lTnVtYmVyID09PSAxID8gMSA6IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0oZnJvbUxpbmVOdW1iZXIgLSAxKSArIDEpO1xuXHRcdGNvbnN0IG91dHB1dFRvTGluZU51bWJlciA9IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0odG9MaW5lTnVtYmVyKTtcblxuXHRcdHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMuc3BsaWNlKGZyb21MaW5lTnVtYmVyIC0gMSwgdG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxKTtcblx0XHR0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMucmVtb3ZlVmFsdWVzKGZyb21MaW5lTnVtYmVyIC0gMSwgdG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxKTtcblxuXHRcdHJldHVybiBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQob3V0cHV0RnJvbUxpbmVOdW1iZXIsIG91dHB1dFRvTGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbExpbmVzSW5zZXJ0ZWQodmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCBfdG9MaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVCcmVha3M6IChNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpW10pOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQgfCBudWxsIHtcblx0XHRpZiAoIXZlcnNpb25JZCB8fCB2ZXJzaW9uSWQgPD0gdGhpcy5fdmFsaWRNb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0Ly8gSGVyZSB3ZSBjaGVjayBmb3IgdmVyc2lvbklkIGluIGNhc2UgdGhlIGxpbmVzIHdlcmUgcmVjb25zdHJ1Y3RlZCBpbiB0aGUgbWVhbnRpbWUuXG5cdFx0XHQvLyBXZSBkb24ndCB3YW50IHRvIGFwcGx5IHN0YWxlIGNoYW5nZSBldmVudHMgb24gdG9wIG9mIGEgbmV3ZXIgcmVhZCBtb2RlbCBzdGF0ZS5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIGNhbm5vdCB1c2UgdGhpcy5nZXRIaWRkZW5BcmVhcygpIGJlY2F1c2UgdGhvc2UgZGVjb3JhdGlvbnMgaGF2ZSBhbHJlYWR5IHNlZW4gdGhlIGVmZmVjdCBvZiB0aGlzIG1vZGVsIGNoYW5nZVxuXHRcdGNvbnN0IGlzSW5IaWRkZW5BcmVhID0gKGZyb21MaW5lTnVtYmVyID4gMiAmJiAhdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tmcm9tTGluZU51bWJlciAtIDJdLmlzVmlzaWJsZSgpKTtcblxuXHRcdGNvbnN0IG91dHB1dEZyb21MaW5lTnVtYmVyID0gKGZyb21MaW5lTnVtYmVyID09PSAxID8gMSA6IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0oZnJvbUxpbmVOdW1iZXIgLSAxKSArIDEpO1xuXG5cdFx0bGV0IHRvdGFsT3V0cHV0TGluZUNvdW50ID0gMDtcblx0XHRjb25zdCBpbnNlcnRMaW5lczogSU1vZGVsTGluZVByb2plY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGluc2VydFByZWZpeFN1bVZhbHVlczogbnVtYmVyW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lQnJlYWtzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gY3JlYXRlTW9kZWxMaW5lUHJvamVjdGlvbihsaW5lQnJlYWtzW2ldLCAhaXNJbkhpZGRlbkFyZWEpO1xuXHRcdFx0aW5zZXJ0TGluZXMucHVzaChsaW5lKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0TGluZUNvdW50ID0gbGluZS5nZXRWaWV3TGluZUNvdW50KCk7XG5cdFx0XHR0b3RhbE91dHB1dExpbmVDb3VudCArPSBvdXRwdXRMaW5lQ291bnQ7XG5cdFx0XHRpbnNlcnRQcmVmaXhTdW1WYWx1ZXNbaV0gPSBvdXRwdXRMaW5lQ291bnQ7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0BBbGV4OiB1c2UgYXJyYXlzLmFycmF5SW5zZXJ0XG5cdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucyA9XG5cdFx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLnNsaWNlKDAsIGZyb21MaW5lTnVtYmVyIC0gMSlcblx0XHRcdFx0LmNvbmNhdChpbnNlcnRMaW5lcylcblx0XHRcdFx0LmNvbmNhdCh0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLnNsaWNlKGZyb21MaW5lTnVtYmVyIC0gMSkpO1xuXG5cdFx0dGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmluc2VydFZhbHVlcyhmcm9tTGluZU51bWJlciAtIDEsIGluc2VydFByZWZpeFN1bVZhbHVlcyk7XG5cblx0XHRyZXR1cm4gbmV3IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudChvdXRwdXRGcm9tTGluZU51bWJlciwgb3V0cHV0RnJvbUxpbmVOdW1iZXIgKyB0b3RhbE91dHB1dExpbmVDb3VudCAtIDEpO1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxMaW5lQ2hhbmdlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGxpbmVOdW1iZXI6IG51bWJlciwgbGluZUJyZWFrRGF0YTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKTogW2Jvb2xlYW4sIHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50IHwgbnVsbCwgdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50IHwgbnVsbCwgdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQgfCBudWxsXSB7XG5cdFx0aWYgKHZlcnNpb25JZCAhPT0gbnVsbCAmJiB2ZXJzaW9uSWQgPD0gdGhpcy5fdmFsaWRNb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0Ly8gSGVyZSB3ZSBjaGVjayBmb3IgdmVyc2lvbklkIGluIGNhc2UgdGhlIGxpbmVzIHdlcmUgcmVjb25zdHJ1Y3RlZCBpbiB0aGUgbWVhbnRpbWUuXG5cdFx0XHQvLyBXZSBkb24ndCB3YW50IHRvIGFwcGx5IHN0YWxlIGNoYW5nZSBldmVudHMgb24gdG9wIG9mIGEgbmV3ZXIgcmVhZCBtb2RlbCBzdGF0ZS5cblx0XHRcdHJldHVybiBbZmFsc2UsIG51bGwsIG51bGwsIG51bGxdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSAxO1xuXG5cdFx0Y29uc3Qgb2xkT3V0cHV0TGluZUNvdW50ID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRjb25zdCBpc1Zpc2libGUgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uaXNWaXNpYmxlKCk7XG5cdFx0Y29uc3QgbGluZSA9IGNyZWF0ZU1vZGVsTGluZVByb2plY3Rpb24obGluZUJyZWFrRGF0YSwgaXNWaXNpYmxlKTtcblx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0gPSBsaW5lO1xuXHRcdGNvbnN0IG5ld091dHB1dExpbmVDb3VudCA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5nZXRWaWV3TGluZUNvdW50KCk7XG5cblx0XHRsZXQgbGluZU1hcHBpbmdDaGFuZ2VkID0gZmFsc2U7XG5cdFx0bGV0IGNoYW5nZUZyb20gPSAwO1xuXHRcdGxldCBjaGFuZ2VUbyA9IC0xO1xuXHRcdGxldCBpbnNlcnRGcm9tID0gMDtcblx0XHRsZXQgaW5zZXJ0VG8gPSAtMTtcblx0XHRsZXQgZGVsZXRlRnJvbSA9IDA7XG5cdFx0bGV0IGRlbGV0ZVRvID0gLTE7XG5cblx0XHRpZiAob2xkT3V0cHV0TGluZUNvdW50ID4gbmV3T3V0cHV0TGluZUNvdW50KSB7XG5cdFx0XHRjaGFuZ2VGcm9tID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShsaW5lTnVtYmVyIC0gMSkgKyAxO1xuXHRcdFx0Y2hhbmdlVG8gPSBjaGFuZ2VGcm9tICsgbmV3T3V0cHV0TGluZUNvdW50IC0gMTtcblx0XHRcdGRlbGV0ZUZyb20gPSBjaGFuZ2VUbyArIDE7XG5cdFx0XHRkZWxldGVUbyA9IGRlbGV0ZUZyb20gKyAob2xkT3V0cHV0TGluZUNvdW50IC0gbmV3T3V0cHV0TGluZUNvdW50KSAtIDE7XG5cdFx0XHRsaW5lTWFwcGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAob2xkT3V0cHV0TGluZUNvdW50IDwgbmV3T3V0cHV0TGluZUNvdW50KSB7XG5cdFx0XHRjaGFuZ2VGcm9tID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShsaW5lTnVtYmVyIC0gMSkgKyAxO1xuXHRcdFx0Y2hhbmdlVG8gPSBjaGFuZ2VGcm9tICsgb2xkT3V0cHV0TGluZUNvdW50IC0gMTtcblx0XHRcdGluc2VydEZyb20gPSBjaGFuZ2VUbyArIDE7XG5cdFx0XHRpbnNlcnRUbyA9IGluc2VydEZyb20gKyAobmV3T3V0cHV0TGluZUNvdW50IC0gb2xkT3V0cHV0TGluZUNvdW50KSAtIDE7XG5cdFx0XHRsaW5lTWFwcGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGFuZ2VGcm9tID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShsaW5lTnVtYmVyIC0gMSkgKyAxO1xuXHRcdFx0Y2hhbmdlVG8gPSBjaGFuZ2VGcm9tICsgbmV3T3V0cHV0TGluZUNvdW50IC0gMTtcblx0XHR9XG5cblx0XHR0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuc2V0VmFsdWUobGluZUluZGV4LCBuZXdPdXRwdXRMaW5lQ291bnQpO1xuXG5cdFx0Y29uc3Qgdmlld0xpbmVzQ2hhbmdlZEV2ZW50ID0gKGNoYW5nZUZyb20gPD0gY2hhbmdlVG8gPyBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQoY2hhbmdlRnJvbSwgY2hhbmdlVG8gLSBjaGFuZ2VGcm9tICsgMSkgOiBudWxsKTtcblx0XHRjb25zdCB2aWV3TGluZXNJbnNlcnRlZEV2ZW50ID0gKGluc2VydEZyb20gPD0gaW5zZXJ0VG8gPyBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KGluc2VydEZyb20sIGluc2VydFRvKSA6IG51bGwpO1xuXHRcdGNvbnN0IHZpZXdMaW5lc0RlbGV0ZWRFdmVudCA9IChkZWxldGVGcm9tIDw9IGRlbGV0ZVRvID8gbmV3IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KGRlbGV0ZUZyb20sIGRlbGV0ZVRvKSA6IG51bGwpO1xuXG5cdFx0cmV0dXJuIFtsaW5lTWFwcGluZ0NoYW5nZWQsIHZpZXdMaW5lc0NoYW5nZWRFdmVudCwgdmlld0xpbmVzSW5zZXJ0ZWRFdmVudCwgdmlld0xpbmVzRGVsZXRlZEV2ZW50XTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRWZXJzaW9uSWQodmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkID0gdmVyc2lvbklkO1xuXHRcdHRoaXMuX2Vuc3VyZUF0TGVhc3RPbmVWaXNpYmxlTGluZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQXRMZWFzdE9uZVZpc2libGVMaW5lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmdldFZpZXdMaW5lQ291bnQoKSA9PT0gMCAmJiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbMF0gPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zWzBdLnNldFZpc2libGUodHJ1ZSk7XG5cdFx0XHR0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuc2V0VmFsdWUoMCwgdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1swXS5nZXRWaWV3TGluZUNvdW50KCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRUb3RhbFN1bSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9WYWxpZFZpZXdMaW5lTnVtYmVyKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh2aWV3TGluZU51bWJlciA8IDEpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gdGhpcy5nZXRWaWV3TGluZUNvdW50KCk7XG5cdFx0aWYgKHZpZXdMaW5lTnVtYmVyID4gdmlld0xpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIHZpZXdMaW5lQ291bnQ7XG5cdFx0fVxuXHRcdHJldHVybiB2aWV3TGluZU51bWJlciB8IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlSW5kZW50R3VpZGUodmlld0xpbmVOdW1iZXI6IG51bWJlciwgbWluTGluZU51bWJlcjogbnVtYmVyLCBtYXhMaW5lTnVtYmVyOiBudW1iZXIpOiBJQWN0aXZlSW5kZW50R3VpZGVJbmZvIHtcblx0XHR2aWV3TGluZU51bWJlciA9IHRoaXMuX3RvVmFsaWRWaWV3TGluZU51bWJlcih2aWV3TGluZU51bWJlcik7XG5cdFx0bWluTGluZU51bWJlciA9IHRoaXMuX3RvVmFsaWRWaWV3TGluZU51bWJlcihtaW5MaW5lTnVtYmVyKTtcblx0XHRtYXhMaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKG1heExpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgbW9kZWxQb3NpdGlvbiA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3TGluZU51bWJlciwgdGhpcy5nZXRWaWV3TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcikpO1xuXHRcdGNvbnN0IG1vZGVsTWluUG9zaXRpb24gPSB0aGlzLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24obWluTGluZU51bWJlciwgdGhpcy5nZXRWaWV3TGluZU1pbkNvbHVtbihtaW5MaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3QgbW9kZWxNYXhQb3NpdGlvbiA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihtYXhMaW5lTnVtYmVyLCB0aGlzLmdldFZpZXdMaW5lTWluQ29sdW1uKG1heExpbmVOdW1iZXIpKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1vZGVsLmd1aWRlcy5nZXRBY3RpdmVJbmRlbnRHdWlkZShtb2RlbFBvc2l0aW9uLmxpbmVOdW1iZXIsIG1vZGVsTWluUG9zaXRpb24ubGluZU51bWJlciwgbW9kZWxNYXhQb3NpdGlvbi5saW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHZpZXdTdGFydFBvc2l0aW9uID0gdGhpcy5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGNvbnN0IHZpZXdFbmRQb3NpdGlvbiA9IHRoaXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihyZXN1bHQuZW5kTGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHJlc3VsdC5lbmRMaW5lTnVtYmVyKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogdmlld1N0YXJ0UG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdGVuZExpbmVOdW1iZXI6IHZpZXdFbmRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0aW5kZW50OiByZXN1bHQuaW5kZW50XG5cdFx0fTtcblx0fVxuXG5cdC8vICNyZWdpb24gVmlld0xpbmVJbmZvXG5cblx0cHJpdmF0ZSBnZXRWaWV3TGluZUluZm8odmlld0xpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lSW5mbyB7XG5cdFx0dmlld0xpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld0xpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHIgPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0SW5kZXhPZih2aWV3TGluZU51bWJlciAtIDEpO1xuXHRcdGNvbnN0IGxpbmVJbmRleCA9IHIuaW5kZXg7XG5cdFx0Y29uc3QgcmVtYWluZGVyID0gci5yZW1haW5kZXI7XG5cdFx0cmV0dXJuIG5ldyBWaWV3TGluZUluZm8obGluZUluZGV4ICsgMSwgcmVtYWluZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWluQ29sdW1uT2ZWaWV3TGluZSh2aWV3TGluZUluZm86IFZpZXdMaW5lSW5mbyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lTWluQ29sdW1uKFxuXHRcdFx0dGhpcy5tb2RlbCxcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIsXG5cdFx0XHR2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHhcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXhDb2x1bW5PZlZpZXdMaW5lKHZpZXdMaW5lSW5mbzogVmlld0xpbmVJbmZvKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oXG5cdFx0XHR0aGlzLm1vZGVsLFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlcixcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVsU3RhcnRQb3NpdGlvbk9mVmlld0xpbmUodmlld0xpbmVJbmZvOiBWaWV3TGluZUluZm8pOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdO1xuXHRcdGNvbnN0IG1pblZpZXdDb2x1bW4gPSBsaW5lLmdldFZpZXdMaW5lTWluQ29sdW1uKFxuXHRcdFx0dGhpcy5tb2RlbCxcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIsXG5cdFx0XHR2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHhcblx0XHQpO1xuXHRcdGNvbnN0IGNvbHVtbiA9IGxpbmUuZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbihcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCxcblx0XHRcdG1pblZpZXdDb2x1bW5cblx0XHQpO1xuXHRcdHJldHVybiBuZXcgUG9zaXRpb24odmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxFbmRQb3NpdGlvbk9mVmlld0xpbmUodmlld0xpbmVJbmZvOiBWaWV3TGluZUluZm8pOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdO1xuXHRcdGNvbnN0IG1heFZpZXdDb2x1bW4gPSBsaW5lLmdldFZpZXdMaW5lTWF4Q29sdW1uKFxuXHRcdFx0dGhpcy5tb2RlbCxcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIsXG5cdFx0XHR2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHhcblx0XHQpO1xuXHRcdGNvbnN0IGNvbHVtbiA9IGxpbmUuZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbihcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCxcblx0XHRcdG1heFZpZXdDb2x1bW5cblx0XHQpO1xuXHRcdHJldHVybiBuZXcgUG9zaXRpb24odmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0xpbmVJbmZvc0dyb3VwZWRCeU1vZGVsUmFuZ2VzKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lSW5mb0dyb3VwZWRCeU1vZGVsUmFuZ2VbXSB7XG5cdFx0Y29uc3Qgc3RhcnRWaWV3TGluZSA9IHRoaXMuZ2V0Vmlld0xpbmVJbmZvKHZpZXdTdGFydExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGVuZFZpZXdMaW5lID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld0VuZExpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PFZpZXdMaW5lSW5mb0dyb3VwZWRCeU1vZGVsUmFuZ2U+KCk7XG5cdFx0bGV0IGxhc3RWaXNpYmxlTW9kZWxQb3M6IFBvc2l0aW9uIHwgbnVsbCA9IHRoaXMuZ2V0TW9kZWxTdGFydFBvc2l0aW9uT2ZWaWV3TGluZShzdGFydFZpZXdMaW5lKTtcblx0XHRsZXQgdmlld0xpbmVzID0gbmV3IEFycmF5PFZpZXdMaW5lSW5mbz4oKTtcblxuXHRcdGZvciAobGV0IGN1ck1vZGVsTGluZSA9IHN0YXJ0Vmlld0xpbmUubW9kZWxMaW5lTnVtYmVyOyBjdXJNb2RlbExpbmUgPD0gZW5kVmlld0xpbmUubW9kZWxMaW5lTnVtYmVyOyBjdXJNb2RlbExpbmUrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbY3VyTW9kZWxMaW5lIC0gMV07XG5cblx0XHRcdGlmIChsaW5lLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID1cblx0XHRcdFx0XHRjdXJNb2RlbExpbmUgPT09IHN0YXJ0Vmlld0xpbmUubW9kZWxMaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQ/IHN0YXJ0Vmlld0xpbmUubW9kZWxMaW5lV3JhcHBlZExpbmVJZHhcblx0XHRcdFx0XHRcdDogMDtcblxuXHRcdFx0XHRjb25zdCBlbmRPZmZzZXQgPVxuXHRcdFx0XHRcdGN1ck1vZGVsTGluZSA9PT0gZW5kVmlld0xpbmUubW9kZWxMaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQ/IGVuZFZpZXdMaW5lLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4ICsgMVxuXHRcdFx0XHRcdFx0OiBsaW5lLmdldFZpZXdMaW5lQ291bnQoKTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gc3RhcnRPZmZzZXQ7IGkgPCBlbmRPZmZzZXQ7IGkrKykge1xuXHRcdFx0XHRcdHZpZXdMaW5lcy5wdXNoKG5ldyBWaWV3TGluZUluZm8oY3VyTW9kZWxMaW5lLCBpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFsaW5lLmlzVmlzaWJsZSgpICYmIGxhc3RWaXNpYmxlTW9kZWxQb3MpIHtcblx0XHRcdFx0Y29uc3QgbGFzdFZpc2libGVNb2RlbFBvczIgPSBuZXcgUG9zaXRpb24oY3VyTW9kZWxMaW5lIC0gMSwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGN1ck1vZGVsTGluZSAtIDEpICsgMSk7XG5cblx0XHRcdFx0Y29uc3QgbW9kZWxSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMobGFzdFZpc2libGVNb2RlbFBvcywgbGFzdFZpc2libGVNb2RlbFBvczIpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgVmlld0xpbmVJbmZvR3JvdXBlZEJ5TW9kZWxSYW5nZShtb2RlbFJhbmdlLCB2aWV3TGluZXMpKTtcblx0XHRcdFx0dmlld0xpbmVzID0gW107XG5cblx0XHRcdFx0bGFzdFZpc2libGVNb2RlbFBvcyA9IG51bGw7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuaXNWaXNpYmxlKCkgJiYgIWxhc3RWaXNpYmxlTW9kZWxQb3MpIHtcblx0XHRcdFx0bGFzdFZpc2libGVNb2RlbFBvcyA9IG5ldyBQb3NpdGlvbihjdXJNb2RlbExpbmUsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChsYXN0VmlzaWJsZU1vZGVsUG9zKSB7XG5cdFx0XHRjb25zdCBtb2RlbFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhsYXN0VmlzaWJsZU1vZGVsUG9zLCB0aGlzLmdldE1vZGVsRW5kUG9zaXRpb25PZlZpZXdMaW5lKGVuZFZpZXdMaW5lKSk7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgVmlld0xpbmVJbmZvR3JvdXBlZEJ5TW9kZWxSYW5nZShtb2RlbFJhbmdlLCB2aWV3TGluZXMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZXNCcmFja2V0R3VpZGVzKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlciwgYWN0aXZlVmlld1Bvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLCBvcHRpb25zOiBCcmFja2V0R3VpZGVPcHRpb25zKTogSW5kZW50R3VpZGVbXVtdIHtcblx0XHRjb25zdCBtb2RlbEFjdGl2ZVBvc2l0aW9uID0gYWN0aXZlVmlld1Bvc2l0aW9uID8gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKGFjdGl2ZVZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCBhY3RpdmVWaWV3UG9zaXRpb24uY29sdW1uKSA6IG51bGw7XG5cdFx0Y29uc3QgcmVzdWx0UGVyVmlld0xpbmU6IEluZGVudEd1aWRlW11bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdldFZpZXdMaW5lSW5mb3NHcm91cGVkQnlNb2RlbFJhbmdlcyh2aWV3U3RhcnRMaW5lTnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcikpIHtcblx0XHRcdGNvbnN0IG1vZGVsUmFuZ2VTdGFydExpbmVOdW1iZXIgPSBncm91cC5tb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0Y29uc3QgYnJhY2tldEd1aWRlc1Blck1vZGVsTGluZSA9IHRoaXMubW9kZWwuZ3VpZGVzLmdldExpbmVzQnJhY2tldEd1aWRlcyhcblx0XHRcdFx0bW9kZWxSYW5nZVN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0Z3JvdXAubW9kZWxSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRtb2RlbEFjdGl2ZVBvc2l0aW9uLFxuXHRcdFx0XHRvcHRpb25zXG5cdFx0XHQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdMaW5lSW5mbyBvZiBncm91cC52aWV3TGluZXMpIHtcblxuXHRcdFx0XHRjb25zdCBicmFja2V0R3VpZGVzID0gYnJhY2tldEd1aWRlc1Blck1vZGVsTGluZVt2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gbW9kZWxSYW5nZVN0YXJ0TGluZU51bWJlcl07XG5cblx0XHRcdFx0Ly8gdmlzaWJsZUNvbHVtbnMgc3RheSBhcyB0aGV5IGFyZSAodGhpcyBpcyBhIGJ1ZyBhbmQgbmVlZHMgdG8gYmUgZml4ZWQsIGJ1dCBpdCBpcyBub3QgYSByZWdyZXNzaW9uKVxuXHRcdFx0XHQvLyBtb2RlbC1jb2x1bW5zIG11c3QgYmUgY29udmVydGVkIHRvIHZpZXctbW9kZWwgY29sdW1ucy5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYnJhY2tldEd1aWRlcy5tYXAoZyA9PiB7XG5cdFx0XHRcdFx0aWYgKGcuZm9yV3JhcHBlZExpbmVzQWZ0ZXJDb2x1bW4gIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGcuZm9yV3JhcHBlZExpbmVzQWZ0ZXJDb2x1bW4pO1xuXHRcdFx0XHRcdFx0aWYgKHAubGluZU51bWJlciA+PSB2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZy5mb3JXcmFwcGVkTGluZXNCZWZvcmVPckF0Q29sdW1uICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcCA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBnLmZvcldyYXBwZWRMaW5lc0JlZm9yZU9yQXRDb2x1bW4pO1xuXHRcdFx0XHRcdFx0aWYgKHAubGluZU51bWJlciA8IHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghZy5ob3Jpem9udGFsTGluZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGNvbHVtbiA9IC0xO1xuXHRcdFx0XHRcdGlmIChnLmNvbHVtbiAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHAgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW3ZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oMCwgZy5jb2x1bW4pO1xuXHRcdFx0XHRcdFx0aWYgKHAubGluZU51bWJlciA9PT0gdmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KSB7XG5cdFx0XHRcdFx0XHRcdGNvbHVtbiA9IHAuY29sdW1uO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwLmxpbmVOdW1iZXIgPCB2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpIHtcblx0XHRcdFx0XHRcdFx0Y29sdW1uID0gdGhpcy5nZXRNaW5Db2x1bW5PZlZpZXdMaW5lKHZpZXdMaW5lSW5mbyk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHAubGluZU51bWJlciA+IHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHRoaXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbih2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyLCBnLmhvcml6b250YWxMaW5lLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0Y29uc3QgcCA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBnLmhvcml6b250YWxMaW5lLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0aWYgKHAubGluZU51bWJlciA9PT0gdmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEluZGVudEd1aWRlKGcudmlzaWJsZUNvbHVtbiwgY29sdW1uLCBnLmNsYXNzTmFtZSxcblx0XHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlSG9yaXpvbnRhbExpbmUoZy5ob3Jpem9udGFsTGluZS50b3AsXG5cdFx0XHRcdFx0XHRcdFx0dmlld1Bvc2l0aW9uLmNvbHVtbiksXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwLmxpbmVOdW1iZXIgPCB2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChnLnZpc2libGVDb2x1bW4gIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdC8vIERvbid0IHJlcGVhdCBob3Jpem9udGFsIGxpbmVzIHRoYXQgdXNlIHZpc2libGVDb2x1bW4gZm9yIHVucmVsYXRlZCBsaW5lcy5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBuZXcgSW5kZW50R3VpZGUoZy52aXNpYmxlQ29sdW1uLCBjb2x1bW4sIGcuY2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGVIb3Jpem9udGFsTGluZShnLmhvcml6b250YWxMaW5lLnRvcCxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmdldE1heENvbHVtbk9mVmlld0xpbmUodmlld0xpbmVJbmZvKVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc3VsdFBlclZpZXdMaW5lLnB1c2gocmVzdWx0LmZpbHRlcigocik6IHIgaXMgSW5kZW50R3VpZGUgPT4gISFyKSk7XG5cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0UGVyVmlld0xpbmU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlcltdIHtcblx0XHQvLyBUT0RPOiBVc2UgdGhlIHNhbWUgY29kZSBhcyBpbiBgZ2V0Vmlld0xpbmVzQnJhY2tldEd1aWRlc2AuXG5cdFx0Ly8gRnV0dXJlIFRPRE86IE1lcmdlIHdpdGggYGdldFZpZXdMaW5lc0JyYWNrZXRHdWlkZXNgLlxuXHRcdC8vIEhvd2V2ZXIsIHRoaXMgcmVxdWlyZXMgbW9yZSByZWZhY3RvcmluZyBvZiBpbmRlbnQgZ3VpZGVzLlxuXHRcdHZpZXdTdGFydExpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld1N0YXJ0TGluZU51bWJlcik7XG5cdFx0dmlld0VuZExpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld0VuZExpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgbW9kZWxTdGFydCA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3U3RhcnRMaW5lTnVtYmVyLCB0aGlzLmdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdTdGFydExpbmVOdW1iZXIpKTtcblx0XHRjb25zdCBtb2RlbEVuZCA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3RW5kTGluZU51bWJlciwgdGhpcy5nZXRWaWV3TGluZU1heENvbHVtbih2aWV3RW5kTGluZU51bWJlcikpO1xuXG5cdFx0bGV0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHRSZXBlYXRDb3VudDogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHRSZXBlYXRPcHRpb246IEluZGVudEd1aWRlUmVwZWF0T3B0aW9uW10gPSBbXTtcblx0XHRjb25zdCBtb2RlbFN0YXJ0TGluZUluZGV4ID0gbW9kZWxTdGFydC5saW5lTnVtYmVyIC0gMTtcblx0XHRjb25zdCBtb2RlbEVuZExpbmVJbmRleCA9IG1vZGVsRW5kLmxpbmVOdW1iZXIgLSAxO1xuXG5cdFx0bGV0IHJlcVN0YXJ0OiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IG1vZGVsTGluZUluZGV4ID0gbW9kZWxTdGFydExpbmVJbmRleDsgbW9kZWxMaW5lSW5kZXggPD0gbW9kZWxFbmRMaW5lSW5kZXg7IG1vZGVsTGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW21vZGVsTGluZUluZGV4XTtcblx0XHRcdGlmIChsaW5lLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdMaW5lU3RhcnRJbmRleCA9IGxpbmUuZ2V0Vmlld0xpbmVOdW1iZXJPZk1vZGVsUG9zaXRpb24oMCwgbW9kZWxMaW5lSW5kZXggPT09IG1vZGVsU3RhcnRMaW5lSW5kZXggPyBtb2RlbFN0YXJ0LmNvbHVtbiA6IDEpO1xuXHRcdFx0XHRjb25zdCB2aWV3TGluZUVuZEluZGV4ID0gbGluZS5nZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbigwLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lSW5kZXggKyAxKSk7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gdmlld0xpbmVFbmRJbmRleCAtIHZpZXdMaW5lU3RhcnRJbmRleCArIDE7XG5cdFx0XHRcdGxldCBvcHRpb24gPSBJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbi5CbG9ja05vbmU7XG5cdFx0XHRcdGlmIChjb3VudCA+IDEgJiYgbGluZS5nZXRWaWV3TGluZU1pbkNvbHVtbih0aGlzLm1vZGVsLCBtb2RlbExpbmVJbmRleCArIDEsIHZpZXdMaW5lRW5kSW5kZXgpID09PSAxKSB7XG5cdFx0XHRcdFx0Ly8gd3JhcHBlZCBsaW5lcyBzaG91bGQgYmxvY2sgaW5kZW50IGd1aWRlc1xuXHRcdFx0XHRcdG9wdGlvbiA9ICh2aWV3TGluZVN0YXJ0SW5kZXggPT09IDAgPyBJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbi5CbG9ja1N1YnNlcXVlbnQgOiBJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbi5CbG9ja0FsbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0UmVwZWF0Q291bnQucHVzaChjb3VudCk7XG5cdFx0XHRcdHJlc3VsdFJlcGVhdE9wdGlvbi5wdXNoKG9wdGlvbik7XG5cdFx0XHRcdC8vIG1lcmdlIGludG8gcHJldmlvdXMgcmVxdWVzdFxuXHRcdFx0XHRpZiAocmVxU3RhcnQgPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXFTdGFydCA9IG5ldyBQb3NpdGlvbihtb2RlbExpbmVJbmRleCArIDEsIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBoaXQgaW52aXNpYmxlIGxpbmUgPT4gZmx1c2ggcmVxdWVzdFxuXHRcdFx0XHRpZiAocmVxU3RhcnQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMubW9kZWwuZ3VpZGVzLmdldExpbmVzSW5kZW50R3VpZGVzKHJlcVN0YXJ0LmxpbmVOdW1iZXIsIG1vZGVsTGluZUluZGV4KSk7XG5cdFx0XHRcdFx0cmVxU3RhcnQgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlcVN0YXJ0ICE9PSBudWxsKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMubW9kZWwuZ3VpZGVzLmdldExpbmVzSW5kZW50R3VpZGVzKHJlcVN0YXJ0LmxpbmVOdW1iZXIsIG1vZGVsRW5kLmxpbmVOdW1iZXIpKTtcblx0XHRcdHJlcVN0YXJ0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gdmlld0VuZExpbmVOdW1iZXIgLSB2aWV3U3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCB2aWV3SW5kZW50cyA9IG5ldyBBcnJheTxudW1iZXI+KHZpZXdMaW5lQ291bnQpO1xuXHRcdGxldCBjdXJySW5kZXggPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByZXN1bHQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGxldCB2YWx1ZSA9IHJlc3VsdFtpXTtcblx0XHRcdGNvbnN0IGNvdW50ID0gTWF0aC5taW4odmlld0xpbmVDb3VudCAtIGN1cnJJbmRleCwgcmVzdWx0UmVwZWF0Q291bnRbaV0pO1xuXHRcdFx0Y29uc3Qgb3B0aW9uID0gcmVzdWx0UmVwZWF0T3B0aW9uW2ldO1xuXHRcdFx0bGV0IGJsb2NrQXRJbmRleDogbnVtYmVyO1xuXHRcdFx0aWYgKG9wdGlvbiA9PT0gSW5kZW50R3VpZGVSZXBlYXRPcHRpb24uQmxvY2tBbGwpIHtcblx0XHRcdFx0YmxvY2tBdEluZGV4ID0gMDtcblx0XHRcdH0gZWxzZSBpZiAob3B0aW9uID09PSBJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbi5CbG9ja1N1YnNlcXVlbnQpIHtcblx0XHRcdFx0YmxvY2tBdEluZGV4ID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJsb2NrQXRJbmRleCA9IGNvdW50O1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG5cdFx0XHRcdGlmIChqID09PSBibG9ja0F0SW5kZXgpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlld0luZGVudHNbY3VyckluZGV4KytdID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2aWV3SW5kZW50cztcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUNvbnRlbnQodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZ2V0Vmlld0xpbmVJbmZvKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lQ29udGVudCh0aGlzLm1vZGVsLCBpbmZvLm1vZGVsTGluZU51bWJlciwgaW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVMZW5ndGgodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZ2V0Vmlld0xpbmVJbmZvKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lTGVuZ3RoKHRoaXMubW9kZWwsIGluZm8ubW9kZWxMaW5lTnVtYmVyLCBpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld0xpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2luZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVNaW5Db2x1bW4odGhpcy5tb2RlbCwgaW5mby5tb2RlbExpbmVOdW1iZXIsIGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyh2aWV3TGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3TGluZU1heENvbHVtbih0aGlzLm1vZGVsLCBpbmZvLm1vZGVsTGluZU51bWJlciwgaW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVEYXRhKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBWaWV3TGluZURhdGEge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyh2aWV3TGluZU51bWJlcik7XG5cdFx0Y29uc3QgYmFzZVZpZXdMaW5lTnVtYmVyID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShpbmZvLm1vZGVsTGluZU51bWJlciAtIDEpICsgMTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lRGF0YSh0aGlzLm1vZGVsLCBpbmZvLm1vZGVsTGluZU51bWJlciwgaW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCwgYmFzZVZpZXdMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZXNEYXRhKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiBWaWV3TGluZURhdGFbXSB7XG5cblx0XHR2aWV3U3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKHZpZXdTdGFydExpbmVOdW1iZXIpO1xuXHRcdHZpZXdFbmRMaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKHZpZXdFbmRMaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldEluZGV4T2Yodmlld1N0YXJ0TGluZU51bWJlciAtIDEpO1xuXHRcdGxldCB2aWV3TGluZU51bWJlciA9IHZpZXdTdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRNb2RlbExpbmVJbmRleCA9IHN0YXJ0LmluZGV4O1xuXHRcdGNvbnN0IHN0YXJ0UmVtYWluZGVyID0gc3RhcnQucmVtYWluZGVyO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBWaWV3TGluZURhdGFbXSA9IFtdO1xuXHRcdGZvciAobGV0IG1vZGVsTGluZUluZGV4ID0gc3RhcnRNb2RlbExpbmVJbmRleCwgbGVuID0gdGhpcy5tb2RlbC5nZXRMaW5lQ291bnQoKTsgbW9kZWxMaW5lSW5kZXggPCBsZW47IG1vZGVsTGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW21vZGVsTGluZUluZGV4XTtcblx0XHRcdGlmICghbGluZS5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZyb21WaWV3TGluZUluZGV4ID0gKG1vZGVsTGluZUluZGV4ID09PSBzdGFydE1vZGVsTGluZUluZGV4ID8gc3RhcnRSZW1haW5kZXIgOiAwKTtcblx0XHRcdGxldCByZW1haW5pbmdWaWV3TGluZUNvdW50ID0gbGluZS5nZXRWaWV3TGluZUNvdW50KCkgLSBmcm9tVmlld0xpbmVJbmRleDtcblxuXHRcdFx0bGV0IGxhc3RMaW5lID0gZmFsc2U7XG5cdFx0XHRpZiAodmlld0xpbmVOdW1iZXIgKyByZW1haW5pbmdWaWV3TGluZUNvdW50ID4gdmlld0VuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0bGFzdExpbmUgPSB0cnVlO1xuXHRcdFx0XHRyZW1haW5pbmdWaWV3TGluZUNvdW50ID0gdmlld0VuZExpbmVOdW1iZXIgLSB2aWV3TGluZU51bWJlciArIDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiYXNlVmlld0xpbmVOdW1iZXIgPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKG1vZGVsTGluZUluZGV4KSArIDE7XG5cdFx0XHRsaW5lLmdldFZpZXdMaW5lc0RhdGEodGhpcy5tb2RlbCwgbW9kZWxMaW5lSW5kZXggKyAxLCBmcm9tVmlld0xpbmVJbmRleCwgcmVtYWluaW5nVmlld0xpbmVDb3VudCwgYmFzZVZpZXdMaW5lTnVtYmVyLCB2aWV3TGluZU51bWJlciAtIHZpZXdTdGFydExpbmVOdW1iZXIsIG5lZWRlZCwgcmVzdWx0KTtcblxuXHRcdFx0dmlld0xpbmVOdW1iZXIgKz0gcmVtYWluaW5nVmlld0xpbmVDb3VudDtcblxuXHRcdFx0aWYgKGxhc3RMaW5lKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVWaWV3UG9zaXRpb24odmlld0xpbmVOdW1iZXI6IG51bWJlciwgdmlld0NvbHVtbjogbnVtYmVyLCBleHBlY3RlZE1vZGVsUG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdHZpZXdMaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKHZpZXdMaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHIgPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0SW5kZXhPZih2aWV3TGluZU51bWJlciAtIDEpO1xuXHRcdGNvbnN0IGxpbmVJbmRleCA9IHIuaW5kZXg7XG5cdFx0Y29uc3QgcmVtYWluZGVyID0gci5yZW1haW5kZXI7XG5cblx0XHRjb25zdCBsaW5lID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdO1xuXG5cdFx0Y29uc3QgbWluQ29sdW1uID0gbGluZS5nZXRWaWV3TGluZU1pbkNvbHVtbih0aGlzLm1vZGVsLCBsaW5lSW5kZXggKyAxLCByZW1haW5kZXIpO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IGxpbmUuZ2V0Vmlld0xpbmVNYXhDb2x1bW4odGhpcy5tb2RlbCwgbGluZUluZGV4ICsgMSwgcmVtYWluZGVyKTtcblx0XHRpZiAodmlld0NvbHVtbiA8IG1pbkNvbHVtbikge1xuXHRcdFx0dmlld0NvbHVtbiA9IG1pbkNvbHVtbjtcblx0XHR9XG5cdFx0aWYgKHZpZXdDb2x1bW4gPiBtYXhDb2x1bW4pIHtcblx0XHRcdHZpZXdDb2x1bW4gPSBtYXhDb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcHV0ZWRNb2RlbENvbHVtbiA9IGxpbmUuZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbihyZW1haW5kZXIsIHZpZXdDb2x1bW4pO1xuXHRcdGNvbnN0IGNvbXB1dGVkTW9kZWxQb3NpdGlvbiA9IHRoaXMubW9kZWwudmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24obGluZUluZGV4ICsgMSwgY29tcHV0ZWRNb2RlbENvbHVtbikpO1xuXG5cdFx0aWYgKGNvbXB1dGVkTW9kZWxQb3NpdGlvbi5lcXVhbHMoZXhwZWN0ZWRNb2RlbFBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih2aWV3TGluZU51bWJlciwgdmlld0NvbHVtbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihleHBlY3RlZE1vZGVsUG9zaXRpb24ubGluZU51bWJlciwgZXhwZWN0ZWRNb2RlbFBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVWaWV3UmFuZ2Uodmlld1JhbmdlOiBSYW5nZSwgZXhwZWN0ZWRNb2RlbFJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRjb25zdCB2YWxpZFZpZXdTdGFydCA9IHRoaXMudmFsaWRhdGVWaWV3UG9zaXRpb24odmlld1JhbmdlLnN0YXJ0TGluZU51bWJlciwgdmlld1JhbmdlLnN0YXJ0Q29sdW1uLCBleHBlY3RlZE1vZGVsUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRjb25zdCB2YWxpZFZpZXdFbmQgPSB0aGlzLnZhbGlkYXRlVmlld1Bvc2l0aW9uKHZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyLCB2aWV3UmFuZ2UuZW5kQ29sdW1uLCBleHBlY3RlZE1vZGVsUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSh2YWxpZFZpZXdTdGFydC5saW5lTnVtYmVyLCB2YWxpZFZpZXdTdGFydC5jb2x1bW4sIHZhbGlkVmlld0VuZC5saW5lTnVtYmVyLCB2YWxpZFZpZXdFbmQuY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBjb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIsIHZpZXdDb2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld0xpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgaW5wdXRDb2x1bW4gPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2luZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbihpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LCB2aWV3Q29sdW1uKTtcblx0XHQvLyBjb25zb2xlLmxvZygnb3V0IC0+IGluICcgKyB2aWV3TGluZU51bWJlciArICcsJyArIHZpZXdDb2x1bW4gKyAnID09PT4gJyArIChsaW5lSW5kZXgrMSkgKyAnLCcgKyBpbnB1dENvbHVtbik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwudmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oaW5mby5tb2RlbExpbmVOdW1iZXIsIGlucHV0Q29sdW1uKSk7XG5cdH1cblxuXHRwdWJsaWMgY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZSh2aWV3UmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIsIHZpZXdSYW5nZS5zdGFydENvbHVtbik7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyLCB2aWV3UmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LmxpbmVOdW1iZXIsIHN0YXJ0LmNvbHVtbiwgZW5kLmxpbmVOdW1iZXIsIGVuZC5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIGNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24oX21vZGVsTGluZU51bWJlcjogbnVtYmVyLCBfbW9kZWxDb2x1bW46IG51bWJlciwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgPSBQb3NpdGlvbkFmZmluaXR5Lk5vbmUsIGFsbG93WmVyb0xpbmVOdW1iZXI6IGJvb2xlYW4gPSBmYWxzZSwgYmVsb3dIaWRkZW5SYW5nZXM6IGJvb2xlYW4gPSBmYWxzZSk6IFBvc2l0aW9uIHtcblxuXHRcdGNvbnN0IHZhbGlkUG9zaXRpb24gPSB0aGlzLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKF9tb2RlbExpbmVOdW1iZXIsIF9tb2RlbENvbHVtbikpO1xuXHRcdGNvbnN0IGlucHV0TGluZU51bWJlciA9IHZhbGlkUG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBpbnB1dENvbHVtbiA9IHZhbGlkUG9zaXRpb24uY29sdW1uO1xuXG5cdFx0bGV0IGxpbmVJbmRleCA9IGlucHV0TGluZU51bWJlciAtIDEsIGxpbmVJbmRleENoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAoYmVsb3dIaWRkZW5SYW5nZXMpIHtcblx0XHRcdHdoaWxlIChsaW5lSW5kZXggPCB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aCAmJiAhdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGxpbmVJbmRleCsrO1xuXHRcdFx0XHRsaW5lSW5kZXhDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0d2hpbGUgKGxpbmVJbmRleCA+IDAgJiYgIXRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRsaW5lSW5kZXgtLTtcblx0XHRcdFx0bGluZUluZGV4Q2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChsaW5lSW5kZXggPT09IDAgJiYgIXRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKSkge1xuXHRcdFx0Ly8gQ291bGQgbm90IHJlYWNoIGEgcmVhbCBsaW5lXG5cdFx0XHQvLyBjb25zb2xlLmxvZygnaW4gLT4gb3V0ICcgKyBpbnB1dExpbmVOdW1iZXIgKyAnLCcgKyBpbnB1dENvbHVtbiArICcgPT09PiAnICsgMSArICcsJyArIDEpO1xuXHRcdFx0Ly8gVE9ET0BhbGV4ZGltYUBoZWRpZXQgdGhpcyBpc24ndCBzb28gcHJldHR5XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGFsbG93WmVyb0xpbmVOdW1iZXIgPyAwIDogMSwgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlbHRhTGluZU51bWJlciA9IDEgKyB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVJbmRleCk7XG5cblx0XHRsZXQgcjogUG9zaXRpb247XG5cdFx0aWYgKGxpbmVJbmRleENoYW5nZWQpIHtcblx0XHRcdGlmIChiZWxvd0hpZGRlblJhbmdlcykge1xuXHRcdFx0XHRyID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbihkZWx0YUxpbmVOdW1iZXIsIDEsIGFmZmluaXR5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHIgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKGRlbHRhTGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVJbmRleCArIDEpLCBhZmZpbml0eSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHIgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2lucHV0TGluZU51bWJlciAtIDFdLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbihkZWx0YUxpbmVOdW1iZXIsIGlucHV0Q29sdW1uLCBhZmZpbml0eSk7XG5cdFx0fVxuXG5cdFx0Ly8gY29uc29sZS5sb2coJ2luIC0+IG91dCAnICsgaW5wdXRMaW5lTnVtYmVyICsgJywnICsgaW5wdXRDb2x1bW4gKyAnID09PT4gJyArIHIubGluZU51bWJlciArICcsJyArIHIpO1xuXHRcdHJldHVybiByO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBhZmZpbml0eSBUaGUgYWZmaW5pdHkgaW4gY2FzZSBvZiBhbiBlbXB0eSByYW5nZS4gSGFzIG5vIGVmZmVjdCBmb3Igbm9uLWVtcHR5IHJhbmdlcy5cblx0Ki9cblx0cHVibGljIGNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UobW9kZWxSYW5nZTogUmFuZ2UsIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5ID0gUG9zaXRpb25BZmZpbml0eS5MZWZ0KTogUmFuZ2Uge1xuXHRcdGlmIChtb2RlbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIG1vZGVsUmFuZ2Uuc3RhcnRDb2x1bW4sIGFmZmluaXR5KTtcblx0XHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIG1vZGVsUmFuZ2Uuc3RhcnRDb2x1bW4sIFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQpO1xuXHRcdFx0Y29uc3QgZW5kID0gdGhpcy5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUmFuZ2UuZW5kTGluZU51bWJlciwgbW9kZWxSYW5nZS5lbmRDb2x1bW4sIFBvc2l0aW9uQWZmaW5pdHkuTGVmdCk7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LmxpbmVOdW1iZXIsIHN0YXJ0LmNvbHVtbiwgZW5kLmxpbmVOdW1iZXIsIGVuZC5jb2x1bW4pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihtb2RlbExpbmVOdW1iZXI6IG51bWJlciwgbW9kZWxDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxpbmVJbmRleCA9IG1vZGVsTGluZU51bWJlciAtIDE7XG5cdFx0aWYgKHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKSkge1xuXHRcdFx0Ly8gdGhpcyBtb2RlbCBsaW5lIGlzIHZpc2libGVcblx0XHRcdGNvbnN0IGRlbHRhTGluZU51bWJlciA9IDEgKyB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVJbmRleCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKGRlbHRhTGluZU51bWJlciwgbW9kZWxDb2x1bW4pO1xuXHRcdH1cblxuXHRcdC8vIHRoaXMgbW9kZWwgbGluZSBpcyBub3QgdmlzaWJsZVxuXHRcdHdoaWxlIChsaW5lSW5kZXggPiAwICYmICF0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uaXNWaXNpYmxlKCkpIHtcblx0XHRcdGxpbmVJbmRleC0tO1xuXHRcdH1cblx0XHRpZiAobGluZUluZGV4ID09PSAwICYmICF0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uaXNWaXNpYmxlKCkpIHtcblx0XHRcdC8vIENvdWxkIG5vdCByZWFjaCBhIHJlYWwgbGluZVxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGNvbnN0IGRlbHRhTGluZU51bWJlciA9IDEgKyB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVJbmRleCk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5nZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihkZWx0YUxpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lSW5kZXggKyAxKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBSYW5nZSwgb3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgbW9kZWxTdGFydCA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBtb2RlbEVuZCA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0aWYgKG1vZGVsRW5kLmxpbmVOdW1iZXIgLSBtb2RlbFN0YXJ0LmxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlciAtIHJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gbW9zdCBsaWtlbHkgdGhlcmUgYXJlIG5vIGhpZGRlbiBsaW5lcyA9PiBmYXN0IHBhdGhcblx0XHRcdC8vIGZldGNoIGRlY29yYXRpb25zIGZyb20gY29sdW1uIDEgdG8gY292ZXIgdGhlIGNhc2Ugb2Ygd3JhcHBlZCBsaW5lcyB0aGF0IGhhdmUgd2hvbGUgbGluZSBkZWNvcmF0aW9ucyBhdCBjb2x1bW4gMVxuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKG5ldyBSYW5nZShtb2RlbFN0YXJ0LmxpbmVOdW1iZXIsIDEsIG1vZGVsRW5kLmxpbmVOdW1iZXIsIG1vZGVsRW5kLmNvbHVtbiksIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1pbmltYXBEZWNvcmF0aW9ucywgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBJTW9kZWxEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBtb2RlbFN0YXJ0TGluZUluZGV4ID0gbW9kZWxTdGFydC5saW5lTnVtYmVyIC0gMTtcblx0XHRjb25zdCBtb2RlbEVuZExpbmVJbmRleCA9IG1vZGVsRW5kLmxpbmVOdW1iZXIgLSAxO1xuXG5cdFx0bGV0IHJlcVN0YXJ0OiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IG1vZGVsTGluZUluZGV4ID0gbW9kZWxTdGFydExpbmVJbmRleDsgbW9kZWxMaW5lSW5kZXggPD0gbW9kZWxFbmRMaW5lSW5kZXg7IG1vZGVsTGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW21vZGVsTGluZUluZGV4XTtcblx0XHRcdGlmIChsaW5lLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdC8vIG1lcmdlIGludG8gcHJldmlvdXMgcmVxdWVzdFxuXHRcdFx0XHRpZiAocmVxU3RhcnQgPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXFTdGFydCA9IG5ldyBQb3NpdGlvbihtb2RlbExpbmVJbmRleCArIDEsIG1vZGVsTGluZUluZGV4ID09PSBtb2RlbFN0YXJ0TGluZUluZGV4ID8gbW9kZWxTdGFydC5jb2x1bW4gOiAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gaGl0IGludmlzaWJsZSBsaW5lID0+IGZsdXNoIHJlcXVlc3Rcblx0XHRcdFx0aWYgKHJlcVN0YXJ0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF4TGluZUNvbHVtbiA9IHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbExpbmVJbmRleCk7XG5cdFx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0LmNvbmNhdCh0aGlzLm1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShuZXcgUmFuZ2UocmVxU3RhcnQubGluZU51bWJlciwgcmVxU3RhcnQuY29sdW1uLCBtb2RlbExpbmVJbmRleCwgbWF4TGluZUNvbHVtbiksIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1pbmltYXBEZWNvcmF0aW9ucykpO1xuXHRcdFx0XHRcdHJlcVN0YXJ0ID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXFTdGFydCAhPT0gbnVsbCkge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LmNvbmNhdCh0aGlzLm1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShuZXcgUmFuZ2UocmVxU3RhcnQubGluZU51bWJlciwgcmVxU3RhcnQuY29sdW1uLCBtb2RlbEVuZC5saW5lTnVtYmVyLCBtb2RlbEVuZC5jb2x1bW4pLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnMpKTtcblx0XHRcdHJlcVN0YXJ0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpO1xuXHRcdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0XHRpZiAoYS5pZCA8IGIuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGEuaWQgPiBiLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRWxpbWluYXRlIGR1cGxpY2F0ZSBkZWNvcmF0aW9ucyB0aGF0IG1pZ2h0IGhhdmUgaW50ZXJzZWN0ZWQgb3VyIHZpc2libGUgcmFuZ2VzIG11bHRpcGxlIHRpbWVzXG5cdFx0Y29uc3QgZmluYWxSZXN1bHQ6IElNb2RlbERlY29yYXRpb25bXSA9IFtdO1xuXHRcdGxldCBmaW5hbFJlc3VsdExlbiA9IDA7XG5cdFx0bGV0IHByZXZEZWNJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChjb25zdCBkZWMgb2YgcmVzdWx0KSB7XG5cdFx0XHRjb25zdCBkZWNJZCA9IGRlYy5pZDtcblx0XHRcdGlmIChwcmV2RGVjSWQgPT09IGRlY0lkKSB7XG5cdFx0XHRcdC8vIHNraXBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRwcmV2RGVjSWQgPSBkZWNJZDtcblx0XHRcdGZpbmFsUmVzdWx0W2ZpbmFsUmVzdWx0TGVuKytdID0gZGVjO1xuXHRcdH1cblxuXHRcdHJldHVybiBmaW5hbFJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmplY3RlZFRleHRBdChwb3NpdGlvbjogUG9zaXRpb24pOiBJbmplY3RlZFRleHQgfCBudWxsIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRJbmplY3RlZFRleHRBdChpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LCBwb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0bm9ybWFsaXplUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSk6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5ub3JtYWxpemVQb3NpdGlvbihpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LCBwb3NpdGlvbiwgYWZmaW5pdHkpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8obGluZU51bWJlcik7XG5cdFx0aWYgKGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHggPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVJbmRlbnRDb2x1bW4oaW5mby5tb2RlbExpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIHdyYXBwZWQgbGluZXMgaGF2ZSBubyBpbmRlbnRhdGlvbi5cblx0XHQvLyBXZSBkZWxpYmVyYXRlbHkgZG9uJ3QgaGFuZGxlIHRoZSBjYXNlIHRoYXQgaW5kZW50YXRpb24gaXMgd3JhcHBlZFxuXHRcdC8vIHRvIGF2b2lkIHR3byB2aWV3IGxpbmVzIHJlcG9ydGluZyBpbmRlbnRhdGlvbiBmb3IgdGhlIHZlcnkgc2FtZSBtb2RlbCBsaW5lLlxuXHRcdHJldHVybiAwO1xuXHR9XG59XG5cbi8qKlxuICogT3ZlcmxhcHBpbmcgdW5zb3J0ZWQgcmFuZ2VzOlxuICogWyAgICkgICAgICBbICkgICAgICAgWyAgKVxuICogICAgWyAgICApICAgICAgWyAgICAgICApXG4gKiAtPlxuICogTm9uIG92ZXJsYXBwaW5nIHNvcnRlZCByYW5nZXM6XG4gKiBbICAgICAgICkgIFsgKSBbICAgICAgICApXG4gKlxuICogTm90ZTogVGhpcyBmdW5jdGlvbiBvbmx5IGNvbnNpZGVycyBsaW5lIGluZm9ybWF0aW9uISBDb2x1bW5zIGFyZSBpZ25vcmVkLlxuKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUxpbmVSYW5nZXMocmFuZ2VzOiBSYW5nZVtdKTogUmFuZ2VbXSB7XG5cdGlmIChyYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3Qgc29ydGVkUmFuZ2VzID0gcmFuZ2VzLnNsaWNlKCk7XG5cdHNvcnRlZFJhbmdlcy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdGxldCBjdXJyZW50UmFuZ2VTdGFydCA9IHNvcnRlZFJhbmdlc1swXS5zdGFydExpbmVOdW1iZXI7XG5cdGxldCBjdXJyZW50UmFuZ2VFbmQgPSBzb3J0ZWRSYW5nZXNbMF0uZW5kTGluZU51bWJlcjtcblxuXHRmb3IgKGxldCBpID0gMSwgbGVuID0gc29ydGVkUmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBzb3J0ZWRSYW5nZXNbaV07XG5cblx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gY3VycmVudFJhbmdlRW5kICsgMSkge1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IFJhbmdlKGN1cnJlbnRSYW5nZVN0YXJ0LCAxLCBjdXJyZW50UmFuZ2VFbmQsIDEpKTtcblx0XHRcdGN1cnJlbnRSYW5nZVN0YXJ0ID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y3VycmVudFJhbmdlRW5kID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHR9IGVsc2UgaWYgKHJhbmdlLmVuZExpbmVOdW1iZXIgPiBjdXJyZW50UmFuZ2VFbmQpIHtcblx0XHRcdGN1cnJlbnRSYW5nZUVuZCA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXHR9XG5cdHJlc3VsdC5wdXNoKG5ldyBSYW5nZShjdXJyZW50UmFuZ2VTdGFydCwgMSwgY3VycmVudFJhbmdlRW5kLCAxKSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHZpZXcgbGluZS4gQ2FuIGJlIHVzZWQgdG8gZWZmaWNpZW50bHkgcXVlcnkgbW9yZSBpbmZvcm1hdGlvbiBhYm91dCBpdC5cbiAqL1xuY2xhc3MgVmlld0xpbmVJbmZvIHtcblx0cHVibGljIGdldCBpc1dyYXBwZWRMaW5lQ29udGludWF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4ID4gMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RlbExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWxMaW5lV3JhcHBlZExpbmVJZHg6IG51bWJlcixcblx0KSB7IH1cbn1cblxuLyoqXG4gKiBBIGxpc3Qgb2YgdmlldyBsaW5lcyB0aGF0IGhhdmUgYSBjb250aWd1b3VzIHNwYW4gaW4gdGhlIG1vZGVsLlxuKi9cbmNsYXNzIFZpZXdMaW5lSW5mb0dyb3VwZWRCeU1vZGVsUmFuZ2Uge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbW9kZWxSYW5nZTogUmFuZ2UsIHB1YmxpYyByZWFkb25seSB2aWV3TGluZXM6IFZpZXdMaW5lSW5mb1tdKSB7XG5cdH1cbn1cblxuY2xhc3MgQ29vcmRpbmF0ZXNDb252ZXJ0ZXIgaW1wbGVtZW50cyBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lczogVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWw7XG5cblx0Y29uc3RydWN0b3IobGluZXM6IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsKSB7XG5cdFx0dGhpcy5fbGluZXMgPSBsaW5lcztcblx0fVxuXG5cdC8vIFZpZXcgLT4gTW9kZWwgY29udmVyc2lvbiBhbmQgcmVsYXRlZCBtZXRob2RzXG5cblx0cHVibGljIGNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24odmlld1Bvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZSh2aWV3UmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5jb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHZpZXdSYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVWaWV3UG9zaXRpb24odmlld1Bvc2l0aW9uOiBQb3NpdGlvbiwgZXhwZWN0ZWRNb2RlbFBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMudmFsaWRhdGVWaWV3UG9zaXRpb24odmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHZpZXdQb3NpdGlvbi5jb2x1bW4sIGV4cGVjdGVkTW9kZWxQb3NpdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVWaWV3UmFuZ2Uodmlld1JhbmdlOiBSYW5nZSwgZXhwZWN0ZWRNb2RlbFJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMudmFsaWRhdGVWaWV3UmFuZ2Uodmlld1JhbmdlLCBleHBlY3RlZE1vZGVsUmFuZ2UpO1xuXHR9XG5cblx0Ly8gTW9kZWwgLT4gVmlldyBjb252ZXJzaW9uIGFuZCByZWxhdGVkIG1ldGhvZHNcblxuXHRwdWJsaWMgY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFBvc2l0aW9uOiBQb3NpdGlvbiwgYWZmaW5pdHk/OiBQb3NpdGlvbkFmZmluaXR5LCBhbGxvd1plcm8/OiBib29sZWFuLCBiZWxvd0hpZGRlblJhbmdlcz86IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyLCBtb2RlbFBvc2l0aW9uLmNvbHVtbiwgYWZmaW5pdHksIGFsbG93WmVybywgYmVsb3dIaWRkZW5SYW5nZXMpO1xuXHR9XG5cblx0cHVibGljIGNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UobW9kZWxSYW5nZTogUmFuZ2UsIGFmZmluaXR5PzogUG9zaXRpb25BZmZpbml0eSk6IFJhbmdlIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShtb2RlbFJhbmdlLCBhZmZpbml0eSk7XG5cdH1cblxuXHRwdWJsaWMgbW9kZWxQb3NpdGlvbklzVmlzaWJsZShtb2RlbFBvc2l0aW9uOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKG1vZGVsUG9zaXRpb24ubGluZU51bWJlciwgbW9kZWxQb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIGdldE1vZGVsTGluZVZpZXdMaW5lQ291bnQobW9kZWxMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRNb2RlbExpbmVWaWV3TGluZUNvdW50KG1vZGVsTGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVOdW1iZXJPZk1vZGVsUG9zaXRpb24obW9kZWxMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGVsQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihtb2RlbExpbmVOdW1iZXIsIG1vZGVsQ29sdW1uKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEluZGVudEd1aWRlUmVwZWF0T3B0aW9uIHtcblx0QmxvY2tOb25lID0gMCxcblx0QmxvY2tTdWJzZXF1ZW50ID0gMSxcblx0QmxvY2tBbGwgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3TW9kZWxMaW5lc0Zyb21Nb2RlbEFzSXMgaW1wbGVtZW50cyBJVmlld01vZGVsTGluZXMge1xuXHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDb29yZGluYXRlc0NvbnZlcnRlcigpOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIge1xuXHRcdHJldHVybiBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcih0aGlzLm1vZGVsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIaWRkZW5BcmVhcygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgc2V0SGlkZGVuQXJlYXMoX3JhbmdlczogUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRUYWJTaXplKF9uZXdUYWJTaXplOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0V3JhcHBpbmdTZXR0aW5ncyhfZm9udEluZm86IEZvbnRJbmZvLCBfd3JhcHBpbmdTdHJhdGVneTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnLCBfd3JhcHBpbmdDb2x1bW46IG51bWJlciwgX3dyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoKTogSUxpbmVCcmVha3NDb21wdXRlciB7XG5cdFx0Y29uc3QgcmVzdWx0OiBudWxsW10gPSBbXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWRkUmVxdWVzdDogKGxpbmVOdW1iZXI6IG51bWJlciwgcHJldmlvdXNMaW5lQnJlYWtEYXRhOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpID0+IHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobnVsbCk7XG5cdFx0XHR9LFxuXHRcdFx0ZmluYWxpemU6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxGbHVzaGVkKCk6IHZvaWQge1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxMaW5lc0RlbGV0ZWQoX3ZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8IG51bGwge1xuXHRcdHJldHVybiBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQoZnJvbUxpbmVOdW1iZXIsIHRvTGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbExpbmVzSW5zZXJ0ZWQoX3ZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVCcmVha3M6IChNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpW10pOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQgfCBudWxsIHtcblx0XHRyZXR1cm4gbmV3IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudChmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBvbk1vZGVsTGluZUNoYW5nZWQoX3ZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgbGluZU51bWJlcjogbnVtYmVyLCBsaW5lQnJlYWtEYXRhOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpOiBbYm9vbGVhbiwgdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8IG51bGxdIHtcblx0XHRyZXR1cm4gW2ZhbHNlLCBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQobGluZU51bWJlciwgMSksIG51bGwsIG51bGxdO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdFZlcnNpb25JZChfdmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlSW5kZW50R3VpZGUodmlld0xpbmVOdW1iZXI6IG51bWJlciwgX21pbkxpbmVOdW1iZXI6IG51bWJlciwgX21heExpbmVOdW1iZXI6IG51bWJlcik6IElBY3RpdmVJbmRlbnRHdWlkZUluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IHZpZXdMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogdmlld0xpbmVOdW1iZXIsXG5cdFx0XHRpbmRlbnQ6IDBcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lc0JyYWNrZXRHdWlkZXMoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgYWN0aXZlUG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwpOiBJbmRlbnRHdWlkZVtdW10ge1xuXHRcdHJldHVybiBuZXcgQXJyYXkoZW5kTGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlciArIDEpLmZpbGwoW10pO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lc0luZGVudEd1aWRlcyh2aWV3U3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdFx0Y29uc3Qgdmlld0xpbmVDb3VudCA9IHZpZXdFbmRMaW5lTnVtYmVyIC0gdmlld1N0YXJ0TGluZU51bWJlciArIDE7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PG51bWJlcj4odmlld0xpbmVDb3VudCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2aWV3TGluZUNvdW50OyBpKyspIHtcblx0XHRcdHJlc3VsdFtpXSA9IDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVDb250ZW50KHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVDb250ZW50KHZpZXdMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUxlbmd0aCh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lTGVuZ3RoKHZpZXdMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZU1heENvbHVtbih2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZURhdGEodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lRGF0YSB7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMubW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnModmlld0xpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbGluZVRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRcdHJldHVybiBuZXcgVmlld0xpbmVEYXRhKFxuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdDEsXG5cdFx0XHRsaW5lQ29udGVudC5sZW5ndGggKyAxLFxuXHRcdFx0MCxcblx0XHRcdGxpbmVUb2tlbnMuaW5mbGF0ZSgpLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVzRGF0YSh2aWV3U3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5lZWRlZDogYm9vbGVhbltdKTogQXJyYXk8Vmlld0xpbmVEYXRhIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0dmlld1N0YXJ0TGluZU51bWJlciA9IE1hdGgubWluKE1hdGgubWF4KDEsIHZpZXdTdGFydExpbmVOdW1iZXIpLCBsaW5lQ291bnQpO1xuXHRcdHZpZXdFbmRMaW5lTnVtYmVyID0gTWF0aC5taW4oTWF0aC5tYXgoMSwgdmlld0VuZExpbmVOdW1iZXIpLCBsaW5lQ291bnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBBcnJheTxWaWV3TGluZURhdGEgfCBudWxsPiA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSB2aWV3U3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHZpZXdFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGlkeCA9IGxpbmVOdW1iZXIgLSB2aWV3U3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0cmVzdWx0W2lkeF0gPSBuZWVkZWRbaWR4XSA/IHRoaXMuZ2V0Vmlld0xpbmVEYXRhKGxpbmVOdW1iZXIpIDogbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZTogUmFuZ2UsIG93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBvbmx5TWluaW1hcERlY29yYXRpb25zOiBib29sZWFuLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWluaW1hcERlY29yYXRpb25zLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0bm9ybWFsaXplUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5ub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbiwgYWZmaW5pdHkpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lSW5kZW50Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGVkVGV4dEF0KHBvc2l0aW9uOiBQb3NpdGlvbik6IEluamVjdGVkVGV4dCB8IG51bGwge1xuXHRcdC8vIElkZW50aXR5IGxpbmVzIGNvbGxlY3Rpb24gZG9lcyBub3Qgc3VwcG9ydCBpbmplY3RlZCB0ZXh0LlxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFRQSxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQThELHdCQUF3QjtBQUN0RixTQUFzRCxhQUFhLGlDQUFpQztBQUNwRyxTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLGdCQUFnQjtBQUM1QixTQUFTLGlDQUF1RDtBQUVoRSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFnQyxvQ0FBb0M7QUF5QzdELE1BQU0saUNBQTREO0FBQUEsRUF5QnhFLFlBQ0MsVUFDQSxPQUNBLDhCQUNBLG9DQUNBLFVBQ0EsU0FDQSxrQkFDQSxnQkFDQSxnQkFDQSxXQUNBLHdCQUNDO0FBQ0QsU0FBSyxZQUFZO0FBQ2pCLFNBQUssUUFBUTtBQUNiLFNBQUssdUJBQXVCO0FBQzVCLFNBQUssZ0NBQWdDO0FBQ3JDLFNBQUssc0NBQXNDO0FBQzNDLFNBQUssV0FBVztBQUNoQixTQUFLLFVBQVU7QUFDZixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFlBQVk7QUFDakIsU0FBSyx5QkFBeUI7QUFFOUIsU0FBSztBQUFBO0FBQUEsTUFBb0M7QUFBQSxNQUFNO0FBQUEsSUFBSTtBQUFBLEVBQ3BEO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixTQUFLLDJCQUEyQixLQUFLLE1BQU0saUJBQWlCLEtBQUssMEJBQTBCLENBQUMs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QWMsYUFBYTtBQUM5QyxhQUFTLElBQUksR0FBRyxJQUFJLGVBQWUsS0FBSztBQUN2QyxhQUFPLENBQUMsSUFBSTtBQUFBLElBQ2I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sbUJBQW1CLGdCQUFnQztBQUN6RCxXQUFPLEtBQUssTUFBTSxlQUFlLGNBQWM7QUFBQSxFQUNoRDtBQUFBLEVBRU8sa0JBQWtCLGdCQUFnQztBQUN4RCxXQUFPLEtBQUssTUFBTSxjQUFjLGNBQWM7QUFBQSxFQUMvQztBQUFBLEVBRU8scUJBQXFCLGdCQUFnQztBQUMzRCxXQUFPLEtBQUssTUFBTSxpQkFBaUIsY0FBYztBQUFBLEVBQ2xEO0FBQUEsRUFFTyxxQkFBcUIsZ0JBQWdDO0FBQzNELFdBQU8sS0FBSyxNQUFNLGlCQUFpQixjQUFjO0FBQUEsRUFDbEQ7QUFBQSxFQUVPLGdCQUFnQixnQkFBc0M7QUFDNUQsVUFBTSxhQUFhLEtBQUssTUFBTSxhQUFhLGNBQWMsY0FBYztBQUN2RSxVQUFNLGNBQWMsV0FBVyxlQUFlO0FBQzlDLFdBQU8sSUFBSTtBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBWSxTQUFTO0FBQUEsTUFDckI7QUFBQSxNQUNBLFdBQVcsUUFBUTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGlCQUFpQixxQkFBNkIsbUJBQTJCLFFBQStDO0FBQzlILFVBQU0sWUFBWSxLQUFLLE1BQU0sYUFBYTtBQUMxQywwQkFBc0IsS0FBSyxJQUFJLEtBQUssSUFBSSxHQUFHLG1CQUFtQixHQUFHLFNBQVM7QUFDMUUsd0JBQW9CLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxpQkFBaUIsR0FBRyxTQUFTO0FBRXRFLFVBQU0sU0FBcUMsQ0FBQztBQUM1QyxhQUFTLGFBQWEscUJBQXFCLGNBQWMsbUJBQW1CLGNBQWM7QUFDekYsWUFBTSxNQUFNLGFBQWE7QUFDekIsYUFBTyxHQUFHLElBQUksT0FBTyxHQUFHLElBQUksS0FBSyxnQkFBZ0IsVUFBVSxJQUFJO0FBQUEsSUFDaEU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sc0JBQXNCLE9BQWMsU0FBaUIscUJBQThCLHVCQUFnQyx3QkFBaUMsdUJBQW9EO0FBQzlNLFdBQU8sS0FBSyxNQUFNLHNCQUFzQixPQUFPLFNBQVMscUJBQXFCLHVCQUF1Qix3QkFBd0IscUJBQXFCO0FBQUEsRUFDbEo7QUFBQSxFQUVBLGtCQUFrQixVQUFvQixVQUFzQztBQUMzRSxXQUFPLEtBQUssTUFBTSxrQkFBa0IsVUFBVSxRQUFRO0FBQUEsRUFDdkQ7QUFBQSxFQUVPLG9CQUFvQixZQUE0QjtBQUN0RCxXQUFPLEtBQUssTUFBTSxvQkFBb0IsVUFBVTtBQUFBLEVBQ2pEO0FBQUEsRUFFTyxrQkFBa0IsVUFBeUM7QUFFakUsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsicCIsICJkZWx0YUxpbmVOdW1iZXIiLCAiSW5kZW50R3VpZGVSZXBlYXRPcHRpb24iXQp9Cg==
