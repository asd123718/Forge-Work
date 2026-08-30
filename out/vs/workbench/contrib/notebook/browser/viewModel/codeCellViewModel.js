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
import { Emitter, PauseableEmitter } from "../../../../../base/common/event.js";
import { dispose } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import * as UUID from "../../../../../base/common/uuid.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { PrefixSumComputer } from "../../../../../editor/common/model/prefixSumComputer.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { CellEditState, CellLayoutState } from "../notebookBrowser.js";
import { CellOutputViewModel } from "./cellOutputViewModel.js";
import { CellKind } from "../../common/notebookCommon.js";
import { INotebookService } from "../../common/notebookService.js";
import { BaseCellViewModel } from "./baseCellViewModel.js";
import { IInlineChatSessionService } from "../../../inlineChat/browser/inlineChatSessionService.js";
const outputDisplayLimit = 500;
let CodeCellViewModel = class extends BaseCellViewModel {
  constructor(viewType, model, initialNotebookLayoutInfo, viewContext, configurationService, _notebookService, modelService, undoRedoService, codeEditorService, inlineChatSessionService) {
    super(viewType, model, UUID.generateUuid(), viewContext, configurationService, modelService, undoRedoService, codeEditorService, inlineChatSessionService);
    this.viewContext = viewContext;
    this._notebookService = _notebookService;
    this.cellKind = CellKind.Code;
    this._onLayoutInfoRead = this._register(new Emitter());
    this.onLayoutInfoRead = this._onLayoutInfoRead.event;
    this._onDidStartExecution = this._register(new Emitter());
    this.onDidStartExecution = this._onDidStartExecution.event;
    this._onDidStopExecution = this._register(new Emitter());
    this.onDidStopExecution = this._onDidStopExecution.event;
    this._onDidChangeOutputs = this._register(new Emitter());
    this.onDidChangeOutputs = this._onDidChangeOutputs.event;
    this._onDidRemoveOutputs = this._register(new Emitter());
    this.onDidRemoveOutputs = this._onDidRemoveOutputs.event;
    this._outputCollection = [];
    this._outputsTop = null;
    this._pauseableEmitter = this._register(new PauseableEmitter());
    this.onDidChangeLayout = this._pauseableEmitter.event;
    this._editorHeight = 0;
    this._chatHeight = 0;
    this._hoveringOutput = false;
    this._focusOnOutput = false;
    this._focusInputInOutput = false;
    this._outputMinHeight = 0;
    this.executionErrorDiagnostic = observableValue("excecutionError", void 0);
    this._hasFindResult = this._register(new Emitter());
    this.hasFindResult = this._hasFindResult.event;
    this._outputViewModels = this.model.outputs.map((output) => new CellOutputViewModel(this, output, this._notebookService));
    this._register(this.model.onDidChangeOutputs((splice) => {
      const removedOutputs = [];
      let outputLayoutChange = false;
      for (let i = splice.start; i < splice.start + splice.deleteCount; i++) {
        if (this._outputCollection[i] !== void 0 && this._outputCollection[i] !== 0) {
          outputLayoutChange = true;
        }
      }
      this._outputCollection.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(() => 0));
      removedOutputs.push(...this._outputViewModels.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map((output) => new CellOutputViewModel(this, output, this._notebookService))));
      this._outputsTop = null;
      this._onDidChangeOutputs.fire(splice);
      this._onDidRemoveOutputs.fire(removedOutputs);
      if (outputLayoutChange) {
        this.layoutChange({ outputHeight: true }, "CodeCellViewModel#model.onDidChangeOutputs");
      }
      if (!this._outputCollection.length) {
        this.executionErrorDiagnostic.set(void 0, void 0);
      }
      dispose(removedOutputs);
    }));
    this._outputCollection = new Array(this.model.outputs.length);
    const layoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
    this._layoutInfo = {
      fontInfo: initialNotebookLayoutInfo?.fontInfo || null,
      editorHeight: 0,
      editorWidth: initialNotebookLayoutInfo ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(initialNotebookLayoutInfo.width) : 0,
      chatHeight: 0,
      statusBarHeight: 0,
      commentOffset: 0,
      commentHeight: 0,
      outputContainerOffset: 0,
      outputTotalHeight: 0,
      outputShowMoreContainerHeight: 0,
      outputShowMoreContainerOffset: 0,
      totalHeight: this.computeTotalHeight(17, 0, 0, 0),
      codeIndicatorHeight: 0,
      outputIndicatorHeight: 0,
      bottomToolbarOffset: 0,
      layoutState: CellLayoutState.Uninitialized,
      estimatedHasHorizontalScrolling: false,
      outlineWidth: 1,
      topMargin: layoutConfiguration.cellTopMargin,
      bottomMargin: layoutConfiguration.cellBottomMargin
    };
  }
  set editorHeight(height) {
    if (this._editorHeight === height) {
      return;
    }
    this._editorHeight = height;
    this.layoutChange({ editorHeight: true }, "CodeCellViewModel#editorHeight");
  }
  get editorHeight() {
    throw new Error("editorHeight is write-only");
  }
  set chatHeight(height) {
    if (this._chatHeight === height) {
      return;
    }
    this._chatHeight = height;
    this.layoutChange({ chatHeight: true }, "CodeCellViewModel#chatHeight");
  }
  get chatHeight() {
    return this._chatHeight;
  }
  get outputIsHovered() {
    return this._hoveringOutput;
  }
  set outputIsHovered(v) {
    this._hoveringOutput = v;
    this._onDidChangeState.fire({ outputIsHoveredChanged: true });
  }
  get outputIsFocused() {
    return this._focusOnOutput;
  }
  set outputIsFocused(v) {
    this._focusOnOutput = v;
    this._onDidChangeState.fire({ outputIsFocusedChanged: true });
  }
  get inputInOutputIsFocused() {
    return this._focusInputInOutput;
  }
  set inputInOutputIsFocused(v) {
    this._focusInputInOutput = v;
  }
  get outputMinHeight() {
    return this._outputMinHeight;
  }
  /**
   * The minimum height of the output region. It's only set to non-zero temporarily when replacing an output with a new one.
   * It's reset to 0 when the new output is rendered, or in one second.
   */
  set outputMinHeight(newMin) {
    this._outputMinHeight = newMin;
  }
  get layoutInfo() {
    return this._layoutInfo;
  }
  get outputsViewModels() {
    return this._outputViewModels;
  }
  updateExecutionState(e) {
    if (e.changed) {
      this.executionErrorDiagnostic.set(void 0, void 0);
      this._onDidStartExecution.fire(e);
    } else {
      this._onDidStopExecution.fire(e);
    }
  }
  updateOptions(e) {
    super.updateOptions(e);
    if (e.cellStatusBarVisibility || e.insertToolbarPosition || e.cellToolbarLocation) {
      this.layoutChange({});
    }
  }
  pauseLayout() {
    this._pauseableEmitter.pause();
  }
  resumeLayout() {
    this._pauseableEmitter.resume();
  }
  layoutChange(state, source) {
    this._ensureOutputsTop();
    const notebookLayoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
    const bottomToolbarDimensions = this.viewContext.notebookOptions.computeBottomToolbarDimensions(this.viewType);
    const outputShowMoreContainerHeight = state.outputShowMoreContainerHeight ? state.outputShowMoreContainerHeight : this._layoutInfo.outputShowMoreContainerHeight;
    const outputTotalHeight = Math.max(this._outputMinHeight, this.isOutputCollapsed ? notebookLayoutConfiguration.collapsedIndicatorHeight : this._outputsTop.getTotalSum());
    const commentHeight = state.commentHeight ? this._commentHeight : this._layoutInfo.commentHeight;
    const originalLayout = this.layoutInfo;
    if (!this.isInputCollapsed) {
      let newState;
      let editorHeight;
      let totalHeight;
      let hasHorizontalScrolling = false;
      const chatHeight = state.chatHeight ? this._chatHeight : this._layoutInfo.chatHeight;
      if (!state.editorHeight && this._layoutInfo.layoutState === CellLayoutState.FromCache && !state.outputHeight) {
        const estimate = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
        editorHeight = estimate.editorHeight;
        hasHorizontalScrolling = estimate.hasHorizontalScrolling;
        totalHeight = this._layoutInfo.totalHeight;
        newState = CellLayoutState.FromCache;
      } else if (state.editorHeight || this._layoutInfo.layoutState === CellLayoutState.Measured) {
        editorHeight = this._editorHeight;
        totalHeight = this.computeTotalHeight(this._editorHeight, outputTotalHeight, outputShowMoreContainerHeight, chatHeight);
        newState = CellLayoutState.Measured;
        hasHorizontalScrolling = this._layoutInfo.estimatedHasHorizontalScrolling;
      } else {
        const estimate = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
        editorHeight = estimate.editorHeight;
        hasHorizontalScrolling = estimate.hasHorizontalScrolling;
        totalHeight = this.computeTotalHeight(editorHeight, outputTotalHeight, outputShowMoreContainerHeight, chatHeight);
        newState = CellLayoutState.Estimated;
      }
      const statusBarHeight = this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata, this.uri);
      const codeIndicatorHeight = editorHeight + statusBarHeight;
      const outputIndicatorHeight = outputTotalHeight + outputShowMoreContainerHeight;
      const outputContainerOffset = notebookLayoutConfiguration.editorToolbarHeight + notebookLayoutConfiguration.cellTopMargin + chatHeight + editorHeight + statusBarHeight;
      const outputShowMoreContainerOffset = totalHeight - bottomToolbarDimensions.bottomToolbarGap - bottomToolbarDimensions.bottomToolbarHeight / 2 - outputShowMoreContainerHeight;
      const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
      const editorWidth = state.outerWidth !== void 0 ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth) : this._layoutInfo?.editorWidth;
      this._layoutInfo = {
        fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
        chatHeight,
        editorHeight,
        editorWidth,
        statusBarHeight,
        outputContainerOffset,
        outputTotalHeight,
        outputShowMoreContainerHeight,
        outputShowMoreContainerOffset,
        commentOffset: outputContainerOffset + outputTotalHeight,
        commentHeight,
        totalHeight,
        codeIndicatorHeight,
        outputIndicatorHeight,
        bottomToolbarOffset,
        layoutState: newState,
        estimatedHasHorizontalScrolling: hasHorizontalScrolling,
        topMargin: notebookLayoutConfiguration.cellTopMargin,
        bottomMargin: notebookLayoutConfiguration.cellBottomMargin,
        outlineWidth: 1
      };
    } else {
      const codeIndicatorHeight = notebookLayoutConfiguration.collapsedIndicatorHeight;
      const outputIndicatorHeight = outputTotalHeight + outputShowMoreContainerHeight;
      const chatHeight = state.chatHeight ? this._chatHeight : this._layoutInfo.chatHeight;
      const outputContainerOffset = notebookLayoutConfiguration.cellTopMargin + notebookLayoutConfiguration.collapsedIndicatorHeight;
      const totalHeight = notebookLayoutConfiguration.cellTopMargin + notebookLayoutConfiguration.collapsedIndicatorHeight + notebookLayoutConfiguration.cellBottomMargin + bottomToolbarDimensions.bottomToolbarGap + chatHeight + commentHeight + outputTotalHeight + outputShowMoreContainerHeight;
      const outputShowMoreContainerOffset = totalHeight - bottomToolbarDimensions.bottomToolbarGap - bottomToolbarDimensions.bottomToolbarHeight / 2 - outputShowMoreContainerHeight;
      const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
      const editorWidth = state.outerWidth !== void 0 ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth) : this._layoutInfo?.editorWidth;
      this._layoutInfo = {
        fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
        editorHeight: this._layoutInfo.editorHeight,
        editorWidth,
        chatHeight,
        statusBarHeight: 0,
        outputContainerOffset,
        outputTotalHeight,
        outputShowMoreContainerHeight,
        outputShowMoreContainerOffset,
        commentOffset: outputContainerOffset + outputTotalHeight,
        commentHeight,
        totalHeight,
        codeIndicatorHeight,
        outputIndicatorHeight,
        bottomToolbarOffset,
        layoutState: this._layoutInfo.layoutState,
        estimatedHasHorizontalScrolling: false,
        outlineWidth: 1,
        topMargin: notebookLayoutConfiguration.cellTopMargin,
        bottomMargin: notebookLayoutConfiguration.cellBottomMargin
      };
    }
    this._fireOnDidChangeLayout({
      ...state,
      totalHeight: this.layoutInfo.totalHeight !== originalLayout.totalHeight,
      source
    });
  }
  _fireOnDidChangeLayout(state) {
    this._pauseableEmitter.fire(state);
  }
  restoreEditorViewState(editorViewStates, totalHeight) {
    super.restoreEditorViewState(editorViewStates);
    if (totalHeight !== void 0 && this._layoutInfo.layoutState !== CellLayoutState.Measured) {
      this._layoutInfo = {
        ...this._layoutInfo,
        totalHeight,
        layoutState: CellLayoutState.FromCache
      };
    }
  }
  getDynamicHeight() {
    this._onLayoutInfoRead.fire();
    return this._layoutInfo.totalHeight;
  }
  getHeight(lineHeight) {
    if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
      const estimate = this.estimateEditorHeight(lineHeight);
      return this.computeTotalHeight(estimate.editorHeight, 0, 0, 0);
    } else {
      return this._layoutInfo.totalHeight;
    }
  }
  estimateEditorHeight(lineHeight = 20) {
    let hasHorizontalScrolling = false;
    const cellEditorOptions = this.viewContext.getBaseCellEditorOptions(this.language);
    if (this.layoutInfo.fontInfo && cellEditorOptions.value.wordWrap === "off") {
      for (let i = 0; i < this.lineCount; i++) {
        const max = this.textBuffer.getLineLastNonWhitespaceColumn(i + 1);
        const estimatedWidth = max * (this.layoutInfo.fontInfo.typicalHalfwidthCharacterWidth + this.layoutInfo.fontInfo.letterSpacing);
        if (estimatedWidth > this.layoutInfo.editorWidth) {
          hasHorizontalScrolling = true;
          break;
        }
      }
    }
    const verticalScrollbarHeight = hasHorizontalScrolling ? 12 : 0;
    const editorPadding = this.viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
    const editorHeight = this.lineCount * lineHeight + editorPadding.top + editorPadding.bottom + verticalScrollbarHeight;
    return {
      editorHeight,
      hasHorizontalScrolling
    };
  }
  computeTotalHeight(editorHeight, outputsTotalHeight, outputShowMoreContainerHeight, chatHeight) {
    const layoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
    const { bottomToolbarGap } = this.viewContext.notebookOptions.computeBottomToolbarDimensions(this.viewType);
    return layoutConfiguration.editorToolbarHeight + layoutConfiguration.cellTopMargin + chatHeight + editorHeight + this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata, this.uri) + this._commentHeight + outputsTotalHeight + outputShowMoreContainerHeight + bottomToolbarGap + layoutConfiguration.cellBottomMargin;
  }
  onDidChangeTextModelContent() {
    if (this.getEditState() !== CellEditState.Editing) {
      this.updateEditState(CellEditState.Editing, "onDidChangeTextModelContent");
      this._onDidChangeState.fire({ contentChanged: true });
    }
  }
  onDeselect() {
    this.updateEditState(CellEditState.Preview, "onDeselect");
  }
  updateOutputShowMoreContainerHeight(height) {
    this.layoutChange({ outputShowMoreContainerHeight: height }, "CodeCellViewModel#updateOutputShowMoreContainerHeight");
  }
  updateOutputMinHeight(height) {
    this.outputMinHeight = height;
  }
  unlockOutputHeight() {
    this.outputMinHeight = 0;
    this.layoutChange({ outputHeight: true });
  }
  updateOutputHeight(index, height, source) {
    if (index >= this._outputCollection.length) {
      throw new Error("Output index out of range!");
    }
    this._ensureOutputsTop();
    try {
      if (index === 0 || height > 0) {
        this._outputViewModels[index].setVisible(true);
      } else if (height === 0) {
        this._outputViewModels[index].setVisible(false);
      }
    } catch (e) {
      const errorMessage = `Failed to update output height for cell ${this.handle}, output ${index}. this.outputCollection.length: ${this._outputCollection.length}, this._outputViewModels.length: ${this._outputViewModels.length}`;
      throw new Error(`${errorMessage}.
 Error: ${e.message}`);
    }
    if (this._outputViewModels[index].visible.get() && height < 28) {
      height = 28;
    }
    this._outputCollection[index] = height;
    if (this._outputsTop.setValue(index, height)) {
      this.layoutChange({ outputHeight: true }, source);
    }
  }
  getOutputOffsetInContainer(index) {
    this._ensureOutputsTop();
    if (index >= this._outputCollection.length) {
      throw new Error("Output index out of range!");
    }
    return this._outputsTop.getPrefixSum(index - 1);
  }
  getOutputOffset(index) {
    return this.layoutInfo.outputContainerOffset + this.getOutputOffsetInContainer(index);
  }
  spliceOutputHeights(start, deleteCnt, heights) {
    this._ensureOutputsTop();
    this._outputsTop.removeValues(start, deleteCnt);
    if (heights.length) {
      const values = new Uint32Array(heights.length);
      for (let i = 0; i < heights.length; i++) {
        values[i] = heights[i];
      }
      this._outputsTop.insertValues(start, values);
    }
    this.layoutChange({ outputHeight: true }, "CodeCellViewModel#spliceOutputs");
  }
  _ensureOutputsTop() {
    if (!this._outputsTop) {
      const values = new Uint32Array(this._outputCollection.length);
      for (let i = 0; i < this._outputCollection.length; i++) {
        values[i] = this._outputCollection[i];
      }
      this._outputsTop = new PrefixSumComputer(values);
    }
  }
  startFind(value, options) {
    const matches = super.cellStartFind(value, options);
    if (matches === null) {
      return null;
    }
    return {
      cell: this,
      contentMatches: matches
    };
  }
  dispose() {
    super.dispose();
    this._outputCollection = [];
    this._outputsTop = null;
    dispose(this._outputViewModels);
  }
};
CodeCellViewModel = __decorateClass([
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, INotebookService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IUndoRedoService),
  __decorateParam(8, ICodeEditorService),
  __decorateParam(9, IInlineChatSessionService)
], CodeCellViewModel);
export {
  CodeCellViewModel,
  outputDisplayLimit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3TW9kZWxcXGNvZGVDZWxsVmlld01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0ICogYXMgVVVJRCBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBQcmVmaXhTdW1Db21wdXRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvcHJlZml4U3VtQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZpbmRNYXRjaCwgQ2VsbExheW91dFN0YXRlLCBDb2RlQ2VsbExheW91dENoYW5nZUV2ZW50LCBDb2RlQ2VsbExheW91dEluZm8sIElDZWxsT3V0cHV0Vmlld01vZGVsLCBJQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va09wdGlvbnNDaGFuZ2VFdmVudCB9IGZyb20gJy4uL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0xheW91dEluZm8gfSBmcm9tICcuLi9ub3RlYm9va1ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgQ2VsbE91dHB1dFZpZXdNb2RlbCB9IGZyb20gJy4vY2VsbE91dHB1dFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4vdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rQ2VsbFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgSU5vdGVib29rRmluZE9wdGlvbnMsIE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNlbGxFeGVjdXRpb25FcnJvciwgSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCYXNlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4vYmFzZUNlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3Qgb3V0cHV0RGlzcGxheUxpbWl0ID0gNTAwO1xuXG5leHBvcnQgY2xhc3MgQ29kZUNlbGxWaWV3TW9kZWwgZXh0ZW5kcyBCYXNlQ2VsbFZpZXdNb2RlbCBpbXBsZW1lbnRzIElDZWxsVmlld01vZGVsIHtcblx0cmVhZG9ubHkgY2VsbEtpbmQgPSBDZWxsS2luZC5Db2RlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25MYXlvdXRJbmZvUmVhZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkxheW91dEluZm9SZWFkID0gdGhpcy5fb25MYXlvdXRJbmZvUmVhZC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkU3RhcnRFeGVjdXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydEV4ZWN1dGlvbiA9IHRoaXMuX29uRGlkU3RhcnRFeGVjdXRpb24uZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTdG9wRXhlY3V0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RvcEV4ZWN1dGlvbiA9IHRoaXMuX29uRGlkU3RvcEV4ZWN1dGlvbi5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3V0cHV0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU91dHB1dHMgPSB0aGlzLl9vbkRpZENoYW5nZU91dHB1dHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVPdXRwdXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUNlbGxPdXRwdXRWaWV3TW9kZWxbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlT3V0cHV0cyA9IHRoaXMuX29uRGlkUmVtb3ZlT3V0cHV0cy5ldmVudDtcblxuXHRwcml2YXRlIF9vdXRwdXRDb2xsZWN0aW9uOiBudW1iZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgX291dHB1dHNUb3A6IFByZWZpeFN1bUNvbXB1dGVyIHwgbnVsbCA9IG51bGw7XG5cblx0cHJvdGVjdGVkIF9wYXVzZWFibGVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhdXNlYWJsZUVtaXR0ZXI8Q29kZUNlbGxMYXlvdXRDaGFuZ2VFdmVudD4oKSk7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYXlvdXQgPSB0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX2VkaXRvckhlaWdodCA9IDA7XG5cdHNldCBlZGl0b3JIZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fZWRpdG9ySGVpZ2h0ID09PSBoZWlnaHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5sYXlvdXRDaGFuZ2UoeyBlZGl0b3JIZWlnaHQ6IHRydWUgfSwgJ0NvZGVDZWxsVmlld01vZGVsI2VkaXRvckhlaWdodCcpO1xuXHR9XG5cblx0Z2V0IGVkaXRvckhlaWdodCgpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2VkaXRvckhlaWdodCBpcyB3cml0ZS1vbmx5Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGF0SGVpZ2h0ID0gMDtcblx0c2V0IGNoYXRIZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fY2hhdEhlaWdodCA9PT0gaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdEhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmxheW91dENoYW5nZSh7IGNoYXRIZWlnaHQ6IHRydWUgfSwgJ0NvZGVDZWxsVmlld01vZGVsI2NoYXRIZWlnaHQnKTtcblx0fVxuXG5cdGdldCBjaGF0SGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0SGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaG92ZXJpbmdPdXRwdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIGdldCBvdXRwdXRJc0hvdmVyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyaW5nT3V0cHV0O1xuXHR9XG5cblx0cHVibGljIHNldCBvdXRwdXRJc0hvdmVyZWQodjogYm9vbGVhbikge1xuXHRcdHRoaXMuX2hvdmVyaW5nT3V0cHV0ID0gdjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBvdXRwdXRJc0hvdmVyZWRDaGFuZ2VkOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNPbk91dHB1dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwdWJsaWMgZ2V0IG91dHB1dElzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNPbk91dHB1dDtcblx0fVxuXG5cdHB1YmxpYyBzZXQgb3V0cHV0SXNGb2N1c2VkKHY6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9mb2N1c09uT3V0cHV0ID0gdjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBvdXRwdXRJc0ZvY3VzZWRDaGFuZ2VkOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNJbnB1dEluT3V0cHV0OiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgaW5wdXRJbk91dHB1dElzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNJbnB1dEluT3V0cHV0O1xuXHR9XG5cblx0cHVibGljIHNldCBpbnB1dEluT3V0cHV0SXNGb2N1c2VkKHY6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9mb2N1c0lucHV0SW5PdXRwdXQgPSB2O1xuXHR9XG5cblx0cHJpdmF0ZSBfb3V0cHV0TWluSGVpZ2h0OiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgZ2V0IG91dHB1dE1pbkhlaWdodCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3V0cHV0TWluSGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIGhlaWdodCBvZiB0aGUgb3V0cHV0IHJlZ2lvbi4gSXQncyBvbmx5IHNldCB0byBub24temVybyB0ZW1wb3JhcmlseSB3aGVuIHJlcGxhY2luZyBhbiBvdXRwdXQgd2l0aCBhIG5ldyBvbmUuXG5cdCAqIEl0J3MgcmVzZXQgdG8gMCB3aGVuIHRoZSBuZXcgb3V0cHV0IGlzIHJlbmRlcmVkLCBvciBpbiBvbmUgc2Vjb25kLlxuXHQgKi9cblx0cHJpdmF0ZSBzZXQgb3V0cHV0TWluSGVpZ2h0KG5ld01pbjogbnVtYmVyKSB7XG5cdFx0dGhpcy5fb3V0cHV0TWluSGVpZ2h0ID0gbmV3TWluO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0SW5mbzogQ29kZUNlbGxMYXlvdXRJbmZvO1xuXG5cdGdldCBsYXlvdXRJbmZvKCkge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRJbmZvO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3V0cHV0Vmlld01vZGVsczogSUNlbGxPdXRwdXRWaWV3TW9kZWxbXTtcblxuXHRnZXQgb3V0cHV0c1ZpZXdNb2RlbHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX291dHB1dFZpZXdNb2RlbHM7XG5cdH1cblxuXHRyZWFkb25seSBleGVjdXRpb25FcnJvckRpYWdub3N0aWMgPSBvYnNlcnZhYmxlVmFsdWU8SUNlbGxFeGVjdXRpb25FcnJvciB8IHVuZGVmaW5lZD4oJ2V4Y2VjdXRpb25FcnJvcicsIHVuZGVmaW5lZCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRtb2RlbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLFxuXHRcdGluaXRpYWxOb3RlYm9va0xheW91dEluZm86IE5vdGVib29rTGF5b3V0SW5mbyB8IG51bGwsXG5cdFx0cmVhZG9ubHkgdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUlubGluZUNoYXRTZXNzaW9uU2VydmljZSBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U6IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodmlld1R5cGUsIG1vZGVsLCBVVUlELmdlbmVyYXRlVXVpZCgpLCB2aWV3Q29udGV4dCwgY29uZmlndXJhdGlvblNlcnZpY2UsIG1vZGVsU2VydmljZSwgdW5kb1JlZG9TZXJ2aWNlLCBjb2RlRWRpdG9yU2VydmljZSwgaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9vdXRwdXRWaWV3TW9kZWxzID0gdGhpcy5tb2RlbC5vdXRwdXRzLm1hcChvdXRwdXQgPT4gbmV3IENlbGxPdXRwdXRWaWV3TW9kZWwodGhpcywgb3V0cHV0LCB0aGlzLl9ub3RlYm9va1NlcnZpY2UpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VPdXRwdXRzKChzcGxpY2UpID0+IHtcblx0XHRcdGNvbnN0IHJlbW92ZWRPdXRwdXRzOiBJQ2VsbE91dHB1dFZpZXdNb2RlbFtdID0gW107XG5cdFx0XHRsZXQgb3V0cHV0TGF5b3V0Q2hhbmdlID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCBpID0gc3BsaWNlLnN0YXJ0OyBpIDwgc3BsaWNlLnN0YXJ0ICsgc3BsaWNlLmRlbGV0ZUNvdW50OyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuX291dHB1dENvbGxlY3Rpb25baV0gIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9vdXRwdXRDb2xsZWN0aW9uW2ldICE9PSAwKSB7XG5cdFx0XHRcdFx0b3V0cHV0TGF5b3V0Q2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vdXRwdXRDb2xsZWN0aW9uLnNwbGljZShzcGxpY2Uuc3RhcnQsIHNwbGljZS5kZWxldGVDb3VudCwgLi4uc3BsaWNlLm5ld091dHB1dHMubWFwKCgpID0+IDApKTtcblx0XHRcdHJlbW92ZWRPdXRwdXRzLnB1c2goLi4udGhpcy5fb3V0cHV0Vmlld01vZGVscy5zcGxpY2Uoc3BsaWNlLnN0YXJ0LCBzcGxpY2UuZGVsZXRlQ291bnQsIC4uLnNwbGljZS5uZXdPdXRwdXRzLm1hcChvdXRwdXQgPT4gbmV3IENlbGxPdXRwdXRWaWV3TW9kZWwodGhpcywgb3V0cHV0LCB0aGlzLl9ub3RlYm9va1NlcnZpY2UpKSkpO1xuXG5cdFx0XHR0aGlzLl9vdXRwdXRzVG9wID0gbnVsbDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3V0cHV0cy5maXJlKHNwbGljZSk7XG5cdFx0XHR0aGlzLl9vbkRpZFJlbW92ZU91dHB1dHMuZmlyZShyZW1vdmVkT3V0cHV0cyk7XG5cdFx0XHRpZiAob3V0cHV0TGF5b3V0Q2hhbmdlKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0Q2hhbmdlKHsgb3V0cHV0SGVpZ2h0OiB0cnVlIH0sICdDb2RlQ2VsbFZpZXdNb2RlbCNtb2RlbC5vbkRpZENoYW5nZU91dHB1dHMnKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fb3V0cHV0Q29sbGVjdGlvbi5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5leGVjdXRpb25FcnJvckRpYWdub3N0aWMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2UocmVtb3ZlZE91dHB1dHMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX291dHB1dENvbGxlY3Rpb24gPSBuZXcgQXJyYXkodGhpcy5tb2RlbC5vdXRwdXRzLmxlbmd0aCk7XG5cdFx0Y29uc3QgbGF5b3V0Q29uZmlndXJhdGlvbiA9IHRoaXMudmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHR0aGlzLl9sYXlvdXRJbmZvID0ge1xuXHRcdFx0Zm9udEluZm86IGluaXRpYWxOb3RlYm9va0xheW91dEluZm8/LmZvbnRJbmZvIHx8IG51bGwsXG5cdFx0XHRlZGl0b3JIZWlnaHQ6IDAsXG5cdFx0XHRlZGl0b3JXaWR0aDogaW5pdGlhbE5vdGVib29rTGF5b3V0SW5mb1xuXHRcdFx0XHQ/IHRoaXMudmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVDb2RlQ2VsbEVkaXRvcldpZHRoKGluaXRpYWxOb3RlYm9va0xheW91dEluZm8ud2lkdGgpXG5cdFx0XHRcdDogMCxcblx0XHRcdGNoYXRIZWlnaHQ6IDAsXG5cdFx0XHRzdGF0dXNCYXJIZWlnaHQ6IDAsXG5cdFx0XHRjb21tZW50T2Zmc2V0OiAwLFxuXHRcdFx0Y29tbWVudEhlaWdodDogMCxcblx0XHRcdG91dHB1dENvbnRhaW5lck9mZnNldDogMCxcblx0XHRcdG91dHB1dFRvdGFsSGVpZ2h0OiAwLFxuXHRcdFx0b3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQ6IDAsXG5cdFx0XHRvdXRwdXRTaG93TW9yZUNvbnRhaW5lck9mZnNldDogMCxcblx0XHRcdHRvdGFsSGVpZ2h0OiB0aGlzLmNvbXB1dGVUb3RhbEhlaWdodCgxNywgMCwgMCwgMCksXG5cdFx0XHRjb2RlSW5kaWNhdG9ySGVpZ2h0OiAwLFxuXHRcdFx0b3V0cHV0SW5kaWNhdG9ySGVpZ2h0OiAwLFxuXHRcdFx0Ym90dG9tVG9vbGJhck9mZnNldDogMCxcblx0XHRcdGxheW91dFN0YXRlOiBDZWxsTGF5b3V0U3RhdGUuVW5pbml0aWFsaXplZCxcblx0XHRcdGVzdGltYXRlZEhhc0hvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVdpZHRoOiAxLFxuXHRcdFx0dG9wTWFyZ2luOiBsYXlvdXRDb25maWd1cmF0aW9uLmNlbGxUb3BNYXJnaW4sXG5cdFx0XHRib3R0b21NYXJnaW46IGxheW91dENvbmZpZ3VyYXRpb24uY2VsbEJvdHRvbU1hcmdpbixcblx0XHR9O1xuXHR9XG5cblx0dXBkYXRlRXhlY3V0aW9uU3RhdGUoZTogSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCkge1xuXHRcdGlmIChlLmNoYW5nZWQpIHtcblx0XHRcdHRoaXMuZXhlY3V0aW9uRXJyb3JEaWFnbm9zdGljLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZFN0YXJ0RXhlY3V0aW9uLmZpcmUoZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29uRGlkU3RvcEV4ZWN1dGlvbi5maXJlKGUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMoZTogTm90ZWJvb2tPcHRpb25zQ2hhbmdlRXZlbnQpIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKGUpO1xuXHRcdGlmIChlLmNlbGxTdGF0dXNCYXJWaXNpYmlsaXR5IHx8IGUuaW5zZXJ0VG9vbGJhclBvc2l0aW9uIHx8IGUuY2VsbFRvb2xiYXJMb2NhdGlvbikge1xuXHRcdFx0dGhpcy5sYXlvdXRDaGFuZ2Uoe30pO1xuXHRcdH1cblx0fVxuXG5cdHBhdXNlTGF5b3V0KCkge1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIucGF1c2UoKTtcblx0fVxuXG5cdHJlc3VtZUxheW91dCgpIHtcblx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLnJlc3VtZSgpO1xuXHR9XG5cblx0bGF5b3V0Q2hhbmdlKHN0YXRlOiBDb2RlQ2VsbExheW91dENoYW5nZUV2ZW50LCBzb3VyY2U/OiBzdHJpbmcpIHtcblx0XHQvLyByZWNvbXB1dGVcblx0XHR0aGlzLl9lbnN1cmVPdXRwdXRzVG9wKCk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uID0gdGhpcy52aWV3Q29udGV4dC5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGNvbnN0IGJvdHRvbVRvb2xiYXJEaW1lbnNpb25zID0gdGhpcy52aWV3Q29udGV4dC5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHRoaXMudmlld1R5cGUpO1xuXHRcdGNvbnN0IG91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0ID0gc3RhdGUub3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQgPyBzdGF0ZS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodCA6IHRoaXMuX2xheW91dEluZm8ub3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQ7XG5cdFx0Y29uc3Qgb3V0cHV0VG90YWxIZWlnaHQgPSBNYXRoLm1heCh0aGlzLl9vdXRwdXRNaW5IZWlnaHQsIHRoaXMuaXNPdXRwdXRDb2xsYXBzZWQgPyBub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uY29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0IDogdGhpcy5fb3V0cHV0c1RvcCEuZ2V0VG90YWxTdW0oKSk7XG5cdFx0Y29uc3QgY29tbWVudEhlaWdodCA9IHN0YXRlLmNvbW1lbnRIZWlnaHQgPyB0aGlzLl9jb21tZW50SGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5jb21tZW50SGVpZ2h0O1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxMYXlvdXQgPSB0aGlzLmxheW91dEluZm87XG5cdFx0aWYgKCF0aGlzLmlzSW5wdXRDb2xsYXBzZWQpIHtcblx0XHRcdGxldCBuZXdTdGF0ZTogQ2VsbExheW91dFN0YXRlO1xuXHRcdFx0bGV0IGVkaXRvckhlaWdodDogbnVtYmVyO1xuXHRcdFx0bGV0IHRvdGFsSGVpZ2h0OiBudW1iZXI7XG5cdFx0XHRsZXQgaGFzSG9yaXpvbnRhbFNjcm9sbGluZyA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgY2hhdEhlaWdodCA9IHN0YXRlLmNoYXRIZWlnaHQgPyB0aGlzLl9jaGF0SGVpZ2h0IDogdGhpcy5fbGF5b3V0SW5mby5jaGF0SGVpZ2h0O1xuXHRcdFx0aWYgKCFzdGF0ZS5lZGl0b3JIZWlnaHQgJiYgdGhpcy5fbGF5b3V0SW5mby5sYXlvdXRTdGF0ZSA9PT0gQ2VsbExheW91dFN0YXRlLkZyb21DYWNoZSAmJiAhc3RhdGUub3V0cHV0SGVpZ2h0KSB7XG5cdFx0XHRcdC8vIE5vIG5ldyBlZGl0b3JIZWlnaHQgaW5mbyAtIGtlZXAgY2FjaGVkIHRvdGFsSGVpZ2h0IGFuZCBlc3RpbWF0ZSBlZGl0b3JIZWlnaHRcblx0XHRcdFx0Y29uc3QgZXN0aW1hdGUgPSB0aGlzLmVzdGltYXRlRWRpdG9ySGVpZ2h0KHN0YXRlLmZvbnQ/LmxpbmVIZWlnaHQgPz8gdGhpcy5fbGF5b3V0SW5mby5mb250SW5mbz8ubGluZUhlaWdodCk7XG5cdFx0XHRcdGVkaXRvckhlaWdodCA9IGVzdGltYXRlLmVkaXRvckhlaWdodDtcblx0XHRcdFx0aGFzSG9yaXpvbnRhbFNjcm9sbGluZyA9IGVzdGltYXRlLmhhc0hvcml6b250YWxTY3JvbGxpbmc7XG5cdFx0XHRcdHRvdGFsSGVpZ2h0ID0gdGhpcy5fbGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0XHRcdFx0bmV3U3RhdGUgPSBDZWxsTGF5b3V0U3RhdGUuRnJvbUNhY2hlO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lZGl0b3JIZWlnaHQgfHwgdGhpcy5fbGF5b3V0SW5mby5sYXlvdXRTdGF0ZSA9PT0gQ2VsbExheW91dFN0YXRlLk1lYXN1cmVkKSB7XG5cdFx0XHRcdC8vIEVkaXRvciBoYXMgYmVlbiBtZWFzdXJlZFxuXHRcdFx0XHRlZGl0b3JIZWlnaHQgPSB0aGlzLl9lZGl0b3JIZWlnaHQ7XG5cdFx0XHRcdHRvdGFsSGVpZ2h0ID0gdGhpcy5jb21wdXRlVG90YWxIZWlnaHQodGhpcy5fZWRpdG9ySGVpZ2h0LCBvdXRwdXRUb3RhbEhlaWdodCwgb3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQsIGNoYXRIZWlnaHQpO1xuXHRcdFx0XHRuZXdTdGF0ZSA9IENlbGxMYXlvdXRTdGF0ZS5NZWFzdXJlZDtcblx0XHRcdFx0aGFzSG9yaXpvbnRhbFNjcm9sbGluZyA9IHRoaXMuX2xheW91dEluZm8uZXN0aW1hdGVkSGFzSG9yaXpvbnRhbFNjcm9sbGluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVzdGltYXRlID0gdGhpcy5lc3RpbWF0ZUVkaXRvckhlaWdodChzdGF0ZS5mb250Py5saW5lSGVpZ2h0ID8/IHRoaXMuX2xheW91dEluZm8uZm9udEluZm8/LmxpbmVIZWlnaHQpO1xuXHRcdFx0XHRlZGl0b3JIZWlnaHQgPSBlc3RpbWF0ZS5lZGl0b3JIZWlnaHQ7XG5cdFx0XHRcdGhhc0hvcml6b250YWxTY3JvbGxpbmcgPSBlc3RpbWF0ZS5oYXNIb3Jpem9udGFsU2Nyb2xsaW5nO1xuXHRcdFx0XHR0b3RhbEhlaWdodCA9IHRoaXMuY29tcHV0ZVRvdGFsSGVpZ2h0KGVkaXRvckhlaWdodCwgb3V0cHV0VG90YWxIZWlnaHQsIG91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0LCBjaGF0SGVpZ2h0KTtcblx0XHRcdFx0bmV3U3RhdGUgPSBDZWxsTGF5b3V0U3RhdGUuRXN0aW1hdGVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0dXNCYXJIZWlnaHQgPSB0aGlzLnZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yU3RhdHVzYmFySGVpZ2h0KHRoaXMuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy51cmkpO1xuXHRcdFx0Y29uc3QgY29kZUluZGljYXRvckhlaWdodCA9IGVkaXRvckhlaWdodCArIHN0YXR1c0JhckhlaWdodDtcblx0XHRcdGNvbnN0IG91dHB1dEluZGljYXRvckhlaWdodCA9IG91dHB1dFRvdGFsSGVpZ2h0ICsgb3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBvdXRwdXRDb250YWluZXJPZmZzZXQgPSBub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uZWRpdG9yVG9vbGJhckhlaWdodFxuXHRcdFx0XHQrIG5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsVG9wTWFyZ2luIC8vIENFTExfVE9QX01BUkdJTlxuXHRcdFx0XHQrIGNoYXRIZWlnaHRcblx0XHRcdFx0KyBlZGl0b3JIZWlnaHRcblx0XHRcdFx0KyBzdGF0dXNCYXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBvdXRwdXRTaG93TW9yZUNvbnRhaW5lck9mZnNldCA9IHRvdGFsSGVpZ2h0XG5cdFx0XHRcdC0gYm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckdhcFxuXHRcdFx0XHQtIGJvdHRvbVRvb2xiYXJEaW1lbnNpb25zLmJvdHRvbVRvb2xiYXJIZWlnaHQgLyAyXG5cdFx0XHRcdC0gb3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBib3R0b21Ub29sYmFyT2Zmc2V0ID0gdGhpcy52aWV3Q29udGV4dC5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJPZmZzZXQodG90YWxIZWlnaHQsIHRoaXMudmlld1R5cGUpO1xuXHRcdFx0Y29uc3QgZWRpdG9yV2lkdGggPSBzdGF0ZS5vdXRlcldpZHRoICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyB0aGlzLnZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucy5jb21wdXRlQ29kZUNlbGxFZGl0b3JXaWR0aChzdGF0ZS5vdXRlcldpZHRoKVxuXHRcdFx0XHQ6IHRoaXMuX2xheW91dEluZm8/LmVkaXRvcldpZHRoO1xuXG5cdFx0XHR0aGlzLl9sYXlvdXRJbmZvID0ge1xuXHRcdFx0XHRmb250SW5mbzogc3RhdGUuZm9udCA/PyB0aGlzLl9sYXlvdXRJbmZvLmZvbnRJbmZvID8/IG51bGwsXG5cdFx0XHRcdGNoYXRIZWlnaHQsXG5cdFx0XHRcdGVkaXRvckhlaWdodCxcblx0XHRcdFx0ZWRpdG9yV2lkdGgsXG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHRvdXRwdXRUb3RhbEhlaWdodCxcblx0XHRcdFx0b3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQsXG5cdFx0XHRcdG91dHB1dFNob3dNb3JlQ29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHRjb21tZW50T2Zmc2V0OiBvdXRwdXRDb250YWluZXJPZmZzZXQgKyBvdXRwdXRUb3RhbEhlaWdodCxcblx0XHRcdFx0Y29tbWVudEhlaWdodCxcblx0XHRcdFx0dG90YWxIZWlnaHQsXG5cdFx0XHRcdGNvZGVJbmRpY2F0b3JIZWlnaHQsXG5cdFx0XHRcdG91dHB1dEluZGljYXRvckhlaWdodCxcblx0XHRcdFx0Ym90dG9tVG9vbGJhck9mZnNldCxcblx0XHRcdFx0bGF5b3V0U3RhdGU6IG5ld1N0YXRlLFxuXHRcdFx0XHRlc3RpbWF0ZWRIYXNIb3Jpem9udGFsU2Nyb2xsaW5nOiBoYXNIb3Jpem9udGFsU2Nyb2xsaW5nLFxuXHRcdFx0XHR0b3BNYXJnaW46IG5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsVG9wTWFyZ2luLFxuXHRcdFx0XHRib3R0b21NYXJnaW46IG5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsQm90dG9tTWFyZ2luLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IDFcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNvZGVJbmRpY2F0b3JIZWlnaHQgPSBub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uY29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0O1xuXHRcdFx0Y29uc3Qgb3V0cHV0SW5kaWNhdG9ySGVpZ2h0ID0gb3V0cHV0VG90YWxIZWlnaHQgKyBvdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodDtcblx0XHRcdGNvbnN0IGNoYXRIZWlnaHQgPSBzdGF0ZS5jaGF0SGVpZ2h0ID8gdGhpcy5fY2hhdEhlaWdodCA6IHRoaXMuX2xheW91dEluZm8uY2hhdEhlaWdodDtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0Q29udGFpbmVyT2Zmc2V0ID0gbm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uLmNlbGxUb3BNYXJnaW4gKyBub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uY29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0O1xuXHRcdFx0Y29uc3QgdG90YWxIZWlnaHQgPVxuXHRcdFx0XHRub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uY2VsbFRvcE1hcmdpblxuXHRcdFx0XHQrIG5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbi5jb2xsYXBzZWRJbmRpY2F0b3JIZWlnaHRcblx0XHRcdFx0KyBub3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24uY2VsbEJvdHRvbU1hcmdpbiAvL0NFTExfQk9UVE9NX01BUkdJTlxuXHRcdFx0XHQrIGJvdHRvbVRvb2xiYXJEaW1lbnNpb25zLmJvdHRvbVRvb2xiYXJHYXAgLy9CT1RUT01fQ0VMTF9UT09MQkFSX0dBUFxuXHRcdFx0XHQrIGNoYXRIZWlnaHRcblx0XHRcdFx0KyBjb21tZW50SGVpZ2h0XG5cdFx0XHRcdCsgb3V0cHV0VG90YWxIZWlnaHQgKyBvdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodDtcblx0XHRcdGNvbnN0IG91dHB1dFNob3dNb3JlQ29udGFpbmVyT2Zmc2V0ID0gdG90YWxIZWlnaHRcblx0XHRcdFx0LSBib3R0b21Ub29sYmFyRGltZW5zaW9ucy5ib3R0b21Ub29sYmFyR2FwXG5cdFx0XHRcdC0gYm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckhlaWdodCAvIDJcblx0XHRcdFx0LSBvdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodDtcblx0XHRcdGNvbnN0IGJvdHRvbVRvb2xiYXJPZmZzZXQgPSB0aGlzLnZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucy5jb21wdXRlQm90dG9tVG9vbGJhck9mZnNldCh0b3RhbEhlaWdodCwgdGhpcy52aWV3VHlwZSk7XG5cdFx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IHN0YXRlLm91dGVyV2lkdGggIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHRoaXMudmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVDb2RlQ2VsbEVkaXRvcldpZHRoKHN0YXRlLm91dGVyV2lkdGgpXG5cdFx0XHRcdDogdGhpcy5fbGF5b3V0SW5mbz8uZWRpdG9yV2lkdGg7XG5cblx0XHRcdHRoaXMuX2xheW91dEluZm8gPSB7XG5cdFx0XHRcdGZvbnRJbmZvOiBzdGF0ZS5mb250ID8/IHRoaXMuX2xheW91dEluZm8uZm9udEluZm8gPz8gbnVsbCxcblx0XHRcdFx0ZWRpdG9ySGVpZ2h0OiB0aGlzLl9sYXlvdXRJbmZvLmVkaXRvckhlaWdodCxcblx0XHRcdFx0ZWRpdG9yV2lkdGgsXG5cdFx0XHRcdGNoYXRIZWlnaHQ6IGNoYXRIZWlnaHQsXG5cdFx0XHRcdHN0YXR1c0JhckhlaWdodDogMCxcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHRvdXRwdXRUb3RhbEhlaWdodCxcblx0XHRcdFx0b3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQsXG5cdFx0XHRcdG91dHB1dFNob3dNb3JlQ29udGFpbmVyT2Zmc2V0LFxuXHRcdFx0XHRjb21tZW50T2Zmc2V0OiBvdXRwdXRDb250YWluZXJPZmZzZXQgKyBvdXRwdXRUb3RhbEhlaWdodCxcblx0XHRcdFx0Y29tbWVudEhlaWdodCxcblx0XHRcdFx0dG90YWxIZWlnaHQsXG5cdFx0XHRcdGNvZGVJbmRpY2F0b3JIZWlnaHQsXG5cdFx0XHRcdG91dHB1dEluZGljYXRvckhlaWdodCxcblx0XHRcdFx0Ym90dG9tVG9vbGJhck9mZnNldCxcblx0XHRcdFx0bGF5b3V0U3RhdGU6IHRoaXMuX2xheW91dEluZm8ubGF5b3V0U3RhdGUsXG5cdFx0XHRcdGVzdGltYXRlZEhhc0hvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRvdXRsaW5lV2lkdGg6IDEsXG5cdFx0XHRcdHRvcE1hcmdpbjogbm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uLmNlbGxUb3BNYXJnaW4sXG5cdFx0XHRcdGJvdHRvbU1hcmdpbjogbm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uLmNlbGxCb3R0b21NYXJnaW4sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZpcmVPbkRpZENoYW5nZUxheW91dCh7XG5cdFx0XHQuLi5zdGF0ZSxcblx0XHRcdHRvdGFsSGVpZ2h0OiB0aGlzLmxheW91dEluZm8udG90YWxIZWlnaHQgIT09IG9yaWdpbmFsTGF5b3V0LnRvdGFsSGVpZ2h0LFxuXHRcdFx0c291cmNlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZU9uRGlkQ2hhbmdlTGF5b3V0KHN0YXRlOiBDb2RlQ2VsbExheW91dENoYW5nZUV2ZW50KSB7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHN0YXRlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoZWRpdG9yVmlld1N0YXRlczogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgbnVsbCwgdG90YWxIZWlnaHQ/OiBudW1iZXIpIHtcblx0XHRzdXBlci5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKGVkaXRvclZpZXdTdGF0ZXMpO1xuXHRcdGlmICh0b3RhbEhlaWdodCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2xheW91dEluZm8ubGF5b3V0U3RhdGUgIT09IENlbGxMYXlvdXRTdGF0ZS5NZWFzdXJlZCkge1xuXHRcdFx0dGhpcy5fbGF5b3V0SW5mbyA9IHtcblx0XHRcdFx0Li4udGhpcy5fbGF5b3V0SW5mbyxcblx0XHRcdFx0dG90YWxIZWlnaHQ6IHRvdGFsSGVpZ2h0LFxuXHRcdFx0XHRsYXlvdXRTdGF0ZTogQ2VsbExheW91dFN0YXRlLkZyb21DYWNoZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Z2V0RHluYW1pY0hlaWdodCgpIHtcblx0XHR0aGlzLl9vbkxheW91dEluZm9SZWFkLmZpcmUoKTtcblx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0fVxuXG5cdGdldEhlaWdodChsaW5lSGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fbGF5b3V0SW5mby5sYXlvdXRTdGF0ZSA9PT0gQ2VsbExheW91dFN0YXRlLlVuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdGNvbnN0IGVzdGltYXRlID0gdGhpcy5lc3RpbWF0ZUVkaXRvckhlaWdodChsaW5lSGVpZ2h0KTtcblx0XHRcdHJldHVybiB0aGlzLmNvbXB1dGVUb3RhbEhlaWdodChlc3RpbWF0ZS5lZGl0b3JIZWlnaHQsIDAsIDAsIDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVzdGltYXRlRWRpdG9ySGVpZ2h0KGxpbmVIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IDIwKTogeyBlZGl0b3JIZWlnaHQ6IG51bWJlcjsgaGFzSG9yaXpvbnRhbFNjcm9sbGluZzogYm9vbGVhbiB9IHtcblx0XHRsZXQgaGFzSG9yaXpvbnRhbFNjcm9sbGluZyA9IGZhbHNlO1xuXHRcdGNvbnN0IGNlbGxFZGl0b3JPcHRpb25zID0gdGhpcy52aWV3Q29udGV4dC5nZXRCYXNlQ2VsbEVkaXRvck9wdGlvbnModGhpcy5sYW5ndWFnZSk7XG5cdFx0aWYgKHRoaXMubGF5b3V0SW5mby5mb250SW5mbyAmJiBjZWxsRWRpdG9yT3B0aW9ucy52YWx1ZS53b3JkV3JhcCA9PT0gJ29mZicpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5saW5lQ291bnQ7IGkrKykge1xuXHRcdFx0XHRjb25zdCBtYXggPSB0aGlzLnRleHRCdWZmZXIuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGkgKyAxKTtcblx0XHRcdFx0Y29uc3QgZXN0aW1hdGVkV2lkdGggPSBtYXggKiAodGhpcy5sYXlvdXRJbmZvLmZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCArIHRoaXMubGF5b3V0SW5mby5mb250SW5mby5sZXR0ZXJTcGFjaW5nKTtcblx0XHRcdFx0aWYgKGVzdGltYXRlZFdpZHRoID4gdGhpcy5sYXlvdXRJbmZvLmVkaXRvcldpZHRoKSB7XG5cdFx0XHRcdFx0aGFzSG9yaXpvbnRhbFNjcm9sbGluZyA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhckhlaWdodCA9IGhhc0hvcml6b250YWxTY3JvbGxpbmcgPyAxMiA6IDA7IC8vIHRha2Ugem9vbSBsZXZlbCBpbnRvIGFjY291bnRcblx0XHRjb25zdCBlZGl0b3JQYWRkaW5nID0gdGhpcy52aWV3Q29udGV4dC5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUVkaXRvclBhZGRpbmcodGhpcy5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnVyaSk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5saW5lQ291bnQgKiBsaW5lSGVpZ2h0XG5cdFx0XHQrIGVkaXRvclBhZGRpbmcudG9wXG5cdFx0XHQrIGVkaXRvclBhZGRpbmcuYm90dG9tIC8vIEVESVRPUl9CT1RUT01fUEFERElOR1xuXHRcdFx0KyB2ZXJ0aWNhbFNjcm9sbGJhckhlaWdodDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9ySGVpZ2h0LFxuXHRcdFx0aGFzSG9yaXpvbnRhbFNjcm9sbGluZ1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVUb3RhbEhlaWdodChlZGl0b3JIZWlnaHQ6IG51bWJlciwgb3V0cHV0c1RvdGFsSGVpZ2h0OiBudW1iZXIsIG91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0OiBudW1iZXIsIGNoYXRIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbGF5b3V0Q29uZmlndXJhdGlvbiA9IHRoaXMudmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAgfSA9IHRoaXMudmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh0aGlzLnZpZXdUeXBlKTtcblx0XHRyZXR1cm4gbGF5b3V0Q29uZmlndXJhdGlvbi5lZGl0b3JUb29sYmFySGVpZ2h0XG5cdFx0XHQrIGxheW91dENvbmZpZ3VyYXRpb24uY2VsbFRvcE1hcmdpblxuXHRcdFx0KyBjaGF0SGVpZ2h0XG5cdFx0XHQrIGVkaXRvckhlaWdodFxuXHRcdFx0KyB0aGlzLnZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yU3RhdHVzYmFySGVpZ2h0KHRoaXMuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy51cmkpXG5cdFx0XHQrIHRoaXMuX2NvbW1lbnRIZWlnaHRcblx0XHRcdCsgb3V0cHV0c1RvdGFsSGVpZ2h0XG5cdFx0XHQrIG91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0XG5cdFx0XHQrIGJvdHRvbVRvb2xiYXJHYXBcblx0XHRcdCsgbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsQm90dG9tTWFyZ2luO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkQ2hhbmdlVGV4dE1vZGVsQ29udGVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5nZXRFZGl0U3RhdGUoKSAhPT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdvbkRpZENoYW5nZVRleHRNb2RlbENvbnRlbnQnKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IGNvbnRlbnRDaGFuZ2VkOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdG9uRGVzZWxlY3QoKSB7XG5cdFx0dGhpcy51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnb25EZXNlbGVjdCcpO1xuXHR9XG5cblx0dXBkYXRlT3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHR0aGlzLmxheW91dENoYW5nZSh7IG91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0OiBoZWlnaHQgfSwgJ0NvZGVDZWxsVmlld01vZGVsI3VwZGF0ZU91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0Jyk7XG5cdH1cblxuXHR1cGRhdGVPdXRwdXRNaW5IZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHR0aGlzLm91dHB1dE1pbkhlaWdodCA9IGhlaWdodDtcblx0fVxuXG5cdHVubG9ja091dHB1dEhlaWdodCgpIHtcblx0XHR0aGlzLm91dHB1dE1pbkhlaWdodCA9IDA7XG5cdFx0dGhpcy5sYXlvdXRDaGFuZ2UoeyBvdXRwdXRIZWlnaHQ6IHRydWUgfSk7XG5cdH1cblxuXHR1cGRhdGVPdXRwdXRIZWlnaHQoaW5kZXg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHNvdXJjZT86IHN0cmluZykge1xuXHRcdGlmIChpbmRleCA+PSB0aGlzLl9vdXRwdXRDb2xsZWN0aW9uLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPdXRwdXQgaW5kZXggb3V0IG9mIHJhbmdlIScpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Vuc3VyZU91dHB1dHNUb3AoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaW5kZXggPT09IDAgfHwgaGVpZ2h0ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRWaWV3TW9kZWxzW2luZGV4XS5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChoZWlnaHQgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fb3V0cHV0Vmlld01vZGVsc1tpbmRleF0uc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gYEZhaWxlZCB0byB1cGRhdGUgb3V0cHV0IGhlaWdodCBmb3IgY2VsbCAke3RoaXMuaGFuZGxlfSwgb3V0cHV0ICR7aW5kZXh9LiBgXG5cdFx0XHRcdCsgYHRoaXMub3V0cHV0Q29sbGVjdGlvbi5sZW5ndGg6ICR7dGhpcy5fb3V0cHV0Q29sbGVjdGlvbi5sZW5ndGh9LCB0aGlzLl9vdXRwdXRWaWV3TW9kZWxzLmxlbmd0aDogJHt0aGlzLl9vdXRwdXRWaWV3TW9kZWxzLmxlbmd0aH1gO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2Vycm9yTWVzc2FnZX0uXFxuIEVycm9yOiAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fb3V0cHV0Vmlld01vZGVsc1tpbmRleF0udmlzaWJsZS5nZXQoKSAmJiBoZWlnaHQgPCAyOCkge1xuXHRcdFx0aGVpZ2h0ID0gMjg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3V0cHV0Q29sbGVjdGlvbltpbmRleF0gPSBoZWlnaHQ7XG5cdFx0aWYgKHRoaXMuX291dHB1dHNUb3AhLnNldFZhbHVlKGluZGV4LCBoZWlnaHQpKSB7XG5cdFx0XHR0aGlzLmxheW91dENoYW5nZSh7IG91dHB1dEhlaWdodDogdHJ1ZSB9LCBzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldE91dHB1dE9mZnNldEluQ29udGFpbmVyKGluZGV4OiBudW1iZXIpIHtcblx0XHR0aGlzLl9lbnN1cmVPdXRwdXRzVG9wKCk7XG5cblx0XHRpZiAoaW5kZXggPj0gdGhpcy5fb3V0cHV0Q29sbGVjdGlvbi5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignT3V0cHV0IGluZGV4IG91dCBvZiByYW5nZSEnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fb3V0cHV0c1RvcCEuZ2V0UHJlZml4U3VtKGluZGV4IC0gMSk7XG5cdH1cblxuXHRnZXRPdXRwdXRPZmZzZXQoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0SW5mby5vdXRwdXRDb250YWluZXJPZmZzZXQgKyB0aGlzLmdldE91dHB1dE9mZnNldEluQ29udGFpbmVyKGluZGV4KTtcblx0fVxuXG5cdHNwbGljZU91dHB1dEhlaWdodHMoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ250OiBudW1iZXIsIGhlaWdodHM6IG51bWJlcltdKSB7XG5cdFx0dGhpcy5fZW5zdXJlT3V0cHV0c1RvcCgpO1xuXG5cdFx0dGhpcy5fb3V0cHV0c1RvcCEucmVtb3ZlVmFsdWVzKHN0YXJ0LCBkZWxldGVDbnQpO1xuXHRcdGlmIChoZWlnaHRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgdmFsdWVzID0gbmV3IFVpbnQzMkFycmF5KGhlaWdodHMubGVuZ3RoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaGVpZ2h0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR2YWx1ZXNbaV0gPSBoZWlnaHRzW2ldO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vdXRwdXRzVG9wIS5pbnNlcnRWYWx1ZXMoc3RhcnQsIHZhbHVlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXlvdXRDaGFuZ2UoeyBvdXRwdXRIZWlnaHQ6IHRydWUgfSwgJ0NvZGVDZWxsVmlld01vZGVsI3NwbGljZU91dHB1dHMnKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZU91dHB1dHNUb3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9vdXRwdXRzVG9wKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBuZXcgVWludDMyQXJyYXkodGhpcy5fb3V0cHV0Q29sbGVjdGlvbi5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9vdXRwdXRDb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHZhbHVlc1tpXSA9IHRoaXMuX291dHB1dENvbGxlY3Rpb25baV07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX291dHB1dHNUb3AgPSBuZXcgUHJlZml4U3VtQ29tcHV0ZXIodmFsdWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNGaW5kUmVzdWx0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBoYXNGaW5kUmVzdWx0OiBFdmVudDxib29sZWFuPiA9IHRoaXMuX2hhc0ZpbmRSZXN1bHQuZXZlbnQ7XG5cblx0c3RhcnRGaW5kKHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM6IElOb3RlYm9va0ZpbmRPcHRpb25zKTogQ2VsbEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBzdXBlci5jZWxsU3RhcnRGaW5kKHZhbHVlLCBvcHRpb25zKTtcblxuXHRcdGlmIChtYXRjaGVzID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2VsbDogdGhpcyxcblx0XHRcdGNvbnRlbnRNYXRjaGVzOiBtYXRjaGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fb3V0cHV0Q29sbGVjdGlvbiA9IFtdO1xuXHRcdHRoaXMuX291dHB1dHNUb3AgPSBudWxsO1xuXHRcdGRpc3Bvc2UodGhpcy5fb3V0cHV0Vmlld01vZGVscyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFnQix3QkFBd0I7QUFDakQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksVUFBVTtBQUN0QixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQThCLHVCQUE0RztBQUduSixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLGdCQUFpRTtBQUUxRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQUVuQyxNQUFNLHFCQUFxQjtBQUUzQixJQUFNLG9CQUFOLGNBQWdDLGtCQUE0QztBQUFBLEVBOEdsRixZQUNDLFVBQ0EsT0FDQSwyQkFDUyxhQUNjLHNCQUNZLGtCQUNoQixjQUNELGlCQUNFLG1CQUNPLDBCQUMxQjtBQUNELFVBQU0sVUFBVSxPQUFPLEtBQUssYUFBYSxHQUFHLGFBQWEsc0JBQXNCLGNBQWMsaUJBQWlCLG1CQUFtQix3QkFBd0I7QUFSaEo7QUFFMEI7QUFuSHBDLFNBQVMsV0FBVyxTQUFTO0FBRTdCLFNB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
