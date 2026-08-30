import { CellEditType, NotebookCellsChangeType } from "../../../../notebook/common/notebookCommon.js";
import { sortCellChanges } from "./notebookCellChanges.js";
function adjustCellDiffForKeepingADeletedCell(originalCellIndex, cellDiffInfo, applyEdits) {
  const edit = { cells: [], count: 1, editType: CellEditType.Replace, index: originalCellIndex };
  applyEdits([edit], true, void 0, () => void 0, void 0, true);
  const diffs = sortCellChanges(cellDiffInfo).filter((d) => !(d.type === "delete" && d.originalCellIndex === originalCellIndex)).map((diff) => {
    if (diff.type !== "insert" && diff.originalCellIndex > originalCellIndex) {
      return {
        ...diff,
        originalCellIndex: diff.originalCellIndex - 1
      };
    }
    return diff;
  });
  return diffs;
}
function adjustCellDiffForRevertingADeletedCell(originalCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  const indexOfEntry = cellDiffInfo.findIndex((d) => d.originalCellIndex === originalCellIndex);
  if (indexOfEntry === -1) {
    return cellDiffInfo;
  }
  let modifiedCellIndex = -1;
  for (let i = 0; i < cellDiffInfo.length; i++) {
    const diff = cellDiffInfo[i];
    if (i < indexOfEntry) {
      modifiedCellIndex = Math.max(modifiedCellIndex, diff.modifiedCellIndex ?? modifiedCellIndex);
      continue;
    }
    if (i === indexOfEntry) {
      const edit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: modifiedCellIndex + 1 };
      applyEdits([edit], true, void 0, () => void 0, void 0, true);
      cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex + 1, originalCellIndex);
      continue;
    } else {
      if (typeof diff.modifiedCellIndex === "number") {
        diff.modifiedCellIndex++;
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  return cellDiffInfo;
}
function adjustCellDiffForRevertingAnInsertedCell(modifiedCellIndex, cellDiffInfo, applyEdits) {
  if (modifiedCellIndex === -1) {
    return cellDiffInfo;
  }
  cellDiffInfo = sortCellChanges(cellDiffInfo).filter((d) => !(d.type === "insert" && d.modifiedCellIndex === modifiedCellIndex)).map((d) => {
    if (d.type === "insert" && d.modifiedCellIndex === modifiedCellIndex) {
      return d;
    }
    if (d.type !== "delete" && d.modifiedCellIndex > modifiedCellIndex) {
      return {
        ...d,
        modifiedCellIndex: d.modifiedCellIndex - 1
      };
    }
    return d;
  });
  const edit = { cells: [], count: 1, editType: CellEditType.Replace, index: modifiedCellIndex };
  applyEdits([edit], true, void 0, () => void 0, void 0, true);
  return cellDiffInfo;
}
function adjustCellDiffForKeepingAnInsertedCell(modifiedCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  if (modifiedCellIndex === -1) {
    return cellDiffInfo;
  }
  const indexOfEntry = cellDiffInfo.findIndex((d) => d.modifiedCellIndex === modifiedCellIndex);
  if (indexOfEntry === -1) {
    return cellDiffInfo;
  }
  let originalCellIndex = -1;
  for (let i = 0; i < cellDiffInfo.length; i++) {
    const diff = cellDiffInfo[i];
    if (i < indexOfEntry) {
      originalCellIndex = Math.max(originalCellIndex, diff.originalCellIndex ?? originalCellIndex);
      continue;
    }
    if (i === indexOfEntry) {
      const edit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: originalCellIndex + 1 };
      applyEdits([edit], true, void 0, () => void 0, void 0, true);
      cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex + 1);
      continue;
    } else {
      if (typeof diff.originalCellIndex === "number") {
        diff.originalCellIndex++;
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  return cellDiffInfo;
}
function adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change, cellDiffInfo, modifiedModelCellCount, originalModelCellCount, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  const numberOfCellsInserted = change[2].length;
  const numberOfCellsDeleted = change[1];
  const cells = change[2].map((cell) => {
    return {
      cellKind: cell.cellKind,
      language: cell.language,
      metadata: cell.metadata,
      outputs: cell.outputs,
      source: cell.getValue(),
      mime: void 0,
      internalMetadata: cell.internalMetadata
    };
  });
  let diffEntryIndex = -1;
  let indexToInsertInOriginalModel = void 0;
  if (cells.length) {
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (typeof diff.modifiedCellIndex === "number" && diff.modifiedCellIndex === change[0]) {
        diffEntryIndex = i;
        if (typeof diff.originalCellIndex === "number") {
          indexToInsertInOriginalModel = diff.originalCellIndex;
        }
        break;
      }
      if (typeof diff.originalCellIndex === "number") {
        indexToInsertInOriginalModel = diff.originalCellIndex + 1;
      }
    }
    const edit = {
      editType: CellEditType.Replace,
      cells,
      index: indexToInsertInOriginalModel ?? 0,
      count: change[1]
    };
    applyEdits([edit], true, void 0, () => void 0, void 0, true);
  }
  if (numberOfCellsDeleted) {
    let numberOfOriginalCellsRemovedSoFar = 0;
    let numberOfModifiedCellsRemovedSoFar = 0;
    const modifiedIndexesToRemove = /* @__PURE__ */ new Set();
    for (let i = 0; i < numberOfCellsDeleted; i++) {
      modifiedIndexesToRemove.add(change[0] + i);
    }
    const itemsToRemove = /* @__PURE__ */ new Set();
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (i < diffEntryIndex) {
        continue;
      }
      let changed = false;
      if (typeof diff.modifiedCellIndex === "number" && modifiedIndexesToRemove.has(diff.modifiedCellIndex)) {
        numberOfModifiedCellsRemovedSoFar++;
        if (typeof diff.originalCellIndex === "number") {
          numberOfOriginalCellsRemovedSoFar++;
        }
        itemsToRemove.add(diff);
        continue;
      }
      if (typeof diff.modifiedCellIndex === "number" && numberOfModifiedCellsRemovedSoFar) {
        diff.modifiedCellIndex -= numberOfModifiedCellsRemovedSoFar;
        changed = true;
      }
      if (typeof diff.originalCellIndex === "number" && numberOfOriginalCellsRemovedSoFar) {
        diff.originalCellIndex -= numberOfOriginalCellsRemovedSoFar;
        changed = true;
      }
      if (changed) {
        cellDiffInfo[i] = { ...diff };
      }
    }
    if (itemsToRemove.size) {
      Array.from(itemsToRemove).filter((diff) => typeof diff.originalCellIndex === "number").forEach((diff) => {
        const edit = {
          editType: CellEditType.Replace,
          cells: [],
          index: diff.originalCellIndex,
          count: 1
        };
        applyEdits([edit], true, void 0, () => void 0, void 0, true);
      });
    }
    cellDiffInfo = cellDiffInfo.filter((d) => !itemsToRemove.has(d));
  }
  if (numberOfCellsInserted && diffEntryIndex >= 0) {
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (i < diffEntryIndex) {
        continue;
      }
      let changed = false;
      if (typeof diff.modifiedCellIndex === "number") {
        diff.modifiedCellIndex += numberOfCellsInserted;
        changed = true;
      }
      if (typeof diff.originalCellIndex === "number") {
        diff.originalCellIndex += numberOfCellsInserted;
        changed = true;
      }
      if (changed) {
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  cells.forEach((_, i) => {
    const originalCellIndex = i + (indexToInsertInOriginalModel ?? 0);
    const modifiedCellIndex = change[0] + i;
    const unchangedCell = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex);
    cellDiffInfo.splice((diffEntryIndex === -1 ? cellDiffInfo.length : diffEntryIndex) + i, 0, unchangedCell);
  });
  return cellDiffInfo;
}
function adjustCellDiffAndOriginalModelBasedOnCellMovements(event, cellDiffInfo) {
  const minimumIndex = Math.min(event.index, event.newIdx);
  const maximumIndex = Math.max(event.index, event.newIdx);
  const cellDiffs = cellDiffInfo.slice();
  const indexOfEntry = cellDiffs.findIndex((d) => d.modifiedCellIndex === event.index);
  const indexOfEntryToPlaceBelow = cellDiffs.findIndex((d) => d.modifiedCellIndex === event.newIdx);
  if (indexOfEntry === -1 || indexOfEntryToPlaceBelow === -1) {
    return void 0;
  }
  const entryToBeMoved = { ...cellDiffs[indexOfEntry] };
  const moveDirection = event.newIdx > event.index ? "down" : "up";
  const startIndex = cellDiffs.findIndex((d) => d.modifiedCellIndex === minimumIndex);
  const endIndex = cellDiffs.findIndex((d) => d.modifiedCellIndex === maximumIndex);
  const movingExistingCell = typeof entryToBeMoved.originalCellIndex === "number";
  let originalCellsWereEffected = false;
  for (let i = 0; i < cellDiffs.length; i++) {
    const diff = cellDiffs[i];
    let changed = false;
    if (moveDirection === "down") {
      if (i > startIndex && i <= endIndex) {
        if (typeof diff.modifiedCellIndex === "number") {
          changed = true;
          diff.modifiedCellIndex = diff.modifiedCellIndex - 1;
        }
        if (typeof diff.originalCellIndex === "number" && movingExistingCell) {
          diff.originalCellIndex = diff.originalCellIndex - 1;
          originalCellsWereEffected = true;
          changed = true;
        }
      }
    } else {
      if (i >= startIndex && i < endIndex) {
        if (typeof diff.modifiedCellIndex === "number") {
          changed = true;
          diff.modifiedCellIndex = diff.modifiedCellIndex + 1;
        }
        if (typeof diff.originalCellIndex === "number" && movingExistingCell) {
          diff.originalCellIndex = diff.originalCellIndex + 1;
          originalCellsWereEffected = true;
          changed = true;
        }
      }
    }
    if (changed) {
      cellDiffs[i] = { ...diff };
    }
  }
  entryToBeMoved.modifiedCellIndex = event.newIdx;
  const originalCellIndex = entryToBeMoved.originalCellIndex;
  if (moveDirection === "down") {
    cellDiffs.splice(endIndex + 1, 0, entryToBeMoved);
    cellDiffs.splice(startIndex, 1);
    if (typeof entryToBeMoved.originalCellIndex === "number") {
      entryToBeMoved.originalCellIndex = cellDiffs.slice(0, endIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === "number" ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
    }
  } else {
    cellDiffs.splice(endIndex, 1);
    cellDiffs.splice(startIndex, 0, entryToBeMoved);
    if (typeof entryToBeMoved.originalCellIndex === "number") {
      entryToBeMoved.originalCellIndex = cellDiffs.slice(0, startIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === "number" ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
    }
  }
  if (typeof entryToBeMoved.originalCellIndex === "number" && originalCellsWereEffected && typeof originalCellIndex === "number" && entryToBeMoved.originalCellIndex !== originalCellIndex) {
    const edit = {
      editType: CellEditType.Move,
      index: originalCellIndex,
      length: event.length,
      newIdx: entryToBeMoved.originalCellIndex
    };
    return [cellDiffs, [edit]];
  }
  return [cellDiffs, []];
}
function getCorrespondingOriginalCellIndex(modifiedCellIndex, cellDiffInfo) {
  const entry = cellDiffInfo.find((d) => d.modifiedCellIndex === modifiedCellIndex);
  return entry?.originalCellIndex;
}
function isTransientIPyNbExtensionEvent(notebookKind, e) {
  if (notebookKind !== "jupyter-notebook") {
    return false;
  }
  if (e.rawEvents.every((event) => {
    if (event.kind !== NotebookCellsChangeType.ChangeCellMetadata) {
      return false;
    }
    if (JSON.stringify(event.metadata || {}) === JSON.stringify({ execution_count: null, metadata: {} })) {
      return true;
    }
    return true;
  })) {
    return true;
  }
  return false;
}
function calculateNotebookRewriteRatio(cellsDiff, originalModel, modifiedModel) {
  const totalNumberOfUpdatedLines = cellsDiff.reduce((totalUpdatedLines, value) => {
    const getUpadtedLineCount = () => {
      if (value.type === "unchanged") {
        return 0;
      }
      if (value.type === "delete") {
        return originalModel.cells[value.originalCellIndex].textModel?.getLineCount() ?? 0;
      }
      if (value.type === "insert") {
        return modifiedModel.cells[value.modifiedCellIndex].textModel?.getLineCount() ?? 0;
      }
      return value.diff.get().changes.reduce((maxLineNumber, change) => {
        return Math.max(maxLineNumber, change.modified.endLineNumberExclusive);
      }, 0);
    };
    return totalUpdatedLines + getUpadtedLineCount();
  }, 0);
  const totalNumberOfLines = modifiedModel.cells.reduce((totalLines, cell) => totalLines + (cell.textModel?.getLineCount() ?? 0), 0);
  return totalNumberOfLines === 0 ? 0 : Math.min(1, totalNumberOfUpdatedLines / totalNumberOfLines);
}
export {
  adjustCellDiffAndOriginalModelBasedOnCellAddDelete,
  adjustCellDiffAndOriginalModelBasedOnCellMovements,
  adjustCellDiffForKeepingADeletedCell,
  adjustCellDiffForKeepingAnInsertedCell,
  adjustCellDiffForRevertingADeletedCell,
  adjustCellDiffForRevertingAnInsertedCell,
  calculateNotebookRewriteRatio,
  getCorrespondingOriginalCellIndex,
  isTransientIPyNbExtensionEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxub3RlYm9va1xcaGVscGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgSUNlbGwsIElDZWxsRHRvMiwgSUNlbGxFZGl0T3BlcmF0aW9uLCBJQ2VsbFJlcGxhY2VFZGl0LCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSwgTm90ZWJvb2tDZWxsc01vZGVsTW92ZUV2ZW50LCBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2UsIE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDZWxsRGlmZkluZm8sIHNvcnRDZWxsQ2hhbmdlcyB9IGZyb20gJy4vbm90ZWJvb2tDZWxsQ2hhbmdlcy5qcyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGFkanVzdENlbGxEaWZmRm9yS2VlcGluZ0FEZWxldGVkQ2VsbChvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyLFxuXHRjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSxcblx0YXBwbHlFZGl0czogdHlwZW9mIE5vdGVib29rVGV4dE1vZGVsLnByb3RvdHlwZS5hcHBseUVkaXRzLFxuKTogSUNlbGxEaWZmSW5mb1tdIHtcblx0Ly8gRGVsZXRlIHRoaXMgY2VsbCBmcm9tIG9yaWdpbmFsIGFzIHdlbGwuXG5cdGNvbnN0IGVkaXQ6IElDZWxsUmVwbGFjZUVkaXQgPSB7IGNlbGxzOiBbXSwgY291bnQ6IDEsIGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IG9yaWdpbmFsQ2VsbEluZGV4LCB9O1xuXHRhcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdGNvbnN0IGRpZmZzID0gc29ydENlbGxDaGFuZ2VzKGNlbGxEaWZmSW5mbylcblx0XHQuZmlsdGVyKGQgPT4gIShkLnR5cGUgPT09ICdkZWxldGUnICYmIGQub3JpZ2luYWxDZWxsSW5kZXggPT09IG9yaWdpbmFsQ2VsbEluZGV4KSlcblx0XHQubWFwKGRpZmYgPT4ge1xuXHRcdFx0aWYgKGRpZmYudHlwZSAhPT0gJ2luc2VydCcgJiYgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA+IG9yaWdpbmFsQ2VsbEluZGV4KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uZGlmZixcblx0XHRcdFx0XHRvcmlnaW5hbENlbGxJbmRleDogZGlmZi5vcmlnaW5hbENlbGxJbmRleCAtIDEsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGlmZjtcblx0XHR9KTtcblx0cmV0dXJuIGRpZmZzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBRGVsZXRlZENlbGwob3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcixcblx0Y2VsbERpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10sXG5cdGNlbGxUb0luc2VydDogSUNlbGxEdG8yLFxuXHRhcHBseUVkaXRzOiB0eXBlb2YgTm90ZWJvb2tUZXh0TW9kZWwucHJvdG90eXBlLmFwcGx5RWRpdHMsXG5cdGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvOiAobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcikgPT4gSUNlbGxEaWZmSW5mbyxcbik6IElDZWxsRGlmZkluZm9bXSB7XG5cdGNlbGxEaWZmSW5mbyA9IHNvcnRDZWxsQ2hhbmdlcyhjZWxsRGlmZkluZm8pO1xuXHRjb25zdCBpbmRleE9mRW50cnkgPSBjZWxsRGlmZkluZm8uZmluZEluZGV4KGQgPT4gZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gb3JpZ2luYWxDZWxsSW5kZXgpO1xuXHRpZiAoaW5kZXhPZkVudHJ5ID09PSAtMSkge1xuXHRcdC8vIE5vdCBwb3NzaWJsZS5cblx0XHRyZXR1cm4gY2VsbERpZmZJbmZvO1xuXHR9XG5cblx0bGV0IG1vZGlmaWVkQ2VsbEluZGV4ID0gLTE7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbERpZmZJbmZvLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgZGlmZiA9IGNlbGxEaWZmSW5mb1tpXTtcblx0XHRpZiAoaSA8IGluZGV4T2ZFbnRyeSkge1xuXHRcdFx0bW9kaWZpZWRDZWxsSW5kZXggPSBNYXRoLm1heChtb2RpZmllZENlbGxJbmRleCwgZGlmZi5tb2RpZmllZENlbGxJbmRleCA/PyBtb2RpZmllZENlbGxJbmRleCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGkgPT09IGluZGV4T2ZFbnRyeSkge1xuXHRcdFx0Y29uc3QgZWRpdDogSUNlbGxSZXBsYWNlRWRpdCA9IHsgY2VsbHM6IFtjZWxsVG9JbnNlcnRdLCBjb3VudDogMCwgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogbW9kaWZpZWRDZWxsSW5kZXggKyAxLCB9O1xuXHRcdFx0YXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0Y2VsbERpZmZJbmZvW2ldID0gY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8obW9kaWZpZWRDZWxsSW5kZXggKyAxLCBvcmlnaW5hbENlbGxJbmRleCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSW5jcmVhc2UgdGhlIG9yaWdpbmFsIGluZGV4IGZvciBhbGwgZW50cmllcyBhZnRlciB0aGlzLlxuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4Kys7XG5cdFx0XHRcdGNlbGxEaWZmSW5mb1tpXSA9IHsgLi4uZGlmZiB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBjZWxsRGlmZkluZm87XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FuSW5zZXJ0ZWRDZWxsKG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXIsXG5cdGNlbGxEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdLFxuXHRhcHBseUVkaXRzOiB0eXBlb2YgTm90ZWJvb2tUZXh0TW9kZWwucHJvdG90eXBlLmFwcGx5RWRpdHMsXG4pOiBJQ2VsbERpZmZJbmZvW10ge1xuXHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0Ly8gTm90IHBvc3NpYmxlLlxuXHRcdHJldHVybiBjZWxsRGlmZkluZm87XG5cdH1cblx0Y2VsbERpZmZJbmZvID0gc29ydENlbGxDaGFuZ2VzKGNlbGxEaWZmSW5mbylcblx0XHQuZmlsdGVyKGQgPT4gIShkLnR5cGUgPT09ICdpbnNlcnQnICYmIGQubW9kaWZpZWRDZWxsSW5kZXggPT09IG1vZGlmaWVkQ2VsbEluZGV4KSlcblx0XHQubWFwKGQgPT4ge1xuXHRcdFx0aWYgKGQudHlwZSA9PT0gJ2luc2VydCcgJiYgZC5tb2RpZmllZENlbGxJbmRleCA9PT0gbW9kaWZpZWRDZWxsSW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIGQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZC50eXBlICE9PSAnZGVsZXRlJyAmJiBkLm1vZGlmaWVkQ2VsbEluZGV4ID4gbW9kaWZpZWRDZWxsSW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5kLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiBkLm1vZGlmaWVkQ2VsbEluZGV4IC0gMSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkO1xuXHRcdH0pO1xuXHRjb25zdCBlZGl0OiBJQ2VsbFJlcGxhY2VFZGl0ID0geyBjZWxsczogW10sIGNvdW50OiAxLCBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiBtb2RpZmllZENlbGxJbmRleCwgfTtcblx0YXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRyZXR1cm4gY2VsbERpZmZJbmZvO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlcixcblx0Y2VsbERpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10sXG5cdGNlbGxUb0luc2VydDogSUNlbGxEdG8yLFxuXHRhcHBseUVkaXRzOiB0eXBlb2YgTm90ZWJvb2tUZXh0TW9kZWwucHJvdG90eXBlLmFwcGx5RWRpdHMsXG5cdGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvOiAobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcikgPT4gSUNlbGxEaWZmSW5mbyxcbik6IElDZWxsRGlmZkluZm9bXSB7XG5cdGNlbGxEaWZmSW5mbyA9IHNvcnRDZWxsQ2hhbmdlcyhjZWxsRGlmZkluZm8pO1xuXHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0Ly8gTm90IHBvc3NpYmxlLlxuXHRcdHJldHVybiBjZWxsRGlmZkluZm87XG5cdH1cblx0Y29uc3QgaW5kZXhPZkVudHJ5ID0gY2VsbERpZmZJbmZvLmZpbmRJbmRleChkID0+IGQubW9kaWZpZWRDZWxsSW5kZXggPT09IG1vZGlmaWVkQ2VsbEluZGV4KTtcblx0aWYgKGluZGV4T2ZFbnRyeSA9PT0gLTEpIHtcblx0XHQvLyBOb3QgcG9zc2libGUuXG5cdFx0cmV0dXJuIGNlbGxEaWZmSW5mbztcblx0fVxuXHRsZXQgb3JpZ2luYWxDZWxsSW5kZXggPSAtMTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxsRGlmZkluZm8ubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBkaWZmID0gY2VsbERpZmZJbmZvW2ldO1xuXHRcdGlmIChpIDwgaW5kZXhPZkVudHJ5KSB7XG5cdFx0XHRvcmlnaW5hbENlbGxJbmRleCA9IE1hdGgubWF4KG9yaWdpbmFsQ2VsbEluZGV4LCBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID8/IG9yaWdpbmFsQ2VsbEluZGV4KTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoaSA9PT0gaW5kZXhPZkVudHJ5KSB7XG5cdFx0XHRjb25zdCBlZGl0OiBJQ2VsbFJlcGxhY2VFZGl0ID0geyBjZWxsczogW2NlbGxUb0luc2VydF0sIGNvdW50OiAwLCBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiBvcmlnaW5hbENlbGxJbmRleCArIDEgfTtcblx0XHRcdGFwcGx5RWRpdHMoW2VkaXRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGNlbGxEaWZmSW5mb1tpXSA9IGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKG1vZGlmaWVkQ2VsbEluZGV4LCBvcmlnaW5hbENlbGxJbmRleCArIDEpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEluY3JlYXNlIHRoZSBvcmlnaW5hbCBpbmRleCBmb3IgYWxsIGVudHJpZXMgYWZ0ZXIgdGhpcy5cblx0XHRcdGlmICh0eXBlb2YgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0ZGlmZi5vcmlnaW5hbENlbGxJbmRleCsrO1xuXHRcdFx0XHRjZWxsRGlmZkluZm9baV0gPSB7IC4uLmRpZmYgfTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGNlbGxEaWZmSW5mbztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKGNoYW5nZTogTm90ZWJvb2tDZWxsVGV4dE1vZGVsU3BsaWNlPElDZWxsPixcblx0Y2VsbERpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10sXG5cdG1vZGlmaWVkTW9kZWxDZWxsQ291bnQ6IG51bWJlcixcblx0b3JpZ2luYWxNb2RlbENlbGxDb3VudDogbnVtYmVyLFxuXHRhcHBseUVkaXRzOiB0eXBlb2YgTm90ZWJvb2tUZXh0TW9kZWwucHJvdG90eXBlLmFwcGx5RWRpdHMsXG5cdGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvOiAobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcikgPT4gSUNlbGxEaWZmSW5mbyxcbik6IElDZWxsRGlmZkluZm9bXSB7XG5cdGNlbGxEaWZmSW5mbyA9IHNvcnRDZWxsQ2hhbmdlcyhjZWxsRGlmZkluZm8pO1xuXHRjb25zdCBudW1iZXJPZkNlbGxzSW5zZXJ0ZWQgPSBjaGFuZ2VbMl0ubGVuZ3RoO1xuXHRjb25zdCBudW1iZXJPZkNlbGxzRGVsZXRlZCA9IGNoYW5nZVsxXTtcblx0Y29uc3QgY2VsbHMgPSBjaGFuZ2VbMl0ubWFwKGNlbGwgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjZWxsS2luZDogY2VsbC5jZWxsS2luZCxcblx0XHRcdGxhbmd1YWdlOiBjZWxsLmxhbmd1YWdlLFxuXHRcdFx0bWV0YWRhdGE6IGNlbGwubWV0YWRhdGEsXG5cdFx0XHRvdXRwdXRzOiBjZWxsLm91dHB1dHMsXG5cdFx0XHRzb3VyY2U6IGNlbGwuZ2V0VmFsdWUoKSxcblx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdGludGVybmFsTWV0YWRhdGE6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YVxuXHRcdH0gc2F0aXNmaWVzIElDZWxsRHRvMjtcblx0fSk7XG5cdGxldCBkaWZmRW50cnlJbmRleCA9IC0xO1xuXHRsZXQgaW5kZXhUb0luc2VydEluT3JpZ2luYWxNb2RlbDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRpZiAoY2VsbHMubGVuZ3RoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxsRGlmZkluZm8ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGRpZmYgPSBjZWxsRGlmZkluZm9baV07XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInICYmIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09IGNoYW5nZVswXSkge1xuXHRcdFx0XHRkaWZmRW50cnlJbmRleCA9IGk7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGluZGV4VG9JbnNlcnRJbk9yaWdpbmFsTW9kZWwgPSBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRpbmRleFRvSW5zZXJ0SW5PcmlnaW5hbE1vZGVsID0gZGlmZi5vcmlnaW5hbENlbGxJbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdDogSUNlbGxFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0Y2VsbHMsXG5cdFx0XHRpbmRleDogaW5kZXhUb0luc2VydEluT3JpZ2luYWxNb2RlbCA/PyAwLFxuXHRcdFx0Y291bnQ6IGNoYW5nZVsxXVxuXHRcdH07XG5cdFx0YXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cdC8vIElmIGNlbGxzIHdlcmUgZGVsZXRlZCB3ZSBoYW5kbGVkIHRoYXQgd2l0aCB0aGlzLmRpc3Bvc2VEZWxldGVkQ2VsbEVudHJpZXMoKTtcblx0aWYgKG51bWJlck9mQ2VsbHNEZWxldGVkKSB7XG5cdFx0Ly8gQWRqdXN0IHRoZSBpbmRleGVzLlxuXHRcdGxldCBudW1iZXJPZk9yaWdpbmFsQ2VsbHNSZW1vdmVkU29GYXIgPSAwO1xuXHRcdGxldCBudW1iZXJPZk1vZGlmaWVkQ2VsbHNSZW1vdmVkU29GYXIgPSAwO1xuXHRcdGNvbnN0IG1vZGlmaWVkSW5kZXhlc1RvUmVtb3ZlID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBudW1iZXJPZkNlbGxzRGVsZXRlZDsgaSsrKSB7XG5cdFx0XHRtb2RpZmllZEluZGV4ZXNUb1JlbW92ZS5hZGQoY2hhbmdlWzBdICsgaSk7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zVG9SZW1vdmUgPSBuZXcgU2V0PElDZWxsRGlmZkluZm8+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxsRGlmZkluZm8ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGRpZmYgPSBjZWxsRGlmZkluZm9baV07XG5cdFx0XHRpZiAoaSA8IGRpZmZFbnRyeUluZGV4KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBtb2RpZmllZEluZGV4ZXNUb1JlbW92ZS5oYXMoZGlmZi5tb2RpZmllZENlbGxJbmRleCkpIHtcblx0XHRcdFx0Ly8gVGhpcyB3aWxsIGJlIHJlbW92ZWQuXG5cdFx0XHRcdG51bWJlck9mTW9kaWZpZWRDZWxsc1JlbW92ZWRTb0ZhcisrO1xuXHRcdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0bnVtYmVyT2ZPcmlnaW5hbENlbGxzUmVtb3ZlZFNvRmFyKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0aXRlbXNUb1JlbW92ZS5hZGQoZGlmZik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBudW1iZXJPZk1vZGlmaWVkQ2VsbHNSZW1vdmVkU29GYXIpIHtcblx0XHRcdFx0ZGlmZi5tb2RpZmllZENlbGxJbmRleCAtPSBudW1iZXJPZk1vZGlmaWVkQ2VsbHNSZW1vdmVkU29GYXI7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBudW1iZXJPZk9yaWdpbmFsQ2VsbHNSZW1vdmVkU29GYXIpIHtcblx0XHRcdFx0ZGlmZi5vcmlnaW5hbENlbGxJbmRleCAtPSBudW1iZXJPZk9yaWdpbmFsQ2VsbHNSZW1vdmVkU29GYXI7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0Y2VsbERpZmZJbmZvW2ldID0geyAuLi5kaWZmIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpdGVtc1RvUmVtb3ZlLnNpemUpIHtcblx0XHRcdEFycmF5LmZyb20oaXRlbXNUb1JlbW92ZSlcblx0XHRcdFx0LmZpbHRlcihkaWZmID0+IHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJylcblx0XHRcdFx0LmZvckVhY2goZGlmZiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdDogSUNlbGxFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdLFxuXHRcdFx0XHRcdFx0aW5kZXg6IGRpZmYub3JpZ2luYWxDZWxsSW5kZXgsXG5cdFx0XHRcdFx0XHRjb3VudDogMVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0YXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cdFx0Y2VsbERpZmZJbmZvID0gY2VsbERpZmZJbmZvLmZpbHRlcihkID0+ICFpdGVtc1RvUmVtb3ZlLmhhcyhkKSk7XG5cdH1cblxuXHRpZiAobnVtYmVyT2ZDZWxsc0luc2VydGVkICYmIGRpZmZFbnRyeUluZGV4ID49IDApIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxEaWZmSW5mby5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGlmZiA9IGNlbGxEaWZmSW5mb1tpXTtcblx0XHRcdGlmIChpIDwgZGlmZkVudHJ5SW5kZXgpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ICs9IG51bWJlck9mQ2VsbHNJbnNlcnRlZDtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGRpZmYub3JpZ2luYWxDZWxsSW5kZXggKz0gbnVtYmVyT2ZDZWxsc0luc2VydGVkO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdGNlbGxEaWZmSW5mb1tpXSA9IHsgLi4uZGlmZiB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEZvciBpbnNlcnRlZCBjZWxscywgd2UgbmVlZCB0byBlbnN1cmUgdGhhdCB3ZSBjcmVhdGUgYSBjb3JyZXNwb25kaW5nIENlbGxFbnRyeS5cblx0Ly8gU28gdGhhdCBhbnkgZWRpdHMgdG8gdGhlIGluc2VydGVkIGNlbGwgaXMgaGFuZGxlZCBhbmQgbWlycm9yZWQgb3ZlciB0byB0aGUgY29ycmVzcG9uZGluZyBjZWxsIGluIG9yaWdpbmFsIG1vZGVsLlxuXHRjZWxscy5mb3JFYWNoKChfLCBpKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxDZWxsSW5kZXggPSBpICsgKGluZGV4VG9JbnNlcnRJbk9yaWdpbmFsTW9kZWwgPz8gMCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRDZWxsSW5kZXggPSBjaGFuZ2VbMF0gKyBpO1xuXHRcdGNvbnN0IHVuY2hhbmdlZENlbGwgPSBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyhtb2RpZmllZENlbGxJbmRleCwgb3JpZ2luYWxDZWxsSW5kZXgpO1xuXHRcdGNlbGxEaWZmSW5mby5zcGxpY2UoKGRpZmZFbnRyeUluZGV4ID09PSAtMSA/IGNlbGxEaWZmSW5mby5sZW5ndGggOiBkaWZmRW50cnlJbmRleCkgKyBpLCAwLCB1bmNoYW5nZWRDZWxsKTtcblx0fSk7XG5cdHJldHVybiBjZWxsRGlmZkluZm87XG59XG5cbi8qKlxuICogR2l2ZW4gdGhlIG1vdmVtZW50cyBvZiBjZWxscyBpbiBtb2RpZmllZCBub3RlYm9vaywgYWRqdXN0IHRoZSBJQ2VsbERpZmZJbmZvW10gYXJyYXlcbiAqIGFuZCBnZW5lcmF0ZSBlZGl0cyBmb3IgdGhlIG9sZCBub3RlYm9vayAoaWYgcmVxdWlyZWQpLlxuICogVE9ET0BEb25KYXlhbWFubmUgSGFuZGxlIGJ1bGsgbW92ZXMgKG1vdmVtZW50cyBvZiBtb3JlIHRoYW4gMSBjZWxsKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKGV2ZW50OiBOb3RlYm9va0NlbGxzTW9kZWxNb3ZlRXZlbnQ8SUNlbGw+LCBjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSk6IFtJQ2VsbERpZmZJbmZvW10sIElDZWxsRWRpdE9wZXJhdGlvbltdXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1pbmltdW1JbmRleCA9IE1hdGgubWluKGV2ZW50LmluZGV4LCBldmVudC5uZXdJZHgpO1xuXHRjb25zdCBtYXhpbXVtSW5kZXggPSBNYXRoLm1heChldmVudC5pbmRleCwgZXZlbnQubmV3SWR4KTtcblx0Y29uc3QgY2VsbERpZmZzID0gY2VsbERpZmZJbmZvLnNsaWNlKCk7XG5cdGNvbnN0IGluZGV4T2ZFbnRyeSA9IGNlbGxEaWZmcy5maW5kSW5kZXgoZCA9PiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBldmVudC5pbmRleCk7XG5cdGNvbnN0IGluZGV4T2ZFbnRyeVRvUGxhY2VCZWxvdyA9IGNlbGxEaWZmcy5maW5kSW5kZXgoZCA9PiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBldmVudC5uZXdJZHgpO1xuXHRpZiAoaW5kZXhPZkVudHJ5ID09PSAtMSB8fCBpbmRleE9mRW50cnlUb1BsYWNlQmVsb3cgPT09IC0xKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgb2JqZWN0IHNvIHRoYXQgdGhlIG9ic2VydmFibGUgdmFsdWUgaXMgdHJpZ2dlcmVkLlxuXHQvLyBCZXNpZGVzIHdlJ2xsIGJlIHVwZGF0aW5nIHRoZSB2YWx1ZXMgb2YgdGhpcyBvYmplY3QgaW4gcGxhY2UuXG5cdGNvbnN0IGVudHJ5VG9CZU1vdmVkID0geyAuLi5jZWxsRGlmZnNbaW5kZXhPZkVudHJ5XSB9O1xuXHRjb25zdCBtb3ZlRGlyZWN0aW9uID0gZXZlbnQubmV3SWR4ID4gZXZlbnQuaW5kZXggPyAnZG93bicgOiAndXAnO1xuXG5cblx0Y29uc3Qgc3RhcnRJbmRleCA9IGNlbGxEaWZmcy5maW5kSW5kZXgoZCA9PiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBtaW5pbXVtSW5kZXgpO1xuXHRjb25zdCBlbmRJbmRleCA9IGNlbGxEaWZmcy5maW5kSW5kZXgoZCA9PiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBtYXhpbXVtSW5kZXgpO1xuXHRjb25zdCBtb3ZpbmdFeGlzdGluZ0NlbGwgPSB0eXBlb2YgZW50cnlUb0JlTW92ZWQub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInO1xuXHRsZXQgb3JpZ2luYWxDZWxsc1dlcmVFZmZlY3RlZCA9IGZhbHNlO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxEaWZmcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGRpZmYgPSBjZWxsRGlmZnNbaV07XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAobW92ZURpcmVjdGlvbiA9PT0gJ2Rvd24nKSB7XG5cdFx0XHRpZiAoaSA+IHN0YXJ0SW5kZXggJiYgaSA8PSBlbmRJbmRleCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0ZGlmZi5tb2RpZmllZENlbGxJbmRleCA9IGRpZmYubW9kaWZpZWRDZWxsSW5kZXggLSAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicgJiYgbW92aW5nRXhpc3RpbmdDZWxsKSB7XG5cdFx0XHRcdFx0ZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9IGRpZmYub3JpZ2luYWxDZWxsSW5kZXggLSAxO1xuXHRcdFx0XHRcdG9yaWdpbmFsQ2VsbHNXZXJlRWZmZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpID49IHN0YXJ0SW5kZXggJiYgaSA8IGVuZEluZGV4KSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZGlmZi5tb2RpZmllZENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID0gZGlmZi5tb2RpZmllZENlbGxJbmRleCArIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBtb3ZpbmdFeGlzdGluZ0NlbGwpIHtcblx0XHRcdFx0XHRkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID0gZGlmZi5vcmlnaW5hbENlbGxJbmRleCArIDE7XG5cdFx0XHRcdFx0b3JpZ2luYWxDZWxsc1dlcmVFZmZlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IG9iamVjdCBzbyB0aGF0IHRoZSBvYnNlcnZhYmxlIHZhbHVlIGlzIHRyaWdnZXJlZC5cblx0XHQvLyBEbyBvbmx5IGlmIHRoZXJlJ3MgYSBjaGFuZ2UuXG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdGNlbGxEaWZmc1tpXSA9IHsgLi4uZGlmZiB9O1xuXHRcdH1cblx0fVxuXHRlbnRyeVRvQmVNb3ZlZC5tb2RpZmllZENlbGxJbmRleCA9IGV2ZW50Lm5ld0lkeDtcblx0Y29uc3Qgb3JpZ2luYWxDZWxsSW5kZXggPSBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleDtcblx0aWYgKG1vdmVEaXJlY3Rpb24gPT09ICdkb3duJykge1xuXHRcdGNlbGxEaWZmcy5zcGxpY2UoZW5kSW5kZXggKyAxLCAwLCBlbnRyeVRvQmVNb3ZlZCk7XG5cdFx0Y2VsbERpZmZzLnNwbGljZShzdGFydEluZGV4LCAxKTtcblx0XHQvLyBJZiB3ZSdyZSBtb3ZpbmcgYSBuZXcgY2VsbCB1cC9kb3duLCB0aGVuIHdlIG5lZWQganVzdCBhZGp1c3QganVzdCB0aGUgbW9kaWZpZWQgaW5kZXhlcyBvZiB0aGUgY2VsbHMgaW4gYmV0d2Vlbi5cblx0XHQvLyBJZiB3ZSdyZSBtb3ZpbmcgYW4gZXhpc3RpbmcgdXAvZG93biwgdGhlbiB3ZSBuZWVkIHRvIGFkanVzdCB0aGUgb3JpZ2luYWwgaW5kZXhlcyBhcyB3ZWxsLlxuXHRcdGlmICh0eXBlb2YgZW50cnlUb0JlTW92ZWQub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleCA9IGNlbGxEaWZmcy5zbGljZSgwLCBlbmRJbmRleCkucmVkdWNlKChsYXN0T3JpZ2luYWxJbmRleCwgZGlmZikgPT4gdHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInID8gTWF0aC5tYXgobGFzdE9yaWdpbmFsSW5kZXgsIGRpZmYub3JpZ2luYWxDZWxsSW5kZXgpIDogbGFzdE9yaWdpbmFsSW5kZXgsIC0xKSArIDE7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNlbGxEaWZmcy5zcGxpY2UoZW5kSW5kZXgsIDEpO1xuXHRcdGNlbGxEaWZmcy5zcGxpY2Uoc3RhcnRJbmRleCwgMCwgZW50cnlUb0JlTW92ZWQpO1xuXHRcdC8vIElmIHdlJ3JlIG1vdmluZyBhIG5ldyBjZWxsIHVwL2Rvd24sIHRoZW4gd2UgbmVlZCBqdXN0IGFkanVzdCBqdXN0IHRoZSBtb2RpZmllZCBpbmRleGVzIG9mIHRoZSBjZWxscyBpbiBiZXR3ZWVuLlxuXHRcdC8vIElmIHdlJ3JlIG1vdmluZyBhbiBleGlzdGluZyB1cC9kb3duLCB0aGVuIHdlIG5lZWQgdG8gYWRqdXN0IHRoZSBvcmlnaW5hbCBpbmRleGVzIGFzIHdlbGwuXG5cdFx0aWYgKHR5cGVvZiBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4ID0gY2VsbERpZmZzLnNsaWNlKDAsIHN0YXJ0SW5kZXgpLnJlZHVjZSgobGFzdE9yaWdpbmFsSW5kZXgsIGRpZmYpID0+IHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJyA/IE1hdGgubWF4KGxhc3RPcmlnaW5hbEluZGV4LCBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4KSA6IGxhc3RPcmlnaW5hbEluZGV4LCAtMSkgKyAxO1xuXHRcdH1cblx0fVxuXG5cdC8vIElmIHRoaXMgaXMgYSBuZXcgY2VsbCB0aGF0IHdlJ3JlIG1vdmluZywgYW5kIHRoZXJlIGFyZSBubyBleGlzdGluZyBjZWxscyBpbiBiZXR3ZWVuLCB0aGVuIHdlIGNhbiBqdXN0IG1vdmUgdGhlIG5ldyBjZWxsLlxuXHQvLyBJLmUuIG5vIG5lZWQgdG8gdXBkYXRlIHRoZSBvcmlnaW5hbCBub3RlYm9vayBtb2RlbC5cblx0aWYgKHR5cGVvZiBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicgJiYgb3JpZ2luYWxDZWxsc1dlcmVFZmZlY3RlZCAmJiB0eXBlb2Ygb3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInICYmIGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4ICE9PSBvcmlnaW5hbENlbGxJbmRleCkge1xuXHRcdGNvbnN0IGVkaXQ6IElDZWxsRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTW92ZSxcblx0XHRcdGluZGV4OiBvcmlnaW5hbENlbGxJbmRleCxcblx0XHRcdGxlbmd0aDogZXZlbnQubGVuZ3RoLFxuXHRcdFx0bmV3SWR4OiBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleFxuXHRcdH07XG5cblx0XHRyZXR1cm4gW2NlbGxEaWZmcywgW2VkaXRdXTtcblx0fVxuXG5cdHJldHVybiBbY2VsbERpZmZzLCBbXV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb3JyZXNwb25kaW5nT3JpZ2luYWxDZWxsSW5kZXgobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlciwgY2VsbERpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBlbnRyeSA9IGNlbGxEaWZmSW5mby5maW5kKGQgPT4gZC5tb2RpZmllZENlbGxJbmRleCA9PT0gbW9kaWZpZWRDZWxsSW5kZXgpO1xuXHRyZXR1cm4gZW50cnk/Lm9yaWdpbmFsQ2VsbEluZGV4O1xufVxuXG4vKipcbiAqXG4gKiBUaGlzIGlzbid0IGdyZWF0LCBidXQgbmVjZXNzYXJ5LlxuICogaXB5bmIgZXh0ZW5zaW9uIHVwZGF0ZXMgbWV0YWRhdGEgd2hlbiBuZXcgY2VsbHMgYXJlIGluc2VydGVkICh0byBlbnN1cmUgdGhlIG1ldGFkYXRhIGlzIGNvcnJlY3QpXG4gKiBEZXRhaWxzIG9mIHdoeSB0aGF0cyByZXF1aXJlZCBpcyBpbiBpcHluYiBleHRlbnNpb24sIGJ1dCBpdHMgbmVjZXNzYXJ5LlxuICogSG93ZXZlciBhcyBhIHJlc3VsdCBvZiB0aGlzLCB0aG9zZSBlZGl0cyBhcHBlYXIgaGVyZSBhbmQgYXJlIGFzc3VtZWQgdG8gYmUgdXNlciBlZGl0cy5cbiAqIEFzIGEgcmVzdWx0IGBfYWxsRWRpdHNBcmVGcm9tVXNgIGlzIHNldCB0byBmYWxzZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzVHJhbnNpZW50SVB5TmJFeHRlbnNpb25FdmVudChub3RlYm9va0tpbmQ6IHN0cmluZywgZTogTm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQpIHtcblx0aWYgKG5vdGVib29rS2luZCAhPT0gJ2p1cHl0ZXItbm90ZWJvb2snKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChlLnJhd0V2ZW50cy5ldmVyeShldmVudCA9PiB7XG5cdFx0aWYgKGV2ZW50LmtpbmQgIT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoSlNPTi5zdHJpbmdpZnkoZXZlbnQubWV0YWRhdGEgfHwge30pID09PSBKU09OLnN0cmluZ2lmeSh7IGV4ZWN1dGlvbl9jb3VudDogbnVsbCwgbWV0YWRhdGE6IHt9IH0pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cblx0fSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZU5vdGVib29rUmV3cml0ZVJhdGlvKGNlbGxzRGlmZjogSUNlbGxEaWZmSW5mb1tdLCBvcmlnaW5hbE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgbW9kaWZpZWRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRjb25zdCB0b3RhbE51bWJlck9mVXBkYXRlZExpbmVzID0gY2VsbHNEaWZmLnJlZHVjZSgodG90YWxVcGRhdGVkTGluZXMsIHZhbHVlKSA9PiB7XG5cdFx0Y29uc3QgZ2V0VXBhZHRlZExpbmVDb3VudCA9ICgpID0+IHtcblx0XHRcdGlmICh2YWx1ZS50eXBlID09PSAndW5jaGFuZ2VkJykge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZS50eXBlID09PSAnZGVsZXRlJykge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxNb2RlbC5jZWxsc1t2YWx1ZS5vcmlnaW5hbENlbGxJbmRleF0udGV4dE1vZGVsPy5nZXRMaW5lQ291bnQoKSA/PyAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlLnR5cGUgPT09ICdpbnNlcnQnKSB7XG5cdFx0XHRcdHJldHVybiBtb2RpZmllZE1vZGVsLmNlbGxzW3ZhbHVlLm1vZGlmaWVkQ2VsbEluZGV4XS50ZXh0TW9kZWw/LmdldExpbmVDb3VudCgpID8/IDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWUuZGlmZi5nZXQoKS5jaGFuZ2VzLnJlZHVjZSgobWF4TGluZU51bWJlciwgY2hhbmdlKSA9PiB7XG5cdFx0XHRcdHJldHVybiBNYXRoLm1heChtYXhMaW5lTnVtYmVyLCBjaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSk7XG5cdFx0XHR9LCAwKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRvdGFsVXBkYXRlZExpbmVzICsgZ2V0VXBhZHRlZExpbmVDb3VudCgpO1xuXHR9LCAwKTtcblxuXHRjb25zdCB0b3RhbE51bWJlck9mTGluZXMgPSBtb2RpZmllZE1vZGVsLmNlbGxzLnJlZHVjZSgodG90YWxMaW5lcywgY2VsbCkgPT4gdG90YWxMaW5lcyArIChjZWxsLnRleHRNb2RlbD8uZ2V0TGluZUNvdW50KCkgPz8gMCksIDApO1xuXHRyZXR1cm4gdG90YWxOdW1iZXJPZkxpbmVzID09PSAwID8gMCA6IE1hdGgubWluKDEsIHRvdGFsTnVtYmVyT2ZVcGRhdGVkTGluZXMgLyB0b3RhbE51bWJlck9mTGluZXMpO1xuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGNBQXNFLCtCQUF3SDtBQUN2TSxTQUF3Qix1QkFBdUI7QUFHeEMsU0FBUyxxQ0FBcUMsbUJBQ3BELGNBQ0EsWUFDa0I7QUFFbEIsUUFBTSxPQUF5QixFQUFFLE9BQU8sQ0FBQyxHQUFHLE9BQU8sR0FBRyxVQUFVLGFBQWEsU0FBUyxPQUFPLGtCQUFtQjtBQUNoSCxhQUFXLENBQUMsSUFBSSxHQUFHLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxJQUFJO0FBQ3BFLFFBQU0sUUFBUSxnQkFBZ0Is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
