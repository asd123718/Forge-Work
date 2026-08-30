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
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { equals, deepClone } from "../../../../base/common/objects.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { IFileService, FileOperationResult } from "../../../../platform/files/common/files.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { isReadableStream, peekStream } from "../../../../base/common/stream.js";
import { bufferToStream, prefixedBufferReadable, prefixedBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Schemas } from "../../../../base/common/network.js";
import { hash } from "../../../../base/common/hash.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { NO_TYPE_ID } from "./workingCopy.js";
class WorkingCopyBackupsModel {
  constructor(backupRoot, fileService) {
    this.backupRoot = backupRoot;
    this.fileService = fileService;
    this.cache = new ResourceMap();
  }
  static async create(backupRoot, fileService) {
    const model = new WorkingCopyBackupsModel(backupRoot, fileService);
    await model.resolve();
    return model;
  }
  async resolve() {
    try {
      const backupRootStat = await this.fileService.resolve(this.backupRoot);
      if (backupRootStat.children) {
        await Promises.settled(backupRootStat.children.filter((child) => child.isDirectory).map(async (backupSchemaFolder) => {
          const backupSchemaFolderStat = await this.fileService.resolve(backupSchemaFolder.resource);
          if (backupSchemaFolderStat.children) {
            for (const backupForSchema of backupSchemaFolderStat.children) {
              if (!backupForSchema.isDirectory) {
                this.add(backupForSchema.resource);
              }
            }
          }
        }));
      }
    } catch (error) {
    }
  }
  add(resource, versionId = 0, meta) {
    this.cache.set(resource, {
      versionId,
      meta: deepClone(meta)
    });
  }
  update(resource, meta) {
    const entry = this.cache.get(resource);
    if (entry) {
      entry.meta = deepClone(meta);
    }
  }
  count() {
    return this.cache.size;
  }
  has(resource, versionId, meta) {
    const entry = this.cache.get(resource);
    if (!entry) {
      return false;
    }
    if (typeof versionId === "number" && versionId !== entry.versionId) {
      return false;
    }
    if (meta && !equals(meta, entry.meta)) {
      return false;
    }
    return true;
  }
  get() {
    return Array.from(this.cache.keys());
  }
  remove(resource) {
    this.cache.delete(resource);
  }
  clear() {
    this.cache.clear();
  }
}
let WorkingCopyBackupService = class extends Disposable {
  constructor(backupWorkspaceHome, fileService, logService) {
    super();
    this.fileService = fileService;
    this.logService = logService;
    this.impl = this._register(this.initialize(backupWorkspaceHome));
  }
  initialize(backupWorkspaceHome) {
    if (backupWorkspaceHome) {
      return new WorkingCopyBackupServiceImpl(backupWorkspaceHome, this.fileService, this.logService);
    }
    return new InMemoryWorkingCopyBackupService();
  }
  reinitialize(backupWorkspaceHome) {
    if (this.impl instanceof WorkingCopyBackupServiceImpl) {
      if (backupWorkspaceHome) {
        this.impl.initialize(backupWorkspaceHome);
      } else {
        this.impl = new InMemoryWorkingCopyBackupService();
      }
    }
  }
  hasBackupSync(identifier, versionId, meta) {
    return this.impl.hasBackupSync(identifier, versionId, meta);
  }
  backup(identifier, content, versionId, meta, token) {
    return this.impl.backup(identifier, content, versionId, meta, token);
  }
  discardBackup(identifier, token) {
    return this.impl.discardBackup(identifier, token);
  }
  discardBackups(filter) {
    return this.impl.discardBackups(filter);
  }
  getBackups() {
    return this.impl.getBackups();
  }
  resolve(identifier) {
    return this.impl.resolve(identifier);
  }
  toBackupResource(identifier) {
    return this.impl.toBackupResource(identifier);
  }
  joinBackups() {
    return this.impl.joinBackups();
  }
};
WorkingCopyBackupService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], WorkingCopyBackupService);
let WorkingCopyBackupServiceImpl = class extends Disposable {
  constructor(backupWorkspaceHome, fileService, logService) {
    super();
    this.backupWorkspaceHome = backupWorkspaceHome;
    this.fileService = fileService;
    this.logService = logService;
    this.ioOperationQueues = this._register(new ResourceQueue());
    this.model = void 0;
    this.initialize(backupWorkspaceHome);
  }
  initialize(backupWorkspaceResource) {
    this.backupWorkspaceHome = backupWorkspaceResource;
    this.ready = this.doInitialize();
  }
  async doInitialize() {
    this.model = await WorkingCopyBackupsModel.create(this.backupWorkspaceHome, this.fileService);
    return this.model;
  }
  hasBackupSync(identifier, versionId, meta) {
    if (!this.model) {
      return false;
    }
    const backupResource = this.toBackupResource(identifier);
    return this.model.has(backupResource, versionId, meta);
  }
  async backup(identifier, content, versionId, meta, token) {
    const model = await this.ready;
    if (token?.isCancellationRequested) {
      return;
    }
    const backupResource = this.toBackupResource(identifier);
    if (model.has(backupResource, versionId, meta)) {
      return;
    }
    return this.ioOperationQueues.queueFor(backupResource, async () => {
      if (token?.isCancellationRequested) {
        return;
      }
      if (model.has(backupResource, versionId, meta)) {
        return;
      }
      let preamble = this.createPreamble(identifier, meta);
      if (preamble.length >= WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH) {
        preamble = this.createPreamble(identifier);
      }
      const preambleBuffer = VSBuffer.fromString(preamble);
      let backupBuffer;
      if (isReadableStream(content)) {
        backupBuffer = prefixedBufferStream(preambleBuffer, content);
      } else if (content) {
        backupBuffer = prefixedBufferReadable(preambleBuffer, content);
      } else {
        backupBuffer = VSBuffer.concat([preambleBuffer, VSBuffer.fromString("")]);
      }
      await this.fileService.writeFile(backupResource, backupBuffer);
      model.add(backupResource, versionId, meta);
    });
  }
  createPreamble(identifier, meta) {
    return `${identifier.resource.toString()}${WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR}${JSON.stringify({ ...meta, typeId: identifier.typeId })}${WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER}`;
  }
  async discardBackups(filter) {
    const model = await this.ready;
    const except = filter?.except;
    if (Array.isArray(except) && except.length > 0) {
      const exceptMap = new ResourceMap();
      for (const exceptWorkingCopy of except) {
        exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
      }
      await Promises.settled(model.get().map(async (backupResource) => {
        if (!exceptMap.has(backupResource)) {
          await this.doDiscardBackup(backupResource);
        }
      }));
    } else {
      await this.deleteIgnoreFileNotFound(this.backupWorkspaceHome);
      model.clear();
    }
  }
  discardBackup(identifier, token) {
    const backupResource = this.toBackupResource(identifier);
    return this.doDiscardBackup(backupResource, token);
  }
  async doDiscardBackup(backupResource, token) {
    const model = await this.ready;
    if (token?.isCancellationRequested) {
      return;
    }
    return this.ioOperationQueues.queueFor(backupResource, async () => {
      if (token?.isCancellationRequested) {
        return;
      }
      await this.deleteIgnoreFileNotFound(backupResource);
      model.remove(backupResource);
    });
  }
  async deleteIgnoreFileNotFound(backupResource) {
    try {
      await this.fileService.del(backupResource, { recursive: true });
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
  }
  async getBackups() {
    const model = await this.ready;
    await this.joinBackups();
    const backups = await Promise.all(model.get().map((backupResource) => this.resolveIdentifier(backupResource, model)));
    return coalesce(backups);
  }
  async resolveIdentifier(backupResource, model) {
    let res = void 0;
    await this.ioOperationQueues.queueFor(backupResource, async () => {
      if (!model.has(backupResource)) {
        return;
      }
      const backupPreamble = await this.readToMatchingString(backupResource, WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER, WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH);
      if (!backupPreamble) {
        return;
      }
      const metaStartIndex = backupPreamble.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);
      let resourcePreamble;
      let metaPreamble;
      if (metaStartIndex > 0) {
        resourcePreamble = backupPreamble.substring(0, metaStartIndex);
        metaPreamble = backupPreamble.substr(metaStartIndex + 1);
      } else {
        resourcePreamble = backupPreamble;
        metaPreamble = void 0;
      }
      const { typeId, meta } = this.parsePreambleMeta(metaPreamble);
      model.update(backupResource, meta);
      res = {
        typeId: typeId ?? NO_TYPE_ID,
        resource: URI.parse(resourcePreamble)
      };
    });
    return res;
  }
  async readToMatchingString(backupResource, matchingString, maximumBytesToRead) {
    const contents = (await this.fileService.readFile(backupResource, { length: maximumBytesToRead })).value.toString();
    const matchingStringIndex = contents.indexOf(matchingString);
    if (matchingStringIndex >= 0) {
      return contents.substr(0, matchingStringIndex);
    }
    return void 0;
  }
  async resolve(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const model = await this.ready;
    let res = void 0;
    await this.ioOperationQueues.queueFor(backupResource, async () => {
      if (!model.has(backupResource)) {
        return;
      }
      const backupStream = await this.fileService.readFileStream(backupResource);
      const peekedBackupStream = await peekStream(backupStream.value, 1);
      const firstBackupChunk = VSBuffer.concat(peekedBackupStream.buffer);
      const preambleEndIndex = firstBackupChunk.buffer.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER_CHARCODE);
      if (preambleEndIndex === -1) {
        this.logService.trace(`Backup: Could not find meta end marker in ${backupResource}. The file is probably corrupt (filesize: ${backupStream.size}).`);
        return void 0;
      }
      const preambelRaw = firstBackupChunk.slice(0, preambleEndIndex).toString();
      let meta;
      const metaStartIndex = preambelRaw.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);
      if (metaStartIndex !== -1) {
        meta = this.parsePreambleMeta(preambelRaw.substr(metaStartIndex + 1)).meta;
      }
      model.update(backupResource, meta);
      const firstBackupChunkWithoutPreamble = firstBackupChunk.slice(preambleEndIndex + 1);
      let value;
      if (peekedBackupStream.ended) {
        value = bufferToStream(firstBackupChunkWithoutPreamble);
      } else {
        value = prefixedBufferStream(firstBackupChunkWithoutPreamble, peekedBackupStream.stream);
      }
      res = { value, meta };
    });
    return res;
  }
  parsePreambleMeta(preambleMetaRaw) {
    let typeId = void 0;
    let meta = void 0;
    if (preambleMetaRaw) {
      try {
        meta = JSON.parse(preambleMetaRaw);
        typeId = meta?.typeId;
        if (typeof meta?.typeId === "string") {
          delete meta.typeId;
          if (isEmptyObject(meta)) {
            meta = void 0;
          }
        }
      } catch (error) {
      }
    }
    return { typeId, meta };
  }
  toBackupResource(identifier) {
    return joinPath(this.backupWorkspaceHome, identifier.resource.scheme, hashIdentifier(identifier));
  }
  joinBackups() {
    return this.ioOperationQueues.whenDrained();
  }
};
WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER = "\n";
WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER_CHARCODE = "\n".charCodeAt(0);
WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR = " ";
// using a character that is know to be escaped in a URI as separator
WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH = 1e4;
WorkingCopyBackupServiceImpl = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], WorkingCopyBackupServiceImpl);
class InMemoryWorkingCopyBackupService extends Disposable {
  constructor() {
    super(...arguments);
    this.backups = new ResourceMap();
  }
  hasBackupSync(identifier, versionId) {
    const backupResource = this.toBackupResource(identifier);
    return this.backups.has(backupResource);
  }
  async backup(identifier, content, versionId, meta, token) {
    const backupResource = this.toBackupResource(identifier);
    this.backups.set(backupResource, {
      typeId: identifier.typeId,
      content: content instanceof VSBuffer ? content : content ? isReadableStream(content) ? await streamToBuffer(content) : readableToBuffer(content) : VSBuffer.fromString(""),
      meta
    });
  }
  async resolve(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const backup = this.backups.get(backupResource);
    if (backup) {
      return { value: bufferToStream(backup.content), meta: backup.meta };
    }
    return void 0;
  }
  async getBackups() {
    return Array.from(this.backups.entries()).map(([resource, backup]) => ({ typeId: backup.typeId, resource }));
  }
  async discardBackup(identifier) {
    this.backups.delete(this.toBackupResource(identifier));
  }
  async discardBackups(filter) {
    const except = filter?.except;
    if (Array.isArray(except) && except.length > 0) {
      const exceptMap = new ResourceMap();
      for (const exceptWorkingCopy of except) {
        exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
      }
      for (const backup of await this.getBackups()) {
        if (!exceptMap.has(this.toBackupResource(backup))) {
          await this.discardBackup(backup);
        }
      }
    } else {
      this.backups.clear();
    }
  }
  toBackupResource(identifier) {
    return URI.from({ scheme: Schemas.inMemory, path: hashIdentifier(identifier) });
  }
  async joinBackups() {
    return;
  }
}
function hashIdentifier(identifier) {
  let resource;
  if (identifier.typeId.length > 0) {
    const typeIdHash = hashString(identifier.typeId);
    if (identifier.resource.path) {
      resource = joinPath(identifier.resource, typeIdHash);
    } else {
      resource = identifier.resource.with({ path: typeIdHash });
    }
  } else {
    resource = identifier.resource;
  }
  return hashPath(resource);
}
function hashPath(resource) {
  const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
  return hashString(str);
}
function hashString(str) {
  return hash(str).toString(16);
}
export {
  InMemoryWorkingCopyBackupService,
  WorkingCopyBackupService,
  WorkingCopyBackupsModel,
  hashIdentifier
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFx3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXAsIElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5QmFja3VwLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGlzUmVhZGFibGVTdHJlYW0sIHBlZWtTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9TdHJlYW0sIHByZWZpeGVkQnVmZmVyUmVhZGFibGUsIHByZWZpeGVkQnVmZmVyU3RyZWFtLCByZWFkYWJsZVRvQnVmZmVyLCBzdHJlYW1Ub0J1ZmZlciwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGlzRW1wdHlPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBOT19UWVBFX0lEIH0gZnJvbSAnLi93b3JraW5nQ29weS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXb3JraW5nQ29weUJhY2t1cHNNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDx7IHZlcnNpb25JZD86IG51bWJlcjsgbWV0YT86IElXb3JraW5nQ29weUJhY2t1cE1ldGEgfT4oKTtcblxuXHRzdGF0aWMgYXN5bmMgY3JlYXRlKGJhY2t1cFJvb3Q6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8V29ya2luZ0NvcHlCYWNrdXBzTW9kZWw+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBXb3JraW5nQ29weUJhY2t1cHNNb2RlbChiYWNrdXBSb290LCBmaWxlU2VydmljZSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHByaXZhdGUgYmFja3VwUm9vdDogVVJJLCBwcml2YXRlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpIHsgfVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYmFja3VwUm9vdFN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5iYWNrdXBSb290KTtcblx0XHRcdGlmIChiYWNrdXBSb290U3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGJhY2t1cFJvb3RTdGF0LmNoaWxkcmVuXG5cdFx0XHRcdFx0LmZpbHRlcihjaGlsZCA9PiBjaGlsZC5pc0RpcmVjdG9yeSlcblx0XHRcdFx0XHQubWFwKGFzeW5jIGJhY2t1cFNjaGVtYUZvbGRlciA9PiB7XG5cblx0XHRcdFx0XHRcdC8vIFJlYWQgYmFja3VwIGRpcmVjdG9yeSBmb3IgYmFja3Vwc1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFja3VwU2NoZW1hRm9sZGVyU3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShiYWNrdXBTY2hlbWFGb2xkZXIucmVzb3VyY2UpO1xuXG5cdFx0XHRcdFx0XHQvLyBSZW1lbWJlciBrbm93biBiYWNrdXBzIGluIG91ciBjYWNoZXNcblx0XHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0XHQvLyBOb3RlOiB0aGlzIGRvZXMgTk9UIGFjY291bnQgZm9yIHJlc29sdmluZ1xuXHRcdFx0XHRcdFx0Ly8gYXNzb2NpYXRlZCBtZXRhIGRhdGEgYmVjYXVzZSB0aGF0IHJlcXVpcmVzXG5cdFx0XHRcdFx0XHQvLyBvcGVuaW5nIHRoZSBiYWNrdXAgYW5kIHJlYWRpbmcgdGhlIG1ldGFcblx0XHRcdFx0XHRcdC8vIHByZWFtYmxlLiBJbnN0ZWFkLCB3aGVuIGJhY2t1cHMgYXJlIGFjdHVhbGx5XG5cdFx0XHRcdFx0XHQvLyByZXNvbHZlZCwgdGhlIG1ldGEgZGF0YSB3aWxsIGJlIGFkZGVkIHZpYVxuXHRcdFx0XHRcdFx0Ly8gYWRkaXRpb25hbCBgdXBkYXRlYCBjYWxscy5cblx0XHRcdFx0XHRcdGlmIChiYWNrdXBTY2hlbWFGb2xkZXJTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgYmFja3VwRm9yU2NoZW1hIG9mIGJhY2t1cFNjaGVtYUZvbGRlclN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWJhY2t1cEZvclNjaGVtYS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5hZGQoYmFja3VwRm9yU2NoZW1hLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZSBhbnkgZXJyb3JzXG5cdFx0fVxuXHR9XG5cblx0YWRkKHJlc291cmNlOiBVUkksIHZlcnNpb25JZCA9IDAsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZS5zZXQocmVzb3VyY2UsIHtcblx0XHRcdHZlcnNpb25JZCxcblx0XHRcdG1ldGE6IGRlZXBDbG9uZShtZXRhKVxuXHRcdH0pO1xuXHR9XG5cblx0dXBkYXRlKHJlc291cmNlOiBVUkksIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmNhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRlbnRyeS5tZXRhID0gZGVlcENsb25lKG1ldGEpO1xuXHRcdH1cblx0fVxuXG5cdGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGUuc2l6ZTtcblx0fVxuXG5cdGhhcyhyZXNvdXJjZTogVVJJLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmNhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB1bmtub3duIHJlc291cmNlXG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2ZXJzaW9uSWQgPT09ICdudW1iZXInICYmIHZlcnNpb25JZCAhPT0gZW50cnkudmVyc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGRpZmZlcmVudCB2ZXJzaW9uSWRcblx0XHR9XG5cblx0XHRpZiAobWV0YSAmJiAhZXF1YWxzKG1ldGEsIGVudHJ5Lm1ldGEpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGRpZmZlcmVudCBtZXRhZGF0YVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0KCk6IFVSSVtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmNhY2hlLmtleXMoKSk7XG5cdH1cblxuXHRyZW1vdmUocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGUuZGVsZXRlKHJlc291cmNlKTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGUuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaW1wbDogV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbCB8IEluTWVtb3J5V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGJhY2t1cFdvcmtzcGFjZUhvbWU6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmltcGwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluaXRpYWxpemUoYmFja3VwV29ya3NwYWNlSG9tZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplKGJhY2t1cFdvcmtzcGFjZUhvbWU6IFVSSSB8IHVuZGVmaW5lZCk6IFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwgfCBJbk1lbW9yeVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB7XG5cdFx0aWYgKGJhY2t1cFdvcmtzcGFjZUhvbWUpIHtcblx0XHRcdHJldHVybiBuZXcgV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbChiYWNrdXBXb3Jrc3BhY2VIb21lLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgSW5NZW1vcnlXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UoKTtcblx0fVxuXG5cdHJlaW5pdGlhbGl6ZShiYWNrdXBXb3Jrc3BhY2VIb21lOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblxuXHRcdC8vIFJlLWluaXQgaW1wbGVtZW50YXRpb24gKHVubGVzcyB3ZSBhcmUgcnVubmluZyBpbi1tZW1vcnkpXG5cdFx0aWYgKHRoaXMuaW1wbCBpbnN0YW5jZW9mIFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwpIHtcblx0XHRcdGlmIChiYWNrdXBXb3Jrc3BhY2VIb21lKSB7XG5cdFx0XHRcdHRoaXMuaW1wbC5pbml0aWFsaXplKGJhY2t1cFdvcmtzcGFjZUhvbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5pbXBsID0gbmV3IEluTWVtb3J5V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGFzQmFja3VwU3luYyhpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW1wbC5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIsIHZlcnNpb25JZCwgbWV0YSk7XG5cdH1cblxuXHRiYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudD86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW1wbC5iYWNrdXAoaWRlbnRpZmllciwgY29udGVudCwgdmVyc2lvbklkLCBtZXRhLCB0b2tlbik7XG5cdH1cblxuXHRkaXNjYXJkQmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLmRpc2NhcmRCYWNrdXAoaWRlbnRpZmllciwgdG9rZW4pO1xuXHR9XG5cblx0ZGlzY2FyZEJhY2t1cHMoZmlsdGVyPzogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW1wbC5kaXNjYXJkQmFja3VwcyhmaWx0ZXIpO1xuXHR9XG5cblx0Z2V0QmFja3VwcygpOiBQcm9taXNlPElXb3JraW5nQ29weUlkZW50aWZpZXJbXT4ge1xuXHRcdHJldHVybiB0aGlzLmltcGwuZ2V0QmFja3VwcygpO1xuXHR9XG5cblx0cmVzb2x2ZTxUIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YT4oaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8SVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXA8VD4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLnJlc29sdmUoaWRlbnRpZmllcik7XG5cdH1cblxuXHR0b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLmltcGwudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblx0fVxuXG5cdGpvaW5CYWNrdXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmltcGwuam9pbkJhY2t1cHMoKTtcblx0fVxufVxuXG5jbGFzcyBXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUFNQkxFX0VORF9NQVJLRVIgPSAnXFxuJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJFQU1CTEVfRU5EX01BUktFUl9DSEFSQ09ERSA9ICdcXG4nLmNoYXJDb2RlQXQoMCk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUFNQkxFX01FVEFfU0VQQVJBVE9SID0gJyAnOyAvLyB1c2luZyBhIGNoYXJhY3RlciB0aGF0IGlzIGtub3cgdG8gYmUgZXNjYXBlZCBpbiBhIFVSSSBhcyBzZXBhcmF0b3Jcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJFQU1CTEVfTUFYX0xFTkdUSCA9IDEwMDAwO1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW9PcGVyYXRpb25RdWV1ZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VRdWV1ZSgpKTsgLy8gcXVldWUgSU8gb3BlcmF0aW9ucyB0byBlbnN1cmUgd3JpdGUvZGVsZXRlIGZpbGUgb3JkZXJcblxuXHRwcml2YXRlIHJlYWR5ITogUHJvbWlzZTxXb3JraW5nQ29weUJhY2t1cHNNb2RlbD47XG5cdHByaXZhdGUgbW9kZWw6IFdvcmtpbmdDb3B5QmFja3Vwc01vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgYmFja3VwV29ya3NwYWNlSG9tZTogVVJJLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmluaXRpYWxpemUoYmFja3VwV29ya3NwYWNlSG9tZSk7XG5cdH1cblxuXHRpbml0aWFsaXplKGJhY2t1cFdvcmtzcGFjZVJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLmJhY2t1cFdvcmtzcGFjZUhvbWUgPSBiYWNrdXBXb3Jrc3BhY2VSZXNvdXJjZTtcblxuXHRcdHRoaXMucmVhZHkgPSB0aGlzLmRvSW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0luaXRpYWxpemUoKTogUHJvbWlzZTxXb3JraW5nQ29weUJhY2t1cHNNb2RlbD4ge1xuXG5cdFx0Ly8gQ3JlYXRlIGJhY2t1cCBtb2RlbFxuXHRcdHRoaXMubW9kZWwgPSBhd2FpdCBXb3JraW5nQ29weUJhY2t1cHNNb2RlbC5jcmVhdGUodGhpcy5iYWNrdXBXb3Jrc3BhY2VIb21lLCB0aGlzLmZpbGVTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB0aGlzLm1vZGVsO1xuXHR9XG5cblx0aGFzQmFja3VwU3luYyhpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5oYXMoYmFja3VwUmVzb3VyY2UsIHZlcnNpb25JZCwgbWV0YSk7XG5cdH1cblxuXHRhc3luYyBiYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudD86IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLnJlYWR5O1xuXHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblx0XHRpZiAobW9kZWwuaGFzKGJhY2t1cFJlc291cmNlLCB2ZXJzaW9uSWQsIG1ldGEpKSB7XG5cdFx0XHQvLyByZXR1cm4gZWFybHkgaWYgYmFja3VwIHZlcnNpb24gaWQgbWF0Y2hlcyByZXF1ZXN0ZWQgb25lXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW9PcGVyYXRpb25RdWV1ZXMucXVldWVGb3IoYmFja3VwUmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZWwuaGFzKGJhY2t1cFJlc291cmNlLCB2ZXJzaW9uSWQsIG1ldGEpKSB7XG5cdFx0XHRcdC8vIHJldHVybiBlYXJseSBpZiBiYWNrdXAgdmVyc2lvbiBpZCBtYXRjaGVzIHJlcXVlc3RlZCBvbmVcblx0XHRcdFx0Ly8gdGhpcyBjYW4gaGFwcGVuIHdoZW4gbXVsdGlwbGUgYmFja3VwIElPIG9wZXJhdGlvbnMgZ290XG5cdFx0XHRcdC8vIHNjaGVkdWxlZCwgcmFjaW5nIGFnYWluc3QgZWFjaCBvdGhlci5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbmNvZGUgYXM6IFJlc291cmNlICsgTUVUQS1TVEFSVCArIE1ldGEgKyBFTkRcblx0XHRcdC8vIGFuZCByZXNwZWN0IG1heCBsZW5ndGggcmVzdHJpY3Rpb25zIGluIGNhc2Vcblx0XHRcdC8vIG1ldGEgaXMgdG9vIGxhcmdlLlxuXHRcdFx0bGV0IHByZWFtYmxlID0gdGhpcy5jcmVhdGVQcmVhbWJsZShpZGVudGlmaWVyLCBtZXRhKTtcblx0XHRcdGlmIChwcmVhbWJsZS5sZW5ndGggPj0gV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbC5QUkVBTUJMRV9NQVhfTEVOR1RIKSB7XG5cdFx0XHRcdHByZWFtYmxlID0gdGhpcy5jcmVhdGVQcmVhbWJsZShpZGVudGlmaWVyKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIGJhY2t1cCB3aXRoIHZhbHVlXG5cdFx0XHRjb25zdCBwcmVhbWJsZUJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcocHJlYW1ibGUpO1xuXHRcdFx0bGV0IGJhY2t1cEJ1ZmZlcjogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZTtcblx0XHRcdGlmIChpc1JlYWRhYmxlU3RyZWFtKGNvbnRlbnQpKSB7XG5cdFx0XHRcdGJhY2t1cEJ1ZmZlciA9IHByZWZpeGVkQnVmZmVyU3RyZWFtKHByZWFtYmxlQnVmZmVyLCBjb250ZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudCkge1xuXHRcdFx0XHRiYWNrdXBCdWZmZXIgPSBwcmVmaXhlZEJ1ZmZlclJlYWRhYmxlKHByZWFtYmxlQnVmZmVyLCBjb250ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJhY2t1cEJ1ZmZlciA9IFZTQnVmZmVyLmNvbmNhdChbcHJlYW1ibGVCdWZmZXIsIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpXSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdyaXRlIGJhY2t1cCB2aWEgZmlsZSBzZXJ2aWNlXG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShiYWNrdXBSZXNvdXJjZSwgYmFja3VwQnVmZmVyKTtcblxuXHRcdFx0Ly9cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Ly9cblx0XHRcdC8vIE5vdGU6IG5vdCBjaGVja2luZyBmb3IgY2FuY2VsbGF0aW9uIGhlcmUgYmVjYXVzZSBhIHN1Y2Nlc3NmdWxcblx0XHRcdC8vIHdyaXRlIGludG8gdGhlIGJhY2t1cCBmaWxlIHNob3VsZCBiZSBub3RlZCBpbiB0aGUgbW9kZWwgdG9cblx0XHRcdC8vIHByZXZlbnQgdGhlIG1vZGVsIGJlaW5nIG91dCBvZiBzeW5jIHdpdGggdGhlIGJhY2t1cCBmaWxlXG5cdFx0XHRtb2RlbC5hZGQoYmFja3VwUmVzb3VyY2UsIHZlcnNpb25JZCwgbWV0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByZWFtYmxlKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7aWRlbnRpZmllci5yZXNvdXJjZS50b1N0cmluZygpfSR7V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbC5QUkVBTUJMRV9NRVRBX1NFUEFSQVRPUn0ke0pTT04uc3RyaW5naWZ5KHsgLi4ubWV0YSwgdHlwZUlkOiBpZGVudGlmaWVyLnR5cGVJZCB9KX0ke1dvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfRU5EX01BUktFUn1gO1xuXHR9XG5cblx0YXN5bmMgZGlzY2FyZEJhY2t1cHMoZmlsdGVyPzogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLnJlYWR5O1xuXG5cdFx0Ly8gRGlzY2FyZCBhbGwgYnV0IHNvbWUgYmFja3Vwc1xuXHRcdGNvbnN0IGV4Y2VwdCA9IGZpbHRlcj8uZXhjZXB0O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGV4Y2VwdCkgJiYgZXhjZXB0Lmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGV4Y2VwdE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRcdFx0Zm9yIChjb25zdCBleGNlcHRXb3JraW5nQ29weSBvZiBleGNlcHQpIHtcblx0XHRcdFx0ZXhjZXB0TWFwLnNldCh0aGlzLnRvQmFja3VwUmVzb3VyY2UoZXhjZXB0V29ya2luZ0NvcHkpLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChtb2RlbC5nZXQoKS5tYXAoYXN5bmMgYmFja3VwUmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRpZiAoIWV4Y2VwdE1hcC5oYXMoYmFja3VwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb0Rpc2NhcmRCYWNrdXAoYmFja3VwUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzY2FyZCBhbGwgYmFja3Vwc1xuXHRcdGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5kZWxldGVJZ25vcmVGaWxlTm90Rm91bmQodGhpcy5iYWNrdXBXb3Jrc3BhY2VIb21lKTtcblxuXHRcdFx0bW9kZWwuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNjYXJkQmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblxuXHRcdHJldHVybiB0aGlzLmRvRGlzY2FyZEJhY2t1cChiYWNrdXBSZXNvdXJjZSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0Rpc2NhcmRCYWNrdXAoYmFja3VwUmVzb3VyY2U6IFVSSSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZWFkeTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW9PcGVyYXRpb25RdWV1ZXMucXVldWVGb3IoYmFja3VwUmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZWxldGUgYmFja3VwIGZpbGUgaWdub3JpbmcgYW55IGZpbGUgbm90IGZvdW5kIGVycm9yc1xuXHRcdFx0YXdhaXQgdGhpcy5kZWxldGVJZ25vcmVGaWxlTm90Rm91bmQoYmFja3VwUmVzb3VyY2UpO1xuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVXBkYXRlIG1vZGVsXG5cdFx0XHQvL1xuXHRcdFx0Ly8gTm90ZTogbm90IGNoZWNraW5nIGZvciBjYW5jZWxsYXRpb24gaGVyZSBiZWNhdXNlIGEgc3VjY2Vzc2Z1bFxuXHRcdFx0Ly8gZGVsZXRlIG9mIHRoZSBiYWNrdXAgZmlsZSBzaG91bGQgYmUgbm90ZWQgaW4gdGhlIG1vZGVsIHRvXG5cdFx0XHQvLyBwcmV2ZW50IHRoZSBtb2RlbCBiZWluZyBvdXQgb2Ygc3luYyB3aXRoIHRoZSBiYWNrdXAgZmlsZVxuXHRcdFx0bW9kZWwucmVtb3ZlKGJhY2t1cFJlc291cmNlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlSWdub3JlRmlsZU5vdEZvdW5kKGJhY2t1cFJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoYmFja3VwUmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7IC8vIHJlLXRocm93IGFueSBvdGhlciBlcnJvciB0aGFuIGZpbGUgbm90IGZvdW5kIHdoaWNoIGlzIE9LXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QmFja3VwcygpOiBQcm9taXNlPElXb3JraW5nQ29weUlkZW50aWZpZXJbXT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZWFkeTtcblxuXHRcdC8vIEVuc3VyZSB0byBhd2FpdCBhbnkgcGVuZGluZyBiYWNrdXAgb3BlcmF0aW9uc1xuXHRcdGF3YWl0IHRoaXMuam9pbkJhY2t1cHMoKTtcblxuXHRcdGNvbnN0IGJhY2t1cHMgPSBhd2FpdCBQcm9taXNlLmFsbChtb2RlbC5nZXQoKS5tYXAoYmFja3VwUmVzb3VyY2UgPT4gdGhpcy5yZXNvbHZlSWRlbnRpZmllcihiYWNrdXBSZXNvdXJjZSwgbW9kZWwpKSk7XG5cblx0XHRyZXR1cm4gY29hbGVzY2UoYmFja3Vwcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVJZGVudGlmaWVyKGJhY2t1cFJlc291cmNlOiBVUkksIG1vZGVsOiBXb3JraW5nQ29weUJhY2t1cHNNb2RlbCk6IFByb21pc2U8SVdvcmtpbmdDb3B5SWRlbnRpZmllciB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCByZXM6IElXb3JraW5nQ29weUlkZW50aWZpZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRhd2FpdCB0aGlzLmlvT3BlcmF0aW9uUXVldWVzLnF1ZXVlRm9yKGJhY2t1cFJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIW1vZGVsLmhhcyhiYWNrdXBSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZXF1aXJlIGJhY2t1cCB0byBiZSBwcmVzZW50XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlYWQgdGhlIGVudGlyZSBiYWNrdXAgcHJlYW1ibGUgYnkgcmVhZGluZyB1cCB0b1xuXHRcdFx0Ly8gYFBSRUFNQkxFX01BWF9MRU5HVEhgIGluIHRoZSBiYWNrdXAgZmlsZSB1bnRpbFxuXHRcdFx0Ly8gdGhlIGBQUkVBTUJMRV9FTkRfTUFSS0VSYCBpcyBmb3VuZFxuXHRcdFx0Y29uc3QgYmFja3VwUHJlYW1ibGUgPSBhd2FpdCB0aGlzLnJlYWRUb01hdGNoaW5nU3RyaW5nKGJhY2t1cFJlc291cmNlLCBXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX0VORF9NQVJLRVIsIFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfTUFYX0xFTkdUSCk7XG5cdFx0XHRpZiAoIWJhY2t1cFByZWFtYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlndXJlIG91dCB0aGUgb2Zmc2V0IGluIHRoZSBwcmVhbWJsZSB3aGVyZSBtZXRhXG5cdFx0XHQvLyBpbmZvcm1hdGlvbiBwb3NzaWJseSBzdGFydHMuIFRoaXMgY2FuIGJlIGAtMWAgZm9yXG5cdFx0XHQvLyBvbGRlciBiYWNrdXBzIHdpdGhvdXQgbWV0YS5cblx0XHRcdGNvbnN0IG1ldGFTdGFydEluZGV4ID0gYmFja3VwUHJlYW1ibGUuaW5kZXhPZihXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX01FVEFfU0VQQVJBVE9SKTtcblxuXHRcdFx0Ly8gRXh0cmFjdCB0aGUgcHJlYW1ibGUgY29udGVudCBmb3IgcmVzb3VyY2UgYW5kIG1ldGFcblx0XHRcdGxldCByZXNvdXJjZVByZWFtYmxlOiBzdHJpbmc7XG5cdFx0XHRsZXQgbWV0YVByZWFtYmxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobWV0YVN0YXJ0SW5kZXggPiAwKSB7XG5cdFx0XHRcdHJlc291cmNlUHJlYW1ibGUgPSBiYWNrdXBQcmVhbWJsZS5zdWJzdHJpbmcoMCwgbWV0YVN0YXJ0SW5kZXgpO1xuXHRcdFx0XHRtZXRhUHJlYW1ibGUgPSBiYWNrdXBQcmVhbWJsZS5zdWJzdHIobWV0YVN0YXJ0SW5kZXggKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc291cmNlUHJlYW1ibGUgPSBiYWNrdXBQcmVhbWJsZTtcblx0XHRcdFx0bWV0YVByZWFtYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gcGFyc2UgdGhlIG1ldGEgcHJlYW1ibGUgZm9yIGZpZ3VyaW5nIG91dFxuXHRcdFx0Ly8gYHR5cGVJZGAgYW5kIGBtZXRhYCBpZiBkZWZpbmVkLlxuXHRcdFx0Y29uc3QgeyB0eXBlSWQsIG1ldGEgfSA9IHRoaXMucGFyc2VQcmVhbWJsZU1ldGEobWV0YVByZWFtYmxlKTtcblxuXHRcdFx0Ly8gVXBkYXRlIG1vZGVsIGVudHJ5IHdpdGggbm93IHJlc29sdmVkIG1ldGFcblx0XHRcdG1vZGVsLnVwZGF0ZShiYWNrdXBSZXNvdXJjZSwgbWV0YSk7XG5cblx0XHRcdHJlcyA9IHtcblx0XHRcdFx0dHlwZUlkOiB0eXBlSWQgPz8gTk9fVFlQRV9JRCxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShyZXNvdXJjZVByZWFtYmxlKVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRUb01hdGNoaW5nU3RyaW5nKGJhY2t1cFJlc291cmNlOiBVUkksIG1hdGNoaW5nU3RyaW5nOiBzdHJpbmcsIG1heGltdW1CeXRlc1RvUmVhZDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFJlc291cmNlLCB7IGxlbmd0aDogbWF4aW11bUJ5dGVzVG9SZWFkIH0pKS52YWx1ZS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgbWF0Y2hpbmdTdHJpbmdJbmRleCA9IGNvbnRlbnRzLmluZGV4T2YobWF0Y2hpbmdTdHJpbmcpO1xuXHRcdGlmIChtYXRjaGluZ1N0cmluZ0luZGV4ID49IDApIHtcblx0XHRcdHJldHVybiBjb250ZW50cy5zdWJzdHIoMCwgbWF0Y2hpbmdTdHJpbmdJbmRleCk7XG5cdFx0fVxuXG5cdFx0Ly8gVW5hYmxlIHRvIGZpbmQgbWF0Y2hpbmcgc3RyaW5nIGluIGZpbGVcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZTxUIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YT4oaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8SVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXA8VD4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZWFkeTtcblxuXHRcdGxldCByZXM6IElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPFQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0YXdhaXQgdGhpcy5pb09wZXJhdGlvblF1ZXVlcy5xdWV1ZUZvcihiYWNrdXBSZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCFtb2RlbC5oYXMoYmFja3VwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmVxdWlyZSBiYWNrdXAgdG8gYmUgcHJlc2VudFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb2FkIHRoZSBiYWNrdXAgY29udGVudCBhbmQgcGVlayBpbnRvIHRoZSBmaXJzdCBjaHVua1xuXHRcdFx0Ly8gdG8gYmUgYWJsZSB0byByZXNvbHZlIHRoZSBtZXRhIGRhdGFcblx0XHRcdGNvbnN0IGJhY2t1cFN0cmVhbSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0oYmFja3VwUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcGVla2VkQmFja3VwU3RyZWFtID0gYXdhaXQgcGVla1N0cmVhbShiYWNrdXBTdHJlYW0udmFsdWUsIDEpO1xuXHRcdFx0Y29uc3QgZmlyc3RCYWNrdXBDaHVuayA9IFZTQnVmZmVyLmNvbmNhdChwZWVrZWRCYWNrdXBTdHJlYW0uYnVmZmVyKTtcblxuXHRcdFx0Ly8gV2UgaGF2ZSBzZWVuIHJlcG9ydHMgKGUuZy4gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc4NTAwKSB3aGVyZVxuXHRcdFx0Ly8gaWYgVlNDb2RlIGdvZXMgZG93biB3aGlsZSB3cml0aW5nIHRoZSBiYWNrdXAgZmlsZSwgdGhlIGZpbGUgY2FuIHR1cm4gZW1wdHkgYmVjYXVzZVxuXHRcdFx0Ly8gaXQgYWx3YXlzIGZpcnN0IGdldHMgdHJ1bmNhdGVkIGFuZCB0aGVuIHdyaXR0ZW4gdG8uIEluIHRoaXMgY2FzZSwgd2Ugd2lsbCBub3QgZmluZFxuXHRcdFx0Ly8gdGhlIG1ldGEtZW5kIG1hcmtlciAoJ1xcbicpIGFuZCBhcyBzdWNoIHRoZSBiYWNrdXAgY2FuIG9ubHkgYmUgaW52YWxpZC4gV2UgYmFpbCBvdXRcblx0XHRcdC8vIGhlcmUgaWYgdGhhdCBpcyB0aGUgY2FzZS5cblx0XHRcdGNvbnN0IHByZWFtYmxlRW5kSW5kZXggPSBmaXJzdEJhY2t1cENodW5rLmJ1ZmZlci5pbmRleE9mKFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfRU5EX01BUktFUl9DSEFSQ09ERSk7XG5cdFx0XHRpZiAocHJlYW1ibGVFbmRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBCYWNrdXA6IENvdWxkIG5vdCBmaW5kIG1ldGEgZW5kIG1hcmtlciBpbiAke2JhY2t1cFJlc291cmNlfS4gVGhlIGZpbGUgaXMgcHJvYmFibHkgY29ycnVwdCAoZmlsZXNpemU6ICR7YmFja3VwU3RyZWFtLnNpemV9KS5gKTtcblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmVhbWJlbFJhdyA9IGZpcnN0QmFja3VwQ2h1bmsuc2xpY2UoMCwgcHJlYW1ibGVFbmRJbmRleCkudG9TdHJpbmcoKTtcblxuXHRcdFx0Ly8gRXh0cmFjdCBtZXRhIGRhdGEgKGlmIGFueSlcblx0XHRcdGxldCBtZXRhOiBUIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbWV0YVN0YXJ0SW5kZXggPSBwcmVhbWJlbFJhdy5pbmRleE9mKFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfTUVUQV9TRVBBUkFUT1IpO1xuXHRcdFx0aWYgKG1ldGFTdGFydEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRtZXRhID0gdGhpcy5wYXJzZVByZWFtYmxlTWV0YShwcmVhbWJlbFJhdy5zdWJzdHIobWV0YVN0YXJ0SW5kZXggKyAxKSkubWV0YSBhcyBUO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgbW9kZWwgZW50cnkgd2l0aCBub3cgcmVzb2x2ZWQgbWV0YVxuXHRcdFx0bW9kZWwudXBkYXRlKGJhY2t1cFJlc291cmNlLCBtZXRhKTtcblxuXHRcdFx0Ly8gQnVpbGQgYSBuZXcgc3RyZWFtIHdpdGhvdXQgdGhlIHByZWFtYmxlXG5cdFx0XHRjb25zdCBmaXJzdEJhY2t1cENodW5rV2l0aG91dFByZWFtYmxlID0gZmlyc3RCYWNrdXBDaHVuay5zbGljZShwcmVhbWJsZUVuZEluZGV4ICsgMSk7XG5cdFx0XHRsZXQgdmFsdWU6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG5cdFx0XHRpZiAocGVla2VkQmFja3VwU3RyZWFtLmVuZGVkKSB7XG5cdFx0XHRcdHZhbHVlID0gYnVmZmVyVG9TdHJlYW0oZmlyc3RCYWNrdXBDaHVua1dpdGhvdXRQcmVhbWJsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YWx1ZSA9IHByZWZpeGVkQnVmZmVyU3RyZWFtKGZpcnN0QmFja3VwQ2h1bmtXaXRob3V0UHJlYW1ibGUsIHBlZWtlZEJhY2t1cFN0cmVhbS5zdHJlYW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXMgPSB7IHZhbHVlLCBtZXRhIH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVByZWFtYmxlTWV0YTxUIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YT4ocHJlYW1ibGVNZXRhUmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IHR5cGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBtZXRhOiBUIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGxldCB0eXBlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbWV0YTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChwcmVhbWJsZU1ldGFSYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1ldGEgPSBKU09OLnBhcnNlKHByZWFtYmxlTWV0YVJhdyk7XG5cdFx0XHRcdHR5cGVJZCA9IG1ldGE/LnR5cGVJZDtcblxuXHRcdFx0XHQvLyBgdHlwZUlkYCBpcyBhIHByb3BlcnR5IHRoYXQgd2UgYWRkIHNvIHdlXG5cdFx0XHRcdC8vIHJlbW92ZSBpdCB3aGVuIHJldHVybmluZyB0byBjbGllbnRzLlxuXHRcdFx0XHRpZiAodHlwZW9mIG1ldGE/LnR5cGVJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRkZWxldGUgbWV0YS50eXBlSWQ7XG5cblx0XHRcdFx0XHRpZiAoaXNFbXB0eU9iamVjdChtZXRhKSkge1xuXHRcdFx0XHRcdFx0bWV0YSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBKU09OIHBhcnNlIGVycm9yc1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHR5cGVJZCwgbWV0YSB9O1xuXHR9XG5cblx0dG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogVVJJIHtcblx0XHRyZXR1cm4gam9pblBhdGgodGhpcy5iYWNrdXBXb3Jrc3BhY2VIb21lLCBpZGVudGlmaWVyLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoaWRlbnRpZmllcikpO1xuXHR9XG5cblx0am9pbkJhY2t1cHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW9PcGVyYXRpb25RdWV1ZXMud2hlbkRyYWluZWQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBiYWNrdXBzID0gbmV3IFJlc291cmNlTWFwPHsgdHlwZUlkOiBzdHJpbmc7IGNvbnRlbnQ6IFZTQnVmZmVyOyBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSB9PigpO1xuXG5cdGhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgdmVyc2lvbklkPzogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRyZXR1cm4gdGhpcy5iYWNrdXBzLmhhcyhiYWNrdXBSZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBiYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudD86IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cdFx0dGhpcy5iYWNrdXBzLnNldChiYWNrdXBSZXNvdXJjZSwge1xuXHRcdFx0dHlwZUlkOiBpZGVudGlmaWVyLnR5cGVJZCxcblx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQgaW5zdGFuY2VvZiBWU0J1ZmZlciA/IGNvbnRlbnQgOiBjb250ZW50ID8gaXNSZWFkYWJsZVN0cmVhbShjb250ZW50KSA/IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRlbnQpIDogcmVhZGFibGVUb0J1ZmZlcihjb250ZW50KSA6IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpLFxuXHRcdFx0bWV0YVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZTxUIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YT4oaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8SVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXA8VD4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKTtcblx0XHRjb25zdCBiYWNrdXAgPSB0aGlzLmJhY2t1cHMuZ2V0KGJhY2t1cFJlc291cmNlKTtcblx0XHRpZiAoYmFja3VwKSB7XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogYnVmZmVyVG9TdHJlYW0oYmFja3VwLmNvbnRlbnQpLCBtZXRhOiBiYWNrdXAubWV0YSBhcyBUIHwgdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldEJhY2t1cHMoKTogUHJvbWlzZTxJV29ya2luZ0NvcHlJZGVudGlmaWVyW10+IHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmJhY2t1cHMuZW50cmllcygpKS5tYXAoKFtyZXNvdXJjZSwgYmFja3VwXSkgPT4gKHsgdHlwZUlkOiBiYWNrdXAudHlwZUlkLCByZXNvdXJjZSB9KSk7XG5cdH1cblxuXHRhc3luYyBkaXNjYXJkQmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmJhY2t1cHMuZGVsZXRlKHRoaXMudG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyKSk7XG5cdH1cblxuXHRhc3luYyBkaXNjYXJkQmFja3VwcyhmaWx0ZXI/OiB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGNlcHQgPSBmaWx0ZXI/LmV4Y2VwdDtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShleGNlcHQpICYmIGV4Y2VwdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBleGNlcHRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0XHRcdGZvciAoY29uc3QgZXhjZXB0V29ya2luZ0NvcHkgb2YgZXhjZXB0KSB7XG5cdFx0XHRcdGV4Y2VwdE1hcC5zZXQodGhpcy50b0JhY2t1cFJlc291cmNlKGV4Y2VwdFdvcmtpbmdDb3B5KSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgYmFja3VwIG9mIGF3YWl0IHRoaXMuZ2V0QmFja3VwcygpKSB7XG5cdFx0XHRcdGlmICghZXhjZXB0TWFwLmhhcyh0aGlzLnRvQmFja3VwUmVzb3VyY2UoYmFja3VwKSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRpc2NhcmRCYWNrdXAoYmFja3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJhY2t1cHMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHR0b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogaGFzaElkZW50aWZpZXIoaWRlbnRpZmllcikgfSk7XG5cdH1cblxuXHRhc3luYyBqb2luQmFja3VwcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm47XG5cdH1cbn1cblxuLypcbiAqIEV4cG9ydGVkIG9ubHkgZm9yIHRlc3RpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBzdHJpbmcge1xuXG5cdC8vIElNUE9SVEFOVDogZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LCBlbnN1cmUgdGhhdFxuXHQvLyB3ZSBpZ25vcmUgdGhlIGB0eXBlSWRgIHVubGVzcyBhIHZhbHVlIGlzIHByb3ZpZGVkLlxuXHQvLyBUbyBwcmVzZXJ2ZSBwcmV2aW91cyBiYWNrdXBzIHdpdGhvdXQgdHlwZSBpZCwgd2Vcblx0Ly8gbmVlZCB0byBqdXN0IGhhc2ggdGhlIHJlc291cmNlLiBPdGhlcndpc2Ugd2UgdXNlXG5cdC8vIHRoZSB0eXBlIGlkIGFzIGEgc2VlZCB0byB0aGUgcmVzb3VyY2UgcGF0aC5cblx0bGV0IHJlc291cmNlOiBVUkk7XG5cdGlmIChpZGVudGlmaWVyLnR5cGVJZC5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgdHlwZUlkSGFzaCA9IGhhc2hTdHJpbmcoaWRlbnRpZmllci50eXBlSWQpO1xuXHRcdGlmIChpZGVudGlmaWVyLnJlc291cmNlLnBhdGgpIHtcblx0XHRcdHJlc291cmNlID0gam9pblBhdGgoaWRlbnRpZmllci5yZXNvdXJjZSwgdHlwZUlkSGFzaCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gaWRlbnRpZmllci5yZXNvdXJjZS53aXRoKHsgcGF0aDogdHlwZUlkSGFzaCB9KTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0cmVzb3VyY2UgPSBpZGVudGlmaWVyLnJlc291cmNlO1xuXHR9XG5cblx0cmV0dXJuIGhhc2hQYXRoKHJlc291cmNlKTtcbn1cblxuZnVuY3Rpb24gaGFzaFBhdGgocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdGNvbnN0IHN0ciA9IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCA/IHJlc291cmNlLmZzUGF0aCA6IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0cmV0dXJuIGhhc2hTdHJpbmcoc3RyKTtcbn1cblxuZnVuY3Rpb24gaGFzaFN0cmluZyhzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBoYXNoKHN0cikudG9TdHJpbmcoMTYpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFRLGlCQUFpQjtBQUNsQyxTQUFTLFVBQVUscUJBQXFCO0FBRXhDLFNBQVMsY0FBa0MsMkJBQTJCO0FBQ3RFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCLGtCQUFrQjtBQUM3QyxTQUFTLGdCQUFnQix3QkFBd0Isc0JBQXNCLGtCQUFrQixnQkFBZ0IsZ0JBQTBEO0FBQ25LLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBeUQsa0JBQWtCO0FBRXBFLE1BQU0sd0JBQXdCO0FBQUEsRUFZNUIsWUFBb0IsWUFBeUIsYUFBMkI7QUFBcEQ7QUFBeUI7QUFWckQsU0FBaUIsUUFBUSxJQUFJLFlBQW1FO0FBQUEsRUFVZDtBQUFBLEVBUmxGLGFBQWEsT0FBTyxZQUFpQixhQUE2RDtBQUNqRyxVQUFNLFFBQVEsSUFBSSx3QkFBd0IsWUFBWSxXQUFXO0FBRWpFLFVBQU0sTUFBTSxRQUFRO0FBRXBCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxNQUFjLFVBQXlCO0FBQ3RDLFFBQUk7QUFDSCxZQUFNLGlCQUFpQixNQUFNLEtBQUssWUFBWSxRQUFRLEtBQUssVUFBVTtBQUNyRSxVQUFJLGVBQWUsVUFBVTtBQUM1QixjQUFNLFNBQVMsUUFBUSxlQUFlLFNBQ3BDLE9BQU8sV0FBUyxNQUFNLFdBQVcsRUFDakMsSUFBSSxPQUFNLHVCQUFzQjtBQUdoQyxnQkFBTSx5QkFB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
