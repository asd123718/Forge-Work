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
import { localize } from "../../../../nls.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { TextFileEditorModel } from "./textFileEditorModel.js";
import { dispose, Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IFileService, FileOperation, FileChangeType } from "../../../../platform/files/common/files.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { TextFileSaveParticipant } from "./textFileSaveParticipant.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IWorkingCopyFileService } from "../../workingCopy/common/workingCopyFileService.js";
import { extname, joinPath } from "../../../../base/common/resources.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../editor/common/model/textModel.js";
import { PLAINTEXT_EXTENSION, PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
let TextFileEditorModelManager = class extends Disposable {
  constructor(instantiationService, fileService, notificationService, workingCopyFileService, uriIdentityService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this._onDidCreate = this._register(new Emitter({
      leakWarningThreshold: 500,
      leakWarningName: "TextFileEditorModelManager._onDidCreate"
      /* increased for users with hundreds of inputs opened */
    }));
    this.onDidCreate = this._onDidCreate.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidRemove = this._register(new Emitter());
    this.onDidRemove = this._onDidRemove.event;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this._onDidChangeOrphaned = this._register(new Emitter());
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this._onDidSaveError = this._register(new Emitter());
    this.onDidSaveError = this._onDidSaveError.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this._onDidRevert = this._register(new Emitter());
    this.onDidRevert = this._onDidRevert.event;
    this._onDidChangeEncoding = this._register(new Emitter());
    this.onDidChangeEncoding = this._onDidChangeEncoding.event;
    this.mapResourceToModel = new ResourceMap();
    this.mapResourceToModelListeners = new ResourceMap();
    this.mapResourceToDisposeListener = new ResourceMap();
    this.mapResourceToPendingModelResolvers = new ResourceMap();
    this.modelResolveQueue = this._register(new ResourceQueue());
    this.saveErrorHandler = (() => {
      const notificationService = this.notificationService;
      return {
        onSaveError(error, model) {
          notificationService.error(localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
        }
      };
    })();
    this.mapCorrelationIdToModelsToRestore = /* @__PURE__ */ new Map();
    this.saveParticipants = this._register(this.instantiationService.createInstance(TextFileSaveParticipant));
    this.registerListeners();
  }
  get models() {
    return [...this.mapResourceToModel.values()];
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onDidChangeFileSystemProviderCapabilities(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onDidChangeFileSystemProviderRegistrations(e)));
    this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => this.onWillRunWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation((e) => this.onDidFailWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this.onDidRunWorkingCopyFileOperation(e)));
  }
  onDidFilesChange(e) {
    for (const model of this.models) {
      if (model.isDirty()) {
        continue;
      }
      if (e.contains(model.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
        this.queueModelReload(model);
      }
    }
  }
  onDidChangeFileSystemProviderCapabilities(e) {
    this.queueModelReloads(e.scheme);
  }
  onDidChangeFileSystemProviderRegistrations(e) {
    if (!e.added) {
      return;
    }
    this.queueModelReloads(e.scheme);
  }
  queueModelReloads(scheme) {
    for (const model of this.models) {
      if (model.isDirty()) {
        continue;
      }
      if (scheme === model.resource.scheme) {
        this.queueModelReload(model);
      }
    }
  }
  queueModelReload(model) {
    const queueSize = this.modelResolveQueue.queueSize(model.resource);
    if (queueSize <= 1) {
      this.modelResolveQueue.queueFor(model.resource, async () => {
        try {
          await this.reload(model);
        } catch (error) {
          onUnexpectedError(error);
        }
      });
    }
  }
  onWillRunWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const modelsToRestore = [];
      for (const { source, target } of e.files) {
        if (source) {
          if (this.uriIdentityService.extUri.isEqual(source, target)) {
            continue;
          }
          const sourceModels = [];
          for (const model of this.models) {
            if (this.uriIdentityService.extUri.isEqualOrParent(model.resource, source)) {
              sourceModels.push(model);
            }
          }
          for (const sourceModel of sourceModels) {
            const sourceModelResource = sourceModel.resource;
            let targetModelResource;
            if (this.uriIdentityService.extUri.isEqual(sourceModelResource, source)) {
              targetModelResource = target;
            } else {
              targetModelResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
            }
            const languageId = sourceModel.getLanguageId();
            modelsToRestore.push({
              source: sourceModelResource,
              target: targetModelResource,
              language: languageId ? {
                id: languageId,
                explicit: sourceModel.languageChangeSource === "user"
              } : void 0,
              encoding: sourceModel.getEncoding(),
              snapshot: sourceModel.isDirty() ? sourceModel.createSnapshot() : void 0
            });
          }
        }
      }
      this.mapCorrelationIdToModelsToRestore.set(e.correlationId, modelsToRestore);
    }
  }
  onDidFailWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
      if (modelsToRestore) {
        this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
        modelsToRestore.forEach((model) => {
          if (model.snapshot) {
            this.get(model.source)?.setDirty(true);
          }
        });
      }
    }
  }
  onDidRunWorkingCopyFileOperation(e) {
    switch (e.operation) {
      // Create: Revert existing models
      case FileOperation.CREATE:
        e.waitUntil((async () => {
          for (const { target } of e.files) {
            const model = this.get(target);
            if (model && !model.isDisposed()) {
              await model.revert();
            }
          }
        })());
        break;
      // Move/Copy: restore models that were resolved before the operation took place
      case FileOperation.MOVE:
      case FileOperation.COPY:
        e.waitUntil((async () => {
          const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
          if (modelsToRestore) {
            this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
            await Promises.settled(modelsToRestore.map(async (modelToRestore) => {
              const target = this.uriIdentityService.asCanonicalUri(modelToRestore.target);
              const restoredModel = await this.resolve(target, {
                reload: { async: false },
                // enforce a reload
                contents: modelToRestore.snapshot ? createTextBufferFactoryFromSnapshot(modelToRestore.snapshot) : void 0,
                encoding: modelToRestore.encoding
              });
              if (modelToRestore.language?.id && modelToRestore.language.id !== PLAINTEXT_LANGUAGE_ID) {
                if (modelToRestore.language.explicit) {
                  restoredModel.setLanguageId(modelToRestore.language.id);
                } else if (restoredModel.getLanguageId() === PLAINTEXT_LANGUAGE_ID && extname(target) !== PLAINTEXT_EXTENSION) {
                  restoredModel.updateTextEditorModel(void 0, modelToRestore.language.id);
                }
              }
            }));
          }
        })());
        break;
    }
  }
  get(resource) {
    return this.mapResourceToModel.get(resource);
  }
  has(resource) {
    return this.mapResourceToModel.has(resource);
  }
  async reload(model) {
    await this.joinPendingResolves(model.resource);
    if (model.isDirty() || model.isDisposed() || !this.has(model.resource)) {
      return;
    }
    await this.doResolve(model, { reload: { async: false } });
  }
  async resolve(resource, options) {
    const pendingResolve = this.joinPendingResolves(resource);
    if (pendingResolve) {
      await pendingResolve;
    }
    return this.doResolve(resource, options);
  }
  async doResolve(resourceOrModel, options) {
    let model;
    let resource;
    if (URI.isUri(resourceOrModel)) {
      resource = resourceOrModel;
      model = this.get(resource);
    } else {
      resource = resourceOrModel.resource;
      model = resourceOrModel;
    }
    let modelResolve;
    let didCreateModel = false;
    if (model) {
      if (options?.contents) {
        modelResolve = model.resolve(options);
      } else if (options?.reload) {
        if (options.reload.async) {
          modelResolve = Promise.resolve();
          (async () => {
            try {
              await model.resolve(options);
            } catch (error) {
              if (!model.isDisposed()) {
                onUnexpectedError(error);
              }
            }
          })();
        } else {
          modelResolve = model.resolve(options);
        }
      } else {
        modelResolve = Promise.resolve();
      }
    } else {
      didCreateModel = true;
      const newModel = model = this.instantiationService.createInstance(TextFileEditorModel, resource, options ? options.encoding : void 0, options ? options.languageId : void 0);
      modelResolve = model.resolve(options);
      this.registerModel(newModel);
    }
    this.mapResourceToPendingModelResolvers.set(resource, modelResolve);
    this.add(resource, model);
    if (didCreateModel) {
      this._onDidCreate.fire(model);
      if (model.isDirty()) {
        this._onDidChangeDirty.fire(model);
      }
    }
    try {
      await modelResolve;
    } catch (error) {
      if (didCreateModel) {
        model.dispose();
      }
      throw error;
    } finally {
      this.mapResourceToPendingModelResolvers.delete(resource);
    }
    if (options?.languageId) {
      model.setLanguageId(options.languageId);
    }
    if (didCreateModel && model.isDirty()) {
      this._onDidChangeDirty.fire(model);
    }
    return model;
  }
  joinPendingResolves(resource) {
    const pendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
    if (!pendingModelResolve) {
      return;
    }
    return this.doJoinPendingResolves(resource);
  }
  async doJoinPendingResolves(resource) {
    let currentModelCopyResolve;
    while (this.mapResourceToPendingModelResolvers.has(resource)) {
      const nextPendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
      if (nextPendingModelResolve === currentModelCopyResolve) {
        return;
      }
      currentModelCopyResolve = nextPendingModelResolve;
      try {
        await nextPendingModelResolve;
      } catch (error) {
      }
    }
  }
  registerModel(model) {
    const modelListeners = new DisposableStore();
    modelListeners.add(model.onDidResolve((reason) => this._onDidResolve.fire({ model, reason })));
    modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire(model)));
    modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(model)));
    modelListeners.add(model.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(model)));
    modelListeners.add(model.onDidSaveError(() => this._onDidSaveError.fire(model)));
    modelListeners.add(model.onDidSave((e) => this._onDidSave.fire({ model, ...e })));
    modelListeners.add(model.onDidRevert(() => this._onDidRevert.fire(model)));
    modelListeners.add(model.onDidChangeEncoding(() => this._onDidChangeEncoding.fire(model)));
    this.mapResourceToModelListeners.set(model.resource, modelListeners);
  }
  add(resource, model) {
    const knownModel = this.mapResourceToModel.get(resource);
    if (knownModel === model) {
      return;
    }
    const disposeListener = this.mapResourceToDisposeListener.get(resource);
    disposeListener?.dispose();
    this.mapResourceToModel.set(resource, model);
    this.mapResourceToDisposeListener.set(resource, model.onWillDispose(() => this.remove(resource)));
  }
  remove(resource) {
    const removed = this.mapResourceToModel.delete(resource);
    const disposeListener = this.mapResourceToDisposeListener.get(resource);
    if (disposeListener) {
      dispose(disposeListener);
      this.mapResourceToDisposeListener.delete(resource);
    }
    const modelListener = this.mapResourceToModelListeners.get(resource);
    if (modelListener) {
      dispose(modelListener);
      this.mapResourceToModelListeners.delete(resource);
    }
    if (removed) {
      this._onDidRemove.fire(resource);
    }
  }
  addSaveParticipant(participant) {
    return this.saveParticipants.addSaveParticipant(participant);
  }
  runSaveParticipants(model, context, progress, token) {
    return this.saveParticipants.participate(model, context, progress, token);
  }
  //#endregion
  canDispose(model) {
    if (model.isDisposed() || !this.mapResourceToPendingModelResolvers.has(model.resource) && !model.isDirty()) {
      return true;
    }
    return this.doCanDispose(model);
  }
  async doCanDispose(model) {
    const pendingResolve = this.joinPendingResolves(model.resource);
    if (pendingResolve) {
      await pendingResolve;
      return this.canDispose(model);
    }
    if (model.isDirty()) {
      await Event.toPromise(model.onDidChangeDirty);
      return this.canDispose(model);
    }
    return true;
  }
  dispose() {
    super.dispose();
    this.mapResourceToModel.clear();
    this.mapResourceToPendingModelResolvers.clear();
    dispose(this.mapResourceToDisposeListener.values());
    this.mapResourceToDisposeListener.clear();
    dispose(this.mapResourceToModelListeners.values());
    this.mapResourceToModelListeners.clear();
  }
};
TextFileEditorModelManager = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IUriIdentityService)
], TextFileEditorModelManager);
export {
  TextFileEditorModelManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcY29tbW9uXFx0ZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWwgfSBmcm9tICcuL3RleHRGaWxlRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLCBJVGV4dEZpbGVFZGl0b3JNb2RlbFJlc29sdmVPckNyZWF0ZU9wdGlvbnMsIElUZXh0RmlsZVJlc29sdmVFdmVudCwgSVRleHRGaWxlU2F2ZUV2ZW50LCBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQgfSBmcm9tICcuL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgRmlsZUNoYW5nZXNFdmVudCwgRmlsZU9wZXJhdGlvbiwgRmlsZUNoYW5nZVR5cGUsIElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCwgSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVTYXZlUGFydGljaXBhbnQgfSBmcm9tICcuL3RleHRGaWxlU2F2ZVBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBXb3JraW5nQ29weUZpbGVFdmVudCB9IGZyb20gJy4uLy4uL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0VYVEVOU0lPTiwgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5cbmludGVyZmFjZSBJVGV4dEZpbGVFZGl0b3JNb2RlbFRvUmVzdG9yZSB7XG5cdHJlYWRvbmx5IHNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0YXJnZXQ6IFVSSTtcblx0cmVhZG9ubHkgc25hcHNob3Q/OiBJVGV4dFNuYXBzaG90O1xuXHRyZWFkb25seSBsYW5ndWFnZT86IHtcblx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGV4cGxpY2l0OiBib29sZWFuO1xuXHR9O1xuXHRyZWFkb25seSBlbmNvZGluZz86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDcmVhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZUVkaXRvck1vZGVsPih7IGxlYWtXYXJuaW5nVGhyZXNob2xkOiA1MDAsIGxlYWtXYXJuaW5nTmFtZTogJ1RleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLl9vbkRpZENyZWF0ZScgLyogaW5jcmVhc2VkIGZvciB1c2VycyB3aXRoIGh1bmRyZWRzIG9mIGlucHV0cyBvcGVuZWQgKi8gfSkpO1xuXHRyZWFkb25seSBvbkRpZENyZWF0ZSA9IHRoaXMuX29uRGlkQ3JlYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzb2x2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXh0RmlsZVJlc29sdmVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZSA9IHRoaXMuX29uRGlkUmVzb2x2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlID0gdGhpcy5fb25EaWRSZW1vdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRleHRGaWxlRWRpdG9yTW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHkgPSB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZUVkaXRvck1vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcnBoYW5lZCA9IHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZUVkaXRvck1vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlRXJyb3IgPSB0aGlzLl9vbkRpZFNhdmVFcnJvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dEZpbGVTYXZlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmUgPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXZlcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZUVkaXRvck1vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZlcnQgPSB0aGlzLl9vbkRpZFJldmVydC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVuY29kaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW5jb2RpbmcgPSB0aGlzLl9vbkRpZENoYW5nZUVuY29kaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUmVzb3VyY2VUb01vZGVsID0gbmV3IFJlc291cmNlTWFwPFRleHRGaWxlRWRpdG9yTW9kZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUmVzb3VyY2VUb01vZGVsTGlzdGVuZXJzID0gbmV3IFJlc291cmNlTWFwPElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPHZvaWQ+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxSZXNvbHZlUXVldWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VRdWV1ZSgpKTtcblxuXHRzYXZlRXJyb3JIYW5kbGVyID0gKCgpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uU2F2ZUVycm9yKGVycm9yOiBFcnJvciwgbW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZCB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoeyBrZXk6ICdnZW5lcmljU2F2ZUVycm9yJywgY29tbWVudDogWyd7MH0gaXMgdGhlIHJlc291cmNlIHRoYXQgZmFpbGVkIHRvIHNhdmUgYW5kIHsxfSB0aGUgZXJyb3IgbWVzc2FnZSddIH0sIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IHsxfVwiLCBtb2RlbC5uYW1lLCB0b0Vycm9yTWVzc2FnZShlcnJvciwgZmFsc2UpKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fSkoKTtcblxuXHRnZXQgbW9kZWxzKCk6IFRleHRGaWxlRWRpdG9yTW9kZWxbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLm1hcFJlc291cmNlVG9Nb2RlbC52YWx1ZXMoKV07XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zYXZlUGFydGljaXBhbnRzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbHMgZnJvbSBmaWxlIGNoYW5nZSBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB0aGlzLm9uRGlkRmlsZXNDaGFuZ2UoZSkpKTtcblxuXHRcdC8vIEZpbGUgc3lzdGVtIHByb3ZpZGVyIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKGUgPT4gdGhpcy5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4gdGhpcy5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZSkpKTtcblxuXHRcdC8vIFdvcmtpbmcgY29weSBvcGVyYXRpb25zXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHRoaXMub25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uRGlkRmFpbFdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHRoaXMub25EaWRGYWlsV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUgPT4gdGhpcy5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbGVzQ2hhbmdlKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMubW9kZWxzKSB7XG5cdFx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBuZXZlciByZWxvYWQgZGlydHkgbW9kZWxzXG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyaWdnZXIgYSBtb2RlbCByZXNvbHZlIGZvciBhbnkgdXBkYXRlIG9yIGFkZCBldmVudCB0aGF0IGltcGFjdHNcblx0XHRcdC8vIHRoZSBtb2RlbC4gV2UgYWxzbyBjb25zaWRlciB0aGUgYWRkZWQgZXZlbnQgYmVjYXVzZSBpdCBjb3VsZFxuXHRcdFx0Ly8gYmUgdGhhdCBhIGZpbGUgd2FzIGFkZGVkIGFuZCB1cGRhdGVkIHJpZ2h0IGFmdGVyLlxuXHRcdFx0aWYgKGUuY29udGFpbnMobW9kZWwucmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKSkge1xuXHRcdFx0XHR0aGlzLnF1ZXVlTW9kZWxSZWxvYWQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZTogSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBSZXNvbHZlIG1vZGVscyBhZ2FpbiBmb3IgZmlsZSBzeXN0ZW1zIHRoYXQgY2hhbmdlZFxuXHRcdC8vIGNhcGFiaWxpdGllcyB0byBmZXRjaCBsYXRlc3QgbWV0YWRhdGEgKGUuZy4gcmVhZG9ubHkpXG5cdFx0Ly8gaW50byBhbGwgbW9kZWxzLlxuXHRcdHRoaXMucXVldWVNb2RlbFJlbG9hZHMoZS5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZTogSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFlLmFkZGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgaWYgYWRkZWRcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIG1vZGVscyBhZ2FpbiBmb3IgZmlsZSBzeXN0ZW1zIHRoYXQgcmVnaXN0ZXJlZFxuXHRcdC8vIHRvIGFjY291bnQgZm9yIGNhcGFiaWxpdHkgY2hhbmdlczogZXh0ZW5zaW9ucyBtYXlcblx0XHQvLyB1bnJlZ2lzdGVyIGFuZCByZWdpc3RlciB0aGUgc2FtZSBwcm92aWRlciB3aXRoIGRpZmZlcmVudFxuXHRcdC8vIGNhcGFiaWxpdGllcywgc28gd2Ugd2FudCB0byBlbnN1cmUgdG8gZmV0Y2ggbGF0ZXN0XG5cdFx0Ly8gbWV0YWRhdGEgKGUuZy4gcmVhZG9ubHkpIGludG8gYWxsIG1vZGVscy5cblx0XHR0aGlzLnF1ZXVlTW9kZWxSZWxvYWRzKGUuc2NoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgcXVldWVNb2RlbFJlbG9hZHMoc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMubW9kZWxzKSB7XG5cdFx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBuZXZlciByZWxvYWQgZGlydHkgbW9kZWxzXG5cdFx0XHR9XG5cblx0XHRcdGlmIChzY2hlbWUgPT09IG1vZGVsLnJlc291cmNlLnNjaGVtZSkge1xuXHRcdFx0XHR0aGlzLnF1ZXVlTW9kZWxSZWxvYWQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcXVldWVNb2RlbFJlbG9hZChtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVzb2x2ZSBtb2RlbCB0byB1cGRhdGUgKHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgYWNjdW11bGF0aW9uIG9mIHJlc29sdmVzXG5cdFx0Ly8gd2hlbiB0aGUgcmVzb2x2ZSBhY3R1YWxseSB0YWtlcyBsb25nLiBBdCBtb3N0IHdlIG9ubHkgd2FudCB0aGUgcXVldWVcblx0XHQvLyB0byBoYXZlIGEgc2l6ZSBvZiAyICgxIHJ1bm5pbmcgcmVzb2x2ZSBhbmQgMSBxdWV1ZWQgcmVzb2x2ZSkuXG5cdFx0Y29uc3QgcXVldWVTaXplID0gdGhpcy5tb2RlbFJlc29sdmVRdWV1ZS5xdWV1ZVNpemUobW9kZWwucmVzb3VyY2UpO1xuXHRcdGlmIChxdWV1ZVNpemUgPD0gMSkge1xuXHRcdFx0dGhpcy5tb2RlbFJlc29sdmVRdWV1ZS5xdWV1ZUZvcihtb2RlbC5yZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkKG1vZGVsKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwQ29ycmVsYXRpb25JZFRvTW9kZWxzVG9SZXN0b3JlID0gbmV3IE1hcDxudW1iZXIsIElUZXh0RmlsZUVkaXRvck1vZGVsVG9SZXN0b3JlW10+KCk7XG5cblx0cHJpdmF0ZSBvbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZTogV29ya2luZ0NvcHlGaWxlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIE1vdmUgLyBDb3B5OiByZW1lbWJlciBtb2RlbHMgdG8gcmVzdG9yZSBhZnRlciB0aGUgb3BlcmF0aW9uXG5cdFx0aWYgKGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLk1PVkUgfHwgZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkge1xuXHRcdFx0Y29uc3QgbW9kZWxzVG9SZXN0b3JlOiBJVGV4dEZpbGVFZGl0b3JNb2RlbFRvUmVzdG9yZVtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgeyBzb3VyY2UsIHRhcmdldCB9IG9mIGUuZmlsZXMpIHtcblx0XHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzb3VyY2UsIHRhcmdldCkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBpZ25vcmUgaWYgcmVzb3VyY2VzIGFyZSBjb25zaWRlcmVkIGVxdWFsXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gZmluZCBhbGwgbW9kZWxzIHRoYXQgcmVsYXRlZCB0byBzb3VyY2UgKGNhbiBiZSBtYW55IGlmIHJlc291cmNlIGlzIGEgZm9sZGVyKVxuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZU1vZGVsczogVGV4dEZpbGVFZGl0b3JNb2RlbFtdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLm1vZGVscykge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQobW9kZWwucmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0c291cmNlTW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHJlbWVtYmVyIGVhY2ggc291cmNlIG1vZGVsIHRvIHJlc29sdmUgYWdhaW4gYWZ0ZXIgbW92ZSBpcyBkb25lXG5cdFx0XHRcdFx0Ly8gd2l0aCBvcHRpb25hbCBjb250ZW50IHRvIHJlc3RvcmUgaWYgaXQgd2FzIGRpcnR5XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzb3VyY2VNb2RlbCBvZiBzb3VyY2VNb2RlbHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZU1vZGVsUmVzb3VyY2UgPSBzb3VyY2VNb2RlbC5yZXNvdXJjZTtcblxuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHNvdXJjZSBpcyB0aGUgYWN0dWFsIG1vZGVsLCBqdXN0IHVzZSB0YXJnZXQgYXMgbmV3IHJlc291cmNlXG5cdFx0XHRcdFx0XHRsZXQgdGFyZ2V0TW9kZWxSZXNvdXJjZTogVVJJO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZU1vZGVsUmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0TW9kZWxSZXNvdXJjZSA9IHRhcmdldDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gT3RoZXJ3aXNlIGEgcGFyZW50IGZvbGRlciBvZiB0aGUgc291cmNlIGlzIGJlaW5nIG1vdmVkLCBzbyB3ZSBuZWVkXG5cdFx0XHRcdFx0XHQvLyB0byBjb21wdXRlIHRoZSB0YXJnZXQgcmVzb3VyY2UgYmFzZWQgb24gdGhhdFxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldE1vZGVsUmVzb3VyY2UgPSBqb2luUGF0aCh0YXJnZXQsIHNvdXJjZU1vZGVsUmVzb3VyY2UucGF0aC5zdWJzdHIoc291cmNlLnBhdGgubGVuZ3RoICsgMSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gc291cmNlTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0XHRcdFx0bW9kZWxzVG9SZXN0b3JlLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IHNvdXJjZU1vZGVsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdHRhcmdldDogdGFyZ2V0TW9kZWxSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlSWQgPyB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IGxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRcdFx0ZXhwbGljaXQ6IHNvdXJjZU1vZGVsLmxhbmd1YWdlQ2hhbmdlU291cmNlID09PSAndXNlcidcblx0XHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0ZW5jb2Rpbmc6IHNvdXJjZU1vZGVsLmdldEVuY29kaW5nKCksXG5cdFx0XHRcdFx0XHRcdHNuYXBzaG90OiBzb3VyY2VNb2RlbC5pc0RpcnR5KCkgPyBzb3VyY2VNb2RlbC5jcmVhdGVTbmFwc2hvdCgpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Nb2RlbHNUb1Jlc3RvcmUuc2V0KGUuY29ycmVsYXRpb25JZCwgbW9kZWxzVG9SZXN0b3JlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRmFpbFdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlOiBXb3JraW5nQ29weUZpbGVFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gTW92ZSAvIENvcHk6IHJlc3RvcmUgZGlydHkgZmxhZyBvbiBtb2RlbHMgdG8gcmVzdG9yZSB0aGF0IHdlcmUgZGlydHlcblx0XHRpZiAoKGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLk1PVkUgfHwgZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkpIHtcblx0XHRcdGNvbnN0IG1vZGVsc1RvUmVzdG9yZSA9IHRoaXMubWFwQ29ycmVsYXRpb25JZFRvTW9kZWxzVG9SZXN0b3JlLmdldChlLmNvcnJlbGF0aW9uSWQpO1xuXHRcdFx0aWYgKG1vZGVsc1RvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLm1hcENvcnJlbGF0aW9uSWRUb01vZGVsc1RvUmVzdG9yZS5kZWxldGUoZS5jb3JyZWxhdGlvbklkKTtcblxuXHRcdFx0XHRtb2RlbHNUb1Jlc3RvcmUuZm9yRWFjaChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0Ly8gc25hcHNob3QgcHJlc2VuY2UgbWVhbnMgdGhpcyBtb2RlbCB1c2VkIHRvIGJlIGRpcnR5IGFuZCBzbyB3ZSByZXN0b3JlIHRoYXRcblx0XHRcdFx0XHQvLyBmbGFnLiB3ZSBkbyBOT1QgaGF2ZSB0byByZXN0b3JlIHRoZSBjb250ZW50IGJlY2F1c2UgdGhlIG1vZGVsIHdhcyBvbmx5IHNvZnRcblx0XHRcdFx0XHQvLyByZXZlcnRlZCBhbmQgZGlkIG5vdCBsb29zZSBpdHMgb3JpZ2luYWwgZGlydHkgY29udGVudHMuXG5cdFx0XHRcdFx0aWYgKG1vZGVsLnNuYXBzaG90KSB7XG5cdFx0XHRcdFx0XHR0aGlzLmdldChtb2RlbC5zb3VyY2UpPy5zZXREaXJ0eSh0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZTogV29ya2luZ0NvcHlGaWxlRXZlbnQpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGUub3BlcmF0aW9uKSB7XG5cblx0XHRcdC8vIENyZWF0ZTogUmV2ZXJ0IGV4aXN0aW5nIG1vZGVsc1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkNSRUFURTpcblx0XHRcdFx0ZS53YWl0VW50aWwoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsgdGFyZ2V0IH0gb2YgZS5maWxlcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmdldCh0YXJnZXQpO1xuXHRcdFx0XHRcdFx0aWYgKG1vZGVsICYmICFtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgbW9kZWwucmV2ZXJ0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdC8vIE1vdmUvQ29weTogcmVzdG9yZSBtb2RlbHMgdGhhdCB3ZXJlIHJlc29sdmVkIGJlZm9yZSB0aGUgb3BlcmF0aW9uIHRvb2sgcGxhY2Vcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5NT1ZFOlxuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkNPUFk6XG5cdFx0XHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxzVG9SZXN0b3JlID0gdGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Nb2RlbHNUb1Jlc3RvcmUuZ2V0KGUuY29ycmVsYXRpb25JZCk7XG5cdFx0XHRcdFx0aWYgKG1vZGVsc1RvUmVzdG9yZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Nb2RlbHNUb1Jlc3RvcmUuZGVsZXRlKGUuY29ycmVsYXRpb25JZCk7XG5cblx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQobW9kZWxzVG9SZXN0b3JlLm1hcChhc3luYyBtb2RlbFRvUmVzdG9yZSA9PiB7XG5cblx0XHRcdFx0XHRcdFx0Ly8gRnJvbSB0aGlzIG1vbWVudCBvbiwgb25seSBvcGVyYXRlIG9uIHRoZSBjYW5vbmljYWwgcmVzb3VyY2Vcblx0XHRcdFx0XHRcdFx0Ly8gdG8gZml4IGEgcG90ZW50aWFsIGRhdGEgbG9zcyBpc3N1ZTpcblx0XHRcdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIxMTM3NFxuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShtb2RlbFRvUmVzdG9yZS50YXJnZXQpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIHJlc3RvcmUgdGhlIG1vZGVsIGF0IHRoZSB0YXJnZXQuIGlmIHdlIGhhdmUgcHJldmlvdXMgZGlydHkgY29udGVudCwgd2UgcGFzcyBpdFxuXHRcdFx0XHRcdFx0XHQvLyBvdmVyIHRvIGJlIHVzZWQsIG90aGVyd2lzZSB3ZSBmb3JjZSBhIHJlbG9hZCBmcm9tIGRpc2suIHRoaXMgaXMgaW1wb3J0YW50XG5cdFx0XHRcdFx0XHRcdC8vIGJlY2F1c2Ugd2Uga25vdyB0aGUgZmlsZSBoYXMgY2hhbmdlZCBvbiBkaXNrIGFmdGVyIHRoZSBtb3ZlIGFuZCB0aGUgbW9kZWwgbWlnaHRcblx0XHRcdFx0XHRcdFx0Ly8gaGF2ZSBzdGlsbCBleGlzdGVkIHdpdGggdGhlIHByZXZpb3VzIHN0YXRlLiB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgbW9kZWwgaXMgbm90XG5cdFx0XHRcdFx0XHRcdC8vIHRyYWNraW5nIGEgc3RhbGUgc3RhdGUuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3RvcmVkTW9kZWwgPSBhd2FpdCB0aGlzLnJlc29sdmUodGFyZ2V0LCB7XG5cdFx0XHRcdFx0XHRcdFx0cmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9LCAvLyBlbmZvcmNlIGEgcmVsb2FkXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IG1vZGVsVG9SZXN0b3JlLnNuYXBzaG90ID8gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3QobW9kZWxUb1Jlc3RvcmUuc25hcHNob3QpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGVuY29kaW5nOiBtb2RlbFRvUmVzdG9yZS5lbmNvZGluZ1xuXHRcdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0XHQvLyByZXN0b3JlIG1vZGVsIGxhbmd1YWdlIG9ubHkgaWYgaXQgaXMgc3BlY2lmaWNcblx0XHRcdFx0XHRcdFx0aWYgKG1vZGVsVG9SZXN0b3JlLmxhbmd1YWdlPy5pZCAmJiBtb2RlbFRvUmVzdG9yZS5sYW5ndWFnZS5pZCAhPT0gUExBSU5URVhUX0xBTkdVQUdFX0lEKSB7XG5cblx0XHRcdFx0XHRcdFx0XHQvLyBhbiBleHBsaWNpdGx5IHNldCBsYW5ndWFnZSBpcyByZXN0b3JlZCB2aWEgYHNldExhbmd1YWdlSWRgXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdG8gcHJlc2VydmUgaXQgYXMgZXhwbGljaXRseSBzZXQgYnkgdGhlIHVzZXIuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDM2NDgpXG5cdFx0XHRcdFx0XHRcdFx0aWYgKG1vZGVsVG9SZXN0b3JlLmxhbmd1YWdlLmV4cGxpY2l0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXN0b3JlZE1vZGVsLnNldExhbmd1YWdlSWQobW9kZWxUb1Jlc3RvcmUubGFuZ3VhZ2UuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdC8vIG90aGVyd2lzZSwgYSBtb2RlbCBsYW5ndWFnZSBpcyBhcHBsaWVkIHZpYSBsb3dlciBsZXZlbFxuXHRcdFx0XHRcdFx0XHRcdC8vIEFQSXMgdG8gbm90IGNvbmZ1c2UgaXQgd2l0aCBhbiBleHBsaWNpdGx5IHNldCBsYW5ndWFnZS5cblx0XHRcdFx0XHRcdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNTc5NSlcblx0XHRcdFx0XHRcdFx0XHRlbHNlIGlmIChyZXN0b3JlZE1vZGVsLmdldExhbmd1YWdlSWQoKSA9PT0gUExBSU5URVhUX0xBTkdVQUdFX0lEICYmIGV4dG5hbWUodGFyZ2V0KSAhPT0gUExBSU5URVhUX0VYVEVOU0lPTikge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVzdG9yZWRNb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwodW5kZWZpbmVkLCBtb2RlbFRvUmVzdG9yZS5sYW5ndWFnZS5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KHJlc291cmNlOiBVUkkpOiBUZXh0RmlsZUVkaXRvck1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwuZ2V0KHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwuaGFzKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkKG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBBd2FpdCBhIHBlbmRpbmcgbW9kZWwgcmVzb2x2ZSBmaXJzdCBiZWZvcmUgcHJvY2VlZGluZ1xuXHRcdC8vIHRvIGVuc3VyZSB0aGF0IHdlIG5ldmVyIHJlc29sdmUgYSBtb2RlbCBtb3JlIHRoYW4gb25jZVxuXHRcdC8vIGluIHBhcmFsbGVsLlxuXHRcdGF3YWl0IHRoaXMuam9pblBlbmRpbmdSZXNvbHZlcyhtb2RlbC5yZXNvdXJjZSk7XG5cblx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpIHx8IG1vZGVsLmlzRGlzcG9zZWQoKSB8fCAhdGhpcy5oYXMobW9kZWwucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHRoZSBtb2RlbCBwb3NzaWJseSBnb3QgZGlydHkgb3IgZGlzcG9zZWQsIHNvIHJldHVybiBlYXJseSB0aGVuXG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByZWxvYWRcblx0XHRhd2FpdCB0aGlzLmRvUmVzb2x2ZShtb2RlbCwgeyByZWxvYWQ6IHsgYXN5bmM6IGZhbHNlIH0gfSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJVGV4dEZpbGVFZGl0b3JNb2RlbFJlc29sdmVPckNyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPFRleHRGaWxlRWRpdG9yTW9kZWw+IHtcblxuXHRcdC8vIEF3YWl0IGEgcGVuZGluZyBtb2RlbCByZXNvbHZlIGZpcnN0IGJlZm9yZSBwcm9jZWVkaW5nXG5cdFx0Ly8gdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgcmVzb2x2ZSBhIG1vZGVsIG1vcmUgdGhhbiBvbmNlXG5cdFx0Ly8gaW4gcGFyYWxsZWwuXG5cdFx0Y29uc3QgcGVuZGluZ1Jlc29sdmUgPSB0aGlzLmpvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVzb2x2ZSkge1xuXHRcdFx0YXdhaXQgcGVuZGluZ1Jlc29sdmU7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByZXNvbHZlXG5cdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlKHJlc291cmNlT3JNb2RlbDogVVJJIHwgVGV4dEZpbGVFZGl0b3JNb2RlbCwgb3B0aW9ucz86IElUZXh0RmlsZUVkaXRvck1vZGVsUmVzb2x2ZU9yQ3JlYXRlT3B0aW9ucyk6IFByb21pc2U8VGV4dEZpbGVFZGl0b3JNb2RlbD4ge1xuXHRcdGxldCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVzb3VyY2U6IFVSSTtcblx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlT3JNb2RlbCkpIHtcblx0XHRcdHJlc291cmNlID0gcmVzb3VyY2VPck1vZGVsO1xuXHRcdFx0bW9kZWwgPSB0aGlzLmdldChyZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gcmVzb3VyY2VPck1vZGVsLnJlc291cmNlO1xuXHRcdFx0bW9kZWwgPSByZXNvdXJjZU9yTW9kZWw7XG5cdFx0fVxuXG5cdFx0bGV0IG1vZGVsUmVzb2x2ZTogUHJvbWlzZTx2b2lkPjtcblx0XHRsZXQgZGlkQ3JlYXRlTW9kZWwgPSBmYWxzZTtcblxuXHRcdC8vIE1vZGVsIGV4aXN0c1xuXHRcdGlmIChtb2RlbCkge1xuXG5cdFx0XHQvLyBBbHdheXMgcmVsb2FkIGlmIGNvbnRlbnRzIGFyZSBwcm92aWRlZFxuXHRcdFx0aWYgKG9wdGlvbnM/LmNvbnRlbnRzKSB7XG5cdFx0XHRcdG1vZGVsUmVzb2x2ZSA9IG1vZGVsLnJlc29sdmUob3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbG9hZCBhc3luYyBvciBzeW5jIGJhc2VkIG9uIG9wdGlvbnNcblx0XHRcdGVsc2UgaWYgKG9wdGlvbnM/LnJlbG9hZCkge1xuXG5cdFx0XHRcdC8vIGFzeW5jIHJlbG9hZDogdHJpZ2dlciBhIHJlbG9hZCBidXQgcmV0dXJuIGltbWVkaWF0ZWx5XG5cdFx0XHRcdGlmIChvcHRpb25zLnJlbG9hZC5hc3luYykge1xuXHRcdFx0XHRcdG1vZGVsUmVzb2x2ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKG9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7IC8vIG9ubHkgbG9nIGlmIHRoZSBtb2RlbCBpcyBzdGlsbCBhcm91bmRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBzeW5jIHJlbG9hZDogZG8gbm90IHJldHVybiB1bnRpbCBtb2RlbCByZWxvYWRlZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRtb2RlbFJlc29sdmUgPSBtb2RlbC5yZXNvbHZlKG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIERvIG5vdCByZWxvYWRcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRtb2RlbFJlc29sdmUgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb2RlbCBkb2VzIG5vdCBleGlzdFxuXHRcdGVsc2Uge1xuXHRcdFx0ZGlkQ3JlYXRlTW9kZWwgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBuZXdNb2RlbCA9IG1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCByZXNvdXJjZSwgb3B0aW9ucyA/IG9wdGlvbnMuZW5jb2RpbmcgOiB1bmRlZmluZWQsIG9wdGlvbnMgPyBvcHRpb25zLmxhbmd1YWdlSWQgOiB1bmRlZmluZWQpO1xuXHRcdFx0bW9kZWxSZXNvbHZlID0gbW9kZWwucmVzb2x2ZShvcHRpb25zKTtcblxuXHRcdFx0dGhpcy5yZWdpc3Rlck1vZGVsKG5ld01vZGVsKTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSBwZW5kaW5nIHJlc29sdmVzIHRvIGF2b2lkIHJhY2UgY29uZGl0aW9uc1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5zZXQocmVzb3VyY2UsIG1vZGVsUmVzb2x2ZSk7XG5cblx0XHQvLyBNYWtlIGtub3duIHRvIG1hbmFnZXIgKGlmIG5vdCBhbHJlYWR5IGtub3duKVxuXHRcdHRoaXMuYWRkKHJlc291cmNlLCBtb2RlbCk7XG5cblx0XHQvLyBFbWl0IHNvbWUgZXZlbnRzIGlmIHdlIGNyZWF0ZWQgdGhlIG1vZGVsXG5cdFx0aWYgKGRpZENyZWF0ZU1vZGVsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENyZWF0ZS5maXJlKG1vZGVsKTtcblxuXHRcdFx0Ly8gSWYgdGhlIG1vZGVsIGlzIGRpcnR5IHJpZ2h0IGZyb20gdGhlIGJlZ2lubmluZyxcblx0XHRcdC8vIG1ha2Ugc3VyZSB0byBlbWl0IHRoaXMgYXMgYW4gZXZlbnRcblx0XHRcdGlmIChtb2RlbC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbW9kZWxSZXNvbHZlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgZGlzcG9zZSB0aGUgbW9kZWwgaWYgd2UgY3JlYXRlZCBpdFxuXHRcdFx0Ly8gYmVjYXVzZSB3ZSBjYW5ub3QgZGlzcG9zZSBhIG1vZGVsIHdlIGRvIG5vdCBvd25cblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzg4NTBcblx0XHRcdGlmIChkaWRDcmVhdGVNb2RlbCkge1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cblx0XHRcdC8vIFJlbW92ZSBmcm9tIHBlbmRpbmcgcmVzb2x2ZXNcblx0XHRcdHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGxhbmd1YWdlIGlmIHByb3ZpZGVkXG5cdFx0aWYgKG9wdGlvbnM/Lmxhbmd1YWdlSWQpIHtcblx0XHRcdG1vZGVsLnNldExhbmd1YWdlSWQob3B0aW9ucy5sYW5ndWFnZUlkKTtcblx0XHR9XG5cblx0XHQvLyBNb2RlbCBjYW4gYmUgZGlydHkgaWYgYSBiYWNrdXAgd2FzIHJlc3RvcmVkLCBzbyB3ZSBtYWtlIHN1cmUgdG9cblx0XHQvLyBoYXZlIHRoaXMgZXZlbnQgZGVsaXZlcmVkIGlmIHdlIGNyZWF0ZWQgdGhlIG1vZGVsIGhlcmVcblx0XHRpZiAoZGlkQ3JlYXRlTW9kZWwgJiYgbW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUobW9kZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgam9pblBlbmRpbmdSZXNvbHZlcyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGVuZGluZ01vZGVsUmVzb2x2ZSA9IHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghcGVuZGluZ01vZGVsUmVzb2x2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvSm9pblBlbmRpbmdSZXNvbHZlcyhyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSm9pblBlbmRpbmdSZXNvbHZlcyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBXaGlsZSB3ZSBoYXZlIHBlbmRpbmcgbW9kZWwgcmVzb2x2ZXMsIGVuc3VyZVxuXHRcdC8vIHRvIGF3YWl0IHRoZSBsYXN0IG9uZSBmaW5pc2hpbmcgYmVmb3JlIHJldHVybmluZy5cblx0XHQvLyBUaGlzIHByZXZlbnRzIGEgcmFjZSB3aGVuIG11bHRpcGxlIGNsaWVudHMgYXdhaXRcblx0XHQvLyB0aGUgcGVuZGluZyByZXNvbHZlIGFuZCB0aGVuIGFsbCB0cmlnZ2VyIHRoZSByZXNvbHZlXG5cdFx0Ly8gYXQgdGhlIHNhbWUgdGltZS5cblx0XHRsZXQgY3VycmVudE1vZGVsQ29weVJlc29sdmU6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdFx0d2hpbGUgKHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBuZXh0UGVuZGluZ01vZGVsUmVzb2x2ZSA9IHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG5leHRQZW5kaW5nTW9kZWxSZXNvbHZlID09PSBjdXJyZW50TW9kZWxDb3B5UmVzb2x2ZSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgYXdhaXRlZCBvbiAtIHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50TW9kZWxDb3B5UmVzb2x2ZSA9IG5leHRQZW5kaW5nTW9kZWxSZXNvbHZlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgbmV4dFBlbmRpbmdNb2RlbFJlc29sdmU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmUgYW55IGVycm9yIGhlcmUsIGl0IHdpbGwgYnViYmxlIHRvIHRoZSBvcmlnaW5hbCByZXF1ZXN0b3Jcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW9kZWwobW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwpOiB2b2lkIHtcblxuXHRcdC8vIEluc3RhbGwgbW9kZWwgbGlzdGVuZXJzXG5cdFx0Y29uc3QgbW9kZWxMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkUmVzb2x2ZShyZWFzb24gPT4gdGhpcy5fb25EaWRSZXNvbHZlLmZpcmUoeyBtb2RlbCwgcmVhc29uIH0pKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKG1vZGVsKSkpO1xuXHRcdG1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZmlyZShtb2RlbCkpKTtcblx0XHRtb2RlbExpc3RlbmVycy5hZGQobW9kZWwub25EaWRDaGFuZ2VPcnBoYW5lZCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZU9ycGhhbmVkLmZpcmUobW9kZWwpKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkU2F2ZUVycm9yKCgpID0+IHRoaXMuX29uRGlkU2F2ZUVycm9yLmZpcmUobW9kZWwpKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkU2F2ZShlID0+IHRoaXMuX29uRGlkU2F2ZS5maXJlKHsgbW9kZWwsIC4uLmUgfSkpKTtcblx0XHRtb2RlbExpc3RlbmVycy5hZGQobW9kZWwub25EaWRSZXZlcnQoKCkgPT4gdGhpcy5fb25EaWRSZXZlcnQuZmlyZShtb2RlbCkpKTtcblx0XHRtb2RlbExpc3RlbmVycy5hZGQobW9kZWwub25EaWRDaGFuZ2VFbmNvZGluZygoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUVuY29kaW5nLmZpcmUobW9kZWwpKSk7XG5cblx0XHQvLyBLZWVwIGZvciBkaXNwb3NhbFxuXHRcdHRoaXMubWFwUmVzb3VyY2VUb01vZGVsTGlzdGVuZXJzLnNldChtb2RlbC5yZXNvdXJjZSwgbW9kZWxMaXN0ZW5lcnMpO1xuXHR9XG5cblx0YWRkKHJlc291cmNlOiBVUkksIG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3Qga25vd25Nb2RlbCA9IHRoaXMubWFwUmVzb3VyY2VUb01vZGVsLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGtub3duTW9kZWwgPT09IG1vZGVsKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgY2FjaGVkXG5cdFx0fVxuXG5cdFx0Ly8gZGlzcG9zZSBhbnkgcHJldmlvdXNseSBzdG9yZWQgZGlzcG9zZSBsaXN0ZW5lciBmb3IgdGhpcyByZXNvdXJjZVxuXHRcdGNvbnN0IGRpc3Bvc2VMaXN0ZW5lciA9IHRoaXMubWFwUmVzb3VyY2VUb0Rpc3Bvc2VMaXN0ZW5lci5nZXQocmVzb3VyY2UpO1xuXHRcdGRpc3Bvc2VMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXG5cdFx0Ly8gc3RvcmUgaW4gY2FjaGUgYnV0IHJlbW92ZSB3aGVuIG1vZGVsIGdldHMgZGlzcG9zZWRcblx0XHR0aGlzLm1hcFJlc291cmNlVG9Nb2RlbC5zZXQocmVzb3VyY2UsIG1vZGVsKTtcblx0XHR0aGlzLm1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIuc2V0KHJlc291cmNlLCBtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHRoaXMucmVtb3ZlKHJlc291cmNlKSkpO1xuXHR9XG5cblx0cmVtb3ZlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwuZGVsZXRlKHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VMaXN0ZW5lciA9IHRoaXMubWFwUmVzb3VyY2VUb0Rpc3Bvc2VMaXN0ZW5lci5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChkaXNwb3NlTGlzdGVuZXIpIHtcblx0XHRcdGRpc3Bvc2UoZGlzcG9zZUxpc3RlbmVyKTtcblx0XHRcdHRoaXMubWFwUmVzb3VyY2VUb0Rpc3Bvc2VMaXN0ZW5lci5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsTGlzdGVuZXIgPSB0aGlzLm1hcFJlc291cmNlVG9Nb2RlbExpc3RlbmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbExpc3RlbmVyKSB7XG5cdFx0XHRkaXNwb3NlKG1vZGVsTGlzdGVuZXIpO1xuXHRcdFx0dGhpcy5tYXBSZXNvdXJjZVRvTW9kZWxMaXN0ZW5lcnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmUuZmlyZShyZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFNhdmUgcGFydGljaXBhbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBzYXZlUGFydGljaXBhbnRzOiBUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudDtcblxuXHRhZGRTYXZlUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlUGFydGljaXBhbnRzLmFkZFNhdmVQYXJ0aWNpcGFudChwYXJ0aWNpcGFudCk7XG5cdH1cblxuXHRydW5TYXZlUGFydGljaXBhbnRzKG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNhdmVQYXJ0aWNpcGFudHMucGFydGljaXBhdGUobW9kZWwsIGNvbnRleHQsIHByb2dyZXNzLCB0b2tlbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRjYW5EaXNwb3NlKG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogdHJ1ZSB8IFByb21pc2U8dHJ1ZT4ge1xuXG5cdFx0Ly8gcXVpY2sgcmV0dXJuIGlmIG1vZGVsIGFscmVhZHkgZGlzcG9zZWQgb3Igbm90IGRpcnR5IGFuZCBub3QgcmVzb2x2aW5nXG5cdFx0aWYgKFxuXHRcdFx0bW9kZWwuaXNEaXNwb3NlZCgpIHx8XG5cdFx0XHQoIXRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5oYXMobW9kZWwucmVzb3VyY2UpICYmICFtb2RlbC5pc0RpcnR5KCkpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBwcm9taXNlIGJhc2VkIHJldHVybiBpbiBhbGwgb3RoZXIgY2FzZXNcblx0XHRyZXR1cm4gdGhpcy5kb0NhbkRpc3Bvc2UobW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0NhbkRpc3Bvc2UobW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwpOiBQcm9taXNlPHRydWU+IHtcblxuXHRcdC8vIEF3YWl0IGFueSBwZW5kaW5nIHJlc29sdmVzIGZpcnN0IGJlZm9yZSBwcm9jZWVkaW5nXG5cdFx0Y29uc3QgcGVuZGluZ1Jlc29sdmUgPSB0aGlzLmpvaW5QZW5kaW5nUmVzb2x2ZXMobW9kZWwucmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVzb2x2ZSkge1xuXHRcdFx0YXdhaXQgcGVuZGluZ1Jlc29sdmU7XG5cblx0XHRcdHJldHVybiB0aGlzLmNhbkRpc3Bvc2UobW9kZWwpO1xuXHRcdH1cblxuXHRcdC8vIGRpcnR5IG1vZGVsOiB3ZSBkbyBub3QgYWxsb3cgdG8gZGlzcG9zZSBkaXJ0eSBtb2RlbHMgdG8gcHJldmVudFxuXHRcdC8vIGRhdGEgbG9zcyBjYXNlcy4gZGlydHkgbW9kZWxzIGNhbiBvbmx5IGJlIGRpc3Bvc2VkIHdoZW4gdGhleSBhcmVcblx0XHQvLyBlaXRoZXIgc2F2ZWQgb3IgcmV2ZXJ0ZWRcblx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UobW9kZWwub25EaWRDaGFuZ2VEaXJ0eSk7XG5cblx0XHRcdHJldHVybiB0aGlzLmNhbkRpc3Bvc2UobW9kZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBtb2RlbCBjYWNoZXNcblx0XHR0aGlzLm1hcFJlc291cmNlVG9Nb2RlbC5jbGVhcigpO1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdNb2RlbFJlc29sdmVycy5jbGVhcigpO1xuXG5cdFx0Ly8gZGlzcG9zZSB0aGUgZGlzcG9zZSBsaXN0ZW5lcnNcblx0XHRkaXNwb3NlKHRoaXMubWFwUmVzb3VyY2VUb0Rpc3Bvc2VMaXN0ZW5lci52YWx1ZXMoKSk7XG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvRGlzcG9zZUxpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHQvLyBkaXNwb3NlIHRoZSBtb2RlbCBjaGFuZ2UgbGlzdGVuZXJzXG5cdFx0ZGlzcG9zZSh0aGlzLm1hcFJlc291cmNlVG9Nb2RlbExpc3RlbmVycy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvTW9kZWxMaXN0ZW5lcnMuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFzQixZQUFZLHVCQUF1QjtBQUVsRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWdDLGVBQWUsc0JBQXdHO0FBQ2hLLFNBQVMsVUFBVSxxQkFBcUI7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBdUQsK0JBQXFEO0FBRTVHLFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsMkJBQTJCO0FBYzdCLElBQU0sNkJBQU4sY0FBeUMsV0FBa0Q7QUFBQSxFQXFEakcsWUFDeUMsc0JBQ1QsYUFDUSxxQkFDRyx3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
