import { Emitter } from "../../../../base/common/event.js";
import { FoldingRegions, FoldSource } from "./foldingRanges.js";
import { hash } from "../../../../base/common/hash.js";
import { Range } from "../../../common/core/range.js";
class FoldingModel {
  constructor(textModel, decorationProvider) {
    this._updateEventEmitter = new Emitter();
    this.onDidChange = this._updateEventEmitter.event;
    this._textModel = textModel;
    this._decorationProvider = decorationProvider;
    this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
    this._editorDecorationIds = [];
  }
  get regions() {
    return this._regions;
  }
  get textModel() {
    return this._textModel;
  }
  get decorationProvider() {
    return this._decorationProvider;
  }
  toggleCollapseState(toggledRegions) {
    if (!toggledRegions.length) {
      return;
    }
    toggledRegions = toggledRegions.sort((r1, r2) => r1.regionIndex - r2.regionIndex);
    const processed = {};
    this._decorationProvider.changeDecorations((accessor) => {
      let k = 0;
      let dirtyRegionEndLine = -1;
      let lastHiddenLine = -1;
      const updateDecorationsUntil = (index) => {
        while (k < index) {
          const endLineNumber = this._regions.getEndLineNumber(k);
          const isCollapsed = this._regions.isCollapsed(k);
          if (endLineNumber <= dirtyRegionEndLine) {
            const isManual = this.regions.getSource(k) !== FoldSource.provider;
            accessor.changeDecorationOptions(this._editorDecorationIds[k], this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual));
          }
          if (isCollapsed && endLineNumber > lastHiddenLine) {
            lastHiddenLine = endLineNumber;
          }
          k++;
        }
      };
      for (const region of toggledRegions) {
        const index = region.regionIndex;
        const editorDecorationId = this._editorDecorationIds[index];
        if (editorDecorationId && !processed[editorDecorationId]) {
          processed[editorDecorationId] = true;
          updateDecorationsUntil(index);
          const newCollapseState = !this._regions.isCollapsed(index);
          this._regions.setCollapsed(index, newCollapseState);
          dirtyRegionEndLine = Math.max(dirtyRegionEndLine, this._regions.getEndLineNumber(index));
        }
      }
      updateDecorationsUntil(this._regions.length);
    });
    this._updateEventEmitter.fire({ model: this, collapseStateChanged: toggledRegions });
  }
  removeManualRanges(ranges) {
    const rangeIndexesToRemove = /* @__PURE__ */ new Set();
    let removeAll = false;
    for (const range of ranges) {
      if (Range.isEmpty(range)) {
        let index = this._regions.findRange(range.startLineNumber);
        while (index !== -1 && this._regions.getSource(index) === FoldSource.provider) {
          index = this._regions.getParentIndex(index);
        }
        if (index === -1) {
          removeAll = true;
        } else {
          rangeIndexesToRemove.add(index);
        }
      }
    }
    const newFoldingRanges = new Array();
    const intersectsSelection = (foldRange) => {
      for (const range of ranges) {
        if (!Range.isEmpty(range) && !(range.startLineNumber > foldRange.endLineNumber || foldRange.startLineNumber > range.endLineNumber)) {
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < this._regions.length; i++) {
      const foldRange = this._regions.toFoldRange(i);
      if (foldRange.source === FoldSource.provider || !removeAll && !rangeIndexesToRemove.has(i) && !intersectsSelection(foldRange)) {
        newFoldingRanges.push(foldRange);
      }
    }
    this.updatePost(FoldingRegions.fromFoldRanges(newFoldingRanges));
  }
  update(newRegions, selection) {
    const foldedOrManualRanges = this._currentFoldedOrManualRanges(selection);
    const newRanges = FoldingRegions.sanitizeAndMerge(newRegions, foldedOrManualRanges, this._textModel.getLineCount(), selection);
    this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
  }
  updatePost(newRegions) {
    const newEditorDecorations = [];
    let lastHiddenLine = -1;
    for (let index = 0, limit = newRegions.length; index < limit; index++) {
      const startLineNumber = newRegions.getStartLineNumber(index);
      const endLineNumber = newRegions.getEndLineNumber(index);
      const isCollapsed = newRegions.isCollapsed(index);
      const isManual = newRegions.getSource(index) !== FoldSource.provider;
      const decorationRange = {
        startLineNumber,
        startColumn: this._textModel.getLineMaxColumn(startLineNumber),
        endLineNumber,
        endColumn: this._textModel.getLineMaxColumn(endLineNumber) + 1
      };
      newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual) });
      if (isCollapsed && endLineNumber > lastHiddenLine) {
        lastHiddenLine = endLineNumber;
      }
    }
    this._decorationProvider.changeDecorations((accessor) => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
    this._regions = newRegions;
    this._updateEventEmitter.fire({ model: this });
  }
  _currentFoldedOrManualRanges(selection) {
    const foldedRanges = [];
    for (let i = 0, limit = this._regions.length; i < limit; i++) {
      let isCollapsed = this.regions.isCollapsed(i);
      const source = this.regions.getSource(i);
      if (isCollapsed || source !== FoldSource.provider) {
        const foldRange = this._regions.toFoldRange(i);
        const decRange = this._textModel.getDecorationRange(this._editorDecorationIds[i]);
        if (decRange) {
          if (isCollapsed && selection?.startsInside(decRange.startLineNumber + 1, decRange.endLineNumber)) {
            isCollapsed = false;
          }
          foldedRanges.push({
            startLineNumber: decRange.startLineNumber,
            endLineNumber: decRange.endLineNumber,
            type: foldRange.type,
            isCollapsed,
            source
          });
        }
      }
    }
    return foldedRanges;
  }
  /**
   * Collapse state memento, for persistence only
   */
  getMemento() {
    const foldedOrManualRanges = this._currentFoldedOrManualRanges();
    const result = [];
    const maxLineNumber = this._textModel.getLineCount();
    for (let i = 0, limit = foldedOrManualRanges.length; i < limit; i++) {
      const range = foldedOrManualRanges[i];
      if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
        continue;
      }
      const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
      result.push({
        startLineNumber: range.startLineNumber,
        endLineNumber: range.endLineNumber,
        isCollapsed: range.isCollapsed,
        source: range.source,
        checksum
      });
    }
    return result.length > 0 ? result : void 0;
  }
  /**
   * Apply persisted state, for persistence only
   */
  applyMemento(state) {
    if (!Array.isArray(state)) {
      return;
    }
    const rangesToRestore = [];
    const maxLineNumber = this._textModel.getLineCount();
    for (const range of state) {
      if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
        continue;
      }
      const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
      if (!range.checksum || checksum === range.checksum) {
        rangesToRestore.push({
          startLineNumber: range.startLineNumber,
          endLineNumber: range.endLineNumber,
          type: void 0,
          isCollapsed: range.isCollapsed ?? true,
          source: range.source ?? FoldSource.provider
        });
      }
    }
    const newRanges = FoldingRegions.sanitizeAndMerge(this._regions, rangesToRestore, maxLineNumber);
    this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
  }
  _getLinesChecksum(lineNumber1, lineNumber2) {
    const h = hash(this._textModel.getLineContent(lineNumber1) + this._textModel.getLineContent(lineNumber2));
    return h % 1e6;
  }
  dispose() {
    this._decorationProvider.removeDecorations(this._editorDecorationIds);
    this._updateEventEmitter.dispose();
  }
  getAllRegionsAtLine(lineNumber, filter) {
    const result = [];
    if (this._regions) {
      let index = this._regions.findRange(lineNumber);
      let level = 1;
      while (index >= 0) {
        const current = this._regions.toRegion(index);
        if (!filter || filter(current, level)) {
          result.push(current);
        }
        level++;
        index = current.parentIndex;
      }
    }
    return result;
  }
  getRegionAtLine(lineNumber) {
    if (this._regions) {
      const index = this._regions.findRange(lineNumber);
      if (index >= 0) {
        return this._regions.toRegion(index);
      }
    }
    return null;
  }
  getRegionsInside(region, filter) {
    const result = [];
    const index = region ? region.regionIndex + 1 : 0;
    const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;
    if (filter && filter.length === 2) {
      const levelStack = [];
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
            levelStack.pop();
          }
          levelStack.push(current);
          if (filter(current, levelStack.length)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    } else {
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          if (!filter || filter(current)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    }
    return result;
  }
}
function toggleCollapseState(foldingModel, levels, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const region = foldingModel.getRegionAtLine(lineNumber);
    if (region) {
      const doCollapse = !region.isCollapsed;
      toToggle.push(region);
      if (levels > 1) {
        const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
        toToggle.push(...regionsInside);
      }
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateLevelsDown(foldingModel, doCollapse, levels = Number.MAX_VALUE, lineNumbers) {
  const toToggle = [];
  if (lineNumbers && lineNumbers.length > 0) {
    for (const lineNumber of lineNumbers) {
      const region = foldingModel.getRegionAtLine(lineNumber);
      if (region) {
        if (region.isCollapsed !== doCollapse) {
          toToggle.push(region);
        }
        if (levels > 1) {
          const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
          toToggle.push(...regionsInside);
        }
      }
    }
  } else {
    const regionsInside = foldingModel.getRegionsInside(null, (r, level) => r.isCollapsed !== doCollapse && level < levels);
    toToggle.push(...regionsInside);
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateLevelsUp(foldingModel, doCollapse, levels, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region, level) => region.isCollapsed !== doCollapse && level <= levels);
    toToggle.push(...regions);
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateUp(foldingModel, doCollapse, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region) => region.isCollapsed !== doCollapse);
    if (regions.length > 0) {
      toToggle.push(regions[0]);
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateAtLevel(foldingModel, foldLevel, doCollapse, blockedLineNumbers) {
  const filter = (region, level) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some((line) => region.containsLine(line));
  const toToggle = foldingModel.getRegionsInside(null, filter);
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForRest(foldingModel, doCollapse, blockedLineNumbers) {
  const filteredRegions = [];
  for (const lineNumber of blockedLineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, void 0);
    if (regions.length > 0) {
      filteredRegions.push(regions[0]);
    }
  }
  const filter = (region) => filteredRegions.every((filteredRegion) => !filteredRegion.containedBy(region) && !region.containedBy(filteredRegion)) && region.isCollapsed !== doCollapse;
  const toToggle = foldingModel.getRegionsInside(null, filter);
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForMatchingLines(foldingModel, regExp, doCollapse) {
  const editorModel = foldingModel.textModel;
  const regions = foldingModel.regions;
  const toToggle = [];
  for (let i = regions.length - 1; i >= 0; i--) {
    if (doCollapse !== regions.isCollapsed(i)) {
      const startLineNumber = regions.getStartLineNumber(i);
      if (regExp.test(editorModel.getLineContent(startLineNumber))) {
        toToggle.push(regions.toRegion(i));
      }
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForType(foldingModel, type, doCollapse) {
  const regions = foldingModel.regions;
  const toToggle = [];
  for (let i = regions.length - 1; i >= 0; i--) {
    if (doCollapse !== regions.isCollapsed(i) && type === regions.getType(i)) {
      toToggle.push(regions.toRegion(i));
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function getParentFoldLine(lineNumber, foldingModel) {
  let startLineNumber = null;
  const foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null) {
    startLineNumber = foldingRegion.startLineNumber;
    if (lineNumber === startLineNumber) {
      const parentFoldingIdx = foldingRegion.parentIndex;
      if (parentFoldingIdx !== -1) {
        startLineNumber = foldingModel.regions.getStartLineNumber(parentFoldingIdx);
      } else {
        startLineNumber = null;
      }
    }
  }
  return startLineNumber;
}
function getPreviousFoldLine(lineNumber, foldingModel) {
  let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
    if (lineNumber !== foldingRegion.startLineNumber) {
      return foldingRegion.startLineNumber;
    } else {
      const expectedParentIndex = foldingRegion.parentIndex;
      let minLineNumber = 0;
      if (expectedParentIndex !== -1) {
        minLineNumber = foldingModel.regions.getStartLineNumber(foldingRegion.parentIndex);
      }
      while (foldingRegion !== null) {
        if (foldingRegion.regionIndex > 0) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
          if (foldingRegion.startLineNumber <= minLineNumber) {
            return null;
          } else if (foldingRegion.parentIndex === expectedParentIndex) {
            return foldingRegion.startLineNumber;
          }
        } else {
          return null;
        }
      }
    }
  } else {
    if (foldingModel.regions.length > 0) {
      foldingRegion = foldingModel.regions.toRegion(foldingModel.regions.length - 1);
      while (foldingRegion !== null) {
        if (foldingRegion.startLineNumber < lineNumber) {
          return foldingRegion.startLineNumber;
        }
        if (foldingRegion.regionIndex > 0) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
        } else {
          foldingRegion = null;
        }
      }
    }
  }
  return null;
}
function getNextFoldLine(lineNumber, foldingModel) {
  let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
    const expectedParentIndex = foldingRegion.parentIndex;
    let maxLineNumber = 0;
    if (expectedParentIndex !== -1) {
      maxLineNumber = foldingModel.regions.getEndLineNumber(foldingRegion.parentIndex);
    } else if (foldingModel.regions.length === 0) {
      return null;
    } else {
      maxLineNumber = foldingModel.regions.getEndLineNumber(foldingModel.regions.length - 1);
    }
    while (foldingRegion !== null) {
      if (foldingRegion.regionIndex < foldingModel.regions.length) {
        foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
        if (foldingRegion.startLineNumber >= maxLineNumber) {
          return null;
        } else if (foldingRegion.parentIndex === expectedParentIndex) {
          return foldingRegion.startLineNumber;
        }
      } else {
        return null;
      }
    }
  } else {
    if (foldingModel.regions.length > 0) {
      foldingRegion = foldingModel.regions.toRegion(0);
      while (foldingRegion !== null) {
        if (foldingRegion.startLineNumber > lineNumber) {
          return foldingRegion.startLineNumber;
        }
        if (foldingRegion.regionIndex < foldingModel.regions.length) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
        } else {
          foldingRegion = null;
        }
      }
    }
  }
  return null;
}
export {
  FoldingModel,
  getNextFoldLine,
  getParentFoldLine,
  getPreviousFoldLine,
  setCollapseStateAtLevel,
  setCollapseStateForMatchingLines,
  setCollapseStateForRest,
  setCollapseStateForType,
  setCollapseStateLevelsDown,
  setCollapseStateLevelsUp,
  setCollapseStateUp,
  toggleCollapseState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXGJyb3dzZXJcXGZvbGRpbmdNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9uLCBGb2xkaW5nUmVnaW9ucywgSUxpbmVSYW5nZSwgRm9sZFJhbmdlLCBGb2xkU291cmNlIH0gZnJvbSAnLi9mb2xkaW5nUmFuZ2VzLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IFNlbGVjdGVkTGluZXMgfSBmcm9tICcuL2ZvbGRpbmcuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRGVjb3JhdGlvblByb3ZpZGVyIHtcblx0Z2V0RGVjb3JhdGlvbk9wdGlvbihpc0NvbGxhcHNlZDogYm9vbGVhbiwgaXNIaWRkZW46IGJvb2xlYW4sIGlzTWFudWFsOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdGNoYW5nZURlY29yYXRpb25zPFQ+KGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IFQpOiBUIHwgbnVsbDtcblx0cmVtb3ZlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbklkczogc3RyaW5nW10pOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvbGRpbmdNb2RlbENoYW5nZUV2ZW50IHtcblx0bW9kZWw6IEZvbGRpbmdNb2RlbDtcblx0Y29sbGFwc2VTdGF0ZUNoYW5nZWQ/OiBGb2xkaW5nUmVnaW9uW107XG59XG5cbmludGVyZmFjZSBJTGluZU1lbWVudG8gZXh0ZW5kcyBJTGluZVJhbmdlIHtcblx0Y2hlY2tzdW0/OiBudW1iZXI7XG5cdGlzQ29sbGFwc2VkPzogYm9vbGVhbjtcblx0c291cmNlPzogRm9sZFNvdXJjZTtcbn1cblxuZXhwb3J0IHR5cGUgQ29sbGFwc2VNZW1lbnRvID0gSUxpbmVNZW1lbnRvW107XG5cbmV4cG9ydCBjbGFzcyBGb2xkaW5nTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvblByb3ZpZGVyOiBJRGVjb3JhdGlvblByb3ZpZGVyO1xuXG5cdHByaXZhdGUgX3JlZ2lvbnM6IEZvbGRpbmdSZWdpb25zO1xuXHRwcml2YXRlIF9lZGl0b3JEZWNvcmF0aW9uSWRzOiBzdHJpbmdbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVFdmVudEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxGb2xkaW5nTW9kZWxDaGFuZ2VFdmVudD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxGb2xkaW5nTW9kZWxDaGFuZ2VFdmVudD4gPSB0aGlzLl91cGRhdGVFdmVudEVtaXR0ZXIuZXZlbnQ7XG5cblx0cHVibGljIGdldCByZWdpb25zKCk6IEZvbGRpbmdSZWdpb25zIHsgcmV0dXJuIHRoaXMuX3JlZ2lvbnM7IH1cblx0cHVibGljIGdldCB0ZXh0TW9kZWwoKSB7IHJldHVybiB0aGlzLl90ZXh0TW9kZWw7IH1cblx0cHVibGljIGdldCBkZWNvcmF0aW9uUHJvdmlkZXIoKSB7IHJldHVybiB0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXI7IH1cblxuXHRjb25zdHJ1Y3Rvcih0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGRlY29yYXRpb25Qcm92aWRlcjogSURlY29yYXRpb25Qcm92aWRlcikge1xuXHRcdHRoaXMuX3RleHRNb2RlbCA9IHRleHRNb2RlbDtcblx0XHR0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIgPSBkZWNvcmF0aW9uUHJvdmlkZXI7XG5cdFx0dGhpcy5fcmVnaW9ucyA9IG5ldyBGb2xkaW5nUmVnaW9ucyhuZXcgVWludDMyQXJyYXkoMCksIG5ldyBVaW50MzJBcnJheSgwKSk7XG5cdFx0dGhpcy5fZWRpdG9yRGVjb3JhdGlvbklkcyA9IFtdO1xuXHR9XG5cblx0cHVibGljIHRvZ2dsZUNvbGxhcHNlU3RhdGUodG9nZ2xlZFJlZ2lvbnM6IEZvbGRpbmdSZWdpb25bXSkge1xuXHRcdGlmICghdG9nZ2xlZFJlZ2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRvZ2dsZWRSZWdpb25zID0gdG9nZ2xlZFJlZ2lvbnMuc29ydCgocjEsIHIyKSA9PiByMS5yZWdpb25JbmRleCAtIHIyLnJlZ2lvbkluZGV4KTtcblxuXHRcdGNvbnN0IHByb2Nlc3NlZDogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIHwgdW5kZWZpbmVkIH0gPSB7fTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0bGV0IGsgPSAwOyAvLyBpbmRleCBmcm9tIFswIC4uLiB0aGlzLnJlZ2lvbnMubGVuZ3RoXVxuXHRcdFx0bGV0IGRpcnR5UmVnaW9uRW5kTGluZSA9IC0xOyAvLyBlbmQgb2YgdGhlIHJhbmdlIHdoZXJlIGRlY29yYXRpb25zIG5lZWQgdG8gYmUgdXBkYXRlZFxuXHRcdFx0bGV0IGxhc3RIaWRkZW5MaW5lID0gLTE7IC8vIHRoZSBlbmQgb2YgdGhlIGxhc3QgaGlkZGVuIGxpbmVzXG5cdFx0XHRjb25zdCB1cGRhdGVEZWNvcmF0aW9uc1VudGlsID0gKGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdFx0d2hpbGUgKGsgPCBpbmRleCkge1xuXHRcdFx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLl9yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoayk7XG5cdFx0XHRcdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLl9yZWdpb25zLmlzQ29sbGFwc2VkKGspO1xuXHRcdFx0XHRcdGlmIChlbmRMaW5lTnVtYmVyIDw9IGRpcnR5UmVnaW9uRW5kTGluZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNNYW51YWwgPSB0aGlzLnJlZ2lvbnMuZ2V0U291cmNlKGspICE9PSBGb2xkU291cmNlLnByb3ZpZGVyO1xuXHRcdFx0XHRcdFx0YWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnModGhpcy5fZWRpdG9yRGVjb3JhdGlvbklkc1trXSwgdGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmdldERlY29yYXRpb25PcHRpb24oaXNDb2xsYXBzZWQsIGVuZExpbmVOdW1iZXIgPD0gbGFzdEhpZGRlbkxpbmUsIGlzTWFudWFsKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc0NvbGxhcHNlZCAmJiBlbmRMaW5lTnVtYmVyID4gbGFzdEhpZGRlbkxpbmUpIHtcblx0XHRcdFx0XHRcdGxhc3RIaWRkZW5MaW5lID0gZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChjb25zdCByZWdpb24gb2YgdG9nZ2xlZFJlZ2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSByZWdpb24ucmVnaW9uSW5kZXg7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckRlY29yYXRpb25JZCA9IHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHNbaW5kZXhdO1xuXHRcdFx0XHRpZiAoZWRpdG9yRGVjb3JhdGlvbklkICYmICFwcm9jZXNzZWRbZWRpdG9yRGVjb3JhdGlvbklkXSkge1xuXHRcdFx0XHRcdHByb2Nlc3NlZFtlZGl0b3JEZWNvcmF0aW9uSWRdID0gdHJ1ZTtcblxuXHRcdFx0XHRcdHVwZGF0ZURlY29yYXRpb25zVW50aWwoaW5kZXgpOyAvLyB1cGRhdGUgYWxsIGRlY29yYXRpb25zIHVwIHRvIGN1cnJlbnQgaW5kZXggdXNpbmcgdGhlIG9sZCBkaXJ0eVJlZ2lvbkVuZExpbmVcblxuXHRcdFx0XHRcdGNvbnN0IG5ld0NvbGxhcHNlU3RhdGUgPSAhdGhpcy5fcmVnaW9ucy5pc0NvbGxhcHNlZChpbmRleCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaW9ucy5zZXRDb2xsYXBzZWQoaW5kZXgsIG5ld0NvbGxhcHNlU3RhdGUpO1xuXG5cdFx0XHRcdFx0ZGlydHlSZWdpb25FbmRMaW5lID0gTWF0aC5tYXgoZGlydHlSZWdpb25FbmRMaW5lLCB0aGlzLl9yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoaW5kZXgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dXBkYXRlRGVjb3JhdGlvbnNVbnRpbCh0aGlzLl9yZWdpb25zLmxlbmd0aCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fdXBkYXRlRXZlbnRFbWl0dGVyLmZpcmUoeyBtb2RlbDogdGhpcywgY29sbGFwc2VTdGF0ZUNoYW5nZWQ6IHRvZ2dsZWRSZWdpb25zIH0pO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZU1hbnVhbFJhbmdlcyhyYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdKSB7XG5cdFx0Y29uc3QgcmFuZ2VJbmRleGVzVG9SZW1vdmUgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRsZXQgcmVtb3ZlQWxsID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXMpIHtcblx0XHRcdGlmIChSYW5nZS5pc0VtcHR5KHJhbmdlKSkge1xuXHRcdFx0XHRsZXQgaW5kZXggPSB0aGlzLl9yZWdpb25zLmZpbmRSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHR3aGlsZSAoaW5kZXggIT09IC0xICYmIHRoaXMuX3JlZ2lvbnMuZ2V0U291cmNlKGluZGV4KSA9PT0gRm9sZFNvdXJjZS5wcm92aWRlcikge1xuXHRcdFx0XHRcdGluZGV4ID0gdGhpcy5fcmVnaW9ucy5nZXRQYXJlbnRJbmRleChpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJlbW92ZUFsbCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmFuZ2VJbmRleGVzVG9SZW1vdmUuYWRkKGluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBuZXdGb2xkaW5nUmFuZ2VzOiBGb2xkUmFuZ2VbXSA9IG5ldyBBcnJheSgpO1xuXHRcdGNvbnN0IGludGVyc2VjdHNTZWxlY3Rpb24gPSAoZm9sZFJhbmdlOiBGb2xkUmFuZ2UpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzKSB7XG5cdFx0XHRcdGlmICghUmFuZ2UuaXNFbXB0eShyYW5nZSkgJiYgIShyYW5nZS5zdGFydExpbmVOdW1iZXIgPiBmb2xkUmFuZ2UuZW5kTGluZU51bWJlciB8fCBmb2xkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yZWdpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBmb2xkUmFuZ2UgPSB0aGlzLl9yZWdpb25zLnRvRm9sZFJhbmdlKGkpO1xuXHRcdFx0aWYgKGZvbGRSYW5nZS5zb3VyY2UgPT09IEZvbGRTb3VyY2UucHJvdmlkZXIgfHwgKCFyZW1vdmVBbGwgJiYgIXJhbmdlSW5kZXhlc1RvUmVtb3ZlLmhhcyhpKSAmJiAhaW50ZXJzZWN0c1NlbGVjdGlvbihmb2xkUmFuZ2UpKSkge1xuXHRcdFx0XHRuZXdGb2xkaW5nUmFuZ2VzLnB1c2goZm9sZFJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy51cGRhdGVQb3N0KEZvbGRpbmdSZWdpb25zLmZyb21Gb2xkUmFuZ2VzKG5ld0ZvbGRpbmdSYW5nZXMpKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUobmV3UmVnaW9uczogRm9sZGluZ1JlZ2lvbnMsIHNlbGVjdGlvbj86IFNlbGVjdGVkTGluZXMpOiB2b2lkIHtcblx0XHRjb25zdCBmb2xkZWRPck1hbnVhbFJhbmdlcyA9IHRoaXMuX2N1cnJlbnRGb2xkZWRPck1hbnVhbFJhbmdlcyhzZWxlY3Rpb24pO1xuXHRcdGNvbnN0IG5ld1JhbmdlcyA9IEZvbGRpbmdSZWdpb25zLnNhbml0aXplQW5kTWVyZ2UobmV3UmVnaW9ucywgZm9sZGVkT3JNYW51YWxSYW5nZXMsIHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ291bnQoKSwgc2VsZWN0aW9uKTtcblx0XHR0aGlzLnVwZGF0ZVBvc3QoRm9sZGluZ1JlZ2lvbnMuZnJvbUZvbGRSYW5nZXMobmV3UmFuZ2VzKSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlUG9zdChuZXdSZWdpb25zOiBGb2xkaW5nUmVnaW9ucykge1xuXHRcdGNvbnN0IG5ld0VkaXRvckRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGxldCBsYXN0SGlkZGVuTGluZSA9IC0xO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMCwgbGltaXQgPSBuZXdSZWdpb25zLmxlbmd0aDsgaW5kZXggPCBsaW1pdDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gbmV3UmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaW5kZXgpO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IG5ld1JlZ2lvbnMuZ2V0RW5kTGluZU51bWJlcihpbmRleCk7XG5cdFx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IG5ld1JlZ2lvbnMuaXNDb2xsYXBzZWQoaW5kZXgpO1xuXHRcdFx0Y29uc3QgaXNNYW51YWwgPSBuZXdSZWdpb25zLmdldFNvdXJjZShpbmRleCkgIT09IEZvbGRTb3VyY2UucHJvdmlkZXI7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uUmFuZ2UgPSB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbjogdGhpcy5fdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4oc3RhcnRMaW5lTnVtYmVyKSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uOiB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKSArIDFcblx0XHRcdH07XG5cdFx0XHRuZXdFZGl0b3JEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGRlY29yYXRpb25SYW5nZSwgb3B0aW9uczogdGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmdldERlY29yYXRpb25PcHRpb24oaXNDb2xsYXBzZWQsIGVuZExpbmVOdW1iZXIgPD0gbGFzdEhpZGRlbkxpbmUsIGlzTWFudWFsKSB9KTtcblx0XHRcdGlmIChpc0NvbGxhcHNlZCAmJiBlbmRMaW5lTnVtYmVyID4gbGFzdEhpZGRlbkxpbmUpIHtcblx0XHRcdFx0bGFzdEhpZGRlbkxpbmUgPSBlbmRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4gdGhpcy5fZWRpdG9yRGVjb3JhdGlvbklkcyA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fZWRpdG9yRGVjb3JhdGlvbklkcywgbmV3RWRpdG9yRGVjb3JhdGlvbnMpKTtcblx0XHR0aGlzLl9yZWdpb25zID0gbmV3UmVnaW9ucztcblx0XHR0aGlzLl91cGRhdGVFdmVudEVtaXR0ZXIuZmlyZSh7IG1vZGVsOiB0aGlzIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3VycmVudEZvbGRlZE9yTWFudWFsUmFuZ2VzKHNlbGVjdGlvbj86IFNlbGVjdGVkTGluZXMpOiBGb2xkUmFuZ2VbXSB7XG5cdFx0Y29uc3QgZm9sZGVkUmFuZ2VzOiBGb2xkUmFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsaW1pdCA9IHRoaXMuX3JlZ2lvbnMubGVuZ3RoOyBpIDwgbGltaXQ7IGkrKykge1xuXHRcdFx0bGV0IGlzQ29sbGFwc2VkID0gdGhpcy5yZWdpb25zLmlzQ29sbGFwc2VkKGkpO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gdGhpcy5yZWdpb25zLmdldFNvdXJjZShpKTtcblx0XHRcdGlmIChpc0NvbGxhcHNlZCB8fCBzb3VyY2UgIT09IEZvbGRTb3VyY2UucHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgZm9sZFJhbmdlID0gdGhpcy5fcmVnaW9ucy50b0ZvbGRSYW5nZShpKTtcblx0XHRcdFx0Y29uc3QgZGVjUmFuZ2UgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHNbaV0pO1xuXHRcdFx0XHRpZiAoZGVjUmFuZ2UpIHtcblx0XHRcdFx0XHRpZiAoaXNDb2xsYXBzZWQgJiYgc2VsZWN0aW9uPy5zdGFydHNJbnNpZGUoZGVjUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMSwgZGVjUmFuZ2UuZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdGlzQ29sbGFwc2VkID0gZmFsc2U7IC8vIHVuY29sbGFwc2UgaXMgdGhlIHJhbmdlIGlzIGJsb2NrZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9sZGVkUmFuZ2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBkZWNSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBkZWNSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0dHlwZTogZm9sZFJhbmdlLnR5cGUsXG5cdFx0XHRcdFx0XHRpc0NvbGxhcHNlZCxcblx0XHRcdFx0XHRcdHNvdXJjZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZvbGRlZFJhbmdlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZSBzdGF0ZSBtZW1lbnRvLCBmb3IgcGVyc2lzdGVuY2Ugb25seVxuXHQgKi9cblx0cHVibGljIGdldE1lbWVudG8oKTogQ29sbGFwc2VNZW1lbnRvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb2xkZWRPck1hbnVhbFJhbmdlcyA9IHRoaXMuX2N1cnJlbnRGb2xkZWRPck1hbnVhbFJhbmdlcygpO1xuXHRcdGNvbnN0IHJlc3VsdDogSUxpbmVNZW1lbnRvW10gPSBbXTtcblx0XHRjb25zdCBtYXhMaW5lTnVtYmVyID0gdGhpcy5fdGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsaW1pdCA9IGZvbGRlZE9yTWFudWFsUmFuZ2VzLmxlbmd0aDsgaSA8IGxpbWl0OyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZm9sZGVkT3JNYW51YWxSYW5nZXNbaV07XG5cdFx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID49IHJhbmdlLmVuZExpbmVOdW1iZXIgfHwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDwgMSB8fCByYW5nZS5lbmRMaW5lTnVtYmVyID4gbWF4TGluZU51bWJlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoZWNrc3VtID0gdGhpcy5fZ2V0TGluZXNDaGVja3N1bShyYW5nZS5zdGFydExpbmVOdW1iZXIgKyAxLCByYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdGlzQ29sbGFwc2VkOiByYW5nZS5pc0NvbGxhcHNlZCxcblx0XHRcdFx0c291cmNlOiByYW5nZS5zb3VyY2UsXG5cdFx0XHRcdGNoZWNrc3VtOiBjaGVja3N1bVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiAocmVzdWx0Lmxlbmd0aCA+IDApID8gcmVzdWx0IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IHBlcnNpc3RlZCBzdGF0ZSwgZm9yIHBlcnNpc3RlbmNlIG9ubHlcblx0ICovXG5cdHB1YmxpYyBhcHBseU1lbWVudG8oc3RhdGU6IENvbGxhcHNlTWVtZW50bykge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2VzVG9SZXN0b3JlOiBGb2xkUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IG1heExpbmVOdW1iZXIgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiBzdGF0ZSkge1xuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA+PSByYW5nZS5lbmRMaW5lTnVtYmVyIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciA8IDEgfHwgcmFuZ2UuZW5kTGluZU51bWJlciA+IG1heExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGVja3N1bSA9IHRoaXMuX2dldExpbmVzQ2hlY2tzdW0ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMSwgcmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRpZiAoIXJhbmdlLmNoZWNrc3VtIHx8IGNoZWNrc3VtID09PSByYW5nZS5jaGVja3N1bSkge1xuXHRcdFx0XHRyYW5nZXNUb1Jlc3RvcmUucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHR0eXBlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aXNDb2xsYXBzZWQ6IHJhbmdlLmlzQ29sbGFwc2VkID8/IHRydWUsXG5cdFx0XHRcdFx0c291cmNlOiByYW5nZS5zb3VyY2UgPz8gRm9sZFNvdXJjZS5wcm92aWRlclxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuZXdSYW5nZXMgPSBGb2xkaW5nUmVnaW9ucy5zYW5pdGl6ZUFuZE1lcmdlKHRoaXMuX3JlZ2lvbnMsIHJhbmdlc1RvUmVzdG9yZSwgbWF4TGluZU51bWJlcik7XG5cdFx0dGhpcy51cGRhdGVQb3N0KEZvbGRpbmdSZWdpb25zLmZyb21Gb2xkUmFuZ2VzKG5ld1JhbmdlcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGluZXNDaGVja3N1bShsaW5lTnVtYmVyMTogbnVtYmVyLCBsaW5lTnVtYmVyMjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBoID0gaGFzaCh0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcjEpXG5cdFx0XHQrIHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyMikpO1xuXHRcdHJldHVybiBoICUgMTAwMDAwMDsgLy8gNiBkaWdpdHMgaXMgcGxlbnR5XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIucmVtb3ZlRGVjb3JhdGlvbnModGhpcy5fZWRpdG9yRGVjb3JhdGlvbklkcyk7XG5cdFx0dGhpcy5fdXBkYXRlRXZlbnRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldEFsbFJlZ2lvbnNBdExpbmUobGluZU51bWJlcjogbnVtYmVyLCBmaWx0ZXI/OiAocjogRm9sZGluZ1JlZ2lvbiwgbGV2ZWw6IG51bWJlcikgPT4gYm9vbGVhbik6IEZvbGRpbmdSZWdpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0XHRpZiAodGhpcy5fcmVnaW9ucykge1xuXHRcdFx0bGV0IGluZGV4ID0gdGhpcy5fcmVnaW9ucy5maW5kUmFuZ2UobGluZU51bWJlcik7XG5cdFx0XHRsZXQgbGV2ZWwgPSAxO1xuXHRcdFx0d2hpbGUgKGluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3JlZ2lvbnMudG9SZWdpb24oaW5kZXgpO1xuXHRcdFx0XHRpZiAoIWZpbHRlciB8fCBmaWx0ZXIoY3VycmVudCwgbGV2ZWwpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goY3VycmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV2ZWwrKztcblx0XHRcdFx0aW5kZXggPSBjdXJyZW50LnBhcmVudEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0UmVnaW9uQXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IEZvbGRpbmdSZWdpb24gfCBudWxsIHtcblx0XHRpZiAodGhpcy5fcmVnaW9ucykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9yZWdpb25zLmZpbmRSYW5nZShsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpb25zLnRvUmVnaW9uKGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXRSZWdpb25zSW5zaWRlKHJlZ2lvbjogRm9sZGluZ1JlZ2lvbiB8IG51bGwsIGZpbHRlcj86IFJlZ2lvbkZpbHRlciB8IFJlZ2lvbkZpbHRlcldpdGhMZXZlbCk6IEZvbGRpbmdSZWdpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0XHRjb25zdCBpbmRleCA9IHJlZ2lvbiA/IHJlZ2lvbi5yZWdpb25JbmRleCArIDEgOiAwO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSByZWdpb24gPyByZWdpb24uZW5kTGluZU51bWJlciA6IE51bWJlci5NQVhfVkFMVUU7XG5cblx0XHRpZiAoZmlsdGVyICYmIGZpbHRlci5sZW5ndGggPT09IDIpIHtcblx0XHRcdGNvbnN0IGxldmVsU3RhY2s6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGluZGV4LCBsZW4gPSB0aGlzLl9yZWdpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZWdpb25zLnRvUmVnaW9uKGkpO1xuXHRcdFx0XHRpZiAodGhpcy5fcmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaSkgPCBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0d2hpbGUgKGxldmVsU3RhY2subGVuZ3RoID4gMCAmJiAhY3VycmVudC5jb250YWluZWRCeShsZXZlbFN0YWNrW2xldmVsU3RhY2subGVuZ3RoIC0gMV0pKSB7XG5cdFx0XHRcdFx0XHRsZXZlbFN0YWNrLnBvcCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXZlbFN0YWNrLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0aWYgKGZpbHRlcihjdXJyZW50LCBsZXZlbFN0YWNrLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGxldCBpID0gaW5kZXgsIGxlbiA9IHRoaXMuX3JlZ2lvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3JlZ2lvbnMudG9SZWdpb24oaSk7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihpKSA8IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRpZiAoIWZpbHRlciB8fCAoZmlsdGVyIGFzIFJlZ2lvbkZpbHRlcikoY3VycmVudCkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cbn1cblxudHlwZSBSZWdpb25GaWx0ZXIgPSAocjogRm9sZGluZ1JlZ2lvbikgPT4gYm9vbGVhbjtcbnR5cGUgUmVnaW9uRmlsdGVyV2l0aExldmVsID0gKHI6IEZvbGRpbmdSZWdpb24sIGxldmVsOiBudW1iZXIpID0+IGJvb2xlYW47XG5cblxuLyoqXG4gKiBDb2xsYXBzZSBvciBleHBhbmQgdGhlIHJlZ2lvbnMgYXQgdGhlIGdpdmVuIGxvY2F0aW9uc1xuICogQHBhcmFtIGxldmVscyBUaGUgbnVtYmVyIG9mIGxldmVscy4gVXNlIDEgdG8gb25seSBpbXBhY3QgdGhlIHJlZ2lvbnMgYXQgdGhlIGxvY2F0aW9uLCB1c2UgTnVtYmVyLk1BWF9WQUxVRSBmb3IgYWxsIGxldmVscy5cbiAqIEBwYXJhbSBsaW5lTnVtYmVycyB0aGUgbG9jYXRpb24gb2YgdGhlIHJlZ2lvbnMgdG8gY29sbGFwc2Ugb3IgZXhwYW5kLCBvciBpZiBub3Qgc2V0LCBhbGwgcmVnaW9ucyBpbiB0aGUgbW9kZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVDb2xsYXBzZVN0YXRlKGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBsZXZlbHM6IG51bWJlciwgbGluZU51bWJlcnM6IG51bWJlcltdKSB7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGxpbmVOdW1iZXJzKSB7XG5cdFx0Y29uc3QgcmVnaW9uID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShsaW5lTnVtYmVyKTtcblx0XHRpZiAocmVnaW9uKSB7XG5cdFx0XHRjb25zdCBkb0NvbGxhcHNlID0gIXJlZ2lvbi5pc0NvbGxhcHNlZDtcblx0XHRcdHRvVG9nZ2xlLnB1c2gocmVnaW9uKTtcblx0XHRcdGlmIChsZXZlbHMgPiAxKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2lvbnNJbnNpZGUgPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24sIChyLCBsZXZlbDogbnVtYmVyKSA9PiByLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlICYmIGxldmVsIDwgbGV2ZWxzKTtcblx0XHRcdFx0dG9Ub2dnbGUucHVzaCguLi5yZWdpb25zSW5zaWRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG5cbi8qKlxuICogQ29sbGFwc2Ugb3IgZXhwYW5kIHRoZSByZWdpb25zIGF0IHRoZSBnaXZlbiBsb2NhdGlvbnMgaW5jbHVkaW5nIGFsbCBjaGlsZHJlbi5cbiAqIEBwYXJhbSBkb0NvbGxhcHNlIFdoZXRoZXIgdG8gY29sbGFwc2Ugb3IgZXhwYW5kXG4gKiBAcGFyYW0gbGV2ZWxzIFRoZSBudW1iZXIgb2YgbGV2ZWxzLiBVc2UgMSB0byBvbmx5IGltcGFjdCB0aGUgcmVnaW9ucyBhdCB0aGUgbG9jYXRpb24sIHVzZSBOdW1iZXIuTUFYX1ZBTFVFIGZvciBhbGwgbGV2ZWxzLlxuICogQHBhcmFtIGxpbmVOdW1iZXJzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcmVnaW9ucyB0byBjb2xsYXBzZSBvciBleHBhbmQsIG9yIGlmIG5vdCBzZXQsIGFsbCByZWdpb25zIGluIHRoZSBtb2RlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBkb0NvbGxhcHNlOiBib29sZWFuLCBsZXZlbHMgPSBOdW1iZXIuTUFYX1ZBTFVFLCBsaW5lTnVtYmVycz86IG51bWJlcltdKTogdm9pZCB7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0aWYgKGxpbmVOdW1iZXJzICYmIGxpbmVOdW1iZXJzLmxlbmd0aCA+IDApIHtcblx0XHRmb3IgKGNvbnN0IGxpbmVOdW1iZXIgb2YgbGluZU51bWJlcnMpIHtcblx0XHRcdGNvbnN0IHJlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdFx0XHRpZiAocmVnaW9uKSB7XG5cdFx0XHRcdGlmIChyZWdpb24uaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UpIHtcblx0XHRcdFx0XHR0b1RvZ2dsZS5wdXNoKHJlZ2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxldmVscyA+IDEpIHtcblx0XHRcdFx0XHRjb25zdCByZWdpb25zSW5zaWRlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUocmVnaW9uLCAociwgbGV2ZWw6IG51bWJlcikgPT4gci5pc0NvbGxhcHNlZCAhPT0gZG9Db2xsYXBzZSAmJiBsZXZlbCA8IGxldmVscyk7XG5cdFx0XHRcdFx0dG9Ub2dnbGUucHVzaCguLi5yZWdpb25zSW5zaWRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjb25zdCByZWdpb25zSW5zaWRlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgKHIsIGxldmVsOiBudW1iZXIpID0+IHIuaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UgJiYgbGV2ZWwgPCBsZXZlbHMpO1xuXHRcdHRvVG9nZ2xlLnB1c2goLi4ucmVnaW9uc0luc2lkZSk7XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIENvbGxhcHNlIG9yIGV4cGFuZCB0aGUgcmVnaW9ucyBhdCB0aGUgZ2l2ZW4gbG9jYXRpb25zIGluY2x1ZGluZyBhbGwgcGFyZW50cy5cbiAqIEBwYXJhbSBkb0NvbGxhcHNlIFdoZXRoZXIgdG8gY29sbGFwc2Ugb3IgZXhwYW5kXG4gKiBAcGFyYW0gbGV2ZWxzIFRoZSBudW1iZXIgb2YgbGV2ZWxzLiBVc2UgMSB0byBvbmx5IGltcGFjdCB0aGUgcmVnaW9ucyBhdCB0aGUgbG9jYXRpb24sIHVzZSBOdW1iZXIuTUFYX1ZBTFVFIGZvciBhbGwgbGV2ZWxzLlxuICogQHBhcmFtIGxpbmVOdW1iZXJzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcmVnaW9ucyB0byBjb2xsYXBzZSBvciBleHBhbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAoZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGRvQ29sbGFwc2U6IGJvb2xlYW4sIGxldmVsczogbnVtYmVyLCBsaW5lTnVtYmVyczogbnVtYmVyW10pOiB2b2lkIHtcblx0Y29uc3QgdG9Ub2dnbGU6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmVOdW1iZXIgb2YgbGluZU51bWJlcnMpIHtcblx0XHRjb25zdCByZWdpb25zID0gZm9sZGluZ01vZGVsLmdldEFsbFJlZ2lvbnNBdExpbmUobGluZU51bWJlciwgKHJlZ2lvbiwgbGV2ZWwpID0+IHJlZ2lvbi5pc0NvbGxhcHNlZCAhPT0gZG9Db2xsYXBzZSAmJiBsZXZlbCA8PSBsZXZlbHMpO1xuXHRcdHRvVG9nZ2xlLnB1c2goLi4ucmVnaW9ucyk7XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIENvbGxhcHNlIG9yIGV4cGFuZCBhIHJlZ2lvbiBhdCB0aGUgZ2l2ZW4gbG9jYXRpb25zLiBJZiB0aGUgaW5uZXIgbW9zdCByZWdpb24gaXMgYWxyZWFkeSBjb2xsYXBzZWQvZXhwYW5kZWQsIHVzZXMgdGhlIGZpcnN0IHBhcmVudCBpbnN0ZWFkLlxuICogQHBhcmFtIGRvQ29sbGFwc2UgV2hldGhlciB0byBjb2xsYXBzZSBvciBleHBhbmRcbiAqIEBwYXJhbSBsaW5lTnVtYmVycyB0aGUgbG9jYXRpb24gb2YgdGhlIHJlZ2lvbnMgdG8gY29sbGFwc2Ugb3IgZXhwYW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZVVwKGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBkb0NvbGxhcHNlOiBib29sZWFuLCBsaW5lTnVtYmVyczogbnVtYmVyW10pOiB2b2lkIHtcblx0Y29uc3QgdG9Ub2dnbGU6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmVOdW1iZXIgb2YgbGluZU51bWJlcnMpIHtcblx0XHRjb25zdCByZWdpb25zID0gZm9sZGluZ01vZGVsLmdldEFsbFJlZ2lvbnNBdExpbmUobGluZU51bWJlciwgKHJlZ2lvbiwpID0+IHJlZ2lvbi5pc0NvbGxhcHNlZCAhPT0gZG9Db2xsYXBzZSk7XG5cdFx0aWYgKHJlZ2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dG9Ub2dnbGUucHVzaChyZWdpb25zWzBdKTtcblx0XHR9XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIEZvbGRzIG9yIHVuZm9sZHMgYWxsIHJlZ2lvbnMgdGhhdCBoYXZlIGEgZ2l2ZW4gbGV2ZWwsIGV4Y2VwdCBpZiB0aGV5IGNvbnRhaW4gb25lIG9mIHRoZSBibG9ja2VkIGxpbmVzLlxuICogQHBhcmFtIGZvbGRMZXZlbCBsZXZlbC4gTGV2ZWwgPT0gMSBpcyB0aGUgdG9wIGxldmVsXG4gKiBAcGFyYW0gZG9Db2xsYXBzZSBXaGV0aGVyIHRvIGNvbGxhcHNlIG9yIGV4cGFuZFxuKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbChmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZm9sZExldmVsOiBudW1iZXIsIGRvQ29sbGFwc2U6IGJvb2xlYW4sIGJsb2NrZWRMaW5lTnVtYmVyczogbnVtYmVyW10pOiB2b2lkIHtcblx0Y29uc3QgZmlsdGVyID0gKHJlZ2lvbjogRm9sZGluZ1JlZ2lvbiwgbGV2ZWw6IG51bWJlcikgPT4gbGV2ZWwgPT09IGZvbGRMZXZlbCAmJiByZWdpb24uaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UgJiYgIWJsb2NrZWRMaW5lTnVtYmVycy5zb21lKGxpbmUgPT4gcmVnaW9uLmNvbnRhaW5zTGluZShsaW5lKSk7XG5cdGNvbnN0IHRvVG9nZ2xlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgZmlsdGVyKTtcblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIEZvbGRzIG9yIHVuZm9sZHMgYWxsIHJlZ2lvbnMsIGV4Y2VwdCBpZiB0aGV5IGNvbnRhaW4gb3IgYXJlIGNvbnRhaW5lZCBieSBhIHJlZ2lvbiBvZiBvbmUgb2YgdGhlIGJsb2NrZWQgbGluZXMuXG4gKiBAcGFyYW0gZG9Db2xsYXBzZSBXaGV0aGVyIHRvIGNvbGxhcHNlIG9yIGV4cGFuZFxuICogQHBhcmFtIGJsb2NrZWRMaW5lTnVtYmVycyB0aGUgbG9jYXRpb24gb2YgcmVnaW9ucyB0byBub3QgY29sbGFwc2Ugb3IgZXhwYW5kXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlRm9yUmVzdChmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZG9Db2xsYXBzZTogYm9vbGVhbiwgYmxvY2tlZExpbmVOdW1iZXJzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRjb25zdCBmaWx0ZXJlZFJlZ2lvbnM6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmVOdW1iZXIgb2YgYmxvY2tlZExpbmVOdW1iZXJzKSB7XG5cdFx0Y29uc3QgcmVnaW9ucyA9IGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXIsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKHJlZ2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZmlsdGVyZWRSZWdpb25zLnB1c2gocmVnaW9uc1swXSk7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGZpbHRlciA9IChyZWdpb246IEZvbGRpbmdSZWdpb24pID0+IGZpbHRlcmVkUmVnaW9ucy5ldmVyeSgoZmlsdGVyZWRSZWdpb24pID0+ICFmaWx0ZXJlZFJlZ2lvbi5jb250YWluZWRCeShyZWdpb24pICYmICFyZWdpb24uY29udGFpbmVkQnkoZmlsdGVyZWRSZWdpb24pKSAmJiByZWdpb24uaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2U7XG5cdGNvbnN0IHRvVG9nZ2xlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgZmlsdGVyKTtcblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIEZvbGRzIGFsbCByZWdpb25zIGZvciB3aGljaCB0aGUgbGluZXMgc3RhcnQgd2l0aCBhIGdpdmVuIHJlZ2V4XG4gKiBAcGFyYW0gZm9sZGluZ01vZGVsIHRoZSBmb2xkaW5nIG1vZGVsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlRm9yTWF0Y2hpbmdMaW5lcyhmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgcmVnRXhwOiBSZWdFeHAsIGRvQ29sbGFwc2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29uc3QgZWRpdG9yTW9kZWwgPSBmb2xkaW5nTW9kZWwudGV4dE1vZGVsO1xuXHRjb25zdCByZWdpb25zID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IHJlZ2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRpZiAoZG9Db2xsYXBzZSAhPT0gcmVnaW9ucy5pc0NvbGxhcHNlZChpKSkge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gcmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaSk7XG5cdFx0XHRpZiAocmVnRXhwLnRlc3QoZWRpdG9yTW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKSkpIHtcblx0XHRcdFx0dG9Ub2dnbGUucHVzaChyZWdpb25zLnRvUmVnaW9uKGkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIEZvbGRzIGFsbCByZWdpb25zIG9mIHRoZSBnaXZlbiB0eXBlXG4gKiBAcGFyYW0gZm9sZGluZ01vZGVsIHRoZSBmb2xkaW5nIG1vZGVsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlRm9yVHlwZShmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgdHlwZTogc3RyaW5nLCBkb0NvbGxhcHNlOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IHJlZ2lvbnMgPSBmb2xkaW5nTW9kZWwucmVnaW9ucztcblx0Y29uc3QgdG9Ub2dnbGU6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gcmVnaW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGlmIChkb0NvbGxhcHNlICE9PSByZWdpb25zLmlzQ29sbGFwc2VkKGkpICYmIHR5cGUgPT09IHJlZ2lvbnMuZ2V0VHlwZShpKSkge1xuXHRcdFx0dG9Ub2dnbGUucHVzaChyZWdpb25zLnRvUmVnaW9uKGkpKTtcblx0XHR9XG5cdH1cblx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xufVxuXG4vKipcbiAqIEdldCBsaW5lIHRvIGdvIHRvIGZvciBwYXJlbnQgZm9sZCBvZiBjdXJyZW50IGxpbmVcbiAqIEBwYXJhbSBsaW5lTnVtYmVyIHRoZSBjdXJyZW50IGxpbmUgbnVtYmVyXG4gKiBAcGFyYW0gZm9sZGluZ01vZGVsIHRoZSBmb2xkaW5nIG1vZGVsXG4gKlxuICogQHJldHVybiBQYXJlbnQgZm9sZCBzdGFydCBsaW5lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJlbnRGb2xkTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsKTogbnVtYmVyIHwgbnVsbCB7XG5cdGxldCBzdGFydExpbmVOdW1iZXI6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRjb25zdCBmb2xkaW5nUmVnaW9uID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShsaW5lTnVtYmVyKTtcblx0aWYgKGZvbGRpbmdSZWdpb24gIT09IG51bGwpIHtcblx0XHRzdGFydExpbmVOdW1iZXIgPSBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHQvLyBJZiBjdXJyZW50IGxpbmUgaXMgbm90IHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBmb2xkLCBnbyB0byB0b3AgbGluZSBvZiBjdXJyZW50IGZvbGQuIElmIG5vdCwgZ28gdG8gcGFyZW50IGZvbGRcblx0XHRpZiAobGluZU51bWJlciA9PT0gc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkaW5nSWR4ID0gZm9sZGluZ1JlZ2lvbi5wYXJlbnRJbmRleDtcblx0XHRcdGlmIChwYXJlbnRGb2xkaW5nSWR4ICE9PSAtMSkge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBmb2xkaW5nTW9kZWwucmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIocGFyZW50Rm9sZGluZ0lkeCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gc3RhcnRMaW5lTnVtYmVyO1xufVxuXG4vKipcbiAqIEdldCBsaW5lIHRvIGdvIHRvIGZvciBwcmV2aW91cyBmb2xkIGF0IHRoZSBzYW1lIGxldmVsIG9mIGN1cnJlbnQgbGluZVxuICogQHBhcmFtIGxpbmVOdW1iZXIgdGhlIGN1cnJlbnQgbGluZSBudW1iZXJcbiAqIEBwYXJhbSBmb2xkaW5nTW9kZWwgdGhlIGZvbGRpbmcgbW9kZWxcbiAqXG4gKiBAcmV0dXJuIFByZXZpb3VzIGZvbGQgc3RhcnQgbGluZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJldmlvdXNGb2xkTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsKTogbnVtYmVyIHwgbnVsbCB7XG5cdGxldCBmb2xkaW5nUmVnaW9uID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShsaW5lTnVtYmVyKTtcblx0Ly8gSWYgb24gdGhlIGZvbGRpbmcgcmFuZ2Ugc3RhcnQgbGluZSwgZ28gdG8gcHJldmlvdXMgc2libGluZy5cblx0aWYgKGZvbGRpbmdSZWdpb24gIT09IG51bGwgJiYgZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHQvLyBJZiBjdXJyZW50IGxpbmUgaXMgbm90IHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBmb2xkLCBnbyB0byB0b3AgbGluZSBvZiBjdXJyZW50IGZvbGQuIElmIG5vdCwgZ28gdG8gcHJldmlvdXMgZm9sZC5cblx0XHRpZiAobGluZU51bWJlciAhPT0gZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmluZCBtaW4gbGluZSBudW1iZXIgdG8gc3RheSB3aXRoaW4gcGFyZW50LlxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRQYXJlbnRJbmRleCA9IGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXg7XG5cdFx0XHRsZXQgbWluTGluZU51bWJlciA9IDA7XG5cdFx0XHRpZiAoZXhwZWN0ZWRQYXJlbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0bWluTGluZU51bWJlciA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihmb2xkaW5nUmVnaW9uLnBhcmVudEluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmluZCBmb2xkIGF0IHNhbWUgbGV2ZWwuXG5cdFx0XHR3aGlsZSAoZm9sZGluZ1JlZ2lvbiAhPT0gbnVsbCkge1xuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5yZWdpb25JbmRleCA+IDApIHtcblx0XHRcdFx0XHRmb2xkaW5nUmVnaW9uID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMudG9SZWdpb24oZm9sZGluZ1JlZ2lvbi5yZWdpb25JbmRleCAtIDEpO1xuXG5cdFx0XHRcdFx0Ly8gS2VlcCBhdCBzYW1lIGxldmVsLlxuXHRcdFx0XHRcdGlmIChmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlciA8PSBtaW5MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXggPT09IGV4cGVjdGVkUGFyZW50SW5kZXgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gR28gdG8gbGFzdCBmb2xkIHRoYXQncyBiZWZvcmUgdGhlIGN1cnJlbnQgbGluZS5cblx0XHRpZiAoZm9sZGluZ01vZGVsLnJlZ2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLnRvUmVnaW9uKGZvbGRpbmdNb2RlbC5yZWdpb25zLmxlbmd0aCAtIDEpO1xuXHRcdFx0d2hpbGUgKGZvbGRpbmdSZWdpb24gIT09IG51bGwpIHtcblx0XHRcdFx0Ly8gRm91bmQgZm9sZCBiZWZvcmUgY3VycmVudCBsaW5lLlxuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPCBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4ID4gMCkge1xuXHRcdFx0XHRcdGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwucmVnaW9ucy50b1JlZ2lvbihmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4IC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogR2V0IGxpbmUgdG8gZ28gdG8gbmV4dCBmb2xkIGF0IHRoZSBzYW1lIGxldmVsIG9mIGN1cnJlbnQgbGluZVxuICogQHBhcmFtIGxpbmVOdW1iZXIgdGhlIGN1cnJlbnQgbGluZSBudW1iZXJcbiAqIEBwYXJhbSBmb2xkaW5nTW9kZWwgdGhlIGZvbGRpbmcgbW9kZWxcbiAqXG4gKiBAcmV0dXJuIE5leHQgZm9sZCBzdGFydCBsaW5lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXROZXh0Rm9sZExpbmUobGluZU51bWJlcjogbnVtYmVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCk6IG51bWJlciB8IG51bGwge1xuXHRsZXQgZm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdC8vIElmIG9uIHRoZSBmb2xkaW5nIHJhbmdlIHN0YXJ0IGxpbmUsIGdvIHRvIG5leHQgc2libGluZy5cblx0aWYgKGZvbGRpbmdSZWdpb24gIT09IG51bGwgJiYgZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHQvLyBGaW5kIG1heCBsaW5lIG51bWJlciB0byBzdGF5IHdpdGhpbiBwYXJlbnQuXG5cdFx0Y29uc3QgZXhwZWN0ZWRQYXJlbnRJbmRleCA9IGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXg7XG5cdFx0bGV0IG1heExpbmVOdW1iZXIgPSAwO1xuXHRcdGlmIChleHBlY3RlZFBhcmVudEluZGV4ICE9PSAtMSkge1xuXHRcdFx0bWF4TGluZU51bWJlciA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoZm9sZGluZ1JlZ2lvbi5wYXJlbnRJbmRleCk7XG5cdFx0fSBlbHNlIGlmIChmb2xkaW5nTW9kZWwucmVnaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXhMaW5lTnVtYmVyID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMuZ2V0RW5kTGluZU51bWJlcihmb2xkaW5nTW9kZWwucmVnaW9ucy5sZW5ndGggLSAxKTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIGZvbGQgYXQgc2FtZSBsZXZlbC5cblx0XHR3aGlsZSAoZm9sZGluZ1JlZ2lvbiAhPT0gbnVsbCkge1xuXHRcdFx0aWYgKGZvbGRpbmdSZWdpb24ucmVnaW9uSW5kZXggPCBmb2xkaW5nTW9kZWwucmVnaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLnRvUmVnaW9uKGZvbGRpbmdSZWdpb24ucmVnaW9uSW5kZXggKyAxKTtcblxuXHRcdFx0XHQvLyBLZWVwIGF0IHNhbWUgbGV2ZWwuXG5cdFx0XHRcdGlmIChmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlciA+PSBtYXhMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZm9sZGluZ1JlZ2lvbi5wYXJlbnRJbmRleCA9PT0gZXhwZWN0ZWRQYXJlbnRJbmRleCkge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIEdvIHRvIGZpcnN0IGZvbGQgdGhhdCdzIGFmdGVyIHRoZSBjdXJyZW50IGxpbmUuXG5cdFx0aWYgKGZvbGRpbmdNb2RlbC5yZWdpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwucmVnaW9ucy50b1JlZ2lvbigwKTtcblx0XHRcdHdoaWxlIChmb2xkaW5nUmVnaW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIEZvdW5kIGZvbGQgYWZ0ZXIgY3VycmVudCBsaW5lLlxuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4IDwgZm9sZGluZ01vZGVsLnJlZ2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLnRvUmVnaW9uKGZvbGRpbmdSZWdpb24ucmVnaW9uSW5kZXggKyAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb2xkaW5nUmVnaW9uID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBc0I7QUFFL0IsU0FBd0IsZ0JBQXVDLGtCQUFrQjtBQUNqRixTQUFTLFlBQVk7QUFHckIsU0FBaUIsYUFBYTtBQXFCdkIsTUFBTSxhQUFvQztBQUFBLEVBY2hELFlBQVksV0FBdUIsb0JBQXlDO0FBUDVFLFNBQWlCLHNCQUFzQixJQUFJLFFBQWlDO0FBQzVFLFNBQWdCLGNBQThDLEtBQUssb0JBQW9CO0FBT3RGLFNBQUssYUFBYTtBQUNsQixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLFdBQVcsSUFBSSxlQUFlLElBQUksWUFBWSxDQUFDLEdBQUcsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUN6RSxTQUFLLHVCQUF1QixDQUFDO0FBQUEsRUFDOUI7QUFBQSxFQVRBLElBQVcsVUFBMEI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFVO0FBQUEsRUFDN0QsSUFBVyxZQUFZO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBWTtBQUFBLEVBQ2pELElBQVcscUJBQXFCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBcUI7QUFBQSxFQVM1RCxvQkFBb0IsZ0JBQWlDO0FBQzNELFFBQUksQ0FBQyxlQUFlLFFBQVE7QUFDM0I7QUFBQSxJQUNEO0FBQ0EscUJBQWlCLGVBQWUsS0FBSyxDQUFDLElBQUksT0FBTyxHQUFHLGNBQWMsR0FBRyxXQUFXO0FBRWhGLFVBQU0sWUFBb0QsQ0FBQztBQUMzRCxTQUFLLG9CQUFvQixrQkFBa0IsY0FBWTtBQUN0RCxVQUFJLElBQUk7QUFDUixVQUFJLHFCQUFxQjtBQUN6QixVQUFJLGlCQUFpQjtBQUNyQixZQUFNLHlCQUF5QixDQUFDLFVB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
