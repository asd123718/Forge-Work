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
import { LazyStatefulPromise, raceTimeout } from "../../../../base/common/async.js";
import { BugIndicatingError, CancellationError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Event, ValueWithChangeEvent } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas } from "../../../../base/common/network.js";
import { deepClone } from "../../../../base/common/objects.js";
import { ObservableLazyPromise, ValueWithChangeEventFromObservable, autorun, constObservable, derived, mapObservableArrayCached, observableFromEvent, observableFromValueWithChangeEvent, observableValue, recomputeInitiallyAndOnChange } from "../../../../base/common/observable.js";
import { isDefined, isObject } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { RefCounted } from "../../../../editor/browser/widget/diffEditor/utils.js";
import { MultiDiffEditorViewModel } from "../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { ConfirmResult } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { MultiDiffEditorIcon } from "./icons.contribution.js";
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from "./multiDiffSourceResolverService.js";
let MultiDiffEditorInput = class extends EditorInput {
  constructor(multiDiffSource, label, initialResources, isTransient = false, _textModelService, _textResourceConfigurationService, _instantiationService, _multiDiffSourceResolverService, _textFileService) {
    super();
    this.multiDiffSource = multiDiffSource;
    this.label = label;
    this.initialResources = initialResources;
    this.isTransient = isTransient;
    this._textModelService = _textModelService;
    this._textResourceConfigurationService = _textResourceConfigurationService;
    this._instantiationService = _instantiationService;
    this._multiDiffSourceResolverService = _multiDiffSourceResolverService;
    this._textFileService = _textFileService;
    this._name = "";
    this._viewModel = new LazyStatefulPromise(async () => {
      const store = new DisposableStore();
      try {
        const model = store.add(await this._createModel());
        if (this._store.isDisposed) {
          throw new CancellationError();
        }
        const vm = store.add(new MultiDiffEditorViewModel(model, this._instantiationService));
        await raceTimeout(vm.waitForDiffOr1s(), 1e3);
        if (this._store.isDisposed) {
          throw new CancellationError();
        }
        this._register(store);
        return vm;
      } catch (error) {
        store.dispose();
        throw error;
      }
    });
    this._resolvedSource = new ObservableLazyPromise(async () => {
      const source = this.initialResources ? { resources: ValueWithChangeEvent.const(this.initialResources) } : await this._multiDiffSourceResolverService.resolve(this.multiDiffSource);
      return {
        source,
        resources: source ? observableFromValueWithChangeEvent(this, source.resources) : constObservable([]),
        label: source?.label ? observableFromValueWithChangeEvent(this, source.label) : void 0
      };
    });
    this.resources = derived(this, (reader) => this._resolvedSource.cachedPromiseResult.read(reader)?.data?.resources.read(reader));
    this.textFileServiceOnDidChange = new FastEventDispatcher(
      this._textFileService.files.onDidChangeDirty,
      (item) => item.resource.toString(),
      (uri) => uri.toString()
    );
    this._isDirtyObservables = mapObservableArrayCached(this, this.resources.map((r) => r ?? []), (res) => {
      const isModifiedDirty = res.modifiedUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.modifiedUri) : constObservable(false);
      const isOriginalDirty = res.originalUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.originalUri) : constObservable(false);
      return derived((reader) => (
        /** @description modifiedDirty||originalDirty */
        isModifiedDirty.read(reader) || isOriginalDirty.read(reader)
      ));
    }, (i) => i.getKey());
    this._isDirtyObservable = derived(this, (reader) => this._isDirtyObservables.read(reader).some((isDirty) => isDirty.read(reader))).keepObserved(this._store);
    this.onDidChangeDirty = Event.fromObservableLight(this._isDirtyObservable);
    this.closeHandler = {
      // This is a workaround for not having a better way
      // to figure out if the editors this input wraps
      // around are opened or not
      async confirm() {
        return ConfirmResult.DONT_SAVE;
      },
      showConfirm() {
        return false;
      }
    };
    this._register(autorun((reader) => {
      const resources = this.resources.read(reader);
      const resolvedSource = this._resolvedSource.cachedPromiseResult.read(reader)?.data;
      const label2 = resolvedSource?.label?.read(reader) ?? this.label ?? localize("name", "Multi Diff Editor");
      if (resources && resources.length === 1) {
        this._name = localize({ key: "nameWithOneFile", comment: ["{0} is the name of the editor"] }, "{0} (1 file)", label2);
      } else if (resources) {
        this._name = localize({ key: "nameWithFiles", comment: ["{0} is the name of the editor", "{1} is the number of files being shown"] }, "{0} ({1} files)", label2, resources.length);
      } else {
        this._name = label2;
      }
      this._onDidChangeLabel.fire();
    }));
  }
  static fromResourceMultiDiffEditorInput(input, instantiationService) {
    if (!input.multiDiffSource && !input.resources) {
      throw new BugIndicatingError("MultiDiffEditorInput requires either multiDiffSource or resources");
    }
    const multiDiffSource = input.multiDiffSource ?? URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
    return instantiationService.createInstance(
      MultiDiffEditorInput,
      multiDiffSource,
      input.label,
      input.resources?.map((resource) => {
        return new MultiDiffEditorItem(
          resource.original.resource,
          resource.modified.resource,
          resource.goToFileResource
        );
      }),
      input.isTransient ?? false
    );
  }
  static fromSerialized(data, instantiationService) {
    return instantiationService.createInstance(
      MultiDiffEditorInput,
      URI.parse(data.multiDiffSourceUri),
      data.label,
      data.resources?.map((resource) => new MultiDiffEditorItem(
        resource.originalUri ? URI.parse(resource.originalUri) : void 0,
        resource.modifiedUri ? URI.parse(resource.modifiedUri) : void 0,
        resource.goToFileUri ? URI.parse(resource.goToFileUri) : void 0
      )),
      false
    );
  }
  get resource() {
    return this.multiDiffSource;
  }
  get capabilities() {
    return EditorInputCapabilities.Readonly;
  }
  get typeId() {
    return MultiDiffEditorInput.ID;
  }
  getName() {
    return this._name;
  }
  get editorId() {
    return DEFAULT_EDITOR_ASSOCIATION.id;
  }
  getIcon() {
    return MultiDiffEditorIcon;
  }
  serialize() {
    return {
      label: this.label,
      multiDiffSourceUri: this.multiDiffSource.toString(),
      resources: this.initialResources?.map((resource) => ({
        originalUri: resource.originalUri?.toString(),
        modifiedUri: resource.modifiedUri?.toString(),
        goToFileUri: resource.goToFileUri?.toString()
      }))
    };
  }
  setLanguageId(languageId, source) {
    const activeDiffItem = this._viewModel.requireValue().activeDiffItem.get();
    const value = activeDiffItem?.documentDiffItem;
    if (!value) {
      return;
    }
    const target = value.modified ?? value.original;
    if (!target) {
      return;
    }
    target.setLanguage(languageId, source);
  }
  async getViewModel() {
    return this._viewModel.getPromise();
  }
  async _createModel() {
    const source = await this._resolvedSource.getPromise();
    const textResourceConfigurationService = this._textResourceConfigurationService;
    const documentsWithPromises = mapObservableArrayCached(this, source.resources, async (r, store) => {
      let original;
      let modified;
      const multiDiffItemStore = new DisposableStore();
      const createModelReference = async (resource) => resource ? this._textModelService.createModelReference(resource) : void 0;
      const [originalResult, modifiedResult] = await Promise.allSettled([
        createModelReference(r.originalUri),
        createModelReference(r.modifiedUri)
      ]);
      if (originalResult.status === "fulfilled") {
        original = originalResult.value;
        if (original) {
          multiDiffItemStore.add(original);
        }
      }
      if (modifiedResult.status === "fulfilled") {
        modified = modifiedResult.value;
        if (modified) {
          multiDiffItemStore.add(modified);
        }
      }
      if (store.isDisposed) {
        multiDiffItemStore.dispose();
        return void 0;
      }
      let errorResult;
      if (originalResult.status === "rejected") {
        errorResult = originalResult;
      } else if (modifiedResult.status === "rejected") {
        errorResult = modifiedResult;
      }
      if (errorResult) {
        multiDiffItemStore.dispose();
        console.error(errorResult.reason);
        onUnexpectedError(errorResult.reason);
        return void 0;
      }
      const uri = r.modifiedUri ?? r.originalUri;
      const result2 = {
        multiDiffEditorItem: r,
        original: original?.object.textEditorModel,
        modified: modified?.object.textEditorModel,
        contextKeys: r.contextKeys,
        get options() {
          return {
            ...getReadonlyConfiguration(modified?.object.isReadonly() ?? true),
            ...computeOptions(textResourceConfigurationService.getValue(uri))
          };
        },
        onOptionsDidChange: (h) => this._textResourceConfigurationService.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration(uri, "editor") || e.affectsConfiguration(uri, "diffEditor")) {
            h();
          }
        })
      };
      return store.add(RefCounted.createOfNonDisposable(result2, multiDiffItemStore, this));
    }, (i) => JSON.stringify([i.modifiedUri?.toString(), i.originalUri?.toString()]));
    const documents = observableValue("documents", "loading");
    const updateDocuments = derived(async (reader) => {
      const docsPromises = documentsWithPromises.read(reader);
      const docs = await Promise.all(docsPromises);
      const newDocuments = docs.filter(isDefined);
      documents.set(newDocuments, void 0);
    });
    const a = recomputeInitiallyAndOnChange(updateDocuments);
    await updateDocuments.get();
    const result = {
      dispose: () => a.dispose(),
      documents: new ValueWithChangeEventFromObservable(documents),
      contextKeys: source.source?.contextKeys
    };
    return result;
  }
  matches(otherInput) {
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof MultiDiffEditorInput) {
      return this.multiDiffSource.toString() === otherInput.multiDiffSource.toString();
    }
    return false;
  }
  isDirty() {
    return this._isDirtyObservable.get();
  }
  async save(group, options) {
    await this.doSaveOrRevert("save", group, options);
    return this;
  }
  revert(group, options) {
    return this.doSaveOrRevert("revert", group, options);
  }
  async doSaveOrRevert(mode, group, options) {
    const items = this._viewModel.currentValue?.items.get();
    if (items) {
      await Promise.all(items.map(async (item) => {
        const model = item.diffEditorViewModel.model;
        const handleOriginal = model.original.uri.scheme !== Schemas.untitled && this._textFileService.isDirty(model.original.uri);
        await Promise.all([
          handleOriginal ? mode === "save" ? this._textFileService.save(model.original.uri, options) : this._textFileService.revert(model.original.uri, options) : Promise.resolve(),
          mode === "save" ? this._textFileService.save(model.modified.uri, options) : this._textFileService.revert(model.modified.uri, options)
        ]);
      }));
    }
    return void 0;
  }
};
MultiDiffEditorInput.ID = "workbench.input.multiDiffEditor";
MultiDiffEditorInput = __decorateClass([
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ITextResourceConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IMultiDiffSourceResolverService),
  __decorateParam(8, ITextFileService)
], MultiDiffEditorInput);
class FastEventDispatcher {
  constructor(_event, _getEventArgsKey, _keyToString) {
    this._event = _event;
    this._getEventArgsKey = _getEventArgsKey;
    this._keyToString = _keyToString;
    this._count = 0;
    this._buckets = /* @__PURE__ */ new Map();
    this._handleEventChange = (e) => {
      const key = this._getEventArgsKey(e);
      const bucket = this._buckets.get(key);
      if (bucket) {
        for (const listener of bucket) {
          listener(e);
        }
      }
    };
  }
  filteredEvent(filter) {
    return (listener) => {
      const key = this._keyToString(filter);
      let bucket = this._buckets.get(key);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Set();
        this._buckets.set(key, bucket);
      }
      bucket.add(listener);
      this._count++;
      if (this._count === 1) {
        this._eventSubscription = this._event(this._handleEventChange);
      }
      return {
        dispose: () => {
          bucket.delete(listener);
          if (bucket.size === 0) {
            this._buckets.delete(key);
          }
          this._count--;
          if (this._count === 0) {
            this._eventSubscription?.dispose();
            this._eventSubscription = void 0;
          }
        }
      };
    };
  }
}
function isUriDirty(onDidChangeDirty, textFileService, uri) {
  return observableFromEvent(onDidChangeDirty.filteredEvent(uri), () => textFileService.isDirty(uri));
}
function getReadonlyConfiguration(isReadonly) {
  return {
    readOnly: !!isReadonly,
    readOnlyMessage: typeof isReadonly !== "boolean" ? isReadonly : void 0
  };
}
function computeOptions(configuration) {
  const editorConfiguration = deepClone(configuration.editor);
  if (isObject(configuration.diffEditor)) {
    const diffEditorConfiguration = deepClone(configuration.diffEditor);
    diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
    delete diffEditorConfiguration.codeLens;
    diffEditorConfiguration.diffWordWrap = diffEditorConfiguration.wordWrap;
    delete diffEditorConfiguration.wordWrap;
    Object.assign(editorConfiguration, diffEditorConfiguration);
  }
  return editorConfiguration;
}
let MultiDiffEditorResolverContribution = class extends Disposable {
  constructor(editorResolverService, instantiationService) {
    super();
    this._register(editorResolverService.registerEditor(
      `*`,
      {
        id: DEFAULT_EDITOR_ASSOCIATION.id,
        label: DEFAULT_EDITOR_ASSOCIATION.displayName,
        detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createMultiDiffEditorInput: (multiDiffEditor) => {
          return {
            editor: MultiDiffEditorInput.fromResourceMultiDiffEditorInput(multiDiffEditor, instantiationService)
          };
        }
      }
    ));
  }
};
MultiDiffEditorResolverContribution.ID = "workbench.contrib.multiDiffEditorResolver";
MultiDiffEditorResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService),
  __decorateParam(1, IInstantiationService)
], MultiDiffEditorResolverContribution);
class MultiDiffEditorSerializer {
  canSerialize(editor) {
    return editor instanceof MultiDiffEditorInput && !editor.isTransient;
  }
  serialize(editor) {
    if (!this.canSerialize(editor)) {
      return void 0;
    }
    return JSON.stringify(editor.serialize());
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const data = parse(serializedEditor);
      return MultiDiffEditorInput.fromSerialized(data, instantiationService);
    } catch (err) {
      onUnexpectedError(err);
      return void 0;
    }
  }
}
export {
  MultiDiffEditorInput,
  MultiDiffEditorResolverContribution,
  MultiDiffEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG11bHRpRGlmZkVkaXRvclxcYnJvd3NlclxcbXVsdGlEaWZmRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBMYXp5U3RhdGVmdWxQcm9taXNlLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVMYXp5UHJvbWlzZSwgVmFsdWVXaXRoQ2hhbmdlRXZlbnRGcm9tT2JzZXJ2YWJsZSwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVGcm9tVmFsdWVXaXRoQ2hhbmdlRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgcmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlZkNvdW50ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci91dGlscy5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbSwgSU11bHRpRGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRFZGl0b3IuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBHcm91cElkZW50aWZpZXIsIElFZGl0b3JTZXJpYWxpemVyLCBJUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQsIElFZGl0b3JDbG9zZUhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVN1cHBvcnQsIElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJY29uIH0gZnJvbSAnLi9pY29ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSwgSVJlc29sdmVkTXVsdGlEaWZmU291cmNlLCBNdWx0aURpZmZFZGl0b3JJdGVtIH0gZnJvbSAnLi9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgTXVsdGlEaWZmRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElMYW5ndWFnZVN1cHBvcnQge1xuXHRwdWJsaWMgc3RhdGljIGZyb21SZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0KGlucHV0OiBJUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IE11bHRpRGlmZkVkaXRvcklucHV0IHtcblx0XHRpZiAoIWlucHV0Lm11bHRpRGlmZlNvdXJjZSAmJiAhaW5wdXQucmVzb3VyY2VzKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdNdWx0aURpZmZFZGl0b3JJbnB1dCByZXF1aXJlcyBlaXRoZXIgbXVsdGlEaWZmU291cmNlIG9yIHJlc291cmNlcycpO1xuXHRcdH1cblx0XHRjb25zdCBtdWx0aURpZmZTb3VyY2UgPSBpbnB1dC5tdWx0aURpZmZTb3VyY2UgPz8gVVJJLnBhcnNlKGBtdWx0aS1kaWZmLWVkaXRvcjoke25ldyBEYXRlKCkuZ2V0TWlsbGlzZWNvbmRzKCkudG9TdHJpbmcoKSArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoKX1gKTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNdWx0aURpZmZFZGl0b3JJbnB1dCxcblx0XHRcdG11bHRpRGlmZlNvdXJjZSxcblx0XHRcdGlucHV0LmxhYmVsLFxuXHRcdFx0aW5wdXQucmVzb3VyY2VzPy5tYXAocmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0cmVzb3VyY2Uub3JpZ2luYWwucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2UubW9kaWZpZWQucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2UuZ29Ub0ZpbGVSZXNvdXJjZSxcblx0XHRcdFx0KTtcblx0XHRcdH0pLFxuXHRcdFx0aW5wdXQuaXNUcmFuc2llbnQgPz8gZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU2VyaWFsaXplZChkYXRhOiBJU2VyaWFsaXplZE11bHRpRGlmZkVkaXRvcklucHV0LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogTXVsdGlEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0VVJJLnBhcnNlKGRhdGEubXVsdGlEaWZmU291cmNlVXJpKSxcblx0XHRcdGRhdGEubGFiZWwsXG5cdFx0XHRkYXRhLnJlc291cmNlcz8ubWFwKHJlc291cmNlID0+IG5ldyBNdWx0aURpZmZFZGl0b3JJdGVtKFxuXHRcdFx0XHRyZXNvdXJjZS5vcmlnaW5hbFVyaSA/IFVSSS5wYXJzZShyZXNvdXJjZS5vcmlnaW5hbFVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc291cmNlLm1vZGlmaWVkVXJpID8gVVJJLnBhcnNlKHJlc291cmNlLm1vZGlmaWVkVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb3VyY2UuZ29Ub0ZpbGVVcmkgPyBVUkkucGFyc2UocmVzb3VyY2UuZ29Ub0ZpbGVVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0KSksXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guaW5wdXQubXVsdGlEaWZmRWRpdG9yJztcblxuXHRnZXQgcmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMubXVsdGlEaWZmU291cmNlOyB9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7IHJldHVybiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTsgfVxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7IHJldHVybiBNdWx0aURpZmZFZGl0b3JJbnB1dC5JRDsgfVxuXG5cdHByaXZhdGUgX25hbWU6IHN0cmluZztcblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fbmFtZTsgfVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcgeyByZXR1cm4gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQ7IH1cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24geyByZXR1cm4gTXVsdGlEaWZmRWRpdG9ySWNvbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtdWx0aURpZmZTb3VyY2U6IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5pdGlhbFJlc291cmNlczogcmVhZG9ubHkgTXVsdGlEaWZmRWRpdG9ySXRlbVtdIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc1RyYW5zaWVudDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZTogSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbmFtZSA9ICcnO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IG5ldyBMYXp5U3RhdGVmdWxQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoYXdhaXQgdGhpcy5fY3JlYXRlTW9kZWwoKSk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2bSA9IHN0b3JlLmFkZChuZXcgTXVsdGlEaWZmRWRpdG9yVmlld01vZGVsKG1vZGVsLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0XHRhd2FpdCByYWNlVGltZW91dCh2bS53YWl0Rm9yRGlmZk9yMXMoKSwgMTAwMCk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihzdG9yZSk7XG5cdFx0XHRcdHJldHVybiB2bTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRTb3VyY2UgPSBuZXcgT2JzZXJ2YWJsZUxhenlQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZTogSVJlc29sdmVkTXVsdGlEaWZmU291cmNlIHwgdW5kZWZpbmVkID0gdGhpcy5pbml0aWFsUmVzb3VyY2VzXG5cdFx0XHRcdD8geyByZXNvdXJjZXM6IFZhbHVlV2l0aENoYW5nZUV2ZW50LmNvbnN0KHRoaXMuaW5pdGlhbFJlc291cmNlcykgfVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuX211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZS5yZXNvbHZlKHRoaXMubXVsdGlEaWZmU291cmNlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VzOiBzb3VyY2UgPyBvYnNlcnZhYmxlRnJvbVZhbHVlV2l0aENoYW5nZUV2ZW50KHRoaXMsIHNvdXJjZS5yZXNvdXJjZXMpIDogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRcdFx0bGFiZWw6IHNvdXJjZT8ubGFiZWwgPyBvYnNlcnZhYmxlRnJvbVZhbHVlV2l0aENoYW5nZUV2ZW50KHRoaXMsIHNvdXJjZS5sYWJlbCkgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzb3VyY2VzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fcmVzb2x2ZWRTb3VyY2UuY2FjaGVkUHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik/LmRhdGE/LnJlc291cmNlcy5yZWFkKHJlYWRlcikpO1xuXHRcdHRoaXMudGV4dEZpbGVTZXJ2aWNlT25EaWRDaGFuZ2UgPSBuZXcgRmFzdEV2ZW50RGlzcGF0Y2hlcjxJVGV4dEZpbGVFZGl0b3JNb2RlbCwgVVJJPihcblx0XHRcdHRoaXMuX3RleHRGaWxlU2VydmljZS5maWxlcy5vbkRpZENoYW5nZURpcnR5LFxuXHRcdFx0aXRlbSA9PiBpdGVtLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR1cmkgPT4gdXJpLnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdHRoaXMuX2lzRGlydHlPYnNlcnZhYmxlcyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCB0aGlzLnJlc291cmNlcy5tYXAociA9PiByID8/IFtdKSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGlzTW9kaWZpZWREaXJ0eSA9IHJlcy5tb2RpZmllZFVyaSA/IGlzVXJpRGlydHkodGhpcy50ZXh0RmlsZVNlcnZpY2VPbkRpZENoYW5nZSwgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLCByZXMubW9kaWZpZWRVcmkpIDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRcdGNvbnN0IGlzT3JpZ2luYWxEaXJ0eSA9IHJlcy5vcmlnaW5hbFVyaSA/IGlzVXJpRGlydHkodGhpcy50ZXh0RmlsZVNlcnZpY2VPbkRpZENoYW5nZSwgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLCByZXMub3JpZ2luYWxVcmkpIDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIG1vZGlmaWVkRGlydHl8fG9yaWdpbmFsRGlydHkgKi8gaXNNb2RpZmllZERpcnR5LnJlYWQocmVhZGVyKSB8fCBpc09yaWdpbmFsRGlydHkucmVhZChyZWFkZXIpKTtcblx0XHR9LCBpID0+IGkuZ2V0S2V5KCkpO1xuXHRcdHRoaXMuX2lzRGlydHlPYnNlcnZhYmxlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5faXNEaXJ0eU9ic2VydmFibGVzLnJlYWQocmVhZGVyKS5zb21lKGlzRGlydHkgPT4gaXNEaXJ0eS5yZWFkKHJlYWRlcikpKVxuXHRcdFx0LmtlZXBPYnNlcnZlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZURpcnR5ID0gRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodCh0aGlzLl9pc0RpcnR5T2JzZXJ2YWJsZSk7XG5cdFx0dGhpcy5jbG9zZUhhbmRsZXIgPSB7XG5cblx0XHRcdC8vIFRoaXMgaXMgYSB3b3JrYXJvdW5kIGZvciBub3QgaGF2aW5nIGEgYmV0dGVyIHdheVxuXHRcdFx0Ly8gdG8gZmlndXJlIG91dCBpZiB0aGUgZWRpdG9ycyB0aGlzIGlucHV0IHdyYXBzXG5cdFx0XHQvLyBhcm91bmQgYXJlIG9wZW5lZCBvciBub3RcblxuXHRcdFx0YXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFO1xuXHRcdFx0fSxcblx0XHRcdHNob3dDb25maXJtKCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGVzIG5hbWUgKi9cblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IHRoaXMucmVzb3VyY2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkU291cmNlID0gdGhpcy5fcmVzb2x2ZWRTb3VyY2UuY2FjaGVkUHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik/LmRhdGE7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHJlc29sdmVkU291cmNlPy5sYWJlbD8ucmVhZChyZWFkZXIpID8/IHRoaXMubGFiZWwgPz8gbG9jYWxpemUoJ25hbWUnLCBcIk11bHRpIERpZmYgRWRpdG9yXCIpO1xuXHRcdFx0aWYgKHJlc291cmNlcyAmJiByZXNvdXJjZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX25hbWUgPSBsb2NhbGl6ZSh7IGtleTogJ25hbWVXaXRoT25lRmlsZScsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBuYW1lIG9mIHRoZSBlZGl0b3InXSB9LCBcInswfSAoMSBmaWxlKVwiLCBsYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9uYW1lID0gbG9jYWxpemUoeyBrZXk6ICduYW1lV2l0aEZpbGVzJywgY29tbWVudDogWyd7MH0gaXMgdGhlIG5hbWUgb2YgdGhlIGVkaXRvcicsICd7MX0gaXMgdGhlIG51bWJlciBvZiBmaWxlcyBiZWluZyBzaG93biddIH0sIFwiezB9ICh7MX0gZmlsZXMpXCIsIGxhYmVsLCByZXNvdXJjZXMubGVuZ3RoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX25hbWUgPSBsYWJlbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogSVNlcmlhbGl6ZWRNdWx0aURpZmZFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0bXVsdGlEaWZmU291cmNlVXJpOiB0aGlzLm11bHRpRGlmZlNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzb3VyY2VzOiB0aGlzLmluaXRpYWxSZXNvdXJjZXM/Lm1hcChyZXNvdXJjZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFVyaTogcmVzb3VyY2Uub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkVXJpOiByZXNvdXJjZS5tb2RpZmllZFVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0Z29Ub0ZpbGVVcmk6IHJlc291cmNlLmdvVG9GaWxlVXJpPy50b1N0cmluZygpLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc2V0TGFuZ3VhZ2VJZChsYW5ndWFnZUlkOiBzdHJpbmcsIHNvdXJjZT86IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZURpZmZJdGVtID0gdGhpcy5fdmlld01vZGVsLnJlcXVpcmVWYWx1ZSgpLmFjdGl2ZURpZmZJdGVtLmdldCgpO1xuXHRcdGNvbnN0IHZhbHVlID0gYWN0aXZlRGlmZkl0ZW0/LmRvY3VtZW50RGlmZkl0ZW07XG5cdFx0aWYgKCF2YWx1ZSkgeyByZXR1cm47IH1cblx0XHRjb25zdCB0YXJnZXQgPSB2YWx1ZS5tb2RpZmllZCA/PyB2YWx1ZS5vcmlnaW5hbDtcblx0XHRpZiAoIXRhcmdldCkgeyByZXR1cm47IH1cblx0XHR0YXJnZXQuc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZCwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRWaWV3TW9kZWwoKTogUHJvbWlzZTxNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWw+IHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld01vZGVsLmdldFByb21pc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbDtcblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVNb2RlbCgpOiBQcm9taXNlPElNdWx0aURpZmZFZGl0b3JNb2RlbCAmIElEaXNwb3NhYmxlPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgdGhpcy5fcmVzb2x2ZWRTb3VyY2UuZ2V0UHJvbWlzZSgpO1xuXHRcdGNvbnN0IHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gdGhpcy5fdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0XHRjb25zdCBkb2N1bWVudHNXaXRoUHJvbWlzZXMgPSBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQodGhpcywgc291cmNlLnJlc291cmNlcywgYXN5bmMgKHIsIHN0b3JlKSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGRvY3VtZW50c1dpdGhQcm9taXNlcyAqL1xuXHRcdFx0bGV0IG9yaWdpbmFsOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbW9kaWZpZWQ6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgbXVsdGlEaWZmSXRlbVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgY3JlYXRlTW9kZWxSZWZlcmVuY2UgPSBhc3luYyAocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCkgPT4gcmVzb3VyY2UgPyB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgW29yaWdpbmFsUmVzdWx0LCBtb2RpZmllZFJlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0XHRjcmVhdGVNb2RlbFJlZmVyZW5jZShyLm9yaWdpbmFsVXJpKSxcblx0XHRcdFx0Y3JlYXRlTW9kZWxSZWZlcmVuY2Uoci5tb2RpZmllZFVyaSksXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsUmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcblx0XHRcdFx0b3JpZ2luYWwgPSBvcmlnaW5hbFJlc3VsdC52YWx1ZTtcblx0XHRcdFx0aWYgKG9yaWdpbmFsKSB7IG11bHRpRGlmZkl0ZW1TdG9yZS5hZGQob3JpZ2luYWwpOyB9XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kaWZpZWRSZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHRtb2RpZmllZCA9IG1vZGlmaWVkUmVzdWx0LnZhbHVlO1xuXHRcdFx0XHRpZiAobW9kaWZpZWQpIHsgbXVsdGlEaWZmSXRlbVN0b3JlLmFkZChtb2RpZmllZCk7IH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0bXVsdGlEaWZmSXRlbVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVycm9yUmVzdWx0OiBQcm9taXNlUmVqZWN0ZWRSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAob3JpZ2luYWxSZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdGVycm9yUmVzdWx0ID0gb3JpZ2luYWxSZXN1bHQ7XG5cdFx0XHR9IGVsc2UgaWYgKG1vZGlmaWVkUmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHRlcnJvclJlc3VsdCA9IG1vZGlmaWVkUmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVycm9yUmVzdWx0KSB7XG5cdFx0XHRcdG11bHRpRGlmZkl0ZW1TdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdC8vIGUuZy4gXCJGaWxlIHNlZW1zIHRvIGJlIGJpbmFyeSBhbmQgY2Fubm90IGJlIG9wZW5lZCBhcyB0ZXh0XCJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnJvclJlc3VsdC5yZWFzb24pO1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvclJlc3VsdC5yZWFzb24pO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cmkgPSAoci5tb2RpZmllZFVyaSA/PyByLm9yaWdpbmFsVXJpKSE7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElEb2N1bWVudERpZmZJdGVtV2l0aE11bHRpRGlmZkVkaXRvckl0ZW0gPSB7XG5cdFx0XHRcdG11bHRpRGlmZkVkaXRvckl0ZW06IHIsXG5cdFx0XHRcdG9yaWdpbmFsOiBvcmlnaW5hbD8ub2JqZWN0LnRleHRFZGl0b3JNb2RlbCxcblx0XHRcdFx0bW9kaWZpZWQ6IG1vZGlmaWVkPy5vYmplY3QudGV4dEVkaXRvck1vZGVsLFxuXHRcdFx0XHRjb250ZXh0S2V5czogci5jb250ZXh0S2V5cyxcblx0XHRcdFx0Z2V0IG9wdGlvbnMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmdldFJlYWRvbmx5Q29uZmlndXJhdGlvbihtb2RpZmllZD8ub2JqZWN0LmlzUmVhZG9ubHkoKSA/PyB0cnVlKSxcblx0XHRcdFx0XHRcdC4uLmNvbXB1dGVPcHRpb25zKHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHVyaSkpLFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElEaWZmRWRpdG9yT3B0aW9ucztcblx0XHRcdFx0fSxcblx0XHRcdFx0b25PcHRpb25zRGlkQ2hhbmdlOiBoID0+IHRoaXMuX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbih1cmksICdlZGl0b3InKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHVyaSwgJ2RpZmZFZGl0b3InKSkge1xuXHRcdFx0XHRcdFx0aCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZChSZWZDb3VudGVkLmNyZWF0ZU9mTm9uRGlzcG9zYWJsZShyZXN1bHQsIG11bHRpRGlmZkl0ZW1TdG9yZSwgdGhpcykpO1xuXHRcdH0sIGkgPT4gSlNPTi5zdHJpbmdpZnkoW2kubW9kaWZpZWRVcmk/LnRvU3RyaW5nKCksIGkub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCldKSk7XG5cblx0XHRjb25zdCBkb2N1bWVudHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgUmVmQ291bnRlZDxJRG9jdW1lbnREaWZmSXRlbT5bXSB8ICdsb2FkaW5nJz4oJ2RvY3VtZW50cycsICdsb2FkaW5nJyk7XG5cblx0XHRjb25zdCB1cGRhdGVEb2N1bWVudHMgPSBkZXJpdmVkKGFzeW5jIHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFVwZGF0ZSBkb2N1bWVudHMgKi9cblx0XHRcdGNvbnN0IGRvY3NQcm9taXNlcyA9IGRvY3VtZW50c1dpdGhQcm9taXNlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkb2NzID0gYXdhaXQgUHJvbWlzZS5hbGwoZG9jc1Byb21pc2VzKTtcblx0XHRcdGNvbnN0IG5ld0RvY3VtZW50cyA9IGRvY3MuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0XHRkb2N1bWVudHMuc2V0KG5ld0RvY3VtZW50cywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGEgPSByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh1cGRhdGVEb2N1bWVudHMpO1xuXHRcdGF3YWl0IHVwZGF0ZURvY3VtZW50cy5nZXQoKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSU11bHRpRGlmZkVkaXRvck1vZGVsICYgSURpc3Bvc2FibGUgPSB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBhLmRpc3Bvc2UoKSxcblx0XHRcdGRvY3VtZW50czogbmV3IFZhbHVlV2l0aENoYW5nZUV2ZW50RnJvbU9ic2VydmFibGUoZG9jdW1lbnRzKSxcblx0XHRcdGNvbnRleHRLZXlzOiBzb3VyY2Uuc291cmNlPy5jb250ZXh0S2V5cyxcblx0XHR9O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZFNvdXJjZTtcblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVySW5wdXQ6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdXBlci5tYXRjaGVzKG90aGVySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJJbnB1dCBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tdWx0aURpZmZTb3VyY2UudG9TdHJpbmcoKSA9PT0gb3RoZXJJbnB1dC5tdWx0aURpZmZTb3VyY2UudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVzb3VyY2VzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlT25EaWRDaGFuZ2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNEaXJ0eU9ic2VydmFibGVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0RpcnR5T2JzZXJ2YWJsZTtcblxuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZURpcnR5O1xuXHRvdmVycmlkZSBpc0RpcnR5KCkgeyByZXR1cm4gdGhpcy5faXNEaXJ0eU9ic2VydmFibGUuZ2V0KCk7IH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlKGdyb3VwOiBudW1iZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPEVkaXRvcklucHV0PiB7XG5cdFx0YXdhaXQgdGhpcy5kb1NhdmVPclJldmVydCgnc2F2ZScsIGdyb3VwLCBvcHRpb25zKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdG92ZXJyaWRlIHJldmVydChncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kb1NhdmVPclJldmVydCgncmV2ZXJ0JywgZ3JvdXAsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NhdmVPclJldmVydChtb2RlOiAnc2F2ZScsIGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZU9yUmV2ZXJ0KG1vZGU6ICdyZXZlcnQnLCBncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZU9yUmV2ZXJ0KG1vZGU6ICdzYXZlJyB8ICdyZXZlcnQnLCBncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zIHwgSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX3ZpZXdNb2RlbC5jdXJyZW50VmFsdWU/Lml0ZW1zLmdldCgpO1xuXHRcdGlmIChpdGVtcykge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaXRlbXMubWFwKGFzeW5jIGl0ZW0gPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGl0ZW0uZGlmZkVkaXRvclZpZXdNb2RlbC5tb2RlbDtcblx0XHRcdFx0Y29uc3QgaGFuZGxlT3JpZ2luYWwgPSBtb2RlbC5vcmlnaW5hbC51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkICYmIHRoaXMuX3RleHRGaWxlU2VydmljZS5pc0RpcnR5KG1vZGVsLm9yaWdpbmFsLnVyaSk7IC8vIG1hdGNoIGRpZmYgZWRpdG9yIGJlaGF2aW91clxuXG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRoYW5kbGVPcmlnaW5hbCA/IG1vZGUgPT09ICdzYXZlJyA/IHRoaXMuX3RleHRGaWxlU2VydmljZS5zYXZlKG1vZGVsLm9yaWdpbmFsLnVyaSwgb3B0aW9ucykgOiB0aGlzLl90ZXh0RmlsZVNlcnZpY2UucmV2ZXJ0KG1vZGVsLm9yaWdpbmFsLnVyaSwgb3B0aW9ucykgOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRtb2RlID09PSAnc2F2ZScgPyB0aGlzLl90ZXh0RmlsZVNlcnZpY2Uuc2F2ZShtb2RlbC5tb2RpZmllZC51cmksIG9wdGlvbnMpIDogdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLnJldmVydChtb2RlbC5tb2RpZmllZC51cmksIG9wdGlvbnMpLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNsb3NlSGFuZGxlcjogSUVkaXRvckNsb3NlSGFuZGxlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRG9jdW1lbnREaWZmSXRlbVdpdGhNdWx0aURpZmZFZGl0b3JJdGVtIGV4dGVuZHMgSURvY3VtZW50RGlmZkl0ZW0ge1xuXHRtdWx0aURpZmZFZGl0b3JJdGVtOiBNdWx0aURpZmZFZGl0b3JJdGVtO1xufVxuXG4vKipcbiAqIFVzZXMgYSBtYXAgdG8gZWZmaWNpZW50bHkgZGlzcGF0Y2ggZXZlbnRzIHRvIGxpc3RlbmVycyB0aGF0IGFyZSBpbnRlcmVzdGVkIGluIGEgc3BlY2lmaWMga2V5LlxuKi9cbmNsYXNzIEZhc3RFdmVudERpc3BhdGNoZXI8VCwgVEtleT4ge1xuXHRwcml2YXRlIF9jb3VudCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCh2YWx1ZTogVCkgPT4gdm9pZD4+KCk7XG5cblx0cHJpdmF0ZSBfZXZlbnRTdWJzY3JpcHRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V2ZW50OiBFdmVudDxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRFdmVudEFyZ3NLZXk6IChpdGVtOiBUKSA9PiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfa2V5VG9TdHJpbmc6IChrZXk6IFRLZXkpID0+IHN0cmluZyxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyZWRFdmVudChmaWx0ZXI6IFRLZXkpOiAobGlzdGVuZXI6IChlOiBUKSA9PiB1bmtub3duKSA9PiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIGxpc3RlbmVyID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleVRvU3RyaW5nKGZpbHRlcik7XG5cdFx0XHRsZXQgYnVja2V0ID0gdGhpcy5fYnVja2V0cy5nZXQoa2V5KTtcblx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdGJ1Y2tldCA9IG5ldyBTZXQoKTtcblx0XHRcdFx0dGhpcy5fYnVja2V0cy5zZXQoa2V5LCBidWNrZXQpO1xuXHRcdFx0fVxuXHRcdFx0YnVja2V0LmFkZChsaXN0ZW5lcik7XG5cblx0XHRcdHRoaXMuX2NvdW50Kys7XG5cdFx0XHRpZiAodGhpcy5fY291bnQgPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fZXZlbnRTdWJzY3JpcHRpb24gPSB0aGlzLl9ldmVudCh0aGlzLl9oYW5kbGVFdmVudENoYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRidWNrZXQhLmRlbGV0ZShsaXN0ZW5lcik7XG5cdFx0XHRcdFx0aWYgKGJ1Y2tldCEuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYnVja2V0cy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fY291bnQtLTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLl9jb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXZlbnRTdWJzY3JpcHRpb24/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2V2ZW50U3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlRXZlbnRDaGFuZ2UgPSAoZTogVCkgPT4ge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEV2ZW50QXJnc0tleShlKTtcblx0XHRjb25zdCBidWNrZXQgPSB0aGlzLl9idWNrZXRzLmdldChrZXkpO1xuXHRcdGlmIChidWNrZXQpIHtcblx0XHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgYnVja2V0KSB7XG5cdFx0XHRcdGxpc3RlbmVyKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gaXNVcmlEaXJ0eShvbkRpZENoYW5nZURpcnR5OiBGYXN0RXZlbnREaXNwYXRjaGVyPElUZXh0RmlsZUVkaXRvck1vZGVsLCBVUkk+LCB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsIHVyaTogVVJJKSB7XG5cdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KG9uRGlkQ2hhbmdlRGlydHkuZmlsdGVyZWRFdmVudCh1cmkpLCAoKSA9PiB0ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh1cmkpKTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVhZG9ubHlDb25maWd1cmF0aW9uKGlzUmVhZG9ubHk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiB7IHJlYWRPbmx5OiBib29sZWFuOyByZWFkT25seU1lc3NhZ2U6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0cmV0dXJuIHtcblx0XHRyZWFkT25seTogISFpc1JlYWRvbmx5LFxuXHRcdHJlYWRPbmx5TWVzc2FnZTogdHlwZW9mIGlzUmVhZG9ubHkgIT09ICdib29sZWFuJyA/IGlzUmVhZG9ubHkgOiB1bmRlZmluZWRcblx0fTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU9wdGlvbnMoY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24pOiBJRGlmZkVkaXRvck9wdGlvbnMge1xuXHRjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uID0gZGVlcENsb25lKGNvbmZpZ3VyYXRpb24uZWRpdG9yKTtcblxuXHQvLyBIYW5kbGUgZGlmZiBlZGl0b3Igc3BlY2lhbGx5IGJ5IG1lcmdpbmcgaW4gZGlmZkVkaXRvciBjb25maWd1cmF0aW9uXG5cdGlmIChpc09iamVjdChjb25maWd1cmF0aW9uLmRpZmZFZGl0b3IpKSB7XG5cdFx0Y29uc3QgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb246IElEaWZmRWRpdG9yT3B0aW9ucyA9IGRlZXBDbG9uZShjb25maWd1cmF0aW9uLmRpZmZFZGl0b3IpO1xuXG5cdFx0Ly8gVXNlciBzZXR0aW5ncyBkZWZpbmVzIGBkaWZmRWRpdG9yLmNvZGVMZW5zYCwgYnV0IGhlcmUgd2UgcmVuYW1lIHRoYXQgdG8gYGRpZmZFZGl0b3IuZGlmZkNvZGVMZW5zYCB0byBhdm9pZCBjb2xsaXNpb25zIHdpdGggYGVkaXRvci5jb2RlTGVuc2AuXG5cdFx0ZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24uZGlmZkNvZGVMZW5zID0gZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24uY29kZUxlbnM7XG5cdFx0ZGVsZXRlIGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLmNvZGVMZW5zO1xuXG5cdFx0Ly8gVXNlciBzZXR0aW5ncyBkZWZpbmVzIGBkaWZmRWRpdG9yLndvcmRXcmFwYCwgYnV0IGhlcmUgd2UgcmVuYW1lIHRoYXQgdG8gYGRpZmZFZGl0b3IuZGlmZldvcmRXcmFwYCB0byBhdm9pZCBjb2xsaXNpb25zIHdpdGggYGVkaXRvci53b3JkV3JhcGAuXG5cdFx0ZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24uZGlmZldvcmRXcmFwID0gPCdvZmYnIHwgJ29uJyB8ICdpbmhlcml0JyB8IHVuZGVmaW5lZD5kaWZmRWRpdG9yQ29uZmlndXJhdGlvbi53b3JkV3JhcDtcblx0XHRkZWxldGUgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24ud29yZFdyYXA7XG5cblx0XHRPYmplY3QuYXNzaWduKGVkaXRvckNvbmZpZ3VyYXRpb24sIGRpZmZFZGl0b3JDb25maWd1cmF0aW9uKTtcblx0fVxuXHRyZXR1cm4gZWRpdG9yQ29uZmlndXJhdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpRGlmZkVkaXRvclJlc29sdmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm11bHRpRGlmZkVkaXRvclJlc29sdmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0YCpgLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsXG5cdFx0XHRcdGxhYmVsOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0ZGV0YWlsOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5wcm92aWRlckRpc3BsYXlOYW1lLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlTXVsdGlEaWZmRWRpdG9ySW5wdXQ6IChtdWx0aURpZmZFZGl0b3I6IElSZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0KTogRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVkaXRvcjogTXVsdGlEaWZmRWRpdG9ySW5wdXQuZnJvbVJlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQobXVsdGlEaWZmRWRpdG9yLCBpbnN0YW50aWF0aW9uU2VydmljZSksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRNdWx0aURpZmZFZGl0b3JJbnB1dCB7XG5cdG11bHRpRGlmZlNvdXJjZVVyaTogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZXNvdXJjZXM6IHtcblx0XHRvcmlnaW5hbFVyaTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdG1vZGlmaWVkVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Z29Ub0ZpbGVVcmk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0fVtdIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlEaWZmRWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRjYW5TZXJpYWxpemUoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGVkaXRvciBpcyBNdWx0aURpZmZFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0ICYmICFlZGl0b3IuaXNUcmFuc2llbnQ7XG5cdH1cblxuXHRzZXJpYWxpemUoZWRpdG9yOiBNdWx0aURpZmZFZGl0b3JJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmNhblNlcmlhbGl6ZShlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShlZGl0b3Iuc2VyaWFsaXplKCkpO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgc2VyaWFsaXplZEVkaXRvcjogc3RyaW5nKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhID0gcGFyc2Uoc2VyaWFsaXplZEVkaXRvcikgYXMgSVNlcmlhbGl6ZWRNdWx0aURpZmZFZGl0b3JJbnB1dDtcblx0XHRcdHJldHVybiBNdWx0aURpZmZFZGl0b3JJbnB1dC5mcm9tU2VyaWFsaXplZChkYXRhLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUIsbUJBQW1CO0FBQ2pELFNBQVMsb0JBQW9CLG1CQUFtQix5QkFBeUI7QUFDekUsU0FBUyxPQUFPLDRCQUE0QjtBQUU1QyxTQUFTLFlBQVksdUJBQWdEO0FBQ3JFLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUIsb0NBQW9DLFNBQVMsaUJBQWlCLFNBQVMsMEJBQTBCLHFCQUFxQixvQ0FBb0MsaUJBQWlCLHFDQUFxQztBQUVoUCxTQUFTLFdBQVcsZ0JBQWdCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdDQUFnQztBQUV6QyxTQUFtQyx5QkFBeUI7QUFDNUQsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw0QkFBNEIsK0JBQTZLO0FBQ2xOLFNBQVMsbUJBQXdDO0FBQ2pELFNBQVMs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
