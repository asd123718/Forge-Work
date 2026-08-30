import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, dispose } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { MultiDiffEditorItem } from "../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { DiffElementPlaceholderViewModel, NotebookDocumentMetadataViewModel, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel } from "./diffElementViewModel.js";
import { NOTEBOOK_DIFF_ITEM_DIFF_STATE, NOTEBOOK_DIFF_ITEM_KIND } from "./notebookDiffEditorBrowser.js";
import { CellUri } from "../../common/notebookCommon.js";
import { raceCancellation } from "../../../../../base/common/async.js";
import { computeDiff } from "../../common/notebookDiff.js";
class NotebookDiffViewModel extends Disposable {
  constructor(model, notebookEditorWorkerService, configurationService, eventDispatcher, notebookService, diffEditorHeightCalculator, fontInfo, excludeUnchangedPlaceholder) {
    super();
    this.model = model;
    this.notebookEditorWorkerService = notebookEditorWorkerService;
    this.configurationService = configurationService;
    this.eventDispatcher = eventDispatcher;
    this.notebookService = notebookService;
    this.diffEditorHeightCalculator = diffEditorHeightCalculator;
    this.fontInfo = fontInfo;
    this.excludeUnchangedPlaceholder = excludeUnchangedPlaceholder;
    this.placeholderAndRelatedCells = /* @__PURE__ */ new Map();
    this._items = [];
    this._onDidChangeItems = this._register(new Emitter());
    this.onDidChangeItems = this._onDidChangeItems.event;
    this.disposables = this._register(new DisposableStore());
    this._onDidChange = this._register(new Emitter());
    this.diffEditorItems = [];
    this.onDidChange = this._onDidChange.event;
    this.originalCellViewModels = [];
    this.hideOutput = this.model.modified.notebook.transientOptions.transientOutputs || this.configurationService.getValue("notebook.diff.ignoreOutputs");
    this.ignoreMetadata = this.configurationService.getValue("notebook.diff.ignoreMetadata");
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      let triggerChange = false;
      let metadataChanged = false;
      if (e.affectsConfiguration("notebook.diff.ignoreMetadata")) {
        const newValue = this.configurationService.getValue("notebook.diff.ignoreMetadata");
        if (newValue !== void 0 && this.ignoreMetadata !== newValue) {
          this.ignoreMetadata = newValue;
          triggerChange = true;
          metadataChanged = true;
        }
      }
      if (e.affectsConfiguration("notebook.diff.ignoreOutputs")) {
        const newValue = this.configurationService.getValue("notebook.diff.ignoreOutputs");
        if (newValue !== void 0 && this.hideOutput !== (newValue || this.model.modified.notebook.transientOptions.transientOutputs)) {
          this.hideOutput = newValue || !!this.model.modified.notebook.transientOptions.transientOutputs;
          triggerChange = true;
        }
      }
      if (metadataChanged) {
        this.toggleNotebookMetadata();
      }
      if (triggerChange) {
        this._onDidChange.fire();
      }
    }));
  }
  get items() {
    return this._items;
  }
  get value() {
    return this.diffEditorItems.filter((item) => item.type !== "placeholder").filter((item) => {
      if (this._includeUnchanged) {
        return true;
      }
      if (item instanceof NotebookMultiDiffEditorCellItem) {
        return item.type === "unchanged" && item.containerType === "unchanged" ? false : true;
      }
      if (item instanceof NotebookMultiDiffEditorMetadataItem) {
        return item.type === "unchanged" && item.containerType === "unchanged" ? false : true;
      }
      if (item instanceof NotebookMultiDiffEditorOutputItem) {
        return item.type === "unchanged" && item.containerType === "unchanged" ? false : true;
      }
      return true;
    }).filter((item) => item instanceof NotebookMultiDiffEditorOutputItem ? !this.hideOutput : true).filter((item) => item instanceof NotebookMultiDiffEditorMetadataItem ? !this.ignoreMetadata : true);
  }
  get hasUnchangedCells() {
    return this._hasUnchangedCells === true;
  }
  get includeUnchanged() {
    return this._includeUnchanged === true;
  }
  set includeUnchanged(value) {
    this._includeUnchanged = value;
    this._onDidChange.fire();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  clear() {
    this.disposables.clear();
    dispose(Array.from(this.placeholderAndRelatedCells.keys()));
    this.placeholderAndRelatedCells.clear();
    dispose(this.originalCellViewModels);
    this.originalCellViewModels = [];
    dispose(this._items);
    this._items.splice(0, this._items.length);
  }
  async computeDiff(token) {
    const diffResult = await raceCancellation(this.notebookEditorWorkerService.computeDiff(this.model.original.resource, this.model.modified.resource), token);
    if (!diffResult || token.isCancellationRequested) {
      return;
    }
    prettyChanges(this.model.original.notebook, this.model.modified.notebook, diffResult.cellsDiff);
    const { cellDiffInfo, firstChangeIndex } = computeDiff(this.model.original.notebook, this.model.modified.notebook, diffResult);
    if (isEqual(cellDiffInfo, this.originalCellViewModels, this.model)) {
      return;
    } else {
      await raceCancellation(this.updateViewModels(cellDiffInfo, diffResult.metadataChanged, firstChangeIndex), token);
      if (token.isCancellationRequested) {
        return;
      }
      this.updateDiffEditorItems();
    }
  }
  toggleNotebookMetadata() {
    if (!this.notebookMetadataViewModel) {
      return;
    }
    if (this.ignoreMetadata) {
      if (this._items.length && this._items[0] === this.notebookMetadataViewModel) {
        this._items.splice(0, 1);
        this._onDidChangeItems.fire({ start: 0, deleteCount: 1, elements: [] });
      }
    } else {
      if (!this._items.length || this._items[0] !== this.notebookMetadataViewModel) {
        this._items.splice(0, 0, this.notebookMetadataViewModel);
        this._onDidChangeItems.fire({ start: 0, deleteCount: 0, elements: [this.notebookMetadataViewModel] });
      }
    }
  }
  updateDiffEditorItems() {
    this.diffEditorItems = [];
    const originalSourceUri = this.model.original.resource;
    const modifiedSourceUri = this.model.modified.resource;
    this._hasUnchangedCells = false;
    this.items.forEach((item) => {
      switch (item.type) {
        case "delete": {
          this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, void 0, item.type, item.type));
          const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
          this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, void 0, item.type, item.type));
          const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
          this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, void 0, item.type, item.type));
          break;
        }
        case "insert": {
          this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(void 0, item.modified.uri, item.type, item.type));
          const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
          this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(void 0, modifiedMetadata, item.type, item.type));
          const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
          this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(void 0, modifiedOutput, item.type, item.type));
          break;
        }
        case "modified": {
          const cellType = item.checkIfInputModified() ? item.type : "unchanged";
          const containerChanged = item.checkIfInputModified() || item.checkMetadataIfModified() || item.checkIfOutputsModified() ? item.type : "unchanged";
          this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, item.modified.uri, cellType, containerChanged));
          const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
          const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
          this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.checkMetadataIfModified() ? item.type : "unchanged", containerChanged));
          const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
          const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
          this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.checkIfOutputsModified() ? item.type : "unchanged", containerChanged));
          break;
        }
        case "unchanged": {
          this._hasUnchangedCells = true;
          this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, item.modified.uri, item.type, item.type));
          const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
          const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
          this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.type, item.type));
          const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
          const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
          this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.type, item.type));
          break;
        }
      }
    });
    this._onDidChange.fire();
  }
  async updateViewModels(cellDiffInfo, metadataChanged, firstChangeIndex) {
    const cellViewModels = await this.createDiffViewModels(cellDiffInfo, metadataChanged);
    const oldLength = this._items.length;
    this.clear();
    this._items.splice(0, oldLength);
    let placeholder = void 0;
    this.originalCellViewModels = cellViewModels;
    cellViewModels.forEach((vm, index) => {
      if (vm.type === "unchanged" && !this.excludeUnchangedPlaceholder) {
        if (!placeholder) {
          vm.displayIconToHideUnmodifiedCells = true;
          placeholder = new DiffElementPlaceholderViewModel(vm.mainDocumentTextModel, vm.editorEventDispatcher, vm.initData);
          this._items.push(placeholder);
          const placeholderItem = placeholder;
          this.disposables.add(placeholderItem.onUnfoldHiddenCells(() => {
            const hiddenCellViewModels2 = this.placeholderAndRelatedCells.get(placeholderItem);
            if (!Array.isArray(hiddenCellViewModels2)) {
              return;
            }
            const start = this._items.indexOf(placeholderItem);
            this._items.splice(start, 1, ...hiddenCellViewModels2);
            this._onDidChangeItems.fire({ start, deleteCount: 1, elements: hiddenCellViewModels2 });
          }));
          this.disposables.add(vm.onHideUnchangedCells(() => {
            const hiddenCellViewModels2 = this.placeholderAndRelatedCells.get(placeholderItem);
            if (!Array.isArray(hiddenCellViewModels2)) {
              return;
            }
            const start = this._items.indexOf(vm);
            this._items.splice(start, hiddenCellViewModels2.length, placeholderItem);
            this._onDidChangeItems.fire({ start, deleteCount: hiddenCellViewModels2.length, elements: [placeholderItem] });
          }));
        }
        const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholder) || [];
        hiddenCellViewModels.push(vm);
        this.placeholderAndRelatedCells.set(placeholder, hiddenCellViewModels);
        placeholder.hiddenCells.push(vm);
      } else {
        placeholder = void 0;
        this._items.push(vm);
      }
    });
    this._onDidChangeItems.fire({ start: 0, deleteCount: oldLength, elements: this._items, firstChangeIndex });
  }
  async createDiffViewModels(computedCellDiffs, metadataChanged) {
    const originalModel = this.model.original.notebook;
    const modifiedModel = this.model.modified.notebook;
    const initData = {
      metadataStatusHeight: this.configurationService.getValue("notebook.diff.ignoreMetadata") ? 0 : 25,
      outputStatusHeight: this.configurationService.getValue("notebook.diff.ignoreOutputs") || !!modifiedModel.transientOptions.transientOutputs ? 0 : 25,
      fontInfo: this.fontInfo
    };
    const viewModels = [];
    this.notebookMetadataViewModel = this._register(new NotebookDocumentMetadataViewModel(this.model.original.notebook, this.model.modified.notebook, metadataChanged ? "modifiedMetadata" : "unchangedMetadata", this.eventDispatcher, initData, this.notebookService, this.diffEditorHeightCalculator));
    if (!this.ignoreMetadata) {
      if (metadataChanged) {
        await this.notebookMetadataViewModel.computeHeights();
      }
      viewModels.push(this.notebookMetadataViewModel);
    }
    const cellViewModels = await Promise.all(computedCellDiffs.map(async (diff) => {
      switch (diff.type) {
        case "delete": {
          return new SingleSideDiffElementViewModel(
            originalModel,
            modifiedModel,
            originalModel.cells[diff.originalCellIndex],
            void 0,
            "delete",
            this.eventDispatcher,
            initData,
            this.notebookService,
            this.configurationService,
            this.diffEditorHeightCalculator,
            diff.originalCellIndex
          );
        }
        case "insert": {
          return new SingleSideDiffElementViewModel(
            modifiedModel,
            originalModel,
            void 0,
            modifiedModel.cells[diff.modifiedCellIndex],
            "insert",
            this.eventDispatcher,
            initData,
            this.notebookService,
            this.configurationService,
            this.diffEditorHeightCalculator,
            diff.modifiedCellIndex
          );
        }
        case "modified": {
          const viewModel = new SideBySideDiffElementViewModel(
            this.model.modified.notebook,
            this.model.original.notebook,
            originalModel.cells[diff.originalCellIndex],
            modifiedModel.cells[diff.modifiedCellIndex],
            "modified",
            this.eventDispatcher,
            initData,
            this.notebookService,
            this.configurationService,
            diff.originalCellIndex,
            this.diffEditorHeightCalculator
          );
          await viewModel.computeEditorHeights();
          return viewModel;
        }
        case "unchanged": {
          return new SideBySideDiffElementViewModel(
            this.model.modified.notebook,
            this.model.original.notebook,
            originalModel.cells[diff.originalCellIndex],
            modifiedModel.cells[diff.modifiedCellIndex],
            "unchanged",
            this.eventDispatcher,
            initData,
            this.notebookService,
            this.configurationService,
            diff.originalCellIndex,
            this.diffEditorHeightCalculator
          );
        }
      }
    }));
    cellViewModels.forEach((vm) => viewModels.push(vm));
    return viewModels;
  }
}
function prettyChanges(original, modified, diffResult) {
  const changes = diffResult.changes;
  for (let i = 0; i < diffResult.changes.length - 1; i++) {
    const curr = changes[i];
    const next = changes[i + 1];
    const x = curr.originalStart;
    const y = curr.modifiedStart;
    if (curr.originalLength === 1 && curr.modifiedLength === 0 && next.originalStart === x + 2 && next.originalLength === 0 && next.modifiedStart === y + 1 && next.modifiedLength === 1 && original.cells[x].getHashValue() === modified.cells[y + 1].getHashValue() && original.cells[x + 1].getHashValue() === modified.cells[y].getHashValue()) {
      curr.originalStart = x;
      curr.originalLength = 0;
      curr.modifiedStart = y;
      curr.modifiedLength = 1;
      next.originalStart = x + 1;
      next.originalLength = 1;
      next.modifiedStart = y + 2;
      next.modifiedLength = 0;
      i++;
    }
  }
}
function isEqual(cellDiffInfo, viewModels, model) {
  if (cellDiffInfo.length !== viewModels.length) {
    return false;
  }
  const originalModel = model.original.notebook;
  const modifiedModel = model.modified.notebook;
  for (let i = 0; i < viewModels.length; i++) {
    const a = cellDiffInfo[i];
    const b = viewModels[i];
    if (a.type !== b.type) {
      return false;
    }
    switch (a.type) {
      case "delete": {
        if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
          return false;
        }
        continue;
      }
      case "insert": {
        if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
          return false;
        }
        continue;
      }
      default: {
        if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
          return false;
        }
        if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
          return false;
        }
        continue;
      }
    }
  }
  return true;
}
class NotebookMultiDiffEditorItem extends MultiDiffEditorItem {
  constructor(originalUri, modifiedUri, goToFileUri, type, containerType, kind, contextKeys) {
    super(originalUri, modifiedUri, goToFileUri, void 0, contextKeys);
    this.type = type;
    this.containerType = containerType;
    this.kind = kind;
  }
}
class NotebookMultiDiffEditorCellItem extends NotebookMultiDiffEditorItem {
  constructor(originalUri, modifiedUri, type, containerType) {
    super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, "Cell", {
      [NOTEBOOK_DIFF_ITEM_KIND.key]: "Cell",
      [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
    });
  }
}
class NotebookMultiDiffEditorMetadataItem extends NotebookMultiDiffEditorItem {
  constructor(originalUri, modifiedUri, type, containerType) {
    super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, "Metadata", {
      [NOTEBOOK_DIFF_ITEM_KIND.key]: "Metadata",
      [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
    });
  }
}
class NotebookMultiDiffEditorOutputItem extends NotebookMultiDiffEditorItem {
  constructor(originalUri, modifiedUri, type, containerType) {
    super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, "Output", {
      [NOTEBOOK_DIFF_ITEM_KIND.key]: "Output",
      [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
    });
  }
}
export {
  NotebookDiffViewModel,
  NotebookMultiDiffEditorItem,
  prettyChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxub3RlYm9va0RpZmZWaWV3TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlmZlJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCB0eXBlIElWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgdHlwZSB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0S2V5VmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvckl0ZW0gfSBmcm9tICcuLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlmZkVsZW1lbnRDZWxsVmlld01vZGVsQmFzZSwgRGlmZkVsZW1lbnRQbGFjZWhvbGRlclZpZXdNb2RlbCwgSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSwgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhVmlld01vZGVsLCBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwsIFNpbmdsZVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB9IGZyb20gJy4vZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEaWZmRWRpdG9yRXZlbnREaXNwYXRjaGVyIH0gZnJvbSAnLi9ldmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRGlmZlZpZXdNb2RlbCwgSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50LCBOT1RFQk9PS19ESUZGX0lURU1fRElGRl9TVEFURSwgTk9URUJPT0tfRElGRl9JVEVNX0tJTkQgfSBmcm9tICcuL25vdGVib29rRGlmZkVkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSwgSU5vdGVib29rRGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2UgfSBmcm9tICcuL2VkaXRvckhlaWdodENhbGN1bGF0b3IuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEaWZmIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRGlmZi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0RpZmZWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRGlmZlZpZXdNb2RlbCwgSVZhbHVlV2l0aENoYW5nZUV2ZW50PHJlYWRvbmx5IE11bHRpRGlmZkVkaXRvckl0ZW1bXT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IHBsYWNlaG9sZGVyQW5kUmVsYXRlZENlbGxzID0gbmV3IE1hcDxEaWZmRWxlbWVudFBsYWNlaG9sZGVyVmlld01vZGVsLCBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlW10gPSBbXTtcblx0Z2V0IGl0ZW1zKCk6IHJlYWRvbmx5IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1zO1xuXHR9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tEaWZmVmlld01vZGVsVXBkYXRlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtcyA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIGRpZmZFZGl0b3JJdGVtczogTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJdGVtW10gPSBbXTtcblx0cHVibGljIG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdHByaXZhdGUgbm90ZWJvb2tNZXRhZGF0YVZpZXdNb2RlbD86IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVZpZXdNb2RlbDtcblx0Z2V0IHZhbHVlKCk6IHJlYWRvbmx5IE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5kaWZmRWRpdG9ySXRlbXNcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgIT09ICdwbGFjZWhvbGRlcicpXG5cdFx0XHQuZmlsdGVyKGl0ZW0gPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faW5jbHVkZVVuY2hhbmdlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JDZWxsSXRlbSkge1xuXHRcdFx0XHRcdHJldHVybiBpdGVtLnR5cGUgPT09ICd1bmNoYW5nZWQnICYmIGl0ZW0uY29udGFpbmVyVHlwZSA9PT0gJ3VuY2hhbmdlZCcgPyBmYWxzZSA6IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBOb3RlYm9va011bHRpRGlmZkVkaXRvck1ldGFkYXRhSXRlbSkge1xuXHRcdFx0XHRcdHJldHVybiBpdGVtLnR5cGUgPT09ICd1bmNoYW5nZWQnICYmIGl0ZW0uY29udGFpbmVyVHlwZSA9PT0gJ3VuY2hhbmdlZCcgPyBmYWxzZSA6IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBOb3RlYm9va011bHRpRGlmZkVkaXRvck91dHB1dEl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbS50eXBlID09PSAndW5jaGFuZ2VkJyAmJiBpdGVtLmNvbnRhaW5lclR5cGUgPT09ICd1bmNoYW5nZWQnID8gZmFsc2UgOiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JPdXRwdXRJdGVtID8gIXRoaXMuaGlkZU91dHB1dCA6IHRydWUpXG5cdFx0XHQuZmlsdGVyKGl0ZW0gPT4gaXRlbSBpbnN0YW5jZW9mIE5vdGVib29rTXVsdGlEaWZmRWRpdG9yTWV0YWRhdGFJdGVtID8gIXRoaXMuaWdub3JlTWV0YWRhdGEgOiB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1VuY2hhbmdlZENlbGxzPzogYm9vbGVhbjtcblx0cHVibGljIGdldCBoYXNVbmNoYW5nZWRDZWxscygpIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzVW5jaGFuZ2VkQ2VsbHMgPT09IHRydWU7XG5cdH1cblx0cHJpdmF0ZSBfaW5jbHVkZVVuY2hhbmdlZD86IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgaW5jbHVkZVVuY2hhbmdlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faW5jbHVkZVVuY2hhbmdlZCA9PT0gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgc2V0IGluY2x1ZGVVbmNoYW5nZWQodmFsdWUpIHtcblx0XHR0aGlzLl9pbmNsdWRlVW5jaGFuZ2VkID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cdHByaXZhdGUgaGlkZU91dHB1dD86IGJvb2xlYW47XG5cdHByaXZhdGUgaWdub3JlTWV0YWRhdGE/OiBib29sZWFuO1xuXG5cdHByaXZhdGUgb3JpZ2luYWxDZWxsVmlld01vZGVsczogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZVtdID0gW107XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElOb3RlYm9va0RpZmZFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZTogSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBldmVudERpc3BhdGNoZXI6IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yOiBJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZm9udEluZm8/OiBGb250SW5mbyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4Y2x1ZGVVbmNoYW5nZWRQbGFjZWhvbGRlcj86IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5oaWRlT3V0cHV0ID0gdGhpcy5tb2RlbC5tb2RpZmllZC5ub3RlYm9vay50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudE91dHB1dHMgfHwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignbm90ZWJvb2suZGlmZi5pZ25vcmVPdXRwdXRzJyk7XG5cdFx0dGhpcy5pZ25vcmVNZXRhZGF0YSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmRpZmYuaWdub3JlTWV0YWRhdGEnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0bGV0IHRyaWdnZXJDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdGxldCBtZXRhZGF0YUNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdub3RlYm9vay5kaWZmLmlnbm9yZU1ldGFkYXRhJykpIHtcblx0XHRcdFx0Y29uc3QgbmV3VmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdub3RlYm9vay5kaWZmLmlnbm9yZU1ldGFkYXRhJyk7XG5cblx0XHRcdFx0aWYgKG5ld1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgdGhpcy5pZ25vcmVNZXRhZGF0YSAhPT0gbmV3VmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLmlnbm9yZU1ldGFkYXRhID0gbmV3VmFsdWU7XG5cdFx0XHRcdFx0dHJpZ2dlckNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0bWV0YWRhdGFDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignbm90ZWJvb2suZGlmZi5pZ25vcmVPdXRwdXRzJykpIHtcblx0XHRcdFx0Y29uc3QgbmV3VmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdub3RlYm9vay5kaWZmLmlnbm9yZU91dHB1dHMnKTtcblxuXHRcdFx0XHRpZiAobmV3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiB0aGlzLmhpZGVPdXRwdXQgIT09IChuZXdWYWx1ZSB8fCB0aGlzLm1vZGVsLm1vZGlmaWVkLm5vdGVib29rLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0cykpIHtcblx0XHRcdFx0XHR0aGlzLmhpZGVPdXRwdXQgPSBuZXdWYWx1ZSB8fCAhISh0aGlzLm1vZGVsLm1vZGlmaWVkLm5vdGVib29rLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0cyk7XG5cdFx0XHRcdFx0dHJpZ2dlckNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG1ldGFkYXRhQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZU5vdGVib29rTWV0YWRhdGEoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0cmlnZ2VyQ2hhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cdHByaXZhdGUgY2xlYXIoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRpc3Bvc2UoQXJyYXkuZnJvbSh0aGlzLnBsYWNlaG9sZGVyQW5kUmVsYXRlZENlbGxzLmtleXMoKSkpO1xuXHRcdHRoaXMucGxhY2Vob2xkZXJBbmRSZWxhdGVkQ2VsbHMuY2xlYXIoKTtcblx0XHRkaXNwb3NlKHRoaXMub3JpZ2luYWxDZWxsVmlld01vZGVscyk7XG5cdFx0dGhpcy5vcmlnaW5hbENlbGxWaWV3TW9kZWxzID0gW107XG5cdFx0ZGlzcG9zZSh0aGlzLl9pdGVtcyk7XG5cdFx0dGhpcy5faXRlbXMuc3BsaWNlKDAsIHRoaXMuX2l0ZW1zLmxlbmd0aCk7XG5cdH1cblxuXHRhc3luYyBjb21wdXRlRGlmZih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWZmUmVzdWx0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbih0aGlzLm5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZS5jb21wdXRlRGlmZih0aGlzLm1vZGVsLm9yaWdpbmFsLnJlc291cmNlLCB0aGlzLm1vZGVsLm1vZGlmaWVkLnJlc291cmNlKSwgdG9rZW4pO1xuXHRcdGlmICghZGlmZlJlc3VsdCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Ly8gYWZ0ZXIgYXdhaXQgdGhlIGVkaXRvciBtaWdodCBiZSBkaXNwb3NlZC5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcmV0dHlDaGFuZ2VzKHRoaXMubW9kZWwub3JpZ2luYWwubm90ZWJvb2ssIHRoaXMubW9kZWwubW9kaWZpZWQubm90ZWJvb2ssIGRpZmZSZXN1bHQuY2VsbHNEaWZmKTtcblxuXHRcdGNvbnN0IHsgY2VsbERpZmZJbmZvLCBmaXJzdENoYW5nZUluZGV4IH0gPSBjb21wdXRlRGlmZih0aGlzLm1vZGVsLm9yaWdpbmFsLm5vdGVib29rLCB0aGlzLm1vZGVsLm1vZGlmaWVkLm5vdGVib29rLCBkaWZmUmVzdWx0KTtcblx0XHRpZiAoaXNFcXVhbChjZWxsRGlmZkluZm8sIHRoaXMub3JpZ2luYWxDZWxsVmlld01vZGVscywgdGhpcy5tb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbih0aGlzLnVwZGF0ZVZpZXdNb2RlbHMoY2VsbERpZmZJbmZvLCBkaWZmUmVzdWx0Lm1ldGFkYXRhQ2hhbmdlZCwgZmlyc3RDaGFuZ2VJbmRleCksIHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZURpZmZFZGl0b3JJdGVtcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlTm90ZWJvb2tNZXRhZGF0YSgpIHtcblx0XHRpZiAoIXRoaXMubm90ZWJvb2tNZXRhZGF0YVZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlnbm9yZU1ldGFkYXRhKSB7XG5cdFx0XHRpZiAodGhpcy5faXRlbXMubGVuZ3RoICYmIHRoaXMuX2l0ZW1zWzBdID09PSB0aGlzLm5vdGVib29rTWV0YWRhdGFWaWV3TW9kZWwpIHtcblx0XHRcdFx0dGhpcy5faXRlbXMuc3BsaWNlKDAsIDEpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoeyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBbXSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLl9pdGVtcy5sZW5ndGggfHwgdGhpcy5faXRlbXNbMF0gIT09IHRoaXMubm90ZWJvb2tNZXRhZGF0YVZpZXdNb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9pdGVtcy5zcGxpY2UoMCwgMCwgdGhpcy5ub3RlYm9va01ldGFkYXRhVmlld01vZGVsKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAwLCBlbGVtZW50czogW3RoaXMubm90ZWJvb2tNZXRhZGF0YVZpZXdNb2RlbF0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgdXBkYXRlRGlmZkVkaXRvckl0ZW1zKCkge1xuXHRcdHRoaXMuZGlmZkVkaXRvckl0ZW1zID0gW107XG5cdFx0Y29uc3Qgb3JpZ2luYWxTb3VyY2VVcmkgPSB0aGlzLm1vZGVsLm9yaWdpbmFsLnJlc291cmNlITtcblx0XHRjb25zdCBtb2RpZmllZFNvdXJjZVVyaSA9IHRoaXMubW9kZWwubW9kaWZpZWQucmVzb3VyY2UhO1xuXHRcdHRoaXMuX2hhc1VuY2hhbmdlZENlbGxzID0gZmFsc2U7XG5cdFx0dGhpcy5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnZGVsZXRlJzoge1xuXHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckl0ZW1zLnB1c2gobmV3IE5vdGVib29rTXVsdGlEaWZmRWRpdG9yQ2VsbEl0ZW0oaXRlbS5vcmlnaW5hbCEudXJpLCB1bmRlZmluZWQsIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNZXRhZGF0YSA9IENlbGxVcmkuZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkob3JpZ2luYWxTb3VyY2VVcmksIGl0ZW0ub3JpZ2luYWwhLmhhbmRsZSwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxNZXRhZGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySXRlbXMucHVzaChuZXcgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JNZXRhZGF0YUl0ZW0ob3JpZ2luYWxNZXRhZGF0YSwgdW5kZWZpbmVkLCBpdGVtLnR5cGUsIGl0ZW0udHlwZSkpO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsT3V0cHV0ID0gQ2VsbFVyaS5nZW5lcmF0ZUNlbGxQcm9wZXJ0eVVyaShvcmlnaW5hbFNvdXJjZVVyaSwgaXRlbS5vcmlnaW5hbCEuaGFuZGxlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCk7XG5cdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySXRlbXMucHVzaChuZXcgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JPdXRwdXRJdGVtKG9yaWdpbmFsT3V0cHV0LCB1bmRlZmluZWQsIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnaW5zZXJ0Jzoge1xuXHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckl0ZW1zLnB1c2gobmV3IE5vdGVib29rTXVsdGlEaWZmRWRpdG9yQ2VsbEl0ZW0odW5kZWZpbmVkLCBpdGVtLm1vZGlmaWVkIS51cmksIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRNZXRhZGF0YSA9IENlbGxVcmkuZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkobW9kaWZpZWRTb3VyY2VVcmksIGl0ZW0ubW9kaWZpZWQhLmhhbmRsZSwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxNZXRhZGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySXRlbXMucHVzaChuZXcgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JNZXRhZGF0YUl0ZW0odW5kZWZpbmVkLCBtb2RpZmllZE1ldGFkYXRhLCBpdGVtLnR5cGUsIGl0ZW0udHlwZSkpO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkT3V0cHV0ID0gQ2VsbFVyaS5nZW5lcmF0ZUNlbGxQcm9wZXJ0eVVyaShtb2RpZmllZFNvdXJjZVVyaSwgaXRlbS5tb2RpZmllZCEuaGFuZGxlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCk7XG5cdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySXRlbXMucHVzaChuZXcgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JPdXRwdXRJdGVtKHVuZGVmaW5lZCwgbW9kaWZpZWRPdXRwdXQsIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbW9kaWZpZWQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbFR5cGUgPSBpdGVtLmNoZWNrSWZJbnB1dE1vZGlmaWVkKCkgPyBpdGVtLnR5cGUgOiAndW5jaGFuZ2VkJztcblx0XHRcdFx0XHRjb25zdCBjb250YWluZXJDaGFuZ2VkID0gKGl0ZW0uY2hlY2tJZklucHV0TW9kaWZpZWQoKSB8fCBpdGVtLmNoZWNrTWV0YWRhdGFJZk1vZGlmaWVkKCkgfHwgaXRlbS5jaGVja0lmT3V0cHV0c01vZGlmaWVkKCkpID8gaXRlbS50eXBlIDogJ3VuY2hhbmdlZCc7XG5cdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySXRlbXMucHVzaChuZXcgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JDZWxsSXRlbShpdGVtLm9yaWdpbmFsIS51cmksIGl0ZW0ubW9kaWZpZWQhLnVyaSwgY2VsbFR5cGUsIGNvbnRhaW5lckNoYW5nZWQpKTtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbE1ldGFkYXRhID0gQ2VsbFVyaS5nZW5lcmF0ZUNlbGxQcm9wZXJ0eVVyaShvcmlnaW5hbFNvdXJjZVVyaSwgaXRlbS5vcmlnaW5hbCEuaGFuZGxlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE1ldGFkYXRhKTtcblx0XHRcdFx0XHRjb25zdCBtb2RpZmllZE1ldGFkYXRhID0gQ2VsbFVyaS5nZW5lcmF0ZUNlbGxQcm9wZXJ0eVVyaShtb2RpZmllZFNvdXJjZVVyaSwgaXRlbS5tb2RpZmllZCEuaGFuZGxlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE1ldGFkYXRhKTtcblx0XHRcdFx0XHR0aGlzLmRpZmZFZGl0b3JJdGVtcy5wdXNoKG5ldyBOb3RlYm9va011bHRpRGlmZkVkaXRvck1ldGFkYXRhSXRlbShvcmlnaW5hbE1ldGFkYXRhLCBtb2RpZmllZE1ldGFkYXRhLCBpdGVtLmNoZWNrTWV0YWRhdGFJZk1vZGlmaWVkKCkgPyBpdGVtLnR5cGUgOiAndW5jaGFuZ2VkJywgY29udGFpbmVyQ2hhbmdlZCkpO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsT3V0cHV0ID0gQ2VsbFVyaS5nZW5lcmF0ZUNlbGxQcm9wZXJ0eVVyaShvcmlnaW5hbFNvdXJjZVVyaSwgaXRlbS5vcmlnaW5hbCEuaGFuZGxlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCk7XG5cdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRPdXRwdXQgPSBDZWxsVXJpLmdlbmVyYXRlQ2VsbFByb3BlcnR5VXJpKG1vZGlmaWVkU291cmNlVXJpLCBpdGVtLm1vZGlmaWVkIS5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0KTtcblx0XHRcdFx0XHR0aGlzLmRpZmZFZGl0b3JJdGVtcy5wdXNoKG5ldyBOb3RlYm9va011bHRpRGlmZkVkaXRvck91dHB1dEl0ZW0ob3JpZ2luYWxPdXRwdXQsIG1vZGlmaWVkT3V0cHV0LCBpdGVtLmNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKSA/IGl0ZW0udHlwZSA6ICd1bmNoYW5nZWQnLCBjb250YWluZXJDaGFuZ2VkKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAndW5jaGFuZ2VkJzoge1xuXHRcdFx0XHRcdHRoaXMuX2hhc1VuY2hhbmdlZENlbGxzID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLmRpZmZFZGl0b3JJdGVtcy5wdXNoKG5ldyBOb3RlYm9va011bHRpRGlmZkVkaXRvckNlbGxJdGVtKGl0ZW0ub3JpZ2luYWwhLnVyaSwgaXRlbS5tb2RpZmllZCEudXJpLCBpdGVtLnR5cGUsIGl0ZW0udHlwZSkpO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsTWV0YWRhdGEgPSBDZWxsVXJpLmdlbmVyYXRlQ2VsbFByb3BlcnR5VXJpKG9yaWdpbmFsU291cmNlVXJpLCBpdGVtLm9yaWdpbmFsIS5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEpO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkTWV0YWRhdGEgPSBDZWxsVXJpLmdlbmVyYXRlQ2VsbFByb3BlcnR5VXJpKG1vZGlmaWVkU291cmNlVXJpLCBpdGVtLm1vZGlmaWVkIS5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEpO1xuXHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckl0ZW1zLnB1c2gobmV3IE5vdGVib29rTXVsdGlEaWZmRWRpdG9yTWV0YWRhdGFJdGVtKG9yaWdpbmFsTWV0YWRhdGEsIG1vZGlmaWVkTWV0YWRhdGEsIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxPdXRwdXQgPSBDZWxsVXJpLmdlbmVyYXRlQ2VsbFByb3BlcnR5VXJpKG9yaWdpbmFsU291cmNlVXJpLCBpdGVtLm9yaWdpbmFsIS5oYW5kbGUsIFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0KTtcblx0XHRcdFx0XHRjb25zdCBtb2RpZmllZE91dHB1dCA9IENlbGxVcmkuZ2VuZXJhdGVDZWxsUHJvcGVydHlVcmkobW9kaWZpZWRTb3VyY2VVcmksIGl0ZW0ubW9kaWZpZWQhLmhhbmRsZSwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQpO1xuXHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckl0ZW1zLnB1c2gobmV3IE5vdGVib29rTXVsdGlEaWZmRWRpdG9yT3V0cHV0SXRlbShvcmlnaW5hbE91dHB1dCwgbW9kaWZpZWRPdXRwdXQsIGl0ZW0udHlwZSwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVmlld01vZGVscyhjZWxsRGlmZkluZm86IENlbGxEaWZmSW5mb1tdLCBtZXRhZGF0YUNoYW5nZWQ6IGJvb2xlYW4sIGZpcnN0Q2hhbmdlSW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IGNlbGxWaWV3TW9kZWxzID0gYXdhaXQgdGhpcy5jcmVhdGVEaWZmVmlld01vZGVscyhjZWxsRGlmZkluZm8sIG1ldGFkYXRhQ2hhbmdlZCk7XG5cdFx0Y29uc3Qgb2xkTGVuZ3RoID0gdGhpcy5faXRlbXMubGVuZ3RoO1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pdGVtcy5zcGxpY2UoMCwgb2xkTGVuZ3RoKTtcblxuXHRcdGxldCBwbGFjZWhvbGRlcjogRGlmZkVsZW1lbnRQbGFjZWhvbGRlclZpZXdNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm9yaWdpbmFsQ2VsbFZpZXdNb2RlbHMgPSBjZWxsVmlld01vZGVscztcblx0XHRjZWxsVmlld01vZGVscy5mb3JFYWNoKCh2bSwgaW5kZXgpID0+IHtcblx0XHRcdGlmICh2bS50eXBlID09PSAndW5jaGFuZ2VkJyAmJiAhdGhpcy5leGNsdWRlVW5jaGFuZ2VkUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0aWYgKCFwbGFjZWhvbGRlcikge1xuXHRcdFx0XHRcdHZtLmRpc3BsYXlJY29uVG9IaWRlVW5tb2RpZmllZENlbGxzID0gdHJ1ZTtcblx0XHRcdFx0XHRwbGFjZWhvbGRlciA9IG5ldyBEaWZmRWxlbWVudFBsYWNlaG9sZGVyVmlld01vZGVsKHZtLm1haW5Eb2N1bWVudFRleHRNb2RlbCwgdm0uZWRpdG9yRXZlbnREaXNwYXRjaGVyLCB2bS5pbml0RGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5faXRlbXMucHVzaChwbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJJdGVtID0gcGxhY2Vob2xkZXI7XG5cblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChwbGFjZWhvbGRlckl0ZW0ub25VbmZvbGRIaWRkZW5DZWxscygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBoaWRkZW5DZWxsVmlld01vZGVscyA9IHRoaXMucGxhY2Vob2xkZXJBbmRSZWxhdGVkQ2VsbHMuZ2V0KHBsYWNlaG9sZGVySXRlbSk7XG5cdFx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoaGlkZGVuQ2VsbFZpZXdNb2RlbHMpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5faXRlbXMuaW5kZXhPZihwbGFjZWhvbGRlckl0ZW0pO1xuXHRcdFx0XHRcdFx0dGhpcy5faXRlbXMuc3BsaWNlKHN0YXJ0LCAxLCAuLi5oaWRkZW5DZWxsVmlld01vZGVscyk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoeyBzdGFydCwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBoaWRkZW5DZWxsVmlld01vZGVscyB9KTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodm0ub25IaWRlVW5jaGFuZ2VkQ2VsbHMoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaGlkZGVuQ2VsbFZpZXdNb2RlbHMgPSB0aGlzLnBsYWNlaG9sZGVyQW5kUmVsYXRlZENlbGxzLmdldChwbGFjZWhvbGRlckl0ZW0pO1xuXHRcdFx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGhpZGRlbkNlbGxWaWV3TW9kZWxzKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2l0ZW1zLmluZGV4T2Yodm0pO1xuXHRcdFx0XHRcdFx0dGhpcy5faXRlbXMuc3BsaWNlKHN0YXJ0LCBoaWRkZW5DZWxsVmlld01vZGVscy5sZW5ndGgsIHBsYWNlaG9sZGVySXRlbSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoeyBzdGFydCwgZGVsZXRlQ291bnQ6IGhpZGRlbkNlbGxWaWV3TW9kZWxzLmxlbmd0aCwgZWxlbWVudHM6IFtwbGFjZWhvbGRlckl0ZW1dIH0pO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoaWRkZW5DZWxsVmlld01vZGVscyA9IHRoaXMucGxhY2Vob2xkZXJBbmRSZWxhdGVkQ2VsbHMuZ2V0KHBsYWNlaG9sZGVyKSB8fCBbXTtcblx0XHRcdFx0aGlkZGVuQ2VsbFZpZXdNb2RlbHMucHVzaCh2bSk7XG5cdFx0XHRcdHRoaXMucGxhY2Vob2xkZXJBbmRSZWxhdGVkQ2VsbHMuc2V0KHBsYWNlaG9sZGVyLCBoaWRkZW5DZWxsVmlld01vZGVscyk7XG5cdFx0XHRcdHBsYWNlaG9sZGVyLmhpZGRlbkNlbGxzLnB1c2godm0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGxhY2Vob2xkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2l0ZW1zLnB1c2godm0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTm90ZSwgZW5zdXJlIGFsbCBvZiB0aGUgaGVpZ2h0IGNhbGN1bGF0aW9ucyBhcmUgZG9uZSBiZWZvcmUgZmlyaW5nIHRoZSBldmVudC5cblx0XHQvLyBUaGlzIGlzIHRvIGVuc3VyZSB0aGF0IHRoZSBkaWZmIGVkaXRvciBpcyBub3QgcmVzaXplZCBtdWx0aXBsZSB0aW1lcywgdGhlcmVieSBhdm9pZGluZyBmbGlja2VyaW5nLlxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZSh7IHN0YXJ0OiAwLCBkZWxldGVDb3VudDogb2xkTGVuZ3RoLCBlbGVtZW50czogdGhpcy5faXRlbXMsIGZpcnN0Q2hhbmdlSW5kZXggfSk7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVEaWZmVmlld01vZGVscyhjb21wdXRlZENlbGxEaWZmczogQ2VsbERpZmZJbmZvW10sIG1ldGFkYXRhQ2hhbmdlZDogYm9vbGVhbikge1xuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLm1vZGVsLm9yaWdpbmFsLm5vdGVib29rO1xuXHRcdGNvbnN0IG1vZGlmaWVkTW9kZWwgPSB0aGlzLm1vZGVsLm1vZGlmaWVkLm5vdGVib29rO1xuXHRcdGNvbnN0IGluaXREYXRhID0ge1xuXHRcdFx0bWV0YWRhdGFTdGF0dXNIZWlnaHQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmRpZmYuaWdub3JlTWV0YWRhdGEnKSA/IDAgOiAyNSxcblx0XHRcdG91dHB1dFN0YXR1c0hlaWdodDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignbm90ZWJvb2suZGlmZi5pZ25vcmVPdXRwdXRzJykgfHwgISEobW9kaWZpZWRNb2RlbC50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudE91dHB1dHMpID8gMCA6IDI1LFxuXHRcdFx0Zm9udEluZm86IHRoaXMuZm9udEluZm9cblx0XHR9O1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsczogKFNpbmdsZVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB8IFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB8IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVZpZXdNb2RlbClbXSA9IFtdO1xuXHRcdHRoaXMubm90ZWJvb2tNZXRhZGF0YVZpZXdNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFWaWV3TW9kZWwodGhpcy5tb2RlbC5vcmlnaW5hbC5ub3RlYm9vaywgdGhpcy5tb2RlbC5tb2RpZmllZC5ub3RlYm9vaywgbWV0YWRhdGFDaGFuZ2VkID8gJ21vZGlmaWVkTWV0YWRhdGEnIDogJ3VuY2hhbmdlZE1ldGFkYXRhJywgdGhpcy5ldmVudERpc3BhdGNoZXIsIGluaXREYXRhLCB0aGlzLm5vdGVib29rU2VydmljZSwgdGhpcy5kaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvcikpO1xuXHRcdGlmICghdGhpcy5pZ25vcmVNZXRhZGF0YSkge1xuXHRcdFx0aWYgKG1ldGFkYXRhQ2hhbmdlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm5vdGVib29rTWV0YWRhdGFWaWV3TW9kZWwuY29tcHV0ZUhlaWdodHMoKTtcblx0XHRcdH1cblx0XHRcdHZpZXdNb2RlbHMucHVzaCh0aGlzLm5vdGVib29rTWV0YWRhdGFWaWV3TW9kZWwpO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsVmlld01vZGVscyA9IGF3YWl0IFByb21pc2UuYWxsKGNvbXB1dGVkQ2VsbERpZmZzLm1hcChhc3luYyAoZGlmZikgPT4ge1xuXHRcdFx0c3dpdGNoIChkaWZmLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnZGVsZXRlJzoge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2luZ2xlU2lkZURpZmZFbGVtZW50Vmlld01vZGVsKFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxNb2RlbCxcblx0XHRcdFx0XHRcdG1vZGlmaWVkTW9kZWwsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbE1vZGVsLmNlbGxzW2RpZmYub3JpZ2luYWxDZWxsSW5kZXhdLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0J2RlbGV0ZScsXG5cdFx0XHRcdFx0XHR0aGlzLmV2ZW50RGlzcGF0Y2hlcixcblx0XHRcdFx0XHRcdGluaXREYXRhLFxuXHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va1NlcnZpY2UsXG5cdFx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvcixcblx0XHRcdFx0XHRcdGRpZmYub3JpZ2luYWxDZWxsSW5kZXhcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2luc2VydCc6IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNpbmdsZVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbChcblx0XHRcdFx0XHRcdG1vZGlmaWVkTW9kZWwsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbE1vZGVsLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRNb2RlbC5jZWxsc1tkaWZmLm1vZGlmaWVkQ2VsbEluZGV4XSxcblx0XHRcdFx0XHRcdCdpbnNlcnQnLFxuXHRcdFx0XHRcdFx0dGhpcy5ldmVudERpc3BhdGNoZXIsXG5cdFx0XHRcdFx0XHRpbml0RGF0YSxcblx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3IsXG5cdFx0XHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdtb2RpZmllZCc6IHtcblx0XHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBuZXcgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKFxuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbC5tb2RpZmllZC5ub3RlYm9vayxcblx0XHRcdFx0XHRcdHRoaXMubW9kZWwub3JpZ2luYWwubm90ZWJvb2ssXG5cdFx0XHRcdFx0XHRvcmlnaW5hbE1vZGVsLmNlbGxzW2RpZmYub3JpZ2luYWxDZWxsSW5kZXhdLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRNb2RlbC5jZWxsc1tkaWZmLm1vZGlmaWVkQ2VsbEluZGV4XSxcblx0XHRcdFx0XHRcdCdtb2RpZmllZCcsXG5cdFx0XHRcdFx0XHR0aGlzLmV2ZW50RGlzcGF0Y2hlcixcblx0XHRcdFx0XHRcdGluaXREYXRhLFxuXHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va1NlcnZpY2UsXG5cdFx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdFx0ZGlmZi5vcmlnaW5hbENlbGxJbmRleCxcblx0XHRcdFx0XHRcdHRoaXMuZGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3Jcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdC8vIFJlZHVjZXMgZmxpY2tlciAoY29tcHV0ZSB0aGlzIGJlZm9yZSBzZXR0aW5nIHRoZSBtb2RlbClcblx0XHRcdFx0XHQvLyBFbHNlIHdoZW4gdGhlIG1vZGVsIGlzIHNldCwgdGhlIGhlaWdodCBvZiB0aGUgZWRpdG9yIHdpbGwgYmUgeCwgYWZ0ZXIgZGlmZiBpcyBjb21wdXRlZCwgdGhlbiBoZWlnaHQgd2lsbCBiZSB5LlxuXHRcdFx0XHRcdC8vICYgdGhhdCByZXN1bHRzIGluIGZsaWNrZXIuXG5cdFx0XHRcdFx0YXdhaXQgdmlld01vZGVsLmNvbXB1dGVFZGl0b3JIZWlnaHRzKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHZpZXdNb2RlbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICd1bmNoYW5nZWQnOiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwoXG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsLm1vZGlmaWVkLm5vdGVib29rLFxuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbC5vcmlnaW5hbC5ub3RlYm9vayxcblx0XHRcdFx0XHRcdG9yaWdpbmFsTW9kZWwuY2VsbHNbZGlmZi5vcmlnaW5hbENlbGxJbmRleF0sXG5cdFx0XHRcdFx0XHRtb2RpZmllZE1vZGVsLmNlbGxzW2RpZmYubW9kaWZpZWRDZWxsSW5kZXhdLFxuXHRcdFx0XHRcdFx0J3VuY2hhbmdlZCcsIHRoaXMuZXZlbnREaXNwYXRjaGVyLFxuXHRcdFx0XHRcdFx0aW5pdERhdGEsXG5cdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0XHRkaWZmLm9yaWdpbmFsQ2VsbEluZGV4LFxuXHRcdFx0XHRcdFx0dGhpcy5kaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjZWxsVmlld01vZGVscy5mb3JFYWNoKHZtID0+IHZpZXdNb2RlbHMucHVzaCh2bSkpO1xuXG5cdFx0cmV0dXJuIHZpZXdNb2RlbHM7XG5cdH1cblxufVxuXG5cbi8qKlxuICogbWFraW5nIHN1cmUgdGhhdCBzd2FwcGluZyBjZWxscyBhcmUgYWx3YXlzIHRyYW5zbGF0ZWQgdG8gYGluc2VydCtkZWxldGVgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldHR5Q2hhbmdlcyhvcmlnaW5hbDogTm90ZWJvb2tUZXh0TW9kZWwsIG1vZGlmaWVkOiBOb3RlYm9va1RleHRNb2RlbCwgZGlmZlJlc3VsdDogSURpZmZSZXN1bHQpIHtcblx0Y29uc3QgY2hhbmdlcyA9IGRpZmZSZXN1bHQuY2hhbmdlcztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0Ly8gdGhlbiB3ZSBrbm93IHRoZXJlIGlzIGFub3RoZXIgY2hhbmdlIGFmdGVyIGN1cnJlbnQgb25lXG5cdFx0Y29uc3QgY3VyciA9IGNoYW5nZXNbaV07XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNbaSArIDFdO1xuXHRcdGNvbnN0IHggPSBjdXJyLm9yaWdpbmFsU3RhcnQ7XG5cdFx0Y29uc3QgeSA9IGN1cnIubW9kaWZpZWRTdGFydDtcblxuXHRcdGlmIChcblx0XHRcdGN1cnIub3JpZ2luYWxMZW5ndGggPT09IDFcblx0XHRcdCYmIGN1cnIubW9kaWZpZWRMZW5ndGggPT09IDBcblx0XHRcdCYmIG5leHQub3JpZ2luYWxTdGFydCA9PT0geCArIDJcblx0XHRcdCYmIG5leHQub3JpZ2luYWxMZW5ndGggPT09IDBcblx0XHRcdCYmIG5leHQubW9kaWZpZWRTdGFydCA9PT0geSArIDFcblx0XHRcdCYmIG5leHQubW9kaWZpZWRMZW5ndGggPT09IDFcblx0XHRcdCYmIG9yaWdpbmFsLmNlbGxzW3hdLmdldEhhc2hWYWx1ZSgpID09PSBtb2RpZmllZC5jZWxsc1t5ICsgMV0uZ2V0SGFzaFZhbHVlKClcblx0XHRcdCYmIG9yaWdpbmFsLmNlbGxzW3ggKyAxXS5nZXRIYXNoVmFsdWUoKSA9PT0gbW9kaWZpZWQuY2VsbHNbeV0uZ2V0SGFzaFZhbHVlKClcblx0XHQpIHtcblx0XHRcdC8vIHRoaXMgaXMgYSBzd2FwXG5cdFx0XHRjdXJyLm9yaWdpbmFsU3RhcnQgPSB4O1xuXHRcdFx0Y3Vyci5vcmlnaW5hbExlbmd0aCA9IDA7XG5cdFx0XHRjdXJyLm1vZGlmaWVkU3RhcnQgPSB5O1xuXHRcdFx0Y3Vyci5tb2RpZmllZExlbmd0aCA9IDE7XG5cblx0XHRcdG5leHQub3JpZ2luYWxTdGFydCA9IHggKyAxO1xuXHRcdFx0bmV4dC5vcmlnaW5hbExlbmd0aCA9IDE7XG5cdFx0XHRuZXh0Lm1vZGlmaWVkU3RhcnQgPSB5ICsgMjtcblx0XHRcdG5leHQubW9kaWZpZWRMZW5ndGggPSAwO1xuXG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCB0eXBlIENlbGxEaWZmSW5mbyA9IHtcblx0b3JpZ2luYWxDZWxsSW5kZXg6IG51bWJlcjtcblx0bW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlcjtcblx0dHlwZTogJ3VuY2hhbmdlZCcgfCAnbW9kaWZpZWQnO1xufSB8XG57XG5cdG9yaWdpbmFsQ2VsbEluZGV4OiBudW1iZXI7XG5cdHR5cGU6ICdkZWxldGUnO1xufSB8XG57XG5cdG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXI7XG5cdHR5cGU6ICdpbnNlcnQnO1xufTtcblxuZnVuY3Rpb24gaXNFcXVhbChjZWxsRGlmZkluZm86IENlbGxEaWZmSW5mb1tdLCB2aWV3TW9kZWxzOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlW10sIG1vZGVsOiBJTm90ZWJvb2tEaWZmRWRpdG9yTW9kZWwpIHtcblx0aWYgKGNlbGxEaWZmSW5mby5sZW5ndGggIT09IHZpZXdNb2RlbHMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSBtb2RlbC5vcmlnaW5hbC5ub3RlYm9vaztcblx0Y29uc3QgbW9kaWZpZWRNb2RlbCA9IG1vZGVsLm1vZGlmaWVkLm5vdGVib29rO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdNb2RlbHMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBhID0gY2VsbERpZmZJbmZvW2ldO1xuXHRcdGNvbnN0IGIgPSB2aWV3TW9kZWxzW2ldO1xuXHRcdGlmIChhLnR5cGUgIT09IGIudHlwZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGEudHlwZSkge1xuXHRcdFx0Y2FzZSAnZGVsZXRlJzoge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxNb2RlbC5jZWxsc1thLm9yaWdpbmFsQ2VsbEluZGV4XS5oYW5kbGUgIT09IGIub3JpZ2luYWw/LmhhbmRsZSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2luc2VydCc6IHtcblx0XHRcdFx0aWYgKG1vZGlmaWVkTW9kZWwuY2VsbHNbYS5tb2RpZmllZENlbGxJbmRleF0uaGFuZGxlICE9PSBiLm1vZGlmaWVkPy5oYW5kbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGlmIChvcmlnaW5hbE1vZGVsLmNlbGxzW2Eub3JpZ2luYWxDZWxsSW5kZXhdLmhhbmRsZSAhPT0gYi5vcmlnaW5hbD8uaGFuZGxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RpZmllZE1vZGVsLmNlbGxzW2EubW9kaWZpZWRDZWxsSW5kZXhdLmhhbmRsZSAhPT0gYi5tb2RpZmllZD8uaGFuZGxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySXRlbSBleHRlbmRzIE11bHRpRGlmZkVkaXRvckl0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdG1vZGlmaWVkVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0Z29Ub0ZpbGVVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdHlwZTogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZVsndHlwZSddLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250YWluZXJUeXBlOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlWyd0eXBlJ10sXG5cdFx0cHVibGljIGtpbmQ6ICdDZWxsJyB8ICdNZXRhZGF0YScgfCAnT3V0cHV0Jyxcblx0XHRjb250ZXh0S2V5cz86IFJlY29yZDxzdHJpbmcsIENvbnRleHRLZXlWYWx1ZT4sXG5cdCkge1xuXHRcdHN1cGVyKG9yaWdpbmFsVXJpLCBtb2RpZmllZFVyaSwgZ29Ub0ZpbGVVcmksIHVuZGVmaW5lZCwgY29udGV4dEtleXMpO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rTXVsdGlEaWZmRWRpdG9yQ2VsbEl0ZW0gZXh0ZW5kcyBOb3RlYm9va011bHRpRGlmZkVkaXRvckl0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdG1vZGlmaWVkVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0dHlwZTogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZVsndHlwZSddLFxuXHRcdGNvbnRhaW5lclR5cGU6IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2VbJ3R5cGUnXSxcblx0KSB7XG5cdFx0c3VwZXIob3JpZ2luYWxVcmksIG1vZGlmaWVkVXJpLCBtb2RpZmllZFVyaSB8fCBvcmlnaW5hbFVyaSwgdHlwZSwgY29udGFpbmVyVHlwZSwgJ0NlbGwnLCB7XG5cdFx0XHRbTk9URUJPT0tfRElGRl9JVEVNX0tJTkQua2V5XTogJ0NlbGwnLFxuXHRcdFx0W05PVEVCT09LX0RJRkZfSVRFTV9ESUZGX1NUQVRFLmtleV06IHR5cGVcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va011bHRpRGlmZkVkaXRvck1ldGFkYXRhSXRlbSBleHRlbmRzIE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9yaWdpbmFsVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0bW9kaWZpZWRVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHR0eXBlOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlWyd0eXBlJ10sXG5cdFx0Y29udGFpbmVyVHlwZTogSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZVsndHlwZSddLFxuXHQpIHtcblx0XHRzdXBlcihvcmlnaW5hbFVyaSwgbW9kaWZpZWRVcmksIG1vZGlmaWVkVXJpIHx8IG9yaWdpbmFsVXJpLCB0eXBlLCBjb250YWluZXJUeXBlLCAnTWV0YWRhdGEnLCB7XG5cdFx0XHRbTk9URUJPT0tfRElGRl9JVEVNX0tJTkQua2V5XTogJ01ldGFkYXRhJyxcblx0XHRcdFtOT1RFQk9PS19ESUZGX0lURU1fRElGRl9TVEFURS5rZXldOiB0eXBlXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JPdXRwdXRJdGVtIGV4dGVuZHMgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0b3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRtb2RpZmllZFVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHR5cGU6IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2VbJ3R5cGUnXSxcblx0XHRjb250YWluZXJUeXBlOiBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlWyd0eXBlJ10sXG5cdCkge1xuXHRcdHN1cGVyKG9yaWdpbmFsVXJpLCBtb2RpZmllZFVyaSwgbW9kaWZpZWRVcmkgfHwgb3JpZ2luYWxVcmksIHR5cGUsIGNvbnRhaW5lclR5cGUsICdPdXRwdXQnLCB7XG5cdFx0XHRbTk9URUJPT0tfRElGRl9JVEVNX0tJTkQua2V5XTogJ091dHB1dCcsXG5cdFx0XHRbTk9URUJPT0tfRElGRl9JVEVNX0RJRkZfU1RBVEUua2V5XTogdHlwZVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLGVBQTJDO0FBQ3BELFNBQVMsWUFBWSxpQkFBaUIsZUFBZTtBQUNyRCxTQUFTLGVBQWU7QUFLeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBdUMsaUNBQTRELG1DQUFtQyxnQ0FBZ0Msc0NBQXNDO0FBRTVNLFNBQW9FLCtCQUErQiwrQkFBK0I7QUFFbEks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
