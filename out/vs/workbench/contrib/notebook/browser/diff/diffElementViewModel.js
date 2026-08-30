import { Emitter } from "../../../../../base/common/event.js";
import { hash } from "../../../../../base/common/hash.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { DiffEditorWidget } from "../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { getEditorPadding } from "./diffCellEditorOptions.js";
import { DiffNestedCellViewModel } from "./diffNestedCellViewModel.js";
import { NotebookDiffViewEventType } from "./eventDispatcher.js";
import { DIFF_CELL_MARGIN, DiffSide } from "./notebookDiffEditorBrowser.js";
import { CellLayoutState } from "../notebookBrowser.js";
import { getFormattedMetadataJSON } from "../../common/model/notebookCellTextModel.js";
import { CellUri } from "../../common/notebookCommon.js";
import { Schemas } from "../../../../../base/common/network.js";
import { NotebookDocumentMetadataTextModel } from "../../common/model/notebookMetadataTextModel.js";
const PropertyHeaderHeight = 25;
const HeightOfHiddenLinesRegionInDiffEditor = 24;
const DefaultLineHeight = 17;
var PropertyFoldingState = /* @__PURE__ */ ((PropertyFoldingState2) => {
  PropertyFoldingState2[PropertyFoldingState2["Expanded"] = 0] = "Expanded";
  PropertyFoldingState2[PropertyFoldingState2["Collapsed"] = 1] = "Collapsed";
  return PropertyFoldingState2;
})(PropertyFoldingState || {});
const OUTPUT_EDITOR_HEIGHT_MAGIC = 1440;
class DiffElementViewModelBase extends Disposable {
  constructor(mainDocumentTextModel, editorEventDispatcher, initData) {
    super();
    this.mainDocumentTextModel = mainDocumentTextModel;
    this.editorEventDispatcher = editorEventDispatcher;
    this.initData = initData;
    this._layoutInfoEmitter = this._register(new Emitter());
    this.onDidLayoutChange = this._layoutInfoEmitter.event;
    this._register(this.editorEventDispatcher.onDidChangeLayout((e) => this._layoutInfoEmitter.fire({ outerWidth: true })));
  }
}
class DiffElementPlaceholderViewModel extends DiffElementViewModelBase {
  constructor(mainDocumentTextModel, editorEventDispatcher, initData) {
    super(mainDocumentTextModel, editorEventDispatcher, initData);
    this.type = "placeholder";
    this.hiddenCells = [];
    this._unfoldHiddenCells = this._register(new Emitter());
    this.onUnfoldHiddenCells = this._unfoldHiddenCells.event;
    this.renderOutput = false;
  }
  get totalHeight() {
    return 24 + 2 * DIFF_CELL_MARGIN;
  }
  getHeight(_) {
    return this.totalHeight;
  }
  layoutChange() {
  }
  showHiddenCells() {
    this._unfoldHiddenCells.fire();
  }
}
class NotebookDocumentMetadataViewModel extends DiffElementViewModelBase {
  constructor(originalDocumentTextModel, modifiedDocumentTextModel, type, editorEventDispatcher, initData, notebookService, editorHeightCalculator) {
    super(originalDocumentTextModel, editorEventDispatcher, initData);
    this.originalDocumentTextModel = originalDocumentTextModel;
    this.modifiedDocumentTextModel = modifiedDocumentTextModel;
    this.type = type;
    this.editorHeightCalculator = editorHeightCalculator;
    this.renderOutput = false;
    this._sourceEditorViewState = null;
    const cellStatusHeight = PropertyHeaderHeight;
    this._layoutInfo = {
      width: 0,
      editorHeight: 0,
      editorMargin: 0,
      metadataHeight: 0,
      cellStatusHeight,
      metadataStatusHeight: 0,
      rawOutputHeight: 0,
      outputTotalHeight: 0,
      outputStatusHeight: 0,
      outputMetadataHeight: 0,
      bodyMargin: 32,
      totalHeight: 82 + cellStatusHeight + 0,
      layoutState: CellLayoutState.Uninitialized
    };
    this.cellFoldingState = type === "modifiedMetadata" ? 0 /* Expanded */ : 1 /* Collapsed */;
    this.originalMetadata = this._register(new NotebookDocumentMetadataTextModel(originalDocumentTextModel));
    this.modifiedMetadata = this._register(new NotebookDocumentMetadataTextModel(modifiedDocumentTextModel));
  }
  set editorHeight(height) {
    this._layout({ editorHeight: height });
  }
  get editorHeight() {
    throw new Error("Use Cell.layoutInfo.editorHeight");
  }
  set editorMargin(margin) {
    this._layout({ editorMargin: margin });
  }
  get editorMargin() {
    throw new Error("Use Cell.layoutInfo.editorMargin");
  }
  get layoutInfo() {
    return this._layoutInfo;
  }
  get totalHeight() {
    return this.layoutInfo.totalHeight;
  }
  async computeHeights() {
    if (this.type === "unchangedMetadata") {
      this.editorHeight = this.editorHeightCalculator.computeHeightFromLines(this.originalMetadata.textBuffer.getLineCount());
    } else {
      const original = this.originalMetadata.uri;
      const modified = this.modifiedMetadata.uri;
      this.editorHeight = await this.editorHeightCalculator.diffAndComputeHeight(original, modified);
    }
  }
  layoutChange() {
    this._layout({ recomputeOutput: true });
  }
  _layout(delta) {
    const width = delta.width !== void 0 ? delta.width : this._layoutInfo.width;
    const editorHeight = delta.editorHeight !== void 0 ? delta.editorHeight : this._layoutInfo.editorHeight;
    const editorMargin = delta.editorMargin !== void 0 ? delta.editorMargin : this._layoutInfo.editorMargin;
    const cellStatusHeight = delta.cellStatusHeight !== void 0 ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
    const bodyMargin = delta.bodyMargin !== void 0 ? delta.bodyMargin : this._layoutInfo.bodyMargin;
    const totalHeight = editorHeight + editorMargin + cellStatusHeight + bodyMargin;
    const newLayout = {
      width,
      editorHeight,
      editorMargin,
      metadataHeight: 0,
      cellStatusHeight,
      metadataStatusHeight: 0,
      outputTotalHeight: 0,
      outputStatusHeight: 0,
      bodyMargin,
      rawOutputHeight: 0,
      outputMetadataHeight: 0,
      totalHeight,
      layoutState: CellLayoutState.Measured
    };
    let somethingChanged = false;
    const changeEvent = {};
    if (newLayout.width !== this._layoutInfo.width) {
      changeEvent.width = true;
      somethingChanged = true;
    }
    if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
      changeEvent.editorHeight = true;
      somethingChanged = true;
    }
    if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
      changeEvent.editorMargin = true;
      somethingChanged = true;
    }
    if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
      changeEvent.cellStatusHeight = true;
      somethingChanged = true;
    }
    if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
      changeEvent.bodyMargin = true;
      somethingChanged = true;
    }
    if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
      changeEvent.totalHeight = true;
      somethingChanged = true;
    }
    if (somethingChanged) {
      this._layoutInfo = newLayout;
      this._fireLayoutChangeEvent(changeEvent);
    }
  }
  getHeight(lineHeight) {
    if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
      const editorHeight = this.cellFoldingState === 1 /* Collapsed */ ? 0 : this.computeInputEditorHeight(lineHeight);
      return this._computeTotalHeight(editorHeight);
    } else {
      return this._layoutInfo.totalHeight;
    }
  }
  _computeTotalHeight(editorHeight) {
    const totalHeight = editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.cellStatusHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.outputTotalHeight + this._layoutInfo.outputStatusHeight + this._layoutInfo.outputMetadataHeight + this._layoutInfo.bodyMargin;
    return totalHeight;
  }
  computeInputEditorHeight(_lineHeight) {
    return this.editorHeightCalculator.computeHeightFromLines(Math.max(this.originalMetadata.textBuffer.getLineCount(), this.modifiedMetadata.textBuffer.getLineCount()));
  }
  _fireLayoutChangeEvent(state) {
    this._layoutInfoEmitter.fire(state);
    this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
  }
  getComputedCellContainerWidth(layoutInfo, diffEditor, fullWidth) {
    if (fullWidth) {
      return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
    }
    return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
  }
  getSourceEditorViewState() {
    return this._sourceEditorViewState;
  }
  saveSpirceEditorViewState(viewState) {
    this._sourceEditorViewState = viewState;
  }
}
class DiffElementCellViewModelBase extends DiffElementViewModelBase {
  constructor(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator) {
    super(mainDocumentTextModel, editorEventDispatcher, initData);
    this.type = type;
    this.index = index;
    this.configurationService = configurationService;
    this.diffEditorHeightCalculator = diffEditorHeightCalculator;
    this._stateChangeEmitter = this._register(new Emitter());
    this.onDidStateChange = this._stateChangeEmitter.event;
    this._hideUnchangedCells = this._register(new Emitter());
    this.onHideUnchangedCells = this._hideUnchangedCells.event;
    this._renderOutput = true;
    this._sourceEditorViewState = null;
    this._outputEditorViewState = null;
    this._metadataEditorViewState = null;
    this.original = original ? this._register(new DiffNestedCellViewModel(original, notebookService)) : void 0;
    this.modified = modified ? this._register(new DiffNestedCellViewModel(modified, notebookService)) : void 0;
    const editorHeight = this._estimateEditorHeight(initData.fontInfo);
    const cellStatusHeight = PropertyHeaderHeight;
    this._layoutInfo = {
      width: 0,
      editorHeight,
      editorMargin: 0,
      metadataHeight: 0,
      cellStatusHeight,
      metadataStatusHeight: this.ignoreMetadata ? 0 : PropertyHeaderHeight,
      rawOutputHeight: 0,
      outputTotalHeight: 0,
      outputStatusHeight: this.ignoreOutputs ? 0 : PropertyHeaderHeight,
      outputMetadataHeight: 0,
      bodyMargin: 32,
      totalHeight: 82 + cellStatusHeight + editorHeight,
      layoutState: CellLayoutState.Uninitialized
    };
    this.cellFoldingState = modified?.getTextBufferHash() !== original?.getTextBufferHash() ? 0 /* Expanded */ : 1 /* Collapsed */;
    this.metadataFoldingState = 1 /* Collapsed */;
    this.outputFoldingState = 1 /* Collapsed */;
  }
  hideUnchangedCells() {
    this._hideUnchangedCells.fire();
  }
  set rawOutputHeight(height) {
    this._layout({ rawOutputHeight: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, height) });
  }
  get rawOutputHeight() {
    throw new Error("Use Cell.layoutInfo.rawOutputHeight");
  }
  set outputStatusHeight(height) {
    this._layout({ outputStatusHeight: height });
  }
  get outputStatusHeight() {
    throw new Error("Use Cell.layoutInfo.outputStatusHeight");
  }
  set outputMetadataHeight(height) {
    this._layout({ outputMetadataHeight: height });
  }
  get outputMetadataHeight() {
    throw new Error("Use Cell.layoutInfo.outputStatusHeight");
  }
  set editorHeight(height) {
    this._layout({ editorHeight: height });
  }
  get editorHeight() {
    throw new Error("Use Cell.layoutInfo.editorHeight");
  }
  set editorMargin(margin) {
    this._layout({ editorMargin: margin });
  }
  get editorMargin() {
    throw new Error("Use Cell.layoutInfo.editorMargin");
  }
  set metadataStatusHeight(height) {
    this._layout({ metadataStatusHeight: height });
  }
  get metadataStatusHeight() {
    throw new Error("Use Cell.layoutInfo.outputStatusHeight");
  }
  set metadataHeight(height) {
    this._layout({ metadataHeight: height });
  }
  get metadataHeight() {
    throw new Error("Use Cell.layoutInfo.metadataHeight");
  }
  set renderOutput(value) {
    this._renderOutput = value;
    this._layout({ recomputeOutput: true });
    this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
  }
  get renderOutput() {
    return this._renderOutput;
  }
  get layoutInfo() {
    return this._layoutInfo;
  }
  get totalHeight() {
    return this.layoutInfo.totalHeight;
  }
  get ignoreOutputs() {
    return this.configurationService.getValue("notebook.diff.ignoreOutputs") || !!this.mainDocumentTextModel?.transientOptions.transientOutputs;
  }
  get ignoreMetadata() {
    return this.configurationService.getValue("notebook.diff.ignoreMetadata");
  }
  layoutChange() {
    this._layout({ recomputeOutput: true });
  }
  _estimateEditorHeight(fontInfo) {
    const lineHeight = fontInfo?.lineHeight ?? 17;
    switch (this.type) {
      case "unchanged":
      case "insert": {
        const lineCount = this.modified.textModel.textBuffer.getLineCount();
        const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
        return editorHeight;
      }
      case "delete":
      case "modified": {
        const lineCount = this.original.textModel.textBuffer.getLineCount();
        const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
        return editorHeight;
      }
    }
  }
  _layout(delta) {
    const width = delta.width !== void 0 ? delta.width : this._layoutInfo.width;
    const editorHeight = delta.editorHeight !== void 0 ? delta.editorHeight : this._layoutInfo.editorHeight;
    const editorMargin = delta.editorMargin !== void 0 ? delta.editorMargin : this._layoutInfo.editorMargin;
    const metadataHeight = delta.metadataHeight !== void 0 ? delta.metadataHeight : this._layoutInfo.metadataHeight;
    const cellStatusHeight = delta.cellStatusHeight !== void 0 ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
    const metadataStatusHeight = delta.metadataStatusHeight !== void 0 ? delta.metadataStatusHeight : this._layoutInfo.metadataStatusHeight;
    const rawOutputHeight = delta.rawOutputHeight !== void 0 ? delta.rawOutputHeight : this._layoutInfo.rawOutputHeight;
    const outputStatusHeight = delta.outputStatusHeight !== void 0 ? delta.outputStatusHeight : this._layoutInfo.outputStatusHeight;
    const bodyMargin = delta.bodyMargin !== void 0 ? delta.bodyMargin : this._layoutInfo.bodyMargin;
    const outputMetadataHeight = delta.outputMetadataHeight !== void 0 ? delta.outputMetadataHeight : this._layoutInfo.outputMetadataHeight;
    const outputHeight = this.ignoreOutputs ? 0 : delta.recomputeOutput || delta.rawOutputHeight !== void 0 || delta.outputMetadataHeight !== void 0 ? this._getOutputTotalHeight(rawOutputHeight, outputMetadataHeight) : this._layoutInfo.outputTotalHeight;
    const totalHeight = editorHeight + editorMargin + cellStatusHeight + metadataHeight + metadataStatusHeight + outputHeight + outputStatusHeight + bodyMargin;
    const newLayout = {
      width,
      editorHeight,
      editorMargin,
      metadataHeight,
      cellStatusHeight,
      metadataStatusHeight,
      outputTotalHeight: outputHeight,
      outputStatusHeight,
      bodyMargin,
      rawOutputHeight,
      outputMetadataHeight,
      totalHeight,
      layoutState: CellLayoutState.Measured
    };
    let somethingChanged = false;
    const changeEvent = {};
    if (newLayout.width !== this._layoutInfo.width) {
      changeEvent.width = true;
      somethingChanged = true;
    }
    if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
      changeEvent.editorHeight = true;
      somethingChanged = true;
    }
    if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
      changeEvent.editorMargin = true;
      somethingChanged = true;
    }
    if (newLayout.metadataHeight !== this._layoutInfo.metadataHeight) {
      changeEvent.metadataHeight = true;
      somethingChanged = true;
    }
    if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
      changeEvent.cellStatusHeight = true;
      somethingChanged = true;
    }
    if (newLayout.metadataStatusHeight !== this._layoutInfo.metadataStatusHeight) {
      changeEvent.metadataStatusHeight = true;
      somethingChanged = true;
    }
    if (newLayout.outputTotalHeight !== this._layoutInfo.outputTotalHeight) {
      changeEvent.outputTotalHeight = true;
      somethingChanged = true;
    }
    if (newLayout.outputStatusHeight !== this._layoutInfo.outputStatusHeight) {
      changeEvent.outputStatusHeight = true;
      somethingChanged = true;
    }
    if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
      changeEvent.bodyMargin = true;
      somethingChanged = true;
    }
    if (newLayout.outputMetadataHeight !== this._layoutInfo.outputMetadataHeight) {
      changeEvent.outputMetadataHeight = true;
      somethingChanged = true;
    }
    if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
      changeEvent.totalHeight = true;
      somethingChanged = true;
    }
    if (somethingChanged) {
      this._layoutInfo = newLayout;
      this._fireLayoutChangeEvent(changeEvent);
    }
  }
  getHeight(lineHeight) {
    if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
      const editorHeight = this.cellFoldingState === 1 /* Collapsed */ ? 0 : this.computeInputEditorHeight(lineHeight);
      return this._computeTotalHeight(editorHeight);
    } else {
      return this._layoutInfo.totalHeight;
    }
  }
  _computeTotalHeight(editorHeight) {
    const totalHeight = editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.cellStatusHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.outputTotalHeight + this._layoutInfo.outputStatusHeight + this._layoutInfo.outputMetadataHeight + this._layoutInfo.bodyMargin;
    return totalHeight;
  }
  computeInputEditorHeight(lineHeight) {
    const lineCount = Math.max(this.original?.textModel.textBuffer.getLineCount() ?? 1, this.modified?.textModel.textBuffer.getLineCount() ?? 1);
    return this.diffEditorHeightCalculator.computeHeightFromLines(lineCount);
  }
  _getOutputTotalHeight(rawOutputHeight, metadataHeight) {
    if (this.outputFoldingState === 1 /* Collapsed */) {
      return 0;
    }
    if (this.renderOutput) {
      if (this.isOutputEmpty()) {
        return 24;
      }
      return this.getRichOutputTotalHeight() + metadataHeight;
    } else {
      return rawOutputHeight;
    }
  }
  _fireLayoutChangeEvent(state) {
    this._layoutInfoEmitter.fire(state);
    this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
  }
  getComputedCellContainerWidth(layoutInfo, diffEditor, fullWidth) {
    if (fullWidth) {
      return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
    }
    return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
  }
  getOutputEditorViewState() {
    return this._outputEditorViewState;
  }
  saveOutputEditorViewState(viewState) {
    this._outputEditorViewState = viewState;
  }
  getMetadataEditorViewState() {
    return this._metadataEditorViewState;
  }
  saveMetadataEditorViewState(viewState) {
    this._metadataEditorViewState = viewState;
  }
  getSourceEditorViewState() {
    return this._sourceEditorViewState;
  }
  saveSpirceEditorViewState(viewState) {
    this._sourceEditorViewState = viewState;
  }
}
class SideBySideDiffElementViewModel extends DiffElementCellViewModelBase {
  constructor(mainDocumentTextModel, otherDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, configurationService, index, diffEditorHeightCalculator) {
    super(
      mainDocumentTextModel,
      original,
      modified,
      type,
      editorEventDispatcher,
      initData,
      notebookService,
      index,
      configurationService,
      diffEditorHeightCalculator
    );
    this.otherDocumentTextModel = otherDocumentTextModel;
    this.type = type;
    this.cellFoldingState = this.modified.textModel.getValue() !== this.original.textModel.getValue() ? 0 /* Expanded */ : 1 /* Collapsed */;
    this.metadataFoldingState = 1 /* Collapsed */;
    this.outputFoldingState = 1 /* Collapsed */;
    if (this.checkMetadataIfModified()) {
      this.metadataFoldingState = 0 /* Expanded */;
    }
    if (this.checkIfOutputsModified()) {
      this.outputFoldingState = 0 /* Expanded */;
    }
    this._register(this.original.onDidChangeOutputLayout(() => {
      this._layout({ recomputeOutput: true });
    }));
    this._register(this.modified.onDidChangeOutputLayout(() => {
      this._layout({ recomputeOutput: true });
    }));
    this._register(this.modified.textModel.onDidChangeContent(() => {
      if (mainDocumentTextModel.transientOptions.cellContentMetadata) {
        const cellMetadataKeys = [...Object.keys(mainDocumentTextModel.transientOptions.cellContentMetadata)];
        const modifiedMedataRaw = Object.assign({}, this.modified.metadata);
        const originalCellMetadata = this.original.metadata;
        for (const key of cellMetadataKeys) {
          if (Object.hasOwn(originalCellMetadata, key)) {
            modifiedMedataRaw[key] = originalCellMetadata[key];
          }
        }
        this.modified.textModel.metadata = modifiedMedataRaw;
      }
    }));
  }
  get originalDocument() {
    return this.otherDocumentTextModel;
  }
  get modifiedDocument() {
    return this.mainDocumentTextModel;
  }
  checkIfInputModified() {
    if (this.original.textModel.getTextBufferHash() === this.modified.textModel.getTextBufferHash()) {
      return false;
    }
    return {
      reason: "Cell content has changed"
    };
  }
  checkIfOutputsModified() {
    if (this.mainDocumentTextModel.transientOptions.transientOutputs || this.ignoreOutputs) {
      return false;
    }
    const ret = outputsEqual(this.original?.outputs ?? [], this.modified?.outputs ?? []);
    if (ret === 0 /* Unchanged */) {
      return false;
    }
    return {
      reason: ret === 1 /* Metadata */ ? "Output metadata has changed" : void 0,
      kind: ret
    };
  }
  checkMetadataIfModified() {
    if (this.ignoreMetadata) {
      return false;
    }
    const modified = hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.original?.metadata || {}, this.original?.language)) !== hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.modified?.metadata ?? {}, this.modified?.language));
    if (modified) {
      return { reason: void 0 };
    } else {
      return false;
    }
  }
  updateOutputHeight(diffSide, index, height) {
    if (diffSide === DiffSide.Original) {
      this.original.updateOutputHeight(index, height);
    } else {
      this.modified.updateOutputHeight(index, height);
    }
  }
  getOutputOffsetInContainer(diffSide, index) {
    if (diffSide === DiffSide.Original) {
      return this.original.getOutputOffset(index);
    } else {
      return this.modified.getOutputOffset(index);
    }
  }
  getOutputOffsetInCell(diffSide, index) {
    const offsetInOutputsContainer = this.getOutputOffsetInContainer(diffSide, index);
    return this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.cellStatusHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.outputStatusHeight + this._layoutInfo.bodyMargin / 2 + offsetInOutputsContainer;
  }
  isOutputEmpty() {
    if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
      return true;
    }
    if (this.checkIfOutputsModified()) {
      return false;
    }
    return (this.original?.outputs || []).length === 0;
  }
  getRichOutputTotalHeight() {
    return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
  }
  getNestedCellViewModel(diffSide) {
    return diffSide === DiffSide.Original ? this.original : this.modified;
  }
  getCellByUri(cellUri) {
    if (cellUri.toString() === this.original.uri.toString()) {
      return this.original;
    } else {
      return this.modified;
    }
  }
  computeInputEditorHeight(lineHeight) {
    if (this.type === "modified" && typeof this.editorHeightWithUnchangedLinesCollapsed === "number" && this.checkIfInputModified()) {
      return this.editorHeightWithUnchangedLinesCollapsed;
    }
    return super.computeInputEditorHeight(lineHeight);
  }
  async computeModifiedInputEditorHeight() {
    if (this.checkIfInputModified()) {
      this.editorHeightWithUnchangedLinesCollapsed = this._layoutInfo.editorHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(this.original.uri, this.modified.uri);
    }
  }
  async computeModifiedMetadataEditorHeight() {
    if (this.checkMetadataIfModified()) {
      const originalMetadataUri = CellUri.generateCellPropertyUri(this.originalDocument.uri, this.original.handle, Schemas.vscodeNotebookCellMetadata);
      const modifiedMetadataUri = CellUri.generateCellPropertyUri(this.modifiedDocument.uri, this.modified.handle, Schemas.vscodeNotebookCellMetadata);
      this._layoutInfo.metadataHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(originalMetadataUri, modifiedMetadataUri);
    }
  }
  async computeEditorHeights() {
    if (this.type === "unchanged") {
      return;
    }
    await Promise.all([this.computeModifiedInputEditorHeight(), this.computeModifiedMetadataEditorHeight()]);
  }
}
class SingleSideDiffElementViewModel extends DiffElementCellViewModelBase {
  constructor(mainDocumentTextModel, otherDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, configurationService, diffEditorHeightCalculator, index) {
    super(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator);
    this.otherDocumentTextModel = otherDocumentTextModel;
    this.type = type;
    this._register(this.cellViewModel.onDidChangeOutputLayout(() => {
      this._layout({ recomputeOutput: true });
    }));
  }
  get cellViewModel() {
    return this.type === "insert" ? this.modified : this.original;
  }
  get originalDocument() {
    if (this.type === "insert") {
      return this.otherDocumentTextModel;
    } else {
      return this.mainDocumentTextModel;
    }
  }
  get modifiedDocument() {
    if (this.type === "insert") {
      return this.mainDocumentTextModel;
    } else {
      return this.otherDocumentTextModel;
    }
  }
  checkIfInputModified() {
    return {
      reason: "Cell content has changed"
    };
  }
  getNestedCellViewModel(diffSide) {
    return this.type === "insert" ? this.modified : this.original;
  }
  checkIfOutputsModified() {
    return false;
  }
  checkMetadataIfModified() {
    return false;
  }
  updateOutputHeight(diffSide, index, height) {
    this.cellViewModel?.updateOutputHeight(index, height);
  }
  getOutputOffsetInContainer(diffSide, index) {
    return this.cellViewModel.getOutputOffset(index);
  }
  getOutputOffsetInCell(diffSide, index) {
    const offsetInOutputsContainer = this.cellViewModel.getOutputOffset(index);
    return this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.cellStatusHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.outputStatusHeight + this._layoutInfo.bodyMargin / 2 + offsetInOutputsContainer;
  }
  isOutputEmpty() {
    if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
      return true;
    }
    return (this.original?.outputs || this.modified?.outputs || []).length === 0;
  }
  getRichOutputTotalHeight() {
    return this.cellViewModel?.getOutputTotalHeight() ?? 0;
  }
  getCellByUri(cellUri) {
    return this.cellViewModel;
  }
}
var OutputComparison = /* @__PURE__ */ ((OutputComparison2) => {
  OutputComparison2[OutputComparison2["Unchanged"] = 0] = "Unchanged";
  OutputComparison2[OutputComparison2["Metadata"] = 1] = "Metadata";
  OutputComparison2[OutputComparison2["Other"] = 2] = "Other";
  return OutputComparison2;
})(OutputComparison || {});
function outputEqual(a, b) {
  if (hash(a.metadata) === hash(b.metadata)) {
    return 2 /* Other */;
  }
  for (let j = 0; j < a.outputs.length; j++) {
    const aOutputItem = a.outputs[j];
    const bOutputItem = b.outputs[j];
    if (aOutputItem.mime !== bOutputItem.mime) {
      return 2 /* Other */;
    }
    if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
      return 2 /* Other */;
    }
    for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
      if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
        return 2 /* Other */;
      }
    }
  }
  return 1 /* Metadata */;
}
function outputsEqual(original, modified) {
  if (original.length !== modified.length) {
    return 2 /* Other */;
  }
  const len = original.length;
  for (let i = 0; i < len; i++) {
    const a = original[i];
    const b = modified[i];
    if (hash(a.metadata) !== hash(b.metadata)) {
      return 1 /* Metadata */;
    }
    if (a.outputs.length !== b.outputs.length) {
      return 2 /* Other */;
    }
    for (let j = 0; j < a.outputs.length; j++) {
      const aOutputItem = a.outputs[j];
      const bOutputItem = b.outputs[j];
      if (aOutputItem.mime !== bOutputItem.mime) {
        return 2 /* Other */;
      }
      if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
        return 2 /* Other */;
      }
      for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
        if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
          return 2 /* Other */;
        }
      }
    }
  }
  return 0 /* Unchanged */;
}
function getStreamOutputData(outputs) {
  if (!outputs.length) {
    return null;
  }
  const first = outputs[0];
  const mime = first.mime;
  const sameStream = !outputs.find((op) => op.mime !== mime);
  if (sameStream) {
    return outputs.map((opit) => opit.data.toString()).join("");
  } else {
    return null;
  }
}
function getFormattedOutputJSON(outputs) {
  if (outputs.length === 1) {
    const streamOutputData = getStreamOutputData(outputs[0].outputs);
    if (streamOutputData) {
      return streamOutputData;
    }
  }
  return JSON.stringify(outputs.map((output) => {
    return {
      metadata: output.metadata,
      outputItems: output.outputs.map((opit) => ({
        mimeType: opit.mime,
        data: opit.data.toString()
      }))
    };
  }), void 0, "	");
}
export {
  DefaultLineHeight,
  DiffElementCellViewModelBase,
  DiffElementPlaceholderViewModel,
  DiffElementViewModelBase,
  HeightOfHiddenLinesRegionInDiffEditor,
  NotebookDocumentMetadataViewModel,
  OUTPUT_EDITOR_HEIGHT_MAGIC,
  OutputComparison,
  PropertyFoldingState,
  SideBySideDiffElementViewModel,
  SingleSideDiffElementViewModel,
  getFormattedOutputJSON,
  getStreamOutputData,
  outputEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxkaWZmRWxlbWVudFZpZXdNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JQYWRkaW5nIH0gZnJvbSAnLi9kaWZmQ2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZk5lc3RlZENlbGxWaWV3TW9kZWwgfSBmcm9tICcuL2RpZmZOZXN0ZWRDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlciwgTm90ZWJvb2tEaWZmVmlld0V2ZW50VHlwZSB9IGZyb20gJy4vZXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IENlbGxEaWZmVmlld01vZGVsTGF5b3V0Q2hhbmdlRXZlbnQsIERJRkZfQ0VMTF9NQVJHSU4sIERpZmZTaWRlLCBJRGlmZkVsZW1lbnRMYXlvdXRJbmZvIH0gZnJvbSAnLi9ub3RlYm9va0RpZmZFZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxMYXlvdXRTdGF0ZSwgSUdlbmVyaWNDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rTGF5b3V0SW5mbyB9IGZyb20gJy4uL25vdGVib29rVmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBnZXRGb3JtYXR0ZWRNZXRhZGF0YUpTT04sIE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSwgSUNlbGxPdXRwdXQsIElOb3RlYm9va1RleHRNb2RlbCwgSU91dHB1dER0bywgSU91dHB1dEl0ZW1EdG8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlIH0gZnJvbSAnLi9lZGl0b3JIZWlnaHRDYWxjdWxhdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va01ldGFkYXRhVGV4dE1vZGVsLmpzJztcblxuY29uc3QgUHJvcGVydHlIZWFkZXJIZWlnaHQgPSAyNTtcblxuLy8gRnJvbSBgLm1vbmFjby1lZGl0b3IgLmRpZmYtaGlkZGVuLWxpbmVzIC5jZW50ZXJgIGluIHNyYy92cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9zdHlsZS5jc3NcbmV4cG9ydCBjb25zdCBIZWlnaHRPZkhpZGRlbkxpbmVzUmVnaW9uSW5EaWZmRWRpdG9yID0gMjQ7XG5cbmV4cG9ydCBjb25zdCBEZWZhdWx0TGluZUhlaWdodCA9IDE3O1xuXG5leHBvcnQgZW51bSBQcm9wZXJ0eUZvbGRpbmdTdGF0ZSB7XG5cdEV4cGFuZGVkLFxuXHRDb2xsYXBzZWRcbn1cblxuZXhwb3J0IGNvbnN0IE9VVFBVVF9FRElUT1JfSEVJR0hUX01BR0lDID0gMTQ0MDtcblxudHlwZSBJTGF5b3V0SW5mb0RlbHRhMCA9IHsgW0sgaW4ga2V5b2YgSURpZmZFbGVtZW50TGF5b3V0SW5mb10/OiBudW1iZXI7IH07XG5pbnRlcmZhY2UgSUxheW91dEluZm9EZWx0YSBleHRlbmRzIElMYXlvdXRJbmZvRGVsdGEwIHtcblx0cmF3T3V0cHV0SGVpZ2h0PzogbnVtYmVyO1xuXHRyZWNvbXB1dGVPdXRwdXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlID0gRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSB8IERpZmZFbGVtZW50UGxhY2Vob2xkZXJWaWV3TW9kZWwgfCBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFWaWV3TW9kZWw7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJvdGVjdGVkIF9sYXlvdXRJbmZvRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENlbGxEaWZmVmlld01vZGVsTGF5b3V0Q2hhbmdlRXZlbnQ+KCkpO1xuXHRvbkRpZExheW91dENoYW5nZSA9IHRoaXMuX2xheW91dEluZm9FbWl0dGVyLmV2ZW50O1xuXHRhYnN0cmFjdCByZW5kZXJPdXRwdXQ6IGJvb2xlYW47XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtYWluRG9jdW1lbnRUZXh0TW9kZWw6IElOb3RlYm9va1RleHRNb2RlbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yRXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGluaXREYXRhOiB7XG5cdFx0XHRtZXRhZGF0YVN0YXR1c0hlaWdodDogbnVtYmVyO1xuXHRcdFx0b3V0cHV0U3RhdHVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRmb250SW5mbzogRm9udEluZm8gfCB1bmRlZmluZWQ7XG5cdFx0fVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JFdmVudERpc3BhdGNoZXIub25EaWRDaGFuZ2VMYXlvdXQoZSA9PiB0aGlzLl9sYXlvdXRJbmZvRW1pdHRlci5maXJlKHsgb3V0ZXJXaWR0aDogdHJ1ZSB9KSkpO1xuXHR9XG5cblx0YWJzdHJhY3QgbGF5b3V0Q2hhbmdlKCk6IHZvaWQ7XG5cdGFic3RyYWN0IGdldEhlaWdodChsaW5lSGVpZ2h0OiBudW1iZXIpOiBudW1iZXI7XG5cdGFic3RyYWN0IGdldCB0b3RhbEhlaWdodCgpOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEaWZmRWxlbWVudFBsYWNlaG9sZGVyVmlld01vZGVsIGV4dGVuZHMgRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlIHtcblx0cmVhZG9ubHkgdHlwZTogJ3BsYWNlaG9sZGVyJyA9ICdwbGFjZWhvbGRlcic7XG5cdHB1YmxpYyBoaWRkZW5DZWxsczogRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZVtdID0gW107XG5cdHByb3RlY3RlZCBfdW5mb2xkSGlkZGVuQ2VsbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b25VbmZvbGRIaWRkZW5DZWxscyA9IHRoaXMuX3VuZm9sZEhpZGRlbkNlbGxzLmV2ZW50O1xuXG5cdHB1YmxpYyByZW5kZXJPdXRwdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkRvY3VtZW50VGV4dE1vZGVsOiBJTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0ZWRpdG9yRXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsXG5cdFx0aW5pdERhdGE6IHtcblx0XHRcdG1ldGFkYXRhU3RhdHVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRvdXRwdXRTdGF0dXNIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0XHR9XG5cdCkge1xuXHRcdHN1cGVyKG1haW5Eb2N1bWVudFRleHRNb2RlbCwgZWRpdG9yRXZlbnREaXNwYXRjaGVyLCBpbml0RGF0YSk7XG5cblx0fVxuXHRnZXQgdG90YWxIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDI0ICsgKDIgKiBESUZGX0NFTExfTUFSR0lOKTtcblx0fVxuXHRnZXRIZWlnaHQoXzogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50b3RhbEhlaWdodDtcblx0fVxuXHRvdmVycmlkZSBsYXlvdXRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Ly9cblx0fVxuXHRzaG93SGlkZGVuQ2VsbHMoKSB7XG5cdFx0dGhpcy5fdW5mb2xkSGlkZGVuQ2VsbHMuZmlyZSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVZpZXdNb2RlbCBleHRlbmRzIERpZmZFbGVtZW50Vmlld01vZGVsQmFzZSB7XG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbE1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFUZXh0TW9kZWw7XG5cdHB1YmxpYyByZWFkb25seSBtb2RpZmllZE1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFUZXh0TW9kZWw7XG5cdHB1YmxpYyBjZWxsRm9sZGluZ1N0YXRlOiBQcm9wZXJ0eUZvbGRpbmdTdGF0ZTtcblx0cHJvdGVjdGVkIF9sYXlvdXRJbmZvITogSURpZmZFbGVtZW50TGF5b3V0SW5mbztcblx0cHVibGljIHJlbmRlck91dHB1dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRzZXQgZWRpdG9ySGVpZ2h0KGhlaWdodDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbGF5b3V0KHsgZWRpdG9ySGVpZ2h0OiBoZWlnaHQgfSk7XG5cdH1cblxuXHRnZXQgZWRpdG9ySGVpZ2h0KCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVXNlIENlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQnKTtcblx0fVxuXG5cdHNldCBlZGl0b3JNYXJnaW4obWFyZ2luOiBudW1iZXIpIHtcblx0XHR0aGlzLl9sYXlvdXQoeyBlZGl0b3JNYXJnaW46IG1hcmdpbiB9KTtcblx0fVxuXG5cdGdldCBlZGl0b3JNYXJnaW4oKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgQ2VsbC5sYXlvdXRJbmZvLmVkaXRvck1hcmdpbicpO1xuXHR9XG5cdGdldCBsYXlvdXRJbmZvKCk6IElEaWZmRWxlbWVudExheW91dEluZm8ge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRJbmZvO1xuXHR9XG5cblx0Z2V0IHRvdGFsSGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLmxheW91dEluZm8udG90YWxIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zb3VyY2VFZGl0b3JWaWV3U3RhdGU6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdTdGF0ZSB8IG51bGwgPSBudWxsO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxEb2N1bWVudFRleHRNb2RlbDogSU5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RpZmllZERvY3VtZW50VGV4dE1vZGVsOiBJTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHR5cGU6ICd1bmNoYW5nZWRNZXRhZGF0YScgfCAnbW9kaWZpZWRNZXRhZGF0YScsXG5cdFx0ZWRpdG9yRXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsXG5cdFx0aW5pdERhdGE6IHtcblx0XHRcdG1ldGFkYXRhU3RhdHVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRvdXRwdXRTdGF0dXNIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckhlaWdodENhbGN1bGF0b3I6IElEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3JpZ2luYWxEb2N1bWVudFRleHRNb2RlbCwgZWRpdG9yRXZlbnREaXNwYXRjaGVyLCBpbml0RGF0YSk7XG5cblx0XHRjb25zdCBjZWxsU3RhdHVzSGVpZ2h0ID0gUHJvcGVydHlIZWFkZXJIZWlnaHQ7XG5cdFx0dGhpcy5fbGF5b3V0SW5mbyA9IHtcblx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0ZWRpdG9ySGVpZ2h0OiAwLFxuXHRcdFx0ZWRpdG9yTWFyZ2luOiAwLFxuXHRcdFx0bWV0YWRhdGFIZWlnaHQ6IDAsXG5cdFx0XHRjZWxsU3RhdHVzSGVpZ2h0LFxuXHRcdFx0bWV0YWRhdGFTdGF0dXNIZWlnaHQ6IDAsXG5cdFx0XHRyYXdPdXRwdXRIZWlnaHQ6IDAsXG5cdFx0XHRvdXRwdXRUb3RhbEhlaWdodDogMCxcblx0XHRcdG91dHB1dFN0YXR1c0hlaWdodDogMCxcblx0XHRcdG91dHB1dE1ldGFkYXRhSGVpZ2h0OiAwLFxuXHRcdFx0Ym9keU1hcmdpbjogMzIsXG5cdFx0XHR0b3RhbEhlaWdodDogODIgKyBjZWxsU3RhdHVzSGVpZ2h0ICsgMCxcblx0XHRcdGxheW91dFN0YXRlOiBDZWxsTGF5b3V0U3RhdGUuVW5pbml0aWFsaXplZFxuXHRcdH07XG5cblx0XHR0aGlzLmNlbGxGb2xkaW5nU3RhdGUgPSB0eXBlID09PSAnbW9kaWZpZWRNZXRhZGF0YScgPyBQcm9wZXJ0eUZvbGRpbmdTdGF0ZS5FeHBhbmRlZCA6IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkNvbGxhcHNlZDtcblx0XHR0aGlzLm9yaWdpbmFsTWV0YWRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhVGV4dE1vZGVsKG9yaWdpbmFsRG9jdW1lbnRUZXh0TW9kZWwpKTtcblx0XHR0aGlzLm1vZGlmaWVkTWV0YWRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhVGV4dE1vZGVsKG1vZGlmaWVkRG9jdW1lbnRUZXh0TW9kZWwpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlSGVpZ2h0cygpIHtcblx0XHRpZiAodGhpcy50eXBlID09PSAndW5jaGFuZ2VkTWV0YWRhdGEnKSB7XG5cdFx0XHR0aGlzLmVkaXRvckhlaWdodCA9IHRoaXMuZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci5jb21wdXRlSGVpZ2h0RnJvbUxpbmVzKHRoaXMub3JpZ2luYWxNZXRhZGF0YS50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSB0aGlzLm9yaWdpbmFsTWV0YWRhdGEudXJpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWQgPSB0aGlzLm1vZGlmaWVkTWV0YWRhdGEudXJpO1xuXHRcdFx0dGhpcy5lZGl0b3JIZWlnaHQgPSBhd2FpdCB0aGlzLmVkaXRvckhlaWdodENhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXRDaGFuZ2UoKSB7XG5cdFx0dGhpcy5fbGF5b3V0KHsgcmVjb21wdXRlT3V0cHV0OiB0cnVlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9sYXlvdXQoZGVsdGE6IElMYXlvdXRJbmZvRGVsdGEpIHtcblx0XHRjb25zdCB3aWR0aCA9IGRlbHRhLndpZHRoICE9PSB1bmRlZmluZWQgPyBkZWx0YS53aWR0aCA6IHRoaXMuX2xheW91dEluZm8ud2lkdGg7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gZGVsdGEuZWRpdG9ySGVpZ2h0ICE9PSB1bmRlZmluZWQgPyBkZWx0YS5lZGl0b3JIZWlnaHQgOiB0aGlzLl9sYXlvdXRJbmZvLmVkaXRvckhlaWdodDtcblx0XHRjb25zdCBlZGl0b3JNYXJnaW4gPSBkZWx0YS5lZGl0b3JNYXJnaW4gIT09IHVuZGVmaW5lZCA/IGRlbHRhLmVkaXRvck1hcmdpbiA6IHRoaXMuX2xheW91dEluZm8uZWRpdG9yTWFyZ2luO1xuXHRcdGNvbnN0IGNlbGxTdGF0dXNIZWlnaHQgPSBkZWx0YS5jZWxsU3RhdHVzSGVpZ2h0ICE9PSB1bmRlZmluZWQgPyBkZWx0YS5jZWxsU3RhdHVzSGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5jZWxsU3RhdHVzSGVpZ2h0O1xuXHRcdGNvbnN0IGJvZHlNYXJnaW4gPSBkZWx0YS5ib2R5TWFyZ2luICE9PSB1bmRlZmluZWQgPyBkZWx0YS5ib2R5TWFyZ2luIDogdGhpcy5fbGF5b3V0SW5mby5ib2R5TWFyZ2luO1xuXG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSBlZGl0b3JIZWlnaHRcblx0XHRcdCsgZWRpdG9yTWFyZ2luXG5cdFx0XHQrIGNlbGxTdGF0dXNIZWlnaHRcblx0XHRcdCsgYm9keU1hcmdpbjtcblxuXHRcdGNvbnN0IG5ld0xheW91dDogSURpZmZFbGVtZW50TGF5b3V0SW5mbyA9IHtcblx0XHRcdHdpZHRoOiB3aWR0aCxcblx0XHRcdGVkaXRvckhlaWdodDogZWRpdG9ySGVpZ2h0LFxuXHRcdFx0ZWRpdG9yTWFyZ2luOiBlZGl0b3JNYXJnaW4sXG5cdFx0XHRtZXRhZGF0YUhlaWdodDogMCxcblx0XHRcdGNlbGxTdGF0dXNIZWlnaHQsXG5cdFx0XHRtZXRhZGF0YVN0YXR1c0hlaWdodDogMCxcblx0XHRcdG91dHB1dFRvdGFsSGVpZ2h0OiAwLFxuXHRcdFx0b3V0cHV0U3RhdHVzSGVpZ2h0OiAwLFxuXHRcdFx0Ym9keU1hcmdpbjogYm9keU1hcmdpbixcblx0XHRcdHJhd091dHB1dEhlaWdodDogMCxcblx0XHRcdG91dHB1dE1ldGFkYXRhSGVpZ2h0OiAwLFxuXHRcdFx0dG90YWxIZWlnaHQ6IHRvdGFsSGVpZ2h0LFxuXHRcdFx0bGF5b3V0U3RhdGU6IENlbGxMYXlvdXRTdGF0ZS5NZWFzdXJlZFxuXHRcdH07XG5cblx0XHRsZXQgc29tZXRoaW5nQ2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY2hhbmdlRXZlbnQ6IENlbGxEaWZmVmlld01vZGVsTGF5b3V0Q2hhbmdlRXZlbnQgPSB7fTtcblxuXHRcdGlmIChuZXdMYXlvdXQud2lkdGggIT09IHRoaXMuX2xheW91dEluZm8ud2lkdGgpIHtcblx0XHRcdGNoYW5nZUV2ZW50LndpZHRoID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMYXlvdXQuZWRpdG9ySGVpZ2h0ICE9PSB0aGlzLl9sYXlvdXRJbmZvLmVkaXRvckhlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQuZWRpdG9ySGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMYXlvdXQuZWRpdG9yTWFyZ2luICE9PSB0aGlzLl9sYXlvdXRJbmZvLmVkaXRvck1hcmdpbikge1xuXHRcdFx0Y2hhbmdlRXZlbnQuZWRpdG9yTWFyZ2luID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMYXlvdXQuY2VsbFN0YXR1c0hlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby5jZWxsU3RhdHVzSGVpZ2h0KSB7XG5cdFx0XHRjaGFuZ2VFdmVudC5jZWxsU3RhdHVzSGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMYXlvdXQuYm9keU1hcmdpbiAhPT0gdGhpcy5fbGF5b3V0SW5mby5ib2R5TWFyZ2luKSB7XG5cdFx0XHRjaGFuZ2VFdmVudC5ib2R5TWFyZ2luID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMYXlvdXQudG90YWxIZWlnaHQgIT09IHRoaXMuX2xheW91dEluZm8udG90YWxIZWlnaHQpIHtcblx0XHRcdGNoYW5nZUV2ZW50LnRvdGFsSGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChzb21ldGhpbmdDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRJbmZvID0gbmV3TGF5b3V0O1xuXHRcdFx0dGhpcy5fZmlyZUxheW91dENoYW5nZUV2ZW50KGNoYW5nZUV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRnZXRIZWlnaHQobGluZUhlaWdodDogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuX2xheW91dEluZm8ubGF5b3V0U3RhdGUgPT09IENlbGxMYXlvdXRTdGF0ZS5VbmluaXRpYWxpemVkKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JIZWlnaHQgPSB0aGlzLmNlbGxGb2xkaW5nU3RhdGUgPT09IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkNvbGxhcHNlZCA/IDAgOiB0aGlzLmNvbXB1dGVJbnB1dEVkaXRvckhlaWdodChsaW5lSGVpZ2h0KTtcblx0XHRcdHJldHVybiB0aGlzLl9jb21wdXRlVG90YWxIZWlnaHQoZWRpdG9ySGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xheW91dEluZm8udG90YWxIZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZVRvdGFsSGVpZ2h0KGVkaXRvckhlaWdodDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSBlZGl0b3JIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5lZGl0b3JNYXJnaW5cblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YUhlaWdodFxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLmNlbGxTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YVN0YXR1c0hlaWdodFxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ub3V0cHV0U3RhdHVzSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ub3V0cHV0TWV0YWRhdGFIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5ib2R5TWFyZ2luO1xuXG5cdFx0cmV0dXJuIHRvdGFsSGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVJbnB1dEVkaXRvckhlaWdodChfbGluZUhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JIZWlnaHRDYWxjdWxhdG9yLmNvbXB1dGVIZWlnaHRGcm9tTGluZXMoTWF0aC5tYXgodGhpcy5vcmlnaW5hbE1ldGFkYXRhLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCksIHRoaXMubW9kaWZpZWRNZXRhZGF0YS50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9maXJlTGF5b3V0Q2hhbmdlRXZlbnQoc3RhdGU6IENlbGxEaWZmVmlld01vZGVsTGF5b3V0Q2hhbmdlRXZlbnQpIHtcblx0XHR0aGlzLl9sYXlvdXRJbmZvRW1pdHRlci5maXJlKHN0YXRlKTtcblx0XHR0aGlzLmVkaXRvckV2ZW50RGlzcGF0Y2hlci5lbWl0KFt7IHR5cGU6IE5vdGVib29rRGlmZlZpZXdFdmVudFR5cGUuQ2VsbExheW91dENoYW5nZWQsIHNvdXJjZTogdGhpcy5fbGF5b3V0SW5mbyB9XSk7XG5cdH1cblxuXHRnZXRDb21wdXRlZENlbGxDb250YWluZXJXaWR0aChsYXlvdXRJbmZvOiBOb3RlYm9va0xheW91dEluZm8sIGRpZmZFZGl0b3I6IGJvb2xlYW4sIGZ1bGxXaWR0aDogYm9vbGVhbikge1xuXHRcdGlmIChmdWxsV2lkdGgpIHtcblx0XHRcdHJldHVybiBsYXlvdXRJbmZvLndpZHRoIC0gMiAqIERJRkZfQ0VMTF9NQVJHSU4gKyAoZGlmZkVkaXRvciA/IERpZmZFZGl0b3JXaWRnZXQuRU5USVJFX0RJRkZfT1ZFUlZJRVdfV0lEVEggOiAwKSAtIDI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChsYXlvdXRJbmZvLndpZHRoIC0gMiAqIERJRkZfQ0VMTF9NQVJHSU4gKyAoZGlmZkVkaXRvciA/IERpZmZFZGl0b3JXaWRnZXQuRU5USVJFX0RJRkZfT1ZFUlZJRVdfV0lEVEggOiAwKSkgLyAyIC0gMTggLSAyO1xuXHR9XG5cblx0Z2V0U291cmNlRWRpdG9yVmlld1N0YXRlKCk6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdTdGF0ZSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2VFZGl0b3JWaWV3U3RhdGU7XG5cdH1cblxuXHRzYXZlU3BpcmNlRWRpdG9yVmlld1N0YXRlKHZpZXdTdGF0ZTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCkge1xuXHRcdHRoaXMuX3NvdXJjZUVkaXRvclZpZXdTdGF0ZSA9IHZpZXdTdGF0ZTtcblx0fVxufVxuXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlIGV4dGVuZHMgRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlIHtcblx0cHVibGljIGNlbGxGb2xkaW5nU3RhdGU6IFByb3BlcnR5Rm9sZGluZ1N0YXRlO1xuXHRwdWJsaWMgbWV0YWRhdGFGb2xkaW5nU3RhdGU6IFByb3BlcnR5Rm9sZGluZ1N0YXRlO1xuXHRwdWJsaWMgb3V0cHV0Rm9sZGluZ1N0YXRlOiBQcm9wZXJ0eUZvbGRpbmdTdGF0ZTtcblx0cHJvdGVjdGVkIF9zdGF0ZUNoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlbmRlck91dHB1dDogYm9vbGVhbiB9PigpKTtcblx0b25EaWRTdGF0ZUNoYW5nZSA9IHRoaXMuX3N0YXRlQ2hhbmdlRW1pdHRlci5ldmVudDtcblx0cHJvdGVjdGVkIF9sYXlvdXRJbmZvITogSURpZmZFbGVtZW50TGF5b3V0SW5mbztcblxuXHRwdWJsaWMgZGlzcGxheUljb25Ub0hpZGVVbm1vZGlmaWVkQ2VsbHM/OiBib29sZWFuO1xuXHRwcml2YXRlIF9oaWRlVW5jaGFuZ2VkQ2VsbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIG9uSGlkZVVuY2hhbmdlZENlbGxzID0gdGhpcy5faGlkZVVuY2hhbmdlZENlbGxzLmV2ZW50O1xuXG5cdGhpZGVVbmNoYW5nZWRDZWxscygpIHtcblx0XHR0aGlzLl9oaWRlVW5jaGFuZ2VkQ2VsbHMuZmlyZSgpO1xuXHR9XG5cdHNldCByYXdPdXRwdXRIZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHR0aGlzLl9sYXlvdXQoeyByYXdPdXRwdXRIZWlnaHQ6IE1hdGgubWluKE9VVFBVVF9FRElUT1JfSEVJR0hUX01BR0lDLCBoZWlnaHQpIH0pO1xuXHR9XG5cblx0Z2V0IHJhd091dHB1dEhlaWdodCgpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBDZWxsLmxheW91dEluZm8ucmF3T3V0cHV0SGVpZ2h0Jyk7XG5cdH1cblxuXHRzZXQgb3V0cHV0U3RhdHVzSGVpZ2h0KGhlaWdodDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbGF5b3V0KHsgb3V0cHV0U3RhdHVzSGVpZ2h0OiBoZWlnaHQgfSk7XG5cdH1cblxuXHRnZXQgb3V0cHV0U3RhdHVzSGVpZ2h0KCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVXNlIENlbGwubGF5b3V0SW5mby5vdXRwdXRTdGF0dXNIZWlnaHQnKTtcblx0fVxuXG5cdHNldCBvdXRwdXRNZXRhZGF0YUhlaWdodChoZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2xheW91dCh7IG91dHB1dE1ldGFkYXRhSGVpZ2h0OiBoZWlnaHQgfSk7XG5cdH1cblxuXHRnZXQgb3V0cHV0TWV0YWRhdGFIZWlnaHQoKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgQ2VsbC5sYXlvdXRJbmZvLm91dHB1dFN0YXR1c0hlaWdodCcpO1xuXHR9XG5cblx0c2V0IGVkaXRvckhlaWdodChoZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2xheW91dCh7IGVkaXRvckhlaWdodDogaGVpZ2h0IH0pO1xuXHR9XG5cblx0Z2V0IGVkaXRvckhlaWdodCgpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBDZWxsLmxheW91dEluZm8uZWRpdG9ySGVpZ2h0Jyk7XG5cdH1cblxuXHRzZXQgZWRpdG9yTWFyZ2luKG1hcmdpbjogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbGF5b3V0KHsgZWRpdG9yTWFyZ2luOiBtYXJnaW4gfSk7XG5cdH1cblxuXHRnZXQgZWRpdG9yTWFyZ2luKCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVXNlIENlbGwubGF5b3V0SW5mby5lZGl0b3JNYXJnaW4nKTtcblx0fVxuXG5cdHNldCBtZXRhZGF0YVN0YXR1c0hlaWdodChoZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2xheW91dCh7IG1ldGFkYXRhU3RhdHVzSGVpZ2h0OiBoZWlnaHQgfSk7XG5cdH1cblxuXHRnZXQgbWV0YWRhdGFTdGF0dXNIZWlnaHQoKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgQ2VsbC5sYXlvdXRJbmZvLm91dHB1dFN0YXR1c0hlaWdodCcpO1xuXHR9XG5cblx0c2V0IG1ldGFkYXRhSGVpZ2h0KGhlaWdodDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbGF5b3V0KHsgbWV0YWRhdGFIZWlnaHQ6IGhlaWdodCB9KTtcblx0fVxuXG5cdGdldCBtZXRhZGF0YUhlaWdodCgpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBDZWxsLmxheW91dEluZm8ubWV0YWRhdGFIZWlnaHQnKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlck91dHB1dCA9IHRydWU7XG5cblx0c2V0IHJlbmRlck91dHB1dCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3JlbmRlck91dHB1dCA9IHZhbHVlO1xuXHRcdHRoaXMuX2xheW91dCh7IHJlY29tcHV0ZU91dHB1dDogdHJ1ZSB9KTtcblx0XHR0aGlzLl9zdGF0ZUNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlbmRlck91dHB1dDogdGhpcy5fcmVuZGVyT3V0cHV0IH0pO1xuXHR9XG5cblx0Z2V0IHJlbmRlck91dHB1dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyT3V0cHV0O1xuXHR9XG5cblx0Z2V0IGxheW91dEluZm8oKTogSURpZmZFbGVtZW50TGF5b3V0SW5mbyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dEluZm87XG5cdH1cblxuXHRnZXQgdG90YWxIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgaWdub3JlT3V0cHV0cygpIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignbm90ZWJvb2suZGlmZi5pZ25vcmVPdXRwdXRzJykgfHwgISEodGhpcy5tYWluRG9jdW1lbnRUZXh0TW9kZWw/LnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0cyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGlnbm9yZU1ldGFkYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdub3RlYm9vay5kaWZmLmlnbm9yZU1ldGFkYXRhJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zb3VyY2VFZGl0b3JWaWV3U3RhdGU6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdTdGF0ZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9vdXRwdXRFZGl0b3JWaWV3U3RhdGU6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdTdGF0ZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9tZXRhZGF0YUVkaXRvclZpZXdTdGF0ZTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCA9IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbDogRGlmZk5lc3RlZENlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkOiBEaWZmTmVzdGVkQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkRvY3VtZW50VGV4dE1vZGVsOiBJTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0b3JpZ2luYWw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRtb2RpZmllZDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IHR5cGU6ICd1bmNoYW5nZWQnIHwgJ2luc2VydCcgfCAnZGVsZXRlJyB8ICdtb2RpZmllZCcsXG5cdFx0ZWRpdG9yRXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsXG5cdFx0aW5pdERhdGE6IHtcblx0XHRcdG1ldGFkYXRhU3RhdHVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRvdXRwdXRTdGF0dXNIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5kZXg6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yOiBJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG1haW5Eb2N1bWVudFRleHRNb2RlbCwgZWRpdG9yRXZlbnREaXNwYXRjaGVyLCBpbml0RGF0YSk7XG5cdFx0dGhpcy5vcmlnaW5hbCA9IG9yaWdpbmFsID8gdGhpcy5fcmVnaXN0ZXIobmV3IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsKG9yaWdpbmFsLCBub3RlYm9va1NlcnZpY2UpKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLm1vZGlmaWVkID0gbW9kaWZpZWQgPyB0aGlzLl9yZWdpc3RlcihuZXcgRGlmZk5lc3RlZENlbGxWaWV3TW9kZWwobW9kaWZpZWQsIG5vdGVib29rU2VydmljZSkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMuX2VzdGltYXRlRWRpdG9ySGVpZ2h0KGluaXREYXRhLmZvbnRJbmZvKTtcblx0XHRjb25zdCBjZWxsU3RhdHVzSGVpZ2h0ID0gUHJvcGVydHlIZWFkZXJIZWlnaHQ7XG5cdFx0dGhpcy5fbGF5b3V0SW5mbyA9IHtcblx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0ZWRpdG9ySGVpZ2h0OiBlZGl0b3JIZWlnaHQsXG5cdFx0XHRlZGl0b3JNYXJnaW46IDAsXG5cdFx0XHRtZXRhZGF0YUhlaWdodDogMCxcblx0XHRcdGNlbGxTdGF0dXNIZWlnaHQsXG5cdFx0XHRtZXRhZGF0YVN0YXR1c0hlaWdodDogdGhpcy5pZ25vcmVNZXRhZGF0YSA/IDAgOiBQcm9wZXJ0eUhlYWRlckhlaWdodCxcblx0XHRcdHJhd091dHB1dEhlaWdodDogMCxcblx0XHRcdG91dHB1dFRvdGFsSGVpZ2h0OiAwLFxuXHRcdFx0b3V0cHV0U3RhdHVzSGVpZ2h0OiB0aGlzLmlnbm9yZU91dHB1dHMgPyAwIDogUHJvcGVydHlIZWFkZXJIZWlnaHQsXG5cdFx0XHRvdXRwdXRNZXRhZGF0YUhlaWdodDogMCxcblx0XHRcdGJvZHlNYXJnaW46IDMyLFxuXHRcdFx0dG90YWxIZWlnaHQ6IDgyICsgY2VsbFN0YXR1c0hlaWdodCArIGVkaXRvckhlaWdodCxcblx0XHRcdGxheW91dFN0YXRlOiBDZWxsTGF5b3V0U3RhdGUuVW5pbml0aWFsaXplZFxuXHRcdH07XG5cblx0XHR0aGlzLmNlbGxGb2xkaW5nU3RhdGUgPSBtb2RpZmllZD8uZ2V0VGV4dEJ1ZmZlckhhc2goKSAhPT0gb3JpZ2luYWw/LmdldFRleHRCdWZmZXJIYXNoKCkgPyBQcm9wZXJ0eUZvbGRpbmdTdGF0ZS5FeHBhbmRlZCA6IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkNvbGxhcHNlZDtcblx0XHR0aGlzLm1ldGFkYXRhRm9sZGluZ1N0YXRlID0gUHJvcGVydHlGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXHRcdHRoaXMub3V0cHV0Rm9sZGluZ1N0YXRlID0gUHJvcGVydHlGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXHR9XG5cblx0bGF5b3V0Q2hhbmdlKCkge1xuXHRcdHRoaXMuX2xheW91dCh7IHJlY29tcHV0ZU91dHB1dDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2VzdGltYXRlRWRpdG9ySGVpZ2h0KGZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBmb250SW5mbz8ubGluZUhlaWdodCA/PyAxNztcblxuXHRcdHN3aXRjaCAodGhpcy50eXBlKSB7XG5cdFx0XHRjYXNlICd1bmNoYW5nZWQnOlxuXHRcdFx0Y2FzZSAnaW5zZXJ0Jzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMubW9kaWZpZWQhLnRleHRNb2RlbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IGxpbmVDb3VudCAqIGxpbmVIZWlnaHQgKyBnZXRFZGl0b3JQYWRkaW5nKGxpbmVDb3VudCkudG9wICsgZ2V0RWRpdG9yUGFkZGluZyhsaW5lQ291bnQpLmJvdHRvbTtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9ySGVpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy5vcmlnaW5hbCEudGV4dE1vZGVsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gbGluZUNvdW50ICogbGluZUhlaWdodCArIGdldEVkaXRvclBhZGRpbmcobGluZUNvdW50KS50b3AgKyBnZXRFZGl0b3JQYWRkaW5nKGxpbmVDb3VudCkuYm90dG9tO1xuXHRcdFx0XHRcdHJldHVybiBlZGl0b3JIZWlnaHQ7XG5cdFx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2xheW91dChkZWx0YTogSUxheW91dEluZm9EZWx0YSkge1xuXHRcdGNvbnN0IHdpZHRoID0gZGVsdGEud2lkdGggIT09IHVuZGVmaW5lZCA/IGRlbHRhLndpZHRoIDogdGhpcy5fbGF5b3V0SW5mby53aWR0aDtcblx0XHRjb25zdCBlZGl0b3JIZWlnaHQgPSBkZWx0YS5lZGl0b3JIZWlnaHQgIT09IHVuZGVmaW5lZCA/IGRlbHRhLmVkaXRvckhlaWdodCA6IHRoaXMuX2xheW91dEluZm8uZWRpdG9ySGVpZ2h0O1xuXHRcdGNvbnN0IGVkaXRvck1hcmdpbiA9IGRlbHRhLmVkaXRvck1hcmdpbiAhPT0gdW5kZWZpbmVkID8gZGVsdGEuZWRpdG9yTWFyZ2luIDogdGhpcy5fbGF5b3V0SW5mby5lZGl0b3JNYXJnaW47XG5cdFx0Y29uc3QgbWV0YWRhdGFIZWlnaHQgPSBkZWx0YS5tZXRhZGF0YUhlaWdodCAhPT0gdW5kZWZpbmVkID8gZGVsdGEubWV0YWRhdGFIZWlnaHQgOiB0aGlzLl9sYXlvdXRJbmZvLm1ldGFkYXRhSGVpZ2h0O1xuXHRcdGNvbnN0IGNlbGxTdGF0dXNIZWlnaHQgPSBkZWx0YS5jZWxsU3RhdHVzSGVpZ2h0ICE9PSB1bmRlZmluZWQgPyBkZWx0YS5jZWxsU3RhdHVzSGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5jZWxsU3RhdHVzSGVpZ2h0O1xuXHRcdGNvbnN0IG1ldGFkYXRhU3RhdHVzSGVpZ2h0ID0gZGVsdGEubWV0YWRhdGFTdGF0dXNIZWlnaHQgIT09IHVuZGVmaW5lZCA/IGRlbHRhLm1ldGFkYXRhU3RhdHVzSGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YVN0YXR1c0hlaWdodDtcblx0XHRjb25zdCByYXdPdXRwdXRIZWlnaHQgPSBkZWx0YS5yYXdPdXRwdXRIZWlnaHQgIT09IHVuZGVmaW5lZCA/IGRlbHRhLnJhd091dHB1dEhlaWdodCA6IHRoaXMuX2xheW91dEluZm8ucmF3T3V0cHV0SGVpZ2h0O1xuXHRcdGNvbnN0IG91dHB1dFN0YXR1c0hlaWdodCA9IGRlbHRhLm91dHB1dFN0YXR1c0hlaWdodCAhPT0gdW5kZWZpbmVkID8gZGVsdGEub3V0cHV0U3RhdHVzSGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRTdGF0dXNIZWlnaHQ7XG5cdFx0Y29uc3QgYm9keU1hcmdpbiA9IGRlbHRhLmJvZHlNYXJnaW4gIT09IHVuZGVmaW5lZCA/IGRlbHRhLmJvZHlNYXJnaW4gOiB0aGlzLl9sYXlvdXRJbmZvLmJvZHlNYXJnaW47XG5cdFx0Y29uc3Qgb3V0cHV0TWV0YWRhdGFIZWlnaHQgPSBkZWx0YS5vdXRwdXRNZXRhZGF0YUhlaWdodCAhPT0gdW5kZWZpbmVkID8gZGVsdGEub3V0cHV0TWV0YWRhdGFIZWlnaHQgOiB0aGlzLl9sYXlvdXRJbmZvLm91dHB1dE1ldGFkYXRhSGVpZ2h0O1xuXHRcdGNvbnN0IG91dHB1dEhlaWdodCA9IHRoaXMuaWdub3JlT3V0cHV0cyA/IDAgOiAoZGVsdGEucmVjb21wdXRlT3V0cHV0IHx8IGRlbHRhLnJhd091dHB1dEhlaWdodCAhPT0gdW5kZWZpbmVkIHx8IGRlbHRhLm91dHB1dE1ldGFkYXRhSGVpZ2h0ICE9PSB1bmRlZmluZWQpID8gdGhpcy5fZ2V0T3V0cHV0VG90YWxIZWlnaHQocmF3T3V0cHV0SGVpZ2h0LCBvdXRwdXRNZXRhZGF0YUhlaWdodCkgOiB0aGlzLl9sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0O1xuXG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSBlZGl0b3JIZWlnaHRcblx0XHRcdCsgZWRpdG9yTWFyZ2luXG5cdFx0XHQrIGNlbGxTdGF0dXNIZWlnaHRcblx0XHRcdCsgbWV0YWRhdGFIZWlnaHRcblx0XHRcdCsgbWV0YWRhdGFTdGF0dXNIZWlnaHRcblx0XHRcdCsgb3V0cHV0SGVpZ2h0XG5cdFx0XHQrIG91dHB1dFN0YXR1c0hlaWdodFxuXHRcdFx0KyBib2R5TWFyZ2luO1xuXG5cdFx0Y29uc3QgbmV3TGF5b3V0OiBJRGlmZkVsZW1lbnRMYXlvdXRJbmZvID0ge1xuXHRcdFx0d2lkdGg6IHdpZHRoLFxuXHRcdFx0ZWRpdG9ySGVpZ2h0OiBlZGl0b3JIZWlnaHQsXG5cdFx0XHRlZGl0b3JNYXJnaW46IGVkaXRvck1hcmdpbixcblx0XHRcdG1ldGFkYXRhSGVpZ2h0OiBtZXRhZGF0YUhlaWdodCxcblx0XHRcdGNlbGxTdGF0dXNIZWlnaHQsXG5cdFx0XHRtZXRhZGF0YVN0YXR1c0hlaWdodDogbWV0YWRhdGFTdGF0dXNIZWlnaHQsXG5cdFx0XHRvdXRwdXRUb3RhbEhlaWdodDogb3V0cHV0SGVpZ2h0LFxuXHRcdFx0b3V0cHV0U3RhdHVzSGVpZ2h0OiBvdXRwdXRTdGF0dXNIZWlnaHQsXG5cdFx0XHRib2R5TWFyZ2luOiBib2R5TWFyZ2luLFxuXHRcdFx0cmF3T3V0cHV0SGVpZ2h0OiByYXdPdXRwdXRIZWlnaHQsXG5cdFx0XHRvdXRwdXRNZXRhZGF0YUhlaWdodDogb3V0cHV0TWV0YWRhdGFIZWlnaHQsXG5cdFx0XHR0b3RhbEhlaWdodDogdG90YWxIZWlnaHQsXG5cdFx0XHRsYXlvdXRTdGF0ZTogQ2VsbExheW91dFN0YXRlLk1lYXN1cmVkXG5cdFx0fTtcblxuXHRcdGxldCBzb21ldGhpbmdDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRjb25zdCBjaGFuZ2VFdmVudDogQ2VsbERpZmZWaWV3TW9kZWxMYXlvdXRDaGFuZ2VFdmVudCA9IHt9O1xuXG5cdFx0aWYgKG5ld0xheW91dC53aWR0aCAhPT0gdGhpcy5fbGF5b3V0SW5mby53aWR0aCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQud2lkdGggPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5lZGl0b3JIZWlnaHQgIT09IHRoaXMuX2xheW91dEluZm8uZWRpdG9ySGVpZ2h0KSB7XG5cdFx0XHRjaGFuZ2VFdmVudC5lZGl0b3JIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5lZGl0b3JNYXJnaW4gIT09IHRoaXMuX2xheW91dEluZm8uZWRpdG9yTWFyZ2luKSB7XG5cdFx0XHRjaGFuZ2VFdmVudC5lZGl0b3JNYXJnaW4gPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5tZXRhZGF0YUhlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YUhlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQubWV0YWRhdGFIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5jZWxsU3RhdHVzSGVpZ2h0ICE9PSB0aGlzLl9sYXlvdXRJbmZvLmNlbGxTdGF0dXNIZWlnaHQpIHtcblx0XHRcdGNoYW5nZUV2ZW50LmNlbGxTdGF0dXNIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5tZXRhZGF0YVN0YXR1c0hlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YVN0YXR1c0hlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQubWV0YWRhdGFTdGF0dXNIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5vdXRwdXRUb3RhbEhlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRUb3RhbEhlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQub3V0cHV0VG90YWxIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5vdXRwdXRTdGF0dXNIZWlnaHQgIT09IHRoaXMuX2xheW91dEluZm8ub3V0cHV0U3RhdHVzSGVpZ2h0KSB7XG5cdFx0XHRjaGFuZ2VFdmVudC5vdXRwdXRTdGF0dXNIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5ib2R5TWFyZ2luICE9PSB0aGlzLl9sYXlvdXRJbmZvLmJvZHlNYXJnaW4pIHtcblx0XHRcdGNoYW5nZUV2ZW50LmJvZHlNYXJnaW4gPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC5vdXRwdXRNZXRhZGF0YUhlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRNZXRhZGF0YUhlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQub3V0cHV0TWV0YWRhdGFIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xheW91dC50b3RhbEhlaWdodCAhPT0gdGhpcy5fbGF5b3V0SW5mby50b3RhbEhlaWdodCkge1xuXHRcdFx0Y2hhbmdlRXZlbnQudG90YWxIZWlnaHQgPSB0cnVlO1xuXHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNvbWV0aGluZ0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2xheW91dEluZm8gPSBuZXdMYXlvdXQ7XG5cdFx0XHR0aGlzLl9maXJlTGF5b3V0Q2hhbmdlRXZlbnQoY2hhbmdlRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGdldEhlaWdodChsaW5lSGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fbGF5b3V0SW5mby5sYXlvdXRTdGF0ZSA9PT0gQ2VsbExheW91dFN0YXRlLlVuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMuY2VsbEZvbGRpbmdTdGF0ZSA9PT0gUHJvcGVydHlGb2xkaW5nU3RhdGUuQ29sbGFwc2VkID8gMCA6IHRoaXMuY29tcHV0ZUlucHV0RWRpdG9ySGVpZ2h0KGxpbmVIZWlnaHQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVUb3RhbEhlaWdodChlZGl0b3JIZWlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlVG90YWxIZWlnaHQoZWRpdG9ySGVpZ2h0OiBudW1iZXIpIHtcblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IGVkaXRvckhlaWdodFxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLmVkaXRvck1hcmdpblxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLm1ldGFkYXRhSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8uY2VsbFN0YXR1c0hlaWdodFxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLm1ldGFkYXRhU3RhdHVzSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRNZXRhZGF0YUhlaWdodFxuXHRcdFx0KyB0aGlzLl9sYXlvdXRJbmZvLmJvZHlNYXJnaW47XG5cblx0XHRyZXR1cm4gdG90YWxIZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUlucHV0RWRpdG9ySGVpZ2h0KGxpbmVIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gTWF0aC5tYXgodGhpcy5vcmlnaW5hbD8udGV4dE1vZGVsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCkgPz8gMSwgdGhpcy5tb2RpZmllZD8udGV4dE1vZGVsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCkgPz8gMSk7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3IuY29tcHV0ZUhlaWdodEZyb21MaW5lcyhsaW5lQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3V0cHV0VG90YWxIZWlnaHQocmF3T3V0cHV0SGVpZ2h0OiBudW1iZXIsIG1ldGFkYXRhSGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5vdXRwdXRGb2xkaW5nU3RhdGUgPT09IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVuZGVyT3V0cHV0KSB7XG5cdFx0XHRpZiAodGhpcy5pc091dHB1dEVtcHR5KCkpIHtcblx0XHRcdFx0Ly8gc2luZ2xlIGxpbmU7XG5cdFx0XHRcdHJldHVybiAyNDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmdldFJpY2hPdXRwdXRUb3RhbEhlaWdodCgpICsgbWV0YWRhdGFIZWlnaHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiByYXdPdXRwdXRIZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZUxheW91dENoYW5nZUV2ZW50KHN0YXRlOiBDZWxsRGlmZlZpZXdNb2RlbExheW91dENoYW5nZUV2ZW50KSB7XG5cdFx0dGhpcy5fbGF5b3V0SW5mb0VtaXR0ZXIuZmlyZShzdGF0ZSk7XG5cdFx0dGhpcy5lZGl0b3JFdmVudERpc3BhdGNoZXIuZW1pdChbeyB0eXBlOiBOb3RlYm9va0RpZmZWaWV3RXZlbnRUeXBlLkNlbGxMYXlvdXRDaGFuZ2VkLCBzb3VyY2U6IHRoaXMuX2xheW91dEluZm8gfV0pO1xuXHR9XG5cblx0YWJzdHJhY3QgY2hlY2tJZklucHV0TW9kaWZpZWQoKTogZmFsc2UgfCB7IHJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdGFic3RyYWN0IGNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKTogZmFsc2UgfCB7IHJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdGFic3RyYWN0IGNoZWNrTWV0YWRhdGFJZk1vZGlmaWVkKCk6IGZhbHNlIHwgeyByZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRhYnN0cmFjdCBpc091dHB1dEVtcHR5KCk6IGJvb2xlYW47XG5cdGFic3RyYWN0IGdldFJpY2hPdXRwdXRUb3RhbEhlaWdodCgpOiBudW1iZXI7XG5cdGFic3RyYWN0IGdldENlbGxCeVVyaShjZWxsVXJpOiBVUkkpOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWw7XG5cdGFic3RyYWN0IGdldE91dHB1dE9mZnNldEluQ2VsbChkaWZmU2lkZTogRGlmZlNpZGUsIGluZGV4OiBudW1iZXIpOiBudW1iZXI7XG5cdGFic3RyYWN0IGdldE91dHB1dE9mZnNldEluQ29udGFpbmVyKGRpZmZTaWRlOiBEaWZmU2lkZSwgaW5kZXg6IG51bWJlcik6IG51bWJlcjtcblx0YWJzdHJhY3QgdXBkYXRlT3V0cHV0SGVpZ2h0KGRpZmZTaWRlOiBEaWZmU2lkZSwgaW5kZXg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xuXHRhYnN0cmFjdCBnZXROZXN0ZWRDZWxsVmlld01vZGVsKGRpZmZTaWRlOiBEaWZmU2lkZSk6IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsO1xuXG5cdGdldENvbXB1dGVkQ2VsbENvbnRhaW5lcldpZHRoKGxheW91dEluZm86IE5vdGVib29rTGF5b3V0SW5mbywgZGlmZkVkaXRvcjogYm9vbGVhbiwgZnVsbFdpZHRoOiBib29sZWFuKSB7XG5cdFx0aWYgKGZ1bGxXaWR0aCkge1xuXHRcdFx0cmV0dXJuIGxheW91dEluZm8ud2lkdGggLSAyICogRElGRl9DRUxMX01BUkdJTiArIChkaWZmRWRpdG9yID8gRGlmZkVkaXRvcldpZGdldC5FTlRJUkVfRElGRl9PVkVSVklFV19XSURUSCA6IDApIC0gMjtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGxheW91dEluZm8ud2lkdGggLSAyICogRElGRl9DRUxMX01BUkdJTiArIChkaWZmRWRpdG9yID8gRGlmZkVkaXRvcldpZGdldC5FTlRJUkVfRElGRl9PVkVSVklFV19XSURUSCA6IDApKSAvIDIgLSAxOCAtIDI7XG5cdH1cblxuXHRnZXRPdXRwdXRFZGl0b3JWaWV3U3RhdGUoKTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX291dHB1dEVkaXRvclZpZXdTdGF0ZTtcblx0fVxuXG5cdHNhdmVPdXRwdXRFZGl0b3JWaWV3U3RhdGUodmlld1N0YXRlOiBlZGl0b3JDb21tb24uSUNvZGVFZGl0b3JWaWV3U3RhdGUgfCBlZGl0b3JDb21tb24uSURpZmZFZGl0b3JWaWV3U3RhdGUgfCBudWxsKSB7XG5cdFx0dGhpcy5fb3V0cHV0RWRpdG9yVmlld1N0YXRlID0gdmlld1N0YXRlO1xuXHR9XG5cblx0Z2V0TWV0YWRhdGFFZGl0b3JWaWV3U3RhdGUoKTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21ldGFkYXRhRWRpdG9yVmlld1N0YXRlO1xuXHR9XG5cblx0c2F2ZU1ldGFkYXRhRWRpdG9yVmlld1N0YXRlKHZpZXdTdGF0ZTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCkge1xuXHRcdHRoaXMuX21ldGFkYXRhRWRpdG9yVmlld1N0YXRlID0gdmlld1N0YXRlO1xuXHR9XG5cblx0Z2V0U291cmNlRWRpdG9yVmlld1N0YXRlKCk6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdTdGF0ZSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2VFZGl0b3JWaWV3U3RhdGU7XG5cdH1cblxuXHRzYXZlU3BpcmNlRWRpdG9yVmlld1N0YXRlKHZpZXdTdGF0ZTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yVmlld1N0YXRlIHwgbnVsbCkge1xuXHRcdHRoaXMuX3NvdXJjZUVkaXRvclZpZXdTdGF0ZSA9IHZpZXdTdGF0ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsIGV4dGVuZHMgRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSB7XG5cdGdldCBvcmlnaW5hbERvY3VtZW50KCkge1xuXHRcdHJldHVybiB0aGlzLm90aGVyRG9jdW1lbnRUZXh0TW9kZWw7XG5cdH1cblxuXHRnZXQgbW9kaWZpZWREb2N1bWVudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5tYWluRG9jdW1lbnRUZXh0TW9kZWw7XG5cdH1cblxuXHRkZWNsYXJlIHJlYWRvbmx5IG9yaWdpbmFsOiBEaWZmTmVzdGVkQ2VsbFZpZXdNb2RlbDtcblx0ZGVjbGFyZSByZWFkb25seSBtb2RpZmllZDogRGlmZk5lc3RlZENlbGxWaWV3TW9kZWw7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHR5cGU6ICd1bmNoYW5nZWQnIHwgJ21vZGlmaWVkJztcblxuXHQvKipcblx0ICogVGhlIGhlaWdodCBvZiB0aGUgZWRpdG9yIHdoZW4gdGhlIHVuY2hhbmdlZCBsaW5lcyBhcmUgY29sbGFwc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBlZGl0b3JIZWlnaHRXaXRoVW5jaGFuZ2VkTGluZXNDb2xsYXBzZWQ/OiBudW1iZXI7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Eb2N1bWVudFRleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cmVhZG9ubHkgb3RoZXJEb2N1bWVudFRleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0b3JpZ2luYWw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCxcblx0XHRtb2RpZmllZDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLFxuXHRcdHR5cGU6ICd1bmNoYW5nZWQnIHwgJ21vZGlmaWVkJyxcblx0XHRlZGl0b3JFdmVudERpc3BhdGNoZXI6IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcixcblx0XHRpbml0RGF0YToge1xuXHRcdFx0bWV0YWRhdGFTdGF0dXNIZWlnaHQ6IG51bWJlcjtcblx0XHRcdG91dHB1dFN0YXR1c0hlaWdodDogbnVtYmVyO1xuXHRcdFx0Zm9udEluZm86IEZvbnRJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0bm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHRkaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvcjogSURpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdG1haW5Eb2N1bWVudFRleHRNb2RlbCxcblx0XHRcdG9yaWdpbmFsLFxuXHRcdFx0bW9kaWZpZWQsXG5cdFx0XHR0eXBlLFxuXHRcdFx0ZWRpdG9yRXZlbnREaXNwYXRjaGVyLFxuXHRcdFx0aW5pdERhdGEsXG5cdFx0XHRub3RlYm9va1NlcnZpY2UsXG5cdFx0XHRpbmRleCxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3IpO1xuXG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblxuXHRcdHRoaXMuY2VsbEZvbGRpbmdTdGF0ZSA9IHRoaXMubW9kaWZpZWQudGV4dE1vZGVsLmdldFZhbHVlKCkgIT09IHRoaXMub3JpZ2luYWwudGV4dE1vZGVsLmdldFZhbHVlKCkgPyBQcm9wZXJ0eUZvbGRpbmdTdGF0ZS5FeHBhbmRlZCA6IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkNvbGxhcHNlZDtcblx0XHR0aGlzLm1ldGFkYXRhRm9sZGluZ1N0YXRlID0gUHJvcGVydHlGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXHRcdHRoaXMub3V0cHV0Rm9sZGluZ1N0YXRlID0gUHJvcGVydHlGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXG5cdFx0aWYgKHRoaXMuY2hlY2tNZXRhZGF0YUlmTW9kaWZpZWQoKSkge1xuXHRcdFx0dGhpcy5tZXRhZGF0YUZvbGRpbmdTdGF0ZSA9IFByb3BlcnR5Rm9sZGluZ1N0YXRlLkV4cGFuZGVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKSkge1xuXHRcdFx0dGhpcy5vdXRwdXRGb2xkaW5nU3RhdGUgPSBQcm9wZXJ0eUZvbGRpbmdTdGF0ZS5FeHBhbmRlZDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9yaWdpbmFsLm9uRGlkQ2hhbmdlT3V0cHV0TGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xheW91dCh7IHJlY29tcHV0ZU91dHB1dDogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGlmaWVkLm9uRGlkQ2hhbmdlT3V0cHV0TGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xheW91dCh7IHJlY29tcHV0ZU91dHB1dDogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGlmaWVkLnRleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKG1haW5Eb2N1bWVudFRleHRNb2RlbC50cmFuc2llbnRPcHRpb25zLmNlbGxDb250ZW50TWV0YWRhdGEpIHtcblx0XHRcdFx0Y29uc3QgY2VsbE1ldGFkYXRhS2V5cyA9IFsuLi5PYmplY3Qua2V5cyhtYWluRG9jdW1lbnRUZXh0TW9kZWwudHJhbnNpZW50T3B0aW9ucy5jZWxsQ29udGVudE1ldGFkYXRhKV07XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkTWVkYXRhUmF3ID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5tb2RpZmllZC5tZXRhZGF0YSk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsQ2VsbE1ldGFkYXRhID0gdGhpcy5vcmlnaW5hbC5tZXRhZGF0YTtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgY2VsbE1ldGFkYXRhS2V5cykge1xuXHRcdFx0XHRcdGlmIChPYmplY3QuaGFzT3duKG9yaWdpbmFsQ2VsbE1ldGFkYXRhLCBrZXkpKSB7XG5cdFx0XHRcdFx0XHRtb2RpZmllZE1lZGF0YVJhd1trZXldID0gb3JpZ2luYWxDZWxsTWV0YWRhdGFba2V5XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLm1vZGlmaWVkLnRleHRNb2RlbC5tZXRhZGF0YSA9IG1vZGlmaWVkTWVkYXRhUmF3O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNoZWNrSWZJbnB1dE1vZGlmaWVkKCk6IGZhbHNlIHwgeyByZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0XHRpZiAodGhpcy5vcmlnaW5hbC50ZXh0TW9kZWwuZ2V0VGV4dEJ1ZmZlckhhc2goKSA9PT0gdGhpcy5tb2RpZmllZC50ZXh0TW9kZWwuZ2V0VGV4dEJ1ZmZlckhhc2goKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVhc29uOiAnQ2VsbCBjb250ZW50IGhhcyBjaGFuZ2VkJyxcblx0XHR9O1xuXHR9XG5cdGNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKSB7XG5cdFx0aWYgKHRoaXMubWFpbkRvY3VtZW50VGV4dE1vZGVsLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0cyB8fCB0aGlzLmlnbm9yZU91dHB1dHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCByZXQgPSBvdXRwdXRzRXF1YWwodGhpcy5vcmlnaW5hbD8ub3V0cHV0cyA/PyBbXSwgdGhpcy5tb2RpZmllZD8ub3V0cHV0cyA/PyBbXSk7XG5cblx0XHRpZiAocmV0ID09PSBPdXRwdXRDb21wYXJpc29uLlVuY2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZWFzb246IHJldCA9PT0gT3V0cHV0Q29tcGFyaXNvbi5NZXRhZGF0YSA/ICdPdXRwdXQgbWV0YWRhdGEgaGFzIGNoYW5nZWQnIDogdW5kZWZpbmVkLFxuXHRcdFx0a2luZDogcmV0XG5cdFx0fTtcblx0fVxuXG5cdGNoZWNrTWV0YWRhdGFJZk1vZGlmaWVkKCkge1xuXHRcdGlmICh0aGlzLmlnbm9yZU1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGlmaWVkID0gaGFzaChnZXRGb3JtYXR0ZWRNZXRhZGF0YUpTT04odGhpcy5tYWluRG9jdW1lbnRUZXh0TW9kZWwudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnRDZWxsTWV0YWRhdGEsIHRoaXMub3JpZ2luYWw/Lm1ldGFkYXRhIHx8IHt9LCB0aGlzLm9yaWdpbmFsPy5sYW5ndWFnZSkpICE9PSBoYXNoKGdldEZvcm1hdHRlZE1ldGFkYXRhSlNPTih0aGlzLm1haW5Eb2N1bWVudFRleHRNb2RlbC50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudENlbGxNZXRhZGF0YSwgdGhpcy5tb2RpZmllZD8ubWV0YWRhdGEgPz8ge30sIHRoaXMubW9kaWZpZWQ/Lmxhbmd1YWdlKSk7XG5cdFx0aWYgKG1vZGlmaWVkKSB7XG5cdFx0XHRyZXR1cm4geyByZWFzb246IHVuZGVmaW5lZCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlT3V0cHV0SGVpZ2h0KGRpZmZTaWRlOiBEaWZmU2lkZSwgaW5kZXg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAoZGlmZlNpZGUgPT09IERpZmZTaWRlLk9yaWdpbmFsKSB7XG5cdFx0XHR0aGlzLm9yaWdpbmFsLnVwZGF0ZU91dHB1dEhlaWdodChpbmRleCwgaGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RpZmllZC51cGRhdGVPdXRwdXRIZWlnaHQoaW5kZXgsIGhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3V0cHV0T2Zmc2V0SW5Db250YWluZXIoZGlmZlNpZGU6IERpZmZTaWRlLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0aWYgKGRpZmZTaWRlID09PSBEaWZmU2lkZS5PcmlnaW5hbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3JpZ2luYWwuZ2V0T3V0cHV0T2Zmc2V0KGluZGV4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kaWZpZWQuZ2V0T3V0cHV0T2Zmc2V0KGluZGV4KTtcblx0XHR9XG5cdH1cblxuXHRnZXRPdXRwdXRPZmZzZXRJbkNlbGwoZGlmZlNpZGU6IERpZmZTaWRlLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgb2Zmc2V0SW5PdXRwdXRzQ29udGFpbmVyID0gdGhpcy5nZXRPdXRwdXRPZmZzZXRJbkNvbnRhaW5lcihkaWZmU2lkZSwgaW5kZXgpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dEluZm8uZWRpdG9ySGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8uZWRpdG9yTWFyZ2luXG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ubWV0YWRhdGFIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5jZWxsU3RhdHVzSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ubWV0YWRhdGFTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5ib2R5TWFyZ2luIC8gMlxuXHRcdFx0KyBvZmZzZXRJbk91dHB1dHNDb250YWluZXI7XG5cdH1cblxuXHRpc091dHB1dEVtcHR5KCkge1xuXHRcdGlmICh0aGlzLm1haW5Eb2N1bWVudFRleHRNb2RlbC50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudE91dHB1dHMpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIG91dHB1dHMgYXJlIG5vdCBjaGFuZ2VkXG5cblx0XHRyZXR1cm4gKHRoaXMub3JpZ2luYWw/Lm91dHB1dHMgfHwgW10pLmxlbmd0aCA9PT0gMDtcblx0fVxuXG5cdGdldFJpY2hPdXRwdXRUb3RhbEhlaWdodCgpIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgodGhpcy5vcmlnaW5hbC5nZXRPdXRwdXRUb3RhbEhlaWdodCgpLCB0aGlzLm1vZGlmaWVkLmdldE91dHB1dFRvdGFsSGVpZ2h0KCkpO1xuXHR9XG5cblx0Z2V0TmVzdGVkQ2VsbFZpZXdNb2RlbChkaWZmU2lkZTogRGlmZlNpZGUpOiBEaWZmTmVzdGVkQ2VsbFZpZXdNb2RlbCB7XG5cdFx0cmV0dXJuIGRpZmZTaWRlID09PSBEaWZmU2lkZS5PcmlnaW5hbCA/IHRoaXMub3JpZ2luYWwgOiB0aGlzLm1vZGlmaWVkO1xuXHR9XG5cblx0Z2V0Q2VsbEJ5VXJpKGNlbGxVcmk6IFVSSSk6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCB7XG5cdFx0aWYgKGNlbGxVcmkudG9TdHJpbmcoKSA9PT0gdGhpcy5vcmlnaW5hbC51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3JpZ2luYWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGlmaWVkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlSW5wdXRFZGl0b3JIZWlnaHQobGluZUhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy50eXBlID09PSAnbW9kaWZpZWQnICYmXG5cdFx0XHR0eXBlb2YgdGhpcy5lZGl0b3JIZWlnaHRXaXRoVW5jaGFuZ2VkTGluZXNDb2xsYXBzZWQgPT09ICdudW1iZXInICYmXG5cdFx0XHR0aGlzLmNoZWNrSWZJbnB1dE1vZGlmaWVkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRvckhlaWdodFdpdGhVbmNoYW5nZWRMaW5lc0NvbGxhcHNlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuY29tcHV0ZUlucHV0RWRpdG9ySGVpZ2h0KGxpbmVIZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlTW9kaWZpZWRJbnB1dEVkaXRvckhlaWdodCgpIHtcblx0XHRpZiAodGhpcy5jaGVja0lmSW5wdXRNb2RpZmllZCgpKSB7XG5cdFx0XHR0aGlzLmVkaXRvckhlaWdodFdpdGhVbmNoYW5nZWRMaW5lc0NvbGxhcHNlZCA9IHRoaXMuX2xheW91dEluZm8uZWRpdG9ySGVpZ2h0ID0gYXdhaXQgdGhpcy5kaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci5kaWZmQW5kQ29tcHV0ZUhlaWdodCh0aGlzLm9yaWdpbmFsLnVyaSwgdGhpcy5tb2RpZmllZC51cmkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZU1vZGlmaWVkTWV0YWRhdGFFZGl0b3JIZWlnaHQoKSB7XG5cdFx0aWYgKHRoaXMuY2hlY2tNZXRhZGF0YUlmTW9kaWZpZWQoKSkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxNZXRhZGF0YVVyaSA9IENlbGxVcmkuZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkodGhpcy5vcmlnaW5hbERvY3VtZW50LnVyaSwgdGhpcy5vcmlnaW5hbC5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRNZXRhZGF0YVVyaSA9IENlbGxVcmkuZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkodGhpcy5tb2RpZmllZERvY3VtZW50LnVyaSwgdGhpcy5tb2RpZmllZC5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEpO1xuXHRcdFx0dGhpcy5fbGF5b3V0SW5mby5tZXRhZGF0YUhlaWdodCA9IGF3YWl0IHRoaXMuZGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWxNZXRhZGF0YVVyaSwgbW9kaWZpZWRNZXRhZGF0YVVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGVFZGl0b3JIZWlnaHRzKCkge1xuXHRcdGlmICh0aGlzLnR5cGUgPT09ICd1bmNoYW5nZWQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuY29tcHV0ZU1vZGlmaWVkSW5wdXRFZGl0b3JIZWlnaHQoKSwgdGhpcy5jb21wdXRlTW9kaWZpZWRNZXRhZGF0YUVkaXRvckhlaWdodCgpXSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU2luZ2xlU2lkZURpZmZFbGVtZW50Vmlld01vZGVsIGV4dGVuZHMgRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSB7XG5cdGdldCBjZWxsVmlld01vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLnR5cGUgPT09ICdpbnNlcnQnID8gdGhpcy5tb2RpZmllZCEgOiB0aGlzLm9yaWdpbmFsITtcblx0fVxuXG5cdGdldCBvcmlnaW5hbERvY3VtZW50KCkge1xuXHRcdGlmICh0aGlzLnR5cGUgPT09ICdpbnNlcnQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vdGhlckRvY3VtZW50VGV4dE1vZGVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tYWluRG9jdW1lbnRUZXh0TW9kZWw7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG1vZGlmaWVkRG9jdW1lbnQoKSB7XG5cdFx0aWYgKHRoaXMudHlwZSA9PT0gJ2luc2VydCcpIHtcblx0XHRcdHJldHVybiB0aGlzLm1haW5Eb2N1bWVudFRleHRNb2RlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMub3RoZXJEb2N1bWVudFRleHRNb2RlbDtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSByZWFkb25seSB0eXBlOiAnaW5zZXJ0JyB8ICdkZWxldGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Eb2N1bWVudFRleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cmVhZG9ubHkgb3RoZXJEb2N1bWVudFRleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0b3JpZ2luYWw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRtb2RpZmllZDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHR5cGU6ICdpbnNlcnQnIHwgJ2RlbGV0ZScsXG5cdFx0ZWRpdG9yRXZlbnREaXNwYXRjaGVyOiBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIsXG5cdFx0aW5pdERhdGE6IHtcblx0XHRcdG1ldGFkYXRhU3RhdHVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRvdXRwdXRTdGF0dXNIZWlnaHQ6IG51bWJlcjtcblx0XHRcdGZvbnRJbmZvOiBGb250SW5mbyB8IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdGRpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yOiBJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlLFxuXHRcdGluZGV4OiBudW1iZXJcblx0KSB7XG5cdFx0c3VwZXIobWFpbkRvY3VtZW50VGV4dE1vZGVsLCBvcmlnaW5hbCwgbW9kaWZpZWQsIHR5cGUsIGVkaXRvckV2ZW50RGlzcGF0Y2hlciwgaW5pdERhdGEsIG5vdGVib29rU2VydmljZSwgaW5kZXgsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBkaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvcik7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2VsbFZpZXdNb2RlbC5vbkRpZENoYW5nZU91dHB1dExheW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXlvdXQoeyByZWNvbXB1dGVPdXRwdXQ6IHRydWUgfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2hlY2tJZklucHV0TW9kaWZpZWQoKTogZmFsc2UgfCB7IHJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZWFzb246ICdDZWxsIGNvbnRlbnQgaGFzIGNoYW5nZWQnLFxuXHRcdH07XG5cdH1cblxuXHRnZXROZXN0ZWRDZWxsVmlld01vZGVsKGRpZmZTaWRlOiBEaWZmU2lkZSk6IERpZmZOZXN0ZWRDZWxsVmlld01vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy50eXBlID09PSAnaW5zZXJ0JyA/IHRoaXMubW9kaWZpZWQhIDogdGhpcy5vcmlnaW5hbCE7XG5cdH1cblxuXG5cdGNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKTogZmFsc2UgfCB7IHJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNoZWNrTWV0YWRhdGFJZk1vZGlmaWVkKCk6IGZhbHNlIHwgeyByZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHR1cGRhdGVPdXRwdXRIZWlnaHQoZGlmZlNpZGU6IERpZmZTaWRlLCBpbmRleDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuY2VsbFZpZXdNb2RlbD8udXBkYXRlT3V0cHV0SGVpZ2h0KGluZGV4LCBoZWlnaHQpO1xuXHR9XG5cblx0Z2V0T3V0cHV0T2Zmc2V0SW5Db250YWluZXIoZGlmZlNpZGU6IERpZmZTaWRlLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2VsbFZpZXdNb2RlbC5nZXRPdXRwdXRPZmZzZXQoaW5kZXgpO1xuXHR9XG5cblx0Z2V0T3V0cHV0T2Zmc2V0SW5DZWxsKGRpZmZTaWRlOiBEaWZmU2lkZSwgaW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IG9mZnNldEluT3V0cHV0c0NvbnRhaW5lciA9IHRoaXMuY2VsbFZpZXdNb2RlbC5nZXRPdXRwdXRPZmZzZXQoaW5kZXgpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dEluZm8uZWRpdG9ySGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8uZWRpdG9yTWFyZ2luXG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ubWV0YWRhdGFIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5jZWxsU3RhdHVzSGVpZ2h0XG5cdFx0XHQrIHRoaXMuX2xheW91dEluZm8ubWV0YWRhdGFTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5vdXRwdXRTdGF0dXNIZWlnaHRcblx0XHRcdCsgdGhpcy5fbGF5b3V0SW5mby5ib2R5TWFyZ2luIC8gMlxuXHRcdFx0KyBvZmZzZXRJbk91dHB1dHNDb250YWluZXI7XG5cdH1cblxuXHRpc091dHB1dEVtcHR5KCkge1xuXHRcdGlmICh0aGlzLm1haW5Eb2N1bWVudFRleHRNb2RlbC50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudE91dHB1dHMpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIG91dHB1dHMgYXJlIG5vdCBjaGFuZ2VkXG5cblx0XHRyZXR1cm4gKHRoaXMub3JpZ2luYWw/Lm91dHB1dHMgfHwgdGhpcy5tb2RpZmllZD8ub3V0cHV0cyB8fCBbXSkubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Z2V0UmljaE91dHB1dFRvdGFsSGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLmNlbGxWaWV3TW9kZWw/LmdldE91dHB1dFRvdGFsSGVpZ2h0KCkgPz8gMDtcblx0fVxuXG5cdGdldENlbGxCeVVyaShjZWxsVXJpOiBVUkkpOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLmNlbGxWaWV3TW9kZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gT3V0cHV0Q29tcGFyaXNvbiB7XG5cdFVuY2hhbmdlZCA9IDAsXG5cdE1ldGFkYXRhID0gMSxcblx0T3RoZXIgPSAyXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvdXRwdXRFcXVhbChhOiBJQ2VsbE91dHB1dCwgYjogSUNlbGxPdXRwdXQpOiBPdXRwdXRDb21wYXJpc29uIHtcblx0aWYgKGhhc2goYS5tZXRhZGF0YSkgPT09IGhhc2goYi5tZXRhZGF0YSkpIHtcblx0XHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5PdGhlcjtcblx0fVxuXG5cdC8vIG1ldGFkYXRhIG5vdCBlcXVhbFxuXHRmb3IgKGxldCBqID0gMDsgaiA8IGEub3V0cHV0cy5sZW5ndGg7IGorKykge1xuXHRcdGNvbnN0IGFPdXRwdXRJdGVtID0gYS5vdXRwdXRzW2pdO1xuXHRcdGNvbnN0IGJPdXRwdXRJdGVtID0gYi5vdXRwdXRzW2pdO1xuXG5cdFx0aWYgKGFPdXRwdXRJdGVtLm1pbWUgIT09IGJPdXRwdXRJdGVtLm1pbWUpIHtcblx0XHRcdHJldHVybiBPdXRwdXRDb21wYXJpc29uLk90aGVyO1xuXHRcdH1cblxuXHRcdGlmIChhT3V0cHV0SXRlbS5kYXRhLmJ1ZmZlci5sZW5ndGggIT09IGJPdXRwdXRJdGVtLmRhdGEuYnVmZmVyLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIE91dHB1dENvbXBhcmlzb24uT3RoZXI7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgayA9IDA7IGsgPCBhT3V0cHV0SXRlbS5kYXRhLmJ1ZmZlci5sZW5ndGg7IGsrKykge1xuXHRcdFx0aWYgKGFPdXRwdXRJdGVtLmRhdGEuYnVmZmVyW2tdICE9PSBiT3V0cHV0SXRlbS5kYXRhLmJ1ZmZlcltrXSkge1xuXHRcdFx0XHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5PdGhlcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5NZXRhZGF0YTtcbn1cblxuZnVuY3Rpb24gb3V0cHV0c0VxdWFsKG9yaWdpbmFsOiBJQ2VsbE91dHB1dFtdLCBtb2RpZmllZDogSUNlbGxPdXRwdXRbXSkge1xuXHRpZiAob3JpZ2luYWwubGVuZ3RoICE9PSBtb2RpZmllZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5PdGhlcjtcblx0fVxuXG5cdGNvbnN0IGxlbiA9IG9yaWdpbmFsLmxlbmd0aDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGEgPSBvcmlnaW5hbFtpXTtcblx0XHRjb25zdCBiID0gbW9kaWZpZWRbaV07XG5cblx0XHRpZiAoaGFzaChhLm1ldGFkYXRhKSAhPT0gaGFzaChiLm1ldGFkYXRhKSkge1xuXHRcdFx0cmV0dXJuIE91dHB1dENvbXBhcmlzb24uTWV0YWRhdGE7XG5cdFx0fVxuXG5cdFx0aWYgKGEub3V0cHV0cy5sZW5ndGggIT09IGIub3V0cHV0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBPdXRwdXRDb21wYXJpc29uLk90aGVyO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGogPSAwOyBqIDwgYS5vdXRwdXRzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRjb25zdCBhT3V0cHV0SXRlbSA9IGEub3V0cHV0c1tqXTtcblx0XHRcdGNvbnN0IGJPdXRwdXRJdGVtID0gYi5vdXRwdXRzW2pdO1xuXG5cdFx0XHRpZiAoYU91dHB1dEl0ZW0ubWltZSAhPT0gYk91dHB1dEl0ZW0ubWltZSkge1xuXHRcdFx0XHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5PdGhlcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFPdXRwdXRJdGVtLmRhdGEuYnVmZmVyLmxlbmd0aCAhPT0gYk91dHB1dEl0ZW0uZGF0YS5idWZmZXIubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBPdXRwdXRDb21wYXJpc29uLk90aGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBrID0gMDsgayA8IGFPdXRwdXRJdGVtLmRhdGEuYnVmZmVyLmxlbmd0aDsgaysrKSB7XG5cdFx0XHRcdGlmIChhT3V0cHV0SXRlbS5kYXRhLmJ1ZmZlcltrXSAhPT0gYk91dHB1dEl0ZW0uZGF0YS5idWZmZXJba10pIHtcblx0XHRcdFx0XHRyZXR1cm4gT3V0cHV0Q29tcGFyaXNvbi5PdGhlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBPdXRwdXRDb21wYXJpc29uLlVuY2hhbmdlZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0cmVhbU91dHB1dERhdGEob3V0cHV0czogSU91dHB1dEl0ZW1EdG9bXSkge1xuXHRpZiAoIW91dHB1dHMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBmaXJzdCA9IG91dHB1dHNbMF07XG5cdGNvbnN0IG1pbWUgPSBmaXJzdC5taW1lO1xuXHRjb25zdCBzYW1lU3RyZWFtID0gIW91dHB1dHMuZmluZChvcCA9PiBvcC5taW1lICE9PSBtaW1lKTtcblxuXHRpZiAoc2FtZVN0cmVhbSkge1xuXHRcdHJldHVybiBvdXRwdXRzLm1hcChvcGl0ID0+IG9waXQuZGF0YS50b1N0cmluZygpKS5qb2luKCcnKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Rm9ybWF0dGVkT3V0cHV0SlNPTihvdXRwdXRzOiBJT3V0cHV0RHRvW10pIHtcblx0aWYgKG91dHB1dHMubGVuZ3RoID09PSAxKSB7XG5cdFx0Y29uc3Qgc3RyZWFtT3V0cHV0RGF0YSA9IGdldFN0cmVhbU91dHB1dERhdGEob3V0cHV0c1swXS5vdXRwdXRzKTtcblx0XHRpZiAoc3RyZWFtT3V0cHV0RGF0YSkge1xuXHRcdFx0cmV0dXJuIHN0cmVhbU91dHB1dERhdGE7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KG91dHB1dHMubWFwKG91dHB1dCA9PiB7XG5cdFx0cmV0dXJuICh7XG5cdFx0XHRtZXRhZGF0YTogb3V0cHV0Lm1ldGFkYXRhLFxuXHRcdFx0b3V0cHV0SXRlbXM6IG91dHB1dC5vdXRwdXRzLm1hcChvcGl0ID0+ICh7XG5cdFx0XHRcdG1pbWVUeXBlOiBvcGl0Lm1pbWUsXG5cdFx0XHRcdGRhdGE6IG9waXQuZGF0YS50b1N0cmluZygpXG5cdFx0XHR9KSlcblx0XHR9KTtcblx0fSksIHVuZGVmaW5lZCwgJ1xcdCcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHdCQUF3QjtBQUdqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUE0QyxpQ0FBaUM7QUFDN0UsU0FBNkMsa0JBQWtCLGdCQUF3QztBQUN2RyxTQUFTLHVCQUE4QztBQUV2RCxTQUFTLGdDQUF1RDtBQUVoRSxTQUFTLGVBQTRFO0FBR3JGLFNBQVMsZUFBZTtBQUV4QixTQUFTLHlDQUF5QztBQUVsRCxNQUFNLHVCQUF1QjtBQUd0QixNQUFNLHdDQUF3QztBQUU5QyxNQUFNLG9CQUFvQjtBQUUxQixJQUFLLHVCQUFMLGtCQUFLQSwwQkFBTDtBQUNOLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFGVyxTQUFBQTtBQUFBLEdBQUE7QUFLTCxNQUFNLDZCQUE2QjtBQVVuQyxNQUFlLGlDQUFpQyxXQUFXO0FBQUEsRUFJakUsWUFDaUIsdUJBQ0EsdUJBQ0EsVUFLZjtBQUNELFVBQU07QUFSVTtBQUNBO0FBQ0E7QUFOakIsU0FBVSxxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBNEMsQ0FBQztBQUMvRiw2QkFBb0IsS0FBSyxtQkFBbUI7QUFhM0MsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGtCQUFrQixPQUFLLEtBQUssbUJBQW1CLEtBQUssRUFBRSxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNySDtBQUtEO0FBRU8sTUFBTSx3Q0FBd0MseUJBQXlCO0FBQUEsRUFPN0UsWUFDQyx1QkFDQSx1QkFDQSxVQUtDO0FBQ0QsVUFBTSx1QkFBdUIsdUJBQXVCLFFBQVE7QUFmN0QsU0FBUyxPQUFzQjtBQUMvQixTQUFPLGNBQThDLENBQUM7QUFDdEQsU0FBVSxxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2pFLCtCQUFzQixLQUFLLG1CQUFtQjtBQUU5QyxTQUFPLGVBQXdCO0FBQUEsRUFZL0I7QUFBQSxFQUNBLElBQUksY0FBYztBQUNqQixXQUFPLEtBQU0sSUFBSTtBQUFBLEVBQ2xCO0FBQUEsRUFDQSxVQUFVLEdBQW1CO0FBQzVCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUNTLGVBQXFCO0FBQUEsRUFFOUI7QUFBQSxFQUNBLGtCQUFrQjtBQUNqQixTQUFLLG1CQUFtQixLQUFLO0FBQUEsRUFDOUI7QUFDRDtBQUdPLE1BQU0sMENBQTBDLHlCQUF5QjtBQUFBLEVBOEIvRSxZQUNpQiwyQkFDQSwyQkFDQSxNQUNoQix1QkFDQSxVQUtBLGlCQUNpQix3QkFDaEI7QUFDRCxVQUFNLDJCQUEyQix1QkFBdUIsUUFBUTtBQVpoRDtBQUNBO0FBQ0E7QUFRQztBQXBDbEIsU0FBTyxlQUF3QjtBQXdCL0IsU0FBUSx5QkFBdUc7QUFnQjlHLFVBQU0sbUJBQW1CO0FBQ3pCLFNBQUssY0FBYztBQUFBLE1BQ2xCLE9BQU87QUFBQSxNQUNQLGNBQWM7QUFBQSxNQUNkLGNBQWM7QUFBQSxNQUNkLGdCQUFnQjtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxNQUN0QixpQkFBaUI7QUFBQSxNQUNqQixtQkFBbUI7QUFBQSxNQUNuQixvQkFBb0I7QUFBQSxNQUNwQixzQkFBc0I7QUFBQSxNQUN0QixZQUFZO0FBQUEsTUFDWixhQUFhLEtBQUssbUJBQW1CO0FBQUEsTUFDckMsYUFBYSxnQkFBZ0I7QUFBQSxJQUM5QjtBQUVBLFNBQUssbUJBQW1CLFNBQVMscUJBQXFCLG1CQUFnQztBQUN0RixTQUFLLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQ0FBa0MseUJBQXlCLENBQUM7QUFDdkcsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLElBQUksa0NBQWtDLHlCQUF5QixDQUFDO0FBQUEsRUFDeEc7QUFBQSxFQTNEQSxJQUFJLGFBQWEsUUFBZ0I7QUFDaEMsU0FBSyxRQUFRLEVBQUUsY0FBYyxPQUFPLENBQUM7QUFBQSxFQUN0QztBQUFBLEVBRUEsSUFBSSxlQUFlO0FBQ2xCLFVBQU0sSUFBSSxNQUFNLGtDQUFrQztBQUFBLEVBQ25EO0FBQUEsRUFFQSxJQUFJLGFBQWEsUUFBZ0I7QUFDaEMsU0FBSyxRQUFRLEVBQUUsY0FBYyxPQUFPLENBQUM7QUFBQSxFQUN0QztBQUFBLEVBRUEsSUFBSSxlQUFlO0FBQ2xCLFVBQU0sSUFBSSxNQUFNLGtDQUFrQztBQUFBLEVBQ25EO0FBQUEsRUFDQSxJQUFJLGFBQXFDO0FBQ3hDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksY0FBYztBQUNqQixXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUF3Q0EsTUFBYSxpQkFBaUI7QUFDN0IsUUFBSSxLQUFLLFNBQVMscUJBQXFCO0FBQ3RDLFdBQUssZUFBZSxLQUFLLHVCQUF1Qix1QkFBdUIsS0FBSyxpQkFBaUIsV0FBVyxhQUFhLENBQUM7QUFBQSxJQUN2SCxPQUFPO0FBQ04sWUFBTSxXQUFXLEtBQUssaUJBQWlCO0FBQ3ZDLFlBQU0sV0FBVyxLQUFLLGlCQUFpQjtBQUN2QyxXQUFLLGVBQWUsTUFBTSxLQUFLLHVCQUF1QixxQkFBcUIsVUFBVSxRQUFRO0FBQUEsSUFDOUY7QUFBQSxFQUNEO0FBQUEsRUFFQSxlQUFlO0FBQ2QsU0FBSyxRQUFRLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUFBLEVBQ3ZDO0FBQUEsRUFFVSxRQUFRLE9BQXlCO0FBQzFDLFVBQU0sUUFBUSxNQUFNLFVBQVUsU0FBWSxNQUFNLFFBQVEsS0FBSyxZQUFZO0FBQ3pFLFVBQU0sZUFBZSxNQUFNLGlCQUFpQixTQUFZLE1BQU0sZUFBZSxLQUFLLFlBQVk7QUFDOUYsVUFBTSxlQUFlLE1BQU0saUJBQWlCLFNBQVksTUFBTSxlQUFlLEtBQUssWUFBWTtBQUM5RixVQUFNLG1CQUFtQixNQUFNLHFCQUFxQixTQUFZLE1BQU0sbUJBQW1CLEtBQUssWUFBWTtBQUMxRyxVQUFNLGFBQWEsTUFBTSxlQUFlLFNBQVksTUFBTSxhQUFhLEtBQUssWUFBWTtBQUV4RixVQUFNLGNBQWMsZUFDakIsZUFDQSxtQkFDQTtBQUVILFVBQU0sWUFBb0M7QUFBQSxNQUN6QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxnQkFBZ0I7QUFBQSxNQUNoQjtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsTUFDdEIsbUJBQW1CO0FBQUEsTUFDbkIsb0JBQW9CO0FBQUEsTUFDcEI7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLE1BQ2pCLHNCQUFzQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxhQUFhLGdCQUFnQjtBQUFBLElBQzlCO0FBRUEsUUFBSSxtQkFBbUI7QUFFdkIsVUFBTSxjQUFrRCxDQUFDO0FBRXpELFFBQUksVUFBVSxVQUFVLEtBQUssWUFBWSxPQUFPO0FBQy9DLGtCQUFZLFFBQVE7QUFDcEIseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUsaUJBQWlCLEtBQUssWUFBWSxjQUFjO0FBQzdELGtCQUFZLGVBQWU7QUFDM0IseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUsaUJBQWlCLEtBQUssWUFBWSxjQUFjO0FBQzdELGtCQUFZLGVBQWU7QUFDM0IseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUscUJBQXFCLEtBQUssWUFBWSxrQkFBa0I7QUFDckUsa0JBQVksbUJBQW1CO0FBQy9CLHlCQUFtQjtBQUFBLElBQ3BCO0FBRUEsUUFBSSxVQUFVLGVBQWUsS0FBSyxZQUFZLFlBQVk7QUFDekQsa0JBQVksYUFBYTtBQUN6Qix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSxnQkFBZ0IsS0FBSyxZQUFZLGFBQWE7QUFDM0Qsa0JBQVksY0FBYztBQUMxQix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksa0JBQWtCO0FBQ3JCLFdBQUssY0FBYztBQUNuQixXQUFLLHVCQUF1QixXQUFXO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFVLFlBQW9CO0FBQzdCLFFBQUksS0FBSyxZQUFZLGdCQUFnQixnQkFBZ0IsZUFBZTtBQUNuRSxZQUFNLGVBQWUsS0FBSyxxQkFBcUIsb0JBQWlDLElBQUksS0FBSyx5QkFBeUIsVUFBVTtBQUM1SCxhQUFPLEtBQUssb0JBQW9CLFlBQVk7QUFBQSxJQUM3QyxPQUFPO0FBQ04sYUFBTyxLQUFLLFlBQVk7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixjQUFzQjtBQUNqRCxVQUFNLGNBQWMsZUFDakIsS0FBSyxZQUFZLGVBQ2pCLEtBQUssWUFBWSxpQkFDakIsS0FBSyxZQUFZLG1CQUNqQixLQUFLLFlBQVksdUJBQ2pCLEtBQUssWUFBWSxvQkFDakIsS0FBSyxZQUFZLHFCQUNqQixLQUFLLFlBQVksdUJBQ2pCLEtBQUssWUFBWTtBQUVwQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8seUJBQXlCLGFBQTZCO0FBQzVELFdBQU8sS0FBSyx1QkFBdUIsdUJBQXVCLEtBQUssSUFBSSxLQUFLLGlCQUFpQixXQUFXLGFBQWEsR0FBRyxLQUFLLGlCQUFpQixXQUFXLGFBQWEsQ0FBQyxDQUFDO0FBQUEsRUFDcks7QUFBQSxFQUVRLHVCQUF1QixPQUEyQztBQUN6RSxTQUFLLG1CQUFtQixLQUFLLEtBQUs7QUFDbEMsU0FBSyxzQkFBc0IsS0FBSyxDQUFDLEVBQUUsTUFBTSwwQkFBMEIsbUJBQW1CLFFBQVEsS0FBSyxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ2xIO0FBQUEsRUFFQSw4QkFBOEIsWUFBZ0MsWUFBcUIsV0FBb0I7QUFDdEcsUUFBSSxXQUFXO0FBQ2QsYUFBTyxXQUFXLFFBQVEsSUFBSSxvQkFBb0IsYUFBYSxpQkFBaUIsNkJBQTZCLEtBQUs7QUFBQSxJQUNuSDtBQUVBLFlBQVEsV0FBVyxRQUFRLElBQUksb0JBQW9CLGFBQWEsaUJBQWlCLDZCQUE2QixNQUFNLElBQUksS0FBSztBQUFBLEVBQzlIO0FBQUEsRUFFQSwyQkFBeUc7QUFDeEcsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsMEJBQTBCLFdBQXlGO0FBQ2xILFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFDRDtBQUdPLE1BQWUscUNBQXFDLHlCQUF5QjtBQUFBLEVBeUduRixZQUNDLHVCQUNBLFVBQ0EsVUFDUyxNQUNULHVCQUNBLFVBS0EsaUJBQ2dCLE9BQ0Msc0JBQ0QsNEJBQ2Y7QUFDRCxVQUFNLHVCQUF1Qix1QkFBdUIsUUFBUTtBQVpuRDtBQVFPO0FBQ0M7QUFDRDtBQW5IakIsU0FBVSxzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBbUMsQ0FBQztBQUN2Riw0QkFBbUIsS0FBSyxvQkFBb0I7QUFJNUMsU0FBUSxzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2hFLFNBQU8sdUJBQXVCLEtBQUssb0JBQW9CO0FBNkR2RCxTQUFRLGdCQUFnQjtBQTRCeEIsU0FBUSx5QkFBdUc7QUFDL0csU0FBUSx5QkFBdUc7QUFDL0csU0FBUSwyQkFBeUc7QUFxQmhILFNBQUssV0FBVyxXQUFXLEtBQUssVUFBVSxJQUFJLHdCQUF3QixVQUFVLGVBQWUsQ0FBQyxJQUFJO0FBQ3BHLFNBQUssV0FBVyxXQUFXLEtBQUssVUFBVSxJQUFJLHdCQUF3QixVQUFVLGVBQWUsQ0FBQyxJQUFJO0FBQ3BHLFVBQU0sZUFBZSxLQUFLLHNCQUFzQixTQUFTLFFBQVE7QUFDakUsVUFBTSxtQkFBbUI7QUFDekIsU0FBSyxjQUFjO0FBQUEsTUFDbEIsT0FBTztBQUFBLE1BQ1A7QUFBQSxNQUNBLGNBQWM7QUFBQSxNQUNkLGdCQUFnQjtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxzQkFBc0IsS0FBSyxpQkFBaUIsSUFBSTtBQUFBLE1BQ2hELGlCQUFpQjtBQUFBLE1BQ2pCLG1CQUFtQjtBQUFBLE1BQ25CLG9CQUFvQixLQUFLLGdCQUFnQixJQUFJO0FBQUEsTUFDN0Msc0JBQXNCO0FBQUEsTUFDdEIsWUFBWTtBQUFBLE1BQ1osYUFBYSxLQUFLLG1CQUFtQjtBQUFBLE1BQ3JDLGFBQWEsZ0JBQWdCO0FBQUEsSUFDOUI7QUFFQSxTQUFLLG1CQUFtQixVQUFVLGtCQUFrQixNQUFNLFVBQVUsa0JBQWtCLElBQUksbUJBQWdDO0FBQzFILFNBQUssdUJBQXVCO0FBQzVCLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQXJJQSxxQkFBcUI7QUFDcEIsU0FBSyxvQkFBb0IsS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFDQSxJQUFJLGdCQUFnQixRQUFnQjtBQUNuQyxTQUFLLFFBQVEsRUFBRSxpQkFBaUIsS0FBSyxJQUFJLDRCQUE0QixNQUFNLEVBQUUsQ0FBQztBQUFBLEVBQy9FO0FBQUEsRUFFQSxJQUFJLGtCQUFrQjtBQUNyQixVQUFNLElBQUksTUFBTSxxQ0FBcUM7QUFBQSxFQUN0RDtBQUFBLEVBRUEsSUFBSSxtQkFBbUIsUUFBZ0I7QUFDdEMsU0FBSyxRQUFRLEVBQUUsb0JBQW9CLE9BQU8sQ0FBQztBQUFBLEVBQzVDO0FBQUEsRUFFQSxJQUFJLHFCQUFxQjtBQUN4QixVQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxFQUN6RDtBQUFBLEVBRUEsSUFBSSxxQkFBcUIsUUFBZ0I7QUFDeEMsU0FBSyxRQUFRLEVBQUUsc0JBQXNCLE9BQU8sQ0FBQztBQUFBLEVBQzlDO0FBQUEsRUFFQSxJQUFJLHVCQUF1QjtBQUMxQixVQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxFQUN6RDtBQUFBLEVBRUEsSUFBSSxhQUFhLFFBQWdCO0FBQ2hDLFNBQUssUUFBUSxFQUFFLGNBQWMsT0FBTyxDQUFDO0FBQUEsRUFDdEM7QUFBQSxFQUVBLElBQUksZUFBZTtBQUNsQixVQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFBQSxFQUNuRDtBQUFBLEVBRUEsSUFBSSxhQUFhLFFBQWdCO0FBQ2hDLFNBQUssUUFBUSxFQUFFLGNBQWMsT0FBTyxDQUFDO0FBQUEsRUFDdEM7QUFBQSxFQUVBLElBQUksZUFBZTtBQUNsQixVQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFBQSxFQUNuRDtBQUFBLEVBRUEsSUFBSSxxQkFBcUIsUUFBZ0I7QUFDeEMsU0FBSyxRQUFRLEVBQUUsc0JBQXNCLE9BQU8sQ0FBQztBQUFBLEVBQzlDO0FBQUEsRUFFQSxJQUFJLHVCQUF1QjtBQUMxQixVQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxFQUN6RDtBQUFBLEVBRUEsSUFBSSxlQUFlLFFBQWdCO0FBQ2xDLFNBQUssUUFBUSxFQUFFLGdCQUFnQixPQUFPLENBQUM7QUFBQSxFQUN4QztBQUFBLEVBRUEsSUFBSSxpQkFBaUI7QUFDcEIsVUFBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsRUFDckQ7QUFBQSxFQUlBLElBQUksYUFBYSxPQUFnQjtBQUNoQyxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLFFBQVEsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3RDLFNBQUssb0JBQW9CLEtBQUssRUFBRSxjQUFjLEtBQUssY0FBYyxDQUFDO0FBQUEsRUFDbkU7QUFBQSxFQUVBLElBQUksZUFBZTtBQUNsQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLGFBQXFDO0FBQ3hDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksY0FBYztBQUNqQixXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxJQUFjLGdCQUFnQjtBQUM3QixXQUFPLEtBQUsscUJBQXFCLFNBQWtCLDZCQUE2QixLQUFLLENBQUMsQ0FBRSxLQUFLLHVCQUF1QixpQkFBaUI7QUFBQSxFQUN0STtBQUFBLEVBRUEsSUFBYyxpQkFBaUI7QUFDOUIsV0FBTyxLQUFLLHFCQUFxQixTQUFrQiw4QkFBOEI7QUFBQSxFQUNsRjtBQUFBLEVBa0RBLGVBQWU7QUFDZCxTQUFLLFFBQVEsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsRUFDdkM7QUFBQSxFQUVRLHNCQUFzQixVQUFnQztBQUM3RCxVQUFNLGFBQWEsVUFBVSxjQUFjO0FBRTNDLFlBQVEsS0FBSyxNQUFNO0FBQUEsTUFDbEIsS0FBSztBQUFBLE1BQ0wsS0FBSyxVQUNKO0FBQ0MsY0FBTSxZQUFZLEtBQUssU0FBVSxVQUFVLFdBQVcsYUFBYTtBQUNuRSxjQUFNLGVBQWUsWUFBWSxhQUFhLGlCQUFpQixTQUFTLEVBQUUsTUFBTSxpQkFBaUIsU0FBUyxFQUFFO0FBQzVHLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxLQUFLLFlBQ0o7QUFDQyxjQUFNLFlBQVksS0FBSyxTQUFVLFVBQVUsV0FBVyxhQUFhO0FBQ25FLGNBQU0sZUFBZSxZQUFZLGFBQWEsaUJBQWlCLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixTQUFTLEVBQUU7QUFDNUcsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVUsUUFBUSxPQUF5QjtBQUMxQyxVQUFNLFFBQVEsTUFBTSxVQUFVLFNBQVksTUFBTSxRQUFRLEtBQUssWUFBWTtBQUN6RSxVQUFNLGVBQWUsTUFBTSxpQkFBaUIsU0FBWSxNQUFNLGVBQWUsS0FBSyxZQUFZO0FBQzlGLFVBQU0sZUFBZSxNQUFNLGlCQUFpQixTQUFZLE1BQU0sZUFBZSxLQUFLLFlBQVk7QUFDOUYsVUFBTSxpQkFBaUIsTUFBTSxtQkFBbUIsU0FBWSxNQUFNLGlCQUFpQixLQUFLLFlBQVk7QUFDcEcsVUFBTSxtQkFBbUIsTUFBTSxxQkFBcUIsU0FBWSxNQUFNLG1CQUFtQixLQUFLLFlBQVk7QUFDMUcsVUFBTSx1QkFBdUIsTUFBTSx5QkFBeUIsU0FBWSxNQUFNLHVCQUF1QixLQUFLLFlBQVk7QUFDdEgsVUFBTSxrQkFBa0IsTUFBTSxvQkFBb0IsU0FBWSxNQUFNLGtCQUFrQixLQUFLLFlBQVk7QUFDdkcsVUFBTSxxQkFBcUIsTUFBTSx1QkFBdUIsU0FBWSxNQUFNLHFCQUFxQixLQUFLLFlBQVk7QUFDaEgsVUFBTSxhQUFhLE1BQU0sZUFBZSxTQUFZLE1BQU0sYUFBYSxLQUFLLFlBQVk7QUFDeEYsVUFBTSx1QkFBdUIsTUFBTSx5QkFBeUIsU0FBWSxNQUFNLHVCQUF1QixLQUFLLFlBQVk7QUFDdEgsVUFBTSxlQUFlLEtBQUssZ0JBQWdCLElBQUssTUFBTSxtQkFBbUIsTUFBTSxvQkFBb0IsVUFBYSxNQUFNLHlCQUF5QixTQUFhLEtBQUssc0JBQXNCLGlCQUFpQixvQkFBb0IsSUFBSSxLQUFLLFlBQVk7QUFFaFAsVUFBTSxjQUFjLGVBQ2pCLGVBQ0EsbUJBQ0EsaUJBQ0EsdUJBQ0EsZUFDQSxxQkFDQTtBQUVILFVBQU0sWUFBb0M7QUFBQSxNQUN6QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxtQkFBbUI7QUFBQSxNQUNuQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGFBQWEsZ0JBQWdCO0FBQUEsSUFDOUI7QUFFQSxRQUFJLG1CQUFtQjtBQUV2QixVQUFNLGNBQWtELENBQUM7QUFFekQsUUFBSSxVQUFVLFVBQVUsS0FBSyxZQUFZLE9BQU87QUFDL0Msa0JBQVksUUFBUTtBQUNwQix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSxpQkFBaUIsS0FBSyxZQUFZLGNBQWM7QUFDN0Qsa0JBQVksZUFBZTtBQUMzQix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSxpQkFBaUIsS0FBSyxZQUFZLGNBQWM7QUFDN0Qsa0JBQVksZUFBZTtBQUMzQix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSxtQkFBbUIsS0FBSyxZQUFZLGdCQUFnQjtBQUNqRSxrQkFBWSxpQkFBaUI7QUFDN0IseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUscUJBQXFCLEtBQUssWUFBWSxrQkFBa0I7QUFDckUsa0JBQVksbUJBQW1CO0FBQy9CLHlCQUFtQjtBQUFBLElBQ3BCO0FBRUEsUUFBSSxVQUFVLHlCQUF5QixLQUFLLFlBQVksc0JBQXNCO0FBQzdFLGtCQUFZLHVCQUF1QjtBQUNuQyx5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSxzQkFBc0IsS0FBSyxZQUFZLG1CQUFtQjtBQUN2RSxrQkFBWSxvQkFBb0I7QUFDaEMseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUsdUJBQXVCLEtBQUssWUFBWSxvQkFBb0I7QUFDekUsa0JBQVkscUJBQXFCO0FBQ2pDLHlCQUFtQjtBQUFBLElBQ3BCO0FBRUEsUUFBSSxVQUFVLGVBQWUsS0FBSyxZQUFZLFlBQVk7QUFDekQsa0JBQVksYUFBYTtBQUN6Qix5QkFBbUI7QUFBQSxJQUNwQjtBQUVBLFFBQUksVUFBVSx5QkFBeUIsS0FBSyxZQUFZLHNCQUFzQjtBQUM3RSxrQkFBWSx1QkFBdUI7QUFDbkMseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQVUsZ0JBQWdCLEtBQUssWUFBWSxhQUFhO0FBQzNELGtCQUFZLGNBQWM7QUFDMUIseUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLGtCQUFrQjtBQUNyQixXQUFLLGNBQWM7QUFDbkIsV0FBSyx1QkFBdUIsV0FBVztBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUFBLEVBRUEsVUFBVSxZQUFvQjtBQUM3QixRQUFJLEtBQUssWUFBWSxnQkFBZ0IsZ0JBQWdCLGVBQWU7QUFDbkUsWUFBTSxlQUFlLEtBQUsscUJBQXFCLG9CQUFpQyxJQUFJLEtBQUsseUJBQXlCLFVBQVU7QUFDNUgsYUFBTyxLQUFLLG9CQUFvQixZQUFZO0FBQUEsSUFDN0MsT0FBTztBQUNOLGFBQU8sS0FBSyxZQUFZO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBb0IsY0FBc0I7QUFDakQsVUFBTSxjQUFjLGVBQ2pCLEtBQUssWUFBWSxlQUNqQixLQUFLLFlBQVksaUJBQ2pCLEtBQUssWUFBWSxtQkFDakIsS0FBSyxZQUFZLHVCQUNqQixLQUFLLFlBQVksb0JBQ2pCLEtBQUssWUFBWSxxQkFDakIsS0FBSyxZQUFZLHVCQUNqQixLQUFLLFlBQVk7QUFFcEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHlCQUF5QixZQUE0QjtBQUMzRCxVQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssVUFBVSxVQUFVLFdBQVcsYUFBYSxLQUFLLEdBQUcsS0FBSyxVQUFVLFVBQVUsV0FBVyxhQUFhLEtBQUssQ0FBQztBQUMzSSxXQUFPLEtBQUssMkJBQTJCLHVCQUF1QixTQUFTO0FBQUEsRUFDeEU7QUFBQSxFQUVRLHNCQUFzQixpQkFBeUIsZ0JBQXdCO0FBQzlFLFFBQUksS0FBSyx1QkFBdUIsbUJBQWdDO0FBQy9ELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLGNBQWM7QUFDdEIsVUFBSSxLQUFLLGNBQWMsR0FBRztBQUV6QixlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8sS0FBSyx5QkFBeUIsSUFBSTtBQUFBLElBQzFDLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixPQUEyQztBQUN6RSxTQUFLLG1CQUFtQixLQUFLLEtBQUs7QUFDbEMsU0FBSyxzQkFBc0IsS0FBSyxDQUFDLEVBQUUsTUFBTSwwQkFBMEIsbUJBQW1CLFFBQVEsS0FBSyxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ2xIO0FBQUEsRUFhQSw4QkFBOEIsWUFBZ0MsWUFBcUIsV0FBb0I7QUFDdEcsUUFBSSxXQUFXO0FBQ2QsYUFBTyxXQUFXLFFBQVEsSUFBSSxvQkFBb0IsYUFBYSxpQkFBaUIsNkJBQTZCLEtBQUs7QUFBQSxJQUNuSDtBQUVBLFlBQVEsV0FBVyxRQUFRLElBQUksb0JBQW9CLGFBQWEsaUJBQWlCLDZCQUE2QixNQUFNLElBQUksS0FBSztBQUFBLEVBQzlIO0FBQUEsRUFFQSwyQkFBeUc7QUFDeEcsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsMEJBQTBCLFdBQXlGO0FBQ2xILFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVBLDZCQUEyRztBQUMxRyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSw0QkFBNEIsV0FBeUY7QUFDcEgsU0FBSywyQkFBMkI7QUFBQSxFQUNqQztBQUFBLEVBRUEsMkJBQXlHO0FBQ3hHLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLDBCQUEwQixXQUF5RjtBQUNsSCxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQ0Q7QUFFTyxNQUFNLHVDQUF1Qyw2QkFBNkI7QUFBQSxFQWlCaEYsWUFDQyx1QkFDUyx3QkFDVCxVQUNBLFVBQ0EsTUFDQSx1QkFDQSxVQUtBLGlCQUNBLHNCQUNBLE9BQ0EsNEJBQ0M7QUFDRDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUEwQjtBQXpCbEI7QUEyQlQsU0FBSyxPQUFPO0FBRVosU0FBSyxtQkFBbUIsS0FBSyxTQUFTLFVBQVUsU0FBUyxNQUFNLEtBQUssU0FBUyxVQUFVLFNBQVMsSUFBSSxtQkFBZ0M7QUFDcEksU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxxQkFBcUI7QUFFMUIsUUFBSSxLQUFLLHdCQUF3QixHQUFHO0FBQ25DLFdBQUssdUJBQXVCO0FBQUEsSUFDN0I7QUFFQSxRQUFJLEtBQUssdUJBQXVCLEdBQUc7QUFDbEMsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUVBLFNBQUssVUFBVSxLQUFLLFNBQVMsd0JBQXdCLE1BQU07QUFDMUQsV0FBSyxRQUFRLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFNBQVMsd0JBQXdCLE1BQU07QUFDMUQsV0FBSyxRQUFRLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFNBQVMsVUFBVSxtQkFBbUIsTUFBTTtBQUMvRCxVQUFJLHNCQUFzQixpQkFBaUIscUJBQXFCO0FBQy9ELGNBQU0sbUJBQW1CLENBQUMsR0FBRyxPQUFPLEtBQUssc0JBQXNCLGlCQUFpQixtQkFBbUIsQ0FBQztBQUNwRyxjQUFNLG9CQUFvQixPQUFPLE9BQU8sQ0FBQyxHQUFHLEtBQUssU0FBUyxRQUFRO0FBQ2xFLGNBQU0sdUJBQXVCLEtBQUssU0FBUztBQUMzQyxtQkFBVyxPQUFPLGtCQUFrQjtBQUNuQyxjQUFJLE9BQU8sT0FBTyxzQkFBc0IsR0FBRyxHQUFHO0FBQzdDLDhCQUFrQixHQUFHLElBQUkscUJBQXFCLEdBQUc7QUFBQSxVQUNsRDtBQUFBLFFBQ0Q7QUFFQSxhQUFLLFNBQVMsVUFBVSxXQUFXO0FBQUEsTUFDcEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQWpGQSxJQUFJLG1CQUFtQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLG1CQUFtQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUE2RVMsdUJBQStEO0FBQ3ZFLFFBQUksS0FBSyxTQUFTLFVBQVUsa0JBQWtCLE1BQU0sS0FBSyxTQUFTLFVBQVUsa0JBQWtCLEdBQUc7QUFDaEcsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsTUFDTixRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLHlCQUF5QjtBQUN4QixRQUFJLEtBQUssc0JBQXNCLGlCQUFpQixvQkFBb0IsS0FBSyxlQUFlO0FBQ3ZGLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxNQUFNLGFBQWEsS0FBSyxVQUFVLFdBQVcsQ0FBQyxHQUFHLEtBQUssVUFBVSxXQUFXLENBQUMsQ0FBQztBQUVuRixRQUFJLFFBQVEsbUJBQTRCO0FBQ3ZDLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLE1BQ04sUUFBUSxRQUFRLG1CQUE0QixnQ0FBZ0M7QUFBQSxNQUM1RSxNQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDBCQUEwQjtBQUN6QixRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLEtBQUsseUJBQXlCLEtBQUssc0JBQXNCLGlCQUFpQix1QkFBdUIsS0FBSyxVQUFVLFlBQVksQ0FBQyxHQUFHLEtBQUssVUFBVSxRQUFRLENBQUMsTUFBTSxLQUFLLHlCQUF5QixLQUFLLHNCQUFzQixpQkFBaUIsdUJBQXVCLEtBQUssVUFBVSxZQUFZLENBQUMsR0FBRyxLQUFLLFVBQVUsUUFBUSxDQUFDO0FBQ3ZVLFFBQUksVUFBVTtBQUNiLGFBQU8sRUFBRSxRQUFRLE9BQVU7QUFBQSxJQUM1QixPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsVUFBb0IsT0FBZSxRQUFnQjtBQUNyRSxRQUFJLGFBQWEsU0FBUyxVQUFVO0FBQ25DLFdBQUssU0FBUyxtQkFBbUIsT0FBTyxNQUFNO0FBQUEsSUFDL0MsT0FBTztBQUNOLFdBQUssU0FBUyxtQkFBbUIsT0FBTyxNQUFNO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBQUEsRUFFQSwyQkFBMkIsVUFBb0IsT0FBZTtBQUM3RCxRQUFJLGFBQWEsU0FBUyxVQUFVO0FBQ25DLGFBQU8sS0FBSyxTQUFTLGdCQUFnQixLQUFLO0FBQUEsSUFDM0MsT0FBTztBQUNOLGFBQU8sS0FBSyxTQUFTLGdCQUFnQixLQUFLO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFQSxzQkFBc0IsVUFBb0IsT0FBZTtBQUN4RCxVQUFNLDJCQUEyQixLQUFLLDJCQUEyQixVQUFVLEtBQUs7QUFFaEYsV0FBTyxLQUFLLFlBQVksZUFDckIsS0FBSyxZQUFZLGVBQ2pCLEtBQUssWUFBWSxpQkFDakIsS0FBSyxZQUFZLG1CQUNqQixLQUFLLFlBQVksdUJBQ2pCLEtBQUssWUFBWSxxQkFDakIsS0FBSyxZQUFZLGFBQWEsSUFDOUI7QUFBQSxFQUNKO0FBQUEsRUFFQSxnQkFBZ0I7QUFDZixRQUFJLEtBQUssc0JBQXNCLGlCQUFpQixrQkFBa0I7QUFDakUsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssdUJBQXVCLEdBQUc7QUFDbEMsYUFBTztBQUFBLElBQ1I7QUFJQSxZQUFRLEtBQUssVUFBVSxXQUFXLENBQUMsR0FBRyxXQUFXO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLDJCQUEyQjtBQUMxQixXQUFPLEtBQUssSUFBSSxLQUFLLFNBQVMscUJBQXFCLEdBQUcsS0FBSyxTQUFTLHFCQUFxQixDQUFDO0FBQUEsRUFDM0Y7QUFBQSxFQUVBLHVCQUF1QixVQUE2QztBQUNuRSxXQUFPLGFBQWEsU0FBUyxXQUFXLEtBQUssV0FBVyxLQUFLO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLGFBQWEsU0FBcUM7QUFDakQsUUFBSSxRQUFRLFNBQVMsTUFBTSxLQUFLLFNBQVMsSUFBSSxTQUFTLEdBQUc7QUFDeEQsYUFBTyxLQUFLO0FBQUEsSUFDYixPQUFPO0FBQ04sYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVnQix5QkFBeUIsWUFBNEI7QUFDcEUsUUFBSSxLQUFLLFNBQVMsY0FDakIsT0FBTyxLQUFLLDRDQUE0QyxZQUN4RCxLQUFLLHFCQUFxQixHQUFHO0FBQzdCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxXQUFPLE1BQU0seUJBQXlCLFVBQVU7QUFBQSxFQUNqRDtBQUFBLEVBRUEsTUFBYyxtQ0FBbUM7QUFDaEQsUUFBSSxLQUFLLHFCQUFxQixHQUFHO0FBQ2hDLFdBQUssMENBQTBDLEtBQUssWUFBWSxlQUFlLE1BQU0sS0FBSywyQkFBMkIscUJBQXFCLEtBQUssU0FBUyxLQUFLLEtBQUssU0FBUyxHQUFHO0FBQUEsSUFDL0s7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLHNDQUFzQztBQUNuRCxRQUFJLEtBQUssd0JBQXdCLEdBQUc7QUFDbkMsWUFBTSxzQkFBc0IsUUFBUSx3QkFBd0IsS0FBSyxpQkFBaUIsS0FBSyxLQUFLLFNBQVMsUUFBUSxRQUFRLDBCQUEwQjtBQUMvSSxZQUFNLHNCQUFzQixRQUFRLHdCQUF3QixLQUFLLGlCQUFpQixLQUFLLEtBQUssU0FBUyxRQUFRLFFBQVEsMEJBQTBCO0FBQy9JLFdBQUssWUFBWSxpQkFBaUIsTUFBTSxLQUFLLDJCQUEyQixxQkFBcUIscUJBQXFCLG1CQUFtQjtBQUFBLElBQ3RJO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSx1QkFBdUI7QUFDbkMsUUFBSSxLQUFLLFNBQVMsYUFBYTtBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsSUFBSSxDQUFDLEtBQUssaUNBQWlDLEdBQUcsS0FBSyxvQ0FBb0MsQ0FBQyxDQUFDO0FBQUEsRUFDeEc7QUFFRDtBQUVPLE1BQU0sdUNBQXVDLDZCQUE2QjtBQUFBLEVBdUJoRixZQUNDLHVCQUNTLHdCQUNULFVBQ0EsVUFDQSxNQUNBLHVCQUNBLFVBS0EsaUJBQ0Esc0JBQ0EsNEJBQ0EsT0FDQztBQUNELFVBQU0sdUJBQXVCLFVBQVUsVUFBVSxNQUFNLHVCQUF1QixVQUFVLGlCQUFpQixPQUFPLHNCQUFzQiwwQkFBMEI7QUFmdko7QUFnQlQsU0FBSyxPQUFPO0FBRVosU0FBSyxVQUFVLEtBQUssY0FBYyx3QkFBd0IsTUFBTTtBQUMvRCxXQUFLLFFBQVEsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsSUFDdkMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBN0NBLElBQUksZ0JBQWdCO0FBQ25CLFdBQU8sS0FBSyxTQUFTLFdBQVcsS0FBSyxXQUFZLEtBQUs7QUFBQSxFQUN2RDtBQUFBLEVBRUEsSUFBSSxtQkFBbUI7QUFDdEIsUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixhQUFPLEtBQUs7QUFBQSxJQUNiLE9BQU87QUFDTixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxtQkFBbUI7QUFDdEIsUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixhQUFPLEtBQUs7QUFBQSxJQUNiLE9BQU87QUFDTixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUFBLEVBNkJTLHVCQUErRDtBQUN2RSxXQUFPO0FBQUEsTUFDTixRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHVCQUF1QixVQUE2QztBQUNuRSxXQUFPLEtBQUssU0FBUyxXQUFXLEtBQUssV0FBWSxLQUFLO0FBQUEsRUFDdkQ7QUFBQSxFQUdBLHlCQUFpRTtBQUNoRSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsMEJBQWtFO0FBQ2pFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxtQkFBbUIsVUFBb0IsT0FBZSxRQUFnQjtBQUNyRSxTQUFLLGVBQWUsbUJBQW1CLE9BQU8sTUFBTTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSwyQkFBMkIsVUFBb0IsT0FBZTtBQUM3RCxXQUFPLEtBQUssY0FBYyxnQkFBZ0IsS0FBSztBQUFBLEVBQ2hEO0FBQUEsRUFFQSxzQkFBc0IsVUFBb0IsT0FBZTtBQUN4RCxVQUFNLDJCQUEyQixLQUFLLGNBQWMsZ0JBQWdCLEtBQUs7QUFFekUsV0FBTyxLQUFLLFlBQVksZUFDckIsS0FBSyxZQUFZLGVBQ2pCLEtBQUssWUFBWSxpQkFDakIsS0FBSyxZQUFZLG1CQUNqQixLQUFLLFlBQVksdUJBQ2pCLEtBQUssWUFBWSxxQkFDakIsS0FBSyxZQUFZLGFBQWEsSUFDOUI7QUFBQSxFQUNKO0FBQUEsRUFFQSxnQkFBZ0I7QUFDZixRQUFJLEtBQUssc0JBQXNCLGlCQUFpQixrQkFBa0I7QUFDakUsYUFBTztBQUFBLElBQ1I7QUFJQSxZQUFRLEtBQUssVUFBVSxXQUFXLEtBQUssVUFBVSxXQUFXLENBQUMsR0FBRyxXQUFXO0FBQUEsRUFDNUU7QUFBQSxFQUVBLDJCQUEyQjtBQUMxQixXQUFPLEtBQUssZUFBZSxxQkFBcUIsS0FBSztBQUFBLEVBQ3REO0FBQUEsRUFFQSxhQUFhLFNBQXFDO0FBQ2pELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVPLElBQVcsbUJBQVgsa0JBQVdDLHNCQUFYO0FBQ04sRUFBQUEsb0NBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsb0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsb0NBQUEsV0FBUSxLQUFSO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQU1YLFNBQVMsWUFBWSxHQUFnQixHQUFrQztBQUM3RSxNQUFJLEtBQUssRUFBRSxRQUFRLE1BQU0sS0FBSyxFQUFFLFFBQVEsR0FBRztBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUdBLFdBQVMsSUFBSSxHQUFHLElBQUksRUFBRSxRQUFRLFFBQVEsS0FBSztBQUMxQyxVQUFNLGNBQWMsRUFBRSxRQUFRLENBQUM7QUFDL0IsVUFBTSxjQUFjLEVBQUUsUUFBUSxDQUFDO0FBRS9CLFFBQUksWUFBWSxTQUFTLFlBQVksTUFBTTtBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksWUFBWSxLQUFLLE9BQU8sV0FBVyxZQUFZLEtBQUssT0FBTyxRQUFRO0FBQ3RFLGFBQU87QUFBQSxJQUNSO0FBRUEsYUFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLEtBQUssT0FBTyxRQUFRLEtBQUs7QUFDeEQsVUFBSSxZQUFZLEtBQUssT0FBTyxDQUFDLE1BQU0sWUFBWSxLQUFLLE9BQU8sQ0FBQyxHQUFHO0FBQzlELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGFBQWEsVUFBeUIsVUFBeUI7QUFDdkUsTUFBSSxTQUFTLFdBQVcsU0FBUyxRQUFRO0FBQ3hDLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxNQUFNLFNBQVM7QUFDckIsV0FBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLEtBQUs7QUFDN0IsVUFBTSxJQUFJLFNBQVMsQ0FBQztBQUNwQixVQUFNLElBQUksU0FBUyxDQUFDO0FBRXBCLFFBQUksS0FBSyxFQUFFLFFBQVEsTUFBTSxLQUFLLEVBQUUsUUFBUSxHQUFHO0FBQzFDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxFQUFFLFFBQVEsV0FBVyxFQUFFLFFBQVEsUUFBUTtBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUVBLGFBQVMsSUFBSSxHQUFHLElBQUksRUFBRSxRQUFRLFFBQVEsS0FBSztBQUMxQyxZQUFNLGNBQWMsRUFBRSxRQUFRLENBQUM7QUFDL0IsWUFBTSxjQUFjLEVBQUUsUUFBUSxDQUFDO0FBRS9CLFVBQUksWUFBWSxTQUFTLFlBQVksTUFBTTtBQUMxQyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksWUFBWSxLQUFLLE9BQU8sV0FBVyxZQUFZLEtBQUssT0FBTyxRQUFRO0FBQ3RFLGVBQU87QUFBQSxNQUNSO0FBRUEsZUFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLEtBQUssT0FBTyxRQUFRLEtBQUs7QUFDeEQsWUFBSSxZQUFZLEtBQUssT0FBTyxDQUFDLE1BQU0sWUFBWSxLQUFLLE9BQU8sQ0FBQyxHQUFHO0FBQzlELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVPLFNBQVMsb0JBQW9CLFNBQTJCO0FBQzlELE1BQUksQ0FBQyxRQUFRLFFBQVE7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ3ZCLFFBQU0sT0FBTyxNQUFNO0FBQ25CLFFBQU0sYUFBYSxDQUFDLFFBQVEsS0FBSyxRQUFNLEdBQUcsU0FBUyxJQUFJO0FBRXZELE1BQUksWUFBWTtBQUNmLFdBQU8sUUFBUSxJQUFJLFVBQVEsS0FBSyxLQUFLLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQ3pELE9BQU87QUFDTixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sU0FBUyx1QkFBdUIsU0FBdUI7QUFDN0QsTUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QixVQUFNLG1CQUFtQixvQkFBb0IsUUFBUSxDQUFDLEVBQUUsT0FBTztBQUMvRCxRQUFJLGtCQUFrQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPLEtBQUssVUFBVSxRQUFRLElBQUksWUFBVTtBQUMzQyxXQUFRO0FBQUEsTUFDUCxVQUFVLE9BQU87QUFBQSxNQUNqQixhQUFhLE9BQU8sUUFBUSxJQUFJLFdBQVM7QUFBQSxRQUN4QyxVQUFVLEtBQUs7QUFBQSxRQUNmLE1BQU0sS0FBSyxLQUFLLFNBQVM7QUFBQSxNQUMxQixFQUFFO0FBQUEsSUFDSDtBQUFBLEVBQ0QsQ0FBQyxHQUFHLFFBQVcsR0FBSTtBQUNwQjsiLAogICJuYW1lcyI6IFsiUHJvcGVydHlGb2xkaW5nU3RhdGUiLCAiT3V0cHV0Q29tcGFyaXNvbiJdCn0K
