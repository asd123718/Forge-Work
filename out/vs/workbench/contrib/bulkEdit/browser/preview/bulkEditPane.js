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
import { ButtonBar } from "../../../../../base/browser/ui/button/button.js";
import { CachedFunction, LRUCachedFunction } from "../../../../../base/common/cache.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import "./bulkEdit.css";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { WorkbenchAsyncDataTree } from "../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../../browser/labels.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { BulkEditPreviewProvider, BulkFileOperations, BulkFileOperationType } from "./bulkEditPreview.js";
import { BulkEditAccessibilityProvider, BulkEditDataSource, BulkEditDelegate, BulkEditIdentityProvider, BulkEditNaviLabelProvider, BulkEditSorter, CategoryElement, CategoryElementRenderer, compareBulkFileOperations, FileElement, FileElementRenderer, TextEditElement, TextEditElementRenderer } from "./bulkEditTree.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
var State = /* @__PURE__ */ ((State2) => {
  State2["Data"] = "data";
  State2["Message"] = "message";
  return State2;
})(State || {});
let BulkEditPane = class extends ViewPane {
  constructor(options, _instaService, _editorService, _labelService, _textModelService, _dialogService, _contextMenuService, _storageService, contextKeyService, viewDescriptorService, keybindingService, contextMenuService, configurationService, openerService, themeService, hoverService) {
    super(
      { ...options, titleMenuId: MenuId.BulkEditTitle },
      keybindingService,
      contextMenuService,
      configurationService,
      contextKeyService,
      viewDescriptorService,
      _instaService,
      openerService,
      themeService,
      hoverService
    );
    this._instaService = _instaService;
    this._editorService = _editorService;
    this._labelService = _labelService;
    this._textModelService = _textModelService;
    this._dialogService = _dialogService;
    this._contextMenuService = _contextMenuService;
    this._storageService = _storageService;
    this._treeViewStates = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    this._sessionDisposables = new DisposableStore();
    this._computeResourceDiffEditorInputs = new LRUCachedFunction(async (fileOperations) => {
      const computeDiffEditorInput = new CachedFunction(async (fileOperation) => {
        const fileOperationUri = fileOperation.uri;
        const previewUri = this._currentProvider.asPreviewUri(fileOperationUri);
        if (fileOperation.type & BulkFileOperationType.Delete) {
          return {
            original: { resource: URI.revive(previewUri) },
            modified: { resource: void 0 },
            goToFileResource: fileOperation.uri
          };
        } else {
          let leftResource;
          try {
            (await this._textModelService.createModelReference(fileOperationUri)).dispose();
            leftResource = fileOperationUri;
          } catch {
            leftResource = BulkEditPreviewProvider.emptyPreview;
          }
          return {
            original: { resource: URI.revive(leftResource) },
            modified: { resource: URI.revive(previewUri) },
            goToFileResource: leftResource
          };
        }
      });
      const sortedFileOperations = fileOperations.slice().sort(compareBulkFileOperations);
      const resources = [];
      for (const operation of sortedFileOperations) {
        resources.push(await computeDiffEditorInput.get(operation));
      }
      const getResourceDiffEditorInputIdOfOperation = async (operation) => {
        const resource = await computeDiffEditorInput.get(operation);
        return { original: resource.original.resource, modified: resource.modified.resource };
      };
      return {
        resources,
        getResourceDiffEditorInputIdOfOperation
      };
    });
    this.element.classList.add("bulk-edit-panel", "show-file-icons");
    this._ctxHasCategories = BulkEditPane.ctxHasCategories.bindTo(contextKeyService);
    this._ctxGroupByFile = BulkEditPane.ctxGroupByFile.bindTo(contextKeyService);
    this._ctxHasCheckedChanges = BulkEditPane.ctxHasCheckedChanges.bindTo(contextKeyService);
  }
  dispose() {
    this._tree.dispose();
    this._disposables.dispose();
    this._sessionDisposables.dispose();
    super.dispose();
  }
  renderBody(parent) {
    super.renderBody(parent);
    const resourceLabels = this._instaService.createInstance(
      ResourceLabels,
      { onDidChangeVisibility: this.onDidChangeBodyVisibility }
    );
    this._disposables.add(resourceLabels);
    const contentContainer = document.createElement("div");
    contentContainer.className = "content";
    parent.appendChild(contentContainer);
    const treeContainer = document.createElement("div");
    contentContainer.appendChild(treeContainer);
    this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
    this._treeDataSource.groupByFile = this._storageService.getBoolean(BulkEditPane._memGroupByFile, StorageScope.PROFILE, true);
    this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
    this._tree = this._instaService.createInstance(
      WorkbenchAsyncDataTree,
      this.id,
      treeContainer,
      new BulkEditDelegate(),
      [this._instaService.createInstance(TextEditElementRenderer), this._instaService.createInstance(FileElementRenderer, resourceLabels), this._instaService.createInstance(CategoryElementRenderer)],
      this._treeDataSource,
      {
        accessibilityProvider: this._instaService.createInstance(BulkEditAccessibilityProvider),
        identityProvider: new BulkEditIdentityProvider(),
        expandOnlyOnTwistieClick: true,
        multipleSelectionSupport: false,
        keyboardNavigationLabelProvider: new BulkEditNaviLabelProvider(),
        sorter: new BulkEditSorter(),
        selectionNavigation: true
      }
    );
    this._disposables.add(this._tree.onContextMenu(this._onContextMenu, this));
    this._disposables.add(this._tree.onDidOpen((e) => this._openElementInMultiDiffEditor(e)));
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "buttons";
    contentContainer.appendChild(buttonsContainer);
    const buttonBar = new ButtonBar(buttonsContainer);
    this._disposables.add(buttonBar);
    const btnConfirm = buttonBar.addButton({ supportIcons: true, ...defaultButtonStyles });
    btnConfirm.label = localize("ok", "Apply");
    btnConfirm.onDidClick(() => this.accept(), this, this._disposables);
    const btnCancel = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
    btnCancel.label = localize("cancel", "Discard");
    btnCancel.onDidClick(() => this.discard(), this, this._disposables);
    this._message = document.createElement("span");
    this._message.className = "message";
    this._message.innerText = localize("empty.msg", "Invoke a code action, like rename, to see a preview of its changes here.");
    parent.appendChild(this._message);
    this._setState("message" /* Message */);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    const treeHeight = height - 50;
    this._tree.getHTMLElement().parentElement.style.height = `${treeHeight}px`;
    this._tree.layout(treeHeight, width);
  }
  _setState(state) {
    this.element.dataset["state"] = state;
  }
  async setInput(edit, token) {
    this._setState("data" /* Data */);
    this._sessionDisposables.clear();
    this._treeViewStates.clear();
    if (this._currentResolve) {
      this._currentResolve(void 0);
      this._currentResolve = void 0;
    }
    const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
    this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, input);
    this._sessionDisposables.add(this._currentProvider);
    this._sessionDisposables.add(input);
    const hasCategories = input.categories.length > 1;
    this._ctxHasCategories.set(hasCategories);
    this._treeDataSource.groupByFile = !hasCategories || this._treeDataSource.groupByFile;
    this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
    this._currentInput = input;
    return new Promise((resolve) => {
      token.onCancellationRequested(() => resolve(void 0));
      this._currentResolve = resolve;
      this._setTreeInput(input);
      this._sessionDisposables.add(input.checked.onDidChange(() => {
        this._tree.updateChildren();
        this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
      }));
    });
  }
  hasInput() {
    return Boolean(this._currentInput);
  }
  async _setTreeInput(input) {
    const viewState = this._treeViewStates.get(this._treeDataSource.groupByFile);
    await this._tree.setInput(input, viewState);
    this._tree.domFocus();
    if (viewState) {
      return;
    }
    const expand = [...this._tree.getNode(input).children].slice(0, 10);
    while (expand.length > 0) {
      const { element } = expand.shift();
      if (element instanceof FileElement) {
        await this._tree.expand(element, true);
      }
      if (element instanceof CategoryElement) {
        await this._tree.expand(element, true);
        expand.push(...this._tree.getNode(element).children);
      }
    }
  }
  accept() {
    const conflicts = this._currentInput?.conflicts.list();
    if (!conflicts || conflicts.length === 0) {
      this._done(true);
      return;
    }
    let message;
    if (conflicts.length === 1) {
      message = localize("conflict.1", "Cannot apply refactoring because '{0}' has changed in the meantime.", this._labelService.getUriLabel(conflicts[0], { relative: true }));
    } else {
      message = localize("conflict.N", "Cannot apply refactoring because {0} other files have changed in the meantime.", conflicts.length);
    }
    this._dialogService.warn(message).finally(() => this._done(false));
  }
  discard() {
    this._done(false);
  }
  _done(accept) {
    this._currentResolve?.(accept ? this._currentInput?.getWorkspaceEdit() : void 0);
    this._currentInput = void 0;
    this._setState("message" /* Message */);
    this._sessionDisposables.clear();
  }
  toggleChecked() {
    const [first] = this._tree.getFocus();
    if ((first instanceof FileElement || first instanceof TextEditElement) && !first.isDisabled()) {
      first.setChecked(!first.isChecked());
    } else if (first instanceof CategoryElement) {
      first.setChecked(!first.isChecked());
    }
  }
  groupByFile() {
    if (!this._treeDataSource.groupByFile) {
      this.toggleGrouping();
    }
  }
  groupByType() {
    if (this._treeDataSource.groupByFile) {
      this.toggleGrouping();
    }
  }
  toggleGrouping() {
    const input = this._tree.getInput();
    if (input) {
      const oldViewState = this._tree.getViewState();
      this._treeViewStates.set(this._treeDataSource.groupByFile, oldViewState);
      this._treeDataSource.groupByFile = !this._treeDataSource.groupByFile;
      this._setTreeInput(input);
      this._storageService.store(BulkEditPane._memGroupByFile, this._treeDataSource.groupByFile, StorageScope.PROFILE, StorageTarget.USER);
      this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
    }
  }
  async _openElementInMultiDiffEditor(e) {
    const fileOperations = this._currentInput?.fileOperations;
    if (!fileOperations) {
      return;
    }
    let selection = void 0;
    let fileElement;
    if (e.element instanceof TextEditElement) {
      fileElement = e.element.parent;
      selection = e.element.edit.textEdit.textEdit.range;
    } else if (e.element instanceof FileElement) {
      fileElement = e.element;
      selection = e.element.edit.textEdits[0]?.textEdit.textEdit.range;
    } else {
      return;
    }
    const result = await this._computeResourceDiffEditorInputs.get(fileOperations);
    const resourceId = await result.getResourceDiffEditorInputIdOfOperation(fileElement.edit);
    const options = {
      ...e.editorOptions,
      viewState: {
        revealData: {
          resource: resourceId,
          range: selection
        }
      }
    };
    const multiDiffSource = URI.from({ scheme: BulkEditPane.Schema });
    const label = "Refactor Preview";
    this._editorService.openEditor({
      multiDiffSource,
      label,
      options,
      isTransient: true,
      description: label,
      resources: result.resources
    }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
  }
  _onContextMenu(e) {
    this._contextMenuService.showContextMenu({
      menuId: MenuId.BulkEditContext,
      contextKeyService: this.contextKeyService,
      getAnchor: () => e.anchor
    });
  }
};
BulkEditPane.ID = "refactorPreview";
BulkEditPane.Schema = "vscode-bulkeditpreview-multieditor";
BulkEditPane.ctxHasCategories = new RawContextKey("refactorPreview.hasCategories", false);
BulkEditPane.ctxGroupByFile = new RawContextKey("refactorPreview.groupByFile", true);
BulkEditPane.ctxHasCheckedChanges = new RawContextKey("refactorPreview.hasCheckedChanges", true);
BulkEditPane._memGroupByFile = `${BulkEditPane.ID}.groupByFile`;
BulkEditPane = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IContextMenuService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IOpenerService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, IHoverService)
], BulkEditPane);
export {
  BulkEditPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxwcmV2aWV3XFxidWxrRWRpdFBhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCdXR0b25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IENhY2hlZEZ1bmN0aW9uLCBMUlVDYWNoZWRGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhY2hlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9idWxrRWRpdC5jc3MnO1xuaW1wb3J0IHsgUmVzb3VyY2VFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNdWx0aURpZmZFZGl0b3JPcHRpb25zLCBJTXVsdGlEaWZmUmVzb3VyY2VJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuRXZlbnQsIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvclJlc291cmNlLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQnVsa0VkaXRQcmV2aWV3UHJvdmlkZXIsIEJ1bGtGaWxlT3BlcmF0aW9uLCBCdWxrRmlsZU9wZXJhdGlvbnMsIEJ1bGtGaWxlT3BlcmF0aW9uVHlwZSB9IGZyb20gJy4vYnVsa0VkaXRQcmV2aWV3LmpzJztcbmltcG9ydCB7IEJ1bGtFZGl0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBCdWxrRWRpdERhdGFTb3VyY2UsIEJ1bGtFZGl0RGVsZWdhdGUsIEJ1bGtFZGl0RWxlbWVudCwgQnVsa0VkaXRJZGVudGl0eVByb3ZpZGVyLCBCdWxrRWRpdE5hdmlMYWJlbFByb3ZpZGVyLCBCdWxrRWRpdFNvcnRlciwgQ2F0ZWdvcnlFbGVtZW50LCBDYXRlZ29yeUVsZW1lbnRSZW5kZXJlciwgY29tcGFyZUJ1bGtGaWxlT3BlcmF0aW9ucywgRmlsZUVsZW1lbnQsIEZpbGVFbGVtZW50UmVuZGVyZXIsIFRleHRFZGl0RWxlbWVudCwgVGV4dEVkaXRFbGVtZW50UmVuZGVyZXIgfSBmcm9tICcuL2J1bGtFZGl0VHJlZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcblxuY29uc3QgZW51bSBTdGF0ZSB7XG5cdERhdGEgPSAnZGF0YScsXG5cdE1lc3NhZ2UgPSAnbWVzc2FnZSdcbn1cblxuZXhwb3J0IGNsYXNzIEJ1bGtFZGl0UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmVmYWN0b3JQcmV2aWV3Jztcblx0c3RhdGljIHJlYWRvbmx5IFNjaGVtYSA9ICd2c2NvZGUtYnVsa2VkaXRwcmV2aWV3LW11bHRpZWRpdG9yJztcblxuXHRzdGF0aWMgcmVhZG9ubHkgY3R4SGFzQ2F0ZWdvcmllcyA9IG5ldyBSYXdDb250ZXh0S2V5KCdyZWZhY3RvclByZXZpZXcuaGFzQ2F0ZWdvcmllcycsIGZhbHNlKTtcblx0c3RhdGljIHJlYWRvbmx5IGN0eEdyb3VwQnlGaWxlID0gbmV3IFJhd0NvbnRleHRLZXkoJ3JlZmFjdG9yUHJldmlldy5ncm91cEJ5RmlsZScsIHRydWUpO1xuXHRzdGF0aWMgcmVhZG9ubHkgY3R4SGFzQ2hlY2tlZENoYW5nZXMgPSBuZXcgUmF3Q29udGV4dEtleSgncmVmYWN0b3JQcmV2aWV3Lmhhc0NoZWNrZWRDaGFuZ2VzJywgdHJ1ZSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21lbUdyb3VwQnlGaWxlID0gYCR7dGhpcy5JRH0uZ3JvdXBCeUZpbGVgO1xuXG5cdHByaXZhdGUgX3RyZWUhOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPEJ1bGtGaWxlT3BlcmF0aW9ucywgQnVsa0VkaXRFbGVtZW50LCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSBfdHJlZURhdGFTb3VyY2UhOiBCdWxrRWRpdERhdGFTb3VyY2U7XG5cdHByaXZhdGUgX3RyZWVWaWV3U3RhdGVzID0gbmV3IE1hcDxib29sZWFuLCBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZT4oKTtcblx0cHJpdmF0ZSBfbWVzc2FnZSE6IEhUTUxTcGFuRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhIYXNDYXRlZ29yaWVzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4R3JvdXBCeUZpbGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhIYXNDaGVja2VkQ2hhbmdlczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY3VycmVudFJlc29sdmU/OiAoZWRpdD86IFJlc291cmNlRWRpdFtdKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9jdXJyZW50SW5wdXQ/OiBCdWxrRmlsZU9wZXJhdGlvbnM7XG5cdHByaXZhdGUgX2N1cnJlbnRQcm92aWRlcj86IEJ1bGtFZGl0UHJldmlld1Byb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdHsgLi4ub3B0aW9ucywgdGl0bGVNZW51SWQ6IE1lbnVJZC5CdWxrRWRpdFRpdGxlIH0sXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgX2luc3RhU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2Vcblx0XHQpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2J1bGstZWRpdC1wYW5lbCcsICdzaG93LWZpbGUtaWNvbnMnKTtcblx0XHR0aGlzLl9jdHhIYXNDYXRlZ29yaWVzID0gQnVsa0VkaXRQYW5lLmN0eEhhc0NhdGVnb3JpZXMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhHcm91cEJ5RmlsZSA9IEJ1bGtFZGl0UGFuZS5jdHhHcm91cEJ5RmlsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eEhhc0NoZWNrZWRDaGFuZ2VzID0gQnVsa0VkaXRQYW5lLmN0eEhhc0NoZWNrZWRDaGFuZ2VzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KHBhcmVudCk7XG5cblx0XHRjb25zdCByZXNvdXJjZUxhYmVscyA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFJlc291cmNlTGFiZWxzLFxuXHRcdFx0eyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSB9XG5cdFx0KTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocmVzb3VyY2VMYWJlbHMpO1xuXG5cdFx0Y29uc3QgY29udGVudENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRlbnRDb250YWluZXIuY2xhc3NOYW1lID0gJ2NvbnRlbnQnO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChjb250ZW50Q29udGFpbmVyKTtcblxuXHRcdC8vIHRyZWVcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0cmVlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3RyZWVEYXRhU291cmNlID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1bGtFZGl0RGF0YVNvdXJjZSk7XG5cdFx0dGhpcy5fdHJlZURhdGFTb3VyY2UuZ3JvdXBCeUZpbGUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEJ1bGtFZGl0UGFuZS5fbWVtR3JvdXBCeUZpbGUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0cnVlKTtcblx0XHR0aGlzLl9jdHhHcm91cEJ5RmlsZS5zZXQodGhpcy5fdHJlZURhdGFTb3VyY2UuZ3JvdXBCeUZpbGUpO1xuXG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8QnVsa0ZpbGVPcGVyYXRpb25zLCBCdWxrRWRpdEVsZW1lbnQsIEZ1enp5U2NvcmU+LCB0aGlzLmlkLCB0cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3IEJ1bGtFZGl0RGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEVkaXRFbGVtZW50UmVuZGVyZXIpLCB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVsZW1lbnRSZW5kZXJlciwgcmVzb3VyY2VMYWJlbHMpLCB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2F0ZWdvcnlFbGVtZW50UmVuZGVyZXIpXSxcblx0XHRcdHRoaXMuX3RyZWVEYXRhU291cmNlLFxuXHRcdFx0e1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShCdWxrRWRpdEFjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBCdWxrRWRpdElkZW50aXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgQnVsa0VkaXROYXZpTGFiZWxQcm92aWRlcigpLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBCdWxrRWRpdFNvcnRlcigpLFxuXHRcdFx0XHRzZWxlY3Rpb25OYXZpZ2F0aW9uOiB0cnVlXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uQ29udGV4dE1lbnUodGhpcy5fb25Db250ZXh0TWVudSwgdGhpcykpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uRGlkT3BlbihlID0+IHRoaXMuX29wZW5FbGVtZW50SW5NdWx0aURpZmZFZGl0b3IoZSkpKTtcblxuXHRcdC8vIGJ1dHRvbnNcblx0XHRjb25zdCBidXR0b25zQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YnV0dG9uc0NvbnRhaW5lci5jbGFzc05hbWUgPSAnYnV0dG9ucyc7XG5cdFx0Y29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChidXR0b25zQ29udGFpbmVyKTtcblx0XHRjb25zdCBidXR0b25CYXIgPSBuZXcgQnV0dG9uQmFyKGJ1dHRvbnNDb250YWluZXIpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChidXR0b25CYXIpO1xuXG5cdFx0Y29uc3QgYnRuQ29uZmlybSA9IGJ1dHRvbkJhci5hZGRCdXR0b24oeyBzdXBwb3J0SWNvbnM6IHRydWUsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSk7XG5cdFx0YnRuQ29uZmlybS5sYWJlbCA9IGxvY2FsaXplKCdvaycsICdBcHBseScpO1xuXHRcdGJ0bkNvbmZpcm0ub25EaWRDbGljaygoKSA9PiB0aGlzLmFjY2VwdCgpLCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBidG5DYW5jZWwgPSBidXR0b25CYXIuYWRkQnV0dG9uKHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pO1xuXHRcdGJ0bkNhbmNlbC5sYWJlbCA9IGxvY2FsaXplKCdjYW5jZWwnLCAnRGlzY2FyZCcpO1xuXHRcdGJ0bkNhbmNlbC5vbkRpZENsaWNrKCgpID0+IHRoaXMuZGlzY2FyZCgpLCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBtZXNzYWdlXG5cdFx0dGhpcy5fbWVzc2FnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0aGlzLl9tZXNzYWdlLmNsYXNzTmFtZSA9ICdtZXNzYWdlJztcblx0XHR0aGlzLl9tZXNzYWdlLmlubmVyVGV4dCA9IGxvY2FsaXplKCdlbXB0eS5tc2cnLCBcIkludm9rZSBhIGNvZGUgYWN0aW9uLCBsaWtlIHJlbmFtZSwgdG8gc2VlIGEgcHJldmlldyBvZiBpdHMgY2hhbmdlcyBoZXJlLlwiKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fbWVzc2FnZSk7XG5cblx0XHQvL1xuXHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLk1lc3NhZ2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBoZWlnaHQgLSA1MDtcblx0XHR0aGlzLl90cmVlLmdldEhUTUxFbGVtZW50KCkucGFyZW50RWxlbWVudCEuc3R5bGUuaGVpZ2h0ID0gYCR7dHJlZUhlaWdodH1weGA7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQodHJlZUhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U3RhdGUoc3RhdGU6IFN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LmRhdGFzZXRbJ3N0YXRlJ10gPSBzdGF0ZTtcblx0fVxuXG5cdGFzeW5jIHNldElucHV0KGVkaXQ6IFJlc291cmNlRWRpdFtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlc291cmNlRWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuRGF0YSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdHJlZVZpZXdTdGF0ZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVzb2x2ZSkge1xuXHRcdFx0dGhpcy5fY3VycmVudFJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXNvbHZlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gYXdhaXQgdGhpcy5faW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKEJ1bGtGaWxlT3BlcmF0aW9ucy5jcmVhdGUsIGVkaXQpO1xuXHRcdHRoaXMuX2N1cnJlbnRQcm92aWRlciA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShCdWxrRWRpdFByZXZpZXdQcm92aWRlciwgaW5wdXQpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VycmVudFByb3ZpZGVyKTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKGlucHV0KTtcblxuXHRcdC8vXG5cdFx0Y29uc3QgaGFzQ2F0ZWdvcmllcyA9IGlucHV0LmNhdGVnb3JpZXMubGVuZ3RoID4gMTtcblx0XHR0aGlzLl9jdHhIYXNDYXRlZ29yaWVzLnNldChoYXNDYXRlZ29yaWVzKTtcblx0XHR0aGlzLl90cmVlRGF0YVNvdXJjZS5ncm91cEJ5RmlsZSA9ICFoYXNDYXRlZ29yaWVzIHx8IHRoaXMuX3RyZWVEYXRhU291cmNlLmdyb3VwQnlGaWxlO1xuXHRcdHRoaXMuX2N0eEhhc0NoZWNrZWRDaGFuZ2VzLnNldChpbnB1dC5jaGVja2VkLmNoZWNrZWRDb3VudCA+IDApO1xuXG5cdFx0dGhpcy5fY3VycmVudElucHV0ID0gaW5wdXQ7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8UmVzb3VyY2VFZGl0W10gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXG5cdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpO1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50UmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHR0aGlzLl9zZXRUcmVlSW5wdXQoaW5wdXQpO1xuXG5cdFx0XHQvLyByZWZyZXNoIHdoZW4gY2hlY2sgc3RhdGUgY2hhbmdlc1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZChpbnB1dC5jaGVja2VkLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHR0aGlzLl9jdHhIYXNDaGVja2VkQ2hhbmdlcy5zZXQoaW5wdXQuY2hlY2tlZC5jaGVja2VkQ291bnQgPiAwKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdGhhc0lucHV0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBCb29sZWFuKHRoaXMuX2N1cnJlbnRJbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZXRUcmVlSW5wdXQoaW5wdXQ6IEJ1bGtGaWxlT3BlcmF0aW9ucykge1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdHJlZVZpZXdTdGF0ZXMuZ2V0KHRoaXMuX3RyZWVEYXRhU291cmNlLmdyb3VwQnlGaWxlKTtcblx0XHRhd2FpdCB0aGlzLl90cmVlLnNldElucHV0KGlucHV0LCB2aWV3U3RhdGUpO1xuXHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblxuXHRcdGlmICh2aWV3U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBhc3luYyBleHBhbmRBbGwgKG1heD0xMCkgaXMgdGhlIGRlZmF1bHQgd2hlbiBubyB2aWV3IHN0YXRlIGlzIGdpdmVuXG5cdFx0Y29uc3QgZXhwYW5kID0gWy4uLnRoaXMuX3RyZWUuZ2V0Tm9kZShpbnB1dCkuY2hpbGRyZW5dLnNsaWNlKDAsIDEwKTtcblx0XHR3aGlsZSAoZXhwYW5kLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gZXhwYW5kLnNoaWZ0KCkhO1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90cmVlLmV4cGFuZChlbGVtZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ2F0ZWdvcnlFbGVtZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3RyZWUuZXhwYW5kKGVsZW1lbnQsIHRydWUpO1xuXHRcdFx0XHRleHBhbmQucHVzaCguLi50aGlzLl90cmVlLmdldE5vZGUoZWxlbWVudCkuY2hpbGRyZW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFjY2VwdCgpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRoaXMuX2N1cnJlbnRJbnB1dD8uY29uZmxpY3RzLmxpc3QoKTtcblxuXHRcdGlmICghY29uZmxpY3RzIHx8IGNvbmZsaWN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2RvbmUodHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRpZiAoY29uZmxpY3RzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb25mbGljdC4xJywgXCJDYW5ub3QgYXBwbHkgcmVmYWN0b3JpbmcgYmVjYXVzZSAnezB9JyBoYXMgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWUuXCIsIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChjb25mbGljdHNbMF0sIHsgcmVsYXRpdmU6IHRydWUgfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NvbmZsaWN0Lk4nLCBcIkNhbm5vdCBhcHBseSByZWZhY3RvcmluZyBiZWNhdXNlIHswfSBvdGhlciBmaWxlcyBoYXZlIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lLlwiLCBjb25mbGljdHMubGVuZ3RoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaWFsb2dTZXJ2aWNlLndhcm4obWVzc2FnZSkuZmluYWxseSgoKSA9PiB0aGlzLl9kb25lKGZhbHNlKSk7XG5cdH1cblxuXHRkaXNjYXJkKCkge1xuXHRcdHRoaXMuX2RvbmUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9uZShhY2NlcHQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50UmVzb2x2ZT8uKGFjY2VwdCA/IHRoaXMuX2N1cnJlbnRJbnB1dD8uZ2V0V29ya3NwYWNlRWRpdCgpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9jdXJyZW50SW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuTWVzc2FnZSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHR0b2dnbGVDaGVja2VkKCkge1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKChmaXJzdCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50IHx8IGZpcnN0IGluc3RhbmNlb2YgVGV4dEVkaXRFbGVtZW50KSAmJiAhZmlyc3QuaXNEaXNhYmxlZCgpKSB7XG5cdFx0XHRmaXJzdC5zZXRDaGVja2VkKCFmaXJzdC5pc0NoZWNrZWQoKSk7XG5cdFx0fSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIENhdGVnb3J5RWxlbWVudCkge1xuXHRcdFx0Zmlyc3Quc2V0Q2hlY2tlZCghZmlyc3QuaXNDaGVja2VkKCkpO1xuXHRcdH1cblx0fVxuXG5cdGdyb3VwQnlGaWxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJlZURhdGFTb3VyY2UuZ3JvdXBCeUZpbGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlR3JvdXBpbmcoKTtcblx0XHR9XG5cdH1cblxuXHRncm91cEJ5VHlwZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdHJlZURhdGFTb3VyY2UuZ3JvdXBCeUZpbGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlR3JvdXBpbmcoKTtcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVHcm91cGluZygpIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX3RyZWUuZ2V0SW5wdXQoKTtcblx0XHRpZiAoaW5wdXQpIHtcblxuXHRcdFx0Ly8gKDEpIGNhcHR1cmUgdmlldyBzdGF0ZVxuXHRcdFx0Y29uc3Qgb2xkVmlld1N0YXRlID0gdGhpcy5fdHJlZS5nZXRWaWV3U3RhdGUoKTtcblx0XHRcdHRoaXMuX3RyZWVWaWV3U3RhdGVzLnNldCh0aGlzLl90cmVlRGF0YVNvdXJjZS5ncm91cEJ5RmlsZSwgb2xkVmlld1N0YXRlKTtcblxuXHRcdFx0Ly8gKDIpIHRvZ2dsZSBhbmQgdXBkYXRlXG5cdFx0XHR0aGlzLl90cmVlRGF0YVNvdXJjZS5ncm91cEJ5RmlsZSA9ICF0aGlzLl90cmVlRGF0YVNvdXJjZS5ncm91cEJ5RmlsZTtcblx0XHRcdHRoaXMuX3NldFRyZWVJbnB1dChpbnB1dCk7XG5cblx0XHRcdC8vICgzKSByZW1lbWJlciBwcmVmZXJlbmNlXG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShCdWxrRWRpdFBhbmUuX21lbUdyb3VwQnlGaWxlLCB0aGlzLl90cmVlRGF0YVNvdXJjZS5ncm91cEJ5RmlsZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0aGlzLl9jdHhHcm91cEJ5RmlsZS5zZXQodGhpcy5fdHJlZURhdGFTb3VyY2UuZ3JvdXBCeUZpbGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5FbGVtZW50SW5NdWx0aURpZmZFZGl0b3IoZTogSU9wZW5FdmVudDxCdWxrRWRpdEVsZW1lbnQgfCB1bmRlZmluZWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBmaWxlT3BlcmF0aW9ucyA9IHRoaXMuX2N1cnJlbnRJbnB1dD8uZmlsZU9wZXJhdGlvbnM7XG5cdFx0aWYgKCFmaWxlT3BlcmF0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3Rpb246IElSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZmlsZUVsZW1lbnQ6IEZpbGVFbGVtZW50O1xuXHRcdGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXh0RWRpdEVsZW1lbnQpIHtcblx0XHRcdGZpbGVFbGVtZW50ID0gZS5lbGVtZW50LnBhcmVudDtcblx0XHRcdHNlbGVjdGlvbiA9IGUuZWxlbWVudC5lZGl0LnRleHRFZGl0LnRleHRFZGl0LnJhbmdlO1xuXHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgRmlsZUVsZW1lbnQpIHtcblx0XHRcdGZpbGVFbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdFx0c2VsZWN0aW9uID0gZS5lbGVtZW50LmVkaXQudGV4dEVkaXRzWzBdPy50ZXh0RWRpdC50ZXh0RWRpdC5yYW5nZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gaW52YWxpZCBldmVudFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NvbXB1dGVSZXNvdXJjZURpZmZFZGl0b3JJbnB1dHMuZ2V0KGZpbGVPcGVyYXRpb25zKTtcblx0XHRjb25zdCByZXNvdXJjZUlkID0gYXdhaXQgcmVzdWx0LmdldFJlc291cmNlRGlmZkVkaXRvcklucHV0SWRPZk9wZXJhdGlvbihmaWxlRWxlbWVudC5lZGl0KTtcblx0XHRjb25zdCBvcHRpb25zOiBNdXRhYmxlPElNdWx0aURpZmZFZGl0b3JPcHRpb25zPiA9IHtcblx0XHRcdC4uLmUuZWRpdG9yT3B0aW9ucyxcblx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRyZXZlYWxEYXRhOiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlSWQsXG5cdFx0XHRcdFx0cmFuZ2U6IHNlbGVjdGlvbixcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgbXVsdGlEaWZmU291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEJ1bGtFZGl0UGFuZS5TY2hlbWEgfSk7XG5cdFx0Y29uc3QgbGFiZWwgPSAnUmVmYWN0b3IgUHJldmlldyc7XG5cdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG11bHRpRGlmZlNvdXJjZSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGlzVHJhbnNpZW50OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxhYmVsLFxuXHRcdFx0cmVzb3VyY2VzOiByZXN1bHQucmVzb3VyY2VzXG5cdFx0fSwgZS5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wdXRlUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXRzID0gbmV3IExSVUNhY2hlZEZ1bmN0aW9uPFxuXHRcdEJ1bGtGaWxlT3BlcmF0aW9uW10sXG5cdFx0UHJvbWlzZTx7IHJlc291cmNlczogSU11bHRpRGlmZkVkaXRvclJlc291cmNlW107IGdldFJlc291cmNlRGlmZkVkaXRvcklucHV0SWRPZk9wZXJhdGlvbjogKG9wZXJhdGlvbjogQnVsa0ZpbGVPcGVyYXRpb24pID0+IFByb21pc2U8SU11bHRpRGlmZlJlc291cmNlSWQ+IH0+XG5cdD4oYXN5bmMgKGZpbGVPcGVyYXRpb25zKSA9PiB7XG5cdFx0Y29uc3QgY29tcHV0ZURpZmZFZGl0b3JJbnB1dCA9IG5ldyBDYWNoZWRGdW5jdGlvbjxCdWxrRmlsZU9wZXJhdGlvbiwgUHJvbWlzZTxJTXVsdGlEaWZmRWRpdG9yUmVzb3VyY2U+Pihhc3luYyAoZmlsZU9wZXJhdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZU9wZXJhdGlvblVyaSA9IGZpbGVPcGVyYXRpb24udXJpO1xuXHRcdFx0Y29uc3QgcHJldmlld1VyaSA9IHRoaXMuX2N1cnJlbnRQcm92aWRlciEuYXNQcmV2aWV3VXJpKGZpbGVPcGVyYXRpb25VcmkpO1xuXHRcdFx0Ly8gZGVsZXRlXG5cdFx0XHRpZiAoZmlsZU9wZXJhdGlvbi50eXBlICYgQnVsa0ZpbGVPcGVyYXRpb25UeXBlLkRlbGV0ZSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKHByZXZpZXdVcmkpIH0sXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdGdvVG9GaWxlUmVzb3VyY2U6IGZpbGVPcGVyYXRpb24udXJpLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJTXVsdGlEaWZmRWRpdG9yUmVzb3VyY2U7XG5cblx0XHRcdH1cblx0XHRcdC8vIHJlbmFtZSwgY3JlYXRlLCBlZGl0c1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGxldCBsZWZ0UmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQoYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShmaWxlT3BlcmF0aW9uVXJpKSkuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGxlZnRSZXNvdXJjZSA9IGZpbGVPcGVyYXRpb25Vcmk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdGxlZnRSZXNvdXJjZSA9IEJ1bGtFZGl0UHJldmlld1Byb3ZpZGVyLmVtcHR5UHJldmlldztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKGxlZnRSZXNvdXJjZSkgfSxcblx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLnJldml2ZShwcmV2aWV3VXJpKSB9LFxuXHRcdFx0XHRcdGdvVG9GaWxlUmVzb3VyY2U6IGxlZnRSZXNvdXJjZSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSU11bHRpRGlmZkVkaXRvclJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkRmlsZU9wZXJhdGlvbnMgPSBmaWxlT3BlcmF0aW9ucy5zbGljZSgpLnNvcnQoY29tcGFyZUJ1bGtGaWxlT3BlcmF0aW9ucyk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzOiBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIHNvcnRlZEZpbGVPcGVyYXRpb25zKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaChhd2FpdCBjb21wdXRlRGlmZkVkaXRvcklucHV0LmdldChvcGVyYXRpb24pKTtcblx0XHR9XG5cdFx0Y29uc3QgZ2V0UmVzb3VyY2VEaWZmRWRpdG9ySW5wdXRJZE9mT3BlcmF0aW9uID0gYXN5bmMgKG9wZXJhdGlvbjogQnVsa0ZpbGVPcGVyYXRpb24pOiBQcm9taXNlPElNdWx0aURpZmZSZXNvdXJjZUlkPiA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IGNvbXB1dGVEaWZmRWRpdG9ySW5wdXQuZ2V0KG9wZXJhdGlvbik7XG5cdFx0XHRyZXR1cm4geyBvcmlnaW5hbDogcmVzb3VyY2Uub3JpZ2luYWwucmVzb3VyY2UsIG1vZGlmaWVkOiByZXNvdXJjZS5tb2RpZmllZC5yZXNvdXJjZSB9O1xuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlcyxcblx0XHRcdGdldFJlc291cmNlRGlmZkVkaXRvcklucHV0SWRPZk9wZXJhdGlvblxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PGFueT4pOiB2b2lkIHtcblxuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuQnVsa0VkaXRDb250ZXh0LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBR2xELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsV0FBVztBQUNwQixPQUFPO0FBSVAsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9C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
