import { Promises, RunOnceScheduler, runWhenGlobalIdle } from "../../../base/common/async.js";
import { Emitter, Event, PauseableEmitter } from "../../../base/common/event.js";
import { Disposable, dispose, MutableDisposable } from "../../../base/common/lifecycle.js";
import { mark } from "../../../base/common/performance.js";
import { isUndefinedOrNull } from "../../../base/common/types.js";
import { InMemoryStorageDatabase, Storage, StorageHint } from "../../../base/parts/storage/common/storage.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { isUserDataProfile } from "../../userDataProfile/common/userDataProfile.js";
const IS_NEW_KEY = "__$__isNewStorageMarker";
const TARGET_KEY = "__$__targetStorageMarker";
const IStorageService = createDecorator("storageService");
var WillSaveStateReason = /* @__PURE__ */ ((WillSaveStateReason2) => {
  WillSaveStateReason2[WillSaveStateReason2["NONE"] = 0] = "NONE";
  WillSaveStateReason2[WillSaveStateReason2["SHUTDOWN"] = 1] = "SHUTDOWN";
  return WillSaveStateReason2;
})(WillSaveStateReason || {});
var StorageScope = /* @__PURE__ */ ((StorageScope2) => {
  StorageScope2[StorageScope2["APPLICATION_SHARED"] = -2] = "APPLICATION_SHARED";
  StorageScope2[StorageScope2["APPLICATION"] = -1] = "APPLICATION";
  StorageScope2[StorageScope2["PROFILE"] = 0] = "PROFILE";
  StorageScope2[StorageScope2["WORKSPACE"] = 1] = "WORKSPACE";
  return StorageScope2;
})(StorageScope || {});
var StorageTarget = /* @__PURE__ */ ((StorageTarget2) => {
  StorageTarget2[StorageTarget2["USER"] = 0] = "USER";
  StorageTarget2[StorageTarget2["MACHINE"] = 1] = "MACHINE";
  return StorageTarget2;
})(StorageTarget || {});
function loadKeyTargets(storage) {
  const keysRaw = storage.get(TARGET_KEY);
  if (keysRaw) {
    try {
      return JSON.parse(keysRaw);
    } catch (error) {
    }
  }
  return /* @__PURE__ */ Object.create(null);
}
const _AbstractStorageService = class _AbstractStorageService extends Disposable {
  constructor(options = { flushInterval: _AbstractStorageService.DEFAULT_FLUSH_INTERVAL }) {
    super();
    // every minute
    this._onDidChangeValue = this._register(new PauseableEmitter());
    this._onDidChangeTarget = this._register(new PauseableEmitter());
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onWillSaveState = this._register(new Emitter());
    this.onWillSaveState = this._onWillSaveState.event;
    this.runFlushWhenIdle = this._register(new MutableDisposable());
    this._workspaceKeyTargets = void 0;
    this._profileKeyTargets = void 0;
    this._applicationKeyTargets = void 0;
    this._applicationSharedKeyTargets = void 0;
    this.flushWhenIdleScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), options.flushInterval));
  }
  onDidChangeValue(scope, key, disposable) {
    return Event.filter(this._onDidChangeValue.event, (e) => e.scope === scope && (key === void 0 || e.key === key), disposable);
  }
  doFlushWhenIdle() {
    this.runFlushWhenIdle.value = runWhenGlobalIdle(() => {
      if (this.shouldFlushWhenIdle()) {
        this.flush();
      }
      this.flushWhenIdleScheduler.schedule();
    });
  }
  shouldFlushWhenIdle() {
    return true;
  }
  stopFlushWhenIdle() {
    dispose([this.runFlushWhenIdle, this.flushWhenIdleScheduler]);
  }
  initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        mark("code/willInitStorage");
        try {
          await this.doInitialize();
        } finally {
          mark("code/didInitStorage");
        }
        this.flushWhenIdleScheduler.schedule();
      })();
    }
    return this.initializationPromise;
  }
  emitDidChangeValue(scope, event) {
    const { key, external } = event;
    if (key === TARGET_KEY) {
      switch (scope) {
        case -2 /* APPLICATION_SHARED */:
          this._applicationSharedKeyTargets = void 0;
          break;
        case -1 /* APPLICATION */:
          this._applicationKeyTargets = void 0;
          break;
        case 0 /* PROFILE */:
          this._profileKeyTargets = void 0;
          break;
        case 1 /* WORKSPACE */:
          this._workspaceKeyTargets = void 0;
          break;
      }
      this._onDidChangeTarget.fire({ scope });
    } else {
      this._onDidChangeValue.fire({ scope, key, target: this.getKeyTargets(scope)[key], external });
    }
  }
  emitWillSaveState(reason) {
    this._onWillSaveState.fire({ reason });
  }
  get(key, scope, fallbackValue) {
    return this.getStorage(scope)?.get(key, fallbackValue);
  }
  getBoolean(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getBoolean(key, fallbackValue);
  }
  getNumber(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getNumber(key, fallbackValue);
  }
  getObject(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getObject(key, fallbackValue);
  }
  storeAll(entries, external) {
    this.withPausedEmitters(() => {
      for (const entry of entries) {
        this.store(entry.key, entry.value, entry.scope, entry.target, external);
      }
    });
  }
  store(key, value, scope, target, external = false) {
    if (isUndefinedOrNull(value)) {
      this.remove(key, scope, external);
      return;
    }
    this.withPausedEmitters(() => {
      this.updateKeyTarget(key, scope, target);
      this.getStorage(scope)?.set(key, value, external);
    });
  }
  remove(key, scope, external = false) {
    this.withPausedEmitters(() => {
      this.updateKeyTarget(key, scope, void 0);
      this.getStorage(scope)?.delete(key, external);
    });
  }
  withPausedEmitters(fn) {
    this._onDidChangeValue.pause();
    this._onDidChangeTarget.pause();
    try {
      fn();
    } finally {
      this._onDidChangeValue.resume();
      this._onDidChangeTarget.resume();
    }
  }
  keys(scope, target) {
    const keys = [];
    const keyTargets = this.getKeyTargets(scope);
    for (const key of Object.keys(keyTargets)) {
      const keyTarget = keyTargets[key];
      if (keyTarget === target) {
        keys.push(key);
      }
    }
    return keys;
  }
  updateKeyTarget(key, scope, target, external = false) {
    const keyTargets = this.getKeyTargets(scope);
    if (typeof target === "number") {
      if (keyTargets[key] !== target) {
        keyTargets[key] = target;
        this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
      }
    } else {
      if (typeof keyTargets[key] === "number") {
        delete keyTargets[key];
        this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
      }
    }
  }
  get workspaceKeyTargets() {
    if (!this._workspaceKeyTargets) {
      this._workspaceKeyTargets = this.loadKeyTargets(1 /* WORKSPACE */);
    }
    return this._workspaceKeyTargets;
  }
  get profileKeyTargets() {
    if (!this._profileKeyTargets) {
      this._profileKeyTargets = this.loadKeyTargets(0 /* PROFILE */);
    }
    return this._profileKeyTargets;
  }
  get applicationKeyTargets() {
    if (!this._applicationKeyTargets) {
      this._applicationKeyTargets = this.loadKeyTargets(-1 /* APPLICATION */);
    }
    return this._applicationKeyTargets;
  }
  get applicationSharedKeyTargets() {
    if (!this._applicationSharedKeyTargets) {
      this._applicationSharedKeyTargets = this.loadKeyTargets(-2 /* APPLICATION_SHARED */);
    }
    return this._applicationSharedKeyTargets;
  }
  getKeyTargets(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return this.applicationSharedKeyTargets;
      case -1 /* APPLICATION */:
        return this.applicationKeyTargets;
      case 0 /* PROFILE */:
        return this.profileKeyTargets;
      default:
        return this.workspaceKeyTargets;
    }
  }
  loadKeyTargets(scope) {
    const storage = this.getStorage(scope);
    return storage ? loadKeyTargets(storage) : /* @__PURE__ */ Object.create(null);
  }
  isNew(scope) {
    return this.getBoolean(IS_NEW_KEY, scope) === true;
  }
  async flush(reason = 0 /* NONE */) {
    this._onWillSaveState.fire({ reason });
    const applicationStorage = this.getStorage(-1 /* APPLICATION */);
    const applicationSharedStorage = this.getStorage(-2 /* APPLICATION_SHARED */);
    const profileStorage = this.getStorage(0 /* PROFILE */);
    const workspaceStorage = this.getStorage(1 /* WORKSPACE */);
    switch (reason) {
      // Unspecific reason: just wait when data is flushed
      case 0 /* NONE */:
        await Promises.settled([
          applicationStorage?.whenFlushed() ?? Promise.resolve(),
          applicationSharedStorage?.whenFlushed() ?? Promise.resolve(),
          profileStorage?.whenFlushed() ?? Promise.resolve(),
          workspaceStorage?.whenFlushed() ?? Promise.resolve()
        ]);
        break;
      // Shutdown: we want to flush as soon as possible
      // and not hit any delays that might be there
      case 1 /* SHUTDOWN */:
        await Promises.settled([
          applicationStorage?.flush(0) ?? Promise.resolve(),
          applicationSharedStorage?.flush(0) ?? Promise.resolve(),
          profileStorage?.flush(0) ?? Promise.resolve(),
          workspaceStorage?.flush(0) ?? Promise.resolve()
        ]);
        break;
    }
  }
  async log() {
    const applicationItems = this.getStorage(-1 /* APPLICATION */)?.items ?? /* @__PURE__ */ new Map();
    const applicationSharedItems = this.getStorage(-2 /* APPLICATION_SHARED */)?.items ?? /* @__PURE__ */ new Map();
    const profileItems = this.getStorage(0 /* PROFILE */)?.items ?? /* @__PURE__ */ new Map();
    const workspaceItems = this.getStorage(1 /* WORKSPACE */)?.items ?? /* @__PURE__ */ new Map();
    return logStorage(
      applicationItems,
      applicationSharedItems,
      profileItems,
      workspaceItems,
      this.getLogDetails(-1 /* APPLICATION */) ?? "",
      this.getLogDetails(-2 /* APPLICATION_SHARED */) ?? "",
      this.getLogDetails(0 /* PROFILE */) ?? "",
      this.getLogDetails(1 /* WORKSPACE */) ?? ""
    );
  }
  async optimize(scope) {
    await this.flush();
    return this.getStorage(scope)?.optimize();
  }
  async switch(to, preserveData) {
    this.emitWillSaveState(0 /* NONE */);
    if (isUserDataProfile(to)) {
      return this.switchToProfile(to, preserveData);
    }
    return this.switchToWorkspace(to, preserveData);
  }
  canSwitchProfile(from, to) {
    if (from.id === to.id) {
      return false;
    }
    if (isProfileUsingDefaultStorage(to) && isProfileUsingDefaultStorage(from)) {
      return false;
    }
    return true;
  }
  switchData(oldStorage, newStorage, scope) {
    this.withPausedEmitters(() => {
      const handledkeys = /* @__PURE__ */ new Set();
      for (const [key, oldValue] of oldStorage) {
        handledkeys.add(key);
        const newValue = newStorage.get(key);
        if (newValue !== oldValue) {
          this.emitDidChangeValue(scope, { key, external: true });
        }
      }
      for (const [key] of newStorage.items) {
        if (!handledkeys.has(key)) {
          this.emitDidChangeValue(scope, { key, external: true });
        }
      }
    });
  }
};
_AbstractStorageService.DEFAULT_FLUSH_INTERVAL = 60 * 1e3;
let AbstractStorageService = _AbstractStorageService;
function isProfileUsingDefaultStorage(profile) {
  return profile.isDefault || !!profile.useDefaultFlags?.globalState;
}
class InMemoryStorageService extends AbstractStorageService {
  constructor() {
    super();
    this.applicationStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.applicationSharedStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.profileStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.workspaceStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this._register(this.workspaceStorage.onDidChangeStorage((e) => this.emitDidChangeValue(1 /* WORKSPACE */, e)));
    this._register(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(0 /* PROFILE */, e)));
    this._register(this.applicationStorage.onDidChangeStorage((e) => this.emitDidChangeValue(-1 /* APPLICATION */, e)));
    this._register(this.applicationSharedStorage.onDidChangeStorage((e) => this.emitDidChangeValue(-2 /* APPLICATION_SHARED */, e)));
  }
  getStorage(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return this.applicationSharedStorage;
      case -1 /* APPLICATION */:
        return this.applicationStorage;
      case 0 /* PROFILE */:
        return this.profileStorage;
      default:
        return this.workspaceStorage;
    }
  }
  getLogDetails(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return "inMemory (application-shared)";
      case -1 /* APPLICATION */:
        return "inMemory (application)";
      case 0 /* PROFILE */:
        return "inMemory (profile)";
      default:
        return "inMemory (workspace)";
    }
  }
  async doInitialize() {
  }
  async switchToProfile() {
  }
  async switchToWorkspace() {
  }
  shouldFlushWhenIdle() {
    return false;
  }
  hasScope(scope) {
    return false;
  }
}
async function logStorage(application, applicationShared, profile, workspace, applicationPath, applicationSharedPath, profilePath, workspacePath) {
  const safeParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  };
  const applicationItems = /* @__PURE__ */ new Map();
  const applicationItemsParsed = /* @__PURE__ */ new Map();
  application.forEach((value, key) => {
    applicationItems.set(key, value);
    applicationItemsParsed.set(key, safeParse(value));
  });
  const applicationSharedItems = /* @__PURE__ */ new Map();
  const applicationSharedItemsParsed = /* @__PURE__ */ new Map();
  applicationShared.forEach((value, key) => {
    applicationSharedItems.set(key, value);
    applicationSharedItemsParsed.set(key, safeParse(value));
  });
  const profileItems = /* @__PURE__ */ new Map();
  const profileItemsParsed = /* @__PURE__ */ new Map();
  profile.forEach((value, key) => {
    profileItems.set(key, value);
    profileItemsParsed.set(key, safeParse(value));
  });
  const workspaceItems = /* @__PURE__ */ new Map();
  const workspaceItemsParsed = /* @__PURE__ */ new Map();
  workspace.forEach((value, key) => {
    workspaceItems.set(key, value);
    workspaceItemsParsed.set(key, safeParse(value));
  });
  if (applicationPath !== profilePath) {
    console.group(`Storage: Application (path: ${applicationPath})`);
  } else {
    console.group(`Storage: Application & Profile (path: ${applicationPath}, default profile)`);
  }
  const applicationValues = [];
  applicationItems.forEach((value, key) => {
    applicationValues.push({ key, value });
  });
  console.table(applicationValues);
  console.groupEnd();
  console.log(applicationItemsParsed);
  console.group(`Storage: Application Shared (path: ${applicationSharedPath})`);
  const applicationSharedValues = [];
  applicationSharedItems.forEach((value, key) => {
    applicationSharedValues.push({ key, value });
  });
  console.table(applicationSharedValues);
  console.groupEnd();
  console.log(applicationSharedItemsParsed);
  if (applicationPath !== profilePath) {
    console.group(`Storage: Profile (path: ${profilePath}, profile specific)`);
    const profileValues = [];
    profileItems.forEach((value, key) => {
      profileValues.push({ key, value });
    });
    console.table(profileValues);
    console.groupEnd();
    console.log(profileItemsParsed);
  }
  console.group(`Storage: Workspace (path: ${workspacePath})`);
  const workspaceValues = [];
  workspaceItems.forEach((value, key) => {
    workspaceValues.push({ key, value });
  });
  console.table(workspaceValues);
  console.groupEnd();
  console.log(workspaceItemsParsed);
}
export {
  AbstractStorageService,
  IS_NEW_KEY,
  IStorageService,
  InMemoryStorageService,
  StorageScope,
  StorageTarget,
  TARGET_KEY,
  WillSaveStateReason,
  isProfileUsingDefaultStorage,
  loadKeyTargets,
  logStorage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc3RvcmFnZVxcY29tbW9uXFxzdG9yYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJvbWlzZXMsIFJ1bk9uY2VTY2hlZHVsZXIsIHJ1bldoZW5HbG9iYWxJZGxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZURhdGFiYXNlLCBJU3RvcmFnZSwgSVN0b3JhZ2VDaGFuZ2VFdmVudCwgU3RvcmFnZSwgU3RvcmFnZUhpbnQsIFN0b3JhZ2VWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGlzVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJU19ORVdfS0VZID0gJ19fJF9faXNOZXdTdG9yYWdlTWFya2VyJztcbmV4cG9ydCBjb25zdCBUQVJHRVRfS0VZID0gJ19fJF9fdGFyZ2V0U3RvcmFnZU1hcmtlcic7XG5cbmV4cG9ydCBjb25zdCBJU3RvcmFnZVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVN0b3JhZ2VTZXJ2aWNlPignc3RvcmFnZVNlcnZpY2UnKTtcblxuZXhwb3J0IGVudW0gV2lsbFNhdmVTdGF0ZVJlYXNvbiB7XG5cblx0LyoqXG5cdCAqIE5vIHNwZWNpZmljIHJlYXNvbiB0byBzYXZlIHN0YXRlLlxuXHQgKi9cblx0Tk9ORSxcblxuXHQvKipcblx0ICogQSBoaW50IHRoYXQgdGhlIHdvcmtiZW5jaCBpcyBhYm91dCB0byBzaHV0ZG93bi5cblx0ICovXG5cdFNIVVRET1dOXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpbGxTYXZlU3RhdGVFdmVudCB7XG5cdHJlYWRvbmx5IHJlYXNvbjogV2lsbFNhdmVTdGF0ZVJlYXNvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmFnZUVudHJ5IHtcblx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZhbHVlOiBTdG9yYWdlVmFsdWU7XG5cdHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGU7XG5cdHJlYWRvbmx5IHRhcmdldDogU3RvcmFnZVRhcmdldDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IGV4dGVuZHMgSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IGV4dGVuZHMgSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQXBwbGljYXRpb25TaGFyZWRTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCBleHRlbmRzIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yYWdlU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBFbWl0dGVkIHdoZW5ldmVyIGRhdGEgaXMgdXBkYXRlZCBvciBkZWxldGVkIG9uIHRoZSBnaXZlblxuXHQgKiBzY29wZSBhbmQgb3B0aW9uYWwga2V5LlxuXHQgKlxuXHQgKiBAcGFyYW0gc2NvcGUgdGhlIGBTdG9yYWdlU2NvcGVgIHRvIGxpc3RlbiB0byBjaGFuZ2VzXG5cdCAqIEBwYXJhbSBrZXkgdGhlIG9wdGlvbmFsIGtleSB0byBmaWx0ZXIgZm9yIG9yIGFsbCBrZXlzIG9mXG5cdCAqIHRoZSBzY29wZSBpZiBgdW5kZWZpbmVkYFxuXHQgKi9cblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSwga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PElXb3Jrc3BhY2VTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudD47XG5cdG9uRGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVByb2ZpbGVTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudD47XG5cdG9uRGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PElBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PElBcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50PjtcblxuXHQvKipcblx0ICogRW1pdHRlZCB3aGVuZXZlciB0YXJnZXQgb2YgYSBzdG9yYWdlIGVudHJ5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRhcmdldDogRXZlbnQ8SVN0b3JhZ2VUYXJnZXRDaGFuZ2VFdmVudD47XG5cblx0LyoqXG5cdCAqIEVtaXR0ZWQgd2hlbiB0aGUgc3RvcmFnZSBpcyBhYm91dCB0byBwZXJzaXN0LiBUaGlzIGlzIHRoZSByaWdodCB0aW1lXG5cdCAqIHRvIHBlcnNpc3QgZGF0YSB0byBlbnN1cmUgaXQgaXMgc3RvcmVkIGJlZm9yZSB0aGUgYXBwbGljYXRpb24gc2h1dHNcblx0ICogZG93bi5cblx0ICpcblx0ICogVGhlIHdpbGwgc2F2ZSBzdGF0ZSBldmVudCBhbGxvd3MgdG8gb3B0aW9uYWxseSBhc2sgZm9yIHRoZSByZWFzb24gb2Zcblx0ICogc2F2aW5nIHRoZSBzdGF0ZSwgZS5nLiB0byBmaW5kIG91dCBpZiB0aGUgc3RhdGUgaXMgc2F2ZWQgZHVlIHRvIGFcblx0ICogc2h1dGRvd24uXG5cdCAqXG5cdCAqIE5vdGU6IHRoaXMgZXZlbnQgbWF5IGJlIGZpcmVkIG1hbnkgdGltZXMsIG5vdCBvbmx5IG9uIHNodXRkb3duIHRvIHByZXZlbnRcblx0ICogbG9zcyBvZiBzdGF0ZSBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSBzaHV0ZG93biBpcyBub3Qgc3VmZmljaWVudCB0b1xuXHQgKiBwZXJzaXN0IHRoZSBkYXRhIHByb3Blcmx5LlxuXHQgKi9cblx0cmVhZG9ubHkgb25XaWxsU2F2ZVN0YXRlOiBFdmVudDxJV2lsbFNhdmVTdGF0ZUV2ZW50PjtcblxuXHQvKipcblx0ICogUmV0cmlldmUgYW4gZWxlbWVudCBzdG9yZWQgd2l0aCB0aGUgZ2l2ZW4ga2V5IGZyb20gc3RvcmFnZS4gVXNlXG5cdCAqIHRoZSBwcm92aWRlZCBgZGVmYXVsdFZhbHVlYCBpZiB0aGUgZWxlbWVudCBpcyBgbnVsbGAgb3IgYHVuZGVmaW5lZGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSBhbGxvd3MgdG8gZGVmaW5lIHRoZSBzY29wZSBvZiB0aGUgc3RvcmFnZSBvcGVyYXRpb25cblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBvbmx5LCBhbGwgd29ya3NwYWNlcyBvciBhbGwgcHJvZmlsZXMuXG5cdCAqL1xuXHRnZXQoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IHN0cmluZyk6IHN0cmluZztcblx0Z2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZSBhbiBlbGVtZW50IHN0b3JlZCB3aXRoIHRoZSBnaXZlbiBrZXkgZnJvbSBzdG9yYWdlLiBVc2Vcblx0ICogdGhlIHByb3ZpZGVkIGBkZWZhdWx0VmFsdWVgIGlmIHRoZSBlbGVtZW50IGlzIGBudWxsYCBvciBgdW5kZWZpbmVkYC5cblx0ICogVGhlIGVsZW1lbnQgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gYSBgYm9vbGVhbmAuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSBhbGxvd3MgdG8gZGVmaW5lIHRoZSBzY29wZSBvZiB0aGUgc3RvcmFnZSBvcGVyYXRpb25cblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBvbmx5LCBhbGwgd29ya3NwYWNlcyBvciBhbGwgcHJvZmlsZXMuXG5cdCAqL1xuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBib29sZWFuKTogYm9vbGVhbjtcblx0Z2V0Qm9vbGVhbihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IGJvb2xlYW4pOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZSBhbiBlbGVtZW50IHN0b3JlZCB3aXRoIHRoZSBnaXZlbiBrZXkgZnJvbSBzdG9yYWdlLiBVc2Vcblx0ICogdGhlIHByb3ZpZGVkIGBkZWZhdWx0VmFsdWVgIGlmIHRoZSBlbGVtZW50IGlzIGBudWxsYCBvciBgdW5kZWZpbmVkYC5cblx0ICogVGhlIGVsZW1lbnQgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gYSBgbnVtYmVyYCB1c2luZyBgcGFyc2VJbnRgIHdpdGggYVxuXHQgKiBiYXNlIG9mIGAxMGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSBhbGxvd3MgdG8gZGVmaW5lIHRoZSBzY29wZSBvZiB0aGUgc3RvcmFnZSBvcGVyYXRpb25cblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBvbmx5LCBhbGwgd29ya3NwYWNlcyBvciBhbGwgcHJvZmlsZXMuXG5cdCAqL1xuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0TnVtYmVyKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZSBhbiBlbGVtZW50IHN0b3JlZCB3aXRoIHRoZSBnaXZlbiBrZXkgZnJvbSBzdG9yYWdlLiBVc2Vcblx0ICogdGhlIHByb3ZpZGVkIGBkZWZhdWx0VmFsdWVgIGlmIHRoZSBlbGVtZW50IGlzIGBudWxsYCBvciBgdW5kZWZpbmVkYC5cblx0ICogVGhlIGVsZW1lbnQgd2lsbCBiZSBjb252ZXJ0ZWQgdG8gYSBgb2JqZWN0YCB1c2luZyBgSlNPTi5wYXJzZWAuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSBhbGxvd3MgdG8gZGVmaW5lIHRoZSBzY29wZSBvZiB0aGUgc3RvcmFnZSBvcGVyYXRpb25cblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBvbmx5LCBhbGwgd29ya3NwYWNlcyBvciBhbGwgcHJvZmlsZXMuXG5cdCAqL1xuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IFQpOiBUO1xuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU3RvcmUgYSB2YWx1ZSB1bmRlciB0aGUgZ2l2ZW4ga2V5IHRvIHN0b3JhZ2UuIFRoZSB2YWx1ZSB3aWxsIGJlXG5cdCAqIGNvbnZlcnRlZCB0byBhIGBzdHJpbmdgLiBTdG9yaW5nIGVpdGhlciBgdW5kZWZpbmVkYCBvciBgbnVsbGAgd2lsbFxuXHQgKiByZW1vdmUgdGhlIGVudHJ5IHVuZGVyIHRoZSBrZXkuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSBhbGxvd3MgdG8gZGVmaW5lIHRoZSBzY29wZSBvZiB0aGUgc3RvcmFnZSBvcGVyYXRpb25cblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBvbmx5LCBhbGwgd29ya3NwYWNlcyBvciBhbGwgcHJvZmlsZXMuXG5cdCAqXG5cdCAqIEBwYXJhbSB0YXJnZXQgYWxsb3dzIHRvIGRlZmluZSB0aGUgdGFyZ2V0IG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgbWFjaGluZSBvciB1c2VyLlxuXHQgKi9cblx0c3RvcmUoa2V5OiBzdHJpbmcsIHZhbHVlOiBTdG9yYWdlVmFsdWUsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBzdG9yZSBtdWx0aXBsZSB2YWx1ZXMgaW4gYSBidWxrIG9wZXJhdGlvbi4gRXZlbnRzIHdpbGwgb25seVxuXHQgKiBiZSBlbWl0dGVkIHdoZW4gYWxsIHZhbHVlcyBoYXZlIGJlZW4gc3RvcmVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gZXh0ZXJuYWwgYSBoaW50IHRvIGluZGljYXRlIHRoZSBzb3VyY2Ugb2YgdGhlIG9wZXJhdGlvbiBpcyBleHRlcm5hbCxcblx0ICogc3VjaCBhcyBzZXR0aW5ncyBzeW5jIG9yIHByb2ZpbGUgY2hhbmdlcy5cblx0ICovXG5cdHN0b3JlQWxsKGVudHJpZXM6IEFycmF5PElTdG9yYWdlRW50cnk+LCBleHRlcm5hbDogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERlbGV0ZSBhbiBlbGVtZW50IHN0b3JlZCB1bmRlciB0aGUgcHJvdmlkZWQga2V5IGZyb20gc3RvcmFnZS5cblx0ICpcblx0ICogVGhlIHNjb3BlIGFyZ3VtZW50IGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlXG5cdCAqIG9wZXJhdGlvbiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzXG5cdCAqIG9yIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdHJlbW92ZShrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIHRoZSBrZXlzIHVzZWQgaW4gdGhlIHN0b3JhZ2UgZm9yIHRoZSBwcm92aWRlZCBgc2NvcGVgXG5cdCAqIGFuZCBgdGFyZ2V0YC5cblx0ICpcblx0ICogTm90ZTogdGhpcyB3aWxsIE5PVCByZXR1cm4gYWxsIGtleXMgc3RvcmVkIGluIHRoZSBzdG9yYWdlIGxheWVyLlxuXHQgKiBTb21lIGtleXMgbWF5IG5vdCBoYXZlIGFuIGFzc29jaWF0ZWQgYFN0b3JhZ2VUYXJnZXRgIGFuZCB0aHVzXG5cdCAqIHdpbGwgYmUgZXhjbHVkZWQgZnJvbSB0aGUgcmVzdWx0cy5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIGZvciB0aGUga2V5c1xuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICpcblx0ICogQHBhcmFtIHRhcmdldCBhbGxvd3MgdG8gZGVmaW5lIHRoZSB0YXJnZXQgZm9yIHRoZSBrZXlzXG5cdCAqIHRvIGVpdGhlciB0aGUgY3VycmVudCBtYWNoaW5lIG9yIHVzZXIuXG5cdCAqL1xuXHRrZXlzKHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCk6IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBMb2cgdGhlIGNvbnRlbnRzIG9mIHRoZSBzdG9yYWdlIHRvIHRoZSBjb25zb2xlLlxuXHQgKi9cblx0bG9nKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc3RvcmFnZSBzZXJ2aWNlIGhhbmRsZXMgdGhlIHByb3ZpZGVkIHNjb3BlLlxuXHQgKi9cblx0aGFzU2NvcGUoc2NvcGU6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVVzZXJEYXRhUHJvZmlsZSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFN3aXRjaCBzdG9yYWdlIHRvIGFub3RoZXIgd29ya3NwYWNlIG9yIHByb2ZpbGUuIE9wdGlvbmFsbHkgcHJlc2VydmUgdGhlXG5cdCAqIGN1cnJlbnQgZGF0YSB0byB0aGUgbmV3IHN0b3JhZ2UuXG5cdCAqL1xuXHRzd2l0Y2godG86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVVzZXJEYXRhUHJvZmlsZSwgcHJlc2VydmVEYXRhOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc3RvcmFnZSBmb3IgdGhlIGdpdmVuIHNjb3BlIHdhcyBjcmVhdGVkIGR1cmluZyB0aGlzIHNlc3Npb24gb3Jcblx0ICogZXhpc3RlZCBiZWZvcmUuXG5cdCAqL1xuXHRpc05ldyhzY29wZTogU3RvcmFnZVNjb3BlKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQXR0ZW1wdHMgdG8gcmVkdWNlIHRoZSBEQiBzaXplIHZpYSBvcHRpbWl6YXRpb24gY29tbWFuZHMgaWYgc3VwcG9ydGVkLlxuXHQgKi9cblx0b3B0aW1pemUoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBmbHVzaCBzdGF0ZSwgZS5nLiBpbiBjYXNlcyB3aGVyZSBhIHNodXRkb3duIGlzXG5cdCAqIGltbWluZW50LiBUaGlzIHdpbGwgc2VuZCBvdXQgdGhlIGBvbldpbGxTYXZlU3RhdGVgIHRvIGFza1xuXHQgKiBldmVyeW9uZSBmb3IgbGF0ZXN0IHN0YXRlLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBhIGBQcm9taXNlYCB0aGF0IGNhbiBiZSBhd2FpdGVkIG9uIHdoZW4gYWxsIHVwZGF0ZXNcblx0ICogdG8gdGhlIHVuZGVybHlpbmcgc3RvcmFnZSBoYXZlIGJlZW4gZmx1c2hlZC5cblx0ICovXG5cdGZsdXNoKHJlYXNvbj86IFdpbGxTYXZlU3RhdGVSZWFzb24pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTdG9yYWdlU2NvcGUge1xuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgd2lsbCBiZSBzY29wZWQgdG8gYWxsIHdvcmtzcGFjZXMgYWNyb3NzIGFsbCBwcm9maWxlc1xuXHQgKiBhbmQgc2hhcmVkIGFjcm9zcyBWUyBDb2RlIGFuZCBTZXNzaW9ucyBhcHAuXG5cdCAqL1xuXHRBUFBMSUNBVElPTl9TSEFSRUQgPSAtMixcblxuXHQvKipcblx0ICogVGhlIHN0b3JlZCBkYXRhIHdpbGwgYmUgc2NvcGVkIHRvIGFsbCB3b3Jrc3BhY2VzIGFjcm9zcyBhbGwgcHJvZmlsZXMuXG5cdCAqL1xuXHRBUFBMSUNBVElPTiA9IC0xLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgd2lsbCBiZSBzY29wZWQgdG8gYWxsIHdvcmtzcGFjZXMgb2YgdGhlIHNhbWUgcHJvZmlsZS5cblx0ICovXG5cdFBST0ZJTEUgPSAwLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgd2lsbCBiZSBzY29wZWQgdG8gdGhlIGN1cnJlbnQgd29ya3NwYWNlLlxuXHQgKi9cblx0V09SS1NQQUNFID0gMVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBTdG9yYWdlVGFyZ2V0IHtcblxuXHQvKipcblx0ICogVGhlIHN0b3JlZCBkYXRhIGlzIHVzZXIgc3BlY2lmaWMgYW5kIGFwcGxpZXMgYWNyb3NzIG1hY2hpbmVzLlxuXHQgKi9cblx0VVNFUixcblxuXHQvKipcblx0ICogVGhlIHN0b3JlZCBkYXRhIGlzIG1hY2hpbmUgc3BlY2lmaWMuXG5cdCAqL1xuXHRNQUNISU5FXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IHtcblxuXHQvKipcblx0ICogVGhlIHNjb3BlIGZvciB0aGUgc3RvcmFnZSBlbnRyeSB0aGF0IGNoYW5nZWRcblx0ICogb3Igd2FzIHJlbW92ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlO1xuXG5cdC8qKlxuXHQgKiBUaGUgYGtleWAgb2YgdGhlIHN0b3JhZ2UgZW50cnkgdGhhdCB3YXMgY2hhbmdlZFxuXHQgKiBvciB3YXMgcmVtb3ZlZC5cblx0ICovXG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgYHRhcmdldGAgY2FuIGJlIGB1bmRlZmluZWRgIGlmIGEga2V5IGlzIGJlaW5nXG5cdCAqIHJlbW92ZWQuXG5cdCAqL1xuXHRyZWFkb25seSB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEEgaGludCBob3cgdGhlIHN0b3JhZ2UgY2hhbmdlIGV2ZW50IHdhcyB0cmlnZ2VyZWQuIElmXG5cdCAqIGB0cnVlYCwgdGhlIHN0b3JhZ2UgY2hhbmdlIHdhcyB0cmlnZ2VyZWQgYnkgYW4gZXh0ZXJuYWxcblx0ICogc291cmNlLCBzdWNoIGFzOlxuXHQgKiAtIGFub3RoZXIgcHJvY2VzcyAoZm9yIGV4YW1wbGUgYW5vdGhlciB3aW5kb3cpXG5cdCAqIC0gb3BlcmF0aW9ucyBzdWNoIGFzIHNldHRpbmdzIHN5bmMgb3IgcHJvZmlsZXMgY2hhbmdlXG5cdCAqL1xuXHRyZWFkb25seSBleHRlcm5hbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JhZ2VUYXJnZXRDaGFuZ2VFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSBzY29wZSBmb3IgdGhlIHRhcmdldCB0aGF0IGNoYW5nZWQuIExpc3RlbmVyc1xuXHQgKiBzaG91bGQgdXNlIGBrZXlzKHNjb3BlLCB0YXJnZXQpYCB0byBnZXQgYW4gdXBkYXRlZFxuXHQgKiBsaXN0IG9mIGtleXMgZm9yIHRoZSBnaXZlbiBgc2NvcGVgIGFuZCBgdGFyZ2V0YC5cblx0ICovXG5cdHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGU7XG59XG5cbmludGVyZmFjZSBJS2V5VGFyZ2V0cyB7XG5cdFtrZXk6IHN0cmluZ106IFN0b3JhZ2VUYXJnZXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JhZ2VTZXJ2aWNlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGZsdXNoSW50ZXJ2YWw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRLZXlUYXJnZXRzKHN0b3JhZ2U6IElTdG9yYWdlKTogSUtleVRhcmdldHMge1xuXHRjb25zdCBrZXlzUmF3ID0gc3RvcmFnZS5nZXQoVEFSR0VUX0tFWSk7XG5cdGlmIChrZXlzUmF3KSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKGtleXNSYXcpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBGYWlsIGdyYWNlZnVsbHlcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0U3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBERUZBVUxUX0ZMVVNIX0lOVEVSVkFMID0gNjAgKiAxMDAwOyAvLyBldmVyeSBtaW51dGVcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhdXNlYWJsZUVtaXR0ZXI8SVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRhcmdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQYXVzZWFibGVFbWl0dGVyPElTdG9yYWdlVGFyZ2V0Q2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRhcmdldCA9IHRoaXMuX29uRGlkQ2hhbmdlVGFyZ2V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFNhdmVTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXaWxsU2F2ZVN0YXRlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxTYXZlU3RhdGUgPSB0aGlzLl9vbldpbGxTYXZlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBpbml0aWFsaXphdGlvblByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmbHVzaFdoZW5JZGxlU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJ1bkZsdXNoV2hlbklkbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSVN0b3JhZ2VTZXJ2aWNlT3B0aW9ucyA9IHsgZmx1c2hJbnRlcnZhbDogQWJzdHJhY3RTdG9yYWdlU2VydmljZS5ERUZBVUxUX0ZMVVNIX0lOVEVSVkFMIH0pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5mbHVzaFdoZW5JZGxlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb0ZsdXNoV2hlbklkbGUoKSwgb3B0aW9ucy5mbHVzaEludGVydmFsKSk7XG5cdH1cblxuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQsIGUgPT4gZS5zY29wZSA9PT0gc2NvcGUgJiYgKGtleSA9PT0gdW5kZWZpbmVkIHx8IGUua2V5ID09PSBrZXkpLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9GbHVzaFdoZW5JZGxlKCk6IHZvaWQge1xuXHRcdHRoaXMucnVuRmx1c2hXaGVuSWRsZS52YWx1ZSA9IHJ1bldoZW5HbG9iYWxJZGxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnNob3VsZEZsdXNoV2hlbklkbGUoKSkge1xuXHRcdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlcGVhdFxuXHRcdFx0dGhpcy5mbHVzaFdoZW5JZGxlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgc2hvdWxkRmx1c2hXaGVuSWRsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBzdG9wRmx1c2hXaGVuSWRsZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKFt0aGlzLnJ1bkZsdXNoV2hlbklkbGUsIHRoaXMuZmx1c2hXaGVuSWRsZVNjaGVkdWxlcl0pO1xuXHR9XG5cblx0aW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6YXRpb25Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemF0aW9uUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cblx0XHRcdFx0Ly8gSW5pdCBhbGwgc3RvcmFnZSBsb2NhdGlvbnNcblx0XHRcdFx0bWFyaygnY29kZS93aWxsSW5pdFN0b3JhZ2UnKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvSW5pdGlhbGl6ZSgpOyAvLyBBc2sgc3ViY2xhc3NlcyB0byBpbml0aWFsaXplIHN0b3JhZ2Vcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRtYXJrKCdjb2RlL2RpZEluaXRTdG9yYWdlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbiBzb21lIE9TIHdlIGRvIG5vdCBnZXQgZW5vdWdoIHRpbWUgdG8gcGVyc2lzdCBzdGF0ZSBvbiBzaHV0ZG93biAoZS5nLiB3aGVuXG5cdFx0XHRcdC8vIFdpbmRvd3MgcmVzdGFydHMgYWZ0ZXIgYXBwbHlpbmcgdXBkYXRlcykuIEluIG90aGVyIGNhc2VzLCBWU0NvZGUgbWlnaHQgY3Jhc2gsXG5cdFx0XHRcdC8vIHNvIHdlIHBlcmlvZGljYWxseSBzYXZlIHN0YXRlIHRvIHJlZHVjZSB0aGUgY2hhbmNlIG9mIGxvb3NpbmcgYW55IHN0YXRlLlxuXHRcdFx0XHQvLyBJbiB0aGUgYnJvd3NlciB3ZSBkbyBub3QgaGF2ZSBzdXBwb3J0IGZvciBsb25nIHJ1bm5pbmcgdW5sb2FkIHNlcXVlbmNlcy4gQXMgc3VjaCxcblx0XHRcdFx0Ly8gd2UgY2Fubm90IGFzayBmb3Igc2F2aW5nIHN0YXRlIGluIHRoYXQgbW9tZW50LCBiZWNhdXNlIHRoYXQgd291bGQgcmVzdWx0IGluIGFcblx0XHRcdFx0Ly8gbG9uZyBydW5uaW5nIG9wZXJhdGlvbi5cblx0XHRcdFx0Ly8gSW5zdGVhZCwgcGVyaW9kaWNhbGx5IGFzayBjdXN0b21lcnMgdG8gc2F2ZSBzYXZlLiBUaGUgbGlicmFyeSB3aWxsIGJlIGNsZXZlciBlbm91Z2hcblx0XHRcdFx0Ly8gdG8gb25seSBzYXZlIHN0YXRlIHRoYXQgaGFzIGFjdHVhbGx5IGNoYW5nZWQuXG5cdFx0XHRcdHRoaXMuZmx1c2hXaGVuSWRsZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXphdGlvblByb21pc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZW1pdERpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGV2ZW50OiBJU3RvcmFnZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBrZXksIGV4dGVybmFsIH0gPSBldmVudDtcblxuXHRcdC8vIFNwZWNpYWxseSBoYW5kbGUgYFRBUkdFVF9LRVlgXG5cdFx0aWYgKGtleSA9PT0gVEFSR0VUX0tFWSkge1xuXG5cdFx0XHQvLyBDbGVhciBvdXIgY2FjaGVkIHZlcnNpb24gd2hpY2ggaXMgbm93IG91dCBvZiBkYXRlXG5cdFx0XHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRDpcblx0XHRcdFx0XHR0aGlzLl9hcHBsaWNhdGlvblNoYXJlZEtleVRhcmdldHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRcdHRoaXMuX2FwcGxpY2F0aW9uS2V5VGFyZ2V0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuUFJPRklMRTpcblx0XHRcdFx0XHR0aGlzLl9wcm9maWxlS2V5VGFyZ2V0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuV09SS1NQQUNFOlxuXHRcdFx0XHRcdHRoaXMuX3dvcmtzcGFjZUtleVRhcmdldHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVtaXQgYXMgYGRpZENoYW5nZVRhcmdldGAgZXZlbnRcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFyZ2V0LmZpcmUoeyBzY29wZSB9KTtcblx0XHR9XG5cblx0XHQvLyBFbWl0IGFueSBvdGhlciBrZXkgdG8gb3V0c2lkZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKHsgc2NvcGUsIGtleSwgdGFyZ2V0OiB0aGlzLmdldEtleVRhcmdldHMoc2NvcGUpW2tleV0sIGV4dGVybmFsIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBlbWl0V2lsbFNhdmVTdGF0ZShyZWFzb246IFdpbGxTYXZlU3RhdGVSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxTYXZlU3RhdGUuZmlyZSh7IHJlYXNvbiB9KTtcblx0fVxuXG5cdGdldChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogc3RyaW5nKTogc3RyaW5nO1xuXHRnZXQoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LmdldChrZXksIGZhbGxiYWNrVmFsdWUpO1xuXHR9XG5cblx0Z2V0Qm9vbGVhbihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogYm9vbGVhbik6IGJvb2xlYW47XG5cdGdldEJvb2xlYW4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogYm9vbGVhbik6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0b3JhZ2Uoc2NvcGUpPy5nZXRCb29sZWFuKGtleSwgZmFsbGJhY2tWYWx1ZSk7XG5cdH1cblxuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0TnVtYmVyKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFN0b3JhZ2Uoc2NvcGUpPy5nZXROdW1iZXIoa2V5LCBmYWxsYmFja1ZhbHVlKTtcblx0fVxuXG5cdGdldE9iamVjdChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogb2JqZWN0KTogb2JqZWN0O1xuXHRnZXRPYmplY3Qoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBvYmplY3QgfCB1bmRlZmluZWQ7XG5cdGdldE9iamVjdChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IG9iamVjdCk6IG9iamVjdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LmdldE9iamVjdChrZXksIGZhbGxiYWNrVmFsdWUpO1xuXHR9XG5cblx0c3RvcmVBbGwoZW50cmllczogQXJyYXk8SVN0b3JhZ2VFbnRyeT4sIGV4dGVybmFsOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy53aXRoUGF1c2VkRW1pdHRlcnMoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdHRoaXMuc3RvcmUoZW50cnkua2V5LCBlbnRyeS52YWx1ZSwgZW50cnkuc2NvcGUsIGVudHJ5LnRhcmdldCwgZXh0ZXJuYWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c3RvcmUoa2V5OiBzdHJpbmcsIHZhbHVlOiBTdG9yYWdlVmFsdWUsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCwgZXh0ZXJuYWwgPSBmYWxzZSk6IHZvaWQge1xuXG5cdFx0Ly8gV2UgcmVtb3ZlIHRoZSBrZXkgZm9yIHVuZGVmaW5lZC9udWxsIHZhbHVlc1xuXHRcdGlmIChpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkpIHtcblx0XHRcdHRoaXMucmVtb3ZlKGtleSwgc2NvcGUsIGV4dGVybmFsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb3VyIGRhdGFzdHJ1Y3R1cmVzIGJ1dCBzZW5kIGV2ZW50cyBvbmx5IGFmdGVyXG5cdFx0dGhpcy53aXRoUGF1c2VkRW1pdHRlcnMoKCkgPT4ge1xuXG5cdFx0XHQvLyBVcGRhdGUga2V5LXRhcmdldCBtYXBcblx0XHRcdHRoaXMudXBkYXRlS2V5VGFyZ2V0KGtleSwgc2NvcGUsIHRhcmdldCk7XG5cblx0XHRcdC8vIFN0b3JlIGFjdHVhbCB2YWx1ZVxuXHRcdFx0dGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uc2V0KGtleSwgdmFsdWUsIGV4dGVybmFsKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlbW92ZShrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZXh0ZXJuYWwgPSBmYWxzZSk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIG91ciBkYXRhc3RydWN0dXJlcyBidXQgc2VuZCBldmVudHMgb25seSBhZnRlclxuXHRcdHRoaXMud2l0aFBhdXNlZEVtaXR0ZXJzKCgpID0+IHtcblxuXHRcdFx0Ly8gVXBkYXRlIGtleS10YXJnZXQgbWFwXG5cdFx0XHR0aGlzLnVwZGF0ZUtleVRhcmdldChrZXksIHNjb3BlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBSZW1vdmUgYWN0dWFsIGtleVxuXHRcdFx0dGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uZGVsZXRlKGtleSwgZXh0ZXJuYWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoUGF1c2VkRW1pdHRlcnMoZm46IEZ1bmN0aW9uKTogdm9pZCB7XG5cblx0XHQvLyBQYXVzZSBlbWl0dGVyc1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUucGF1c2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhcmdldC5wYXVzZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGZuKCk7XG5cdFx0fSBmaW5hbGx5IHtcblxuXHRcdFx0Ly8gUmVzdW1lIGVtaXR0ZXJzXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLnJlc3VtZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXJnZXQucmVzdW1lKCk7XG5cdFx0fVxuXHR9XG5cblx0a2V5cyhzY29wZTogU3RvcmFnZVNjb3BlLCB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGtleVRhcmdldHMgPSB0aGlzLmdldEtleVRhcmdldHMoc2NvcGUpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGtleVRhcmdldHMpKSB7XG5cdFx0XHRjb25zdCBrZXlUYXJnZXQgPSBrZXlUYXJnZXRzW2tleV07XG5cdFx0XHRpZiAoa2V5VGFyZ2V0ID09PSB0YXJnZXQpIHtcblx0XHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGtleXM7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUtleVRhcmdldChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0IHwgdW5kZWZpbmVkLCBleHRlcm5hbCA9IGZhbHNlKTogdm9pZCB7XG5cblx0XHQvLyBBZGRcblx0XHRjb25zdCBrZXlUYXJnZXRzID0gdGhpcy5nZXRLZXlUYXJnZXRzKHNjb3BlKTtcblx0XHRpZiAodHlwZW9mIHRhcmdldCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmIChrZXlUYXJnZXRzW2tleV0gIT09IHRhcmdldCkge1xuXHRcdFx0XHRrZXlUYXJnZXRzW2tleV0gPSB0YXJnZXQ7XG5cdFx0XHRcdHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LnNldChUQVJHRVRfS0VZLCBKU09OLnN0cmluZ2lmeShrZXlUYXJnZXRzKSwgZXh0ZXJuYWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHR5cGVvZiBrZXlUYXJnZXRzW2tleV0gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGRlbGV0ZSBrZXlUYXJnZXRzW2tleV07XG5cdFx0XHRcdHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LnNldChUQVJHRVRfS0VZLCBKU09OLnN0cmluZ2lmeShrZXlUYXJnZXRzKSwgZXh0ZXJuYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dvcmtzcGFjZUtleVRhcmdldHM6IElLZXlUYXJnZXRzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB3b3Jrc3BhY2VLZXlUYXJnZXRzKCk6IElLZXlUYXJnZXRzIHtcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZUtleVRhcmdldHMpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUtleVRhcmdldHMgPSB0aGlzLmxvYWRLZXlUYXJnZXRzKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VLZXlUYXJnZXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvZmlsZUtleVRhcmdldHM6IElLZXlUYXJnZXRzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBwcm9maWxlS2V5VGFyZ2V0cygpOiBJS2V5VGFyZ2V0cyB7XG5cdFx0aWYgKCF0aGlzLl9wcm9maWxlS2V5VGFyZ2V0cykge1xuXHRcdFx0dGhpcy5fcHJvZmlsZUtleVRhcmdldHMgPSB0aGlzLmxvYWRLZXlUYXJnZXRzKFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcHJvZmlsZUtleVRhcmdldHM7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBsaWNhdGlvbktleVRhcmdldHM6IElLZXlUYXJnZXRzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBhcHBsaWNhdGlvbktleVRhcmdldHMoKTogSUtleVRhcmdldHMge1xuXHRcdGlmICghdGhpcy5fYXBwbGljYXRpb25LZXlUYXJnZXRzKSB7XG5cdFx0XHR0aGlzLl9hcHBsaWNhdGlvbktleVRhcmdldHMgPSB0aGlzLmxvYWRLZXlUYXJnZXRzKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FwcGxpY2F0aW9uS2V5VGFyZ2V0cztcblx0fVxuXG5cdHByaXZhdGUgX2FwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0czogSUtleVRhcmdldHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGFwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0cygpOiBJS2V5VGFyZ2V0cyB7XG5cdFx0aWYgKCF0aGlzLl9hcHBsaWNhdGlvblNoYXJlZEtleVRhcmdldHMpIHtcblx0XHRcdHRoaXMuX2FwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0cyA9IHRoaXMubG9hZEtleVRhcmdldHMoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0cztcblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5VGFyZ2V0cyhzY29wZTogU3RvcmFnZVNjb3BlKTogSUtleVRhcmdldHMge1xuXHRcdHN3aXRjaCAoc2NvcGUpIHtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbGljYXRpb25TaGFyZWRLZXlUYXJnZXRzO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT046XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uS2V5VGFyZ2V0cztcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLlBST0ZJTEU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVLZXlUYXJnZXRzO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlS2V5VGFyZ2V0cztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRLZXlUYXJnZXRzKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiB7IFtrZXk6IHN0cmluZ106IFN0b3JhZ2VUYXJnZXQgfSB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuZ2V0U3RvcmFnZShzY29wZSk7XG5cblx0XHRyZXR1cm4gc3RvcmFnZSA/IGxvYWRLZXlUYXJnZXRzKHN0b3JhZ2UpIDogT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdGlzTmV3KHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRCb29sZWFuKElTX05FV19LRVksIHNjb3BlKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGZsdXNoKHJlYXNvbiA9IFdpbGxTYXZlU3RhdGVSZWFzb24uTk9ORSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gU2lnbmFsIGV2ZW50IHRvIGNvbGxlY3QgY2hhbmdlc1xuXHRcdHRoaXMuX29uV2lsbFNhdmVTdGF0ZS5maXJlKHsgcmVhc29uIH0pO1xuXG5cdFx0Y29uc3QgYXBwbGljYXRpb25TdG9yYWdlID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQpO1xuXHRcdGNvbnN0IHByb2ZpbGVTdG9yYWdlID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTdG9yYWdlID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblxuXHRcdFx0Ly8gVW5zcGVjaWZpYyByZWFzb246IGp1c3Qgd2FpdCB3aGVuIGRhdGEgaXMgZmx1c2hlZFxuXHRcdFx0Y2FzZSBXaWxsU2F2ZVN0YXRlUmVhc29uLk5PTkU6XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0XHRcdGFwcGxpY2F0aW9uU3RvcmFnZT8ud2hlbkZsdXNoZWQoKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2U/LndoZW5GbHVzaGVkKCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0cHJvZmlsZVN0b3JhZ2U/LndoZW5GbHVzaGVkKCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZT8ud2hlbkZsdXNoZWQoKSA/PyBQcm9taXNlLnJlc29sdmUoKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdC8vIFNodXRkb3duOiB3ZSB3YW50IHRvIGZsdXNoIGFzIHNvb24gYXMgcG9zc2libGVcblx0XHRcdC8vIGFuZCBub3QgaGl0IGFueSBkZWxheXMgdGhhdCBtaWdodCBiZSB0aGVyZVxuXHRcdFx0Y2FzZSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOOlxuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdFx0XHRhcHBsaWNhdGlvblN0b3JhZ2U/LmZsdXNoKDApID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRcdGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZT8uZmx1c2goMCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0cHJvZmlsZVN0b3JhZ2U/LmZsdXNoKDApID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVN0b3JhZ2U/LmZsdXNoKDApID8/IFByb21pc2UucmVzb2x2ZSgpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25JdGVtcyA9IHRoaXMuZ2V0U3RvcmFnZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pPy5pdGVtcyA/PyBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGFwcGxpY2F0aW9uU2hhcmVkSXRlbXMgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCk/Lml0ZW1zID8/IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcHJvZmlsZUl0ZW1zID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5QUk9GSUxFKT8uaXRlbXMgPz8gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VJdGVtcyA9IHRoaXMuZ2V0U3RvcmFnZShTdG9yYWdlU2NvcGUuV09SS1NQQUNFKT8uaXRlbXMgPz8gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRcdHJldHVybiBsb2dTdG9yYWdlKFxuXHRcdFx0YXBwbGljYXRpb25JdGVtcyxcblx0XHRcdGFwcGxpY2F0aW9uU2hhcmVkSXRlbXMsXG5cdFx0XHRwcm9maWxlSXRlbXMsXG5cdFx0XHR3b3Jrc3BhY2VJdGVtcyxcblx0XHRcdHRoaXMuZ2V0TG9nRGV0YWlscyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pID8/ICcnLFxuXHRcdFx0dGhpcy5nZXRMb2dEZXRhaWxzKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQpID8/ICcnLFxuXHRcdFx0dGhpcy5nZXRMb2dEZXRhaWxzKFN0b3JhZ2VTY29wZS5QUk9GSUxFKSA/PyAnJyxcblx0XHRcdHRoaXMuZ2V0TG9nRGV0YWlscyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyAnJ1xuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBvcHRpbWl6ZShzY29wZTogU3RvcmFnZVNjb3BlKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBBd2FpdCBwZW5kaW5nIGRhdGEgdG8gYmUgZmx1c2hlZCB0byB0aGUgREJcblx0XHQvLyBiZWZvcmUgYXR0ZW1wdGluZyB0byBvcHRpbWl6ZSB0aGUgREJcblx0XHRhd2FpdCB0aGlzLmZsdXNoKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8ub3B0aW1pemUoKTtcblx0fVxuXG5cdGFzeW5jIHN3aXRjaCh0bzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlLCBwcmVzZXJ2ZURhdGE6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFNpZ25hbCBhcyBldmVudCBzbyB0aGF0IGNsaWVudHMgY2FuIHN0b3JlIGRhdGEgYmVmb3JlIHdlIHN3aXRjaFxuXHRcdHRoaXMuZW1pdFdpbGxTYXZlU3RhdGUoV2lsbFNhdmVTdGF0ZVJlYXNvbi5OT05FKTtcblxuXHRcdGlmIChpc1VzZXJEYXRhUHJvZmlsZSh0bykpIHtcblx0XHRcdHJldHVybiB0aGlzLnN3aXRjaFRvUHJvZmlsZSh0bywgcHJlc2VydmVEYXRhKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zd2l0Y2hUb1dvcmtzcGFjZSh0bywgcHJlc2VydmVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjYW5Td2l0Y2hQcm9maWxlKGZyb206IElVc2VyRGF0YVByb2ZpbGUsIHRvOiBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbiB7XG5cdFx0aWYgKGZyb20uaWQgPT09IHRvLmlkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGJvdGggcHJvZmlsZXMgYXJlIHNhbWVcblx0XHR9XG5cblx0XHRpZiAoaXNQcm9maWxlVXNpbmdEZWZhdWx0U3RvcmFnZSh0bykgJiYgaXNQcm9maWxlVXNpbmdEZWZhdWx0U3RvcmFnZShmcm9tKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBib3RoIHByb2ZpbGVzIGFyZSB1c2luZyBkZWZhdWx0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgc3dpdGNoRGF0YShvbGRTdG9yYWdlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBuZXdTdG9yYWdlOiBJU3RvcmFnZSwgc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHZvaWQge1xuXHRcdHRoaXMud2l0aFBhdXNlZEVtaXR0ZXJzKCgpID0+IHtcblx0XHRcdC8vIFNpZ25hbCBzdG9yYWdlIGtleXMgdGhhdCBoYXZlIGNoYW5nZWRcblx0XHRcdGNvbnN0IGhhbmRsZWRrZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIG9sZFZhbHVlXSBvZiBvbGRTdG9yYWdlKSB7XG5cdFx0XHRcdGhhbmRsZWRrZXlzLmFkZChrZXkpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gbmV3U3RvcmFnZS5nZXQoa2V5KTtcblx0XHRcdFx0aWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKHNjb3BlLCB7IGtleSwgZXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBba2V5XSBvZiBuZXdTdG9yYWdlLml0ZW1zKSB7XG5cdFx0XHRcdGlmICghaGFuZGxlZGtleXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShzY29wZSwgeyBrZXksIGV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gYWJzdHJhY3RcblxuXHRhYnN0cmFjdCBoYXNTY29wZShzY29wZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZG9Jbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD47XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFN0b3JhZ2Uoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IElTdG9yYWdlIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRMb2dEZXRhaWxzKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHN3aXRjaFRvUHJvZmlsZSh0b1Byb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIHByZXNlcnZlRGF0YTogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBzd2l0Y2hUb1dvcmtzcGFjZSh0b1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlLCBwcmVzZXJ2ZURhdGE6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9maWxlVXNpbmdEZWZhdWx0U3RvcmFnZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbiB7XG5cdHJldHVybiBwcm9maWxlLmlzRGVmYXVsdCB8fCAhIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5nbG9iYWxTdGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKG5ldyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSgpLCB7IGhpbnQ6IFN0b3JhZ2VIaW50LlNUT1JBR0VfSU5fTUVNT1JZIH0pKTtcblx0cHJpdmF0ZSByZWFkb25seSBhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZShuZXcgSW5NZW1vcnlTdG9yYWdlRGF0YWJhc2UoKSwgeyBoaW50OiBTdG9yYWdlSGludC5TVE9SQUdFX0lOX01FTU9SWSB9KSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZVN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZShuZXcgSW5NZW1vcnlTdG9yYWdlRGF0YWJhc2UoKSwgeyBoaW50OiBTdG9yYWdlSGludC5TVE9SQUdFX0lOX01FTU9SWSB9KSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKG5ldyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSgpLCB7IGhpbnQ6IFN0b3JhZ2VIaW50LlNUT1JBR0VfSU5fTUVNT1JZIH0pKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9maWxlU3RvcmFnZS5vbkRpZENoYW5nZVN0b3JhZ2UoZSA9PiB0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZS5vbkRpZENoYW5nZVN0b3JhZ2UoZSA9PiB0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwgZSkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRTdG9yYWdlKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBJU3RvcmFnZSB7XG5cdFx0c3dpdGNoIChzY29wZSkge1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2U7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbGljYXRpb25TdG9yYWdlO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuUFJPRklMRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZVN0b3JhZ2U7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VTdG9yYWdlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMb2dEZXRhaWxzKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoc2NvcGUpIHtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRDpcblx0XHRcdFx0cmV0dXJuICdpbk1lbW9yeSAoYXBwbGljYXRpb24tc2hhcmVkKSc7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTjpcblx0XHRcdFx0cmV0dXJuICdpbk1lbW9yeSAoYXBwbGljYXRpb24pJztcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLlBST0ZJTEU6XG5cdFx0XHRcdHJldHVybiAnaW5NZW1vcnkgKHByb2ZpbGUpJztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiAnaW5NZW1vcnkgKHdvcmtzcGFjZSknO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0luaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc3dpdGNoVG9Qcm9maWxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vLW9wIHdoZW4gaW4tbWVtb3J5XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc3dpdGNoVG9Xb3Jrc3BhY2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm8tb3Agd2hlbiBpbi1tZW1vcnlcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRGbHVzaFdoZW5JZGxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGhhc1Njb3BlKHNjb3BlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvZ1N0b3JhZ2UoYXBwbGljYXRpb246IE1hcDxzdHJpbmcsIHN0cmluZz4sIGFwcGxpY2F0aW9uU2hhcmVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBwcm9maWxlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCB3b3Jrc3BhY2U6IE1hcDxzdHJpbmcsIHN0cmluZz4sIGFwcGxpY2F0aW9uUGF0aDogc3RyaW5nLCBhcHBsaWNhdGlvblNoYXJlZFBhdGg6IHN0cmluZywgcHJvZmlsZVBhdGg6IHN0cmluZywgd29ya3NwYWNlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHNhZmVQYXJzZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKHZhbHVlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBhcHBsaWNhdGlvbkl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgYXBwbGljYXRpb25JdGVtc1BhcnNlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGFwcGxpY2F0aW9uLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRhcHBsaWNhdGlvbkl0ZW1zLnNldChrZXksIHZhbHVlKTtcblx0XHRhcHBsaWNhdGlvbkl0ZW1zUGFyc2VkLnNldChrZXksIHNhZmVQYXJzZSh2YWx1ZSkpO1xuXHR9KTtcblxuXHRjb25zdCBhcHBsaWNhdGlvblNoYXJlZEl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgYXBwbGljYXRpb25TaGFyZWRJdGVtc1BhcnNlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGFwcGxpY2F0aW9uU2hhcmVkLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRhcHBsaWNhdGlvblNoYXJlZEl0ZW1zLnNldChrZXksIHZhbHVlKTtcblx0XHRhcHBsaWNhdGlvblNoYXJlZEl0ZW1zUGFyc2VkLnNldChrZXksIHNhZmVQYXJzZSh2YWx1ZSkpO1xuXHR9KTtcblxuXHRjb25zdCBwcm9maWxlSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRjb25zdCBwcm9maWxlSXRlbXNQYXJzZWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcm9maWxlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRwcm9maWxlSXRlbXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdHByb2ZpbGVJdGVtc1BhcnNlZC5zZXQoa2V5LCBzYWZlUGFyc2UodmFsdWUpKTtcblx0fSk7XG5cblx0Y29uc3Qgd29ya3NwYWNlSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRjb25zdCB3b3Jrc3BhY2VJdGVtc1BhcnNlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHdvcmtzcGFjZS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0d29ya3NwYWNlSXRlbXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdHdvcmtzcGFjZUl0ZW1zUGFyc2VkLnNldChrZXksIHNhZmVQYXJzZSh2YWx1ZSkpO1xuXHR9KTtcblxuXHRpZiAoYXBwbGljYXRpb25QYXRoICE9PSBwcm9maWxlUGF0aCkge1xuXHRcdGNvbnNvbGUuZ3JvdXAoYFN0b3JhZ2U6IEFwcGxpY2F0aW9uIChwYXRoOiAke2FwcGxpY2F0aW9uUGF0aH0pYCk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZS5ncm91cChgU3RvcmFnZTogQXBwbGljYXRpb24gJiBQcm9maWxlIChwYXRoOiAke2FwcGxpY2F0aW9uUGF0aH0sIGRlZmF1bHQgcHJvZmlsZSlgKTtcblx0fVxuXHRjb25zdCBhcHBsaWNhdGlvblZhbHVlczogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcblx0YXBwbGljYXRpb25JdGVtcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0YXBwbGljYXRpb25WYWx1ZXMucHVzaCh7IGtleSwgdmFsdWUgfSk7XG5cdH0pO1xuXHRjb25zb2xlLnRhYmxlKGFwcGxpY2F0aW9uVmFsdWVzKTtcblx0Y29uc29sZS5ncm91cEVuZCgpO1xuXG5cdGNvbnNvbGUubG9nKGFwcGxpY2F0aW9uSXRlbXNQYXJzZWQpO1xuXG5cdGNvbnNvbGUuZ3JvdXAoYFN0b3JhZ2U6IEFwcGxpY2F0aW9uIFNoYXJlZCAocGF0aDogJHthcHBsaWNhdGlvblNoYXJlZFBhdGh9KWApO1xuXHRjb25zdCBhcHBsaWNhdGlvblNoYXJlZFZhbHVlczogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcblx0YXBwbGljYXRpb25TaGFyZWRJdGVtcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0YXBwbGljYXRpb25TaGFyZWRWYWx1ZXMucHVzaCh7IGtleSwgdmFsdWUgfSk7XG5cdH0pO1xuXHRjb25zb2xlLnRhYmxlKGFwcGxpY2F0aW9uU2hhcmVkVmFsdWVzKTtcblx0Y29uc29sZS5ncm91cEVuZCgpO1xuXG5cdGNvbnNvbGUubG9nKGFwcGxpY2F0aW9uU2hhcmVkSXRlbXNQYXJzZWQpO1xuXG5cdGlmIChhcHBsaWNhdGlvblBhdGggIT09IHByb2ZpbGVQYXRoKSB7XG5cdFx0Y29uc29sZS5ncm91cChgU3RvcmFnZTogUHJvZmlsZSAocGF0aDogJHtwcm9maWxlUGF0aH0sIHByb2ZpbGUgc3BlY2lmaWMpYCk7XG5cdFx0Y29uc3QgcHJvZmlsZVZhbHVlczogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcblx0XHRwcm9maWxlSXRlbXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0cHJvZmlsZVZhbHVlcy5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHR9KTtcblx0XHRjb25zb2xlLnRhYmxlKHByb2ZpbGVWYWx1ZXMpO1xuXHRcdGNvbnNvbGUuZ3JvdXBFbmQoKTtcblxuXHRcdGNvbnNvbGUubG9nKHByb2ZpbGVJdGVtc1BhcnNlZCk7XG5cdH1cblxuXHRjb25zb2xlLmdyb3VwKGBTdG9yYWdlOiBXb3Jrc3BhY2UgKHBhdGg6ICR7d29ya3NwYWNlUGF0aH0pYCk7XG5cdGNvbnN0IHdvcmtzcGFjZVZhbHVlczogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcblx0d29ya3NwYWNlSXRlbXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdHdvcmtzcGFjZVZhbHVlcy5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0fSk7XG5cdGNvbnNvbGUudGFibGUod29ya3NwYWNlVmFsdWVzKTtcblx0Y29uc29sZS5ncm91cEVuZCgpO1xuXG5cdGNvbnNvbGUubG9nKHdvcmtzcGFjZUl0ZW1zUGFyc2VkKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxrQkFBa0IseUJBQXlCO0FBQzlELFNBQVMsU0FBUyxPQUFPLHdCQUF3QjtBQUNqRCxTQUFTLFlBQTZCLFNBQVMseUJBQXlCO0FBQ3hFLFNBQVMsWUFBWTtBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF3RCxTQUFTLG1CQUFpQztBQUMzRyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUEyQztBQUc3QyxNQUFNLGFBQWE7QUFDbkIsTUFBTSxhQUFhO0FBRW5CLE1BQU0sa0JBQWtCLGdCQUFpQyxnQkFBZ0I7QUFFekUsSUFBSyxzQkFBTCxrQkFBS0EseUJBQUw7QUFLTixFQUFBQSwwQ0FBQTtBQUtBLEVBQUFBLDBDQUFBO0FBVlcsU0FBQUE7QUFBQSxH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S0FBSyxFQUFFLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDdEMsQ0FBQztBQUNELFVBQVEsTUFBTSxpQkFBaUI7QUFDL0IsVUFBUSxTQUFTO0FBRWpCLFVBQVEsSUFBSSxzQkFBc0I7QUFFbEMsVUFBUSxNQUFNLHNDQUFzQyxxQkFBcUIsR0FBRztBQUM1RSxRQUFNLDBCQUE0RCxDQUFDO0FBQ25FLHlCQUF1QixRQUFRLENBQUMsT0FBTyxRQUFRO0FBQzlDLDRCQUF3QixLQUFLLEVBQUUsS0FBSyxNQUFNLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBQ0QsVUFBUSxNQUFNLHVCQUF1QjtBQUNyQyxVQUFRLFNBQVM7QUFFakIsVUFBUSxJQUFJLDRCQUE0QjtBQUV4QyxNQUFJLG9CQUFvQixhQUFhO0FBQ3BDLFlBQVEsTUFBTSwyQkFBMkIsV0FBVyxxQkFBcUI7QUFDekUsVUFBTSxnQkFBa0QsQ0FBQztBQUN6RCxpQkFBYSxRQUFRLENBQUMsT0FBTyxRQUFRO0FBQ3BDLG9CQUFjLEtBQUssRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUFBLElBQ2xDLENBQUM7QUFDRCxZQUFRLE1BQU0sYUFBYTtBQUMzQixZQUFRLFNBQVM7QUFFakIsWUFBUSxJQUFJLGtCQUFrQjtBQUFBLEVBQy9CO0FBRUEsVUFBUSxNQUFNLDZCQUE2QixhQUFhLEdBQUc7QUFDM0QsUUFBTSxrQkFBb0QsQ0FBQztBQUMzRCxpQkFBZSxRQUFRLENBQUMsT0FBTyxRQUFRO0FBQ3RDLG9CQUFnQixLQUFLLEVBQUUsS0FBSyxNQUFNLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBQ0QsVUFBUSxNQUFNLGVBQWU7QUFDN0IsVUFBUSxTQUFTO0FBRWpCLFVBQVEsSUFBSSxvQkFBb0I7QUFDakM7IiwKICAibmFtZXMiOiBbIldpbGxTYXZlU3RhdGVSZWFzb24iLCAiU3RvcmFnZVNjb3BlIiwgIlN0b3JhZ2VUYXJnZXQiXQp9Cg==
