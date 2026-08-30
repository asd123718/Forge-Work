import parcelWatcher from "@parcel/watcher";
import { promises } from "fs";
import { tmpdir, homedir } from "os";
import { URI } from "../../../../../base/common/uri.js";
import { DeferredPromise, RunOnceScheduler, RunOnceWorker, ThrottledWorker } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { randomPath, isEqual, isEqualOrParent } from "../../../../../base/common/extpath.js";
import { GLOBSTAR, patternsEquals } from "../../../../../base/common/glob.js";
import { BaseWatcher } from "../baseWatcher.js";
import { TernarySearchTree } from "../../../../../base/common/ternarySearchTree.js";
import { normalizeNFC } from "../../../../../base/common/normalization.js";
import { normalize, join } from "../../../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../../../base/common/platform.js";
import { Promises, realcase } from "../../../../../base/node/pfs.js";
import { FileChangeType } from "../../../common/files.js";
import { coalesceEvents, parseWatcherPatterns, isFiltered } from "../../../common/watcher.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
class ParcelWatcherInstance extends Disposable {
  constructor(ready, request, restarts, token, worker, stopFn) {
    super();
    this.ready = ready;
    this.request = request;
    this.restarts = restarts;
    this.token = token;
    this.worker = worker;
    this.stopFn = stopFn;
    this._onDidStop = this._register(new Emitter());
    this.onDidStop = this._onDidStop.event;
    this._onDidFail = this._register(new Emitter());
    this.onDidFail = this._onDidFail.event;
    this.didFail = false;
    this.didStop = false;
    this.subscriptions = /* @__PURE__ */ new Map();
    const ignoreCase = !isLinux;
    this.includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes, ignoreCase) : void 0;
    this.excludes = this.request.excludes ? parseWatcherPatterns(this.request.path, this.request.excludes, ignoreCase) : void 0;
    this._register(toDisposable(() => this.subscriptions.clear()));
  }
  get failed() {
    return this.didFail;
  }
  get stopped() {
    return this.didStop;
  }
  subscribe(path, callback) {
    path = URI.file(path).fsPath;
    let subscriptions = this.subscriptions.get(path);
    if (!subscriptions) {
      subscriptions = /* @__PURE__ */ new Set();
      this.subscriptions.set(path, subscriptions);
    }
    subscriptions.add(callback);
    return toDisposable(() => {
      const subscriptions2 = this.subscriptions.get(path);
      if (subscriptions2) {
        subscriptions2.delete(callback);
        if (subscriptions2.size === 0) {
          this.subscriptions.delete(path);
        }
      }
    });
  }
  get subscriptionsCount() {
    return this.subscriptions.size;
  }
  notifyFileChange(path, change) {
    const subscriptions = this.subscriptions.get(path);
    if (subscriptions) {
      for (const subscription of subscriptions) {
        subscription(change);
      }
    }
  }
  notifyWatchFailed() {
    this.didFail = true;
    this._onDidFail.fire();
  }
  include(path) {
    if (!this.includes || this.includes.length === 0) {
      return true;
    }
    return this.includes.some((include) => include(path));
  }
  exclude(path) {
    return Boolean(this.excludes?.some((exclude) => exclude(path)));
  }
  async stop(joinRestart) {
    this.didStop = true;
    try {
      await this.stopFn();
    } finally {
      this._onDidStop.fire({ joinRestart });
      this.dispose();
    }
  }
}
const _ParcelWatcher = class _ParcelWatcher extends BaseWatcher {
  constructor() {
    super();
    this._onDidError = this._register(new Emitter());
    this.onDidError = this._onDidError.event;
    this._watchers = /* @__PURE__ */ new Map();
    // Reduce likelyhood of spam from file events via throttling.
    // (https://github.com/microsoft/vscode/issues/124723)
    this.throttledFileChangesEmitter = this._register(new ThrottledWorker(
      {
        maxWorkChunkSize: 500,
        // only process up to 500 changes at once before...
        throttleDelay: 200,
        // ...resting for 200ms until we process events again...
        maxBufferedWork: 3e4
        // ...but never buffering more than 30000 events in memory
      },
      (events) => this._onDidChangeFile.fire(events)
    ));
    this.enospcErrorLogged = false;
    this.registerListeners();
  }
  get watchers() {
    return this._watchers.values();
  }
  registerListeners() {
    const onUncaughtException = (error) => this.onUnexpectedError(error);
    const onUnhandledRejection = (error) => this.onUnexpectedError(error);
    process.on("uncaughtException", onUncaughtException);
    process.on("unhandledRejection", onUnhandledRejection);
    this._register(toDisposable(() => {
      process.off("uncaughtException", onUncaughtException);
      process.off("unhandledRejection", onUnhandledRejection);
    }));
  }
  async doWatch(requests) {
    requests = await this.removeDuplicateRequests(requests);
    const requestsToStart = [];
    const watchersToStop = new Set(Array.from(this.watchers));
    for (const request of requests) {
      const watcher = this._watchers.get(this.requestToWatcherKey(request));
      if (watcher && patternsEquals(watcher.request.excludes, request.excludes) && patternsEquals(watcher.request.includes, request.includes) && watcher.request.pollingInterval === request.pollingInterval) {
        watchersToStop.delete(watcher);
      } else {
        requestsToStart.push(request);
      }
    }
    if (requestsToStart.length) {
      this.trace(`Request to start watching: ${requestsToStart.map((request) => this.requestToString(request)).join(",")}`);
    }
    if (watchersToStop.size) {
      this.trace(`Request to stop watching: ${Array.from(watchersToStop).map((watcher) => this.requestToString(watcher.request)).join(",")}`);
    }
    for (const watcher of watchersToStop) {
      await this.stopWatching(watcher);
    }
    for (const request of requestsToStart) {
      if (request.pollingInterval) {
        await this.startPolling(request, request.pollingInterval);
      } else {
        await this.startWatching(request);
      }
    }
  }
  requestToWatcherKey(request) {
    return typeof request.correlationId === "number" ? request.correlationId : this.pathToWatcherKey(request.path);
  }
  pathToWatcherKey(path) {
    return isLinux ? path : path.toLowerCase();
  }
  async startPolling(request, pollingInterval, restarts = 0) {
    const cts = new CancellationTokenSource();
    const instance = new DeferredPromise();
    const snapshotFile = randomPath(tmpdir(), "vscode-watcher-snapshot");
    const watcher = new ParcelWatcherInstance(
      instance.p,
      request,
      restarts,
      cts.token,
      new RunOnceWorker((events) => this.handleParcelEvents(events, watcher), _ParcelWatcher.FILE_CHANGES_HANDLER_DELAY),
      async () => {
        cts.dispose(true);
        watcher.worker.flush();
        watcher.worker.dispose();
        pollingWatcher.dispose();
        await promises.unlink(snapshotFile);
      }
    );
    this._watchers.set(this.requestToWatcherKey(request), watcher);
    const { realPath, realPathDiffers, realPathLength } = await this.normalizePath(request);
    this.trace(`Started watching: '${realPath}' with polling interval '${pollingInterval}'`);
    let counter = 0;
    const pollingWatcher = new RunOnceScheduler(async () => {
      counter++;
      if (cts.token.isCancellationRequested) {
        return;
      }
      const parcelWatcherLib = parcelWatcher;
      try {
        if (counter > 1) {
          const parcelEvents = await parcelWatcherLib.getEventsSince(realPath, snapshotFile, { ignore: this.addPredefinedExcludes(request.excludes), backend: _ParcelWatcher.PARCEL_WATCHER_BACKEND });
          if (cts.token.isCancellationRequested) {
            return;
          }
          this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
        }
        await parcelWatcherLib.writeSnapshot(realPath, snapshotFile, { ignore: this.addPredefinedExcludes(request.excludes), backend: _ParcelWatcher.PARCEL_WATCHER_BACKEND });
      } catch (error) {
        this.onUnexpectedError(error, request);
      }
      if (counter === 1) {
        instance.complete();
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      pollingWatcher.schedule();
    }, pollingInterval);
    pollingWatcher.schedule(0);
  }
  async startWatching(request, restarts = 0) {
    const cts = new CancellationTokenSource();
    const instance = new DeferredPromise();
    const watcher = new ParcelWatcherInstance(
      instance.p,
      request,
      restarts,
      cts.token,
      new RunOnceWorker((events) => this.handleParcelEvents(events, watcher), _ParcelWatcher.FILE_CHANGES_HANDLER_DELAY),
      async () => {
        cts.dispose(true);
        watcher.worker.flush();
        watcher.worker.dispose();
        const watcherInstance = await instance.p;
        await watcherInstance?.unsubscribe();
      }
    );
    this._watchers.set(this.requestToWatcherKey(request), watcher);
    const { realPath, realPathDiffers, realPathLength } = await this.normalizePath(request);
    try {
      const parcelWatcherLib = parcelWatcher;
      const parcelWatcherInstance = await parcelWatcherLib.subscribe(realPath, (error, parcelEvents) => {
        if (watcher.token.isCancellationRequested) {
          return;
        }
        if (error) {
          this.onUnexpectedError(error, request);
        }
        this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
      }, {
        backend: _ParcelWatcher.PARCEL_WATCHER_BACKEND,
        ignore: this.addPredefinedExcludes(watcher.request.excludes)
      });
      this.trace(`Started watching: '${realPath}' with backend '${_ParcelWatcher.PARCEL_WATCHER_BACKEND}'`);
      instance.complete(parcelWatcherInstance);
    } catch (error) {
      this.onUnexpectedError(error, request);
      instance.complete(void 0);
      watcher.notifyWatchFailed();
      this._onDidWatchFail.fire(request);
    }
  }
  addPredefinedExcludes(initialExcludes) {
    const excludes = [...initialExcludes];
    const predefinedExcludes = _ParcelWatcher.PREDEFINED_EXCLUDES[process.platform];
    if (Array.isArray(predefinedExcludes)) {
      for (const exclude of predefinedExcludes) {
        if (!excludes.includes(exclude)) {
          excludes.push(exclude);
        }
      }
    }
    return excludes;
  }
  onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength) {
    if (parcelEvents.length === 0) {
      return;
    }
    this.normalizeEvents(parcelEvents, watcher.request, realPathDiffers, realPathLength);
    const includedEvents = this.handleIncludes(watcher, parcelEvents);
    for (const includedEvent of includedEvents) {
      watcher.worker.work(includedEvent);
    }
  }
  handleIncludes(watcher, parcelEvents) {
    const events = [];
    for (const { path, type: parcelEventType } of parcelEvents) {
      const type = _ParcelWatcher.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE.get(parcelEventType);
      if (this.verboseLogging) {
        this.traceWithCorrelation(`${type === FileChangeType.ADDED ? "[ADDED]" : type === FileChangeType.DELETED ? "[DELETED]" : "[CHANGED]"} ${path}`, watcher.request);
      }
      if (!watcher.include(path)) {
        if (this.verboseLogging) {
          this.traceWithCorrelation(` >> ignored (not included) ${path}`, watcher.request);
        }
      } else {
        events.push({ type, resource: URI.file(path), cId: watcher.request.correlationId });
      }
    }
    return events;
  }
  handleParcelEvents(parcelEvents, watcher) {
    const coalescedEvents = coalesceEvents(parcelEvents);
    const { events: filteredEvents, rootDeleted } = this.filterEvents(coalescedEvents, watcher);
    this.emitEvents(filteredEvents, watcher);
    if (rootDeleted) {
      this.onWatchedPathDeleted(watcher);
    }
  }
  emitEvents(events, watcher) {
    if (events.length === 0) {
      return;
    }
    const worked = this.throttledFileChangesEmitter.work(events);
    if (!worked) {
      this.warn(`started ignoring events due to too many file change events at once (incoming: ${events.length}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
    } else {
      if (this.throttledFileChangesEmitter.pending > 0) {
        this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`, watcher);
      }
    }
  }
  async normalizePath(request) {
    let realPath = request.path;
    let realPathDiffers = false;
    let realPathLength = request.path.length;
    try {
      realPath = await Promises.realpath(request.path);
      if (request.path === realPath) {
        realPath = await realcase(request.path) ?? request.path;
      }
      if (request.path !== realPath) {
        realPathLength = realPath.length;
        realPathDiffers = true;
        this.trace(`correcting a path to watch that seems to be a symbolic link or wrong casing (original: ${request.path}, real: ${realPath})`);
      }
    } catch (error) {
    }
    return { realPath, realPathDiffers, realPathLength };
  }
  normalizeEvents(events, request, realPathDiffers, realPathLength) {
    for (const event of events) {
      if (isMacintosh) {
        event.path = normalizeNFC(event.path);
      }
      if (isWindows) {
        if (request.path.length <= 3) {
          event.path = normalize(event.path);
        }
      }
      if (realPathDiffers) {
        event.path = request.path + event.path.substr(realPathLength);
      }
    }
  }
  filterEvents(events, watcher) {
    const filteredEvents = [];
    let rootDeleted = false;
    const filter = this.isCorrelated(watcher.request) ? watcher.request.filter : void 0;
    for (const event of events) {
      if (watcher.subscriptionsCount > 0) {
        watcher.notifyFileChange(event.resource.fsPath, event);
      }
      rootDeleted = event.type === FileChangeType.DELETED && isEqual(event.resource.fsPath, watcher.request.path, !isLinux);
      if (isFiltered(event, filter)) {
        if (this.verboseLogging) {
          this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`, watcher.request);
        }
        continue;
      }
      this.traceEvent(event, watcher.request);
      filteredEvents.push(event);
    }
    return { events: filteredEvents, rootDeleted };
  }
  onWatchedPathDeleted(watcher) {
    this.warn("Watcher shutdown because watched path got deleted", watcher);
    watcher.notifyWatchFailed();
    this._onDidWatchFail.fire(watcher.request);
  }
  onUnexpectedError(error, request) {
    const msg = toErrorMessage(error);
    if (msg.indexOf("No space left on device") !== -1) {
      if (!this.enospcErrorLogged) {
        this.error("Inotify limit reached (ENOSPC)", request);
        this.enospcErrorLogged = true;
      }
    } else if (msg.indexOf("File system must be re-scanned") !== -1) {
      this.error(msg, request);
    } else {
      this.error(`Unexpected error: ${msg} (EUNKNOWN)`, request);
      this._onDidError.fire({ request, error: msg });
    }
  }
  async stop() {
    await super.stop();
    for (const watcher of this.watchers) {
      await this.stopWatching(watcher);
    }
  }
  restartWatching(watcher, delay = 800) {
    const scheduler = new RunOnceScheduler(async () => {
      if (watcher.token.isCancellationRequested) {
        return;
      }
      const restartPromise = new DeferredPromise();
      try {
        await this.stopWatching(watcher, restartPromise.p);
        if (watcher.request.pollingInterval) {
          await this.startPolling(watcher.request, watcher.request.pollingInterval, watcher.restarts + 1);
        } else {
          await this.startWatching(watcher.request, watcher.restarts + 1);
        }
      } finally {
        restartPromise.complete();
      }
    }, delay);
    scheduler.schedule();
    watcher.token.onCancellationRequested(() => scheduler.dispose());
  }
  async stopWatching(watcher, joinRestart) {
    this.trace(`stopping file watcher`, watcher);
    this._watchers.delete(this.requestToWatcherKey(watcher.request));
    try {
      await watcher.stop(joinRestart);
    } catch (error) {
      this.error(`Unexpected error stopping watcher: ${toErrorMessage(error)}`, watcher.request);
    }
  }
  async removeDuplicateRequests(requests, validatePaths = true) {
    requests.sort((requestA, requestB) => requestA.path.length - requestB.path.length);
    const mapCorrelationtoRequests = /* @__PURE__ */ new Map();
    for (const request of requests) {
      if (request.excludes.includes(GLOBSTAR)) {
        continue;
      }
      let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
      if (!requestsForCorrelation) {
        requestsForCorrelation = /* @__PURE__ */ new Map();
        mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
      }
      const path = this.pathToWatcherKey(request.path);
      if (requestsForCorrelation.has(path)) {
        this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
      }
      requestsForCorrelation.set(path, request);
    }
    const normalizedRequests = [];
    for (const requestsForCorrelation of mapCorrelationtoRequests.values()) {
      const requestTrie = TernarySearchTree.forPaths(!isLinux);
      for (const request of requestsForCorrelation.values()) {
        if (requestTrie.findSubstr(request.path)) {
          if (requestTrie.has(request.path)) {
            this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
          } else {
            try {
              if (!(await promises.lstat(request.path)).isSymbolicLink()) {
                this.trace(`ignoring a request for watching who's parent is already watched: ${this.requestToString(request)}`);
                continue;
              }
            } catch (error) {
              this.trace(`ignoring a request for watching who's lstat failed to resolve: ${this.requestToString(request)} (error: ${error})`);
              this._onDidWatchFail.fire(request);
              continue;
            }
          }
        }
        if (validatePaths && !await this.isPathValid(request.path)) {
          this._onDidWatchFail.fire(request);
          continue;
        }
        requestTrie.set(request.path, request);
      }
      normalizedRequests.push(...Array.from(requestTrie).map(([, request]) => request));
    }
    return normalizedRequests;
  }
  async isPathValid(path) {
    try {
      const stat = await promises.stat(path);
      if (!stat.isDirectory()) {
        this.trace(`ignoring a path for watching that is a file and not a folder: ${path}`);
        return false;
      }
    } catch (error) {
      this.trace(`ignoring a path for watching who's stat info failed to resolve: ${path} (error: ${error})`);
      return false;
    }
    return true;
  }
  subscribe(path, callback) {
    for (const watcher of this.watchers) {
      if (watcher.failed) {
        continue;
      }
      if (!isEqualOrParent(path, watcher.request.path, !isLinux)) {
        continue;
      }
      if (watcher.exclude(path) || !watcher.include(path)) {
        continue;
      }
      const disposables = new DisposableStore();
      disposables.add(Event.once(watcher.onDidStop)(async (e) => {
        await e.joinRestart;
        if (disposables.isDisposed) {
          return;
        }
        callback(
          true
          /* error */
        );
      }));
      disposables.add(Event.once(watcher.onDidFail)(() => callback(
        true
        /* error */
      )));
      disposables.add(watcher.subscribe(path, (change) => callback(null, change)));
      return disposables;
    }
    return void 0;
  }
  trace(message, watcher) {
    if (this.verboseLogging) {
      this._onDidLogMessage.fire({ type: "trace", message: this.toMessage(message, watcher?.request) });
    }
  }
  warn(message, watcher) {
    this._onDidLogMessage.fire({ type: "warn", message: this.toMessage(message, watcher?.request) });
  }
  error(message, request) {
    this._onDidLogMessage.fire({ type: "error", message: this.toMessage(message, request) });
  }
  toMessage(message, request) {
    return request ? `[File Watcher ('parcel')] ${message} (path: ${request.path})` : `[File Watcher ('parcel')] ${message}`;
  }
  get recursiveWatcher() {
    return this;
  }
};
_ParcelWatcher.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE = /* @__PURE__ */ new Map(
  [
    ["create", FileChangeType.ADDED],
    ["update", FileChangeType.UPDATED],
    ["delete", FileChangeType.DELETED]
  ]
);
_ParcelWatcher.PREDEFINED_EXCLUDES = {
  "win32": [],
  "darwin": [
    join(homedir(), "Library", "Containers")
    // Triggers access dialog from macOS 14 (https://github.com/microsoft/vscode/issues/208105)
  ],
  "linux": []
};
_ParcelWatcher.PARCEL_WATCHER_BACKEND = isWindows ? "windows" : isLinux ? "inotify" : "fs-events";
// A delay for collecting file changes from Parcel
// before collecting them for coalescing and emitting.
// Parcel internally uses 50ms as delay, so we use 75ms,
// to schedule sufficiently after Parcel.
//
// Note: since Parcel 2.0.7, the very first event is
// emitted without delay if no events occurred over a
// duration of 500ms. But we always want to aggregate
// events to apply our coleasing logic.
//
_ParcelWatcher.FILE_CHANGES_HANDLER_DELAY = 75;
let ParcelWatcher = _ParcelWatcher;
export {
  ParcelWatcher,
  ParcelWatcherInstance
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXG5vZGVcXHdhdGNoZXJcXHBhcmNlbFxccGFyY2VsV2F0Y2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBwYXJjZWxXYXRjaGVyIGZyb20gJ0BwYXJjZWwvd2F0Y2hlcic7XG5pbXBvcnQgeyBwcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciwgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIsIFJ1bk9uY2VXb3JrZXIsIFRocm90dGxlZFdvcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJhbmRvbVBhdGgsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgR0xPQlNUQVIsIFBhcnNlZFBhdHRlcm4sIHBhdHRlcm5zRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBCYXNlV2F0Y2hlciB9IGZyb20gJy4uL2Jhc2VXYXRjaGVyLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplTkZDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbm9ybWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgcmVhbGNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBJRmlsZUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZUV2ZW50cywgSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCwgcGFyc2VXYXRjaGVyUGF0dGVybnMsIElSZWN1cnNpdmVXYXRjaGVyV2l0aFN1YnNjcmliZSwgaXNGaWx0ZXJlZCwgSVdhdGNoZXJFcnJvckV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dhdGNoZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIFBhcmNlbFdhdGNoZXJJbnN0YW5jZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RvcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgam9pblJlc3RhcnQ/OiBQcm9taXNlPHZvaWQ+IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN0b3AgPSB0aGlzLl9vbkRpZFN0b3AuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGYWlsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRmFpbCA9IHRoaXMuX29uRGlkRmFpbC5ldmVudDtcblxuXHRwcml2YXRlIGRpZEZhaWwgPSBmYWxzZTtcblx0Z2V0IGZhaWxlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuZGlkRmFpbDsgfVxuXG5cdHByaXZhdGUgZGlkU3RvcCA9IGZhbHNlO1xuXHRnZXQgc3RvcHBlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuZGlkU3RvcDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5jbHVkZXM6IFBhcnNlZFBhdHRlcm5bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlczogUGFyc2VkUGF0dGVybltdIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8KGNoYW5nZTogSUZpbGVDaGFuZ2UpID0+IHZvaWQ+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8qKlxuXHRcdCAqIFNpZ25hbHMgd2hlbiB0aGUgd2F0Y2hlciBpcyByZWFkeSB0byB3YXRjaC5cblx0XHQgKi9cblx0XHRyZWFkb25seSByZWFkeTogUHJvbWlzZTx1bmtub3duPixcblx0XHRyZWFkb25seSByZXF1ZXN0OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0LFxuXHRcdC8qKlxuXHRcdCAqIEhvdyBvZnRlbiB0aGlzIHdhdGNoZXIgaGFzIGJlZW4gcmVzdGFydGVkIGluIGNhc2Ugb2YgYW4gdW5leHBlY3RlZFxuXHRcdCAqIHNodXRkb3duLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IHJlc3RhcnRzOiBudW1iZXIsXG5cdFx0LyoqXG5cdFx0ICogVGhlIGNhbmNlbGxhdGlvbiB0b2tlbiBhc3NvY2lhdGVkIHdpdGggdGhlIGxpZmVjeWNsZSBvZiB0aGUgd2F0Y2hlci5cblx0XHQgKi9cblx0XHRyZWFkb25seSB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0LyoqXG5cdFx0ICogQW4gZXZlbnQgYWdncmVnYXRvciB0byBjb2FsZXNjZSBldmVudHMgYW5kIHJlZHVjZSBkdXBsaWNhdGVzLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IHdvcmtlcjogUnVuT25jZVdvcmtlcjxJRmlsZUNoYW5nZT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9wRm46ICgpID0+IFByb21pc2U8dm9pZD5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGlnbm9yZUNhc2UgPSAhaXNMaW51eDtcblx0XHR0aGlzLmluY2x1ZGVzID0gdGhpcy5yZXF1ZXN0LmluY2x1ZGVzID8gcGFyc2VXYXRjaGVyUGF0dGVybnModGhpcy5yZXF1ZXN0LnBhdGgsIHRoaXMucmVxdWVzdC5pbmNsdWRlcywgaWdub3JlQ2FzZSkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5leGNsdWRlcyA9IHRoaXMucmVxdWVzdC5leGNsdWRlcyA/IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHRoaXMucmVxdWVzdC5wYXRoLCB0aGlzLnJlcXVlc3QuZXhjbHVkZXMsIGlnbm9yZUNhc2UpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuc3Vic2NyaXB0aW9ucy5jbGVhcigpKSk7XG5cdH1cblxuXHRzdWJzY3JpYmUocGF0aDogc3RyaW5nLCBjYWxsYmFjazogKGNoYW5nZTogSUZpbGVDaGFuZ2UpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cGF0aCA9IFVSSS5maWxlKHBhdGgpLmZzUGF0aDsgLy8gbWFrZSBzdXJlIHRvIHN0b3JlIHRoZSBwYXRoIGluIGBmc1BhdGhgIGZvcm0gdG8gbWF0Y2ggaXQgd2l0aCBldmVudHMgbGF0ZXJcblxuXHRcdGxldCBzdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChwYXRoKTtcblx0XHRpZiAoIXN1YnNjcmlwdGlvbnMpIHtcblx0XHRcdHN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KHBhdGgsIHN1YnNjcmlwdGlvbnMpO1xuXHRcdH1cblxuXHRcdHN1YnNjcmlwdGlvbnMuYWRkKGNhbGxiYWNrKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQocGF0aCk7XG5cdFx0XHRpZiAoc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0XHRzdWJzY3JpcHRpb25zLmRlbGV0ZShjYWxsYmFjayk7XG5cblx0XHRcdFx0aWYgKHN1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuc3Vic2NyaXB0aW9ucy5kZWxldGUocGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldCBzdWJzY3JpcHRpb25zQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zdWJzY3JpcHRpb25zLnNpemU7XG5cdH1cblxuXHRub3RpZnlGaWxlQ2hhbmdlKHBhdGg6IHN0cmluZywgY2hhbmdlOiBJRmlsZUNoYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KHBhdGgpO1xuXHRcdGlmIChzdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBzdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRcdHN1YnNjcmlwdGlvbihjaGFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG5vdGlmeVdhdGNoRmFpbGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlkRmFpbCA9IHRydWU7XG5cblx0XHR0aGlzLl9vbkRpZEZhaWwuZmlyZSgpO1xuXHR9XG5cblx0aW5jbHVkZShwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaW5jbHVkZXMgfHwgdGhpcy5pbmNsdWRlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBubyBzcGVjaWZpYyBpbmNsdWRlcyBkZWZpbmVkLCBpbmNsdWRlIGFsbFxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluY2x1ZGVzLnNvbWUoaW5jbHVkZSA9PiBpbmNsdWRlKHBhdGgpKTtcblx0fVxuXG5cdGV4Y2x1ZGUocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEJvb2xlYW4odGhpcy5leGNsdWRlcz8uc29tZShleGNsdWRlID0+IGV4Y2x1ZGUocGF0aCkpKTtcblx0fVxuXG5cdGFzeW5jIHN0b3Aoam9pblJlc3RhcnQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpZFN0b3AgPSB0cnVlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcEZuKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkU3RvcC5maXJlKHsgam9pblJlc3RhcnQgfSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhcmNlbFdhdGNoZXIgZXh0ZW5kcyBCYXNlV2F0Y2hlciBpbXBsZW1lbnRzIElSZWN1cnNpdmVXYXRjaGVyV2l0aFN1YnNjcmliZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFQX1BBUkNFTF9XQVRDSEVSX0FDVElPTl9UT19GSUxFX0NIQU5HRSA9IG5ldyBNYXA8cGFyY2VsV2F0Y2hlci5FdmVudFR5cGUsIG51bWJlcj4oXG5cdFx0W1xuXHRcdFx0WydjcmVhdGUnLCBGaWxlQ2hhbmdlVHlwZS5BRERFRF0sXG5cdFx0XHRbJ3VwZGF0ZScsIEZpbGVDaGFuZ2VUeXBlLlVQREFURURdLFxuXHRcdFx0WydkZWxldGUnLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEXVxuXHRcdF1cblx0KTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQUkVERUZJTkVEX0VYQ0xVREVTOiB7IFtwbGF0Zm9ybTogc3RyaW5nXTogc3RyaW5nW10gfSA9IHtcblx0XHQnd2luMzInOiBbXSxcblx0XHQnZGFyd2luJzogW1xuXHRcdFx0am9pbihob21lZGlyKCksICdMaWJyYXJ5JywgJ0NvbnRhaW5lcnMnKSAvLyBUcmlnZ2VycyBhY2Nlc3MgZGlhbG9nIGZyb20gbWFjT1MgMTQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDgxMDUpXG5cdFx0XSxcblx0XHQnbGludXgnOiBbXVxuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBBUkNFTF9XQVRDSEVSX0JBQ0tFTkQgPSBpc1dpbmRvd3MgPyAnd2luZG93cycgOiBpc0xpbnV4ID8gJ2lub3RpZnknIDogJ2ZzLWV2ZW50cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXYXRjaGVyRXJyb3JFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRXJyb3IgPSB0aGlzLl9vbkRpZEVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhdGNoZXJzID0gbmV3IE1hcDxzdHJpbmcgLyogcGF0aCAqLyB8IG51bWJlciAvKiBjb3JyZWxhdGlvbiBJRCAqLywgUGFyY2VsV2F0Y2hlckluc3RhbmNlPigpO1xuXHRnZXQgd2F0Y2hlcnMoKSB7IHJldHVybiB0aGlzLl93YXRjaGVycy52YWx1ZXMoKTsgfVxuXG5cdC8vIEEgZGVsYXkgZm9yIGNvbGxlY3RpbmcgZmlsZSBjaGFuZ2VzIGZyb20gUGFyY2VsXG5cdC8vIGJlZm9yZSBjb2xsZWN0aW5nIHRoZW0gZm9yIGNvYWxlc2NpbmcgYW5kIGVtaXR0aW5nLlxuXHQvLyBQYXJjZWwgaW50ZXJuYWxseSB1c2VzIDUwbXMgYXMgZGVsYXksIHNvIHdlIHVzZSA3NW1zLFxuXHQvLyB0byBzY2hlZHVsZSBzdWZmaWNpZW50bHkgYWZ0ZXIgUGFyY2VsLlxuXHQvL1xuXHQvLyBOb3RlOiBzaW5jZSBQYXJjZWwgMi4wLjcsIHRoZSB2ZXJ5IGZpcnN0IGV2ZW50IGlzXG5cdC8vIGVtaXR0ZWQgd2l0aG91dCBkZWxheSBpZiBubyBldmVudHMgb2NjdXJyZWQgb3ZlciBhXG5cdC8vIGR1cmF0aW9uIG9mIDUwMG1zLiBCdXQgd2UgYWx3YXlzIHdhbnQgdG8gYWdncmVnYXRlXG5cdC8vIGV2ZW50cyB0byBhcHBseSBvdXIgY29sZWFzaW5nIGxvZ2ljLlxuXHQvL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX0NIQU5HRVNfSEFORExFUl9ERUxBWSA9IDc1O1xuXG5cdC8vIFJlZHVjZSBsaWtlbHlob29kIG9mIHNwYW0gZnJvbSBmaWxlIGV2ZW50cyB2aWEgdGhyb3R0bGluZy5cblx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjQ3MjMpXG5cdHByaXZhdGUgcmVhZG9ubHkgdGhyb3R0bGVkRmlsZUNoYW5nZXNFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZFdvcmtlcjxJRmlsZUNoYW5nZT4oXG5cdFx0e1xuXHRcdFx0bWF4V29ya0NodW5rU2l6ZTogNTAwLFx0Ly8gb25seSBwcm9jZXNzIHVwIHRvIDUwMCBjaGFuZ2VzIGF0IG9uY2UgYmVmb3JlLi4uXG5cdFx0XHR0aHJvdHRsZURlbGF5OiAyMDAsXHQgIFx0Ly8gLi4ucmVzdGluZyBmb3IgMjAwbXMgdW50aWwgd2UgcHJvY2VzcyBldmVudHMgYWdhaW4uLi5cblx0XHRcdG1heEJ1ZmZlcmVkV29yazogMzAwMDAgXHQvLyAuLi5idXQgbmV2ZXIgYnVmZmVyaW5nIG1vcmUgdGhhbiAzMDAwMCBldmVudHMgaW4gbWVtb3J5XG5cdFx0fSxcblx0XHRldmVudHMgPT4gdGhpcy5fb25EaWRDaGFuZ2VGaWxlLmZpcmUoZXZlbnRzKVxuXHQpKTtcblxuXHRwcml2YXRlIGVub3NwY0Vycm9yTG9nZ2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb25VbmNhdWdodEV4Y2VwdGlvbiA9IChlcnJvcjogdW5rbm93bikgPT4gdGhpcy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0Y29uc3Qgb25VbmhhbmRsZWRSZWplY3Rpb24gPSAoZXJyb3I6IHVua25vd24pID0+IHRoaXMub25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXG5cdFx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBvblVuY2F1Z2h0RXhjZXB0aW9uKTtcblx0XHRwcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCBvblVuaGFuZGxlZFJlamVjdGlvbik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cHJvY2Vzcy5vZmYoJ3VuY2F1Z2h0RXhjZXB0aW9uJywgb25VbmNhdWdodEV4Y2VwdGlvbik7XG5cdFx0XHRwcm9jZXNzLm9mZigndW5oYW5kbGVkUmVqZWN0aW9uJywgb25VbmhhbmRsZWRSZWplY3Rpb24pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb1dhdGNoKHJlcXVlc3RzOiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEZpZ3VyZSBvdXQgZHVwbGljYXRlcyB0byByZW1vdmUgZnJvbSB0aGUgcmVxdWVzdHNcblx0XHRyZXF1ZXN0cyA9IGF3YWl0IHRoaXMucmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMocmVxdWVzdHMpO1xuXG5cdFx0Ly8gRmlndXJlIG91dCB3aGljaCB3YXRjaGVycyB0byBzdGFydCBhbmQgd2hpY2ggdG8gc3RvcFxuXHRcdGNvbnN0IHJlcXVlc3RzVG9TdGFydDogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3Qgd2F0Y2hlcnNUb1N0b3AgPSBuZXcgU2V0KEFycmF5LmZyb20odGhpcy53YXRjaGVycykpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiByZXF1ZXN0cykge1xuXHRcdFx0Y29uc3Qgd2F0Y2hlciA9IHRoaXMuX3dhdGNoZXJzLmdldCh0aGlzLnJlcXVlc3RUb1dhdGNoZXJLZXkocmVxdWVzdCkpO1xuXHRcdFx0aWYgKHdhdGNoZXIgJiYgcGF0dGVybnNFcXVhbHMod2F0Y2hlci5yZXF1ZXN0LmV4Y2x1ZGVzLCByZXF1ZXN0LmV4Y2x1ZGVzKSAmJiBwYXR0ZXJuc0VxdWFscyh3YXRjaGVyLnJlcXVlc3QuaW5jbHVkZXMsIHJlcXVlc3QuaW5jbHVkZXMpICYmIHdhdGNoZXIucmVxdWVzdC5wb2xsaW5nSW50ZXJ2YWwgPT09IHJlcXVlc3QucG9sbGluZ0ludGVydmFsKSB7XG5cdFx0XHRcdHdhdGNoZXJzVG9TdG9wLmRlbGV0ZSh3YXRjaGVyKTsgLy8ga2VlcCB3YXRjaGVyXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXF1ZXN0c1RvU3RhcnQucHVzaChyZXF1ZXN0KTsgLy8gc3RhcnQgd2F0Y2hpbmdcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMb2dnaW5nXG5cdFx0aWYgKHJlcXVlc3RzVG9TdGFydC5sZW5ndGgpIHtcblx0XHRcdHRoaXMudHJhY2UoYFJlcXVlc3QgdG8gc3RhcnQgd2F0Y2hpbmc6ICR7cmVxdWVzdHNUb1N0YXJ0Lm1hcChyZXF1ZXN0ID0+IHRoaXMucmVxdWVzdFRvU3RyaW5nKHJlcXVlc3QpKS5qb2luKCcsJyl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHdhdGNoZXJzVG9TdG9wLnNpemUpIHtcblx0XHRcdHRoaXMudHJhY2UoYFJlcXVlc3QgdG8gc3RvcCB3YXRjaGluZzogJHtBcnJheS5mcm9tKHdhdGNoZXJzVG9TdG9wKS5tYXAod2F0Y2hlciA9PiB0aGlzLnJlcXVlc3RUb1N0cmluZyh3YXRjaGVyLnJlcXVlc3QpKS5qb2luKCcsJyl9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcCB3YXRjaGluZyBhcyBpbnN0cnVjdGVkXG5cdFx0Zm9yIChjb25zdCB3YXRjaGVyIG9mIHdhdGNoZXJzVG9TdG9wKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3BXYXRjaGluZyh3YXRjaGVyKTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCB3YXRjaGluZyBhcyBpbnN0cnVjdGVkXG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzVG9TdGFydCkge1xuXHRcdFx0aWYgKHJlcXVlc3QucG9sbGluZ0ludGVydmFsKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RhcnRQb2xsaW5nKHJlcXVlc3QsIHJlcXVlc3QucG9sbGluZ0ludGVydmFsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RhcnRXYXRjaGluZyhyZXF1ZXN0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlcXVlc3RUb1dhdGNoZXJLZXkocmVxdWVzdDogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCk6IHN0cmluZyB8IG51bWJlciB7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXF1ZXN0LmNvcnJlbGF0aW9uSWQgPT09ICdudW1iZXInID8gcmVxdWVzdC5jb3JyZWxhdGlvbklkIDogdGhpcy5wYXRoVG9XYXRjaGVyS2V5KHJlcXVlc3QucGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIHBhdGhUb1dhdGNoZXJLZXkocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaXNMaW51eCA/IHBhdGggOiBwYXRoLnRvTG93ZXJDYXNlKCkgLyogaWdub3JlIHBhdGggY2FzaW5nICovO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdGFydFBvbGxpbmcocmVxdWVzdDogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCwgcG9sbGluZ0ludGVydmFsOiBudW1iZXIsIHJlc3RhcnRzID0gMCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBzbmFwc2hvdEZpbGUgPSByYW5kb21QYXRoKHRtcGRpcigpLCAndnNjb2RlLXdhdGNoZXItc25hcHNob3QnKTtcblxuXHRcdC8vIFJlbWVtYmVyIGFzIHdhdGNoZXIgaW5zdGFuY2Vcblx0XHRjb25zdCB3YXRjaGVyOiBQYXJjZWxXYXRjaGVySW5zdGFuY2UgPSBuZXcgUGFyY2VsV2F0Y2hlckluc3RhbmNlKFxuXHRcdFx0aW5zdGFuY2UucCxcblx0XHRcdHJlcXVlc3QsXG5cdFx0XHRyZXN0YXJ0cyxcblx0XHRcdGN0cy50b2tlbixcblx0XHRcdG5ldyBSdW5PbmNlV29ya2VyPElGaWxlQ2hhbmdlPihldmVudHMgPT4gdGhpcy5oYW5kbGVQYXJjZWxFdmVudHMoZXZlbnRzLCB3YXRjaGVyKSwgUGFyY2VsV2F0Y2hlci5GSUxFX0NIQU5HRVNfSEFORExFUl9ERUxBWSksXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXG5cdFx0XHRcdHdhdGNoZXIud29ya2VyLmZsdXNoKCk7XG5cdFx0XHRcdHdhdGNoZXIud29ya2VyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRwb2xsaW5nV2F0Y2hlci5kaXNwb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHByb21pc2VzLnVubGluayhzbmFwc2hvdEZpbGUpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fd2F0Y2hlcnMuc2V0KHRoaXMucmVxdWVzdFRvV2F0Y2hlcktleShyZXF1ZXN0KSwgd2F0Y2hlcik7XG5cblx0XHQvLyBQYXRoIGNoZWNrcyBmb3Igc3ltYm9saWMgbGlua3MgLyB3cm9uZyBjYXNpbmdcblx0XHRjb25zdCB7IHJlYWxQYXRoLCByZWFsUGF0aERpZmZlcnMsIHJlYWxQYXRoTGVuZ3RoIH0gPSBhd2FpdCB0aGlzLm5vcm1hbGl6ZVBhdGgocmVxdWVzdCk7XG5cblx0XHR0aGlzLnRyYWNlKGBTdGFydGVkIHdhdGNoaW5nOiAnJHtyZWFsUGF0aH0nIHdpdGggcG9sbGluZyBpbnRlcnZhbCAnJHtwb2xsaW5nSW50ZXJ2YWx9J2ApO1xuXG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgcG9sbGluZ1dhdGNoZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb3VudGVyKys7XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBhbHJlYWR5IHJhbiBiZWZvcmUsIGNoZWNrIGZvciBldmVudHMgc2luY2Vcblx0XHRcdGNvbnN0IHBhcmNlbFdhdGNoZXJMaWIgPSBwYXJjZWxXYXRjaGVyO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGNvdW50ZXIgPiAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyY2VsRXZlbnRzID0gYXdhaXQgcGFyY2VsV2F0Y2hlckxpYi5nZXRFdmVudHNTaW5jZShyZWFsUGF0aCwgc25hcHNob3RGaWxlLCB7IGlnbm9yZTogdGhpcy5hZGRQcmVkZWZpbmVkRXhjbHVkZXMocmVxdWVzdC5leGNsdWRlcyksIGJhY2tlbmQ6IFBhcmNlbFdhdGNoZXIuUEFSQ0VMX1dBVENIRVJfQkFDS0VORCB9KTtcblxuXHRcdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBIYW5kbGUgJiBlbWl0IGV2ZW50c1xuXHRcdFx0XHRcdHRoaXMub25QYXJjZWxFdmVudHMocGFyY2VsRXZlbnRzLCB3YXRjaGVyLCByZWFsUGF0aERpZmZlcnMsIHJlYWxQYXRoTGVuZ3RoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFN0b3JlIGEgc25hcHNob3Qgb2YgZmlsZXMgdG8gdGhlIHNuYXBzaG90IGZpbGVcblx0XHRcdFx0YXdhaXQgcGFyY2VsV2F0Y2hlckxpYi53cml0ZVNuYXBzaG90KHJlYWxQYXRoLCBzbmFwc2hvdEZpbGUsIHsgaWdub3JlOiB0aGlzLmFkZFByZWRlZmluZWRFeGNsdWRlcyhyZXF1ZXN0LmV4Y2x1ZGVzKSwgYmFja2VuZDogUGFyY2VsV2F0Y2hlci5QQVJDRUxfV0FUQ0hFUl9CQUNLRU5EIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvciwgcmVxdWVzdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNpZ25hbCB3ZSBhcmUgcmVhZHkgbm93IHdoZW4gdGhlIGZpcnN0IHNuYXBzaG90IHdhcyB3cml0dGVuXG5cdFx0XHRpZiAoY291bnRlciA9PT0gMSkge1xuXHRcdFx0XHRpbnN0YW5jZS5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2NoZWR1bGUgYWdhaW4gYXQgdGhlIG5leHQgaW50ZXJ2YWxcblx0XHRcdHBvbGxpbmdXYXRjaGVyLnNjaGVkdWxlKCk7XG5cdFx0fSwgcG9sbGluZ0ludGVydmFsKTtcblx0XHRwb2xsaW5nV2F0Y2hlci5zY2hlZHVsZSgwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RhcnRXYXRjaGluZyhyZXF1ZXN0OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0LCByZXN0YXJ0cyA9IDApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxwYXJjZWxXYXRjaGVyLkFzeW5jU3Vic2NyaXB0aW9uIHwgdW5kZWZpbmVkPigpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgYXMgd2F0Y2hlciBpbnN0YW5jZVxuXHRcdGNvbnN0IHdhdGNoZXI6IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSA9IG5ldyBQYXJjZWxXYXRjaGVySW5zdGFuY2UoXG5cdFx0XHRpbnN0YW5jZS5wLFxuXHRcdFx0cmVxdWVzdCxcblx0XHRcdHJlc3RhcnRzLFxuXHRcdFx0Y3RzLnRva2VuLFxuXHRcdFx0bmV3IFJ1bk9uY2VXb3JrZXI8SUZpbGVDaGFuZ2U+KGV2ZW50cyA9PiB0aGlzLmhhbmRsZVBhcmNlbEV2ZW50cyhldmVudHMsIHdhdGNoZXIpLCBQYXJjZWxXYXRjaGVyLkZJTEVfQ0hBTkdFU19IQU5ETEVSX0RFTEFZKSxcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cblx0XHRcdFx0d2F0Y2hlci53b3JrZXIuZmx1c2goKTtcblx0XHRcdFx0d2F0Y2hlci53b3JrZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGNvbnN0IHdhdGNoZXJJbnN0YW5jZSA9IGF3YWl0IGluc3RhbmNlLnA7XG5cdFx0XHRcdGF3YWl0IHdhdGNoZXJJbnN0YW5jZT8udW5zdWJzY3JpYmUoKTtcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX3dhdGNoZXJzLnNldCh0aGlzLnJlcXVlc3RUb1dhdGNoZXJLZXkocmVxdWVzdCksIHdhdGNoZXIpO1xuXG5cdFx0Ly8gUGF0aCBjaGVja3MgZm9yIHN5bWJvbGljIGxpbmtzIC8gd3JvbmcgY2FzaW5nXG5cdFx0Y29uc3QgeyByZWFsUGF0aCwgcmVhbFBhdGhEaWZmZXJzLCByZWFsUGF0aExlbmd0aCB9ID0gYXdhaXQgdGhpcy5ub3JtYWxpemVQYXRoKHJlcXVlc3QpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcmNlbFdhdGNoZXJMaWIgPSBwYXJjZWxXYXRjaGVyO1xuXHRcdFx0Y29uc3QgcGFyY2VsV2F0Y2hlckluc3RhbmNlID0gYXdhaXQgcGFyY2VsV2F0Y2hlckxpYi5zdWJzY3JpYmUocmVhbFBhdGgsIChlcnJvciwgcGFyY2VsRXZlbnRzKSA9PiB7XG5cdFx0XHRcdGlmICh3YXRjaGVyLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgd2hlbiBkaXNwb3NlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW4gYW55IGNhc2Ugb2YgYW4gZXJyb3IsIHRyZWF0IHRoaXMgbGlrZSBhIHVuaGFuZGxlZCBleGNlcHRpb25cblx0XHRcdFx0Ly8gdGhhdCBtaWdodCByZXF1aXJlIHRoZSB3YXRjaGVyIHRvIHJlc3RhcnQuIFdlIGRvIG5vdCByZWFsbHkga25vd1xuXHRcdFx0XHQvLyB0aGUgc3RhdGUgb2YgcGFyY2VsIGF0IHRoaXMgcG9pbnQgYW5kIGFzIHN1Y2ggd2lsbCB0cnkgdG8gcmVzdGFydFxuXHRcdFx0XHQvLyB1cCB0byBvdXIgbWF4aW11bSBvZiByZXN0YXJ0cy5cblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvciwgcmVxdWVzdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIYW5kbGUgJiBlbWl0IGV2ZW50c1xuXHRcdFx0XHR0aGlzLm9uUGFyY2VsRXZlbnRzKHBhcmNlbEV2ZW50cywgd2F0Y2hlciwgcmVhbFBhdGhEaWZmZXJzLCByZWFsUGF0aExlbmd0aCk7XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGJhY2tlbmQ6IFBhcmNlbFdhdGNoZXIuUEFSQ0VMX1dBVENIRVJfQkFDS0VORCxcblx0XHRcdFx0aWdub3JlOiB0aGlzLmFkZFByZWRlZmluZWRFeGNsdWRlcyh3YXRjaGVyLnJlcXVlc3QuZXhjbHVkZXMpXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy50cmFjZShgU3RhcnRlZCB3YXRjaGluZzogJyR7cmVhbFBhdGh9JyB3aXRoIGJhY2tlbmQgJyR7UGFyY2VsV2F0Y2hlci5QQVJDRUxfV0FUQ0hFUl9CQUNLRU5EfSdgKTtcblxuXHRcdFx0aW5zdGFuY2UuY29tcGxldGUocGFyY2VsV2F0Y2hlckluc3RhbmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvciwgcmVxdWVzdCk7XG5cblx0XHRcdGluc3RhbmNlLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cblx0XHRcdHdhdGNoZXIubm90aWZ5V2F0Y2hGYWlsZWQoKTtcblx0XHRcdHRoaXMuX29uRGlkV2F0Y2hGYWlsLmZpcmUocmVxdWVzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRQcmVkZWZpbmVkRXhjbHVkZXMoaW5pdGlhbEV4Y2x1ZGVzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBleGNsdWRlcyA9IFsuLi5pbml0aWFsRXhjbHVkZXNdO1xuXG5cdFx0Y29uc3QgcHJlZGVmaW5lZEV4Y2x1ZGVzID0gUGFyY2VsV2F0Y2hlci5QUkVERUZJTkVEX0VYQ0xVREVTW3Byb2Nlc3MucGxhdGZvcm1dO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHByZWRlZmluZWRFeGNsdWRlcykpIHtcblx0XHRcdGZvciAoY29uc3QgZXhjbHVkZSBvZiBwcmVkZWZpbmVkRXhjbHVkZXMpIHtcblx0XHRcdFx0aWYgKCFleGNsdWRlcy5pbmNsdWRlcyhleGNsdWRlKSkge1xuXHRcdFx0XHRcdGV4Y2x1ZGVzLnB1c2goZXhjbHVkZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZXhjbHVkZXM7XG5cdH1cblxuXHRwcml2YXRlIG9uUGFyY2VsRXZlbnRzKHBhcmNlbEV2ZW50czogcGFyY2VsV2F0Y2hlci5FdmVudFtdLCB3YXRjaGVyOiBQYXJjZWxXYXRjaGVySW5zdGFuY2UsIHJlYWxQYXRoRGlmZmVyczogYm9vbGVhbiwgcmVhbFBhdGhMZW5ndGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChwYXJjZWxFdmVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTm9ybWFsaXplIGV2ZW50czogaGFuZGxlIE5GQyBub3JtYWxpemF0aW9uIGFuZCBzeW1saW5rc1xuXHRcdC8vIEl0IGlzIGltcG9ydGFudCB0byBkbyB0aGlzIGJlZm9yZSBjaGVja2luZyBmb3IgaW5jbHVkZXNcblx0XHQvLyB0byBjaGVjayBvbiB0aGUgb3JpZ2luYWwgcGF0aC5cblx0XHR0aGlzLm5vcm1hbGl6ZUV2ZW50cyhwYXJjZWxFdmVudHMsIHdhdGNoZXIucmVxdWVzdCwgcmVhbFBhdGhEaWZmZXJzLCByZWFsUGF0aExlbmd0aCk7XG5cblx0XHQvLyBDaGVjayBmb3IgaW5jbHVkZXNcblx0XHRjb25zdCBpbmNsdWRlZEV2ZW50cyA9IHRoaXMuaGFuZGxlSW5jbHVkZXMod2F0Y2hlciwgcGFyY2VsRXZlbnRzKTtcblxuXHRcdC8vIEFkZCB0byBldmVudCBhZ2dyZWdhdG9yIGZvciBsYXRlciBwcm9jZXNzaW5nXG5cdFx0Zm9yIChjb25zdCBpbmNsdWRlZEV2ZW50IG9mIGluY2x1ZGVkRXZlbnRzKSB7XG5cdFx0XHR3YXRjaGVyLndvcmtlci53b3JrKGluY2x1ZGVkRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlSW5jbHVkZXMod2F0Y2hlcjogUGFyY2VsV2F0Y2hlckluc3RhbmNlLCBwYXJjZWxFdmVudHM6IHBhcmNlbFdhdGNoZXIuRXZlbnRbXSk6IElGaWxlQ2hhbmdlW10ge1xuXHRcdGNvbnN0IGV2ZW50czogSUZpbGVDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IHBhdGgsIHR5cGU6IHBhcmNlbEV2ZW50VHlwZSB9IG9mIHBhcmNlbEV2ZW50cykge1xuXHRcdFx0Y29uc3QgdHlwZSA9IFBhcmNlbFdhdGNoZXIuTUFQX1BBUkNFTF9XQVRDSEVSX0FDVElPTl9UT19GSUxFX0NIQU5HRS5nZXQocGFyY2VsRXZlbnRUeXBlKSE7XG5cdFx0XHRpZiAodGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0XHR0aGlzLnRyYWNlV2l0aENvcnJlbGF0aW9uKGAke3R5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLkFEREVEID8gJ1tBRERFRF0nIDogdHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCA/ICdbREVMRVRFRF0nIDogJ1tDSEFOR0VEXSd9ICR7cGF0aH1gLCB3YXRjaGVyLnJlcXVlc3QpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSBpbmNsdWRlIGZpbHRlciBpZiBhbnlcblx0XHRcdGlmICghd2F0Y2hlci5pbmNsdWRlKHBhdGgpKSB7XG5cdFx0XHRcdGlmICh0aGlzLnZlcmJvc2VMb2dnaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy50cmFjZVdpdGhDb3JyZWxhdGlvbihgID4+IGlnbm9yZWQgKG5vdCBpbmNsdWRlZCkgJHtwYXRofWAsIHdhdGNoZXIucmVxdWVzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHsgdHlwZSwgcmVzb3VyY2U6IFVSSS5maWxlKHBhdGgpLCBjSWQ6IHdhdGNoZXIucmVxdWVzdC5jb3JyZWxhdGlvbklkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBldmVudHM7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVBhcmNlbEV2ZW50cyhwYXJjZWxFdmVudHM6IElGaWxlQ2hhbmdlW10sIHdhdGNoZXI6IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSk6IHZvaWQge1xuXG5cdFx0Ly8gQ29hbGVzY2UgZXZlbnRzOiBtZXJnZSBldmVudHMgb2Ygc2FtZSBraW5kXG5cdFx0Y29uc3QgY29hbGVzY2VkRXZlbnRzID0gY29hbGVzY2VFdmVudHMocGFyY2VsRXZlbnRzKTtcblxuXHRcdC8vIEZpbHRlciBldmVudHM6IGNoZWNrIGZvciBzcGVjaWZpYyBldmVudHMgd2Ugd2FudCB0byBleGNsdWRlXG5cdFx0Y29uc3QgeyBldmVudHM6IGZpbHRlcmVkRXZlbnRzLCByb290RGVsZXRlZCB9ID0gdGhpcy5maWx0ZXJFdmVudHMoY29hbGVzY2VkRXZlbnRzLCB3YXRjaGVyKTtcblxuXHRcdC8vIEJyb2FkY2FzdCB0byBjbGllbnRzXG5cdFx0dGhpcy5lbWl0RXZlbnRzKGZpbHRlcmVkRXZlbnRzLCB3YXRjaGVyKTtcblxuXHRcdC8vIEhhbmRsZSByb290IHBhdGggZGVsZXRlc1xuXHRcdGlmIChyb290RGVsZXRlZCkge1xuXHRcdFx0dGhpcy5vbldhdGNoZWRQYXRoRGVsZXRlZCh3YXRjaGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVtaXRFdmVudHMoZXZlbnRzOiBJRmlsZUNoYW5nZVtdLCB3YXRjaGVyOiBQYXJjZWxXYXRjaGVySW5zdGFuY2UpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJyb2FkY2FzdCB0byBjbGllbnRzIHZpYSB0aHJvdHRsZXJcblx0XHRjb25zdCB3b3JrZWQgPSB0aGlzLnRocm90dGxlZEZpbGVDaGFuZ2VzRW1pdHRlci53b3JrKGV2ZW50cyk7XG5cblx0XHQvLyBMb2dnaW5nXG5cdFx0aWYgKCF3b3JrZWQpIHtcblx0XHRcdHRoaXMud2Fybihgc3RhcnRlZCBpZ25vcmluZyBldmVudHMgZHVlIHRvIHRvbyBtYW55IGZpbGUgY2hhbmdlIGV2ZW50cyBhdCBvbmNlIChpbmNvbWluZzogJHtldmVudHMubGVuZ3RofSwgbW9zdCByZWNlbnQgY2hhbmdlOiAke2V2ZW50c1swXS5yZXNvdXJjZS5mc1BhdGh9KS4gVXNlICdmaWxlcy53YXRjaGVyRXhjbHVkZScgc2V0dGluZyB0byBleGNsdWRlIGZvbGRlcnMgd2l0aCBsb3RzIG9mIGNoYW5naW5nIGZpbGVzIChlLmcuIGNvbXBpbGF0aW9uIG91dHB1dCkuYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLnRocm90dGxlZEZpbGVDaGFuZ2VzRW1pdHRlci5wZW5kaW5nID4gMCkge1xuXHRcdFx0XHR0aGlzLnRyYWNlKGBzdGFydGVkIHRocm90dGxpbmcgZXZlbnRzIGR1ZSB0byBsYXJnZSBhbW91bnQgb2YgZmlsZSBjaGFuZ2UgZXZlbnRzIGF0IG9uY2UgKHBlbmRpbmc6ICR7dGhpcy50aHJvdHRsZWRGaWxlQ2hhbmdlc0VtaXR0ZXIucGVuZGluZ30sIG1vc3QgcmVjZW50IGNoYW5nZTogJHtldmVudHNbMF0ucmVzb3VyY2UuZnNQYXRofSkuIFVzZSAnZmlsZXMud2F0Y2hlckV4Y2x1ZGUnIHNldHRpbmcgdG8gZXhjbHVkZSBmb2xkZXJzIHdpdGggbG90cyBvZiBjaGFuZ2luZyBmaWxlcyAoZS5nLiBjb21waWxhdGlvbiBvdXRwdXQpLmAsIHdhdGNoZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbm9ybWFsaXplUGF0aChyZXF1ZXN0OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0KTogUHJvbWlzZTx7IHJlYWxQYXRoOiBzdHJpbmc7IHJlYWxQYXRoRGlmZmVyczogYm9vbGVhbjsgcmVhbFBhdGhMZW5ndGg6IG51bWJlciB9PiB7XG5cdFx0bGV0IHJlYWxQYXRoID0gcmVxdWVzdC5wYXRoO1xuXHRcdGxldCByZWFsUGF0aERpZmZlcnMgPSBmYWxzZTtcblx0XHRsZXQgcmVhbFBhdGhMZW5ndGggPSByZXF1ZXN0LnBhdGgubGVuZ3RoO1xuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gRmlyc3QgY2hlY2sgZm9yIHN5bWJvbGljIGxpbmtcblx0XHRcdHJlYWxQYXRoID0gYXdhaXQgUHJvbWlzZXMucmVhbHBhdGgocmVxdWVzdC5wYXRoKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNoZWNrIGZvciBjYXNpbmcgZGlmZmVyZW5jZVxuXHRcdFx0Ly8gTm90ZTogdGhpcyB3aWxsIGJlIGEgbm8tb3Agb24gTGludXggcGxhdGZvcm1zXG5cdFx0XHRpZiAocmVxdWVzdC5wYXRoID09PSByZWFsUGF0aCkge1xuXHRcdFx0XHRyZWFsUGF0aCA9IGF3YWl0IHJlYWxjYXNlKHJlcXVlc3QucGF0aCkgPz8gcmVxdWVzdC5wYXRoO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb3JyZWN0IHdhdGNoIHBhdGggYXMgbmVlZGVkXG5cdFx0XHRpZiAocmVxdWVzdC5wYXRoICE9PSByZWFsUGF0aCkge1xuXHRcdFx0XHRyZWFsUGF0aExlbmd0aCA9IHJlYWxQYXRoLmxlbmd0aDtcblx0XHRcdFx0cmVhbFBhdGhEaWZmZXJzID0gdHJ1ZTtcblxuXHRcdFx0XHR0aGlzLnRyYWNlKGBjb3JyZWN0aW5nIGEgcGF0aCB0byB3YXRjaCB0aGF0IHNlZW1zIHRvIGJlIGEgc3ltYm9saWMgbGluayBvciB3cm9uZyBjYXNpbmcgKG9yaWdpbmFsOiAke3JlcXVlc3QucGF0aH0sIHJlYWw6ICR7cmVhbFBhdGh9KWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cblx0XHRyZXR1cm4geyByZWFsUGF0aCwgcmVhbFBhdGhEaWZmZXJzLCByZWFsUGF0aExlbmd0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVFdmVudHMoZXZlbnRzOiBwYXJjZWxXYXRjaGVyLkV2ZW50W10sIHJlcXVlc3Q6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3QsIHJlYWxQYXRoRGlmZmVyczogYm9vbGVhbiwgcmVhbFBhdGhMZW5ndGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZXZlbnRzKSB7XG5cblx0XHRcdC8vIE1hYyB1c2VzIE5GRCB1bmljb2RlIGZvcm0gb24gZGlzaywgYnV0IHdlIHdhbnQgTkZDXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0ZXZlbnQucGF0aCA9IG5vcm1hbGl6ZU5GQyhldmVudC5wYXRoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL3BhcmNlbC1idW5kbGVyL3dhdGNoZXIvaXNzdWVzLzY4XG5cdFx0XHQvLyB3aGVyZSB3YXRjaGluZyByb290IGRyaXZlIGxldHRlciBhZGRzIGV4dHJhIGJhY2tzbGFzaGVzLlxuXHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRpZiAocmVxdWVzdC5wYXRoLmxlbmd0aCA8PSAzKSB7IC8vIGZvciBleC4gYzosIEM6XFxcblx0XHRcdFx0XHRldmVudC5wYXRoID0gbm9ybWFsaXplKGV2ZW50LnBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgcGF0aHMgYmFjayB0byBvcmlnaW5hbCBmb3JtIGluIGNhc2UgaXQgZGlmZmVyc1xuXHRcdFx0aWYgKHJlYWxQYXRoRGlmZmVycykge1xuXHRcdFx0XHRldmVudC5wYXRoID0gcmVxdWVzdC5wYXRoICsgZXZlbnQucGF0aC5zdWJzdHIocmVhbFBhdGhMZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyRXZlbnRzKGV2ZW50czogSUZpbGVDaGFuZ2VbXSwgd2F0Y2hlcjogUGFyY2VsV2F0Y2hlckluc3RhbmNlKTogeyBldmVudHM6IElGaWxlQ2hhbmdlW107IHJvb3REZWxldGVkPzogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBmaWx0ZXJlZEV2ZW50czogSUZpbGVDaGFuZ2VbXSA9IFtdO1xuXHRcdGxldCByb290RGVsZXRlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgZmlsdGVyID0gdGhpcy5pc0NvcnJlbGF0ZWQod2F0Y2hlci5yZXF1ZXN0KSA/IHdhdGNoZXIucmVxdWVzdC5maWx0ZXIgOiB1bmRlZmluZWQ7IC8vIGZpbHRlcmluZyBpcyBvbmx5IGVuYWJsZWQgd2hlbiBjb3JyZWxhdGluZyBiZWNhdXNlIHdhdGNoZXJzIGFyZSBvdGhlcndpc2UgcG90ZW50aWFsbHkgcmV1c2VkXG5cdFx0Zm9yIChjb25zdCBldmVudCBvZiBldmVudHMpIHtcblxuXHRcdFx0Ly8gRW1pdCB0byBpbnN0YW5jZSBzdWJzY3JpcHRpb25zIGlmIGFueSBiZWZvcmUgZmlsdGVyaW5nXG5cdFx0XHRpZiAod2F0Y2hlci5zdWJzY3JpcHRpb25zQ291bnQgPiAwKSB7XG5cdFx0XHRcdHdhdGNoZXIubm90aWZ5RmlsZUNoYW5nZShldmVudC5yZXNvdXJjZS5mc1BhdGgsIGV2ZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyaW5nXG5cdFx0XHRyb290RGVsZXRlZCA9IGV2ZW50LnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgJiYgaXNFcXVhbChldmVudC5yZXNvdXJjZS5mc1BhdGgsIHdhdGNoZXIucmVxdWVzdC5wYXRoLCAhaXNMaW51eCk7XG5cdFx0XHRpZiAoaXNGaWx0ZXJlZChldmVudCwgZmlsdGVyKSkge1xuXHRcdFx0XHRpZiAodGhpcy52ZXJib3NlTG9nZ2luZykge1xuXHRcdFx0XHRcdHRoaXMudHJhY2VXaXRoQ29ycmVsYXRpb24oYCA+PiBpZ25vcmVkIChmaWx0ZXJlZCkgJHtldmVudC5yZXNvdXJjZS5mc1BhdGh9YCwgd2F0Y2hlci5yZXF1ZXN0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb2dnaW5nXG5cdFx0XHR0aGlzLnRyYWNlRXZlbnQoZXZlbnQsIHdhdGNoZXIucmVxdWVzdCk7XG5cblx0XHRcdGZpbHRlcmVkRXZlbnRzLnB1c2goZXZlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGV2ZW50czogZmlsdGVyZWRFdmVudHMsIHJvb3REZWxldGVkIH07XG5cdH1cblxuXHRwcml2YXRlIG9uV2F0Y2hlZFBhdGhEZWxldGVkKHdhdGNoZXI6IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSk6IHZvaWQge1xuXHRcdHRoaXMud2FybignV2F0Y2hlciBzaHV0ZG93biBiZWNhdXNlIHdhdGNoZWQgcGF0aCBnb3QgZGVsZXRlZCcsIHdhdGNoZXIpO1xuXG5cdFx0d2F0Y2hlci5ub3RpZnlXYXRjaEZhaWxlZCgpO1xuXHRcdHRoaXMuX29uRGlkV2F0Y2hGYWlsLmZpcmUod2F0Y2hlci5yZXF1ZXN0KTtcblx0fVxuXG5cdHByaXZhdGUgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3I6IHVua25vd24sIHJlcXVlc3Q/OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgbXNnID0gdG9FcnJvck1lc3NhZ2UoZXJyb3IpO1xuXG5cdFx0Ly8gU3BlY2lhbGx5IGhhbmRsZSBFTk9TUEMgZXJyb3JzIHRoYXQgY2FuIGhhcHBlbiB3aGVuXG5cdFx0Ly8gdGhlIHdhdGNoZXIgY29uc3VtZXMgc28gbWFueSBmaWxlIGRlc2NyaXB0b3JzIHRoYXRcblx0XHQvLyB3ZSBhcmUgcnVubmluZyBpbnRvIGEgbGltaXQuIFdlIG9ubHkgd2FudCB0byB3YXJuXG5cdFx0Ly8gb25jZSBpbiB0aGlzIGNhc2UgdG8gYXZvaWQgbG9nIHNwYW0uXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83OTUwXG5cdFx0aWYgKG1zZy5pbmRleE9mKCdObyBzcGFjZSBsZWZ0IG9uIGRldmljZScpICE9PSAtMSkge1xuXHRcdFx0aWYgKCF0aGlzLmVub3NwY0Vycm9yTG9nZ2VkKSB7XG5cdFx0XHRcdHRoaXMuZXJyb3IoJ0lub3RpZnkgbGltaXQgcmVhY2hlZCAoRU5PU1BDKScsIHJlcXVlc3QpO1xuXG5cdFx0XHRcdHRoaXMuZW5vc3BjRXJyb3JMb2dnZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZlcnNpb24gMi41LjEgaW50cm9kdWNlcyAzIG5ldyBlcnJvcnMgb24gbWFjT1Ncblx0XHQvLyB2aWEgaHR0cHM6Ly9naXRodWIuZGV2L3BhcmNlbC1idW5kbGVyL3dhdGNoZXIvcHVsbC8xOTZcblx0XHRlbHNlIGlmIChtc2cuaW5kZXhPZignRmlsZSBzeXN0ZW0gbXVzdCBiZSByZS1zY2FubmVkJykgIT09IC0xKSB7XG5cdFx0XHR0aGlzLmVycm9yKG1zZywgcmVxdWVzdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQW55IG90aGVyIGVycm9yIGlzIHVuZXhwZWN0ZWQgYW5kIHdlIHNob3VsZCB0cnkgdG9cblx0XHQvLyByZXN0YXJ0IHRoZSB3YXRjaGVyIGFzIGEgcmVzdWx0IHRvIGdldCBpbnRvIGhlYWx0aHlcblx0XHQvLyBzdGF0ZSBhZ2FpbiBpZiBwb3NzaWJsZSBhbmQgaWYgbm90IGF0dGVtcHRlZCB0b28gbXVjaFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5lcnJvcihgVW5leHBlY3RlZCBlcnJvcjogJHttc2d9IChFVU5LTk9XTilgLCByZXF1ZXN0KTtcblxuXHRcdFx0dGhpcy5fb25EaWRFcnJvci5maXJlKHsgcmVxdWVzdCwgZXJyb3I6IG1zZyB9KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnN0b3AoKTtcblxuXHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLndhdGNoZXJzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3BXYXRjaGluZyh3YXRjaGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVzdGFydFdhdGNoaW5nKHdhdGNoZXI6IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSwgZGVsYXkgPSA4MDApOiB2b2lkIHtcblxuXHRcdC8vIFJlc3RhcnQgd2F0Y2hlciBkZWxheWVkIHRvIGFjY29tbW9kYXRlIGZvclxuXHRcdC8vIGNoYW5nZXMgb24gZGlzayB0aGF0IGhhdmUgdHJpZ2dlcmVkIHRoZVxuXHRcdC8vIG5lZWQgZm9yIGEgcmVzdGFydCBpbiB0aGUgZmlyc3QgcGxhY2UuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHdhdGNoZXIudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgd2hlbiBkaXNwb3NlZFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN0YXJ0UHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdHRyeSB7XG5cblx0XHRcdFx0Ly8gQXdhaXQgdGhlIHdhdGNoZXIgaGF2aW5nIHN0b3BwZWQsIGFzIHRoaXMgaXNcblx0XHRcdFx0Ly8gbmVlZGVkIHRvIHByb3Blcmx5IHJlLXdhdGNoIHRoZSBzYW1lIHBhdGhcblx0XHRcdFx0YXdhaXQgdGhpcy5zdG9wV2F0Y2hpbmcod2F0Y2hlciwgcmVzdGFydFByb21pc2UucCk7XG5cblx0XHRcdFx0Ly8gU3RhcnQgd2F0Y2hlciBhZ2FpbiBjb3VudGluZyB0aGUgcmVzdGFydHNcblx0XHRcdFx0aWYgKHdhdGNoZXIucmVxdWVzdC5wb2xsaW5nSW50ZXJ2YWwpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnN0YXJ0UG9sbGluZyh3YXRjaGVyLnJlcXVlc3QsIHdhdGNoZXIucmVxdWVzdC5wb2xsaW5nSW50ZXJ2YWwsIHdhdGNoZXIucmVzdGFydHMgKyAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnN0YXJ0V2F0Y2hpbmcod2F0Y2hlci5yZXF1ZXN0LCB3YXRjaGVyLnJlc3RhcnRzICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlc3RhcnRQcm9taXNlLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fSwgZGVsYXkpO1xuXG5cdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0d2F0Y2hlci50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBzY2hlZHVsZXIuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcFdhdGNoaW5nKHdhdGNoZXI6IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSwgam9pblJlc3RhcnQ/OiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZShgc3RvcHBpbmcgZmlsZSB3YXRjaGVyYCwgd2F0Y2hlcik7XG5cblx0XHR0aGlzLl93YXRjaGVycy5kZWxldGUodGhpcy5yZXF1ZXN0VG9XYXRjaGVyS2V5KHdhdGNoZXIucmVxdWVzdCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdhdGNoZXIuc3RvcChqb2luUmVzdGFydCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuZXJyb3IoYFVuZXhwZWN0ZWQgZXJyb3Igc3RvcHBpbmcgd2F0Y2hlcjogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCwgd2F0Y2hlci5yZXF1ZXN0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMocmVxdWVzdHM6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3RbXSwgdmFsaWRhdGVQYXRocyA9IHRydWUpOiBQcm9taXNlPElSZWN1cnNpdmVXYXRjaFJlcXVlc3RbXT4ge1xuXG5cdFx0Ly8gU29ydCByZXF1ZXN0cyBieSBwYXRoIGxlbmd0aCB0byBoYXZlIHNob3J0ZXN0IGZpcnN0XG5cdFx0Ly8gdG8gaGF2ZSBhIHdheSB0byBwcmV2ZW50IGNoaWxkcmVuIHRvIGJlIHdhdGNoZWQgaWZcblx0XHQvLyBwYXJlbnRzIGV4aXN0LlxuXHRcdHJlcXVlc3RzLnNvcnQoKHJlcXVlc3RBLCByZXF1ZXN0QikgPT4gcmVxdWVzdEEucGF0aC5sZW5ndGggLSByZXF1ZXN0Qi5wYXRoLmxlbmd0aCk7XG5cblx0XHQvLyBJZ25vcmUgcmVxdWVzdHMgZm9yIHRoZSBzYW1lIHBhdGhzIHRoYXQgaGF2ZSB0aGUgc2FtZSBjb3JyZWxhdGlvblxuXHRcdGNvbnN0IG1hcENvcnJlbGF0aW9udG9SZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyIHwgdW5kZWZpbmVkIC8qIGNvcnJlbGF0aW9uICovLCBNYXA8c3RyaW5nLCBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0Pj4oKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgcmVxdWVzdHMpIHtcblx0XHRcdGlmIChyZXF1ZXN0LmV4Y2x1ZGVzLmluY2x1ZGVzKEdMT0JTVEFSKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gcGF0aCBpcyBpZ25vcmVkIGVudGlyZWx5ICh2aWEgYCoqYCBnbG9iIGV4Y2x1ZGUpXG5cdFx0XHR9XG5cblxuXHRcdFx0bGV0IHJlcXVlc3RzRm9yQ29ycmVsYXRpb24gPSBtYXBDb3JyZWxhdGlvbnRvUmVxdWVzdHMuZ2V0KHJlcXVlc3QuY29ycmVsYXRpb25JZCk7XG5cdFx0XHRpZiAoIXJlcXVlc3RzRm9yQ29ycmVsYXRpb24pIHtcblx0XHRcdFx0cmVxdWVzdHNGb3JDb3JyZWxhdGlvbiA9IG5ldyBNYXA8c3RyaW5nLCBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0PigpO1xuXHRcdFx0XHRtYXBDb3JyZWxhdGlvbnRvUmVxdWVzdHMuc2V0KHJlcXVlc3QuY29ycmVsYXRpb25JZCwgcmVxdWVzdHNGb3JDb3JyZWxhdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhdGggPSB0aGlzLnBhdGhUb1dhdGNoZXJLZXkocmVxdWVzdC5wYXRoKTtcblx0XHRcdGlmIChyZXF1ZXN0c0ZvckNvcnJlbGF0aW9uLmhhcyhwYXRoKSkge1xuXHRcdFx0XHR0aGlzLnRyYWNlKGBpZ25vcmluZyBhIHJlcXVlc3QgZm9yIHdhdGNoaW5nIHdobydzIHBhdGggaXMgYWxyZWFkeSB3YXRjaGVkOiAke3RoaXMucmVxdWVzdFRvU3RyaW5nKHJlcXVlc3QpfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXF1ZXN0c0ZvckNvcnJlbGF0aW9uLnNldChwYXRoLCByZXF1ZXN0KTtcblx0XHR9XG5cblx0XHRjb25zdCBub3JtYWxpemVkUmVxdWVzdHM6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3RbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0c0ZvckNvcnJlbGF0aW9uIG9mIG1hcENvcnJlbGF0aW9udG9SZXF1ZXN0cy52YWx1ZXMoKSkge1xuXG5cdFx0XHQvLyBPbmx5IGNvbnNpZGVyIHJlcXVlc3RzIGZvciB3YXRjaGluZyB0aGF0IGFyZSBub3Rcblx0XHRcdC8vIGEgY2hpbGQgb2YgYW4gZXhpc3RpbmcgcmVxdWVzdCBwYXRoIHRvIHByZXZlbnRcblx0XHRcdC8vIGR1cGxpY2F0aW9uLiBJbiBhZGRpdGlvbiwgZHJvcCBhbnkgcmVxdWVzdCB3aGVyZVxuXHRcdFx0Ly8gZXZlcnl0aGluZyBpcyBleGNsdWRlZCAodmlhIGAqKmAgZ2xvYikuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSG93ZXZlciwgYWxsb3cgZXhwbGljaXQgcmVxdWVzdHMgdG8gd2F0Y2ggZm9sZGVyc1xuXHRcdFx0Ly8gdGhhdCBhcmUgc3ltYm9saWMgbGlua3MgYmVjYXVzZSB0aGUgUGFyY2VsIHdhdGNoZXJcblx0XHRcdC8vIGRvZXMgbm90IGFsbG93IHRvIHJlY3Vyc2l2ZWx5IHdhdGNoIHN5bWJvbGljIGxpbmtzLlxuXG5cdFx0XHRjb25zdCByZXF1ZXN0VHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclBhdGhzPElSZWN1cnNpdmVXYXRjaFJlcXVlc3Q+KCFpc0xpbnV4KTtcblxuXHRcdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzRm9yQ29ycmVsYXRpb24udmFsdWVzKCkpIHtcblxuXHRcdFx0XHQvLyBDaGVjayBmb3Igb3ZlcmxhcHBpbmcgcmVxdWVzdCBwYXRocyAoYnV0IHByZXNlcnZlIHN5bWJvbGljIGxpbmtzKVxuXHRcdFx0XHRpZiAocmVxdWVzdFRyaWUuZmluZFN1YnN0cihyZXF1ZXN0LnBhdGgpKSB7XG5cdFx0XHRcdFx0aWYgKHJlcXVlc3RUcmllLmhhcyhyZXF1ZXN0LnBhdGgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBpZ25vcmluZyBhIHJlcXVlc3QgZm9yIHdhdGNoaW5nIHdobydzIHBhdGggaXMgYWxyZWFkeSB3YXRjaGVkOiAke3RoaXMucmVxdWVzdFRvU3RyaW5nKHJlcXVlc3QpfWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIShhd2FpdCBwcm9taXNlcy5sc3RhdChyZXF1ZXN0LnBhdGgpKS5pc1N5bWJvbGljTGluaygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50cmFjZShgaWdub3JpbmcgYSByZXF1ZXN0IGZvciB3YXRjaGluZyB3aG8ncyBwYXJlbnQgaXMgYWxyZWFkeSB3YXRjaGVkOiAke3RoaXMucmVxdWVzdFRvU3RyaW5nKHJlcXVlc3QpfWApO1xuXG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudHJhY2UoYGlnbm9yaW5nIGEgcmVxdWVzdCBmb3Igd2F0Y2hpbmcgd2hvJ3MgbHN0YXQgZmFpbGVkIHRvIHJlc29sdmU6ICR7dGhpcy5yZXF1ZXN0VG9TdHJpbmcocmVxdWVzdCl9IChlcnJvcjogJHtlcnJvcn0pYCk7XG5cblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRXYXRjaEZhaWwuZmlyZShyZXF1ZXN0KTtcblxuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGVjayBmb3IgaW52YWxpZCBwYXRoc1xuXHRcdFx0XHRpZiAodmFsaWRhdGVQYXRocyAmJiAhKGF3YWl0IHRoaXMuaXNQYXRoVmFsaWQocmVxdWVzdC5wYXRoKSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFdhdGNoRmFpbC5maXJlKHJlcXVlc3QpO1xuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXF1ZXN0VHJpZS5zZXQocmVxdWVzdC5wYXRoLCByZXF1ZXN0KTtcblx0XHRcdH1cblxuXHRcdFx0bm9ybWFsaXplZFJlcXVlc3RzLnB1c2goLi4uQXJyYXkuZnJvbShyZXF1ZXN0VHJpZSkubWFwKChbLCByZXF1ZXN0XSkgPT4gcmVxdWVzdCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBub3JtYWxpemVkUmVxdWVzdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzUGF0aFZhbGlkKHBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvbWlzZXMuc3RhdChwYXRoKTtcblx0XHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYGlnbm9yaW5nIGEgcGF0aCBmb3Igd2F0Y2hpbmcgdGhhdCBpcyBhIGZpbGUgYW5kIG5vdCBhIGZvbGRlcjogJHtwYXRofWApO1xuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy50cmFjZShgaWdub3JpbmcgYSBwYXRoIGZvciB3YXRjaGluZyB3aG8ncyBzdGF0IGluZm8gZmFpbGVkIHRvIHJlc29sdmU6ICR7cGF0aH0gKGVycm9yOiAke2Vycm9yfSlgKTtcblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c3Vic2NyaWJlKHBhdGg6IHN0cmluZywgY2FsbGJhY2s6IChlcnJvcjogdHJ1ZSB8IG51bGwsIGNoYW5nZT86IElGaWxlQ2hhbmdlKSA9PiB2b2lkKTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLndhdGNoZXJzKSB7XG5cdFx0XHRpZiAod2F0Y2hlci5mYWlsZWQpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHdhdGNoZXIgaGFzIGFscmVhZHkgZmFpbGVkXG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNFcXVhbE9yUGFyZW50KHBhdGgsIHdhdGNoZXIucmVxdWVzdC5wYXRoLCAhaXNMaW51eCkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHdhdGNoZXIgZG9lcyBub3QgY29uc2lkZXIgdGhpcyBwYXRoXG5cdFx0XHR9XG5cblx0XHRcdGlmIChcblx0XHRcdFx0d2F0Y2hlci5leGNsdWRlKHBhdGgpIHx8XG5cdFx0XHRcdCF3YXRjaGVyLmluY2x1ZGUocGF0aClcblx0XHRcdCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gcGFyY2VsIGluc3RhbmNlIGRvZXMgbm90IGNvbnNpZGVyIHRoaXMgcGF0aFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2Uod2F0Y2hlci5vbkRpZFN0b3ApKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRhd2FpdCBlLmpvaW5SZXN0YXJ0OyAvLyBpZiB3ZSBhcmUgcmVzdGFydGluZywgYXdhaXQgdGhhdCBzbyB0aGF0IHdlIGNhbiBwb3NzaWJseSByZXVzZSB0aGlzIHdhdGNoZXIgYWdhaW5cblx0XHRcdFx0aWYgKGRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYWxsYmFjayh0cnVlIC8qIGVycm9yICovKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHdhdGNoZXIub25EaWRGYWlsKSgoKSA9PiBjYWxsYmFjayh0cnVlIC8qIGVycm9yICovKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoZXIuc3Vic2NyaWJlKHBhdGgsIGNoYW5nZSA9PiBjYWxsYmFjayhudWxsLCBjaGFuZ2UpKSk7XG5cblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgd2F0Y2hlcj86IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZlcmJvc2VMb2dnaW5nKSB7XG5cdFx0XHR0aGlzLl9vbkRpZExvZ01lc3NhZ2UuZmlyZSh7IHR5cGU6ICd0cmFjZScsIG1lc3NhZ2U6IHRoaXMudG9NZXNzYWdlKG1lc3NhZ2UsIHdhdGNoZXI/LnJlcXVlc3QpIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCB3YXJuKG1lc3NhZ2U6IHN0cmluZywgd2F0Y2hlcj86IFBhcmNlbFdhdGNoZXJJbnN0YW5jZSkge1xuXHRcdHRoaXMuX29uRGlkTG9nTWVzc2FnZS5maXJlKHsgdHlwZTogJ3dhcm4nLCBtZXNzYWdlOiB0aGlzLnRvTWVzc2FnZShtZXNzYWdlLCB3YXRjaGVyPy5yZXF1ZXN0KSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZXJyb3IobWVzc2FnZTogc3RyaW5nLCByZXF1ZXN0PzogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCkge1xuXHRcdHRoaXMuX29uRGlkTG9nTWVzc2FnZS5maXJlKHsgdHlwZTogJ2Vycm9yJywgbWVzc2FnZTogdGhpcy50b01lc3NhZ2UobWVzc2FnZSwgcmVxdWVzdCkgfSk7XG5cdH1cblxuXHRwcml2YXRlIHRvTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcsIHJlcXVlc3Q/OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcmVxdWVzdCA/IGBbRmlsZSBXYXRjaGVyICgncGFyY2VsJyldICR7bWVzc2FnZX0gKHBhdGg6ICR7cmVxdWVzdC5wYXRofSlgIDogYFtGaWxlIFdhdGNoZXIgKCdwYXJjZWwnKV0gJHttZXNzYWdlfWA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IHJlY3Vyc2l2ZVdhdGNoZXIoKSB7IHJldHVybiB0aGlzOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLG1CQUFtQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFFBQVEsZUFBZTtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxpQkFBaUIsa0JBQWtCLGVBQWUsdUJBQXVCO0FBQ2xGLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksU0FBUyx1QkFBdUI7QUFDckQsU0FBUyxVQUF5QixzQkFBc0I7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXLFlBQVk7QUFDaEMsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxzQkFBbUM7QUFDNUMsU0FBUyxnQkFBd0Msc0JBQXNELGtCQUFzQztBQUM3SSxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUVoRSxNQUFNLDhCQUE4QixXQUFXO0FBQUEsRUFtQnJELFlBSVUsT0FDQSxTQUtBLFVBSUEsT0FJQSxRQUNRLFFBQ2hCO0FBQ0QsVUFBTTtBQWpCRztBQUNBO0FBS0E7QUFJQTtBQUlBO0FBQ1E7QUFwQ2xCLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBeUMsQ0FBQztBQUMzRixTQUFTLFlBQVksS0FBSyxXQUFXO0FBRXJDLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2hFLFNBQVMsWUFBWSxLQUFLLFdBQVc7QUFFckMsU0FBUSxVQUFVO0FBR2xCLFNBQVEsVUFBVTtBQU1sQixTQUFpQixnQkFBZ0Isb0JBQUksSUFB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
