var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { addDisposableListener, addStandardDisposableListener, reset } from "../../../../../base/browser/dom.js";
import { createTrustedTypesPolicy } from "../../../../../base/browser/trustedTypes.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { forEachAdjacent, groupAdjacentBy } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, observableValue, subtransaction, transaction } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { applyFontInfo } from "../../../config/domFontInfo.js";
import { applyStyle } from "../utils.js";
import { EditorFontLigatures, EditorOption } from "../../../../common/config/editorOptions.js";
import { LineRange } from "../../../../common/core/ranges/lineRange.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { LineRangeMapping } from "../../../../common/diff/rangeMapping.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { LineTokens } from "../../../../common/tokens/lineTokens.js";
import { RenderLineInput, renderViewLine2 } from "../../../../common/viewLayout/viewLineRenderer.js";
import { ViewLineRenderingData } from "../../../../common/viewModel.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { registerIcon } from "../../../../../platform/theme/common/iconRegistry.js";
import "./accessibleDiffViewer.css";
import { toAction } from "../../../../../base/common/actions.js";
const accessibleDiffViewerInsertIcon = registerIcon("diff-review-insert", Codicon.add, localize("accessibleDiffViewerInsertIcon", "Icon for 'Insert' in accessible diff viewer."));
const accessibleDiffViewerRemoveIcon = registerIcon("diff-review-remove", Codicon.remove, localize("accessibleDiffViewerRemoveIcon", "Icon for 'Remove' in accessible diff viewer."));
const accessibleDiffViewerCloseIcon = registerIcon("diff-review-close", Codicon.close, localize("accessibleDiffViewerCloseIcon", "Icon for 'Close' in accessible diff viewer."));
let AccessibleDiffViewer = class extends Disposable {
  constructor(_parentNode, _visible, _setVisible, _canClose, _width, _height, _diffs, _models, _instantiationService) {
    super();
    this._parentNode = _parentNode;
    this._visible = _visible;
    this._setVisible = _setVisible;
    this._canClose = _canClose;
    this._width = _width;
    this._height = _height;
    this._diffs = _diffs;
    this._models = _models;
    this._instantiationService = _instantiationService;
    this._state = derived(this, (reader) => {
      const visible = this._visible.read(reader);
      this._parentNode.style.visibility = visible ? "visible" : "hidden";
      if (!visible) {
        return null;
      }
      const model = reader.store.add(this._instantiationService.createInstance(ViewModel, this._diffs, this._models, this._setVisible, this._canClose));
      const view = reader.store.add(this._instantiationService.createInstance(View, this._parentNode, model, this._width, this._height, this._models));
      return { model, view };
    }).recomputeInitiallyAndOnChange(this._store);
  }
  next() {
    transaction((tx) => {
      const isVisible = this._visible.get();
      this._setVisible(true, tx);
      if (isVisible) {
        this._state.get().model.nextGroup(tx);
      }
    });
  }
  prev() {
    transaction((tx) => {
      this._setVisible(true, tx);
      this._state.get().model.previousGroup(tx);
    });
  }
  close() {
    transaction((tx) => {
      this._setVisible(false, tx);
    });
  }
};
AccessibleDiffViewer._ttPolicy = createTrustedTypesPolicy("diffReview", { createHTML: (value) => value });
AccessibleDiffViewer = __decorateClass([
  __decorateParam(8, IInstantiationService)
], AccessibleDiffViewer);
let ViewModel = class extends Disposable {
  constructor(_diffs, _models, _setVisible, canClose, _accessibilitySignalService) {
    super();
    this._diffs = _diffs;
    this._models = _models;
    this._setVisible = _setVisible;
    this.canClose = canClose;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._groups = observableValue(this, []);
    this._currentGroupIdx = observableValue(this, 0);
    this._currentElementIdx = observableValue(this, 0);
    this.groups = this._groups;
    this.currentGroup = this._currentGroupIdx.map((idx, r) => this._groups.read(r)[idx]);
    this.currentGroupIndex = this._currentGroupIdx;
    this.currentElement = this._currentElementIdx.map((idx, r) => this.currentGroup.read(r)?.lines[idx]);
    this._register(autorun((reader) => {
      const diffs = this._diffs.read(reader);
      if (!diffs) {
        this._groups.set([], void 0);
        return;
      }
      const groups = computeViewElementGroups(
        diffs,
        this._models.getOriginalModel().getLineCount(),
        this._models.getModifiedModel().getLineCount()
      );
      transaction((tx) => {
        const p = this._models.getModifiedPosition();
        if (p) {
          const nextGroup = groups.findIndex((g) => p?.lineNumber < g.range.modified.endLineNumberExclusive);
          if (nextGroup !== -1) {
            this._currentGroupIdx.set(nextGroup, tx);
          }
        }
        this._groups.set(groups, tx);
      });
    }));
    this._register(autorun((reader) => {
      const currentViewItem = this.currentElement.read(reader);
      if (currentViewItem?.type === 2 /* Deleted */) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { source: "accessibleDiffViewer.currentElementChanged" });
      } else if (currentViewItem?.type === 3 /* Added */) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { source: "accessibleDiffViewer.currentElementChanged" });
      }
    }));
    this._register(autorun((reader) => {
      const currentViewItem = this.currentElement.read(reader);
      if (currentViewItem && currentViewItem.type !== 0 /* Header */) {
        const lineNumber = currentViewItem.modifiedLineNumber ?? currentViewItem.diff.modified.startLineNumber;
        this._models.modifiedSetSelection(Range.fromPositions(new Position(lineNumber, 1)));
      }
    }));
  }
  _goToGroupDelta(delta, tx) {
    const groups = this.groups.get();
    if (!groups || groups.length <= 1) {
      return;
    }
    subtransaction(tx, (tx2) => {
      this._currentGroupIdx.set(OffsetRange.ofLength(groups.length).clipCyclic(this._currentGroupIdx.get() + delta), tx2);
      this._currentElementIdx.set(0, tx2);
    });
  }
  nextGroup(tx) {
    this._goToGroupDelta(1, tx);
  }
  previousGroup(tx) {
    this._goToGroupDelta(-1, tx);
  }
  _goToLineDelta(delta) {
    const group = this.currentGroup.get();
    if (!group || group.lines.length <= 1) {
      return;
    }
    transaction((tx) => {
      this._currentElementIdx.set(OffsetRange.ofLength(group.lines.length).clip(this._currentElementIdx.get() + delta), tx);
    });
  }
  goToNextLine() {
    this._goToLineDelta(1);
  }
  goToPreviousLine() {
    this._goToLineDelta(-1);
  }
  goToLine(line) {
    const group = this.currentGroup.get();
    if (!group) {
      return;
    }
    const idx = group.lines.indexOf(line);
    if (idx === -1) {
      return;
    }
    transaction((tx) => {
      this._currentElementIdx.set(idx, tx);
    });
  }
  revealCurrentElementInEditor() {
    if (!this.canClose.get()) {
      return;
    }
    this._setVisible(false, void 0);
    const curElem = this.currentElement.get();
    if (curElem) {
      if (curElem.type === 2 /* Deleted */) {
        this._models.originalReveal(Range.fromPositions(new Position(curElem.originalLineNumber, 1)));
      } else {
        this._models.modifiedReveal(
          curElem.type !== 0 /* Header */ ? Range.fromPositions(new Position(curElem.modifiedLineNumber, 1)) : void 0
        );
      }
    }
  }
  close() {
    if (!this.canClose.get()) {
      return;
    }
    this._setVisible(false, void 0);
    this._models.modifiedFocus();
  }
};
ViewModel = __decorateClass([
  __decorateParam(4, IAccessibilitySignalService)
], ViewModel);
const viewElementGroupLineMargin = 3;
function computeViewElementGroups(diffs, originalLineCount, modifiedLineCount) {
  const result = [];
  for (const g of groupAdjacentBy(diffs, (a, b) => b.modified.startLineNumber - a.modified.endLineNumberExclusive < 2 * viewElementGroupLineMargin)) {
    const viewElements = [];
    viewElements.push(new HeaderViewElement());
    const origFullRange = new LineRange(
      Math.max(1, g[0].original.startLineNumber - viewElementGroupLineMargin),
      Math.min(g[g.length - 1].original.endLineNumberExclusive + viewElementGroupLineMargin, originalLineCount + 1)
    );
    const modifiedFullRange = new LineRange(
      Math.max(1, g[0].modified.startLineNumber - viewElementGroupLineMargin),
      Math.min(g[g.length - 1].modified.endLineNumberExclusive + viewElementGroupLineMargin, modifiedLineCount + 1)
    );
    forEachAdjacent(g, (a, b) => {
      const origRange = new LineRange(a ? a.original.endLineNumberExclusive : origFullRange.startLineNumber, b ? b.original.startLineNumber : origFullRange.endLineNumberExclusive);
      const modifiedRange2 = new LineRange(a ? a.modified.endLineNumberExclusive : modifiedFullRange.startLineNumber, b ? b.modified.startLineNumber : modifiedFullRange.endLineNumberExclusive);
      origRange.forEach((origLineNumber) => {
        viewElements.push(new UnchangedLineViewElement(origLineNumber, modifiedRange2.startLineNumber + (origLineNumber - origRange.startLineNumber)));
      });
      if (b) {
        b.original.forEach((origLineNumber) => {
          viewElements.push(new DeletedLineViewElement(b, origLineNumber));
        });
        b.modified.forEach((modifiedLineNumber) => {
          viewElements.push(new AddedLineViewElement(b, modifiedLineNumber));
        });
      }
    });
    const modifiedRange = g[0].modified.join(g[g.length - 1].modified);
    const originalRange = g[0].original.join(g[g.length - 1].original);
    result.push(new ViewElementGroup(new LineRangeMapping(modifiedRange, originalRange), viewElements));
  }
  return result;
}
var LineType = /* @__PURE__ */ ((LineType2) => {
  LineType2[LineType2["Header"] = 0] = "Header";
  LineType2[LineType2["Unchanged"] = 1] = "Unchanged";
  LineType2[LineType2["Deleted"] = 2] = "Deleted";
  LineType2[LineType2["Added"] = 3] = "Added";
  return LineType2;
})(LineType || {});
class ViewElementGroup {
  constructor(range, lines) {
    this.range = range;
    this.lines = lines;
  }
}
class HeaderViewElement {
  constructor() {
    this.type = 0 /* Header */;
  }
}
class DeletedLineViewElement {
  constructor(diff, originalLineNumber) {
    this.diff = diff;
    this.originalLineNumber = originalLineNumber;
    this.type = 2 /* Deleted */;
    this.modifiedLineNumber = void 0;
  }
}
class AddedLineViewElement {
  constructor(diff, modifiedLineNumber) {
    this.diff = diff;
    this.modifiedLineNumber = modifiedLineNumber;
    this.type = 3 /* Added */;
    this.originalLineNumber = void 0;
  }
}
class UnchangedLineViewElement {
  constructor(originalLineNumber, modifiedLineNumber) {
    this.originalLineNumber = originalLineNumber;
    this.modifiedLineNumber = modifiedLineNumber;
    this.type = 1 /* Unchanged */;
  }
}
let View = class extends Disposable {
  constructor(_element, _model, _width, _height, _models, _languageService) {
    super();
    this._element = _element;
    this._model = _model;
    this._width = _width;
    this._height = _height;
    this._models = _models;
    this._languageService = _languageService;
    this.domNode = this._element;
    this.domNode.className = "monaco-component diff-review monaco-editor-background";
    const actionBarContainer = document.createElement("div");
    actionBarContainer.className = "diff-review-actions";
    this._actionBar = this._register(new ActionBar(
      actionBarContainer
    ));
    this._register(autorun((reader) => {
      this._actionBar.clear();
      if (this._model.canClose.read(reader)) {
        this._actionBar.push(toAction({
          id: "diffreview.close",
          label: localize("label.close", "Close"),
          class: "close-diff-review " + ThemeIcon.asClassName(accessibleDiffViewerCloseIcon),
          enabled: true,
          run: async () => _model.close()
        }), { label: false, icon: true });
      }
    }));
    this._content = document.createElement("div");
    this._content.className = "diff-review-content";
    this._content.setAttribute("role", "code");
    this._scrollbar = this._register(new DomScrollableElement(this._content, {}));
    reset(this.domNode, this._scrollbar.getDomNode(), actionBarContainer);
    this._register(autorun((r) => {
      this._height.read(r);
      this._width.read(r);
      this._scrollbar.scanDomNode();
    }));
    this._register(toDisposable(() => {
      reset(this.domNode);
    }));
    this._register(applyStyle(this.domNode, { width: this._width, height: this._height }));
    this._register(applyStyle(this._content, { width: this._width, height: this._height }));
    this._register(autorunWithStore((reader, store) => {
      this._model.currentGroup.read(reader);
      this._render(store);
    }));
    this._register(addStandardDisposableListener(this.domNode, "keydown", (e) => {
      if (e.equals(KeyCode.DownArrow) || e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow) || e.equals(KeyMod.Alt | KeyCode.DownArrow)) {
        e.preventDefault();
        this._model.goToNextLine();
      }
      if (e.equals(KeyCode.UpArrow) || e.equals(KeyMod.CtrlCmd | KeyCode.UpArrow) || e.equals(KeyMod.Alt | KeyCode.UpArrow)) {
        e.preventDefault();
        this._model.goToPreviousLine();
      }
      if (e.equals(KeyCode.Escape) || e.equals(KeyMod.CtrlCmd | KeyCode.Escape) || e.equals(KeyMod.Alt | KeyCode.Escape) || e.equals(KeyMod.Shift | KeyCode.Escape)) {
        e.preventDefault();
        this._model.close();
      }
      if (e.equals(KeyCode.Space) || e.equals(KeyCode.Enter)) {
        e.preventDefault();
        this._model.revealCurrentElementInEditor();
      }
    }));
  }
  _render(store) {
    const originalOptions = this._models.getOriginalOptions();
    const modifiedOptions = this._models.getModifiedOptions();
    const container = document.createElement("div");
    container.className = "diff-review-table";
    container.setAttribute("role", "list");
    container.setAttribute("aria-label", localize("ariaLabel", "Accessible Diff Viewer. Use arrow up and down to navigate."));
    applyFontInfo(container, modifiedOptions.get(EditorOption.fontInfo));
    reset(this._content, container);
    const originalModel = this._models.getOriginalModel();
    const modifiedModel = this._models.getModifiedModel();
    if (!originalModel || !modifiedModel) {
      return;
    }
    const originalModelOpts = originalModel.getOptions();
    const modifiedModelOpts = modifiedModel.getOptions();
    const lineHeight = modifiedOptions.get(EditorOption.lineHeight);
    const group = this._model.currentGroup.get();
    for (const viewItem of group?.lines || []) {
      if (!group) {
        break;
      }
      let row;
      if (viewItem.type === 0 /* Header */) {
        const header = document.createElement("div");
        header.className = "diff-review-row";
        header.setAttribute("role", "listitem");
        const r = group.range;
        const diffIndex = this._model.currentGroupIndex.get();
        const diffsLength = this._model.groups.get().length;
        const getAriaLines = (lines) => lines === 0 ? localize("no_lines_changed", "no lines changed") : lines === 1 ? localize("one_line_changed", "1 line changed") : localize("more_lines_changed", "{0} lines changed", lines);
        const originalChangedLinesCntAria = getAriaLines(r.original.length);
        const modifiedChangedLinesCntAria = getAriaLines(r.modified.length);
        header.setAttribute("aria-label", localize(
          {
            key: "header",
            comment: [
              "This is the ARIA label for a git diff header.",
              "A git diff header looks like this: @@ -154,12 +159,39 @@.",
              "That encodes that at original line 154 (which is now line 159), 12 lines were removed/changed with 39 lines.",
              "Variables 0 and 1 refer to the diff index out of total number of diffs.",
              "Variables 2 and 4 will be numbers (a line number).",
              'Variables 3 and 5 will be "no lines changed", "1 line changed" or "X lines changed", localized separately.'
            ]
          },
          "Difference {0} of {1}: original line {2}, {3}, modified line {4}, {5}",
          diffIndex + 1,
          diffsLength,
          r.original.startLineNumber,
          originalChangedLinesCntAria,
          r.modified.startLineNumber,
          modifiedChangedLinesCntAria
        ));
        const cell = document.createElement("div");
        cell.className = "diff-review-cell diff-review-summary";
        cell.appendChild(document.createTextNode(`${diffIndex + 1}/${diffsLength}: @@ -${r.original.startLineNumber},${r.original.length} +${r.modified.startLineNumber},${r.modified.length} @@`));
        header.appendChild(cell);
        row = header;
      } else {
        row = this._createRow(
          viewItem,
          lineHeight,
          this._width.get(),
          originalOptions,
          originalModel,
          originalModelOpts,
          modifiedOptions,
          modifiedModel,
          modifiedModelOpts
        );
      }
      container.appendChild(row);
      const isSelectedObs = derived((reader) => (
        /** @description isSelected */
        this._model.currentElement.read(reader) === viewItem
      ));
      store.add(autorun((reader) => {
        const isSelected = isSelectedObs.read(reader);
        row.tabIndex = isSelected ? 0 : -1;
        if (isSelected) {
          row.focus();
        }
      }));
      store.add(addDisposableListener(row, "focus", () => {
        this._model.goToLine(viewItem);
      }));
    }
    this._scrollbar.scanDomNode();
  }
  _createRow(item, lineHeight, width, originalOptions, originalModel, originalModelOpts, modifiedOptions, modifiedModel, modifiedModelOpts) {
    const originalLayoutInfo = originalOptions.get(EditorOption.layoutInfo);
    const originalLineNumbersWidth = originalLayoutInfo.glyphMarginWidth + originalLayoutInfo.lineNumbersWidth;
    const modifiedLayoutInfo = modifiedOptions.get(EditorOption.layoutInfo);
    const modifiedLineNumbersWidth = 10 + modifiedLayoutInfo.glyphMarginWidth + modifiedLayoutInfo.lineNumbersWidth;
    let rowClassName = "diff-review-row";
    let lineNumbersExtraClassName = "";
    const spacerClassName = "diff-review-spacer";
    let spacerIcon = null;
    switch (item.type) {
      case 3 /* Added */:
        rowClassName = "diff-review-row line-insert";
        lineNumbersExtraClassName = " char-insert";
        spacerIcon = accessibleDiffViewerInsertIcon;
        break;
      case 2 /* Deleted */:
        rowClassName = "diff-review-row line-delete";
        lineNumbersExtraClassName = " char-delete";
        spacerIcon = accessibleDiffViewerRemoveIcon;
        break;
    }
    const row = document.createElement("div");
    row.style.minWidth = width + "px";
    row.className = rowClassName;
    row.setAttribute("role", "listitem");
    row.ariaLevel = "";
    const cell = document.createElement("div");
    cell.className = "diff-review-cell";
    cell.style.height = `${lineHeight}px`;
    row.appendChild(cell);
    const originalLineNumber = document.createElement("span");
    originalLineNumber.style.width = originalLineNumbersWidth + "px";
    originalLineNumber.style.minWidth = originalLineNumbersWidth + "px";
    originalLineNumber.className = "diff-review-line-number" + lineNumbersExtraClassName;
    if (item.originalLineNumber !== void 0) {
      originalLineNumber.appendChild(document.createTextNode(String(item.originalLineNumber)));
    } else {
      originalLineNumber.innerText = "\xA0";
    }
    cell.appendChild(originalLineNumber);
    const modifiedLineNumber = document.createElement("span");
    modifiedLineNumber.style.width = modifiedLineNumbersWidth + "px";
    modifiedLineNumber.style.minWidth = modifiedLineNumbersWidth + "px";
    modifiedLineNumber.style.paddingRight = "10px";
    modifiedLineNumber.className = "diff-review-line-number" + lineNumbersExtraClassName;
    if (item.modifiedLineNumber !== void 0) {
      modifiedLineNumber.appendChild(document.createTextNode(String(item.modifiedLineNumber)));
    } else {
      modifiedLineNumber.innerText = "\xA0";
    }
    cell.appendChild(modifiedLineNumber);
    const spacer = document.createElement("span");
    spacer.className = spacerClassName;
    if (spacerIcon) {
      const spacerCodicon = document.createElement("span");
      spacerCodicon.className = ThemeIcon.asClassName(spacerIcon);
      spacerCodicon.innerText = "\xA0\xA0";
      spacer.appendChild(spacerCodicon);
    } else {
      spacer.innerText = "\xA0\xA0";
    }
    cell.appendChild(spacer);
    let lineContent;
    if (item.modifiedLineNumber !== void 0) {
      let html = this._getLineHtml(modifiedModel, modifiedOptions, modifiedModelOpts.tabSize, item.modifiedLineNumber, this._languageService.languageIdCodec);
      if (AccessibleDiffViewer._ttPolicy) {
        html = AccessibleDiffViewer._ttPolicy.createHTML(html);
      }
      cell.insertAdjacentHTML("beforeend", html);
      lineContent = modifiedModel.getLineContent(item.modifiedLineNumber);
    } else {
      let html = this._getLineHtml(originalModel, originalOptions, originalModelOpts.tabSize, item.originalLineNumber, this._languageService.languageIdCodec);
      if (AccessibleDiffViewer._ttPolicy) {
        html = AccessibleDiffViewer._ttPolicy.createHTML(html);
      }
      cell.insertAdjacentHTML("beforeend", html);
      lineContent = originalModel.getLineContent(item.originalLineNumber);
    }
    if (lineContent.length === 0) {
      lineContent = localize("blankLine", "blank");
    }
    let ariaLabel = "";
    switch (item.type) {
      case 1 /* Unchanged */:
        if (item.originalLineNumber === item.modifiedLineNumber) {
          ariaLabel = localize({ key: "unchangedLine", comment: ["The placeholders are contents of the line and should not be translated."] }, "{0} unchanged line {1}", lineContent, item.originalLineNumber);
        } else {
          ariaLabel = localize("equalLine", "{0} original line {1} modified line {2}", lineContent, item.originalLineNumber, item.modifiedLineNumber);
        }
        break;
      case 3 /* Added */:
        ariaLabel = localize("insertLine", "+ {0} modified line {1}", lineContent, item.modifiedLineNumber);
        break;
      case 2 /* Deleted */:
        ariaLabel = localize("deleteLine", "- {0} original line {1}", lineContent, item.originalLineNumber);
        break;
    }
    row.setAttribute("aria-label", ariaLabel);
    return row;
  }
  _getLineHtml(model, options, tabSize, lineNumber, languageIdCodec) {
    const lineContent = model.getLineContent(lineNumber);
    const fontInfo = options.get(EditorOption.fontInfo);
    const verticalScrollbarSize = options.get(EditorOption.scrollbar).verticalScrollbarSize;
    const lineTokens = LineTokens.createEmpty(lineContent, languageIdCodec);
    const isBasicASCII = ViewLineRenderingData.isBasicASCII(lineContent, model.mightContainNonBasicASCII());
    const containsRTL = ViewLineRenderingData.containsRTL(lineContent, isBasicASCII, model.mightContainRTL());
    const r = renderViewLine2(new RenderLineInput(
      fontInfo.isMonospace && !options.get(EditorOption.disableMonospaceOptimizations),
      fontInfo.canUseHalfwidthRightwardsArrow,
      lineContent,
      false,
      isBasicASCII,
      containsRTL,
      0,
      lineTokens,
      [],
      tabSize,
      0,
      fontInfo.spaceWidth,
      fontInfo.middotWidth,
      fontInfo.wsmiddotWidth,
      options.get(EditorOption.stopRenderingLineAfter),
      options.get(EditorOption.renderWhitespace),
      options.get(EditorOption.renderControlCharacters),
      options.get(EditorOption.fontLigatures) !== EditorFontLigatures.OFF,
      null,
      null,
      verticalScrollbarSize
    ));
    return r.html;
  }
};
View = __decorateClass([
  __decorateParam(5, ILanguageService)
], View);
class AccessibleDiffViewerModelFromEditors {
  constructor(editors) {
    this.editors = editors;
  }
  getOriginalModel() {
    return this.editors.original.getModel();
  }
  getOriginalOptions() {
    return this.editors.original.getOptions();
  }
  originalReveal(range) {
    this.editors.original.revealRange(range);
    this.editors.original.setSelection(range);
    this.editors.original.focus();
  }
  getModifiedModel() {
    return this.editors.modified.getModel();
  }
  getModifiedOptions() {
    return this.editors.modified.getOptions();
  }
  modifiedReveal(range) {
    if (range) {
      this.editors.modified.revealRange(range);
      this.editors.modified.setSelection(range);
    }
    this.editors.modified.focus();
  }
  modifiedSetSelection(range) {
    this.editors.modified.setSelection(range);
  }
  modifiedFocus() {
    this.editors.modified.focus();
  }
  getModifiedPosition() {
    return this.editors.modified.getPosition() ?? void 0;
  }
}
export {
  AccessibleDiffViewer,
  AccessibleDiffViewerModelFromEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcY29tcG9uZW50c1xcYWNjZXNzaWJsZURpZmZWaWV3ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RydXN0ZWRUeXBlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgZm9yRWFjaEFkamFjZW50LCBncm91cEFkamFjZW50QnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQsIG9ic2VydmFibGVWYWx1ZSwgc3VidHJhbnNhY3Rpb24sIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXBwbHlGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZy9kb21Gb250SW5mby5qcyc7XG5pbXBvcnQgeyBhcHBseVN0eWxlIH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRm9udExpZ2F0dXJlcywgRWRpdG9yT3B0aW9uLCBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZywgTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VJZENvZGVjIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBSZW5kZXJMaW5lSW5wdXQsIHJlbmRlclZpZXdMaW5lMiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgVmlld0xpbmVSZW5kZXJpbmdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAnLi9hY2Nlc3NpYmxlRGlmZlZpZXdlci5jc3MnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5cbmNvbnN0IGFjY2Vzc2libGVEaWZmVmlld2VySW5zZXJ0SWNvbiA9IHJlZ2lzdGVySWNvbignZGlmZi1yZXZpZXctaW5zZXJ0JywgQ29kaWNvbi5hZGQsIGxvY2FsaXplKCdhY2Nlc3NpYmxlRGlmZlZpZXdlckluc2VydEljb24nLCAnSWNvbiBmb3IgXFwnSW5zZXJ0XFwnIGluIGFjY2Vzc2libGUgZGlmZiB2aWV3ZXIuJykpO1xuY29uc3QgYWNjZXNzaWJsZURpZmZWaWV3ZXJSZW1vdmVJY29uID0gcmVnaXN0ZXJJY29uKCdkaWZmLXJldmlldy1yZW1vdmUnLCBDb2RpY29uLnJlbW92ZSwgbG9jYWxpemUoJ2FjY2Vzc2libGVEaWZmVmlld2VyUmVtb3ZlSWNvbicsICdJY29uIGZvciBcXCdSZW1vdmVcXCcgaW4gYWNjZXNzaWJsZSBkaWZmIHZpZXdlci4nKSk7XG5jb25zdCBhY2Nlc3NpYmxlRGlmZlZpZXdlckNsb3NlSWNvbiA9IHJlZ2lzdGVySWNvbignZGlmZi1yZXZpZXctY2xvc2UnLCBDb2RpY29uLmNsb3NlLCBsb2NhbGl6ZSgnYWNjZXNzaWJsZURpZmZWaWV3ZXJDbG9zZUljb24nLCAnSWNvbiBmb3IgXFwnQ2xvc2VcXCcgaW4gYWNjZXNzaWJsZSBkaWZmIHZpZXdlci4nKSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjY2Vzc2libGVEaWZmVmlld2VyTW9kZWwge1xuXHRnZXRPcmlnaW5hbE1vZGVsKCk6IElUZXh0TW9kZWw7XG5cdGdldE9yaWdpbmFsT3B0aW9ucygpOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBTaG91bGQgZG86IGBzZXRTZWxlY3Rpb25gLCBgcmV2ZWFsTGluZWAgYW5kIGBmb2N1c2Bcblx0ICovXG5cdG9yaWdpbmFsUmV2ZWFsKHJhbmdlOiBSYW5nZSk6IHZvaWQ7XG5cblx0Z2V0TW9kaWZpZWRNb2RlbCgpOiBJVGV4dE1vZGVsO1xuXHRnZXRNb2RpZmllZE9wdGlvbnMoKTogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucztcblx0LyoqXG5cdCAqIFNob3VsZCBkbzogYHNldFNlbGVjdGlvbmAsIGByZXZlYWxMaW5lYCBhbmQgYGZvY3VzYFxuXHQgKi9cblx0bW9kaWZpZWRSZXZlYWwocmFuZ2U/OiBSYW5nZSk6IHZvaWQ7XG5cdG1vZGlmaWVkU2V0U2VsZWN0aW9uKHJhbmdlOiBSYW5nZSk6IHZvaWQ7XG5cdG1vZGlmaWVkRm9jdXMoKTogdm9pZDtcblxuXHRnZXRNb2RpZmllZFBvc2l0aW9uKCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJsZURpZmZWaWV3ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHN0YXRpYyBfdHRQb2xpY3kgPSBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3koJ2RpZmZSZXZpZXcnLCB7IGNyZWF0ZUhUTUw6IHZhbHVlID0+IHZhbHVlIH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudE5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NldFZpc2libGU6ICh2aXNpYmxlOiBib29sZWFuLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbkNsb3NlOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aWR0aDogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oZWlnaHQ6IElPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZnM6IElPYnNlcnZhYmxlPERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHM6IElBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMuX3Zpc2libGUucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX3BhcmVudE5vZGUuc3R5bGUudmlzaWJpbGl0eSA9IHZpc2libGUgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHJlYWRlci5zdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlld01vZGVsLCB0aGlzLl9kaWZmcywgdGhpcy5fbW9kZWxzLCB0aGlzLl9zZXRWaXNpYmxlLCB0aGlzLl9jYW5DbG9zZSkpO1xuXHRcdGNvbnN0IHZpZXcgPSByZWFkZXIuc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXcsIHRoaXMuX3BhcmVudE5vZGUsIG1vZGVsLCB0aGlzLl93aWR0aCwgdGhpcy5faGVpZ2h0LCB0aGlzLl9tb2RlbHMpKTtcblx0XHRyZXR1cm4geyBtb2RlbCwgdmlldywgfTtcblx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3QgaXNWaXNpYmxlID0gdGhpcy5fdmlzaWJsZS5nZXQoKTtcblx0XHRcdHRoaXMuX3NldFZpc2libGUodHJ1ZSwgdHgpO1xuXHRcdFx0aWYgKGlzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5nZXQoKSEubW9kZWwubmV4dEdyb3VwKHR4KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByZXYoKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZSh0cnVlLCB0eCk7XG5cdFx0XHR0aGlzLl9zdGF0ZS5nZXQoKSEubW9kZWwucHJldmlvdXNHcm91cCh0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlLCB0eCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwcyA9IG9ic2VydmFibGVWYWx1ZTxWaWV3RWxlbWVudEdyb3VwW10+KHRoaXMsIFtdKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudEdyb3VwSWR4ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50RWxlbWVudElkeCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZ3JvdXBzOiBJT2JzZXJ2YWJsZTxWaWV3RWxlbWVudEdyb3VwW10+ID0gdGhpcy5fZ3JvdXBzO1xuXHRwdWJsaWMgcmVhZG9ubHkgY3VycmVudEdyb3VwOiBJT2JzZXJ2YWJsZTxWaWV3RWxlbWVudEdyb3VwIHwgdW5kZWZpbmVkPlxuXHRcdD0gdGhpcy5fY3VycmVudEdyb3VwSWR4Lm1hcCgoaWR4LCByKSA9PiB0aGlzLl9ncm91cHMucmVhZChyKVtpZHhdKTtcblx0cHVibGljIHJlYWRvbmx5IGN1cnJlbnRHcm91cEluZGV4OiBJT2JzZXJ2YWJsZTxudW1iZXI+ID0gdGhpcy5fY3VycmVudEdyb3VwSWR4O1xuXG5cdHB1YmxpYyByZWFkb25seSBjdXJyZW50RWxlbWVudDogSU9ic2VydmFibGU8Vmlld0VsZW1lbnQgfCB1bmRlZmluZWQ+XG5cdFx0PSB0aGlzLl9jdXJyZW50RWxlbWVudElkeC5tYXAoKGlkeCwgcikgPT4gdGhpcy5jdXJyZW50R3JvdXAucmVhZChyKT8ubGluZXNbaWR4XSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZnM6IElPYnNlcnZhYmxlPERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHM6IElBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NldFZpc2libGU6ICh2aXNpYmxlOiBib29sZWFuLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB2b2lkLFxuXHRcdHB1YmxpYyByZWFkb25seSBjYW5DbG9zZTogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgZ3JvdXBzICovXG5cdFx0XHRjb25zdCBkaWZmcyA9IHRoaXMuX2RpZmZzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGlmZnMpIHtcblx0XHRcdFx0dGhpcy5fZ3JvdXBzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cHMgPSBjb21wdXRlVmlld0VsZW1lbnRHcm91cHMoXG5cdFx0XHRcdGRpZmZzLFxuXHRcdFx0XHR0aGlzLl9tb2RlbHMuZ2V0T3JpZ2luYWxNb2RlbCgpLmdldExpbmVDb3VudCgpLFxuXHRcdFx0XHR0aGlzLl9tb2RlbHMuZ2V0TW9kaWZpZWRNb2RlbCgpLmdldExpbmVDb3VudCgpXG5cdFx0XHQpO1xuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdGNvbnN0IHAgPSB0aGlzLl9tb2RlbHMuZ2V0TW9kaWZpZWRQb3NpdGlvbigpO1xuXHRcdFx0XHRpZiAocCkge1xuXHRcdFx0XHRcdGNvbnN0IG5leHRHcm91cCA9IGdyb3Vwcy5maW5kSW5kZXgoZyA9PiBwPy5saW5lTnVtYmVyIDwgZy5yYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKTtcblx0XHRcdFx0XHRpZiAobmV4dEdyb3VwICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3VycmVudEdyb3VwSWR4LnNldChuZXh0R3JvdXAsIHR4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZ3JvdXBzLnNldChncm91cHMsIHR4KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gcGxheSBhdWRpby1jdWUgZm9yIGRpZmYgKi9cblx0XHRcdGNvbnN0IGN1cnJlbnRWaWV3SXRlbSA9IHRoaXMuY3VycmVudEVsZW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRWaWV3SXRlbT8udHlwZSA9PT0gTGluZVR5cGUuRGVsZXRlZCkge1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVEZWxldGVkLCB7IHNvdXJjZTogJ2FjY2Vzc2libGVEaWZmVmlld2VyLmN1cnJlbnRFbGVtZW50Q2hhbmdlZCcgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRWaWV3SXRlbT8udHlwZSA9PT0gTGluZVR5cGUuQWRkZWQpIHtcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQsIHsgc291cmNlOiAnYWNjZXNzaWJsZURpZmZWaWV3ZXIuY3VycmVudEVsZW1lbnRDaGFuZ2VkJyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHNlbGVjdCBsaW5lcyBpbiBlZGl0b3IgKi9cblx0XHRcdC8vIFRoaXMgZW5zdXJlcyBlZGl0b3IgY29tbWFuZHMgKGxpa2UgcmV2ZXJ0L3N0YWdlKSB3b3JrXG5cdFx0XHRjb25zdCBjdXJyZW50Vmlld0l0ZW0gPSB0aGlzLmN1cnJlbnRFbGVtZW50LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjdXJyZW50Vmlld0l0ZW0gJiYgY3VycmVudFZpZXdJdGVtLnR5cGUgIT09IExpbmVUeXBlLkhlYWRlcikge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gY3VycmVudFZpZXdJdGVtLm1vZGlmaWVkTGluZU51bWJlciA/PyBjdXJyZW50Vmlld0l0ZW0uZGlmZi5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdHRoaXMuX21vZGVscy5tb2RpZmllZFNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2dvVG9Hcm91cERlbHRhKGRlbHRhOiBudW1iZXIsIHR4PzogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5ncm91cHMuZ2V0KCk7XG5cdFx0aWYgKCFncm91cHMgfHwgZ3JvdXBzLmxlbmd0aCA8PSAxKSB7IHJldHVybjsgfVxuXHRcdHN1YnRyYW5zYWN0aW9uKHR4LCB0eCA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50R3JvdXBJZHguc2V0KE9mZnNldFJhbmdlLm9mTGVuZ3RoKGdyb3Vwcy5sZW5ndGgpLmNsaXBDeWNsaWModGhpcy5fY3VycmVudEdyb3VwSWR4LmdldCgpICsgZGVsdGEpLCB0eCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RWxlbWVudElkeC5zZXQoMCwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0bmV4dEdyb3VwKHR4PzogSVRyYW5zYWN0aW9uKTogdm9pZCB7IHRoaXMuX2dvVG9Hcm91cERlbHRhKDEsIHR4KTsgfVxuXHRwcmV2aW91c0dyb3VwKHR4PzogSVRyYW5zYWN0aW9uKTogdm9pZCB7IHRoaXMuX2dvVG9Hcm91cERlbHRhKC0xLCB0eCk7IH1cblxuXHRwcml2YXRlIF9nb1RvTGluZURlbHRhKGRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuY3VycmVudEdyb3VwLmdldCgpO1xuXHRcdGlmICghZ3JvdXAgfHwgZ3JvdXAubGluZXMubGVuZ3RoIDw9IDEpIHsgcmV0dXJuOyB9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudEVsZW1lbnRJZHguc2V0KE9mZnNldFJhbmdlLm9mTGVuZ3RoKGdyb3VwLmxpbmVzLmxlbmd0aCkuY2xpcCh0aGlzLl9jdXJyZW50RWxlbWVudElkeC5nZXQoKSArIGRlbHRhKSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z29Ub05leHRMaW5lKCk6IHZvaWQgeyB0aGlzLl9nb1RvTGluZURlbHRhKDEpOyB9XG5cdGdvVG9QcmV2aW91c0xpbmUoKTogdm9pZCB7IHRoaXMuX2dvVG9MaW5lRGVsdGEoLTEpOyB9XG5cblx0Z29Ub0xpbmUobGluZTogVmlld0VsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuY3VycmVudEdyb3VwLmdldCgpO1xuXHRcdGlmICghZ3JvdXApIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3QgaWR4ID0gZ3JvdXAubGluZXMuaW5kZXhPZihsaW5lKTtcblx0XHRpZiAoaWR4ID09PSAtMSkgeyByZXR1cm47IH1cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50RWxlbWVudElkeC5zZXQoaWR4LCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZXZlYWxDdXJyZW50RWxlbWVudEluRWRpdG9yKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jYW5DbG9zZS5nZXQoKSkgeyByZXR1cm47IH1cblx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgY3VyRWxlbSA9IHRoaXMuY3VycmVudEVsZW1lbnQuZ2V0KCk7XG5cdFx0aWYgKGN1ckVsZW0pIHtcblx0XHRcdGlmIChjdXJFbGVtLnR5cGUgPT09IExpbmVUeXBlLkRlbGV0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxzLm9yaWdpbmFsUmV2ZWFsKFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKGN1ckVsZW0ub3JpZ2luYWxMaW5lTnVtYmVyLCAxKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxzLm1vZGlmaWVkUmV2ZWFsKFxuXHRcdFx0XHRcdGN1ckVsZW0udHlwZSAhPT0gTGluZVR5cGUuSGVhZGVyXG5cdFx0XHRcdFx0XHQ/IFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKGN1ckVsZW0ubW9kaWZpZWRMaW5lTnVtYmVyLCAxKSlcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhbkNsb3NlLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kZWxzLm1vZGlmaWVkRm9jdXMoKTtcblx0fVxufVxuXG5cbmNvbnN0IHZpZXdFbGVtZW50R3JvdXBMaW5lTWFyZ2luID0gMztcblxuZnVuY3Rpb24gY29tcHV0ZVZpZXdFbGVtZW50R3JvdXBzKGRpZmZzOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSwgb3JpZ2luYWxMaW5lQ291bnQ6IG51bWJlciwgbW9kaWZpZWRMaW5lQ291bnQ6IG51bWJlcik6IFZpZXdFbGVtZW50R3JvdXBbXSB7XG5cdGNvbnN0IHJlc3VsdDogVmlld0VsZW1lbnRHcm91cFtdID0gW107XG5cblx0Zm9yIChjb25zdCBnIG9mIGdyb3VwQWRqYWNlbnRCeShkaWZmcywgKGEsIGIpID0+IChiLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIGEubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA8IDIgKiB2aWV3RWxlbWVudEdyb3VwTGluZU1hcmdpbikpKSB7XG5cdFx0Y29uc3Qgdmlld0VsZW1lbnRzOiBWaWV3RWxlbWVudFtdID0gW107XG5cdFx0dmlld0VsZW1lbnRzLnB1c2gobmV3IEhlYWRlclZpZXdFbGVtZW50KCkpO1xuXG5cdFx0Y29uc3Qgb3JpZ0Z1bGxSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoXG5cdFx0XHRNYXRoLm1heCgxLCBnWzBdLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIHZpZXdFbGVtZW50R3JvdXBMaW5lTWFyZ2luKSxcblx0XHRcdE1hdGgubWluKGdbZy5sZW5ndGggLSAxXS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlICsgdmlld0VsZW1lbnRHcm91cExpbmVNYXJnaW4sIG9yaWdpbmFsTGluZUNvdW50ICsgMSlcblx0XHQpO1xuXHRcdGNvbnN0IG1vZGlmaWVkRnVsbFJhbmdlID0gbmV3IExpbmVSYW5nZShcblx0XHRcdE1hdGgubWF4KDEsIGdbMF0ubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIC0gdmlld0VsZW1lbnRHcm91cExpbmVNYXJnaW4pLFxuXHRcdFx0TWF0aC5taW4oZ1tnLmxlbmd0aCAtIDFdLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgKyB2aWV3RWxlbWVudEdyb3VwTGluZU1hcmdpbiwgbW9kaWZpZWRMaW5lQ291bnQgKyAxKVxuXHRcdCk7XG5cblx0XHRmb3JFYWNoQWRqYWNlbnQoZywgKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IG9yaWdSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYSA/IGEub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA6IG9yaWdGdWxsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBiID8gYi5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgOiBvcmlnRnVsbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYSA/IGEubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA6IG1vZGlmaWVkRnVsbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgYiA/IGIubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIDogbW9kaWZpZWRGdWxsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSk7XG5cblx0XHRcdG9yaWdSYW5nZS5mb3JFYWNoKG9yaWdMaW5lTnVtYmVyID0+IHtcblx0XHRcdFx0dmlld0VsZW1lbnRzLnB1c2gobmV3IFVuY2hhbmdlZExpbmVWaWV3RWxlbWVudChvcmlnTGluZU51bWJlciwgbW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIgKyAob3JpZ0xpbmVOdW1iZXIgLSBvcmlnUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChiKSB7XG5cdFx0XHRcdGIub3JpZ2luYWwuZm9yRWFjaChvcmlnTGluZU51bWJlciA9PiB7XG5cdFx0XHRcdFx0dmlld0VsZW1lbnRzLnB1c2gobmV3IERlbGV0ZWRMaW5lVmlld0VsZW1lbnQoYiwgb3JpZ0xpbmVOdW1iZXIpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGIubW9kaWZpZWQuZm9yRWFjaChtb2RpZmllZExpbmVOdW1iZXIgPT4ge1xuXHRcdFx0XHRcdHZpZXdFbGVtZW50cy5wdXNoKG5ldyBBZGRlZExpbmVWaWV3RWxlbWVudChiLCBtb2RpZmllZExpbmVOdW1iZXIpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb2RpZmllZFJhbmdlID0gZ1swXS5tb2RpZmllZC5qb2luKGdbZy5sZW5ndGggLSAxXS5tb2RpZmllZCk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5nZSA9IGdbMF0ub3JpZ2luYWwuam9pbihnW2cubGVuZ3RoIC0gMV0ub3JpZ2luYWwpO1xuXG5cdFx0cmVzdWx0LnB1c2gobmV3IFZpZXdFbGVtZW50R3JvdXAobmV3IExpbmVSYW5nZU1hcHBpbmcobW9kaWZpZWRSYW5nZSwgb3JpZ2luYWxSYW5nZSksIHZpZXdFbGVtZW50cykpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmVudW0gTGluZVR5cGUge1xuXHRIZWFkZXIsXG5cdFVuY2hhbmdlZCxcblx0RGVsZXRlZCxcblx0QWRkZWQsXG59XG5cbmNsYXNzIFZpZXdFbGVtZW50R3JvdXAge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IExpbmVSYW5nZU1hcHBpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVzOiByZWFkb25seSBWaWV3RWxlbWVudFtdLFxuXHQpIHsgfVxufVxuXG50eXBlIFZpZXdFbGVtZW50ID0gSGVhZGVyVmlld0VsZW1lbnQgfCBVbmNoYW5nZWRMaW5lVmlld0VsZW1lbnQgfCBEZWxldGVkTGluZVZpZXdFbGVtZW50IHwgQWRkZWRMaW5lVmlld0VsZW1lbnQ7XG5cbmNsYXNzIEhlYWRlclZpZXdFbGVtZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBMaW5lVHlwZS5IZWFkZXI7XG59XG5cbmNsYXNzIERlbGV0ZWRMaW5lVmlld0VsZW1lbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IExpbmVUeXBlLkRlbGV0ZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkTGluZU51bWJlciA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbExpbmVOdW1iZXI6IG51bWJlcixcblx0KSB7XG5cdH1cbn1cblxuY2xhc3MgQWRkZWRMaW5lVmlld0VsZW1lbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IExpbmVUeXBlLkFkZGVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbExpbmVOdW1iZXIgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kaWZpZWRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdCkge1xuXHR9XG59XG5cbmNsYXNzIFVuY2hhbmdlZExpbmVWaWV3RWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gTGluZVR5cGUuVW5jaGFuZ2VkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkTGluZU51bWJlcjogbnVtYmVyLFxuXHQpIHtcblx0fVxufVxuXG5jbGFzcyBWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGJhcjogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbkJhcjogQWN0aW9uQmFyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2lkdGg6IElPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGVpZ2h0OiBJT2JzZXJ2YWJsZTxudW1iZXI+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsczogSUFjY2Vzc2libGVEaWZmVmlld2VyTW9kZWwsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5fZWxlbWVudDtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NOYW1lID0gJ21vbmFjby1jb21wb25lbnQgZGlmZi1yZXZpZXcgbW9uYWNvLWVkaXRvci1iYWNrZ3JvdW5kJztcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGFjdGlvbkJhckNvbnRhaW5lci5jbGFzc05hbWUgPSAnZGlmZi1yZXZpZXctYWN0aW9ucyc7XG5cdFx0dGhpcy5fYWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihcblx0XHRcdGFjdGlvbkJhckNvbnRhaW5lclxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIGFjdGlvbnMgKi9cblx0XHRcdHRoaXMuX2FjdGlvbkJhci5jbGVhcigpO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsLmNhbkNsb3NlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25CYXIucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICdkaWZmcmV2aWV3LmNsb3NlJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xhYmVsLmNsb3NlJywgXCJDbG9zZVwiKSxcblx0XHRcdFx0XHRjbGFzczogJ2Nsb3NlLWRpZmYtcmV2aWV3ICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoYWNjZXNzaWJsZURpZmZWaWV3ZXJDbG9zZUljb24pLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiBfbW9kZWwuY2xvc2UoKVxuXHRcdFx0XHR9KSwgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2NvbnRlbnQuY2xhc3NOYW1lID0gJ2RpZmYtcmV2aWV3LWNvbnRlbnQnO1xuXHRcdHRoaXMuX2NvbnRlbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2NvZGUnKTtcblx0XHR0aGlzLl9zY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fY29udGVudCwge30pKTtcblx0XHRyZXNldCh0aGlzLmRvbU5vZGUsIHRoaXMuX3Njcm9sbGJhci5nZXREb21Ob2RlKCksIGFjdGlvbkJhckNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0dGhpcy5faGVpZ2h0LnJlYWQocik7XG5cdFx0XHR0aGlzLl93aWR0aC5yZWFkKHIpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHsgcmVzZXQodGhpcy5kb21Ob2RlKTsgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlTdHlsZSh0aGlzLmRvbU5vZGUsIHsgd2lkdGg6IHRoaXMuX3dpZHRoLCBoZWlnaHQ6IHRoaXMuX2hlaWdodCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlTdHlsZSh0aGlzLl9jb250ZW50LCB7IHdpZHRoOiB0aGlzLl93aWR0aCwgaGVpZ2h0OiB0aGlzLl9oZWlnaHQgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiByZW5kZXIgKi9cblx0XHRcdHRoaXMuX21vZGVsLmN1cnJlbnRHcm91cC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9yZW5kZXIoc3RvcmUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRPRE9AaGVkaWV0IHVzZSBjb21tYW5kc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdylcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdylcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93KVxuXHRcdFx0KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5fbW9kZWwuZ29Ub05leHRMaW5lKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChcblx0XHRcdFx0ZS5lcXVhbHMoS2V5Q29kZS5VcEFycm93KVxuXHRcdFx0XHR8fCBlLmVxdWFscyhLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdylcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdylcblx0XHRcdCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX21vZGVsLmdvVG9QcmV2aW91c0xpbmUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSlcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVzY2FwZSlcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5TW9kLkFsdCB8IEtleUNvZGUuRXNjYXBlKVxuXHRcdFx0XHR8fCBlLmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZSlcblx0XHRcdCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX21vZGVsLmNsb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChcblx0XHRcdFx0ZS5lcXVhbHMoS2V5Q29kZS5TcGFjZSlcblx0XHRcdFx0fHwgZS5lcXVhbHMoS2V5Q29kZS5FbnRlcilcblx0XHRcdCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX21vZGVsLnJldmVhbEN1cnJlbnRFbGVtZW50SW5FZGl0b3IoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGNvbnN0IG9yaWdpbmFsT3B0aW9ucyA9IHRoaXMuX21vZGVscy5nZXRPcmlnaW5hbE9wdGlvbnMoKTtcblx0XHRjb25zdCBtb2RpZmllZE9wdGlvbnMgPSB0aGlzLl9tb2RlbHMuZ2V0TW9kaWZpZWRPcHRpb25zKCk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuY2xhc3NOYW1lID0gJ2RpZmYtcmV2aWV3LXRhYmxlJztcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3QnKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2FyaWFMYWJlbCcsICdBY2Nlc3NpYmxlIERpZmYgVmlld2VyLiBVc2UgYXJyb3cgdXAgYW5kIGRvd24gdG8gbmF2aWdhdGUuJykpO1xuXHRcdGFwcGx5Rm9udEluZm8oY29udGFpbmVyLCBtb2RpZmllZE9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykpO1xuXG5cdFx0cmVzZXQodGhpcy5fY29udGVudCwgY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLl9tb2RlbHMuZ2V0T3JpZ2luYWxNb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTW9kZWwgPSB0aGlzLl9tb2RlbHMuZ2V0TW9kaWZpZWRNb2RlbCgpO1xuXHRcdGlmICghb3JpZ2luYWxNb2RlbCB8fCAhbW9kaWZpZWRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWxPcHRzID0gb3JpZ2luYWxNb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRNb2RlbE9wdHMgPSBtb2RpZmllZE1vZGVsLmdldE9wdGlvbnMoKTtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBtb2RpZmllZE9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX21vZGVsLmN1cnJlbnRHcm91cC5nZXQoKTtcblx0XHRmb3IgKGNvbnN0IHZpZXdJdGVtIG9mIGdyb3VwPy5saW5lcyB8fCBbXSkge1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGxldCByb3c6IEhUTUxEaXZFbGVtZW50O1xuXG5cdFx0XHRpZiAodmlld0l0ZW0udHlwZSA9PT0gTGluZVR5cGUuSGVhZGVyKSB7XG5cblx0XHRcdFx0Y29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGhlYWRlci5jbGFzc05hbWUgPSAnZGlmZi1yZXZpZXctcm93Jztcblx0XHRcdFx0aGVhZGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0aXRlbScpO1xuXG5cdFx0XHRcdGNvbnN0IHIgPSBncm91cC5yYW5nZTtcblx0XHRcdFx0Y29uc3QgZGlmZkluZGV4ID0gdGhpcy5fbW9kZWwuY3VycmVudEdyb3VwSW5kZXguZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGRpZmZzTGVuZ3RoID0gdGhpcy5fbW9kZWwuZ3JvdXBzLmdldCgpLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgZ2V0QXJpYUxpbmVzID0gKGxpbmVzOiBudW1iZXIpID0+XG5cdFx0XHRcdFx0bGluZXMgPT09IDAgPyBsb2NhbGl6ZSgnbm9fbGluZXNfY2hhbmdlZCcsIFwibm8gbGluZXMgY2hhbmdlZFwiKVxuXHRcdFx0XHRcdFx0OiBsaW5lcyA9PT0gMSA/IGxvY2FsaXplKCdvbmVfbGluZV9jaGFuZ2VkJywgXCIxIGxpbmUgY2hhbmdlZFwiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb3JlX2xpbmVzX2NoYW5nZWQnLCBcInswfSBsaW5lcyBjaGFuZ2VkXCIsIGxpbmVzKTtcblxuXHRcdFx0XHRjb25zdCBvcmlnaW5hbENoYW5nZWRMaW5lc0NudEFyaWEgPSBnZXRBcmlhTGluZXMoci5vcmlnaW5hbC5sZW5ndGgpO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZENoYW5nZWRMaW5lc0NudEFyaWEgPSBnZXRBcmlhTGluZXMoci5tb2RpZmllZC5sZW5ndGgpO1xuXHRcdFx0XHRoZWFkZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2hlYWRlcicsXG5cdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0J1RoaXMgaXMgdGhlIEFSSUEgbGFiZWwgZm9yIGEgZ2l0IGRpZmYgaGVhZGVyLicsXG5cdFx0XHRcdFx0XHQnQSBnaXQgZGlmZiBoZWFkZXIgbG9va3MgbGlrZSB0aGlzOiBAQCAtMTU0LDEyICsxNTksMzkgQEAuJyxcblx0XHRcdFx0XHRcdCdUaGF0IGVuY29kZXMgdGhhdCBhdCBvcmlnaW5hbCBsaW5lIDE1NCAod2hpY2ggaXMgbm93IGxpbmUgMTU5KSwgMTIgbGluZXMgd2VyZSByZW1vdmVkL2NoYW5nZWQgd2l0aCAzOSBsaW5lcy4nLFxuXHRcdFx0XHRcdFx0J1ZhcmlhYmxlcyAwIGFuZCAxIHJlZmVyIHRvIHRoZSBkaWZmIGluZGV4IG91dCBvZiB0b3RhbCBudW1iZXIgb2YgZGlmZnMuJyxcblx0XHRcdFx0XHRcdCdWYXJpYWJsZXMgMiBhbmQgNCB3aWxsIGJlIG51bWJlcnMgKGEgbGluZSBudW1iZXIpLicsXG5cdFx0XHRcdFx0XHQnVmFyaWFibGVzIDMgYW5kIDUgd2lsbCBiZSBcIm5vIGxpbmVzIGNoYW5nZWRcIiwgXCIxIGxpbmUgY2hhbmdlZFwiIG9yIFwiWCBsaW5lcyBjaGFuZ2VkXCIsIGxvY2FsaXplZCBzZXBhcmF0ZWx5Lidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sIFwiRGlmZmVyZW5jZSB7MH0gb2YgezF9OiBvcmlnaW5hbCBsaW5lIHsyfSwgezN9LCBtb2RpZmllZCBsaW5lIHs0fSwgezV9XCIsXG5cdFx0XHRcdFx0KGRpZmZJbmRleCArIDEpLFxuXHRcdFx0XHRcdGRpZmZzTGVuZ3RoLFxuXHRcdFx0XHRcdHIub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdG9yaWdpbmFsQ2hhbmdlZExpbmVzQ250QXJpYSxcblx0XHRcdFx0XHRyLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRtb2RpZmllZENoYW5nZWRMaW5lc0NudEFyaWFcblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjZWxsLmNsYXNzTmFtZSA9ICdkaWZmLXJldmlldy1jZWxsIGRpZmYtcmV2aWV3LXN1bW1hcnknO1xuXHRcdFx0XHQvLyBlLmcuOiBgMS8xMDogQEAgLTUwNCw3ICs1MTcsNyBAQGBcblx0XHRcdFx0Y2VsbC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShgJHtkaWZmSW5kZXggKyAxfS8ke2RpZmZzTGVuZ3RofTogQEAgLSR7ci5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXJ9LCR7ci5vcmlnaW5hbC5sZW5ndGh9ICske3IubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyfSwke3IubW9kaWZpZWQubGVuZ3RofSBAQGApKTtcblx0XHRcdFx0aGVhZGVyLmFwcGVuZENoaWxkKGNlbGwpO1xuXG5cdFx0XHRcdHJvdyA9IGhlYWRlcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJvdyA9IHRoaXMuX2NyZWF0ZVJvdyh2aWV3SXRlbSwgbGluZUhlaWdodCxcblx0XHRcdFx0XHR0aGlzLl93aWR0aC5nZXQoKSwgb3JpZ2luYWxPcHRpb25zLCBvcmlnaW5hbE1vZGVsLCBvcmlnaW5hbE1vZGVsT3B0cywgbW9kaWZpZWRPcHRpb25zLCBtb2RpZmllZE1vZGVsLCBtb2RpZmllZE1vZGVsT3B0cyxcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJvdyk7XG5cblx0XHRcdGNvbnN0IGlzU2VsZWN0ZWRPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIGlzU2VsZWN0ZWQgKi8gdGhpcy5fbW9kZWwuY3VycmVudEVsZW1lbnQucmVhZChyZWFkZXIpID09PSB2aWV3SXRlbSk7XG5cblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHRhYiBpbmRleCAqL1xuXHRcdFx0XHRjb25zdCBpc1NlbGVjdGVkID0gaXNTZWxlY3RlZE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJvdy50YWJJbmRleCA9IGlzU2VsZWN0ZWQgPyAwIDogLTE7XG5cdFx0XHRcdGlmIChpc1NlbGVjdGVkKSB7XG5cdFx0XHRcdFx0cm93LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3csICdmb2N1cycsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbW9kZWwuZ29Ub0xpbmUodmlld0l0ZW0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Njcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUm93KFxuXHRcdGl0ZW06IERlbGV0ZWRMaW5lVmlld0VsZW1lbnQgfCBBZGRlZExpbmVWaWV3RWxlbWVudCB8IFVuY2hhbmdlZExpbmVWaWV3RWxlbWVudCxcblx0XHRsaW5lSGVpZ2h0OiBudW1iZXIsXG5cdFx0d2lkdGg6IG51bWJlcixcblx0XHRvcmlnaW5hbE9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIG9yaWdpbmFsTW9kZWw6IElUZXh0TW9kZWwsIG9yaWdpbmFsTW9kZWxPcHRzOiBUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMsXG5cdFx0bW9kaWZpZWRPcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBtb2RpZmllZE1vZGVsOiBJVGV4dE1vZGVsLCBtb2RpZmllZE1vZGVsT3B0czogVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zLFxuXHQpOiBIVE1MRGl2RWxlbWVudCB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxMYXlvdXRJbmZvID0gb3JpZ2luYWxPcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxMaW5lTnVtYmVyc1dpZHRoID0gb3JpZ2luYWxMYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGggKyBvcmlnaW5hbExheW91dEluZm8ubGluZU51bWJlcnNXaWR0aDtcblxuXHRcdGNvbnN0IG1vZGlmaWVkTGF5b3V0SW5mbyA9IG1vZGlmaWVkT3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZU51bWJlcnNXaWR0aCA9IDEwICsgbW9kaWZpZWRMYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGggKyBtb2RpZmllZExheW91dEluZm8ubGluZU51bWJlcnNXaWR0aDtcblxuXHRcdGxldCByb3dDbGFzc05hbWU6IHN0cmluZyA9ICdkaWZmLXJldmlldy1yb3cnO1xuXHRcdGxldCBsaW5lTnVtYmVyc0V4dHJhQ2xhc3NOYW1lOiBzdHJpbmcgPSAnJztcblx0XHRjb25zdCBzcGFjZXJDbGFzc05hbWU6IHN0cmluZyA9ICdkaWZmLXJldmlldy1zcGFjZXInO1xuXHRcdGxldCBzcGFjZXJJY29uOiBUaGVtZUljb24gfCBudWxsID0gbnVsbDtcblx0XHRzd2l0Y2ggKGl0ZW0udHlwZSkge1xuXHRcdFx0Y2FzZSBMaW5lVHlwZS5BZGRlZDpcblx0XHRcdFx0cm93Q2xhc3NOYW1lID0gJ2RpZmYtcmV2aWV3LXJvdyBsaW5lLWluc2VydCc7XG5cdFx0XHRcdGxpbmVOdW1iZXJzRXh0cmFDbGFzc05hbWUgPSAnIGNoYXItaW5zZXJ0Jztcblx0XHRcdFx0c3BhY2VySWNvbiA9IGFjY2Vzc2libGVEaWZmVmlld2VySW5zZXJ0SWNvbjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIExpbmVUeXBlLkRlbGV0ZWQ6XG5cdFx0XHRcdHJvd0NsYXNzTmFtZSA9ICdkaWZmLXJldmlldy1yb3cgbGluZS1kZWxldGUnO1xuXHRcdFx0XHRsaW5lTnVtYmVyc0V4dHJhQ2xhc3NOYW1lID0gJyBjaGFyLWRlbGV0ZSc7XG5cdFx0XHRcdHNwYWNlckljb24gPSBhY2Nlc3NpYmxlRGlmZlZpZXdlclJlbW92ZUljb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHJvdy5zdHlsZS5taW5XaWR0aCA9IHdpZHRoICsgJ3B4Jztcblx0XHRyb3cuY2xhc3NOYW1lID0gcm93Q2xhc3NOYW1lO1xuXHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGl0ZW0nKTtcblx0XHRyb3cuYXJpYUxldmVsID0gJyc7XG5cblx0XHRjb25zdCBjZWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y2VsbC5jbGFzc05hbWUgPSAnZGlmZi1yZXZpZXctY2VsbCc7XG5cdFx0Y2VsbC5zdHlsZS5oZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHRyb3cuYXBwZW5kQ2hpbGQoY2VsbCk7XG5cblx0XHRjb25zdCBvcmlnaW5hbExpbmVOdW1iZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0b3JpZ2luYWxMaW5lTnVtYmVyLnN0eWxlLndpZHRoID0gKG9yaWdpbmFsTGluZU51bWJlcnNXaWR0aCArICdweCcpO1xuXHRcdG9yaWdpbmFsTGluZU51bWJlci5zdHlsZS5taW5XaWR0aCA9IChvcmlnaW5hbExpbmVOdW1iZXJzV2lkdGggKyAncHgnKTtcblx0XHRvcmlnaW5hbExpbmVOdW1iZXIuY2xhc3NOYW1lID0gJ2RpZmYtcmV2aWV3LWxpbmUtbnVtYmVyJyArIGxpbmVOdW1iZXJzRXh0cmFDbGFzc05hbWU7XG5cdFx0aWYgKGl0ZW0ub3JpZ2luYWxMaW5lTnVtYmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG9yaWdpbmFsTGluZU51bWJlci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShTdHJpbmcoaXRlbS5vcmlnaW5hbExpbmVOdW1iZXIpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9yaWdpbmFsTGluZU51bWJlci5pbm5lclRleHQgPSAnXFx1MDBhMCc7XG5cdFx0fVxuXHRcdGNlbGwuYXBwZW5kQ2hpbGQob3JpZ2luYWxMaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IG1vZGlmaWVkTGluZU51bWJlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRtb2RpZmllZExpbmVOdW1iZXIuc3R5bGUud2lkdGggPSAobW9kaWZpZWRMaW5lTnVtYmVyc1dpZHRoICsgJ3B4Jyk7XG5cdFx0bW9kaWZpZWRMaW5lTnVtYmVyLnN0eWxlLm1pbldpZHRoID0gKG1vZGlmaWVkTGluZU51bWJlcnNXaWR0aCArICdweCcpO1xuXHRcdG1vZGlmaWVkTGluZU51bWJlci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAnMTBweCc7XG5cdFx0bW9kaWZpZWRMaW5lTnVtYmVyLmNsYXNzTmFtZSA9ICdkaWZmLXJldmlldy1saW5lLW51bWJlcicgKyBsaW5lTnVtYmVyc0V4dHJhQ2xhc3NOYW1lO1xuXHRcdGlmIChpdGVtLm1vZGlmaWVkTGluZU51bWJlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtb2RpZmllZExpbmVOdW1iZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nKGl0ZW0ubW9kaWZpZWRMaW5lTnVtYmVyKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RpZmllZExpbmVOdW1iZXIuaW5uZXJUZXh0ID0gJ1xcdTAwYTAnO1xuXHRcdH1cblx0XHRjZWxsLmFwcGVuZENoaWxkKG1vZGlmaWVkTGluZU51bWJlcik7XG5cblx0XHRjb25zdCBzcGFjZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0c3BhY2VyLmNsYXNzTmFtZSA9IHNwYWNlckNsYXNzTmFtZTtcblxuXHRcdGlmIChzcGFjZXJJY29uKSB7XG5cdFx0XHRjb25zdCBzcGFjZXJDb2RpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0c3BhY2VyQ29kaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoc3BhY2VySWNvbik7XG5cdFx0XHRzcGFjZXJDb2RpY29uLmlubmVyVGV4dCA9ICdcXHUwMGEwXFx1MDBhMCc7XG5cdFx0XHRzcGFjZXIuYXBwZW5kQ2hpbGQoc3BhY2VyQ29kaWNvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNwYWNlci5pbm5lclRleHQgPSAnXFx1MDBhMFxcdTAwYTAnO1xuXHRcdH1cblx0XHRjZWxsLmFwcGVuZENoaWxkKHNwYWNlcik7XG5cblx0XHRsZXQgbGluZUNvbnRlbnQ6IHN0cmluZztcblx0XHRpZiAoaXRlbS5tb2RpZmllZExpbmVOdW1iZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGV0IGh0bWw6IHN0cmluZyB8IFRydXN0ZWRIVE1MID0gdGhpcy5fZ2V0TGluZUh0bWwobW9kaWZpZWRNb2RlbCwgbW9kaWZpZWRPcHRpb25zLCBtb2RpZmllZE1vZGVsT3B0cy50YWJTaXplLCBpdGVtLm1vZGlmaWVkTGluZU51bWJlciwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHRpZiAoQWNjZXNzaWJsZURpZmZWaWV3ZXIuX3R0UG9saWN5KSB7XG5cdFx0XHRcdGh0bWwgPSBBY2Nlc3NpYmxlRGlmZlZpZXdlci5fdHRQb2xpY3kuY3JlYXRlSFRNTChodG1sKTtcblx0XHRcdH1cblx0XHRcdGNlbGwuaW5zZXJ0QWRqYWNlbnRIVE1MKCdiZWZvcmVlbmQnLCBodG1sIGFzIHN0cmluZyk7XG5cdFx0XHRsaW5lQ29udGVudCA9IG1vZGlmaWVkTW9kZWwuZ2V0TGluZUNvbnRlbnQoaXRlbS5tb2RpZmllZExpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgaHRtbDogc3RyaW5nIHwgVHJ1c3RlZEhUTUwgPSB0aGlzLl9nZXRMaW5lSHRtbChvcmlnaW5hbE1vZGVsLCBvcmlnaW5hbE9wdGlvbnMsIG9yaWdpbmFsTW9kZWxPcHRzLnRhYlNpemUsIGl0ZW0ub3JpZ2luYWxMaW5lTnVtYmVyLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRcdGlmIChBY2Nlc3NpYmxlRGlmZlZpZXdlci5fdHRQb2xpY3kpIHtcblx0XHRcdFx0aHRtbCA9IEFjY2Vzc2libGVEaWZmVmlld2VyLl90dFBvbGljeS5jcmVhdGVIVE1MKGh0bWwpO1xuXHRcdFx0fVxuXHRcdFx0Y2VsbC5pbnNlcnRBZGphY2VudEhUTUwoJ2JlZm9yZWVuZCcsIGh0bWwgYXMgc3RyaW5nKTtcblx0XHRcdGxpbmVDb250ZW50ID0gb3JpZ2luYWxNb2RlbC5nZXRMaW5lQ29udGVudChpdGVtLm9yaWdpbmFsTGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVDb250ZW50Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bGluZUNvbnRlbnQgPSBsb2NhbGl6ZSgnYmxhbmtMaW5lJywgXCJibGFua1wiKTtcblx0XHR9XG5cblx0XHRsZXQgYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcblx0XHRzd2l0Y2ggKGl0ZW0udHlwZSkge1xuXHRcdFx0Y2FzZSBMaW5lVHlwZS5VbmNoYW5nZWQ6XG5cdFx0XHRcdGlmIChpdGVtLm9yaWdpbmFsTGluZU51bWJlciA9PT0gaXRlbS5tb2RpZmllZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSh7IGtleTogJ3VuY2hhbmdlZExpbmUnLCBjb21tZW50OiBbJ1RoZSBwbGFjZWhvbGRlcnMgYXJlIGNvbnRlbnRzIG9mIHRoZSBsaW5lIGFuZCBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQuJ10gfSwgXCJ7MH0gdW5jaGFuZ2VkIGxpbmUgezF9XCIsIGxpbmVDb250ZW50LCBpdGVtLm9yaWdpbmFsTGluZU51bWJlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2VxdWFsTGluZScsIFwiezB9IG9yaWdpbmFsIGxpbmUgezF9IG1vZGlmaWVkIGxpbmUgezJ9XCIsIGxpbmVDb250ZW50LCBpdGVtLm9yaWdpbmFsTGluZU51bWJlciwgaXRlbS5tb2RpZmllZExpbmVOdW1iZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBMaW5lVHlwZS5BZGRlZDpcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2luc2VydExpbmUnLCBcIisgezB9IG1vZGlmaWVkIGxpbmUgezF9XCIsIGxpbmVDb250ZW50LCBpdGVtLm1vZGlmaWVkTGluZU51bWJlcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBMaW5lVHlwZS5EZWxldGVkOlxuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnZGVsZXRlTGluZScsIFwiLSB7MH0gb3JpZ2luYWwgbGluZSB7MX1cIiwgbGluZUNvbnRlbnQsIGl0ZW0ub3JpZ2luYWxMaW5lTnVtYmVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fVxuXG5cdHByaXZhdGUgX2dldExpbmVIdG1sKG1vZGVsOiBJVGV4dE1vZGVsLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB0YWJTaXplOiBudW1iZXIsIGxpbmVOdW1iZXI6IG51bWJlciwgbGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjKTogc3RyaW5nIHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhclNpemUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2Nyb2xsYmFyKS52ZXJ0aWNhbFNjcm9sbGJhclNpemU7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IExpbmVUb2tlbnMuY3JlYXRlRW1wdHkobGluZUNvbnRlbnQsIGxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0Y29uc3QgaXNCYXNpY0FTQ0lJID0gVmlld0xpbmVSZW5kZXJpbmdEYXRhLmlzQmFzaWNBU0NJSShsaW5lQ29udGVudCwgbW9kZWwubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpKTtcblx0XHRjb25zdCBjb250YWluc1JUTCA9IFZpZXdMaW5lUmVuZGVyaW5nRGF0YS5jb250YWluc1JUTChsaW5lQ29udGVudCwgaXNCYXNpY0FTQ0lJLCBtb2RlbC5taWdodENvbnRhaW5SVEwoKSk7XG5cdFx0Y29uc3QgciA9IHJlbmRlclZpZXdMaW5lMihuZXcgUmVuZGVyTGluZUlucHV0KFxuXHRcdFx0KGZvbnRJbmZvLmlzTW9ub3NwYWNlICYmICFvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpKSxcblx0XHRcdGZvbnRJbmZvLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyxcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRpc0Jhc2ljQVNDSUksXG5cdFx0XHRjb250YWluc1JUTCxcblx0XHRcdDAsXG5cdFx0XHRsaW5lVG9rZW5zLFxuXHRcdFx0W10sXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0MCxcblx0XHRcdGZvbnRJbmZvLnNwYWNlV2lkdGgsXG5cdFx0XHRmb250SW5mby5taWRkb3RXaWR0aCxcblx0XHRcdGZvbnRJbmZvLndzbWlkZG90V2lkdGgsXG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RvcFJlbmRlcmluZ0xpbmVBZnRlciksXG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVuZGVyV2hpdGVzcGFjZSksXG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVuZGVyQ29udHJvbENoYXJhY3RlcnMpLFxuXHRcdFx0b3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRMaWdhdHVyZXMpICE9PSBFZGl0b3JGb250TGlnYXR1cmVzLk9GRixcblx0XHRcdG51bGwsXG5cdFx0XHRudWxsLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplXG5cdFx0KSk7XG5cblx0XHRyZXR1cm4gci5odG1sO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsRnJvbUVkaXRvcnMgaW1wbGVtZW50cyBJQWNjZXNzaWJsZURpZmZWaWV3ZXJNb2RlbCB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yczogRGlmZkVkaXRvckVkaXRvcnMpIHsgfVxuXG5cdGdldE9yaWdpbmFsTW9kZWwoKTogSVRleHRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpITtcblx0fVxuXG5cdGdldE9yaWdpbmFsT3B0aW9ucygpOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JzLm9yaWdpbmFsLmdldE9wdGlvbnMoKTtcblx0fVxuXG5cdG9yaWdpbmFsUmV2ZWFsKHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9ycy5vcmlnaW5hbC5yZXZlYWxSYW5nZShyYW5nZSk7XG5cdFx0dGhpcy5lZGl0b3JzLm9yaWdpbmFsLnNldFNlbGVjdGlvbihyYW5nZSk7XG5cdFx0dGhpcy5lZGl0b3JzLm9yaWdpbmFsLmZvY3VzKCk7XG5cdH1cblxuXHRnZXRNb2RpZmllZE1vZGVsKCk6IElUZXh0TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnMubW9kaWZpZWQuZ2V0TW9kZWwoKSE7XG5cdH1cblxuXHRnZXRNb2RpZmllZE9wdGlvbnMoKTogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9ycy5tb2RpZmllZC5nZXRPcHRpb25zKCk7XG5cdH1cblxuXHRtb2RpZmllZFJldmVhbChyYW5nZT86IFJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHR0aGlzLmVkaXRvcnMubW9kaWZpZWQucmV2ZWFsUmFuZ2UocmFuZ2UpO1xuXHRcdFx0dGhpcy5lZGl0b3JzLm1vZGlmaWVkLnNldFNlbGVjdGlvbihyYW5nZSk7XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9ycy5tb2RpZmllZC5mb2N1cygpO1xuXHR9XG5cblx0bW9kaWZpZWRTZXRTZWxlY3Rpb24ocmFuZ2U6IFJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JzLm1vZGlmaWVkLnNldFNlbGVjdGlvbihyYW5nZSk7XG5cdH1cblxuXHRtb2RpZmllZEZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9ycy5tb2RpZmllZC5mb2N1cygpO1xuXHR9XG5cblx0Z2V0TW9kaWZpZWRQb3NpdGlvbigpOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9ycy5tb2RpZmllZC5nZXRQb3NpdGlvbigpID8/IHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QiwrQkFBK0IsYUFBYTtBQUM1RSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBNkIsb0JBQW9CO0FBQzFELFNBQW9DLFNBQVMsa0JBQWtCLFNBQVMsaUJBQWlCLGdCQUFnQixtQkFBbUI7QUFDNUgsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUIsb0JBQTRDO0FBQzFFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMs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
