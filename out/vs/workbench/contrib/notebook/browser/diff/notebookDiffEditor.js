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
import * as nls from "../../../../../nls.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService, registerThemingParticipant } from "../../../../../platform/theme/common/themeService.js";
import { EditorPaneSelectionChangeReason, EditorPaneSelectionCompareResult } from "../../../../common/editor.js";
import { getDefaultNotebookCreationOptions } from "../notebookEditorWidget.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { SideBySideDiffElementViewModel } from "./diffElementViewModel.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { CellDiffPlaceholderRenderer, CellDiffSideBySideRenderer, CellDiffSingleSideRenderer, NotebookCellTextDiffListDelegate, NotebookDocumentMetadataDiffRenderer, NotebookTextDiffList } from "./notebookDiffList.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { diffDiagonalFill, editorBackground, focusBorder, foreground } from "../../../../../platform/theme/common/colorRegistry.js";
import { INotebookEditorWorkerService } from "../../common/services/notebookWorkerService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { createBareFontInfoFromRawSettings } from "../../../../../editor/common/config/fontInfoFromSettings.js";
import { PixelRatio } from "../../../../../base/browser/pixelRatio.js";
import { DiffSide, DIFF_CELL_MARGIN } from "./notebookDiffEditorBrowser.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { EditorPane } from "../../../../browser/parts/editor/editorPane.js";
import { CellUri, NOTEBOOK_DIFF_EDITOR_ID, NotebookSetting } from "../../common/notebookCommon.js";
import { SequencerByKey } from "../../../../../base/common/async.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { BackLayerWebView } from "../view/renderers/backLayerWebView.js";
import { NotebookDiffEditorEventDispatcher, NotebookDiffLayoutChangedEvent } from "./eventDispatcher.js";
import { FontMeasurements } from "../../../../../editor/browser/config/fontMeasurements.js";
import { NotebookOptions } from "../notebookOptions.js";
import { cellIndexesToRanges, cellRangesToIndexes } from "../../common/notebookRange.js";
import { NotebookDiffOverviewRuler } from "./notebookDiffOverviewRuler.js";
import { registerZIndex, ZIndex } from "../../../../../platform/layout/browser/zIndexRegistry.js";
import { NotebookDiffViewModel } from "./notebookDiffViewModel.js";
import { INotebookService } from "../../common/notebookService.js";
import { DiffEditorHeightCalculatorService } from "./editorHeightCalculator.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { NotebookInlineDiffWidget } from "./inlineDiff/notebookInlineDiffWidget.js";
import { observableValue } from "../../../../../base/common/observable.js";
const $ = DOM.$;
class NotebookDiffEditorSelection {
  constructor(selections) {
    this.selections = selections;
  }
  compare(other) {
    if (!(other instanceof NotebookDiffEditorSelection)) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    if (this.selections.length !== other.selections.length) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    for (let i = 0; i < this.selections.length; i++) {
      if (this.selections[i] !== other.selections[i]) {
        return EditorPaneSelectionCompareResult.DIFFERENT;
      }
    }
    return EditorPaneSelectionCompareResult.IDENTICAL;
  }
  restore(options) {
    const notebookOptions = {
      cellSelections: cellIndexesToRanges(this.selections)
    };
    Object.assign(notebookOptions, options);
    return notebookOptions;
  }
}
let NotebookTextDiffEditor = class extends EditorPane {
  constructor(group, instantiationService, themeService, contextKeyService, notebookEditorWorkerService, configurationService, telemetryService, storageService, notebookService, editorService) {
    super(NotebookTextDiffEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.notebookEditorWorkerService = notebookEditorWorkerService;
    this.configurationService = configurationService;
    this.notebookService = notebookService;
    this.editorService = editorService;
    this.creationOptions = getDefaultNotebookCreationOptions();
    this._dimension = void 0;
    this._modifiedWebview = null;
    this._originalWebview = null;
    this._webviewTransparentCover = null;
    this._inlineView = false;
    this._onMouseUp = this._register(new Emitter());
    this.onMouseUp = this._onMouseUp.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this.onDidChangeScroll = this._onDidScroll.event;
    this._model = null;
    this._modifiedResourceDisposableStore = this._register(new DisposableStore());
    this._insetModifyQueueByOutputId = new SequencerByKey();
    this._onDidDynamicOutputRendered = this._register(new Emitter());
    this.onDidDynamicOutputRendered = this._onDidDynamicOutputRendered.event;
    this._localStore = this._register(new DisposableStore());
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._isDisposed = false;
    this._currentChangedIndex = observableValue(this, -1);
    this.currentChangedIndex = this._currentChangedIndex;
    this.pendingLayouts = /* @__PURE__ */ new WeakMap();
    this.diffEditorCalcuator = this.instantiationService.createInstance(DiffEditorHeightCalculatorService, this.fontInfo.lineHeight);
    this._notebookOptions = instantiationService.createInstance(NotebookOptions, this.window, false, void 0);
    this._register(this._notebookOptions);
    this._revealFirst = true;
  }
  get textModel() {
    return this._model?.modified.notebook;
  }
  get inlineNotebookEditor() {
    if (this._inlineView) {
      return this.inlineDiffWidget?.editorWidget;
    }
    return void 0;
  }
  get notebookOptions() {
    return this._notebookOptions;
  }
  get isDisposed() {
    return this._isDisposed;
  }
  get fontInfo() {
    if (!this._fontInfo) {
      this._fontInfo = this.createFontInfo();
    }
    return this._fontInfo;
  }
  createFontInfo() {
    const editorOptions = this.configurationService.getValue("editor");
    return FontMeasurements.readFontInfo(this.window, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.window).value));
  }
  isOverviewRulerEnabled() {
    return this.configurationService.getValue(NotebookSetting.diffOverviewRuler) ?? false;
  }
  getSelection() {
    const selections = this._list.getFocus();
    return new NotebookDiffEditorSelection(selections);
  }
  toggleNotebookCellSelection(cell) {
  }
  updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
  }
  async focusNotebookCell(cell, focus) {
  }
  async focusNextNotebookCell(cell, focus) {
  }
  didFocusOutputInputChange(inputFocused) {
  }
  getScrollTop() {
    return this._list?.scrollTop ?? 0;
  }
  getScrollHeight() {
    return this._list?.scrollHeight ?? 0;
  }
  getScrollPosition() {
    return {
      scrollTop: this.getScrollTop(),
      scrollLeft: this._list?.scrollLeft ?? 0
    };
  }
  setScrollPosition(scrollPosition) {
    if (!this._list) {
      return;
    }
    this._list.scrollTop = scrollPosition.scrollTop;
    if (scrollPosition.scrollLeft !== void 0) {
      this._list.scrollLeft = scrollPosition.scrollLeft;
    }
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this._list?.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  updateOutputHeight(cellInfo, output, outputHeight, isInit) {
    const diffElement = cellInfo.diffElement;
    const cell = this.getCellByInfo(cellInfo);
    const outputIndex = cell.outputsViewModels.indexOf(output);
    if (diffElement instanceof SideBySideDiffElementViewModel) {
      const info = CellUri.parse(cellInfo.cellUri);
      if (!info) {
        return;
      }
      diffElement.updateOutputHeight(info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified, outputIndex, outputHeight);
    } else {
      diffElement.updateOutputHeight(diffElement.type === "insert" ? DiffSide.Modified : DiffSide.Original, outputIndex, outputHeight);
    }
    if (isInit) {
      this._onDidDynamicOutputRendered.fire({ cell, output });
    }
  }
  setMarkupCellEditState(cellId, editState) {
  }
  didStartDragMarkupCell(cellId, event) {
  }
  didDragMarkupCell(cellId, event) {
  }
  didEndDragMarkupCell(cellId) {
  }
  didDropMarkupCell(cellId) {
  }
  didResizeOutput(cellId) {
  }
  async toggleInlineView() {
    this._layoutCancellationTokenSource?.dispose();
    this._inlineView = !this._inlineView;
    if (!this._lastLayoutProperties) {
      return;
    }
    if (this._inlineView) {
      this.layout(this._lastLayoutProperties?.dimension, this._lastLayoutProperties?.position);
      this.inlineDiffWidget?.show(this.input, this._model?.modified.notebook, this._model?.original.notebook, this._options);
    } else {
      this.layout(this._lastLayoutProperties?.dimension, this._lastLayoutProperties?.position);
      this.inlineDiffWidget?.hide();
    }
    this._layoutCancellationTokenSource = new CancellationTokenSource();
    this.updateLayout(this._layoutCancellationTokenSource.token);
  }
  createEditor(parent) {
    this._rootElement = DOM.append(parent, DOM.$(".notebook-text-diff-editor"));
    this._overflowContainer = document.createElement("div");
    this._overflowContainer.classList.add("notebook-overflow-widget-container", "monaco-editor");
    DOM.append(parent, this._overflowContainer);
    const renderers = [
      this.instantiationService.createInstance(CellDiffSingleSideRenderer, this),
      this.instantiationService.createInstance(CellDiffSideBySideRenderer, this),
      this.instantiationService.createInstance(CellDiffPlaceholderRenderer, this),
      this.instantiationService.createInstance(NotebookDocumentMetadataDiffRenderer, this)
    ];
    this._listViewContainer = DOM.append(this._rootElement, DOM.$(".notebook-diff-list-view"));
    this._list = this.instantiationService.createInstance(
      NotebookTextDiffList,
      "NotebookTextDiff",
      this._listViewContainer,
      this.instantiationService.createInstance(NotebookCellTextDiffListDelegate, this.window),
      renderers,
      this.contextKeyService,
      {
        setRowLineHeight: false,
        setRowHeight: false,
        supportDynamicHeights: true,
        horizontalScrolling: false,
        keyboardSupport: false,
        mouseSupport: true,
        multipleSelectionSupport: false,
        typeNavigationEnabled: true,
        paddingBottom: 0,
        // transformOptimization: (isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
        styleController: (_suffix) => {
          return this._list;
        },
        overrideStyles: {
          listBackground: editorBackground,
          listActiveSelectionBackground: editorBackground,
          listActiveSelectionForeground: foreground,
          listFocusAndSelectionBackground: editorBackground,
          listFocusAndSelectionForeground: foreground,
          listFocusBackground: editorBackground,
          listFocusForeground: foreground,
          listHoverForeground: foreground,
          listHoverBackground: editorBackground,
          listHoverOutline: focusBorder,
          listFocusOutline: focusBorder,
          listInactiveSelectionBackground: editorBackground,
          listInactiveSelectionForeground: foreground,
          listInactiveFocusBackground: editorBackground,
          listInactiveFocusOutline: editorBackground
        },
        accessibilityProvider: {
          getAriaLabel() {
            return null;
          },
          getWidgetAriaLabel() {
            return nls.localize("notebookTreeAriaLabel", "Notebook Text Diff");
          }
        }
        // focusNextPreviousDelegate: {
        // 	onFocusNext: (applyFocusNext: () => void) => this._updateForCursorNavigationMode(applyFocusNext),
        // 	onFocusPrevious: (applyFocusPrevious: () => void) => this._updateForCursorNavigationMode(applyFocusPrevious),
        // }
      }
    );
    this.inlineDiffWidget = this._register(this.instantiationService.createInstance(NotebookInlineDiffWidget, this._rootElement, this.group.id, this.window, this.notebookOptions, this._dimension));
    this._register(this._list);
    this._register(this._list.onMouseUp((e) => {
      if (e.element) {
        if (typeof e.index === "number") {
          this._list.setFocus([e.index]);
        }
        this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
      }
    }));
    this._register(this._list.onDidScroll(() => {
      this._onDidScroll.fire();
    }));
    this._register(this._list.onDidChangeFocus(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.USER })));
    this._overviewRulerContainer = document.createElement("div");
    this._overviewRulerContainer.classList.add("notebook-overview-ruler-container");
    this._rootElement.appendChild(this._overviewRulerContainer);
    this._registerOverviewRuler();
    this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $(".webview-cover"));
    this._webviewTransparentCover.style.display = "none";
    this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overflowContainer, (e) => {
      if (e.target.classList.contains("slider") && this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "block";
      }
    }));
    this._register(DOM.addStandardDisposableGenericMouseUpListener(this._overflowContainer, () => {
      if (this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "none";
      }
    }));
    this._register(this._list.onDidScroll((e) => {
      this._webviewTransparentCover.style.top = `${e.scrollTop}px`;
    }));
  }
  _registerOverviewRuler() {
    this._overviewRuler = this._register(this.instantiationService.createInstance(NotebookDiffOverviewRuler, this, NotebookTextDiffEditor.ENTIRE_DIFF_OVERVIEW_WIDTH, this._overviewRulerContainer));
  }
  _updateOutputsOffsetsInWebview(scrollTop, scrollHeight, activeWebview, getActiveNestedCell, diffSide) {
    activeWebview.element.style.height = `${scrollHeight}px`;
    if (activeWebview.insetMapping) {
      const updateItems = [];
      const removedItems = [];
      activeWebview.insetMapping.forEach((value, key) => {
        const cell = getActiveNestedCell(value.cellInfo.diffElement);
        if (!cell) {
          return;
        }
        const viewIndex = this._list.indexOf(value.cellInfo.diffElement);
        if (viewIndex === void 0) {
          return;
        }
        if (cell.outputsViewModels.indexOf(key) < 0) {
          removedItems.push(key);
        } else {
          const cellTop = this._list.getCellViewScrollTop(value.cellInfo.diffElement);
          const outputIndex = cell.outputsViewModels.indexOf(key);
          const outputOffset = value.cellInfo.diffElement.getOutputOffsetInCell(diffSide, outputIndex);
          updateItems.push({
            cell,
            output: key,
            cellTop,
            outputOffset,
            forceDisplay: false
          });
        }
      });
      activeWebview.removeInsets(removedItems);
      if (updateItems.length) {
        activeWebview.updateScrollTops(updateItems, []);
      }
    }
  }
  async setInput(input, options, context, token) {
    this.inlineDiffWidget?.hide();
    await super.setInput(input, options, context, token);
    const model = await input.resolve();
    if (this._model !== model) {
      this._detachModel();
      this._attachModel(model);
    }
    this._model = model;
    if (this._model === null) {
      return;
    }
    if (this._inlineView) {
      this._listViewContainer.style.display = "none";
      this.inlineDiffWidget?.show(input, model.modified.notebook, model.original.notebook, options);
    } else {
      this._listViewContainer.style.display = "block";
      this.inlineDiffWidget?.hide();
    }
    this._revealFirst = true;
    this._modifiedResourceDisposableStore.clear();
    this._layoutCancellationTokenSource = new CancellationTokenSource();
    this._modifiedResourceDisposableStore.add(Event.any(this._model.original.notebook.onDidChangeContent, this._model.modified.notebook.onDidChangeContent)((e) => {
      if (this._model !== null && this.editorService.activeEditor !== input) {
        this._layoutCancellationTokenSource?.dispose();
        this._layoutCancellationTokenSource = new CancellationTokenSource();
        this.updateLayout(this._layoutCancellationTokenSource.token);
      }
    }));
    await this._createOriginalWebview(generateUuid(), this._model.original.viewType, this._model.original.resource);
    if (this._originalWebview) {
      this._modifiedResourceDisposableStore.add(this._originalWebview);
    }
    await this._createModifiedWebview(generateUuid(), this._model.modified.viewType, this._model.modified.resource);
    if (this._modifiedWebview) {
      this._modifiedResourceDisposableStore.add(this._modifiedWebview);
    }
    await this.updateLayout(this._layoutCancellationTokenSource.token, options?.cellSelections ? cellRangesToIndexes(options.cellSelections) : void 0);
  }
  setVisible(visible) {
    super.setVisible(visible);
    if (!visible) {
      this.inlineDiffWidget?.hide();
    }
  }
  _detachModel() {
    this._localStore.clear();
    this._originalWebview?.dispose();
    this._originalWebview?.element.remove();
    this._originalWebview = null;
    this._modifiedWebview?.dispose();
    this._modifiedWebview?.element.remove();
    this._modifiedWebview = null;
    this.notebookDiffViewModel?.dispose();
    this.notebookDiffViewModel = void 0;
    this._modifiedResourceDisposableStore.clear();
    this._list.clear();
  }
  _attachModel(model) {
    this._model = model;
    this._eventDispatcher = new NotebookDiffEditorEventDispatcher();
    const updateInsets = () => {
      DOM.scheduleAtNextAnimationFrame(this.window, () => {
        if (this._isDisposed) {
          return;
        }
        if (this._modifiedWebview) {
          this._updateOutputsOffsetsInWebview(this._list.scrollTop, this._list.scrollHeight, this._modifiedWebview, (diffElement) => {
            return diffElement.modified;
          }, DiffSide.Modified);
        }
        if (this._originalWebview) {
          this._updateOutputsOffsetsInWebview(this._list.scrollTop, this._list.scrollHeight, this._originalWebview, (diffElement) => {
            return diffElement.original;
          }, DiffSide.Original);
        }
      });
    };
    this._localStore.add(this._list.onDidChangeContentHeight(() => {
      updateInsets();
    }));
    this._localStore.add(this._list.onDidChangeFocus((e) => {
      if (e.indexes.length && this.notebookDiffViewModel && e.indexes[0] < this.notebookDiffViewModel.items.length) {
        const selectedItem = this.notebookDiffViewModel.items[e.indexes[0]];
        const changedItems = this.notebookDiffViewModel.items.filter((item) => item.type !== "unchanged" && item.type !== "unchangedMetadata" && item.type !== "placeholder");
        if (selectedItem && selectedItem?.type !== "placeholder" && selectedItem?.type !== "unchanged" && selectedItem?.type !== "unchangedMetadata") {
          return this._currentChangedIndex.set(changedItems.indexOf(selectedItem), void 0);
        }
      }
      return this._currentChangedIndex.set(-1, void 0);
    }));
    this._localStore.add(this._eventDispatcher.onDidChangeCellLayout(() => {
      updateInsets();
    }));
    const vm = this.notebookDiffViewModel = this._register(new NotebookDiffViewModel(this._model, this.notebookEditorWorkerService, this.configurationService, this._eventDispatcher, this.notebookService, this.diffEditorCalcuator, this.fontInfo, void 0));
    this._localStore.add(this.notebookDiffViewModel.onDidChangeItems((e) => {
      this._originalWebview?.removeInsets([...this._originalWebview?.insetMapping.keys()]);
      this._modifiedWebview?.removeInsets([...this._modifiedWebview?.insetMapping.keys()]);
      if (this._revealFirst && typeof e.firstChangeIndex === "number" && e.firstChangeIndex > -1 && e.firstChangeIndex < this._list.length) {
        this._revealFirst = false;
        this._list.setFocus([e.firstChangeIndex]);
        this._list.reveal(e.firstChangeIndex, 0.3);
      }
      this._list.splice(e.start, e.deleteCount, e.elements);
      if (this.isOverviewRulerEnabled()) {
        this._overviewRuler.updateViewModels(vm.items, this._eventDispatcher);
      }
    }));
  }
  async _createModifiedWebview(id, viewType, resource) {
    this._modifiedWebview?.dispose();
    this._modifiedWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
      ...this._notebookOptions.computeDiffWebviewOptions(),
      fontFamily: this._generateFontFamily()
    }, void 0);
    this._list.rowsContainer.insertAdjacentElement("afterbegin", this._modifiedWebview.element);
    this._modifiedWebview.createWebview(this.window);
    this._modifiedWebview.element.style.width = `calc(50% - 16px)`;
    this._modifiedWebview.element.style.left = `calc(50%)`;
  }
  _generateFontFamily() {
    return this.fontInfo.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
  }
  async _createOriginalWebview(id, viewType, resource) {
    this._originalWebview?.dispose();
    this._originalWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
      ...this._notebookOptions.computeDiffWebviewOptions(),
      fontFamily: this._generateFontFamily()
    }, void 0);
    this._list.rowsContainer.insertAdjacentElement("afterbegin", this._originalWebview.element);
    this._originalWebview.createWebview(this.window);
    this._originalWebview.element.style.width = `calc(50% - 16px)`;
    this._originalWebview.element.style.left = `16px`;
  }
  setOptions(options) {
    const selections = options?.cellSelections ? cellRangesToIndexes(options.cellSelections) : void 0;
    if (selections) {
      this._list.setFocus(selections);
    }
  }
  async updateLayout(token, selections) {
    if (!this._model || !this.notebookDiffViewModel) {
      return;
    }
    await this.notebookDiffViewModel.computeDiff(token);
    if (token.isCancellationRequested) {
      return;
    }
    if (selections) {
      this._list.setFocus(selections);
    }
  }
  scheduleOutputHeightAck(cellInfo, outputId, height) {
    const diffElement = cellInfo.diffElement;
    let diffSide = DiffSide.Original;
    if (diffElement instanceof SideBySideDiffElementViewModel) {
      const info = CellUri.parse(cellInfo.cellUri);
      if (!info) {
        return;
      }
      diffSide = info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified;
    } else {
      diffSide = diffElement.type === "insert" ? DiffSide.Modified : DiffSide.Original;
    }
    const webview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
    DOM.scheduleAtNextAnimationFrame(this.window, () => {
      webview?.ackHeight([{ cellId: cellInfo.cellId, outputId, height }]);
    }, 10);
  }
  layoutNotebookCell(cell, height) {
    const relayout = (cell2, height2) => {
      this._list.updateElementHeight2(cell2, height2);
    };
    let disposable = this.pendingLayouts.get(cell);
    if (disposable) {
      this._localStore.delete(disposable);
    }
    let r;
    const layoutDisposable = DOM.scheduleAtNextAnimationFrame(this.window, () => {
      this.pendingLayouts.delete(cell);
      relayout(cell, height);
      r();
    });
    disposable = toDisposable(() => {
      layoutDisposable.dispose();
      r();
    });
    this._localStore.add(disposable);
    this.pendingLayouts.set(cell, disposable);
    return new Promise((resolve) => {
      r = resolve;
    });
  }
  setScrollTop(scrollTop) {
    this._list.scrollTop = scrollTop;
  }
  triggerScroll(event) {
    this._list.triggerScrollFromMouseWheelEvent(event);
  }
  firstChange() {
    if (!this.notebookDiffViewModel) {
      return;
    }
    const currentViewModels = this.notebookDiffViewModel.items;
    const index = currentViewModels.findIndex((vm) => vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder");
    if (index >= 0) {
      this._list.setFocus([index]);
      this._list.reveal(index);
    }
  }
  lastChange() {
    if (!this.notebookDiffViewModel) {
      return;
    }
    const currentViewModels = this.notebookDiffViewModel.items;
    const item = currentViewModels.slice().reverse().find((vm) => vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder");
    const index = item ? currentViewModels.indexOf(item) : -1;
    if (index >= 0) {
      this._list.setFocus([index]);
      this._list.reveal(index);
    }
  }
  previousChange() {
    if (!this.notebookDiffViewModel) {
      return;
    }
    let currFocus = this._list.getFocus()[0];
    if (isNaN(currFocus) || currFocus < 0) {
      currFocus = 0;
    }
    let prevChangeIndex = currFocus - 1;
    const currentViewModels = this.notebookDiffViewModel.items;
    while (prevChangeIndex >= 0) {
      const vm = currentViewModels[prevChangeIndex];
      if (vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder") {
        break;
      }
      prevChangeIndex--;
    }
    if (prevChangeIndex >= 0) {
      this._list.setFocus([prevChangeIndex]);
      this._list.reveal(prevChangeIndex);
    } else {
      const index = currentViewModels.findLastIndex((vm) => vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder");
      if (index >= 0) {
        this._list.setFocus([index]);
        this._list.reveal(index);
      }
    }
  }
  nextChange() {
    if (!this.notebookDiffViewModel) {
      return;
    }
    let currFocus = this._list.getFocus()[0];
    if (isNaN(currFocus) || currFocus < 0) {
      currFocus = 0;
    }
    let nextChangeIndex = currFocus + 1;
    const currentViewModels = this.notebookDiffViewModel.items;
    while (nextChangeIndex < currentViewModels.length) {
      const vm = currentViewModels[nextChangeIndex];
      if (vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder") {
        break;
      }
      nextChangeIndex++;
    }
    if (nextChangeIndex < currentViewModels.length) {
      this._list.setFocus([nextChangeIndex]);
      this._list.reveal(nextChangeIndex);
    } else {
      const index = currentViewModels.findIndex((vm) => vm.type !== "unchanged" && vm.type !== "unchangedMetadata" && vm.type !== "placeholder");
      if (index >= 0) {
        this._list.setFocus([index]);
        this._list.reveal(index);
      }
    }
  }
  createOutput(cellDiffViewModel, cellViewModel, output, getOffset, diffSide) {
    this._insetModifyQueueByOutputId.queue(output.source.model.outputId + (diffSide === DiffSide.Modified ? "-right" : "left"), async () => {
      const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
      if (!activeWebview) {
        return;
      }
      if (!activeWebview.insetMapping.has(output.source)) {
        const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
        await activeWebview.createOutput({ diffElement: cellDiffViewModel, cellHandle: cellViewModel.handle, cellId: cellViewModel.id, cellUri: cellViewModel.uri }, output, cellTop, getOffset());
      } else {
        const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
        const outputIndex = cellViewModel.outputsViewModels.indexOf(output.source);
        const outputOffset = cellDiffViewModel.getOutputOffsetInCell(diffSide, outputIndex);
        activeWebview.updateScrollTops([{
          cell: cellViewModel,
          output: output.source,
          cellTop,
          outputOffset,
          forceDisplay: true
        }], []);
      }
    });
  }
  updateMarkupCellHeight() {
  }
  getCellByInfo(cellInfo) {
    return cellInfo.diffElement.getCellByUri(cellInfo.cellUri);
  }
  getCellById(cellId) {
    throw new Error("Not implemented");
  }
  removeInset(cellDiffViewModel, cellViewModel, displayOutput, diffSide) {
    this._insetModifyQueueByOutputId.queue(displayOutput.model.outputId + (diffSide === DiffSide.Modified ? "-right" : "left"), async () => {
      const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
      if (!activeWebview) {
        return;
      }
      if (!activeWebview.insetMapping.has(displayOutput)) {
        return;
      }
      activeWebview.removeInsets([displayOutput]);
    });
  }
  showInset(cellDiffViewModel, cellViewModel, displayOutput, diffSide) {
    this._insetModifyQueueByOutputId.queue(displayOutput.model.outputId + (diffSide === DiffSide.Modified ? "-right" : "left"), async () => {
      const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
      if (!activeWebview) {
        return;
      }
      if (!activeWebview.insetMapping.has(displayOutput)) {
        return;
      }
      const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
      const outputIndex = cellViewModel.outputsViewModels.indexOf(displayOutput);
      const outputOffset = cellDiffViewModel.getOutputOffsetInCell(diffSide, outputIndex);
      activeWebview.updateScrollTops([{
        cell: cellViewModel,
        output: displayOutput,
        cellTop,
        outputOffset,
        forceDisplay: true
      }], []);
    });
  }
  hideInset(cellDiffViewModel, cellViewModel, output) {
    this._modifiedWebview?.hideInset(output);
    this._originalWebview?.hideInset(output);
  }
  // private async _resolveWebview(rightEditor: boolean): Promise<BackLayerWebView | null> {
  // 	if (rightEditor) {
  // 	}
  // }
  getDomNode() {
    return this._rootElement;
  }
  getOverflowContainerDomNode() {
    return this._overflowContainer;
  }
  getControl() {
    return this;
  }
  clearInput() {
    this.inlineDiffWidget?.hide();
    super.clearInput();
    this._modifiedResourceDisposableStore.clear();
    this._list?.splice(0, this._list?.length || 0);
    this._model = null;
    this.notebookDiffViewModel?.dispose();
    this.notebookDiffViewModel = void 0;
  }
  deltaCellOutputContainerClassNames(diffSide, cellId, added, removed) {
    if (diffSide === DiffSide.Original) {
      this._originalWebview?.deltaCellOutputContainerClassNames(cellId, added, removed);
    } else {
      this._modifiedWebview?.deltaCellOutputContainerClassNames(cellId, added, removed);
    }
  }
  getLayoutInfo() {
    if (!this._list) {
      throw new Error("Editor is not initalized successfully");
    }
    return {
      width: this._dimension.width,
      height: this._dimension.height,
      fontInfo: this.fontInfo,
      scrollHeight: this._list?.getScrollHeight() ?? 0,
      stickyHeight: 0,
      listViewOffsetTop: 0
    };
  }
  layout(dimension, position) {
    this._rootElement.classList.toggle("mid-width", dimension.width < 1e3 && dimension.width >= 600);
    this._rootElement.classList.toggle("narrow-width", dimension.width < 600);
    const overviewRulerEnabled = this.isOverviewRulerEnabled();
    this._dimension = dimension.with(dimension.width - (overviewRulerEnabled ? NotebookTextDiffEditor.ENTIRE_DIFF_OVERVIEW_WIDTH : 0));
    this._listViewContainer.style.height = `${dimension.height}px`;
    this._listViewContainer.style.width = `${this._dimension.width}px`;
    if (this._inlineView) {
      this._listViewContainer.style.display = "none";
      this.inlineDiffWidget?.setLayout(dimension, position);
    } else {
      this.inlineDiffWidget?.hide();
      this._listViewContainer.style.display = "block";
      this._list?.layout(this._dimension.height, this._dimension.width);
      if (this._modifiedWebview) {
        this._modifiedWebview.element.style.width = `calc(50% - 16px)`;
        this._modifiedWebview.element.style.left = `calc(50%)`;
      }
      if (this._originalWebview) {
        this._originalWebview.element.style.width = `calc(50% - 16px)`;
        this._originalWebview.element.style.left = `16px`;
      }
      if (this._webviewTransparentCover) {
        this._webviewTransparentCover.style.height = `${this._dimension.height}px`;
        this._webviewTransparentCover.style.width = `${this._dimension.width}px`;
      }
      if (overviewRulerEnabled) {
        this._overviewRuler.layout();
      }
    }
    this._lastLayoutProperties = { dimension, position };
    this._eventDispatcher?.emit([new NotebookDiffLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
  }
  dispose() {
    this._isDisposed = true;
    this._layoutCancellationTokenSource?.dispose();
    this._detachModel();
    super.dispose();
  }
};
NotebookTextDiffEditor.ENTIRE_DIFF_OVERVIEW_WIDTH = 30;
NotebookTextDiffEditor.ID = NOTEBOOK_DIFF_EDITOR_ID;
NotebookTextDiffEditor = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, INotebookEditorWorkerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, INotebookService),
  __decorateParam(9, IEditorService)
], NotebookTextDiffEditor);
registerZIndex(ZIndex.Base, 10, "notebook-diff-view-viewport-slider");
registerThemingParticipant((theme, collector) => {
  const diffDiagonalFillColor = theme.getColor(diffDiagonalFill);
  collector.addRule(`
	.notebook-text-diff-editor .diagonal-fill {
		background-image: linear-gradient(
			-45deg,
			${diffDiagonalFillColor} 12.5%,
			#0000 12.5%, #0000 50%,
			${diffDiagonalFillColor} 50%, ${diffDiagonalFillColor} 62.5%,
			#0000 62.5%, #0000 100%
		);
		background-size: 8px 8px;
	}
	`);
  collector.addRule(`.notebook-text-diff-editor .cell-body { margin: ${DIFF_CELL_MARGIN}px; }`);
  collector.addRule(`.notebook-text-diff-editor .cell-placeholder-body { margin: ${DIFF_CELL_MARGIN}px 0; }`);
});
export {
  NotebookTextDiffEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxub3RlYm9va0RpZmZFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbiwgRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQsIElFZGl0b3JPcGVuQ29udGV4dCwgSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiwgSUVkaXRvclBhbmVTZWxlY3Rpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIElFZGl0b3JQYW5lV2l0aFNjcm9sbGluZywgSUVkaXRvclBhbmVXaXRoU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0Tm90ZWJvb2tDcmVhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UsIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UsIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB9IGZyb20gJy4vZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDZWxsRGlmZlBsYWNlaG9sZGVyUmVuZGVyZXIsIENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlcmVyLCBDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJlciwgTm90ZWJvb2tDZWxsVGV4dERpZmZMaXN0RGVsZWdhdGUsIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YURpZmZSZW5kZXJlciwgTm90ZWJvb2tUZXh0RGlmZkxpc3QgfSBmcm9tICcuL25vdGVib29rRGlmZkxpc3QuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBkaWZmRGlhZ29uYWxGaWxsLCBlZGl0b3JCYWNrZ3JvdW5kLCBmb2N1c0JvcmRlciwgZm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgYXMgSUNvZGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvRnJvbVNldHRpbmdzLmpzJztcbmltcG9ydCB7IFBpeGVsUmF0aW8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvcGl4ZWxSYXRpby5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgSURpc3BsYXlPdXRwdXRMYXlvdXRVcGRhdGVSZXF1ZXN0LCBJR2VuZXJpY0NlbGxWaWV3TW9kZWwsIElJbnNldFJlbmRlck91dHB1dCwgSU5vdGVib29rRWRpdG9yQ3JlYXRpb25PcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IERpZmZTaWRlLCBESUZGX0NFTExfTUFSR0lOLCBJRGlmZkNlbGxJbmZvLCBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvciwgSU5vdGVib29rRGlmZlZpZXdNb2RlbCB9IGZyb20gJy4vbm90ZWJvb2tEaWZmRWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJTm90ZWJvb2tEaWZmRWRpdG9yTW9kZWwsIE5PVEVCT09LX0RJRkZfRURJVE9SX0lELCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50LCBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBEaWZmTmVzdGVkQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4vZGlmZk5lc3RlZENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQmFja0xheWVyV2ViVmlldywgSU5vdGVib29rRGVsZWdhdGVGb3JXZWJ2aWV3IH0gZnJvbSAnLi4vdmlldy9yZW5kZXJlcnMvYmFja0xheWVyV2ViVmlldy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsIE5vdGVib29rRGlmZkxheW91dENoYW5nZWRFdmVudCB9IGZyb20gJy4vZXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IEZvbnRNZWFzdXJlbWVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZm9udE1lYXN1cmVtZW50cy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va09wdGlvbnMgfSBmcm9tICcuLi9ub3RlYm9va09wdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tMYXlvdXRJbmZvIH0gZnJvbSAnLi4vbm90ZWJvb2tWaWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgY2VsbEluZGV4ZXNUb1JhbmdlcywgY2VsbFJhbmdlc1RvSW5kZXhlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZk92ZXJ2aWV3UnVsZXIgfSBmcm9tICcuL25vdGVib29rRGlmZk92ZXJ2aWV3UnVsZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJaSW5kZXgsIFpJbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL3pJbmRleFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZlZpZXdNb2RlbCB9IGZyb20gJy4vbm90ZWJvb2tEaWZmVmlld01vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZSwgSURpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZSB9IGZyb20gJy4vZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0lubGluZURpZmZXaWRnZXQgfSBmcm9tICcuL2lubGluZURpZmYvbm90ZWJvb2tJbmxpbmVEaWZmV2lkZ2V0LmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jbGFzcyBOb3RlYm9va0RpZmZFZGl0b3JTZWxlY3Rpb24gaW1wbGVtZW50cyBJRWRpdG9yUGFuZVNlbGVjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb25zOiBudW1iZXJbXVxuXHQpIHsgfVxuXG5cdGNvbXBhcmUob3RoZXI6IElFZGl0b3JQYW5lU2VsZWN0aW9uKTogRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgTm90ZWJvb2tEaWZmRWRpdG9yU2VsZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LkRJRkZFUkVOVDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWxlY3Rpb25zLmxlbmd0aCAhPT0gb3RoZXIuc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5ESUZGRVJFTlQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNlbGVjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLnNlbGVjdGlvbnNbaV0gIT09IG90aGVyLnNlbGVjdGlvbnNbaV0pIHtcblx0XHRcdFx0cmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LkRJRkZFUkVOVDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuSURFTlRJQ0FMO1xuXHR9XG5cblx0cmVzdG9yZShvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyk6IElOb3RlYm9va0VkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IG5vdGVib29rT3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdGNlbGxTZWxlY3Rpb25zOiBjZWxsSW5kZXhlc1RvUmFuZ2VzKHRoaXMuc2VsZWN0aW9ucylcblx0XHR9O1xuXG5cdFx0T2JqZWN0LmFzc2lnbihub3RlYm9va09wdGlvbnMsIG9wdGlvbnMpO1xuXHRcdHJldHVybiBub3RlYm9va09wdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rVGV4dERpZmZFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIGltcGxlbWVudHMgSU5vdGVib29rVGV4dERpZmZFZGl0b3IsIElOb3RlYm9va0RlbGVnYXRlRm9yV2VidmlldywgSUVkaXRvclBhbmVXaXRoU2VsZWN0aW9uLCBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVOVElSRV9ESUZGX09WRVJWSUVXX1dJRFRIID0gMzA7XG5cdGNyZWF0aW9uT3B0aW9uczogSU5vdGVib29rRWRpdG9yQ3JlYXRpb25PcHRpb25zID0gZ2V0RGVmYXVsdE5vdGVib29rQ3JlYXRpb25PcHRpb25zKCk7XG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gTk9URUJPT0tfRElGRl9FRElUT1JfSUQ7XG5cblx0cHJpdmF0ZSBfcm9vdEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbGlzdFZpZXdDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfb3ZlcmZsb3dDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfb3ZlcnZpZXdSdWxlckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9vdmVydmlld1J1bGVyITogTm90ZWJvb2tEaWZmT3ZlcnZpZXdSdWxlcjtcblx0cHJpdmF0ZSBfZGltZW5zaW9uOiBET00uRGltZW5zaW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIG5vdGVib29rRGlmZlZpZXdNb2RlbD86IElOb3RlYm9va0RpZmZWaWV3TW9kZWw7XG5cdHByaXZhdGUgX2xpc3QhOiBOb3RlYm9va1RleHREaWZmTGlzdDtcblx0cHJpdmF0ZSBfbW9kaWZpZWRXZWJ2aWV3OiBCYWNrTGF5ZXJXZWJWaWV3PElEaWZmQ2VsbEluZm8+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX29yaWdpbmFsV2VidmlldzogQmFja0xheWVyV2ViVmlldzxJRGlmZkNlbGxJbmZvPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF93ZWJ2aWV3VHJhbnNwYXJlbnRDb3ZlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZm9udEluZm86IEZvbnRJbmZvIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbmxpbmVWaWV3ID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhc3RMYXlvdXRQcm9wZXJ0aWVzOiB7IGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbjsgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24gfSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlVXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGV2ZW50OiBNb3VzZUV2ZW50OyByZWFkb25seSB0YXJnZXQ6IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlVXAgPSB0aGlzLl9vbk1vdXNlVXAuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2Nyb2xsOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjcm9sbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblx0cHJpdmF0ZSBfZXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBfc2NvcGVDb250ZXh0S2V5U2VydmljZSE6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBfbW9kZWw6IElOb3RlYm9va0RpZmZFZGl0b3JNb2RlbCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZFZGl0b3JDYWxjdWF0b3I6IElEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkUmVzb3VyY2VEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGlubGluZURpZmZXaWRnZXQ6IE5vdGVib29rSW5saW5lRGlmZldpZGdldCB8IHVuZGVmaW5lZDtcblxuXHRnZXQgdGV4dE1vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbD8ubW9kaWZpZWQubm90ZWJvb2s7XG5cdH1cblxuXHRnZXQgaW5saW5lTm90ZWJvb2tFZGl0b3IoKSB7XG5cdFx0aWYgKHRoaXMuX2lubGluZVZpZXcpIHtcblx0XHRcdHJldHVybiB0aGlzLmlubGluZURpZmZXaWRnZXQ/LmVkaXRvcldpZGdldDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbEZpcnN0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnNldE1vZGlmeVF1ZXVlQnlPdXRwdXRJZCA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cblx0cHJvdGVjdGVkIF9vbkRpZER5bmFtaWNPdXRwdXRSZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY2VsbDogSUdlbmVyaWNDZWxsVmlld01vZGVsOyBvdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsIH0+KCkpO1xuXHRvbkRpZER5bmFtaWNPdXRwdXRSZW5kZXJlZCA9IHRoaXMuX29uRGlkRHluYW1pY091dHB1dFJlbmRlcmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rT3B0aW9uczogTm90ZWJvb2tPcHRpb25zO1xuXG5cdGdldCBub3RlYm9va09wdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rT3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgX2xheW91dENhbmNlbGxhdGlvblRva2VuU291cmNlPzogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IGlzRGlzcG9zZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGlzcG9zZWQ7XG5cdH1cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudENoYW5nZWRJbmRleCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAtMSk7XG5cdHJlYWRvbmx5IGN1cnJlbnRDaGFuZ2VkSW5kZXg6IElPYnNlcnZhYmxlPG51bWJlcj4gPSB0aGlzLl9jdXJyZW50Q2hhbmdlZEluZGV4O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKE5vdGVib29rVGV4dERpZmZFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLmRpZmZFZGl0b3JDYWxjdWF0b3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZSwgdGhpcy5mb250SW5mby5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLl9ub3RlYm9va09wdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va09wdGlvbnMsIHRoaXMud2luZG93LCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va09wdGlvbnMpO1xuXHRcdHRoaXMuX3JldmVhbEZpcnN0ID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGZvbnRJbmZvKCkge1xuXHRcdGlmICghdGhpcy5fZm9udEluZm8pIHtcblx0XHRcdHRoaXMuX2ZvbnRJbmZvID0gdGhpcy5jcmVhdGVGb250SW5mbygpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9mb250SW5mbztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRm9udEluZm8oKSB7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUNvZGVFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0cmV0dXJuIEZvbnRNZWFzdXJlbWVudHMucmVhZEZvbnRJbmZvKHRoaXMud2luZG93LCBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MoZWRpdG9yT3B0aW9ucywgUGl4ZWxSYXRpby5nZXRJbnN0YW5jZSh0aGlzLndpbmRvdykudmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgaXNPdmVydmlld1J1bGVyRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuZGlmZk92ZXJ2aWV3UnVsZXIpID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IElFZGl0b3JQYW5lU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdHJldHVybiBuZXcgTm90ZWJvb2tEaWZmRWRpdG9yU2VsZWN0aW9uKHNlbGVjdGlvbnMpO1xuXHR9XG5cblx0dG9nZ2xlTm90ZWJvb2tDZWxsU2VsZWN0aW9uKGNlbGw6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCkge1xuXHRcdC8vIHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHVwZGF0ZVBlcmZvcm1hbmNlTWV0YWRhdGEoY2VsbElkOiBzdHJpbmcsIGV4ZWN1dGlvbklkOiBzdHJpbmcsIGR1cmF0aW9uOiBudW1iZXIsIHJlbmRlcmVySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzTm90ZWJvb2tDZWxsKGNlbGw6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCwgZm9jdXM6ICdvdXRwdXQnIHwgJ2VkaXRvcicgfCAnY29udGFpbmVyJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzTmV4dE5vdGVib29rQ2VsbChjZWxsOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwsIGZvY3VzOiAnb3V0cHV0JyB8ICdlZGl0b3InIHwgJ2NvbnRhaW5lcicpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRkaWRGb2N1c091dHB1dElucHV0Q2hhbmdlKGlucHV0Rm9jdXNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGdldFNjcm9sbFRvcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdD8uc2Nyb2xsVG9wID8/IDA7XG5cdH1cblxuXHRnZXRTY3JvbGxIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3Q/LnNjcm9sbEhlaWdodCA/PyAwO1xuXHR9XG5cblx0Z2V0U2Nyb2xsUG9zaXRpb24oKTogSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbFRvcDogdGhpcy5nZXRTY3JvbGxUb3AoKSxcblx0XHRcdHNjcm9sbExlZnQ6IHRoaXMuX2xpc3Q/LnNjcm9sbExlZnQgPz8gMFxuXHRcdH07XG5cdH1cblxuXHRzZXRTY3JvbGxQb3NpdGlvbihzY3JvbGxQb3NpdGlvbjogSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9wID0gc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wO1xuXHRcdGlmIChzY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2xpc3Quc2Nyb2xsTGVmdCA9IHNjcm9sbFBvc2l0aW9uLnNjcm9sbExlZnQ7XG5cdFx0fVxuXHR9XG5cblx0ZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KSB7XG5cdFx0dGhpcy5fbGlzdD8uZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHR1cGRhdGVPdXRwdXRIZWlnaHQoY2VsbEluZm86IElEaWZmQ2VsbEluZm8sIG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIG91dHB1dEhlaWdodDogbnVtYmVyLCBpc0luaXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmRWxlbWVudCA9IGNlbGxJbmZvLmRpZmZFbGVtZW50O1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldENlbGxCeUluZm8oY2VsbEluZm8pO1xuXHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKG91dHB1dCk7XG5cblx0XHRpZiAoZGlmZkVsZW1lbnQgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IGluZm8gPSBDZWxsVXJpLnBhcnNlKGNlbGxJbmZvLmNlbGxVcmkpO1xuXHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZGlmZkVsZW1lbnQudXBkYXRlT3V0cHV0SGVpZ2h0KGluZm8ubm90ZWJvb2sudG9TdHJpbmcoKSA9PT0gdGhpcy5fbW9kZWw/Lm9yaWdpbmFsLnJlc291cmNlLnRvU3RyaW5nKCkgPyBEaWZmU2lkZS5PcmlnaW5hbCA6IERpZmZTaWRlLk1vZGlmaWVkLCBvdXRwdXRJbmRleCwgb3V0cHV0SGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlmZkVsZW1lbnQudXBkYXRlT3V0cHV0SGVpZ2h0KGRpZmZFbGVtZW50LnR5cGUgPT09ICdpbnNlcnQnID8gRGlmZlNpZGUuTW9kaWZpZWQgOiBEaWZmU2lkZS5PcmlnaW5hbCwgb3V0cHV0SW5kZXgsIG91dHB1dEhlaWdodCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzSW5pdCkge1xuXHRcdFx0dGhpcy5fb25EaWREeW5hbWljT3V0cHV0UmVuZGVyZWQuZmlyZSh7IGNlbGwsIG91dHB1dCB9KTtcblx0XHR9XG5cdH1cblxuXHRzZXRNYXJrdXBDZWxsRWRpdFN0YXRlKGNlbGxJZDogc3RyaW5nLCBlZGl0U3RhdGU6IENlbGxFZGl0U3RhdGUpOiB2b2lkIHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlkU3RhcnREcmFnTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZywgZXZlbnQ6IHsgZHJhZ09mZnNldFk6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0Ly8gdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGRpZERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlkRW5kRHJhZ01hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlkRHJvcE1hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcpIHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlkUmVzaXplT3V0cHV0KGNlbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlSW5saW5lVmlldygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5faW5saW5lVmlldyA9ICF0aGlzLl9pbmxpbmVWaWV3O1xuXG5cdFx0aWYgKCF0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pbmxpbmVWaWV3KSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcz8uZGltZW5zaW9uLCB0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcz8ucG9zaXRpb24pO1xuXHRcdFx0dGhpcy5pbmxpbmVEaWZmV2lkZ2V0Py5zaG93KHRoaXMuaW5wdXQgYXMgTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQsIHRoaXMuX21vZGVsPy5tb2RpZmllZC5ub3RlYm9vaywgdGhpcy5fbW9kZWw/Lm9yaWdpbmFsLm5vdGVib29rLCB0aGlzLl9vcHRpb25zIGFzIElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcz8uZGltZW5zaW9uLCB0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcz8ucG9zaXRpb24pO1xuXHRcdFx0dGhpcy5pbmxpbmVEaWZmV2lkZ2V0Py5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGF5b3V0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnVwZGF0ZUxheW91dCh0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290RWxlbWVudCA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnLm5vdGVib29rLXRleHQtZGlmZi1lZGl0b3InKSk7XG5cdFx0dGhpcy5fb3ZlcmZsb3dDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9vdmVyZmxvd0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1vdmVyZmxvdy13aWRnZXQtY29udGFpbmVyJywgJ21vbmFjby1lZGl0b3InKTtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5fb3ZlcmZsb3dDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZXJzID0gW1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsRGlmZlNpbmdsZVNpZGVSZW5kZXJlciwgdGhpcyksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxEaWZmU2lkZUJ5U2lkZVJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbERpZmZQbGFjZWhvbGRlclJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhRGlmZlJlbmRlcmVyLCB0aGlzKSxcblx0XHRdO1xuXG5cdFx0dGhpcy5fbGlzdFZpZXdDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX3Jvb3RFbGVtZW50LCBET00uJCgnLm5vdGVib29rLWRpZmYtbGlzdC12aWV3JykpO1xuXG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHROb3RlYm9va1RleHREaWZmTGlzdCxcblx0XHRcdCdOb3RlYm9va1RleHREaWZmJyxcblx0XHRcdHRoaXMuX2xpc3RWaWV3Q29udGFpbmVyLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NlbGxUZXh0RGlmZkxpc3REZWxlZ2F0ZSwgdGhpcy53aW5kb3cpLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0hlaWdodDogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogdHJ1ZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdG1vdXNlU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0dHlwZU5hdmlnYXRpb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRwYWRkaW5nQm90dG9tOiAwLFxuXHRcdFx0XHQvLyB0cmFuc2Zvcm1PcHRpbWl6YXRpb246IChpc01hY2ludG9zaCAmJiBpc05hdGl2ZSkgfHwgZ2V0VGl0bGVCYXJTdHlsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkgPT09ICduYXRpdmUnLFxuXHRcdFx0XHRzdHlsZUNvbnRyb2xsZXI6IChfc3VmZml4OiBzdHJpbmcpID0+IHsgcmV0dXJuIHRoaXMuX2xpc3Q7IH0sXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0JhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RIb3ZlckJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEhvdmVyT3V0bGluZTogZm9jdXNCb3JkZXIsXG5cdFx0XHRcdFx0bGlzdEZvY3VzT3V0bGluZTogZm9jdXNCb3JkZXIsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbCgpIHsgcmV0dXJuIG51bGw7IH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tUcmVlQXJpYUxhYmVsJywgXCJOb3RlYm9vayBUZXh0IERpZmZcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBmb2N1c05leHRQcmV2aW91c0RlbGVnYXRlOiB7XG5cdFx0XHRcdC8vIFx0b25Gb2N1c05leHQ6IChhcHBseUZvY3VzTmV4dDogKCkgPT4gdm9pZCkgPT4gdGhpcy5fdXBkYXRlRm9yQ3Vyc29yTmF2aWdhdGlvbk1vZGUoYXBwbHlGb2N1c05leHQpLFxuXHRcdFx0XHQvLyBcdG9uRm9jdXNQcmV2aW91czogKGFwcGx5Rm9jdXNQcmV2aW91czogKCkgPT4gdm9pZCkgPT4gdGhpcy5fdXBkYXRlRm9yQ3Vyc29yTmF2aWdhdGlvbk1vZGUoYXBwbHlGb2N1c1ByZXZpb3VzKSxcblx0XHRcdFx0Ly8gfVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR0aGlzLmlubGluZURpZmZXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rSW5saW5lRGlmZldpZGdldCwgdGhpcy5fcm9vdEVsZW1lbnQsIHRoaXMuZ3JvdXAuaWQsIHRoaXMud2luZG93LCB0aGlzLm5vdGVib29rT3B0aW9ucywgdGhpcy5fZGltZW5zaW9uKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VVcChlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBlLmluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2UuaW5kZXhdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbk1vdXNlVXAuZmlyZSh7IGV2ZW50OiBlLmJyb3dzZXJFdmVudCwgdGFyZ2V0OiBlLmVsZW1lbnQgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb246IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uVVNFUiB9KSkpO1xuXG5cdFx0dGhpcy5fb3ZlcnZpZXdSdWxlckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX292ZXJ2aWV3UnVsZXJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbm90ZWJvb2stb3ZlcnZpZXctcnVsZXItY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fb3ZlcnZpZXdSdWxlckNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXJPdmVydmlld1J1bGVyKCk7XG5cblx0XHQvLyB0cmFuc3BhcmVudCBjb3ZlclxuXHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyID0gRE9NLmFwcGVuZCh0aGlzLl9saXN0LnJvd3NDb250YWluZXIsICQoJy53ZWJ2aWV3LWNvdmVyJykpO1xuXHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHRoaXMuX292ZXJmbG93Q29udGFpbmVyLCAoZTogU3RhbmRhcmRNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdzbGlkZXInKSAmJiB0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlcikge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcih0aGlzLl9vdmVyZmxvd0NvbnRhaW5lciwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyKSB7XG5cdFx0XHRcdC8vIG5vIG1hdHRlciB3aGVuXG5cdFx0XHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZFNjcm9sbChlID0+IHtcblx0XHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyIS5zdHlsZS50b3AgPSBgJHtlLnNjcm9sbFRvcH1weGA7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJPdmVydmlld1J1bGVyKCkge1xuXHRcdHRoaXMuX292ZXJ2aWV3UnVsZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRGlmZk92ZXJ2aWV3UnVsZXIsIHRoaXMsIE5vdGVib29rVGV4dERpZmZFZGl0b3IuRU5USVJFX0RJRkZfT1ZFUlZJRVdfV0lEVEgsIHRoaXMuX292ZXJ2aWV3UnVsZXJDb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU91dHB1dHNPZmZzZXRzSW5XZWJ2aWV3KHNjcm9sbFRvcDogbnVtYmVyLCBzY3JvbGxIZWlnaHQ6IG51bWJlciwgYWN0aXZlV2VidmlldzogQmFja0xheWVyV2ViVmlldzxJRGlmZkNlbGxJbmZvPiwgZ2V0QWN0aXZlTmVzdGVkQ2VsbDogKGRpZmZFbGVtZW50OiBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlKSA9PiBEaWZmTmVzdGVkQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCwgZGlmZlNpZGU6IERpZmZTaWRlKSB7XG5cdFx0YWN0aXZlV2Vidmlldy5lbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke3Njcm9sbEhlaWdodH1weGA7XG5cblx0XHRpZiAoYWN0aXZlV2Vidmlldy5pbnNldE1hcHBpbmcpIHtcblx0XHRcdGNvbnN0IHVwZGF0ZUl0ZW1zOiBJRGlzcGxheU91dHB1dExheW91dFVwZGF0ZVJlcXVlc3RbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZEl0ZW1zOiBJQ2VsbE91dHB1dFZpZXdNb2RlbFtdID0gW107XG5cdFx0XHRhY3RpdmVXZWJ2aWV3Lmluc2V0TWFwcGluZy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBnZXRBY3RpdmVOZXN0ZWRDZWxsKHZhbHVlLmNlbGxJbmZvLmRpZmZFbGVtZW50KTtcblx0XHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgdmlld0luZGV4ID0gdGhpcy5fbGlzdC5pbmRleE9mKHZhbHVlLmNlbGxJbmZvLmRpZmZFbGVtZW50KTtcblxuXHRcdFx0XHRpZiAodmlld0luZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKGtleSkgPCAwKSB7XG5cdFx0XHRcdFx0Ly8gb3V0cHV0IGlzIGFscmVhZHkgZ29uZVxuXHRcdFx0XHRcdHJlbW92ZWRJdGVtcy5wdXNoKGtleSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMuX2xpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AodmFsdWUuY2VsbEluZm8uZGlmZkVsZW1lbnQpO1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKGtleSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0T2Zmc2V0ID0gdmFsdWUuY2VsbEluZm8uZGlmZkVsZW1lbnQuZ2V0T3V0cHV0T2Zmc2V0SW5DZWxsKGRpZmZTaWRlLCBvdXRwdXRJbmRleCk7XG5cdFx0XHRcdFx0dXBkYXRlSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRjZWxsLFxuXHRcdFx0XHRcdFx0b3V0cHV0OiBrZXksXG5cdFx0XHRcdFx0XHRjZWxsVG9wOiBjZWxsVG9wLFxuXHRcdFx0XHRcdFx0b3V0cHV0T2Zmc2V0OiBvdXRwdXRPZmZzZXQsXG5cdFx0XHRcdFx0XHRmb3JjZURpc3BsYXk6IGZhbHNlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSk7XG5cblx0XHRcdGFjdGl2ZVdlYnZpZXcucmVtb3ZlSW5zZXRzKHJlbW92ZWRJdGVtcyk7XG5cblx0XHRcdGlmICh1cGRhdGVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0YWN0aXZlV2Vidmlldy51cGRhdGVTY3JvbGxUb3BzKHVwZGF0ZUl0ZW1zLCBbXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IE5vdGVib29rRGlmZkVkaXRvcklucHV0LCBvcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuaW5saW5lRGlmZldpZGdldD8uaGlkZSgpO1xuXG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdGlmICh0aGlzLl9tb2RlbCAhPT0gbW9kZWwpIHtcblx0XHRcdHRoaXMuX2RldGFjaE1vZGVsKCk7XG5cdFx0XHR0aGlzLl9hdHRhY2hNb2RlbChtb2RlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblx0XHRpZiAodGhpcy5fbW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faW5saW5lVmlldykge1xuXHRcdFx0dGhpcy5fbGlzdFZpZXdDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuaW5saW5lRGlmZldpZGdldD8uc2hvdyhpbnB1dCwgbW9kZWwubW9kaWZpZWQubm90ZWJvb2ssIG1vZGVsLm9yaWdpbmFsLm5vdGVib29rLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdFZpZXdDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHR0aGlzLmlubGluZURpZmZXaWRnZXQ/LmhpZGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXZlYWxGaXJzdCA9IHRydWU7XG5cblx0XHR0aGlzLl9tb2RpZmllZFJlc291cmNlRGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0dGhpcy5fbW9kaWZpZWRSZXNvdXJjZURpc3Bvc2FibGVTdG9yZS5hZGQoRXZlbnQuYW55KHRoaXMuX21vZGVsLm9yaWdpbmFsLm5vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudCwgdGhpcy5fbW9kZWwubW9kaWZpZWQubm90ZWJvb2sub25EaWRDaGFuZ2VDb250ZW50KShlID0+IHtcblx0XHRcdC8vIElmIHRoZSB1c2VyIGhhcyBtYWRlIGNoYW5nZXMgdG8gdGhlIG5vdGVib29rIHdoaWxzdCBpbiB0aGUgZGlmZiBlZGl0b3IsXG5cdFx0XHQvLyB0aGVuIGRvIG5vdCByZS1jb21wdXRlIHRoZSBkaWZmIG9mIHRoZSBub3RlYm9vayxcblx0XHRcdC8vIEFzIGNoYW5nZSB3aWxsIHJlc3VsdCBpbiByZS1jb21wdXRpbmcgZGlmZiBhbmQgcmUtYnVpbGRpbmcgZW50aXJlIGRpZmYgdmlldy5cblx0XHRcdGlmICh0aGlzLl9tb2RlbCAhPT0gbnVsbCAmJiB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yICE9PSBpbnB1dCkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUxheW91dCh0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgdGhpcy5fY3JlYXRlT3JpZ2luYWxXZWJ2aWV3KGdlbmVyYXRlVXVpZCgpLCB0aGlzLl9tb2RlbC5vcmlnaW5hbC52aWV3VHlwZSwgdGhpcy5fbW9kZWwub3JpZ2luYWwucmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9vcmlnaW5hbFdlYnZpZXcpIHtcblx0XHRcdHRoaXMuX21vZGlmaWVkUmVzb3VyY2VEaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX29yaWdpbmFsV2Vidmlldyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2NyZWF0ZU1vZGlmaWVkV2VidmlldyhnZW5lcmF0ZVV1aWQoKSwgdGhpcy5fbW9kZWwubW9kaWZpZWQudmlld1R5cGUsIHRoaXMuX21vZGVsLm1vZGlmaWVkLnJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fbW9kaWZpZWRXZWJ2aWV3KSB7XG5cdFx0XHR0aGlzLl9tb2RpZmllZFJlc291cmNlRGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9tb2RpZmllZFdlYnZpZXcpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGF5b3V0KHRoaXMuX2xheW91dENhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuLCBvcHRpb25zPy5jZWxsU2VsZWN0aW9ucyA/IGNlbGxSYW5nZXNUb0luZGV4ZXMob3B0aW9ucy5jZWxsU2VsZWN0aW9ucykgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuaW5saW5lRGlmZldpZGdldD8uaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RldGFjaE1vZGVsKCkge1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXc/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXc/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxXZWJ2aWV3ID0gbnVsbDtcblx0XHR0aGlzLl9tb2RpZmllZFdlYnZpZXc/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RpZmllZFdlYnZpZXc/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5fbW9kaWZpZWRXZWJ2aWV3ID0gbnVsbDtcblxuXHRcdHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9tb2RpZmllZFJlc291cmNlRGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fbGlzdC5jbGVhcigpO1xuXG5cdH1cblx0cHJpdmF0ZSBfYXR0YWNoTW9kZWwobW9kZWw6IElOb3RlYm9va0RpZmZFZGl0b3JNb2RlbCkge1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyID0gbmV3IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHVwZGF0ZUluc2V0cyA9ICgpID0+IHtcblx0XHRcdERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRoaXMud2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX21vZGlmaWVkV2Vidmlldykge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU91dHB1dHNPZmZzZXRzSW5XZWJ2aWV3KHRoaXMuX2xpc3Quc2Nyb2xsVG9wLCB0aGlzLl9saXN0LnNjcm9sbEhlaWdodCwgdGhpcy5fbW9kaWZpZWRXZWJ2aWV3LCAoZGlmZkVsZW1lbnQ6IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBkaWZmRWxlbWVudC5tb2RpZmllZDtcblx0XHRcdFx0XHR9LCBEaWZmU2lkZS5Nb2RpZmllZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fb3JpZ2luYWxXZWJ2aWV3KSB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlT3V0cHV0c09mZnNldHNJbldlYnZpZXcodGhpcy5fbGlzdC5zY3JvbGxUb3AsIHRoaXMuX2xpc3Quc2Nyb2xsSGVpZ2h0LCB0aGlzLl9vcmlnaW5hbFdlYnZpZXcsIChkaWZmRWxlbWVudDogRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRpZmZFbGVtZW50Lm9yaWdpbmFsO1xuXHRcdFx0XHRcdH0sIERpZmZTaWRlLk9yaWdpbmFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHVwZGF0ZUluc2V0cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cygoZSkgPT4ge1xuXHRcdFx0aWYgKGUuaW5kZXhlcy5sZW5ndGggJiYgdGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwgJiYgZS5pbmRleGVzWzBdIDwgdGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbSA9IHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsLml0ZW1zW2UuaW5kZXhlc1swXV07XG5cdFx0XHRcdGNvbnN0IGNoYW5nZWRJdGVtcyA9IHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsLml0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSAhPT0gJ3VuY2hhbmdlZCcgJiYgaXRlbS50eXBlICE9PSAndW5jaGFuZ2VkTWV0YWRhdGEnICYmIGl0ZW0udHlwZSAhPT0gJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRcdGlmIChzZWxlY3RlZEl0ZW0gJiYgc2VsZWN0ZWRJdGVtPy50eXBlICE9PSAncGxhY2Vob2xkZXInICYmIHNlbGVjdGVkSXRlbT8udHlwZSAhPT0gJ3VuY2hhbmdlZCcgJiYgc2VsZWN0ZWRJdGVtPy50eXBlICE9PSAndW5jaGFuZ2VkTWV0YWRhdGEnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRDaGFuZ2VkSW5kZXguc2V0KGNoYW5nZWRJdGVtcy5pbmRleE9mKHNlbGVjdGVkSXRlbSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50Q2hhbmdlZEluZGV4LnNldCgtMSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9ldmVudERpc3BhdGNoZXIub25EaWRDaGFuZ2VDZWxsTGF5b3V0KCgpID0+IHtcblx0XHRcdHVwZGF0ZUluc2V0cygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZtID0gdGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKHRoaXMuX21vZGVsLCB0aGlzLm5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fZXZlbnREaXNwYXRjaGVyISwgdGhpcy5ub3RlYm9va1NlcnZpY2UsIHRoaXMuZGlmZkVkaXRvckNhbGN1YXRvciwgdGhpcy5mb250SW5mbywgdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IHtcblx0XHRcdHRoaXMuX29yaWdpbmFsV2Vidmlldz8ucmVtb3ZlSW5zZXRzKFsuLi50aGlzLl9vcmlnaW5hbFdlYnZpZXc/Lmluc2V0TWFwcGluZy5rZXlzKCldKTtcblx0XHRcdHRoaXMuX21vZGlmaWVkV2Vidmlldz8ucmVtb3ZlSW5zZXRzKFsuLi50aGlzLl9tb2RpZmllZFdlYnZpZXc/Lmluc2V0TWFwcGluZy5rZXlzKCldKTtcblxuXHRcdFx0aWYgKHRoaXMuX3JldmVhbEZpcnN0ICYmIHR5cGVvZiBlLmZpcnN0Q2hhbmdlSW5kZXggPT09ICdudW1iZXInICYmIGUuZmlyc3RDaGFuZ2VJbmRleCA+IC0xICYmIGUuZmlyc3RDaGFuZ2VJbmRleCA8IHRoaXMuX2xpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX3JldmVhbEZpcnN0ID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2UuZmlyc3RDaGFuZ2VJbmRleF0pO1xuXHRcdFx0XHR0aGlzLl9saXN0LnJldmVhbChlLmZpcnN0Q2hhbmdlSW5kZXgsIDAuMyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKGUuc3RhcnQsIGUuZGVsZXRlQ291bnQsIGUuZWxlbWVudHMpO1xuXG5cdFx0XHRpZiAodGhpcy5pc092ZXJ2aWV3UnVsZXJFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fb3ZlcnZpZXdSdWxlci51cGRhdGVWaWV3TW9kZWxzKHZtLml0ZW1zLCB0aGlzLl9ldmVudERpc3BhdGNoZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZU1vZGlmaWVkV2VidmlldyhpZDogc3RyaW5nLCB2aWV3VHlwZTogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbW9kaWZpZWRXZWJ2aWV3Py5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9tb2RpZmllZFdlYnZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJhY2tMYXllcldlYlZpZXcsIHRoaXMsIGlkLCB2aWV3VHlwZSwgcmVzb3VyY2UsIHtcblx0XHRcdC4uLnRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlRGlmZldlYnZpZXdPcHRpb25zKCksXG5cdFx0XHRmb250RmFtaWx5OiB0aGlzLl9nZW5lcmF0ZUZvbnRGYW1pbHkoKVxuXHRcdH0sIHVuZGVmaW5lZCkgYXMgQmFja0xheWVyV2ViVmlldzxJRGlmZkNlbGxJbmZvPjtcblx0XHQvLyBhdHRhY2ggdGhlIHdlYnZpZXcgY29udGFpbmVyIHRvIHRoZSBET00gdHJlZSBmaXJzdFxuXHRcdHRoaXMuX2xpc3Qucm93c0NvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLCB0aGlzLl9tb2RpZmllZFdlYnZpZXcuZWxlbWVudCk7XG5cdFx0dGhpcy5fbW9kaWZpZWRXZWJ2aWV3LmNyZWF0ZVdlYnZpZXcodGhpcy53aW5kb3cpO1xuXHRcdHRoaXMuX21vZGlmaWVkV2Vidmlldy5lbGVtZW50LnN0eWxlLndpZHRoID0gYGNhbGMoNTAlIC0gMTZweClgO1xuXHRcdHRoaXMuX21vZGlmaWVkV2Vidmlldy5lbGVtZW50LnN0eWxlLmxlZnQgPSBgY2FsYyg1MCUpYDtcblx0fVxuXHRfZ2VuZXJhdGVGb250RmFtaWx5KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZm9udEluZm8uZm9udEZhbWlseSA/PyBgXCJTRiBNb25vXCIsIE1vbmFjbywgTWVubG8sIENvbnNvbGFzLCBcIlVidW50dSBNb25vXCIsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiRGVqYVZ1IFNhbnMgTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZWA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVPcmlnaW5hbFdlYnZpZXcoaWQ6IHN0cmluZywgdmlld1R5cGU6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29yaWdpbmFsV2Vidmlldz8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fb3JpZ2luYWxXZWJ2aWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCYWNrTGF5ZXJXZWJWaWV3LCB0aGlzLCBpZCwgdmlld1R5cGUsIHJlc291cmNlLCB7XG5cdFx0XHQuLi50aGlzLl9ub3RlYm9va09wdGlvbnMuY29tcHV0ZURpZmZXZWJ2aWV3T3B0aW9ucygpLFxuXHRcdFx0Zm9udEZhbWlseTogdGhpcy5fZ2VuZXJhdGVGb250RmFtaWx5KClcblx0XHR9LCB1bmRlZmluZWQpIGFzIEJhY2tMYXllcldlYlZpZXc8SURpZmZDZWxsSW5mbz47XG5cdFx0Ly8gYXR0YWNoIHRoZSB3ZWJ2aWV3IGNvbnRhaW5lciB0byB0aGUgRE9NIHRyZWUgZmlyc3Rcblx0XHR0aGlzLl9saXN0LnJvd3NDb250YWluZXIuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmJlZ2luJywgdGhpcy5fb3JpZ2luYWxXZWJ2aWV3LmVsZW1lbnQpO1xuXHRcdHRoaXMuX29yaWdpbmFsV2Vidmlldy5jcmVhdGVXZWJ2aWV3KHRoaXMud2luZG93KTtcblx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXcuZWxlbWVudC5zdHlsZS53aWR0aCA9IGBjYWxjKDUwJSAtIDE2cHgpYDtcblx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXcuZWxlbWVudC5zdHlsZS5sZWZ0ID0gYDE2cHhgO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IG9wdGlvbnM/LmNlbGxTZWxlY3Rpb25zID8gY2VsbFJhbmdlc1RvSW5kZXhlcyhvcHRpb25zLmNlbGxTZWxlY3Rpb25zKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhzZWxlY3Rpb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVMYXlvdXQodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBzZWxlY3Rpb25zPzogbnVtYmVyW10pIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsIHx8ICF0aGlzLm5vdGVib29rRGlmZlZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIGFmdGVyIGF3YWl0IHRoZSBlZGl0b3IgbWlnaHQgYmUgZGlzcG9zZWQuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoc2VsZWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0c2NoZWR1bGVPdXRwdXRIZWlnaHRBY2soY2VsbEluZm86IElEaWZmQ2VsbEluZm8sIG91dHB1dElkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgZGlmZkVsZW1lbnQgPSBjZWxsSW5mby5kaWZmRWxlbWVudDtcblx0XHQvLyBjb25zdCBhY3RpdmVXZWJ2aWV3ID0gZGlmZlNpZGUgPT09IERpZmZTaWRlLk1vZGlmaWVkID8gdGhpcy5fbW9kaWZpZWRXZWJ2aWV3IDogdGhpcy5fb3JpZ2luYWxXZWJ2aWV3O1xuXHRcdGxldCBkaWZmU2lkZSA9IERpZmZTaWRlLk9yaWdpbmFsO1xuXG5cdFx0aWYgKGRpZmZFbGVtZW50IGluc3RhbmNlb2YgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBpbmZvID0gQ2VsbFVyaS5wYXJzZShjZWxsSW5mby5jZWxsVXJpKTtcblx0XHRcdGlmICghaW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGRpZmZTaWRlID0gaW5mby5ub3RlYm9vay50b1N0cmluZygpID09PSB0aGlzLl9tb2RlbD8ub3JpZ2luYWwucmVzb3VyY2UudG9TdHJpbmcoKSA/IERpZmZTaWRlLk9yaWdpbmFsIDogRGlmZlNpZGUuTW9kaWZpZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpZmZTaWRlID0gZGlmZkVsZW1lbnQudHlwZSA9PT0gJ2luc2VydCcgPyBEaWZmU2lkZS5Nb2RpZmllZCA6IERpZmZTaWRlLk9yaWdpbmFsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdlYnZpZXcgPSBkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyB0aGlzLl9tb2RpZmllZFdlYnZpZXcgOiB0aGlzLl9vcmlnaW5hbFdlYnZpZXc7XG5cblx0XHRET00uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0aGlzLndpbmRvdywgKCkgPT4ge1xuXHRcdFx0d2Vidmlldz8uYWNrSGVpZ2h0KFt7IGNlbGxJZDogY2VsbEluZm8uY2VsbElkLCBvdXRwdXRJZCwgaGVpZ2h0IH1dKTtcblx0XHR9LCAxMCk7XG5cdH1cblxuXHRwcml2YXRlIHBlbmRpbmdMYXlvdXRzID0gbmV3IFdlYWtNYXA8SURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSwgSURpc3Bvc2FibGU+KCk7XG5cblxuXHRsYXlvdXROb3RlYm9va0NlbGwoY2VsbDogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRjb25zdCByZWxheW91dCA9IChjZWxsOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlLCBoZWlnaHQ6IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fbGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0MihjZWxsLCBoZWlnaHQpO1xuXHRcdH07XG5cblx0XHRsZXQgZGlzcG9zYWJsZSA9IHRoaXMucGVuZGluZ0xheW91dHMuZ2V0KGNlbGwpO1xuXHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9sb2NhbFN0b3JlLmRlbGV0ZShkaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHRsZXQgcjogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBsYXlvdXREaXNwb3NhYmxlID0gRE9NLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGhpcy53aW5kb3csICgpID0+IHtcblx0XHRcdHRoaXMucGVuZGluZ0xheW91dHMuZGVsZXRlKGNlbGwpO1xuXG5cdFx0XHRyZWxheW91dChjZWxsLCBoZWlnaHQpO1xuXHRcdFx0cigpO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bGF5b3V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRyKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cblx0XHR0aGlzLnBlbmRpbmdMYXlvdXRzLnNldChjZWxsLCBkaXNwb3NhYmxlKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgciA9IHJlc29sdmU7IH0pO1xuXHR9XG5cblx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG5cdH1cblxuXHR0cmlnZ2VyU2Nyb2xsKGV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy5fbGlzdC50cmlnZ2VyU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChldmVudCk7XG5cdH1cblxuXHRmaXJzdENoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGdvIHRvIHRoZSBmaXJzdCBvbmVcblx0XHRjb25zdCBjdXJyZW50Vmlld01vZGVscyA9IHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsLml0ZW1zO1xuXHRcdGNvbnN0IGluZGV4ID0gY3VycmVudFZpZXdNb2RlbHMuZmluZEluZGV4KHZtID0+IHZtLnR5cGUgIT09ICd1bmNoYW5nZWQnICYmIHZtLnR5cGUgIT09ICd1bmNoYW5nZWRNZXRhZGF0YScgJiYgdm0udHlwZSAhPT0gJ3BsYWNlaG9sZGVyJyk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2luZGV4XSk7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChpbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0bGFzdENoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGdvIHRvIHRoZSBmaXJzdCBvbmVcblx0XHRjb25zdCBjdXJyZW50Vmlld01vZGVscyA9IHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsLml0ZW1zO1xuXHRcdGNvbnN0IGl0ZW0gPSBjdXJyZW50Vmlld01vZGVscy5zbGljZSgpLnJldmVyc2UoKS5maW5kKHZtID0+IHZtLnR5cGUgIT09ICd1bmNoYW5nZWQnICYmIHZtLnR5cGUgIT09ICd1bmNoYW5nZWRNZXRhZGF0YScgJiYgdm0udHlwZSAhPT0gJ3BsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3QgaW5kZXggPSBpdGVtID8gY3VycmVudFZpZXdNb2RlbHMuaW5kZXhPZihpdGVtKSA6IC0xO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdHByZXZpb3VzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGN1cnJGb2N1cyA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdGlmIChpc05hTihjdXJyRm9jdXMpIHx8IGN1cnJGb2N1cyA8IDApIHtcblx0XHRcdGN1cnJGb2N1cyA9IDA7XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCB0aGUgaW5kZXggb2YgcHJldmlvdXMgY2hhbmdlXG5cdFx0bGV0IHByZXZDaGFuZ2VJbmRleCA9IGN1cnJGb2N1cyAtIDE7XG5cdFx0Y29uc3QgY3VycmVudFZpZXdNb2RlbHMgPSB0aGlzLm5vdGVib29rRGlmZlZpZXdNb2RlbC5pdGVtcztcblx0XHR3aGlsZSAocHJldkNoYW5nZUluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IHZtID0gY3VycmVudFZpZXdNb2RlbHNbcHJldkNoYW5nZUluZGV4XTtcblx0XHRcdGlmICh2bS50eXBlICE9PSAndW5jaGFuZ2VkJyAmJiB2bS50eXBlICE9PSAndW5jaGFuZ2VkTWV0YWRhdGEnICYmIHZtLnR5cGUgIT09ICdwbGFjZWhvbGRlcicpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHByZXZDaGFuZ2VJbmRleC0tO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2Q2hhbmdlSW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbcHJldkNoYW5nZUluZGV4XSk7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChwcmV2Q2hhbmdlSW5kZXgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBnbyB0byB0aGUgbGFzdCBvbmVcblx0XHRcdGNvbnN0IGluZGV4ID0gY3VycmVudFZpZXdNb2RlbHMuZmluZExhc3RJbmRleCh2bSA9PiB2bS50eXBlICE9PSAndW5jaGFuZ2VkJyAmJiB2bS50eXBlICE9PSAndW5jaGFuZ2VkTWV0YWRhdGEnICYmIHZtLnR5cGUgIT09ICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG5leHRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGVib29rRGlmZlZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY3VyckZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpWzBdO1xuXG5cdFx0aWYgKGlzTmFOKGN1cnJGb2N1cykgfHwgY3VyckZvY3VzIDwgMCkge1xuXHRcdFx0Y3VyckZvY3VzID0gMDtcblx0XHR9XG5cblx0XHQvLyBmaW5kIHRoZSBpbmRleCBvZiBuZXh0IGNoYW5nZVxuXHRcdGxldCBuZXh0Q2hhbmdlSW5kZXggPSBjdXJyRm9jdXMgKyAxO1xuXHRcdGNvbnN0IGN1cnJlbnRWaWV3TW9kZWxzID0gdGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwuaXRlbXM7XG5cdFx0d2hpbGUgKG5leHRDaGFuZ2VJbmRleCA8IGN1cnJlbnRWaWV3TW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgdm0gPSBjdXJyZW50Vmlld01vZGVsc1tuZXh0Q2hhbmdlSW5kZXhdO1xuXHRcdFx0aWYgKHZtLnR5cGUgIT09ICd1bmNoYW5nZWQnICYmIHZtLnR5cGUgIT09ICd1bmNoYW5nZWRNZXRhZGF0YScgJiYgdm0udHlwZSAhPT0gJ3BsYWNlaG9sZGVyJykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0bmV4dENoYW5nZUluZGV4Kys7XG5cdFx0fVxuXG5cdFx0aWYgKG5leHRDaGFuZ2VJbmRleCA8IGN1cnJlbnRWaWV3TW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbbmV4dENoYW5nZUluZGV4XSk7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChuZXh0Q2hhbmdlSW5kZXgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBnbyB0byB0aGUgZmlyc3Qgb25lXG5cdFx0XHRjb25zdCBpbmRleCA9IGN1cnJlbnRWaWV3TW9kZWxzLmZpbmRJbmRleCh2bSA9PiB2bS50eXBlICE9PSAndW5jaGFuZ2VkJyAmJiB2bS50eXBlICE9PSAndW5jaGFuZ2VkTWV0YWRhdGEnICYmIHZtLnR5cGUgIT09ICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNyZWF0ZU91dHB1dChjZWxsRGlmZlZpZXdNb2RlbDogRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSwgY2VsbFZpZXdNb2RlbDogRGlmZk5lc3RlZENlbGxWaWV3TW9kZWwsIG91dHB1dDogSUluc2V0UmVuZGVyT3V0cHV0LCBnZXRPZmZzZXQ6ICgpID0+IG51bWJlciwgZGlmZlNpZGU6IERpZmZTaWRlKTogdm9pZCB7XG5cdFx0dGhpcy5faW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQucXVldWUob3V0cHV0LnNvdXJjZS5tb2RlbC5vdXRwdXRJZCArIChkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyAnLXJpZ2h0JyA6ICdsZWZ0JyksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVdlYnZpZXcgPSBkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyB0aGlzLl9tb2RpZmllZFdlYnZpZXcgOiB0aGlzLl9vcmlnaW5hbFdlYnZpZXc7XG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcuaW5zZXRNYXBwaW5nLmhhcyhvdXRwdXQuc291cmNlKSkge1xuXHRcdFx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsRGlmZlZpZXdNb2RlbCk7XG5cdFx0XHRcdGF3YWl0IGFjdGl2ZVdlYnZpZXcuY3JlYXRlT3V0cHV0KHsgZGlmZkVsZW1lbnQ6IGNlbGxEaWZmVmlld01vZGVsLCBjZWxsSGFuZGxlOiBjZWxsVmlld01vZGVsLmhhbmRsZSwgY2VsbElkOiBjZWxsVmlld01vZGVsLmlkLCBjZWxsVXJpOiBjZWxsVmlld01vZGVsLnVyaSB9LCBvdXRwdXQsIGNlbGxUb3AsIGdldE9mZnNldCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGxEaWZmVmlld01vZGVsKTtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0SW5kZXggPSBjZWxsVmlld01vZGVsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2Yob3V0cHV0LnNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IG91dHB1dE9mZnNldCA9IGNlbGxEaWZmVmlld01vZGVsLmdldE91dHB1dE9mZnNldEluQ2VsbChkaWZmU2lkZSwgb3V0cHV0SW5kZXgpO1xuXHRcdFx0XHRhY3RpdmVXZWJ2aWV3LnVwZGF0ZVNjcm9sbFRvcHMoW3tcblx0XHRcdFx0XHRjZWxsOiBjZWxsVmlld01vZGVsLFxuXHRcdFx0XHRcdG91dHB1dDogb3V0cHV0LnNvdXJjZSxcblx0XHRcdFx0XHRjZWxsVG9wLFxuXHRcdFx0XHRcdG91dHB1dE9mZnNldCxcblx0XHRcdFx0XHRmb3JjZURpc3BsYXk6IHRydWVcblx0XHRcdFx0fV0sIFtdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZU1hcmt1cENlbGxIZWlnaHQoKSB7XG5cdFx0Ly8gVE9ET1xuXHR9XG5cblx0Z2V0Q2VsbEJ5SW5mbyhjZWxsSW5mbzogSURpZmZDZWxsSW5mbyk6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCB7XG5cdFx0cmV0dXJuIGNlbGxJbmZvLmRpZmZFbGVtZW50LmdldENlbGxCeVVyaShjZWxsSW5mby5jZWxsVXJpKTtcblx0fVxuXG5cdGdldENlbGxCeUlkKGNlbGxJZDogc3RyaW5nKTogSUdlbmVyaWNDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0cmVtb3ZlSW5zZXQoY2VsbERpZmZWaWV3TW9kZWw6IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UsIGNlbGxWaWV3TW9kZWw6IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsLCBkaXNwbGF5T3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgZGlmZlNpZGU6IERpZmZTaWRlKSB7XG5cdFx0dGhpcy5faW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQucXVldWUoZGlzcGxheU91dHB1dC5tb2RlbC5vdXRwdXRJZCArIChkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyAnLXJpZ2h0JyA6ICdsZWZ0JyksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVdlYnZpZXcgPSBkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyB0aGlzLl9tb2RpZmllZFdlYnZpZXcgOiB0aGlzLl9vcmlnaW5hbFdlYnZpZXc7XG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcuaW5zZXRNYXBwaW5nLmhhcyhkaXNwbGF5T3V0cHV0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGFjdGl2ZVdlYnZpZXcucmVtb3ZlSW5zZXRzKFtkaXNwbGF5T3V0cHV0XSk7XG5cdFx0fSk7XG5cdH1cblxuXHRzaG93SW5zZXQoY2VsbERpZmZWaWV3TW9kZWw6IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UsIGNlbGxWaWV3TW9kZWw6IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsLCBkaXNwbGF5T3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgZGlmZlNpZGU6IERpZmZTaWRlKSB7XG5cdFx0dGhpcy5faW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQucXVldWUoZGlzcGxheU91dHB1dC5tb2RlbC5vdXRwdXRJZCArIChkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyAnLXJpZ2h0JyA6ICdsZWZ0JyksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVdlYnZpZXcgPSBkaWZmU2lkZSA9PT0gRGlmZlNpZGUuTW9kaWZpZWQgPyB0aGlzLl9tb2RpZmllZFdlYnZpZXcgOiB0aGlzLl9vcmlnaW5hbFdlYnZpZXc7XG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFjdGl2ZVdlYnZpZXcuaW5zZXRNYXBwaW5nLmhhcyhkaXNwbGF5T3V0cHV0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGxEaWZmVmlld01vZGVsKTtcblx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbFZpZXdNb2RlbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKGRpc3BsYXlPdXRwdXQpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0T2Zmc2V0ID0gY2VsbERpZmZWaWV3TW9kZWwuZ2V0T3V0cHV0T2Zmc2V0SW5DZWxsKGRpZmZTaWRlLCBvdXRwdXRJbmRleCk7XG5cdFx0XHRhY3RpdmVXZWJ2aWV3LnVwZGF0ZVNjcm9sbFRvcHMoW3tcblx0XHRcdFx0Y2VsbDogY2VsbFZpZXdNb2RlbCxcblx0XHRcdFx0b3V0cHV0OiBkaXNwbGF5T3V0cHV0LFxuXHRcdFx0XHRjZWxsVG9wLFxuXHRcdFx0XHRvdXRwdXRPZmZzZXQsXG5cdFx0XHRcdGZvcmNlRGlzcGxheTogdHJ1ZSxcblx0XHRcdH1dLCBbXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRoaWRlSW5zZXQoY2VsbERpZmZWaWV3TW9kZWw6IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UsIGNlbGxWaWV3TW9kZWw6IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsLCBvdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsKSB7XG5cdFx0dGhpcy5fbW9kaWZpZWRXZWJ2aWV3Py5oaWRlSW5zZXQob3V0cHV0KTtcblx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXc/LmhpZGVJbnNldChvdXRwdXQpO1xuXHR9XG5cblx0Ly8gcHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdlYnZpZXcocmlnaHRFZGl0b3I6IGJvb2xlYW4pOiBQcm9taXNlPEJhY2tMYXllcldlYlZpZXcgfCBudWxsPiB7XG5cdC8vIFx0aWYgKHJpZ2h0RWRpdG9yKSB7XG5cblx0Ly8gXHR9XG5cdC8vIH1cblxuXHRnZXREb21Ob2RlKCkge1xuXHRcdHJldHVybiB0aGlzLl9yb290RWxlbWVudDtcblx0fVxuXG5cdGdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX292ZXJmbG93Q29udGFpbmVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuaW5saW5lRGlmZldpZGdldD8uaGlkZSgpO1xuXG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXG5cdFx0dGhpcy5fbW9kaWZpZWRSZXNvdXJjZURpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX2xpc3Q/LnNwbGljZSgwLCB0aGlzLl9saXN0Py5sZW5ndGggfHwgMCk7XG5cdFx0dGhpcy5fbW9kZWwgPSBudWxsO1xuXHRcdHRoaXMubm90ZWJvb2tEaWZmVmlld01vZGVsPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5ub3RlYm9va0RpZmZWaWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRkZWx0YUNlbGxPdXRwdXRDb250YWluZXJDbGFzc05hbWVzKGRpZmZTaWRlOiBEaWZmU2lkZSwgY2VsbElkOiBzdHJpbmcsIGFkZGVkOiBzdHJpbmdbXSwgcmVtb3ZlZDogc3RyaW5nW10pIHtcblx0XHRpZiAoZGlmZlNpZGUgPT09IERpZmZTaWRlLk9yaWdpbmFsKSB7XG5cdFx0XHR0aGlzLl9vcmlnaW5hbFdlYnZpZXc/LmRlbHRhQ2VsbE91dHB1dENvbnRhaW5lckNsYXNzTmFtZXMoY2VsbElkLCBhZGRlZCwgcmVtb3ZlZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21vZGlmaWVkV2Vidmlldz8uZGVsdGFDZWxsT3V0cHV0Q29udGFpbmVyQ2xhc3NOYW1lcyhjZWxsSWQsIGFkZGVkLCByZW1vdmVkKTtcblx0XHR9XG5cdH1cblxuXHRnZXRMYXlvdXRJbmZvKCk6IE5vdGVib29rTGF5b3V0SW5mbyB7XG5cdFx0aWYgKCF0aGlzLl9saXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VkaXRvciBpcyBub3QgaW5pdGFsaXplZCBzdWNjZXNzZnVsbHknKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IHRoaXMuX2RpbWVuc2lvbiEud2lkdGgsXG5cdFx0XHRoZWlnaHQ6IHRoaXMuX2RpbWVuc2lvbiEuaGVpZ2h0LFxuXHRcdFx0Zm9udEluZm86IHRoaXMuZm9udEluZm8sXG5cdFx0XHRzY3JvbGxIZWlnaHQ6IHRoaXMuX2xpc3Q/LmdldFNjcm9sbEhlaWdodCgpID8/IDAsXG5cdFx0XHRzdGlja3lIZWlnaHQ6IDAsXG5cdFx0XHRsaXN0Vmlld09mZnNldFRvcDogMCxcblx0XHR9O1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtaWQtd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCAxMDAwICYmIGRpbWVuc2lvbi53aWR0aCA+PSA2MDApO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdy13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDYwMCk7XG5cdFx0Y29uc3Qgb3ZlcnZpZXdSdWxlckVuYWJsZWQgPSB0aGlzLmlzT3ZlcnZpZXdSdWxlckVuYWJsZWQoKTtcblx0XHR0aGlzLl9kaW1lbnNpb24gPSBkaW1lbnNpb24ud2l0aChkaW1lbnNpb24ud2lkdGggLSAob3ZlcnZpZXdSdWxlckVuYWJsZWQgPyBOb3RlYm9va1RleHREaWZmRWRpdG9yLkVOVElSRV9ESUZGX09WRVJWSUVXX1dJRFRIIDogMCkpO1xuXG5cdFx0dGhpcy5fbGlzdFZpZXdDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodH1weGA7XG5cdFx0dGhpcy5fbGlzdFZpZXdDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt0aGlzLl9kaW1lbnNpb24ud2lkdGh9cHhgO1xuXG5cdFx0aWYgKHRoaXMuX2lubGluZVZpZXcpIHtcblx0XHRcdHRoaXMuX2xpc3RWaWV3Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmlubGluZURpZmZXaWRnZXQ/LnNldExheW91dChkaW1lbnNpb24sIHBvc2l0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbmxpbmVEaWZmV2lkZ2V0Py5oaWRlKCk7XG5cdFx0XHR0aGlzLl9saXN0Vmlld0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdHRoaXMuX2xpc3Q/LmxheW91dCh0aGlzLl9kaW1lbnNpb24uaGVpZ2h0LCB0aGlzLl9kaW1lbnNpb24ud2lkdGgpO1xuXG5cdFx0XHRpZiAodGhpcy5fbW9kaWZpZWRXZWJ2aWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGlmaWVkV2Vidmlldy5lbGVtZW50LnN0eWxlLndpZHRoID0gYGNhbGMoNTAlIC0gMTZweClgO1xuXHRcdFx0XHR0aGlzLl9tb2RpZmllZFdlYnZpZXcuZWxlbWVudC5zdHlsZS5sZWZ0ID0gYGNhbGMoNTAlKWA7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9vcmlnaW5hbFdlYnZpZXcpIHtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxXZWJ2aWV3LmVsZW1lbnQuc3R5bGUud2lkdGggPSBgY2FsYyg1MCUgLSAxNnB4KWA7XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsV2Vidmlldy5lbGVtZW50LnN0eWxlLmxlZnQgPSBgMTZweGA7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlcikge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3Zlci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9kaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHRcdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUud2lkdGggPSBgJHt0aGlzLl9kaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3ZlcnZpZXdSdWxlckVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fb3ZlcnZpZXdSdWxlci5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0TGF5b3V0UHJvcGVydGllcyA9IHsgZGltZW5zaW9uLCBwb3NpdGlvbiB9O1xuXG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyPy5lbWl0KFtuZXcgTm90ZWJvb2tEaWZmTGF5b3V0Q2hhbmdlZEV2ZW50KHsgd2lkdGg6IHRydWUsIGZvbnRJbmZvOiB0cnVlIH0sIHRoaXMuZ2V0TGF5b3V0SW5mbygpKV0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9sYXlvdXRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RldGFjaE1vZGVsKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAxMCwgJ25vdGVib29rLWRpZmYtdmlldy12aWV3cG9ydC1zbGlkZXInKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgZGlmZkRpYWdvbmFsRmlsbENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGlmZkRpYWdvbmFsRmlsbCk7XG5cdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0Lm5vdGVib29rLXRleHQtZGlmZi1lZGl0b3IgLmRpYWdvbmFsLWZpbGwge1xuXHRcdGJhY2tncm91bmQtaW1hZ2U6IGxpbmVhci1ncmFkaWVudChcblx0XHRcdC00NWRlZyxcblx0XHRcdCR7ZGlmZkRpYWdvbmFsRmlsbENvbG9yfSAxMi41JSxcblx0XHRcdCMwMDAwIDEyLjUlLCAjMDAwMCA1MCUsXG5cdFx0XHQke2RpZmZEaWFnb25hbEZpbGxDb2xvcn0gNTAlLCAke2RpZmZEaWFnb25hbEZpbGxDb2xvcn0gNjIuNSUsXG5cdFx0XHQjMDAwMCA2Mi41JSwgIzAwMDAgMTAwJVxuXHRcdCk7XG5cdFx0YmFja2dyb3VuZC1zaXplOiA4cHggOHB4O1xuXHR9XG5cdGApO1xuXG5cdGNvbGxlY3Rvci5hZGRSdWxlKGAubm90ZWJvb2stdGV4dC1kaWZmLWVkaXRvciAuY2VsbC1ib2R5IHsgbWFyZ2luOiAke0RJRkZfQ0VMTF9NQVJHSU59cHg7IH1gKTtcblx0Ly8gV2UgZG8gbm90IHdhbnQgYSBsZWZ0IG1hcmdpbiwgYXMgd2UgYWRkIGFuIG92ZXJsYXkgZm9yIGV4cGFuaW5kIHRoZSBjb2xsYXBzZWQvaGlkZGVuIGNlbGxzLlxuXHRjb2xsZWN0b3IuYWRkUnVsZShgLm5vdGVib29rLXRleHQtZGlmZi1lZGl0b3IgLmNlbGwtcGxhY2Vob2xkZXItYm9keSB7IG1hcmdpbjogJHtE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
