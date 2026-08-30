import { constants, promises } from "fs";
import { Barrier, retry } from "../../../base/common/async.js";
import { ResourceMap } from "../../../base/common/map.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { isEqual } from "../../../base/common/extpath.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { basename, dirname, join } from "../../../base/common/path.js";
import { isLinux, isWindows } from "../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase, joinPath, basename as resourcesBasename, dirname as resourcesDirname } from "../../../base/common/resources.js";
import { newWriteableStream } from "../../../base/common/stream.js";
import { Promises, RimRafMode, SymlinkSupport } from "../../../base/node/pfs.js";
import { localize } from "../../../nls.js";
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, isFileOpenForWriteOptions, FilePermission } from "../common/files.js";
import { readFileIntoStream } from "../common/io.js";
import { AbstractDiskFileSystemProvider } from "../common/diskFileSystemProvider.js";
import { UniversalWatcherClient } from "./watcher/watcherClient.js";
import { NodeJSWatcherClient } from "./watcher/nodejs/nodejsClient.js";
const _DiskFileSystemProvider = class _DiskFileSystemProvider extends AbstractDiskFileSystemProvider {
  constructor() {
    super(...arguments);
    // not enabled by default because very spammy
    //#region File Capabilities
    this.onDidChangeCapabilities = Event.None;
    //#endregion
    //#region File Reading/Writing
    this.resourceLocks = new ResourceMap((resource) => extUriBiasedIgnorePathCase.getComparisonKey(resource));
    this.mapHandleToPos = /* @__PURE__ */ new Map();
    this.mapHandleToLock = /* @__PURE__ */ new Map();
    this.writeHandles = /* @__PURE__ */ new Map();
  }
  get capabilities() {
    if (!this._capabilities) {
      this._capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.FileWriteUnlock | FileSystemProviderCapabilities.FileAppend | FileSystemProviderCapabilities.FileAtomicRead | FileSystemProviderCapabilities.FileAtomicWrite | FileSystemProviderCapabilities.FileAtomicDelete | FileSystemProviderCapabilities.FileClone | FileSystemProviderCapabilities.FileRealpath;
      if (isLinux) {
        this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
      }
    }
    return this._capabilities;
  }
  //#endregion
  //#region File Metadata Resolving
  async stat(resource) {
    try {
      const { stat, symbolicLink } = await SymlinkSupport.stat(this.toFilePath(resource));
      let permissions = void 0;
      if ((stat.mode & 128) === 0) {
        permissions = FilePermission.Locked;
      }
      if (stat.mode & constants.S_IXUSR || stat.mode & constants.S_IXGRP || stat.mode & constants.S_IXOTH) {
        permissions = (permissions ?? 0) | FilePermission.Executable;
      }
      return {
        type: this.toType(stat, symbolicLink),
        ctime: stat.birthtime.getTime(),
        // intentionally not using ctime here, we want the creation time
        mtime: stat.mtime.getTime(),
        size: stat.size,
        permissions
      };
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async statIgnoreError(resource) {
    try {
      return await this.stat(resource);
    } catch (error) {
      return void 0;
    }
  }
  async realpath(resource) {
    const filePath = this.toFilePath(resource);
    return Promises.realpath(filePath);
  }
  async readdir(resource) {
    try {
      const children = await Promises.readdir(this.toFilePath(resource), { withFileTypes: true });
      const result = [];
      await Promise.all(children.map(async (child) => {
        try {
          let type;
          if (child.isSymbolicLink()) {
            type = (await this.stat(joinPath(resource, child.name))).type;
          } else {
            type = this.toType(child);
          }
          result.push([child.name, type]);
        } catch (error) {
          this.logService.trace(error);
        }
      }));
      return result;
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  toType(entry, symbolicLink) {
    let type;
    if (symbolicLink?.dangling) {
      type = FileType.Unknown;
    } else if (entry.isFile()) {
      type = FileType.File;
    } else if (entry.isDirectory()) {
      type = FileType.Directory;
    } else {
      type = FileType.Unknown;
    }
    if (symbolicLink) {
      type |= FileType.SymbolicLink;
    }
    return type;
  }
  async createResourceLock(resource) {
    const filePath = this.toFilePath(resource);
    this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - request to acquire resource lock (${filePath})`);
    let existingLock = void 0;
    while (existingLock = this.resourceLocks.get(resource)) {
      this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - waiting for resource lock to be released (${filePath})`);
      await existingLock.wait();
    }
    const newLock = new Barrier();
    this.resourceLocks.set(resource, newLock);
    this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - new resource lock created (${filePath})`);
    return toDisposable(() => {
      this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock dispose() (${filePath})`);
      if (this.resourceLocks.get(resource) === newLock) {
        this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock removed from resource-lock map (${filePath})`);
        this.resourceLocks.delete(resource);
      }
      this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock barrier open() (${filePath})`);
      newLock.open();
    });
  }
  async readFile(resource, options) {
    let lock = void 0;
    try {
      if (options?.atomic) {
        this.traceLock(`[Disk FileSystemProvider]: atomic read operation started (${this.toFilePath(resource)})`);
        lock = await this.createResourceLock(resource);
      }
      const filePath = this.toFilePath(resource);
      return await promises.readFile(filePath);
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    } finally {
      lock?.dispose();
    }
  }
  traceLock(msg) {
    if (_DiskFileSystemProvider.TRACE_LOG_RESOURCE_LOCKS) {
      this.logService.trace(msg);
    }
  }
  readFileStream(resource, opts, token) {
    const stream = newWriteableStream((data) => VSBuffer.concat(data.map((data2) => VSBuffer.wrap(data2))).buffer);
    readFileIntoStream(this, resource, stream, (data) => data.buffer, {
      ...opts,
      bufferSize: 256 * 1024
      // read into chunks of 256kb each to reduce IPC overhead
    }, token);
    return stream;
  }
  async writeFile(resource, content, opts) {
    if (opts?.atomic !== false && opts?.atomic?.postfix && await this.canWriteFileAtomic(resource)) {
      return this.doWriteFileAtomic(resource, joinPath(resourcesDirname(resource), `${resourcesBasename(resource)}${opts.atomic.postfix}`), content, opts);
    } else {
      return this.doWriteFile(resource, content, opts);
    }
  }
  async canWriteFileAtomic(resource) {
    try {
      const filePath = this.toFilePath(resource);
      const { symbolicLink } = await SymlinkSupport.stat(filePath);
      if (symbolicLink) {
        return false;
      }
    } catch (error) {
    }
    return true;
  }
  async doWriteFileAtomic(resource, tempResource, content, opts) {
    const locks = new DisposableStore();
    try {
      locks.add(await this.createResourceLock(resource));
      locks.add(await this.createResourceLock(tempResource));
      await this.doWriteFile(
        tempResource,
        content,
        { ...opts, create: true, overwrite: true },
        true
        /* disable write lock */
      );
      try {
        await this.rename(tempResource, resource, { overwrite: true });
      } catch (error) {
        try {
          await this.delete(tempResource, { recursive: false, useTrash: false, atomic: false });
        } catch (error2) {
        }
        throw error;
      }
    } finally {
      locks.dispose();
    }
  }
  async doWriteFile(resource, content, opts, disableWriteLock) {
    let handle = void 0;
    try {
      const filePath = this.toFilePath(resource);
      if (!opts.create || !opts.overwrite) {
        const fileExists = await Promises.exists(filePath);
        if (fileExists) {
          if (!opts.overwrite) {
            throw createFileSystemProviderError(localize("fileExists", "File already exists"), FileSystemProviderErrorCode.FileExists);
          }
        } else {
          if (!opts.create) {
            throw createFileSystemProviderError(localize("fileNotExists", "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
          }
        }
      }
      handle = await this.open(resource, { create: true, append: opts.append, unlock: opts.unlock }, disableWriteLock);
      await this.write(handle, 0, content, 0, content.byteLength);
    } catch (error) {
      throw await this.toFileSystemProviderWriteError(resource, error);
    } finally {
      if (typeof handle === "number") {
        await this.close(handle);
      }
    }
  }
  static configureFlushOnWrite(enabled) {
    _DiskFileSystemProvider.canFlush = enabled;
  }
  async open(resource, opts, disableWriteLock) {
    const filePath = this.toFilePath(resource);
    let lock = void 0;
    if (isFileOpenForWriteOptions(opts) && !disableWriteLock) {
      lock = await this.createResourceLock(resource);
    }
    let fd = void 0;
    try {
      if (isFileOpenForWriteOptions(opts) && opts.unlock) {
        try {
          const { stat } = await SymlinkSupport.stat(filePath);
          if (!(stat.mode & 128)) {
            await promises.chmod(filePath, stat.mode | 128);
          }
        } catch (error) {
          if (error.code !== "ENOENT") {
            this.logService.trace(error);
          }
        }
      }
      if (isWindows && isFileOpenForWriteOptions(opts) && !opts.append) {
        try {
          fd = await Promises.open(filePath, "r+");
          await Promises.ftruncate(fd, 0);
        } catch (error) {
          if (error.code !== "ENOENT") {
            this.logService.trace(error);
          }
          if (typeof fd === "number") {
            try {
              await Promises.close(fd);
            } catch (error2) {
              this.logService.trace(error2);
            }
            fd = void 0;
          }
        }
      }
      if (typeof fd !== "number") {
        fd = await Promises.open(
          filePath,
          isFileOpenForWriteOptions(opts) ? (
            // We take `opts.create` as a hint that the file is opened for writing
            // as such we use 'w' to truncate an existing or create the
            // file otherwise. we do not allow reading.
            // If `opts.append` is true, use 'a' to append to the file.
            opts.append ? "a" : "w"
          ) : (
            // Otherwise we assume the file is opened for reading
            // as such we use 'r' to neither truncate, nor create
            // the file.
            "r"
          )
        );
      }
    } catch (error) {
      lock?.dispose();
      if (isFileOpenForWriteOptions(opts)) {
        throw await this.toFileSystemProviderWriteError(resource, error);
      } else {
        throw this.toFileSystemProviderError(error);
      }
    }
    this.mapHandleToPos.set(fd, 0);
    if (isFileOpenForWriteOptions(opts)) {
      this.writeHandles.set(fd, resource);
    }
    if (lock) {
      const previousLock = this.mapHandleToLock.get(fd);
      this.traceLock(`[Disk FileSystemProvider]: open() - storing lock for handle ${fd} (${filePath})`);
      this.mapHandleToLock.set(fd, lock);
      if (previousLock) {
        this.traceLock(`[Disk FileSystemProvider]: open() - disposing a previous lock that was still stored on same handle ${fd} (${filePath})`);
        previousLock.dispose();
      }
    }
    return fd;
  }
  async close(fd) {
    const lockForHandle = this.mapHandleToLock.get(fd);
    try {
      this.mapHandleToPos.delete(fd);
      if (this.writeHandles.delete(fd) && _DiskFileSystemProvider.canFlush) {
        try {
          await Promises.fdatasync(fd);
        } catch (error) {
          _DiskFileSystemProvider.configureFlushOnWrite(false);
          this.logService.error(error);
        }
      }
      return await Promises.close(fd);
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    } finally {
      if (lockForHandle) {
        if (this.mapHandleToLock.get(fd) === lockForHandle) {
          this.traceLock(`[Disk FileSystemProvider]: close() - resource lock removed from handle-lock map ${fd}`);
          this.mapHandleToLock.delete(fd);
        }
        this.traceLock(`[Disk FileSystemProvider]: close() - disposing lock for handle ${fd}`);
        lockForHandle.dispose();
      }
    }
  }
  async read(fd, pos, data, offset, length) {
    const normalizedPos = this.normalizePos(fd, pos);
    let bytesRead = null;
    try {
      bytesRead = (await Promises.read(fd, data, offset, length, normalizedPos)).bytesRead;
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    } finally {
      this.updatePos(fd, normalizedPos, bytesRead);
    }
    return bytesRead;
  }
  normalizePos(fd, pos) {
    if (pos === this.mapHandleToPos.get(fd)) {
      return null;
    }
    return pos;
  }
  updatePos(fd, pos, bytesLength) {
    const lastKnownPos = this.mapHandleToPos.get(fd);
    if (typeof lastKnownPos === "number") {
      if (typeof pos === "number") {
      } else if (typeof bytesLength === "number") {
        this.mapHandleToPos.set(fd, lastKnownPos + bytesLength);
      } else {
        this.mapHandleToPos.delete(fd);
      }
    }
  }
  async write(fd, pos, data, offset, length) {
    return retry(
      () => this.doWrite(fd, pos, data, offset, length),
      100,
      3
      /* retries */
    );
  }
  async doWrite(fd, pos, data, offset, length) {
    const normalizedPos = this.normalizePos(fd, pos);
    let bytesWritten = null;
    try {
      bytesWritten = (await Promises.write(fd, data, offset, length, normalizedPos)).bytesWritten;
    } catch (error) {
      throw await this.toFileSystemProviderWriteError(this.writeHandles.get(fd), error);
    } finally {
      this.updatePos(fd, normalizedPos, bytesWritten);
    }
    return bytesWritten;
  }
  //#endregion
  //#region Move/Copy/Delete/Create Folder
  async mkdir(resource) {
    try {
      await promises.mkdir(this.toFilePath(resource));
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async delete(resource, opts) {
    try {
      const filePath = this.toFilePath(resource);
      if (opts.recursive) {
        let rmMoveToPath = void 0;
        if (opts?.atomic !== false && opts.atomic.postfix) {
          rmMoveToPath = join(dirname(filePath), `${basename(filePath)}${opts.atomic.postfix}`);
        }
        await Promises.rm(filePath, RimRafMode.MOVE, rmMoveToPath);
      } else {
        try {
          await promises.unlink(filePath);
        } catch (unlinkError) {
          if (unlinkError.code === "EPERM" || unlinkError.code === "EISDIR") {
            let isDirectory = false;
            try {
              const { stat, symbolicLink } = await SymlinkSupport.stat(filePath);
              isDirectory = stat.isDirectory() && !symbolicLink;
            } catch (statError) {
            }
            if (isDirectory) {
              await promises.rmdir(filePath);
            } else {
              throw unlinkError;
            }
          } else {
            throw unlinkError;
          }
        }
      }
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async rename(from, to, opts) {
    const fromFilePath = this.toFilePath(from);
    const toFilePath = this.toFilePath(to);
    if (fromFilePath === toFilePath) {
      return;
    }
    try {
      await this.validateMoveCopy(from, to, "move", opts.overwrite);
      await Promises.rename(fromFilePath, toFilePath);
    } catch (error) {
      if (error.code === "EINVAL" || error.code === "EBUSY" || error.code === "ENAMETOOLONG") {
        error = new Error(localize("moveError", "Unable to move '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
      }
      throw this.toFileSystemProviderError(error);
    }
  }
  async copy(from, to, opts) {
    const fromFilePath = this.toFilePath(from);
    const toFilePath = this.toFilePath(to);
    if (fromFilePath === toFilePath) {
      return;
    }
    try {
      await this.validateMoveCopy(from, to, "copy", opts.overwrite);
      await Promises.copy(fromFilePath, toFilePath, { preserveSymlinks: true });
    } catch (error) {
      if (error.code === "EINVAL" || error.code === "EBUSY" || error.code === "ENAMETOOLONG") {
        error = new Error(localize("copyError", "Unable to copy '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
      }
      throw this.toFileSystemProviderError(error);
    }
  }
  async validateMoveCopy(from, to, mode, overwrite) {
    const fromFilePath = this.toFilePath(from);
    const toFilePath = this.toFilePath(to);
    let isSameResourceWithDifferentPathCase = false;
    const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
    if (!isPathCaseSensitive) {
      isSameResourceWithDifferentPathCase = isEqual(
        fromFilePath,
        toFilePath,
        true
        /* ignore case */
      );
    }
    if (isSameResourceWithDifferentPathCase) {
      if (mode === "copy") {
        throw createFileSystemProviderError(localize("fileCopyErrorPathCase", "File cannot be copied to same path with different path case"), FileSystemProviderErrorCode.FileExists);
      } else if (mode === "move") {
        return;
      }
    }
    const fromStat = await this.statIgnoreError(from);
    if (!fromStat) {
      throw createFileSystemProviderError(localize("fileMoveCopyErrorNotFound", "File to move/copy does not exist"), FileSystemProviderErrorCode.FileNotFound);
    }
    const toStat = await this.statIgnoreError(to);
    if (!toStat) {
      return;
    }
    if (!overwrite) {
      throw createFileSystemProviderError(localize("fileMoveCopyErrorExists", "File at target already exists and thus will not be moved/copied to unless overwrite is specified"), FileSystemProviderErrorCode.FileExists);
    }
    if ((fromStat.type & FileType.File) !== 0 && (toStat.type & FileType.File) !== 0) {
      return;
    } else {
      await this.delete(to, { recursive: true, useTrash: false, atomic: false });
    }
  }
  //#endregion
  //#region Clone File
  async cloneFile(from, to) {
    return this.doCloneFile(
      from,
      to,
      false
      /* optimistically assume parent folders exist */
    );
  }
  async doCloneFile(from, to, mkdir) {
    const fromFilePath = this.toFilePath(from);
    const toFilePath = this.toFilePath(to);
    const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
    if (isEqual(fromFilePath, toFilePath, !isPathCaseSensitive)) {
      return;
    }
    const locks = new DisposableStore();
    try {
      locks.add(await this.createResourceLock(from));
      locks.add(await this.createResourceLock(to));
      if (mkdir) {
        await promises.mkdir(dirname(toFilePath), { recursive: true });
      }
      await promises.copyFile(fromFilePath, toFilePath);
    } catch (error) {
      if (error.code === "ENOENT" && !mkdir) {
        return this.doCloneFile(from, to, true);
      }
      throw this.toFileSystemProviderError(error);
    } finally {
      locks.dispose();
    }
  }
  //#endregion
  //#region File Watching
  createUniversalWatcher(onChange, onLogMessage, verboseLogging) {
    return new UniversalWatcherClient((changes) => onChange(changes), (msg) => onLogMessage(msg), verboseLogging);
  }
  createNonRecursiveWatcher(onChange, onLogMessage, verboseLogging) {
    return new NodeJSWatcherClient((changes) => onChange(changes), (msg) => onLogMessage(msg), verboseLogging);
  }
  //#endregion
  //#region Helpers
  toFileSystemProviderError(error) {
    if (error instanceof FileSystemProviderError) {
      return error;
    }
    let resultError = error;
    let code;
    switch (error.code) {
      case "ENOENT":
        code = FileSystemProviderErrorCode.FileNotFound;
        break;
      case "EISDIR":
        code = FileSystemProviderErrorCode.FileIsADirectory;
        break;
      case "ENOTDIR":
        code = FileSystemProviderErrorCode.FileNotADirectory;
        break;
      case "EEXIST":
        code = FileSystemProviderErrorCode.FileExists;
        break;
      case "EPERM":
      case "EACCES":
        code = FileSystemProviderErrorCode.NoPermissions;
        break;
      case "ERR_UNC_HOST_NOT_ALLOWED":
        resultError = `${error.message}. Please update the 'security.allowedUNCHosts' setting if you want to allow this host.`;
        code = FileSystemProviderErrorCode.Unknown;
        break;
      default:
        code = FileSystemProviderErrorCode.Unknown;
    }
    return createFileSystemProviderError(resultError, code);
  }
  async toFileSystemProviderWriteError(resource, error) {
    let fileSystemProviderWriteError = this.toFileSystemProviderError(error);
    if (resource && fileSystemProviderWriteError.code === FileSystemProviderErrorCode.NoPermissions) {
      try {
        const { stat } = await SymlinkSupport.stat(this.toFilePath(resource));
        if (!(stat.mode & 128)) {
          fileSystemProviderWriteError = createFileSystemProviderError(error, FileSystemProviderErrorCode.FileWriteLocked);
        }
      } catch (error2) {
        this.logService.trace(error2);
      }
    }
    return fileSystemProviderWriteError;
  }
  //#endregion
};
_DiskFileSystemProvider.TRACE_LOG_RESOURCE_LOCKS = false;
_DiskFileSystemProvider.canFlush = true;
let DiskFileSystemProvider = _DiskFileSystemProvider;
export {
  DiskFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXG5vZGVcXGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTdGF0cywgY29uc3RhbnRzLCBwcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IEJhcnJpZXIsIHJldHJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBqb2luUGF0aCwgYmFzZW5hbWUgYXMgcmVzb3VyY2VzQmFzZW5hbWUsIGRpcm5hbWUgYXMgcmVzb3VyY2VzRGlybmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBuZXdXcml0ZWFibGVTdHJlYW0sIFJlYWRhYmxlU3RyZWFtRXZlbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRGlyZW50LCBQcm9taXNlcywgUmltUmFmTW9kZSwgU3ltbGlua1N1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLCBJRmlsZUF0b21pY1JlYWRPcHRpb25zLCBJRmlsZURlbGV0ZU9wdGlvbnMsIElGaWxlT3Blbk9wdGlvbnMsIElGaWxlT3ZlcndyaXRlT3B0aW9ucywgSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCBGaWxlVHlwZSwgSUZpbGVXcml0ZU9wdGlvbnMsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVDbG9uZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUZvbGRlckNvcHlDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBpc0ZpbGVPcGVuRm9yV3JpdGVPcHRpb25zLCBJU3RhdCwgRmlsZVBlcm1pc3Npb24sIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1dyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eSwgSUZpbGVDaGFuZ2UsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyByZWFkRmlsZUludG9TdHJlYW0gfSBmcm9tICcuLi9jb21tb24vaW8uanMnO1xuaW1wb3J0IHsgQWJzdHJhY3ROb25SZWN1cnNpdmVXYXRjaGVyQ2xpZW50LCBBYnN0cmFjdFVuaXZlcnNhbFdhdGNoZXJDbGllbnQsIElMb2dNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3dhdGNoZXIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REaXNrRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVW5pdmVyc2FsV2F0Y2hlckNsaWVudCB9IGZyb20gJy4vd2F0Y2hlci93YXRjaGVyQ2xpZW50LmpzJztcbmltcG9ydCB7IE5vZGVKU1dhdGNoZXJDbGllbnQgfSBmcm9tICcuL3dhdGNoZXIvbm9kZWpzL25vZGVqc0NsaWVudC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgQWJzdHJhY3REaXNrRmlsZVN5c3RlbVByb3ZpZGVyIGltcGxlbWVudHNcblx0SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSxcblx0SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LFxuXHRJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSxcblx0SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHksXG5cdElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LFxuXHRJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHksXG5cdElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHksXG5cdElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUNsb25lQ2FwYWJpbGl0eSxcblx0SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhbHBhdGhDYXBhYmlsaXR5IHtcblxuXHRwcml2YXRlIHN0YXRpYyBUUkFDRV9MT0dfUkVTT1VSQ0VfTE9DS1MgPSBmYWxzZTsgLy8gbm90IGVuYWJsZWQgYnkgZGVmYXVsdCBiZWNhdXNlIHZlcnkgc3BhbW15XG5cblx0Ly8jcmVnaW9uIEZpbGUgQ2FwYWJpbGl0aWVzXG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMgPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgX2NhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkO1xuXHRnZXQgY2FwYWJpbGl0aWVzKCk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB7XG5cdFx0aWYgKCF0aGlzLl9jYXBhYmlsaXRpZXMpIHtcblx0XHRcdHRoaXMuX2NhcGFiaWxpdGllcyA9XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0gfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVdyaXRlVW5sb2NrIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1JlYWQgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNEZWxldGUgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUNsb25lIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFscGF0aDtcblxuXHRcdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0aWVzIHw9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgTWV0YWRhdGEgUmVzb2x2aW5nXG5cblx0YXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHN0YXQsIHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdCh0aGlzLnRvRmlsZVBhdGgocmVzb3VyY2UpKTsgLy8gY2Fubm90IHVzZSBmcy5zdGF0KCkgaGVyZSB0byBzdXBwb3J0IGxpbmtzIHByb3Blcmx5XG5cblx0XHRcdGxldCBwZXJtaXNzaW9uczogRmlsZVBlcm1pc3Npb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoKHN0YXQubW9kZSAmIDBvMjAwKSA9PT0gMCkge1xuXHRcdFx0XHRwZXJtaXNzaW9ucyA9IEZpbGVQZXJtaXNzaW9uLkxvY2tlZDtcblx0XHRcdH1cblx0XHRcdGlmIChcblx0XHRcdFx0c3RhdC5tb2RlICYgY29uc3RhbnRzLlNfSVhVU1IgfHxcblx0XHRcdFx0c3RhdC5tb2RlICYgY29uc3RhbnRzLlNfSVhHUlAgfHxcblx0XHRcdFx0c3RhdC5tb2RlICYgY29uc3RhbnRzLlNfSVhPVEhcblx0XHRcdCkge1xuXHRcdFx0XHRwZXJtaXNzaW9ucyA9IChwZXJtaXNzaW9ucyA/PyAwKSB8IEZpbGVQZXJtaXNzaW9uLkV4ZWN1dGFibGU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IHRoaXMudG9UeXBlKHN0YXQsIHN5bWJvbGljTGluayksXG5cdFx0XHRcdGN0aW1lOiBzdGF0LmJpcnRodGltZS5nZXRUaW1lKCksIC8vIGludGVudGlvbmFsbHkgbm90IHVzaW5nIGN0aW1lIGhlcmUsIHdlIHdhbnQgdGhlIGNyZWF0aW9uIHRpbWVcblx0XHRcdFx0bXRpbWU6IHN0YXQubXRpbWUuZ2V0VGltZSgpLFxuXHRcdFx0XHRzaXplOiBzdGF0LnNpemUsXG5cdFx0XHRcdHBlcm1pc3Npb25zXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RhdElnbm9yZUVycm9yKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnN0YXQocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWxwYXRoKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHJlc291cmNlKTtcblxuXHRcdHJldHVybiBQcm9taXNlcy5yZWFscGF0aChmaWxlUGF0aCk7XG5cdH1cblxuXHRhc3luYyByZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcih0aGlzLnRvRmlsZVBhdGgocmVzb3VyY2UpLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogW3N0cmluZywgRmlsZVR5cGVdW10gPSBbXTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGNoaWxkcmVuLm1hcChhc3luYyBjaGlsZCA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bGV0IHR5cGU6IEZpbGVUeXBlO1xuXHRcdFx0XHRcdGlmIChjaGlsZC5pc1N5bWJvbGljTGluaygpKSB7XG5cdFx0XHRcdFx0XHR0eXBlID0gKGF3YWl0IHRoaXMuc3RhdChqb2luUGF0aChyZXNvdXJjZSwgY2hpbGQubmFtZSkpKS50eXBlOyAvLyBhbHdheXMgcmVzb2x2ZSB0YXJnZXQgdGhlIGxpbmsgcG9pbnRzIHRvIGlmIGFueVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0eXBlID0gdGhpcy50b1R5cGUoY2hpbGQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFtjaGlsZC5uYW1lLCB0eXBlXSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGVycm9yKTsgLy8gaWdub3JlIGVycm9ycyBmb3IgaW5kaXZpZHVhbCBlbnRyaWVzIHRoYXQgY2FuIGFyaXNlIGZyb20gcGVybWlzc2lvbiBkZW5pZWRcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9UeXBlKGVudHJ5OiBTdGF0cyB8IElEaXJlbnQsIHN5bWJvbGljTGluaz86IHsgZGFuZ2xpbmc6IGJvb2xlYW4gfSk6IEZpbGVUeXBlIHtcblxuXHRcdC8vIFNpZ25hbCBmaWxlIHR5cGUgYnkgY2hlY2tpbmcgZm9yIGZpbGUgLyBkaXJlY3RvcnksIGV4Y2VwdDpcblx0XHQvLyAtIHN5bWJvbGljIGxpbmtzIHBvaW50aW5nIHRvIG5vbmV4aXN0ZW50IGZpbGVzIGFyZSBGaWxlVHlwZS5Vbmtub3duXG5cdFx0Ly8gLSBmaWxlcyB0aGF0IGFyZSBuZWl0aGVyIGZpbGUgbm9yIGRpcmVjdG9yeSBhcmUgRmlsZVR5cGUuVW5rbm93blxuXHRcdGxldCB0eXBlOiBGaWxlVHlwZTtcblx0XHRpZiAoc3ltYm9saWNMaW5rPy5kYW5nbGluZykge1xuXHRcdFx0dHlwZSA9IEZpbGVUeXBlLlVua25vd247XG5cdFx0fSBlbHNlIGlmIChlbnRyeS5pc0ZpbGUoKSkge1xuXHRcdFx0dHlwZSA9IEZpbGVUeXBlLkZpbGU7XG5cdFx0fSBlbHNlIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHR0eXBlID0gRmlsZVR5cGUuRGlyZWN0b3J5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0eXBlID0gRmlsZVR5cGUuVW5rbm93bjtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgc2lnbmFsIHN5bWJvbGljIGxpbmsgYXMgZmlsZSB0eXBlIGFkZGl0aW9uYWxseVxuXHRcdGlmIChzeW1ib2xpY0xpbmspIHtcblx0XHRcdHR5cGUgfD0gRmlsZVR5cGUuU3ltYm9saWNMaW5rO1xuXHRcdH1cblxuXHRcdHJldHVybiB0eXBlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgUmVhZGluZy9Xcml0aW5nXG5cblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUxvY2tzID0gbmV3IFJlc291cmNlTWFwPEJhcnJpZXI+KHJlc291cmNlID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpKTtcblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVJlc291cmNlTG9jayhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4ge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHJlc291cmNlKTtcblx0XHR0aGlzLnRyYWNlTG9jayhgW0Rpc2sgRmlsZVN5c3RlbVByb3ZpZGVyXTogY3JlYXRlUmVzb3VyY2VMb2NrKCkgLSByZXF1ZXN0IHRvIGFjcXVpcmUgcmVzb3VyY2UgbG9jayAoJHtmaWxlUGF0aH0pYCk7XG5cblx0XHQvLyBBd2FpdCBwZW5kaW5nIGxvY2tzIGZvciByZXNvdXJjZS4gSXQgaXMgcG9zc2libGUgZm9yIGEgbmV3IGxvY2sgYmVpbmdcblx0XHQvLyBhZGRlZCByaWdodCBhZnRlciBvcGVuaW5nLCBzbyB3ZSBoYXZlIHRvIGxvb3Agb3ZlciBsb2NrcyB1bnRpbCBubyBsb2NrXG5cdFx0Ly8gcmVtYWlucy5cblx0XHRsZXQgZXhpc3RpbmdMb2NrOiBCYXJyaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHdoaWxlIChleGlzdGluZ0xvY2sgPSB0aGlzLnJlc291cmNlTG9ja3MuZ2V0KHJlc291cmNlKSkge1xuXHRcdFx0dGhpcy50cmFjZUxvY2soYFtEaXNrIEZpbGVTeXN0ZW1Qcm92aWRlcl06IGNyZWF0ZVJlc291cmNlTG9jaygpIC0gd2FpdGluZyBmb3IgcmVzb3VyY2UgbG9jayB0byBiZSByZWxlYXNlZCAoJHtmaWxlUGF0aH0pYCk7XG5cdFx0XHRhd2FpdCBleGlzdGluZ0xvY2sud2FpdCgpO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlIG5ld1xuXHRcdGNvbnN0IG5ld0xvY2sgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMucmVzb3VyY2VMb2Nrcy5zZXQocmVzb3VyY2UsIG5ld0xvY2spO1xuXG5cdFx0dGhpcy50cmFjZUxvY2soYFtEaXNrIEZpbGVTeXN0ZW1Qcm92aWRlcl06IGNyZWF0ZVJlc291cmNlTG9jaygpIC0gbmV3IHJlc291cmNlIGxvY2sgY3JlYXRlZCAoJHtmaWxlUGF0aH0pYCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMudHJhY2VMb2NrKGBbRGlzayBGaWxlU3lzdGVtUHJvdmlkZXJdOiBjcmVhdGVSZXNvdXJjZUxvY2soKSAtIHJlc291cmNlIGxvY2sgZGlzcG9zZSgpICgke2ZpbGVQYXRofSlgKTtcblxuXHRcdFx0Ly8gRGVsZXRlIGxvY2sgaWYgaXQgaXMgc3RpbGwgb3Vyc1xuXHRcdFx0aWYgKHRoaXMucmVzb3VyY2VMb2Nrcy5nZXQocmVzb3VyY2UpID09PSBuZXdMb2NrKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VMb2NrKGBbRGlzayBGaWxlU3lzdGVtUHJvdmlkZXJdOiBjcmVhdGVSZXNvdXJjZUxvY2soKSAtIHJlc291cmNlIGxvY2sgcmVtb3ZlZCBmcm9tIHJlc291cmNlLWxvY2sgbWFwICgke2ZpbGVQYXRofSlgKTtcblx0XHRcdFx0dGhpcy5yZXNvdXJjZUxvY2tzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gbG9ja1xuXHRcdFx0dGhpcy50cmFjZUxvY2soYFtEaXNrIEZpbGVTeXN0ZW1Qcm92aWRlcl06IGNyZWF0ZVJlc291cmNlTG9jaygpIC0gcmVzb3VyY2UgbG9jayBiYXJyaWVyIG9wZW4oKSAoJHtmaWxlUGF0aH0pYCk7XG5cdFx0XHRuZXdMb2NrLm9wZW4oKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJRmlsZUF0b21pY1JlYWRPcHRpb25zKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0bGV0IGxvY2s6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uYXRvbWljKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VMb2NrKGBbRGlzayBGaWxlU3lzdGVtUHJvdmlkZXJdOiBhdG9taWMgcmVhZCBvcGVyYXRpb24gc3RhcnRlZCAoJHt0aGlzLnRvRmlsZVBhdGgocmVzb3VyY2UpfSlgKTtcblxuXHRcdFx0XHQvLyBXaGVuIHRoZSByZWFkIHNob3VsZCBiZSBhdG9taWMsIG1ha2Ugc3VyZVxuXHRcdFx0XHQvLyB0byBhd2FpdCBhbnkgcGVuZGluZyBsb2NrcyBmb3IgdGhlIHJlc291cmNlXG5cdFx0XHRcdC8vIGFuZCBsb2NrIGZvciB0aGUgZHVyYXRpb24gb2YgdGhlIHJlYWQuXG5cdFx0XHRcdGxvY2sgPSBhd2FpdCB0aGlzLmNyZWF0ZVJlc291cmNlTG9jayhyZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHJlc291cmNlKTtcblxuXHRcdFx0cmV0dXJuIGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGZpbGVQYXRoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bG9jaz8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2VMb2NrKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKERpc2tGaWxlU3lzdGVtUHJvdmlkZXIuVFJBQ0VfTE9HX1JFU09VUkNFX0xPQ0tTKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UobXNnKTtcblx0XHR9XG5cdH1cblxuXHRyZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+KGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEubWFwKGRhdGEgPT4gVlNCdWZmZXIud3JhcChkYXRhKSkpLmJ1ZmZlcik7XG5cblx0XHRyZWFkRmlsZUludG9TdHJlYW0odGhpcywgcmVzb3VyY2UsIHN0cmVhbSwgZGF0YSA9PiBkYXRhLmJ1ZmZlciwge1xuXHRcdFx0Li4ub3B0cyxcblx0XHRcdGJ1ZmZlclNpemU6IDI1NiAqIDEwMjQgLy8gcmVhZCBpbnRvIGNodW5rcyBvZiAyNTZrYiBlYWNoIHRvIHJlZHVjZSBJUEMgb3ZlcmhlYWRcblx0XHR9LCB0b2tlbik7XG5cblx0XHRyZXR1cm4gc3RyZWFtO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG9wdHM/LmF0b21pYyAhPT0gZmFsc2UgJiYgb3B0cz8uYXRvbWljPy5wb3N0Zml4ICYmIGF3YWl0IHRoaXMuY2FuV3JpdGVGaWxlQXRvbWljKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9Xcml0ZUZpbGVBdG9taWMocmVzb3VyY2UsIGpvaW5QYXRoKHJlc291cmNlc0Rpcm5hbWUocmVzb3VyY2UpLCBgJHtyZXNvdXJjZXNCYXNlbmFtZShyZXNvdXJjZSl9JHtvcHRzLmF0b21pYy5wb3N0Zml4fWApLCBjb250ZW50LCBvcHRzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9Xcml0ZUZpbGUocmVzb3VyY2UsIGNvbnRlbnQsIG9wdHMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuV3JpdGVGaWxlQXRvbWljKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSB0aGlzLnRvRmlsZVBhdGgocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgeyBzeW1ib2xpY0xpbmsgfSA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQoZmlsZVBhdGgpO1xuXHRcdFx0aWYgKHN5bWJvbGljTGluaykge1xuXHRcdFx0XHQvLyBhdG9taWMgd3JpdGVzIGFyZSB1bnN1cHBvcnRlZCBmb3Igc3ltYm9saWMgbGlua3MgYmVjYXVzZVxuXHRcdFx0XHQvLyB3ZSBuZWVkIHRvIGVuc3VyZSB0aGF0IHRoZSBgcmVuYW1lYCBvcGVyYXRpb24gaXMgYXRvbWljXG5cdFx0XHRcdC8vIGFuZCB0aGF0IG9ubHkgd29ya3MgaWYgdGhlIGxpbmsgaXMgb24gdGhlIHNhbWUgZGlzay5cblx0XHRcdFx0Ly8gU2luY2Ugd2UgZG8gbm90IGtub3cgd2hlcmUgdGhlIHN5bWJvbGljIGxpbmsgcG9pbnRzIHRvXG5cdFx0XHRcdC8vIHdlIHJlZnVzZSB0byB3cml0ZSBhdG9taWNhbGx5LlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZSBzdGF0IGVycm9ycyBoZXJlIGFuZCBqdXN0IHByb2NlZWQgdHJ5aW5nIHRvIHdyaXRlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7IC8vIGF0b21pYyB3cml0aW5nIHN1cHBvcnRlZFxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlRmlsZUF0b21pYyhyZXNvdXJjZTogVVJJLCB0ZW1wUmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEVuc3VyZSB0byBjcmVhdGUgbG9ja3MgZm9yIGFsbCByZXNvdXJjZXMgaW52b2x2ZWRcblx0XHQvLyBzaW5jZSBhdG9taWMgd3JpdGUgaW52b2x2ZXMgbXV0aXBsZSBkaXNrIG9wZXJhdGlvbnNcblx0XHQvLyBhbmQgcmVzb3VyY2VzLlxuXG5cdFx0Y29uc3QgbG9ja3MgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0bG9ja3MuYWRkKGF3YWl0IHRoaXMuY3JlYXRlUmVzb3VyY2VMb2NrKHJlc291cmNlKSk7XG5cdFx0XHRsb2Nrcy5hZGQoYXdhaXQgdGhpcy5jcmVhdGVSZXNvdXJjZUxvY2sodGVtcFJlc291cmNlKSk7XG5cblx0XHRcdC8vIFdyaXRlIHRvIHRlbXAgcmVzb3VyY2UgZmlyc3Rcblx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUZpbGUodGVtcFJlc291cmNlLCBjb250ZW50LCB7IC4uLm9wdHMsIGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlIH0sIHRydWUgLyogZGlzYWJsZSB3cml0ZSBsb2NrICovKTtcblxuXHRcdFx0dHJ5IHtcblxuXHRcdFx0XHQvLyBSZW5hbWUgb3ZlciBleGlzdGluZyB0byBlbnN1cmUgYXRvbWljIHJlcGxhY2Vcblx0XHRcdFx0YXdhaXQgdGhpcy5yZW5hbWUodGVtcFJlc291cmNlLCByZXNvdXJjZSwgeyBvdmVyd3JpdGU6IHRydWUgfSk7XG5cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdFx0Ly8gQ2xlYW51cCBpbiBjYXNlIG9mIHJlbmFtZSBlcnJvclxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlKHRlbXBSZXNvdXJjZSwgeyByZWN1cnNpdmU6IGZhbHNlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlIC0gd2Ugd2FudCB0aGUgb3V0ZXIgZXJyb3IgdG8gYnViYmxlIHVwXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bG9ja3MuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Xcml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVXcml0ZU9wdGlvbnMsIGRpc2FibGVXcml0ZUxvY2s/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlUGF0aCA9IHRoaXMudG9GaWxlUGF0aChyZXNvdXJjZSk7XG5cblx0XHRcdC8vIFZhbGlkYXRlIHRhcmdldCB1bmxlc3MgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSB9XG5cdFx0XHRpZiAoIW9wdHMuY3JlYXRlIHx8ICFvcHRzLm92ZXJ3cml0ZSkge1xuXHRcdFx0XHRjb25zdCBmaWxlRXhpc3RzID0gYXdhaXQgUHJvbWlzZXMuZXhpc3RzKGZpbGVQYXRoKTtcblx0XHRcdFx0aWYgKGZpbGVFeGlzdHMpIHtcblx0XHRcdFx0XHRpZiAoIW9wdHMub3ZlcndyaXRlKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZUV4aXN0cycsIFwiRmlsZSBhbHJlYWR5IGV4aXN0c1wiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoIW9wdHMuY3JlYXRlKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZU5vdEV4aXN0cycsIFwiRmlsZSBkb2VzIG5vdCBleGlzdFwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW5cblx0XHRcdGhhbmRsZSA9IGF3YWl0IHRoaXMub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIGFwcGVuZDogb3B0cy5hcHBlbmQsIHVubG9jazogb3B0cy51bmxvY2sgfSwgZGlzYWJsZVdyaXRlTG9jayk7XG5cblx0XHRcdC8vIFdyaXRlIGNvbnRlbnQgYXQgb25jZVxuXHRcdFx0YXdhaXQgdGhpcy53cml0ZShoYW5kbGUsIDAsIGNvbnRlbnQsIDAsIGNvbnRlbnQuYnl0ZUxlbmd0aCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IGF3YWl0IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJXcml0ZUVycm9yKHJlc291cmNlLCBlcnJvcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0eXBlb2YgaGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNsb3NlKGhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBIYW5kbGVUb1BvcyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwSGFuZGxlVG9Mb2NrID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd3JpdGVIYW5kbGVzID0gbmV3IE1hcDxudW1iZXIsIFVSST4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyBjYW5GbHVzaCA9IHRydWU7XG5cblx0c3RhdGljIGNvbmZpZ3VyZUZsdXNoT25Xcml0ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5jYW5GbHVzaCA9IGVuYWJsZWQ7XG5cdH1cblxuXHRhc3luYyBvcGVuKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMsIGRpc2FibGVXcml0ZUxvY2s/OiBib29sZWFuKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IHRoaXMudG9GaWxlUGF0aChyZXNvdXJjZSk7XG5cblx0XHQvLyBXcml0ZXM6IGd1YXJkIG11bHRpcGxlIHdyaXRlcyB0byB0aGUgc2FtZSByZXNvdXJjZVxuXHRcdC8vIGJlaGluZCBhIHNpbmdsZSBsb2NrIHRvIHByZXZlbnQgcmFjZXMgd2hlbiB3cml0aW5nXG5cdFx0Ly8gZnJvbSBtdWx0aXBsZSBwbGFjZXMgYXQgdGhlIHNhbWUgdGltZSB0byB0aGUgc2FtZSBmaWxlXG5cdFx0bGV0IGxvY2s6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpc0ZpbGVPcGVuRm9yV3JpdGVPcHRpb25zKG9wdHMpICYmICFkaXNhYmxlV3JpdGVMb2NrKSB7XG5cdFx0XHRsb2NrID0gYXdhaXQgdGhpcy5jcmVhdGVSZXNvdXJjZUxvY2socmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGxldCBmZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cblx0XHRcdC8vIERldGVybWluZSB3aGV0aGVyIHRvIHVubG9jayB0aGUgZmlsZSAod3JpdGUgb25seSlcblx0XHRcdGlmIChpc0ZpbGVPcGVuRm9yV3JpdGVPcHRpb25zKG9wdHMpICYmIG9wdHMudW5sb2NrKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBzdGF0IH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KGZpbGVQYXRoKTtcblx0XHRcdFx0XHRpZiAoIShzdGF0Lm1vZGUgJiAwbzIwMCAvKiBGaWxlIG1vZGUgaW5kaWNhdGluZyB3cml0YWJsZSBieSBvd25lciAqLykpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHByb21pc2VzLmNobW9kKGZpbGVQYXRoLCBzdGF0Lm1vZGUgfCAwbzIwMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRU5PRU5UJykge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGVycm9yKTsgLy8gbG9nIGVycm9ycyBidXQgZG8gbm90IGdpdmUgdXAgd3JpdGluZ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaW5kb3dzIGdldHMgc3BlY2lhbCB0cmVhdG1lbnQgKHdyaXRlIG9ubHksIGJ1dCBub3QgZm9yIGFwcGVuZClcblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgaXNGaWxlT3BlbkZvcldyaXRlT3B0aW9ucyhvcHRzKSAmJiAhb3B0cy5hcHBlbmQpIHtcblx0XHRcdFx0dHJ5IHtcblxuXHRcdFx0XHRcdC8vIFdlIHRyeSB0byB1c2UgJ3IrJyBmb3Igb3BlbmluZyAod2hpY2ggd2lsbCBmYWlsIGlmIHRoZSBmaWxlIGRvZXMgbm90IGV4aXN0KVxuXHRcdFx0XHRcdC8vIHRvIHByZXZlbnQgaXNzdWVzIHdoZW4gc2F2aW5nIGhpZGRlbiBmaWxlcyBvciBwcmVzZXJ2aW5nIGFsdGVybmF0ZSBkYXRhXG5cdFx0XHRcdFx0Ly8gc3RyZWFtcy5cblx0XHRcdFx0XHQvLyBSZWxhdGVkIGlzc3Vlczpcblx0XHRcdFx0XHQvLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85MzFcblx0XHRcdFx0XHQvLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82MzYzXG5cdFx0XHRcdFx0ZmQgPSBhd2FpdCBQcm9taXNlcy5vcGVuKGZpbGVQYXRoLCAncisnKTtcblxuXHRcdFx0XHRcdC8vIFRoZSBmbGFnICdyKycgd2lsbCBub3QgdHJ1bmNhdGUgdGhlIGZpbGUsIHNvIHdlIGhhdmUgdG8gZG8gdGhpcyBtYW51YWxseVxuXHRcdFx0XHRcdGF3YWl0IFByb21pc2VzLmZ0cnVuY2F0ZShmZCwgMCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKGVycm9yLmNvZGUgIT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpOyAvLyBsb2cgZXJyb3JzIGJ1dCBkbyBub3QgZ2l2ZSB1cCB3cml0aW5nXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIGNsb3NlIHRoZSBmaWxlIGhhbmRsZSBpZiB3ZSBoYXZlIG9uZVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZmQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5jbG9zZShmZCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpOyAvLyBsb2cgZXJyb3JzIGJ1dCBkbyBub3QgZ2l2ZSB1cCB3cml0aW5nXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFJlc2V0IGBmZGAgdG8gYmUgYWJsZSB0byB0cnkgYWdhaW4gd2l0aCAndydcblx0XHRcdFx0XHRcdGZkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIGZkICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRmZCA9IGF3YWl0IFByb21pc2VzLm9wZW4oZmlsZVBhdGgsIGlzRmlsZU9wZW5Gb3JXcml0ZU9wdGlvbnMob3B0cykgP1xuXHRcdFx0XHRcdC8vIFdlIHRha2UgYG9wdHMuY3JlYXRlYCBhcyBhIGhpbnQgdGhhdCB0aGUgZmlsZSBpcyBvcGVuZWQgZm9yIHdyaXRpbmdcblx0XHRcdFx0XHQvLyBhcyBzdWNoIHdlIHVzZSAndycgdG8gdHJ1bmNhdGUgYW4gZXhpc3Rpbmcgb3IgY3JlYXRlIHRoZVxuXHRcdFx0XHRcdC8vIGZpbGUgb3RoZXJ3aXNlLiB3ZSBkbyBub3QgYWxsb3cgcmVhZGluZy5cblx0XHRcdFx0XHQvLyBJZiBgb3B0cy5hcHBlbmRgIGlzIHRydWUsIHVzZSAnYScgdG8gYXBwZW5kIHRvIHRoZSBmaWxlLlxuXHRcdFx0XHRcdChvcHRzLmFwcGVuZCA/ICdhJyA6ICd3JykgOlxuXHRcdFx0XHRcdC8vIE90aGVyd2lzZSB3ZSBhc3N1bWUgdGhlIGZpbGUgaXMgb3BlbmVkIGZvciByZWFkaW5nXG5cdFx0XHRcdFx0Ly8gYXMgc3VjaCB3ZSB1c2UgJ3InIHRvIG5laXRoZXIgdHJ1bmNhdGUsIG5vciBjcmVhdGVcblx0XHRcdFx0XHQvLyB0aGUgZmlsZS5cblx0XHRcdFx0XHQncidcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIFJlbGVhc2UgbG9jayBiZWNhdXNlIHdlIGhhdmUgbm8gdmFsaWQgaGFuZGxlXG5cdFx0XHQvLyBpZiB3ZSBkaWQgb3BlbiBhIGxvY2sgZHVyaW5nIHRoaXMgb3BlcmF0aW9uXG5cdFx0XHRsb2NrPy5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIFJldGhyb3cgYXMgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZXJyb3Jcblx0XHRcdGlmIChpc0ZpbGVPcGVuRm9yV3JpdGVPcHRpb25zKG9wdHMpKSB7XG5cdFx0XHRcdHRocm93IGF3YWl0IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJXcml0ZUVycm9yKHJlc291cmNlLCBlcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIHRoaXMgaGFuZGxlIHRvIHRyYWNrIGZpbGUgcG9zaXRpb24gb2YgdGhlIGhhbmRsZVxuXHRcdC8vIHdlIGluaXQgdGhlIHBvc2l0aW9uIHRvIDAgc2luY2UgdGhlIGZpbGUgZGVzY3JpcHRvciB3YXNcblx0XHQvLyBqdXN0IGNyZWF0ZWQgYW5kIHRoZSBwb3NpdGlvbiB3YXMgbm90IG1vdmVkIHNvIGZhciAoc2VlXG5cdFx0Ly8gYWxzbyBodHRwOi8vbWFuNy5vcmcvbGludXgvbWFuLXBhZ2VzL21hbjIvb3Blbi4yLmh0bWwgLVxuXHRcdC8vIFwiVGhlIGZpbGUgb2Zmc2V0IGlzIHNldCB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBmaWxlLlwiKVxuXHRcdHRoaXMubWFwSGFuZGxlVG9Qb3Muc2V0KGZkLCAwKTtcblxuXHRcdC8vIHJlbWVtYmVyIHRoYXQgdGhpcyBoYW5kbGUgd2FzIHVzZWQgZm9yIHdyaXRpbmdcblx0XHRpZiAoaXNGaWxlT3BlbkZvcldyaXRlT3B0aW9ucyhvcHRzKSkge1xuXHRcdFx0dGhpcy53cml0ZUhhbmRsZXMuc2V0KGZkLCByZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxvY2spIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzTG9jayA9IHRoaXMubWFwSGFuZGxlVG9Mb2NrLmdldChmZCk7XG5cblx0XHRcdC8vIFJlbWVtYmVyIHRoYXQgdGhpcyBoYW5kbGUgaGFzIGFuIGFzc29jaWF0ZWQgbG9ja1xuXHRcdFx0dGhpcy50cmFjZUxvY2soYFtEaXNrIEZpbGVTeXN0ZW1Qcm92aWRlcl06IG9wZW4oKSAtIHN0b3JpbmcgbG9jayBmb3IgaGFuZGxlICR7ZmR9ICgke2ZpbGVQYXRofSlgKTtcblx0XHRcdHRoaXMubWFwSGFuZGxlVG9Mb2NrLnNldChmZCwgbG9jayk7XG5cblx0XHRcdC8vIFRoZXJlIGlzIGEgc2xpZ2h0IGNoYW5jZSB0aGF0IGEgcmVzb3VyY2UgbG9jayBmb3IgYVxuXHRcdFx0Ly8gaGFuZGxlIHdhcyBub3QgeWV0IGRpc3Bvc2VkIHdoZW4gd2UgYWNxdWlyZSBhIG5ld1xuXHRcdFx0Ly8gbG9jaywgc28gd2UgbXVzdCBlbnN1cmUgdG8gZGlzcG9zZSB0aGUgcHJldmlvdXMgbG9ja1xuXHRcdFx0Ly8gYmVmb3JlIHN0b3JpbmcgYSBuZXcgb25lIGZvciB0aGUgc2FtZSBoYW5kbGUsIG90aGVyXG5cdFx0XHQvLyB3aXNlIHdlIGVuZCB1cCBpbiBhIGRlYWRsb2NrIHNpdHVhdGlvblxuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0MjQ2MlxuXHRcdFx0aWYgKHByZXZpb3VzTG9jaykge1xuXHRcdFx0XHR0aGlzLnRyYWNlTG9jayhgW0Rpc2sgRmlsZVN5c3RlbVByb3ZpZGVyXTogb3BlbigpIC0gZGlzcG9zaW5nIGEgcHJldmlvdXMgbG9jayB0aGF0IHdhcyBzdGlsbCBzdG9yZWQgb24gc2FtZSBoYW5kbGUgJHtmZH0gKCR7ZmlsZVBhdGh9KWApO1xuXHRcdFx0XHRwcmV2aW91c0xvY2suZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmZDtcblx0fVxuXG5cdGFzeW5jIGNsb3NlKGZkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEl0IGlzIHZlcnkgaW1wb3J0YW50IHRoYXQgd2Uga2VlcCBhbnkgYXNzb2NpYXRlZCBsb2NrXG5cdFx0Ly8gZm9yIHRoZSBmaWxlIGhhbmRsZSBiZWZvcmUgYXR0ZW1wdGluZyB0byBjYWxsIGBmcy5jbG9zZShmZClgXG5cdFx0Ly8gYmVjYXVzZSBvZiBhIHBvc3NpYmxlIHJhY2UgY29uZGl0aW9uOiBhcyBzb29uIGFzIGEgZmlsZVxuXHRcdC8vIGhhbmRsZSBpcyByZWxlYXNlZCwgdGhlIE9TIG1heSBhc3NpZ24gdGhlIHNhbWUgaGFuZGxlIHRvXG5cdFx0Ly8gdGhlIG5leHQgYGZzLm9wZW5gIGNhbGwgYW5kIGFzIHN1Y2ggaXQgaXMgcG9zc2libGUgdGhhdCBvdXJcblx0XHQvLyBsb2NrIGlzIGdldHRpbmcgb3ZlcndyaXR0ZW5cblx0XHRjb25zdCBsb2NrRm9ySGFuZGxlID0gdGhpcy5tYXBIYW5kbGVUb0xvY2suZ2V0KGZkKTtcblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIFJlbW92ZSB0aGlzIGhhbmRsZSBmcm9tIG1hcCBvZiBwb3NpdGlvbnNcblx0XHRcdHRoaXMubWFwSGFuZGxlVG9Qb3MuZGVsZXRlKGZkKTtcblxuXHRcdFx0Ly8gSWYgYSBoYW5kbGUgaXMgY2xvc2VkIHRoYXQgd2FzIHVzZWQgZm9yIHdyaXRpbmcsIGVuc3VyZVxuXHRcdFx0Ly8gdG8gZmx1c2ggdGhlIGNvbnRlbnRzIHRvIGRpc2sgaWYgcG9zc2libGUuXG5cdFx0XHRpZiAodGhpcy53cml0ZUhhbmRsZXMuZGVsZXRlKGZkKSAmJiBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmNhbkZsdXNoKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuZmRhdGFzeW5jKGZkKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk1ODlcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBJbiBzb21lIGV4b3RpYyBzZXR1cHMgaXQgaXMgd2VsbCBwb3NzaWJsZSB0aGF0IG5vZGUgZmFpbHMgdG8gc3luY1xuXHRcdFx0XHRcdC8vIEluIHRoYXQgY2FzZSB3ZSBkaXNhYmxlIGZsdXNoaW5nIGFuZCBsb2cgdGhlIGVycm9yIHRvIG91ciBsb2dnZXJcblx0XHRcdFx0XHREaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYXdhaXQgUHJvbWlzZXMuY2xvc2UoZmQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAobG9ja0ZvckhhbmRsZSkge1xuXHRcdFx0XHRpZiAodGhpcy5tYXBIYW5kbGVUb0xvY2suZ2V0KGZkKSA9PT0gbG9ja0ZvckhhbmRsZSkge1xuXHRcdFx0XHRcdHRoaXMudHJhY2VMb2NrKGBbRGlzayBGaWxlU3lzdGVtUHJvdmlkZXJdOiBjbG9zZSgpIC0gcmVzb3VyY2UgbG9jayByZW1vdmVkIGZyb20gaGFuZGxlLWxvY2sgbWFwICR7ZmR9YCk7XG5cdFx0XHRcdFx0dGhpcy5tYXBIYW5kbGVUb0xvY2suZGVsZXRlKGZkKTsgLy8gb25seSBkZWxldGUgZnJvbSBtYXAgaWYgdGhpcyBpcyBzdGlsbCBvdXIgbG9jayFcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudHJhY2VMb2NrKGBbRGlzayBGaWxlU3lzdGVtUHJvdmlkZXJdOiBjbG9zZSgpIC0gZGlzcG9zaW5nIGxvY2sgZm9yIGhhbmRsZSAke2ZkfWApO1xuXHRcdFx0XHRsb2NrRm9ySGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRQb3MgPSB0aGlzLm5vcm1hbGl6ZVBvcyhmZCwgcG9zKTtcblxuXHRcdGxldCBieXRlc1JlYWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRieXRlc1JlYWQgPSAoYXdhaXQgUHJvbWlzZXMucmVhZChmZCwgZGF0YSwgb2Zmc2V0LCBsZW5ndGgsIG5vcm1hbGl6ZWRQb3MpKS5ieXRlc1JlYWQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudXBkYXRlUG9zKGZkLCBub3JtYWxpemVkUG9zLCBieXRlc1JlYWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBieXRlc1JlYWQ7XG5cdH1cblxuXHRwcml2YXRlIG5vcm1hbGl6ZVBvcyhmZDogbnVtYmVyLCBwb3M6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuXG5cdFx0Ly8gV2hlbiBjYWxsaW5nIGZzLnJlYWQvd3JpdGUgd2UgdHJ5IHRvIGF2b2lkIHBhc3NpbmcgaW4gdGhlIFwicG9zXCIgYXJndW1lbnQgYW5kXG5cdFx0Ly8gcmF0aGVyIHByZWZlciB0byBwYXNzIGluIFwibnVsbFwiIGJlY2F1c2UgdGhpcyBhdm9pZHMgYW4gZXh0cmEgc2Vlayhwb3MpXG5cdFx0Ly8gY2FsbCB0aGF0IGluIHNvbWUgY2FzZXMgY2FuIGV2ZW4gZmFpbCAoZS5nLiB3aGVuIG9wZW5pbmcgYSBmaWxlIG92ZXIgRlRQIC1cblx0XHQvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzczODg0KS5cblx0XHQvL1xuXHRcdC8vIGFzIHN1Y2gsIHdlIGNvbXBhcmUgdGhlIHBhc3NlZCBpbiBwb3NpdGlvbiBhcmd1bWVudCB3aXRoIG91ciBsYXN0IGtub3duXG5cdFx0Ly8gcG9zaXRpb24gZm9yIHRoZSBmaWxlIGRlc2NyaXB0b3IgYW5kIHVzZSBcIm51bGxcIiBpZiB0aGV5IG1hdGNoLlxuXHRcdGlmIChwb3MgPT09IHRoaXMubWFwSGFuZGxlVG9Qb3MuZ2V0KGZkKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBvcztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUG9zKGZkOiBudW1iZXIsIHBvczogbnVtYmVyIHwgbnVsbCwgYnl0ZXNMZW5ndGg6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0S25vd25Qb3MgPSB0aGlzLm1hcEhhbmRsZVRvUG9zLmdldChmZCk7XG5cdFx0aWYgKHR5cGVvZiBsYXN0S25vd25Qb3MgPT09ICdudW1iZXInKSB7XG5cblx0XHRcdC8vIHBvcyAhPT0gbnVsbCBzaWduYWxzIHRoYXQgcHJldmlvdXNseSBhIHBvc2l0aW9uIHdhcyB1c2VkIHRoYXQgaXNcblx0XHRcdC8vIG5vdCBudWxsLiBub2RlLmpzIGRvY3VtZW50YXRpb24gZXhwbGFpbnMsIHRoYXQgaW4gdGhpcyBjYXNlXG5cdFx0XHQvLyB0aGUgaW50ZXJuYWwgZmlsZSBwb2ludGVyIGlzIG5vdCBtb3ZpbmcgYW5kIGFzIHN1Y2ggd2UgZG8gbm90IG1vdmVcblx0XHRcdC8vIG91ciBwb3NpdGlvbiBwb2ludGVyLlxuXHRcdFx0Ly9cblx0XHRcdC8vIERvY3M6IFwiSWYgcG9zaXRpb24gaXMgbnVsbCwgZGF0YSB3aWxsIGJlIHJlYWQgZnJvbSB0aGUgY3VycmVudCBmaWxlIHBvc2l0aW9uLFxuXHRcdFx0Ly8gYW5kIHRoZSBmaWxlIHBvc2l0aW9uIHdpbGwgYmUgdXBkYXRlZC4gSWYgcG9zaXRpb24gaXMgYW4gaW50ZWdlciwgdGhlIGZpbGUgcG9zaXRpb25cblx0XHRcdC8vIHdpbGwgcmVtYWluIHVuY2hhbmdlZC5cIlxuXHRcdFx0aWYgKHR5cGVvZiBwb3MgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdC8vIGRvIG5vdCBtb2RpZnkgdGhlIHBvc2l0aW9uXG5cdFx0XHR9XG5cblx0XHRcdC8vIGJ5dGVzTGVuZ3RoID0gbnVtYmVyIGlzIGEgc2lnbmFsIHRoYXQgdGhlIHJlYWQvd3JpdGUgb3BlcmF0aW9uIHdhc1xuXHRcdFx0Ly8gc3VjY2Vzc2Z1bCBhbmQgYXMgc3VjaCB3ZSBuZWVkIHRvIGFkdmFuY2UgdGhlIHBvc2l0aW9uIGluIHRoZSBNYXBcblx0XHRcdC8vXG5cdFx0XHQvLyBEb2NzIChodHRwOi8vbWFuNy5vcmcvbGludXgvbWFuLXBhZ2VzL21hbjIvcmVhZC4yLmh0bWwpOlxuXHRcdFx0Ly8gXCJPbiBmaWxlcyB0aGF0IHN1cHBvcnQgc2Vla2luZywgdGhlIHJlYWQgb3BlcmF0aW9uIGNvbW1lbmNlcyBhdCB0aGVcblx0XHRcdC8vIGZpbGUgb2Zmc2V0LCBhbmQgdGhlIGZpbGUgb2Zmc2V0IGlzIGluY3JlbWVudGVkIGJ5IHRoZSBudW1iZXIgb2Zcblx0XHRcdC8vIGJ5dGVzIHJlYWQuXCJcblx0XHRcdC8vXG5cdFx0XHQvLyBEb2NzIChodHRwOi8vbWFuNy5vcmcvbGludXgvbWFuLXBhZ2VzL21hbjIvd3JpdGUuMi5odG1sKTpcblx0XHRcdC8vIFwiRm9yIGEgc2Vla2FibGUgZmlsZSAoaS5lLiwgb25lIHRvIHdoaWNoIGxzZWVrKDIpIG1heSBiZSBhcHBsaWVkLCBmb3Jcblx0XHRcdC8vIGV4YW1wbGUsIGEgcmVndWxhciBmaWxlKSB3cml0aW5nIHRha2VzIHBsYWNlIGF0IHRoZSBmaWxlIG9mZnNldCwgYW5kXG5cdFx0XHQvLyB0aGUgZmlsZSBvZmZzZXQgaXMgaW5jcmVtZW50ZWQgYnkgdGhlIG51bWJlciBvZiBieXRlcyBhY3R1YWxseVxuXHRcdFx0Ly8gd3JpdHRlbi5cIlxuXHRcdFx0ZWxzZSBpZiAodHlwZW9mIGJ5dGVzTGVuZ3RoID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR0aGlzLm1hcEhhbmRsZVRvUG9zLnNldChmZCwgbGFzdEtub3duUG9zICsgYnl0ZXNMZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBieXRlc0xlbmd0aCA9IG51bGwgc2lnbmFscyBhbiBlcnJvciBpbiB0aGUgcmVhZC93cml0ZSBvcGVyYXRpb25cblx0XHRcdC8vIGFuZCBhcyBzdWNoIHdlIGRyb3AgdGhlIGhhbmRsZSBmcm9tIHRoZSBNYXAgYmVjYXVzZSB0aGUgcG9zaXRpb25cblx0XHRcdC8vIGlzIHVuc3BlY2lmaWNlZCBhdCB0aGlzIHBvaW50LlxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMubWFwSGFuZGxlVG9Qb3MuZGVsZXRlKGZkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyB3cml0ZShmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblxuXHRcdC8vIFdlIGtub3cgYXQgdGhpcyBwb2ludCB0aGF0IHRoZSBmaWxlIHRvIHdyaXRlIHRvIGlzIHRydW5jYXRlZCBhbmQgdGh1cyBlbXB0eVxuXHRcdC8vIGlmIHRoZSB3cml0ZSBub3cgZmFpbHMsIHRoZSBmaWxlIHJlbWFpbnMgZW1wdHkuIGFzIHN1Y2ggd2UgcmVhbGx5IHRyeSBoYXJkXG5cdFx0Ly8gdG8gZW5zdXJlIHRoZSB3cml0ZSBzdWNjZWVkcyBieSByZXRyeWluZyB1cCB0byB0aHJlZSB0aW1lcy5cblx0XHRyZXR1cm4gcmV0cnkoKCkgPT4gdGhpcy5kb1dyaXRlKGZkLCBwb3MsIGRhdGEsIG9mZnNldCwgbGVuZ3RoKSwgMTAwIC8qIG1zIGRlbGF5ICovLCAzIC8qIHJldHJpZXMgKi8pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRQb3MgPSB0aGlzLm5vcm1hbGl6ZVBvcyhmZCwgcG9zKTtcblxuXHRcdGxldCBieXRlc1dyaXR0ZW46IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRieXRlc1dyaXR0ZW4gPSAoYXdhaXQgUHJvbWlzZXMud3JpdGUoZmQsIGRhdGEsIG9mZnNldCwgbGVuZ3RoLCBub3JtYWxpemVkUG9zKSkuYnl0ZXNXcml0dGVuO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBhd2FpdCB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyV3JpdGVFcnJvcih0aGlzLndyaXRlSGFuZGxlcy5nZXQoZmQpLCBlcnJvcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudXBkYXRlUG9zKGZkLCBub3JtYWxpemVkUG9zLCBieXRlc1dyaXR0ZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBieXRlc1dyaXR0ZW47XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTW92ZS9Db3B5L0RlbGV0ZS9DcmVhdGUgRm9sZGVyXG5cblx0YXN5bmMgbWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcih0aGlzLnRvRmlsZVBhdGgocmVzb3VyY2UpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHJlc291cmNlKTtcblx0XHRcdGlmIChvcHRzLnJlY3Vyc2l2ZSkge1xuXHRcdFx0XHRsZXQgcm1Nb3ZlVG9QYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChvcHRzPy5hdG9taWMgIT09IGZhbHNlICYmIG9wdHMuYXRvbWljLnBvc3RmaXgpIHtcblx0XHRcdFx0XHRybU1vdmVUb1BhdGggPSBqb2luKGRpcm5hbWUoZmlsZVBhdGgpLCBgJHtiYXNlbmFtZShmaWxlUGF0aCl9JHtvcHRzLmF0b21pYy5wb3N0Zml4fWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMucm0oZmlsZVBhdGgsIFJpbVJhZk1vZGUuTU9WRSwgcm1Nb3ZlVG9QYXRoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKGZpbGVQYXRoKTtcblx0XHRcdFx0fSBjYXRjaCAodW5saW5rRXJyb3IpIHtcblxuXHRcdFx0XHRcdC8vIGBmcy51bmxpbmtgIHdpbGwgdGhyb3cgd2hlbiB1c2VkIG9uIGRpcmVjdG9yaWVzXG5cdFx0XHRcdFx0Ly8gd2UgdHJ5IHRvIGRldGVjdCB0aGlzIGVycm9yIGFuZCB0aGVuIHNlZSBpZiB0aGVcblx0XHRcdFx0XHQvLyBwcm92aWRlZCByZXNvdXJjZSBpcyBhY3R1YWxseSBhIGRpcmVjdG9yeS4gaW4gdGhhdFxuXHRcdFx0XHRcdC8vIGNhc2Ugd2UgdXNlIGBmcy5ybWRpcmAgdG8gZGVsZXRlIHRoZSBkaXJlY3RvcnkuXG5cblx0XHRcdFx0XHRpZiAodW5saW5rRXJyb3IuY29kZSA9PT0gJ0VQRVJNJyB8fCB1bmxpbmtFcnJvci5jb2RlID09PSAnRUlTRElSJykge1xuXHRcdFx0XHRcdFx0bGV0IGlzRGlyZWN0b3J5ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IHN0YXQsIHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChmaWxlUGF0aCk7XG5cdFx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5ID0gc3RhdC5pc0RpcmVjdG9yeSgpICYmICFzeW1ib2xpY0xpbms7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChzdGF0RXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChpc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBwcm9taXNlcy5ybWRpcihmaWxlUGF0aCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyB1bmxpbmtFcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhyb3cgdW5saW5rRXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZnJvbUZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKGZyb20pO1xuXHRcdGNvbnN0IHRvRmlsZVBhdGggPSB0aGlzLnRvRmlsZVBhdGgodG8pO1xuXG5cdFx0aWYgKGZyb21GaWxlUGF0aCA9PT0gdG9GaWxlUGF0aCkge1xuXHRcdFx0cmV0dXJuOyAvLyBzaW11bGF0ZSBub2RlLmpzIGJlaGF2aW91ciBoZXJlIGFuZCBkbyBhIG5vLW9wIGlmIHBhdGhzIG1hdGNoXG5cdFx0fVxuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gVmFsaWRhdGUgdGhlIG1vdmUgb3BlcmF0aW9uIGNhbiBwZXJmb3JtXG5cdFx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlTW92ZUNvcHkoZnJvbSwgdG8sICdtb3ZlJywgb3B0cy5vdmVyd3JpdGUpO1xuXG5cdFx0XHQvLyBSZW5hbWVcblx0XHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShmcm9tRmlsZVBhdGgsIHRvRmlsZVBhdGgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIFJld3JpdGUgc29tZSB0eXBpY2FsIGVycm9ycyB0aGF0IGNhbiBoYXBwZW4gZXNwZWNpYWxseSBhcm91bmQgc3ltbGlua3Ncblx0XHRcdC8vIHRvIHNvbWV0aGluZyB0aGUgdXNlciBjYW4gYmV0dGVyIHVuZGVyc3RhbmRcblx0XHRcdGlmIChlcnJvci5jb2RlID09PSAnRUlOVkFMJyB8fCBlcnJvci5jb2RlID09PSAnRUJVU1knIHx8IGVycm9yLmNvZGUgPT09ICdFTkFNRVRPT0xPTkcnKSB7XG5cdFx0XHRcdGVycm9yID0gbmV3IEVycm9yKGxvY2FsaXplKCdtb3ZlRXJyb3InLCBcIlVuYWJsZSB0byBtb3ZlICd7MH0nIGludG8gJ3sxfScgKHsyfSkuXCIsIGJhc2VuYW1lKGZyb21GaWxlUGF0aCksIGJhc2VuYW1lKGRpcm5hbWUodG9GaWxlUGF0aCkpLCBlcnJvci50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY29weShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZyb21GaWxlUGF0aCA9IHRoaXMudG9GaWxlUGF0aChmcm9tKTtcblx0XHRjb25zdCB0b0ZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHRvKTtcblxuXHRcdGlmIChmcm9tRmlsZVBhdGggPT09IHRvRmlsZVBhdGgpIHtcblx0XHRcdHJldHVybjsgLy8gc2ltdWxhdGUgbm9kZS5qcyBiZWhhdmlvdXIgaGVyZSBhbmQgZG8gYSBuby1vcCBpZiBwYXRocyBtYXRjaFxuXHRcdH1cblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIFZhbGlkYXRlIHRoZSBjb3B5IG9wZXJhdGlvbiBjYW4gcGVyZm9ybVxuXHRcdFx0YXdhaXQgdGhpcy52YWxpZGF0ZU1vdmVDb3B5KGZyb20sIHRvLCAnY29weScsIG9wdHMub3ZlcndyaXRlKTtcblxuXHRcdFx0Ly8gQ29weVxuXHRcdFx0YXdhaXQgUHJvbWlzZXMuY29weShmcm9tRmlsZVBhdGgsIHRvRmlsZVBhdGgsIHsgcHJlc2VydmVTeW1saW5rczogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBSZXdyaXRlIHNvbWUgdHlwaWNhbCBlcnJvcnMgdGhhdCBjYW4gaGFwcGVuIGVzcGVjaWFsbHkgYXJvdW5kIHN5bWxpbmtzXG5cdFx0XHQvLyB0byBzb21ldGhpbmcgdGhlIHVzZXIgY2FuIGJldHRlciB1bmRlcnN0YW5kXG5cdFx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VJTlZBTCcgfHwgZXJyb3IuY29kZSA9PT0gJ0VCVVNZJyB8fCBlcnJvci5jb2RlID09PSAnRU5BTUVUT09MT05HJykge1xuXHRcdFx0XHRlcnJvciA9IG5ldyBFcnJvcihsb2NhbGl6ZSgnY29weUVycm9yJywgXCJVbmFibGUgdG8gY29weSAnezB9JyBpbnRvICd7MX0nICh7Mn0pLlwiLCBiYXNlbmFtZShmcm9tRmlsZVBhdGgpLCBiYXNlbmFtZShkaXJuYW1lKHRvRmlsZVBhdGgpKSwgZXJyb3IudG9TdHJpbmcoKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVNb3ZlQ29weShmcm9tOiBVUkksIHRvOiBVUkksIG1vZGU6ICdtb3ZlJyB8ICdjb3B5Jywgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZyb21GaWxlUGF0aCA9IHRoaXMudG9GaWxlUGF0aChmcm9tKTtcblx0XHRjb25zdCB0b0ZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKHRvKTtcblxuXHRcdGxldCBpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGlzUGF0aENhc2VTZW5zaXRpdmUgPSAhISh0aGlzLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0aWYgKCFpc1BhdGhDYXNlU2Vuc2l0aXZlKSB7XG5cdFx0XHRpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSA9IGlzRXF1YWwoZnJvbUZpbGVQYXRoLCB0b0ZpbGVQYXRoLCB0cnVlIC8qIGlnbm9yZSBjYXNlICovKTtcblx0XHR9XG5cblx0XHRpZiAoaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UpIHtcblxuXHRcdFx0Ly8gWW91IGNhbm5vdCBjb3B5IHRoZSBzYW1lIGZpbGUgdG8gdGhlIHNhbWUgbG9jYXRpb24gd2l0aCBkaWZmZXJlbnRcblx0XHRcdC8vIHBhdGggY2FzZSB1bmxlc3MgeW91IGFyZSBvbiBhIGNhc2Ugc2Vuc2l0aXZlIGZpbGUgc3lzdGVtXG5cdFx0XHRpZiAobW9kZSA9PT0gJ2NvcHknKSB7XG5cdFx0XHRcdHRocm93IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdmaWxlQ29weUVycm9yUGF0aENhc2UnLCBcIkZpbGUgY2Fubm90IGJlIGNvcGllZCB0byBzYW1lIHBhdGggd2l0aCBkaWZmZXJlbnQgcGF0aCBjYXNlXCIpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFlvdSBjYW4gbW92ZSB0aGUgc2FtZSBmaWxlIHRvIHRoZSBzYW1lIGxvY2F0aW9uIHdpdGggZGlmZmVyZW50XG5cdFx0XHQvLyBwYXRoIGNhc2Ugb24gY2FzZSBpbnNlbnNpdGl2ZSBmaWxlIHN5c3RlbXNcblx0XHRcdGVsc2UgaWYgKG1vZGUgPT09ICdtb3ZlJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGVyZSB3ZSBoYXZlIHRvIHNlZSBpZiB0aGUgdGFyZ2V0IHRvIG1vdmUvY29weSB0byBleGlzdHMgb3Igbm90LlxuXHRcdC8vIFdlIG5lZWQgdG8gcmVzcGVjdCB0aGUgYG92ZXJ3cml0ZWAgb3B0aW9uIHRvIHRocm93IGluIGNhc2UgdGhlXG5cdFx0Ly8gdGFyZ2V0IGV4aXN0cy5cblxuXHRcdGNvbnN0IGZyb21TdGF0ID0gYXdhaXQgdGhpcy5zdGF0SWdub3JlRXJyb3IoZnJvbSk7XG5cdFx0aWYgKCFmcm9tU3RhdCkge1xuXHRcdFx0dGhyb3cgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobG9jYWxpemUoJ2ZpbGVNb3ZlQ29weUVycm9yTm90Rm91bmQnLCBcIkZpbGUgdG8gbW92ZS9jb3B5IGRvZXMgbm90IGV4aXN0XCIpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b1N0YXQgPSBhd2FpdCB0aGlzLnN0YXRJZ25vcmVFcnJvcih0byk7XG5cdFx0aWYgKCF0b1N0YXQpIHtcblx0XHRcdHJldHVybjsgLy8gdGFyZ2V0IGRvZXMgbm90IGV4aXN0IHNvIHdlIGFyZSBnb29kXG5cdFx0fVxuXG5cdFx0aWYgKCFvdmVyd3JpdGUpIHtcblx0XHRcdHRocm93IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdmaWxlTW92ZUNvcHlFcnJvckV4aXN0cycsIFwiRmlsZSBhdCB0YXJnZXQgYWxyZWFkeSBleGlzdHMgYW5kIHRodXMgd2lsbCBub3QgYmUgbW92ZWQvY29waWVkIHRvIHVubGVzcyBvdmVyd3JpdGUgaXMgc3BlY2lmaWVkXCIpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cyk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGV4aXN0aW5nIHRhcmdldCBmb3IgbW92ZS9jb3B5XG5cdFx0aWYgKChmcm9tU3RhdC50eXBlICYgRmlsZVR5cGUuRmlsZSkgIT09IDAgJiYgKHRvU3RhdC50eXBlICYgRmlsZVR5cGUuRmlsZSkgIT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gbm9kZS5qcyBjYW4gbW92ZS9jb3B5IGEgZmlsZSBvdmVyIGFuIGV4aXN0aW5nIGZpbGUgd2l0aG91dCBoYXZpbmcgdG8gZGVsZXRlIGl0IGZpcnN0XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlKHRvLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBDbG9uZSBGaWxlXG5cblx0YXN5bmMgY2xvbmVGaWxlKGZyb206IFVSSSwgdG86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ2xvbmVGaWxlKGZyb20sIHRvLCBmYWxzZSAvKiBvcHRpbWlzdGljYWxseSBhc3N1bWUgcGFyZW50IGZvbGRlcnMgZXhpc3QgKi8pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0Nsb25lRmlsZShmcm9tOiBVUkksIHRvOiBVUkksIG1rZGlyOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZnJvbUZpbGVQYXRoID0gdGhpcy50b0ZpbGVQYXRoKGZyb20pO1xuXHRcdGNvbnN0IHRvRmlsZVBhdGggPSB0aGlzLnRvRmlsZVBhdGgodG8pO1xuXG5cdFx0Y29uc3QgaXNQYXRoQ2FzZVNlbnNpdGl2ZSA9ICEhKHRoaXMuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRpZiAoaXNFcXVhbChmcm9tRmlsZVBhdGgsIHRvRmlsZVBhdGgsICFpc1BhdGhDYXNlU2Vuc2l0aXZlKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBjbG9uaW5nIGlzIG9ubHkgc3VwcG9ydGVkIGBmcm9tYCBhbmQgYHRvYCBhcmUgZGlmZmVyZW50IGZpbGVzXG5cdFx0fVxuXG5cdFx0Ly8gSW1wbGVtZW50IGNsb25lIGJ5IHVzaW5nIGBmcy5jb3B5RmlsZWAsIGhvd2V2ZXIgc2V0dXAgbG9ja3Ncblx0XHQvLyBmb3IgYm90aCBgZnJvbWAgYW5kIGB0b2AgYmVjYXVzZSBub2RlLmpzIGRvZXMgbm90IGVuc3VyZVxuXHRcdC8vIHRoaXMgdG8gYmUgYW4gYXRvbWljIG9wZXJhdGlvblxuXG5cdFx0Y29uc3QgbG9ja3MgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0bG9ja3MuYWRkKGF3YWl0IHRoaXMuY3JlYXRlUmVzb3VyY2VMb2NrKGZyb20pKTtcblx0XHRcdGxvY2tzLmFkZChhd2FpdCB0aGlzLmNyZWF0ZVJlc291cmNlTG9jayh0bykpO1xuXG5cdFx0XHRpZiAobWtkaXIpIHtcblx0XHRcdFx0YXdhaXQgcHJvbWlzZXMubWtkaXIoZGlybmFtZSh0b0ZpbGVQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHByb21pc2VzLmNvcHlGaWxlKGZyb21GaWxlUGF0aCwgdG9GaWxlUGF0aCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvci5jb2RlID09PSAnRU5PRU5UJyAmJiAhbWtkaXIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9DbG9uZUZpbGUoZnJvbSwgdG8sIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsb2Nrcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgV2F0Y2hpbmdcblxuXHRwcm90ZWN0ZWQgY3JlYXRlVW5pdmVyc2FsV2F0Y2hlcihcblx0XHRvbkNoYW5nZTogKGNoYW5nZXM6IElGaWxlQ2hhbmdlW10pID0+IHZvaWQsXG5cdFx0b25Mb2dNZXNzYWdlOiAobXNnOiBJTG9nTWVzc2FnZSkgPT4gdm9pZCxcblx0XHR2ZXJib3NlTG9nZ2luZzogYm9vbGVhblxuXHQpOiBBYnN0cmFjdFVuaXZlcnNhbFdhdGNoZXJDbGllbnQge1xuXHRcdHJldHVybiBuZXcgVW5pdmVyc2FsV2F0Y2hlckNsaWVudChjaGFuZ2VzID0+IG9uQ2hhbmdlKGNoYW5nZXMpLCBtc2cgPT4gb25Mb2dNZXNzYWdlKG1zZyksIHZlcmJvc2VMb2dnaW5nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVOb25SZWN1cnNpdmVXYXRjaGVyKFxuXHRcdG9uQ2hhbmdlOiAoY2hhbmdlczogSUZpbGVDaGFuZ2VbXSkgPT4gdm9pZCxcblx0XHRvbkxvZ01lc3NhZ2U6IChtc2c6IElMb2dNZXNzYWdlKSA9PiB2b2lkLFxuXHRcdHZlcmJvc2VMb2dnaW5nOiBib29sZWFuXG5cdCk6IEFic3RyYWN0Tm9uUmVjdXJzaXZlV2F0Y2hlckNsaWVudCB7XG5cdFx0cmV0dXJuIG5ldyBOb2RlSlNXYXRjaGVyQ2xpZW50KGNoYW5nZXMgPT4gb25DaGFuZ2UoY2hhbmdlcyksIG1zZyA9PiBvbkxvZ01lc3NhZ2UobXNnKSwgdmVyYm9zZUxvZ2dpbmcpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEhlbHBlcnNcblxuXHRwcml2YXRlIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3I6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbik6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIHtcblx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yOyAvLyBhdm9pZCBkb3VibGUgY29udmVyc2lvblxuXHRcdH1cblxuXHRcdGxldCByZXN1bHRFcnJvcjogRXJyb3IgfCBzdHJpbmcgPSBlcnJvcjtcblx0XHRsZXQgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlO1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSAnRU5PRU5UJzpcblx0XHRcdFx0Y29kZSA9IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRUlTRElSJzpcblx0XHRcdFx0Y29kZSA9IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0VOT1RESVInOlxuXHRcdFx0XHRjb2RlID0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0VFWElTVCc6XG5cdFx0XHRcdGNvZGUgPSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdFUEVSTSc6XG5cdFx0XHRjYXNlICdFQUNDRVMnOlxuXHRcdFx0XHRjb2RlID0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRVJSX1VOQ19IT1NUX05PVF9BTExPV0VEJzpcblx0XHRcdFx0cmVzdWx0RXJyb3IgPSBgJHtlcnJvci5tZXNzYWdlfS4gUGxlYXNlIHVwZGF0ZSB0aGUgJ3NlY3VyaXR5LmFsbG93ZWRVTkNIb3N0cycgc2V0dGluZyBpZiB5b3Ugd2FudCB0byBhbGxvdyB0aGlzIGhvc3QuYDtcblx0XHRcdFx0Y29kZSA9IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGNvZGUgPSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bjtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzdWx0RXJyb3IsIGNvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b0ZpbGVTeXN0ZW1Qcm92aWRlcldyaXRlRXJyb3IocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgZXJyb3I6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbik6IFByb21pc2U8RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3I+IHtcblx0XHRsZXQgZmlsZVN5c3RlbVByb3ZpZGVyV3JpdGVFcnJvciA9IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cblx0XHQvLyBJZiB0aGUgd3JpdGUgZXJyb3Igc2lnbmFscyBwZXJtaXNzaW9uIGlzc3Vlcywgd2UgdHJ5XG5cdFx0Ly8gdG8gcmVhZCB0aGUgZmlsZSdzIG1vZGUgdG8gc2VlIGlmIHRoZSBmaWxlIGlzIHdyaXRlXG5cdFx0Ly8gbG9ja2VkLlxuXHRcdGlmIChyZXNvdXJjZSAmJiBmaWxlU3lzdGVtUHJvdmlkZXJXcml0ZUVycm9yLmNvZGUgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB7IHN0YXQgfSA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQodGhpcy50b0ZpbGVQYXRoKHJlc291cmNlKSk7XG5cdFx0XHRcdGlmICghKHN0YXQubW9kZSAmIDBvMjAwIC8qIEZpbGUgbW9kZSBpbmRpY2F0aW5nIHdyaXRhYmxlIGJ5IG93bmVyICovKSkge1xuXHRcdFx0XHRcdGZpbGVTeXN0ZW1Qcm92aWRlcldyaXRlRXJyb3IgPSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVXcml0ZUxvY2tlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShlcnJvcik7IC8vIGlnbm9yZSAtIHJldHVybiBvcmlnaW5hbCBlcnJvclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWxlU3lzdGVtUHJvdmlkZXJXcml0ZUVycm9yO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFnQixXQUFXLGdCQUFnQjtBQUMzQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyw0QkFBNEIsVUFBVSxZQUFZLG1CQUFtQixX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
