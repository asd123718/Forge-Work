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
import { ResourceMap } from "../../../../base/common/map.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EncodingMode, isTextFileEditorModel, ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { Disposable, DisposableMap, DisposableStore, ReferenceCollection } from "../../../../base/common/lifecycle.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { shouldSynchronizeModel } from "../../../../editor/common/model.js";
import { compareChanges, getModifiedEndLineNumber, IQuickDiffService } from "../common/quickDiff.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { ISCMService } from "../common/scm.js";
import { sortedDiff, equals } from "../../../../base/common/arrays.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DiffState } from "../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js";
import { toLineChanges } from "../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { autorun } from "../../../../base/common/observable.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
const IQuickDiffModelService = createDecorator("IQuickDiffModelService");
const decoratorQuickDiffModelOptions = {
  algorithm: "advanced",
  maxComputationTimeMs: 1e3
};
let QuickDiffModelReferenceCollection = class extends ReferenceCollection {
  constructor(_instantiationService) {
    super();
    this._instantiationService = _instantiationService;
  }
  createReferencedObject(_key, textFileModel, options) {
    return this._instantiationService.createInstance(QuickDiffModel, textFileModel, options);
  }
  destroyReferencedObject(_key, object) {
    object.dispose();
  }
};
QuickDiffModelReferenceCollection = __decorateClass([
  __decorateParam(0, IInstantiationService)
], QuickDiffModelReferenceCollection);
let QuickDiffModelService = class {
  constructor(instantiationService, textFileService, uriIdentityService) {
    this.instantiationService = instantiationService;
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this._references = this.instantiationService.createInstance(QuickDiffModelReferenceCollection);
  }
  createQuickDiffModelReference(resource, options = decoratorQuickDiffModelOptions) {
    const textFileModel = this.textFileService.files.get(resource);
    if (!textFileModel?.isResolved()) {
      return void 0;
    }
    resource = this.uriIdentityService.asCanonicalUri(resource).with({ query: JSON.stringify(options) });
    return this._references.acquire(resource.toString(), textFileModel, options);
  }
};
QuickDiffModelService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IUriIdentityService)
], QuickDiffModelService);
let QuickDiffModel = class extends Disposable {
  constructor(textFileModel, options, scmService, quickDiffService, editorWorkerService, configurationService, textModelResolverService, _chatEditingService, progressService, environmentService) {
    super();
    this.options = options;
    this.scmService = scmService;
    this.quickDiffService = quickDiffService;
    this.editorWorkerService = editorWorkerService;
    this.configurationService = configurationService;
    this.textModelResolverService = textModelResolverService;
    this._chatEditingService = _chatEditingService;
    this.progressService = progressService;
    this.environmentService = environmentService;
    this._originalEditorModels = new ResourceMap();
    this._originalEditorModelsDisposables = this._register(new DisposableStore());
    this._disposed = false;
    this._quickDiffs = [];
    this._diffDelayer = this._register(new ThrottledDelayer(200));
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._allChanges = [];
    this._changes = [];
    this._changesVersionId = 0;
    /**
     * Map of quick diff name to the index of the change in `this.changes`
     */
    this._quickDiffChanges = /* @__PURE__ */ new Map();
    this._repositoryDisposables = new DisposableMap();
    this._model = textFileModel;
    this._changesVersionId = textFileModel.textEditorModel.getVersionId();
    this._register(textFileModel.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
    this._register(
      Event.filter(
        configurationService.onDidChangeConfiguration,
        (e) => e.affectsConfiguration("scm.diffDecorationsIgnoreTrimWhitespace") || e.affectsConfiguration("diffEditor.ignoreTrimWhitespace")
      )(this.triggerDiff, this)
    );
    this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
    for (const r of scmService.repositories) {
      this.onDidAddRepository(r);
    }
    this._register(this._model.onDidChangeEncoding(() => {
      this._diffDelayer.cancel();
      this._quickDiffs = [];
      this._originalEditorModels.clear();
      this._quickDiffsPromise = void 0;
      this.setChanges([], [], /* @__PURE__ */ new Map(), this._model.textEditorModel.getVersionId());
      this.triggerDiff();
    }));
    this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));
    this._register(autorun((reader) => {
      for (const session of this._chatEditingService.editingSessionsObs.read(reader)) {
        reader.store.add(autorun((r) => {
          for (const entry of session.entries.read(r)) {
            entry.state.read(r);
          }
          this.triggerDiff();
        }));
      }
    }));
    this.triggerDiff();
  }
  get originalTextModels() {
    return Iterable.map(this._originalEditorModels.values(), (editorModel) => editorModel.textEditorModel);
  }
  get allChanges() {
    return this._allChanges;
  }
  get changes() {
    return this._changes;
  }
  /**
   * The version id of the modified text model that {@link changes} were
   * computed against. Matches {@link ITextModel.getVersionId}.
   */
  get changesVersionId() {
    return this._changesVersionId;
  }
  get quickDiffChanges() {
    return this._quickDiffChanges;
  }
  get quickDiffs() {
    return this._quickDiffs;
  }
  getQuickDiffResults() {
    return this._quickDiffs.map((quickDiff) => {
      const changes = this.allChanges.filter((change) => change.providerId === quickDiff.id);
      return {
        providerId: quickDiff.id,
        providerKind: quickDiff.kind,
        original: quickDiff.originalResource,
        modified: this._model.resource,
        changes: changes.map((change) => change.change),
        changes2: changes.map((change) => change.change2)
      };
    });
  }
  getDiffEditorModel(originalUri) {
    const editorModel = this._originalEditorModels.get(originalUri);
    return editorModel ? {
      modified: this._model.textEditorModel,
      original: editorModel.textEditorModel
    } : void 0;
  }
  onDidAddRepository(repository) {
    const disposables = new DisposableStore();
    disposables.add(repository.provider.onDidChangeResources(this.triggerDiff, this));
    const onDidRemoveRepository = Event.filter(this.scmService.onDidRemoveRepository, (r) => r === repository);
    disposables.add(onDidRemoveRepository(() => this._repositoryDisposables.deleteAndDispose(repository)));
    this._repositoryDisposables.set(repository, disposables);
    this.triggerDiff();
  }
  triggerDiff() {
    if (!this._diffDelayer) {
      return;
    }
    this._diffDelayer.trigger(async () => {
      const result = await this.diff();
      const editorModels = Array.from(this._originalEditorModels.values());
      if (!result || this._disposed || this._model.isDisposed() || editorModels.some((editorModel) => editorModel.isDisposed())) {
        return;
      }
      this.setChanges(result.allChanges, result.changes, result.mapChanges, result.versionId);
    }).catch((err) => onUnexpectedError(err));
  }
  setChanges(allChanges, changes, mapChanges, versionId) {
    const diff = sortedDiff(this.changes, changes, (a, b) => compareChanges(a.change, b.change));
    this._allChanges = allChanges;
    this._changes = changes;
    this._quickDiffChanges = mapChanges;
    this._changesVersionId = versionId;
    this._onDidChange.fire({ changes, diff });
  }
  diff() {
    const location = this.environmentService.isSessionsWindow ? ProgressLocation.Window : ProgressLocation.Scm;
    return this.progressService.withProgress({ location, delay: 250 }, async () => {
      if (this._disposed || this._model.isDisposed()) {
        return null;
      }
      const versionId = this._model.textEditorModel.getVersionId();
      const originalURIs = await this.getQuickDiffsPromise();
      if (this._disposed || this._model.isDisposed() || originalURIs.length === 0) {
        return Promise.resolve({ allChanges: [], changes: [], mapChanges: /* @__PURE__ */ new Map(), versionId });
      }
      const quickDiffs = originalURIs.filter((quickDiff) => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
      if (quickDiffs.length === 0) {
        return Promise.resolve({ allChanges: [], changes: [], mapChanges: /* @__PURE__ */ new Map(), versionId });
      }
      const quickDiffPrimary = quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
      const ignoreTrimWhitespaceSetting = this.configurationService.getValue("scm.diffDecorationsIgnoreTrimWhitespace");
      const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === "inherit" ? this.configurationService.getValue("diffEditor.ignoreTrimWhitespace") : ignoreTrimWhitespaceSetting !== "false";
      const diffs = [];
      const secondaryDiffs = [];
      for (const quickDiff of quickDiffs) {
        const diff = await this._diff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
        if (diff.changes && diff.changes2 && diff.changes.length === diff.changes2.length) {
          for (let index = 0; index < diff.changes.length; index++) {
            const change2 = diff.changes2[index];
            if (quickDiffPrimary && quickDiff.kind === "secondary") {
              const primaryQuickDiffChange = diffs.find((d) => d.change2.modified.equals(change2.modified) && d.change2.original.length === change2.original.length);
              if (primaryQuickDiffChange) {
                const primaryModel = this._originalEditorModels.get(quickDiffPrimary.originalResource)?.textEditorModel;
                const primaryContent = primaryModel?.getValueInRange(primaryQuickDiffChange.change2.toRangeMapping().originalRange);
                const secondaryModel = this._originalEditorModels.get(quickDiff.originalResource)?.textEditorModel;
                const secondaryContent = secondaryModel?.getValueInRange(change2.toRangeMapping().originalRange);
                if (primaryContent === secondaryContent) {
                  secondaryDiffs.push({
                    providerId: quickDiff.id,
                    original: quickDiff.originalResource,
                    modified: this._model.resource,
                    change: diff.changes[index],
                    change2: diff.changes2[index]
                  });
                  continue;
                }
              }
            }
            diffs.push({
              providerId: quickDiff.id,
              original: quickDiff.originalResource,
              modified: this._model.resource,
              change: diff.changes[index],
              change2: diff.changes2[index]
            });
          }
        }
      }
      const diffsSorted = diffs.sort((a, b) => compareChanges(a.change, b.change));
      const allDiffsSorted = [...diffs, ...secondaryDiffs].sort((a, b) => compareChanges(a.change, b.change));
      const map = /* @__PURE__ */ new Map();
      for (let i = 0; i < diffsSorted.length; i++) {
        const providerId = diffsSorted[i].providerId;
        if (!map.has(providerId)) {
          map.set(providerId, []);
        }
        map.get(providerId).push(i);
      }
      return { allChanges: allDiffsSorted, changes: diffsSorted, mapChanges: map, versionId };
    });
  }
  async _diff(original, modified, ignoreTrimWhitespace) {
    const maxComputationTimeMs = this.options.maxComputationTimeMs ?? Number.MAX_SAFE_INTEGER;
    const result = await this.editorWorkerService.computeDiff(original, modified, {
      computeMoves: false,
      ignoreTrimWhitespace,
      maxComputationTimeMs
    }, this.options.algorithm);
    return { changes: result ? toLineChanges(DiffState.fromDiffResult(result)) : null, changes2: result?.changes ?? null };
  }
  getQuickDiffsPromise() {
    if (this._quickDiffsPromise) {
      return this._quickDiffsPromise;
    }
    this._quickDiffsPromise = this.getOriginalResource().then(async (quickDiffs) => {
      if (this._disposed) {
        return [];
      }
      if (quickDiffs.length === 0) {
        this._quickDiffs = [];
        this._originalEditorModels.clear();
        return [];
      }
      if (equals(this._quickDiffs, quickDiffs, (a, b) => a.id === b.id && a.originalResource.toString() === b.originalResource.toString() && this.quickDiffService.isQuickDiffProviderVisible(a.id) === this.quickDiffService.isQuickDiffProviderVisible(b.id))) {
        return quickDiffs;
      }
      this._quickDiffs = quickDiffs;
      this._originalEditorModels.clear();
      this._originalEditorModelsDisposables.clear();
      return (await Promise.all(quickDiffs.map(async (quickDiff) => {
        try {
          const ref = await this.textModelResolverService.createModelReference(quickDiff.originalResource);
          if (this._disposed) {
            ref.dispose();
            return [];
          }
          this._originalEditorModels.set(quickDiff.originalResource, ref.object);
          if (isTextFileEditorModel(ref.object) && !ref.object.isDirty()) {
            const encoding = this._model.getEncoding();
            if (encoding) {
              ref.object.setEncoding(encoding, EncodingMode.Decode);
            }
          }
          this._originalEditorModelsDisposables.add(ref);
          this._originalEditorModelsDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
          return quickDiff;
        } catch (error) {
          return [];
        }
      }))).flat();
    });
    return this._quickDiffsPromise.finally(() => {
      this._quickDiffsPromise = void 0;
    });
  }
  async getOriginalResource() {
    if (this._disposed) {
      return Promise.resolve([]);
    }
    const uri = this._model.resource;
    const isBeingModifiedByChatEdits = this._chatEditingService.editingSessionsObs.get().some((session) => session.getEntry(uri)?.state.get() === ModifiedFileEntryState.Modified);
    if (isBeingModifiedByChatEdits) {
      return Promise.resolve([]);
    }
    const isSynchronized = this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : void 0;
    return this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), isSynchronized);
  }
  findNextClosestChange(lineNumber, inclusive = true, providerId) {
    const visibleQuickDiffIds = new Set(this.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)).map((quickDiff) => quickDiff.id));
    for (let i = 0; i < this.changes.length; i++) {
      if (providerId && this.changes[i].providerId !== providerId) {
        continue;
      }
      if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
        continue;
      }
      const change = this.changes[i].change;
      if (inclusive) {
        if (getModifiedEndLineNumber(change) >= lineNumber) {
          return i;
        }
      } else {
        if (change.modifiedStartLineNumber > lineNumber) {
          return i;
        }
      }
    }
    return 0;
  }
  findPreviousClosestChange(lineNumber, inclusive = true, providerId) {
    const visibleQuickDiffIds = new Set(this.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)).map((quickDiff) => quickDiff.id));
    for (let i = this.changes.length - 1; i >= 0; i--) {
      if (providerId && this.changes[i].providerId !== providerId) {
        continue;
      }
      if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
        continue;
      }
      const change = this.changes[i].change;
      if (inclusive) {
        if (change.modifiedStartLineNumber <= lineNumber) {
          return i;
        }
      } else {
        if (getModifiedEndLineNumber(change) < lineNumber) {
          return i;
        }
      }
    }
    return this.changes.length - 1;
  }
  dispose() {
    this._disposed = true;
    this._quickDiffs = [];
    this._diffDelayer.cancel();
    this._originalEditorModels.clear();
    this._repositoryDisposables.dispose();
    super.dispose();
  }
};
QuickDiffModel = __decorateClass([
  __decorateParam(2, ISCMService),
  __decorateParam(3, IQuickDiffService),
  __decorateParam(4, IEditorWorkerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IChatEditingService),
  __decorateParam(8, IProgressService),
  __decorateParam(9, IWorkbenchEnvironmentService)
], QuickDiffModel);
export {
  IQuickDiffModelService,
  QuickDiffModel,
  QuickDiffModelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3NlclxccXVpY2tEaWZmTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW5jb2RpbmdNb2RlLCBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsLCBpc1RleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UsIFJlZmVyZW5jZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGlmZkFsZ29yaXRobU5hbWUsIElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgc2hvdWxkU3luY2hyb25pemVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgY29tcGFyZUNoYW5nZXMsIGdldE1vZGlmaWVkRW5kTGluZU51bWJlciwgSVF1aWNrRGlmZlNlcnZpY2UsIFF1aWNrRGlmZiwgUXVpY2tEaWZmQ2hhbmdlLCBRdWlja0RpZmZSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vcXVpY2tEaWZmLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU0NNUmVwb3NpdG9yeSwgSVNDTVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IHNvcnRlZERpZmYsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElTcGxpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBEaWZmU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yVmlld01vZGVsLmpzJztcbmltcG9ydCB7IHRvTGluZUNoYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgSVF1aWNrRGlmZk1vZGVsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlPignSVF1aWNrRGlmZk1vZGVsU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFF1aWNrRGlmZk1vZGVsT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWU7XG5cdHJlYWRvbmx5IG1heENvbXB1dGF0aW9uVGltZU1zPzogbnVtYmVyO1xufVxuXG5jb25zdCBkZWNvcmF0b3JRdWlja0RpZmZNb2RlbE9wdGlvbnM6IFF1aWNrRGlmZk1vZGVsT3B0aW9ucyA9IHtcblx0YWxnb3JpdGhtOiAnYWR2YW5jZWQnLFxuXHRtYXhDb21wdXRhdGlvblRpbWVNczogMTAwMFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZSBlZGl0b3IgbW9kZWwgaXMgbm90IHJlc29sdmVkLlxuXHQgKiBNb2RlbCByZWZyZW5jZSBoYXMgdG8gYmUgZGlzcG9zZWQgb25jZSBub3QgbmVlZGVkIGFueW1vcmUuXG5cdCAqIEBwYXJhbSByZXNvdXJjZVxuXHQgKiBAcGFyYW0gb3B0aW9uc1xuXHQgKi9cblx0Y3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IFF1aWNrRGlmZk1vZGVsT3B0aW9ucyk6IElSZWZlcmVuY2U8UXVpY2tEaWZmTW9kZWw+IHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBRdWlja0RpZmZNb2RlbFJlZmVyZW5jZUNvbGxlY3Rpb24gZXh0ZW5kcyBSZWZlcmVuY2VDb2xsZWN0aW9uPFF1aWNrRGlmZk1vZGVsPiB7XG5cdGNvbnN0cnVjdG9yKEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlUmVmZXJlbmNlZE9iamVjdChfa2V5OiBzdHJpbmcsIHRleHRGaWxlTW9kZWw6IElSZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwsIG9wdGlvbnM6IFF1aWNrRGlmZk1vZGVsT3B0aW9ucyk6IFF1aWNrRGlmZk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tEaWZmTW9kZWwsIHRleHRGaWxlTW9kZWwsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRlc3Ryb3lSZWZlcmVuY2VkT2JqZWN0KF9rZXk6IHN0cmluZywgb2JqZWN0OiBRdWlja0RpZmZNb2RlbCk6IHZvaWQge1xuXHRcdG9iamVjdC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrRGlmZk1vZGVsU2VydmljZSBpbXBsZW1lbnRzIElRdWlja0RpZmZNb2RlbFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVmZXJlbmNlczogUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2VDb2xsZWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3JlZmVyZW5jZXMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlQ29sbGVjdGlvbik7XG5cdH1cblxuXHRjcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBRdWlja0RpZmZNb2RlbE9wdGlvbnMgPSBkZWNvcmF0b3JRdWlja0RpZmZNb2RlbE9wdGlvbnMpOiBJUmVmZXJlbmNlPFF1aWNrRGlmZk1vZGVsPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGV4dEZpbGVNb2RlbCA9IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCF0ZXh0RmlsZU1vZGVsPy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmVzb3VyY2UgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShyZXNvdXJjZSkud2l0aCh7IHF1ZXJ5OiBKU09OLnN0cmluZ2lmeShvcHRpb25zKSB9KTtcblx0XHRyZXR1cm4gdGhpcy5fcmVmZXJlbmNlcy5hY3F1aXJlKHJlc291cmNlLnRvU3RyaW5nKCksIHRleHRGaWxlTW9kZWwsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0RpZmZNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEVkaXRvck1vZGVscyA9IG5ldyBSZXNvdXJjZU1hcDxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsRWRpdG9yTW9kZWxzRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRnZXQgb3JpZ2luYWxUZXh0TW9kZWxzKCk6IEl0ZXJhYmxlPElUZXh0TW9kZWw+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLnZhbHVlcygpLCBlZGl0b3JNb2RlbCA9PiBlZGl0b3JNb2RlbC50ZXh0RWRpdG9yTW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcXVpY2tEaWZmczogUXVpY2tEaWZmW10gPSBbXTtcblx0cHJpdmF0ZSBfcXVpY2tEaWZmc1Byb21pc2U/OiBQcm9taXNlPFF1aWNrRGlmZltdPjtcblx0cHJpdmF0ZSBfZGlmZkRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPigyMDApKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IGRpZmY6IElTcGxpY2U8UXVpY2tEaWZmQ2hhbmdlPltdIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8eyBjaGFuZ2VzOiBRdWlja0RpZmZDaGFuZ2VbXTsgZGlmZjogSVNwbGljZTxRdWlja0RpZmZDaGFuZ2U+W10gfT4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9hbGxDaGFuZ2VzOiBRdWlja0RpZmZDaGFuZ2VbXSA9IFtdO1xuXHRnZXQgYWxsQ2hhbmdlcygpOiBRdWlja0RpZmZDaGFuZ2VbXSB7IHJldHVybiB0aGlzLl9hbGxDaGFuZ2VzOyB9XG5cblx0cHJpdmF0ZSBfY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW10gPSBbXTtcblx0Z2V0IGNoYW5nZXMoKTogUXVpY2tEaWZmQ2hhbmdlW10geyByZXR1cm4gdGhpcy5fY2hhbmdlczsgfVxuXG5cdHByaXZhdGUgX2NoYW5nZXNWZXJzaW9uSWQ6IG51bWJlciA9IDA7XG5cdC8qKlxuXHQgKiBUaGUgdmVyc2lvbiBpZCBvZiB0aGUgbW9kaWZpZWQgdGV4dCBtb2RlbCB0aGF0IHtAbGluayBjaGFuZ2VzfSB3ZXJlXG5cdCAqIGNvbXB1dGVkIGFnYWluc3QuIE1hdGNoZXMge0BsaW5rIElUZXh0TW9kZWwuZ2V0VmVyc2lvbklkfS5cblx0ICovXG5cdGdldCBjaGFuZ2VzVmVyc2lvbklkKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9jaGFuZ2VzVmVyc2lvbklkOyB9XG5cblx0LyoqXG5cdCAqIE1hcCBvZiBxdWljayBkaWZmIG5hbWUgdG8gdGhlIGluZGV4IG9mIHRoZSBjaGFuZ2UgaW4gYHRoaXMuY2hhbmdlc2Bcblx0ICovXG5cdHByaXZhdGUgX3F1aWNrRGlmZkNoYW5nZXM6IE1hcDxzdHJpbmcsIG51bWJlcltdPiA9IG5ldyBNYXAoKTtcblx0Z2V0IHF1aWNrRGlmZkNoYW5nZXMoKTogTWFwPHN0cmluZywgbnVtYmVyW10+IHsgcmV0dXJuIHRoaXMuX3F1aWNrRGlmZkNoYW5nZXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3J5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZU1hcDxJU0NNUmVwb3NpdG9yeT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0ZXh0RmlsZU1vZGVsOiBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogUXVpY2tEaWZmTW9kZWxPcHRpb25zLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrRGlmZlNlcnZpY2U6IElRdWlja0RpZmZTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWwgPSB0ZXh0RmlsZU1vZGVsO1xuXHRcdHRoaXMuX2NoYW5nZXNWZXJzaW9uSWQgPSB0ZXh0RmlsZU1vZGVsLnRleHRFZGl0b3JNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRGaWxlTW9kZWwudGV4dEVkaXRvck1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLnRyaWdnZXJEaWZmKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmRpZmZEZWNvcmF0aW9uc0lnbm9yZVRyaW1XaGl0ZXNwYWNlJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGlmZkVkaXRvci5pZ25vcmVUcmltV2hpdGVzcGFjZScpXG5cdFx0XHQpKHRoaXMudHJpZ2dlckRpZmYsIHRoaXMpXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihzY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeSh0aGlzLm9uRGlkQWRkUmVwb3NpdG9yeSwgdGhpcykpO1xuXHRcdGZvciAoY29uc3QgciBvZiBzY21TZXJ2aWNlLnJlcG9zaXRvcmllcykge1xuXHRcdFx0dGhpcy5vbkRpZEFkZFJlcG9zaXRvcnkocik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VFbmNvZGluZygoKSA9PiB7XG5cdFx0XHR0aGlzLl9kaWZmRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3F1aWNrRGlmZnMgPSBbXTtcblx0XHRcdHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9xdWlja0RpZmZzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2V0Q2hhbmdlcyhbXSwgW10sIG5ldyBNYXAoKSwgdGhpcy5fbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZlcnNpb25JZCgpKTtcblx0XHRcdHRoaXMudHJpZ2dlckRpZmYoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnF1aWNrRGlmZlNlcnZpY2Uub25EaWRDaGFuZ2VRdWlja0RpZmZQcm92aWRlcnMoKCkgPT4gdGhpcy50cmlnZ2VyRGlmZigpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygc2Vzc2lvbi5lbnRyaWVzLnJlYWQocikpIHtcblx0XHRcdFx0XHRcdGVudHJ5LnN0YXRlLnJlYWQocik7IC8vIHNpZ25hbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnRyaWdnZXJEaWZmKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRyaWdnZXJEaWZmKCk7XG5cdH1cblxuXHRnZXQgcXVpY2tEaWZmcygpOiByZWFkb25seSBRdWlja0RpZmZbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrRGlmZnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UXVpY2tEaWZmUmVzdWx0cygpOiBRdWlja0RpZmZSZXN1bHRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrRGlmZnMubWFwKHF1aWNrRGlmZiA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5hbGxDaGFuZ2VzXG5cdFx0XHRcdC5maWx0ZXIoY2hhbmdlID0+IGNoYW5nZS5wcm92aWRlcklkID09PSBxdWlja0RpZmYuaWQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcm92aWRlcklkOiBxdWlja0RpZmYuaWQsXG5cdFx0XHRcdHByb3ZpZGVyS2luZDogcXVpY2tEaWZmLmtpbmQsXG5cdFx0XHRcdG9yaWdpbmFsOiBxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0bW9kaWZpZWQ6IHRoaXMuX21vZGVsLnJlc291cmNlLFxuXHRcdFx0XHRjaGFuZ2VzOiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLmNoYW5nZSksXG5cdFx0XHRcdGNoYW5nZXMyOiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLmNoYW5nZTIpXG5cdFx0XHR9IHNhdGlzZmllcyBRdWlja0RpZmZSZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGlmZkVkaXRvck1vZGVsKG9yaWdpbmFsVXJpOiBVUkkpOiBJRGlmZkVkaXRvck1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmdldChvcmlnaW5hbFVyaSk7XG5cdFx0cmV0dXJuIGVkaXRvck1vZGVsID9cblx0XHRcdHtcblx0XHRcdFx0bW9kaWZpZWQ6IHRoaXMuX21vZGVsLnRleHRFZGl0b3JNb2RlbCxcblx0XHRcdFx0b3JpZ2luYWw6IGVkaXRvck1vZGVsLnRleHRFZGl0b3JNb2RlbFxuXHRcdFx0fSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRBZGRSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVwb3NpdG9yeS5wcm92aWRlci5vbkRpZENoYW5nZVJlc291cmNlcyh0aGlzLnRyaWdnZXJEaWZmLCB0aGlzKSk7XG5cblx0XHRjb25zdCBvbkRpZFJlbW92ZVJlcG9zaXRvcnkgPSBFdmVudC5maWx0ZXIodGhpcy5zY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSwgciA9PiByID09PSByZXBvc2l0b3J5KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25EaWRSZW1vdmVSZXBvc2l0b3J5KCgpID0+IHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHJlcG9zaXRvcnkpKSk7XG5cblx0XHR0aGlzLl9yZXBvc2l0b3J5RGlzcG9zYWJsZXMuc2V0KHJlcG9zaXRvcnksIGRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMudHJpZ2dlckRpZmYoKTtcblx0fVxuXG5cdHByaXZhdGUgdHJpZ2dlckRpZmYoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kaWZmRGVsYXllcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RpZmZEZWxheWVyXG5cdFx0XHQudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogeyBhbGxDaGFuZ2VzOiBRdWlja0RpZmZDaGFuZ2VbXTsgY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IG1hcENoYW5nZXM6IE1hcDxzdHJpbmcsIG51bWJlcltdPjsgdmVyc2lvbklkOiBudW1iZXIgfSB8IG51bGwgPSBhd2FpdCB0aGlzLmRpZmYoKTtcblxuXHRcdFx0XHRjb25zdCBlZGl0b3JNb2RlbHMgPSBBcnJheS5mcm9tKHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLnZhbHVlcygpKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQgfHwgdGhpcy5fZGlzcG9zZWQgfHwgdGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpIHx8IGVkaXRvck1vZGVscy5zb21lKGVkaXRvck1vZGVsID0+IGVkaXRvck1vZGVsLmlzRGlzcG9zZWQoKSkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGRpc3Bvc2VkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnNldENoYW5nZXMocmVzdWx0LmFsbENoYW5nZXMsIHJlc3VsdC5jaGFuZ2VzLCByZXN1bHQubWFwQ2hhbmdlcywgcmVzdWx0LnZlcnNpb25JZCk7XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGVyciA9PiBvblVuZXhwZWN0ZWRFcnJvcihlcnIpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q2hhbmdlcyhhbGxDaGFuZ2VzOiBRdWlja0RpZmZDaGFuZ2VbXSwgY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW10sIG1hcENoYW5nZXM6IE1hcDxzdHJpbmcsIG51bWJlcltdPiwgdmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmID0gc29ydGVkRGlmZih0aGlzLmNoYW5nZXMsIGNoYW5nZXMsIChhLCBiKSA9PiBjb21wYXJlQ2hhbmdlcyhhLmNoYW5nZSwgYi5jaGFuZ2UpKTtcblx0XHR0aGlzLl9hbGxDaGFuZ2VzID0gYWxsQ2hhbmdlcztcblx0XHR0aGlzLl9jaGFuZ2VzID0gY2hhbmdlcztcblx0XHR0aGlzLl9xdWlja0RpZmZDaGFuZ2VzID0gbWFwQ2hhbmdlcztcblx0XHR0aGlzLl9jaGFuZ2VzVmVyc2lvbklkID0gdmVyc2lvbklkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBjaGFuZ2VzLCBkaWZmIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkaWZmKCk6IFByb21pc2U8eyBhbGxDaGFuZ2VzOiBRdWlja0RpZmZDaGFuZ2VbXTsgY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IG1hcENoYW5nZXM6IE1hcDxzdHJpbmcsIG51bWJlcltdPjsgdmVyc2lvbklkOiBudW1iZXIgfSB8IG51bGw+IHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cgPyBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyA6IFByb2dyZXNzTG9jYXRpb24uU2NtO1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbiwgZGVsYXk6IDI1MCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQgfHwgdGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2ZXJzaW9uSWQgPSB0aGlzLl9tb2RlbC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVSSXMgPSBhd2FpdCB0aGlzLmdldFF1aWNrRGlmZnNQcm9taXNlKCk7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQgfHwgdGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpIHx8IChvcmlnaW5hbFVSSXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0XHQvLyBEaXNwb3NlZFxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgYWxsQ2hhbmdlczogW10sIGNoYW5nZXM6IFtdLCBtYXBDaGFuZ2VzOiBuZXcgTWFwKCksIHZlcnNpb25JZCB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVpY2tEaWZmcyA9IG9yaWdpbmFsVVJJc1xuXHRcdFx0XHQuZmlsdGVyKHF1aWNrRGlmZiA9PiB0aGlzLmVkaXRvcldvcmtlclNlcnZpY2UuY2FuQ29tcHV0ZURpcnR5RGlmZihxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSwgdGhpcy5fbW9kZWwucmVzb3VyY2UpKTtcblx0XHRcdGlmIChxdWlja0RpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBBbGwgZmlsZXMgYXJlIHRvbyBsYXJnZVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgYWxsQ2hhbmdlczogW10sIGNoYW5nZXM6IFtdLCBtYXBDaGFuZ2VzOiBuZXcgTWFwKCksIHZlcnNpb25JZCB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVpY2tEaWZmUHJpbWFyeSA9IHF1aWNrRGlmZnMuZmluZChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmtpbmQgPT09ICdwcmltYXJ5Jyk7XG5cblx0XHRcdGNvbnN0IGlnbm9yZVRyaW1XaGl0ZXNwYWNlU2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3RydWUnIHwgJ2ZhbHNlJyB8ICdpbmhlcml0Jz4oJ3NjbS5kaWZmRGVjb3JhdGlvbnNJZ25vcmVUcmltV2hpdGVzcGFjZScpO1xuXHRcdFx0Y29uc3QgaWdub3JlVHJpbVdoaXRlc3BhY2UgPSBpZ25vcmVUcmltV2hpdGVzcGFjZVNldHRpbmcgPT09ICdpbmhlcml0J1xuXHRcdFx0XHQ/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2RpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2UnKVxuXHRcdFx0XHQ6IGlnbm9yZVRyaW1XaGl0ZXNwYWNlU2V0dGluZyAhPT0gJ2ZhbHNlJztcblxuXHRcdFx0Y29uc3QgZGlmZnM6IFF1aWNrRGlmZkNoYW5nZVtdID0gW107XG5cdFx0XHRjb25zdCBzZWNvbmRhcnlEaWZmczogUXVpY2tEaWZmQ2hhbmdlW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBxdWlja0RpZmYgb2YgcXVpY2tEaWZmcykge1xuXHRcdFx0XHRjb25zdCBkaWZmID0gYXdhaXQgdGhpcy5fZGlmZihxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSwgdGhpcy5fbW9kZWwucmVzb3VyY2UsIGlnbm9yZVRyaW1XaGl0ZXNwYWNlKTtcblx0XHRcdFx0aWYgKGRpZmYuY2hhbmdlcyAmJiBkaWZmLmNoYW5nZXMyICYmIGRpZmYuY2hhbmdlcy5sZW5ndGggPT09IGRpZmYuY2hhbmdlczIubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRpZmYuY2hhbmdlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYW5nZTIgPSBkaWZmLmNoYW5nZXMyW2luZGV4XTtcblxuXHRcdFx0XHRcdFx0Ly8gVGhlIHNlY29uZGFyeSBkaWZmcyBhcmUgY29tcGxpbWVudGFyeSB0byB0aGUgcHJpbWFyeSBkaWZmcywgYW5kXG5cdFx0XHRcdFx0XHQvLyB0aGV5IGNhbiBvdmVybGFwLiBXZSBuZWVkIHRvIHJlbW92ZSB0aGUgc2Vjb25kYXJ5IHF1aWNrIGRpZmZzIHRoYXRcblx0XHRcdFx0XHRcdC8vIG92ZXJsYXAgZm9yIHRoZSBVSSwgYnV0IHdlIG5lZWQgdG8gZXhwb3NlIGFsbCBkaWZmcyB0aHJvdWdoIHRoZSBBUEkuXG5cdFx0XHRcdFx0XHRpZiAocXVpY2tEaWZmUHJpbWFyeSAmJiBxdWlja0RpZmYua2luZCA9PT0gJ3NlY29uZGFyeScpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQ2hlY2sgd2hldGhlciB0aGU6XG5cdFx0XHRcdFx0XHRcdC8vIDEuIHRoZSBtb2RpZmllZCBsaW5lIHJhbmdlIGlzIGVxdWFsXG5cdFx0XHRcdFx0XHRcdC8vIDIuIHRoZSBvcmlnaW5hbCBsaW5lIHJhbmdlIGxlbmd0aCBpcyBlcXVhbFxuXHRcdFx0XHRcdFx0XHRjb25zdCBwcmltYXJ5UXVpY2tEaWZmQ2hhbmdlID0gZGlmZnNcblx0XHRcdFx0XHRcdFx0XHQuZmluZChkID0+IGQuY2hhbmdlMi5tb2RpZmllZC5lcXVhbHMoY2hhbmdlMi5tb2RpZmllZCkgJiZcblx0XHRcdFx0XHRcdFx0XHRcdGQuY2hhbmdlMi5vcmlnaW5hbC5sZW5ndGggPT09IGNoYW5nZTIub3JpZ2luYWwubGVuZ3RoKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAocHJpbWFyeVF1aWNrRGlmZkNoYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlIG9yaWdpbmFsIGNvbnRlbnQgbWF0Y2hlc1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHByaW1hcnlNb2RlbCA9IHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmdldChxdWlja0RpZmZQcmltYXJ5Lm9yaWdpbmFsUmVzb3VyY2UpPy50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcHJpbWFyeUNvbnRlbnQgPSBwcmltYXJ5TW9kZWw/LmdldFZhbHVlSW5SYW5nZShwcmltYXJ5UXVpY2tEaWZmQ2hhbmdlLmNoYW5nZTIudG9SYW5nZU1hcHBpbmcoKS5vcmlnaW5hbFJhbmdlKTtcblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNlY29uZGFyeU1vZGVsID0gdGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHMuZ2V0KHF1aWNrRGlmZi5vcmlnaW5hbFJlc291cmNlKT8udGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNlY29uZGFyeUNvbnRlbnQgPSBzZWNvbmRhcnlNb2RlbD8uZ2V0VmFsdWVJblJhbmdlKGNoYW5nZTIudG9SYW5nZU1hcHBpbmcoKS5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocHJpbWFyeUNvbnRlbnQgPT09IHNlY29uZGFyeUNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHNlY29uZGFyeURpZmZzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRwcm92aWRlcklkOiBxdWlja0RpZmYuaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsOiBxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHRoaXMuX21vZGVsLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGFuZ2U6IGRpZmYuY2hhbmdlc1tpbmRleF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoYW5nZTI6IGRpZmYuY2hhbmdlczJbaW5kZXhdXG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGRpZmZzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRwcm92aWRlcklkOiBxdWlja0RpZmYuaWQsXG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsOiBxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHRoaXMuX21vZGVsLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRjaGFuZ2U6IGRpZmYuY2hhbmdlc1tpbmRleF0sXG5cdFx0XHRcdFx0XHRcdGNoYW5nZTI6IGRpZmYuY2hhbmdlczJbaW5kZXhdXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGlmZnNTb3J0ZWQgPSBkaWZmcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQ2hhbmdlcyhhLmNoYW5nZSwgYi5jaGFuZ2UpKTtcblx0XHRcdGNvbnN0IGFsbERpZmZzU29ydGVkID0gWy4uLmRpZmZzLCAuLi5zZWNvbmRhcnlEaWZmc10uc29ydCgoYSwgYikgPT4gY29tcGFyZUNoYW5nZXMoYS5jaGFuZ2UsIGIuY2hhbmdlKSk7XG5cblx0XHRcdGNvbnN0IG1hcDogTWFwPHN0cmluZywgbnVtYmVyW10+ID0gbmV3IE1hcCgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkaWZmc1NvcnRlZC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlcklkID0gZGlmZnNTb3J0ZWRbaV0ucHJvdmlkZXJJZDtcblx0XHRcdFx0aWYgKCFtYXAuaGFzKHByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdFx0bWFwLnNldChwcm92aWRlcklkLCBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFwLmdldChwcm92aWRlcklkKSEucHVzaChpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgYWxsQ2hhbmdlczogYWxsRGlmZnNTb3J0ZWQsIGNoYW5nZXM6IGRpZmZzU29ydGVkLCBtYXBDaGFuZ2VzOiBtYXAsIHZlcnNpb25JZCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlmZihvcmlnaW5hbDogVVJJLCBtb2RpZmllZDogVVJJLCBpZ25vcmVUcmltV2hpdGVzcGFjZTogYm9vbGVhbik6IFByb21pc2U8eyBjaGFuZ2VzOiByZWFkb25seSBJQ2hhbmdlW10gfCBudWxsOyBjaGFuZ2VzMjogcmVhZG9ubHkgTGluZVJhbmdlTWFwcGluZ1tdIHwgbnVsbCB9PiB7XG5cdFx0Y29uc3QgbWF4Q29tcHV0YXRpb25UaW1lTXMgPSB0aGlzLm9wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lTXMgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZURpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCB7XG5cdFx0XHRjb21wdXRlTW92ZXM6IGZhbHNlLCBpZ25vcmVUcmltV2hpdGVzcGFjZSwgbWF4Q29tcHV0YXRpb25UaW1lTXNcblx0XHR9LCB0aGlzLm9wdGlvbnMuYWxnb3JpdGhtKTtcblxuXHRcdHJldHVybiB7IGNoYW5nZXM6IHJlc3VsdCA/IHRvTGluZUNoYW5nZXMoRGlmZlN0YXRlLmZyb21EaWZmUmVzdWx0KHJlc3VsdCkpIDogbnVsbCwgY2hhbmdlczI6IHJlc3VsdD8uY2hhbmdlcyA/PyBudWxsIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFF1aWNrRGlmZnNQcm9taXNlKCk6IFByb21pc2U8UXVpY2tEaWZmW10+IHtcblx0XHRpZiAodGhpcy5fcXVpY2tEaWZmc1Byb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9xdWlja0RpZmZzUHJvbWlzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9xdWlja0RpZmZzUHJvbWlzZSA9IHRoaXMuZ2V0T3JpZ2luYWxSZXNvdXJjZSgpLnRoZW4oYXN5bmMgKHF1aWNrRGlmZnMpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkgeyAvLyBkaXNwb3NlZFxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmIChxdWlja0RpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9xdWlja0RpZmZzID0gW107XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVxdWFscyh0aGlzLl9xdWlja0RpZmZzLCBxdWlja0RpZmZzLCAoYSwgYikgPT5cblx0XHRcdFx0YS5pZCA9PT0gYi5pZCAmJlxuXHRcdFx0XHRhLm9yaWdpbmFsUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYi5vcmlnaW5hbFJlc291cmNlLnRvU3RyaW5nKCkgJiZcblx0XHRcdFx0dGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKGEuaWQpID09PSB0aGlzLnF1aWNrRGlmZlNlcnZpY2UuaXNRdWlja0RpZmZQcm92aWRlclZpc2libGUoYi5pZCkpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHF1aWNrRGlmZnM7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3F1aWNrRGlmZnMgPSBxdWlja0RpZmZzO1xuXG5cdFx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbChxdWlja0RpZmZzLm1hcChhc3luYyAocXVpY2tEaWZmKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkgeyAvLyBkaXNwb3NlZFxuXHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5zZXQocXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsIHJlZi5vYmplY3QpO1xuXG5cdFx0XHRcdFx0aWYgKGlzVGV4dEZpbGVFZGl0b3JNb2RlbChyZWYub2JqZWN0KSAmJiAhcmVmLm9iamVjdC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVuY29kaW5nID0gdGhpcy5fbW9kZWwuZ2V0RW5jb2RpbmcoKTtcblxuXHRcdFx0XHRcdFx0aWYgKGVuY29kaW5nKSB7XG5cdFx0XHRcdFx0XHRcdChyZWYub2JqZWN0IGFzIElUZXh0RmlsZUVkaXRvck1vZGVsKS5zZXRFbmNvZGluZyhlbmNvZGluZywgRW5jb2RpbmdNb2RlLkRlY29kZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHNEaXNwb3NhYmxlcy5hZGQocmVmKTtcblx0XHRcdFx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVsc0Rpc3Bvc2FibGVzLmFkZChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy50cmlnZ2VyRGlmZigpKSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcXVpY2tEaWZmO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHJldHVybiBbXTsgLy8gcG9zc2libHkgaW52YWxpZCByZWZlcmVuY2Vcblx0XHRcdFx0fVxuXHRcdFx0fSkpKS5mbGF0KCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tEaWZmc1Byb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9xdWlja0RpZmZzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0T3JpZ2luYWxSZXNvdXJjZSgpOiBQcm9taXNlPFF1aWNrRGlmZltdPiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fbW9kZWwucmVzb3VyY2U7XG5cblx0XHQvLyBkaXNhYmxlIGRpcnR5IGRpZmYgd2hlbiBkb2luZyBjaGF0IGVkaXRzXG5cdFx0Y29uc3QgaXNCZWluZ01vZGlmaWVkQnlDaGF0RWRpdHMgPSB0aGlzLl9jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLmdldCgpXG5cdFx0XHQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uZ2V0RW50cnkodXJpKT8uc3RhdGUuZ2V0KCkgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXHRcdGlmIChpc0JlaW5nTW9kaWZpZWRCeUNoYXRFZGl0cykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNTeW5jaHJvbml6ZWQgPSB0aGlzLl9tb2RlbC50ZXh0RWRpdG9yTW9kZWwgPyBzaG91bGRTeW5jaHJvbml6ZU1vZGVsKHRoaXMuX21vZGVsLnRleHRFZGl0b3JNb2RlbCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMucXVpY2tEaWZmU2VydmljZS5nZXRRdWlja0RpZmZzKHVyaSwgdGhpcy5fbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBpc1N5bmNocm9uaXplZCk7XG5cdH1cblxuXHRmaW5kTmV4dENsb3Nlc3RDaGFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBpbmNsdXNpdmUgPSB0cnVlLCBwcm92aWRlcklkPzogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCB2aXNpYmxlUXVpY2tEaWZmSWRzID0gbmV3IFNldCh0aGlzLnF1aWNrRGlmZnNcblx0XHRcdC5maWx0ZXIocXVpY2tEaWZmID0+IHRoaXMucXVpY2tEaWZmU2VydmljZS5pc1F1aWNrRGlmZlByb3ZpZGVyVmlzaWJsZShxdWlja0RpZmYuaWQpKVxuXHRcdFx0Lm1hcChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmlkKSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHByb3ZpZGVySWQgJiYgdGhpcy5jaGFuZ2VzW2ldLnByb3ZpZGVySWQgIT09IHByb3ZpZGVySWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgcXVpY2sgZGlmZnMgdGhhdCBhcmUgbm90IHZpc2libGVcblx0XHRcdGlmICghdmlzaWJsZVF1aWNrRGlmZklkcy5oYXModGhpcy5jaGFuZ2VzW2ldLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLmNoYW5nZXNbaV0uY2hhbmdlO1xuXG5cdFx0XHRpZiAoaW5jbHVzaXZlKSB7XG5cdFx0XHRcdGlmIChnZXRNb2RpZmllZEVuZExpbmVOdW1iZXIoY2hhbmdlKSA+PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGZpbmRQcmV2aW91c0Nsb3Nlc3RDaGFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBpbmNsdXNpdmUgPSB0cnVlLCBwcm92aWRlcklkPzogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCB2aXNpYmxlUXVpY2tEaWZmSWRzID0gbmV3IFNldCh0aGlzLnF1aWNrRGlmZnNcblx0XHRcdC5maWx0ZXIocXVpY2tEaWZmID0+IHRoaXMucXVpY2tEaWZmU2VydmljZS5pc1F1aWNrRGlmZlByb3ZpZGVyVmlzaWJsZShxdWlja0RpZmYuaWQpKVxuXHRcdFx0Lm1hcChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmlkKSk7XG5cblx0XHRmb3IgKGxldCBpID0gdGhpcy5jaGFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAocHJvdmlkZXJJZCAmJiB0aGlzLmNoYW5nZXNbaV0ucHJvdmlkZXJJZCAhPT0gcHJvdmlkZXJJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCBxdWljayBkaWZmcyB0aGF0IGFyZSBub3QgdmlzaWJsZVxuXHRcdFx0aWYgKCF2aXNpYmxlUXVpY2tEaWZmSWRzLmhhcyh0aGlzLmNoYW5nZXNbaV0ucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuY2hhbmdlc1tpXS5jaGFuZ2U7XG5cblx0XHRcdGlmIChpbmNsdXNpdmUpIHtcblx0XHRcdFx0aWYgKGNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciA8PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChnZXRNb2RpZmllZEVuZExpbmVOdW1iZXIoY2hhbmdlKSA8IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNoYW5nZXMubGVuZ3RoIC0gMTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5fcXVpY2tEaWZmcyA9IFtdO1xuXHRcdHRoaXMuX2RpZmZEZWxheWVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yeURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxjQUE0Qyx1QkFBNkMsd0JBQXdCO0FBQzFILFNBQVMsWUFBWSxlQUFlLGlCQUE2QiwyQkFBMkI7QUFDNUYsU0FBNEIsNEJBQTRCO0FBQ3hELFNBQVMsMkJBQTJCO0FBR3BDLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFxQiw4QkFBOEI7QUFDbkQsU0FBUyxnQkFBZ0IsMEJB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
