import { Throttler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ExtUri } from "../../../base/common/resources.js";
import { isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType } from "../common/files.js";
import { BroadcastDataChannel } from "../../../base/browser/broadcast.js";
const ERR_FILE_NOT_FOUND = createFileSystemProviderError(localize("fileNotExists", "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
const ERR_FILE_IS_DIR = createFileSystemProviderError(localize("fileIsDirectory", "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
const ERR_FILE_NOT_DIR = createFileSystemProviderError(localize("fileNotDirectory", "File is not a directory"), FileSystemProviderErrorCode.FileNotADirectory);
const ERR_DIR_NOT_EMPTY = createFileSystemProviderError(localize("dirIsNotEmpty", "Directory is not empty"), FileSystemProviderErrorCode.Unknown);
const ERR_FILE_EXCEEDS_STORAGE_QUOTA = createFileSystemProviderError(localize("fileExceedsStorageQuota", "File exceeds available storage quota"), FileSystemProviderErrorCode.FileExceedsStorageQuota);
const ERR_UNKNOWN_INTERNAL = (message) => createFileSystemProviderError(localize("internal", "Internal error occurred in IndexedDB File System Provider. ({0})", message), FileSystemProviderErrorCode.Unknown);
class IndexedDBFileSystemNode {
  constructor(entry) {
    this.entry = entry;
    this.type = entry.type;
  }
  read(path) {
    return this.doRead(path.split("/").filter((p) => p.length));
  }
  doRead(pathParts) {
    if (pathParts.length === 0) {
      return this.entry;
    }
    if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL("Internal error reading from IndexedDBFSNode -- expected directory at " + this.entry.path);
    }
    const next = this.entry.children.get(pathParts[0]);
    if (!next) {
      return void 0;
    }
    return next.doRead(pathParts.slice(1));
  }
  delete(path) {
    const toDelete = path.split("/").filter((p) => p.length);
    if (toDelete.length === 0) {
      if (this.entry.type !== FileType.Directory) {
        throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode. Expected root entry to be directory`);
      }
      this.entry.children.clear();
    } else {
      return this.doDelete(toDelete, path);
    }
  }
  doDelete(pathParts, originalPath) {
    if (pathParts.length === 0) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode -- got no deletion path parts (encountered while deleting ${originalPath})`);
    } else if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL("Internal error deleting from IndexedDBFSNode -- expected directory at " + this.entry.path);
    } else if (pathParts.length === 1) {
      this.entry.children.delete(pathParts[0]);
    } else {
      const next = this.entry.children.get(pathParts[0]);
      if (!next) {
        throw ERR_UNKNOWN_INTERNAL("Internal error deleting from IndexedDBFSNode -- expected entry at " + this.entry.path + "/" + next);
      }
      next.doDelete(pathParts.slice(1), originalPath);
    }
  }
  add(path, entry) {
    this.doAdd(path.split("/").filter((p) => p.length), entry, path);
  }
  doAdd(pathParts, entry, originalPath) {
    if (pathParts.length === 0) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- adding empty path (encountered while adding ${originalPath})`);
    } else if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- parent is not a directory (encountered while adding ${originalPath})`);
    } else if (pathParts.length === 1) {
      const next = pathParts[0];
      const existing = this.entry.children.get(next);
      if (entry.type === "dir") {
        if (existing?.entry.type === FileType.File) {
          throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
        }
        this.entry.children.set(next, existing ?? new IndexedDBFileSystemNode({
          type: FileType.Directory,
          path: this.entry.path + "/" + next,
          children: /* @__PURE__ */ new Map()
        }));
      } else {
        if (existing?.entry.type === FileType.Directory) {
          throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting directory with file: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
        }
        this.entry.children.set(next, new IndexedDBFileSystemNode({
          type: FileType.File,
          path: this.entry.path + "/" + next,
          size: entry.size
        }));
      }
    } else if (pathParts.length > 1) {
      const next = pathParts[0];
      let childNode = this.entry.children.get(next);
      if (!childNode) {
        childNode = new IndexedDBFileSystemNode({
          children: /* @__PURE__ */ new Map(),
          path: this.entry.path + "/" + next,
          type: FileType.Directory
        });
        this.entry.children.set(next, childNode);
      } else if (childNode.type === FileType.File) {
        throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file entry with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
      }
      childNode.doAdd(pathParts.slice(1), entry, originalPath);
    }
  }
  print(indentation = "") {
    console.log(indentation + this.entry.path);
    if (this.entry.type === FileType.Directory) {
      this.entry.children.forEach((child) => child.print(indentation + " "));
    }
  }
}
class IndexedDBFileSystemProvider extends Disposable {
  constructor(scheme, indexedDB, store, watchCrossWindowChanges) {
    super();
    this.scheme = scheme;
    this.indexedDB = indexedDB;
    this.store = store;
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend | FileSystemProviderCapabilities.PathCaseSensitive;
    this.onDidChangeCapabilities = Event.None;
    this.extUri = new ExtUri(() => false);
    this._onDidChangeFile = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFile.event;
    this.mtimes = /* @__PURE__ */ new Map();
    this.fileWriteBatch = [];
    this.writeManyThrottler = new Throttler();
    if (watchCrossWindowChanges) {
      this.changesBroadcastChannel = this._register(new BroadcastDataChannel(`vscode.indexedDB.${scheme}.changes`));
      this._register(this.changesBroadcastChannel.onDidReceiveData((changes) => {
        this._onDidChangeFile.fire(changes.map((c) => ({ type: c.type, resource: URI.revive(c.resource) })));
      }));
    }
  }
  watch(resource, opts) {
    return Disposable.None;
  }
  async mkdir(resource) {
    try {
      const resourceStat = await this.stat(resource);
      if (resourceStat.type === FileType.File) {
        throw ERR_FILE_NOT_DIR;
      }
    } catch (error) {
    }
    (await this.getFiletree()).add(resource.path, { type: "dir" });
  }
  async stat(resource) {
    const entry = (await this.getFiletree()).read(resource.path);
    if (entry?.type === FileType.File) {
      return {
        type: FileType.File,
        ctime: 0,
        mtime: this.mtimes.get(resource.toString()) || 0,
        size: entry.size ?? (await this.readFile(resource)).byteLength
      };
    }
    if (entry?.type === FileType.Directory) {
      return {
        type: FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0
      };
    }
    throw ERR_FILE_NOT_FOUND;
  }
  async readdir(resource) {
    const entry = (await this.getFiletree()).read(resource.path);
    if (!entry) {
      return [];
    }
    if (entry.type !== FileType.Directory) {
      throw ERR_FILE_NOT_DIR;
    } else {
      return [...entry.children.entries()].map(([name, node]) => [name, node.type]);
    }
  }
  async readFile(resource) {
    const result = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => objectStore.get(resource.path));
    if (result === void 0) {
      throw ERR_FILE_NOT_FOUND;
    }
    const buffer = result instanceof Uint8Array ? result : isString(result) ? VSBuffer.fromString(result).buffer : void 0;
    if (buffer === void 0) {
      throw ERR_UNKNOWN_INTERNAL(`IndexedDB entry at "${resource.path}" in unexpected format`);
    }
    const fileTree = await this.getFiletree();
    fileTree.add(resource.path, { type: "file", size: buffer.byteLength });
    return buffer;
  }
  async writeFile(resource, content, opts) {
    const existing = await this.stat(resource).catch(() => void 0);
    if (existing?.type === FileType.Directory) {
      throw ERR_FILE_IS_DIR;
    }
    let finalContent = content;
    if (opts.append && existing) {
      const existingContent = await this.readFile(resource);
      const combined = new Uint8Array(existingContent.byteLength + content.byteLength);
      combined.set(existingContent, 0);
      combined.set(content, existingContent.byteLength);
      finalContent = combined;
    }
    await this.bulkWrite([[resource, finalContent]]);
  }
  async rename(from, to, opts) {
    const fileTree = await this.getFiletree();
    const fromEntry = fileTree.read(from.path);
    if (!fromEntry) {
      throw ERR_FILE_NOT_FOUND;
    }
    const toEntry = fileTree.read(to.path);
    if (toEntry) {
      if (!opts.overwrite) {
        throw createFileSystemProviderError("file exists already", FileSystemProviderErrorCode.FileExists);
      }
      if (toEntry.type !== fromEntry.type) {
        throw createFileSystemProviderError("Cannot rename files with different types", FileSystemProviderErrorCode.Unknown);
      }
      await this.delete(to, { recursive: true, useTrash: false, atomic: false });
    }
    const toTargetResource = (path) => this.extUri.joinPath(to, this.extUri.relativePath(from, from.with({ path })) || "");
    const sourceEntries = await this.tree(from);
    const sourceFiles = [];
    for (const sourceEntry of sourceEntries) {
      if (sourceEntry[1] === FileType.File) {
        sourceFiles.push(sourceEntry);
      } else if (sourceEntry[1] === FileType.Directory) {
        fileTree.add(toTargetResource(sourceEntry[0]).path, { type: "dir" });
      }
    }
    if (sourceFiles.length) {
      const targetFiles = [];
      const sourceFilesContents = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => sourceFiles.map(([path]) => objectStore.get(path)));
      for (let index = 0; index < sourceFiles.length; index++) {
        const content = sourceFilesContents[index] instanceof Uint8Array ? sourceFilesContents[index] : isString(sourceFilesContents[index]) ? VSBuffer.fromString(sourceFilesContents[index]).buffer : void 0;
        if (content) {
          targetFiles.push([toTargetResource(sourceFiles[index][0]), content]);
        }
      }
      await this.bulkWrite(targetFiles);
    }
    await this.delete(from, { recursive: true, useTrash: false, atomic: false });
  }
  async delete(resource, opts) {
    let stat;
    try {
      stat = await this.stat(resource);
    } catch (e) {
      if (e.code === FileSystemProviderErrorCode.FileNotFound) {
        return;
      }
      throw e;
    }
    let toDelete;
    if (opts.recursive) {
      const tree = await this.tree(resource);
      toDelete = tree.map(([path]) => path);
    } else {
      if (stat.type === FileType.Directory && (await this.readdir(resource)).length) {
        throw ERR_DIR_NOT_EMPTY;
      }
      toDelete = [resource.path];
    }
    await this.deleteKeys(toDelete);
    (await this.getFiletree()).delete(resource.path);
    toDelete.forEach((key) => this.mtimes.delete(key));
    this.triggerChanges(toDelete.map((path) => ({ resource: resource.with({ path }), type: FileChangeType.DELETED })));
  }
  async tree(resource) {
    const stat = await this.stat(resource);
    const allEntries = [[resource.path, stat.type]];
    if (stat.type === FileType.Directory) {
      const dirEntries = await this.readdir(resource);
      for (const [key, type] of dirEntries) {
        const childResource = this.extUri.joinPath(resource, key);
        allEntries.push([childResource.path, type]);
        if (type === FileType.Directory) {
          const childEntries = await this.tree(childResource);
          allEntries.push(...childEntries);
        }
      }
    }
    return allEntries;
  }
  triggerChanges(changes) {
    if (changes.length) {
      this._onDidChangeFile.fire(changes);
      this.changesBroadcastChannel?.postData(changes);
    }
  }
  getFiletree() {
    if (!this.cachedFiletree) {
      this.cachedFiletree = (async () => {
        const rootNode = new IndexedDBFileSystemNode({
          children: /* @__PURE__ */ new Map(),
          path: "",
          type: FileType.Directory
        });
        const result = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => objectStore.getAllKeys());
        const keys = result.map((key) => key.toString());
        keys.forEach((key) => rootNode.add(key, { type: "file" }));
        return rootNode;
      })();
    }
    return this.cachedFiletree;
  }
  async bulkWrite(files) {
    files.forEach(([resource, content]) => this.fileWriteBatch.push({ content, resource }));
    await this.writeManyThrottler.queue(() => this.writeMany());
    const fileTree = await this.getFiletree();
    for (const [resource, content] of files) {
      fileTree.add(resource.path, { type: "file", size: content.byteLength });
      this.mtimes.set(resource.toString(), Date.now());
    }
    this.triggerChanges(files.map(([resource]) => ({ resource, type: FileChangeType.UPDATED })));
  }
  async writeMany() {
    if (this.fileWriteBatch.length) {
      const fileBatch = this.fileWriteBatch.splice(0, this.fileWriteBatch.length);
      try {
        await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => fileBatch.map((entry) => {
          return objectStore.put(entry.content, entry.resource.path);
        }));
      } catch (ex) {
        if (ex instanceof DOMException && ex.name === "QuotaExceededError") {
          throw ERR_FILE_EXCEEDS_STORAGE_QUOTA;
        }
        throw ex;
      }
    }
  }
  async deleteKeys(keys) {
    if (keys.length) {
      await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => keys.map((key) => objectStore.delete(key)));
    }
  }
  async reset() {
    await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => objectStore.clear());
  }
}
export {
  IndexedDBFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXGJyb3dzZXJcXGluZGV4ZWREQkZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlEdG8gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIEZpbGVDaGFuZ2VUeXBlLCBJRmlsZURlbGV0ZU9wdGlvbnMsIElGaWxlT3ZlcndyaXRlT3B0aW9ucywgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIEZpbGVUeXBlLCBJRmlsZVdyaXRlT3B0aW9ucywgSUZpbGVDaGFuZ2UsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIElTdGF0LCBJV2F0Y2hPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluZGV4ZWREQiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9pbmRleGVkREIuanMnO1xuaW1wb3J0IHsgQnJvYWRjYXN0RGF0YUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvYWRjYXN0LmpzJztcblxuLy8gU3RhbmRhcmQgRlMgRXJyb3JzIChleHBlY3RlZCB0byBiZSB0aHJvd24gaW4gcHJvZHVjdGlvbiB3aGVuIGludmFsaWQgRlMgb3BlcmF0aW9ucyBhcmUgcmVxdWVzdGVkKVxuY29uc3QgRVJSX0ZJTEVfTk9UX0ZPVU5EID0gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobG9jYWxpemUoJ2ZpbGVOb3RFeGlzdHMnLCBcIkZpbGUgZG9lcyBub3QgZXhpc3RcIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuY29uc3QgRVJSX0ZJTEVfSVNfRElSID0gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobG9jYWxpemUoJ2ZpbGVJc0RpcmVjdG9yeScsIFwiRmlsZSBpcyBEaXJlY3RvcnlcIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5KTtcbmNvbnN0IEVSUl9GSUxFX05PVF9ESVIgPSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZU5vdERpcmVjdG9yeScsIFwiRmlsZSBpcyBub3QgYSBkaXJlY3RvcnlcIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90QURpcmVjdG9yeSk7XG5jb25zdCBFUlJfRElSX05PVF9FTVBUWSA9IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdkaXJJc05vdEVtcHR5JywgXCJEaXJlY3RvcnkgaXMgbm90IGVtcHR5XCIpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bik7XG5jb25zdCBFUlJfRklMRV9FWENFRURTX1NUT1JBR0VfUVVPVEEgPSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZUV4Y2VlZHNTdG9yYWdlUXVvdGEnLCBcIkZpbGUgZXhjZWVkcyBhdmFpbGFibGUgc3RvcmFnZSBxdW90YVwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGNlZWRzU3RvcmFnZVF1b3RhKTtcblxuLy8gQXJiaXRyYXJ5IEludGVybmFsIEVycm9yc1xuY29uc3QgRVJSX1VOS05PV05fSU5URVJOQUwgPSAobWVzc2FnZTogc3RyaW5nKSA9PiBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnaW50ZXJuYWwnLCBcIkludGVybmFsIGVycm9yIG9jY3VycmVkIGluIEluZGV4ZWREQiBGaWxlIFN5c3RlbSBQcm92aWRlci4gKHswfSlcIiwgbWVzc2FnZSksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duKTtcblxudHlwZSBEaXJFbnRyeSA9IFtzdHJpbmcsIEZpbGVUeXBlXTtcblxudHlwZSBJbmRleGVkREJGaWxlU3lzdGVtRW50cnkgPVxuXHR8IHtcblx0XHRwYXRoOiBzdHJpbmc7XG5cdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5O1xuXHRcdGNoaWxkcmVuOiBNYXA8c3RyaW5nLCBJbmRleGVkREJGaWxlU3lzdGVtTm9kZT47XG5cdH1cblx0fCB7XG5cdFx0cGF0aDogc3RyaW5nO1xuXHRcdHR5cGU6IEZpbGVUeXBlLkZpbGU7XG5cdFx0c2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHR9O1xuXG5jbGFzcyBJbmRleGVkREJGaWxlU3lzdGVtTm9kZSB7XG5cdHB1YmxpYyB0eXBlOiBGaWxlVHlwZTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGVudHJ5OiBJbmRleGVkREJGaWxlU3lzdGVtRW50cnkpIHtcblx0XHR0aGlzLnR5cGUgPSBlbnRyeS50eXBlO1xuXHR9XG5cblx0cmVhZChwYXRoOiBzdHJpbmcpOiBJbmRleGVkREJGaWxlU3lzdGVtRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRvUmVhZChwYXRoLnNwbGl0KCcvJykuZmlsdGVyKHAgPT4gcC5sZW5ndGgpKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZWFkKHBhdGhQYXJ0czogc3RyaW5nW10pOiBJbmRleGVkREJGaWxlU3lzdGVtRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAwKSB7IHJldHVybiB0aGlzLmVudHJ5OyB9XG5cdFx0aWYgKHRoaXMuZW50cnkudHlwZSAhPT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTCgnSW50ZXJuYWwgZXJyb3IgcmVhZGluZyBmcm9tIEluZGV4ZWREQkZTTm9kZSAtLSBleHBlY3RlZCBkaXJlY3RvcnkgYXQgJyArIHRoaXMuZW50cnkucGF0aCk7XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSB0aGlzLmVudHJ5LmNoaWxkcmVuLmdldChwYXRoUGFydHNbMF0pO1xuXG5cdFx0aWYgKCFuZXh0KSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRyZXR1cm4gbmV4dC5kb1JlYWQocGF0aFBhcnRzLnNsaWNlKDEpKTtcblx0fVxuXG5cdGRlbGV0ZShwYXRoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0b0RlbGV0ZSA9IHBhdGguc3BsaXQoJy8nKS5maWx0ZXIocCA9PiBwLmxlbmd0aCk7XG5cdFx0aWYgKHRvRGVsZXRlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuZW50cnkudHlwZSAhPT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKGBJbnRlcm5hbCBlcnJvciBkZWxldGluZyBmcm9tIEluZGV4ZWREQkZTTm9kZS4gRXhwZWN0ZWQgcm9vdCBlbnRyeSB0byBiZSBkaXJlY3RvcnlgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9EZWxldGUodG9EZWxldGUsIHBhdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9EZWxldGUocGF0aFBhcnRzOiBzdHJpbmdbXSwgb3JpZ2luYWxQYXRoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGRlbGV0aW5nIGZyb20gSW5kZXhlZERCRlNOb2RlIC0tIGdvdCBubyBkZWxldGlvbiBwYXRoIHBhcnRzIChlbmNvdW50ZXJlZCB3aGlsZSBkZWxldGluZyAke29yaWdpbmFsUGF0aH0pYCk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHRoaXMuZW50cnkudHlwZSAhPT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTCgnSW50ZXJuYWwgZXJyb3IgZGVsZXRpbmcgZnJvbSBJbmRleGVkREJGU05vZGUgLS0gZXhwZWN0ZWQgZGlyZWN0b3J5IGF0ICcgKyB0aGlzLmVudHJ5LnBhdGgpO1xuXHRcdH1cblx0XHRlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLmVudHJ5LmNoaWxkcmVuLmRlbGV0ZShwYXRoUGFydHNbMF0pO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLmVudHJ5LmNoaWxkcmVuLmdldChwYXRoUGFydHNbMF0pO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKCdJbnRlcm5hbCBlcnJvciBkZWxldGluZyBmcm9tIEluZGV4ZWREQkZTTm9kZSAtLSBleHBlY3RlZCBlbnRyeSBhdCAnICsgdGhpcy5lbnRyeS5wYXRoICsgJy8nICsgbmV4dCk7XG5cdFx0XHR9XG5cdFx0XHRuZXh0LmRvRGVsZXRlKHBhdGhQYXJ0cy5zbGljZSgxKSwgb3JpZ2luYWxQYXRoKTtcblx0XHR9XG5cdH1cblxuXHRhZGQocGF0aDogc3RyaW5nLCBlbnRyeTogeyB0eXBlOiAnZmlsZSc7IHNpemU/OiBudW1iZXIgfSB8IHsgdHlwZTogJ2RpcicgfSkge1xuXHRcdHRoaXMuZG9BZGQocGF0aC5zcGxpdCgnLycpLmZpbHRlcihwID0+IHAubGVuZ3RoKSwgZW50cnksIHBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZChwYXRoUGFydHM6IHN0cmluZ1tdLCBlbnRyeTogeyB0eXBlOiAnZmlsZSc7IHNpemU/OiBudW1iZXIgfSB8IHsgdHlwZTogJ2RpcicgfSwgb3JpZ2luYWxQYXRoOiBzdHJpbmcpIHtcblx0XHRpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGNyZWF0aW5nIEluZGV4ZWREQkZTTm9kZSAtLSBhZGRpbmcgZW1wdHkgcGF0aCAoZW5jb3VudGVyZWQgd2hpbGUgYWRkaW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodGhpcy5lbnRyeS50eXBlICE9PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKGBJbnRlcm5hbCBlcnJvciBjcmVhdGluZyBJbmRleGVkREJGU05vZGUgLS0gcGFyZW50IGlzIG5vdCBhIGRpcmVjdG9yeSAoZW5jb3VudGVyZWQgd2hpbGUgYWRkaW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IHBhdGhQYXJ0c1swXTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5lbnRyeS5jaGlsZHJlbi5nZXQobmV4dCk7XG5cdFx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ2RpcicpIHtcblx0XHRcdFx0aWYgKGV4aXN0aW5nPy5lbnRyeS50eXBlID09PSBGaWxlVHlwZS5GaWxlKSB7XG5cdFx0XHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGNyZWF0aW5nIEluZGV4ZWREQkZTTm9kZSAtLSBvdmVyd3JpdGluZyBmaWxlIHdpdGggZGlyZWN0b3J5OiAke3RoaXMuZW50cnkucGF0aH0vJHtuZXh0fSAoZW5jb3VudGVyZWQgd2hpbGUgYWRkaW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVudHJ5LmNoaWxkcmVuLnNldChuZXh0LCBleGlzdGluZyA/PyBuZXcgSW5kZXhlZERCRmlsZVN5c3RlbU5vZGUoe1xuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkRpcmVjdG9yeSxcblx0XHRcdFx0XHRwYXRoOiB0aGlzLmVudHJ5LnBhdGggKyAnLycgKyBuZXh0LFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBuZXcgTWFwKCksXG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChleGlzdGluZz8uZW50cnkudHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGNyZWF0aW5nIEluZGV4ZWREQkZTTm9kZSAtLSBvdmVyd3JpdGluZyBkaXJlY3Rvcnkgd2l0aCBmaWxlOiAke3RoaXMuZW50cnkucGF0aH0vJHtuZXh0fSAoZW5jb3VudGVyZWQgd2hpbGUgYWRkaW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVudHJ5LmNoaWxkcmVuLnNldChuZXh0LCBuZXcgSW5kZXhlZERCRmlsZVN5c3RlbU5vZGUoe1xuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0cGF0aDogdGhpcy5lbnRyeS5wYXRoICsgJy8nICsgbmV4dCxcblx0XHRcdFx0XHRzaXplOiBlbnRyeS5zaXplLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gcGF0aFBhcnRzWzBdO1xuXHRcdFx0bGV0IGNoaWxkTm9kZSA9IHRoaXMuZW50cnkuY2hpbGRyZW4uZ2V0KG5leHQpO1xuXHRcdFx0aWYgKCFjaGlsZE5vZGUpIHtcblx0XHRcdFx0Y2hpbGROb2RlID0gbmV3IEluZGV4ZWREQkZpbGVTeXN0ZW1Ob2RlKHtcblx0XHRcdFx0XHRjaGlsZHJlbjogbmV3IE1hcCgpLFxuXHRcdFx0XHRcdHBhdGg6IHRoaXMuZW50cnkucGF0aCArICcvJyArIG5leHQsXG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmVudHJ5LmNoaWxkcmVuLnNldChuZXh0LCBjaGlsZE5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY2hpbGROb2RlLnR5cGUgPT09IEZpbGVUeXBlLkZpbGUpIHtcblx0XHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGNyZWF0aW5nIEluZGV4ZWREQkZTTm9kZSAtLSBvdmVyd3JpdGluZyBmaWxlIGVudHJ5IHdpdGggZGlyZWN0b3J5OiAke3RoaXMuZW50cnkucGF0aH0vJHtuZXh0fSAoZW5jb3VudGVyZWQgd2hpbGUgYWRkaW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHRcdH1cblx0XHRcdGNoaWxkTm9kZS5kb0FkZChwYXRoUGFydHMuc2xpY2UoMSksIGVudHJ5LCBvcmlnaW5hbFBhdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaW50KGluZGVudGF0aW9uID0gJycpIHtcblx0XHRjb25zb2xlLmxvZyhpbmRlbnRhdGlvbiArIHRoaXMuZW50cnkucGF0aCk7XG5cdFx0aWYgKHRoaXMuZW50cnkudHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHR0aGlzLmVudHJ5LmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4gY2hpbGQucHJpbnQoaW5kZW50YXRpb24gKyAnICcpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluZGV4ZWREQkZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyA9XG5cdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGVcblx0XHR8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kXG5cdFx0fCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IGZhbHNlKSAvKiBDYXNlIFNlbnNpdGl2ZSAqLztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZXNCcm9hZGNhc3RDaGFubmVsOiBCcm9hZGNhc3REYXRhQ2hhbm5lbDxVcmlEdG88SUZpbGVDaGFuZ2U+W10+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlOiBFdmVudDxyZWFkb25seSBJRmlsZUNoYW5nZVtdPiA9IHRoaXMuX29uRGlkQ2hhbmdlRmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG10aW1lcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSBjYWNoZWRGaWxldHJlZTogUHJvbWlzZTxJbmRleGVkREJGaWxlU3lzdGVtTm9kZT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd3JpdGVNYW55VGhyb3R0bGVyOiBUaHJvdHRsZXI7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgc2NoZW1lOiBzdHJpbmcsIHByaXZhdGUgaW5kZXhlZERCOiBJbmRleGVkREIsIHByaXZhdGUgcmVhZG9ubHkgc3RvcmU6IHN0cmluZywgd2F0Y2hDcm9zc1dpbmRvd0NoYW5nZXM6IGJvb2xlYW4pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMud3JpdGVNYW55VGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXG5cdFx0aWYgKHdhdGNoQ3Jvc3NXaW5kb3dDaGFuZ2VzKSB7XG5cdFx0XHR0aGlzLmNoYW5nZXNCcm9hZGNhc3RDaGFubmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb2FkY2FzdERhdGFDaGFubmVsPFVyaUR0bzxJRmlsZUNoYW5nZT5bXT4oYHZzY29kZS5pbmRleGVkREIuJHtzY2hlbWV9LmNoYW5nZXNgKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5nZXNCcm9hZGNhc3RDaGFubmVsLm9uRGlkUmVjZWl2ZURhdGEoY2hhbmdlcyA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmlsZS5maXJlKGNoYW5nZXMubWFwKGMgPT4gKHsgdHlwZTogYy50eXBlLCByZXNvdXJjZTogVVJJLnJldml2ZShjLnJlc291cmNlKSB9KSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdGFzeW5jIG1rZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VTdGF0ID0gYXdhaXQgdGhpcy5zdGF0KHJlc291cmNlKTtcblx0XHRcdGlmIChyZXNvdXJjZVN0YXQudHlwZSA9PT0gRmlsZVR5cGUuRmlsZSkge1xuXHRcdFx0XHR0aHJvdyBFUlJfRklMRV9OT1RfRElSO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0KGF3YWl0IHRoaXMuZ2V0RmlsZXRyZWUoKSkuYWRkKHJlc291cmNlLnBhdGgsIHsgdHlwZTogJ2RpcicgfSk7XG5cdH1cblxuXHRhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0Y29uc3QgZW50cnkgPSAoYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpKS5yZWFkKHJlc291cmNlLnBhdGgpO1xuXG5cdFx0aWYgKGVudHJ5Py50eXBlID09PSBGaWxlVHlwZS5GaWxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0bXRpbWU6IHRoaXMubXRpbWVzLmdldChyZXNvdXJjZS50b1N0cmluZygpKSB8fCAwLFxuXHRcdFx0XHRzaXplOiBlbnRyeS5zaXplID8/IChhd2FpdCB0aGlzLnJlYWRGaWxlKHJlc291cmNlKSkuYnl0ZUxlbmd0aFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZW50cnk/LnR5cGUgPT09IEZpbGVUeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0bXRpbWU6IDAsXG5cdFx0XHRcdHNpemU6IDBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhyb3cgRVJSX0ZJTEVfTk9UX0ZPVU5EO1xuXHR9XG5cblx0YXN5bmMgcmVhZGRpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxEaXJFbnRyeVtdPiB7XG5cdFx0Y29uc3QgZW50cnkgPSAoYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpKS5yZWFkKHJlc291cmNlLnBhdGgpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdC8vIERpcnMgYXJlbid0IHNhdmVkIHRvIGRpc2ssIHNvIGVtcHR5IGRpcnMgd2lsbCBiZSBsb3N0IG9uIHJlbG9hZC5cblx0XHRcdC8vIFRodXMgd2UgaGF2ZSB0d28gb3B0aW9ucyBmb3Igd2hhdCBoYXBwZW5zIHdoZW4geW91IHRyeSB0byByZWFkIGEgZGlyIGFuZCBub3RoaW5nIGlzIGZvdW5kOlxuXHRcdFx0Ly8gLSBUaHJvdyBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kXG5cdFx0XHQvLyAtIFJldHVybiBbXVxuXHRcdFx0Ly8gV2UgY2hvb3NlIHRvIHJldHVybiBbXSBhcyBjcmVhdGluZyBhIGRpciB0aGVuIHJlYWRpbmcgaXQgKGV2ZW4gYWZ0ZXIgcmVsb2FkKSBzaG91bGQgbm90IHRocm93IGFuIGVycm9yLlxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAoZW50cnkudHlwZSAhPT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBFUlJfRklMRV9OT1RfRElSO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBbLi4uZW50cnkuY2hpbGRyZW4uZW50cmllcygpXS5tYXAoKFtuYW1lLCBub2RlXSkgPT4gW25hbWUsIG5vZGUudHlwZV0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmluZGV4ZWREQi5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkb25seScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLmdldChyZXNvdXJjZS5wYXRoKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBFUlJfRklMRV9OT1RfRk9VTkQ7XG5cdFx0fVxuXHRcdGNvbnN0IGJ1ZmZlciA9IHJlc3VsdCBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyByZXN1bHQgOiBpc1N0cmluZyhyZXN1bHQpID8gVlNCdWZmZXIuZnJvbVN0cmluZyhyZXN1bHQpLmJ1ZmZlciA6IHVuZGVmaW5lZDtcblx0XHRpZiAoYnVmZmVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKGBJbmRleGVkREIgZW50cnkgYXQgXCIke3Jlc291cmNlLnBhdGh9XCIgaW4gdW5leHBlY3RlZCBmb3JtYXRgKTtcblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgY2FjaGVcblx0XHRjb25zdCBmaWxlVHJlZSA9IGF3YWl0IHRoaXMuZ2V0RmlsZXRyZWUoKTtcblx0XHRmaWxlVHJlZS5hZGQocmVzb3VyY2UucGF0aCwgeyB0eXBlOiAnZmlsZScsIHNpemU6IGJ1ZmZlci5ieXRlTGVuZ3RoIH0pO1xuXG5cdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxuXG5cdGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdGhpcy5zdGF0KHJlc291cmNlKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmIChleGlzdGluZz8udHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBFUlJfRklMRV9JU19ESVI7XG5cdFx0fVxuXG5cdFx0bGV0IGZpbmFsQ29udGVudCA9IGNvbnRlbnQ7XG5cdFx0aWYgKG9wdHMuYXBwZW5kICYmIGV4aXN0aW5nKSB7XG5cdFx0XHQvLyBSZWFkIGV4aXN0aW5nIGNvbnRlbnQgYW5kIGFwcGVuZCBuZXcgY29udGVudCB0byBpdFxuXHRcdFx0Y29uc3QgZXhpc3RpbmdDb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjb21iaW5lZCA9IG5ldyBVaW50OEFycmF5KGV4aXN0aW5nQ29udGVudC5ieXRlTGVuZ3RoICsgY29udGVudC5ieXRlTGVuZ3RoKTtcblx0XHRcdGNvbWJpbmVkLnNldChleGlzdGluZ0NvbnRlbnQsIDApO1xuXHRcdFx0Y29tYmluZWQuc2V0KGNvbnRlbnQsIGV4aXN0aW5nQ29udGVudC5ieXRlTGVuZ3RoKTtcblx0XHRcdGZpbmFsQ29udGVudCA9IGNvbWJpbmVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuYnVsa1dyaXRlKFtbcmVzb3VyY2UsIGZpbmFsQ29udGVudF1dKTtcblx0fVxuXG5cdGFzeW5jIHJlbmFtZShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVUcmVlID0gYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpO1xuXHRcdGNvbnN0IGZyb21FbnRyeSA9IGZpbGVUcmVlLnJlYWQoZnJvbS5wYXRoKTtcblx0XHRpZiAoIWZyb21FbnRyeSkge1xuXHRcdFx0dGhyb3cgRVJSX0ZJTEVfTk9UX0ZPVU5EO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvRW50cnkgPSBmaWxlVHJlZS5yZWFkKHRvLnBhdGgpO1xuXHRcdGlmICh0b0VudHJ5KSB7XG5cdFx0XHRpZiAoIW9wdHMub3ZlcndyaXRlKSB7XG5cdFx0XHRcdHRocm93IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKCdmaWxlIGV4aXN0cyBhbHJlYWR5JywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvRW50cnkudHlwZSAhPT0gZnJvbUVudHJ5LnR5cGUpIHtcblx0XHRcdFx0dGhyb3cgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoJ0Nhbm5vdCByZW5hbWUgZmlsZXMgd2l0aCBkaWZmZXJlbnQgdHlwZXMnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bik7XG5cdFx0XHR9XG5cdFx0XHQvLyBkZWxldGUgdGhlIHRhcmdldCBmaWxlIGlmIGV4aXN0c1xuXHRcdFx0YXdhaXQgdGhpcy5kZWxldGUodG8sIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9UYXJnZXRSZXNvdXJjZSA9IChwYXRoOiBzdHJpbmcpOiBVUkkgPT4gdGhpcy5leHRVcmkuam9pblBhdGgodG8sIHRoaXMuZXh0VXJpLnJlbGF0aXZlUGF0aChmcm9tLCBmcm9tLndpdGgoeyBwYXRoIH0pKSB8fCAnJyk7XG5cblx0XHRjb25zdCBzb3VyY2VFbnRyaWVzID0gYXdhaXQgdGhpcy50cmVlKGZyb20pO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGVzOiBEaXJFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzb3VyY2VFbnRyeSBvZiBzb3VyY2VFbnRyaWVzKSB7XG5cdFx0XHRpZiAoc291cmNlRW50cnlbMV0gPT09IEZpbGVUeXBlLkZpbGUpIHtcblx0XHRcdFx0c291cmNlRmlsZXMucHVzaChzb3VyY2VFbnRyeSk7XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZUVudHJ5WzFdID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0Ly8gYWRkIGRpcmVjdG9yaWVzIHRvIHRoZSB0cmVlXG5cdFx0XHRcdGZpbGVUcmVlLmFkZCh0b1RhcmdldFJlc291cmNlKHNvdXJjZUVudHJ5WzBdKS5wYXRoLCB7IHR5cGU6ICdkaXInIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzb3VyY2VGaWxlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHRhcmdldEZpbGVzOiBbVVJJLCBVaW50OEFycmF5XVtdID0gW107XG5cdFx0XHRjb25zdCBzb3VyY2VGaWxlc0NvbnRlbnRzID0gYXdhaXQgdGhpcy5pbmRleGVkREIucnVuSW5UcmFuc2FjdGlvbih0aGlzLnN0b3JlLCAncmVhZG9ubHknLCBvYmplY3RTdG9yZSA9PiBzb3VyY2VGaWxlcy5tYXAoKFtwYXRoXSkgPT4gb2JqZWN0U3RvcmUuZ2V0KHBhdGgpKSk7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc291cmNlRmlsZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBzb3VyY2VGaWxlc0NvbnRlbnRzW2luZGV4XSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyBzb3VyY2VGaWxlc0NvbnRlbnRzW2luZGV4XSA6IGlzU3RyaW5nKHNvdXJjZUZpbGVzQ29udGVudHNbaW5kZXhdKSA/IFZTQnVmZmVyLmZyb21TdHJpbmcoc291cmNlRmlsZXNDb250ZW50c1tpbmRleF0pLmJ1ZmZlciA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHR0YXJnZXRGaWxlcy5wdXNoKFt0b1RhcmdldFJlc291cmNlKHNvdXJjZUZpbGVzW2luZGV4XVswXSksIGNvbnRlbnRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5idWxrV3JpdGUodGFyZ2V0RmlsZXMpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZGVsZXRlKGZyb20sIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHN0YXQ6IElTdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5zdGF0KHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZS5jb2RlID09PSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXG5cdFx0bGV0IHRvRGVsZXRlOiBzdHJpbmdbXTtcblx0XHRpZiAob3B0cy5yZWN1cnNpdmUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSBhd2FpdCB0aGlzLnRyZWUocmVzb3VyY2UpO1xuXHRcdFx0dG9EZWxldGUgPSB0cmVlLm1hcCgoW3BhdGhdKSA9PiBwYXRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHN0YXQudHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5ICYmIChhd2FpdCB0aGlzLnJlYWRkaXIocmVzb3VyY2UpKS5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgRVJSX0RJUl9OT1RfRU1QVFk7XG5cdFx0XHR9XG5cdFx0XHR0b0RlbGV0ZSA9IFtyZXNvdXJjZS5wYXRoXTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5kZWxldGVLZXlzKHRvRGVsZXRlKTtcblx0XHQoYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpKS5kZWxldGUocmVzb3VyY2UucGF0aCk7XG5cdFx0dG9EZWxldGUuZm9yRWFjaChrZXkgPT4gdGhpcy5tdGltZXMuZGVsZXRlKGtleSkpO1xuXHRcdHRoaXMudHJpZ2dlckNoYW5nZXModG9EZWxldGUubWFwKHBhdGggPT4gKHsgcmVzb3VyY2U6IHJlc291cmNlLndpdGgoeyBwYXRoIH0pLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyZWUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8RGlyRW50cnlbXT4ge1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLnN0YXQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGFsbEVudHJpZXM6IERpckVudHJ5W10gPSBbW3Jlc291cmNlLnBhdGgsIHN0YXQudHlwZV1dO1xuXHRcdGlmIChzdGF0LnR5cGUgPT09IEZpbGVUeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0Y29uc3QgZGlyRW50cmllcyA9IGF3YWl0IHRoaXMucmVhZGRpcihyZXNvdXJjZSk7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHR5cGVdIG9mIGRpckVudHJpZXMpIHtcblx0XHRcdFx0Y29uc3QgY2hpbGRSZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHJlc291cmNlLCBrZXkpO1xuXHRcdFx0XHRhbGxFbnRyaWVzLnB1c2goW2NoaWxkUmVzb3VyY2UucGF0aCwgdHlwZV0pO1xuXHRcdFx0XHRpZiAodHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRFbnRyaWVzID0gYXdhaXQgdGhpcy50cmVlKGNoaWxkUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGFsbEVudHJpZXMucHVzaCguLi5jaGlsZEVudHJpZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhbGxFbnRyaWVzO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmlnZ2VyQ2hhbmdlcyhjaGFuZ2VzOiBJRmlsZUNoYW5nZVtdKTogdm9pZCB7XG5cdFx0aWYgKGNoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbGUuZmlyZShjaGFuZ2VzKTtcblxuXHRcdFx0dGhpcy5jaGFuZ2VzQnJvYWRjYXN0Q2hhbm5lbD8ucG9zdERhdGEoY2hhbmdlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRGaWxldHJlZSgpOiBQcm9taXNlPEluZGV4ZWREQkZpbGVTeXN0ZW1Ob2RlPiB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlZEZpbGV0cmVlKSB7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGV0cmVlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgcm9vdE5vZGUgPSBuZXcgSW5kZXhlZERCRmlsZVN5c3RlbU5vZGUoe1xuXHRcdFx0XHRcdGNoaWxkcmVuOiBuZXcgTWFwKCksXG5cdFx0XHRcdFx0cGF0aDogJycsXG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmluZGV4ZWREQi5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkb25seScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLmdldEFsbEtleXMoKSk7XG5cdFx0XHRcdGNvbnN0IGtleXMgPSByZXN1bHQubWFwKGtleSA9PiBrZXkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGtleXMuZm9yRWFjaChrZXkgPT4gcm9vdE5vZGUuYWRkKGtleSwgeyB0eXBlOiAnZmlsZScgfSkpO1xuXHRcdFx0XHRyZXR1cm4gcm9vdE5vZGU7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jYWNoZWRGaWxldHJlZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYnVsa1dyaXRlKGZpbGVzOiBbVVJJLCBVaW50OEFycmF5XVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZmlsZXMuZm9yRWFjaCgoW3Jlc291cmNlLCBjb250ZW50XSkgPT4gdGhpcy5maWxlV3JpdGVCYXRjaC5wdXNoKHsgY29udGVudCwgcmVzb3VyY2UgfSkpO1xuXHRcdGF3YWl0IHRoaXMud3JpdGVNYW55VGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMud3JpdGVNYW55KCkpO1xuXG5cdFx0Y29uc3QgZmlsZVRyZWUgPSBhd2FpdCB0aGlzLmdldEZpbGV0cmVlKCk7XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIGNvbnRlbnRdIG9mIGZpbGVzKSB7XG5cdFx0XHRmaWxlVHJlZS5hZGQocmVzb3VyY2UucGF0aCwgeyB0eXBlOiAnZmlsZScsIHNpemU6IGNvbnRlbnQuYnl0ZUxlbmd0aCB9KTtcblx0XHRcdHRoaXMubXRpbWVzLnNldChyZXNvdXJjZS50b1N0cmluZygpLCBEYXRlLm5vdygpKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXJDaGFuZ2VzKGZpbGVzLm1hcCgoW3Jlc291cmNlXSkgPT4gKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSkpKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsZVdyaXRlQmF0Y2g6IHsgcmVzb3VyY2U6IFVSSTsgY29udGVudDogVWludDhBcnJheSB9W10gPSBbXTtcblx0cHJpdmF0ZSBhc3luYyB3cml0ZU1hbnkoKSB7XG5cdFx0aWYgKHRoaXMuZmlsZVdyaXRlQmF0Y2gubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBmaWxlQmF0Y2ggPSB0aGlzLmZpbGVXcml0ZUJhdGNoLnNwbGljZSgwLCB0aGlzLmZpbGVXcml0ZUJhdGNoLmxlbmd0aCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmluZGV4ZWREQi5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkd3JpdGUnLCBvYmplY3RTdG9yZSA9PiBmaWxlQmF0Y2gubWFwKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gb2JqZWN0U3RvcmUucHV0KGVudHJ5LmNvbnRlbnQsIGVudHJ5LnJlc291cmNlLnBhdGgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0XHRpZiAoZXggaW5zdGFuY2VvZiBET01FeGNlcHRpb24gJiYgZXgubmFtZSA9PT0gJ1F1b3RhRXhjZWVkZWRFcnJvcicpIHtcblx0XHRcdFx0XHR0aHJvdyBFUlJfRklMRV9FWENFRURTX1NUT1JBR0VfUVVPVEE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBleDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZUtleXMoa2V5czogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuaW5kZXhlZERCLnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWR3cml0ZScsIG9iamVjdFN0b3JlID0+IGtleXMubWFwKGtleSA9PiBvYmplY3RTdG9yZS5kZWxldGUoa2V5KSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc2V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5kZXhlZERCLnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWR3cml0ZScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLmNsZWFyKCkpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCLGdCQUEyRCxnQ0FBZ0MsNkJBQTZCLGdCQUFzSDtBQUV0UixTQUFTLDRCQUE0QjtBQUdyQyxNQUFNLHFCQUFxQiw4QkFBOEIsU0FBUyxpQkFBaUIscUJBQXFCLEdBQUcsNEJBQTRCLFlBQVk7QUFDbkosTUFBTSxrQkFBa0IsOEJBQThCLFNBQVMsbUJBQW1CLG1CQUFtQixHQUFHLDRCQUE0QixnQkFBZ0I7QUFDcEosTUFBTSxtQkFBbUIsOEJBQThCLFNBQVMsb0JBQW9CLHlCQUF5QixHQUFH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
