import { binarySearch2 } from "../../../base/common/arrays.js";
import { intersection } from "../../../base/common/collections.js";
import { EditorOption } from "../config/editorOptions.js";
var PendingChangeKind = /* @__PURE__ */ ((PendingChangeKind2) => {
  PendingChangeKind2[PendingChangeKind2["InsertOrChange"] = 0] = "InsertOrChange";
  PendingChangeKind2[PendingChangeKind2["Remove"] = 1] = "Remove";
  PendingChangeKind2[PendingChangeKind2["LinesDeleted"] = 2] = "LinesDeleted";
  PendingChangeKind2[PendingChangeKind2["LinesInserted"] = 3] = "LinesInserted";
  return PendingChangeKind2;
})(PendingChangeKind || {});
class CustomLine {
  constructor(decorationId, index, lineNumber, specialHeight, prefixSum) {
    this.decorationId = decorationId;
    this.index = index;
    this.lineNumber = lineNumber;
    this.specialHeight = specialHeight;
    this.prefixSum = prefixSum;
    this.maximumSpecialHeight = specialHeight;
    this.deleted = false;
  }
}
class LineHeightsManager {
  constructor(defaultLineHeight, customLineHeightData) {
    this._decorationIDToCustomLine = new ArrayMap();
    this._orderedCustomLines = [];
    this._pendingChanges = [];
    this._invalidIndex = Infinity;
    this._hasPending = false;
    this._defaultLineHeight = defaultLineHeight;
    for (const data of customLineHeightData) {
      this.insertOrChangeCustomLineHeight(data.decorationId, data.startLineNumber, data.endLineNumber, data.lineHeight);
    }
  }
  set defaultLineHeight(defaultLineHeight) {
    this._defaultLineHeight = defaultLineHeight;
  }
  get defaultLineHeight() {
    return this._defaultLineHeight;
  }
  removeCustomLineHeight(decorationID) {
    this._pendingChanges.push({ kind: 1 /* Remove */, decorationId: decorationID });
    this._hasPending = true;
  }
  insertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight) {
    this._pendingChanges.push({ kind: 0 /* InsertOrChange */, decorationId, startLineNumber, endLineNumber, lineHeight });
    this._hasPending = true;
  }
  heightForLineNumber(lineNumber) {
    this._commit();
    const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
    if (searchIndex >= 0) {
      return this._orderedCustomLines[searchIndex].maximumSpecialHeight;
    }
    return this._defaultLineHeight;
  }
  getAccumulatedLineHeightsIncludingLineNumber(lineNumber) {
    this._commit();
    const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
    if (searchIndex >= 0) {
      return this._orderedCustomLines[searchIndex].prefixSum + this._orderedCustomLines[searchIndex].maximumSpecialHeight;
    }
    if (searchIndex === -1) {
      return this._defaultLineHeight * lineNumber;
    }
    const modifiedIndex = -(searchIndex + 1);
    const previousSpecialLine = this._orderedCustomLines[modifiedIndex - 1];
    return previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
  }
  onLinesDeleted(fromLineNumber, toLineNumber) {
    this._pendingChanges.push({ kind: 2 /* LinesDeleted */, fromLineNumber, toLineNumber });
    this._hasPending = true;
  }
  onLinesInserted(fromLineNumber, toLineNumber) {
    this._pendingChanges.push({ kind: 3 /* LinesInserted */, fromLineNumber, toLineNumber });
    this._hasPending = true;
  }
  _commit() {
    if (!this._hasPending) {
      return;
    }
    const changes = this._pendingChanges;
    this._pendingChanges = [];
    this._hasPending = false;
    const stagedInserts = [];
    const stagedIdMap = new ArrayMap();
    for (const change of changes) {
      switch (change.kind) {
        case 1 /* Remove */:
          this._doRemoveCustomLineHeight(change.decorationId, stagedIdMap);
          break;
        case 0 /* InsertOrChange */:
          this._doInsertOrChangeCustomLineHeight(change.decorationId, change.startLineNumber, change.endLineNumber, change.lineHeight, stagedInserts, stagedIdMap);
          break;
        case 2 /* LinesDeleted */:
          this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
          this._doLinesDeleted(change.fromLineNumber, change.toLineNumber);
          break;
        case 3 /* LinesInserted */:
          this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
          this._doLinesInserted(change.fromLineNumber, change.toLineNumber, stagedInserts, stagedIdMap);
          break;
      }
    }
    this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
  }
  _doRemoveCustomLineHeight(decorationID, stagedIdMap) {
    const customLines = this._decorationIDToCustomLine.get(decorationID);
    if (customLines) {
      this._decorationIDToCustomLine.delete(decorationID);
      for (const customLine of customLines) {
        customLine.deleted = true;
        this._invalidIndex = Math.min(this._invalidIndex, customLine.index);
      }
    }
    const stagedLines = stagedIdMap.get(decorationID);
    if (stagedLines) {
      stagedIdMap.delete(decorationID);
      for (const line of stagedLines) {
        line.deleted = true;
      }
    }
  }
  _doInsertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight, stagedInserts, stagedIdMap) {
    this._doRemoveCustomLineHeight(decorationId, stagedIdMap);
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const customLine = new CustomLine(decorationId, -1, lineNumber, lineHeight, 0);
      stagedInserts.push(customLine);
      stagedIdMap.add(decorationId, customLine);
    }
  }
  _flushStagedDecorationChanges(stagedInserts, stagedIdMap) {
    if (stagedInserts.length === 0 && this._invalidIndex === Infinity) {
      return;
    }
    for (const pendingChange of stagedInserts) {
      if (pendingChange.deleted) {
        continue;
      }
      const candidateInsertionIndex = this._binarySearchOverOrderedCustomLinesArray(pendingChange.lineNumber);
      const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
      this._orderedCustomLines.splice(insertionIndex, 0, pendingChange);
      this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
    }
    stagedInserts.length = 0;
    stagedIdMap.clear();
    if (this._invalidIndex === Infinity) {
      return;
    }
    const newDecorationIDToSpecialLine = new ArrayMap();
    const newOrderedSpecialLines = [];
    for (let i = 0; i < this._invalidIndex; i++) {
      const customLine = this._orderedCustomLines[i];
      newOrderedSpecialLines.push(customLine);
      newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
    }
    let numberOfDeletions = 0;
    let previousSpecialLine = this._invalidIndex > 0 ? newOrderedSpecialLines[this._invalidIndex - 1] : void 0;
    for (let i = this._invalidIndex; i < this._orderedCustomLines.length; i++) {
      const customLine = this._orderedCustomLines[i];
      if (customLine.deleted) {
        numberOfDeletions++;
        continue;
      }
      customLine.index = i - numberOfDeletions;
      if (previousSpecialLine && previousSpecialLine.lineNumber === customLine.lineNumber) {
        customLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
        customLine.prefixSum = previousSpecialLine.prefixSum;
      } else {
        let maximumSpecialHeight = customLine.specialHeight;
        for (let j = i; j < this._orderedCustomLines.length; j++) {
          const nextSpecialLine = this._orderedCustomLines[j];
          if (nextSpecialLine.deleted) {
            continue;
          }
          if (nextSpecialLine.lineNumber !== customLine.lineNumber) {
            break;
          }
          maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
        }
        customLine.maximumSpecialHeight = maximumSpecialHeight;
        let prefixSum;
        if (previousSpecialLine) {
          prefixSum = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (customLine.lineNumber - previousSpecialLine.lineNumber - 1);
        } else {
          prefixSum = this._defaultLineHeight * (customLine.lineNumber - 1);
        }
        customLine.prefixSum = prefixSum;
      }
      previousSpecialLine = customLine;
      newOrderedSpecialLines.push(customLine);
      newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
    }
    this._orderedCustomLines = newOrderedSpecialLines;
    this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
    this._invalidIndex = Infinity;
  }
  _doLinesDeleted(fromLineNumber, toLineNumber) {
    const deleteCount = toLineNumber - fromLineNumber + 1;
    const numberOfCustomLines = this._orderedCustomLines.length;
    const candidateStartIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
    let startIndexOfDeletion;
    if (candidateStartIndexOfDeletion >= 0) {
      startIndexOfDeletion = candidateStartIndexOfDeletion;
      for (let i = candidateStartIndexOfDeletion - 1; i >= 0; i--) {
        if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
          startIndexOfDeletion--;
        } else {
          break;
        }
      }
    } else {
      startIndexOfDeletion = candidateStartIndexOfDeletion === -(numberOfCustomLines + 1) && candidateStartIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateStartIndexOfDeletion + 1);
    }
    const candidateEndIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(toLineNumber);
    let endIndexOfDeletion;
    if (candidateEndIndexOfDeletion >= 0) {
      endIndexOfDeletion = candidateEndIndexOfDeletion;
      for (let i = candidateEndIndexOfDeletion + 1; i < numberOfCustomLines; i++) {
        if (this._orderedCustomLines[i].lineNumber === toLineNumber) {
          endIndexOfDeletion++;
        } else {
          break;
        }
      }
    } else {
      endIndexOfDeletion = candidateEndIndexOfDeletion === -(numberOfCustomLines + 1) && candidateEndIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateEndIndexOfDeletion + 1);
    }
    const isEndIndexBiggerThanStartIndex = endIndexOfDeletion > startIndexOfDeletion;
    const isEndIndexEqualToStartIndexAndCoversCustomLine = endIndexOfDeletion === startIndexOfDeletion && this._orderedCustomLines[startIndexOfDeletion] && this._orderedCustomLines[startIndexOfDeletion].lineNumber >= fromLineNumber && this._orderedCustomLines[startIndexOfDeletion].lineNumber <= toLineNumber;
    if (isEndIndexBiggerThanStartIndex || isEndIndexEqualToStartIndexAndCoversCustomLine) {
      let maximumSpecialHeightOnDeletedInterval = 0;
      for (let i = startIndexOfDeletion; i <= endIndexOfDeletion; i++) {
        maximumSpecialHeightOnDeletedInterval = Math.max(maximumSpecialHeightOnDeletedInterval, this._orderedCustomLines[i].maximumSpecialHeight);
      }
      let prefixSumOnDeletedInterval = 0;
      if (startIndexOfDeletion > 0) {
        const previousSpecialLine = this._orderedCustomLines[startIndexOfDeletion - 1];
        prefixSumOnDeletedInterval = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (fromLineNumber - previousSpecialLine.lineNumber - 1);
      } else {
        prefixSumOnDeletedInterval = fromLineNumber > 0 ? (fromLineNumber - 1) * this._defaultLineHeight : 0;
      }
      const firstSpecialLineDeleted = this._orderedCustomLines[startIndexOfDeletion];
      const lastSpecialLineDeleted = this._orderedCustomLines[endIndexOfDeletion];
      const firstSpecialLineAfterDeletion = this._orderedCustomLines[endIndexOfDeletion + 1];
      const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
      const totalHeightDeleted = lastSpecialLineDeleted.prefixSum + lastSpecialLineDeleted.maximumSpecialHeight - firstSpecialLineDeleted.prefixSum + this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber) + this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber) + heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;
      const decorationIdsSeen = /* @__PURE__ */ new Set();
      const newOrderedCustomLines = [];
      const newDecorationIDToSpecialLine = new ArrayMap();
      let numberOfDeletions = 0;
      for (let i = 0; i < this._orderedCustomLines.length; i++) {
        const customLine = this._orderedCustomLines[i];
        if (i < startIndexOfDeletion) {
          newOrderedCustomLines.push(customLine);
          newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        } else if (i >= startIndexOfDeletion && i <= endIndexOfDeletion) {
          const decorationId = customLine.decorationId;
          if (!decorationIdsSeen.has(decorationId)) {
            customLine.index -= numberOfDeletions;
            customLine.lineNumber = fromLineNumber;
            customLine.prefixSum = prefixSumOnDeletedInterval;
            customLine.maximumSpecialHeight = maximumSpecialHeightOnDeletedInterval;
            newOrderedCustomLines.push(customLine);
            newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
          } else {
            numberOfDeletions++;
          }
        } else if (i > endIndexOfDeletion) {
          customLine.index -= numberOfDeletions;
          customLine.lineNumber -= deleteCount;
          customLine.prefixSum -= totalHeightDeleted;
          newOrderedCustomLines.push(customLine);
          newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        }
        decorationIdsSeen.add(customLine.decorationId);
      }
      this._orderedCustomLines = newOrderedCustomLines;
      this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
    } else {
      const totalHeightDeleted = deleteCount * this._defaultLineHeight;
      for (let i = endIndexOfDeletion; i < this._orderedCustomLines.length; i++) {
        const customLine = this._orderedCustomLines[i];
        if (customLine.lineNumber > toLineNumber) {
          customLine.lineNumber -= deleteCount;
          customLine.prefixSum -= totalHeightDeleted;
        }
      }
    }
  }
  _doLinesInserted(fromLineNumber, toLineNumber, stagedInserts, stagedIdMap) {
    const insertCount = toLineNumber - fromLineNumber + 1;
    const candidateStartIndexOfInsertion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
    let startIndexOfInsertion;
    if (candidateStartIndexOfInsertion >= 0) {
      startIndexOfInsertion = candidateStartIndexOfInsertion;
      for (let i = candidateStartIndexOfInsertion - 1; i >= 0; i--) {
        if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
          startIndexOfInsertion--;
        } else {
          break;
        }
      }
    } else {
      startIndexOfInsertion = -(candidateStartIndexOfInsertion + 1);
    }
    const toReAdd = [];
    const decorationsImmediatelyAfter = /* @__PURE__ */ new Set();
    for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
      if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
        decorationsImmediatelyAfter.add(this._orderedCustomLines[i].decorationId);
      }
    }
    const decorationsImmediatelyBefore = /* @__PURE__ */ new Set();
    for (let i = startIndexOfInsertion - 1; i >= 0; i--) {
      if (this._orderedCustomLines[i].lineNumber === fromLineNumber - 1) {
        decorationsImmediatelyBefore.add(this._orderedCustomLines[i].decorationId);
      }
    }
    const decorationsWithGaps = intersection(decorationsImmediatelyBefore, decorationsImmediatelyAfter);
    const prefixSumToAdd = insertCount * this._defaultLineHeight;
    for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
      this._orderedCustomLines[i].lineNumber += insertCount;
      this._orderedCustomLines[i].prefixSum += prefixSumToAdd;
    }
    if (decorationsWithGaps.size > 0) {
      for (const decorationId of decorationsWithGaps) {
        const decoration = this._decorationIDToCustomLine.get(decorationId);
        if (decoration) {
          const startLineNumber = decoration.reduce((min, l) => Math.min(min, l.lineNumber), fromLineNumber);
          const endLineNumber = decoration.reduce((max, l) => Math.max(max, l.lineNumber), fromLineNumber);
          const lineHeight = decoration.reduce((max, l) => Math.max(max, l.specialHeight), 0);
          toReAdd.push({
            decorationId,
            startLineNumber,
            endLineNumber,
            lineHeight
          });
        }
      }
      for (const dec of toReAdd) {
        this._doInsertOrChangeCustomLineHeight(dec.decorationId, dec.startLineNumber, dec.endLineNumber, dec.lineHeight, stagedInserts, stagedIdMap);
      }
    }
  }
  _binarySearchOverOrderedCustomLinesArray(lineNumber) {
    return binarySearch2(this._orderedCustomLines.length, (index) => {
      const line = this._orderedCustomLines[index];
      if (line.lineNumber === lineNumber) {
        return 0;
      } else if (line.lineNumber < lineNumber) {
        return -1;
      } else {
        return 1;
      }
    });
  }
}
class CustomLineHeightData {
  constructor(decorationId, startLineNumber, endLineNumber, lineHeight) {
    this.decorationId = decorationId;
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
    this.lineHeight = lineHeight;
  }
  static fromDecorations(decorations, coordinatesConverter, configuration) {
    const defaultLineHeight = configuration.options.get(EditorOption.lineHeight);
    return decorations.map((d) => {
      const viewRange = coordinatesConverter.convertModelRangeToViewRange(d.range);
      return new CustomLineHeightData(
        d.id,
        viewRange.startLineNumber,
        viewRange.endLineNumber,
        d.options.lineHeight ? d.options.lineHeight * defaultLineHeight : 0
      );
    });
  }
}
class ArrayMap {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    const array = this._map.get(key);
    if (!array) {
      this._map.set(key, [value]);
    } else {
      array.push(value);
    }
  }
  get(key) {
    return this._map.get(key);
  }
  delete(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
}
export {
  CustomLine,
  CustomLineHeightData,
  LineHeightsManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld0xheW91dFxcbGluZUhlaWdodHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBiaW5hcnlTZWFyY2gyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGludGVyc2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvb3JkaW5hdGVzQ29udmVydGVyIH0gZnJvbSAnLi4vY29vcmRpbmF0ZXNDb252ZXJ0ZXIuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbiB9IGZyb20gJy4uL21vZGVsLmpzJztcblxuY29uc3QgZW51bSBQZW5kaW5nQ2hhbmdlS2luZCB7XG5cdEluc2VydE9yQ2hhbmdlLFxuXHRSZW1vdmUsXG5cdExpbmVzRGVsZXRlZCxcblx0TGluZXNJbnNlcnRlZCxcbn1cblxudHlwZSBQZW5kaW5nQ2hhbmdlID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IFBlbmRpbmdDaGFuZ2VLaW5kLkluc2VydE9yQ2hhbmdlOyByZWFkb25seSBkZWNvcmF0aW9uSWQ6IHN0cmluZzsgcmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7IHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjsgcmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IFBlbmRpbmdDaGFuZ2VLaW5kLlJlbW92ZTsgcmVhZG9ubHkgZGVjb3JhdGlvbklkOiBzdHJpbmcgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuTGluZXNEZWxldGVkOyByZWFkb25seSBmcm9tTGluZU51bWJlcjogbnVtYmVyOyByZWFkb25seSB0b0xpbmVOdW1iZXI6IG51bWJlciB9XG5cdHwgeyByZWFkb25seSBraW5kOiBQZW5kaW5nQ2hhbmdlS2luZC5MaW5lc0luc2VydGVkOyByZWFkb25seSBmcm9tTGluZU51bWJlcjogbnVtYmVyOyByZWFkb25seSB0b0xpbmVOdW1iZXI6IG51bWJlciB9O1xuXG5leHBvcnQgY2xhc3MgQ3VzdG9tTGluZSB7XG5cblx0cHVibGljIGluZGV4OiBudW1iZXI7XG5cdHB1YmxpYyBsaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyBzcGVjaWFsSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyBwcmVmaXhTdW06IG51bWJlcjtcblx0cHVibGljIG1heGltdW1TcGVjaWFsSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyBkZWNvcmF0aW9uSWQ6IHN0cmluZztcblx0cHVibGljIGRlbGV0ZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZGVjb3JhdGlvbklkOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxpbmVOdW1iZXI6IG51bWJlciwgc3BlY2lhbEhlaWdodDogbnVtYmVyLCBwcmVmaXhTdW06IG51bWJlcikge1xuXHRcdHRoaXMuZGVjb3JhdGlvbklkID0gZGVjb3JhdGlvbklkO1xuXHRcdHRoaXMuaW5kZXggPSBpbmRleDtcblx0XHR0aGlzLmxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdHRoaXMuc3BlY2lhbEhlaWdodCA9IHNwZWNpYWxIZWlnaHQ7XG5cdFx0dGhpcy5wcmVmaXhTdW0gPSBwcmVmaXhTdW07XG5cdFx0dGhpcy5tYXhpbXVtU3BlY2lhbEhlaWdodCA9IHNwZWNpYWxIZWlnaHQ7XG5cdFx0dGhpcy5kZWxldGVkID0gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBNYW5hZ2VzIGxpbmUgaGVpZ2h0cyBpbiB0aGUgZWRpdG9yIHdpdGggc3VwcG9ydCBmb3IgY3VzdG9tIGxpbmUgaGVpZ2h0cyBmcm9tIGRlY29yYXRpb25zLlxuICpcbiAqIFRoaXMgY2xhc3MgbWFpbnRhaW5zIGFuIG9yZGVyZWQgY29sbGVjdGlvbiBvZiBsaW5lIGhlaWdodHMsIHdoZXJlIGVhY2ggbGluZSBjYW4gaGF2ZSBlaXRoZXJcbiAqIHRoZSBkZWZhdWx0IGhlaWdodCBvciBhIGN1c3RvbSBoZWlnaHQgc3BlY2lmaWVkIGJ5IGRlY29yYXRpb25zLiBJdCBzdXBwb3J0cyBlZmZpY2llbnQgcXVlcnlpbmdcbiAqIG9mIGluZGl2aWR1YWwgbGluZSBoZWlnaHRzIGFzIHdlbGwgYXMgYWNjdW11bGF0ZWQgaGVpZ2h0cyB1cCB0byBhIHNwZWNpZmljIGxpbmUuXG4gKlxuICogTGluZSBoZWlnaHRzIGFyZSBzdG9yZWQgaW4gYSBzb3J0ZWQgYXJyYXkgZm9yIGVmZmljaWVudCBiaW5hcnkgc2VhcmNoIG9wZXJhdGlvbnMuIEVhY2ggbGluZVxuICogd2l0aCBjdXN0b20gaGVpZ2h0IGlzIHJlcHJlc2VudGVkIGJ5IGEge0BsaW5rIEN1c3RvbUxpbmV9IG9iamVjdCB3aGljaCB0cmFja3MgaXRzIHNwZWNpYWwgaGVpZ2h0LFxuICogYWNjdW11bGF0ZWQgaGVpZ2h0IHByZWZpeCBzdW0sIGFuZCBhc3NvY2lhdGVkIGRlY29yYXRpb24gSUQuXG4gKlxuICogVGhlIGNsYXNzIG9wdGltaXplcyBwZXJmb3JtYW5jZSBieTpcbiAqIC0gVXNpbmcgYmluYXJ5IHNlYXJjaCB0byBsb2NhdGUgbGluZXMgaW4gdGhlIG9yZGVyZWQgYXJyYXlcbiAqIC0gQmF0Y2hpbmcgdXBkYXRlcyB0aHJvdWdoIGEgcGVuZGluZyBjaGFuZ2VzIG1lY2hhbmlzbVxuICogLSBDb21wdXRpbmcgcHJlZml4IHN1bXMgZm9yIE8oMSkgYWNjdW11bGF0ZWQgaGVpZ2h0IGxvb2t1cFxuICogLSBUcmFja2luZyBtYXhpbXVtIGhlaWdodCBmb3IgbGluZXMgd2l0aCBtdWx0aXBsZSBkZWNvcmF0aW9uc1xuICogLSBFZmZpY2llbnRseSBoYW5kbGluZyBkb2N1bWVudCBjaGFuZ2VzIChsaW5lIGluc2VydGlvbnMgYW5kIGRlbGV0aW9ucylcbiAqXG4gKiBXaGVuIGxpbmVzIGFyZSBpbnNlcnRlZCBvciBkZWxldGVkLCB0aGUgbWFuYWdlciB1cGRhdGVzIGxpbmUgbnVtYmVycyBhbmQgcHJlZml4IHN1bXNcbiAqIGZvciBhbGwgYWZmZWN0ZWQgbGluZXMuIEl0IGFsc28gaGFuZGxlcyBzcGVjaWFsIGNhc2VzIGxpa2UgZGVjb3JhdGlvbnMgdGhhdCBzcGFuXG4gKiB0aGUgaW5zZXJ0aW9uL2RlbGV0aW9uIHBvaW50cyBieSByZS1hcHBseWluZyB0aG9zZSBkZWNvcmF0aW9ucyBhcHByb3ByaWF0ZWx5LlxuICpcbiAqIEFsbCBxdWVyeSBvcGVyYXRpb25zIGF1dG9tYXRpY2FsbHkgY29tbWl0IHBlbmRpbmcgY2hhbmdlcyB0byBlbnN1cmUgY29uc2lzdGVudCByZXN1bHRzLlxuICogQ2xpZW50cyBjYW4gbW9kaWZ5IGxpbmUgaGVpZ2h0cyBieSBhZGRpbmcgb3IgcmVtb3ZpbmcgY3VzdG9tIGxpbmUgaGVpZ2h0IGRlY29yYXRpb25zLFxuICogd2hpY2ggYXJlIHRyYWNrZWQgYnkgdGhlaXIgdW5pcXVlIGRlY29yYXRpb24gSURzLlxuICovXG5leHBvcnQgY2xhc3MgTGluZUhlaWdodHNNYW5hZ2VyIHtcblxuXHRwcml2YXRlIF9kZWNvcmF0aW9uSURUb0N1c3RvbUxpbmU6IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4gPSBuZXcgQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPigpO1xuXHRwcml2YXRlIF9vcmRlcmVkQ3VzdG9tTGluZXM6IEN1c3RvbUxpbmVbXSA9IFtdO1xuXHRwcml2YXRlIF9wZW5kaW5nQ2hhbmdlczogUGVuZGluZ0NoYW5nZVtdID0gW107XG5cdHByaXZhdGUgX2ludmFsaWRJbmRleDogbnVtYmVyID0gSW5maW5pdHk7XG5cdHByaXZhdGUgX2RlZmF1bHRMaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgX2hhc1BlbmRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3RvcihkZWZhdWx0TGluZUhlaWdodDogbnVtYmVyLCBjdXN0b21MaW5lSGVpZ2h0RGF0YTogQ3VzdG9tTGluZUhlaWdodERhdGFbXSkge1xuXHRcdHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ID0gZGVmYXVsdExpbmVIZWlnaHQ7XG5cdFx0Zm9yIChjb25zdCBkYXRhIG9mIGN1c3RvbUxpbmVIZWlnaHREYXRhKSB7XG5cdFx0XHR0aGlzLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkYXRhLmRlY29yYXRpb25JZCwgZGF0YS5zdGFydExpbmVOdW1iZXIsIGRhdGEuZW5kTGluZU51bWJlciwgZGF0YS5saW5lSGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRzZXQgZGVmYXVsdExpbmVIZWlnaHQoZGVmYXVsdExpbmVIZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ID0gZGVmYXVsdExpbmVIZWlnaHQ7XG5cdH1cblxuXHRnZXQgZGVmYXVsdExpbmVIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5wdXNoKHsga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuUmVtb3ZlLCBkZWNvcmF0aW9uSWQ6IGRlY29yYXRpb25JRCB9KTtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklkOiBzdHJpbmcsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzLnB1c2goeyBraW5kOiBQZW5kaW5nQ2hhbmdlS2luZC5JbnNlcnRPckNoYW5nZSwgZGVjb3JhdGlvbklkLCBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIsIGxpbmVIZWlnaHQgfSk7XG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgaGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHRoaXMuX2NvbW1pdCgpO1xuXHRcdGNvbnN0IHNlYXJjaEluZGV4ID0gdGhpcy5fYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KGxpbmVOdW1iZXIpO1xuXHRcdGlmIChzZWFyY2hJbmRleCA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3NlYXJjaEluZGV4XS5tYXhpbXVtU3BlY2lhbEhlaWdodDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIGdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fY29tbWl0KCk7XG5cdFx0Y29uc3Qgc2VhcmNoSW5kZXggPSB0aGlzLl9iaW5hcnlTZWFyY2hPdmVyT3JkZXJlZEN1c3RvbUxpbmVzQXJyYXkobGluZU51bWJlcik7XG5cdFx0aWYgKHNlYXJjaEluZGV4ID49IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbc2VhcmNoSW5kZXhdLnByZWZpeFN1bSArIHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzZWFyY2hJbmRleF0ubWF4aW11bVNwZWNpYWxIZWlnaHQ7XG5cdFx0fVxuXHRcdGlmIChzZWFyY2hJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZWZhdWx0TGluZUhlaWdodCAqIGxpbmVOdW1iZXI7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGlmaWVkSW5kZXggPSAtKHNlYXJjaEluZGV4ICsgMSk7XG5cdFx0Y29uc3QgcHJldmlvdXNTcGVjaWFsTGluZSA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1ttb2RpZmllZEluZGV4IC0gMV07XG5cdFx0cmV0dXJuIHByZXZpb3VzU3BlY2lhbExpbmUucHJlZml4U3VtICsgcHJldmlvdXNTcGVjaWFsTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodCArIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ICogKGxpbmVOdW1iZXIgLSBwcmV2aW91c1NwZWNpYWxMaW5lLmxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMucHVzaCh7IGtpbmQ6IFBlbmRpbmdDaGFuZ2VLaW5kLkxpbmVzRGVsZXRlZCwgZnJvbUxpbmVOdW1iZXIsIHRvTGluZU51bWJlciB9KTtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5wdXNoKHsga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuTGluZXNJbnNlcnRlZCwgZnJvbUxpbmVOdW1iZXIsIHRvTGluZU51bWJlciB9KTtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbW1pdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1BlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuX3BlbmRpbmdDaGFuZ2VzO1xuXHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzID0gW107XG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgc3RhZ2VkSW5zZXJ0czogQ3VzdG9tTGluZVtdID0gW107XG5cdFx0Y29uc3Qgc3RhZ2VkSWRNYXAgPSBuZXcgQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPigpO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdHN3aXRjaCAoY2hhbmdlLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBQZW5kaW5nQ2hhbmdlS2luZC5SZW1vdmU6XG5cdFx0XHRcdFx0dGhpcy5fZG9SZW1vdmVDdXN0b21MaW5lSGVpZ2h0KGNoYW5nZS5kZWNvcmF0aW9uSWQsIHN0YWdlZElkTWFwKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQZW5kaW5nQ2hhbmdlS2luZC5JbnNlcnRPckNoYW5nZTpcblx0XHRcdFx0XHR0aGlzLl9kb0luc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChjaGFuZ2UuZGVjb3JhdGlvbklkLCBjaGFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjaGFuZ2UuZW5kTGluZU51bWJlciwgY2hhbmdlLmxpbmVIZWlnaHQsIHN0YWdlZEluc2VydHMsIHN0YWdlZElkTWFwKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQZW5kaW5nQ2hhbmdlS2luZC5MaW5lc0RlbGV0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fZmx1c2hTdGFnZWREZWNvcmF0aW9uQ2hhbmdlcyhzdGFnZWRJbnNlcnRzLCBzdGFnZWRJZE1hcCk7XG5cdFx0XHRcdFx0dGhpcy5fZG9MaW5lc0RlbGV0ZWQoY2hhbmdlLmZyb21MaW5lTnVtYmVyLCBjaGFuZ2UudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQZW5kaW5nQ2hhbmdlS2luZC5MaW5lc0luc2VydGVkOlxuXHRcdFx0XHRcdHRoaXMuX2ZsdXNoU3RhZ2VkRGVjb3JhdGlvbkNoYW5nZXMoc3RhZ2VkSW5zZXJ0cywgc3RhZ2VkSWRNYXApO1xuXHRcdFx0XHRcdHRoaXMuX2RvTGluZXNJbnNlcnRlZChjaGFuZ2UuZnJvbUxpbmVOdW1iZXIsIGNoYW5nZS50b0xpbmVOdW1iZXIsIHN0YWdlZEluc2VydHMsIHN0YWdlZElkTWFwKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZmx1c2hTdGFnZWREZWNvcmF0aW9uQ2hhbmdlcyhzdGFnZWRJbnNlcnRzLCBzdGFnZWRJZE1hcCk7XG5cdH1cblxuXHRwcml2YXRlIF9kb1JlbW92ZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklEOiBzdHJpbmcsIHN0YWdlZElkTWFwOiBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VzdG9tTGluZXMgPSB0aGlzLl9kZWNvcmF0aW9uSURUb0N1c3RvbUxpbmUuZ2V0KGRlY29yYXRpb25JRCk7XG5cdFx0aWYgKGN1c3RvbUxpbmVzKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uSURUb0N1c3RvbUxpbmUuZGVsZXRlKGRlY29yYXRpb25JRCk7XG5cdFx0XHRmb3IgKGNvbnN0IGN1c3RvbUxpbmUgb2YgY3VzdG9tTGluZXMpIHtcblx0XHRcdFx0Y3VzdG9tTGluZS5kZWxldGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5faW52YWxpZEluZGV4ID0gTWF0aC5taW4odGhpcy5faW52YWxpZEluZGV4LCBjdXN0b21MaW5lLmluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc3RhZ2VkTGluZXMgPSBzdGFnZWRJZE1hcC5nZXQoZGVjb3JhdGlvbklEKTtcblx0XHRpZiAoc3RhZ2VkTGluZXMpIHtcblx0XHRcdHN0YWdlZElkTWFwLmRlbGV0ZShkZWNvcmF0aW9uSUQpO1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIHN0YWdlZExpbmVzKSB7XG5cdFx0XHRcdGxpbmUuZGVsZXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZG9JbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklkOiBzdHJpbmcsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlciwgc3RhZ2VkSW5zZXJ0czogQ3VzdG9tTGluZVtdLCBzdGFnZWRJZE1hcDogQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPik6IHZvaWQge1xuXHRcdHRoaXMuX2RvUmVtb3ZlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQsIHN0YWdlZElkTWFwKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgY3VzdG9tTGluZSA9IG5ldyBDdXN0b21MaW5lKGRlY29yYXRpb25JZCwgLTEsIGxpbmVOdW1iZXIsIGxpbmVIZWlnaHQsIDApO1xuXHRcdFx0c3RhZ2VkSW5zZXJ0cy5wdXNoKGN1c3RvbUxpbmUpO1xuXHRcdFx0c3RhZ2VkSWRNYXAuYWRkKGRlY29yYXRpb25JZCwgY3VzdG9tTGluZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hTdGFnZWREZWNvcmF0aW9uQ2hhbmdlcyhzdGFnZWRJbnNlcnRzOiBDdXN0b21MaW5lW10sIHN0YWdlZElkTWFwOiBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KTogdm9pZCB7XG5cdFx0aWYgKHN0YWdlZEluc2VydHMubGVuZ3RoID09PSAwICYmIHRoaXMuX2ludmFsaWRJbmRleCA9PT0gSW5maW5pdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nQ2hhbmdlIG9mIHN0YWdlZEluc2VydHMpIHtcblx0XHRcdGlmIChwZW5kaW5nQ2hhbmdlLmRlbGV0ZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVJbnNlcnRpb25JbmRleCA9IHRoaXMuX2JpbmFyeVNlYXJjaE92ZXJPcmRlcmVkQ3VzdG9tTGluZXNBcnJheShwZW5kaW5nQ2hhbmdlLmxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgaW5zZXJ0aW9uSW5kZXggPSBjYW5kaWRhdGVJbnNlcnRpb25JbmRleCA+PSAwID8gY2FuZGlkYXRlSW5zZXJ0aW9uSW5kZXggOiAtKGNhbmRpZGF0ZUluc2VydGlvbkluZGV4ICsgMSk7XG5cdFx0XHR0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMuc3BsaWNlKGluc2VydGlvbkluZGV4LCAwLCBwZW5kaW5nQ2hhbmdlKTtcblx0XHRcdHRoaXMuX2ludmFsaWRJbmRleCA9IE1hdGgubWluKHRoaXMuX2ludmFsaWRJbmRleCwgaW5zZXJ0aW9uSW5kZXgpO1xuXHRcdH1cblx0XHRzdGFnZWRJbnNlcnRzLmxlbmd0aCA9IDA7XG5cdFx0c3RhZ2VkSWRNYXAuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5faW52YWxpZEluZGV4ID09PSBJbmZpbml0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lID0gbmV3IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4oKTtcblx0XHRjb25zdCBuZXdPcmRlcmVkU3BlY2lhbExpbmVzOiBDdXN0b21MaW5lW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5faW52YWxpZEluZGV4OyBpKyspIHtcblx0XHRcdGNvbnN0IGN1c3RvbUxpbmUgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV07XG5cdFx0XHRuZXdPcmRlcmVkU3BlY2lhbExpbmVzLnB1c2goY3VzdG9tTGluZSk7XG5cdFx0XHRuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lLmFkZChjdXN0b21MaW5lLmRlY29yYXRpb25JZCwgY3VzdG9tTGluZSk7XG5cdFx0fVxuXG5cdFx0bGV0IG51bWJlck9mRGVsZXRpb25zID0gMDtcblx0XHRsZXQgcHJldmlvdXNTcGVjaWFsTGluZTogQ3VzdG9tTGluZSB8IHVuZGVmaW5lZCA9ICh0aGlzLl9pbnZhbGlkSW5kZXggPiAwKSA/IG5ld09yZGVyZWRTcGVjaWFsTGluZXNbdGhpcy5faW52YWxpZEluZGV4IC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2ludmFsaWRJbmRleDsgaSA8IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VzdG9tTGluZSA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXTtcblx0XHRcdGlmIChjdXN0b21MaW5lLmRlbGV0ZWQpIHtcblx0XHRcdFx0bnVtYmVyT2ZEZWxldGlvbnMrKztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjdXN0b21MaW5lLmluZGV4ID0gaSAtIG51bWJlck9mRGVsZXRpb25zO1xuXHRcdFx0aWYgKHByZXZpb3VzU3BlY2lhbExpbmUgJiYgcHJldmlvdXNTcGVjaWFsTGluZS5saW5lTnVtYmVyID09PSBjdXN0b21MaW5lLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y3VzdG9tTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodCA9IHByZXZpb3VzU3BlY2lhbExpbmUubWF4aW11bVNwZWNpYWxIZWlnaHQ7XG5cdFx0XHRcdGN1c3RvbUxpbmUucHJlZml4U3VtID0gcHJldmlvdXNTcGVjaWFsTGluZS5wcmVmaXhTdW07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgbWF4aW11bVNwZWNpYWxIZWlnaHQgPSBjdXN0b21MaW5lLnNwZWNpYWxIZWlnaHQ7XG5cdFx0XHRcdGZvciAobGV0IGogPSBpOyBqIDwgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dFNwZWNpYWxMaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2pdO1xuXHRcdFx0XHRcdGlmIChuZXh0U3BlY2lhbExpbmUuZGVsZXRlZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChuZXh0U3BlY2lhbExpbmUubGluZU51bWJlciAhPT0gY3VzdG9tTGluZS5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bWF4aW11bVNwZWNpYWxIZWlnaHQgPSBNYXRoLm1heChtYXhpbXVtU3BlY2lhbEhlaWdodCwgbmV4dFNwZWNpYWxMaW5lLnNwZWNpYWxIZWlnaHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1c3RvbUxpbmUubWF4aW11bVNwZWNpYWxIZWlnaHQgPSBtYXhpbXVtU3BlY2lhbEhlaWdodDtcblxuXHRcdFx0XHRsZXQgcHJlZml4U3VtOiBudW1iZXI7XG5cdFx0XHRcdGlmIChwcmV2aW91c1NwZWNpYWxMaW5lKSB7XG5cdFx0XHRcdFx0cHJlZml4U3VtID0gcHJldmlvdXNTcGVjaWFsTGluZS5wcmVmaXhTdW0gKyBwcmV2aW91c1NwZWNpYWxMaW5lLm1heGltdW1TcGVjaWFsSGVpZ2h0ICsgdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgKiAoY3VzdG9tTGluZS5saW5lTnVtYmVyIC0gcHJldmlvdXNTcGVjaWFsTGluZS5saW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJlZml4U3VtID0gdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgKiAoY3VzdG9tTGluZS5saW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VzdG9tTGluZS5wcmVmaXhTdW0gPSBwcmVmaXhTdW07XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c1NwZWNpYWxMaW5lID0gY3VzdG9tTGluZTtcblx0XHRcdG5ld09yZGVyZWRTcGVjaWFsTGluZXMucHVzaChjdXN0b21MaW5lKTtcblx0XHRcdG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUuYWRkKGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkLCBjdXN0b21MaW5lKTtcblx0XHR9XG5cdFx0dGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzID0gbmV3T3JkZXJlZFNwZWNpYWxMaW5lcztcblx0XHR0aGlzLl9kZWNvcmF0aW9uSURUb0N1c3RvbUxpbmUgPSBuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lO1xuXHRcdHRoaXMuX2ludmFsaWRJbmRleCA9IEluZmluaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9MaW5lc0RlbGV0ZWQoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkZWxldGVDb3VudCA9IHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCBudW1iZXJPZkN1c3RvbUxpbmVzID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDtcblx0XHRjb25zdCBjYW5kaWRhdGVTdGFydEluZGV4T2ZEZWxldGlvbiA9IHRoaXMuX2JpbmFyeVNlYXJjaE92ZXJPcmRlcmVkQ3VzdG9tTGluZXNBcnJheShmcm9tTGluZU51bWJlcik7XG5cdFx0bGV0IHN0YXJ0SW5kZXhPZkRlbGV0aW9uOiBudW1iZXI7XG5cdFx0aWYgKGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkRlbGV0aW9uID49IDApIHtcblx0XHRcdHN0YXJ0SW5kZXhPZkRlbGV0aW9uID0gY2FuZGlkYXRlU3RhcnRJbmRleE9mRGVsZXRpb247XG5cdFx0XHRmb3IgKGxldCBpID0gY2FuZGlkYXRlU3RhcnRJbmRleE9mRGVsZXRpb24gLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRpZiAodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmxpbmVOdW1iZXIgPT09IGZyb21MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0c3RhcnRJbmRleE9mRGVsZXRpb24tLTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydEluZGV4T2ZEZWxldGlvbiA9IGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkRlbGV0aW9uID09PSAtKG51bWJlck9mQ3VzdG9tTGluZXMgKyAxKSAmJiBjYW5kaWRhdGVTdGFydEluZGV4T2ZEZWxldGlvbiAhPT0gLTEgPyBudW1iZXJPZkN1c3RvbUxpbmVzIC0gMSA6IC0gKGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkRlbGV0aW9uICsgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmRpZGF0ZUVuZEluZGV4T2ZEZWxldGlvbiA9IHRoaXMuX2JpbmFyeVNlYXJjaE92ZXJPcmRlcmVkQ3VzdG9tTGluZXNBcnJheSh0b0xpbmVOdW1iZXIpO1xuXHRcdGxldCBlbmRJbmRleE9mRGVsZXRpb246IG51bWJlcjtcblx0XHRpZiAoY2FuZGlkYXRlRW5kSW5kZXhPZkRlbGV0aW9uID49IDApIHtcblx0XHRcdGVuZEluZGV4T2ZEZWxldGlvbiA9IGNhbmRpZGF0ZUVuZEluZGV4T2ZEZWxldGlvbjtcblx0XHRcdGZvciAobGV0IGkgPSBjYW5kaWRhdGVFbmRJbmRleE9mRGVsZXRpb24gKyAxOyBpIDwgbnVtYmVyT2ZDdXN0b21MaW5lczsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ubGluZU51bWJlciA9PT0gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0ZW5kSW5kZXhPZkRlbGV0aW9uKys7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW5kSW5kZXhPZkRlbGV0aW9uID0gY2FuZGlkYXRlRW5kSW5kZXhPZkRlbGV0aW9uID09PSAtKG51bWJlck9mQ3VzdG9tTGluZXMgKyAxKSAmJiBjYW5kaWRhdGVFbmRJbmRleE9mRGVsZXRpb24gIT09IC0xID8gbnVtYmVyT2ZDdXN0b21MaW5lcyAtIDEgOiAtIChjYW5kaWRhdGVFbmRJbmRleE9mRGVsZXRpb24gKyAxKTtcblx0XHR9XG5cdFx0Y29uc3QgaXNFbmRJbmRleEJpZ2dlclRoYW5TdGFydEluZGV4ID0gZW5kSW5kZXhPZkRlbGV0aW9uID4gc3RhcnRJbmRleE9mRGVsZXRpb247XG5cdFx0Y29uc3QgaXNFbmRJbmRleEVxdWFsVG9TdGFydEluZGV4QW5kQ292ZXJzQ3VzdG9tTGluZSA9IGVuZEluZGV4T2ZEZWxldGlvbiA9PT0gc3RhcnRJbmRleE9mRGVsZXRpb25cblx0XHRcdCYmIHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzdGFydEluZGV4T2ZEZWxldGlvbl1cblx0XHRcdCYmIHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzdGFydEluZGV4T2ZEZWxldGlvbl0ubGluZU51bWJlciA+PSBmcm9tTGluZU51bWJlclxuXHRcdFx0JiYgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3N0YXJ0SW5kZXhPZkRlbGV0aW9uXS5saW5lTnVtYmVyIDw9IHRvTGluZU51bWJlcjtcblxuXHRcdGlmIChpc0VuZEluZGV4QmlnZ2VyVGhhblN0YXJ0SW5kZXggfHwgaXNFbmRJbmRleEVxdWFsVG9TdGFydEluZGV4QW5kQ292ZXJzQ3VzdG9tTGluZSkge1xuXHRcdFx0bGV0IG1heGltdW1TcGVjaWFsSGVpZ2h0T25EZWxldGVkSW50ZXJ2YWwgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXhPZkRlbGV0aW9uOyBpIDw9IGVuZEluZGV4T2ZEZWxldGlvbjsgaSsrKSB7XG5cdFx0XHRcdG1heGltdW1TcGVjaWFsSGVpZ2h0T25EZWxldGVkSW50ZXJ2YWwgPSBNYXRoLm1heChtYXhpbXVtU3BlY2lhbEhlaWdodE9uRGVsZXRlZEludGVydmFsLCB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ubWF4aW11bVNwZWNpYWxIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHByZWZpeFN1bU9uRGVsZXRlZEludGVydmFsID0gMDtcblx0XHRcdGlmIChzdGFydEluZGV4T2ZEZWxldGlvbiA+IDApIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNTcGVjaWFsTGluZSA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzdGFydEluZGV4T2ZEZWxldGlvbiAtIDFdO1xuXHRcdFx0XHRwcmVmaXhTdW1PbkRlbGV0ZWRJbnRlcnZhbCA9IHByZXZpb3VzU3BlY2lhbExpbmUucHJlZml4U3VtICsgcHJldmlvdXNTcGVjaWFsTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodCArIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ICogKGZyb21MaW5lTnVtYmVyIC0gcHJldmlvdXNTcGVjaWFsTGluZS5saW5lTnVtYmVyIC0gMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcmVmaXhTdW1PbkRlbGV0ZWRJbnRlcnZhbCA9IGZyb21MaW5lTnVtYmVyID4gMCA/IChmcm9tTGluZU51bWJlciAtIDEpICogdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgOiAwO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZmlyc3RTcGVjaWFsTGluZURlbGV0ZWQgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbc3RhcnRJbmRleE9mRGVsZXRpb25dO1xuXHRcdFx0Y29uc3QgbGFzdFNwZWNpYWxMaW5lRGVsZXRlZCA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tlbmRJbmRleE9mRGVsZXRpb25dO1xuXHRcdFx0Y29uc3QgZmlyc3RTcGVjaWFsTGluZUFmdGVyRGVsZXRpb24gPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbZW5kSW5kZXhPZkRlbGV0aW9uICsgMV07XG5cdFx0XHRjb25zdCBoZWlnaHRPZkZpcnN0TGluZUFmdGVyRGVsZXRpb24gPSBmaXJzdFNwZWNpYWxMaW5lQWZ0ZXJEZWxldGlvbiAmJiBmaXJzdFNwZWNpYWxMaW5lQWZ0ZXJEZWxldGlvbi5saW5lTnVtYmVyID09PSB0b0xpbmVOdW1iZXIgKyAxID8gZmlyc3RTcGVjaWFsTGluZUFmdGVyRGVsZXRpb24ubWF4aW11bVNwZWNpYWxIZWlnaHQgOiB0aGlzLl9kZWZhdWx0TGluZUhlaWdodDtcblx0XHRcdGNvbnN0IHRvdGFsSGVpZ2h0RGVsZXRlZCA9IGxhc3RTcGVjaWFsTGluZURlbGV0ZWQucHJlZml4U3VtXG5cdFx0XHRcdCsgbGFzdFNwZWNpYWxMaW5lRGVsZXRlZC5tYXhpbXVtU3BlY2lhbEhlaWdodFxuXHRcdFx0XHQtIGZpcnN0U3BlY2lhbExpbmVEZWxldGVkLnByZWZpeFN1bVxuXHRcdFx0XHQrIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ICogKHRvTGluZU51bWJlciAtIGxhc3RTcGVjaWFsTGluZURlbGV0ZWQubGluZU51bWJlcilcblx0XHRcdFx0KyB0aGlzLl9kZWZhdWx0TGluZUhlaWdodCAqIChmaXJzdFNwZWNpYWxMaW5lRGVsZXRlZC5saW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIpXG5cdFx0XHRcdCsgaGVpZ2h0T2ZGaXJzdExpbmVBZnRlckRlbGV0aW9uIC0gbWF4aW11bVNwZWNpYWxIZWlnaHRPbkRlbGV0ZWRJbnRlcnZhbDtcblxuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbklkc1NlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IG5ld09yZGVyZWRDdXN0b21MaW5lczogQ3VzdG9tTGluZVtdID0gW107XG5cdFx0XHRjb25zdCBuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lID0gbmV3IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4oKTtcblx0XHRcdGxldCBudW1iZXJPZkRlbGV0aW9ucyA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjdXN0b21MaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldO1xuXHRcdFx0XHRpZiAoaSA8IHN0YXJ0SW5kZXhPZkRlbGV0aW9uKSB7XG5cdFx0XHRcdFx0bmV3T3JkZXJlZEN1c3RvbUxpbmVzLnB1c2goY3VzdG9tTGluZSk7XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbklEVG9TcGVjaWFsTGluZS5hZGQoY3VzdG9tTGluZS5kZWNvcmF0aW9uSWQsIGN1c3RvbUxpbmUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGkgPj0gc3RhcnRJbmRleE9mRGVsZXRpb24gJiYgaSA8PSBlbmRJbmRleE9mRGVsZXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uSWQgPSBjdXN0b21MaW5lLmRlY29yYXRpb25JZDtcblx0XHRcdFx0XHRpZiAoIWRlY29yYXRpb25JZHNTZWVuLmhhcyhkZWNvcmF0aW9uSWQpKSB7XG5cdFx0XHRcdFx0XHRjdXN0b21MaW5lLmluZGV4IC09IG51bWJlck9mRGVsZXRpb25zO1xuXHRcdFx0XHRcdFx0Y3VzdG9tTGluZS5saW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRjdXN0b21MaW5lLnByZWZpeFN1bSA9IHByZWZpeFN1bU9uRGVsZXRlZEludGVydmFsO1xuXHRcdFx0XHRcdFx0Y3VzdG9tTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodCA9IG1heGltdW1TcGVjaWFsSGVpZ2h0T25EZWxldGVkSW50ZXJ2YWw7XG5cdFx0XHRcdFx0XHRuZXdPcmRlcmVkQ3VzdG9tTGluZXMucHVzaChjdXN0b21MaW5lKTtcblx0XHRcdFx0XHRcdG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUuYWRkKGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkLCBjdXN0b21MaW5lKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bnVtYmVyT2ZEZWxldGlvbnMrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSA+IGVuZEluZGV4T2ZEZWxldGlvbikge1xuXHRcdFx0XHRcdGN1c3RvbUxpbmUuaW5kZXggLT0gbnVtYmVyT2ZEZWxldGlvbnM7XG5cdFx0XHRcdFx0Y3VzdG9tTGluZS5saW5lTnVtYmVyIC09IGRlbGV0ZUNvdW50O1xuXHRcdFx0XHRcdGN1c3RvbUxpbmUucHJlZml4U3VtIC09IHRvdGFsSGVpZ2h0RGVsZXRlZDtcblx0XHRcdFx0XHRuZXdPcmRlcmVkQ3VzdG9tTGluZXMucHVzaChjdXN0b21MaW5lKTtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lLmFkZChjdXN0b21MaW5lLmRlY29yYXRpb25JZCwgY3VzdG9tTGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVjb3JhdGlvbklkc1NlZW4uYWRkKGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29yZGVyZWRDdXN0b21MaW5lcyA9IG5ld09yZGVyZWRDdXN0b21MaW5lcztcblx0XHRcdHRoaXMuX2RlY29yYXRpb25JRFRvQ3VzdG9tTGluZSA9IG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRvdGFsSGVpZ2h0RGVsZXRlZCA9IGRlbGV0ZUNvdW50ICogdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQ7XG5cdFx0XHRmb3IgKGxldCBpID0gZW5kSW5kZXhPZkRlbGV0aW9uOyBpIDwgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbUxpbmUgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV07XG5cdFx0XHRcdGlmIChjdXN0b21MaW5lLmxpbmVOdW1iZXIgPiB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRjdXN0b21MaW5lLmxpbmVOdW1iZXIgLT0gZGVsZXRlQ291bnQ7XG5cdFx0XHRcdFx0Y3VzdG9tTGluZS5wcmVmaXhTdW0gLT0gdG90YWxIZWlnaHREZWxldGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZG9MaW5lc0luc2VydGVkKGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyLCBzdGFnZWRJbnNlcnRzOiBDdXN0b21MaW5lW10sIHN0YWdlZElkTWFwOiBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zZXJ0Q291bnQgPSB0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDE7XG5cdFx0Y29uc3QgY2FuZGlkYXRlU3RhcnRJbmRleE9mSW5zZXJ0aW9uID0gdGhpcy5fYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KGZyb21MaW5lTnVtYmVyKTtcblx0XHRsZXQgc3RhcnRJbmRleE9mSW5zZXJ0aW9uOiBudW1iZXI7XG5cdFx0aWYgKGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkluc2VydGlvbiA+PSAwKSB7XG5cdFx0XHRzdGFydEluZGV4T2ZJbnNlcnRpb24gPSBjYW5kaWRhdGVTdGFydEluZGV4T2ZJbnNlcnRpb247XG5cdFx0XHRmb3IgKGxldCBpID0gY2FuZGlkYXRlU3RhcnRJbmRleE9mSW5zZXJ0aW9uIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0aWYgKHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5saW5lTnVtYmVyID09PSBmcm9tTGluZU51bWJlcikge1xuXHRcdFx0XHRcdHN0YXJ0SW5kZXhPZkluc2VydGlvbi0tO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0SW5kZXhPZkluc2VydGlvbiA9IC0oY2FuZGlkYXRlU3RhcnRJbmRleE9mSW5zZXJ0aW9uICsgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IHRvUmVBZGQ6IEN1c3RvbUxpbmVIZWlnaHREYXRhW10gPSBbXTtcblx0XHRjb25zdCBkZWNvcmF0aW9uc0ltbWVkaWF0ZWx5QWZ0ZXIgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnRJbmRleE9mSW5zZXJ0aW9uOyBpIDwgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmxpbmVOdW1iZXIgPT09IGZyb21MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zSW1tZWRpYXRlbHlBZnRlci5hZGQodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmRlY29yYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29yYXRpb25zSW1tZWRpYXRlbHlCZWZvcmUgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnRJbmRleE9mSW5zZXJ0aW9uIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ubGluZU51bWJlciA9PT0gZnJvbUxpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zSW1tZWRpYXRlbHlCZWZvcmUuYWRkKHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5kZWNvcmF0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBkZWNvcmF0aW9uc1dpdGhHYXBzID0gaW50ZXJzZWN0aW9uKGRlY29yYXRpb25zSW1tZWRpYXRlbHlCZWZvcmUsIGRlY29yYXRpb25zSW1tZWRpYXRlbHlBZnRlcik7XG5cdFx0Y29uc3QgcHJlZml4U3VtVG9BZGQgPSBpbnNlcnRDb3VudCAqIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0O1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4T2ZJbnNlcnRpb247IGkgPCB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5saW5lTnVtYmVyICs9IGluc2VydENvdW50O1xuXHRcdFx0dGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLnByZWZpeFN1bSArPSBwcmVmaXhTdW1Ub0FkZDtcblx0XHR9XG5cblx0XHRpZiAoZGVjb3JhdGlvbnNXaXRoR2Fwcy5zaXplID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uSWQgb2YgZGVjb3JhdGlvbnNXaXRoR2Fwcykge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5fZGVjb3JhdGlvbklEVG9DdXN0b21MaW5lLmdldChkZWNvcmF0aW9uSWQpO1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IGRlY29yYXRpb24ucmVkdWNlKChtaW4sIGwpID0+IE1hdGgubWluKG1pbiwgbC5saW5lTnVtYmVyKSwgZnJvbUxpbmVOdW1iZXIpOyAvLyBtaW5cblx0XHRcdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gZGVjb3JhdGlvbi5yZWR1Y2UoKG1heCwgbCkgPT4gTWF0aC5tYXgobWF4LCBsLmxpbmVOdW1iZXIpLCBmcm9tTGluZU51bWJlcik7IC8vIG1heFxuXHRcdFx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBkZWNvcmF0aW9uLnJlZHVjZSgobWF4LCBsKSA9PiBNYXRoLm1heChtYXgsIGwuc3BlY2lhbEhlaWdodCksIDApO1xuXHRcdFx0XHRcdHRvUmVBZGQucHVzaCh7XG5cdFx0XHRcdFx0XHRkZWNvcmF0aW9uSWQsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0bGluZUhlaWdodFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZGVjIG9mIHRvUmVBZGQpIHtcblx0XHRcdFx0dGhpcy5fZG9JbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoZGVjLmRlY29yYXRpb25JZCwgZGVjLnN0YXJ0TGluZU51bWJlciwgZGVjLmVuZExpbmVOdW1iZXIsIGRlYy5saW5lSGVpZ2h0LCBzdGFnZWRJbnNlcnRzLCBzdGFnZWRJZE1hcCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIGJpbmFyeVNlYXJjaDIodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aCwgKGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2luZGV4XTtcblx0XHRcdGlmIChsaW5lLmxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUubGluZU51bWJlciA8IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUxpbmVIZWlnaHREYXRhIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBkZWNvcmF0aW9uSWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRyZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyXG5cdCkgeyB9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnM6IElNb2RlbERlY29yYXRpb25bXSwgY29vcmRpbmF0ZXNDb252ZXJ0ZXI6IElDb29yZGluYXRlc0NvbnZlcnRlciwgY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24pOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdIHtcblx0XHRjb25zdCBkZWZhdWx0TGluZUhlaWdodCA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHJldHVybiBkZWNvcmF0aW9ucy5tYXAoKGQpID0+IHtcblx0XHRcdGNvbnN0IHZpZXdSYW5nZSA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UoZC5yYW5nZSk7XG5cdFx0XHRyZXR1cm4gbmV3IEN1c3RvbUxpbmVIZWlnaHREYXRhKFxuXHRcdFx0XHRkLmlkLFxuXHRcdFx0XHR2aWV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHR2aWV3UmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZC5vcHRpb25zLmxpbmVIZWlnaHQgPyBkLm9wdGlvbnMubGluZUhlaWdodCAqIGRlZmF1bHRMaW5lSGVpZ2h0IDogMFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBBcnJheU1hcDxLLCBUPiB7XG5cblx0cHJpdmF0ZSBfbWFwOiBNYXA8SywgVFtdPiA9IG5ldyBNYXA8SywgVFtdPigpO1xuXG5cdGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0YWRkKGtleTogSywgdmFsdWU6IFQpIHtcblx0XHRjb25zdCBhcnJheSA9IHRoaXMuX21hcC5nZXQoa2V5KTtcblx0XHRpZiAoIWFycmF5KSB7XG5cdFx0XHR0aGlzLl9tYXAuc2V0KGtleSwgW3ZhbHVlXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFycmF5LnB1c2godmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IEspOiBUW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuZ2V0KGtleSk7XG5cdH1cblxuXHRkZWxldGUoa2V5OiBLKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFwLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFwLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsb0JBQW9CO0FBSTdCLElBQVcsb0JBQVgsa0JBQVdBLHVCQUFYO0FBQ0MsRUFBQUEsc0NBQUE7QUFDQSxFQUFBQSxzQ0FBQTtBQUNBLEVBQUFBLHNDQUFBO0FBQ0EsRUFBQUEsc0NBQUE7QUFKVSxTQUFBQTtBQUFBLEdBQUE7QUFhSixNQUFNLFdBQVc7QUFBQSxFQVV2QixZQUFZLGNBQXNCLE9BQWUsWUFBb0IsZUFBdUIsV0FBbUI7QUFDOUcsU0FBSyxlQUFlO0FBQ3BCLFNBQUssUUFBUTtBQUNiLFNBQUssYUFBYTtBQUNsQixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLFlBQVk7QUFDakIsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFDRDtBQTRCTyxNQUFNLG1CQUFtQjtBQUFBLEVBUy9CLFlBQVksbUJBQTJCLHNCQUE4QztBQVByRixTQUFRLDRCQUEwRCxJQUFJLFNBQTZCO0FBQ25HLFNBQVEsc0JBQW9DLENBQUM7QUFDN0MsU0FBUSxrQkFBbUMsQ0FBQztBQUM1QyxTQUFRLGdCQUF3QjtBQUVoQyxTQUFRLGNBQXVCO0FBRzlCLFNBQUsscUJBQXFCO0FBQzFCLGVBQVcsUUFBUSxzQkFBc0I7QUFDeEMsV0FBSywrQkFBK0IsS0FBSyxjQUFjLEtBQUssaUJBQWlCLEtBQUssZUFBZSxLQUFLLFVBQVU7QUFBQSxJQUNqSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksa0JBQWtCLG1CQUEyQjtBQUNoRCxTQUFLLHFCQUFxQjtB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
