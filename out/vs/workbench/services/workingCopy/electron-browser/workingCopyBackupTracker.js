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
import { IWorkingCopyBackupService } from "../common/workingCopyBackup.js";
import { IFilesConfigurationService, AutoSaveMode } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyService } from "../common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../common/workingCopy.js";
import { ILifecycleService, ShutdownReason } from "../../lifecycle/common/lifecycle.js";
import { ConfirmResult, IFileDialogService, IDialogService, getFileNamesMessage } from "../../../../platform/dialogs/common/dialogs.js";
import { WorkbenchState, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { HotExitConfiguration } from "../../../../platform/files/common/files.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { WorkingCopyBackupTracker } from "../common/workingCopyBackupTracker.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { SaveReason } from "../../../common/editor.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Promises, raceCancellation } from "../../../../base/common/async.js";
import { IWorkingCopyEditorService } from "../common/workingCopyEditorService.js";
let NativeWorkingCopyBackupTracker = class extends WorkingCopyBackupTracker {
  constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, environmentService, progressService, workingCopyEditorService, editorService) {
    super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService);
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.contextService = contextService;
    this.nativeHostService = nativeHostService;
    this.environmentService = environmentService;
    this.progressService = progressService;
  }
  async onFinalBeforeShutdown(reason) {
    this.cancelBackupOperations();
    const { resume } = this.suspendBackupOperations();
    try {
      const modifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
      if (modifiedWorkingCopies.length) {
        return await this.onBeforeShutdownWithModified(reason, modifiedWorkingCopies);
      } else {
        return await this.onBeforeShutdownWithoutModified();
      }
    } finally {
      resume();
    }
  }
  async onBeforeShutdownWithModified(reason, modifiedWorkingCopies) {
    const workingCopiesToAutoSave = modifiedWorkingCopies.filter((wc) => !(wc.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.getAutoSaveMode(wc.resource).mode !== AutoSaveMode.OFF);
    if (workingCopiesToAutoSave.length > 0) {
      try {
        await this.doSaveAllBeforeShutdown(workingCopiesToAutoSave, SaveReason.AUTO);
      } catch (error) {
        this.logService.error(`[backup tracker] error saving modified working copies: ${error}`);
      }
      const remainingModifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
      if (remainingModifiedWorkingCopies.length) {
        return this.handleModifiedBeforeShutdown(remainingModifiedWorkingCopies, reason);
      }
      return this.noVeto([...modifiedWorkingCopies]);
    }
    return this.handleModifiedBeforeShutdown(modifiedWorkingCopies, reason);
  }
  async handleModifiedBeforeShutdown(modifiedWorkingCopies, reason) {
    let backups = [];
    let backupError = void 0;
    const modifiedWorkingCopiesToBackup = await this.shouldBackupBeforeShutdown(reason, modifiedWorkingCopies);
    if (modifiedWorkingCopiesToBackup.length > 0) {
      try {
        const backupResult = await this.backupBeforeShutdown(modifiedWorkingCopiesToBackup);
        backups = backupResult.backups;
        backupError = backupResult.error;
        if (backups.length === modifiedWorkingCopies.length) {
          return false;
        }
      } catch (error) {
        backupError = error;
      }
    }
    const remainingModifiedWorkingCopies = modifiedWorkingCopies.filter((workingCopy) => !backups.includes(workingCopy));
    if (backupError) {
      if (this.environmentService.isExtensionDevelopment) {
        this.logService.error(`[backup tracker] error creating backups: ${backupError}`);
        return false;
      }
      return this.showErrorDialog(localize("backupTrackerBackupFailed", "The following editors with unsaved changes could not be saved to the backup location."), remainingModifiedWorkingCopies, backupError, reason);
    }
    try {
      return await this.confirmBeforeShutdown(remainingModifiedWorkingCopies);
    } catch (error) {
      if (this.environmentService.isExtensionDevelopment) {
        this.logService.error(`[backup tracker] error saving or reverting modified working copies: ${error}`);
        return false;
      }
      return this.showErrorDialog(localize("backupTrackerConfirmFailed", "The following editors with unsaved changes could not be saved or reverted."), remainingModifiedWorkingCopies, error, reason);
    }
  }
  async shouldBackupBeforeShutdown(reason, modifiedWorkingCopies) {
    if (!this.filesConfigurationService.isHotExitEnabled) {
      return [];
    }
    if (this.environmentService.isExtensionDevelopment) {
      return modifiedWorkingCopies;
    }
    switch (reason) {
      // Window Close
      case ShutdownReason.CLOSE:
        if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
          return modifiedWorkingCopies;
        }
        if (isMacintosh || await this.nativeHostService.getWindowCount() > 1) {
          if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
            return modifiedWorkingCopies.filter((modifiedWorkingCopy) => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad);
          }
          return [];
        }
        return modifiedWorkingCopies;
      // backup if last window is closed on win/linux where the application quits right after
      // Application Quit
      case ShutdownReason.QUIT:
        return modifiedWorkingCopies;
      // backup because next start we restore all backups
      // Window Reload
      case ShutdownReason.RELOAD:
        return modifiedWorkingCopies;
      // backup because after window reload, backups restore
      // Workspace Change
      case ShutdownReason.LOAD:
        if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
          if (this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
            return modifiedWorkingCopies;
          }
          return modifiedWorkingCopies.filter((modifiedWorkingCopy) => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad);
        }
        return [];
    }
  }
  async showErrorDialog(message, workingCopies, error, reason) {
    this.logService.error(`[backup tracker] ${message}: ${error}`);
    const modifiedWorkingCopies = workingCopies.filter((workingCopy) => workingCopy.isModified());
    const advice = localize("backupErrorDetails", "Try saving or reverting the editors with unsaved changes first and then try again.");
    const detail = modifiedWorkingCopies.length ? `${getFileNamesMessage(modifiedWorkingCopies.map((x) => x.name))}
${advice}` : advice;
    const { result } = await this.dialogService.prompt({
      type: "error",
      message,
      detail,
      buttons: [
        {
          label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
          run: () => true
          // veto
        },
        {
          label: this.toForceShutdownLabel(reason),
          run: () => false
          // no veto
        }
      ]
    });
    return result ?? true;
  }
  toForceShutdownLabel(reason) {
    switch (reason) {
      case ShutdownReason.CLOSE:
      case ShutdownReason.LOAD:
        return localize("shutdownForceClose", "Close Anyway");
      case ShutdownReason.QUIT:
        return localize("shutdownForceQuit", "Quit Anyway");
      case ShutdownReason.RELOAD:
        return localize("shutdownForceReload", "Reload Anyway");
    }
  }
  async backupBeforeShutdown(modifiedWorkingCopies) {
    const backups = [];
    let error = void 0;
    await this.withProgressAndCancellation(
      async (token) => {
        try {
          await Promises.settled(modifiedWorkingCopies.map(async (workingCopy) => {
            const contentVersion = this.getContentVersion(workingCopy);
            if (this.workingCopyBackupService.hasBackupSync(workingCopy, contentVersion)) {
              backups.push(workingCopy);
            } else {
              const backup = await workingCopy.backup(token);
              if (token.isCancellationRequested) {
                return;
              }
              await this.workingCopyBackupService.backup(workingCopy, backup.content, contentVersion, backup.meta, token);
              if (token.isCancellationRequested) {
                return;
              }
              backups.push(workingCopy);
            }
          }));
        } catch (backupError) {
          error = backupError;
        }
      },
      localize("backupBeforeShutdownMessage", "Backing up editors with unsaved changes is taking a bit longer..."),
      localize("backupBeforeShutdownDetail", "Click 'Cancel' to stop waiting and to save or revert editors with unsaved changes.")
    );
    return { backups, error };
  }
  async confirmBeforeShutdown(modifiedWorkingCopies) {
    const confirm = await this.fileDialogService.showSaveConfirm(modifiedWorkingCopies.map((workingCopy) => workingCopy.name));
    if (confirm === ConfirmResult.SAVE) {
      const modifiedCountBeforeSave = this.workingCopyService.modifiedCount;
      try {
        await this.doSaveAllBeforeShutdown(modifiedWorkingCopies, SaveReason.EXPLICIT);
      } catch (error) {
        this.logService.error(`[backup tracker] error saving modified working copies: ${error}`);
      }
      const savedWorkingCopies = modifiedCountBeforeSave - this.workingCopyService.modifiedCount;
      if (savedWorkingCopies < modifiedWorkingCopies.length) {
        return true;
      }
      return this.noVeto(modifiedWorkingCopies);
    } else if (confirm === ConfirmResult.DONT_SAVE) {
      try {
        await this.doRevertAllBeforeShutdown(modifiedWorkingCopies);
      } catch (error) {
        this.logService.error(`[backup tracker] error reverting modified working copies: ${error}`);
      }
      return this.noVeto(modifiedWorkingCopies);
    }
    return true;
  }
  doSaveAllBeforeShutdown(workingCopies, reason) {
    return this.withProgressAndCancellation(
      async () => {
        const saveOptions = { skipSaveParticipants: true, reason };
        let result = void 0;
        if (workingCopies.length === this.workingCopyService.modifiedCount) {
          result = (await this.editorService.saveAll({
            includeUntitled: { includeScratchpad: true },
            ...saveOptions
          })).success;
        }
        if (result !== false) {
          await Promises.settled(workingCopies.map((workingCopy) => workingCopy.isModified() ? workingCopy.save(saveOptions) : Promise.resolve(true)));
        }
      },
      localize("saveBeforeShutdown", "Saving editors with unsaved changes is taking a bit longer..."),
      void 0,
      // Do not pick `Dialog` as location for reporting progress if it is likely
      // that the save operation will itself open a dialog for asking for the
      // location to save to for untitled or scratchpad working copies.
      // https://github.com/microsoft/vscode-internalbacklog/issues/4943
      workingCopies.some((workingCopy) => workingCopy.capabilities & WorkingCopyCapabilities.Untitled || workingCopy.capabilities & WorkingCopyCapabilities.Scratchpad) ? ProgressLocation.Window : ProgressLocation.Dialog
    );
  }
  doRevertAllBeforeShutdown(modifiedWorkingCopies) {
    return this.withProgressAndCancellation(async () => {
      const revertOptions = { soft: true };
      if (modifiedWorkingCopies.length === this.workingCopyService.modifiedCount) {
        await this.editorService.revertAll(revertOptions);
      }
      await Promises.settled(modifiedWorkingCopies.map((workingCopy) => workingCopy.isModified() ? workingCopy.revert(revertOptions) : Promise.resolve()));
    }, localize("revertBeforeShutdown", "Reverting editors with unsaved changes is taking a bit longer..."));
  }
  onBeforeShutdownWithoutModified() {
    return this.noVeto({ except: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? [] : Array.from(this.unrestoredBackups) });
  }
  async noVeto(arg1) {
    await this.discardBackupsBeforeShutdown(arg1);
    return false;
  }
  async discardBackupsBeforeShutdown(arg1) {
    if (!this.isReady) {
      return;
    }
    await this.withProgressAndCancellation(async () => {
      try {
        if (Array.isArray(arg1)) {
          await Promises.settled(arg1.map((workingCopy) => this.workingCopyBackupService.discardBackup(workingCopy)));
        } else {
          await this.workingCopyBackupService.discardBackups(arg1);
        }
      } catch (error) {
        this.logService.error(`[backup tracker] error discarding backups: ${error}`);
      }
    }, localize("discardBackupsBeforeShutdown", "Discarding backups is taking a bit longer..."));
  }
  withProgressAndCancellation(promiseFactory, title, detail, location = ProgressLocation.Dialog) {
    const cts = new CancellationTokenSource();
    return this.progressService.withProgress({
      location,
      // by default use a dialog to prevent the user from making any more changes now (https://github.com/microsoft/vscode/issues/122774)
      cancellable: true,
      // allow to cancel (https://github.com/microsoft/vscode/issues/112278)
      delay: 800,
      // delay so that it only appears when operation takes a long time
      title,
      detail
    }, () => raceCancellation(promiseFactory(cts.token), cts.token), () => cts.dispose(true));
  }
};
NativeWorkingCopyBackupTracker.ID = "workbench.contrib.nativeWorkingCopyBackupTracker";
NativeWorkingCopyBackupTracker = __decorateClass([
  __decorateParam(0, IWorkingCopyBackupService),
  __decorateParam(1, IFilesConfigurationService),
  __decorateParam(2, IWorkingCopyService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, INativeHostService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IEnvironmentService),
  __decorateParam(10, IProgressService),
  __decorateParam(11, IWorkingCopyEditorService),
  __decorateParam(12, IEditorService)
], NativeWorkingCopyBackupTracker);
export {
  NativeWorkingCopyBackupTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcZWxlY3Ryb24tYnJvd3Nlclxcd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIEF1dG9TYXZlTW9kZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHksIElXb3JraW5nQ29weUlkZW50aWZpZXIsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbmZpcm1SZXN1bHQsIElGaWxlRGlhbG9nU2VydmljZSwgSURpYWxvZ1NlcnZpY2UsIGdldEZpbGVOYW1lc01lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFN0YXRlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEhvdEV4aXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciB9IGZyb20gJy4uL2NvbW1vbi93b3JraW5nQ29weUJhY2t1cFRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlV29ya2luZ0NvcHlCYWNrdXBUcmFja2VyIGV4dGVuZHMgV29ya2luZ0NvcHlCYWNrdXBUcmFja2VyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwVHJhY2tlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Ugd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB3b3JraW5nQ29weUVkaXRvclNlcnZpY2U6IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIHdvcmtpbmdDb3B5U2VydmljZSwgbG9nU2VydmljZSwgbGlmZWN5Y2xlU2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBvbkZpbmFsQmVmb3JlU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gSW1wb3J0YW50OiB3ZSBhcmUgYWJvdXQgdG8gc2h1dGRvd24gYW5kIGhhbmRsZSBtb2RpZmllZCB3b3JraW5nIGNvcGllc1xuXHRcdC8vIGFuZCBiYWNrdXBzLiBXZSBkbyBub3Qgd2FudCBhbnkgcGVuZGluZyBiYWNrdXAgb3BzIHRvIGludGVyZmVyIHdpdGhcblx0XHQvLyB0aGlzIGJlY2F1c2UgdGhlcmUgaXMgYSByaXNrIG9mIGEgYmFja3VwIGJlaW5nIHNjaGVkdWxlZCBhZnRlciB3ZSBoYXZlXG5cdFx0Ly8gYWNrbm93bGVkZ2VkIHRvIHNodXRkb3duIGFuZCB0aGVuIG1pZ2h0IGVuZCB1cCB3aXRoIHBhcnRpYWwgYmFja3Vwc1xuXHRcdC8vIHdyaXR0ZW4gdG8gZGlzaywgb3IgZXZlbiBlbXB0eSBiYWNrdXBzIG9yIGRlbGV0ZXMgYWZ0ZXIgd3JpdGVzLlxuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM4MDU1KVxuXG5cdFx0dGhpcy5jYW5jZWxCYWNrdXBPcGVyYXRpb25zKCk7XG5cblx0XHQvLyBGb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBzaHV0ZG93biBoYW5kbGluZywgc3VzcGVuZCBiYWNrdXAgb3BlcmF0aW9uc1xuXHRcdC8vIGFuZCBvbmx5IHJlc3VtZSBhZnRlciB3ZSBoYXZlIGhhbmRsZWQgYmFja3Vwcy4gU2ltaWxhciB0byBhYm92ZSwgd2Vcblx0XHQvLyBkbyBub3Qgd2FudCB0byB0cmlnZ2VyIGJhY2t1cCB0cmFja2luZyBkdXJpbmcgb3VyIHNodXRkb3duIGhhbmRsaW5nXG5cdFx0Ly8gYnV0IHdlIG11c3QgcmVzdW1lLCBpbiBjYXNlIG9mIGEgdmV0byBhZnRlcndhcmRzLlxuXG5cdFx0Y29uc3QgeyByZXN1bWUgfSA9IHRoaXMuc3VzcGVuZEJhY2t1cE9wZXJhdGlvbnMoKTtcblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIE1vZGlmaWVkIHdvcmtpbmcgY29waWVzIG5lZWQgdHJlYXRtZW50IG9uIHNodXRkb3duXG5cdFx0XHRjb25zdCBtb2RpZmllZFdvcmtpbmdDb3BpZXMgPSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5tb2RpZmllZFdvcmtpbmdDb3BpZXM7XG5cdFx0XHRpZiAobW9kaWZpZWRXb3JraW5nQ29waWVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5vbkJlZm9yZVNodXRkb3duV2l0aE1vZGlmaWVkKHJlYXNvbiwgbW9kaWZpZWRXb3JraW5nQ29waWVzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTm8gbW9kaWZpZWQgd29ya2luZyBjb3BpZXNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5vbkJlZm9yZVNodXRkb3duV2l0aG91dE1vZGlmaWVkKCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc3VtZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBvbkJlZm9yZVNodXRkb3duV2l0aE1vZGlmaWVkKHJlYXNvbjogU2h1dGRvd25SZWFzb24sIG1vZGlmaWVkV29ya2luZ0NvcGllczogcmVhZG9ubHkgSVdvcmtpbmdDb3B5W10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIElmIGF1dG8gc2F2ZSBpcyBlbmFibGVkLCBzYXZlIGFsbCBub24tdW50aXRsZWQgd29ya2luZyBjb3BpZXNcblx0XHQvLyBhbmQgdGhlbiBjaGVjayBhZ2FpbiBmb3IgbW9kaWZpZWQgY29waWVzXG5cblx0XHRjb25zdCB3b3JraW5nQ29waWVzVG9BdXRvU2F2ZSA9IG1vZGlmaWVkV29ya2luZ0NvcGllcy5maWx0ZXIod2MgPT4gISh3Yy5jYXBhYmlsaXRpZXMgJiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCkgJiYgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEF1dG9TYXZlTW9kZSh3Yy5yZXNvdXJjZSkubW9kZSAhPT0gQXV0b1NhdmVNb2RlLk9GRik7XG5cdFx0aWYgKHdvcmtpbmdDb3BpZXNUb0F1dG9TYXZlLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gU2F2ZSBhbGwgbW9kaWZpZWQgd29ya2luZyBjb3BpZXMgdGhhdCBjYW4gYmUgYXV0by1zYXZlZFxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1NhdmVBbGxCZWZvcmVTaHV0ZG93bih3b3JraW5nQ29waWVzVG9BdXRvU2F2ZSwgU2F2ZVJlYXNvbi5BVVRPKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSBlcnJvciBzYXZpbmcgbW9kaWZpZWQgd29ya2luZyBjb3BpZXM6ICR7ZXJyb3J9YCk7IC8vIGd1YXJkIGFnYWluc3QgbWlzYmVoYXZpbmcgc2F2ZXMsIHdlIGhhbmRsZSByZW1haW5pbmcgbW9kaWZpZWQgYmVsb3dcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2Ugc3RpbGwgaGF2ZSBtb2RpZmllZCB3b3JraW5nIGNvcGllcywgd2UgZWl0aGVyIGhhdmUgdW50aXRsZWQgb25lcyBvciB3b3JraW5nIGNvcGllcyB0aGF0IGNhbm5vdCBiZSBzYXZlZFxuXHRcdFx0Y29uc3QgcmVtYWluaW5nTW9kaWZpZWRXb3JraW5nQ29waWVzID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UubW9kaWZpZWRXb3JraW5nQ29waWVzO1xuXHRcdFx0aWYgKHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlTW9kaWZpZWRCZWZvcmVTaHV0ZG93bihyZW1haW5pbmdNb2RpZmllZFdvcmtpbmdDb3BpZXMsIHJlYXNvbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLm5vVmV0byhbLi4ubW9kaWZpZWRXb3JraW5nQ29waWVzXSk7IC8vIG5vIHZldG8gKG1vZGlmaWVkIGF1dG8tc2F2ZWQpXG5cdFx0fVxuXG5cdFx0Ly8gQXV0byBzYXZlIGlzIG5vdCBlbmFibGVkXG5cdFx0cmV0dXJuIHRoaXMuaGFuZGxlTW9kaWZpZWRCZWZvcmVTaHV0ZG93bihtb2RpZmllZFdvcmtpbmdDb3BpZXMsIHJlYXNvbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU1vZGlmaWVkQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzOiByZWFkb25seSBJV29ya2luZ0NvcHlbXSwgcmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gVHJpZ2dlciBiYWNrdXAgaWYgY29uZmlndXJlZCBhbmQgZW5hYmxlZCBmb3Igc2h1dGRvd24gcmVhc29uXG5cdFx0bGV0IGJhY2t1cHM6IElXb3JraW5nQ29weVtdID0gW107XG5cdFx0bGV0IGJhY2t1cEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtb2RpZmllZFdvcmtpbmdDb3BpZXNUb0JhY2t1cCA9IGF3YWl0IHRoaXMuc2hvdWxkQmFja3VwQmVmb3JlU2h1dGRvd24ocmVhc29uLCBtb2RpZmllZFdvcmtpbmdDb3BpZXMpO1xuXHRcdGlmIChtb2RpZmllZFdvcmtpbmdDb3BpZXNUb0JhY2t1cC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBiYWNrdXBSZXN1bHQgPSBhd2FpdCB0aGlzLmJhY2t1cEJlZm9yZVNodXRkb3duKG1vZGlmaWVkV29ya2luZ0NvcGllc1RvQmFja3VwKTtcblx0XHRcdFx0YmFja3VwcyA9IGJhY2t1cFJlc3VsdC5iYWNrdXBzO1xuXHRcdFx0XHRiYWNrdXBFcnJvciA9IGJhY2t1cFJlc3VsdC5lcnJvcjtcblxuXHRcdFx0XHRpZiAoYmFja3Vwcy5sZW5ndGggPT09IG1vZGlmaWVkV29ya2luZ0NvcGllcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vIHZldG8gKGJhY2t1cCB3YXMgc3VjY2Vzc2Z1bCBmb3IgYWxsIHdvcmtpbmcgY29waWVzKVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRiYWNrdXBFcnJvciA9IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcyA9IG1vZGlmaWVkV29ya2luZ0NvcGllcy5maWx0ZXIod29ya2luZ0NvcHkgPT4gIWJhY2t1cHMuaW5jbHVkZXMod29ya2luZ0NvcHkpKTtcblxuXHRcdC8vIFdlIHJhbiBhIGJhY2t1cCBidXQgcmVjZWl2ZWQgYW4gZXJyb3IgdGhhdCB3ZSBzaG93IHRvIHRoZSB1c2VyXG5cdFx0aWYgKGJhY2t1cEVycm9yKSB7XG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtiYWNrdXAgdHJhY2tlcl0gZXJyb3IgY3JlYXRpbmcgYmFja3VwczogJHtiYWNrdXBFcnJvcn1gKTtcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGRvIG5vdCBibG9jayBzaHV0ZG93biBkdXJpbmcgZXh0ZW5zaW9uIGRldmVsb3BtZW50IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE1MDI4KVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93RXJyb3JEaWFsb2cobG9jYWxpemUoJ2JhY2t1cFRyYWNrZXJCYWNrdXBGYWlsZWQnLCBcIlRoZSBmb2xsb3dpbmcgZWRpdG9ycyB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBjb3VsZCBub3QgYmUgc2F2ZWQgdG8gdGhlIGJhY2t1cCBsb2NhdGlvbi5cIiksIHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcywgYmFja3VwRXJyb3IsIHJlYXNvbik7XG5cdFx0fVxuXG5cdFx0Ly8gU2luY2UgYSBiYWNrdXAgZGlkIG5vdCBoYXBwZW4sIHdlIGhhdmUgdG8gY29uZmlybSBmb3Jcblx0XHQvLyB0aGUgd29ya2luZyBjb3BpZXMgdGhhdCBkaWQgbm90IHN1Y2Nlc3NmdWxseSBiYWNrdXBcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5jb25maXJtQmVmb3JlU2h1dGRvd24ocmVtYWluaW5nTW9kaWZpZWRXb3JraW5nQ29waWVzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbYmFja3VwIHRyYWNrZXJdIGVycm9yIHNhdmluZyBvciByZXZlcnRpbmcgbW9kaWZpZWQgd29ya2luZyBjb3BpZXM6ICR7ZXJyb3J9YCk7XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkbyBub3QgYmxvY2sgc2h1dGRvd24gZHVyaW5nIGV4dGVuc2lvbiBkZXZlbG9wbWVudCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNTAyOClcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuc2hvd0Vycm9yRGlhbG9nKGxvY2FsaXplKCdiYWNrdXBUcmFja2VyQ29uZmlybUZhaWxlZCcsIFwiVGhlIGZvbGxvd2luZyBlZGl0b3JzIHdpdGggdW5zYXZlZCBjaGFuZ2VzIGNvdWxkIG5vdCBiZSBzYXZlZCBvciByZXZlcnRlZC5cIiksIHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcywgZXJyb3IsIHJlYXNvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG91bGRCYWNrdXBCZWZvcmVTaHV0ZG93bihyZWFzb246IFNodXRkb3duUmVhc29uLCBtb2RpZmllZFdvcmtpbmdDb3BpZXM6IHJlYWRvbmx5IElXb3JraW5nQ29weVtdKTogUHJvbWlzZTxyZWFkb25seSBJV29ya2luZ0NvcHlbXT4ge1xuXHRcdGlmICghdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzSG90RXhpdEVuYWJsZWQpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gbmV2ZXIgYmFja3VwIHdoZW4gaG90IGV4aXQgaXMgZGlzYWJsZWQgdmlhIHNldHRpbmdzXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdHJldHVybiBtb2RpZmllZFdvcmtpbmdDb3BpZXM7IC8vIGFsd2F5cyBiYWNrdXAgY2xvc2luZyBleHRlbnNpb24gZGV2ZWxvcG1lbnQgd2luZG93IHdpdGhvdXQgYXNraW5nIHRvIHNwZWVkIHVwIGRlYnVnZ2luZ1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cblx0XHRcdC8vIFdpbmRvdyBDbG9zZVxuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5DTE9TRTpcblx0XHRcdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgJiYgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmhvdEV4aXRDb25maWd1cmF0aW9uID09PSBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBiYWNrdXAgaWYgYSB3b3Jrc3BhY2UvZm9sZGVyIGlzIG9wZW4gYW5kIG9uRXhpdEFuZFdpbmRvd0Nsb3NlIGlzIGNvbmZpZ3VyZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCB8fCBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAxKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtb2RpZmllZFdvcmtpbmdDb3BpZXMuZmlsdGVyKG1vZGlmaWVkV29ya2luZ0NvcHkgPT4gbW9kaWZpZWRXb3JraW5nQ29weS5jYXBhYmlsaXRpZXMgJiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5TY3JhdGNocGFkKTsgLy8gYmFja3VwIHNjcmF0Y2hwYWRzIGF1dG9tYXRpY2FsbHkgdG8gYXZvaWQgdXNlciBjb25maXJtYXRpb25cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gW107IC8vIGRvIG5vdCBiYWNrdXAgaWYgYSB3aW5kb3cgaXMgY2xvc2VkIHRoYXQgZG9lcyBub3QgY2F1c2UgcXVpdHRpbmcgb2YgdGhlIGFwcGxpY2F0aW9uXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBiYWNrdXAgaWYgbGFzdCB3aW5kb3cgaXMgY2xvc2VkIG9uIHdpbi9saW51eCB3aGVyZSB0aGUgYXBwbGljYXRpb24gcXVpdHMgcmlnaHQgYWZ0ZXJcblxuXHRcdFx0Ly8gQXBwbGljYXRpb24gUXVpdFxuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5RVUlUOlxuXHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBiYWNrdXAgYmVjYXVzZSBuZXh0IHN0YXJ0IHdlIHJlc3RvcmUgYWxsIGJhY2t1cHNcblxuXHRcdFx0Ly8gV2luZG93IFJlbG9hZFxuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5SRUxPQUQ6XG5cdFx0XHRcdHJldHVybiBtb2RpZmllZFdvcmtpbmdDb3BpZXM7IC8vIGJhY2t1cCBiZWNhdXNlIGFmdGVyIHdpbmRvdyByZWxvYWQsIGJhY2t1cHMgcmVzdG9yZVxuXG5cdFx0XHQvLyBXb3Jrc3BhY2UgQ2hhbmdlXG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkxPQUQ6XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5ob3RFeGl0Q29uZmlndXJhdGlvbiA9PT0gSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBiYWNrdXAgaWYgYSB3b3Jrc3BhY2UvZm9sZGVyIGlzIG9wZW4gYW5kIG9uRXhpdEFuZFdpbmRvd0Nsb3NlIGlzIGNvbmZpZ3VyZWRcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzLmZpbHRlcihtb2RpZmllZFdvcmtpbmdDb3B5ID0+IG1vZGlmaWVkV29ya2luZ0NvcHkuY2FwYWJpbGl0aWVzICYgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCk7IC8vIGJhY2t1cCBzY3JhdGNocGFkcyBhdXRvbWF0aWNhbGx5IHRvIGF2b2lkIHVzZXIgY29uZmlybWF0aW9uXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gW107IC8vIGRvIG5vdCBiYWNrdXAgYmVjYXVzZSB3ZSBhcmUgc3dpdGNoaW5nIGNvbnRleHRzIHdpdGggbm8gd29ya3NwYWNlL2ZvbGRlciBvcGVuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RXJyb3JEaWFsb2cobWVzc2FnZTogc3RyaW5nLCB3b3JraW5nQ29waWVzOiByZWFkb25seSBJV29ya2luZ0NvcHlbXSwgZXJyb3I6IEVycm9yLCByZWFzb246IFNodXRkb3duUmVhc29uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbYmFja3VwIHRyYWNrZXJdICR7bWVzc2FnZX06ICR7ZXJyb3J9YCk7XG5cblx0XHRjb25zdCBtb2RpZmllZFdvcmtpbmdDb3BpZXMgPSB3b3JraW5nQ29waWVzLmZpbHRlcih3b3JraW5nQ29weSA9PiB3b3JraW5nQ29weS5pc01vZGlmaWVkKCkpO1xuXG5cdFx0Y29uc3QgYWR2aWNlID0gbG9jYWxpemUoJ2JhY2t1cEVycm9yRGV0YWlscycsIFwiVHJ5IHNhdmluZyBvciByZXZlcnRpbmcgdGhlIGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMgZmlyc3QgYW5kIHRoZW4gdHJ5IGFnYWluLlwiKTtcblx0XHRjb25zdCBkZXRhaWwgPSBtb2RpZmllZFdvcmtpbmdDb3BpZXMubGVuZ3RoXG5cdFx0XHQ/IGAke2dldEZpbGVOYW1lc01lc3NhZ2UobW9kaWZpZWRXb3JraW5nQ29waWVzLm1hcCh4ID0+IHgubmFtZSkpfVxcbiR7YWR2aWNlfWBcblx0XHRcdDogYWR2aWNlO1xuXG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWwsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZSAvLyB2ZXRvXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogdGhpcy50b0ZvcmNlU2h1dGRvd25MYWJlbChyZWFzb24pLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gZmFsc2UgLy8gbm8gdmV0b1xuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdCA/PyB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0ZvcmNlU2h1dGRvd25MYWJlbChyZWFzb246IFNodXRkb3duUmVhc29uKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5DTE9TRTpcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uTE9BRDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaHV0ZG93bkZvcmNlQ2xvc2UnLCBcIkNsb3NlIEFueXdheVwiKTtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUVVJVDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaHV0ZG93bkZvcmNlUXVpdCcsIFwiUXVpdCBBbnl3YXlcIik7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLlJFTE9BRDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaHV0ZG93bkZvcmNlUmVsb2FkJywgXCJSZWxvYWQgQW55d2F5XCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYmFja3VwQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzOiByZWFkb25seSBJV29ya2luZ0NvcHlbXSk6IFByb21pc2U8eyBiYWNrdXBzOiBJV29ya2luZ0NvcHlbXTsgZXJyb3I/OiBFcnJvciB9PiB7XG5cdFx0Y29uc3QgYmFja3VwczogSVdvcmtpbmdDb3B5W10gPSBbXTtcblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0YXdhaXQgdGhpcy53aXRoUHJvZ3Jlc3NBbmRDYW5jZWxsYXRpb24oYXN5bmMgdG9rZW4gPT4ge1xuXG5cdFx0XHQvLyBQZXJmb3JtIGEgYmFja3VwIG9mIGFsbCBtb2RpZmllZCB3b3JraW5nIGNvcGllcyB1bmxlc3MgYSBiYWNrdXAgYWxyZWFkeSBleGlzdHNcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQobW9kaWZpZWRXb3JraW5nQ29waWVzLm1hcChhc3luYyB3b3JraW5nQ29weSA9PiB7XG5cblx0XHRcdFx0XHQvLyBCYWNrdXAgZXhpc3RzXG5cdFx0XHRcdFx0Y29uc3QgY29udGVudFZlcnNpb24gPSB0aGlzLmdldENvbnRlbnRWZXJzaW9uKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0XHRpZiAodGhpcy53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuaGFzQmFja3VwU3luYyh3b3JraW5nQ29weSwgY29udGVudFZlcnNpb24pKSB7XG5cdFx0XHRcdFx0XHRiYWNrdXBzLnB1c2god29ya2luZ0NvcHkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEJhY2t1cCBkb2VzIG5vdCBleGlzdFxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFja3VwID0gYXdhaXQgd29ya2luZ0NvcHkuYmFja3VwKHRva2VuKTtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmJhY2t1cCh3b3JraW5nQ29weSwgYmFja3VwLmNvbnRlbnQsIGNvbnRlbnRWZXJzaW9uLCBiYWNrdXAubWV0YSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0YmFja3Vwcy5wdXNoKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gY2F0Y2ggKGJhY2t1cEVycm9yKSB7XG5cdFx0XHRcdGVycm9yID0gYmFja3VwRXJyb3I7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRcdGxvY2FsaXplKCdiYWNrdXBCZWZvcmVTaHV0ZG93bk1lc3NhZ2UnLCBcIkJhY2tpbmcgdXAgZWRpdG9ycyB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBpcyB0YWtpbmcgYSBiaXQgbG9uZ2VyLi4uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2JhY2t1cEJlZm9yZVNodXRkb3duRGV0YWlsJywgXCJDbGljayAnQ2FuY2VsJyB0byBzdG9wIHdhaXRpbmcgYW5kIHRvIHNhdmUgb3IgcmV2ZXJ0IGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMuXCIpXG5cdFx0KTtcblxuXHRcdHJldHVybiB7IGJhY2t1cHMsIGVycm9yIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbmZpcm1CZWZvcmVTaHV0ZG93bihtb2RpZmllZFdvcmtpbmdDb3BpZXM6IElXb3JraW5nQ29weVtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBTYXZlXG5cdFx0Y29uc3QgY29uZmlybSA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVDb25maXJtKG1vZGlmaWVkV29ya2luZ0NvcGllcy5tYXAod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkubmFtZSkpO1xuXHRcdGlmIChjb25maXJtID09PSBDb25maXJtUmVzdWx0LlNBVkUpIHtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQ291bnRCZWZvcmVTYXZlID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UubW9kaWZpZWRDb3VudDtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1NhdmVBbGxCZWZvcmVTaHV0ZG93bihtb2RpZmllZFdvcmtpbmdDb3BpZXMsIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbYmFja3VwIHRyYWNrZXJdIGVycm9yIHNhdmluZyBtb2RpZmllZCB3b3JraW5nIGNvcGllczogJHtlcnJvcn1gKTsgLy8gZ3VhcmQgYWdhaW5zdCBtaXNiZWhhdmluZyBzYXZlcywgd2UgaGFuZGxlIHJlbWFpbmluZyBtb2RpZmllZCBiZWxvd1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzYXZlZFdvcmtpbmdDb3BpZXMgPSBtb2RpZmllZENvdW50QmVmb3JlU2F2ZSAtIHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLm1vZGlmaWVkQ291bnQ7XG5cdFx0XHRpZiAoc2F2ZWRXb3JraW5nQ29waWVzIDwgbW9kaWZpZWRXb3JraW5nQ29waWVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gdmV0byAoc2F2ZSBmYWlsZWQgb3Igd2FzIGNhbmNlbGVkKVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5ub1ZldG8obW9kaWZpZWRXb3JraW5nQ29waWVzKTsgLy8gbm8gdmV0byAobW9kaWZpZWQgc2F2ZWQpXG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3QgU2F2ZVxuXHRcdGVsc2UgaWYgKGNvbmZpcm0gPT09IENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvUmV2ZXJ0QWxsQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSBlcnJvciByZXZlcnRpbmcgbW9kaWZpZWQgd29ya2luZyBjb3BpZXM6ICR7ZXJyb3J9YCk7IC8vIGRvIG5vdCBibG9jayB0aGUgc2h1dGRvd24gb24gZXJyb3JzIGZyb20gcmV2ZXJ0XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLm5vVmV0byhtb2RpZmllZFdvcmtpbmdDb3BpZXMpOyAvLyBubyB2ZXRvIChtb2RpZmllZCByZXZlcnRlZClcblx0XHR9XG5cblx0XHQvLyBDYW5jZWxcblx0XHRyZXR1cm4gdHJ1ZTsgLy8gdmV0byAodXNlciBjYW5jZWxlZClcblx0fVxuXG5cdHByaXZhdGUgZG9TYXZlQWxsQmVmb3JlU2h1dGRvd24od29ya2luZ0NvcGllczogSVdvcmtpbmdDb3B5W10sIHJlYXNvbjogU2F2ZVJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhQcm9ncmVzc0FuZENhbmNlbGxhdGlvbihhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFNraXAgc2F2ZSBwYXJ0aWNpcGFudHMgb24gc2h1dGRvd24gZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnNcblx0XHRcdGNvbnN0IHNhdmVPcHRpb25zID0geyBza2lwU2F2ZVBhcnRpY2lwYW50czogdHJ1ZSwgcmVhc29uIH07XG5cblx0XHRcdC8vIEZpcnN0IHNhdmUgdGhyb3VnaCB0aGUgZWRpdG9yIHNlcnZpY2UgaWYgd2Ugc2F2ZSBhbGwgdG8gYmVuZWZpdFxuXHRcdFx0Ly8gZnJvbSBzb21lIGV4dHJhcyBsaWtlIHN3aXRjaGluZyB0byB1bnRpdGxlZCBtb2RpZmllZCBlZGl0b3JzIGJlZm9yZSBzYXZpbmcuXG5cdFx0XHRsZXQgcmVzdWx0OiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHdvcmtpbmdDb3BpZXMubGVuZ3RoID09PSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5tb2RpZmllZENvdW50KSB7XG5cdFx0XHRcdHJlc3VsdCA9IChhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uuc2F2ZUFsbCh7XG5cdFx0XHRcdFx0aW5jbHVkZVVudGl0bGVkOiB7IGluY2x1ZGVTY3JhdGNocGFkOiB0cnVlIH0sXG5cdFx0XHRcdFx0Li4uc2F2ZU9wdGlvbnNcblx0XHRcdFx0fSkpLnN1Y2Nlc3M7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHdlIHN0aWxsIGhhdmUgbW9kaWZpZWQgd29ya2luZyBjb3BpZXMsIHNhdmUgdGhvc2UgZGlyZWN0bHlcblx0XHRcdC8vIHVubGVzcyB0aGUgc2F2ZSB3YXMgbm90IHN1Y2Nlc3NmdWwgKGUuZy4gY2FuY2VsbGVkKVxuXHRcdFx0aWYgKHJlc3VsdCAhPT0gZmFsc2UpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh3b3JraW5nQ29waWVzLm1hcCh3b3JraW5nQ29weSA9PiB3b3JraW5nQ29weS5pc01vZGlmaWVkKCkgPyB3b3JraW5nQ29weS5zYXZlKHNhdmVPcHRpb25zKSA6IFByb21pc2UucmVzb2x2ZSh0cnVlKSkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0XHRsb2NhbGl6ZSgnc2F2ZUJlZm9yZVNodXRkb3duJywgXCJTYXZpbmcgZWRpdG9ycyB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBpcyB0YWtpbmcgYSBiaXQgbG9uZ2VyLi4uXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0Ly8gRG8gbm90IHBpY2sgYERpYWxvZ2AgYXMgbG9jYXRpb24gZm9yIHJlcG9ydGluZyBwcm9ncmVzcyBpZiBpdCBpcyBsaWtlbHlcblx0XHRcdC8vIHRoYXQgdGhlIHNhdmUgb3BlcmF0aW9uIHdpbGwgaXRzZWxmIG9wZW4gYSBkaWFsb2cgZm9yIGFza2luZyBmb3IgdGhlXG5cdFx0XHQvLyBsb2NhdGlvbiB0byBzYXZlIHRvIGZvciB1bnRpdGxlZCBvciBzY3JhdGNocGFkIHdvcmtpbmcgY29waWVzLlxuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtaW50ZXJuYWxiYWNrbG9nL2lzc3Vlcy80OTQzXG5cdFx0XHR3b3JraW5nQ29waWVzLnNvbWUod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuY2FwYWJpbGl0aWVzICYgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuVW50aXRsZWQgfHwgd29ya2luZ0NvcHkuY2FwYWJpbGl0aWVzICYgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCkgPyBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyA6IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZXZlcnRBbGxCZWZvcmVTaHV0ZG93bihtb2RpZmllZFdvcmtpbmdDb3BpZXM6IElXb3JraW5nQ29weVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud2l0aFByb2dyZXNzQW5kQ2FuY2VsbGF0aW9uKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Ly8gU29mdCByZXZlcnQgaXMgZ29vZCBlbm91Z2ggb24gc2h1dGRvd25cblx0XHRcdGNvbnN0IHJldmVydE9wdGlvbnMgPSB7IHNvZnQ6IHRydWUgfTtcblxuXHRcdFx0Ly8gRmlyc3QgcmV2ZXJ0IHRocm91Z2ggdGhlIGVkaXRvciBzZXJ2aWNlIGlmIHdlIHJldmVydCBhbGxcblx0XHRcdGlmIChtb2RpZmllZFdvcmtpbmdDb3BpZXMubGVuZ3RoID09PSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5tb2RpZmllZENvdW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5yZXZlcnRBbGwocmV2ZXJ0T3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHdlIHN0aWxsIGhhdmUgbW9kaWZpZWQgd29ya2luZyBjb3BpZXMsIHJldmVydCB0aG9zZSBkaXJlY3RseVxuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChtb2RpZmllZFdvcmtpbmdDb3BpZXMubWFwKHdvcmtpbmdDb3B5ID0+IHdvcmtpbmdDb3B5LmlzTW9kaWZpZWQoKSA/IHdvcmtpbmdDb3B5LnJldmVydChyZXZlcnRPcHRpb25zKSA6IFByb21pc2UucmVzb2x2ZSgpKSk7XG5cdFx0fSwgbG9jYWxpemUoJ3JldmVydEJlZm9yZVNodXRkb3duJywgXCJSZXZlcnRpbmcgZWRpdG9ycyB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBpcyB0YWtpbmcgYSBiaXQgbG9uZ2VyLi4uXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgb25CZWZvcmVTaHV0ZG93bldpdGhvdXRNb2RpZmllZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFdlIGFyZSBhYm91dCB0byBzaHV0ZG93biB3aXRob3V0IG1vZGlmaWVkIGVkaXRvcnNcblx0XHQvLyBhbmQgd2lsbCBkaXNjYXJkIGFueSBiYWNrdXBzIHRoYXQgYXJlIHN0aWxsXG5cdFx0Ly8gYXJvdW5kIHRoYXQgaGF2ZSBub3QgYmVlbiBoYW5kbGVkIGRlcGVuZGluZ1xuXHRcdC8vIG9uIHRoZSB3aW5kb3cgc3RhdGUuXG5cdFx0Ly9cblx0XHQvLyBFbXB0eSB3aW5kb3c6IGRpc2NhcmQgZXZlbiB1bnJlc3RvcmVkIGJhY2t1cHMgdG9cblx0XHQvLyBwcmV2ZW50IGVtcHR5IHdpbmRvd3MgZnJvbSByZXN0b3JpbmcgdGhhdCBjYW5ub3Rcblx0XHQvLyBiZSBjbG9zZWQgKHdvcmthcm91bmQgZm9yIG5vdCBoYXZpbmcgaW1wbGVtZW50ZWRcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI3MTYzXG5cdFx0Ly8gYW5kIGEgZml4IGZvciB3aGF0IHVzZXJzIGhhdmUgcmVwb3J0ZWQgaW4gaXNzdWVcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI2NzI1KVxuXHRcdC8vXG5cdFx0Ly8gV29ya3NwYWNlL0ZvbGRlciB3aW5kb3c6IGRvIG5vdCBkaXNjYXJkIHVucmVzdG9yZWRcblx0XHQvLyBiYWNrdXBzIHRvIGdpdmUgYSBjaGFuY2UgdG8gcmVzdG9yZSB0aGVtIGluIHRoZVxuXHRcdC8vIGZ1dHVyZS4gU2luY2Ugd2UgZG8gbm90IHJlc3RvcmUgd29ya3NwYWNlL2ZvbGRlclxuXHRcdC8vIHdpbmRvd3Mgd2l0aCBiYWNrdXBzLCB0aGlzIGlzIGZpbmUuXG5cblx0XHRyZXR1cm4gdGhpcy5ub1ZldG8oeyBleGNlcHQ6IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgPyBbXSA6IEFycmF5LmZyb20odGhpcy51bnJlc3RvcmVkQmFja3VwcykgfSk7XG5cdH1cblxuXHRwcml2YXRlIG5vVmV0byhiYWNrdXBzVG9EaXNjYXJkOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10pOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRwcml2YXRlIG5vVmV0byhiYWNrdXBzVG9LZWVwOiB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRwcml2YXRlIGFzeW5jIG5vVmV0byhhcmcxOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfCB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIERpc2NhcmQgYmFja3VwcyBmcm9tIHdvcmtpbmcgY29waWVzIHRoZVxuXHRcdC8vIHVzZXIgZWl0aGVyIHNhdmVkIG9yIHJldmVydGVkXG5cblx0XHRhd2FpdCB0aGlzLmRpc2NhcmRCYWNrdXBzQmVmb3JlU2h1dGRvd24oYXJnMSk7XG5cblx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vIHZldG8gKG5vIG1vZGlmaWVkKVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNjYXJkQmFja3Vwc0JlZm9yZVNodXRkb3duKGJhY2t1cHNUb0Rpc2NhcmQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgZGlzY2FyZEJhY2t1cHNCZWZvcmVTaHV0ZG93bihiYWNrdXBzVG9LZWVwOiB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIGRpc2NhcmRCYWNrdXBzQmVmb3JlU2h1dGRvd24oYmFja3Vwc1RvRGlzY2FyZE9yS2VlcDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIHwgeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBhc3luYyBkaXNjYXJkQmFja3Vwc0JlZm9yZVNodXRkb3duKGFyZzE6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB8IHsgZXhjZXB0OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2UgbmV2ZXIgZGlzY2FyZCBhbnkgYmFja3VwcyBiZWZvcmUgd2UgYXJlIHJlYWR5XG5cdFx0Ly8gYW5kIGhhdmUgcmVzb2x2ZWQgYWxsIGJhY2t1cHMgdGhhdCBleGlzdC4gVGhpc1xuXHRcdC8vIGlzIGltcG9ydGFudCB0byBub3QgbG9vc2UgYmFja3VwcyB0aGF0IGhhdmUgbm90XG5cdFx0Ly8gYmVlbiBoYW5kbGVkLlxuXG5cdFx0aWYgKCF0aGlzLmlzUmVhZHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLndpdGhQcm9ncmVzc0FuZENhbmNlbGxhdGlvbihhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFdoZW4gd2Ugc2h1dGRvd24gZWl0aGVyIHdpdGggbm8gbW9kaWZpZWQgd29ya2luZyBjb3BpZXMgbGVmdFxuXHRcdFx0Ly8gb3Igd2l0aCBzb21lIGhhbmRsZWQsIHdlIHN0YXJ0IHRvIGRpc2NhcmQgdGhlc2UgYmFja3Vwc1xuXHRcdFx0Ly8gdG8gZnJlZSB0aGVtIHVwLiBUaGlzIGhlbHBzIHRvIGdldCByaWQgb2Ygc3RhbGUgYmFja3Vwc1xuXHRcdFx0Ly8gYXMgcmVwb3J0ZWQgaW4gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzkyOTYyXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSG93ZXZlciwgd2UgbmV2ZXIgd2FudCB0byBkaXNjYXJkIGJhY2t1cHMgdGhhdCB3ZSBrbm93XG5cdFx0XHQvLyB3ZXJlIG5vdCByZXN0b3JlZCBpbiB0aGUgc2Vzc2lvbi5cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJnMSkpIHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGFyZzEubWFwKHdvcmtpbmdDb3B5ID0+IHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmRpc2NhcmRCYWNrdXAod29ya2luZ0NvcHkpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuZGlzY2FyZEJhY2t1cHMoYXJnMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSBlcnJvciBkaXNjYXJkaW5nIGJhY2t1cHM6ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fSwgbG9jYWxpemUoJ2Rpc2NhcmRCYWNrdXBzQmVmb3JlU2h1dGRvd24nLCBcIkRpc2NhcmRpbmcgYmFja3VwcyBpcyB0YWtpbmcgYSBiaXQgbG9uZ2VyLi4uXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aFByb2dyZXNzQW5kQ2FuY2VsbGF0aW9uKHByb21pc2VGYWN0b3J5OiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHZvaWQ+LCB0aXRsZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcsIGxvY2F0aW9uID0gUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb24sIFx0XHRcdC8vIGJ5IGRlZmF1bHQgdXNlIGEgZGlhbG9nIHRvIHByZXZlbnQgdGhlIHVzZXIgZnJvbSBtYWtpbmcgYW55IG1vcmUgY2hhbmdlcyBub3cgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjI3NzQpXG5cdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSwgXHQvLyBhbGxvdyB0byBjYW5jZWwgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTIyNzgpXG5cdFx0XHRkZWxheTogODAwLCBcdFx0Ly8gZGVsYXkgc28gdGhhdCBpdCBvbmx5IGFwcGVhcnMgd2hlbiBvcGVyYXRpb24gdGFrZXMgYSBsb25nIHRpbWVcblx0XHRcdHRpdGxlLFxuXHRcdFx0ZGV0YWlsXG5cdFx0fSwgKCkgPT4gcmFjZUNhbmNlbGxhdGlvbihwcm9taXNlRmFjdG9yeShjdHMudG9rZW4pLCBjdHMudG9rZW4pLCAoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyw0QkFBNEIsb0JBQW9CO0FBQ3pELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQStDLCtCQUErQjtBQUM5RSxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxlQUFlLG9CQUFvQixnQkFBZ0IsMkJBQTJCO0FBQ3ZGLFNBQVMsZ0JBQWdCLGdDQUFnQztBQUN6RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUEyQjtBQUNwQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsVUFBVSx3QkFBd0I7QUFDM0MsU0FBUyxpQ0FBaUM7QUFFbkMsSUFBTSxpQ0FBTixjQUE2Qyx5QkFBMkQ7QUFBQSxFQUk5RyxZQUM0QiwwQkFDQywyQkFDUCxvQkFDRixrQkFDa0IsbUJBQ0osZUFDVSxnQkFDTixtQkFDeEIsWUFDeUIsb0JBQ0gsaUJBQ1IsMEJBQ1gsZUFDZjtBQUNELFVBQU0sMEJBQTBCLG9CQUFvQixZQUFZLGtCQUFrQiwyQkFBMkIsMEJBQTBCLGFBQWE7QUFWL0c7QUFDSjtBQUNVO0FBQ047QUFFQztBQUNIO0FBQUEsRUFLcEM7QUFBQSxFQUVBLE1BQWdCLHNCQUFzQixRQUEwQztBQVMvRSxTQUFLLHVCQUF1QjtBQU81QixVQUFNLEVBQUUsT0FBTyxJQUFJLEtBQUssd0JBQXdCO0FBRWhELFFBQUk7QUFHSCxZQUFNLHdCQUF3QixLQUFLLG1CQUFtQjtB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
