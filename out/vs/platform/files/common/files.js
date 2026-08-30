import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { sep } from "../../../base/common/path.js";
import { startsWithIgnoreCase } from "../../../base/common/strings.js";
import { isNumber } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { isWeb } from "../../../base/common/platform.js";
import { Schemas } from "../../../base/common/network.js";
import { Lazy } from "../../../base/common/lazy.js";
const IFileService = createDecorator("fileService");
function isFileOpenForWriteOptions(options) {
  return options.create === true;
}
var FileType = /* @__PURE__ */ ((FileType2) => {
  FileType2[FileType2["Unknown"] = 0] = "Unknown";
  FileType2[FileType2["File"] = 1] = "File";
  FileType2[FileType2["Directory"] = 2] = "Directory";
  FileType2[FileType2["SymbolicLink"] = 64] = "SymbolicLink";
  return FileType2;
})(FileType || {});
var FilePermission = /* @__PURE__ */ ((FilePermission2) => {
  FilePermission2[FilePermission2["Readonly"] = 1] = "Readonly";
  FilePermission2[FilePermission2["Locked"] = 2] = "Locked";
  FilePermission2[FilePermission2["Executable"] = 4] = "Executable";
  return FilePermission2;
})(FilePermission || {});
var FileChangeFilter = /* @__PURE__ */ ((FileChangeFilter2) => {
  FileChangeFilter2[FileChangeFilter2["UPDATED"] = 2] = "UPDATED";
  FileChangeFilter2[FileChangeFilter2["ADDED"] = 4] = "ADDED";
  FileChangeFilter2[FileChangeFilter2["DELETED"] = 8] = "DELETED";
  return FileChangeFilter2;
})(FileChangeFilter || {});
function isFileSystemWatcher(thing) {
  const candidate = thing;
  return !!candidate && typeof candidate.onDidChange === "function";
}
var FileSystemProviderCapabilities = /* @__PURE__ */ ((FileSystemProviderCapabilities2) => {
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["None"] = 0] = "None";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileReadWrite"] = 2] = "FileReadWrite";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileOpenReadWriteClose"] = 4] = "FileOpenReadWriteClose";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileReadStream"] = 16] = "FileReadStream";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileFolderCopy"] = 8] = "FileFolderCopy";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["PathCaseSensitive"] = 1024] = "PathCaseSensitive";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["Readonly"] = 2048] = "Readonly";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["Trash"] = 4096] = "Trash";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileWriteUnlock"] = 8192] = "FileWriteUnlock";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicRead"] = 16384] = "FileAtomicRead";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicWrite"] = 32768] = "FileAtomicWrite";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicDelete"] = 65536] = "FileAtomicDelete";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileClone"] = 131072] = "FileClone";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileRealpath"] = 262144] = "FileRealpath";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAppend"] = 524288] = "FileAppend";
  return FileSystemProviderCapabilities2;
})(FileSystemProviderCapabilities || {});
function hasReadWriteCapability(provider) {
  return !!(provider.capabilities & 2 /* FileReadWrite */);
}
function hasFileAppendCapability(provider) {
  return !!(provider.capabilities & 524288 /* FileAppend */);
}
function hasFileFolderCopyCapability(provider) {
  return !!(provider.capabilities & 8 /* FileFolderCopy */);
}
function hasFileCloneCapability(provider) {
  return !!(provider.capabilities & 131072 /* FileClone */);
}
function hasFileRealpathCapability(provider) {
  return !!(provider.capabilities & 262144 /* FileRealpath */);
}
function hasOpenReadWriteCloseCapability(provider) {
  return !!(provider.capabilities & 4 /* FileOpenReadWriteClose */);
}
function hasFileReadStreamCapability(provider) {
  return !!(provider.capabilities & 16 /* FileReadStream */);
}
function hasFileAtomicReadCapability(provider) {
  if (!hasReadWriteCapability(provider)) {
    return false;
  }
  return !!(provider.capabilities & 16384 /* FileAtomicRead */);
}
function hasFileAtomicWriteCapability(provider) {
  if (!hasReadWriteCapability(provider)) {
    return false;
  }
  return !!(provider.capabilities & 32768 /* FileAtomicWrite */);
}
function hasFileAtomicDeleteCapability(provider) {
  return !!(provider.capabilities & 65536 /* FileAtomicDelete */);
}
function hasReadonlyCapability(provider) {
  return !!(provider.capabilities & 2048 /* Readonly */);
}
var FileSystemProviderErrorCode = /* @__PURE__ */ ((FileSystemProviderErrorCode2) => {
  FileSystemProviderErrorCode2["FileExists"] = "EntryExists";
  FileSystemProviderErrorCode2["FileNotFound"] = "EntryNotFound";
  FileSystemProviderErrorCode2["FileNotADirectory"] = "EntryNotADirectory";
  FileSystemProviderErrorCode2["FileIsADirectory"] = "EntryIsADirectory";
  FileSystemProviderErrorCode2["FileExceedsStorageQuota"] = "EntryExceedsStorageQuota";
  FileSystemProviderErrorCode2["FileTooLarge"] = "EntryTooLarge";
  FileSystemProviderErrorCode2["FileWriteLocked"] = "EntryWriteLocked";
  FileSystemProviderErrorCode2["NoPermissions"] = "NoPermissions";
  FileSystemProviderErrorCode2["Unavailable"] = "Unavailable";
  FileSystemProviderErrorCode2["Unknown"] = "Unknown";
  return FileSystemProviderErrorCode2;
})(FileSystemProviderErrorCode || {});
class FileSystemProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
  static create(error, code) {
    const providerError = new FileSystemProviderError(error.toString(), code);
    markAsFileSystemProviderError(providerError, code);
    return providerError;
  }
}
function createFileSystemProviderError(error, code) {
  return FileSystemProviderError.create(error, code);
}
function ensureFileSystemProviderError(error) {
  if (!error) {
    return createFileSystemProviderError(localize("unknownError", "Unknown Error"), "Unknown" /* Unknown */);
  }
  return error;
}
function markAsFileSystemProviderError(error, code) {
  error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;
  return error;
}
function toFileSystemProviderErrorCode(error) {
  if (!error) {
    return "Unknown" /* Unknown */;
  }
  if (error instanceof FileSystemProviderError) {
    return error.code;
  }
  const match = /^(.+) \(FileSystemError\)$/.exec(error.name);
  if (!match) {
    return "Unknown" /* Unknown */;
  }
  switch (match[1]) {
    case "EntryExists" /* FileExists */:
      return "EntryExists" /* FileExists */;
    case "EntryIsADirectory" /* FileIsADirectory */:
      return "EntryIsADirectory" /* FileIsADirectory */;
    case "EntryNotADirectory" /* FileNotADirectory */:
      return "EntryNotADirectory" /* FileNotADirectory */;
    case "EntryNotFound" /* FileNotFound */:
      return "EntryNotFound" /* FileNotFound */;
    case "EntryTooLarge" /* FileTooLarge */:
      return "EntryTooLarge" /* FileTooLarge */;
    case "EntryWriteLocked" /* FileWriteLocked */:
      return "EntryWriteLocked" /* FileWriteLocked */;
    case "NoPermissions" /* NoPermissions */:
      return "NoPermissions" /* NoPermissions */;
    case "Unavailable" /* Unavailable */:
      return "Unavailable" /* Unavailable */;
  }
  return "Unknown" /* Unknown */;
}
function toFileOperationResult(error) {
  if (error instanceof FileOperationError) {
    return error.fileOperationResult;
  }
  switch (toFileSystemProviderErrorCode(error)) {
    case "EntryNotFound" /* FileNotFound */:
      return 1 /* FILE_NOT_FOUND */;
    case "EntryIsADirectory" /* FileIsADirectory */:
      return 0 /* FILE_IS_DIRECTORY */;
    case "EntryNotADirectory" /* FileNotADirectory */:
      return 9 /* FILE_NOT_DIRECTORY */;
    case "EntryWriteLocked" /* FileWriteLocked */:
      return 5 /* FILE_WRITE_LOCKED */;
    case "NoPermissions" /* NoPermissions */:
      return 6 /* FILE_PERMISSION_DENIED */;
    case "EntryExists" /* FileExists */:
      return 4 /* FILE_MOVE_CONFLICT */;
    case "EntryTooLarge" /* FileTooLarge */:
      return 7 /* FILE_TOO_LARGE */;
    default:
      return 10 /* FILE_OTHER_ERROR */;
  }
}
var FileOperation = /* @__PURE__ */ ((FileOperation2) => {
  FileOperation2[FileOperation2["CREATE"] = 0] = "CREATE";
  FileOperation2[FileOperation2["DELETE"] = 1] = "DELETE";
  FileOperation2[FileOperation2["MOVE"] = 2] = "MOVE";
  FileOperation2[FileOperation2["COPY"] = 3] = "COPY";
  FileOperation2[FileOperation2["WRITE"] = 4] = "WRITE";
  return FileOperation2;
})(FileOperation || {});
class FileOperationEvent {
  constructor(resource, operation, target) {
    this.resource = resource;
    this.operation = operation;
    this.target = target;
  }
  isOperation(operation) {
    return this.operation === operation;
  }
}
var FileChangeType = /* @__PURE__ */ ((FileChangeType2) => {
  FileChangeType2[FileChangeType2["UPDATED"] = 0] = "UPDATED";
  FileChangeType2[FileChangeType2["ADDED"] = 1] = "ADDED";
  FileChangeType2[FileChangeType2["DELETED"] = 2] = "DELETED";
  return FileChangeType2;
})(FileChangeType || {});
const _FileChangesEvent = class _FileChangesEvent {
  constructor(changes, ignorePathCasing) {
    this.ignorePathCasing = ignorePathCasing;
    this.correlationId = void 0;
    this.added = new Lazy(() => {
      const added = TernarySearchTree.forUris(() => this.ignorePathCasing);
      added.fill(this.rawAdded.map((resource) => [resource, true]));
      return added;
    });
    this.updated = new Lazy(() => {
      const updated = TernarySearchTree.forUris(() => this.ignorePathCasing);
      updated.fill(this.rawUpdated.map((resource) => [resource, true]));
      return updated;
    });
    this.deleted = new Lazy(() => {
      const deleted = TernarySearchTree.forUris(() => this.ignorePathCasing);
      deleted.fill(this.rawDeleted.map((resource) => [resource, true]));
      return deleted;
    });
    /**
     * @deprecated use the `contains` or `affects` method to efficiently find
     * out if the event relates to a given resource. these methods ensure:
     * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
     * - correctly handles `FileChangeType.DELETED` events
     */
    this.rawAdded = [];
    /**
    * @deprecated use the `contains` or `affects` method to efficiently find
    * out if the event relates to a given resource. these methods ensure:
    * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
    * - correctly handles `FileChangeType.DELETED` events
    */
    this.rawUpdated = [];
    /**
    * @deprecated use the `contains` or `affects` method to efficiently find
    * out if the event relates to a given resource. these methods ensure:
    * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
    * - correctly handles `FileChangeType.DELETED` events
    */
    this.rawDeleted = [];
    for (const change of changes) {
      switch (change.type) {
        case 1 /* ADDED */:
          this.rawAdded.push(change.resource);
          break;
        case 0 /* UPDATED */:
          this.rawUpdated.push(change.resource);
          break;
        case 2 /* DELETED */:
          this.rawDeleted.push(change.resource);
          break;
      }
      if (this.correlationId !== _FileChangesEvent.MIXED_CORRELATION) {
        if (typeof change.cId === "number") {
          if (this.correlationId === void 0) {
            this.correlationId = change.cId;
          } else if (this.correlationId !== change.cId) {
            this.correlationId = _FileChangesEvent.MIXED_CORRELATION;
          }
        } else {
          if (this.correlationId !== void 0) {
            this.correlationId = _FileChangesEvent.MIXED_CORRELATION;
          }
        }
      }
    }
  }
  /**
   * Find out if the file change events match the provided resource.
   *
   * Note: when passing `FileChangeType.DELETED`, we consider a match
   * also when the parent of the resource got deleted.
   */
  contains(resource, ...types) {
    return this.doContains(resource, { includeChildren: false }, ...types);
  }
  /**
   * Find out if the file change events either match the provided
   * resource, or contain a child of this resource.
   */
  affects(resource, ...types) {
    return this.doContains(resource, { includeChildren: true }, ...types);
  }
  doContains(resource, options, ...types) {
    if (!resource) {
      return false;
    }
    const hasTypesFilter = types.length > 0;
    if (!hasTypesFilter || types.includes(1 /* ADDED */)) {
      if (this.added.value.get(resource)) {
        return true;
      }
      if (options.includeChildren && this.added.value.findSuperstr(resource)) {
        return true;
      }
    }
    if (!hasTypesFilter || types.includes(0 /* UPDATED */)) {
      if (this.updated.value.get(resource)) {
        return true;
      }
      if (options.includeChildren && this.updated.value.findSuperstr(resource)) {
        return true;
      }
    }
    if (!hasTypesFilter || types.includes(2 /* DELETED */)) {
      if (this.deleted.value.findSubstr(resource)) {
        return true;
      }
      if (options.includeChildren && this.deleted.value.findSuperstr(resource)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns if this event contains added files.
   */
  gotAdded() {
    return this.rawAdded.length > 0;
  }
  /**
   * Returns if this event contains deleted files.
   */
  gotDeleted() {
    return this.rawDeleted.length > 0;
  }
  /**
   * Returns if this event contains updated files.
   */
  gotUpdated() {
    return this.rawUpdated.length > 0;
  }
  /**
   * Returns if this event contains changes that correlate to the
   * provided `correlationId`.
   *
   * File change event correlation is an advanced watch feature that
   * allows to  identify from which watch request the events originate
   * from. This correlation allows to route events specifically
   * only to the requestor and not emit them to all listeners.
   */
  correlates(correlationId) {
    return this.correlationId === correlationId;
  }
  /**
   * Figure out if the event contains changes that correlate to one
   * correlation identifier.
   *
   * File change event correlation is an advanced watch feature that
   * allows to  identify from which watch request the events originate
   * from. This correlation allows to route events specifically
   * only to the requestor and not emit them to all listeners.
   */
  hasCorrelation() {
    return typeof this.correlationId === "number";
  }
};
_FileChangesEvent.MIXED_CORRELATION = null;
let FileChangesEvent = _FileChangesEvent;
function isParent(path, candidate, ignoreCase) {
  if (!path || !candidate || path === candidate) {
    return false;
  }
  if (candidate.length > path.length) {
    return false;
  }
  if (candidate.charAt(candidate.length - 1) !== sep) {
    candidate += sep;
  }
  if (ignoreCase) {
    return startsWithIgnoreCase(path, candidate);
  }
  return path.indexOf(candidate) === 0;
}
class FileOperationError extends Error {
  constructor(message, fileOperationResult, options) {
    super(message);
    this.fileOperationResult = fileOperationResult;
    this.options = options;
  }
}
class TooLargeFileOperationError extends FileOperationError {
  constructor(message, fileOperationResult, size, options) {
    super(message, fileOperationResult, options);
    this.fileOperationResult = fileOperationResult;
    this.size = size;
  }
}
class NotModifiedSinceFileOperationError extends FileOperationError {
  constructor(message, stat, options) {
    super(message, 2 /* FILE_NOT_MODIFIED_SINCE */, options);
    this.stat = stat;
  }
}
var FileOperationResult = /* @__PURE__ */ ((FileOperationResult2) => {
  FileOperationResult2[FileOperationResult2["FILE_IS_DIRECTORY"] = 0] = "FILE_IS_DIRECTORY";
  FileOperationResult2[FileOperationResult2["FILE_NOT_FOUND"] = 1] = "FILE_NOT_FOUND";
  FileOperationResult2[FileOperationResult2["FILE_NOT_MODIFIED_SINCE"] = 2] = "FILE_NOT_MODIFIED_SINCE";
  FileOperationResult2[FileOperationResult2["FILE_MODIFIED_SINCE"] = 3] = "FILE_MODIFIED_SINCE";
  FileOperationResult2[FileOperationResult2["FILE_MOVE_CONFLICT"] = 4] = "FILE_MOVE_CONFLICT";
  FileOperationResult2[FileOperationResult2["FILE_WRITE_LOCKED"] = 5] = "FILE_WRITE_LOCKED";
  FileOperationResult2[FileOperationResult2["FILE_PERMISSION_DENIED"] = 6] = "FILE_PERMISSION_DENIED";
  FileOperationResult2[FileOperationResult2["FILE_TOO_LARGE"] = 7] = "FILE_TOO_LARGE";
  FileOperationResult2[FileOperationResult2["FILE_INVALID_PATH"] = 8] = "FILE_INVALID_PATH";
  FileOperationResult2[FileOperationResult2["FILE_NOT_DIRECTORY"] = 9] = "FILE_NOT_DIRECTORY";
  FileOperationResult2[FileOperationResult2["FILE_OTHER_ERROR"] = 10] = "FILE_OTHER_ERROR";
  return FileOperationResult2;
})(FileOperationResult || {});
const AutoSaveConfiguration = {
  OFF: "off",
  AFTER_DELAY: "afterDelay",
  ON_FOCUS_CHANGE: "onFocusChange",
  ON_WINDOW_CHANGE: "onWindowChange"
};
const HotExitConfiguration = {
  OFF: "off",
  ON_EXIT: "onExit",
  ON_EXIT_AND_WINDOW_CLOSE: "onExitAndWindowClose"
};
const FILES_ASSOCIATIONS_CONFIG = "files.associations";
const FILES_EXCLUDE_CONFIG = "files.exclude";
const FILES_READONLY_INCLUDE_CONFIG = "files.readonlyInclude";
const FILES_READONLY_EXCLUDE_CONFIG = "files.readonlyExclude";
const FILES_READONLY_FROM_PERMISSIONS_CONFIG = "files.readonlyFromPermissions";
var FileKind = /* @__PURE__ */ ((FileKind2) => {
  FileKind2[FileKind2["FILE"] = 0] = "FILE";
  FileKind2[FileKind2["FOLDER"] = 1] = "FOLDER";
  FileKind2[FileKind2["ROOT_FOLDER"] = 2] = "ROOT_FOLDER";
  return FileKind2;
})(FileKind || {});
const ETAG_DISABLED = "";
function etag(stat) {
  if (typeof stat.size !== "number" || typeof stat.mtime !== "number") {
    return void 0;
  }
  return stat.mtime.toString(29) + stat.size.toString(31);
}
async function whenProviderRegistered(file, fileService) {
  if (fileService.hasProvider(URI.from({ scheme: file.scheme }))) {
    return;
  }
  return new Promise((resolve) => {
    const disposable = fileService.onDidChangeFileSystemProviderRegistrations((e) => {
      if (e.scheme === file.scheme && e.added) {
        disposable.dispose();
        resolve();
      }
    });
  });
}
const _ByteSize = class _ByteSize {
  static formatSize(size) {
    if (!isNumber(size)) {
      size = 0;
    }
    if (size < _ByteSize.KB) {
      return localize("sizeB", "{0}B", size.toFixed(0));
    }
    if (size < _ByteSize.MB) {
      return localize("sizeKB", "{0}KB", (size / _ByteSize.KB).toFixed(2));
    }
    if (size < _ByteSize.GB) {
      return localize("sizeMB", "{0}MB", (size / _ByteSize.MB).toFixed(2));
    }
    if (size < _ByteSize.TB) {
      return localize("sizeGB", "{0}GB", (size / _ByteSize.GB).toFixed(2));
    }
    return localize("sizeTB", "{0}TB", (size / _ByteSize.TB).toFixed(2));
  }
};
_ByteSize.KB = 1024;
_ByteSize.MB = _ByteSize.KB * _ByteSize.KB;
_ByteSize.GB = _ByteSize.MB * _ByteSize.KB;
_ByteSize.TB = _ByteSize.GB * _ByteSize.KB;
let ByteSize = _ByteSize;
function getLargeFileConfirmationLimit(arg) {
  const isRemote = typeof arg === "string" || arg?.scheme === Schemas.vscodeRemote;
  const isLocal = typeof arg !== "string" && arg?.scheme === Schemas.file;
  if (isLocal) {
    return 1024 * ByteSize.MB;
  }
  if (isRemote) {
    return 10 * ByteSize.MB;
  }
  if (isWeb) {
    return 50 * ByteSize.MB;
  }
  return 1024 * ByteSize.MB;
}
export {
  AutoSaveConfiguration,
  ByteSize,
  ETAG_DISABLED,
  FILES_ASSOCIATIONS_CONFIG,
  FILES_EXCLUDE_CONFIG,
  FILES_READONLY_EXCLUDE_CONFIG,
  FILES_READONLY_FROM_PERMISSIONS_CONFIG,
  FILES_READONLY_INCLUDE_CONFIG,
  FileChangeFilter,
  FileChangeType,
  FileChangesEvent,
  FileKind,
  FileOperation,
  FileOperationError,
  FileOperationEvent,
  FileOperationResult,
  FilePermission,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  HotExitConfiguration,
  IFileService,
  NotModifiedSinceFileOperationError,
  TooLargeFileOperationError,
  createFileSystemProviderError,
  ensureFileSystemProviderError,
  etag,
  getLargeFileConfirmationLimit,
  hasFileAppendCapability,
  hasFileAtomicDeleteCapability,
  hasFileAtomicReadCapability,
  hasFileAtomicWriteCapability,
  hasFileCloneCapability,
  hasFileFolderCopyCapability,
  hasFileReadStreamCapability,
  hasFileRealpathCapability,
  hasOpenReadWriteCloseCapability,
  hasReadWriteCapability,
  hasReadonlyCapability,
  isFileOpenForWriteOptions,
  isFileSystemWatcher,
  isParent,
  markAsFileSystemProviderError,
  toFileOperationResult,
  toFileSystemProviderErrorCode,
  whenProviderRegistered
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXGNvbW1vblxcZmlsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHByZXNzaW9uLCBJUmVsYXRpdmVQYXR0ZXJuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IHNlcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUmVhZGFibGVTdHJlYW1FdmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgc3RhcnRzV2l0aElnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5cbi8vI3JlZ2lvbiBmaWxlIHNlcnZpY2UgJiBwcm92aWRlcnNcblxuZXhwb3J0IGNvbnN0IElGaWxlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRmlsZVNlcnZpY2U+KCdmaWxlU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGlzIGZpcmVkIHdoZW4gYSBmaWxlIHN5c3RlbSBwcm92aWRlciBpcyBhZGRlZCBvciByZW1vdmVkXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnM6IEV2ZW50PElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiBhIHJlZ2lzdGVyZWQgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgY2hhbmdlcyBpdHMgY2FwYWJpbGl0aWVzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXM6IEV2ZW50PElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiBhIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGlzIGFib3V0IHRvIGJlIGFjdGl2YXRlZC4gTGlzdGVuZXJzXG5cdCAqIGNhbiBqb2luIHRoaXMgZXZlbnQgd2l0aCBhIGxvbmcgcnVubmluZyBwcm9taXNlIHRvIGhlbHAgaW4gdGhlIGFjdGl2YXRpb24gcHJvY2Vzcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyOiBFdmVudDxJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50PjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZm9yIGEgY2VydGFpbiBzY2hlbWUuXG5cdCAqL1xuXHRyZWdpc3RlclByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZm9yIGEgY2VydGFpbiBzY2hlbWUuXG5cdCAqL1xuXHRnZXRQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IElGaWxlU3lzdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRyaWVzIHRvIGFjdGl2YXRlIGEgcHJvdmlkZXIgd2l0aCB0aGUgZ2l2ZW4gc2NoZW1lLlxuXHQgKi9cblx0YWN0aXZhdGVQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGlzIGZpbGUgc2VydmljZSBjYW4gaGFuZGxlIHRoZSBnaXZlbiByZXNvdXJjZSBieVxuXHQgKiBmaXJzdCBhY3RpdmF0aW5nIGFueSBleHRlbnNpb24gdGhhdCB3YW50cyB0byBiZSBhY3RpdmF0ZWRcblx0ICogb24gdGhlIHByb3ZpZGVkIHJlc291cmNlIHNjaGVtZSB0byBpbmNsdWRlIGV4dGVuc2lvbnMgdGhhdFxuXHQgKiBjb250cmlidXRlIGZpbGUgc3lzdGVtIHByb3ZpZGVycyBmb3IgdGhlIGdpdmVuIHJlc291cmNlLlxuXHQgKi9cblx0Y2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGUgZmlsZSBzZXJ2aWNlIGhhcyBhIHJlZ2lzdGVyZWQgcHJvdmlkZXIgZm9yIHRoZVxuXHQgKiBwcm92aWRlZCByZXNvdXJjZS5cblx0ICpcblx0ICogTm90ZTogdGhpcyBkb2VzIE5PVCBhY2NvdW50IGZvciBjb250cmlidXRlZCBwcm92aWRlcnMgZnJvbVxuXHQgKiBleHRlbnNpb25zIHRoYXQgaGF2ZSBub3QgYmVlbiBhY3RpdmF0ZWQgeWV0LiBUbyBpbmNsdWRlIHRob3NlLFxuXHQgKiBjb25zaWRlciB0byBjYWxsIGBhd2FpdCBmaWxlU2VydmljZS5jYW5IYW5kbGVSZXNvdXJjZShyZXNvdXJjZSlgLlxuXHQgKi9cblx0aGFzUHJvdmlkZXIocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGUgcHJvdmlkZXIgZm9yIHRoZSBwcm92aWRlZCByZXNvdXJjZSBoYXMgdGhlIHByb3ZpZGVkIGZpbGUgc3lzdGVtIGNhcGFiaWxpdHkuXG5cdCAqL1xuXHRoYXNDYXBhYmlsaXR5KHJlc291cmNlOiBVUkksIGNhcGFiaWxpdHk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIExpc3QgdGhlIHNjaGVtZXMgYW5kIGNhcGFiaWxpdGllcyBmb3IgcmVnaXN0ZXJlZCBmaWxlIHN5c3RlbSBwcm92aWRlcnNcblx0ICovXG5cdGxpc3RDYXBhYmlsaXRpZXMoKTogSXRlcmFibGU8eyBzY2hlbWU6IHN0cmluZzsgY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfT47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBsaXN0ZW4gZm9yIGZpbGUgY2hhbmdlcy4gVGhlIGV2ZW50IHdpbGwgZmlyZSBmb3IgZXZlcnkgZmlsZSB3aXRoaW4gdGhlIG9wZW5lZCB3b3Jrc3BhY2Vcblx0ICogKGlmIGFueSkgYXMgd2VsbCBhcyBhbGwgZmlsZXMgdGhhdCBoYXZlIGJlZW4gd2F0Y2hlZCBleHBsaWNpdGx5IHVzaW5nIHRoZSAjd2F0Y2goKSBBUEkuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZEZpbGVzQ2hhbmdlOiBFdmVudDxGaWxlQ2hhbmdlc0V2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBpcyBmaXJlZCB1cG9uIHN1Y2Nlc3NmdWwgY29tcGxldGlvbiBvZiBhIGNlcnRhaW4gZmlsZSBvcGVyYXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFJ1bk9wZXJhdGlvbjogRXZlbnQ8RmlsZU9wZXJhdGlvbkV2ZW50PjtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgcHJvcGVydGllcyBvZiBhIGZpbGUvZm9sZGVyIGlkZW50aWZpZWQgYnkgdGhlIHJlc291cmNlLiBGb3IgYSBmb2xkZXIsIGNoaWxkcmVuXG5cdCAqIGluZm9ybWF0aW9uIGlzIHJlc29sdmVkIGFzIHdlbGwgZGVwZW5kaW5nIG9uIHRoZSBwcm92aWRlZCBvcHRpb25zLiBVc2UgYHN0YXQoKWAgbWV0aG9kIGlmXG5cdCAqIHlvdSBkbyBub3QgbmVlZCBjaGlsZHJlbiBpbmZvcm1hdGlvbi5cblx0ICpcblx0ICogSWYgdGhlIG9wdGlvbmFsIHBhcmFtZXRlciBcInJlc29sdmVUb1wiIGlzIHNwZWNpZmllZCBpbiBvcHRpb25zLCB0aGUgc3RhdCBzZXJ2aWNlIGlzIGFza2VkXG5cdCAqIHRvIHByb3ZpZGUgYSBzdGF0IG9iamVjdCB0aGF0IHNob3VsZCBjb250YWluIHRoZSBmdWxsIGdyYXBoIG9mIGZvbGRlcnMgdXAgdG8gYWxsIG9mIHRoZVxuXHQgKiB0YXJnZXQgcmVzb3VyY2VzLlxuXHQgKlxuXHQgKiBJZiB0aGUgb3B0aW9uYWwgcGFyYW1ldGVyIFwicmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHNcIiBpcyBzcGVjaWZpZWQgaW4gb3B0aW9ucyxcblx0ICogdGhlIHN0YXQgc2VydmljZSBpcyBhc2tlZCB0byBhdXRvbWF0aWNhbGx5IHJlc29sdmUgY2hpbGQgZm9sZGVycyB0aGF0IG9ubHlcblx0ICogY29udGFpbiBhIHNpbmdsZSBlbGVtZW50LlxuXHQgKlxuXHQgKiBJZiB0aGUgb3B0aW9uYWwgcGFyYW1ldGVyIFwicmVzb2x2ZU1ldGFkYXRhXCIgaXMgc3BlY2lmaWVkIGluIG9wdGlvbnMsXG5cdCAqIHRoZSBzdGF0IHdpbGwgY29udGFpbiBtZXRhZGF0YSBpbmZvcm1hdGlvbiBzdWNoIGFzIHNpemUsIG10aW1lIGFuZCBldGFnLlxuXHQgKi9cblx0cmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT47XG5cdHJlc29sdmUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdD47XG5cblx0LyoqXG5cdCAqIFNhbWUgYXMgYHJlc29sdmUoKWAgYnV0IHN1cHBvcnRzIHJlc29sdmluZyBtdWx0aXBsZSByZXNvdXJjZXMgaW4gcGFyYWxsZWwuXG5cdCAqXG5cdCAqIElmIG9uZSBvZiB0aGUgcmVzb2x2ZSB0YXJnZXRzIGZhaWxzIHRvIHJlc29sdmUgcmV0dXJucyBhIGZha2UgYElGaWxlU3RhdGAgaW5zdGVhZCBvZlxuXHQgKiBtYWtpbmcgdGhlIHdob2xlIGNhbGwgZmFpbC5cblx0ICovXG5cdHJlc29sdmVBbGwodG9SZXNvbHZlOiB7IHJlc291cmNlOiBVUkk7IG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPjtcblx0cmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSTsgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMgfVtdKTogUHJvbWlzZTxJRmlsZVN0YXRSZXN1bHRbXT47XG5cblx0LyoqXG5cdCAqIFNhbWUgYXMgYHJlc29sdmUoKWAgYnV0IHdpdGhvdXQgcmVzb2x2aW5nIHRoZSBjaGlsZHJlbiBvZiBhIGZvbGRlciBpZiB0aGVcblx0ICogcmVzb3VyY2UgaXMgcG9pbnRpbmcgdG8gYSBmb2xkZXIuXG5cdCAqL1xuXHRzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGE+O1xuXG5cdC8qKlxuXHQgKiBBdHRlbXB0cyB0byByZXNvbHZlIHRoZSByZWFsIHBhdGggb2YgdGhlIHByb3ZpZGVkIHJlc291cmNlLiBUaGUgcmVhbCBwYXRoIGNhbiBiZVxuXHQgKiBkaWZmZXJlbnQgZnJvbSB0aGUgcmVzb3VyY2UgcGF0aCBmb3IgZXhhbXBsZSB3aGVuIGl0IGlzIGEgc3ltbGluay5cblx0ICpcblx0ICogV2lsbCByZXR1cm4gYHVuZGVmaW5lZGAgaWYgdGhlIHJlYWwgcGF0aCBjYW5ub3QgYmUgcmVzb2x2ZWQuXG5cdCAqL1xuXHRyZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBGaW5kcyBvdXQgaWYgYSBmaWxlL2ZvbGRlciBpZGVudGlmaWVkIGJ5IHRoZSByZXNvdXJjZSBleGlzdHMuXG5cdCAqL1xuXHRleGlzdHMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFJlYWQgdGhlIGNvbnRlbnRzIG9mIHRoZSBwcm92aWRlZCByZXNvdXJjZSB1bmJ1ZmZlcmVkLlxuXHQgKi9cblx0cmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlQ29udGVudD47XG5cblx0LyoqXG5cdCAqIFJlYWQgdGhlIGNvbnRlbnRzIG9mIHRoZSBwcm92aWRlZCByZXNvdXJjZSBidWZmZXJlZCBhcyBzdHJlYW0uXG5cdCAqL1xuXHRyZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlU3RyZWFtT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVTdHJlYW1Db250ZW50PjtcblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgY29udGVudCByZXBsYWNpbmcgaXRzIHByZXZpb3VzIHZhbHVlLlxuXHQgKiBJZiBgb3B0aW9ucy5hcHBlbmRgIGlzIHRydWUsIGFwcGVuZHMgY29udGVudCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlIGluc3RlYWQuXG5cdCAqXG5cdCAqIEVtaXRzIGEgYEZpbGVPcGVyYXRpb24uV1JJVEVgIGZpbGUgb3BlcmF0aW9uIGV2ZW50IHdoZW4gc3VjY2Vzc2Z1bC5cblx0ICovXG5cdHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW06IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIG9wdGlvbnM/OiBJV3JpdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblxuXHQvKipcblx0ICogTW92ZXMgdGhlIGZpbGUvZm9sZGVyIHRvIGEgbmV3IHBhdGggaWRlbnRpZmllZCBieSB0aGUgcmVzb3VyY2UuXG5cdCAqXG5cdCAqIFRoZSBvcHRpb25hbCBwYXJhbWV0ZXIgb3ZlcndyaXRlIGNhbiBiZSBzZXQgdG8gcmVwbGFjZSBhbiBleGlzdGluZyBmaWxlIGF0IHRoZSBsb2NhdGlvbi5cblx0ICpcblx0ICogRW1pdHMgYSBgRmlsZU9wZXJhdGlvbi5NT1ZFYCBmaWxlIG9wZXJhdGlvbiBldmVudCB3aGVuIHN1Y2Nlc3NmdWwuXG5cdCAqL1xuXHRtb3ZlKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblxuXHQvKipcblx0ICogRmluZCBvdXQgaWYgYSBtb3ZlIG9wZXJhdGlvbiBpcyBwb3NzaWJsZSBnaXZlbiB0aGUgYXJndW1lbnRzLiBObyBjaGFuZ2VzIG9uIGRpc2sgd2lsbFxuXHQgKiBiZSBwZXJmb3JtZWQuIFJldHVybnMgYW4gRXJyb3IgaWYgdGhlIG9wZXJhdGlvbiBjYW5ub3QgYmUgZG9uZS5cblx0ICovXG5cdGNhbk1vdmUoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxFcnJvciB8IHRydWU+O1xuXG5cdC8qKlxuXHQgKiBDb3BpZXMgdGhlIGZpbGUvZm9sZGVyIHRvIGEgcGF0aCBpZGVudGlmaWVkIGJ5IHRoZSByZXNvdXJjZS4gQSBmb2xkZXIgaXMgY29waWVkXG5cdCAqIHJlY3Vyc2l2ZWx5LlxuXHQgKlxuXHQgKiBFbWl0cyBhIGBGaWxlT3BlcmF0aW9uLkNPUFlgIGZpbGUgb3BlcmF0aW9uIGV2ZW50IHdoZW4gc3VjY2Vzc2Z1bC5cblx0ICovXG5cdGNvcHkoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXG5cdC8qKlxuXHQgKiBGaW5kIG91dCBpZiBhIGNvcHkgb3BlcmF0aW9uIGlzIHBvc3NpYmxlIGdpdmVuIHRoZSBhcmd1bWVudHMuIE5vIGNoYW5nZXMgb24gZGlzayB3aWxsXG5cdCAqIGJlIHBlcmZvcm1lZC4gUmV0dXJucyBhbiBFcnJvciBpZiB0aGUgb3BlcmF0aW9uIGNhbm5vdCBiZSBkb25lLlxuXHQgKi9cblx0Y2FuQ29weShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT47XG5cblx0LyoqXG5cdCAqIENsb25lcyBhIGZpbGUgdG8gYSBwYXRoIGlkZW50aWZpZWQgYnkgdGhlIHJlc291cmNlLiBGb2xkZXJzIGFyZSBub3Qgc3VwcG9ydGVkLlxuXHQgKlxuXHQgKiBJZiB0aGUgdGFyZ2V0IHBhdGggZXhpc3RzLCBpdCB3aWxsIGJlIG92ZXJ3cml0dGVuLlxuXHQgKi9cblx0Y2xvbmVGaWxlKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgZmlsZSB3aXRoIHRoZSBnaXZlbiBwYXRoIGFuZCBvcHRpb25hbCBjb250ZW50cy4gVGhlIHJldHVybmVkIHByb21pc2Vcblx0ICogd2lsbCBoYXZlIHRoZSBzdGF0IG1vZGVsIG9iamVjdCBhcyBhIHJlc3VsdC5cblx0ICpcblx0ICogVGhlIG9wdGlvbmFsIHBhcmFtZXRlciBjb250ZW50IGNhbiBiZSB1c2VkIGFzIHZhbHVlIHRvIGZpbGwgaW50byB0aGUgbmV3IGZpbGUuXG5cdCAqXG5cdCAqIEVtaXRzIGEgYEZpbGVPcGVyYXRpb24uQ1JFQVRFYCBmaWxlIG9wZXJhdGlvbiBldmVudCB3aGVuIHN1Y2Nlc3NmdWwuXG5cdCAqL1xuXHRjcmVhdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbT86IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT47XG5cblx0LyoqXG5cdCAqIEZpbmQgb3V0IGlmIGEgZmlsZSBjcmVhdGUgb3BlcmF0aW9uIGlzIHBvc3NpYmxlIGdpdmVuIHRoZSBhcmd1bWVudHMuIE5vIGNoYW5nZXMgb24gZGlzayB3aWxsXG5cdCAqIGJlIHBlcmZvcm1lZC4gUmV0dXJucyBhbiBFcnJvciBpZiB0aGUgb3BlcmF0aW9uIGNhbm5vdCBiZSBkb25lLlxuXHQgKi9cblx0Y2FuQ3JlYXRlRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUNyZWF0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxFcnJvciB8IHRydWU+O1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IGZvbGRlciB3aXRoIHRoZSBnaXZlbiBwYXRoLiBUaGUgcmV0dXJuZWQgcHJvbWlzZVxuXHQgKiB3aWxsIGhhdmUgdGhlIHN0YXQgbW9kZWwgb2JqZWN0IGFzIGEgcmVzdWx0LlxuXHQgKlxuXHQgKiBFbWl0cyBhIGBGaWxlT3BlcmF0aW9uLkNSRUFURWAgZmlsZSBvcGVyYXRpb24gZXZlbnQgd2hlbiBzdWNjZXNzZnVsLlxuXHQgKi9cblx0Y3JlYXRlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT47XG5cblx0LyoqXG5cdCAqIERlbGV0ZXMgdGhlIHByb3ZpZGVkIGZpbGUuIFRoZSBvcHRpb25hbCB1c2VUcmFzaCBwYXJhbWV0ZXIgYWxsb3dzIHRvXG5cdCAqIG1vdmUgdGhlIGZpbGUgdG8gdHJhc2guIFRoZSBvcHRpb25hbCByZWN1cnNpdmUgcGFyYW1ldGVyIGFsbG93cyB0byBkZWxldGVcblx0ICogbm9uLWVtcHR5IGZvbGRlcnMgcmVjdXJzaXZlbHkuXG5cdCAqXG5cdCAqIEVtaXRzIGEgYEZpbGVPcGVyYXRpb24uREVMRVRFYCBmaWxlIG9wZXJhdGlvbiBldmVudCB3aGVuIHN1Y2Nlc3NmdWwuXG5cdCAqL1xuXHRkZWwocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IFBhcnRpYWw8SUZpbGVEZWxldGVPcHRpb25zPik6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIEZpbmQgb3V0IGlmIGEgZGVsZXRlIG9wZXJhdGlvbiBpcyBwb3NzaWJsZSBnaXZlbiB0aGUgYXJndW1lbnRzLiBObyBjaGFuZ2VzIG9uIGRpc2sgd2lsbFxuXHQgKiBiZSBwZXJmb3JtZWQuIFJldHVybnMgYW4gRXJyb3IgaWYgdGhlIG9wZXJhdGlvbiBjYW5ub3QgYmUgZG9uZS5cblx0ICovXG5cdGNhbkRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogUGFydGlhbDxJRmlsZURlbGV0ZU9wdGlvbnM+KTogUHJvbWlzZTxFcnJvciB8IHRydWU+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IHNpZ25hbHMgYW4gZXJyb3Igd2hlbiB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRXYXRjaEVycm9yOiBFdmVudDxFcnJvcj47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBzdGFydCBhIHdhdGNoZXIgdGhhdCByZXBvcnRzIGZpbGUvZm9sZGVyIGNoYW5nZSBldmVudHMgb24gdGhlIHByb3ZpZGVkIHJlc291cmNlLlxuXHQgKlxuXHQgKiBUaGUgd2F0Y2hlciBydW5zIGNvcnJlbGF0ZWQgYW5kIHRodXMsIGZpbGUgZXZlbnRzIHdpbGwgYmUgcmVwb3J0ZWQgb24gdGhlIHJldHVybmVkXG5cdCAqIGBJRmlsZVN5c3RlbVdhdGNoZXJgIGFuZCBub3Qgb24gdGhlIGdlbmVyaWMgYElGaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlYCBldmVudC5cblx0ICpcblx0ICogTm90ZTogb25seSBub24tcmVjdXJzaXZlIGZpbGUgd2F0Y2hpbmcgc3VwcG9ydHMgZXZlbnQgY29ycmVsYXRpb24gZm9yIG5vdy5cblx0ICovXG5cdGNyZWF0ZVdhdGNoZXIocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdhdGNoT3B0aW9uc1dpdGhvdXRDb3JyZWxhdGlvbiAmIHsgcmVjdXJzaXZlOiBmYWxzZSB9KTogSUZpbGVTeXN0ZW1XYXRjaGVyO1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gc3RhcnQgYSB3YXRjaGVyIHRoYXQgcmVwb3J0cyBmaWxlL2ZvbGRlciBjaGFuZ2UgZXZlbnRzIG9uIHRoZSBwcm92aWRlZCByZXNvdXJjZS5cblx0ICpcblx0ICogVGhlIHdhdGNoZXIgcnVucyB1bmNvcnJlbGF0ZWQgYW5kIHRodXMgd2lsbCByZXBvcnQgYWxsIGV2ZW50cyBmcm9tIGBJRmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZWAuXG5cdCAqIFRoaXMgbWVhbnMsIG1vc3QgbGlzdGVuZXJzIGluIHRoZSBhcHBsaWNhdGlvbiB3aWxsIHJlY2VpdmUgeW91ciBldmVudHMuIEl0IGlzIGVuY291cmFnZWQgdG9cblx0ICogdXNlIGNvcnJlbGF0ZWQgd2F0Y2hlcnMgKHZpYSBgSVdhdGNoT3B0aW9uc1dpdGhDb3JyZWxhdGlvbmApIHRvIGxpbWl0IGV2ZW50cyB0byB5b3VyIGxpc3RlbmVyLlxuXHQqL1xuXHR3YXRjaChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVdhdGNoT3B0aW9uc1dpdGhvdXRDb3JyZWxhdGlvbik6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBGcmVlcyB1cCBhbnkgcmVzb3VyY2VzIG9jY3VwaWVkIGJ5IHRoaXMgc2VydmljZS5cblx0ICovXG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBTZXQgdG8gYHRydWVgIHRvIG92ZXJ3cml0ZSBhIGZpbGUgaWYgaXQgZXhpc3RzLiBXaWxsXG5cdCAqIHRocm93IGFuIGVycm9yIG90aGVyd2lzZSBpZiB0aGUgZmlsZSBkb2VzIGV4aXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgb3ZlcndyaXRlOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlVW5sb2NrT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgdG8gdHJ5IHRvIHJlbW92ZSBhbnkgd3JpdGUgbG9ja3MgdGhlIGZpbGUgbWlnaHRcblx0ICogaGF2ZS4gQSBmaWxlIHRoYXQgaXMgd3JpdGUgbG9ja2VkIHdpbGwgdGhyb3cgYW4gZXJyb3IgZm9yIGFueVxuXHQgKiBhdHRlbXB0IHRvIHdyaXRlIHRvIHVubGVzcyBgdW5sb2NrOiB0cnVlYCBpcyBwcm92aWRlZC5cblx0ICovXG5cdHJlYWRvbmx5IHVubG9jazogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUF0b21pY1JlYWRPcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIG9wdGlvbmFsIGBhdG9taWNgIGZsYWcgY2FuIGJlIHVzZWQgdG8gbWFrZSBzdXJlXG5cdCAqIHRoZSBgcmVhZEZpbGVgIG1ldGhvZCBpcyBub3QgcnVubmluZyBpbiBwYXJhbGxlbCB3aXRoXG5cdCAqIGFueSBgd3JpdGVgIG9wZXJhdGlvbnMgaW4gdGhlIHNhbWUgcHJvY2Vzcy5cblx0ICpcblx0ICogVHlwaWNhbGx5IHlvdSBzaG91bGQgbm90IG5lZWQgdG8gdXNlIHRoaXMgZmxhZyBidXQgaWZcblx0ICogZm9yIGV4YW1wbGUgeW91IGFyZSBxdWlja2x5IHJlYWRpbmcgYSBmaWxlIHJpZ2h0IGFmdGVyXG5cdCAqIGEgZmlsZSBldmVudCBvY2N1cnJlZCBhbmQgdGhlIGZpbGUgY2hhbmdlcyBhIGxvdCwgdGhlcmVcblx0ICogaXMgYSBjaGFuY2UgdGhhdCBhIHJlYWQgcmV0dXJucyBhbiBlbXB0eSBvciBwYXJ0aWFsIGZpbGVcblx0ICogYmVjYXVzZSBhIHBlbmRpbmcgd3JpdGUgaGFzIG5vdCBmaW5pc2hlZCB5ZXQuXG5cdCAqXG5cdCAqIE5vdGU6IHRoaXMgZG9lcyBub3QgcHJldmVudCB0aGUgZmlsZSBmcm9tIGJlaW5nIHdyaXR0ZW5cblx0ICogdG8gZnJvbSBhIGRpZmZlcmVudCBwcm9jZXNzLiBJZiB5b3UgbmVlZCBzdWNoIGF0b21pY1xuXHQgKiBvcGVyYXRpb25zLCB5b3UgYmV0dGVyIHVzZSBhIHJlYWwgZGF0YWJhc2UgYXMgc3RvcmFnZS5cblx0ICovXG5cdHJlYWRvbmx5IGF0b21pYzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUF0b21pY09wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgcG9zdGZpeCBpcyB1c2VkIHRvIGNyZWF0ZSBhIHRlbXBvcmFyeSBmaWxlIGJhc2VkXG5cdCAqIG9uIHRoZSBvcmlnaW5hbCByZXNvdXJjZS4gVGhlIHJlc3VsdGluZyB0ZW1wb3Jhcnlcblx0ICogZmlsZSB3aWxsIGJlIGluIHRoZSBzYW1lIGZvbGRlciBhcyB0aGUgcmVzb3VyY2UgYW5kXG5cdCAqIGhhdmUgYHBvc3RmaXhgIGFwcGVuZGVkIHRvIHRoZSByZXNvdXJjZSBuYW1lLlxuXHQgKlxuXHQgKiBFeGFtcGxlOiBnaXZlbiBhIGZpbGUgcmVzb3VyY2UgYGZpbGU6Ly8vc29tZS9wYXRoL2Zvby50eHRgXG5cdCAqIGFuZCBhIHBvc3RmaXggYC52c2N0bXBgLCB0aGUgdGVtcG9yYXJ5IGZpbGUgd2lsbCBiZVxuXHQgKiBjcmVhdGVkIGFzIGBmaWxlOi8vL3NvbWUvcGF0aC9mb28udHh0LnZzY3RtcGAuXG5cdCAqL1xuXHRyZWFkb25seSBwb3N0Zml4OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVBdG9taWNXcml0ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGB3cml0ZUZpbGVgIG1ldGhvZCB1cGRhdGVzIHRoZSB0YXJnZXQgZmlsZSBhdG9taWNhbGx5XG5cdCAqIGJ5IGZpcnN0IHdyaXRpbmcgdG8gYSB0ZW1wb3JhcnkgZmlsZSBpbiB0aGUgc2FtZSBmb2xkZXJcblx0ICogYW5kIHRoZW4gcmVuYW1pbmcgaXQgb3ZlciB0aGUgdGFyZ2V0LlxuXHQgKi9cblx0cmVhZG9ubHkgYXRvbWljOiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUF0b21pY0RlbGV0ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGBkZWxldGVgIG1ldGhvZCBkZWxldGVzIHRoZSB0YXJnZXQgYXRvbWljYWxseSBieVxuXHQgKiBmaXJzdCByZW5hbWluZyBpdCB0byBhIHRlbXBvcmFyeSByZXNvdXJjZSBpbiB0aGUgc2FtZVxuXHQgKiBmb2xkZXIgYW5kIHRoZW4gZGVsZXRpbmcgaXQuXG5cdCAqL1xuXHRyZWFkb25seSBhdG9taWM6IElGaWxlQXRvbWljT3B0aW9ucyB8IGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlUmVhZExpbWl0cyB7XG5cblx0LyoqXG5cdCAqIElmIHRoZSBmaWxlIGV4Y2VlZHMgdGhlIGdpdmVuIHNpemUsIGFuIGVycm9yIG9mIGtpbmRcblx0ICogYEZJTEVfVE9PX0xBUkdFYCB3aWxsIGJlIHRocm93bi5cblx0ICovXG5cdHNpemU/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVSZWFkU3RyZWFtT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIElzIGFuIGludGVnZXIgc3BlY2lmeWluZyB3aGVyZSB0byBiZWdpbiByZWFkaW5nIGZyb20gaW4gdGhlIGZpbGUuIElmIHBvc2l0aW9uIGlzIHVuZGVmaW5lZCxcblx0ICogZGF0YSB3aWxsIGJlIHJlYWQgZnJvbSB0aGUgY3VycmVudCBmaWxlIHBvc2l0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgcG9zaXRpb24/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIElzIGFuIGludGVnZXIgc3BlY2lmeWluZyBob3cgbWFueSBieXRlcyB0byByZWFkIGZyb20gdGhlIGZpbGUuIEJ5IGRlZmF1bHQsIGFsbCBieXRlc1xuXHQgKiB3aWxsIGJlIHJlYWQuXG5cdCAqL1xuXHRyZWFkb25seSBsZW5ndGg/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIElmIHByb3ZpZGVkLCB0aGUgc2l6ZSBvZiB0aGUgZmlsZSB3aWxsIGJlIGNoZWNrZWQgYWdhaW5zdCB0aGUgbGltaXRzXG5cdCAqIGFuZCBhbiBlcnJvciB3aWxsIGJlIHRocm93biBpZiBhbnkgbGltaXQgaXMgZXhjZWVkZWQuXG5cdCAqL1xuXHRyZWFkb25seSBsaW1pdHM/OiBJRmlsZVJlYWRMaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVXcml0ZU9wdGlvbnMgZXh0ZW5kcyBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMsIElGaWxlVW5sb2NrT3B0aW9ucywgSUZpbGVBdG9taWNXcml0ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBTZXQgdG8gYHRydWVgIHRvIGNyZWF0ZSBhIGZpbGUgd2hlbiBpdCBkb2VzIG5vdCBleGlzdC4gV2lsbFxuXHQgKiB0aHJvdyBhbiBlcnJvciBvdGhlcndpc2UgaWYgdGhlIGZpbGUgZG9lcyBub3QgZXhpc3QuXG5cdCAqL1xuXHRyZWFkb25seSBjcmVhdGU6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgdG8gYXBwZW5kIGNvbnRlbnQgdG8gdGhlIGVuZCBvZiB0aGUgZmlsZS4gSW1wbGllcyBgY3JlYXRlOiB0cnVlYCxcblx0ICogYW5kIHNldCBvbmx5IHdoZW4gdGhlIGNvcnJlc3BvbmRpbmcgYEZpbGVBcHBlbmRgIGNhcGFiaWxpdHkgaXMgZGVmaW5lZC5cblx0ICovXG5cdHJlYWRvbmx5IGFwcGVuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElGaWxlT3Blbk9wdGlvbnMgPSBJRmlsZU9wZW5Gb3JSZWFkT3B0aW9ucyB8IElGaWxlT3BlbkZvcldyaXRlT3B0aW9ucztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlsZU9wZW5Gb3JXcml0ZU9wdGlvbnMob3B0aW9uczogSUZpbGVPcGVuT3B0aW9ucyk6IG9wdGlvbnMgaXMgSUZpbGVPcGVuRm9yV3JpdGVPcHRpb25zIHtcblx0cmV0dXJuIG9wdGlvbnMuY3JlYXRlID09PSB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlT3BlbkZvclJlYWRPcHRpb25zIHtcblxuXHQvKipcblx0ICogQSBoaW50IHRoYXQgdGhlIGZpbGUgc2hvdWxkIGJlIG9wZW5lZCBmb3IgcmVhZGluZyBvbmx5LlxuXHQgKi9cblx0cmVhZG9ubHkgY3JlYXRlOiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZU9wZW5Gb3JXcml0ZU9wdGlvbnMgZXh0ZW5kcyBJRmlsZVVubG9ja09wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBBIGhpbnQgdGhhdCB0aGUgZmlsZSBzaG91bGQgYmUgb3BlbmVkIGZvciByZWFkaW5nIGFuZCB3cml0aW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgY3JlYXRlOiB0cnVlO1xuXG5cdC8qKlxuXHQgKiBPcGVuIHRoZSBmaWxlIGluIGFwcGVuZCBtb2RlLiBUaGlzIHdpbGwgd3JpdGUgZGF0YSB0byB0aGVcblx0ICogZW5kIG9mIHRoZSBmaWxlLlxuXHQgKi9cblx0cmVhZG9ubHkgYXBwZW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZURlbGV0ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBTZXQgdG8gYHRydWVgIHRvIHJlY3Vyc2l2ZWx5IGRlbGV0ZSBhbnkgY2hpbGRyZW4gb2YgdGhlIGZpbGUuIFRoaXNcblx0ICogb25seSBhcHBsaWVzIHRvIGZvbGRlcnMgYW5kIGNhbiBsZWFkIHRvIGFuIGVycm9yIHVubGVzcyBwcm92aWRlZFxuXHQgKiBpZiB0aGUgZm9sZGVyIGlzIG5vdCBlbXB0eS5cblx0ICovXG5cdHJlYWRvbmx5IHJlY3Vyc2l2ZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2V0IHRvIGB0cnVlYCB0byBhdHRlbXB0IHRvIG1vdmUgdGhlIGZpbGUgdG8gdHJhc2hcblx0ICogaW5zdGVhZCBvZiBkZWxldGluZyBpdCBwZXJtYW5lbnRseSBmcm9tIGRpc2suXG5cdCAqXG5cdCAqIFRoaXMgb3B0aW9uIG1heWJlIG5vdCBiZSBzdXBwb3J0ZWQgb24gYWxsIHByb3ZpZGVycy5cblx0ICovXG5cdHJlYWRvbmx5IHVzZVRyYXNoOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGBkZWxldGVgIG1ldGhvZCBkZWxldGVzIHRoZSB0YXJnZXQgYXRvbWljYWxseSBieVxuXHQgKiBmaXJzdCByZW5hbWluZyBpdCB0byBhIHRlbXBvcmFyeSByZXNvdXJjZSBpbiB0aGUgc2FtZVxuXHQgKiBmb2xkZXIgYW5kIHRoZW4gZGVsZXRpbmcgaXQuXG5cdCAqXG5cdCAqIFRoaXMgb3B0aW9uIG1heWJlIG5vdCBiZSBzdXBwb3J0ZWQgb24gYWxsIHByb3ZpZGVycy5cblx0ICovXG5cdHJlYWRvbmx5IGF0b21pYzogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2U7XG59XG5cbmV4cG9ydCBlbnVtIEZpbGVUeXBlIHtcblxuXHQvKipcblx0ICogRmlsZSBpcyB1bmtub3duIChuZWl0aGVyIGZpbGUsIGRpcmVjdG9yeSBub3Igc3ltYm9saWMgbGluaykuXG5cdCAqL1xuXHRVbmtub3duID0gMCxcblxuXHQvKipcblx0ICogRmlsZSBpcyBhIG5vcm1hbCBmaWxlLlxuXHQgKi9cblx0RmlsZSA9IDEsXG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgYSBkaXJlY3RvcnkuXG5cdCAqL1xuXHREaXJlY3RvcnkgPSAyLFxuXG5cdC8qKlxuXHQgKiBGaWxlIGlzIGEgc3ltYm9saWMgbGluay5cblx0ICpcblx0ICogTm90ZTogZXZlbiB3aGVuIHRoZSBmaWxlIGlzIGEgc3ltYm9saWMgbGluaywgeW91IGNhbiB0ZXN0IGZvclxuXHQgKiBgRmlsZVR5cGUuRmlsZWAgYW5kIGBGaWxlVHlwZS5EaXJlY3RvcnlgIHRvIGtub3cgdGhlIHR5cGUgb2Zcblx0ICogdGhlIHRhcmdldCB0aGUgbGluayBwb2ludHMgdG8uXG5cdCAqL1xuXHRTeW1ib2xpY0xpbmsgPSA2NFxufVxuXG5leHBvcnQgZW51bSBGaWxlUGVybWlzc2lvbiB7XG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgcmVhZG9ubHkuIENvbXBvbmVudHMgbGlrZSBlZGl0b3JzIHNob3VsZCBub3Rcblx0ICogb2ZmZXIgdG8gZWRpdCB0aGUgY29udGVudHMuXG5cdCAqL1xuXHRSZWFkb25seSA9IDEsXG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgbG9ja2VkLiBDb21wb25lbnRzIGxpa2UgZWRpdG9ycyBzaG91bGQgb2ZmZXJcblx0ICogdG8gZWRpdCB0aGUgY29udGVudHMgYW5kIGFzayB0aGUgdXNlciB1cG9uIHNhdmluZyB0b1xuXHQgKiByZW1vdmUgdGhlIGxvY2suXG5cdCAqL1xuXHRMb2NrZWQgPSAyLFxuXG5cdC8qKlxuXHQgKiBGaWxlIGlzIGV4ZWN1dGFibGUuIFJlbGV2YW50IGZvciBVbml4LWxpa2Ugc3lzdGVtcyB3aGVyZVxuXHQgKiB0aGUgZXhlY3V0YWJsZSBiaXQgZGV0ZXJtaW5lcyBpZiBhIGZpbGUgY2FuIGJlIHJ1bi5cblx0ICovXG5cdEV4ZWN1dGFibGUgPSA0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YXQge1xuXG5cdC8qKlxuXHQgKiBUaGUgZmlsZSB0eXBlLlxuXHQgKi9cblx0cmVhZG9ubHkgdHlwZTogRmlsZVR5cGU7XG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IG1vZGlmaWNhdGlvbiBkYXRlIHJlcHJlc2VudGVkIGFzIG1pbGxpcyBmcm9tIHVuaXggZXBvY2guXG5cdCAqL1xuXHRyZWFkb25seSBtdGltZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3JlYXRpb24gZGF0ZSByZXByZXNlbnRlZCBhcyBtaWxsaXMgZnJvbSB1bml4IGVwb2NoLlxuXHQgKi9cblx0cmVhZG9ubHkgY3RpbWU6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIHNpemUgb2YgdGhlIGZpbGUgaW4gYnl0ZXMuXG5cdCAqL1xuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBmaWxlIHBlcm1pc3Npb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgcGVybWlzc2lvbnM/OiBGaWxlUGVybWlzc2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uIHtcblxuXHQvKipcblx0ICogU2V0IHRvIGB0cnVlYCB0byB3YXRjaCBmb3IgY2hhbmdlcyByZWN1cnNpdmVseSBpbiBhIGZvbGRlclxuXHQgKiBhbmQgYWxsIG9mIGl0cyBjaGlsZHJlbi5cblx0ICovXG5cdHJlY3Vyc2l2ZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQSBzZXQgb2YgZ2xvYiBwYXR0ZXJucyBvciBwYXRocyB0byBleGNsdWRlIGZyb20gd2F0Y2hpbmcuXG5cdCAqIFBhdGhzIGNhbiBiZSByZWxhdGl2ZSBvciBhYnNvbHV0ZSBhbmQgd2hlbiByZWxhdGl2ZSBhcmVcblx0ICogcmVzb2x2ZWQgYWdhaW5zdCB0aGUgd2F0Y2hlZCBmb2xkZXIuIEdsb2IgcGF0dGVybnMgYXJlXG5cdCAqIGFsd2F5cyBtYXRjaGVkIHJlbGF0aXZlIHRvIHRoZSB3YXRjaGVkIGZvbGRlci5cblx0ICovXG5cdGV4Y2x1ZGVzOiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogQW4gb3B0aW9uYWwgc2V0IG9mIGdsb2IgcGF0dGVybnMgb3IgcGF0aHMgdG8gaW5jbHVkZSBmb3Jcblx0ICogd2F0Y2hpbmcuIElmIG5vdCBwcm92aWRlZCwgYWxsIHBhdGhzIGFyZSBjb25zaWRlcmVkIGZvclxuXHQgKiBldmVudHMuXG5cdCAqIFBhdGhzIGNhbiBiZSByZWxhdGl2ZSBvciBhYnNvbHV0ZSBhbmQgd2hlbiByZWxhdGl2ZSBhcmVcblx0ICogcmVzb2x2ZWQgYWdhaW5zdCB0aGUgd2F0Y2hlZCBmb2xkZXIuIEdsb2IgcGF0dGVybnMgYXJlXG5cdCAqIGFsd2F5cyBtYXRjaGVkIHJlbGF0aXZlIHRvIHRoZSB3YXRjaGVkIGZvbGRlci5cblx0ICovXG5cdGluY2x1ZGVzPzogQXJyYXk8c3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybj47XG5cblx0LyoqXG5cdCAqIElmIHByb3ZpZGVkLCBhbGxvd3MgdG8gZmlsdGVyIHRoZSBldmVudHMgdGhhdCB0aGUgd2F0Y2hlciBzaG91bGQgY29uc2lkZXJcblx0ICogZm9yIGVtaXR0aW5nLiBJZiBub3QgcHJvdmlkZWQsIGFsbCBldmVudHMgYXJlIGVtaXR0ZWQuXG5cdCAqXG5cdCAqIEZvciBleGFtcGxlLCB0byBlbWl0IGFkZGVkIGFuZCB1cGRhdGVkIGV2ZW50cywgc2V0IHRvOlxuXHQgKiBgRmlsZUNoYW5nZUZpbHRlci5BRERFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRGAuXG5cdCAqL1xuXHRmaWx0ZXI/OiBGaWxlQ2hhbmdlRmlsdGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXYXRjaE9wdGlvbnMgZXh0ZW5kcyBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uIHtcblxuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIGZpbGUgY2hhbmdlIGV2ZW50cyBmcm9tIHRoZSB3YXRjaGVyIHRoYXRcblx0ICogYXJlIGEgcmVzdWx0IG9mIHRoaXMgd2F0Y2ggcmVxdWVzdCB3aWxsIGNhcnJ5IHRoZSBzYW1lXG5cdCAqIGlkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29ycmVsYXRpb25JZD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRmlsZUNoYW5nZUZpbHRlciB7XG5cdFVQREFURUQgPSAxIDw8IDEsXG5cdEFEREVEID0gMSA8PCAyLFxuXHRERUxFVEVEID0gMSA8PCAzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhdGNoT3B0aW9uc1dpdGhDb3JyZWxhdGlvbiBleHRlbmRzIElXYXRjaE9wdGlvbnMge1xuXHRyZWFkb25seSBjb3JyZWxhdGlvbklkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1XYXRjaGVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyBvbiBmaWxlL2ZvbGRlciBjaGFuZ2Ugb25seSBmb3IgY2hhbmdlc1xuXHQgKiB0aGF0IGNvcnJlbGF0ZSB0byB0aGUgd2F0Y2ggcmVxdWVzdCB3aXRoIG1hdGNoaW5nIGNvcnJlbGF0aW9uXG5cdCAqIGlkZW50aWZpZXIuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8RmlsZUNoYW5nZXNFdmVudD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpbGVTeXN0ZW1XYXRjaGVyKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgSUZpbGVTeXN0ZW1XYXRjaGVyIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdGhpbmcgYXMgSUZpbGVTeXN0ZW1XYXRjaGVyIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIWNhbmRpZGF0ZSAmJiB0eXBlb2YgY2FuZGlkYXRlLm9uRGlkQ2hhbmdlID09PSAnZnVuY3Rpb24nO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMge1xuXG5cdC8qKlxuXHQgKiBObyBjYXBhYmlsaXRpZXMuXG5cdCAqL1xuXHROb25lID0gMCxcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydHMgdW5idWZmZXJlZCByZWFkL3dyaXRlLlxuXHQgKi9cblx0RmlsZVJlYWRXcml0ZSA9IDEgPDwgMSxcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydHMgb3Blbi9yZWFkL3dyaXRlL2Nsb3NlIGxvdyBsZXZlbCBmaWxlIG9wZXJhdGlvbnMuXG5cdCAqL1xuXHRGaWxlT3BlblJlYWRXcml0ZUNsb3NlID0gMSA8PCAyLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0cyBzdHJlYW0gYmFzZWQgcmVhZGluZy5cblx0ICovXG5cdEZpbGVSZWFkU3RyZWFtID0gMSA8PCA0LFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0cyBjb3B5IG9wZXJhdGlvbi5cblx0ICovXG5cdEZpbGVGb2xkZXJDb3B5ID0gMSA8PCAzLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBpcyBwYXRoIGNhc2Ugc2Vuc2l0aXZlLlxuXHQgKi9cblx0UGF0aENhc2VTZW5zaXRpdmUgPSAxIDw8IDEwLFxuXG5cdC8qKlxuXHQgKiBBbGwgZmlsZXMgb2YgdGhlIHByb3ZpZGVyIGFyZSByZWFkb25seS5cblx0ICovXG5cdFJlYWRvbmx5ID0gMSA8PCAxMSxcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydHMgdG8gZGVsZXRlIHZpYSB0cmFzaC5cblx0ICovXG5cdFRyYXNoID0gMSA8PCAxMixcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydCB0byB1bmxvY2sgZmlsZXMgZm9yIHdyaXRpbmcuXG5cdCAqL1xuXHRGaWxlV3JpdGVVbmxvY2sgPSAxIDw8IDEzLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIHJlYWQgZmlsZXMgYXRvbWljYWxseS4gVGhpcyBpbXBsaWVzIHRoZVxuXHQgKiBwcm92aWRlciBwcm92aWRlcyB0aGUgYEZpbGVSZWFkV3JpdGVgIGNhcGFiaWxpdHkgdG9vLlxuXHQgKi9cblx0RmlsZUF0b21pY1JlYWQgPSAxIDw8IDE0LFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIHdyaXRlIGZpbGVzIGF0b21pY2FsbHkuIFRoaXMgaW1wbGllcyB0aGVcblx0ICogcHJvdmlkZXIgcHJvdmlkZXMgdGhlIGBGaWxlUmVhZFdyaXRlYCBjYXBhYmlsaXR5IHRvby5cblx0ICovXG5cdEZpbGVBdG9taWNXcml0ZSA9IDEgPDwgMTUsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnQgdG8gZGVsZXRlIGF0b21pY2FsbHkuXG5cdCAqL1xuXHRGaWxlQXRvbWljRGVsZXRlID0gMSA8PCAxNixcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydCB0byBjbG9uZSBmaWxlcyBhdG9taWNhbGx5LlxuXHQgKi9cblx0RmlsZUNsb25lID0gMSA8PCAxNyxcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydCB0byByZXNvbHZlIHJlYWwgcGF0aHMuXG5cdCAqL1xuXHRGaWxlUmVhbHBhdGggPSAxIDw8IDE4LFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIGFwcGVuZCB0byBmaWxlcy5cblx0ICovXG5cdEZpbGVBcHBlbmQgPSAxIDw8IDE5XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXM7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzOiBFdmVudDx2b2lkPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGU6IEV2ZW50PHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+O1xuXHRyZWFkb25seSBvbkRpZFdhdGNoRXJyb3I/OiBFdmVudDxzdHJpbmc+O1xuXHR3YXRjaChyZXNvdXJjZTogVVJJLCBvcHRzOiBJV2F0Y2hPcHRpb25zKTogSURpc3Bvc2FibGU7XG5cblx0c3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD47XG5cdG1rZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPjtcblx0ZGVsZXRlKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlRGVsZXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0cmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0Y29weT8oZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHJlYWRGaWxlPyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5Pjtcblx0d3JpdGVGaWxlPyhyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0cmVhZEZpbGVTdHJlYW0/KHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXk+O1xuXG5cdG9wZW4/KHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMpOiBQcm9taXNlPG51bWJlcj47XG5cdGNsb3NlPyhmZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0cmVhZD8oZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPjtcblx0d3JpdGU/KGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj47XG5cblx0Y2xvbmVGaWxlPyhmcm9tOiBVUkksIHRvOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0cmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT47XG5cdHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlQXBwZW5kQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUZvbGRlckNvcHlDYXBhYmlsaXR5IGV4dGVuZHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdGNvcHkoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRmlsZUZvbGRlckNvcHlDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHkge1xuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVGb2xkZXJDb3B5KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVDbG9uZUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0Y2xvbmVGaWxlKGZyb206IFVSSSwgdG86IFVSSSk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlQ2xvbmVDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQ2xvbmVDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQ2xvbmUpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRyZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWxwYXRoKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0b3BlbihyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZU9wZW5PcHRpb25zKTogUHJvbWlzZTxudW1iZXI+O1xuXHRjbG9zZShmZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0cmVhZChmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+O1xuXHR3cml0ZShmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0cmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5IGV4dGVuZHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdHM/OiBJRmlsZUF0b21pY1JlYWRPcHRpb25zKTogUHJvbWlzZTxVaW50OEFycmF5Pjtcblx0ZW5mb3JjZUF0b21pY1JlYWRGaWxlPyhyZXNvdXJjZTogVVJJKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5IHtcblx0aWYgKCFoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdHJldHVybiBmYWxzZTsgLy8gd2UgcmVxdWlyZSB0aGUgYEZpbGVSZWFkV3JpdGVgIGNhcGFiaWxpdHkgdG9vXG5cdH1cblxuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNSZWFkKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0d3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnRzOiBVaW50OEFycmF5LCBvcHRzPzogSUZpbGVBdG9taWNXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRlbmZvcmNlQXRvbWljV3JpdGVGaWxlPyhyZXNvdXJjZTogVVJJKTogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5IHtcblx0aWYgKCFoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdHJldHVybiBmYWxzZTsgLy8gd2UgcmVxdWlyZSB0aGUgYEZpbGVSZWFkV3JpdGVgIGNhcGFiaWxpdHkgdG9vXG5cdH1cblxuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVBdG9taWNEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0ZW5mb3JjZUF0b21pY0RlbGV0ZT8ocmVzb3VyY2U6IFVSSSk6IElGaWxlQXRvbWljT3B0aW9ucyB8IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNEZWxldGVDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljRGVsZXRlKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aFJlYWRvbmx5Q2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5ICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzO1xuXG5cdC8qKlxuXHQgKiBBbiBvcHRpb25hbCBtZXNzYWdlIHRvIHNob3cgaW4gdGhlIFVJIHRvIGV4cGxhaW4gd2h5IHRoZSBmaWxlIHN5c3RlbSBpcyByZWFkb25seS5cblx0ICovXG5cdHJlYWRvbmx5IHJlYWRPbmx5TWVzc2FnZT86IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1JlYWRvbmx5Q2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoUmVhZG9ubHlDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSk7XG59XG5cbmV4cG9ydCBlbnVtIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSB7XG5cdEZpbGVFeGlzdHMgPSAnRW50cnlFeGlzdHMnLFxuXHRGaWxlTm90Rm91bmQgPSAnRW50cnlOb3RGb3VuZCcsXG5cdEZpbGVOb3RBRGlyZWN0b3J5ID0gJ0VudHJ5Tm90QURpcmVjdG9yeScsXG5cdEZpbGVJc0FEaXJlY3RvcnkgPSAnRW50cnlJc0FEaXJlY3RvcnknLFxuXHRGaWxlRXhjZWVkc1N0b3JhZ2VRdW90YSA9ICdFbnRyeUV4Y2VlZHNTdG9yYWdlUXVvdGEnLFxuXHRGaWxlVG9vTGFyZ2UgPSAnRW50cnlUb29MYXJnZScsXG5cdEZpbGVXcml0ZUxvY2tlZCA9ICdFbnRyeVdyaXRlTG9ja2VkJyxcblx0Tm9QZXJtaXNzaW9ucyA9ICdOb1Blcm1pc3Npb25zJyxcblx0VW5hdmFpbGFibGUgPSAnVW5hdmFpbGFibGUnLFxuXHRVbmtub3duID0gJ1Vua25vd24nXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZTtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIGV4dGVuZHMgRXJyb3IgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3Ige1xuXG5cdHN0YXRpYyBjcmVhdGUoZXJyb3I6IEVycm9yIHwgc3RyaW5nLCBjb2RlOiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUpOiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciB7XG5cdFx0Y29uc3QgcHJvdmlkZXJFcnJvciA9IG5ldyBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvci50b1N0cmluZygpLCBjb2RlKTtcblx0XHRtYXJrQXNGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihwcm92aWRlckVycm9yLCBjb2RlKTtcblxuXHRcdHJldHVybiBwcm92aWRlckVycm9yO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIHJlYWRvbmx5IGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSkge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcjogRXJyb3IgfCBzdHJpbmcsIGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIHtcblx0cmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLmNyZWF0ZShlcnJvciwgY29kZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcj86IEVycm9yKTogRXJyb3Ige1xuXHRpZiAoIWVycm9yKSB7XG5cdFx0cmV0dXJuIGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCd1bmtub3duRXJyb3InLCBcIlVua25vd24gRXJyb3JcIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzcyNzk4XG5cdH1cblxuXHRyZXR1cm4gZXJyb3I7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXJrQXNGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcjogRXJyb3IsIGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk6IEVycm9yIHtcblx0ZXJyb3IubmFtZSA9IGNvZGUgPyBgJHtjb2RlfSAoRmlsZVN5c3RlbUVycm9yKWAgOiBgRmlsZVN5c3RlbUVycm9yYDtcblxuXHRyZXR1cm4gZXJyb3I7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgfCBudWxsKTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlIHtcblxuXHQvLyBHdWFyZCBhZ2FpbnN0IGFidXNlXG5cdGlmICghZXJyb3IpIHtcblx0XHRyZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd247XG5cdH1cblxuXHQvLyBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciBjb21lcyB3aXRoIHRoZSBjb2RlXG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKSB7XG5cdFx0cmV0dXJuIGVycm9yLmNvZGU7XG5cdH1cblxuXHQvLyBBbnkgb3RoZXIgZXJyb3IsIGNoZWNrIGZvciBuYW1lIG1hdGNoIGJ5IGFzc3VtaW5nIHRoYXQgdGhlIGVycm9yXG5cdC8vIHdlbnQgdGhyb3VnaCB0aGUgbWFya0FzRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoKSBtZXRob2Rcblx0Y29uc3QgbWF0Y2ggPSAvXiguKykgXFwoRmlsZVN5c3RlbUVycm9yXFwpJC8uZXhlYyhlcnJvci5uYW1lKTtcblx0aWYgKCFtYXRjaCkge1xuXHRcdHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bjtcblx0fVxuXG5cdHN3aXRjaCAobWF0Y2hbMV0pIHtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzOiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHM7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUlzQURpcmVjdG9yeTogcmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5O1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5OiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5O1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZDogcmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQ7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZVRvb0xhcmdlOiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVUb29MYXJnZTtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlV3JpdGVMb2NrZWQ6IHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZVdyaXRlTG9ja2VkO1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnM6IHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucztcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZTogcmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZTtcblx0fVxuXG5cdHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcjogRXJyb3IpOiBGaWxlT3BlcmF0aW9uUmVzdWx0IHtcblxuXHQvLyBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciBjb21lcyB3aXRoIHRoZSByZXN1bHQgYWxyZWFkeVxuXHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRyZXR1cm4gZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdDtcblx0fVxuXG5cdC8vIE90aGVyd2lzZSB0cnkgdG8gZmluZCBmcm9tIGNvZGVcblx0c3dpdGNoICh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikpIHtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQ6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORDtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5OlxuXHRcdFx0cmV0dXJuIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19ESVJFQ1RPUlk7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEFEaXJlY3Rvcnk6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9ESVJFQ1RPUlk7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZVdyaXRlTG9ja2VkOlxuXHRcdFx0cmV0dXJuIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9XUklURV9MT0NLRUQ7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9uczpcblx0XHRcdHJldHVybiBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQ7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0czpcblx0XHRcdHJldHVybiBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVDtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlVG9vTGFyZ2U6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9PVEhFUl9FUlJPUjtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCB7XG5cdHJlYWRvbmx5IGFkZGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBzY2hlbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXI/OiBJRmlsZVN5c3RlbVByb3ZpZGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyO1xuXHRyZWFkb25seSBzY2hlbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50IHtcblx0cmVhZG9ubHkgc2NoZW1lOiBzdHJpbmc7XG5cdGpvaW4ocHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZpbGVPcGVyYXRpb24ge1xuXHRDUkVBVEUsXG5cdERFTEVURSxcblx0TU9WRSxcblx0Q09QWSxcblx0V1JJVEVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZU9wZXJhdGlvbkV2ZW50IHtcblxuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBvcGVyYXRpb246IEZpbGVPcGVyYXRpb247XG5cblx0aXNPcGVyYXRpb24ob3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLkRFTEVURSB8IEZpbGVPcGVyYXRpb24uV1JJVEUpOiBib29sZWFuO1xuXHRpc09wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24uQ1JFQVRFIHwgRmlsZU9wZXJhdGlvbi5NT1ZFIHwgRmlsZU9wZXJhdGlvbi5DT1BZKTogdGhpcyBpcyBJRmlsZU9wZXJhdGlvbkV2ZW50V2l0aE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlT3BlcmF0aW9uRXZlbnRXaXRoTWV0YWRhdGEgZXh0ZW5kcyBJRmlsZU9wZXJhdGlvbkV2ZW50IHtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlT3BlcmF0aW9uRXZlbnQgaW1wbGVtZW50cyBJRmlsZU9wZXJhdGlvbkV2ZW50IHtcblxuXHRjb25zdHJ1Y3RvcihyZXNvdXJjZTogVVJJLCBvcGVyYXRpb246IEZpbGVPcGVyYXRpb24uREVMRVRFIHwgRmlsZU9wZXJhdGlvbi5XUklURSk7XG5cdGNvbnN0cnVjdG9yKHJlc291cmNlOiBVUkksIG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbi5DUkVBVEUgfCBGaWxlT3BlcmF0aW9uLk1PVkUgfCBGaWxlT3BlcmF0aW9uLkNPUFksIHRhcmdldDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhKTtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgcmVzb3VyY2U6IFVSSSwgcmVhZG9ubHkgb3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLCByZWFkb25seSB0YXJnZXQ/OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEpIHsgfVxuXG5cdGlzT3BlcmF0aW9uKG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbi5ERUxFVEUgfCBGaWxlT3BlcmF0aW9uLldSSVRFKTogYm9vbGVhbjtcblx0aXNPcGVyYXRpb24ob3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLkNSRUFURSB8IEZpbGVPcGVyYXRpb24uTU9WRSB8IEZpbGVPcGVyYXRpb24uQ09QWSk6IHRoaXMgaXMgSUZpbGVPcGVyYXRpb25FdmVudFdpdGhNZXRhZGF0YTtcblx0aXNPcGVyYXRpb24ob3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub3BlcmF0aW9uID09PSBvcGVyYXRpb247XG5cdH1cbn1cblxuLyoqXG4gKiBQb3NzaWJsZSBjaGFuZ2VzIHRoYXQgY2FuIG9jY3VyIHRvIGEgZmlsZS5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gRmlsZUNoYW5nZVR5cGUge1xuXHRVUERBVEVELFxuXHRBRERFRCxcblx0REVMRVRFRFxufVxuXG4vKipcbiAqIElkZW50aWZpZXMgYSBzaW5nbGUgY2hhbmdlIGluIGEgZmlsZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRmlsZUNoYW5nZSB7XG5cblx0LyoqXG5cdCAqIFRoZSB0eXBlIG9mIGNoYW5nZSB0aGF0IG9jY3VycmVkIHRvIHRoZSBmaWxlLlxuXHQgKi9cblx0dHlwZTogRmlsZUNoYW5nZVR5cGU7XG5cblx0LyoqXG5cdCAqIFRoZSB1bmlmaWVkIHJlc291cmNlIGlkZW50aWZpZXIgb2YgdGhlIGZpbGUgdGhhdCBjaGFuZ2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblxuXHQvKipcblx0ICogSWYgcHJvdmlkZWQgd2hlbiBzdGFydGluZyB0aGUgZmlsZSB3YXRjaGVyLCB0aGUgY29ycmVsYXRpb25cblx0ICogaWRlbnRpZmllciB3aWxsIG1hdGNoIHRoZSBvcmlnaW5hbCBmaWxlIHdhdGNoaW5nIHJlcXVlc3QgYXNcblx0ICogYSB3YXkgdG8gaWRlbnRpZnkgdGhlIG9yaWdpbmFsIGNvbXBvbmVudCB0aGF0IGlzIGludGVyZXN0ZWRcblx0ICogaW4gdGhlIGNoYW5nZS5cblx0ICovXG5cdHJlYWRvbmx5IGNJZD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVDaGFuZ2VzRXZlbnQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1JWEVEX0NPUlJFTEFUSU9OID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvcnJlbGF0aW9uSWQ6IG51bWJlciB8IHVuZGVmaW5lZCB8IHR5cGVvZiBGaWxlQ2hhbmdlc0V2ZW50Lk1JWEVEX0NPUlJFTEFUSU9OID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNoYW5nZXM6IHJlYWRvbmx5IElGaWxlQ2hhbmdlW10sIHByaXZhdGUgcmVhZG9ubHkgaWdub3JlUGF0aENhc2luZzogYm9vbGVhbikge1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblxuXHRcdFx0Ly8gU3BsaXQgYnkgdHlwZVxuXHRcdFx0c3dpdGNoIChjaGFuZ2UudHlwZSkge1xuXHRcdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkFEREVEOlxuXHRcdFx0XHRcdHRoaXMucmF3QWRkZWQucHVzaChjaGFuZ2UucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQ6XG5cdFx0XHRcdFx0dGhpcy5yYXdVcGRhdGVkLnB1c2goY2hhbmdlLnJlc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEOlxuXHRcdFx0XHRcdHRoaXMucmF3RGVsZXRlZC5wdXNoKGNoYW5nZS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpZ3VyZSBvdXQgZXZlbnRzIGNvcnJlbGF0aW9uXG5cdFx0XHRpZiAodGhpcy5jb3JyZWxhdGlvbklkICE9PSBGaWxlQ2hhbmdlc0V2ZW50Lk1JWEVEX0NPUlJFTEFUSU9OKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY2hhbmdlLmNJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5jb3JyZWxhdGlvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29ycmVsYXRpb25JZCA9IGNoYW5nZS5jSWQ7IFx0XHRcdFx0XHRcdFx0Ly8gY29ycmVsYXRpb24gbm90IHlldCBzZXQsIGp1c3QgdGFrZSBpdFxuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jb3JyZWxhdGlvbklkICE9PSBjaGFuZ2UuY0lkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvcnJlbGF0aW9uSWQgPSBGaWxlQ2hhbmdlc0V2ZW50Lk1JWEVEX0NPUlJFTEFUSU9OO1x0Ly8gY29ycmVsYXRpb24gbWlzbWF0Y2gsIHdlIGhhdmUgbWl4ZWQgY29ycmVsYXRpb25cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29ycmVsYXRpb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvcnJlbGF0aW9uSWQgPSBGaWxlQ2hhbmdlc0V2ZW50Lk1JWEVEX0NPUlJFTEFUSU9OO1x0Ly8gY29ycmVsYXRpb24gbWlzbWF0Y2gsIHdlIGhhdmUgbWl4ZWQgY29ycmVsYXRpb25cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGFkZGVkID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdGNvbnN0IGFkZGVkID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczxib29sZWFuPigoKSA9PiB0aGlzLmlnbm9yZVBhdGhDYXNpbmcpO1xuXHRcdGFkZGVkLmZpbGwodGhpcy5yYXdBZGRlZC5tYXAocmVzb3VyY2UgPT4gW3Jlc291cmNlLCB0cnVlXSkpO1xuXG5cdFx0cmV0dXJuIGFkZGVkO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZWQgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8Ym9vbGVhbj4oKCkgPT4gdGhpcy5pZ25vcmVQYXRoQ2FzaW5nKTtcblx0XHR1cGRhdGVkLmZpbGwodGhpcy5yYXdVcGRhdGVkLm1hcChyZXNvdXJjZSA9PiBbcmVzb3VyY2UsIHRydWVdKSk7XG5cblx0XHRyZXR1cm4gdXBkYXRlZDtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWxldGVkID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPGJvb2xlYW4+KCgpID0+IHRoaXMuaWdub3JlUGF0aENhc2luZyk7XG5cdFx0ZGVsZXRlZC5maWxsKHRoaXMucmF3RGVsZXRlZC5tYXAocmVzb3VyY2UgPT4gW3Jlc291cmNlLCB0cnVlXSkpO1xuXG5cdFx0cmV0dXJuIGRlbGV0ZWQ7XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBGaW5kIG91dCBpZiB0aGUgZmlsZSBjaGFuZ2UgZXZlbnRzIG1hdGNoIHRoZSBwcm92aWRlZCByZXNvdXJjZS5cblx0ICpcblx0ICogTm90ZTogd2hlbiBwYXNzaW5nIGBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEYCwgd2UgY29uc2lkZXIgYSBtYXRjaFxuXHQgKiBhbHNvIHdoZW4gdGhlIHBhcmVudCBvZiB0aGUgcmVzb3VyY2UgZ290IGRlbGV0ZWQuXG5cdCAqL1xuXHRjb250YWlucyhyZXNvdXJjZTogVVJJLCAuLi50eXBlczogRmlsZUNoYW5nZVR5cGVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ29udGFpbnMocmVzb3VyY2UsIHsgaW5jbHVkZUNoaWxkcmVuOiBmYWxzZSB9LCAuLi50eXBlcyk7XG5cdH1cblxuXHQvKipcblx0ICogRmluZCBvdXQgaWYgdGhlIGZpbGUgY2hhbmdlIGV2ZW50cyBlaXRoZXIgbWF0Y2ggdGhlIHByb3ZpZGVkXG5cdCAqIHJlc291cmNlLCBvciBjb250YWluIGEgY2hpbGQgb2YgdGhpcyByZXNvdXJjZS5cblx0ICovXG5cdGFmZmVjdHMocmVzb3VyY2U6IFVSSSwgLi4udHlwZXM6IEZpbGVDaGFuZ2VUeXBlW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb0NvbnRhaW5zKHJlc291cmNlLCB7IGluY2x1ZGVDaGlsZHJlbjogdHJ1ZSB9LCAuLi50eXBlcyk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ29udGFpbnMocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogeyBpbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW4gfSwgLi4udHlwZXM6IEZpbGVDaGFuZ2VUeXBlW10pOiBib29sZWFuIHtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzVHlwZXNGaWx0ZXIgPSB0eXBlcy5sZW5ndGggPiAwO1xuXG5cdFx0Ly8gQWRkZWRcblx0XHRpZiAoIWhhc1R5cGVzRmlsdGVyIHx8IHR5cGVzLmluY2x1ZGVzKEZpbGVDaGFuZ2VUeXBlLkFEREVEKSkge1xuXHRcdFx0aWYgKHRoaXMuYWRkZWQudmFsdWUuZ2V0KHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMuaW5jbHVkZUNoaWxkcmVuICYmIHRoaXMuYWRkZWQudmFsdWUuZmluZFN1cGVyc3RyKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGVkXG5cdFx0aWYgKCFoYXNUeXBlc0ZpbHRlciB8fCB0eXBlcy5pbmNsdWRlcyhGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSkge1xuXHRcdFx0aWYgKHRoaXMudXBkYXRlZC52YWx1ZS5nZXQocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5pbmNsdWRlQ2hpbGRyZW4gJiYgdGhpcy51cGRhdGVkLnZhbHVlLmZpbmRTdXBlcnN0cihyZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZXRlZFxuXHRcdGlmICghaGFzVHlwZXNGaWx0ZXIgfHwgdHlwZXMuaW5jbHVkZXMoRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpIHtcblx0XHRcdGlmICh0aGlzLmRlbGV0ZWQudmFsdWUuZmluZFN1YnN0cihyZXNvdXJjZSkgLyogZGVsZXRlZCBhbHNvIGNvbnNpZGVycyBwYXJlbnQgZm9sZGVycyAqLykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMuaW5jbHVkZUNoaWxkcmVuICYmIHRoaXMuZGVsZXRlZC52YWx1ZS5maW5kU3VwZXJzdHIocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGlmIHRoaXMgZXZlbnQgY29udGFpbnMgYWRkZWQgZmlsZXMuXG5cdCAqL1xuXHRnb3RBZGRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yYXdBZGRlZC5sZW5ndGggPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhpcyBldmVudCBjb250YWlucyBkZWxldGVkIGZpbGVzLlxuXHQgKi9cblx0Z290RGVsZXRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yYXdEZWxldGVkLmxlbmd0aCA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBpZiB0aGlzIGV2ZW50IGNvbnRhaW5zIHVwZGF0ZWQgZmlsZXMuXG5cdCAqL1xuXHRnb3RVcGRhdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJhd1VwZGF0ZWQubGVuZ3RoID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGlmIHRoaXMgZXZlbnQgY29udGFpbnMgY2hhbmdlcyB0aGF0IGNvcnJlbGF0ZSB0byB0aGVcblx0ICogcHJvdmlkZWQgYGNvcnJlbGF0aW9uSWRgLlxuXHQgKlxuXHQgKiBGaWxlIGNoYW5nZSBldmVudCBjb3JyZWxhdGlvbiBpcyBhbiBhZHZhbmNlZCB3YXRjaCBmZWF0dXJlIHRoYXRcblx0ICogYWxsb3dzIHRvICBpZGVudGlmeSBmcm9tIHdoaWNoIHdhdGNoIHJlcXVlc3QgdGhlIGV2ZW50cyBvcmlnaW5hdGVcblx0ICogZnJvbS4gVGhpcyBjb3JyZWxhdGlvbiBhbGxvd3MgdG8gcm91dGUgZXZlbnRzIHNwZWNpZmljYWxseVxuXHQgKiBvbmx5IHRvIHRoZSByZXF1ZXN0b3IgYW5kIG5vdCBlbWl0IHRoZW0gdG8gYWxsIGxpc3RlbmVycy5cblx0ICovXG5cdGNvcnJlbGF0ZXMoY29ycmVsYXRpb25JZDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29ycmVsYXRpb25JZCA9PT0gY29ycmVsYXRpb25JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaWd1cmUgb3V0IGlmIHRoZSBldmVudCBjb250YWlucyBjaGFuZ2VzIHRoYXQgY29ycmVsYXRlIHRvIG9uZVxuXHQgKiBjb3JyZWxhdGlvbiBpZGVudGlmaWVyLlxuXHQgKlxuXHQgKiBGaWxlIGNoYW5nZSBldmVudCBjb3JyZWxhdGlvbiBpcyBhbiBhZHZhbmNlZCB3YXRjaCBmZWF0dXJlIHRoYXRcblx0ICogYWxsb3dzIHRvICBpZGVudGlmeSBmcm9tIHdoaWNoIHdhdGNoIHJlcXVlc3QgdGhlIGV2ZW50cyBvcmlnaW5hdGVcblx0ICogZnJvbS4gVGhpcyBjb3JyZWxhdGlvbiBhbGxvd3MgdG8gcm91dGUgZXZlbnRzIHNwZWNpZmljYWxseVxuXHQgKiBvbmx5IHRvIHRoZSByZXF1ZXN0b3IgYW5kIG5vdCBlbWl0IHRoZW0gdG8gYWxsIGxpc3RlbmVycy5cblx0ICovXG5cdGhhc0NvcnJlbGF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy5jb3JyZWxhdGlvbklkID09PSAnbnVtYmVyJztcblx0fVxuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCB1c2UgdGhlIGBjb250YWluc2Agb3IgYGFmZmVjdHNgIG1ldGhvZCB0byBlZmZpY2llbnRseSBmaW5kXG5cdCAqIG91dCBpZiB0aGUgZXZlbnQgcmVsYXRlcyB0byBhIGdpdmVuIHJlc291cmNlLiB0aGVzZSBtZXRob2RzIGVuc3VyZTpcblx0ICogLSB0aGF0IHRoZXJlIGlzIG5vIGV4cGVuc2l2ZSBsb29rdXAgbmVlZGVkIChieSB1c2luZyBhIGBUZXJuYXJ5U2VhcmNoVHJlZWApXG5cdCAqIC0gY29ycmVjdGx5IGhhbmRsZXMgYEZpbGVDaGFuZ2VUeXBlLkRFTEVURURgIGV2ZW50c1xuXHQgKi9cblx0cmVhZG9ubHkgcmF3QWRkZWQ6IFVSSVtdID0gW107XG5cblx0LyoqXG5cdCogQGRlcHJlY2F0ZWQgdXNlIHRoZSBgY29udGFpbnNgIG9yIGBhZmZlY3RzYCBtZXRob2QgdG8gZWZmaWNpZW50bHkgZmluZFxuXHQqIG91dCBpZiB0aGUgZXZlbnQgcmVsYXRlcyB0byBhIGdpdmVuIHJlc291cmNlLiB0aGVzZSBtZXRob2RzIGVuc3VyZTpcblx0KiAtIHRoYXQgdGhlcmUgaXMgbm8gZXhwZW5zaXZlIGxvb2t1cCBuZWVkZWQgKGJ5IHVzaW5nIGEgYFRlcm5hcnlTZWFyY2hUcmVlYClcblx0KiAtIGNvcnJlY3RseSBoYW5kbGVzIGBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEYCBldmVudHNcblx0Ki9cblx0cmVhZG9ubHkgcmF3VXBkYXRlZDogVVJJW10gPSBbXTtcblxuXHQvKipcblx0KiBAZGVwcmVjYXRlZCB1c2UgdGhlIGBjb250YWluc2Agb3IgYGFmZmVjdHNgIG1ldGhvZCB0byBlZmZpY2llbnRseSBmaW5kXG5cdCogb3V0IGlmIHRoZSBldmVudCByZWxhdGVzIHRvIGEgZ2l2ZW4gcmVzb3VyY2UuIHRoZXNlIG1ldGhvZHMgZW5zdXJlOlxuXHQqIC0gdGhhdCB0aGVyZSBpcyBubyBleHBlbnNpdmUgbG9va3VwIG5lZWRlZCAoYnkgdXNpbmcgYSBgVGVybmFyeVNlYXJjaFRyZWVgKVxuXHQqIC0gY29ycmVjdGx5IGhhbmRsZXMgYEZpbGVDaGFuZ2VUeXBlLkRFTEVURURgIGV2ZW50c1xuXHQqL1xuXHRyZWFkb25seSByYXdEZWxldGVkOiBVUklbXSA9IFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQYXJlbnQocGF0aDogc3RyaW5nLCBjYW5kaWRhdGU6IHN0cmluZywgaWdub3JlQ2FzZT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKCFwYXRoIHx8ICFjYW5kaWRhdGUgfHwgcGF0aCA9PT0gY2FuZGlkYXRlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNhbmRpZGF0ZS5sZW5ndGggPiBwYXRoLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChjYW5kaWRhdGUuY2hhckF0KGNhbmRpZGF0ZS5sZW5ndGggLSAxKSAhPT0gc2VwKSB7XG5cdFx0Y2FuZGlkYXRlICs9IHNlcDtcblx0fVxuXG5cdGlmIChpZ25vcmVDYXNlKSB7XG5cdFx0cmV0dXJuIHN0YXJ0c1dpdGhJZ25vcmVDYXNlKHBhdGgsIGNhbmRpZGF0ZSk7XG5cdH1cblxuXHRyZXR1cm4gcGF0aC5pbmRleE9mKGNhbmRpZGF0ZSkgPT09IDA7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhc2VGaWxlU3RhdCB7XG5cblx0LyoqXG5cdCAqIFRoZSB1bmlmaWVkIHJlc291cmNlIGlkZW50aWZpZXIgb2YgdGhpcyBmaWxlIG9yIGZvbGRlci5cblx0ICovXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cblx0LyoqXG5cdCAqIFRoZSBuYW1lIHdoaWNoIGlzIHRoZSBsYXN0IHNlZ21lbnRcblx0ICogb2YgdGhlIHt7cGF0aH19LlxuXHQgKi9cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2l6ZSBvZiB0aGUgZmlsZS5cblx0ICpcblx0ICogVGhlIHZhbHVlIG1heSBvciBtYXkgbm90IGJlIHJlc29sdmVkIGFzXG5cdCAqIGl0IGlzIG9wdGlvbmFsLlxuXHQgKi9cblx0cmVhZG9ubHkgc2l6ZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIGxhc3QgbW9kaWZpY2F0aW9uIGRhdGUgcmVwcmVzZW50ZWQgYXMgbWlsbGlzIGZyb20gdW5peCBlcG9jaC5cblx0ICpcblx0ICogVGhlIHZhbHVlIG1heSBvciBtYXkgbm90IGJlIHJlc29sdmVkIGFzXG5cdCAqIGl0IGlzIG9wdGlvbmFsLlxuXHQgKi9cblx0cmVhZG9ubHkgbXRpbWU/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBjcmVhdGlvbiBkYXRlIHJlcHJlc2VudGVkIGFzIG1pbGxpcyBmcm9tIHVuaXggZXBvY2guXG5cdCAqXG5cdCAqIFRoZSB2YWx1ZSBtYXkgb3IgbWF5IG5vdCBiZSByZXNvbHZlZCBhc1xuXHQgKiBpdCBpcyBvcHRpb25hbC5cblx0ICovXG5cdHJlYWRvbmx5IGN0aW1lPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBBIHVuaXF1ZSBpZGVudGlmaWVyIHRoYXQgcmVwcmVzZW50cyB0aGVcblx0ICogY3VycmVudCBzdGF0ZSBvZiB0aGUgZmlsZSBvciBkaXJlY3RvcnkuXG5cdCAqXG5cdCAqIFRoZSB2YWx1ZSBtYXkgb3IgbWF5IG5vdCBiZSByZXNvbHZlZCBhc1xuXHQgKiBpdCBpcyBvcHRpb25hbC5cblx0ICovXG5cdHJlYWRvbmx5IGV0YWc/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgcmVhZG9ubHkuIENvbXBvbmVudHMgbGlrZSBlZGl0b3JzIHNob3VsZCBub3Rcblx0ICogb2ZmZXIgdG8gZWRpdCB0aGUgY29udGVudHMuXG5cdCAqL1xuXHRyZWFkb25seSByZWFkb25seT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgbG9ja2VkLiBDb21wb25lbnRzIGxpa2UgZWRpdG9ycyBzaG91bGQgb2ZmZXJcblx0ICogdG8gZWRpdCB0aGUgY29udGVudHMgYW5kIGFzayB0aGUgdXNlciB1cG9uIHNhdmluZyB0b1xuXHQgKiByZW1vdmUgdGhlIGxvY2suXG5cdCAqL1xuXHRyZWFkb25seSBsb2NrZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBGaWxlIGlzIGV4ZWN1dGFibGUuIFJlbGV2YW50IGZvciBVbml4LWxpa2Ugc3lzdGVtcyB3aGVyZVxuXHQgKiB0aGUgZXhlY3V0YWJsZSBiaXQgZGV0ZXJtaW5lcyBpZiBhIGZpbGUgY2FuIGJlIHJ1bi5cblx0ICovXG5cdHJlYWRvbmx5IGV4ZWN1dGFibGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXNlRmlsZVN0YXRXaXRoTWV0YWRhdGEgZXh0ZW5kcyBSZXF1aXJlZDxJQmFzZUZpbGVTdGF0PiB7IH1cblxuLyoqXG4gKiBBIGZpbGUgcmVzb3VyY2Ugd2l0aCBtZXRhIGluZm9ybWF0aW9uIGFuZCByZXNvbHZlZCBjaGlsZHJlbiBpZiBhbnkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTdGF0IGV4dGVuZHMgSUJhc2VGaWxlU3RhdCB7XG5cblx0LyoqXG5cdCAqIFRoZSByZXNvdXJjZSBpcyBhIGZpbGUuXG5cdCAqL1xuXHRyZWFkb25seSBpc0ZpbGU6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSByZXNvdXJjZSBpcyBhIGRpcmVjdG9yeS5cblx0ICovXG5cdHJlYWRvbmx5IGlzRGlyZWN0b3J5OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgcmVzb3VyY2UgaXMgYSBzeW1ib2xpYyBsaW5rLiBOb3RlOiBldmVuIHdoZW4gdGhlXG5cdCAqIGZpbGUgaXMgYSBzeW1ib2xpYyBsaW5rLCB5b3UgY2FuIHRlc3QgZm9yIGBGaWxlVHlwZS5GaWxlYFxuXHQgKiBhbmQgYEZpbGVUeXBlLkRpcmVjdG9yeWAgdG8ga25vdyB0aGUgdHlwZSBvZiB0aGUgdGFyZ2V0XG5cdCAqIHRoZSBsaW5rIHBvaW50cyB0by5cblx0ICovXG5cdHJlYWRvbmx5IGlzU3ltYm9saWNMaW5rOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hpbGRyZW4gb2YgdGhlIGZpbGUgc3RhdCBvciB1bmRlZmluZWQgaWYgbm9uZS5cblx0ICovXG5cdGNoaWxkcmVuOiBJRmlsZVN0YXRbXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgZXh0ZW5kcyBJRmlsZVN0YXQsIElCYXNlRmlsZVN0YXRXaXRoTWV0YWRhdGEge1xuXHRyZWFkb25seSBtdGltZTogbnVtYmVyO1xuXHRyZWFkb25seSBjdGltZTogbnVtYmVyO1xuXHRyZWFkb25seSBldGFnOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgcmVhZG9ubHk6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxvY2tlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhlY3V0YWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2hpbGRyZW46IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3RhdFJlc3VsdCB7XG5cdHJlYWRvbmx5IHN0YXQ/OiBJRmlsZVN0YXQ7XG5cdHJlYWRvbmx5IHN1Y2Nlc3M6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTdGF0UmVzdWx0V2l0aE1ldGFkYXRhIGV4dGVuZHMgSUZpbGVTdGF0UmVzdWx0IHtcblx0cmVhZG9ubHkgc3RhdD86IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIGV4dGVuZHMgT21pdDxJRmlsZVN0YXRXaXRoTWV0YWRhdGEsICdjaGlsZHJlbic+IHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlQ29udGVudCBleHRlbmRzIElCYXNlRmlsZVN0YXRXaXRoTWV0YWRhdGEge1xuXG5cdC8qKlxuXHQgKiBUaGUgY29udGVudCBvZiBhIGZpbGUgYXMgYnVmZmVyLlxuXHQgKi9cblx0cmVhZG9ubHkgdmFsdWU6IFZTQnVmZmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3RyZWFtQ29udGVudCBleHRlbmRzIElCYXNlRmlsZVN0YXRXaXRoTWV0YWRhdGEge1xuXG5cdC8qKlxuXHQgKiBUaGUgY29udGVudCBvZiBhIGZpbGUgYXMgc3RyZWFtLlxuXHQgKi9cblx0cmVhZG9ubHkgdmFsdWU6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhc2VSZWFkRmlsZU9wdGlvbnMgZXh0ZW5kcyBJRmlsZVJlYWRTdHJlYW1PcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIG9wdGlvbmFsIGV0YWcgcGFyYW1ldGVyIGFsbG93cyB0byByZXR1cm4gZWFybHkgZnJvbSByZXNvbHZpbmcgdGhlIHJlc291cmNlIGlmXG5cdCAqIHRoZSBjb250ZW50cyBvbiBkaXNrIG1hdGNoIHRoZSBldGFnLiBUaGlzIHByZXZlbnRzIGFjY3VtdWxhdGVkIHJlYWRpbmcgb2YgcmVzb3VyY2VzXG5cdCAqIHRoYXQgaGF2ZSBiZWVuIHJlYWQgYWxyZWFkeSB3aXRoIHRoZSBzYW1lIGV0YWcuXG5cdCAqIEl0IGlzIHRoZSB0YXNrIG9mIHRoZSBjYWxsZXIgdG8gbWFrZXMgc3VyZSB0byBoYW5kbGUgdGhpcyBlcnJvciBjYXNlIGZyb20gdGhlIHByb21pc2UuXG5cdCAqL1xuXHRyZWFkb25seSBldGFnPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkRmlsZVN0cmVhbU9wdGlvbnMgZXh0ZW5kcyBJQmFzZVJlYWRGaWxlT3B0aW9ucyB7IH1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVhZEZpbGVPcHRpb25zIGV4dGVuZHMgSUJhc2VSZWFkRmlsZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGByZWFkRmlsZWAgbWV0aG9kIGlzIG5vdCBydW5uaW5nIGluIHBhcmFsbGVsIHdpdGhcblx0ICogYW55IGB3cml0ZWAgb3BlcmF0aW9ucyBpbiB0aGUgc2FtZSBwcm9jZXNzLlxuXHQgKlxuXHQgKiBUeXBpY2FsbHkgeW91IHNob3VsZCBub3QgbmVlZCB0byB1c2UgdGhpcyBmbGFnIGJ1dCBpZlxuXHQgKiBmb3IgZXhhbXBsZSB5b3UgYXJlIHF1aWNrbHkgcmVhZGluZyBhIGZpbGUgcmlnaHQgYWZ0ZXJcblx0ICogYSBmaWxlIGV2ZW50IG9jY3VycmVkIGFuZCB0aGUgZmlsZSBjaGFuZ2VzIGEgbG90LCB0aGVyZVxuXHQgKiBpcyBhIGNoYW5jZSB0aGF0IGEgcmVhZCByZXR1cm5zIGFuIGVtcHR5IG9yIHBhcnRpYWwgZmlsZVxuXHQgKiBiZWNhdXNlIGEgcGVuZGluZyB3cml0ZSBoYXMgbm90IGZpbmlzaGVkIHlldC5cblx0ICpcblx0ICogTm90ZTogdGhpcyBkb2VzIG5vdCBwcmV2ZW50IHRoZSBmaWxlIGZyb20gYmVpbmcgd3JpdHRlblxuXHQgKiB0byBmcm9tIGEgZGlmZmVyZW50IHByb2Nlc3MuIElmIHlvdSBuZWVkIHN1Y2ggYXRvbWljXG5cdCAqIG9wZXJhdGlvbnMsIHlvdSBiZXR0ZXIgdXNlIGEgcmVhbCBkYXRhYmFzZSBhcyBzdG9yYWdlLlxuXHQgKi9cblx0cmVhZG9ubHkgYXRvbWljPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV3JpdGVGaWxlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IGtub3duIG1vZGlmaWNhdGlvbiB0aW1lIG9mIHRoZSBmaWxlLiBUaGlzIGNhbiBiZSB1c2VkIHRvIHByZXZlbnQgZGlydHkgd3JpdGVzLlxuXHQgKi9cblx0cmVhZG9ubHkgbXRpbWU/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBldGFnIG9mIHRoZSBmaWxlLiBUaGlzIGNhbiBiZSB1c2VkIHRvIHByZXZlbnQgZGlydHkgd3JpdGVzLlxuXHQgKi9cblx0cmVhZG9ubHkgZXRhZz86IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciB0byBhdHRlbXB0IHRvIHVubG9jayBhIGZpbGUgYmVmb3JlIHdyaXRpbmcuXG5cdCAqL1xuXHRyZWFkb25seSB1bmxvY2s/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGB3cml0ZUZpbGVgIG1ldGhvZCB1cGRhdGVzIHRoZSB0YXJnZXQgZmlsZSBhdG9taWNhbGx5XG5cdCAqIGJ5IGZpcnN0IHdyaXRpbmcgdG8gYSB0ZW1wb3JhcnkgZmlsZSBpbiB0aGUgc2FtZSBmb2xkZXJcblx0ICogYW5kIHRoZW4gcmVuYW1pbmcgaXQgb3ZlciB0aGUgdGFyZ2V0LlxuXHQgKi9cblx0cmVhZG9ubHkgYXRvbWljPzogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2U7XG5cblx0LyoqXG5cdCAqIElmIHNldCB0byB0cnVlLCB3aWxsIGFwcGVuZCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlIGluc3RlYWQgb2Zcblx0ICogcmVwbGFjaW5nIGl0cyBjb250ZW50cy4gV2lsbCBjcmVhdGUgdGhlIGZpbGUgaWYgaXQgZG9lc24ndCBleGlzdC5cblx0ICovXG5cdHJlYWRvbmx5IGFwcGVuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVGaWxlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIEF1dG9tYXRpY2FsbHkgY29udGludWUgcmVzb2x2aW5nIGNoaWxkcmVuIG9mIGEgZGlyZWN0b3J5IHVudGlsIHRoZSBwcm92aWRlZCByZXNvdXJjZXNcblx0ICogYXJlIGZvdW5kLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb2x2ZVRvPzogcmVhZG9ubHkgVVJJW107XG5cblx0LyoqXG5cdCAqIEF1dG9tYXRpY2FsbHkgY29udGludWUgcmVzb2x2aW5nIGNoaWxkcmVuIG9mIGEgZGlyZWN0b3J5IGlmIHRoZSBudW1iZXIgb2YgY2hpbGRyZW4gaXMgMS5cblx0ICovXG5cdHJlYWRvbmx5IHJlc29sdmVTaW5nbGVDaGlsZERlc2NlbmRhbnRzPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2lsbCByZXNvbHZlIG10aW1lLCBjdGltZSwgc2l6ZSBhbmQgZXRhZyBvZiBmaWxlcyBpZiBlbmFibGVkLiBUaGlzIGNhbiBoYXZlIGEgbmVnYXRpdmUgaW1wYWN0XG5cdCAqIG9uIHBlcmZvcm1hbmNlIGFuZCB0aHVzIHNob3VsZCBvbmx5IGJlIHVzZWQgd2hlbiB0aGVzZSB2YWx1ZXMgYXJlIHJlcXVpcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb2x2ZU1ldGFkYXRhPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMgZXh0ZW5kcyBJUmVzb2x2ZUZpbGVPcHRpb25zIHtcblx0cmVhZG9ubHkgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDcmVhdGVGaWxlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIE92ZXJ3cml0ZSB0aGUgZmlsZSB0byBjcmVhdGUgaWYgaXQgYWxyZWFkeSBleGlzdHMgb24gZGlzay4gT3RoZXJ3aXNlXG5cdCAqIGFuIGVycm9yIHdpbGwgYmUgdGhyb3duIChGSUxFX01PRElGSUVEX1NJTkNFKS5cblx0ICovXG5cdHJlYWRvbmx5IG92ZXJ3cml0ZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlT3BlcmF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBmaWxlT3BlcmF0aW9uUmVzdWx0OiBGaWxlT3BlcmF0aW9uUmVzdWx0LFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zIHwgSVdyaXRlRmlsZU9wdGlvbnMgfCBJQ3JlYXRlRmlsZU9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yIGV4dGVuZHMgRmlsZU9wZXJhdGlvbkVycm9yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0bWVzc2FnZTogc3RyaW5nLFxuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZpbGVPcGVyYXRpb25SZXN1bHQ6IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9UT09fTEFSR0UsXG5cdFx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyLFxuXHRcdG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKG1lc3NhZ2UsIGZpbGVPcGVyYXRpb25SZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yIGV4dGVuZHMgRmlsZU9wZXJhdGlvbkVycm9yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtZXNzYWdlOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhLFxuXHRcdG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKG1lc3NhZ2UsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfTU9ESUZJRURfU0lOQ0UsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZpbGVPcGVyYXRpb25SZXN1bHQge1xuXHRGSUxFX0lTX0RJUkVDVE9SWSxcblx0RklMRV9OT1RfRk9VTkQsXG5cdEZJTEVfTk9UX01PRElGSUVEX1NJTkNFLFxuXHRGSUxFX01PRElGSUVEX1NJTkNFLFxuXHRGSUxFX01PVkVfQ09ORkxJQ1QsXG5cdEZJTEVfV1JJVEVfTE9DS0VELFxuXHRGSUxFX1BFUk1JU1NJT05fREVOSUVELFxuXHRGSUxFX1RPT19MQVJHRSxcblx0RklMRV9JTlZBTElEX1BBVEgsXG5cdEZJTEVfTk9UX0RJUkVDVE9SWSxcblx0RklMRV9PVEhFUl9FUlJPUlxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNldHRpbmdzXG5cbmV4cG9ydCBjb25zdCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSB7XG5cdE9GRjogJ29mZicsXG5cdEFGVEVSX0RFTEFZOiAnYWZ0ZXJEZWxheScsXG5cdE9OX0ZPQ1VTX0NIQU5HRTogJ29uRm9jdXNDaGFuZ2UnLFxuXHRPTl9XSU5ET1dfQ0hBTkdFOiAnb25XaW5kb3dDaGFuZ2UnXG59O1xuXG5leHBvcnQgY29uc3QgSG90RXhpdENvbmZpZ3VyYXRpb24gPSB7XG5cdE9GRjogJ29mZicsXG5cdE9OX0VYSVQ6ICdvbkV4aXQnLFxuXHRPTl9FWElUX0FORF9XSU5ET1dfQ0xPU0U6ICdvbkV4aXRBbmRXaW5kb3dDbG9zZSdcbn07XG5cbmV4cG9ydCBjb25zdCBGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHID0gJ2ZpbGVzLmFzc29jaWF0aW9ucyc7XG5leHBvcnQgY29uc3QgRklMRVNfRVhDTFVERV9DT05GSUcgPSAnZmlsZXMuZXhjbHVkZSc7XG5leHBvcnQgY29uc3QgRklMRVNfUkVBRE9OTFlfSU5DTFVERV9DT05GSUcgPSAnZmlsZXMucmVhZG9ubHlJbmNsdWRlJztcbmV4cG9ydCBjb25zdCBGSUxFU19SRUFET05MWV9FWENMVURFX0NPTkZJRyA9ICdmaWxlcy5yZWFkb25seUV4Y2x1ZGUnO1xuZXhwb3J0IGNvbnN0IEZJTEVTX1JFQURPTkxZX0ZST01fUEVSTUlTU0lPTlNfQ09ORklHID0gJ2ZpbGVzLnJlYWRvbmx5RnJvbVBlcm1pc3Npb25zJztcblxuZXhwb3J0IGludGVyZmFjZSBJR2xvYlBhdHRlcm5zIHtcblx0W2ZpbGVwYXR0ZXJuOiBzdHJpbmddOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlc0NvbmZpZ3VyYXRpb24ge1xuXHRmaWxlcz86IElGaWxlc0NvbmZpZ3VyYXRpb25Ob2RlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlc0NvbmZpZ3VyYXRpb25Ob2RlIHtcblx0YXNzb2NpYXRpb25zOiB7IFtmaWxlcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG5cdGV4Y2x1ZGU6IElFeHByZXNzaW9uO1xuXHR3YXRjaGVyRXhjbHVkZTogSUdsb2JQYXR0ZXJucztcblx0d2F0Y2hlckluY2x1ZGU6IHN0cmluZ1tdO1xuXHRlbmNvZGluZzogc3RyaW5nO1xuXHRhdXRvR3Vlc3NFbmNvZGluZzogYm9vbGVhbjtcblx0Y2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IHN0cmluZ1tdO1xuXHRkZWZhdWx0TGFuZ3VhZ2U6IHN0cmluZztcblx0dHJpbVRyYWlsaW5nV2hpdGVzcGFjZTogYm9vbGVhbjtcblx0YXV0b1NhdmU6IHN0cmluZztcblx0YXV0b1NhdmVEZWxheTogbnVtYmVyO1xuXHRhdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seTogYm9vbGVhbjtcblx0YXV0b1NhdmVXaGVuTm9FcnJvcnM6IGJvb2xlYW47XG5cdGVvbDogc3RyaW5nO1xuXHRlbmFibGVUcmFzaDogYm9vbGVhbjtcblx0aG90RXhpdDogc3RyaW5nO1xuXHRzYXZlQ29uZmxpY3RSZXNvbHV0aW9uOiAnYXNrVXNlcicgfCAnb3ZlcndyaXRlRmlsZU9uRGlzayc7XG5cdHJlYWRvbmx5SW5jbHVkZTogSUdsb2JQYXR0ZXJucztcblx0cmVhZG9ubHlFeGNsdWRlOiBJR2xvYlBhdHRlcm5zO1xuXHRyZWFkb25seUZyb21QZXJtaXNzaW9uczogYm9vbGVhbjtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBVdGlsaXRpZXNcblxuZXhwb3J0IGVudW0gRmlsZUtpbmQge1xuXHRGSUxFLFxuXHRGT0xERVIsXG5cdFJPT1RfRk9MREVSXG59XG5cbi8qKlxuICogQSBoaW50IHRvIGRpc2FibGUgZXRhZyBjaGVja2luZyBmb3IgcmVhZGluZy93cml0aW5nLlxuICovXG5leHBvcnQgY29uc3QgRVRBR19ESVNBQkxFRCA9ICcnO1xuXG5leHBvcnQgZnVuY3Rpb24gZXRhZyhzdGF0OiB7IG10aW1lOiBudW1iZXI7IHNpemU6IG51bWJlciB9KTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIGV0YWcoc3RhdDogeyBtdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkOyBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQgfSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiBldGFnKHN0YXQ6IHsgbXRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDsgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIHN0YXQuc2l6ZSAhPT0gJ251bWJlcicgfHwgdHlwZW9mIHN0YXQubXRpbWUgIT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiBzdGF0Lm10aW1lLnRvU3RyaW5nKDI5KSArIHN0YXQuc2l6ZS50b1N0cmluZygzMSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3aGVuUHJvdmlkZXJSZWdpc3RlcmVkKGZpbGU6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoVVJJLmZyb20oeyBzY2hlbWU6IGZpbGUuc2NoZW1lIH0pKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2NoZW1lID09PSBmaWxlLnNjaGVtZSAmJiBlLmFkZGVkKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBmb3JtYXQgYSByYXcgYnl0ZSBzaXplIGludG8gYSBodW1hbiByZWFkYWJsZSBsYWJlbC5cbiAqL1xuZXhwb3J0IGNsYXNzIEJ5dGVTaXplIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgS0IgPSAxMDI0O1xuXHRzdGF0aWMgcmVhZG9ubHkgTUIgPSBCeXRlU2l6ZS5LQiAqIEJ5dGVTaXplLktCO1xuXHRzdGF0aWMgcmVhZG9ubHkgR0IgPSBCeXRlU2l6ZS5NQiAqIEJ5dGVTaXplLktCO1xuXHRzdGF0aWMgcmVhZG9ubHkgVEIgPSBCeXRlU2l6ZS5HQiAqIEJ5dGVTaXplLktCO1xuXG5cdHN0YXRpYyBmb3JtYXRTaXplKHNpemU6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKCFpc051bWJlcihzaXplKSkge1xuXHRcdFx0c2l6ZSA9IDA7XG5cdFx0fVxuXG5cdFx0aWYgKHNpemUgPCBCeXRlU2l6ZS5LQikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaXplQicsIFwiezB9QlwiLCBzaXplLnRvRml4ZWQoMCkpO1xuXHRcdH1cblxuXHRcdGlmIChzaXplIDwgQnl0ZVNpemUuTUIpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2l6ZUtCJywgXCJ7MH1LQlwiLCAoc2l6ZSAvIEJ5dGVTaXplLktCKS50b0ZpeGVkKDIpKTtcblx0XHR9XG5cblx0XHRpZiAoc2l6ZSA8IEJ5dGVTaXplLkdCKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NpemVNQicsIFwiezB9TUJcIiwgKHNpemUgLyBCeXRlU2l6ZS5NQikudG9GaXhlZCgyKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNpemUgPCBCeXRlU2l6ZS5UQikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaXplR0InLCBcInswfUdCXCIsIChzaXplIC8gQnl0ZVNpemUuR0IpLnRvRml4ZWQoMikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnc2l6ZVRCJywgXCJ7MH1UQlwiLCAoc2l6ZSAvIEJ5dGVTaXplLlRCKS50b0ZpeGVkKDIpKTtcblx0fVxufVxuXG4vLyBGaWxlIGxpbWl0c1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFyZ2VGaWxlQ29uZmlybWF0aW9uTGltaXQocmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogbnVtYmVyO1xuZXhwb3J0IGZ1bmN0aW9uIGdldExhcmdlRmlsZUNvbmZpcm1hdGlvbkxpbWl0KHVyaT86IFVSSSk6IG51bWJlcjtcbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXJnZUZpbGVDb25maXJtYXRpb25MaW1pdChhcmc/OiBzdHJpbmcgfCBVUkkpOiBudW1iZXIge1xuXHRjb25zdCBpc1JlbW90ZSA9IHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8IGFyZz8uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0Y29uc3QgaXNMb2NhbCA9IHR5cGVvZiBhcmcgIT09ICdzdHJpbmcnICYmIGFyZz8uc2NoZW1lID09PSBTY2hlbWFzLmZpbGU7XG5cblx0aWYgKGlzTG9jYWwpIHtcblx0XHQvLyBMb2NhbCBhbG1vc3QgaGFzIG5vIGxpbWl0IGluIGZpbGUgc2l6ZVxuXHRcdHJldHVybiAxMDI0ICogQnl0ZVNpemUuTUI7XG5cdH1cblxuXHRpZiAoaXNSZW1vdGUpIHtcblx0XHQvLyBXaXRoIGEgcmVtb3RlLCBwaWNrIGEgbG93IGxpbWl0IHRvIGF2b2lkXG5cdFx0Ly8gcG90ZW50aWFsbHkgY29zdGx5IGZpbGUgdHJhbnNmZXJzXG5cdFx0cmV0dXJuIDEwICogQnl0ZVNpemUuTUI7XG5cdH1cblxuXHRpZiAoaXNXZWIpIHtcblx0XHQvLyBXZWI6IHdlIGNhbm5vdCBrbm93IGZvciBzdXJlIGlmIGEgY29zdFxuXHRcdC8vIGlzIGFzc29jaWF0ZWQgd2l0aCB0aGUgZmlsZSB0cmFuc2ZlclxuXHRcdC8vIHNvIHdlIHBpY2sgYSByZWFzb25hYmx5IHNtYWxsIGxpbWl0XG5cdFx0cmV0dXJuIDUwICogQnl0ZVNpemUuTUI7XG5cdH1cblxuXHQvLyBMb2NhbCBkZXNrdG9wOiBhbG1vc3Qgbm8gbGltaXQgaW4gZmlsZSBzaXplXG5cdHJldHVybiAxMDI0ICogQnl0ZVNpemUuTUI7XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBVUEsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsWUFBWTtBQUlkLE1BQU0sZUFBZSxnQkFBOEIsYUFBYTtBQWlYaEUsU0FBUywwQkFBMEIsU0FBZ0U7QUFDekcsU0FBTyxRQUFRLFdBQVc7QUFDM0I7QUFvRE8sSUFBSyxXQUFMLGtCQUFLQSxjQUFMO0FBS04sRUFBQUEsb0JBQUEsYUFBVSxLQUFWO0FBS0EsRUFBQUEsb0JBQUEsVUFBTyxLQUFQO0FBS0EsRUFBQUEsb0JBQUEsZUFBWSxLQUFaO0FBU0EsRUFBQUEsb0JBQUEsa0JBQWUsTUFBZjtBQXhCVyxTQUFBQTtBQUFBLEdBQUE7QUEyQkwsSUFBSyxpQkFBTCxrQkFBS0Msb0JBQUw7QUFNTixFQUFBQSxnQ0FBQSxjQUFXLEtBQVg7QUFPQSxFQUFBQSxnQ0FBQSxZQUFTLEtBQVQ7QUFNQSxFQUFBQSxnQ0FBQSxnQkFBYSxLQUFiO0FBbkJXLFNBQUFBO0FBQUEsR0FBQTtBQWdHTCxJQUFXLG1CQUFYLGtCQUFXQyxzQkFBWDtBQUNOLEVBQUFBLG9DQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLG9DQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLG9DQUFBLGFBQVUsS0FBVjtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFvQlgsU0FBUyxvQkFBb0IsT0FBNkM7QUFDaEYsUUFBTSxZQUFZO0FBRWxCLFNBQU8sQ0FBQyxDQUFDLGFBQWEsT0FBTyxVQUFVLGdCQUFnQjtBQUN4RDtBQUVPLElBQVcsaUNBQVgsa0JBQVdDLG9DQUFYO0FBS04sRUFBQUEsZ0VBQUEsVUFBTyxLQUFQO0FBS0EsRUFBQUEsZ0VBQUEsbUJBQWdCLEtBQWhCO0FBS0EsRUFBQUEsZ0VBQUEsNEJBQXlCLEtBQXpCO0FBS0EsRUFBQUEsZ0VBQUEsb0JBQWlCLE1BQWpCO0FBS0EsRUFBQUEsZ0VBQUEsb0JBQWlCLEtBQWpCO0FBS0EsRUFBQUEsZ0VBQUEsdUJBQW9CLFFBQXBCO0FBS0EsRUFBQUEsZ0VBQUEsY0FBVyxRQUFYO0FBS0EsRUFBQUEsZ0VBQUEsV0FBUSxRQUFSO0FBS0EsRUFBQUEsZ0VBQUEscUJBQWtCLFFBQWxCO0FBTUEsRUFBQUEsZ0VBQUEsb0JBQWlCLFNBQWpCO0FBTUEsRUFBQUEsZ0VBQUEscUJBQWtCLFNBQWxCO0FBS0EsRUFBQUEsZ0VBQUEsc0JBQW1CLFNBQW5CO0FBS0EsRUFBQUEsZ0VBQUEsZUFBWSxVQUFaO0FBS0EsRUFBQUEsZ0VBQUEsa0JBQWUsVUFBZjtBQUtBLEVBQUFBLGdFQUFBLGdCQUFhLFVBQWI7QUE3RWlCLFNBQUFBO0FBQUEsR0FBQTtBQW1IWCxTQUFTLHVCQUF1QixVQUEyRjtBQUNqSSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFFTyxTQUFTLHdCQUF3QixVQUF3QztBQUMvRSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFNTyxTQUFTLDRCQUE0QixVQUE0RjtBQUN2SSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFNTyxTQUFTLHVCQUF1QixVQUF1RjtBQUM3SCxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFNTyxTQUFTLDBCQUEwQixVQUEwRjtBQUNuSSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFTTyxTQUFTLGdDQUFnQyxVQUFnRztBQUMvSSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFNTyxTQUFTLDRCQUE0QixVQUE0RjtBQUN2SSxTQUFPLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDbkM7QUFPTyxTQUFTLDRCQUE0QixVQUE0RjtBQUN2SSxNQUFJLENBQUMsdUJBQXVCLFFBQVEsR0FBRztBQUN0QyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sQ0FBQyxFQUFFLFNBQVMsZUFBZTtBQUNuQztBQU9PLFNBQVMsNkJBQTZCLFVBQTZGO0FBQ3pJLE1BQUksQ0FBQyx1QkFBdUIsUUFBUSxHQUFHO0FBQ3RDLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxDQUFDLEVBQUUsU0FBUyxlQUFlO0FBQ25DO0FBT08sU0FBUyw4QkFBOEIsVUFBOEY7QUFDM0ksU0FBTyxDQUFDLEVBQUUsU0FBUyxlQUFlO0FBQ25DO0FBWU8sU0FBUyxzQkFBc0IsVUFBc0Y7QUFDM0gsU0FBTyxDQUFDLEVBQUUsU0FBUyxlQUFlO0FBQ25DO0FBRU8sSUFBSyw4QkFBTCxrQkFBS0MsaUNBQUw7QUFDTixFQUFBQSw2QkFBQSxnQkFBYTtBQUNiLEVBQUFBLDZCQUFBLGtCQUFlO0FBQ2YsRUFBQUEsNkJBQUEsdUJBQW9CO0FBQ3BCLEVBQUFBLDZCQUFBLHNCQUFtQjtBQUNuQixFQUFBQSw2QkFBQSw2QkFBMEI7QUFDMUIsRUFBQUEsNkJBQUEsa0JBQWU7QUFDZixFQUFBQSw2QkFBQSxxQkFBa0I7QUFDbEIsRUFBQUEsNkJBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLDZCQUFBLGlCQUFjO0FBQ2QsRUFBQUEsNkJBQUEsYUFBVTtBQVZDLFNBQUFBO0FBQUEsR0FBQTtBQWtCTCxNQUFNLGdDQUFnQyxNQUEwQztBQUFBLEVBUzlFLFlBQVksU0FBMEIsTUFBbUM7QUFDaEYsVUFBTSxPQUFPO0FBRGdDO0FBQUEsRUFFOUM7QUFBQSxFQVRBLE9BQU8sT0FBTyxPQUF1QixNQUE0RDtBQUNoRyxVQUFNLGdCQUFnQixJQUFJLHdCQUF3QixNQUFNLFNBQVMsR0FBRyxJQUFJO0FBQ3hFLGtDQUE4QixlQUFlLElBQUk7QUFFakQsV0FBTztBQUFBLEVBQ1I7QUFLRDtBQUVPLFNBQVMsOEJBQThCLE9BQXVCLE1BQTREO0FBQ2hJLFNBQU8sd0JBQXdCLE9BQU8sT0FBTyxJQUFJO0FBQ2xEO0FBRU8sU0FBUyw4QkFBOEIsT0FBc0I7QUFDbkUsTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPLDhCQUE4QixTQUFTLGdCQUFnQixlQUFlLEdBQUcsdUJBQW1DO0FBQUEsRUFDcEg7QUFFQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLDhCQUE4QixPQUFjLE1BQTBDO0FBQ3JHLFFBQU0sT0FBTyxPQUFPLEdBQUcsSUFBSSx1QkFBdUI7QUFFbEQsU0FBTztBQUNSO0FBRU8sU0FBUyw4QkFBOEIsT0FBOEQ7QUFHM0csTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPO0FBQUEsRUFDUjtBQUdBLE1BQUksaUJBQWlCLHlCQUF5QjtBQUM3QyxXQUFPLE1BQU07QUFBQSxFQUNkO0FBSUEsUUFBTSxRQUFRLDZCQUE2QixLQUFLLE1BQU0sSUFBSTtBQUMxRCxNQUFJLENBQUMsT0FBTztBQUNYLFdBQU87QUFBQSxFQUNSO0FBRUEsVUFBUSxNQUFNLENBQUMsR0FBRztBQUFBLElBQ2pCLEtBQUs7QUFBd0MsYUFBTztBQUFBLElBQ3BELEtBQUs7QUFBOEMsYUFBTztBQUFBLElBQzFELEtBQUs7QUFBK0MsYUFBTztBQUFBLElBQzNELEtBQUs7QUFBMEMsYUFBTztBQUFBLElBQ3RELEtBQUs7QUFBMEMsYUFBTztBQUFBLElBQ3RELEtBQUs7QUFBNkMsYUFBTztBQUFBLElBQ3pELEtBQUs7QUFBMkMsYUFBTztBQUFBLElBQ3ZELEtBQUs7QUFBeUMsYUFBTztBQUFBLEVBQ3REO0FBRUEsU0FBTztBQUNSO0FBRU8sU0FBUyxzQkFBc0IsT0FBbUM7QUFHeEUsTUFBSSxpQkFBaUIsb0JBQW9CO0FBQ3hDLFdBQU8sTUFBTTtBQUFBLEVBQ2Q7QUFHQSxVQUFRLDhCQUE4QixLQUFLLEdBQUc7QUFBQSxJQUM3QyxLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBa0JPLElBQVcsZ0JBQVgsa0JBQVdDLG1CQUFYO0FBQ04sRUFBQUEsOEJBQUE7QUFDQSxFQUFBQSw4QkFBQTtBQUNBLEVBQUFBLDhCQUFBO0FBQ0EsRUFBQUEsOEJBQUE7QUFDQSxFQUFBQSw4QkFBQTtBQUxpQixTQUFBQTtBQUFBLEdBQUE7QUFxQlgsTUFBTSxtQkFBa0Q7QUFBQSxFQUk5RCxZQUFxQixVQUF3QixXQUFtQyxRQUFnQztBQUEzRjtBQUF3QjtBQUFtQztBQUFBLEVBQWtDO0FBQUEsRUFJbEgsWUFBWSxXQUFtQztBQUM5QyxXQUFPLEtBQUssY0FBYztBQUFBLEVBQzNCO0FBQ0Q7QUFLTyxJQUFXLGlCQUFYLGtCQUFXQyxvQkFBWDtBQUNOLEVBQUFBLGdDQUFBO0FBQ0EsRUFBQUEsZ0NBQUE7QUFDQSxFQUFBQSxnQ0FBQTtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUE4QlgsTUFBTSxvQkFBTixNQUFNLGtCQUFpQjtBQUFBLEVBTTdCLFlBQVksU0FBa0Qsa0JBQTJCO0FBQTNCO0FBRjlELFNBQWlCLGdCQUFnRjtBQW1DakcsU0FBaUIsUUFBUSxJQUFJLEtBQUssTUFBTTtBQUN2QyxZQUFNLFFBQVEsa0JBQWtCLFFBQWlCLE1BQU0sS0FBSyxnQkFBZ0I7QUFDNUUsWUFBTSxLQUFLLEtBQUssU0FBUyxJQUFJLGNBQVksQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDO0FBRTFELGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxTQUFpQixVQUFVLElBQUksS0FBSyxNQUFNO0FBQ3pDLFlBQU0sVUFBVSxrQkFBa0IsUUFBaUIsTUFBTSxLQUFLLGdCQUFnQjtBQUM5RSxjQUFRLEtBQUssS0FBSyxXQUFXLElBQUksY0FBWSxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFFOUQsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFNBQWlCLFVBQVUsSUFBSSxLQUFLLE1BQU07QUFDekMsWUFBTSxVQUFVLGtCQUFrQixRQUFpQixNQUFNLEtBQUssZ0JBQWdCO0FBQzlFLGNBQVEsS0FBSyxLQUFLLFdBQVcsSUFBSSxjQUFZLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQztBQUU5RCxhQUFPO0FBQUEsSUFDUixDQUFDO0FBb0hEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVMsV0FBa0IsQ0FBQztBQVE1QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFTLGFBQW9CLENBQUM7QUFROUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxhQUFvQixDQUFDO0FBdkw3QixlQUFXLFVBQVUsU0FBUztBQUc3QixjQUFRLE9BQU8sTUFBTTtBQUFBLFFBQ3BCLEtBQUs7QUFDSixlQUFLLFNBQVMsS0FBSyxPQUFPLFFBQVE7QUFDbEM7QUFBQSxRQUNELEtBQUs7QUFDSixlQUFLLFdBQVcsS0FBSyxPQUFPLFFBQVE7QUFDcEM7QUFBQSxRQUNELEtBQUs7QUFDSixlQUFLLFdBQVcsS0FBSyxPQUFPLFFBQVE7QUFDcEM7QUFBQSxNQUNGO0FBR0EsVUFBSSxLQUFLLGtCQUFrQixrQkFBaUIsbUJBQW1CO0FBQzlELFlBQUksT0FBTyxPQUFPLFFBQVEsVUFBVTtBQUNuQyxjQUFJLEtBQUssa0JBQWtCLFFBQVc7QUFDckMsaUJBQUssZ0JBQWdCLE9BQU87QUFBQSxVQUM3QixXQUFXLEtBQUssa0JBQWtCLE9BQU8sS0FBSztBQUM3QyxpQkFBSyxnQkFBZ0Isa0JBQWlCO0FBQUEsVUFDdkM7QUFBQSxRQUNELE9BQU87QUFDTixjQUFJLEtBQUssa0JBQWtCLFFBQVc7QUFDckMsaUJBQUssZ0JBQWdCLGtCQUFpQjtBQUFBLFVBQ3ZDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBNkJBLFNBQVMsYUFBa0IsT0FBa0M7QUFDNUQsV0FBTyxLQUFLLFdBQVcsVUFBVSxFQUFFLGlCQUFpQixNQUFNLEdBQUcsR0FBRyxLQUFLO0FBQUEsRUFDdEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsUUFBUSxhQUFrQixPQUFrQztBQUMzRCxXQUFPLEtBQUssV0FBVyxVQUFVLEVBQUUsaUJBQWlCLEtBQUssR0FBRyxHQUFHLEtBQUs7QUFBQSxFQUNyRTtBQUFBLEVBRVEsV0FBVyxVQUFlLFlBQTBDLE9BQWtDO0FBQzdHLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGlCQUFpQixNQUFNLFNBQVM7QUFHdEMsUUFBSSxDQUFDLGtCQUFrQixNQUFNLFNBQVMsYUFBb0IsR0FBRztBQUM1RCxVQUFJLEtBQUssTUFBTSxNQUFNLElBQUksUUFBUSxHQUFHO0FBQ25DLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxRQUFRLG1CQUFtQixLQUFLLE1BQU0sTUFBTSxhQUFhLFFBQVEsR0FBRztBQUN2RSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFHQSxRQUFJLENBQUMsa0JBQWtCLE1BQU0sU0FBUyxlQUFzQixHQUFHO0FBQzlELFVBQUksS0FBSyxRQUFRLE1BQU0sSUFBSSxRQUFRLEdBQUc7QUFDckMsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFFBQVEsbUJBQW1CLEtBQUssUUFBUSxNQUFNLGFBQWEsUUFBUSxHQUFHO0FBQ3pFLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUdBLFFBQUksQ0FBQyxrQkFBa0IsTUFBTSxTQUFTLGVBQXNCLEdBQUc7QUFDOUQsVUFBSSxLQUFLLFFBQVEsTUFBTSxXQUFXLFFBQVEsR0FBK0M7QUFDeEYsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFFBQVEsbUJBQW1CLEtBQUssUUFBUSxNQUFNLGFBQWEsUUFBUSxHQUFHO0FBQ3pFLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxXQUFvQjtBQUNuQixXQUFPLEtBQUssU0FBUyxTQUFTO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGFBQXNCO0FBQ3JCLFdBQU8sS0FBSyxXQUFXLFNBQVM7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsYUFBc0I7QUFDckIsV0FBTyxLQUFLLFdBQVcsU0FBUztBQUFBLEVBQ2pDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXQSxXQUFXLGVBQWdDO0FBQzFDLFdBQU8sS0FBSyxrQkFBa0I7QUFBQSxFQUMvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsaUJBQTBCO0FBQ3pCLFdBQU8sT0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQ3RDO0FBeUJEO0FBL0xhLGtCQUVZLG9CQUFvQjtBQUZ0QyxJQUFNLG1CQUFOO0FBaU1BLFNBQVMsU0FBUyxNQUFjLFdBQW1CLFlBQStCO0FBQ3hGLE1BQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxTQUFTLFdBQVc7QUFDOUMsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVUsU0FBUyxLQUFLLFFBQVE7QUFDbkMsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVUsT0FBTyxVQUFVLFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFDbkQsaUJBQWE7QUFBQSxFQUNkO0FBRUEsTUFBSSxZQUFZO0FBQ2YsV0FBTyxxQkFBcUIsTUFBTSxTQUFTO0FBQUEsRUFDNUM7QUFFQSxTQUFPLEtBQUssUUFBUSxTQUFTLE1BQU07QUFDcEM7QUEyT08sTUFBTSwyQkFBMkIsTUFBTTtBQUFBLEVBQzdDLFlBQ0MsU0FDUyxxQkFDQSxTQUNSO0FBQ0QsVUFBTSxPQUFPO0FBSEo7QUFDQTtBQUFBLEVBR1Y7QUFDRDtBQUVPLE1BQU0sbUNBQW1DLG1CQUFtQjtBQUFBLEVBQ2xFLFlBQ0MsU0FDa0IscUJBQ1QsTUFDVCxTQUNDO0FBQ0QsVUFBTSxTQUFTLHFCQUFxQixPQUFPO0FBSnpCO0FBQ1Q7QUFBQSxFQUlWO0FBQ0Q7QUFFTyxNQUFNLDJDQUEyQyxtQkFBbUI7QUFBQSxFQUUxRSxZQUNDLFNBQ1MsTUFDVCxTQUNDO0FBQ0QsVUFBTSxTQUFTLGlDQUE2QyxPQUFPO0FBSDFEO0FBQUEsRUFJVjtBQUNEO0FBRU8sSUFBVyxzQkFBWCxrQkFBV0MseUJBQVg7QUFDTixFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBWGlCLFNBQUFBO0FBQUEsR0FBQTtBQWtCWCxNQUFNLHdCQUF3QjtBQUFBLEVBQ3BDLEtBQUs7QUFBQSxFQUNMLGFBQWE7QUFBQSxFQUNiLGlCQUFpQjtBQUFBLEVBQ2pCLGtCQUFrQjtBQUNuQjtBQUVPLE1BQU0sdUJBQXVCO0FBQUEsRUFDbkMsS0FBSztBQUFBLEVBQ0wsU0FBUztBQUFBLEVBQ1QsMEJBQTBCO0FBQzNCO0FBRU8sTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSx5Q0FBeUM7QUFxQy9DLElBQUssV0FBTCxrQkFBS0MsY0FBTDtBQUNOLEVBQUFBLG9CQUFBO0FBQ0EsRUFBQUEsb0JBQUE7QUFDQSxFQUFBQSxvQkFBQTtBQUhXLFNBQUFBO0FBQUEsR0FBQTtBQVNMLE1BQU0sZ0JBQWdCO0FBSXRCLFNBQVMsS0FBSyxNQUFtRjtBQUN2RyxNQUFJLE9BQU8sS0FBSyxTQUFTLFlBQVksT0FBTyxLQUFLLFVBQVUsVUFBVTtBQUNwRSxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sS0FBSyxNQUFNLFNBQVMsRUFBRSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUU7QUFDdkQ7QUFFQSxlQUFzQix1QkFBdUIsTUFBVyxhQUEwQztBQUNqRyxNQUFJLFlBQVksWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLEtBQUssT0FBTyxDQUFDLENBQUMsR0FBRztBQUMvRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPLElBQUksUUFBUSxhQUFXO0FBQzdCLFVBQU0sYUFBYSxZQUFZLDJDQUEyQyxPQUFLO0FBQzlFLFVBQUksRUFBRSxXQUFXLEtBQUssVUFBVSxFQUFFLE9BQU87QUFDeEMsbUJBQVcsUUFBUTtBQUNuQixnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUtPLE1BQU0sWUFBTixNQUFNLFVBQVM7QUFBQSxFQU9yQixPQUFPLFdBQVcsTUFBc0I7QUFDdkMsUUFBSSxDQUFDLFNBQVMsSUFBSSxHQUFHO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLFVBQVMsSUFBSTtBQUN2QixhQUFPLFNBQVMsU0FBUyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUM7QUFBQSxJQUNqRDtBQUVBLFFBQUksT0FBTyxVQUFTLElBQUk7QUFDdkIsYUFBTyxTQUFTLFVBQVUsVUFBVSxPQUFPLFVBQVMsSUFBSSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQ25FO0FBRUEsUUFBSSxPQUFPLFVBQVMsSUFBSTtBQUN2QixhQUFPLFNBQVMsVUFBVSxVQUFVLE9BQU8sVUFBUyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDbkU7QUFFQSxRQUFJLE9BQU8sVUFBUyxJQUFJO0FBQ3ZCLGFBQU8sU0FBUyxVQUFVLFVBQVUsT0FBTyxVQUFTLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxJQUNuRTtBQUVBLFdBQU8sU0FBUyxVQUFVLFVBQVUsT0FBTyxVQUFTLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNuRTtBQUNEO0FBOUJhLFVBRUksS0FBSztBQUZULFVBR0ksS0FBSyxVQUFTLEtBQUssVUFBUztBQUhoQyxVQUlJLEtBQUssVUFBUyxLQUFLLFVBQVM7QUFKaEMsVUFLSSxLQUFLLFVBQVMsS0FBSyxVQUFTO0FBTHRDLElBQU0sV0FBTjtBQW9DQSxTQUFTLDhCQUE4QixLQUE0QjtBQUN6RSxRQUFNLFdBQVcsT0FBTyxRQUFRLFlBQVksS0FBSyxXQUFXLFFBQVE7QUFDcEUsUUFBTSxVQUFVLE9BQU8sUUFBUSxZQUFZLEtBQUssV0FBVyxRQUFRO0FBRW5FLE1BQUksU0FBUztBQUVaLFdBQU8sT0FBTyxTQUFTO0FBQUEsRUFDeEI7QUFFQSxNQUFJLFVBQVU7QUFHYixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBRUEsTUFBSSxPQUFPO0FBSVYsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN0QjtBQUdBLFNBQU8sT0FBTyxTQUFTO0FBQ3hCOyIsCiAgIm5hbWVzIjogWyJGaWxlVHlwZSIsICJGaWxlUGVybWlzc2lvbiIsICJGaWxlQ2hhbmdlRmlsdGVyIiwgIkZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyIsICJGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUiLCAiRmlsZU9wZXJhdGlvbiIsICJGaWxlQ2hhbmdlVHlwZSIsICJGaWxlT3BlcmF0aW9uUmVzdWx0IiwgIkZpbGVLaW5kIl0KfQo=
