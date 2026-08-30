import * as strings from "../../../base/common/strings.js";
import { LineHeightsManager } from "./lineHeights.js";
class PendingChanges {
  constructor() {
    this._hasPending = false;
    this._inserts = [];
    this._changes = [];
    this._removes = [];
  }
  insert(x) {
    this._hasPending = true;
    this._inserts.push(x);
  }
  change(x) {
    this._hasPending = true;
    this._changes.push(x);
  }
  remove(x) {
    this._hasPending = true;
    this._removes.push(x);
  }
  commit(linesLayout) {
    if (!this._hasPending) {
      return;
    }
    const inserts = this._inserts;
    const changes = this._changes;
    const removes = this._removes;
    this._hasPending = false;
    this._inserts = [];
    this._changes = [];
    this._removes = [];
    linesLayout._commitPendingChanges(inserts, changes, removes);
  }
}
class EditorWhitespace {
  constructor(id, afterLineNumber, ordinal, height, minWidth) {
    this.id = id;
    this.afterLineNumber = afterLineNumber;
    this.ordinal = ordinal;
    this.height = height;
    this.minWidth = minWidth;
    this.prefixSum = 0;
  }
}
const _LinesLayout = class _LinesLayout {
  constructor(lineCount, defaultLineHeight, paddingTop, paddingBottom, customLineHeightData) {
    this._instanceId = strings.singleLetterHash(++_LinesLayout.INSTANCE_COUNT);
    this._pendingChanges = new PendingChanges();
    this._lastWhitespaceId = 0;
    this._arr = [];
    this._prefixSumValidIndex = -1;
    this._minWidth = -1;
    this._lineCount = lineCount;
    this._paddingTop = paddingTop;
    this._paddingBottom = paddingBottom;
    this._lineHeightsManager = new LineHeightsManager(defaultLineHeight, customLineHeightData);
  }
  /**
   * Find the insertion index for a new value inside a sorted array of values.
   * If the value is already present in the sorted array, the insertion index will be after the already existing value.
   */
  static findInsertionIndex(arr, afterLineNumber, ordinal) {
    let low = 0;
    let high = arr.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (afterLineNumber === arr[mid].afterLineNumber) {
        if (ordinal < arr[mid].ordinal) {
          high = mid;
        } else {
          low = mid + 1;
        }
      } else if (afterLineNumber < arr[mid].afterLineNumber) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }
  /**
   * Change the height of a line in pixels.
   */
  setDefaultLineHeight(lineHeight) {
    this._lineHeightsManager.defaultLineHeight = lineHeight;
  }
  /**
   * Changes the padding used to calculate vertical offsets.
   */
  setPadding(paddingTop, paddingBottom) {
    this._paddingTop = paddingTop;
    this._paddingBottom = paddingBottom;
  }
  /**
   * Set the number of lines.
   *
   * @param lineCount New number of lines.
   */
  onFlushed(lineCount, customLineHeightData) {
    this._lineCount = lineCount;
    this._lineHeightsManager = new LineHeightsManager(this._lineHeightsManager.defaultLineHeight, customLineHeightData);
  }
  changeLineHeights(callback) {
    let hadAChange = false;
    const accessor = {
      insertOrChangeCustomLineHeight: (decorationId, startLineNumber, endLineNumber, lineHeight) => {
        hadAChange = true;
        this._lineHeightsManager.insertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight);
      },
      removeCustomLineHeight: (decorationId) => {
        hadAChange = true;
        this._lineHeightsManager.removeCustomLineHeight(decorationId);
      }
    };
    callback(accessor);
    return hadAChange;
  }
  changeWhitespace(callback) {
    let hadAChange = false;
    try {
      const accessor = {
        insertWhitespace: (afterLineNumber, ordinal, heightInPx, minWidth) => {
          hadAChange = true;
          afterLineNumber = afterLineNumber | 0;
          ordinal = ordinal | 0;
          heightInPx = heightInPx | 0;
          minWidth = minWidth | 0;
          const id = this._instanceId + ++this._lastWhitespaceId;
          this._pendingChanges.insert(new EditorWhitespace(id, afterLineNumber, ordinal, heightInPx, minWidth));
          return id;
        },
        changeOneWhitespace: (id, newAfterLineNumber, newHeight) => {
          hadAChange = true;
          newAfterLineNumber = newAfterLineNumber | 0;
          newHeight = newHeight | 0;
          this._pendingChanges.change({ id, newAfterLineNumber, newHeight });
        },
        removeWhitespace: (id) => {
          hadAChange = true;
          this._pendingChanges.remove({ id });
        }
      };
      callback(accessor);
    } finally {
      this._pendingChanges.commit(this);
    }
    return hadAChange;
  }
  _commitPendingChanges(inserts, changes, removes) {
    if (inserts.length > 0 || removes.length > 0) {
      this._minWidth = -1;
    }
    if (inserts.length + changes.length + removes.length <= 1) {
      for (const insert of inserts) {
        this._insertWhitespace(insert);
      }
      for (const change of changes) {
        this._changeOneWhitespace(change.id, change.newAfterLineNumber, change.newHeight);
      }
      for (const remove of removes) {
        const index = this._findWhitespaceIndex(remove.id);
        if (index === -1) {
          continue;
        }
        this._removeWhitespace(index);
      }
      return;
    }
    const toRemove = /* @__PURE__ */ new Set();
    for (const remove of removes) {
      toRemove.add(remove.id);
    }
    const toChange = /* @__PURE__ */ new Map();
    for (const change of changes) {
      toChange.set(change.id, change);
    }
    const applyRemoveAndChange = (whitespaces) => {
      const result2 = [];
      for (const whitespace of whitespaces) {
        if (toRemove.has(whitespace.id)) {
          continue;
        }
        if (toChange.has(whitespace.id)) {
          const change = toChange.get(whitespace.id);
          whitespace.afterLineNumber = change.newAfterLineNumber;
          whitespace.height = change.newHeight;
        }
        result2.push(whitespace);
      }
      return result2;
    };
    const result = applyRemoveAndChange(this._arr).concat(applyRemoveAndChange(inserts));
    result.sort((a, b) => {
      if (a.afterLineNumber === b.afterLineNumber) {
        return a.ordinal - b.ordinal;
      }
      return a.afterLineNumber - b.afterLineNumber;
    });
    this._arr = result;
    this._prefixSumValidIndex = -1;
  }
  _insertWhitespace(whitespace) {
    const insertIndex = _LinesLayout.findInsertionIndex(this._arr, whitespace.afterLineNumber, whitespace.ordinal);
    this._arr.splice(insertIndex, 0, whitespace);
    this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, insertIndex - 1);
  }
  _findWhitespaceIndex(id) {
    const arr = this._arr;
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i].id === id) {
        return i;
      }
    }
    return -1;
  }
  _changeOneWhitespace(id, newAfterLineNumber, newHeight) {
    const index = this._findWhitespaceIndex(id);
    if (index === -1) {
      return;
    }
    if (this._arr[index].height !== newHeight) {
      this._arr[index].height = newHeight;
      this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, index - 1);
    }
    if (this._arr[index].afterLineNumber !== newAfterLineNumber) {
      const whitespace = this._arr[index];
      this._removeWhitespace(index);
      whitespace.afterLineNumber = newAfterLineNumber;
      this._insertWhitespace(whitespace);
    }
  }
  _removeWhitespace(removeIndex) {
    this._arr.splice(removeIndex, 1);
    this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, removeIndex - 1);
  }
  /**
   * Notify the layouter that lines have been deleted (a continuous zone of lines).
   *
   * @param fromLineNumber The line number at which the deletion started, inclusive
   * @param toLineNumber The line number at which the deletion ended, inclusive
   */
  onLinesDeleted(fromLineNumber, toLineNumber) {
    fromLineNumber = fromLineNumber | 0;
    toLineNumber = toLineNumber | 0;
    this._lineCount -= toLineNumber - fromLineNumber + 1;
    for (let i = 0, len = this._arr.length; i < len; i++) {
      const afterLineNumber = this._arr[i].afterLineNumber;
      if (fromLineNumber <= afterLineNumber && afterLineNumber <= toLineNumber) {
        this._arr[i].afterLineNumber = fromLineNumber - 1;
      } else if (afterLineNumber > toLineNumber) {
        this._arr[i].afterLineNumber -= toLineNumber - fromLineNumber + 1;
      }
    }
    this._lineHeightsManager.onLinesDeleted(fromLineNumber, toLineNumber);
  }
  /**
   * Notify the layouter that lines have been inserted (a continuous zone of lines).
   *
   * @param fromLineNumber The line number at which the insertion started, inclusive
   * @param toLineNumber The line number at which the insertion ended, inclusive.
   */
  onLinesInserted(fromLineNumber, toLineNumber) {
    fromLineNumber = fromLineNumber | 0;
    toLineNumber = toLineNumber | 0;
    this._lineCount += toLineNumber - fromLineNumber + 1;
    for (let i = 0, len = this._arr.length; i < len; i++) {
      const afterLineNumber = this._arr[i].afterLineNumber;
      if (fromLineNumber <= afterLineNumber) {
        this._arr[i].afterLineNumber += toLineNumber - fromLineNumber + 1;
      }
    }
    this._lineHeightsManager.onLinesInserted(fromLineNumber, toLineNumber);
  }
  /**
   * Get the sum of all the whitespaces.
   */
  getWhitespacesTotalHeight() {
    if (this._arr.length === 0) {
      return 0;
    }
    return this.getWhitespacesAccumulatedHeight(this._arr.length - 1);
  }
  /**
   * Return the sum of the heights of the whitespaces at [0..index].
   * This includes the whitespace at `index`.
   *
   * @param index The index of the whitespace.
   * @return The sum of the heights of all whitespaces before the one at `index`, including the one at `index`.
   */
  getWhitespacesAccumulatedHeight(index) {
    index = index | 0;
    let startIndex = Math.max(0, this._prefixSumValidIndex + 1);
    if (startIndex === 0) {
      this._arr[0].prefixSum = this._arr[0].height;
      startIndex++;
    }
    for (let i = startIndex; i <= index; i++) {
      this._arr[i].prefixSum = this._arr[i - 1].prefixSum + this._arr[i].height;
    }
    this._prefixSumValidIndex = Math.max(this._prefixSumValidIndex, index);
    return this._arr[index].prefixSum;
  }
  /**
   * Get the sum of heights for all objects.
   *
   * @return The sum of heights for all objects.
   */
  getLinesTotalHeight() {
    const linesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(this._lineCount);
    const whitespacesHeight = this.getWhitespacesTotalHeight();
    return linesHeight + whitespacesHeight + this._paddingTop + this._paddingBottom;
  }
  /**
   * Returns the accumulated height of whitespaces before the given line number.
   *
   * @param lineNumber The line number
   */
  getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
    if (lastWhitespaceBeforeLineNumber === -1) {
      return 0;
    }
    return this.getWhitespacesAccumulatedHeight(lastWhitespaceBeforeLineNumber);
  }
  _findLastWhitespaceBeforeLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const arr = this._arr;
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
      const delta = high - low | 0;
      const halfDelta = delta / 2 | 0;
      const mid = low + halfDelta | 0;
      if (arr[mid].afterLineNumber < lineNumber) {
        if (mid + 1 >= arr.length || arr[mid + 1].afterLineNumber >= lineNumber) {
          return mid;
        } else {
          low = mid + 1 | 0;
        }
      } else {
        high = mid - 1 | 0;
      }
    }
    return -1;
  }
  _findFirstWhitespaceAfterLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
    const firstWhitespaceAfterLineNumber = lastWhitespaceBeforeLineNumber + 1;
    if (firstWhitespaceAfterLineNumber < this._arr.length) {
      return firstWhitespaceAfterLineNumber;
    }
    return -1;
  }
  /**
   * Find the index of the first whitespace which has `afterLineNumber` >= `lineNumber`.
   * @return The index of the first whitespace with `afterLineNumber` >= `lineNumber` or -1 if no whitespace is found.
   */
  getFirstWhitespaceIndexAfterLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    return this._findFirstWhitespaceAfterLineNumber(lineNumber);
  }
  /**
   * Get the vertical offset (the sum of heights for all objects above) a certain line number.
   *
   * @param lineNumber The line number
   * @return The sum of heights for all objects above `lineNumber`.
   */
  getVerticalOffsetForLineNumber(lineNumber, includeViewZones = false) {
    lineNumber = lineNumber | 0;
    let previousLinesHeight;
    if (lineNumber > 1) {
      previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(lineNumber - 1);
    } else {
      previousLinesHeight = 0;
    }
    const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber - (includeViewZones ? 1 : 0));
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  getLineHeightForLineNumber(lineNumber) {
    return this._lineHeightsManager.heightForLineNumber(lineNumber);
  }
  /**
   * Get the vertical offset (the sum of heights for all objects above) a certain line number and also the line height of the line.
   *
   * @param lineNumber The line number
   * @return The sum of heights for all objects above `lineNumber`.
   */
  getVerticalOffsetAfterLineNumber(lineNumber, includeViewZones = false) {
    lineNumber = lineNumber | 0;
    const previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(lineNumber);
    const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber + (includeViewZones ? 1 : 0));
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  /**
   * Returns if there is any whitespace in the document.
   */
  hasWhitespace() {
    return this.getWhitespacesCount() > 0;
  }
  /**
   * The maximum min width for all whitespaces.
   */
  getWhitespaceMinWidth() {
    if (this._minWidth === -1) {
      let minWidth = 0;
      for (let i = 0, len = this._arr.length; i < len; i++) {
        minWidth = Math.max(minWidth, this._arr[i].minWidth);
      }
      this._minWidth = minWidth;
    }
    return this._minWidth;
  }
  /**
   * Check if `verticalOffset` is below all lines.
   */
  isAfterLines(verticalOffset) {
    const totalHeight = this.getLinesTotalHeight();
    return verticalOffset > totalHeight;
  }
  isInTopPadding(verticalOffset) {
    if (this._paddingTop === 0) {
      return false;
    }
    return verticalOffset < this._paddingTop;
  }
  isInBottomPadding(verticalOffset) {
    if (this._paddingBottom === 0) {
      return false;
    }
    const totalHeight = this.getLinesTotalHeight();
    return verticalOffset >= totalHeight - this._paddingBottom;
  }
  /**
   * Find the first line number that is at or after vertical offset `verticalOffset`.
   * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
   * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
   *
   * @param verticalOffset The vertical offset to search at.
   * @return The line number at or after vertical offset `verticalOffset`.
   */
  getLineNumberAtOrAfterVerticalOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    if (verticalOffset < 0) {
      return 1;
    }
    const linesCount = this._lineCount | 0;
    let minLineNumber = 1;
    let maxLineNumber = linesCount;
    while (minLineNumber < maxLineNumber) {
      const midLineNumber = (minLineNumber + maxLineNumber) / 2 | 0;
      const lineHeight = this.getLineHeightForLineNumber(midLineNumber);
      const midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber) | 0;
      if (verticalOffset >= midLineNumberVerticalOffset + lineHeight) {
        minLineNumber = midLineNumber + 1;
      } else if (verticalOffset >= midLineNumberVerticalOffset) {
        return midLineNumber;
      } else {
        maxLineNumber = midLineNumber;
      }
    }
    if (minLineNumber > linesCount) {
      return linesCount;
    }
    return minLineNumber;
  }
  /**
   * Get all the lines and their relative vertical offsets that are positioned between `verticalOffset1` and `verticalOffset2`.
   *
   * @param verticalOffset1 The beginning of the viewport.
   * @param verticalOffset2 The end of the viewport.
   * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
   */
  getLinesViewportData(verticalOffset1, verticalOffset2) {
    verticalOffset1 = verticalOffset1 | 0;
    verticalOffset2 = verticalOffset2 | 0;
    const startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1) | 0;
    const startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber) | 0;
    let endLineNumber = this._lineCount | 0;
    let whitespaceIndex = this.getFirstWhitespaceIndexAfterLineNumber(startLineNumber) | 0;
    const whitespaceCount = this.getWhitespacesCount() | 0;
    let currentWhitespaceHeight;
    let currentWhitespaceAfterLineNumber;
    if (whitespaceIndex === -1) {
      whitespaceIndex = whitespaceCount;
      currentWhitespaceAfterLineNumber = endLineNumber + 1;
      currentWhitespaceHeight = 0;
    } else {
      currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
      currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
    }
    let currentVerticalOffset = startLineNumberVerticalOffset;
    let currentLineRelativeOffset = currentVerticalOffset;
    const STEP_SIZE = 5e5;
    let bigNumbersDelta = 0;
    if (startLineNumberVerticalOffset >= STEP_SIZE) {
      bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
      bigNumbersDelta = Math.floor(bigNumbersDelta / this._lineHeightsManager.defaultLineHeight) * this._lineHeightsManager.defaultLineHeight;
      currentLineRelativeOffset -= bigNumbersDelta;
    }
    const linesOffsets = [];
    const verticalCenter = verticalOffset1 + (verticalOffset2 - verticalOffset1) / 2;
    let centeredLineNumber = -1;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineHeight = this.getLineHeightForLineNumber(lineNumber);
      if (centeredLineNumber === -1) {
        const currentLineTop = currentVerticalOffset;
        const currentLineBottom = currentVerticalOffset + lineHeight;
        if (currentLineTop <= verticalCenter && verticalCenter < currentLineBottom || currentLineTop > verticalCenter) {
          centeredLineNumber = lineNumber;
        }
      }
      currentVerticalOffset += lineHeight;
      linesOffsets[lineNumber - startLineNumber] = currentLineRelativeOffset;
      currentLineRelativeOffset += lineHeight;
      while (currentWhitespaceAfterLineNumber === lineNumber) {
        currentLineRelativeOffset += currentWhitespaceHeight;
        currentVerticalOffset += currentWhitespaceHeight;
        whitespaceIndex++;
        if (whitespaceIndex >= whitespaceCount) {
          currentWhitespaceAfterLineNumber = endLineNumber + 1;
        } else {
          currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
          currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
        }
      }
      if (currentVerticalOffset >= verticalOffset2) {
        endLineNumber = lineNumber;
        break;
      }
    }
    if (centeredLineNumber === -1) {
      centeredLineNumber = endLineNumber;
    }
    const endLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(endLineNumber) | 0;
    let completelyVisibleStartLineNumber = startLineNumber;
    let completelyVisibleEndLineNumber = endLineNumber;
    if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
      if (startLineNumberVerticalOffset < verticalOffset1) {
        completelyVisibleStartLineNumber++;
      }
    }
    if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
      const endLineHeight = this.getLineHeightForLineNumber(endLineNumber);
      if (endLineNumberVerticalOffset + endLineHeight > verticalOffset2) {
        completelyVisibleEndLineNumber--;
      }
    }
    return {
      bigNumbersDelta,
      startLineNumber,
      endLineNumber,
      relativeVerticalOffset: linesOffsets,
      centeredLineNumber,
      completelyVisibleStartLineNumber,
      completelyVisibleEndLineNumber,
      lineHeight: this._lineHeightsManager.defaultLineHeight
    };
  }
  getVerticalOffsetForWhitespaceIndex(whitespaceIndex) {
    whitespaceIndex = whitespaceIndex | 0;
    const afterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);
    let previousLinesHeight;
    if (afterLineNumber >= 1) {
      previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(afterLineNumber);
    } else {
      previousLinesHeight = 0;
    }
    let previousWhitespacesHeight;
    if (whitespaceIndex > 0) {
      previousWhitespacesHeight = this.getWhitespacesAccumulatedHeight(whitespaceIndex - 1);
    } else {
      previousWhitespacesHeight = 0;
    }
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    let minWhitespaceIndex = 0;
    let maxWhitespaceIndex = this.getWhitespacesCount() - 1;
    if (maxWhitespaceIndex < 0) {
      return -1;
    }
    const maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex);
    const maxWhitespaceHeight = this.getHeightForWhitespaceIndex(maxWhitespaceIndex);
    if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
      return -1;
    }
    while (minWhitespaceIndex < maxWhitespaceIndex) {
      const midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);
      const midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex);
      const midWhitespaceHeight = this.getHeightForWhitespaceIndex(midWhitespaceIndex);
      if (verticalOffset >= midWhitespaceVerticalOffset + midWhitespaceHeight) {
        minWhitespaceIndex = midWhitespaceIndex + 1;
      } else if (verticalOffset >= midWhitespaceVerticalOffset) {
        return midWhitespaceIndex;
      } else {
        maxWhitespaceIndex = midWhitespaceIndex;
      }
    }
    return minWhitespaceIndex;
  }
  /**
   * Get exactly the whitespace that is layouted at `verticalOffset`.
   *
   * @param verticalOffset The vertical offset.
   * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
   */
  getWhitespaceAtVerticalOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    const candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset);
    if (candidateIndex < 0) {
      return null;
    }
    if (candidateIndex >= this.getWhitespacesCount()) {
      return null;
    }
    const candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex);
    if (candidateTop > verticalOffset) {
      return null;
    }
    const candidateHeight = this.getHeightForWhitespaceIndex(candidateIndex);
    const candidateId = this.getIdForWhitespaceIndex(candidateIndex);
    const candidateAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(candidateIndex);
    return {
      id: candidateId,
      afterLineNumber: candidateAfterLineNumber,
      verticalOffset: candidateTop,
      height: candidateHeight
    };
  }
  /**
   * Get a list of whitespaces that are positioned between `verticalOffset1` and `verticalOffset2`.
   *
   * @param verticalOffset1 The beginning of the viewport.
   * @param verticalOffset2 The end of the viewport.
   * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
   */
  getWhitespaceViewportData(verticalOffset1, verticalOffset2) {
    verticalOffset1 = verticalOffset1 | 0;
    verticalOffset2 = verticalOffset2 | 0;
    const startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1);
    const endIndex = this.getWhitespacesCount() - 1;
    if (startIndex < 0) {
      return [];
    }
    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const top = this.getVerticalOffsetForWhitespaceIndex(i);
      const height = this.getHeightForWhitespaceIndex(i);
      if (top >= verticalOffset2) {
        break;
      }
      result.push({
        id: this.getIdForWhitespaceIndex(i),
        afterLineNumber: this.getAfterLineNumberForWhitespaceIndex(i),
        verticalOffset: top,
        height
      });
    }
    return result;
  }
  /**
   * Get all whitespaces.
   */
  getWhitespaces() {
    return this._arr.slice(0);
  }
  /**
   * The number of whitespaces.
   */
  getWhitespacesCount() {
    return this._arr.length;
  }
  /**
   * Get the `id` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `id` of whitespace at `index`.
   */
  getIdForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].id;
  }
  /**
   * Get the `afterLineNumber` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `afterLineNumber` of whitespace at `index`.
   */
  getAfterLineNumberForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].afterLineNumber;
  }
  /**
   * Get the `height` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `height` of whitespace at `index`.
   */
  getHeightForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].height;
  }
};
_LinesLayout.INSTANCE_COUNT = 0;
let LinesLayout = _LinesLayout;
export {
  EditorWhitespace,
  LinesLayout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld0xheW91dFxcbGluZXNMYXlvdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRWRpdG9yV2hpdGVzcGFjZSwgSVBhcnRpYWxWaWV3TGluZXNWaWV3cG9ydERhdGEsIElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IsIElWaWV3V2hpdGVzcGFjZVZpZXdwb3J0RGF0YSwgSVdoaXRlc3BhY2VDaGFuZ2VBY2Nlc3NvciB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ3VzdG9tTGluZUhlaWdodERhdGEsIExpbmVIZWlnaHRzTWFuYWdlciB9IGZyb20gJy4vbGluZUhlaWdodHMuanMnO1xuXG5pbnRlcmZhY2UgSVBlbmRpbmdDaGFuZ2UgeyBpZDogc3RyaW5nOyBuZXdBZnRlckxpbmVOdW1iZXI6IG51bWJlcjsgbmV3SGVpZ2h0OiBudW1iZXIgfVxuaW50ZXJmYWNlIElQZW5kaW5nUmVtb3ZlIHsgaWQ6IHN0cmluZyB9XG5cbmNsYXNzIFBlbmRpbmdDaGFuZ2VzIHtcblx0cHJpdmF0ZSBfaGFzUGVuZGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaW5zZXJ0czogRWRpdG9yV2hpdGVzcGFjZVtdO1xuXHRwcml2YXRlIF9jaGFuZ2VzOiBJUGVuZGluZ0NoYW5nZVtdO1xuXHRwcml2YXRlIF9yZW1vdmVzOiBJUGVuZGluZ1JlbW92ZVtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9pbnNlcnRzID0gW107XG5cdFx0dGhpcy5fY2hhbmdlcyA9IFtdO1xuXHRcdHRoaXMuX3JlbW92ZXMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnQoeDogRWRpdG9yV2hpdGVzcGFjZSk6IHZvaWQge1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2luc2VydHMucHVzaCh4KTtcblx0fVxuXG5cdHB1YmxpYyBjaGFuZ2UoeDogSVBlbmRpbmdDaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9jaGFuZ2VzLnB1c2goeCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlKHg6IElQZW5kaW5nUmVtb3ZlKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IHRydWU7XG5cdFx0dGhpcy5fcmVtb3Zlcy5wdXNoKHgpO1xuXHR9XG5cblx0cHVibGljIGNvbW1pdChsaW5lc0xheW91dDogTGluZXNMYXlvdXQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1BlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnNlcnRzID0gdGhpcy5faW5zZXJ0cztcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5fY2hhbmdlcztcblx0XHRjb25zdCByZW1vdmVzID0gdGhpcy5fcmVtb3ZlcztcblxuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9pbnNlcnRzID0gW107XG5cdFx0dGhpcy5fY2hhbmdlcyA9IFtdO1xuXHRcdHRoaXMuX3JlbW92ZXMgPSBbXTtcblxuXHRcdGxpbmVzTGF5b3V0Ll9jb21taXRQZW5kaW5nQ2hhbmdlcyhpbnNlcnRzLCBjaGFuZ2VzLCByZW1vdmVzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yV2hpdGVzcGFjZSBpbXBsZW1lbnRzIElFZGl0b3JXaGl0ZXNwYWNlIHtcblx0cHVibGljIGlkOiBzdHJpbmc7XG5cdHB1YmxpYyBhZnRlckxpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIG9yZGluYWw6IG51bWJlcjtcblx0cHVibGljIGhlaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgbWluV2lkdGg6IG51bWJlcjtcblx0cHVibGljIHByZWZpeFN1bTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGFmdGVyTGluZU51bWJlcjogbnVtYmVyLCBvcmRpbmFsOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBtaW5XaWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMuYWZ0ZXJMaW5lTnVtYmVyID0gYWZ0ZXJMaW5lTnVtYmVyO1xuXHRcdHRoaXMub3JkaW5hbCA9IG9yZGluYWw7XG5cdFx0dGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5taW5XaWR0aCA9IG1pbldpZHRoO1xuXHRcdHRoaXMucHJlZml4U3VtID0gMDtcblx0fVxufVxuXG4vKipcbiAqIExheW91dGluZyBvZiBvYmplY3RzIHRoYXQgdGFrZSB2ZXJ0aWNhbCBzcGFjZSAoYnkgaGF2aW5nIGEgaGVpZ2h0KSBhbmQgcHVzaCBkb3duIG90aGVyIG9iamVjdHMuXG4gKlxuICogVGhlc2Ugb2JqZWN0cyBhcmUgYmFzaWNhbGx5IGVpdGhlciB0ZXh0IChsaW5lcykgb3Igc3BhY2VzIGJldHdlZW4gdGhvc2UgbGluZXMgKHdoaXRlc3BhY2VzKS5cbiAqIFRoaXMgcHJvdmlkZXMgY29tbW9kaXR5IG9wZXJhdGlvbnMgZm9yIHdvcmtpbmcgd2l0aCBsaW5lcyB0aGF0IGNvbnRhaW4gd2hpdGVzcGFjZSB0aGF0IHB1c2hlcyBsaW5lcyBsb3dlciAodmVydGljYWxseSkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMaW5lc0xheW91dCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgSU5TVEFOQ0VfQ09VTlQgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NoYW5nZXM6IFBlbmRpbmdDaGFuZ2VzO1xuXHRwcml2YXRlIF9sYXN0V2hpdGVzcGFjZUlkOiBudW1iZXI7XG5cdHByaXZhdGUgX2FycjogRWRpdG9yV2hpdGVzcGFjZVtdO1xuXHRwcml2YXRlIF9wcmVmaXhTdW1WYWxpZEluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgX21pbldpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX2xpbmVDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIF9wYWRkaW5nVG9wOiBudW1iZXI7XG5cdHByaXZhdGUgX3BhZGRpbmdCb3R0b206IG51bWJlcjtcblx0cHJpdmF0ZSBfbGluZUhlaWdodHNNYW5hZ2VyOiBMaW5lSGVpZ2h0c01hbmFnZXI7XG5cblx0Y29uc3RydWN0b3IobGluZUNvdW50OiBudW1iZXIsIGRlZmF1bHRMaW5lSGVpZ2h0OiBudW1iZXIsIHBhZGRpbmdUb3A6IG51bWJlciwgcGFkZGluZ0JvdHRvbTogbnVtYmVyLCBjdXN0b21MaW5lSGVpZ2h0RGF0YTogQ3VzdG9tTGluZUhlaWdodERhdGFbXSkge1xuXHRcdHRoaXMuX2luc3RhbmNlSWQgPSBzdHJpbmdzLnNpbmdsZUxldHRlckhhc2goKytMaW5lc0xheW91dC5JTlNUQU5DRV9DT1VOVCk7XG5cdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMgPSBuZXcgUGVuZGluZ0NoYW5nZXMoKTtcblx0XHR0aGlzLl9sYXN0V2hpdGVzcGFjZUlkID0gMDtcblx0XHR0aGlzLl9hcnIgPSBbXTtcblx0XHR0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4ID0gLTE7XG5cdFx0dGhpcy5fbWluV2lkdGggPSAtMTsgLyogbWFya2VyIGZvciBub3QgYmVpbmcgY29tcHV0ZWQgKi9cblx0XHR0aGlzLl9saW5lQ291bnQgPSBsaW5lQ291bnQ7XG5cdFx0dGhpcy5fcGFkZGluZ1RvcCA9IHBhZGRpbmdUb3A7XG5cdFx0dGhpcy5fcGFkZGluZ0JvdHRvbSA9IHBhZGRpbmdCb3R0b207XG5cdFx0dGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcihkZWZhdWx0TGluZUhlaWdodCwgY3VzdG9tTGluZUhlaWdodERhdGEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIGluc2VydGlvbiBpbmRleCBmb3IgYSBuZXcgdmFsdWUgaW5zaWRlIGEgc29ydGVkIGFycmF5IG9mIHZhbHVlcy5cblx0ICogSWYgdGhlIHZhbHVlIGlzIGFscmVhZHkgcHJlc2VudCBpbiB0aGUgc29ydGVkIGFycmF5LCB0aGUgaW5zZXJ0aW9uIGluZGV4IHdpbGwgYmUgYWZ0ZXIgdGhlIGFscmVhZHkgZXhpc3RpbmcgdmFsdWUuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGZpbmRJbnNlcnRpb25JbmRleChhcnI6IEVkaXRvcldoaXRlc3BhY2VbXSwgYWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIG9yZGluYWw6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxvdyA9IDA7XG5cdFx0bGV0IGhpZ2ggPSBhcnIubGVuZ3RoO1xuXG5cdFx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblx0XHRcdGNvbnN0IG1pZCA9ICgobG93ICsgaGlnaCkgPj4+IDEpO1xuXG5cdFx0XHRpZiAoYWZ0ZXJMaW5lTnVtYmVyID09PSBhcnJbbWlkXS5hZnRlckxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKG9yZGluYWwgPCBhcnJbbWlkXS5vcmRpbmFsKSB7XG5cdFx0XHRcdFx0aGlnaCA9IG1pZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb3cgPSBtaWQgKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGFmdGVyTGluZU51bWJlciA8IGFyclttaWRdLmFmdGVyTGluZU51bWJlcikge1xuXHRcdFx0XHRoaWdoID0gbWlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG93ID0gbWlkICsgMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbG93O1xuXHR9XG5cblx0LyoqXG5cdCAqIENoYW5nZSB0aGUgaGVpZ2h0IG9mIGEgbGluZSBpbiBwaXhlbHMuXG5cdCAqL1xuXHRwdWJsaWMgc2V0RGVmYXVsdExpbmVIZWlnaHQobGluZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmRlZmF1bHRMaW5lSGVpZ2h0ID0gbGluZUhlaWdodDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGFuZ2VzIHRoZSBwYWRkaW5nIHVzZWQgdG8gY2FsY3VsYXRlIHZlcnRpY2FsIG9mZnNldHMuXG5cdCAqL1xuXHRwdWJsaWMgc2V0UGFkZGluZyhwYWRkaW5nVG9wOiBudW1iZXIsIHBhZGRpbmdCb3R0b206IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BhZGRpbmdUb3AgPSBwYWRkaW5nVG9wO1xuXHRcdHRoaXMuX3BhZGRpbmdCb3R0b20gPSBwYWRkaW5nQm90dG9tO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgbnVtYmVyIG9mIGxpbmVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gbGluZUNvdW50IE5ldyBudW1iZXIgb2YgbGluZXMuXG5cdCAqL1xuXHRwdWJsaWMgb25GbHVzaGVkKGxpbmVDb3VudDogbnVtYmVyLCBjdXN0b21MaW5lSGVpZ2h0RGF0YTogQ3VzdG9tTGluZUhlaWdodERhdGFbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmVDb3VudCA9IGxpbmVDb3VudDtcblx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5kZWZhdWx0TGluZUhlaWdodCwgY3VzdG9tTGluZUhlaWdodERhdGEpO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZUxpbmVIZWlnaHRzKGNhbGxiYWNrOiAoYWNjZXNzb3I6IElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IpID0+IHZvaWQpOiBib29sZWFuIHtcblx0XHRsZXQgaGFkQUNoYW5nZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGFjY2Vzc29yOiBJTGluZUhlaWdodENoYW5nZUFjY2Vzc29yID0ge1xuXHRcdFx0aW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0OiAoZGVjb3JhdGlvbklkOiBzdHJpbmcsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdFx0XHRoYWRBQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQsIHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbGluZUhlaWdodCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlQ3VzdG9tTGluZUhlaWdodDogKGRlY29yYXRpb25JZDogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0XHRcdGhhZEFDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIucmVtb3ZlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y2FsbGJhY2soYWNjZXNzb3IpO1xuXHRcdHJldHVybiBoYWRBQ2hhbmdlO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZVdoaXRlc3BhY2UoY2FsbGJhY2s6IChhY2Nlc3NvcjogSVdoaXRlc3BhY2VDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IGJvb2xlYW4ge1xuXHRcdGxldCBoYWRBQ2hhbmdlID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY2Vzc29yOiBJV2hpdGVzcGFjZUNoYW5nZUFjY2Vzc29yID0ge1xuXHRcdFx0XHRpbnNlcnRXaGl0ZXNwYWNlOiAoYWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIG9yZGluYWw6IG51bWJlciwgaGVpZ2h0SW5QeDogbnVtYmVyLCBtaW5XaWR0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRoYWRBQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXIgPSBhZnRlckxpbmVOdW1iZXIgfCAwO1xuXHRcdFx0XHRcdG9yZGluYWwgPSBvcmRpbmFsIHwgMDtcblx0XHRcdFx0XHRoZWlnaHRJblB4ID0gaGVpZ2h0SW5QeCB8IDA7XG5cdFx0XHRcdFx0bWluV2lkdGggPSBtaW5XaWR0aCB8IDA7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSB0aGlzLl9pbnN0YW5jZUlkICsgKCsrdGhpcy5fbGFzdFdoaXRlc3BhY2VJZCk7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMuaW5zZXJ0KG5ldyBFZGl0b3JXaGl0ZXNwYWNlKGlkLCBhZnRlckxpbmVOdW1iZXIsIG9yZGluYWwsIGhlaWdodEluUHgsIG1pbldpZHRoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjaGFuZ2VPbmVXaGl0ZXNwYWNlOiAoaWQ6IHN0cmluZywgbmV3QWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIG5ld0hlaWdodDogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0XHRcdFx0aGFkQUNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0bmV3QWZ0ZXJMaW5lTnVtYmVyID0gbmV3QWZ0ZXJMaW5lTnVtYmVyIHwgMDtcblx0XHRcdFx0XHRuZXdIZWlnaHQgPSBuZXdIZWlnaHQgfCAwO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzLmNoYW5nZSh7IGlkLCBuZXdBZnRlckxpbmVOdW1iZXIsIG5ld0hlaWdodCB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVtb3ZlV2hpdGVzcGFjZTogKGlkOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0XHRoYWRBQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5yZW1vdmUoeyBpZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNhbGxiYWNrKGFjY2Vzc29yKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMuY29tbWl0KHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gaGFkQUNoYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBfY29tbWl0UGVuZGluZ0NoYW5nZXMoaW5zZXJ0czogRWRpdG9yV2hpdGVzcGFjZVtdLCBjaGFuZ2VzOiBJUGVuZGluZ0NoYW5nZVtdLCByZW1vdmVzOiBJUGVuZGluZ1JlbW92ZVtdKTogdm9pZCB7XG5cdFx0aWYgKGluc2VydHMubGVuZ3RoID4gMCB8fCByZW1vdmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX21pbldpZHRoID0gLTE7IC8qIG1hcmtlciBmb3Igbm90IGJlaW5nIGNvbXB1dGVkICovXG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydHMubGVuZ3RoICsgY2hhbmdlcy5sZW5ndGggKyByZW1vdmVzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHQvLyB3aGVuIG9ubHkgb25lIHRoaW5nIGhhcHBlbmVkLCBoYW5kbGUgaXQgXCJkZWxpY2F0ZWx5XCJcblx0XHRcdGZvciAoY29uc3QgaW5zZXJ0IG9mIGluc2VydHMpIHtcblx0XHRcdFx0dGhpcy5faW5zZXJ0V2hpdGVzcGFjZShpbnNlcnQpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VPbmVXaGl0ZXNwYWNlKGNoYW5nZS5pZCwgY2hhbmdlLm5ld0FmdGVyTGluZU51bWJlciwgY2hhbmdlLm5ld0hlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZSBvZiByZW1vdmVzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZmluZFdoaXRlc3BhY2VJbmRleChyZW1vdmUuaWQpO1xuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVtb3ZlV2hpdGVzcGFjZShpbmRleCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gc2ltcGx5IHJlYnVpbGQgdGhlIGVudGlyZSBkYXRhc3RydWN0dXJlXG5cblx0XHRjb25zdCB0b1JlbW92ZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcmVtb3ZlIG9mIHJlbW92ZXMpIHtcblx0XHRcdHRvUmVtb3ZlLmFkZChyZW1vdmUuaWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvQ2hhbmdlID0gbmV3IE1hcDxzdHJpbmcsIElQZW5kaW5nQ2hhbmdlPigpO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdHRvQ2hhbmdlLnNldChjaGFuZ2UuaWQsIGNoYW5nZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBwbHlSZW1vdmVBbmRDaGFuZ2UgPSAod2hpdGVzcGFjZXM6IEVkaXRvcldoaXRlc3BhY2VbXSk6IEVkaXRvcldoaXRlc3BhY2VbXSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IEVkaXRvcldoaXRlc3BhY2VbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB3aGl0ZXNwYWNlIG9mIHdoaXRlc3BhY2VzKSB7XG5cdFx0XHRcdGlmICh0b1JlbW92ZS5oYXMod2hpdGVzcGFjZS5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9DaGFuZ2UuaGFzKHdoaXRlc3BhY2UuaWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbmdlID0gdG9DaGFuZ2UuZ2V0KHdoaXRlc3BhY2UuaWQpITtcblx0XHRcdFx0XHR3aGl0ZXNwYWNlLmFmdGVyTGluZU51bWJlciA9IGNoYW5nZS5uZXdBZnRlckxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0d2hpdGVzcGFjZS5oZWlnaHQgPSBjaGFuZ2UubmV3SGVpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHdoaXRlc3BhY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXBwbHlSZW1vdmVBbmRDaGFuZ2UodGhpcy5fYXJyKS5jb25jYXQoYXBwbHlSZW1vdmVBbmRDaGFuZ2UoaW5zZXJ0cykpO1xuXHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5hZnRlckxpbmVOdW1iZXIgPT09IGIuYWZ0ZXJMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBhLm9yZGluYWwgLSBiLm9yZGluYWw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5hZnRlckxpbmVOdW1iZXIgLSBiLmFmdGVyTGluZU51bWJlcjtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2FyciA9IHJlc3VsdDtcblx0XHR0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4ID0gLTE7XG5cdH1cblxuXHRwcml2YXRlIF9pbnNlcnRXaGl0ZXNwYWNlKHdoaXRlc3BhY2U6IEVkaXRvcldoaXRlc3BhY2UpOiB2b2lkIHtcblx0XHRjb25zdCBpbnNlcnRJbmRleCA9IExpbmVzTGF5b3V0LmZpbmRJbnNlcnRpb25JbmRleCh0aGlzLl9hcnIsIHdoaXRlc3BhY2UuYWZ0ZXJMaW5lTnVtYmVyLCB3aGl0ZXNwYWNlLm9yZGluYWwpO1xuXHRcdHRoaXMuX2Fyci5zcGxpY2UoaW5zZXJ0SW5kZXgsIDAsIHdoaXRlc3BhY2UpO1xuXHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSBNYXRoLm1pbih0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4LCBpbnNlcnRJbmRleCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFdoaXRlc3BhY2VJbmRleChpZDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCBhcnIgPSB0aGlzLl9hcnI7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGFycltpXS5pZCA9PT0gaWQpIHtcblx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZU9uZVdoaXRlc3BhY2UoaWQ6IHN0cmluZywgbmV3QWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIG5ld0hlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9maW5kV2hpdGVzcGFjZUluZGV4KGlkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hcnJbaW5kZXhdLmhlaWdodCAhPT0gbmV3SGVpZ2h0KSB7XG5cdFx0XHR0aGlzLl9hcnJbaW5kZXhdLmhlaWdodCA9IG5ld0hlaWdodDtcblx0XHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSBNYXRoLm1pbih0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4LCBpbmRleCAtIDEpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXJyW2luZGV4XS5hZnRlckxpbmVOdW1iZXIgIT09IG5ld0FmdGVyTGluZU51bWJlcikge1xuXHRcdFx0Ly8gYGFmdGVyTGluZU51bWJlcmAgY2hhbmdlZCBmb3IgdGhpcyB3aGl0ZXNwYWNlXG5cblx0XHRcdC8vIFJlY29yZCBvbGQgd2hpdGVzcGFjZVxuXHRcdFx0Y29uc3Qgd2hpdGVzcGFjZSA9IHRoaXMuX2FycltpbmRleF07XG5cblx0XHRcdC8vIFNpbmNlIGNoYW5naW5nIGBhZnRlckxpbmVOdW1iZXJgIGNhbiB0cmlnZ2VyIGEgcmVvcmRlcmluZywgd2UncmUgZ29ubmEgcmVtb3ZlIHRoaXMgd2hpdGVzcGFjZVxuXHRcdFx0dGhpcy5fcmVtb3ZlV2hpdGVzcGFjZShpbmRleCk7XG5cblx0XHRcdHdoaXRlc3BhY2UuYWZ0ZXJMaW5lTnVtYmVyID0gbmV3QWZ0ZXJMaW5lTnVtYmVyO1xuXG5cdFx0XHQvLyBBbmQgYWRkIGl0IGFnYWluXG5cdFx0XHR0aGlzLl9pbnNlcnRXaGl0ZXNwYWNlKHdoaXRlc3BhY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVdoaXRlc3BhY2UocmVtb3ZlSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Fyci5zcGxpY2UocmVtb3ZlSW5kZXgsIDEpO1xuXHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSBNYXRoLm1pbih0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4LCByZW1vdmVJbmRleCAtIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vdGlmeSB0aGUgbGF5b3V0ZXIgdGhhdCBsaW5lcyBoYXZlIGJlZW4gZGVsZXRlZCAoYSBjb250aW51b3VzIHpvbmUgb2YgbGluZXMpLlxuXHQgKlxuXHQgKiBAcGFyYW0gZnJvbUxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyIGF0IHdoaWNoIHRoZSBkZWxldGlvbiBzdGFydGVkLCBpbmNsdXNpdmVcblx0ICogQHBhcmFtIHRvTGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgYXQgd2hpY2ggdGhlIGRlbGV0aW9uIGVuZGVkLCBpbmNsdXNpdmVcblx0ICovXG5cdHB1YmxpYyBvbkxpbmVzRGVsZXRlZChmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGZyb21MaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXIgfCAwO1xuXHRcdHRvTGluZU51bWJlciA9IHRvTGluZU51bWJlciB8IDA7XG5cblx0XHR0aGlzLl9saW5lQ291bnQgLT0gKHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMSk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2Fyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgYWZ0ZXJMaW5lTnVtYmVyID0gdGhpcy5fYXJyW2ldLmFmdGVyTGluZU51bWJlcjtcblxuXHRcdFx0aWYgKGZyb21MaW5lTnVtYmVyIDw9IGFmdGVyTGluZU51bWJlciAmJiBhZnRlckxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFRoZSBsaW5lIHRoaXMgd2hpdGVzcGFjZSB3YXMgYWZ0ZXIgaGFzIGJlZW4gZGVsZXRlZFxuXHRcdFx0XHQvLyAgPT4gbW92ZSB3aGl0ZXNwYWNlIHRvIGJlZm9yZSBmaXJzdCBkZWxldGVkIGxpbmVcblx0XHRcdFx0dGhpcy5fYXJyW2ldLmFmdGVyTGluZU51bWJlciA9IGZyb21MaW5lTnVtYmVyIC0gMTtcblx0XHRcdH0gZWxzZSBpZiAoYWZ0ZXJMaW5lTnVtYmVyID4gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFRoZSBsaW5lIHRoaXMgd2hpdGVzcGFjZSB3YXMgYWZ0ZXIgaGFzIGJlZW4gbW92ZWQgdXBcblx0XHRcdFx0Ly8gID0+IG1vdmUgd2hpdGVzcGFjZSB1cFxuXHRcdFx0XHR0aGlzLl9hcnJbaV0uYWZ0ZXJMaW5lTnVtYmVyIC09ICh0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIub25MaW5lc0RlbGV0ZWQoZnJvbUxpbmVOdW1iZXIsIHRvTGluZU51bWJlcik7XG5cdH1cblxuXHQvKipcblx0ICogTm90aWZ5IHRoZSBsYXlvdXRlciB0aGF0IGxpbmVzIGhhdmUgYmVlbiBpbnNlcnRlZCAoYSBjb250aW51b3VzIHpvbmUgb2YgbGluZXMpLlxuXHQgKlxuXHQgKiBAcGFyYW0gZnJvbUxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyIGF0IHdoaWNoIHRoZSBpbnNlcnRpb24gc3RhcnRlZCwgaW5jbHVzaXZlXG5cdCAqIEBwYXJhbSB0b0xpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyIGF0IHdoaWNoIHRoZSBpbnNlcnRpb24gZW5kZWQsIGluY2x1c2l2ZS5cblx0ICovXG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmcm9tTGluZU51bWJlciA9IGZyb21MaW5lTnVtYmVyIHwgMDtcblx0XHR0b0xpbmVOdW1iZXIgPSB0b0xpbmVOdW1iZXIgfCAwO1xuXG5cdFx0dGhpcy5fbGluZUNvdW50ICs9ICh0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDEpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9hcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGFmdGVyTGluZU51bWJlciA9IHRoaXMuX2FycltpXS5hZnRlckxpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChmcm9tTGluZU51bWJlciA8PSBhZnRlckxpbmVOdW1iZXIpIHtcblx0XHRcdFx0dGhpcy5fYXJyW2ldLmFmdGVyTGluZU51bWJlciArPSAodG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLm9uTGluZXNJbnNlcnRlZChmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHN1bSBvZiBhbGwgdGhlIHdoaXRlc3BhY2VzLlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VzVG90YWxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fYXJyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldFdoaXRlc3BhY2VzQWNjdW11bGF0ZWRIZWlnaHQodGhpcy5fYXJyLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgc3VtIG9mIHRoZSBoZWlnaHRzIG9mIHRoZSB3aGl0ZXNwYWNlcyBhdCBbMC4uaW5kZXhdLlxuXHQgKiBUaGlzIGluY2x1ZGVzIHRoZSB3aGl0ZXNwYWNlIGF0IGBpbmRleGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUgaW5kZXggb2YgdGhlIHdoaXRlc3BhY2UuXG5cdCAqIEByZXR1cm4gVGhlIHN1bSBvZiB0aGUgaGVpZ2h0cyBvZiBhbGwgd2hpdGVzcGFjZXMgYmVmb3JlIHRoZSBvbmUgYXQgYGluZGV4YCwgaW5jbHVkaW5nIHRoZSBvbmUgYXQgYGluZGV4YC5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlc0FjY3VtdWxhdGVkSGVpZ2h0KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGluZGV4ID0gaW5kZXggfCAwO1xuXG5cdFx0bGV0IHN0YXJ0SW5kZXggPSBNYXRoLm1heCgwLCB0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4ICsgMSk7XG5cdFx0aWYgKHN0YXJ0SW5kZXggPT09IDApIHtcblx0XHRcdHRoaXMuX2FyclswXS5wcmVmaXhTdW0gPSB0aGlzLl9hcnJbMF0uaGVpZ2h0O1xuXHRcdFx0c3RhcnRJbmRleCsrO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDw9IGluZGV4OyBpKyspIHtcblx0XHRcdHRoaXMuX2FycltpXS5wcmVmaXhTdW0gPSB0aGlzLl9hcnJbaSAtIDFdLnByZWZpeFN1bSArIHRoaXMuX2FycltpXS5oZWlnaHQ7XG5cdFx0fVxuXHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSBNYXRoLm1heCh0aGlzLl9wcmVmaXhTdW1WYWxpZEluZGV4LCBpbmRleCk7XG5cdFx0cmV0dXJuIHRoaXMuX2FycltpbmRleF0ucHJlZml4U3VtO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgc3VtIG9mIGhlaWdodHMgZm9yIGFsbCBvYmplY3RzLlxuXHQgKlxuXHQgKiBAcmV0dXJuIFRoZSBzdW0gb2YgaGVpZ2h0cyBmb3IgYWxsIG9iamVjdHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0TGluZXNUb3RhbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVzSGVpZ2h0ID0gdGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKHRoaXMuX2xpbmVDb3VudCk7XG5cdFx0Y29uc3Qgd2hpdGVzcGFjZXNIZWlnaHQgPSB0aGlzLmdldFdoaXRlc3BhY2VzVG90YWxIZWlnaHQoKTtcblxuXHRcdHJldHVybiBsaW5lc0hlaWdodCArIHdoaXRlc3BhY2VzSGVpZ2h0ICsgdGhpcy5fcGFkZGluZ1RvcCArIHRoaXMuX3BhZGRpbmdCb3R0b207XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgYWNjdW11bGF0ZWQgaGVpZ2h0IG9mIHdoaXRlc3BhY2VzIGJlZm9yZSB0aGUgZ2l2ZW4gbGluZSBudW1iZXIuXG5cdCAqXG5cdCAqIEBwYXJhbSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlclxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VBY2N1bXVsYXRlZEhlaWdodEJlZm9yZUxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciB8IDA7XG5cblx0XHRjb25zdCBsYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIgPSB0aGlzLl9maW5kTGFzdFdoaXRlc3BhY2VCZWZvcmVMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXG5cdFx0aWYgKGxhc3RXaGl0ZXNwYWNlQmVmb3JlTGluZU51bWJlciA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldFdoaXRlc3BhY2VzQWNjdW11bGF0ZWRIZWlnaHQobGFzdFdoaXRlc3BhY2VCZWZvcmVMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRMYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciB8IDA7XG5cblx0XHQvLyBGaW5kIHRoZSB3aGl0ZXNwYWNlIGJlZm9yZSBsaW5lIG51bWJlclxuXHRcdGNvbnN0IGFyciA9IHRoaXMuX2Fycjtcblx0XHRsZXQgbG93ID0gMDtcblx0XHRsZXQgaGlnaCA9IGFyci5sZW5ndGggLSAxO1xuXG5cdFx0d2hpbGUgKGxvdyA8PSBoaWdoKSB7XG5cdFx0XHRjb25zdCBkZWx0YSA9IChoaWdoIC0gbG93KSB8IDA7XG5cdFx0XHRjb25zdCBoYWxmRGVsdGEgPSAoZGVsdGEgLyAyKSB8IDA7XG5cdFx0XHRjb25zdCBtaWQgPSAobG93ICsgaGFsZkRlbHRhKSB8IDA7XG5cblx0XHRcdGlmIChhcnJbbWlkXS5hZnRlckxpbmVOdW1iZXIgPCBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGlmIChtaWQgKyAxID49IGFyci5sZW5ndGggfHwgYXJyW21pZCArIDFdLmFmdGVyTGluZU51bWJlciA+PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1pZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb3cgPSAobWlkICsgMSkgfCAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWdoID0gKG1pZCAtIDEpIHwgMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kRmlyc3RXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGluZU51bWJlciA9IGxpbmVOdW1iZXIgfCAwO1xuXG5cdFx0Y29uc3QgbGFzdFdoaXRlc3BhY2VCZWZvcmVMaW5lTnVtYmVyID0gdGhpcy5fZmluZExhc3RXaGl0ZXNwYWNlQmVmb3JlTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBmaXJzdFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXIgPSBsYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIgKyAxO1xuXG5cdFx0aWYgKGZpcnN0V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlciA8IHRoaXMuX2Fyci5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmaXJzdFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIGluZGV4IG9mIHRoZSBmaXJzdCB3aGl0ZXNwYWNlIHdoaWNoIGhhcyBgYWZ0ZXJMaW5lTnVtYmVyYCA+PSBgbGluZU51bWJlcmAuXG5cdCAqIEByZXR1cm4gVGhlIGluZGV4IG9mIHRoZSBmaXJzdCB3aGl0ZXNwYWNlIHdpdGggYGFmdGVyTGluZU51bWJlcmAgPj0gYGxpbmVOdW1iZXJgIG9yIC0xIGlmIG5vIHdoaXRlc3BhY2UgaXMgZm91bmQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Rmlyc3RXaGl0ZXNwYWNlSW5kZXhBZnRlckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciB8IDA7XG5cblx0XHRyZXR1cm4gdGhpcy5fZmluZEZpcnN0V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZlcnRpY2FsIG9mZnNldCAodGhlIHN1bSBvZiBoZWlnaHRzIGZvciBhbGwgb2JqZWN0cyBhYm92ZSkgYSBjZXJ0YWluIGxpbmUgbnVtYmVyLlxuXHQgKlxuXHQgKiBAcGFyYW0gbGluZU51bWJlciBUaGUgbGluZSBudW1iZXJcblx0ICogQHJldHVybiBUaGUgc3VtIG9mIGhlaWdodHMgZm9yIGFsbCBvYmplY3RzIGFib3ZlIGBsaW5lTnVtYmVyYC5cblx0ICovXG5cdHB1YmxpYyBnZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyLCBpbmNsdWRlVmlld1pvbmVzID0gZmFsc2UpOiBudW1iZXIge1xuXHRcdGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIHwgMDtcblxuXHRcdGxldCBwcmV2aW91c0xpbmVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRwcmV2aW91c0xpbmVzSGVpZ2h0ID0gdGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKGxpbmVOdW1iZXIgLSAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJldmlvdXNMaW5lc0hlaWdodCA9IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNXaGl0ZXNwYWNlc0hlaWdodCA9IHRoaXMuZ2V0V2hpdGVzcGFjZUFjY3VtdWxhdGVkSGVpZ2h0QmVmb3JlTGluZU51bWJlcihsaW5lTnVtYmVyIC0gKGluY2x1ZGVWaWV3Wm9uZXMgPyAxIDogMCkpO1xuXG5cdFx0cmV0dXJuIHByZXZpb3VzTGluZXNIZWlnaHQgKyBwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0ICsgdGhpcy5fcGFkZGluZ1RvcDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZlcnRpY2FsIG9mZnNldCAodGhlIHN1bSBvZiBoZWlnaHRzIGZvciBhbGwgb2JqZWN0cyBhYm92ZSkgYSBjZXJ0YWluIGxpbmUgbnVtYmVyIGFuZCBhbHNvIHRoZSBsaW5lIGhlaWdodCBvZiB0aGUgbGluZS5cblx0ICpcblx0ICogQHBhcmFtIGxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyXG5cdCAqIEByZXR1cm4gVGhlIHN1bSBvZiBoZWlnaHRzIGZvciBhbGwgb2JqZWN0cyBhYm92ZSBgbGluZU51bWJlcmAuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0VmVydGljYWxPZmZzZXRBZnRlckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyLCBpbmNsdWRlVmlld1pvbmVzID0gZmFsc2UpOiBudW1iZXIge1xuXHRcdGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIHwgMDtcblx0XHRjb25zdCBwcmV2aW91c0xpbmVzSGVpZ2h0ID0gdGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgPSB0aGlzLmdldFdoaXRlc3BhY2VBY2N1bXVsYXRlZEhlaWdodEJlZm9yZUxpbmVOdW1iZXIobGluZU51bWJlciArIChpbmNsdWRlVmlld1pvbmVzID8gMSA6IDApKTtcblx0XHRyZXR1cm4gcHJldmlvdXNMaW5lc0hlaWdodCArIHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgKyB0aGlzLl9wYWRkaW5nVG9wO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhlcmUgaXMgYW55IHdoaXRlc3BhY2UgaW4gdGhlIGRvY3VtZW50LlxuXHQgKi9cblx0cHVibGljIGhhc1doaXRlc3BhY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V2hpdGVzcGFjZXNDb3VudCgpID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBtaW4gd2lkdGggZm9yIGFsbCB3aGl0ZXNwYWNlcy5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlTWluV2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fbWluV2lkdGggPT09IC0xKSB7XG5cdFx0XHRsZXQgbWluV2lkdGggPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2Fyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRtaW5XaWR0aCA9IE1hdGgubWF4KG1pbldpZHRoLCB0aGlzLl9hcnJbaV0ubWluV2lkdGgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWluV2lkdGggPSBtaW5XaWR0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21pbldpZHRoO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIGB2ZXJ0aWNhbE9mZnNldGAgaXMgYmVsb3cgYWxsIGxpbmVzLlxuXHQgKi9cblx0cHVibGljIGlzQWZ0ZXJMaW5lcyh2ZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSB0aGlzLmdldExpbmVzVG90YWxIZWlnaHQoKTtcblx0XHRyZXR1cm4gdmVydGljYWxPZmZzZXQgPiB0b3RhbEhlaWdodDtcblx0fVxuXG5cdHB1YmxpYyBpc0luVG9wUGFkZGluZyh2ZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3BhZGRpbmdUb3AgPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh2ZXJ0aWNhbE9mZnNldCA8IHRoaXMuX3BhZGRpbmdUb3ApO1xuXHR9XG5cblx0cHVibGljIGlzSW5Cb3R0b21QYWRkaW5nKHZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGFkZGluZ0JvdHRvbSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IHRoaXMuZ2V0TGluZXNUb3RhbEhlaWdodCgpO1xuXHRcdHJldHVybiAodmVydGljYWxPZmZzZXQgPj0gdG90YWxIZWlnaHQgLSB0aGlzLl9wYWRkaW5nQm90dG9tKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBmaXJzdCBsaW5lIG51bWJlciB0aGF0IGlzIGF0IG9yIGFmdGVyIHZlcnRpY2FsIG9mZnNldCBgdmVydGljYWxPZmZzZXRgLlxuXHQgKiBpLmUuIGlmIGdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZShsaW5lKSBpcyB4IGFuZCBnZXRWZXJ0aWNhbE9mZnNldEZvckxpbmUobGluZSArIDEpIGlzIHksIHRoZW5cblx0ICogZ2V0TGluZU51bWJlckF0T3JBZnRlclZlcnRpY2FsT2Zmc2V0KGkpID0gbGluZSwgeCA8PSBpIDwgeS5cblx0ICpcblx0ICogQHBhcmFtIHZlcnRpY2FsT2Zmc2V0IFRoZSB2ZXJ0aWNhbCBvZmZzZXQgdG8gc2VhcmNoIGF0LlxuXHQgKiBAcmV0dXJuIFRoZSBsaW5lIG51bWJlciBhdCBvciBhZnRlciB2ZXJ0aWNhbCBvZmZzZXQgYHZlcnRpY2FsT2Zmc2V0YC5cblx0ICovXG5cdHB1YmxpYyBnZXRMaW5lTnVtYmVyQXRPckFmdGVyVmVydGljYWxPZmZzZXQodmVydGljYWxPZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dmVydGljYWxPZmZzZXQgPSB2ZXJ0aWNhbE9mZnNldCB8IDA7XG5cblx0XHRpZiAodmVydGljYWxPZmZzZXQgPCAwKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lc0NvdW50ID0gdGhpcy5fbGluZUNvdW50IHwgMDtcblx0XHRsZXQgbWluTGluZU51bWJlciA9IDE7XG5cdFx0bGV0IG1heExpbmVOdW1iZXIgPSBsaW5lc0NvdW50O1xuXG5cdFx0d2hpbGUgKG1pbkxpbmVOdW1iZXIgPCBtYXhMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBtaWRMaW5lTnVtYmVyID0gKChtaW5MaW5lTnVtYmVyICsgbWF4TGluZU51bWJlcikgLyAyKSB8IDA7XG5cblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKG1pZExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbWlkTGluZU51bWJlclZlcnRpY2FsT2Zmc2V0ID0gdGhpcy5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobWlkTGluZU51bWJlcikgfCAwO1xuXG5cdFx0XHRpZiAodmVydGljYWxPZmZzZXQgPj0gbWlkTGluZU51bWJlclZlcnRpY2FsT2Zmc2V0ICsgbGluZUhlaWdodCkge1xuXHRcdFx0XHQvLyB2ZXJ0aWNhbCBvZmZzZXQgaXMgYWZ0ZXIgbWlkIGxpbmUgbnVtYmVyXG5cdFx0XHRcdG1pbkxpbmVOdW1iZXIgPSBtaWRMaW5lTnVtYmVyICsgMTtcblx0XHRcdH0gZWxzZSBpZiAodmVydGljYWxPZmZzZXQgPj0gbWlkTGluZU51bWJlclZlcnRpY2FsT2Zmc2V0KSB7XG5cdFx0XHRcdC8vIEhpdFxuXHRcdFx0XHRyZXR1cm4gbWlkTGluZU51bWJlcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHZlcnRpY2FsIG9mZnNldCBpcyBiZWZvcmUgbWlkIGxpbmUgbnVtYmVyLCBidXQgbWlkIGxpbmUgbnVtYmVyIGNvdWxkIHN0aWxsIGJlIHdoYXQgd2UncmUgc2VhcmNoaW5nIGZvclxuXHRcdFx0XHRtYXhMaW5lTnVtYmVyID0gbWlkTGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWluTGluZU51bWJlciA+IGxpbmVzQ291bnQpIHtcblx0XHRcdHJldHVybiBsaW5lc0NvdW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBtaW5MaW5lTnVtYmVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgdGhlIGxpbmVzIGFuZCB0aGVpciByZWxhdGl2ZSB2ZXJ0aWNhbCBvZmZzZXRzIHRoYXQgYXJlIHBvc2l0aW9uZWQgYmV0d2VlbiBgdmVydGljYWxPZmZzZXQxYCBhbmQgYHZlcnRpY2FsT2Zmc2V0MmAuXG5cdCAqXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbE9mZnNldDEgVGhlIGJlZ2lubmluZyBvZiB0aGUgdmlld3BvcnQuXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbE9mZnNldDIgVGhlIGVuZCBvZiB0aGUgdmlld3BvcnQuXG5cdCAqIEByZXR1cm4gQSBzdHJ1Y3R1cmUgZGVzY3JpYmluZyB0aGUgbGluZXMgcG9zaXRpb25lZCBiZXR3ZWVuIGB2ZXJ0aWNhbE9mZnNldDFgIGFuZCBgdmVydGljYWxPZmZzZXQyYC5cblx0ICovXG5cdHB1YmxpYyBnZXRMaW5lc1ZpZXdwb3J0RGF0YSh2ZXJ0aWNhbE9mZnNldDE6IG51bWJlciwgdmVydGljYWxPZmZzZXQyOiBudW1iZXIpOiBJUGFydGlhbFZpZXdMaW5lc1ZpZXdwb3J0RGF0YSB7XG5cdFx0dmVydGljYWxPZmZzZXQxID0gdmVydGljYWxPZmZzZXQxIHwgMDtcblx0XHR2ZXJ0aWNhbE9mZnNldDIgPSB2ZXJ0aWNhbE9mZnNldDIgfCAwO1xuXG5cdFx0Ly8gRmluZCBmaXJzdCBsaW5lIG51bWJlclxuXHRcdC8vIFdlIGRvbid0IGxpdmUgaW4gYSBwZXJmZWN0IHdvcmxkLCBzbyB0aGUgbGluZSBudW1iZXIgbWlnaHQgc3RhcnQgYmVmb3JlIG9yIGFmdGVyIHZlcnRpY2FsT2Zmc2V0MVxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuZ2V0TGluZU51bWJlckF0T3JBZnRlclZlcnRpY2FsT2Zmc2V0KHZlcnRpY2FsT2Zmc2V0MSkgfCAwO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0ID0gdGhpcy5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKSB8IDA7XG5cblx0XHRsZXQgZW5kTGluZU51bWJlciA9IHRoaXMuX2xpbmVDb3VudCB8IDA7XG5cblx0XHQvLyBBbHNvIGtlZXAgdHJhY2sgb2Ygd2hhdCB3aGl0ZXNwYWNlIHdlJ3ZlIGdvdFxuXHRcdGxldCB3aGl0ZXNwYWNlSW5kZXggPSB0aGlzLmdldEZpcnN0V2hpdGVzcGFjZUluZGV4QWZ0ZXJMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcikgfCAwO1xuXHRcdGNvbnN0IHdoaXRlc3BhY2VDb3VudCA9IHRoaXMuZ2V0V2hpdGVzcGFjZXNDb3VudCgpIHwgMDtcblx0XHRsZXQgY3VycmVudFdoaXRlc3BhY2VIZWlnaHQ6IG51bWJlcjtcblx0XHRsZXQgY3VycmVudFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXI6IG51bWJlcjtcblxuXHRcdGlmICh3aGl0ZXNwYWNlSW5kZXggPT09IC0xKSB7XG5cdFx0XHR3aGl0ZXNwYWNlSW5kZXggPSB3aGl0ZXNwYWNlQ291bnQ7XG5cdFx0XHRjdXJyZW50V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0Y3VycmVudFdoaXRlc3BhY2VIZWlnaHQgPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJyZW50V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlciA9IHRoaXMuZ2V0QWZ0ZXJMaW5lTnVtYmVyRm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleCkgfCAwO1xuXHRcdFx0Y3VycmVudFdoaXRlc3BhY2VIZWlnaHQgPSB0aGlzLmdldEhlaWdodEZvcldoaXRlc3BhY2VJbmRleCh3aGl0ZXNwYWNlSW5kZXgpIHwgMDtcblx0XHR9XG5cblx0XHRsZXQgY3VycmVudFZlcnRpY2FsT2Zmc2V0ID0gc3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQ7XG5cdFx0bGV0IGN1cnJlbnRMaW5lUmVsYXRpdmVPZmZzZXQgPSBjdXJyZW50VmVydGljYWxPZmZzZXQ7XG5cblx0XHQvLyBJRSAoYWxsIHZlcnNpb25zKSBjYW5ub3QgaGFuZGxlIHVuaXRzIGFib3ZlIGFib3V0IDEsNTMzLDkwOCBweCwgc28gZXZlcnkgNTAwayBwaXhlbHMgYnJpbmcgbnVtYmVycyBkb3duXG5cdFx0Y29uc3QgU1RFUF9TSVpFID0gNTAwMDAwO1xuXHRcdGxldCBiaWdOdW1iZXJzRGVsdGEgPSAwO1xuXHRcdGlmIChzdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldCA+PSBTVEVQX1NJWkUpIHtcblx0XHRcdC8vIENvbXB1dGUgYSBkZWx0YSB0aGF0IGd1YXJhbnRlZXMgdGhhdCBsaW5lcyBhcmUgcG9zaXRpb25lZCBhdCBgbGluZUhlaWdodGAgaW5jcmVtZW50c1xuXHRcdFx0YmlnTnVtYmVyc0RlbHRhID0gTWF0aC5mbG9vcihzdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldCAvIFNURVBfU0laRSkgKiBTVEVQX1NJWkU7XG5cdFx0XHRiaWdOdW1iZXJzRGVsdGEgPSBNYXRoLmZsb29yKGJpZ051bWJlcnNEZWx0YSAvIHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5kZWZhdWx0TGluZUhlaWdodCkgKiB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZGVmYXVsdExpbmVIZWlnaHQ7XG5cblx0XHRcdGN1cnJlbnRMaW5lUmVsYXRpdmVPZmZzZXQgLT0gYmlnTnVtYmVyc0RlbHRhO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzT2Zmc2V0czogbnVtYmVyW10gPSBbXTtcblxuXHRcdGNvbnN0IHZlcnRpY2FsQ2VudGVyID0gdmVydGljYWxPZmZzZXQxICsgKHZlcnRpY2FsT2Zmc2V0MiAtIHZlcnRpY2FsT2Zmc2V0MSkgLyAyO1xuXHRcdGxldCBjZW50ZXJlZExpbmVOdW1iZXIgPSAtMTtcblxuXHRcdC8vIEZpZ3VyZSBvdXQgaG93IGZhciB0aGUgbGluZXMgZ29cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0XHRpZiAoY2VudGVyZWRMaW5lTnVtYmVyID09PSAtMSkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TGluZVRvcCA9IGN1cnJlbnRWZXJ0aWNhbE9mZnNldDtcblx0XHRcdFx0Y29uc3QgY3VycmVudExpbmVCb3R0b20gPSBjdXJyZW50VmVydGljYWxPZmZzZXQgKyBsaW5lSGVpZ2h0O1xuXHRcdFx0XHRpZiAoKGN1cnJlbnRMaW5lVG9wIDw9IHZlcnRpY2FsQ2VudGVyICYmIHZlcnRpY2FsQ2VudGVyIDwgY3VycmVudExpbmVCb3R0b20pIHx8IGN1cnJlbnRMaW5lVG9wID4gdmVydGljYWxDZW50ZXIpIHtcblx0XHRcdFx0XHRjZW50ZXJlZExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvdW50IGN1cnJlbnQgbGluZSBoZWlnaHQgaW4gdGhlIHZlcnRpY2FsIG9mZnNldHNcblx0XHRcdGN1cnJlbnRWZXJ0aWNhbE9mZnNldCArPSBsaW5lSGVpZ2h0O1xuXHRcdFx0bGluZXNPZmZzZXRzW2xpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXJdID0gY3VycmVudExpbmVSZWxhdGl2ZU9mZnNldDtcblxuXHRcdFx0Ly8gTmV4dCBsaW5lIHN0YXJ0cyBpbW1lZGlhdGVseSBhZnRlciB0aGlzIG9uZVxuXHRcdFx0Y3VycmVudExpbmVSZWxhdGl2ZU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuXHRcdFx0d2hpbGUgKGN1cnJlbnRXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFB1c2ggZG93biBuZXh0IGxpbmUgd2l0aCB0aGUgaGVpZ2h0IG9mIHRoZSBjdXJyZW50IHdoaXRlc3BhY2Vcblx0XHRcdFx0Y3VycmVudExpbmVSZWxhdGl2ZU9mZnNldCArPSBjdXJyZW50V2hpdGVzcGFjZUhlaWdodDtcblxuXHRcdFx0XHQvLyBDb3VudCBjdXJyZW50IHdoaXRlc3BhY2UgaW4gdGhlIHZlcnRpY2FsIG9mZnNldHNcblx0XHRcdFx0Y3VycmVudFZlcnRpY2FsT2Zmc2V0ICs9IGN1cnJlbnRXaGl0ZXNwYWNlSGVpZ2h0O1xuXHRcdFx0XHR3aGl0ZXNwYWNlSW5kZXgrKztcblxuXHRcdFx0XHRpZiAod2hpdGVzcGFjZUluZGV4ID49IHdoaXRlc3BhY2VDb3VudCkge1xuXHRcdFx0XHRcdGN1cnJlbnRXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlciArIDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3VycmVudFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXIgPSB0aGlzLmdldEFmdGVyTGluZU51bWJlckZvcldoaXRlc3BhY2VJbmRleCh3aGl0ZXNwYWNlSW5kZXgpIHwgMDtcblx0XHRcdFx0XHRjdXJyZW50V2hpdGVzcGFjZUhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0Rm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleCkgfCAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXJyZW50VmVydGljYWxPZmZzZXQgPj0gdmVydGljYWxPZmZzZXQyKSB7XG5cdFx0XHRcdC8vIFdlIGhhdmUgY292ZXJlZCB0aGUgZW50aXJlIHZpZXdwb3J0IGFyZWEsIHRpbWUgdG8gc3RvcFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNlbnRlcmVkTGluZU51bWJlciA9PT0gLTEpIHtcblx0XHRcdGNlbnRlcmVkTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5kTGluZU51bWJlclZlcnRpY2FsT2Zmc2V0ID0gdGhpcy5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIoZW5kTGluZU51bWJlcikgfCAwO1xuXG5cdFx0bGV0IGNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCBjb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyO1xuXG5cdFx0aWYgKGNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyIDwgY29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgPCB2ZXJ0aWNhbE9mZnNldDEpIHtcblx0XHRcdFx0Y29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXIrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyIDwgY29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBlbmRMaW5lSGVpZ2h0ID0gdGhpcy5nZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcihlbmRMaW5lTnVtYmVyKTtcblx0XHRcdGlmIChlbmRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgKyBlbmRMaW5lSGVpZ2h0ID4gdmVydGljYWxPZmZzZXQyKSB7XG5cdFx0XHRcdGNvbXBsZXRlbHlWaXNpYmxlRW5kTGluZU51bWJlci0tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRiaWdOdW1iZXJzRGVsdGE6IGJpZ051bWJlcnNEZWx0YSxcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRcdHJlbGF0aXZlVmVydGljYWxPZmZzZXQ6IGxpbmVzT2Zmc2V0cyxcblx0XHRcdGNlbnRlcmVkTGluZU51bWJlcjogY2VudGVyZWRMaW5lTnVtYmVyLFxuXHRcdFx0Y29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXI6IGNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0Y29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyOiBjb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXIsXG5cdFx0XHRsaW5lSGVpZ2h0OiB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZGVmYXVsdExpbmVIZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWZXJ0aWNhbE9mZnNldEZvcldoaXRlc3BhY2VJbmRleCh3aGl0ZXNwYWNlSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0d2hpdGVzcGFjZUluZGV4ID0gd2hpdGVzcGFjZUluZGV4IHwgMDtcblxuXHRcdGNvbnN0IGFmdGVyTGluZU51bWJlciA9IHRoaXMuZ2V0QWZ0ZXJMaW5lTnVtYmVyRm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleCk7XG5cblx0XHRsZXQgcHJldmlvdXNMaW5lc0hlaWdodDogbnVtYmVyO1xuXHRcdGlmIChhZnRlckxpbmVOdW1iZXIgPj0gMSkge1xuXHRcdFx0cHJldmlvdXNMaW5lc0hlaWdodCA9IHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcihhZnRlckxpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcmV2aW91c0xpbmVzSGVpZ2h0ID0gMDtcblx0XHR9XG5cblx0XHRsZXQgcHJldmlvdXNXaGl0ZXNwYWNlc0hlaWdodDogbnVtYmVyO1xuXHRcdGlmICh3aGl0ZXNwYWNlSW5kZXggPiAwKSB7XG5cdFx0XHRwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0ID0gdGhpcy5nZXRXaGl0ZXNwYWNlc0FjY3VtdWxhdGVkSGVpZ2h0KHdoaXRlc3BhY2VJbmRleCAtIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0ID0gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHByZXZpb3VzTGluZXNIZWlnaHQgKyBwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0ICsgdGhpcy5fcGFkZGluZ1RvcDtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlSW5kZXhBdE9yQWZ0ZXJWZXJ0aWNhbGxPZmZzZXQodmVydGljYWxPZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dmVydGljYWxPZmZzZXQgPSB2ZXJ0aWNhbE9mZnNldCB8IDA7XG5cblx0XHRsZXQgbWluV2hpdGVzcGFjZUluZGV4ID0gMDtcblx0XHRsZXQgbWF4V2hpdGVzcGFjZUluZGV4ID0gdGhpcy5nZXRXaGl0ZXNwYWNlc0NvdW50KCkgLSAxO1xuXG5cdFx0aWYgKG1heFdoaXRlc3BhY2VJbmRleCA8IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHQvLyBTcGVjaWFsIGNhc2U6IG5vdGhpbmcgdG8gYmUgZm91bmRcblx0XHRjb25zdCBtYXhXaGl0ZXNwYWNlVmVydGljYWxPZmZzZXQgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yV2hpdGVzcGFjZUluZGV4KG1heFdoaXRlc3BhY2VJbmRleCk7XG5cdFx0Y29uc3QgbWF4V2hpdGVzcGFjZUhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0Rm9yV2hpdGVzcGFjZUluZGV4KG1heFdoaXRlc3BhY2VJbmRleCk7XG5cdFx0aWYgKHZlcnRpY2FsT2Zmc2V0ID49IG1heFdoaXRlc3BhY2VWZXJ0aWNhbE9mZnNldCArIG1heFdoaXRlc3BhY2VIZWlnaHQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHR3aGlsZSAobWluV2hpdGVzcGFjZUluZGV4IDwgbWF4V2hpdGVzcGFjZUluZGV4KSB7XG5cdFx0XHRjb25zdCBtaWRXaGl0ZXNwYWNlSW5kZXggPSBNYXRoLmZsb29yKChtaW5XaGl0ZXNwYWNlSW5kZXggKyBtYXhXaGl0ZXNwYWNlSW5kZXgpIC8gMik7XG5cblx0XHRcdGNvbnN0IG1pZFdoaXRlc3BhY2VWZXJ0aWNhbE9mZnNldCA9IHRoaXMuZ2V0VmVydGljYWxPZmZzZXRGb3JXaGl0ZXNwYWNlSW5kZXgobWlkV2hpdGVzcGFjZUluZGV4KTtcblx0XHRcdGNvbnN0IG1pZFdoaXRlc3BhY2VIZWlnaHQgPSB0aGlzLmdldEhlaWdodEZvcldoaXRlc3BhY2VJbmRleChtaWRXaGl0ZXNwYWNlSW5kZXgpO1xuXG5cdFx0XHRpZiAodmVydGljYWxPZmZzZXQgPj0gbWlkV2hpdGVzcGFjZVZlcnRpY2FsT2Zmc2V0ICsgbWlkV2hpdGVzcGFjZUhlaWdodCkge1xuXHRcdFx0XHQvLyB2ZXJ0aWNhbCBvZmZzZXQgaXMgYWZ0ZXIgd2hpdGVzcGFjZVxuXHRcdFx0XHRtaW5XaGl0ZXNwYWNlSW5kZXggPSBtaWRXaGl0ZXNwYWNlSW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIGlmICh2ZXJ0aWNhbE9mZnNldCA+PSBtaWRXaGl0ZXNwYWNlVmVydGljYWxPZmZzZXQpIHtcblx0XHRcdFx0Ly8gSGl0XG5cdFx0XHRcdHJldHVybiBtaWRXaGl0ZXNwYWNlSW5kZXg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB2ZXJ0aWNhbCBvZmZzZXQgaXMgYmVmb3JlIHdoaXRlc3BhY2UsIGJ1dCBtaWRXaGl0ZXNwYWNlSW5kZXggbWlnaHQgc3RpbGwgYmUgd2hhdCB3ZSdyZSBzZWFyY2hpbmcgZm9yXG5cdFx0XHRcdG1heFdoaXRlc3BhY2VJbmRleCA9IG1pZFdoaXRlc3BhY2VJbmRleDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1pbldoaXRlc3BhY2VJbmRleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgZXhhY3RseSB0aGUgd2hpdGVzcGFjZSB0aGF0IGlzIGxheW91dGVkIGF0IGB2ZXJ0aWNhbE9mZnNldGAuXG5cdCAqXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbE9mZnNldCBUaGUgdmVydGljYWwgb2Zmc2V0LlxuXHQgKiBAcmV0dXJuIFByZWNpc2VseSB0aGUgd2hpdGVzcGFjZSB0aGF0IGlzIGxheW91dGVkIGF0IGB2ZXJ0aWNhbG9mZnNldGAgb3IgbnVsbC5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlQXRWZXJ0aWNhbE9mZnNldCh2ZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogSVZpZXdXaGl0ZXNwYWNlVmlld3BvcnREYXRhIHwgbnVsbCB7XG5cdFx0dmVydGljYWxPZmZzZXQgPSB2ZXJ0aWNhbE9mZnNldCB8IDA7XG5cblx0XHRjb25zdCBjYW5kaWRhdGVJbmRleCA9IHRoaXMuZ2V0V2hpdGVzcGFjZUluZGV4QXRPckFmdGVyVmVydGljYWxsT2Zmc2V0KHZlcnRpY2FsT2Zmc2V0KTtcblxuXHRcdGlmIChjYW5kaWRhdGVJbmRleCA8IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChjYW5kaWRhdGVJbmRleCA+PSB0aGlzLmdldFdoaXRlc3BhY2VzQ291bnQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuZGlkYXRlVG9wID0gdGhpcy5nZXRWZXJ0aWNhbE9mZnNldEZvcldoaXRlc3BhY2VJbmRleChjYW5kaWRhdGVJbmRleCk7XG5cblx0XHRpZiAoY2FuZGlkYXRlVG9wID4gdmVydGljYWxPZmZzZXQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbmRpZGF0ZUhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0Rm9yV2hpdGVzcGFjZUluZGV4KGNhbmRpZGF0ZUluZGV4KTtcblx0XHRjb25zdCBjYW5kaWRhdGVJZCA9IHRoaXMuZ2V0SWRGb3JXaGl0ZXNwYWNlSW5kZXgoY2FuZGlkYXRlSW5kZXgpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUFmdGVyTGluZU51bWJlciA9IHRoaXMuZ2V0QWZ0ZXJMaW5lTnVtYmVyRm9yV2hpdGVzcGFjZUluZGV4KGNhbmRpZGF0ZUluZGV4KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogY2FuZGlkYXRlSWQsXG5cdFx0XHRhZnRlckxpbmVOdW1iZXI6IGNhbmRpZGF0ZUFmdGVyTGluZU51bWJlcixcblx0XHRcdHZlcnRpY2FsT2Zmc2V0OiBjYW5kaWRhdGVUb3AsXG5cdFx0XHRoZWlnaHQ6IGNhbmRpZGF0ZUhlaWdodFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgbGlzdCBvZiB3aGl0ZXNwYWNlcyB0aGF0IGFyZSBwb3NpdGlvbmVkIGJldHdlZW4gYHZlcnRpY2FsT2Zmc2V0MWAgYW5kIGB2ZXJ0aWNhbE9mZnNldDJgLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmVydGljYWxPZmZzZXQxIFRoZSBiZWdpbm5pbmcgb2YgdGhlIHZpZXdwb3J0LlxuXHQgKiBAcGFyYW0gdmVydGljYWxPZmZzZXQyIFRoZSBlbmQgb2YgdGhlIHZpZXdwb3J0LlxuXHQgKiBAcmV0dXJuIEFuIGFycmF5IHdpdGggYWxsIHRoZSB3aGl0ZXNwYWNlcyBpbiB0aGUgdmlld3BvcnQuIElmIG5vIHdoaXRlc3BhY2UgaXMgaW4gdmlld3BvcnQsIHRoZSBhcnJheSBpcyBlbXB0eS5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlVmlld3BvcnREYXRhKHZlcnRpY2FsT2Zmc2V0MTogbnVtYmVyLCB2ZXJ0aWNhbE9mZnNldDI6IG51bWJlcik6IElWaWV3V2hpdGVzcGFjZVZpZXdwb3J0RGF0YVtdIHtcblx0XHR2ZXJ0aWNhbE9mZnNldDEgPSB2ZXJ0aWNhbE9mZnNldDEgfCAwO1xuXHRcdHZlcnRpY2FsT2Zmc2V0MiA9IHZlcnRpY2FsT2Zmc2V0MiB8IDA7XG5cblx0XHRjb25zdCBzdGFydEluZGV4ID0gdGhpcy5nZXRXaGl0ZXNwYWNlSW5kZXhBdE9yQWZ0ZXJWZXJ0aWNhbGxPZmZzZXQodmVydGljYWxPZmZzZXQxKTtcblx0XHRjb25zdCBlbmRJbmRleCA9IHRoaXMuZ2V0V2hpdGVzcGFjZXNDb3VudCgpIC0gMTtcblxuXHRcdGlmIChzdGFydEluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVZpZXdXaGl0ZXNwYWNlVmlld3BvcnREYXRhW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnRJbmRleDsgaSA8PSBlbmRJbmRleDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b3AgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yV2hpdGVzcGFjZUluZGV4KGkpO1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHRGb3JXaGl0ZXNwYWNlSW5kZXgoaSk7XG5cdFx0XHRpZiAodG9wID49IHZlcnRpY2FsT2Zmc2V0Mikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5nZXRJZEZvcldoaXRlc3BhY2VJbmRleChpKSxcblx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiB0aGlzLmdldEFmdGVyTGluZU51bWJlckZvcldoaXRlc3BhY2VJbmRleChpKSxcblx0XHRcdFx0dmVydGljYWxPZmZzZXQ6IHRvcCxcblx0XHRcdFx0aGVpZ2h0OiBoZWlnaHRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGFsbCB3aGl0ZXNwYWNlcy5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlcygpOiBJRWRpdG9yV2hpdGVzcGFjZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJyLnNsaWNlKDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2Ygd2hpdGVzcGFjZXMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0V2hpdGVzcGFjZXNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9hcnIubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgYGlkYCBmb3Igd2hpdGVzcGFjZSBhdCBpbmRleCBgaW5kZXhgLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIGluZGV4IG9mIHRoZSB3aGl0ZXNwYWNlLlxuXHQgKiBAcmV0dXJuIGBpZGAgb2Ygd2hpdGVzcGFjZSBhdCBgaW5kZXhgLlxuXHQgKi9cblx0cHVibGljIGdldElkRm9yV2hpdGVzcGFjZUluZGV4KGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGluZGV4ID0gaW5kZXggfCAwO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2FycltpbmRleF0uaWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBgYWZ0ZXJMaW5lTnVtYmVyYCBmb3Igd2hpdGVzcGFjZSBhdCBpbmRleCBgaW5kZXhgLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIGluZGV4IG9mIHRoZSB3aGl0ZXNwYWNlLlxuXHQgKiBAcmV0dXJuIGBhZnRlckxpbmVOdW1iZXJgIG9mIHdoaXRlc3BhY2UgYXQgYGluZGV4YC5cblx0ICovXG5cdHB1YmxpYyBnZXRBZnRlckxpbmVOdW1iZXJGb3JXaGl0ZXNwYWNlSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aW5kZXggPSBpbmRleCB8IDA7XG5cblx0XHRyZXR1cm4gdGhpcy5fYXJyW2luZGV4XS5hZnRlckxpbmVOdW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBgaGVpZ2h0YCBmb3Igd2hpdGVzcGFjZSBhdCBpbmRleCBgaW5kZXhgLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIGluZGV4IG9mIHRoZSB3aGl0ZXNwYWNlLlxuXHQgKiBAcmV0dXJuIGBoZWlnaHRgIG9mIHdoaXRlc3BhY2UgYXQgYGluZGV4YC5cblx0ICovXG5cdHB1YmxpYyBnZXRIZWlnaHRGb3JXaGl0ZXNwYWNlSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aW5kZXggPSBpbmRleCB8IDA7XG5cblx0XHRyZXR1cm4gdGhpcy5fYXJyW2luZGV4XS5oZWlnaHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFlBQVksYUFBYTtBQUN6QixTQUErQiwwQkFBMEI7QUFLekQsTUFBTSxlQUFlO0FBQUEsRUFNcEIsY0FBYztBQUNiLFNBQUssY0FBYztBQUNuQixTQUFLLFdBQVcsQ0FBQztBQUNqQixTQUFLLFdBQVcsQ0FBQztBQUNqQixTQUFLLFdBQVcsQ0FBQztBQUFBLEVBQ2xCO0FBQUEsRUFFTyxPQUFPLEdBQTJCO0FBQ3hDLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVMsS0FBSyxDQUFDO0FBQUEsRUFDckI7QUFBQSxFQUVPLE9BQU8sR0FBeUI7QUFDdEMsU0FBSyxjQUFjO0FBQ25CLFNBQUssU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNyQjtBQUFBLEVBRU8sT0FBTyxHQUF5QjtBQUN0QyxTQUFLLGNBQWM7QUFDbkIsU0FBSyxTQUFTLEtBQUssQ0FBQztBQUFBLEVBQ3JCO0FBQUEsRUFFTyxPQUFPLGFBQWdDO0FBQzdDLFFBQUksQ0FB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QVE7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTTywwQkFBMEIsaUJBQXlCLGlCQUF3RDtBQUNqSCxzQkFBa0Isa0JBQWtCO0FBQ3BDLHNCQUFrQixrQkFBa0I7QUFFcEMsVUFBTSxhQUFhLEtBQUssMkNBQTJDLGVBQWU7QUFDbEYsVUFBTSxXQUFXLEtBQUssb0JBQW9CLElBQUk7QUFFOUMsUUFBSSxhQUFhLEdBQUc7QUFDbkIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sU0FBd0MsQ0FBQztBQUMvQyxhQUFTLElBQUksWUFBWSxLQUFLLFVBQVUsS0FBSztBQUM1QyxZQUFNLE1BQU0sS0FBSyxvQ0FBb0MsQ0FBQztBQUN0RCxZQUFNLFNBQVMsS0FBSyw0QkFBNEIsQ0FBQztBQUNqRCxVQUFJLE9BQU8saUJBQWlCO0FBQzNCO0FBQUEsTUFDRDtBQUVBLGFBQU8sS0FBSztBQUFBLFFBQ1gsSUFBSSxLQUFLLHdCQUF3QixDQUFDO0FBQUEsUUFDbEMsaUJBQWlCLEtBQUsscUNBQXFDLENBQUM7QUFBQSxRQUM1RCxnQkFBZ0I7QUFBQSxRQUNoQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08saUJBQXNDO0FBQzVDLFdBQU8sS0FBSyxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQ3pCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxzQkFBOEI7QUFDcEMsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUU8sd0JBQXdCLE9BQXVCO0FBQ3JELFlBQVEsUUFBUTtBQUVoQixXQUFPLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUU8scUNBQXFDLE9BQXVCO0FBQ2xFLFlBQVEsUUFBUTtBQUVoQixXQUFPLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUU8sNEJBQTRCLE9BQXVCO0FBQ3pELFlBQVEsUUFBUTtBQUVoQixXQUFPLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxFQUN6QjtBQUNEO0FBN3pCYSxhQUVHLGlCQUFpQjtBQUYxQixJQUFNLGNBQU47IiwKICAibmFtZXMiOiBbInJlc3VsdCJdCn0K
