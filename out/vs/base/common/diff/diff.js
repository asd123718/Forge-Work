import { DiffChange } from "./diffChange.js";
import { stringHash } from "../hash.js";
import { Constants } from "../uint.js";
class StringDiffSequence {
  constructor(source) {
    this.source = source;
  }
  getElements() {
    const source = this.source;
    const characters = new Int32Array(source.length);
    for (let i = 0, len = source.length; i < len; i++) {
      characters[i] = source.charCodeAt(i);
    }
    return characters;
  }
}
function stringDiff(original, modified, pretty) {
  return new LcsDiff(new StringDiffSequence(original), new StringDiffSequence(modified)).ComputeDiff(pretty).changes;
}
class Debug {
  static Assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }
}
class MyArray {
  /**
   * Copies a range of elements from an Array starting at the specified source index and pastes
   * them to another Array starting at the specified destination index. The length and the indexes
   * are specified as 64-bit integers.
   * sourceArray:
   *		The Array that contains the data to copy.
   * sourceIndex:
   *		A 64-bit integer that represents the index in the sourceArray at which copying begins.
   * destinationArray:
   *		The Array that receives the data.
   * destinationIndex:
   *		A 64-bit integer that represents the index in the destinationArray at which storing begins.
   * length:
   *		A 64-bit integer that represents the number of elements to copy.
   */
  static Copy(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
    for (let i = 0; i < length; i++) {
      destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
    }
  }
  static Copy2(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
    for (let i = 0; i < length; i++) {
      destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
    }
  }
}
var LocalConstants = /* @__PURE__ */ ((LocalConstants2) => {
  LocalConstants2[LocalConstants2["MaxDifferencesHistory"] = 1447] = "MaxDifferencesHistory";
  return LocalConstants2;
})(LocalConstants || {});
class DiffChangeHelper {
  /**
   * Constructs a new DiffChangeHelper for the given DiffSequences.
   */
  constructor() {
    this.m_changes = [];
    this.m_originalStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_modifiedStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_originalCount = 0;
    this.m_modifiedCount = 0;
  }
  /**
   * Marks the beginning of the next change in the set of differences.
   */
  MarkNextChange() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.m_changes.push(new DiffChange(
        this.m_originalStart,
        this.m_originalCount,
        this.m_modifiedStart,
        this.m_modifiedCount
      ));
    }
    this.m_originalCount = 0;
    this.m_modifiedCount = 0;
    this.m_originalStart = Constants.MAX_SAFE_SMALL_INTEGER;
    this.m_modifiedStart = Constants.MAX_SAFE_SMALL_INTEGER;
  }
  /**
   * Adds the original element at the given position to the elements
   * affected by the current change. The modified index gives context
   * to the change position with respect to the original sequence.
   * @param originalIndex The index of the original element to add.
   * @param modifiedIndex The index of the modified element that provides corresponding position in the modified sequence.
   */
  AddOriginalElement(originalIndex, modifiedIndex) {
    this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
    this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);
    this.m_originalCount++;
  }
  /**
   * Adds the modified element at the given position to the elements
   * affected by the current change. The original index gives context
   * to the change position with respect to the modified sequence.
   * @param originalIndex The index of the original element that provides corresponding position in the original sequence.
   * @param modifiedIndex The index of the modified element to add.
   */
  AddModifiedElement(originalIndex, modifiedIndex) {
    this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
    this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);
    this.m_modifiedCount++;
  }
  /**
   * Retrieves all of the changes marked by the class.
   */
  getChanges() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.MarkNextChange();
    }
    return this.m_changes;
  }
  /**
   * Retrieves all of the changes marked by the class in the reverse order
   */
  getReverseChanges() {
    if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
      this.MarkNextChange();
    }
    this.m_changes.reverse();
    return this.m_changes;
  }
}
class LcsDiff {
  /**
   * Constructs the DiffFinder
   */
  constructor(originalSequence, modifiedSequence, continueProcessingPredicate = null) {
    this.ContinueProcessingPredicate = continueProcessingPredicate;
    this._originalSequence = originalSequence;
    this._modifiedSequence = modifiedSequence;
    const [originalStringElements, originalElementsOrHash, originalHasStrings] = LcsDiff._getElements(originalSequence);
    const [modifiedStringElements, modifiedElementsOrHash, modifiedHasStrings] = LcsDiff._getElements(modifiedSequence);
    this._hasStrings = originalHasStrings && modifiedHasStrings;
    this._originalStringElements = originalStringElements;
    this._originalElementsOrHash = originalElementsOrHash;
    this._modifiedStringElements = modifiedStringElements;
    this._modifiedElementsOrHash = modifiedElementsOrHash;
    this.m_forwardHistory = [];
    this.m_reverseHistory = [];
  }
  static _isStringArray(arr) {
    return arr.length > 0 && typeof arr[0] === "string";
  }
  static _getElements(sequence) {
    const elements = sequence.getElements();
    if (LcsDiff._isStringArray(elements)) {
      const hashes = new Int32Array(elements.length);
      for (let i = 0, len = elements.length; i < len; i++) {
        hashes[i] = stringHash(elements[i], 0);
      }
      return [elements, hashes, true];
    }
    if (elements instanceof Int32Array) {
      return [[], elements, false];
    }
    return [[], new Int32Array(elements), false];
  }
  ElementsAreEqual(originalIndex, newIndex) {
    if (this._originalElementsOrHash[originalIndex] !== this._modifiedElementsOrHash[newIndex]) {
      return false;
    }
    return this._hasStrings ? this._originalStringElements[originalIndex] === this._modifiedStringElements[newIndex] : true;
  }
  ElementsAreStrictEqual(originalIndex, newIndex) {
    if (!this.ElementsAreEqual(originalIndex, newIndex)) {
      return false;
    }
    const originalElement = LcsDiff._getStrictElement(this._originalSequence, originalIndex);
    const modifiedElement = LcsDiff._getStrictElement(this._modifiedSequence, newIndex);
    return originalElement === modifiedElement;
  }
  static _getStrictElement(sequence, index) {
    if (typeof sequence.getStrictElement === "function") {
      return sequence.getStrictElement(index);
    }
    return null;
  }
  OriginalElementsAreEqual(index1, index2) {
    if (this._originalElementsOrHash[index1] !== this._originalElementsOrHash[index2]) {
      return false;
    }
    return this._hasStrings ? this._originalStringElements[index1] === this._originalStringElements[index2] : true;
  }
  ModifiedElementsAreEqual(index1, index2) {
    if (this._modifiedElementsOrHash[index1] !== this._modifiedElementsOrHash[index2]) {
      return false;
    }
    return this._hasStrings ? this._modifiedStringElements[index1] === this._modifiedStringElements[index2] : true;
  }
  ComputeDiff(pretty) {
    return this._ComputeDiff(0, this._originalElementsOrHash.length - 1, 0, this._modifiedElementsOrHash.length - 1, pretty);
  }
  /**
   * Computes the differences between the original and modified input
   * sequences on the bounded range.
   * @returns An array of the differences between the two input sequences.
   */
  _ComputeDiff(originalStart, originalEnd, modifiedStart, modifiedEnd, pretty) {
    const quitEarlyArr = [false];
    let changes = this.ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr);
    if (pretty) {
      changes = this.PrettifyChanges(changes);
    }
    return {
      quitEarly: quitEarlyArr[0],
      changes
    };
  }
  /**
   * Private helper method which computes the differences on the bounded range
   * recursively.
   * @returns An array of the differences between the two input sequences.
   */
  ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr) {
    quitEarlyArr[0] = false;
    while (originalStart <= originalEnd && modifiedStart <= modifiedEnd && this.ElementsAreEqual(originalStart, modifiedStart)) {
      originalStart++;
      modifiedStart++;
    }
    while (originalEnd >= originalStart && modifiedEnd >= modifiedStart && this.ElementsAreEqual(originalEnd, modifiedEnd)) {
      originalEnd--;
      modifiedEnd--;
    }
    if (originalStart > originalEnd || modifiedStart > modifiedEnd) {
      let changes;
      if (modifiedStart <= modifiedEnd) {
        Debug.Assert(originalStart === originalEnd + 1, "originalStart should only be one more than originalEnd");
        changes = [
          new DiffChange(originalStart, 0, modifiedStart, modifiedEnd - modifiedStart + 1)
        ];
      } else if (originalStart <= originalEnd) {
        Debug.Assert(modifiedStart === modifiedEnd + 1, "modifiedStart should only be one more than modifiedEnd");
        changes = [
          new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, 0)
        ];
      } else {
        Debug.Assert(originalStart === originalEnd + 1, "originalStart should only be one more than originalEnd");
        Debug.Assert(modifiedStart === modifiedEnd + 1, "modifiedStart should only be one more than modifiedEnd");
        changes = [];
      }
      return changes;
    }
    const midOriginalArr = [0];
    const midModifiedArr = [0];
    const result = this.ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr);
    const midOriginal = midOriginalArr[0];
    const midModified = midModifiedArr[0];
    if (result !== null) {
      return result;
    } else if (!quitEarlyArr[0]) {
      const leftChanges = this.ComputeDiffRecursive(originalStart, midOriginal, modifiedStart, midModified, quitEarlyArr);
      let rightChanges = [];
      if (!quitEarlyArr[0]) {
        rightChanges = this.ComputeDiffRecursive(midOriginal + 1, originalEnd, midModified + 1, modifiedEnd, quitEarlyArr);
      } else {
        rightChanges = [
          new DiffChange(midOriginal + 1, originalEnd - (midOriginal + 1) + 1, midModified + 1, modifiedEnd - (midModified + 1) + 1)
        ];
      }
      return this.ConcatenateChanges(leftChanges, rightChanges);
    }
    return [
      new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, modifiedEnd - modifiedStart + 1)
    ];
  }
  WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr) {
    let forwardChanges = null;
    let reverseChanges = null;
    let changeHelper = new DiffChangeHelper();
    let diagonalMin = diagonalForwardStart;
    let diagonalMax = diagonalForwardEnd;
    let diagonalRelative = midOriginalArr[0] - midModifiedArr[0] - diagonalForwardOffset;
    let lastOriginalIndex = Constants.MIN_SAFE_SMALL_INTEGER;
    let historyIndex = this.m_forwardHistory.length - 1;
    do {
      const diagonal = diagonalRelative + diagonalForwardBase;
      if (diagonal === diagonalMin || diagonal < diagonalMax && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1]) {
        originalIndex = forwardPoints[diagonal + 1];
        modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
        if (originalIndex < lastOriginalIndex) {
          changeHelper.MarkNextChange();
        }
        lastOriginalIndex = originalIndex;
        changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex);
        diagonalRelative = diagonal + 1 - diagonalForwardBase;
      } else {
        originalIndex = forwardPoints[diagonal - 1] + 1;
        modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
        if (originalIndex < lastOriginalIndex) {
          changeHelper.MarkNextChange();
        }
        lastOriginalIndex = originalIndex - 1;
        changeHelper.AddOriginalElement(originalIndex, modifiedIndex + 1);
        diagonalRelative = diagonal - 1 - diagonalForwardBase;
      }
      if (historyIndex >= 0) {
        forwardPoints = this.m_forwardHistory[historyIndex];
        diagonalForwardBase = forwardPoints[0];
        diagonalMin = 1;
        diagonalMax = forwardPoints.length - 1;
      }
    } while (--historyIndex >= -1);
    forwardChanges = changeHelper.getReverseChanges();
    if (quitEarlyArr[0]) {
      let originalStartPoint = midOriginalArr[0] + 1;
      let modifiedStartPoint = midModifiedArr[0] + 1;
      if (forwardChanges !== null && forwardChanges.length > 0) {
        const lastForwardChange = forwardChanges[forwardChanges.length - 1];
        originalStartPoint = Math.max(originalStartPoint, lastForwardChange.getOriginalEnd());
        modifiedStartPoint = Math.max(modifiedStartPoint, lastForwardChange.getModifiedEnd());
      }
      reverseChanges = [
        new DiffChange(
          originalStartPoint,
          originalEnd - originalStartPoint + 1,
          modifiedStartPoint,
          modifiedEnd - modifiedStartPoint + 1
        )
      ];
    } else {
      changeHelper = new DiffChangeHelper();
      diagonalMin = diagonalReverseStart;
      diagonalMax = diagonalReverseEnd;
      diagonalRelative = midOriginalArr[0] - midModifiedArr[0] - diagonalReverseOffset;
      lastOriginalIndex = Constants.MAX_SAFE_SMALL_INTEGER;
      historyIndex = deltaIsEven ? this.m_reverseHistory.length - 1 : this.m_reverseHistory.length - 2;
      do {
        const diagonal = diagonalRelative + diagonalReverseBase;
        if (diagonal === diagonalMin || diagonal < diagonalMax && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1]) {
          originalIndex = reversePoints[diagonal + 1] - 1;
          modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
          if (originalIndex > lastOriginalIndex) {
            changeHelper.MarkNextChange();
          }
          lastOriginalIndex = originalIndex + 1;
          changeHelper.AddOriginalElement(originalIndex + 1, modifiedIndex + 1);
          diagonalRelative = diagonal + 1 - diagonalReverseBase;
        } else {
          originalIndex = reversePoints[diagonal - 1];
          modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
          if (originalIndex > lastOriginalIndex) {
            changeHelper.MarkNextChange();
          }
          lastOriginalIndex = originalIndex;
          changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex + 1);
          diagonalRelative = diagonal - 1 - diagonalReverseBase;
        }
        if (historyIndex >= 0) {
          reversePoints = this.m_reverseHistory[historyIndex];
          diagonalReverseBase = reversePoints[0];
          diagonalMin = 1;
          diagonalMax = reversePoints.length - 1;
        }
      } while (--historyIndex >= -1);
      reverseChanges = changeHelper.getChanges();
    }
    return this.ConcatenateChanges(forwardChanges, reverseChanges);
  }
  /**
   * Given the range to compute the diff on, this method finds the point:
   * (midOriginal, midModified)
   * that exists in the middle of the LCS of the two sequences and
   * is the point at which the LCS problem may be broken down recursively.
   * This method will try to keep the LCS trace in memory. If the LCS recursion
   * point is calculated and the full trace is available in memory, then this method
   * will return the change list.
   * @param originalStart The start bound of the original sequence range
   * @param originalEnd The end bound of the original sequence range
   * @param modifiedStart The start bound of the modified sequence range
   * @param modifiedEnd The end bound of the modified sequence range
   * @param midOriginal The middle point of the original sequence range
   * @param midModified The middle point of the modified sequence range
   * @returns The diff changes, if available, otherwise null
   */
  ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr) {
    let originalIndex = 0, modifiedIndex = 0;
    let diagonalForwardStart = 0, diagonalForwardEnd = 0;
    let diagonalReverseStart = 0, diagonalReverseEnd = 0;
    originalStart--;
    modifiedStart--;
    midOriginalArr[0] = 0;
    midModifiedArr[0] = 0;
    this.m_forwardHistory = [];
    this.m_reverseHistory = [];
    const maxDifferences = originalEnd - originalStart + (modifiedEnd - modifiedStart);
    const numDiagonals = maxDifferences + 1;
    const forwardPoints = new Int32Array(numDiagonals);
    const reversePoints = new Int32Array(numDiagonals);
    const diagonalForwardBase = modifiedEnd - modifiedStart;
    const diagonalReverseBase = originalEnd - originalStart;
    const diagonalForwardOffset = originalStart - modifiedStart;
    const diagonalReverseOffset = originalEnd - modifiedEnd;
    const delta = diagonalReverseBase - diagonalForwardBase;
    const deltaIsEven = delta % 2 === 0;
    forwardPoints[diagonalForwardBase] = originalStart;
    reversePoints[diagonalReverseBase] = originalEnd;
    quitEarlyArr[0] = false;
    for (let numDifferences = 1; numDifferences <= maxDifferences / 2 + 1; numDifferences++) {
      let furthestOriginalIndex = 0;
      let furthestModifiedIndex = 0;
      diagonalForwardStart = this.ClipDiagonalBound(diagonalForwardBase - numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
      diagonalForwardEnd = this.ClipDiagonalBound(diagonalForwardBase + numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
      for (let diagonal = diagonalForwardStart; diagonal <= diagonalForwardEnd; diagonal += 2) {
        if (diagonal === diagonalForwardStart || diagonal < diagonalForwardEnd && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1]) {
          originalIndex = forwardPoints[diagonal + 1];
        } else {
          originalIndex = forwardPoints[diagonal - 1] + 1;
        }
        modifiedIndex = originalIndex - (diagonal - diagonalForwardBase) - diagonalForwardOffset;
        const tempOriginalIndex = originalIndex;
        while (originalIndex < originalEnd && modifiedIndex < modifiedEnd && this.ElementsAreEqual(originalIndex + 1, modifiedIndex + 1)) {
          originalIndex++;
          modifiedIndex++;
        }
        forwardPoints[diagonal] = originalIndex;
        if (originalIndex + modifiedIndex > furthestOriginalIndex + furthestModifiedIndex) {
          furthestOriginalIndex = originalIndex;
          furthestModifiedIndex = modifiedIndex;
        }
        if (!deltaIsEven && Math.abs(diagonal - diagonalReverseBase) <= numDifferences - 1) {
          if (originalIndex >= reversePoints[diagonal]) {
            midOriginalArr[0] = originalIndex;
            midModifiedArr[0] = modifiedIndex;
            if (tempOriginalIndex <= reversePoints[diagonal] && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
              return this.WALKTRACE(
                diagonalForwardBase,
                diagonalForwardStart,
                diagonalForwardEnd,
                diagonalForwardOffset,
                diagonalReverseBase,
                diagonalReverseStart,
                diagonalReverseEnd,
                diagonalReverseOffset,
                forwardPoints,
                reversePoints,
                originalIndex,
                originalEnd,
                midOriginalArr,
                modifiedIndex,
                modifiedEnd,
                midModifiedArr,
                deltaIsEven,
                quitEarlyArr
              );
            } else {
              return null;
            }
          }
        }
      }
      const matchLengthOfLongest = (furthestOriginalIndex - originalStart + (furthestModifiedIndex - modifiedStart) - numDifferences) / 2;
      if (this.ContinueProcessingPredicate !== null && !this.ContinueProcessingPredicate(furthestOriginalIndex, matchLengthOfLongest)) {
        quitEarlyArr[0] = true;
        midOriginalArr[0] = furthestOriginalIndex;
        midModifiedArr[0] = furthestModifiedIndex;
        if (matchLengthOfLongest > 0 && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
          return this.WALKTRACE(
            diagonalForwardBase,
            diagonalForwardStart,
            diagonalForwardEnd,
            diagonalForwardOffset,
            diagonalReverseBase,
            diagonalReverseStart,
            diagonalReverseEnd,
            diagonalReverseOffset,
            forwardPoints,
            reversePoints,
            originalIndex,
            originalEnd,
            midOriginalArr,
            modifiedIndex,
            modifiedEnd,
            midModifiedArr,
            deltaIsEven,
            quitEarlyArr
          );
        } else {
          originalStart++;
          modifiedStart++;
          return [
            new DiffChange(
              originalStart,
              originalEnd - originalStart + 1,
              modifiedStart,
              modifiedEnd - modifiedStart + 1
            )
          ];
        }
      }
      diagonalReverseStart = this.ClipDiagonalBound(diagonalReverseBase - numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
      diagonalReverseEnd = this.ClipDiagonalBound(diagonalReverseBase + numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
      for (let diagonal = diagonalReverseStart; diagonal <= diagonalReverseEnd; diagonal += 2) {
        if (diagonal === diagonalReverseStart || diagonal < diagonalReverseEnd && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1]) {
          originalIndex = reversePoints[diagonal + 1] - 1;
        } else {
          originalIndex = reversePoints[diagonal - 1];
        }
        modifiedIndex = originalIndex - (diagonal - diagonalReverseBase) - diagonalReverseOffset;
        const tempOriginalIndex = originalIndex;
        while (originalIndex > originalStart && modifiedIndex > modifiedStart && this.ElementsAreEqual(originalIndex, modifiedIndex)) {
          originalIndex--;
          modifiedIndex--;
        }
        reversePoints[diagonal] = originalIndex;
        if (deltaIsEven && Math.abs(diagonal - diagonalForwardBase) <= numDifferences) {
          if (originalIndex <= forwardPoints[diagonal]) {
            midOriginalArr[0] = originalIndex;
            midModifiedArr[0] = modifiedIndex;
            if (tempOriginalIndex >= forwardPoints[diagonal] && 1447 /* MaxDifferencesHistory */ > 0 && numDifferences <= 1447 /* MaxDifferencesHistory */ + 1) {
              return this.WALKTRACE(
                diagonalForwardBase,
                diagonalForwardStart,
                diagonalForwardEnd,
                diagonalForwardOffset,
                diagonalReverseBase,
                diagonalReverseStart,
                diagonalReverseEnd,
                diagonalReverseOffset,
                forwardPoints,
                reversePoints,
                originalIndex,
                originalEnd,
                midOriginalArr,
                modifiedIndex,
                modifiedEnd,
                midModifiedArr,
                deltaIsEven,
                quitEarlyArr
              );
            } else {
              return null;
            }
          }
        }
      }
      if (numDifferences <= 1447 /* MaxDifferencesHistory */) {
        let temp = new Int32Array(diagonalForwardEnd - diagonalForwardStart + 2);
        temp[0] = diagonalForwardBase - diagonalForwardStart + 1;
        MyArray.Copy2(forwardPoints, diagonalForwardStart, temp, 1, diagonalForwardEnd - diagonalForwardStart + 1);
        this.m_forwardHistory.push(temp);
        temp = new Int32Array(diagonalReverseEnd - diagonalReverseStart + 2);
        temp[0] = diagonalReverseBase - diagonalReverseStart + 1;
        MyArray.Copy2(reversePoints, diagonalReverseStart, temp, 1, diagonalReverseEnd - diagonalReverseStart + 1);
        this.m_reverseHistory.push(temp);
      }
    }
    return this.WALKTRACE(
      diagonalForwardBase,
      diagonalForwardStart,
      diagonalForwardEnd,
      diagonalForwardOffset,
      diagonalReverseBase,
      diagonalReverseStart,
      diagonalReverseEnd,
      diagonalReverseOffset,
      forwardPoints,
      reversePoints,
      originalIndex,
      originalEnd,
      midOriginalArr,
      modifiedIndex,
      modifiedEnd,
      midModifiedArr,
      deltaIsEven,
      quitEarlyArr
    );
  }
  /**
   * Shifts the given changes to provide a more intuitive diff.
   * While the first element in a diff matches the first element after the diff,
   * we shift the diff down.
   *
   * @param changes The list of changes to shift
   * @returns The shifted changes
   */
  PrettifyChanges(changes) {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const originalStop = i < changes.length - 1 ? changes[i + 1].originalStart : this._originalElementsOrHash.length;
      const modifiedStop = i < changes.length - 1 ? changes[i + 1].modifiedStart : this._modifiedElementsOrHash.length;
      const checkOriginal = change.originalLength > 0;
      const checkModified = change.modifiedLength > 0;
      while (change.originalStart + change.originalLength < originalStop && change.modifiedStart + change.modifiedLength < modifiedStop && (!checkOriginal || this.OriginalElementsAreEqual(change.originalStart, change.originalStart + change.originalLength)) && (!checkModified || this.ModifiedElementsAreEqual(change.modifiedStart, change.modifiedStart + change.modifiedLength))) {
        const startStrictEqual = this.ElementsAreStrictEqual(change.originalStart, change.modifiedStart);
        const endStrictEqual = this.ElementsAreStrictEqual(change.originalStart + change.originalLength, change.modifiedStart + change.modifiedLength);
        if (endStrictEqual && !startStrictEqual) {
          break;
        }
        change.originalStart++;
        change.modifiedStart++;
      }
      const mergedChangeArr = [null];
      if (i < changes.length - 1 && this.ChangesOverlap(changes[i], changes[i + 1], mergedChangeArr)) {
        changes[i] = mergedChangeArr[0];
        changes.splice(i + 1, 1);
        i--;
        continue;
      }
    }
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i];
      let originalStop = 0;
      let modifiedStop = 0;
      if (i > 0) {
        const prevChange = changes[i - 1];
        originalStop = prevChange.originalStart + prevChange.originalLength;
        modifiedStop = prevChange.modifiedStart + prevChange.modifiedLength;
      }
      const checkOriginal = change.originalLength > 0;
      const checkModified = change.modifiedLength > 0;
      let bestDelta = 0;
      let bestScore = this._boundaryScore(change.originalStart, change.originalLength, change.modifiedStart, change.modifiedLength);
      for (let delta = 1; ; delta++) {
        const originalStart = change.originalStart - delta;
        const modifiedStart = change.modifiedStart - delta;
        if (originalStart < originalStop || modifiedStart < modifiedStop) {
          break;
        }
        if (checkOriginal && !this.OriginalElementsAreEqual(originalStart, originalStart + change.originalLength)) {
          break;
        }
        if (checkModified && !this.ModifiedElementsAreEqual(modifiedStart, modifiedStart + change.modifiedLength)) {
          break;
        }
        const touchingPreviousChange = originalStart === originalStop && modifiedStart === modifiedStop;
        const score = (touchingPreviousChange ? 5 : 0) + this._boundaryScore(originalStart, change.originalLength, modifiedStart, change.modifiedLength);
        if (score > bestScore) {
          bestScore = score;
          bestDelta = delta;
        }
      }
      change.originalStart -= bestDelta;
      change.modifiedStart -= bestDelta;
      const mergedChangeArr = [null];
      if (i > 0 && this.ChangesOverlap(changes[i - 1], changes[i], mergedChangeArr)) {
        changes[i - 1] = mergedChangeArr[0];
        changes.splice(i, 1);
        i++;
        continue;
      }
    }
    if (this._hasStrings) {
      for (let i = 1, len = changes.length; i < len; i++) {
        const aChange = changes[i - 1];
        const bChange = changes[i];
        const matchedLength = bChange.originalStart - aChange.originalStart - aChange.originalLength;
        const aOriginalStart = aChange.originalStart;
        const bOriginalEnd = bChange.originalStart + bChange.originalLength;
        const abOriginalLength = bOriginalEnd - aOriginalStart;
        const aModifiedStart = aChange.modifiedStart;
        const bModifiedEnd = bChange.modifiedStart + bChange.modifiedLength;
        const abModifiedLength = bModifiedEnd - aModifiedStart;
        if (matchedLength < 5 && abOriginalLength < 20 && abModifiedLength < 20) {
          const t = this._findBetterContiguousSequence(
            aOriginalStart,
            abOriginalLength,
            aModifiedStart,
            abModifiedLength,
            matchedLength
          );
          if (t) {
            const [originalMatchStart, modifiedMatchStart] = t;
            if (originalMatchStart !== aChange.originalStart + aChange.originalLength || modifiedMatchStart !== aChange.modifiedStart + aChange.modifiedLength) {
              aChange.originalLength = originalMatchStart - aChange.originalStart;
              aChange.modifiedLength = modifiedMatchStart - aChange.modifiedStart;
              bChange.originalStart = originalMatchStart + matchedLength;
              bChange.modifiedStart = modifiedMatchStart + matchedLength;
              bChange.originalLength = bOriginalEnd - bChange.originalStart;
              bChange.modifiedLength = bModifiedEnd - bChange.modifiedStart;
            }
          }
        }
      }
    }
    return changes;
  }
  _findBetterContiguousSequence(originalStart, originalLength, modifiedStart, modifiedLength, desiredLength) {
    if (originalLength < desiredLength || modifiedLength < desiredLength) {
      return null;
    }
    const originalMax = originalStart + originalLength - desiredLength + 1;
    const modifiedMax = modifiedStart + modifiedLength - desiredLength + 1;
    let bestScore = 0;
    let bestOriginalStart = 0;
    let bestModifiedStart = 0;
    for (let i = originalStart; i < originalMax; i++) {
      for (let j = modifiedStart; j < modifiedMax; j++) {
        const score = this._contiguousSequenceScore(i, j, desiredLength);
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestOriginalStart = i;
          bestModifiedStart = j;
        }
      }
    }
    if (bestScore > 0) {
      return [bestOriginalStart, bestModifiedStart];
    }
    return null;
  }
  _contiguousSequenceScore(originalStart, modifiedStart, length) {
    let score = 0;
    for (let l = 0; l < length; l++) {
      if (!this.ElementsAreEqual(originalStart + l, modifiedStart + l)) {
        return 0;
      }
      score += this._originalStringElements[originalStart + l].length;
    }
    return score;
  }
  _OriginalIsBoundary(index) {
    if (index <= 0 || index >= this._originalElementsOrHash.length - 1) {
      return true;
    }
    return this._hasStrings && /^\s*$/.test(this._originalStringElements[index]);
  }
  _OriginalRegionIsBoundary(originalStart, originalLength) {
    if (this._OriginalIsBoundary(originalStart) || this._OriginalIsBoundary(originalStart - 1)) {
      return true;
    }
    if (originalLength > 0) {
      const originalEnd = originalStart + originalLength;
      if (this._OriginalIsBoundary(originalEnd - 1) || this._OriginalIsBoundary(originalEnd)) {
        return true;
      }
    }
    return false;
  }
  _ModifiedIsBoundary(index) {
    if (index <= 0 || index >= this._modifiedElementsOrHash.length - 1) {
      return true;
    }
    return this._hasStrings && /^\s*$/.test(this._modifiedStringElements[index]);
  }
  _ModifiedRegionIsBoundary(modifiedStart, modifiedLength) {
    if (this._ModifiedIsBoundary(modifiedStart) || this._ModifiedIsBoundary(modifiedStart - 1)) {
      return true;
    }
    if (modifiedLength > 0) {
      const modifiedEnd = modifiedStart + modifiedLength;
      if (this._ModifiedIsBoundary(modifiedEnd - 1) || this._ModifiedIsBoundary(modifiedEnd)) {
        return true;
      }
    }
    return false;
  }
  _boundaryScore(originalStart, originalLength, modifiedStart, modifiedLength) {
    const originalScore = this._OriginalRegionIsBoundary(originalStart, originalLength) ? 1 : 0;
    const modifiedScore = this._ModifiedRegionIsBoundary(modifiedStart, modifiedLength) ? 1 : 0;
    return originalScore + modifiedScore;
  }
  /**
   * Concatenates the two input DiffChange lists and returns the resulting
   * list.
   * @param The left changes
   * @param The right changes
   * @returns The concatenated list
   */
  ConcatenateChanges(left, right) {
    const mergedChangeArr = [];
    if (left.length === 0 || right.length === 0) {
      return right.length > 0 ? right : left;
    } else if (this.ChangesOverlap(left[left.length - 1], right[0], mergedChangeArr)) {
      const result = new Array(left.length + right.length - 1);
      MyArray.Copy(left, 0, result, 0, left.length - 1);
      result[left.length - 1] = mergedChangeArr[0];
      MyArray.Copy(right, 1, result, left.length, right.length - 1);
      return result;
    } else {
      const result = new Array(left.length + right.length);
      MyArray.Copy(left, 0, result, 0, left.length);
      MyArray.Copy(right, 0, result, left.length, right.length);
      return result;
    }
  }
  /**
   * Returns true if the two changes overlap and can be merged into a single
   * change
   * @param left The left change
   * @param right The right change
   * @param mergedChange The merged change if the two overlap, null otherwise
   * @returns True if the two changes overlap
   */
  ChangesOverlap(left, right, mergedChangeArr) {
    Debug.Assert(left.originalStart <= right.originalStart, "Left change is not less than or equal to right change");
    Debug.Assert(left.modifiedStart <= right.modifiedStart, "Left change is not less than or equal to right change");
    if (left.originalStart + left.originalLength >= right.originalStart || left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
      const originalStart = left.originalStart;
      let originalLength = left.originalLength;
      const modifiedStart = left.modifiedStart;
      let modifiedLength = left.modifiedLength;
      if (left.originalStart + left.originalLength >= right.originalStart) {
        originalLength = right.originalStart + right.originalLength - left.originalStart;
      }
      if (left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
        modifiedLength = right.modifiedStart + right.modifiedLength - left.modifiedStart;
      }
      mergedChangeArr[0] = new DiffChange(originalStart, originalLength, modifiedStart, modifiedLength);
      return true;
    } else {
      mergedChangeArr[0] = null;
      return false;
    }
  }
  /**
   * Helper method used to clip a diagonal index to the range of valid
   * diagonals. This also decides whether or not the diagonal index,
   * if it exceeds the boundary, should be clipped to the boundary or clipped
   * one inside the boundary depending on the Even/Odd status of the boundary
   * and numDifferences.
   * @param diagonal The index of the diagonal to clip.
   * @param numDifferences The current number of differences being iterated upon.
   * @param diagonalBaseIndex The base reference diagonal.
   * @param numDiagonals The total number of diagonals.
   * @returns The clipped diagonal index.
   */
  ClipDiagonalBound(diagonal, numDifferences, diagonalBaseIndex, numDiagonals) {
    if (diagonal >= 0 && diagonal < numDiagonals) {
      return diagonal;
    }
    const diagonalsBelow = diagonalBaseIndex;
    const diagonalsAbove = numDiagonals - diagonalBaseIndex - 1;
    const diffEven = numDifferences % 2 === 0;
    if (diagonal < 0) {
      const lowerBoundEven = diagonalsBelow % 2 === 0;
      return diffEven === lowerBoundEven ? 0 : 1;
    } else {
      const upperBoundEven = diagonalsAbove % 2 === 0;
      return diffEven === upperBoundEven ? numDiagonals - 1 : numDiagonals - 2;
    }
  }
}
const precomputedEqualityArray = new Uint32Array(65536);
const computeLevenshteinDistanceForShortStrings = (firstString, secondString) => {
  const firstStringLength = firstString.length;
  const secondStringLength = secondString.length;
  const lastBitMask = 1 << firstStringLength - 1;
  let positiveVector = -1;
  let negativeVector = 0;
  let distance = firstStringLength;
  let index = firstStringLength;
  while (index--) {
    precomputedEqualityArray[firstString.charCodeAt(index)] |= 1 << index;
  }
  for (index = 0; index < secondStringLength; index++) {
    let equalityMask = precomputedEqualityArray[secondString.charCodeAt(index)];
    const combinedVector = equalityMask | negativeVector;
    equalityMask |= (equalityMask & positiveVector) + positiveVector ^ positiveVector;
    negativeVector |= ~(equalityMask | positiveVector);
    positiveVector &= equalityMask;
    if (negativeVector & lastBitMask) {
      distance++;
    }
    if (positiveVector & lastBitMask) {
      distance--;
    }
    negativeVector = negativeVector << 1 | 1;
    positiveVector = positiveVector << 1 | ~(combinedVector | negativeVector);
    negativeVector &= combinedVector;
  }
  index = firstStringLength;
  while (index--) {
    precomputedEqualityArray[firstString.charCodeAt(index)] = 0;
  }
  return distance;
};
function computeLevenshteinDistanceForLongStrings(firstString, secondString) {
  const firstStringLength = firstString.length;
  const secondStringLength = secondString.length;
  const horizontalBitArray = [];
  const verticalBitArray = [];
  const horizontalSize = Math.ceil(firstStringLength / 32);
  const verticalSize = Math.ceil(secondStringLength / 32);
  for (let i = 0; i < horizontalSize; i++) {
    horizontalBitArray[i] = -1;
    verticalBitArray[i] = 0;
  }
  let verticalIndex = 0;
  for (; verticalIndex < verticalSize - 1; verticalIndex++) {
    let negativeVector2 = 0;
    let positiveVector2 = -1;
    const start2 = verticalIndex * 32;
    const verticalLength2 = Math.min(32, secondStringLength) + start2;
    for (let k = start2; k < verticalLength2; k++) {
      precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
    }
    for (let i = 0; i < firstStringLength; i++) {
      const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
      const previousBit = horizontalBitArray[i / 32 | 0] >>> i & 1;
      const matchBit = verticalBitArray[i / 32 | 0] >>> i & 1;
      const combinedVector = equalityMask | negativeVector2;
      const combinedHorizontalVector = ((equalityMask | matchBit) & positiveVector2) + positiveVector2 ^ positiveVector2 | equalityMask | matchBit;
      let positiveHorizontalVector = negativeVector2 | ~(combinedHorizontalVector | positiveVector2);
      let negativeHorizontalVector = positiveVector2 & combinedHorizontalVector;
      if (positiveHorizontalVector >>> 31 ^ previousBit) {
        horizontalBitArray[i / 32 | 0] ^= 1 << i;
      }
      if (negativeHorizontalVector >>> 31 ^ matchBit) {
        verticalBitArray[i / 32 | 0] ^= 1 << i;
      }
      positiveHorizontalVector = positiveHorizontalVector << 1 | previousBit;
      negativeHorizontalVector = negativeHorizontalVector << 1 | matchBit;
      positiveVector2 = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
      negativeVector2 = positiveHorizontalVector & combinedVector;
    }
    for (let k = start2; k < verticalLength2; k++) {
      precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
    }
  }
  let negativeVector = 0;
  let positiveVector = -1;
  const start = verticalIndex * 32;
  const verticalLength = Math.min(32, secondStringLength - start) + start;
  for (let k = start; k < verticalLength; k++) {
    precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
  }
  let distance = secondStringLength;
  for (let i = 0; i < firstStringLength; i++) {
    const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
    const previousBit = horizontalBitArray[i / 32 | 0] >>> i & 1;
    const matchBit = verticalBitArray[i / 32 | 0] >>> i & 1;
    const combinedVector = equalityMask | negativeVector;
    const combinedHorizontalVector = ((equalityMask | matchBit) & positiveVector) + positiveVector ^ positiveVector | equalityMask | matchBit;
    let positiveHorizontalVector = negativeVector | ~(combinedHorizontalVector | positiveVector);
    let negativeHorizontalVector = positiveVector & combinedHorizontalVector;
    distance += positiveHorizontalVector >>> secondStringLength - 1 & 1;
    distance -= negativeHorizontalVector >>> secondStringLength - 1 & 1;
    if (positiveHorizontalVector >>> 31 ^ previousBit) {
      horizontalBitArray[i / 32 | 0] ^= 1 << i;
    }
    if (negativeHorizontalVector >>> 31 ^ matchBit) {
      verticalBitArray[i / 32 | 0] ^= 1 << i;
    }
    positiveHorizontalVector = positiveHorizontalVector << 1 | previousBit;
    negativeHorizontalVector = negativeHorizontalVector << 1 | matchBit;
    positiveVector = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
    negativeVector = positiveHorizontalVector & combinedVector;
  }
  for (let k = start; k < verticalLength; k++) {
    precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
  }
  return distance;
}
function computeLevenshteinDistance(firstString, secondString) {
  if (firstString.length < secondString.length) {
    const temp = secondString;
    secondString = firstString;
    firstString = temp;
  }
  if (secondString.length === 0) {
    return firstString.length;
  }
  if (firstString.length <= 32) {
    return computeLevenshteinDistanceForShortStrings(firstString, secondString);
  }
  return computeLevenshteinDistanceForLongStrings(firstString, secondString);
}
export {
  LcsDiff,
  StringDiffSequence,
  computeLevenshteinDistance,
  stringDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGRpZmZcXGRpZmYudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaWZmQ2hhbmdlIH0gZnJvbSAnLi9kaWZmQ2hhbmdlLmpzJztcbmltcG9ydCB7IHN0cmluZ0hhc2ggfSBmcm9tICcuLi9oYXNoLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uL3VpbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgU3RyaW5nRGlmZlNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNvdXJjZTogc3RyaW5nKSB7IH1cblxuXHRnZXRFbGVtZW50cygpOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXSB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5zb3VyY2U7XG5cdFx0Y29uc3QgY2hhcmFjdGVycyA9IG5ldyBJbnQzMkFycmF5KHNvdXJjZS5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNoYXJhY3RlcnNbaV0gPSBzb3VyY2UuY2hhckNvZGVBdChpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXJhY3RlcnM7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ0RpZmYob3JpZ2luYWw6IHN0cmluZywgbW9kaWZpZWQ6IHN0cmluZywgcHJldHR5OiBib29sZWFuKTogSURpZmZDaGFuZ2VbXSB7XG5cdHJldHVybiBuZXcgTGNzRGlmZihuZXcgU3RyaW5nRGlmZlNlcXVlbmNlKG9yaWdpbmFsKSwgbmV3IFN0cmluZ0RpZmZTZXF1ZW5jZShtb2RpZmllZCkpLkNvbXB1dGVEaWZmKHByZXR0eSkuY2hhbmdlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VxdWVuY2Uge1xuXHRnZXRFbGVtZW50cygpOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXTtcblx0Z2V0U3RyaWN0RWxlbWVudD8oaW5kZXg6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlmZkNoYW5nZSB7XG5cdC8qKlxuXHQgKiBUaGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IGVsZW1lbnQgaW4gdGhlIG9yaWdpbmFsIHNlcXVlbmNlIHdoaWNoXG5cdCAqIHRoaXMgY2hhbmdlIGFmZmVjdHMuXG5cdCAqL1xuXHRvcmlnaW5hbFN0YXJ0OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgZWxlbWVudHMgZnJvbSB0aGUgb3JpZ2luYWwgc2VxdWVuY2Ugd2hpY2ggd2VyZVxuXHQgKiBhZmZlY3RlZC5cblx0ICovXG5cdG9yaWdpbmFsTGVuZ3RoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBwb3NpdGlvbiBvZiB0aGUgZmlyc3QgZWxlbWVudCBpbiB0aGUgbW9kaWZpZWQgc2VxdWVuY2Ugd2hpY2hcblx0ICogdGhpcyBjaGFuZ2UgYWZmZWN0cy5cblx0ICovXG5cdG1vZGlmaWVkU3RhcnQ6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiBlbGVtZW50cyBmcm9tIHRoZSBtb2RpZmllZCBzZXF1ZW5jZSB3aGljaCB3ZXJlXG5cdCAqIGFmZmVjdGVkIChhZGRlZCkuXG5cdCAqL1xuXHRtb2RpZmllZExlbmd0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUge1xuXHQoZnVydGhlc3RPcmlnaW5hbEluZGV4OiBudW1iZXIsIG1hdGNoTGVuZ3RoT2ZMb25nZXN0OiBudW1iZXIpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmUmVzdWx0IHtcblx0cXVpdEVhcmx5OiBib29sZWFuO1xuXHRjaGFuZ2VzOiBJRGlmZkNoYW5nZVtdO1xufVxuXG4vL1xuLy8gVGhlIGNvZGUgYmVsb3cgaGFzIGJlZW4gcG9ydGVkIGZyb20gYSBDIyBpbXBsZW1lbnRhdGlvbiBpbiBWU1xuLy9cblxuY2xhc3MgRGVidWcge1xuXG5cdHB1YmxpYyBzdGF0aWMgQXNzZXJ0KGNvbmRpdGlvbjogYm9vbGVhbiwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFjb25kaXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTXlBcnJheSB7XG5cdC8qKlxuXHQgKiBDb3BpZXMgYSByYW5nZSBvZiBlbGVtZW50cyBmcm9tIGFuIEFycmF5IHN0YXJ0aW5nIGF0IHRoZSBzcGVjaWZpZWQgc291cmNlIGluZGV4IGFuZCBwYXN0ZXNcblx0ICogdGhlbSB0byBhbm90aGVyIEFycmF5IHN0YXJ0aW5nIGF0IHRoZSBzcGVjaWZpZWQgZGVzdGluYXRpb24gaW5kZXguIFRoZSBsZW5ndGggYW5kIHRoZSBpbmRleGVzXG5cdCAqIGFyZSBzcGVjaWZpZWQgYXMgNjQtYml0IGludGVnZXJzLlxuXHQgKiBzb3VyY2VBcnJheTpcblx0ICpcdFx0VGhlIEFycmF5IHRoYXQgY29udGFpbnMgdGhlIGRhdGEgdG8gY29weS5cblx0ICogc291cmNlSW5kZXg6XG5cdCAqXHRcdEEgNjQtYml0IGludGVnZXIgdGhhdCByZXByZXNlbnRzIHRoZSBpbmRleCBpbiB0aGUgc291cmNlQXJyYXkgYXQgd2hpY2ggY29weWluZyBiZWdpbnMuXG5cdCAqIGRlc3RpbmF0aW9uQXJyYXk6XG5cdCAqXHRcdFRoZSBBcnJheSB0aGF0IHJlY2VpdmVzIHRoZSBkYXRhLlxuXHQgKiBkZXN0aW5hdGlvbkluZGV4OlxuXHQgKlx0XHRBIDY0LWJpdCBpbnRlZ2VyIHRoYXQgcmVwcmVzZW50cyB0aGUgaW5kZXggaW4gdGhlIGRlc3RpbmF0aW9uQXJyYXkgYXQgd2hpY2ggc3RvcmluZyBiZWdpbnMuXG5cdCAqIGxlbmd0aDpcblx0ICpcdFx0QSA2NC1iaXQgaW50ZWdlciB0aGF0IHJlcHJlc2VudHMgdGhlIG51bWJlciBvZiBlbGVtZW50cyB0byBjb3B5LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBDb3B5KHNvdXJjZUFycmF5OiB1bmtub3duW10sIHNvdXJjZUluZGV4OiBudW1iZXIsIGRlc3RpbmF0aW9uQXJyYXk6IHVua25vd25bXSwgZGVzdGluYXRpb25JbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdGRlc3RpbmF0aW9uQXJyYXlbZGVzdGluYXRpb25JbmRleCArIGldID0gc291cmNlQXJyYXlbc291cmNlSW5kZXggKyBpXTtcblx0XHR9XG5cdH1cblx0cHVibGljIHN0YXRpYyBDb3B5Mihzb3VyY2VBcnJheTogSW50MzJBcnJheSwgc291cmNlSW5kZXg6IG51bWJlciwgZGVzdGluYXRpb25BcnJheTogSW50MzJBcnJheSwgZGVzdGluYXRpb25JbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdGRlc3RpbmF0aW9uQXJyYXlbZGVzdGluYXRpb25JbmRleCArIGldID0gc291cmNlQXJyYXlbc291cmNlSW5kZXggKyBpXTtcblx0XHR9XG5cdH1cbn1cblxuLy8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuLy8gTGNzRGlmZi5jc1xuLy9cbi8vIEFuIGltcGxlbWVudGF0aW9uIG9mIHRoZSBkaWZmZXJlbmNlIGFsZ29yaXRobSBkZXNjcmliZWQgaW5cbi8vIFwiQW4gTyhORCkgRGlmZmVyZW5jZSBBbGdvcml0aG0gYW5kIGl0cyB2YXJpYXRpb25zXCIgYnkgRXVnZW5lIFcuIE15ZXJzXG4vL1xuLy8gQ29weXJpZ2h0IChDKSAyMDA4IE1pY3Jvc29mdCBDb3Jwb3JhdGlvbiBAbWluaWZpZXJfZG9fbm90X3ByZXNlcnZlXG4vLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5cbi8vIE91ciB0b3RhbCBtZW1vcnkgdXNhZ2UgZm9yIHN0b3JpbmcgaGlzdG9yeSBpcyAod29yc3QtY2FzZSk6XG4vLyAyICogWyhNYXhEaWZmZXJlbmNlc0hpc3RvcnkgKyAxKSAqIChNYXhEaWZmZXJlbmNlc0hpc3RvcnkgKyAxKSAtIDFdICogc2l6ZW9mKGludClcbi8vIDIgKiBbMTQ0OCoxNDQ4IC0gMV0gKiA0ID0gMTY3NzM2MjQgPSAxNk1CXG5jb25zdCBlbnVtIExvY2FsQ29uc3RhbnRzIHtcblx0TWF4RGlmZmVyZW5jZXNIaXN0b3J5ID0gMTQ0N1xufVxuXG4vKipcbiAqIEEgdXRpbGl0eSBjbGFzcyB3aGljaCBoZWxwcyB0byBjcmVhdGUgdGhlIHNldCBvZiBEaWZmQ2hhbmdlcyBmcm9tXG4gKiBhIGRpZmZlcmVuY2Ugb3BlcmF0aW9uLiBUaGlzIGNsYXNzIGFjY2VwdHMgb3JpZ2luYWwgRGlmZkVsZW1lbnRzIGFuZFxuICogbW9kaWZpZWQgRGlmZkVsZW1lbnRzIHRoYXQgYXJlIGludm9sdmVkIGluIGEgcGFydGljdWxhciBjaGFuZ2UuIFRoZVxuICogTWFya05leHRDaGFuZ2UoKSBtZXRob2QgY2FuIGJlIGNhbGxlZCB0byBtYXJrIHRoZSBzZXBhcmF0aW9uIGJldHdlZW5cbiAqIGRpc3RpbmN0IGNoYW5nZXMuIEF0IHRoZSBlbmQsIHRoZSBDaGFuZ2VzIHByb3BlcnR5IGNhbiBiZSBjYWxsZWQgdG8gcmV0cmlldmVcbiAqIHRoZSBjb25zdHJ1Y3RlZCBjaGFuZ2VzLlxuICovXG5jbGFzcyBEaWZmQ2hhbmdlSGVscGVyIHtcblxuXHRwcml2YXRlIG1fY2hhbmdlczogRGlmZkNoYW5nZVtdO1xuXHRwcml2YXRlIG1fb3JpZ2luYWxTdGFydDogbnVtYmVyO1xuXHRwcml2YXRlIG1fbW9kaWZpZWRTdGFydDogbnVtYmVyO1xuXHRwcml2YXRlIG1fb3JpZ2luYWxDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIG1fbW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3RzIGEgbmV3IERpZmZDaGFuZ2VIZWxwZXIgZm9yIHRoZSBnaXZlbiBEaWZmU2VxdWVuY2VzLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5tX2NoYW5nZXMgPSBbXTtcblx0XHR0aGlzLm1fb3JpZ2luYWxTdGFydCA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXHRcdHRoaXMubV9tb2RpZmllZFN0YXJ0ID0gQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVI7XG5cdFx0dGhpcy5tX29yaWdpbmFsQ291bnQgPSAwO1xuXHRcdHRoaXMubV9tb2RpZmllZENvdW50ID0gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrcyB0aGUgYmVnaW5uaW5nIG9mIHRoZSBuZXh0IGNoYW5nZSBpbiB0aGUgc2V0IG9mIGRpZmZlcmVuY2VzLlxuXHQgKi9cblx0cHVibGljIE1hcmtOZXh0Q2hhbmdlKCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgYWRkIHRvIHRoZSBsaXN0IGlmIHRoZXJlIGlzIHNvbWV0aGluZyB0byBhZGRcblx0XHRpZiAodGhpcy5tX29yaWdpbmFsQ291bnQgPiAwIHx8IHRoaXMubV9tb2RpZmllZENvdW50ID4gMCkge1xuXHRcdFx0Ly8gQWRkIHRoZSBuZXcgY2hhbmdlIHRvIG91ciBsaXN0XG5cdFx0XHR0aGlzLm1fY2hhbmdlcy5wdXNoKG5ldyBEaWZmQ2hhbmdlKHRoaXMubV9vcmlnaW5hbFN0YXJ0LCB0aGlzLm1fb3JpZ2luYWxDb3VudCxcblx0XHRcdFx0dGhpcy5tX21vZGlmaWVkU3RhcnQsIHRoaXMubV9tb2RpZmllZENvdW50KSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzZXQgZm9yIHRoZSBuZXh0IGNoYW5nZVxuXHRcdHRoaXMubV9vcmlnaW5hbENvdW50ID0gMDtcblx0XHR0aGlzLm1fbW9kaWZpZWRDb3VudCA9IDA7XG5cdFx0dGhpcy5tX29yaWdpbmFsU3RhcnQgPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHR0aGlzLm1fbW9kaWZpZWRTdGFydCA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgdGhlIG9yaWdpbmFsIGVsZW1lbnQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHRvIHRoZSBlbGVtZW50c1xuXHQgKiBhZmZlY3RlZCBieSB0aGUgY3VycmVudCBjaGFuZ2UuIFRoZSBtb2RpZmllZCBpbmRleCBnaXZlcyBjb250ZXh0XG5cdCAqIHRvIHRoZSBjaGFuZ2UgcG9zaXRpb24gd2l0aCByZXNwZWN0IHRvIHRoZSBvcmlnaW5hbCBzZXF1ZW5jZS5cblx0ICogQHBhcmFtIG9yaWdpbmFsSW5kZXggVGhlIGluZGV4IG9mIHRoZSBvcmlnaW5hbCBlbGVtZW50IHRvIGFkZC5cblx0ICogQHBhcmFtIG1vZGlmaWVkSW5kZXggVGhlIGluZGV4IG9mIHRoZSBtb2RpZmllZCBlbGVtZW50IHRoYXQgcHJvdmlkZXMgY29ycmVzcG9uZGluZyBwb3NpdGlvbiBpbiB0aGUgbW9kaWZpZWQgc2VxdWVuY2UuXG5cdCAqL1xuXHRwdWJsaWMgQWRkT3JpZ2luYWxFbGVtZW50KG9yaWdpbmFsSW5kZXg6IG51bWJlciwgbW9kaWZpZWRJbmRleDogbnVtYmVyKSB7XG5cdFx0Ly8gVGhlICd0cnVlJyBzdGFydCBpbmRleCBpcyB0aGUgc21hbGxlc3Qgb2YgdGhlIG9uZXMgd2UndmUgc2VlblxuXHRcdHRoaXMubV9vcmlnaW5hbFN0YXJ0ID0gTWF0aC5taW4odGhpcy5tX29yaWdpbmFsU3RhcnQsIG9yaWdpbmFsSW5kZXgpO1xuXHRcdHRoaXMubV9tb2RpZmllZFN0YXJ0ID0gTWF0aC5taW4odGhpcy5tX21vZGlmaWVkU3RhcnQsIG1vZGlmaWVkSW5kZXgpO1xuXG5cdFx0dGhpcy5tX29yaWdpbmFsQ291bnQrKztcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIHRoZSBtb2RpZmllZCBlbGVtZW50IGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB0byB0aGUgZWxlbWVudHNcblx0ICogYWZmZWN0ZWQgYnkgdGhlIGN1cnJlbnQgY2hhbmdlLiBUaGUgb3JpZ2luYWwgaW5kZXggZ2l2ZXMgY29udGV4dFxuXHQgKiB0byB0aGUgY2hhbmdlIHBvc2l0aW9uIHdpdGggcmVzcGVjdCB0byB0aGUgbW9kaWZpZWQgc2VxdWVuY2UuXG5cdCAqIEBwYXJhbSBvcmlnaW5hbEluZGV4IFRoZSBpbmRleCBvZiB0aGUgb3JpZ2luYWwgZWxlbWVudCB0aGF0IHByb3ZpZGVzIGNvcnJlc3BvbmRpbmcgcG9zaXRpb24gaW4gdGhlIG9yaWdpbmFsIHNlcXVlbmNlLlxuXHQgKiBAcGFyYW0gbW9kaWZpZWRJbmRleCBUaGUgaW5kZXggb2YgdGhlIG1vZGlmaWVkIGVsZW1lbnQgdG8gYWRkLlxuXHQgKi9cblx0cHVibGljIEFkZE1vZGlmaWVkRWxlbWVudChvcmlnaW5hbEluZGV4OiBudW1iZXIsIG1vZGlmaWVkSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIFRoZSAndHJ1ZScgc3RhcnQgaW5kZXggaXMgdGhlIHNtYWxsZXN0IG9mIHRoZSBvbmVzIHdlJ3ZlIHNlZW5cblx0XHR0aGlzLm1fb3JpZ2luYWxTdGFydCA9IE1hdGgubWluKHRoaXMubV9vcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbEluZGV4KTtcblx0XHR0aGlzLm1fbW9kaWZpZWRTdGFydCA9IE1hdGgubWluKHRoaXMubV9tb2RpZmllZFN0YXJ0LCBtb2RpZmllZEluZGV4KTtcblxuXHRcdHRoaXMubV9tb2RpZmllZENvdW50Kys7XG5cdH1cblxuXHQvKipcblx0ICogUmV0cmlldmVzIGFsbCBvZiB0aGUgY2hhbmdlcyBtYXJrZWQgYnkgdGhlIGNsYXNzLlxuXHQgKi9cblx0cHVibGljIGdldENoYW5nZXMoKTogRGlmZkNoYW5nZVtdIHtcblx0XHRpZiAodGhpcy5tX29yaWdpbmFsQ291bnQgPiAwIHx8IHRoaXMubV9tb2RpZmllZENvdW50ID4gMCkge1xuXHRcdFx0Ly8gRmluaXNoIHVwIG9uIHdoYXRldmVyIGlzIGxlZnRcblx0XHRcdHRoaXMuTWFya05leHRDaGFuZ2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tX2NoYW5nZXM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0cmlldmVzIGFsbCBvZiB0aGUgY2hhbmdlcyBtYXJrZWQgYnkgdGhlIGNsYXNzIGluIHRoZSByZXZlcnNlIG9yZGVyXG5cdCAqL1xuXHRwdWJsaWMgZ2V0UmV2ZXJzZUNoYW5nZXMoKTogRGlmZkNoYW5nZVtdIHtcblx0XHRpZiAodGhpcy5tX29yaWdpbmFsQ291bnQgPiAwIHx8IHRoaXMubV9tb2RpZmllZENvdW50ID4gMCkge1xuXHRcdFx0Ly8gRmluaXNoIHVwIG9uIHdoYXRldmVyIGlzIGxlZnRcblx0XHRcdHRoaXMuTWFya05leHRDaGFuZ2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLm1fY2hhbmdlcy5yZXZlcnNlKCk7XG5cdFx0cmV0dXJuIHRoaXMubV9jaGFuZ2VzO1xuXHR9XG5cbn1cblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgZGlmZmVyZW5jZSBhbGdvcml0aG0gZGVzY3JpYmVkIGluXG4gKiBcIkFuIE8oTkQpIERpZmZlcmVuY2UgQWxnb3JpdGhtIGFuZCBpdHMgdmFyaWF0aW9uc1wiIGJ5IEV1Z2VuZSBXLiBNeWVyc1xuICovXG5leHBvcnQgY2xhc3MgTGNzRGlmZiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBDb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGU6IElDb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUgfCBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsU2VxdWVuY2U6IElTZXF1ZW5jZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRTZXF1ZW5jZTogSVNlcXVlbmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNTdHJpbmdzOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxFbGVtZW50c09ySGFzaDogSW50MzJBcnJheTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRTdHJpbmdFbGVtZW50czogc3RyaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkRWxlbWVudHNPckhhc2g6IEludDMyQXJyYXk7XG5cblx0cHJpdmF0ZSBtX2ZvcndhcmRIaXN0b3J5OiBJbnQzMkFycmF5W107XG5cdHByaXZhdGUgbV9yZXZlcnNlSGlzdG9yeTogSW50MzJBcnJheVtdO1xuXG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3RzIHRoZSBEaWZmRmluZGVyXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihvcmlnaW5hbFNlcXVlbmNlOiBJU2VxdWVuY2UsIG1vZGlmaWVkU2VxdWVuY2U6IElTZXF1ZW5jZSwgY29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlOiBJQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlIHwgbnVsbCA9IG51bGwpIHtcblx0XHR0aGlzLkNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZSA9IGNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZTtcblxuXHRcdHRoaXMuX29yaWdpbmFsU2VxdWVuY2UgPSBvcmlnaW5hbFNlcXVlbmNlO1xuXHRcdHRoaXMuX21vZGlmaWVkU2VxdWVuY2UgPSBtb2RpZmllZFNlcXVlbmNlO1xuXG5cdFx0Y29uc3QgW29yaWdpbmFsU3RyaW5nRWxlbWVudHMsIG9yaWdpbmFsRWxlbWVudHNPckhhc2gsIG9yaWdpbmFsSGFzU3RyaW5nc10gPSBMY3NEaWZmLl9nZXRFbGVtZW50cyhvcmlnaW5hbFNlcXVlbmNlKTtcblx0XHRjb25zdCBbbW9kaWZpZWRTdHJpbmdFbGVtZW50cywgbW9kaWZpZWRFbGVtZW50c09ySGFzaCwgbW9kaWZpZWRIYXNTdHJpbmdzXSA9IExjc0RpZmYuX2dldEVsZW1lbnRzKG1vZGlmaWVkU2VxdWVuY2UpO1xuXG5cdFx0dGhpcy5faGFzU3RyaW5ncyA9IChvcmlnaW5hbEhhc1N0cmluZ3MgJiYgbW9kaWZpZWRIYXNTdHJpbmdzKTtcblx0XHR0aGlzLl9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzID0gb3JpZ2luYWxTdHJpbmdFbGVtZW50cztcblx0XHR0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoID0gb3JpZ2luYWxFbGVtZW50c09ySGFzaDtcblx0XHR0aGlzLl9tb2RpZmllZFN0cmluZ0VsZW1lbnRzID0gbW9kaWZpZWRTdHJpbmdFbGVtZW50cztcblx0XHR0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoID0gbW9kaWZpZWRFbGVtZW50c09ySGFzaDtcblxuXHRcdHRoaXMubV9mb3J3YXJkSGlzdG9yeSA9IFtdO1xuXHRcdHRoaXMubV9yZXZlcnNlSGlzdG9yeSA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzU3RyaW5nQXJyYXkoYXJyOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXSk6IGFyciBpcyBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIChhcnIubGVuZ3RoID4gMCAmJiB0eXBlb2YgYXJyWzBdID09PSAnc3RyaW5nJyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0RWxlbWVudHMoc2VxdWVuY2U6IElTZXF1ZW5jZSk6IFtzdHJpbmdbXSwgSW50MzJBcnJheSwgYm9vbGVhbl0ge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gc2VxdWVuY2UuZ2V0RWxlbWVudHMoKTtcblxuXHRcdGlmIChMY3NEaWZmLl9pc1N0cmluZ0FycmF5KGVsZW1lbnRzKSkge1xuXHRcdFx0Y29uc3QgaGFzaGVzID0gbmV3IEludDMyQXJyYXkoZWxlbWVudHMubGVuZ3RoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlbGVtZW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRoYXNoZXNbaV0gPSBzdHJpbmdIYXNoKGVsZW1lbnRzW2ldLCAwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbZWxlbWVudHMsIGhhc2hlcywgdHJ1ZV07XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnRzIGluc3RhbmNlb2YgSW50MzJBcnJheSkge1xuXHRcdFx0cmV0dXJuIFtbXSwgZWxlbWVudHMsIGZhbHNlXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW1tdLCBuZXcgSW50MzJBcnJheShlbGVtZW50cyksIGZhbHNlXTtcblx0fVxuXG5cdHByaXZhdGUgRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbEluZGV4OiBudW1iZXIsIG5ld0luZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fb3JpZ2luYWxFbGVtZW50c09ySGFzaFtvcmlnaW5hbEluZGV4XSAhPT0gdGhpcy5fbW9kaWZpZWRFbGVtZW50c09ySGFzaFtuZXdJbmRleF0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGlzLl9oYXNTdHJpbmdzID8gdGhpcy5fb3JpZ2luYWxTdHJpbmdFbGVtZW50c1tvcmlnaW5hbEluZGV4XSA9PT0gdGhpcy5fbW9kaWZpZWRTdHJpbmdFbGVtZW50c1tuZXdJbmRleF0gOiB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgRWxlbWVudHNBcmVTdHJpY3RFcXVhbChvcmlnaW5hbEluZGV4OiBudW1iZXIsIG5ld0luZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbEluZGV4LCBuZXdJbmRleCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbGVtZW50ID0gTGNzRGlmZi5fZ2V0U3RyaWN0RWxlbWVudCh0aGlzLl9vcmlnaW5hbFNlcXVlbmNlLCBvcmlnaW5hbEluZGV4KTtcblx0XHRjb25zdCBtb2RpZmllZEVsZW1lbnQgPSBMY3NEaWZmLl9nZXRTdHJpY3RFbGVtZW50KHRoaXMuX21vZGlmaWVkU2VxdWVuY2UsIG5ld0luZGV4KTtcblx0XHRyZXR1cm4gKG9yaWdpbmFsRWxlbWVudCA9PT0gbW9kaWZpZWRFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRTdHJpY3RFbGVtZW50KHNlcXVlbmNlOiBJU2VxdWVuY2UsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAodHlwZW9mIHNlcXVlbmNlLmdldFN0cmljdEVsZW1lbnQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBzZXF1ZW5jZS5nZXRTdHJpY3RFbGVtZW50KGluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIE9yaWdpbmFsRWxlbWVudHNBcmVFcXVhbChpbmRleDE6IG51bWJlciwgaW5kZXgyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fb3JpZ2luYWxFbGVtZW50c09ySGFzaFtpbmRleDFdICE9PSB0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoW2luZGV4Ml0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGlzLl9oYXNTdHJpbmdzID8gdGhpcy5fb3JpZ2luYWxTdHJpbmdFbGVtZW50c1tpbmRleDFdID09PSB0aGlzLl9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzW2luZGV4Ml0gOiB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgTW9kaWZpZWRFbGVtZW50c0FyZUVxdWFsKGluZGV4MTogbnVtYmVyLCBpbmRleDI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoW2luZGV4MV0gIT09IHRoaXMuX21vZGlmaWVkRWxlbWVudHNPckhhc2hbaW5kZXgyXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX2hhc1N0cmluZ3MgPyB0aGlzLl9tb2RpZmllZFN0cmluZ0VsZW1lbnRzW2luZGV4MV0gPT09IHRoaXMuX21vZGlmaWVkU3RyaW5nRWxlbWVudHNbaW5kZXgyXSA6IHRydWUpO1xuXHR9XG5cblx0cHVibGljIENvbXB1dGVEaWZmKHByZXR0eTogYm9vbGVhbik6IElEaWZmUmVzdWx0IHtcblx0XHRyZXR1cm4gdGhpcy5fQ29tcHV0ZURpZmYoMCwgdGhpcy5fb3JpZ2luYWxFbGVtZW50c09ySGFzaC5sZW5ndGggLSAxLCAwLCB0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoLmxlbmd0aCAtIDEsIHByZXR0eSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIG9yaWdpbmFsIGFuZCBtb2RpZmllZCBpbnB1dFxuXHQgKiBzZXF1ZW5jZXMgb24gdGhlIGJvdW5kZWQgcmFuZ2UuXG5cdCAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIHRoZSB0d28gaW5wdXQgc2VxdWVuY2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfQ29tcHV0ZURpZmYob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbEVuZDogbnVtYmVyLCBtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkRW5kOiBudW1iZXIsIHByZXR0eTogYm9vbGVhbik6IElEaWZmUmVzdWx0IHtcblx0XHRjb25zdCBxdWl0RWFybHlBcnIgPSBbZmFsc2VdO1xuXHRcdGxldCBjaGFuZ2VzID0gdGhpcy5Db21wdXRlRGlmZlJlY3Vyc2l2ZShvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbEVuZCwgbW9kaWZpZWRTdGFydCwgbW9kaWZpZWRFbmQsIHF1aXRFYXJseUFycik7XG5cblx0XHRpZiAocHJldHR5KSB7XG5cdFx0XHQvLyBXZSBoYXZlIHRvIGNsZWFuIHVwIHRoZSBjb21wdXRlZCBkaWZmIHRvIGJlIG1vcmUgaW50dWl0aXZlXG5cdFx0XHQvLyBidXQgaXQgdHVybnMgb3V0IHRoaXMgY2Fubm90IGJlIGRvbmUgY29ycmVjdGx5IHVudGlsIHRoZSBlbnRpcmUgc2V0XG5cdFx0XHQvLyBvZiBkaWZmcyBoYXZlIGJlZW4gY29tcHV0ZWRcblx0XHRcdGNoYW5nZXMgPSB0aGlzLlByZXR0aWZ5Q2hhbmdlcyhjaGFuZ2VzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cXVpdEVhcmx5OiBxdWl0RWFybHlBcnJbMF0sXG5cdFx0XHRjaGFuZ2VzOiBjaGFuZ2VzXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcml2YXRlIGhlbHBlciBtZXRob2Qgd2hpY2ggY29tcHV0ZXMgdGhlIGRpZmZlcmVuY2VzIG9uIHRoZSBib3VuZGVkIHJhbmdlXG5cdCAqIHJlY3Vyc2l2ZWx5LlxuXHQgKiBAcmV0dXJucyBBbiBhcnJheSBvZiB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiB0aGUgdHdvIGlucHV0IHNlcXVlbmNlcy5cblx0ICovXG5cdHByaXZhdGUgQ29tcHV0ZURpZmZSZWN1cnNpdmUob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbEVuZDogbnVtYmVyLCBtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkRW5kOiBudW1iZXIsIHF1aXRFYXJseUFycjogYm9vbGVhbltdKTogRGlmZkNoYW5nZVtdIHtcblx0XHRxdWl0RWFybHlBcnJbMF0gPSBmYWxzZTtcblxuXHRcdC8vIEZpbmQgdGhlIHN0YXJ0IG9mIHRoZSBkaWZmZXJlbmNlc1xuXHRcdHdoaWxlIChvcmlnaW5hbFN0YXJ0IDw9IG9yaWdpbmFsRW5kICYmIG1vZGlmaWVkU3RhcnQgPD0gbW9kaWZpZWRFbmQgJiYgdGhpcy5FbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsU3RhcnQsIG1vZGlmaWVkU3RhcnQpKSB7XG5cdFx0XHRvcmlnaW5hbFN0YXJ0Kys7XG5cdFx0XHRtb2RpZmllZFN0YXJ0Kys7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgZW5kIG9mIHRoZSBkaWZmZXJlbmNlc1xuXHRcdHdoaWxlIChvcmlnaW5hbEVuZCA+PSBvcmlnaW5hbFN0YXJ0ICYmIG1vZGlmaWVkRW5kID49IG1vZGlmaWVkU3RhcnQgJiYgdGhpcy5FbGVtZW50c0FyZUVxdWFsKG9yaWdpbmFsRW5kLCBtb2RpZmllZEVuZCkpIHtcblx0XHRcdG9yaWdpbmFsRW5kLS07XG5cdFx0XHRtb2RpZmllZEVuZC0tO1xuXHRcdH1cblxuXHRcdC8vIEluIHRoZSBzcGVjaWFsIGNhc2Ugd2hlcmUgd2UgZWl0aGVyIGhhdmUgYWxsIGluc2VydGlvbnMgb3IgYWxsIGRlbGV0aW9ucyBvciB0aGUgc2VxdWVuY2VzIGFyZSBpZGVudGljYWxcblx0XHRpZiAob3JpZ2luYWxTdGFydCA+IG9yaWdpbmFsRW5kIHx8IG1vZGlmaWVkU3RhcnQgPiBtb2RpZmllZEVuZCkge1xuXHRcdFx0bGV0IGNoYW5nZXM6IERpZmZDaGFuZ2VbXTtcblxuXHRcdFx0aWYgKG1vZGlmaWVkU3RhcnQgPD0gbW9kaWZpZWRFbmQpIHtcblx0XHRcdFx0RGVidWcuQXNzZXJ0KG9yaWdpbmFsU3RhcnQgPT09IG9yaWdpbmFsRW5kICsgMSwgJ29yaWdpbmFsU3RhcnQgc2hvdWxkIG9ubHkgYmUgb25lIG1vcmUgdGhhbiBvcmlnaW5hbEVuZCcpO1xuXG5cdFx0XHRcdC8vIEFsbCBpbnNlcnRpb25zXG5cdFx0XHRcdGNoYW5nZXMgPSBbXG5cdFx0XHRcdFx0bmV3IERpZmZDaGFuZ2Uob3JpZ2luYWxTdGFydCwgMCwgbW9kaWZpZWRTdGFydCwgbW9kaWZpZWRFbmQgLSBtb2RpZmllZFN0YXJ0ICsgMSlcblx0XHRcdFx0XTtcblx0XHRcdH0gZWxzZSBpZiAob3JpZ2luYWxTdGFydCA8PSBvcmlnaW5hbEVuZCkge1xuXHRcdFx0XHREZWJ1Zy5Bc3NlcnQobW9kaWZpZWRTdGFydCA9PT0gbW9kaWZpZWRFbmQgKyAxLCAnbW9kaWZpZWRTdGFydCBzaG91bGQgb25seSBiZSBvbmUgbW9yZSB0aGFuIG1vZGlmaWVkRW5kJyk7XG5cblx0XHRcdFx0Ly8gQWxsIGRlbGV0aW9uc1xuXHRcdFx0XHRjaGFuZ2VzID0gW1xuXHRcdFx0XHRcdG5ldyBEaWZmQ2hhbmdlKG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsRW5kIC0gb3JpZ2luYWxTdGFydCArIDEsIG1vZGlmaWVkU3RhcnQsIDApXG5cdFx0XHRcdF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHREZWJ1Zy5Bc3NlcnQob3JpZ2luYWxTdGFydCA9PT0gb3JpZ2luYWxFbmQgKyAxLCAnb3JpZ2luYWxTdGFydCBzaG91bGQgb25seSBiZSBvbmUgbW9yZSB0aGFuIG9yaWdpbmFsRW5kJyk7XG5cdFx0XHRcdERlYnVnLkFzc2VydChtb2RpZmllZFN0YXJ0ID09PSBtb2RpZmllZEVuZCArIDEsICdtb2RpZmllZFN0YXJ0IHNob3VsZCBvbmx5IGJlIG9uZSBtb3JlIHRoYW4gbW9kaWZpZWRFbmQnKTtcblxuXHRcdFx0XHQvLyBJZGVudGljYWwgc2VxdWVuY2VzIC0gTm8gZGlmZmVyZW5jZXNcblx0XHRcdFx0Y2hhbmdlcyA9IFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hhbmdlcztcblx0XHR9XG5cblx0XHQvLyBUaGlzIHByb2JsZW0gY2FuIGJlIHNvbHZlZCB1c2luZyB0aGUgRGl2aWRlLUFuZC1Db25xdWVyIHRlY2huaXF1ZS5cblx0XHRjb25zdCBtaWRPcmlnaW5hbEFyciA9IFswXTtcblx0XHRjb25zdCBtaWRNb2RpZmllZEFyciA9IFswXTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLkNvbXB1dGVSZWN1cnNpb25Qb2ludChvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbEVuZCwgbW9kaWZpZWRTdGFydCwgbW9kaWZpZWRFbmQsIG1pZE9yaWdpbmFsQXJyLCBtaWRNb2RpZmllZEFyciwgcXVpdEVhcmx5QXJyKTtcblxuXHRcdGNvbnN0IG1pZE9yaWdpbmFsID0gbWlkT3JpZ2luYWxBcnJbMF07XG5cdFx0Y29uc3QgbWlkTW9kaWZpZWQgPSBtaWRNb2RpZmllZEFyclswXTtcblxuXHRcdGlmIChyZXN1bHQgIT09IG51bGwpIHtcblx0XHRcdC8vIFJlc3VsdCBpcyBub3QtbnVsbCB3aGVuIHRoZXJlIHdhcyBlbm91Z2ggbWVtb3J5IHRvIGNvbXB1dGUgdGhlIGNoYW5nZXMgd2hpbGVcblx0XHRcdC8vIHNlYXJjaGluZyBmb3IgdGhlIHJlY3Vyc2lvbiBwb2ludFxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKCFxdWl0RWFybHlBcnJbMF0pIHtcblx0XHRcdC8vIFdlIGNhbiBicmVhayB0aGUgcHJvYmxlbSBkb3duIHJlY3Vyc2l2ZWx5IGJ5IGZpbmRpbmcgdGhlIGNoYW5nZXMgaW4gdGhlXG5cdFx0XHQvLyBGaXJzdCBIYWxmOiAgIChvcmlnaW5hbFN0YXJ0LCBtb2RpZmllZFN0YXJ0KSB0byAobWlkT3JpZ2luYWwsIG1pZE1vZGlmaWVkKVxuXHRcdFx0Ly8gU2Vjb25kIEhhbGY6ICAobWlkT3JpZ2luYWwgKyAxLCBtaW5Nb2RpZmllZCArIDEpIHRvIChvcmlnaW5hbEVuZCwgbW9kaWZpZWRFbmQpXG5cdFx0XHQvLyBOT1RFOiBDb21wdXRlRGlmZigpIGlzIGluY2x1c2l2ZSwgdGhlcmVmb3JlIHRoZSBzZWNvbmQgcmFuZ2Ugc3RhcnRzIG9uIHRoZSBuZXh0IHBvaW50XG5cblx0XHRcdGNvbnN0IGxlZnRDaGFuZ2VzID0gdGhpcy5Db21wdXRlRGlmZlJlY3Vyc2l2ZShvcmlnaW5hbFN0YXJ0LCBtaWRPcmlnaW5hbCwgbW9kaWZpZWRTdGFydCwgbWlkTW9kaWZpZWQsIHF1aXRFYXJseUFycik7XG5cdFx0XHRsZXQgcmlnaHRDaGFuZ2VzOiBEaWZmQ2hhbmdlW10gPSBbXTtcblxuXHRcdFx0aWYgKCFxdWl0RWFybHlBcnJbMF0pIHtcblx0XHRcdFx0cmlnaHRDaGFuZ2VzID0gdGhpcy5Db21wdXRlRGlmZlJlY3Vyc2l2ZShtaWRPcmlnaW5hbCArIDEsIG9yaWdpbmFsRW5kLCBtaWRNb2RpZmllZCArIDEsIG1vZGlmaWVkRW5kLCBxdWl0RWFybHlBcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2UgZGlkbid0IGhhdmUgdGltZSB0byBmaW5pc2ggdGhlIGZpcnN0IGhhbGYsIHNvIHdlIGRvbid0IGhhdmUgdGltZSB0byBjb21wdXRlIHRoaXMgaGFsZi5cblx0XHRcdFx0Ly8gQ29uc2lkZXIgdGhlIGVudGlyZSByZXN0IG9mIHRoZSBzZXF1ZW5jZSBkaWZmZXJlbnQuXG5cdFx0XHRcdHJpZ2h0Q2hhbmdlcyA9IFtcblx0XHRcdFx0XHRuZXcgRGlmZkNoYW5nZShtaWRPcmlnaW5hbCArIDEsIG9yaWdpbmFsRW5kIC0gKG1pZE9yaWdpbmFsICsgMSkgKyAxLCBtaWRNb2RpZmllZCArIDEsIG1vZGlmaWVkRW5kIC0gKG1pZE1vZGlmaWVkICsgMSkgKyAxKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5Db25jYXRlbmF0ZUNoYW5nZXMobGVmdENoYW5nZXMsIHJpZ2h0Q2hhbmdlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgaGl0IGhlcmUsIHdlIHF1aXQgZWFybHksIGFuZCBzbyBjYW4ndCByZXR1cm4gYW55dGhpbmcgbWVhbmluZ2Z1bFxuXHRcdHJldHVybiBbXG5cdFx0XHRuZXcgRGlmZkNoYW5nZShvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbEVuZCAtIG9yaWdpbmFsU3RhcnQgKyAxLCBtb2RpZmllZFN0YXJ0LCBtb2RpZmllZEVuZCAtIG1vZGlmaWVkU3RhcnQgKyAxKVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIFdBTEtUUkFDRShkaWFnb25hbEZvcndhcmRCYXNlOiBudW1iZXIsIGRpYWdvbmFsRm9yd2FyZFN0YXJ0OiBudW1iZXIsIGRpYWdvbmFsRm9yd2FyZEVuZDogbnVtYmVyLCBkaWFnb25hbEZvcndhcmRPZmZzZXQ6IG51bWJlcixcblx0XHRkaWFnb25hbFJldmVyc2VCYXNlOiBudW1iZXIsIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0OiBudW1iZXIsIGRpYWdvbmFsUmV2ZXJzZUVuZDogbnVtYmVyLCBkaWFnb25hbFJldmVyc2VPZmZzZXQ6IG51bWJlcixcblx0XHRmb3J3YXJkUG9pbnRzOiBJbnQzMkFycmF5LCByZXZlcnNlUG9pbnRzOiBJbnQzMkFycmF5LFxuXHRcdG9yaWdpbmFsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxFbmQ6IG51bWJlciwgbWlkT3JpZ2luYWxBcnI6IG51bWJlcltdLFxuXHRcdG1vZGlmaWVkSW5kZXg6IG51bWJlciwgbW9kaWZpZWRFbmQ6IG51bWJlciwgbWlkTW9kaWZpZWRBcnI6IG51bWJlcltdLFxuXHRcdGRlbHRhSXNFdmVuOiBib29sZWFuLCBxdWl0RWFybHlBcnI6IGJvb2xlYW5bXVxuXHQpOiBEaWZmQ2hhbmdlW10ge1xuXHRcdGxldCBmb3J3YXJkQ2hhbmdlczogRGlmZkNoYW5nZVtdIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IHJldmVyc2VDaGFuZ2VzOiBEaWZmQ2hhbmdlW10gfCBudWxsID0gbnVsbDtcblxuXHRcdC8vIEZpcnN0LCB3YWxrIGJhY2t3YXJkIHRocm91Z2ggdGhlIGZvcndhcmQgZGlhZ29uYWxzIGhpc3Rvcnlcblx0XHRsZXQgY2hhbmdlSGVscGVyID0gbmV3IERpZmZDaGFuZ2VIZWxwZXIoKTtcblx0XHRsZXQgZGlhZ29uYWxNaW4gPSBkaWFnb25hbEZvcndhcmRTdGFydDtcblx0XHRsZXQgZGlhZ29uYWxNYXggPSBkaWFnb25hbEZvcndhcmRFbmQ7XG5cdFx0bGV0IGRpYWdvbmFsUmVsYXRpdmUgPSAobWlkT3JpZ2luYWxBcnJbMF0gLSBtaWRNb2RpZmllZEFyclswXSkgLSBkaWFnb25hbEZvcndhcmRPZmZzZXQ7XG5cdFx0bGV0IGxhc3RPcmlnaW5hbEluZGV4ID0gQ29uc3RhbnRzLk1JTl9TQUZFX1NNQUxMX0lOVEVHRVI7XG5cdFx0bGV0IGhpc3RvcnlJbmRleCA9IHRoaXMubV9mb3J3YXJkSGlzdG9yeS5sZW5ndGggLSAxO1xuXG5cdFx0ZG8ge1xuXHRcdFx0Ly8gR2V0IHRoZSBkaWFnb25hbCBpbmRleCBmcm9tIHRoZSByZWxhdGl2ZSBkaWFnb25hbCBudW1iZXJcblx0XHRcdGNvbnN0IGRpYWdvbmFsID0gZGlhZ29uYWxSZWxhdGl2ZSArIGRpYWdvbmFsRm9yd2FyZEJhc2U7XG5cblx0XHRcdC8vIEZpZ3VyZSBvdXQgd2hlcmUgd2UgY2FtZSBmcm9tXG5cdFx0XHRpZiAoZGlhZ29uYWwgPT09IGRpYWdvbmFsTWluIHx8IChkaWFnb25hbCA8IGRpYWdvbmFsTWF4ICYmIGZvcndhcmRQb2ludHNbZGlhZ29uYWwgLSAxXSA8IGZvcndhcmRQb2ludHNbZGlhZ29uYWwgKyAxXSkpIHtcblx0XHRcdFx0Ly8gVmVydGljYWwgbGluZSAodGhlIGVsZW1lbnQgaXMgYW4gaW5zZXJ0KVxuXHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gZm9yd2FyZFBvaW50c1tkaWFnb25hbCArIDFdO1xuXHRcdFx0XHRtb2RpZmllZEluZGV4ID0gb3JpZ2luYWxJbmRleCAtIGRpYWdvbmFsUmVsYXRpdmUgLSBkaWFnb25hbEZvcndhcmRPZmZzZXQ7XG5cdFx0XHRcdGlmIChvcmlnaW5hbEluZGV4IDwgbGFzdE9yaWdpbmFsSW5kZXgpIHtcblx0XHRcdFx0XHRjaGFuZ2VIZWxwZXIuTWFya05leHRDaGFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0T3JpZ2luYWxJbmRleCA9IG9yaWdpbmFsSW5kZXg7XG5cdFx0XHRcdGNoYW5nZUhlbHBlci5BZGRNb2RpZmllZEVsZW1lbnQob3JpZ2luYWxJbmRleCArIDEsIG1vZGlmaWVkSW5kZXgpO1xuXHRcdFx0XHRkaWFnb25hbFJlbGF0aXZlID0gKGRpYWdvbmFsICsgMSkgLSBkaWFnb25hbEZvcndhcmRCYXNlOyAvL1NldHVwIGZvciB0aGUgbmV4dCBpdGVyYXRpb25cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEhvcml6b250YWwgbGluZSAodGhlIGVsZW1lbnQgaXMgYSBkZWxldGlvbilcblx0XHRcdFx0b3JpZ2luYWxJbmRleCA9IGZvcndhcmRQb2ludHNbZGlhZ29uYWwgLSAxXSArIDE7XG5cdFx0XHRcdG1vZGlmaWVkSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gZGlhZ29uYWxSZWxhdGl2ZSAtIGRpYWdvbmFsRm9yd2FyZE9mZnNldDtcblx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPCBsYXN0T3JpZ2luYWxJbmRleCkge1xuXHRcdFx0XHRcdGNoYW5nZUhlbHBlci5NYXJrTmV4dENoYW5nZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleCAtIDE7XG5cdFx0XHRcdGNoYW5nZUhlbHBlci5BZGRPcmlnaW5hbEVsZW1lbnQob3JpZ2luYWxJbmRleCwgbW9kaWZpZWRJbmRleCArIDEpO1xuXHRcdFx0XHRkaWFnb25hbFJlbGF0aXZlID0gKGRpYWdvbmFsIC0gMSkgLSBkaWFnb25hbEZvcndhcmRCYXNlOyAvL1NldHVwIGZvciB0aGUgbmV4dCBpdGVyYXRpb25cblx0XHRcdH1cblxuXHRcdFx0aWYgKGhpc3RvcnlJbmRleCA+PSAwKSB7XG5cdFx0XHRcdGZvcndhcmRQb2ludHMgPSB0aGlzLm1fZm9yd2FyZEhpc3RvcnlbaGlzdG9yeUluZGV4XTtcblx0XHRcdFx0ZGlhZ29uYWxGb3J3YXJkQmFzZSA9IGZvcndhcmRQb2ludHNbMF07IC8vV2Ugc3RvcmVkIHRoaXMgaW4gdGhlIGZpcnN0IHNwb3Rcblx0XHRcdFx0ZGlhZ29uYWxNaW4gPSAxO1xuXHRcdFx0XHRkaWFnb25hbE1heCA9IGZvcndhcmRQb2ludHMubGVuZ3RoIC0gMTtcblx0XHRcdH1cblx0XHR9IHdoaWxlICgtLWhpc3RvcnlJbmRleCA+PSAtMSk7XG5cblx0XHQvLyBJcm9uaWNhbGx5LCB3ZSBnZXQgdGhlIGZvcndhcmQgY2hhbmdlcyBhcyB0aGUgcmV2ZXJzZSBvZiB0aGVcblx0XHQvLyBvcmRlciB3ZSBhZGRlZCB0aGVtIHNpbmNlIHdlIHRlY2huaWNhbGx5IGFkZGVkIHRoZW0gYmFja3dhcmRzXG5cdFx0Zm9yd2FyZENoYW5nZXMgPSBjaGFuZ2VIZWxwZXIuZ2V0UmV2ZXJzZUNoYW5nZXMoKTtcblxuXHRcdGlmIChxdWl0RWFybHlBcnJbMF0pIHtcblx0XHRcdC8vIFRPRE86IENhbGN1bGF0ZSBhIHBhcnRpYWwgZnJvbSB0aGUgcmV2ZXJzZSBkaWFnb25hbHMuXG5cdFx0XHQvLyAgICAgICBGb3Igbm93LCBqdXN0IGFzc3VtZSBldmVyeXRoaW5nIGFmdGVyIHRoZSBtaWRPcmlnaW5hbC9taWRNb2RpZmllZCBwb2ludCBpcyBhIGRpZmZcblxuXHRcdFx0bGV0IG9yaWdpbmFsU3RhcnRQb2ludCA9IG1pZE9yaWdpbmFsQXJyWzBdICsgMTtcblx0XHRcdGxldCBtb2RpZmllZFN0YXJ0UG9pbnQgPSBtaWRNb2RpZmllZEFyclswXSArIDE7XG5cblx0XHRcdGlmIChmb3J3YXJkQ2hhbmdlcyAhPT0gbnVsbCAmJiBmb3J3YXJkQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RGb3J3YXJkQ2hhbmdlID0gZm9yd2FyZENoYW5nZXNbZm9yd2FyZENoYW5nZXMubGVuZ3RoIC0gMV07XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnRQb2ludCA9IE1hdGgubWF4KG9yaWdpbmFsU3RhcnRQb2ludCwgbGFzdEZvcndhcmRDaGFuZ2UuZ2V0T3JpZ2luYWxFbmQoKSk7XG5cdFx0XHRcdG1vZGlmaWVkU3RhcnRQb2ludCA9IE1hdGgubWF4KG1vZGlmaWVkU3RhcnRQb2ludCwgbGFzdEZvcndhcmRDaGFuZ2UuZ2V0TW9kaWZpZWRFbmQoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldmVyc2VDaGFuZ2VzID0gW1xuXHRcdFx0XHRuZXcgRGlmZkNoYW5nZShvcmlnaW5hbFN0YXJ0UG9pbnQsIG9yaWdpbmFsRW5kIC0gb3JpZ2luYWxTdGFydFBvaW50ICsgMSxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0UG9pbnQsIG1vZGlmaWVkRW5kIC0gbW9kaWZpZWRTdGFydFBvaW50ICsgMSlcblx0XHRcdF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vdyB3YWxrIGJhY2t3YXJkIHRocm91Z2ggdGhlIHJldmVyc2UgZGlhZ29uYWxzIGhpc3Rvcnlcblx0XHRcdGNoYW5nZUhlbHBlciA9IG5ldyBEaWZmQ2hhbmdlSGVscGVyKCk7XG5cdFx0XHRkaWFnb25hbE1pbiA9IGRpYWdvbmFsUmV2ZXJzZVN0YXJ0O1xuXHRcdFx0ZGlhZ29uYWxNYXggPSBkaWFnb25hbFJldmVyc2VFbmQ7XG5cdFx0XHRkaWFnb25hbFJlbGF0aXZlID0gKG1pZE9yaWdpbmFsQXJyWzBdIC0gbWlkTW9kaWZpZWRBcnJbMF0pIC0gZGlhZ29uYWxSZXZlcnNlT2Zmc2V0O1xuXHRcdFx0bGFzdE9yaWdpbmFsSW5kZXggPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHRcdGhpc3RvcnlJbmRleCA9IChkZWx0YUlzRXZlbikgPyB0aGlzLm1fcmV2ZXJzZUhpc3RvcnkubGVuZ3RoIC0gMSA6IHRoaXMubV9yZXZlcnNlSGlzdG9yeS5sZW5ndGggLSAyO1xuXG5cdFx0XHRkbyB7XG5cdFx0XHRcdC8vIEdldCB0aGUgZGlhZ29uYWwgaW5kZXggZnJvbSB0aGUgcmVsYXRpdmUgZGlhZ29uYWwgbnVtYmVyXG5cdFx0XHRcdGNvbnN0IGRpYWdvbmFsID0gZGlhZ29uYWxSZWxhdGl2ZSArIGRpYWdvbmFsUmV2ZXJzZUJhc2U7XG5cblx0XHRcdFx0Ly8gRmlndXJlIG91dCB3aGVyZSB3ZSBjYW1lIGZyb21cblx0XHRcdFx0aWYgKGRpYWdvbmFsID09PSBkaWFnb25hbE1pbiB8fCAoZGlhZ29uYWwgPCBkaWFnb25hbE1heCAmJiByZXZlcnNlUG9pbnRzW2RpYWdvbmFsIC0gMV0gPj0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCArIDFdKSkge1xuXHRcdFx0XHRcdC8vIEhvcml6b250YWwgbGluZSAodGhlIGVsZW1lbnQgaXMgYSBkZWxldGlvbikpXG5cdFx0XHRcdFx0b3JpZ2luYWxJbmRleCA9IHJldmVyc2VQb2ludHNbZGlhZ29uYWwgKyAxXSAtIDE7XG5cdFx0XHRcdFx0bW9kaWZpZWRJbmRleCA9IG9yaWdpbmFsSW5kZXggLSBkaWFnb25hbFJlbGF0aXZlIC0gZGlhZ29uYWxSZXZlcnNlT2Zmc2V0O1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEluZGV4ID4gbGFzdE9yaWdpbmFsSW5kZXgpIHtcblx0XHRcdFx0XHRcdGNoYW5nZUhlbHBlci5NYXJrTmV4dENoYW5nZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0T3JpZ2luYWxJbmRleCA9IG9yaWdpbmFsSW5kZXggKyAxO1xuXHRcdFx0XHRcdGNoYW5nZUhlbHBlci5BZGRPcmlnaW5hbEVsZW1lbnQob3JpZ2luYWxJbmRleCArIDEsIG1vZGlmaWVkSW5kZXggKyAxKTtcblx0XHRcdFx0XHRkaWFnb25hbFJlbGF0aXZlID0gKGRpYWdvbmFsICsgMSkgLSBkaWFnb25hbFJldmVyc2VCYXNlOyAvL1NldHVwIGZvciB0aGUgbmV4dCBpdGVyYXRpb25cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBWZXJ0aWNhbCBsaW5lICh0aGUgZWxlbWVudCBpcyBhbiBpbnNlcnRpb24pXG5cdFx0XHRcdFx0b3JpZ2luYWxJbmRleCA9IHJldmVyc2VQb2ludHNbZGlhZ29uYWwgLSAxXTtcblx0XHRcdFx0XHRtb2RpZmllZEluZGV4ID0gb3JpZ2luYWxJbmRleCAtIGRpYWdvbmFsUmVsYXRpdmUgLSBkaWFnb25hbFJldmVyc2VPZmZzZXQ7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggPiBsYXN0T3JpZ2luYWxJbmRleCkge1xuXHRcdFx0XHRcdFx0Y2hhbmdlSGVscGVyLk1hcmtOZXh0Q2hhbmdlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhc3RPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleDtcblx0XHRcdFx0XHRjaGFuZ2VIZWxwZXIuQWRkTW9kaWZpZWRFbGVtZW50KG9yaWdpbmFsSW5kZXggKyAxLCBtb2RpZmllZEluZGV4ICsgMSk7XG5cdFx0XHRcdFx0ZGlhZ29uYWxSZWxhdGl2ZSA9IChkaWFnb25hbCAtIDEpIC0gZGlhZ29uYWxSZXZlcnNlQmFzZTsgLy9TZXR1cCBmb3IgdGhlIG5leHQgaXRlcmF0aW9uXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGlzdG9yeUluZGV4ID49IDApIHtcblx0XHRcdFx0XHRyZXZlcnNlUG9pbnRzID0gdGhpcy5tX3JldmVyc2VIaXN0b3J5W2hpc3RvcnlJbmRleF07XG5cdFx0XHRcdFx0ZGlhZ29uYWxSZXZlcnNlQmFzZSA9IHJldmVyc2VQb2ludHNbMF07IC8vV2Ugc3RvcmVkIHRoaXMgaW4gdGhlIGZpcnN0IHNwb3Rcblx0XHRcdFx0XHRkaWFnb25hbE1pbiA9IDE7XG5cdFx0XHRcdFx0ZGlhZ29uYWxNYXggPSByZXZlcnNlUG9pbnRzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKC0taGlzdG9yeUluZGV4ID49IC0xKTtcblxuXHRcdFx0Ly8gVGhlcmUgYXJlIGNhc2VzIHdoZXJlIHRoZSByZXZlcnNlIGhpc3Rvcnkgd2lsbCBmaW5kIGRpZmZzIHRoYXRcblx0XHRcdC8vIGFyZSBjb3JyZWN0LCBidXQgbm90IGludHVpdGl2ZSwgc28gd2UgbmVlZCBzaGlmdCB0aGVtLlxuXHRcdFx0cmV2ZXJzZUNoYW5nZXMgPSBjaGFuZ2VIZWxwZXIuZ2V0Q2hhbmdlcygpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLkNvbmNhdGVuYXRlQ2hhbmdlcyhmb3J3YXJkQ2hhbmdlcywgcmV2ZXJzZUNoYW5nZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIHRoZSByYW5nZSB0byBjb21wdXRlIHRoZSBkaWZmIG9uLCB0aGlzIG1ldGhvZCBmaW5kcyB0aGUgcG9pbnQ6XG5cdCAqIChtaWRPcmlnaW5hbCwgbWlkTW9kaWZpZWQpXG5cdCAqIHRoYXQgZXhpc3RzIGluIHRoZSBtaWRkbGUgb2YgdGhlIExDUyBvZiB0aGUgdHdvIHNlcXVlbmNlcyBhbmRcblx0ICogaXMgdGhlIHBvaW50IGF0IHdoaWNoIHRoZSBMQ1MgcHJvYmxlbSBtYXkgYmUgYnJva2VuIGRvd24gcmVjdXJzaXZlbHkuXG5cdCAqIFRoaXMgbWV0aG9kIHdpbGwgdHJ5IHRvIGtlZXAgdGhlIExDUyB0cmFjZSBpbiBtZW1vcnkuIElmIHRoZSBMQ1MgcmVjdXJzaW9uXG5cdCAqIHBvaW50IGlzIGNhbGN1bGF0ZWQgYW5kIHRoZSBmdWxsIHRyYWNlIGlzIGF2YWlsYWJsZSBpbiBtZW1vcnksIHRoZW4gdGhpcyBtZXRob2Rcblx0ICogd2lsbCByZXR1cm4gdGhlIGNoYW5nZSBsaXN0LlxuXHQgKiBAcGFyYW0gb3JpZ2luYWxTdGFydCBUaGUgc3RhcnQgYm91bmQgb2YgdGhlIG9yaWdpbmFsIHNlcXVlbmNlIHJhbmdlXG5cdCAqIEBwYXJhbSBvcmlnaW5hbEVuZCBUaGUgZW5kIGJvdW5kIG9mIHRoZSBvcmlnaW5hbCBzZXF1ZW5jZSByYW5nZVxuXHQgKiBAcGFyYW0gbW9kaWZpZWRTdGFydCBUaGUgc3RhcnQgYm91bmQgb2YgdGhlIG1vZGlmaWVkIHNlcXVlbmNlIHJhbmdlXG5cdCAqIEBwYXJhbSBtb2RpZmllZEVuZCBUaGUgZW5kIGJvdW5kIG9mIHRoZSBtb2RpZmllZCBzZXF1ZW5jZSByYW5nZVxuXHQgKiBAcGFyYW0gbWlkT3JpZ2luYWwgVGhlIG1pZGRsZSBwb2ludCBvZiB0aGUgb3JpZ2luYWwgc2VxdWVuY2UgcmFuZ2Vcblx0ICogQHBhcmFtIG1pZE1vZGlmaWVkIFRoZSBtaWRkbGUgcG9pbnQgb2YgdGhlIG1vZGlmaWVkIHNlcXVlbmNlIHJhbmdlXG5cdCAqIEByZXR1cm5zIFRoZSBkaWZmIGNoYW5nZXMsIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIG51bGxcblx0ICovXG5cdHByaXZhdGUgQ29tcHV0ZVJlY3Vyc2lvblBvaW50KG9yaWdpbmFsU3RhcnQ6IG51bWJlciwgb3JpZ2luYWxFbmQ6IG51bWJlciwgbW9kaWZpZWRTdGFydDogbnVtYmVyLCBtb2RpZmllZEVuZDogbnVtYmVyLCBtaWRPcmlnaW5hbEFycjogbnVtYmVyW10sIG1pZE1vZGlmaWVkQXJyOiBudW1iZXJbXSwgcXVpdEVhcmx5QXJyOiBib29sZWFuW10pIHtcblx0XHRsZXQgb3JpZ2luYWxJbmRleCA9IDAsIG1vZGlmaWVkSW5kZXggPSAwO1xuXHRcdGxldCBkaWFnb25hbEZvcndhcmRTdGFydCA9IDAsIGRpYWdvbmFsRm9yd2FyZEVuZCA9IDA7XG5cdFx0bGV0IGRpYWdvbmFsUmV2ZXJzZVN0YXJ0ID0gMCwgZGlhZ29uYWxSZXZlcnNlRW5kID0gMDtcblxuXHRcdC8vIFRvIHRyYXZlcnNlIHRoZSBlZGl0IGdyYXBoIGFuZCBwcm9kdWNlIHRoZSBwcm9wZXIgTENTLCBvdXIgYWN0dWFsXG5cdFx0Ly8gc3RhcnQgcG9zaXRpb24gaXMganVzdCBvdXRzaWRlIHRoZSBnaXZlbiBib3VuZGFyeVxuXHRcdG9yaWdpbmFsU3RhcnQtLTtcblx0XHRtb2RpZmllZFN0YXJ0LS07XG5cblx0XHQvLyBXZSBzZXQgdGhlc2UgdXAgdG8gbWFrZSB0aGUgY29tcGlsZXIgaGFwcHksIGJ1dCB0aGV5IHdpbGxcblx0XHQvLyBiZSByZXBsYWNlZCBiZWZvcmUgd2UgcmV0dXJuIHdpdGggdGhlIGFjdHVhbCByZWN1cnNpb24gcG9pbnRcblx0XHRtaWRPcmlnaW5hbEFyclswXSA9IDA7XG5cdFx0bWlkTW9kaWZpZWRBcnJbMF0gPSAwO1xuXG5cdFx0Ly8gQ2xlYXIgb3V0IHRoZSBoaXN0b3J5XG5cdFx0dGhpcy5tX2ZvcndhcmRIaXN0b3J5ID0gW107XG5cdFx0dGhpcy5tX3JldmVyc2VIaXN0b3J5ID0gW107XG5cblx0XHQvLyBFYWNoIGNlbGwgaW4gdGhlIHR3byBhcnJheXMgY29ycmVzcG9uZHMgdG8gYSBkaWFnb25hbCBpbiB0aGUgZWRpdCBncmFwaC5cblx0XHQvLyBUaGUgaW50ZWdlciB2YWx1ZSBpbiB0aGUgY2VsbCByZXByZXNlbnRzIHRoZSBvcmlnaW5hbEluZGV4IG9mIHRoZSBmdXJ0aGVzdFxuXHRcdC8vIHJlYWNoaW5nIHBvaW50IGZvdW5kIHNvIGZhciB0aGF0IGVuZHMgaW4gdGhhdCBkaWFnb25hbC5cblx0XHQvLyBUaGUgbW9kaWZpZWRJbmRleCBjYW4gYmUgY29tcHV0ZWQgbWF0aGVtYXRpY2FsbHkgZnJvbSB0aGUgb3JpZ2luYWxJbmRleCBhbmQgdGhlIGRpYWdvbmFsIG51bWJlci5cblx0XHRjb25zdCBtYXhEaWZmZXJlbmNlcyA9IChvcmlnaW5hbEVuZCAtIG9yaWdpbmFsU3RhcnQpICsgKG1vZGlmaWVkRW5kIC0gbW9kaWZpZWRTdGFydCk7XG5cdFx0Y29uc3QgbnVtRGlhZ29uYWxzID0gbWF4RGlmZmVyZW5jZXMgKyAxO1xuXHRcdGNvbnN0IGZvcndhcmRQb2ludHMgPSBuZXcgSW50MzJBcnJheShudW1EaWFnb25hbHMpO1xuXHRcdGNvbnN0IHJldmVyc2VQb2ludHMgPSBuZXcgSW50MzJBcnJheShudW1EaWFnb25hbHMpO1xuXHRcdC8vIGRpYWdvbmFsRm9yd2FyZEJhc2U6IEluZGV4IGludG8gZm9yd2FyZFBvaW50cyBvZiB0aGUgZGlhZ29uYWwgd2hpY2ggcGFzc2VzIHRocm91Z2ggKG9yaWdpbmFsU3RhcnQsIG1vZGlmaWVkU3RhcnQpXG5cdFx0Ly8gZGlhZ29uYWxSZXZlcnNlQmFzZTogSW5kZXggaW50byByZXZlcnNlUG9pbnRzIG9mIHRoZSBkaWFnb25hbCB3aGljaCBwYXNzZXMgdGhyb3VnaCAob3JpZ2luYWxFbmQsIG1vZGlmaWVkRW5kKVxuXHRcdGNvbnN0IGRpYWdvbmFsRm9yd2FyZEJhc2UgPSAobW9kaWZpZWRFbmQgLSBtb2RpZmllZFN0YXJ0KTtcblx0XHRjb25zdCBkaWFnb25hbFJldmVyc2VCYXNlID0gKG9yaWdpbmFsRW5kIC0gb3JpZ2luYWxTdGFydCk7XG5cdFx0Ly8gZGlhZ29uYWxGb3J3YXJkT2Zmc2V0OiBHZW9tZXRyaWMgb2Zmc2V0IHdoaWNoIGFsbG93cyBtb2RpZmllZEluZGV4IHRvIGJlIGNvbXB1dGVkIGZyb20gb3JpZ2luYWxJbmRleCBhbmQgdGhlXG5cdFx0Ly8gICAgZGlhZ29uYWwgbnVtYmVyIChyZWxhdGl2ZSB0byBkaWFnb25hbEZvcndhcmRCYXNlKVxuXHRcdC8vIGRpYWdvbmFsUmV2ZXJzZU9mZnNldDogR2VvbWV0cmljIG9mZnNldCB3aGljaCBhbGxvd3MgbW9kaWZpZWRJbmRleCB0byBiZSBjb21wdXRlZCBmcm9tIG9yaWdpbmFsSW5kZXggYW5kIHRoZVxuXHRcdC8vICAgIGRpYWdvbmFsIG51bWJlciAocmVsYXRpdmUgdG8gZGlhZ29uYWxSZXZlcnNlQmFzZSlcblx0XHRjb25zdCBkaWFnb25hbEZvcndhcmRPZmZzZXQgPSAob3JpZ2luYWxTdGFydCAtIG1vZGlmaWVkU3RhcnQpO1xuXHRcdGNvbnN0IGRpYWdvbmFsUmV2ZXJzZU9mZnNldCA9IChvcmlnaW5hbEVuZCAtIG1vZGlmaWVkRW5kKTtcblxuXHRcdC8vIGRlbHRhOiBUaGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHRoZSBlbmQgZGlhZ29uYWwgYW5kIHRoZSBzdGFydCBkaWFnb25hbC4gVGhpcyBpcyB1c2VkIHRvIHJlbGF0ZSBkaWFnb25hbCBudW1iZXJzXG5cdFx0Ly8gICByZWxhdGl2ZSB0byB0aGUgc3RhcnQgZGlhZ29uYWwgd2l0aCBkaWFnb25hbCBudW1iZXJzIHJlbGF0aXZlIHRvIHRoZSBlbmQgZGlhZ29uYWwuXG5cdFx0Ly8gVGhlIEV2ZW4vT2Rkbi1uZXNzIG9mIHRoaXMgZGVsdGEgaXMgaW1wb3J0YW50IGZvciBkZXRlcm1pbmluZyB3aGVuIHdlIHNob3VsZCBjaGVjayBmb3Igb3ZlcmxhcFxuXHRcdGNvbnN0IGRlbHRhID0gZGlhZ29uYWxSZXZlcnNlQmFzZSAtIGRpYWdvbmFsRm9yd2FyZEJhc2U7XG5cdFx0Y29uc3QgZGVsdGFJc0V2ZW4gPSAoZGVsdGEgJSAyID09PSAwKTtcblxuXHRcdC8vIEhlcmUgd2Ugc2V0IHVwIHRoZSBzdGFydCBhbmQgZW5kIHBvaW50cyBhcyB0aGUgZnVydGhlc3QgcG9pbnRzIGZvdW5kIHNvIGZhclxuXHRcdC8vIGluIGJvdGggdGhlIGZvcndhcmQgYW5kIHJldmVyc2UgZGlyZWN0aW9ucywgcmVzcGVjdGl2ZWx5XG5cdFx0Zm9yd2FyZFBvaW50c1tkaWFnb25hbEZvcndhcmRCYXNlXSA9IG9yaWdpbmFsU3RhcnQ7XG5cdFx0cmV2ZXJzZVBvaW50c1tkaWFnb25hbFJldmVyc2VCYXNlXSA9IG9yaWdpbmFsRW5kO1xuXG5cdFx0Ly8gUmVtZW1iZXIgaWYgd2UgcXVpdCBlYXJseSwgYW5kIHRodXMgbmVlZCB0byBkbyBhIGJlc3QtZWZmb3J0IHJlc3VsdCBpbnN0ZWFkIG9mIGEgcmVhbCByZXN1bHQuXG5cdFx0cXVpdEVhcmx5QXJyWzBdID0gZmFsc2U7XG5cblxuXG5cdFx0Ly8gQSBjb3VwbGUgb2YgcG9pbnRzOlxuXHRcdC8vIC0tV2l0aCB0aGlzIG1ldGhvZCwgd2UgaXRlcmF0ZSBvbiB0aGUgbnVtYmVyIG9mIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIHR3byBzZXF1ZW5jZXMuXG5cdFx0Ly8gICBUaGUgbW9yZSBkaWZmZXJlbmNlcyB0aGVyZSBhY3R1YWxseSBhcmUsIHRoZSBsb25nZXIgdGhpcyB3aWxsIHRha2UuXG5cdFx0Ly8gLS1BbHNvLCBhcyB0aGUgbnVtYmVyIG9mIGRpZmZlcmVuY2VzIGluY3JlYXNlcywgd2UgaGF2ZSB0byBzZWFyY2ggb24gZGlhZ29uYWxzIGZ1cnRoZXJcblx0XHQvLyAgIGF3YXkgZnJvbSB0aGUgcmVmZXJlbmNlIGRpYWdvbmFsICh3aGljaCBpcyBkaWFnb25hbEZvcndhcmRCYXNlIGZvciBmb3J3YXJkLCBkaWFnb25hbFJldmVyc2VCYXNlIGZvciByZXZlcnNlKS5cblx0XHQvLyAtLVdlIGV4dGVuZCBvbiBldmVuIGRpYWdvbmFscyAocmVsYXRpdmUgdG8gdGhlIHJlZmVyZW5jZSBkaWFnb25hbCkgb25seSB3aGVuIG51bURpZmZlcmVuY2VzXG5cdFx0Ly8gICBpcyBldmVuIGFuZCBvZGQgZGlhZ29uYWxzIG9ubHkgd2hlbiBudW1EaWZmZXJlbmNlcyBpcyBvZGQuXG5cdFx0Zm9yIChsZXQgbnVtRGlmZmVyZW5jZXMgPSAxOyBudW1EaWZmZXJlbmNlcyA8PSAobWF4RGlmZmVyZW5jZXMgLyAyKSArIDE7IG51bURpZmZlcmVuY2VzKyspIHtcblx0XHRcdGxldCBmdXJ0aGVzdE9yaWdpbmFsSW5kZXggPSAwO1xuXHRcdFx0bGV0IGZ1cnRoZXN0TW9kaWZpZWRJbmRleCA9IDA7XG5cblx0XHRcdC8vIFJ1biB0aGUgYWxnb3JpdGhtIGluIHRoZSBmb3J3YXJkIGRpcmVjdGlvblxuXHRcdFx0ZGlhZ29uYWxGb3J3YXJkU3RhcnQgPSB0aGlzLkNsaXBEaWFnb25hbEJvdW5kKGRpYWdvbmFsRm9yd2FyZEJhc2UgLSBudW1EaWZmZXJlbmNlcywgbnVtRGlmZmVyZW5jZXMsIGRpYWdvbmFsRm9yd2FyZEJhc2UsIG51bURpYWdvbmFscyk7XG5cdFx0XHRkaWFnb25hbEZvcndhcmRFbmQgPSB0aGlzLkNsaXBEaWFnb25hbEJvdW5kKGRpYWdvbmFsRm9yd2FyZEJhc2UgKyBudW1EaWZmZXJlbmNlcywgbnVtRGlmZmVyZW5jZXMsIGRpYWdvbmFsRm9yd2FyZEJhc2UsIG51bURpYWdvbmFscyk7XG5cdFx0XHRmb3IgKGxldCBkaWFnb25hbCA9IGRpYWdvbmFsRm9yd2FyZFN0YXJ0OyBkaWFnb25hbCA8PSBkaWFnb25hbEZvcndhcmRFbmQ7IGRpYWdvbmFsICs9IDIpIHtcblx0XHRcdFx0Ly8gU1RFUCAxOiBXZSBleHRlbmQgdGhlIGZ1cnRoZXN0IHJlYWNoaW5nIHBvaW50IGluIHRoZSBwcmVzZW50IGRpYWdvbmFsXG5cdFx0XHRcdC8vIGJ5IGxvb2tpbmcgYXQgdGhlIGRpYWdvbmFscyBhYm92ZSBhbmQgYmVsb3cgYW5kIHBpY2tpbmcgdGhlIG9uZSB3aG9zZSBwb2ludFxuXHRcdFx0XHQvLyBpcyBmdXJ0aGVyIGF3YXkgZnJvbSB0aGUgc3RhcnQgcG9pbnQgKG9yaWdpbmFsU3RhcnQsIG1vZGlmaWVkU3RhcnQpXG5cdFx0XHRcdGlmIChkaWFnb25hbCA9PT0gZGlhZ29uYWxGb3J3YXJkU3RhcnQgfHwgKGRpYWdvbmFsIDwgZGlhZ29uYWxGb3J3YXJkRW5kICYmIGZvcndhcmRQb2ludHNbZGlhZ29uYWwgLSAxXSA8IGZvcndhcmRQb2ludHNbZGlhZ29uYWwgKyAxXSkpIHtcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gZm9yd2FyZFBvaW50c1tkaWFnb25hbCArIDFdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9yaWdpbmFsSW5kZXggPSBmb3J3YXJkUG9pbnRzW2RpYWdvbmFsIC0gMV0gKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1vZGlmaWVkSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gKGRpYWdvbmFsIC0gZGlhZ29uYWxGb3J3YXJkQmFzZSkgLSBkaWFnb25hbEZvcndhcmRPZmZzZXQ7XG5cblx0XHRcdFx0Ly8gU2F2ZSB0aGUgY3VycmVudCBvcmlnaW5hbEluZGV4IHNvIHdlIGNhbiB0ZXN0IGZvciBmYWxzZSBvdmVybGFwIGluIHN0ZXAgM1xuXHRcdFx0XHRjb25zdCB0ZW1wT3JpZ2luYWxJbmRleCA9IG9yaWdpbmFsSW5kZXg7XG5cblx0XHRcdFx0Ly8gU1RFUCAyOiBXZSBjYW4gY29udGludWUgdG8gZXh0ZW5kIHRoZSBmdXJ0aGVzdCByZWFjaGluZyBwb2ludCBpbiB0aGUgcHJlc2VudCBkaWFnb25hbFxuXHRcdFx0XHQvLyBzbyBsb25nIGFzIHRoZSBlbGVtZW50cyBhcmUgZXF1YWwuXG5cdFx0XHRcdHdoaWxlIChvcmlnaW5hbEluZGV4IDwgb3JpZ2luYWxFbmQgJiYgbW9kaWZpZWRJbmRleCA8IG1vZGlmaWVkRW5kICYmIHRoaXMuRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbEluZGV4ICsgMSwgbW9kaWZpZWRJbmRleCArIDEpKSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxJbmRleCsrO1xuXHRcdFx0XHRcdG1vZGlmaWVkSW5kZXgrKztcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3J3YXJkUG9pbnRzW2RpYWdvbmFsXSA9IG9yaWdpbmFsSW5kZXg7XG5cblx0XHRcdFx0aWYgKG9yaWdpbmFsSW5kZXggKyBtb2RpZmllZEluZGV4ID4gZnVydGhlc3RPcmlnaW5hbEluZGV4ICsgZnVydGhlc3RNb2RpZmllZEluZGV4KSB7XG5cdFx0XHRcdFx0ZnVydGhlc3RPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleDtcblx0XHRcdFx0XHRmdXJ0aGVzdE1vZGlmaWVkSW5kZXggPSBtb2RpZmllZEluZGV4O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU1RFUCAzOiBJZiBkZWx0YSBpcyBvZGQgKG92ZXJsYXAgZmlyc3QgaGFwcGVucyBvbiBmb3J3YXJkIHdoZW4gZGVsdGEgaXMgb2RkKVxuXHRcdFx0XHQvLyBhbmQgZGlhZ29uYWwgaXMgaW4gdGhlIHJhbmdlIG9mIHJldmVyc2UgZGlhZ29uYWxzIGNvbXB1dGVkIGZvciBudW1EaWZmZXJlbmNlcy0xXG5cdFx0XHRcdC8vICh0aGUgcHJldmlvdXMgaXRlcmF0aW9uOyB3ZSBoYXZlbid0IGNvbXB1dGVkIHJldmVyc2UgZGlhZ29uYWxzIGZvciBudW1EaWZmZXJlbmNlcyB5ZXQpXG5cdFx0XHRcdC8vIHRoZW4gY2hlY2sgZm9yIG92ZXJsYXAuXG5cdFx0XHRcdGlmICghZGVsdGFJc0V2ZW4gJiYgTWF0aC5hYnMoZGlhZ29uYWwgLSBkaWFnb25hbFJldmVyc2VCYXNlKSA8PSAobnVtRGlmZmVyZW5jZXMgLSAxKSkge1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEluZGV4ID49IHJldmVyc2VQb2ludHNbZGlhZ29uYWxdKSB7XG5cdFx0XHRcdFx0XHRtaWRPcmlnaW5hbEFyclswXSA9IG9yaWdpbmFsSW5kZXg7XG5cdFx0XHRcdFx0XHRtaWRNb2RpZmllZEFyclswXSA9IG1vZGlmaWVkSW5kZXg7XG5cblx0XHRcdFx0XHRcdGlmICh0ZW1wT3JpZ2luYWxJbmRleCA8PSByZXZlcnNlUG9pbnRzW2RpYWdvbmFsXSAmJiBMb2NhbENvbnN0YW50cy5NYXhEaWZmZXJlbmNlc0hpc3RvcnkgPiAwICYmIG51bURpZmZlcmVuY2VzIDw9IChMb2NhbENvbnN0YW50cy5NYXhEaWZmZXJlbmNlc0hpc3RvcnkgKyAxKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBCSU5HTyEgV2Ugb3ZlcmxhcHBlZCwgYW5kIHdlIGhhdmUgdGhlIGZ1bGwgdHJhY2UgaW4gbWVtb3J5IVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5XQUxLVFJBQ0UoZGlhZ29uYWxGb3J3YXJkQmFzZSwgZGlhZ29uYWxGb3J3YXJkU3RhcnQsIGRpYWdvbmFsRm9yd2FyZEVuZCwgZGlhZ29uYWxGb3J3YXJkT2Zmc2V0LFxuXHRcdFx0XHRcdFx0XHRcdGRpYWdvbmFsUmV2ZXJzZUJhc2UsIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0LCBkaWFnb25hbFJldmVyc2VFbmQsIGRpYWdvbmFsUmV2ZXJzZU9mZnNldCxcblx0XHRcdFx0XHRcdFx0XHRmb3J3YXJkUG9pbnRzLCByZXZlcnNlUG9pbnRzLFxuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsSW5kZXgsIG9yaWdpbmFsRW5kLCBtaWRPcmlnaW5hbEFycixcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEluZGV4LCBtb2RpZmllZEVuZCwgbWlkTW9kaWZpZWRBcnIsXG5cdFx0XHRcdFx0XHRcdFx0ZGVsdGFJc0V2ZW4sIHF1aXRFYXJseUFyclxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gRWl0aGVyIGZhbHNlIG92ZXJsYXAsIG9yIHdlIGRpZG4ndCBoYXZlIGVub3VnaCBtZW1vcnkgZm9yIHRoZSBmdWxsIHRyYWNlXG5cdFx0XHRcdFx0XHRcdC8vIEp1c3QgcmV0dXJuIHRoZSByZWN1cnNpb24gcG9pbnRcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIHRvIHNlZSBpZiB3ZSBzaG91bGQgYmUgcXVpdHRpbmcgZWFybHksIGJlZm9yZSBtb3Zpbmcgb24gdG8gdGhlIG5leHQgaXRlcmF0aW9uLlxuXHRcdFx0Y29uc3QgbWF0Y2hMZW5ndGhPZkxvbmdlc3QgPSAoKGZ1cnRoZXN0T3JpZ2luYWxJbmRleCAtIG9yaWdpbmFsU3RhcnQpICsgKGZ1cnRoZXN0TW9kaWZpZWRJbmRleCAtIG1vZGlmaWVkU3RhcnQpIC0gbnVtRGlmZmVyZW5jZXMpIC8gMjtcblxuXHRcdFx0aWYgKHRoaXMuQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlICE9PSBudWxsICYmICF0aGlzLkNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZShmdXJ0aGVzdE9yaWdpbmFsSW5kZXgsIG1hdGNoTGVuZ3RoT2ZMb25nZXN0KSkge1xuXHRcdFx0XHQvLyBXZSBjYW4ndCBmaW5pc2gsIHNvIHNraXAgYWhlYWQgdG8gZ2VuZXJhdGluZyBhIHJlc3VsdCBmcm9tIHdoYXQgd2UgaGF2ZS5cblx0XHRcdFx0cXVpdEVhcmx5QXJyWzBdID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBVc2UgdGhlIGZ1cnRoZXN0IGRpc3RhbmNlIHdlIGdvdCBpbiB0aGUgZm9yd2FyZCBkaXJlY3Rpb24uXG5cdFx0XHRcdG1pZE9yaWdpbmFsQXJyWzBdID0gZnVydGhlc3RPcmlnaW5hbEluZGV4O1xuXHRcdFx0XHRtaWRNb2RpZmllZEFyclswXSA9IGZ1cnRoZXN0TW9kaWZpZWRJbmRleDtcblxuXHRcdFx0XHRpZiAobWF0Y2hMZW5ndGhPZkxvbmdlc3QgPiAwICYmIExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSA+IDAgJiYgbnVtRGlmZmVyZW5jZXMgPD0gKExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSArIDEpKSB7XG5cdFx0XHRcdFx0Ly8gRW5vdWdoIG9mIHRoZSBoaXN0b3J5IGlzIGluIG1lbW9yeSB0byB3YWxrIGl0IGJhY2t3YXJkc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLldBTEtUUkFDRShkaWFnb25hbEZvcndhcmRCYXNlLCBkaWFnb25hbEZvcndhcmRTdGFydCwgZGlhZ29uYWxGb3J3YXJkRW5kLCBkaWFnb25hbEZvcndhcmRPZmZzZXQsXG5cdFx0XHRcdFx0XHRkaWFnb25hbFJldmVyc2VCYXNlLCBkaWFnb25hbFJldmVyc2VTdGFydCwgZGlhZ29uYWxSZXZlcnNlRW5kLCBkaWFnb25hbFJldmVyc2VPZmZzZXQsXG5cdFx0XHRcdFx0XHRmb3J3YXJkUG9pbnRzLCByZXZlcnNlUG9pbnRzLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxJbmRleCwgb3JpZ2luYWxFbmQsIG1pZE9yaWdpbmFsQXJyLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRJbmRleCwgbW9kaWZpZWRFbmQsIG1pZE1vZGlmaWVkQXJyLFxuXHRcdFx0XHRcdFx0ZGVsdGFJc0V2ZW4sIHF1aXRFYXJseUFyclxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gV2UgZGlkbid0IGFjdHVhbGx5IHJlbWVtYmVyIGVub3VnaCBvZiB0aGUgaGlzdG9yeS5cblxuXHRcdFx0XHRcdC8vU2luY2Ugd2UgYXJlIHF1aXR0aW5nIHRoZSBkaWZmIGVhcmx5LCB3ZSBuZWVkIHRvIHNoaWZ0IGJhY2sgdGhlIG9yaWdpbmFsU3RhcnQgYW5kIG1vZGlmaWVkIHN0YXJ0XG5cdFx0XHRcdFx0Ly9iYWNrIGludG8gdGhlIGJvdW5kYXJ5IGxpbWl0cyBzaW5jZSB3ZSBkZWNyZW1lbnRlZCB0aGVpciB2YWx1ZSBhYm92ZSBiZXlvbmQgdGhlIGJvdW5kYXJ5IGxpbWl0LlxuXHRcdFx0XHRcdG9yaWdpbmFsU3RhcnQrKztcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0Kys7XG5cblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0bmV3IERpZmZDaGFuZ2Uob3JpZ2luYWxTdGFydCwgb3JpZ2luYWxFbmQgLSBvcmlnaW5hbFN0YXJ0ICsgMSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWRTdGFydCwgbW9kaWZpZWRFbmQgLSBtb2RpZmllZFN0YXJ0ICsgMSlcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJ1biB0aGUgYWxnb3JpdGhtIGluIHRoZSByZXZlcnNlIGRpcmVjdGlvblxuXHRcdFx0ZGlhZ29uYWxSZXZlcnNlU3RhcnQgPSB0aGlzLkNsaXBEaWFnb25hbEJvdW5kKGRpYWdvbmFsUmV2ZXJzZUJhc2UgLSBudW1EaWZmZXJlbmNlcywgbnVtRGlmZmVyZW5jZXMsIGRpYWdvbmFsUmV2ZXJzZUJhc2UsIG51bURpYWdvbmFscyk7XG5cdFx0XHRkaWFnb25hbFJldmVyc2VFbmQgPSB0aGlzLkNsaXBEaWFnb25hbEJvdW5kKGRpYWdvbmFsUmV2ZXJzZUJhc2UgKyBudW1EaWZmZXJlbmNlcywgbnVtRGlmZmVyZW5jZXMsIGRpYWdvbmFsUmV2ZXJzZUJhc2UsIG51bURpYWdvbmFscyk7XG5cdFx0XHRmb3IgKGxldCBkaWFnb25hbCA9IGRpYWdvbmFsUmV2ZXJzZVN0YXJ0OyBkaWFnb25hbCA8PSBkaWFnb25hbFJldmVyc2VFbmQ7IGRpYWdvbmFsICs9IDIpIHtcblx0XHRcdFx0Ly8gU1RFUCAxOiBXZSBleHRlbmQgdGhlIGZ1cnRoZXN0IHJlYWNoaW5nIHBvaW50IGluIHRoZSBwcmVzZW50IGRpYWdvbmFsXG5cdFx0XHRcdC8vIGJ5IGxvb2tpbmcgYXQgdGhlIGRpYWdvbmFscyBhYm92ZSBhbmQgYmVsb3cgYW5kIHBpY2tpbmcgdGhlIG9uZSB3aG9zZSBwb2ludFxuXHRcdFx0XHQvLyBpcyBmdXJ0aGVyIGF3YXkgZnJvbSB0aGUgc3RhcnQgcG9pbnQgKG9yaWdpbmFsRW5kLCBtb2RpZmllZEVuZClcblx0XHRcdFx0aWYgKGRpYWdvbmFsID09PSBkaWFnb25hbFJldmVyc2VTdGFydCB8fCAoZGlhZ29uYWwgPCBkaWFnb25hbFJldmVyc2VFbmQgJiYgcmV2ZXJzZVBvaW50c1tkaWFnb25hbCAtIDFdID49IHJldmVyc2VQb2ludHNbZGlhZ29uYWwgKyAxXSkpIHtcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCArIDFdIC0gMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcmlnaW5hbEluZGV4ID0gcmV2ZXJzZVBvaW50c1tkaWFnb25hbCAtIDFdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1vZGlmaWVkSW5kZXggPSBvcmlnaW5hbEluZGV4IC0gKGRpYWdvbmFsIC0gZGlhZ29uYWxSZXZlcnNlQmFzZSkgLSBkaWFnb25hbFJldmVyc2VPZmZzZXQ7XG5cblx0XHRcdFx0Ly8gU2F2ZSB0aGUgY3VycmVudCBvcmlnaW5hbEluZGV4IHNvIHdlIGNhbiB0ZXN0IGZvciBmYWxzZSBvdmVybGFwXG5cdFx0XHRcdGNvbnN0IHRlbXBPcmlnaW5hbEluZGV4ID0gb3JpZ2luYWxJbmRleDtcblxuXHRcdFx0XHQvLyBTVEVQIDI6IFdlIGNhbiBjb250aW51ZSB0byBleHRlbmQgdGhlIGZ1cnRoZXN0IHJlYWNoaW5nIHBvaW50IGluIHRoZSBwcmVzZW50IGRpYWdvbmFsXG5cdFx0XHRcdC8vIGFzIGxvbmcgYXMgdGhlIGVsZW1lbnRzIGFyZSBlcXVhbC5cblx0XHRcdFx0d2hpbGUgKG9yaWdpbmFsSW5kZXggPiBvcmlnaW5hbFN0YXJ0ICYmIG1vZGlmaWVkSW5kZXggPiBtb2RpZmllZFN0YXJ0ICYmIHRoaXMuRWxlbWVudHNBcmVFcXVhbChvcmlnaW5hbEluZGV4LCBtb2RpZmllZEluZGV4KSkge1xuXHRcdFx0XHRcdG9yaWdpbmFsSW5kZXgtLTtcblx0XHRcdFx0XHRtb2RpZmllZEluZGV4LS07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV2ZXJzZVBvaW50c1tkaWFnb25hbF0gPSBvcmlnaW5hbEluZGV4O1xuXG5cdFx0XHRcdC8vIFNURVAgNDogSWYgZGVsdGEgaXMgZXZlbiAob3ZlcmxhcCBmaXJzdCBoYXBwZW5zIG9uIHJldmVyc2Ugd2hlbiBkZWx0YSBpcyBldmVuKVxuXHRcdFx0XHQvLyBhbmQgZGlhZ29uYWwgaXMgaW4gdGhlIHJhbmdlIG9mIGZvcndhcmQgZGlhZ29uYWxzIGNvbXB1dGVkIGZvciBudW1EaWZmZXJlbmNlc1xuXHRcdFx0XHQvLyB0aGVuIGNoZWNrIGZvciBvdmVybGFwLlxuXHRcdFx0XHRpZiAoZGVsdGFJc0V2ZW4gJiYgTWF0aC5hYnMoZGlhZ29uYWwgLSBkaWFnb25hbEZvcndhcmRCYXNlKSA8PSBudW1EaWZmZXJlbmNlcykge1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEluZGV4IDw9IGZvcndhcmRQb2ludHNbZGlhZ29uYWxdKSB7XG5cdFx0XHRcdFx0XHRtaWRPcmlnaW5hbEFyclswXSA9IG9yaWdpbmFsSW5kZXg7XG5cdFx0XHRcdFx0XHRtaWRNb2RpZmllZEFyclswXSA9IG1vZGlmaWVkSW5kZXg7XG5cblx0XHRcdFx0XHRcdGlmICh0ZW1wT3JpZ2luYWxJbmRleCA+PSBmb3J3YXJkUG9pbnRzW2RpYWdvbmFsXSAmJiBMb2NhbENvbnN0YW50cy5NYXhEaWZmZXJlbmNlc0hpc3RvcnkgPiAwICYmIG51bURpZmZlcmVuY2VzIDw9IChMb2NhbENvbnN0YW50cy5NYXhEaWZmZXJlbmNlc0hpc3RvcnkgKyAxKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBCSU5HTyEgV2Ugb3ZlcmxhcHBlZCwgYW5kIHdlIGhhdmUgdGhlIGZ1bGwgdHJhY2UgaW4gbWVtb3J5IVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5XQUxLVFJBQ0UoZGlhZ29uYWxGb3J3YXJkQmFzZSwgZGlhZ29uYWxGb3J3YXJkU3RhcnQsIGRpYWdvbmFsRm9yd2FyZEVuZCwgZGlhZ29uYWxGb3J3YXJkT2Zmc2V0LFxuXHRcdFx0XHRcdFx0XHRcdGRpYWdvbmFsUmV2ZXJzZUJhc2UsIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0LCBkaWFnb25hbFJldmVyc2VFbmQsIGRpYWdvbmFsUmV2ZXJzZU9mZnNldCxcblx0XHRcdFx0XHRcdFx0XHRmb3J3YXJkUG9pbnRzLCByZXZlcnNlUG9pbnRzLFxuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsSW5kZXgsIG9yaWdpbmFsRW5kLCBtaWRPcmlnaW5hbEFycixcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEluZGV4LCBtb2RpZmllZEVuZCwgbWlkTW9kaWZpZWRBcnIsXG5cdFx0XHRcdFx0XHRcdFx0ZGVsdGFJc0V2ZW4sIHF1aXRFYXJseUFyclxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gRWl0aGVyIGZhbHNlIG92ZXJsYXAsIG9yIHdlIGRpZG4ndCBoYXZlIGVub3VnaCBtZW1vcnkgZm9yIHRoZSBmdWxsIHRyYWNlXG5cdFx0XHRcdFx0XHRcdC8vIEp1c3QgcmV0dXJuIHRoZSByZWN1cnNpb24gcG9pbnRcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmUgY3VycmVudCB2ZWN0b3JzIHRvIGhpc3RvcnkgYmVmb3JlIHRoZSBuZXh0IGl0ZXJhdGlvblxuXHRcdFx0aWYgKG51bURpZmZlcmVuY2VzIDw9IExvY2FsQ29uc3RhbnRzLk1heERpZmZlcmVuY2VzSGlzdG9yeSkge1xuXHRcdFx0XHQvLyBXZSBhcmUgYWxsb2NhdGluZyBzcGFjZSBmb3Igb25lIGV4dHJhIGludCwgd2hpY2ggd2UgZmlsbCB3aXRoXG5cdFx0XHRcdC8vIHRoZSBpbmRleCBvZiB0aGUgZGlhZ29uYWwgYmFzZSBpbmRleFxuXHRcdFx0XHRsZXQgdGVtcCA9IG5ldyBJbnQzMkFycmF5KGRpYWdvbmFsRm9yd2FyZEVuZCAtIGRpYWdvbmFsRm9yd2FyZFN0YXJ0ICsgMik7XG5cdFx0XHRcdHRlbXBbMF0gPSBkaWFnb25hbEZvcndhcmRCYXNlIC0gZGlhZ29uYWxGb3J3YXJkU3RhcnQgKyAxO1xuXHRcdFx0XHRNeUFycmF5LkNvcHkyKGZvcndhcmRQb2ludHMsIGRpYWdvbmFsRm9yd2FyZFN0YXJ0LCB0ZW1wLCAxLCBkaWFnb25hbEZvcndhcmRFbmQgLSBkaWFnb25hbEZvcndhcmRTdGFydCArIDEpO1xuXHRcdFx0XHR0aGlzLm1fZm9yd2FyZEhpc3RvcnkucHVzaCh0ZW1wKTtcblxuXHRcdFx0XHR0ZW1wID0gbmV3IEludDMyQXJyYXkoZGlhZ29uYWxSZXZlcnNlRW5kIC0gZGlhZ29uYWxSZXZlcnNlU3RhcnQgKyAyKTtcblx0XHRcdFx0dGVtcFswXSA9IGRpYWdvbmFsUmV2ZXJzZUJhc2UgLSBkaWFnb25hbFJldmVyc2VTdGFydCArIDE7XG5cdFx0XHRcdE15QXJyYXkuQ29weTIocmV2ZXJzZVBvaW50cywgZGlhZ29uYWxSZXZlcnNlU3RhcnQsIHRlbXAsIDEsIGRpYWdvbmFsUmV2ZXJzZUVuZCAtIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0ICsgMSk7XG5cdFx0XHRcdHRoaXMubV9yZXZlcnNlSGlzdG9yeS5wdXNoKHRlbXApO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgZ290IGhlcmUsIHRoZW4gd2UgaGF2ZSB0aGUgZnVsbCB0cmFjZSBpbiBoaXN0b3J5LiBXZSBqdXN0IGhhdmUgdG8gY29udmVydCBpdCB0byBhIGNoYW5nZSBsaXN0XG5cdFx0Ly8gTk9URTogVGhpcyBwYXJ0IGlzIGEgYml0IG1lc3N5XG5cdFx0cmV0dXJuIHRoaXMuV0FMS1RSQUNFKGRpYWdvbmFsRm9yd2FyZEJhc2UsIGRpYWdvbmFsRm9yd2FyZFN0YXJ0LCBkaWFnb25hbEZvcndhcmRFbmQsIGRpYWdvbmFsRm9yd2FyZE9mZnNldCxcblx0XHRcdGRpYWdvbmFsUmV2ZXJzZUJhc2UsIGRpYWdvbmFsUmV2ZXJzZVN0YXJ0LCBkaWFnb25hbFJldmVyc2VFbmQsIGRpYWdvbmFsUmV2ZXJzZU9mZnNldCxcblx0XHRcdGZvcndhcmRQb2ludHMsIHJldmVyc2VQb2ludHMsXG5cdFx0XHRvcmlnaW5hbEluZGV4LCBvcmlnaW5hbEVuZCwgbWlkT3JpZ2luYWxBcnIsXG5cdFx0XHRtb2RpZmllZEluZGV4LCBtb2RpZmllZEVuZCwgbWlkTW9kaWZpZWRBcnIsXG5cdFx0XHRkZWx0YUlzRXZlbiwgcXVpdEVhcmx5QXJyXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaGlmdHMgdGhlIGdpdmVuIGNoYW5nZXMgdG8gcHJvdmlkZSBhIG1vcmUgaW50dWl0aXZlIGRpZmYuXG5cdCAqIFdoaWxlIHRoZSBmaXJzdCBlbGVtZW50IGluIGEgZGlmZiBtYXRjaGVzIHRoZSBmaXJzdCBlbGVtZW50IGFmdGVyIHRoZSBkaWZmLFxuXHQgKiB3ZSBzaGlmdCB0aGUgZGlmZiBkb3duLlxuXHQgKlxuXHQgKiBAcGFyYW0gY2hhbmdlcyBUaGUgbGlzdCBvZiBjaGFuZ2VzIHRvIHNoaWZ0XG5cdCAqIEByZXR1cm5zIFRoZSBzaGlmdGVkIGNoYW5nZXNcblx0ICovXG5cdHByaXZhdGUgUHJldHRpZnlDaGFuZ2VzKGNoYW5nZXM6IERpZmZDaGFuZ2VbXSk6IERpZmZDaGFuZ2VbXSB7XG5cblx0XHQvLyBTaGlmdCBhbGwgdGhlIGNoYW5nZXMgZG93biBmaXJzdFxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gY2hhbmdlc1tpXTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsU3RvcCA9IChpIDwgY2hhbmdlcy5sZW5ndGggLSAxKSA/IGNoYW5nZXNbaSArIDFdLm9yaWdpbmFsU3RhcnQgOiB0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoLmxlbmd0aDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkU3RvcCA9IChpIDwgY2hhbmdlcy5sZW5ndGggLSAxKSA/IGNoYW5nZXNbaSArIDFdLm1vZGlmaWVkU3RhcnQgOiB0aGlzLl9tb2RpZmllZEVsZW1lbnRzT3JIYXNoLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNoZWNrT3JpZ2luYWwgPSBjaGFuZ2Uub3JpZ2luYWxMZW5ndGggPiAwO1xuXHRcdFx0Y29uc3QgY2hlY2tNb2RpZmllZCA9IGNoYW5nZS5tb2RpZmllZExlbmd0aCA+IDA7XG5cblx0XHRcdHdoaWxlIChcblx0XHRcdFx0Y2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBjaGFuZ2Uub3JpZ2luYWxMZW5ndGggPCBvcmlnaW5hbFN0b3Bcblx0XHRcdFx0JiYgY2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGggPCBtb2RpZmllZFN0b3Bcblx0XHRcdFx0JiYgKCFjaGVja09yaWdpbmFsIHx8IHRoaXMuT3JpZ2luYWxFbGVtZW50c0FyZUVxdWFsKGNoYW5nZS5vcmlnaW5hbFN0YXJ0LCBjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCkpXG5cdFx0XHRcdCYmICghY2hlY2tNb2RpZmllZCB8fCB0aGlzLk1vZGlmaWVkRWxlbWVudHNBcmVFcXVhbChjaGFuZ2UubW9kaWZpZWRTdGFydCwgY2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0U3RyaWN0RXF1YWwgPSB0aGlzLkVsZW1lbnRzQXJlU3RyaWN0RXF1YWwoY2hhbmdlLm9yaWdpbmFsU3RhcnQsIGNoYW5nZS5tb2RpZmllZFN0YXJ0KTtcblx0XHRcdFx0Y29uc3QgZW5kU3RyaWN0RXF1YWwgPSB0aGlzLkVsZW1lbnRzQXJlU3RyaWN0RXF1YWwoY2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsIGNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKTtcblx0XHRcdFx0aWYgKGVuZFN0cmljdEVxdWFsICYmICFzdGFydFN0cmljdEVxdWFsKSB7XG5cdFx0XHRcdFx0Ly8gbW92aW5nIHRoZSBjaGFuZ2UgZG93biB3b3VsZCBjcmVhdGUgYW4gZXF1YWwgY2hhbmdlLCBidXQgdGhlIGVsZW1lbnRzIGFyZSBub3Qgc3RyaWN0IGVxdWFsXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hhbmdlLm9yaWdpbmFsU3RhcnQrKztcblx0XHRcdFx0Y2hhbmdlLm1vZGlmaWVkU3RhcnQrKztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWVyZ2VkQ2hhbmdlQXJyOiBBcnJheTxEaWZmQ2hhbmdlIHwgbnVsbD4gPSBbbnVsbF07XG5cdFx0XHRpZiAoaSA8IGNoYW5nZXMubGVuZ3RoIC0gMSAmJiB0aGlzLkNoYW5nZXNPdmVybGFwKGNoYW5nZXNbaV0sIGNoYW5nZXNbaSArIDFdLCBtZXJnZWRDaGFuZ2VBcnIpKSB7XG5cdFx0XHRcdGNoYW5nZXNbaV0gPSBtZXJnZWRDaGFuZ2VBcnJbMF0hO1xuXHRcdFx0XHRjaGFuZ2VzLnNwbGljZShpICsgMSwgMSk7XG5cdFx0XHRcdGktLTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2hpZnQgY2hhbmdlcyBiYWNrIHVwIHVudGlsIHdlIGhpdCBlbXB0eSBvciB3aGl0ZXNwYWNlLW9ubHkgbGluZXNcblx0XHRmb3IgKGxldCBpID0gY2hhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gY2hhbmdlc1tpXTtcblxuXHRcdFx0bGV0IG9yaWdpbmFsU3RvcCA9IDA7XG5cdFx0XHRsZXQgbW9kaWZpZWRTdG9wID0gMDtcblx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHRjb25zdCBwcmV2Q2hhbmdlID0gY2hhbmdlc1tpIC0gMV07XG5cdFx0XHRcdG9yaWdpbmFsU3RvcCA9IHByZXZDaGFuZ2Uub3JpZ2luYWxTdGFydCArIHByZXZDaGFuZ2Uub3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRcdG1vZGlmaWVkU3RvcCA9IHByZXZDaGFuZ2UubW9kaWZpZWRTdGFydCArIHByZXZDaGFuZ2UubW9kaWZpZWRMZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoZWNrT3JpZ2luYWwgPSBjaGFuZ2Uub3JpZ2luYWxMZW5ndGggPiAwO1xuXHRcdFx0Y29uc3QgY2hlY2tNb2RpZmllZCA9IGNoYW5nZS5tb2RpZmllZExlbmd0aCA+IDA7XG5cblx0XHRcdGxldCBiZXN0RGVsdGEgPSAwO1xuXHRcdFx0bGV0IGJlc3RTY29yZSA9IHRoaXMuX2JvdW5kYXJ5U2NvcmUoY2hhbmdlLm9yaWdpbmFsU3RhcnQsIGNoYW5nZS5vcmlnaW5hbExlbmd0aCwgY2hhbmdlLm1vZGlmaWVkU3RhcnQsIGNoYW5nZS5tb2RpZmllZExlbmd0aCk7XG5cblx0XHRcdGZvciAobGV0IGRlbHRhID0gMTsgOyBkZWx0YSsrKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsU3RhcnQgPSBjaGFuZ2Uub3JpZ2luYWxTdGFydCAtIGRlbHRhO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZFN0YXJ0ID0gY2hhbmdlLm1vZGlmaWVkU3RhcnQgLSBkZWx0YTtcblxuXHRcdFx0XHRpZiAob3JpZ2luYWxTdGFydCA8IG9yaWdpbmFsU3RvcCB8fCBtb2RpZmllZFN0YXJ0IDwgbW9kaWZpZWRTdG9wKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2hlY2tPcmlnaW5hbCAmJiAhdGhpcy5PcmlnaW5hbEVsZW1lbnRzQXJlRXF1YWwob3JpZ2luYWxTdGFydCwgb3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCkpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGVja01vZGlmaWVkICYmICF0aGlzLk1vZGlmaWVkRWxlbWVudHNBcmVFcXVhbChtb2RpZmllZFN0YXJ0LCBtb2RpZmllZFN0YXJ0ICsgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdG91Y2hpbmdQcmV2aW91c0NoYW5nZSA9IChvcmlnaW5hbFN0YXJ0ID09PSBvcmlnaW5hbFN0b3AgJiYgbW9kaWZpZWRTdGFydCA9PT0gbW9kaWZpZWRTdG9wKTtcblx0XHRcdFx0Y29uc3Qgc2NvcmUgPSAoXG5cdFx0XHRcdFx0KHRvdWNoaW5nUHJldmlvdXNDaGFuZ2UgPyA1IDogMClcblx0XHRcdFx0XHQrIHRoaXMuX2JvdW5kYXJ5U2NvcmUob3JpZ2luYWxTdGFydCwgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLCBtb2RpZmllZFN0YXJ0LCBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aWYgKHNjb3JlID4gYmVzdFNjb3JlKSB7XG5cdFx0XHRcdFx0YmVzdFNjb3JlID0gc2NvcmU7XG5cdFx0XHRcdFx0YmVzdERlbHRhID0gZGVsdGE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y2hhbmdlLm9yaWdpbmFsU3RhcnQgLT0gYmVzdERlbHRhO1xuXHRcdFx0Y2hhbmdlLm1vZGlmaWVkU3RhcnQgLT0gYmVzdERlbHRhO1xuXG5cdFx0XHRjb25zdCBtZXJnZWRDaGFuZ2VBcnI6IEFycmF5PERpZmZDaGFuZ2UgfCBudWxsPiA9IFtudWxsXTtcblx0XHRcdGlmIChpID4gMCAmJiB0aGlzLkNoYW5nZXNPdmVybGFwKGNoYW5nZXNbaSAtIDFdLCBjaGFuZ2VzW2ldLCBtZXJnZWRDaGFuZ2VBcnIpKSB7XG5cdFx0XHRcdGNoYW5nZXNbaSAtIDFdID0gbWVyZ2VkQ2hhbmdlQXJyWzBdITtcblx0XHRcdFx0Y2hhbmdlcy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdGkrKztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlcmUgY291bGQgYmUgbXVsdGlwbGUgbG9uZ2VzdCBjb21tb24gc3Vic3RyaW5ncy5cblx0XHQvLyBHaXZlIHByZWZlcmVuY2UgdG8gdGhlIG9uZXMgY29udGFpbmluZyBsb25nZXIgbGluZXNcblx0XHRpZiAodGhpcy5faGFzU3RyaW5ncykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDEsIGxlbiA9IGNoYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYUNoYW5nZSA9IGNoYW5nZXNbaSAtIDFdO1xuXHRcdFx0XHRjb25zdCBiQ2hhbmdlID0gY2hhbmdlc1tpXTtcblx0XHRcdFx0Y29uc3QgbWF0Y2hlZExlbmd0aCA9IGJDaGFuZ2Uub3JpZ2luYWxTdGFydCAtIGFDaGFuZ2Uub3JpZ2luYWxTdGFydCAtIGFDaGFuZ2Uub3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRcdGNvbnN0IGFPcmlnaW5hbFN0YXJ0ID0gYUNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0XHRjb25zdCBiT3JpZ2luYWxFbmQgPSBiQ2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBiQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBhYk9yaWdpbmFsTGVuZ3RoID0gYk9yaWdpbmFsRW5kIC0gYU9yaWdpbmFsU3RhcnQ7XG5cdFx0XHRcdGNvbnN0IGFNb2RpZmllZFN0YXJ0ID0gYUNoYW5nZS5tb2RpZmllZFN0YXJ0O1xuXHRcdFx0XHRjb25zdCBiTW9kaWZpZWRFbmQgPSBiQ2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBiQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBhYk1vZGlmaWVkTGVuZ3RoID0gYk1vZGlmaWVkRW5kIC0gYU1vZGlmaWVkU3RhcnQ7XG5cdFx0XHRcdC8vIEF2b2lkIHdhc3RpbmcgYSBsb3Qgb2YgdGltZSB3aXRoIHRoZXNlIHNlYXJjaGVzXG5cdFx0XHRcdGlmIChtYXRjaGVkTGVuZ3RoIDwgNSAmJiBhYk9yaWdpbmFsTGVuZ3RoIDwgMjAgJiYgYWJNb2RpZmllZExlbmd0aCA8IDIwKSB7XG5cdFx0XHRcdFx0Y29uc3QgdCA9IHRoaXMuX2ZpbmRCZXR0ZXJDb250aWd1b3VzU2VxdWVuY2UoXG5cdFx0XHRcdFx0XHRhT3JpZ2luYWxTdGFydCwgYWJPcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0XHRcdGFNb2RpZmllZFN0YXJ0LCBhYk1vZGlmaWVkTGVuZ3RoLFxuXHRcdFx0XHRcdFx0bWF0Y2hlZExlbmd0aFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IFtvcmlnaW5hbE1hdGNoU3RhcnQsIG1vZGlmaWVkTWF0Y2hTdGFydF0gPSB0O1xuXHRcdFx0XHRcdFx0aWYgKG9yaWdpbmFsTWF0Y2hTdGFydCAhPT0gYUNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgYUNoYW5nZS5vcmlnaW5hbExlbmd0aCB8fCBtb2RpZmllZE1hdGNoU3RhcnQgIT09IGFDaGFuZ2UubW9kaWZpZWRTdGFydCArIGFDaGFuZ2UubW9kaWZpZWRMZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0Ly8gc3dpdGNoIHRvIGFub3RoZXIgc2VxdWVuY2UgdGhhdCBoYXMgYSBiZXR0ZXIgc2NvcmVcblx0XHRcdFx0XHRcdFx0YUNoYW5nZS5vcmlnaW5hbExlbmd0aCA9IG9yaWdpbmFsTWF0Y2hTdGFydCAtIGFDaGFuZ2Uub3JpZ2luYWxTdGFydDtcblx0XHRcdFx0XHRcdFx0YUNoYW5nZS5tb2RpZmllZExlbmd0aCA9IG1vZGlmaWVkTWF0Y2hTdGFydCAtIGFDaGFuZ2UubW9kaWZpZWRTdGFydDtcblx0XHRcdFx0XHRcdFx0YkNoYW5nZS5vcmlnaW5hbFN0YXJ0ID0gb3JpZ2luYWxNYXRjaFN0YXJ0ICsgbWF0Y2hlZExlbmd0aDtcblx0XHRcdFx0XHRcdFx0YkNoYW5nZS5tb2RpZmllZFN0YXJ0ID0gbW9kaWZpZWRNYXRjaFN0YXJ0ICsgbWF0Y2hlZExlbmd0aDtcblx0XHRcdFx0XHRcdFx0YkNoYW5nZS5vcmlnaW5hbExlbmd0aCA9IGJPcmlnaW5hbEVuZCAtIGJDaGFuZ2Uub3JpZ2luYWxTdGFydDtcblx0XHRcdFx0XHRcdFx0YkNoYW5nZS5tb2RpZmllZExlbmd0aCA9IGJNb2RpZmllZEVuZCAtIGJDaGFuZ2UubW9kaWZpZWRTdGFydDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRCZXR0ZXJDb250aWd1b3VzU2VxdWVuY2Uob3JpZ2luYWxTdGFydDogbnVtYmVyLCBvcmlnaW5hbExlbmd0aDogbnVtYmVyLCBtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkTGVuZ3RoOiBudW1iZXIsIGRlc2lyZWRMZW5ndGg6IG51bWJlcik6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsIHtcblx0XHRpZiAob3JpZ2luYWxMZW5ndGggPCBkZXNpcmVkTGVuZ3RoIHx8IG1vZGlmaWVkTGVuZ3RoIDwgZGVzaXJlZExlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IG9yaWdpbmFsTWF4ID0gb3JpZ2luYWxTdGFydCArIG9yaWdpbmFsTGVuZ3RoIC0gZGVzaXJlZExlbmd0aCArIDE7XG5cdFx0Y29uc3QgbW9kaWZpZWRNYXggPSBtb2RpZmllZFN0YXJ0ICsgbW9kaWZpZWRMZW5ndGggLSBkZXNpcmVkTGVuZ3RoICsgMTtcblx0XHRsZXQgYmVzdFNjb3JlID0gMDtcblx0XHRsZXQgYmVzdE9yaWdpbmFsU3RhcnQgPSAwO1xuXHRcdGxldCBiZXN0TW9kaWZpZWRTdGFydCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IG9yaWdpbmFsU3RhcnQ7IGkgPCBvcmlnaW5hbE1heDsgaSsrKSB7XG5cdFx0XHRmb3IgKGxldCBqID0gbW9kaWZpZWRTdGFydDsgaiA8IG1vZGlmaWVkTWF4OyBqKyspIHtcblx0XHRcdFx0Y29uc3Qgc2NvcmUgPSB0aGlzLl9jb250aWd1b3VzU2VxdWVuY2VTY29yZShpLCBqLCBkZXNpcmVkTGVuZ3RoKTtcblx0XHRcdFx0aWYgKHNjb3JlID4gMCAmJiBzY29yZSA+IGJlc3RTY29yZSkge1xuXHRcdFx0XHRcdGJlc3RTY29yZSA9IHNjb3JlO1xuXHRcdFx0XHRcdGJlc3RPcmlnaW5hbFN0YXJ0ID0gaTtcblx0XHRcdFx0XHRiZXN0TW9kaWZpZWRTdGFydCA9IGo7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGJlc3RTY29yZSA+IDApIHtcblx0XHRcdHJldHVybiBbYmVzdE9yaWdpbmFsU3RhcnQsIGJlc3RNb2RpZmllZFN0YXJ0XTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9jb250aWd1b3VzU2VxdWVuY2VTY29yZShvcmlnaW5hbFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkU3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBzY29yZSA9IDA7XG5cdFx0Zm9yIChsZXQgbCA9IDA7IGwgPCBsZW5ndGg7IGwrKykge1xuXHRcdFx0aWYgKCF0aGlzLkVsZW1lbnRzQXJlRXF1YWwob3JpZ2luYWxTdGFydCArIGwsIG1vZGlmaWVkU3RhcnQgKyBsKSkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdHNjb3JlICs9IHRoaXMuX29yaWdpbmFsU3RyaW5nRWxlbWVudHNbb3JpZ2luYWxTdGFydCArIGxdLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHNjb3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfT3JpZ2luYWxJc0JvdW5kYXJ5KGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoaW5kZXggPD0gMCB8fCBpbmRleCA+PSB0aGlzLl9vcmlnaW5hbEVsZW1lbnRzT3JIYXNoLmxlbmd0aCAtIDEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX2hhc1N0cmluZ3MgJiYgL15cXHMqJC8udGVzdCh0aGlzLl9vcmlnaW5hbFN0cmluZ0VsZW1lbnRzW2luZGV4XSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfT3JpZ2luYWxSZWdpb25Jc0JvdW5kYXJ5KG9yaWdpbmFsU3RhcnQ6IG51bWJlciwgb3JpZ2luYWxMZW5ndGg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9PcmlnaW5hbElzQm91bmRhcnkob3JpZ2luYWxTdGFydCkgfHwgdGhpcy5fT3JpZ2luYWxJc0JvdW5kYXJ5KG9yaWdpbmFsU3RhcnQgLSAxKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvcmlnaW5hbExlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRW5kID0gb3JpZ2luYWxTdGFydCArIG9yaWdpbmFsTGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMuX09yaWdpbmFsSXNCb3VuZGFyeShvcmlnaW5hbEVuZCAtIDEpIHx8IHRoaXMuX09yaWdpbmFsSXNCb3VuZGFyeShvcmlnaW5hbEVuZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX01vZGlmaWVkSXNCb3VuZGFyeShpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKGluZGV4IDw9IDAgfHwgaW5kZXggPj0gdGhpcy5fbW9kaWZpZWRFbGVtZW50c09ySGFzaC5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGlzLl9oYXNTdHJpbmdzICYmIC9eXFxzKiQvLnRlc3QodGhpcy5fbW9kaWZpZWRTdHJpbmdFbGVtZW50c1tpbmRleF0pKTtcblx0fVxuXG5cdHByaXZhdGUgX01vZGlmaWVkUmVnaW9uSXNCb3VuZGFyeShtb2RpZmllZFN0YXJ0OiBudW1iZXIsIG1vZGlmaWVkTGVuZ3RoOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fTW9kaWZpZWRJc0JvdW5kYXJ5KG1vZGlmaWVkU3RhcnQpIHx8IHRoaXMuX01vZGlmaWVkSXNCb3VuZGFyeShtb2RpZmllZFN0YXJ0IC0gMSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAobW9kaWZpZWRMZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBtb2RpZmllZEVuZCA9IG1vZGlmaWVkU3RhcnQgKyBtb2RpZmllZExlbmd0aDtcblx0XHRcdGlmICh0aGlzLl9Nb2RpZmllZElzQm91bmRhcnkobW9kaWZpZWRFbmQgLSAxKSB8fCB0aGlzLl9Nb2RpZmllZElzQm91bmRhcnkobW9kaWZpZWRFbmQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9ib3VuZGFyeVNjb3JlKG9yaWdpbmFsU3RhcnQ6IG51bWJlciwgb3JpZ2luYWxMZW5ndGg6IG51bWJlciwgbW9kaWZpZWRTdGFydDogbnVtYmVyLCBtb2RpZmllZExlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBvcmlnaW5hbFNjb3JlID0gKHRoaXMuX09yaWdpbmFsUmVnaW9uSXNCb3VuZGFyeShvcmlnaW5hbFN0YXJ0LCBvcmlnaW5hbExlbmd0aCkgPyAxIDogMCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRTY29yZSA9ICh0aGlzLl9Nb2RpZmllZFJlZ2lvbklzQm91bmRhcnkobW9kaWZpZWRTdGFydCwgbW9kaWZpZWRMZW5ndGgpID8gMSA6IDApO1xuXHRcdHJldHVybiAob3JpZ2luYWxTY29yZSArIG1vZGlmaWVkU2NvcmUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbmNhdGVuYXRlcyB0aGUgdHdvIGlucHV0IERpZmZDaGFuZ2UgbGlzdHMgYW5kIHJldHVybnMgdGhlIHJlc3VsdGluZ1xuXHQgKiBsaXN0LlxuXHQgKiBAcGFyYW0gVGhlIGxlZnQgY2hhbmdlc1xuXHQgKiBAcGFyYW0gVGhlIHJpZ2h0IGNoYW5nZXNcblx0ICogQHJldHVybnMgVGhlIGNvbmNhdGVuYXRlZCBsaXN0XG5cdCAqL1xuXHRwcml2YXRlIENvbmNhdGVuYXRlQ2hhbmdlcyhsZWZ0OiBEaWZmQ2hhbmdlW10sIHJpZ2h0OiBEaWZmQ2hhbmdlW10pOiBEaWZmQ2hhbmdlW10ge1xuXHRcdGNvbnN0IG1lcmdlZENoYW5nZUFycjogRGlmZkNoYW5nZVtdID0gW107XG5cblx0XHRpZiAobGVmdC5sZW5ndGggPT09IDAgfHwgcmlnaHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gKHJpZ2h0Lmxlbmd0aCA+IDApID8gcmlnaHQgOiBsZWZ0O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5DaGFuZ2VzT3ZlcmxhcChsZWZ0W2xlZnQubGVuZ3RoIC0gMV0sIHJpZ2h0WzBdLCBtZXJnZWRDaGFuZ2VBcnIpKSB7XG5cdFx0XHQvLyBTaW5jZSB3ZSBicmVhayB0aGUgcHJvYmxlbSBkb3duIHJlY3Vyc2l2ZWx5LCBpdCBpcyBwb3NzaWJsZSB0aGF0IHdlXG5cdFx0XHQvLyBtaWdodCByZWN1cnNlIGluIHRoZSBtaWRkbGUgb2YgYSBjaGFuZ2UgdGhlcmVieSBzcGxpdHRpbmcgaXQgaW50b1xuXHRcdFx0Ly8gdHdvIGNoYW5nZXMuIEhlcmUgaW4gdGhlIGNvbWJpbmluZyBzdGFnZSwgd2UgZGV0ZWN0IGFuZCBmdXNlIHRob3NlXG5cdFx0XHQvLyBjaGFuZ2VzIGJhY2sgdG9nZXRoZXJcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBBcnJheTxEaWZmQ2hhbmdlPihsZWZ0Lmxlbmd0aCArIHJpZ2h0Lmxlbmd0aCAtIDEpO1xuXHRcdFx0TXlBcnJheS5Db3B5KGxlZnQsIDAsIHJlc3VsdCwgMCwgbGVmdC5sZW5ndGggLSAxKTtcblx0XHRcdHJlc3VsdFtsZWZ0Lmxlbmd0aCAtIDFdID0gbWVyZ2VkQ2hhbmdlQXJyWzBdO1xuXHRcdFx0TXlBcnJheS5Db3B5KHJpZ2h0LCAxLCByZXN1bHQsIGxlZnQubGVuZ3RoLCByaWdodC5sZW5ndGggLSAxKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PERpZmZDaGFuZ2U+KGxlZnQubGVuZ3RoICsgcmlnaHQubGVuZ3RoKTtcblx0XHRcdE15QXJyYXkuQ29weShsZWZ0LCAwLCByZXN1bHQsIDAsIGxlZnQubGVuZ3RoKTtcblx0XHRcdE15QXJyYXkuQ29weShyaWdodCwgMCwgcmVzdWx0LCBsZWZ0Lmxlbmd0aCwgcmlnaHQubGVuZ3RoKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB0d28gY2hhbmdlcyBvdmVybGFwIGFuZCBjYW4gYmUgbWVyZ2VkIGludG8gYSBzaW5nbGVcblx0ICogY2hhbmdlXG5cdCAqIEBwYXJhbSBsZWZ0IFRoZSBsZWZ0IGNoYW5nZVxuXHQgKiBAcGFyYW0gcmlnaHQgVGhlIHJpZ2h0IGNoYW5nZVxuXHQgKiBAcGFyYW0gbWVyZ2VkQ2hhbmdlIFRoZSBtZXJnZWQgY2hhbmdlIGlmIHRoZSB0d28gb3ZlcmxhcCwgbnVsbCBvdGhlcndpc2Vcblx0ICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgdHdvIGNoYW5nZXMgb3ZlcmxhcFxuXHQgKi9cblx0cHJpdmF0ZSBDaGFuZ2VzT3ZlcmxhcChsZWZ0OiBEaWZmQ2hhbmdlLCByaWdodDogRGlmZkNoYW5nZSwgbWVyZ2VkQ2hhbmdlQXJyOiBBcnJheTxEaWZmQ2hhbmdlIHwgbnVsbD4pOiBib29sZWFuIHtcblx0XHREZWJ1Zy5Bc3NlcnQobGVmdC5vcmlnaW5hbFN0YXJ0IDw9IHJpZ2h0Lm9yaWdpbmFsU3RhcnQsICdMZWZ0IGNoYW5nZSBpcyBub3QgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHJpZ2h0IGNoYW5nZScpO1xuXHRcdERlYnVnLkFzc2VydChsZWZ0Lm1vZGlmaWVkU3RhcnQgPD0gcmlnaHQubW9kaWZpZWRTdGFydCwgJ0xlZnQgY2hhbmdlIGlzIG5vdCBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gcmlnaHQgY2hhbmdlJyk7XG5cblx0XHRpZiAobGVmdC5vcmlnaW5hbFN0YXJ0ICsgbGVmdC5vcmlnaW5hbExlbmd0aCA+PSByaWdodC5vcmlnaW5hbFN0YXJ0IHx8IGxlZnQubW9kaWZpZWRTdGFydCArIGxlZnQubW9kaWZpZWRMZW5ndGggPj0gcmlnaHQubW9kaWZpZWRTdGFydCkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTdGFydCA9IGxlZnQub3JpZ2luYWxTdGFydDtcblx0XHRcdGxldCBvcmlnaW5hbExlbmd0aCA9IGxlZnQub3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRjb25zdCBtb2RpZmllZFN0YXJ0ID0gbGVmdC5tb2RpZmllZFN0YXJ0O1xuXHRcdFx0bGV0IG1vZGlmaWVkTGVuZ3RoID0gbGVmdC5tb2RpZmllZExlbmd0aDtcblxuXHRcdFx0aWYgKGxlZnQub3JpZ2luYWxTdGFydCArIGxlZnQub3JpZ2luYWxMZW5ndGggPj0gcmlnaHQub3JpZ2luYWxTdGFydCkge1xuXHRcdFx0XHRvcmlnaW5hbExlbmd0aCA9IHJpZ2h0Lm9yaWdpbmFsU3RhcnQgKyByaWdodC5vcmlnaW5hbExlbmd0aCAtIGxlZnQub3JpZ2luYWxTdGFydDtcblx0XHRcdH1cblx0XHRcdGlmIChsZWZ0Lm1vZGlmaWVkU3RhcnQgKyBsZWZ0Lm1vZGlmaWVkTGVuZ3RoID49IHJpZ2h0Lm1vZGlmaWVkU3RhcnQpIHtcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGggPSByaWdodC5tb2RpZmllZFN0YXJ0ICsgcmlnaHQubW9kaWZpZWRMZW5ndGggLSBsZWZ0Lm1vZGlmaWVkU3RhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdG1lcmdlZENoYW5nZUFyclswXSA9IG5ldyBEaWZmQ2hhbmdlKG9yaWdpbmFsU3RhcnQsIG9yaWdpbmFsTGVuZ3RoLCBtb2RpZmllZFN0YXJ0LCBtb2RpZmllZExlbmd0aCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVyZ2VkQ2hhbmdlQXJyWzBdID0gbnVsbDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGVscGVyIG1ldGhvZCB1c2VkIHRvIGNsaXAgYSBkaWFnb25hbCBpbmRleCB0byB0aGUgcmFuZ2Ugb2YgdmFsaWRcblx0ICogZGlhZ29uYWxzLiBUaGlzIGFsc28gZGVjaWRlcyB3aGV0aGVyIG9yIG5vdCB0aGUgZGlhZ29uYWwgaW5kZXgsXG5cdCAqIGlmIGl0IGV4Y2VlZHMgdGhlIGJvdW5kYXJ5LCBzaG91bGQgYmUgY2xpcHBlZCB0byB0aGUgYm91bmRhcnkgb3IgY2xpcHBlZFxuXHQgKiBvbmUgaW5zaWRlIHRoZSBib3VuZGFyeSBkZXBlbmRpbmcgb24gdGhlIEV2ZW4vT2RkIHN0YXR1cyBvZiB0aGUgYm91bmRhcnlcblx0ICogYW5kIG51bURpZmZlcmVuY2VzLlxuXHQgKiBAcGFyYW0gZGlhZ29uYWwgVGhlIGluZGV4IG9mIHRoZSBkaWFnb25hbCB0byBjbGlwLlxuXHQgKiBAcGFyYW0gbnVtRGlmZmVyZW5jZXMgVGhlIGN1cnJlbnQgbnVtYmVyIG9mIGRpZmZlcmVuY2VzIGJlaW5nIGl0ZXJhdGVkIHVwb24uXG5cdCAqIEBwYXJhbSBkaWFnb25hbEJhc2VJbmRleCBUaGUgYmFzZSByZWZlcmVuY2UgZGlhZ29uYWwuXG5cdCAqIEBwYXJhbSBudW1EaWFnb25hbHMgVGhlIHRvdGFsIG51bWJlciBvZiBkaWFnb25hbHMuXG5cdCAqIEByZXR1cm5zIFRoZSBjbGlwcGVkIGRpYWdvbmFsIGluZGV4LlxuXHQgKi9cblx0cHJpdmF0ZSBDbGlwRGlhZ29uYWxCb3VuZChkaWFnb25hbDogbnVtYmVyLCBudW1EaWZmZXJlbmNlczogbnVtYmVyLCBkaWFnb25hbEJhc2VJbmRleDogbnVtYmVyLCBudW1EaWFnb25hbHM6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGRpYWdvbmFsID49IDAgJiYgZGlhZ29uYWwgPCBudW1EaWFnb25hbHMpIHtcblx0XHRcdC8vIE5vdGhpbmcgdG8gY2xpcCwgaXRzIGluIHJhbmdlXG5cdFx0XHRyZXR1cm4gZGlhZ29uYWw7XG5cdFx0fVxuXG5cdFx0Ly8gZGlhZ29uYWxzQmVsb3c6IFRoZSBudW1iZXIgb2YgZGlhZ29uYWxzIGJlbG93IHRoZSByZWZlcmVuY2UgZGlhZ29uYWxcblx0XHQvLyBkaWFnb25hbHNBYm92ZTogVGhlIG51bWJlciBvZiBkaWFnb25hbHMgYWJvdmUgdGhlIHJlZmVyZW5jZSBkaWFnb25hbFxuXHRcdGNvbnN0IGRpYWdvbmFsc0JlbG93ID0gZGlhZ29uYWxCYXNlSW5kZXg7XG5cdFx0Y29uc3QgZGlhZ29uYWxzQWJvdmUgPSBudW1EaWFnb25hbHMgLSBkaWFnb25hbEJhc2VJbmRleCAtIDE7XG5cdFx0Y29uc3QgZGlmZkV2ZW4gPSAobnVtRGlmZmVyZW5jZXMgJSAyID09PSAwKTtcblxuXHRcdGlmIChkaWFnb25hbCA8IDApIHtcblx0XHRcdGNvbnN0IGxvd2VyQm91bmRFdmVuID0gKGRpYWdvbmFsc0JlbG93ICUgMiA9PT0gMCk7XG5cdFx0XHRyZXR1cm4gKGRpZmZFdmVuID09PSBsb3dlckJvdW5kRXZlbikgPyAwIDogMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXBwZXJCb3VuZEV2ZW4gPSAoZGlhZ29uYWxzQWJvdmUgJSAyID09PSAwKTtcblx0XHRcdHJldHVybiAoZGlmZkV2ZW4gPT09IHVwcGVyQm91bmRFdmVuKSA/IG51bURpYWdvbmFscyAtIDEgOiBudW1EaWFnb25hbHMgLSAyO1xuXHRcdH1cblx0fVxufVxuXG5cbi8qKlxuICogUHJlY29tcHV0ZWQgZXF1YWxpdHkgYXJyYXkgZm9yIGNoYXJhY3RlciBjb2Rlcy5cbiAqL1xuY29uc3QgcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5ID0gbmV3IFVpbnQzMkFycmF5KDB4MTAwMDApO1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBMZXZlbnNodGVpbiBkaXN0YW5jZSBmb3Igc3RyaW5ncyBvZiBsZW5ndGggPD0gMzIuXG4gKiBAcGFyYW0gZmlyc3RTdHJpbmcgLSBUaGUgZmlyc3Qgc3RyaW5nLlxuICogQHBhcmFtIHNlY29uZFN0cmluZyAtIFRoZSBzZWNvbmQgc3RyaW5nLlxuICogQHJldHVybnMgVGhlIExldmVuc2h0ZWluIGRpc3RhbmNlLlxuICovXG5jb25zdCBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZUZvclNob3J0U3RyaW5ncyA9IChmaXJzdFN0cmluZzogc3RyaW5nLCBzZWNvbmRTdHJpbmc6IHN0cmluZyk6IG51bWJlciA9PiB7XG5cdGNvbnN0IGZpcnN0U3RyaW5nTGVuZ3RoID0gZmlyc3RTdHJpbmcubGVuZ3RoO1xuXHRjb25zdCBzZWNvbmRTdHJpbmdMZW5ndGggPSBzZWNvbmRTdHJpbmcubGVuZ3RoO1xuXHRjb25zdCBsYXN0Qml0TWFzayA9IDEgPDwgKGZpcnN0U3RyaW5nTGVuZ3RoIC0gMSk7XG5cdGxldCBwb3NpdGl2ZVZlY3RvciA9IC0xO1xuXHRsZXQgbmVnYXRpdmVWZWN0b3IgPSAwO1xuXHRsZXQgZGlzdGFuY2UgPSBmaXJzdFN0cmluZ0xlbmd0aDtcblx0bGV0IGluZGV4ID0gZmlyc3RTdHJpbmdMZW5ndGg7XG5cblx0Ly8gSW5pdGlhbGl6ZSBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXkgZm9yIGZpcnN0U3RyaW5nXG5cdHdoaWxlIChpbmRleC0tKSB7XG5cdFx0cHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5W2ZpcnN0U3RyaW5nLmNoYXJDb2RlQXQoaW5kZXgpXSB8PSAxIDw8IGluZGV4O1xuXHR9XG5cblx0Ly8gUHJvY2VzcyBlYWNoIGNoYXJhY3RlciBvZiBzZWNvbmRTdHJpbmdcblx0Zm9yIChpbmRleCA9IDA7IGluZGV4IDwgc2Vjb25kU3RyaW5nTGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0bGV0IGVxdWFsaXR5TWFzayA9IHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtzZWNvbmRTdHJpbmcuY2hhckNvZGVBdChpbmRleCldO1xuXHRcdGNvbnN0IGNvbWJpbmVkVmVjdG9yID0gZXF1YWxpdHlNYXNrIHwgbmVnYXRpdmVWZWN0b3I7XG5cdFx0ZXF1YWxpdHlNYXNrIHw9ICgoZXF1YWxpdHlNYXNrICYgcG9zaXRpdmVWZWN0b3IpICsgcG9zaXRpdmVWZWN0b3IpIF4gcG9zaXRpdmVWZWN0b3I7XG5cdFx0bmVnYXRpdmVWZWN0b3IgfD0gfihlcXVhbGl0eU1hc2sgfCBwb3NpdGl2ZVZlY3Rvcik7XG5cdFx0cG9zaXRpdmVWZWN0b3IgJj0gZXF1YWxpdHlNYXNrO1xuXHRcdGlmIChuZWdhdGl2ZVZlY3RvciAmIGxhc3RCaXRNYXNrKSB7XG5cdFx0XHRkaXN0YW5jZSsrO1xuXHRcdH1cblx0XHRpZiAocG9zaXRpdmVWZWN0b3IgJiBsYXN0Qml0TWFzaykge1xuXHRcdFx0ZGlzdGFuY2UtLTtcblx0XHR9XG5cdFx0bmVnYXRpdmVWZWN0b3IgPSAobmVnYXRpdmVWZWN0b3IgPDwgMSkgfCAxO1xuXHRcdHBvc2l0aXZlVmVjdG9yID0gKHBvc2l0aXZlVmVjdG9yIDw8IDEpIHwgfihjb21iaW5lZFZlY3RvciB8IG5lZ2F0aXZlVmVjdG9yKTtcblx0XHRuZWdhdGl2ZVZlY3RvciAmPSBjb21iaW5lZFZlY3Rvcjtcblx0fVxuXG5cdC8vIFJlc2V0IHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVxuXHRpbmRleCA9IGZpcnN0U3RyaW5nTGVuZ3RoO1xuXHR3aGlsZSAoaW5kZXgtLSkge1xuXHRcdHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtmaXJzdFN0cmluZy5jaGFyQ29kZUF0KGluZGV4KV0gPSAwO1xuXHR9XG5cblx0cmV0dXJuIGRpc3RhbmNlO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgTGV2ZW5zaHRlaW4gZGlzdGFuY2UgZm9yIHN0cmluZ3Mgb2YgbGVuZ3RoID4gMzIuXG4gKiBAcGFyYW0gZmlyc3RTdHJpbmcgLSBUaGUgZmlyc3Qgc3RyaW5nLlxuICogQHBhcmFtIHNlY29uZFN0cmluZyAtIFRoZSBzZWNvbmQgc3RyaW5nLlxuICogQHJldHVybnMgVGhlIExldmVuc2h0ZWluIGRpc3RhbmNlLlxuICovXG5mdW5jdGlvbiBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZUZvckxvbmdTdHJpbmdzKGZpcnN0U3RyaW5nOiBzdHJpbmcsIHNlY29uZFN0cmluZzogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgZmlyc3RTdHJpbmdMZW5ndGggPSBmaXJzdFN0cmluZy5sZW5ndGg7XG5cdGNvbnN0IHNlY29uZFN0cmluZ0xlbmd0aCA9IHNlY29uZFN0cmluZy5sZW5ndGg7XG5cdGNvbnN0IGhvcml6b250YWxCaXRBcnJheSA9IFtdO1xuXHRjb25zdCB2ZXJ0aWNhbEJpdEFycmF5ID0gW107XG5cdGNvbnN0IGhvcml6b250YWxTaXplID0gTWF0aC5jZWlsKGZpcnN0U3RyaW5nTGVuZ3RoIC8gMzIpO1xuXHRjb25zdCB2ZXJ0aWNhbFNpemUgPSBNYXRoLmNlaWwoc2Vjb25kU3RyaW5nTGVuZ3RoIC8gMzIpO1xuXG5cdC8vIEluaXRpYWxpemUgaG9yaXpvbnRhbCBhbmQgdmVydGljYWwgYml0IGFycmF5c1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGhvcml6b250YWxTaXplOyBpKyspIHtcblx0XHRob3Jpem9udGFsQml0QXJyYXlbaV0gPSAtMTtcblx0XHR2ZXJ0aWNhbEJpdEFycmF5W2ldID0gMDtcblx0fVxuXG5cdGxldCB2ZXJ0aWNhbEluZGV4ID0gMDtcblx0Zm9yICg7IHZlcnRpY2FsSW5kZXggPCB2ZXJ0aWNhbFNpemUgLSAxOyB2ZXJ0aWNhbEluZGV4KyspIHtcblx0XHRsZXQgbmVnYXRpdmVWZWN0b3IgPSAwO1xuXHRcdGxldCBwb3NpdGl2ZVZlY3RvciA9IC0xO1xuXHRcdGNvbnN0IHN0YXJ0ID0gdmVydGljYWxJbmRleCAqIDMyO1xuXHRcdGNvbnN0IHZlcnRpY2FsTGVuZ3RoID0gTWF0aC5taW4oMzIsIHNlY29uZFN0cmluZ0xlbmd0aCkgKyBzdGFydDtcblxuXHRcdC8vIEluaXRpYWxpemUgcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5IGZvciBzZWNvbmRTdHJpbmdcblx0XHRmb3IgKGxldCBrID0gc3RhcnQ7IGsgPCB2ZXJ0aWNhbExlbmd0aDsgaysrKSB7XG5cdFx0XHRwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbc2Vjb25kU3RyaW5nLmNoYXJDb2RlQXQoayldIHw9IDEgPDwgaztcblx0XHR9XG5cblx0XHQvLyBQcm9jZXNzIGVhY2ggY2hhcmFjdGVyIG9mIGZpcnN0U3RyaW5nXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaXJzdFN0cmluZ0xlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlcXVhbGl0eU1hc2sgPSBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbZmlyc3RTdHJpbmcuY2hhckNvZGVBdChpKV07XG5cdFx0XHRjb25zdCBwcmV2aW91c0JpdCA9IChob3Jpem9udGFsQml0QXJyYXlbKGkgLyAzMikgfCAwXSA+Pj4gaSkgJiAxO1xuXHRcdFx0Y29uc3QgbWF0Y2hCaXQgPSAodmVydGljYWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdID4+PiBpKSAmIDE7XG5cdFx0XHRjb25zdCBjb21iaW5lZFZlY3RvciA9IGVxdWFsaXR5TWFzayB8IG5lZ2F0aXZlVmVjdG9yO1xuXHRcdFx0Y29uc3QgY29tYmluZWRIb3Jpem9udGFsVmVjdG9yID0gKCgoKGVxdWFsaXR5TWFzayB8IG1hdGNoQml0KSAmIHBvc2l0aXZlVmVjdG9yKSArIHBvc2l0aXZlVmVjdG9yKSBeIHBvc2l0aXZlVmVjdG9yKSB8IGVxdWFsaXR5TWFzayB8IG1hdGNoQml0O1xuXHRcdFx0bGV0IHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA9IG5lZ2F0aXZlVmVjdG9yIHwgfihjb21iaW5lZEhvcml6b250YWxWZWN0b3IgfCBwb3NpdGl2ZVZlY3Rvcik7XG5cdFx0XHRsZXQgbmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yID0gcG9zaXRpdmVWZWN0b3IgJiBjb21iaW5lZEhvcml6b250YWxWZWN0b3I7XG5cdFx0XHRpZiAoKHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA+Pj4gMzEpIF4gcHJldmlvdXNCaXQpIHtcblx0XHRcdFx0aG9yaXpvbnRhbEJpdEFycmF5WyhpIC8gMzIpIHwgMF0gXj0gMSA8PCBpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKChuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPj4+IDMxKSBeIG1hdGNoQml0KSB7XG5cdFx0XHRcdHZlcnRpY2FsQml0QXJyYXlbKGkgLyAzMikgfCAwXSBePSAxIDw8IGk7XG5cdFx0XHR9XG5cdFx0XHRwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgPSAocG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yIDw8IDEpIHwgcHJldmlvdXNCaXQ7XG5cdFx0XHRuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPSAobmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yIDw8IDEpIHwgbWF0Y2hCaXQ7XG5cdFx0XHRwb3NpdGl2ZVZlY3RvciA9IG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciB8IH4oY29tYmluZWRWZWN0b3IgfCBwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IpO1xuXHRcdFx0bmVnYXRpdmVWZWN0b3IgPSBwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgJiBjb21iaW5lZFZlY3Rvcjtcblx0XHR9XG5cblx0XHQvLyBSZXNldCBwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlcblx0XHRmb3IgKGxldCBrID0gc3RhcnQ7IGsgPCB2ZXJ0aWNhbExlbmd0aDsgaysrKSB7XG5cdFx0XHRwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbc2Vjb25kU3RyaW5nLmNoYXJDb2RlQXQoayldID0gMDtcblx0XHR9XG5cdH1cblxuXHRsZXQgbmVnYXRpdmVWZWN0b3IgPSAwO1xuXHRsZXQgcG9zaXRpdmVWZWN0b3IgPSAtMTtcblx0Y29uc3Qgc3RhcnQgPSB2ZXJ0aWNhbEluZGV4ICogMzI7XG5cdGNvbnN0IHZlcnRpY2FsTGVuZ3RoID0gTWF0aC5taW4oMzIsIHNlY29uZFN0cmluZ0xlbmd0aCAtIHN0YXJ0KSArIHN0YXJ0O1xuXG5cdC8vIEluaXRpYWxpemUgcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5IGZvciBzZWNvbmRTdHJpbmdcblx0Zm9yIChsZXQgayA9IHN0YXJ0OyBrIDwgdmVydGljYWxMZW5ndGg7IGsrKykge1xuXHRcdHByZWNvbXB1dGVkRXF1YWxpdHlBcnJheVtzZWNvbmRTdHJpbmcuY2hhckNvZGVBdChrKV0gfD0gMSA8PCBrO1xuXHR9XG5cblx0bGV0IGRpc3RhbmNlID0gc2Vjb25kU3RyaW5nTGVuZ3RoO1xuXG5cdC8vIFByb2Nlc3MgZWFjaCBjaGFyYWN0ZXIgb2YgZmlyc3RTdHJpbmdcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaXJzdFN0cmluZ0xlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgZXF1YWxpdHlNYXNrID0gcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5W2ZpcnN0U3RyaW5nLmNoYXJDb2RlQXQoaSldO1xuXHRcdGNvbnN0IHByZXZpb3VzQml0ID0gKGhvcml6b250YWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdID4+PiBpKSAmIDE7XG5cdFx0Y29uc3QgbWF0Y2hCaXQgPSAodmVydGljYWxCaXRBcnJheVsoaSAvIDMyKSB8IDBdID4+PiBpKSAmIDE7XG5cdFx0Y29uc3QgY29tYmluZWRWZWN0b3IgPSBlcXVhbGl0eU1hc2sgfCBuZWdhdGl2ZVZlY3Rvcjtcblx0XHRjb25zdCBjb21iaW5lZEhvcml6b250YWxWZWN0b3IgPSAoKCgoZXF1YWxpdHlNYXNrIHwgbWF0Y2hCaXQpICYgcG9zaXRpdmVWZWN0b3IpICsgcG9zaXRpdmVWZWN0b3IpIF4gcG9zaXRpdmVWZWN0b3IpIHwgZXF1YWxpdHlNYXNrIHwgbWF0Y2hCaXQ7XG5cdFx0bGV0IHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA9IG5lZ2F0aXZlVmVjdG9yIHwgfihjb21iaW5lZEhvcml6b250YWxWZWN0b3IgfCBwb3NpdGl2ZVZlY3Rvcik7XG5cdFx0bGV0IG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA9IHBvc2l0aXZlVmVjdG9yICYgY29tYmluZWRIb3Jpem9udGFsVmVjdG9yO1xuXHRcdGRpc3RhbmNlICs9IChwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgPj4+IChzZWNvbmRTdHJpbmdMZW5ndGggLSAxKSkgJiAxO1xuXHRcdGRpc3RhbmNlIC09IChuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPj4+IChzZWNvbmRTdHJpbmdMZW5ndGggLSAxKSkgJiAxO1xuXHRcdGlmICgocG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yID4+PiAzMSkgXiBwcmV2aW91c0JpdCkge1xuXHRcdFx0aG9yaXpvbnRhbEJpdEFycmF5WyhpIC8gMzIpIHwgMF0gXj0gMSA8PCBpO1xuXHRcdH1cblx0XHRpZiAoKG5lZ2F0aXZlSG9yaXpvbnRhbFZlY3RvciA+Pj4gMzEpIF4gbWF0Y2hCaXQpIHtcblx0XHRcdHZlcnRpY2FsQml0QXJyYXlbKGkgLyAzMikgfCAwXSBePSAxIDw8IGk7XG5cdFx0fVxuXHRcdHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciA9IChwb3NpdGl2ZUhvcml6b250YWxWZWN0b3IgPDwgMSkgfCBwcmV2aW91c0JpdDtcblx0XHRuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgPSAobmVnYXRpdmVIb3Jpem9udGFsVmVjdG9yIDw8IDEpIHwgbWF0Y2hCaXQ7XG5cdFx0cG9zaXRpdmVWZWN0b3IgPSBuZWdhdGl2ZUhvcml6b250YWxWZWN0b3IgfCB+KGNvbWJpbmVkVmVjdG9yIHwgcG9zaXRpdmVIb3Jpem9udGFsVmVjdG9yKTtcblx0XHRuZWdhdGl2ZVZlY3RvciA9IHBvc2l0aXZlSG9yaXpvbnRhbFZlY3RvciAmIGNvbWJpbmVkVmVjdG9yO1xuXHR9XG5cblx0Ly8gUmVzZXQgcHJlY29tcHV0ZWRFcXVhbGl0eUFycmF5XG5cdGZvciAobGV0IGsgPSBzdGFydDsgayA8IHZlcnRpY2FsTGVuZ3RoOyBrKyspIHtcblx0XHRwcmVjb21wdXRlZEVxdWFsaXR5QXJyYXlbc2Vjb25kU3RyaW5nLmNoYXJDb2RlQXQoayldID0gMDtcblx0fVxuXG5cdHJldHVybiBkaXN0YW5jZTtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgTGV2ZW5zaHRlaW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gc3RyaW5ncy5cbiAqIEBwYXJhbSBmaXJzdFN0cmluZyAtIFRoZSBmaXJzdCBzdHJpbmcuXG4gKiBAcGFyYW0gc2Vjb25kU3RyaW5nIC0gVGhlIHNlY29uZCBzdHJpbmcuXG4gKiBAcmV0dXJucyBUaGUgTGV2ZW5zaHRlaW4gZGlzdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZShmaXJzdFN0cmluZzogc3RyaW5nLCBzZWNvbmRTdHJpbmc6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmIChmaXJzdFN0cmluZy5sZW5ndGggPCBzZWNvbmRTdHJpbmcubGVuZ3RoKSB7XG5cdFx0Y29uc3QgdGVtcCA9IHNlY29uZFN0cmluZztcblx0XHRzZWNvbmRTdHJpbmcgPSBmaXJzdFN0cmluZztcblx0XHRmaXJzdFN0cmluZyA9IHRlbXA7XG5cdH1cblx0aWYgKHNlY29uZFN0cmluZy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmlyc3RTdHJpbmcubGVuZ3RoO1xuXHR9XG5cdGlmIChmaXJzdFN0cmluZy5sZW5ndGggPD0gMzIpIHtcblx0XHRyZXR1cm4gY29tcHV0ZUxldmVuc2h0ZWluRGlzdGFuY2VGb3JTaG9ydFN0cmluZ3MoZmlyc3RTdHJpbmcsIHNlY29uZFN0cmluZyk7XG5cdH1cblx0cmV0dXJuIGNvbXB1dGVMZXZlbnNodGVpbkRpc3RhbmNlRm9yTG9uZ1N0cmluZ3MoZmlyc3RTdHJpbmcsIHNlY29uZFN0cmluZyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUVuQixNQUFNLG1CQUF3QztBQUFBLEVBRXBELFlBQW9CLFFBQWdCO0FBQWhCO0FBQUEsRUFBa0I7QUFBQSxFQUV0QyxjQUFnRDtBQUMvQyxVQUFNLFNBQVMsS0FBSztBQUNwQixVQUFNLGFBQWEsSUFBSSxXQUFXLE9BQU8sTUFBTTtBQUMvQyxhQUFTLElBQUksR0FBRyxNQUFNLE9BQU8sUUFBUSxJQUFJLEtBQUssS0FBSztBQUNsRCxpQkFBVyxDQUFDLElBQUksT0FBTyxXQUFXLENBQUM7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxTQUFTLFdBQVcsVUFBa0IsVUFBa0IsUUFBZ0M7QUFDOUYsU0FBTyxJQUFJLFFBQVEsSUFBSSxtQkFBbUIsUUFBUSxHQUFHLElBQUksbUJBQW1CLFFBQVEsQ0FBQyxFQUFFLFlBQVksTUFBTSxFQUFFO0FBQzVHO0FBOENBLE1BQU0sTUFBTTtBQUFBLEVBRVgsT0FBYyxPQUFPLFdBQW9CLFNBQXVCO0FBQy9ELFFBQUksQ0FB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aUJBQWlCO0FBQ3JCLFFBQU0sUUFBUSxnQkFBZ0I7QUFDOUIsUUFBTSxpQkFBaUIsS0FBSyxJQUFJLElBQUkscUJBQXFCLEtBQUssSUFBSTtBQUdsRSxXQUFTLElBQUksT0FBTyxJQUFJLGdCQUFnQixLQUFLO0FBQzVDLDZCQUF5QixhQUFhLFdBQVcsQ0FBQyxDQUFDLEtBQUssS0FBSztBQUFBLEVBQzlEO0FBRUEsTUFBSSxXQUFXO0FBR2YsV0FBUyxJQUFJLEdBQUcsSUFBSSxtQkFBbUIsS0FBSztBQUMzQyxVQUFNLGVBQWUseUJBQXlCLFlBQVksV0FBVyxDQUFDLENBQUM7QUFDdkUsVUFBTSxjQUFlLG1CQUFvQixJQUFJLEtBQU0sQ0FBQyxNQUFNLElBQUs7QUFDL0QsVUFBTSxXQUFZLGlCQUFrQixJQUFJLEtBQU0sQ0FBQyxNQUFNLElBQUs7QUFDMUQsVUFBTSxpQkFBaUIsZUFBZTtBQUN0QyxVQUFNLDZCQUErQixlQUFlLFlBQVksa0JBQWtCLGlCQUFrQixpQkFBa0IsZUFBZTtBQUNySSxRQUFJLDJCQUEyQixpQkFBaUIsRUFBRSwyQkFBMkI7QUFDN0UsUUFBSSwyQkFBMkIsaUJBQWlCO0FBQ2hELGdCQUFhLDZCQUE4QixxQkFBcUIsSUFBTTtBQUN0RSxnQkFBYSw2QkFBOEIscUJBQXFCLElBQU07QUFDdEUsUUFBSyw2QkFBNkIsS0FBTSxhQUFhO0FBQ3BELHlCQUFvQixJQUFJLEtBQU0sQ0FBQyxLQUFLLEtBQUs7QUFBQSxJQUMxQztBQUNBLFFBQUssNkJBQTZCLEtBQU0sVUFBVTtBQUNqRCx1QkFBa0IsSUFBSSxLQUFNLENBQUMsS0FBSyxLQUFLO0FBQUEsSUFDeEM7QUFDQSwrQkFBNEIsNEJBQTRCLElBQUs7QUFDN0QsK0JBQTRCLDRCQUE0QixJQUFLO0FBQzdELHFCQUFpQiwyQkFBMkIsRUFBRSxpQkFBaUI7QUFDL0QscUJBQWlCLDJCQUEyQjtBQUFBLEVBQzdDO0FBR0EsV0FBUyxJQUFJLE9BQU8sSUFBSSxnQkFBZ0IsS0FBSztBQUM1Qyw2QkFBeUIsYUFBYSxXQUFXLENBQUMsQ0FBQyxJQUFJO0FBQUEsRUFDeEQ7QUFFQSxTQUFPO0FBQ1I7QUFRTyxTQUFTLDJCQUEyQixhQUFxQixjQUE4QjtBQUM3RixNQUFJLFlBQVksU0FBUyxhQUFhLFFBQVE7QUFDN0MsVUFBTSxPQUFPO0FBQ2IsbUJBQWU7QUFDZixrQkFBYztBQUFBLEVBQ2Y7QUFDQSxNQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzlCLFdBQU8sWUFBWTtBQUFBLEVBQ3BCO0FBQ0EsTUFBSSxZQUFZLFVBQVUsSUFBSTtBQUM3QixXQUFPLDBDQUEwQyxhQUFhLFlBQVk7QUFBQSxFQUMzRTtBQUNBLFNBQU8seUNBQXlDLGFBQWEsWUFBWTtBQUMxRTsiLAogICJuYW1lcyI6IFsiTG9jYWxDb25zdGFudHMiLCAibmVnYXRpdmVWZWN0b3IiLCAicG9zaXRpdmVWZWN0b3IiLCAic3RhcnQiLCAidmVydGljYWxMZW5ndGgiXQp9Cg==
