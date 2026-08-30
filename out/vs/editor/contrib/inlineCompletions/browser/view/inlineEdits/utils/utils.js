import { getDomNodePagePosition, h } from "../../../../../../../base/browser/dom.js";
import { KeybindingLabel, unthemedKeybindingLabelOptions } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { numberComparator } from "../../../../../../../base/common/arrays.js";
import { findFirstMin } from "../../../../../../../base/common/arraysFind.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { DebugLocation, derived, derivedObservableWithCache, derivedOpts, observableSignalFromEvent, observableValue, transaction } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { splitLines } from "../../../../../../../base/common/strings.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { MenuEntryActionViewItem } from "../../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { TextReplacement, TextEdit } from "../../../../../../common/core/edits/textEdit.js";
import { RangeMapping } from "../../../../../../common/diff/rangeMapping.js";
import { indentOfLine } from "../../../../../../common/model/textModel.js";
import { CharCode } from "../../../../../../../base/common/charCode.js";
import { BugIndicatingError } from "../../../../../../../base/common/errors.js";
import { Size2D } from "../../../../../../common/core/2d/size.js";
function maxContentWidthInRange(editor, range, reader) {
  const model = editor.model.read(reader);
  if (!model) {
    return 0;
  }
  let maxContentWidth = 0;
  for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
    const lineContentWidth = editor.getWidthOfLine(i, reader);
    maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
  }
  const lines = range.mapToLineArray((l) => model.getLineContent(l));
  if (maxContentWidth < 5 && lines.some((l) => l.length > 0) && model.uri.scheme !== "file") {
    console.log("unexpected width");
  }
  return maxContentWidth;
}
function getContentSizeOfLines(editor, range, reader) {
  observableSignalFromEvent(editor, editor.editor.onDidChangeLineHeight).read(reader);
  const model = editor.model.read(reader);
  if (!model) {
    throw new BugIndicatingError("Model is required");
  }
  const sizes = [];
  for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
    let lineContentWidth = editor.getWidthOfLine(i, reader);
    if (lineContentWidth === -1) {
      const column = model.getLineMaxColumn(i);
      const typicalHalfwidthCharacterWidth = editor.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
      const approximation = column * typicalHalfwidthCharacterWidth;
      lineContentWidth = approximation;
    }
    const height = editor.editor.getLineHeightForPosition(new Position(i, 1));
    sizes.push(new Size2D(lineContentWidth, height));
  }
  return sizes;
}
function getOffsetForPos(editor, pos, reader) {
  editor.layoutInfo.read(reader);
  editor.value.read(reader);
  const model = editor.model.read(reader);
  if (!model) {
    return 0;
  }
  editor.scrollTop.read(reader);
  const lineContentWidth = editor.editor.getOffsetForColumn(pos.lineNumber, pos.column);
  return lineContentWidth;
}
function getPrefixTrim(diffRanges, originalLinesRange, modifiedLines, editor, reader = void 0) {
  const textModel = editor.getModel();
  if (!textModel) {
    return { prefixTrim: 0, prefixLeftOffset: 0 };
  }
  const replacementStart = diffRanges.map((r) => r.isSingleLine() ? r.startColumn - 1 : 0);
  const originalIndents = originalLinesRange.mapToLineArray((line) => indentOfLine(textModel.getLineContent(line)));
  const modifiedIndents = modifiedLines.filter((line) => line !== "").map((line) => indentOfLine(line));
  const prefixTrim = Math.min(...replacementStart, ...originalIndents, ...modifiedIndents);
  let prefixLeftOffset;
  const startLineIndent = textModel.getLineIndentColumn(originalLinesRange.startLineNumber);
  if (startLineIndent >= prefixTrim + 1) {
    observableCodeEditor(editor).scrollTop.read(reader);
    prefixLeftOffset = editor.getOffsetForColumn(originalLinesRange.startLineNumber, prefixTrim + 1);
  } else if (modifiedLines.length > 0) {
    prefixLeftOffset = getContentRenderWidth(modifiedLines[0].slice(0, prefixTrim), editor, textModel);
  } else {
    return { prefixTrim: 0, prefixLeftOffset: 0 };
  }
  return { prefixTrim, prefixLeftOffset };
}
function getContentRenderWidth(content, editor, textModel) {
  const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
  const tabSize = textModel.getOptions().tabSize * w;
  const numTabs = content.split("	").length - 1;
  const numNoneTabs = content.length - numTabs;
  return numNoneTabs * w + numTabs * tabSize;
}
function getEditorValidOverlayRect(editor) {
  const contentLeft = editor.layoutInfoContentLeft;
  const width = derived({ name: "editor.validOverlay.width" }, (r) => {
    const hasMinimapOnTheRight = editor.layoutInfoMinimap.read(r).minimapLeft !== 0;
    const editorWidth = Math.max(0, editor.layoutInfoWidth.read(r) - contentLeft.read(r));
    if (hasMinimapOnTheRight) {
      const minimapAndScrollbarWidth = editor.layoutInfoMinimap.read(r).minimapWidth + editor.layoutInfoVerticalScrollbarWidth.read(r);
      return Math.max(0, editorWidth - minimapAndScrollbarWidth);
    }
    return editorWidth;
  });
  const height = derived({ name: "editor.validOverlay.height" }, (r) => editor.layoutInfoHeight.read(r) + editor.contentHeight.read(r));
  return derived({ name: "editor.validOverlay" }, (r) => Rect.fromLeftTopWidthHeight(contentLeft.read(r), 0, width.read(r), height.read(r)));
}
class StatusBarViewItem extends MenuEntryActionViewItem {
  constructor() {
    super(...arguments);
    this._updateLabelListener = this._register(this._contextKeyService.onDidChangeContext(() => {
      this.updateLabel();
    }));
  }
  updateLabel() {
    const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
    if (!kb) {
      return super.updateLabel();
    }
    if (this.label) {
      const div = h("div.keybinding").root;
      const keybindingLabel = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
      keybindingLabel.set(kb);
      this.label.textContent = this._action.label;
      this.label.appendChild(div);
      this.label.classList.add("inlineSuggestionStatusBarItemLabel");
    }
  }
  updateTooltip() {
  }
}
const _UniqueUriGenerator = class _UniqueUriGenerator {
  constructor(scheme) {
    this.scheme = scheme;
  }
  getUniqueUri() {
    return URI.from({ scheme: this.scheme, path: (/* @__PURE__ */ new Date()).toString() + String(_UniqueUriGenerator._modelId++) });
  }
};
_UniqueUriGenerator._modelId = 0;
let UniqueUriGenerator = _UniqueUriGenerator;
function applyEditToModifiedRangeMappings(rangeMapping, edit) {
  const updatedMappings = [];
  for (const m of rangeMapping) {
    const updatedRange = edit.mapRange(m.modifiedRange);
    updatedMappings.push(new RangeMapping(m.originalRange, updatedRange));
  }
  return updatedMappings;
}
function classNames(...classes) {
  return classes.filter((c) => typeof c === "string").join(" ");
}
function offsetRangeToRange(columnOffsetRange, startPos) {
  return new Range(
    startPos.lineNumber,
    startPos.column + columnOffsetRange.start,
    startPos.lineNumber,
    startPos.column + columnOffsetRange.endExclusive
  );
}
function getIndentationSize(line, tabSize) {
  let currentSize = 0;
  loop: for (let i = 0, len = line.length; i < len; i++) {
    switch (line.charCodeAt(i)) {
      case CharCode.Tab:
        currentSize += tabSize;
        break;
      case CharCode.Space:
        currentSize++;
        break;
      default:
        break loop;
    }
  }
  return currentSize - currentSize % tabSize;
}
function indentSizeToIndentLength(line, indentSize, tabSize) {
  let remainingSize = indentSize - indentSize % tabSize;
  let i = 0;
  for (; i < line.length; i++) {
    if (remainingSize === 0) {
      break;
    }
    switch (line.charCodeAt(i)) {
      case CharCode.Tab:
        remainingSize -= tabSize;
        break;
      case CharCode.Space:
        remainingSize--;
        break;
      default:
        throw new BugIndicatingError("Unexpected character found while calculating indent length");
    }
  }
  return i;
}
function createReindentEdit(text, range, tabSize) {
  const newLines = splitLines(text);
  const edits = [];
  const minIndentSize = findFirstMin(range.mapToLineArray((l) => getIndentationSize(newLines[l - 1], tabSize)), numberComparator);
  range.forEach((lineNumber) => {
    const indentLength = indentSizeToIndentLength(newLines[lineNumber - 1], minIndentSize, tabSize);
    edits.push(new TextReplacement(offsetRangeToRange(new OffsetRange(0, indentLength), new Position(lineNumber, 1)), ""));
  });
  return new TextEdit(edits);
}
class PathBuilder {
  constructor() {
    this._data = "";
  }
  moveTo(point) {
    this._data += `M ${point.x} ${point.y} `;
    return this;
  }
  lineTo(point) {
    this._data += `L ${point.x} ${point.y} `;
    return this;
  }
  curveTo(cp, to) {
    this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
    return this;
  }
  curveTo2(cp1, cp2, to) {
    this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
    return this;
  }
  build() {
    return this._data;
  }
}
function createRectangle(layout, padding, borderRadius, options = {}) {
  const topLeftInner = layout.topLeft;
  const topRightInner = topLeftInner.deltaX(layout.width);
  const bottomLeftInner = topLeftInner.deltaY(layout.height);
  const bottomRightInner = bottomLeftInner.deltaX(layout.width);
  const { top: paddingTop, bottom: paddingBottom, left: paddingLeft, right: paddingRight } = typeof padding === "number" ? { top: padding, bottom: padding, left: padding, right: padding } : padding;
  const { topLeft: radiusTL, topRight: radiusTR, bottomLeft: radiusBL, bottomRight: radiusBR } = typeof borderRadius === "number" ? { topLeft: borderRadius, topRight: borderRadius, bottomLeft: borderRadius, bottomRight: borderRadius } : borderRadius;
  const totalHeight = layout.height + paddingTop + paddingBottom;
  const totalWidth = layout.width + paddingLeft + paddingRight;
  const topLeft = topLeftInner.deltaX(-paddingLeft).deltaY(-paddingTop);
  const topRight = topRightInner.deltaX(paddingRight).deltaY(-paddingTop);
  const topLeftBefore = topLeft.deltaY(Math.min(radiusTL, totalHeight / 2));
  const topLeftAfter = topLeft.deltaX(Math.min(radiusTL, totalWidth / 2));
  const topRightBefore = topRight.deltaX(-Math.min(radiusTR, totalWidth / 2));
  const topRightAfter = topRight.deltaY(Math.min(radiusTR, totalHeight / 2));
  const bottomLeft = bottomLeftInner.deltaX(-paddingLeft).deltaY(paddingBottom);
  const bottomRight = bottomRightInner.deltaX(paddingRight).deltaY(paddingBottom);
  const bottomLeftBefore = bottomLeft.deltaX(Math.min(radiusBL, totalWidth / 2));
  const bottomLeftAfter = bottomLeft.deltaY(-Math.min(radiusBL, totalHeight / 2));
  const bottomRightBefore = bottomRight.deltaY(-Math.min(radiusBR, totalHeight / 2));
  const bottomRightAfter = bottomRight.deltaX(-Math.min(radiusBR, totalWidth / 2));
  const path = new PathBuilder();
  if (!options.hideLeft) {
    path.moveTo(bottomLeftAfter).lineTo(topLeftBefore);
  }
  if (!options.hideLeft && !options.hideTop) {
    path.curveTo(topLeft, topLeftAfter);
  } else {
    path.moveTo(topLeftAfter);
  }
  if (!options.hideTop) {
    path.lineTo(topRightBefore);
  }
  if (!options.hideTop && !options.hideRight) {
    path.curveTo(topRight, topRightAfter);
  } else {
    path.moveTo(topRightAfter);
  }
  if (!options.hideRight) {
    path.lineTo(bottomRightBefore);
  }
  if (!options.hideRight && !options.hideBottom) {
    path.curveTo(bottomRight, bottomRightAfter);
  } else {
    path.moveTo(bottomRightAfter);
  }
  if (!options.hideBottom) {
    path.lineTo(bottomLeftBefore);
  }
  if (!options.hideBottom && !options.hideLeft) {
    path.curveTo(bottomLeft, bottomLeftAfter);
  } else {
    path.moveTo(bottomLeftAfter);
  }
  return path.build();
}
function mapOutFalsy(obs) {
  const nonUndefinedObs = derivedObservableWithCache(void 0, (reader, lastValue) => obs.read(reader) || lastValue);
  return derivedOpts({
    debugName: () => `${obs.debugName}.mapOutFalsy`
  }, (reader) => {
    nonUndefinedObs.read(reader);
    const val = obs.read(reader);
    if (!val) {
      return void 0;
    }
    return nonUndefinedObs;
  });
}
function observeElementPosition(element, store) {
  const topLeft = getDomNodePagePosition(element);
  const top = observableValue("top", topLeft.top);
  const left = observableValue("left", topLeft.left);
  const resizeObserver = new ResizeObserver(() => {
    transaction((tx) => {
      const topLeft2 = getDomNodePagePosition(element);
      top.set(topLeft2.top, tx);
      left.set(topLeft2.left, tx);
    });
  });
  resizeObserver.observe(element);
  store.add(toDisposable(() => resizeObserver.disconnect()));
  return {
    top,
    left
  };
}
function rectToProps(fn, debugLocation = DebugLocation.ofCaller()) {
  return {
    left: derived({ name: "editor.validOverlay.left" }, (reader) => (
      /** @description left */
      fn(reader)?.left
    ), debugLocation),
    top: derived({ name: "editor.validOverlay.top" }, (reader) => (
      /** @description top */
      fn(reader)?.top
    ), debugLocation),
    width: derived({ name: "editor.validOverlay.width" }, (reader) => {
      const val = fn(reader);
      if (!val) {
        return void 0;
      }
      return val.width;
    }, debugLocation),
    height: derived({ name: "editor.validOverlay.height" }, (reader) => {
      const val = fn(reader);
      if (!val) {
        return void 0;
      }
      return val.height;
    }, debugLocation)
  };
}
function observeEditorBoundingClientRect(editor, store) {
  const dom = editor.getContainerDomNode();
  const initialDomRect = observableValue("domRect", dom.getBoundingClientRect());
  store.add(editor.onDidLayoutChange((e) => {
    initialDomRect.set(dom.getBoundingClientRect(), void 0);
  }));
  return initialDomRect;
}
export {
  PathBuilder,
  StatusBarViewItem,
  UniqueUriGenerator,
  applyEditToModifiedRangeMappings,
  classNames,
  createRectangle,
  createReindentEdit,
  getContentRenderWidth,
  getContentSizeOfLines,
  getEditorValidOverlayRect,
  getOffsetForPos,
  getPrefixTrim,
  mapOutFalsy,
  maxContentWidthInRange,
  observeEditorBoundingClientRect,
  observeElementPosition,
  rectToProps
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcdXRpbHNcXHV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiwgaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsLCB1bnRoZW1lZEtleWJpbmRpbmdMYWJlbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBudW1iZXJDb21wYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGZpbmRGaXJzdE1pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVidWdMb2NhdGlvbiwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IsIE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQsIFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgaW5kZW50T2ZMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTaXplMkQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9zaXplLmpzJztcblxuLyoqXG4gKiBXYXJuaW5nOiBtaWdodCByZXR1cm4gMC5cbiovXG5leHBvcnQgZnVuY3Rpb24gbWF4Q29udGVudFdpZHRoSW5SYW5nZShlZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLCByYW5nZTogTGluZVJhbmdlLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRjb25zdCBtb2RlbCA9IGVkaXRvci5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdGlmICghbW9kZWwpIHsgcmV0dXJuIDA7IH1cblx0bGV0IG1heENvbnRlbnRXaWR0aCA9IDA7XG5cblx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7IGkrKykge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50V2lkdGggPSBlZGl0b3IuZ2V0V2lkdGhPZkxpbmUoaSwgcmVhZGVyKTtcblx0XHRtYXhDb250ZW50V2lkdGggPSBNYXRoLm1heChtYXhDb250ZW50V2lkdGgsIGxpbmVDb250ZW50V2lkdGgpO1xuXHR9XG5cdGNvbnN0IGxpbmVzID0gcmFuZ2UubWFwVG9MaW5lQXJyYXkobCA9PiBtb2RlbC5nZXRMaW5lQ29udGVudChsKSk7XG5cblx0aWYgKG1heENvbnRlbnRXaWR0aCA8IDUgJiYgbGluZXMuc29tZShsID0+IGwubGVuZ3RoID4gMCkgJiYgbW9kZWwudXJpLnNjaGVtZSAhPT0gJ2ZpbGUnKSB7XG5cdFx0Y29uc29sZS5sb2coJ3VuZXhwZWN0ZWQgd2lkdGgnKTtcblx0fVxuXHRyZXR1cm4gbWF4Q29udGVudFdpZHRoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGVudFNpemVPZkxpbmVzKGVkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIHJhbmdlOiBMaW5lUmFuZ2UsIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IFNpemUyRFtdIHtcblx0b2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudChlZGl0b3IsIGVkaXRvci5lZGl0b3Iub25EaWRDaGFuZ2VMaW5lSGVpZ2h0KS5yZWFkKHJlYWRlcik7XG5cblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IubW9kZWwucmVhZChyZWFkZXIpO1xuXHRpZiAoIW1vZGVsKSB7IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ01vZGVsIGlzIHJlcXVpcmVkJyk7IH1cblxuXHRjb25zdCBzaXplczogU2l6ZTJEW10gPSBbXTtcblxuXHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBpIDwgcmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTsgaSsrKSB7XG5cdFx0bGV0IGxpbmVDb250ZW50V2lkdGggPSBlZGl0b3IuZ2V0V2lkdGhPZkxpbmUoaSwgcmVhZGVyKTtcblx0XHRpZiAobGluZUNvbnRlbnRXaWR0aCA9PT0gLTEpIHtcblx0XHRcdC8vIGFwcHJveGltYXRpb25cblx0XHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oaSk7XG5cdFx0XHRjb25zdCB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBlZGl0b3IuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdGNvbnN0IGFwcHJveGltYXRpb24gPSBjb2x1bW4gKiB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRsaW5lQ29udGVudFdpZHRoID0gYXBwcm94aW1hdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWlnaHQgPSBlZGl0b3IuZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihuZXcgUG9zaXRpb24oaSwgMSkpO1xuXHRcdHNpemVzLnB1c2gobmV3IFNpemUyRChsaW5lQ29udGVudFdpZHRoLCBoZWlnaHQpKTtcblx0fVxuXG5cdHJldHVybiBzaXplcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9mZnNldEZvclBvcyhlZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLCBwb3M6IFBvc2l0aW9uLCByZWFkZXI6IElSZWFkZXIpOiBudW1iZXIge1xuXHRlZGl0b3IubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdGVkaXRvci52YWx1ZS5yZWFkKHJlYWRlcik7XG5cblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IubW9kZWwucmVhZChyZWFkZXIpO1xuXHRpZiAoIW1vZGVsKSB7IHJldHVybiAwOyB9XG5cblx0ZWRpdG9yLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdGNvbnN0IGxpbmVDb250ZW50V2lkdGggPSBlZGl0b3IuZWRpdG9yLmdldE9mZnNldEZvckNvbHVtbihwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbik7XG5cblx0cmV0dXJuIGxpbmVDb250ZW50V2lkdGg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQcmVmaXhUcmltKGRpZmZSYW5nZXM6IFJhbmdlW10sIG9yaWdpbmFsTGluZXNSYW5nZTogTGluZVJhbmdlLCBtb2RpZmllZExpbmVzOiBzdHJpbmdbXSwgZWRpdG9yOiBJQ29kZUVkaXRvciwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogeyBwcmVmaXhUcmltOiBudW1iZXI7IHByZWZpeExlZnRPZmZzZXQ6IG51bWJlciB9IHtcblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0cmV0dXJuIHsgcHJlZml4VHJpbTogMCwgcHJlZml4TGVmdE9mZnNldDogMCB9O1xuXHR9XG5cblx0Y29uc3QgcmVwbGFjZW1lbnRTdGFydCA9IGRpZmZSYW5nZXMubWFwKHIgPT4gci5pc1NpbmdsZUxpbmUoKSA/IHIuc3RhcnRDb2x1bW4gLSAxIDogMCk7XG5cdGNvbnN0IG9yaWdpbmFsSW5kZW50cyA9IG9yaWdpbmFsTGluZXNSYW5nZS5tYXBUb0xpbmVBcnJheShsaW5lID0+IGluZGVudE9mTGluZSh0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZSkpKTtcblx0Y29uc3QgbW9kaWZpZWRJbmRlbnRzID0gbW9kaWZpZWRMaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lICE9PSAnJykubWFwKGxpbmUgPT4gaW5kZW50T2ZMaW5lKGxpbmUpKTtcblx0Y29uc3QgcHJlZml4VHJpbSA9IE1hdGgubWluKC4uLnJlcGxhY2VtZW50U3RhcnQsIC4uLm9yaWdpbmFsSW5kZW50cywgLi4ubW9kaWZpZWRJbmRlbnRzKTtcblxuXHRsZXQgcHJlZml4TGVmdE9mZnNldDtcblx0Y29uc3Qgc3RhcnRMaW5lSW5kZW50ID0gdGV4dE1vZGVsLmdldExpbmVJbmRlbnRDb2x1bW4ob3JpZ2luYWxMaW5lc1JhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdGlmIChzdGFydExpbmVJbmRlbnQgPj0gcHJlZml4VHJpbSArIDEpIHtcblx0XHQvLyBXZSBjYW4gdXNlIHRoZSBlZGl0b3IgdG8gZ2V0IHRoZSBvZmZzZXRcblx0XHQvLyBUT0RPIGdvIHRocm91Z2ggb3RoZXIgdXNhZ2VzIG9mIGdldE9mZnNldEZvckNvbHVtbiBhbmQgY29tZSB1cCB3aXRoIGEgcm9idXN0IHJlYWN0aXZlIHNvbHV0aW9uIHRvIHJlYWQgaXRcblx0XHRvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7IC8vIGdldE9mZnNldEZvckNvbHVtbiByZXF1aXJlcyB0aGUgbGluZSBudW1iZXIgdG8gYmUgdmlzaWJsZS4gVGhpcyBtaWdodCBjaGFuZ2Ugb24gc2Nyb2xsIHRvcC5cblx0XHRwcmVmaXhMZWZ0T2Zmc2V0ID0gZWRpdG9yLmdldE9mZnNldEZvckNvbHVtbihvcmlnaW5hbExpbmVzUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBwcmVmaXhUcmltICsgMSk7XG5cdH0gZWxzZSBpZiAobW9kaWZpZWRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0Ly8gQ29udGVudCBpcyBub3QgaW4gdGhlIGVkaXRvciwgd2UgY2FuIHVzZSB0aGUgY29udGVudCB3aWR0aCB0byBjYWxjdWxhdGUgdGhlIG9mZnNldFxuXHRcdHByZWZpeExlZnRPZmZzZXQgPSBnZXRDb250ZW50UmVuZGVyV2lkdGgobW9kaWZpZWRMaW5lc1swXS5zbGljZSgwLCBwcmVmaXhUcmltKSwgZWRpdG9yLCB0ZXh0TW9kZWwpO1xuXHR9IGVsc2Uge1xuXHRcdC8vIHVuYWJsZSB0byBhcHByb3hpbWF0ZSB0aGUgb2Zmc2V0XG5cdFx0cmV0dXJuIHsgcHJlZml4VHJpbTogMCwgcHJlZml4TGVmdE9mZnNldDogMCB9O1xuXHR9XG5cblx0cmV0dXJuIHsgcHJlZml4VHJpbSwgcHJlZml4TGVmdE9mZnNldCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGVudFJlbmRlcldpZHRoKGNvbnRlbnQ6IHN0cmluZywgZWRpdG9yOiBJQ29kZUVkaXRvciwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdGNvbnN0IHcgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRjb25zdCB0YWJTaXplID0gdGV4dE1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplICogdztcblxuXHRjb25zdCBudW1UYWJzID0gY29udGVudC5zcGxpdCgnXFx0JykubGVuZ3RoIC0gMTtcblx0Y29uc3QgbnVtTm9uZVRhYnMgPSBjb250ZW50Lmxlbmd0aCAtIG51bVRhYnM7XG5cdHJldHVybiBudW1Ob25lVGFicyAqIHcgKyBudW1UYWJzICogdGFiU2l6ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRvclZhbGlkT3ZlcmxheVJlY3QoZWRpdG9yOiBPYnNlcnZhYmxlQ29kZUVkaXRvcik6IElPYnNlcnZhYmxlPFJlY3Q+IHtcblx0Y29uc3QgY29udGVudExlZnQgPSBlZGl0b3IubGF5b3V0SW5mb0NvbnRlbnRMZWZ0O1xuXG5cdGNvbnN0IHdpZHRoID0gZGVyaXZlZCh7IG5hbWU6ICdlZGl0b3IudmFsaWRPdmVybGF5LndpZHRoJyB9LCByID0+IHtcblx0XHRjb25zdCBoYXNNaW5pbWFwT25UaGVSaWdodCA9IGVkaXRvci5sYXlvdXRJbmZvTWluaW1hcC5yZWFkKHIpLm1pbmltYXBMZWZ0ICE9PSAwO1xuXHRcdGNvbnN0IGVkaXRvcldpZHRoID0gTWF0aC5tYXgoMCwgZWRpdG9yLmxheW91dEluZm9XaWR0aC5yZWFkKHIpIC0gY29udGVudExlZnQucmVhZChyKSk7XG5cblx0XHRpZiAoaGFzTWluaW1hcE9uVGhlUmlnaHQpIHtcblx0XHRcdGNvbnN0IG1pbmltYXBBbmRTY3JvbGxiYXJXaWR0aCA9IGVkaXRvci5sYXlvdXRJbmZvTWluaW1hcC5yZWFkKHIpLm1pbmltYXBXaWR0aCArIGVkaXRvci5sYXlvdXRJbmZvVmVydGljYWxTY3JvbGxiYXJXaWR0aC5yZWFkKHIpO1xuXHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIGVkaXRvcldpZHRoIC0gbWluaW1hcEFuZFNjcm9sbGJhcldpZHRoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yV2lkdGg7XG5cdH0pO1xuXG5cdGNvbnN0IGhlaWdodCA9IGRlcml2ZWQoeyBuYW1lOiAnZWRpdG9yLnZhbGlkT3ZlcmxheS5oZWlnaHQnIH0sIHIgPT4gZWRpdG9yLmxheW91dEluZm9IZWlnaHQucmVhZChyKSArIGVkaXRvci5jb250ZW50SGVpZ2h0LnJlYWQocikpO1xuXG5cdHJldHVybiBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXknIH0sIHIgPT4gUmVjdC5mcm9tTGVmdFRvcFdpZHRoSGVpZ2h0KGNvbnRlbnRMZWZ0LnJlYWQociksIDAsIHdpZHRoLnJlYWQociksIGhlaWdodC5yZWFkKHIpKSk7XG59XG5cbmV4cG9ydCBjbGFzcyBTdGF0dXNCYXJWaWV3SXRlbSBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF91cGRhdGVMYWJlbExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KCgpID0+IHtcblx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdH0pKTtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKSB7XG5cdFx0Y29uc3Qga2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuX2FjdGlvbi5pZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRydWUpO1xuXHRcdGlmICgha2IpIHtcblx0XHRcdHJldHVybiBzdXBlci51cGRhdGVMYWJlbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0Y29uc3QgZGl2ID0gaCgnZGl2LmtleWJpbmRpbmcnKS5yb290O1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWJpbmRpbmdMYWJlbChkaXYsIE9TLCB7IGRpc2FibGVUaXRsZTogdHJ1ZSwgLi4udW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zIH0pKTtcblx0XHRcdGtleWJpbmRpbmdMYWJlbC5zZXQoa2IpO1xuXHRcdFx0dGhpcy5sYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0XHRcdHRoaXMubGFiZWwuYXBwZW5kQ2hpbGQoZGl2KTtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnaW5saW5lU3VnZ2VzdGlvblN0YXR1c0Jhckl0ZW1MYWJlbCcpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVUb29sdGlwKCk6IHZvaWQge1xuXHRcdC8vIE5PT1AsIGRpc2FibGUgdG9vbHRpcFxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmlxdWVVcmlHZW5lcmF0b3Ige1xuXHRwcml2YXRlIHN0YXRpYyBfbW9kZWxJZCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNjaGVtZTogc3RyaW5nXG5cdCkgeyB9XG5cblx0cHVibGljIGdldFVuaXF1ZVVyaSgpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5zY2hlbWUsIHBhdGg6IG5ldyBEYXRlKCkudG9TdHJpbmcoKSArIFN0cmluZyhVbmlxdWVVcmlHZW5lcmF0b3IuX21vZGVsSWQrKykgfSk7XG5cdH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUVkaXRUb01vZGlmaWVkUmFuZ2VNYXBwaW5ncyhyYW5nZU1hcHBpbmc6IFJhbmdlTWFwcGluZ1tdLCBlZGl0OiBUZXh0RWRpdCk6IFJhbmdlTWFwcGluZ1tdIHtcblx0Y29uc3QgdXBkYXRlZE1hcHBpbmdzOiBSYW5nZU1hcHBpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG0gb2YgcmFuZ2VNYXBwaW5nKSB7XG5cdFx0Y29uc3QgdXBkYXRlZFJhbmdlID0gZWRpdC5tYXBSYW5nZShtLm1vZGlmaWVkUmFuZ2UpO1xuXHRcdHVwZGF0ZWRNYXBwaW5ncy5wdXNoKG5ldyBSYW5nZU1hcHBpbmcobS5vcmlnaW5hbFJhbmdlLCB1cGRhdGVkUmFuZ2UpKTtcblx0fVxuXHRyZXR1cm4gdXBkYXRlZE1hcHBpbmdzO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFzc05hbWVzKC4uLmNsYXNzZXM6IChzdHJpbmcgfCBmYWxzZSB8IHVuZGVmaW5lZCB8IG51bGwpW10pIHtcblx0cmV0dXJuIGNsYXNzZXMuZmlsdGVyKGMgPT4gdHlwZW9mIGMgPT09ICdzdHJpbmcnKS5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIG9mZnNldFJhbmdlVG9SYW5nZShjb2x1bW5PZmZzZXRSYW5nZTogT2Zmc2V0UmFuZ2UsIHN0YXJ0UG9zOiBQb3NpdGlvbik6IFJhbmdlIHtcblx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRzdGFydFBvcy5saW5lTnVtYmVyLFxuXHRcdHN0YXJ0UG9zLmNvbHVtbiArIGNvbHVtbk9mZnNldFJhbmdlLnN0YXJ0LFxuXHRcdHN0YXJ0UG9zLmxpbmVOdW1iZXIsXG5cdFx0c3RhcnRQb3MuY29sdW1uICsgY29sdW1uT2Zmc2V0UmFuZ2UuZW5kRXhjbHVzaXZlLFxuXHQpO1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGluZGVudGF0aW9uIHNpemUgKGluIHNwYWNlcykgb2YgYSBnaXZlbiBsaW5lLFxuICogaW50ZXJwcmV0aW5nIHRhYnMgYXMgdGhlIHNwZWNpZmllZCB0YWIgc2l6ZS5cbiAqL1xuZnVuY3Rpb24gZ2V0SW5kZW50YXRpb25TaXplKGxpbmU6IHN0cmluZywgdGFiU2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0bGV0IGN1cnJlbnRTaXplID0gMDtcblx0bG9vcDogZm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmUubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRzd2l0Y2ggKGxpbmUuY2hhckNvZGVBdChpKSkge1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6IGN1cnJlbnRTaXplICs9IHRhYlNpemU7IGJyZWFrO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTogY3VycmVudFNpemUrKzsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiBicmVhayBsb29wO1xuXHRcdH1cblx0fVxuXHQvLyBpZiBjdXJyZW50U2l6ZSAlIHRhYlNpemUgIT09IDAsXG5cdC8vIHRoZW4gdGhlcmUgYXJlIHNwYWNlcyB3aGljaCBhcmUgbm90IHBhcnQgb2YgdGhlIGluZGVudGF0aW9uXG5cdHJldHVybiBjdXJyZW50U2l6ZSAtIChjdXJyZW50U2l6ZSAlIHRhYlNpemUpO1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIGF0IHRoZSBzdGFydCBvZiBhIGxpbmUgdGhhdCBjb3JyZXNwb25kIHRvIGEgZ2l2ZW4gaW5kZW50YXRpb24gc2l6ZSxcbiAqIHRha2luZyBpbnRvIGFjY291bnQgYm90aCB0YWJzIGFuZCBzcGFjZXMuXG4gKi9cbmZ1bmN0aW9uIGluZGVudFNpemVUb0luZGVudExlbmd0aChsaW5lOiBzdHJpbmcsIGluZGVudFNpemU6IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0bGV0IHJlbWFpbmluZ1NpemUgPSBpbmRlbnRTaXplIC0gKGluZGVudFNpemUgJSB0YWJTaXplKTtcblx0bGV0IGkgPSAwO1xuXHRmb3IgKDsgaSA8IGxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAocmVtYWluaW5nU2l6ZSA9PT0gMCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHN3aXRjaCAobGluZS5jaGFyQ29kZUF0KGkpKSB7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlRhYjogcmVtYWluaW5nU2l6ZSAtPSB0YWJTaXplOyBicmVhaztcblx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6IHJlbWFpbmluZ1NpemUtLTsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdVbmV4cGVjdGVkIGNoYXJhY3RlciBmb3VuZCB3aGlsZSBjYWxjdWxhdGluZyBpbmRlbnQgbGVuZ3RoJyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVpbmRlbnRFZGl0KHRleHQ6IHN0cmluZywgcmFuZ2U6IExpbmVSYW5nZSwgdGFiU2l6ZTogbnVtYmVyKTogVGV4dEVkaXQge1xuXHRjb25zdCBuZXdMaW5lcyA9IHNwbGl0TGluZXModGV4dCk7XG5cdGNvbnN0IGVkaXRzOiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRjb25zdCBtaW5JbmRlbnRTaXplID0gZmluZEZpcnN0TWluKHJhbmdlLm1hcFRvTGluZUFycmF5KGwgPT4gZ2V0SW5kZW50YXRpb25TaXplKG5ld0xpbmVzW2wgLSAxXSwgdGFiU2l6ZSkpLCBudW1iZXJDb21wYXJhdG9yKSE7XG5cdHJhbmdlLmZvckVhY2gobGluZU51bWJlciA9PiB7XG5cdFx0Y29uc3QgaW5kZW50TGVuZ3RoID0gaW5kZW50U2l6ZVRvSW5kZW50TGVuZ3RoKG5ld0xpbmVzW2xpbmVOdW1iZXIgLSAxXSwgbWluSW5kZW50U2l6ZSwgdGFiU2l6ZSk7XG5cdFx0ZWRpdHMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KG9mZnNldFJhbmdlVG9SYW5nZShuZXcgT2Zmc2V0UmFuZ2UoMCwgaW5kZW50TGVuZ3RoKSwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKSwgJycpKTtcblx0fSk7XG5cdHJldHVybiBuZXcgVGV4dEVkaXQoZWRpdHMpO1xufVxuXG5leHBvcnQgY2xhc3MgUGF0aEJ1aWxkZXIge1xuXHRwcml2YXRlIF9kYXRhOiBzdHJpbmcgPSAnJztcblxuXHRwdWJsaWMgbW92ZVRvKHBvaW50OiBQb2ludCk6IHRoaXMge1xuXHRcdHRoaXMuX2RhdGEgKz0gYE0gJHtwb2ludC54fSAke3BvaW50Lnl9IGA7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgbGluZVRvKHBvaW50OiBQb2ludCk6IHRoaXMge1xuXHRcdHRoaXMuX2RhdGEgKz0gYEwgJHtwb2ludC54fSAke3BvaW50Lnl9IGA7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgY3VydmVUbyhjcDogUG9pbnQsIHRvOiBQb2ludCk6IHRoaXMge1xuXHRcdHRoaXMuX2RhdGEgKz0gYFEgJHtjcC54fSAke2NwLnl9ICR7dG8ueH0gJHt0by55fSBgO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGN1cnZlVG8yKGNwMTogUG9pbnQsIGNwMjogUG9pbnQsIHRvOiBQb2ludCk6IHRoaXMge1xuXHRcdHRoaXMuX2RhdGEgKz0gYEMgJHtjcDEueH0gJHtjcDEueX0gJHtjcDIueH0gJHtjcDIueX0gJHt0by54fSAke3RvLnl9IGA7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgYnVpbGQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZGF0YTtcblx0fVxufVxuXG4vLyBBcmd1bWVudHMgYXJlIGEgYml0IG1lc3N5IGN1cnJlbnRseSwgY291bGQgYmUgaW1wcm92ZWRcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZWN0YW5nbGUoXG5cdGxheW91dDogeyB0b3BMZWZ0OiBQb2ludDsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSxcblx0cGFkZGluZzogbnVtYmVyIHwgeyB0b3A6IG51bWJlcjsgcmlnaHQ6IG51bWJlcjsgYm90dG9tOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9LFxuXHRib3JkZXJSYWRpdXM6IG51bWJlciB8IHsgdG9wTGVmdDogbnVtYmVyOyB0b3BSaWdodDogbnVtYmVyOyBib3R0b21MZWZ0OiBudW1iZXI7IGJvdHRvbVJpZ2h0OiBudW1iZXIgfSxcblx0b3B0aW9uczogeyBoaWRlTGVmdD86IGJvb2xlYW47IGhpZGVSaWdodD86IGJvb2xlYW47IGhpZGVUb3A/OiBib29sZWFuOyBoaWRlQm90dG9tPzogYm9vbGVhbiB9ID0ge31cbik6IHN0cmluZyB7XG5cblx0Y29uc3QgdG9wTGVmdElubmVyID0gbGF5b3V0LnRvcExlZnQ7XG5cdGNvbnN0IHRvcFJpZ2h0SW5uZXIgPSB0b3BMZWZ0SW5uZXIuZGVsdGFYKGxheW91dC53aWR0aCk7XG5cdGNvbnN0IGJvdHRvbUxlZnRJbm5lciA9IHRvcExlZnRJbm5lci5kZWx0YVkobGF5b3V0LmhlaWdodCk7XG5cdGNvbnN0IGJvdHRvbVJpZ2h0SW5uZXIgPSBib3R0b21MZWZ0SW5uZXIuZGVsdGFYKGxheW91dC53aWR0aCk7XG5cblx0Ly8gcGFkZGluZ1xuXHRjb25zdCB7IHRvcDogcGFkZGluZ1RvcCwgYm90dG9tOiBwYWRkaW5nQm90dG9tLCBsZWZ0OiBwYWRkaW5nTGVmdCwgcmlnaHQ6IHBhZGRpbmdSaWdodCB9ID0gdHlwZW9mIHBhZGRpbmcgPT09ICdudW1iZXInID9cblx0XHR7IHRvcDogcGFkZGluZywgYm90dG9tOiBwYWRkaW5nLCBsZWZ0OiBwYWRkaW5nLCByaWdodDogcGFkZGluZyB9XG5cdFx0OiBwYWRkaW5nO1xuXG5cdC8vIGNvcm5lciByYWRpdXNcblx0Y29uc3QgeyB0b3BMZWZ0OiByYWRpdXNUTCwgdG9wUmlnaHQ6IHJhZGl1c1RSLCBib3R0b21MZWZ0OiByYWRpdXNCTCwgYm90dG9tUmlnaHQ6IHJhZGl1c0JSIH0gPSB0eXBlb2YgYm9yZGVyUmFkaXVzID09PSAnbnVtYmVyJyA/XG5cdFx0eyB0b3BMZWZ0OiBib3JkZXJSYWRpdXMsIHRvcFJpZ2h0OiBib3JkZXJSYWRpdXMsIGJvdHRvbUxlZnQ6IGJvcmRlclJhZGl1cywgYm90dG9tUmlnaHQ6IGJvcmRlclJhZGl1cyB9IDpcblx0XHRib3JkZXJSYWRpdXM7XG5cblx0Y29uc3QgdG90YWxIZWlnaHQgPSBsYXlvdXQuaGVpZ2h0ICsgcGFkZGluZ1RvcCArIHBhZGRpbmdCb3R0b207XG5cdGNvbnN0IHRvdGFsV2lkdGggPSBsYXlvdXQud2lkdGggKyBwYWRkaW5nTGVmdCArIHBhZGRpbmdSaWdodDtcblxuXHQvLyBUaGUgcGF0aCBpcyBkcmF3biBmcm9tIGJvdHRvbSBsZWZ0IGF0IHRoZSBlbmQgb2YgdGhlIHJvdW5kZWQgY29ybmVyIGluIGEgY2xvY2t3aXNlIGRpcmVjdGlvblxuXHQvLyBCZWZvcmU6IGJlZm9yZSB0aGUgcm91bmRlZCBjb3JuZXJcblx0Ly8gQWZ0ZXI6IGFmdGVyIHRoZSByb3VuZGVkIGNvcm5lclxuXHRjb25zdCB0b3BMZWZ0ID0gdG9wTGVmdElubmVyLmRlbHRhWCgtcGFkZGluZ0xlZnQpLmRlbHRhWSgtcGFkZGluZ1RvcCk7XG5cdGNvbnN0IHRvcFJpZ2h0ID0gdG9wUmlnaHRJbm5lci5kZWx0YVgocGFkZGluZ1JpZ2h0KS5kZWx0YVkoLXBhZGRpbmdUb3ApO1xuXHRjb25zdCB0b3BMZWZ0QmVmb3JlID0gdG9wTGVmdC5kZWx0YVkoTWF0aC5taW4ocmFkaXVzVEwsIHRvdGFsSGVpZ2h0IC8gMikpO1xuXHRjb25zdCB0b3BMZWZ0QWZ0ZXIgPSB0b3BMZWZ0LmRlbHRhWChNYXRoLm1pbihyYWRpdXNUTCwgdG90YWxXaWR0aCAvIDIpKTtcblx0Y29uc3QgdG9wUmlnaHRCZWZvcmUgPSB0b3BSaWdodC5kZWx0YVgoLU1hdGgubWluKHJhZGl1c1RSLCB0b3RhbFdpZHRoIC8gMikpO1xuXHRjb25zdCB0b3BSaWdodEFmdGVyID0gdG9wUmlnaHQuZGVsdGFZKE1hdGgubWluKHJhZGl1c1RSLCB0b3RhbEhlaWdodCAvIDIpKTtcblxuXHRjb25zdCBib3R0b21MZWZ0ID0gYm90dG9tTGVmdElubmVyLmRlbHRhWCgtcGFkZGluZ0xlZnQpLmRlbHRhWShwYWRkaW5nQm90dG9tKTtcblx0Y29uc3QgYm90dG9tUmlnaHQgPSBib3R0b21SaWdodElubmVyLmRlbHRhWChwYWRkaW5nUmlnaHQpLmRlbHRhWShwYWRkaW5nQm90dG9tKTtcblx0Y29uc3QgYm90dG9tTGVmdEJlZm9yZSA9IGJvdHRvbUxlZnQuZGVsdGFYKE1hdGgubWluKHJhZGl1c0JMLCB0b3RhbFdpZHRoIC8gMikpO1xuXHRjb25zdCBib3R0b21MZWZ0QWZ0ZXIgPSBib3R0b21MZWZ0LmRlbHRhWSgtTWF0aC5taW4ocmFkaXVzQkwsIHRvdGFsSGVpZ2h0IC8gMikpO1xuXHRjb25zdCBib3R0b21SaWdodEJlZm9yZSA9IGJvdHRvbVJpZ2h0LmRlbHRhWSgtTWF0aC5taW4ocmFkaXVzQlIsIHRvdGFsSGVpZ2h0IC8gMikpO1xuXHRjb25zdCBib3R0b21SaWdodEFmdGVyID0gYm90dG9tUmlnaHQuZGVsdGFYKC1NYXRoLm1pbihyYWRpdXNCUiwgdG90YWxXaWR0aCAvIDIpKTtcblxuXHRjb25zdCBwYXRoID0gbmV3IFBhdGhCdWlsZGVyKCk7XG5cblx0aWYgKCFvcHRpb25zLmhpZGVMZWZ0KSB7XG5cdFx0cGF0aC5tb3ZlVG8oYm90dG9tTGVmdEFmdGVyKS5saW5lVG8odG9wTGVmdEJlZm9yZSk7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZUxlZnQgJiYgIW9wdGlvbnMuaGlkZVRvcCkge1xuXHRcdHBhdGguY3VydmVUbyh0b3BMZWZ0LCB0b3BMZWZ0QWZ0ZXIpO1xuXHR9IGVsc2Uge1xuXHRcdHBhdGgubW92ZVRvKHRvcExlZnRBZnRlcik7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZVRvcCkge1xuXHRcdHBhdGgubGluZVRvKHRvcFJpZ2h0QmVmb3JlKTtcblx0fVxuXG5cdGlmICghb3B0aW9ucy5oaWRlVG9wICYmICFvcHRpb25zLmhpZGVSaWdodCkge1xuXHRcdHBhdGguY3VydmVUbyh0b3BSaWdodCwgdG9wUmlnaHRBZnRlcik7XG5cdH0gZWxzZSB7XG5cdFx0cGF0aC5tb3ZlVG8odG9wUmlnaHRBZnRlcik7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZVJpZ2h0KSB7XG5cdFx0cGF0aC5saW5lVG8oYm90dG9tUmlnaHRCZWZvcmUpO1xuXHR9XG5cblx0aWYgKCFvcHRpb25zLmhpZGVSaWdodCAmJiAhb3B0aW9ucy5oaWRlQm90dG9tKSB7XG5cdFx0cGF0aC5jdXJ2ZVRvKGJvdHRvbVJpZ2h0LCBib3R0b21SaWdodEFmdGVyKTtcblx0fSBlbHNlIHtcblx0XHRwYXRoLm1vdmVUbyhib3R0b21SaWdodEFmdGVyKTtcblx0fVxuXG5cdGlmICghb3B0aW9ucy5oaWRlQm90dG9tKSB7XG5cdFx0cGF0aC5saW5lVG8oYm90dG9tTGVmdEJlZm9yZSk7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZUJvdHRvbSAmJiAhb3B0aW9ucy5oaWRlTGVmdCkge1xuXHRcdHBhdGguY3VydmVUbyhib3R0b21MZWZ0LCBib3R0b21MZWZ0QWZ0ZXIpO1xuXHR9IGVsc2Uge1xuXHRcdHBhdGgubW92ZVRvKGJvdHRvbUxlZnRBZnRlcik7XG5cdH1cblxuXHRyZXR1cm4gcGF0aC5idWlsZCgpO1xufVxuXG50eXBlIFJlbW92ZUZhbHN5PFQ+ID0gVCBleHRlbmRzIGZhbHNlIHwgdW5kZWZpbmVkIHwgbnVsbCA/IG5ldmVyIDogVDtcbnR5cGUgRmFsc3k8VD4gPSBUIGV4dGVuZHMgZmFsc2UgfCB1bmRlZmluZWQgfCBudWxsID8gVCA6IG5ldmVyO1xuXG5leHBvcnQgZnVuY3Rpb24gbWFwT3V0RmFsc3k8VD4ob2JzOiBJT2JzZXJ2YWJsZTxUPik6IElPYnNlcnZhYmxlPElPYnNlcnZhYmxlPFJlbW92ZUZhbHN5PFQ+PiB8IEZhbHN5PFQ+PiB7XG5cdGNvbnN0IG5vblVuZGVmaW5lZE9icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPFQgfCB1bmRlZmluZWQgfCBudWxsIHwgZmFsc2U+KHVuZGVmaW5lZCwgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiBvYnMucmVhZChyZWFkZXIpIHx8IGxhc3RWYWx1ZSk7XG5cblx0cmV0dXJuIGRlcml2ZWRPcHRzKHtcblx0XHRkZWJ1Z05hbWU6ICgpID0+IGAke29icy5kZWJ1Z05hbWV9Lm1hcE91dEZhbHN5YFxuXHR9LCByZWFkZXIgPT4ge1xuXHRcdG5vblVuZGVmaW5lZE9icy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgdmFsID0gb2JzLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXZhbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZCBhcyBGYWxzeTxUPjtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9uVW5kZWZpbmVkT2JzIGFzIElPYnNlcnZhYmxlPFJlbW92ZUZhbHN5PFQ+Pjtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvYnNlcnZlRWxlbWVudFBvc2l0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdGNvbnN0IHRvcExlZnQgPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGVsZW1lbnQpO1xuXHRjb25zdCB0b3AgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPigndG9wJywgdG9wTGVmdC50b3ApO1xuXHRjb25zdCBsZWZ0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4oJ2xlZnQnLCB0b3BMZWZ0LmxlZnQpO1xuXG5cdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRjb25zdCB0b3BMZWZ0ID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihlbGVtZW50KTtcblx0XHRcdHRvcC5zZXQodG9wTGVmdC50b3AsIHR4KTtcblx0XHRcdGxlZnQuc2V0KHRvcExlZnQubGVmdCwgdHgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRyZXNpemVPYnNlcnZlci5vYnNlcnZlKGVsZW1lbnQpO1xuXG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cblx0cmV0dXJuIHtcblx0XHR0b3AsXG5cdFx0bGVmdFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdFRvUHJvcHMoZm46IChyZWFkZXI6IElSZWFkZXIpID0+IFJlY3QgfCB1bmRlZmluZWQsIGRlYnVnTG9jYXRpb246IERlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpIHtcblx0cmV0dXJuIHtcblx0XHRsZWZ0OiBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXkubGVmdCcgfSwgcmVhZGVyID0+IC8qKiBAZGVzY3JpcHRpb24gbGVmdCAqLyBmbihyZWFkZXIpPy5sZWZ0LCBkZWJ1Z0xvY2F0aW9uKSxcblx0XHR0b3A6IGRlcml2ZWQoeyBuYW1lOiAnZWRpdG9yLnZhbGlkT3ZlcmxheS50b3AnIH0sIHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIHRvcCAqLyBmbihyZWFkZXIpPy50b3AsIGRlYnVnTG9jYXRpb24pLFxuXHRcdHdpZHRoOiBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXkud2lkdGgnIH0sIHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHdpZHRoICovXG5cdFx0XHRjb25zdCB2YWwgPSBmbihyZWFkZXIpO1xuXHRcdFx0aWYgKCF2YWwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWwud2lkdGg7XG5cdFx0fSwgZGVidWdMb2NhdGlvbiksXG5cdFx0aGVpZ2h0OiBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXkuaGVpZ2h0JyB9LCByZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBoZWlnaHQgKi9cblx0XHRcdGNvbnN0IHZhbCA9IGZuKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZhbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbC5oZWlnaHQ7XG5cdFx0fSwgZGVidWdMb2NhdGlvbiksXG5cdH07XG59XG5cbmV4cG9ydCB0eXBlIEZpcnN0Rm5Bcmc8VD4gPSBUIGV4dGVuZHMgKGFyZzogaW5mZXIgVSkgPT4gYW55ID8gVSA6IG5ldmVyO1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBvYnNlcnZlRWRpdG9yQm91bmRpbmdDbGllbnRSZWN0KGVkaXRvcjogSUNvZGVFZGl0b3IsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxET01SZWN0UmVhZE9ubHk+IHtcblx0Y29uc3QgZG9tID0gZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSE7XG5cdGNvbnN0IGluaXRpYWxEb21SZWN0ID0gb2JzZXJ2YWJsZVZhbHVlKCdkb21SZWN0JywgZG9tLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpKTtcblx0c3RvcmUuYWRkKGVkaXRvci5vbkRpZExheW91dENoYW5nZShlID0+IHtcblx0XHRpbml0aWFsRG9tUmVjdC5zZXQoZG9tLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLCB1bmRlZmluZWQpO1xuXHR9KSk7XG5cdHJldHVybiBpbml0aWFsRG9tUmVjdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsd0JBQXdCLFNBQVM7QUFDMUMsU0FBUyxpQkFBaUIsc0NBQXNDO0FBQ2hFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTBCLG9CQUFvQjtBQUM5QyxTQUFTLGVBQWUsU0FB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
