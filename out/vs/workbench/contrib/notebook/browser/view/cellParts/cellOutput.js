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
import * as DOM from "../../../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../../../base/browser/markdownRenderer.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import * as nls from "../../../../../../nls.js";
import { getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { JUPYTER_EXTENSION_ID, RenderOutputType } from "../../notebookBrowser.js";
import { mimetypeIcon } from "../../notebookIcons.js";
import { CellContentPart } from "../cellPart.js";
import { CellUri, NotebookCellExecutionState, RENDERER_NOT_AVAILABLE } from "../../../common/notebookCommon.js";
import { isTextStreamMime } from "../../../../../../base/common/mime.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { INotebookService } from "../../../common/notebookService.js";
import { COPY_OUTPUT_COMMAND_ID } from "../../controller/cellOutputActions.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from "../../../common/notebookContextKeys.js";
import { TEXT_BASED_MIMETYPES } from "../../viewModel/cellOutputTextHelper.js";
let CellOutputElement = class extends Disposable {
  constructor(notebookEditor, viewCell, cellOutputContainer, outputContainer, output, notebookService, quickInputService, parentContextKeyService, menuService, extensionsWorkbenchService, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.cellOutputContainer = cellOutputContainer;
    this.outputContainer = outputContainer;
    this.output = output;
    this.notebookService = notebookService;
    this.quickInputService = quickInputService;
    this.menuService = menuService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.instantiationService = instantiationService;
    this.toolbarDisposables = this._register(new DisposableStore());
    this.toolbarAttached = false;
    this._outputHeightTimer = null;
    this.contextKeyService = parentContextKeyService;
    this._register(this.output.model.onDidChangeData(() => {
      this.rerender();
    }));
    this._register(this.output.onDidResetRenderer(() => {
      this.rerender();
    }));
  }
  detach() {
    this.renderedOutputContainer?.remove();
    let count = 0;
    if (this.innerContainer) {
      for (let i = 0; i < this.innerContainer.childNodes.length; i++) {
        if (this.innerContainer.childNodes[i].className === "rendered-output") {
          count++;
        }
        if (count > 1) {
          break;
        }
      }
      if (count === 0) {
        this.innerContainer.remove();
      }
    }
    this.notebookEditor.removeInset(this.output);
  }
  updateDOMTop(top) {
    if (this.innerContainer) {
      this.innerContainer.style.top = `${top}px`;
    }
  }
  rerender() {
    if (this.notebookEditor.hasModel() && this.innerContainer && this.renderResult && this.renderResult.type === RenderOutputType.Extension) {
      const [mimeTypes, pick] = this.output.resolveMimeTypes(this.notebookEditor.textModel, this.notebookEditor.activeKernel?.preloadProvides);
      const pickedMimeType = mimeTypes[pick];
      if (pickedMimeType.mimeType === this.renderResult.mimeType && pickedMimeType.rendererId === this.renderResult.renderer.id) {
        const index = this.viewCell.outputsViewModels.indexOf(this.output);
        this.notebookEditor.updateOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index));
        return;
      }
    }
    if (!this.innerContainer) {
      const currOutputIndex = this.cellOutputContainer.renderedOutputEntries.findIndex((entry) => entry.element === this);
      const previousSibling = currOutputIndex > 0 && !!this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer?.parentElement ? this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer : void 0;
      this.render(previousSibling);
    } else {
      const nextElement = this.innerContainer.nextElementSibling;
      this.toolbarDisposables.clear();
      const element = this.innerContainer;
      if (element) {
        element.remove();
        this.notebookEditor.removeInset(this.output);
      }
      this.render(nextElement);
    }
    this._relayoutCell();
  }
  // insert after previousSibling
  _generateInnerOutputContainer(previousSibling, pickedMimeTypeRenderer) {
    this.innerContainer = DOM.$(".output-inner-container");
    if (previousSibling && previousSibling.nextElementSibling) {
      this.outputContainer.domNode.insertBefore(this.innerContainer, previousSibling.nextElementSibling);
    } else {
      this.outputContainer.domNode.appendChild(this.innerContainer);
    }
    this.innerContainer.setAttribute("output-mime-type", pickedMimeTypeRenderer.mimeType);
    return this.innerContainer;
  }
  render(previousSibling) {
    const index = this.viewCell.outputsViewModels.indexOf(this.output);
    if (this.viewCell.isOutputCollapsed || !this.notebookEditor.hasModel()) {
      this.cellOutputContainer.flagAsStale();
      return void 0;
    }
    const notebookUri = CellUri.parse(this.viewCell.uri)?.notebook;
    if (!notebookUri) {
      return void 0;
    }
    const notebookTextModel = this.notebookEditor.textModel;
    const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel, this.notebookEditor.activeKernel?.preloadProvides);
    const currentMimeType = mimeTypes[pick];
    if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
      this.viewCell.updateOutputHeight(index, 0, "CellOutputElement#noMimeType");
      return void 0;
    }
    const selectedPresentation = mimeTypes[pick];
    let renderer = this.notebookService.getRendererInfo(selectedPresentation.rendererId);
    if (!renderer && selectedPresentation.mimeType.indexOf("text/") > -1) {
      renderer = this.notebookService.getRendererInfo("vscode.builtin-renderer");
    }
    const innerContainer = this._generateInnerOutputContainer(previousSibling, selectedPresentation);
    if (index === 0 || this.output.visible.get()) {
      this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, currentMimeType, mimeTypes);
    } else {
      this._register(autorun((reader) => {
        const visible = reader.readObservable(this.output.visible);
        if (visible && !this.toolbarAttached) {
          this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, currentMimeType, mimeTypes);
        } else if (!visible) {
          this.toolbarDisposables.clear();
        }
        this.cellOutputContainer.checkForHiddenOutputs();
      }));
      this.cellOutputContainer.hasHiddenOutputs.set(true, void 0);
    }
    this.renderedOutputContainer = DOM.append(innerContainer, DOM.$(".rendered-output"));
    this.renderResult = renderer ? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: selectedPresentation.mimeType } : this._renderMissingRenderer(this.output, selectedPresentation.mimeType);
    this.output.pickedMimeType = selectedPresentation;
    if (!this.renderResult) {
      this.viewCell.updateOutputHeight(index, 0, "CellOutputElement#renderResultUndefined");
      return void 0;
    }
    this.notebookEditor.createOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index), false);
    innerContainer.classList.add("background");
    return { initRenderIsSynchronous: false };
  }
  _renderMissingRenderer(viewModel, preferredMimeType) {
    if (!viewModel.model.outputs.length) {
      return this._renderMessage(viewModel, nls.localize("empty", "Cell has no output"));
    }
    if (!preferredMimeType) {
      const mimeTypes = viewModel.model.outputs.map((op) => op.mime);
      const mimeTypesMessage = mimeTypes.join(", ");
      return this._renderMessage(viewModel, nls.localize("noRenderer.2", "No renderer could be found for output. It has the following mimetypes: {0}", mimeTypesMessage));
    }
    return this._renderSearchForMimetype(viewModel, preferredMimeType);
  }
  _renderSearchForMimetype(viewModel, mimeType) {
    const query = `@tag:notebookRenderer ${mimeType}`;
    const p = DOM.$("p", void 0, `No renderer could be found for mimetype "${mimeType}", but one might be available on the Marketplace.`);
    const a = DOM.$("a", { href: `command:workbench.extensions.search?%22${query}%22`, class: "monaco-button monaco-text-button", tabindex: 0, role: "button", style: "padding: 8px; text-decoration: none; color: rgb(255, 255, 255); background-color: rgb(14, 99, 156); max-width: 200px;" }, `Search Marketplace`);
    return {
      type: RenderOutputType.Html,
      source: viewModel,
      htmlContent: p.outerHTML + a.outerHTML
    };
  }
  _renderMessage(viewModel, message) {
    const el = DOM.$("p", void 0, message);
    return { type: RenderOutputType.Html, source: viewModel, htmlContent: el.outerHTML };
  }
  shouldEnableCopy(mimeTypes) {
    if (!mimeTypes.find((mimeType) => TEXT_BASED_MIMETYPES.indexOf(mimeType.mimeType) || mimeType.mimeType.startsWith("image/"))) {
      return false;
    }
    if (isTextStreamMime(mimeTypes[0].mimeType)) {
      const cellViewModel = this.output.cellViewModel;
      const index = cellViewModel.outputsViewModels.indexOf(this.output);
      if (index > 0) {
        const previousOutput = cellViewModel.model.outputs[index - 1];
        return !isTextStreamMime(previousOutput.outputs[0].mime);
      }
    }
    return true;
  }
  async _attachToolbar(outputItemDiv, notebookTextModel, kernel, index, currentMimeType, mimeTypes) {
    const hasMultipleMimeTypes = mimeTypes.filter((mimeType) => mimeType.isTrusted).length > 1;
    const isCopyEnabled = this.shouldEnableCopy(mimeTypes);
    if (index > 0 && !hasMultipleMimeTypes && !isCopyEnabled) {
      return;
    }
    if (!this.notebookEditor.hasModel()) {
      return;
    }
    outputItemDiv.style.position = "relative";
    const mimeTypePicker = DOM.$(".cell-output-toolbar");
    outputItemDiv.appendChild(mimeTypePicker);
    const toolbar = this.toolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, mimeTypePicker, {
      renderDropdownAsChildElement: false
    }));
    toolbar.context = {
      ui: true,
      cell: this.output.cellViewModel,
      outputViewModel: this.output,
      notebookEditor: this.notebookEditor,
      $mid: MarshalledId.NotebookCellActionContext
    };
    const pickAction = this.toolbarDisposables.add(new Action(
      "notebook.output.pickMimetype",
      nls.localize("pickMimeType", "Change Presentation"),
      ThemeIcon.asClassName(mimetypeIcon),
      void 0,
      async (_context) => this._pickActiveMimeTypeRenderer(outputItemDiv, notebookTextModel, kernel, this.output)
    ));
    const menuContextKeyService = this.toolbarDisposables.add(this.contextKeyService.createScoped(outputItemDiv));
    const hasHiddenOutputs = NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS.bindTo(menuContextKeyService);
    const isFirstCellOutput = NOTEBOOK_CELL_IS_FIRST_OUTPUT.bindTo(menuContextKeyService);
    const cellOutputMimetype = NOTEBOOK_CELL_OUTPUT_MIMETYPE.bindTo(menuContextKeyService);
    isFirstCellOutput.set(index === 0);
    cellOutputMimetype.set(currentMimeType.mimeType);
    this.toolbarDisposables.add(autorun((r) => {
      hasHiddenOutputs.set(this.cellOutputContainer.hasHiddenOutputs.read(r));
    }));
    const menu = this.toolbarDisposables.add(this.menuService.createMenu(MenuId.NotebookOutputToolbar, menuContextKeyService));
    const updateMenuToolbar = () => {
      let { secondary } = getActionBarActions(menu.getActions({ shouldForwardArgs: true }), () => false);
      if (!isCopyEnabled) {
        secondary = secondary.filter((action) => action.id !== COPY_OUTPUT_COMMAND_ID);
      }
      if (hasMultipleMimeTypes) {
        secondary = [pickAction, ...secondary];
      }
      toolbar.setActions([], secondary);
    };
    updateMenuToolbar();
    this.toolbarDisposables.add(menu.onDidChange(updateMenuToolbar));
  }
  async _pickActiveMimeTypeRenderer(outputItemDiv, notebookTextModel, kernel, viewModel) {
    const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, kernel?.preloadProvides);
    const items = [];
    const unsupportedItems = [];
    mimeTypes.forEach((mimeType2, index) => {
      if (mimeType2.isTrusted) {
        const arr = mimeType2.rendererId === RENDERER_NOT_AVAILABLE ? unsupportedItems : items;
        arr.push({
          label: mimeType2.mimeType,
          id: mimeType2.mimeType,
          index,
          picked: index === currIndex,
          detail: this._generateRendererInfo(mimeType2.rendererId),
          description: index === currIndex ? nls.localize("curruentActiveMimeType", "Currently Active") : void 0
        });
      }
    });
    if (unsupportedItems.some((m) => JUPYTER_RENDERER_MIMETYPES.includes(m.id))) {
      unsupportedItems.push({
        label: nls.localize("installJupyterPrompt", "Install additional renderers from the marketplace"),
        id: "installRenderers",
        index: mimeTypes.length
      });
    }
    const disposables = new DisposableStore();
    const picker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    picker.items = [
      ...items,
      { type: "separator" },
      ...unsupportedItems
    ];
    picker.activeItems = items.filter((item) => !!item.picked);
    picker.placeholder = items.length !== mimeTypes.length ? nls.localize("promptChooseMimeTypeInSecure.placeHolder", "Select mimetype to render for current output") : nls.localize("promptChooseMimeType.placeHolder", "Select mimetype to render for current output");
    const pick = await new Promise((resolve) => {
      disposables.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems.length === 1 ? picker.selectedItems[0] : void 0);
        disposables.dispose();
      }));
      picker.show();
    });
    if (pick === void 0 || pick.index === currIndex) {
      return;
    }
    if (pick.id === "installRenderers") {
      this._showJupyterExtension();
      return;
    }
    const nextElement = outputItemDiv.nextElementSibling;
    this.toolbarDisposables.clear();
    const element = this.innerContainer;
    if (element) {
      element.remove();
      this.notebookEditor.removeInset(viewModel);
    }
    viewModel.pickedMimeType = mimeTypes[pick.index];
    this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
    const { mimeType, rendererId } = mimeTypes[pick.index];
    this.notebookService.updateMimePreferredRenderer(notebookTextModel.viewType, mimeType, rendererId, mimeTypes.map((m) => m.mimeType));
    this.render(nextElement);
    this._validateFinalOutputHeight(false);
    this._relayoutCell();
  }
  async _showJupyterExtension() {
    await this.extensionsWorkbenchService.openSearch(`@id:${JUPYTER_EXTENSION_ID}`);
  }
  _generateRendererInfo(renderId) {
    const renderInfo = this.notebookService.getRendererInfo(renderId);
    if (renderInfo) {
      const displayName = renderInfo.displayName !== "" ? renderInfo.displayName : renderInfo.id;
      return `${displayName} (${renderInfo.extensionId.value})`;
    }
    return nls.localize("unavailableRenderInfo", "renderer not available");
  }
  _validateFinalOutputHeight(synchronous) {
    if (this._outputHeightTimer !== null) {
      clearTimeout(this._outputHeightTimer);
    }
    if (synchronous) {
      this.viewCell.unlockOutputHeight();
    } else {
      this._outputHeightTimer = setTimeout(() => {
        this.viewCell.unlockOutputHeight();
      }, 1e3);
    }
  }
  _relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    if (this._outputHeightTimer) {
      this.viewCell.unlockOutputHeight();
      clearTimeout(this._outputHeightTimer);
    }
    super.dispose();
  }
};
CellOutputElement = __decorateClass([
  __decorateParam(5, INotebookService),
  __decorateParam(6, IQuickInputService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IExtensionsWorkbenchService),
  __decorateParam(10, IInstantiationService)
], CellOutputElement);
class OutputEntryViewHandler {
  constructor(model, element) {
    this.model = model;
    this.element = element;
  }
}
var CellOutputUpdateContext = /* @__PURE__ */ ((CellOutputUpdateContext2) => {
  CellOutputUpdateContext2[CellOutputUpdateContext2["Execution"] = 1] = "Execution";
  CellOutputUpdateContext2[CellOutputUpdateContext2["Other"] = 2] = "Other";
  return CellOutputUpdateContext2;
})(CellOutputUpdateContext || {});
let CellOutputContainer = class extends CellContentPart {
  constructor(notebookEditor, viewCell, templateData, options, openerService, _notebookExecutionStateService, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.options = options;
    this.openerService = openerService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this.instantiationService = instantiationService;
    this._outputEntries = [];
    this._hasStaleOutputs = false;
    this.hasHiddenOutputs = observableValue("hasHiddenOutputs", false);
    this._outputHeightTimer = null;
    this._register(viewCell.onDidStartExecution(() => {
      viewCell.updateOutputMinHeight(viewCell.layoutInfo.outputTotalHeight);
    }));
    this._register(viewCell.onDidStopExecution(() => {
      this._validateFinalOutputHeight(false);
    }));
    this._register(viewCell.onDidChangeOutputs((splice) => {
      const executionState = this._notebookExecutionStateService.getCellExecution(viewCell.uri);
      const context = executionState ? 1 /* Execution */ : 2 /* Other */;
      this._updateOutputs(splice, context);
    }));
    this._register(viewCell.onDidChangeLayout(() => {
      this.updateInternalLayoutNow(viewCell);
    }));
  }
  checkForHiddenOutputs() {
    if (this._outputEntries.find((entry) => {
      return !entry.model.visible.get();
    })) {
      this.hasHiddenOutputs.set(true, void 0);
    } else {
      this.hasHiddenOutputs.set(false, void 0);
    }
  }
  get renderedOutputEntries() {
    return this._outputEntries;
  }
  updateInternalLayoutNow(viewCell) {
    this.templateData.outputContainer.setTop(viewCell.layoutInfo.outputContainerOffset);
    this.templateData.outputShowMoreContainer.setTop(viewCell.layoutInfo.outputShowMoreContainerOffset);
    this._outputEntries.forEach((entry) => {
      const index = this.viewCell.outputsViewModels.indexOf(entry.model);
      if (index >= 0) {
        const top = this.viewCell.getOutputOffsetInContainer(index);
        entry.element.updateDOMTop(top);
      }
    });
  }
  render() {
    try {
      this._doRender();
    } finally {
      this._relayoutCell();
    }
  }
  /**
   * Notify that an output may have been swapped out without the model getting rendered.
   */
  flagAsStale() {
    this._hasStaleOutputs = true;
  }
  _doRender() {
    if (this.viewCell.outputsViewModels.length > 0) {
      if (this.viewCell.layoutInfo.outputTotalHeight !== 0) {
        this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
      }
      DOM.show(this.templateData.outputContainer.domNode);
      for (let index = 0; index < Math.min(this.options.limit, this.viewCell.outputsViewModels.length); index++) {
        const currOutput = this.viewCell.outputsViewModels[index];
        const entry = this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, currOutput);
        this._outputEntries.push(new OutputEntryViewHandler(currOutput, entry));
        entry.render(void 0);
      }
      if (this.viewCell.outputsViewModels.length > this.options.limit) {
        DOM.show(this.templateData.outputShowMoreContainer.domNode);
        this.viewCell.updateOutputShowMoreContainerHeight(46);
      }
      this._validateFinalOutputHeight(false);
    } else {
      DOM.hide(this.templateData.outputContainer.domNode);
    }
    this.templateData.outputShowMoreContainer.domNode.innerText = "";
    if (this.viewCell.outputsViewModels.length > this.options.limit) {
      this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
    } else {
      DOM.hide(this.templateData.outputShowMoreContainer.domNode);
      this.viewCell.updateOutputShowMoreContainerHeight(0);
    }
  }
  viewUpdateShowOutputs(initRendering) {
    if (this._hasStaleOutputs) {
      this._hasStaleOutputs = false;
      this._outputEntries.forEach((entry) => {
        entry.element.rerender();
      });
    }
    for (let index = 0; index < this._outputEntries.length; index++) {
      const viewHandler = this._outputEntries[index];
      const outputEntry = viewHandler.element;
      if (outputEntry.renderResult) {
        this.notebookEditor.createOutput(this.viewCell, outputEntry.renderResult, this.viewCell.getOutputOffset(index), false);
      } else {
        outputEntry.render(void 0);
      }
    }
    this._relayoutCell();
  }
  viewUpdateHideOuputs() {
    for (let index = 0; index < this._outputEntries.length; index++) {
      this.notebookEditor.hideInset(this._outputEntries[index].model);
    }
  }
  _validateFinalOutputHeight(synchronous) {
    if (this._outputHeightTimer !== null) {
      clearTimeout(this._outputHeightTimer);
    }
    const executionState = this._notebookExecutionStateService.getCellExecution(this.viewCell.uri);
    if (synchronous) {
      this.viewCell.unlockOutputHeight();
    } else if (executionState?.state !== NotebookCellExecutionState.Executing) {
      this._outputHeightTimer = setTimeout(() => {
        this.viewCell.unlockOutputHeight();
      }, 200);
    }
  }
  _updateOutputs(splice, context = 2 /* Other */) {
    const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;
    this.viewCell.updateOutputMinHeight(previousOutputHeight);
    if (this.viewCell.outputsViewModels.length) {
      DOM.show(this.templateData.outputContainer.domNode);
    } else {
      DOM.hide(this.templateData.outputContainer.domNode);
    }
    this.viewCell.spliceOutputHeights(splice.start, splice.deleteCount, splice.newOutputs.map((_) => 0));
    this._renderNow(splice, context);
  }
  _renderNow(splice, context) {
    if (splice.start >= this.options.limit) {
      return;
    }
    const firstGroupEntries = this._outputEntries.slice(0, splice.start);
    const deletedEntries = this._outputEntries.slice(splice.start, splice.start + splice.deleteCount);
    const secondGroupEntries = this._outputEntries.slice(splice.start + splice.deleteCount);
    let newlyInserted = this.viewCell.outputsViewModels.slice(splice.start, splice.start + splice.newOutputs.length);
    if (firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length > this.options.limit) {
      if (firstGroupEntries.length + newlyInserted.length > this.options.limit) {
        [...deletedEntries, ...secondGroupEntries].forEach((entry) => {
          entry.element.detach();
          entry.element.dispose();
        });
        newlyInserted = newlyInserted.slice(0, this.options.limit - firstGroupEntries.length);
        const newlyInsertedEntries = newlyInserted.map((insert) => {
          return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
        });
        this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries];
        for (let i = firstGroupEntries.length; i < this._outputEntries.length; i++) {
          this._outputEntries[i].element.render(void 0);
        }
      } else {
        const elementsPushedOutOfView = secondGroupEntries.slice(this.options.limit - firstGroupEntries.length - newlyInserted.length);
        [...deletedEntries, ...elementsPushedOutOfView].forEach((entry) => {
          entry.element.detach();
          entry.element.dispose();
        });
        const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;
        const newlyInsertedEntries = newlyInserted.map((insert) => {
          return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
        });
        this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries.slice(0, this.options.limit - firstGroupEntries.length - newlyInserted.length)];
        for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
          const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!this._outputEntries[i - 1].element.innerContainer?.parentElement ? this._outputEntries[i - 1].element.innerContainer : void 0;
          this._outputEntries[i].element.render(previousSibling);
        }
      }
    } else {
      deletedEntries.forEach((entry) => {
        entry.element.detach();
        entry.element.dispose();
      });
      const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;
      const newlyInsertedEntries = newlyInserted.map((insert) => {
        return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
      });
      let outputsNewlyAvailable = [];
      if (firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length < this.viewCell.outputsViewModels.length) {
        const last = Math.min(this.options.limit, this.viewCell.outputsViewModels.length);
        outputsNewlyAvailable = this.viewCell.outputsViewModels.slice(firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length, last).map((output) => {
          return new OutputEntryViewHandler(output, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, output));
        });
      }
      this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries, ...outputsNewlyAvailable];
      for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
        const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!this._outputEntries[i - 1].element.innerContainer?.parentElement ? this._outputEntries[i - 1].element.innerContainer : void 0;
        this._outputEntries[i].element.render(previousSibling);
      }
      for (let i = 0; i < outputsNewlyAvailable.length; i++) {
        this._outputEntries[firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length + i].element.render(void 0);
      }
    }
    if (this.viewCell.outputsViewModels.length > this.options.limit) {
      DOM.show(this.templateData.outputShowMoreContainer.domNode);
      if (!this.templateData.outputShowMoreContainer.domNode.hasChildNodes()) {
        this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
      }
      this.viewCell.updateOutputShowMoreContainerHeight(46);
    } else {
      DOM.hide(this.templateData.outputShowMoreContainer.domNode);
    }
    this._relayoutCell();
    this._validateFinalOutputHeight(context === 2 /* Other */ && this.viewCell.outputsViewModels.length === 0);
  }
  _generateShowMoreElement(disposables) {
    const md = {
      value: `There are more than ${this.options.limit} outputs, [show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)`,
      isTrusted: true,
      supportThemeIcons: true
    };
    const rendered = disposables.add(renderMarkdown(md, {
      actionHandler: (content) => {
        if (content === "command:workbench.action.openLargeOutput") {
          this.openerService.open(CellUri.generateCellOutputUriWithId(this.notebookEditor.textModel.uri));
        }
      }
    }));
    rendered.element.classList.add("output-show-more");
    return rendered.element;
  }
  _relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    this.viewCell.updateOutputMinHeight(0);
    if (this._outputHeightTimer) {
      clearTimeout(this._outputHeightTimer);
    }
    this._outputEntries.forEach((entry) => {
      entry.element.dispose();
    });
    super.dispose();
  }
};
CellOutputContainer = __decorateClass([
  __decorateParam(4, IOpenerService),
  __decorateParam(5, INotebookExecutionStateService),
  __decorateParam(6, IInstantiationService)
], CellOutputContainer);
const JUPYTER_RENDERER_MIMETYPES = [
  "application/geo+json",
  "application/vdom.v1+json",
  "application/vnd.dataresource+json",
  "application/vnd.plotly.v1+json",
  "application/vnd.vega.v2+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v5+json",
  "application/vnd.vegalite.v1+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v4+json",
  "application/x-nteract-model-debug+json",
  "image/svg+xml",
  "text/latex",
  "text/vnd.plotly.v1+html",
  "application/vnd.jupyter.widget-view+json",
  "application/vnd.code.notebook.error"
];
export {
  CellOutputContainer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNlbGxPdXRwdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDZWxsT3V0cHV0Vmlld01vZGVsLCBJQ2VsbFZpZXdNb2RlbCwgSUluc2V0UmVuZGVyT3V0cHV0LCBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgSlVQWVRFUl9FWFRFTlNJT05fSUQsIFJlbmRlck91dHB1dFR5cGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgbWltZXR5cGVJY29uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBDZWxsQ29udGVudFBhcnQgfSBmcm9tICcuLi9jZWxsUGFydC5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlIH0gZnJvbSAnLi4vbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvY29kZUNlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSwgSU9yZGVyZWRNaW1lVHlwZSwgTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUsIE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UsIFJFTkRFUkVSX05PVF9BVkFJTEFCTEUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgaXNUZXh0U3RyZWFtTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ09QWV9PVVRQVVRfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY2VsbE91dHB1dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19DRUxMX0hBU19ISURERU5fT1VUUFVUUywgTk9URUJPT0tfQ0VMTF9JU19GSVJTVF9PVVRQVVQsIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVUWVBFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgVEVYVF9CQVNFRF9NSU1FVFlQRVMgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvY2VsbE91dHB1dFRleHRIZWxwZXIuanMnO1xuXG5pbnRlcmZhY2UgSU1pbWVUeXBlUmVuZGVyZXIgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJUmVuZGVyUmVzdWx0IHtcblx0aW5pdFJlbmRlcklzU3luY2hyb25vdXM6IGZhbHNlO1xufVxuXG4vLyBET00gc3RydWN0dXJlXG4vL1xuLy8gICNvdXRwdXRcbi8vICB8XG4vLyAgfCAgI291dHB1dC1pbm5lci1jb250YWluZXJcbi8vICB8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgI2NlbGwtb3V0cHV0LXRvb2xiYXJcbi8vICB8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgI291dHB1dC1lbGVtZW50XG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNvdXRwdXQtZWxlbWVudFxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjb3V0cHV0LWVsZW1lbnRcbi8vICB8ICAjb3V0cHV0LWlubmVyLWNvbnRhaW5lclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjY2VsbC1vdXRwdXQtdG9vbGJhclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjb3V0cHV0LWVsZW1lbnRcbi8vICB8ICAjb3V0cHV0LWlubmVyLWNvbnRhaW5lclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjY2VsbC1vdXRwdXQtdG9vbGJhclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjb3V0cHV0LWVsZW1lbnRcbmNsYXNzIENlbGxPdXRwdXRFbGVtZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbGJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRpbm5lckNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRyZW5kZXJlZE91dHB1dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRyZW5kZXJSZXN1bHQ/OiBJSW5zZXRSZW5kZXJPdXRwdXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIHRvb2xiYXJBdHRhY2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgdmlld0NlbGw6IENvZGVDZWxsVmlld01vZGVsLFxuXHRcdHByaXZhdGUgY2VsbE91dHB1dENvbnRhaW5lcjogQ2VsbE91dHB1dENvbnRhaW5lcixcblx0XHRwcml2YXRlIG91dHB1dENvbnRhaW5lcjogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+LFxuXHRcdHJlYWRvbmx5IG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHBhcmVudENvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vdXRwdXQubW9kZWwub25EaWRDaGFuZ2VEYXRhKCgpID0+IHtcblx0XHRcdHRoaXMucmVyZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm91dHB1dC5vbkRpZFJlc2V0UmVuZGVyZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZXJlbmRlcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRldGFjaCgpIHtcblx0XHR0aGlzLnJlbmRlcmVkT3V0cHV0Q29udGFpbmVyPy5yZW1vdmUoKTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0aWYgKHRoaXMuaW5uZXJDb250YWluZXIpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5pbm5lckNvbnRhaW5lci5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICgodGhpcy5pbm5lckNvbnRhaW5lci5jaGlsZE5vZGVzW2ldIGFzIEhUTUxFbGVtZW50KS5jbGFzc05hbWUgPT09ICdyZW5kZXJlZC1vdXRwdXQnKSB7XG5cdFx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb3VudCA+IDEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdFx0dGhpcy5pbm5lckNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnJlbW92ZUluc2V0KHRoaXMub3V0cHV0KTtcblx0fVxuXG5cdHVwZGF0ZURPTVRvcCh0b3A6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLmlubmVyQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmlubmVyQ29udGFpbmVyLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0fVxuXHR9XG5cblx0cmVyZW5kZXIoKSB7XG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpICYmXG5cdFx0XHR0aGlzLmlubmVyQ29udGFpbmVyICYmXG5cdFx0XHR0aGlzLnJlbmRlclJlc3VsdCAmJlxuXHRcdFx0dGhpcy5yZW5kZXJSZXN1bHQudHlwZSA9PT0gUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb25cblx0XHQpIHtcblx0XHRcdC8vIE91dHB1dCByZW5kZXJlZCBieSBleHRlbnNpb24gcmVuZGVyZXIgZ290IGFuIHVwZGF0ZVxuXHRcdFx0Y29uc3QgW21pbWVUeXBlcywgcGlja10gPSB0aGlzLm91dHB1dC5yZXNvbHZlTWltZVR5cGVzKHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLCB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbD8ucHJlbG9hZFByb3ZpZGVzKTtcblx0XHRcdGNvbnN0IHBpY2tlZE1pbWVUeXBlID0gbWltZVR5cGVzW3BpY2tdO1xuXHRcdFx0aWYgKHBpY2tlZE1pbWVUeXBlLm1pbWVUeXBlID09PSB0aGlzLnJlbmRlclJlc3VsdC5taW1lVHlwZSAmJiBwaWNrZWRNaW1lVHlwZS5yZW5kZXJlcklkID09PSB0aGlzLnJlbmRlclJlc3VsdC5yZW5kZXJlci5pZCkge1xuXHRcdFx0XHQvLyBTYW1lIG1pbWV0eXBlLCBzYW1lIHJlbmRlcmVyLCBjYWxsIHRoZSBleHRlbnNpb24gcmVuZGVyZXIgdG8gdXBkYXRlXG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKHRoaXMub3V0cHV0KTtcblx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci51cGRhdGVPdXRwdXQodGhpcy52aWV3Q2VsbCwgdGhpcy5yZW5kZXJSZXN1bHQsIHRoaXMudmlld0NlbGwuZ2V0T3V0cHV0T2Zmc2V0KGluZGV4KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaW5uZXJDb250YWluZXIpIHtcblx0XHRcdC8vIGluaXQgcmVuZGVyaW5nIGRpZG4ndCBoYXBwZW5cblx0XHRcdGNvbnN0IGN1cnJPdXRwdXRJbmRleCA9IHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5yZW5kZXJlZE91dHB1dEVudHJpZXMuZmluZEluZGV4KGVudHJ5ID0+IGVudHJ5LmVsZW1lbnQgPT09IHRoaXMpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNTaWJsaW5nID0gY3Vyck91dHB1dEluZGV4ID4gMCAmJiAhISh0aGlzLmNlbGxPdXRwdXRDb250YWluZXIucmVuZGVyZWRPdXRwdXRFbnRyaWVzW2N1cnJPdXRwdXRJbmRleCAtIDFdLmVsZW1lbnQuaW5uZXJDb250YWluZXI/LnBhcmVudEVsZW1lbnQpXG5cdFx0XHRcdD8gdGhpcy5jZWxsT3V0cHV0Q29udGFpbmVyLnJlbmRlcmVkT3V0cHV0RW50cmllc1tjdXJyT3V0cHV0SW5kZXggLSAxXS5lbGVtZW50LmlubmVyQ29udGFpbmVyXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZW5kZXIocHJldmlvdXNTaWJsaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQW5vdGhlciBtaW1ldHlwZSBvciByZW5kZXJlciBpcyBwaWNrZWQsIHdlIG5lZWQgdG8gY2xlYXIgdGhlIGN1cnJlbnQgb3V0cHV0IGFuZCByZS1yZW5kZXJcblx0XHRcdGNvbnN0IG5leHRFbGVtZW50ID0gdGhpcy5pbm5lckNvbnRhaW5lci5uZXh0RWxlbWVudFNpYmxpbmc7XG5cdFx0XHR0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuaW5uZXJDb250YWluZXI7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnJlbW92ZUluc2V0KHRoaXMub3V0cHV0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZW5kZXIobmV4dEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbGF5b3V0Q2VsbCgpO1xuXHR9XG5cblx0Ly8gaW5zZXJ0IGFmdGVyIHByZXZpb3VzU2libGluZ1xuXHRwcml2YXRlIF9nZW5lcmF0ZUlubmVyT3V0cHV0Q29udGFpbmVyKHByZXZpb3VzU2libGluZzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIHBpY2tlZE1pbWVUeXBlUmVuZGVyZXI6IElPcmRlcmVkTWltZVR5cGUpIHtcblx0XHR0aGlzLmlubmVyQ29udGFpbmVyID0gRE9NLiQoJy5vdXRwdXQtaW5uZXItY29udGFpbmVyJyk7XG5cblx0XHRpZiAocHJldmlvdXNTaWJsaW5nICYmIHByZXZpb3VzU2libGluZy5uZXh0RWxlbWVudFNpYmxpbmcpIHtcblx0XHRcdHRoaXMub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMuaW5uZXJDb250YWluZXIsIHByZXZpb3VzU2libGluZy5uZXh0RWxlbWVudFNpYmxpbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm91dHB1dENvbnRhaW5lci5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuaW5uZXJDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5uZXJDb250YWluZXIuc2V0QXR0cmlidXRlKCdvdXRwdXQtbWltZS10eXBlJywgcGlja2VkTWltZVR5cGVSZW5kZXJlci5taW1lVHlwZSk7XG5cdFx0cmV0dXJuIHRoaXMuaW5uZXJDb250YWluZXI7XG5cdH1cblxuXHRyZW5kZXIocHJldmlvdXNTaWJsaW5nOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCk6IElSZW5kZXJSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKHRoaXMub3V0cHV0KTtcblxuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmlzT3V0cHV0Q29sbGFwc2VkIHx8ICF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5mbGFnQXNTdGFsZSgpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9va1VyaSA9IENlbGxVcmkucGFyc2UodGhpcy52aWV3Q2VsbC51cmkpPy5ub3RlYm9vaztcblx0XHRpZiAoIW5vdGVib29rVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rVGV4dE1vZGVsID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRjb25zdCBbbWltZVR5cGVzLCBwaWNrXSA9IHRoaXMub3V0cHV0LnJlc29sdmVNaW1lVHlwZXMobm90ZWJvb2tUZXh0TW9kZWwsIHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlS2VybmVsPy5wcmVsb2FkUHJvdmlkZXMpO1xuXHRcdGNvbnN0IGN1cnJlbnRNaW1lVHlwZSA9IG1pbWVUeXBlc1twaWNrXTtcblx0XHRpZiAoIW1pbWVUeXBlcy5maW5kKG1pbWVUeXBlID0+IG1pbWVUeXBlLmlzVHJ1c3RlZCkgfHwgbWltZVR5cGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRIZWlnaHQoaW5kZXgsIDAsICdDZWxsT3V0cHV0RWxlbWVudCNub01pbWVUeXBlJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkUHJlc2VudGF0aW9uID0gbWltZVR5cGVzW3BpY2tdO1xuXHRcdGxldCByZW5kZXJlciA9IHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVySW5mbyhzZWxlY3RlZFByZXNlbnRhdGlvbi5yZW5kZXJlcklkKTtcblx0XHRpZiAoIXJlbmRlcmVyICYmIHNlbGVjdGVkUHJlc2VudGF0aW9uLm1pbWVUeXBlLmluZGV4T2YoJ3RleHQvJykgPiAtMSkge1xuXHRcdFx0cmVuZGVyZXIgPSB0aGlzLm5vdGVib29rU2VydmljZS5nZXRSZW5kZXJlckluZm8oJ3ZzY29kZS5idWlsdGluLXJlbmRlcmVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5uZXJDb250YWluZXIgPSB0aGlzLl9nZW5lcmF0ZUlubmVyT3V0cHV0Q29udGFpbmVyKHByZXZpb3VzU2libGluZywgc2VsZWN0ZWRQcmVzZW50YXRpb24pO1xuXHRcdGlmIChpbmRleCA9PT0gMCB8fCB0aGlzLm91dHB1dC52aXNpYmxlLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hUb29sYmFyKGlubmVyQ29udGFpbmVyLCBub3RlYm9va1RleHRNb2RlbCwgdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVLZXJuZWwsIGluZGV4LCBjdXJyZW50TWltZVR5cGUsIG1pbWVUeXBlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlID0gcmVhZGVyLnJlYWRPYnNlcnZhYmxlKHRoaXMub3V0cHV0LnZpc2libGUpO1xuXHRcdFx0XHRpZiAodmlzaWJsZSAmJiAhdGhpcy50b29sYmFyQXR0YWNoZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9hdHRhY2hUb29sYmFyKGlubmVyQ29udGFpbmVyLCBub3RlYm9va1RleHRNb2RlbCwgdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVLZXJuZWwsIGluZGV4LCBjdXJyZW50TWltZVR5cGUsIG1pbWVUeXBlcyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5jaGVja0ZvckhpZGRlbk91dHB1dHMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5oYXNIaWRkZW5PdXRwdXRzLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyZWRPdXRwdXRDb250YWluZXIgPSBET00uYXBwZW5kKGlubmVyQ29udGFpbmVyLCBET00uJCgnLnJlbmRlcmVkLW91dHB1dCcpKTtcblxuXG5cdFx0dGhpcy5yZW5kZXJSZXN1bHQgPSByZW5kZXJlclxuXHRcdFx0PyB7IHR5cGU6IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uLCByZW5kZXJlciwgc291cmNlOiB0aGlzLm91dHB1dCwgbWltZVR5cGU6IHNlbGVjdGVkUHJlc2VudGF0aW9uLm1pbWVUeXBlIH1cblx0XHRcdDogdGhpcy5fcmVuZGVyTWlzc2luZ1JlbmRlcmVyKHRoaXMub3V0cHV0LCBzZWxlY3RlZFByZXNlbnRhdGlvbi5taW1lVHlwZSk7XG5cblx0XHR0aGlzLm91dHB1dC5waWNrZWRNaW1lVHlwZSA9IHNlbGVjdGVkUHJlc2VudGF0aW9uO1xuXG5cdFx0aWYgKCF0aGlzLnJlbmRlclJlc3VsdCkge1xuXHRcdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRIZWlnaHQoaW5kZXgsIDAsICdDZWxsT3V0cHV0RWxlbWVudCNyZW5kZXJSZXN1bHRVbmRlZmluZWQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGVPdXRwdXQodGhpcy52aWV3Q2VsbCwgdGhpcy5yZW5kZXJSZXN1bHQsIHRoaXMudmlld0NlbGwuZ2V0T3V0cHV0T2Zmc2V0KGluZGV4KSwgZmFsc2UpO1xuXHRcdGlubmVyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2JhY2tncm91bmQnKTtcblxuXHRcdHJldHVybiB7IGluaXRSZW5kZXJJc1N5bmNocm9ub3VzOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWlzc2luZ1JlbmRlcmVyKHZpZXdNb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIHByZWZlcnJlZE1pbWVUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJSW5zZXRSZW5kZXJPdXRwdXQge1xuXHRcdGlmICghdmlld01vZGVsLm1vZGVsLm91dHB1dHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyTWVzc2FnZSh2aWV3TW9kZWwsIG5scy5sb2NhbGl6ZSgnZW1wdHknLCBcIkNlbGwgaGFzIG5vIG91dHB1dFwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmVmZXJyZWRNaW1lVHlwZSkge1xuXHRcdFx0Y29uc3QgbWltZVR5cGVzID0gdmlld01vZGVsLm1vZGVsLm91dHB1dHMubWFwKG9wID0+IG9wLm1pbWUpO1xuXHRcdFx0Y29uc3QgbWltZVR5cGVzTWVzc2FnZSA9IG1pbWVUeXBlcy5qb2luKCcsICcpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbmRlck1lc3NhZ2Uodmlld01vZGVsLCBubHMubG9jYWxpemUoJ25vUmVuZGVyZXIuMicsIFwiTm8gcmVuZGVyZXIgY291bGQgYmUgZm91bmQgZm9yIG91dHB1dC4gSXQgaGFzIHRoZSBmb2xsb3dpbmcgbWltZXR5cGVzOiB7MH1cIiwgbWltZVR5cGVzTWVzc2FnZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJTZWFyY2hGb3JNaW1ldHlwZSh2aWV3TW9kZWwsIHByZWZlcnJlZE1pbWVUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclNlYXJjaEZvck1pbWV0eXBlKHZpZXdNb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIG1pbWVUeXBlOiBzdHJpbmcpOiBJSW5zZXRSZW5kZXJPdXRwdXQge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYEB0YWc6bm90ZWJvb2tSZW5kZXJlciAke21pbWVUeXBlfWA7XG5cblx0XHRjb25zdCBwID0gRE9NLiQoJ3AnLCB1bmRlZmluZWQsIGBObyByZW5kZXJlciBjb3VsZCBiZSBmb3VuZCBmb3IgbWltZXR5cGUgXCIke21pbWVUeXBlfVwiLCBidXQgb25lIG1pZ2h0IGJlIGF2YWlsYWJsZSBvbiB0aGUgTWFya2V0cGxhY2UuYCk7XG5cdFx0Y29uc3QgYSA9IERPTS4kKCdhJywgeyBocmVmOiBgY29tbWFuZDp3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2g/JTIyJHtxdWVyeX0lMjJgLCBjbGFzczogJ21vbmFjby1idXR0b24gbW9uYWNvLXRleHQtYnV0dG9uJywgdGFiaW5kZXg6IDAsIHJvbGU6ICdidXR0b24nLCBzdHlsZTogJ3BhZGRpbmc6IDhweDsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyBjb2xvcjogcmdiKDI1NSwgMjU1LCAyNTUpOyBiYWNrZ3JvdW5kLWNvbG9yOiByZ2IoMTQsIDk5LCAxNTYpOyBtYXgtd2lkdGg6IDIwMHB4OycgfSwgYFNlYXJjaCBNYXJrZXRwbGFjZWApO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFJlbmRlck91dHB1dFR5cGUuSHRtbCxcblx0XHRcdHNvdXJjZTogdmlld01vZGVsLFxuXHRcdFx0aHRtbENvbnRlbnQ6IHAub3V0ZXJIVE1MICsgYS5vdXRlckhUTUxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWVzc2FnZSh2aWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsLCBtZXNzYWdlOiBzdHJpbmcpOiBJSW5zZXRSZW5kZXJPdXRwdXQge1xuXHRcdGNvbnN0IGVsID0gRE9NLiQoJ3AnLCB1bmRlZmluZWQsIG1lc3NhZ2UpO1xuXHRcdHJldHVybiB7IHR5cGU6IFJlbmRlck91dHB1dFR5cGUuSHRtbCwgc291cmNlOiB2aWV3TW9kZWwsIGh0bWxDb250ZW50OiBlbC5vdXRlckhUTUwgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkRW5hYmxlQ29weShtaW1lVHlwZXM6IHJlYWRvbmx5IElPcmRlcmVkTWltZVR5cGVbXSkge1xuXHRcdGlmICghbWltZVR5cGVzLmZpbmQobWltZVR5cGUgPT4gVEVYVF9CQVNFRF9NSU1FVFlQRVMuaW5kZXhPZihtaW1lVHlwZS5taW1lVHlwZSkgfHwgbWltZVR5cGUubWltZVR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVGV4dFN0cmVhbU1pbWUobWltZVR5cGVzWzBdLm1pbWVUeXBlKSkge1xuXHRcdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IHRoaXMub3V0cHV0LmNlbGxWaWV3TW9kZWwgYXMgSUNlbGxWaWV3TW9kZWw7XG5cdFx0XHRjb25zdCBpbmRleCA9IGNlbGxWaWV3TW9kZWwub3V0cHV0c1ZpZXdNb2RlbHMuaW5kZXhPZih0aGlzLm91dHB1dCk7XG5cdFx0XHRpZiAoaW5kZXggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzT3V0cHV0ID0gY2VsbFZpZXdNb2RlbC5tb2RlbC5vdXRwdXRzW2luZGV4IC0gMV07XG5cdFx0XHRcdC8vIGlmIHRoZSBwcmV2aW91cyBvdXRwdXQgd2FzIGFsc28gYSBzdHJlYW0sIHRoZSBjb3B5IGNvbW1hbmQgd2lsbCBiZSBpbiB0aGF0IG91dHB1dCBpbnN0ZWFkXG5cdFx0XHRcdHJldHVybiAhaXNUZXh0U3RyZWFtTWltZShwcmV2aW91c091dHB1dC5vdXRwdXRzWzBdLm1pbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoVG9vbGJhcihvdXRwdXRJdGVtRGl2OiBIVE1MRWxlbWVudCwgbm90ZWJvb2tUZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCBrZXJuZWw6IElOb3RlYm9va0tlcm5lbCB8IHVuZGVmaW5lZCwgaW5kZXg6IG51bWJlciwgY3VycmVudE1pbWVUeXBlOiBJT3JkZXJlZE1pbWVUeXBlLCBtaW1lVHlwZXM6IHJlYWRvbmx5IElPcmRlcmVkTWltZVR5cGVbXSkge1xuXHRcdGNvbnN0IGhhc011bHRpcGxlTWltZVR5cGVzID0gbWltZVR5cGVzLmZpbHRlcihtaW1lVHlwZSA9PiBtaW1lVHlwZS5pc1RydXN0ZWQpLmxlbmd0aCA+IDE7XG5cdFx0Y29uc3QgaXNDb3B5RW5hYmxlZCA9IHRoaXMuc2hvdWxkRW5hYmxlQ29weShtaW1lVHlwZXMpO1xuXHRcdGlmIChpbmRleCA+IDAgJiYgIWhhc011bHRpcGxlTWltZVR5cGVzICYmICFpc0NvcHlFbmFibGVkKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIHB1dCBpbiB0aGUgdG9vbGJhclxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b3V0cHV0SXRlbURpdi5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0Y29uc3QgbWltZVR5cGVQaWNrZXIgPSBET00uJCgnLmNlbGwtb3V0cHV0LXRvb2xiYXInKTtcblxuXHRcdG91dHB1dEl0ZW1EaXYuYXBwZW5kQ2hpbGQobWltZVR5cGVQaWNrZXIpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIG1pbWVUeXBlUGlja2VyLCB7XG5cdFx0XHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiBmYWxzZVxuXHRcdH0pKTtcblx0XHR0b29sYmFyLmNvbnRleHQgPSB7XG5cdFx0XHR1aTogdHJ1ZSxcblx0XHRcdGNlbGw6IHRoaXMub3V0cHV0LmNlbGxWaWV3TW9kZWwgYXMgSUNlbGxWaWV3TW9kZWwsXG5cdFx0XHRvdXRwdXRWaWV3TW9kZWw6IHRoaXMub3V0cHV0LFxuXHRcdFx0bm90ZWJvb2tFZGl0b3I6IHRoaXMubm90ZWJvb2tFZGl0b3IsXG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dFxuXHRcdH07XG5cblx0XHQvLyBUT0RPOiBUaGlzIGNvdWxkIHByb2JhYmx5IGJlIGEgcmVhbCByZWdpc3RlcmVkIGFjdGlvbiwgYnV0IGl0IGhhcyB0byB0YWxrIHRvIHRoaXMgb3V0cHV0IGVsZW1lbnRcblx0XHRjb25zdCBwaWNrQWN0aW9uID0gdGhpcy50b29sYmFyRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ25vdGVib29rLm91dHB1dC5waWNrTWltZXR5cGUnLCBubHMubG9jYWxpemUoJ3BpY2tNaW1lVHlwZScsIFwiQ2hhbmdlIFByZXNlbnRhdGlvblwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1pbWV0eXBlSWNvbiksIHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jIF9jb250ZXh0ID0+IHRoaXMuX3BpY2tBY3RpdmVNaW1lVHlwZVJlbmRlcmVyKG91dHB1dEl0ZW1EaXYsIG5vdGVib29rVGV4dE1vZGVsLCBrZXJuZWwsIHRoaXMub3V0cHV0KSkpO1xuXG5cdFx0Y29uc3QgbWVudUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy50b29sYmFyRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKG91dHB1dEl0ZW1EaXYpKTtcblx0XHRjb25zdCBoYXNIaWRkZW5PdXRwdXRzID0gTk9URUJPT0tfQ0VMTF9IQVNfSElEREVOX09VVFBVVFMuYmluZFRvKG1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgaXNGaXJzdENlbGxPdXRwdXQgPSBOT1RFQk9PS19DRUxMX0lTX0ZJUlNUX09VVFBVVC5iaW5kVG8obWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjZWxsT3V0cHV0TWltZXR5cGUgPSBOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FVFlQRS5iaW5kVG8obWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpc0ZpcnN0Q2VsbE91dHB1dC5zZXQoaW5kZXggPT09IDApO1xuXHRcdGNlbGxPdXRwdXRNaW1ldHlwZS5zZXQoY3VycmVudE1pbWVUeXBlLm1pbWVUeXBlKTtcblx0XHR0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bigocikgPT4geyBoYXNIaWRkZW5PdXRwdXRzLnNldCh0aGlzLmNlbGxPdXRwdXRDb250YWluZXIuaGFzSGlkZGVuT3V0cHV0cy5yZWFkKHIpKTsgfSkpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5Ob3RlYm9va091dHB1dFRvb2xiYXIsIG1lbnVDb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlTWVudVRvb2xiYXIgPSAoKSA9PiB7XG5cdFx0XHRsZXQgeyBzZWNvbmRhcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudSEuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAoKSA9PiBmYWxzZSk7XG5cdFx0XHRpZiAoIWlzQ29weUVuYWJsZWQpIHtcblx0XHRcdFx0c2Vjb25kYXJ5ID0gc2Vjb25kYXJ5LmZpbHRlcigoYWN0aW9uKSA9PiBhY3Rpb24uaWQgIT09IENPUFlfT1VUUFVUX0NPTU1BTkRfSUQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhc011bHRpcGxlTWltZVR5cGVzKSB7XG5cdFx0XHRcdHNlY29uZGFyeSA9IFtwaWNrQWN0aW9uLCAuLi5zZWNvbmRhcnldO1xuXHRcdFx0fVxuXG5cdFx0XHR0b29sYmFyLnNldEFjdGlvbnMoW10sIHNlY29uZGFyeSk7XG5cdFx0fTtcblx0XHR1cGRhdGVNZW51VG9vbGJhcigpO1xuXHRcdHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZU1lbnVUb29sYmFyKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9waWNrQWN0aXZlTWltZVR5cGVSZW5kZXJlcihvdXRwdXRJdGVtRGl2OiBIVE1MRWxlbWVudCwgbm90ZWJvb2tUZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCBrZXJuZWw6IElOb3RlYm9va0tlcm5lbCB8IHVuZGVmaW5lZCwgdmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IFttaW1lVHlwZXMsIGN1cnJJbmRleF0gPSB2aWV3TW9kZWwucmVzb2x2ZU1pbWVUeXBlcyhub3RlYm9va1RleHRNb2RlbCwga2VybmVsPy5wcmVsb2FkUHJvdmlkZXMpO1xuXG5cdFx0Y29uc3QgaXRlbXM6IElNaW1lVHlwZVJlbmRlcmVyW10gPSBbXTtcblx0XHRjb25zdCB1bnN1cHBvcnRlZEl0ZW1zOiBJTWltZVR5cGVSZW5kZXJlcltdID0gW107XG5cdFx0bWltZVR5cGVzLmZvckVhY2goKG1pbWVUeXBlLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKG1pbWVUeXBlLmlzVHJ1c3RlZCkge1xuXHRcdFx0XHRjb25zdCBhcnIgPSBtaW1lVHlwZS5yZW5kZXJlcklkID09PSBSRU5ERVJFUl9OT1RfQVZBSUxBQkxFID9cblx0XHRcdFx0XHR1bnN1cHBvcnRlZEl0ZW1zIDpcblx0XHRcdFx0XHRpdGVtcztcblx0XHRcdFx0YXJyLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBtaW1lVHlwZS5taW1lVHlwZSxcblx0XHRcdFx0XHRpZDogbWltZVR5cGUubWltZVR5cGUsXG5cdFx0XHRcdFx0aW5kZXg6IGluZGV4LFxuXHRcdFx0XHRcdHBpY2tlZDogaW5kZXggPT09IGN1cnJJbmRleCxcblx0XHRcdFx0XHRkZXRhaWw6IHRoaXMuX2dlbmVyYXRlUmVuZGVyZXJJbmZvKG1pbWVUeXBlLnJlbmRlcmVySWQpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpbmRleCA9PT0gY3VyckluZGV4ID8gbmxzLmxvY2FsaXplKCdjdXJydWVudEFjdGl2ZU1pbWVUeXBlJywgXCJDdXJyZW50bHkgQWN0aXZlXCIpIDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHVuc3VwcG9ydGVkSXRlbXMuc29tZShtID0+IEpVUFlURVJfUkVOREVSRVJfTUlNRVRZUEVTLmluY2x1ZGVzKG0uaWQhKSkpIHtcblx0XHRcdHVuc3VwcG9ydGVkSXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2luc3RhbGxKdXB5dGVyUHJvbXB0JywgXCJJbnN0YWxsIGFkZGl0aW9uYWwgcmVuZGVyZXJzIGZyb20gdGhlIG1hcmtldHBsYWNlXCIpLFxuXHRcdFx0XHRpZDogJ2luc3RhbGxSZW5kZXJlcnMnLFxuXHRcdFx0XHRpbmRleDogbWltZVR5cGVzLmxlbmd0aFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0cGlja2VyLml0ZW1zID0gW1xuXHRcdFx0Li4uaXRlbXMsXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG5cdFx0XHQuLi51bnN1cHBvcnRlZEl0ZW1zXG5cdFx0XTtcblx0XHRwaWNrZXIuYWN0aXZlSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiAhIWl0ZW0ucGlja2VkKTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBpdGVtcy5sZW5ndGggIT09IG1pbWVUeXBlcy5sZW5ndGhcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdwcm9tcHRDaG9vc2VNaW1lVHlwZUluU2VjdXJlLnBsYWNlSG9sZGVyJywgXCJTZWxlY3QgbWltZXR5cGUgdG8gcmVuZGVyIGZvciBjdXJyZW50IG91dHB1dFwiKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ3Byb21wdENob29zZU1pbWVUeXBlLnBsYWNlSG9sZGVyJywgXCJTZWxlY3QgbWltZXR5cGUgdG8gcmVuZGVyIGZvciBjdXJyZW50IG91dHB1dFwiKTtcblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBuZXcgUHJvbWlzZTxJTWltZVR5cGVSZW5kZXJlciB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShwaWNrZXIuc2VsZWN0ZWRJdGVtcy5sZW5ndGggPT09IDEgPyAocGlja2VyLnNlbGVjdGVkSXRlbXNbMF0gYXMgSU1pbWVUeXBlUmVuZGVyZXIpIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cGlja2VyLnNob3coKTtcblx0XHR9KTtcblxuXHRcdGlmIChwaWNrID09PSB1bmRlZmluZWQgfHwgcGljay5pbmRleCA9PT0gY3VyckluZGV4KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2suaWQgPT09ICdpbnN0YWxsUmVuZGVyZXJzJykge1xuXHRcdFx0dGhpcy5fc2hvd0p1cHl0ZXJFeHRlbnNpb24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB1c2VyIGNob29zZXMgYW5vdGhlciBtaW1ldHlwZVxuXHRcdGNvbnN0IG5leHRFbGVtZW50ID0gb3V0cHV0SXRlbURpdi5uZXh0RWxlbWVudFNpYmxpbmc7XG5cdFx0dGhpcy50b29sYmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5pbm5lckNvbnRhaW5lcjtcblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0ZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmVtb3ZlSW5zZXQodmlld01vZGVsKTtcblx0XHR9XG5cblx0XHR2aWV3TW9kZWwucGlja2VkTWltZVR5cGUgPSBtaW1lVHlwZXNbcGljay5pbmRleF07XG5cdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRNaW5IZWlnaHQodGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0KTtcblxuXHRcdGNvbnN0IHsgbWltZVR5cGUsIHJlbmRlcmVySWQgfSA9IG1pbWVUeXBlc1twaWNrLmluZGV4XTtcblx0XHR0aGlzLm5vdGVib29rU2VydmljZS51cGRhdGVNaW1lUHJlZmVycmVkUmVuZGVyZXIobm90ZWJvb2tUZXh0TW9kZWwudmlld1R5cGUsIG1pbWVUeXBlLCByZW5kZXJlcklkLCBtaW1lVHlwZXMubWFwKG0gPT4gbS5taW1lVHlwZSkpO1xuXHRcdHRoaXMucmVuZGVyKG5leHRFbGVtZW50IGFzIEhUTUxFbGVtZW50KTtcblx0XHR0aGlzLl92YWxpZGF0ZUZpbmFsT3V0cHV0SGVpZ2h0KGZhbHNlKTtcblx0XHR0aGlzLl9yZWxheW91dENlbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dKdXB5dGVyRXh0ZW5zaW9uKCkge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQGlkOiR7SlVQWVRFUl9FWFRFTlNJT05fSUR9YCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZVJlbmRlcmVySW5mbyhyZW5kZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCByZW5kZXJJbmZvID0gdGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0UmVuZGVyZXJJbmZvKHJlbmRlcklkKTtcblxuXHRcdGlmIChyZW5kZXJJbmZvKSB7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHJlbmRlckluZm8uZGlzcGxheU5hbWUgIT09ICcnID8gcmVuZGVySW5mby5kaXNwbGF5TmFtZSA6IHJlbmRlckluZm8uaWQ7XG5cdFx0XHRyZXR1cm4gYCR7ZGlzcGxheU5hbWV9ICgke3JlbmRlckluZm8uZXh0ZW5zaW9uSWQudmFsdWV9KWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndW5hdmFpbGFibGVSZW5kZXJJbmZvJywgXCJyZW5kZXJlciBub3QgYXZhaWxhYmxlXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3V0cHV0SGVpZ2h0VGltZXI6IFRpbWVvdXQgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIF92YWxpZGF0ZUZpbmFsT3V0cHV0SGVpZ2h0KHN5bmNocm9ub3VzOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX291dHB1dEhlaWdodFRpbWVyICE9PSBudWxsKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIpO1xuXHRcdH1cblxuXHRcdGlmIChzeW5jaHJvbm91cykge1xuXHRcdFx0dGhpcy52aWV3Q2VsbC51bmxvY2tPdXRwdXRIZWlnaHQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC51bmxvY2tPdXRwdXRIZWlnaHQoKTtcblx0XHRcdH0sIDEwMDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbGF5b3V0Q2VsbCgpIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmxheW91dE5vdGVib29rQ2VsbCh0aGlzLnZpZXdDZWxsLCB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8udG90YWxIZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIpIHtcblx0XHRcdHRoaXMudmlld0NlbGwudW5sb2NrT3V0cHV0SGVpZ2h0KCk7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIpO1xuXHRcdH1cblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsLFxuXHRcdHJlYWRvbmx5IGVsZW1lbnQ6IENlbGxPdXRwdXRFbGVtZW50XG5cdCkge1xuXG5cdH1cbn1cblxuY29uc3QgZW51bSBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dCB7XG5cdEV4ZWN1dGlvbiA9IDEsXG5cdE90aGVyID0gMlxufVxuXG5leHBvcnQgY2xhc3MgQ2VsbE91dHB1dENvbnRhaW5lciBleHRlbmRzIENlbGxDb250ZW50UGFydCB7XG5cdHByaXZhdGUgX291dHB1dEVudHJpZXM6IE91dHB1dEVudHJ5Vmlld0hhbmRsZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9oYXNTdGFsZU91dHB1dHM6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRoYXNIaWRkZW5PdXRwdXRzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdoYXNIaWRkZW5PdXRwdXRzJywgZmFsc2UpO1xuXHRjaGVja0ZvckhpZGRlbk91dHB1dHMoKSB7XG5cdFx0aWYgKHRoaXMuX291dHB1dEVudHJpZXMuZmluZChlbnRyeSA9PiB7IHJldHVybiAhZW50cnkubW9kZWwudmlzaWJsZS5nZXQoKTsgfSkpIHtcblx0XHRcdHRoaXMuaGFzSGlkZGVuT3V0cHV0cy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5oYXNIaWRkZW5PdXRwdXRzLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgcmVuZGVyZWRPdXRwdXRFbnRyaWVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9vdXRwdXRFbnRyaWVzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSB2aWV3Q2VsbDogQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiB7IGxpbWl0OiBudW1iZXIgfSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdDZWxsLm9uRGlkU3RhcnRFeGVjdXRpb24oKCkgPT4ge1xuXHRcdFx0dmlld0NlbGwudXBkYXRlT3V0cHV0TWluSGVpZ2h0KHZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdDZWxsLm9uRGlkU3RvcEV4ZWN1dGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl92YWxpZGF0ZUZpbmFsT3V0cHV0SGVpZ2h0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3Q2VsbC5vbkRpZENoYW5nZU91dHB1dHMoc3BsaWNlID0+IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvblN0YXRlID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbih2aWV3Q2VsbC51cmkpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGV4ZWN1dGlvblN0YXRlID8gQ2VsbE91dHB1dFVwZGF0ZUNvbnRleHQuRXhlY3V0aW9uIDogQ2VsbE91dHB1dFVwZGF0ZUNvbnRleHQuT3RoZXI7XG5cdFx0XHR0aGlzLl91cGRhdGVPdXRwdXRzKHNwbGljZSwgY29udGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld0NlbGwub25EaWRDaGFuZ2VMYXlvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVJbnRlcm5hbExheW91dE5vdyh2aWV3Q2VsbCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlSW50ZXJuYWxMYXlvdXROb3codmlld0NlbGw6IENvZGVDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLnNldFRvcCh2aWV3Q2VsbC5sYXlvdXRJbmZvLm91dHB1dENvbnRhaW5lck9mZnNldCk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuc2V0VG9wKHZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0U2hvd01vcmVDb250YWluZXJPZmZzZXQpO1xuXG5cdFx0dGhpcy5fb3V0cHV0RW50cmllcy5mb3JFYWNoKGVudHJ5ID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKGVudHJ5Lm1vZGVsKTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IHRvcCA9IHRoaXMudmlld0NlbGwuZ2V0T3V0cHV0T2Zmc2V0SW5Db250YWluZXIoaW5kZXgpO1xuXHRcdFx0XHRlbnRyeS5lbGVtZW50LnVwZGF0ZURPTVRvcCh0b3ApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVuZGVyKCkge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9kb1JlbmRlcigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBUT0RPQHJlYm9ybml4LCB0aGlzIGlzIHByb2JhYmx5IG5vdCBuZWNlc3NhcnkgYXQgYWxsIGFzIGNlbGwgbGF5b3V0IGNoYW5nZSB3b3VsZCBzZW5kIHRoZSB1cGRhdGUgcmVxdWVzdC5cblx0XHRcdHRoaXMuX3JlbGF5b3V0Q2VsbCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZnkgdGhhdCBhbiBvdXRwdXQgbWF5IGhhdmUgYmVlbiBzd2FwcGVkIG91dCB3aXRob3V0IHRoZSBtb2RlbCBnZXR0aW5nIHJlbmRlcmVkLlxuXHQgKi9cblx0ZmxhZ0FzU3RhbGUoKSB7XG5cdFx0dGhpcy5faGFzU3RhbGVPdXRwdXRzID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2RvUmVuZGVyKCkge1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICh0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHQgIT09IDApIHtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRNaW5IZWlnaHQodGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0KTtcblx0XHRcdH1cblxuXHRcdFx0RE9NLnNob3codGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUpO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IE1hdGgubWluKHRoaXMub3B0aW9ucy5saW1pdCwgdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5sZW5ndGgpOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJPdXRwdXQgPSB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzW2luZGV4XTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLnZpZXdDZWxsLCB0aGlzLCB0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIsIGN1cnJPdXRwdXQpO1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzLnB1c2gobmV3IE91dHB1dEVudHJ5Vmlld0hhbmRsZXIoY3Vyck91dHB1dCwgZW50cnkpKTtcblx0XHRcdFx0ZW50cnkucmVuZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCA+IHRoaXMub3B0aW9ucy5saW1pdCkge1xuXHRcdFx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlKTtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodCg0Nik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3ZhbGlkYXRlRmluYWxPdXRwdXRIZWlnaHQoZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBub29wXG5cdFx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuZG9tTm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuZG9tTm9kZS5pbm5lclRleHQgPSAnJztcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5sZW5ndGggPiB0aGlzLm9wdGlvbnMubGltaXQpIHtcblx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dFNob3dNb3JlQ29udGFpbmVyLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZ2VuZXJhdGVTaG93TW9yZUVsZW1lbnQodGhpcy50ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlKTtcblx0XHRcdHRoaXMudmlld0NlbGwudXBkYXRlT3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQoMCk7XG5cdFx0fVxuXHR9XG5cblx0dmlld1VwZGF0ZVNob3dPdXRwdXRzKGluaXRSZW5kZXJpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzU3RhbGVPdXRwdXRzKSB7XG5cdFx0XHR0aGlzLl9oYXNTdGFsZU91dHB1dHMgPSBmYWxzZTtcblx0XHRcdHRoaXMuX291dHB1dEVudHJpZXMuZm9yRWFjaChlbnRyeSA9PiB7XG5cdFx0XHRcdGVudHJ5LmVsZW1lbnQucmVyZW5kZXIoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLl9vdXRwdXRFbnRyaWVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3Qgdmlld0hhbmRsZXIgPSB0aGlzLl9vdXRwdXRFbnRyaWVzW2luZGV4XTtcblx0XHRcdGNvbnN0IG91dHB1dEVudHJ5ID0gdmlld0hhbmRsZXIuZWxlbWVudDtcblx0XHRcdGlmIChvdXRwdXRFbnRyeS5yZW5kZXJSZXN1bHQpIHtcblx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGVPdXRwdXQodGhpcy52aWV3Q2VsbCwgb3V0cHV0RW50cnkucmVuZGVyUmVzdWx0IGFzIElJbnNldFJlbmRlck91dHB1dCwgdGhpcy52aWV3Q2VsbC5nZXRPdXRwdXRPZmZzZXQoaW5kZXgpLCBmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXRFbnRyeS5yZW5kZXIodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWxheW91dENlbGwoKTtcblx0fVxuXG5cdHZpZXdVcGRhdGVIaWRlT3VwdXRzKCk6IHZvaWQge1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLl9vdXRwdXRFbnRyaWVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5oaWRlSW5zZXQodGhpcy5fb3V0cHV0RW50cmllc1tpbmRleF0ubW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX291dHB1dEhlaWdodFRpbWVyOiBUaW1lb3V0IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVGaW5hbE91dHB1dEhlaWdodChzeW5jaHJvbm91czogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9vdXRwdXRIZWlnaHRUaW1lciAhPT0gbnVsbCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX291dHB1dEhlaWdodFRpbWVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRpb25TdGF0ZSA9IHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24odGhpcy52aWV3Q2VsbC51cmkpO1xuXG5cdFx0aWYgKHN5bmNocm9ub3VzKSB7XG5cdFx0XHR0aGlzLnZpZXdDZWxsLnVubG9ja091dHB1dEhlaWdodCgpO1xuXHRcdH0gZWxzZSBpZiAoZXhlY3V0aW9uU3RhdGU/LnN0YXRlICE9PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcpIHtcblx0XHRcdHRoaXMuX291dHB1dEhlaWdodFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmlld0NlbGwudW5sb2NrT3V0cHV0SGVpZ2h0KCk7XG5cdFx0XHR9LCAyMDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU91dHB1dHMoc3BsaWNlOiBOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlLCBjb250ZXh0OiBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dCA9IENlbGxPdXRwdXRVcGRhdGVDb250ZXh0Lk90aGVyKSB7XG5cdFx0Y29uc3QgcHJldmlvdXNPdXRwdXRIZWlnaHQgPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHQ7XG5cblx0XHQvLyBmb3IgY2VsbCBvdXRwdXQgdXBkYXRlLCB3ZSBtYWtlIHN1cmUgdGhlIGNlbGwgZG9lcyBub3Qgc2hyaW5rIGJlZm9yZSB0aGUgbmV3IG91dHB1dHMgYXJlIHJlbmRlcmVkLlxuXHRcdHRoaXMudmlld0NlbGwudXBkYXRlT3V0cHV0TWluSGVpZ2h0KHByZXZpb3VzT3V0cHV0SGVpZ2h0KTtcblxuXHRcdGlmICh0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0RE9NLnNob3codGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuZG9tTm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q2VsbC5zcGxpY2VPdXRwdXRIZWlnaHRzKHNwbGljZS5zdGFydCwgc3BsaWNlLmRlbGV0ZUNvdW50LCBzcGxpY2UubmV3T3V0cHV0cy5tYXAoXyA9PiAwKSk7XG5cdFx0dGhpcy5fcmVuZGVyTm93KHNwbGljZSwgY29udGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJOb3coc3BsaWNlOiBOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlLCBjb250ZXh0OiBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dCkge1xuXHRcdGlmIChzcGxpY2Uuc3RhcnQgPj0gdGhpcy5vcHRpb25zLmxpbWl0KSB7XG5cdFx0XHQvLyBzcGxpY2UgaXRlbXMgb3V0IG9mIGxpbWl0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RHcm91cEVudHJpZXMgPSB0aGlzLl9vdXRwdXRFbnRyaWVzLnNsaWNlKDAsIHNwbGljZS5zdGFydCk7XG5cdFx0Y29uc3QgZGVsZXRlZEVudHJpZXMgPSB0aGlzLl9vdXRwdXRFbnRyaWVzLnNsaWNlKHNwbGljZS5zdGFydCwgc3BsaWNlLnN0YXJ0ICsgc3BsaWNlLmRlbGV0ZUNvdW50KTtcblx0XHRjb25zdCBzZWNvbmRHcm91cEVudHJpZXMgPSB0aGlzLl9vdXRwdXRFbnRyaWVzLnNsaWNlKHNwbGljZS5zdGFydCArIHNwbGljZS5kZWxldGVDb3VudCk7XG5cdFx0bGV0IG5ld2x5SW5zZXJ0ZWQgPSB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLnNsaWNlKHNwbGljZS5zdGFydCwgc3BsaWNlLnN0YXJ0ICsgc3BsaWNlLm5ld091dHB1dHMubGVuZ3RoKTtcblxuXHRcdC8vIFsuLi5maXJzdEdyb3VwLCAuLi5kZWxldGVkRW50cmllcywgLi4uc2Vjb25kR3JvdXBFbnRyaWVzXSAgWy4uLnJlc3RJbk1vZGVsXVxuXHRcdC8vIFsuLi5maXJzdEdyb3VwLCAuLi5uZXdseUluc2VydGVkLCAuLi5zZWNvbmRHcm91cEVudHJpZXMsIHJlc3RJbk1vZGVsXVxuXHRcdGlmIChmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggKyBuZXdseUluc2VydGVkLmxlbmd0aCArIHNlY29uZEdyb3VwRW50cmllcy5sZW5ndGggPiB0aGlzLm9wdGlvbnMubGltaXQpIHtcblx0XHRcdC8vIGV4Y2VlZHMgbGltaXQgYWdhaW5cblx0XHRcdGlmIChmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggKyBuZXdseUluc2VydGVkLmxlbmd0aCA+IHRoaXMub3B0aW9ucy5saW1pdCkge1xuXHRcdFx0XHRbLi4uZGVsZXRlZEVudHJpZXMsIC4uLnNlY29uZEdyb3VwRW50cmllc10uZm9yRWFjaChlbnRyeSA9PiB7XG5cdFx0XHRcdFx0ZW50cnkuZWxlbWVudC5kZXRhY2goKTtcblx0XHRcdFx0XHRlbnRyeS5lbGVtZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bmV3bHlJbnNlcnRlZCA9IG5ld2x5SW5zZXJ0ZWQuc2xpY2UoMCwgdGhpcy5vcHRpb25zLmxpbWl0IC0gZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgbmV3bHlJbnNlcnRlZEVudHJpZXMgPSBuZXdseUluc2VydGVkLm1hcChpbnNlcnQgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgT3V0cHV0RW50cnlWaWV3SGFuZGxlcihpbnNlcnQsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbE91dHB1dEVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMudmlld0NlbGwsIHRoaXMsIHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lciwgaW5zZXJ0KSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuX291dHB1dEVudHJpZXMgPSBbLi4uZmlyc3RHcm91cEVudHJpZXMsIC4uLm5ld2x5SW5zZXJ0ZWRFbnRyaWVzXTtcblxuXHRcdFx0XHQvLyByZW5kZXIgbmV3bHkgaW5zZXJ0ZWQgb3V0cHV0c1xuXHRcdFx0XHRmb3IgKGxldCBpID0gZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoOyBpIDwgdGhpcy5fb3V0cHV0RW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuX291dHB1dEVudHJpZXNbaV0uZWxlbWVudC5yZW5kZXIodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcGFydCBvZiBzZWNvbmRHcm91cEVudHJpZXMgYXJlIHB1c2hlZCBvdXQgb2Ygdmlld1xuXHRcdFx0XHQvLyBub3cgd2UgaGF2ZSB0byBiZSBjcmVhdGl2ZSBhcyBzZWNvbmRHcm91cEVudHJpZXMgbWlnaHQgbm90IHVzZSBkZWRpY2F0ZWQgY29udGFpbmVyc1xuXHRcdFx0XHRjb25zdCBlbGVtZW50c1B1c2hlZE91dE9mVmlldyA9IHNlY29uZEdyb3VwRW50cmllcy5zbGljZSh0aGlzLm9wdGlvbnMubGltaXQgLSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggLSBuZXdseUluc2VydGVkLmxlbmd0aCk7XG5cdFx0XHRcdFsuLi5kZWxldGVkRW50cmllcywgLi4uZWxlbWVudHNQdXNoZWRPdXRPZlZpZXddLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0XHRcdGVudHJ5LmVsZW1lbnQuZGV0YWNoKCk7XG5cdFx0XHRcdFx0ZW50cnkuZWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGV4Y2x1c2l2ZVxuXHRcdFx0XHRjb25zdCByZVJlbmRlclJpZ2h0Qm91bmRhcnkgPSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggKyBuZXdseUluc2VydGVkLmxlbmd0aDtcblxuXHRcdFx0XHRjb25zdCBuZXdseUluc2VydGVkRW50cmllcyA9IG5ld2x5SW5zZXJ0ZWQubWFwKGluc2VydCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyKGluc2VydCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsT3V0cHV0RWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGhpcy52aWV3Q2VsbCwgdGhpcywgdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLCBpbnNlcnQpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5fb3V0cHV0RW50cmllcyA9IFsuLi5maXJzdEdyb3VwRW50cmllcywgLi4ubmV3bHlJbnNlcnRlZEVudHJpZXMsIC4uLnNlY29uZEdyb3VwRW50cmllcy5zbGljZSgwLCB0aGlzLm9wdGlvbnMubGltaXQgLSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggLSBuZXdseUluc2VydGVkLmxlbmd0aCldO1xuXG5cdFx0XHRcdGZvciAobGV0IGkgPSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGg7IGkgPCByZVJlbmRlclJpZ2h0Qm91bmRhcnk7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzU2libGluZyA9IGkgLSAxID49IDAgJiYgdGhpcy5fb3V0cHV0RW50cmllc1tpIC0gMV0gJiYgISEodGhpcy5fb3V0cHV0RW50cmllc1tpIC0gMV0uZWxlbWVudC5pbm5lckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCkgPyB0aGlzLl9vdXRwdXRFbnRyaWVzW2kgLSAxXS5lbGVtZW50LmlubmVyQ29udGFpbmVyIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX291dHB1dEVudHJpZXNbaV0uZWxlbWVudC5yZW5kZXIocHJldmlvdXNTaWJsaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhZnRlciBzcGxpY2UsIGl0IGRvZXNuJ3QgZXhjZWVkXG5cdFx0XHRkZWxldGVkRW50cmllcy5mb3JFYWNoKGVudHJ5ID0+IHtcblx0XHRcdFx0ZW50cnkuZWxlbWVudC5kZXRhY2goKTtcblx0XHRcdFx0ZW50cnkuZWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVSZW5kZXJSaWdodEJvdW5kYXJ5ID0gZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoICsgbmV3bHlJbnNlcnRlZC5sZW5ndGg7XG5cblx0XHRcdGNvbnN0IG5ld2x5SW5zZXJ0ZWRFbnRyaWVzID0gbmV3bHlJbnNlcnRlZC5tYXAoaW5zZXJ0ID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyKGluc2VydCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsT3V0cHV0RWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGhpcy52aWV3Q2VsbCwgdGhpcywgdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLCBpbnNlcnQpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgb3V0cHV0c05ld2x5QXZhaWxhYmxlOiBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyW10gPSBbXTtcblxuXHRcdFx0aWYgKGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCArIG5ld2x5SW5zZXJ0ZWRFbnRyaWVzLmxlbmd0aCArIHNlY29uZEdyb3VwRW50cmllcy5sZW5ndGggPCB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBsYXN0ID0gTWF0aC5taW4odGhpcy5vcHRpb25zLmxpbWl0LCB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCk7XG5cdFx0XHRcdG91dHB1dHNOZXdseUF2YWlsYWJsZSA9IHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMuc2xpY2UoZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoICsgbmV3bHlJbnNlcnRlZEVudHJpZXMubGVuZ3RoICsgc2Vjb25kR3JvdXBFbnRyaWVzLmxlbmd0aCwgbGFzdCkubWFwKG91dHB1dCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyKG91dHB1dCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsT3V0cHV0RWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGhpcy52aWV3Q2VsbCwgdGhpcywgdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLCBvdXRwdXQpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX291dHB1dEVudHJpZXMgPSBbLi4uZmlyc3RHcm91cEVudHJpZXMsIC4uLm5ld2x5SW5zZXJ0ZWRFbnRyaWVzLCAuLi5zZWNvbmRHcm91cEVudHJpZXMsIC4uLm91dHB1dHNOZXdseUF2YWlsYWJsZV07XG5cblx0XHRcdGZvciAobGV0IGkgPSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGg7IGkgPCByZVJlbmRlclJpZ2h0Qm91bmRhcnk7IGkrKykge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c1NpYmxpbmcgPSBpIC0gMSA+PSAwICYmIHRoaXMuX291dHB1dEVudHJpZXNbaSAtIDFdICYmICEhKHRoaXMuX291dHB1dEVudHJpZXNbaSAtIDFdLmVsZW1lbnQuaW5uZXJDb250YWluZXI/LnBhcmVudEVsZW1lbnQpID8gdGhpcy5fb3V0cHV0RW50cmllc1tpIC0gMV0uZWxlbWVudC5pbm5lckNvbnRhaW5lciA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb3V0cHV0RW50cmllc1tpXS5lbGVtZW50LnJlbmRlcihwcmV2aW91c1NpYmxpbmcpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG91dHB1dHNOZXdseUF2YWlsYWJsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzW2ZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCArIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoICsgc2Vjb25kR3JvdXBFbnRyaWVzLmxlbmd0aCArIGldLmVsZW1lbnQucmVuZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoID4gdGhpcy5vcHRpb25zLmxpbWl0KSB7XG5cdFx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlKTtcblx0XHRcdGlmICghdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuZG9tTm9kZS5oYXNDaGlsZE5vZGVzKCkpIHtcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9nZW5lcmF0ZVNob3dNb3JlRWxlbWVudCh0aGlzLnRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0KDQ2KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0RE9NLmhpZGUodGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuZG9tTm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVsYXlvdXRDZWxsKCk7XG5cdFx0Ly8gaWYgaXQncyBjbGVhcmluZyBhbGwgb3V0cHV0cywgb3Igb3V0cHV0cyBhcmUgYWxsIHJlbmRlcmVkIHN5bmNocm9ub3VzbHlcblx0XHQvLyBzaHJpbmsgaW1tZWRpYXRlbHkgYXMgdGhlIGZpbmFsIG91dHB1dCBoZWlnaHQgd2lsbCBiZSB6ZXJvLlxuXHRcdC8vIGlmIGl0J3MgcmVydW4sIHRoZW4gdGhlIG91dHB1dCBjbGVhcmluZyBtaWdodCBiZSB0ZW1wb3JhcnksIHNvIHdlIGRvbid0IHNocmluayBpbW1lZGlhdGVseVxuXHRcdHRoaXMuX3ZhbGlkYXRlRmluYWxPdXRwdXRIZWlnaHQoY29udGV4dCA9PT0gQ2VsbE91dHB1dFVwZGF0ZUNvbnRleHQuT3RoZXIgJiYgdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5sZW5ndGggPT09IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2VuZXJhdGVTaG93TW9yZUVsZW1lbnQoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBtZDogSU1hcmtkb3duU3RyaW5nID0ge1xuXHRcdFx0dmFsdWU6IGBUaGVyZSBhcmUgbW9yZSB0aGFuICR7dGhpcy5vcHRpb25zLmxpbWl0fSBvdXRwdXRzLCBbc2hvdyBtb3JlIChvcGVuIHRoZSByYXcgb3V0cHV0IGRhdGEgaW4gYSB0ZXh0IGVkaXRvcikgLi4uXShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlbkxhcmdlT3V0cHV0KWAsXG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZW5kZXJlZCA9IGRpc3Bvc2FibGVzLmFkZChyZW5kZXJNYXJrZG93bihtZCwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjogKGNvbnRlbnQpID0+IHtcblx0XHRcdFx0aWYgKGNvbnRlbnQgPT09ICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlbkxhcmdlT3V0cHV0Jykge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKENlbGxVcmkuZ2VuZXJhdGVDZWxsT3V0cHV0VXJpV2l0aElkKHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsIS51cmkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZW5kZXJlZC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ291dHB1dC1zaG93LW1vcmUnKTtcblx0XHRyZXR1cm4gcmVuZGVyZWQuZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbGF5b3V0Q2VsbCgpIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmxheW91dE5vdGVib29rQ2VsbCh0aGlzLnZpZXdDZWxsLCB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8udG90YWxIZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dE1pbkhlaWdodCgwKTtcblxuXHRcdGlmICh0aGlzLl9vdXRwdXRIZWlnaHRUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX291dHB1dEhlaWdodFRpbWVyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0ZW50cnkuZWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY29uc3QgSlVQWVRFUl9SRU5ERVJFUl9NSU1FVFlQRVMgPSBbXG5cdCdhcHBsaWNhdGlvbi9nZW8ranNvbicsXG5cdCdhcHBsaWNhdGlvbi92ZG9tLnYxK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLmRhdGFyZXNvdXJjZStqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5wbG90bHkudjEranNvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQudmVnYS52Mitqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhLnYzK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2EudjQranNvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQudmVnYS52NStqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhbGl0ZS52MStqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhbGl0ZS52Mitqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhbGl0ZS52Mytqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhbGl0ZS52NCtqc29uJyxcblx0J2FwcGxpY2F0aW9uL3gtbnRlcmFjdC1tb2RlbC1kZWJ1Zytqc29uJyxcblx0J2ltYWdlL3N2Zyt4bWwnLFxuXHQndGV4dC9sYXRleCcsXG5cdCd0ZXh0L3ZuZC5wbG90bHkudjEraHRtbCcsXG5cdCdhcHBsaWNhdGlvbi92bmQuanVweXRlci53aWRnZXQtdmlldytqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLmVycm9yJ1xuXTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYztBQUV2QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksU0FBUztBQUNyQixT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
