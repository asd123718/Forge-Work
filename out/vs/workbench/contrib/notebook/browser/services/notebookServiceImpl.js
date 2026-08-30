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
import { localize } from "../../../../../nls.js";
import { toAction } from "../../../../../base/common/actions.js";
import { createErrorWithActions } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { Memento } from "../../../../common/memento.js";
import { notebookPreloadExtensionPoint, notebookRendererExtensionPoint, notebooksExtensionPoint } from "../notebookExtensionPoint.js";
import { NotebookDiffEditorInput } from "../../common/notebookDiffEditorInput.js";
import { NotebookTextModel } from "../../common/model/notebookTextModel.js";
import { ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER, CellUri, NotebookSetting, MimeTypeDisplayOrder, NotebookEditorPriority, NotebookRendererMatch, NOTEBOOK_DISPLAY_ORDER, RENDERER_EQUIVALENT_EXTENSIONS, RENDERER_NOT_AVAILABLE } from "../../common/notebookCommon.js";
import { NotebookEditorInput } from "../../common/notebookEditorInput.js";
import { INotebookEditorModelResolverService } from "../../common/notebookEditorModelResolverService.js";
import { NotebookOutputRendererInfo, NotebookStaticPreloadInfo } from "../../common/notebookOutputRenderer.js";
import { NotebookProviderInfo } from "../../common/notebookProvider.js";
import { SimpleNotebookProviderInfo } from "../../common/notebookService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../../services/editor/common/editorResolverService.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { InstallRecommendedExtensionAction } from "../../../extensions/browser/extensionsActions.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { MergeEditorInput } from "../../../mergeEditor/browser/mergeEditorInput.js";
import { bufferToStream, streamToBuffer, VSBuffer } from "../../../../../base/common/buffer.js";
import { NotebookMultiDiffEditorInput } from "../diff/notebookMultiDiffEditorInput.js";
import { CancellationError } from "../../../../../base/common/errors.js";
let NotebookProviderInfoStore = class extends Disposable {
  constructor(storageService, extensionService, _editorResolverService, _configurationService, _accessibilityService, _instantiationService, _fileService, _notebookEditorModelResolverService, uriIdentService) {
    super();
    this._editorResolverService = _editorResolverService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._instantiationService = _instantiationService;
    this._fileService = _fileService;
    this._notebookEditorModelResolverService = _notebookEditorModelResolverService;
    this.uriIdentService = uriIdentService;
    this._handled = false;
    this._contributedEditors = /* @__PURE__ */ new Map();
    this._contributedEditorDisposables = this._register(new DisposableStore());
    this._memento = new Memento(NotebookProviderInfoStore.CUSTOM_EDITORS_STORAGE_ID, storageService);
    const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this._editorResolverService.bufferChangeEvents(() => {
      for (const info of mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] || []) {
        this.add(new NotebookProviderInfo(info), false);
      }
    });
    this._register(extensionService.onDidRegisterExtensions(() => {
      if (!this._handled) {
        this._clear();
        mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = [];
        this._memento.saveMemento();
      }
    }));
    notebooksExtensionPoint.setHandler((extensions) => this._setupHandler(extensions));
  }
  dispose() {
    this._clear();
    super.dispose();
  }
  _setupHandler(extensions) {
    this._handled = true;
    const builtins = [...this._contributedEditors.values()].filter((info) => !info.extension);
    this._clear();
    const builtinProvidersFromCache = /* @__PURE__ */ new Map();
    builtins.forEach((builtin) => {
      builtinProvidersFromCache.set(builtin.id, this.add(builtin));
    });
    for (const extension of extensions) {
      for (const notebookContribution of extension.value) {
        if (!notebookContribution.type) {
          extension.collector.error(`Notebook does not specify type-property`);
          continue;
        }
        const existing = this.get(notebookContribution.type);
        if (existing) {
          if (!existing.extension && extension.description.isBuiltin && builtins.find((builtin) => builtin.id === notebookContribution.type)) {
            builtinProvidersFromCache.get(notebookContribution.type)?.dispose();
          } else {
            extension.collector.error(`Notebook type '${notebookContribution.type}' already used`);
            continue;
          }
        }
        this.add(new NotebookProviderInfo({
          extension: extension.description.identifier,
          id: notebookContribution.type,
          displayName: notebookContribution.displayName,
          selectors: notebookContribution.selector || [],
          priority: this._convertPriority(notebookContribution.priority),
          providerDisplayName: extension.description.displayName ?? extension.description.identifier.value
        }));
      }
    }
    const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
    this._memento.saveMemento();
  }
  clearEditorCache() {
    const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = [];
    this._memento.saveMemento();
  }
  _convertPriority(priority) {
    if (!priority) {
      return RegisteredEditorPriority.default;
    }
    if (priority === NotebookEditorPriority.default) {
      return RegisteredEditorPriority.default;
    }
    return RegisteredEditorPriority.option;
  }
  _registerContributionPoint(notebookProviderInfo) {
    const disposables = new DisposableStore();
    for (const selector of notebookProviderInfo.selectors) {
      const globPattern = selector.include || selector;
      const notebookEditorInfo = {
        id: notebookProviderInfo.id,
        label: notebookProviderInfo.displayName,
        detail: notebookProviderInfo.providerDisplayName,
        priority: notebookProviderInfo.priority
      };
      const notebookEditorOptions = {
        canHandleDiff: () => !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized(),
        canSupportResource: (resource) => {
          if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
            const params = new URLSearchParams(resource.query);
            return params.get("openIn") === "notebook";
          }
          return resource.scheme === Schemas.untitled || resource.scheme === Schemas.vscodeNotebookCell || this._fileService.hasProvider(resource);
        }
      };
      const notebookEditorInputFactory = async ({ resource, options }) => {
        let data;
        if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
          const outputUriData = CellUri.parseCellOutputUri(resource);
          if (!outputUriData || !outputUriData.notebook || outputUriData.cellHandle === void 0) {
            throw new Error("Invalid cell output uri");
          }
          data = {
            notebook: outputUriData.notebook,
            handle: outputUriData.cellHandle
          };
        } else {
          data = CellUri.parse(resource);
        }
        let notebookUri;
        let cellOptions;
        if (data) {
          notebookUri = this.uriIdentService.asCanonicalUri(data.notebook);
          cellOptions = { resource, options };
        } else {
          notebookUri = this.uriIdentService.asCanonicalUri(resource);
        }
        if (!cellOptions) {
          cellOptions = options?.cellOptions;
        }
        let notebookOptions;
        if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
          if (data?.handle === void 0 || !data?.notebook) {
            throw new Error("Invalid cell handle");
          }
          const cellUri = CellUri.generate(data.notebook, data.handle);
          cellOptions = { resource: cellUri, options };
          const cellIndex = await this._notebookEditorModelResolverService.resolve(notebookUri).then((model) => model.object.notebook.cells.findIndex((cell) => cell.handle === data?.handle)).then((index) => index >= 0 ? index : 0);
          const cellIndexesToRanges = [{ start: cellIndex, end: cellIndex + 1 }];
          notebookOptions = {
            ...options,
            cellOptions,
            viewState: void 0,
            cellSelections: cellIndexesToRanges
          };
        } else {
          notebookOptions = {
            ...options,
            cellOptions,
            viewState: void 0
          };
        }
        const preferredResourceParam = cellOptions?.resource;
        const editor = NotebookEditorInput.getOrCreate(this._instantiationService, notebookUri, preferredResourceParam, notebookProviderInfo.id);
        return { editor, options: notebookOptions };
      };
      const notebookUntitledEditorFactory = async ({ resource, options }) => {
        const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: resource }, notebookProviderInfo.id);
        Event.once(ref.object.notebook.onWillDispose)(() => {
          ref.dispose();
        });
        return { editor: NotebookEditorInput.getOrCreate(this._instantiationService, ref.object.resource, void 0, notebookProviderInfo.id), options };
      };
      const notebookDiffEditorInputFactory = (diffEditorInput, group) => {
        const { modified, original, label, description } = diffEditorInput;
        if (this._configurationService.getValue("notebook.experimental.enableNewDiffEditor")) {
          return { editor: NotebookMultiDiffEditorInput.create(this._instantiationService, modified.resource, label, description, original.resource, notebookProviderInfo.id) };
        }
        return { editor: NotebookDiffEditorInput.create(this._instantiationService, modified.resource, label, description, original.resource, notebookProviderInfo.id) };
      };
      const mergeEditorInputFactory = (mergeEditor) => {
        return {
          editor: this._instantiationService.createInstance(
            MergeEditorInput,
            mergeEditor.base.resource,
            {
              uri: mergeEditor.input1.resource,
              title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
              description: mergeEditor.input1.description ?? "",
              detail: mergeEditor.input1.detail
            },
            {
              uri: mergeEditor.input2.resource,
              title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
              description: mergeEditor.input2.description ?? "",
              detail: mergeEditor.input2.detail
            },
            mergeEditor.result.resource
          )
        };
      };
      const notebookFactoryObject = {
        createEditorInput: notebookEditorInputFactory,
        createDiffEditorInput: notebookDiffEditorInputFactory,
        createUntitledEditorInput: notebookUntitledEditorFactory,
        createMergeEditorInput: mergeEditorInputFactory
      };
      const notebookCellFactoryObject = {
        createEditorInput: notebookEditorInputFactory,
        createDiffEditorInput: notebookDiffEditorInputFactory
      };
      disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(NotebookSetting.textDiffEditorPreview)) {
          const canHandleDiff = !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized();
          if (canHandleDiff) {
            notebookFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
            notebookCellFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
          } else {
            notebookFactoryObject.createDiffEditorInput = void 0;
            notebookCellFactoryObject.createDiffEditorInput = void 0;
          }
        }
      }));
      disposables.add(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
        const canHandleDiff = !!this._configurationService.getValue(NotebookSetting.textDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized();
        if (canHandleDiff) {
          notebookFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
          notebookCellFactoryObject.createDiffEditorInput = notebookDiffEditorInputFactory;
        } else {
          notebookFactoryObject.createDiffEditorInput = void 0;
          notebookCellFactoryObject.createDiffEditorInput = void 0;
        }
      }));
      disposables.add(this._editorResolverService.registerEditor(
        globPattern,
        notebookEditorInfo,
        notebookEditorOptions,
        notebookFactoryObject
      ));
      disposables.add(this._editorResolverService.registerEditor(
        `${Schemas.vscodeNotebookCell}:/**/${globPattern}`,
        { ...notebookEditorInfo, priority: RegisteredEditorPriority.exclusive },
        notebookEditorOptions,
        notebookCellFactoryObject
      ));
    }
    return disposables;
  }
  _clear() {
    this._contributedEditors.clear();
    this._contributedEditorDisposables.clear();
  }
  get(viewType) {
    return this._contributedEditors.get(viewType);
  }
  add(info, saveMemento = true) {
    if (this._contributedEditors.has(info.id)) {
      throw new Error(`notebook type '${info.id}' ALREADY EXISTS`);
    }
    this._contributedEditors.set(info.id, info);
    let editorRegistration;
    if (info.extension) {
      editorRegistration = this._registerContributionPoint(info);
      this._contributedEditorDisposables.add(editorRegistration);
    }
    if (saveMemento) {
      const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
      mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
      this._memento.saveMemento();
    }
    return this._register(toDisposable(() => {
      const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
      mementoObject[NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._contributedEditors.values());
      this._memento.saveMemento();
      editorRegistration?.dispose();
      this._contributedEditors.delete(info.id);
    }));
  }
  getContributedNotebook(resource) {
    const result = [];
    for (const info of this._contributedEditors.values()) {
      if (info.matches(resource)) {
        result.push(info);
      }
    }
    if (result.length === 0 && resource.scheme === Schemas.untitled) {
      return Array.from(this._contributedEditors.values());
    }
    return result;
  }
  [Symbol.iterator]() {
    return this._contributedEditors.values();
  }
};
NotebookProviderInfoStore.CUSTOM_EDITORS_STORAGE_ID = "notebookEditors";
NotebookProviderInfoStore.CUSTOM_EDITORS_ENTRY_ID = "editors";
NotebookProviderInfoStore = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IEditorResolverService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, INotebookEditorModelResolverService),
  __decorateParam(8, IUriIdentityService)
], NotebookProviderInfoStore);
let NotebookOutputRendererInfoStore = class {
  constructor(storageService) {
    this.contributedRenderers = /* @__PURE__ */ new Map();
    this.preferredMimetype = new Lazy(
      () => this.preferredMimetypeMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE)
    );
    this.preferredMimetypeMemento = new Memento("workbench.editor.notebook.preferredRenderer2", storageService);
  }
  clear() {
    this.contributedRenderers.clear();
  }
  get(rendererId) {
    return this.contributedRenderers.get(rendererId);
  }
  getAll() {
    return Array.from(this.contributedRenderers.values());
  }
  add(info) {
    if (this.contributedRenderers.has(info.id)) {
      return;
    }
    this.contributedRenderers.set(info.id, info);
  }
  /** Update and remember the preferred renderer for the given mimetype in this workspace */
  setPreferred(notebookProviderInfo, mimeType, rendererId) {
    const mementoObj = this.preferredMimetype.value;
    const forNotebook = mementoObj[notebookProviderInfo.id];
    if (forNotebook) {
      forNotebook[mimeType] = rendererId;
    } else {
      mementoObj[notebookProviderInfo.id] = { [mimeType]: rendererId };
    }
    this.preferredMimetypeMemento.saveMemento();
  }
  findBestRenderers(notebookProviderInfo, mimeType, kernelProvides) {
    let ReuseOrder;
    ((ReuseOrder2) => {
      ReuseOrder2[ReuseOrder2["PreviouslySelected"] = 256] = "PreviouslySelected";
      ReuseOrder2[ReuseOrder2["SameExtensionAsNotebook"] = 512] = "SameExtensionAsNotebook";
      ReuseOrder2[ReuseOrder2["OtherRenderer"] = 768] = "OtherRenderer";
      ReuseOrder2[ReuseOrder2["BuiltIn"] = 1024] = "BuiltIn";
    })(ReuseOrder || (ReuseOrder = {}));
    const preferred = notebookProviderInfo && this.preferredMimetype.value[notebookProviderInfo.id]?.[mimeType];
    const notebookExtId = notebookProviderInfo?.extension?.value;
    const notebookId = notebookProviderInfo?.id;
    const renderers = Array.from(this.contributedRenderers.values()).map((renderer) => {
      const ownScore = kernelProvides === void 0 ? renderer.matchesWithoutKernel(mimeType) : renderer.matches(mimeType, kernelProvides);
      if (ownScore === NotebookRendererMatch.Never) {
        return void 0;
      }
      const rendererExtId = renderer.extensionId.value;
      const reuseScore = preferred === renderer.id ? 256 /* PreviouslySelected */ : rendererExtId === notebookExtId || RENDERER_EQUIVALENT_EXTENSIONS.get(rendererExtId)?.has(notebookId) ? 512 /* SameExtensionAsNotebook */ : renderer.isBuiltin ? 1024 /* BuiltIn */ : 768 /* OtherRenderer */;
      return {
        ordered: { mimeType, rendererId: renderer.id, isTrusted: true },
        score: reuseScore | ownScore
      };
    }).filter(isDefined);
    if (renderers.length === 0) {
      return [{ mimeType, rendererId: RENDERER_NOT_AVAILABLE, isTrusted: true }];
    }
    return renderers.sort((a, b) => a.score - b.score).map((r) => r.ordered);
  }
};
NotebookOutputRendererInfoStore = __decorateClass([
  __decorateParam(0, IStorageService)
], NotebookOutputRendererInfoStore);
class ModelData {
  constructor(model, onWillDispose) {
    this.model = model;
    this._modelEventListeners = new DisposableStore();
    this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
  }
  get uri() {
    return this.model.uri;
  }
  getCellIndex(cellUri) {
    return this.model.cells.findIndex((cell) => isEqual(cell.uri, cellUri));
  }
  dispose() {
    this._modelEventListeners.dispose();
  }
}
let NotebookService = class extends Disposable {
  constructor(_extensionService, _configurationService, _accessibilityService, _instantiationService, _storageService, _notebookDocumentService) {
    super();
    this._extensionService = _extensionService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._notebookDocumentService = _notebookDocumentService;
    this._notebookProviders = /* @__PURE__ */ new Map();
    this._notebookProviderInfoStore = void 0;
    this._notebookRenderersInfoStore = this._instantiationService.createInstance(NotebookOutputRendererInfoStore);
    this._onDidChangeOutputRenderers = this._register(new Emitter());
    this.onDidChangeOutputRenderers = this._onDidChangeOutputRenderers.event;
    this._notebookStaticPreloadInfoStore = /* @__PURE__ */ new Set();
    this._models = new ResourceMap();
    this._onWillAddNotebookDocument = this._register(new Emitter());
    this._onDidAddNotebookDocument = this._register(new Emitter());
    this._onWillRemoveNotebookDocument = this._register(new Emitter());
    this._onDidRemoveNotebookDocument = this._register(new Emitter());
    this.onWillAddNotebookDocument = this._onWillAddNotebookDocument.event;
    this.onDidAddNotebookDocument = this._onDidAddNotebookDocument.event;
    this.onDidRemoveNotebookDocument = this._onDidRemoveNotebookDocument.event;
    this.onWillRemoveNotebookDocument = this._onWillRemoveNotebookDocument.event;
    this._onAddViewType = this._register(new Emitter());
    this.onAddViewType = this._onAddViewType.event;
    this._onWillRemoveViewType = this._register(new Emitter());
    this.onWillRemoveViewType = this._onWillRemoveViewType.event;
    this._onDidChangeEditorTypes = this._register(new Emitter());
    this.onDidChangeEditorTypes = this._onDidChangeEditorTypes.event;
    this._lastClipboardIsCopy = true;
    notebookRendererExtensionPoint.setHandler((renderers) => {
      this._notebookRenderersInfoStore.clear();
      for (const extension of renderers) {
        for (const notebookContribution of extension.value) {
          if (!notebookContribution.entrypoint) {
            extension.collector.error(`Notebook renderer does not specify entry point`);
            continue;
          }
          const id = notebookContribution.id;
          if (!id) {
            extension.collector.error(`Notebook renderer does not specify id-property`);
            continue;
          }
          this._notebookRenderersInfoStore.add(new NotebookOutputRendererInfo({
            id,
            extension: extension.description,
            entrypoint: notebookContribution.entrypoint,
            displayName: notebookContribution.displayName,
            mimeTypes: notebookContribution.mimeTypes || [],
            dependencies: notebookContribution.dependencies,
            optionalDependencies: notebookContribution.optionalDependencies,
            requiresMessaging: notebookContribution.requiresMessaging
          }));
        }
      }
      this._onDidChangeOutputRenderers.fire();
    });
    notebookPreloadExtensionPoint.setHandler((extensions) => {
      this._notebookStaticPreloadInfoStore.clear();
      for (const extension of extensions) {
        if (!isProposedApiEnabled(extension.description, "contribNotebookStaticPreloads")) {
          continue;
        }
        for (const notebookContribution of extension.value) {
          if (!notebookContribution.entrypoint) {
            extension.collector.error(`Notebook preload does not specify entry point`);
            continue;
          }
          const type = notebookContribution.type;
          if (!type) {
            extension.collector.error(`Notebook preload does not specify type-property`);
            continue;
          }
          this._notebookStaticPreloadInfoStore.add(new NotebookStaticPreloadInfo({
            type,
            extension: extension.description,
            entrypoint: notebookContribution.entrypoint,
            localResourceRoots: notebookContribution.localResourceRoots ?? []
          }));
        }
      }
    });
    const updateOrder = () => {
      this._displayOrder = new MimeTypeDisplayOrder(
        this._configurationService.getValue(NotebookSetting.displayOrder) || [],
        this._accessibilityService.isScreenReaderOptimized() ? ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER : NOTEBOOK_DISPLAY_ORDER
      );
    };
    updateOrder();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.displayOrder)) {
        updateOrder();
      }
    }));
    this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
      updateOrder();
    }));
    this._memento = new Memento(NotebookService._storageNotebookViewTypeProvider, this._storageService);
    this._viewTypeCache = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  get notebookProviderInfoStore() {
    if (!this._notebookProviderInfoStore) {
      this._notebookProviderInfoStore = this._register(this._instantiationService.createInstance(NotebookProviderInfoStore));
    }
    return this._notebookProviderInfoStore;
  }
  getEditorTypes() {
    return [...this.notebookProviderInfoStore].map((info) => ({
      id: info.id,
      displayName: info.displayName,
      providerDisplayName: info.providerDisplayName
    }));
  }
  clearEditorCache() {
    this.notebookProviderInfoStore.clearEditorCache();
  }
  _postDocumentOpenActivation(viewType) {
    this._extensionService.activateByEvent(`onNotebook:${viewType}`);
    this._extensionService.activateByEvent(`onNotebook:*`);
  }
  async canResolve(viewType) {
    if (this._notebookProviders.has(viewType)) {
      return true;
    }
    await this._extensionService.whenInstalledExtensionsRegistered();
    await this._extensionService.activateByEvent(`onNotebookSerializer:${viewType}`);
    return this._notebookProviders.has(viewType);
  }
  registerContributedNotebookType(viewType, data) {
    const info = new NotebookProviderInfo({
      extension: data.extension,
      id: viewType,
      displayName: data.displayName,
      providerDisplayName: data.providerDisplayName,
      priority: data.priority || RegisteredEditorPriority.default,
      selectors: []
    });
    info.update({ selectors: data.filenamePattern });
    const reg = this.notebookProviderInfoStore.add(info);
    this._onDidChangeEditorTypes.fire();
    return toDisposable(() => {
      reg.dispose();
      this._onDidChangeEditorTypes.fire();
    });
  }
  _registerProviderData(viewType, data) {
    if (this._notebookProviders.has(viewType)) {
      throw new Error(`notebook provider for viewtype '${viewType}' already exists`);
    }
    this._notebookProviders.set(viewType, data);
    this._onAddViewType.fire(viewType);
    return toDisposable(() => {
      this._onWillRemoveViewType.fire(viewType);
      this._notebookProviders.delete(viewType);
    });
  }
  registerNotebookSerializer(viewType, extensionData, serializer) {
    this.notebookProviderInfoStore.get(viewType)?.update({ options: serializer.options });
    this._viewTypeCache[viewType] = extensionData.id.value;
    this._persistMementos();
    return this._registerProviderData(viewType, new SimpleNotebookProviderInfo(viewType, serializer, extensionData));
  }
  async withNotebookDataProvider(viewType) {
    const selected = this.notebookProviderInfoStore.get(viewType);
    if (!selected) {
      const knownProvider = this.getViewTypeProvider(viewType);
      const actions = knownProvider ? [
        toAction({
          id: "workbench.notebook.action.installMissingViewType",
          label: localize("notebookOpenInstallMissingViewType", "Install extension for '{0}'", viewType),
          run: async () => {
            await this._instantiationService.createInstance(InstallRecommendedExtensionAction, knownProvider).run();
          }
        })
      ] : [];
      throw createErrorWithActions(`UNKNOWN notebook type '${viewType}'`, actions);
    }
    await this.canResolve(selected.id);
    const result = this._notebookProviders.get(selected.id);
    if (!result) {
      throw new Error(`NO provider registered for view type: '${selected.id}'`);
    }
    return result;
  }
  tryGetDataProviderSync(viewType) {
    const selected = this.notebookProviderInfoStore.get(viewType);
    if (!selected) {
      return void 0;
    }
    return this._notebookProviders.get(selected.id);
  }
  _persistMementos() {
    this._memento.saveMemento();
  }
  getViewTypeProvider(viewType) {
    return this._viewTypeCache[viewType];
  }
  getRendererInfo(rendererId) {
    return this._notebookRenderersInfoStore.get(rendererId);
  }
  updateMimePreferredRenderer(viewType, mimeType, rendererId, otherMimetypes) {
    const info = this.notebookProviderInfoStore.get(viewType);
    if (info) {
      this._notebookRenderersInfoStore.setPreferred(info, mimeType, rendererId);
    }
    this._displayOrder.prioritize(mimeType, otherMimetypes);
  }
  saveMimeDisplayOrder(target) {
    this._configurationService.updateValue(NotebookSetting.displayOrder, this._displayOrder.toArray(), target);
  }
  getRenderers() {
    return this._notebookRenderersInfoStore.getAll();
  }
  *getStaticPreloads(viewType) {
    for (const preload of this._notebookStaticPreloadInfoStore) {
      if (preload.type === viewType) {
        yield preload;
      }
    }
  }
  // --- notebook documents: create, destory, retrieve, enumerate
  async createNotebookTextModel(viewType, uri, stream) {
    if (this._models.has(uri)) {
      throw new Error(`notebook for ${uri} already exists`);
    }
    const info = await this.withNotebookDataProvider(viewType);
    if (!(info instanceof SimpleNotebookProviderInfo)) {
      throw new Error("CANNOT open file notebook with this provider");
    }
    const bytes = stream ? await streamToBuffer(stream) : VSBuffer.fromByteArray([]);
    const data = await info.serializer.dataToNotebook(bytes);
    const notebookModel = this._instantiationService.createInstance(NotebookTextModel, info.viewType, uri, data.cells, data.metadata, info.serializer.options);
    const modelData = new ModelData(notebookModel, this._onWillDisposeDocument.bind(this));
    this._models.set(uri, modelData);
    this._notebookDocumentService.addNotebookDocument(modelData);
    this._onWillAddNotebookDocument.fire(notebookModel);
    this._onDidAddNotebookDocument.fire(notebookModel);
    this._postDocumentOpenActivation(info.viewType);
    return notebookModel;
  }
  async createNotebookTextDocumentSnapshot(uri, context, token) {
    const model = this.getNotebookTextModel(uri);
    if (!model) {
      throw new Error(`notebook for ${uri} doesn't exist`);
    }
    const info = await this.withNotebookDataProvider(model.viewType);
    if (!(info instanceof SimpleNotebookProviderInfo)) {
      throw new Error("CANNOT open file notebook with this provider");
    }
    const serializer = info.serializer;
    const outputSizeLimit = this._configurationService.getValue(NotebookSetting.outputBackupSizeLimit) * 1024;
    const data = model.createSnapshot({ context, outputSizeLimit, transientOptions: serializer.options });
    const indentAmount = model.metadata.indentAmount;
    if (typeof indentAmount === "string" && indentAmount) {
      data.metadata.indentAmount = indentAmount;
    }
    const bytes = await serializer.notebookToData(data);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return bufferToStream(bytes);
  }
  async restoreNotebookTextModelFromSnapshot(uri, viewType, snapshot) {
    const model = this.getNotebookTextModel(uri);
    if (!model) {
      throw new Error(`notebook for ${uri} doesn't exist`);
    }
    const info = await this.withNotebookDataProvider(model.viewType);
    if (!(info instanceof SimpleNotebookProviderInfo)) {
      throw new Error("CANNOT open file notebook with this provider");
    }
    const serializer = info.serializer;
    const bytes = await streamToBuffer(snapshot);
    const data = await info.serializer.dataToNotebook(bytes);
    model.restoreSnapshot(data, serializer.options);
    return model;
  }
  getNotebookTextModel(uri) {
    return this._models.get(uri)?.model;
  }
  getNotebookTextModels() {
    return Iterable.map(this._models.values(), (data) => data.model);
  }
  listNotebookDocuments() {
    return [...this._models].map((e) => e[1].model);
  }
  _onWillDisposeDocument(model) {
    const modelData = this._models.get(model.uri);
    if (modelData) {
      this._onWillRemoveNotebookDocument.fire(modelData.model);
      this._models.delete(model.uri);
      this._notebookDocumentService.removeNotebookDocument(modelData);
      modelData.dispose();
      this._onDidRemoveNotebookDocument.fire(modelData.model);
    }
  }
  getOutputMimeTypeInfo(textModel, kernelProvides, output) {
    const sorted = this._displayOrder.sort(new Set(output.outputs.map((op) => op.mime)));
    const notebookProviderInfo = this.notebookProviderInfoStore.get(textModel.viewType);
    return sorted.flatMap((mimeType) => this._notebookRenderersInfoStore.findBestRenderers(notebookProviderInfo, mimeType, kernelProvides)).sort((a, b) => (a.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0) - (b.rendererId === RENDERER_NOT_AVAILABLE ? 1 : 0));
  }
  getContributedNotebookTypes(resource) {
    if (resource) {
      return this.notebookProviderInfoStore.getContributedNotebook(resource);
    }
    return [...this.notebookProviderInfoStore];
  }
  hasSupportedNotebooks(resource) {
    if (this._models.has(resource)) {
      return true;
    }
    const contribution = this.notebookProviderInfoStore.getContributedNotebook(resource);
    if (!contribution.length) {
      return false;
    }
    return contribution.some(
      (info) => info.matches(resource) && (info.priority === RegisteredEditorPriority.default || info.priority === RegisteredEditorPriority.exclusive)
    );
  }
  getContributedNotebookType(viewType) {
    return this.notebookProviderInfoStore.get(viewType);
  }
  getNotebookProviderResourceRoots() {
    const ret = [];
    this._notebookProviders.forEach((val) => {
      if (val.extensionData.location) {
        ret.push(URI.revive(val.extensionData.location));
      }
    });
    return ret;
  }
  // --- copy & paste
  setToCopy(items, isCopy) {
    this._cutItems = items;
    this._lastClipboardIsCopy = isCopy;
  }
  getToCopy() {
    if (this._cutItems) {
      return { items: this._cutItems, isCopy: this._lastClipboardIsCopy };
    }
    return void 0;
  }
};
NotebookService._storageNotebookViewTypeProvider = "notebook.viewTypeProvider";
NotebookService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IAccessibilityService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, INotebookDocumentService)
], NotebookService);
export {
  NotebookOutputRendererInfoStore,
  NotebookProviderInfoStore,
  NotebookService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFcnJvcldpdGhBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiwgbm90ZWJvb2tQcmVsb2FkRXh0ZW5zaW9uUG9pbnQsIG5vdGVib29rUmVuZGVyZXJFeHRlbnNpb25Qb2ludCwgbm90ZWJvb2tzRXh0ZW5zaW9uUG9pbnQgfSBmcm9tICcuLi9ub3RlYm9va0V4dGVuc2lvblBvaW50LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rQ2VsbFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBBQ0NFU1NJQkxFX05PVEVCT09LX0RJU1BMQVlfT1JERVIsIENlbGxVcmksIE5vdGVib29rU2V0dGluZywgSU5vdGVib29rQ29udHJpYnV0aW9uRGF0YSwgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXIsIElOb3RlYm9va1JlbmRlcmVySW5mbywgSU5vdGVib29rVGV4dE1vZGVsLCBJT3JkZXJlZE1pbWVUeXBlLCBJT3V0cHV0RHRvLCBNaW1lVHlwZURpc3BsYXlPcmRlciwgTm90ZWJvb2tFZGl0b3JQcmlvcml0eSwgTm90ZWJvb2tSZW5kZXJlck1hdGNoLCBOT1RFQk9PS19ESVNQTEFZX09SREVSLCBSRU5ERVJFUl9FUVVJVkFMRU5UX0VYVEVOU0lPTlMsIFJFTkRFUkVSX05PVF9BVkFJTEFCTEUsIE5vdGVib29rRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElOb3RlYm9va1N0YXRpY1ByZWxvYWRJbmZvLCBOb3RlYm9va0RhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPdXRwdXRSZW5kZXJlckluZm8sIE5vdGVib29rU3RhdGljUHJlbG9hZEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tPdXRwdXRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvckRlc2NyaXB0b3IsIE5vdGVib29rUHJvdmlkZXJJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VyaWFsaXplciwgSU5vdGVib29rU2VydmljZSwgU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dEZhY3RvcnlGdW5jdGlvbiwgRWRpdG9ySW5wdXRGYWN0b3J5RnVuY3Rpb24sIEVkaXRvcklucHV0RmFjdG9yeU9iamVjdCwgSUVkaXRvclJlc29sdmVyU2VydmljZSwgSUVkaXRvclR5cGUsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSwgUmVnaXN0ZXJlZEVkaXRvclJlZ2lzdHJhdGlvbkluZm8sIFVudGl0bGVkRWRpdG9ySW5wdXRGYWN0b3J5RnVuY3Rpb24sIHR5cGUgTWVyZ2VFZGl0b3JJbnB1dEZhY3RvcnlGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblBvaW50VXNlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tEb2N1bWVudCwgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9tZXJnZUVkaXRvci9icm93c2VyL21lcmdlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHR5cGUgeyBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBzdHJlYW1Ub0J1ZmZlciwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uL2RpZmYvbm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTbmFwc2hvdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vZmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5cbmludGVyZmFjZSBOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlTWVtZW50byB7XG5cdGVkaXRvcnM6IE5vdGVib29rUHJvdmlkZXJJbmZvW107XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ1VTVE9NX0VESVRPUlNfU1RPUkFHRV9JRCA9ICdub3RlYm9va0VkaXRvcnMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDVVNUT01fRURJVE9SU19FTlRSWV9JRCA9ICdlZGl0b3JzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZW1lbnRvOiBNZW1lbnRvPE5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmVNZW1lbnRvPjtcblx0cHJpdmF0ZSBfaGFuZGxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGVkRWRpdG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBOb3RlYm9va1Byb3ZpZGVySW5mbz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0ZWRFZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX21lbWVudG8gPSBuZXcgTWVtZW50byhOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLkNVU1RPTV9FRElUT1JTX1NUT1JBR0VfSUQsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1lbWVudG9PYmplY3QgPSB0aGlzLl9tZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Ly8gUHJvY2VzcyB0aGUgbm90ZWJvb2sgY29udHJpYnV0aW9ucyBidXQgYnVmZmVyIGNoYW5nZXMgZnJvbSB0aGUgcmVzb2x2ZXJcblx0XHR0aGlzLl9lZGl0b3JSZXNvbHZlclNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgaW5mbyBvZiAobWVtZW50b09iamVjdFtOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLkNVU1RPTV9FRElUT1JTX0VOVFJZX0lEXSB8fCBbXSkgYXMgTm90ZWJvb2tFZGl0b3JEZXNjcmlwdG9yW10pIHtcblx0XHRcdFx0dGhpcy5hZGQobmV3IE5vdGVib29rUHJvdmlkZXJJbmZvKGluZm8pLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faGFuZGxlZCkge1xuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBleHRlbnNpb24gcG9pbnQgcmVnaXN0ZXJlZCBmb3Igbm90ZWJvb2sgY29udGVudCBwcm92aWRlclxuXHRcdFx0XHQvLyBjbGVhciB0aGUgbWVtZW50byBhbmQgY2FjaGVcblx0XHRcdFx0dGhpcy5fY2xlYXIoKTtcblx0XHRcdFx0bWVtZW50b09iamVjdFtOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLkNVU1RPTV9FRElUT1JTX0VOVFJZX0lEXSA9IFtdO1xuXHRcdFx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bm90ZWJvb2tzRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHRoaXMuX3NldHVwSGFuZGxlcihleHRlbnNpb25zKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBIYW5kbGVyKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8SU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uW10+W10pIHtcblx0XHR0aGlzLl9oYW5kbGVkID0gdHJ1ZTtcblx0XHRjb25zdCBidWlsdGluczogTm90ZWJvb2tQcm92aWRlckluZm9bXSA9IFsuLi50aGlzLl9jb250cmlidXRlZEVkaXRvcnMudmFsdWVzKCldLmZpbHRlcihpbmZvID0+ICFpbmZvLmV4dGVuc2lvbik7XG5cdFx0dGhpcy5fY2xlYXIoKTtcblxuXHRcdGNvbnN0IGJ1aWx0aW5Qcm92aWRlcnNGcm9tQ2FjaGU6IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPiA9IG5ldyBNYXAoKTtcblx0XHRidWlsdGlucy5mb3JFYWNoKGJ1aWx0aW4gPT4ge1xuXHRcdFx0YnVpbHRpblByb3ZpZGVyc0Zyb21DYWNoZS5zZXQoYnVpbHRpbi5pZCwgdGhpcy5hZGQoYnVpbHRpbikpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBub3RlYm9va0NvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb24udmFsdWUpIHtcblxuXHRcdFx0XHRpZiAoIW5vdGVib29rQ29udHJpYnV0aW9uLnR5cGUpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBOb3RlYm9vayBkb2VzIG5vdCBzcGVjaWZ5IHR5cGUtcHJvcGVydHlgKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXQobm90ZWJvb2tDb250cmlidXRpb24udHlwZSk7XG5cblx0XHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0aWYgKCFleGlzdGluZy5leHRlbnNpb24gJiYgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlzQnVpbHRpbiAmJiBidWlsdGlucy5maW5kKGJ1aWx0aW4gPT4gYnVpbHRpbi5pZCA9PT0gbm90ZWJvb2tDb250cmlidXRpb24udHlwZSkpIHtcblx0XHRcdFx0XHRcdC8vIHdlIGFyZSByZWdpc3RlcmluZyBhbiBleHRlbnNpb24gd2hpY2ggaXMgdXNpbmcgdGhlIHNhbWUgdmlldyB0eXBlIHdoaWNoIGlzIGFscmVhZHkgY2FjaGVkXG5cdFx0XHRcdFx0XHRidWlsdGluUHJvdmlkZXJzRnJvbUNhY2hlLmdldChub3RlYm9va0NvbnRyaWJ1dGlvbi50eXBlKT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBOb3RlYm9vayB0eXBlICcke25vdGVib29rQ29udHJpYnV0aW9uLnR5cGV9JyBhbHJlYWR5IHVzZWRgKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYWRkKG5ldyBOb3RlYm9va1Byb3ZpZGVySW5mbyh7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRpZDogbm90ZWJvb2tDb250cmlidXRpb24udHlwZSxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogbm90ZWJvb2tDb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0c2VsZWN0b3JzOiBub3RlYm9va0NvbnRyaWJ1dGlvbi5zZWxlY3RvciB8fCBbXSxcblx0XHRcdFx0XHRwcmlvcml0eTogdGhpcy5fY29udmVydFByaW9yaXR5KG5vdGVib29rQ29udHJpYnV0aW9uLnByaW9yaXR5KSxcblx0XHRcdFx0XHRwcm92aWRlckRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGVzY3JpcHRpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZW1lbnRvT2JqZWN0ID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdG1lbWVudG9PYmplY3RbTm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5DVVNUT01fRURJVE9SU19FTlRSWV9JRF0gPSBBcnJheS5mcm9tKHRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9ycy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fbWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0Y2xlYXJFZGl0b3JDYWNoZSgpIHtcblx0XHRjb25zdCBtZW1lbnRvT2JqZWN0ID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdG1lbWVudG9PYmplY3RbTm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5DVVNUT01fRURJVE9SU19FTlRSWV9JRF0gPSBbXTtcblx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0UHJpb3JpdHkocHJpb3JpdHk/OiBzdHJpbmcpIHtcblx0XHRpZiAoIXByaW9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKHByaW9yaXR5ID09PSBOb3RlYm9va0VkaXRvclByaW9yaXR5LmRlZmF1bHQpIHtcblx0XHRcdHJldHVybiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbjtcblxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJDb250cmlidXRpb25Qb2ludChub3RlYm9va1Byb3ZpZGVySW5mbzogTm90ZWJvb2tQcm92aWRlckluZm8pOiBJRGlzcG9zYWJsZSB7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygbm90ZWJvb2tQcm92aWRlckluZm8uc2VsZWN0b3JzKSB7XG5cdFx0XHRjb25zdCBnbG9iUGF0dGVybiA9IChzZWxlY3RvciBhcyBJTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudEZpbHRlcikuaW5jbHVkZSB8fCBzZWxlY3RvciBhcyBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gfCBzdHJpbmc7XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvckluZm86IFJlZ2lzdGVyZWRFZGl0b3JSZWdpc3RyYXRpb25JbmZvID0ge1xuXHRcdFx0XHRpZDogbm90ZWJvb2tQcm92aWRlckluZm8uaWQsXG5cdFx0XHRcdGxhYmVsOiBub3RlYm9va1Byb3ZpZGVySW5mby5kaXNwbGF5TmFtZSxcblx0XHRcdFx0ZGV0YWlsOiBub3RlYm9va1Byb3ZpZGVySW5mby5wcm92aWRlckRpc3BsYXlOYW1lLFxuXHRcdFx0XHRwcmlvcml0eTogbm90ZWJvb2tQcm92aWRlckluZm8ucHJpb3JpdHksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRjYW5IYW5kbGVEaWZmOiAoKSA9PiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy50ZXh0RGlmZkVkaXRvclByZXZpZXcpICYmICF0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpLFxuXHRcdFx0XHRjYW5TdXBwb3J0UmVzb3VyY2U6IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMocmVzb3VyY2UucXVlcnkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcmFtcy5nZXQoJ29wZW5JbicpID09PSAnbm90ZWJvb2snO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkIHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgfHwgdGhpcy5fZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JJbnB1dEZhY3Rvcnk6IEVkaXRvcklucHV0RmFjdG9yeUZ1bmN0aW9uID0gYXN5bmMgKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRsZXQgZGF0YTtcblx0XHRcdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQpIHtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRVcmlEYXRhID0gQ2VsbFVyaS5wYXJzZUNlbGxPdXRwdXRVcmkocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICghb3V0cHV0VXJpRGF0YSB8fCAhb3V0cHV0VXJpRGF0YS5ub3RlYm9vayB8fCBvdXRwdXRVcmlEYXRhLmNlbGxIYW5kbGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNlbGwgb3V0cHV0IHVyaScpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0XHRub3RlYm9vazogb3V0cHV0VXJpRGF0YS5ub3RlYm9vayxcblx0XHRcdFx0XHRcdGhhbmRsZTogb3V0cHV0VXJpRGF0YS5jZWxsSGFuZGxlXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRhdGEgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBub3RlYm9va1VyaTogVVJJO1xuXG5cdFx0XHRcdGxldCBjZWxsT3B0aW9uczogSVJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHQvLyByZXNvdXJjZSBpcyBhIG5vdGVib29rIGNlbGxcblx0XHRcdFx0XHRub3RlYm9va1VyaSA9IHRoaXMudXJpSWRlbnRTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGRhdGEubm90ZWJvb2spO1xuXHRcdFx0XHRcdGNlbGxPcHRpb25zID0geyByZXNvdXJjZSwgb3B0aW9ucyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5vdGVib29rVXJpID0gdGhpcy51cmlJZGVudFNlcnZpY2UuYXNDYW5vbmljYWxVcmkocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFjZWxsT3B0aW9ucykge1xuXHRcdFx0XHRcdGNlbGxPcHRpb25zID0gKG9wdGlvbnMgYXMgSU5vdGVib29rRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk/LmNlbGxPcHRpb25zO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG5vdGVib29rT3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucztcblxuXHRcdFx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCkge1xuXHRcdFx0XHRcdGlmIChkYXRhPy5oYW5kbGUgPT09IHVuZGVmaW5lZCB8fCAhZGF0YT8ubm90ZWJvb2spIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjZWxsIGhhbmRsZScpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNlbGxVcmkgPSBDZWxsVXJpLmdlbmVyYXRlKGRhdGEubm90ZWJvb2ssIGRhdGEuaGFuZGxlKTtcblxuXHRcdFx0XHRcdGNlbGxPcHRpb25zID0geyByZXNvdXJjZTogY2VsbFVyaSwgb3B0aW9ucyB9O1xuXG5cdFx0XHRcdFx0Y29uc3QgY2VsbEluZGV4ID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKG5vdGVib29rVXJpKVxuXHRcdFx0XHRcdFx0LnRoZW4obW9kZWwgPT4gbW9kZWwub2JqZWN0Lm5vdGVib29rLmNlbGxzLmZpbmRJbmRleChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBkYXRhPy5oYW5kbGUpKVxuXHRcdFx0XHRcdFx0LnRoZW4oaW5kZXggPT4gaW5kZXggPj0gMCA/IGluZGV4IDogMCk7XG5cblx0XHRcdFx0XHRjb25zdCBjZWxsSW5kZXhlc1RvUmFuZ2VzOiBJQ2VsbFJhbmdlW10gPSBbeyBzdGFydDogY2VsbEluZGV4LCBlbmQ6IGNlbGxJbmRleCArIDEgfV07XG5cblx0XHRcdFx0XHRub3RlYm9va09wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNlbGxTZWxlY3Rpb25zOiBjZWxsSW5kZXhlc1RvUmFuZ2VzXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RlYm9va09wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZFJlc291cmNlUGFyYW0gPSBjZWxsT3B0aW9ucz8ucmVzb3VyY2U7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IE5vdGVib29rRWRpdG9ySW5wdXQuZ2V0T3JDcmVhdGUodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rVXJpLCBwcmVmZXJyZWRSZXNvdXJjZVBhcmFtLCBub3RlYm9va1Byb3ZpZGVySW5mby5pZCk7XG5cdFx0XHRcdHJldHVybiB7IGVkaXRvciwgb3B0aW9uczogbm90ZWJvb2tPcHRpb25zIH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBub3RlYm9va1VudGl0bGVkRWRpdG9yRmFjdG9yeTogVW50aXRsZWRFZGl0b3JJbnB1dEZhY3RvcnlGdW5jdGlvbiA9IGFzeW5jICh7IHJlc291cmNlLCBvcHRpb25zIH0pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKHsgdW50aXRsZWRSZXNvdXJjZTogcmVzb3VyY2UgfSwgbm90ZWJvb2tQcm92aWRlckluZm8uaWQpO1xuXG5cdFx0XHRcdC8vIHVudGl0bGVkIG5vdGVib29rcyBhcmUgZGlzcG9zZWQgd2hlbiB0aGV5IGdldCBzYXZlZC4gd2Ugc2hvdWxkIG5vdCBob2xkIGEgcmVmZXJlbmNlXG5cdFx0XHRcdC8vIHRvIHN1Y2ggYSBkaXNwb3NlZCBub3RlYm9vayBhbmQgdGhlcmVmb3JlIGRpc3Bvc2UgdGhlIHJlZmVyZW5jZSBhcyB3ZWxsXG5cdFx0XHRcdEV2ZW50Lm9uY2UocmVmLm9iamVjdC5ub3RlYm9vay5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBOb3RlYm9va0VkaXRvcklucHV0LmdldE9yQ3JlYXRlKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCByZWYub2JqZWN0LnJlc291cmNlLCB1bmRlZmluZWQsIG5vdGVib29rUHJvdmlkZXJJbmZvLmlkKSwgb3B0aW9ucyB9O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5vdGVib29rRGlmZkVkaXRvcklucHV0RmFjdG9yeTogRGlmZkVkaXRvcklucHV0RmFjdG9yeUZ1bmN0aW9uID0gKGRpZmZFZGl0b3JJbnB1dDogSVJlc291cmNlRGlmZkVkaXRvcklucHV0LCBncm91cDogSUVkaXRvckdyb3VwKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBsYWJlbCwgZGVzY3JpcHRpb24gfSA9IGRpZmZFZGl0b3JJbnB1dDtcblxuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmV4cGVyaW1lbnRhbC5lbmFibGVOZXdEaWZmRWRpdG9yJykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCBtb2RpZmllZC5yZXNvdXJjZSEsIGxhYmVsLCBkZXNjcmlwdGlvbiwgb3JpZ2luYWwucmVzb3VyY2UhLCBub3RlYm9va1Byb3ZpZGVySW5mby5pZCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IE5vdGVib29rRGlmZkVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgbW9kaWZpZWQucmVzb3VyY2UhLCBsYWJlbCwgZGVzY3JpcHRpb24sIG9yaWdpbmFsLnJlc291cmNlISwgbm90ZWJvb2tQcm92aWRlckluZm8uaWQpIH07XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbWVyZ2VFZGl0b3JJbnB1dEZhY3Rvcnk6IE1lcmdlRWRpdG9ySW5wdXRGYWN0b3J5RnVuY3Rpb24gPSAobWVyZ2VFZGl0b3I6IElSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dFdpdGhPcHRpb25zID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlZGl0b3I6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0TWVyZ2VFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdG1lcmdlRWRpdG9yLmJhc2UucmVzb3VyY2UsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHVyaTogbWVyZ2VFZGl0b3IuaW5wdXQxLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbWVyZ2VFZGl0b3IuaW5wdXQxLmxhYmVsID8/IGJhc2VuYW1lKG1lcmdlRWRpdG9yLmlucHV0MS5yZXNvdXJjZSksXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBtZXJnZUVkaXRvci5pbnB1dDEuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbWVyZ2VFZGl0b3IuaW5wdXQxLmRldGFpbFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dXJpOiBtZXJnZUVkaXRvci5pbnB1dDIucmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBtZXJnZUVkaXRvci5pbnB1dDIubGFiZWwgPz8gYmFzZW5hbWUobWVyZ2VFZGl0b3IuaW5wdXQyLnJlc291cmNlKSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG1lcmdlRWRpdG9yLmlucHV0Mi5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsOiBtZXJnZUVkaXRvci5pbnB1dDIuZGV0YWlsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bWVyZ2VFZGl0b3IucmVzdWx0LnJlc291cmNlXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgbm90ZWJvb2tGYWN0b3J5T2JqZWN0OiBFZGl0b3JJbnB1dEZhY3RvcnlPYmplY3QgPSB7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiBub3RlYm9va0VkaXRvcklucHV0RmFjdG9yeSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiBub3RlYm9va0RpZmZFZGl0b3JJbnB1dEZhY3RvcnksXG5cdFx0XHRcdGNyZWF0ZVVudGl0bGVkRWRpdG9ySW5wdXQ6IG5vdGVib29rVW50aXRsZWRFZGl0b3JGYWN0b3J5LFxuXHRcdFx0XHRjcmVhdGVNZXJnZUVkaXRvcklucHV0OiBtZXJnZUVkaXRvcklucHV0RmFjdG9yeVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5vdGVib29rQ2VsbEZhY3RvcnlPYmplY3Q6IEVkaXRvcklucHV0RmFjdG9yeU9iamVjdCA9IHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6IG5vdGVib29rRWRpdG9ySW5wdXRGYWN0b3J5LFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6IG5vdGVib29rRGlmZkVkaXRvcklucHV0RmFjdG9yeSxcblx0XHRcdH07XG5cblx0XHRcdC8vIFRPRE8gQGxyYW1vczE1IGZpbmQgYSBiZXR0ZXIgd2F5IHRvIHRvZ2dsZSBoYW5kbGluZyBkaWZmIGVkaXRvcnMgdGhhbiBuZWVkaW5nIHRoZXNlIGxpc3RlbmVycyBmb3IgZXZlcnkgcmVnaXN0cmF0aW9uXG5cdFx0XHQvLyBUaGlzIGlzIGEgbG90IG9mIGV2ZW50IGxpc3RlbmVycyBlc3BlY2lhbGx5IGlmIHRoZXJlIGFyZSBtYW55IG5vdGVib29rc1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLnRleHREaWZmRWRpdG9yUHJldmlldykpIHtcblx0XHRcdFx0XHRjb25zdCBjYW5IYW5kbGVEaWZmID0gISF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcudGV4dERpZmZFZGl0b3JQcmV2aWV3KSAmJiAhdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblx0XHRcdFx0XHRpZiAoY2FuSGFuZGxlRGlmZikge1xuXHRcdFx0XHRcdFx0bm90ZWJvb2tGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCA9IG5vdGVib29rRGlmZkVkaXRvcklucHV0RmFjdG9yeTtcblx0XHRcdFx0XHRcdG5vdGVib29rQ2VsbEZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0ID0gbm90ZWJvb2tEaWZmRWRpdG9ySW5wdXRGYWN0b3J5O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRub3RlYm9va0ZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0bm90ZWJvb2tDZWxsRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNhbkhhbmRsZURpZmYgPSAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy50ZXh0RGlmZkVkaXRvclByZXZpZXcpICYmICF0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdFx0XHRpZiAoY2FuSGFuZGxlRGlmZikge1xuXHRcdFx0XHRcdG5vdGVib29rRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQgPSBub3RlYm9va0RpZmZFZGl0b3JJbnB1dEZhY3Rvcnk7XG5cdFx0XHRcdFx0bm90ZWJvb2tDZWxsRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQgPSBub3RlYm9va0RpZmZFZGl0b3JJbnB1dEZhY3Rvcnk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bm90ZWJvb2tGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRub3RlYm9va0NlbGxGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciB0aGUgbm90ZWJvb2sgZWRpdG9yXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0XHRnbG9iUGF0dGVybixcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3JJbmZvLFxuXHRcdFx0XHRub3RlYm9va0VkaXRvck9wdGlvbnMsXG5cdFx0XHRcdG5vdGVib29rRmFjdG9yeU9iamVjdCxcblx0XHRcdCkpO1xuXHRcdFx0Ly8gVGhlbiByZWdpc3RlciB0aGUgc2NoZW1hIGhhbmRsZXIgYXMgZXhjbHVzaXZlIGZvciB0aGF0IG5vdGVib29rXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0XHRgJHtTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbH06LyoqLyR7Z2xvYlBhdHRlcm59YCxcblx0XHRcdFx0eyAuLi5ub3RlYm9va0VkaXRvckluZm8sIHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlIH0sXG5cdFx0XHRcdG5vdGVib29rRWRpdG9yT3B0aW9ucyxcblx0XHRcdFx0bm90ZWJvb2tDZWxsRmFjdG9yeU9iamVjdFxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblxuXHRwcml2YXRlIF9jbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cmlidXRlZEVkaXRvcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9jb250cmlidXRlZEVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRnZXQodmlld1R5cGU6IHN0cmluZyk6IE5vdGVib29rUHJvdmlkZXJJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLmdldCh2aWV3VHlwZSk7XG5cdH1cblxuXHRhZGQoaW5mbzogTm90ZWJvb2tQcm92aWRlckluZm8sIHNhdmVNZW1lbnRvID0gdHJ1ZSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLmhhcyhpbmZvLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBub3RlYm9vayB0eXBlICcke2luZm8uaWR9JyBBTFJFQURZIEVYSVNUU2ApO1xuXHRcdH1cblx0XHR0aGlzLl9jb250cmlidXRlZEVkaXRvcnMuc2V0KGluZm8uaWQsIGluZm8pO1xuXHRcdGxldCBlZGl0b3JSZWdpc3RyYXRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gYnVpbHQtaW4gbm90ZWJvb2sgcHJvdmlkZXJzIGNvbnRyaWJ1dGUgdGhlaXIgb3duIGVkaXRvcnNcblx0XHRpZiAoaW5mby5leHRlbnNpb24pIHtcblx0XHRcdGVkaXRvclJlZ2lzdHJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyQ29udHJpYnV0aW9uUG9pbnQoaW5mbyk7XG5cdFx0XHR0aGlzLl9jb250cmlidXRlZEVkaXRvckRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZWdpc3RyYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmIChzYXZlTWVtZW50bykge1xuXHRcdFx0Y29uc3QgbWVtZW50b09iamVjdCA9IHRoaXMuX21lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdG1lbWVudG9PYmplY3RbTm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5DVVNUT01fRURJVE9SU19FTlRSWV9JRF0gPSBBcnJheS5mcm9tKHRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9ycy52YWx1ZXMoKSk7XG5cdFx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBtZW1lbnRvT2JqZWN0ID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0bWVtZW50b09iamVjdFtOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLkNVU1RPTV9FRElUT1JTX0VOVFJZX0lEXSA9IEFycmF5LmZyb20odGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLnZhbHVlcygpKTtcblx0XHRcdHRoaXMuX21lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0XHRcdGVkaXRvclJlZ2lzdHJhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLmRlbGV0ZShpbmZvLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDb250cmlidXRlZE5vdGVib29rKHJlc291cmNlOiBVUkkpOiByZWFkb25seSBOb3RlYm9va1Byb3ZpZGVySW5mb1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IE5vdGVib29rUHJvdmlkZXJJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluZm8gb2YgdGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaW5mby5tYXRjaGVzKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpbmZvKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggPT09IDAgJiYgcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHQvLyB1bnRpdGxlZCByZXNvdXJjZSBhbmQgbm8gcGF0aC1zcGVjaWZpYyBtYXRjaCA9PiBhbGwgcHJvdmlkZXJzIGFwcGx5XG5cdFx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9jb250cmlidXRlZEVkaXRvcnMudmFsdWVzKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8Tm90ZWJvb2tQcm92aWRlckluZm8+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLnZhbHVlcygpO1xuXHR9XG59XG5cbmludGVyZmFjZSBOb3RlYm9va091dHB1dFJlbmRlcmVySW5mb1N0b3JlTWVtZW50byB7XG5cdFtub3RlYm9va1R5cGU6IHN0cmluZ106IHsgW21pbWVUeXBlOiBzdHJpbmddOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rT3V0cHV0UmVuZGVyZXJJbmZvU3RvcmUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyaWJ1dGVkUmVuZGVyZXJzID0gbmV3IE1hcDwvKiByZW5kZXJlcklkICovIHN0cmluZywgTm90ZWJvb2tPdXRwdXRSZW5kZXJlckluZm8+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJlZmVycmVkTWltZXR5cGVNZW1lbnRvOiBNZW1lbnRvPE5vdGVib29rT3V0cHV0UmVuZGVyZXJJbmZvU3RvcmVNZW1lbnRvPjtcblx0cHJpdmF0ZSByZWFkb25seSBwcmVmZXJyZWRNaW1ldHlwZSA9IG5ldyBMYXp5PE5vdGVib29rT3V0cHV0UmVuZGVyZXJJbmZvU3RvcmVNZW1lbnRvPihcblx0XHQoKSA9PiB0aGlzLnByZWZlcnJlZE1pbWV0eXBlTWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5wcmVmZXJyZWRNaW1ldHlwZU1lbWVudG8gPSBuZXcgTWVtZW50bygnd29ya2JlbmNoLmVkaXRvci5ub3RlYm9vay5wcmVmZXJyZWRSZW5kZXJlcjInLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHR0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLmNsZWFyKCk7XG5cdH1cblxuXHRnZXQocmVuZGVyZXJJZDogc3RyaW5nKTogTm90ZWJvb2tPdXRwdXRSZW5kZXJlckluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLmdldChyZW5kZXJlcklkKTtcblx0fVxuXG5cdGdldEFsbCgpOiBOb3RlYm9va091dHB1dFJlbmRlcmVySW5mb1tdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLnZhbHVlcygpKTtcblx0fVxuXG5cdGFkZChpbmZvOiBOb3RlYm9va091dHB1dFJlbmRlcmVySW5mbyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLmhhcyhpbmZvLmlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLnNldChpbmZvLmlkLCBpbmZvKTtcblx0fVxuXG5cdC8qKiBVcGRhdGUgYW5kIHJlbWVtYmVyIHRoZSBwcmVmZXJyZWQgcmVuZGVyZXIgZm9yIHRoZSBnaXZlbiBtaW1ldHlwZSBpbiB0aGlzIHdvcmtzcGFjZSAqL1xuXHRzZXRQcmVmZXJyZWQobm90ZWJvb2tQcm92aWRlckluZm86IE5vdGVib29rUHJvdmlkZXJJbmZvLCBtaW1lVHlwZTogc3RyaW5nLCByZW5kZXJlcklkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBtZW1lbnRvT2JqID0gdGhpcy5wcmVmZXJyZWRNaW1ldHlwZS52YWx1ZTtcblx0XHRjb25zdCBmb3JOb3RlYm9vayA9IG1lbWVudG9PYmpbbm90ZWJvb2tQcm92aWRlckluZm8uaWRdO1xuXHRcdGlmIChmb3JOb3RlYm9vaykge1xuXHRcdFx0Zm9yTm90ZWJvb2tbbWltZVR5cGVdID0gcmVuZGVyZXJJZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVtZW50b09ialtub3RlYm9va1Byb3ZpZGVySW5mby5pZF0gPSB7IFttaW1lVHlwZV06IHJlbmRlcmVySWQgfTtcblx0XHR9XG5cblx0XHR0aGlzLnByZWZlcnJlZE1pbWV0eXBlTWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0ZmluZEJlc3RSZW5kZXJlcnMobm90ZWJvb2tQcm92aWRlckluZm86IE5vdGVib29rUHJvdmlkZXJJbmZvIHwgdW5kZWZpbmVkLCBtaW1lVHlwZTogc3RyaW5nLCBrZXJuZWxQcm92aWRlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBJT3JkZXJlZE1pbWVUeXBlW10ge1xuXG5cdFx0Y29uc3QgZW51bSBSZXVzZU9yZGVyIHtcblx0XHRcdFByZXZpb3VzbHlTZWxlY3RlZCA9IDEgPDwgOCxcblx0XHRcdFNhbWVFeHRlbnNpb25Bc05vdGVib29rID0gMiA8PCA4LFxuXHRcdFx0T3RoZXJSZW5kZXJlciA9IDMgPDwgOCxcblx0XHRcdEJ1aWx0SW4gPSA0IDw8IDgsXG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZmVycmVkID0gbm90ZWJvb2tQcm92aWRlckluZm8gJiYgdGhpcy5wcmVmZXJyZWRNaW1ldHlwZS52YWx1ZVtub3RlYm9va1Byb3ZpZGVySW5mby5pZF0/LlttaW1lVHlwZV07XG5cdFx0Y29uc3Qgbm90ZWJvb2tFeHRJZCA9IG5vdGVib29rUHJvdmlkZXJJbmZvPy5leHRlbnNpb24/LnZhbHVlO1xuXHRcdGNvbnN0IG5vdGVib29rSWQgPSBub3RlYm9va1Byb3ZpZGVySW5mbz8uaWQ7XG5cdFx0Y29uc3QgcmVuZGVyZXJzOiB7IG9yZGVyZWQ6IElPcmRlcmVkTWltZVR5cGU7IHNjb3JlOiBudW1iZXIgfVtdID0gQXJyYXkuZnJvbSh0aGlzLmNvbnRyaWJ1dGVkUmVuZGVyZXJzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcChyZW5kZXJlciA9PiB7XG5cdFx0XHRcdGNvbnN0IG93blNjb3JlID0ga2VybmVsUHJvdmlkZXMgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gcmVuZGVyZXIubWF0Y2hlc1dpdGhvdXRLZXJuZWwobWltZVR5cGUpXG5cdFx0XHRcdFx0OiByZW5kZXJlci5tYXRjaGVzKG1pbWVUeXBlLCBrZXJuZWxQcm92aWRlcyk7XG5cblx0XHRcdFx0aWYgKG93blNjb3JlID09PSBOb3RlYm9va1JlbmRlcmVyTWF0Y2guTmV2ZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZXJFeHRJZCA9IHJlbmRlcmVyLmV4dGVuc2lvbklkLnZhbHVlO1xuXHRcdFx0XHRjb25zdCByZXVzZVNjb3JlID0gcHJlZmVycmVkID09PSByZW5kZXJlci5pZFxuXHRcdFx0XHRcdD8gUmV1c2VPcmRlci5QcmV2aW91c2x5U2VsZWN0ZWRcblx0XHRcdFx0XHQ6IHJlbmRlcmVyRXh0SWQgPT09IG5vdGVib29rRXh0SWQgfHwgUkVOREVSRVJfRVFVSVZBTEVOVF9FWFRFTlNJT05TLmdldChyZW5kZXJlckV4dElkKT8uaGFzKG5vdGVib29rSWQhKVxuXHRcdFx0XHRcdFx0PyBSZXVzZU9yZGVyLlNhbWVFeHRlbnNpb25Bc05vdGVib29rXG5cdFx0XHRcdFx0XHQ6IHJlbmRlcmVyLmlzQnVpbHRpbiA/IFJldXNlT3JkZXIuQnVpbHRJbiA6IFJldXNlT3JkZXIuT3RoZXJSZW5kZXJlcjtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvcmRlcmVkOiB7IG1pbWVUeXBlLCByZW5kZXJlcklkOiByZW5kZXJlci5pZCwgaXNUcnVzdGVkOiB0cnVlIH0sXG5cdFx0XHRcdFx0c2NvcmU6IHJldXNlU2NvcmUgfCBvd25TY29yZSxcblx0XHRcdFx0fTtcblx0XHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0aWYgKHJlbmRlcmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbeyBtaW1lVHlwZSwgcmVuZGVyZXJJZDogUkVOREVSRVJfTk9UX0FWQUlMQUJMRSwgaXNUcnVzdGVkOiB0cnVlIH1dO1xuXHRcdH1cblxuXHRcdHJldHVybiByZW5kZXJlcnMuc29ydCgoYSwgYikgPT4gYS5zY29yZSAtIGIuc2NvcmUpLm1hcChyID0+IHIub3JkZXJlZCk7XG5cdH1cbn1cblxuY2xhc3MgTW9kZWxEYXRhIGltcGxlbWVudHMgSURpc3Bvc2FibGUsIElOb3RlYm9va0RvY3VtZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxFdmVudExpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Z2V0IHVyaSgpIHsgcmV0dXJuIHRoaXMubW9kZWwudXJpOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdG9uV2lsbERpc3Bvc2U6IChtb2RlbDogSU5vdGVib29rVGV4dE1vZGVsKSA9PiB2b2lkXG5cdCkge1xuXHRcdHRoaXMuX21vZGVsRXZlbnRMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gb25XaWxsRGlzcG9zZShtb2RlbCkpKTtcblx0fVxuXG5cdGdldENlbGxJbmRleChjZWxsVXJpOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmNlbGxzLmZpbmRJbmRleChjZWxsID0+IGlzRXF1YWwoY2VsbC51cmksIGNlbGxVcmkpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxFdmVudExpc3RlbmVycy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIE5vdGVib29rU2VydmljZU1lbWVudG8ge1xuXHRbdmlld1R5cGU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgX3N0b3JhZ2VOb3RlYm9va1ZpZXdUeXBlUHJvdmlkZXIgPSAnbm90ZWJvb2sudmlld1R5cGVQcm92aWRlcic7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbWVudG86IE1lbWVudG88Tm90ZWJvb2tTZXJ2aWNlTWVtZW50bz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdUeXBlQ2FjaGU6IE5vdGVib29rU2VydmljZU1lbWVudG87XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tQcm92aWRlcnM7XG5cdHByaXZhdGUgX25vdGVib29rUHJvdmlkZXJJbmZvU3RvcmU6IE5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IG5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUoKTogTm90ZWJvb2tQcm92aWRlckluZm9TdG9yZSB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlKSB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tQcm92aWRlckluZm9TdG9yZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlO1xuXHR9XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rUmVuZGVyZXJzSW5mb1N0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU91dHB1dFJlbmRlcmVycztcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPdXRwdXRSZW5kZXJlcnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTdGF0aWNQcmVsb2FkSW5mb1N0b3JlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVscztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxBZGROb3RlYm9va0RvY3VtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZE5vdGVib29rRG9jdW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFJlbW92ZU5vdGVib29rRG9jdW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlTm90ZWJvb2tEb2N1bWVudDtcblxuXHRyZWFkb25seSBvbldpbGxBZGROb3RlYm9va0RvY3VtZW50O1xuXHRyZWFkb25seSBvbkRpZEFkZE5vdGVib29rRG9jdW1lbnQ7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlTm90ZWJvb2tEb2N1bWVudDtcblx0cmVhZG9ubHkgb25XaWxsUmVtb3ZlTm90ZWJvb2tEb2N1bWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFkZFZpZXdUeXBlO1xuXHRyZWFkb25seSBvbkFkZFZpZXdUeXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFJlbW92ZVZpZXdUeXBlO1xuXHRyZWFkb25seSBvbldpbGxSZW1vdmVWaWV3VHlwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvclR5cGVzO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvclR5cGVzOiBFdmVudDx2b2lkPjtcblxuXHRwcml2YXRlIF9jdXRJdGVtczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RDbGlwYm9hcmRJc0NvcHk6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfZGlzcGxheU9yZGVyITogTWltZVR5cGVEaXNwbGF5T3JkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRG9jdW1lbnRTZXJ2aWNlOiBJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9ub3RlYm9va1Byb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbz4oKTtcblx0XHR0aGlzLl9ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX25vdGVib29rUmVuZGVyZXJzSW5mb1N0b3JlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tPdXRwdXRSZW5kZXJlckluZm9TdG9yZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRSZW5kZXJlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlT3V0cHV0UmVuZGVyZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRSZW5kZXJlcnMuZXZlbnQ7XG5cdFx0dGhpcy5fbm90ZWJvb2tTdGF0aWNQcmVsb2FkSW5mb1N0b3JlID0gbmV3IFNldDxOb3RlYm9va1N0YXRpY1ByZWxvYWRJbmZvPigpO1xuXHRcdHRoaXMuX21vZGVscyA9IG5ldyBSZXNvdXJjZU1hcDxNb2RlbERhdGE+KCk7XG5cdFx0dGhpcy5fb25XaWxsQWRkTm90ZWJvb2tEb2N1bWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rVGV4dE1vZGVsPigpKTtcblx0XHR0aGlzLl9vbkRpZEFkZE5vdGVib29rRG9jdW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxOb3RlYm9va1RleHRNb2RlbD4oKSk7XG5cdFx0dGhpcy5fb25XaWxsUmVtb3ZlTm90ZWJvb2tEb2N1bWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rVGV4dE1vZGVsPigpKTtcblx0XHR0aGlzLl9vbkRpZFJlbW92ZU5vdGVib29rRG9jdW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxOb3RlYm9va1RleHRNb2RlbD4oKSk7XG5cdFx0dGhpcy5vbldpbGxBZGROb3RlYm9va0RvY3VtZW50ID0gdGhpcy5fb25XaWxsQWRkTm90ZWJvb2tEb2N1bWVudC5ldmVudDtcblx0XHR0aGlzLm9uRGlkQWRkTm90ZWJvb2tEb2N1bWVudCA9IHRoaXMuX29uRGlkQWRkTm90ZWJvb2tEb2N1bWVudC5ldmVudDtcblx0XHR0aGlzLm9uRGlkUmVtb3ZlTm90ZWJvb2tEb2N1bWVudCA9IHRoaXMuX29uRGlkUmVtb3ZlTm90ZWJvb2tEb2N1bWVudC5ldmVudDtcblx0XHR0aGlzLm9uV2lsbFJlbW92ZU5vdGVib29rRG9jdW1lbnQgPSB0aGlzLl9vbldpbGxSZW1vdmVOb3RlYm9va0RvY3VtZW50LmV2ZW50O1xuXHRcdHRoaXMuX29uQWRkVmlld1R5cGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdHRoaXMub25BZGRWaWV3VHlwZSA9IHRoaXMuX29uQWRkVmlld1R5cGUuZXZlbnQ7XG5cdFx0dGhpcy5fb25XaWxsUmVtb3ZlVmlld1R5cGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdHRoaXMub25XaWxsUmVtb3ZlVmlld1R5cGUgPSB0aGlzLl9vbldpbGxSZW1vdmVWaWV3VHlwZS5ldmVudDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclR5cGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUVkaXRvclR5cGVzID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JUeXBlcy5ldmVudDtcblx0XHR0aGlzLl9sYXN0Q2xpcGJvYXJkSXNDb3B5ID0gdHJ1ZTtcblxuXHRcdG5vdGVib29rUmVuZGVyZXJFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChyZW5kZXJlcnMpID0+IHtcblx0XHRcdHRoaXMuX25vdGVib29rUmVuZGVyZXJzSW5mb1N0b3JlLmNsZWFyKCk7XG5cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHJlbmRlcmVycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG5vdGVib29rQ29udHJpYnV0aW9uIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdGlmICghbm90ZWJvb2tDb250cmlidXRpb24uZW50cnlwb2ludCkgeyAvLyBhdm9pZCBjcmFzaGluZ1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgTm90ZWJvb2sgcmVuZGVyZXIgZG9lcyBub3Qgc3BlY2lmeSBlbnRyeSBwb2ludGApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBub3RlYm9va0NvbnRyaWJ1dGlvbi5pZDtcblx0XHRcdFx0XHRpZiAoIWlkKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBOb3RlYm9vayByZW5kZXJlciBkb2VzIG5vdCBzcGVjaWZ5IGlkLXByb3BlcnR5YCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va1JlbmRlcmVyc0luZm9TdG9yZS5hZGQobmV3IE5vdGVib29rT3V0cHV0UmVuZGVyZXJJbmZvKHtcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRlbnRyeXBvaW50OiBub3RlYm9va0NvbnRyaWJ1dGlvbi5lbnRyeXBvaW50LFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IG5vdGVib29rQ29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0bWltZVR5cGVzOiBub3RlYm9va0NvbnRyaWJ1dGlvbi5taW1lVHlwZXMgfHwgW10sXG5cdFx0XHRcdFx0XHRkZXBlbmRlbmNpZXM6IG5vdGVib29rQ29udHJpYnV0aW9uLmRlcGVuZGVuY2llcyxcblx0XHRcdFx0XHRcdG9wdGlvbmFsRGVwZW5kZW5jaWVzOiBub3RlYm9va0NvbnRyaWJ1dGlvbi5vcHRpb25hbERlcGVuZGVuY2llcyxcblx0XHRcdFx0XHRcdHJlcXVpcmVzTWVzc2FnaW5nOiBub3RlYm9va0NvbnRyaWJ1dGlvbi5yZXF1aXJlc01lc3NhZ2luZyxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRSZW5kZXJlcnMuZmlyZSgpO1xuXHRcdH0pO1xuXG5cdFx0bm90ZWJvb2tQcmVsb2FkRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblx0XHRcdHRoaXMuX25vdGVib29rU3RhdGljUHJlbG9hZEluZm9TdG9yZS5jbGVhcigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY29udHJpYk5vdGVib29rU3RhdGljUHJlbG9hZHMnKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBub3RlYm9va0NvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoIW5vdGVib29rQ29udHJpYnV0aW9uLmVudHJ5cG9pbnQpIHsgLy8gYXZvaWQgY3Jhc2hpbmdcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYE5vdGVib29rIHByZWxvYWQgZG9lcyBub3Qgc3BlY2lmeSBlbnRyeSBwb2ludGApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdHlwZSA9IG5vdGVib29rQ29udHJpYnV0aW9uLnR5cGU7XG5cdFx0XHRcdFx0aWYgKCF0eXBlKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBOb3RlYm9vayBwcmVsb2FkIGRvZXMgbm90IHNwZWNpZnkgdHlwZS1wcm9wZXJ0eWApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tTdGF0aWNQcmVsb2FkSW5mb1N0b3JlLmFkZChuZXcgTm90ZWJvb2tTdGF0aWNQcmVsb2FkSW5mbyh7XG5cdFx0XHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRlbnRyeXBvaW50OiBub3RlYm9va0NvbnRyaWJ1dGlvbi5lbnRyeXBvaW50LFxuXHRcdFx0XHRcdFx0bG9jYWxSZXNvdXJjZVJvb3RzOiBub3RlYm9va0NvbnRyaWJ1dGlvbi5sb2NhbFJlc291cmNlUm9vdHMgPz8gW10sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cGRhdGVPcmRlciA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2Rpc3BsYXlPcmRlciA9IG5ldyBNaW1lVHlwZURpc3BsYXlPcmRlcihcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KE5vdGVib29rU2V0dGluZy5kaXNwbGF5T3JkZXIpIHx8IFtdLFxuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpXG5cdFx0XHRcdFx0PyBBQ0NFU1NJQkxFX05PVEVCT09LX0RJU1BMQVlfT1JERVJcblx0XHRcdFx0XHQ6IE5PVEVCT09LX0RJU1BMQVlfT1JERVIsXG5cdFx0XHQpO1xuXHRcdH07XG5cblx0XHR1cGRhdGVPcmRlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmRpc3BsYXlPcmRlcikpIHtcblx0XHRcdFx0dXBkYXRlT3JkZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVPcmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21lbWVudG8gPSBuZXcgTWVtZW50byhOb3RlYm9va1NlcnZpY2UuX3N0b3JhZ2VOb3RlYm9va1ZpZXdUeXBlUHJvdmlkZXIsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl92aWV3VHlwZUNhY2hlID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXG5cdGdldEVkaXRvclR5cGVzKCk6IElFZGl0b3JUeXBlW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlXS5tYXAoaW5mbyA9PiAoe1xuXHRcdFx0aWQ6IGluZm8uaWQsXG5cdFx0XHRkaXNwbGF5TmFtZTogaW5mby5kaXNwbGF5TmFtZSxcblx0XHRcdHByb3ZpZGVyRGlzcGxheU5hbWU6IGluZm8ucHJvdmlkZXJEaXNwbGF5TmFtZVxuXHRcdH0pKTtcblx0fVxuXG5cdGNsZWFyRWRpdG9yQ2FjaGUoKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLmNsZWFyRWRpdG9yQ2FjaGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Bvc3REb2N1bWVudE9wZW5BY3RpdmF0aW9uKHZpZXdUeXBlOiBzdHJpbmcpIHtcblx0XHQvLyBzZW5kIG91dCBhY3RpdmF0aW9ucyBvbiBub3RlYm9vayB0ZXh0IG1vZGVsIGNyZWF0aW9uXG5cdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uTm90ZWJvb2s6JHt2aWV3VHlwZX1gKTtcblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25Ob3RlYm9vazoqYCk7XG5cdH1cblxuXHRhc3luYyBjYW5SZXNvbHZlKHZpZXdUeXBlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tQcm92aWRlcnMuaGFzKHZpZXdUeXBlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25Ob3RlYm9va1NlcmlhbGl6ZXI6JHt2aWV3VHlwZX1gKTtcblxuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va1Byb3ZpZGVycy5oYXModmlld1R5cGUpO1xuXHR9XG5cblx0cmVnaXN0ZXJDb250cmlidXRlZE5vdGVib29rVHlwZSh2aWV3VHlwZTogc3RyaW5nLCBkYXRhOiBJTm90ZWJvb2tDb250cmlidXRpb25EYXRhKTogSURpc3Bvc2FibGUge1xuXG5cdFx0Y29uc3QgaW5mbyA9IG5ldyBOb3RlYm9va1Byb3ZpZGVySW5mbyh7XG5cdFx0XHRleHRlbnNpb246IGRhdGEuZXh0ZW5zaW9uLFxuXHRcdFx0aWQ6IHZpZXdUeXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGRhdGEuZGlzcGxheU5hbWUsXG5cdFx0XHRwcm92aWRlckRpc3BsYXlOYW1lOiBkYXRhLnByb3ZpZGVyRGlzcGxheU5hbWUsXG5cdFx0XHRwcmlvcml0eTogZGF0YS5wcmlvcml0eSB8fCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRcdHNlbGVjdG9yczogW11cblx0XHR9KTtcblxuXHRcdGluZm8udXBkYXRlKHsgc2VsZWN0b3JzOiBkYXRhLmZpbGVuYW1lUGF0dGVybiB9KTtcblxuXHRcdGNvbnN0IHJlZyA9IHRoaXMubm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5hZGQoaW5mbyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JUeXBlcy5maXJlKCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHJlZy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclR5cGVzLmZpcmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyUHJvdmlkZXJEYXRhKHZpZXdUeXBlOiBzdHJpbmcsIGRhdGE6IFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va1Byb3ZpZGVycy5oYXModmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vdGVib29rIHByb3ZpZGVyIGZvciB2aWV3dHlwZSAnJHt2aWV3VHlwZX0nIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXHRcdHRoaXMuX25vdGVib29rUHJvdmlkZXJzLnNldCh2aWV3VHlwZSwgZGF0YSk7XG5cdFx0dGhpcy5fb25BZGRWaWV3VHlwZS5maXJlKHZpZXdUeXBlKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uV2lsbFJlbW92ZVZpZXdUeXBlLmZpcmUodmlld1R5cGUpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tQcm92aWRlcnMuZGVsZXRlKHZpZXdUeXBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKHZpZXdUeXBlOiBzdHJpbmcsIGV4dGVuc2lvbkRhdGE6IE5vdGVib29rRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlcmlhbGl6ZXI6IElOb3RlYm9va1NlcmlhbGl6ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLmdldCh2aWV3VHlwZSk/LnVwZGF0ZSh7IG9wdGlvbnM6IHNlcmlhbGl6ZXIub3B0aW9ucyB9KTtcblx0XHR0aGlzLl92aWV3VHlwZUNhY2hlW3ZpZXdUeXBlXSA9IGV4dGVuc2lvbkRhdGEuaWQudmFsdWU7XG5cdFx0dGhpcy5fcGVyc2lzdE1lbWVudG9zKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyUHJvdmlkZXJEYXRhKHZpZXdUeXBlLCBuZXcgU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8odmlld1R5cGUsIHNlcmlhbGl6ZXIsIGV4dGVuc2lvbkRhdGEpKTtcblx0fVxuXG5cdGFzeW5jIHdpdGhOb3RlYm9va0RhdGFQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTxTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbz4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5ub3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlLmdldCh2aWV3VHlwZSk7XG5cdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0Y29uc3Qga25vd25Qcm92aWRlciA9IHRoaXMuZ2V0Vmlld1R5cGVQcm92aWRlcih2aWV3VHlwZSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBrbm93blByb3ZpZGVyID8gW1xuXHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2suYWN0aW9uLmluc3RhbGxNaXNzaW5nVmlld1R5cGUnLCBsYWJlbDogbG9jYWxpemUoJ25vdGVib29rT3Blbkluc3RhbGxNaXNzaW5nVmlld1R5cGUnLCBcIkluc3RhbGwgZXh0ZW5zaW9uIGZvciAnezB9J1wiLCB2aWV3VHlwZSksIHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLCBrbm93blByb3ZpZGVyKS5ydW4oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRdIDogW107XG5cblx0XHRcdHRocm93IGNyZWF0ZUVycm9yV2l0aEFjdGlvbnMoYFVOS05PV04gbm90ZWJvb2sgdHlwZSAnJHt2aWV3VHlwZX0nYCwgYWN0aW9ucyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuY2FuUmVzb2x2ZShzZWxlY3RlZC5pZCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fbm90ZWJvb2tQcm92aWRlcnMuZ2V0KHNlbGVjdGVkLmlkKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBOTyBwcm92aWRlciByZWdpc3RlcmVkIGZvciB2aWV3IHR5cGU6ICcke3NlbGVjdGVkLmlkfSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHRyeUdldERhdGFQcm92aWRlclN5bmModmlld1R5cGU6IHN0cmluZyk6IFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHRoaXMubm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5nZXQodmlld1R5cGUpO1xuXHRcdGlmICghc2VsZWN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va1Byb3ZpZGVycy5nZXQoc2VsZWN0ZWQuaWQpO1xuXHR9XG5cblxuXHRwcml2YXRlIF9wZXJzaXN0TWVtZW50b3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0Z2V0Vmlld1R5cGVQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld1R5cGVDYWNoZVt2aWV3VHlwZV07XG5cdH1cblxuXHRnZXRSZW5kZXJlckluZm8ocmVuZGVyZXJJZDogc3RyaW5nKTogSU5vdGVib29rUmVuZGVyZXJJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tSZW5kZXJlcnNJbmZvU3RvcmUuZ2V0KHJlbmRlcmVySWQpO1xuXHR9XG5cblx0dXBkYXRlTWltZVByZWZlcnJlZFJlbmRlcmVyKHZpZXdUeXBlOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIHJlbmRlcmVySWQ6IHN0cmluZywgb3RoZXJNaW1ldHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMubm90ZWJvb2tQcm92aWRlckluZm9TdG9yZS5nZXQodmlld1R5cGUpO1xuXHRcdGlmIChpbmZvKSB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1JlbmRlcmVyc0luZm9TdG9yZS5zZXRQcmVmZXJyZWQoaW5mbywgbWltZVR5cGUsIHJlbmRlcmVySWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3BsYXlPcmRlci5wcmlvcml0aXplKG1pbWVUeXBlLCBvdGhlck1pbWV0eXBlcyk7XG5cdH1cblxuXHRzYXZlTWltZURpc3BsYXlPcmRlcih0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShOb3RlYm9va1NldHRpbmcuZGlzcGxheU9yZGVyLCB0aGlzLl9kaXNwbGF5T3JkZXIudG9BcnJheSgpLCB0YXJnZXQpO1xuXHR9XG5cblx0Z2V0UmVuZGVyZXJzKCk6IElOb3RlYm9va1JlbmRlcmVySW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tSZW5kZXJlcnNJbmZvU3RvcmUuZ2V0QWxsKCk7XG5cdH1cblxuXHQqZ2V0U3RhdGljUHJlbG9hZHModmlld1R5cGU6IHN0cmluZyk6IEl0ZXJhYmxlPElOb3RlYm9va1N0YXRpY1ByZWxvYWRJbmZvPiB7XG5cdFx0Zm9yIChjb25zdCBwcmVsb2FkIG9mIHRoaXMuX25vdGVib29rU3RhdGljUHJlbG9hZEluZm9TdG9yZSkge1xuXHRcdFx0aWYgKHByZWxvYWQudHlwZSA9PT0gdmlld1R5cGUpIHtcblx0XHRcdFx0eWllbGQgcHJlbG9hZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gbm90ZWJvb2sgZG9jdW1lbnRzOiBjcmVhdGUsIGRlc3RvcnksIHJldHJpZXZlLCBlbnVtZXJhdGVcblxuXHRhc3luYyBjcmVhdGVOb3RlYm9va1RleHRNb2RlbCh2aWV3VHlwZTogc3RyaW5nLCB1cmk6IFVSSSwgc3RyZWFtPzogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8Tm90ZWJvb2tUZXh0TW9kZWw+IHtcblx0XHRpZiAodGhpcy5fbW9kZWxzLmhhcyh1cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vdGVib29rIGZvciAke3VyaX0gYWxyZWFkeSBleGlzdHNgKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmZvID0gYXdhaXQgdGhpcy53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIodmlld1R5cGUpO1xuXHRcdGlmICghKGluZm8gaW5zdGFuY2VvZiBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ0FOTk9UIG9wZW4gZmlsZSBub3RlYm9vayB3aXRoIHRoaXMgcHJvdmlkZXInKTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IGJ5dGVzID0gc3RyZWFtID8gYXdhaXQgc3RyZWFtVG9CdWZmZXIoc3RyZWFtKSA6IFZTQnVmZmVyLmZyb21CeXRlQXJyYXkoW10pO1xuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBpbmZvLnNlcmlhbGl6ZXIuZGF0YVRvTm90ZWJvb2soYnl0ZXMpO1xuXG5cblx0XHRjb25zdCBub3RlYm9va01vZGVsID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tUZXh0TW9kZWwsIGluZm8udmlld1R5cGUsIHVyaSwgZGF0YS5jZWxscywgZGF0YS5tZXRhZGF0YSwgaW5mby5zZXJpYWxpemVyLm9wdGlvbnMpO1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IG5ldyBNb2RlbERhdGEobm90ZWJvb2tNb2RlbCwgdGhpcy5fb25XaWxsRGlzcG9zZURvY3VtZW50LmJpbmQodGhpcykpO1xuXHRcdHRoaXMuX21vZGVscy5zZXQodXJpLCBtb2RlbERhdGEpO1xuXHRcdHRoaXMuX25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmFkZE5vdGVib29rRG9jdW1lbnQobW9kZWxEYXRhKTtcblx0XHR0aGlzLl9vbldpbGxBZGROb3RlYm9va0RvY3VtZW50LmZpcmUobm90ZWJvb2tNb2RlbCk7XG5cdFx0dGhpcy5fb25EaWRBZGROb3RlYm9va0RvY3VtZW50LmZpcmUobm90ZWJvb2tNb2RlbCk7XG5cdFx0dGhpcy5fcG9zdERvY3VtZW50T3BlbkFjdGl2YXRpb24oaW5mby52aWV3VHlwZSk7XG5cdFx0cmV0dXJuIG5vdGVib29rTW9kZWw7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOb3RlYm9va1RleHREb2N1bWVudFNuYXBzaG90KHVyaTogVVJJLCBjb250ZXh0OiBTbmFwc2hvdENvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXJSZWFkYWJsZVN0cmVhbT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpO1xuXG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBub3RlYm9vayBmb3IgJHt1cml9IGRvZXNuJ3QgZXhpc3RgKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmZvID0gYXdhaXQgdGhpcy53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIobW9kZWwudmlld1R5cGUpO1xuXG5cdFx0aWYgKCEoaW5mbyBpbnN0YW5jZW9mIFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDQU5OT1Qgb3BlbiBmaWxlIG5vdGVib29rIHdpdGggdGhpcyBwcm92aWRlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSBpbmZvLnNlcmlhbGl6ZXI7XG5cdFx0Y29uc3Qgb3V0cHV0U2l6ZUxpbWl0ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcub3V0cHV0QmFja3VwU2l6ZUxpbWl0KSAqIDEwMjQ7XG5cdFx0Y29uc3QgZGF0YTogTm90ZWJvb2tEYXRhID0gbW9kZWwuY3JlYXRlU25hcHNob3QoeyBjb250ZXh0OiBjb250ZXh0LCBvdXRwdXRTaXplTGltaXQ6IG91dHB1dFNpemVMaW1pdCwgdHJhbnNpZW50T3B0aW9uczogc2VyaWFsaXplci5vcHRpb25zIH0pO1xuXHRcdGNvbnN0IGluZGVudEFtb3VudCA9IG1vZGVsLm1ldGFkYXRhLmluZGVudEFtb3VudDtcblx0XHRpZiAodHlwZW9mIGluZGVudEFtb3VudCA9PT0gJ3N0cmluZycgJiYgaW5kZW50QW1vdW50KSB7XG5cdFx0XHQvLyBUaGlzIGlzIHJlcXVpcmVkIGZvciBpcHluYiBzZXJpYWxpemVyIHRvIHByZXNlcnZlIHRoZSB3aGl0ZXNwYWNlIGluIHRoZSBub3RlYm9vay5cblx0XHRcdGRhdGEubWV0YWRhdGEuaW5kZW50QW1vdW50ID0gaW5kZW50QW1vdW50O1xuXHRcdH1cblx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHNlcmlhbGl6ZXIubm90ZWJvb2tUb0RhdGEoZGF0YSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVmZmVyVG9TdHJlYW0oYnl0ZXMpO1xuXHR9XG5cblx0YXN5bmMgcmVzdG9yZU5vdGVib29rVGV4dE1vZGVsRnJvbVNuYXBzaG90KHVyaTogVVJJLCB2aWV3VHlwZTogc3RyaW5nLCBzbmFwc2hvdDogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8Tm90ZWJvb2tUZXh0TW9kZWw+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwodXJpKTtcblxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgbm90ZWJvb2sgZm9yICR7dXJpfSBkb2Vzbid0IGV4aXN0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMud2l0aE5vdGVib29rRGF0YVByb3ZpZGVyKG1vZGVsLnZpZXdUeXBlKTtcblxuXHRcdGlmICghKGluZm8gaW5zdGFuY2VvZiBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ0FOTk9UIG9wZW4gZmlsZSBub3RlYm9vayB3aXRoIHRoaXMgcHJvdmlkZXInKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJpYWxpemVyID0gaW5mby5zZXJpYWxpemVyO1xuXG5cdFx0Y29uc3QgYnl0ZXMgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihzbmFwc2hvdCk7XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGluZm8uc2VyaWFsaXplci5kYXRhVG9Ob3RlYm9vayhieXRlcyk7XG5cdFx0bW9kZWwucmVzdG9yZVNuYXBzaG90KGRhdGEsIHNlcmlhbGl6ZXIub3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRnZXROb3RlYm9va1RleHRNb2RlbCh1cmk6IFVSSSk6IE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzLmdldCh1cmkpPy5tb2RlbDtcblx0fVxuXG5cdGdldE5vdGVib29rVGV4dE1vZGVscygpOiBJdGVyYWJsZTxOb3RlYm9va1RleHRNb2RlbD4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5tYXAodGhpcy5fbW9kZWxzLnZhbHVlcygpLCBkYXRhID0+IGRhdGEubW9kZWwpO1xuXHR9XG5cblx0bGlzdE5vdGVib29rRG9jdW1lbnRzKCk6IE5vdGVib29rVGV4dE1vZGVsW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fbW9kZWxzXS5tYXAoZSA9PiBlWzFdLm1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX29uV2lsbERpc3Bvc2VEb2N1bWVudChtb2RlbDogSU5vdGVib29rVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5fbW9kZWxzLmdldChtb2RlbC51cmkpO1xuXHRcdGlmIChtb2RlbERhdGEpIHtcblx0XHRcdHRoaXMuX29uV2lsbFJlbW92ZU5vdGVib29rRG9jdW1lbnQuZmlyZShtb2RlbERhdGEubW9kZWwpO1xuXHRcdFx0dGhpcy5fbW9kZWxzLmRlbGV0ZShtb2RlbC51cmkpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tEb2N1bWVudFNlcnZpY2UucmVtb3ZlTm90ZWJvb2tEb2N1bWVudChtb2RlbERhdGEpO1xuXHRcdFx0bW9kZWxEYXRhLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlTm90ZWJvb2tEb2N1bWVudC5maXJlKG1vZGVsRGF0YS5tb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3V0cHV0TWltZVR5cGVJbmZvKHRleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsIGtlcm5lbFByb3ZpZGVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgb3V0cHV0OiBJT3V0cHV0RHRvKTogcmVhZG9ubHkgSU9yZGVyZWRNaW1lVHlwZVtdIHtcblx0XHRjb25zdCBzb3J0ZWQgPSB0aGlzLl9kaXNwbGF5T3JkZXIuc29ydChuZXcgU2V0PHN0cmluZz4ob3V0cHV0Lm91dHB1dHMubWFwKG9wID0+IG9wLm1pbWUpKSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tQcm92aWRlckluZm8gPSB0aGlzLm5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUuZ2V0KHRleHRNb2RlbC52aWV3VHlwZSk7XG5cblx0XHRyZXR1cm4gc29ydGVkXG5cdFx0XHQuZmxhdE1hcChtaW1lVHlwZSA9PiB0aGlzLl9ub3RlYm9va1JlbmRlcmVyc0luZm9TdG9yZS5maW5kQmVzdFJlbmRlcmVycyhub3RlYm9va1Byb3ZpZGVySW5mbywgbWltZVR5cGUsIGtlcm5lbFByb3ZpZGVzKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiAoYS5yZW5kZXJlcklkID09PSBSRU5ERVJFUl9OT1RfQVZBSUxBQkxFID8gMSA6IDApIC0gKGIucmVuZGVyZXJJZCA9PT0gUkVOREVSRVJfTk9UX0FWQUlMQUJMRSA/IDEgOiAwKSk7XG5cdH1cblxuXHRnZXRDb250cmlidXRlZE5vdGVib29rVHlwZXMocmVzb3VyY2U/OiBVUkkpOiByZWFkb25seSBOb3RlYm9va1Byb3ZpZGVySW5mb1tdIHtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLm5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi50aGlzLm5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmVdO1xuXHR9XG5cblx0aGFzU3VwcG9ydGVkTm90ZWJvb2tzKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbW9kZWxzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdC8vIGl0IG1pZ2h0IGJlIHVudGl0bGVkXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLm5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhyZXNvdXJjZSk7XG5cdFx0aWYgKCFjb250cmlidXRpb24ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBjb250cmlidXRpb24uc29tZShpbmZvID0+IGluZm8ubWF0Y2hlcyhyZXNvdXJjZSkgJiZcblx0XHRcdChpbmZvLnByaW9yaXR5ID09PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCB8fCBpbmZvLnByaW9yaXR5ID09PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlKVxuXHRcdCk7XG5cdH1cblxuXHRnZXRDb250cmlidXRlZE5vdGVib29rVHlwZSh2aWV3VHlwZTogc3RyaW5nKTogTm90ZWJvb2tQcm92aWRlckluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUuZ2V0KHZpZXdUeXBlKTtcblx0fVxuXG5cdGdldE5vdGVib29rUHJvdmlkZXJSZXNvdXJjZVJvb3RzKCk6IFVSSVtdIHtcblx0XHRjb25zdCByZXQ6IFVSSVtdID0gW107XG5cdFx0dGhpcy5fbm90ZWJvb2tQcm92aWRlcnMuZm9yRWFjaCh2YWwgPT4ge1xuXHRcdFx0aWYgKHZhbC5leHRlbnNpb25EYXRhLmxvY2F0aW9uKSB7XG5cdFx0XHRcdHJldC5wdXNoKFVSSS5yZXZpdmUodmFsLmV4dGVuc2lvbkRhdGEubG9jYXRpb24pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHQvLyAtLS0gY29weSAmIHBhc3RlXG5cblx0c2V0VG9Db3B5KGl0ZW1zOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxbXSwgaXNDb3B5OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY3V0SXRlbXMgPSBpdGVtcztcblx0XHR0aGlzLl9sYXN0Q2xpcGJvYXJkSXNDb3B5ID0gaXNDb3B5O1xuXHR9XG5cblx0Z2V0VG9Db3B5KCk6IHsgaXRlbXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdOyBpc0NvcHk6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2N1dEl0ZW1zKSB7XG5cdFx0XHRyZXR1cm4geyBpdGVtczogdGhpcy5fY3V0SXRlbXMsIGlzQ29weTogdGhpcy5fbGFzdENsaXBib2FyZElzQ29weSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLGlCQUE4QixvQkFB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
