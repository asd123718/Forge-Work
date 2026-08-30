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
import { ActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, debouncedObservable, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { basename } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LineRange } from "../../../../../../editor/common/core/ranges/lineRange.js";
import { nullDocumentDiff } from "../../../../../../editor/common/diff/documentDiffProvider.js";
import { PrefixSumComputer } from "../../../../../../editor/common/model/prefixSumComputer.js";
import { localize } from "../../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { NotebookDeletedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js";
import { NotebookInsertedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js";
import { NotebookModifiedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookModifiedCellDecorator.js";
import { CellEditState, getNotebookEditorFromEditorPane } from "../../../../notebook/browser/notebookBrowser.js";
import { INotebookEditorService } from "../../../../notebook/browser/services/notebookEditorService.js";
import { CellKind } from "../../../../notebook/common/notebookCommon.js";
import { ChatEditingCodeEditorIntegration } from "../chatEditingCodeEditorIntegration.js";
import { countChanges, sortCellChanges } from "./notebookCellChanges.js";
import { OverlayToolbarDecorator } from "./overlayToolbarDecorator.js";
let ChatEditingNotebookEditorIntegration = class extends Disposable {
  constructor(_entry, editor, notebookModel, originalModel, cellChanges, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    const notebookEditor = getNotebookEditorFromEditorPane(editor);
    assertType(notebookEditor);
    this.notebookEditor = notebookEditor;
    this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
    this._register(editor.onDidChangeControl(() => {
      const notebookEditor2 = getNotebookEditorFromEditorPane(editor);
      if (notebookEditor2 && notebookEditor2 !== this.notebookEditor) {
        this.notebookEditor = notebookEditor2;
        this.integration.dispose();
        this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor2, notebookModel, originalModel, cellChanges);
      }
    }));
  }
  get currentIndex() {
    return this.integration.currentIndex;
  }
  reveal(firstOrLast) {
    return this.integration.reveal(firstOrLast);
  }
  next(wrap) {
    return this.integration.next(wrap);
  }
  previous(wrap) {
    return this.integration.previous(wrap);
  }
  enableAccessibleDiffView() {
    this.integration.enableAccessibleDiffView();
  }
  acceptNearestChange(change) {
    return this.integration.acceptNearestChange(change);
  }
  rejectNearestChange(change) {
    return this.integration.rejectNearestChange(change);
  }
  toggleDiff(change, show) {
    return this.integration.toggleDiff(change, show);
  }
  dispose() {
    this.integration.dispose();
    super.dispose();
  }
};
ChatEditingNotebookEditorIntegration = __decorateClass([
  __decorateParam(5, IInstantiationService)
], ChatEditingNotebookEditorIntegration);
let ChatEditingNotebookEditorWidgetIntegration = class extends Disposable {
  constructor(_entry, notebookEditor, notebookModel, originalModel, cellChanges, instantiationService, _editorService, notebookEditorService, accessibilitySignalService, logService) {
    super();
    this._entry = _entry;
    this.notebookEditor = notebookEditor;
    this.notebookModel = notebookModel;
    this.cellChanges = cellChanges;
    this.instantiationService = instantiationService;
    this._editorService = _editorService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.logService = logService;
    this._currentIndex = observableValue(this, -1);
    this.currentIndex = this._currentIndex;
    this.cellEditorIntegrations = /* @__PURE__ */ new Map();
    this.markdownEditState = observableValue(this, "");
    this.markupCellListeners = /* @__PURE__ */ new Map();
    this.sortedCellChanges = [];
    this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(0));
    const onDidChangeVisibleRanges = debouncedObservable(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 50);
    this._register(toDisposable(() => {
      this.markupCellListeners.forEach((v) => v.dispose());
    }));
    let originalReadonly = void 0;
    const shouldBeReadonly = _entry.isCurrentlyBeingModifiedBy.map((value) => !!value);
    this._register(autorun((r) => {
      const isReadOnly = shouldBeReadonly.read(r);
      const notebookEditor2 = notebookEditorService.retrieveExistingWidgetFromURI(_entry.modifiedURI)?.value;
      if (!notebookEditor2) {
        return;
      }
      if (isReadOnly) {
        originalReadonly ??= notebookEditor2.isReadOnly;
        notebookEditor2.setOptions({ isReadOnly: true });
      } else if (originalReadonly === false) {
        notebookEditor2.setOptions({ isReadOnly: false });
        const timeout = setTimeout(() => {
          notebookEditor2.setOptions({ isReadOnly: true });
          notebookEditor2.setOptions({ isReadOnly: false });
          disposable.dispose();
        }, 100);
        const disposable = toDisposable(() => clearTimeout(timeout));
        r.store.add(disposable);
      }
    }));
    let lastModifyingRequestId;
    this._store.add(autorun((r) => {
      if (!_entry.isCurrentlyBeingModifiedBy.read(r) && !_entry.isProcessingResponse.read(r) && lastModifyingRequestId !== _entry.lastModifyingRequestId && cellChanges.read(r).some((c) => c.type !== "unchanged" && !c.diff.read(r).identical)) {
        lastModifyingRequestId = _entry.lastModifyingRequestId;
        const visibleChange = this.sortedCellChanges.find((c) => {
          if (c.type === "unchanged") {
            return false;
          }
          const index = c.modifiedCellIndex ?? c.originalCellIndex;
          return this.notebookEditor.visibleRanges.some((range) => index >= range.start && index < range.end);
        });
        if (!visibleChange) {
          this.reveal(true);
        }
      }
    }));
    this._register(autorun((r) => {
      this.sortedCellChanges = sortCellChanges(cellChanges.read(r));
      const indexes = [];
      for (const change of this.sortedCellChanges) {
        indexes.push(change.type === "insert" || change.type === "delete" ? 1 : change.type === "modified" ? change.diff.read(r).changes.length : 0);
      }
      this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(indexes));
      if (this.changeIndexComputer.getTotalSum() === 0) {
        this.revertMarkupCellState();
      }
    }));
    this._register(autorun((r) => {
      if (this.notebookEditor.textModel !== this.notebookModel) {
        return;
      }
      const sortedCellChanges = sortCellChanges(cellChanges.read(r));
      const changes = sortedCellChanges.filter((c) => c.type !== "delete");
      onDidChangeVisibleRanges.read(r);
      if (!changes.length) {
        this.cellEditorIntegrations.forEach(({ diff }) => {
          diff.set({ ...diff.read(void 0), ...nullDocumentDiff }, void 0);
        });
        return;
      }
      this.markdownEditState.read(r);
      const validCells = /* @__PURE__ */ new Set();
      changes.forEach((change) => {
        if (change.modifiedCellIndex === void 0 || change.modifiedCellIndex >= notebookModel.cells.length) {
          return;
        }
        const cell = notebookModel.cells[change.modifiedCellIndex];
        const editor = notebookEditor.codeEditors.find(([vm]) => vm.handle === notebookModel.cells[change.modifiedCellIndex].handle)?.[1];
        const modifiedModel = change.modifiedModel.promiseResult.read(r)?.data;
        const originalModel2 = change.originalModel.promiseResult.read(r)?.data;
        if (!cell || !originalModel2 || !modifiedModel) {
          return;
        }
        if (cell.cellKind === CellKind.Markup && !this.markupCellListeners.has(cell.handle)) {
          const cellModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
          if (cellModel) {
            const listener = cellModel.onDidChangeState((e) => {
              if (e.editStateChanged) {
                setTimeout(() => this.markdownEditState.set(cellModel.handle + "-" + cellModel.getEditState(), void 0), 0);
              }
            });
            this.markupCellListeners.set(cell.handle, listener);
          }
        }
        if (!editor) {
          return;
        }
        const diff = {
          ...change.diff.read(r),
          modifiedModel,
          originalModel: originalModel2,
          keep: change.keep,
          undo: change.undo
        };
        validCells.add(cell);
        const currentDiff = this.cellEditorIntegrations.get(cell);
        if (currentDiff) {
          if (!areDocumentDiff2Equal(currentDiff.diff.read(void 0), diff)) {
            currentDiff.diff.set(diff, void 0);
          }
        } else {
          const diff2 = observableValue(`diff${cell.handle}`, diff);
          const integration = this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, _entry, editor, diff2, true);
          this.cellEditorIntegrations.set(cell, { integration, diff: diff2 });
          this._register(integration);
          this._register(editor.onDidDispose(() => {
            this.cellEditorIntegrations.get(cell)?.integration.dispose();
            this.cellEditorIntegrations.delete(cell);
          }));
          this._register(editor.onDidChangeModel(() => {
            if (editor.getModel() !== cell.textModel) {
              this.cellEditorIntegrations.get(cell)?.integration.dispose();
              this.cellEditorIntegrations.delete(cell);
            }
          }));
        }
      });
      this.cellEditorIntegrations.forEach((v, cell) => {
        if (!validCells.has(cell)) {
          v.integration.dispose();
          this.cellEditorIntegrations.delete(cell);
        }
      });
    }));
    const cellsAreVisible = onDidChangeVisibleRanges.map((v) => v.length > 0);
    const debouncedChanges = debouncedObservable(cellChanges, 10);
    this._register(autorun((r) => {
      if (this.notebookEditor.textModel !== this.notebookModel || !cellsAreVisible.read(r) || !this.notebookEditor.getViewModel()) {
        return;
      }
      const changes = debouncedChanges.read(r).filter((c) => c.type === "insert" ? !c.diff.read(r).identical : true);
      const modifiedChanges = changes.filter((c) => c.type === "modified");
      this.createDecorators();
      if (changes.every((c) => c.type === "insert")) {
        this.insertedCellDecorator?.apply([]);
        this.modifiedCellDecorator?.apply([]);
        this.deletedCellDecorator?.apply([], originalModel);
        this.overlayToolbarDecorator?.decorate([]);
      } else {
        this.insertedCellDecorator?.apply(changes);
        this.modifiedCellDecorator?.apply(modifiedChanges);
        this.deletedCellDecorator?.apply(changes, originalModel);
        this.overlayToolbarDecorator?.decorate(changes.filter((c) => c.type === "insert" || c.type === "modified"));
      }
    }));
  }
  getCurrentChange() {
    const currentIndex = Math.min(this._currentIndex.get(), this.changeIndexComputer.getTotalSum() - 1);
    const index = this.changeIndexComputer.getIndexOf(currentIndex);
    const change = this.sortedCellChanges[index.index];
    return change ? { change, index: index.remainder } : void 0;
  }
  updateCurrentIndex(change, indexInCell = 0) {
    const index = this.sortedCellChanges.indexOf(change);
    const changeIndex = this.changeIndexComputer.getPrefixSum(index - 1);
    const currentIndex = Math.min(changeIndex + indexInCell, this.changeIndexComputer.getTotalSum() - 1);
    this._currentIndex.set(currentIndex, void 0);
  }
  createDecorators() {
    const cellChanges = this.cellChanges.get();
    const accessibilitySignalService = this.accessibilitySignalService;
    this.insertedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
    this.modifiedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookModifiedCellDecorator, this.notebookEditor));
    this.overlayToolbarDecorator ??= this._register(this.instantiationService.createInstance(OverlayToolbarDecorator, this.notebookEditor, this.notebookModel));
    if (this.deletedCellDecorator) {
      this._store.delete(this.deletedCellDecorator);
      this.deletedCellDecorator.dispose();
    }
    this.deletedCellDecorator = this._register(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, {
      className: "chat-diff-change-content-widget",
      telemetrySource: "chatEditingNotebookHunk",
      menuId: MenuId.ChatEditingEditorHunk,
      actionViewItemProvider: (action, options) => {
        if (!action.class) {
          return new class extends ActionViewItem {
            constructor() {
              super(void 0, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
            }
          }();
        }
        return void 0;
      },
      argFactory: (deletedCellIndex) => {
        return {
          accept() {
            const entry = cellChanges.find((c) => c.type === "delete" && c.originalCellIndex === deletedCellIndex);
            if (entry) {
              return entry.keep(entry.diff.get().changes[0]);
            }
            accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
            return Promise.resolve(true);
          },
          reject() {
            const entry = cellChanges.find((c) => c.type === "delete" && c.originalCellIndex === deletedCellIndex);
            if (entry) {
              return entry.undo(entry.diff.get().changes[0]);
            }
            accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
            return Promise.resolve(true);
          }
        };
      }
    }));
  }
  getCell(modifiedCellIndex) {
    const cell = this.notebookModel.cells[modifiedCellIndex];
    const integration = this.cellEditorIntegrations.get(cell)?.integration;
    return integration;
  }
  reveal(firstOrLast) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    if (!changes.length) {
      return;
    }
    const change = firstOrLast ? changes[0] : changes[changes.length - 1];
    this._revealFirstOrLast(change, firstOrLast);
  }
  _revealFirstOrLast(change, firstOrLast = true) {
    switch (change.type) {
      case "insert":
      case "modified": {
        this.blur(this.getCurrentChange()?.change);
        const index = firstOrLast || change.type === "insert" ? 0 : change.diff.get().changes.length - 1;
        return this._revealChange(change, index);
      }
      case "delete":
        this.blur(this.getCurrentChange()?.change);
        this.deletedCellDecorator?.reveal(change.originalCellIndex);
        this.updateCurrentIndex(change);
        return true;
      default:
        break;
    }
    return false;
  }
  _revealChange(change, indexInCell) {
    switch (change.type) {
      case "insert":
      case "modified": {
        const textChange = change.diff.get().changes[indexInCell];
        const cellViewModel = this.getCellViewModel(change);
        if (cellViewModel) {
          this.updateCurrentIndex(change, indexInCell);
          this.revealChangeInView(cellViewModel, textChange?.modified, change).catch((err) => {
            this.logService.warn(`Error revealing change in view: ${err}`);
          });
          return true;
        }
        break;
      }
      case "delete":
        this.updateCurrentIndex(change);
        this.deletedCellDecorator?.reveal(change.originalCellIndex);
        return true;
      default:
        break;
    }
    return false;
  }
  getCellViewModel(change) {
    if (change.type === "delete" || change.modifiedCellIndex === void 0 || change.modifiedCellIndex >= this.notebookModel.cells.length) {
      return void 0;
    }
    const cell = this.notebookModel.cells[change.modifiedCellIndex];
    const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
    return cellViewModel;
  }
  async revealChangeInView(cell, lines, change) {
    const targetLines = lines ?? new LineRange(0, 0);
    if (change.type === "modified" && cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
      cell.updateEditState(CellEditState.Editing, "chatEditNavigation");
    }
    const focusTarget = cell.cellKind === CellKind.Code || change.type === "modified" ? "editor" : "container";
    await this.notebookEditor.focusNotebookCell(cell, focusTarget, { focusEditorLine: targetLines.startLineNumber });
    await this.notebookEditor.revealRangeInCenterAsync(cell, new Range(targetLines.startLineNumber, 0, targetLines.endLineNumberExclusive, 0));
  }
  revertMarkupCellState() {
    for (const change of this.sortedCellChanges) {
      const cellViewModel = this.getCellViewModel(change);
      if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && (cellViewModel.editStateSource === "chatEditNavigation" || cellViewModel.editStateSource === "chatEdit")) {
        cellViewModel.updateEditState(CellEditState.Preview, "chatEdit");
      }
    }
  }
  blur(change) {
    if (!change) {
      return;
    }
    const cellViewModel = this.getCellViewModel(change);
    if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && cellViewModel.editStateSource === "chatEditNavigation") {
      cellViewModel.updateEditState(CellEditState.Preview, "chatEditNavigation");
    }
  }
  next(wrap) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    const currentChange = this.getCurrentChange();
    if (!currentChange) {
      const firstChange = changes[0];
      if (firstChange) {
        return this._revealFirstOrLast(firstChange);
      }
      return false;
    }
    switch (currentChange.change.type) {
      case "modified":
        {
          const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
          if (cellIntegration) {
            if (cellIntegration.next(false)) {
              this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
              return true;
            }
          }
          const isLastChangeInCell = currentChange.index >= lastChangeIndex(currentChange.change);
          const index = isLastChangeInCell ? 0 : currentChange.index + 1;
          const change = isLastChangeInCell ? changes[changes.indexOf(currentChange.change) + 1] : currentChange.change;
          if (change) {
            if (isLastChangeInCell) {
              this.blur(currentChange.change);
            }
            if (this._revealChange(change, index)) {
              return true;
            }
          }
        }
        break;
      case "insert":
      case "delete":
        {
          this.blur(currentChange.change);
          const nextChange = changes[changes.indexOf(currentChange.change) + 1];
          if (nextChange && this._revealFirstOrLast(nextChange, true)) {
            return true;
          }
        }
        break;
      default:
        break;
    }
    if (wrap) {
      const firstChange = changes[0];
      if (firstChange) {
        return this._revealFirstOrLast(firstChange, true);
      }
    }
    return false;
  }
  previous(wrap) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    const currentChange = this.getCurrentChange();
    if (!currentChange) {
      const lastChange = changes[changes.length - 1];
      if (lastChange) {
        return this._revealFirstOrLast(lastChange, false);
      }
      return false;
    }
    switch (currentChange.change.type) {
      case "modified":
        {
          const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
          if (cellIntegration) {
            if (cellIntegration.previous(false)) {
              this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
              return true;
            }
          }
          const isFirstChangeInCell = currentChange.index <= 0;
          const change = isFirstChangeInCell ? changes[changes.indexOf(currentChange.change) - 1] : currentChange.change;
          if (change) {
            const index = isFirstChangeInCell ? lastChangeIndex(change) : currentChange.index - 1;
            if (isFirstChangeInCell) {
              this.blur(currentChange.change);
            }
            if (this._revealChange(change, index)) {
              return true;
            }
          }
        }
        break;
      case "insert":
      case "delete":
        {
          this.blur(currentChange.change);
          const prevChange = changes[changes.indexOf(currentChange.change) - 1];
          if (prevChange && this._revealFirstOrLast(prevChange, false)) {
            return true;
          }
        }
        break;
      default:
        break;
    }
    if (wrap) {
      const lastChange = changes[changes.length - 1];
      if (lastChange) {
        return this._revealFirstOrLast(lastChange, false);
      }
    }
    return false;
  }
  enableAccessibleDiffView() {
    const cell = this.notebookEditor.getActiveCell()?.model;
    if (cell) {
      const integration = this.cellEditorIntegrations.get(cell)?.integration;
      integration?.enableAccessibleDiffView();
    }
  }
  getfocusedIntegration() {
    const first = this.notebookEditor.getSelectionViewModels()[0];
    if (first) {
      return this.cellEditorIntegrations.get(first.model)?.integration;
    }
    return void 0;
  }
  async acceptNearestChange(hunk) {
    if (hunk) {
      await hunk.accept();
    } else {
      const current = this.getCurrentChange();
      const focused = this.getfocusedIntegration();
      if (current && !focused || current?.change.type === "delete") {
        current.change.keep(current?.change.diff.get().changes[current.index]);
      } else if (focused) {
        await focused.acceptNearestChange();
      }
      this._currentIndex.set(this._currentIndex.get() - 1, void 0);
      this.next(true);
    }
  }
  async rejectNearestChange(hunk) {
    if (hunk) {
      await hunk.reject();
    } else {
      const current = this.getCurrentChange();
      const focused = this.getfocusedIntegration();
      if (current && !focused || current?.change.type === "delete") {
        current.change.undo(current.change.diff.get().changes[current.index]);
      } else if (focused) {
        await focused.rejectNearestChange();
      }
      this._currentIndex.set(this._currentIndex.get() - 1, void 0);
      this.next(true);
    }
  }
  async toggleDiff(_change, _show) {
    const diffInput = {
      original: { resource: this._entry.originalURI },
      modified: { resource: this._entry.modifiedURI },
      label: localize("diff.generic", "{0} (changes from chat)", basename(this._entry.modifiedURI))
    };
    await this._editorService.openEditor(diffInput);
  }
};
ChatEditingNotebookEditorWidgetIntegration = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, INotebookEditorService),
  __decorateParam(8, IAccessibilitySignalService),
  __decorateParam(9, ILogService)
], ChatEditingNotebookEditorWidgetIntegration);
class ChatEditingNotebookDiffEditorIntegration extends Disposable {
  constructor(notebookDiffEditor, cellChanges) {
    super();
    this.notebookDiffEditor = notebookDiffEditor;
    this.cellChanges = cellChanges;
    this._currentIndex = observableValue(this, -1);
    this.currentIndex = this._currentIndex;
    this._store.add(autorun((r) => {
      const index = notebookDiffEditor.currentChangedIndex.read(r);
      const numberOfCellChanges = cellChanges.read(r).filter((c) => !c.diff.read(r).identical);
      if (numberOfCellChanges.length && index >= 0 && index < numberOfCellChanges.length) {
        const changesSoFar = countChanges(numberOfCellChanges.slice(0, index + 1));
        this._currentIndex.set(changesSoFar - 1, void 0);
      } else {
        this._currentIndex.set(-1, void 0);
      }
    }));
  }
  reveal(firstOrLast) {
    const changes = sortCellChanges(this.cellChanges.get().filter((c) => c.type !== "unchanged"));
    if (!changes.length) {
      return void 0;
    }
    if (firstOrLast) {
      this.notebookDiffEditor.firstChange();
    } else {
      this.notebookDiffEditor.lastChange();
    }
  }
  next(_wrap) {
    const changes = this.cellChanges.get().filter((c) => !c.diff.get().identical).length;
    if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
      return false;
    }
    this.notebookDiffEditor.nextChange();
    return true;
  }
  previous(_wrap) {
    const changes = this.cellChanges.get().filter((c) => !c.diff.get().identical).length;
    if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
      return false;
    }
    this.notebookDiffEditor.nextChange();
    return true;
  }
  enableAccessibleDiffView() {
  }
  async acceptNearestChange(change) {
    await change.accept();
    this.next(true);
  }
  async rejectNearestChange(change) {
    await change.reject();
    this.next(true);
  }
  async toggleDiff(_change, _show) {
  }
}
function areDocumentDiff2Equal(diff1, diff2) {
  if (diff1.changes !== diff2.changes) {
    return false;
  }
  if (diff1.identical !== diff2.identical) {
    return false;
  }
  if (diff1.moves !== diff2.moves) {
    return false;
  }
  if (diff1.originalModel !== diff2.originalModel) {
    return false;
  }
  if (diff1.modifiedModel !== diff2.modifiedModel) {
    return false;
  }
  if (diff1.keep !== diff2.keep) {
    return false;
  }
  if (diff1.undo !== diff2.undo) {
    return false;
  }
  if (diff1.quitEarly !== diff2.quitEarly) {
    return false;
  }
  return true;
}
function lastChangeIndex(change) {
  if (change.type === "modified") {
    return change.diff.get().changes.length - 1;
  }
  return 0;
}
export {
  ChatEditingNotebookDiffEditorIntegration,
  ChatEditingNotebookEditorIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxub3RlYm9va1xcY2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvckludGVncmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlYm91bmNlZE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBudWxsRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFByZWZpeFN1bUNvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC9wcmVmaXhTdW1Db21wdXRlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUsIElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEZWxldGVkQ2VsbERlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rRGVsZXRlZENlbGxEZWNvcmF0b3IuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tJbnNlcnRlZENlbGxEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2RpZmYvaW5saW5lRGlmZi9ub3RlYm9va0luc2VydGVkQ2VsbERlY29yYXRvci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va01vZGlmaWVkQ2VsbERlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rTW9kaWZpZWRDZWxsRGVjb3JhdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1RleHREaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZkVkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSwgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmssIElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uLCBJRG9jdW1lbnREaWZmMiB9IGZyb20gJy4uL2NoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5IH0gZnJvbSAnLi4vY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuanMnO1xuaW1wb3J0IHsgY291bnRDaGFuZ2VzLCBJQ2VsbERpZmZJbmZvLCBzb3J0Q2VsbENoYW5nZXMgfSBmcm9tICcuL25vdGVib29rQ2VsbENoYW5nZXMuanMnO1xuaW1wb3J0IHsgT3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IgfSBmcm9tICcuL292ZXJsYXlUb29sYmFyRGVjb3JhdG9yLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JJbnRlZ3JhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiB7XG5cdHByaXZhdGUgaW50ZWdyYXRpb246IENoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JXaWRnZXRJbnRlZ3JhdGlvbjtcblx0cHJpdmF0ZSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRfZW50cnk6IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LFxuXHRcdGVkaXRvcjogSUVkaXRvclBhbmUsXG5cdFx0bm90ZWJvb2tNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0b3JpZ2luYWxNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0Y2VsbENoYW5nZXM6IElPYnNlcnZhYmxlPElDZWxsRGlmZkluZm9bXT4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yKTtcblx0XHRhc3NlcnRUeXBlKG5vdGVib29rRWRpdG9yKTtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yID0gbm90ZWJvb2tFZGl0b3I7XG5cdFx0dGhpcy5pbnRlZ3JhdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvcldpZGdldEludGVncmF0aW9uLCBfZW50cnksIG5vdGVib29rRWRpdG9yLCBub3RlYm9va01vZGVsLCBvcmlnaW5hbE1vZGVsLCBjZWxsQ2hhbmdlcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlQ29udHJvbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yKTtcblx0XHRcdGlmIChub3RlYm9va0VkaXRvciAmJiBub3RlYm9va0VkaXRvciAhPT0gdGhpcy5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yID0gbm90ZWJvb2tFZGl0b3I7XG5cdFx0XHRcdHRoaXMuaW50ZWdyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLmludGVncmF0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ05vdGVib29rRWRpdG9yV2lkZ2V0SW50ZWdyYXRpb24sIF9lbnRyeSwgbm90ZWJvb2tFZGl0b3IsIG5vdGVib29rTW9kZWwsIG9yaWdpbmFsTW9kZWwsIGNlbGxDaGFuZ2VzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblx0cHVibGljIGdldCBjdXJyZW50SW5kZXgoKTogSU9ic2VydmFibGU8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZWdyYXRpb24uY3VycmVudEluZGV4O1xuXHR9XG5cdHJldmVhbChmaXJzdE9yTGFzdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLmludGVncmF0aW9uLnJldmVhbChmaXJzdE9yTGFzdCk7XG5cdH1cblx0bmV4dCh3cmFwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZWdyYXRpb24ubmV4dCh3cmFwKTtcblx0fVxuXHRwcmV2aW91cyh3cmFwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZWdyYXRpb24ucHJldmlvdXMod3JhcCk7XG5cdH1cblx0ZW5hYmxlQWNjZXNzaWJsZURpZmZWaWV3KCk6IHZvaWQge1xuXHRcdHRoaXMuaW50ZWdyYXRpb24uZW5hYmxlQWNjZXNzaWJsZURpZmZWaWV3KCk7XG5cdH1cblx0YWNjZXB0TmVhcmVzdENoYW5nZShjaGFuZ2U6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi5hY2NlcHROZWFyZXN0Q2hhbmdlKGNoYW5nZSk7XG5cdH1cblx0cmVqZWN0TmVhcmVzdENoYW5nZShjaGFuZ2U6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi5yZWplY3ROZWFyZXN0Q2hhbmdlKGNoYW5nZSk7XG5cdH1cblx0dG9nZ2xlRGlmZihjaGFuZ2U6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQsIHNob3c/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZWdyYXRpb24udG9nZ2xlRGlmZihjaGFuZ2UsIHNob3cpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnRlZ3JhdGlvbi5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JXaWRnZXRJbnRlZ3JhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRJbmRleCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAtMSk7XG5cdHJlYWRvbmx5IGN1cnJlbnRJbmRleDogSU9ic2VydmFibGU8bnVtYmVyPiA9IHRoaXMuX2N1cnJlbnRJbmRleDtcblxuXHRwcml2YXRlIGRlbGV0ZWRDZWxsRGVjb3JhdG9yOiBOb3RlYm9va0RlbGV0ZWRDZWxsRGVjb3JhdG9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGluc2VydGVkQ2VsbERlY29yYXRvcjogTm90ZWJvb2tJbnNlcnRlZENlbGxEZWNvcmF0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kaWZpZWRDZWxsRGVjb3JhdG9yOiBOb3RlYm9va01vZGlmaWVkQ2VsbERlY29yYXRvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBvdmVybGF5VG9vbGJhckRlY29yYXRvcjogT3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjZWxsRWRpdG9ySW50ZWdyYXRpb25zID0gbmV3IE1hcDxOb3RlYm9va0NlbGxUZXh0TW9kZWwsIHsgaW50ZWdyYXRpb246IENoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uOyBkaWZmOiBJU2V0dGFibGVPYnNlcnZhYmxlPElEb2N1bWVudERpZmYyPiB9PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25FZGl0U3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPih0aGlzLCAnJyk7XG5cblx0cHJpdmF0ZSBtYXJrdXBDZWxsTGlzdGVuZXJzID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgc29ydGVkQ2VsbENoYW5nZXM6IElDZWxsRGlmZkluZm9bXSA9IFtdO1xuXHRwcml2YXRlIGNoYW5nZUluZGV4Q29tcHV0ZXI6IFByZWZpeFN1bUNvbXB1dGVyID0gbmV3IFByZWZpeFN1bUNvbXB1dGVyKG5ldyBVaW50MzJBcnJheSgwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW50cnk6IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rTW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdG9yaWdpbmFsTW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2VsbENoYW5nZXM6IElPYnNlcnZhYmxlPElDZWxsRGlmZkluZm9bXT4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcyA9IGRlYm91bmNlZE9ic2VydmFibGUob2JzZXJ2YWJsZUZyb21FdmVudChub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZVZpc2libGVSYW5nZXMsICgpID0+IG5vdGVib29rRWRpdG9yLnZpc2libGVSYW5nZXMpLCA1MCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5tYXJrdXBDZWxsTGlzdGVuZXJzLmZvckVhY2goKHYpID0+IHYuZGlzcG9zZSgpKTtcblx0XHR9KSk7XG5cblx0XHRsZXQgb3JpZ2luYWxSZWFkb25seTogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzaG91bGRCZVJlYWRvbmx5ID0gX2VudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5Lm1hcCh2YWx1ZSA9PiAhIXZhbHVlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgaXNSZWFkT25seSA9IHNob3VsZEJlUmVhZG9ubHkucmVhZChyKTtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLnJldHJpZXZlRXhpc3RpbmdXaWRnZXRGcm9tVVJJKF9lbnRyeS5tb2RpZmllZFVSSSk/LnZhbHVlO1xuXHRcdFx0aWYgKCFub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNSZWFkT25seSkge1xuXHRcdFx0XHRvcmlnaW5hbFJlYWRvbmx5ID8/PSBub3RlYm9va0VkaXRvci5pc1JlYWRPbmx5O1xuXHRcdFx0XHRub3RlYm9va0VkaXRvci5zZXRPcHRpb25zKHsgaXNSZWFkT25seTogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAob3JpZ2luYWxSZWFkb25seSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3Iuc2V0T3B0aW9ucyh7IGlzUmVhZE9ubHk6IGZhbHNlIH0pO1xuXHRcdFx0XHQvLyBFbnN1cmUgYWxsIGNlbGxzIGFyZWEgZWRpdGFibGUuXG5cdFx0XHRcdC8vIFdlIG1ha2UgdXNlIG9mIGNoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uIHRvIGhhbmRsZSBjZWxsIGRpZmZpbmcgYW5kIG5hdmlnYXRpb24uXG5cdFx0XHRcdC8vIEhvd2V2ZXIgdGhhdCBhbHNvIG1ha2VzIHRoZSBjZWxsIHJlYWQtb25seS4gV2UgbmVlZCB0byBlbnN1cmUgdGhhdCB0aGUgY2VsbCBpcyBlZGl0YWJsZS5cblx0XHRcdFx0Ly8gRS5nLiBmaXJzdCB3ZSBtYWtlIG5vdGVib29rIHJlYWRvbmx5IChpbiBoZXJlKSwgdGhlbiBjZWxscyBlbmQgdXAgYmVpbmcgcmVhZG9ubHkgYmVjYXVzZSBub3RlYm9vayBpcyByZWFkb25seS5cblx0XHRcdFx0Ly8gVGhlbiBjaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbiBtYWtlcyBjZWxscyByZWFkb25seSBhbmQga2VlcHMgdHJhY2sgb2YgdGhlIG9yaWdpbmFsIHJlYWRvbmx5IHN0YXRlLlxuXHRcdFx0XHQvLyBIb3dldmVyIHRoZSBjZWxsIGlzIGFscmVhZHkgcmVhZG9ubHkgYmVjYXVzZSB0aGUgbm90ZWJvb2sgaXMgcmVhZG9ubHkuXG5cdFx0XHRcdC8vIFNvIHdoZW4gd2UgcmVzdG9yZSB0aGUgbm90ZWJvb2sgdG8gZWRpdGFibGUgKGluIGhlcmUpLCB0aGUgY2VsbCBpcyBtYWRlIGVkaXRhYmxlIGFnYWluLlxuXHRcdFx0XHQvLyBCdXQgd2hlbiBjaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbiBhdHRlbXB0cyB0byByZXN0b3JlLCBpdCB3aWxsIHJlc3RvcmUgdGhlIG9yaWdpbmFsIHJlYWRvbmx5IHN0YXRlLlxuXHRcdFx0XHQvLyAmIGZyb20gdGhlIHBlcnBzcGVjdGl2ZSBvZiBjaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbiwgdGhlIGNlbGwgd2FzIHJlYWRvbmx5ICYgc2hvdWxkIGNvbnRpbnVlIHRvIGJlIHJlYWRvbmx5LlxuXHRcdFx0XHQvLyBUbyBnZXQgYXJvdW5kIHRoaXMsIHdlIHdhaXQgZm9yIGEgZmV3IG1zIGJlZm9yZSByZXN0b3JpbmcgdGhlIG9yaWdpbmFsIHJlYWRvbmx5IHN0YXRlIGZvciBlYWNoIGNlbGwuXG5cdFx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvci5zZXRPcHRpb25zKHsgaXNSZWFkT25seTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvci5zZXRPcHRpb25zKHsgaXNSZWFkT25seTogZmFsc2UgfSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH0sIDEwMCk7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVvdXQpKTtcblx0XHRcdFx0ci5zdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSU5JVCB3aGVuIG5vdCBzdHJlYW1pbmcgbm9yIGRpZmZpbmcgdGhlIHJlc3BvbnNlIGFueW1vcmUsIG9uY2UgcGVyIHJlcXVlc3QsIGFuZCB3aGVuIGhhdmluZyBjaGFuZ2VzXG5cdFx0bGV0IGxhc3RNb2RpZnlpbmdSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0aWYgKCFfZW50cnkuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkucmVhZChyKVxuXHRcdFx0XHQmJiAhX2VudHJ5LmlzUHJvY2Vzc2luZ1Jlc3BvbnNlLnJlYWQocilcblx0XHRcdFx0JiYgbGFzdE1vZGlmeWluZ1JlcXVlc3RJZCAhPT0gX2VudHJ5Lmxhc3RNb2RpZnlpbmdSZXF1ZXN0SWRcblx0XHRcdFx0JiYgY2VsbENoYW5nZXMucmVhZChyKS5zb21lKGMgPT4gYy50eXBlICE9PSAndW5jaGFuZ2VkJyAmJiAhYy5kaWZmLnJlYWQocikuaWRlbnRpY2FsKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGxhc3RNb2RpZnlpbmdSZXF1ZXN0SWQgPSBfZW50cnkubGFzdE1vZGlmeWluZ1JlcXVlc3RJZDtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgYW55IG9mIHRoZSBjaGFuZ2VzIGFyZSB2aXNpYmxlLCBpZiBub3QsIHJldmVhbCB0aGUgZmlyc3QgY2hhbmdlLlxuXHRcdFx0XHRjb25zdCB2aXNpYmxlQ2hhbmdlID0gdGhpcy5zb3J0ZWRDZWxsQ2hhbmdlcy5maW5kKGMgPT4ge1xuXHRcdFx0XHRcdGlmIChjLnR5cGUgPT09ICd1bmNoYW5nZWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gYy5tb2RpZmllZENlbGxJbmRleCA/PyBjLm9yaWdpbmFsQ2VsbEluZGV4O1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm5vdGVib29rRWRpdG9yLnZpc2libGVSYW5nZXMuc29tZShyYW5nZSA9PiBpbmRleCA+PSByYW5nZS5zdGFydCAmJiBpbmRleCA8IHJhbmdlLmVuZCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICghdmlzaWJsZUNoYW5nZSkge1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdHRoaXMuc29ydGVkQ2VsbENoYW5nZXMgPSBzb3J0Q2VsbENoYW5nZXMoY2VsbENoYW5nZXMucmVhZChyKSk7XG5cdFx0XHRjb25zdCBpbmRleGVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5zb3J0ZWRDZWxsQ2hhbmdlcykge1xuXHRcdFx0XHRpbmRleGVzLnB1c2goY2hhbmdlLnR5cGUgPT09ICdpbnNlcnQnIHx8IGNoYW5nZS50eXBlID09PSAnZGVsZXRlJyA/IDFcblx0XHRcdFx0XHQ6IGNoYW5nZS50eXBlID09PSAnbW9kaWZpZWQnID8gY2hhbmdlLmRpZmYucmVhZChyKS5jaGFuZ2VzLmxlbmd0aFxuXHRcdFx0XHRcdFx0OiAwKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jaGFuZ2VJbmRleENvbXB1dGVyID0gbmV3IFByZWZpeFN1bUNvbXB1dGVyKG5ldyBVaW50MzJBcnJheShpbmRleGVzKSk7XG5cdFx0XHRpZiAodGhpcy5jaGFuZ2VJbmRleENvbXB1dGVyLmdldFRvdGFsU3VtKCkgPT09IDApIHtcblx0XHRcdFx0dGhpcy5yZXZlcnRNYXJrdXBDZWxsU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBCdWlsZCBjZWxsIGludGVncmF0aW9ucyAocmVzcG9uc2libGUgZm9yIG5hdmlnYXRpbmcgY2hhbmdlcyB3aXRoaW4gYSBjZWxsIGFuZCBkZWNvcmF0aW5nIGNlbGwgdGV4dCBjaGFuZ2VzKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwgIT09IHRoaXMubm90ZWJvb2tNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzb3J0ZWRDZWxsQ2hhbmdlcyA9IHNvcnRDZWxsQ2hhbmdlcyhjZWxsQ2hhbmdlcy5yZWFkKHIpKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IHNvcnRlZENlbGxDaGFuZ2VzLmZpbHRlcihjID0+IGMudHlwZSAhPT0gJ2RlbGV0ZScpO1xuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLnJlYWQocik7XG5cdFx0XHRpZiAoIWNoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5mb3JFYWNoKCh7IGRpZmYgfSkgPT4ge1xuXHRcdFx0XHRcdGRpZmYuc2V0KHsgLi4uZGlmZi5yZWFkKHVuZGVmaW5lZCksIC4uLm51bGxEb2N1bWVudERpZmYgfSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubWFya2Rvd25FZGl0U3RhdGUucmVhZChyKTtcblxuXHRcdFx0Y29uc3QgdmFsaWRDZWxscyA9IG5ldyBTZXQ8Tm90ZWJvb2tDZWxsVGV4dE1vZGVsPigpO1xuXHRcdFx0Y2hhbmdlcy5mb3JFYWNoKChjaGFuZ2UpID0+IHtcblx0XHRcdFx0aWYgKGNoYW5nZS5tb2RpZmllZENlbGxJbmRleCA9PT0gdW5kZWZpbmVkIHx8IGNoYW5nZS5tb2RpZmllZENlbGxJbmRleCA+PSBub3RlYm9va01vZGVsLmNlbGxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjZWxsID0gbm90ZWJvb2tNb2RlbC5jZWxsc1tjaGFuZ2UubW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycy5maW5kKChbdm0sXSkgPT4gdm0uaGFuZGxlID09PSBub3RlYm9va01vZGVsLmNlbGxzW2NoYW5nZS5tb2RpZmllZENlbGxJbmRleF0uaGFuZGxlKT8uWzFdO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZE1vZGVsID0gY2hhbmdlLm1vZGlmaWVkTW9kZWwucHJvbWlzZVJlc3VsdC5yZWFkKHIpPy5kYXRhO1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gY2hhbmdlLm9yaWdpbmFsTW9kZWwucHJvbWlzZVJlc3VsdC5yZWFkKHIpPy5kYXRhO1xuXHRcdFx0XHRpZiAoIWNlbGwgfHwgIW9yaWdpbmFsTW9kZWwgfHwgIW1vZGlmaWVkTW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiAhdGhpcy5tYXJrdXBDZWxsTGlzdGVuZXJzLmhhcyhjZWxsLmhhbmRsZSkpIHtcblx0XHRcdFx0XHRjb25zdCBjZWxsTW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpPy52aWV3Q2VsbHMuZmluZChjID0+IGMuaGFuZGxlID09PSBjZWxsLmhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKGNlbGxNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBjZWxsTW9kZWwub25EaWRDaGFuZ2VTdGF0ZSgoZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZS5lZGl0U3RhdGVDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLm1hcmtkb3duRWRpdFN0YXRlLnNldChjZWxsTW9kZWwuaGFuZGxlICsgJy0nICsgY2VsbE1vZGVsLmdldEVkaXRTdGF0ZSgpLCB1bmRlZmluZWQpLCAwKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aGlzLm1hcmt1cENlbGxMaXN0ZW5lcnMuc2V0KGNlbGwuaGFuZGxlLCBsaXN0ZW5lcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSB7XG5cdFx0XHRcdFx0Li4uY2hhbmdlLmRpZmYucmVhZChyKSxcblx0XHRcdFx0XHRtb2RpZmllZE1vZGVsLFxuXHRcdFx0XHRcdG9yaWdpbmFsTW9kZWwsXG5cdFx0XHRcdFx0a2VlcDogY2hhbmdlLmtlZXAsXG5cdFx0XHRcdFx0dW5kbzogY2hhbmdlLnVuZG9cblx0XHRcdFx0fSBzYXRpc2ZpZXMgSURvY3VtZW50RGlmZjI7XG5cdFx0XHRcdHZhbGlkQ2VsbHMuYWRkKGNlbGwpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50RGlmZiA9IHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoY2VsbCk7XG5cdFx0XHRcdGlmIChjdXJyZW50RGlmZikge1xuXHRcdFx0XHRcdC8vIERvIG5vdCB1bm5lY2Vzc2FyaWx5IHRyaWdnZXIgYSBjaGFuZ2UgZXZlbnRcblx0XHRcdFx0XHRpZiAoIWFyZURvY3VtZW50RGlmZjJFcXVhbChjdXJyZW50RGlmZi5kaWZmLnJlYWQodW5kZWZpbmVkKSwgZGlmZikpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnREaWZmLmRpZmYuc2V0KGRpZmYsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGRpZmYyID0gb2JzZXJ2YWJsZVZhbHVlKGBkaWZmJHtjZWxsLmhhbmRsZX1gLCBkaWZmKTtcblx0XHRcdFx0XHRjb25zdCBpbnRlZ3JhdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24sIF9lbnRyeSwgZWRpdG9yLCBkaWZmMiwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLnNldChjZWxsLCB7IGludGVncmF0aW9uLCBkaWZmOiBkaWZmMiB9KTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihpbnRlZ3JhdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMuZ2V0KGNlbGwpPy5pbnRlZ3JhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMuZGVsZXRlKGNlbGwpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yLmdldE1vZGVsKCkgIT09IGNlbGwudGV4dE1vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoY2VsbCk/LmludGVncmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmRlbGV0ZShjZWxsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBEaXNwb3NlIG9sZCBpbnRlZ3JhdGlvbnMgYXMgdGhlIGVkaXRvcnMgYXJlIG5vIGxvbmdlciB2YWxpZC5cblx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5mb3JFYWNoKCh2LCBjZWxsKSA9PiB7XG5cdFx0XHRcdGlmICghdmFsaWRDZWxscy5oYXMoY2VsbCkpIHtcblx0XHRcdFx0XHR2LmludGVncmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMuZGVsZXRlKGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjZWxsc0FyZVZpc2libGUgPSBvbkRpZENoYW5nZVZpc2libGVSYW5nZXMubWFwKHYgPT4gdi5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBkZWJvdW5jZWRDaGFuZ2VzID0gZGVib3VuY2VkT2JzZXJ2YWJsZShjZWxsQ2hhbmdlcywgMTApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwgIT09IHRoaXMubm90ZWJvb2tNb2RlbCB8fCAhY2VsbHNBcmVWaXNpYmxlLnJlYWQocikgfHwgIXRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2UgY2FuIGhhdmUgaW5zZXJ0ZWQgY2VsbHMgdGhhdCBoYXZlIGJlZW4gYWNjZXB0ZWQsIGluIHRob3NlIGNhc2VzIHdlIGRvIG5vdCB3YW50IGFueSBkZWNvcmF0b3JzIG9uIHRoZW0uXG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gZGVib3VuY2VkQ2hhbmdlcy5yZWFkKHIpLmZpbHRlcihjID0+IGMudHlwZSA9PT0gJ2luc2VydCcgPyAhYy5kaWZmLnJlYWQocikuaWRlbnRpY2FsIDogdHJ1ZSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZENoYW5nZXMgPSBjaGFuZ2VzLmZpbHRlcihjID0+IGMudHlwZSA9PT0gJ21vZGlmaWVkJyk7XG5cblx0XHRcdHRoaXMuY3JlYXRlRGVjb3JhdG9ycygpO1xuXHRcdFx0Ly8gSWYgYWxsIGNlbGxzIGFyZSBqdXN0IGluc2VydHMsIHRoZW4gbm8gbmVlZCB0byBzaG93IGFueSBkZWNvcmF0aW9ucy5cblx0XHRcdGlmIChjaGFuZ2VzLmV2ZXJ5KGMgPT4gYy50eXBlID09PSAnaW5zZXJ0JykpIHtcblx0XHRcdFx0dGhpcy5pbnNlcnRlZENlbGxEZWNvcmF0b3I/LmFwcGx5KFtdKTtcblx0XHRcdFx0dGhpcy5tb2RpZmllZENlbGxEZWNvcmF0b3I/LmFwcGx5KFtdKTtcblx0XHRcdFx0dGhpcy5kZWxldGVkQ2VsbERlY29yYXRvcj8uYXBwbHkoW10sIG9yaWdpbmFsTW9kZWwpO1xuXHRcdFx0XHR0aGlzLm92ZXJsYXlUb29sYmFyRGVjb3JhdG9yPy5kZWNvcmF0ZShbXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmluc2VydGVkQ2VsbERlY29yYXRvcj8uYXBwbHkoY2hhbmdlcyk7XG5cdFx0XHRcdHRoaXMubW9kaWZpZWRDZWxsRGVjb3JhdG9yPy5hcHBseShtb2RpZmllZENoYW5nZXMpO1xuXHRcdFx0XHR0aGlzLmRlbGV0ZWRDZWxsRGVjb3JhdG9yPy5hcHBseShjaGFuZ2VzLCBvcmlnaW5hbE1vZGVsKTtcblx0XHRcdFx0dGhpcy5vdmVybGF5VG9vbGJhckRlY29yYXRvcj8uZGVjb3JhdGUoY2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdpbnNlcnQnIHx8IGMudHlwZSA9PT0gJ21vZGlmaWVkJykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VycmVudENoYW5nZSgpIHtcblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBNYXRoLm1pbih0aGlzLl9jdXJyZW50SW5kZXguZ2V0KCksIHRoaXMuY2hhbmdlSW5kZXhDb21wdXRlci5nZXRUb3RhbFN1bSgpIC0gMSk7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmNoYW5nZUluZGV4Q29tcHV0ZXIuZ2V0SW5kZXhPZihjdXJyZW50SW5kZXgpO1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuc29ydGVkQ2VsbENoYW5nZXNbaW5kZXguaW5kZXhdO1xuXG5cdFx0cmV0dXJuIGNoYW5nZSA/IHsgY2hhbmdlLCBpbmRleDogaW5kZXgucmVtYWluZGVyIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUN1cnJlbnRJbmRleChjaGFuZ2U6IElDZWxsRGlmZkluZm8sIGluZGV4SW5DZWxsOiBudW1iZXIgPSAwKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzLmluZGV4T2YoY2hhbmdlKTtcblx0XHRjb25zdCBjaGFuZ2VJbmRleCA9IHRoaXMuY2hhbmdlSW5kZXhDb21wdXRlci5nZXRQcmVmaXhTdW0oaW5kZXggLSAxKTtcblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBNYXRoLm1pbihjaGFuZ2VJbmRleCArIGluZGV4SW5DZWxsLCB0aGlzLmNoYW5nZUluZGV4Q29tcHV0ZXIuZ2V0VG90YWxTdW0oKSAtIDEpO1xuXHRcdHRoaXMuX2N1cnJlbnRJbmRleC5zZXQoY3VycmVudEluZGV4LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEZWNvcmF0b3JzKCkge1xuXHRcdGNvbnN0IGNlbGxDaGFuZ2VzID0gdGhpcy5jZWxsQ2hhbmdlcy5nZXQoKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IHRoaXMuYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U7XG5cblx0XHR0aGlzLmluc2VydGVkQ2VsbERlY29yYXRvciA/Pz0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0luc2VydGVkQ2VsbERlY29yYXRvciwgdGhpcy5ub3RlYm9va0VkaXRvcikpO1xuXHRcdHRoaXMubW9kaWZpZWRDZWxsRGVjb3JhdG9yID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rTW9kaWZpZWRDZWxsRGVjb3JhdG9yLCB0aGlzLm5vdGVib29rRWRpdG9yKSk7XG5cdFx0dGhpcy5vdmVybGF5VG9vbGJhckRlY29yYXRvciA/Pz0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPdmVybGF5VG9vbGJhckRlY29yYXRvciwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGhpcy5ub3RlYm9va01vZGVsKSk7XG5cblx0XHRpZiAodGhpcy5kZWxldGVkQ2VsbERlY29yYXRvcikge1xuXHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKHRoaXMuZGVsZXRlZENlbGxEZWNvcmF0b3IpO1xuXHRcdFx0dGhpcy5kZWxldGVkQ2VsbERlY29yYXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuZGVsZXRlZENlbGxEZWNvcmF0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRGVsZXRlZENlbGxEZWNvcmF0b3IsIHRoaXMubm90ZWJvb2tFZGl0b3IsIHtcblx0XHRcdGNsYXNzTmFtZTogJ2NoYXQtZGlmZi1jaGFuZ2UtY29udGVudC13aWRnZXQnLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnY2hhdEVkaXRpbmdOb3RlYm9va0h1bmsnLFxuXHRcdFx0bWVudUlkOiBNZW51SWQuQ2hhdEVkaXRpbmdFZGl0b3JIdW5rLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoIWFjdGlvbi5jbGFzcykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsOiB0cnVlIC8qIGhpZGUga2V5YmluZGluZyBmb3IgYWN0aW9ucyB3aXRob3V0IGljb24gKi8sIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0YXJnRmFjdG9yeTogKGRlbGV0ZWRDZWxsSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGFjY2VwdCgpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gY2VsbENoYW5nZXMuZmluZChjID0+IGMudHlwZSA9PT0gJ2RlbGV0ZScgJiYgYy5vcmlnaW5hbENlbGxJbmRleCA9PT0gZGVsZXRlZENlbGxJbmRleCk7XG5cdFx0XHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVudHJ5LmtlZXAoZW50cnkuZGlmZi5nZXQoKS5jaGFuZ2VzWzBdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5lZGl0c0tlcHQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZWplY3QoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IGNlbGxDaGFuZ2VzLmZpbmQoYyA9PiBjLnR5cGUgPT09ICdkZWxldGUnICYmIGMub3JpZ2luYWxDZWxsSW5kZXggPT09IGRlbGV0ZWRDZWxsSW5kZXgpO1xuXHRcdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbnRyeS51bmRvKGVudHJ5LmRpZmYuZ2V0KCkuY2hhbmdlc1swXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZWRpdHNVbmRvbmUsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuaztcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDZWxsKG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va01vZGVsLmNlbGxzW21vZGlmaWVkQ2VsbEluZGV4XTtcblx0XHRjb25zdCBpbnRlZ3JhdGlvbiA9IHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoY2VsbCk/LmludGVncmF0aW9uO1xuXHRcdHJldHVybiBpbnRlZ3JhdGlvbjtcblx0fVxuXG5cdHJldmVhbChmaXJzdE9yTGFzdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzLmZpbHRlcihjID0+IGMudHlwZSAhPT0gJ3VuY2hhbmdlZCcpO1xuXHRcdGlmICghY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhbmdlID0gZmlyc3RPckxhc3QgPyBjaGFuZ2VzWzBdIDogY2hhbmdlc1tjaGFuZ2VzLmxlbmd0aCAtIDFdO1xuXHRcdHRoaXMuX3JldmVhbEZpcnN0T3JMYXN0KGNoYW5nZSwgZmlyc3RPckxhc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsRmlyc3RPckxhc3QoY2hhbmdlOiBJQ2VsbERpZmZJbmZvLCBmaXJzdE9yTGFzdDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRzd2l0Y2ggKGNoYW5nZS50eXBlKSB7XG5cdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGhpcy5ibHVyKHRoaXMuZ2V0Q3VycmVudENoYW5nZSgpPy5jaGFuZ2UpO1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gZmlyc3RPckxhc3QgfHwgY2hhbmdlLnR5cGUgPT09ICdpbnNlcnQnID8gMCA6IGNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsQ2hhbmdlKGNoYW5nZSwgaW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHR0aGlzLmJsdXIodGhpcy5nZXRDdXJyZW50Q2hhbmdlKCk/LmNoYW5nZSk7XG5cdFx0XHRcdC8vIHJldmVhbCB0aGUgZGVsZXRlZCBjZWxsIGRlY29yYXRvclxuXHRcdFx0XHR0aGlzLmRlbGV0ZWRDZWxsRGVjb3JhdG9yPy5yZXZlYWwoY2hhbmdlLm9yaWdpbmFsQ2VsbEluZGV4KTtcblx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW5kZXgoY2hhbmdlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxDaGFuZ2UoY2hhbmdlOiBJQ2VsbERpZmZJbmZvLCBpbmRleEluQ2VsbDogbnVtYmVyKSB7XG5cdFx0c3dpdGNoIChjaGFuZ2UudHlwZSkge1xuXHRcdFx0Y2FzZSAnaW5zZXJ0Jzpcblx0XHRcdGNhc2UgJ21vZGlmaWVkJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IHRleHRDaGFuZ2UgPSBjaGFuZ2UuZGlmZi5nZXQoKS5jaGFuZ2VzW2luZGV4SW5DZWxsXTtcblx0XHRcdFx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5nZXRDZWxsVmlld01vZGVsKGNoYW5nZSk7XG5cdFx0XHRcdFx0aWYgKGNlbGxWaWV3TW9kZWwpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlQ3VycmVudEluZGV4KGNoYW5nZSwgaW5kZXhJbkNlbGwpO1xuXHRcdFx0XHRcdFx0dGhpcy5yZXZlYWxDaGFuZ2VJblZpZXcoY2VsbFZpZXdNb2RlbCwgdGV4dENoYW5nZT8ubW9kaWZpZWQsIGNoYW5nZSlcblx0XHRcdFx0XHRcdFx0LmNhdGNoKGVyciA9PiB7IHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciByZXZlYWxpbmcgY2hhbmdlIGluIHZpZXc6ICR7ZXJyfWApOyB9KTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSAnZGVsZXRlJzpcblx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW5kZXgoY2hhbmdlKTtcblx0XHRcdFx0Ly8gcmV2ZWFsIHRoZSBkZWxldGVkIGNlbGwgZGVjb3JhdG9yXG5cdFx0XHRcdHRoaXMuZGVsZXRlZENlbGxEZWNvcmF0b3I/LnJldmVhbChjaGFuZ2Uub3JpZ2luYWxDZWxsSW5kZXgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2VsbFZpZXdNb2RlbChjaGFuZ2U6IElDZWxsRGlmZkluZm8pIHtcblx0XHRpZiAoY2hhbmdlLnR5cGUgPT09ICdkZWxldGUnIHx8IGNoYW5nZS5tb2RpZmllZENlbGxJbmRleCA9PT0gdW5kZWZpbmVkIHx8IGNoYW5nZS5tb2RpZmllZENlbGxJbmRleCA+PSB0aGlzLm5vdGVib29rTW9kZWwuY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va01vZGVsLmNlbGxzW2NoYW5nZS5tb2RpZmllZENlbGxJbmRleF07XG5cdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCk/LnZpZXdDZWxscy5maW5kKGMgPT4gYy5oYW5kbGUgPT09IGNlbGwuaGFuZGxlKTtcblx0XHRyZXR1cm4gY2VsbFZpZXdNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmV2ZWFsQ2hhbmdlSW5WaWV3KGNlbGw6IElDZWxsVmlld01vZGVsLCBsaW5lczogTGluZVJhbmdlIHwgdW5kZWZpbmVkLCBjaGFuZ2U6IElDZWxsRGlmZkluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXJnZXRMaW5lcyA9IGxpbmVzID8/IG5ldyBMaW5lUmFuZ2UoMCwgMCk7XG5cdFx0aWYgKGNoYW5nZS50eXBlID09PSAnbW9kaWZpZWQnICYmIGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLlByZXZpZXcpIHtcblx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ2NoYXRFZGl0TmF2aWdhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzVGFyZ2V0ID0gY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSB8fCBjaGFuZ2UudHlwZSA9PT0gJ21vZGlmaWVkJyA/ICdlZGl0b3InIDogJ2NvbnRhaW5lcic7XG5cdFx0YXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCBmb2N1c1RhcmdldCwgeyBmb2N1c0VkaXRvckxpbmU6IHRhcmdldExpbmVzLnN0YXJ0TGluZU51bWJlciB9KTtcblx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJBc3luYyhjZWxsLCBuZXcgUmFuZ2UodGFyZ2V0TGluZXMuc3RhcnRMaW5lTnVtYmVyLCAwLCB0YXJnZXRMaW5lcy5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLCAwKSk7XG5cdH1cblxuXHRwcml2YXRlIHJldmVydE1hcmt1cENlbGxTdGF0ZSgpIHtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5nZXRDZWxsVmlld01vZGVsKGNoYW5nZSk7XG5cdFx0XHRpZiAoY2VsbFZpZXdNb2RlbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsVmlld01vZGVsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcgJiZcblx0XHRcdFx0KGNlbGxWaWV3TW9kZWwuZWRpdFN0YXRlU291cmNlID09PSAnY2hhdEVkaXROYXZpZ2F0aW9uJyB8fCBjZWxsVmlld01vZGVsLmVkaXRTdGF0ZVNvdXJjZSA9PT0gJ2NoYXRFZGl0JykpIHtcblx0XHRcdFx0Y2VsbFZpZXdNb2RlbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnY2hhdEVkaXQnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGJsdXIoY2hhbmdlOiBJQ2VsbERpZmZJbmZvIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFjaGFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IHRoaXMuZ2V0Q2VsbFZpZXdNb2RlbChjaGFuZ2UpO1xuXHRcdGlmIChjZWxsVmlld01vZGVsPy5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGNlbGxWaWV3TW9kZWwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJiBjZWxsVmlld01vZGVsLmVkaXRTdGF0ZVNvdXJjZSA9PT0gJ2NoYXRFZGl0TmF2aWdhdGlvbicpIHtcblx0XHRcdGNlbGxWaWV3TW9kZWwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgJ2NoYXRFZGl0TmF2aWdhdGlvbicpO1xuXHRcdH1cblx0fVxuXG5cdG5leHQod3JhcDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzLmZpbHRlcihjID0+IGMudHlwZSAhPT0gJ3VuY2hhbmdlZCcpO1xuXHRcdGNvbnN0IGN1cnJlbnRDaGFuZ2UgPSB0aGlzLmdldEN1cnJlbnRDaGFuZ2UoKTtcblx0XHRpZiAoIWN1cnJlbnRDaGFuZ2UpIHtcblx0XHRcdGNvbnN0IGZpcnN0Q2hhbmdlID0gY2hhbmdlc1swXTtcblxuXHRcdFx0aWYgKGZpcnN0Q2hhbmdlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxGaXJzdE9yTGFzdChmaXJzdENoYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBnbyB0byBuZXh0XG5cdFx0Ly8gZmlyc3QgY2hlY2sgaWYgd2UgYXJlIGF0IHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgY2hhbmdlXG5cdFx0c3dpdGNoIChjdXJyZW50Q2hhbmdlLmNoYW5nZS50eXBlKSB7XG5cdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdCBjZWxsSW50ZWdyYXRpb24gPSB0aGlzLmdldENlbGwoY3VycmVudENoYW5nZS5jaGFuZ2UubW9kaWZpZWRDZWxsSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChjZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdFx0XHRcdGlmIChjZWxsSW50ZWdyYXRpb24ubmV4dChmYWxzZSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW5kZXgoY3VycmVudENoYW5nZS5jaGFuZ2UsIGNlbGxJbnRlZ3JhdGlvbi5jdXJyZW50SW5kZXguZ2V0KCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBpc0xhc3RDaGFuZ2VJbkNlbGwgPSBjdXJyZW50Q2hhbmdlLmluZGV4ID49IGxhc3RDaGFuZ2VJbmRleChjdXJyZW50Q2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBpc0xhc3RDaGFuZ2VJbkNlbGwgPyAwIDogY3VycmVudENoYW5nZS5pbmRleCArIDE7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbmdlID0gaXNMYXN0Q2hhbmdlSW5DZWxsID8gY2hhbmdlc1tjaGFuZ2VzLmluZGV4T2YoY3VycmVudENoYW5nZS5jaGFuZ2UpICsgMV0gOiBjdXJyZW50Q2hhbmdlLmNoYW5nZTtcblxuXHRcdFx0XHRcdGlmIChjaGFuZ2UpIHtcblx0XHRcdFx0XHRcdGlmIChpc0xhc3RDaGFuZ2VJbkNlbGwpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5ibHVyKGN1cnJlbnRDaGFuZ2UuY2hhbmdlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3JldmVhbENoYW5nZShjaGFuZ2UsIGluZGV4KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0Y2FzZSAnZGVsZXRlJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRoaXMuYmx1cihjdXJyZW50Q2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRcdFx0Ly8gZ28gdG8gbmV4dCBjaGFuZ2UgZGlyZWN0bHlcblx0XHRcdFx0XHRjb25zdCBuZXh0Q2hhbmdlID0gY2hhbmdlc1tjaGFuZ2VzLmluZGV4T2YoY3VycmVudENoYW5nZS5jaGFuZ2UpICsgMV07XG5cdFx0XHRcdFx0aWYgKG5leHRDaGFuZ2UgJiYgdGhpcy5fcmV2ZWFsRmlyc3RPckxhc3QobmV4dENoYW5nZSwgdHJ1ZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmICh3cmFwKSB7XG5cdFx0XHRjb25zdCBmaXJzdENoYW5nZSA9IGNoYW5nZXNbMF07XG5cdFx0XHRpZiAoZmlyc3RDaGFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JldmVhbEZpcnN0T3JMYXN0KGZpcnN0Q2hhbmdlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcmV2aW91cyh3cmFwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuc29ydGVkQ2VsbENoYW5nZXMuZmlsdGVyKGMgPT4gYy50eXBlICE9PSAndW5jaGFuZ2VkJyk7XG5cdFx0Y29uc3QgY3VycmVudENoYW5nZSA9IHRoaXMuZ2V0Q3VycmVudENoYW5nZSgpO1xuXHRcdGlmICghY3VycmVudENoYW5nZSkge1xuXHRcdFx0Y29uc3QgbGFzdENoYW5nZSA9IGNoYW5nZXNbY2hhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChsYXN0Q2hhbmdlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxGaXJzdE9yTGFzdChsYXN0Q2hhbmdlLCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBnbyB0byBwcmV2aW91c1xuXHRcdC8vIGZpcnN0IGNoZWNrIGlmIHdlIGFyZSBhdCB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgY2hhbmdlXG5cdFx0c3dpdGNoIChjdXJyZW50Q2hhbmdlLmNoYW5nZS50eXBlKSB7XG5cdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdCBjZWxsSW50ZWdyYXRpb24gPSB0aGlzLmdldENlbGwoY3VycmVudENoYW5nZS5jaGFuZ2UubW9kaWZpZWRDZWxsSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChjZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdFx0XHRcdGlmIChjZWxsSW50ZWdyYXRpb24ucHJldmlvdXMoZmFsc2UpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlQ3VycmVudEluZGV4KGN1cnJlbnRDaGFuZ2UuY2hhbmdlLCBjZWxsSW50ZWdyYXRpb24uY3VycmVudEluZGV4LmdldCgpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaXNGaXJzdENoYW5nZUluQ2VsbCA9IGN1cnJlbnRDaGFuZ2UuaW5kZXggPD0gMDtcblx0XHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBpc0ZpcnN0Q2hhbmdlSW5DZWxsID8gY2hhbmdlc1tjaGFuZ2VzLmluZGV4T2YoY3VycmVudENoYW5nZS5jaGFuZ2UpIC0gMV0gOiBjdXJyZW50Q2hhbmdlLmNoYW5nZTtcblxuXHRcdFx0XHRcdGlmIChjaGFuZ2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gaXNGaXJzdENoYW5nZUluQ2VsbCA/IGxhc3RDaGFuZ2VJbmRleChjaGFuZ2UpIDogY3VycmVudENoYW5nZS5pbmRleCAtIDE7XG5cdFx0XHRcdFx0XHRpZiAoaXNGaXJzdENoYW5nZUluQ2VsbCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmJsdXIoY3VycmVudENoYW5nZS5jaGFuZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3JldmVhbENoYW5nZShjaGFuZ2UsIGluZGV4KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0Y2FzZSAnZGVsZXRlJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRoaXMuYmx1cihjdXJyZW50Q2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRcdFx0Ly8gZ28gdG8gcHJldmlvdXMgY2hhbmdlIGRpcmVjdGx5XG5cdFx0XHRcdFx0Y29uc3QgcHJldkNoYW5nZSA9IGNoYW5nZXNbY2hhbmdlcy5pbmRleE9mKGN1cnJlbnRDaGFuZ2UuY2hhbmdlKSAtIDFdO1xuXHRcdFx0XHRcdGlmIChwcmV2Q2hhbmdlICYmIHRoaXMuX3JldmVhbEZpcnN0T3JMYXN0KHByZXZDaGFuZ2UsIGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHdyYXApIHtcblx0XHRcdGNvbnN0IGxhc3RDaGFuZ2UgPSBjaGFuZ2VzW2NoYW5nZXMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAobGFzdENoYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsRmlyc3RPckxhc3QobGFzdENoYW5nZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGVuYWJsZUFjY2Vzc2libGVEaWZmVmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCk/Lm1vZGVsO1xuXHRcdGlmIChjZWxsKSB7XG5cdFx0XHRjb25zdCBpbnRlZ3JhdGlvbiA9IHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoY2VsbCk/LmludGVncmF0aW9uO1xuXHRcdFx0aW50ZWdyYXRpb24/LmVuYWJsZUFjY2Vzc2libGVEaWZmVmlldygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Zm9jdXNlZEludGVncmF0aW9uKCk6IENoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaXJzdCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9uVmlld01vZGVscygpWzBdO1xuXHRcdGlmIChmaXJzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoZmlyc3QubW9kZWwpPy5pbnRlZ3JhdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdE5lYXJlc3RDaGFuZ2UoaHVuazogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChodW5rKSB7XG5cdFx0XHRhd2FpdCBodW5rLmFjY2VwdCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRDdXJyZW50Q2hhbmdlKCk7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5nZXRmb2N1c2VkSW50ZWdyYXRpb24oKTtcblx0XHRcdC8vIGRlbGV0ZSBjaGFuZ2VzIGNhbid0IGJlIGZvY3VzZWRcblx0XHRcdGlmIChjdXJyZW50ICYmICFmb2N1c2VkIHx8IGN1cnJlbnQ/LmNoYW5nZS50eXBlID09PSAnZGVsZXRlJykge1xuXHRcdFx0XHRjdXJyZW50LmNoYW5nZS5rZWVwKGN1cnJlbnQ/LmNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXNbY3VycmVudC5pbmRleF0pO1xuXHRcdFx0fSBlbHNlIGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdGF3YWl0IGZvY3VzZWQuYWNjZXB0TmVhcmVzdENoYW5nZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jdXJyZW50SW5kZXguc2V0KHRoaXMuX2N1cnJlbnRJbmRleC5nZXQoKSAtIDEsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLm5leHQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVqZWN0TmVhcmVzdENoYW5nZShodW5rOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGh1bmspIHtcblx0XHRcdGF3YWl0IGh1bmsucmVqZWN0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmdldEN1cnJlbnRDaGFuZ2UoKTtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLmdldGZvY3VzZWRJbnRlZ3JhdGlvbigpO1xuXHRcdFx0Ly8gZGVsZXRlIGNoYW5nZXMgY2FuJ3QgYmUgZm9jdXNlZFxuXHRcdFx0aWYgKGN1cnJlbnQgJiYgIWZvY3VzZWQgfHwgY3VycmVudD8uY2hhbmdlLnR5cGUgPT09ICdkZWxldGUnKSB7XG5cdFx0XHRcdGN1cnJlbnQuY2hhbmdlLnVuZG8oY3VycmVudC5jaGFuZ2UuZGlmZi5nZXQoKS5jaGFuZ2VzW2N1cnJlbnQuaW5kZXhdKTtcblx0XHRcdH0gZWxzZSBpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHRhd2FpdCBmb2N1c2VkLnJlamVjdE5lYXJlc3RDaGFuZ2UoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4LnNldCh0aGlzLl9jdXJyZW50SW5kZXguZ2V0KCkgLSAxLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5uZXh0KHRydWUpO1xuXHRcdH1cblxuXHR9XG5cdGFzeW5jIHRvZ2dsZURpZmYoX2NoYW5nZTogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCwgX3Nob3c/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlmZklucHV0OiBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQgPSB7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogdGhpcy5fZW50cnkub3JpZ2luYWxVUkkgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiB0aGlzLl9lbnRyeS5tb2RpZmllZFVSSSB9LFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaWZmLmdlbmVyaWMnLCAnezB9IChjaGFuZ2VzIGZyb20gY2hhdCknLCBiYXNlbmFtZSh0aGlzLl9lbnRyeS5tb2RpZmllZFVSSSkpXG5cdFx0fTtcblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZGlmZklucHV0KTtcblxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdGluZ05vdGVib29rRGlmZkVkaXRvckludGVncmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudEluZGV4ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIC0xKTtcblx0cmVhZG9ubHkgY3VycmVudEluZGV4OiBJT2JzZXJ2YWJsZTxudW1iZXI+ID0gdGhpcy5fY3VycmVudEluZGV4O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tEaWZmRWRpdG9yOiBJTm90ZWJvb2tUZXh0RGlmZkVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNlbGxDaGFuZ2VzOiBJT2JzZXJ2YWJsZTxJQ2VsbERpZmZJbmZvW10+XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbm90ZWJvb2tEaWZmRWRpdG9yLmN1cnJlbnRDaGFuZ2VkSW5kZXgucmVhZChyKTtcblx0XHRcdGNvbnN0IG51bWJlck9mQ2VsbENoYW5nZXMgPSBjZWxsQ2hhbmdlcy5yZWFkKHIpLmZpbHRlcihjID0+ICFjLmRpZmYucmVhZChyKS5pZGVudGljYWwpO1xuXHRcdFx0aWYgKG51bWJlck9mQ2VsbENoYW5nZXMubGVuZ3RoICYmIGluZGV4ID49IDAgJiYgaW5kZXggPCBudW1iZXJPZkNlbGxDaGFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBOb3RlYm9vayBEaWZmIGVkaXRvciBvbmx5IHN1cHBvcnRzIG5hdmlnYXRpbmcgdGhyb3VnaCBjaGFuZ2VzIHRvIGNlbGxzLlxuXHRcdFx0XHQvLyBIb3dldmVyIGluIGNoYXQgd2UgdGFrZSBjaGFuZ2VzIHRvIGxpbmVzIGluIHRoZSBjZWxscyBpbnRvIGFjY291bnQuXG5cdFx0XHRcdC8vIFNvIGlmIHdlJ3JlIG9uIHRoZSBzZWNvbmQgY2VsbCBhbmQgZmlyc3QgY2VsbCBoYXMgMyBjaGFuZ2VzLCB0aGVuIHdlJ3JlIG9uIHRoZSA0dGggY2hhbmdlLlxuXHRcdFx0XHRjb25zdCBjaGFuZ2VzU29GYXIgPSBjb3VudENoYW5nZXMobnVtYmVyT2ZDZWxsQ2hhbmdlcy5zbGljZSgwLCBpbmRleCArIDEpKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4LnNldChjaGFuZ2VzU29GYXIgLSAxLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4LnNldCgtMSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRyZXZlYWwoZmlyc3RPckxhc3Q6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VzID0gc29ydENlbGxDaGFuZ2VzKHRoaXMuY2VsbENoYW5nZXMuZ2V0KCkuZmlsdGVyKGMgPT4gYy50eXBlICE9PSAndW5jaGFuZ2VkJykpO1xuXHRcdGlmICghY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChmaXJzdE9yTGFzdCkge1xuXHRcdFx0dGhpcy5ub3RlYm9va0RpZmZFZGl0b3IuZmlyc3RDaGFuZ2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RlYm9va0RpZmZFZGl0b3IubGFzdENoYW5nZSgpO1xuXHRcdH1cblx0fVxuXG5cdG5leHQoX3dyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jZWxsQ2hhbmdlcy5nZXQoKS5maWx0ZXIoYyA9PiAhYy5kaWZmLmdldCgpLmlkZW50aWNhbCkubGVuZ3RoO1xuXHRcdGlmICh0aGlzLm5vdGVib29rRGlmZkVkaXRvci5jdXJyZW50Q2hhbmdlZEluZGV4LmdldCgpID09PSBjaGFuZ2VzIC0gMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLm5vdGVib29rRGlmZkVkaXRvci5uZXh0Q2hhbmdlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcmV2aW91cyhfd3JhcDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmNlbGxDaGFuZ2VzLmdldCgpLmZpbHRlcihjID0+ICFjLmRpZmYuZ2V0KCkuaWRlbnRpY2FsKS5sZW5ndGg7XG5cdFx0aWYgKHRoaXMubm90ZWJvb2tEaWZmRWRpdG9yLmN1cnJlbnRDaGFuZ2VkSW5kZXguZ2V0KCkgPT09IGNoYW5nZXMgLSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMubm90ZWJvb2tEaWZmRWRpdG9yLm5leHRDaGFuZ2UoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGVuYWJsZUFjY2Vzc2libGVEaWZmVmlldygpOiB2b2lkIHtcblx0XHQvL1xuXHR9XG5cdGFzeW5jIGFjY2VwdE5lYXJlc3RDaGFuZ2UoY2hhbmdlOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY2hhbmdlLmFjY2VwdCgpO1xuXHRcdHRoaXMubmV4dCh0cnVlKTtcblx0fVxuXHRhc3luYyByZWplY3ROZWFyZXN0Q2hhbmdlKGNoYW5nZTogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNoYW5nZS5yZWplY3QoKTtcblx0XHR0aGlzLm5leHQodHJ1ZSk7XG5cdH1cblx0YXN5bmMgdG9nZ2xlRGlmZihfY2hhbmdlOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rIHwgdW5kZWZpbmVkLCBfc2hvdz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvL1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFyZURvY3VtZW50RGlmZjJFcXVhbChkaWZmMTogSURvY3VtZW50RGlmZjIsIGRpZmYyOiBJRG9jdW1lbnREaWZmMik6IGJvb2xlYW4ge1xuXHRpZiAoZGlmZjEuY2hhbmdlcyAhPT0gZGlmZjIuY2hhbmdlcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEuaWRlbnRpY2FsICE9PSBkaWZmMi5pZGVudGljYWwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGRpZmYxLm1vdmVzICE9PSBkaWZmMi5tb3Zlcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEub3JpZ2luYWxNb2RlbCAhPT0gZGlmZjIub3JpZ2luYWxNb2RlbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEubW9kaWZpZWRNb2RlbCAhPT0gZGlmZjIubW9kaWZpZWRNb2RlbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEua2VlcCAhPT0gZGlmZjIua2VlcCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEudW5kbyAhPT0gZGlmZjIudW5kbykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEucXVpdEVhcmx5ICE9PSBkaWZmMi5xdWl0RWFybHkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGxhc3RDaGFuZ2VJbmRleChjaGFuZ2U6IElDZWxsRGlmZkluZm8pOiBudW1iZXIge1xuXHRpZiAoY2hhbmdlLnR5cGUgPT09ICdtb2RpZmllZCcpIHtcblx0XHRyZXR1cm4gY2hhbmdlLmRpZmYuZ2V0KCkuY2hhbmdlcy5sZW5ndGggLSAxO1xuXHR9XG5cdHJldHVybiAwO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLFNBQVMscUJBQXVELHFCQUFxQix1QkFBdUI7QUFDckgsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FB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
