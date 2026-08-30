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
import { BroadcastDataChannel } from "../../../../base/browser/broadcast.js";
import { isSafari } from "../../../../base/browser/browser.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { IndexedDB } from "../../../../base/browser/indexedDB.js";
import { DeferredPromise, Promises } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { InMemoryStorageDatabase, isStorageItemsChangeEvent, Storage } from "../../../../base/parts/storage/common/storage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractStorageService, isProfileUsingDefaultStorage, IS_NEW_KEY, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isUserDataProfile } from "../../../../platform/userDataProfile/common/userDataProfile.js";
let BrowserStorageService = class extends AbstractStorageService {
  constructor(workspace, userDataProfileService, logService) {
    super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });
    this.workspace = workspace;
    this.userDataProfileService = userDataProfileService;
    this.logService = logService;
    this.applicationStoragePromise = new DeferredPromise();
    this.profileStorageDisposables = this._register(new DisposableStore());
    this.profileStorageProfile = this.userDataProfileService.currentProfile;
    this.registerListeners();
  }
  get hasPendingUpdate() {
    return Boolean(
      this.applicationStorageDatabase?.hasPendingUpdate || this.applicationSharedStorageDatabase?.hasPendingUpdate || this.profileStorageDatabase?.hasPendingUpdate || this.workspaceStorageDatabase?.hasPendingUpdate
    );
  }
  async getApplicationStorageValue(key) {
    return (await this.applicationStoragePromise.p).indexedDb.getValue(key);
  }
  async compareAndSwapApplicationStorage(key, expectedValue, newValue) {
    return (await this.applicationStoragePromise.p).indexedDb.compareAndSwap(key, expectedValue, newValue);
  }
  registerListeners() {
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => e.join(this.switchToProfile(e.profile))));
  }
  async doInitialize() {
    await Promises.settled([
      this.createApplicationStorage(),
      this.createApplicationSharedStorage(),
      this.createProfileStorage(this.profileStorageProfile),
      this.createWorkspaceStorage()
    ]);
  }
  async createApplicationStorage() {
    const applicationStorageIndexedDB = await IndexedDBStorageDatabase.createApplicationStorage(this.logService);
    this.applicationStorageDatabase = this._register(applicationStorageIndexedDB);
    this.applicationStorage = this._register(new Storage(this.applicationStorageDatabase));
    this._register(this.applicationStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.APPLICATION, e)));
    await this.applicationStorage.init();
    this.updateIsNew(this.applicationStorage);
    this.applicationStoragePromise.complete({ indexedDb: applicationStorageIndexedDB, storage: this.applicationStorage });
  }
  async createApplicationSharedStorage() {
    const applicationSharedStorageIndexedDB = await IndexedDBStorageDatabase.createApplicationSharedStorage(this.logService);
    this.applicationSharedStorageDatabase = this._register(applicationSharedStorageIndexedDB);
    this.applicationSharedStorage = this._register(new Storage(this.applicationSharedStorageDatabase));
    this._register(this.applicationSharedStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.APPLICATION_SHARED, e)));
    await this.applicationSharedStorage.init();
    this.updateIsNew(this.applicationSharedStorage);
  }
  async createProfileStorage(profile) {
    this.profileStorageDisposables.clear();
    this.profileStorageProfile = profile;
    if (isProfileUsingDefaultStorage(this.profileStorageProfile)) {
      const { indexedDb: applicationStorageIndexedDB, storage: applicationStorage } = await this.applicationStoragePromise.p;
      this.profileStorageDatabase = applicationStorageIndexedDB;
      this.profileStorage = applicationStorage;
      this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.PROFILE, e)));
    } else {
      const profileStorageIndexedDB = await IndexedDBStorageDatabase.createProfileStorage(this.profileStorageProfile, this.logService);
      this.profileStorageDatabase = this.profileStorageDisposables.add(profileStorageIndexedDB);
      this.profileStorage = this.profileStorageDisposables.add(new Storage(this.profileStorageDatabase));
      this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.PROFILE, e)));
      await this.profileStorage.init();
      this.updateIsNew(this.profileStorage);
    }
  }
  async createWorkspaceStorage() {
    const workspaceStorageIndexedDB = await IndexedDBStorageDatabase.createWorkspaceStorage(this.workspace.id, this.logService);
    this.workspaceStorageDatabase = this._register(workspaceStorageIndexedDB);
    this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));
    this._register(this.workspaceStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.WORKSPACE, e)));
    await this.workspaceStorage.init();
    this.updateIsNew(this.workspaceStorage);
  }
  updateIsNew(storage) {
    const firstOpen = storage.getBoolean(IS_NEW_KEY);
    if (firstOpen === void 0) {
      storage.set(IS_NEW_KEY, true);
    } else if (firstOpen) {
      storage.set(IS_NEW_KEY, false);
    }
  }
  getStorage(scope) {
    switch (scope) {
      case StorageScope.APPLICATION_SHARED:
        return this.applicationSharedStorage;
      case StorageScope.APPLICATION:
        return this.applicationStorage;
      case StorageScope.PROFILE:
        return this.profileStorage;
      default:
        return this.workspaceStorage;
    }
  }
  getLogDetails(scope) {
    switch (scope) {
      case StorageScope.APPLICATION_SHARED:
        return this.applicationSharedStorageDatabase?.name;
      case StorageScope.APPLICATION:
        return this.applicationStorageDatabase?.name;
      case StorageScope.PROFILE:
        return this.profileStorageDatabase?.name;
      default:
        return this.workspaceStorageDatabase?.name;
    }
  }
  async switchToProfile(toProfile) {
    if (!this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
      return;
    }
    const oldProfileStorage = assertReturnsDefined(this.profileStorage);
    const oldItems = oldProfileStorage.items;
    if (oldProfileStorage !== this.applicationStorage) {
      await oldProfileStorage.close();
    }
    await this.createProfileStorage(toProfile);
    this.switchData(oldItems, assertReturnsDefined(this.profileStorage), StorageScope.PROFILE);
  }
  async switchToWorkspace(toWorkspace, preserveData) {
    throw new Error("Migrating storage is currently unsupported in Web");
  }
  shouldFlushWhenIdle() {
    return getActiveWindow().document.hasFocus() && !this.hasPendingUpdate;
  }
  close() {
    if (isSafari) {
      this.applicationStorage?.close();
      this.applicationSharedStorageDatabase?.close();
      this.profileStorageDatabase?.close();
      this.workspaceStorageDatabase?.close();
    }
    this.dispose();
  }
  async clear() {
    for (const scope of [StorageScope.APPLICATION, StorageScope.APPLICATION_SHARED, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
      for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
        for (const key of this.keys(scope, target)) {
          this.remove(key, scope);
        }
      }
      await this.getStorage(scope)?.whenFlushed();
    }
    await Promises.settled([
      this.applicationStorageDatabase?.clear() ?? Promise.resolve(),
      this.applicationSharedStorageDatabase?.clear() ?? Promise.resolve(),
      this.profileStorageDatabase?.clear() ?? Promise.resolve(),
      this.workspaceStorageDatabase?.clear() ?? Promise.resolve()
    ]);
  }
  hasScope(scope) {
    if (isUserDataProfile(scope)) {
      return this.profileStorageProfile.id === scope.id;
    }
    return this.workspace.id === scope.id;
  }
};
BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1e3;
BrowserStorageService = __decorateClass([
  __decorateParam(2, ILogService)
], BrowserStorageService);
class InMemoryIndexedDBStorageDatabase extends InMemoryStorageDatabase {
  constructor() {
    super(...arguments);
    this.hasPendingUpdate = false;
    this.name = "in-memory-indexedb-storage";
  }
  async getValue(key) {
    return (await this.getItems()).get(key);
  }
  async compareAndSwap(key, expectedValue, newValue) {
    const items = await this.getItems();
    const currentValue = items.get(key);
    if (currentValue !== expectedValue) {
      return { swapped: false, currentValue };
    }
    await this.updateItems({ insert: /* @__PURE__ */ new Map([[key, newValue]]) });
    return { swapped: true, currentValue: newValue };
  }
  async clear() {
    (await this.getItems()).clear();
  }
  dispose() {
  }
}
const _IndexedDBStorageDatabase = class _IndexedDBStorageDatabase extends Disposable {
  constructor(options, logService) {
    super();
    this.logService = logService;
    this._onDidChangeItemsExternal = this._register(new Emitter());
    this.onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;
    this.pendingUpdate = void 0;
    this.name = `${_IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX}${options.id}`;
    this.broadcastChannel = options.broadcastChanges ? this._register(new BroadcastDataChannel(this.name)) : void 0;
    this.whenConnected = this.connect();
    this.registerListeners();
  }
  static async createApplicationStorage(logService) {
    return _IndexedDBStorageDatabase.create({ id: "global", broadcastChanges: true }, logService);
  }
  static async createApplicationSharedStorage(logService) {
    return _IndexedDBStorageDatabase.create({ id: "global-shared", broadcastChanges: true }, logService);
  }
  static async createProfileStorage(profile, logService) {
    return _IndexedDBStorageDatabase.create({ id: `global-${profile.id}`, broadcastChanges: true }, logService);
  }
  static async createWorkspaceStorage(workspaceId, logService) {
    return _IndexedDBStorageDatabase.create({ id: workspaceId }, logService);
  }
  static async create(options, logService) {
    try {
      const database = new _IndexedDBStorageDatabase(options, logService);
      await database.whenConnected;
      return database;
    } catch (error) {
      logService.error(`[IndexedDB Storage ${options.id}] create(): ${toErrorMessage(error, true)}`);
      return new InMemoryIndexedDBStorageDatabase();
    }
  }
  get hasPendingUpdate() {
    return !!this.pendingUpdate;
  }
  registerListeners() {
    if (this.broadcastChannel) {
      this._register(this.broadcastChannel.onDidReceiveData((data) => {
        if (isStorageItemsChangeEvent(data)) {
          this._onDidChangeItemsExternal.fire(data);
        }
      }));
    }
  }
  async connect() {
    try {
      return await IndexedDB.create(this.name, void 0, [_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE]);
    } catch (error) {
      this.logService.error(`[IndexedDB Storage ${this.name}] connect() error: ${toErrorMessage(error)}`);
      throw error;
    }
  }
  async getItems() {
    const db = await this.whenConnected;
    function isValid(value) {
      return typeof value === "string";
    }
    return db.getKeyValues(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, isValid);
  }
  async getValue(key) {
    const db = await this.whenConnected;
    const value = await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readonly", (objectStore) => objectStore.get(key));
    return typeof value === "string" ? value : void 0;
  }
  async updateItems(request) {
    let didUpdate = false;
    this.pendingUpdate = this.doUpdateItems(request);
    try {
      didUpdate = await this.pendingUpdate;
    } finally {
      this.pendingUpdate = void 0;
    }
    if (this.broadcastChannel && didUpdate) {
      const event = {
        changed: request.insert,
        deleted: request.delete
      };
      this.broadcastChannel.postData(event);
    }
  }
  async compareAndSwap(key, expectedValue, newValue) {
    const db = await this.whenConnected;
    const result = await db.compareAndSwap(
      _IndexedDBStorageDatabase.STORAGE_OBJECT_STORE,
      key,
      expectedValue,
      newValue,
      (value) => typeof value === "string"
    );
    if (result.swapped) {
      const event = { changed: /* @__PURE__ */ new Map([[key, newValue]]) };
      this._onDidChangeItemsExternal.fire(event);
      this.broadcastChannel?.postData(event);
    }
    return result;
  }
  async doUpdateItems(request) {
    const toInsert = request.insert;
    const toDelete = request.delete;
    if (!toInsert && !toDelete || toInsert?.size === 0 && toDelete?.size === 0) {
      return false;
    }
    const db = await this.whenConnected;
    await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readwrite", (objectStore) => {
      const requests = [];
      if (toInsert) {
        for (const [key, value] of toInsert) {
          requests.push(objectStore.put(value, key));
        }
      }
      if (toDelete) {
        for (const key of toDelete) {
          requests.push(objectStore.delete(key));
        }
      }
      return requests;
    });
    return true;
  }
  async optimize() {
  }
  async close() {
    const db = await this.whenConnected;
    await this.pendingUpdate;
    return db.close();
  }
  async clear() {
    const db = await this.whenConnected;
    await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readwrite", (objectStore) => objectStore.clear());
  }
};
_IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX = "vscode-web-state-db-";
_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE = "ItemTable";
let IndexedDBStorageDatabase = _IndexedDBStorageDatabase;
export {
  BrowserStorageService,
  IndexedDBStorageDatabase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzdG9yYWdlXFxicm93c2VyXFxzdG9yYWdlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyb2FkY2FzdERhdGFDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb2FkY2FzdC5qcyc7XG5pbXBvcnQgeyBpc1NhZmFyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSW5kZXhlZERCIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2luZGV4ZWREQi5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSwgaXNTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudCwgSVN0b3JhZ2UsIElTdG9yYWdlRGF0YWJhc2UsIElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudCwgSVVwZGF0ZVJlcXVlc3QsIFN0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFN0b3JhZ2VTZXJ2aWNlLCBpc1Byb2ZpbGVVc2luZ0RlZmF1bHRTdG9yYWdlLCBJU19ORVdfS0VZLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGlzVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJTdG9yYWdlU2VydmljZSBleHRlbmRzIEFic3RyYWN0U3RvcmFnZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIEJST1dTRVJfREVGQVVMVF9GTFVTSF9JTlRFUlZBTCA9IDUgKiAxMDAwOyAvLyBldmVyeSA1cyBiZWNhdXNlIGFzeW5jIG9wZXJhdGlvbnMgYXJlIG5vdCBwZXJtaXR0ZWQgb24gc2h1dGRvd25cblxuXHRwcml2YXRlIGFwcGxpY2F0aW9uU3RvcmFnZTogSVN0b3JhZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXBwbGljYXRpb25TdG9yYWdlRGF0YWJhc2U6IElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25TdG9yYWdlUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8eyBpbmRleGVkRGI6IElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U7IHN0b3JhZ2U6IElTdG9yYWdlIH0+KCk7XG5cblx0cHJpdmF0ZSBhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2U6IElTdG9yYWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZURhdGFiYXNlOiBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcHJvZmlsZVN0b3JhZ2U6IElTdG9yYWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2ZpbGVTdG9yYWdlRGF0YWJhc2U6IElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvZmlsZVN0b3JhZ2VQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgd29ya3NwYWNlU3RvcmFnZTogSVN0b3JhZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya3NwYWNlU3RvcmFnZURhdGFiYXNlOiBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBoYXNQZW5kaW5nVXBkYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBCb29sZWFuKFxuXHRcdFx0dGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VEYXRhYmFzZT8uaGFzUGVuZGluZ1VwZGF0ZSB8fFxuXHRcdFx0dGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZT8uaGFzUGVuZGluZ1VwZGF0ZSB8fFxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURhdGFiYXNlPy5oYXNQZW5kaW5nVXBkYXRlIHx8XG5cdFx0XHR0aGlzLndvcmtzcGFjZVN0b3JhZ2VEYXRhYmFzZT8uaGFzUGVuZGluZ1VwZGF0ZVxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBnZXRBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZVByb21pc2UucCkuaW5kZXhlZERiLmdldFZhbHVlKGtleSk7XG5cdH1cblxuXHRhc3luYyBjb21wYXJlQW5kU3dhcEFwcGxpY2F0aW9uU3RvcmFnZShrZXk6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogc3RyaW5nKTogUHJvbWlzZTx7IHJlYWRvbmx5IHN3YXBwZWQ6IGJvb2xlYW47IHJlYWRvbmx5IGN1cnJlbnRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlUHJvbWlzZS5wKS5pbmRleGVkRGIuY29tcGFyZUFuZFN3YXAoa2V5LCBleHBlY3RlZFZhbHVlLCBuZXdWYWx1ZSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyBmbHVzaEludGVydmFsOiBCcm93c2VyU3RvcmFnZVNlcnZpY2UuQlJPV1NFUl9ERUZBVUxUX0ZMVVNIX0lOVEVSVkFMIH0pO1xuXG5cdFx0dGhpcy5wcm9maWxlU3RvcmFnZVByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGU7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4gZS5qb2luKHRoaXMuc3dpdGNoVG9Qcm9maWxlKGUucHJvZmlsZSkpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9Jbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSW5pdCBzdG9yYWdlc1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0dGhpcy5jcmVhdGVBcHBsaWNhdGlvblN0b3JhZ2UoKSxcblx0XHRcdHRoaXMuY3JlYXRlQXBwbGljYXRpb25TaGFyZWRTdG9yYWdlKCksXG5cdFx0XHR0aGlzLmNyZWF0ZVByb2ZpbGVTdG9yYWdlKHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlKSxcblx0XHRcdHRoaXMuY3JlYXRlV29ya3NwYWNlU3RvcmFnZSgpXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUFwcGxpY2F0aW9uU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcHBsaWNhdGlvblN0b3JhZ2VJbmRleGVkREIgPSBhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlQXBwbGljYXRpb25TdG9yYWdlKHRoaXMubG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZURhdGFiYXNlID0gdGhpcy5fcmVnaXN0ZXIoYXBwbGljYXRpb25TdG9yYWdlSW5kZXhlZERCKTtcblx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKHRoaXMuYXBwbGljYXRpb25TdG9yYWdlRGF0YWJhc2UpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXBwbGljYXRpb25TdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZSkpKTtcblxuXHRcdGF3YWl0IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlLmluaXQoKTtcblxuXHRcdHRoaXMudXBkYXRlSXNOZXcodGhpcy5hcHBsaWNhdGlvblN0b3JhZ2UpO1xuXG5cdFx0dGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VQcm9taXNlLmNvbXBsZXRlKHsgaW5kZXhlZERiOiBhcHBsaWNhdGlvblN0b3JhZ2VJbmRleGVkREIsIHN0b3JhZ2U6IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVBcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlSW5kZXhlZERCID0gYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZSh0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZSA9IHRoaXMuX3JlZ2lzdGVyKGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZUluZGV4ZWREQik7XG5cdFx0dGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZSh0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZURhdGFiYXNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZS5vbkRpZENoYW5nZVN0b3JhZ2UoZSA9PiB0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBlKSkpO1xuXG5cdFx0YXdhaXQgdGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0dGhpcy51cGRhdGVJc05ldyh0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVByb2ZpbGVTdG9yYWdlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEZpcnN0IGNsZWFyIGFueSBwcmV2aW91c2x5IGFzc29jaWF0ZWQgZGlzcG9zYWJsZXNcblx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIFJlbWVtYmVyIHByb2ZpbGUgYXNzb2NpYXRlZCB0byBwcm9maWxlIHN0b3JhZ2Vcblx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlUHJvZmlsZSA9IHByb2ZpbGU7XG5cblx0XHRpZiAoaXNQcm9maWxlVXNpbmdEZWZhdWx0U3RvcmFnZSh0aGlzLnByb2ZpbGVTdG9yYWdlUHJvZmlsZSkpIHtcblxuXHRcdFx0Ly8gSWYgd2UgYXJlIHVzaW5nIGRlZmF1bHQgcHJvZmlsZSBzdG9yYWdlLCB0aGUgcHJvZmlsZSBzdG9yYWdlIGlzXG5cdFx0XHQvLyBhY3R1YWxseSB0aGUgc2FtZSBhcyBhcHBsaWNhdGlvbiBzdG9yYWdlLiBBcyBzdWNoIHdlXG5cdFx0XHQvLyBhdm9pZCBjcmVhdGluZyB0aGUgc3RvcmFnZSBsaWJyYXJ5IGEgc2Vjb25kIHRpbWUgb25cblx0XHRcdC8vIHRoZSBzYW1lIERCLlxuXG5cdFx0XHRjb25zdCB7IGluZGV4ZWREYjogYXBwbGljYXRpb25TdG9yYWdlSW5kZXhlZERCLCBzdG9yYWdlOiBhcHBsaWNhdGlvblN0b3JhZ2UgfSA9IGF3YWl0IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlUHJvbWlzZS5wO1xuXG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlRGF0YWJhc2UgPSBhcHBsaWNhdGlvblN0b3JhZ2VJbmRleGVkREI7XG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlID0gYXBwbGljYXRpb25TdG9yYWdlO1xuXG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvZmlsZVN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGUpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVTdG9yYWdlSW5kZXhlZERCID0gYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZVByb2ZpbGVTdG9yYWdlKHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlRGF0YWJhc2UgPSB0aGlzLnByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMuYWRkKHByb2ZpbGVTdG9yYWdlSW5kZXhlZERCKTtcblx0XHRcdHRoaXMucHJvZmlsZVN0b3JhZ2UgPSB0aGlzLnByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTdG9yYWdlKHRoaXMucHJvZmlsZVN0b3JhZ2VEYXRhYmFzZSkpO1xuXG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlRGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvZmlsZVN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGUpKSk7XG5cblx0XHRcdGF3YWl0IHRoaXMucHJvZmlsZVN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUlzTmV3KHRoaXMucHJvZmlsZVN0b3JhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlV29ya3NwYWNlU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VTdG9yYWdlSW5kZXhlZERCID0gYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZVdvcmtzcGFjZVN0b3JhZ2UodGhpcy53b3Jrc3BhY2UuaWQsIHRoaXMubG9nU2VydmljZSk7XG5cblx0XHR0aGlzLndvcmtzcGFjZVN0b3JhZ2VEYXRhYmFzZSA9IHRoaXMuX3JlZ2lzdGVyKHdvcmtzcGFjZVN0b3JhZ2VJbmRleGVkREIpO1xuXHRcdHRoaXMud29ya3NwYWNlU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKHRoaXMud29ya3NwYWNlU3RvcmFnZURhdGFiYXNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZSkpKTtcblxuXHRcdGF3YWl0IHRoaXMud29ya3NwYWNlU3RvcmFnZS5pbml0KCk7XG5cblx0XHR0aGlzLnVwZGF0ZUlzTmV3KHRoaXMud29ya3NwYWNlU3RvcmFnZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUlzTmV3KHN0b3JhZ2U6IElTdG9yYWdlKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlyc3RPcGVuID0gc3RvcmFnZS5nZXRCb29sZWFuKElTX05FV19LRVkpO1xuXHRcdGlmIChmaXJzdE9wZW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3RvcmFnZS5zZXQoSVNfTkVXX0tFWSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIGlmIChmaXJzdE9wZW4pIHtcblx0XHRcdHN0b3JhZ2Uuc2V0KElTX05FV19LRVksIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U3RvcmFnZShzY29wZTogU3RvcmFnZVNjb3BlKTogSVN0b3JhZ2UgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoc2NvcGUpIHtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT046XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZTtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLlBST0ZJTEU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVTdG9yYWdlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU3RvcmFnZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TG9nRGV0YWlscyhzY29wZTogU3RvcmFnZVNjb3BlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZURhdGFiYXNlPy5uYW1lO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT046XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZURhdGFiYXNlPy5uYW1lO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuUFJPRklMRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZVN0b3JhZ2VEYXRhYmFzZT8ubmFtZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVN0b3JhZ2VEYXRhYmFzZT8ubmFtZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc3dpdGNoVG9Qcm9maWxlKHRvUHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5jYW5Td2l0Y2hQcm9maWxlKHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlLCB0b1Byb2ZpbGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkUHJvZmlsZVN0b3JhZ2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnByb2ZpbGVTdG9yYWdlKTtcblx0XHRjb25zdCBvbGRJdGVtcyA9IG9sZFByb2ZpbGVTdG9yYWdlLml0ZW1zO1xuXG5cdFx0Ly8gQ2xvc2Ugb2xkIHByb2ZpbGUgc3RvcmFnZSBidXQgb25seSBpZiB0aGlzIGlzXG5cdFx0Ly8gZGlmZmVyZW50IGZyb20gYXBwbGljYXRpb24gc3RvcmFnZSFcblx0XHRpZiAob2xkUHJvZmlsZVN0b3JhZ2UgIT09IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlKSB7XG5cdFx0XHRhd2FpdCBvbGRQcm9maWxlU3RvcmFnZS5jbG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXcgcHJvZmlsZSBzdG9yYWdlICYgaW5pdFxuXHRcdGF3YWl0IHRoaXMuY3JlYXRlUHJvZmlsZVN0b3JhZ2UodG9Qcm9maWxlKTtcblxuXHRcdC8vIEhhbmRsZSBkYXRhIHN3aXRjaCBhbmQgZXZlbnRpbmdcblx0XHR0aGlzLnN3aXRjaERhdGEob2xkSXRlbXMsIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucHJvZmlsZVN0b3JhZ2UpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc3dpdGNoVG9Xb3Jrc3BhY2UodG9Xb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBwcmVzZXJ2ZURhdGE6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pZ3JhdGluZyBzdG9yYWdlIGlzIGN1cnJlbnRseSB1bnN1cHBvcnRlZCBpbiBXZWInKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRGbHVzaFdoZW5JZGxlKCk6IGJvb2xlYW4ge1xuXHRcdC8vIHRoaXMgZmx1c2goKSB3aWxsIHBvdGVudGlhbGx5IGNhdXNlIG5ldyBzdGF0ZSB0byBiZSBzdG9yZWRcblx0XHQvLyBzaW5jZSBuZXcgc3RhdGUgd2lsbCBvbmx5IGJlIGNyZWF0ZWQgd2hpbGUgdGhlIGRvY3VtZW50XG5cdFx0Ly8gaGFzIGZvY3VzLCBvbmUgb3B0aW1pemF0aW9uIGlzIHRvIG5vdCBydW4gdGhpcyB3aGVuIHRoZVxuXHRcdC8vIGRvY3VtZW50IGhhcyBubyBmb2N1cywgYXNzdW1pbmcgdGhhdCBzdGF0ZSBoYXMgbm90IGNoYW5nZWRcblx0XHQvL1xuXHRcdC8vIGFub3RoZXIgb3B0aW1pemF0aW9uIGlzIHRvIG5vdCBjb2xsZWN0IG1vcmUgc3RhdGUgaWYgd2Vcblx0XHQvLyBoYXZlIGEgcGVuZGluZyB1cGRhdGUgYWxyZWFkeSBydW5uaW5nIHdoaWNoIGluZGljYXRlc1xuXHRcdC8vIHRoYXQgdGhlIGNvbm5lY3Rpb24gaXMgZWl0aGVyIHNsb3cgb3IgZGlzY29ubmVjdGVkIGFuZFxuXHRcdC8vIHRodXMgdW5oZWFsdGh5LlxuXHRcdHJldHVybiBnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5oYXNGb2N1cygpICYmICF0aGlzLmhhc1BlbmRpbmdVcGRhdGU7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblxuXHRcdC8vIFNhZmFyaTogdGhlcmUgaXMgYW4gaXNzdWUgd2hlcmUgdGhlIHBhZ2UgY2FuIGhhbmcgb24gbG9hZCB3aGVuXG5cdFx0Ly8gYSBwcmV2aW91cyBzZXNzaW9uIGhhcyBrZXB0IEluZGV4ZWREQiB0cmFuc2FjdGlvbnMgcnVubmluZy5cblx0XHQvLyBUaGUgb25seSBmaXggc2VlbXMgdG8gYmUgdG8gY2FuY2VsIGFueSBwZW5kaW5nIHRyYW5zYWN0aW9uc1xuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM2Mjk1KVxuXHRcdC8vXG5cdFx0Ly8gT24gYWxsIG90aGVyIGJyb3dzZXJzLCB3ZSBrZWVwIHRoZSBkYXRhYmFzZXMgb3BlbmVkIGJlY2F1c2Vcblx0XHQvLyB3ZSBleHBlY3QgZGF0YSB0byBiZSB3cml0dGVuIHdoZW4gdGhlIHVubG9hZCBoYXBwZW5zLlxuXHRcdGlmIChpc1NhZmFyaSkge1xuXHRcdFx0dGhpcy5hcHBsaWNhdGlvblN0b3JhZ2U/LmNsb3NlKCk7XG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZURhdGFiYXNlPy5jbG9zZSgpO1xuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURhdGFiYXNlPy5jbG9zZSgpO1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VTdG9yYWdlRGF0YWJhc2U/LmNsb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWx3YXlzIGRpc3Bvc2UgdG8gZW5zdXJlIHRoYXQgbm8gdGltZW91dHMgb3IgY2FsbGJhY2tzXG5cdFx0Ly8gZ2V0IHRyaWdnZXJlZCBpbiB0aGlzIHBoYXNlLlxuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBDbGVhciBrZXkvdmFsdWVzXG5cdFx0Zm9yIChjb25zdCBzY29wZSBvZiBbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRV0pIHtcblx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIFtTdG9yYWdlVGFyZ2V0LlVTRVIsIFN0b3JhZ2VUYXJnZXQuTUFDSElORV0pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKHNjb3BlLCB0YXJnZXQpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmUoa2V5LCBzY29wZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8ud2hlbkZsdXNoZWQoKTtcblx0XHR9XG5cblx0XHQvLyBDbGVhciBkYXRhYmFzZXNcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlRGF0YWJhc2U/LmNsZWFyKCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZURhdGFiYXNlPy5jbGVhcigpID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURhdGFiYXNlPy5jbGVhcigpID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0dGhpcy53b3Jrc3BhY2VTdG9yYWdlRGF0YWJhc2U/LmNsZWFyKCkgPz8gUHJvbWlzZS5yZXNvbHZlKClcblx0XHRdKTtcblx0fVxuXG5cdGhhc1Njb3BlKHNjb3BlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRpZiAoaXNVc2VyRGF0YVByb2ZpbGUoc2NvcGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm9maWxlU3RvcmFnZVByb2ZpbGUuaWQgPT09IHNjb3BlLmlkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZS5pZCA9PT0gc2NvcGUuaWQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgZXh0ZW5kcyBJU3RvcmFnZURhdGFiYXNlLCBJRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIE5hbWUgb2YgdGhlIGRhdGFiYXNlLlxuXHQgKi9cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGFuIHVwZGF0ZSBpbiB0aGUgREIgaXMgY3VycmVudGx5IHBlbmRpbmdcblx0ICogKGVpdGhlciB1cGRhdGUgb3IgZGVsZXRlIG9wZXJhdGlvbikuXG5cdCAqL1xuXHRyZWFkb25seSBoYXNQZW5kaW5nVXBkYXRlOiBib29sZWFuO1xuXG5cdGdldFZhbHVlKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRjb21wYXJlQW5kU3dhcChrZXk6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogc3RyaW5nKTogUHJvbWlzZTx7IHJlYWRvbmx5IHN3YXBwZWQ6IGJvb2xlYW47IHJlYWRvbmx5IGN1cnJlbnRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+O1xuXG5cdC8qKlxuXHQgKiBGb3IgdGVzdGluZyBvbmx5LlxuXHQgKi9cblx0Y2xlYXIoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgSW5NZW1vcnlJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgZXh0ZW5kcyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSBpbXBsZW1lbnRzIElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2Uge1xuXG5cdHJlYWRvbmx5IGhhc1BlbmRpbmdVcGRhdGUgPSBmYWxzZTtcblx0cmVhZG9ubHkgbmFtZSA9ICdpbi1tZW1vcnktaW5kZXhlZGItc3RvcmFnZSc7XG5cblx0YXN5bmMgZ2V0VmFsdWUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5nZXRJdGVtcygpKS5nZXQoa2V5KTtcblx0fVxuXG5cdGFzeW5jIGNvbXBhcmVBbmRTd2FwKGtleTogc3RyaW5nLCBleHBlY3RlZFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5ld1ZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHsgcmVhZG9ubHkgc3dhcHBlZDogYm9vbGVhbjsgcmVhZG9ubHkgY3VycmVudFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5nZXRJdGVtcygpO1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGl0ZW1zLmdldChrZXkpO1xuXHRcdGlmIChjdXJyZW50VmFsdWUgIT09IGV4cGVjdGVkVmFsdWUpIHtcblx0XHRcdHJldHVybiB7IHN3YXBwZWQ6IGZhbHNlLCBjdXJyZW50VmFsdWUgfTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKHsgaW5zZXJ0OiBuZXcgTWFwKFtba2V5LCBuZXdWYWx1ZV1dKSB9KTtcblx0XHRyZXR1cm4geyBzd2FwcGVkOiB0cnVlLCBjdXJyZW50VmFsdWU6IG5ld1ZhbHVlIH07XG5cdH1cblxuXHRhc3luYyBjbGVhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQoYXdhaXQgdGhpcy5nZXRJdGVtcygpKS5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBOby1vcFxuXHR9XG59XG5cbmludGVyZmFjZSBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2VPcHRpb25zIHtcblx0aWQ6IHN0cmluZztcblx0YnJvYWRjYXN0Q2hhbmdlcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZSB7XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZUFwcGxpY2F0aW9uU3RvcmFnZShsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8SUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZT4ge1xuXHRcdHJldHVybiBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQ6ICdnbG9iYWwnLCBicm9hZGNhc3RDaGFuZ2VzOiB0cnVlIH0sIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZShsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8SUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZT4ge1xuXHRcdHJldHVybiBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQ6ICdnbG9iYWwtc2hhcmVkJywgYnJvYWRjYXN0Q2hhbmdlczogdHJ1ZSB9LCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHN0YXRpYyBhc3luYyBjcmVhdGVQcm9maWxlU3RvcmFnZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8SUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZT4ge1xuXHRcdHJldHVybiBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQ6IGBnbG9iYWwtJHtwcm9maWxlLmlkfWAsIGJyb2FkY2FzdENoYW5nZXM6IHRydWUgfSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRzdGF0aWMgYXN5bmMgY3JlYXRlV29ya3NwYWNlU3RvcmFnZSh3b3Jrc3BhY2VJZDogc3RyaW5nLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8SUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZT4ge1xuXHRcdHJldHVybiBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQ6IHdvcmtzcGFjZUlkIH0sIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZShvcHRpb25zOiBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2VPcHRpb25zLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFByb21pc2U8SUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhYmFzZSA9IG5ldyBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2Uob3B0aW9ucywgbG9nU2VydmljZSk7XG5cdFx0XHRhd2FpdCBkYXRhYmFzZS53aGVuQ29ubmVjdGVkO1xuXG5cdFx0XHRyZXR1cm4gZGF0YWJhc2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYFtJbmRleGVkREIgU3RvcmFnZSAke29wdGlvbnMuaWR9XSBjcmVhdGUoKTogJHt0b0Vycm9yTWVzc2FnZShlcnJvciwgdHJ1ZSl9YCk7XG5cblx0XHRcdHJldHVybiBuZXcgSW5NZW1vcnlJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVE9SQUdFX0RBVEFCQVNFX1BSRUZJWCA9ICd2c2NvZGUtd2ViLXN0YXRlLWRiLSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNUT1JBR0VfT0JKRUNUX1NUT1JFID0gJ0l0ZW1UYWJsZSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtc0V4dGVybmFsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JhZ2VJdGVtc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtc0V4dGVybmFsID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtc0V4dGVybmFsLmV2ZW50O1xuXG5cdHByaXZhdGUgYnJvYWRjYXN0Q2hhbm5lbDogQnJvYWRjYXN0RGF0YUNoYW5uZWw8SVN0b3JhZ2VJdGVtc0NoYW5nZUV2ZW50PiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHBlbmRpbmdVcGRhdGU6IFByb21pc2U8Ym9vbGVhbj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBoYXNQZW5kaW5nVXBkYXRlKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLnBlbmRpbmdVcGRhdGU7IH1cblxuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlbkNvbm5lY3RlZDogUHJvbWlzZTxJbmRleGVkREI+O1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm5hbWUgPSBgJHtJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9EQVRBQkFTRV9QUkVGSVh9JHtvcHRpb25zLmlkfWA7XG5cdFx0dGhpcy5icm9hZGNhc3RDaGFubmVsID0gb3B0aW9ucy5icm9hZGNhc3RDaGFuZ2VzID8gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb2FkY2FzdERhdGFDaGFubmVsPElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudD4odGhpcy5uYW1lKSkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLndoZW5Db25uZWN0ZWQgPSB0aGlzLmNvbm5lY3QoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBDaGVjayBmb3Igc3RvcmFnZSBjaGFuZ2UgZXZlbnRzIGZyb20gb3RoZXJcblx0XHQvLyB3aW5kb3dzL3RhYnMgdmlhIGBCcm9hZGNhc3RDaGFubmVsYCBtZWNoYW5pc21zLlxuXHRcdGlmICh0aGlzLmJyb2FkY2FzdENoYW5uZWwpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvYWRjYXN0Q2hhbm5lbC5vbkRpZFJlY2VpdmVEYXRhKGRhdGEgPT4ge1xuXHRcdFx0XHRpZiAoaXNTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudChkYXRhKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNFeHRlcm5hbC5maXJlKGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8SW5kZXhlZERCPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBJbmRleGVkREIuY3JlYXRlKHRoaXMubmFtZSwgdW5kZWZpbmVkLCBbSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLlNUT1JBR0VfT0JKRUNUX1NUT1JFXSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0luZGV4ZWREQiBTdG9yYWdlICR7dGhpcy5uYW1lfV0gY29ubmVjdCgpIGVycm9yOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0SXRlbXMoKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+PiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRmdW5jdGlvbiBpc1ZhbGlkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcblx0XHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYi5nZXRLZXlWYWx1ZXM8c3RyaW5nPihJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9PQkpFQ1RfU1RPUkUsIGlzVmFsaWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VmFsdWUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZGIucnVuSW5UcmFuc2FjdGlvbihJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9PQkpFQ1RfU1RPUkUsICdyZWFkb25seScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLmdldChrZXkpKTtcblx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlSXRlbXMocmVxdWVzdDogSVVwZGF0ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJ1biB0aGUgdXBkYXRlXG5cdFx0bGV0IGRpZFVwZGF0ZSA9IGZhbHNlO1xuXHRcdHRoaXMucGVuZGluZ1VwZGF0ZSA9IHRoaXMuZG9VcGRhdGVJdGVtcyhyZXF1ZXN0KTtcblx0XHR0cnkge1xuXHRcdFx0ZGlkVXBkYXRlID0gYXdhaXQgdGhpcy5wZW5kaW5nVXBkYXRlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQnJvYWRjYXN0IGNoYW5nZXMgdG8gb3RoZXIgd2luZG93cy90YWJzIGlmIGVuYWJsZWRcblx0XHQvLyBhbmQgb25seSBpZiB3ZSBhY3R1YWxseSBkaWQgdXBkYXRlIHN0b3JhZ2UgaXRlbXMuXG5cdFx0aWYgKHRoaXMuYnJvYWRjYXN0Q2hhbm5lbCAmJiBkaWRVcGRhdGUpIHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJU3RvcmFnZUl0ZW1zQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGNoYW5nZWQ6IHJlcXVlc3QuaW5zZXJ0LFxuXHRcdFx0XHRkZWxldGVkOiByZXF1ZXN0LmRlbGV0ZVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5icm9hZGNhc3RDaGFubmVsLnBvc3REYXRhKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb21wYXJlQW5kU3dhcChrZXk6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogc3RyaW5nKTogUHJvbWlzZTx7IHJlYWRvbmx5IHN3YXBwZWQ6IGJvb2xlYW47IHJlYWRvbmx5IGN1cnJlbnRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5jb21wYXJlQW5kU3dhcChcblx0XHRcdEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5TVE9SQUdFX09CSkVDVF9TVE9SRSxcblx0XHRcdGtleSxcblx0XHRcdGV4cGVjdGVkVmFsdWUsXG5cdFx0XHRuZXdWYWx1ZSxcblx0XHRcdCh2YWx1ZSk6IHZhbHVlIGlzIHN0cmluZyA9PiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnLFxuXHRcdCk7XG5cdFx0aWYgKHJlc3VsdC5zd2FwcGVkKSB7XG5cdFx0XHRjb25zdCBldmVudCA9IHsgY2hhbmdlZDogbmV3IE1hcChbW2tleSwgbmV3VmFsdWVdXSkgfTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNFeHRlcm5hbC5maXJlKGV2ZW50KTtcblx0XHRcdHRoaXMuYnJvYWRjYXN0Q2hhbm5lbD8ucG9zdERhdGEoZXZlbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwZGF0ZUl0ZW1zKHJlcXVlc3Q6IElVcGRhdGVSZXF1ZXN0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHJlcXVlc3QgaXMgZW1wdHlcblx0XHRjb25zdCB0b0luc2VydCA9IHJlcXVlc3QuaW5zZXJ0O1xuXHRcdGNvbnN0IHRvRGVsZXRlID0gcmVxdWVzdC5kZWxldGU7XG5cdFx0aWYgKCghdG9JbnNlcnQgJiYgIXRvRGVsZXRlKSB8fCAodG9JbnNlcnQ/LnNpemUgPT09IDAgJiYgdG9EZWxldGU/LnNpemUgPT09IDApKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHQvLyBVcGRhdGUgYEl0ZW1UYWJsZWAgd2l0aCBpbnNlcnRzIGFuZC9vciBkZWxldGVzXG5cdFx0YXdhaXQgZGIucnVuSW5UcmFuc2FjdGlvbihJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9PQkpFQ1RfU1RPUkUsICdyZWFkd3JpdGUnLCBvYmplY3RTdG9yZSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0czogSURCUmVxdWVzdFtdID0gW107XG5cblx0XHRcdC8vIEluc2VydHNcblx0XHRcdGlmICh0b0luc2VydCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0b0luc2VydCkge1xuXHRcdFx0XHRcdHJlcXVlc3RzLnB1c2gob2JqZWN0U3RvcmUucHV0KHZhbHVlLCBrZXkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZWxldGVzXG5cdFx0XHRpZiAodG9EZWxldGUpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgdG9EZWxldGUpIHtcblx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKG9iamVjdFN0b3JlLmRlbGV0ZShrZXkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVxdWVzdHM7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIG9wdGltaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vdCBzdXBvcnRlZCBpbiBJbmRleGVkREJcblx0fVxuXG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0Ly8gV2FpdCBmb3IgcGVuZGluZyB1cGRhdGVzIHRvIGhhdmluZyBmaW5pc2hlZFxuXHRcdGF3YWl0IHRoaXMucGVuZGluZ1VwZGF0ZTtcblxuXHRcdC8vIEZpbmFsbHksIGNsb3NlIEluZGV4ZWREQlxuXHRcdHJldHVybiBkYi5jbG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRhd2FpdCBkYi5ydW5JblRyYW5zYWN0aW9uKEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5TVE9SQUdFX09CSkVDVF9TVE9SRSwgJ3JlYWR3cml0ZScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLmNsZWFyKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QiwyQkFBaUcsZUFBZTtBQUNsSixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3Qiw4QkFBOEIsWUFBWSxjQUFjLHFCQUFxQjtBQUM5RyxTQUFTLHlCQUEyQztBQUk3QyxJQUFNLHdCQUFOLGNBQW9DLHVCQUF1QjtBQUFBLEVBb0NqRSxZQUNrQixXQUNBLHdCQUNhLFlBQzdCO0FBQ0QsVUFBTSxFQUFFLGVBQWUsc0JBQXNCLCtCQUErQixDQUFDO0FBSjVEO0FBQ0E7QUFDYTtBQWpDL0IsU0FBaUIsNEJBQTRCLElBQUksZ0JBQTZFO0FBUTlILFNBQWlCLDRCQUE0QixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQTZCaEYsU0FBSyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFFekQsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBM0JBLElBQUksbUJBQTRCO0FBQy9CLFdBQU87QUFBQSxNQUNOLEtBQUssNEJBQTRCLG9CQUNqQyxLQUFLLGtDQUFrQyxvQkFDdkMsS0FBSyx3QkFBd0Isb0JBQzdCLEtBQUssMEJBQTBCO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFN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
