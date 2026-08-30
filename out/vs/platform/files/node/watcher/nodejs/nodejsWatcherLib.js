import { watch, promises } from "fs";
import { RunOnceWorker, ThrottledWorker } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { isEqual, isEqualOrParent } from "../../../../../base/common/extpath.js";
import { Disposable, DisposableStore, thenRegisterOrDispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { normalizeNFC } from "../../../../../base/common/normalization.js";
import { basename, dirname, join } from "../../../../../base/common/path.js";
import { isLinux, isMacintosh } from "../../../../../base/common/platform.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { Promises } from "../../../../../base/node/pfs.js";
import { FileChangeType } from "../../../common/files.js";
import { coalesceEvents, parseWatcherPatterns, isFiltered, isWatchRequestWithCorrelation } from "../../../common/watcher.js";
import { Lazy } from "../../../../../base/common/lazy.js";
const _NodeJSFileWatcherLibrary = class _NodeJSFileWatcherLibrary extends Disposable {
  constructor(request, recursiveWatcher, onDidFilesChange, onDidWatchFail, onLogMessage, verboseLogging) {
    super();
    this.request = request;
    this.recursiveWatcher = recursiveWatcher;
    this.onDidFilesChange = onDidFilesChange;
    this.onDidWatchFail = onDidWatchFail;
    this.onLogMessage = onLogMessage;
    this.verboseLogging = verboseLogging;
    // Reduce likelyhood of spam from file events via throttling.
    // These numbers are a bit more aggressive compared to the
    // recursive watcher because we can have many individual
    // node.js watchers per request.
    // (https://github.com/microsoft/vscode/issues/124723)
    this.throttledFileChangesEmitter = this._register(new ThrottledWorker(
      {
        maxWorkChunkSize: 100,
        // only process up to 100 changes at once before...
        throttleDelay: 200,
        // ...resting for 200ms until we process events again...
        maxBufferedWork: 1e4
        // ...but never buffering more than 10000 events in memory
      },
      (events) => this.onDidFilesChange(events)
    ));
    // Aggregate file changes over FILE_CHANGES_HANDLER_DELAY
    // to coalesce events and reduce spam.
    this.fileChangesAggregator = this._register(new RunOnceWorker((events) => this.handleFileChanges(events), _NodeJSFileWatcherLibrary.FILE_CHANGES_HANDLER_DELAY));
    this.cts = new CancellationTokenSource();
    this.realPath = new Lazy(async () => {
      let result = this.request.path;
      try {
        result = await Promises.realpath(this.request.path);
        if (this.request.path !== result) {
          this.trace(`correcting a path to watch that seems to be a symbolic link (original: ${this.request.path}, real: ${result})`);
        }
      } catch (error) {
      }
      return result;
    });
    this._isReusingRecursiveWatcher = false;
    this.didFail = false;
    const ignoreCase = !isLinux;
    this.excludes = parseWatcherPatterns(this.request.path, this.request.excludes, ignoreCase);
    this.includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes, ignoreCase) : void 0;
    this.filter = isWatchRequestWithCorrelation(this.request) ? this.request.filter : void 0;
    this.ready = this.watch();
  }
  get isReusingRecursiveWatcher() {
    return this._isReusingRecursiveWatcher;
  }
  get failed() {
    return this.didFail;
  }
  async watch() {
    try {
      const stat = await promises.stat(this.request.path);
      if (this.cts.token.isCancellationRequested) {
        return;
      }
      await thenRegisterOrDispose(this.doWatch(stat.isDirectory()), this._store);
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.error(error);
      } else {
        this.trace(`ignoring a path for watching who's stat info failed to resolve: ${this.request.path} (error: ${error})`);
      }
      this.notifyWatchFailed();
    }
  }
  notifyWatchFailed() {
    this.didFail = true;
    this.onDidWatchFail?.();
  }
  async doWatch(isDirectory) {
    const disposables = new DisposableStore();
    if (this.doWatchWithExistingWatcher(isDirectory, disposables)) {
      this.trace(`reusing an existing recursive watcher for ${this.request.path}`);
      this._isReusingRecursiveWatcher = true;
    } else {
      this._isReusingRecursiveWatcher = false;
      await this.doWatchWithNodeJS(isDirectory, disposables);
    }
    return disposables;
  }
  doWatchWithExistingWatcher(isDirectory, disposables) {
    if (isDirectory) {
      return false;
    }
    const resource = URI.file(this.request.path);
    const subscription = this.recursiveWatcher?.subscribe(this.request.path, async (error, change) => {
      if (disposables.isDisposed) {
        return;
      }
      if (error) {
        await thenRegisterOrDispose(this.doWatch(isDirectory), disposables);
      } else if (change) {
        if (typeof change.cId === "number" || typeof this.request.correlationId === "number") {
          this.onFileChange(
            { resource, type: change.type, cId: this.request.correlationId },
            true
            /* skip excludes/includes (file is explicitly watched) */
          );
        }
      }
    });
    if (subscription) {
      disposables.add(subscription);
      return true;
    }
    return false;
  }
  async doWatchWithNodeJS(isDirectory, disposables) {
    const realPath = await this.realPath.value;
    if (this.cts.token.isCancellationRequested) {
      return;
    }
    if (isMacintosh && isEqualOrParent(realPath, "/Volumes/", true)) {
      this.error(`Refusing to watch ${realPath} for changes using fs.watch() for possibly being a network share where watching is unreliable and unstable.`);
      return;
    }
    const cts = new CancellationTokenSource(this.cts.token);
    disposables.add(toDisposable(() => cts.dispose(true)));
    const watcherDisposables = new DisposableStore();
    disposables.add(watcherDisposables);
    try {
      const requestResource = URI.file(this.request.path);
      const pathBasename = basename(realPath);
      const watcher = watch(realPath);
      watcherDisposables.add(toDisposable(() => {
        watcher.removeAllListeners();
        watcher.close();
      }));
      this.trace(`Started watching: '${realPath}'`);
      const folderChildren = /* @__PURE__ */ new Set();
      if (isDirectory) {
        try {
          for (const child of await Promises.readdir(realPath)) {
            folderChildren.add(child);
          }
        } catch (error) {
          this.error(error);
        }
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      const mapPathToStatDisposable = /* @__PURE__ */ new Map();
      watcherDisposables.add(toDisposable(() => {
        for (const [, disposable] of mapPathToStatDisposable) {
          disposable.dispose();
        }
        mapPathToStatDisposable.clear();
      }));
      watcher.on("error", (code, signal) => {
        if (cts.token.isCancellationRequested) {
          return;
        }
        this.error(`Failed to watch ${realPath} for changes using fs.watch() (${code}, ${signal})`);
        this.notifyWatchFailed();
      });
      watcher.on("change", (type, raw) => {
        if (cts.token.isCancellationRequested) {
          return;
        }
        if (this.verboseLogging) {
          this.traceWithCorrelation(`[raw] ["${type}"] ${raw}`);
        }
        let changedFileName = "";
        if (raw) {
          changedFileName = raw.toString();
          if (isMacintosh) {
            changedFileName = normalizeNFC(changedFileName);
          }
        }
        if (!changedFileName || type !== "change" && type !== "rename") {
          return;
        }
        if (isDirectory) {
          if (type === "rename") {
            mapPathToStatDisposable.get(changedFileName)?.dispose();
            const timeoutHandle = setTimeout(async () => {
              mapPathToStatDisposable.delete(changedFileName);
              if (isEqual(changedFileName, pathBasename, !isLinux) && !await Promises.exists(realPath)) {
                this.onWatchedPathDeleted(requestResource);
                return;
              }
              if (cts.token.isCancellationRequested) {
                return;
              }
              const fileExists = await this.existsChildStrictCase(join(realPath, changedFileName));
              if (cts.token.isCancellationRequested) {
                return;
              }
              let type2;
              if (fileExists) {
                if (folderChildren.has(changedFileName)) {
                  type2 = FileChangeType.UPDATED;
                } else {
                  type2 = FileChangeType.ADDED;
                  folderChildren.add(changedFileName);
                }
              } else {
                folderChildren.delete(changedFileName);
                type2 = FileChangeType.DELETED;
              }
              this.onFileChange({ resource: joinPath(requestResource, changedFileName), type: type2, cId: this.request.correlationId });
            }, _NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);
            mapPathToStatDisposable.set(changedFileName, toDisposable(() => clearTimeout(timeoutHandle)));
          } else {
            let type2;
            if (folderChildren.has(changedFileName)) {
              type2 = FileChangeType.UPDATED;
            } else {
              type2 = FileChangeType.ADDED;
              folderChildren.add(changedFileName);
            }
            this.onFileChange({ resource: joinPath(requestResource, changedFileName), type: type2, cId: this.request.correlationId });
          }
        } else {
          if (type === "rename" || !isEqual(changedFileName, pathBasename, !isLinux)) {
            const timeoutHandle = setTimeout(async () => {
              const fileExists = await Promises.exists(realPath);
              if (cts.token.isCancellationRequested) {
                return;
              }
              if (fileExists) {
                this.onFileChange(
                  { resource: requestResource, type: FileChangeType.UPDATED, cId: this.request.correlationId },
                  true
                  /* skip excludes/includes (file is explicitly watched) */
                );
                watcherDisposables.add(await this.doWatch(false));
              } else {
                this.onWatchedPathDeleted(requestResource);
              }
            }, _NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);
            watcherDisposables.clear();
            watcherDisposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
          } else {
            this.onFileChange(
              { resource: requestResource, type: FileChangeType.UPDATED, cId: this.request.correlationId },
              true
              /* skip excludes/includes (file is explicitly watched) */
            );
          }
        }
      });
    } catch (error) {
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.error(`Failed to watch ${realPath} for changes using fs.watch() (${error.toString()})`);
      this.notifyWatchFailed();
    }
  }
  onWatchedPathDeleted(resource) {
    this.warn("Watcher shutdown because watched path got deleted");
    this.onFileChange(
      { resource, type: FileChangeType.DELETED, cId: this.request.correlationId },
      true
      /* skip excludes/includes (file is explicitly watched) */
    );
    this.fileChangesAggregator.flush();
    this.notifyWatchFailed();
  }
  onFileChange(event, skipIncludeExcludeChecks = false) {
    if (this.cts.token.isCancellationRequested) {
      return;
    }
    if (this.verboseLogging) {
      this.traceWithCorrelation(`${event.type === FileChangeType.ADDED ? "[ADDED]" : event.type === FileChangeType.DELETED ? "[DELETED]" : "[CHANGED]"} ${event.resource.fsPath}`);
    }
    if (!skipIncludeExcludeChecks && this.excludes.some((exclude) => exclude(event.resource.fsPath))) {
      if (this.verboseLogging) {
        this.traceWithCorrelation(` >> ignored (excluded) ${event.resource.fsPath}`);
      }
    } else if (!skipIncludeExcludeChecks && this.includes && this.includes.length > 0 && !this.includes.some((include) => include(event.resource.fsPath))) {
      if (this.verboseLogging) {
        this.traceWithCorrelation(` >> ignored (not included) ${event.resource.fsPath}`);
      }
    } else {
      this.fileChangesAggregator.work(event);
    }
  }
  handleFileChanges(fileChanges) {
    const coalescedFileChanges = coalesceEvents(fileChanges);
    const filteredEvents = [];
    for (const event of coalescedFileChanges) {
      if (isFiltered(event, this.filter)) {
        if (this.verboseLogging) {
          this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`);
        }
        continue;
      }
      filteredEvents.push(event);
    }
    if (filteredEvents.length === 0) {
      return;
    }
    if (this.verboseLogging) {
      for (const event of filteredEvents) {
        this.traceWithCorrelation(` >> normalized ${event.type === FileChangeType.ADDED ? "[ADDED]" : event.type === FileChangeType.DELETED ? "[DELETED]" : "[CHANGED]"} ${event.resource.fsPath}`);
      }
    }
    const worked = this.throttledFileChangesEmitter.work(filteredEvents);
    if (!worked) {
      this.warn(`started ignoring events due to too many file change events at once (incoming: ${filteredEvents.length}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
    } else {
      if (this.throttledFileChangesEmitter.pending > 0) {
        this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
      }
    }
  }
  async existsChildStrictCase(path) {
    if (isLinux) {
      return Promises.exists(path);
    }
    try {
      const pathBasename = basename(path);
      const children = await Promises.readdir(dirname(path));
      return children.some((child) => child === pathBasename);
    } catch (error) {
      this.trace(error);
      return false;
    }
  }
  setVerboseLogging(verboseLogging) {
    this.verboseLogging = verboseLogging;
  }
  error(error) {
    if (!this.cts.token.isCancellationRequested) {
      this.onLogMessage?.({ type: "error", message: `[File Watcher (node.js)] ${error}` });
    }
  }
  warn(message) {
    if (!this.cts.token.isCancellationRequested) {
      this.onLogMessage?.({ type: "warn", message: `[File Watcher (node.js)] ${message}` });
    }
  }
  trace(message) {
    if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
      this.onLogMessage?.({ type: "trace", message: `[File Watcher (node.js)] ${message}` });
    }
  }
  traceWithCorrelation(message) {
    if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
      this.trace(`${message}${typeof this.request.correlationId === "number" ? ` <${this.request.correlationId}> ` : ``}`);
    }
  }
  dispose() {
    this.cts.dispose(true);
    super.dispose();
  }
};
// A delay in reacting to file deletes to support
// atomic save operations where a tool may chose
// to delete a file before creating it again for
// an update.
_NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY = 100;
// A delay for collecting file changes from node.js
// before collecting them for coalescing and emitting
// Same delay as used for the recursive watcher.
_NodeJSFileWatcherLibrary.FILE_CHANGES_HANDLER_DELAY = 75;
let NodeJSFileWatcherLibrary = _NodeJSFileWatcherLibrary;
async function watchFileContents(path, onData, onReady, token, bufferSize = 512) {
  const handle = await Promises.open(path, "r");
  const buffer = Buffer.allocUnsafe(bufferSize);
  const cts = new CancellationTokenSource(token);
  let error = void 0;
  let isReading = false;
  const request = { path, excludes: [], recursive: false };
  const watcher = new NodeJSFileWatcherLibrary(request, void 0, (changes) => {
    (async () => {
      for (const { type } of changes) {
        if (type === FileChangeType.UPDATED) {
          if (isReading) {
            return;
          }
          isReading = true;
          try {
            while (!cts.token.isCancellationRequested) {
              const { bytesRead } = await Promises.read(handle, buffer, 0, bufferSize, null);
              if (!bytesRead || cts.token.isCancellationRequested) {
                break;
              }
              onData(buffer.slice(0, bytesRead));
            }
          } catch (err) {
            error = new Error(err);
            cts.dispose(true);
          } finally {
            isReading = false;
          }
        }
      }
    })();
  });
  await watcher.ready;
  onReady();
  return new Promise((resolve, reject) => {
    cts.token.onCancellationRequested(async () => {
      watcher.dispose();
      try {
        await Promises.close(handle);
      } catch (err) {
        error = new Error(err);
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
export {
  NodeJSFileWatcherLibrary,
  watchFileContents
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXG5vZGVcXHdhdGNoZXJcXG5vZGVqc1xcbm9kZWpzV2F0Y2hlckxpYi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHdhdGNoLCBwcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IFJ1bk9uY2VXb3JrZXIsIFRocm90dGxlZFdvcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRoZW5SZWdpc3Rlck9yRGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZU5GQyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25vcm1hbGl6YXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlRmlsdGVyLCBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ01lc3NhZ2UsIGNvYWxlc2NlRXZlbnRzLCBJTm9uUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0LCBwYXJzZVdhdGNoZXJQYXR0ZXJucywgSVJlY3Vyc2l2ZVdhdGNoZXJXaXRoU3Vic2NyaWJlLCBpc0ZpbHRlcmVkLCBpc1dhdGNoUmVxdWVzdFdpdGhDb3JyZWxhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93YXRjaGVyLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IFBhcnNlZFBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcblxuZXhwb3J0IGNsYXNzIE5vZGVKU0ZpbGVXYXRjaGVyTGlicmFyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vIEEgZGVsYXkgaW4gcmVhY3RpbmcgdG8gZmlsZSBkZWxldGVzIHRvIHN1cHBvcnRcblx0Ly8gYXRvbWljIHNhdmUgb3BlcmF0aW9ucyB3aGVyZSBhIHRvb2wgbWF5IGNob3NlXG5cdC8vIHRvIGRlbGV0ZSBhIGZpbGUgYmVmb3JlIGNyZWF0aW5nIGl0IGFnYWluIGZvclxuXHQvLyBhbiB1cGRhdGUuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEZJTEVfREVMRVRFX0hBTkRMRVJfREVMQVkgPSAxMDA7XG5cblx0Ly8gQSBkZWxheSBmb3IgY29sbGVjdGluZyBmaWxlIGNoYW5nZXMgZnJvbSBub2RlLmpzXG5cdC8vIGJlZm9yZSBjb2xsZWN0aW5nIHRoZW0gZm9yIGNvYWxlc2NpbmcgYW5kIGVtaXR0aW5nXG5cdC8vIFNhbWUgZGVsYXkgYXMgdXNlZCBmb3IgdGhlIHJlY3Vyc2l2ZSB3YXRjaGVyLlxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX0NIQU5HRVNfSEFORExFUl9ERUxBWSA9IDc1O1xuXG5cdC8vIFJlZHVjZSBsaWtlbHlob29kIG9mIHNwYW0gZnJvbSBmaWxlIGV2ZW50cyB2aWEgdGhyb3R0bGluZy5cblx0Ly8gVGhlc2UgbnVtYmVycyBhcmUgYSBiaXQgbW9yZSBhZ2dyZXNzaXZlIGNvbXBhcmVkIHRvIHRoZVxuXHQvLyByZWN1cnNpdmUgd2F0Y2hlciBiZWNhdXNlIHdlIGNhbiBoYXZlIG1hbnkgaW5kaXZpZHVhbFxuXHQvLyBub2RlLmpzIHdhdGNoZXJzIHBlciByZXF1ZXN0LlxuXHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNDcyMylcblx0cHJpdmF0ZSByZWFkb25seSB0aHJvdHRsZWRGaWxlQ2hhbmdlc0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkV29ya2VyPElGaWxlQ2hhbmdlPihcblx0XHR7XG5cdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiAxMDAsXHQvLyBvbmx5IHByb2Nlc3MgdXAgdG8gMTAwIGNoYW5nZXMgYXQgb25jZSBiZWZvcmUuLi5cblx0XHRcdHRocm90dGxlRGVsYXk6IDIwMCxcdCAgXHQvLyAuLi5yZXN0aW5nIGZvciAyMDBtcyB1bnRpbCB3ZSBwcm9jZXNzIGV2ZW50cyBhZ2Fpbi4uLlxuXHRcdFx0bWF4QnVmZmVyZWRXb3JrOiAxMDAwMCBcdC8vIC4uLmJ1dCBuZXZlciBidWZmZXJpbmcgbW9yZSB0aGFuIDEwMDAwIGV2ZW50cyBpbiBtZW1vcnlcblx0XHR9LFxuXHRcdGV2ZW50cyA9PiB0aGlzLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnRzKVxuXHQpKTtcblxuXHQvLyBBZ2dyZWdhdGUgZmlsZSBjaGFuZ2VzIG92ZXIgRklMRV9DSEFOR0VTX0hBTkRMRVJfREVMQVlcblx0Ly8gdG8gY29hbGVzY2UgZXZlbnRzIGFuZCByZWR1Y2Ugc3BhbS5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlQ2hhbmdlc0FnZ3JlZ2F0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVdvcmtlcjxJRmlsZUNoYW5nZT4oZXZlbnRzID0+IHRoaXMuaGFuZGxlRmlsZUNoYW5nZXMoZXZlbnRzKSwgTm9kZUpTRmlsZVdhdGNoZXJMaWJyYXJ5LkZJTEVfQ0hBTkdFU19IQU5ETEVSX0RFTEFZKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlczogUGFyc2VkUGF0dGVybltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluY2x1ZGVzOiBQYXJzZWRQYXR0ZXJuW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyOiBGaWxlQ2hhbmdlRmlsdGVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWFsUGF0aCA9IG5ldyBMYXp5KGFzeW5jICgpID0+IHtcblxuXHRcdC8vIFRoaXMgcHJvcGVydHkgaXMgaW50ZW50aW9uYWxseSBgTGF6eWAgYW5kIG5vdCB1c2luZyBgcmVhbGNhc2UoKWAgYXMgdGhlIGNvdW50ZXJwYXJ0XG5cdFx0Ly8gaW4gdGhlIHJlY3Vyc2l2ZSB3YXRjaGVyIGJlY2F1c2Ugb2YgdGhlIGFtb3VudCBvZiBwYXRocyB0aGlzIHdhdGNoZXIgaXMgZGVhbGluZyB3aXRoLlxuXHRcdC8vIFdlIHRyeSBhcyBtdWNoIGFzIHBvc3NpYmxlIHRvIGF2b2lkIGV2ZW4gbmVlZGluZyBgcmVhbHBhdGgoKWAgaWYgd2UgY2FuIGJlY2F1c2UgZXZlblxuXHRcdC8vIHRoYXQgbWV0aG9kIGRvZXMgYW4gYGxzdGF0KClgIHBlciBzZWdtZW50IG9mIHRoZSBwYXRoLlxuXG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMucmVxdWVzdC5wYXRoO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IFByb21pc2VzLnJlYWxwYXRoKHRoaXMucmVxdWVzdC5wYXRoKTtcblxuXHRcdFx0aWYgKHRoaXMucmVxdWVzdC5wYXRoICE9PSByZXN1bHQpIHtcblx0XHRcdFx0dGhpcy50cmFjZShgY29ycmVjdGluZyBhIHBhdGggdG8gd2F0Y2ggdGhhdCBzZWVtcyB0byBiZSBhIHN5bWJvbGljIGxpbmsgKG9yaWdpbmFsOiAke3RoaXMucmVxdWVzdC5wYXRofSwgcmVhbDogJHtyZXN1bHR9KWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcblxuXHRyZWFkb25seSByZWFkeTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcml2YXRlIF9pc1JldXNpbmdSZWN1cnNpdmVXYXRjaGVyID0gZmFsc2U7XG5cdGdldCBpc1JldXNpbmdSZWN1cnNpdmVXYXRjaGVyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNSZXVzaW5nUmVjdXJzaXZlV2F0Y2hlcjsgfVxuXG5cdHByaXZhdGUgZGlkRmFpbCA9IGZhbHNlO1xuXHRnZXQgZmFpbGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5kaWRGYWlsOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXF1ZXN0OiBJTm9uUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVjdXJzaXZlV2F0Y2hlcjogSVJlY3Vyc2l2ZVdhdGNoZXJXaXRoU3Vic2NyaWJlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25EaWRGaWxlc0NoYW5nZTogKGNoYW5nZXM6IElGaWxlQ2hhbmdlW10pID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFdhdGNoRmFpbD86ICgpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkxvZ01lc3NhZ2U/OiAobXNnOiBJTG9nTWVzc2FnZSkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHZlcmJvc2VMb2dnaW5nPzogYm9vbGVhblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaWdub3JlQ2FzZSA9ICFpc0xpbnV4O1xuXHRcdHRoaXMuZXhjbHVkZXMgPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyh0aGlzLnJlcXVlc3QucGF0aCwgdGhpcy5yZXF1ZXN0LmV4Y2x1ZGVzLCBpZ25vcmVDYXNlKTtcblx0XHR0aGlzLmluY2x1ZGVzID0gdGhpcy5yZXF1ZXN0LmluY2x1ZGVzID8gcGFyc2VXYXRjaGVyUGF0dGVybnModGhpcy5yZXF1ZXN0LnBhdGgsIHRoaXMucmVxdWVzdC5pbmNsdWRlcywgaWdub3JlQ2FzZSkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5maWx0ZXIgPSBpc1dhdGNoUmVxdWVzdFdpdGhDb3JyZWxhdGlvbih0aGlzLnJlcXVlc3QpID8gdGhpcy5yZXF1ZXN0LmZpbHRlciA6IHVuZGVmaW5lZDsgLy8gZmlsdGVyaW5nIGlzIG9ubHkgZW5hYmxlZCB3aGVuIGNvcnJlbGF0aW5nIGJlY2F1c2Ugd2F0Y2hlcnMgYXJlIG90aGVyd2lzZSBwb3RlbnRpYWxseSByZXVzZWRcblxuXHRcdHRoaXMucmVhZHkgPSB0aGlzLndhdGNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdhdGNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvbWlzZXMuc3RhdCh0aGlzLnJlcXVlc3QucGF0aCk7XG5cblx0XHRcdGlmICh0aGlzLmN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoZW5SZWdpc3Rlck9yRGlzcG9zZSh0aGlzLmRvV2F0Y2goc3RhdC5pc0RpcmVjdG9yeSgpKSwgdGhpcy5fc3RvcmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IuY29kZSAhPT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0dGhpcy5lcnJvcihlcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyYWNlKGBpZ25vcmluZyBhIHBhdGggZm9yIHdhdGNoaW5nIHdobydzIHN0YXQgaW5mbyBmYWlsZWQgdG8gcmVzb2x2ZTogJHt0aGlzLnJlcXVlc3QucGF0aH0gKGVycm9yOiAke2Vycm9yfSlgKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5ub3RpZnlXYXRjaEZhaWxlZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbm90aWZ5V2F0Y2hGYWlsZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5kaWRGYWlsID0gdHJ1ZTtcblxuXHRcdHRoaXMub25EaWRXYXRjaEZhaWw/LigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dhdGNoKGlzRGlyZWN0b3J5OiBib29sZWFuKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0aWYgKHRoaXMuZG9XYXRjaFdpdGhFeGlzdGluZ1dhdGNoZXIoaXNEaXJlY3RvcnksIGRpc3Bvc2FibGVzKSkge1xuXHRcdFx0dGhpcy50cmFjZShgcmV1c2luZyBhbiBleGlzdGluZyByZWN1cnNpdmUgd2F0Y2hlciBmb3IgJHt0aGlzLnJlcXVlc3QucGF0aH1gKTtcblx0XHRcdHRoaXMuX2lzUmV1c2luZ1JlY3Vyc2l2ZVdhdGNoZXIgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pc1JldXNpbmdSZWN1cnNpdmVXYXRjaGVyID0gZmFsc2U7XG5cdFx0XHRhd2FpdCB0aGlzLmRvV2F0Y2hXaXRoTm9kZUpTKGlzRGlyZWN0b3J5LCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1dhdGNoV2l0aEV4aXN0aW5nV2F0Y2hlcihpc0RpcmVjdG9yeTogYm9vbGVhbiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0RpcmVjdG9yeSkge1xuXHRcdFx0Ly8gUmVjdXJzaXZlIHdhdGNoZXIgcmUtdXNlIGlzIGN1cnJlbnRseSBub3QgZW5hYmxlZCBmb3Igd2hlblxuXHRcdFx0Ly8gZm9sZGVycyBhcmUgd2F0Y2hlZC4gdGhpcyBpcyBiZWNhdXNlIHRoZSBkaXNwYXRjaGluZyBpbiB0aGVcblx0XHRcdC8vIHJlY3Vyc2l2ZSB3YXRjaGVyIGZvciBub24tcmVjdXJpdmUgcmVxdWVzdHMgaXMgb3B0aW1pemVkIGZvclxuXHRcdFx0Ly8gZmlsZSBjaGFuZ2VzICB3aGVyZSB3ZSByZWFsbHkgb25seSBtYXRjaCBvbiB0aGUgZXhhY3QgcGF0aFxuXHRcdFx0Ly8gYW5kIG5vdCBjaGlsZCBwYXRocy5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKHRoaXMucmVxdWVzdC5wYXRoKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSB0aGlzLnJlY3Vyc2l2ZVdhdGNoZXI/LnN1YnNjcmliZSh0aGlzLnJlcXVlc3QucGF0aCwgYXN5bmMgKGVycm9yLCBjaGFuZ2UpID0+IHtcblx0XHRcdGlmIChkaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIGFscmVhZHkgZGlzcG9zZWRcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoZW5SZWdpc3Rlck9yRGlzcG9zZSh0aGlzLmRvV2F0Y2goaXNEaXJlY3RvcnkpLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKGNoYW5nZSkge1xuXHRcdFx0XHRpZiAodHlwZW9mIGNoYW5nZS5jSWQgPT09ICdudW1iZXInIHx8IHR5cGVvZiB0aGlzLnJlcXVlc3QuY29ycmVsYXRpb25JZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHQvLyBSZS1lbWl0IHRoaXMgY2hhbmdlIHdpdGggdGhlIGNvcnJlbGF0aW9uIGlkIG9mIHRoZSByZXF1ZXN0XG5cdFx0XHRcdFx0Ly8gc28gdGhhdCB0aGUgY2xpZW50IGNhbiBjb3JyZWxhdGUgdGhlIGV2ZW50IHdpdGggdGhlIHJlcXVlc3Rcblx0XHRcdFx0XHQvLyBwcm9wZXJseS4gV2l0aG91dCBjb3JyZWxhdGlvbiwgd2UgZG8gbm90IGhhdmUgdG8gZG8gdGhhdFxuXHRcdFx0XHRcdC8vIGJlY2F1c2UgdGhlIGV2ZW50IHdpbGwgYXBwZWFyIG9uIHRoZSBnbG9iYWwgbGlzdGVuZXIgYWxyZWFkeS5cblx0XHRcdFx0XHR0aGlzLm9uRmlsZUNoYW5nZSh7IHJlc291cmNlLCB0eXBlOiBjaGFuZ2UudHlwZSwgY0lkOiB0aGlzLnJlcXVlc3QuY29ycmVsYXRpb25JZCB9LCB0cnVlIC8qIHNraXAgZXhjbHVkZXMvaW5jbHVkZXMgKGZpbGUgaXMgZXhwbGljaXRseSB3YXRjaGVkKSAqLyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChzdWJzY3JpcHRpb24pIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24pO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV2F0Y2hXaXRoTm9kZUpTKGlzRGlyZWN0b3J5OiBib29sZWFuLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVhbFBhdGggPSBhd2FpdCB0aGlzLnJlYWxQYXRoLnZhbHVlO1xuXG5cdFx0aWYgKHRoaXMuY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1M6IHdhdGNoaW5nIHNhbWJhIHNoYXJlcyBjYW4gY3Jhc2ggVlNDb2RlIHNvIHdlIGRvXG5cdFx0Ly8gYSBzaW1wbGUgY2hlY2sgZm9yIHRoZSBmaWxlIHBhdGggcG9pbnRpbmcgdG8gL1ZvbHVtZXNcblx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNjg3OSlcblx0XHQvLyBUT0RPQGVsZWN0cm9uIHRoaXMgbmVlZHMgYSByZXZpc2l0IHdoZW4gdGhlIGNyYXNoIGlzXG5cdFx0Ly8gZml4ZWQgb3IgbWl0aWdhdGVkIHVwc3RyZWFtLlxuXHRcdGlmIChpc01hY2ludG9zaCAmJiBpc0VxdWFsT3JQYXJlbnQocmVhbFBhdGgsICcvVm9sdW1lcy8nLCB0cnVlKSkge1xuXHRcdFx0dGhpcy5lcnJvcihgUmVmdXNpbmcgdG8gd2F0Y2ggJHtyZWFsUGF0aH0gZm9yIGNoYW5nZXMgdXNpbmcgZnMud2F0Y2goKSBmb3IgcG9zc2libHkgYmVpbmcgYSBuZXR3b3JrIHNoYXJlIHdoZXJlIHdhdGNoaW5nIGlzIHVucmVsaWFibGUgYW5kIHVuc3RhYmxlLmApO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRoaXMuY3RzLnRva2VuKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCB3YXRjaGVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7IC8vIHdlIG5lZWQgYSBzZXBhcmF0ZSBkaXNwb3NhYmxlIHN0b3JlIGJlY2F1c2Ugd2UgcmUtY3JlYXRlIHRoZSB3YXRjaGVyIGZyb20gd2l0aGluIGluIHNvbWUgY2FzZXNcblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2hlckRpc3Bvc2FibGVzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0UmVzb3VyY2UgPSBVUkkuZmlsZSh0aGlzLnJlcXVlc3QucGF0aCk7XG5cdFx0XHRjb25zdCBwYXRoQmFzZW5hbWUgPSBiYXNlbmFtZShyZWFsUGF0aCk7XG5cblx0XHRcdC8vIENyZWF0aW5nIHdhdGNoZXIgY2FuIGZhaWwgd2l0aCBhbiBleGNlcHRpb25cblx0XHRcdGNvbnN0IHdhdGNoZXIgPSB3YXRjaChyZWFsUGF0aCk7XG5cdFx0XHR3YXRjaGVyRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHdhdGNoZXIucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHdhdGNoZXIuY2xvc2UoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy50cmFjZShgU3RhcnRlZCB3YXRjaGluZzogJyR7cmVhbFBhdGh9J2ApO1xuXG5cdFx0XHQvLyBGb2xkZXI6IHJlc29sdmUgY2hpbGRyZW4gdG8gZW1pdCBwcm9wZXIgZXZlbnRzXG5cdFx0XHRjb25zdCBmb2xkZXJDaGlsZHJlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0aWYgKGlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKHJlYWxQYXRoKSkge1xuXHRcdFx0XHRcdFx0Zm9sZGVyQ2hpbGRyZW4uYWRkKGNoaWxkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hcFBhdGhUb1N0YXREaXNwb3NhYmxlID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXHRcdFx0d2F0Y2hlckRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFssIGRpc3Bvc2FibGVdIG9mIG1hcFBhdGhUb1N0YXREaXNwb3NhYmxlKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFwUGF0aFRvU3RhdERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0d2F0Y2hlci5vbignZXJyb3InLCAoY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5lcnJvcihgRmFpbGVkIHRvIHdhdGNoICR7cmVhbFBhdGh9IGZvciBjaGFuZ2VzIHVzaW5nIGZzLndhdGNoKCkgKCR7Y29kZX0sICR7c2lnbmFsfSlgKTtcblxuXHRcdFx0XHR0aGlzLm5vdGlmeVdhdGNoRmFpbGVkKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0d2F0Y2hlci5vbignY2hhbmdlJywgKHR5cGUsIHJhdykgPT4ge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgYWxyZWFkeSBkaXNwb3NlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMudmVyYm9zZUxvZ2dpbmcpIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNlV2l0aENvcnJlbGF0aW9uKGBbcmF3XSBbXCIke3R5cGV9XCJdICR7cmF3fWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTm9ybWFsaXplIGZpbGUgbmFtZVxuXHRcdFx0XHRsZXQgY2hhbmdlZEZpbGVOYW1lID0gJyc7XG5cdFx0XHRcdGlmIChyYXcpIHsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzM4MTkxXG5cdFx0XHRcdFx0Y2hhbmdlZEZpbGVOYW1lID0gcmF3LnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0XHQvLyBNYWM6IHVzZXMgTkZEIHVuaWNvZGUgZm9ybSBvbiBkaXNrLCBidXQgd2Ugd2FudCBORkNcblx0XHRcdFx0XHRcdC8vIFNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjE2NVxuXHRcdFx0XHRcdFx0Y2hhbmdlZEZpbGVOYW1lID0gbm9ybWFsaXplTkZDKGNoYW5nZWRGaWxlTmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFjaGFuZ2VkRmlsZU5hbWUgfHwgKHR5cGUgIT09ICdjaGFuZ2UnICYmIHR5cGUgIT09ICdyZW5hbWUnKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gaWdub3JlIHVuZXhwZWN0ZWQgZXZlbnRzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGb2xkZXJcblx0XHRcdFx0aWYgKGlzRGlyZWN0b3J5KSB7XG5cblx0XHRcdFx0XHQvLyBGb2xkZXIgY2hpbGQgYWRkZWQvZGVsZXRlZFxuXHRcdFx0XHRcdGlmICh0eXBlID09PSAncmVuYW1lJykge1xuXG5cdFx0XHRcdFx0XHQvLyBDYW5jZWwgYW55IHByZXZpb3VzIHN0YXRzIGZvciB0aGlzIGZpbGUgaWYgZXhpc3Rpbmdcblx0XHRcdFx0XHRcdG1hcFBhdGhUb1N0YXREaXNwb3NhYmxlLmdldChjaGFuZ2VkRmlsZU5hbWUpPy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0XHRcdC8vIFdhaXQgYSBiaXQgYW5kIHRyeSBzZWUgaWYgdGhlIGZpbGUgc3RpbGwgZXhpc3RzIG9uIGRpc2tcblx0XHRcdFx0XHRcdC8vIHRvIGRlY2lkZSBvbiB0aGUgcmVzdWx0aW5nIGV2ZW50XG5cdFx0XHRcdFx0XHRjb25zdCB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdG1hcFBhdGhUb1N0YXREaXNwb3NhYmxlLmRlbGV0ZShjaGFuZ2VkRmlsZU5hbWUpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIERlcGVuZGluZyBvbiB0aGUgT1MgdGhlIHdhdGNoZXIgcnVucyBvbiwgdGhlcmVcblx0XHRcdFx0XHRcdFx0Ly8gaXMgZGlmZmVyZW50IGJlaGF2aW91ciBmb3Igd2hlbiB0aGUgd2F0Y2hlZFxuXHRcdFx0XHRcdFx0XHQvLyBmb2xkZXIgcGF0aCBpcyBiZWluZyBkZWxldGVkOlxuXHRcdFx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdFx0XHQvLyAtICAgbWFjT1M6IG5vdCByZXBvcnRlZCBidXQgZXZlbnRzIGNvbnRpbnVlIHRvXG5cdFx0XHRcdFx0XHRcdC8vICAgICAgICAgICAgd29yayBldmVuIHdoZW4gdGhlIGZvbGRlciBpcyBicm91Z2h0XG5cdFx0XHRcdFx0XHRcdC8vICAgICAgICAgICAgYmFjaywgdGhvdWdoIGl0IHNlZW1zIGV2ZXJ5IGNoYW5nZVxuXHRcdFx0XHRcdFx0XHQvLyAgICAgICAgICAgIHRvIGEgZmlsZSBpcyByZXBvcnRlZCBhcyBcInJlbmFtZVwiXG5cdFx0XHRcdFx0XHRcdC8vIC0gICBMaW51eDogXCJyZW5hbWVcIiBldmVudCBpcyByZXBvcnRlZCB3aXRoIHRoZVxuXHRcdFx0XHRcdFx0XHQvLyAgICAgICAgICAgIG5hbWUgb2YgdGhlIGZvbGRlciBhbmQgZXZlbnRzIHN0b3Bcblx0XHRcdFx0XHRcdFx0Ly8gICAgICAgICAgICB3b3JraW5nXG5cdFx0XHRcdFx0XHRcdC8vIC0gV2luZG93czogYW4gRVBFUk0gZXJyb3IgaXMgdGhyb3duIHRoYXQgd2Vcblx0XHRcdFx0XHRcdFx0Ly8gICAgICAgICAgICBoYW5kbGUgZnJvbSB0aGUgYG9uKCdlcnJvcicpYCBldmVudFxuXHRcdFx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBkbyBub3QgcmUtYXR0YWNoIHRoZSB3YXRjaGVyIGFmdGVyIHRpbWVvdXRcblx0XHRcdFx0XHRcdFx0Ly8gdGhvdWdoIGFzIHdlIGRvIGZvciBmaWxlIHdhdGNoZXMgYmVjYXVzZSBmb3Jcblx0XHRcdFx0XHRcdFx0Ly8gZmlsZSB3YXRjaGluZyBzcGVjaWZpY2FsbHkgd2Ugd2FudCB0byBoYW5kbGVcblx0XHRcdFx0XHRcdFx0Ly8gdGhlIGF0b21pYy13cml0ZSBjYXNlcyB3aGVyZSB0aGUgZmlsZSBpcyBiZWluZ1xuXHRcdFx0XHRcdFx0XHQvLyBkZWxldGVkIGFuZCByZWNyZWF0ZWQgd2l0aCBkaWZmZXJlbnQgY29udGVudHMuXG5cdFx0XHRcdFx0XHRcdGlmIChpc0VxdWFsKGNoYW5nZWRGaWxlTmFtZSwgcGF0aEJhc2VuYW1lLCAhaXNMaW51eCkgJiYgIWF3YWl0IFByb21pc2VzLmV4aXN0cyhyZWFsUGF0aCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9uV2F0Y2hlZFBhdGhEZWxldGVkKHJlcXVlc3RSZXNvdXJjZSk7XG5cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gSW4gb3JkZXIgdG8gcHJvcGVybHkgZGV0ZWN0IHJlbmFtZXMgb24gYSBjYXNlLWluc2Vuc2l0aXZlXG5cdFx0XHRcdFx0XHRcdC8vIGZpbGUgc3lzdGVtLCB3ZSBuZWVkIHRvIHVzZSBgZXhpc3RzQ2hpbGRTdHJpY3RDYXNlYCBoZWxwZXJcblx0XHRcdFx0XHRcdFx0Ly8gYmVjYXVzZSBvdGhlcndpc2Ugd2Ugd291bGQgd3JvbmdseSBhc3N1bWUgYSBmaWxlIGV4aXN0c1xuXHRcdFx0XHRcdFx0XHQvLyB3aGVuIGl0IHdhcyByZW5hbWVkIHRvIHNhbWUgbmFtZSBidXQgZGlmZmVyZW50IGNhc2UuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCB0aGlzLmV4aXN0c0NoaWxkU3RyaWN0Q2FzZShqb2luKHJlYWxQYXRoLCBjaGFuZ2VkRmlsZU5hbWUpKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgZGlzcG9zZWQgYnkgbm93XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvLyBGaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGV2ZW50IHR5cGU6XG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgRXhpc3RzOiBlaXRoZXIgJ2FkZGVkJyBvciAndXBkYXRlZCcgaWYga25vd24gYmVmb3JlXG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgRG9lcyBub3QgRXhpc3Q6IGFsd2F5cyAnZGVsZXRlZCdcblx0XHRcdFx0XHRcdFx0bGV0IHR5cGU6IEZpbGVDaGFuZ2VUeXBlO1xuXHRcdFx0XHRcdFx0XHRpZiAoZmlsZUV4aXN0cykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChmb2xkZXJDaGlsZHJlbi5oYXMoY2hhbmdlZEZpbGVOYW1lKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZSA9IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQ7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGUgPSBGaWxlQ2hhbmdlVHlwZS5BRERFRDtcblx0XHRcdFx0XHRcdFx0XHRcdGZvbGRlckNoaWxkcmVuLmFkZChjaGFuZ2VkRmlsZU5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRmb2xkZXJDaGlsZHJlbi5kZWxldGUoY2hhbmdlZEZpbGVOYW1lKTtcblx0XHRcdFx0XHRcdFx0XHR0eXBlID0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRDtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHRoaXMub25GaWxlQ2hhbmdlKHsgcmVzb3VyY2U6IGpvaW5QYXRoKHJlcXVlc3RSZXNvdXJjZSwgY2hhbmdlZEZpbGVOYW1lKSwgdHlwZSwgY0lkOiB0aGlzLnJlcXVlc3QuY29ycmVsYXRpb25JZCB9KTtcblx0XHRcdFx0XHRcdH0sIE5vZGVKU0ZpbGVXYXRjaGVyTGlicmFyeS5GSUxFX0RFTEVURV9IQU5ETEVSX0RFTEFZKTtcblxuXHRcdFx0XHRcdFx0bWFwUGF0aFRvU3RhdERpc3Bvc2FibGUuc2V0KGNoYW5nZWRGaWxlTmFtZSwgdG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZvbGRlciBjaGlsZCBjaGFuZ2VkXG5cdFx0XHRcdFx0ZWxzZSB7XG5cblx0XHRcdFx0XHRcdC8vIEZpZ3VyZSBvdXQgdGhlIGNvcnJlY3QgZXZlbnQgdHlwZTogaWYgdGhpcyBpcyB0aGVcblx0XHRcdFx0XHRcdC8vIGZpcnN0IHRpbWUgd2Ugc2VlIHRoaXMgY2hpbGQsIGl0IGNhbiBvbmx5IGJlIGFkZGVkXG5cdFx0XHRcdFx0XHRsZXQgdHlwZTogRmlsZUNoYW5nZVR5cGU7XG5cdFx0XHRcdFx0XHRpZiAoZm9sZGVyQ2hpbGRyZW4uaGFzKGNoYW5nZWRGaWxlTmFtZSkpIHtcblx0XHRcdFx0XHRcdFx0dHlwZSA9IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQ7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0eXBlID0gRmlsZUNoYW5nZVR5cGUuQURERUQ7XG5cdFx0XHRcdFx0XHRcdGZvbGRlckNoaWxkcmVuLmFkZChjaGFuZ2VkRmlsZU5hbWUpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLm9uRmlsZUNoYW5nZSh7IHJlc291cmNlOiBqb2luUGF0aChyZXF1ZXN0UmVzb3VyY2UsIGNoYW5nZWRGaWxlTmFtZSksIHR5cGUsIGNJZDogdGhpcy5yZXF1ZXN0LmNvcnJlbGF0aW9uSWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmlsZVxuXHRcdFx0XHRlbHNlIHtcblxuXHRcdFx0XHRcdC8vIEZpbGUgYWRkZWQvZGVsZXRlZFxuXHRcdFx0XHRcdGlmICh0eXBlID09PSAncmVuYW1lJyB8fCAhaXNFcXVhbChjaGFuZ2VkRmlsZU5hbWUsIHBhdGhCYXNlbmFtZSwgIWlzTGludXgpKSB7XG5cblx0XHRcdFx0XHRcdC8vIERlcGVuZGluZyBvbiB0aGUgT1MgdGhlIHdhdGNoZXIgcnVucyBvbiwgdGhlcmVcblx0XHRcdFx0XHRcdC8vIGlzIGRpZmZlcmVudCBiZWhhdmlvdXIgZm9yIHdoZW4gdGhlIHdhdGNoZWRcblx0XHRcdFx0XHRcdC8vIGZpbGUgcGF0aCBpcyBiZWluZyBkZWxldGVkOlxuXHRcdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHRcdC8vIC0gICBtYWNPUzogXCJyZW5hbWVcIiBldmVudCBpcyByZXBvcnRlZCBhbmQgZXZlbnRzXG5cdFx0XHRcdFx0XHQvLyAgICAgICAgICAgIHN0b3Agd29ya2luZ1xuXHRcdFx0XHRcdFx0Ly8gLSAgIExpbnV4OiBcInJlbmFtZVwiIGV2ZW50IGlzIHJlcG9ydGVkIGFuZCBldmVudHNcblx0XHRcdFx0XHRcdC8vICAgICAgICAgICAgc3RvcCB3b3JraW5nXG5cdFx0XHRcdFx0XHQvLyAtIFdpbmRvd3M6IFwicmVuYW1lXCIgZXZlbnQgaXMgcmVwb3J0ZWQgYW5kIGV2ZW50c1xuXHRcdFx0XHRcdFx0Ly8gICAgICAgICAgICBjb250aW51ZSB0byB3b3JrIHdoZW4gZmlsZSBpcyByZXN0b3JlZFxuXHRcdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHRcdC8vIEFzIG9wcG9zZWQgdG8gZm9sZGVyIHdhdGNoaW5nLCB3ZSByZS1hdHRhY2ggdGhlXG5cdFx0XHRcdFx0XHQvLyB3YXRjaGVyIGFmdGVyIGJyaWVmIHRpbWVvdXQgdG8gc3VwcG9ydCBcImF0b21pYyBzYXZlXCJcblx0XHRcdFx0XHRcdC8vIG9wZXJhdGlvbnMgd2hlcmUgYSB0b29sIG1heSBkZWNpZGUgdG8gZGVsZXRlIGEgZmlsZVxuXHRcdFx0XHRcdFx0Ly8gYW5kIHRoZW4gY3JlYXRlIGl0IHdpdGggdGhlIHVwZGF0ZWQgY29udGVudHMuXG5cdFx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdFx0Ly8gRGlmZmVyZW50IHRvIGZvbGRlciB3YXRjaGluZywgd2UgZW1pdCBhIGRlbGV0ZSBldmVudFxuXHRcdFx0XHRcdFx0Ly8gdGhvdWdoIHdlIG5ldmVyIGRldGVjdCB3aGVuIHRoZSBmaWxlIGlzIGJyb3VnaHQgYmFja1xuXHRcdFx0XHRcdFx0Ly8gYmVjYXVzZSB0aGUgd2F0Y2hlciBpcyBkaXNwb3NlZCB0aGVuLlxuXG5cdFx0XHRcdFx0XHRjb25zdCB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCBQcm9taXNlcy5leGlzdHMocmVhbFBhdGgpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBpZiBkaXNwb3NlZCBieSBub3dcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgc3RpbGwgZXhpc3RzLCBzbyBlbWl0IGFzIGNoYW5nZSBldmVudCBhbmQgcmVhcHBseSB0aGUgd2F0Y2hlclxuXHRcdFx0XHRcdFx0XHRpZiAoZmlsZUV4aXN0cykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMub25GaWxlQ2hhbmdlKHsgcmVzb3VyY2U6IHJlcXVlc3RSZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgY0lkOiB0aGlzLnJlcXVlc3QuY29ycmVsYXRpb25JZCB9LCB0cnVlIC8qIHNraXAgZXhjbHVkZXMvaW5jbHVkZXMgKGZpbGUgaXMgZXhwbGljaXRseSB3YXRjaGVkKSAqLyk7XG5cblx0XHRcdFx0XHRcdFx0XHR3YXRjaGVyRGlzcG9zYWJsZXMuYWRkKGF3YWl0IHRoaXMuZG9XYXRjaChmYWxzZSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gRmlsZSBzZWVtcyB0byBiZSByZWFsbHkgZ29uZSwgc28gZW1pdCBhIGRlbGV0ZWQgYW5kIGZhaWxlZCBldmVudFxuXHRcdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9uV2F0Y2hlZFBhdGhEZWxldGVkKHJlcXVlc3RSZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sIE5vZGVKU0ZpbGVXYXRjaGVyTGlicmFyeS5GSUxFX0RFTEVURV9IQU5ETEVSX0RFTEFZKTtcblxuXHRcdFx0XHRcdFx0Ly8gVmVyeSBpbXBvcnRhbnQgdG8gZGlzcG9zZSB0aGUgd2F0Y2hlciB3aGljaCBub3cgcG9pbnRzIHRvIGEgc3RhbGUgaW5vZGVcblx0XHRcdFx0XHRcdC8vIGFuZCB3aXJlIGluIGEgbmV3IGRpc3Bvc2FibGUgdGhhdCB0cmFja3Mgb3VyIHRpbWVvdXQgdGhhdCBpcyBpbnN0YWxsZWRcblx0XHRcdFx0XHRcdHdhdGNoZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdFx0d2F0Y2hlckRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRmlsZSBjaGFuZ2VkXG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uRmlsZUNoYW5nZSh7IHJlc291cmNlOiByZXF1ZXN0UmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIGNJZDogdGhpcy5yZXF1ZXN0LmNvcnJlbGF0aW9uSWQgfSwgdHJ1ZSAvKiBza2lwIGV4Y2x1ZGVzL2luY2x1ZGVzIChmaWxlIGlzIGV4cGxpY2l0bHkgd2F0Y2hlZCkgKi8pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVycm9yKGBGYWlsZWQgdG8gd2F0Y2ggJHtyZWFsUGF0aH0gZm9yIGNoYW5nZXMgdXNpbmcgZnMud2F0Y2goKSAoJHtlcnJvci50b1N0cmluZygpfSlgKTtcblxuXHRcdFx0dGhpcy5ub3RpZnlXYXRjaEZhaWxlZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25XYXRjaGVkUGF0aERlbGV0ZWQocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMud2FybignV2F0Y2hlciBzaHV0ZG93biBiZWNhdXNlIHdhdGNoZWQgcGF0aCBnb3QgZGVsZXRlZCcpO1xuXG5cdFx0Ly8gRW1pdCBldmVudHMgYW5kIGZsdXNoIGluIGNhc2UgdGhlIHdhdGNoZXIgZ2V0cyBkaXNwb3NlZFxuXHRcdHRoaXMub25GaWxlQ2hhbmdlKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIGNJZDogdGhpcy5yZXF1ZXN0LmNvcnJlbGF0aW9uSWQgfSwgdHJ1ZSAvKiBza2lwIGV4Y2x1ZGVzL2luY2x1ZGVzIChmaWxlIGlzIGV4cGxpY2l0bHkgd2F0Y2hlZCkgKi8pO1xuXHRcdHRoaXMuZmlsZUNoYW5nZXNBZ2dyZWdhdG9yLmZsdXNoKCk7XG5cblx0XHR0aGlzLm5vdGlmeVdhdGNoRmFpbGVkKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRmlsZUNoYW5nZShldmVudDogSUZpbGVDaGFuZ2UsIHNraXBJbmNsdWRlRXhjbHVkZUNoZWNrcyA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTG9nZ2luZ1xuXHRcdGlmICh0aGlzLnZlcmJvc2VMb2dnaW5nKSB7XG5cdFx0XHR0aGlzLnRyYWNlV2l0aENvcnJlbGF0aW9uKGAke2V2ZW50LnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLkFEREVEID8gJ1tBRERFRF0nIDogZXZlbnQudHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCA/ICdbREVMRVRFRF0nIDogJ1tDSEFOR0VEXSd9ICR7ZXZlbnQucmVzb3VyY2UuZnNQYXRofWApO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0byBhZ2dyZWdhdG9yIHVubGVzcyBleGNsdWRlZCBvciBub3QgaW5jbHVkZWQgKG5vdCBpZiBleHBsaWNpdGx5IGRpc2FibGVkKVxuXHRcdGlmICghc2tpcEluY2x1ZGVFeGNsdWRlQ2hlY2tzICYmIHRoaXMuZXhjbHVkZXMuc29tZShleGNsdWRlID0+IGV4Y2x1ZGUoZXZlbnQucmVzb3VyY2UuZnNQYXRoKSkpIHtcblx0XHRcdGlmICh0aGlzLnZlcmJvc2VMb2dnaW5nKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VXaXRoQ29ycmVsYXRpb24oYCA+PiBpZ25vcmVkIChleGNsdWRlZCkgJHtldmVudC5yZXNvdXJjZS5mc1BhdGh9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghc2tpcEluY2x1ZGVFeGNsdWRlQ2hlY2tzICYmIHRoaXMuaW5jbHVkZXMgJiYgdGhpcy5pbmNsdWRlcy5sZW5ndGggPiAwICYmICF0aGlzLmluY2x1ZGVzLnNvbWUoaW5jbHVkZSA9PiBpbmNsdWRlKGV2ZW50LnJlc291cmNlLmZzUGF0aCkpKSB7XG5cdFx0XHRpZiAodGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0XHR0aGlzLnRyYWNlV2l0aENvcnJlbGF0aW9uKGAgPj4gaWdub3JlZCAobm90IGluY2x1ZGVkKSAke2V2ZW50LnJlc291cmNlLmZzUGF0aH1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWxlQ2hhbmdlc0FnZ3JlZ2F0b3Iud29yayhldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVGaWxlQ2hhbmdlcyhmaWxlQ2hhbmdlczogSUZpbGVDaGFuZ2VbXSk6IHZvaWQge1xuXG5cdFx0Ly8gQ29hbGVzY2UgZXZlbnRzOiBtZXJnZSBldmVudHMgb2Ygc2FtZSBraW5kXG5cdFx0Y29uc3QgY29hbGVzY2VkRmlsZUNoYW5nZXMgPSBjb2FsZXNjZUV2ZW50cyhmaWxlQ2hhbmdlcyk7XG5cblx0XHQvLyBGaWx0ZXIgZXZlbnRzOiBiYXNlZCBvbiByZXF1ZXN0IGZpbHRlciBwcm9wZXJ0eVxuXHRcdGNvbnN0IGZpbHRlcmVkRXZlbnRzOiBJRmlsZUNoYW5nZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBldmVudCBvZiBjb2FsZXNjZWRGaWxlQ2hhbmdlcykge1xuXHRcdFx0aWYgKGlzRmlsdGVyZWQoZXZlbnQsIHRoaXMuZmlsdGVyKSkge1xuXHRcdFx0XHRpZiAodGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0XHRcdHRoaXMudHJhY2VXaXRoQ29ycmVsYXRpb24oYCA+PiBpZ25vcmVkIChmaWx0ZXJlZCkgJHtldmVudC5yZXNvdXJjZS5mc1BhdGh9YCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0ZmlsdGVyZWRFdmVudHMucHVzaChldmVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbHRlcmVkRXZlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIExvZ2dpbmdcblx0XHRpZiAodGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBmaWx0ZXJlZEV2ZW50cykge1xuXHRcdFx0XHR0aGlzLnRyYWNlV2l0aENvcnJlbGF0aW9uKGAgPj4gbm9ybWFsaXplZCAke2V2ZW50LnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLkFEREVEID8gJ1tBRERFRF0nIDogZXZlbnQudHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCA/ICdbREVMRVRFRF0nIDogJ1tDSEFOR0VEXSd9ICR7ZXZlbnQucmVzb3VyY2UuZnNQYXRofWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJyb2FkY2FzdCB0byBjbGllbnRzIHZpYSB0aHJvdHRsZWQgZW1pdHRlclxuXHRcdGNvbnN0IHdvcmtlZCA9IHRoaXMudGhyb3R0bGVkRmlsZUNoYW5nZXNFbWl0dGVyLndvcmsoZmlsdGVyZWRFdmVudHMpO1xuXG5cdFx0Ly8gTG9nZ2luZ1xuXHRcdGlmICghd29ya2VkKSB7XG5cdFx0XHR0aGlzLndhcm4oYHN0YXJ0ZWQgaWdub3JpbmcgZXZlbnRzIGR1ZSB0byB0b28gbWFueSBmaWxlIGNoYW5nZSBldmVudHMgYXQgb25jZSAoaW5jb21pbmc6ICR7ZmlsdGVyZWRFdmVudHMubGVuZ3RofSwgbW9zdCByZWNlbnQgY2hhbmdlOiAke2ZpbHRlcmVkRXZlbnRzWzBdLnJlc291cmNlLmZzUGF0aH0pLiBVc2UgJ2ZpbGVzLndhdGNoZXJFeGNsdWRlJyBzZXR0aW5nIHRvIGV4Y2x1ZGUgZm9sZGVycyB3aXRoIGxvdHMgb2YgY2hhbmdpbmcgZmlsZXMgKGUuZy4gY29tcGlsYXRpb24gb3V0cHV0KS5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudGhyb3R0bGVkRmlsZUNoYW5nZXNFbWl0dGVyLnBlbmRpbmcgPiAwKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYHN0YXJ0ZWQgdGhyb3R0bGluZyBldmVudHMgZHVlIHRvIGxhcmdlIGFtb3VudCBvZiBmaWxlIGNoYW5nZSBldmVudHMgYXQgb25jZSAocGVuZGluZzogJHt0aGlzLnRocm90dGxlZEZpbGVDaGFuZ2VzRW1pdHRlci5wZW5kaW5nfSwgbW9zdCByZWNlbnQgY2hhbmdlOiAke2ZpbHRlcmVkRXZlbnRzWzBdLnJlc291cmNlLmZzUGF0aH0pLiBVc2UgJ2ZpbGVzLndhdGNoZXJFeGNsdWRlJyBzZXR0aW5nIHRvIGV4Y2x1ZGUgZm9sZGVycyB3aXRoIGxvdHMgb2YgY2hhbmdpbmcgZmlsZXMgKGUuZy4gY29tcGlsYXRpb24gb3V0cHV0KS5gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4aXN0c0NoaWxkU3RyaWN0Q2FzZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2VzLmV4aXN0cyhwYXRoKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGF0aEJhc2VuYW1lID0gYmFzZW5hbWUocGF0aCk7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoZGlybmFtZShwYXRoKSk7XG5cblx0XHRcdHJldHVybiBjaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkID09PSBwYXRoQmFzZW5hbWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGVycm9yKTtcblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNldFZlcmJvc2VMb2dnaW5nKHZlcmJvc2VMb2dnaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy52ZXJib3NlTG9nZ2luZyA9IHZlcmJvc2VMb2dnaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBlcnJvcihlcnJvcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5vbkxvZ01lc3NhZ2U/Lih7IHR5cGU6ICdlcnJvcicsIG1lc3NhZ2U6IGBbRmlsZSBXYXRjaGVyIChub2RlLmpzKV0gJHtlcnJvcn1gIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgd2FybihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLm9uTG9nTWVzc2FnZT8uKHsgdHlwZTogJ3dhcm4nLCBtZXNzYWdlOiBgW0ZpbGUgV2F0Y2hlciAobm9kZS5qcyldICR7bWVzc2FnZX1gIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiB0aGlzLnZlcmJvc2VMb2dnaW5nKSB7XG5cdFx0XHR0aGlzLm9uTG9nTWVzc2FnZT8uKHsgdHlwZTogJ3RyYWNlJywgbWVzc2FnZTogYFtGaWxlIFdhdGNoZXIgKG5vZGUuanMpXSAke21lc3NhZ2V9YCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlV2l0aENvcnJlbGF0aW9uKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgdGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0dGhpcy50cmFjZShgJHttZXNzYWdlfSR7dHlwZW9mIHRoaXMucmVxdWVzdC5jb3JyZWxhdGlvbklkID09PSAnbnVtYmVyJyA/IGAgPCR7dGhpcy5yZXF1ZXN0LmNvcnJlbGF0aW9uSWR9PiBgIDogYGB9YCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmN0cy5kaXNwb3NlKHRydWUpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogV2F0Y2ggdGhlIHByb3ZpZGVkIGBwYXRoYCBmb3IgY2hhbmdlcyBhbmQgcmV0dXJuXG4gKiB0aGUgZGF0YSBpbiBjaHVua3Mgb2YgYFVpbnQ4QXJyYXlgIGZvciBmdXJ0aGVyIHVzZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhdGNoRmlsZUNvbnRlbnRzKHBhdGg6IHN0cmluZywgb25EYXRhOiAoY2h1bms6IFVpbnQ4QXJyYXkpID0+IHZvaWQsIG9uUmVhZHk6ICgpID0+IHZvaWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgYnVmZmVyU2l6ZSA9IDUxMik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBoYW5kbGUgPSBhd2FpdCBQcm9taXNlcy5vcGVuKHBhdGgsICdyJyk7XG5cdGNvbnN0IGJ1ZmZlciA9IEJ1ZmZlci5hbGxvY1Vuc2FmZShidWZmZXJTaXplKTtcblxuXHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXG5cdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBpc1JlYWRpbmcgPSBmYWxzZTtcblxuXHRjb25zdCByZXF1ZXN0OiBJTm9uUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0ID0geyBwYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfTtcblx0Y29uc3Qgd2F0Y2hlciA9IG5ldyBOb2RlSlNGaWxlV2F0Y2hlckxpYnJhcnkocmVxdWVzdCwgdW5kZWZpbmVkLCBjaGFuZ2VzID0+IHtcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IHR5cGUgfSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdGlmICh0eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSB7XG5cblx0XHRcdFx0XHRpZiAoaXNSZWFkaW5nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSBpZiB3ZSBhcmUgYWxyZWFkeSByZWFkaW5nIHRoZSBvdXRwdXRcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpc1JlYWRpbmcgPSB0cnVlO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdC8vIENvbnN1bWUgdGhlIG5ldyBjb250ZW50cyBvZiB0aGUgZmlsZSB1bnRpbCBmaW5pc2hlZFxuXHRcdFx0XHRcdFx0Ly8gZXZlcnl0aW1lIHRoZXJlIGlzIGEgY2hhbmdlIGV2ZW50IHNpZ25hbGxpbmcgYSBjaGFuZ2Vcblx0XHRcdFx0XHRcdHdoaWxlICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgYnl0ZXNSZWFkIH0gPSBhd2FpdCBQcm9taXNlcy5yZWFkKGhhbmRsZSwgYnVmZmVyLCAwLCBidWZmZXJTaXplLCBudWxsKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFieXRlc1JlYWQgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRvbkRhdGEoYnVmZmVyLnNsaWNlKDAsIGJ5dGVzUmVhZCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0ZXJyb3IgPSBuZXcgRXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRpc1JlYWRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSgpO1xuXHR9KTtcblxuXHRhd2FpdCB3YXRjaGVyLnJlYWR5O1xuXHRvblJlYWR5KCk7XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0d2F0Y2hlci5kaXNwb3NlKCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLmNsb3NlKGhhbmRsZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXJyb3IgPSBuZXcgRXJyb3IoZXJyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxPQUFPLGdCQUFnQjtBQUNoQyxTQUFTLGVBQWUsdUJBQXVCO0FBQy9DLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsWUFBWSxpQkFBOEIsdUJBQXVCLG9CQUFvQjtBQUM5RixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTJCLHNCQUFtQztBQUM5RCxTQUFzQixnQkFBMkMsc0JBQXNELFlBQVkscUNBQXFDO0FBQ3hLLFNBQVMsWUFBWTtBQUdkLE1BQU0sNEJBQU4sTUFBTSxrQ0FBaUMsV0FBVztBQUFBLEVBbUV4RCxZQUNrQixTQUNBLGtCQUNBLGtCQUNBLGdCQUNBLGNBQ1QsZ0JBQ1A7QUFDRCxVQUFNO0FBUFc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNUO0FBdkRUO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQiw4QkFBOEIsS0FBSyxVQUFVLElBQUk7QUFBQSxNQUNqRTtBQUFBLFFBQ0Msa0JBQWtCO0FBQUE7QUFBQSxRQUNsQixlQUFlO0FBQUE7QUFBQSxRQUNmLGlCQUFpQjtBQUFBO0FBQUEsTUFDbEI7QUFBQSxNQUNBLFlBQVUsS0FBSyxpQkFBaUIsTUFBTTtBQUFBLElB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
