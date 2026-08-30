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
import { coalesce } from "../../../base/common/arrays.js";
import { Promises, ResourceQueue } from "../../../base/common/async.js";
import { bufferedStreamToBuffer, bufferToReadable, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { Schemas } from "../../../base/common/network.js";
import { mark } from "../../../base/common/performance.js";
import { extUri, extUriIgnorePathCase, isAbsolutePath } from "../../../base/common/resources.js";
import { consumeStream, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, transform } from "../../../base/common/stream.js";
import { localize } from "../../../nls.js";
import { ensureFileSystemProviderError, etag, ETAG_DISABLED, FileChangesEvent, FileOperation, FileOperationError, FileOperationEvent, FileOperationResult, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, hasFileAppendCapability, hasFileAtomicReadCapability, hasFileFolderCopyCapability, hasFileReadStreamCapability, hasOpenReadWriteCloseCapability, hasReadWriteCapability, NotModifiedSinceFileOperationError, toFileOperationResult, toFileSystemProviderErrorCode, hasFileCloneCapability, TooLargeFileOperationError, hasFileAtomicDeleteCapability, hasFileAtomicWriteCapability, hasFileRealpathCapability } from "./files.js";
import { readFileIntoStream } from "./io.js";
import { ILogService } from "../../log/common/log.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
let FileService = class extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    // Choose a buffer size that is a balance between memory needs and
    // manageable IPC overhead. The larger the buffer size, the less
    // roundtrips we have to do for reading/writing data.
    this.BUFFER_SIZE = 256 * 1024;
    //#region File System Provider
    this._onDidChangeFileSystemProviderRegistrations = this._register(new Emitter());
    this.onDidChangeFileSystemProviderRegistrations = this._onDidChangeFileSystemProviderRegistrations.event;
    this._onWillActivateFileSystemProvider = this._register(new Emitter());
    this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
    this._onDidChangeFileSystemProviderCapabilities = this._register(new Emitter());
    this.onDidChangeFileSystemProviderCapabilities = this._onDidChangeFileSystemProviderCapabilities.event;
    this.provider = /* @__PURE__ */ new Map();
    //#endregion
    //#region Operation events
    this._onDidRunOperation = this._register(new Emitter());
    this.onDidRunOperation = this._onDidRunOperation.event;
    //#endregion
    //#region File Watching
    this.internalOnDidFilesChange = this._register(new Emitter());
    this._onDidUncorrelatedFilesChange = this._register(new Emitter());
    this.onDidFilesChange = this._onDidUncorrelatedFilesChange.event;
    // global `onDidFilesChange` skips correlated events
    this._onDidWatchError = this._register(new Emitter());
    this.onDidWatchError = this._onDidWatchError.event;
    this.activeWatchers = /* @__PURE__ */ new Map();
    //#endregion
    //#region Helpers
    this.writeQueue = this._register(new ResourceQueue());
  }
  registerProvider(scheme, provider) {
    if (this.provider.has(scheme)) {
      throw new Error(`A filesystem provider for the scheme '${scheme}' is already registered.`);
    }
    mark(`code/registerFilesystem/${scheme}`);
    const providerDisposables = new DisposableStore();
    this.provider.set(scheme, provider);
    this._onDidChangeFileSystemProviderRegistrations.fire({ added: true, scheme, provider });
    providerDisposables.add(provider.onDidChangeFile((changes) => {
      const event = new FileChangesEvent(changes, !this.isPathCaseSensitive(provider));
      this.internalOnDidFilesChange.fire(event);
      if (!event.hasCorrelation()) {
        this._onDidUncorrelatedFilesChange.fire(event);
      }
    }));
    if (typeof provider.onDidWatchError === "function") {
      providerDisposables.add(provider.onDidWatchError((error) => this._onDidWatchError.fire(new Error(error))));
    }
    providerDisposables.add(provider.onDidChangeCapabilities(() => this._onDidChangeFileSystemProviderCapabilities.fire({ provider, scheme })));
    return toDisposable(() => {
      this._onDidChangeFileSystemProviderRegistrations.fire({ added: false, scheme, provider });
      this.provider.delete(scheme);
      dispose(providerDisposables);
    });
  }
  getProvider(scheme) {
    return this.provider.get(scheme);
  }
  async activateProvider(scheme) {
    const joiners = [];
    this._onWillActivateFileSystemProvider.fire({
      scheme,
      join(promise) {
        joiners.push(promise);
      }
    });
    if (this.provider.has(scheme)) {
      return;
    }
    await Promises.settled(joiners);
  }
  async canHandleResource(resource) {
    await this.activateProvider(resource.scheme);
    return this.hasProvider(resource);
  }
  hasProvider(resource) {
    return this.provider.has(resource.scheme);
  }
  hasCapability(resource, capability) {
    const provider = this.provider.get(resource.scheme);
    return !!(provider && provider.capabilities & capability);
  }
  listCapabilities() {
    return Iterable.map(this.provider, ([scheme, provider]) => ({ scheme, capabilities: provider.capabilities }));
  }
  async withProvider(resource) {
    if (!isAbsolutePath(resource)) {
      throw new FileOperationError(localize("invalidPath", "Unable to resolve filesystem provider with relative file path '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_INVALID_PATH);
    }
    await this.activateProvider(resource.scheme);
    const provider = this.provider.get(resource.scheme);
    if (!provider) {
      const error = new ErrorNoTelemetry();
      error.message = localize("noProviderFound", "ENOPRO: No file system provider found for resource '{0}'", resource.toString());
      throw error;
    }
    return provider;
  }
  async withReadProvider(resource) {
    const provider = await this.withProvider(resource);
    if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider) || hasFileReadStreamCapability(provider)) {
      return provider;
    }
    throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite, FileReadStream nor FileOpenReadWriteClose capability which is needed for the read operation.`);
  }
  async withWriteProvider(resource) {
    const provider = await this.withProvider(resource);
    if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider)) {
      return provider;
    }
    throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite nor FileOpenReadWriteClose capability which is needed for the write operation.`);
  }
  async resolve(resource, options) {
    try {
      return await this.doResolveFile(resource, options);
    } catch (error) {
      if (toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound) {
        throw new FileOperationError(localize("fileNotFoundError", "Unable to resolve nonexistent file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_NOT_FOUND);
      }
      throw ensureFileSystemProviderError(error);
    }
  }
  async doResolveFile(resource, options) {
    const provider = await this.withProvider(resource);
    const isPathCaseSensitive = this.isPathCaseSensitive(provider);
    const resolveTo = options?.resolveTo;
    const resolveSingleChildDescendants = options?.resolveSingleChildDescendants;
    const resolveMetadata = options?.resolveMetadata;
    const stat = await provider.stat(resource);
    let trie;
    return this.toFileStat(provider, resource, stat, void 0, !!resolveMetadata, (stat2, siblings) => {
      if (!trie) {
        trie = TernarySearchTree.forUris(() => !isPathCaseSensitive);
        trie.set(resource, true);
        if (resolveTo) {
          trie.fill(true, resolveTo);
        }
      }
      if (trie.get(stat2.resource) || trie.findSuperstr(stat2.resource.with(
        { query: null, fragment: null }
        /* required for https://github.com/microsoft/vscode/issues/128151 */
      ))) {
        return true;
      }
      if (stat2.isDirectory && resolveSingleChildDescendants) {
        return siblings === 1;
      }
      return false;
    });
  }
  async toFileStat(provider, resource, stat, siblings, resolveMetadata, recurse) {
    const { providerExtUri } = this.getExtUri(provider);
    const fileStat = {
      resource,
      name: providerExtUri.basename(resource),
      isFile: (stat.type & FileType.File) !== 0,
      isDirectory: (stat.type & FileType.Directory) !== 0,
      isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
      mtime: stat.mtime,
      ctime: stat.ctime,
      size: stat.size,
      readonly: Boolean((stat.permissions ?? 0) & FilePermission.Readonly) || Boolean(provider.capabilities & FileSystemProviderCapabilities.Readonly),
      locked: Boolean((stat.permissions ?? 0) & FilePermission.Locked),
      executable: Boolean((stat.permissions ?? 0) & FilePermission.Executable),
      etag: etag({ mtime: stat.mtime, size: stat.size }),
      children: void 0
    };
    if (fileStat.isDirectory && recurse(fileStat, siblings)) {
      try {
        const entries = await provider.readdir(resource);
        const resolvedEntries = await Promises.settled(entries.map(async ([name, type]) => {
          try {
            const childResource = providerExtUri.joinPath(resource, name);
            const childStat = resolveMetadata ? await provider.stat(childResource) : { type };
            return await this.toFileStat(provider, childResource, childStat, entries.length, resolveMetadata, recurse);
          } catch (error) {
            this.logService.trace(error);
            return null;
          }
        }));
        fileStat.children = coalesce(resolvedEntries);
      } catch (error) {
        this.logService.trace(error);
        fileStat.children = [];
      }
      return fileStat;
    }
    return fileStat;
  }
  async resolveAll(toResolve) {
    return Promises.settled(toResolve.map(async (entry) => {
      try {
        return { stat: await this.doResolveFile(entry.resource, entry.options), success: true };
      } catch (error) {
        this.logService.trace(error);
        return { stat: void 0, success: false };
      }
    }));
  }
  async stat(resource) {
    const provider = await this.withProvider(resource);
    const stat = await provider.stat(resource);
    return this.toFileStat(
      provider,
      resource,
      stat,
      void 0,
      true,
      () => false
      /* Do not resolve any children */
    );
  }
  async realpath(resource) {
    const provider = await this.withProvider(resource);
    if (hasFileRealpathCapability(provider)) {
      const realpath = await provider.realpath(resource);
      return resource.with({ path: realpath });
    }
    return void 0;
  }
  async exists(resource) {
    const provider = await this.withProvider(resource);
    try {
      const stat = await provider.stat(resource);
      return !!stat;
    } catch (error) {
      return false;
    }
  }
  //#endregion
  //#region File Reading/Writing
  async canCreateFile(resource, options) {
    try {
      await this.doValidateCreateFile(resource, options);
    } catch (error) {
      return error;
    }
    return true;
  }
  async doValidateCreateFile(resource, options) {
    if (!options?.overwrite && await this.exists(resource)) {
      throw new FileOperationError(localize("fileExists", "Unable to create file '{0}' that already exists when overwrite flag is not set", this.resourceForError(resource)), FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
  }
  async createFile(resource, bufferOrReadableOrStream = VSBuffer.fromString(""), options) {
    await this.doValidateCreateFile(resource, options);
    const fileStat = await this.writeFile(resource, bufferOrReadableOrStream);
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));
    return fileStat;
  }
  async writeFile(resource, bufferOrReadableOrStream, options) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(resource), resource);
    const { providerExtUri } = this.getExtUri(provider);
    let writeFileOptions = options;
    if (hasFileAtomicWriteCapability(provider) && !writeFileOptions?.atomic) {
      const enforcedAtomicWrite = provider.enforceAtomicWriteFile?.(resource);
      if (enforcedAtomicWrite) {
        writeFileOptions = { ...options, atomic: enforcedAtomicWrite };
      }
    }
    try {
      let { stat, buffer: bufferOrReadableOrStreamOrBufferedStream } = await this.validateWriteFile(provider, resource, bufferOrReadableOrStream, writeFileOptions);
      if (!stat) {
        await this.mkdirp(provider, providerExtUri.dirname(resource));
      }
      if (!bufferOrReadableOrStreamOrBufferedStream) {
        bufferOrReadableOrStreamOrBufferedStream = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
      }
      if (!hasOpenReadWriteCloseCapability(provider) || // buffered writing is unsupported
      hasReadWriteCapability(provider) && bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer || // data is a full buffer already
      hasReadWriteCapability(provider) && hasFileAtomicWriteCapability(provider) && writeFileOptions?.atomic) {
        await this.doWriteUnbuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream);
      } else {
        await this.doWriteBuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer ? bufferToReadable(bufferOrReadableOrStreamOrBufferedStream) : bufferOrReadableOrStreamOrBufferedStream);
      }
      this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.WRITE));
    } catch (error) {
      throw new FileOperationError(localize("err.write", "Unable to write file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString()), toFileOperationResult(error), writeFileOptions);
    }
    return this.resolve(resource, { resolveMetadata: true });
  }
  async peekBufferForWriting(provider, bufferOrReadableOrStream) {
    let peekResult;
    if (hasReadWriteCapability(provider) && !(bufferOrReadableOrStream instanceof VSBuffer)) {
      if (isReadableStream(bufferOrReadableOrStream)) {
        const bufferedStream = await peekStream(bufferOrReadableOrStream, 3);
        if (bufferedStream.ended) {
          peekResult = VSBuffer.concat(bufferedStream.buffer);
        } else {
          peekResult = bufferedStream;
        }
      } else {
        peekResult = peekReadable(bufferOrReadableOrStream, (data) => VSBuffer.concat(data), 3);
      }
    } else {
      peekResult = bufferOrReadableOrStream;
    }
    return peekResult;
  }
  async validateWriteFile(provider, resource, bufferOrReadableOrStream, options) {
    const unlock = !!options?.unlock;
    if (unlock && !(provider.capabilities & FileSystemProviderCapabilities.FileWriteUnlock)) {
      throw new Error(localize("writeFailedUnlockUnsupported", "Unable to unlock file '{0}' because provider does not support it.", this.resourceForError(resource)));
    }
    if (options?.append && !hasFileAppendCapability(provider)) {
      throw new FileOperationError(localize("err.noAppend", "Filesystem provider for scheme '{0}' does not does not support append", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
    const atomic = !!options?.atomic;
    if (atomic) {
      if (!(provider.capabilities & FileSystemProviderCapabilities.FileAtomicWrite)) {
        throw new Error(localize("writeFailedAtomicUnsupported1", "Unable to atomically write file '{0}' because provider does not support it.", this.resourceForError(resource)));
      }
      if (!(provider.capabilities & FileSystemProviderCapabilities.FileReadWrite)) {
        throw new Error(localize("writeFailedAtomicUnsupported2", "Unable to atomically write file '{0}' because provider does not support unbuffered writes.", this.resourceForError(resource)));
      }
      if (unlock) {
        throw new Error(localize("writeFailedAtomicUnlock", "Unable to unlock file '{0}' because atomic write is enabled.", this.resourceForError(resource)));
      }
    }
    let stat = void 0;
    try {
      stat = await provider.stat(resource);
    } catch (error) {
      return /* @__PURE__ */ Object.create(null);
    }
    if ((stat.type & FileType.Directory) !== 0) {
      throw new FileOperationError(localize("fileIsDirectoryWriteError", "Unable to write file '{0}' that is actually a directory", this.resourceForError(resource)), FileOperationResult.FILE_IS_DIRECTORY, options);
    }
    this.throwIfFileIsReadonly(resource, stat);
    let buffer;
    if (typeof options?.mtime === "number" && typeof options.etag === "string" && options.etag !== ETAG_DISABLED && typeof stat.mtime === "number" && typeof stat.size === "number" && options.mtime < stat.mtime && options.etag !== etag({ mtime: options.mtime, size: stat.size })) {
      buffer = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
      if (buffer instanceof VSBuffer && buffer.byteLength === stat.size) {
        try {
          const { value } = await this.readFile(resource, { limits: { size: stat.size } });
          if (buffer.equals(value)) {
            return { stat, buffer };
          }
        } catch (error) {
        }
      }
      throw new FileOperationError(localize("fileModifiedError", "File Modified Since"), FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
    return { stat, buffer };
  }
  async readFile(resource, options, token) {
    const provider = await this.withReadProvider(resource);
    if (options?.atomic) {
      return this.doReadFileAtomic(provider, resource, options, token);
    }
    return this.doReadFile(provider, resource, options, token);
  }
  async doReadFileAtomic(provider, resource, options, token) {
    return new Promise((resolve, reject) => {
      this.writeQueue.queueFor(resource, async () => {
        try {
          const content = await this.doReadFile(provider, resource, options, token);
          resolve(content);
        } catch (error) {
          reject(error);
        }
      }, this.getExtUri(provider).providerExtUri);
    });
  }
  async doReadFile(provider, resource, options, token) {
    const stream = await this.doReadFileStream(provider, resource, {
      ...options,
      // optimization: since we know that the caller does not
      // care about buffering, we indicate this to the reader.
      // this reduces all the overhead the buffered reading
      // has (open, read, close) if the provider supports
      // unbuffered reading.
      preferUnbuffered: true
    }, token);
    return {
      ...stream,
      value: await streamToBuffer(stream.value)
    };
  }
  async readFileStream(resource, options, token) {
    const provider = await this.withReadProvider(resource);
    return this.doReadFileStream(provider, resource, options, token);
  }
  async doReadFileStream(provider, resource, options, token) {
    const cancellableSource = new CancellationTokenSource(token);
    let readFileOptions = options;
    if (hasFileAtomicReadCapability(provider) && provider.enforceAtomicReadFile?.(resource)) {
      readFileOptions = { ...options, atomic: true };
    }
    const statPromise = this.validateReadFile(resource, readFileOptions).then((stat) => stat, (error) => {
      cancellableSource.dispose(true);
      throw error;
    });
    let fileStream = void 0;
    try {
      if (typeof readFileOptions?.etag === "string" && readFileOptions.etag !== ETAG_DISABLED) {
        await statPromise;
      }
      if (readFileOptions?.atomic && hasFileAtomicReadCapability(provider) || // atomic reads are always unbuffered
      !(hasOpenReadWriteCloseCapability(provider) || hasFileReadStreamCapability(provider)) || // provider has no buffered capability
      hasReadWriteCapability(provider) && readFileOptions?.preferUnbuffered) {
        fileStream = this.readFileUnbuffered(provider, resource, readFileOptions);
      } else if (hasFileReadStreamCapability(provider)) {
        fileStream = this.readFileStreamed(provider, resource, cancellableSource.token, readFileOptions);
      } else {
        fileStream = this.readFileBuffered(provider, resource, cancellableSource.token, readFileOptions);
      }
      fileStream.on("end", () => cancellableSource.dispose());
      fileStream.on("error", () => cancellableSource.dispose());
      const fileStat = await statPromise;
      return {
        ...fileStat,
        value: fileStream
      };
    } catch (error) {
      if (fileStream) {
        await consumeStream(fileStream);
      }
      throw this.restoreReadError(error, resource, readFileOptions);
    }
  }
  restoreReadError(error, resource, options) {
    const message = localize("err.read", "Unable to read file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString());
    if (error instanceof NotModifiedSinceFileOperationError) {
      return new NotModifiedSinceFileOperationError(message, error.stat, options);
    }
    if (error instanceof TooLargeFileOperationError) {
      return new TooLargeFileOperationError(message, error.fileOperationResult, error.size, error.options);
    }
    return new FileOperationError(message, toFileOperationResult(error), options);
  }
  readFileStreamed(provider, resource, token, options = /* @__PURE__ */ Object.create(null)) {
    const fileStream = provider.readFileStream(resource, options, token);
    return transform(fileStream, {
      data: (data) => data instanceof VSBuffer ? data : VSBuffer.wrap(data),
      error: (error) => this.restoreReadError(error, resource, options)
    }, (data) => VSBuffer.concat(data));
  }
  readFileBuffered(provider, resource, token, options = /* @__PURE__ */ Object.create(null)) {
    const stream = newWriteableBufferStream();
    readFileIntoStream(provider, resource, stream, (data) => data, {
      ...options,
      bufferSize: this.BUFFER_SIZE,
      errorTransformer: (error) => this.restoreReadError(error, resource, options)
    }, token);
    return stream;
  }
  readFileUnbuffered(provider, resource, options) {
    const stream = newWriteableStream((data) => VSBuffer.concat(data));
    (async () => {
      try {
        let buffer;
        if (options?.atomic && hasFileAtomicReadCapability(provider)) {
          buffer = await provider.readFile(resource, { atomic: true });
        } else {
          buffer = await provider.readFile(resource);
        }
        if (typeof options?.position === "number") {
          buffer = buffer.slice(options.position);
        }
        if (typeof options?.length === "number") {
          buffer = buffer.slice(0, options.length);
        }
        this.validateReadFileLimits(resource, buffer.byteLength, options);
        stream.end(VSBuffer.wrap(buffer));
      } catch (err) {
        stream.error(err);
        stream.end();
      }
    })();
    return stream;
  }
  async validateReadFile(resource, options) {
    const stat = await this.resolve(resource, { resolveMetadata: true });
    if (stat.isDirectory) {
      throw new FileOperationError(localize("fileIsDirectoryReadError", "Unable to read file '{0}' that is actually a directory", this.resourceForError(resource)), FileOperationResult.FILE_IS_DIRECTORY, options);
    }
    if (typeof options?.etag === "string" && options.etag !== ETAG_DISABLED && options.etag === stat.etag) {
      throw new NotModifiedSinceFileOperationError(localize("fileNotModifiedError", "File not modified since"), stat, options);
    }
    this.validateReadFileLimits(resource, stat.size, options);
    return stat;
  }
  validateReadFileLimits(resource, size, options) {
    if (typeof options?.limits?.size === "number" && size > options.limits.size) {
      throw new TooLargeFileOperationError(localize("fileTooLargeError", "Unable to read file '{0}' that is too large to open", this.resourceForError(resource)), FileOperationResult.FILE_TOO_LARGE, size, options);
    }
  }
  //#endregion
  //#region Move/Copy/Delete/Create Folder
  async canMove(source, target, overwrite) {
    return this.doCanMoveCopy(source, target, "move", overwrite);
  }
  async canCopy(source, target, overwrite) {
    return this.doCanMoveCopy(source, target, "copy", overwrite);
  }
  async doCanMoveCopy(source, target, mode, overwrite) {
    if (source.toString() !== target.toString()) {
      try {
        const sourceProvider = mode === "move" ? this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source) : await this.withReadProvider(source);
        const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
        await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
      } catch (error) {
        return error;
      }
    }
    return true;
  }
  async move(source, target, overwrite) {
    const sourceProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, "move", !!overwrite);
    const fileStat = await this.resolve(target, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(source, mode === "move" ? FileOperation.MOVE : FileOperation.COPY, fileStat));
    return fileStat;
  }
  async copy(source, target, overwrite) {
    const sourceProvider = await this.withReadProvider(source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, "copy", !!overwrite);
    const fileStat = await this.resolve(target, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(source, mode === "copy" ? FileOperation.COPY : FileOperation.MOVE, fileStat));
    return fileStat;
  }
  async doMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
    if (source.toString() === target.toString()) {
      return mode;
    }
    const { exists, isSameResourceWithDifferentPathCase } = await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
    if (exists && !isSameResourceWithDifferentPathCase && overwrite) {
      await this.del(target, { recursive: true });
    }
    await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
    if (mode === "copy") {
      if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
        await sourceProvider.copy(source, target, { overwrite });
      } else {
        const sourceFile = await this.resolve(source);
        if (sourceFile.isDirectory) {
          await this.doCopyFolder(sourceProvider, sourceFile, targetProvider, target);
        } else {
          await this.doCopyFile(sourceProvider, source, targetProvider, target);
        }
      }
      return mode;
    } else {
      if (sourceProvider === targetProvider) {
        await sourceProvider.rename(source, target, { overwrite });
        return mode;
      } else {
        await this.doMoveCopy(sourceProvider, source, targetProvider, target, "copy", overwrite);
        await this.del(source, { recursive: true });
        return "copy";
      }
    }
  }
  async doCopyFile(sourceProvider, source, targetProvider, target) {
    if (hasOpenReadWriteCloseCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
      return this.doPipeBuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasOpenReadWriteCloseCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
      return this.doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasReadWriteCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
      return this.doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasReadWriteCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
      return this.doPipeUnbuffered(sourceProvider, source, targetProvider, target);
    }
  }
  async doCopyFolder(sourceProvider, sourceFolder, targetProvider, targetFolder) {
    await targetProvider.mkdir(targetFolder);
    if (Array.isArray(sourceFolder.children)) {
      await Promises.settled(sourceFolder.children.map(async (sourceChild) => {
        const targetChild = this.getExtUri(targetProvider).providerExtUri.joinPath(targetFolder, sourceChild.name);
        if (sourceChild.isDirectory) {
          return this.doCopyFolder(sourceProvider, await this.resolve(sourceChild.resource), targetProvider, targetChild);
        } else {
          return this.doCopyFile(sourceProvider, sourceChild.resource, targetProvider, targetChild);
        }
      }));
    }
  }
  async doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
    let isSameResourceWithDifferentPathCase = false;
    if (sourceProvider === targetProvider) {
      const { providerExtUri, isPathCaseSensitive } = this.getExtUri(sourceProvider);
      if (!isPathCaseSensitive) {
        isSameResourceWithDifferentPathCase = providerExtUri.isEqual(source, target);
      }
      if (isSameResourceWithDifferentPathCase && mode === "copy") {
        throw new Error(localize("unableToMoveCopyError1", "Unable to copy when source '{0}' is same as target '{1}' with different path case on a case insensitive file system", this.resourceForError(source), this.resourceForError(target)));
      }
      if (!isSameResourceWithDifferentPathCase && providerExtUri.isEqualOrParent(target, source)) {
        throw new Error(localize("unableToMoveCopyError2", "Unable to move/copy when source '{0}' is parent of target '{1}'.", this.resourceForError(source), this.resourceForError(target)));
      }
    }
    const exists = await this.exists(target);
    if (exists && !isSameResourceWithDifferentPathCase) {
      if (!overwrite) {
        throw new FileOperationError(localize("unableToMoveCopyError3", "Unable to move/copy '{0}' because target '{1}' already exists at destination.", this.resourceForError(source), this.resourceForError(target)), FileOperationResult.FILE_MOVE_CONFLICT);
      }
      if (sourceProvider === targetProvider) {
        const { providerExtUri } = this.getExtUri(sourceProvider);
        if (providerExtUri.isEqualOrParent(source, target)) {
          throw new Error(localize("unableToMoveCopyError4", "Unable to move/copy '{0}' into '{1}' since a file would replace the folder it is contained in.", this.resourceForError(source), this.resourceForError(target)));
        }
      }
    }
    return { exists, isSameResourceWithDifferentPathCase };
  }
  getExtUri(provider) {
    const isPathCaseSensitive = this.isPathCaseSensitive(provider);
    return {
      providerExtUri: isPathCaseSensitive ? extUri : extUriIgnorePathCase,
      isPathCaseSensitive
    };
  }
  isPathCaseSensitive(provider) {
    return !!(provider.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
  }
  async createFolder(resource) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
    await this.mkdirp(provider, resource);
    const fileStat = await this.resolve(resource, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));
    return fileStat;
  }
  async mkdirp(provider, directory) {
    const directoriesToCreate = [];
    const { providerExtUri } = this.getExtUri(provider);
    while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
      try {
        const stat = await provider.stat(directory);
        if ((stat.type & FileType.Directory) === 0) {
          throw new Error(localize("mkdirExistsError", "Unable to create folder '{0}' that already exists but is not a directory", this.resourceForError(directory)));
        }
        break;
      } catch (error) {
        if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
          throw error;
        }
        directoriesToCreate.push(providerExtUri.basename(directory));
        directory = providerExtUri.dirname(directory);
      }
    }
    for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
      directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
      try {
        await provider.mkdir(directory);
      } catch (error) {
        if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileExists) {
          throw error;
        }
      }
    }
  }
  async canDelete(resource, options) {
    try {
      await this.doValidateDelete(resource, options);
    } catch (error) {
      return error;
    }
    return true;
  }
  async doValidateDelete(resource, options) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
    const useTrash = !!options?.useTrash;
    if (useTrash && !(provider.capabilities & FileSystemProviderCapabilities.Trash)) {
      throw new Error(localize("deleteFailedTrashUnsupported", "Unable to delete file '{0}' via trash because provider does not support it.", this.resourceForError(resource)));
    }
    const atomic = options?.atomic;
    if (atomic && !(provider.capabilities & FileSystemProviderCapabilities.FileAtomicDelete)) {
      throw new Error(localize("deleteFailedAtomicUnsupported", "Unable to delete file '{0}' atomically because provider does not support it.", this.resourceForError(resource)));
    }
    if (useTrash && atomic) {
      throw new Error(localize("deleteFailedTrashAndAtomicUnsupported", "Unable to atomically delete file '{0}' because using trash is enabled.", this.resourceForError(resource)));
    }
    let stat = void 0;
    try {
      stat = await provider.stat(resource);
    } catch (error) {
    }
    if (stat) {
      this.throwIfFileIsReadonly(resource, stat);
    } else {
      throw new FileOperationError(localize("deleteFailedNotFound", "Unable to delete nonexistent file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_NOT_FOUND);
    }
    const recursive = !!options?.recursive;
    if (!recursive) {
      const stat2 = await this.resolve(resource);
      if (stat2.isDirectory && Array.isArray(stat2.children) && stat2.children.length > 0) {
        throw new Error(localize("deleteFailedNonEmptyFolder", "Unable to delete non-empty folder '{0}'.", this.resourceForError(resource)));
      }
    }
    return provider;
  }
  async del(resource, options) {
    const provider = await this.doValidateDelete(resource, options);
    let deleteFileOptions = options;
    if (hasFileAtomicDeleteCapability(provider) && !deleteFileOptions?.atomic) {
      const enforcedAtomicDelete = provider.enforceAtomicDelete?.(resource);
      if (enforcedAtomicDelete) {
        deleteFileOptions = { ...options, atomic: enforcedAtomicDelete };
      }
    }
    const useTrash = !!deleteFileOptions?.useTrash;
    const recursive = !!deleteFileOptions?.recursive;
    const atomic = deleteFileOptions?.atomic ?? false;
    await provider.delete(resource, { recursive, useTrash, atomic });
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
  }
  //#endregion
  //#region Clone File
  async cloneFile(source, target) {
    const sourceProvider = await this.withProvider(source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    if (sourceProvider === targetProvider && this.getExtUri(sourceProvider).providerExtUri.isEqual(source, target)) {
      return;
    }
    if (sourceProvider === targetProvider && hasFileCloneCapability(sourceProvider)) {
      return sourceProvider.cloneFile(source, target);
    }
    await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
    if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
      return this.writeQueue.queueFor(source, () => sourceProvider.copy(source, target, { overwrite: true }), this.getExtUri(sourceProvider).providerExtUri);
    }
    return this.writeQueue.queueFor(source, () => this.doCopyFile(sourceProvider, source, targetProvider, target), this.getExtUri(sourceProvider).providerExtUri);
  }
  createWatcher(resource, options) {
    return this.watch(resource, {
      ...options,
      // Explicitly set a correlation id so that file events that originate
      // from requests from extensions are exclusively routed back to the
      // extension host and not into the workbench.
      correlationId: FileService.WATCHER_CORRELATION_IDS++
    });
  }
  watch(resource, options = { recursive: false, excludes: [] }) {
    const disposables = new DisposableStore();
    let watchDisposed = false;
    let disposeWatch = () => {
      watchDisposed = true;
    };
    disposables.add(toDisposable(() => disposeWatch()));
    (async () => {
      try {
        const disposable = await this.doWatch(resource, options);
        if (watchDisposed) {
          dispose(disposable);
        } else {
          disposeWatch = () => dispose(disposable);
        }
      } catch (error) {
        this.logService.error(error);
      }
    })();
    const correlationId = options.correlationId;
    if (typeof correlationId === "number") {
      const fileChangeEmitter = disposables.add(new Emitter());
      disposables.add(this.internalOnDidFilesChange.event((e) => {
        if (e.correlates(correlationId)) {
          fileChangeEmitter.fire(e);
        }
      }));
      const watcher = {
        onDidChange: fileChangeEmitter.event,
        dispose: () => disposables.dispose()
      };
      return watcher;
    }
    return disposables;
  }
  async doWatch(resource, options) {
    const provider = await this.withProvider(resource);
    const watchHash = hash([this.getExtUri(provider).providerExtUri.getComparisonKey(resource), options]);
    let watcher = this.activeWatchers.get(watchHash);
    if (!watcher) {
      watcher = {
        count: 0,
        disposable: provider.watch(resource, options)
      };
      this.activeWatchers.set(watchHash, watcher);
    }
    watcher.count += 1;
    return toDisposable(() => {
      if (watcher) {
        watcher.count--;
        if (watcher.count === 0) {
          dispose(watcher.disposable);
          this.activeWatchers.delete(watchHash);
        }
      }
    });
  }
  dispose() {
    super.dispose();
    for (const [, watcher] of this.activeWatchers) {
      dispose(watcher.disposable);
    }
    this.activeWatchers.clear();
  }
  async doWriteBuffered(provider, resource, options, readableOrStreamOrBufferedStream) {
    return this.writeQueue.queueFor(resource, async () => {
      const handle = await provider.open(resource, { create: true, unlock: options?.unlock ?? false, append: options?.append ?? false });
      try {
        if (isReadableStream(readableOrStreamOrBufferedStream) || isReadableBufferedStream(readableOrStreamOrBufferedStream)) {
          await this.doWriteStreamBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
        } else {
          await this.doWriteReadableBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
        }
      } catch (error) {
        throw ensureFileSystemProviderError(error);
      } finally {
        await provider.close(handle);
      }
    }, this.getExtUri(provider).providerExtUri);
  }
  async doWriteStreamBufferedQueued(provider, handle, streamOrBufferedStream) {
    let posInFile = 0;
    let stream;
    if (isReadableBufferedStream(streamOrBufferedStream)) {
      if (streamOrBufferedStream.buffer.length > 0) {
        const chunk = VSBuffer.concat(streamOrBufferedStream.buffer);
        await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
        posInFile += chunk.byteLength;
      }
      if (streamOrBufferedStream.ended) {
        return;
      }
      stream = streamOrBufferedStream.stream;
    } else {
      stream = streamOrBufferedStream;
    }
    return new Promise((resolve, reject) => {
      listenStream(stream, {
        onData: async (chunk) => {
          stream.pause();
          try {
            await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
          } catch (error) {
            return reject(error);
          }
          posInFile += chunk.byteLength;
          setTimeout(() => stream.resume());
        },
        onError: (error) => reject(error),
        onEnd: () => resolve()
      });
    });
  }
  async doWriteReadableBufferedQueued(provider, handle, readable) {
    let posInFile = 0;
    let chunk;
    while ((chunk = readable.read()) !== null) {
      await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
      posInFile += chunk.byteLength;
    }
  }
  async doWriteBuffer(provider, handle, buffer, length, posInFile, posInBuffer) {
    let totalBytesWritten = 0;
    while (totalBytesWritten < length) {
      const bytesWritten = await provider.write(handle, posInFile + totalBytesWritten, buffer.buffer, posInBuffer + totalBytesWritten, length - totalBytesWritten);
      totalBytesWritten += bytesWritten;
    }
  }
  async doWriteUnbuffered(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
    return this.writeQueue.queueFor(resource, () => this.doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream), this.getExtUri(provider).providerExtUri);
  }
  async doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
    let buffer;
    if (bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer) {
      buffer = bufferOrReadableOrStreamOrBufferedStream;
    } else if (isReadableStream(bufferOrReadableOrStreamOrBufferedStream)) {
      buffer = await streamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    } else if (isReadableBufferedStream(bufferOrReadableOrStreamOrBufferedStream)) {
      buffer = await bufferedStreamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    } else {
      buffer = readableToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    }
    await provider.writeFile(resource, buffer.buffer, { create: true, overwrite: true, unlock: options?.unlock ?? false, atomic: options?.atomic ?? false, append: options?.append ?? false });
  }
  async doPipeBuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeBufferedQueued(sourceProvider, source, targetProvider, target) {
    let sourceHandle = void 0;
    let targetHandle = void 0;
    try {
      sourceHandle = await sourceProvider.open(source, { create: false });
      targetHandle = await targetProvider.open(target, { create: true, unlock: false });
      const buffer = VSBuffer.alloc(this.BUFFER_SIZE);
      let posInFile = 0;
      let posInBuffer = 0;
      let bytesRead = 0;
      do {
        bytesRead = await sourceProvider.read(sourceHandle, posInFile, buffer.buffer, posInBuffer, buffer.byteLength - posInBuffer);
        await this.doWriteBuffer(targetProvider, targetHandle, buffer, bytesRead, posInFile, posInBuffer);
        posInFile += bytesRead;
        posInBuffer += bytesRead;
        if (posInBuffer === buffer.byteLength) {
          posInBuffer = 0;
        }
      } while (bytesRead > 0);
    } catch (error) {
      throw ensureFileSystemProviderError(error);
    } finally {
      await Promises.settled([
        typeof sourceHandle === "number" ? sourceProvider.close(sourceHandle) : Promise.resolve(),
        typeof targetHandle === "number" ? targetProvider.close(targetHandle) : Promise.resolve()
      ]);
    }
  }
  async doPipeUnbuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target) {
    return targetProvider.writeFile(target, await sourceProvider.readFile(source), { create: true, overwrite: true, unlock: false, atomic: false });
  }
  async doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target) {
    const targetHandle = await targetProvider.open(target, { create: true, unlock: false });
    try {
      const buffer = await sourceProvider.readFile(source);
      await this.doWriteBuffer(targetProvider, targetHandle, VSBuffer.wrap(buffer), buffer.byteLength, 0, 0);
    } catch (error) {
      throw ensureFileSystemProviderError(error);
    } finally {
      await targetProvider.close(targetHandle);
    }
  }
  async doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target) {
    const buffer = await streamToBuffer(this.readFileBuffered(sourceProvider, source, CancellationToken.None));
    await this.doWriteUnbuffered(targetProvider, target, void 0, buffer);
  }
  throwIfFileSystemIsReadonly(provider, resource) {
    if (provider.capabilities & FileSystemProviderCapabilities.Readonly) {
      throw new FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
    return provider;
  }
  throwIfFileIsReadonly(resource, stat) {
    if ((stat.permissions ?? 0) & FilePermission.Readonly) {
      throw new FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
  }
  resourceForError(resource) {
    if (resource.scheme === Schemas.file) {
      return resource.fsPath;
    }
    return resource.toString(true);
  }
  //#endregion
};
FileService.WATCHER_CORRELATION_IDS = 0;
FileService = __decorateClass([
  __decorateParam(0, ILogService)
], FileService);
export {
  FileService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXGNvbW1vblxcZmlsZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUmVzb3VyY2VRdWV1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGJ1ZmZlcmVkU3RyZWFtVG9CdWZmZXIsIGJ1ZmZlclRvUmVhZGFibGUsIG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSwgcmVhZGFibGVUb0J1ZmZlciwgc3RyZWFtVG9CdWZmZXIsIFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0sIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBleHRVcmksIGV4dFVyaUlnbm9yZVBhdGhDYXNlLCBJRXh0VXJpLCBpc0Fic29sdXRlUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb25zdW1lU3RyZWFtLCBpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0sIGlzUmVhZGFibGVTdHJlYW0sIGxpc3RlblN0cmVhbSwgbmV3V3JpdGVhYmxlU3RyZWFtLCBwZWVrUmVhZGFibGUsIHBlZWtTdHJlYW0sIHRyYW5zZm9ybSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZW5zdXJlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIGV0YWcsIEVUQUdfRElTQUJMRUQsIEZpbGVDaGFuZ2VzRXZlbnQsIElGaWxlRGVsZXRlT3B0aW9ucywgRmlsZU9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uRXZlbnQsIEZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVQZXJtaXNzaW9uLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUsIGhhc0ZpbGVBcHBlbmRDYXBhYmlsaXR5LCBoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHksIGhhc0ZpbGVGb2xkZXJDb3B5Q2FwYWJpbGl0eSwgaGFzRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5LCBoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBoYXNSZWFkV3JpdGVDYXBhYmlsaXR5LCBJQ3JlYXRlRmlsZU9wdGlvbnMsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUZpbGVTdHJlYW1Db250ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyLCBJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljUmVhZENhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIElSZWFkRmlsZU9wdGlvbnMsIElSZWFkRmlsZVN0cmVhbU9wdGlvbnMsIElSZXNvbHZlRmlsZU9wdGlvbnMsIElGaWxlU3RhdFJlc3VsdCwgSUZpbGVTdGF0UmVzdWx0V2l0aE1ldGFkYXRhLCBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMsIElTdGF0LCBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhLCBJV2F0Y2hPcHRpb25zLCBJV3JpdGVGaWxlT3B0aW9ucywgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvciwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0LCB0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgaGFzRmlsZUNsb25lQ2FwYWJpbGl0eSwgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IsIGhhc0ZpbGVBdG9taWNEZWxldGVDYXBhYmlsaXR5LCBoYXNGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5LCBJV2F0Y2hPcHRpb25zV2l0aENvcnJlbGF0aW9uLCBJRmlsZVN5c3RlbVdhdGNoZXIsIElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24sIGhhc0ZpbGVSZWFscGF0aENhcGFiaWxpdHkgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IHJlYWRGaWxlSW50b1N0cmVhbSB9IGZyb20gJy4vaW8uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuZXhwb3J0IGNsYXNzIEZpbGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8gQ2hvb3NlIGEgYnVmZmVyIHNpemUgdGhhdCBpcyBhIGJhbGFuY2UgYmV0d2VlbiBtZW1vcnkgbmVlZHMgYW5kXG5cdC8vIG1hbmFnZWFibGUgSVBDIG92ZXJoZWFkLiBUaGUgbGFyZ2VyIHRoZSBidWZmZXIgc2l6ZSwgdGhlIGxlc3Ncblx0Ly8gcm91bmR0cmlwcyB3ZSBoYXZlIHRvIGRvIGZvciByZWFkaW5nL3dyaXRpbmcgZGF0YS5cblx0cHJpdmF0ZSByZWFkb25seSBCVUZGRVJfU0laRSA9IDI1NiAqIDEwMjQ7XG5cblx0Y29uc3RydWN0b3IoQElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEZpbGUgU3lzdGVtIFByb3ZpZGVyXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUZpbGVTeXN0ZW1Qcm92aWRlckFjdGl2YXRpb25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyA9IHRoaXMuX29uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXIgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTeXN0ZW1Qcm92aWRlcj4oKTtcblxuXHRyZWdpc3RlclByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5wcm92aWRlci5oYXMoc2NoZW1lKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBIGZpbGVzeXN0ZW0gcHJvdmlkZXIgZm9yIHRoZSBzY2hlbWUgJyR7c2NoZW1lfScgaXMgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdG1hcmsoYGNvZGUvcmVnaXN0ZXJGaWxlc3lzdGVtLyR7c2NoZW1lfWApO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIEFkZCBwcm92aWRlciB3aXRoIGV2ZW50XG5cdFx0dGhpcy5wcm92aWRlci5zZXQoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zLmZpcmUoeyBhZGRlZDogdHJ1ZSwgc2NoZW1lLCBwcm92aWRlciB9KTtcblxuXHRcdC8vIEZvcndhcmQgZXZlbnRzIGZyb20gcHJvdmlkZXJcblx0XHRwcm92aWRlckRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBGaWxlQ2hhbmdlc0V2ZW50KGNoYW5nZXMsICF0aGlzLmlzUGF0aENhc2VTZW5zaXRpdmUocHJvdmlkZXIpKTtcblxuXHRcdFx0Ly8gQWx3YXlzIGVtaXQgYW55IGV2ZW50IGludGVybmFsbHlcblx0XHRcdHRoaXMuaW50ZXJuYWxPbkRpZEZpbGVzQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXG5cdFx0XHQvLyBPbmx5IGVtaXQgdW5jb3JyZWxhdGVkIGV2ZW50cyBpbiB0aGUgZ2xvYmFsIGBvbkRpZEZpbGVzQ2hhbmdlYCBldmVudFxuXHRcdFx0aWYgKCFldmVudC5oYXNDb3JyZWxhdGlvbigpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkVW5jb3JyZWxhdGVkRmlsZXNDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0eXBlb2YgcHJvdmlkZXIub25EaWRXYXRjaEVycm9yID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRwcm92aWRlckRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZFdhdGNoRXJyb3IoZXJyb3IgPT4gdGhpcy5fb25EaWRXYXRjaEVycm9yLmZpcmUobmV3IEVycm9yKGVycm9yKSkpKTtcblx0XHR9XG5cdFx0cHJvdmlkZXJEaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuZmlyZSh7IHByb3ZpZGVyLCBzY2hlbWUgfSkpKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zLmZpcmUoeyBhZGRlZDogZmFsc2UsIHNjaGVtZSwgcHJvdmlkZXIgfSk7XG5cdFx0XHR0aGlzLnByb3ZpZGVyLmRlbGV0ZShzY2hlbWUpO1xuXG5cdFx0XHRkaXNwb3NlKHByb3ZpZGVyRGlzcG9zYWJsZXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcpOiBJRmlsZVN5c3RlbVByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlci5nZXQoc2NoZW1lKTtcblx0fVxuXG5cdGFzeW5jIGFjdGl2YXRlUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEVtaXQgYW4gZXZlbnQgdGhhdCB3ZSBhcmUgYWJvdXQgdG8gYWN0aXZhdGUgYSBwcm92aWRlciB3aXRoIHRoZSBnaXZlbiBzY2hlbWUuXG5cdFx0Ly8gTGlzdGVuZXJzIGNhbiBwYXJ0aWNpcGF0ZSBpbiB0aGUgYWN0aXZhdGlvbiBieSByZWdpc3RlcmluZyBhIHByb3ZpZGVyIGZvciBpdC5cblx0XHRjb25zdCBqb2luZXJzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHR0aGlzLl9vbldpbGxBY3RpdmF0ZUZpbGVTeXN0ZW1Qcm92aWRlci5maXJlKHtcblx0XHRcdHNjaGVtZSxcblx0XHRcdGpvaW4ocHJvbWlzZSkge1xuXHRcdFx0XHRqb2luZXJzLnB1c2gocHJvbWlzZSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMucHJvdmlkZXIuaGFzKHNjaGVtZSkpIHtcblx0XHRcdHJldHVybjsgLy8gcHJvdmlkZXIgaXMgYWxyZWFkeSBoZXJlIHNvIHdlIGNhbiByZXR1cm4gZGlyZWN0bHlcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgcHJvdmlkZXIgaXMgbm90IHlldCB0aGVyZSwgbWFrZSBzdXJlIHRvIGpvaW4gb24gdGhlIGxpc3RlbmVycyBhc3N1bWluZ1xuXHRcdC8vIHRoYXQgaXQgdGFrZXMgYSBiaXQgbG9uZ2VyIHRvIHJlZ2lzdGVyIHRoZSBmaWxlIHN5c3RlbSBwcm92aWRlci5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGpvaW5lcnMpO1xuXHR9XG5cblx0YXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gQXdhaXQgYWN0aXZhdGlvbiBvZiBwb3RlbnRpYWxseSBleHRlbnNpb24gY29udHJpYnV0ZWQgcHJvdmlkZXJzXG5cdFx0YXdhaXQgdGhpcy5hY3RpdmF0ZVByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNQcm92aWRlcihyZXNvdXJjZSk7XG5cdH1cblxuXHRoYXNQcm92aWRlcihyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvdmlkZXIuaGFzKHJlc291cmNlLnNjaGVtZSk7XG5cdH1cblxuXHRoYXNDYXBhYmlsaXR5KHJlc291cmNlOiBVUkksIGNhcGFiaWxpdHk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wcm92aWRlci5nZXQocmVzb3VyY2Uuc2NoZW1lKTtcblxuXHRcdHJldHVybiAhIShwcm92aWRlciAmJiAocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgY2FwYWJpbGl0eSkpO1xuXHR9XG5cblx0bGlzdENhcGFiaWxpdGllcygpOiBJdGVyYWJsZTx7IHNjaGVtZTogc3RyaW5nOyBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB9PiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcCh0aGlzLnByb3ZpZGVyLCAoW3NjaGVtZSwgcHJvdmlkZXJdKSA9PiAoeyBzY2hlbWUsIGNhcGFiaWxpdGllczogcHJvdmlkZXIuY2FwYWJpbGl0aWVzIH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB3aXRoUHJvdmlkZXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTeXN0ZW1Qcm92aWRlcj4ge1xuXG5cdFx0Ly8gQXNzZXJ0IHBhdGggaXMgYWJzb2x1dGVcblx0XHRpZiAoIWlzQWJzb2x1dGVQYXRoKHJlc291cmNlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnaW52YWxpZFBhdGgnLCBcIlVuYWJsZSB0byByZXNvbHZlIGZpbGVzeXN0ZW0gcHJvdmlkZXIgd2l0aCByZWxhdGl2ZSBmaWxlIHBhdGggJ3swfSdcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JTlZBTElEX1BBVEgpO1xuXHRcdH1cblxuXHRcdC8vIEFjdGl2YXRlIHByb3ZpZGVyXG5cdFx0YXdhaXQgdGhpcy5hY3RpdmF0ZVByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSk7XG5cblx0XHQvLyBBc3NlcnQgcHJvdmlkZXJcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMucHJvdmlkZXIuZ2V0KHJlc291cmNlLnNjaGVtZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3JOb1RlbGVtZXRyeSgpO1xuXHRcdFx0ZXJyb3IubWVzc2FnZSA9IGxvY2FsaXplKCdub1Byb3ZpZGVyRm91bmQnLCBcIkVOT1BSTzogTm8gZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZm91bmQgZm9yIHJlc291cmNlICd7MH0nXCIsIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdpdGhSZWFkUHJvdmlkZXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHRpZiAoaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcikgfHwgaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShwcm92aWRlcikgfHwgaGFzRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgRmlsZXN5c3RlbSBwcm92aWRlciBmb3Igc2NoZW1lICcke3Jlc291cmNlLnNjaGVtZX0nIG5laXRoZXIgaGFzIEZpbGVSZWFkV3JpdGUsIEZpbGVSZWFkU3RyZWFtIG5vciBGaWxlT3BlblJlYWRXcml0ZUNsb3NlIGNhcGFiaWxpdHkgd2hpY2ggaXMgbmVlZGVkIGZvciB0aGUgcmVhZCBvcGVyYXRpb24uYCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdpdGhXcml0ZVByb3ZpZGVyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHk+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHJlc291cmNlKTtcblxuXHRcdGlmIChoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSB8fCBoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgRmlsZXN5c3RlbSBwcm92aWRlciBmb3Igc2NoZW1lICcke3Jlc291cmNlLnNjaGVtZX0nIG5laXRoZXIgaGFzIEZpbGVSZWFkV3JpdGUgbm9yIEZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgY2FwYWJpbGl0eSB3aGljaCBpcyBuZWVkZWQgZm9yIHRoZSB3cml0ZSBvcGVyYXRpb24uYCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gT3BlcmF0aW9uIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUnVuT3BlcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RmlsZU9wZXJhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSdW5PcGVyYXRpb24gPSB0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBNZXRhZGF0YSBSZXNvbHZpbmdcblxuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblx0YXN5bmMgcmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0Pjtcblx0YXN5bmMgcmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmRvUmVzb2x2ZUZpbGUocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIFNwZWNpYWxseSBoYW5kbGUgZmlsZSBub3QgZm91bmQgY2FzZSBhcyBmaWxlIG9wZXJhdGlvbiByZXN1bHRcblx0XHRcdGlmICh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZU5vdEZvdW5kRXJyb3InLCBcIlVuYWJsZSB0byByZXNvbHZlIG5vbmV4aXN0ZW50IGZpbGUgJ3swfSdcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCdWJibGUgdXAgYW55IG90aGVyIGVycm9yIGFzIGlzXG5cdFx0XHR0aHJvdyBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXQ+O1xuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlzUGF0aENhc2VTZW5zaXRpdmUgPSB0aGlzLmlzUGF0aENhc2VTZW5zaXRpdmUocHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVRvID0gb3B0aW9ucz8ucmVzb2x2ZVRvO1xuXHRcdGNvbnN0IHJlc29sdmVTaW5nbGVDaGlsZERlc2NlbmRhbnRzID0gb3B0aW9ucz8ucmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM7XG5cdFx0Y29uc3QgcmVzb2x2ZU1ldGFkYXRhID0gb3B0aW9ucz8ucmVzb2x2ZU1ldGFkYXRhO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQocmVzb3VyY2UpO1xuXG5cdFx0bGV0IHRyaWU6IFRlcm5hcnlTZWFyY2hUcmVlPFVSSSwgYm9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4gdGhpcy50b0ZpbGVTdGF0KHByb3ZpZGVyLCByZXNvdXJjZSwgc3RhdCwgdW5kZWZpbmVkLCAhIXJlc29sdmVNZXRhZGF0YSwgKHN0YXQsIHNpYmxpbmdzKSA9PiB7XG5cblx0XHRcdC8vIGxhenkgdHJpZSB0byBjaGVjayBmb3IgcmVjdXJzaXZlIHJlc29sdmluZ1xuXHRcdFx0aWYgKCF0cmllKSB7XG5cdFx0XHRcdHRyaWUgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPHRydWU+KCgpID0+ICFpc1BhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRcdFx0dHJpZS5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHRpZiAocmVzb2x2ZVRvKSB7XG5cdFx0XHRcdFx0dHJpZS5maWxsKHRydWUsIHJlc29sdmVUbyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gY2hlY2sgZm9yIHJlY3Vyc2l2ZSByZXNvbHZpbmdcblx0XHRcdGlmICh0cmllLmdldChzdGF0LnJlc291cmNlKSB8fCB0cmllLmZpbmRTdXBlcnN0cihzdGF0LnJlc291cmNlLndpdGgoeyBxdWVyeTogbnVsbCwgZnJhZ21lbnQ6IG51bGwgfSAvKiByZXF1aXJlZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyODE1MSAqLykpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjaGVjayBmb3IgcmVzb2x2aW5nIHNpbmdsZSBjaGlsZCBmb2xkZXJzXG5cdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSAmJiByZXNvbHZlU2luZ2xlQ2hpbGREZXNjZW5kYW50cykge1xuXHRcdFx0XHRyZXR1cm4gc2libGluZ3MgPT09IDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdG9GaWxlU3RhdChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgcmVzb3VyY2U6IFVSSSwgc3RhdDogSVN0YXQgfCB7IHR5cGU6IEZpbGVUeXBlIH0gJiBQYXJ0aWFsPElTdGF0Piwgc2libGluZ3M6IG51bWJlciB8IHVuZGVmaW5lZCwgcmVzb2x2ZU1ldGFkYXRhOiBib29sZWFuLCByZWN1cnNlOiAoc3RhdDogSUZpbGVTdGF0LCBzaWJsaW5ncz86IG51bWJlcikgPT4gYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0Pjtcblx0cHJpdmF0ZSBhc3luYyB0b0ZpbGVTdGF0KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCByZXNvdXJjZTogVVJJLCBzdGF0OiBJU3RhdCwgc2libGluZ3M6IG51bWJlciB8IHVuZGVmaW5lZCwgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlLCByZWN1cnNlOiAoc3RhdDogSUZpbGVTdGF0LCBzaWJsaW5ncz86IG51bWJlcikgPT4gYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblx0cHJpdmF0ZSBhc3luYyB0b0ZpbGVTdGF0KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCByZXNvdXJjZTogVVJJLCBzdGF0OiBJU3RhdCB8IHsgdHlwZTogRmlsZVR5cGUgfSAmIFBhcnRpYWw8SVN0YXQ+LCBzaWJsaW5nczogbnVtYmVyIHwgdW5kZWZpbmVkLCByZXNvbHZlTWV0YWRhdGE6IGJvb2xlYW4sIHJlY3Vyc2U6IChzdGF0OiBJRmlsZVN0YXQsIHNpYmxpbmdzPzogbnVtYmVyKSA9PiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXQ+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyRXh0VXJpIH0gPSB0aGlzLmdldEV4dFVyaShwcm92aWRlcik7XG5cblx0XHQvLyBjb252ZXJ0IHRvIGZpbGUgc3RhdFxuXHRcdGNvbnN0IGZpbGVTdGF0OiBJRmlsZVN0YXQgPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdG5hbWU6IHByb3ZpZGVyRXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSxcblx0XHRcdGlzRmlsZTogKHN0YXQudHlwZSAmIEZpbGVUeXBlLkZpbGUpICE9PSAwLFxuXHRcdFx0aXNEaXJlY3Rvcnk6IChzdGF0LnR5cGUgJiBGaWxlVHlwZS5EaXJlY3RvcnkpICE9PSAwLFxuXHRcdFx0aXNTeW1ib2xpY0xpbms6IChzdGF0LnR5cGUgJiBGaWxlVHlwZS5TeW1ib2xpY0xpbmspICE9PSAwLFxuXHRcdFx0bXRpbWU6IHN0YXQubXRpbWUsXG5cdFx0XHRjdGltZTogc3RhdC5jdGltZSxcblx0XHRcdHNpemU6IHN0YXQuc2l6ZSxcblx0XHRcdHJlYWRvbmx5OiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgRmlsZVBlcm1pc3Npb24uUmVhZG9ubHkpIHx8IEJvb2xlYW4ocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KSxcblx0XHRcdGxvY2tlZDogQm9vbGVhbigoc3RhdC5wZXJtaXNzaW9ucyA/PyAwKSAmIEZpbGVQZXJtaXNzaW9uLkxvY2tlZCksXG5cdFx0XHRleGVjdXRhYmxlOiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgRmlsZVBlcm1pc3Npb24uRXhlY3V0YWJsZSksXG5cdFx0XHRldGFnOiBldGFnKHsgbXRpbWU6IHN0YXQubXRpbWUsIHNpemU6IHN0YXQuc2l6ZSB9KSxcblx0XHRcdGNoaWxkcmVuOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Ly8gY2hlY2sgdG8gcmVjdXJzZSBmb3IgZGlyZWN0b3JpZXNcblx0XHRpZiAoZmlsZVN0YXQuaXNEaXJlY3RvcnkgJiYgcmVjdXJzZShmaWxlU3RhdCwgc2libGluZ3MpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcHJvdmlkZXIucmVhZGRpcihyZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkRW50cmllcyA9IGF3YWl0IFByb21pc2VzLnNldHRsZWQoZW50cmllcy5tYXAoYXN5bmMgKFtuYW1lLCB0eXBlXSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGlsZFJlc291cmNlID0gcHJvdmlkZXJFeHRVcmkuam9pblBhdGgocmVzb3VyY2UsIG5hbWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hpbGRTdGF0ID0gcmVzb2x2ZU1ldGFkYXRhID8gYXdhaXQgcHJvdmlkZXIuc3RhdChjaGlsZFJlc291cmNlKSA6IHsgdHlwZSB9O1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy50b0ZpbGVTdGF0KHByb3ZpZGVyLCBjaGlsZFJlc291cmNlLCBjaGlsZFN0YXQsIGVudHJpZXMubGVuZ3RoLCByZXNvbHZlTWV0YWRhdGEsIHJlY3Vyc2UpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDsgLy8gY2FuIGhhcHBlbiBlLmcuIGR1ZSB0byBwZXJtaXNzaW9uIGVycm9yc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIG1ha2Ugc3VyZSB0byBnZXQgcmlkIG9mIG51bGwgdmFsdWVzIHRoYXQgc2lnbmFsIGEgZmFpbHVyZSB0byByZXNvbHZlIGEgcGFydGljdWxhciBlbnRyeVxuXHRcdFx0XHRmaWxlU3RhdC5jaGlsZHJlbiA9IGNvYWxlc2NlKHJlc29sdmVkRW50cmllcyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpO1xuXG5cdFx0XHRcdGZpbGVTdGF0LmNoaWxkcmVuID0gW107IC8vIGdyYWNlZnVsbHkgaGFuZGxlIGVycm9ycywgd2UgbWF5IG5vdCBoYXZlIHBlcm1pc3Npb25zIHRvIHJlYWRcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbGVTdGF0O1xuXHRcdH1cblxuXHRcdHJldHVybiBmaWxlU3RhdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVBbGwodG9SZXNvbHZlOiB7IHJlc291cmNlOiBVUkk7IG9wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+O1xuXHRhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJOyBvcHRpb25zOiBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMgfVtdKTogUHJvbWlzZTxJRmlsZVN0YXRSZXN1bHRXaXRoTWV0YWRhdGFbXT47XG5cdGFzeW5jIHJlc29sdmVBbGwodG9SZXNvbHZlOiB7IHJlc291cmNlOiBVUkk7IG9wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZXMuc2V0dGxlZCh0b1Jlc29sdmUubWFwKGFzeW5jIGVudHJ5ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB7IHN0YXQ6IGF3YWl0IHRoaXMuZG9SZXNvbHZlRmlsZShlbnRyeS5yZXNvdXJjZSwgZW50cnkub3B0aW9ucyksIHN1Y2Nlc3M6IHRydWUgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShlcnJvcik7XG5cblx0XHRcdFx0cmV0dXJuIHsgc3RhdDogdW5kZWZpbmVkLCBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQocmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIHRoaXMudG9GaWxlU3RhdChwcm92aWRlciwgcmVzb3VyY2UsIHN0YXQsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gZmFsc2UgLyogRG8gbm90IHJlc29sdmUgYW55IGNoaWxkcmVuICovKTtcblx0fVxuXG5cdGFzeW5jIHJlYWxwYXRoKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0aWYgKGhhc0ZpbGVSZWFscGF0aENhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRjb25zdCByZWFscGF0aCA9IGF3YWl0IHByb3ZpZGVyLnJlYWxwYXRoKHJlc291cmNlKTtcblxuXHRcdFx0cmV0dXJuIHJlc291cmNlLndpdGgoeyBwYXRoOiByZWFscGF0aCB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZXhpc3RzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHJlc291cmNlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRcdHJldHVybiAhIXN0YXQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBSZWFkaW5nL1dyaXRpbmdcblxuXHRhc3luYyBjYW5DcmVhdGVGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvVmFsaWRhdGVDcmVhdGVGaWxlKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1ZhbGlkYXRlQ3JlYXRlRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUNyZWF0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyB2YWxpZGF0ZSBvdmVyd3JpdGVcblx0XHRpZiAoIW9wdGlvbnM/Lm92ZXJ3cml0ZSAmJiBhd2FpdCB0aGlzLmV4aXN0cyhyZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2ZpbGVFeGlzdHMnLCBcIlVuYWJsZSB0byBjcmVhdGUgZmlsZSAnezB9JyB0aGF0IGFscmVhZHkgZXhpc3RzIHdoZW4gb3ZlcndyaXRlIGZsYWcgaXMgbm90IHNldFwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpLCBvcHRpb25zPzogSUNyZWF0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblxuXHRcdC8vIHZhbGlkYXRlXG5cdFx0YXdhaXQgdGhpcy5kb1ZhbGlkYXRlQ3JlYXRlRmlsZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHQvLyBkbyB3cml0ZSBpbnRvIGZpbGUgKHRoaXMgd2lsbCBjcmVhdGUgaXQgdG9vKVxuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgdGhpcy53cml0ZUZpbGUocmVzb3VyY2UsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSk7XG5cblx0XHQvLyBldmVudHNcblx0XHR0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5maXJlKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQocmVzb3VyY2UsIEZpbGVPcGVyYXRpb24uQ1JFQVRFLCBmaWxlU3RhdCkpO1xuXG5cdFx0cmV0dXJuIGZpbGVTdGF0O1xuXHR9XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFdyaXRlUHJvdmlkZXIocmVzb3VyY2UpLCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgeyBwcm92aWRlckV4dFVyaSB9ID0gdGhpcy5nZXRFeHRVcmkocHJvdmlkZXIpO1xuXG5cdFx0bGV0IHdyaXRlRmlsZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdGlmIChoYXNGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiAhd3JpdGVGaWxlT3B0aW9ucz8uYXRvbWljKSB7XG5cdFx0XHRjb25zdCBlbmZvcmNlZEF0b21pY1dyaXRlID0gcHJvdmlkZXIuZW5mb3JjZUF0b21pY1dyaXRlRmlsZT8uKHJlc291cmNlKTtcblx0XHRcdGlmIChlbmZvcmNlZEF0b21pY1dyaXRlKSB7XG5cdFx0XHRcdHdyaXRlRmlsZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGF0b21pYzogZW5mb3JjZWRBdG9taWNXcml0ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIHZhbGlkYXRlIHdyaXRlICh0aGlzIG1heSBhbHJlYWR5IHJldHVybiBhIHBlZWtlZC1hdCBidWZmZXIpXG5cdFx0XHRsZXQgeyBzdGF0LCBidWZmZXI6IGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0gfSA9IGF3YWl0IHRoaXMudmFsaWRhdGVXcml0ZUZpbGUocHJvdmlkZXIsIHJlc291cmNlLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW0sIHdyaXRlRmlsZU9wdGlvbnMpO1xuXG5cdFx0XHQvLyBta2RpciByZWN1cnNpdmVseSBhcyBuZWVkZWRcblx0XHRcdGlmICghc3RhdCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm1rZGlycChwcm92aWRlciwgcHJvdmlkZXJFeHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBvcHRpbWl6YXRpb246IGlmIHRoZSBwcm92aWRlciBoYXMgdW5idWZmZXJlZCB3cml0ZSBjYXBhYmlsaXR5IGFuZCB0aGUgZGF0YVxuXHRcdFx0Ly8gdG8gd3JpdGUgaXMgbm90IGEgYnVmZmVyLCB3ZSBjb25zdW1lIHVwIHRvIDMgY2h1bmtzIGFuZCB0cnkgdG8gd3JpdGUgdGhlIGRhdGFcblx0XHRcdC8vIHVuYnVmZmVyZWQgdG8gcmVkdWNlIHRoZSBvdmVyaGVhZC4gSWYgdGhlIHN0cmVhbSBvciByZWFkYWJsZSBoYXMgbW9yZSBkYXRhXG5cdFx0XHQvLyB0byBwcm92aWRlIHdlIGNvbnRpbnVlIHRvIHdyaXRlIGJ1ZmZlcmVkLlxuXHRcdFx0aWYgKCFidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSB7XG5cdFx0XHRcdGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0gPSBhd2FpdCB0aGlzLnBlZWtCdWZmZXJGb3JXcml0aW5nKHByb3ZpZGVyLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB3cml0ZSBmaWxlOiB1bmJ1ZmZlcmVkXG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSB8fFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gYnVmZmVyZWQgd3JpdGluZyBpcyB1bnN1cHBvcnRlZFxuXHRcdFx0XHQoaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB8fFx0XHQvLyBkYXRhIGlzIGEgZnVsbCBidWZmZXIgYWxyZWFkeVxuXHRcdFx0XHQoaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgaGFzRmlsZUF0b21pY1dyaXRlQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgd3JpdGVGaWxlT3B0aW9ucz8uYXRvbWljKVx0Ly8gYXRvbWljIHdyaXRlIGZvcmNlcyB1bmJ1ZmZlcmVkIHdyaXRlIGlmIHRoZSBwcm92aWRlciBzdXBwb3J0cyBpdFxuXHRcdFx0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZVVuYnVmZmVyZWQocHJvdmlkZXIsIHJlc291cmNlLCB3cml0ZUZpbGVPcHRpb25zLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gd3JpdGUgZmlsZTogYnVmZmVyZWRcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVCdWZmZXJlZChwcm92aWRlciwgcmVzb3VyY2UsIHdyaXRlRmlsZU9wdGlvbnMsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0gaW5zdGFuY2VvZiBWU0J1ZmZlciA/IGJ1ZmZlclRvUmVhZGFibGUoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSkgOiBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZXZlbnRzXG5cdFx0XHR0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5maXJlKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQocmVzb3VyY2UsIEZpbGVPcGVyYXRpb24uV1JJVEUpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZXJyLndyaXRlJywgXCJVbmFibGUgdG8gd3JpdGUgZmlsZSAnezB9JyAoezF9KVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpLCBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcikudG9TdHJpbmcoKSksIHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvciksIHdyaXRlRmlsZU9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIHBlZWtCdWZmZXJGb3JXcml0aW5nKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW06IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0+IHtcblx0XHRsZXQgcGVla1Jlc3VsdDogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbTtcblx0XHRpZiAoaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgIShidWZmZXJPclJlYWRhYmxlT3JTdHJlYW0gaW5zdGFuY2VvZiBWU0J1ZmZlcikpIHtcblx0XHRcdGlmIChpc1JlYWRhYmxlU3RyZWFtKGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSkpIHtcblx0XHRcdFx0Y29uc3QgYnVmZmVyZWRTdHJlYW0gPSBhd2FpdCBwZWVrU3RyZWFtKGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSwgMyk7XG5cdFx0XHRcdGlmIChidWZmZXJlZFN0cmVhbS5lbmRlZCkge1xuXHRcdFx0XHRcdHBlZWtSZXN1bHQgPSBWU0J1ZmZlci5jb25jYXQoYnVmZmVyZWRTdHJlYW0uYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwZWVrUmVzdWx0ID0gYnVmZmVyZWRTdHJlYW07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBlZWtSZXN1bHQgPSBwZWVrUmVhZGFibGUoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtLCBkYXRhID0+IFZTQnVmZmVyLmNvbmNhdChkYXRhKSwgMyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBlZWtSZXN1bHQgPSBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBlZWtSZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlV3JpdGVGaWxlKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW06IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIG9wdGlvbnM/OiBJV3JpdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8eyBzdGF0OiBJU3RhdCB8IHVuZGVmaW5lZDsgYnVmZmVyOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtIHwgdW5kZWZpbmVkIH0+IHtcblxuXHRcdC8vIFZhbGlkYXRlIHVubG9jayBzdXBwb3J0XG5cdFx0Y29uc3QgdW5sb2NrID0gISFvcHRpb25zPy51bmxvY2s7XG5cdFx0aWYgKHVubG9jayAmJiAhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlV3JpdGVVbmxvY2spKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3dyaXRlRmFpbGVkVW5sb2NrVW5zdXBwb3J0ZWQnLCBcIlVuYWJsZSB0byB1bmxvY2sgZmlsZSAnezB9JyBiZWNhdXNlIHByb3ZpZGVyIGRvZXMgbm90IHN1cHBvcnQgaXQuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBhcHBlbmQgc3VwcG9ydFxuXHRcdGlmIChvcHRpb25zPy5hcHBlbmQgJiYgIWhhc0ZpbGVBcHBlbmRDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZXJyLm5vQXBwZW5kJywgXCJGaWxlc3lzdGVtIHByb3ZpZGVyIGZvciBzY2hlbWUgJ3swfScgZG9lcyBub3QgZG9lcyBub3Qgc3VwcG9ydCBhcHBlbmRcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCk7XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgYXRvbWljIHN1cHBvcnRcblx0XHRjb25zdCBhdG9taWMgPSAhIW9wdGlvbnM/LmF0b21pYztcblx0XHRpZiAoYXRvbWljKSB7XG5cdFx0XHRpZiAoIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3dyaXRlRmFpbGVkQXRvbWljVW5zdXBwb3J0ZWQxJywgXCJVbmFibGUgdG8gYXRvbWljYWxseSB3cml0ZSBmaWxlICd7MH0nIGJlY2F1c2UgcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBpdC5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd3cml0ZUZhaWxlZEF0b21pY1Vuc3VwcG9ydGVkMicsIFwiVW5hYmxlIHRvIGF0b21pY2FsbHkgd3JpdGUgZmlsZSAnezB9JyBiZWNhdXNlIHByb3ZpZGVyIGRvZXMgbm90IHN1cHBvcnQgdW5idWZmZXJlZCB3cml0ZXMuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVubG9jaykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3dyaXRlRmFpbGVkQXRvbWljVW5sb2NrJywgXCJVbmFibGUgdG8gdW5sb2NrIGZpbGUgJ3swfScgYmVjYXVzZSBhdG9taWMgd3JpdGUgaXMgZW5hYmxlZC5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIHZpYSBmaWxlIHN0YXQgbWV0YSBkYXRhXG5cdFx0bGV0IHN0YXQ6IElTdGF0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBmaWxlIG1pZ2h0IG5vdCBleGlzdFxuXHRcdH1cblxuXHRcdC8vIEZpbGUgY2Fubm90IGJlIGRpcmVjdG9yeVxuXHRcdGlmICgoc3RhdC50eXBlICYgRmlsZVR5cGUuRGlyZWN0b3J5KSAhPT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZUlzRGlyZWN0b3J5V3JpdGVFcnJvcicsIFwiVW5hYmxlIHRvIHdyaXRlIGZpbGUgJ3swfScgdGhhdCBpcyBhY3R1YWxseSBhIGRpcmVjdG9yeVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0RJUkVDVE9SWSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSBjYW5ub3QgYmUgcmVhZG9ubHlcblx0XHR0aGlzLnRocm93SWZGaWxlSXNSZWFkb25seShyZXNvdXJjZSwgc3RhdCk7XG5cblx0XHQvLyBEaXJ0eSB3cml0ZSBwcmV2ZW50aW9uOiBpZiB0aGUgZmlsZSBvbiBkaXNrIGhhcyBiZWVuIGNoYW5nZWQgYW5kIGRvZXMgbm90IG1hdGNoIG91ciBleHBlY3RlZFxuXHRcdC8vIG10aW1lIGFuZCBldGFnLCB3ZSBiYWlsIG91dCB0byBwcmV2ZW50IGRpcnR5IHdyaXRpbmcuXG5cdFx0Ly9cblx0XHQvLyBGaXJzdCwgd2UgY2hlY2sgZm9yIGEgbXRpbWUgdGhhdCBpcyBpbiB0aGUgZnV0dXJlIGJlZm9yZSB3ZSBkbyBtb3JlIGNoZWNrcy4gVGhlIGFzc3VtcHRpb24gaXNcblx0XHQvLyB0aGF0IG9ubHkgdGhlIG10aW1lIGlzIGFuIGluZGljYXRvciBmb3IgYSBmaWxlIHRoYXQgaGFzIGNoYW5nZWQgb24gZGlzay5cblx0XHQvL1xuXHRcdC8vIFNlY29uZCwgaWYgdGhlIG10aW1lIGhhcyBhZHZhbmNlZCwgd2UgY29tcGFyZSB0aGUgc2l6ZSBvZiB0aGUgZmlsZSBvbiBkaXNrIHdpdGggb3VyIHByZXZpb3VzXG5cdFx0Ly8gb25lIHVzaW5nIHRoZSBldGFnKCkgZnVuY3Rpb24uIFJlbHlpbmcgb25seSBvbiB0aGUgbXRpbWUgY2hlY2sgaGFzIHByb292ZW4gdG8gcHJvZHVjZSBmYWxzZVxuXHRcdC8vIHBvc2l0aXZlcyBkdWUgdG8gZmlsZSBzeXN0ZW0gd2VpcmRuZXNzIChlc3BlY2lhbGx5IGFyb3VuZCByZW1vdGUgZmlsZSBzeXN0ZW1zKS4gQXMgc3VjaCwgdGhlXG5cdFx0Ly8gY2hlY2sgZm9yIHNpemUgaXMgYSB3ZWFrZXIgY2hlY2sgYmVjYXVzZSBpdCBjYW4gcmV0dXJuIGEgZmFsc2UgbmVnYXRpdmUgaWYgdGhlIGZpbGUgaGFzIGNoYW5nZWRcblx0XHQvLyBidXQgdG8gdGhlIHNhbWUgbGVuZ3RoLiBUaGlzIGlzIGEgY29tcHJvbWlzZSB3ZSB0YWtlIHRvIGF2b2lkIGhhdmluZyB0byBwcm9kdWNlIGNoZWNrc3VtcyBvZlxuXHRcdC8vIHRoZSBmaWxlIGNvbnRlbnQgZm9yIGNvbXBhcmlzb24gd2hpY2ggd291bGQgYmUgbXVjaCBzbG93ZXIgdG8gY29tcHV0ZS5cblx0XHQvL1xuXHRcdC8vIFRoaXJkLCBpZiB0aGUgZXRhZygpIHR1cm5zIG91dCB0byBiZSBkaWZmZXJlbnQsIHdlIGRvIG9uZSBhdHRlbXB0IHRvIGNvbXBhcmUgdGhlIGJ1ZmZlciB3ZVxuXHRcdC8vIGFyZSBhYm91dCB0byB3cml0ZSB3aXRoIHRoZSBjb250ZW50cyBvbiBkaXNrIHRvIGZpZ3VyZSBvdXQgaWYgdGhlIGNvbnRlbnRzIGFyZSBpZGVudGljYWwuXG5cdFx0Ly8gSW4gdGhhdCBjYXNlIHdlIGFsbG93IHRoZSB3cml0aW5nIGFzIGl0IHdvdWxkIHJlc3VsdCBpbiB0aGUgc2FtZSBjb250ZW50cyBpbiB0aGUgZmlsZS5cblx0XHRsZXQgYnVmZmVyOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChcblx0XHRcdHR5cGVvZiBvcHRpb25zPy5tdGltZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIG9wdGlvbnMuZXRhZyA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5ldGFnICE9PSBFVEFHX0RJU0FCTEVEICYmXG5cdFx0XHR0eXBlb2Ygc3RhdC5tdGltZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHN0YXQuc2l6ZSA9PT0gJ251bWJlcicgJiZcblx0XHRcdG9wdGlvbnMubXRpbWUgPCBzdGF0Lm10aW1lICYmIG9wdGlvbnMuZXRhZyAhPT0gZXRhZyh7IG10aW1lOiBvcHRpb25zLm10aW1lIC8qIG5vdCB1c2luZyBzdGF0Lm10aW1lIGZvciBhIHJlYXNvbiwgc2VlIGFib3ZlICovLCBzaXplOiBzdGF0LnNpemUgfSlcblx0XHQpIHtcblx0XHRcdGJ1ZmZlciA9IGF3YWl0IHRoaXMucGVla0J1ZmZlckZvcldyaXRpbmcocHJvdmlkZXIsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSk7XG5cdFx0XHRpZiAoYnVmZmVyIGluc3RhbmNlb2YgVlNCdWZmZXIgJiYgYnVmZmVyLmJ5dGVMZW5ndGggPT09IHN0YXQuc2l6ZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHsgdmFsdWUgfSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocmVzb3VyY2UsIHsgbGltaXRzOiB7IHNpemU6IHN0YXQuc2l6ZSB9IH0pO1xuXHRcdFx0XHRcdGlmIChidWZmZXIuZXF1YWxzKHZhbHVlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgc3RhdCwgYnVmZmVyIH07IC8vIGFsbG93IHdyaXRpbmcgc2luY2UgY29udGVudHMgYXJlIGlkZW50aWNhbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmUsIHRocm93IHRoZSBGSUxFX01PRElGSUVEX1NJTkNFIGVycm9yXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZU1vZGlmaWVkRXJyb3InLCBcIkZpbGUgTW9kaWZpZWQgU2luY2VcIiksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3RhdCwgYnVmZmVyIH07XG5cdH1cblxuXHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhSZWFkUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmF0b21pYykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9SZWFkRmlsZUF0b21pYyhwcm92aWRlciwgcmVzb3VyY2UsIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb1JlYWRGaWxlKHByb3ZpZGVyLCByZXNvdXJjZSwgb3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlYWRGaWxlQXRvbWljKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SUZpbGVDb250ZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLndyaXRlUXVldWUucXVldWVGb3IocmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5kb1JlYWRGaWxlKHByb3ZpZGVyLCByZXNvdXJjZSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHRcdHJlc29sdmUoY29udGVudCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcy5nZXRFeHRVcmkocHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZWFkRmlsZShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gYXdhaXQgdGhpcy5kb1JlYWRGaWxlU3RyZWFtKHByb3ZpZGVyLCByZXNvdXJjZSwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdC8vIG9wdGltaXphdGlvbjogc2luY2Ugd2Uga25vdyB0aGF0IHRoZSBjYWxsZXIgZG9lcyBub3Rcblx0XHRcdC8vIGNhcmUgYWJvdXQgYnVmZmVyaW5nLCB3ZSBpbmRpY2F0ZSB0aGlzIHRvIHRoZSByZWFkZXIuXG5cdFx0XHQvLyB0aGlzIHJlZHVjZXMgYWxsIHRoZSBvdmVyaGVhZCB0aGUgYnVmZmVyZWQgcmVhZGluZ1xuXHRcdFx0Ly8gaGFzIChvcGVuLCByZWFkLCBjbG9zZSkgaWYgdGhlIHByb3ZpZGVyIHN1cHBvcnRzXG5cdFx0XHQvLyB1bmJ1ZmZlcmVkIHJlYWRpbmcuXG5cdFx0XHRwcmVmZXJVbmJ1ZmZlcmVkOiB0cnVlXG5cdFx0fSwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN0cmVhbSxcblx0XHRcdHZhbHVlOiBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihzdHJlYW0udmFsdWUpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZVN0cmVhbUNvbnRlbnQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFJlYWRQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5kb1JlYWRGaWxlU3RyZWFtKHByb3ZpZGVyLCByZXNvdXJjZSwgb3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlYWRGaWxlU3RyZWFtKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zICYgSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyAmIHsgcHJlZmVyVW5idWZmZXJlZD86IGJvb2xlYW4gfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVTdHJlYW1Db250ZW50PiB7XG5cblx0XHQvLyBpbnN0YWxsIGEgY2FuY2VsbGF0aW9uIHRva2VuIHRoYXQgZ2V0cyBjYW5jZWxsZWRcblx0XHQvLyB3aGVuIGFueSBlcnJvciBvY2N1cnMuIHRoaXMgYWxsb3dzIHVzIHRvIHJlc29sdmVcblx0XHQvLyB0aGUgY29udGVudCBvZiB0aGUgZmlsZSB3aGlsZSByZXNvbHZpbmcgbWV0YWRhdGFcblx0XHQvLyBidXQgc3RpbGwgY2FuY2VsIHRoZSBvcGVyYXRpb24gaW4gY2VydGFpbiBjYXNlcy5cblx0XHQvL1xuXHRcdC8vIGluIGFkZGl0aW9uLCB3ZSBwYXNzIHRoZSBvcHRpb25hbCB0b2tlbiBpbiB0aGF0XG5cdFx0Ly8gd2UgZ290IGZyb20gdGhlIG91dHNpZGUgdG8gZXZlbiBhbGxvdyBmb3IgZXh0ZXJuYWxcblx0XHQvLyBjYW5jZWxsYXRpb24gb2YgdGhlIHJlYWQgb3BlcmF0aW9uLlxuXHRcdGNvbnN0IGNhbmNlbGxhYmxlU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblxuXHRcdGxldCByZWFkRmlsZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdGlmIChoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkocHJvdmlkZXIpICYmIHByb3ZpZGVyLmVuZm9yY2VBdG9taWNSZWFkRmlsZT8uKHJlc291cmNlKSkge1xuXHRcdFx0cmVhZEZpbGVPcHRpb25zID0geyAuLi5vcHRpb25zLCBhdG9taWM6IHRydWUgfTtcblx0XHR9XG5cblx0XHQvLyB2YWxpZGF0ZSByZWFkIG9wZXJhdGlvblxuXHRcdGNvbnN0IHN0YXRQcm9taXNlID0gdGhpcy52YWxpZGF0ZVJlYWRGaWxlKHJlc291cmNlLCByZWFkRmlsZU9wdGlvbnMpLnRoZW4oc3RhdCA9PiBzdGF0LCBlcnJvciA9PiB7XG5cdFx0XHRjYW5jZWxsYWJsZVNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9KTtcblxuXHRcdGxldCBmaWxlU3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cblx0XHRcdC8vIGlmIHRoZSBldGFnIGlzIHByb3ZpZGVkLCB3ZSBhd2FpdCB0aGUgcmVzdWx0IG9mIHRoZSB2YWxpZGF0aW9uXG5cdFx0XHQvLyBkdWUgdG8gdGhlIGxpa2VsaWhvb2Qgb2YgaGl0dGluZyBhIE5PVF9NT0RJRklFRF9TSU5DRSByZXN1bHQuXG5cdFx0XHQvLyBvdGhlcndpc2UsIHdlIGxldCBpdCBydW4gaW4gcGFyYWxsZWwgdG8gdGhlIGZpbGUgcmVhZGluZyBmb3Jcblx0XHRcdC8vIG9wdGltYWwgc3RhcnR1cCBwZXJmb3JtYW5jZS5cblx0XHRcdGlmICh0eXBlb2YgcmVhZEZpbGVPcHRpb25zPy5ldGFnID09PSAnc3RyaW5nJyAmJiByZWFkRmlsZU9wdGlvbnMuZXRhZyAhPT0gRVRBR19ESVNBQkxFRCkge1xuXHRcdFx0XHRhd2FpdCBzdGF0UHJvbWlzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVhZCB1bmJ1ZmZlcmVkXG5cdFx0XHRpZiAoXG5cdFx0XHRcdChyZWFkRmlsZU9wdGlvbnM/LmF0b21pYyAmJiBoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkocHJvdmlkZXIpKSB8fFx0XHRcdFx0XHRcdFx0XHQvLyBhdG9taWMgcmVhZHMgYXJlIGFsd2F5cyB1bmJ1ZmZlcmVkXG5cdFx0XHRcdCEoaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcikgfHwgaGFzRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5KHByb3ZpZGVyKSkgfHxcdC8vIHByb3ZpZGVyIGhhcyBubyBidWZmZXJlZCBjYXBhYmlsaXR5XG5cdFx0XHRcdChoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiByZWFkRmlsZU9wdGlvbnM/LnByZWZlclVuYnVmZmVyZWQpXHRcdFx0XHRcdFx0XHRcdC8vIHVuYnVmZmVyZWQgcmVhZCBpcyBwcmVmZXJyZWRcblx0XHRcdCkge1xuXHRcdFx0XHRmaWxlU3RyZWFtID0gdGhpcy5yZWFkRmlsZVVuYnVmZmVyZWQocHJvdmlkZXIsIHJlc291cmNlLCByZWFkRmlsZU9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZWFkIHN0cmVhbWVkIChhbHdheXMgcHJlZmVyIG92ZXIgcHJpbWl0aXZlIGJ1ZmZlcmVkIHJlYWQpXG5cdFx0XHRlbHNlIGlmIChoYXNGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRcdGZpbGVTdHJlYW0gPSB0aGlzLnJlYWRGaWxlU3RyZWFtZWQocHJvdmlkZXIsIHJlc291cmNlLCBjYW5jZWxsYWJsZVNvdXJjZS50b2tlbiwgcmVhZEZpbGVPcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVhZCBidWZmZXJlZFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGZpbGVTdHJlYW0gPSB0aGlzLnJlYWRGaWxlQnVmZmVyZWQocHJvdmlkZXIsIHJlc291cmNlLCBjYW5jZWxsYWJsZVNvdXJjZS50b2tlbiwgcmVhZEZpbGVPcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0ZmlsZVN0cmVhbS5vbignZW5kJywgKCkgPT4gY2FuY2VsbGFibGVTb3VyY2UuZGlzcG9zZSgpKTtcblx0XHRcdGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgKCkgPT4gY2FuY2VsbGFibGVTb3VyY2UuZGlzcG9zZSgpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzdGF0UHJvbWlzZTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uZmlsZVN0YXQsXG5cdFx0XHRcdHZhbHVlOiBmaWxlU3RyZWFtXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEF3YWl0IHRoZSBzdHJlYW0gdG8gZmluaXNoIHNvIHRoYXQgd2UgZXhpdCB0aGlzIG1ldGhvZFxuXHRcdFx0Ly8gaW4gYSBjb25zaXN0ZW50IHN0YXRlIHdpdGggZmlsZSBoYW5kbGVzIGNsb3NlZFxuXHRcdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTQwMjQpXG5cdFx0XHRpZiAoZmlsZVN0cmVhbSkge1xuXHRcdFx0XHRhd2FpdCBjb25zdW1lU3RyZWFtKGZpbGVTdHJlYW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZS10aHJvdyBlcnJvcnMgYXMgZmlsZSBvcGVyYXRpb24gZXJyb3JzIGJ1dCBwcmVzZXJ2ZVxuXHRcdFx0Ly8gc3BlY2lmaWMgZXJyb3JzIChzdWNoIGFzIG5vdCBtb2RpZmllZCBzaW5jZSlcblx0XHRcdHRocm93IHRoaXMucmVzdG9yZVJlYWRFcnJvcihlcnJvciwgcmVzb3VyY2UsIHJlYWRGaWxlT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlUmVhZEVycm9yKGVycm9yOiBFcnJvciwgcmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMpOiBGaWxlT3BlcmF0aW9uRXJyb3Ige1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZXJyLnJlYWQnLCBcIlVuYWJsZSB0byByZWFkIGZpbGUgJ3swfScgKHsxfSlcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSwgZW5zdXJlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpLnRvU3RyaW5nKCkpO1xuXG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvcikge1xuXHRcdFx0cmV0dXJuIG5ldyBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKG1lc3NhZ2UsIGVycm9yLnN0YXQsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKG1lc3NhZ2UsIGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIGVycm9yLnNpemUsIGVycm9yLm9wdGlvbnMgYXMgSVJlYWRGaWxlT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobWVzc2FnZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRGaWxlU3RyZWFtZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB7XG5cdFx0Y29uc3QgZmlsZVN0cmVhbSA9IHByb3ZpZGVyLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlLCBvcHRpb25zLCB0b2tlbik7XG5cblx0XHRyZXR1cm4gdHJhbnNmb3JtKGZpbGVTdHJlYW0sIHtcblx0XHRcdGRhdGE6IGRhdGEgPT4gZGF0YSBpbnN0YW5jZW9mIFZTQnVmZmVyID8gZGF0YSA6IFZTQnVmZmVyLndyYXAoZGF0YSksXG5cdFx0XHRlcnJvcjogZXJyb3IgPT4gdGhpcy5yZXN0b3JlUmVhZEVycm9yKGVycm9yLCByZXNvdXJjZSwgb3B0aW9ucylcblx0XHR9LCBkYXRhID0+IFZTQnVmZmVyLmNvbmNhdChkYXRhKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRGaWxlQnVmZmVyZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zOiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpO1xuXG5cdFx0cmVhZEZpbGVJbnRvU3RyZWFtKHByb3ZpZGVyLCByZXNvdXJjZSwgc3RyZWFtLCBkYXRhID0+IGRhdGEsIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRidWZmZXJTaXplOiB0aGlzLkJVRkZFUl9TSVpFLFxuXHRcdFx0ZXJyb3JUcmFuc2Zvcm1lcjogZXJyb3IgPT4gdGhpcy5yZXN0b3JlUmVhZEVycm9yKGVycm9yLCByZXNvdXJjZSwgb3B0aW9ucylcblx0XHR9LCB0b2tlbik7XG5cblx0XHRyZXR1cm4gc3RyZWFtO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkRmlsZVVuYnVmZmVyZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMgJiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zKTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFZTQnVmZmVyPihkYXRhID0+IFZTQnVmZmVyLmNvbmNhdChkYXRhKSk7XG5cblx0XHQvLyBSZWFkIHRoZSBmaWxlIGludG8gdGhlIHN0cmVhbSBhc3luYyBidXQgZG8gbm90IHdhaXQgZm9yXG5cdFx0Ly8gdGhpcyB0byBjb21wbGV0ZSBiZWNhdXNlIHN0cmVhbXMgd29yayB2aWEgZXZlbnRzXG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCBidWZmZXI6IFVpbnQ4QXJyYXk7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5hdG9taWMgJiYgaGFzRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGF3YWl0IHByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidWZmZXIgPSBhd2FpdCBwcm92aWRlci5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyByZXNwZWN0IHBvc2l0aW9uIG9wdGlvblxuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LnBvc2l0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGJ1ZmZlci5zbGljZShvcHRpb25zLnBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJlc3BlY3QgbGVuZ3RoIG9wdGlvblxuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnM/Lmxlbmd0aCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBidWZmZXIuc2xpY2UoMCwgb3B0aW9ucy5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGhyb3cgaWYgZmlsZSBpcyB0b28gbGFyZ2UgdG8gbG9hZFxuXHRcdFx0XHR0aGlzLnZhbGlkYXRlUmVhZEZpbGVMaW1pdHMocmVzb3VyY2UsIGJ1ZmZlci5ieXRlTGVuZ3RoLCBvcHRpb25zKTtcblxuXHRcdFx0XHQvLyBFbmQgc3RyZWFtIHdpdGggZGF0YVxuXHRcdFx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLndyYXAoYnVmZmVyKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0c3RyZWFtLmVycm9yKGVycik7XG5cdFx0XHRcdHN0cmVhbS5lbmQoKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHN0cmVhbTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVSZWFkRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMucmVzb2x2ZShyZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cblx0XHQvLyBUaHJvdyBpZiByZXNvdXJjZSBpcyBhIGRpcmVjdG9yeVxuXHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdmaWxlSXNEaXJlY3RvcnlSZWFkRXJyb3InLCBcIlVuYWJsZSB0byByZWFkIGZpbGUgJ3swfScgdGhhdCBpcyBhY3R1YWxseSBhIGRpcmVjdG9yeVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0RJUkVDVE9SWSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhyb3cgaWYgZmlsZSBub3QgbW9kaWZpZWQgc2luY2UgKHVubGVzcyBkaXNhYmxlZClcblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LmV0YWcgPT09ICdzdHJpbmcnICYmIG9wdGlvbnMuZXRhZyAhPT0gRVRBR19ESVNBQkxFRCAmJiBvcHRpb25zLmV0YWcgPT09IHN0YXQuZXRhZykge1xuXHRcdFx0dGhyb3cgbmV3IE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2ZpbGVOb3RNb2RpZmllZEVycm9yJywgXCJGaWxlIG5vdCBtb2RpZmllZCBzaW5jZVwiKSwgc3RhdCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhyb3cgaWYgZmlsZSBpcyB0b28gbGFyZ2UgdG8gbG9hZFxuXHRcdHRoaXMudmFsaWRhdGVSZWFkRmlsZUxpbWl0cyhyZXNvdXJjZSwgc3RhdC5zaXplLCBvcHRpb25zKTtcblxuXHRcdHJldHVybiBzdGF0O1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVJlYWRGaWxlTGltaXRzKHJlc291cmNlOiBVUkksIHNpemU6IG51bWJlciwgb3B0aW9ucz86IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LmxpbWl0cz8uc2l6ZSA9PT0gJ251bWJlcicgJiYgc2l6ZSA+IG9wdGlvbnMubGltaXRzLnNpemUpIHtcblx0XHRcdHRocm93IG5ldyBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZVRvb0xhcmdlRXJyb3InLCBcIlVuYWJsZSB0byByZWFkIGZpbGUgJ3swfScgdGhhdCBpcyB0b28gbGFyZ2UgdG8gb3BlblwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRSwgc2l6ZSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1vdmUvQ29weS9EZWxldGUvQ3JlYXRlIEZvbGRlclxuXG5cdGFzeW5jIGNhbk1vdmUoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHtcblx0XHRyZXR1cm4gdGhpcy5kb0Nhbk1vdmVDb3B5KHNvdXJjZSwgdGFyZ2V0LCAnbW92ZScsIG92ZXJ3cml0ZSk7XG5cdH1cblxuXHRhc3luYyBjYW5Db3B5KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8RXJyb3IgfCB0cnVlPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9DYW5Nb3ZlQ29weShzb3VyY2UsIHRhcmdldCwgJ2NvcHknLCBvdmVyd3JpdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0Nhbk1vdmVDb3B5KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgbW9kZTogJ21vdmUnIHwgJ2NvcHknLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHtcblx0XHRpZiAoc291cmNlLnRvU3RyaW5nKCkgIT09IHRhcmdldC50b1N0cmluZygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VQcm92aWRlciA9IG1vZGUgPT09ICdtb3ZlJyA/IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFdyaXRlUHJvdmlkZXIoc291cmNlKSwgc291cmNlKSA6IGF3YWl0IHRoaXMud2l0aFJlYWRQcm92aWRlcihzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCB0YXJnZXRQcm92aWRlciA9IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFdyaXRlUHJvdmlkZXIodGFyZ2V0KSwgdGFyZ2V0KTtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLmRvVmFsaWRhdGVNb3ZlQ29weShzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0LCBtb2RlLCBvdmVyd3JpdGUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgbW92ZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHNvdXJjZVByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcihzb3VyY2UpLCBzb3VyY2UpO1xuXHRcdGNvbnN0IHRhcmdldFByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcih0YXJnZXQpLCB0YXJnZXQpO1xuXG5cdFx0Ly8gbW92ZVxuXHRcdGNvbnN0IG1vZGUgPSBhd2FpdCB0aGlzLmRvTW92ZUNvcHkoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCwgJ21vdmUnLCAhIW92ZXJ3cml0ZSk7XG5cblx0XHQvLyByZXNvbHZlIGFuZCBzZW5kIGV2ZW50c1xuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgdGhpcy5yZXNvbHZlKHRhcmdldCwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0dGhpcy5fb25EaWRSdW5PcGVyYXRpb24uZmlyZShuZXcgRmlsZU9wZXJhdGlvbkV2ZW50KHNvdXJjZSwgbW9kZSA9PT0gJ21vdmUnID8gRmlsZU9wZXJhdGlvbi5NT1ZFIDogRmlsZU9wZXJhdGlvbi5DT1BZLCBmaWxlU3RhdCkpO1xuXG5cdFx0cmV0dXJuIGZpbGVTdGF0O1xuXHR9XG5cblx0YXN5bmMgY29weShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHNvdXJjZVByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUmVhZFByb3ZpZGVyKHNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0UHJvdmlkZXIgPSB0aGlzLnRocm93SWZGaWxlU3lzdGVtSXNSZWFkb25seShhd2FpdCB0aGlzLndpdGhXcml0ZVByb3ZpZGVyKHRhcmdldCksIHRhcmdldCk7XG5cblx0XHQvLyBjb3B5XG5cdFx0Y29uc3QgbW9kZSA9IGF3YWl0IHRoaXMuZG9Nb3ZlQ29weShzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0LCAnY29weScsICEhb3ZlcndyaXRlKTtcblxuXHRcdC8vIHJlc29sdmUgYW5kIHNlbmQgZXZlbnRzXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLnJlc29sdmUodGFyZ2V0LCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHR0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5maXJlKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQoc291cmNlLCBtb2RlID09PSAnY29weScgPyBGaWxlT3BlcmF0aW9uLkNPUFkgOiBGaWxlT3BlcmF0aW9uLk1PVkUsIGZpbGVTdGF0KSk7XG5cblx0XHRyZXR1cm4gZmlsZVN0YXQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvTW92ZUNvcHkoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgdGFyZ2V0OiBVUkksIG1vZGU6ICdtb3ZlJyB8ICdjb3B5Jywgb3ZlcndyaXRlOiBib29sZWFuKTogUHJvbWlzZTwnbW92ZScgfCAnY29weSc+IHtcblx0XHRpZiAoc291cmNlLnRvU3RyaW5nKCkgPT09IHRhcmdldC50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gbW9kZTsgLy8gc2ltdWxhdGUgbm9kZS5qcyBiZWhhdmlvdXIgaGVyZSBhbmQgZG8gYSBuby1vcCBpZiBwYXRocyBtYXRjaFxuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRpb25cblx0XHRjb25zdCB7IGV4aXN0cywgaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgfSA9IGF3YWl0IHRoaXMuZG9WYWxpZGF0ZU1vdmVDb3B5KHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQsIG1vZGUsIG92ZXJ3cml0ZSk7XG5cblx0XHQvLyBkZWxldGUgYXMgbmVlZGVkICh1bmxlc3MgdGFyZ2V0IGlzIHNhbWUgcmVzdXJjZSB3aXRoIGRpZmZlcmVudCBwYXRoIGNhc2UpXG5cdFx0aWYgKGV4aXN0cyAmJiAhaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgJiYgb3ZlcndyaXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbCh0YXJnZXQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBwYXJlbnQgZm9sZGVyc1xuXHRcdGF3YWl0IHRoaXMubWtkaXJwKHRhcmdldFByb3ZpZGVyLCB0aGlzLmdldEV4dFVyaSh0YXJnZXRQcm92aWRlcikucHJvdmlkZXJFeHRVcmkuZGlybmFtZSh0YXJnZXQpKTtcblxuXHRcdC8vIGNvcHkgc291cmNlID0+IHRhcmdldFxuXHRcdGlmIChtb2RlID09PSAnY29weScpIHtcblxuXHRcdFx0Ly8gc2FtZSBwcm92aWRlciB3aXRoIGZhc3QgY29weTogbGV2ZXJhZ2UgY29weSgpIGZ1bmN0aW9uYWxpdHlcblx0XHRcdGlmIChzb3VyY2VQcm92aWRlciA9PT0gdGFyZ2V0UHJvdmlkZXIgJiYgaGFzRmlsZUZvbGRlckNvcHlDYXBhYmlsaXR5KHNvdXJjZVByb3ZpZGVyKSkge1xuXHRcdFx0XHRhd2FpdCBzb3VyY2VQcm92aWRlci5jb3B5KHNvdXJjZSwgdGFyZ2V0LCB7IG92ZXJ3cml0ZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gd2hlbiBjb3B5aW5nIHZpYSBidWZmZXIvdW5idWZmZXJlZCwgd2UgaGF2ZSB0byBtYW51YWxseVxuXHRcdFx0Ly8gdHJhdmVyc2UgdGhlIHNvdXJjZSBpZiBpdCBpcyBhIGZvbGRlciBhbmQgbm90IGEgZmlsZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUZpbGUgPSBhd2FpdCB0aGlzLnJlc29sdmUoc291cmNlKTtcblx0XHRcdFx0aWYgKHNvdXJjZUZpbGUuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvQ29weUZvbGRlcihzb3VyY2VQcm92aWRlciwgc291cmNlRmlsZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb0NvcHlGaWxlKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBtb2RlO1xuXHRcdH1cblxuXHRcdC8vIG1vdmUgc291cmNlID0+IHRhcmdldFxuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBzYW1lIHByb3ZpZGVyOiBsZXZlcmFnZSByZW5hbWUoKSBmdW5jdGlvbmFsaXR5XG5cdFx0XHRpZiAoc291cmNlUHJvdmlkZXIgPT09IHRhcmdldFByb3ZpZGVyKSB7XG5cdFx0XHRcdGF3YWl0IHNvdXJjZVByb3ZpZGVyLnJlbmFtZShzb3VyY2UsIHRhcmdldCwgeyBvdmVyd3JpdGUgfSk7XG5cblx0XHRcdFx0cmV0dXJuIG1vZGU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFjcm9zcyBwcm92aWRlcnM6IGNvcHkgdG8gdGFyZ2V0ICYgZGVsZXRlIGF0IHNvdXJjZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Nb3ZlQ29weShzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0LCAnY29weScsIG92ZXJ3cml0ZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZGVsKHNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRcdFx0cmV0dXJuICdjb3B5Jztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ29weUZpbGUoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIGNvcHk6IHNvdXJjZSAoYnVmZmVyZWQpID0+IHRhcmdldCAoYnVmZmVyZWQpXG5cdFx0aWYgKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpICYmIGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkodGFyZ2V0UHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1BpcGVCdWZmZXJlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHQvLyBjb3B5OiBzb3VyY2UgKGJ1ZmZlcmVkKSA9PiB0YXJnZXQgKHVuYnVmZmVyZWQpXG5cdFx0aWYgKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpICYmIGhhc1JlYWRXcml0ZUNhcGFiaWxpdHkodGFyZ2V0UHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1BpcGVCdWZmZXJlZFRvVW5idWZmZXJlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHQvLyBjb3B5OiBzb3VyY2UgKHVuYnVmZmVyZWQpID0+IHRhcmdldCAoYnVmZmVyZWQpXG5cdFx0aWYgKGhhc1JlYWRXcml0ZUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpICYmIGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkodGFyZ2V0UHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1BpcGVVbmJ1ZmZlcmVkVG9CdWZmZXJlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHQvLyBjb3B5OiBzb3VyY2UgKHVuYnVmZmVyZWQpID0+IHRhcmdldCAodW5idWZmZXJlZClcblx0XHRpZiAoaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShzb3VyY2VQcm92aWRlcikgJiYgaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eSh0YXJnZXRQcm92aWRlcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUGlwZVVuYnVmZmVyZWQoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0NvcHlGb2xkZXIoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHNvdXJjZUZvbGRlcjogSUZpbGVTdGF0LCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgdGFyZ2V0Rm9sZGVyOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIGNyZWF0ZSBmb2xkZXIgaW4gdGFyZ2V0XG5cdFx0YXdhaXQgdGFyZ2V0UHJvdmlkZXIubWtkaXIodGFyZ2V0Rm9sZGVyKTtcblxuXHRcdC8vIGNyZWF0ZSBjaGlsZHJlbiBpbiB0YXJnZXRcblx0XHRpZiAoQXJyYXkuaXNBcnJheShzb3VyY2VGb2xkZXIuY2hpbGRyZW4pKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHNvdXJjZUZvbGRlci5jaGlsZHJlbi5tYXAoYXN5bmMgc291cmNlQ2hpbGQgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRDaGlsZCA9IHRoaXMuZ2V0RXh0VXJpKHRhcmdldFByb3ZpZGVyKS5wcm92aWRlckV4dFVyaS5qb2luUGF0aCh0YXJnZXRGb2xkZXIsIHNvdXJjZUNoaWxkLm5hbWUpO1xuXHRcdFx0XHRpZiAoc291cmNlQ2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0NvcHlGb2xkZXIoc291cmNlUHJvdmlkZXIsIGF3YWl0IHRoaXMucmVzb2x2ZShzb3VyY2VDaGlsZC5yZXNvdXJjZSksIHRhcmdldFByb3ZpZGVyLCB0YXJnZXRDaGlsZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZG9Db3B5RmlsZShzb3VyY2VQcm92aWRlciwgc291cmNlQ2hpbGQucmVzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXRDaGlsZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVmFsaWRhdGVNb3ZlQ29weShzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCB0YXJnZXQ6IFVSSSwgbW9kZTogJ21vdmUnIHwgJ2NvcHknLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTx7IGV4aXN0czogYm9vbGVhbjsgaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2U6IGJvb2xlYW4gfT4ge1xuXHRcdGxldCBpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSA9IGZhbHNlO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgc291cmNlIGlzIGVxdWFsIG9yIHBhcmVudCB0byB0YXJnZXQgKHJlcXVpcmVzIHByb3ZpZGVycyB0byBiZSB0aGUgc2FtZSlcblx0XHRpZiAoc291cmNlUHJvdmlkZXIgPT09IHRhcmdldFByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCB7IHByb3ZpZGVyRXh0VXJpLCBpc1BhdGhDYXNlU2Vuc2l0aXZlIH0gPSB0aGlzLmdldEV4dFVyaShzb3VyY2VQcm92aWRlcik7XG5cdFx0XHRpZiAoIWlzUGF0aENhc2VTZW5zaXRpdmUpIHtcblx0XHRcdFx0aXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgPSBwcm92aWRlckV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzU2FtZVJlc291cmNlV2l0aERpZmZlcmVudFBhdGhDYXNlICYmIG1vZGUgPT09ICdjb3B5Jykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3VuYWJsZVRvTW92ZUNvcHlFcnJvcjEnLCBcIlVuYWJsZSB0byBjb3B5IHdoZW4gc291cmNlICd7MH0nIGlzIHNhbWUgYXMgdGFyZ2V0ICd7MX0nIHdpdGggZGlmZmVyZW50IHBhdGggY2FzZSBvbiBhIGNhc2UgaW5zZW5zaXRpdmUgZmlsZSBzeXN0ZW1cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHNvdXJjZSksIHRoaXMucmVzb3VyY2VGb3JFcnJvcih0YXJnZXQpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgJiYgcHJvdmlkZXJFeHRVcmkuaXNFcXVhbE9yUGFyZW50KHRhcmdldCwgc291cmNlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3VuYWJsZVRvTW92ZUNvcHlFcnJvcjInLCBcIlVuYWJsZSB0byBtb3ZlL2NvcHkgd2hlbiBzb3VyY2UgJ3swfScgaXMgcGFyZW50IG9mIHRhcmdldCAnezF9Jy5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHNvdXJjZSksIHRoaXMucmVzb3VyY2VGb3JFcnJvcih0YXJnZXQpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXh0cmEgY2hlY2tzIGlmIHRhcmdldCBleGlzdHMgYW5kIHRoaXMgaXMgbm90IGEgcmVuYW1lXG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5leGlzdHModGFyZ2V0KTtcblx0XHRpZiAoZXhpc3RzICYmICFpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSkge1xuXG5cdFx0XHQvLyBCYWlsIG91dCBpZiB0YXJnZXQgZXhpc3RzIGFuZCB3ZSBhcmUgbm90IGFib3V0IHRvIG92ZXJ3cml0ZVxuXHRcdFx0aWYgKCFvdmVyd3JpdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgndW5hYmxlVG9Nb3ZlQ29weUVycm9yMycsIFwiVW5hYmxlIHRvIG1vdmUvY29weSAnezB9JyBiZWNhdXNlIHRhcmdldCAnezF9JyBhbHJlYWR5IGV4aXN0cyBhdCBkZXN0aW5hdGlvbi5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHNvdXJjZSksIHRoaXMucmVzb3VyY2VGb3JFcnJvcih0YXJnZXQpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTcGVjaWFsIGNhc2U6IGlmIHRoZSB0YXJnZXQgaXMgYSBwYXJlbnQgb2YgdGhlIHNvdXJjZSwgd2UgY2Fubm90IGRlbGV0ZVxuXHRcdFx0Ly8gaXQgYXMgaXQgd291bGQgZGVsZXRlIHRoZSBzb3VyY2UgYXMgd2VsbC4gSW4gdGhpcyBjYXNlIHdlIGhhdmUgdG8gdGhyb3dcblx0XHRcdGlmIChzb3VyY2VQcm92aWRlciA9PT0gdGFyZ2V0UHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgeyBwcm92aWRlckV4dFVyaSB9ID0gdGhpcy5nZXRFeHRVcmkoc291cmNlUHJvdmlkZXIpO1xuXHRcdFx0XHRpZiAocHJvdmlkZXJFeHRVcmkuaXNFcXVhbE9yUGFyZW50KHNvdXJjZSwgdGFyZ2V0KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndW5hYmxlVG9Nb3ZlQ29weUVycm9yNCcsIFwiVW5hYmxlIHRvIG1vdmUvY29weSAnezB9JyBpbnRvICd7MX0nIHNpbmNlIGEgZmlsZSB3b3VsZCByZXBsYWNlIHRoZSBmb2xkZXIgaXQgaXMgY29udGFpbmVkIGluLlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3Ioc291cmNlKSwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHRhcmdldCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4aXN0cywgaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0VXJpKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogeyBwcm92aWRlckV4dFVyaTogSUV4dFVyaTsgaXNQYXRoQ2FzZVNlbnNpdGl2ZTogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBpc1BhdGhDYXNlU2Vuc2l0aXZlID0gdGhpcy5pc1BhdGhDYXNlU2Vuc2l0aXZlKHByb3ZpZGVyKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlckV4dFVyaTogaXNQYXRoQ2FzZVNlbnNpdGl2ZSA/IGV4dFVyaSA6IGV4dFVyaUlnbm9yZVBhdGhDYXNlLFxuXHRcdFx0aXNQYXRoQ2FzZVNlbnNpdGl2ZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGlzUGF0aENhc2VTZW5zaXRpdmUocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUZvbGRlcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHJlc291cmNlKSwgcmVzb3VyY2UpO1xuXG5cdFx0Ly8gbWtkaXIgcmVjdXJzaXZlbHlcblx0XHRhd2FpdCB0aGlzLm1rZGlycChwcm92aWRlciwgcmVzb3VyY2UpO1xuXG5cdFx0Ly8gZXZlbnRzXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmZpcmUobmV3IEZpbGVPcGVyYXRpb25FdmVudChyZXNvdXJjZSwgRmlsZU9wZXJhdGlvbi5DUkVBVEUsIGZpbGVTdGF0KSk7XG5cblx0XHRyZXR1cm4gZmlsZVN0YXQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1rZGlycChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgZGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXJlY3Rvcmllc1RvQ3JlYXRlOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Ly8gbWtkaXIgdW50aWwgd2UgcmVhY2ggcm9vdFxuXHRcdGNvbnN0IHsgcHJvdmlkZXJFeHRVcmkgfSA9IHRoaXMuZ2V0RXh0VXJpKHByb3ZpZGVyKTtcblx0XHR3aGlsZSAoIXByb3ZpZGVyRXh0VXJpLmlzRXF1YWwoZGlyZWN0b3J5LCBwcm92aWRlckV4dFVyaS5kaXJuYW1lKGRpcmVjdG9yeSkpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChkaXJlY3RvcnkpO1xuXHRcdFx0XHRpZiAoKHN0YXQudHlwZSAmIEZpbGVUeXBlLkRpcmVjdG9yeSkgPT09IDApIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ21rZGlyRXhpc3RzRXJyb3InLCBcIlVuYWJsZSB0byBjcmVhdGUgZm9sZGVyICd7MH0nIHRoYXQgYWxyZWFkeSBleGlzdHMgYnV0IGlzIG5vdCBhIGRpcmVjdG9yeVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IoZGlyZWN0b3J5KSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnJlYWs7IC8vIHdlIGhhdmUgaGl0IGEgZGlyZWN0b3J5IHRoYXQgZXhpc3RzIC0+IGdvb2Rcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdFx0Ly8gQnViYmxlIHVwIGFueSBvdGhlciBlcnJvciB0aGF0IGlzIG5vdCBmaWxlIG5vdCBmb3VuZFxuXHRcdFx0XHRpZiAodG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyb3IpICE9PSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcG9uIGVycm9yLCByZW1lbWJlciBkaXJlY3RvcmllcyB0aGF0IG5lZWQgdG8gYmUgY3JlYXRlZFxuXHRcdFx0XHRkaXJlY3Rvcmllc1RvQ3JlYXRlLnB1c2gocHJvdmlkZXJFeHRVcmkuYmFzZW5hbWUoZGlyZWN0b3J5KSk7XG5cblx0XHRcdFx0Ly8gQ29udGludWUgdXBcblx0XHRcdFx0ZGlyZWN0b3J5ID0gcHJvdmlkZXJFeHRVcmkuZGlybmFtZShkaXJlY3RvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBkaXJlY3RvcmllcyBhcyBuZWVkZWRcblx0XHRmb3IgKGxldCBpID0gZGlyZWN0b3JpZXNUb0NyZWF0ZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0ZGlyZWN0b3J5ID0gcHJvdmlkZXJFeHRVcmkuam9pblBhdGgoZGlyZWN0b3J5LCBkaXJlY3Rvcmllc1RvQ3JlYXRlW2ldKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIubWtkaXIoZGlyZWN0b3J5KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikgIT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIG1rZGlycCgpIHdlIHRvbGVyYXRlIHRoYXQgdGhlIG1rZGlyKCkgY2FsbCBmYWlsc1xuXHRcdFx0XHRcdC8vIGluIGNhc2UgdGhlIGZvbGRlciBhbHJlYWR5IGV4aXN0cy4gVGhpcyBmb2xsb3dzIG5vZGUuanNcblx0XHRcdFx0XHQvLyBvd24gaW1wbGVtZW50YXRpb24gb2YgZnMubWtkaXIoeyByZWN1cnNpdmU6IHRydWUgfSkgYW5kXG5cdFx0XHRcdFx0Ly8gcmVkdWNlcyB0aGUgY2hhbmNlcyBvZiByYWNlIGNvbmRpdGlvbnMgbGVhZGluZyB0byBlcnJvcnNcblx0XHRcdFx0XHQvLyBpZiBtdWx0aXBsZSBjYWxscyB0cnkgdG8gY3JlYXRlIHRoZSBzYW1lIGZvbGRlcnNcblx0XHRcdFx0XHQvLyBBcyBzdWNoLCB3ZSBvbmx5IHRocm93IGFuIGVycm9yIGhlcmUgaWYgaXQgaXMgb3RoZXIgdGhhblxuXHRcdFx0XHRcdC8vIHRoZSBmYWN0IHRoYXQgdGhlIGZpbGUgYWxyZWFkeSBleGlzdHMuXG5cdFx0XHRcdFx0Ly8gKHNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84OTgzNClcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNhbkRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogUGFydGlhbDxJRmlsZURlbGV0ZU9wdGlvbnM+KTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb1ZhbGlkYXRlRGVsZXRlKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1ZhbGlkYXRlRGVsZXRlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBQYXJ0aWFsPElGaWxlRGVsZXRlT3B0aW9ucz4pOiBQcm9taXNlPElGaWxlU3lzdGVtUHJvdmlkZXI+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHJlc291cmNlKSwgcmVzb3VyY2UpO1xuXG5cdFx0Ly8gVmFsaWRhdGUgdHJhc2ggc3VwcG9ydFxuXHRcdGNvbnN0IHVzZVRyYXNoID0gISFvcHRpb25zPy51c2VUcmFzaDtcblx0XHRpZiAodXNlVHJhc2ggJiYgIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2gpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2RlbGV0ZUZhaWxlZFRyYXNoVW5zdXBwb3J0ZWQnLCBcIlVuYWJsZSB0byBkZWxldGUgZmlsZSAnezB9JyB2aWEgdHJhc2ggYmVjYXVzZSBwcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IGl0LlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgYXRvbWljIHN1cHBvcnRcblx0XHRjb25zdCBhdG9taWMgPSBvcHRpb25zPy5hdG9taWM7XG5cdFx0aWYgKGF0b21pYyAmJiAhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljRGVsZXRlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdkZWxldGVGYWlsZWRBdG9taWNVbnN1cHBvcnRlZCcsIFwiVW5hYmxlIHRvIGRlbGV0ZSBmaWxlICd7MH0nIGF0b21pY2FsbHkgYmVjYXVzZSBwcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IGl0LlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHVzZVRyYXNoICYmIGF0b21pYykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdkZWxldGVGYWlsZWRUcmFzaEFuZEF0b21pY1Vuc3VwcG9ydGVkJywgXCJVbmFibGUgdG8gYXRvbWljYWxseSBkZWxldGUgZmlsZSAnezB9JyBiZWNhdXNlIHVzaW5nIHRyYXNoIGlzIGVuYWJsZWQuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBkZWxldGVcblx0XHRsZXQgc3RhdDogSVN0YXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gSGFuZGxlZCBsYXRlclxuXHRcdH1cblxuXHRcdGlmIChzdGF0KSB7XG5cdFx0XHR0aGlzLnRocm93SWZGaWxlSXNSZWFkb25seShyZXNvdXJjZSwgc3RhdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2RlbGV0ZUZhaWxlZE5vdEZvdW5kJywgXCJVbmFibGUgdG8gZGVsZXRlIG5vbmV4aXN0ZW50IGZpbGUgJ3swfSdcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIHJlY3Vyc2l2ZVxuXHRcdGNvbnN0IHJlY3Vyc2l2ZSA9ICEhb3B0aW9ucz8ucmVjdXJzaXZlO1xuXHRcdGlmICghcmVjdXJzaXZlKSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5ICYmIEFycmF5LmlzQXJyYXkoc3RhdC5jaGlsZHJlbikgJiYgc3RhdC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnZGVsZXRlRmFpbGVkTm9uRW1wdHlGb2xkZXInLCBcIlVuYWJsZSB0byBkZWxldGUgbm9uLWVtcHR5IGZvbGRlciAnezB9Jy5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcjtcblx0fVxuXG5cdGFzeW5jIGRlbChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogUGFydGlhbDxJRmlsZURlbGV0ZU9wdGlvbnM+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLmRvVmFsaWRhdGVEZWxldGUocmVzb3VyY2UsIG9wdGlvbnMpO1xuXG5cdFx0bGV0IGRlbGV0ZUZpbGVPcHRpb25zID0gb3B0aW9ucztcblx0XHRpZiAoaGFzRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHkocHJvdmlkZXIpICYmICFkZWxldGVGaWxlT3B0aW9ucz8uYXRvbWljKSB7XG5cdFx0XHRjb25zdCBlbmZvcmNlZEF0b21pY0RlbGV0ZSA9IHByb3ZpZGVyLmVuZm9yY2VBdG9taWNEZWxldGU/LihyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZW5mb3JjZWRBdG9taWNEZWxldGUpIHtcblx0XHRcdFx0ZGVsZXRlRmlsZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGF0b21pYzogZW5mb3JjZWRBdG9taWNEZWxldGUgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1c2VUcmFzaCA9ICEhZGVsZXRlRmlsZU9wdGlvbnM/LnVzZVRyYXNoO1xuXHRcdGNvbnN0IHJlY3Vyc2l2ZSA9ICEhZGVsZXRlRmlsZU9wdGlvbnM/LnJlY3Vyc2l2ZTtcblx0XHRjb25zdCBhdG9taWMgPSBkZWxldGVGaWxlT3B0aW9ucz8uYXRvbWljID8/IGZhbHNlO1xuXG5cdFx0Ly8gRGVsZXRlIHRocm91Z2ggcHJvdmlkZXJcblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGUocmVzb3VyY2UsIHsgcmVjdXJzaXZlLCB1c2VUcmFzaCwgYXRvbWljIH0pO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5fb25EaWRSdW5PcGVyYXRpb24uZmlyZShuZXcgRmlsZU9wZXJhdGlvbkV2ZW50KHJlc291cmNlLCBGaWxlT3BlcmF0aW9uLkRFTEVURSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENsb25lIEZpbGVcblxuXHRhc3luYyBjbG9uZUZpbGUoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlUHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihzb3VyY2UpO1xuXHRcdGNvbnN0IHRhcmdldFByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcih0YXJnZXQpLCB0YXJnZXQpO1xuXG5cdFx0aWYgKHNvdXJjZVByb3ZpZGVyID09PSB0YXJnZXRQcm92aWRlciAmJiB0aGlzLmdldEV4dFVyaShzb3VyY2VQcm92aWRlcikucHJvdmlkZXJFeHRVcmkuaXNFcXVhbChzb3VyY2UsIHRhcmdldCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIHBhdGhzIGFyZSBlcXVhbFxuXHRcdH1cblxuXHRcdC8vIHNhbWUgcHJvdmlkZXIsIHVzZSBgY2xvbmVGaWxlYCB3aGVuIG5hdGl2ZSBzdXBwb3J0IGlzIHByb3ZpZGVkXG5cdFx0aWYgKHNvdXJjZVByb3ZpZGVyID09PSB0YXJnZXRQcm92aWRlciAmJiBoYXNGaWxlQ2xvbmVDYXBhYmlsaXR5KHNvdXJjZVByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHNvdXJjZVByb3ZpZGVyLmNsb25lRmlsZShzb3VyY2UsIHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Ly8gb3RoZXJ3aXNlLCBlaXRoZXIgcHJvdmlkZXJzIGFyZSBkaWZmZXJlbnQgb3IgdGhlcmUgaXMgbm8gbmF0aXZlXG5cdFx0Ly8gYGNsb25lRmlsZWAgc3VwcG9ydCwgdGhlbiB3ZSBmYWxsYmFjayB0byBlbXVsYXRlIGEgY2xvbmUgYXMgYmVzdFxuXHRcdC8vIGFzIHdlIGNhbiB3aXRoIHRoZSBvdGhlciBwcmltaXRpdmVzXG5cblx0XHQvLyBjcmVhdGUgcGFyZW50IGZvbGRlcnNcblx0XHRhd2FpdCB0aGlzLm1rZGlycCh0YXJnZXRQcm92aWRlciwgdGhpcy5nZXRFeHRVcmkodGFyZ2V0UHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpLmRpcm5hbWUodGFyZ2V0KSk7XG5cblx0XHQvLyBsZXZlcmFnZSBgY29weWAgbWV0aG9kIGlmIHByb3ZpZGVkIGFuZCBwcm92aWRlcnMgYXJlIGlkZW50aWNhbFxuXHRcdC8vIHF1ZXVlIG9uIHRoZSBzb3VyY2UgdG8gZW5zdXJlIGF0b21pYyByZWFkXG5cdFx0aWYgKHNvdXJjZVByb3ZpZGVyID09PSB0YXJnZXRQcm92aWRlciAmJiBoYXNGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53cml0ZVF1ZXVlLnF1ZXVlRm9yKHNvdXJjZSwgKCkgPT4gc291cmNlUHJvdmlkZXIuY29weShzb3VyY2UsIHRhcmdldCwgeyBvdmVyd3JpdGU6IHRydWUgfSksIHRoaXMuZ2V0RXh0VXJpKHNvdXJjZVByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdFx0fVxuXG5cdFx0Ly8gb3RoZXJ3aXNlIGNvcHkgdmlhIGJ1ZmZlci91bmJ1ZmZlcmVkIGFuZCB1c2UgYSB3cml0ZSBxdWV1ZVxuXHRcdC8vIG9uIHRoZSBzb3VyY2UgdG8gZW5zdXJlIGF0b21pYyBvcGVyYXRpb24gYXMgbXVjaCBhcyBwb3NzaWJsZVxuXHRcdHJldHVybiB0aGlzLndyaXRlUXVldWUucXVldWVGb3Ioc291cmNlLCAoKSA9PiB0aGlzLmRvQ29weUZpbGUoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCksIHRoaXMuZ2V0RXh0VXJpKHNvdXJjZVByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBXYXRjaGluZ1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW50ZXJuYWxPbkRpZEZpbGVzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RmlsZUNoYW5nZXNFdmVudD4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmNvcnJlbGF0ZWRGaWxlc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEZpbGVDaGFuZ2VzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZpbGVzQ2hhbmdlID0gdGhpcy5fb25EaWRVbmNvcnJlbGF0ZWRGaWxlc0NoYW5nZS5ldmVudDsgLy8gZ2xvYmFsIGBvbkRpZEZpbGVzQ2hhbmdlYCBza2lwcyBjb3JyZWxhdGVkIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkV2F0Y2hFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVycm9yPigpKTtcblx0cmVhZG9ubHkgb25EaWRXYXRjaEVycm9yID0gdGhpcy5fb25EaWRXYXRjaEVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlV2F0Y2hlcnMgPSBuZXcgTWFwPG51bWJlciAvKiB3YXRjaCByZXF1ZXN0IGhhc2ggKi8sIHsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7IGNvdW50OiBudW1iZXIgfT4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyBXQVRDSEVSX0NPUlJFTEFUSU9OX0lEUyA9IDA7XG5cblx0Y3JlYXRlV2F0Y2hlcihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uICYgeyByZWN1cnNpdmU6IGZhbHNlIH0pOiBJRmlsZVN5c3RlbVdhdGNoZXIge1xuXHRcdHJldHVybiB0aGlzLndhdGNoKHJlc291cmNlLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0Ly8gRXhwbGljaXRseSBzZXQgYSBjb3JyZWxhdGlvbiBpZCBzbyB0aGF0IGZpbGUgZXZlbnRzIHRoYXQgb3JpZ2luYXRlXG5cdFx0XHQvLyBmcm9tIHJlcXVlc3RzIGZyb20gZXh0ZW5zaW9ucyBhcmUgZXhjbHVzaXZlbHkgcm91dGVkIGJhY2sgdG8gdGhlXG5cdFx0XHQvLyBleHRlbnNpb24gaG9zdCBhbmQgbm90IGludG8gdGhlIHdvcmtiZW5jaC5cblx0XHRcdGNvcnJlbGF0aW9uSWQ6IEZpbGVTZXJ2aWNlLldBVENIRVJfQ09SUkVMQVRJT05fSURTKytcblx0XHR9KTtcblx0fVxuXG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnNXaXRoQ29ycmVsYXRpb24pOiBJRmlsZVN5c3RlbVdhdGNoZXI7XG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uKTogSURpc3Bvc2FibGU7XG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnMgPSB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTogSUZpbGVTeXN0ZW1XYXRjaGVyIHwgSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gRm9yd2FyZCB3YXRjaCByZXF1ZXN0IHRvIHByb3ZpZGVyIGFuZCB3aXJlIGluIGRpc3Bvc2FibGVzXG5cdFx0bGV0IHdhdGNoRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRsZXQgZGlzcG9zZVdhdGNoID0gKCkgPT4geyB3YXRjaERpc3Bvc2VkID0gdHJ1ZTsgfTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGRpc3Bvc2VXYXRjaCgpKSk7XG5cblx0XHQvLyBXYXRjaCBhbmQgd2lyZSBpbiBkaXNwb3NhYmxlIHdoaWNoIGlzIGFzeW5jIGJ1dFxuXHRcdC8vIGNoZWNrIGlmIHdlIGdvdCBkaXNwb3NlZCBtZWFud2hpbGUgYW5kIGZvcndhcmRcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGF3YWl0IHRoaXMuZG9XYXRjaChyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHRcdGlmICh3YXRjaERpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkaXNwb3NlV2F0Y2ggPSAoKSA9PiBkaXNwb3NlKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHQvLyBXaGVuIGEgY29ycmVsYXRpb24gaWRlbnRpZmllciBpcyBzZXQsIHJldHVybiBhIHNwZWNpZmljXG5cdFx0Ly8gd2F0Y2hlciB0aGF0IG9ubHkgZW1pdHMgZXZlbnRzIG1hdGNoaW5nIHRoYXQgY29ycmVhbGF0aW9uLlxuXHRcdGNvbnN0IGNvcnJlbGF0aW9uSWQgPSBvcHRpb25zLmNvcnJlbGF0aW9uSWQ7XG5cdFx0aWYgKHR5cGVvZiBjb3JyZWxhdGlvbklkID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZmlsZUNoYW5nZUVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8RmlsZUNoYW5nZXNFdmVudD4oKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnRlcm5hbE9uRGlkRmlsZXNDaGFuZ2UuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmNvcnJlbGF0ZXMoY29ycmVsYXRpb25JZCkpIHtcblx0XHRcdFx0XHRmaWxlQ2hhbmdlRW1pdHRlci5maXJlKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHdhdGNoZXI6IElGaWxlU3lzdGVtV2F0Y2hlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IGZpbGVDaGFuZ2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB3YXRjaGVyO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9XYXRjaChyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV2F0Y2hPcHRpb25zKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0Ly8gRGVkdXBsaWNhdGUgaWRlbnRpY2FsIHdhdGNoIHJlcXVlc3RzXG5cdFx0Y29uc3Qgd2F0Y2hIYXNoID0gaGFzaChbdGhpcy5nZXRFeHRVcmkocHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpLCBvcHRpb25zXSk7XG5cdFx0bGV0IHdhdGNoZXIgPSB0aGlzLmFjdGl2ZVdhdGNoZXJzLmdldCh3YXRjaEhhc2gpO1xuXHRcdGlmICghd2F0Y2hlcikge1xuXHRcdFx0d2F0Y2hlciA9IHtcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGRpc3Bvc2FibGU6IHByb3ZpZGVyLndhdGNoKHJlc291cmNlLCBvcHRpb25zKVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5hY3RpdmVXYXRjaGVycy5zZXQod2F0Y2hIYXNoLCB3YXRjaGVyKTtcblx0XHR9XG5cblx0XHQvLyBJbmNyZW1lbnQgdXNhZ2UgY291bnRlclxuXHRcdHdhdGNoZXIuY291bnQgKz0gMTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHdhdGNoZXIpIHtcblxuXHRcdFx0XHQvLyBVbnJlZlxuXHRcdFx0XHR3YXRjaGVyLmNvdW50LS07XG5cblx0XHRcdFx0Ly8gRGlzcG9zZSBvbmx5IHdoZW4gbGFzdCB1c2VyIGlzIHJlYWNoZWRcblx0XHRcdFx0aWYgKHdhdGNoZXIuY291bnQgPT09IDApIHtcblx0XHRcdFx0XHRkaXNwb3NlKHdhdGNoZXIuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVXYXRjaGVycy5kZWxldGUod2F0Y2hIYXNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGNvbnN0IFssIHdhdGNoZXJdIG9mIHRoaXMuYWN0aXZlV2F0Y2hlcnMpIHtcblx0XHRcdGRpc3Bvc2Uod2F0Y2hlci5kaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGl2ZVdhdGNoZXJzLmNsZWFyKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gSGVscGVyc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd3JpdGVRdWV1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXNvdXJjZVF1ZXVlKCkpO1xuXG5cdHByaXZhdGUgYXN5bmMgZG9Xcml0ZUJ1ZmZlcmVkKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXcml0ZUZpbGVPcHRpb25zIHwgdW5kZWZpbmVkLCByZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbTogVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53cml0ZVF1ZXVlLnF1ZXVlRm9yKHJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIG9wZW4gaGFuZGxlXG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBwcm92aWRlci5vcGVuKHJlc291cmNlLCB7IGNyZWF0ZTogdHJ1ZSwgdW5sb2NrOiBvcHRpb25zPy51bmxvY2sgPz8gZmFsc2UsIGFwcGVuZDogb3B0aW9ucz8uYXBwZW5kID8/IGZhbHNlIH0pO1xuXG5cdFx0XHQvLyB3cml0ZSBpbnRvIGhhbmRsZSB1bnRpbCBhbGwgYnl0ZXMgZnJvbSBidWZmZXIgaGF2ZSBiZWVuIHdyaXR0ZW5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChpc1JlYWRhYmxlU3RyZWFtKHJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSB8fCBpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0ocmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlU3RyZWFtQnVmZmVyZWRRdWV1ZWQocHJvdmlkZXIsIGhhbmRsZSwgcmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZVJlYWRhYmxlQnVmZmVyZWRRdWV1ZWQocHJvdmlkZXIsIGhhbmRsZSwgcmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXG5cdFx0XHRcdC8vIGNsb3NlIGhhbmRsZSBhbHdheXNcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoaGFuZGxlKTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLmdldEV4dFVyaShwcm92aWRlcikucHJvdmlkZXJFeHRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlU3RyZWFtQnVmZmVyZWRRdWV1ZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgaGFuZGxlOiBudW1iZXIsIHN0cmVhbU9yQnVmZmVyZWRTdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcG9zSW5GaWxlID0gMDtcblx0XHRsZXQgc3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtO1xuXG5cdFx0Ly8gQnVmZmVyZWQgc3RyZWFtOiBjb25zdW1lIHRoZSBidWZmZXIgZmlyc3QgYnkgd3JpdGluZ1xuXHRcdC8vIGl0IHRvIHRoZSB0YXJnZXQgYmVmb3JlIHJlYWRpbmcgZnJvbSB0aGUgc3RyZWFtLlxuXHRcdGlmIChpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0oc3RyZWFtT3JCdWZmZXJlZFN0cmVhbSkpIHtcblx0XHRcdGlmIChzdHJlYW1PckJ1ZmZlcmVkU3RyZWFtLmJ1ZmZlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGNodW5rID0gVlNCdWZmZXIuY29uY2F0KHN0cmVhbU9yQnVmZmVyZWRTdHJlYW0uYnVmZmVyKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlQnVmZmVyKHByb3ZpZGVyLCBoYW5kbGUsIGNodW5rLCBjaHVuay5ieXRlTGVuZ3RoLCBwb3NJbkZpbGUsIDApO1xuXG5cdFx0XHRcdHBvc0luRmlsZSArPSBjaHVuay5ieXRlTGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgc3RyZWFtIGhhcyBiZWVuIGNvbnN1bWVkLCByZXR1cm4gZWFybHlcblx0XHRcdGlmIChzdHJlYW1PckJ1ZmZlcmVkU3RyZWFtLmVuZGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3RyZWFtID0gc3RyZWFtT3JCdWZmZXJlZFN0cmVhbS5zdHJlYW07XG5cdFx0fVxuXG5cdFx0Ly8gVW5idWZmZXJlZCBzdHJlYW0gLSBqdXN0IHRha2UgYXMgaXNcblx0XHRlbHNlIHtcblx0XHRcdHN0cmVhbSA9IHN0cmVhbU9yQnVmZmVyZWRTdHJlYW07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxpc3RlblN0cmVhbShzdHJlYW0sIHtcblx0XHRcdFx0b25EYXRhOiBhc3luYyBjaHVuayA9PiB7XG5cblx0XHRcdFx0XHQvLyBwYXVzZSBzdHJlYW0gdG8gcGVyZm9ybSBhc3luYyB3cml0ZSBvcGVyYXRpb25cblx0XHRcdFx0XHRzdHJlYW0ucGF1c2UoKTtcblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVCdWZmZXIocHJvdmlkZXIsIGhhbmRsZSwgY2h1bmssIGNodW5rLmJ5dGVMZW5ndGgsIHBvc0luRmlsZSwgMCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHBvc0luRmlsZSArPSBjaHVuay5ieXRlTGVuZ3RoO1xuXG5cdFx0XHRcdFx0Ly8gcmVzdW1lIHN0cmVhbSBub3cgdGhhdCB3ZSBoYXZlIHN1Y2Nlc3NmdWxseSB3cml0dGVuXG5cdFx0XHRcdFx0Ly8gcnVuIHRoaXMgb24gdGhlIG5leHQgdGljayB0byBwcmV2ZW50IGluY3JlYXNpbmcgdGhlXG5cdFx0XHRcdFx0Ly8gZXhlY3V0aW9uIHN0YWNrIGJlY2F1c2UgcmVzdW1lKCkgbWF5IGNhbGwgdGhlIGV2ZW50XG5cdFx0XHRcdFx0Ly8gaGFuZGxlciBhZ2FpbiBiZWZvcmUgZmluaXNoaW5nLlxuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gc3RyZWFtLnJlc3VtZSgpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25FcnJvcjogZXJyb3IgPT4gcmVqZWN0KGVycm9yKSxcblx0XHRcdFx0b25FbmQ6ICgpID0+IHJlc29sdmUoKVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV3JpdGVSZWFkYWJsZUJ1ZmZlcmVkUXVldWVkKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIGhhbmRsZTogbnVtYmVyLCByZWFkYWJsZTogVlNCdWZmZXJSZWFkYWJsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwb3NJbkZpbGUgPSAwO1xuXG5cdFx0bGV0IGNodW5rOiBWU0J1ZmZlciB8IG51bGw7XG5cdFx0d2hpbGUgKChjaHVuayA9IHJlYWRhYmxlLnJlYWQoKSkgIT09IG51bGwpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUJ1ZmZlcihwcm92aWRlciwgaGFuZGxlLCBjaHVuaywgY2h1bmsuYnl0ZUxlbmd0aCwgcG9zSW5GaWxlLCAwKTtcblxuXHRcdFx0cG9zSW5GaWxlICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlQnVmZmVyKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIGhhbmRsZTogbnVtYmVyLCBidWZmZXI6IFZTQnVmZmVyLCBsZW5ndGg6IG51bWJlciwgcG9zSW5GaWxlOiBudW1iZXIsIHBvc0luQnVmZmVyOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgdG90YWxCeXRlc1dyaXR0ZW4gPSAwO1xuXHRcdHdoaWxlICh0b3RhbEJ5dGVzV3JpdHRlbiA8IGxlbmd0aCkge1xuXG5cdFx0XHQvLyBXcml0ZSB0aHJvdWdoIHRoZSBwcm92aWRlclxuXHRcdFx0Y29uc3QgYnl0ZXNXcml0dGVuID0gYXdhaXQgcHJvdmlkZXIud3JpdGUoaGFuZGxlLCBwb3NJbkZpbGUgKyB0b3RhbEJ5dGVzV3JpdHRlbiwgYnVmZmVyLmJ1ZmZlciwgcG9zSW5CdWZmZXIgKyB0b3RhbEJ5dGVzV3JpdHRlbiwgbGVuZ3RoIC0gdG90YWxCeXRlc1dyaXR0ZW4pO1xuXHRcdFx0dG90YWxCeXRlc1dyaXR0ZW4gKz0gYnl0ZXNXcml0dGVuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Xcml0ZVVuYnVmZmVyZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXcml0ZUZpbGVPcHRpb25zIHwgdW5kZWZpbmVkLCBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcihyZXNvdXJjZSwgKCkgPT4gdGhpcy5kb1dyaXRlVW5idWZmZXJlZFF1ZXVlZChwcm92aWRlciwgcmVzb3VyY2UsIG9wdGlvbnMsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pLCB0aGlzLmdldEV4dFVyaShwcm92aWRlcikucHJvdmlkZXJFeHRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlVW5idWZmZXJlZFF1ZXVlZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW06IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgYnVmZmVyOiBWU0J1ZmZlcjtcblx0XHRpZiAoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB7XG5cdFx0XHRidWZmZXIgPSBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtO1xuXHRcdH0gZWxzZSBpZiAoaXNSZWFkYWJsZVN0cmVhbShidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSkge1xuXHRcdFx0YnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSk7XG5cdFx0fSBlbHNlIGlmIChpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW0oYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSkpIHtcblx0XHRcdGJ1ZmZlciA9IGF3YWl0IGJ1ZmZlcmVkU3RyZWFtVG9CdWZmZXIoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1ZmZlciA9IHJlYWRhYmxlVG9CdWZmZXIoYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSk7XG5cdFx0fVxuXG5cdFx0Ly8gV3JpdGUgdGhyb3VnaCB0aGUgcHJvdmlkZXJcblx0XHRhd2FpdCBwcm92aWRlci53cml0ZUZpbGUocmVzb3VyY2UsIGJ1ZmZlci5idWZmZXIsIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogb3B0aW9ucz8udW5sb2NrID8/IGZhbHNlLCBhdG9taWM6IG9wdGlvbnM/LmF0b21pYyA/PyBmYWxzZSwgYXBwZW5kOiBvcHRpb25zPy5hcHBlbmQgPz8gZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZUJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndyaXRlUXVldWUucXVldWVGb3IodGFyZ2V0LCAoKSA9PiB0aGlzLmRvUGlwZUJ1ZmZlcmVkUXVldWVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpLCB0aGlzLmdldEV4dFVyaSh0YXJnZXRQcm92aWRlcikucHJvdmlkZXJFeHRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpcGVCdWZmZXJlZFF1ZXVlZChzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc291cmNlSGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHRhcmdldEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gT3BlbiBoYW5kbGVzXG5cdFx0XHRzb3VyY2VIYW5kbGUgPSBhd2FpdCBzb3VyY2VQcm92aWRlci5vcGVuKHNvdXJjZSwgeyBjcmVhdGU6IGZhbHNlIH0pO1xuXHRcdFx0dGFyZ2V0SGFuZGxlID0gYXdhaXQgdGFyZ2V0UHJvdmlkZXIub3Blbih0YXJnZXQsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXG5cdFx0XHRjb25zdCBidWZmZXIgPSBWU0J1ZmZlci5hbGxvYyh0aGlzLkJVRkZFUl9TSVpFKTtcblxuXHRcdFx0bGV0IHBvc0luRmlsZSA9IDA7XG5cdFx0XHRsZXQgcG9zSW5CdWZmZXIgPSAwO1xuXHRcdFx0bGV0IGJ5dGVzUmVhZCA9IDA7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdC8vIHJlYWQgZnJvbSBzb3VyY2UgKHNvdXJjZUhhbmRsZSkgYXQgY3VycmVudCBwb3NpdGlvbiAocG9zSW5GaWxlKSBpbnRvIGJ1ZmZlciAoYnVmZmVyKSBhdFxuXHRcdFx0XHQvLyBidWZmZXIgcG9zaXRpb24gKHBvc0luQnVmZmVyKSB1cCB0byB0aGUgc2l6ZSBvZiB0aGUgYnVmZmVyIChidWZmZXIuYnl0ZUxlbmd0aCkuXG5cdFx0XHRcdGJ5dGVzUmVhZCA9IGF3YWl0IHNvdXJjZVByb3ZpZGVyLnJlYWQoc291cmNlSGFuZGxlLCBwb3NJbkZpbGUsIGJ1ZmZlci5idWZmZXIsIHBvc0luQnVmZmVyLCBidWZmZXIuYnl0ZUxlbmd0aCAtIHBvc0luQnVmZmVyKTtcblxuXHRcdFx0XHQvLyB3cml0ZSBpbnRvIHRhcmdldCAodGFyZ2V0SGFuZGxlKSBhdCBjdXJyZW50IHBvc2l0aW9uIChwb3NJbkZpbGUpIGZyb20gYnVmZmVyIChidWZmZXIpIGF0XG5cdFx0XHRcdC8vIGJ1ZmZlciBwb3NpdGlvbiAocG9zSW5CdWZmZXIpIGFsbCBieXRlcyB3ZSByZWFkIChieXRlc1JlYWQpLlxuXHRcdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVCdWZmZXIodGFyZ2V0UHJvdmlkZXIsIHRhcmdldEhhbmRsZSwgYnVmZmVyLCBieXRlc1JlYWQsIHBvc0luRmlsZSwgcG9zSW5CdWZmZXIpO1xuXG5cdFx0XHRcdHBvc0luRmlsZSArPSBieXRlc1JlYWQ7XG5cdFx0XHRcdHBvc0luQnVmZmVyICs9IGJ5dGVzUmVhZDtcblxuXHRcdFx0XHQvLyB3aGVuIGJ1ZmZlciBmdWxsLCBmaWxsIGl0IGFnYWluIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRcdFx0XHRpZiAocG9zSW5CdWZmZXIgPT09IGJ1ZmZlci5ieXRlTGVuZ3RoKSB7XG5cdFx0XHRcdFx0cG9zSW5CdWZmZXIgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlIChieXRlc1JlYWQgPiAwKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgZW5zdXJlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdFx0dHlwZW9mIHNvdXJjZUhhbmRsZSA9PT0gJ251bWJlcicgPyBzb3VyY2VQcm92aWRlci5jbG9zZShzb3VyY2VIYW5kbGUpIDogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdHR5cGVvZiB0YXJnZXRIYW5kbGUgPT09ICdudW1iZXInID8gdGFyZ2V0UHJvdmlkZXIuY2xvc2UodGFyZ2V0SGFuZGxlKSA6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpcGVVbmJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcih0YXJnZXQsICgpID0+IHRoaXMuZG9QaXBlVW5idWZmZXJlZFF1ZXVlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KSwgdGhpcy5nZXRFeHRVcmkodGFyZ2V0UHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9QaXBlVW5idWZmZXJlZFF1ZXVlZChzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0YXJnZXRQcm92aWRlci53cml0ZUZpbGUodGFyZ2V0LCBhd2FpdCBzb3VyY2VQcm92aWRlci5yZWFkRmlsZShzb3VyY2UpLCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpcGVVbmJ1ZmZlcmVkVG9CdWZmZXJlZChzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcih0YXJnZXQsICgpID0+IHRoaXMuZG9QaXBlVW5idWZmZXJlZFRvQnVmZmVyZWRRdWV1ZWQoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCksIHRoaXMuZ2V0RXh0VXJpKHRhcmdldFByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZVVuYnVmZmVyZWRUb0J1ZmZlcmVkUXVldWVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE9wZW4gaGFuZGxlXG5cdFx0Y29uc3QgdGFyZ2V0SGFuZGxlID0gYXdhaXQgdGFyZ2V0UHJvdmlkZXIub3Blbih0YXJnZXQsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gUmVhZCBlbnRpcmUgYnVmZmVyIGZyb20gc291cmNlIGFuZCB3cml0ZSBidWZmZXJlZFxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCBzb3VyY2VQcm92aWRlci5yZWFkRmlsZShzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlQnVmZmVyKHRhcmdldFByb3ZpZGVyLCB0YXJnZXRIYW5kbGUsIFZTQnVmZmVyLndyYXAoYnVmZmVyKSwgYnVmZmVyLmJ5dGVMZW5ndGgsIDAsIDApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHRhcmdldFByb3ZpZGVyLmNsb3NlKHRhcmdldEhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpcGVCdWZmZXJlZFRvVW5idWZmZXJlZChzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZWFkIGJ1ZmZlciB2aWEgc3RyZWFtIGJ1ZmZlcmVkXG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIodGhpcy5yZWFkRmlsZUJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblxuXHRcdC8vIFdyaXRlIGJ1ZmZlciBpbnRvIHRhcmdldCBhdCBvbmNlXG5cdFx0YXdhaXQgdGhpcy5kb1dyaXRlVW5idWZmZXJlZCh0YXJnZXRQcm92aWRlciwgdGFyZ2V0LCB1bmRlZmluZWQsIGJ1ZmZlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5PFQgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyPihwcm92aWRlcjogVCwgcmVzb3VyY2U6IFVSSSk6IFQge1xuXHRcdGlmIChwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpIHtcblx0XHRcdHRocm93IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2Vyci5yZWFkb25seScsIFwiVW5hYmxlIHRvIG1vZGlmeSByZWFkLW9ubHkgZmlsZSAnezB9J1wiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdH1cblxuXHRwcml2YXRlIHRocm93SWZGaWxlSXNSZWFkb25seShyZXNvdXJjZTogVVJJLCBzdGF0OiBJU3RhdCk6IHZvaWQge1xuXHRcdGlmICgoc3RhdC5wZXJtaXNzaW9ucyA/PyAwKSAmIEZpbGVQZXJtaXNzaW9uLlJlYWRvbmx5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdlcnIucmVhZG9ubHknLCBcIlVuYWJsZSB0byBtb2RpZnkgcmVhZC1vbmx5IGZpbGUgJ3swfSdcIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSksIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXNvdXJjZUZvckVycm9yKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLmZzUGF0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcodHJ1ZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLHFCQUFxQjtBQUN4QyxTQUFTLHdCQUF3QixrQkFBa0IsMEJBQTBCLGtCQUFrQixnQkFBZ0IsZ0JBQTBGO0FBQ3pNLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxpQkFBaUIsU0FBc0Isb0JBQW9CO0FBQ2hGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxRQUFRLHNCQUErQixzQkFBc0I7QUFDdEUsU0FBUyxlQUFlLDBCQUEwQixrQkFBa0IsY0FBYyxvQkFBb0IsY0FBYyxZQUFZLGlCQUFpQjtBQUVqSixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQixNQUFNLGVBQWUsa0JBQXNDLGVBQWUsb0JBQW9CLG9CQUFvQixxQkFBcUIsZ0JBQWdCLGdDQUFnQyw2QkFBNkIsVUFBVSx5QkFBeUIsNkJBQTZCLDZCQUE2Qiw2QkFBNkIsaUNBQWlDLHdCQUFpcUIsb0NBQW9DLHVCQUF1QiwrQkFBK0Isd0JBQXdCLDRCQUE0QiwrQkFBK0IsOEJBQWlILGlDQUFpQztBQUN2M0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0I7QUFFMUIsSUFBTSxjQUFOLGNBQTBCLFdBQW1DO0FBQUEsRUFTbkUsWUFBMEMsWUFBeUI7QUFDbEUsVUFBTTtBQURtQztBQUYxQztBQUFBO0FBQUE7QUFBQSxTQUFpQixjQUFjLE1BQU07QUFRckM7QUFBQSxTQUFpQiw4Q0FBOEMsS0FBSyxVQUFVLElBQUksUUFBOEMsQ0FBQztBQUNqSSxTQUFTLDZDQUE2QyxLQUFLLDRDQUE0QztBQUV2RyxTQUFpQixvQ0FBb0MsS0FBSyxVQUFVLElBQUksUUFBNEMsQ0FBQztBQUNySCxTQUFTLG1DQUFtQyxLQUFLLGtDQUFrQztBQUVuRixTQUFpQiw2Q0FBNkMsS0FBSyxVQUFVLElBQUksUUFBb0QsQ0FBQztBQUN0SSxTQUFTLDRDQUE0QyxLQUFLLDJDQUEyQztBQUVyRyxTQUFpQixXQUFXLG9CQUFJLElBQWlDO0FBcUlqRTtBQUFBO0FBQUEsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQTRCLENBQUM7QUFDdEYsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFxOEJyRDtBQUFBO0FBQUEsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFFMUYsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDL0YsU0FBUyxtQkFBbUIsS0FBSyw4QkFBOEI7QUFFL0Q7QUFBQSxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksUUFBZSxDQUFDO0FBQ3ZFLFNBQVMsa0JBQWtCLEtBQUssaUJBQWlCO0FBRWpELFNBQWlCLGlCQUFpQixvQkFBSSxJQUFpRjtBQTRHdkg7QUFBQTtBQUFBLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksY0FBYyxDQUFDO0FBQUEsRUE1c0NoRTtBQUFBLEVBZUEsaUJBQWlCLFFBQWdCLFVBQTRDO0FBQzVFLFFBQUksS0FBSyxTQUFTLElBQUksTUFBTSxHQUFHO0FBQzlCLFlBQU0sSUFBSSxNQUFNLHlDQUF5QyxNQUFNLDBCQUEwQjtBQUFBLElBQzFGO0FBRUEsU0FBSywyQkFBMkIsTUFBTSxFQUFFO0FBRXhDLFVBQU0sc0JBQXNCLElBQUksZ0JBQWdCO0FBR2hELFNBQUssU0FBUyxJQUFJLFFBQVEsUUFBUTtBQUNsQyxTQUFLLDRDQUE0QyxLQUFLLEVBQUUsT0FBTyxNQUFNLFFBQVEsU0FBUyxDQUFDO0FBR3ZGLHdCQUFvQixJQUFJLFNBQVMsZ0JBQWdCLGFBQVc7QUFDM0QsWUFBTSxRQUFRLElBQUksaUJBQWlCLFNBQVMsQ0FBQyxLQUFLLG9CQUFvQixRQUFRLENBQUM7QUFHL0UsV0FBSyx5QkFBeUIsS0FBSyxLQUFLO0FBR3hDLFVBQUksQ0FBQyxNQUFNLGVBQWUsR0FBRztBQUM1QixhQUFLLDhCQUE4QixLQUFLLEtBQUs7QUFBQSxNQUM5QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsUUFBSSxPQUFPLFNBQVMsb0JBQW9CLFlBQVk7QUFDbkQsMEJBQW9CLElBQUksU0FBUyxnQkFBZ0IsV0FBUyxLQUFLLGlCQUFpQixLQUFLLElBQUksTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDeEc7QUFDQSx3QkFBb0IsSUFBSSxTQUFTLHdCQUF3QixNQUFNLEtBQUssMkNBQTJDLEtBQUssRUFBRSxVQUFVLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFFMUksV0FBTyxhQUFhLE1BQU07QUFDekIsV0FBSyw0Q0FBNEMsS0FBSyxFQUFFLE9BQU8sT0FBTyxRQUFRLFNBQVMsQ0FBQztBQUN4RixXQUFLLFNBQVMsT0FBTyxNQUFNO0FBRTNCLGNBQVEsbUJBQW1CO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLFlBQVksUUFBaUQ7QUFDNUQsV0FBTyxLQUFLLFNBQVMsSUFBSSxNQUFNO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE1BQU0saUJBQWlCLFFBQStCO0FBSXJELFVBQU0sVUFBMkIsQ0FBQztBQUNsQyxTQUFLLGtDQUFrQyxLQUFLO0FBQUEsTUFDM0M7QUFBQSxNQUNBLEtBQUssU0FBUztBQUNiLGdCQUFRLEtBQUssT0FBTztBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxLQUFLLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDOUI7QUFBQSxJQUNEO0FBSUEsVUFBTSxTQUFTLFFBQVEsT0FBTztBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixVQUFpQztBQUd4RCxVQUFNLEtBQUssaUJBQWlCLFNBQVMsTUFBTTtBQUUzQyxXQUFPLEtBQUssWUFBWSxRQUFRO0FBQUEsRUFDakM7QUFBQSxFQUVBLFlBQVksVUFBd0I7QUFDbkMsV0FBTyxLQUFLLFNBQVMsSUFBSSxTQUFTLE1BQU07QUFBQSxFQUN6QztBQUFBLEVBRUEsY0FBYyxVQUFlLFlBQXFEO0FBQ2pGLFVBQU0sV0FBVyxLQUFLLFNBQVMsSUFBSSxTQUFTLE1BQU07QUFFbEQsV0FBTyxDQUFDLEVBQUUsWUFBYSxTQUFTLGVBQWU7QUFBQSxFQUNoRDtBQUFBLEVBRUEsbUJBQStGO0FBQzlGLFdBQU8sU0FBUyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUMsUUFBUSxRQUFRLE9BQU8sRUFBRSxRQUFRLGNBQWMsU0FBUyxhQUFhLEVBQUU7QUFBQSxFQUM3RztBQUFBLEVBRUEsTUFBZ0IsYUFBYSxVQUE2QztBQUd6RSxRQUFJLENBQUMsZUFBZSxRQUFRLEdBQUc7QUFDOUIsWUFBTSxJQUFJLG1CQUFtQixTQUFTLGVBQWUsdUVBQXVFLEtBQUssaUJBQWlCLFFBQVEsQ0FBQyxHQUFHLG9CQUFvQixpQkFBaUI7QUFBQSxJQUNwTTtBQUdBLFVBQU0sS0FBSyxpQkFBaUIsU0FBUyxNQUFNO0FBRzNDLFVBQU0sV0FBVyxLQUFLLFNBQVMsSUFBSSxTQUFTLE1BQU07QUFDbEQsUUFBSSxDQUFDLFVBQVU7QUFDZCxZQUFNLFFBQVEsSUFBSSxpQkFBaUI7QUFDbkMsWUFBTSxVQUFVLFNBQVMsbUJBQW1CLDREQUE0RCxTQUFTLFNBQVMsQ0FBQztBQUUzSCxZQUFNO0FBQUEsSUFDUDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixVQUFnTDtBQUM5TSxVQUFNLFdBQVcsTUFBTSxLQUFLLGFBQWEsUUFBUTtBQUVqRCxRQUFJLGdDQUFnQyxRQUFRLEtBQUssdUJBQXVCLFFBQVEsS0FBSyw0QkFBNEIsUUFBUSxHQUFHO0FBQzNILGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxJQUFJLE1BQU0sbUNBQW1DLFNBQVMsTUFBTSwySEFBMkg7QUFBQSxFQUM5TDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsVUFBOEg7QUFDN0osVUFBTSxXQUFXLE1BQU0sS0FBSyxhQUFhLFFBQVE7QUFFakQsUUFBSSxnQ0FBZ0MsUUFBUSxLQUFLLHVCQUF1QixRQUFRLEdBQUc7QUFDbEYsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLElBQUksTUFBTSxtQ0FBbUMsU0FBUyxNQUFNLDRHQUE0RztBQUFBLEVBQy9LO0FBQUEsRUFlQSxNQUFNLFFBQVEsVUFBZSxTQUFtRDtBQUMvRSxRQUFJO0FBQ0gsYUFBTyxNQUFNLEtBQUssY0FBYyxVQUFVLE9BQU87QUFBQSxJQUNsRCxTQUFTLE9BQU87QUFHZixVQUFJLDhCQUE4QixLQUFLLE1BQU0sNEJBQTRCLGNBQWM7QUFDdEYsY0FBTSxJQUFJLG1CQUFtQixTQUFTLHFCQUFxQiw0Q0FBNEMsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLGNBQWM7QUFBQSxNQUM1SztBQUdBLFlBQU0sOEJBQThCLEtBQUs7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUlBLE1BQWMsY0FBYyxVQUFlLFNBQW1EO0FBQzdGLFVBQU0sV0FBVyxNQUFNLEtBQUssYUFBYSxRQUFRO0FBQ2pELFVBQU0sc0JBQXNCLEtBQUssb0JBQW9CLFFBQVE7QUFFN0QsVUFBTSxZQUFZLFNBQVM7QUFDM0IsVUFBTSxnQ0FBZ0MsU0FBUztBQUMvQyxVQUFNLGtCQUFrQixTQUFTO0FBRWpDLFVBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxRQUFRO0FBRXpDLFFBQUk7QUFFSixXQUFPLEtBQUssV0FBVyxVQUFVLFVBQVUsTUFBTSxRQUFXLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQ0EsT0FBTSxhQUFhO0FBR2xHLFVBQUksQ0FBQyxNQUFNO0FBQ1YsZUFBTyxrQkFBa0IsUUFBYyxNQUFNLENBQUMsbUJBQW1CO0FBQ2pFLGFBQUssSUFBSSxVQUFVLElBQUk7QUFDdkIsWUFBSSxXQUFXO0FBQ2QsZUFBSyxLQUFLLE1BQU0sU0FBUztBQUFBLFFBQzFCO0FBQUEsTUFDRDtBQUdBLFVBQUksS0FBSyxJQUFJQSxNQUFLLFFBQVEsS0FBSyxLQUFLLGFBQWFBLE1BQUssU0FBUztBQUFBLFFBQUssRUFBRSxPQUFPLE1BQU0sVUFBVSxLQUFLO0FBQUE7QUFBQSxNQUFzRSxDQUFDLEdBQUc7QUFDM0ssZUFBTztBQUFBLE1BQ1I7QUFHQSxVQUFJQSxNQUFLLGVBQWUsK0JBQStCO0FBQ3RELGVBQU8sYUFBYTtBQUFBLE1BQ3JCO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUlBLE1BQWMsV0FBVyxVQUErQixVQUFlLE1BQW1ELFVBQThCLGlCQUEwQixTQUE4RTtBQUMvUCxVQUFNLEVBQUUsZUFBZSxJQUFJLEtBQUssVUFBVSxRQUFRO0FBR2xELFVBQU0sV0FBc0I7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsTUFBTSxlQUFlLFNBQVMsUUFBUTtBQUFBLE1BQ3RDLFNBQVMsS0FBSyxPQUFPLFNBQVMsVUFBVTtBQUFBLE1BQ3hDLGNBQWMsS0FBSyxPQUFPLFNBQVMsZUFBZTtBQUFBLE1BQ2xELGlCQUFpQixLQUFLLE9BQU8sU0FBUyxrQkFBa0I7QUFBQSxNQUN4RCxPQUFPLEtBQUs7QUFBQSxNQUNaLE9BQU8sS0FBSztBQUFBLE1BQ1osTUFBTSxLQUFLO0FBQUEsTUFDWCxVQUFVLFNBQVMsS0FBSyxlQUFlLEtBQUssZUFBZSxRQUFRLEtBQUssUUFBUSxTQUFTLGVBQWUsK0JBQStCLFFBQVE7QUFBQSxNQUMvSSxRQUFRLFNBQVMsS0FBSyxlQUFlLEtBQUssZUFBZSxNQUFNO0FBQUEsTUFDL0QsWUFBWSxTQUFTLEtBQUssZUFBZSxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ3ZFLE1BQU0sS0FBSyxFQUFFLE9BQU8sS0FBSyxPQUFPLE1BQU0sS0FBSyxLQUFLLENBQUM7QUFBQSxNQUNqRCxVQUFVO0FBQUEsSUFDWDtBQUdBLFFBQUksU0FBUyxlQUFlLFFBQVEsVUFBVSxRQUFRLEdBQUc7QUFDeEQsVUFBSTtBQUNILGNBQU0sVUFBVSxNQUFNLFNBQVMsUUFBUSxRQUFRO0FBQy9DLGNBQU0sa0JBQWtCLE1BQU0sU0FBUyxRQUFRLFFBQVEsSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLE1BQU07QUFDbEYsY0FBSTtBQUNILGtCQUFNLGdCQUFnQixlQUFlLFNBQVMsVUFBVSxJQUFJO0FBQzVELGtCQUFNLFlBQVksa0JBQWtCLE1BQU0sU0FBUyxLQUFLLGFBQWEsSUFBSSxFQUFFLEtBQUs7QUFFaEYsbUJBQU8sTUFBTSxLQUFLLFdBQVcsVUFBVSxlQUFlLFdBQVcsUUFBUSxRQUFRLGlCQUFpQixPQUFPO0FBQUEsVUFDMUcsU0FBUyxPQUFPO0FBQ2YsaUJBQUssV0FBVyxNQUFNLEtBQUs7QUFFM0IsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFHRixpQkFBUyxXQUFXLFNBQVMsZUFBZTtBQUFBLE1BQzdDLFNBQVMsT0FBTztBQUNmLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFFM0IsaUJBQVMsV0FBVyxDQUFDO0FBQUEsTUFDdEI7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxNQUFNLFdBQVcsV0FBMkY7QUFDM0csV0FBTyxTQUFTLFFBQVEsVUFBVSxJQUFJLE9BQU0sVUFBUztBQUNwRCxVQUFJO0FBQ0gsZUFBTyxFQUFFLE1BQU0sTUFBTSxLQUFLLGNBQWMsTUFBTSxVQUFVLE1BQU0sT0FBTyxHQUFHLFNBQVMsS0FBSztBQUFBLE1BQ3ZGLFNBQVMsT0FBTztBQUNmLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFFM0IsZUFBTyxFQUFFLE1BQU0sUUFBVyxTQUFTLE1BQU07QUFBQSxNQUMxQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxLQUFLLFVBQXNEO0FBQ2hFLFVBQU0sV0FBVyxNQUFNLEtBQUssYUFBYSxRQUFRO0FBRWpELFVBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxRQUFRO0FBRXpDLFdBQU8sS0FBSztBQUFBLE1BQVc7QUFBQSxNQUFVO0FBQUEsTUFBVTtBQUFBLE1BQU07QUFBQSxNQUFXO0FBQUEsTUFBTSxNQUFNO0FBQUE7QUFBQSxJQUF1QztBQUFBLEVBQ2hIO0FBQUEsRUFFQSxNQUFNLFNBQVMsVUFBeUM7QUFDdkQsVUFBTSxXQUFXLE1BQU0sS0FBSyxhQUFhLFFBQVE7QUFFakQsUUFBSSwwQkFBMEIsUUFBUSxHQUFHO0FBQ3hDLFlBQU0sV0FBVyxNQUFNLFNBQVMsU0FBUyxRQUFRO0FBRWpELGFBQU8sU0FBUyxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFBQSxJQUN4QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLE9BQU8sVUFBaUM7QUFDN0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxhQUFhLFFBQVE7QUFFakQsUUFBSTtBQUNILFlBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxRQUFRO0FBRXpDLGFBQU8sQ0FBQyxDQUFDO0FBQUEsSUFDVixTQUFTLE9BQU87QUFDZixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLGNBQWMsVUFBZSxTQUFxRDtBQUN2RixRQUFJO0FBQ0gsWUFBTSxLQUFLLHFCQUFxQixVQUFVLE9BQU87QUFBQSxJQUNsRCxTQUFTLE9BQU87QUFDZixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixVQUFlLFNBQTZDO0FBRzlGLFFBQUksQ0FBQyxTQUFTLGFBQWEsTUFBTSxLQUFLLE9BQU8sUUFBUSxHQUFHO0FBQ3ZELFlBQU0sSUFBSSxtQkFBbUIsU0FBUyxjQUFjLGtGQUFrRixLQUFLLGlCQUFpQixRQUFRLENBQUMsR0FBRyxvQkFBb0IscUJBQXFCLE9BQU87QUFBQSxJQUN6TjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sV0FBVyxVQUFlLDJCQUFpRixTQUFTLFdBQVcsRUFBRSxHQUFHLFNBQThEO0FBR3ZNLFVBQU0sS0FBSyxxQkFBcUIsVUFBVSxPQUFPO0FBR2pELFVBQU0sV0FBVyxNQUFNLEtBQUssVUFBVSxVQUFVLHdCQUF3QjtBQUd4RSxTQUFLLG1CQUFtQixLQUFLLElBQUksbUJBQW1CLFVBQVUsY0FBYyxRQUFRLFFBQVEsQ0FBQztBQUU3RixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxVQUFVLFVBQWUsMEJBQWdGLFNBQTZEO0FBQzNLLFVBQU0sV0FBVyxLQUFLLDRCQUE0QixNQUFNLEtBQUssa0JBQWtCLFFBQVEsR0FBRyxRQUFRO0FBQ2xHLFVBQU0sRUFBRSxlQUFlLElBQUksS0FBSyxVQUFVLFFBQVE7QUFFbEQsUUFBSSxtQkFBbUI7QUFDdkIsUUFBSSw2QkFBNkIsUUFBUSxLQUFLLENBQUMsa0JBQWtCLFFBQVE7QUFDeEUsWUFBTSxzQkFBc0IsU0FBUyx5QkFBeUIsUUFBUTtBQUN0RSxVQUFJLHFCQUFxQjtBQUN4QiwyQkFBbUIsRUFBRSxHQUFHLFNBQVMsUUFBUSxvQkFBb0I7QUFBQSxNQUM5RDtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBR0gsVUFBSSxFQUFFLE1BQU0sUUFBUSx5Q0FBeUMsSUFBSSxNQUFNLEtBQUssa0JBQWtCLFVBQVUsVUFBVSwwQkFBMEIsZ0JBQWdCO0FBRzVKLFVBQUksQ0FBQyxNQUFNO0FBQ1YsY0FBTSxLQUFLLE9BQU8sVUFBVSxlQUFlLFFBQVEsUUFBUSxDQUFDO0FBQUEsTUFDN0Q7QUFNQSxVQUFJLENBQUMsMENBQTBDO0FBQzlDLG1EQUEyQyxNQUFNLEtBQUsscUJBQXFCLFVBQVUsd0JBQXdCO0FBQUEsTUFDOUc7QUFHQSxVQUNDLENBQUMsZ0NBQWdDLFFBQVE7QUFBQSxNQUN4Qyx1QkFBdUIsUUFBUSxLQUFLLG9EQUFvRDtBQUFBLE1BQ3hGLHVCQUF1QixRQUFRLEtBQUssNkJBQTZCLFFBQVEsS0FBSyxrQkFBa0IsUUFDaEc7QUFDRCxjQUFNLEtBQUssa0JBQWtCLFVBQVUsVUFBVSxrQkFBa0Isd0NBQXdDO0FBQUEsTUFDNUcsT0FHSztBQUNKLGNBQU0sS0FBSyxnQkFBZ0IsVUFBVSxVQUFVLGtCQUFrQixvREFBb0QsV0FBVyxpQkFBaUIsd0NBQXdDLElBQUksd0NBQXdDO0FBQUEsTUFDdE87QUFHQSxXQUFLLG1CQUFtQixLQUFLLElBQUksbUJBQW1CLFVBQVUsY0FBYyxLQUFLLENBQUM7QUFBQSxJQUNuRixTQUFTLE9BQU87QUFDZixZQUFNLElBQUksbUJBQW1CLFNBQVMsYUFBYSxvQ0FBb0MsS0FBSyxpQkFBaUIsUUFBUSxHQUFHLDhCQUE4QixLQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsc0JBQXNCLEtBQUssR0FBRyxnQkFBZ0I7QUFBQSxJQUN6TjtBQUVBLFdBQU8sS0FBSyxRQUFRLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsRUFDeEQ7QUFBQSxFQUdBLE1BQWMscUJBQXFCLFVBQWdILDBCQUFnTDtBQUNsVSxRQUFJO0FBQ0osUUFBSSx1QkFBdUIsUUFBUSxLQUFLLEVBQUUsb0NBQW9DLFdBQVc7QUFDeEYsVUFBSSxpQkFBaUIsd0JBQXdCLEdBQUc7QUFDL0MsY0FBTSxpQkFBaUIsTUFBTSxXQUFXLDBCQUEwQixDQUFDO0FBQ25FLFlBQUksZUFBZSxPQUFPO0FBQ3pCLHVCQUFhLFNBQVMsT0FBTyxlQUFlLE1BQU07QUFBQSxRQUNuRCxPQUFPO0FBQ04sdUJBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRCxPQUFPO0FBQ04scUJBQWEsYUFBYSwwQkFBMEIsVUFBUSxTQUFTLE9BQU8sSUFBSSxHQUFHLENBQUM7QUFBQSxNQUNyRjtBQUFBLElBQ0QsT0FBTztBQUNOLG1CQUFhO0FBQUEsSUFDZDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixVQUFnSCxVQUFlLDBCQUFnRixTQUE4SztBQUc1WixVQUFNLFNBQVMsQ0FBQyxDQUFDLFNBQVM7QUFDMUIsUUFBSSxVQUFVLEVBQUUsU0FBUyxlQUFlLCtCQUErQixrQkFBa0I7QUFDeEYsWUFBTSxJQUFJLE1BQU0sU0FBUyxnQ0FBZ0MscUVBQXFFLEtBQUssaUJBQWlCLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDL0o7QUFHQSxRQUFJLFNBQVMsVUFBVSxDQUFDLHdCQUF3QixRQUFRLEdBQUc7QUFDMUQsWUFBTSxJQUFJLG1CQUFtQixTQUFTLGdCQUFnQix5RUFBeUUsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLHNCQUFzQjtBQUFBLElBQzVNO0FBR0EsVUFBTSxTQUFTLENBQUMsQ0FBQyxTQUFTO0FBQzFCLFFBQUksUUFBUTtBQUNYLFVBQUksRUFBRSxTQUFTLGVBQWUsK0JBQStCLGtCQUFrQjtBQUM5RSxjQUFNLElBQUksTUFBTSxTQUFTLGlDQUFpQywrRUFBK0UsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUMxSztBQUVBLFVBQUksRUFBRSxTQUFTLGVBQWUsK0JBQStCLGdCQUFnQjtBQUM1RSxjQUFNLElBQUksTUFBTSxTQUFTLGlDQUFpQyw4RkFBOEYsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUN6TDtBQUVBLFVBQUksUUFBUTtBQUNYLGNBQU0sSUFBSSxNQUFNLFNBQVMsMkJBQTJCLGdFQUFnRSxLQUFLLGlCQUFpQixRQUFRLENBQUMsQ0FBQztBQUFBLE1BQ3JKO0FBQUEsSUFDRDtBQUdBLFFBQUksT0FBMEI7QUFDOUIsUUFBSTtBQUNILGFBQU8sTUFBTSxTQUFTLEtBQUssUUFBUTtBQUFBLElBQ3BDLFNBQVMsT0FBTztBQUNmLGFBQU8sdUJBQU8sT0FBTyxJQUFJO0FBQUEsSUFDMUI7QUFHQSxTQUFLLEtBQUssT0FBTyxTQUFTLGVBQWUsR0FBRztBQUMzQyxZQUFNLElBQUksbUJBQW1CLFNBQVMsNkJBQTZCLDJEQUEyRCxLQUFLLGlCQUFpQixRQUFRLENBQUMsR0FBRyxvQkFBb0IsbUJBQW1CLE9BQU87QUFBQSxJQUMvTTtBQUdBLFNBQUssc0JBQXNCLFVBQVUsSUFBSTtBQWtCekMsUUFBSTtBQUNKLFFBQ0MsT0FBTyxTQUFTLFVBQVUsWUFBWSxPQUFPLFFBQVEsU0FBUyxZQUFZLFFBQVEsU0FBUyxpQkFDM0YsT0FBTyxLQUFLLFVBQVUsWUFBWSxPQUFPLEtBQUssU0FBUyxZQUN2RCxRQUFRLFFBQVEsS0FBSyxTQUFTLFFBQVEsU0FBUyxLQUFLLEVBQUUsT0FBTyxRQUFRLE9BQTBELE1BQU0sS0FBSyxLQUFLLENBQUMsR0FDL0k7QUFDRCxlQUFTLE1BQU0sS0FBSyxxQkFBcUIsVUFBVSx3QkFBd0I7QUFDM0UsVUFBSSxrQkFBa0IsWUFBWSxPQUFPLGVBQWUsS0FBSyxNQUFNO0FBQ2xFLFlBQUk7QUFDSCxnQkFBTSxFQUFFLE1BQU0sSUFBSSxNQUFNLEtBQUssU0FBUyxVQUFVLEVBQUUsUUFBUSxFQUFFLE1BQU0sS0FBSyxLQUFLLEVBQUUsQ0FBQztBQUMvRSxjQUFJLE9BQU8sT0FBTyxLQUFLLEdBQUc7QUFDekIsbUJBQU8sRUFBRSxNQUFNLE9BQU87QUFBQSxVQUN2QjtBQUFBLFFBQ0QsU0FBUyxPQUFPO0FBQUEsUUFFaEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxJQUFJLG1CQUFtQixTQUFTLHFCQUFxQixxQkFBcUIsR0FBRyxvQkFBb0IscUJBQXFCLE9BQU87QUFBQSxJQUNwSTtBQUVBLFdBQU8sRUFBRSxNQUFNLE9BQU87QUFBQSxFQUN2QjtBQUFBLEVBRUEsTUFBTSxTQUFTLFVBQWUsU0FBNEIsT0FBa0Q7QUFDM0csVUFBTSxXQUFXLE1BQU0sS0FBSyxpQkFBaUIsUUFBUTtBQUVyRCxRQUFJLFNBQVMsUUFBUTtBQUNwQixhQUFPLEtBQUssaUJBQWlCLFVBQVUsVUFBVSxTQUFTLEtBQUs7QUFBQSxJQUNoRTtBQUVBLFdBQU8sS0FBSyxXQUFXLFVBQVUsVUFBVSxTQUFTLEtBQUs7QUFBQSxFQUMxRDtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsVUFBa0ssVUFBZSxTQUE0QixPQUFrRDtBQUM3UixXQUFPLElBQUksUUFBc0IsQ0FBQyxTQUFTLFdBQVc7QUFDckQsV0FBSyxXQUFXLFNBQVMsVUFBVSxZQUFZO0FBQzlDLFlBQUk7QUFDSCxnQkFBTSxVQUFVLE1BQU0sS0FBSyxXQUFXLFVBQVUsVUFBVSxTQUFTLEtBQUs7QUFDeEUsa0JBQVEsT0FBTztBQUFBLFFBQ2hCLFNBQVMsT0FBTztBQUNmLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBQUEsTUFDRCxHQUFHLEtBQUssVUFBVSxRQUFRLEVBQUUsY0FBYztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLFdBQVcsVUFBa0ssVUFBZSxTQUE0QixPQUFrRDtBQUN2UixVQUFNLFNBQVMsTUFBTSxLQUFLLGlCQUFpQixVQUFVLFVBQVU7QUFBQSxNQUM5RCxHQUFHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BTUgsa0JBQWtCO0FBQUEsSUFDbkIsR0FBRyxLQUFLO0FBRVIsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsT0FBTyxNQUFNLGVBQWUsT0FBTyxLQUFLO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBZSxTQUFrQyxPQUF3RDtBQUM3SCxVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixRQUFRO0FBRXJELFdBQU8sS0FBSyxpQkFBaUIsVUFBVSxVQUFVLFNBQVMsS0FBSztBQUFBLEVBQ2hFO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixVQUFrSyxVQUFlLFNBQXNGLE9BQXdEO0FBVTdWLFVBQU0sb0JBQW9CLElBQUksd0JBQXdCLEtBQUs7QUFFM0QsUUFBSSxrQkFBa0I7QUFDdEIsUUFBSSw0QkFBNEIsUUFBUSxLQUFLLFNBQVMsd0JBQXdCLFFBQVEsR0FBRztBQUN4Rix3QkFBa0IsRUFBRSxHQUFHLFNBQVMsUUFBUSxLQUFLO0FBQUEsSUFDOUM7QUFHQSxVQUFNLGNBQWMsS0FBSyxpQkFBaUIsVUFBVSxlQUFlLEVBQUUsS0FBSyxVQUFRLE1BQU0sV0FBUztBQUNoRyx3QkFBa0IsUUFBUSxJQUFJO0FBRTlCLFlBQU07QUFBQSxJQUNQLENBQUM7QUFFRCxRQUFJLGFBQWlEO0FBQ3JELFFBQUk7QUFNSCxVQUFJLE9BQU8saUJBQWlCLFNBQVMsWUFBWSxnQkFBZ0IsU0FBUyxlQUFlO0FBQ3hGLGNBQU07QUFBQSxNQUNQO0FBR0EsVUFDRSxpQkFBaUIsVUFBVSw0QkFBNEIsUUFBUTtBQUFBLE1BQ2hFLEVBQUUsZ0NBQWdDLFFBQVEsS0FBSyw0QkFBNEIsUUFBUTtBQUFBLE1BQ2xGLHVCQUF1QixRQUFRLEtBQUssaUJBQWlCLGtCQUNyRDtBQUNELHFCQUFhLEtBQUssbUJBQW1CLFVBQVUsVUFBVSxlQUFlO0FBQUEsTUFDekUsV0FHUyw0QkFBNEIsUUFBUSxHQUFHO0FBQy9DLHFCQUFhLEtBQUssaUJBQWlCLFVBQVUsVUFBVSxrQkFBa0IsT0FBTyxlQUFlO0FBQUEsTUFDaEcsT0FHSztBQUNKLHFCQUFhLEtBQUssaUJBQWlCLFVBQVUsVUFBVSxrQkFBa0IsT0FBTyxlQUFlO0FBQUEsTUFDaEc7QUFFQSxpQkFBVyxHQUFHLE9BQU8sTUFBTSxrQkFBa0IsUUFBUSxDQUFDO0FBQ3RELGlCQUFXLEdBQUcsU0FBUyxNQUFNLGtCQUFrQixRQUFRLENBQUM7QUFFeEQsWUFBTSxXQUFXLE1BQU07QUFFdkIsYUFBTztBQUFBLFFBQ04sR0FBRztBQUFBLFFBQ0gsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELFNBQVMsT0FBTztBQUtmLFVBQUksWUFBWTtBQUNmLGNBQU0sY0FBYyxVQUFVO0FBQUEsTUFDL0I7QUFJQSxZQUFNLEtBQUssaUJBQWlCLE9BQU8sVUFBVSxlQUFlO0FBQUEsSUFDN0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsT0FBYyxVQUFlLFNBQXNEO0FBQzNHLFVBQU0sVUFBVSxTQUFTLFlBQVksbUNBQW1DLEtBQUssaUJBQWlCLFFBQVEsR0FBRyw4QkFBOEIsS0FBSyxFQUFFLFNBQVMsQ0FBQztBQUV4SixRQUFJLGlCQUFpQixvQ0FBb0M7QUFDeEQsYUFBTyxJQUFJLG1DQUFtQyxTQUFTLE1BQU0sTUFBTSxPQUFPO0FBQUEsSUFDM0U7QUFFQSxRQUFJLGlCQUFpQiw0QkFBNEI7QUFDaEQsYUFBTyxJQUFJLDJCQUEyQixTQUFTLE1BQU0scUJBQXFCLE1BQU0sTUFBTSxNQUFNLE9BQTJCO0FBQUEsSUFDeEg7QUFFQSxXQUFPLElBQUksbUJBQW1CLFNBQVMsc0JBQXNCLEtBQUssR0FBRyxPQUFPO0FBQUEsRUFDN0U7QUFBQSxFQUVRLGlCQUFpQixVQUEyRCxVQUFlLE9BQTBCLFVBQWtDLHVCQUFPLE9BQU8sSUFBSSxHQUEyQjtBQUMzTSxVQUFNLGFBQWEsU0FBUyxlQUFlLFVBQVUsU0FBUyxLQUFLO0FBRW5FLFdBQU8sVUFBVSxZQUFZO0FBQUEsTUFDNUIsTUFBTSxVQUFRLGdCQUFnQixXQUFXLE9BQU8sU0FBUyxLQUFLLElBQUk7QUFBQSxNQUNsRSxPQUFPLFdBQVMsS0FBSyxpQkFBaUIsT0FBTyxVQUFVLE9BQU87QUFBQSxJQUMvRCxHQUFHLFVBQVEsU0FBUyxPQUFPLElBQUksQ0FBQztBQUFBLEVBQ2pDO0FBQUEsRUFFUSxpQkFBaUIsVUFBK0QsVUFBZSxPQUEwQixVQUFrQyx1QkFBTyxPQUFPLElBQUksR0FBMkI7QUFDL00sVUFBTSxTQUFTLHlCQUF5QjtBQUV4Qyx1QkFBbUIsVUFBVSxVQUFVLFFBQVEsVUFBUSxNQUFNO0FBQUEsTUFDNUQsR0FBRztBQUFBLE1BQ0gsWUFBWSxLQUFLO0FBQUEsTUFDakIsa0JBQWtCLFdBQVMsS0FBSyxpQkFBaUIsT0FBTyxVQUFVLE9BQU87QUFBQSxJQUMxRSxHQUFHLEtBQUs7QUFFUixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsbUJBQW1CLFVBQTRHLFVBQWUsU0FBNkU7QUFDbE8sVUFBTSxTQUFTLG1CQUE2QixVQUFRLFNBQVMsT0FBTyxJQUFJLENBQUM7QUFJekUsS0FBQyxZQUFZO0FBQ1osVUFBSTtBQUNILFlBQUk7QUFDSixZQUFJLFNBQVMsVUFBVSw0QkFBNEIsUUFBUSxHQUFHO0FBQzdELG1CQUFTLE1BQU0sU0FBUyxTQUFTLFVBQVUsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFFBQzVELE9BQU87QUFDTixtQkFBUyxNQUFNLFNBQVMsU0FBUyxRQUFRO0FBQUEsUUFDMUM7QUFHQSxZQUFJLE9BQU8sU0FBUyxhQUFhLFVBQVU7QUFDMUMsbUJBQVMsT0FBTyxNQUFNLFFBQVEsUUFBUTtBQUFBLFFBQ3ZDO0FBR0EsWUFBSSxPQUFPLFNBQVMsV0FBVyxVQUFVO0FBQ3hDLG1CQUFTLE9BQU8sTUFBTSxHQUFHLFFBQVEsTUFBTTtBQUFBLFFBQ3hDO0FBR0EsYUFBSyx1QkFBdUIsVUFBVSxPQUFPLFlBQVksT0FBTztBQUdoRSxlQUFPLElBQUksU0FBUyxLQUFLLE1BQU0sQ0FBQztBQUFBLE1BQ2pDLFNBQVMsS0FBSztBQUNiLGVBQU8sTUFBTSxHQUFHO0FBQ2hCLGVBQU8sSUFBSTtBQUFBLE1BQ1o7QUFBQSxJQUNELEdBQUc7QUFFSCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsVUFBZSxTQUFrRTtBQUMvRyxVQUFNLE9BQU8sTUFBTSxLQUFLLFFBQVEsVUFBVSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFHbkUsUUFBSSxLQUFLLGFBQWE7QUFDckIsWUFBTSxJQUFJLG1CQUFtQixTQUFTLDRCQUE0QiwwREFBMEQsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLG1CQUFtQixPQUFPO0FBQUEsSUFDN007QUFHQSxRQUFJLE9BQU8sU0FBUyxTQUFTLFlBQVksUUFBUSxTQUFTLGlCQUFpQixRQUFRLFNBQVMsS0FBSyxNQUFNO0FBQ3RHLFlBQU0sSUFBSSxtQ0FBbUMsU0FBUyx3QkFBd0IseUJBQXlCLEdBQUcsTUFBTSxPQUFPO0FBQUEsSUFDeEg7QUFHQSxTQUFLLHVCQUF1QixVQUFVLEtBQUssTUFBTSxPQUFPO0FBRXhELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBdUIsVUFBZSxNQUFjLFNBQXdDO0FBQ25HLFFBQUksT0FBTyxTQUFTLFFBQVEsU0FBUyxZQUFZLE9BQU8sUUFBUSxPQUFPLE1BQU07QUFDNUUsWUFBTSxJQUFJLDJCQUEyQixTQUFTLHFCQUFxQix1REFBdUQsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLGdCQUFnQixNQUFNLE9BQU87QUFBQSxJQUM5TTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLFFBQVEsUUFBYSxRQUFhLFdBQTRDO0FBQ25GLFdBQU8sS0FBSyxjQUFjLFFBQVEsUUFBUSxRQUFRLFNBQVM7QUFBQSxFQUM1RDtBQUFBLEVBRUEsTUFBTSxRQUFRLFFBQWEsUUFBYSxXQUE0QztBQUNuRixXQUFPLEtBQUssY0FBYyxRQUFRLFFBQVEsUUFBUSxTQUFTO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLE1BQWMsY0FBYyxRQUFhLFFBQWEsTUFBdUIsV0FBNEM7QUFDeEgsUUFBSSxPQUFPLFNBQVMsTUFBTSxPQUFPLFNBQVMsR0FBRztBQUM1QyxVQUFJO0FBQ0gsY0FBTSxpQkFBaUIsU0FBUyxTQUFTLEtBQUssNEJBQTRCLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxHQUFHLE1BQU0sSUFBSSxNQUFNLEtBQUssaUJBQWlCLE1BQU07QUFDNUosY0FBTSxpQkFBaUIsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLGtCQUFrQixNQUFNLEdBQUcsTUFBTTtBQUVwRyxjQUFNLEtBQUssbUJBQW1CLGdCQUFnQixRQUFRLGdCQUFnQixRQUFRLE1BQU0sU0FBUztBQUFBLE1BQzlGLFNBQVMsT0FBTztBQUNmLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLEtBQUssUUFBYSxRQUFhLFdBQXFEO0FBQ3pGLFVBQU0saUJBQWlCLEtBQUssNEJBQTRCLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxHQUFHLE1BQU07QUFDcEcsVUFBTSxpQkFBaUIsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLGtCQUFrQixNQUFNLEdBQUcsTUFBTTtBQUdwRyxVQUFNLE9BQU8sTUFBTSxLQUFLLFdBQVcsZ0JBQWdCLFFBQVEsZ0JBQWdCLFFBQVEsUUFBUSxDQUFDLENBQUMsU0FBUztBQUd0RyxVQUFNLFdBQVcsTUFBTSxLQUFLLFFBQVEsUUFBUSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDckUsU0FBSyxtQkFBbUIsS0FBSyxJQUFJLG1CQUFtQixRQUFRLFNBQVMsU0FBUyxjQUFjLE9BQU8sY0FBYyxNQUFNLFFBQVEsQ0FBQztBQUVoSSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxLQUFLLFFBQWEsUUFBYSxXQUFxRDtBQUN6RixVQUFNLGlCQUFpQixNQUFNLEtBQUssaUJBQWlCLE1BQU07QUFDekQsVUFBTSxpQkFBaUIsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLGtCQUFrQixNQUFNLEdBQUcsTUFBTTtBQUdwRyxVQUFNLE9BQU8sTUFBTSxLQUFLLFdBQVcsZ0JBQWdCLFFBQVEsZ0JBQWdCLFFBQVEsUUFBUSxDQUFDLENBQUMsU0FBUztBQUd0RyxVQUFNLFdBQVcsTUFBTSxLQUFLLFFBQVEsUUFBUSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDckUsU0FBSyxtQkFBbUIsS0FBSyxJQUFJLG1CQUFtQixRQUFRLFNBQVMsU0FBUyxjQUFjLE9BQU8sY0FBYyxNQUFNLFFBQVEsQ0FBQztBQUVoSSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxXQUFXLGdCQUFxQyxRQUFhLGdCQUFxQyxRQUFhLE1BQXVCLFdBQThDO0FBQ2pNLFFBQUksT0FBTyxTQUFTLE1BQU0sT0FBTyxTQUFTLEdBQUc7QUFDNUMsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLEVBQUUsUUFBUSxvQ0FBb0MsSUFBSSxNQUFNLEtBQUssbUJBQW1CLGdCQUFnQixRQUFRLGdCQUFnQixRQUFRLE1BQU0sU0FBUztBQUdySixRQUFJLFVBQVUsQ0FBQyx1Q0FBdUMsV0FBVztBQUNoRSxZQUFNLEtBQUssSUFBSSxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxJQUMzQztBQUdBLFVBQU0sS0FBSyxPQUFPLGdCQUFnQixLQUFLLFVBQVUsY0FBYyxFQUFFLGVBQWUsUUFBUSxNQUFNLENBQUM7QUFHL0YsUUFBSSxTQUFTLFFBQVE7QUFHcEIsVUFBSSxtQkFBbUIsa0JBQWtCLDRCQUE0QixjQUFjLEdBQUc7QUFDckYsY0FBTSxlQUFlLEtBQUssUUFBUSxRQUFRLEVBQUUsVUFBVSxDQUFDO0FBQUEsTUFDeEQsT0FJSztBQUNKLGNBQU0sYUFBYSxNQUFNLEtBQUssUUFBUSxNQUFNO0FBQzVDLFlBQUksV0FBVyxhQUFhO0FBQzNCLGdCQUFNLEtBQUssYUFBYSxnQkFBZ0IsWUFBWSxnQkFBZ0IsTUFBTTtBQUFBLFFBQzNFLE9BQU87QUFDTixnQkFBTSxLQUFLLFdBQVcsZ0JBQWdCLFFBQVEsZ0JBQWdCLE1BQU07QUFBQSxRQUNyRTtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUixPQUdLO0FBR0osVUFBSSxtQkFBbUIsZ0JBQWdCO0FBQ3RDLGNBQU0sZUFBZSxPQUFPLFFBQVEsUUFBUSxFQUFFLFVBQVUsQ0FBQztBQUV6RCxlQUFPO0FBQUEsTUFDUixPQUdLO0FBQ0osY0FBTSxLQUFLLFdBQVcsZ0JBQWdCLFFBQVEsZ0JBQWdCLFFBQVEsUUFBUSxTQUFTO0FBQ3ZGLGNBQU0sS0FBSyxJQUFJLFFBQVEsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUUxQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFdBQVcsZ0JBQXFDLFFBQWEsZ0JBQXFDLFFBQTRCO0FBRzNJLFFBQUksZ0NBQWdDLGNBQWMsS0FBSyxnQ0FBZ0MsY0FBYyxHQUFHO0FBQ3ZHLGFBQU8sS0FBSyxlQUFlLGdCQUFnQixRQUFRLGdCQUFnQixNQUFNO0FBQUEsSUFDMUU7QUFHQSxRQUFJLGdDQUFnQyxjQUFjLEtBQUssdUJBQXVCLGNBQWMsR0FBRztBQUM5RixhQUFPLEtBQUssMkJBQTJCLGdCQUFnQixRQUFRLGdCQUFnQixNQUFNO0FBQUEsSUFDdEY7QUFHQSxRQUFJLHVCQUF1QixjQUFjLEtBQUssZ0NBQWdDLGNBQWMsR0FBRztBQUM5RixhQUFPLEtBQUssMkJBQTJCLGdCQUFnQixRQUFRLGdCQUFnQixNQUFNO0FBQUEsSUFDdEY7QUFHQSxRQUFJLHVCQUF1QixjQUFjLEtBQUssdUJBQXVCLGNBQWMsR0FBRztBQUNyRixhQUFPLEtBQUssaUJBQWlCLGdCQUFnQixRQUFRLGdCQUFnQixNQUFNO0FBQUEsSUFDNUU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWEsZ0JBQXFDLGNBQXlCLGdCQUFxQyxjQUFrQztBQUcvSixVQUFNLGVBQWUsTUFBTSxZQUFZO0FBR3ZDLFFBQUksTUFBTSxRQUFRLGFBQWEsUUFBUSxHQUFHO0FBQ3pDLFlBQU0sU0FBUyxRQUFRLGFBQWEsU0FBUyxJQUFJLE9BQU0sZ0JBQWU7QUFDckUsY0FBTSxjQUFjLEtBQUssVUFBVSxjQUFjLEVBQUUsZUFBZSxTQUFTLGNBQWMsWUFBWSxJQUFJO0FBQ3pHLFlBQUksWUFBWSxhQUFhO0FBQzVCLGlCQUFPLEtBQUssYUFBYSxnQkFBZ0IsTUFBTSxLQUFLLFFBQVEsWUFBWSxRQUFRLEdBQUcsZ0JBQWdCLFdBQVc7QUFBQSxRQUMvRyxPQUFPO0FBQ04saUJBQU8sS0FBSyxXQUFXLGdCQUFnQixZQUFZLFVBQVUsZ0JBQWdCLFdBQVc7QUFBQSxRQUN6RjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLGdCQUFxQyxRQUFhLGdCQUFxQyxRQUFhLE1BQXVCLFdBQWlHO0FBQzVQLFFBQUksc0NBQXNDO0FBRzFDLFFBQUksbUJBQW1CLGdCQUFnQjtBQUN0QyxZQUFNLEVBQUUsZ0JBQWdCLG9CQUFvQixJQUFJLEtBQUssVUFBVSxjQUFjO0FBQzdFLFVBQUksQ0FBQyxxQkFBcUI7QUFDekIsOENBQXNDLGVBQWUsUUFBUSxRQUFRLE1BQU07QUFBQSxNQUM1RTtBQUVBLFVBQUksdUNBQXVDLFNBQVMsUUFBUTtBQUMzRCxjQUFNLElBQUksTUFBTSxTQUFTLDBCQUEwQix1SEFBdUgsS0FBSyxpQkFBaUIsTUFBTSxHQUFHLEtBQUssaUJBQWlCLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDeE87QUFFQSxVQUFJLENBQUMsdUNBQXVDLGVBQWUsZ0JBQWdCLFFBQVEsTUFBTSxHQUFHO0FBQzNGLGNBQU0sSUFBSSxNQUFNLFNBQVMsMEJBQTBCLG9FQUFvRSxLQUFLLGlCQUFpQixNQUFNLEdBQUcsS0FBSyxpQkFBaUIsTUFBTSxDQUFDLENBQUM7QUFBQSxNQUNyTDtBQUFBLElBQ0Q7QUFHQSxVQUFNLFNBQVMsTUFBTSxLQUFLLE9BQU8sTUFBTTtBQUN2QyxRQUFJLFVBQVUsQ0FBQyxxQ0FBcUM7QUFHbkQsVUFBSSxDQUFDLFdBQVc7QUFDZixjQUFNLElBQUksbUJBQW1CLFNBQVMsMEJBQTBCLGlGQUFpRixLQUFLLGlCQUFpQixNQUFNLEdBQUcsS0FBSyxpQkFBaUIsTUFBTSxDQUFDLEdBQUcsb0JBQW9CLGtCQUFrQjtBQUFBLE1BQ3ZQO0FBSUEsVUFBSSxtQkFBbUIsZ0JBQWdCO0FBQ3RDLGNBQU0sRUFBRSxlQUFlLElBQUksS0FBSyxVQUFVLGNBQWM7QUFDeEQsWUFBSSxlQUFlLGdCQUFnQixRQUFRLE1BQU0sR0FBRztBQUNuRCxnQkFBTSxJQUFJLE1BQU0sU0FBUywwQkFBMEIsa0dBQWtHLEtBQUssaUJBQWlCLE1BQU0sR0FBRyxLQUFLLGlCQUFpQixNQUFNLENBQUMsQ0FBQztBQUFBLFFBQ25OO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLEVBQUUsUUFBUSxvQ0FBb0M7QUFBQSxFQUN0RDtBQUFBLEVBRVEsVUFBVSxVQUEwRjtBQUMzRyxVQUFNLHNCQUFzQixLQUFLLG9CQUFvQixRQUFRO0FBRTdELFdBQU87QUFBQSxNQUNOLGdCQUFnQixzQkFBc0IsU0FBUztBQUFBLE1BQy9DO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixVQUF3QztBQUNuRSxXQUFPLENBQUMsRUFBRSxTQUFTLGVBQWUsK0JBQStCO0FBQUEsRUFDbEU7QUFBQSxFQUVBLE1BQU0sYUFBYSxVQUErQztBQUNqRSxVQUFNLFdBQVcsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLGFBQWEsUUFBUSxHQUFHLFFBQVE7QUFHN0YsVUFBTSxLQUFLLE9BQU8sVUFBVSxRQUFRO0FBR3BDLFVBQU0sV0FBVyxNQUFNLEtBQUssUUFBUSxVQUFVLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUN2RSxTQUFLLG1CQUFtQixLQUFLLElBQUksbUJBQW1CLFVBQVUsY0FBYyxRQUFRLFFBQVEsQ0FBQztBQUU3RixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxPQUFPLFVBQStCLFdBQStCO0FBQ2xGLFVBQU0sc0JBQWdDLENBQUM7QUFHdkMsVUFBTSxFQUFFLGVBQWUsSUFBSSxLQUFLLFVBQVUsUUFBUTtBQUNsRCxXQUFPLENBQUMsZUFBZSxRQUFRLFdBQVcsZUFBZSxRQUFRLFNBQVMsQ0FBQyxHQUFHO0FBQzdFLFVBQUk7QUFDSCxjQUFNLE9BQU8sTUFBTSxTQUFTLEtBQUssU0FBUztBQUMxQyxhQUFLLEtBQUssT0FBTyxTQUFTLGVBQWUsR0FBRztBQUMzQyxnQkFBTSxJQUFJLE1BQU0sU0FBUyxvQkFBb0IsNEVBQTRFLEtBQUssaUJBQWlCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsUUFDM0o7QUFFQTtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBR2YsWUFBSSw4QkFBOEIsS0FBSyxNQUFNLDRCQUE0QixjQUFjO0FBQ3RGLGdCQUFNO0FBQUEsUUFDUDtBQUdBLDRCQUFvQixLQUFLLGVBQWUsU0FBUyxTQUFTLENBQUM7QUFHM0Qsb0JBQVksZUFBZSxRQUFRLFNBQVM7QUFBQSxNQUM3QztBQUFBLElBQ0Q7QUFHQSxhQUFTLElBQUksb0JBQW9CLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUN6RCxrQkFBWSxlQUFlLFNBQVMsV0FBVyxvQkFBb0IsQ0FBQyxDQUFDO0FBRXJFLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxTQUFTO0FBQUEsTUFDL0IsU0FBUyxPQUFPO0FBQ2YsWUFBSSw4QkFBOEIsS0FBSyxNQUFNLDRCQUE0QixZQUFZO0FBU3BGLGdCQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxVQUFVLFVBQWUsU0FBOEQ7QUFDNUYsUUFBSTtBQUNILFlBQU0sS0FBSyxpQkFBaUIsVUFBVSxPQUFPO0FBQUEsSUFDOUMsU0FBUyxPQUFPO0FBQ2YsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsVUFBZSxTQUFxRTtBQUNsSCxVQUFNLFdBQVcsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLGFBQWEsUUFBUSxHQUFHLFFBQVE7QUFHN0YsVUFBTSxXQUFXLENBQUMsQ0FBQyxTQUFTO0FBQzVCLFFBQUksWUFBWSxFQUFFLFNBQVMsZUFBZSwrQkFBK0IsUUFBUTtBQUNoRixZQUFNLElBQUksTUFBTSxTQUFTLGdDQUFnQywrRUFBK0UsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUN6SztBQUdBLFVBQU0sU0FBUyxTQUFTO0FBQ3hCLFFBQUksVUFBVSxFQUFFLFNBQVMsZUFBZSwrQkFBK0IsbUJBQW1CO0FBQ3pGLFlBQU0sSUFBSSxNQUFNLFNBQVMsaUNBQWlDLGdGQUFnRixLQUFLLGlCQUFpQixRQUFRLENBQUMsQ0FBQztBQUFBLElBQzNLO0FBRUEsUUFBSSxZQUFZLFFBQVE7QUFDdkIsWUFBTSxJQUFJLE1BQU0sU0FBUyx5Q0FBeUMsMEVBQTBFLEtBQUssaUJBQWlCLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDN0s7QUFHQSxRQUFJLE9BQTBCO0FBQzlCLFFBQUk7QUFDSCxhQUFPLE1BQU0sU0FBUyxLQUFLLFFBQVE7QUFBQSxJQUNwQyxTQUFTLE9BQU87QUFBQSxJQUVoQjtBQUVBLFFBQUksTUFBTTtBQUNULFdBQUssc0JBQXNCLFVBQVUsSUFBSTtBQUFBLElBQzFDLE9BQU87QUFDTixZQUFNLElBQUksbUJBQW1CLFNBQVMsd0JBQXdCLDJDQUEyQyxLQUFLLGlCQUFpQixRQUFRLENBQUMsR0FBRyxvQkFBb0IsY0FBYztBQUFBLElBQzlLO0FBR0EsVUFBTSxZQUFZLENBQUMsQ0FBQyxTQUFTO0FBQzdCLFFBQUksQ0FBQyxXQUFXO0FBQ2YsWUFBTUEsUUFBTyxNQUFNLEtBQUssUUFBUSxRQUFRO0FBQ3hDLFVBQUlBLE1BQUssZUFBZSxNQUFNLFFBQVFBLE1BQUssUUFBUSxLQUFLQSxNQUFLLFNBQVMsU0FBUyxHQUFHO0FBQ2pGLGNBQU0sSUFBSSxNQUFNLFNBQVMsOEJBQThCLDRDQUE0QyxLQUFLLGlCQUFpQixRQUFRLENBQUMsQ0FBQztBQUFBLE1BQ3BJO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBZSxTQUFzRDtBQUM5RSxVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixVQUFVLE9BQU87QUFFOUQsUUFBSSxvQkFBb0I7QUFDeEIsUUFBSSw4QkFBOEIsUUFBUSxLQUFLLENBQUMsbUJBQW1CLFFBQVE7QUFDMUUsWUFBTSx1QkFBdUIsU0FBUyxzQkFBc0IsUUFBUTtBQUNwRSxVQUFJLHNCQUFzQjtBQUN6Qiw0QkFBb0IsRUFBRSxHQUFHLFNBQVMsUUFBUSxxQkFBcUI7QUFBQSxNQUNoRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsQ0FBQyxDQUFDLG1CQUFtQjtBQUN0QyxVQUFNLFlBQVksQ0FBQyxDQUFDLG1CQUFtQjtBQUN2QyxVQUFNLFNBQVMsbUJBQW1CLFVBQVU7QUFHNUMsVUFBTSxTQUFTLE9BQU8sVUFBVSxFQUFFLFdBQVcsVUFBVSxPQUFPLENBQUM7QUFHL0QsU0FBSyxtQkFBbUIsS0FBSyxJQUFJLG1CQUFtQixVQUFVLGNBQWMsTUFBTSxDQUFDO0FBQUEsRUFDcEY7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLFVBQVUsUUFBYSxRQUE0QjtBQUN4RCxVQUFNLGlCQUFpQixNQUFNLEtBQUssYUFBYSxNQUFNO0FBQ3JELFVBQU0saUJBQWlCLEtBQUssNEJBQTRCLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxHQUFHLE1BQU07QUFFcEcsUUFBSSxtQkFBbUIsa0JBQWtCLEtBQUssVUFBVSxjQUFjLEVBQUUsZUFBZSxRQUFRLFFBQVEsTUFBTSxHQUFHO0FBQy9HO0FBQUEsSUFDRDtBQUdBLFFBQUksbUJBQW1CLGtCQUFrQix1QkFBdUIsY0FBYyxHQUFHO0FBQ2hGLGFBQU8sZUFBZSxVQUFVLFFBQVEsTUFBTTtBQUFBLElBQy9DO0FBT0EsVUFBTSxLQUFLLE9BQU8sZ0JBQWdCLEtBQUssVUFBVSxjQUFjLEVBQUUsZUFBZSxRQUFRLE1BQU0sQ0FBQztBQUkvRixRQUFJLG1CQUFtQixrQkFBa0IsNEJBQTRCLGNBQWMsR0FBRztBQUNyRixhQUFPLEtBQUssV0FBVyxTQUFTLFFBQVEsTUFBTSxlQUFlLEtBQUssUUFBUSxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUMsR0FBRyxLQUFLLFVBQVUsY0FBYyxFQUFFLGNBQWM7QUFBQSxJQUN0SjtBQUlBLFdBQU8sS0FBSyxXQUFXLFNBQVMsUUFBUSxNQUFNLEtBQUssV0FBVyxnQkFBZ0IsUUFBUSxnQkFBZ0IsTUFBTSxHQUFHLEtBQUssVUFBVSxjQUFjLEVBQUUsY0FBYztBQUFBLEVBQzdKO0FBQUEsRUFrQkEsY0FBYyxVQUFlLFNBQXFGO0FBQ2pILFdBQU8sS0FBSyxNQUFNLFVBQVU7QUFBQSxNQUMzQixHQUFHO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJSCxlQUFlLFlBQVk7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBSUEsTUFBTSxVQUFlLFVBQXlCLEVBQUUsV0FBVyxPQUFPLFVBQVUsQ0FBQyxFQUFFLEdBQXFDO0FBQ25ILFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUd4QyxRQUFJLGdCQUFnQjtBQUNwQixRQUFJLGVBQWUsTUFBTTtBQUFFLHNCQUFnQjtBQUFBLElBQU07QUFDakQsZ0JBQVksSUFBSSxhQUFhLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFJbEQsS0FBQyxZQUFZO0FBQ1osVUFBSTtBQUNILGNBQU0sYUFBYSxNQUFNLEtBQUssUUFBUSxVQUFVLE9BQU87QUFDdkQsWUFBSSxlQUFlO0FBQ2xCLGtCQUFRLFVBQVU7QUFBQSxRQUNuQixPQUFPO0FBQ04seUJBQWUsTUFBTSxRQUFRLFVBQVU7QUFBQSxRQUN4QztBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sS0FBSztBQUFBLE1BQzVCO0FBQUEsSUFDRCxHQUFHO0FBSUgsVUFBTSxnQkFBZ0IsUUFBUTtBQUM5QixRQUFJLE9BQU8sa0JBQWtCLFVBQVU7QUFDdEMsWUFBTSxvQkFBb0IsWUFBWSxJQUFJLElBQUksUUFBMEIsQ0FBQztBQUN6RSxrQkFBWSxJQUFJLEtBQUsseUJBQXlCLE1BQU0sT0FBSztBQUN4RCxZQUFJLEVBQUUsV0FBVyxhQUFhLEdBQUc7QUFDaEMsNEJBQWtCLEtBQUssQ0FBQztBQUFBLFFBQ3pCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLFVBQThCO0FBQUEsUUFDbkMsYUFBYSxrQkFBa0I7QUFBQSxRQUMvQixTQUFTLE1BQU0sWUFBWSxRQUFRO0FBQUEsTUFDcEM7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLFFBQVEsVUFBZSxTQUE4QztBQUNsRixVQUFNLFdBQVcsTUFBTSxLQUFLLGFBQWEsUUFBUTtBQUdqRCxVQUFNLFlBQVksS0FBSyxDQUFDLEtBQUssVUFBVSxRQUFRLEVBQUUsZUFBZSxpQkFBaUIsUUFBUSxHQUFHLE9BQU8sQ0FBQztBQUNwRyxRQUFJLFVBQVUsS0FBSyxlQUFlLElBQUksU0FBUztBQUMvQyxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVO0FBQUEsUUFDVCxPQUFPO0FBQUEsUUFDUCxZQUFZLFNBQVMsTUFBTSxVQUFVLE9BQU87QUFBQSxNQUM3QztBQUVBLFdBQUssZUFBZSxJQUFJLFdBQVcsT0FBTztBQUFBLElBQzNDO0FBR0EsWUFBUSxTQUFTO0FBRWpCLFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFVBQUksU0FBUztBQUdaLGdCQUFRO0FBR1IsWUFBSSxRQUFRLFVBQVUsR0FBRztBQUN4QixrQkFBUSxRQUFRLFVBQVU7QUFDMUIsZUFBSyxlQUFlLE9BQU8sU0FBUztBQUFBLFFBQ3JDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUVkLGVBQVcsQ0FBQyxFQUFFLE9BQU8sS0FBSyxLQUFLLGdCQUFnQjtBQUM5QyxjQUFRLFFBQVEsVUFBVTtBQUFBLElBQzNCO0FBRUEsU0FBSyxlQUFlLE1BQU07QUFBQSxFQUMzQjtBQUFBLEVBUUEsTUFBYyxnQkFBZ0IsVUFBK0QsVUFBZSxTQUF3QyxrQ0FBNkg7QUFDaFIsV0FBTyxLQUFLLFdBQVcsU0FBUyxVQUFVLFlBQVk7QUFHckQsWUFBTSxTQUFTLE1BQU0sU0FBUyxLQUFLLFVBQVUsRUFBRSxRQUFRLE1BQU0sUUFBUSxTQUFTLFVBQVUsT0FBTyxRQUFRLFNBQVMsVUFBVSxNQUFNLENBQUM7QUFHakksVUFBSTtBQUNILFlBQUksaUJBQWlCLGdDQUFnQyxLQUFLLHlCQUF5QixnQ0FBZ0MsR0FBRztBQUNySCxnQkFBTSxLQUFLLDRCQUE0QixVQUFVLFFBQVEsZ0NBQWdDO0FBQUEsUUFDMUYsT0FBTztBQUNOLGdCQUFNLEtBQUssOEJBQThCLFVBQVUsUUFBUSxnQ0FBZ0M7QUFBQSxRQUM1RjtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsY0FBTSw4QkFBOEIsS0FBSztBQUFBLE1BQzFDLFVBQUU7QUFHRCxjQUFNLFNBQVMsTUFBTSxNQUFNO0FBQUEsTUFDNUI7QUFBQSxJQUNELEdBQUcsS0FBSyxVQUFVLFFBQVEsRUFBRSxjQUFjO0FBQUEsRUFDM0M7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLFVBQStELFFBQWdCLHdCQUFnRztBQUN4TixRQUFJLFlBQVk7QUFDaEIsUUFBSTtBQUlKLFFBQUkseUJBQXlCLHNCQUFzQixHQUFHO0FBQ3JELFVBQUksdUJBQXVCLE9BQU8sU0FBUyxHQUFHO0FBQzdDLGNBQU0sUUFBUSxTQUFTLE9BQU8sdUJBQXVCLE1BQU07QUFDM0QsY0FBTSxLQUFLLGNBQWMsVUFBVSxRQUFRLE9BQU8sTUFBTSxZQUFZLFdBQVcsQ0FBQztBQUVoRixxQkFBYSxNQUFNO0FBQUEsTUFDcEI7QUFHQSxVQUFJLHVCQUF1QixPQUFPO0FBQ2pDO0FBQUEsTUFDRDtBQUVBLGVBQVMsdUJBQXVCO0FBQUEsSUFDakMsT0FHSztBQUNKLGVBQVM7QUFBQSxJQUNWO0FBRUEsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsbUJBQWEsUUFBUTtBQUFBLFFBQ3BCLFFBQVEsT0FBTSxVQUFTO0FBR3RCLGlCQUFPLE1BQU07QUFFYixjQUFJO0FBQ0gsa0JBQU0sS0FBSyxjQUFjLFVBQVUsUUFBUSxPQUFPLE1BQU0sWUFBWSxXQUFXLENBQUM7QUFBQSxVQUNqRixTQUFTLE9BQU87QUFDZixtQkFBTyxPQUFPLEtBQUs7QUFBQSxVQUNwQjtBQUVBLHVCQUFhLE1BQU07QUFNbkIscUJBQVcsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUFBLFFBQ2pDO0FBQUEsUUFDQSxTQUFTLFdBQVMsT0FBTyxLQUFLO0FBQUEsUUFDOUIsT0FBTyxNQUFNLFFBQVE7QUFBQSxNQUN0QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyw4QkFBOEIsVUFBK0QsUUFBZ0IsVUFBMkM7QUFDckssUUFBSSxZQUFZO0FBRWhCLFFBQUk7QUFDSixZQUFRLFFBQVEsU0FBUyxLQUFLLE9BQU8sTUFBTTtBQUMxQyxZQUFNLEtBQUssY0FBYyxVQUFVLFFBQVEsT0FBTyxNQUFNLFlBQVksV0FBVyxDQUFDO0FBRWhGLG1CQUFhLE1BQU07QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsY0FBYyxVQUErRCxRQUFnQixRQUFrQixRQUFnQixXQUFtQixhQUFvQztBQUNuTSxRQUFJLG9CQUFvQjtBQUN4QixXQUFPLG9CQUFvQixRQUFRO0FBR2xDLFlBQU0sZUFBZSxNQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVksbUJBQW1CLE9BQU8sUUFBUSxjQUFjLG1CQUFtQixTQUFTLGlCQUFpQjtBQUMzSiwyQkFBcUI7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFVBQTBELFVBQWUsU0FBd0MsMENBQWdKO0FBQ2hTLFdBQU8sS0FBSyxXQUFXLFNBQVMsVUFBVSxNQUFNLEtBQUssd0JBQXdCLFVBQVUsVUFBVSxTQUFTLHdDQUF3QyxHQUFHLEtBQUssVUFBVSxRQUFRLEVBQUUsY0FBYztBQUFBLEVBQzdMO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixVQUEwRCxVQUFlLFNBQXdDLDBDQUFnSjtBQUN0UyxRQUFJO0FBQ0osUUFBSSxvREFBb0QsVUFBVTtBQUNqRSxlQUFTO0FBQUEsSUFDVixXQUFXLGlCQUFpQix3Q0FBd0MsR0FBRztBQUN0RSxlQUFTLE1BQU0sZUFBZSx3Q0FBd0M7QUFBQSxJQUN2RSxXQUFXLHlCQUF5Qix3Q0FBd0MsR0FBRztBQUM5RSxlQUFTLE1BQU0sdUJBQXVCLHdDQUF3QztBQUFBLElBQy9FLE9BQU87QUFDTixlQUFTLGlCQUFpQix3Q0FBd0M7QUFBQSxJQUNuRTtBQUdBLFVBQU0sU0FBUyxVQUFVLFVBQVUsT0FBTyxRQUFRLEVBQUUsUUFBUSxNQUFNLFdBQVcsTUFBTSxRQUFRLFNBQVMsVUFBVSxPQUFPLFFBQVEsU0FBUyxVQUFVLE9BQU8sUUFBUSxTQUFTLFVBQVUsTUFBTSxDQUFDO0FBQUEsRUFDMUw7QUFBQSxFQUVBLE1BQWMsZUFBZSxnQkFBcUUsUUFBYSxnQkFBcUUsUUFBNEI7QUFDL00sV0FBTyxLQUFLLFdBQVcsU0FBUyxRQUFRLE1BQU0sS0FBSyxxQkFBcUIsZ0JBQWdCLFFBQVEsZ0JBQWdCLE1BQU0sR0FBRyxLQUFLLFVBQVUsY0FBYyxFQUFFLGNBQWM7QUFBQSxFQUN2SztBQUFBLEVBRUEsTUFBYyxxQkFBcUIsZ0JBQXFFLFFBQWEsZ0JBQXFFLFFBQTRCO0FBQ3JOLFFBQUksZUFBbUM7QUFDdkMsUUFBSSxlQUFtQztBQUV2QyxRQUFJO0FBR0gscUJBQWUsTUFBTSxlQUFlLEtBQUssUUFBUSxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQ2xFLHFCQUFlLE1BQU0sZUFBZSxLQUFLLFFBQVEsRUFBRSxRQUFRLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFFaEYsWUFBTSxTQUFTLFNBQVMsTUFBTSxLQUFLLFdBQVc7QUFFOUMsVUFBSSxZQUFZO0FBQ2hCLFVBQUksY0FBYztBQUNsQixVQUFJLFlBQVk7QUFDaEIsU0FBRztBQUdGLG9CQUFZLE1BQU0sZUFBZSxLQUFLLGNBQWMsV0FBVyxPQUFPLFFBQVEsYUFBYSxPQUFPLGFBQWEsV0FBVztBQUkxSCxjQUFNLEtBQUssY0FBYyxnQkFBZ0IsY0FBYyxRQUFRLFdBQVcsV0FBVyxXQUFXO0FBRWhHLHFCQUFhO0FBQ2IsdUJBQWU7QUFHZixZQUFJLGdCQUFnQixPQUFPLFlBQVk7QUFDdEMsd0JBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxTQUFTLFlBQVk7QUFBQSxJQUN0QixTQUFTLE9BQU87QUFDZixZQUFNLDhCQUE4QixLQUFLO0FBQUEsSUFDMUMsVUFBRTtBQUNELFlBQU0sU0FBUyxRQUFRO0FBQUEsUUFDdEIsT0FBTyxpQkFBaUIsV0FBVyxlQUFlLE1BQU0sWUFBWSxJQUFJLFFBQVEsUUFBUTtBQUFBLFFBQ3hGLE9BQU8saUJBQWlCLFdBQVcsZUFBZSxNQUFNLFlBQVksSUFBSSxRQUFRLFFBQVE7QUFBQSxNQUN6RixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLGdCQUFnRSxRQUFhLGdCQUFnRSxRQUE0QjtBQUN2TSxXQUFPLEtBQUssV0FBVyxTQUFTLFFBQVEsTUFBTSxLQUFLLHVCQUF1QixnQkFBZ0IsUUFBUSxnQkFBZ0IsTUFBTSxHQUFHLEtBQUssVUFBVSxjQUFjLEVBQUUsY0FBYztBQUFBLEVBQ3pLO0FBQUEsRUFFQSxNQUFjLHVCQUF1QixnQkFBZ0UsUUFBYSxnQkFBZ0UsUUFBNEI7QUFDN00sV0FBTyxlQUFlLFVBQVUsUUFBUSxNQUFNLGVBQWUsU0FBUyxNQUFNLEdBQUcsRUFBRSxRQUFRLE1BQU0sV0FBVyxNQUFNLFFBQVEsT0FBTyxRQUFRLE1BQU0sQ0FBQztBQUFBLEVBQy9JO0FBQUEsRUFFQSxNQUFjLDJCQUEyQixnQkFBZ0UsUUFBYSxnQkFBcUUsUUFBNEI7QUFDdE4sV0FBTyxLQUFLLFdBQVcsU0FBUyxRQUFRLE1BQU0sS0FBSyxpQ0FBaUMsZ0JBQWdCLFFBQVEsZ0JBQWdCLE1BQU0sR0FBRyxLQUFLLFVBQVUsY0FBYyxFQUFFLGNBQWM7QUFBQSxFQUNuTDtBQUFBLEVBRUEsTUFBYyxpQ0FBaUMsZ0JBQWdFLFFBQWEsZ0JBQXFFLFFBQTRCO0FBRzVOLFVBQU0sZUFBZSxNQUFNLGVBQWUsS0FBSyxRQUFRLEVBQUUsUUFBUSxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBR3RGLFFBQUk7QUFDSCxZQUFNLFNBQVMsTUFBTSxlQUFlLFNBQVMsTUFBTTtBQUNuRCxZQUFNLEtBQUssY0FBYyxnQkFBZ0IsY0FBYyxTQUFTLEtBQUssTUFBTSxHQUFHLE9BQU8sWUFBWSxHQUFHLENBQUM7QUFBQSxJQUN0RyxTQUFTLE9BQU87QUFDZixZQUFNLDhCQUE4QixLQUFLO0FBQUEsSUFDMUMsVUFBRTtBQUNELFlBQU0sZUFBZSxNQUFNLFlBQVk7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsMkJBQTJCLGdCQUFxRSxRQUFhLGdCQUFnRSxRQUE0QjtBQUd0TixVQUFNLFNBQVMsTUFBTSxlQUFlLEtBQUssaUJBQWlCLGdCQUFnQixRQUFRLGtCQUFrQixJQUFJLENBQUM7QUFHekcsVUFBTSxLQUFLLGtCQUFrQixnQkFBZ0IsUUFBUSxRQUFXLE1BQU07QUFBQSxFQUN2RTtBQUFBLEVBRVUsNEJBQTJELFVBQWEsVUFBa0I7QUFDbkcsUUFBSSxTQUFTLGVBQWUsK0JBQStCLFVBQVU7QUFDcEUsWUFBTSxJQUFJLG1CQUFtQixTQUFTLGdCQUFnQix5Q0FBeUMsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLHNCQUFzQjtBQUFBLElBQzVLO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUFzQixVQUFlLE1BQW1CO0FBQy9ELFNBQUssS0FBSyxlQUFlLEtBQUssZUFBZSxVQUFVO0FBQ3RELFlBQU0sSUFBSSxtQkFBbUIsU0FBUyxnQkFBZ0IseUNBQXlDLEtBQUssaUJBQWlCLFFBQVEsQ0FBQyxHQUFHLG9CQUFvQixzQkFBc0I7QUFBQSxJQUM1SztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixVQUF1QjtBQUMvQyxRQUFJLFNBQVMsV0FBVyxRQUFRLE1BQU07QUFDckMsYUFBTyxTQUFTO0FBQUEsSUFDakI7QUFFQSxXQUFPLFNBQVMsU0FBUyxJQUFJO0FBQUEsRUFDOUI7QUFBQTtBQUdEO0FBejdDYSxZQTZtQ0csMEJBQTBCO0FBN21DN0IsY0FBTjtBQUFBLEVBU087QUFBQSxHQVREOyIsCiAgIm5hbWVzIjogWyJzdGF0Il0KfQo=
