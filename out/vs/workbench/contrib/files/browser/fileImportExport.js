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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { getFileNamesMessage, IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ByteSize, FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IExplorerService } from "./files.js";
import { UndoConfirmLevel, VIEW_ID } from "../common/files.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Limiter, Promises, RunOnceWorker } from "../../../../base/common/async.js";
import { newWriteableBufferStream, VSBuffer } from "../../../../base/common/buffer.js";
import { basename, dirname, joinPath } from "../../../../base/common/resources.js";
import { ResourceFileEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { ExplorerItem } from "../common/explorerModel.js";
import { URI } from "../../../../base/common/uri.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { extractEditorsAndFilesDropData } from "../../../../platform/dnd/browser/dnd.js";
import { IWorkspaceEditingService } from "../../../services/workspaces/common/workspaceEditing.js";
import { isWeb } from "../../../../base/common/platform.js";
import { getActiveWindow, isDragEvent, triggerDownload } from "../../../../base/browser/dom.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { listenStream } from "../../../../base/common/stream.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { canceled } from "../../../../base/common/errors.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { WebFileSystemAccess } from "../../../../platform/files/browser/webFileSystemAccess.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
let BrowserFileUpload = class {
  constructor(progressService, dialogService, explorerService, editorService, fileService) {
    this.progressService = progressService;
    this.dialogService = dialogService;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.fileService = fileService;
  }
  upload(target, source) {
    const cts = new CancellationTokenSource();
    const uploadPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: true,
        title: localize("uploadingFiles", "Uploading")
      },
      async (progress) => this.doUpload(target, this.toTransfer(source), progress, cts.token),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => uploadPromise);
    return uploadPromise;
  }
  toTransfer(source) {
    if (isDragEvent(source)) {
      return source.dataTransfer;
    }
    const transfer = { items: [] };
    for (const file of source) {
      transfer.items.push({
        webkitGetAsEntry: () => {
          return {
            name: file.name,
            isDirectory: false,
            isFile: true,
            createReader: () => {
              throw new Error("Unsupported for files");
            },
            file: (resolve) => resolve(file)
          };
        }
      });
    }
    return transfer;
  }
  async doUpload(target, source, progress, token) {
    const items = source.items;
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }
    const results = [];
    const operation = {
      startTime: Date.now(),
      progressScheduler: new RunOnceWorker((steps) => {
        progress.report(steps[steps.length - 1]);
      }, 1e3),
      filesTotal: entries.length,
      filesUploaded: 0,
      totalBytesUploaded: 0
    };
    const uploadLimiter = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
    await Promises.settled(entries.map((entry) => {
      return uploadLimiter.queue(async () => {
        if (token.isCancellationRequested) {
          return;
        }
        if (target && entry.name && target.getChild(entry.name)) {
          const { confirmed } = await this.dialogService.confirm(getFileOverwriteConfirm(entry.name));
          if (!confirmed) {
            return;
          }
          await this.explorerService.applyBulkEdit([new ResourceFileEdit(joinPath(target.resource, entry.name), void 0, { recursive: true, folder: target.getChild(entry.name)?.isDirectory })], {
            undoLabel: localize("overwrite", "Overwrite {0}", entry.name),
            progressLabel: localize("overwriting", "Overwriting {0}", entry.name)
          });
          if (token.isCancellationRequested) {
            return;
          }
        }
        const result = await this.doUploadEntry(entry, target.resource, target, progress, operation, token);
        if (result) {
          results.push(result);
        }
      });
    }));
    operation.progressScheduler.dispose();
    const firstUploadedFile = results[0];
    if (!token.isCancellationRequested && firstUploadedFile?.isFile) {
      await this.editorService.openEditor({ resource: firstUploadedFile.resource, options: { pinned: true } });
    }
  }
  async doUploadEntry(entry, parentResource, target, progress, operation, token) {
    if (token.isCancellationRequested || !entry.name || !entry.isFile && !entry.isDirectory) {
      return void 0;
    }
    let fileBytesUploaded = 0;
    const reportProgress = (fileSize, bytesUploaded) => {
      fileBytesUploaded += bytesUploaded;
      operation.totalBytesUploaded += bytesUploaded;
      const bytesUploadedPerSecond = operation.totalBytesUploaded / ((Date.now() - operation.startTime) / 1e3);
      let message;
      if (fileSize < ByteSize.MB) {
        if (operation.filesTotal === 1) {
          message = `${entry.name}`;
        } else {
          message = localize("uploadProgressSmallMany", "{0} of {1} files ({2}/s)", operation.filesUploaded, operation.filesTotal, ByteSize.formatSize(bytesUploadedPerSecond));
        }
      } else {
        message = localize("uploadProgressLarge", "{0} ({1} of {2}, {3}/s)", entry.name, ByteSize.formatSize(fileBytesUploaded), ByteSize.formatSize(fileSize), ByteSize.formatSize(bytesUploadedPerSecond));
      }
      operation.progressScheduler.work({ message });
    };
    operation.filesUploaded++;
    reportProgress(0, 0);
    const resource = joinPath(parentResource, entry.name);
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (typeof file.stream === "function" && file.size > ByteSize.MB) {
        await this.doUploadFileBuffered(resource, file, reportProgress, token);
      } else {
        await this.doUploadFileUnbuffered(resource, file, reportProgress);
      }
      return { isFile: true, resource };
    } else {
      await this.fileService.createFolder(resource);
      if (token.isCancellationRequested) {
        return void 0;
      }
      const dirReader = entry.createReader();
      const childEntries = [];
      let done = false;
      do {
        const childEntriesChunk = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
        if (childEntriesChunk.length > 0) {
          childEntries.push(...childEntriesChunk);
        } else {
          done = true;
        }
      } while (!done && !token.isCancellationRequested);
      operation.filesTotal += childEntries.length;
      const folderTarget = target?.getChild(entry.name) || void 0;
      const fileChildEntries = [];
      const folderChildEntries = [];
      for (const childEntry of childEntries) {
        if (childEntry.isFile) {
          fileChildEntries.push(childEntry);
        } else if (childEntry.isDirectory) {
          folderChildEntries.push(childEntry);
        }
      }
      const fileUploadQueue = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
      await Promises.settled(fileChildEntries.map((fileChildEntry) => {
        return fileUploadQueue.queue(() => this.doUploadEntry(fileChildEntry, resource, folderTarget, progress, operation, token));
      }));
      for (const folderChildEntry of folderChildEntries) {
        await this.doUploadEntry(folderChildEntry, resource, folderTarget, progress, operation, token);
      }
      return { isFile: false, resource };
    }
  }
  async doUploadFileBuffered(resource, file, progressReporter, token) {
    const writeableStream = newWriteableBufferStream({
      // Set a highWaterMark to prevent the stream
      // for file upload to produce large buffers
      // in-memory
      highWaterMark: 10
    });
    const writeFilePromise = this.fileService.writeFile(resource, writeableStream);
    try {
      const reader = file.stream().getReader();
      let res = await reader.read();
      while (!res.done) {
        if (token.isCancellationRequested) {
          break;
        }
        const buffer = VSBuffer.wrap(res.value);
        await writeableStream.write(buffer);
        if (token.isCancellationRequested) {
          break;
        }
        progressReporter(file.size, buffer.byteLength);
        res = await reader.read();
      }
      writeableStream.end(void 0);
    } catch (error) {
      writeableStream.error(error);
      writeableStream.end();
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    await writeFilePromise;
  }
  doUploadFileUnbuffered(resource, file, progressReporter) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          if (event.target?.result instanceof ArrayBuffer) {
            const buffer = VSBuffer.wrap(new Uint8Array(event.target.result));
            await this.fileService.writeFile(resource, buffer);
            progressReporter(file.size, buffer.byteLength);
          } else {
            throw new Error("Could not read from dropped file.");
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
};
BrowserFileUpload.MAX_PARALLEL_UPLOADS = 20;
BrowserFileUpload = __decorateClass([
  __decorateParam(0, IProgressService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IExplorerService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IFileService)
], BrowserFileUpload);
let ExternalFileImport = class {
  constructor(fileService, hostService, contextService, configurationService, dialogService, workspaceEditingService, explorerService, editorService, progressService, notificationService, instantiationService) {
    this.fileService = fileService;
    this.hostService = hostService;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.workspaceEditingService = workspaceEditingService;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.instantiationService = instantiationService;
  }
  async import(target, source, targetWindow) {
    const cts = new CancellationTokenSource();
    const importPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: true,
        title: localize("copyingFiles", "Copying...")
      },
      async () => await this.doImport(target, source, targetWindow, cts.token),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => importPromise);
    return importPromise;
  }
  async doImport(target, source, targetWindow, token) {
    const candidateFiles = coalesce((await this.instantiationService.invokeFunction((accessor) => extractEditorsAndFilesDropData(accessor, source))).map((editor) => editor.resource));
    await Promise.all(candidateFiles.map((resource) => this.fileService.activateProvider(resource.scheme)));
    const files = coalesce(candidateFiles.filter((resource) => this.fileService.hasProvider(resource)));
    const resolvedFiles = await this.fileService.resolveAll(files.map((file) => ({ resource: file })));
    if (token.isCancellationRequested) {
      return;
    }
    this.hostService.focus(targetWindow);
    const folders = resolvedFiles.filter((resolvedFile) => resolvedFile.success && resolvedFile.stat?.isDirectory).map((resolvedFile) => ({ uri: resolvedFile.stat.resource }));
    if (folders.length > 0 && target.isRoot) {
      let ImportChoice;
      ((ImportChoice2) => {
        ImportChoice2[ImportChoice2["Copy"] = 1] = "Copy";
        ImportChoice2[ImportChoice2["Add"] = 2] = "Add";
      })(ImportChoice || (ImportChoice = {}));
      const buttons = [
        {
          label: folders.length > 1 ? localize("copyFolders", "&&Copy Folders") : localize("copyFolder", "&&Copy Folder"),
          run: () => 1 /* Copy */
        }
      ];
      let message;
      const workspaceFolderSchemas = this.contextService.getWorkspace().folders.map((folder) => folder.uri.scheme);
      if (folders.some((folder) => workspaceFolderSchemas.indexOf(folder.uri.scheme) >= 0)) {
        buttons.unshift({
          label: folders.length > 1 ? localize("addFolders", "&&Add Folders to Workspace") : localize("addFolder", "&&Add Folder to Workspace"),
          run: () => 2 /* Add */
        });
        message = folders.length > 1 ? localize("dropFolders", "Do you want to copy the folders or add the folders to the workspace?") : localize("dropFolder", "Do you want to copy '{0}' or add '{0}' as a folder to the workspace?", basename(folders[0].uri));
      } else {
        message = folders.length > 1 ? localize("copyfolders", "Are you sure to want to copy folders?") : localize("copyfolder", "Are you sure to want to copy '{0}'?", basename(folders[0].uri));
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message,
        buttons,
        cancelButton: true
      });
      if (result === 2 /* Add */) {
        return this.workspaceEditingService.addFolders(folders);
      }
      if (result === 1 /* Copy */) {
        return this.importResources(target, files, token);
      }
    } else if (target instanceof ExplorerItem) {
      return this.importResources(target, files, token);
    }
  }
  async importResources(target, resources, token) {
    if (resources && resources.length > 0) {
      const targetStat = await this.fileService.resolve(target.resource);
      if (token.isCancellationRequested) {
        return;
      }
      const targetNames = /* @__PURE__ */ new Set();
      const caseSensitive = this.fileService.hasCapability(target.resource, FileSystemProviderCapabilities.PathCaseSensitive);
      if (targetStat.children) {
        targetStat.children.forEach((child) => {
          targetNames.add(caseSensitive ? child.name : child.name.toLowerCase());
        });
      }
      let inaccessibleFileCount = 0;
      const resourcesFiltered = coalesce(await Promises.settled(resources.map(async (resource) => {
        const fileDoesNotExist = !await this.fileService.exists(resource);
        if (fileDoesNotExist) {
          inaccessibleFileCount++;
          return void 0;
        }
        if (targetNames.has(caseSensitive ? basename(resource) : basename(resource).toLowerCase())) {
          const confirmationResult = await this.dialogService.confirm(getFileOverwriteConfirm(basename(resource)));
          if (!confirmationResult.confirmed) {
            return void 0;
          }
        }
        return resource;
      })));
      if (inaccessibleFileCount > 0) {
        this.notificationService.error(inaccessibleFileCount > 1 ? localize("filesInaccessible", "Some or all of the dropped files could not be accessed for import.") : localize("fileInaccessible", "The dropped file could not be accessed for import."));
      }
      const resourceFileEdits = resourcesFiltered.map((resource) => {
        const sourceFileName = basename(resource);
        const targetFile = joinPath(target.resource, sourceFileName);
        return new ResourceFileEdit(resource, targetFile, { overwrite: true, copy: true });
      });
      const undoLevel = this.configurationService.getValue().explorer.confirmUndo;
      await this.explorerService.applyBulkEdit(resourceFileEdits, {
        undoLabel: resourcesFiltered.length === 1 ? localize({ comment: ["substitution will be the name of the file that was imported"], key: "importFile" }, "Import {0}", basename(resourcesFiltered[0])) : localize({ comment: ["substitution will be the number of files that were imported"], key: "importnFile" }, "Import {0} resources", resourcesFiltered.length),
        progressLabel: resourcesFiltered.length === 1 ? localize({ comment: ["substitution will be the name of the file that was copied"], key: "copyingFile" }, "Copying {0}", basename(resourcesFiltered[0])) : localize({ comment: ["substitution will be the number of files that were copied"], key: "copyingnFile" }, "Copying {0} resources", resourcesFiltered.length),
        progressLocation: ProgressLocation.Window,
        confirmBeforeUndo: undoLevel === UndoConfirmLevel.Verbose || undoLevel === UndoConfirmLevel.Default
      });
      const autoOpen = this.configurationService.getValue().explorer.autoOpenDroppedFile;
      if (autoOpen && resourceFileEdits.length === 1) {
        const item = this.explorerService.findClosest(resourceFileEdits[0].newResource);
        if (item && !item.isDirectory) {
          this.editorService.openEditor({ resource: item.resource, options: { pinned: true } });
        }
      }
    }
  }
};
ExternalFileImport = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IWorkspaceEditingService),
  __decorateParam(6, IExplorerService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IProgressService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IInstantiationService)
], ExternalFileImport);
let FileDownload = class {
  constructor(fileService, explorerService, progressService, logService, fileDialogService, storageService) {
    this.fileService = fileService;
    this.explorerService = explorerService;
    this.progressService = progressService;
    this.logService = logService;
    this.fileDialogService = fileDialogService;
    this.storageService = storageService;
  }
  download(source) {
    const cts = new CancellationTokenSource();
    const downloadPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: isWeb,
        title: localize("downloadingFiles", "Downloading")
      },
      async (progress) => this.doDownload(source, progress, cts),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => downloadPromise);
    return downloadPromise;
  }
  async doDownload(sources, progress, cts) {
    for (const source of sources) {
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (isWeb) {
        await this.doDownloadBrowser(source.resource, progress, cts);
      } else {
        await this.doDownloadNative(source, progress, cts);
      }
    }
  }
  async doDownloadBrowser(resource, progress, cts) {
    const stat = await this.fileService.resolve(resource, { resolveMetadata: true });
    if (cts.token.isCancellationRequested) {
      return;
    }
    const maxBlobDownloadSize = 32 * ByteSize.MB;
    const preferFileSystemAccessWebApis = stat.isDirectory || stat.size > maxBlobDownloadSize;
    const activeWindow = getActiveWindow();
    if (preferFileSystemAccessWebApis && WebFileSystemAccess.supported(activeWindow)) {
      try {
        const parentFolder = await activeWindow.showDirectoryPicker();
        const operation = {
          startTime: Date.now(),
          progressScheduler: new RunOnceWorker((steps) => {
            progress.report(steps[steps.length - 1]);
          }, 1e3),
          filesTotal: stat.isDirectory ? 0 : 1,
          // folders increment filesTotal within downloadFolder method
          filesDownloaded: 0,
          totalBytesDownloaded: 0,
          fileBytesDownloaded: 0
        };
        if (stat.isDirectory) {
          const targetFolder = await parentFolder.getDirectoryHandle(stat.name, { create: true });
          await this.downloadFolderBrowser(stat, targetFolder, operation, cts.token);
        } else {
          await this.downloadFileBrowser(parentFolder, stat, operation, cts.token);
        }
        operation.progressScheduler.dispose();
      } catch (error) {
        this.logService.warn(error);
        cts.cancel();
      }
    } else if (stat.isFile) {
      let bufferOrUri;
      try {
        bufferOrUri = (await this.fileService.readFile(stat.resource, { limits: { size: maxBlobDownloadSize } }, cts.token)).value.buffer;
      } catch (error) {
        bufferOrUri = FileAccess.uriToBrowserUri(stat.resource);
      }
      if (!cts.token.isCancellationRequested) {
        triggerDownload(bufferOrUri, stat.name);
      }
    }
  }
  async downloadFileBufferedBrowser(resource, target, operation, token) {
    const contents = await this.fileService.readFileStream(resource, void 0, token);
    if (token.isCancellationRequested) {
      target.close();
      return;
    }
    return new Promise((resolve, reject) => {
      const sourceStream = contents.value;
      const disposables = new DisposableStore();
      disposables.add(toDisposable(() => target.close()));
      disposables.add(createSingleCallFunction(token.onCancellationRequested)(() => {
        disposables.dispose();
        reject(canceled());
      }));
      listenStream(sourceStream, {
        onData: (data) => {
          target.write(data.buffer);
          this.reportProgress(contents.name, contents.size, data.byteLength, operation);
        },
        onError: (error) => {
          disposables.dispose();
          reject(error);
        },
        onEnd: () => {
          disposables.dispose();
          resolve();
        }
      }, token);
    });
  }
  async downloadFileUnbufferedBrowser(resource, target, operation, token) {
    const contents = await this.fileService.readFile(resource, void 0, token);
    if (!token.isCancellationRequested) {
      target.write(contents.value.buffer);
      this.reportProgress(contents.name, contents.size, contents.value.byteLength, operation);
    }
    target.close();
  }
  async downloadFileBrowser(targetFolder, file, operation, token) {
    operation.filesDownloaded++;
    operation.fileBytesDownloaded = 0;
    this.reportProgress(file.name, 0, 0, operation);
    const targetFile = await targetFolder.getFileHandle(file.name, { create: true });
    const targetFileWriter = await targetFile.createWritable();
    if (file.size > ByteSize.MB) {
      return this.downloadFileBufferedBrowser(file.resource, targetFileWriter, operation, token);
    }
    return this.downloadFileUnbufferedBrowser(file.resource, targetFileWriter, operation, token);
  }
  async downloadFolderBrowser(folder, targetFolder, operation, token) {
    if (folder.children) {
      operation.filesTotal += folder.children.map((child) => child.isFile).length;
      for (const child of folder.children) {
        if (token.isCancellationRequested) {
          return;
        }
        if (child.isFile) {
          await this.downloadFileBrowser(targetFolder, child, operation, token);
        } else {
          const childFolder = await targetFolder.getDirectoryHandle(child.name, { create: true });
          const resolvedChildFolder = await this.fileService.resolve(child.resource, { resolveMetadata: true });
          await this.downloadFolderBrowser(resolvedChildFolder, childFolder, operation, token);
        }
      }
    }
  }
  reportProgress(name, fileSize, bytesDownloaded, operation) {
    operation.fileBytesDownloaded += bytesDownloaded;
    operation.totalBytesDownloaded += bytesDownloaded;
    const bytesDownloadedPerSecond = operation.totalBytesDownloaded / ((Date.now() - operation.startTime) / 1e3);
    let message;
    if (fileSize < ByteSize.MB) {
      if (operation.filesTotal === 1) {
        message = name;
      } else {
        message = localize("downloadProgressSmallMany", "{0} of {1} files ({2}/s)", operation.filesDownloaded, operation.filesTotal, ByteSize.formatSize(bytesDownloadedPerSecond));
      }
    } else {
      message = localize("downloadProgressLarge", "{0} ({1} of {2}, {3}/s)", name, ByteSize.formatSize(operation.fileBytesDownloaded), ByteSize.formatSize(fileSize), ByteSize.formatSize(bytesDownloadedPerSecond));
    }
    operation.progressScheduler.work({ message });
  }
  async doDownloadNative(explorerItem, progress, cts) {
    progress.report({ message: explorerItem.name });
    let defaultUri;
    const lastUsedDownloadPath = this.storageService.get(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, StorageScope.APPLICATION);
    if (lastUsedDownloadPath) {
      defaultUri = joinPath(URI.file(lastUsedDownloadPath), explorerItem.name);
    } else {
      defaultUri = joinPath(
        explorerItem.isDirectory ? await this.fileDialogService.defaultFolderPath(Schemas.file) : await this.fileDialogService.defaultFilePath(Schemas.file),
        explorerItem.name
      );
    }
    const destination = await this.fileDialogService.showSaveDialog({
      availableFileSystems: [Schemas.file],
      saveLabel: localize("downloadButton", "Download"),
      title: localize("chooseWhereToDownload", "Choose Where to Download"),
      defaultUri
    });
    if (destination) {
      this.storageService.store(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, dirname(destination).fsPath, StorageScope.APPLICATION, StorageTarget.MACHINE);
      await this.explorerService.applyBulkEdit([new ResourceFileEdit(explorerItem.resource, destination, { overwrite: true, copy: true })], {
        undoLabel: localize("downloadBulkEdit", "Download {0}", explorerItem.name),
        progressLabel: localize("downloadingBulkEdit", "Downloading {0}", explorerItem.name),
        progressLocation: ProgressLocation.Window
      });
    } else {
      cts.cancel();
    }
  }
};
FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY = "workbench.explorer.downloadPath";
FileDownload = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IExplorerService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IStorageService)
], FileDownload);
function getFileOverwriteConfirm(name) {
  return {
    message: localize("confirmOverwrite", "A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", name),
    detail: localize("irreversible", "This action is irreversible!"),
    primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
    type: "warning"
  };
}
function getMultipleFilesOverwriteConfirm(files) {
  if (files.length > 1) {
    return {
      message: localize("confirmManyOverwrites", "The following {0} files and/or folders already exist in the destination folder. Do you want to replace them?", files.length),
      detail: getFileNamesMessage(files) + "\n" + localize("irreversible", "This action is irreversible!"),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
      type: "warning"
    };
  }
  return getFileOverwriteConfirm(basename(files[0]));
}
export {
  BrowserFileUpload,
  ExternalFileImport,
  FileDownload,
  getFileOverwriteConfirm,
  getMultipleFilesOverwriteConfirm
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxmaWxlSW1wb3J0RXhwb3J0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGdldEZpbGVOYW1lc01lc3NhZ2UsIElDb25maXJtYXRpb24sIElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uLCBVbmRvQ29uZmlybUxldmVsLCBWSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpbWl0ZXIsIFByb21pc2VzLCBSdW5PbmNlV29ya2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3Jlckl0ZW0gfSBmcm9tICcuLi9jb21tb24vZXhwbG9yZXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEVkaXRvcnNBbmRGaWxlc0Ryb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3csIGlzRHJhZ0V2ZW50LCB0cmlnZ2VyRG93bmxvYWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgY2FuY2VsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBXZWJGaWxlU3lzdGVtQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvYnJvd3Nlci93ZWJGaWxlU3lzdGVtQWNjZXNzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuLy8jcmVnaW9uIEJyb3dzZXIgRmlsZSBVcGxvYWQgKGRyYWcgYW5kIGRyb3AsIGlucHV0IGVsZW1lbnQpXG5cbmludGVyZmFjZSBJQnJvd3NlclVwbG9hZE9wZXJhdGlvbiB7XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRwcm9ncmVzc1NjaGVkdWxlcjogUnVuT25jZVdvcmtlcjxJUHJvZ3Jlc3NTdGVwPjtcblxuXHRmaWxlc1RvdGFsOiBudW1iZXI7XG5cdGZpbGVzVXBsb2FkZWQ6IG51bWJlcjtcblxuXHR0b3RhbEJ5dGVzVXBsb2FkZWQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElXZWJraXREYXRhVHJhbnNmZXIge1xuXHRpdGVtczogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1bXTtcbn1cblxuaW50ZXJmYWNlIElXZWJraXREYXRhVHJhbnNmZXJJdGVtIHtcblx0d2Via2l0R2V0QXNFbnRyeSgpOiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5IHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnkge1xuXHRuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlzRmlsZTogYm9vbGVhbjtcblx0aXNEaXJlY3Rvcnk6IGJvb2xlYW47XG5cblx0ZmlsZShyZXNvbHZlOiAoZmlsZTogRmlsZSkgPT4gdm9pZCwgcmVqZWN0OiAoKSA9PiB2b2lkKTogdm9pZDtcblx0Y3JlYXRlUmVhZGVyKCk6IElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnlSZWFkZXI7XG59XG5cbmludGVyZmFjZSBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5UmVhZGVyIHtcblx0cmVhZEVudHJpZXMocmVzb2x2ZTogKGZpbGU6IElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnlbXSkgPT4gdm9pZCwgcmVqZWN0OiAoKSA9PiB2b2lkKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJGaWxlVXBsb2FkIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfUEFSQUxMRUxfVVBMT0FEUyA9IDIwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0dXBsb2FkKHRhcmdldDogRXhwbG9yZXJJdGVtLCBzb3VyY2U6IERyYWdFdmVudCB8IEZpbGVMaXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyBJbmRpY2F0ZSBwcm9ncmVzcyBnbG9iYWxseVxuXHRcdGNvbnN0IHVwbG9hZFByb21pc2UgPSB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHR7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0ZGVsYXk6IDgwMCxcblx0XHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBsb2FkaW5nRmlsZXMnLCBcIlVwbG9hZGluZ1wiKVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHByb2dyZXNzID0+IHRoaXMuZG9VcGxvYWQodGFyZ2V0LCB0aGlzLnRvVHJhbnNmZXIoc291cmNlKSwgcHJvZ3Jlc3MsIGN0cy50b2tlbiksXG5cdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKVxuXHRcdCk7XG5cblx0XHQvLyBBbHNvIGluZGljYXRlIHByb2dyZXNzIGluIHRoZSBmaWxlcyB2aWV3XG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFZJRVdfSUQsIGRlbGF5OiA1MDAgfSwgKCkgPT4gdXBsb2FkUHJvbWlzZSk7XG5cblx0XHRyZXR1cm4gdXBsb2FkUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgdG9UcmFuc2Zlcihzb3VyY2U6IERyYWdFdmVudCB8IEZpbGVMaXN0KTogSVdlYmtpdERhdGFUcmFuc2ZlciB7XG5cdFx0aWYgKGlzRHJhZ0V2ZW50KHNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBzb3VyY2UuZGF0YVRyYW5zZmVyIGFzIHVua25vd24gYXMgSVdlYmtpdERhdGFUcmFuc2Zlcjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmFuc2ZlcjogSVdlYmtpdERhdGFUcmFuc2ZlciA9IHsgaXRlbXM6IFtdIH07XG5cblx0XHQvLyBXZSB3YW50IHRvIHJldXNlIHRoZSBzYW1lIGNvZGUgZm9yIHVwbG9hZGluZyBmcm9tXG5cdFx0Ly8gRHJhZyAmIERyb3AgYXMgd2VsbCBhcyBpbnB1dCBlbGVtZW50IGJhc2VkIHVwbG9hZFxuXHRcdC8vIHNvIHdlIGNvbnZlcnQgaW50byB3ZWJraXQgZGF0YSB0cmFuc2ZlciB3aGVuIHRoZVxuXHRcdC8vIGlucHV0IGVsZW1lbnQgYXBwcm9hY2ggaXMgdXNlZCAoc2ltcGxpZmllZCkuXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHNvdXJjZSkge1xuXHRcdFx0dHJhbnNmZXIuaXRlbXMucHVzaCh7XG5cdFx0XHRcdHdlYmtpdEdldEFzRW50cnk6ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bmFtZTogZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y3JlYXRlUmVhZGVyOiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZm9yIGZpbGVzJyk7IH0sXG5cdFx0XHRcdFx0XHRmaWxlOiByZXNvbHZlID0+IHJlc29sdmUoZmlsZSlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJhbnNmZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVXBsb2FkKHRhcmdldDogRXhwbG9yZXJJdGVtLCBzb3VyY2U6IElXZWJraXREYXRhVHJhbnNmZXIsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gc291cmNlLml0ZW1zO1xuXG5cdFx0Ly8gU29tZWhvdyB0aGUgaXRlbXMgdGhpbmcgaXMgYmVpbmcgbW9kaWZpZWQgYXQgcmFuZG9tLCBtYXliZSBhcyBhIHNlY3VyaXR5XG5cdFx0Ly8gbWVhc3VyZSBzaW5jZSB0aGlzIGlzIGEgRE5EIG9wZXJhdGlvbi4gQXMgc3VjaCwgd2UgY29weSB0aGUgaXRlbXMgaW50b1xuXHRcdC8vIGFuIGFycmF5IHdlIG93biBhcyBlYXJseSBhcyBwb3NzaWJsZSBiZWZvcmUgdXNpbmcgaXQuXG5cdFx0Y29uc3QgZW50cmllczogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHQvLyBgd2Via2l0R2V0QXNFbnRyeSgpYCByZXR1cm5zIGBudWxsYCBmb3IgZGF0YSB0cmFuc2ZlciBpdGVtcyB0aGF0XG5cdFx0XHQvLyBkbyBub3QgcmVwcmVzZW50IGEgZmlsZSBzeXN0ZW0gZW50cnkgKGUuZy4gZHJhZ2dlZCB0ZXh0L1VSTHMpLlxuXHRcdFx0Ly8gU2tpcCB0aG9zZSBzbyB3ZSBuZXZlciBvcGVyYXRlIG9uIGEgYG51bGxgIGVudHJ5IGxhdGVyIG9uLlxuXHRcdFx0Y29uc3QgZW50cnkgPSBpdGVtLndlYmtpdEdldEFzRW50cnkoKTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHM6IHsgaXNGaWxlOiBib29sZWFuOyByZXNvdXJjZTogVVJJIH1bXSA9IFtdO1xuXHRcdGNvbnN0IG9wZXJhdGlvbjogSUJyb3dzZXJVcGxvYWRPcGVyYXRpb24gPSB7XG5cdFx0XHRzdGFydFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRwcm9ncmVzc1NjaGVkdWxlcjogbmV3IFJ1bk9uY2VXb3JrZXI8SVByb2dyZXNzU3RlcD4oc3RlcHMgPT4geyBwcm9ncmVzcy5yZXBvcnQoc3RlcHNbc3RlcHMubGVuZ3RoIC0gMV0pOyB9LCAxMDAwKSxcblxuXHRcdFx0ZmlsZXNUb3RhbDogZW50cmllcy5sZW5ndGgsXG5cdFx0XHRmaWxlc1VwbG9hZGVkOiAwLFxuXG5cdFx0XHR0b3RhbEJ5dGVzVXBsb2FkZWQ6IDBcblx0XHR9O1xuXG5cdFx0Ly8gVXBsb2FkIGFsbCBlbnRyaWVzIGluIHBhcmFsbGVsIHVwIHRvIGFcblx0XHQvLyBjZXJ0YWluIG1heGltdW0gbGV2ZXJhZ2luZyB0aGUgYExpbWl0ZXJgXG5cdFx0Y29uc3QgdXBsb2FkTGltaXRlciA9IG5ldyBMaW1pdGVyKEJyb3dzZXJGaWxlVXBsb2FkLk1BWF9QQVJBTExFTF9VUExPQURTKTtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGVudHJpZXMubWFwKGVudHJ5ID0+IHtcblx0XHRcdHJldHVybiB1cGxvYWRMaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29uZmlybSBvdmVyd3JpdGUgYXMgbmVlZGVkXG5cdFx0XHRcdGlmICh0YXJnZXQgJiYgZW50cnkubmFtZSAmJiB0YXJnZXQuZ2V0Q2hpbGQoZW50cnkubmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oZ2V0RmlsZU92ZXJ3cml0ZUNvbmZpcm0oZW50cnkubmFtZSkpO1xuXHRcdFx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHBsb3JlclNlcnZpY2UuYXBwbHlCdWxrRWRpdChbbmV3IFJlc291cmNlRmlsZUVkaXQoam9pblBhdGgodGFyZ2V0LnJlc291cmNlLCBlbnRyeS5uYW1lKSwgdW5kZWZpbmVkLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9sZGVyOiB0YXJnZXQuZ2V0Q2hpbGQoZW50cnkubmFtZSk/LmlzRGlyZWN0b3J5IH0pXSwge1xuXHRcdFx0XHRcdFx0dW5kb0xhYmVsOiBsb2NhbGl6ZSgnb3ZlcndyaXRlJywgXCJPdmVyd3JpdGUgezB9XCIsIGVudHJ5Lm5hbWUpLFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NMYWJlbDogbG9jYWxpemUoJ292ZXJ3cml0aW5nJywgXCJPdmVyd3JpdGluZyB7MH1cIiwgZW50cnkubmFtZSksXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGxvYWQgZW50cnlcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kb1VwbG9hZEVudHJ5KGVudHJ5LCB0YXJnZXQucmVzb3VyY2UsIHRhcmdldCwgcHJvZ3Jlc3MsIG9wZXJhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdG9wZXJhdGlvbi5wcm9ncmVzc1NjaGVkdWxlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBPcGVuIHVwbG9hZGVkIGZpbGUgaW4gZWRpdG9yIG9ubHkgaWYgd2UgdXBsb2FkIGp1c3Qgb25lXG5cdFx0Y29uc3QgZmlyc3RVcGxvYWRlZEZpbGUgPSByZXN1bHRzWzBdO1xuXHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgZmlyc3RVcGxvYWRlZEZpbGU/LmlzRmlsZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZmlyc3RVcGxvYWRlZEZpbGUucmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwbG9hZEVudHJ5KGVudHJ5OiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5LCBwYXJlbnRSZXNvdXJjZTogVVJJLCB0YXJnZXQ6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgb3BlcmF0aW9uOiBJQnJvd3NlclVwbG9hZE9wZXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGlzRmlsZTogYm9vbGVhbjsgcmVzb3VyY2U6IFVSSSB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFlbnRyeS5uYW1lIHx8ICghZW50cnkuaXNGaWxlICYmICFlbnRyeS5pc0RpcmVjdG9yeSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwb3J0IHByb2dyZXNzXG5cdFx0bGV0IGZpbGVCeXRlc1VwbG9hZGVkID0gMDtcblx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChmaWxlU2l6ZTogbnVtYmVyLCBieXRlc1VwbG9hZGVkOiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRcdGZpbGVCeXRlc1VwbG9hZGVkICs9IGJ5dGVzVXBsb2FkZWQ7XG5cdFx0XHRvcGVyYXRpb24udG90YWxCeXRlc1VwbG9hZGVkICs9IGJ5dGVzVXBsb2FkZWQ7XG5cblx0XHRcdGNvbnN0IGJ5dGVzVXBsb2FkZWRQZXJTZWNvbmQgPSBvcGVyYXRpb24udG90YWxCeXRlc1VwbG9hZGVkIC8gKChEYXRlLm5vdygpIC0gb3BlcmF0aW9uLnN0YXJ0VGltZSkgLyAxMDAwKTtcblxuXHRcdFx0Ly8gU21hbGwgZmlsZVxuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGlmIChmaWxlU2l6ZSA8IEJ5dGVTaXplLk1CKSB7XG5cdFx0XHRcdGlmIChvcGVyYXRpb24uZmlsZXNUb3RhbCA9PT0gMSkge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBgJHtlbnRyeS5uYW1lfWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCd1cGxvYWRQcm9ncmVzc1NtYWxsTWFueScsIFwiezB9IG9mIHsxfSBmaWxlcyAoezJ9L3MpXCIsIG9wZXJhdGlvbi5maWxlc1VwbG9hZGVkLCBvcGVyYXRpb24uZmlsZXNUb3RhbCwgQnl0ZVNpemUuZm9ybWF0U2l6ZShieXRlc1VwbG9hZGVkUGVyU2Vjb25kKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTGFyZ2UgZmlsZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgndXBsb2FkUHJvZ3Jlc3NMYXJnZScsIFwiezB9ICh7MX0gb2YgezJ9LCB7M30vcylcIiwgZW50cnkubmFtZSwgQnl0ZVNpemUuZm9ybWF0U2l6ZShmaWxlQnl0ZXNVcGxvYWRlZCksIEJ5dGVTaXplLmZvcm1hdFNpemUoZmlsZVNpemUpLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGJ5dGVzVXBsb2FkZWRQZXJTZWNvbmQpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVwb3J0IHByb2dyZXNzIGJ1dCBsaW1pdCB0byB1cGRhdGUgb25seSBvbmNlIHBlciBzZWNvbmRcblx0XHRcdG9wZXJhdGlvbi5wcm9ncmVzc1NjaGVkdWxlci53b3JrKHsgbWVzc2FnZSB9KTtcblx0XHR9O1xuXHRcdG9wZXJhdGlvbi5maWxlc1VwbG9hZGVkKys7XG5cdFx0cmVwb3J0UHJvZ3Jlc3MoMCwgMCk7XG5cblx0XHQvLyBIYW5kbGUgZmlsZSB1cGxvYWRcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudFJlc291cmNlLCBlbnRyeS5uYW1lKTtcblx0XHRpZiAoZW50cnkuaXNGaWxlKSB7XG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgbmV3IFByb21pc2U8RmlsZT4oKHJlc29sdmUsIHJlamVjdCkgPT4gZW50cnkuZmlsZShyZXNvbHZlLCByZWplY3QpKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENocm9tZS9FZGdlL0ZpcmVmb3ggc3VwcG9ydCBzdHJlYW0gbWV0aG9kLCBidXQgb25seSB1c2UgaXQgZm9yXG5cdFx0XHQvLyBsYXJnZXIgZmlsZXMgdG8gcmVkdWNlIHRoZSBvdmVyaGVhZCBvZiB0aGUgc3RyZWFtaW5nIGFwcHJvYWNoXG5cdFx0XHRpZiAodHlwZW9mIGZpbGUuc3RyZWFtID09PSAnZnVuY3Rpb24nICYmIGZpbGUuc2l6ZSA+IEJ5dGVTaXplLk1CKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9VcGxvYWRGaWxlQnVmZmVyZWQocmVzb3VyY2UsIGZpbGUsIHJlcG9ydFByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZhbGxiYWNrIHRvIHVuYnVmZmVyZWQgdXBsb2FkIGZvciBvdGhlciBicm93c2VycyBvciBzbWFsbCBmaWxlc1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9VcGxvYWRGaWxlVW5idWZmZXJlZChyZXNvdXJjZSwgZmlsZSwgcmVwb3J0UHJvZ3Jlc3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBpc0ZpbGU6IHRydWUsIHJlc291cmNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGZvbGRlciB1cGxvYWRcblx0XHRlbHNlIHtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRhcmdldCBmb2xkZXJcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHJlc291cmNlKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlY3Vyc2l2ZSB1cGxvYWQgZmlsZXMgaW4gdGhpcyBkaXJlY3Rvcnlcblx0XHRcdGNvbnN0IGRpclJlYWRlciA9IGVudHJ5LmNyZWF0ZVJlYWRlcigpO1xuXHRcdFx0Y29uc3QgY2hpbGRFbnRyaWVzOiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5W10gPSBbXTtcblx0XHRcdGxldCBkb25lID0gZmFsc2U7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkRW50cmllc0NodW5rID0gYXdhaXQgbmV3IFByb21pc2U8SVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVtdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiBkaXJSZWFkZXIucmVhZEVudHJpZXMocmVzb2x2ZSwgcmVqZWN0KSk7XG5cdFx0XHRcdGlmIChjaGlsZEVudHJpZXNDaHVuay5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y2hpbGRFbnRyaWVzLnB1c2goLi4uY2hpbGRFbnRyaWVzQ2h1bmspO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRvbmUgPSB0cnVlOyAvLyBhbiBlbXB0eSBhcnJheSBpcyBhIHNpZ25hbCB0aGF0IGFsbCBlbnRyaWVzIGhhdmUgYmVlbiByZWFkXG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKCFkb25lICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBvcGVyYXRpb24gdG90YWwgYmFzZWQgb24gbmV3IGNvdW50c1xuXHRcdFx0b3BlcmF0aW9uLmZpbGVzVG90YWwgKz0gY2hpbGRFbnRyaWVzLmxlbmd0aDtcblxuXHRcdFx0Ly8gU3BsaXQgdXAgZmlsZXMgZnJvbSBmb2xkZXJzIHRvIHVwbG9hZFxuXHRcdFx0Y29uc3QgZm9sZGVyVGFyZ2V0ID0gdGFyZ2V0Py5nZXRDaGlsZChlbnRyeS5uYW1lKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBmaWxlQ2hpbGRFbnRyaWVzOiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5W10gPSBbXTtcblx0XHRcdGNvbnN0IGZvbGRlckNoaWxkRW50cmllczogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkRW50cnkgb2YgY2hpbGRFbnRyaWVzKSB7XG5cdFx0XHRcdGlmIChjaGlsZEVudHJ5LmlzRmlsZSkge1xuXHRcdFx0XHRcdGZpbGVDaGlsZEVudHJpZXMucHVzaChjaGlsZEVudHJ5KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjaGlsZEVudHJ5LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0Zm9sZGVyQ2hpbGRFbnRyaWVzLnB1c2goY2hpbGRFbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBsb2FkIGZpbGVzICh1cCB0byBgTUFYX1BBUkFMTEVMX1VQTE9BRFNgIGluIHBhcmFsbGVsKVxuXHRcdFx0Y29uc3QgZmlsZVVwbG9hZFF1ZXVlID0gbmV3IExpbWl0ZXIoQnJvd3NlckZpbGVVcGxvYWQuTUFYX1BBUkFMTEVMX1VQTE9BRFMpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChmaWxlQ2hpbGRFbnRyaWVzLm1hcChmaWxlQ2hpbGRFbnRyeSA9PiB7XG5cdFx0XHRcdHJldHVybiBmaWxlVXBsb2FkUXVldWUucXVldWUoKCkgPT4gdGhpcy5kb1VwbG9hZEVudHJ5KGZpbGVDaGlsZEVudHJ5LCByZXNvdXJjZSwgZm9sZGVyVGFyZ2V0LCBwcm9ncmVzcywgb3BlcmF0aW9uLCB0b2tlbikpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBVcGxvYWQgZm9sZGVycyAoc2VxdWVudGlhbGx5IGdpdmUgd2UgZG9uJ3Qga25vdyB0aGVpciBzaXplcylcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyQ2hpbGRFbnRyeSBvZiBmb2xkZXJDaGlsZEVudHJpZXMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1VwbG9hZEVudHJ5KGZvbGRlckNoaWxkRW50cnksIHJlc291cmNlLCBmb2xkZXJUYXJnZXQsIHByb2dyZXNzLCBvcGVyYXRpb24sIHRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgaXNGaWxlOiBmYWxzZSwgcmVzb3VyY2UgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVXBsb2FkRmlsZUJ1ZmZlcmVkKHJlc291cmNlOiBVUkksIGZpbGU6IEZpbGUsIHByb2dyZXNzUmVwb3J0ZXI6IChmaWxlU2l6ZTogbnVtYmVyLCBieXRlc1VwbG9hZGVkOiBudW1iZXIpID0+IHZvaWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdyaXRlYWJsZVN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSh7XG5cdFx0XHQvLyBTZXQgYSBoaWdoV2F0ZXJNYXJrIHRvIHByZXZlbnQgdGhlIHN0cmVhbVxuXHRcdFx0Ly8gZm9yIGZpbGUgdXBsb2FkIHRvIHByb2R1Y2UgbGFyZ2UgYnVmZmVyc1xuXHRcdFx0Ly8gaW4tbWVtb3J5XG5cdFx0XHRoaWdoV2F0ZXJNYXJrOiAxMFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdyaXRlRmlsZVByb21pc2UgPSB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgd3JpdGVhYmxlU3RyZWFtKTtcblxuXHRcdC8vIFJlYWQgdGhlIGZpbGUgaW4gY2h1bmtzIHVzaW5nIEZpbGUuc3RyZWFtKCkgd2ViIEFQSXNcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVhZGVyOiBSZWFkYWJsZVN0cmVhbURlZmF1bHRSZWFkZXI8VWludDhBcnJheT4gPSBmaWxlLnN0cmVhbSgpLmdldFJlYWRlcigpO1xuXG5cdFx0XHRsZXQgcmVzID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcblx0XHRcdHdoaWxlICghcmVzLmRvbmUpIHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXcml0ZSBidWZmZXIgaW50byBzdHJlYW0gYnV0IG1ha2Ugc3VyZSB0byB3YWl0XG5cdFx0XHRcdC8vIGluIGNhc2UgdGhlIGBoaWdoV2F0ZXJNYXJrYCBpcyByZWFjaGVkXG5cdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLndyYXAocmVzLnZhbHVlKTtcblx0XHRcdFx0YXdhaXQgd3JpdGVhYmxlU3RyZWFtLndyaXRlKGJ1ZmZlcik7XG5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXBvcnQgcHJvZ3Jlc3Ncblx0XHRcdFx0cHJvZ3Jlc3NSZXBvcnRlcihmaWxlLnNpemUsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblxuXHRcdFx0XHRyZXMgPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXHRcdFx0fVxuXHRcdFx0d3JpdGVhYmxlU3RyZWFtLmVuZCh1bmRlZmluZWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR3cml0ZWFibGVTdHJlYW0uZXJyb3IoZXJyb3IpO1xuXHRcdFx0d3JpdGVhYmxlU3RyZWFtLmVuZCgpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciBmaWxlIGJlaW5nIHdyaXR0ZW4gdG8gdGFyZ2V0XG5cdFx0YXdhaXQgd3JpdGVGaWxlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGxvYWRGaWxlVW5idWZmZXJlZChyZXNvdXJjZTogVVJJLCBmaWxlOiBGaWxlLCBwcm9ncmVzc1JlcG9ydGVyOiAoZmlsZVNpemU6IG51bWJlciwgYnl0ZXNVcGxvYWRlZDogbnVtYmVyKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFx0XHRyZWFkZXIub25sb2FkID0gYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChldmVudC50YXJnZXQ/LnJlc3VsdCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBidWZmZXIgPSBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGV2ZW50LnRhcmdldC5yZXN1bHQpKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBidWZmZXIpO1xuXG5cdFx0XHRcdFx0XHQvLyBSZXBvcnQgcHJvZ3Jlc3Ncblx0XHRcdFx0XHRcdHByb2dyZXNzUmVwb3J0ZXIoZmlsZS5zaXplLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlYWQgZnJvbSBkcm9wcGVkIGZpbGUuJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIFN0YXJ0IHJlYWRpbmcgdGhlIGZpbGUgdG8gdHJpZ2dlciBgb25sb2FkYFxuXHRcdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGZpbGUpO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRXh0ZXJuYWwgRmlsZSBJbXBvcnQgKGRyYWcgYW5kIGRyb3ApXG5cbmV4cG9ydCBjbGFzcyBFeHRlcm5hbEZpbGVJbXBvcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZTogSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgaW1wb3J0KHRhcmdldDogRXhwbG9yZXJJdGVtLCBzb3VyY2U6IERyYWdFdmVudCwgdGFyZ2V0V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdC8vIEluZGljYXRlIHByb2dyZXNzIGdsb2JhbGx5XG5cdFx0Y29uc3QgaW1wb3J0UHJvbWlzZSA9IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0XHRkZWxheTogODAwLFxuXHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb3B5aW5nRmlsZXMnLCBcIkNvcHlpbmcuLi5cIilcblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoKSA9PiBhd2FpdCB0aGlzLmRvSW1wb3J0KHRhcmdldCwgc291cmNlLCB0YXJnZXRXaW5kb3csIGN0cy50b2tlbiksXG5cdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKVxuXHRcdCk7XG5cblx0XHQvLyBBbHNvIGluZGljYXRlIHByb2dyZXNzIGluIHRoZSBmaWxlcyB2aWV3XG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFZJRVdfSUQsIGRlbGF5OiA1MDAgfSwgKCkgPT4gaW1wb3J0UHJvbWlzZSk7XG5cblx0XHRyZXR1cm4gaW1wb3J0UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9JbXBvcnQodGFyZ2V0OiBFeHBsb3Jlckl0ZW0sIHNvdXJjZTogRHJhZ0V2ZW50LCB0YXJnZXRXaW5kb3c6IFdpbmRvdywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBBY3RpdmF0ZSBhbGwgcHJvdmlkZXJzIGZvciB0aGUgcmVzb3VyY2VzIGRyb3BwZWRcblx0XHRjb25zdCBjYW5kaWRhdGVGaWxlcyA9IGNvYWxlc2NlKChhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGV4dHJhY3RFZGl0b3JzQW5kRmlsZXNEcm9wRGF0YShhY2Nlc3Nvciwgc291cmNlKSkpLm1hcChlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoY2FuZGlkYXRlRmlsZXMubWFwKHJlc291cmNlID0+IHRoaXMuZmlsZVNlcnZpY2UuYWN0aXZhdGVQcm92aWRlcihyZXNvdXJjZS5zY2hlbWUpKSk7XG5cblx0XHQvLyBDaGVjayBmb3IgZHJvcHBlZCBleHRlcm5hbCBmaWxlcyB0byBiZSBmb2xkZXJzXG5cdFx0Y29uc3QgZmlsZXMgPSBjb2FsZXNjZShjYW5kaWRhdGVGaWxlcy5maWx0ZXIocmVzb3VyY2UgPT4gdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpKTtcblx0XHRjb25zdCByZXNvbHZlZEZpbGVzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlQWxsKGZpbGVzLm1hcChmaWxlID0+ICh7IHJlc291cmNlOiBmaWxlIH0pKSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQYXNzIGZvY3VzIHRvIHdpbmRvd1xuXHRcdHRoaXMuaG9zdFNlcnZpY2UuZm9jdXModGFyZ2V0V2luZG93KTtcblxuXHRcdC8vIEhhbmRsZSBmb2xkZXJzIGJ5IGFkZGluZyB0byB3b3Jrc3BhY2UgaWYgd2UgYXJlIGluIHdvcmtzcGFjZSBjb250ZXh0IGFuZCBpZiBkcm9wcGVkIG9uIHRvcFxuXHRcdGNvbnN0IGZvbGRlcnMgPSByZXNvbHZlZEZpbGVzLmZpbHRlcihyZXNvbHZlZEZpbGUgPT4gcmVzb2x2ZWRGaWxlLnN1Y2Nlc3MgJiYgcmVzb2x2ZWRGaWxlLnN0YXQ/LmlzRGlyZWN0b3J5KS5tYXAocmVzb2x2ZWRGaWxlID0+ICh7IHVyaTogcmVzb2x2ZWRGaWxlLnN0YXQhLnJlc291cmNlIH0pKTtcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPiAwICYmIHRhcmdldC5pc1Jvb3QpIHtcblx0XHRcdGVudW0gSW1wb3J0Q2hvaWNlIHtcblx0XHRcdFx0Q29weSA9IDEsXG5cdFx0XHRcdEFkZCA9IDJcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxJbXBvcnRDaG9pY2UgfCB1bmRlZmluZWQ+W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogZm9sZGVycy5sZW5ndGggPiAxID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKCdjb3B5Rm9sZGVycycsIFwiJiZDb3B5IEZvbGRlcnNcIikgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2NvcHlGb2xkZXInLCBcIiYmQ29weSBGb2xkZXJcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBJbXBvcnRDaG9pY2UuQ29weVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXG5cdFx0XHQvLyBXZSBvbmx5IGFsbG93IHRvIGFkZCBhIGZvbGRlciB0byB0aGUgd29ya3NwYWNlIGlmIHRoZXJlIGlzIGFscmVhZHkgYSB3b3Jrc3BhY2UgZm9sZGVyIHdpdGggdGhhdCBzY2hlbWVcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlclNjaGVtYXMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpLnNjaGVtZSk7XG5cdFx0XHRpZiAoZm9sZGVycy5zb21lKGZvbGRlciA9PiB3b3Jrc3BhY2VGb2xkZXJTY2hlbWFzLmluZGV4T2YoZm9sZGVyLnVyaS5zY2hlbWUpID49IDApKSB7XG5cdFx0XHRcdGJ1dHRvbnMudW5zaGlmdCh7XG5cdFx0XHRcdFx0bGFiZWw6IGZvbGRlcnMubGVuZ3RoID4gMSA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWRkRm9sZGVycycsIFwiJiZBZGQgRm9sZGVycyB0byBXb3Jrc3BhY2VcIikgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FkZEZvbGRlcicsIFwiJiZBZGQgRm9sZGVyIHRvIFdvcmtzcGFjZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IEltcG9ydENob2ljZS5BZGRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1lc3NhZ2UgPSBmb2xkZXJzLmxlbmd0aCA+IDEgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdkcm9wRm9sZGVycycsIFwiRG8geW91IHdhbnQgdG8gY29weSB0aGUgZm9sZGVycyBvciBhZGQgdGhlIGZvbGRlcnMgdG8gdGhlIHdvcmtzcGFjZT9cIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdkcm9wRm9sZGVyJywgXCJEbyB5b3Ugd2FudCB0byBjb3B5ICd7MH0nIG9yIGFkZCAnezB9JyBhcyBhIGZvbGRlciB0byB0aGUgd29ya3NwYWNlP1wiLCBiYXNlbmFtZShmb2xkZXJzWzBdLnVyaSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGZvbGRlcnMubGVuZ3RoID4gMSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NvcHlmb2xkZXJzJywgXCJBcmUgeW91IHN1cmUgdG8gd2FudCB0byBjb3B5IGZvbGRlcnM/XCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29weWZvbGRlcicsIFwiQXJlIHlvdSBzdXJlIHRvIHdhbnQgdG8gY29weSAnezB9Jz9cIiwgYmFzZW5hbWUoZm9sZGVyc1swXS51cmkpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBZGQgZm9sZGVyc1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gSW1wb3J0Q2hvaWNlLkFkZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5hZGRGb2xkZXJzKGZvbGRlcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb3B5IHJlc291cmNlc1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gSW1wb3J0Q2hvaWNlLkNvcHkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW1wb3J0UmVzb3VyY2VzKHRhcmdldCwgZmlsZXMsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZHJvcHBlZCBmaWxlcyAob25seSBzdXBwb3J0IEZpbGVTdGF0IGFzIHRhcmdldClcblx0XHRlbHNlIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBFeHBsb3Jlckl0ZW0pIHtcblx0XHRcdHJldHVybiB0aGlzLmltcG9ydFJlc291cmNlcyh0YXJnZXQsIGZpbGVzLCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbXBvcnRSZXNvdXJjZXModGFyZ2V0OiBFeHBsb3Jlckl0ZW0sIHJlc291cmNlczogVVJJW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChyZXNvdXJjZXMgJiYgcmVzb3VyY2VzLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gUmVzb2x2ZSB0YXJnZXQgdG8gY2hlY2sgZm9yIG5hbWUgY29sbGlzaW9ucyBhbmQgYXNrIHVzZXJcblx0XHRcdGNvbnN0IHRhcmdldFN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGFyZ2V0LnJlc291cmNlKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIG5hbWUgY29sbGlzaW9uc1xuXHRcdFx0Y29uc3QgdGFyZ2V0TmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IGNhc2VTZW5zaXRpdmUgPSB0aGlzLmZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkodGFyZ2V0LnJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0aWYgKHRhcmdldFN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0dGFyZ2V0U3RhdC5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHtcblx0XHRcdFx0XHR0YXJnZXROYW1lcy5hZGQoY2FzZVNlbnNpdGl2ZSA/IGNoaWxkLm5hbWUgOiBjaGlsZC5uYW1lLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXG5cdFx0XHRsZXQgaW5hY2Nlc3NpYmxlRmlsZUNvdW50ID0gMDtcblx0XHRcdGNvbnN0IHJlc291cmNlc0ZpbHRlcmVkID0gY29hbGVzY2UoKGF3YWl0IFByb21pc2VzLnNldHRsZWQocmVzb3VyY2VzLm1hcChhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVEb2VzTm90RXhpc3QgPSAhKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChmaWxlRG9lc05vdEV4aXN0KSB7XG5cdFx0XHRcdFx0aW5hY2Nlc3NpYmxlRmlsZUNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0YXJnZXROYW1lcy5oYXMoY2FzZVNlbnNpdGl2ZSA/IGJhc2VuYW1lKHJlc291cmNlKSA6IGJhc2VuYW1lKHJlc291cmNlKS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKGdldEZpbGVPdmVyd3JpdGVDb25maXJtKGJhc2VuYW1lKHJlc291cmNlKSkpO1xuXHRcdFx0XHRcdGlmICghY29uZmlybWF0aW9uUmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0XHR9KSkpKTtcblxuXHRcdFx0aWYgKGluYWNjZXNzaWJsZUZpbGVDb3VudCA+IDApIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGluYWNjZXNzaWJsZUZpbGVDb3VudCA+IDEgPyBsb2NhbGl6ZSgnZmlsZXNJbmFjY2Vzc2libGUnLCBcIlNvbWUgb3IgYWxsIG9mIHRoZSBkcm9wcGVkIGZpbGVzIGNvdWxkIG5vdCBiZSBhY2Nlc3NlZCBmb3IgaW1wb3J0LlwiKSA6IGxvY2FsaXplKCdmaWxlSW5hY2Nlc3NpYmxlJywgXCJUaGUgZHJvcHBlZCBmaWxlIGNvdWxkIG5vdCBiZSBhY2Nlc3NlZCBmb3IgaW1wb3J0LlwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvcHkgcmVzb3VyY2VzIHRocm91Z2ggYnVsayBlZGl0IEFQSVxuXHRcdFx0Y29uc3QgcmVzb3VyY2VGaWxlRWRpdHMgPSByZXNvdXJjZXNGaWx0ZXJlZC5tYXAocmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VGaWxlTmFtZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0RmlsZSA9IGpvaW5QYXRoKHRhcmdldC5yZXNvdXJjZSwgc291cmNlRmlsZU5hbWUpO1xuXG5cdFx0XHRcdHJldHVybiBuZXcgUmVzb3VyY2VGaWxlRWRpdChyZXNvdXJjZSwgdGFyZ2V0RmlsZSwgeyBvdmVyd3JpdGU6IHRydWUsIGNvcHk6IHRydWUgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdW5kb0xldmVsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmNvbmZpcm1VbmRvO1xuXHRcdFx0YXdhaXQgdGhpcy5leHBsb3JlclNlcnZpY2UuYXBwbHlCdWxrRWRpdChyZXNvdXJjZUZpbGVFZGl0cywge1xuXHRcdFx0XHR1bmRvTGFiZWw6IHJlc291cmNlc0ZpbHRlcmVkLmxlbmd0aCA9PT0gMSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ3N1YnN0aXR1dGlvbiB3aWxsIGJlIHRoZSBuYW1lIG9mIHRoZSBmaWxlIHRoYXQgd2FzIGltcG9ydGVkJ10sIGtleTogJ2ltcG9ydEZpbGUnIH0sIFwiSW1wb3J0IHswfVwiLCBiYXNlbmFtZShyZXNvdXJjZXNGaWx0ZXJlZFswXSkpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnc3Vic3RpdHV0aW9uIHdpbGwgYmUgdGhlIG51bWJlciBvZiBmaWxlcyB0aGF0IHdlcmUgaW1wb3J0ZWQnXSwga2V5OiAnaW1wb3J0bkZpbGUnIH0sIFwiSW1wb3J0IHswfSByZXNvdXJjZXNcIiwgcmVzb3VyY2VzRmlsdGVyZWQubGVuZ3RoKSxcblx0XHRcdFx0cHJvZ3Jlc3NMYWJlbDogcmVzb3VyY2VzRmlsdGVyZWQubGVuZ3RoID09PSAxID9cblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnc3Vic3RpdHV0aW9uIHdpbGwgYmUgdGhlIG5hbWUgb2YgdGhlIGZpbGUgdGhhdCB3YXMgY29waWVkJ10sIGtleTogJ2NvcHlpbmdGaWxlJyB9LCBcIkNvcHlpbmcgezB9XCIsIGJhc2VuYW1lKHJlc291cmNlc0ZpbHRlcmVkWzBdKSkgOlxuXHRcdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydzdWJzdGl0dXRpb24gd2lsbCBiZSB0aGUgbnVtYmVyIG9mIGZpbGVzIHRoYXQgd2VyZSBjb3BpZWQnXSwga2V5OiAnY29weWluZ25GaWxlJyB9LCBcIkNvcHlpbmcgezB9IHJlc291cmNlc1wiLCByZXNvdXJjZXNGaWx0ZXJlZC5sZW5ndGgpLFxuXHRcdFx0XHRwcm9ncmVzc0xvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IHVuZG9MZXZlbCA9PT0gVW5kb0NvbmZpcm1MZXZlbC5WZXJib3NlIHx8IHVuZG9MZXZlbCA9PT0gVW5kb0NvbmZpcm1MZXZlbC5EZWZhdWx0LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGlmIHdlIG9ubHkgYWRkIG9uZSBmaWxlLCBqdXN0IG9wZW4gaXQgZGlyZWN0bHlcblx0XHRcdGNvbnN0IGF1dG9PcGVuID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmF1dG9PcGVuRHJvcHBlZEZpbGU7XG5cdFx0XHRpZiAoYXV0b09wZW4gJiYgcmVzb3VyY2VGaWxlRWRpdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdChyZXNvdXJjZUZpbGVFZGl0c1swXS5uZXdSZXNvdXJjZSEpO1xuXHRcdFx0XHRpZiAoaXRlbSAmJiAhaXRlbS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGl0ZW0ucmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBEb3dubG9hZCAod2ViLCBuYXRpdmUpXG5cbmludGVyZmFjZSBJRG93bmxvYWRPcGVyYXRpb24ge1xuXHRzdGFydFRpbWU6IG51bWJlcjtcblx0cHJvZ3Jlc3NTY2hlZHVsZXI6IFJ1bk9uY2VXb3JrZXI8SVByb2dyZXNzU3RlcD47XG5cblx0ZmlsZXNUb3RhbDogbnVtYmVyO1xuXHRmaWxlc0Rvd25sb2FkZWQ6IG51bWJlcjtcblxuXHR0b3RhbEJ5dGVzRG93bmxvYWRlZDogbnVtYmVyO1xuXHRmaWxlQnl0ZXNEb3dubG9hZGVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRG93bmxvYWQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IExBU1RfVVNFRF9ET1dOTE9BRF9QQVRIX1NUT1JBR0VfS0VZID0gJ3dvcmtiZW5jaC5leHBsb3Jlci5kb3dubG9hZFBhdGgnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0ZG93bmxvYWQoc291cmNlOiBFeHBsb3Jlckl0ZW1bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8gSW5kaWNhdGUgcHJvZ3Jlc3MgZ2xvYmFsbHlcblx0XHRjb25zdCBkb3dubG9hZFByb21pc2UgPSB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHR7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0ZGVsYXk6IDgwMCxcblx0XHRcdFx0Y2FuY2VsbGFibGU6IGlzV2ViLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rvd25sb2FkaW5nRmlsZXMnLCBcIkRvd25sb2FkaW5nXCIpXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcHJvZ3Jlc3MgPT4gdGhpcy5kb0Rvd25sb2FkKHNvdXJjZSwgcHJvZ3Jlc3MsIGN0cyksXG5cdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKVxuXHRcdCk7XG5cblx0XHQvLyBBbHNvIGluZGljYXRlIHByb2dyZXNzIGluIHRoZSBmaWxlcyB2aWV3XG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFZJRVdfSUQsIGRlbGF5OiA1MDAgfSwgKCkgPT4gZG93bmxvYWRQcm9taXNlKTtcblxuXHRcdHJldHVybiBkb3dubG9hZFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRG93bmxvYWQoc291cmNlczogRXhwbG9yZXJJdGVtW10sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBzb3VyY2VzKSB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2ViOiB1c2UgRE9NIEFQSXMgdG8gZG93bmxvYWQgZmlsZXMgd2l0aCBvcHRpb25hbCBzdXBwb3J0XG5cdFx0XHQvLyBmb3IgZm9sZGVycyBhbmQgbGFyZ2UgZmlsZXNcblx0XHRcdGlmIChpc1dlYikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvRG93bmxvYWRCcm93c2VyKHNvdXJjZS5yZXNvdXJjZSwgcHJvZ3Jlc3MsIGN0cyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5hdGl2ZTogdXNlIHdvcmtpbmcgY29weSBmaWxlIHNlcnZpY2UgdG8gZ2V0IGF0IHRoZSBjb250ZW50c1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Eb3dubG9hZE5hdGl2ZShzb3VyY2UsIHByb2dyZXNzLCBjdHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Eb3dubG9hZEJyb3dzZXIocmVzb3VyY2U6IFVSSSwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXG5cdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heEJsb2JEb3dubG9hZFNpemUgPSAzMiAqIEJ5dGVTaXplLk1COyAvLyBhdm9pZCB0byBkb3dubG9hZCB2aWEgYmxvYi10cmljayA+MzJNQiB0byBhdm9pZCBtZW1vcnkgcHJlc3N1cmVcblx0XHRjb25zdCBwcmVmZXJGaWxlU3lzdGVtQWNjZXNzV2ViQXBpcyA9IHN0YXQuaXNEaXJlY3RvcnkgfHwgc3RhdC5zaXplID4gbWF4QmxvYkRvd25sb2FkU2l6ZTtcblxuXHRcdC8vIEZvbGRlcjogdXNlIEZTIEFQSXMgdG8gZG93bmxvYWQgZmlsZXMgYW5kIGZvbGRlcnMgaWYgYXZhaWxhYmxlIGFuZCBwcmVmZXJyZWRcblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAocHJlZmVyRmlsZVN5c3RlbUFjY2Vzc1dlYkFwaXMgJiYgV2ViRmlsZVN5c3RlbUFjY2Vzcy5zdXBwb3J0ZWQoYWN0aXZlV2luZG93KSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyZW50Rm9sZGVyOiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlID0gYXdhaXQgYWN0aXZlV2luZG93LnNob3dEaXJlY3RvcnlQaWNrZXIoKTtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uOiBJRG93bmxvYWRPcGVyYXRpb24gPSB7XG5cdFx0XHRcdFx0c3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdHByb2dyZXNzU2NoZWR1bGVyOiBuZXcgUnVuT25jZVdvcmtlcjxJUHJvZ3Jlc3NTdGVwPihzdGVwcyA9PiB7IHByb2dyZXNzLnJlcG9ydChzdGVwc1tzdGVwcy5sZW5ndGggLSAxXSk7IH0sIDEwMDApLFxuXG5cdFx0XHRcdFx0ZmlsZXNUb3RhbDogc3RhdC5pc0RpcmVjdG9yeSA/IDAgOiAxLCAvLyBmb2xkZXJzIGluY3JlbWVudCBmaWxlc1RvdGFsIHdpdGhpbiBkb3dubG9hZEZvbGRlciBtZXRob2Rcblx0XHRcdFx0XHRmaWxlc0Rvd25sb2FkZWQ6IDAsXG5cblx0XHRcdFx0XHR0b3RhbEJ5dGVzRG93bmxvYWRlZDogMCxcblx0XHRcdFx0XHRmaWxlQnl0ZXNEb3dubG9hZGVkOiAwXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBhd2FpdCBwYXJlbnRGb2xkZXIuZ2V0RGlyZWN0b3J5SGFuZGxlKHN0YXQubmFtZSwgeyBjcmVhdGU6IHRydWUgfSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb3dubG9hZEZvbGRlckJyb3dzZXIoc3RhdCwgdGFyZ2V0Rm9sZGVyLCBvcGVyYXRpb24sIGN0cy50b2tlbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb3dubG9hZEZpbGVCcm93c2VyKHBhcmVudEZvbGRlciwgc3RhdCwgb3BlcmF0aW9uLCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3BlcmF0aW9uLnByb2dyZXNzU2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGVycm9yKTtcblx0XHRcdFx0Y3RzLmNhbmNlbCgpOyAvLyBgc2hvd0RpcmVjdG9yeVBpY2tlcmAgd2lsbCB0aHJvdyBhbiBlcnJvciB3aGVuIHRoZSB1c2VyIGNhbmNlbHNcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWxlOiB1c2UgdHJhZGl0aW9uYWwgZG93bmxvYWQgdG8gY2lyY3VtdmVudCBicm93c2VyIGxpbWl0YXRpb25zXG5cdFx0ZWxzZSBpZiAoc3RhdC5pc0ZpbGUpIHtcblx0XHRcdGxldCBidWZmZXJPclVyaTogVWludDhBcnJheSB8IFVSSTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGJ1ZmZlck9yVXJpID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoc3RhdC5yZXNvdXJjZSwgeyBsaW1pdHM6IHsgc2l6ZTogbWF4QmxvYkRvd25sb2FkU2l6ZSB9IH0sIGN0cy50b2tlbikpLnZhbHVlLmJ1ZmZlcjtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGJ1ZmZlck9yVXJpID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoc3RhdC5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRyaWdnZXJEb3dubG9hZChidWZmZXJPclVyaSwgc3RhdC5uYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkRmlsZUJ1ZmZlcmVkQnJvd3NlcihyZXNvdXJjZTogVVJJLCB0YXJnZXQ6IEZpbGVTeXN0ZW1Xcml0YWJsZUZpbGVTdHJlYW0sIG9wZXJhdGlvbjogSURvd25sb2FkT3BlcmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0ocmVzb3VyY2UsIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGFyZ2V0LmNsb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZVN0cmVhbSA9IGNvbnRlbnRzLnZhbHVlO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGFyZ2V0LmNsb3NlKCkpKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbih0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCkoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChjYW5jZWxlZCgpKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bGlzdGVuU3RyZWFtKHNvdXJjZVN0cmVhbSwge1xuXHRcdFx0XHRvbkRhdGE6IGRhdGEgPT4ge1xuXHRcdFx0XHRcdHRhcmdldC53cml0ZShkYXRhLmJ1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPik7XG5cdFx0XHRcdFx0dGhpcy5yZXBvcnRQcm9ncmVzcyhjb250ZW50cy5uYW1lLCBjb250ZW50cy5zaXplLCBkYXRhLmJ5dGVMZW5ndGgsIG9wZXJhdGlvbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRXJyb3I6IGVycm9yID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25FbmQ6ICgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkRmlsZVVuYnVmZmVyZWRCcm93c2VyKHJlc291cmNlOiBVUkksIHRhcmdldDogRmlsZVN5c3RlbVdyaXRhYmxlRmlsZVN0cmVhbSwgb3BlcmF0aW9uOiBJRG93bmxvYWRPcGVyYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGFyZ2V0LndyaXRlKGNvbnRlbnRzLnZhbHVlLmJ1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPik7XG5cdFx0XHR0aGlzLnJlcG9ydFByb2dyZXNzKGNvbnRlbnRzLm5hbWUsIGNvbnRlbnRzLnNpemUsIGNvbnRlbnRzLnZhbHVlLmJ5dGVMZW5ndGgsIG9wZXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0dGFyZ2V0LmNsb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkRmlsZUJyb3dzZXIodGFyZ2V0Rm9sZGVyOiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBmaWxlOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIG9wZXJhdGlvbjogSURvd25sb2FkT3BlcmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlcG9ydCBwcm9ncmVzc1xuXHRcdG9wZXJhdGlvbi5maWxlc0Rvd25sb2FkZWQrKztcblx0XHRvcGVyYXRpb24uZmlsZUJ5dGVzRG93bmxvYWRlZCA9IDA7IC8vIHJlc2V0IGZvciB0aGlzIGZpbGVcblx0XHR0aGlzLnJlcG9ydFByb2dyZXNzKGZpbGUubmFtZSwgMCwgMCwgb3BlcmF0aW9uKTtcblxuXHRcdC8vIFN0YXJ0IHRvIGRvd25sb2FkXG5cdFx0Y29uc3QgdGFyZ2V0RmlsZSA9IGF3YWl0IHRhcmdldEZvbGRlci5nZXRGaWxlSGFuZGxlKGZpbGUubmFtZSwgeyBjcmVhdGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZVdyaXRlciA9IGF3YWl0IHRhcmdldEZpbGUuY3JlYXRlV3JpdGFibGUoKTtcblxuXHRcdC8vIEZvciBsYXJnZSBmaWxlcywgd3JpdGUgYnVmZmVyZWQgdXNpbmcgc3RyZWFtc1xuXHRcdGlmIChmaWxlLnNpemUgPiBCeXRlU2l6ZS5NQikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG93bmxvYWRGaWxlQnVmZmVyZWRCcm93c2VyKGZpbGUucmVzb3VyY2UsIHRhcmdldEZpbGVXcml0ZXIsIG9wZXJhdGlvbiwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEZvciBzbWFsbCBmaWxlcyBwcmVmZXIgdG8gd3JpdGUgdW5idWZmZXJlZCB0byByZWR1Y2Ugb3ZlcmhlYWRcblx0XHRyZXR1cm4gdGhpcy5kb3dubG9hZEZpbGVVbmJ1ZmZlcmVkQnJvd3NlcihmaWxlLnJlc291cmNlLCB0YXJnZXRGaWxlV3JpdGVyLCBvcGVyYXRpb24sIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG93bmxvYWRGb2xkZXJCcm93c2VyKGZvbGRlcjogSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCB0YXJnZXRGb2xkZXI6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUsIG9wZXJhdGlvbjogSURvd25sb2FkT3BlcmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZm9sZGVyLmNoaWxkcmVuKSB7XG5cdFx0XHRvcGVyYXRpb24uZmlsZXNUb3RhbCArPSAoZm9sZGVyLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjaGlsZC5pc0ZpbGUpKS5sZW5ndGg7XG5cblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZm9sZGVyLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvd25sb2FkRmlsZUJyb3dzZXIodGFyZ2V0Rm9sZGVyLCBjaGlsZCwgb3BlcmF0aW9uLCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRGb2xkZXIgPSBhd2FpdCB0YXJnZXRGb2xkZXIuZ2V0RGlyZWN0b3J5SGFuZGxlKGNoaWxkLm5hbWUsIHsgY3JlYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkQ2hpbGRGb2xkZXIgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoY2hpbGQucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb3dubG9hZEZvbGRlckJyb3dzZXIocmVzb2x2ZWRDaGlsZEZvbGRlciwgY2hpbGRGb2xkZXIsIG9wZXJhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRQcm9ncmVzcyhuYW1lOiBzdHJpbmcsIGZpbGVTaXplOiBudW1iZXIsIGJ5dGVzRG93bmxvYWRlZDogbnVtYmVyLCBvcGVyYXRpb246IElEb3dubG9hZE9wZXJhdGlvbik6IHZvaWQge1xuXHRcdG9wZXJhdGlvbi5maWxlQnl0ZXNEb3dubG9hZGVkICs9IGJ5dGVzRG93bmxvYWRlZDtcblx0XHRvcGVyYXRpb24udG90YWxCeXRlc0Rvd25sb2FkZWQgKz0gYnl0ZXNEb3dubG9hZGVkO1xuXG5cdFx0Y29uc3QgYnl0ZXNEb3dubG9hZGVkUGVyU2Vjb25kID0gb3BlcmF0aW9uLnRvdGFsQnl0ZXNEb3dubG9hZGVkIC8gKChEYXRlLm5vdygpIC0gb3BlcmF0aW9uLnN0YXJ0VGltZSkgLyAxMDAwKTtcblxuXHRcdC8vIFNtYWxsIGZpbGVcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdGlmIChmaWxlU2l6ZSA8IEJ5dGVTaXplLk1CKSB7XG5cdFx0XHRpZiAob3BlcmF0aW9uLmZpbGVzVG90YWwgPT09IDEpIHtcblx0XHRcdFx0bWVzc2FnZSA9IG5hbWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Rvd25sb2FkUHJvZ3Jlc3NTbWFsbE1hbnknLCBcInswfSBvZiB7MX0gZmlsZXMgKHsyfS9zKVwiLCBvcGVyYXRpb24uZmlsZXNEb3dubG9hZGVkLCBvcGVyYXRpb24uZmlsZXNUb3RhbCwgQnl0ZVNpemUuZm9ybWF0U2l6ZShieXRlc0Rvd25sb2FkZWRQZXJTZWNvbmQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMYXJnZSBmaWxlXG5cdFx0ZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Rvd25sb2FkUHJvZ3Jlc3NMYXJnZScsIFwiezB9ICh7MX0gb2YgezJ9LCB7M30vcylcIiwgbmFtZSwgQnl0ZVNpemUuZm9ybWF0U2l6ZShvcGVyYXRpb24uZmlsZUJ5dGVzRG93bmxvYWRlZCksIEJ5dGVTaXplLmZvcm1hdFNpemUoZmlsZVNpemUpLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGJ5dGVzRG93bmxvYWRlZFBlclNlY29uZCkpO1xuXHRcdH1cblxuXHRcdC8vIFJlcG9ydCBwcm9ncmVzcyBidXQgbGltaXQgdG8gdXBkYXRlIG9ubHkgb25jZSBwZXIgc2Vjb25kXG5cdFx0b3BlcmF0aW9uLnByb2dyZXNzU2NoZWR1bGVyLndvcmsoeyBtZXNzYWdlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0Rvd25sb2FkTmF0aXZlKGV4cGxvcmVySXRlbTogRXhwbG9yZXJJdGVtLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogZXhwbG9yZXJJdGVtLm5hbWUgfSk7XG5cblx0XHRsZXQgZGVmYXVsdFVyaTogVVJJO1xuXHRcdGNvbnN0IGxhc3RVc2VkRG93bmxvYWRQYXRoID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRmlsZURvd25sb2FkLkxBU1RfVVNFRF9ET1dOTE9BRF9QQVRIX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChsYXN0VXNlZERvd25sb2FkUGF0aCkge1xuXHRcdFx0ZGVmYXVsdFVyaSA9IGpvaW5QYXRoKFVSSS5maWxlKGxhc3RVc2VkRG93bmxvYWRQYXRoKSwgZXhwbG9yZXJJdGVtLm5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWZhdWx0VXJpID0gam9pblBhdGgoXG5cdFx0XHRcdGV4cGxvcmVySXRlbS5pc0RpcmVjdG9yeSA/XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0Rm9sZGVyUGF0aChTY2hlbWFzLmZpbGUpIDpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aChTY2hlbWFzLmZpbGUpLFxuXHRcdFx0XHRleHBsb3Jlckl0ZW0ubmFtZVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLFxuXHRcdFx0c2F2ZUxhYmVsOiBsb2NhbGl6ZSgnZG93bmxvYWRCdXR0b24nLCBcIkRvd25sb2FkXCIpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaG9vc2VXaGVyZVRvRG93bmxvYWQnLCBcIkNob29zZSBXaGVyZSB0byBEb3dubG9hZFwiKSxcblx0XHRcdGRlZmF1bHRVcmlcblx0XHR9KTtcblxuXHRcdGlmIChkZXN0aW5hdGlvbikge1xuXG5cdFx0XHQvLyBSZW1lbWJlciBhcyBsYXN0IHVzZWQgZG93bmxvYWQgZm9sZGVyXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEZpbGVEb3dubG9hZC5MQVNUX1VTRURfRE9XTkxPQURfUEFUSF9TVE9SQUdFX0tFWSwgZGlybmFtZShkZXN0aW5hdGlvbikuZnNQYXRoLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRcdC8vIFBlcmZvcm0gZG93bmxvYWRcblx0XHRcdGF3YWl0IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQoW25ldyBSZXNvdXJjZUZpbGVFZGl0KGV4cGxvcmVySXRlbS5yZXNvdXJjZSwgZGVzdGluYXRpb24sIHsgb3ZlcndyaXRlOiB0cnVlLCBjb3B5OiB0cnVlIH0pXSwge1xuXHRcdFx0XHR1bmRvTGFiZWw6IGxvY2FsaXplKCdkb3dubG9hZEJ1bGtFZGl0JywgXCJEb3dubG9hZCB7MH1cIiwgZXhwbG9yZXJJdGVtLm5hbWUpLFxuXHRcdFx0XHRwcm9ncmVzc0xhYmVsOiBsb2NhbGl6ZSgnZG93bmxvYWRpbmdCdWxrRWRpdCcsIFwiRG93bmxvYWRpbmcgezB9XCIsIGV4cGxvcmVySXRlbS5uYW1lKSxcblx0XHRcdFx0cHJvZ3Jlc3NMb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3dcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdHMuY2FuY2VsKCk7IC8vIFVzZXIgY2FuY2VsZWQgYSBkb3dubG9hZC4gSW4gY2FzZSB0aGVyZSB3ZXJlIG11bHRpcGxlIGZpbGVzIHNlbGVjdGVkIHdlIHNob3VsZCBjYW5jZWwgdGhlIHJlbWFpbmRlciBvZiB0aGUgcHJvbXB0cyAjODYxMDBcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBIZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWxlT3ZlcndyaXRlQ29uZmlybShuYW1lOiBzdHJpbmcpOiBJQ29uZmlybWF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybU92ZXJ3cml0ZScsIFwiQSBmaWxlIG9yIGZvbGRlciB3aXRoIHRoZSBuYW1lICd7MH0nIGFscmVhZHkgZXhpc3RzIGluIHRoZSBkZXN0aW5hdGlvbiBmb2xkZXIuIERvIHlvdSB3YW50IHRvIHJlcGxhY2UgaXQ/XCIsIG5hbWUpLFxuXHRcdGRldGFpbDogbG9jYWxpemUoJ2lycmV2ZXJzaWJsZScsIFwiVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlIVwiKSxcblx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2VCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlcGxhY2VcIiksXG5cdFx0dHlwZTogJ3dhcm5pbmcnXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNdWx0aXBsZUZpbGVzT3ZlcndyaXRlQ29uZmlybShmaWxlczogVVJJW10pOiBJQ29uZmlybWF0aW9uIHtcblx0aWYgKGZpbGVzLmxlbmd0aCA+IDEpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1NYW55T3ZlcndyaXRlcycsIFwiVGhlIGZvbGxvd2luZyB7MH0gZmlsZXMgYW5kL29yIGZvbGRlcnMgYWxyZWFkeSBleGlzdCBpbiB0aGUgZGVzdGluYXRpb24gZm9sZGVyLiBEbyB5b3Ugd2FudCB0byByZXBsYWNlIHRoZW0/XCIsIGZpbGVzLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGdldEZpbGVOYW1lc01lc3NhZ2UoZmlsZXMpICsgJ1xcbicgKyBsb2NhbGl6ZSgnaXJyZXZlcnNpYmxlJywgXCJUaGlzIGFjdGlvbiBpcyBpcnJldmVyc2libGUhXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXBsYWNlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpLFxuXHRcdFx0dHlwZTogJ3dhcm5pbmcnXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiBnZXRGaWxlT3ZlcndyaXRlQ29uZmlybShiYXNlbmFtZShmaWxlc1swXSkpO1xufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMscUJBQW9DLGdCQUFnQiwwQkFBeUM7QUFDdEcsU0FBUyxVQUFVLGdDQUFnQyxvQkFBMkM7QUFDOUYsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQW9CLGtCQUFpQyx3QkFBd0I7QUFDN0UsU0FBUyx3QkFBd0I7QUFDakMsU0FBOEIsa0JBQWtCLGVBQWU7QUFDL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLFVBQVUscUJBQXFCO0FBQ2pELFNBQVMsMEJBQTBCLGdCQUFnQjtBQUNuRCxTQUFTLFVBQVUsU0FBUyxnQkFBZ0I7QUFDNUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixhQUFhLHVCQUF1QjtBQUM5RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFtQ3RELElBQU0sb0JBQU4sTUFBd0I7QUFBQSxFQUk5QixZQUNvQyxpQkFDRixlQUNFLGlCQUNGLGVBQ0YsYUFDOUI7QUFMa0M7QUFDRjtBQUNFO0FBQ0Y7QUFD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
