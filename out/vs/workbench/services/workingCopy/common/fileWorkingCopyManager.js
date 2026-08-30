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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Promises } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { toLocalResource, joinPath, isEqual, basename, dirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileDialogService, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IPathService } from "../../path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { StoredFileWorkingCopyState } from "./storedFileWorkingCopy.js";
import { StoredFileWorkingCopyManager } from "./storedFileWorkingCopyManager.js";
import { UntitledFileWorkingCopy } from "./untitledFileWorkingCopy.js";
import { UntitledFileWorkingCopyManager } from "./untitledFileWorkingCopyManager.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IDecorationsService } from "../../decorations/common/decorations.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { listErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
let FileWorkingCopyManager = class extends Disposable {
  constructor(workingCopyTypeId, storedWorkingCopyModelFactory, untitledWorkingCopyModelFactory, fileService, lifecycleService, labelService, logService, workingCopyFileService, workingCopyBackupService, uriIdentityService, fileDialogService, filesConfigurationService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, pathService, environmentService, dialogService, decorationsService, progressService) {
    super();
    this.workingCopyTypeId = workingCopyTypeId;
    this.storedWorkingCopyModelFactory = storedWorkingCopyModelFactory;
    this.untitledWorkingCopyModelFactory = untitledWorkingCopyModelFactory;
    this.fileService = fileService;
    this.logService = logService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.fileDialogService = fileDialogService;
    this.filesConfigurationService = filesConfigurationService;
    this.pathService = pathService;
    this.environmentService = environmentService;
    this.dialogService = dialogService;
    this.decorationsService = decorationsService;
    this.stored = this._register(new StoredFileWorkingCopyManager(
      this.workingCopyTypeId,
      this.storedWorkingCopyModelFactory,
      fileService,
      lifecycleService,
      labelService,
      logService,
      workingCopyFileService,
      workingCopyBackupService,
      uriIdentityService,
      filesConfigurationService,
      workingCopyService,
      notificationService,
      workingCopyEditorService,
      editorService,
      elevatedFileService,
      progressService
    ));
    this.untitled = this._register(new UntitledFileWorkingCopyManager(
      this.workingCopyTypeId,
      this.untitledWorkingCopyModelFactory,
      async (workingCopy, options) => {
        const result = await this.saveAs(workingCopy.resource, void 0, options);
        return !!result;
      },
      fileService,
      labelService,
      logService,
      workingCopyBackupService,
      workingCopyService
    ));
    this.onDidCreate = Event.any(this.stored.onDidCreate, this.untitled.onDidCreate);
    this.provideDecorations();
  }
  //#region decorations
  provideDecorations() {
    const provider = this._register(new class extends Disposable {
      constructor(stored) {
        super();
        this.stored = stored;
        this.label = localize("fileWorkingCopyDecorations", "File Working Copy Decorations");
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.registerListeners();
      }
      registerListeners() {
        this._register(this.stored.onDidResolve((workingCopy) => {
          if (workingCopy.isReadonly() || workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN)) {
            this._onDidChange.fire([workingCopy.resource]);
          }
        }));
        this._register(this.stored.onDidRemove((workingCopyUri) => this._onDidChange.fire([workingCopyUri])));
        this._register(this.stored.onDidChangeReadonly((workingCopy) => this._onDidChange.fire([workingCopy.resource])));
        this._register(this.stored.onDidChangeOrphaned((workingCopy) => this._onDidChange.fire([workingCopy.resource])));
      }
      provideDecorations(uri) {
        const workingCopy = this.stored.get(uri);
        if (!workingCopy || workingCopy.isDisposed()) {
          return void 0;
        }
        const isReadonly = workingCopy.isReadonly();
        const isOrphaned = workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
        if (isReadonly && isOrphaned) {
          return {
            color: listErrorForeground,
            letter: Codicon.lockSmall,
            strikethrough: true,
            tooltip: localize("readonlyAndDeleted", "Deleted, Read-only")
          };
        } else if (isReadonly) {
          return {
            letter: Codicon.lockSmall,
            tooltip: localize("readonly", "Read-only")
          };
        } else if (isOrphaned) {
          return {
            color: listErrorForeground,
            strikethrough: true,
            tooltip: localize("deleted", "Deleted")
          };
        }
        return void 0;
      }
    }(this.stored));
    this._register(this.decorationsService.registerDecorationsProvider(provider));
  }
  //#endregion
  //#region get / get all
  get workingCopies() {
    return [...this.stored.workingCopies, ...this.untitled.workingCopies];
  }
  get(resource) {
    return this.stored.get(resource) ?? this.untitled.get(resource);
  }
  resolve(arg1, arg2) {
    if (URI.isUri(arg1)) {
      if (arg1.scheme === Schemas.untitled) {
        return this.untitled.resolve({ untitledResource: arg1 });
      } else {
        return this.stored.resolve(arg1, arg2);
      }
    }
    return this.untitled.resolve(arg1);
  }
  //#endregion
  //#region Save
  async saveAs(source, target, options) {
    if (!target) {
      const workingCopy = this.get(source);
      if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
        target = await this.suggestSavePath(source);
      } else {
        target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
      }
    }
    if (!target) {
      return;
    }
    if (this.filesConfigurationService.isReadonly(target)) {
      const confirmed = await this.confirmMakeWriteable(target);
      if (!confirmed) {
        return;
      } else {
        this.filesConfigurationService.updateReadonly(target, false);
      }
    }
    if (this.fileService.hasProvider(source) && isEqual(source, target)) {
      return this.doSave(source, {
        ...options,
        force: true
        /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
      });
    }
    if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && await this.fileService.exists(source)) {
      await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
      return await this.doSave(source, options) ?? await this.doSave(target, options);
    }
    return this.doSaveAs(source, target, options);
  }
  async doSave(resource, options) {
    const storedFileWorkingCopy = this.stored.get(resource);
    if (storedFileWorkingCopy) {
      const success = await storedFileWorkingCopy.save(options);
      if (success) {
        return storedFileWorkingCopy;
      }
    }
    return void 0;
  }
  async doSaveAs(source, target, options) {
    let sourceContents;
    const sourceWorkingCopy = this.get(source);
    if (sourceWorkingCopy?.isResolved()) {
      sourceContents = await sourceWorkingCopy.model.snapshot(SnapshotContext.Save, CancellationToken.None);
    } else {
      sourceContents = (await this.fileService.readFileStream(source)).value;
    }
    const { targetFileExists, targetStoredFileWorkingCopy } = await this.doResolveSaveTarget(source, target);
    if (sourceWorkingCopy instanceof UntitledFileWorkingCopy && sourceWorkingCopy.hasAssociatedFilePath && targetFileExists && this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceWorkingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))) {
      const overwrite = await this.confirmOverwrite(target);
      if (!overwrite) {
        return void 0;
      }
    }
    await targetStoredFileWorkingCopy.model?.update(sourceContents, CancellationToken.None);
    if (!options?.source) {
      options = {
        ...options,
        source: targetFileExists ? FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_REPLACE_SOURCE : FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_CREATE_SOURCE
      };
    }
    const success = await targetStoredFileWorkingCopy.save({
      ...options,
      from: source,
      force: true
      /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
    });
    if (!success) {
      return void 0;
    }
    try {
      await sourceWorkingCopy?.revert();
    } catch (error) {
      this.logService.error(error);
    }
    if (source.scheme === Schemas.untitled) {
      this.untitled.notifyDidSave(source, target);
    }
    return targetStoredFileWorkingCopy;
  }
  async doResolveSaveTarget(source, target) {
    let targetFileExists = false;
    let targetStoredFileWorkingCopy = this.stored.get(target);
    if (targetStoredFileWorkingCopy?.isResolved()) {
      targetFileExists = true;
    } else {
      targetFileExists = await this.fileService.exists(target);
      if (!targetFileExists) {
        await this.workingCopyFileService.create([{ resource: target }], CancellationToken.None);
      }
      if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
        targetStoredFileWorkingCopy = await this.stored.resolve(source);
      } else {
        targetStoredFileWorkingCopy = await this.stored.resolve(target);
      }
    }
    return { targetFileExists, targetStoredFileWorkingCopy };
  }
  async confirmOverwrite(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmOverwrite", "'{0}' already exists. Do you want to replace it?", basename(resource)),
      detail: localize("overwriteIrreversible", "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    });
    return confirmed;
  }
  async confirmMakeWriteable(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmMakeWriteable", "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
      detail: localize("confirmMakeWriteableDetail", "Paths can be configured as read-only via settings."),
      primaryButton: localize({ key: "makeWriteableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Save Anyway")
    });
    return confirmed;
  }
  async suggestSavePath(resource) {
    if (this.fileService.hasProvider(resource)) {
      return resource;
    }
    const workingCopy = this.get(resource);
    if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
      return toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
    }
    const defaultFilePath = await this.fileDialogService.defaultFilePath();
    if (workingCopy) {
      const candidatePath = joinPath(defaultFilePath, workingCopy.name);
      if (await this.pathService.hasValidBasename(candidatePath, workingCopy.name)) {
        return candidatePath;
      }
    }
    return joinPath(defaultFilePath, basename(resource));
  }
  //#endregion
  //#region Lifecycle
  async destroy() {
    await Promises.settled([
      this.stored.destroy(),
      this.untitled.destroy()
    ]);
  }
  //#endregion
};
FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource("fileWorkingCopyCreate.source", localize("fileWorkingCopyCreate.source", "File Created"));
FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource("fileWorkingCopyReplace.source", localize("fileWorkingCopyReplace.source", "File Replaced"));
FileWorkingCopyManager = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILifecycleService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IWorkingCopyFileService),
  __decorateParam(8, IWorkingCopyBackupService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IFileDialogService),
  __decorateParam(11, IFilesConfigurationService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, INotificationService),
  __decorateParam(14, IWorkingCopyEditorService),
  __decorateParam(15, IEditorService),
  __decorateParam(16, IElevatedFileService),
  __decorateParam(17, IPathService),
  __decorateParam(18, IWorkbenchEnvironmentService),
  __decorateParam(19, IDialogService),
  __decorateParam(20, IDecorationsService),
  __decorateParam(21, IProgressService)
], FileWorkingCopyManager);
export {
  FileWorkingCopyManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFxmaWxlV29ya2luZ0NvcHlNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyB0b0xvY2FsUmVzb3VyY2UsIGpvaW5QYXRoLCBpc0VxdWFsLCBiYXNlbmFtZSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTYXZlT3B0aW9ucywgU2F2ZVNvdXJjZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeSwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zLCBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZSB9IGZyb20gJy4vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IFN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlclJlc29sdmVPcHRpb25zIH0gZnJvbSAnLi9zdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weSwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeSwgVW50aXRsZWRGaWxlV29ya2luZ0NvcHkgfSBmcm9tICcuL3VudGl0bGVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElOZXdPckV4aXN0aW5nVW50aXRsZWRGaWxlV29ya2luZ0NvcHlPcHRpb25zLCBJTmV3VW50aXRsZWRGaWxlV29ya2luZ0NvcHlPcHRpb25zLCBJTmV3VW50aXRsZWRGaWxlV29ya2luZ0NvcHlXaXRoQXNzb2NpYXRlZFJlc291cmNlT3B0aW9ucywgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlciwgVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyIH0gZnJvbSAnLi91bnRpdGxlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJhc2VGaWxlV29ya2luZ0NvcHlNYW5hZ2VyIH0gZnJvbSAnLi9hYnN0cmFjdEZpbGVXb3JraW5nQ29weU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVXb3JraW5nQ29weSwgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi9maWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZWxldmF0ZWRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5QmFja3VwLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25EYXRhLCBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbGlzdEVycm9yRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFMgZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIFUgZXh0ZW5kcyBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBJQmFzZUZpbGVXb3JraW5nQ29weU1hbmFnZXI8UyB8IFUsIElGaWxlV29ya2luZ0NvcHk8UyB8IFU+PiB7XG5cblx0LyoqXG5cdCAqIFByb3ZpZGVzIGFjY2VzcyB0byB0aGUgbWFuYWdlciBmb3Igc3RvcmVkIGZpbGUgd29ya2luZyBjb3BpZXMuXG5cdCAqL1xuXHRyZWFkb25seSBzdG9yZWQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFM+O1xuXG5cdC8qKlxuXHQgKiBQcm92aWRlcyBhY2Nlc3MgdG8gdGhlIG1hbmFnZXIgZm9yIHVudGl0bGVkIGZpbGUgd29ya2luZyBjb3BpZXMuXG5cdCAqL1xuXHRyZWFkb25seSB1bnRpdGxlZDogSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxVPjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIHJlc29sdmUgYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkuIElmIHRoZSBtYW5hZ2VyIGFscmVhZHkga25vd3Ncblx0ICogYWJvdXQgYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCB0aGUgc2FtZSBgVVJJYCwgaXQgd2lsbCByZXR1cm4gdGhhdFxuXHQgKiBleGlzdGluZyBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkuIFRoZXJlIHdpbGwgbmV2ZXIgYmUgbW9yZSB0aGFuIG9uZVxuXHQgKiBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgcGVyIGBVUklgIHVudGlsIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXNcblx0ICogZGlzcG9zZWQuXG5cdCAqXG5cdCAqIFVzZSB0aGUgYElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucy5yZWxvYWRgIG9wdGlvbiB0byBjb250cm9sIHRoZVxuXHQgKiBiZWhhdmlvdXIgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2FzIHByZXZpb3VzbHkgYWxyZWFkeSByZXNvbHZlZFxuXHQgKiB3aXRoIHJlZ2FyZHMgdG8gcmVzb2x2aW5nIGl0IGFnYWluIGZyb20gdGhlIHVuZGVybHlpbmcgZmlsZSByZXNvdXJjZVxuXHQgKiBvciBub3QuXG5cdCAqXG5cdCAqIE5vdGU6IENhbGxlcnMgbXVzdCBgZGlzcG9zZWAgdGhlIHdvcmtpbmcgY29weSB3aGVuIG5vIGxvbmdlciBuZWVkZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSByZXNvdXJjZSB1c2VkIGFzIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaW5cblx0ICogY2FzZSBvbmUgaXMgYWxyZWFkeSBrbm93biBmb3IgdGhpcyBgVVJJYC5cblx0ICogQHBhcmFtIG9wdGlvbnNcblx0ICovXG5cdHJlc29sdmUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4+O1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgdW50aXRsZWQgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCBvcHRpb25hbCBpbml0aWFsIGNvbnRlbnRzLlxuXHQgKlxuXHQgKiBOb3RlOiBDYWxsZXJzIG11c3QgYGRpc3Bvc2VgIHRoZSB3b3JraW5nIGNvcHkgd2hlbiBubyBsb25nZXIgbmVlZGVkLlxuXHQgKi9cblx0cmVzb2x2ZShvcHRpb25zPzogSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+PjtcblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHVudGl0bGVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggb3B0aW9uYWwgaW5pdGlhbCBjb250ZW50c1xuXHQgKiBhbmQgYXNzb2NpYXRlZCByZXNvdXJjZS4gVGhlIGFzc29jaWF0ZWQgcmVzb3VyY2Ugd2lsbCBiZSB1c2VkIHdoZW5cblx0ICogc2F2aW5nIGFuZCB3aWxsIG5vdCByZXF1aXJlIHRvIGFzayB0aGUgdXNlciBmb3IgYSBmaWxlIHBhdGguXG5cdCAqXG5cdCAqIE5vdGU6IENhbGxlcnMgbXVzdCBgZGlzcG9zZWAgdGhlIHdvcmtpbmcgY29weSB3aGVuIG5vIGxvbmdlciBuZWVkZWQuXG5cdCAqL1xuXHRyZXNvbHZlKG9wdGlvbnM/OiBJTmV3VW50aXRsZWRGaWxlV29ya2luZ0NvcHlXaXRoQXNzb2NpYXRlZFJlc291cmNlT3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+PjtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyB1bnRpdGxlZCBmaWxlIHdvcmtpbmcgY29weSB3aXRoIG9wdGlvbmFsIGluaXRpYWwgY29udGVudHNcblx0ICogd2l0aCB0aGUgcHJvdmlkZWQgcmVzb3VyY2Ugb3IgcmV0dXJuIGFuIGV4aXN0aW5nIHVudGl0bGVkIGZpbGUgd29ya2luZ1xuXHQgKiBjb3B5IG90aGVyd2lzZS5cblx0ICpcblx0ICogTm90ZTogQ2FsbGVycyBtdXN0IGBkaXNwb3NlYCB0aGUgd29ya2luZyBjb3B5IHdoZW4gbm8gbG9uZ2VyIG5lZWRlZC5cblx0ICovXG5cdHJlc29sdmUob3B0aW9ucz86IElOZXdPckV4aXN0aW5nVW50aXRsZWRGaWxlV29ya2luZ0NvcHlPcHRpb25zKTogUHJvbWlzZTxJVW50aXRsZWRGaWxlV29ya2luZ0NvcHk8VT4+O1xuXG5cdC8qKlxuXHQgKiBJbXBsZW1lbnRzIFwiU2F2ZSBBc1wiIGZvciBmaWxlIGJhc2VkIHdvcmtpbmcgY29waWVzLiBUaGUgQVBJIGlzIGBVUklgIGJhc2VkXG5cdCAqIGJlY2F1c2UgaXQgd29ya3MgZXZlbiB3aXRob3V0IHJlc29sdmVkIGZpbGUgd29ya2luZyBjb3BpZXMuIElmIGEgZmlsZSB3b3JraW5nXG5cdCAqIGNvcHkgZXhpc3RzIGZvciBhbnkgZ2l2ZW4gYFVSSWAsIHRoZSBpbXBsZW1lbnRhdGlvbiB3aWxsIGRlYWwgd2l0aCB0aGVtIHByb3Blcmx5XG5cdCAqIChlLmcuIGRpcnR5IGNvbnRlbnRzIG9mIHRoZSBzb3VyY2Ugd2lsbCBiZSB3cml0dGVuIHRvIHRoZSB0YXJnZXQgYW5kIHRoZSBzb3VyY2Vcblx0ICogd2lsbCBiZSByZXZlcnRlZCkuXG5cdCAqXG5cdCAqIE5vdGU6IGl0IGlzIHBvc3NpYmxlIHRoYXQgdGhlIHJldHVybmVkIGZpbGUgd29ya2luZyBjb3B5IGhhcyBhIGRpZmZlcmVudCBgVVJJYFxuXHQgKiB0aGFuIHRoZSBgdGFyZ2V0YCB0aGF0IHdhcyBwYXNzZWQgaW4uIEJhc2VkIG9uIFVSSSBpZGVudGl0eSwgdGhlIGZpbGUgd29ya2luZ1xuXHQgKiBjb3B5IG1heSBjaG9zZSB0byByZXR1cm4gYW4gZXhpc3RpbmcgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCBkaWZmZXJlbnQgY2FzaW5nXG5cdCAqIHRvIHJlc3BlY3QgZmlsZSBzeXN0ZW1zIHRoYXQgYXJlIGNhc2UgaW5zZW5zaXRpdmUuXG5cdCAqXG5cdCAqIE5vdGU6IENhbGxlcnMgbXVzdCBgZGlzcG9zZWAgdGhlIHdvcmtpbmcgY29weSB3aGVuIG5vIGxvbmdlciBuZWVkZWQuXG5cdCAqXG5cdCAqIE5vdGU6IFVudGl0bGVkIGZpbGUgd29ya2luZyBjb3BpZXMgYXJlIGJlaW5nIGRpc3Bvc2VkIHdoZW4gc2F2ZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBzb3VyY2UgdGhlIHNvdXJjZSByZXNvdXJjZSB0byBzYXZlIGFzXG5cdCAqIEBwYXJhbSB0YXJnZXQgdGhlIG9wdGlvbmFsIHRhcmdldCByZXNvdXJjZSB0byBzYXZlIHRvLiBpZiBub3QgZGVmaW5lZCwgdGhlIHVzZXJcblx0ICogd2lsbCBiZSBhc2tlZCBmb3IgaW5wdXRcblx0ICogQHJldHVybnMgdGhlIHRhcmdldCBzdG9yZWQgd29ya2luZyBjb3B5IHRoYXQgd2FzIHNhdmVkIHRvIG9yIGB1bmRlZmluZWRgIGluIGNhc2Ugb2Zcblx0ICogY2FuY2VsbGF0aW9uXG5cdCAqL1xuXHRzYXZlQXMoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+IHwgdW5kZWZpbmVkPjtcblx0c2F2ZUFzKHNvdXJjZTogVVJJLCB0YXJnZXQ6IHVuZGVmaW5lZCwgb3B0aW9ucz86IElGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+IHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyBleHRlbmRzIElTYXZlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIHRhcmdldCByZXNvdXJjZSB0byBzdWdnZXN0IHRvIHRoZSB1c2VyIGluIGNhc2Vcblx0ICogbm8gdGFyZ2V0IHJlc291cmNlIGlzIHByb3ZpZGVkIHRvIHNhdmUgdG8uXG5cdCAqL1xuXHRzdWdnZXN0ZWRUYXJnZXQ/OiBVUkk7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFMgZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIFUgZXh0ZW5kcyBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUZpbGVXb3JraW5nQ29weU1hbmFnZXI8UywgVT4ge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ3JlYXRlOiBFdmVudDxJRmlsZVdvcmtpbmdDb3B5PFMgfCBVPj47XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRklMRV9XT1JLSU5HX0NPUFlfU0FWRV9DUkVBVEVfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCdmaWxlV29ya2luZ0NvcHlDcmVhdGUuc291cmNlJywgbG9jYWxpemUoJ2ZpbGVXb3JraW5nQ29weUNyZWF0ZS5zb3VyY2UnLCBcIkZpbGUgQ3JlYXRlZFwiKSk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEZJTEVfV09SS0lOR19DT1BZX1NBVkVfUkVQTEFDRV9TT1VSQ0UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ2ZpbGVXb3JraW5nQ29weVJlcGxhY2Uuc291cmNlJywgbG9jYWxpemUoJ2ZpbGVXb3JraW5nQ29weVJlcGxhY2Uuc291cmNlJywgXCJGaWxlIFJlcGxhY2VkXCIpKTtcblxuXHRyZWFkb25seSBzdG9yZWQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFM+O1xuXHRyZWFkb25seSB1bnRpdGxlZDogSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxVPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5VHlwZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9yZWRXb3JraW5nQ29weU1vZGVsRmFjdG9yeTogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxTPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVudGl0bGVkV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk6IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxVPixcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFbGV2YXRlZEZpbGVTZXJ2aWNlIGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU3RvcmVkIGZpbGUgd29ya2luZyBjb3BpZXMgbWFuYWdlclxuXHRcdHRoaXMuc3RvcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIoXG5cdFx0XHR0aGlzLndvcmtpbmdDb3B5VHlwZUlkLFxuXHRcdFx0dGhpcy5zdG9yZWRXb3JraW5nQ29weU1vZGVsRmFjdG9yeSxcblx0XHRcdGZpbGVTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0XHR3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgd29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSwgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBlbGV2YXRlZEZpbGVTZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2Vcblx0XHQpKTtcblxuXHRcdC8vIFVudGl0bGVkIGZpbGUgd29ya2luZyBjb3BpZXMgbWFuYWdlclxuXHRcdHRoaXMudW50aXRsZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyKFxuXHRcdFx0dGhpcy53b3JraW5nQ29weVR5cGVJZCxcblx0XHRcdHRoaXMudW50aXRsZWRXb3JraW5nQ29weU1vZGVsRmFjdG9yeSxcblx0XHRcdGFzeW5jICh3b3JraW5nQ29weSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNhdmVBcyh3b3JraW5nQ29weS5yZXNvdXJjZSwgdW5kZWZpbmVkLCBvcHRpb25zKTtcblxuXHRcdFx0XHRyZXR1cm4gISFyZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsIGxhYmVsU2VydmljZSwgbG9nU2VydmljZSwgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCB3b3JraW5nQ29weVNlcnZpY2Vcblx0XHQpKTtcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMub25EaWRDcmVhdGUgPSBFdmVudC5hbnk8SUZpbGVXb3JraW5nQ29weTxTIHwgVT4+KHRoaXMuc3RvcmVkLm9uRGlkQ3JlYXRlLCB0aGlzLnVudGl0bGVkLm9uRGlkQ3JlYXRlKTtcblxuXHRcdC8vIERlY29yYXRpb25zXG5cdFx0dGhpcy5wcm92aWRlRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBkZWNvcmF0aW9uc1xuXG5cdHByaXZhdGUgcHJvdmlkZURlY29yYXRpb25zKCk6IHZvaWQge1xuXG5cdFx0Ly8gRmlsZSB3b3JraW5nIGNvcHkgZGVjb3JhdGlvbnNcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBjbGFzcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cblx0XHRcdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ2ZpbGVXb3JraW5nQ29weURlY29yYXRpb25zJywgXCJGaWxlIFdvcmtpbmcgQ29weSBEZWNvcmF0aW9uc1wiKTtcblxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUklbXT4oKSk7XG5cdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHN0b3JlZDogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8Uz4pIHtcblx0XHRcdFx0c3VwZXIoKTtcblxuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHRcdFx0Ly8gQ3JlYXRlc1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JlZC5vbkRpZFJlc29sdmUod29ya2luZ0NvcHkgPT4ge1xuXHRcdFx0XHRcdGlmICh3b3JraW5nQ29weS5pc1JlYWRvbmx5KCkgfHwgd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbd29ya2luZ0NvcHkucmVzb3VyY2VdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBSZW1vdmFsczogb25jZSBhIHN0b3JlZCB3b3JraW5nIGNvcHkgaXMgbm8gbG9uZ2VyXG5cdFx0XHRcdC8vIHVuZGVyIG91ciBjb250cm9sLCBtYWtlIHN1cmUgdG8gc2lnbmFsIHRoaXMgYXNcblx0XHRcdFx0Ly8gZGVjb3JhdGlvbiBjaGFuZ2UgYmVjYXVzZSBmcm9tIHRoaXMgcG9pbnQgb24gd2Vcblx0XHRcdFx0Ly8gaGF2ZSBubyB3YXkgb2YgdXBkYXRpbmcgdGhlIGRlY29yYXRpb24gYW55bW9yZS5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yZWQub25EaWRSZW1vdmUod29ya2luZ0NvcHlVcmkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbd29ya2luZ0NvcHlVcmldKSkpO1xuXG5cdFx0XHRcdC8vIENoYW5nZXNcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yZWQub25EaWRDaGFuZ2VSZWFkb25seSh3b3JraW5nQ29weSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKFt3b3JraW5nQ29weS5yZXNvdXJjZV0pKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmVkLm9uRGlkQ2hhbmdlT3JwaGFuZWQod29ya2luZ0NvcHkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbd29ya2luZ0NvcHkucmVzb3VyY2VdKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnModXJpOiBVUkkpOiBJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjb25zdCB3b3JraW5nQ29weSA9IHRoaXMuc3RvcmVkLmdldCh1cmkpO1xuXHRcdFx0XHRpZiAoIXdvcmtpbmdDb3B5IHx8IHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc1JlYWRvbmx5ID0gd29ya2luZ0NvcHkuaXNSZWFkb25seSgpO1xuXHRcdFx0XHRjb25zdCBpc09ycGhhbmVkID0gd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOKTtcblxuXHRcdFx0XHQvLyBSZWFkb25seSArIE9ycGhhbmVkXG5cdFx0XHRcdGlmIChpc1JlYWRvbmx5ICYmIGlzT3JwaGFuZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29sb3I6IGxpc3RFcnJvckZvcmVncm91bmQsXG5cdFx0XHRcdFx0XHRsZXR0ZXI6IENvZGljb24ubG9ja1NtYWxsLFxuXHRcdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogdHJ1ZSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZWFkb25seUFuZERlbGV0ZWQnLCBcIkRlbGV0ZWQsIFJlYWQtb25seVwiKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVhZG9ubHlcblx0XHRcdFx0ZWxzZSBpZiAoaXNSZWFkb25seSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsZXR0ZXI6IENvZGljb24ubG9ja1NtYWxsLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlYWRvbmx5JywgXCJSZWFkLW9ubHlcIiksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ycGhhbmVkXG5cdFx0XHRcdGVsc2UgaWYgKGlzT3JwaGFuZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29sb3I6IGxpc3RFcnJvckZvcmVncm91bmQsXG5cdFx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiB0cnVlLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2RlbGV0ZWQnLCBcIkRlbGV0ZWRcIiksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSh0aGlzLnN0b3JlZCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gZ2V0IC8gZ2V0IGFsbFxuXG5cdGdldCB3b3JraW5nQ29waWVzKCk6IChJVW50aXRsZWRGaWxlV29ya2luZ0NvcHk8VT4gfCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+KVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuc3RvcmVkLndvcmtpbmdDb3BpZXMsIC4uLnRoaXMudW50aXRsZWQud29ya2luZ0NvcGllc107XG5cdH1cblxuXHRnZXQocmVzb3VyY2U6IFVSSSk6IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPiB8IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnN0b3JlZC5nZXQocmVzb3VyY2UpID8/IHRoaXMudW50aXRsZWQuZ2V0KHJlc291cmNlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiByZXNvbHZlXG5cblx0cmVzb2x2ZShvcHRpb25zPzogSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+Pjtcblx0cmVzb2x2ZShvcHRpb25zPzogSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5V2l0aEFzc29jaWF0ZWRSZXNvdXJjZU9wdGlvbnMpOiBQcm9taXNlPElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPj47XG5cdHJlc29sdmUob3B0aW9ucz86IElOZXdPckV4aXN0aW5nVW50aXRsZWRGaWxlV29ya2luZ0NvcHlPcHRpb25zKTogUHJvbWlzZTxJVW50aXRsZWRGaWxlV29ya2luZ0NvcHk8VT4+O1xuXHRyZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4+O1xuXHRyZXNvbHZlKGFyZzE/OiBVUkkgfCBJTmV3VW50aXRsZWRGaWxlV29ya2luZ0NvcHlPcHRpb25zIHwgSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5V2l0aEFzc29jaWF0ZWRSZXNvdXJjZU9wdGlvbnMgfCBJTmV3T3JFeGlzdGluZ1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucywgYXJnMj86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+IHwgSVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPj4ge1xuXHRcdGlmIChVUkkuaXNVcmkoYXJnMSkpIHtcblxuXHRcdFx0Ly8gVW50aXRsZWQ6IHZpYSB1bnRpdGxlZCBtYW5hZ2VyXG5cdFx0XHRpZiAoYXJnMS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudW50aXRsZWQucmVzb2x2ZSh7IHVudGl0bGVkUmVzb3VyY2U6IGFyZzEgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGVsc2U6IHZpYSBzdG9yZWQgZmlsZSBtYW5hZ2VyXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3RvcmVkLnJlc29sdmUoYXJnMSwgYXJnMik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudW50aXRsZWQucmVzb2x2ZShhcmcxKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTYXZlXG5cblx0YXN5bmMgc2F2ZUFzKHNvdXJjZTogVVJJLCB0YXJnZXQ/OiBVUkksIG9wdGlvbnM/OiBJRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gR2V0IHRvIHRhcmdldCByZXNvdXJjZVxuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRjb25zdCB3b3JraW5nQ29weSA9IHRoaXMuZ2V0KHNvdXJjZSk7XG5cdFx0XHRpZiAod29ya2luZ0NvcHkgaW5zdGFuY2VvZiBVbnRpdGxlZEZpbGVXb3JraW5nQ29weSAmJiB3b3JraW5nQ29weS5oYXNBc3NvY2lhdGVkRmlsZVBhdGgpIHtcblx0XHRcdFx0dGFyZ2V0ID0gYXdhaXQgdGhpcy5zdWdnZXN0U2F2ZVBhdGgoc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUoYXdhaXQgdGhpcy5zdWdnZXN0U2F2ZVBhdGgob3B0aW9ucz8uc3VnZ2VzdGVkVGFyZ2V0ID8/IHNvdXJjZSksIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB1c2VyIGNhbmNlbGVkXG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRhcmdldCBpcyBub3QgbWFya2VkIGFzIHJlYWRvbmx5IGFuZCBwcm9tcHQgb3RoZXJ3aXNlXG5cdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRhcmdldCkpIHtcblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IHRoaXMuY29uZmlybU1ha2VXcml0ZWFibGUodGFyZ2V0KTtcblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSZWFkb25seSh0YXJnZXQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBKdXN0IHNhdmUgaWYgdGFyZ2V0IGlzIHNhbWUgYXMgd29ya2luZyBjb3BpZXMgb3duIHJlc291cmNlXG5cdFx0Ly8gYW5kIHdlIGFyZSBub3Qgc2F2aW5nIGFuIHVudGl0bGVkIGZpbGUgd29ya2luZyBjb3B5XG5cdFx0aWYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoc291cmNlKSAmJiBpc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9TYXZlKHNvdXJjZSwgeyAuLi5vcHRpb25zLCBmb3JjZTogdHJ1ZSAgLyogZm9yY2UgdG8gc2F2ZSwgZXZlbiBpZiBub3QgZGlydHkgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85OTYxOSkgKi8gfSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHRhcmdldCBpcyBkaWZmZXJlbnQgYnV0IG9mIHNhbWUgaWRlbnRpdHksIHdlXG5cdFx0Ly8gbW92ZSB0aGUgc291cmNlIHRvIHRoZSB0YXJnZXQsIGtub3dpbmcgdGhhdCB0aGVcblx0XHQvLyB1bmRlcmx5aW5nIGZpbGUgc3lzdGVtIGNhbm5vdCBoYXZlIGJvdGggYW5kIHRoZW4gc2F2ZS5cblx0XHQvLyBIb3dldmVyLCB0aGlzIHdpbGwgb25seSB3b3JrIGlmIHRoZSBzb3VyY2UgZXhpc3RzXG5cdFx0Ly8gYW5kIGlzIG5vdCBvcnBoYW5lZCwgc28gd2UgbmVlZCB0byBjaGVjayB0aGF0IHRvby5cblx0XHRpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihzb3VyY2UpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSAmJiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoc291cmNlKSkpIHtcblxuXHRcdFx0Ly8gTW92ZSB2aWEgd29ya2luZyBjb3B5IGZpbGUgc2VydmljZSB0byBlbmFibGUgcGFydGljaXBhbnRzXG5cdFx0XHRhd2FpdCB0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UubW92ZShbeyBmaWxlOiB7IHNvdXJjZSwgdGFyZ2V0IH0gfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50IHdlIGRvbid0IGtub3cgd2hldGhlciB3ZSBoYXZlIGFcblx0XHRcdC8vIHdvcmtpbmcgY29weSBmb3IgdGhlIHNvdXJjZSBvciB0aGUgdGFyZ2V0IFVSSSBzbyB3ZVxuXHRcdFx0Ly8gc2ltcGx5IHRyeSB0byBzYXZlIHdpdGggYm90aCByZXNvdXJjZXMuXG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZG9TYXZlKHNvdXJjZSwgb3B0aW9ucykpID8/IChhd2FpdCB0aGlzLmRvU2F2ZSh0YXJnZXQsIG9wdGlvbnMpKTtcblx0XHR9XG5cblx0XHQvLyBQZXJmb3JtIG5vcm1hbCBcIlNhdmUgQXNcIlxuXHRcdHJldHVybiB0aGlzLmRvU2F2ZUFzKHNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4gfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIFNhdmUgaXMgb25seSBwb3NzaWJsZSB3aXRoIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzLFxuXHRcdC8vIGFueSBvdGhlciBoYXZlIHRvIGdvIHZpYSBgc2F2ZUFzYCBmbG93LlxuXHRcdGNvbnN0IHN0b3JlZEZpbGVXb3JraW5nQ29weSA9IHRoaXMuc3RvcmVkLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKHN0b3JlZEZpbGVXb3JraW5nQ29weSkge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHN0b3JlZEZpbGVXb3JraW5nQ29weS5zYXZlKG9wdGlvbnMpO1xuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlZEZpbGVXb3JraW5nQ29weTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NhdmVBcyhzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG9wdGlvbnM/OiBJRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBzb3VyY2VDb250ZW50czogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbTtcblxuXHRcdC8vIElmIHRoZSBzb3VyY2UgaXMgYW4gZXhpc3RpbmcgZmlsZSB3b3JraW5nIGNvcHksIHdlIGNhbiBkaXJlY3RseVxuXHRcdC8vIHVzZSB0aGF0IHRvIGNvcHkgdGhlIGNvbnRlbnRzIHRvIHRoZSB0YXJnZXQgZGVzdGluYXRpb25cblx0XHRjb25zdCBzb3VyY2VXb3JraW5nQ29weSA9IHRoaXMuZ2V0KHNvdXJjZSk7XG5cdFx0aWYgKHNvdXJjZVdvcmtpbmdDb3B5Py5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHNvdXJjZUNvbnRlbnRzID0gYXdhaXQgc291cmNlV29ya2luZ0NvcHkubW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LlNhdmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSB3ZSByZXNvbHZlIHRoZSBjb250ZW50cyBmcm9tIHRoZSB1bmRlcmx5aW5nIGZpbGVcblx0XHRlbHNlIHtcblx0XHRcdHNvdXJjZUNvbnRlbnRzID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0oc291cmNlKSkudmFsdWU7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0YXJnZXRcblx0XHRjb25zdCB7IHRhcmdldEZpbGVFeGlzdHMsIHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weSB9ID0gYXdhaXQgdGhpcy5kb1Jlc29sdmVTYXZlVGFyZ2V0KHNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdC8vIENvbmZpcm0gdG8gb3ZlcndyaXRlIGlmIHdlIGhhdmUgYW4gdW50aXRsZWQgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCBhc3NvY2lhdGVkIHBhdGggd2hlcmVcblx0XHQvLyB0aGUgZmlsZSBhY3R1YWxseSBleGlzdHMgb24gZGlzayBhbmQgd2UgYXJlIGluc3RydWN0ZWQgdG8gc2F2ZSB0byB0aGF0IGZpbGUgcGF0aC5cblx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gaWYgdGhlIGZpbGUgd2FzIGNyZWF0ZWQgYWZ0ZXIgdGhlIHVudGl0bGVkIGZpbGUgd2FzIG9wZW5lZC5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY3OTQ2XG5cdFx0aWYgKFxuXHRcdFx0c291cmNlV29ya2luZ0NvcHkgaW5zdGFuY2VvZiBVbnRpdGxlZEZpbGVXb3JraW5nQ29weSAmJlxuXHRcdFx0c291cmNlV29ya2luZ0NvcHkuaGFzQXNzb2NpYXRlZEZpbGVQYXRoICYmXG5cdFx0XHR0YXJnZXRGaWxlRXhpc3RzICYmXG5cdFx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0YXJnZXQsIHRvTG9jYWxSZXNvdXJjZShzb3VyY2VXb3JraW5nQ29weS5yZXNvdXJjZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpKVxuXHRcdCkge1xuXHRcdFx0Y29uc3Qgb3ZlcndyaXRlID0gYXdhaXQgdGhpcy5jb25maXJtT3ZlcndyaXRlKHRhcmdldCk7XG5cdFx0XHRpZiAoIW92ZXJ3cml0ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRha2Ugb3ZlciBjb250ZW50IGZyb20gc291cmNlIHRvIHRhcmdldFxuXHRcdGF3YWl0IHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weS5tb2RlbD8udXBkYXRlKHNvdXJjZUNvbnRlbnRzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFNldCBzb3VyY2Ugb3B0aW9ucyBkZXBlbmRpbmcgb24gdGFyZ2V0IGV4aXN0cyBvciBub3Rcblx0XHRpZiAoIW9wdGlvbnM/LnNvdXJjZSkge1xuXHRcdFx0b3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0c291cmNlOiB0YXJnZXRGaWxlRXhpc3RzID8gRmlsZVdvcmtpbmdDb3B5TWFuYWdlci5GSUxFX1dPUktJTkdfQ09QWV9TQVZFX1JFUExBQ0VfU09VUkNFIDogRmlsZVdvcmtpbmdDb3B5TWFuYWdlci5GSUxFX1dPUktJTkdfQ09QWV9TQVZFX0NSRUFURV9TT1VSQ0Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gU2F2ZSB0YXJnZXRcblx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5LnNhdmUoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGZyb206IHNvdXJjZSxcblx0XHRcdGZvcmNlOiB0cnVlICAvKiBmb3JjZSB0byBzYXZlLCBldmVuIGlmIG5vdCBkaXJ0eSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk5NjE5KSAqL1xuXHRcdH0pO1xuXHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBSZXZlcnQgdGhlIHNvdXJjZVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzb3VyY2VXb3JraW5nQ29weT8ucmV2ZXJ0KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCByZXZlcnRpbmcgdGhlIHNvdXJjZSBmYWlscywgZm9yIGV4YW1wbGVcblx0XHRcdC8vIHdoZW4gYSByZW1vdGUgaXMgZGlzY29ubmVjdGVkIGFuZCB3ZSBjYW5ub3QgcmVhZCBpdCBhbnltb3JlLlxuXHRcdFx0Ly8gSG93ZXZlciwgdGhpcyBzaG91bGQgbm90IGludGVycnVwdCB0aGUgXCJTYXZlIEFzXCIgZmxvdywgc29cblx0XHRcdC8vIHdlIGdyYWNlZnVsbHkgY2F0Y2ggdGhlIGVycm9yIGFuZCBqdXN0IGxvZyBpdC5cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudHNcblx0XHRpZiAoc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0dGhpcy51bnRpdGxlZC5ub3RpZnlEaWRTYXZlKHNvdXJjZSwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVTYXZlVGFyZ2V0KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8eyB0YXJnZXRGaWxlRXhpc3RzOiBib29sZWFuOyB0YXJnZXRTdG9yZWRGaWxlV29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4gfT4ge1xuXG5cdFx0Ly8gUHJlZmVyIGFuIGV4aXN0aW5nIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpZiBpdCBpcyBhbHJlYWR5IHJlc29sdmVkXG5cdFx0Ly8gZm9yIHRoZSBnaXZlbiB0YXJnZXQgcmVzb3VyY2Vcblx0XHRsZXQgdGFyZ2V0RmlsZUV4aXN0cyA9IGZhbHNlO1xuXHRcdGxldCB0YXJnZXRTdG9yZWRGaWxlV29ya2luZ0NvcHkgPSB0aGlzLnN0b3JlZC5nZXQodGFyZ2V0KTtcblx0XHRpZiAodGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5Py5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHRhcmdldEZpbGVFeGlzdHMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBjcmVhdGUgdGhlIHRhcmdldCB3b3JraW5nIGNvcHkgZW1wdHkgaWZcblx0XHQvLyBpdCBkb2VzIG5vdCBleGlzdCBhbHJlYWR5IGFuZCByZXNvbHZlIGl0IGZyb20gdGhlcmVcblx0XHRlbHNlIHtcblx0XHRcdHRhcmdldEZpbGVFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0YXJnZXQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgdGFyZ2V0IGZpbGUgYWRob2MgaWYgaXQgZG9lcyBub3QgZXhpc3QgeWV0XG5cdFx0XHRpZiAoIXRhcmdldEZpbGVFeGlzdHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZTogdGFyZ2V0IH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBuZWVkIHRvIHJlc29sdmUgdGhlIHRhcmdldCB3b3JraW5nIGNvcHlcblx0XHRcdC8vIGFuZCB3ZSBoYXZlIHRvIGRvIGFuIGV4cGxpY2l0IGNoZWNrIGlmIHRoZSBzb3VyY2UgVVJJXG5cdFx0XHQvLyBlcXVhbHMgdGhlIHRhcmdldCB2aWEgVVJJIGlkZW50aXR5LiBJZiB0aGV5IG1hdGNoIGFuZCB3ZVxuXHRcdFx0Ly8gaGF2ZSBoYWQgYW4gZXhpc3Rpbmcgd29ya2luZyBjb3B5IHdpdGggdGhlIHNvdXJjZSwgd2Vcblx0XHRcdC8vIHByZWZlciB0aGF0IG9uZSBvdmVyIHJlc29sdmluZyB0aGUgdGFyZ2V0LiBPdGhlcndpc2Ugd2Vcblx0XHRcdC8vIHdvdWxkIHBvdGVudGlhbGx5IGludHJvZHVjZSBhXG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLCB0YXJnZXQpICYmIHRoaXMuZ2V0KHNvdXJjZSkpIHtcblx0XHRcdFx0dGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5ID0gYXdhaXQgdGhpcy5zdG9yZWQucmVzb2x2ZShzb3VyY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5ID0gYXdhaXQgdGhpcy5zdG9yZWQucmVzb2x2ZSh0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHRhcmdldEZpbGVFeGlzdHMsIHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtT3ZlcndyaXRlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1PdmVyd3JpdGUnLCBcIid7MH0nIGFscmVhZHkgZXhpc3RzLiBEbyB5b3Ugd2FudCB0byByZXBsYWNlIGl0P1wiLCBiYXNlbmFtZShyZXNvdXJjZSkpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnb3ZlcndyaXRlSXJyZXZlcnNpYmxlJywgXCJBIGZpbGUgb3IgZm9sZGVyIHdpdGggdGhlIG5hbWUgJ3swfScgYWxyZWFkeSBleGlzdHMgaW4gdGhlIGZvbGRlciAnezF9Jy4gUmVwbGFjaW5nIGl0IHdpbGwgb3ZlcndyaXRlIGl0cyBjdXJyZW50IGNvbnRlbnRzLlwiLCBiYXNlbmFtZShyZXNvdXJjZSksIGJhc2VuYW1lKGRpcm5hbWUocmVzb3VyY2UpKSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2VCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlcGxhY2VcIilcblx0XHR9KTtcblxuXHRcdHJldHVybiBjb25maXJtZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbmZpcm1NYWtlV3JpdGVhYmxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1NYWtlV3JpdGVhYmxlJywgXCInezB9JyBpcyBtYXJrZWQgYXMgcmVhZC1vbmx5LiBEbyB5b3Ugd2FudCB0byBzYXZlIGFueXdheT9cIiwgYmFzZW5hbWUocmVzb3VyY2UpKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1NYWtlV3JpdGVhYmxlRGV0YWlsJywgXCJQYXRocyBjYW4gYmUgY29uZmlndXJlZCBhcyByZWFkLW9ubHkgdmlhIHNldHRpbmdzLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnbWFrZVdyaXRlYWJsZUJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2F2ZSBBbnl3YXlcIilcblx0XHR9KTtcblxuXHRcdHJldHVybiBjb25maXJtZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Z2dlc3RTYXZlUGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblxuXHRcdC8vIDEuKSBKdXN0IHRha2UgdGhlIHJlc291cmNlIGFzIGlzIGlmIHRoZSBmaWxlIHNlcnZpY2UgY2FuIGhhbmRsZSBpdFxuXHRcdGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdH1cblxuXHRcdC8vIDIuKSBQaWNrIHRoZSBhc3NvY2lhdGVkIGZpbGUgcGF0aCBmb3IgdW50aXRsZWQgd29ya2luZyBjb3BpZXMgaWYgYW55XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSB0aGlzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKHdvcmtpbmdDb3B5IGluc3RhbmNlb2YgVW50aXRsZWRGaWxlV29ya2luZ0NvcHkgJiYgd29ya2luZ0NvcHkuaGFzQXNzb2NpYXRlZEZpbGVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdG9Mb2NhbFJlc291cmNlKHJlc291cmNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksIHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEZpbGVQYXRoID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKTtcblxuXHRcdC8vIDMuKSBQaWNrIHRoZSB3b3JraW5nIGNvcHkgbmFtZSBpZiB2YWxpZCBqb2luZWQgd2l0aCBkZWZhdWx0IHBhdGhcblx0XHRpZiAod29ya2luZ0NvcHkpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZVBhdGggPSBqb2luUGF0aChkZWZhdWx0RmlsZVBhdGgsIHdvcmtpbmdDb3B5Lm5hbWUpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMucGF0aFNlcnZpY2UuaGFzVmFsaWRCYXNlbmFtZShjYW5kaWRhdGVQYXRoLCB3b3JraW5nQ29weS5uYW1lKSkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlUGF0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyA0LikgRmluYWxseSBmYWxsYmFjayB0byB0aGUgbmFtZSBvZiB0aGUgcmVzb3VyY2Ugam9pbmVkIHdpdGggZGVmYXVsdCBwYXRoXG5cdFx0cmV0dXJuIGpvaW5QYXRoKGRlZmF1bHRGaWxlUGF0aCwgYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBMaWZlY3ljbGVcblxuXHRhc3luYyBkZXN0cm95KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0dGhpcy5zdG9yZWQuZGVzdHJveSgpLFxuXHRcdFx0dGhpcy51bnRpdGxlZC5kZXN0cm95KClcblx0XHRdKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixVQUFVLFNBQVMsVUFBVSxlQUFlO0FBQ3RFLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQixzQkFBc0I7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBdUIsMEJBQTBCO0FBQ2pELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNB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
