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
import { Event, Emitter } from "../../../../base/common/event.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { WorkingCopyHistoryTracker } from "./workingCopyHistoryTracker.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { MAX_PARALLEL_HISTORY_IO_OPS } from "./workingCopyHistory.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { URI } from "../../../../base/common/uri.js";
import { DeferredPromise, Limiter, RunOnceScheduler } from "../../../../base/common/async.js";
import { dirname, extname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { hash } from "../../../../base/common/hash.js";
import { indexOfPath, randomPath } from "../../../../base/common/extpath.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { distinct } from "../../../../base/common/arrays.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
const _WorkingCopyHistoryModel = class _WorkingCopyHistoryModel {
  constructor(workingCopyResource, historyHome, entryAddedEmitter, entryChangedEmitter, entryReplacedEmitter, entryRemovedEmitter, options, fileService, labelService, logService, configurationService) {
    this.historyHome = historyHome;
    this.entryAddedEmitter = entryAddedEmitter;
    this.entryChangedEmitter = entryChangedEmitter;
    this.entryReplacedEmitter = entryReplacedEmitter;
    this.entryRemovedEmitter = entryRemovedEmitter;
    this.options = options;
    this.fileService = fileService;
    this.labelService = labelService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.entries = [];
    this.whenResolved = void 0;
    this.workingCopyResource = void 0;
    this.workingCopyName = void 0;
    this.historyEntriesFolder = void 0;
    this.historyEntriesListingFile = void 0;
    this.historyEntriesNameMatcher = void 0;
    this.versionId = 0;
    this.storedVersionId = this.versionId;
    this.storeLimiter = new Limiter(1);
    this.setWorkingCopy(workingCopyResource);
  }
  setWorkingCopy(workingCopyResource) {
    this.workingCopyResource = workingCopyResource;
    this.workingCopyName = this.labelService.getUriBasenameLabel(workingCopyResource);
    this.historyEntriesNameMatcher = new RegExp(`[A-Za-z0-9]{4}${escapeRegExpCharacters(extname(workingCopyResource))}`);
    this.historyEntriesFolder = this.toHistoryEntriesFolder(this.historyHome, workingCopyResource);
    this.historyEntriesListingFile = joinPath(this.historyEntriesFolder, _WorkingCopyHistoryModel.ENTRIES_FILE);
    this.entries = [];
    this.whenResolved = void 0;
  }
  toHistoryEntriesFolder(historyHome, workingCopyResource) {
    return joinPath(historyHome, hash(workingCopyResource.toString()).toString(16));
  }
  async addEntry(source = _WorkingCopyHistoryModel.FILE_SAVED_SOURCE, sourceDescription = void 0, timestamp = Date.now(), token) {
    let entryToReplace = void 0;
    const lastEntry = this.entries.at(-1);
    if (lastEntry && lastEntry.source === source) {
      const configuredReplaceInterval = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MERGE_PERIOD, { resource: this.workingCopyResource });
      if (timestamp - lastEntry.timestamp <= configuredReplaceInterval * 1e3) {
        entryToReplace = lastEntry;
      }
    }
    let entry;
    if (entryToReplace) {
      entry = await this.doReplaceEntry(entryToReplace, source, sourceDescription, timestamp, token);
    } else {
      entry = await this.doAddEntry(source, sourceDescription, timestamp, token);
    }
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
    return entry;
  }
  async doAddEntry(source, sourceDescription = void 0, timestamp, token) {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const workingCopyName = assertReturnsDefined(this.workingCopyName);
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const id = `${randomPath(void 0, void 0, 4)}${extname(workingCopyResource)}`;
    const location = joinPath(historyEntriesFolder, id);
    await this.fileService.cloneFile(workingCopyResource, location);
    const entry = {
      id,
      workingCopy: { resource: workingCopyResource, name: workingCopyName },
      location,
      timestamp,
      source,
      sourceDescription
    };
    this.entries.push(entry);
    this.versionId++;
    this.entryAddedEmitter.fire({ entry });
    return entry;
  }
  async doReplaceEntry(entry, source, sourceDescription = void 0, timestamp, token) {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    await this.fileService.cloneFile(workingCopyResource, entry.location);
    entry.source = source;
    entry.sourceDescription = sourceDescription;
    entry.timestamp = timestamp;
    this.versionId++;
    this.entryReplacedEmitter.fire({ entry });
    return entry;
  }
  async removeEntry(entry, token) {
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return false;
    }
    const index = this.entries.indexOf(entry);
    if (index === -1) {
      return false;
    }
    await this.deleteEntry(entry);
    this.entries.splice(index, 1);
    this.versionId++;
    this.entryRemovedEmitter.fire({ entry });
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
    return true;
  }
  async updateEntry(entry, properties, token) {
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return;
    }
    const index = this.entries.indexOf(entry);
    if (index === -1) {
      return;
    }
    entry.source = properties.source;
    this.versionId++;
    this.entryChangedEmitter.fire({ entry });
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
  }
  async getEntries() {
    await this.resolveEntriesOnce();
    const configuredMaxEntries = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
    if (this.entries.length > configuredMaxEntries) {
      return this.entries.slice(this.entries.length - configuredMaxEntries);
    }
    return this.entries;
  }
  async hasEntries(skipResolve) {
    if (!skipResolve) {
      await this.resolveEntriesOnce();
    }
    return this.entries.length > 0;
  }
  resolveEntriesOnce() {
    if (!this.whenResolved) {
      this.whenResolved = this.doResolveEntries();
    }
    return this.whenResolved;
  }
  async doResolveEntries() {
    const entries = await this.resolveEntriesFromDisk();
    for (const entry of this.entries) {
      entries.set(entry.id, entry);
    }
    this.entries = Array.from(entries.values()).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);
  }
  async resolveEntriesFromDisk() {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const workingCopyName = assertReturnsDefined(this.workingCopyName);
    const [entryListing, entryStats] = await Promise.all([
      // Resolve entries listing file
      this.readEntriesFile(),
      // Resolve children of history folder
      this.readEntriesFolder()
    ]);
    const entries = /* @__PURE__ */ new Map();
    if (entryStats) {
      for (const entryStat of entryStats) {
        entries.set(entryStat.name, {
          id: entryStat.name,
          workingCopy: { resource: workingCopyResource, name: workingCopyName },
          location: entryStat.resource,
          timestamp: entryStat.mtime,
          source: _WorkingCopyHistoryModel.FILE_SAVED_SOURCE,
          sourceDescription: void 0
        });
      }
    }
    if (entryListing) {
      for (const entry of entryListing.entries) {
        const existingEntry = entries.get(entry.id);
        if (existingEntry) {
          entries.set(entry.id, {
            ...existingEntry,
            timestamp: entry.timestamp,
            source: entry.source ?? existingEntry.source,
            sourceDescription: entry.sourceDescription ?? existingEntry.sourceDescription
          });
        }
      }
    }
    return entries;
  }
  async moveEntries(target, source, token) {
    const timestamp = Date.now();
    const sourceDescription = this.labelService.getUriLabel(assertReturnsDefined(this.workingCopyResource));
    const sourceHistoryEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const targetHistoryEntriesFolder = assertReturnsDefined(target.historyEntriesFolder);
    try {
      for (const entry of this.entries) {
        await this.fileService.move(entry.location, joinPath(targetHistoryEntriesFolder, entry.id), true);
      }
      await this.fileService.del(sourceHistoryEntriesFolder, { recursive: true });
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        try {
          await this.fileService.move(sourceHistoryEntriesFolder, targetHistoryEntriesFolder, true);
        } catch (error2) {
          if (!this.isFileNotFound(error2)) {
            this.traceError(error2);
          }
        }
      }
    }
    const allEntries = distinct([...this.entries, ...target.entries], (entry) => entry.id).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);
    const targetWorkingCopyResource = assertReturnsDefined(target.workingCopyResource);
    this.setWorkingCopy(targetWorkingCopyResource);
    const targetWorkingCopyName = assertReturnsDefined(target.workingCopyName);
    for (const entry of allEntries) {
      this.entries.push({
        id: entry.id,
        location: joinPath(targetHistoryEntriesFolder, entry.id),
        source: entry.source,
        sourceDescription: entry.sourceDescription,
        timestamp: entry.timestamp,
        workingCopy: {
          resource: targetWorkingCopyResource,
          name: targetWorkingCopyName
        }
      });
    }
    await this.addEntry(source, sourceDescription, timestamp, token);
    await this.store(token);
  }
  async store(token) {
    if (!this.shouldStore()) {
      return;
    }
    await this.storeLimiter.queue(async () => {
      if (token.isCancellationRequested || !this.shouldStore()) {
        return;
      }
      return this.doStore(token);
    });
  }
  shouldStore() {
    return this.storedVersionId !== this.versionId;
  }
  async doStore(token) {
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return void 0;
    }
    await this.cleanUpEntries();
    const storedVersion = this.versionId;
    if (this.entries.length === 0) {
      try {
        await this.fileService.del(historyEntriesFolder, { recursive: true });
      } catch (error) {
        this.traceError(error);
      }
    } else {
      await this.writeEntriesFile();
    }
    this.storedVersionId = storedVersion;
  }
  async cleanUpEntries() {
    const configuredMaxEntries = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
    if (this.entries.length <= configuredMaxEntries) {
      return;
    }
    const entriesToDelete = this.entries.slice(0, this.entries.length - configuredMaxEntries);
    const entriesToKeep = this.entries.slice(this.entries.length - configuredMaxEntries);
    for (const entryToDelete of entriesToDelete) {
      await this.deleteEntry(entryToDelete);
    }
    this.entries = entriesToKeep;
    for (const entry of entriesToDelete) {
      this.entryRemovedEmitter.fire({ entry });
    }
  }
  async deleteEntry(entry) {
    try {
      await this.fileService.del(entry.location);
    } catch (error) {
      this.traceError(error);
    }
  }
  async writeEntriesFile() {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const historyEntriesListingFile = assertReturnsDefined(this.historyEntriesListingFile);
    const serializedModel = {
      version: 1,
      resource: workingCopyResource.toString(),
      entries: this.entries.map((entry) => {
        return {
          id: entry.id,
          source: entry.source !== _WorkingCopyHistoryModel.FILE_SAVED_SOURCE ? entry.source : void 0,
          sourceDescription: entry.sourceDescription,
          timestamp: entry.timestamp
        };
      })
    };
    await this.fileService.writeFile(historyEntriesListingFile, VSBuffer.fromString(JSON.stringify(serializedModel)));
  }
  async readEntriesFile() {
    const historyEntriesListingFile = assertReturnsDefined(this.historyEntriesListingFile);
    let serializedModel = void 0;
    try {
      serializedModel = JSON.parse((await this.fileService.readFile(historyEntriesListingFile)).value.toString());
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        this.traceError(error);
      }
    }
    return serializedModel;
  }
  async readEntriesFolder() {
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const historyEntriesNameMatcher = assertReturnsDefined(this.historyEntriesNameMatcher);
    let rawEntries = void 0;
    try {
      rawEntries = (await this.fileService.resolve(historyEntriesFolder, { resolveMetadata: true })).children;
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        this.traceError(error);
      }
    }
    if (!rawEntries) {
      return void 0;
    }
    return rawEntries.filter(
      (entry) => !isEqual(entry.resource, this.historyEntriesListingFile) && // not the listings file
      historyEntriesNameMatcher.test(entry.name)
      // matching our expected file pattern for entries
    );
  }
  isFileNotFound(error) {
    return error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
  }
  traceError(error) {
    this.logService.trace("[Working Copy History Service]", error);
  }
};
_WorkingCopyHistoryModel.ENTRIES_FILE = "entries.json";
_WorkingCopyHistoryModel.FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource("default.source", localize("default.source", "File Saved"));
_WorkingCopyHistoryModel.SETTINGS = {
  MAX_ENTRIES: "workbench.localHistory.maxFileEntries",
  MERGE_PERIOD: "workbench.localHistory.mergeWindow"
};
let WorkingCopyHistoryModel = _WorkingCopyHistoryModel;
let WorkingCopyHistoryService = class extends Disposable {
  constructor(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService) {
    super();
    this.fileService = fileService;
    this.remoteAgentService = remoteAgentService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
    this.labelService = labelService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._onDidAddEntry = this._register(new Emitter());
    this.onDidAddEntry = this._onDidAddEntry.event;
    this._onDidChangeEntry = this._register(new Emitter());
    this.onDidChangeEntry = this._onDidChangeEntry.event;
    this._onDidReplaceEntry = this._register(new Emitter());
    this.onDidReplaceEntry = this._onDidReplaceEntry.event;
    this._onDidMoveEntries = this._register(new Emitter());
    this.onDidMoveEntries = this._onDidMoveEntries.event;
    this._onDidRemoveEntry = this._register(new Emitter());
    this.onDidRemoveEntry = this._onDidRemoveEntry.event;
    this._onDidRemoveEntries = this._register(new Emitter());
    this.onDidRemoveEntries = this._onDidRemoveEntries.event;
    this.localHistoryHome = new DeferredPromise();
    this.models = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.resolveLocalHistoryHome();
  }
  async resolveLocalHistoryHome() {
    let historyHome = void 0;
    try {
      const remoteEnv = await this.remoteAgentService.getEnvironment();
      if (remoteEnv) {
        historyHome = remoteEnv.localHistoryHome;
      }
    } catch (error) {
      this.logService.trace(error);
    }
    if (!historyHome) {
      historyHome = this.environmentService.localHistoryHome;
    }
    this.localHistoryHome.complete(historyHome);
  }
  async moveEntries(source, target) {
    const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
    const promises = [];
    for (const [resource, model] of this.models) {
      if (!this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
        continue;
      }
      let targetResource;
      if (this.uriIdentityService.extUri.isEqual(source, resource)) {
        targetResource = target;
      } else {
        const index = indexOfPath(resource.path, source.path);
        targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1));
      }
      let saveSource;
      if (this.uriIdentityService.extUri.isEqual(dirname(resource), dirname(targetResource))) {
        saveSource = WorkingCopyHistoryService.FILE_RENAMED_SOURCE;
      } else {
        saveSource = WorkingCopyHistoryService.FILE_MOVED_SOURCE;
      }
      promises.push(limiter.queue(() => this.doMoveEntries(model, saveSource, resource, targetResource)));
    }
    if (!promises.length) {
      return [];
    }
    const resources = await Promise.all(promises);
    this._onDidMoveEntries.fire();
    return resources;
  }
  async doMoveEntries(source, saveSource, sourceWorkingCopyResource, targetWorkingCopyResource) {
    const target = await this.getModel(targetWorkingCopyResource);
    await source.moveEntries(target, saveSource, CancellationToken.None);
    this.models.delete(sourceWorkingCopyResource);
    this.models.set(targetWorkingCopyResource, source);
    return targetWorkingCopyResource;
  }
  async addEntry({ resource, source, timestamp }, token) {
    if (!this.fileService.hasProvider(resource)) {
      return void 0;
    }
    const model = await this.getModel(resource);
    if (token.isCancellationRequested) {
      return void 0;
    }
    return model.addEntry(source, void 0, timestamp, token);
  }
  async updateEntry(entry, properties, token) {
    const model = await this.getModel(entry.workingCopy.resource);
    if (token.isCancellationRequested) {
      return;
    }
    return model.updateEntry(entry, properties, token);
  }
  async removeEntry(entry, token) {
    const model = await this.getModel(entry.workingCopy.resource);
    if (token.isCancellationRequested) {
      return false;
    }
    return model.removeEntry(entry, token);
  }
  async removeAll(token) {
    const historyHome = await this.localHistoryHome.p;
    if (token.isCancellationRequested) {
      return;
    }
    this.models.clear();
    await this.fileService.del(historyHome, { recursive: true });
    this._onDidRemoveEntries.fire();
  }
  async getEntries(resource, token) {
    const model = await this.getModel(resource);
    if (token.isCancellationRequested) {
      return [];
    }
    const entries = await model.getEntries();
    return entries ?? [];
  }
  async getAll(token) {
    const historyHome = await this.localHistoryHome.p;
    if (token.isCancellationRequested) {
      return [];
    }
    const all = new ResourceMap();
    for (const [resource, model] of this.models) {
      const hasInMemoryEntries = await model.hasEntries(
        true
        /* skip resolving because we resolve below from disk */
      );
      if (hasInMemoryEntries) {
        all.set(resource, true);
      }
    }
    try {
      const resolvedHistoryHome = await this.fileService.resolve(historyHome);
      if (resolvedHistoryHome.children) {
        const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
        const promises = [];
        for (const child of resolvedHistoryHome.children) {
          promises.push(limiter.queue(async () => {
            if (token.isCancellationRequested) {
              return;
            }
            try {
              const serializedModel = JSON.parse((await this.fileService.readFile(joinPath(child.resource, WorkingCopyHistoryModel.ENTRIES_FILE))).value.toString());
              if (serializedModel.entries.length > 0) {
                all.set(URI.parse(serializedModel.resource), true);
              }
            } catch (error) {
            }
          }));
        }
        await Promise.all(promises);
      }
    } catch (error) {
    }
    return Array.from(all.keys());
  }
  async getModel(resource) {
    const historyHome = await this.localHistoryHome.p;
    let model = this.models.get(resource);
    if (!model) {
      model = new WorkingCopyHistoryModel(resource, historyHome, this._onDidAddEntry, this._onDidChangeEntry, this._onDidReplaceEntry, this._onDidRemoveEntry, this.getModelOptions(), this.fileService, this.labelService, this.logService, this.configurationService);
      this.models.set(resource, model);
    }
    return model;
  }
};
WorkingCopyHistoryService.FILE_MOVED_SOURCE = SaveSourceRegistry.registerSource("moved.source", localize("moved.source", "File Moved"));
WorkingCopyHistoryService.FILE_RENAMED_SOURCE = SaveSourceRegistry.registerSource("renamed.source", localize("renamed.source", "File Renamed"));
WorkingCopyHistoryService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IConfigurationService)
], WorkingCopyHistoryService);
let NativeWorkingCopyHistoryService = class extends WorkingCopyHistoryService {
  constructor(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, lifecycleService, logService, configurationService) {
    super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService);
    this.lifecycleService = lifecycleService;
    // 5min
    this.isRemotelyStored = typeof this.environmentService.remoteAuthority === "string";
    this.storeAllCts = this._register(new CancellationTokenSource());
    this.storeAllScheduler = this._register(new RunOnceScheduler(() => this.storeAll(this.storeAllCts.token), NativeWorkingCopyHistoryService.STORE_ALL_INTERVAL));
    this.registerListeners();
  }
  registerListeners() {
    if (!this.isRemotelyStored) {
      this._register(this.lifecycleService.onWillShutdown((e) => this.onWillShutdown(e)));
      this._register(Event.any(this.onDidAddEntry, this.onDidChangeEntry, this.onDidReplaceEntry, this.onDidRemoveEntry)(() => this.onDidChangeModels()));
    }
  }
  getModelOptions() {
    return {
      flushOnChange: this.isRemotelyStored
      /* because the connection might drop anytime */
    };
  }
  onWillShutdown(e) {
    this.storeAllScheduler.dispose();
    this.storeAllCts.dispose(true);
    e.join(this.storeAll(e.token), { id: "join.workingCopyHistory", label: localize("join.workingCopyHistory", "Saving local history") });
  }
  onDidChangeModels() {
    if (!this.storeAllScheduler.isScheduled()) {
      this.storeAllScheduler.schedule();
    }
  }
  async storeAll(token) {
    const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
    const promises = [];
    const models = Array.from(this.models.values());
    for (const model of models) {
      promises.push(limiter.queue(async () => {
        if (token.isCancellationRequested) {
          return;
        }
        try {
          await model.store(token);
        } catch (error) {
          this.logService.trace(error);
        }
      }));
    }
    await Promise.all(promises);
  }
};
NativeWorkingCopyHistoryService.STORE_ALL_INTERVAL = 5 * 60 * 1e3;
NativeWorkingCopyHistoryService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService)
], NativeWorkingCopyHistoryService);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
export {
  NativeWorkingCopyHistoryService,
  WorkingCopyHistoryModel,
  WorkingCopyHistoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFx3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSwgV2lsbFNodXRkb3duRXZlbnQgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBXb3JraW5nQ29weUhpc3RvcnlUcmFja2VyIH0gZnJvbSAnLi93b3JraW5nQ29weUhpc3RvcnlUcmFja2VyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnlEZXNjcmlwdG9yLCBJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQsIElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBNQVhfUEFSQUxMRUxfSElTVE9SWV9JT19PUFMgfSBmcm9tICcuL3dvcmtpbmdDb3B5SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBMaW1pdGVyLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgZXh0bmFtZSwgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgaW5kZXhPZlBhdGgsIHJhbmRvbVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTYXZlU291cmNlLCBTYXZlU291cmNlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbCB7XG5cdHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IHN0cmluZztcblx0cmVhZG9ubHkgZW50cmllczogSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbEVudHJ5W107XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsRW50cnkge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgc291cmNlPzogU2F2ZVNvdXJjZTtcblx0cmVhZG9ubHkgc291cmNlRGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gZmx1c2ggd2hlbiB0aGUgbW9kZWwgY2hhbmdlcy4gSWYgbm90XG5cdCAqIGNvbmZpZ3VyZWQsIGBtb2RlbC5zdG9yZSgpYCBoYXMgdG8gYmUgY2FsbGVkXG5cdCAqIGV4cGxpY2l0bHkuXG5cdCAqL1xuXHRmbHVzaE9uQ2hhbmdlOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwge1xuXG5cdHN0YXRpYyByZWFkb25seSBFTlRSSUVTX0ZJTEUgPSAnZW50cmllcy5qc29uJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX1NBVkVEX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgnZGVmYXVsdC5zb3VyY2UnLCBsb2NhbGl6ZSgnZGVmYXVsdC5zb3VyY2UnLCBcIkZpbGUgU2F2ZWRcIikpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFVFRJTkdTID0ge1xuXHRcdE1BWF9FTlRSSUVTOiAnd29ya2JlbmNoLmxvY2FsSGlzdG9yeS5tYXhGaWxlRW50cmllcycsXG5cdFx0TUVSR0VfUEVSSU9EOiAnd29ya2JlbmNoLmxvY2FsSGlzdG9yeS5tZXJnZVdpbmRvdydcblx0fTtcblxuXHRwcml2YXRlIGVudHJpZXM6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeVtdID0gW107XG5cblx0cHJpdmF0ZSB3aGVuUmVzb2x2ZWQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3b3JraW5nQ29weVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya2luZ0NvcHlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBoaXN0b3J5RW50cmllc0ZvbGRlcjogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhpc3RvcnlFbnRyaWVzTGlzdGluZ0ZpbGU6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGhpc3RvcnlFbnRyaWVzTmFtZU1hdGNoZXI6IFJlZ0V4cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHZlcnNpb25JZCA9IDA7XG5cdHByaXZhdGUgc3RvcmVkVmVyc2lvbklkID0gdGhpcy52ZXJzaW9uSWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZUxpbWl0ZXIgPSBuZXcgTGltaXRlcigxKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JraW5nQ29weVJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBoaXN0b3J5SG9tZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZW50cnlBZGRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVudHJ5Q2hhbmdlZEVtaXR0ZXI6IEVtaXR0ZXI8SVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVudHJ5UmVwbGFjZWRFbWl0dGVyOiBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbnRyeVJlbW92ZWRFbWl0dGVyOiBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJV29ya2luZ0NvcHlIaXN0b3J5TW9kZWxPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLnNldFdvcmtpbmdDb3B5KHdvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRXb3JraW5nQ29weSh3b3JraW5nQ29weVJlc291cmNlOiBVUkkpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSB3b3JraW5nIGNvcHlcblx0XHR0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UgPSB3b3JraW5nQ29weVJlc291cmNlO1xuXHRcdHRoaXMud29ya2luZ0NvcHlOYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh3b3JraW5nQ29weVJlc291cmNlKTtcblxuXHRcdHRoaXMuaGlzdG9yeUVudHJpZXNOYW1lTWF0Y2hlciA9IG5ldyBSZWdFeHAoYFtBLVphLXowLTldezR9JHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGV4dG5hbWUod29ya2luZ0NvcHlSZXNvdXJjZSkpfWApO1xuXG5cdFx0Ly8gVXBkYXRlIGxvY2F0aW9uc1xuXHRcdHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIgPSB0aGlzLnRvSGlzdG9yeUVudHJpZXNGb2xkZXIodGhpcy5oaXN0b3J5SG9tZSwgd29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cdFx0dGhpcy5oaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlID0gam9pblBhdGgodGhpcy5oaXN0b3J5RW50cmllc0ZvbGRlciwgV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuRU5UUklFU19GSUxFKTtcblxuXHRcdC8vIFJlc2V0IGVudHJpZXMgYW5kIHJlc29sdmVkIGNhY2hlXG5cdFx0dGhpcy5lbnRyaWVzID0gW107XG5cdFx0dGhpcy53aGVuUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRvSGlzdG9yeUVudHJpZXNGb2xkZXIoaGlzdG9yeUhvbWU6IFVSSSwgd29ya2luZ0NvcHlSZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gam9pblBhdGgoaGlzdG9yeUhvbWUsIGhhc2god29ya2luZ0NvcHlSZXNvdXJjZS50b1N0cmluZygpKS50b1N0cmluZygxNikpO1xuXHR9XG5cblx0YXN5bmMgYWRkRW50cnkoc291cmNlID0gV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuRklMRV9TQVZFRF9TT1VSQ0UsIHNvdXJjZURlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsIHRpbWVzdGFtcCA9IERhdGUubm93KCksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5PiB7XG5cdFx0bGV0IGVudHJ5VG9SZXBsYWNlOiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBGaWd1cmUgb3V0IGlmIHRoZSBsYXN0IGVudHJ5IHNob3VsZCBiZSByZXBsYWNlZCBiYXNlZFxuXHRcdC8vIG9uIHNldHRpbmdzIHRoYXQgY2FuIGRlZmluZSBhIGludGVydmFsIGZvciB3aGVuIGFuXG5cdFx0Ly8gZW50cnkgaXMgbm90IGFkZGVkIGFzIG5ldyBlbnRyeSBidXQgc2hvdWxkIHJlcGxhY2UuXG5cdFx0Ly8gSG93ZXZlciwgd2hlbiBzYXZlIHNvdXJjZSBpcyBkaWZmZXJlbnQsIG5ldmVyIHJlcGxhY2UuXG5cdFx0Y29uc3QgbGFzdEVudHJ5ID0gdGhpcy5lbnRyaWVzLmF0KC0xKTtcblx0XHRpZiAobGFzdEVudHJ5ICYmIGxhc3RFbnRyeS5zb3VyY2UgPT09IHNvdXJjZSkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFJlcGxhY2VJbnRlcnZhbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihXb3JraW5nQ29weUhpc3RvcnlNb2RlbC5TRVRUSU5HUy5NRVJHRV9QRVJJT0QsIHsgcmVzb3VyY2U6IHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSB9KTtcblx0XHRcdGlmICh0aW1lc3RhbXAgLSBsYXN0RW50cnkudGltZXN0YW1wIDw9IChjb25maWd1cmVkUmVwbGFjZUludGVydmFsICogMTAwMCAvKiBjb252ZXJ0IHRvIG1pbGxpZXMgKi8pKSB7XG5cdFx0XHRcdGVudHJ5VG9SZXBsYWNlID0gbGFzdEVudHJ5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5O1xuXG5cdFx0Ly8gUmVwbGFjZSBsYXN0ZXN0IGVudHJ5IGluIGhpc3Rvcnlcblx0XHRpZiAoZW50cnlUb1JlcGxhY2UpIHtcblx0XHRcdGVudHJ5ID0gYXdhaXQgdGhpcy5kb1JlcGxhY2VFbnRyeShlbnRyeVRvUmVwbGFjZSwgc291cmNlLCBzb3VyY2VEZXNjcmlwdGlvbiwgdGltZXN0YW1wLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGVudHJ5IHRvIGhpc3Rvcnlcblx0XHRlbHNlIHtcblx0XHRcdGVudHJ5ID0gYXdhaXQgdGhpcy5kb0FkZEVudHJ5KHNvdXJjZSwgc291cmNlRGVzY3JpcHRpb24sIHRpbWVzdGFtcCwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEZsdXNoIG5vdyBpZiBjb25maWd1cmVkXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5mbHVzaE9uQ2hhbmdlICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZSh0b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0FkZEVudHJ5KHNvdXJjZTogU2F2ZVNvdXJjZSwgc291cmNlRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCwgdGltZXN0YW1wOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlSZXNvdXJjZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlOYW1lID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53b3JraW5nQ29weU5hbWUpO1xuXHRcdGNvbnN0IGhpc3RvcnlFbnRyaWVzRm9sZGVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5oaXN0b3J5RW50cmllc0ZvbGRlcik7XG5cblx0XHQvLyBQZXJmb3JtIGEgZmFzdCBjbG9uZSBvcGVyYXRpb24gd2l0aCBtaW5pbWFsIG92ZXJoZWFkIHRvIGEgbmV3IHJhbmRvbSBsb2NhdGlvblxuXHRcdGNvbnN0IGlkID0gYCR7cmFuZG9tUGF0aCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgNCl9JHtleHRuYW1lKHdvcmtpbmdDb3B5UmVzb3VyY2UpfWA7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBqb2luUGF0aChoaXN0b3J5RW50cmllc0ZvbGRlciwgaWQpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2xvbmVGaWxlKHdvcmtpbmdDb3B5UmVzb3VyY2UsIGxvY2F0aW9uKTtcblxuXHRcdC8vIEFkZCB0byBsaXN0IG9mIGVudHJpZXNcblx0XHRjb25zdCBlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5ID0ge1xuXHRcdFx0aWQsXG5cdFx0XHR3b3JraW5nQ29weTogeyByZXNvdXJjZTogd29ya2luZ0NvcHlSZXNvdXJjZSwgbmFtZTogd29ya2luZ0NvcHlOYW1lIH0sXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHRpbWVzdGFtcCxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHNvdXJjZURlc2NyaXB0aW9uXG5cdFx0fTtcblx0XHR0aGlzLmVudHJpZXMucHVzaChlbnRyeSk7XG5cblx0XHQvLyBVcGRhdGUgdmVyc2lvbiBJRCBvZiBtb2RlbCB0byB1c2UgZm9yIHN0b3JpbmcgbGF0ZXJcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5lbnRyeUFkZGVkRW1pdHRlci5maXJlKHsgZW50cnkgfSk7XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVwbGFjZUVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIHNvdXJjZTogU2F2ZVNvdXJjZSwgc291cmNlRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCwgdGltZXN0YW1wOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlSZXNvdXJjZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cblx0XHQvLyBQZXJmb3JtIGEgZmFzdCBjbG9uZSBvcGVyYXRpb24gd2l0aCBtaW5pbWFsIG92ZXJoZWFkIHRvIHRoZSBleGlzdGluZyBsb2NhdGlvblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2xvbmVGaWxlKHdvcmtpbmdDb3B5UmVzb3VyY2UsIGVudHJ5LmxvY2F0aW9uKTtcblxuXHRcdC8vIFVwZGF0ZSBlbnRyeVxuXHRcdGVudHJ5LnNvdXJjZSA9IHNvdXJjZTtcblx0XHRlbnRyeS5zb3VyY2VEZXNjcmlwdGlvbiA9IHNvdXJjZURlc2NyaXB0aW9uO1xuXHRcdGVudHJ5LnRpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblxuXHRcdC8vIFVwZGF0ZSB2ZXJzaW9uIElEIG9mIG1vZGVsIHRvIHVzZSBmb3Igc3RvcmluZyBsYXRlclxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLmVudHJ5UmVwbGFjZWRFbWl0dGVyLmZpcmUoeyBlbnRyeSB9KTtcblxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIGF3YWl0IHJlc29sdmluZyB3aGVuIHJlbW92aW5nIGVudHJpZXNcblx0XHRhd2FpdCB0aGlzLnJlc29sdmVFbnRyaWVzT25jZSgpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmVudHJpZXMuaW5kZXhPZihlbnRyeSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERlbGV0ZSBmcm9tIGRpc2tcblx0XHRhd2FpdCB0aGlzLmRlbGV0ZUVudHJ5KGVudHJ5KTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIG1vZGVsXG5cdFx0dGhpcy5lbnRyaWVzLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHQvLyBVcGRhdGUgdmVyc2lvbiBJRCBvZiBtb2RlbCB0byB1c2UgZm9yIHN0b3JpbmcgbGF0ZXJcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5lbnRyeVJlbW92ZWRFbWl0dGVyLmZpcmUoeyBlbnRyeSB9KTtcblxuXHRcdC8vIEZsdXNoIG5vdyBpZiBjb25maWd1cmVkXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5mbHVzaE9uQ2hhbmdlICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZSh0b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBwcm9wZXJ0aWVzOiB7IHNvdXJjZTogU2F2ZVNvdXJjZSB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBhd2FpdCByZXNvbHZpbmcgd2hlbiB1cGRhdGluZyBlbnRyaWVzXG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlRW50cmllc09uY2UoKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5lbnRyaWVzLmluZGV4T2YoZW50cnkpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgZW50cnlcblx0XHRlbnRyeS5zb3VyY2UgPSBwcm9wZXJ0aWVzLnNvdXJjZTtcblxuXHRcdC8vIFVwZGF0ZSB2ZXJzaW9uIElEIG9mIG1vZGVsIHRvIHVzZSBmb3Igc3RvcmluZyBsYXRlclxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLmVudHJ5Q2hhbmdlZEVtaXR0ZXIuZmlyZSh7IGVudHJ5IH0pO1xuXG5cdFx0Ly8gRmx1c2ggbm93IGlmIGNvbmZpZ3VyZWRcblx0XHRpZiAodGhpcy5vcHRpb25zLmZsdXNoT25DaGFuZ2UgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlKHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRFbnRyaWVzKCk6IFByb21pc2U8cmVhZG9ubHkgSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5W10+IHtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBhd2FpdCByZXNvbHZpbmcgd2hlbiBhbGwgZW50cmllcyBhcmUgYXNrZWQgZm9yXG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlRW50cmllc09uY2UoKTtcblxuXHRcdC8vIFJldHVybiBhcyBtYW55IGVudHJpZXMgYXMgY29uZmlndXJlZCBieSB1c2VyIHNldHRpbmdzXG5cdFx0Y29uc3QgY29uZmlndXJlZE1heEVudHJpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuU0VUVElOR1MuTUFYX0VOVFJJRVMsIHsgcmVzb3VyY2U6IHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSB9KTtcblx0XHRpZiAodGhpcy5lbnRyaWVzLmxlbmd0aCA+IGNvbmZpZ3VyZWRNYXhFbnRyaWVzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lbnRyaWVzLnNsaWNlKHRoaXMuZW50cmllcy5sZW5ndGggLSBjb25maWd1cmVkTWF4RW50cmllcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZW50cmllcztcblx0fVxuXG5cdGFzeW5jIGhhc0VudHJpZXMoc2tpcFJlc29sdmU6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBhd2FpdCByZXNvbHZpbmcgdW5sZXNzIGV4cGxpY2l0bHkgc2tpcHBlZFxuXHRcdGlmICghc2tpcFJlc29sdmUpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZUVudHJpZXNPbmNlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZW50cmllcy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlRW50cmllc09uY2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLndoZW5SZXNvbHZlZCkge1xuXHRcdFx0dGhpcy53aGVuUmVzb2x2ZWQgPSB0aGlzLmRvUmVzb2x2ZUVudHJpZXMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy53aGVuUmVzb2x2ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUVudHJpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZXNvbHZlIGZyb20gZGlza1xuXHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCB0aGlzLnJlc29sdmVFbnRyaWVzRnJvbURpc2soKTtcblxuXHRcdC8vIFdlIG5vdyBuZWVkIHRvIG1lcmdlIG91ciBpbi1tZW1vcnkgZW50cmllcyB3aXRoIHRoZVxuXHRcdC8vIGVudHJpZXMgd2UgaGF2ZSBmb3VuZCBvbiBkaXNrIGJlY2F1c2UgaXQgaXMgcG9zc2libGVcblx0XHQvLyB0aGF0IG5ldyBlbnRyaWVzIGhhdmUgYmVlbiBhZGRlZCBiZWZvcmUgdGhlIGVudHJpZXNcblx0XHQvLyBsaXN0aW5nIGZpbGUgd2FzIHVwZGF0ZWRcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuZW50cmllcykge1xuXHRcdFx0ZW50cmllcy5zZXQoZW50cnkuaWQsIGVudHJ5KTtcblx0XHR9XG5cblx0XHQvLyBTZXQgYXMgZW50cmllcywgc29ydGVkIGJ5IHRpbWVzdGFtcFxuXHRcdHRoaXMuZW50cmllcyA9IEFycmF5LmZyb20oZW50cmllcy52YWx1ZXMoKSkuc29ydCgoZW50cnlBLCBlbnRyeUIpID0+IGVudHJ5QS50aW1lc3RhbXAgLSBlbnRyeUIudGltZXN0YW1wKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUVudHJpZXNGcm9tRGlzaygpOiBQcm9taXNlPE1hcDxzdHJpbmcgLyogSUQgKi8sIElXb3JraW5nQ29weUhpc3RvcnlFbnRyeT4+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weVJlc291cmNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53b3JraW5nQ29weVJlc291cmNlKTtcblx0XHRjb25zdCB3b3JraW5nQ29weU5hbWUgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLndvcmtpbmdDb3B5TmFtZSk7XG5cblx0XHRjb25zdCBbZW50cnlMaXN0aW5nLCBlbnRyeVN0YXRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBlbnRyaWVzIGxpc3RpbmcgZmlsZVxuXHRcdFx0dGhpcy5yZWFkRW50cmllc0ZpbGUoKSxcblxuXHRcdFx0Ly8gUmVzb2x2ZSBjaGlsZHJlbiBvZiBoaXN0b3J5IGZvbGRlclxuXHRcdFx0dGhpcy5yZWFkRW50cmllc0ZvbGRlcigpXG5cdFx0XSk7XG5cblx0XHQvLyBBZGQgZnJvbSByYXcgZm9sZGVyIGNoaWxkcmVuXG5cdFx0Y29uc3QgZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnk+KCk7XG5cdFx0aWYgKGVudHJ5U3RhdHMpIHtcblx0XHRcdGZvciAoY29uc3QgZW50cnlTdGF0IG9mIGVudHJ5U3RhdHMpIHtcblx0XHRcdFx0ZW50cmllcy5zZXQoZW50cnlTdGF0Lm5hbWUsIHtcblx0XHRcdFx0XHRpZDogZW50cnlTdGF0Lm5hbWUsXG5cdFx0XHRcdFx0d29ya2luZ0NvcHk6IHsgcmVzb3VyY2U6IHdvcmtpbmdDb3B5UmVzb3VyY2UsIG5hbWU6IHdvcmtpbmdDb3B5TmFtZSB9LFxuXHRcdFx0XHRcdGxvY2F0aW9uOiBlbnRyeVN0YXQucmVzb3VyY2UsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiBlbnRyeVN0YXQubXRpbWUsXG5cdFx0XHRcdFx0c291cmNlOiBXb3JraW5nQ29weUhpc3RvcnlNb2RlbC5GSUxFX1NBVkVEX1NPVVJDRSxcblx0XHRcdFx0XHRzb3VyY2VEZXNjcmlwdGlvbjogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBmcm9tIGxpc3RpbmcgKHRvIGhhdmUgbW9yZSBzcGVjaWZpYyBtZXRhZGF0YSlcblx0XHRpZiAoZW50cnlMaXN0aW5nKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJ5TGlzdGluZy5lbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSBlbnRyaWVzLmdldChlbnRyeS5pZCk7XG5cdFx0XHRcdGlmIChleGlzdGluZ0VudHJ5KSB7XG5cdFx0XHRcdFx0ZW50cmllcy5zZXQoZW50cnkuaWQsIHtcblx0XHRcdFx0XHRcdC4uLmV4aXN0aW5nRW50cnksXG5cdFx0XHRcdFx0XHR0aW1lc3RhbXA6IGVudHJ5LnRpbWVzdGFtcCxcblx0XHRcdFx0XHRcdHNvdXJjZTogZW50cnkuc291cmNlID8/IGV4aXN0aW5nRW50cnkuc291cmNlLFxuXHRcdFx0XHRcdFx0c291cmNlRGVzY3JpcHRpb246IGVudHJ5LnNvdXJjZURlc2NyaXB0aW9uID8/IGV4aXN0aW5nRW50cnkuc291cmNlRGVzY3JpcHRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbnRyaWVzO1xuXHR9XG5cblx0YXN5bmMgbW92ZUVudHJpZXModGFyZ2V0OiBXb3JraW5nQ29weUhpc3RvcnlNb2RlbCwgc291cmNlOiBTYXZlU291cmNlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHNvdXJjZURlc2NyaXB0aW9uID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53b3JraW5nQ29weVJlc291cmNlKSk7XG5cblx0XHQvLyBNb3ZlIGFsbCBlbnRyaWVzIGludG8gdGhlIHRhcmdldCBmb2xkZXIgc28gdGhhdCB3ZSBwcmVzZXJ2ZVxuXHRcdC8vIGFueSBleGlzdGluZyBoaXN0b3J5IGVudHJpZXMgdGhhdCBtaWdodCBhbHJlYWR5IGJlIHByZXNlbnRcblxuXHRcdGNvbnN0IHNvdXJjZUhpc3RvcnlFbnRyaWVzRm9sZGVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5oaXN0b3J5RW50cmllc0ZvbGRlcik7XG5cdFx0Y29uc3QgdGFyZ2V0SGlzdG9yeUVudHJpZXNGb2xkZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0YXJnZXQuaGlzdG9yeUVudHJpZXNGb2xkZXIpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuZW50cmllcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLm1vdmUoZW50cnkubG9jYXRpb24sIGpvaW5QYXRoKHRhcmdldEhpc3RvcnlFbnRyaWVzRm9sZGVyLCBlbnRyeS5pZCksIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoc291cmNlSGlzdG9yeUVudHJpZXNGb2xkZXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNGaWxlTm90Rm91bmQoZXJyb3IpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gSW4gY2FzZSBvZiBhbiBlcnJvciAodW5sZXNzIG5vdCBmb3VuZCksIGZhbGxiYWNrIHRvIG1vdmluZyB0aGUgZW50aXJlIGZvbGRlclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UubW92ZShzb3VyY2VIaXN0b3J5RW50cmllc0ZvbGRlciwgdGFyZ2V0SGlzdG9yeUVudHJpZXNGb2xkZXIsIHRydWUpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc0ZpbGVOb3RGb3VuZChlcnJvcikpIHtcblx0XHRcdFx0XHRcdHRoaXMudHJhY2VFcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVyZ2Ugb3VyIGVudHJpZXMgd2l0aCB0YXJnZXQgZW50cmllcyBiZWZvcmUgdXBkYXRpbmcgYXNzb2NpYXRlZCB3b3JraW5nIGNvcHlcblx0XHRjb25zdCBhbGxFbnRyaWVzID0gZGlzdGluY3QoWy4uLnRoaXMuZW50cmllcywgLi4udGFyZ2V0LmVudHJpZXNdLCBlbnRyeSA9PiBlbnRyeS5pZCkuc29ydCgoZW50cnlBLCBlbnRyeUIpID0+IGVudHJ5QS50aW1lc3RhbXAgLSBlbnRyeUIudGltZXN0YW1wKTtcblxuXHRcdC8vIFVwZGF0ZSBvdXIgYXNzb2NpYXRlZCB3b3JraW5nIGNvcHlcblx0XHRjb25zdCB0YXJnZXRXb3JraW5nQ29weVJlc291cmNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGFyZ2V0LndvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHRcdHRoaXMuc2V0V29ya2luZ0NvcHkodGFyZ2V0V29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cblx0XHQvLyBSZXN0b3JlIG91ciBlbnRyaWVzIGFuZCBlbnN1cmUgY29ycmVjdCBtZXRhZGF0YVxuXHRcdGNvbnN0IHRhcmdldFdvcmtpbmdDb3B5TmFtZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRhcmdldC53b3JraW5nQ29weU5hbWUpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgYWxsRW50cmllcykge1xuXHRcdFx0dGhpcy5lbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRpZDogZW50cnkuaWQsXG5cdFx0XHRcdGxvY2F0aW9uOiBqb2luUGF0aCh0YXJnZXRIaXN0b3J5RW50cmllc0ZvbGRlciwgZW50cnkuaWQpLFxuXHRcdFx0XHRzb3VyY2U6IGVudHJ5LnNvdXJjZSxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRpb246IGVudHJ5LnNvdXJjZURlc2NyaXB0aW9uLFxuXHRcdFx0XHR0aW1lc3RhbXA6IGVudHJ5LnRpbWVzdGFtcCxcblx0XHRcdFx0d29ya2luZ0NvcHk6IHtcblx0XHRcdFx0XHRyZXNvdXJjZTogdGFyZ2V0V29ya2luZ0NvcHlSZXNvdXJjZSxcblx0XHRcdFx0XHRuYW1lOiB0YXJnZXRXb3JraW5nQ29weU5hbWVcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGVudHJ5IGZvciB0aGUgbW92ZVxuXHRcdGF3YWl0IHRoaXMuYWRkRW50cnkoc291cmNlLCBzb3VyY2VEZXNjcmlwdGlvbiwgdGltZXN0YW1wLCB0b2tlbik7XG5cblx0XHQvLyBTdG9yZSBtb2RlbCBhZ2FpbiB0byB1cGRhdGVkIGxvY2F0aW9uXG5cdFx0YXdhaXQgdGhpcy5zdG9yZSh0b2tlbik7XG5cdH1cblxuXHRhc3luYyBzdG9yZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkU3RvcmUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBhIGBMaW1pdGVyYCB0byBwcmV2ZW50IG11bHRpcGxlIGBzdG9yZWAgb3BlcmF0aW9uc1xuXHRcdC8vIHBvdGVudGlhbGx5IHJ1bm5pbmcgYXQgdGhlIHNhbWUgdGltZVxuXG5cdFx0YXdhaXQgdGhpcy5zdG9yZUxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLnNob3VsZFN0b3JlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1N0b3JlKHRva2VuKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU3RvcmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmVkVmVyc2lvbklkICE9PSB0aGlzLnZlcnNpb25JZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TdG9yZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5RW50cmllc0ZvbGRlciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIGF3YWl0IHJlc29sdmluZyB3aGVuIHBlcnNpc3Rpbmdcblx0XHRhd2FpdCB0aGlzLnJlc29sdmVFbnRyaWVzT25jZSgpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENsZWFudXAgYmFzZWQgb24gbWF4LWVudHJpZXMgc2V0dGluZ1xuXHRcdGF3YWl0IHRoaXMuY2xlYW5VcEVudHJpZXMoKTtcblxuXHRcdC8vIFdpdGhvdXQgZW50cmllcywgcmVtb3ZlIHRoZSBoaXN0b3J5IGZvbGRlclxuXHRcdGNvbnN0IHN0b3JlZFZlcnNpb24gPSB0aGlzLnZlcnNpb25JZDtcblx0XHRpZiAodGhpcy5lbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoaGlzdG9yeUVudHJpZXNGb2xkZXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy50cmFjZUVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBzdGlsbCBoYXZlIGVudHJpZXMsIHVwZGF0ZSB0aGUgZW50cmllcyBtZXRhIGZpbGVcblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMud3JpdGVFbnRyaWVzRmlsZSgpO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgYXMgc3RvcmVkIHZlcnNpb25cblx0XHR0aGlzLnN0b3JlZFZlcnNpb25JZCA9IHN0b3JlZFZlcnNpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFuVXBFbnRyaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNYXhFbnRyaWVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLlNFVFRJTkdTLk1BWF9FTlRSSUVTLCB7IHJlc291cmNlOiB0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UgfSk7XG5cdFx0aWYgKHRoaXMuZW50cmllcy5sZW5ndGggPD0gY29uZmlndXJlZE1heEVudHJpZXMpIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyB0byBjbGVhbnVwXG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllc1RvRGVsZXRlID0gdGhpcy5lbnRyaWVzLnNsaWNlKDAsIHRoaXMuZW50cmllcy5sZW5ndGggLSBjb25maWd1cmVkTWF4RW50cmllcyk7XG5cdFx0Y29uc3QgZW50cmllc1RvS2VlcCA9IHRoaXMuZW50cmllcy5zbGljZSh0aGlzLmVudHJpZXMubGVuZ3RoIC0gY29uZmlndXJlZE1heEVudHJpZXMpO1xuXG5cdFx0Ly8gRGVsZXRlIGVudHJpZXMgZnJvbSBkaXNrIGFzIGluc3RydWN0ZWRcblx0XHRmb3IgKGNvbnN0IGVudHJ5VG9EZWxldGUgb2YgZW50cmllc1RvRGVsZXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZUVudHJ5KGVudHJ5VG9EZWxldGUpO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0byB1cGRhdGUgb3VyIGluLW1lbW9yeSBtb2RlbCBhcyB3ZWxsXG5cdFx0Ly8gYmVjYXVzZSBpdCB3aWxsIGJlIHBlcnNpc3RlZCByaWdodCBhZnRlclxuXHRcdHRoaXMuZW50cmllcyA9IGVudHJpZXNUb0tlZXA7XG5cblx0XHQvLyBFdmVudHNcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXNUb0RlbGV0ZSkge1xuXHRcdFx0dGhpcy5lbnRyeVJlbW92ZWRFbWl0dGVyLmZpcmUoeyBlbnRyeSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZUVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoZW50cnkubG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLnRyYWNlRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVFbnRyaWVzRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weVJlc291cmNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53b3JraW5nQ29weVJlc291cmNlKTtcblx0XHRjb25zdCBoaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5oaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlKTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZWRNb2RlbDogSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbCA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRyZXNvdXJjZTogd29ya2luZ0NvcHlSZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0ZW50cmllczogdGhpcy5lbnRyaWVzLm1hcChlbnRyeSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0XHRcdHNvdXJjZTogZW50cnkuc291cmNlICE9PSBXb3JraW5nQ29weUhpc3RvcnlNb2RlbC5GSUxFX1NBVkVEX1NPVVJDRSA/IGVudHJ5LnNvdXJjZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2VEZXNjcmlwdGlvbjogZW50cnkuc291cmNlRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0dGltZXN0YW1wOiBlbnRyeS50aW1lc3RhbXBcblx0XHRcdFx0fTtcblx0XHRcdH0pXG5cdFx0fTtcblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGhpc3RvcnlFbnRyaWVzTGlzdGluZ0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZE1vZGVsKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkRW50cmllc0ZpbGUoKTogUHJvbWlzZTxJU2VyaWFsaXplZFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSk7XG5cblx0XHRsZXQgc2VyaWFsaXplZE1vZGVsOiBJU2VyaWFsaXplZFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRzZXJpYWxpemVkTW9kZWwgPSBKU09OLnBhcnNlKChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGhpc3RvcnlFbnRyaWVzTGlzdGluZ0ZpbGUpKS52YWx1ZS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCF0aGlzLmlzRmlsZU5vdEZvdW5kKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLnRyYWNlRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzZXJpYWxpemVkTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRFbnRyaWVzRm9sZGVyKCk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5RW50cmllc0ZvbGRlciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIpO1xuXHRcdGNvbnN0IGhpc3RvcnlFbnRyaWVzTmFtZU1hdGNoZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmhpc3RvcnlFbnRyaWVzTmFtZU1hdGNoZXIpO1xuXG5cdFx0bGV0IHJhd0VudHJpZXM6IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVzb2x2ZSBjaGlsZHJlbiBvZiBmb2xkZXIgb24gZGlza1xuXHRcdHRyeSB7XG5cdFx0XHRyYXdFbnRyaWVzID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShoaXN0b3J5RW50cmllc0ZvbGRlciwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLmNoaWxkcmVuO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNGaWxlTm90Rm91bmQoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VFcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyYXdFbnRyaWVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgZW50cmllcyB0aGF0IGRvIG5vdCBzZWVtIHRvIGhhdmUgdmFsaWQgZmlsZSBuYW1lXG5cdFx0cmV0dXJuIHJhd0VudHJpZXMuZmlsdGVyKGVudHJ5ID0+XG5cdFx0XHQhaXNFcXVhbChlbnRyeS5yZXNvdXJjZSwgdGhpcy5oaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlKSAmJiAvLyBub3QgdGhlIGxpc3RpbmdzIGZpbGVcblx0XHRcdGhpc3RvcnlFbnRyaWVzTmFtZU1hdGNoZXIudGVzdChlbnRyeS5uYW1lKVx0XHRcdFx0XHQvLyBtYXRjaGluZyBvdXIgZXhwZWN0ZWQgZmlsZSBwYXR0ZXJuIGZvciBlbnRyaWVzXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgaXNGaWxlTm90Rm91bmQoZXJyb3I6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORDtcblx0fVxuXG5cdHByaXZhdGUgdHJhY2VFcnJvcihlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tXb3JraW5nIENvcHkgSGlzdG9yeSBTZXJ2aWNlXScsIGVycm9yKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRklMRV9NT1ZFRF9TT1VSQ0UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ21vdmVkLnNvdXJjZScsIGxvY2FsaXplKCdtb3ZlZC5zb3VyY2UnLCBcIkZpbGUgTW92ZWRcIikpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX1JFTkFNRURfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCdyZW5hbWVkLnNvdXJjZScsIGxvY2FsaXplKCdyZW5hbWVkLnNvdXJjZScsIFwiRmlsZSBSZW5hbWVkXCIpKTtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQWRkRW50cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZEVudHJ5ID0gdGhpcy5fb25EaWRBZGRFbnRyeS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRW50cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVudHJ5ID0gdGhpcy5fb25EaWRDaGFuZ2VFbnRyeS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkUmVwbGFjZUVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXBsYWNlRW50cnkgPSB0aGlzLl9vbkRpZFJlcGxhY2VFbnRyeS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1vdmVFbnRyaWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW92ZUVudHJpZXMgPSB0aGlzLl9vbkRpZE1vdmVFbnRyaWVzLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRSZW1vdmVFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlRW50cnkgPSB0aGlzLl9vbkRpZFJlbW92ZUVudHJ5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlRW50cmllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUVudHJpZXMgPSB0aGlzLl9vbkRpZFJlbW92ZUVudHJpZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbEhpc3RvcnlIb21lID0gbmV3IERlZmVycmVkUHJvbWlzZTxVUkk+KCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IG1vZGVscyA9IG5ldyBSZXNvdXJjZU1hcDxXb3JraW5nQ29weUhpc3RvcnlNb2RlbD4ocmVzb3VyY2UgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlc29sdmVMb2NhbEhpc3RvcnlIb21lKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVMb2NhbEhpc3RvcnlIb21lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBoaXN0b3J5SG9tZTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUHJlZmVyIGhpc3RvcnkgdG8gYmUgc3RvcmVkIGluIHRoZSByZW1vdGUgaWYgd2UgYXJlIGNvbm5lY3RlZCB0byBhIHJlbW90ZVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0aWYgKHJlbW90ZUVudikge1xuXHRcdFx0XHRoaXN0b3J5SG9tZSA9IHJlbW90ZUVudi5sb2NhbEhpc3RvcnlIb21lO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpOyAvLyBpZ25vcmUgYW5kIGZhbGxiYWNrIHRvIGxvY2FsXG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGZhbGxiYWNrIHRvIGxvY2FsIGlmIHRoZXJlIGlzIG5vIHJlbW90ZVxuXHRcdGlmICghaGlzdG9yeUhvbWUpIHtcblx0XHRcdGhpc3RvcnlIb21lID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UubG9jYWxIaXN0b3J5SG9tZTtcblx0XHR9XG5cblx0XHR0aGlzLmxvY2FsSGlzdG9yeUhvbWUuY29tcGxldGUoaGlzdG9yeUhvbWUpO1xuXHR9XG5cblx0YXN5bmMgbW92ZUVudHJpZXMoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjxVUkk+KE1BWF9QQVJBTExFTF9ISVNUT1JZX0lPX09QUyk7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8VVJJPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgbW9kZWxdIG9mIHRoaXMubW9kZWxzKSB7XG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIG1vZGVsIGRvZXMgbm90IG1hdGNoIG1vdmVkIHJlc291cmNlXG5cdFx0XHR9XG5cblx0XHRcdC8vIERldGVybWluZSBuZXcgcmVzdWx0aW5nIHRhcmdldCByZXNvdXJjZVxuXHRcdFx0bGV0IHRhcmdldFJlc291cmNlOiBVUkk7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UgPSB0YXJnZXQ7IC8vIGZpbGUgZ290IG1vdmVkXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGluZGV4T2ZQYXRoKHJlc291cmNlLnBhdGgsIHNvdXJjZS5wYXRoKTtcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UgPSBqb2luUGF0aCh0YXJnZXQsIHJlc291cmNlLnBhdGguc3Vic3RyKGluZGV4ICsgc291cmNlLnBhdGgubGVuZ3RoICsgMSkpOyAvLyBwYXJlbnQgZm9sZGVyIGdvdCBtb3ZlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWd1cmUgb3V0IHNhdmUgc291cmNlXG5cdFx0XHRsZXQgc2F2ZVNvdXJjZTogU2F2ZVNvdXJjZTtcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChkaXJuYW1lKHJlc291cmNlKSwgZGlybmFtZSh0YXJnZXRSZXNvdXJjZSkpKSB7XG5cdFx0XHRcdHNhdmVTb3VyY2UgPSBXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLkZJTEVfUkVOQU1FRF9TT1VSQ0U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzYXZlU291cmNlID0gV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5GSUxFX01PVkVEX1NPVVJDRTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTW92ZSBlbnRyaWVzIHRvIHRhcmdldCBxdWV1ZWRcblx0XHRcdHByb21pc2VzLnB1c2gobGltaXRlci5xdWV1ZSgoKSA9PiB0aGlzLmRvTW92ZUVudHJpZXMobW9kZWwsIHNhdmVTb3VyY2UsIHJlc291cmNlLCB0YXJnZXRSZXNvdXJjZSkpKTtcblx0XHR9XG5cblx0XHRpZiAoIXByb21pc2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IG1vdmUgb3BlcmF0aW9uc1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuX29uRGlkTW92ZUVudHJpZXMuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHJlc291cmNlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Nb3ZlRW50cmllcyhzb3VyY2U6IFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLCBzYXZlU291cmNlOiBTYXZlU291cmNlLCBzb3VyY2VXb3JraW5nQ29weVJlc291cmNlOiBVUkksIHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cblx0XHQvLyBNb3ZlIHRvIHRhcmdldCB2aWEgbW9kZWxcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmdldE1vZGVsKHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNvdXJjZS5tb3ZlRW50cmllcyh0YXJnZXQsIHNhdmVTb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsIGluIG91ciBtYXBcblx0XHR0aGlzLm1vZGVscy5kZWxldGUoc291cmNlV29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cdFx0dGhpcy5tb2RlbHMuc2V0KHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2UsIHNvdXJjZSk7XG5cblx0XHRyZXR1cm4gdGFyZ2V0V29ya2luZ0NvcHlSZXNvdXJjZTtcblx0fVxuXG5cdGFzeW5jIGFkZEVudHJ5KHsgcmVzb3VyY2UsIHNvdXJjZSwgdGltZXN0YW1wIH06IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeURlc2NyaXB0b3IsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gd2UgcmVxdWlyZSB0aGUgd29ya2luZyBjb3B5IHJlc291cmNlIHRvIGJlIGZpbGUgc2VydmljZSBhY2Nlc3NpYmxlXG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBoaXN0b3J5IG1vZGVsIGZvciB3b3JraW5nIGNvcHlcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gbW9kZWxcblx0XHRyZXR1cm4gbW9kZWwuYWRkRW50cnkoc291cmNlLCB1bmRlZmluZWQsIHRpbWVzdGFtcCwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRW50cnkoZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgcHJvcGVydGllczogeyBzb3VyY2U6IFNhdmVTb3VyY2UgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZXNvbHZlIGhpc3RvcnkgbW9kZWwgZm9yIHdvcmtpbmcgY29weVxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbChlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVuYW1lIGluIG1vZGVsXG5cdFx0cmV0dXJuIG1vZGVsLnVwZGF0ZUVudHJ5KGVudHJ5LCBwcm9wZXJ0aWVzLCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyByZW1vdmVFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFJlc29sdmUgaGlzdG9yeSBtb2RlbCBmb3Igd29ya2luZyBjb3B5XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmdldE1vZGVsKGVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBtb2RlbFxuXHRcdHJldHVybiBtb2RlbC5yZW1vdmVFbnRyeShlbnRyeSwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlQWxsKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlIb21lID0gYXdhaXQgdGhpcy5sb2NhbEhpc3RvcnlIb21lLnA7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgbW9kZWxzXG5cdFx0dGhpcy5tb2RlbHMuY2xlYXIoKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIGRpc2tcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChoaXN0b3J5SG9tZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUVudHJpZXMuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0RW50cmllcyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeVtdPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgbW9kZWwuZ2V0RW50cmllcygpO1xuXHRcdHJldHVybiBlbnRyaWVzID8/IFtdO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRjb25zdCBoaXN0b3J5SG9tZSA9IGF3YWl0IHRoaXMubG9jYWxIaXN0b3J5SG9tZS5wO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbCA9IG5ldyBSZXNvdXJjZU1hcDx0cnVlPigpO1xuXG5cdFx0Ly8gRmlsbCBpbiBhbGwga25vd24gbW9kZWwgcmVzb3VyY2VzICh0aGV5IG1pZ2h0IG5vdCBoYXZlIHlldCBwZXJzaXN0ZWQgdG8gZGlzaylcblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgbW9kZWxdIG9mIHRoaXMubW9kZWxzKSB7XG5cdFx0XHRjb25zdCBoYXNJbk1lbW9yeUVudHJpZXMgPSBhd2FpdCBtb2RlbC5oYXNFbnRyaWVzKHRydWUgLyogc2tpcCByZXNvbHZpbmcgYmVjYXVzZSB3ZSByZXNvbHZlIGJlbG93IGZyb20gZGlzayAqLyk7XG5cdFx0XHRpZiAoaGFzSW5NZW1vcnlFbnRyaWVzKSB7XG5cdFx0XHRcdGFsbC5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgYWxsIG90aGVyIHJlc291cmNlcyBieSBpdGVyYXRpbmcgdGhlIGhpc3RvcnkgaG9tZSBmb2xkZXJcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRIaXN0b3J5SG9tZSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShoaXN0b3J5SG9tZSk7XG5cdFx0XHRpZiAocmVzb2x2ZWRIaXN0b3J5SG9tZS5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBsaW1pdGVyID0gbmV3IExpbWl0ZXIoTUFYX1BBUkFMTEVMX0hJU1RPUllfSU9fT1BTKTtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJlc29sdmVkSGlzdG9yeUhvbWUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKGxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZE1vZGVsOiBJU2VyaWFsaXplZFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsID0gSlNPTi5wYXJzZSgoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShqb2luUGF0aChjaGlsZC5yZXNvdXJjZSwgV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuRU5UUklFU19GSUxFKSkpLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoc2VyaWFsaXplZE1vZGVsLmVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGFsbC5zZXQoVVJJLnBhcnNlKHNlcmlhbGl6ZWRNb2RlbC5yZXNvdXJjZSksIHRydWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmUgLSBtb2RlbCBtaWdodCBiZSBtaXNzaW5nIG9yIGNvcnJ1cHQsIGJ1dCB3ZSBuZWVkIGl0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmUgLSBoaXN0b3J5IG1pZ2h0IGJlIGVudGlyZWx5IGVtcHR5XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20oYWxsLmtleXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1vZGVsKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUhvbWUgPSBhd2FpdCB0aGlzLmxvY2FsSGlzdG9yeUhvbWUucDtcblxuXHRcdGxldCBtb2RlbCA9IHRoaXMubW9kZWxzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBuZXcgV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwocmVzb3VyY2UsIGhpc3RvcnlIb21lLCB0aGlzLl9vbkRpZEFkZEVudHJ5LCB0aGlzLl9vbkRpZENoYW5nZUVudHJ5LCB0aGlzLl9vbkRpZFJlcGxhY2VFbnRyeSwgdGhpcy5fb25EaWRSZW1vdmVFbnRyeSwgdGhpcy5nZXRNb2RlbE9wdGlvbnMoKSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR0aGlzLm1vZGVscy5zZXQocmVzb3VyY2UsIG1vZGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0TW9kZWxPcHRpb25zKCk6IElXb3JraW5nQ29weUhpc3RvcnlNb2RlbE9wdGlvbnM7XG5cbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgZXh0ZW5kcyBXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVE9SRV9BTExfSU5URVJWQUwgPSA1ICogNjAgKiAxMDAwOyAvLyA1bWluXG5cblx0cHJpdmF0ZSByZWFkb25seSBpc1JlbW90ZWx5U3RvcmVkID0gdHlwZW9mIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA9PT0gJ3N0cmluZyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZUFsbEN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZUFsbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuc3RvcmVBbGwodGhpcy5zdG9yZUFsbEN0cy50b2tlbiksIE5hdGl2ZVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuU1RPUkVfQUxMX0lOVEVSVkFMKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGZpbGVTZXJ2aWNlLCByZW1vdGVBZ2VudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVtb3RlbHlTdG9yZWQpIHtcblxuXHRcdFx0Ly8gTG9jYWw6IHBlcnNpc3QgYWxsIG9uIHNodXRkb3duXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB0aGlzLm9uV2lsbFNodXRkb3duKGUpKSk7XG5cblx0XHRcdC8vIExvY2FsOiBzY2hlZHVsZSBwZXJzaXN0IG9uIGNoYW5nZVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMub25EaWRBZGRFbnRyeSwgdGhpcy5vbkRpZENoYW5nZUVudHJ5LCB0aGlzLm9uRGlkUmVwbGFjZUVudHJ5LCB0aGlzLm9uRGlkUmVtb3ZlRW50cnkpKCgpID0+IHRoaXMub25EaWRDaGFuZ2VNb2RlbHMoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRNb2RlbE9wdGlvbnMoKTogSVdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHsgZmx1c2hPbkNoYW5nZTogdGhpcy5pc1JlbW90ZWx5U3RvcmVkIC8qIGJlY2F1c2UgdGhlIGNvbm5lY3Rpb24gbWlnaHQgZHJvcCBhbnl0aW1lICovIH07XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbFNodXRkb3duKGU6IFdpbGxTaHV0ZG93bkV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBEaXNwb3NlIHRoZSBzY2hlZHVsZXIuLi5cblx0XHR0aGlzLnN0b3JlQWxsU2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnN0b3JlQWxsQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cblx0XHQvLyAuLi5iZWNhdXNlIHdlIG5vdyBleHBsaWNpdGx5IHN0b3JlIGFsbCBtb2RlbHNcblx0XHRlLmpvaW4odGhpcy5zdG9yZUFsbChlLnRva2VuKSwgeyBpZDogJ2pvaW4ud29ya2luZ0NvcHlIaXN0b3J5JywgbGFiZWw6IGxvY2FsaXplKCdqb2luLndvcmtpbmdDb3B5SGlzdG9yeScsIFwiU2F2aW5nIGxvY2FsIGhpc3RvcnlcIikgfSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTW9kZWxzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdG9yZUFsbFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLnN0b3JlQWxsU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdG9yZUFsbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsaW1pdGVyID0gbmV3IExpbWl0ZXIoTUFYX1BBUkFMTEVMX0hJU1RPUllfSU9fT1BTKTtcblx0XHRjb25zdCBwcm9taXNlcyA9IFtdO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gQXJyYXkuZnJvbSh0aGlzLm1vZGVscy52YWx1ZXMoKSk7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBtb2RlbHMpIHtcblx0XHRcdHByb21pc2VzLnB1c2gobGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgbW9kZWwuc3RvcmUodG9rZW4pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cbn1cblxuLy8gUmVnaXN0ZXIgSGlzdG9yeSBUcmFja2VyXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oV29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUEwQyxjQUFjLDJCQUEyQjtBQUNuRixTQUFTLG1CQUFtQixzQkFBeUM7QUFDckUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBNkgsbUNBQW1DO0FBQ2hLLFNBQVMsb0JBQW9CLHFCQUFxQixvQkFBMkM7QUFDN0YsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQWlCLFNBQVMsd0JBQXdCO0FBQzNELFNBQVMsU0FBUyxTQUFTLFNBQVMsZ0JBQWdCO0FBQ3BELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsWUFBWTtBQUNyQixTQUFTLGFBQWEsa0JBQWtCO0FBQ3hDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFxQiwwQkFBMEI7QUFDL0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUF5QmhDLE1BQU0sMkJBQU4sTUFBTSx5QkFBd0I7QUFBQSxFQTRCcEMsWUFDQyxxQkFDaUIsYUFDQSxtQkFDQSxxQkFDQSxzQkFDQSxxQkFDQSxTQUNBLGFBQ0EsY0FDQSxZQUNBLHNCQUNoQjtBQVZnQjtBQUNBO0FBQ0E7QUFDQTtBQUNB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
