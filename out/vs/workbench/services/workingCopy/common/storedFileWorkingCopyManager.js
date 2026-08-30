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
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { StoredFileWorkingCopy, StoredFileWorkingCopyState } from "./storedFileWorkingCopy.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { FileChangeType, FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { BaseFileWorkingCopyManager } from "./abstractFileWorkingCopyManager.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
let StoredFileWorkingCopyManager = class extends BaseFileWorkingCopyManager {
  constructor(workingCopyTypeId, modelFactory, fileService, lifecycleService, labelService, logService, workingCopyFileService, workingCopyBackupService, uriIdentityService, filesConfigurationService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
    super(fileService, logService, workingCopyBackupService);
    this.workingCopyTypeId = workingCopyTypeId;
    this.modelFactory = modelFactory;
    this.lifecycleService = lifecycleService;
    this.labelService = labelService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.filesConfigurationService = filesConfigurationService;
    this.workingCopyService = workingCopyService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.editorService = editorService;
    this.elevatedFileService = elevatedFileService;
    this.progressService = progressService;
    //#region Events
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
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
    this._onDidRemove = this._register(new Emitter());
    this.onDidRemove = this._onDidRemove.event;
    //#endregion
    this.mapResourceToWorkingCopyListeners = new ResourceMap();
    this.mapResourceToPendingWorkingCopyResolve = new ResourceMap();
    this.workingCopyResolveQueue = this._register(new ResourceQueue());
    //#endregion
    //#region Working Copy File Events
    this.mapCorrelationIdToWorkingCopiesToRestore = /* @__PURE__ */ new Map();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onDidChangeFileSystemProviderCapabilities(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onDidChangeFileSystemProviderRegistrations(e)));
    this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => this.onWillRunWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation((e) => this.onDidFailWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this.onDidRunWorkingCopyFileOperation(e)));
    if (isWeb) {
      this._register(this.lifecycleService.onBeforeShutdown((event) => event.veto(this.onBeforeShutdownWeb(), "veto.fileWorkingCopyManager")));
    } else {
      this._register(this.lifecycleService.onWillShutdown((event) => event.join(this.onWillShutdownDesktop(), { id: "join.fileWorkingCopyManager", label: localize("join.fileWorkingCopyManager", "Saving working copies") })));
    }
  }
  onBeforeShutdownWeb() {
    if (this.workingCopies.some((workingCopy) => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))) {
      return true;
    }
    return false;
  }
  async onWillShutdownDesktop() {
    let pendingSavedWorkingCopies;
    while ((pendingSavedWorkingCopies = this.workingCopies.filter((workingCopy) => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))).length > 0) {
      await Promises.settled(pendingSavedWorkingCopies.map((workingCopy) => workingCopy.joinState(StoredFileWorkingCopyState.PENDING_SAVE)));
    }
  }
  //#region Resolve from file or file provider changes
  onDidChangeFileSystemProviderCapabilities(e) {
    this.queueWorkingCopyReloads(e.scheme);
  }
  onDidChangeFileSystemProviderRegistrations(e) {
    if (!e.added) {
      return;
    }
    this.queueWorkingCopyReloads(e.scheme);
  }
  onDidFilesChange(e) {
    this.queueWorkingCopyReloads(e);
  }
  queueWorkingCopyReloads(schemeOrEvent) {
    for (const workingCopy of this.workingCopies) {
      if (workingCopy.isDirty()) {
        continue;
      }
      let resolveWorkingCopy = false;
      if (typeof schemeOrEvent === "string") {
        resolveWorkingCopy = schemeOrEvent === workingCopy.resource.scheme;
      } else {
        resolveWorkingCopy = schemeOrEvent.contains(workingCopy.resource, FileChangeType.UPDATED, FileChangeType.ADDED);
      }
      if (resolveWorkingCopy) {
        this.queueWorkingCopyReload(workingCopy);
      }
    }
  }
  queueWorkingCopyReload(workingCopy) {
    const queueSize = this.workingCopyResolveQueue.queueSize(workingCopy.resource);
    if (queueSize <= 1) {
      this.workingCopyResolveQueue.queueFor(workingCopy.resource, async () => {
        try {
          await this.reload(workingCopy);
        } catch (error) {
          this.logService.error(error);
        }
      });
    }
  }
  onWillRunWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      e.waitUntil((async () => {
        const workingCopiesToRestore = [];
        for (const { source, target } of e.files) {
          if (source) {
            if (this.uriIdentityService.extUri.isEqual(source, target)) {
              continue;
            }
            const sourceWorkingCopies = [];
            for (const workingCopy of this.workingCopies) {
              if (this.uriIdentityService.extUri.isEqualOrParent(workingCopy.resource, source)) {
                sourceWorkingCopies.push(workingCopy);
              }
            }
            for (const sourceWorkingCopy of sourceWorkingCopies) {
              const sourceResource = sourceWorkingCopy.resource;
              let targetResource;
              if (this.uriIdentityService.extUri.isEqual(sourceResource, source)) {
                targetResource = target;
              } else {
                targetResource = joinPath(target, sourceResource.path.substr(source.path.length + 1));
              }
              workingCopiesToRestore.push({
                source: sourceResource,
                target: targetResource,
                snapshot: sourceWorkingCopy.isDirty() ? await sourceWorkingCopy.model?.snapshot(SnapshotContext.Save, CancellationToken.None) : void 0
              });
            }
          }
        }
        this.mapCorrelationIdToWorkingCopiesToRestore.set(e.correlationId, workingCopiesToRestore);
      })());
    }
  }
  onDidFailWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
      if (workingCopiesToRestore) {
        this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);
        for (const workingCopy of workingCopiesToRestore) {
          if (workingCopy.snapshot) {
            this.get(workingCopy.source)?.markModified();
          }
        }
      }
    }
  }
  onDidRunWorkingCopyFileOperation(e) {
    switch (e.operation) {
      // Create: Revert existing working copies
      case FileOperation.CREATE:
        e.waitUntil((async () => {
          for (const { target } of e.files) {
            const workingCopy = this.get(target);
            if (workingCopy && !workingCopy.isDisposed()) {
              await workingCopy.revert();
            }
          }
        })());
        break;
      // Move/Copy: restore working copies that were loaded before the operation took place
      case FileOperation.MOVE:
      case FileOperation.COPY:
        e.waitUntil((async () => {
          const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
          if (workingCopiesToRestore) {
            this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);
            await Promises.settled(workingCopiesToRestore.map(async (workingCopyToRestore) => {
              const target = this.uriIdentityService.asCanonicalUri(workingCopyToRestore.target);
              await this.resolve(target, {
                reload: { async: false },
                // enforce a reload
                contents: workingCopyToRestore.snapshot
              });
            }));
          }
        })());
        break;
    }
  }
  //#endregion
  //#region Reload & Resolve
  async reload(workingCopy) {
    await this.joinPendingResolves(workingCopy.resource);
    if (workingCopy.isDirty() || workingCopy.isDisposed() || !this.has(workingCopy.resource)) {
      return;
    }
    await this.doResolve(workingCopy, { reload: { async: false } });
  }
  async resolve(resource, options) {
    const pendingResolve = this.joinPendingResolves(resource);
    if (pendingResolve) {
      await pendingResolve;
    }
    return this.doResolve(resource, options);
  }
  async doResolve(resourceOrWorkingCopy, options) {
    let workingCopy;
    let resource;
    if (URI.isUri(resourceOrWorkingCopy)) {
      resource = resourceOrWorkingCopy;
      workingCopy = this.get(resource);
    } else {
      resource = resourceOrWorkingCopy.resource;
      workingCopy = resourceOrWorkingCopy;
    }
    let workingCopyResolve;
    let didCreateWorkingCopy = false;
    const resolveOptions = {
      contents: options?.contents,
      forceReadFromFile: options?.reload?.force,
      limits: options?.limits
    };
    if (workingCopy) {
      if (options?.contents) {
        workingCopyResolve = workingCopy.resolve(resolveOptions);
      } else if (options?.reload) {
        if (options.reload.async) {
          workingCopyResolve = Promise.resolve();
          (async () => {
            try {
              await workingCopy.resolve(resolveOptions);
            } catch (error) {
              if (!workingCopy.isDisposed()) {
                onUnexpectedError(error);
              }
            }
          })();
        } else {
          workingCopyResolve = workingCopy.resolve(resolveOptions);
        }
      } else {
        workingCopyResolve = Promise.resolve();
      }
    } else {
      didCreateWorkingCopy = true;
      workingCopy = new StoredFileWorkingCopy(
        this.workingCopyTypeId,
        resource,
        this.labelService.getUriBasenameLabel(resource),
        this.modelFactory,
        async (options2) => {
          await this.resolve(resource, { ...options2, reload: { async: false } });
        },
        this.fileService,
        this.logService,
        this.workingCopyFileService,
        this.filesConfigurationService,
        this.workingCopyBackupService,
        this.workingCopyService,
        this.notificationService,
        this.workingCopyEditorService,
        this.editorService,
        this.elevatedFileService,
        this.progressService
      );
      workingCopyResolve = workingCopy.resolve(resolveOptions);
      this.registerWorkingCopy(workingCopy);
    }
    this.mapResourceToPendingWorkingCopyResolve.set(resource, workingCopyResolve);
    this.add(resource, workingCopy);
    if (didCreateWorkingCopy) {
      if (workingCopy.isDirty()) {
        this._onDidChangeDirty.fire(workingCopy);
      }
    }
    try {
      await workingCopyResolve;
    } catch (error) {
      if (didCreateWorkingCopy) {
        workingCopy.dispose();
      }
      throw error;
    } finally {
      this.mapResourceToPendingWorkingCopyResolve.delete(resource);
    }
    if (didCreateWorkingCopy && workingCopy.isDirty()) {
      this._onDidChangeDirty.fire(workingCopy);
    }
    return workingCopy;
  }
  joinPendingResolves(resource) {
    const pendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
    if (!pendingWorkingCopyResolve) {
      return;
    }
    return this.doJoinPendingResolves(resource);
  }
  async doJoinPendingResolves(resource) {
    let currentWorkingCopyResolve;
    while (this.mapResourceToPendingWorkingCopyResolve.has(resource)) {
      const nextPendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
      if (nextPendingWorkingCopyResolve === currentWorkingCopyResolve) {
        return;
      }
      currentWorkingCopyResolve = nextPendingWorkingCopyResolve;
      try {
        await nextPendingWorkingCopyResolve;
      } catch (error) {
      }
    }
  }
  registerWorkingCopy(workingCopy) {
    const workingCopyListeners = new DisposableStore();
    workingCopyListeners.add(workingCopy.onDidResolve(() => this._onDidResolve.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidSaveError(() => this._onDidSaveError.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidSave((e) => this._onDidSave.fire({ workingCopy, ...e })));
    workingCopyListeners.add(workingCopy.onDidRevert(() => this._onDidRevert.fire(workingCopy)));
    this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);
  }
  remove(resource) {
    const removed = super.remove(resource);
    const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
    if (workingCopyListener) {
      dispose(workingCopyListener);
      this.mapResourceToWorkingCopyListeners.delete(resource);
    }
    if (removed) {
      this._onDidRemove.fire(resource);
    }
    return removed;
  }
  //#endregion
  //#region Lifecycle
  canDispose(workingCopy) {
    if (workingCopy.isDisposed() || !this.mapResourceToPendingWorkingCopyResolve.has(workingCopy.resource) && !workingCopy.isDirty()) {
      return true;
    }
    return this.doCanDispose(workingCopy);
  }
  async doCanDispose(workingCopy) {
    const pendingResolve = this.joinPendingResolves(workingCopy.resource);
    if (pendingResolve) {
      await pendingResolve;
      return this.canDispose(workingCopy);
    }
    if (workingCopy.isDirty()) {
      await Event.toPromise(workingCopy.onDidChangeDirty);
      return this.canDispose(workingCopy);
    }
    return true;
  }
  dispose() {
    super.dispose();
    this.mapResourceToPendingWorkingCopyResolve.clear();
    dispose(this.mapResourceToWorkingCopyListeners.values());
    this.mapResourceToWorkingCopyListeners.clear();
  }
  //#endregion
};
StoredFileWorkingCopyManager = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IWorkingCopyFileService),
  __decorateParam(7, IWorkingCopyBackupService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IWorkingCopyEditorService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IElevatedFileService),
  __decorateParam(15, IProgressService)
], StoredFileWorkingCopyManager);
export {
  StoredFileWorkingCopyManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFxzdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFN0b3JlZEZpbGVXb3JraW5nQ29weSwgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUsIElTdG9yZWRGaWxlV29ya2luZ0NvcHksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeSwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50IGFzIElCYXNlU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50IH0gZnJvbSAnLi9zdG9yZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFJlc291cmNlUXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgRmlsZU9wZXJhdGlvbiwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgV29ya2luZ0NvcHlGaWxlRXZlbnQgfSBmcm9tICcuL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBCYXNlRmlsZVdvcmtpbmdDb3B5TWFuYWdlciwgSUJhc2VGaWxlV29ya2luZ0NvcHlNYW5hZ2VyIH0gZnJvbSAnLi9hYnN0cmFjdEZpbGVXb3JraW5nQ29weU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWxldmF0ZWRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9lbGV2YXRlZEZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTbmFwc2hvdENvbnRleHQgfSBmcm9tICcuL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcblxuLyoqXG4gKiBUaGUgb25seSBvbmUgdGhhdCBzaG91bGQgYmUgZGVhbGluZyB3aXRoIGBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5YCBhbmQgaGFuZGxlIGFsbFxuICogb3BlcmF0aW9ucyB0aGF0IGFyZSB3b3JraW5nIGNvcHkgcmVsYXRlZCwgc3VjaCBhcyBzYXZlL3JldmVydCwgYmFja3VwXG4gKiBhbmQgcmVzb2x2aW5nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPE0gZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgSUJhc2VGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPE0sIElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+IHtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2FzIHJlc29sdmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlOiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgY2hhbmdlZCBpdCdzIGRpcnR5IHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eTogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNoYW5nZWQgaXQncyByZWFkb25seSBzdGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHk6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBjaGFuZ2VkIGl0J3Mgb3JwaGFuZWQgc3RhdGUuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9ycGhhbmVkOiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgZmFpbGVkIHRvIHNhdmUuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhdmVFcnJvcjogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHN1Y2Nlc3NmdWxseSBzYXZlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudDxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdhcyByZXZlcnRlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0OiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgcmVtb3ZlZCBmcm9tIHRoZSBtYW5hZ2VyLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZW1vdmU6IEV2ZW50PFVSST47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byByZXNvbHZlIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5LiBJZiB0aGUgbWFuYWdlciBhbHJlYWR5IGtub3dzXG5cdCAqIGFib3V0IGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggdGhlIHNhbWUgYFVSSWAsIGl0IHdpbGwgcmV0dXJuIHRoYXRcblx0ICogZXhpc3Rpbmcgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5LiBUaGVyZSB3aWxsIG5ldmVyIGJlIG1vcmUgdGhhbiBvbmVcblx0ICogc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHBlciBgVVJJYCB1bnRpbCB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlzXG5cdCAqIGRpc3Bvc2VkLlxuXHQgKlxuXHQgKiBVc2UgdGhlIGBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMucmVsb2FkYCBvcHRpb24gdG8gY29udHJvbCB0aGVcblx0ICogYmVoYXZpb3VyIGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdhcyBwcmV2aW91c2x5IGFscmVhZHkgcmVzb2x2ZWRcblx0ICogd2l0aCByZWdhcmRzIHRvIHJlc29sdmluZyBpdCBhZ2FpbiBmcm9tIHRoZSB1bmRlcmx5aW5nIGZpbGUgcmVzb3VyY2Vcblx0ICogb3Igbm90LlxuXHQgKlxuXHQgKiBOb3RlOiBDYWxsZXJzIG11c3QgYGRpc3Bvc2VgIHRoZSB3b3JraW5nIGNvcHkgd2hlbiBubyBsb25nZXIgbmVlZGVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gcmVzb3VyY2UgdXNlZCBhcyB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGluXG5cdCAqIGNhc2Ugb25lIGlzIGFscmVhZHkga25vd24gZm9yIHRoaXMgYFVSSWAuXG5cdCAqIEBwYXJhbSBvcHRpb25zXG5cdCAqL1xuXHRyZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlclJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PjtcblxuXHQvKipcblx0ICogV2FpdHMgZm9yIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgdG8gYmUgcmVhZHkgdG8gYmUgZGlzcG9zZWQuIFRoZXJlIG1heSBiZVxuXHQgKiBjb25kaXRpb25zIHVuZGVyIHdoaWNoIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgY2Fubm90IGJlIGRpc3Bvc2VkLCBlLmcuIHdoZW5cblx0ICogaXQgaXMgZGlydHkuIE9uY2UgdGhlIHByb21pc2UgaXMgc2V0dGxlZCwgaXQgaXMgc2FmZSB0byBkaXNwb3NlLlxuXHQgKi9cblx0Y2FuRGlzcG9zZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPik6IHRydWUgfCBQcm9taXNlPHRydWU+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQ8TSBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBJQmFzZVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgdGhhdCB3YXMgc3VjY2Vzc2Z1bGx5IHNhdmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXJSZXNvbHZlT3B0aW9ucyBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIElmIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2FzIGFscmVhZHkgcmVzb2x2ZWQgYmVmb3JlLFxuXHQgKiBhbGxvd3MgdG8gdHJpZ2dlciBhIHJlbG9hZCBvZiBpdCB0byBmZXRjaCB0aGUgbGF0ZXN0IGNvbnRlbnRzLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVsb2FkPzoge1xuXG5cdFx0LyoqXG5cdFx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgcmVsb2FkIGhhcHBlbnMgaW4gdGhlIGJhY2tncm91bmRcblx0XHQgKiBvciB3aGV0aGVyIGByZXNvbHZlYCB3aWxsIGF3YWl0IHRoZSByZWxvYWQgdG8gaGFwcGVuLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IGFzeW5jOiBib29sZWFuO1xuXG5cdFx0LyoqXG5cdFx0ICogQ29udHJvbHMgd2hldGhlciB0byBmb3JjZSByZWFkaW5nIHRoZSBjb250ZW50cyBmcm9tIHRoZVxuXHRcdCAqIHVuZGVybHlpbmcgcmVzb3VyY2UgZXZlbiBpZiB0aGUgcmVzb3VyY2UgZGlkIG5vdCBjaGFuZ2UuXG5cdFx0ICovXG5cdFx0cmVhZG9ubHkgZm9yY2U/OiBib29sZWFuO1xuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIEJhc2VGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPE0sIElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8TT4ge1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlID0gdGhpcy5fb25EaWRSZXNvbHZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9ycGhhbmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9vbkRpZENoYW5nZU9ycGhhbmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZUVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZUVycm9yID0gdGhpcy5fb25EaWRTYXZlRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudDxNPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZSA9IHRoaXMuX29uRGlkU2F2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmVydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmVydCA9IHRoaXMuX29uRGlkUmV2ZXJ0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmUgPSB0aGlzLl9vbkRpZFJlbW92ZS5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZSA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPHZvaWQ+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlSZXNvbHZlUXVldWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VRdWV1ZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5VHlwZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbEZhY3Rvcnk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8TT4sXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUVkaXRvclNlcnZpY2U6IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFbGV2YXRlZEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWxldmF0ZWRGaWxlU2VydmljZTogSUVsZXZhdGVkRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIHdvcmtpbmcgY29waWVzIGZyb20gZmlsZSBjaGFuZ2UgZXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZpbGVzQ2hhbmdlKGUpKSk7XG5cblx0XHQvLyBGaWxlIHN5c3RlbSBwcm92aWRlciBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlID0+IHRoaXMub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyhlID0+IHRoaXMub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUpKSk7XG5cblx0XHQvLyBXb3JraW5nIGNvcHkgb3BlcmF0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLm9uRGlkRmFpbFdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHRoaXMub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSkpKTtcblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZXZlbnQgPT4gZXZlbnQudmV0byh0aGlzLm9uQmVmb3JlU2h1dGRvd25XZWIoKSwgJ3ZldG8uZmlsZVdvcmtpbmdDb3B5TWFuYWdlcicpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bihldmVudCA9PiBldmVudC5qb2luKHRoaXMub25XaWxsU2h1dGRvd25EZXNrdG9wKCksIHsgaWQ6ICdqb2luLmZpbGVXb3JraW5nQ29weU1hbmFnZXInLCBsYWJlbDogbG9jYWxpemUoJ2pvaW4uZmlsZVdvcmtpbmdDb3B5TWFuYWdlcicsIFwiU2F2aW5nIHdvcmtpbmcgY29waWVzXCIpIH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkJlZm9yZVNodXRkb3duV2ViKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLndvcmtpbmdDb3BpZXMuc29tZSh3b3JraW5nQ29weSA9PiB3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpKSkge1xuXHRcdFx0Ly8gc3RvcmVkIGZpbGUgd29ya2luZyBjb3BpZXMgYXJlIHBlbmRpbmcgdG8gYmUgc2F2ZWQ6XG5cdFx0XHQvLyB2ZXRvIGJlY2F1c2Ugd2ViIGRvZXMgbm90IHN1cHBvcnQgbG9uZyBydW5uaW5nIHNodXRkb3duXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uV2lsbFNodXRkb3duRGVza3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcGVuZGluZ1NhdmVkV29ya2luZ0NvcGllczogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPltdO1xuXG5cdFx0Ly8gQXMgbG9uZyBhcyBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcGllcyBhcmUgcGVuZGluZyB0byBiZSBzYXZlZCwgd2UgcHJvbG9uZyB0aGUgc2h1dGRvd25cblx0XHQvLyB1bnRpbCB0aGF0IGhhcyBoYXBwZW5lZCB0byBlbnN1cmUgd2UgYXJlIG5vdCBzaHV0dGluZyBkb3duIGluIHRoZSBtaWRkbGUgb2Zcblx0XHQvLyB3cml0aW5nIHRvIHRoZSB3b3JraW5nIGNvcHkgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTY2MDApLlxuXHRcdHdoaWxlICgocGVuZGluZ1NhdmVkV29ya2luZ0NvcGllcyA9IHRoaXMud29ya2luZ0NvcGllcy5maWx0ZXIod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSkpLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQocGVuZGluZ1NhdmVkV29ya2luZ0NvcGllcy5tYXAod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuam9pblN0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlBFTkRJTkdfU0FWRSkpKTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gUmVzb2x2ZSBmcm9tIGZpbGUgb3IgZmlsZSBwcm92aWRlciBjaGFuZ2VzXG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlOiBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIFJlc29sdmUgd29ya2luZyBjb3BpZXMgYWdhaW4gZm9yIGZpbGUgc3lzdGVtcyB0aGF0IGNoYW5nZWRcblx0XHQvLyBjYXBhYmlsaXRpZXMgdG8gZmV0Y2ggbGF0ZXN0IG1ldGFkYXRhIChlLmcuIHJlYWRvbmx5KVxuXHRcdC8vIGludG8gYWxsIHdvcmtpbmcgY29waWVzLlxuXHRcdHRoaXMucXVldWVXb3JraW5nQ29weVJlbG9hZHMoZS5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZTogSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFlLmFkZGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgaWYgYWRkZWRcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHdvcmtpbmcgY29waWVzIGFnYWluIGZvciBmaWxlIHN5c3RlbXMgdGhhdCByZWdpc3RlcmVkXG5cdFx0Ly8gdG8gYWNjb3VudCBmb3IgY2FwYWJpbGl0eSBjaGFuZ2VzOiBleHRlbnNpb25zIG1heSB1bnJlZ2lzdGVyXG5cdFx0Ly8gYW5kIHJlZ2lzdGVyIHRoZSBzYW1lIHByb3ZpZGVyIHdpdGggZGlmZmVyZW50IGNhcGFiaWxpdGllcyxcblx0XHQvLyBzbyB3ZSB3YW50IHRvIGVuc3VyZSB0byBmZXRjaCBsYXRlc3QgbWV0YWRhdGEgKGUuZy4gcmVhZG9ubHkpXG5cdFx0Ly8gaW50byBhbGwgd29ya2luZyBjb3BpZXMuXG5cdFx0dGhpcy5xdWV1ZVdvcmtpbmdDb3B5UmVsb2FkcyhlLnNjaGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRmlsZXNDaGFuZ2UoZTogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gVHJpZ2dlciBhIHJlc29sdmUgZm9yIGFueSB1cGRhdGUgb3IgYWRkIGV2ZW50IHRoYXQgaW1wYWN0c1xuXHRcdC8vIHRoZSB3b3JraW5nIGNvcHkuIFdlIGFsc28gY29uc2lkZXIgdGhlIGFkZGVkIGV2ZW50XG5cdFx0Ly8gYmVjYXVzZSBpdCBjb3VsZCBiZSB0aGF0IGEgZmlsZSB3YXMgYWRkZWQgYW5kIHVwZGF0ZWRcblx0XHQvLyByaWdodCBhZnRlci5cblx0XHR0aGlzLnF1ZXVlV29ya2luZ0NvcHlSZWxvYWRzKGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBxdWV1ZVdvcmtpbmdDb3B5UmVsb2FkcyhzY2hlbWU6IHN0cmluZyk6IHZvaWQ7XG5cdHByaXZhdGUgcXVldWVXb3JraW5nQ29weVJlbG9hZHMoZTogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQ7XG5cdHByaXZhdGUgcXVldWVXb3JraW5nQ29weVJlbG9hZHMoc2NoZW1lT3JFdmVudDogc3RyaW5nIHwgRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2YgdGhpcy53b3JraW5nQ29waWVzKSB7XG5cdFx0XHRpZiAod29ya2luZ0NvcHkuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBuZXZlciByZWxvYWQgZGlydHkgd29ya2luZyBjb3BpZXNcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc29sdmVXb3JraW5nQ29weSA9IGZhbHNlO1xuXHRcdFx0aWYgKHR5cGVvZiBzY2hlbWVPckV2ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXNvbHZlV29ya2luZ0NvcHkgPSBzY2hlbWVPckV2ZW50ID09PSB3b3JraW5nQ29weS5yZXNvdXJjZS5zY2hlbWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlV29ya2luZ0NvcHkgPSBzY2hlbWVPckV2ZW50LmNvbnRhaW5zKHdvcmtpbmdDb3B5LnJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvbHZlV29ya2luZ0NvcHkpIHtcblx0XHRcdFx0dGhpcy5xdWV1ZVdvcmtpbmdDb3B5UmVsb2FkKHdvcmtpbmdDb3B5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHF1ZXVlV29ya2luZ0NvcHlSZWxvYWQod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4pOiB2b2lkIHtcblxuXHRcdC8vIFJlc29sdmVzIGEgd29ya2luZyBjb3B5IHRvIHVwZGF0ZSAodXNlIGEgcXVldWUgdG8gcHJldmVudCBhY2N1bXVsYXRpb24gb2Zcblx0XHQvLyByZXNvbHZlIHdoZW4gdGhlIHJlc29sdmluZyBhY3R1YWxseSB0YWtlcyBsb25nLiBBdCBtb3N0IHdlIG9ubHkgd2FudCB0aGVcblx0XHQvLyBxdWV1ZSB0byBoYXZlIGEgc2l6ZSBvZiAyICgxIHJ1bm5pbmcgcmVzb2x2ZSBhbmQgMSBxdWV1ZWQgcmVzb2x2ZSkuXG5cdFx0Y29uc3QgcXVldWVTaXplID0gdGhpcy53b3JraW5nQ29weVJlc29sdmVRdWV1ZS5xdWV1ZVNpemUod29ya2luZ0NvcHkucmVzb3VyY2UpO1xuXHRcdGlmIChxdWV1ZVNpemUgPD0gMSkge1xuXHRcdFx0dGhpcy53b3JraW5nQ29weVJlc29sdmVRdWV1ZS5xdWV1ZUZvcih3b3JraW5nQ29weS5yZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV29ya2luZyBDb3B5IEZpbGUgRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBDb3JyZWxhdGlvbklkVG9Xb3JraW5nQ29waWVzVG9SZXN0b3JlID0gbmV3IE1hcDxudW1iZXIsIHsgc291cmNlOiBVUkk7IHRhcmdldDogVVJJOyBzbmFwc2hvdD86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfVtdPigpO1xuXG5cdHByaXZhdGUgb25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGU6IFdvcmtpbmdDb3B5RmlsZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIC8gQ29weTogcmVtZW1iZXIgd29ya2luZyBjb3BpZXMgdG8gcmVzdG9yZSBhZnRlciB0aGUgb3BlcmF0aW9uXG5cdFx0aWYgKGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLk1PVkUgfHwgZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkge1xuXHRcdFx0ZS53YWl0VW50aWwoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgd29ya2luZ0NvcGllc1RvUmVzdG9yZTogeyBzb3VyY2U6IFVSSTsgdGFyZ2V0OiBVUkk7IHNuYXBzaG90PzogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9W10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHsgc291cmNlLCB0YXJnZXQgfSBvZiBlLmZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGlmIHJlc291cmNlcyBhcmUgY29uc2lkZXJlZCBlcXVhbFxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBGaW5kIGFsbCB3b3JraW5nIGNvcGllcyB0aGF0IHJlbGF0ZWQgdG8gc291cmNlIChjYW4gYmUgbWFueSBpZiByZXNvdXJjZSBpcyBhIGZvbGRlcilcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZVdvcmtpbmdDb3BpZXM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT5bXSA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB0aGlzLndvcmtpbmdDb3BpZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQod29ya2luZ0NvcHkucmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2VXb3JraW5nQ29waWVzLnB1c2god29ya2luZ0NvcHkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFJlbWVtYmVyIGVhY2ggc291cmNlIHdvcmtpbmcgY29weSB0byBsb2FkIGFnYWluIGFmdGVyIG1vdmUgaXMgZG9uZVxuXHRcdFx0XHRcdFx0Ly8gd2l0aCBvcHRpb25hbCBjb250ZW50IHRvIHJlc3RvcmUgaWYgaXQgd2FzIGRpcnR5XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNvdXJjZVdvcmtpbmdDb3B5IG9mIHNvdXJjZVdvcmtpbmdDb3BpZXMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlUmVzb3VyY2UgPSBzb3VyY2VXb3JraW5nQ29weS5yZXNvdXJjZTtcblxuXHRcdFx0XHRcdFx0XHQvLyBJZiB0aGUgc291cmNlIGlzIHRoZSBhY3R1YWwgd29ya2luZyBjb3B5LCBqdXN0IHVzZSB0YXJnZXQgYXMgbmV3IHJlc291cmNlXG5cdFx0XHRcdFx0XHRcdGxldCB0YXJnZXRSZXNvdXJjZTogVVJJO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlUmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0XHR0YXJnZXRSZXNvdXJjZSA9IHRhcmdldDtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdC8vIE90aGVyd2lzZSBhIHBhcmVudCBmb2xkZXIgb2YgdGhlIHNvdXJjZSBpcyBiZWluZyBtb3ZlZCwgc28gd2UgbmVlZFxuXHRcdFx0XHRcdFx0XHQvLyB0byBjb21wdXRlIHRoZSB0YXJnZXQgcmVzb3VyY2UgYmFzZWQgb24gdGhhdFxuXHRcdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0YXJnZXRSZXNvdXJjZSA9IGpvaW5QYXRoKHRhcmdldCwgc291cmNlUmVzb3VyY2UucGF0aC5zdWJzdHIoc291cmNlLnBhdGgubGVuZ3RoICsgMSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0d29ya2luZ0NvcGllc1RvUmVzdG9yZS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2U6IHNvdXJjZVJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdHRhcmdldDogdGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0c25hcHNob3Q6IHNvdXJjZVdvcmtpbmdDb3B5LmlzRGlydHkoKSA/IGF3YWl0IHNvdXJjZVdvcmtpbmdDb3B5Lm1vZGVsPy5zbmFwc2hvdChTbmFwc2hvdENvbnRleHQuU2F2ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgOiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Xb3JraW5nQ29waWVzVG9SZXN0b3JlLnNldChlLmNvcnJlbGF0aW9uSWQsIHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUpO1xuXHRcdFx0fSkoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZTogV29ya2luZ0NvcHlGaWxlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIE1vdmUgLyBDb3B5OiByZXN0b3JlIGRpcnR5IGZsYWcgb24gd29ya2luZyBjb3BpZXMgdG8gcmVzdG9yZSB0aGF0IHdlcmUgZGlydHlcblx0XHRpZiAoKGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLk1PVkUgfHwgZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkpIHtcblx0XHRcdGNvbnN0IHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUgPSB0aGlzLm1hcENvcnJlbGF0aW9uSWRUb1dvcmtpbmdDb3BpZXNUb1Jlc3RvcmUuZ2V0KGUuY29ycmVsYXRpb25JZCk7XG5cdFx0XHRpZiAod29ya2luZ0NvcGllc1RvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLm1hcENvcnJlbGF0aW9uSWRUb1dvcmtpbmdDb3BpZXNUb1Jlc3RvcmUuZGVsZXRlKGUuY29ycmVsYXRpb25JZCk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29waWVzVG9SZXN0b3JlKSB7XG5cblx0XHRcdFx0XHQvLyBTbmFwc2hvdCBwcmVzZW5jZSBtZWFucyB0aGlzIHdvcmtpbmcgY29weSB1c2VkIHRvIGJlIG1vZGlmaWVkIGFuZCBzbyB3ZSByZXN0b3JlIHRoYXRcblx0XHRcdFx0XHQvLyBmbGFnLiB3ZSBkbyBOT1QgaGF2ZSB0byByZXN0b3JlIHRoZSBjb250ZW50IGJlY2F1c2UgdGhlIHdvcmtpbmcgY29weSB3YXMgb25seSBzb2Z0XG5cdFx0XHRcdFx0Ly8gcmV2ZXJ0ZWQgYW5kIGRpZCBub3QgbG9vc2UgaXRzIG9yaWdpbmFsIG1vZGlmaWVkIGNvbnRlbnRzLlxuXG5cdFx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5LnNuYXBzaG90KSB7XG5cdFx0XHRcdFx0XHR0aGlzLmdldCh3b3JraW5nQ29weS5zb3VyY2UpPy5tYXJrTW9kaWZpZWQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGU6IFdvcmtpbmdDb3B5RmlsZUV2ZW50KTogdm9pZCB7XG5cdFx0c3dpdGNoIChlLm9wZXJhdGlvbikge1xuXG5cdFx0XHQvLyBDcmVhdGU6IFJldmVydCBleGlzdGluZyB3b3JraW5nIGNvcGllc1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkNSRUFURTpcblx0XHRcdFx0ZS53YWl0VW50aWwoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsgdGFyZ2V0IH0gb2YgZS5maWxlcykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSB0aGlzLmdldCh0YXJnZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5ICYmICF3b3JraW5nQ29weS5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdC8vIE1vdmUvQ29weTogcmVzdG9yZSB3b3JraW5nIGNvcGllcyB0aGF0IHdlcmUgbG9hZGVkIGJlZm9yZSB0aGUgb3BlcmF0aW9uIHRvb2sgcGxhY2Vcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5NT1ZFOlxuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkNPUFk6XG5cdFx0XHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya2luZ0NvcGllc1RvUmVzdG9yZSA9IHRoaXMubWFwQ29ycmVsYXRpb25JZFRvV29ya2luZ0NvcGllc1RvUmVzdG9yZS5nZXQoZS5jb3JyZWxhdGlvbklkKTtcblx0XHRcdFx0XHRpZiAod29ya2luZ0NvcGllc1RvUmVzdG9yZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Xb3JraW5nQ29waWVzVG9SZXN0b3JlLmRlbGV0ZShlLmNvcnJlbGF0aW9uSWQpO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUubWFwKGFzeW5jIHdvcmtpbmdDb3B5VG9SZXN0b3JlID0+IHtcblxuXHRcdFx0XHRcdFx0XHQvLyBGcm9tIHRoaXMgbW9tZW50IG9uLCBvbmx5IG9wZXJhdGUgb24gdGhlIGNhbm9uaWNhbCByZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHQvLyB0byBmaXggYSBwb3RlbnRpYWwgZGF0YSBsb3NzIGlzc3VlOlxuXHRcdFx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjExMzc0XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKHdvcmtpbmdDb3B5VG9SZXN0b3JlLnRhcmdldCk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgd29ya2luZyBjb3B5IGF0IHRoZSB0YXJnZXQuIGlmIHdlIGhhdmUgcHJldmlvdXMgZGlydHkgY29udGVudCwgd2UgcGFzcyBpdFxuXHRcdFx0XHRcdFx0XHQvLyBvdmVyIHRvIGJlIHVzZWQsIG90aGVyd2lzZSB3ZSBmb3JjZSBhIHJlbG9hZCBmcm9tIGRpc2suIHRoaXMgaXMgaW1wb3J0YW50XG5cdFx0XHRcdFx0XHRcdC8vIGJlY2F1c2Ugd2Uga25vdyB0aGUgZmlsZSBoYXMgY2hhbmdlZCBvbiBkaXNrIGFmdGVyIHRoZSBtb3ZlIGFuZCB0aGUgd29ya2luZyBjb3B5IG1pZ2h0XG5cdFx0XHRcdFx0XHRcdC8vIGhhdmUgc3RpbGwgZXhpc3RlZCB3aXRoIHRoZSBwcmV2aW91cyBzdGF0ZS4gdGhpcyBlbnN1cmVzIHRoYXQgdGhlIHdvcmtpbmcgY29weSBpcyBub3Rcblx0XHRcdFx0XHRcdFx0Ly8gdHJhY2tpbmcgYSBzdGFsZSBzdGF0ZS5cblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXNvbHZlKHRhcmdldCwge1xuXHRcdFx0XHRcdFx0XHRcdHJlbG9hZDogeyBhc3luYzogZmFsc2UgfSwgLy8gZW5mb3JjZSBhIHJlbG9hZFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiB3b3JraW5nQ29weVRvUmVzdG9yZS5zbmFwc2hvdFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVsb2FkICYgUmVzb2x2ZVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBBd2FpdCBhIHBlbmRpbmcgd29ya2luZyBjb3B5IHJlc29sdmUgZmlyc3QgYmVmb3JlIHByb2NlZWRpbmdcblx0XHQvLyB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciByZXNvbHZlIGEgd29ya2luZyBjb3B5IG1vcmUgdGhhbiBvbmNlXG5cdFx0Ly8gaW4gcGFyYWxsZWwuXG5cdFx0YXdhaXQgdGhpcy5qb2luUGVuZGluZ1Jlc29sdmVzKHdvcmtpbmdDb3B5LnJlc291cmNlKTtcblxuXHRcdGlmICh3b3JraW5nQ29weS5pc0RpcnR5KCkgfHwgd29ya2luZ0NvcHkuaXNEaXNwb3NlZCgpIHx8ICF0aGlzLmhhcyh3b3JraW5nQ29weS5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjsgLy8gdGhlIHdvcmtpbmcgY29weSBwb3NzaWJseSBnb3QgZGlydHkgb3IgZGlzcG9zZWQsIHNvIHJldHVybiBlYXJseSB0aGVuXG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByZWxvYWRcblx0XHRhd2FpdCB0aGlzLmRvUmVzb2x2ZSh3b3JraW5nQ29weSwgeyByZWxvYWQ6IHsgYXN5bmM6IGZhbHNlIH0gfSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlclJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PiB7XG5cblx0XHQvLyBBd2FpdCBhIHBlbmRpbmcgd29ya2luZyBjb3B5IHJlc29sdmUgZmlyc3QgYmVmb3JlIHByb2NlZWRpbmdcblx0XHQvLyB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciByZXNvbHZlIGEgd29ya2luZyBjb3B5IG1vcmUgdGhhbiBvbmNlXG5cdFx0Ly8gaW4gcGFyYWxsZWwuXG5cdFx0Y29uc3QgcGVuZGluZ1Jlc29sdmUgPSB0aGlzLmpvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVzb2x2ZSkge1xuXHRcdFx0YXdhaXQgcGVuZGluZ1Jlc29sdmU7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByZXNvbHZlXG5cdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlKHJlc291cmNlT3JXb3JraW5nQ29weTogVVJJIHwgSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPiwgb3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+IHtcblx0XHRsZXQgd29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlc291cmNlOiBVUkk7XG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yV29ya2luZ0NvcHkpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlc291cmNlT3JXb3JraW5nQ29weTtcblx0XHRcdHdvcmtpbmdDb3B5ID0gdGhpcy5nZXQocmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlc291cmNlT3JXb3JraW5nQ29weS5yZXNvdXJjZTtcblx0XHRcdHdvcmtpbmdDb3B5ID0gcmVzb3VyY2VPcldvcmtpbmdDb3B5O1xuXHRcdH1cblxuXHRcdGxldCB3b3JraW5nQ29weVJlc29sdmU6IFByb21pc2U8dm9pZD47XG5cdFx0bGV0IGRpZENyZWF0ZVdvcmtpbmdDb3B5ID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXNvbHZlT3B0aW9uczogSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zID0ge1xuXHRcdFx0Y29udGVudHM6IG9wdGlvbnM/LmNvbnRlbnRzLFxuXHRcdFx0Zm9yY2VSZWFkRnJvbUZpbGU6IG9wdGlvbnM/LnJlbG9hZD8uZm9yY2UsXG5cdFx0XHRsaW1pdHM6IG9wdGlvbnM/LmxpbWl0c1xuXHRcdH07XG5cblx0XHQvLyBXb3JraW5nIGNvcHkgZXhpc3RzXG5cdFx0aWYgKHdvcmtpbmdDb3B5KSB7XG5cblx0XHRcdC8vIEFsd2F5cyByZWxvYWQgaWYgY29udGVudHMgYXJlIHByb3ZpZGVkXG5cdFx0XHRpZiAob3B0aW9ucz8uY29udGVudHMpIHtcblx0XHRcdFx0d29ya2luZ0NvcHlSZXNvbHZlID0gd29ya2luZ0NvcHkucmVzb2x2ZShyZXNvbHZlT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbG9hZCBhc3luYyBvciBzeW5jIGJhc2VkIG9uIG9wdGlvbnNcblx0XHRcdGVsc2UgaWYgKG9wdGlvbnM/LnJlbG9hZCkge1xuXG5cdFx0XHRcdC8vIEFzeW5jIHJlbG9hZDogdHJpZ2dlciBhIHJlbG9hZCBidXQgcmV0dXJuIGltbWVkaWF0ZWx5XG5cdFx0XHRcdGlmIChvcHRpb25zLnJlbG9hZC5hc3luYykge1xuXHRcdFx0XHRcdHdvcmtpbmdDb3B5UmVzb2x2ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKHJlc29sdmVPcHRpb25zKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghd29ya2luZ0NvcHkuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpOyAvLyBvbmx5IGxvZyBpZiB0aGUgd29ya2luZyBjb3B5IGlzIHN0aWxsIGFyb3VuZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFN5bmMgcmVsb2FkOiBkbyBub3QgcmV0dXJuIHVudGlsIHdvcmtpbmcgY29weSByZWxvYWRlZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR3b3JraW5nQ29weVJlc29sdmUgPSB3b3JraW5nQ29weS5yZXNvbHZlKHJlc29sdmVPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3QgcmVsb2FkXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0d29ya2luZ0NvcHlSZXNvbHZlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGRvZXMgbm90IGV4aXN0XG5cdFx0ZWxzZSB7XG5cdFx0XHRkaWRDcmVhdGVXb3JraW5nQ29weSA9IHRydWU7XG5cblx0XHRcdHdvcmtpbmdDb3B5ID0gbmV3IFN0b3JlZEZpbGVXb3JraW5nQ29weShcblx0XHRcdFx0dGhpcy53b3JraW5nQ29weVR5cGVJZCxcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2UpLFxuXHRcdFx0XHR0aGlzLm1vZGVsRmFjdG9yeSxcblx0XHRcdFx0YXN5bmMgb3B0aW9ucyA9PiB7IGF3YWl0IHRoaXMucmVzb2x2ZShyZXNvdXJjZSwgeyAuLi5vcHRpb25zLCByZWxvYWQ6IHsgYXN5bmM6IGZhbHNlIH0gfSk7IH0sXG5cdFx0XHRcdHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLCB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCB0aGlzLndvcmtpbmdDb3B5U2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLndvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLCB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2UsIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHR3b3JraW5nQ29weVJlc29sdmUgPSB3b3JraW5nQ29weS5yZXNvbHZlKHJlc29sdmVPcHRpb25zKTtcblxuXHRcdFx0dGhpcy5yZWdpc3RlcldvcmtpbmdDb3B5KHdvcmtpbmdDb3B5KTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSBwZW5kaW5nIHJlc29sdmUgdG8gYXZvaWQgcmFjZSBjb25kaXRpb25zXG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5zZXQocmVzb3VyY2UsIHdvcmtpbmdDb3B5UmVzb2x2ZSk7XG5cblx0XHQvLyBNYWtlIGtub3duIHRvIG1hbmFnZXIgKGlmIG5vdCBhbHJlYWR5IGtub3duKVxuXHRcdHRoaXMuYWRkKHJlc291cmNlLCB3b3JraW5nQ29weSk7XG5cblx0XHQvLyBFbWl0IHNvbWUgZXZlbnRzIGlmIHdlIGNyZWF0ZWQgdGhlIHdvcmtpbmcgY29weVxuXHRcdGlmIChkaWRDcmVhdGVXb3JraW5nQ29weSkge1xuXG5cdFx0XHQvLyBJZiB0aGUgd29ya2luZyBjb3B5IGlzIGRpcnR5IHJpZ2h0IGZyb20gdGhlIGJlZ2lubmluZyxcblx0XHRcdC8vIG1ha2Ugc3VyZSB0byBlbWl0IHRoaXMgYXMgYW4gZXZlbnRcblx0XHRcdGlmICh3b3JraW5nQ29weS5pc0RpcnR5KCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKHdvcmtpbmdDb3B5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHlSZXNvbHZlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgZGlzcG9zZSB0aGUgd29ya2luZyBjb3B5IGlmIHdlIGNyZWF0ZWRcblx0XHRcdC8vIGl0IGJlY2F1c2Ugd2UgY2Fubm90IGRpc3Bvc2UgYSB3b3JraW5nIGNvcHkgd2UgZG8gbm90XG5cdFx0XHQvLyBvd24gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzg4NTApXG5cdFx0XHRpZiAoZGlkQ3JlYXRlV29ya2luZ0NvcHkpIHtcblx0XHRcdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBwZW5kaW5nIHJlc29sdmVzXG5cdFx0XHR0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNhbiBiZSBkaXJ0eSBpZiBhIGJhY2t1cCB3YXMgcmVzdG9yZWQsIHNvIHdlIG1ha2Ugc3VyZSB0b1xuXHRcdC8vIGhhdmUgdGhpcyBldmVudCBkZWxpdmVyZWQgaWYgd2UgY3JlYXRlZCB0aGUgd29ya2luZyBjb3B5IGhlcmVcblx0XHRpZiAoZGlkQ3JlYXRlV29ya2luZ0NvcHkgJiYgd29ya2luZ0NvcHkuaXNEaXJ0eSgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUod29ya2luZ0NvcHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB3b3JraW5nQ29weTtcblx0fVxuXG5cdHByaXZhdGUgam9pblBlbmRpbmdSZXNvbHZlcyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZSA9IHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdXb3JraW5nQ29weVJlc29sdmUuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIXBlbmRpbmdXb3JraW5nQ29weVJlc29sdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb0pvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0pvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2hpbGUgd2UgaGF2ZSBwZW5kaW5nIHdvcmtpbmcgY29weSByZXNvbHZlcywgZW5zdXJlXG5cdFx0Ly8gdG8gYXdhaXQgdGhlIGxhc3Qgb25lIGZpbmlzaGluZyBiZWZvcmUgcmV0dXJuaW5nLlxuXHRcdC8vIFRoaXMgcHJldmVudHMgYSByYWNlIHdoZW4gbXVsdGlwbGUgY2xpZW50cyBhd2FpdFxuXHRcdC8vIHRoZSBwZW5kaW5nIHJlc29sdmUgYW5kIHRoZW4gYWxsIHRyaWdnZXIgdGhlIHJlc29sdmVcblx0XHQvLyBhdCB0aGUgc2FtZSB0aW1lLlxuXHRcdGxldCBjdXJyZW50V29ya2luZ0NvcHlSZXNvbHZlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdHdoaWxlICh0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IG5leHRQZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlID0gdGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG5leHRQZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlID09PSBjdXJyZW50V29ya2luZ0NvcHlSZXNvbHZlKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSBhd2FpdGVkIG9uIC0gcmV0dXJuXG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnRXb3JraW5nQ29weVJlc29sdmUgPSBuZXh0UGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG5leHRQZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWdub3JlIGFueSBlcnJvciBoZXJlLCBpdCB3aWxsIGJ1YmJsZSB0byB0aGUgb3JpZ2luYWwgcmVxdWVzdG9yXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcldvcmtpbmdDb3B5KHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+KTogdm9pZCB7XG5cblx0XHQvLyBJbnN0YWxsIHdvcmtpbmcgY29weSBsaXN0ZW5lcnNcblx0XHRjb25zdCB3b3JraW5nQ29weUxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR3b3JraW5nQ29weUxpc3RlbmVycy5hZGQod29ya2luZ0NvcHkub25EaWRSZXNvbHZlKCgpID0+IHRoaXMuX29uRGlkUmVzb2x2ZS5maXJlKHdvcmtpbmdDb3B5KSkpO1xuXHRcdHdvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh3b3JraW5nQ29weS5vbkRpZENoYW5nZURpcnR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSh3b3JraW5nQ29weSkpKTtcblx0XHR3b3JraW5nQ29weUxpc3RlbmVycy5hZGQod29ya2luZ0NvcHkub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUod29ya2luZ0NvcHkpKSk7XG5cdFx0d29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlT3JwaGFuZWQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VPcnBoYW5lZC5maXJlKHdvcmtpbmdDb3B5KSkpO1xuXHRcdHdvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmVFcnJvcigoKSA9PiB0aGlzLl9vbkRpZFNhdmVFcnJvci5maXJlKHdvcmtpbmdDb3B5KSkpO1xuXHRcdHdvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmUoZSA9PiB0aGlzLl9vbkRpZFNhdmUuZmlyZSh7IHdvcmtpbmdDb3B5LCAuLi5lIH0pKSk7XG5cdFx0d29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkUmV2ZXJ0KCgpID0+IHRoaXMuX29uRGlkUmV2ZXJ0LmZpcmUod29ya2luZ0NvcHkpKSk7XG5cblx0XHQvLyBLZWVwIGZvciBkaXNwb3NhbFxuXHRcdHRoaXMubWFwUmVzb3VyY2VUb1dvcmtpbmdDb3B5TGlzdGVuZXJzLnNldCh3b3JraW5nQ29weS5yZXNvdXJjZSwgd29ya2luZ0NvcHlMaXN0ZW5lcnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbW92ZShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IHN1cGVyLnJlbW92ZShyZXNvdXJjZSk7XG5cblx0XHQvLyBEaXNwb3NlIGFueSBleGlzdGluZyB3b3JraW5nIGNvcHkgbGlzdGVuZXJzXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlMaXN0ZW5lciA9IHRoaXMubWFwUmVzb3VyY2VUb1dvcmtpbmdDb3B5TGlzdGVuZXJzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKHdvcmtpbmdDb3B5TGlzdGVuZXIpIHtcblx0XHRcdGRpc3Bvc2Uod29ya2luZ0NvcHlMaXN0ZW5lcik7XG5cdFx0XHR0aGlzLm1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChyZW1vdmVkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlbW92ZS5maXJlKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVtb3ZlZDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBMaWZlY3ljbGVcblxuXHRjYW5EaXNwb3NlKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+KTogdHJ1ZSB8IFByb21pc2U8dHJ1ZT4ge1xuXG5cdFx0Ly8gUXVpY2sgcmV0dXJuIGlmIHdvcmtpbmcgY29weSBhbHJlYWR5IGRpc3Bvc2VkIG9yIG5vdCBkaXJ0eSBhbmQgbm90IHJlc29sdmluZ1xuXHRcdGlmIChcblx0XHRcdHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSB8fFxuXHRcdFx0KCF0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlLmhhcyh3b3JraW5nQ29weS5yZXNvdXJjZSkgJiYgIXdvcmtpbmdDb3B5LmlzRGlydHkoKSlcblx0XHQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFByb21pc2UgYmFzZWQgcmV0dXJuIGluIGFsbCBvdGhlciBjYXNlc1xuXHRcdHJldHVybiB0aGlzLmRvQ2FuRGlzcG9zZSh3b3JraW5nQ29weSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ2FuRGlzcG9zZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPik6IFByb21pc2U8dHJ1ZT4ge1xuXG5cdFx0Ly8gQXdhaXQgYW55IHBlbmRpbmcgcmVzb2x2ZXMgZmlyc3QgYmVmb3JlIHByb2NlZWRpbmdcblx0XHRjb25zdCBwZW5kaW5nUmVzb2x2ZSA9IHRoaXMuam9pblBlbmRpbmdSZXNvbHZlcyh3b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cdFx0aWYgKHBlbmRpbmdSZXNvbHZlKSB7XG5cdFx0XHRhd2FpdCBwZW5kaW5nUmVzb2x2ZTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuY2FuRGlzcG9zZSh3b3JraW5nQ29weSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlydHkgd29ya2luZyBjb3B5OiB3ZSBkbyBub3QgYWxsb3cgdG8gZGlzcG9zZSBkaXJ0eSB3b3JraW5nIGNvcHlzXG5cdFx0Ly8gdG8gcHJldmVudCBkYXRhIGxvc3MgY2FzZXMuIGRpcnR5IHdvcmtpbmcgY29weXMgY2FuIG9ubHkgYmUgZGlzcG9zZWQgd2hlblxuXHRcdC8vIHRoZXkgYXJlIGVpdGhlciBzYXZlZCBvciByZXZlcnRlZFxuXHRcdGlmICh3b3JraW5nQ29weS5pc0RpcnR5KCkpIHtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh3b3JraW5nQ29weS5vbkRpZENoYW5nZURpcnR5KTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuY2FuRGlzcG9zZSh3b3JraW5nQ29weSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIENsZWFyIHBlbmRpbmcgd29ya2luZyBjb3B5IHJlc29sdmVzXG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5jbGVhcigpO1xuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgd29ya2luZyBjb3B5IGNoYW5nZSBsaXN0ZW5lcnNcblx0XHRkaXNwb3NlKHRoaXMubWFwUmVzb3VyY2VUb1dvcmtpbmdDb3B5TGlzdGVuZXJzLnZhbHVlcygpKTtcblx0XHR0aGlzLm1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycy5jbGVhcigpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGVBQTRCO0FBQ3RELFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsdUJBQXVCLGtDQUF5TztBQUN6USxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFVBQVUscUJBQXFCO0FBQ3hDLFNBQTJCLGdCQUFnQixlQUFlLG9CQUFzRztBQUNoSyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFBcUQ7QUFDOUQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQ0FBK0Q7QUFDeEUsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBMkcx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
