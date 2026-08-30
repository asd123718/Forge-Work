import { localize } from "../../../nls.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, extname, normalize } from "../../../base/common/path.js";
import { isLinux } from "../../../base/common/platform.js";
import { extUri, extUriIgnorePathCase, joinPath } from "../../../base/common/resources.js";
import { newWriteableStream } from "../../../base/common/stream.js";
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, FileChangeType } from "../common/files.js";
import { WebFileSystemAccess, WebFileSystemObserver } from "./webFileSystemAccess.js";
import { LogLevel } from "../../log/common/log.js";
class HTMLFileSystemProvider extends Disposable {
  //#endregion
  constructor(indexedDB, store, logService) {
    super();
    this.indexedDB = indexedDB;
    this.store = store;
    this.logService = logService;
    //#region Events (unsupported)
    this.onDidChangeCapabilities = Event.None;
    //#endregion
    //#region File Capabilities
    this.extUri = isLinux ? extUri : extUriIgnorePathCase;
    //#endregion
    //#region File Watching (unsupported)
    this._onDidChangeFileEmitter = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFileEmitter.event;
    //#endregion
    //#region File/Directoy Handle Registry
    this._files = /* @__PURE__ */ new Map();
    this._directories = /* @__PURE__ */ new Map();
  }
  get capabilities() {
    if (!this._capabilities) {
      this._capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileReadStream;
      if (isLinux) {
        this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
      }
    }
    return this._capabilities;
  }
  //#region File Metadata Resolving
  async stat(resource) {
    try {
      const handle = await this.getHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, stat", FileSystemProviderErrorCode.FileNotFound);
      }
      if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
        const file = await handle.getFile();
        return {
          type: FileType.File,
          mtime: file.lastModified,
          ctime: 0,
          size: file.size
        };
      }
      return {
        type: FileType.Directory,
        mtime: 0,
        ctime: 0,
        size: 0
      };
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async readdir(resource) {
    try {
      const handle = await this.getDirectoryHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, readdir", FileSystemProviderErrorCode.FileNotFound);
      }
      const result = [];
      for await (const [name, child] of handle) {
        result.push([name, WebFileSystemAccess.isFileSystemFileHandle(child) ? FileType.File : FileType.Directory]);
      }
      return result;
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  //#endregion
  //#region File Reading/Writing
  readFileStream(resource, opts, token) {
    const stream = newWriteableStream((data) => VSBuffer.concat(data.map((data2) => VSBuffer.wrap(data2))).buffer, {
      // Set a highWaterMark to prevent the stream
      // for file upload to produce large buffers
      // in-memory
      highWaterMark: 10
    });
    (async () => {
      try {
        const handle = await this.getFileHandle(resource);
        if (!handle) {
          throw this.createFileSystemProviderError(resource, "No such file or directory, readFile", FileSystemProviderErrorCode.FileNotFound);
        }
        const file = await handle.getFile();
        if (typeof opts.length === "number" || typeof opts.position === "number") {
          let buffer = new Uint8Array(await file.arrayBuffer());
          if (typeof opts?.position === "number") {
            buffer = buffer.slice(opts.position);
          }
          if (typeof opts?.length === "number") {
            buffer = buffer.slice(0, opts.length);
          }
          stream.end(buffer);
        } else {
          const reader = file.stream().getReader();
          let res = await reader.read();
          while (!res.done) {
            if (token.isCancellationRequested) {
              break;
            }
            await stream.write(res.value);
            if (token.isCancellationRequested) {
              break;
            }
            res = await reader.read();
          }
          stream.end(void 0);
        }
      } catch (error) {
        stream.error(this.toFileSystemProviderError(error));
        stream.end();
      }
    })();
    return stream;
  }
  async readFile(resource) {
    try {
      const handle = await this.getFileHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, readFile", FileSystemProviderErrorCode.FileNotFound);
      }
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async writeFile(resource, content, opts) {
    try {
      let handle = await this.getFileHandle(resource);
      if (!opts.create || !opts.overwrite) {
        if (handle) {
          if (!opts.overwrite) {
            throw this.createFileSystemProviderError(resource, "File already exists, writeFile", FileSystemProviderErrorCode.FileExists);
          }
        } else {
          if (!opts.create) {
            throw this.createFileSystemProviderError(resource, "No such file, writeFile", FileSystemProviderErrorCode.FileNotFound);
          }
        }
      }
      if (!handle) {
        const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
        if (!parent) {
          throw this.createFileSystemProviderError(resource, "No such parent directory, writeFile", FileSystemProviderErrorCode.FileNotFound);
        }
        handle = await parent.getFileHandle(this.extUri.basename(resource), { create: true });
        if (!handle) {
          throw this.createFileSystemProviderError(resource, "Unable to create file , writeFile", FileSystemProviderErrorCode.Unknown);
        }
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  //#endregion
  //#region Move/Copy/Delete/Create Folder
  async mkdir(resource) {
    try {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (!parent) {
        throw this.createFileSystemProviderError(resource, "No such parent directory, mkdir", FileSystemProviderErrorCode.FileNotFound);
      }
      await parent.getDirectoryHandle(this.extUri.basename(resource), { create: true });
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async delete(resource, opts) {
    try {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (!parent) {
        throw this.createFileSystemProviderError(resource, "No such parent directory, delete", FileSystemProviderErrorCode.FileNotFound);
      }
      return parent.removeEntry(this.extUri.basename(resource), { recursive: opts.recursive });
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async rename(from, to, opts) {
    try {
      if (this.extUri.isEqual(from, to)) {
        return;
      }
      const fileHandle = await this.getFileHandle(from);
      if (fileHandle) {
        const file = await fileHandle.getFile();
        const contents = new Uint8Array(await file.arrayBuffer());
        await this.writeFile(to, contents, { create: true, overwrite: opts.overwrite, unlock: false, atomic: false });
        await this.delete(from, { recursive: false, useTrash: false, atomic: false });
      } else {
        throw this.createFileSystemProviderError(from, localize("fileSystemRenameError", "Rename is only supported for files."), FileSystemProviderErrorCode.Unavailable);
      }
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  watch(resource, opts) {
    const disposables = new DisposableStore();
    this.doWatch(resource, opts, disposables).catch((error) => this.logService.error(`[File Watcher ('FileSystemObserver')] Error: ${error} (${resource})`));
    return disposables;
  }
  async doWatch(resource, opts, disposables) {
    if (!WebFileSystemObserver.supported(globalThis)) {
      return;
    }
    const handle = await this.getHandle(resource);
    if (!handle || disposables.isDisposed) {
      return;
    }
    const observer = new globalThis.FileSystemObserver((records) => {
      if (disposables.isDisposed) {
        return;
      }
      const events = [];
      for (const record of records) {
        if (this.logService.getLevel() === LogLevel.Trace) {
          this.logService.trace(`[File Watcher ('FileSystemObserver')] [${record.type}] ${joinPath(resource, ...record.relativePathComponents)}`);
        }
        switch (record.type) {
          case "appeared":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.ADDED });
            break;
          case "disappeared":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.DELETED });
            break;
          case "modified":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.UPDATED });
            break;
          case "errored":
            this.logService.trace(`[File Watcher ('FileSystemObserver')] errored, disposing observer (${resource})`);
            disposables.dispose();
        }
      }
      if (events.length) {
        this._onDidChangeFileEmitter.fire(events);
      }
    });
    try {
      await observer.observe(handle, opts.recursive ? { recursive: true } : void 0);
    } finally {
      if (disposables.isDisposed) {
        observer.disconnect();
      } else {
        disposables.add(toDisposable(() => observer.disconnect()));
      }
    }
  }
  registerFileHandle(handle) {
    return this.registerHandle(handle, this._files);
  }
  registerDirectoryHandle(handle) {
    return this.registerHandle(handle, this._directories);
  }
  get directories() {
    return this._directories.values();
  }
  async registerHandle(handle, map) {
    let handleId = `/${handle.name}`;
    if (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle)) {
      const fileExt = extname(handle.name);
      const fileName = basename(handle.name, fileExt);
      let handleIdCounter = 1;
      do {
        handleId = `/${fileName}-${handleIdCounter++}${fileExt}`;
      } while (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle));
    }
    map.set(handleId, handle);
    try {
      await this.indexedDB?.runInTransaction(this.store, "readwrite", (objectStore) => objectStore.put(handle, handleId));
    } catch (error) {
      this.logService.error(error);
    }
    return URI.from({ scheme: Schemas.file, path: handleId });
  }
  async getHandle(resource) {
    let handle = await this.doGetHandle(resource);
    if (!handle) {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (parent) {
        const name = extUri.basename(resource);
        try {
          handle = await parent.getFileHandle(name);
        } catch (error) {
          try {
            handle = await parent.getDirectoryHandle(name);
          } catch (error2) {
          }
        }
      }
    }
    return handle;
  }
  async getFileHandle(resource) {
    const handle = await this.doGetHandle(resource);
    if (handle instanceof FileSystemFileHandle) {
      return handle;
    }
    const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
    try {
      return await parent?.getFileHandle(extUri.basename(resource));
    } catch (error) {
      return void 0;
    }
  }
  async getDirectoryHandle(resource) {
    const handle = await this.doGetHandle(resource);
    if (handle instanceof FileSystemDirectoryHandle) {
      return handle;
    }
    const parentUri = this.extUri.dirname(resource);
    if (this.extUri.isEqual(parentUri, resource)) {
      return void 0;
    }
    const parent = await this.getDirectoryHandle(parentUri);
    try {
      return await parent?.getDirectoryHandle(extUri.basename(resource));
    } catch (error) {
      return void 0;
    }
  }
  async doGetHandle(resource) {
    if (this.extUri.dirname(resource).path !== "/") {
      return void 0;
    }
    const handleId = resource.path.replace(/\/$/, "");
    const inMemoryHandle = this._files.get(handleId) ?? this._directories.get(handleId);
    if (inMemoryHandle) {
      return inMemoryHandle;
    }
    const persistedHandle = await this.indexedDB?.runInTransaction(this.store, "readonly", (store) => store.get(handleId));
    if (WebFileSystemAccess.isFileSystemHandle(persistedHandle)) {
      let hasPermissions = await persistedHandle.queryPermission() === "granted";
      try {
        if (!hasPermissions) {
          hasPermissions = await persistedHandle.requestPermission() === "granted";
        }
      } catch (error) {
        this.logService.error(error);
      }
      if (hasPermissions) {
        if (WebFileSystemAccess.isFileSystemFileHandle(persistedHandle)) {
          this._files.set(handleId, persistedHandle);
        } else if (WebFileSystemAccess.isFileSystemDirectoryHandle(persistedHandle)) {
          this._directories.set(handleId, persistedHandle);
        }
        return persistedHandle;
      }
    }
    throw this.createFileSystemProviderError(resource, "No file system handle registered", FileSystemProviderErrorCode.Unavailable);
  }
  //#endregion
  toFileSystemProviderError(error) {
    if (error instanceof FileSystemProviderError) {
      return error;
    }
    let code = FileSystemProviderErrorCode.Unknown;
    if (error.name === "NotAllowedError") {
      error = new Error(localize("fileSystemNotAllowedError", "Insufficient permissions. Please retry and allow the operation."));
      code = FileSystemProviderErrorCode.Unavailable;
    }
    return createFileSystemProviderError(error, code);
  }
  createFileSystemProviderError(resource, msg, code) {
    return createFileSystemProviderError(new Error(`${msg} (${normalize(resource.path)})`), code);
  }
}
export {
  HTMLFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXGJyb3dzZXJcXGh0bWxGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUsIG5vcm1hbGl6ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaSwgZXh0VXJpSWdub3JlUGF0aENhc2UsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG5ld1dyaXRlYWJsZVN0cmVhbSwgUmVhZGFibGVTdHJlYW1FdmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIElGaWxlRGVsZXRlT3B0aW9ucywgSUZpbGVPdmVyd3JpdGVPcHRpb25zLCBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIEZpbGVUeXBlLCBJRmlsZVdyaXRlT3B0aW9ucywgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIElTdGF0LCBJV2F0Y2hPcHRpb25zLCBJRmlsZUNoYW5nZSwgRmlsZUNoYW5nZVR5cGUgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbU9ic2VydmVyUmVjb3JkLCBXZWJGaWxlU3lzdGVtQWNjZXNzLCBXZWJGaWxlU3lzdGVtT2JzZXJ2ZXIgfSBmcm9tICcuL3dlYkZpbGVTeXN0ZW1BY2Nlc3MuanMnO1xuaW1wb3J0IHsgSW5kZXhlZERCIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2luZGV4ZWREQi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBIVE1MRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5IHtcblxuXHQvLyNyZWdpb24gRXZlbnRzICh1bnN1cHBvcnRlZClcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUNhcGFiaWxpdGllcyA9IEV2ZW50Lk5vbmU7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgQ2FwYWJpbGl0aWVzXG5cblx0cHJpdmF0ZSBleHRVcmkgPSBpc0xpbnV4ID8gZXh0VXJpIDogZXh0VXJpSWdub3JlUGF0aENhc2U7XG5cblx0cHJpdmF0ZSBfY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfCB1bmRlZmluZWQ7XG5cdGdldCBjYXBhYmlsaXRpZXMoKTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIHtcblx0XHRpZiAoIXRoaXMuX2NhcGFiaWxpdGllcykge1xuXHRcdFx0dGhpcy5fY2FwYWJpbGl0aWVzID1cblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW07XG5cblx0XHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHRcdHRoaXMuX2NhcGFiaWxpdGllcyB8PSBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NhcGFiaWxpdGllcztcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBpbmRleGVkREI6IEluZGV4ZWREQiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0b3JlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEZpbGUgTWV0YWRhdGEgUmVzb2x2aW5nXG5cblx0YXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldEhhbmRsZShyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeSwgc3RhdCcsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1GaWxlSGFuZGxlKGhhbmRsZSkpIHtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IGF3YWl0IGhhbmRsZS5nZXRGaWxlKCk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdG10aW1lOiBmaWxlLmxhc3RNb2RpZmllZCxcblx0XHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0XHRzaXplOiBmaWxlLnNpemVcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0Y3RpbWU6IDAsXG5cdFx0XHRcdHNpemU6IDBcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVhZGRpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxbc3RyaW5nLCBGaWxlVHlwZV1bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZShyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeSwgcmVhZGRpcicsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQ6IFtzdHJpbmcsIEZpbGVUeXBlXVtdID0gW107XG5cblx0XHRcdGZvciBhd2FpdCAoY29uc3QgW25hbWUsIGNoaWxkXSBvZiBoYW5kbGUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW25hbWUsIFdlYkZpbGVTeXN0ZW1BY2Nlc3MuaXNGaWxlU3lzdGVtRmlsZUhhbmRsZShjaGlsZCkgPyBGaWxlVHlwZS5GaWxlIDogRmlsZVR5cGUuRGlyZWN0b3J5XSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgUmVhZGluZy9Xcml0aW5nXG5cblx0cmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxVaW50OEFycmF5PihkYXRhID0+IFZTQnVmZmVyLmNvbmNhdChkYXRhLm1hcChkYXRhID0+IFZTQnVmZmVyLndyYXAoZGF0YSkpKS5idWZmZXIsIHtcblx0XHRcdC8vIFNldCBhIGhpZ2hXYXRlck1hcmsgdG8gcHJldmVudCB0aGUgc3RyZWFtXG5cdFx0XHQvLyBmb3IgZmlsZSB1cGxvYWQgdG8gcHJvZHVjZSBsYXJnZSBidWZmZXJzXG5cdFx0XHQvLyBpbi1tZW1vcnlcblx0XHRcdGhpZ2hXYXRlck1hcms6IDEwXG5cdFx0fSk7XG5cblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgdGhpcy5nZXRGaWxlSGFuZGxlKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeSwgcmVhZEZpbGUnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZpbGUgPSBhd2FpdCBoYW5kbGUuZ2V0RmlsZSgpO1xuXG5cdFx0XHRcdC8vIFBhcnRpYWwgZmlsZTogaW1wbGVtZW50ZWQgc2ltcGx5IHZpYSBgcmVhZEZpbGVgXG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0cy5sZW5ndGggPT09ICdudW1iZXInIHx8IHR5cGVvZiBvcHRzLnBvc2l0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGxldCBidWZmZXIgPSBuZXcgVWludDhBcnJheShhd2FpdCBmaWxlLmFycmF5QnVmZmVyKCkpO1xuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBvcHRzPy5wb3NpdGlvbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGJ1ZmZlciA9IGJ1ZmZlci5zbGljZShvcHRzLnBvc2l0aW9uKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIG9wdHM/Lmxlbmd0aCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGJ1ZmZlciA9IGJ1ZmZlci5zbGljZSgwLCBvcHRzLmxlbmd0aCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c3RyZWFtLmVuZChidWZmZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRW50aXJlIGZpbGVcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhZGVyOiBSZWFkYWJsZVN0cmVhbURlZmF1bHRSZWFkZXI8VWludDhBcnJheT4gPSBmaWxlLnN0cmVhbSgpLmdldFJlYWRlcigpO1xuXG5cdFx0XHRcdFx0bGV0IHJlcyA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cdFx0XHRcdFx0d2hpbGUgKCFyZXMuZG9uZSkge1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBXcml0ZSBidWZmZXIgaW50byBzdHJlYW0gYnV0IG1ha2Ugc3VyZSB0byB3YWl0XG5cdFx0XHRcdFx0XHQvLyBpbiBjYXNlIHRoZSBgaGlnaFdhdGVyTWFya2AgaXMgcmVhY2hlZFxuXHRcdFx0XHRcdFx0YXdhaXQgc3RyZWFtLndyaXRlKHJlcy52YWx1ZSk7XG5cblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmVzID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RyZWFtLmVuZCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRzdHJlYW0uZXJyb3IodGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKSk7XG5cdFx0XHRcdHN0cmVhbS5lbmQoKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHN0cmVhbTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgdGhpcy5nZXRGaWxlSGFuZGxlKHJlc291cmNlKTtcblx0XHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5LCByZWFkRmlsZScsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgaGFuZGxlLmdldEZpbGUoKTtcblxuXHRcdFx0cmV0dXJuIG5ldyBVaW50OEFycmF5KGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldEZpbGVIYW5kbGUocmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBWYWxpZGF0ZSB0YXJnZXQgdW5sZXNzIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUgfVxuXHRcdFx0aWYgKCFvcHRzLmNyZWF0ZSB8fCAhb3B0cy5vdmVyd3JpdGUpIHtcblx0XHRcdFx0aWYgKGhhbmRsZSkge1xuXHRcdFx0XHRcdGlmICghb3B0cy5vdmVyd3JpdGUpIHtcblx0XHRcdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdGaWxlIGFscmVhZHkgZXhpc3RzLCB3cml0ZUZpbGUnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghb3B0cy5jcmVhdGUpIHtcblx0XHRcdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIGZpbGUsIHdyaXRlRmlsZScsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgdGFyZ2V0IGFzIG5lZWRlZFxuXHRcdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5nZXREaXJlY3RvcnlIYW5kbGUodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoIXBhcmVudCkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIHBhcmVudCBkaXJlY3RvcnksIHdyaXRlRmlsZScsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlID0gYXdhaXQgcGFyZW50LmdldEZpbGVIYW5kbGUodGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpLCB7IGNyZWF0ZTogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnVW5hYmxlIHRvIGNyZWF0ZSBmaWxlICwgd3JpdGVGaWxlJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdyaXRlIHRvIHRhcmdldCBvdmVyd3JpdGluZyBhbnkgZXhpc3RpbmcgY29udGVudHNcblx0XHRcdGNvbnN0IHdyaXRhYmxlID0gYXdhaXQgaGFuZGxlLmNyZWF0ZVdyaXRhYmxlKCk7XG5cdFx0XHRhd2FpdCB3cml0YWJsZS53cml0ZShjb250ZW50IGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+KTtcblx0XHRcdGF3YWl0IHdyaXRhYmxlLmNsb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1vdmUvQ29weS9EZWxldGUvQ3JlYXRlIEZvbGRlclxuXG5cdGFzeW5jIG1rZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5nZXREaXJlY3RvcnlIYW5kbGUodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ05vIHN1Y2ggcGFyZW50IGRpcmVjdG9yeSwgbWtkaXInLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgcGFyZW50LmdldERpcmVjdG9yeUhhbmRsZSh0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSksIHsgY3JlYXRlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5nZXREaXJlY3RvcnlIYW5kbGUodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ05vIHN1Y2ggcGFyZW50IGRpcmVjdG9yeSwgZGVsZXRlJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBwYXJlbnQucmVtb3ZlRW50cnkodGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpLCB7IHJlY3Vyc2l2ZTogb3B0cy5yZWN1cnNpdmUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKGZyb20sIHRvKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vLW9wIGlmIHRoZSBwYXRocyBhcmUgdGhlIHNhbWVcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW1wbGVtZW50IGZpbGUgcmVuYW1lIGJ5IHdyaXRlICsgZGVsZXRlXG5cdFx0XHRjb25zdCBmaWxlSGFuZGxlID0gYXdhaXQgdGhpcy5nZXRGaWxlSGFuZGxlKGZyb20pO1xuXHRcdFx0aWYgKGZpbGVIYW5kbGUpIHtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IGF3YWl0IGZpbGVIYW5kbGUuZ2V0RmlsZSgpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50cyA9IG5ldyBVaW50OEFycmF5KGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKSk7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy53cml0ZUZpbGUodG8sIGNvbnRlbnRzLCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiBvcHRzLm92ZXJ3cml0ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWxldGUoZnJvbSwgeyByZWN1cnNpdmU6IGZhbHNlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbGUgQVBJIGRvZXMgbm90IHN1cHBvcnQgYW55IHJlYWwgcmVuYW1lIG90aGVyd2lzZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZnJvbSwgbG9jYWxpemUoJ2ZpbGVTeXN0ZW1SZW5hbWVFcnJvcicsIFwiUmVuYW1lIGlzIG9ubHkgc3VwcG9ydGVkIGZvciBmaWxlcy5cIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgV2F0Y2hpbmcgKHVuc3VwcG9ydGVkKVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmlsZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlRW1pdHRlci5ldmVudDtcblxuXHR3YXRjaChyZXNvdXJjZTogVVJJLCBvcHRzOiBJV2F0Y2hPcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5kb1dhdGNoKHJlc291cmNlLCBvcHRzLCBkaXNwb3NhYmxlcykuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbRmlsZSBXYXRjaGVyICgnRmlsZVN5c3RlbU9ic2VydmVyJyldIEVycm9yOiAke2Vycm9yfSAoJHtyZXNvdXJjZX0pYCkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIVdlYkZpbGVTeXN0ZW1PYnNlcnZlci5zdXBwb3J0ZWQoZ2xvYmFsVGhpcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldEhhbmRsZShyZXNvdXJjZSk7XG5cdFx0aWYgKCFoYW5kbGUgfHwgZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IChnbG9iYWxUaGlzIGFzIGFueSkuRmlsZVN5c3RlbU9ic2VydmVyKChyZWNvcmRzOiBGaWxlU3lzdGVtT2JzZXJ2ZXJSZWNvcmRbXSkgPT4ge1xuXHRcdFx0aWYgKGRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBldmVudHM6IElGaWxlQ2hhbmdlW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVjb3JkIG9mIHJlY29yZHMpIHtcblx0XHRcdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0ZpbGUgV2F0Y2hlciAoJ0ZpbGVTeXN0ZW1PYnNlcnZlcicpXSBbJHtyZWNvcmQudHlwZX1dICR7am9pblBhdGgocmVzb3VyY2UsIC4uLnJlY29yZC5yZWxhdGl2ZVBhdGhDb21wb25lbnRzKX1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN3aXRjaCAocmVjb3JkLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdhcHBlYXJlZCc6XG5cdFx0XHRcdFx0XHRldmVudHMucHVzaCh7IHJlc291cmNlOiBqb2luUGF0aChyZXNvdXJjZSwgLi4ucmVjb3JkLnJlbGF0aXZlUGF0aENvbXBvbmVudHMpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Rpc2FwcGVhcmVkJzpcblx0XHRcdFx0XHRcdGV2ZW50cy5wdXNoKHsgcmVzb3VyY2U6IGpvaW5QYXRoKHJlc291cmNlLCAuLi5yZWNvcmQucmVsYXRpdmVQYXRoQ29tcG9uZW50cyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdFx0XHRldmVudHMucHVzaCh7IHJlc291cmNlOiBqb2luUGF0aChyZXNvdXJjZSwgLi4ucmVjb3JkLnJlbGF0aXZlUGF0aENvbXBvbmVudHMpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXJyb3JlZCc6XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtGaWxlIFdhdGNoZXIgKCdGaWxlU3lzdGVtT2JzZXJ2ZXInKV0gZXJyb3JlZCwgZGlzcG9zaW5nIG9ic2VydmVyICgke3Jlc291cmNlfSlgKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnRzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbGVFbWl0dGVyLmZpcmUoZXZlbnRzKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBvYnNlcnZlci5vYnNlcnZlKGhhbmRsZSwgb3B0cy5yZWN1cnNpdmUgPyB7IHJlY3Vyc2l2ZTogdHJ1ZSB9IDogdW5kZWZpbmVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKGRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0b2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZS9EaXJlY3RveSBIYW5kbGUgUmVnaXN0cnlcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWxlU3lzdGVtRmlsZUhhbmRsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlyZWN0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZT4oKTtcblxuXHRyZWdpc3RlckZpbGVIYW5kbGUoaGFuZGxlOiBGaWxlU3lzdGVtRmlsZUhhbmRsZSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVnaXN0ZXJIYW5kbGUoaGFuZGxlLCB0aGlzLl9maWxlcyk7XG5cdH1cblxuXHRyZWdpc3RlckRpcmVjdG9yeUhhbmRsZShoYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiB0aGlzLnJlZ2lzdGVySGFuZGxlKGhhbmRsZSwgdGhpcy5fZGlyZWN0b3JpZXMpO1xuXHR9XG5cblx0Z2V0IGRpcmVjdG9yaWVzKCk6IEl0ZXJhYmxlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0b3JpZXMudmFsdWVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZ2lzdGVySGFuZGxlKGhhbmRsZTogRmlsZVN5c3RlbUhhbmRsZSwgbWFwOiBNYXA8c3RyaW5nLCBGaWxlU3lzdGVtSGFuZGxlPik6IFByb21pc2U8VVJJPiB7XG5cdFx0bGV0IGhhbmRsZUlkID0gYC8ke2hhbmRsZS5uYW1lfWA7XG5cblx0XHQvLyBDb21wdXRlIGEgdmFsaWQgaGFuZGxlIElEIGluIGNhc2UgdGhpcyBleGlzdHMgYWxyZWFkeVxuXHRcdGlmIChtYXAuaGFzKGhhbmRsZUlkKSAmJiAhYXdhaXQgbWFwLmdldChoYW5kbGVJZCk/LmlzU2FtZUVudHJ5KGhhbmRsZSkpIHtcblx0XHRcdGNvbnN0IGZpbGVFeHQgPSBleHRuYW1lKGhhbmRsZS5uYW1lKTtcblx0XHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUoaGFuZGxlLm5hbWUsIGZpbGVFeHQpO1xuXG5cdFx0XHRsZXQgaGFuZGxlSWRDb3VudGVyID0gMTtcblx0XHRcdGRvIHtcblx0XHRcdFx0aGFuZGxlSWQgPSBgLyR7ZmlsZU5hbWV9LSR7aGFuZGxlSWRDb3VudGVyKyt9JHtmaWxlRXh0fWA7XG5cdFx0XHR9IHdoaWxlIChtYXAuaGFzKGhhbmRsZUlkKSAmJiAhYXdhaXQgbWFwLmdldChoYW5kbGVJZCk/LmlzU2FtZUVudHJ5KGhhbmRsZSkpO1xuXHRcdH1cblxuXHRcdG1hcC5zZXQoaGFuZGxlSWQsIGhhbmRsZSk7XG5cblx0XHQvLyBSZW1lbWJlciBpbiBJbmRleERCIGZvciBmdXR1cmUgbG9va3VwXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuaW5kZXhlZERCPy5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkd3JpdGUnLCBvYmplY3RTdG9yZSA9PiBvYmplY3RTdG9yZS5wdXQoaGFuZGxlLCBoYW5kbGVJZCkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBoYW5kbGVJZCB9KTtcblx0fVxuXG5cdGFzeW5jIGdldEhhbmRsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxGaWxlU3lzdGVtSGFuZGxlIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBGaXJzdDogdHJ5IHRvIGZpbmQgYSB3ZWxsIGtub3duIGhhbmRsZSBmaXJzdFxuXHRcdGxldCBoYW5kbGUgPSBhd2FpdCB0aGlzLmRvR2V0SGFuZGxlKHJlc291cmNlKTtcblxuXHRcdC8vIFNlY29uZDogd2FsayB1cCBwYXJlbnQgZGlyZWN0b3JpZXMgYW5kIHJlc29sdmUgaGFuZGxlIGlmIHBvc3NpYmxlXG5cdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHRoaXMuZ2V0RGlyZWN0b3J5SGFuZGxlKHRoaXMuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpKTtcblx0XHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aGFuZGxlID0gYXdhaXQgcGFyZW50LmdldEZpbGVIYW5kbGUobmFtZSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGhhbmRsZSA9IGF3YWl0IHBhcmVudC5nZXREaXJlY3RvcnlIYW5kbGUobmFtZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdC8vIElnbm9yZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEZpbGVIYW5kbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8RmlsZVN5c3RlbUZpbGVIYW5kbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmRvR2V0SGFuZGxlKHJlc291cmNlKTtcblx0XHRpZiAoaGFuZGxlIGluc3RhbmNlb2YgRmlsZVN5c3RlbUZpbGVIYW5kbGUpIHtcblx0XHRcdHJldHVybiBoYW5kbGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5nZXREaXJlY3RvcnlIYW5kbGUodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwYXJlbnQ/LmdldEZpbGVIYW5kbGUoZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIGd1YXJkIGFnYWluc3QgcG9zc2libGUgRE9NRXhjZXB0aW9uXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREaXJlY3RvcnlIYW5kbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZG9HZXRIYW5kbGUocmVzb3VyY2UpO1xuXHRcdGlmIChoYW5kbGUgaW5zdGFuY2VvZiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKSB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudFVyaSA9IHRoaXMuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHBhcmVudFVyaSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyByZXR1cm4gd2hlbiByb290IGlzIHJlYWNoZWQgdG8gcHJldmVudCBpbmZpbml0ZSByZWN1cnNpb25cblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZShwYXJlbnRVcmkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwYXJlbnQ/LmdldERpcmVjdG9yeUhhbmRsZShleHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZ3VhcmQgYWdhaW5zdCBwb3NzaWJsZSBET01FeGNlcHRpb25cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvR2V0SGFuZGxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPEZpbGVTeXN0ZW1IYW5kbGUgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIFdlIHN0b3JlIGZpbGUgc3lzdGVtIGhhbmRsZXMgd2l0aCB0aGUgYGhhbmRsZS5uYW1lYFxuXHRcdC8vIGFuZCBhcyBzdWNoIHJlcXVpcmUgdGhlIHJlc291cmNlIHRvIGJlIG9uIHRoZSByb290XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpLnBhdGggIT09ICcvJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGVJZCA9IHJlc291cmNlLnBhdGgucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gcmVtb3ZlIHBvdGVudGlhbCBzbGFzaCBmcm9tIHRoZSBlbmQgb2YgdGhlIHBhdGhcblxuXHRcdC8vIEZpcnN0OiBjaGVjayBpZiB3ZSBoYXZlIGEga25vd24gaGFuZGxlIHN0b3JlZCBpbiBtZW1vcnlcblx0XHRjb25zdCBpbk1lbW9yeUhhbmRsZSA9IHRoaXMuX2ZpbGVzLmdldChoYW5kbGVJZCkgPz8gdGhpcy5fZGlyZWN0b3JpZXMuZ2V0KGhhbmRsZUlkKTtcblx0XHRpZiAoaW5NZW1vcnlIYW5kbGUpIHtcblx0XHRcdHJldHVybiBpbk1lbW9yeUhhbmRsZTtcblx0XHR9XG5cblx0XHQvLyBTZWNvbmQ6IGNoZWNrIGlmIHdlIGhhdmUgYSBwZXJzaXN0ZWQgaGFuZGxlIGluIEluZGV4ZWREQlxuXHRcdGNvbnN0IHBlcnNpc3RlZEhhbmRsZSA9IGF3YWl0IHRoaXMuaW5kZXhlZERCPy5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkb25seScsIHN0b3JlID0+IHN0b3JlLmdldChoYW5kbGVJZCkpO1xuXHRcdGlmIChXZWJGaWxlU3lzdGVtQWNjZXNzLmlzRmlsZVN5c3RlbUhhbmRsZShwZXJzaXN0ZWRIYW5kbGUpKSB7XG5cdFx0XHRsZXQgaGFzUGVybWlzc2lvbnMgPSBhd2FpdCBwZXJzaXN0ZWRIYW5kbGUucXVlcnlQZXJtaXNzaW9uKCkgPT09ICdncmFudGVkJztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICghaGFzUGVybWlzc2lvbnMpIHtcblx0XHRcdFx0XHRoYXNQZXJtaXNzaW9ucyA9IGF3YWl0IHBlcnNpc3RlZEhhbmRsZS5yZXF1ZXN0UGVybWlzc2lvbigpID09PSAnZ3JhbnRlZCc7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7IC8vIHRoaXMgY2FuIGZhaWwgd2l0aCBhIERPTUV4Y2VwdGlvblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzUGVybWlzc2lvbnMpIHtcblx0XHRcdFx0aWYgKFdlYkZpbGVTeXN0ZW1BY2Nlc3MuaXNGaWxlU3lzdGVtRmlsZUhhbmRsZShwZXJzaXN0ZWRIYW5kbGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsZXMuc2V0KGhhbmRsZUlkLCBwZXJzaXN0ZWRIYW5kbGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKFdlYkZpbGVTeXN0ZW1BY2Nlc3MuaXNGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKHBlcnNpc3RlZEhhbmRsZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9kaXJlY3Rvcmllcy5zZXQoaGFuZGxlSWQsIHBlcnNpc3RlZEhhbmRsZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcGVyc2lzdGVkSGFuZGxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoaXJkOiBmYWlsIHdpdGggYW4gZXJyb3Jcblx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gZmlsZSBzeXN0ZW0gaGFuZGxlIHJlZ2lzdGVyZWQnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSB0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yOiBFcnJvcik6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIHtcblx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yOyAvLyBhdm9pZCBkb3VibGUgY29udmVyc2lvblxuXHRcdH1cblxuXHRcdGxldCBjb2RlID0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd247XG5cdFx0aWYgKGVycm9yLm5hbWUgPT09ICdOb3RBbGxvd2VkRXJyb3InKSB7XG5cdFx0XHRlcnJvciA9IG5ldyBFcnJvcihsb2NhbGl6ZSgnZmlsZVN5c3RlbU5vdEFsbG93ZWRFcnJvcicsIFwiSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLiBQbGVhc2UgcmV0cnkgYW5kIGFsbG93IHRoZSBvcGVyYXRpb24uXCIpKTtcblx0XHRcdGNvZGUgPSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yLCBjb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2U6IFVSSSwgbXNnOiBzdHJpbmcsIGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIHtcblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobmV3IEVycm9yKGAke21zZ30gKCR7bm9ybWFsaXplKHJlc291cmNlLnBhdGgpfSlgKSwgY29kZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLFNBQVMsaUJBQWlCO0FBQzdDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFFBQVEsc0JBQXNCLGdCQUFnQjtBQUN2RCxTQUFTLDBCQUFnRDtBQUN6RCxTQUFTLCtCQUFrRyxnQ0FBZ0MseUJBQXlCLDZCQUE2QixVQUFpSyxzQkFBc0I7QUFDeFgsU0FBbUMscUJBQXFCLDZCQUE2QjtBQUVyRixTQUFzQixnQkFBZ0I7QUFFL0IsTUFBTSwrQkFBK0IsV0FBc0g7QUFBQTtBQUFBLEVBOEJqSyxZQUNTLFdBQ1MsT0FDVCxZQUNQO0FBQ0QsVUFBTTtBQUpFO0FBQ1M7QUFDVDtBQTdCVDtBQUFBLFNBQVMsMEJBQTBCLE1BQU07QUFNekM7QUFBQTtBQUFBLFNBQVEsU0FBUyxVQUFVLFNBQVM7QUFrUXBDO0FBQUE7QUFBQSxTQUFpQiwwQkFB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
