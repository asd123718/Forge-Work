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
import { Event } from "../../../../base/common/event.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SortOrder, LexicographicOptions } from "../common/files.js";
import { ExplorerItem, ExplorerModel } from "../common/explorerModel.js";
import { FileOperation, IFileService, FileChangeType } from "../../../../platform/files/common/files.js";
import { dirname, basename } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { UndoRedoSource } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { ExplorerDecorationsProvider } from "./views/explorerDecorationsProvider.js";
const UNDO_REDO_SOURCE = new UndoRedoSource();
let ExplorerService = class {
  constructor(fileService, configurationService, contextService, clipboardService, editorService, uriIdentityService, bulkEditService, progressService, hostService, filesConfigurationService, decorationsService) {
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.clipboardService = clipboardService;
    this.editorService = editorService;
    this.uriIdentityService = uriIdentityService;
    this.bulkEditService = bulkEditService;
    this.progressService = progressService;
    this.filesConfigurationService = filesConfigurationService;
    this.decorationsService = decorationsService;
    // delay in ms to react to file changes to give our internal events a chance to react first
    this.disposables = new DisposableStore();
    this.decorationsProviderRegistered = false;
    this.fileChangeEvents = [];
    this.config = this.configurationService.getValue("explorer");
    this.model = new ExplorerModel(this.contextService, this.uriIdentityService, this.fileService, this.configurationService, this.filesConfigurationService);
    this.disposables.add(this.model);
    this.disposables.add(this.fileService.onDidRunOperation((e) => this.onDidRunOperation(e)));
    this.onFileChangesScheduler = this.disposables.add(new RunOnceScheduler(async () => {
      const events = this.fileChangeEvents;
      this.fileChangeEvents = [];
      const types = [FileChangeType.DELETED];
      if (this.config.sortOrder === SortOrder.Modified) {
        types.push(FileChangeType.UPDATED);
      }
      let shouldRefresh = false;
      this.roots.forEach((r) => {
        if (this.view && !shouldRefresh) {
          shouldRefresh = doesFileEventAffect(r, this.view, events, types);
        }
      });
      events.forEach((e) => {
        if (!shouldRefresh) {
          for (const resource of e.rawAdded) {
            const parent = this.model.findClosest(dirname(resource));
            if (parent && !parent.getChild(basename(resource))) {
              shouldRefresh = true;
              break;
            }
          }
        }
      });
      if (shouldRefresh) {
        await this.refresh(false);
      }
    }, ExplorerService.EXPLORER_FILE_CHANGES_REACT_DELAY));
    this.disposables.add(this.fileService.onDidFilesChange((e) => {
      this.fileChangeEvents.push(e);
      if (this.editable) {
        return;
      }
      if (!this.onFileChangesScheduler.isScheduled()) {
        this.onFileChangesScheduler.schedule();
      }
    }));
    this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this.disposables.add(Event.any(this.fileService.onDidChangeFileSystemProviderRegistrations, this.fileService.onDidChangeFileSystemProviderCapabilities)(async (e) => {
      let affected = false;
      this.model.roots.forEach((r) => {
        if (r.resource.scheme === e.scheme) {
          affected = true;
          r.forgetChildren();
        }
      });
      if (affected) {
        if (this.view) {
          await this.view.setTreeInput();
        }
      }
    }));
    this.disposables.add(this.model.onDidChangeRoots(() => {
      this.view?.setTreeInput();
    }));
    this.disposables.add(hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        this.refresh(false);
      }
    }));
    this.revealExcludeMatcher = new ResourceGlobMatcher(
      (uri) => getRevealExcludes(configurationService.getValue({ resource: uri })),
      (event) => event.affectsConfiguration("explorer.autoRevealExclude"),
      contextService,
      configurationService
    );
    this.disposables.add(this.revealExcludeMatcher);
  }
  get roots() {
    return this.model.roots;
  }
  get sortOrderConfiguration() {
    return {
      sortOrder: this.config.sortOrder,
      lexicographicOptions: this.config.sortOrderLexicographicOptions,
      reverse: this.config.sortOrderReverse
    };
  }
  registerView(contextProvider) {
    this.view = contextProvider;
    if (!this.decorationsProviderRegistered) {
      this.decorationsProviderRegistered = true;
      const provider = this.disposables.add(new ExplorerDecorationsProvider(this, this.contextService));
      this.disposables.add(this.decorationsService.registerDecorationsProvider(provider));
    }
  }
  getViewId() {
    return this.view?.id;
  }
  getContext(respectMultiSelection, ignoreNestedChildren = false) {
    if (!this.view) {
      return [];
    }
    const items = new Set(this.view.getContext(respectMultiSelection));
    items.forEach((item) => {
      try {
        if (respectMultiSelection && !ignoreNestedChildren && this.view?.isItemCollapsed(item) && item.nestedChildren) {
          for (const child of item.nestedChildren) {
            items.add(child);
          }
        }
      } catch {
        return;
      }
    });
    return [...items];
  }
  async applyBulkEdit(edit, options) {
    const cancellationTokenSource = new CancellationTokenSource();
    const location = options.progressLocation ?? ProgressLocation.Window;
    let progressOptions;
    if (location === ProgressLocation.Window) {
      progressOptions = {
        location,
        title: options.progressLabel,
        cancellable: edit.length > 1
      };
    } else {
      progressOptions = {
        location,
        title: options.progressLabel,
        cancellable: edit.length > 1,
        delay: 500
      };
    }
    const promise = this.progressService.withProgress(progressOptions, async (progress) => {
      await this.bulkEditService.apply(edit, {
        undoRedoSource: UNDO_REDO_SOURCE,
        label: options.undoLabel,
        code: "undoredo.explorerOperation",
        progress,
        token: cancellationTokenSource.token,
        confirmBeforeUndo: options.confirmBeforeUndo
      });
    }, () => cancellationTokenSource.cancel());
    await this.progressService.withProgress({ location: ProgressLocation.Explorer, delay: 500 }, () => promise);
    cancellationTokenSource.dispose();
  }
  hasViewFocus() {
    return !!this.view && this.view.hasFocus();
  }
  // IExplorerService methods
  findClosest(resource) {
    return this.model.findClosest(resource);
  }
  findClosestRoot(resource) {
    const parentRoots = this.model.roots.filter((r) => this.uriIdentityService.extUri.isEqualOrParent(resource, r.resource)).sort((first, second) => second.resource.path.length - first.resource.path.length);
    return parentRoots.length ? parentRoots[0] : null;
  }
  async setEditable(stat, data) {
    if (!this.view) {
      return;
    }
    if (!data) {
      this.editable = void 0;
    } else {
      this.editable = { stat, data };
    }
    const isEditing = this.isEditable(stat);
    try {
      await this.view.setEditable(stat, isEditing);
    } catch {
      return;
    }
    if (!this.editable && this.fileChangeEvents.length && !this.onFileChangesScheduler.isScheduled()) {
      this.onFileChangesScheduler.schedule();
    }
  }
  async setToCopy(items, cut) {
    const previouslyCutItems = this.cutItems;
    this.cutItems = cut ? items : void 0;
    await this.clipboardService.writeResources(items.map((s) => s.resource));
    this.view?.itemsCopied(items, cut, previouslyCutItems);
  }
  isCut(item) {
    return !!this.cutItems && this.cutItems.some((i) => this.uriIdentityService.extUri.isEqual(i.resource, item.resource));
  }
  getEditable() {
    return this.editable;
  }
  getEditableData(stat) {
    return this.editable && this.editable.stat === stat ? this.editable.data : void 0;
  }
  isEditable(stat) {
    return !!this.editable && (this.editable.stat === stat || !stat);
  }
  async select(resource, reveal) {
    if (!this.view) {
      return;
    }
    const ignoreRevealExcludes = reveal === "force";
    const fileStat = this.findClosest(resource);
    if (fileStat) {
      if (!this.shouldAutoRevealItem(fileStat, ignoreRevealExcludes)) {
        return;
      }
      await this.view.selectResource(fileStat.resource, reveal);
      return Promise.resolve(void 0);
    }
    const options = { resolveTo: [resource], resolveMetadata: this.config.sortOrder === SortOrder.Modified };
    const root = this.findClosestRoot(resource);
    if (!root) {
      return void 0;
    }
    try {
      const stat = await this.fileService.resolve(root.resource, options);
      const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, void 0, options.resolveTo);
      ExplorerItem.mergeLocalWithDisk(modelStat, root);
      const item = root.find(resource);
      await this.view.refresh(true, root);
      if (item && !this.shouldAutoRevealItem(item, ignoreRevealExcludes)) {
        return;
      }
      await this.view.selectResource(item ? item.resource : void 0, reveal);
    } catch (error) {
      root.error = error;
      await this.view.refresh(false, root);
    }
  }
  async refresh(reveal = true) {
    if (this.view?.hasPhantomElements()) {
      return;
    }
    this.model.roots.forEach((r) => r.forgetChildren());
    if (this.view) {
      await this.view.refresh(true);
      const resource = this.editorService.activeEditor?.resource;
      const autoReveal = this.configurationService.getValue().explorer.autoReveal;
      if (reveal && resource && autoReveal) {
        this.select(resource, autoReveal);
      }
    }
  }
  // File events
  async onDidRunOperation(e) {
    const shouldDeepRefresh = this.config.fileNesting.enabled;
    if (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY)) {
      const addedElement = e.target;
      const parentResource = dirname(addedElement.resource);
      const parents = this.model.findAll(parentResource);
      if (parents.length) {
        await Promise.all(parents.map(async (p) => {
          const resolveMetadata = this.config.sortOrder === `modified`;
          if (!p.isDirectoryResolved) {
            const stat = await this.fileService.resolve(p.resource, { resolveMetadata });
            if (stat) {
              const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, p.parent);
              ExplorerItem.mergeLocalWithDisk(modelStat, p);
            }
          }
          const childElement = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, addedElement, p.parent);
          p.removeChild(childElement);
          p.addChild(childElement);
          await this.view?.refresh(shouldDeepRefresh, p);
        }));
      }
    } else if (e.isOperation(FileOperation.MOVE)) {
      const oldResource = e.resource;
      const newElement = e.target;
      const oldParentResource = dirname(oldResource);
      const newParentResource = dirname(newElement.resource);
      const modelElements = this.model.findAll(oldResource);
      const sameParentMove = modelElements.every((e2) => !e2.nestedParent) && this.uriIdentityService.extUri.isEqual(oldParentResource, newParentResource);
      if (sameParentMove) {
        await Promise.all(modelElements.map(async (modelElement) => {
          modelElement.rename(newElement);
          await this.view?.refresh(shouldDeepRefresh, modelElement.parent);
        }));
      } else {
        const newParents = this.model.findAll(newParentResource);
        if (newParents.length && modelElements.length) {
          await Promise.all(modelElements.map(async (modelElement, index) => {
            const oldParent = modelElement.parent;
            const oldNestedParent = modelElement.nestedParent;
            modelElement.move(newParents[index]);
            if (oldNestedParent) {
              await this.view?.refresh(false, oldNestedParent);
            }
            await this.view?.refresh(false, oldParent);
            await this.view?.refresh(shouldDeepRefresh, newParents[index]);
          }));
        }
      }
    } else if (e.isOperation(FileOperation.DELETE)) {
      const modelElements = this.model.findAll(e.resource);
      await Promise.all(modelElements.map(async (modelElement) => {
        if (modelElement.parent) {
          const parent = modelElement.parent;
          parent.removeChild(modelElement);
          this.view?.focusNext();
          const oldNestedParent = modelElement.nestedParent;
          if (oldNestedParent) {
            oldNestedParent.removeChild(modelElement);
            await this.view?.refresh(false, oldNestedParent);
          }
          await this.view?.refresh(shouldDeepRefresh, parent);
          if (this.view?.getFocus().length === 0) {
            this.view?.focusLast();
          }
        }
      }));
    }
  }
  // Check if an item matches a explorer.autoRevealExclude pattern
  shouldAutoRevealItem(item, ignore) {
    if (item === void 0 || ignore) {
      return true;
    }
    if (this.revealExcludeMatcher.matches(item.resource, (name) => !!item.parent?.getChild(name))) {
      return false;
    }
    const root = item.root;
    let currentItem = item.parent;
    while (currentItem !== root) {
      if (currentItem === void 0) {
        return true;
      }
      if (this.revealExcludeMatcher.matches(currentItem.resource)) {
        return false;
      }
      currentItem = currentItem.parent;
    }
    return true;
  }
  async onConfigurationUpdated(event) {
    if (!event.affectsConfiguration("explorer")) {
      return;
    }
    let shouldRefresh = false;
    if (event.affectsConfiguration("explorer.fileNesting")) {
      shouldRefresh = true;
    }
    const configuration = this.configurationService.getValue();
    const configSortOrder = configuration?.explorer?.sortOrder || SortOrder.Default;
    if (this.config.sortOrder !== configSortOrder) {
      shouldRefresh = this.config.sortOrder !== void 0;
    }
    const configLexicographicOptions = configuration?.explorer?.sortOrderLexicographicOptions || LexicographicOptions.Default;
    if (this.config.sortOrderLexicographicOptions !== configLexicographicOptions) {
      shouldRefresh = shouldRefresh || this.config.sortOrderLexicographicOptions !== void 0;
    }
    const sortOrderReverse = configuration?.explorer?.sortOrderReverse || false;
    if (this.config.sortOrderReverse !== sortOrderReverse) {
      shouldRefresh = shouldRefresh || this.config.sortOrderReverse !== void 0;
    }
    this.config = configuration.explorer;
    if (shouldRefresh) {
      await this.refresh();
    }
  }
  dispose() {
    this.disposables.dispose();
  }
};
ExplorerService.EXPLORER_FILE_CHANGES_REACT_DELAY = 500;
ExplorerService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IBulkEditService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IDecorationsService)
], ExplorerService);
function doesFileEventAffect(item, view, events, types) {
  for (const [_name, child] of item.children) {
    if (view.isItemVisible(child)) {
      if (events.some((e) => e.contains(child.resource, ...types))) {
        return true;
      }
      if (child.isDirectory && child.isDirectoryResolved) {
        if (doesFileEventAffect(child, view, events, types)) {
          return true;
        }
      }
    }
  }
  return false;
}
function getRevealExcludes(configuration) {
  const revealExcludes = configuration?.explorer?.autoRevealExclude;
  if (!revealExcludes) {
    return {};
  }
  return revealExcludes;
}
export {
  ExplorerService,
  UNDO_REDO_SOURCE
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxleHBsb3JlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uLCBJU29ydE9yZGVyQ29uZmlndXJhdGlvbiwgU29ydE9yZGVyLCBMZXhpY29ncmFwaGljT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBFeHBsb3Jlckl0ZW0sIEV4cGxvcmVyTW9kZWwgfSBmcm9tICcuLi9jb21tb24vZXhwbG9yZXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkV2ZW50LCBGaWxlT3BlcmF0aW9uLCBJRmlsZVNlcnZpY2UsIEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlLCBJUmVzb2x2ZUZpbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRhYmxlRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UsIFJlc291cmNlRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVW5kb1JlZG9Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyVmlldywgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiwgSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucywgSVByb2dyZXNzT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFJlc291cmNlR2xvYk1hdGNoZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJEZWNvcmF0aW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi92aWV3cy9leHBsb3JlckRlY29yYXRpb25zUHJvdmlkZXIuanMnO1xuXG5leHBvcnQgY29uc3QgVU5ET19SRURPX1NPVVJDRSA9IG5ldyBVbmRvUmVkb1NvdXJjZSgpO1xuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJTZXJ2aWNlIGltcGxlbWVudHMgSUV4cGxvcmVyU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVYUExPUkVSX0ZJTEVfQ0hBTkdFU19SRUFDVF9ERUxBWSA9IDUwMDsgLy8gZGVsYXkgaW4gbXMgdG8gcmVhY3QgdG8gZmlsZSBjaGFuZ2VzIHRvIGdpdmUgb3VyIGludGVybmFsIGV2ZW50cyBhIGNoYW5jZSB0byByZWFjdCBmaXJzdFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgZWRpdGFibGU6IHsgc3RhdDogRXhwbG9yZXJJdGVtOyBkYXRhOiBJRWRpdGFibGVEYXRhIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29uZmlnOiBJRmlsZXNDb25maWd1cmF0aW9uWydleHBsb3JlciddO1xuXHRwcml2YXRlIGN1dEl0ZW1zOiBFeHBsb3Jlckl0ZW1bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aWV3OiBJRXhwbG9yZXJWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRlY29yYXRpb25zUHJvdmlkZXJSZWdpc3RlcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgbW9kZWw6IEV4cGxvcmVyTW9kZWw7XG5cdHByaXZhdGUgb25GaWxlQ2hhbmdlc1NjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBmaWxlQ2hhbmdlRXZlbnRzOiBGaWxlQ2hhbmdlc0V2ZW50W10gPSBbXTtcblx0cHJpdmF0ZSByZXZlYWxFeGNsdWRlTWF0Y2hlcjogUmVzb3VyY2VHbG9iTWF0Y2hlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJ1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5jb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdleHBsb3JlcicpO1xuXG5cdFx0dGhpcy5tb2RlbCA9IG5ldyBFeHBsb3Jlck1vZGVsKHRoaXMuY29udGV4dFNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubW9kZWwpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiB0aGlzLm9uRGlkUnVuT3BlcmF0aW9uKGUpKSk7XG5cblx0XHR0aGlzLm9uRmlsZUNoYW5nZXNTY2hlZHVsZXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudHMgPSB0aGlzLmZpbGVDaGFuZ2VFdmVudHM7XG5cdFx0XHR0aGlzLmZpbGVDaGFuZ2VFdmVudHMgPSBbXTtcblxuXHRcdFx0Ly8gRmlsdGVyIHRvIHRoZSBvbmVzIHdlIGNhcmVcblx0XHRcdGNvbnN0IHR5cGVzID0gW0ZpbGVDaGFuZ2VUeXBlLkRFTEVURURdO1xuXHRcdFx0aWYgKHRoaXMuY29uZmlnLnNvcnRPcmRlciA9PT0gU29ydE9yZGVyLk1vZGlmaWVkKSB7XG5cdFx0XHRcdHR5cGVzLnB1c2goRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzaG91bGRSZWZyZXNoID0gZmFsc2U7XG5cdFx0XHQvLyBGb3IgREVMRVRFRCBhbmQgVVBEQVRFRCBldmVudHMgZ28gdGhyb3VnaCB0aGUgZXhwbG9yZXIgbW9kZWwgYW5kIGNoZWNrIGlmIGFueSBvZiB0aGUgaXRlbXMgZ290IGFmZmVjdGVkXG5cdFx0XHR0aGlzLnJvb3RzLmZvckVhY2gociA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXcgJiYgIXNob3VsZFJlZnJlc2gpIHtcblx0XHRcdFx0XHRzaG91bGRSZWZyZXNoID0gZG9lc0ZpbGVFdmVudEFmZmVjdChyLCB0aGlzLnZpZXcsIGV2ZW50cywgdHlwZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdC8vIEZvciBBRERFRCBldmVudHMgd2UgbmVlZCB0byBnbyB0aHJvdWdoIGFsbCB0aGUgZXZlbnRzIGFuZCBjaGVjayBpZiB0aGUgZXhwbG9yZXIgaXMgYWxyZWFkeSBhd2FyZSBvZiBzb21lIG9mIHRoZW1cblx0XHRcdC8vIE9yIGlmIHRoZXkgYWZmZWN0IG5vdCB5ZXQgcmVzb2x2ZWQgcGFydHMgb2YgdGhlIGV4cGxvcmVyLiBJZiB0aGF0IGlzIHRoZSBjYXNlIHdlIHdpbGwgbm90IHJlZnJlc2guXG5cdFx0XHRldmVudHMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0aWYgKCFzaG91bGRSZWZyZXNoKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBlLnJhd0FkZGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLm1vZGVsLmZpbmRDbG9zZXN0KGRpcm5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRcdC8vIFBhcmVudCBvZiB0aGUgYWRkZWQgcmVzb3VyY2UgaXMgcmVzb2x2ZWQgYW5kIHRoZSBleHBsb3JlciBtb2RlbCBpcyBub3QgYXdhcmUgb2YgdGhlIGFkZGVkIHJlc291cmNlIC0gd2UgbmVlZCB0byByZWZyZXNoXG5cdFx0XHRcdFx0XHRpZiAocGFyZW50ICYmICFwYXJlbnQuZ2V0Q2hpbGQoYmFzZW5hbWUocmVzb3VyY2UpKSkge1xuXHRcdFx0XHRcdFx0XHRzaG91bGRSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHNob3VsZFJlZnJlc2gpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdH0sIEV4cGxvcmVyU2VydmljZS5FWFBMT1JFUl9GSUxFX0NIQU5HRVNfUkVBQ1RfREVMQVkpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuZmlsZUNoYW5nZUV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0Ly8gRG9uJ3QgbWVzcyB3aXRoIHRoZSBmaWxlIHRyZWUgd2hpbGUgaW4gdGhlIHByb2Nlc3Mgb2YgZWRpdGluZy4gIzExMjI5M1xuXHRcdFx0aWYgKHRoaXMuZWRpdGFibGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLm9uRmlsZUNoYW5nZXNTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLm9uRmlsZUNoYW5nZXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnk8eyBzY2hlbWU6IHN0cmluZyB9Pih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucywgdGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcykoYXN5bmMgZSA9PiB7XG5cdFx0XHRsZXQgYWZmZWN0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMubW9kZWwucm9vdHMuZm9yRWFjaChyID0+IHtcblx0XHRcdFx0aWYgKHIucmVzb3VyY2Uuc2NoZW1lID09PSBlLnNjaGVtZSkge1xuXHRcdFx0XHRcdGFmZmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyLmZvcmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKGFmZmVjdGVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXcpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXcuc2V0VHJlZUlucHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5tb2RlbC5vbkRpZENoYW5nZVJvb3RzKCgpID0+IHtcblx0XHRcdHRoaXMudmlldz8uc2V0VHJlZUlucHV0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVmcmVzaCBleHBsb3JlciB3aGVuIHdpbmRvdyBnZXRzIGZvY3VzIHRvIGNvbXBlbnNhdGUgZm9yIG1pc3NpbmcgZmlsZSBldmVudHMgIzEyNjgxN1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoaGFzRm9jdXMgPT4ge1xuXHRcdFx0aWYgKGhhc0ZvY3VzKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMucmV2ZWFsRXhjbHVkZU1hdGNoZXIgPSBuZXcgUmVzb3VyY2VHbG9iTWF0Y2hlcihcblx0XHRcdCh1cmkpID0+IGdldFJldmVhbEV4Y2x1ZGVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHVyaSB9KSksXG5cdFx0XHQoZXZlbnQpID0+IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5hdXRvUmV2ZWFsRXhjbHVkZScpLFxuXHRcdFx0Y29udGV4dFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnJldmVhbEV4Y2x1ZGVNYXRjaGVyKTtcblx0fVxuXG5cdGdldCByb290cygpOiBFeHBsb3Jlckl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucm9vdHM7XG5cdH1cblxuXHRnZXQgc29ydE9yZGVyQ29uZmlndXJhdGlvbigpOiBJU29ydE9yZGVyQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNvcnRPcmRlcjogdGhpcy5jb25maWcuc29ydE9yZGVyLFxuXHRcdFx0bGV4aWNvZ3JhcGhpY09wdGlvbnM6IHRoaXMuY29uZmlnLnNvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zLFxuXHRcdFx0cmV2ZXJzZTogdGhpcy5jb25maWcuc29ydE9yZGVyUmV2ZXJzZSxcblx0XHR9O1xuXHR9XG5cblx0cmVnaXN0ZXJWaWV3KGNvbnRleHRQcm92aWRlcjogSUV4cGxvcmVyVmlldyk6IHZvaWQge1xuXHRcdHRoaXMudmlldyA9IGNvbnRleHRQcm92aWRlcjtcblxuXHRcdC8vIFRoZSBleHBsb3JlciBkZWNvcmF0aW9ucyBhcmUgY29tcHV0ZWQgZnJvbSB0aGlzICh3aW5kb3cgd2lkZSkgbW9kZWwgYW5kXG5cdFx0Ly8gYXJlIHRoZXJlZm9yZSBzaGFyZWQgYnkgYWxsIGV4cGxvcmVyIHZpZXdzLiBSZWdpc3RlciB0aGUgcHJvdmlkZXIgb25seVxuXHRcdC8vIG9uY2UsIG90aGVyd2lzZSBlYWNoIHZpZXcgY29udHJpYnV0ZXMgaXRzIG93biBiYWRnZSBhbmQgZGVjb3JhdGlvbnNcblx0XHQvLyByZW5kZXIgbXVsdGlwbGUgdGltZXMgcGVyIHJlc291cmNlLlxuXHRcdGlmICghdGhpcy5kZWNvcmF0aW9uc1Byb3ZpZGVyUmVnaXN0ZXJlZCkge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9uc1Byb3ZpZGVyUmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFeHBsb3JlckRlY29yYXRpb25zUHJvdmlkZXIodGhpcywgdGhpcy5jb250ZXh0U2VydmljZSkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5kZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Vmlld0lkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldz8uaWQ7XG5cdH1cblxuXHRnZXRDb250ZXh0KHJlc3BlY3RNdWx0aVNlbGVjdGlvbjogYm9vbGVhbiwgaWdub3JlTmVzdGVkQ2hpbGRyZW46IGJvb2xlYW4gPSBmYWxzZSk6IEV4cGxvcmVySXRlbVtdIHtcblx0XHRpZiAoIXRoaXMudmlldykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gbmV3IFNldDxFeHBsb3Jlckl0ZW0+KHRoaXMudmlldy5nZXRDb250ZXh0KHJlc3BlY3RNdWx0aVNlbGVjdGlvbikpO1xuXHRcdGl0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAocmVzcGVjdE11bHRpU2VsZWN0aW9uICYmICFpZ25vcmVOZXN0ZWRDaGlsZHJlbiAmJiB0aGlzLnZpZXc/LmlzSXRlbUNvbGxhcHNlZChpdGVtKSAmJiBpdGVtLm5lc3RlZENoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBpdGVtLm5lc3RlZENoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5hZGQoY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFdlIHdpbGwgZXJyb3Igb3V0IHRyeWluZyB0byByZXNvbHZlIGNvbGxhcHNlZCBub2RlcyB0aGF0IGhhdmUgbm90IHlldCBiZWVuIHJlc29sdmVkLlxuXHRcdFx0XHQvLyBTbyB3ZSBjYXRjaCBhbmQgaWdub3JlIHRoZW0gaW4gdGhlIG11bHRpU2VsZWN0IGNvbnRleHRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIFsuLi5pdGVtc107XG5cdH1cblxuXHRhc3luYyBhcHBseUJ1bGtFZGl0KGVkaXQ6IFJlc291cmNlRmlsZUVkaXRbXSwgb3B0aW9uczogeyB1bmRvTGFiZWw6IHN0cmluZzsgcHJvZ3Jlc3NMYWJlbDogc3RyaW5nOyBjb25maXJtQmVmb3JlVW5kbz86IGJvb2xlYW47IHByb2dyZXNzTG9jYXRpb24/OiBQcm9ncmVzc0xvY2F0aW9uLkV4cGxvcmVyIHwgUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3cgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBvcHRpb25zLnByb2dyZXNzTG9jYXRpb24gPz8gUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3c7XG5cdFx0bGV0IHByb2dyZXNzT3B0aW9ucztcblx0XHRpZiAobG9jYXRpb24gPT09IFByb2dyZXNzTG9jYXRpb24uV2luZG93KSB7XG5cdFx0XHRwcm9ncmVzc09wdGlvbnMgPSB7XG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvbixcblx0XHRcdFx0dGl0bGU6IG9wdGlvbnMucHJvZ3Jlc3NMYWJlbCxcblx0XHRcdFx0Y2FuY2VsbGFibGU6IGVkaXQubGVuZ3RoID4gMSxcblx0XHRcdH0gc2F0aXNmaWVzIElQcm9ncmVzc09wdGlvbnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb2dyZXNzT3B0aW9ucyA9IHtcblx0XHRcdFx0bG9jYXRpb246IGxvY2F0aW9uLFxuXHRcdFx0XHR0aXRsZTogb3B0aW9ucy5wcm9ncmVzc0xhYmVsLFxuXHRcdFx0XHRjYW5jZWxsYWJsZTogZWRpdC5sZW5ndGggPiAxLFxuXHRcdFx0XHRkZWxheTogNTAwLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucztcblx0XHR9XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhwcm9ncmVzc09wdGlvbnMsIGFzeW5jIHByb2dyZXNzID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGVkaXQsIHtcblx0XHRcdFx0dW5kb1JlZG9Tb3VyY2U6IFVORE9fUkVET19TT1VSQ0UsXG5cdFx0XHRcdGxhYmVsOiBvcHRpb25zLnVuZG9MYWJlbCxcblx0XHRcdFx0Y29kZTogJ3VuZG9yZWRvLmV4cGxvcmVyT3BlcmF0aW9uJyxcblx0XHRcdFx0cHJvZ3Jlc3MsXG5cdFx0XHRcdHRva2VuOiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbixcblx0XHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IG9wdGlvbnMuY29uZmlybUJlZm9yZVVuZG9cblx0XHRcdH0pO1xuXHRcdH0sICgpID0+IGNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpKTtcblx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHBsb3JlciwgZGVsYXk6IDUwMCB9LCAoKSA9PiBwcm9taXNlKTtcblx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRoYXNWaWV3Rm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52aWV3ICYmIHRoaXMudmlldy5oYXNGb2N1cygpO1xuXHR9XG5cblx0Ly8gSUV4cGxvcmVyU2VydmljZSBtZXRob2RzXG5cblx0ZmluZENsb3Nlc3QocmVzb3VyY2U6IFVSSSk6IEV4cGxvcmVySXRlbSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmZpbmRDbG9zZXN0KHJlc291cmNlKTtcblx0fVxuXG5cdGZpbmRDbG9zZXN0Um9vdChyZXNvdXJjZTogVVJJKTogRXhwbG9yZXJJdGVtIHwgbnVsbCB7XG5cdFx0Y29uc3QgcGFyZW50Um9vdHMgPSB0aGlzLm1vZGVsLnJvb3RzLmZpbHRlcihyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHIucmVzb3VyY2UpKVxuXHRcdFx0LnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IHNlY29uZC5yZXNvdXJjZS5wYXRoLmxlbmd0aCAtIGZpcnN0LnJlc291cmNlLnBhdGgubGVuZ3RoKTtcblx0XHRyZXR1cm4gcGFyZW50Um9vdHMubGVuZ3RoID8gcGFyZW50Um9vdHNbMF0gOiBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2V0RWRpdGFibGUoc3RhdDogRXhwbG9yZXJJdGVtLCBkYXRhOiBJRWRpdGFibGVEYXRhIHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy52aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aGlzLmVkaXRhYmxlID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRhYmxlID0geyBzdGF0LCBkYXRhIH07XG5cdFx0fVxuXHRcdGNvbnN0IGlzRWRpdGluZyA9IHRoaXMuaXNFZGl0YWJsZShzdGF0KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy52aWV3LnNldEVkaXRhYmxlKHN0YXQsIGlzRWRpdGluZyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRpZiAoIXRoaXMuZWRpdGFibGUgJiYgdGhpcy5maWxlQ2hhbmdlRXZlbnRzLmxlbmd0aCAmJiAhdGhpcy5vbkZpbGVDaGFuZ2VzU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMub25GaWxlQ2hhbmdlc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFRvQ29weShpdGVtczogRXhwbG9yZXJJdGVtW10sIGN1dDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZXZpb3VzbHlDdXRJdGVtcyA9IHRoaXMuY3V0SXRlbXM7XG5cdFx0dGhpcy5jdXRJdGVtcyA9IGN1dCA/IGl0ZW1zIDogdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVJlc291cmNlcyhpdGVtcy5tYXAocyA9PiBzLnJlc291cmNlKSk7XG5cblx0XHR0aGlzLnZpZXc/Lml0ZW1zQ29waWVkKGl0ZW1zLCBjdXQsIHByZXZpb3VzbHlDdXRJdGVtcyk7XG5cdH1cblxuXHRpc0N1dChpdGVtOiBFeHBsb3Jlckl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmN1dEl0ZW1zICYmIHRoaXMuY3V0SXRlbXMuc29tZShpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGkucmVzb3VyY2UsIGl0ZW0ucmVzb3VyY2UpKTtcblx0fVxuXG5cdGdldEVkaXRhYmxlKCk6IHsgc3RhdDogRXhwbG9yZXJJdGVtOyBkYXRhOiBJRWRpdGFibGVEYXRhIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRhYmxlO1xuXHR9XG5cblx0Z2V0RWRpdGFibGVEYXRhKHN0YXQ6IEV4cGxvcmVySXRlbSk6IElFZGl0YWJsZURhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRhYmxlICYmIHRoaXMuZWRpdGFibGUuc3RhdCA9PT0gc3RhdCA/IHRoaXMuZWRpdGFibGUuZGF0YSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzRWRpdGFibGUoc3RhdDogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5lZGl0YWJsZSAmJiAodGhpcy5lZGl0YWJsZS5zdGF0ID09PSBzdGF0IHx8ICFzdGF0KTtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdChyZXNvdXJjZTogVVJJLCByZXZlYWw/OiBib29sZWFuIHwgc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBmaWxlIG9yIHBhcmVudCBtYXRjaGVzIGV4Y2x1ZGUgcGF0dGVybnMsIGRvIG5vdCByZXZlYWwgdW5sZXNzIHJldmVhbCBhcmd1bWVudCBpcyAnZm9yY2UnXG5cdFx0Y29uc3QgaWdub3JlUmV2ZWFsRXhjbHVkZXMgPSByZXZlYWwgPT09ICdmb3JjZSc7XG5cblx0XHRjb25zdCBmaWxlU3RhdCA9IHRoaXMuZmluZENsb3Nlc3QocmVzb3VyY2UpO1xuXHRcdGlmIChmaWxlU3RhdCkge1xuXHRcdFx0aWYgKCF0aGlzLnNob3VsZEF1dG9SZXZlYWxJdGVtKGZpbGVTdGF0LCBpZ25vcmVSZXZlYWxFeGNsdWRlcykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy52aWV3LnNlbGVjdFJlc291cmNlKGZpbGVTdGF0LnJlc291cmNlLCByZXZlYWwpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIFN0YXQgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgZmlyc3QgYW5kIHRoZW4gcmV2ZWFsZWRcblx0XHRjb25zdCBvcHRpb25zOiBJUmVzb2x2ZUZpbGVPcHRpb25zID0geyByZXNvbHZlVG86IFtyZXNvdXJjZV0sIHJlc29sdmVNZXRhZGF0YTogdGhpcy5jb25maWcuc29ydE9yZGVyID09PSBTb3J0T3JkZXIuTW9kaWZpZWQgfTtcblx0XHRjb25zdCByb290ID0gdGhpcy5maW5kQ2xvc2VzdFJvb3QocmVzb3VyY2UpO1xuXHRcdGlmICghcm9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShyb290LnJlc291cmNlLCBvcHRpb25zKTtcblxuXHRcdFx0Ly8gQ29udmVydCB0byBtb2RlbFxuXHRcdFx0Y29uc3QgbW9kZWxTdGF0ID0gRXhwbG9yZXJJdGVtLmNyZWF0ZSh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXQsIHVuZGVmaW5lZCwgb3B0aW9ucy5yZXNvbHZlVG8pO1xuXHRcdFx0Ly8gVXBkYXRlIElucHV0IHdpdGggZGlzayBTdGF0XG5cdFx0XHRFeHBsb3Jlckl0ZW0ubWVyZ2VMb2NhbFdpdGhEaXNrKG1vZGVsU3RhdCwgcm9vdCk7XG5cdFx0XHRjb25zdCBpdGVtID0gcm9vdC5maW5kKHJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRoaXMudmlldy5yZWZyZXNoKHRydWUsIHJvb3QpO1xuXG5cdFx0XHQvLyBPbmNlIGl0ZW0gaXMgcmVzb2x2ZWQsIGNoZWNrIGFnYWluIGlmIGZvbGRlciBzaG91bGQgYmUgZXhwYW5kZWRcblx0XHRcdGlmIChpdGVtICYmICF0aGlzLnNob3VsZEF1dG9SZXZlYWxJdGVtKGl0ZW0sIGlnbm9yZVJldmVhbEV4Y2x1ZGVzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnZpZXcuc2VsZWN0UmVzb3VyY2UoaXRlbSA/IGl0ZW0ucmVzb3VyY2UgOiB1bmRlZmluZWQsIHJldmVhbCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJvb3QuZXJyb3IgPSBlcnJvcjtcblx0XHRcdGF3YWl0IHRoaXMudmlldy5yZWZyZXNoKGZhbHNlLCByb290KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKHJldmVhbCA9IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEbyBub3QgcmVmcmVzaCB0aGUgdHJlZSB3aGVuIGl0IGlzIHNob3dpbmcgdGVtcG9yYXJ5IG5vZGVzIChwaGFudG9tIGVsZW1lbnRzKVxuXHRcdGlmICh0aGlzLnZpZXc/Lmhhc1BoYW50b21FbGVtZW50cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5tb2RlbC5yb290cy5mb3JFYWNoKHIgPT4gci5mb3JnZXRDaGlsZHJlbigpKTtcblx0XHRpZiAodGhpcy52aWV3KSB7XG5cdFx0XHRhd2FpdCB0aGlzLnZpZXcucmVmcmVzaCh0cnVlKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U7XG5cdFx0XHRjb25zdCBhdXRvUmV2ZWFsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmF1dG9SZXZlYWw7XG5cblx0XHRcdGlmIChyZXZlYWwgJiYgcmVzb3VyY2UgJiYgYXV0b1JldmVhbCkge1xuXHRcdFx0XHQvLyBXZSBkaWQgYSB0b3AgbGV2ZWwgcmVmcmVzaCwgcmV2ZWFsIHRoZSBhY3RpdmUgZmlsZSAjNjcxMThcblx0XHRcdFx0dGhpcy5zZWxlY3QocmVzb3VyY2UsIGF1dG9SZXZlYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEZpbGUgZXZlbnRzXG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFJ1bk9wZXJhdGlvbihlOiBGaWxlT3BlcmF0aW9uRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBXaGVuIG5lc3RpbmcsIGNoYW5nZXMgdG8gb25lIGZpbGUgaW4gYSBmb2xkZXIgbWF5IGltcGFjdCB0aGUgcmVuZGVyZWQgc3RydWN0dXJlXG5cdFx0Ly8gb2YgYWxsIHRoZSBmb2xkZXIncyBpbW1lZGlhdGUgY2hpbGRyZW4sIHRodXMgYSByZWN1cnNpdmUgcmVmcmVzaCBpcyBuZWVkZWQuXG5cdFx0Ly8gSWRlYWxseSB0aGUgdHJlZSB3b3VsZCBiZSBhYmxlIHRvIHJlY3VzaXZlbHkgcmVmcmVzaCBqdXN0IG9uZSBsZXZlbCBidXQgdGhhdCBkb2VzIG5vdCB5ZXQgZXhpc3QuXG5cdFx0Y29uc3Qgc2hvdWxkRGVlcFJlZnJlc2ggPSB0aGlzLmNvbmZpZy5maWxlTmVzdGluZy5lbmFibGVkO1xuXG5cdFx0Ly8gQWRkXG5cdFx0aWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DT1BZKSkge1xuXHRcdFx0Y29uc3QgYWRkZWRFbGVtZW50ID0gZS50YXJnZXQ7XG5cdFx0XHRjb25zdCBwYXJlbnRSZXNvdXJjZSA9IGRpcm5hbWUoYWRkZWRFbGVtZW50LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHBhcmVudHMgPSB0aGlzLm1vZGVsLmZpbmRBbGwocGFyZW50UmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAocGFyZW50cy5sZW5ndGgpIHtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIG5ldyBmaWxlIHRvIGl0cyBwYXJlbnQgKE1vZGVsKVxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwYXJlbnRzLm1hcChhc3luYyBwID0+IHtcblx0XHRcdFx0XHQvLyBXZSBoYXZlIHRvIGNoZWNrIGlmIHRoZSBwYXJlbnQgaXMgcmVzb2x2ZWQgIzI5MTc3XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZU1ldGFkYXRhID0gdGhpcy5jb25maWcuc29ydE9yZGVyID09PSBgbW9kaWZpZWRgO1xuXHRcdFx0XHRcdGlmICghcC5pc0RpcmVjdG9yeVJlc29sdmVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHAucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhIH0pO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxTdGF0ID0gRXhwbG9yZXJJdGVtLmNyZWF0ZSh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXQsIHAucGFyZW50KTtcblx0XHRcdFx0XHRcdFx0RXhwbG9yZXJJdGVtLm1lcmdlTG9jYWxXaXRoRGlzayhtb2RlbFN0YXQsIHApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNoaWxkRWxlbWVudCA9IEV4cGxvcmVySXRlbS5jcmVhdGUodGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhZGRlZEVsZW1lbnQsIHAucGFyZW50KTtcblx0XHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gcmVtb3ZlIGFueSBwcmV2aW91cyB2ZXJzaW9uIG9mIHRoZSBmaWxlIGlmIGFueVxuXHRcdFx0XHRcdHAucmVtb3ZlQ2hpbGQoY2hpbGRFbGVtZW50KTtcblx0XHRcdFx0XHRwLmFkZENoaWxkKGNoaWxkRWxlbWVudCk7XG5cdFx0XHRcdFx0Ly8gUmVmcmVzaCB0aGUgUGFyZW50IChWaWV3KVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChzaG91bGREZWVwUmVmcmVzaCwgcCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIChpbmNsdWRpbmcgUmVuYW1lKVxuXHRcdGVsc2UgaWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0Y29uc3Qgb2xkUmVzb3VyY2UgPSBlLnJlc291cmNlO1xuXHRcdFx0Y29uc3QgbmV3RWxlbWVudCA9IGUudGFyZ2V0O1xuXHRcdFx0Y29uc3Qgb2xkUGFyZW50UmVzb3VyY2UgPSBkaXJuYW1lKG9sZFJlc291cmNlKTtcblx0XHRcdGNvbnN0IG5ld1BhcmVudFJlc291cmNlID0gZGlybmFtZShuZXdFbGVtZW50LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IG1vZGVsRWxlbWVudHMgPSB0aGlzLm1vZGVsLmZpbmRBbGwob2xkUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2FtZVBhcmVudE1vdmUgPSBtb2RlbEVsZW1lbnRzLmV2ZXJ5KGUgPT4gIWUubmVzdGVkUGFyZW50KSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChvbGRQYXJlbnRSZXNvdXJjZSwgbmV3UGFyZW50UmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBIYW5kbGUgUmVuYW1lXG5cdFx0XHRpZiAoc2FtZVBhcmVudE1vdmUpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobW9kZWxFbGVtZW50cy5tYXAoYXN5bmMgbW9kZWxFbGVtZW50ID0+IHtcblx0XHRcdFx0XHQvLyBSZW5hbWUgRmlsZSAoTW9kZWwpXG5cdFx0XHRcdFx0bW9kZWxFbGVtZW50LnJlbmFtZShuZXdFbGVtZW50KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goc2hvdWxkRGVlcFJlZnJlc2gsIG1vZGVsRWxlbWVudC5wYXJlbnQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBNb3ZlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3UGFyZW50cyA9IHRoaXMubW9kZWwuZmluZEFsbChuZXdQYXJlbnRSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChuZXdQYXJlbnRzLmxlbmd0aCAmJiBtb2RlbEVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIE1vdmUgaW4gTW9kZWxcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChtb2RlbEVsZW1lbnRzLm1hcChhc3luYyAobW9kZWxFbGVtZW50LCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2xkUGFyZW50ID0gbW9kZWxFbGVtZW50LnBhcmVudDtcblx0XHRcdFx0XHRcdGNvbnN0IG9sZE5lc3RlZFBhcmVudCA9IG1vZGVsRWxlbWVudC5uZXN0ZWRQYXJlbnQ7XG5cdFx0XHRcdFx0XHRtb2RlbEVsZW1lbnQubW92ZShuZXdQYXJlbnRzW2luZGV4XSk7XG5cdFx0XHRcdFx0XHRpZiAob2xkTmVzdGVkUGFyZW50KSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChmYWxzZSwgb2xkTmVzdGVkUGFyZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChmYWxzZSwgb2xkUGFyZW50KTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChzaG91bGREZWVwUmVmcmVzaCwgbmV3UGFyZW50c1tpbmRleF0pO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERlbGV0ZVxuXHRcdGVsc2UgaWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5ERUxFVEUpKSB7XG5cdFx0XHRjb25zdCBtb2RlbEVsZW1lbnRzID0gdGhpcy5tb2RlbC5maW5kQWxsKGUucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobW9kZWxFbGVtZW50cy5tYXAoYXN5bmMgbW9kZWxFbGVtZW50ID0+IHtcblx0XHRcdFx0aWYgKG1vZGVsRWxlbWVudC5wYXJlbnQpIHtcblx0XHRcdFx0XHQvLyBSZW1vdmUgRWxlbWVudCBmcm9tIFBhcmVudCAoTW9kZWwpXG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gbW9kZWxFbGVtZW50LnBhcmVudDtcblx0XHRcdFx0XHRwYXJlbnQucmVtb3ZlQ2hpbGQobW9kZWxFbGVtZW50KTtcblx0XHRcdFx0XHR0aGlzLnZpZXc/LmZvY3VzTmV4dCgpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgb2xkTmVzdGVkUGFyZW50ID0gbW9kZWxFbGVtZW50Lm5lc3RlZFBhcmVudDtcblx0XHRcdFx0XHRpZiAob2xkTmVzdGVkUGFyZW50KSB7XG5cdFx0XHRcdFx0XHRvbGROZXN0ZWRQYXJlbnQucmVtb3ZlQ2hpbGQobW9kZWxFbGVtZW50KTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChmYWxzZSwgb2xkTmVzdGVkUGFyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gUmVmcmVzaCBQYXJlbnQgKFZpZXcpXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy52aWV3Py5yZWZyZXNoKHNob3VsZERlZXBSZWZyZXNoLCBwYXJlbnQpO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMudmlldz8uZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMudmlldz8uZm9jdXNMYXN0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQ2hlY2sgaWYgYW4gaXRlbSBtYXRjaGVzIGEgZXhwbG9yZXIuYXV0b1JldmVhbEV4Y2x1ZGUgcGF0dGVyblxuXHRwcml2YXRlIHNob3VsZEF1dG9SZXZlYWxJdGVtKGl0ZW06IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCwgaWdub3JlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKGl0ZW0gPT09IHVuZGVmaW5lZCB8fCBpZ25vcmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXZlYWxFeGNsdWRlTWF0Y2hlci5tYXRjaGVzKGl0ZW0ucmVzb3VyY2UsIG5hbWUgPT4gISEoaXRlbS5wYXJlbnQ/LmdldENoaWxkKG5hbWUpKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgcm9vdCA9IGl0ZW0ucm9vdDtcblx0XHRsZXQgY3VycmVudEl0ZW0gPSBpdGVtLnBhcmVudDtcblx0XHR3aGlsZSAoY3VycmVudEl0ZW0gIT09IHJvb3QpIHtcblx0XHRcdGlmIChjdXJyZW50SXRlbSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucmV2ZWFsRXhjbHVkZU1hdGNoZXIubWF0Y2hlcyhjdXJyZW50SXRlbS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudEl0ZW0gPSBjdXJyZW50SXRlbS5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXInKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzaG91bGRSZWZyZXNoID0gZmFsc2U7XG5cblx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLmZpbGVOZXN0aW5nJykpIHtcblx0XHRcdHNob3VsZFJlZnJlc2ggPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCk7XG5cblx0XHRjb25zdCBjb25maWdTb3J0T3JkZXIgPSBjb25maWd1cmF0aW9uPy5leHBsb3Jlcj8uc29ydE9yZGVyIHx8IFNvcnRPcmRlci5EZWZhdWx0O1xuXHRcdGlmICh0aGlzLmNvbmZpZy5zb3J0T3JkZXIgIT09IGNvbmZpZ1NvcnRPcmRlcikge1xuXHRcdFx0c2hvdWxkUmVmcmVzaCA9IHRoaXMuY29uZmlnLnNvcnRPcmRlciAhPT0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ0xleGljb2dyYXBoaWNPcHRpb25zID0gY29uZmlndXJhdGlvbj8uZXhwbG9yZXI/LnNvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zIHx8IExleGljb2dyYXBoaWNPcHRpb25zLkRlZmF1bHQ7XG5cdFx0aWYgKHRoaXMuY29uZmlnLnNvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zICE9PSBjb25maWdMZXhpY29ncmFwaGljT3B0aW9ucykge1xuXHRcdFx0c2hvdWxkUmVmcmVzaCA9IHNob3VsZFJlZnJlc2ggfHwgdGhpcy5jb25maWcuc29ydE9yZGVyTGV4aWNvZ3JhcGhpY09wdGlvbnMgIT09IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc29ydE9yZGVyUmV2ZXJzZSA9IGNvbmZpZ3VyYXRpb24/LmV4cGxvcmVyPy5zb3J0T3JkZXJSZXZlcnNlIHx8IGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMuY29uZmlnLnNvcnRPcmRlclJldmVyc2UgIT09IHNvcnRPcmRlclJldmVyc2UpIHtcblx0XHRcdHNob3VsZFJlZnJlc2ggPSBzaG91bGRSZWZyZXNoIHx8IHRoaXMuY29uZmlnLnNvcnRPcmRlclJldmVyc2UgIT09IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZ3VyYXRpb24uZXhwbG9yZXI7XG5cblx0XHRpZiAoc2hvdWxkUmVmcmVzaCkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBkb2VzRmlsZUV2ZW50QWZmZWN0KGl0ZW06IEV4cGxvcmVySXRlbSwgdmlldzogSUV4cGxvcmVyVmlldywgZXZlbnRzOiBGaWxlQ2hhbmdlc0V2ZW50W10sIHR5cGVzOiBGaWxlQ2hhbmdlVHlwZVtdKTogYm9vbGVhbiB7XG5cdGZvciAoY29uc3QgW19uYW1lLCBjaGlsZF0gb2YgaXRlbS5jaGlsZHJlbikge1xuXHRcdGlmICh2aWV3LmlzSXRlbVZpc2libGUoY2hpbGQpKSB7XG5cdFx0XHRpZiAoZXZlbnRzLnNvbWUoZSA9PiBlLmNvbnRhaW5zKGNoaWxkLnJlc291cmNlLCAuLi50eXBlcykpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoaWxkLmlzRGlyZWN0b3J5ICYmIGNoaWxkLmlzRGlyZWN0b3J5UmVzb2x2ZWQpIHtcblx0XHRcdFx0aWYgKGRvZXNGaWxlRXZlbnRBZmZlY3QoY2hpbGQsIHZpZXcsIGV2ZW50cywgdHlwZXMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGdldFJldmVhbEV4Y2x1ZGVzKGNvbmZpZ3VyYXRpb246IElGaWxlc0NvbmZpZ3VyYXRpb24pOiBJRXhwcmVzc2lvbiB7XG5cdGNvbnN0IHJldmVhbEV4Y2x1ZGVzID0gY29uZmlndXJhdGlvbj8uZXhwbG9yZXI/LmF1dG9SZXZlYWxFeGNsdWRlO1xuXG5cdGlmICghcmV2ZWFsRXhjbHVkZXMpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRyZXR1cm4gcmV2ZWFsRXhjbHVkZXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUF1RCxXQUFXLDRCQUE0QjtBQUM5RixTQUFTLGNBQWMscUJBQXFCO0FBRTVDLFNBQTZCLGVBQWUsY0FBZ0Msc0JBQTJDO0FBQ3ZILFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUyw2QkFBd0Q7QUFDakUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBMEM7QUFDbkQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQkFBa0Isd0JBQXFFO0FBQ2hHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBRXJDLE1BQU0sbUJBQW1CLElBQUksZUFBZTtBQUU1QyxJQUFNLGtCQUFOLE1BQWtEO0FBQUEsRUFnQnhELFlBQ3VCLGFBQ1Msc0JBQ0csZ0JBQ1Asa0JBQ0gsZUFDYyxvQkFDSCxpQkFDQSxpQkFDckIsYUFDK0IsMkJBQ1Asb0JBQ3JDO0FBWHFCO0FBQ1M7QUFDRztBQUNQO0FBQ0g7QUFDYztBQUNIO0FBQ0E7QUFFVTtBQUNQO0FBdEJ2QztBQUFBLFNBQWlCLGNBQWMsSUFBSSxnQkFBZ0I7QUFLbkQsU0FBUSxnQ0FBZ0M7QUFHeEMsU0FBUSxtQkFBdUMsQ0FBQztBQWdC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
