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
import { DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { FileOperation, IFileService } from "../../../platform/files/common/files.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { localize } from "../../../nls.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IBulkEditService } from "../../../editor/browser/services/bulkEditService.js";
import { IProgressService, ProgressLocation } from "../../../platform/progress/common/progress.js";
import { raceCancellation } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../base/common/severity.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { reviveWorkspaceEditDto } from "./mainThreadBulkEdits.js";
import { URI } from "../../../base/common/uri.js";
let MainThreadFileSystemEventService = class {
  constructor(extHostContext, _fileService, workingCopyFileService, bulkEditService, progressService, dialogService, storageService, logService, envService, uriIdentService, _logService) {
    this._fileService = _fileService;
    this._logService = _logService;
    this._listener = new DisposableStore();
    this._watches = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);
    this._listener.add(_fileService.onDidFilesChange((event) => {
      this._proxy.$onFileEvent({
        created: event.rawAdded,
        changed: event.rawUpdated,
        deleted: event.rawDeleted
      });
    }));
    const that = this;
    const fileOperationParticipant = new class {
      async participate(files, operation, undoInfo, timeout, token) {
        if (undoInfo?.isUndoing) {
          return;
        }
        const cts = new CancellationTokenSource(token);
        const timer = setTimeout(() => cts.cancel(), timeout);
        const data = await progressService.withProgress({
          location: ProgressLocation.Notification,
          title: this._progressLabel(operation),
          cancellable: true,
          delay: Math.min(timeout / 2, 3e3)
        }, () => {
          const onWillEvent = that._proxy.$onWillRunFileOperation(operation, files, timeout, cts.token);
          return raceCancellation(onWillEvent, cts.token);
        }, () => {
          cts.cancel();
        }).finally(() => {
          cts.dispose();
          clearTimeout(timer);
        });
        if (!data || data.edit.edits.length === 0) {
          return;
        }
        const needsConfirmation = data.edit.edits.some((edit) => edit.metadata?.needsConfirmation);
        let showPreview = storageService.getBoolean(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);
        if (envService.extensionTestsLocationURI) {
          showPreview = false;
        }
        if (showPreview === void 0) {
          let message;
          if (data.extensionNames.length === 1) {
            if (operation === FileOperation.CREATE) {
              message = localize("ask.1.create", "Extension '{0}' wants to make refactoring changes with this file creation", data.extensionNames[0]);
            } else if (operation === FileOperation.COPY) {
              message = localize("ask.1.copy", "Extension '{0}' wants to make refactoring changes with this file copy", data.extensionNames[0]);
            } else if (operation === FileOperation.MOVE) {
              message = localize("ask.1.move", "Extension '{0}' wants to make refactoring changes with this file move", data.extensionNames[0]);
            } else {
              message = localize("ask.1.delete", "Extension '{0}' wants to make refactoring changes with this file deletion", data.extensionNames[0]);
            }
          } else {
            if (operation === FileOperation.CREATE) {
              message = localize({ key: "ask.N.create", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file creation", data.extensionNames.length);
            } else if (operation === FileOperation.COPY) {
              message = localize({ key: "ask.N.copy", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file copy", data.extensionNames.length);
            } else if (operation === FileOperation.MOVE) {
              message = localize({ key: "ask.N.move", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file move", data.extensionNames.length);
            } else {
              message = localize({ key: "ask.N.delete", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file deletion", data.extensionNames.length);
            }
          }
          if (needsConfirmation) {
            const { confirmed } = await dialogService.confirm({
              type: Severity.Info,
              message,
              primaryButton: localize("preview", "Show &&Preview"),
              cancelButton: localize("cancel", "Skip Changes")
            });
            showPreview = true;
            if (!confirmed) {
              return;
            }
          } else {
            let Choice;
            ((Choice2) => {
              Choice2[Choice2["OK"] = 0] = "OK";
              Choice2[Choice2["Preview"] = 1] = "Preview";
              Choice2[Choice2["Cancel"] = 2] = "Cancel";
            })(Choice || (Choice = {}));
            const { result, checkboxChecked } = await dialogService.prompt({
              type: Severity.Info,
              message,
              buttons: [
                {
                  label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
                  run: () => 0 /* OK */
                },
                {
                  label: localize({ key: "preview", comment: ["&& denotes a mnemonic"] }, "Show &&Preview"),
                  run: () => 1 /* Preview */
                }
              ],
              cancelButton: {
                label: localize("cancel", "Skip Changes"),
                run: () => 2 /* Cancel */
              },
              checkbox: { label: localize("again", "Do not ask me again") }
            });
            if (result === 2 /* Cancel */) {
              return;
            }
            showPreview = result === 1 /* Preview */;
            if (checkboxChecked) {
              storageService.store(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, showPreview, StorageScope.PROFILE, StorageTarget.USER);
            }
          }
        }
        logService.info("[onWill-handler] applying additional workspace edit from extensions", data.extensionNames);
        await bulkEditService.apply(
          reviveWorkspaceEditDto(data.edit, uriIdentService),
          { undoRedoGroupId: undoInfo?.undoRedoGroupId, showPreview }
        );
      }
      _progressLabel(operation) {
        switch (operation) {
          case FileOperation.CREATE:
            return localize("msg-create", "Running 'File Create' participants...");
          case FileOperation.MOVE:
            return localize("msg-rename", "Running 'File Rename' participants...");
          case FileOperation.COPY:
            return localize("msg-copy", "Running 'File Copy' participants...");
          case FileOperation.DELETE:
            return localize("msg-delete", "Running 'File Delete' participants...");
          case FileOperation.WRITE:
            return localize("msg-write", "Running 'File Write' participants...");
        }
      }
    }();
    this._listener.add(workingCopyFileService.addFileOperationParticipant(fileOperationParticipant));
    this._listener.add(workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this._proxy.$onDidRunFileOperation(e.operation, e.files)));
  }
  async $watch(extensionId, session, resource, unvalidatedOpts, correlate) {
    const uri = URI.revive(resource);
    const canHandleWatcher = await this._fileService.canHandleResource(uri);
    if (!canHandleWatcher) {
      this._logService.warn(`MainThreadFileSystemEventService#$watch(): cannot watch resource as its scheme is not handled by the file service (extension: ${extensionId}, path: ${uri.toString(true)})`);
    }
    const opts = {
      ...unvalidatedOpts
    };
    if (opts.recursive) {
      try {
        const stat = await this._fileService.stat(uri);
        if (!stat.isDirectory) {
          opts.recursive = false;
        }
      } catch (error) {
      }
    }
    if (correlate && !opts.recursive) {
      this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching correlated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);
      const watcherDisposables = new DisposableStore();
      const subscription = watcherDisposables.add(this._fileService.createWatcher(uri, { ...opts, recursive: false }));
      watcherDisposables.add(subscription.onDidChange((event) => {
        this._proxy.$onFileEvent({
          session,
          created: event.rawAdded,
          changed: event.rawUpdated,
          deleted: event.rawDeleted
        });
      }));
      this._watches.set(session, watcherDisposables);
    } else {
      this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching uncorrelated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);
      const subscription = this._fileService.watch(uri, opts);
      this._watches.set(session, subscription);
    }
  }
  $unwatch(session) {
    if (this._watches.has(session)) {
      this._logService.trace(`MainThreadFileSystemEventService#$unwatch(): request to stop watching (session: ${session})`);
      this._watches.deleteAndDispose(session);
    }
  }
  dispose() {
    this._listener.dispose();
    this._watches.dispose();
  }
};
MainThreadFileSystemEventService.MementoKeyAdditionalEdits = `file.particpants.additionalEdits`;
MainThreadFileSystemEventService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadFileSystemEventService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, ILogService)
], MainThreadFileSystemEventService);
registerAction2(class ResetMemento extends Action2 {
  constructor() {
    super({
      id: "files.participants.resetChoice",
      title: {
        value: localize("label", "Reset choice for 'File operation needs preview'"),
        original: `Reset choice for 'File operation needs preview'`
      },
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IStorageService).remove(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);
  }
});
export {
  MainThreadFileSystemEventService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbiwgSUZpbGVTZXJ2aWNlLCBJV2F0Y2hPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZVNoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2VTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCwgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIFNvdXJjZVRhcmdldFBhaXIsIElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvIH0gZnJvbSAnLi9tYWluVGhyZWFkQnVsa0VkaXRzLmpzJztcbmltcG9ydCB7IFVyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlU2hhcGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBNZW1lbnRvS2V5QWRkaXRpb25hbEVkaXRzID0gYGZpbGUucGFydGljcGFudHMuYWRkaXRpb25hbEVkaXRzYDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2VTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0ZW5lciA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2F0Y2hlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2Ugd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fbGlzdGVuZXIuYWRkKF9maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkZpbGVFdmVudCh7XG5cdFx0XHRcdGNyZWF0ZWQ6IGV2ZW50LnJhd0FkZGVkLFxuXHRcdFx0XHRjaGFuZ2VkOiBldmVudC5yYXdVcGRhdGVkLFxuXHRcdFx0XHRkZWxldGVkOiBldmVudC5yYXdEZWxldGVkXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBmaWxlT3BlcmF0aW9uUGFydGljaXBhbnQgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQge1xuXHRcdFx0YXN5bmMgcGFydGljaXBhdGUoZmlsZXM6IFNvdXJjZVRhcmdldFBhaXJbXSwgb3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLCB1bmRvSW5mbzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8gfCB1bmRlZmluZWQsIHRpbWVvdXQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGlmICh1bmRvSW5mbz8uaXNVbmRvaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGN0cy5jYW5jZWwoKSwgdGltZW91dCk7XG5cblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHR0aXRsZTogdGhpcy5fcHJvZ3Jlc3NMYWJlbChvcGVyYXRpb24pLFxuXHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGRlbGF5OiBNYXRoLm1pbih0aW1lb3V0IC8gMiwgMzAwMClcblx0XHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHJhY2UgZXh0ZW5zaW9uIGhvc3QgZXZlbnQgZGVsaXZlcnkgYWdhaW5zdCB0aW1lb3V0IEFORCB1c2VyLWNhbmNlbFxuXHRcdFx0XHRcdGNvbnN0IG9uV2lsbEV2ZW50ID0gdGhhdC5fcHJveHkuJG9uV2lsbFJ1bkZpbGVPcGVyYXRpb24ob3BlcmF0aW9uLCBmaWxlcywgdGltZW91dCwgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbihvbldpbGxFdmVudCwgY3RzLnRva2VuKTtcblx0XHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHVzZXItY2FuY2VsXG5cdFx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFkYXRhIHx8IGRhdGEuZWRpdC5lZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBjYW5jZWxsZWQsIG5vIHJlcGx5LCBvciBubyBlZGl0c1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5lZWRzQ29uZmlybWF0aW9uID0gZGF0YS5lZGl0LmVkaXRzLnNvbWUoZWRpdCA9PiBlZGl0Lm1ldGFkYXRhPy5uZWVkc0NvbmZpcm1hdGlvbik7XG5cdFx0XHRcdGxldCBzaG93UHJldmlldyA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UuTWVtZW50b0tleUFkZGl0aW9uYWxFZGl0cywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXG5cdFx0XHRcdGlmIChlbnZTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdFx0XHQvLyBkb24ndCBzaG93IGRpYWxvZyBpbiB0ZXN0c1xuXHRcdFx0XHRcdHNob3dQcmV2aWV3ID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2hvd1ByZXZpZXcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIHNob3cgYSB1c2VyIGZhY2luZyBtZXNzYWdlXG5cblx0XHRcdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRcdGlmIChkYXRhLmV4dGVuc2lvbk5hbWVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0aWYgKG9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdhc2suMS5jcmVhdGUnLCBcIkV4dGVuc2lvbiAnezB9JyB3YW50cyB0byBtYWtlIHJlZmFjdG9yaW5nIGNoYW5nZXMgd2l0aCB0aGlzIGZpbGUgY3JlYXRpb25cIiwgZGF0YS5leHRlbnNpb25OYW1lc1swXSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DT1BZKSB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYXNrLjEuY29weScsIFwiRXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBjb3B5XCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXNbMF0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChvcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uTU9WRSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Fzay4xLm1vdmUnLCBcIkV4dGVuc2lvbiAnezB9JyB3YW50cyB0byBtYWtlIHJlZmFjdG9yaW5nIGNoYW5nZXMgd2l0aCB0aGlzIGZpbGUgbW92ZVwiLCBkYXRhLmV4dGVuc2lvbk5hbWVzWzBdKTtcblx0XHRcdFx0XHRcdH0gZWxzZSAvKiBpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkRFTEVURSkgKi8ge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Fzay4xLmRlbGV0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBkZWxldGlvblwiLCBkYXRhLmV4dGVuc2lvbk5hbWVzWzBdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKG9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAnYXNrLk4uY3JlYXRlJywgY29tbWVudDogWyd7MH0gaXMgYSBudW1iZXIsIGUuZyBcIjMgZXh0ZW5zaW9ucyB3YW50Li4uXCInXSB9LCBcInswfSBleHRlbnNpb25zIHdhbnQgdG8gbWFrZSByZWZhY3RvcmluZyBjaGFuZ2VzIHdpdGggdGhpcyBmaWxlIGNyZWF0aW9uXCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXMubGVuZ3RoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAnYXNrLk4uY29weScsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbnVtYmVyLCBlLmcgXCIzIGV4dGVuc2lvbnMgd2FudC4uLlwiJ10gfSwgXCJ7MH0gZXh0ZW5zaW9ucyB3YW50IHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBjb3B5XCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXMubGVuZ3RoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLk1PVkUpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAnYXNrLk4ubW92ZScsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbnVtYmVyLCBlLmcgXCIzIGV4dGVuc2lvbnMgd2FudC4uLlwiJ10gfSwgXCJ7MH0gZXh0ZW5zaW9ucyB3YW50IHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBtb3ZlXCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXMubGVuZ3RoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSAvKiBpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkRFTEVURSkgKi8ge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdhc2suTi5kZWxldGUnLCBjb21tZW50OiBbJ3swfSBpcyBhIG51bWJlciwgZS5nIFwiMyBleHRlbnNpb25zIHdhbnQuLi5cIiddIH0sIFwiezB9IGV4dGVuc2lvbnMgd2FudCB0byBtYWtlIHJlZmFjdG9yaW5nIGNoYW5nZXMgd2l0aCB0aGlzIGZpbGUgZGVsZXRpb25cIiwgZGF0YS5leHRlbnNpb25OYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChuZWVkc0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0Ly8gZWRpdCB3aGljaCBuZWVkcyBjb25maXJtYXRpb24gLT4gYWx3YXlzIHNob3cgZGlhbG9nXG5cdFx0XHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3ByZXZpZXcnLCBcIlNob3cgJiZQcmV2aWV3XCIpLFxuXHRcdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjYW5jZWwnLCBcIlNraXAgQ2hhbmdlc1wiKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRzaG93UHJldmlldyA9IHRydWU7XG5cdFx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0XHQvLyBubyBjaGFuZ2VzIHdhbnRlZFxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIGNob2ljZVxuXHRcdFx0XHRcdFx0ZW51bSBDaG9pY2Uge1xuXHRcdFx0XHRcdFx0XHRPSyA9IDAsXG5cdFx0XHRcdFx0XHRcdFByZXZpZXcgPSAxLFxuXHRcdFx0XHRcdFx0XHRDYW5jZWwgPSAyXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCB7IHJlc3VsdCwgY2hlY2tib3hDaGVja2VkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdDxDaG9pY2U+KHtcblx0XHRcdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IENob2ljZS5PS1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAncHJldmlldycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTaG93ICYmUHJldmlld1wiKSxcblx0XHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gQ2hvaWNlLlByZXZpZXdcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2FuY2VsJywgXCJTa2lwIENoYW5nZXNcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBDaG9pY2UuQ2FuY2VsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGNoZWNrYm94OiB7IGxhYmVsOiBsb2NhbGl6ZSgnYWdhaW4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIikgfVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0ID09PSBDaG9pY2UuQ2FuY2VsKSB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vIGNoYW5nZXMgd2FudGVkLCBkb24ndCBwZXJzaXN0IGNhbmNlbCBvcHRpb25cblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c2hvd1ByZXZpZXcgPSByZXN1bHQgPT09IENob2ljZS5QcmV2aWV3O1xuXHRcdFx0XHRcdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZS5NZW1lbnRvS2V5QWRkaXRpb25hbEVkaXRzLCBzaG93UHJldmlldywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bG9nU2VydmljZS5pbmZvKCdbb25XaWxsLWhhbmRsZXJdIGFwcGx5aW5nIGFkZGl0aW9uYWwgd29ya3NwYWNlIGVkaXQgZnJvbSBleHRlbnNpb25zJywgZGF0YS5leHRlbnNpb25OYW1lcyk7XG5cblx0XHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFxuXHRcdFx0XHRcdHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZGF0YS5lZGl0LCB1cmlJZGVudFNlcnZpY2UpLFxuXHRcdFx0XHRcdHsgdW5kb1JlZG9Hcm91cElkOiB1bmRvSW5mbz8udW5kb1JlZG9Hcm91cElkLCBzaG93UHJldmlldyB9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgX3Byb2dyZXNzTGFiZWwob3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uKTogc3RyaW5nIHtcblx0XHRcdFx0c3dpdGNoIChvcGVyYXRpb24pIHtcblx0XHRcdFx0XHRjYXNlIEZpbGVPcGVyYXRpb24uQ1JFQVRFOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtc2ctY3JlYXRlJywgXCJSdW5uaW5nICdGaWxlIENyZWF0ZScgcGFydGljaXBhbnRzLi4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5NT1ZFOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtc2ctcmVuYW1lJywgXCJSdW5uaW5nICdGaWxlIFJlbmFtZScgcGFydGljaXBhbnRzLi4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DT1BZOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtc2ctY29weScsIFwiUnVubmluZyAnRmlsZSBDb3B5JyBwYXJ0aWNpcGFudHMuLi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkRFTEVURTpcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbXNnLWRlbGV0ZScsIFwiUnVubmluZyAnRmlsZSBEZWxldGUnIHBhcnRpY2lwYW50cy4uLlwiKTtcblx0XHRcdFx0XHRjYXNlIEZpbGVPcGVyYXRpb24uV1JJVEU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21zZy13cml0ZScsIFwiUnVubmluZyAnRmlsZSBXcml0ZScgcGFydGljaXBhbnRzLi4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEJFRk9SRSBmaWxlIG9wZXJhdGlvblxuXHRcdHRoaXMuX2xpc3RlbmVyLmFkZCh3b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZEZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudChmaWxlT3BlcmF0aW9uUGFydGljaXBhbnQpKTtcblxuXHRcdC8vIEFGVEVSIGZpbGUgb3BlcmF0aW9uXG5cdFx0dGhpcy5fbGlzdGVuZXIuYWRkKHdvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLl9wcm94eS4kb25EaWRSdW5GaWxlT3BlcmF0aW9uKGUub3BlcmF0aW9uLCBlLmZpbGVzKSkpO1xuXHR9XG5cblx0YXN5bmMgJHdhdGNoKGV4dGVuc2lvbklkOiBzdHJpbmcsIHNlc3Npb246IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHVudmFsaWRhdGVkT3B0czogSVdhdGNoT3B0aW9ucywgY29ycmVsYXRlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBjYW5IYW5kbGVXYXRjaGVyID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UodXJpKTtcblx0XHRpZiAoIWNhbkhhbmRsZVdhdGNoZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UjJHdhdGNoKCk6IGNhbm5vdCB3YXRjaCByZXNvdXJjZSBhcyBpdHMgc2NoZW1lIGlzIG5vdCBoYW5kbGVkIGJ5IHRoZSBmaWxlIHNlcnZpY2UgKGV4dGVuc2lvbjogJHtleHRlbnNpb25JZH0sIHBhdGg6ICR7dXJpLnRvU3RyaW5nKHRydWUpfSlgKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRzOiBJV2F0Y2hPcHRpb25zID0ge1xuXHRcdFx0Li4udW52YWxpZGF0ZWRPcHRzXG5cdFx0fTtcblxuXHRcdC8vIENvbnZlcnQgYSByZWN1cnNpdmUgd2F0Y2hlciB0byBhIGZsYXQgd2F0Y2hlciBpZiB0aGUgcGF0aFxuXHRcdC8vIHR1cm5zIG91dCB0byBub3QgYmUgYSBmb2xkZXIuIFJlY3Vyc2l2ZSB3YXRjaGluZyBpcyBvbmx5XG5cdFx0Ly8gcG9zc2libGUgb24gZm9sZGVycywgc28gd2UgaGVscCBhbGwgZmlsZSB3YXRjaGVycyBieSBjaGVja2luZ1xuXHRcdC8vIGVhcmx5LlxuXHRcdGlmIChvcHRzLnJlY3Vyc2l2ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0b3B0cy5yZWN1cnNpdmUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29ycmVsYXRlZCBmaWxlIHdhdGNoaW5nOiB1c2UgYW4gZXhjbHVzaXZlIGBjcmVhdGVXYXRjaGVyKClgXG5cdFx0Ly8gTm90ZTogY3VycmVudGx5IG5vdCBlbmFibGVkIGZvciBleHRlbnNpb25zIChidXQgbGVhdmluZyBpbiBpbiBjYXNlIG9mIGZ1dHVyZSB1c2FnZSlcblx0XHRpZiAoY29ycmVsYXRlICYmICFvcHRzLnJlY3Vyc2l2ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UjJHdhdGNoKCk6IHJlcXVlc3QgdG8gc3RhcnQgd2F0Y2hpbmcgY29ycmVsYXRlZCAoZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkfSwgcGF0aDogJHt1cmkudG9TdHJpbmcodHJ1ZSl9LCByZWN1cnNpdmU6ICR7b3B0cy5yZWN1cnNpdmV9LCBzZXNzaW9uOiAke3Nlc3Npb259LCBleGNsdWRlczogJHtKU09OLnN0cmluZ2lmeShvcHRzLmV4Y2x1ZGVzKX0sIGluY2x1ZGVzOiAke0pTT04uc3RyaW5naWZ5KG9wdHMuaW5jbHVkZXMpfSlgKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2hlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gd2F0Y2hlckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9maWxlU2VydmljZS5jcmVhdGVXYXRjaGVyKHVyaSwgeyAuLi5vcHRzLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRcdHdhdGNoZXJEaXNwb3NhYmxlcy5hZGQoc3Vic2NyaXB0aW9uLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRmlsZUV2ZW50KHtcblx0XHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IGV2ZW50LnJhd0FkZGVkLFxuXHRcdFx0XHRcdGNoYW5nZWQ6IGV2ZW50LnJhd1VwZGF0ZWQsXG5cdFx0XHRcdFx0ZGVsZXRlZDogZXZlbnQucmF3RGVsZXRlZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fd2F0Y2hlcy5zZXQoc2Vzc2lvbiwgd2F0Y2hlckRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHQvLyBVbmNvcnJlbGF0ZWQgZmlsZSB3YXRjaGluZzogdmlhIHNoYXJlZCBgd2F0Y2goKWBcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlIyR3YXRjaCgpOiByZXF1ZXN0IHRvIHN0YXJ0IHdhdGNoaW5nIHVuY29ycmVsYXRlZCAoZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkfSwgcGF0aDogJHt1cmkudG9TdHJpbmcodHJ1ZSl9LCByZWN1cnNpdmU6ICR7b3B0cy5yZWN1cnNpdmV9LCBzZXNzaW9uOiAke3Nlc3Npb259LCBleGNsdWRlczogJHtKU09OLnN0cmluZ2lmeShvcHRzLmV4Y2x1ZGVzKX0sIGluY2x1ZGVzOiAke0pTT04uc3RyaW5naWZ5KG9wdHMuaW5jbHVkZXMpfSlgKTtcblxuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gdGhpcy5fZmlsZVNlcnZpY2Uud2F0Y2godXJpLCBvcHRzKTtcblx0XHRcdHRoaXMuX3dhdGNoZXMuc2V0KHNlc3Npb24sIHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0JHVud2F0Y2goc2Vzc2lvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dhdGNoZXMuaGFzKHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZSMkdW53YXRjaCgpOiByZXF1ZXN0IHRvIHN0b3Agd2F0Y2hpbmcgKHNlc3Npb246ICR7c2Vzc2lvbn0pYCk7XG5cdFx0XHR0aGlzLl93YXRjaGVzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2F0Y2hlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0TWVtZW50byBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ZpbGVzLnBhcnRpY2lwYW50cy5yZXNldENob2ljZScsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2xhYmVsJywgXCJSZXNldCBjaG9pY2UgZm9yICdGaWxlIG9wZXJhdGlvbiBuZWVkcyBwcmV2aWV3J1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6IGBSZXNldCBjaG9pY2UgZm9yICdGaWxlIG9wZXJhdGlvbiBuZWVkcyBwcmV2aWV3J2Bcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpLnJlbW92ZShNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZS5NZW1lbnRvS2V5QWRkaXRpb25hbEVkaXRzLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1c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
